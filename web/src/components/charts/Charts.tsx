/**
 * The charts of the site, all fed straight from the API rows: no number shown here is
 * computed in the browser (the bar of min-max in seasonality is only geometry).
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AverageContract, MonthShare, YearlyTotal } from "../../api/types";
import { formatMoney, formatMoneyFull, formatMoneyTick, formatPercent, monthName } from "../../lib/format";
import { useMediaQuery } from "../../lib/hooks";
import { NEUTRAL, SERIES_COLOR } from "../../lib/palette";
import { niceTicks, spreadLabels } from "../../lib/scale";
import { AXIS_TICK, ChartFigure, ChartLegend, ChartTooltip, useChartHeight } from "./ChartParts";

const MARGIN = { top: 8, right: 12, bottom: 0, left: 0 };
const X_AXIS_HEIGHT = 30;
const GRID = <CartesianGrid vertical={false} stroke={NEUTRAL.grid} />;

/** Largest value of the given columns, for a round axis that holds every point. */
function maxOf(rows: Array<Record<string, unknown>>, keys: string[]): number {
  let max = 0;
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "number" && value > max) max = value;
    }
  }
  return max;
}

/** Question 1: corrected (real) series solid, nominal series gray and dashed. */
export function TrendChart({ rows, caption }: { rows: YearlyTotal[]; caption: string }) {
  const height = useChartHeight();
  const names = { amount_real: "Corrigido (dez/2025)", amount_nominal: "Nominal" };
  const ticks = niceTicks(maxOf(rows, ["amount_real", "amount_nominal"]));
  return (
    <ChartFigure
      summary={caption}
      legend={
        <ChartLegend
          items={[
            { label: names.amount_real, color: SERIES_COLOR.real },
            { label: names.amount_nominal, color: SERIES_COLOR.nominal, dashed: true },
          ]}
        />
      }
      table={{
        caption,
        rows,
        rowKey: (row) => row.year,
        columns: [
          { header: "Ano", cell: (row) => row.year },
          { header: "Corrigido (dez/2025)", cell: (row) => formatMoneyFull(row.amount_real), numeric: true },
          { header: "Nominal", cell: (row) => formatMoneyFull(row.amount_nominal), numeric: true },
          { header: "Variação real", cell: (row) => formatPercent(row.change_real_pct, { sign: true }), numeric: true },
          { header: "Contratos", cell: (row) => row.contracts.toLocaleString("pt-BR"), numeric: true },
        ],
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={MARGIN}>
          {GRID}
          <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: NEUTRAL.grid }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={formatMoneyTick} width={60} domain={[0, ticks.at(-1)!]} ticks={ticks} />
          <Tooltip
            cursor={{ stroke: NEUTRAL.muted }}
            content={(props) => <ChartTooltip {...props} names={names} format={(value) => formatMoney(value)} />}
          />
          <Line type="monotone" dataKey="amount_nominal" stroke={SERIES_COLOR.nominal} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="amount_real" stroke={SERIES_COLOR.real} strokeWidth={2.5} dot={{ r: 3, fill: SERIES_COLOR.real }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

export interface ShareSeries {
  key: string;
  label: string;
  color: string;
}

/** Share of each part in its year, stacked to 100% (activities or purposes, from the API). */
export function ShareStackChart({
  rows,
  series,
  caption,
}: {
  rows: Array<Record<string, number | null> & { year: number }>;
  series: ShareSeries[];
  caption: string;
}) {
  const height = useChartHeight(280, 240);
  const names = Object.fromEntries(series.map((item) => [item.key, item.label]));
  return (
    <ChartFigure
      summary={caption}
      legend={<ChartLegend items={series.map(({ label, color }) => ({ label, color }))} />}
      table={{
        caption,
        rows,
        rowKey: (row) => row.year,
        columns: [
          { header: "Ano", cell: (row) => row.year },
          ...series.map((item) => ({ header: item.label, cell: (row: (typeof rows)[number]) => formatPercent(row[item.key]), numeric: true })),
        ],
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={MARGIN} barCategoryGap="18%">
          {GRID}
          <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: NEUTRAL.grid }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value: number) => `${value}%`} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(32,41,35,0.05)" }}
            content={(props) => <ChartTooltip {...props} names={names} format={(value) => formatPercent(value)} />}
          />
          {series.map((item, index) => (
            <Bar key={item.key} dataKey={item.key} stackId="share" fill={item.color} stroke="#ffffff" strokeWidth={index === 0 ? 0 : 1} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

/** Question 10: average share of each month, with the lowest and highest year as a whisker. */
export function SeasonalityChart({ rows, caption }: { rows: MonthShare[]; caption: string }) {
  const height = useChartHeight(260, 220);
  // Twelve month names do not fit a phone: every other month is written there.
  const allMonths = useMediaQuery("(min-width: 30rem)");
  const ticks = niceTicks(maxOf(rows, ["max_share_pct"]));
  const data = rows.map((row) => ({
    ...row,
    label: monthName(row.month, true),
    range:
      row.avg_share_pct === null || row.min_share_pct === null || row.max_share_pct === null
        ? [0, 0]
        : [row.avg_share_pct - row.min_share_pct, row.max_share_pct - row.avg_share_pct],
  }));
  return (
    <ChartFigure
      summary={caption}
      legend={
        <p className="mb-3 text-sm text-ink-2" aria-hidden="true">
          Barra: média dos anos · traço: menor e maior ano
        </p>
      }
      table={{
        caption,
        rows,
        rowKey: (row) => row.month,
        columns: [
          { header: "Mês", cell: (row) => monthName(row.month) },
          { header: "Média", cell: (row) => formatPercent(row.avg_share_pct), numeric: true },
          { header: "Menor", cell: (row) => formatPercent(row.min_share_pct), numeric: true },
          { header: "Maior", cell: (row) => formatPercent(row.max_share_pct), numeric: true },
        ],
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={MARGIN}>
          {GRID}
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: NEUTRAL.grid }} interval={allMonths ? 0 : 1} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${value.toLocaleString("pt-BR")}%`}
            width={44}
            domain={[0, ticks.at(-1)!]}
            ticks={ticks}
          />
          <Tooltip
            cursor={{ fill: "rgba(32,41,35,0.05)" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !row) return null;
              return (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-panel">
                  <p className="mb-1 font-semibold capitalize text-ink">{monthName(row.month)}</p>
                  <p className="text-ink-2">
                    Média <span className="tabular font-medium text-ink">{formatPercent(row.avg_share_pct)}</span>
                  </p>
                  <p className="text-ink-2">
                    De <span className="tabular text-ink">{formatPercent(row.min_share_pct)}</span> a{" "}
                    <span className="tabular text-ink">{formatPercent(row.max_share_pct)}</span>
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="avg_share_pct" fill={SERIES_COLOR.real} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            <ErrorBar dataKey="range" width={4} strokeWidth={1.5} stroke={NEUTRAL.axis} direction="y" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

/** Question 11: average value per contract per year, at December 2025 prices. */
export function AverageChart({ rows, caption }: { rows: AverageContract[]; caption: string }) {
  const height = useChartHeight(240, 220);
  const years = rows.filter((row) => row.year !== null);
  const ticks = niceTicks(maxOf(years, ["average_real"]));
  return (
    <ChartFigure
      summary={caption}
      table={{
        caption,
        rows,
        rowKey: (row) => row.year ?? "periodo",
        columns: [
          { header: "Ano", cell: (row) => row.year ?? "Período" },
          { header: "Médio corrigido", cell: (row) => formatMoneyFull(row.average_real), numeric: true },
          { header: "Médio nominal", cell: (row) => formatMoneyFull(row.average_nominal), numeric: true },
          { header: "Contratos", cell: (row) => row.contracts.toLocaleString("pt-BR"), numeric: true },
        ],
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={years} margin={MARGIN} barCategoryGap="28%">
          {GRID}
          <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: NEUTRAL.grid }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={formatMoneyTick} width={60} domain={[0, ticks.at(-1)!]} ticks={ticks} />
          <Tooltip
            cursor={{ fill: "rgba(32,41,35,0.05)" }}
            content={(props) => (
              <ChartTooltip {...props} names={{ average_real: "Médio corrigido (dez/2025)" }} format={(value) => formatMoney(value)} />
            )}
          />
          <Bar dataKey="average_real" fill={SERIES_COLOR.real} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  /** Name written at the end of the line (UF or region initials). */
  short: string;
  color: string;
}

/**
 * Several series over the years (regions, states), each named at its last point so the
 * chart reads without matching colors to a legend.
 */
export function MultiLineChart({
  rows,
  series,
  caption,
  format,
  tickFormat,
}: {
  rows: Array<Record<string, number | null> & { year: number }>;
  series: LineSeries[];
  caption: string;
  format: (value: number) => string;
  tickFormat: (value: number) => string;
}) {
  const height = useChartHeight(320, 260);
  const names = Object.fromEntries(series.map((item) => [item.key, item.label]));
  const lastIndex = rows.length - 1;
  const ticks = niceTicks(maxOf(rows, series.map((item) => item.key)));
  const top = ticks[ticks.length - 1]!;
  const last = rows[lastIndex];
  // Names at the end of the lines, pushed apart when two lines end close together.
  const offsets = spreadLabels(
    series.flatMap((item) => {
      const value = last?.[item.key];
      return typeof value === "number" ? [{ key: item.key, value }] : [];
    }),
    top,
    height - MARGIN.top - X_AXIS_HEIGHT,
  );
  return (
    <ChartFigure
      summary={caption}
      legend={<ChartLegend items={series.map(({ label, color }) => ({ label, color }))} />}
      table={{
        caption,
        rows,
        rowKey: (row) => row.year,
        columns: [
          { header: "Ano", cell: (row) => row.year },
          ...series.map((item) => ({
            header: item.label,
            cell: (row: (typeof rows)[number]) => {
              const value = row[item.key];
              return value === null || value === undefined ? "—" : format(value);
            },
            numeric: true,
          })),
        ],
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ ...MARGIN, right: 44 }}>
          {GRID}
          <XAxis dataKey="year" height={X_AXIS_HEIGHT} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: NEUTRAL.grid }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickFormat} width={60} domain={[0, top]} ticks={ticks} />
          <Tooltip
            cursor={{ stroke: NEUTRAL.muted }}
            content={(props) => <ChartTooltip {...props} names={names} format={(value) => format(value)} />}
          />
          {series.map((item) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              stroke={item.color}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls={false}
            >
              <LabelList
                dataKey={item.key}
                content={({ x, y, index }) =>
                  index === lastIndex && typeof x === "number" && typeof y === "number" ? (
                    <text x={x + 6} y={y + (offsets[item.key] ?? 0)} dominantBaseline="central" fontSize={12} fontWeight={600} fill={item.color}>
                      {item.short}
                    </text>
                  ) : null
                }
              />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
