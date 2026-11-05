"""Database access: the named queries of sql/queries.sql, run as the read-only role.

The API has no SQL of its own. Every route asks for a query by name and passes its
parameters, which the driver binds (never concatenated into the text), so user input
cannot change a query. The role api_reader adds the database-side guards: SELECT only,
read-only transactions, search_path and a 5 s statement timeout (sql/roles.sql).

Connection problems and timeouts become DatabaseUnavailableError, which the API answers
with 503; the original error goes to the log, never to the client.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Final, Protocol

from sqlalchemy import Engine, TextClause, create_engine, text
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError

from api.app.config import Settings

logger = logging.getLogger("rural_credit_api.database")

# A query starts at its "-- name: <name>" line and ends where the next one starts.
NAME_LINE: Final = re.compile(r"^-- name: (\w+)\n(.*?)(?=^-- name: |\Z)", re.S | re.M)
_UNAVAILABLE: Final = (OperationalError, InterfaceError, PoolTimeoutError)

Row = dict[str, Any]


class DatabaseUnavailableError(Exception):
    """The database could not be reached or did not answer in time."""


def load_queries(path: Path) -> dict[str, str]:
    queries = {name: body.strip() for name, body in NAME_LINE.findall(path.read_text(encoding="utf-8"))}
    if not queries:
        raise ValueError(f"no named queries in {path}")
    return queries


class QueryRunner(Protocol):
    """What the routes need from the database; tests replace it with a fake."""

    def fetch(self, name: str, **params: Any) -> list[Row]: ...

    def ping(self) -> None: ...


class Database:
    def __init__(self, engine: Engine, queries: dict[str, str]) -> None:
        self._engine = engine
        # Parsed once at startup; a query missing from the file fails here, not on a request.
        self._statements: dict[str, TextClause] = {name: text(sql) for name, sql in queries.items()}

    @classmethod
    def from_settings(cls, settings: Settings) -> Database:
        engine = create_engine(
            settings.database_url(),
            pool_size=settings.db_pool_size,
            max_overflow=0,  # never more connections than DB_POOL_SIZE (the role allows 10)
            pool_timeout=10,  # wait at most 10 s for a free connection, then 503
            pool_pre_ping=True,  # hosted databases close idle connections (Neon after 5 min)
            pool_recycle=300,
            connect_args={"connect_timeout": 5, "application_name": "rural-credit-api"},
        )
        return cls(engine, load_queries(settings.queries_file))

    @property
    def query_names(self) -> frozenset[str]:
        return frozenset(self._statements)

    def fetch(self, name: str, **params: Any) -> list[Row]:
        statement = self._statements[name]  # KeyError = bug in a route, answered with 500
        try:
            with self._engine.connect() as connection:
                return [dict(row._mapping) for row in connection.execute(statement, params)]
        except _UNAVAILABLE as error:
            logger.warning("query %s failed: %s", name, type(error).__name__)
            raise DatabaseUnavailableError from error

    def ping(self) -> None:
        try:
            with self._engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except _UNAVAILABLE as error:
            logger.warning("database ping failed: %s", type(error).__name__)
            raise DatabaseUnavailableError from error

    def dispose(self) -> None:
        self._engine.dispose()
