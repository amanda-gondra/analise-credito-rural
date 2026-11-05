"""Standard error responses and the exception handlers that produce them.

Every error has the same body: {"error": {"code", "message", "request_id", "details"}}.

    400 invalid_json           the assistant's request body is not valid JSON
    404 not_found              unknown route
    405 method_not_allowed     wrong method (GET everywhere; POST only for the assistant)
    413 payload_too_large      body above MAX_REQUEST_BODY_BYTES (see middleware)
    422 validation_error       unknown parameter, value out of the accepted list or range
    429 rate_limited           above RATE_LIMIT_PER_MINUTE (see middleware), with Retry-After
    429 assistant_limit        question quota of the visitor or of the site, with Retry-After
    500 internal_error         unexpected failure; details stay in the server log
    503 database_unavailable   database unreachable or query above the time limit, with Retry-After
    503 assistant_unavailable  no language model configured or all of them failed, with Retry-After

Messages never include SQL, connection data or stack traces.
"""

from __future__ import annotations

import logging
from typing import Final

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException

from api.app.assistant.agent import AssistantUnavailableError
from api.app.assistant.quota import QuotaExceededError
from api.app.database import DatabaseUnavailableError

logger = logging.getLogger("rural_credit_api.errors")

RETRY_AFTER_SECONDS: Final = "30"
ASSISTANT_RETRY_AFTER_SECONDS: Final = "60"
_HTTP_CODES: Final = {404: "not_found", 405: "method_not_allowed"}


class ErrorDetail(BaseModel):
    field: str | None = Field(description="Parameter with the problem; null when it concerns several.")
    message: str


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str | None
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorBody


def error_response(
    status_code: int,
    code: str,
    message: str,
    request_id: str | None,
    details: list[ErrorDetail] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorBody(code=code, message=message, request_id=request_id, details=details or [])
    )
    return JSONResponse(status_code=status_code, content=body.model_dump(), headers=headers)


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101 - registered for this type
    if any(error.get("type") == "json_invalid" for error in exc.errors()):
        return error_response(400, "invalid_json", "Request body is not valid JSON.", _request_id(request))
    details = [
        ErrorDetail(
            # loc is ("query", "start_year") or ("path", "uf"); the first part is not useful.
            field=".".join(str(part) for part in error.get("loc", ())[1:]) or None,
            # Pydantic prefixes the messages of custom checks with "Value error, ".
            message=str(error.get("msg", "invalid value")).removeprefix("Value error, "),
        )
        for error in exc.errors()
    ]
    return error_response(
        422,
        "validation_error",
        "The request parameters are not valid.",
        _request_id(request),
        details,
    )


async def _http_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, HTTPException)  # noqa: S101 - registered for this type
    code = _HTTP_CODES.get(exc.status_code, "http_error")
    message = exc.detail if isinstance(exc.detail, str) else "HTTP error."
    return error_response(exc.status_code, code, message, _request_id(request), headers=exc.headers)


async def _database_unavailable(request: Request, exc: Exception) -> JSONResponse:
    return error_response(
        503,
        "database_unavailable",
        "The database is unavailable or did not answer in time. Try again later.",
        _request_id(request),
        headers={"Retry-After": RETRY_AFTER_SECONDS},
    )


async def _assistant_unavailable(request: Request, exc: Exception) -> JSONResponse:
    return error_response(
        503,
        "assistant_unavailable",
        "The assistant is unavailable right now. The panel and the other routes keep working.",
        _request_id(request),
        headers={"Retry-After": ASSISTANT_RETRY_AFTER_SECONDS},
    )


async def _assistant_limit(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, QuotaExceededError)  # noqa: S101 - registered for this type
    message = (
        "The assistant reached its daily limit of questions for the site."
        if exc.scope == "site"
        else "You reached the limit of questions to the assistant. Try again later."
    )
    return error_response(
        429, "assistant_limit", message, _request_id(request), headers={"Retry-After": str(exc.retry_after)}
    )


async def _internal_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "internal error: request_id=%s type=%s", _request_id(request), type(exc).__name__
    )
    return error_response(500, "internal_error", "Internal error.", _request_id(request))


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(HTTPException, _http_error)
    app.add_exception_handler(DatabaseUnavailableError, _database_unavailable)
    app.add_exception_handler(AssistantUnavailableError, _assistant_unavailable)
    app.add_exception_handler(QuotaExceededError, _assistant_limit)
    app.add_exception_handler(Exception, _internal_error)
