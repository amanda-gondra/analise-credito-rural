/**
 * Classes of the choropleth: fixed breaks of the share of the national total, the same for
 * every period and activity, so a color always means the same share. The breaks are round
 * numbers that separate the small UFs (under 0,5%) from the largest (10% or more).
 */
import { formatPercent } from "./format";

export const SHARE_BREAKS = [0.5, 1, 2.5, 5, 10] as const;
export const SHARE_CLASSES = SHARE_BREAKS.length + 1;

/** Index 0 (lightest) to 5 (darkest); null when there is no value. */
export function shareClass(share: number | null | undefined): number | null {
  if (share == null || !Number.isFinite(share)) return null;
  const index = SHARE_BREAKS.findIndex((limit) => share < limit);
  return index === -1 ? SHARE_BREAKS.length : index;
}

export function shareClassLabel(index: number): string {
  const lower = SHARE_BREAKS[index - 1];
  const upper = SHARE_BREAKS[index];
  const pct = (value: number) => formatPercent(value, { digits: value % 1 === 0 ? 0 : 1 });
  if (lower === undefined && upper !== undefined) return `menos de ${pct(upper)}`;
  if (upper === undefined && lower !== undefined) return `${pct(lower)} ou mais`;
  return `${pct(lower ?? 0)} a ${pct(upper ?? 0)}`;
}
