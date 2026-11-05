"""Fixtures of the API tests.

Two kinds of test:
    * without a database: the app gets a FakeDatabase that records which query ran with
      which parameters and answers with rows shaped like the real ones. These check
      validation, errors, middlewares and the mapping from API filters to query parameters.
      The assistant gets ScriptedProvider, which answers from a list prepared by the test,
      so no test calls a real language model or needs a key.
    * with the database (test_api_database.py): the real app, connected as api_reader,
      skipped with the reason when the database is not reachable.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator, Sequence
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from api.app.assistant.agent import Assistant
from api.app.assistant.conversation import ModelReply, ProviderError, ToolCall, Turn
from api.app.config import Settings
from api.app.database import DatabaseUnavailableError, Row
from api.app.main import create_app

ALLOWED_ORIGIN = "https://site.example"


class FakeDatabase:
    def __init__(self, rows: dict[str, list[Row]] | None = None) -> None:
        self.rows = rows or {}
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.failure: Exception | None = None

    def fetch(self, name: str, **params: Any) -> list[Row]:
        self.calls.append((name, params))
        if self.failure is not None:
            raise self.failure
        return self.rows.get(name, [])

    def ping(self) -> None:
        if self.failure is not None:
            raise self.failure


def text_reply(text: str) -> ModelReply:
    return ModelReply(text=text, tool_calls=(), raw={"text": text})


def call_reply(*calls: tuple[str, dict[str, Any]]) -> ModelReply:
    tool_calls = tuple(ToolCall(id=f"call_{i}", name=name, arguments=args) for i, (name, args) in enumerate(calls))
    return ModelReply(text="", tool_calls=tool_calls, raw={"calls": [name for name, _ in calls]})


class ScriptedProvider:
    """Answers each call with the next item of `replies`; an exception in the list is raised."""

    def __init__(self, name: str, replies: Sequence[ModelReply | Exception]) -> None:
        self.name = name
        self.replies = list(replies)
        self.requests: list[dict[str, Any]] = []

    def complete(
        self, system: str, turns: Sequence[Turn], tools: Sequence[dict[str, Any]], *, allow_tools: bool = True
    ) -> ModelReply:
        self.requests.append({"turns": list(turns), "allow_tools": allow_tools, "tools": list(tools)})
        if not self.replies:
            raise ProviderError(f"{self.name}: script exhausted")
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def make_settings(**overrides: Any) -> Settings:
    # _env_file=None skips the developer's .env, and every connection field is given here,
    # because values passed in code win over environment variables (CI sets DATABASE_URL_READER).
    values: dict[str, Any] = {
        "database_url_reader": None,
        "api_reader_password": SecretStr("test-password-0123456789"),
        "postgres_host": "127.0.0.1",
        "postgres_port": 5432,
        "postgres_db": "rural_credit",
        "allowed_origins": [ALLOWED_ORIGIN],
        "rate_limit_per_minute": 0,
        "gemini_api_key": None,
        "groq_api_key": None,
        "cloudflare_account_id": None,
        "cloudflare_api_token": None,
    }
    return Settings(_env_file=None, **{**values, **overrides})  # type: ignore[call-arg]


@pytest.fixture
def fake_db() -> FakeDatabase:
    return FakeDatabase()


@pytest.fixture
def make_client(fake_db: FakeDatabase) -> Iterator[Callable[..., TestClient]]:
    """make_client(rate_limit_per_minute=2, providers=[...]) -> client of an app with those settings."""
    clients: list[TestClient] = []

    def _make(providers: Sequence[Any] = (), **overrides: Any) -> TestClient:
        app = create_app(make_settings(**overrides), fake_db, Assistant(providers))
        # raise_server_exceptions=False: a 500 is returned as a response, as in production.
        client = TestClient(app, raise_server_exceptions=False)
        clients.append(client)
        return client

    yield _make
    for client in clients:
        client.close()


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()


@pytest.fixture
def unavailable(fake_db: FakeDatabase) -> FakeDatabase:
    fake_db.failure = DatabaseUnavailableError()
    return fake_db
