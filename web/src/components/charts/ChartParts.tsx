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
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink" aria-hidden="true">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          {item.dashed ? (
            <svg width="20" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="20" y2="4" stroke={item.color} strokeWidth="2.5" strokeDasharray="5 3" />
            </svg>
          ) : (
            <span className="h-2.5 w-5 rounded-full" style={{ backgroundColor: item.color }} />
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
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: unknown;
  format: (value: number, key: string) => string;
  names?: Record<string, string>;
  title?: (label: unknown) => string;
}

export function ChartTooltip({ active, payload, label, format, names, title }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-panel">
      <p className="mb-1 font-semibold text-ink">{title ? title(label) : String(label)}</p>
      <ul className="flex flex-col gap-0.5">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? "");
          if (typeof entry.value !== "number") return null;
          return (
            <li key={key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
                {names?.[key] ?? String(entry.name ?? key)}
              </span>
              <span className="tabular font-medium text-ink">{format(entry.value, key)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
