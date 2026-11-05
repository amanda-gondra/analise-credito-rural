"""FastAPI dependencies and the response envelope shared by the routes."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Request
from pydantic import BaseModel

from api.app.database import QueryRunner
from api.app.schemas import Meta


def get_database(request: Request) -> QueryRunner:
    database: QueryRunner = request.app.state.database
    return database


DatabaseDep = Annotated[QueryRunner, Depends(get_database)]


def envelope(data: Any, filters: BaseModel, **extra_filters: Any) -> dict[str, Any]:
    """{"data", "meta"}; the response model of the route validates and renames the rows."""
    return {"data": data, "meta": Meta(filters={**extra_filters, **filters.model_dump()})}
