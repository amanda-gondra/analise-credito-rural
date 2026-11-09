"""The check the agent runs on every answer before it leaves (grounding.py), without a model.

The rounding rules themselves are covered with the evaluation set (test_evaluation_checks.py),
which uses the same functions.
"""

from __future__ import annotations

import pytest

from api.app.assistant.grounding import ungrounded_numbers

RANKING = [{"position": 15, "state": "PI", "amount_real": 4656234772.07, "share_pct": 1.24}]


def test_ordinals_and_counts_of_the_domain_are_not_checked():
    answer = "O Piauí ficou em 15º lugar entre as 27 UFs, com 1,2% do total nos 12 meses."

    assert ungrounded_numbers(answer, RANKING) == []


@pytest.mark.parametrize(
    ("answer", "wrong"),
    [
        ("Ficou com 2% do total.", ["2%"]),  # a percentage has a unit: always checked
        ("Foram R$ 15 bilhões.", ["15 bilhões"]),  # money has a scale: always checked
        ("Foram 32 contratos.", ["32"]),  # above the small counts of the domain
        ("Foram 4,7 bilhões em valores de dezembro de 2025.", []),
    ],
)
def test_money_percentages_and_larger_numbers_are_always_checked(answer, wrong):
    assert ungrounded_numbers(answer, RANKING) == wrong
