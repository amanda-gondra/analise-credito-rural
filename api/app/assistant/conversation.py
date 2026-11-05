"""The conversation in a provider-neutral form, and the contract every provider follows.

The agent only knows these types; each provider translates them to its own format
(providers.py). Changing or adding a provider never touches the agent (decision D18).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class UserTurn:
    text: str


@dataclass(frozen=True)
class ModelReply:
    """What the model answered: text, tool calls, or both.

    raw is the message exactly as the provider returned it. It is sent back unchanged in
    the next call, because some providers require it (Gemini returns signatures that must
    come back with its function calls).
    """

    text: str
    tool_calls: tuple[ToolCall, ...]
    raw: Any


@dataclass(frozen=True)
class ToolOutput:
    call: ToolCall
    content: dict[str, Any]


Turn = UserTurn | ModelReply | ToolOutput


class ProviderError(Exception):
    """The provider failed (limit reached, timeout, server error, unreadable answer).
    The agent then moves to the next provider."""


class Provider(Protocol):
    name: str

    def complete(
        self,
        system: str,
        turns: Sequence[Turn],
        tools: Sequence[dict[str, Any]],
        *,
        allow_tools: bool = True,
    ) -> ModelReply: ...
