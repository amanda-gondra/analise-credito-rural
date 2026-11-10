/**
 * The classes of the map, read for the reader: how many UFs fall in each class in the current
 * filters, and, for the UF under the pointer or selected, which class it is in, said in words.
 * The reader never has to match a color by eye.
 */
import { cn } from "../../lib/cn";
import { UFS, ufName } from "../../lib/domain";
import { formatPercent } from "../../lib/format";
import { MAP_RAMP } from "../../lib/palette";
import { SHARE_CLASSES, classCounts, shareClass, shareClassLabel } from "../../lib/shareClasses";
import { NO_DATA, type Ramp } from "./BrazilMap";

interface MapLegendProps {
  ramp: Ramp;
  title: string;
  /** Share of each UF in the current filters (from the API); missing UFs have no record. */
  shares: ReadonlyMap<string, number | null>;
  /** UF to explain: under the pointer, or else the selected one. */
  active: string | null;
  /** What the shares are a part of, for the sentence ("do total de 2017–2025"). */
  whole: string;
}

const states = (count: number) => (count === 1 ? "1 UF" : `${count} UFs`);

/** The color of a map class beside a number, so the number and the map read together. */
export function ClassSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-4 shrink-0 rounded-[3px] ring-1 ring-ink/15"
      style={{ backgroundColor: color }}
    />
  );
}

/** "Minas Gerais: 12,7% do total de 2017–2025, na faixa de 10% ou mais." */
export function classSentence(uf: string, share: number | null | undefined, whole: string): string {
  const index = shareClass(share);
  if (index === null) return `${ufName(uf)}: sem registros ${whole}.`;
  return `${ufName(uf)}: ${formatPercent(share)} ${whole}, na faixa de ${shareClassLabel(index)}.`;
}

export function MapLegend({ ramp, title, shares, active, whole }: MapLegendProps) {
  const colors = MAP_RAMP[ramp];
  const { byClass, missing } = classCounts(UFS.map((item) => shares.get(item.uf)));
  const activeShare = active ? shares.get(active) : undefined;
  const activeClass = active ? shareClass(activeShare) : null;
  const rows = [
    ...Array.from({ length: SHARE_CLASSES }, (_, index) => SHARE_CLASSES - 1 - index).map((index) => ({
      key: String(index),
      color: colors[index]!,
      label: shareClassLabel(index),
      count: byClass[index]!,
      current: active !== null && activeClass === index,
    })),
    ...(missing > 0
      ? [{ key: "none", color: NO_DATA, label: "sem registros", count: missing, current: active !== null && activeClass === null }]
      : []),
  ];

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-sm font-medium text-ink">{title}</figcaption>
      <ul className="flex flex-col gap-0.5 text-sm">
        {rows.map((row) => (
          <li
            key={row.key}
            className={cn(
              "flex min-h-8 items-center gap-2.5 rounded-lg px-2 transition-colors",
              row.current ? "bg-forest-50 ring-1 ring-forest/40" : "",
            )}
          >
            <span aria-hidden="true" className="h-3.5 w-6 shrink-0 rounded-sm ring-1 ring-ink/15" style={{ backgroundColor: row.color }} />
            <span className={cn("tabular", row.current ? "font-semibold text-ink" : "text-ink-2", row.count === 0 && !row.current && "text-ink-2/70")}>
              {row.label}
            </span>
            <span className="ml-auto flex items-center gap-2">
              {row.current && active && (
                <span className="rounded-full bg-forest px-2 py-0.5 text-xs font-semibold text-white tabular">
                  {active} · {formatPercent(activeShare)}
                </span>
              )}
              <span className="w-11 text-right text-xs text-ink-2 tabular">{states(row.count)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 min-h-10 text-sm text-ink-2" aria-live="polite">
        {active ? (
          <span className="text-ink">{classSentence(active, activeShare, whole)}</span>
        ) : (
          "Selecione um estado, ou passe o cursor sobre ele, para ver em que faixa está."
        )}
      </p>
    </figure>
  );
}
