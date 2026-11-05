"""The 27 UFs: ranking, comparison and the profile of one state."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Path, Query

from api.app.dependencies import DatabaseDep, envelope
from api.app.filters import CompareFilters, PeriodFilters, SegmentFilters, State
from api.app.schemas import Envelope, StateProfile, StateRank, StateYear

router = APIRouter(prefix="/api/v1/states", tags=["states"])


@router.get(
    "/ranking",
    response_model=Envelope[list[StateRank]],
    summary="UFs ordered by amount in the period (question 2)",
)
def state_ranking(filters: Annotated[SegmentFilters, Query()], database: DatabaseDep) -> dict[str, Any]:
    return envelope(database.fetch("state_ranking", **filters.query_params()), filters)


@router.get(
    "/compare",
    response_model=Envelope[list[StateYear]],
    summary="Two to five UFs per year (question 6)",
)
def compare_states(filters: Annotated[CompareFilters, Query()], database: DatabaseDep) -> dict[str, Any]:
    return envelope(database.fetch("states_yearly", **filters.query_params()), filters)


@router.get(
    "/{uf}/profile",
    response_model=Envelope[StateProfile],
    summary="Profile of one UF (question 7)",
    description=(
        "Position in the ranking, yearly series, activities and purposes of the UF. "
        "Runs the same queries as the other routes, so every number matches them."
    ),
)
def state_profile(
    uf: Annotated[State, Path(description="UF (two letters).")],
    filters: Annotated[PeriodFilters, Query()],
    database: DatabaseDep,
) -> dict[str, Any]:
    period = filters.query_params()
    ranking = database.fetch("state_ranking", **period, activity_code=None, purpose=None)
    profile = {
        "state": uf,
        "ranking": next((row for row in ranking if row["state_abbr"] == uf), None),
        "yearly": database.fetch("yearly_totals", **period, state_abbr=uf, activity_code=None, purpose=None),
        "activities": database.fetch("activity_split", **period, state_abbr=uf),
        "purposes": database.fetch("purpose_split", **period, state_abbr=uf, activity_code=None),
    }
    return envelope(profile, filters, state=uf)
