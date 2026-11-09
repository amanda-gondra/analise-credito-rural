"""The data explorer without a database: pages, cursor, summary and the CSV file."""

from __future__ import annotations

import base64
import json
from decimal import Decimal

import pytest

from api.app.explorer import (
    CSV_HEADER,
    FIRST_PAGE,
    MAX_EXPORT_ROWS,
    CreditKey,
    credit_csv,
    decode_cursor,
    encode_cursor,
)

PAGE_URL = "/api/v1/credit"
CSV_URL = "/api/v1/credit.csv"
FILTERS = {
    "first_year": 2017, "last_year": 2025, "state_abbr": None, "region_name": None,
    "activity_code": None, "purpose": None, "program_name": None,
}


def credit_row(month: int, program: str = "PRONAF", **overrides) -> dict:
    row = {
        "reference_year": 2025, "reference_month": month, "state_abbr": "PI", "region_name": "NORDESTE",
        "activity_code": "2", "purpose": "custeio", "program_name": program,
        "subprogram_name": "SEM SUBPROGRAMA", "funding_source_name": "RECURSOS OBRIGATÓRIOS",
        "contract_count": 3, "amount_nominal": Decimal("1234.50"), "amount_real": Decimal("1250.07"),
    }
    return {**row, **overrides}


def cursor_of(values: object) -> str:
    return base64.urlsafe_b64encode(json.dumps(values).encode()).decode().rstrip("=")


# --- pages ------------------------------------------------------------------------------------

def test_first_page_runs_the_rows_and_the_summary_with_the_default_period(client, fake_db):
    response = client.get(PAGE_URL)

    assert response.status_code == 200
    assert fake_db.calls == [
        ("credit_rows", {**FILTERS, **FIRST_PAGE, "row_limit": 51}),
        ("credit_summary", FILTERS),
    ]
    body = response.json()
    assert body["data"] == []
    assert body["page"] == {"limit": 50, "next_cursor": None, "csv_max_rows": MAX_EXPORT_ROWS}
    assert body["summary"] == {"rows": 0, "contracts": 0, "amount_real": 0.0}
    assert body["meta"]["filters"]["cursor"] is None
    assert body["meta"]["price_base"] == "2025-12"


def test_filters_reach_both_queries_with_the_stored_values(client, fake_db):
    client.get(f"{PAGE_URL}?state=pi&activity=livestock&purpose=custeio&program=%20PRONAF%20&start_year=2024&limit=10")

    stored = {
        **FILTERS, "first_year": 2024, "state_abbr": "PI", "activity_code": "2",
        "purpose": "custeio", "program_name": "PRONAF",
    }
    assert fake_db.calls == [("credit_rows", {**stored, **FIRST_PAGE, "row_limit": 11}), ("credit_summary", stored)]


def test_rows_are_renamed_and_codes_become_words(client, fake_db):
    fake_db.rows["credit_rows"] = [credit_row(1)]
    fake_db.rows["credit_summary"] = [{"row_count": 1, "contracts": 3, "amount_real": Decimal("1250.07")}]

    body = client.get(PAGE_URL).json()

    assert body["data"] == [{
        "year": 2025, "month": 1, "state": "PI", "region": "nordeste", "activity": "livestock",
        "purpose": "custeio", "program": "PRONAF", "subprogram": "SEM SUBPROGRAMA",
        "funding_source": "RECURSOS OBRIGATÓRIOS", "contracts": 3,
        "amount_nominal": 1234.5, "amount_real": 1250.07,
    }]
    assert body["summary"] == {"rows": 1, "contracts": 3, "amount_real": 1250.07}


def test_a_full_page_gives_the_cursor_of_its_last_row_and_the_cursor_continues_there(client, fake_db):
    fake_db.rows["credit_rows"] = [credit_row(1), credit_row(2, program="PRONAMP"), credit_row(3)]

    first = client.get(f"{PAGE_URL}?limit=2").json()

    assert [row["month"] for row in first["data"]] == [1, 2]
    cursor = first["page"]["next_cursor"]
    assert decode_cursor(cursor) == CreditKey(
        2025, 2, "PI", "2", "PRONAMP", "SEM SUBPROGRAMA", "RECURSOS OBRIGATÓRIOS", "custeio"
    )

    fake_db.calls.clear()
    client.get(PAGE_URL, params={"limit": 2, "cursor": cursor})

    rows_call = fake_db.calls[0]
    assert rows_call[0] == "credit_rows"
    assert {name: rows_call[1][name] for name in FIRST_PAGE} == {
        "after_year": 2025, "after_month": 2, "after_state": "PI", "after_activity": "2",
        "after_program": "PRONAMP", "after_subprogram": "SEM SUBPROGRAMA",
        "after_funding_source": "RECURSOS OBRIGATÓRIOS", "after_purpose": "custeio",
    }


def test_the_last_page_has_no_cursor(client, fake_db):
    fake_db.rows["credit_rows"] = [credit_row(1), credit_row(2)]

    assert client.get(f"{PAGE_URL}?limit=2").json()["page"]["next_cursor"] is None


def test_the_cursor_survives_accents_and_round_trips():
    key = CreditKey(2017, 12, "MA", "1", "PROGRAMA AÇÃO", "SUB-PROGRAMA Ç", "FONTE; \"ASPAS\"", "industrializacao")

    cursor = encode_cursor(key)

    assert set(cursor) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
    assert decode_cursor(cursor) == key


@pytest.mark.parametrize(
    "query",
    [
        "limit=0",
        "limit=501",
        "limit=dez",
        "cursor=%21%21%21",  # not base64url
        "cursor=" + "A" * 5_000,  # longer than any real cursor
        "cursor=bm90IGpzb24",  # base64 of "not json"
        "cursor=" + cursor_of([2025, 1]),
        "cursor=" + cursor_of([2026, 1, "PI", "2", "P", "S", "F", "custeio"]),  # year not loaded
        "cursor=" + cursor_of([2025, 13, "PI", "2", "P", "S", "F", "custeio"]),
        "cursor=" + cursor_of([True, 1, "PI", "2", "P", "S", "F", "custeio"]),  # bool is not a year
        "cursor=" + cursor_of([2025, 1, "XX", "2", "P", "S", "F", "custeio"]),
        "cursor=" + cursor_of([2025, 1, "PI", "3", "P", "S", "F", "custeio"]),
        "cursor=" + cursor_of([2025, 1, "PI", "2", "", "S", "F", "custeio"]),
        "cursor=" + cursor_of([2025, 1, "PI", "2", "P", "S", "F", "outra"]),
        "cursor=" + cursor_of({"year": 2025}),
        "state=PI&region=nordeste",
        "offset=100",
    ],
)
def test_invalid_page_parameters_get_422_and_no_query_runs(client, fake_db, query):
    response = client.get(f"{PAGE_URL}?{query}")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert fake_db.calls == []


# --- CSV --------------------------------------------------------------------------------------

def test_csv_is_made_for_spreadsheets_in_portuguese(client, fake_db):
    fake_db.rows["credit_summary"] = [{"row_count": 2, "contracts": 4, "amount_real": Decimal("1")}]
    fake_db.rows["credit_rows"] = [
        credit_row(1),
        credit_row(2, program="=HYPERLINK(\"x\")", subprogram_name="-1", funding_source_name="A; B",
                   region_name="CENTRO-OESTE", activity_code="1", purpose="comercializacao", amount_real=None),
    ]

    response = client.get(f"{CSV_URL}?state=PI&activity=livestock&start_year=2025")

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.headers["content-disposition"] == 'attachment; filename="credito-rural_2025-2025_pi_pecuaria.csv"'
    raw = response.content
    assert raw.startswith(b"\xef\xbb\xbf")  # BOM: Excel reads UTF-8
    lines = raw.decode("utf-8-sig").split("\r\n")
    assert lines[0] == (
        "ano;mes;uf;regiao;atividade;finalidade;programa;subprograma;fonte_de_recursos;"
        "contratos;valor_nominal_brl;valor_real_dez_2025_brl"
    )
    assert lines[1] == (
        "2025;1;PI;Nordeste;Pecuária;Custeio;PRONAF;SEM SUBPROGRAMA;RECURSOS OBRIGATÓRIOS;3;1234,50;1250,07"
    )
    assert lines[2] == (
        "2025;2;PI;Centro-Oeste;Agrícola;Comercialização;\"'=HYPERLINK(\"\"x\"\")\";'-1;\"A; B\";3;1234,50;"
    )
    assert lines[3] == ""  # the file ends with a line break


def test_csv_runs_the_count_first_and_then_one_row_over_the_limit(client, fake_db):
    client.get(f"{CSV_URL}?region=Sul")

    stored = {**FILTERS, "region_name": "SUL"}
    assert fake_db.calls == [
        ("credit_summary", stored),
        ("credit_rows", {**stored, **FIRST_PAGE, "row_limit": MAX_EXPORT_ROWS + 1}),
    ]


def test_csv_of_an_empty_selection_has_only_the_header(client):
    response = client.get(CSV_URL)

    assert response.status_code == 200
    assert response.content.decode("utf-8-sig") == ";".join(CSV_HEADER) + "\r\n"


def test_csv_above_the_limit_is_refused_before_reading_the_rows(client, fake_db):
    fake_db.rows["credit_summary"] = [{"row_count": MAX_EXPORT_ROWS + 1, "contracts": 1, "amount_real": 1}]

    response = client.get(CSV_URL)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "export_too_large"
    assert str(MAX_EXPORT_ROWS) in error["message"]
    assert [name for name, _ in fake_db.calls] == ["credit_summary"]


def test_csv_refuses_rows_that_appeared_after_the_count(client, fake_db):
    fake_db.rows["credit_summary"] = [{"row_count": 1, "contracts": 1, "amount_real": 1}]
    fake_db.rows["credit_rows"] = [credit_row(1)] * (MAX_EXPORT_ROWS + 1)

    assert client.get(CSV_URL).json()["error"]["code"] == "export_too_large"


@pytest.mark.parametrize("query", ["limit=10", "cursor=abc", "state=ZZ", "start_year=2030"])
def test_csv_accepts_only_the_filters(client, fake_db, query):
    response = client.get(f"{CSV_URL}?{query}")

    assert response.status_code == 422
    assert fake_db.calls == []


def test_csv_is_written_in_pieces():
    pieces = list(credit_csv([credit_row(month) for month in range(1, 6)], chunk_rows=2))

    assert len(pieces) == 3
    assert pieces[0].startswith("\N{ZERO WIDTH NO-BREAK SPACE}ano;")
    assert "".join(pieces).count("\r\n") == 6  # header and five rows
