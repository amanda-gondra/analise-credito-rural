"""Routes without a database: which query runs, with which parameters, and how rows come back."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from api.app.filters import STATES
from api.app.schemas import SOURCE

PERIOD = {"first_year": 2017, "last_year": 2025}  # main series, the default (decision D9)


@pytest.mark.parametrize(
    ("url", "query", "params"),
    [
        ("/api/v1/totals/yearly", "yearly_totals",
         {**PERIOD, "state_abbr": None, "activity_code": None, "purpose": None}),
        ("/api/v1/totals/yearly?state=pi&activity=livestock&purpose=custeio&start_year=2020&end_year=2021",
         "yearly_totals",
         {"first_year": 2020, "last_year": 2021, "state_abbr": "PI", "activity_code": "2", "purpose": "custeio"}),
        ("/api/v1/states/ranking?activity=agricultural", "state_ranking",
         {**PERIOD, "activity_code": "1", "purpose": None}),
        ("/api/v1/states/compare?states=pi,CE", "states_yearly", {**PERIOD, "state_abbrs": ["PI", "CE"]}),
        ("/api/v1/states/compare?states=PI&states=CE&states=MA", "states_yearly",
         {**PERIOD, "state_abbrs": ["PI", "CE", "MA"]}),
        ("/api/v1/regions/yearly?purpose=investimento", "regions_yearly",
         {**PERIOD, "activity_code": None, "purpose": "investimento"}),
        ("/api/v1/regions/matopiba/yearly?start_year=2013", "matopiba_yearly",
         {"first_year": 2013, "last_year": 2025}),
        ("/api/v1/activities/yearly?state=BA", "activity_split", {**PERIOD, "state_abbr": "BA"}),
        ("/api/v1/purposes/yearly?activity=livestock", "purpose_split",
         {**PERIOD, "state_abbr": None, "activity_code": "2"}),
        ("/api/v1/programs/ranking", "program_ranking", {**PERIOD, "state_abbr": None}),
        ("/api/v1/funding-sources/ranking?state=MT", "funding_source_ranking", {**PERIOD, "state_abbr": "MT"}),
        ("/api/v1/seasonality?purpose=custeio", "seasonality", {**PERIOD, "state_abbr": None, "purpose": "custeio"}),
        ("/api/v1/contracts/average?region=Centro-Oeste&program=%20PRONAF%20", "average_contract_value",
         {**PERIOD, "state_abbr": None, "region_name": "CENTRO-OESTE", "activity_code": None,
          "purpose": None, "program_name": "PRONAF"}),
    ],
)
def test_each_route_runs_its_query_with_the_stored_values(client, fake_db, url, query, params):
    response = client.get(url)

    assert response.status_code == 200
    assert fake_db.calls == [(query, params)]
    body = response.json()
    assert body["data"] == []
    assert body["meta"]["source"] == SOURCE
    assert body["meta"]["price_base"] == "2025-12"


def test_meta_echoes_the_filters_with_the_api_words(client):
    meta = client.get("/api/v1/totals/yearly?state=pi&activity=livestock").json()["meta"]

    assert meta["filters"] == {
        "start_year": 2017, "end_year": 2025, "state": "PI", "activity": "livestock", "purpose": None,
    }


def test_rows_are_renamed_and_codes_become_words(client, fake_db):
    fake_db.rows["activity_split"] = [{
        "reference_year": 2025, "activity_code": "2", "activity_label": "PECUÁRIA",
        "amount_nominal": Decimal("10.50"), "amount_real": Decimal("11.00"),
        "contracts": 3, "share_pct": Decimal("100.00"),
    }]
    fake_db.rows["regions_yearly"] = [{
        "reference_year": 2025, "region_name": "CENTRO-OESTE", "amount_nominal": Decimal("1"),
        "amount_real": None, "contracts": 1, "share_pct": None,
    }]

    activities = client.get("/api/v1/activities/yearly").json()["data"]
    regions = client.get("/api/v1/regions/yearly").json()["data"]

    assert activities == [{
        "year": 2025, "activity": "livestock", "amount_nominal": 10.5, "amount_real": 11.0,
        "contracts": 3, "share_pct": 100.0,
    }]
    assert regions[0]["region"] == "centro-oeste"
    assert regions[0]["amount_real"] is None


def _ranking_row(state: str, position: int) -> dict:
    return {
        "position": position, "state_abbr": state, "region_name": "NORDESTE",
        "amount_nominal": Decimal("5"), "amount_real": Decimal("6"), "contracts": 1, "share_pct": Decimal("50"),
    }


def test_profile_runs_the_same_queries_as_the_other_routes(client, fake_db):
    fake_db.rows["state_ranking"] = [_ranking_row("CE", 1), _ranking_row("PI", 2)]

    response = client.get("/api/v1/states/pi/profile?start_year=2024")

    assert response.status_code == 200
    period = {"first_year": 2024, "last_year": 2025}
    assert fake_db.calls == [
        ("state_ranking", {**period, "activity_code": None, "purpose": None}),
        ("yearly_totals", {**period, "state_abbr": "PI", "activity_code": None, "purpose": None}),
        ("activity_split", {**period, "state_abbr": "PI"}),
        ("purpose_split", {**period, "state_abbr": "PI", "activity_code": None}),
    ]
    body = response.json()
    assert body["data"]["state"] == "PI"
    assert body["data"]["ranking"]["position"] == 2
    assert body["meta"]["filters"] == {"state": "PI", "start_year": 2024, "end_year": 2025}


def test_profile_of_a_state_without_credit_has_no_ranking(client, fake_db):
    fake_db.rows["state_ranking"] = [_ranking_row("CE", 1)]

    data = client.get("/api/v1/states/PI/profile").json()["data"]

    assert data["ranking"] is None


def test_metadata_lists_the_accepted_values_and_the_loaded_data(client, fake_db):
    collected = datetime(2026, 10, 23, 12, 0, tzinfo=UTC)
    fake_db.rows = {
        "loaded_years": [{"reference_year": 2025, "collected_at": collected, "file_generated_at": None}],
        "program_names": [{"program_name": "PRONAF"}, {"program_name": "PRONAMP"}],
        "latest_ipca": [{"reference_year": 2026, "reference_month": 9, "collected_at": collected}],
    }

    body = client.get("/api/v1/metadata").json()

    assert body["years"] == [{"year": 2025, "collected_at": "2026-10-23T12:00:00Z", "file_generated_at": None}]
    assert body["main_series"] == {"start_year": 2017, "end_year": 2025}
    assert body["states"] == list(STATES) and len(STATES) == 27
    assert body["matopiba"] == ["MA", "TO", "PI", "BA"]
    assert body["activities"] == ["agricultural", "livestock"]
    assert body["programs"] == ["PRONAF", "PRONAMP"]
    assert body["price_index"]["last_month"] == "2026-09"
    assert body["price_index"]["price_base"] == "2025-12"


def test_metadata_without_ipca_says_so(client):
    assert client.get("/api/v1/metadata").json()["price_index"] is None


def test_health_reports_the_database(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_openapi_documents_every_route_as_get_only(client):
    paths = client.get("/openapi.json").json()["paths"]

    assert set(paths) == {
        "/api/v1/metadata", "/api/v1/totals/yearly", "/api/v1/seasonality", "/api/v1/contracts/average",
        "/api/v1/states/ranking", "/api/v1/states/compare", "/api/v1/states/{uf}/profile",
        "/api/v1/regions/yearly", "/api/v1/regions/matopiba/yearly", "/api/v1/activities/yearly",
        "/api/v1/purposes/yearly", "/api/v1/programs/ranking", "/api/v1/funding-sources/ranking", "/health",
    }
    assert all(set(methods) == {"get"} for methods in paths.values())
