/**
 * One-sentence readings of the charts ("Em 2025, custeio teve a maior parte: 55,4%."). They only
 * pick values the API returned (the row of a year, the largest of a list) and write them in
 * words; nothing is added, subtracted or divided here. Each returns null when the data needed
 * are missing, and the card then shows no reading.
 */
import type {
  ActivityShare,
  AverageContract,
  MatopibaYear,
  MonthShare,
  PurposeShare,
  RegionYear,
  StateYear,
  YearlyTotal,
} from "../../api/types";
import { ACTIVITY_LABEL, type Activity, PURPOSE_LABEL, type Purpose, REGION_LABEL, type Region, ufName } from "../../lib/domain";
import { formatInteger, formatMoney, formatPercent, monthName } from "../../lib/format";

const lower = (text: string) => text.toLocaleLowerCase("pt-BR");
const regionName = (region: string) => REGION_LABEL[region as Region] ?? region;

/** The item with the largest value (the first one on a tie), ignoring missing values. */
function largest<T>(items: readonly T[], value: (item: T) => number | null | undefined): T | undefined {
  let best: T | undefined;
  let bestValue = -Infinity;
  for (const item of items) {
    const current = value(item);
    if (typeof current === "number" && current > bestValue) {
      best = item;
      bestValue = current;
    }
  }
  return best;
}

/** "Em 2025: R$ 361,2 bi concedidos, queda real de 9,5% sobre 2024." */
export function trendReading(rows: readonly YearlyTotal[], year: number): string | null {
  const row = rows.find((item) => item.year === year);
  if (!row) return null;
  const change = row.change_real_pct;
  let comparison = "";
  if (typeof change === "number") {
    // A change that rounds to 0,0% is written as stable, never as "alta de 0,0%".
    const size = formatPercent(Math.abs(change));
    comparison =
      size === formatPercent(0)
        ? `, estável em termos reais sobre ${year - 1}`
        : `, ${change < 0 ? "queda" : "alta"} real de ${size} sobre ${year - 1}`;
  }
  return `Em ${year}: ${formatMoney(row.amount_nominal)} concedidos (valor nominal)${comparison}.`;
}

/** "Em 2025, a agricultura ficou com 69,3% do crédito e a pecuária com 30,7%." */
export function activityReading(rows: readonly ActivityShare[], year: number): string | null {
  const of = (activity: Activity) => rows.find((row) => row.year === year && row.activity === activity)?.share_pct;
  const agricultural = of("agricultural");
  const livestock = of("livestock");
  if (typeof agricultural !== "number" || typeof livestock !== "number") return null;
  return `Em ${year}, a ${lower(ACTIVITY_LABEL.agricultural)} ficou com ${formatPercent(agricultural)} do crédito e a ${lower(ACTIVITY_LABEL.livestock)} com ${formatPercent(livestock)}.`;
}

/** "Em 2025, custeio teve a maior parte: 55,4%; investimento, 39,1%." */
export function purposeReading(rows: readonly PurposeShare[], year: number): string | null {
  const ofYear = rows.filter((row) => row.year === year);
  const first = largest(ofYear, (row) => row.share_pct);
  const second = largest(
    ofYear.filter((row) => row !== first),
    (row) => row.share_pct,
  );
  if (!first) return null;
  const name = (purpose: string) => lower(PURPOSE_LABEL[purpose as Purpose] ?? purpose);
  const next = second ? `; ${name(second.purpose)}, ${formatPercent(second.share_pct)}` : "";
  return `Em ${year}, ${name(first.purpose)} teve a maior parte: ${formatPercent(first.share_pct)}${next}.`;
}

/** "Agosto é o mês de maior contratação: em média 13,4% do crédito de cada ano em 2017–2025." */
export function seasonalityReading(rows: readonly MonthShare[], period: string): string | null {
  const peak = largest(rows, (row) => row.avg_share_pct);
  if (!peak) return null;
  const month = monthName(peak.month);
  return `${month.charAt(0).toLocaleUpperCase("pt-BR")}${month.slice(1)} é o mês de maior contratação: em média ${formatPercent(peak.avg_share_pct)} do crédito de cada ano em ${period}.`;
}

/** "Em 2017–2025: R$ 163,3 mil por contrato, em 18.825.518 contratos (valores de dez/2025)." */
export function averageReading(rows: readonly AverageContract[], period: string): string | null {
  const total = rows.find((row) => row.year === null);
  if (!total || total.contracts === 0) return null;
  return `Em ${period}: ${formatMoney(total.average_real)} por contrato, em ${formatInteger(total.contracts)} contratos (valores de dez/2025).`;
}

/** "Em 2025, o Sul teve o maior valor: R$ 115,8 bi (valores de dez/2025)." */
export function regionAmountReading(rows: readonly RegionYear[], year: number): string | null {
  const top = largest(
    rows.filter((row) => row.year === year),
    (row) => row.amount_real,
  );
  return top ? `Em ${year}, o ${regionName(top.region)} teve o maior valor: ${formatMoney(top.amount_real)} (valores de dez/2025).` : null;
}

/** "Em 2025, o Sul teve a maior participação: 31,7% do crédito do Brasil." */
export function regionShareReading(rows: readonly RegionYear[], year: number): string | null {
  const top = largest(
    rows.filter((row) => row.year === year),
    (row) => row.share_pct,
  );
  return top ? `Em ${year}, o ${regionName(top.region)} teve a maior participação: ${formatPercent(top.share_pct)} do crédito do Brasil.` : null;
}

/** "Em 2025, Minas Gerais teve o maior valor entre os estados escolhidos: R$ 48,3 bi (valores de dez/2025)." */
export function statesAmountReading(rows: readonly StateYear[], year: number): string | null {
  const top = largest(
    rows.filter((row) => row.year === year),
    (row) => row.amount_real,
  );
  return top
    ? `Em ${year}, ${ufName(top.state)} teve o maior valor entre os estados escolhidos: ${formatMoney(top.amount_real)} (valores de dez/2025).`
    : null;
}

/** "Em 2025, Minas Gerais teve a maior participação no Brasil entre os escolhidos: 13,4%." */
export function statesShareReading(rows: readonly StateYear[], year: number): string | null {
  const top = largest(
    rows.filter((row) => row.year === year),
    (row) => row.share_of_brazil_pct,
  );
  return top
    ? `Em ${year}, ${ufName(top.state)} teve a maior participação no Brasil entre os escolhidos: ${formatPercent(top.share_of_brazil_pct)}.`
    : null;
}

/** "Em 2025, o MATOPIBA respondeu por 9,8% do crédito rural do Brasil; a maior parte veio da Bahia (3,9%)." */
export function matopibaReading(rows: readonly MatopibaYear[], year: number): string | null {
  const ofYear = rows.filter((row) => row.year === year);
  const bloc = ofYear.find((row) => row.state === null);
  const top = largest(
    ofYear.filter((row) => row.state !== null),
    (row) => row.share_of_brazil_pct,
  );
  if (!bloc) return null;
  const leader = top?.state ? `; o estado com a maior parte foi ${ufName(top.state)} (${formatPercent(top.share_of_brazil_pct)})` : "";
  return `Em ${year}, o MATOPIBA respondeu por ${formatPercent(bloc.share_of_brazil_pct)} do crédito rural do Brasil${leader}.`;
}
