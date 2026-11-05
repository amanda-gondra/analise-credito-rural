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
-- One row per UF, ordered by the real amount of the period (comparable across years).
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
)
SELECT
    RANK() OVER (ORDER BY amount_real DESC) AS position,
    state_abbr,
    region_name,
    ROUND(amount_nominal, 2) AS amount_nominal,
    ROUND(amount_real, 2)    AS amount_real,
    contracts,
    ROUND(100 * amount_real / NULLIF(SUM(amount_real) OVER (), 0), 2) AS share_pct
FROM by_state
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
