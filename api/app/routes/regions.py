"""The five regions and MATOPIBA."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from api.app.dependencies import DatabaseDep, envelope
from api.app.filters import PeriodFilters, SegmentFilters
from api.app.schemas import Envelope, MatopibaYear, RegionYear

router = APIRouter(prefix="/api/v1/regions", tags=["regions"])


@router.get(
    "/yearly",
    response_model=Envelope[list[RegionYear]],
    summary="The five regions per year (question 6)",
)
def regions_yearly(filters: Annotated[SegmentFilters, Query()], database: DatabaseDep) -> dict[str, Any]:
    return envelope(database.fetch("regions_yearly", **filters.query_params()), filters)


@router.get(
    "/matopiba/yearly",
    response_model=Envelope[list[MatopibaYear]],
    summary="MATOPIBA per year, each state and the bloc (question 3)",
    description="MA, TO, PI and BA as whole states. Rows with state null are the four states together.",
)
def matopiba_yearly(filters: Annotated[PeriodFilters, Query()], database: DatabaseDep) -> dict[str, Any]:
    return envelope(database.fetch("matopiba_yearly", **filters.query_params()), filters)
