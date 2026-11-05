-- =============================================================================
-- Database roles with the least privilege each part of the application needs
-- (decision D16 in docs/decisoes-tecnicas.md).
--
--   loader      the pipeline: reads the reference tables, replaces yearly data
--   api_reader  the public API: read only, short queries, few connections
--
-- Passwords are never written here. They are passed as psql variables:
--   psql -v ON_ERROR_STOP=1 -v loader_password=... -v api_reader_password=... -f sql/roles.sql
-- (see "Usuários do banco" in README.md for the exact command).
--
-- Run after sql/schema.sql, as the database owner. Safe to run again: it creates
-- missing roles, updates passwords and re-applies the grants.
-- =============================================================================

-- Stop with an error (exit code 3 with ON_ERROR_STOP=1) if a password was not passed.
\if :{?loader_password}
\else
    DO $$ BEGIN RAISE EXCEPTION 'missing psql variable: -v loader_password=...'; END $$;
\endif
\if :{?api_reader_password}
\else
    DO $$ BEGIN RAISE EXCEPTION 'missing psql variable: -v api_reader_password=...'; END $$;
\endif

-- An empty variable would clear the password instead of setting one, so require a strong value.
SELECT length(:'loader_password') < 16 OR length(:'api_reader_password') < 16 AS weak_password \gset
\if :weak_password
    DO $$ BEGIN RAISE EXCEPTION 'loader_password and api_reader_password must have at least 16 characters'; END $$;
\endif

-- Create the roles only if they do not exist yet (CREATE ROLE has no IF NOT EXISTS).
SELECT format('CREATE ROLE loader LOGIN PASSWORD %L', :'loader_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'loader')
\gexec

SELECT format('CREATE ROLE api_reader LOGIN PASSWORD %L', :'api_reader_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'api_reader')
\gexec

-- Keep the passwords in sync with .env when the script runs again.
ALTER ROLE loader     WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'loader_password';
ALTER ROLE api_reader WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'api_reader_password';

-- Session defaults.
ALTER ROLE loader     SET search_path = rural_credit;
ALTER ROLE api_reader SET search_path = rural_credit;
-- Even if the API had a bug that tried to write, the database would refuse it.
ALTER ROLE api_reader SET default_transaction_read_only = on;
-- A slow or abusive request cannot hold the database for long.
ALTER ROLE api_reader SET statement_timeout = '5s';
ALTER ROLE api_reader CONNECTION LIMIT 10;

-- Nobody else gets anything by default.
REVOKE ALL ON SCHEMA rural_credit FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA rural_credit FROM PUBLIC;

GRANT CONNECT ON DATABASE :"DBNAME" TO loader, api_reader;
GRANT USAGE ON SCHEMA rural_credit TO loader, api_reader;

-- loader: read the reference tables, replace the data of a year and the IPCA series.
GRANT SELECT ON rural_credit.ref_state, rural_credit.ref_activity, rural_credit.ref_purpose TO loader;
GRANT SELECT, INSERT, DELETE ON rural_credit.source_file, rural_credit.credit_monthly, rural_credit.ipca_monthly TO loader;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA rural_credit TO loader;  -- source_file_id identity

-- api_reader: read everything in the schema, including tables created later by the owner.
GRANT SELECT ON ALL TABLES IN SCHEMA rural_credit TO api_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA rural_credit GRANT SELECT ON TABLES TO api_reader;
