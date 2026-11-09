/**
 * Round axes: ticks on 1, 2, 2,5 or 5 times a power of ten (0, 1, 2, 3, 4% instead of
 * 0, 0,85, 1,7...). Only the axis is rounded; the data are drawn as they come.
 */
const STEPS = [1, 2, 2.5, 5, 10];

export function niceTicks(max: number, intervals = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / intervals;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = (STEPS.find((candidate) => candidate * power >= raw) ?? 10) * power;
  const count = Math.ceil(max / step - 1e-9);
  return Array.from({ length: count + 1 }, (_, index) => Number((index * step).toPrecision(12)));
}

export interface EndLabel {
  key: string;
  value: number;
}

/**
 * Vertical offsets (px) that keep the names at the end of the lines at least `gap` apart.
 * Positions follow the axis from 0 to `top` over `plotHeight` pixels.
 */
export function spreadLabels(labels: EndLabel[], top: number, plotHeight: number, gap = 15): Record<string, number> {
  const placed = labels
    .map((label) => ({ key: label.key, natural: plotHeight * (1 - label.value / top) }))
    .sort((a, b) => a.natural - b.natural)
    .map((label) => ({ ...label, y: label.natural }));
  for (let index = 1; index < placed.length; index += 1) {
    const previous = placed[index - 1]!;
    const current = placed[index]!;
    if (current.y - previous.y < gap) current.y = previous.y + gap;
  }
  return Object.fromEntries(placed.map((label) => [label.key, label.y - label.natural]));
}
