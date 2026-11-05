"""Standard error responses and the exception handlers that produce them.

Every error has the same body: {"error": {"code", "message", "request_id", "details"}}.

    404 not_found             unknown route
    405 method_not_allowed    the API only answers GET
    422 validation_error      unknown parameter, value out of the accepted list or range
    429 rate_limited          above RATE_LIMIT_PER_MINUTE (see middleware), with Retry-After
    500 internal_error        unexpected failure; details stay in the server log
    503 database_unavailable  database unreachable or query above the time limit, with Retry-After

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

from api.app.database import DatabaseUnavailableError

logger = logging.getLogger("rural_credit_api.errors")

RETRY_AFTER_SECONDS: Final = "30"
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


async def _internal_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "internal error: request_id=%s type=%s", _request_id(request), type(exc).__name__
    )
    return error_response(500, "internal_error", "Internal error.", _request_id(request))


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(HTTPException, _http_error)
    app.add_exception_handler(DatabaseUnavailableError, _database_unavailable)
    app.add_exception_handler(Exception, _internal_error)
