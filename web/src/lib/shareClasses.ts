/**
 * Classes of the choropleth: fixed breaks of the share of the national total, the same for
 * every period and activity, so a color always means the same share. The breaks are round
 * numbers that separate the small UFs (under 0,5%) from the largest (10% or more).
 *
 * A share is classified as it is shown: rounded to one decimal, like every percentage of the
 * site. A UF read as "10,0%" is in "10% ou mais", never one class below because the API sent
 * 9,96. The labels follow the same precision, so no value fits two of them.
 */
import { formatPercent } from "./format";

export const SHARE_BREAKS = [0.5, 1, 2.5, 5, 10] as const;
export const SHARE_CLASSES = SHARE_BREAKS.length + 1;

// Same rounding as formatPercent (Intl rounds the shortest decimal form: 0,95 -> 1,0), which
// toFixed does not do (0.95.toFixed(1) is "0.9"). Only the separators differ from pt-BR.
const ONE_DECIMAL_PLAIN = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});

/** The share with one decimal, exactly as the site writes it. */
export function shownShare(share: number): number {
  return Number(ONE_DECIMAL_PLAIN.format(share));
}

/** Index 0 (lightest) to 5 (darkest); null when there is no value. */
export function shareClass(share: number | null | undefined): number | null {
  if (share == null || !Number.isFinite(share)) return null;
  const shown = shownShare(share);
  const index = SHARE_BREAKS.findIndex((limit) => shown < limit);
  return index === -1 ? SHARE_BREAKS.length : index;
}

/** "menos de 0,5%", "0,5% a 0,9%", ..., "5,0% a 9,9%", "10% ou mais". */
export function shareClassLabel(index: number): string {
  const lower = SHARE_BREAKS[index - 1];
  const upper = SHARE_BREAKS[index];
  if (lower === undefined && upper !== undefined) return `menos de ${formatPercent(upper)}`;
  if (upper === undefined && lower !== undefined) return `${formatPercent(lower, { digits: 0 })} ou mais`;
  return `${formatPercent(lower ?? 0)} a ${formatPercent((upper ?? 0) - 0.1)}`;
}

/** How many UFs fall in each class, plus those without a value. */
export function classCounts(shares: Iterable<number | null | undefined>): { byClass: number[]; missing: number } {
  const byClass: number[] = Array.from({ length: SHARE_CLASSES }, () => 0);
  let missing = 0;
  for (const share of shares) {
    const index = shareClass(share);
    if (index === null) missing += 1;
    else byClass[index]! += 1;
  }
  return { byClass, missing };
}
