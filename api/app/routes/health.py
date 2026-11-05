"""GET /health: is the API up and does the database answer? Used by the host's health check."""

from __future__ import annotations

from fastapi import APIRouter, Response

from api.app.database import DatabaseUnavailableError
from api.app.dependencies import DatabaseDep
from api.app.schemas import Health

router = APIRouter(tags=["health"])


@router.get("/health", response_model=Health, responses={503: {"model": Health}})
def health(database: DatabaseDep, response: Response) -> Health:
    try:
        database.ping()
    except DatabaseUnavailableError:
        response.status_code = 503
        return Health(status="unavailable", database="unavailable")
    return Health(status="ok", database="ok")
