/**
 * Brazil with some UFs highlighted: a locator, not data (no scale, no color meaning beyond
 * "here"). Used for the state of a profile and for the four states of MATOPIBA.
 */
import shapes from "../../data/uf-shapes.json";
import { NEUTRAL, SERIES_COLOR } from "../../lib/palette";

interface LocatorProps {
  ufs: readonly string[];
  /** Accessible name ("Mapa do Brasil com o Piauí destacado"). */
  label: string;
  /** Write the UF codes on the highlighted shapes (large enough only for big states). */
  named?: boolean;
  className?: string;
}

export function Locator({ ufs, label, named = false, className }: LocatorProps) {
  const [x, y, w, h] = shapes.viewBox;
  const set = new Set(ufs);
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label={label} className={className ?? "block h-auto w-full"}>
      {shapes.ufs.map((item) => (
        <path
          key={item.uf}
          d={item.d}
          fill={set.has(item.uf) ? SERIES_COLOR.real : NEUTRAL.grid}
          stroke="#ffffff"
          strokeWidth={1}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {named &&
        shapes.ufs
          .filter((item) => set.has(item.uf))
          .map((item) => (
            <text
              key={item.uf}
              x={item.cx}
              y={item.cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={16}
              fontWeight={700}
              fill="#ffffff"
              aria-hidden="true"
            >
              {item.uf}
            </text>
          ))}
    </svg>
  );
}
