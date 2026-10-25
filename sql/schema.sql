-- =============================================================================
-- Rural Credit Analysis — PostgreSQL schema
--
-- Source : Banco Central do Brasil, Matriz de Dados do Crédito Rural (MDCR),
--          annual files MATRIZ_CR_REGIAO_<year>.gz ("Quantidade e Valor dos
--          Contratos por Região, UF, Município, Programa, Fonte de Recursos e IF").
-- Target : PostgreSQL 16 (tested on 16.15).
-- Evidence behind every table, key and constraint: docs/modelagem-banco.md
--
-- Tables
--   ref_state       27 federative units (reference)
--   ref_activity    agricultural / livestock (reference)
--   ref_purpose     custeio, investimento, comercializacao, industrializacao (reference)
--   source_file     one row per raw file loaded, with control totals (traceability)
--   credit_monthly  analytical fact table, one row per month x UF x activity x
--                   program x subprogram x funding source x purpose
--
-- The raw .gz files are the preserved original data (kept outside the database
-- and outside Git, identified by SHA-256). There is no row-level staging table.
--
-- This script only creates objects and inserts reference rows. It never drops,
-- truncates or deletes anything, and it can be run more than once.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS rural_credit;

SET search_path TO rural_credit;

-- -----------------------------------------------------------------------------
-- Reference: federative units
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_state (
    state_abbr        CHAR(2)   PRIMARY KEY,
    state_name        TEXT      NOT NULL UNIQUE,
    ibge_state_code   SMALLINT  NOT NULL UNIQUE,
    region_name       TEXT      NOT NULL
        CHECK (region_name IN ('NORTE', 'NORDESTE', 'SUDESTE', 'SUL', 'CENTRO-OESTE'))
);

COMMENT ON TABLE  ref_state IS
    'The 27 federative units. state_name and region_name are spelled exactly as in the source files '
    '(columns UF and REGIAO), so the loader maps names to abbreviations by exact match.';
COMMENT ON COLUMN ref_state.ibge_state_code IS
    'IBGE state code. Equals the first two digits of COD_MUNICIPIO_IBGE in the source (verified 2013–2025).';

INSERT INTO ref_state (state_abbr, state_name, ibge_state_code, region_name) VALUES
    ('RO', 'RONDÔNIA',            11, 'NORTE'),
    ('AC', 'ACRE',                12, 'NORTE'),
    ('AM', 'AMAZONAS',            13, 'NORTE'),
    ('RR', 'RORAIMA',             14, 'NORTE'),
    ('PA', 'PARÁ',                15, 'NORTE'),
    ('AP', 'AMAPÁ',               16, 'NORTE'),
    ('TO', 'TOCANTINS',           17, 'NORTE'),
    ('MA', 'MARANHÃO',            21, 'NORDESTE'),
    ('PI', 'PIAUÍ',               22, 'NORDESTE'),
    ('CE', 'CEARÁ',               23, 'NORDESTE'),
    ('RN', 'RIO GRANDE DO NORTE', 24, 'NORDESTE'),
    ('PB', 'PARAÍBA',             25, 'NORDESTE'),
    ('PE', 'PERNAMBUCO',          26, 'NORDESTE'),
    ('AL', 'ALAGOAS',             27, 'NORDESTE'),
    ('SE', 'SERGIPE',             28, 'NORDESTE'),
    ('BA', 'BAHIA',               29, 'NORDESTE'),
    ('MG', 'MINAS GERAIS',        31, 'SUDESTE'),
    ('ES', 'ESPÍRITO SANTO',      32, 'SUDESTE'),
    ('RJ', 'RIO DE JANEIRO',      33, 'SUDESTE'),
    ('SP', 'SÃO PAULO',           35, 'SUDESTE'),
    ('PR', 'PARANÁ',              41, 'SUL'),
    ('SC', 'SANTA CATARINA',      42, 'SUL'),
    ('RS', 'RIO GRANDE DO SUL',   43, 'SUL'),
    ('MS', 'MATO GROSSO DO SUL',  50, 'CENTRO-OESTE'),
    ('MT', 'MATO GROSSO',         51, 'CENTRO-OESTE'),
    ('GO', 'GOIÁS',               52, 'CENTRO-OESTE'),
    ('DF', 'DISTRITO FEDERAL',    53, 'CENTRO-OESTE')
ON CONFLICT (state_abbr) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Reference: activity
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_activity (
    activity_code  CHAR(1)  PRIMARY KEY,
    source_label   TEXT     NOT NULL UNIQUE
);

COMMENT ON TABLE ref_activity IS
    'Activity of the financed enterprise. source_label is the text in the annual files (column ATIVIDADE); '
    'activity_code is the code used by the OData entity RegiaoUF (field Atividade). '
    'The mapping was verified: January 2024 matches to the cent in all 212 UF x activity x purpose cells.';

INSERT INTO ref_activity (activity_code, source_label) VALUES
    ('1', 'AGRÍCOLA'),
    ('2', 'PECUÁRIA')
ON CONFLICT (activity_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Reference: purpose (finalidade)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ref_purpose (
    purpose        TEXT      PRIMARY KEY,
    source_prefix  TEXT      NOT NULL UNIQUE,
    display_order  SMALLINT  NOT NULL UNIQUE
);

COMMENT ON TABLE ref_purpose IS
    'Credit purposes. In the source each one is a pair of columns <source_prefix>_QTDE / <source_prefix>_VALOR. '
    'industrializacao has no records before July 2016 (classification break, see docs/dicionario-dados.md).';

INSERT INTO ref_purpose (purpose, source_prefix, display_order) VALUES
    ('custeio',          'CUSTEIO',          1),
    ('investimento',     'INVESTIMENTO',     2),
    ('comercializacao',  'COMERCIALIZACAO',  3),
    ('industrializacao', 'INDUSTRIALIZACAO', 4)
ON CONFLICT (purpose) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Traceability: one row per raw file
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS source_file (
    source_file_id       BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset              TEXT            NOT NULL,
    reference_year       SMALLINT        NOT NULL CHECK (reference_year BETWEEN 2013 AND 2100),
    file_name            TEXT            NOT NULL,
    source_url           TEXT            NOT NULL,
    collected_at         TIMESTAMPTZ     NOT NULL,
    file_sha256          CHAR(64)        NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    file_generated_at    TIMESTAMPTZ,
    source_row_count     INTEGER         NOT NULL CHECK (source_row_count >= 0),
    source_total_qty     INTEGER         NOT NULL CHECK (source_total_qty >= 0),
    source_total_amount  NUMERIC(15, 2)  NOT NULL CHECK (source_total_amount >= 0),
    loaded_at            TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (dataset, reference_year)
);

COMMENT ON TABLE source_file IS
    'One row per annual file loaded. A year is loaded at most once; a reload replaces it in a single '
    'transaction (delete its credit_monthly rows, then this row, then insert again). '
    'The source revises its data daily, so collected_at and file_sha256 identify exactly which version was used.';
COMMENT ON COLUMN source_file.dataset IS
    'Source dataset name, e.g. MATRIZ_CR_REGIAO.';
COMMENT ON COLUMN source_file.file_generated_at IS
    'Modification time stored in the gzip header (when BCB generated the file). Null if absent.';
COMMENT ON COLUMN source_file.source_row_count IS
    'Data rows in the raw CSV (header excluded).';
COMMENT ON COLUMN source_file.source_total_qty IS
    'Sum of the source column TOTAL_QTDE. Control total for reconciliation with credit_monthly.';
COMMENT ON COLUMN source_file.source_total_amount IS
    'Sum of the source column TOTAL_VALOR, in nominal BRL. Control total for reconciliation with credit_monthly.';

-- -----------------------------------------------------------------------------
-- Analytical fact table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS credit_monthly (
    source_file_id       BIGINT          NOT NULL REFERENCES source_file (source_file_id) ON DELETE RESTRICT,
    reference_year       SMALLINT        NOT NULL CHECK (reference_year BETWEEN 2013 AND 2100),
    reference_month      SMALLINT        NOT NULL CHECK (reference_month BETWEEN 1 AND 12),
    state_abbr           CHAR(2)         NOT NULL REFERENCES ref_state (state_abbr),
    activity_code        CHAR(1)         NOT NULL REFERENCES ref_activity (activity_code),
    program_name         TEXT            NOT NULL,
    subprogram_name      TEXT            NOT NULL,
    funding_source_name  TEXT            NOT NULL,
    purpose              TEXT            NOT NULL REFERENCES ref_purpose (purpose),
    contract_count       INTEGER         NOT NULL CHECK (contract_count >= 0),
    credit_amount        NUMERIC(15, 2)  NOT NULL CHECK (credit_amount >= 0),
    CONSTRAINT credit_monthly_not_empty CHECK (contract_count > 0 OR credit_amount > 0),
    PRIMARY KEY (reference_year, reference_month, state_abbr, activity_code,
                 program_name, subprogram_name, funding_source_name, purpose)
);

COMMENT ON TABLE credit_monthly IS
    'Rural credit granted (crédito concedido) per month of issue, UF, activity, program, subprogram, '
    'funding source and purpose. Built from the annual files by summing municipalities and financial '
    'institutions within each UF and turning each <PURPOSE>_QTDE/_VALOR pair into one row. '
    'Pairs with zero contracts and zero value are not stored: they only exist because of the wide layout.';
COMMENT ON COLUMN credit_monthly.reference_year IS
    'Year of issue of the credit note (source ANO_MES_EMISSAO).';
COMMENT ON COLUMN credit_monthly.reference_month IS
    'Month of issue of the credit note (source ANO_MES_EMISSAO).';
COMMENT ON COLUMN credit_monthly.program_name IS
    'Program as published (source PROGRAMA). Before 2015 most value is "NÃO INFORMADO".';
COMMENT ON COLUMN credit_monthly.subprogram_name IS
    'Subprogram as published (source SUBPROGRAMA). Before 2015 always "SEM SUBPROGRAMA".';
COMMENT ON COLUMN credit_monthly.funding_source_name IS
    'Funding source as published (source FONTE_RECURSO).';
COMMENT ON COLUMN credit_monthly.contract_count IS
    'Number of contracts (source <PURPOSE>_QTDE, summed within the UF).';
COMMENT ON COLUMN credit_monthly.credit_amount IS
    'Amount granted in nominal BRL, no inflation adjustment (source <PURPOSE>_VALOR, summed within the UF).';

-- No secondary indexes on purpose: 2013–2025 is about 235 thousand rows, small
-- enough for sequential scans. Revisit with EXPLAIN ANALYZE once queries.sql exists.
