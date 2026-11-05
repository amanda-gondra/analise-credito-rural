"""POST /api/v1/assistant/ask: checks before the model, quotas and the shape of the answer."""

from __future__ import annotations

import logging

import pytest

from api.app.assistant.conversation import ProviderError
from api.app.assistant.quota import AssistantQuota, QuotaExceededError
from api.tests.conftest import ScriptedProvider, call_reply, text_reply

URL = "/api/v1/assistant/ask"


def answering(*replies) -> list[ScriptedProvider]:
    return [ScriptedProvider("gemini", list(replies))]


def test_answer_comes_with_its_sources_and_panel_links(make_client):
    client = make_client(providers=answering(
        call_reply(("yearly_totals", {"state": "PI"})),
        text_reply("O Piauí recebeu... Fonte: Banco Central do Brasil (MDCR)."),
    ))

    response = client.post(URL, json={"question": "  Quanto o Piauí recebeu?  "})

    assert response.status_code == 200
    body = response.json()
    assert body["answer"].endswith("(MDCR).")
    assert body["provider"] == "gemini" and body["out_of_scope"] is False
    assert body["sources"] == [{
        "tool": "yearly_totals",
        "filters": {"start_year": 2017, "end_year": 2025, "state": "PI", "activity": None, "purpose": None},
        "panel_path": "/estados/PI?start_year=2017&end_year=2025",
        "data": [],
    }]
    assert body["meta"]["price_base"] == "2025-12"


def test_refusal_is_flagged(make_client):
    client = make_client(providers=answering(call_reply(("explain_out_of_scope", {"topic": "forecast"}))))

    body = client.post(URL, json={"question": "Quanto vai ser em 2027?"}).json()

    assert body["out_of_scope"] is True and body["sources"] == []


@pytest.mark.parametrize(
    ("payload", "status", "code"),
    [
        ({"question": "oi"}, 422, "validation_error"),
        ({"question": "x" * 501}, 422, "validation_error"),
        ({"question": "Pergunta?", "model": "other"}, 422, "validation_error"),
        ({}, 422, "validation_error"),
    ],
)
def test_invalid_questions_never_reach_the_model(make_client, payload, status, code):
    provider = ScriptedProvider("gemini", [text_reply("never")])
    client = make_client(providers=[provider])

    response = client.post(URL, json=payload)

    assert (response.status_code, response.json()["error"]["code"]) == (status, code)
    assert provider.requests == []


def test_invalid_json_gets_400_and_a_large_body_413(make_client):
    client = make_client(providers=answering(text_reply("never")))

    broken = client.post(URL, content=b"{question:", headers={"Content-Type": "application/json"})
    large = client.post(URL, content=b"x" * 5_000, headers={"Content-Type": "application/json"})

    assert (broken.status_code, broken.json()["error"]["code"]) == (400, "invalid_json")
    assert (large.status_code, large.json()["error"]["code"]) == (413, "payload_too_large")


def test_without_providers_the_assistant_answers_503_and_metadata_says_so(client):
    response = client.post(URL, json={"question": "Pergunta?"})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "assistant_unavailable"
    assert response.headers["retry-after"] == "60"
    assert client.get("/api/v1/metadata").json()["assistant_available"] is False


def test_when_every_provider_fails_the_answer_is_503(make_client):
    client = make_client(providers=answering(ProviderError("gemini: HTTP 429")))

    response = client.post(URL, json={"question": "Pergunta?"})

    assert response.status_code == 503


def test_visitor_quota_answers_429_before_calling_the_model(make_client):
    provider = ScriptedProvider("gemini", [text_reply("um"), text_reply("dois"), text_reply("três")])
    client = make_client(providers=[provider], assistant_per_minute=2)

    statuses = [client.post(URL, json={"question": "Pergunta?"}).status_code for _ in range(3)]
    limited = client.post(URL, json={"question": "Pergunta?"})

    assert statuses == [200, 200, 429]
    assert limited.json()["error"]["code"] == "assistant_limit"
    assert 1 <= int(limited.headers["retry-after"]) <= 60
    assert len(provider.requests) == 2
    assert client.get("/api/v1/metadata").json()["assistant_available"] is True


def test_the_question_is_not_written_to_the_logs(make_client, caplog):
    client = make_client(providers=answering(text_reply("Resposta.")))

    with caplog.at_level(logging.DEBUG):
        client.post(URL, json={"question": "Pergunta secreta sobre o Piauí"})

    assert "secreta" not in caplog.text


# --- quota counters --------------------------------------------------------------------------

def test_quota_counts_per_visitor_per_minute_and_per_day():
    now = [0.0]
    quota = AssistantQuota(per_minute=2, per_day=3, global_per_day=100, clock=lambda: now[0])

    quota.consume("a")
    quota.consume("a")
    with pytest.raises(QuotaExceededError) as minute:
        quota.consume("a")
    quota.consume("b")  # other visitors are not affected
    now[0] = 60.0
    quota.consume("a")
    with pytest.raises(QuotaExceededError) as day:
        quota.consume("a")
    now[0] = 86_400.0
    quota.consume("a")

    assert minute.value.scope == "visitor_minute" and minute.value.retry_after == 60
    assert day.value.scope == "visitor_day" and day.value.retry_after == 86_340


def test_quota_has_a_ceiling_for_the_whole_site():
    quota = AssistantQuota(per_minute=10, per_day=10, global_per_day=2, clock=lambda: 0.0)

    quota.consume("a")
    quota.consume("b")
    with pytest.raises(QuotaExceededError) as error:
        quota.consume("c")

    assert error.value.scope == "site"
