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

export const activityRows = (rows: ActivityShare[]) => pivot(rows, (row) => row.activity, (row) => row.share_pct);
export const purposeRows = (rows: PurposeShare[]) => pivot(rows, (row) => row.purpose, (row) => row.share_pct);
