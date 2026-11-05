"""The closed tools of the assistant (decision D17): one per question of the analysis plan.

A tool is not new code: it takes the same filter model as the matching route (so the same
validation), runs the same named query (or the same service, for the state profile) and
shapes the rows with the same response model. The number the assistant reads is therefore
the number the panel shows. The model never writes SQL and never sees the database.

Each result carries panel_path, the page of the site with the same filters (D17), so the
visitor can check the answer on the chart.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Final
from urllib.parse import urlencode

from pydantic import BaseModel, TypeAdapter, ValidationError

from api.app.assistant.scope import TOPICS
from api.app.database import QueryRunner
from api.app.filters import (
    AverageFilters,
    CompareFilters,
    PeriodFilters,
    ProfileFilters,
    PurposeFilters,
    SeasonalityFilters,
    SegmentFilters,
    StateFilters,
    TotalsFilters,
)
from api.app.schemas import (
    ActivityShare,
    AverageContract,
    FundingSourceRank,
    MatopibaYear,
    MonthShare,
    ProgramRank,
    PurposeShare,
    RegionYear,
    StateProfile,
    StateRank,
    StateYear,
    YearlyTotal,
)
from api.app.services import state_profile

OUT_OF_SCOPE_TOOL: Final = "explain_out_of_scope"


class ToolArgumentError(ValueError):
    """The model asked for an unknown tool or sent invalid arguments; it can try again."""


@dataclass(frozen=True)
class ToolResult:
    tool: str
    filters: dict[str, Any]
    data: Any
    panel_path: str


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    filters: type[PeriodFilters]
    run: Callable[[QueryRunner, Any], Any]
    shape: TypeAdapter[Any]
    page: Callable[[Any], str]
    # Optional step between validation and the query, e.g. completing a program name.
    prepare: Callable[[QueryRunner, Any], Any] | None = None


# --- how each tool runs ----------------------------------------------------------------------

def _query(name: str) -> Callable[[QueryRunner, PeriodFilters], Any]:
    def run(database: QueryRunner, filters: PeriodFilters) -> Any:
        return database.fetch(name, **filters.query_params())

    return run


def _fold(text: str) -> str:
    """Lower case without accents: "Funcafé" and "FUNCAFE" compare equal."""
    return "".join(c for c in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(c))


def resolve_program(database: QueryRunner, wanted: str) -> str:
    """Program names are long ("PRONAF - PROGRAMA NACIONAL..."); the model usually knows only
    the short one. Accept a unique match by start or by content, otherwise list the options."""
    names = [row["program_name"] for row in database.fetch("program_names")]
    needle = _fold(wanted)
    for candidates in (
        [name for name in names if _fold(name) == needle],
        [name for name in names if _fold(name).startswith(needle)],
        [name for name in names if needle in _fold(name)],
    ):
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            raise ToolArgumentError(f"program '{wanted}' is ambiguous; use one of: {'; '.join(candidates)}")
    raise ToolArgumentError(f"program '{wanted}' not found; use one of: {'; '.join(names)}")


def _complete_program(database: QueryRunner, filters: AverageFilters) -> AverageFilters:
    if filters.program is None:
        return filters
    return filters.model_copy(update={"program": resolve_program(database, filters.program)})


def _profile(database: QueryRunner, filters: ProfileFilters) -> Any:
    return state_profile(database, filters.state, filters)


# --- the page of the site with the same filters -------------------------------------------

def _link(path: str, filters: BaseModel, *, without: tuple[str, ...] = ()) -> str:
    params = {}
    for name, value in filters.model_dump().items():
        if value is None or name in without:
            continue
        params[name] = ",".join(value) if isinstance(value, list) else value
    return f"{path}?{urlencode(params)}" if params else path


def _state_page_or(path: str) -> Callable[[Any], str]:
    def page(filters: Any) -> str:
        if getattr(filters, "state", None):
            return _link(f"/estados/{filters.state}", filters, without=("state",))
        return _link(path, filters)

    return page


def _page(path: str) -> Callable[[Any], str]:
    return lambda filters: _link(path, filters)


# --- the tools -------------------------------------------------------------------------------

TOOLS: Final[dict[str, Tool]] = {
    tool.name: tool
    for tool in (
        Tool(
            "yearly_totals",
            "Rural credit per year (question 1): nominal and real amounts (December 2025 prices), "
            "number of contracts and change over the previous year. Optional filters: one state, "
            "activity, purpose. Use for totals of a year, of a state or of an activity, and for evolution.",
            TotalsFilters, _query("yearly_totals"), TypeAdapter(list[YearlyTotal]), _state_page_or("/"),
        ),
        Tool(
            "state_ranking",
            "Ranking of the 27 states (UFs) by amount in the period, with position and share of the "
            "total (question 2). Optional filters: activity, purpose.",
            SegmentFilters, _query("state_ranking"), TypeAdapter(list[StateRank]), _page("/"),
        ),
        Tool(
            "matopiba_yearly",
            "MATOPIBA, taken as the whole states of MA, TO, PI and BA (question 3): each state and the "
            "bloc per year (rows with state null are the bloc), with the share of Brazil.",
            PeriodFilters, _query("matopiba_yearly"), TypeAdapter(list[MatopibaYear]), _page("/matopiba"),
        ),
        Tool(
            "activity_split",
            "Agriculture (agricultural) and livestock per year, with the share of the year total "
            "(question 4). Optional filter: one state.",
            StateFilters, _query("activity_split"), TypeAdapter(list[ActivityShare]), _state_page_or("/"),
        ),
        Tool(
            "purpose_split",
            "The four purposes per year: custeio, investimento, comercializacao and industrializacao, "
            "with the share of the year total (question 5). Optional filters: one state, activity.",
            PurposeFilters, _query("purpose_split"), TypeAdapter(list[PurposeShare]), _state_page_or("/"),
        ),
        Tool(
            "compare_states",
            "Two to five states side by side, year by year, with the share of Brazil (question 6).",
            CompareFilters, _query("states_yearly"), TypeAdapter(list[StateYear]), _page("/comparar"),
        ),
        Tool(
            "regions_yearly",
            "The five regions (norte, nordeste, sudeste, sul, centro-oeste) per year, with the share "
            "of the year total (question 6). Optional filters: activity, purpose.",
            SegmentFilters, _query("regions_yearly"), TypeAdapter(list[RegionYear]), _page("/comparar"),
        ),
        Tool(
            "state_profile",
            "Profile of one state (question 7): position in the ranking, yearly series, agriculture "
            "and livestock, and purposes.",
            ProfileFilters, _profile, TypeAdapter(StateProfile),
            lambda f: _link(f"/estados/{f.state}", f, without=("state",)),
        ),
        Tool(
            "program_ranking",
            "Credit programs (Pronaf, Pronamp, Moderfrota...) ordered by amount in the period, with "
            "share of the total (question 8). Optional filter: one state.",
            StateFilters, _query("program_ranking"), TypeAdapter(list[ProgramRank]), _page("/dados"),
        ),
        Tool(
            "funding_source_ranking",
            "Funding sources (LCA, poupança rural, recursos obrigatórios...) ordered by amount in the "
            "period, with share of the total (question 9). Optional filter: one state.",
            StateFilters, _query("funding_source_ranking"), TypeAdapter(list[FundingSourceRank]),
            _page("/dados"),
        ),
        Tool(
            "seasonality",
            "When in the year credit is contracted (question 10): average, lowest and highest share of "
            "each calendar month. Optional filters: one state, purpose.",
            SeasonalityFilters, _query("seasonality"), TypeAdapter(list[MonthShare]), _state_page_or("/"),
        ),
        Tool(
            "average_contract_value",
            "Average value per contract, per year and for the whole period (row with year null) "
            "(question 11). Optional filters: state or region, activity, purpose, program "
            "(short name such as 'Pronaf' is accepted).",
            AverageFilters, _query("average_contract_value"), TypeAdapter(list[AverageContract]),
            _page("/dados"), prepare=_complete_program,
        ),
    )
}


def run_tool(name: str, arguments: dict[str, Any], database: QueryRunner) -> ToolResult:
    """Validate the arguments with the route's filter model, run the query, shape the rows."""
    tool = TOOLS.get(name)
    if tool is None:
        raise ToolArgumentError(f"unknown tool '{name}'")
    try:
        filters = tool.filters.model_validate(arguments or {})
    except ValidationError as error:
        problems = "; ".join(
            f"{'.'.join(str(p) for p in e['loc']) or 'arguments'}: {e['msg'].removeprefix('Value error, ')}"
            for e in error.errors()
        )
        raise ToolArgumentError(problems) from error
    if tool.prepare is not None:
        filters = tool.prepare(database, filters)
    data = tool.shape.dump_python(tool.shape.validate_python(tool.run(database, filters)), mode="json")
    return ToolResult(tool=name, filters=filters.model_dump(), data=data, panel_path=tool.page(filters))


# --- what the model sees ---------------------------------------------------------------------

_KEPT: Final = ("type", "enum", "minimum", "maximum", "minItems", "maxItems")


def _simplify(prop: dict[str, Any], defs: dict[str, Any]) -> dict[str, Any]:
    """Reduce Pydantic's JSON Schema to the subset every provider accepts."""
    description, default = prop.get("description"), prop.get("default")
    while "$ref" in prop or "anyOf" in prop:
        if "$ref" in prop:
            prop = defs[prop["$ref"].rsplit("/", 1)[-1]]
        else:  # "X or null": optional parameters are simply not required
            prop = next(p for p in prop["anyOf"] if p.get("type") != "null")
    result = {key: prop[key] for key in _KEPT if key in prop}
    if result.get("type") == "array":
        result["items"] = _simplify(prop["items"], defs)
    text = " ".join(part for part in (description, f"Default: {default}." if default is not None else None) if part)
    if text:
        result["description"] = text
    return result


def _parameters(model: type[BaseModel]) -> dict[str, Any]:
    schema = model.model_json_schema()
    defs = schema.get("$defs", {})
    parameters: dict[str, Any] = {
        "type": "object",
        "properties": {name: _simplify(prop, defs) for name, prop in schema["properties"].items()},
    }
    if schema.get("required"):
        parameters["required"] = schema["required"]
    return parameters


DECLARATIONS: Final[tuple[dict[str, Any], ...]] = (
    *({"name": t.name, "description": t.description, "parameters": _parameters(t.filters)} for t in TOOLS.values()),
    {
        "name": OUT_OF_SCOPE_TOOL,
        "description": "Use when the question is not about rural credit by year, state, region, activity, "
        "purpose, program, funding source or month: municipalities, banks or other financial "
        "institutions, people or companies, interest rates, default or debt, forecasts, or any other subject.",
        "parameters": {
            "type": "object",
            "properties": {"topic": {"type": "string", "enum": list(TOPICS)}},
            "required": ["topic"],
        },
    },
)
