"""Tests for pipeline/transform.py.

Each test writes a tiny gzip file in the same format as the BCB files, with a
handful of rows, so the tests run in milliseconds and need no network or database.
"""

import gzip
from pathlib import Path

import pandas as pd
import pytest

from pipeline.transform import (
    EXPECTED_COLUMNS,
    Severity,
    StateRef,
    ValidationError,
    to_cents,
    transform,
)

YEAR = 2024
STATES = {"PIAUÍ": StateRef("PI", 22), "MARANHÃO": StateRef("MA", 21)}
ACTIVITIES = {"AGRÍCOLA": "1", "PECUÁRIA": "2"}
PURPOSES = ["CUSTEIO", "INVESTIMENTO", "COMERCIALIZACAO", "INDUSTRIALIZACAO"]


def make_row(**overrides: str) -> dict[str, str]:
    """One source row with valid defaults. TOTAL_* are computed unless overridden."""
    row = {
        "ANO_MES_EMISSAO": f"{YEAR}-01-01", "REGIAO": "NORDESTE", "UF": "PIAUÍ",
        "COD_MUNICIPIO_IBGE": "2211001,0", "MUNICIPIO": "TERESINA", "ATIVIDADE": "AGRÍCOLA",
        "PROGRAMA": "PRONAF", "SUBPROGRAMA": "SEM SUBPROGRAMA", "FONTE_RECURSO": "RECURSOS OBRIGATÓRIOS",
        "SEGMENTO_IF": "BANCO PÚBLICO", "CNPJ_IF": "00000000", "NOME_IF": "BANCO A",
        "CUSTEIO_AREA": "0,00", "CUSTEIO_QTDE": "1", "CUSTEIO_VALOR": "1000,50",
        "INVESTIMENTO_AREA": "0,00", "INVESTIMENTO_QTDE": "0", "INVESTIMENTO_VALOR": "0,00",
        "COMERCIALIZACAO_QTDE": "0", "COMERCIALIZACAO_VALOR": "0,00",
        "INDUSTRIALIZACAO_QTDE": "0", "INDUSTRIALIZACAO_VALOR": "0,00",
        "TOTAL_AREA": "0,00",
    }
    row.update(overrides)
    if "TOTAL_QTDE" not in overrides:
        row["TOTAL_QTDE"] = str(sum(int(row[f"{p}_QTDE"]) for p in PURPOSES))
    if "TOTAL_VALOR" not in overrides:
        cents = sum(int(to_cents(pd.Series([row[f"{p}_VALOR"]]))[0]) for p in PURPOSES)
        row["TOTAL_VALOR"] = f"{cents // 100},{cents % 100:02d}"
    return row


def write_source(path: Path, rows: list[dict[str, str]], columns: list[str] = EXPECTED_COLUMNS) -> Path:
    lines = [";".join(columns)] + [";".join(row[c] for c in columns) for row in rows]
    with gzip.open(path, "wt", encoding="utf-8-sig", newline="") as file:
        file.write("\r\n".join(lines) + "\r\n")
    return path


def run(tmp_path: Path, rows: list[dict[str, str]], **kwargs):
    return transform(write_source(tmp_path / "source.gz", rows, **kwargs), YEAR, STATES, ACTIVITIES)


def critical_rules(error: ValidationError) -> set[str]:
    return {i.rule for i in error.issues if i.severity is Severity.CRITICAL}


# --- conversion -------------------------------------------------------------

def test_to_cents_is_exact():
    values = pd.Series(["0,05", "1,5", "10", "501900,00", "99999999999,99"])
    assert to_cents(values).tolist() == [5, 150, 1000, 50190000, 9999999999999]


# --- aggregation ------------------------------------------------------------

def test_sums_municipalities_and_institutions_within_the_state(tmp_path):
    rows = [
        make_row(),
        make_row(MUNICIPIO="PARNAÍBA", COD_MUNICIPIO_IBGE="2207702,0", CUSTEIO_VALOR="99,50", CUSTEIO_QTDE="2"),
        make_row(CNPJ_IF="11111111", CUSTEIO_VALOR="0,00", CUSTEIO_QTDE="0", INVESTIMENTO_VALOR="500,00", INVESTIMENTO_QTDE="1"),
    ]
    result = run(tmp_path, rows)

    facts = result.facts.set_index("purpose")
    assert set(facts.index) == {"custeio", "investimento"}  # 0/0 purposes are not stored
    assert facts.loc["custeio", "amount_cents"] == 110000  # 1000,50 + 99,50
    assert facts.loc["custeio", "contract_count"] == 3
    assert facts.loc["investimento", "amount_cents"] == 50000
    assert (result.facts["state_abbr"] == "PI").all()
    assert (result.facts["activity_code"] == "1").all()


def test_each_of_the_four_purposes_becomes_one_row(tmp_path):
    row = make_row(
        CUSTEIO_QTDE="1", CUSTEIO_VALOR="1,00", INVESTIMENTO_QTDE="2", INVESTIMENTO_VALOR="2,00",
        COMERCIALIZACAO_QTDE="3", COMERCIALIZACAO_VALOR="3,00", INDUSTRIALIZACAO_QTDE="4", INDUSTRIALIZACAO_VALOR="4,00",
    )
    facts = run(tmp_path, [row]).facts.set_index("purpose")
    assert facts["amount_cents"].to_dict() == {"comercializacao": 300, "custeio": 100, "industrializacao": 400, "investimento": 200}
    assert facts["contract_count"].to_dict() == {"comercializacao": 3, "custeio": 1, "industrializacao": 4, "investimento": 2}


def test_keeps_every_cent_and_contract(tmp_path):
    result = run(tmp_path, [make_row(), make_row(UF="MARANHÃO", COD_MUNICIPIO_IBGE="2111300,0", CUSTEIO_VALOR="0,01")])
    assert result.source_row_count == 2
    assert result.source_total_amount_cents == 100051  # 1000,50 + 0,01
    assert result.facts["amount_cents"].sum() == result.source_total_amount_cents
    assert result.facts["contract_count"].sum() == result.source_total_qty == 2


def test_keeps_contracts_with_zero_amount_as_a_warning(tmp_path):
    result = run(tmp_path, [make_row(CUSTEIO_VALOR="0,00", CUSTEIO_QTDE="3")])
    assert result.facts["contract_count"].sum() == 3
    assert any(i.rule == "7.count_without_amount" and i.severity is Severity.WARNING for i in result.issues)


def test_flags_missing_months_without_stopping(tmp_path):
    result = run(tmp_path, [make_row()])  # only January
    assert any(i.rule == "8.months" and i.severity is Severity.IMPORTANT for i in result.issues)


# --- critical rules -----------------------------------------------------------

def test_rejects_a_changed_header(tmp_path):
    columns = [c for c in EXPECTED_COLUMNS if c != "TOTAL_AREA"]
    with pytest.raises(ValidationError) as error:
        run(tmp_path, [make_row()], columns=columns)
    assert critical_rules(error.value) == {"2.header"}


@pytest.mark.parametrize("value", ["1000,505", "1.000,50", "-10,00", "10,", ""])
def test_rejects_malformed_money(tmp_path, value):
    with pytest.raises(ValidationError) as error:
        run(tmp_path, [make_row(CUSTEIO_VALOR=value, TOTAL_VALOR="0,00")])
    assert "3.money_format" in critical_rules(error.value)


def test_rejects_rows_from_another_year(tmp_path):
    with pytest.raises(ValidationError) as error:
        run(tmp_path, [make_row(ANO_MES_EMISSAO=f"{YEAR - 1}-12-01")])
    assert critical_rules(error.value) == {"3.other_year"}


def test_rejects_duplicated_source_key_even_if_other_columns_differ(tmp_path):
    # NOME_IF is not part of the key: same key with another name is still a duplicate.
    with pytest.raises(ValidationError) as error:
        run(tmp_path, [make_row(), make_row(NOME_IF="BANCO A S.A.")])
    assert critical_rules(error.value) == {"5.source_key"}


def test_same_place_with_another_institution_is_not_a_duplicate(tmp_path):
    result = run(tmp_path, [make_row(), make_row(CNPJ_IF="11111111")])
    assert result.source_row_count == 2


def test_rejects_unknown_state(tmp_path):
    with pytest.raises(ValidationError) as error:
        run(tmp_path, [make_row(UF="PIAUI")])  # without the accent
    assert critical_rules(error.value) == {"6.state"}


def test_rejects_unknown_activity(tmp_path):
    with pytest.raises(ValidationError) as error:
        run(tmp_path, [make_row(ATIVIDADE="AQUICULTURA")])
    assert critical_rules(error.value) == {"6.activity"}


def test_rejects_row_total_that_differs_from_the_purposes(tmp_path):
    with pytest.raises(ValidationError) as error:
        run(tmp_path, [make_row(TOTAL_VALOR="999,99")])
    assert critical_rules(error.value) == {"7.row_total"}


def test_rejects_empty_dimension(tmp_path):
    with pytest.raises(ValidationError) as error:
        run(tmp_path, [make_row(PROGRAMA="")])
    assert critical_rules(error.value) == {"4.required"}
