"""The real API against the loaded database, connected as api_reader.

The numbers themselves are reconciled with the source files in tests/sql. Here the
check is that routes agree with each other, as the site and the assistant will
show them side by side. Skipped when the database is not reachable or not loaded.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from api.app.config import Settings
from api.app.main import create_app

CENTS = 1.0  # rounded values added again may differ by a few cents


@pytest.fixture(scope="module")
def api() -> Iterator[TestClient]:
    try:
        settings = Settings(rate_limit_per_minute=0)  # type: ignore[call-arg]
    except ValidationError:
        pytest.skip("database tests need DATABASE_URL_READER or API_READER_PASSWORD (see .env.example)")
    with TestClient(create_app(settings)) as client:
        if client.get("/health").status_code != 200:
            pytest.skip("database not reachable")
        years = [row["year"] for row in client.get("/api/v1/metadata").json()["years"]]
        if not set(range(2017, 2026)) <= set(years):
            pytest.skip("database without the main series (run pipeline.load)")
        yield client


def data(api: TestClient, url: str):
    response = api.get(url)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_metadata_reports_the_loaded_files_and_the_ipca(api):
    body = api.get("/api/v1/metadata").json()

    assert [row["year"] for row in body["years"]] == list(range(2013, 2026))
    assert body["price_index"]["last_month"] >= "2025-12"
    assert "PRONAF - PROGRAMA NACIONAL DE FORTALECIMENTO DA AGRICULTURA FAMILIAR" in body["programs"]


def test_ranking_adds_up_to_the_yearly_total(api):
    total = data(api, "/api/v1/totals/yearly?start_year=2025")[0]
    ranking = data(api, "/api/v1/states/ranking?start_year=2025")

    assert len(ranking) == 27
    assert sum(row["amount_nominal"] for row in ranking) == pytest.approx(total["amount_nominal"], abs=CENTS * 27)
    assert sum(row["share_pct"] for row in ranking) == pytest.approx(100, abs=0.2)


def test_profile_repeats_the_numbers_of_the_other_routes(api):
    profile = data(api, "/api/v1/states/PI/profile?start_year=2024")
    ranking = data(api, "/api/v1/states/ranking?start_year=2024")
    yearly = data(api, "/api/v1/totals/yearly?state=PI&start_year=2024")
    compared = data(api, "/api/v1/states/compare?states=PI,CE&start_year=2024")

    assert profile["ranking"] == next(row for row in ranking if row["state"] == "PI")
    assert profile["yearly"] == yearly
    pi_2025 = next(row for row in compared if row["state"] == "PI" and row["year"] == 2025)
    assert pi_2025["amount_nominal"] == yearly[-1]["amount_nominal"]


def test_filters_change_the_result_and_parts_add_up(api):
    total = data(api, "/api/v1/totals/yearly?start_year=2025")[0]["amount_nominal"]
    agricultural = data(api, "/api/v1/totals/yearly?start_year=2025&activity=agricultural")[0]["amount_nominal"]
    livestock = data(api, "/api/v1/totals/yearly?start_year=2025&activity=livestock")[0]["amount_nominal"]
    regions = data(api, "/api/v1/regions/yearly?start_year=2025")

    assert agricultural + livestock == pytest.approx(total, abs=CENTS)
    assert sum(row["amount_nominal"] for row in regions) == pytest.approx(total, abs=CENTS * 5)


def test_average_contract_value_has_a_period_row(api):
    rows = data(api, "/api/v1/contracts/average?region=nordeste&start_year=2024")

    assert [row["year"] for row in rows] == [2024, 2025, None]
    period = rows[-1]
    assert period["average_real"] == pytest.approx(period["amount_real"] / period["contracts"], abs=0.01)


def test_matopiba_and_seasonality_answer(api):
    matopiba = data(api, "/api/v1/regions/matopiba/yearly?start_year=2025")
    months = data(api, "/api/v1/seasonality")

    assert sorted(row["state"] or "bloc" for row in matopiba) == ["BA", "MA", "PI", "TO", "bloc"]
    assert [row["month"] for row in months] == list(range(1, 13))
    assert sum(row["avg_share_pct"] for row in months) == pytest.approx(100, abs=0.2)


def test_explorer_pages_and_csv_agree_with_the_totals(api):
    filters = {"state": "PI", "activity": "livestock", "start_year": 2024, "end_year": 2024}
    total = api.get("/api/v1/totals/yearly", params=filters).json()["data"][0]

    rows, cursor = [], None
    while True:
        params = {**filters, "limit": 500, **({"cursor": cursor} if cursor else {})}
        body = api.get("/api/v1/credit", params=params).json()
        rows.extend(body["data"])
        cursor = body["page"]["next_cursor"]
        if cursor is None:
            break
    csv = api.get("/api/v1/credit.csv", params=filters)

    assert body["summary"]["rows"] == len(rows)
    assert body["summary"]["contracts"] == total["contracts"]
    assert sum(row["amount_nominal"] for row in rows) == pytest.approx(total["amount_nominal"], abs=CENTS)
    assert csv.status_code == 200
    assert csv.content.decode("utf-8-sig").count("\r\n") == len(rows) + 1  # header and rows


def test_the_csv_of_the_whole_country_over_the_main_series_is_refused(api):
    response = api.get("/api/v1/credit.csv")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "export_too_large"
