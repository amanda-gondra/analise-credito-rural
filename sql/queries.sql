-- =============================================================================
-- Rural Credit Analysis — analytical queries (one per question of docs/plano-analise.md)
--
-- The API and the AI assistant run these queries as they are; nothing is recalculated
-- in Python. Each query starts with a "-- name:" line, which is how the code finds it,
-- followed by its question and parameters.
--
-- Conventions
--   * Parameters use SQLAlchemy syntax (:name). Optional filters receive NULL for "all"
--     and are cast to their type, because PostgreSQL cannot infer the type of a bare NULL.
--   * Source: the view credit_monthly_adjusted (sql/schema.sql), which adds the region and
--     credit_amount_real (December 2025 prices, decision D12).
--   * Shares inside one year use nominal values; any total that adds several years uses
--     real values, so inflation does not weigh the older years down.
--   * Amounts are rounded to cents only in the final SELECT; percentages to 2 decimals.
--   * Division by zero is avoided with NULLIF: an undefined ratio returns NULL, never 0.
-- =============================================================================


-- name: yearly_totals
-- Question 1: how did rural credit evolve year by year?
-- Parameters: :first_year, :last_year (required);
--             :state_abbr, :activity_code, :purpose (optional, NULL = all).
-- One row per year: nominal and real amounts, contracts, change over the previous year.
WITH yearly AS (
    SELECT
        reference_year,
        SUM(credit_amount)      AS amount_nominal,
        SUM(credit_amount_real) AS amount_real,
        SUM(contract_count)     AS contracts
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND (CAST(:state_abbr AS CHAR(2)) IS NULL OR state_abbr = CAST(:state_abbr AS CHAR(2)))
      AND (CAST(:activity_code AS CHAR(1)) IS NULL OR activity_code = CAST(:activity_code AS CHAR(1)))
      AND (CAST(:purpose AS TEXT) IS NULL OR purpose = CAST(:purpose AS TEXT))
    GROUP BY reference_year
)
SELECT
    reference_year,
    ROUND(amount_nominal, 2) AS amount_nominal,
    ROUND(amount_real, 2)    AS amount_real,
    contracts,
    ROUND(100 * (amount_nominal / NULLIF(LAG(amount_nominal) OVER w, 0) - 1), 2) AS change_nominal_pct,
    ROUND(100 * (amount_real    / NULLIF(LAG(amount_real)    OVER w, 0) - 1), 2) AS change_real_pct
FROM yearly
WINDOW w AS (ORDER BY reference_year)
ORDER BY reference_year;


-- name: state_ranking
-- Question 2: which states receive the most?
-- Parameters: :first_year, :last_year (required); :activity_code, :purpose (optional).
-- One row per UF. Position and share follow the conventions: nominal values when the
-- period is a single year, real values when it adds several years.
WITH by_state AS (
    SELECT
        state_abbr,
        region_name,
        SUM(credit_amount)      AS amount_nominal,
        SUM(credit_amount_real) AS amount_real,
        SUM(contract_count)     AS contracts
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND (CAST(:activity_code AS CHAR(1)) IS NULL OR activity_code = CAST(:activity_code AS CHAR(1)))
      AND (CAST(:purpose AS TEXT) IS NULL OR purpose = CAST(:purpose AS TEXT))
    GROUP BY state_abbr, region_name
),
based AS (
    SELECT
        by_state.*,
        CASE WHEN CAST(:first_year AS SMALLINT) = CAST(:last_year AS SMALLINT)
             THEN amount_nominal ELSE amount_real END AS amount_base
    FROM by_state
)
SELECT
    RANK() OVER (ORDER BY amount_base DESC) AS position,
    state_abbr,
    region_name,
    ROUND(amount_nominal, 2) AS amount_nominal,
    ROUND(amount_real, 2)    AS amount_real,
    contracts,
    ROUND(100 * amount_base / NULLIF(SUM(amount_base) OVER (), 0), 2) AS share_pct
FROM based
ORDER BY position, state_abbr;


-- name: matopiba_yearly
-- Question 3: how does credit behave in MATOPIBA (MA, TO, PI and BA, whole states; decision D7)?
-- Parameters: :first_year, :last_year (required).
-- Per year: one row per state and one row for the bloc (state_abbr NULL), with the share
-- of the national total of the same year.
WITH national AS (
    SELECT reference_year, SUM(credit_amount) AS amount_nominal
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
    GROUP BY reference_year
),
matopiba AS (
    SELECT
        reference_year,
        state_abbr,
        SUM(credit_amount)      AS amount_nominal,
        SUM(credit_amount_real) AS amount_real,
        SUM(contract_count)     AS contracts
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND state_abbr IN ('MA', 'TO', 'PI', 'BA')
    GROUP BY GROUPING SETS ((reference_year, state_abbr), (reference_year))
)
SELECT
    m.reference_year,
    m.state_abbr,
    ROUND(m.amount_nominal, 2) AS amount_nominal,
    ROUND(m.amount_real, 2)    AS amount_real,
    m.contracts,
    ROUND(100 * m.amount_nominal / NULLIF(n.amount_nominal, 0), 2) AS share_of_brazil_pct
FROM matopiba m
JOIN national n USING (reference_year)
ORDER BY m.reference_year, m.state_abbr NULLS LAST;


-- name: activity_split
-- Question 4: how is credit split between agriculture (1) and livestock (2)?
-- Parameters: :first_year, :last_year (required); :state_abbr (optional).
-- One row per year and activity, with the share of that year's total.
WITH by_activity AS (
    SELECT
        reference_year,
        activity_code,
        SUM(credit_amount)      AS amount_nominal,
        SUM(credit_amount_real) AS amount_real,
        SUM(contract_count)     AS contracts
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND (CAST(:state_abbr AS CHAR(2)) IS NULL OR state_abbr = CAST(:state_abbr AS CHAR(2)))
    GROUP BY reference_year, activity_code
)
SELECT
    b.reference_year,
    b.activity_code,
    a.source_label AS activity_label,
    ROUND(b.amount_nominal, 2) AS amount_nominal,
    ROUND(b.amount_real, 2)    AS amount_real,
    b.contracts,
    ROUND(100 * b.amount_nominal / NULLIF(SUM(b.amount_nominal) OVER (PARTITION BY b.reference_year), 0), 2) AS share_pct
FROM by_activity b
JOIN ref_activity a USING (activity_code)
ORDER BY b.reference_year, b.activity_code;


-- name: purpose_split
-- Question 5: how much goes to custeio, investimento, comercializacao and industrializacao?
-- Parameters: :first_year, :last_year (required); :state_abbr, :activity_code (optional).
-- One row per year and purpose (all four purposes appear, with zero when there was no credit),
-- with the share of that year's total.
WITH years AS (
    SELECT DISTINCT reference_year
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
),
by_purpose AS (
    SELECT
        reference_year,
        purpose,
        SUM(credit_amount)      AS amount_nominal,
        SUM(credit_amount_real) AS amount_real,
        SUM(contract_count)     AS contracts
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND (CAST(:state_abbr AS CHAR(2)) IS NULL OR state_abbr = CAST(:state_abbr AS CHAR(2)))
      AND (CAST(:activity_code AS CHAR(1)) IS NULL OR activity_code = CAST(:activity_code AS CHAR(1)))
    GROUP BY reference_year, purpose
),
complete AS (
    SELECT
        y.reference_year,
        p.purpose,
        p.display_order,
        COALESCE(b.amount_nominal, 0) AS amount_nominal,
        COALESCE(b.amount_real, 0)    AS amount_real,
        COALESCE(b.contracts, 0)      AS contracts
    FROM years y
    CROSS JOIN ref_purpose p
    LEFT JOIN by_purpose b ON b.reference_year = y.reference_year AND b.purpose = p.purpose
)
SELECT
    reference_year,
    purpose,
    ROUND(amount_nominal, 2) AS amount_nominal,
    ROUND(amount_real, 2)    AS amount_real,
    contracts,
    ROUND(100 * amount_nominal / NULLIF(SUM(amount_nominal) OVER (PARTITION BY reference_year), 0), 2) AS share_pct
FROM complete
ORDER BY reference_year, display_order;


-- name: states_yearly
-- Question 6a: how do selected states compare?
-- Parameters: :first_year, :last_year, :state_abbrs (required; list of UFs, e.g. ['PI', 'CE']).
-- One row per year and state, with the share of the national total of the same year.
WITH national AS (
    SELECT reference_year, SUM(credit_amount) AS amount_nominal
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
    GROUP BY reference_year
),
by_state AS (
    SELECT
        reference_year,
        state_abbr,
        SUM(credit_amount)      AS amount_nominal,
        SUM(credit_amount_real) AS amount_real,
        SUM(contract_count)     AS contracts
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND state_abbr = ANY (CAST(:state_abbrs AS CHAR(2)[]))
    GROUP BY reference_year, state_abbr
)
SELECT
    b.reference_year,
    b.state_abbr,
    ROUND(b.amount_nominal, 2) AS amount_nominal,
    ROUND(b.amount_real, 2)    AS amount_real,
    b.contracts,
    ROUND(100 * b.amount_nominal / NULLIF(n.amount_nominal, 0), 2) AS share_of_brazil_pct
FROM by_state b
JOIN national n USING (reference_year)
ORDER BY b.reference_year, b.state_abbr;


-- name: regions_yearly
-- Question 6b: how do the five regions compare?
-- Parameters: :first_year, :last_year (required); :activity_code, :purpose (optional).
-- One row per year and region, with the share of that year's total.
WITH by_region AS (
    SELECT
        reference_year,
        region_name,
        SUM(credit_amount)      AS amount_nominal,
        SUM(credit_amount_real) AS amount_real,
        SUM(contract_count)     AS contracts
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND (CAST(:activity_code AS CHAR(1)) IS NULL OR activity_code = CAST(:activity_code AS CHAR(1)))
      AND (CAST(:purpose AS TEXT) IS NULL OR purpose = CAST(:purpose AS TEXT))
    GROUP BY reference_year, region_name
)
SELECT
    reference_year,
    region_name,
    ROUND(amount_nominal, 2) AS amount_nominal,
    ROUND(amount_real, 2)    AS amount_real,
    contracts,
    ROUND(100 * amount_nominal / NULLIF(SUM(amount_nominal) OVER (PARTITION BY reference_year), 0), 2) AS share_pct
FROM by_region
ORDER BY reference_year, region_name;


-- Question 7 (profile of a state) has no query of its own: it combines yearly_totals,
-- state_ranking, activity_split and purpose_split for one UF, so every number of the
-- profile is the same number shown in the other pages.


-- name: program_ranking
-- Question 8: which programs concentrate the credit?
-- Parameters: :first_year, :last_year (required); :state_abbr (optional).
-- One row per program; position and share as in state_ranking (nominal for a single
-- year, real for several). Names as published by the source; grouping the smaller ones
-- into "Outros" is a presentation choice of the site.
WITH by_program AS (
    SELECT
        program_name,
        SUM(credit_amount)      AS amount_nominal,
        SUM(credit_amount_real) AS amount_real,
        SUM(contract_count)     AS contracts
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND (CAST(:state_abbr AS CHAR(2)) IS NULL OR state_abbr = CAST(:state_abbr AS CHAR(2)))
    GROUP BY program_name
),
based AS (
    SELECT
        by_program.*,
        CASE WHEN CAST(:first_year AS SMALLINT) = CAST(:last_year AS SMALLINT)
             THEN amount_nominal ELSE amount_real END AS amount_base
    FROM by_program
)
SELECT
    RANK() OVER (ORDER BY amount_base DESC) AS position,
    program_name,
    ROUND(amount_nominal, 2) AS amount_nominal,
    ROUND(amount_real, 2)    AS amount_real,
    contracts,
    ROUND(100 * amount_base / NULLIF(SUM(amount_base) OVER (), 0), 2) AS share_pct
FROM based
ORDER BY position, program_name;


-- name: funding_source_ranking
-- Question 9: where do the resources come from?
-- Parameters: :first_year, :last_year (required); :state_abbr (optional).
-- One row per funding source; position and share as in state_ranking (nominal for a
-- single year, real for several).
WITH by_source AS (
    SELECT
        funding_source_name,
        SUM(credit_amount)      AS amount_nominal,
        SUM(credit_amount_real) AS amount_real,
        SUM(contract_count)     AS contracts
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND (CAST(:state_abbr AS CHAR(2)) IS NULL OR state_abbr = CAST(:state_abbr AS CHAR(2)))
    GROUP BY funding_source_name
),
based AS (
    SELECT
        by_source.*,
        CASE WHEN CAST(:first_year AS SMALLINT) = CAST(:last_year AS SMALLINT)
             THEN amount_nominal ELSE amount_real END AS amount_base
    FROM by_source
)
SELECT
    RANK() OVER (ORDER BY amount_base DESC) AS position,
    funding_source_name,
    ROUND(amount_nominal, 2) AS amount_nominal,
    ROUND(amount_real, 2)    AS amount_real,
    contracts,
    ROUND(100 * amount_base / NULLIF(SUM(amount_base) OVER (), 0), 2) AS share_pct
FROM based
ORDER BY position, funding_source_name;


-- name: seasonality
-- Question 10: in which months of the year is the credit contracted?
-- Parameters: :first_year, :last_year (required); :state_abbr, :purpose (optional).
-- One row per calendar month: the share of that month in its year's total, averaged over
-- the years (each year weighs the same, whatever its volume), plus the lowest and highest
-- share seen. Months without credit count as 0%.
WITH by_month AS (
    SELECT reference_year, reference_month, SUM(credit_amount) AS amount_nominal
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND (CAST(:state_abbr AS CHAR(2)) IS NULL OR state_abbr = CAST(:state_abbr AS CHAR(2)))
      AND (CAST(:purpose AS TEXT) IS NULL OR purpose = CAST(:purpose AS TEXT))
    GROUP BY reference_year, reference_month
),
grid AS (
    SELECT y.reference_year, m.reference_month
    FROM (SELECT DISTINCT reference_year FROM by_month) y
    CROSS JOIN generate_series(1, 12) AS m(reference_month)
),
shares AS (
    SELECT
        g.reference_year,
        g.reference_month,
        COALESCE(b.amount_nominal, 0)
            / NULLIF(SUM(COALESCE(b.amount_nominal, 0)) OVER (PARTITION BY g.reference_year), 0) AS share
    FROM grid g
    LEFT JOIN by_month b USING (reference_year, reference_month)
)
SELECT
    reference_month,
    ROUND(100 * AVG(share), 2) AS avg_share_pct,
    ROUND(100 * MIN(share), 2) AS min_share_pct,
    ROUND(100 * MAX(share), 2) AS max_share_pct,
    COUNT(*)                   AS years
FROM shares
GROUP BY reference_month
ORDER BY reference_month;


-- name: average_contract_value
-- Question 11: what is the average value per contract?
-- Parameters: :first_year, :last_year (required);
--             :state_abbr, :region_name, :activity_code, :purpose, :program_name (optional).
-- One row per year plus one row for the whole period (reference_year NULL).
-- Average = SUM(amount) / SUM(contracts), never an average of averages. The period row
-- uses real values, so years with different price levels can be added.
WITH filtered AS (
    SELECT reference_year, credit_amount, credit_amount_real, contract_count
    FROM credit_monthly_adjusted
    WHERE reference_year BETWEEN :first_year AND :last_year
      AND (CAST(:state_abbr AS CHAR(2)) IS NULL OR state_abbr = CAST(:state_abbr AS CHAR(2)))
      AND (CAST(:region_name AS TEXT) IS NULL OR region_name = CAST(:region_name AS TEXT))
      AND (CAST(:activity_code AS CHAR(1)) IS NULL OR activity_code = CAST(:activity_code AS CHAR(1)))
      AND (CAST(:purpose AS TEXT) IS NULL OR purpose = CAST(:purpose AS TEXT))
      AND (CAST(:program_name AS TEXT) IS NULL OR program_name = CAST(:program_name AS TEXT))
),
totals AS (
    SELECT
        reference_year,
        SUM(credit_amount)      AS amount_nominal,
        SUM(credit_amount_real) AS amount_real,
        SUM(contract_count)     AS contracts
    FROM filtered
    GROUP BY GROUPING SETS ((reference_year), ())
)
SELECT
    reference_year,
    ROUND(amount_nominal, 2) AS amount_nominal,
    ROUND(amount_real, 2)    AS amount_real,
    contracts,
    ROUND(amount_nominal / NULLIF(contracts, 0), 2) AS average_nominal,
    ROUND(amount_real / NULLIF(contracts, 0), 2)    AS average_real
FROM totals
ORDER BY reference_year NULLS LAST;


-- =============================================================================
-- Data explorer (GET /api/v1/credit and /api/v1/credit.csv): the rows themselves.
-- Same filters as question 11. Rows come in the order of the primary key of
-- credit_monthly, so a page continues after the key of the last row of the previous
-- one (keyset pagination): every page costs the same, and a row is never skipped or
-- repeated because of an offset.
-- =============================================================================


-- name: credit_rows
-- Parameters: :first_year, :last_year, :row_limit (required);
--             :state_abbr, :region_name, :activity_code, :purpose, :program_name (optional);
--             :after_year, :after_month, :after_state, :after_activity, :after_program,
--             :after_subprogram, :after_funding_source, :after_purpose: the key of the last
--             row already shown, all NULL for the first page.
-- One row per month x UF x activity x program x subprogram x funding source x purpose.
SELECT
    reference_year,
    reference_month,
    state_abbr,
    region_name,
    activity_code,
    purpose,
    program_name,
    subprogram_name,
    funding_source_name,
    contract_count,
    credit_amount                AS amount_nominal,
    ROUND(credit_amount_real, 2) AS amount_real
FROM credit_monthly_adjusted
WHERE reference_year BETWEEN :first_year AND :last_year
  AND (CAST(:state_abbr AS CHAR(2)) IS NULL OR state_abbr = CAST(:state_abbr AS CHAR(2)))
  AND (CAST(:region_name AS TEXT) IS NULL OR region_name = CAST(:region_name AS TEXT))
  AND (CAST(:activity_code AS CHAR(1)) IS NULL OR activity_code = CAST(:activity_code AS CHAR(1)))
  AND (CAST(:purpose AS TEXT) IS NULL OR purpose = CAST(:purpose AS TEXT))
  AND (CAST(:program_name AS TEXT) IS NULL OR program_name = CAST(:program_name AS TEXT))
  AND (
      CAST(:after_year AS SMALLINT) IS NULL
      OR (reference_year, reference_month, state_abbr, activity_code,
          program_name, subprogram_name, funding_source_name, purpose)
       > (CAST(:after_year AS SMALLINT), CAST(:after_month AS SMALLINT),
          CAST(:after_state AS CHAR(2)), CAST(:after_activity AS CHAR(1)),
          CAST(:after_program AS TEXT), CAST(:after_subprogram AS TEXT),
          CAST(:after_funding_source AS TEXT), CAST(:after_purpose AS TEXT))
  )
ORDER BY reference_year, reference_month, state_abbr, activity_code,
         program_name, subprogram_name, funding_source_name, purpose
LIMIT :row_limit;


-- name: credit_summary
-- Parameters: the filters of credit_rows, without the key and the limit.
-- How many rows the filters select, with their contracts and their total at December 2025
-- prices (real values, because the rows may span several years).
-- An empty selection has 0 rows, 0 contracts and R$ 0, not NULL.
SELECT
    COUNT(*)                                       AS row_count,
    COALESCE(SUM(contract_count), 0)               AS contracts,
    COALESCE(ROUND(SUM(credit_amount_real), 2), 0) AS amount_real
FROM credit_monthly_adjusted
WHERE reference_year BETWEEN :first_year AND :last_year
  AND (CAST(:state_abbr AS CHAR(2)) IS NULL OR state_abbr = CAST(:state_abbr AS CHAR(2)))
  AND (CAST(:region_name AS TEXT) IS NULL OR region_name = CAST(:region_name AS TEXT))
  AND (CAST(:activity_code AS CHAR(1)) IS NULL OR activity_code = CAST(:activity_code AS CHAR(1)))
  AND (CAST(:purpose AS TEXT) IS NULL OR purpose = CAST(:purpose AS TEXT))
  AND (CAST(:program_name AS TEXT) IS NULL OR program_name = CAST(:program_name AS TEXT));


-- =============================================================================
-- Metadata for the API (GET /api/v1/metadata): what is loaded and when it was collected.
-- =============================================================================


-- name: loaded_years
-- One row per annual file loaded, with the collection date (the source revises its data).
SELECT reference_year, collected_at, file_generated_at
FROM source_file
WHERE dataset = 'MATRIZ_CR_REGIAO'
ORDER BY reference_year;


-- name: program_names
-- Programs as published by the source: the accepted values of the program filter.
SELECT DISTINCT program_name
FROM credit_monthly
ORDER BY program_name;


-- name: latest_ipca
-- Last month of the IPCA series and when it was collected.
SELECT reference_year, reference_month, collected_at
FROM ipca_monthly
ORDER BY reference_year DESC, reference_month DESC
LIMIT 1;
