"""Invalid requests never reach the database, and every error has the same envelope."""

from __future__ import annotations

import re

import pytest

LONG_PROGRAM = "x" * 121


@pytest.mark.parametrize(
    ("url", "field"),
    [
        ("/api/v1/totals/yearly?start_year=2012", "start_year"),
        ("/api/v1/totals/yearly?end_year=2026", "end_year"),
        ("/api/v1/totals/yearly?start_year=abc", "start_year"),
        ("/api/v1/totals/yearly?start_year=2025&end_year=2024", None),
        ("/api/v1/totals/yearly?state=XX", "state"),
        ("/api/v1/totals/yearly?activity=fishing", "activity"),
        ("/api/v1/totals/yearly?purpose=custeio';DROP TABLE x;--", "purpose"),
        ("/api/v1/totals/yearly?estado=PI", "estado"),
        ("/api/v1/states/ranking?state=PI", "state"),
        ("/api/v1/states/compare", "states"),
        ("/api/v1/states/compare?states=PI", "states"),
        ("/api/v1/states/compare?states=PI,CE,MA,BA,TO,GO", "states"),
        ("/api/v1/states/compare?states=PI,pi", None),
        ("/api/v1/states/ZZ/profile", "uf"),
        ("/api/v1/contracts/average?state=PI&region=nordeste", None),
        ("/api/v1/contracts/average?region=amazonia", "region"),
        (f"/api/v1/contracts/average?program={LONG_PROGRAM}", "program"),
    ],
)
def test_invalid_parameters_get_422_and_no_query_runs(client, fake_db, url, field):
    response = client.get(url)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert field in [detail["field"] for detail in error["details"]]
    assert not any(detail["message"].startswith("Value error") for detail in error["details"])
    assert fake_db.calls == []


def test_unknown_route_gets_404(client):
    response = client.get("/api/v1/nothing-here")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_only_get_is_allowed(client):
    response = client.post("/api/v1/totals/yearly")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"
    assert response.headers["allow"] == "GET"


def test_database_unavailable_gets_503_with_retry_after(client, unavailable):
    response = client.get("/api/v1/totals/yearly")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert response.headers["retry-after"] == "30"


def test_health_reports_an_unavailable_database_with_503(client, unavailable):
    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "database": "unavailable"}


def test_unexpected_error_gets_500_without_details(client, fake_db):
    fake_db.failure = RuntimeError("password=secret host=db.internal")

    response = client.get("/api/v1/totals/yearly")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "secret" not in response.text
    assert "db.internal" not in response.text


def test_every_response_has_a_request_id_that_matches_the_error_body(client):
    ok = client.get("/health")
    error = client.get("/api/v1/totals/yearly?state=XX")

    assert re.fullmatch(r"[0-9a-f]{32}", ok.headers["x-request-id"])
    assert error.json()["error"]["request_id"] == error.headers["x-request-id"]
    assert ok.headers["x-request-id"] != error.headers["x-request-id"]
