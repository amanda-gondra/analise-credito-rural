"""Download the monthly IPCA index from IBGE (SIDRA) and load it into PostgreSQL.

The index is used to show values corrected for inflation (decision D12). Only
the index is stored; the corrected values are computed in the queries.

The whole series is replaced in a single transaction: if the download or any
check fails, the database keeps the series it had before.

Usage, from the project root (database running, .env filled in):
    python -m pipeline.ipca
"""

from __future__ import annotations

import gzip
import json
import sys
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy import Connection, text

from pipeline.download import REQUEST_TIMEOUT_SECONDS, USER_AGENT
from pipeline.load import get_engine

# SIDRA table 1737, variable 2266: "IPCA - Número-índice (base: dezembro de 1993 = 100)", Brazil, all months.
SIDRA_URL = "https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/all"
FIRST_PERIOD = (2013, 1)  # first month of the credit data (Sicor starts in January 2013)
REFERENCE_PERIOD = (2025, 12)  # prices of December 2025 (decision D12)
INDEX_DECIMALS = Decimal("0.01")


class IpcaError(ValueError):
    """The series returned by SIDRA is not what the project expects."""


@dataclass(frozen=True)
class IpcaPoint:
    reference_year: int
    reference_month: int
    index_value: Decimal


def fetch_rows() -> list[dict[str, str]]:
    """Call the SIDRA API and return its rows. The first row of the response is a header."""
    request = urllib.request.Request(SIDRA_URL, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        body = response.read()
    if body[:2] == b"\x1f\x8b":  # the API answers compressed even when not asked to
        body = gzip.decompress(body)
    data = json.loads(body.decode("utf-8"))
    if not isinstance(data, list) or len(data) < 2:
        raise IpcaError("SIDRA returned no data")
    return data[1:]


def parse(rows: list[dict[str, str]]) -> list[IpcaPoint]:
    """Turn SIDRA rows into points from FIRST_PERIOD on, in order, and check the series.

    Each row has the period code in D3C ("202512") and the value in V ("7403.2900000000000").
    """
    points = []
    for row in rows:
        period, raw_value = row.get("D3C", ""), row.get("V", "")
        if len(period) != 6 or not period.isdigit():
            raise IpcaError(f"unexpected period code: {period!r}")
        year, month = int(period[:4]), int(period[4:])
        if (year, month) < FIRST_PERIOD:
            continue
        points.append(IpcaPoint(year, month, _index_value(raw_value, period)))

    points.sort(key=lambda p: (p.reference_year, p.reference_month))
    validate(points)
    return points


def _index_value(raw: str, period: str) -> Decimal:
    """Exact decimal with at most two decimal places; SIDRA marks missing values with "...", "-" or "X"."""
    try:
        value = Decimal(raw)
    except InvalidOperation:
        raise IpcaError(f"no index value for {period}: {raw!r}") from None
    rounded = value.quantize(INDEX_DECIMALS)
    if rounded != value:
        raise IpcaError(f"index for {period} has more than two decimals: {raw}")
    if rounded <= 0:
        raise IpcaError(f"index for {period} is not positive: {raw}")
    return rounded


def validate(points: list[IpcaPoint]) -> None:
    """The series must start at FIRST_PERIOD, have no missing month and include REFERENCE_PERIOD."""
    if not points:
        raise IpcaError("the series is empty")
    first = (points[0].reference_year, points[0].reference_month)
    if first != FIRST_PERIOD:
        raise IpcaError(f"the series starts at {first}, expected {FIRST_PERIOD}")
    for previous, current in zip(points, points[1:]):
        expected = _next_month(previous.reference_year, previous.reference_month)
        actual = (current.reference_year, current.reference_month)
        if actual != expected:
            raise IpcaError(f"missing or repeated month: {expected} expected, found {actual}")
    last = (points[-1].reference_year, points[-1].reference_month)
    if last < REFERENCE_PERIOD:
        raise IpcaError(f"the series ends at {last}, before the reference month {REFERENCE_PERIOD}")


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def load(connection: Connection, points: list[IpcaPoint], collected_at: datetime) -> None:
    """Replace the series. Must run inside a transaction."""
    connection.execute(text("DELETE FROM ipca_monthly"))
    connection.execute(
        text("""
            INSERT INTO ipca_monthly (reference_year, reference_month, index_value, collected_at)
            VALUES (:year, :month, :value, :collected_at)
        """),
        [
            {"year": p.reference_year, "month": p.reference_month, "value": p.index_value, "collected_at": collected_at}
            for p in points
        ],
    )


def main() -> int:
    try:
        collected_at = datetime.now(timezone.utc)
        points = parse(fetch_rows())
        with get_engine().begin() as connection:  # commits on success, rolls back on any exception
            load(connection, points, collected_at)
    except Exception as error:
        print(f"IPCA  ERROR  {type(error).__name__}: {error}", file=sys.stderr)
        return 1

    reference = next(p for p in points if (p.reference_year, p.reference_month) == REFERENCE_PERIOD)
    first, last = points[0], points[-1]
    print(f"IPCA  loaded {len(points)} months  {first.reference_month:02d}/{first.reference_year} to "
          f"{last.reference_month:02d}/{last.reference_year}  Dec/2025 = {reference.index_value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
