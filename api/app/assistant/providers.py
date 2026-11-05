"""Language model providers (decision D18), all on free plans and called over HTTPS.

    GeminiProvider            Google Gemini, native generateContent format
    OpenAICompatibleProvider  the chat/completions format, used by Groq and Cloudflare Workers AI

Keys travel only in request headers, never in URLs or logs. Any failure (limit reached,
timeout, server error, unreadable answer) becomes ProviderError, and the agent moves on
to the next provider. Error messages carry the HTTP status only: provider error bodies
are not copied anywhere.
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from typing import Any, Final
from urllib.parse import quote

import httpx2

from api.app.assistant.conversation import ModelReply, ProviderError, ToolCall, ToolOutput, Turn, UserTurn
from api.app.config import Settings

GEMINI_URL: Final = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GROQ_URL: Final = "https://api.groq.com/openai/v1"
CLOUDFLARE_URL: Final = "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1"
_ACCOUNT_ID: Final = re.compile(r"^[0-9a-f]{32}$")


def _post(client: httpx2.Client, provider: str, url: str, headers: dict[str, str], body: dict[str, Any]) -> Any:
    try:
        response = client.post(url, headers=headers, json=body)
    except httpx2.HTTPError as error:
        raise ProviderError(f"{provider}: {type(error).__name__}") from error
    if response.status_code >= 400:
        raise ProviderError(f"{provider}: HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError as error:
        raise ProviderError(f"{provider}: response is not JSON") from error


class GeminiProvider:
    name = "gemini"

    def __init__(self, client: httpx2.Client, api_key: str, model: str) -> None:
        self._client = client
        self._headers = {"x-goog-api-key": api_key}
        self._url = GEMINI_URL.format(model=quote(model, safe=".-_"))

    def complete(
        self,
        system: str,
        turns: Sequence[Turn],
        tools: Sequence[dict[str, Any]],
        *,
        allow_tools: bool = True,
    ) -> ModelReply:
        body: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": self._contents(turns),
            "tools": [{"functionDeclarations": list(tools)}],
        }
        if not allow_tools:
            body["toolConfig"] = {"functionCallingConfig": {"mode": "NONE"}}
        data = _post(self._client, self.name, self._url, self._headers, body)
        try:
            content = data["candidates"][0]["content"]
            parts = content.get("parts", [])
        except (KeyError, IndexError, TypeError, AttributeError) as error:
            raise ProviderError("gemini: answer without content") from error
        text = "".join(part["text"] for part in parts if "text" in part and not part.get("thought"))
        calls = tuple(
            ToolCall(
                id=part["functionCall"].get("id", ""),
                name=part["functionCall"]["name"],
                arguments=part["functionCall"].get("args") or {},
            )
            for part in parts
            if "functionCall" in part
        )
        return ModelReply(text=text, tool_calls=calls, raw=content)

    @staticmethod
    def _contents(turns: Sequence[Turn]) -> list[dict[str, Any]]:
        contents: list[dict[str, Any]] = []
        for turn in turns:
            if isinstance(turn, UserTurn):
                contents.append({"role": "user", "parts": [{"text": turn.text}]})
            elif isinstance(turn, ToolOutput):
                response: dict[str, Any] = {"name": turn.call.name, "response": turn.content}
                if turn.call.id:
                    response["id"] = turn.call.id
                part = {"functionResponse": response}
                # Answers to the calls of one model turn travel together in one user turn.
                if contents and contents[-1]["role"] == "user" and "functionResponse" in contents[-1]["parts"][0]:
                    contents[-1]["parts"].append(part)
                else:
                    contents.append({"role": "user", "parts": [part]})
            else:
                contents.append(turn.raw)
        return contents


class OpenAICompatibleProvider:
    def __init__(self, client: httpx2.Client, name: str, base_url: str, api_key: str, model: str) -> None:
        self.name = name
        self._client = client
        self._url = f"{base_url}/chat/completions"
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._model = model

    def complete(
        self,
        system: str,
        turns: Sequence[Turn],
        tools: Sequence[dict[str, Any]],
        *,
        allow_tools: bool = True,
    ) -> ModelReply:
        body = {
            "model": self._model,
            "messages": [{"role": "system", "content": system}, *self._messages(turns)],
            "tools": [{"type": "function", "function": tool} for tool in tools],
            "tool_choice": "auto" if allow_tools else "none",
            "temperature": 0,
        }
        data = _post(self._client, self.name, self._url, self._headers, body)
        try:
            message = data["choices"][0]["message"]
            calls = tuple(
                ToolCall(
                    id=call["id"],
                    name=call["function"]["name"],
                    arguments=json.loads(call["function"].get("arguments") or "{}"),
                )
                for call in message.get("tool_calls") or ()
            )
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise ProviderError(f"{self.name}: unreadable answer") from error
        # Only the standard fields go back: some models add extra ones that others refuse.
        raw: dict[str, Any] = {"role": "assistant", "content": message.get("content")}
        if message.get("tool_calls"):
            raw["tool_calls"] = message["tool_calls"]
        return ModelReply(text=message.get("content") or "", tool_calls=calls, raw=raw)

    @staticmethod
    def _messages(turns: Sequence[Turn]) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        for turn in turns:
            if isinstance(turn, UserTurn):
                messages.append({"role": "user", "content": turn.text})
            elif isinstance(turn, ToolOutput):
                messages.append({
                    "role": "tool",
                    "tool_call_id": turn.call.id,
                    "name": turn.call.name,
                    "content": json.dumps(turn.content, ensure_ascii=False),
                })
            else:
                messages.append(turn.raw)
        return messages


def build_providers(settings: Settings, client: httpx2.Client) -> list[GeminiProvider | OpenAICompatibleProvider]:
    """The providers with credentials, in the order of ASSISTANT_PROVIDERS."""
    providers: list[GeminiProvider | OpenAICompatibleProvider] = []
    for name in settings.assistant_providers:
        if name == "gemini" and settings.gemini_api_key:
            providers.append(GeminiProvider(client, settings.gemini_api_key.get_secret_value(), settings.gemini_model))
        elif name == "groq" and settings.groq_api_key:
            providers.append(OpenAICompatibleProvider(
                client, "groq", GROQ_URL, settings.groq_api_key.get_secret_value(), settings.groq_model
            ))
        elif name == "cloudflare" and settings.cloudflare_api_token and settings.cloudflare_account_id:
            if not _ACCOUNT_ID.fullmatch(settings.cloudflare_account_id):
                raise ValueError("CLOUDFLARE_ACCOUNT_ID must be the 32-character account id")
            providers.append(OpenAICompatibleProvider(
                client,
                "cloudflare",
                CLOUDFLARE_URL.format(account=settings.cloudflare_account_id),
                settings.cloudflare_api_token.get_secret_value(),
                settings.cloudflare_model,
            ))
    return providers
