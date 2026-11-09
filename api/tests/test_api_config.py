"""Settings and the link between the routes and sql/queries.sql."""

from __future__ import annotations

import pytest
from pydantic import SecretStr, ValidationError
from sqlalchemy import create_engine

from api.app.config import DEFAULT_QUERIES_FILE, Settings
from api.app.database import Database, load_queries
from api.tests.conftest import make_settings

# Every query a route runs (routes/*.py).
ROUTE_QUERIES = {
    "yearly_totals", "state_ranking", "matopiba_yearly", "activity_split", "purpose_split",
    "states_yearly", "regions_yearly", "program_ranking", "funding_source_ranking",
    "seasonality", "average_contract_value", "credit_rows", "credit_summary",
    "loaded_years", "program_names", "latest_ipca",
}


def test_every_query_used_by_a_route_exists_in_queries_sql():
    engine = create_engine("postgresql+psycopg://user:pass@localhost/db")  # never connects here

    database = Database(engine, load_queries(DEFAULT_QUERIES_FILE))

    assert ROUTE_QUERIES <= database.query_names


def test_credentials_are_required():
    with pytest.raises(ValidationError, match="DATABASE_URL_READER or API_READER_PASSWORD"):
        Settings(_env_file=None, database_url_reader="", api_reader_password="")  # type: ignore[call-arg]


def test_wildcard_origin_is_refused():
    with pytest.raises(ValidationError, match="not allowed"):
        make_settings(allowed_origins="https://site.example, *")


def test_origins_come_from_a_comma_separated_variable():
    settings = make_settings(allowed_origins=" https://a.example ,https://b.example,")

    assert settings.allowed_origins == ["https://a.example", "https://b.example"]


def test_hosted_url_gets_the_psycopg_driver():
    settings = make_settings(
        database_url_reader=SecretStr("postgresql://api_reader:pw@host.example/db?sslmode=require")
    )

    url = settings.database_url()

    assert url.drivername == "postgresql+psycopg"
    assert url.host == "host.example"
    assert url.query["sslmode"] == "require"


def test_local_url_uses_the_read_only_role():
    url = make_settings().database_url()

    assert (url.username, url.host, url.port, url.database) == ("api_reader", "127.0.0.1", 5432, "rural_credit")


def test_secrets_do_not_appear_in_the_settings_text():
    settings = make_settings(database_url_reader=SecretStr("postgresql://api_reader:very-secret@h/db"))

    assert "very-secret" not in repr(settings)
    assert "test-password" not in repr(settings)
    assert "very-secret" not in repr(settings.database_url())
