"""Read one yearly MDCR file, validate it and aggregate it to the credit_monthly grain.

Input: a MATRIZ_CR_REGIAO_<year>.gz file (one row per month x municipality x
activity x program x subprogram x funding source x financial institution, with
the four purposes as column pairs).

Output: rows for rural_credit.credit_monthly (one row per month x state x
activity x program x subprogram x funding source x purpose), plus the control
totals for rural_credit.source_file and the list of quality issues found.

Money is handled as integer cents from the moment it is read, never as float,
so sums are exact (docs/qualidade-dados.md, rule 3). The rules referenced below
by number are the sections of that document.

This module does not touch the database. The state and activity mappings are
passed in by the caller, which reads them from the reference tables, so the
database stays the single source of truth for valid categories.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import pandas as pd

EXPECTED_COLUMNS = [
    "ANO_MES_EMISSAO", "REGIAO", "UF", "COD_MUNICIPIO_IBGE", "MUNICIPIO", "ATIVIDADE",
    "PROGRAMA", "SUBPROGRAMA", "FONTE_RECURSO", "SEGMENTO_IF", "CNPJ_IF", "NOME_IF",
    "CUSTEIO_AREA", "CUSTEIO_QTDE", "CUSTEIO_VALOR",
    "INVESTIMENTO_AREA", "INVESTIMENTO_QTDE", "INVESTIMENTO_VALOR",
    "COMERCIALIZACAO_QTDE", "COMERCIALIZACAO_VALOR",
    "INDUSTRIALIZACAO_QTDE", "INDUSTRIALIZACAO_VALOR",
    "TOTAL_AREA", "TOTAL_QTDE", "TOTAL_VALOR",
]

# purpose (database value) -> column prefix in the source file, as in ref_purpose
PURPOSE_PREFIXES = {
    "custeio": "CUSTEIO",
    "investimento": "INVESTIMENTO",
    "comercializacao": "COMERCIALIZACAO",
    "industrializacao": "INDUSTRIALIZACAO",
}

REQUIRED_TEXT_COLUMNS = ["ANO_MES_EMISSAO", "UF", "ATIVIDADE", "PROGRAMA", "SUBPROGRAMA", "FONTE_RECURSO"]
SOURCE_KEY = ["ANO_MES_EMISSAO", "UF", "COD_MUNICIPIO_IBGE", "MUNICIPIO", "ATIVIDADE",
              "PROGRAMA", "SUBPROGRAMA", "FONTE_RECURSO", "CNPJ_IF"]
FACT_KEY = ["reference_month", "state_abbr", "activity_code", "program_name", "subprogram_name", "funding_source_name"]

MONEY_PATTERN = r"^\d+(,\d{1,2})?$"  # digits, optional comma and at most 2 decimals
COUNT_PATTERN = r"^\d+$"
MONTH_PATTERN = r"^(\d{4})-(\d{2})-01$"

PROGRAM_NOT_INFORMED = "NÃO INFORMADO"
PROGRAM_NOT_INFORMED_MAX_SHARE = 0.05
COVERAGE_MIN_RATIO, COVERAGE_MAX_RATIO = 0.5, 2.0


class Severity(Enum):
    CRITICAL = "critical"    # stops the load
    IMPORTANT = "important"  # loads, but the affected analysis must document it
    WARNING = "warning"      # loads; may be legitimate behaviour of the source


@dataclass(frozen=True)
class Issue:
    severity: Severity
    rule: str
    message: str


@dataclass(frozen=True)
class StateRef:
    abbr: str
    ibge_code: int


@dataclass
class TransformResult:
    reference_year: int
    facts: pd.DataFrame
    source_row_count: int
    source_total_qty: int
    source_total_amount_cents: int
    issues: list[Issue] = field(default_factory=list)


class ValidationError(Exception):
    """Raised when a critical rule fails. Carries every issue found up to that point."""

    def __init__(self, issues: list[Issue]):
        self.issues = issues
        critical = [i for i in issues if i.severity is Severity.CRITICAL]
        super().__init__("; ".join(f"[{i.rule}] {i.message}" for i in critical))


def read_source(path: Path) -> pd.DataFrame:
    """Read every column as text. Conversions happen later, under validation."""
    return pd.read_csv(
        path, sep=";", compression="gzip", encoding="utf-8-sig",
        dtype=str, keep_default_na=False, na_filter=False,
    )


def to_cents(values: pd.Series) -> pd.Series:
    """Convert '1234,5' -> 123450 (int64 cents). Assumes MONEY_PATTERN was already checked."""
    parts = values.str.split(",", n=1, expand=True)
    integer = parts[0].astype("int64")
    if parts.shape[1] == 1:
        return integer * 100
    decimals = parts[1].fillna("").str.ljust(2, "0").astype("int64")  # "" -> "00", "5" -> "50"
    return integer * 100 + decimals


def transform(path: Path, year: int, states: dict[str, StateRef], activities: dict[str, str]) -> TransformResult:
    """Validate and aggregate one yearly file.

    states: source state name (column UF) -> StateRef, from ref_state.
    activities: source label (column ATIVIDADE) -> activity_code, from ref_activity.
    Raises ValidationError if any critical rule fails.
    """
    issues: list[Issue] = []
    raw = read_source(path)

    # Rule 2: structure
    if list(raw.columns) != EXPECTED_COLUMNS:
        missing = [c for c in EXPECTED_COLUMNS if c not in raw.columns]
        extra = [c for c in raw.columns if c not in EXPECTED_COLUMNS]
        issues.append(Issue(Severity.CRITICAL, "2.header",
                            f"unexpected header; missing={missing}, extra={extra}, or columns out of order"))
        raise ValidationError(issues)

    _check_text_and_formats(raw, year, issues)
    _raise_if_critical(issues)

    data = _convert(raw)
    _check_categories(data, states, activities, issues)
    _check_values(data, issues)
    _check_uniqueness(data, issues)
    _raise_if_critical(issues)
    _check_coverage(data, issues)

    facts = _aggregate(data, states, activities)
    result = TransformResult(
        reference_year=year,
        facts=facts,
        source_row_count=len(data),
        source_total_qty=int(data["TOTAL_QTDE"].sum()),
        source_total_amount_cents=int(data["TOTAL_VALOR"].sum()),
        issues=issues,
    )
    _check_reconciliation(result, issues)
    _raise_if_critical(issues)
    return result


def _raise_if_critical(issues: list[Issue]) -> None:
    if any(i.severity is Severity.CRITICAL for i in issues):
        raise ValidationError(issues)


def _check_text_and_formats(raw: pd.DataFrame, year: int, issues: list[Issue]) -> None:
    # Rule 4: required dimensions filled
    for column in REQUIRED_TEXT_COLUMNS:
        empty = int((raw[column].str.strip() == "").sum())
        if empty:
            issues.append(Issue(Severity.CRITICAL, "4.required", f"{column} empty in {empty} rows"))
    empty_municipality = int((raw["COD_MUNICIPIO_IBGE"] == "").sum())
    if empty_municipality:
        issues.append(Issue(Severity.WARNING, "4.municipality_code",
                            f"COD_MUNICIPIO_IBGE empty in {empty_municipality} rows (state comes from column UF)"))

    # Rule 3: month format and year
    month_parts = raw["ANO_MES_EMISSAO"].str.extract(MONTH_PATTERN)
    bad_month = month_parts[0].isna() | ~month_parts[1].isin([f"{m:02d}" for m in range(1, 13)])
    if bad_month.any():
        issues.append(Issue(Severity.CRITICAL, "3.month_format", f"invalid ANO_MES_EMISSAO in {int(bad_month.sum())} rows"))
    other_year = (~bad_month) & (month_parts[0] != str(year))
    if other_year.any():
        issues.append(Issue(Severity.CRITICAL, "3.other_year", f"{int(other_year.sum())} rows from a year other than {year}"))

    # Rule 3: number formats (at most 2 decimals, so NUMERIC(15,2) never rounds)
    for prefix in [*PURPOSE_PREFIXES.values(), "TOTAL"]:
        bad_money = ~raw[f"{prefix}_VALOR"].str.match(MONEY_PATTERN)
        if bad_money.any():
            sample = raw.loc[bad_money, f"{prefix}_VALOR"].iloc[0]
            issues.append(Issue(Severity.CRITICAL, "3.money_format",
                                f"{prefix}_VALOR malformed in {int(bad_money.sum())} rows, e.g. {sample!r}"))
        bad_count = ~raw[f"{prefix}_QTDE"].str.match(COUNT_PATTERN)
        if bad_count.any():
            issues.append(Issue(Severity.CRITICAL, "3.count_format", f"{prefix}_QTDE not a non-negative integer in {int(bad_count.sum())} rows"))


def _convert(raw: pd.DataFrame) -> pd.DataFrame:
    data = raw.copy()
    data["reference_month"] = data["ANO_MES_EMISSAO"].str.slice(5, 7).astype("int16")
    for prefix in [*PURPOSE_PREFIXES.values(), "TOTAL"]:
        data[f"{prefix}_QTDE"] = data[f"{prefix}_QTDE"].astype("int64")
        data[f"{prefix}_VALOR"] = to_cents(data[f"{prefix}_VALOR"])
    return data


def _check_categories(data: pd.DataFrame, states: dict[str, StateRef], activities: dict[str, str], issues: list[Issue]) -> None:
    # Rule 6
    unknown_states = sorted(set(data["UF"]) - set(states))
    if unknown_states:
        issues.append(Issue(Severity.CRITICAL, "6.state", f"states not in ref_state: {unknown_states}"))
    unknown_activities = sorted(set(data["ATIVIDADE"]) - set(activities))
    if unknown_activities:
        issues.append(Issue(Severity.CRITICAL, "6.activity", f"activities not in ref_activity: {unknown_activities}"))
    if not unknown_states:
        with_code = data[data["COD_MUNICIPIO_IBGE"] != ""]
        expected_prefix = with_code["UF"].map(lambda name: str(states[name].ibge_code))
        mismatch = int((with_code["COD_MUNICIPIO_IBGE"].str.slice(0, 2) != expected_prefix).sum())
        if mismatch:
            issues.append(Issue(Severity.IMPORTANT, "6.municipality_state", f"{mismatch} rows whose municipality code does not belong to the state"))

    not_informed = data.loc[data["PROGRAMA"] == PROGRAM_NOT_INFORMED, "TOTAL_VALOR"].sum()
    share = not_informed / max(int(data["TOTAL_VALOR"].sum()), 1)
    if share > PROGRAM_NOT_INFORMED_MAX_SHARE:
        issues.append(Issue(Severity.IMPORTANT, "6.program_not_informed", f"{share:.1%} of the amount has program {PROGRAM_NOT_INFORMED!r}"))


def _check_values(data: pd.DataFrame, issues: list[Issue]) -> None:
    # Rule 7 (negatives are impossible here: the formats above accept digits only)
    qty_sum = sum(data[f"{p}_QTDE"] for p in PURPOSE_PREFIXES.values())
    amount_sum = sum(data[f"{p}_VALOR"] for p in PURPOSE_PREFIXES.values())
    if (qty_sum != data["TOTAL_QTDE"]).any() or (amount_sum != data["TOTAL_VALOR"]).any():
        bad = int(((qty_sum != data["TOTAL_QTDE"]) | (amount_sum != data["TOTAL_VALOR"])).sum())
        issues.append(Issue(Severity.CRITICAL, "7.row_total", f"TOTAL_* differs from the sum of the four purposes in {bad} rows"))
    for prefix in PURPOSE_PREFIXES.values():
        qty, amount = data[f"{prefix}_QTDE"], data[f"{prefix}_VALOR"]
        count_without_amount = int(((qty > 0) & (amount == 0)).sum())
        if count_without_amount:
            issues.append(Issue(Severity.WARNING, "7.count_without_amount", f"{prefix}: {count_without_amount} rows with contracts and zero amount (kept)"))
        amount_without_count = int(((amount > 0) & (qty == 0)).sum())
        if amount_without_count:
            issues.append(Issue(Severity.IMPORTANT, "7.amount_without_count", f"{prefix}: {amount_without_count} rows with amount and zero contracts"))


def _check_uniqueness(data: pd.DataFrame, issues: list[Issue]) -> None:
    # Rule 5
    duplicated = int(data.duplicated(subset=SOURCE_KEY).sum())
    if duplicated:
        issues.append(Issue(Severity.CRITICAL, "5.source_key", f"{duplicated} duplicated rows on the source key"))


def _check_coverage(data: pd.DataFrame, issues: list[Issue]) -> None:
    # Rule 8
    months = sorted(data["reference_month"].unique())
    if months != list(range(1, 13)):
        missing = sorted(set(range(1, 13)) - set(months))
        issues.append(Issue(Severity.IMPORTANT, "8.months", f"months missing: {missing} (year not usable in the main series)"))
    by_month = data.groupby("reference_month").agg(rows=("TOTAL_QTDE", "size"), contracts=("TOTAL_QTDE", "sum"))
    for column in ["rows", "contracts"]:
        ratio = by_month[column] / by_month[column].median()
        outside = ratio[(ratio < COVERAGE_MIN_RATIO) | (ratio > COVERAGE_MAX_RATIO)]
        for month, value in outside.items():
            issues.append(Issue(Severity.IMPORTANT, "8.coverage", f"month {month}: {column} at {value:.0%} of the yearly median"))


def _aggregate(data: pd.DataFrame, states: dict[str, StateRef], activities: dict[str, str]) -> pd.DataFrame:
    """Sum municipalities and institutions within each state, then one row per purpose (long format)."""
    keyed = pd.DataFrame({
        "reference_month": data["reference_month"],
        "state_abbr": data["UF"].map(lambda name: states[name].abbr),
        "activity_code": data["ATIVIDADE"].map(activities),
        "program_name": data["PROGRAMA"],
        "subprogram_name": data["SUBPROGRAMA"],
        "funding_source_name": data["FONTE_RECURSO"],
    })
    long_parts = []
    for purpose, prefix in PURPOSE_PREFIXES.items():
        part = keyed.assign(purpose=purpose, contract_count=data[f"{prefix}_QTDE"], amount_cents=data[f"{prefix}_VALOR"])
        long_parts.append(part)
    long = pd.concat(long_parts, ignore_index=True)
    facts = long.groupby([*FACT_KEY, "purpose"], as_index=False, sort=True)[["contract_count", "amount_cents"]].sum()
    # A purpose pair with 0 contracts and 0 amount represents nothing (decision D6).
    return facts[(facts["contract_count"] > 0) | (facts["amount_cents"] > 0)].reset_index(drop=True)


def _check_reconciliation(result: TransformResult, issues: list[Issue]) -> None:
    # Rule 9, before the load: the aggregated facts must keep every cent and every contract.
    facts_amount = int(result.facts["amount_cents"].sum())
    facts_qty = int(result.facts["contract_count"].sum())
    if facts_amount != result.source_total_amount_cents or facts_qty != result.source_total_qty:
        issues.append(Issue(Severity.CRITICAL, "9.reconciliation",
                            f"aggregation changed totals: amount {facts_amount} vs {result.source_total_amount_cents} cents, "
                            f"contracts {facts_qty} vs {result.source_total_qty}"))
