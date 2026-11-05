"""The assistant's loop: the model picks tools, the tools read the database, the model writes.

    1. the question goes to the first provider, with the instructions and the tool list;
    2. each tool call is validated and run like the matching route (tools.py);
    3. the results go back and the model writes the answer, or asks for more tools;
    4. after MAX_ROUNDS of tools the model must answer with what it has.

A call to explain_out_of_scope ends the loop with the fixed text of the topic (scope.py),
without a second call to the model. If a provider fails at any point, the whole question
starts again with the next provider; if all fail, AssistantUnavailableError (503), and the
panel keeps working because it does not depend on the model.

Logged: provider, tools, rounds and duration. Never the question or the answer.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final

from api.app.assistant.conversation import ModelReply, Provider, ProviderError, ToolOutput, Turn, UserTurn
from api.app.assistant.prompt import SYSTEM_PROMPT
from api.app.assistant.scope import out_of_scope_message
from api.app.assistant.tools import DECLARATIONS, OUT_OF_SCOPE_TOOL, ToolArgumentError, ToolResult, run_tool
from api.app.database import QueryRunner

logger = logging.getLogger("rural_credit_api.assistant")

MAX_ROUNDS: Final = 3  # rounds of tool calls before the model must answer
MAX_CALLS_PER_ROUND: Final = 3


class AssistantUnavailableError(Exception):
    """No provider is configured, or every provider failed for this question."""


@dataclass(frozen=True)
class AssistantAnswer:
    answer: str
    out_of_scope: bool
    provider: str
    results: tuple[ToolResult, ...]


class Assistant:
    def __init__(self, providers: Sequence[Provider]) -> None:
        self._providers = tuple(providers)

    @property
    def available(self) -> bool:
        return bool(self._providers)

    def ask(self, question: str, database: QueryRunner) -> AssistantAnswer:
        for provider in self._providers:
            started = time.perf_counter()
            try:
                answer = self._conversation(provider, question, database)
            except ProviderError as error:
                logger.warning("provider failed: %s", error)
                continue
            logger.info(
                "answered: provider=%s tools=%s out_of_scope=%s duration_ms=%.0f",
                provider.name,
                ",".join(result.tool for result in answer.results) or "-",
                answer.out_of_scope,
                1000 * (time.perf_counter() - started),
            )
            return answer
        raise AssistantUnavailableError

    def _conversation(self, provider: Provider, question: str, database: QueryRunner) -> AssistantAnswer:
        turns: list[Turn] = [UserTurn(question)]
        results: list[ToolResult] = []
        for round_number in range(MAX_ROUNDS + 1):
            reply = provider.complete(
                SYSTEM_PROMPT, turns, DECLARATIONS, allow_tools=round_number < MAX_ROUNDS
            )
            if not reply.tool_calls:
                if not reply.text.strip():
                    raise ProviderError(f"{provider.name}: empty answer")
                return AssistantAnswer(reply.text.strip(), False, provider.name, tuple(results))
            refusal = next((call for call in reply.tool_calls if call.name == OUT_OF_SCOPE_TOOL), None)
            if refusal is not None:
                return AssistantAnswer(out_of_scope_message(refusal.arguments.get("topic")), True, provider.name, ())
            turns.append(reply)
            turns.extend(self._run_calls(reply, database, results))
        raise ProviderError(f"{provider.name}: no answer after the tool rounds")

    @staticmethod
    def _run_calls(reply: ModelReply, database: QueryRunner, results: list[ToolResult]) -> list[ToolOutput]:
        """One output per call: providers expect an answer to every call they made."""
        outputs: list[ToolOutput] = []
        for index, call in enumerate(reply.tool_calls):
            if index >= MAX_CALLS_PER_ROUND:
                content = {"error": f"at most {MAX_CALLS_PER_ROUND} tools per turn"}
            else:
                try:
                    result = run_tool(call.name, call.arguments, database)
                except ToolArgumentError as error:
                    content = {"error": str(error)}
                else:
                    results.append(result)
                    content = {"filters": result.filters, "data": result.data}
            outputs.append(ToolOutput(call, content))
        return outputs
