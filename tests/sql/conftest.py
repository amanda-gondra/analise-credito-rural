"""Fixtures for the tests of sql/queries.sql, which run against a loaded PostgreSQL database.

They connect as api_reader, the same read-only role the API will use, so a query that
needs more than SELECT fails here first. When the database is not reachable or has no
data, the tests are skipped with the reason, and the unit tests still run.

Connection: DATABASE_URL_READER if set; otherwise the local database of docker-compose.yml
with API_READER_PASSWORD from the .env file.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Callable

import pytest
from dotenv import load_dotenv
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import OperationalError

QUERIES_FILE = Path(__file__).resolve().parents[2] / "sql" / "queries.sql"
MAIN_SERIES = (2017, 2025)  # decision D9
NAME_LINE = re.compile(r"^-- name: (\w+)\n(.*?)(?=^-- name: |\Z)", re.S | re.M)


def load_queries(path: Path = QUERIES_FILE) -> dict[str, str]:
    """Each query starts with a "-- name: <name>" line and ends where the next one starts."""
    queries = {name: body.strip() for name, body in NAME_LINE.findall(path.read_text(encoding="utf-8"))}
    if not queries:
        raise ValueError(f"no named queries in {path}")
    return queries


def reader_engine() -> Engine:
    load_dotenv()
    url = os.environ.get("DATABASE_URL_READER")
    if not url:
        password = os.environ.get("API_READER_PASSWORD")
        if not password:
            pytest.skip("database tests need DATABASE_URL_READER or API_READER_PASSWORD (see .env.example)")
        url = URL.create(
            "postgresql+psycopg",
            username="api_reader",
            password=password,
            host=os.environ.get("POSTGRES_HOST", "127.0.0.1"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            database=os.environ.get("POSTGRES_DB", "rural_credit"),
        )
    return create_engine(url, connect_args={"options": "-c search_path=rural_credit", "connect_timeout": 5})


@pytest.fixture(scope="session")
def engine() -> Engine:
    engine = reader_engine()
    try:
        with engine.connect() as connection:
            years = connection.execute(
                text("SELECT COUNT(DISTINCT reference_year) FROM source_file WHERE reference_year BETWEEN :a AND :b"),
                {"a": MAIN_SERIES[0], "b": MAIN_SERIES[1]},
            ).scalar_one()
            ipca_months = connection.execute(text("SELECT COUNT(*) FROM ipca_monthly")).scalar_one()
    except OperationalError as error:
        pytest.skip(f"database not reachable: {error.orig}")
    expected_years = MAIN_SERIES[1] - MAIN_SERIES[0] + 1
    if years < expected_years or ipca_months == 0:
        pytest.skip("database without the main series or the IPCA (run pipeline.load and pipeline.ipca)")
    return engine


@pytest.fixture(scope="session")
def queries() -> dict[str, str]:
    return load_queries()


@pytest.fixture(scope="session")
def run(engine: Engine, queries: dict[str, str]) -> Callable[..., list[dict[str, Any]]]:
    """run("yearly_totals", first_year=2024, ...) -> list of rows as dicts."""

    def _run(name: str, **params: Any) -> list[dict[str, Any]]:
        with engine.connect() as connection:
            return [dict(row._mapping) for row in connection.execute(text(queries[name]), params)]

    return _run
