"""Reconciliation tests for sql/queries.sql against the loaded database.

The source is revised daily, so no test checks a fixed amount. They check that the
queries agree with the control totals of the source files and with each other: parts
add up to the whole, shares add up to 100%, filters return the same number by two paths.
"""

from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from tests.sql.conftest import MAIN_SERIES, load_queries

FIRST, LAST = MAIN_SERIES
YEARS = range(FIRST, LAST + 1)
PERIOD = {"first_year": FIRST, "last_year": LAST}
CENT = Decimal("0.01")


@pytest.fixture(scope="module")
def yearly(run):
    rows = run("yearly_totals", **PERIOD, state_abbr=None, activity_code=None, purpose=None)
    return {r["reference_year"]: r for r in rows}


@pytest.fixture(scope="module")
def national_real(yearly):
    return sum(r["amount_real"] for r in yearly.values())


def close(a: Decimal, b: Decimal, tolerance: Decimal) -> bool:
    """Rounded results summed again may differ by a few cents; the tolerance says how many."""
    return abs(a - b) <= tolerance


# --- the file itself -------------------------------------------------------------------------

def test_every_question_has_its_query():
    expected = {
        "yearly_totals", "state_ranking", "matopiba_yearly", "activity_split", "purpose_split",
        "states_yearly", "regions_yearly", "program_ranking", "funding_source_ranking",
        "seasonality", "average_contract_value",
    }
    assert set(load_queries()) == expected


# --- view and question 1 ---------------------------------------------------------------------

def test_view_keeps_every_fact_and_every_month_has_an_index(engine):
    with engine.connect() as c:
        view, table = c.execute(text(
            "SELECT (SELECT COUNT(*) FROM credit_monthly_adjusted), (SELECT COUNT(*) FROM credit_monthly)"
        )).one()
        without_index = c.execute(text(
            "SELECT COUNT(*) FROM credit_monthly_adjusted WHERE credit_amount_real IS NULL AND reference_year <= :last"
        ), {"last": LAST}).scalar_one()
    assert view == table
    assert without_index == 0


def test_yearly_totals_equal_the_source_files(engine, yearly):
    with engine.connect() as c:
        source = dict(c.execute(text(
            "SELECT reference_year, source_total_amount FROM source_file WHERE reference_year BETWEEN :a AND :b"
        ), {"a": FIRST, "b": LAST}).all())
    assert set(yearly) == set(YEARS)
    for year, row in yearly.items():
        assert row["amount_nominal"] == source[year], year


def test_yearly_change_is_undefined_for_the_first_year(yearly):
    assert yearly[FIRST]["change_nominal_pct"] is None
    assert yearly[FIRST]["change_real_pct"] is None
    assert all(yearly[y]["change_nominal_pct"] is not None for y in YEARS if y > FIRST)


def test_reference_year_prices_are_close_to_nominal(yearly):
    row = yearly[LAST]  # December 2025 prices: 2025 amounts change only by the inflation inside 2025
    assert abs(row["amount_real"] / row["amount_nominal"] - 1) < Decimal("0.05")


# --- questions 2 and 3 -----------------------------------------------------------------------

def test_state_ranking_covers_27_states_and_the_national_total(run, national_real):
    rows = run("state_ranking", **PERIOD, activity_code=None, purpose=None)
    assert len(rows) == 27
    assert [r["position"] for r in rows] == sorted(r["position"] for r in rows)
    assert close(sum(r["amount_real"] for r in rows), national_real, Decimal("1.00"))
    assert close(sum(r["share_pct"] for r in rows), Decimal(100), Decimal("0.2"))


@pytest.mark.parametrize("year", [2023, 2024])
def test_matopiba_bloc_is_the_sum_of_its_four_states(run, year):
    rows = run("matopiba_yearly", first_year=year, last_year=year)
    states = [r for r in rows if r["state_abbr"] is not None]
    bloc = next(r for r in rows if r["state_abbr"] is None)
    assert sorted(r["state_abbr"] for r in states) == ["BA", "MA", "PI", "TO"]
    assert bloc["amount_nominal"] == sum(r["amount_nominal"] for r in states)
    assert 0 < bloc["share_of_brazil_pct"] < 100


# --- questions 4 and 5 -----------------------------------------------------------------------

def test_activities_add_up_to_each_year(run, yearly):
    rows = run("activity_split", **PERIOD, state_abbr=None)
    for year in YEARS:
        parts = [r for r in rows if r["reference_year"] == year]
        assert sum(r["amount_nominal"] for r in parts) == yearly[year]["amount_nominal"], year
        assert close(sum(r["share_pct"] for r in parts), Decimal(100), CENT * 2), year


def test_four_purposes_add_up_to_each_year(run, yearly):
    rows = run("purpose_split", **PERIOD, state_abbr=None, activity_code=None)
    for year in YEARS:
        parts = [r for r in rows if r["reference_year"] == year]
        assert [r["purpose"] for r in parts] == ["custeio", "investimento", "comercializacao", "industrializacao"]
        assert sum(r["amount_nominal"] for r in parts) == yearly[year]["amount_nominal"], year


def test_filters_give_the_same_number_by_two_queries(run):
    filtered = run("yearly_totals", first_year=2024, last_year=2024, state_abbr="PI", activity_code="2", purpose=None)
    split = run("activity_split", first_year=2024, last_year=2024, state_abbr="PI")
    livestock = next(r for r in split if r["activity_code"] == "2")
    assert filtered[0]["amount_nominal"] == livestock["amount_nominal"]


# --- question 6 ------------------------------------------------------------------------------

def test_states_yearly_matches_yearly_totals_filtered_by_state(run):
    rows = run("states_yearly", first_year=2024, last_year=2024, state_abbrs=["PI", "CE"])
    assert sorted(r["state_abbr"] for r in rows) == ["CE", "PI"]
    for row in rows:
        single = run("yearly_totals", first_year=2024, last_year=2024, state_abbr=row["state_abbr"],
                     activity_code=None, purpose=None)
        assert row["amount_nominal"] == single[0]["amount_nominal"]


def test_regions_add_up_to_each_year_and_to_their_states(run, yearly):
    rows = run("regions_yearly", **PERIOD, activity_code=None, purpose=None)
    for year in YEARS:
        parts = [r for r in rows if r["reference_year"] == year]
        assert len(parts) == 5
        assert sum(r["amount_nominal"] for r in parts) == yearly[year]["amount_nominal"], year
    ranking = run("state_ranking", **PERIOD, activity_code=None, purpose=None)
    northeast_states = sum(r["amount_real"] for r in ranking if r["region_name"] == "NORDESTE")
    northeast_region = sum(r["amount_real"] for r in rows if r["region_name"] == "NORDESTE")
    assert close(northeast_states, northeast_region, Decimal("0.50"))


# --- questions 8 and 9 -----------------------------------------------------------------------

@pytest.mark.parametrize("query", ["program_ranking", "funding_source_ranking"])
def test_rankings_add_up_to_the_national_total(run, national_real, query):
    rows = run(query, **PERIOD, state_abbr=None)
    assert len(rows) > 1
    assert close(sum(r["amount_real"] for r in rows), national_real, Decimal("1.00"))
    assert close(sum(r["share_pct"] for r in rows), Decimal(100), Decimal("0.5"))


# --- question 10 -----------------------------------------------------------------------------

@pytest.mark.parametrize("purpose", [None, "custeio"])
def test_seasonality_has_12_months_that_add_up_to_100(run, purpose):
    rows = run("seasonality", **PERIOD, state_abbr=None, purpose=purpose)
    assert [r["reference_month"] for r in rows] == list(range(1, 13))
    assert all(r["years"] == len(YEARS) for r in rows)
    assert all(r["min_share_pct"] <= r["avg_share_pct"] <= r["max_share_pct"] for r in rows)
    assert close(sum(r["avg_share_pct"] for r in rows), Decimal(100), Decimal("0.1"))


# --- question 11 -----------------------------------------------------------------------------

def test_average_is_the_ratio_of_the_sums(run, yearly):
    rows = run("average_contract_value", first_year=2024, last_year=2024, state_abbr=None, region_name=None,
               activity_code=None, purpose=None, program_name=None)
    expected = (yearly[2024]["amount_nominal"] / yearly[2024]["contracts"]).quantize(CENT)
    assert rows[0]["average_nominal"] == expected


def test_average_has_a_period_row_consistent_with_the_years(run):
    rows = run("average_contract_value", **PERIOD, state_abbr=None, region_name="NORDESTE",
               activity_code=None, purpose="investimento", program_name=None)
    years, period = rows[:-1], rows[-1]
    assert period["reference_year"] is None
    assert period["contracts"] == sum(r["contracts"] for r in years)
    assert close(period["average_real"] * period["contracts"], period["amount_real"], period["contracts"] * CENT / 2)


def test_an_impossible_filter_returns_no_average_instead_of_an_error(run):
    rows = run("average_contract_value", first_year=2024, last_year=2024, state_abbr="PI", region_name="SUL",
               activity_code=None, purpose=None, program_name=None)
    assert rows[-1]["contracts"] is None
    assert rows[-1]["average_nominal"] is None


# --- read-only access ------------------------------------------------------------------------

def test_the_reader_role_cannot_write(engine):
    with pytest.raises(DBAPIError, match="read-only transaction"), engine.connect() as c:
        c.execute(text("DELETE FROM ipca_monthly"))
