"""Tests for pipeline/ipca.py that need no network or database: parsing and checks of the SIDRA series."""

from decimal import Decimal

import pytest

from pipeline.ipca import FIRST_PERIOD, REFERENCE_PERIOD, IpcaError, parse


def months(start: tuple[int, int], end: tuple[int, int]) -> list[tuple[int, int]]:
    year, month = start
    result = []
    while (year, month) <= end:
        result.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return result


def sidra_rows(periods: list[tuple[int, int]], value: str = "5000.1200000000000") -> list[dict[str, str]]:
    """Rows shaped like the SIDRA API answer (header row already removed)."""
    return [{"D3C": f"{year}{month:02d}", "V": value} for year, month in periods]


def test_parses_a_complete_series_in_order():
    periods = months((2012, 11), (2026, 9))  # SIDRA returns the whole history; older months are dropped
    points = parse(list(reversed(sidra_rows(periods))))
    assert (points[0].reference_year, points[0].reference_month) == FIRST_PERIOD
    assert (points[-1].reference_year, points[-1].reference_month) == (2026, 9)
    assert len(points) == len(months(FIRST_PERIOD, (2026, 9)))


def test_keeps_the_exact_decimal_value():
    points = parse(sidra_rows(months(FIRST_PERIOD, REFERENCE_PERIOD), value="7403.2900000000000"))
    assert points[-1].index_value == Decimal("7403.29")


def test_rejects_a_missing_month():
    periods = months(FIRST_PERIOD, REFERENCE_PERIOD)
    periods.remove((2020, 5))
    with pytest.raises(IpcaError, match="missing or repeated month"):
        parse(sidra_rows(periods))


def test_rejects_a_series_that_ends_before_the_reference_month():
    with pytest.raises(IpcaError, match="before the reference month"):
        parse(sidra_rows(months(FIRST_PERIOD, (2025, 11))))


def test_rejects_a_series_that_starts_late():
    with pytest.raises(IpcaError, match="starts at"):
        parse(sidra_rows(months((2014, 1), REFERENCE_PERIOD)))


@pytest.mark.parametrize("raw", ["...", "-", "X", ""])
def test_rejects_the_missing_value_markers_of_sidra(raw):
    rows = sidra_rows(months(FIRST_PERIOD, REFERENCE_PERIOD))
    rows[10]["V"] = raw
    with pytest.raises(IpcaError, match="no index value"):
        parse(rows)


def test_rejects_more_than_two_decimals():
    rows = sidra_rows(months(FIRST_PERIOD, REFERENCE_PERIOD))
    rows[0]["V"] = "3633.4451"
    with pytest.raises(IpcaError, match="more than two decimals"):
        parse(rows)


def test_rejects_an_unexpected_period_code():
    rows = sidra_rows(months(FIRST_PERIOD, REFERENCE_PERIOD))
    rows[3]["D3C"] = "2013-04"
    with pytest.raises(IpcaError, match="unexpected period code"):
        parse(rows)
