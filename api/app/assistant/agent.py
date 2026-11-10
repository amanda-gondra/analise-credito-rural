"""The assistant's loop: the model picks tools, the tools read the database, the model writes.

    1. the question goes to the first provider, with the instructions and the tool list;
    2. each tool call is validated and run like the matching route (tools.py);
    3. the results go back and the model writes the answer, or asks for more tools;
    4. after MAX_ROUNDS of tools the model must answer with what it has.

When the site sends the screen context (context.py), its line follows the question in the
same user turn, built only from validated words; the visitor's previous question, when sent
for a follow-up, comes before it (compose_message).

A call to explain_out_of_scope ends the loop with the fixed text of the topic (scope.py),
without a second call to the model. If a provider fails at any point, the whole question
starts again with the next provider; if all fail, AssistantUnavailableError (503), and the
panel keeps working because it does not depend on the model.

Before an answer leaves, every number in it must be a rounding of a value the tools returned
(grounding.py). If one is not, the model gets one chance to rewrite with the tool values; if
the rewrite still has such a number, the answer is withheld and the visitor gets a fixed text
(UNVERIFIED_ANSWER) with the sources, so a figure that did not come from the data is never shown.

Logged: provider, tools, page of the context, whether the answer was rewritten or withheld,
and duration. Never the question or the answer.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final

from api.app.assistant.context import ScreenContext
from api.app.assistant.conversation import ModelReply, Provider, ProviderError, ToolOutput, Turn, UserTurn
from api.app.assistant.grounding import ungrounded_numbers
from api.app.assistant.prompt import SYSTEM_PROMPT, rewrite_request
from api.app.assistant.scope import out_of_scope_message
from api.app.assistant.tools import DECLARATIONS, OUT_OF_SCOPE_TOOL, ToolArgumentError, ToolResult, run_tool
from api.app.database import QueryRunner

logger = logging.getLogger("rural_credit_api.assistant")

MAX_ROUNDS: Final = 3  # rounds of tool calls before the model must answer
MAX_CALLS_PER_ROUND: Final = 3

UNVERIFIED_ANSWER: Final = (
    "Não consegui conferir todos os números desta resposta com os dados do Banco Central, "
    "por isso ela não foi mostrada. Tente perguntar de outro jeito ou veja os números no painel."
)


class AssistantUnavailableError(Exception):
    """No provider is configured, or every provider failed for this question."""


def compose_message(question: str, context: ScreenContext | None, previous_question: str | None) -> str:
    """The user turn: the previous question (prompt rule 9), the question, the screen context (rule 8).

    The previous question is the visitor's own text, like the question: it goes on one line and
    without square brackets, so it cannot look like the end of its frame or like a context line.
    """
    parts = []
    if previous_question:
        flat = " ".join(previous_question.split()).replace("[", "(").replace("]", ")")
        parts.append(f"[Previous question of the visitor: {flat}]")
    parts.append(question)
    if context is not None:
        parts.append(context.describe())
    return "\n\n".join(parts)


@dataclass(frozen=True)
class AssistantAnswer:
    answer: str
    out_of_scope: bool
    provider: str
    results: tuple[ToolResult, ...]
    rewritten: bool = False  # the first answer had a number not found in the tool results
    unverified: tuple[str, ...] = ()  # numbers that failed the check again: the answer was withheld


class Assistant:
    def __init__(self, providers: Sequence[Provider]) -> None:
        self._providers = tuple(providers)

    @property
    def available(self) -> bool:
        return bool(self._providers)

    def ask(
        self,
        question: str,
        database: QueryRunner,
        context: ScreenContext | None = None,
        previous_question: str | None = None,
    ) -> AssistantAnswer:
        message = compose_message(question, context, previous_question)
        for provider in self._providers:
            started = time.perf_counter()
            try:
                answer = self._conversation(provider, message, database)
            except ProviderError as error:
                logger.warning("provider failed: %s", error)
                continue
            logger.info(
                "answered: provider=%s tools=%s out_of_scope=%s page=%s follow_up=%s rewritten=%s withheld=%s "
                "duration_ms=%.0f",
                provider.name,
                ",".join(result.tool for result in answer.results) or "-",
                answer.out_of_scope,
                context.page if context is not None else "-",
                previous_question is not None,
                answer.rewritten,
                bool(answer.unverified),
                1000 * (time.perf_counter() - started),
            )
            return answer
        raise AssistantUnavailableError

    def _conversation(self, provider: Provider, message: str, database: QueryRunner) -> AssistantAnswer:
        turns: list[Turn] = [UserTurn(message)]
        results: list[ToolResult] = []
        for round_number in range(MAX_ROUNDS + 1):
            reply = provider.complete(
                SYSTEM_PROMPT, turns, DECLARATIONS, allow_tools=round_number < MAX_ROUNDS
            )
            if not reply.tool_calls:
                return self._checked(provider, turns, reply, tuple(results))
            refusal = next((call for call in reply.tool_calls if call.name == OUT_OF_SCOPE_TOOL), None)
            if refusal is not None:
                return AssistantAnswer(out_of_scope_message(refusal.arguments.get("topic")), True, provider.name, ())
            turns.append(reply)
            turns.extend(self._run_calls(reply, database, results))
        raise ProviderError(f"{provider.name}: no answer after the tool rounds")

    @staticmethod
    def _checked(
        provider: Provider, turns: list[Turn], reply: ModelReply, results: tuple[ToolResult, ...]
    ) -> AssistantAnswer:
        """The written answer, once every number in it is found in the tool results (grounding.py)."""
        text = reply.text.strip()
        if not text:
            raise ProviderError(f"{provider.name}: empty answer")
        data = [result.data for result in results]
        wrong = ungrounded_numbers(text, data)
        if not wrong:
            return AssistantAnswer(text, False, provider.name, results)

        retry = provider.complete(
            SYSTEM_PROMPT, [*turns, reply, UserTurn(rewrite_request(wrong))], DECLARATIONS, allow_tools=False
        )
        rewritten = retry.text.strip()
        still_wrong = ungrounded_numbers(rewritten, data) if rewritten else wrong
        if rewritten and not still_wrong:
            return AssistantAnswer(rewritten, False, provider.name, results, rewritten=True)
        return AssistantAnswer(
            UNVERIFIED_ANSWER, False, provider.name, results, rewritten=True, unverified=tuple(still_wrong)
        )

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
