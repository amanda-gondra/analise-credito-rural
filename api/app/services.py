"""Answers that combine more than one query, shared by the routes and the assistant,
so a number is computed in one place whoever asks for it."""

from __future__ import annotations

from typing import Any

from api.app.database import QueryRunner
from api.app.filters import PeriodFilters


def state_profile(database: QueryRunner, state: str, period: PeriodFilters) -> dict[str, Any]:
    """Question 7: ranking position, yearly series, activities and purposes of one UF."""
    params = {"first_year": period.start_year, "last_year": period.end_year}
    ranking = database.fetch("state_ranking", **params, activity_code=None, purpose=None)
    return {
        "state": state,
        "ranking": next((row for row in ranking if row["state_abbr"] == state), None),
        "yearly": database.fetch("yearly_totals", **params, state_abbr=state, activity_code=None, purpose=None),
        "activities": database.fetch("activity_split", **params, state_abbr=state),
        "purposes": database.fetch("purpose_split", **params, state_abbr=state, activity_code=None),
    }
