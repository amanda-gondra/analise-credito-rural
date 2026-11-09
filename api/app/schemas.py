"""Response bodies. Every data route answers {"data": ..., "meta": ...}.

meta carries what a number needs to be quoted correctly: the source, the price index
and base of the real values, and the filters that produced it (decision D17: the
assistant answers with number, period and source).

Rows come straight from sql/queries.sql. validation_alias maps the column names of the
queries (reference_year, state_abbr...) to the shorter names of the API (year, state...),
so nothing is recalculated or renamed by hand in the routes. Amounts are numbers in BRL
rounded to cents by the query; percentages have two decimals.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Final, Generic, Literal, TypeVar

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints

from api.app.assistant.context import ScreenContext
from api.app.filters import ACTIVITY_BY_CODE, PRICE_BASE, Activity, Region

SOURCE: Final = "Banco Central do Brasil, Matriz de Dados do Crédito Rural (MDCR)"
PRICE_INDEX: Final = "IPCA (IBGE, SIDRA table 1737)"

T = TypeVar("T")


def _lowercase(value: object) -> object:
    return value.lower() if isinstance(value, str) else value


AmountNominal = Annotated[float, Field(description="BRL at the prices of each month (no adjustment).")]
AmountReal = Annotated[
    float | None, Field(description="BRL at December 2025 prices (IPCA). Null only if a month lacks the index.")
]
Contracts = Annotated[int, Field(description="Number of contracts.")]
YearColumn = Annotated[int, Field(validation_alias="reference_year")]
ActivityColumn = Annotated[Activity, BeforeValidator(ACTIVITY_BY_CODE.get), Field(validation_alias="activity_code")]
RegionColumn = Annotated[Region, BeforeValidator(_lowercase), Field(validation_alias="region_name")]


class _Row(BaseModel):
    model_config = ConfigDict(frozen=True)


class Meta(BaseModel):
    source: str = SOURCE
    price_index: str = PRICE_INDEX
    price_base: str = Field(default=PRICE_BASE, description="Month whose prices the real values use.")
    filters: dict[str, Any] = Field(description="Filters that produced the data, after validation.")


class Envelope(BaseModel, Generic[T]):
    data: T
    meta: Meta


class YearlyTotal(_Row):
    year: YearColumn
    amount_nominal: AmountNominal
    amount_real: AmountReal
    contracts: Contracts
    change_nominal_pct: float | None = Field(description="Change over the previous year; null for the first year.")
    change_real_pct: float | None = Field(description="Same, on real values.")


class StateRank(_Row):
    position: int
    state: str = Field(validation_alias="state_abbr")
    region: RegionColumn
    amount_nominal: AmountNominal
    amount_real: AmountReal
    contracts: Contracts
    share_pct: float | None = Field(description="Share of the period total, on real values.")


class MatopibaYear(_Row):
    year: YearColumn
    state: str | None = Field(validation_alias="state_abbr", description="Null: the four states together.")
    amount_nominal: AmountNominal
    amount_real: AmountReal
    contracts: Contracts
    share_of_brazil_pct: float | None = Field(description="Share of Brazil in the same year, on nominal values.")


class ActivityShare(_Row):
    year: YearColumn
    activity: ActivityColumn
    amount_nominal: AmountNominal
    amount_real: AmountReal
    contracts: Contracts
    share_pct: float | None = Field(description="Share of the year total, on nominal values.")


class PurposeShare(_Row):
    year: YearColumn
    purpose: str
    amount_nominal: AmountNominal
    amount_real: AmountReal
    contracts: Contracts
    share_pct: float | None = Field(description="Share of the year total, on nominal values.")


class StateYear(_Row):
    year: YearColumn
    state: str = Field(validation_alias="state_abbr")
    amount_nominal: AmountNominal
    amount_real: AmountReal
    contracts: Contracts
    share_of_brazil_pct: float | None = Field(description="Share of Brazil in the same year, on nominal values.")


class RegionYear(_Row):
    year: YearColumn
    region: RegionColumn
    amount_nominal: AmountNominal
    amount_real: AmountReal
    contracts: Contracts
    share_pct: float | None = Field(description="Share of the year total, on nominal values.")


class ProgramRank(_Row):
    position: int
    program: str = Field(validation_alias="program_name", description="Name as published by the source.")
    amount_nominal: AmountNominal
    amount_real: AmountReal
    contracts: Contracts
    share_pct: float | None = Field(description="Share of the period total, on real values.")


class FundingSourceRank(_Row):
    position: int
    funding_source: str = Field(validation_alias="funding_source_name", description="Name as published.")
    amount_nominal: AmountNominal
    amount_real: AmountReal
    contracts: Contracts
    share_pct: float | None = Field(description="Share of the period total, on real values.")


class MonthShare(_Row):
    month: int = Field(validation_alias="reference_month")
    avg_share_pct: float | None = Field(description="Average share of the month in its year (each year weighs the same).")
    min_share_pct: float | None
    max_share_pct: float | None
    years: int = Field(description="Years in the average.")


class AverageContract(_Row):
    year: int | None = Field(validation_alias="reference_year", description="Null: the whole period.")
    amount_nominal: AmountNominal
    amount_real: AmountReal
    contracts: Contracts
    average_nominal: float | None = Field(description="Amount / contracts; null without contracts.")
    average_real: float | None = Field(description="Same, at December 2025 prices.")


class CreditRow(_Row):
    """One row of credit_monthly: month x UF x activity x program x subprogram x funding source x purpose."""

    year: YearColumn
    month: int = Field(validation_alias="reference_month")
    state: str = Field(validation_alias="state_abbr")
    region: RegionColumn
    activity: ActivityColumn
    purpose: str
    program: str = Field(validation_alias="program_name", description="As published by the source.")
    subprogram: str = Field(validation_alias="subprogram_name", description="As published by the source.")
    funding_source: str = Field(validation_alias="funding_source_name", description="As published by the source.")
    contracts: Contracts = Field(validation_alias="contract_count")
    amount_nominal: AmountNominal
    amount_real: AmountReal


class CreditPageInfo(BaseModel):
    limit: int = Field(description="Rows per page asked for.")
    next_cursor: str | None = Field(description="Pass as cursor to get the next page; null on the last page.")
    csv_max_rows: int = Field(description="Most rows /api/v1/credit.csv accepts; narrow the filters above it.")


class CreditSummary(BaseModel):
    rows: int = Field(validation_alias="row_count", description="Rows the filters select, in every page.")
    contracts: Contracts
    amount_real: float = Field(description="Total of the selection at December 2025 prices (IPCA).")


class CreditPage(BaseModel):
    data: list[CreditRow]
    meta: Meta
    page: CreditPageInfo
    summary: CreditSummary


class StateProfile(BaseModel):
    """Question 7: the same numbers as the other routes, for one UF."""

    state: str
    ranking: StateRank | None = Field(description="Position among the 27 UFs in the period; null without credit.")
    yearly: list[YearlyTotal]
    activities: list[ActivityShare]
    purposes: list[PurposeShare]


class LoadedYear(_Row):
    year: YearColumn
    collected_at: datetime = Field(description="When the file was downloaded from the Banco Central.")
    file_generated_at: datetime | None = Field(description="When the Banco Central generated the file.")


class Period(BaseModel):
    start_year: int
    end_year: int


class PriceIndexInfo(BaseModel):
    name: str = PRICE_INDEX
    price_base: str = PRICE_BASE
    last_month: str = Field(description="Last month loaded, YYYY-MM.")
    collected_at: datetime


class Metadata(BaseModel):
    years: list[LoadedYear]
    main_series: Period = Field(description="Default period of every route (decision D9).")
    states: list[str]
    matopiba: list[str]
    regions: list[str]
    activities: list[str]
    purposes: list[str]
    programs: list[str] = Field(description="Accepted values of the program filter.")
    price_index: PriceIndexInfo | None
    assistant_available: bool = Field(description="False when no language model provider is configured.")


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)] = Field(
        description="Question in Portuguese about rural credit in Brazil (3 to 500 characters)."
    )
    context: ScreenContext | None = Field(
        default=None,
        description=(
            "Page and filters on screen when the question was asked. Optional; it only fills what the "
            "question leaves open, and the question wins when they disagree."
        ),
    )


class AssistantSource(BaseModel):
    tool: str = Field(description="Tool the assistant used; each matches one route of this API.")
    filters: dict[str, Any] = Field(description="Filters of the tool, with the words of the API.")
    panel_path: str = Field(description="Page of the site with the same filters, to check the answer.")
    data: Any = Field(description="Rows the answer was written from, in the format of the matching route.")


class AssistantMeta(BaseModel):
    source: str = SOURCE
    price_index: str = PRICE_INDEX
    price_base: str = PRICE_BASE
    collected_at: datetime | None = Field(
        default=None, description="Most recent collection of the loaded files (the source is revised daily)."
    )
    notice: str = Field(
        default=(
            "Resposta escrita por um modelo de linguagem a partir dos dados do projeto. "
            "Os números vêm do banco; confira no painel."
        )
    )


class AskResponse(BaseModel):
    answer: str
    out_of_scope: bool = Field(description="True when the question is outside what the project answers.")
    provider: str = Field(description="Language model provider that answered.")
    sources: list[AssistantSource]
    meta: AssistantMeta = Field(default_factory=AssistantMeta)


class Health(BaseModel):
    status: Literal["ok", "unavailable"]
    database: Literal["ok", "unavailable"]
