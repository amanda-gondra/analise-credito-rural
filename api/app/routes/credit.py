"""The data explorer: the rows behind every chart, page by page or as a CSV file (explorer.py)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from api.app.dependencies import DatabaseDep
from api.app.errors import ErrorResponse
from api.app.explorer import (
    FIRST_PAGE,
    MAX_EXPORT_ROWS,
    CreditFilters,
    CreditKey,
    CreditPageFilters,
    ExportTooLargeError,
    credit_csv,
    encode_cursor,
    export_filename,
)
from api.app.schemas import CreditPage, Meta

router = APIRouter(prefix="/api/v1", tags=["data"])

_EMPTY_SUMMARY = {"row_count": 0, "contracts": 0, "amount_real": 0}


@router.get(
    "/credit",
    response_model=CreditPage,
    summary="Rows of the data, page by page",
    description=(
        "One row per month, UF, activity, program, subprogram, funding source and purpose, in a fixed "
        "order. For the next page, pass page.next_cursor as cursor with the same filters. summary counts "
        "the whole selection, not only the page."
    ),
)
def credit_rows(filters: Annotated[CreditPageFilters, Query()], database: DatabaseDep) -> dict[str, Any]:
    rows = database.fetch("credit_rows", **filters.query_params())
    page = rows[: filters.limit]
    next_cursor = encode_cursor(CreditKey.of(page[-1])) if len(rows) > filters.limit else None
    summary = database.fetch("credit_summary", **filters.filters().query_params())
    return {
        "data": page,
        "meta": Meta(filters=filters.model_dump()),
        "page": {"limit": filters.limit, "next_cursor": next_cursor, "csv_max_rows": MAX_EXPORT_ROWS},
        "summary": summary[0] if summary else _EMPTY_SUMMARY,
    }


@router.get(
    "/credit.csv",
    response_class=StreamingResponse,
    summary="The same rows as a CSV file",
    description=(
        f"For spreadsheets in Portuguese (Brazil): ';' between fields, decimal comma, UTF-8 with BOM. "
        f"Up to {MAX_EXPORT_ROWS} rows; above that the answer is 422 export_too_large."
    ),
    responses={
        200: {"content": {"text/csv": {}}, "description": "The file, as an attachment."},
        422: {"model": ErrorResponse, "description": "Invalid parameter, or more rows than the export accepts"},
    },
)
def credit_csv_export(filters: Annotated[CreditFilters, Query()], database: DatabaseDep) -> StreamingResponse:
    params = filters.query_params()
    summary = database.fetch("credit_summary", **params)
    if summary and summary[0]["row_count"] > MAX_EXPORT_ROWS:
        raise ExportTooLargeError
    # One row over the limit: if a reload added rows since the count, refuse instead of cutting the file.
    rows = database.fetch("credit_rows", **params, **FIRST_PAGE, row_limit=MAX_EXPORT_ROWS + 1)
    if len(rows) > MAX_EXPORT_ROWS:
        raise ExportTooLargeError
    return StreamingResponse(
        credit_csv(rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{export_filename(filters)}"'},
    )
