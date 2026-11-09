"""The data explorer: the rows of credit_monthly page by page, and the same rows as CSV.

GET /api/v1/credit pages through the rows in the order of the primary key (keyset
pagination, sql/queries.sql). The cursor of the next page is the key of the last row
shown, as base64url JSON: opaque to the site, checked like any other parameter when it
comes back, and bound as query parameters, never written into the SQL.

GET /api/v1/credit.csv sends the same rows as a file for spreadsheets set to Portuguese
(Brazil): ";" between fields, decimal comma, UTF-8 with BOM so Excel reads the accents.
Text a spreadsheet would run as a formula (=, +, -, @, tab or carriage return at the
start) gets a leading apostrophe. Above MAX_EXPORT_ROWS rows the export is refused with
a message to narrow the filters, so one download cannot exhaust the server.
"""

from __future__ import annotations

import base64
import binascii
import csv
import io
import json
from collections.abc import Iterable, Iterator
from decimal import Decimal
from typing import Annotated, Any, Final, NamedTuple

from pydantic import Field, StringConstraints, model_validator

from api.app.database import Row
from api.app.filters import ACTIVITY_BY_CODE, FIRST_YEAR, LAST_YEAR, PURPOSES, STATES, AverageFilters

DEFAULT_PAGE_SIZE: Final = 50
MAX_PAGE_SIZE: Final = 500
# About 18 thousand rows per year in all of Brazil: two years of the country, or the whole
# main series of any single UF, fit in one file.
MAX_EXPORT_ROWS: Final = 50_000
# Names in the source are at most 99 characters (checked on 2013-2025); the margin is wide.
_MAX_NAME_LENGTH: Final = 300
_MAX_CURSOR_LENGTH: Final = 4_096


class ExportTooLargeError(Exception):
    """The filters select more rows than the CSV export accepts."""


class CreditKey(NamedTuple):
    """Primary key of credit_monthly, in the order of the index."""

    year: int
    month: int
    state: str
    activity_code: str
    program: str
    subprogram: str
    funding_source: str
    purpose: str

    @classmethod
    def of(cls, row: Row) -> CreditKey:
        return cls(
            row["reference_year"], row["reference_month"], row["state_abbr"], row["activity_code"],
            row["program_name"], row["subprogram_name"], row["funding_source_name"], row["purpose"],
        )


_AFTER_PARAMS: Final = (
    "after_year", "after_month", "after_state", "after_activity",
    "after_program", "after_subprogram", "after_funding_source", "after_purpose",
)
FIRST_PAGE: Final[dict[str, None]] = dict.fromkeys(_AFTER_PARAMS)


def encode_cursor(key: CreditKey) -> str:
    payload = json.dumps(list(key), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _is_name(value: object) -> bool:
    return isinstance(value, str) and 0 < len(value) <= _MAX_NAME_LENGTH


def decode_cursor(cursor: str) -> CreditKey:
    """Inverse of encode_cursor. ValueError for anything encode_cursor could not have made."""
    try:
        values = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode("utf-8"))
    except (binascii.Error, UnicodeDecodeError, ValueError) as error:
        raise ValueError("cursor is not valid; use next_cursor of the previous page") from error
    if not isinstance(values, list) or len(values) != len(CreditKey._fields):
        raise ValueError("cursor is not valid; use next_cursor of the previous page")
    key = CreditKey(*values)
    valid = (
        type(key.year) is int and FIRST_YEAR <= key.year <= LAST_YEAR
        and type(key.month) is int and 1 <= key.month <= 12
        and key.state in STATES
        and key.activity_code in ACTIVITY_BY_CODE
        and key.purpose in PURPOSES
        and all(_is_name(value) for value in (key.program, key.subprogram, key.funding_source))
    )
    if not valid:
        raise ValueError("cursor is not valid; use next_cursor of the previous page")
    return key


class CreditFilters(AverageFilters):
    """Filters of the data explorer: the same as question 11 (period, UF or region,
    activity, purpose and program)."""


Cursor = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]+$", max_length=_MAX_CURSOR_LENGTH)]


class CreditPageFilters(CreditFilters):
    limit: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Rows per page (1 to 500).")
    cursor: Cursor | None = Field(
        default=None, description="next_cursor of the previous page. Empty: the first page."
    )

    @model_validator(mode="after")
    def _readable_cursor(self) -> CreditPageFilters:
        if self.cursor is not None:
            decode_cursor(self.cursor)
        return self

    def filters(self) -> CreditFilters:
        """The filters without the page, for the summary of the selection."""
        return CreditFilters.model_validate(self.model_dump(exclude={"limit", "cursor"}))

    def query_params(self) -> dict[str, Any]:
        """Parameters of credit_rows: one row more than the page, to know if another follows."""
        after: dict[str, Any] = dict(FIRST_PAGE)
        if self.cursor is not None:
            after = dict(zip(_AFTER_PARAMS, decode_cursor(self.cursor), strict=True))
        return {**self.filters().query_params(), **after, "row_limit": self.limit + 1}


# --- CSV ----------------------------------------------------------------------------------------

CSV_HEADER: Final = (
    "ano", "mes", "uf", "regiao", "atividade", "finalidade", "programa", "subprograma",
    "fonte_de_recursos", "contratos", "valor_nominal_brl", "valor_real_dez_2025_brl",
)
_ACTIVITY_LABELS: Final = {"1": "Agrícola", "2": "Pecuária"}
_PURPOSE_LABELS: Final = {
    "custeio": "Custeio",
    "investimento": "Investimento",
    "comercializacao": "Comercialização",
    "industrializacao": "Industrialização",
}
_REGION_LABELS: Final = {
    "NORTE": "Norte", "NORDESTE": "Nordeste", "SUDESTE": "Sudeste", "SUL": "Sul", "CENTRO-OESTE": "Centro-Oeste",
}
_FORMULA_START: Final = ("=", "+", "-", "@", "\t", "\r")
_FILE_WORDS: Final = {"agricultural": "agricola", "livestock": "pecuaria"}


def _text(value: str) -> str:
    return f"'{value}" if value.startswith(_FORMULA_START) else value


def _amount(value: Decimal | float | None) -> str:
    if value is None:
        return ""
    number = value if isinstance(value, Decimal) else Decimal(str(value))
    return format(number, "f").replace(".", ",")


def _csv_row(row: Row) -> list[str | int]:
    return [
        row["reference_year"],
        row["reference_month"],
        _text(row["state_abbr"]),
        _REGION_LABELS[row["region_name"]],
        _ACTIVITY_LABELS[row["activity_code"]],
        _PURPOSE_LABELS[row["purpose"]],
        _text(row["program_name"]),
        _text(row["subprogram_name"]),
        _text(row["funding_source_name"]),
        row["contract_count"],
        _amount(row["amount_nominal"]),
        _amount(row["amount_real"]),
    ]


def credit_csv(rows: Iterable[Row], chunk_rows: int = 1_000) -> Iterator[str]:
    """The file in pieces of chunk_rows rows, so the response starts before the last row is written."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    buffer.write("\N{ZERO WIDTH NO-BREAK SPACE}")  # BOM: Excel reads UTF-8
    writer.writerow(CSV_HEADER)
    for index, row in enumerate(rows, start=1):
        writer.writerow(_csv_row(row))
        if index % chunk_rows == 0:
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)
    yield buffer.getvalue()


def export_filename(filters: CreditFilters) -> str:
    """ASCII only: credito-rural_2017-2025_pi_pecuaria.csv."""
    parts = ["credito-rural", f"{filters.start_year}-{filters.end_year}"]
    for value in (filters.state, filters.region, filters.activity, filters.purpose):
        if value is not None:
            parts.append(_FILE_WORDS.get(value, value.lower()))
    if filters.program is not None:
        parts.append("programa")
    return "_".join(parts) + ".csv"
