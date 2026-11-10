/**
 * Pieces shared by the charts: the frame with a text summary and the table of numbers
 * (screen readers and anyone who wants the exact values), the tooltip and the legend.
 */
import type { ReactNode } from "react";

import { useMediaQuery } from "../../lib/hooks";
import { NEUTRAL } from "../../lib/palette";

export const AXIS_TICK = { fontSize: 12, fill: NEUTRAL.axis } as const;

/** Chart height: shorter on phones, so the chart and its context fit on one screen. */
export function useChartHeight(desktop = 300, phone = 240): number {
  return useMediaQuery("(min-width: 40rem)") ? desktop : phone;
}

export interface TableColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  numeric?: boolean;
}

interface ChartFigureProps<T> {
  /** One sentence that says what the chart shows, read by screen readers. */
  summary: string;
  legend?: ReactNode;
  children: ReactNode;
  table?: { caption: string; columns: TableColumn<T>[]; rows: T[]; rowKey: (row: T) => string | number };
}

export function ChartFigure<T>({ summary, legend, children, table }: ChartFigureProps<T>) {
  return (
    <figure className="min-w-0">
      <figcaption className="sr-only">{summary}</figcaption>
      {legend}
      <div aria-hidden="true" className="min-w-0 select-none">
        {children}
      </div>
      {table && (
        <details className="group mt-3">
          <summary className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium text-forest hover:bg-forest-50">
            <span className="group-open:hidden">Ver os números</span>
            <span className="hidden group-open:inline">Ocultar os números</span>
          </summary>
          <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{table.caption}</caption>
              <thead className="sticky top-0 bg-sunken">
                <tr>
                  {table.columns.map((column) => (
                    <th
                      key={column.header}
                      scope="col"
                      className={`whitespace-nowrap px-3 py-2 font-medium text-ink ${column.numeric ? "text-right" : "text-left"}`}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={table.rowKey(row)} className="border-t border-line">
                    {table.columns.map((column) => (
                      <td
                        key={column.header}
                        className={`whitespace-nowrap px-3 py-2 ${column.numeric ? "text-right tabular" : "text-left"}`}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}

export interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
  /** The key mirrors the mark: a short line for lines, a square for bars. */
  kind?: "line" | "bar";
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2" aria-hidden="true">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          {item.dashed ? (
            <svg width="20" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="20" y2="4" stroke={item.color} strokeWidth="2" strokeDasharray="5 3" />
            </svg>
          ) : item.kind === "bar" ? (
            <span className="size-3 rounded-[3px]" style={{ backgroundColor: item.color }} />
          ) : (
            <svg width="20" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="19" y2="4" stroke={item.color} strokeWidth="2" strokeLinecap="round" />
              <circle cx="10" cy="4" r="3" fill={item.color} stroke="#ffffff" strokeWidth="1.5" />
            </svg>
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

interface TooltipEntry {
  dataKey?: unknown;
  name?: unknown;
  value?: unknown;
  color?: string;
  payload?: unknown;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: unknown;
  format: (value: number, key: string) => string;
  names?: Record<string, string>;
  title?: (label: unknown) => string;
  /** A second figure beside the value of a series (its amount beside its share, say). */
  detail?: (key: string, row: Record<string, unknown>) => string | null | undefined;
  /** Lines below the series (the change on the year before, the contracts). */
  footer?: (row: Record<string, unknown>) => ReactNode;
  /** Stacks: list the top segment first, as drawn. */
  stacked?: boolean;
}

/** One tooltip for every series at the pointed position: the value leads, the name follows. */
export function ChartTooltip({ active, payload, label, format, names, title, detail, footer, stacked }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = (payload[0]?.payload ?? {}) as Record<string, unknown>;
  const entries = stacked ? [...payload].reverse() : payload;
  return (
    <div className="min-w-44 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm shadow-panel">
      <p className="mb-1.5 font-semibold text-ink">{title ? title(label) : String(label)}</p>
      <ul className="flex flex-col gap-1">
        {entries.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? "");
          if (typeof entry.value !== "number") return null;
          const extra = detail?.(key, row);
          return (
            <li key={key} className="flex items-baseline justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-2">
                <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                {names?.[key] ?? String(entry.name ?? key)}
              </span>
              <span className="text-right">
                <span className="tabular font-semibold text-ink">{format(entry.value, key)}</span>
                {extra && <span className="ml-1.5 tabular text-xs text-ink-2">{extra}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {footer && <div className="mt-1.5 border-t border-line pt-1.5 text-xs text-ink-2">{footer(row)}</div>}
    </div>
  );
}

/** Right margin a chart needs for its end labels: the leader plus the longest text (12px, semibold). */
export function endLabelRoom(texts: readonly string[]): number {
  const longest = texts.reduce((size, text) => Math.max(size, text.length), 0);
  return 24 + Math.ceil(longest * 7.4);
}

/**
 * Name or value at the end of a line. The last point of the line is already drawn, so the label
 * gets a short leader in the series color from that point (lineY) to the text (y), which may
 * have been pushed up or down to avoid the label of another line.
 */
export function EndLabel({ x, y, lineY = y, color, text }: { x: number; y: number; lineY?: number; color: string; text: string }) {
  return (
    <g>
      <path d={`M${x + 7} ${lineY} L${x + 10} ${lineY} L${x + 14} ${y}`} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={x + 18} y={y} dominantBaseline="central" fontSize={12} fontWeight={600} fill={NEUTRAL.ink}>
        {text}
      </text>
    </g>
  );
}
