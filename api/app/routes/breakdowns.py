"""How the credit is split: by activity, purpose, program and funding source."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from api.app.dependencies import DatabaseDep, envelope
from api.app.filters import PurposeFilters, StateFilters
from api.app.schemas import ActivityShare, Envelope, FundingSourceRank, ProgramRank, PurposeShare

router = APIRouter(prefix="/api/v1", tags=["breakdowns"])


@router.get(
    "/activities/yearly",
    response_model=Envelope[list[ActivityShare]],
    summary="Agriculture and livestock per year (question 4)",
)
def activity_split(filters: Annotated[StateFilters, Query()], database: DatabaseDep) -> dict[str, Any]:
    return envelope(database.fetch("activity_split", **filters.query_params()), filters)


@router.get(
    "/purposes/yearly",
    response_model=Envelope[list[PurposeShare]],
    summary="Custeio, investimento, comercializacao and industrializacao per year (question 5)",
)
def purpose_split(filters: Annotated[PurposeFilters, Query()], database: DatabaseDep) -> dict[str, Any]:
    return envelope(database.fetch("purpose_split", **filters.query_params()), filters)


@router.get(
    "/programs/ranking",
    response_model=Envelope[list[ProgramRank]],
    summary="Programs ordered by amount in the period (question 8)",
)
def program_ranking(filters: Annotated[StateFilters, Query()], database: DatabaseDep) -> dict[str, Any]:
    return envelope(database.fetch("program_ranking", **filters.query_params()), filters)


@router.get(
    "/funding-sources/ranking",
    response_model=Envelope[list[FundingSourceRank]],
    summary="Funding sources ordered by amount in the period (question 9)",
)
def funding_source_ranking(
    filters: Annotated[StateFilters, Query()], database: DatabaseDep
) -> dict[str, Any]:
    return envelope(database.fetch("funding_source_ranking", **filters.query_params()), filters)
