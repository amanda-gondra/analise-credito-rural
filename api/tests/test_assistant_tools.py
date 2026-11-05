"""The assistant's tools: same validation, same queries and same shape as the routes."""

from __future__ import annotations

import json
from decimal import Decimal

import pytest

from api.app.assistant.scope import MESSAGES, TOPICS, out_of_scope_message
from api.app.assistant.tools import DECLARATIONS, OUT_OF_SCOPE_TOOL, TOOLS, ToolArgumentError, run_tool
from api.tests.conftest import FakeDatabase

PERIOD = {"first_year": 2017, "last_year": 2025}
PROGRAMS = [
    {"program_name": "ABC + \"PROGRAMA PARA A ADAPTAÇÃO À MUDANÇA DO CLIMA\""},
    {"program_name": "FNO-ABC (PROG FINANC AGRICULTURA BAIXO CARBONO) ENCERRADO"},
    {"program_name": "FUNCAFÉ (PROGRAMA DE DEFESA DA ECONOMIA CAFEEIRA)"},
    {"program_name": "PRONAF - PROGRAMA NACIONAL DE FORTALECIMENTO DA AGRICULTURA FAMILIAR"},
    {"program_name": "PRONAMP - PROGRAMA NACIONAL DE APOIO AO MÉDIO PRODUTOR RURAL"},
]


@pytest.mark.parametrize(
    ("tool", "arguments", "query", "params", "panel"),
    [
        ("yearly_totals", {"state": "pi", "activity": "livestock"}, "yearly_totals",
         {**PERIOD, "state_abbr": "PI", "activity_code": "2", "purpose": None},
         "/estados/PI?start_year=2017&end_year=2025&activity=livestock"),
        ("yearly_totals", {}, "yearly_totals",
         {**PERIOD, "state_abbr": None, "activity_code": None, "purpose": None}, "/?start_year=2017&end_year=2025"),
        ("state_ranking", {"start_year": 2024, "end_year": 2024}, "state_ranking",
         {"first_year": 2024, "last_year": 2024, "activity_code": None, "purpose": None},
         "/?start_year=2024&end_year=2024"),
        ("compare_states", {"states": ["PI", "CE"]}, "states_yearly", {**PERIOD, "state_abbrs": ["PI", "CE"]},
         "/comparar?start_year=2017&end_year=2025&states=PI%2CCE"),
        ("matopiba_yearly", {}, "matopiba_yearly", PERIOD, "/matopiba?start_year=2017&end_year=2025"),
        ("seasonality", {"purpose": "custeio"}, "seasonality", {**PERIOD, "state_abbr": None, "purpose": "custeio"},
         "/?start_year=2017&end_year=2025&purpose=custeio"),
        ("funding_source_ranking", {"state": "MT"}, "funding_source_ranking", {**PERIOD, "state_abbr": "MT"},
         "/dados?start_year=2017&end_year=2025&state=MT"),
    ],
)
def test_a_tool_runs_the_query_of_its_route(tool, arguments, query, params, panel):
    database = FakeDatabase()

    result = run_tool(tool, arguments, database)

    assert database.calls == [(query, params)]
    assert result.tool == tool
    assert result.panel_path == panel
    assert result.data == []


def test_rows_reach_the_model_with_the_api_names():
    database = FakeDatabase({"activity_split": [{
        "reference_year": 2025, "activity_code": "1", "activity_label": "AGRÍCOLA",
        "amount_nominal": Decimal("1.50"), "amount_real": Decimal("1.60"), "contracts": 2, "share_pct": Decimal("50"),
    }]})

    result = run_tool("activity_split", {}, database)

    assert result.data == [{
        "year": 2025, "activity": "agricultural", "amount_nominal": 1.5, "amount_real": 1.6,
        "contracts": 2, "share_pct": 50.0,
    }]
    json.dumps(result.data)  # what goes to the model must be plain JSON


def test_profile_tool_uses_the_same_service_as_the_route():
    database = FakeDatabase()

    result = run_tool("state_profile", {"state": "ba"}, database)

    assert [name for name, _ in database.calls] == ["state_ranking", "yearly_totals", "activity_split", "purpose_split"]
    assert result.data["state"] == "BA"
    assert result.panel_path == "/estados/BA?start_year=2017&end_year=2025"


@pytest.mark.parametrize(
    ("tool", "arguments", "problem"),
    [
        ("yearly_totals", {"state": "XX"}, "state"),
        ("yearly_totals", {"start_year": 2030}, "start_year"),
        ("yearly_totals", {"municipality": "Teresina"}, "municipality"),
        ("compare_states", {"states": ["PI"]}, "states"),
        ("state_profile", {}, "state"),
        ("average_contract_value", {"state": "PI", "region": "nordeste"}, "use state or region"),
        ("run_sql", {"query": "SELECT 1"}, "unknown tool"),
    ],
)
def test_invalid_arguments_become_a_message_for_the_model_and_no_query_runs(tool, arguments, problem):
    database = FakeDatabase()

    with pytest.raises(ToolArgumentError, match=problem):
        run_tool(tool, arguments, database)
    assert database.calls == []


@pytest.mark.parametrize(
    ("wanted", "resolved"),
    [
        ("Pronaf", "PRONAF - PROGRAMA NACIONAL DE FORTALECIMENTO DA AGRICULTURA FAMILIAR"),
        ("pronamp", "PRONAMP - PROGRAMA NACIONAL DE APOIO AO MÉDIO PRODUTOR RURAL"),
        ("Funcafe", "FUNCAFÉ (PROGRAMA DE DEFESA DA ECONOMIA CAFEEIRA)"),
        ("ABC", "ABC + \"PROGRAMA PARA A ADAPTAÇÃO À MUDANÇA DO CLIMA\""),
    ],
)
def test_short_program_names_are_resolved_to_the_published_name(wanted, resolved):
    database = FakeDatabase({"program_names": PROGRAMS})

    result = run_tool("average_contract_value", {"program": wanted}, database)

    assert database.calls[-1][1]["program_name"] == resolved
    assert result.filters["program"] == resolved


@pytest.mark.parametrize(("wanted", "problem"), [("PRON", "ambiguous"), ("Inovagro", "not found")])
def test_unknown_or_ambiguous_programs_list_the_options(wanted, problem):
    database = FakeDatabase({"program_names": PROGRAMS})

    with pytest.raises(ToolArgumentError, match=problem):
        run_tool("average_contract_value", {"program": wanted}, database)
    assert [name for name, _ in database.calls] == ["program_names"]


def test_declarations_cover_every_tool_in_the_subset_all_providers_accept():
    names = [declaration["name"] for declaration in DECLARATIONS]
    text = json.dumps(DECLARATIONS)

    assert names == [*TOOLS, OUT_OF_SCOPE_TOOL]
    assert "$ref" not in text and "anyOf" not in text and "title" not in text
    for declaration in DECLARATIONS:
        assert declaration["parameters"]["type"] == "object"
        assert len(declaration["description"]) > 40


def test_every_out_of_scope_topic_has_a_fixed_message_without_numbers():
    assert set(MESSAGES) == set(TOPICS)
    assert out_of_scope_message("forecast") == MESSAGES["forecast"]
    assert out_of_scope_message("something else") == MESSAGES["other"]
    assert out_of_scope_message(None) == MESSAGES["other"]
    for message in MESSAGES.values():
        assert "R$" not in message and "%" not in message
