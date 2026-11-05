"""The provider adapters against recorded HTTP exchanges (no network, no key)."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr

from api.app.assistant.conversation import ModelReply, ProviderError, ToolCall, ToolOutput, UserTurn
from api.app.assistant.providers import GeminiProvider, OpenAICompatibleProvider, build_providers
from api.tests.conftest import make_settings

TOOLS = [{"name": "yearly_totals", "description": "Totals per year.", "parameters": {"type": "object", "properties": {}}}]


def mock_client(answer: Callable[[httpx2.Request], httpx2.Response]) -> tuple[httpx2.Client, list[httpx2.Request]]:
    requests: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append(request)
        return answer(request)

    return httpx2.Client(transport=httpx2.MockTransport(handler)), requests


def body(request: httpx2.Request) -> dict[str, Any]:
    return json.loads(request.content)


# --- Gemini ----------------------------------------------------------------------------------

GEMINI_CALL = {"candidates": [{"content": {"role": "model", "parts": [
    {"text": "thinking...", "thought": True},
    {"functionCall": {"id": "fc1", "name": "yearly_totals", "args": {"state": "PI"}}, "thoughtSignature": "sig"},
]}}]}


def test_gemini_request_carries_key_in_header_instructions_and_tools():
    client, requests = mock_client(lambda _: httpx2.Response(200, json=GEMINI_CALL))

    reply = GeminiProvider(client, "secret-key", "gemini-3.6-flash").complete("rules", [UserTurn("Pergunta?")], TOOLS)

    sent = requests[0]
    assert str(sent.url).endswith("/models/gemini-3.6-flash:generateContent")
    assert "secret-key" not in str(sent.url)
    assert sent.headers["x-goog-api-key"] == "secret-key"
    assert body(sent)["systemInstruction"] == {"parts": [{"text": "rules"}]}
    assert body(sent)["tools"] == [{"functionDeclarations": TOOLS}]
    assert "toolConfig" not in body(sent)
    assert reply.tool_calls == (ToolCall("fc1", "yearly_totals", {"state": "PI"}),)
    assert reply.text == ""  # thoughts are not part of the answer


def test_gemini_replays_its_own_turn_and_groups_the_tool_answers():
    client, requests = mock_client(lambda _: httpx2.Response(200, json={
        "candidates": [{"content": {"role": "model", "parts": [{"text": "Resposta."}]}}]
    }))
    provider = GeminiProvider(client, "k", "m")
    calls = (ToolCall("fc1", "yearly_totals", {}), ToolCall("", "state_ranking", {}))
    model_turn = ModelReply("", calls, GEMINI_CALL["candidates"][0]["content"])
    turns = [UserTurn("?"), model_turn, ToolOutput(calls[0], {"data": [1]}), ToolOutput(calls[1], {"data": [2]})]

    reply = provider.complete("rules", turns, TOOLS, allow_tools=False)

    contents = body(requests[-1])["contents"]
    assert contents[1] == GEMINI_CALL["candidates"][0]["content"]  # signatures go back untouched
    assert contents[2] == {"role": "user", "parts": [
        {"functionResponse": {"name": "yearly_totals", "response": {"data": [1]}, "id": "fc1"}},
        {"functionResponse": {"name": "state_ranking", "response": {"data": [2]}}},
    ]}
    assert body(requests[-1])["toolConfig"] == {"functionCallingConfig": {"mode": "NONE"}}
    assert reply.text == "Resposta."


@pytest.mark.parametrize(
    "response",
    [
        httpx2.Response(429, json={"error": {"message": "quota exceeded for key secret-key"}}),
        httpx2.Response(500, text="oops"),
        httpx2.Response(200, text="not json"),
        httpx2.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}}),
    ],
)
def test_gemini_failures_become_provider_errors_without_the_body(response):
    client, _ = mock_client(lambda _: response)

    with pytest.raises(ProviderError) as error:
        GeminiProvider(client, "secret-key", "m").complete("rules", [UserTurn("?")], TOOLS)
    assert "secret-key" not in str(error.value)


def test_network_errors_become_provider_errors():
    def fail(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectTimeout("timed out", request=request)

    client, _ = mock_client(fail)

    with pytest.raises(ProviderError, match="ConnectTimeout"):
        GeminiProvider(client, "k", "m").complete("rules", [UserTurn("?")], TOOLS)


# --- OpenAI-compatible (Groq, Cloudflare) ---------------------------------------------------

OPENAI_CALL = {"choices": [{"message": {
    "role": "assistant", "content": None, "reasoning": "internal",
    "tool_calls": [{"id": "c1", "type": "function",
                    "function": {"name": "yearly_totals", "arguments": "{\"state\": \"PI\"}"}}],
}}]}


def test_openai_compatible_request_and_tool_round_trip():
    client, requests = mock_client(lambda _: httpx2.Response(200, json=OPENAI_CALL))
    provider = OpenAICompatibleProvider(client, "groq", "https://api.groq.com/openai/v1", "gsk-secret", "llama")

    reply = provider.complete("rules", [UserTurn("Piauí?")], TOOLS)
    provider.complete("rules", [UserTurn("Piauí?"), reply, ToolOutput(reply.tool_calls[0], {"data": []})], TOOLS,
                      allow_tools=False)

    first, second = body(requests[0]), body(requests[1])
    assert str(requests[0].url) == "https://api.groq.com/openai/v1/chat/completions"
    assert requests[0].headers["authorization"] == "Bearer gsk-secret"
    assert first["messages"][0] == {"role": "system", "content": "rules"}
    assert first["tools"] == [{"type": "function", "function": TOOLS[0]}]
    assert first["tool_choice"] == "auto" and second["tool_choice"] == "none"
    assert reply.tool_calls == (ToolCall("c1", "yearly_totals", {"state": "PI"}),)
    assert second["messages"][2] == {  # extra fields such as "reasoning" are not sent back
        "role": "assistant", "content": None, "tool_calls": OPENAI_CALL["choices"][0]["message"]["tool_calls"],
    }
    assert second["messages"][3] == {"role": "tool", "tool_call_id": "c1", "name": "yearly_totals",
                                     "content": "{\"data\": []}"}


def test_openai_compatible_unreadable_arguments_are_a_provider_error():
    broken = json.loads(json.dumps(OPENAI_CALL))
    broken["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"] = "{state: PI"
    client, _ = mock_client(lambda _: httpx2.Response(200, json=broken))

    with pytest.raises(ProviderError, match="unreadable"):
        OpenAICompatibleProvider(client, "groq", "https://x", "k", "m").complete("rules", [UserTurn("?")], TOOLS)


# --- configuration ---------------------------------------------------------------------------

def test_only_providers_with_credentials_are_used_in_the_configured_order():
    client = httpx2.Client()
    settings = make_settings(
        assistant_providers="groq, gemini, cloudflare",
        gemini_api_key=SecretStr("g"),
        groq_api_key=SecretStr("q"),
        cloudflare_account_id=None,
        cloudflare_api_token=SecretStr("c"),
    )

    assert [provider.name for provider in build_providers(settings, client)] == ["groq", "gemini"]
    assert build_providers(make_settings(), client) == []


def test_cloudflare_needs_a_valid_account_id():
    client = httpx2.Client()
    good = make_settings(cloudflare_account_id="0123456789abcdef0123456789abcdef", cloudflare_api_token=SecretStr("c"))
    bad = make_settings(cloudflare_account_id="../../other", cloudflare_api_token=SecretStr("c"))

    assert [provider.name for provider in build_providers(good, client)] == ["cloudflare"]
    with pytest.raises(ValueError, match="CLOUDFLARE_ACCOUNT_ID"):
        build_providers(bad, client)


def test_provider_keys_do_not_appear_in_the_settings_text():
    settings = make_settings(gemini_api_key=SecretStr("AIza-secret"), groq_api_key=SecretStr("gsk-secret"))

    assert "AIza-secret" not in repr(settings) and "gsk-secret" not in repr(settings)
