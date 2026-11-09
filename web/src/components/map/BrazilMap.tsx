/**
 * Choropleth of the 27 UFs (IBGE mesh, equal-area projection; see scripts/build-uf-shapes.mjs).
 *
 * - Color: share of the national total in six fixed classes (lib/shareClasses.ts).
 * - Mouse: tooltip next to the pointer, flipped to the other side near the edges, so it
 *   never leaves the map. Touch: a tap selects the UF and the details show below the map.
 * - Keyboard: one UF in the tab order; the arrow keys move to the nearest UF in that
 *   direction; Enter or Space selects; Escape clears the selection.
 */
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import shapes from "../../data/uf-shapes.json";
import { ufName } from "../../lib/domain";
import { MAP_LABEL, MAP_RAMP } from "../../lib/palette";
import { shareClass } from "../../lib/shareClasses";

export type Ramp = keyof typeof MAP_RAMP;

const [VB_X, VB_Y, VB_W, VB_H] = shapes.viewBox as [number, number, number, number];
const NO_DATA = "#eef0ec";
// Too small at this scale for a readable label: they are named in the tooltip and the ranking.
const UNLABELED = new Set(["DF", "SE", "AL", "PB", "RN", "PE", "RJ", "ES"]);

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Nearest UF in the direction of the arrow: within 60° of it, favoring the straight line. */
export function neighbor(from: string, key: string): string | null {
  const direction = DIRECTIONS[key];
  const origin = shapes.ufs.find((item) => item.uf === from);
  if (!direction || !origin) return null;
  let best: { uf: string; score: number } | null = null;
  for (const item of shapes.ufs) {
    if (item.uf === from) continue;
    const dx = item.cx - origin.cx;
    const dy = item.cy - origin.cy;
    const distance = Math.hypot(dx, dy);
    const cos = (dx * direction[0] + dy * direction[1]) / distance;
    if (cos < 0.5) continue;
    const score = distance * (2 - cos);
    if (!best || score < best.score) best = { uf: item.uf, score };
  }
  return best?.uf ?? null;
}

const LABEL_PX = 11; // size of the UF labels on screen, whatever the width of the map

/**
 * SVG text scales with the drawing, so on a phone a fixed size would be unreadable. The
 * size in map units is recomputed from the width the map actually takes.
 */
function useLabelSize(ref: RefObject<SVGSVGElement | null>): number {
  const [size, setSize] = useState(13);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const update = () => {
      const width = svg.getBoundingClientRect().width;
      if (width > 0) setSize(Math.min(22, Math.max(9, (LABEL_PX * VB_W) / width)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

interface BrazilMapProps {
  shares: ReadonlyMap<string, number | null>;
  ramp: Ramp;
  selected: string | null;
  onSelect: (uf: string | null) => void;
  /** Content of the tooltip for a UF. */
  describe: (uf: string) => ReactNode;
  /** Accessible name of each UF ("Piauí: 1,3% do total"). */
  label: (uf: string) => string;
  title: string;
}

interface Tip {
  uf: string;
  x: number;
  y: number;
  /** Size of the map box, to flip the tooltip to the side with room. */
  width: number;
  height: number;
}

export function BrazilMap({ shares, ramp, selected, onSelect, describe, label, title }: BrazilMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef(new Map<string, SVGPathElement>());
  const [tip, setTip] = useState<Tip | null>(null);
  const [focusUf, setFocusUf] = useState<string | null>(null);
  const labelSize = useLabelSize(svgRef);
  const colors = MAP_RAMP[ramp];
  const tabStop = focusUf ?? selected ?? "MT";

  const fills = useMemo(() => {
    const result = new Map<string, { fill: string; text: string }>();
    for (const item of shapes.ufs) {
      const index = shareClass(shares.get(item.uf));
      result.set(item.uf, index === null ? { fill: NO_DATA, text: "#202923" } : { fill: colors[index]!, text: MAP_LABEL[index]! });
    }
    return result;
  }, [shares, colors]);

  const showAtPointer = (uf: string, event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const box = containerRef.current?.getBoundingClientRect();
    if (box) setTip({ uf, x: event.clientX - box.left, y: event.clientY - box.top, width: box.width, height: box.height });
  };

  const showAtCentroid = (uf: string) => {
    const svg = svgRef.current?.getBoundingClientRect();
    const box = containerRef.current?.getBoundingClientRect();
    const item = shapes.ufs.find((entry) => entry.uf === uf);
    if (!svg || !box || !item) return;
    const scale = Math.min(svg.width / VB_W, svg.height / VB_H);
    const offsetX = svg.left - box.left + (svg.width - VB_W * scale) / 2;
    const offsetY = svg.top - box.top + (svg.height - VB_H * scale) / 2;
    setTip({
      uf,
      x: offsetX + (item.cx - VB_X) * scale,
      y: offsetY + (item.cy - VB_Y) * scale,
      width: box.width,
      height: box.height,
    });
  };

  const onKeyDown = (uf: string, event: KeyboardEvent<SVGPathElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(uf === selected ? null : uf);
      return;
    }
    if (event.key === "Escape") {
      setTip(null);
      onSelect(null);
      return;
    }
    const next = neighbor(uf, event.key);
    if (next) {
      event.preventDefault();
      setFocusUf(next);
      pathRefs.current.get(next)?.focus();
    }
  };

  const selectedShape = selected ? shapes.ufs.find((item) => item.uf === selected) : undefined;

  return (
    <div ref={containerRef} className="relative" onPointerLeave={() => setTip(null)}>
      <svg
        ref={svgRef}
        viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
        role="group"
        aria-label={title}
        className="mx-auto block h-auto w-full max-w-[36rem] touch-manipulation"
      >
        {shapes.ufs.map((item) => {
          const color = fills.get(item.uf)!;
          return (
            <path
              key={item.uf}
              ref={(node) => {
                if (node) pathRefs.current.set(item.uf, node);
                else pathRefs.current.delete(item.uf);
              }}
              d={item.d}
              fill={color.fill}
              stroke="#ffffff"
              strokeWidth={1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              role="button"
              tabIndex={item.uf === tabStop ? 0 : -1}
              aria-label={label(item.uf)}
              aria-pressed={item.uf === selected}
              className="cursor-pointer outline-none transition-[filter] hover:brightness-95 focus-visible:brightness-90"
              onClick={() => onSelect(item.uf === selected ? null : item.uf)}
              onPointerEnter={(event) => showAtPointer(item.uf, event)}
              onPointerMove={(event) => showAtPointer(item.uf, event)}
              onFocus={() => {
                setFocusUf(item.uf);
                showAtCentroid(item.uf);
              }}
              onBlur={() => setTip(null)}
              onKeyDown={(event) => onKeyDown(item.uf, event)}
            />
          );
        })}
        {selectedShape && (
          <path
            d={selectedShape.d}
            fill="none"
            stroke="#202923"
            strokeWidth={2.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {focusUf && focusUf !== selected && tip?.uf === focusUf && (
          <path
            d={shapes.ufs.find((item) => item.uf === focusUf)!.d}
            fill="none"
            stroke="#174b32"
            strokeWidth={2}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        <g aria-hidden="true" pointerEvents="none" className="select-none">
          {shapes.ufs
            .filter((item) => !UNLABELED.has(item.uf))
            .map((item) => (
              <text
                key={item.uf}
                x={item.cx}
                y={item.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelSize}
                fontWeight={600}
                fill={fills.get(item.uf)!.text}
              >
                {item.uf}
              </text>
            ))}
        </g>
      </svg>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-max max-w-[15rem] rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-panel"
          style={{
            left: tip.x,
            top: tip.y,
            transform: `translate(${tip.x > tip.width / 2 ? "calc(-100% - 12px)" : "12px"}, ${tip.y > tip.height / 2 ? "calc(-100% - 12px)" : "12px"})`,
          }}
        >
          <p className="font-semibold text-ink">{ufName(tip.uf)}</p>
          {describe(tip.uf)}
        </div>
      )}
    </div>
  );
}
