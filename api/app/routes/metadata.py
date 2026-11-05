"""GET /api/v1/metadata: what the API accepts and which data is loaded.

The site fills its filters from here, and the assistant reads the collection dates
to say how recent a number is.
"""

from __future__ import annotations

from fastapi import APIRouter

from api.app.dependencies import DatabaseDep
from api.app.filters import ACTIVITIES, MAIN_SERIES, MATOPIBA, PURPOSES, REGIONS, STATES
from api.app.schemas import LoadedYear, Metadata, Period, PriceIndexInfo

router = APIRouter(prefix="/api/v1", tags=["metadata"])


@router.get("/metadata", response_model=Metadata, summary="Accepted values and loaded data")
def metadata(database: DatabaseDep) -> Metadata:
    latest = database.fetch("latest_ipca")
    price_index = (
        PriceIndexInfo(
            last_month=f"{latest[0]['reference_year']:04d}-{latest[0]['reference_month']:02d}",
            collected_at=latest[0]["collected_at"],
        )
        if latest
        else None
    )
    return Metadata(
        years=[LoadedYear.model_validate(row) for row in database.fetch("loaded_years")],
        main_series=Period(start_year=MAIN_SERIES[0], end_year=MAIN_SERIES[1]),
        states=list(STATES),
        matopiba=list(MATOPIBA),
        regions=list(REGIONS),
        activities=list(ACTIVITIES),
        purposes=list(PURPOSES),
        programs=[row["program_name"] for row in database.fetch("program_names")],
        price_index=price_index,
    )
