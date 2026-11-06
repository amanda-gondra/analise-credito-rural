"""How each answer of the evaluation set is judged. Pure functions, tested without a model.

Three checks:
    * tool: did the assistant call the expected tool with the expected filters?
      (any_of lists the acceptable choices; only the filters written in the case are compared)
    * grounding: is every number written in the answer a correct rounding of a value the
      tools returned? "R$ 4,6 bilhões" is accepted for 4.593.570.702,79 because 4,6 is that
      value rounded to the digit shown; "R$ 4,7 bilhões" is not. Years are not checked.
    * refusal: an out-of-scope question must get the fixed text of the right topic.

A case passes only if every check that applies to it passes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Final

from api.app.assistant.agent import AssistantAnswer
from api.app.assistant.scope import MESSAGES

_NUMBER: Final = re.compile(
    r"(?<![\w.,])(?P<int>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?P<dec>\d+))?"
    r"(?:\s*(?P<unit>%|bilh(?:ão|ões|ao|oes)\b|bi\b|milh(?:ão|ões|ao|oes)\b|mi\b|mil\b))?",
    re.IGNORECASE,
)
# Checked in this order: "milhões" starts with "mil", and "mil" starts with "mi".
_SCALE: Final = (("bilh", 1e9), ("bi", 1e9), ("milh", 1e6), ("mil", 1e3), ("mi", 1e6))


@dataclass(frozen=True)
class WrittenNumber:
    text: str
    value: float
    tolerance: float  # half of the last digit shown, in the same unit as value


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
    seconds: float = 0.0
    error: str | None = None


def _scale(unit: str | None) -> float:
    if not unit or unit == "%":
        return 1.0
    unit = unit.casefold()
    return next(value for prefix, value in _SCALE if unit.startswith(prefix))


def written_numbers(text: str) -> list[WrittenNumber]:
    """Numbers in Brazilian format, with their scale ("4,6 bilhões" -> 4.6e9), years left out."""
    numbers = []
    for match in _NUMBER.finditer(text):
        integer, decimals, unit = match["int"], match["dec"], match["unit"]
        plain = integer.replace(".", "")
        if not decimals and not unit and "." not in integer and 1990 <= int(plain) <= 2100:
            continue  # a year
        scale = _scale(unit)
        value = float(f"{plain}.{decimals}" if decimals else plain) * scale
        step = (10 ** -len(decimals) if decimals else 1) * scale
        numbers.append(WrittenNumber(match.group(0).strip(), value, step / 2))
    return numbers


def _leaves(data: Any) -> tuple[list[float], list[str]]:
    numbers: list[float] = []
    texts: list[str] = []
    stack = [data]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            stack.extend(item.values())
        elif isinstance(item, list | tuple):
            stack.extend(item)
        elif isinstance(item, bool) or item is None:
            continue
        elif isinstance(item, int | float):
            numbers.append(abs(float(item)))
        elif isinstance(item, str):
            texts.append(item)
    return numbers, texts


def ungrounded_numbers(answer: str, data: Any) -> list[str]:
    """Numbers of the answer that are not a rounding of any value in the data."""
    values, texts = _leaves(data)
    # Names copied from the data ("MCR 6.2", "RES. 4.147") are not figures of the answer.
    for name in sorted(texts, key=len, reverse=True):
        if len(name) >= 6:
            answer = re.sub(re.escape(name), " ", answer, flags=re.IGNORECASE)
    return [
        number.text
        for number in written_numbers(answer)
        if not any(abs(number.value - value) <= number.tolerance + 1e-9 * value for value in values)
    ]


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
