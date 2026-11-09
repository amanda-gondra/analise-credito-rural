/**
 * The 27 UFs in order of the period's amount, with a bar of their share and the color of their
 * map class beside the percentage. Shows the first ten and the selected UF; "Ver os 27 estados"
 * expands the list. Each row selects its UF; pointing at a row outlines the UF on the map and
 * points the legend at its class.
 */
import { useState } from "react";

import type { StateRank } from "../../api/types";
import { cn } from "../../lib/cn";
import { ufName } from "../../lib/domain";
import { formatPercent } from "../../lib/format";
import { MAP_RAMP } from "../../lib/palette";
import { shareClass } from "../../lib/shareClasses";
import type { Ramp } from "./BrazilMap";
import { ClassSwatch } from "./MapLegend";

interface RankingListProps {
  rows: StateRank[];
  ramp: Ramp;
  selected: string | null;
  onSelect: (uf: string | null) => void;
  onHover?: (uf: string | null) => void;
}

const INITIAL = 10;

export function RankingList({ rows, ramp, selected, onSelect, onHover }: RankingListProps) {
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(...rows.map((row) => row.share_pct ?? 0), 0);
  const visible = expanded ? rows : rows.filter((row, index) => index < INITIAL || row.state === selected);
  const barColor = MAP_RAMP[ramp][4];

  return (
    <div className="min-w-0" onPointerLeave={() => onHover?.(null)}>
      <ol className="flex flex-col">
        {visible.map((row) => {
          const active = row.state === selected;
          const index = shareClass(row.share_pct);
          return (
            <li key={row.state}>
              <button
                type="button"
                onClick={() => onSelect(active ? null : row.state)}
                onPointerEnter={(event) => event.pointerType !== "touch" && onHover?.(row.state)}
                onFocus={() => onHover?.(row.state)}
                onBlur={() => onHover?.(null)}
                aria-pressed={active}
                className={cn(
                  "grid min-h-10 w-full grid-cols-[1.75rem_minmax(0,1fr)_minmax(2.5rem,22%)_4.75rem] items-center gap-2 rounded-lg px-2 py-1 text-left text-sm",
                  active ? "bg-forest-100 font-semibold" : "hover:bg-sunken",
                )}
              >
                <span className="tabular text-ink-2">{row.position}</span>
                <span className="leading-snug text-ink">{ufName(row.state)}</span>
                <span aria-hidden="true" className="h-2 rounded-full bg-sunken">
                  <span
                    className="block h-2 rounded-full"
                    style={{ width: `${max > 0 ? ((row.share_pct ?? 0) / max) * 100 : 0}%`, backgroundColor: barColor }}
                  />
                </span>
                <span className="flex items-center justify-end gap-1.5 tabular text-ink">
                  {index !== null && <ClassSwatch color={MAP_RAMP[ramp][index]!} />}
                  {formatPercent(row.share_pct)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {rows.length > INITIAL && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-2 min-h-10 rounded-full px-3 text-sm font-medium text-forest hover:bg-forest-50"
        >
          {expanded ? "Mostrar só os 10 primeiros" : `Ver os ${rows.length} estados`}
        </button>
      )}
    </div>
  );
}
