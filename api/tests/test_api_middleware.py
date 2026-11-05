"""CORS and the request limit."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.app.middleware.rate_limit import RateLimitMiddleware
from api.tests.conftest import ALLOWED_ORIGIN


def test_cors_allows_only_the_listed_origin(client):
    allowed = client.get("/health", headers={"Origin": ALLOWED_ORIGIN})
    other = client.get("/health", headers={"Origin": "https://other.example"})

    assert allowed.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert "x-request-id" in allowed.headers["access-control-expose-headers"].lower()
    assert "access-control-allow-origin" not in other.headers


def test_cors_preflight_accepts_get_and_refuses_other_methods(client):
    def preflight(method: str):
        return client.options(
            "/api/v1/totals/yearly",
            headers={"Origin": ALLOWED_ORIGIN, "Access-Control-Request-Method": method},
        )

    assert preflight("GET").status_code == 200
    assert preflight("DELETE").status_code == 400


def test_cors_is_closed_without_allowed_origins(make_client):
    client = make_client(allowed_origins=[])

    response = client.get("/health", headers={"Origin": ALLOWED_ORIGIN})

    assert "access-control-allow-origin" not in response.headers


def test_rate_limit_answers_429_with_retry_after_and_spares_health(make_client):
    client = make_client(rate_limit_per_minute=2)

    statuses = [client.get("/api/v1/programs/ranking").status_code for _ in range(3)]
    limited = client.get("/api/v1/programs/ranking")

    assert statuses == [200, 200, 429]
    assert limited.json()["error"]["code"] == "rate_limited"
    assert 1 <= int(limited.headers["retry-after"]) <= 60
    assert limited.json()["error"]["request_id"] == limited.headers["x-request-id"]
    assert client.get("/health").status_code == 200
    assert client.get("/docs").status_code == 200


def _limited_app(clock, max_clients: int = 10_000) -> TestClient:
    app = FastAPI()

    @app.get("/api/v1/ping")
    def ping() -> dict[str, bool]:
        return {"ok": True}

    app.add_middleware(RateLimitMiddleware, requests_per_minute=1, clock=clock, max_clients=max_clients)
    return TestClient(app)


def test_rate_limit_counters_restart_every_minute():
    now = [0.0]
    client = _limited_app(lambda: now[0])

    assert client.get("/api/v1/ping").status_code == 200
    assert client.get("/api/v1/ping").status_code == 429
    now[0] = 60.0
    assert client.get("/api/v1/ping").status_code == 200


def test_rate_limit_refuses_new_clients_above_max_clients():
    client = _limited_app(lambda: 0.0, max_clients=0)

    assert client.get("/api/v1/ping").status_code == 429
