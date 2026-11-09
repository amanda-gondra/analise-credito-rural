/**
 * Reshape API rows (one row per year and category) into one row per year with a column per
 * category, the form the charts draw. Values are copied, never computed.
 */
import type { ActivityShare, PurposeShare } from "../../api/types";
import { ACTIVITIES, ACTIVITY_LABEL, PURPOSES, PURPOSE_LABEL } from "../../lib/domain";
import { ACTIVITY_COLOR, PURPOSE_COLOR } from "../../lib/palette";
import type { ShareSeries } from "./Charts";

export type YearRow = Record<string, number | null> & { year: number };

export function pivot<T extends { year: number }>(rows: T[], key: (row: T) => string, value: (row: T) => number | null): YearRow[] {
  const byYear = new Map<number, YearRow>();
  for (const row of rows) {
    const entry = byYear.get(row.year) ?? ({ year: row.year } as YearRow);
    entry[key(row)] = value(row);
    byYear.set(row.year, entry);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

export const ACTIVITY_SERIES: ShareSeries[] = ACTIVITIES.map((key) => ({
  key,
  label: ACTIVITY_LABEL[key],
  color: ACTIVITY_COLOR[key],
}));

export const PURPOSE_SERIES: ShareSeries[] = PURPOSES.map((key) => ({
  key,
  label: PURPOSE_LABEL[key],
  color: PURPOSE_COLOR[key],
}));

/** Share of each part per year, plus its amount granted (nominal, the base of the share) for the tooltip. */
function shareRows<T extends { year: number; share_pct: number | null; amount_nominal: number }>(
  rows: T[],
  key: (row: T) => string,
): YearRow[] {
  const shares = pivot(rows, key, (row) => row.share_pct);
  const amounts = new Map(pivot(rows, (row) => `${key(row)}__amount`, (row) => row.amount_nominal).map((row) => [row.year, row]));
  return shares.map((row) => ({ ...amounts.get(row.year), ...row }));
}

export const activityRows = (rows: ActivityShare[]) => shareRows(rows, (row) => row.activity);
export const purposeRows = (rows: PurposeShare[]) => shareRows(rows, (row) => row.purpose);

/**
 * pivot, plus a second value of each series in a column "<key>__<suffix>" (the share beside
 * the amount), which the tooltips show and the lines do not draw.
 */
export function pivotWith<T extends { year: number }>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => number | null,
  second: (row: T) => number | null,
  suffix: string,
): YearRow[] {
  const extra = new Map(pivot(rows, (row) => `${key(row)}__${suffix}`, second).map((row) => [row.year, row]));
  return pivot(rows, key, value).map((row) => ({ ...extra.get(row.year), ...row }));
}
