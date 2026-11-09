"""How each answer of the evaluation set is judged. Pure functions, tested without a model.

Three checks:
    * tool: did the assistant call the expected tool with the expected filters?
      (any_of lists the acceptable choices; only the filters written in the case are compared)
    * grounding: is every number written in the answer a correct rounding of a value the
      tools returned? Same rules as the check the agent runs before answering
      (api/app/assistant/grounding.py), so the set measures what visitors get.
    * refusal: an out-of-scope question must get the fixed text of the right topic.

A case passes only if every check that applies to it passes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from api.app.assistant.agent import AssistantAnswer
from api.app.assistant.grounding import ungrounded_numbers, written_numbers
from api.app.assistant.scope import MESSAGES

__all__ = ["CaseResult", "filters_match", "judge", "ungrounded_numbers", "written_numbers"]


@dataclass
class CaseResult:
    id: str
    category: str
    question: str
    passed: bool
    answer: str = ""
    provider: str = ""
    tools: list[str] = field(default_factory=list)
    tool_ok: bool | None = None
    grounded: bool | None = None
    ungrounded: list[str] = field(default_factory=list)
    refusal_ok: bool | None = None
    rewritten: bool = False
    withheld: bool = False
    seconds: float = 0.0
    error: str | None = None


def filters_match(expected: dict[str, Any], actual: dict[str, Any]) -> bool:
    for key, value in expected.items():
        got = actual.get(key)
        if isinstance(value, list):
            if not isinstance(got, list) or sorted(got) != sorted(value):
                return False
        elif got != value:
            return False
    return True


def judge(case: dict[str, Any], answer: AssistantAnswer | None, seconds: float, error: str | None) -> CaseResult:
    result = CaseResult(case["id"], case["category"], case["question"], passed=False, seconds=seconds, error=error)
    if answer is None:
        return result
    expect = case["expect"]
    result.answer, result.provider = answer.answer, answer.provider
    result.tools = [r.tool for r in answer.results]
    data = [r.data for r in answer.results]

    if "out_of_scope" in expect:
        result.refusal_ok = answer.out_of_scope and answer.answer == MESSAGES[expect["out_of_scope"]]
        result.passed = result.refusal_ok
        return result

    # A withheld answer reaches the visitor as a fixed text without numbers: it fails here with
    # the numbers that failed the agent's check, so the set still counts it.
    result.rewritten, result.withheld = answer.rewritten, bool(answer.unverified)
    if answer.unverified:
        result.ungrounded = list(answer.unverified)
    else:
        result.ungrounded = [] if answer.out_of_scope else ungrounded_numbers(answer.answer, data)
    result.grounded = not result.ungrounded
    if "any_of" in expect:
        result.tool_ok = any(
            r.tool == option["tool"] and filters_match(option.get("filters", {}), r.filters)
            for r in answer.results
            for option in expect["any_of"]
        )
        result.passed = result.tool_ok and result.grounded and not answer.out_of_scope
    else:  # "safe": a refusal, or an answer whose numbers all come from the data
        forbidden = [text for text in expect.get("must_not_contain", []) if text.casefold() in answer.answer.casefold()]
        result.passed = result.grounded and not forbidden
    return result
