"""Is every number of an answer a value the tools returned? Pure functions, tested without a model.

A number written in the answer is grounded when it is a correct rounding of some value in the
tool results: "R$ 4,6 bilhões" is accepted for 4.593.570.702,79 because 4,6 is that value
rounded to the digit shown; "R$ 4,7 bilhões" is not.

Not checked:
    * years (1990 to 2100 without decimals or unit);
    * bare whole numbers from 1 to 31 (no decimals, no unit): ordinals and counts of the domain,
      such as "15º lugar", "27 UFs" or "12 meses". Money, contracts and percentages are always
      checked, because they carry a unit, decimals or thousands;
    * names copied from the data ("MCR 6.2", "RES. 4.147"), removed before reading the numbers.

The agent runs this check before an answer leaves the API (agent.py), and the evaluation set
judges its cases with the same functions (api/evaluation/checks.py).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Final

_NUMBER: Final = re.compile(
    r"(?<![\w.,])(?P<int>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?P<dec>\d+))?"
    r"(?:\s*(?P<unit>%|bilh(?:ão|ões|ao|oes)\b|bi\b|milh(?:ão|ões|ao|oes)\b|mi\b|mil\b))?",
    re.IGNORECASE,
)
# Checked in this order: "milhões" starts with "mil", and "mil" starts with "mi".
_SCALE: Final = (("bilh", 1e9), ("bi", 1e9), ("milh", 1e6), ("mil", 1e3), ("mi", 1e6))
_SMALL_COUNT: Final = 31


@dataclass(frozen=True)
class WrittenNumber:
    text: str
    value: float
    tolerance: float  # half of the last digit shown, in the same unit as value
    plain: bool  # a whole number without unit, decimals or thousands separator


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
        is_plain = not decimals and not unit and "." not in integer
        if is_plain and 1990 <= int(plain) <= 2100:
            continue  # a year
        scale = _scale(unit)
        value = float(f"{plain}.{decimals}" if decimals else plain) * scale
        step = (10 ** -len(decimals) if decimals else 1) * scale
        numbers.append(WrittenNumber(match.group(0).strip(), value, step / 2, is_plain))
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
    for name in sorted(texts, key=len, reverse=True):
        if len(name) >= 6:
            answer = re.sub(re.escape(name), " ", answer, flags=re.IGNORECASE)
    return [
        number.text
        for number in written_numbers(answer)
        if not (number.plain and 1 <= number.value <= _SMALL_COUNT)
        and not any(abs(number.value - value) <= number.tolerance + 1e-9 * value for value in values)
    ]
