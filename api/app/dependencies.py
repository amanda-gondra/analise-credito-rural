"""FastAPI dependencies and the response envelope shared by the routes."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Request
from pydantic import BaseModel

from api.app.assistant.agent import Assistant
from api.app.assistant.quota import AssistantQuota
from api.app.client_ip import ClientResolver
from api.app.database import QueryRunner
from api.app.schemas import Meta


def get_database(request: Request) -> QueryRunner:
    database: QueryRunner = request.app.state.database
    return database


def get_assistant(request: Request) -> Assistant:
    assistant: Assistant = request.app.state.assistant
    return assistant


def get_quota(request: Request) -> AssistantQuota:
    quota: AssistantQuota = request.app.state.assistant_quota
    return quota


def get_client_key(request: Request) -> str:
    """The visitor, by the same rule as the request limit (api/app/client_ip.py)."""
    resolver: ClientResolver = request.app.state.client_resolver
    return resolver.key(request.scope)


DatabaseDep = Annotated[QueryRunner, Depends(get_database)]
AssistantDep = Annotated[Assistant, Depends(get_assistant)]
QuotaDep = Annotated[AssistantQuota, Depends(get_quota)]
ClientKeyDep = Annotated[str, Depends(get_client_key)]


def envelope(data: Any, filters: BaseModel, **extra_filters: Any) -> dict[str, Any]:
    """{"data", "meta"}; the response model of the route validates and renames the rows."""
    return {"data": data, "meta": Meta(filters={**extra_filters, **filters.model_dump()})}
