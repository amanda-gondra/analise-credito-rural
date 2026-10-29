"""Download, transform and load yearly MDCR files into PostgreSQL.

Each year is loaded in a single transaction: delete the year (if it was loaded
before), insert source_file, insert the facts, reconcile in SQL. If anything
fails, the transaction is rolled back and the database keeps the previous
version of that year, never half of a load.

Usage, from the project root (database running, .env filled in):
    python -m pipeline.load 2017 2025            # use files already downloaded
    python -m pipeline.load 2025 2025 --refresh  # download again before loading

Connection: DATABASE_URL if set (production, e.g. Neon); otherwise built from
the POSTGRES_* variables used by docker-compose.yml.
"""

from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.engine import URL

from pipeline.download import DEFAULT_DEST_DIR, SourceFile, download_year
from pipeline.transform import Severity, StateRef, TransformResult, ValidationError, transform

DATASET = "MATRIZ_CR_REGIAO"


class ReconciliationError(Exception):
    """The totals in the database do not match the totals of the source file."""


def get_engine() -> Engine:
    load_dotenv()
    url = os.environ.get("DATABASE_URL")
    if not url:
        password = os.environ.get("POSTGRES_PASSWORD")
        if not password:
            raise RuntimeError("set DATABASE_URL or POSTGRES_PASSWORD (see .env.example)")
        url = URL.create(
            "postgresql+psycopg",
            username=os.environ.get("POSTGRES_USER", "postgres"),
            password=password,
            # 127.0.0.1, not "localhost": on Windows "localhost" tries IPv6 (::1) first, and the
            # Docker port is published on IPv4 only, which delayed each connection by about 2 minutes.
            host=os.environ.get("POSTGRES_HOST", "127.0.0.1"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            database=os.environ.get("POSTGRES_DB", "rural_credit"),
        )
    # search_path makes the unqualified table names below refer to the rural_credit schema.
    # connect_timeout: fail in 10 s with a clear error instead of hanging when the database is unreachable.
    return create_engine(url, connect_args={"options": "-c search_path=rural_credit", "connect_timeout": 10})


def fetch_reference(connection: Connection) -> tuple[dict[str, StateRef], dict[str, str]]:
    """Valid states and activities, read from the reference tables (single source of truth)."""
    states = {
        name: StateRef(abbr=abbr, ibge_code=code)
        for name, abbr, code in connection.execute(text("SELECT state_name, state_abbr, ibge_state_code FROM ref_state"))
    }
    activities = dict(connection.execute(text("SELECT source_label, activity_code FROM ref_activity")).all())
    return states, activities


def cents_to_decimal(cents: int) -> Decimal:
    """50190000 -> Decimal('501900.00'), exact (no float involved)."""
    return Decimal(int(cents)).scaleb(-2)


def load_year(connection: Connection, source: SourceFile, result: TransformResult) -> int:
    """Replace one year in the database. Must run inside a transaction. Returns the new source_file_id."""
    year = result.reference_year
    connection.execute(text("DELETE FROM credit_monthly WHERE reference_year = :year"), {"year": year})
    connection.execute(text("DELETE FROM source_file WHERE dataset = :dataset AND reference_year = :year"),
                       {"dataset": DATASET, "year": year})

    source_file_id = connection.execute(
        text("""
            INSERT INTO source_file (dataset, reference_year, file_name, source_url, collected_at, file_sha256,
                                     file_generated_at, source_row_count, source_total_qty, source_total_amount)
            VALUES (:dataset, :year, :file_name, :source_url, :collected_at, :sha256,
                    :generated_at, :row_count, :total_qty, :total_amount)
            RETURNING source_file_id
        """),
        {
            "dataset": DATASET, "year": year, "file_name": source.path.name, "source_url": source.source_url,
            "collected_at": source.collected_at, "sha256": source.file_sha256, "generated_at": source.file_generated_at,
            "row_count": result.source_row_count, "total_qty": result.source_total_qty,
            "total_amount": cents_to_decimal(result.source_total_amount_cents),
        },
    ).scalar_one()

    copy_facts(connection, source_file_id, result)
    reconcile(connection, source_file_id)
    return source_file_id


def copy_facts(connection: Connection, source_file_id: int, result: TransformResult) -> None:
    """Bulk insert with PostgreSQL COPY: one stream instead of ~20 thousand INSERT statements.

    It uses the psycopg connection under SQLAlchemy, so it runs inside the same transaction.
    Every constraint (primary key, foreign keys, CHECKs) is still enforced by the database.
    """
    columns = ("source_file_id, reference_year, reference_month, state_abbr, activity_code, program_name, "
               "subprogram_name, funding_source_name, purpose, contract_count, credit_amount")
    driver_connection = connection.connection.driver_connection
    with driver_connection.cursor() as cursor, cursor.copy(f"COPY credit_monthly ({columns}) FROM STDIN") as copy:
        for f in result.facts.itertuples(index=False):
            copy.write_row((
                source_file_id, result.reference_year, int(f.reference_month), f.state_abbr, f.activity_code,
                f.program_name, f.subprogram_name, f.funding_source_name, f.purpose,
                int(f.contract_count), cents_to_decimal(f.amount_cents),
            ))


def reconcile(connection: Connection, source_file_id: int) -> None:
    """Rule 9: what is in the fact table must equal the control totals of the file, with zero tolerance."""
    row = connection.execute(
        text("""
            SELECT s.source_total_amount, s.source_total_qty,
                   COALESCE(SUM(c.credit_amount), 0) AS fact_amount,
                   COALESCE(SUM(c.contract_count), 0) AS fact_qty
            FROM source_file s
            LEFT JOIN credit_monthly c ON c.source_file_id = s.source_file_id
            WHERE s.source_file_id = :id
            GROUP BY s.source_total_amount, s.source_total_qty
        """),
        {"id": source_file_id},
    ).one()
    if row.fact_amount != row.source_total_amount or row.fact_qty != row.source_total_qty:
        raise ReconciliationError(
            f"database totals R$ {row.fact_amount} / {row.fact_qty} contracts differ from the file "
            f"R$ {row.source_total_amount} / {row.source_total_qty} contracts"
        )


def run(first_year: int, last_year: int, refresh: bool = False, dest_dir: Path = DEFAULT_DEST_DIR) -> int:
    engine = get_engine()
    with engine.connect() as connection:
        states, activities = fetch_reference(connection)

    failures = 0
    for year in range(first_year, last_year + 1):
        try:
            source = download_year(year, dest_dir, force=refresh)
            result = transform(source.path, year, states, activities)
            with engine.begin() as connection:  # commits on success, rolls back on any exception
                load_year(connection, source, result)
        except ValidationError as error:
            failures += 1
            print(f"{year}  REJECTED  critical quality rule failed; nothing loaded", file=sys.stderr)
            _print_issues(error.issues)
            continue
        except Exception as error:  # download, database or reconciliation failure: report and go on
            failures += 1
            print(f"{year}  ERROR  {type(error).__name__}: {error}", file=sys.stderr)
            continue

        amount = cents_to_decimal(result.source_total_amount_cents)
        print(f"{year}  loaded {len(result.facts):>6} rows  R$ {amount:>18,.2f}  "
              f"{result.source_total_qty:>9,} contracts  sha256={source.file_sha256[:12]}")
        _print_issues([i for i in result.issues if i.severity is not Severity.WARNING])

    return 1 if failures else 0


def _print_issues(issues: list) -> None:
    for issue in issues:
        print(f"      {issue.severity.value:<9} [{issue.rule}] {issue.message}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download, validate and load yearly MDCR files into PostgreSQL.")
    parser.add_argument("first_year", type=int)
    parser.add_argument("last_year", type=int)
    parser.add_argument("--refresh", action="store_true", help="download the files again before loading")
    args = parser.parse_args(argv)
    if args.first_year > args.last_year:
        parser.error("first_year must be less than or equal to last_year")
    return run(args.first_year, args.last_year, refresh=args.refresh)


if __name__ == "__main__":
    raise SystemExit(main())
