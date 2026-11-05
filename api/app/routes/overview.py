"""Brazil (or one UF) over time: totals, seasonality and average contract value."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from api.app.dependencies import DatabaseDep, envelope
from api.app.filters import AverageFilters, SeasonalityFilters, TotalsFilters
from api.app.schemas import AverageContract, Envelope, MonthShare, YearlyTotal

router = APIRouter(prefix="/api/v1", tags=["overview"])


@router.get(
    "/totals/yearly",
    response_model=Envelope[list[YearlyTotal]],
    summary="Credit per year (question 1)",
    description="Nominal and real amounts, contracts and change over the previous year.",
)
def yearly_totals(filters: Annotated[TotalsFilters, Query()], database: DatabaseDep) -> dict[str, Any]:
    return envelope(database.fetch("yearly_totals", **filters.query_params()), filters)


@router.get(
    "/seasonality",
    response_model=Envelope[list[MonthShare]],
    summary="Share of each month in the year (question 10)",
    description="Average, lowest and highest share of each calendar month over the years of the period.",
)
def seasonality(filters: Annotated[SeasonalityFilters, Query()], database: DatabaseDep) -> dict[str, Any]:
    return envelope(database.fetch("seasonality", **filters.query_params()), filters)


@router.get(
    "/contracts/average",
    response_model=Envelope[list[AverageContract]],
    summary="Average value per contract (question 11)",
    description="One row per year plus one row for the whole period (year null), at real prices.",
)
def average_contract_value(
    filters: Annotated[AverageFilters, Query()], database: DatabaseDep
) -> dict[str, Any]:
    return envelope(database.fetch("average_contract_value", **filters.query_params()), filters)
