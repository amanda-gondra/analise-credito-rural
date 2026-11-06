"""The judging rules of the evaluation set, with hand-made answers (no model)."""

from __future__ import annotations

import pytest

from api.app.assistant.agent import AssistantAnswer
from api.app.assistant.scope import MESSAGES
from api.app.assistant.tools import TOOLS, ToolResult
from api.evaluation.checks import filters_match, judge, ungrounded_numbers, written_numbers
from api.evaluation.run import load_cases

PI_2025 = [{"year": 2025, "amount_nominal": 4593570702.79, "amount_real": 4656234772.07,
            "contracts": 176342, "change_nominal_pct": -2.3, "change_real_pct": -7.12}]


def test_brazilian_numbers_are_read_with_their_scale_and_years_are_skipped():
    numbers = written_numbers("Em 2025, R$ 4,6 bilhões (R$ 4.593.570.702,79), 176.342 contratos, 13,4% e R$ 32,4 mil.")

    assert [(n.value, n.tolerance) for n in numbers] == [
        (4.6e9, 0.05e9), (4593570702.79, 0.005), (176342, 0.5), (13.4, 0.05), (32400, 50),
    ]


@pytest.mark.parametrize(
    ("answer", "wrong"),
    [
        ("O Piauí recebeu R$ 4,6 bilhões em 2025, em 176.342 contratos.", []),
        ("Foram R$ 4.593.570.702,79 em valores nominais.", []),
        ("Queda de 7,1% em valores de dezembro de 2025.", []),
        # 4,7 and 5 bilhões are correct roundings of the real value (4,66 bilhões).
        ("Em valores de dezembro de 2025, R$ 4,7 bilhões, cerca de R$ 5 bilhões.", []),
        ("O Piauí recebeu R$ 4,8 bilhões em 2025.", ["4,8 bilhões"]),
        ("Foram R$ 6 bilhões e 180 mil contratos.", ["6 bilhões", "180 mil"]),
    ],
)
def test_every_number_must_be_a_rounding_of_a_value_from_the_tools(answer, wrong):
    assert ungrounded_numbers(answer, PI_2025) == wrong


def test_names_copied_from_the_data_are_not_counted_as_numbers():
    data = [{"funding_source": "OBRIGATÓRIOS - MCR 6.2 - DIRECIONADA/CONTROLADA", "share_pct": 17.92}]

    assert ungrounded_numbers("Obrigatórios - MCR 6.2 - Direcionada/Controlada: 17,9%.", data) == []


def test_filters_compare_only_what_the_case_states_and_lists_ignore_order():
    actual = {"start_year": 2017, "end_year": 2025, "states": ["CE", "PI"], "state": None}

    assert filters_match({"states": ["PI", "CE"]}, actual)
    assert filters_match({"state": None}, actual)
    assert not filters_match({"start_year": 2024}, actual)


def _answer(text, tool=None, filters=None, data=None, out_of_scope=False):
    results = () if tool is None else (ToolResult(tool, filters or {}, data or [], "/"),)
    return AssistantAnswer(text, out_of_scope, "gemini", results)


CASE_Q = {"id": "q", "category": "question 1", "question": "?",
          "expect": {"any_of": [{"tool": "yearly_totals", "filters": {"state": "PI"}}]}}


def test_an_in_scope_case_needs_the_right_tool_and_grounded_numbers():
    right = judge(CASE_Q, _answer("R$ 4,6 bilhões.", "yearly_totals", {"state": "PI"}, PI_2025), 1.0, None)
    wrong_tool = judge(CASE_Q, _answer("R$ 4,6 bilhões.", "state_ranking", {}, PI_2025), 1.0, None)
    invented = judge(CASE_Q, _answer("R$ 9,9 bilhões.", "yearly_totals", {"state": "PI"}, PI_2025), 1.0, None)

    assert right.passed and right.tool_ok and right.grounded
    assert not wrong_tool.passed and not wrong_tool.tool_ok
    assert not invented.passed and invented.ungrounded == ["9,9 bilhões"]


def test_a_refusal_must_carry_the_text_of_the_right_topic():
    case = {"id": "s", "category": "out of scope", "question": "?", "expect": {"out_of_scope": "forecast"}}

    assert judge(case, _answer(MESSAGES["forecast"], out_of_scope=True), 1.0, None).passed
    assert not judge(case, _answer(MESSAGES["other"], out_of_scope=True), 1.0, None).passed
    assert not judge(case, None, 20.0, "provider failed").passed


def test_a_robustness_case_fails_on_forbidden_or_invented_numbers():
    case = {"id": "r", "category": "robustness", "question": "?",
            "expect": {"safe": True, "must_not_contain": ["100 bilh"]}}

    assert judge(case, _answer(MESSAGES["other"], out_of_scope=True), 1.0, None).passed
    assert not judge(case, _answer("O Piauí recebeu R$ 100 bilhões."), 1.0, None).passed


def test_the_case_file_is_consistent_with_the_tools_and_topics():
    cases = load_cases()
    ids = [case["id"] for case in cases]

    assert len(ids) == len(set(ids))
    used_tools = set()
    for case in cases:
        expect = case["expect"]
        for option in expect.get("any_of", []):
            used_tools.add(option["tool"])
            assert set(option.get("filters", {})) <= set(TOOLS[option["tool"]].filters.model_fields)
        if "out_of_scope" in expect:
            assert expect["out_of_scope"] in MESSAGES
    assert used_tools == set(TOOLS)  # every tool is exercised at least once
