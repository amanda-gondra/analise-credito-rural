"""The vocabulary the API accepts and the query parameters of each route.

Every value a visitor (or the AI assistant) can send is checked here before any query
runs: years inside the loaded range, UFs, activities, purposes and regions from closed
lists, and no unknown parameter (extra="forbid"), so a typo fails with 422 instead of
being silently ignored. The API speaks plain words ("livestock", "nordeste"); the
translation to the codes stored in the database also lives here, in one place.
"""

from __future__ import annotations

from typing import Annotated, Any, Final, Literal, get_args

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints, model_validator

# Loaded files: 2013 to 2025. Main series 2017-2025 (decision D9): the default period,
# because before 2017 the classification of programs and purposes changed.
FIRST_YEAR: Final = 2013
LAST_YEAR: Final = 2025
MAIN_SERIES: Final = (2017, 2025)
# Prices of the real values (decision D12), stated in every response.
PRICE_BASE: Final = "2025-12"

StateAbbr = Literal[
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
    "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]
Activity = Literal["agricultural", "livestock"]
Purpose = Literal["custeio", "investimento", "comercializacao", "industrializacao"]
Region = Literal["norte", "nordeste", "sudeste", "sul", "centro-oeste"]

STATES: Final = get_args(StateAbbr)
ACTIVITIES: Final = get_args(Activity)
PURPOSES: Final = get_args(Purpose)
REGIONS: Final = get_args(Region)
# MATOPIBA as whole states (decision D7).
MATOPIBA: Final = ("MA", "TO", "PI", "BA")

# Codes of ref_activity (sql/schema.sql).
ACTIVITY_CODES: Final[dict[str, str]] = {"agricultural": "1", "livestock": "2"}
ACTIVITY_BY_CODE: Final[dict[str, str]] = {code: name for name, code in ACTIVITY_CODES.items()}


def _upper(value: object) -> object:
    return value.strip().upper() if isinstance(value, str) else value


def _lower(value: object) -> object:
    return value.strip().lower() if isinstance(value, str) else value


def _split_commas(value: object) -> object:
    """Accept states=PI,CE as well as states=PI&states=CE."""
    items = value if isinstance(value, list) else [value]
    return [part for item in items for part in (str(item).split(",")) if part.strip()]


State = Annotated[StateAbbr, BeforeValidator(_upper)]
Year = Annotated[int, Field(ge=FIRST_YEAR, le=LAST_YEAR)]
ProgramName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]

_STATE_DOC: Final = "UF (two letters). Empty: all of Brazil."
_ACTIVITY_DOC: Final = "agricultural or livestock. Empty: both."
_PURPOSE_DOC: Final = "custeio, investimento, comercializacao or industrializacao. Empty: all."

# API parameter -> (query parameter, conversion to the stored value).
_SQL_PARAMS: Final[dict[str, tuple[str, Any]]] = {
    "state": ("state_abbr", str),
    "states": ("state_abbrs", list),
    "activity": ("activity_code", ACTIVITY_CODES.__getitem__),
    "purpose": ("purpose", str),
    "region": ("region_name", str.upper),
    "program": ("program_name", str),
}


class PeriodFilters(BaseModel):
    """Period of every route. Shares inside a year use nominal values; totals of
    several years use real values (December 2025 prices)."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    start_year: Year = Field(default=MAIN_SERIES[0], description="First year (2013 to 2025).")
    end_year: Year = Field(default=MAIN_SERIES[1], description="Last year (2013 to 2025).")

    @model_validator(mode="after")
    def _ordered_period(self) -> PeriodFilters:
        if self.start_year > self.end_year:
            raise ValueError("start_year must not be after end_year")
        return self

    def query_params(self) -> dict[str, Any]:
        """Parameters of the named query, with the values stored in the database."""
        values = self.model_dump()
        params: dict[str, Any] = {
            "first_year": values.pop("start_year"),
            "last_year": values.pop("end_year"),
        }
        for field, value in values.items():
            name, convert = _SQL_PARAMS[field]
            params[name] = None if value is None else convert(value)
        return params


class TotalsFilters(PeriodFilters):
    """Question 1."""

    state: State | None = Field(default=None, description=_STATE_DOC)
    activity: Activity | None = Field(default=None, description=_ACTIVITY_DOC)
    purpose: Purpose | None = Field(default=None, description=_PURPOSE_DOC)


class SegmentFilters(PeriodFilters):
    """Questions 2 and 6b: rankings of states and the regions, by activity and purpose."""

    activity: Activity | None = Field(default=None, description=_ACTIVITY_DOC)
    purpose: Purpose | None = Field(default=None, description=_PURPOSE_DOC)


class StateFilters(PeriodFilters):
    """Questions 4, 8 and 9."""

    state: State | None = Field(default=None, description=_STATE_DOC)


class PurposeFilters(PeriodFilters):
    """Question 5."""

    state: State | None = Field(default=None, description=_STATE_DOC)
    activity: Activity | None = Field(default=None, description=_ACTIVITY_DOC)


class SeasonalityFilters(PeriodFilters):
    """Question 10."""

    state: State | None = Field(default=None, description=_STATE_DOC)
    purpose: Purpose | None = Field(default=None, description=_PURPOSE_DOC)


class ProfileFilters(PeriodFilters):
    """Question 7. In the route the UF comes in the path; the assistant passes it here."""

    state: State = Field(description="UF (two letters).")


class CompareFilters(PeriodFilters):
    """Question 6a."""

    states: Annotated[list[State], BeforeValidator(_split_commas)] = Field(
        min_length=2, max_length=5, description="Two to five UFs: states=PI,CE or states=PI&states=CE."
    )

    @model_validator(mode="after")
    def _distinct_states(self) -> CompareFilters:
        if len(set(self.states)) != len(self.states):
            raise ValueError("states must not repeat")
        return self


class AverageFilters(PeriodFilters):
    """Question 11."""

    state: State | None = Field(default=None, description=_STATE_DOC)
    region: Annotated[Region, BeforeValidator(_lower)] | None = Field(
        default=None, description="norte, nordeste, sudeste, sul or centro-oeste. Not with state."
    )
    activity: Activity | None = Field(default=None, description=_ACTIVITY_DOC)
    purpose: Purpose | None = Field(default=None, description=_PURPOSE_DOC)
    program: ProgramName | None = Field(
        default=None, description="Program exactly as listed by /api/v1/metadata. Empty: all."
    )

    @model_validator(mode="after")
    def _state_or_region(self) -> AverageFilters:
        if self.state is not None and self.region is not None:
            raise ValueError("use state or region, not both")
        return self
