/**
 * The charts of the site, all fed straight from the API rows: no number shown here is
 * computed in the browser (the bar of min-max in seasonality is only geometry).
 *
 * One anatomy for all of them (dataviz guidelines): straight 2px lines with a dot per year and
 * the last value written at the end; bars at most 32px wide, rounded at the data end, with a
 * 2px gap between stacked parts; hairline grid; axes in round numbers; labels in ink, never in
 * the series color; one tooltip per position, value first; a table with every number.
 */
import type { ReactElement } from "react";
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
import { formatCount, formatMoney, formatMoneyFull, formatMoneyTick, formatPercent, monthName } from "../../lib/format";
import { useMediaQuery } from "../../lib/hooks";
import { NEUTRAL, SERIES_COLOR } from "../../lib/palette";
import { niceTicks, spreadLabels } from "../../lib/scale";
import { AXIS_TICK, ChartFigure, ChartLegend, ChartTooltip, EndLabel, endLabelRoom, useChartHeight } from "./ChartParts";

const MARGIN = { top: 12, right: 12, bottom: 0, left: 0 };
const X_AXIS_HEIGHT = 30;
const BAR_MAX = 32;
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const GRID = <CartesianGrid vertical={false} stroke={NEUTRAL.grid} />;
const BAR_CURSOR = { fill: "rgba(32,41,35,0.05)" };

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

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

/** A dot per year with a white ring; the last one larger, where the value is written. */
function yearDot(color: string, lastIndex: number) {
  return function YearDot({ cx, cy, index }: DotProps): ReactElement<SVGElement> {
    if (typeof cx !== "number" || typeof cy !== "number") return <g key={`dot-${index}`} />;
    const last = index === lastIndex;
    return <circle key={`dot-${index}`} cx={cx} cy={cy} r={last ? 4.5 : 3} fill={color} stroke="#ffffff" strokeWidth={2} />;
  };
}

/** Phones get a shorter end label (no name, compact value). */
function useWide() {
  return useMediaQuery("(min-width: 40rem)");
}

/** Question 1: corrected (real) series solid, nominal series gray and dashed. */
export function TrendChart({ rows, caption }: { rows: YearlyTotal[]; caption: string }) {
  const height = useChartHeight();
  const names = { amount_real: "Corrigido (dez/2025)", amount_nominal: "Nominal" };
  const ticks = niceTicks(maxOf(rows, ["amount_real", "amount_nominal"]));
  const top = ticks.at(-1)!;
  const lastIndex = rows.length - 1;
  const last = rows[lastIndex];
  // Corrected and nominal end close together in recent years: their values are pushed apart.
  const offsets = spreadLabels(
    last
      ? [
          { key: "amount_real", value: last.amount_real ?? 0 },
          { key: "amount_nominal", value: last.amount_nominal },
        ]
      : [],
    top,
    height - MARGIN.top - X_AXIS_HEIGHT,
    16,
  );
  const endLabel = (key: "amount_real" | "amount_nominal", color: string) => (
    <LabelList
      dataKey={key}
      content={({ x, y, index, value }) =>
        index === lastIndex && typeof x === "number" && typeof y === "number" && typeof value === "number" ? (
          <EndLabel x={x} y={y + (offsets[key] ?? 0)} lineY={y} color={color} text={formatMoneyTick(value)} />
        ) : null
      }
    />
  );
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
        <LineChart
          data={rows}
          margin={{ ...MARGIN, right: endLabelRoom(last ? [formatMoneyTick(last.amount_real ?? 0), formatMoneyTick(last.amount_nominal)] : []) }}
        >
          {GRID}
          <XAxis dataKey="year" height={X_AXIS_HEIGHT} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: NEUTRAL.grid }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={formatMoneyTick} width={60} domain={[0, top]} ticks={ticks} />
          <Tooltip
            cursor={{ stroke: NEUTRAL.muted }}
            content={(props) => (
              <ChartTooltip
                {...props}
                names={names}
                format={(value) => formatMoney(value)}
                footer={(row) => {
                  const change = row.change_real_pct;
                  const contracts = row.contracts;
                  return (
                    <>
                      {typeof change === "number" && <p>Variação real sobre o ano anterior: {formatPercent(change, { sign: true })}</p>}
                      {typeof contracts === "number" && <p>{formatCount(contracts)} contratos</p>}
                    </>
                  );
                }}
              />
            )}
          />
          <Line
            type="linear"
            dataKey="amount_nominal"
            stroke={SERIES_COLOR.nominal}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }}
            isAnimationActive={false}
          >
            {endLabel("amount_nominal", SERIES_COLOR.nominal)}
          </Line>
          <Line
            type="linear"
            dataKey="amount_real"
            stroke={SERIES_COLOR.real}
            strokeWidth={2}
            dot={yearDot(SERIES_COLOR.real, lastIndex)}
            activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
            isAnimationActive={false}
          >
            {endLabel("amount_real", SERIES_COLOR.real)}
          </Line>
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

/**
 * Share of each part in its year, stacked to 100% (activities or purposes, from the API). When
 * the rows carry the amount of each part (column "<key>__amount"), the tooltip shows it too.
 */
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
  const lastSeries = series.length - 1;
  return (
    <ChartFigure
      summary={caption}
      legend={<ChartLegend items={series.map(({ label, color }) => ({ label, color, kind: "bar" as const }))} />}
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
        <BarChart data={rows} margin={MARGIN} barCategoryGap="22%">
          {GRID}
          <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: NEUTRAL.grid }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value: number) => `${value}%`} width={44} />
          <Tooltip
            cursor={BAR_CURSOR}
            content={(props) => (
              <ChartTooltip
                {...props}
                stacked
                names={names}
                format={(value) => formatPercent(value)}
                detail={(key, row) => {
                  const amount = row[`${key}__amount`];
                  return typeof amount === "number" ? formatMoney(amount) : null;
                }}
              />
            )}
          />
          {series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              stackId="share"
              fill={item.color}
              stroke="#ffffff"
              strokeWidth={2}
              maxBarSize={BAR_MAX}
              radius={index === lastSeries ? BAR_RADIUS : 0}
              isAnimationActive={false}
            />
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
        <p className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-2" aria-hidden="true">
          <span className="flex items-center gap-2">
            <span className="size-3 rounded-[3px]" style={{ backgroundColor: SERIES_COLOR.real }} />
            Média dos anos
          </span>
          <span className="flex items-center gap-2">
            <svg width="10" height="14" aria-hidden="true">
              <path d="M2 1h6M5 1v12M2 13h6" stroke={NEUTRAL.axis} strokeWidth="1.25" fill="none" />
            </svg>
            Menor e maior ano
          </span>
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
        <BarChart data={data} margin={MARGIN} barCategoryGap="28%">
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
            cursor={BAR_CURSOR}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !row) return null;
              return (
                <div className="min-w-44 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm shadow-panel">
                  <p className="mb-1.5 font-semibold capitalize text-ink">{monthName(row.month)}</p>
                  <p className="flex justify-between gap-4 text-ink-2">
                    Média dos anos <span className="tabular font-semibold text-ink">{formatPercent(row.avg_share_pct)}</span>
                  </p>
                  <p className="flex justify-between gap-4 text-ink-2">
                    Menor e maior ano
                    <span className="tabular text-ink">
                      {formatPercent(row.min_share_pct)} a {formatPercent(row.max_share_pct)}
                    </span>
                  </p>
                  <p className="mt-1.5 border-t border-line pt-1.5 text-xs text-ink-2">Parte do crédito do ano contratada no mês</p>
                </div>
              );
            }}
          />
          <Bar dataKey="avg_share_pct" fill={SERIES_COLOR.real} radius={BAR_RADIUS} maxBarSize={BAR_MAX} isAnimationActive={false}>
            <ErrorBar dataKey="range" width={4} strokeWidth={1.25} stroke={NEUTRAL.axis} direction="y" />
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
  const lastIndex = years.length - 1;
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
          {
            header: "Médio nominal",
            // The period row adds several years: a nominal average would mix price levels.
            cell: (row) => (row.year === null && years.length > 1 ? "—" : formatMoneyFull(row.average_nominal)),
            numeric: true,
          },
          { header: "Contratos", cell: (row) => row.contracts.toLocaleString("pt-BR"), numeric: true },
        ],
      }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={years} margin={{ ...MARGIN, top: 24 }} barCategoryGap="28%">
          {GRID}
          <XAxis dataKey="year" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: NEUTRAL.grid }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={formatMoneyTick} width={60} domain={[0, ticks.at(-1)!]} ticks={ticks} />
          <Tooltip
            cursor={BAR_CURSOR}
            content={(props) => (
              <ChartTooltip
                {...props}
                names={{ average_real: "Médio corrigido (dez/2025)" }}
                format={(value) => formatMoney(value)}
                footer={(row) => (typeof row.contracts === "number" ? <p>{formatCount(row.contracts)} contratos</p> : null)}
              />
            )}
          />
          <Bar dataKey="average_real" fill={SERIES_COLOR.real} radius={BAR_RADIUS} maxBarSize={BAR_MAX} isAnimationActive={false}>
            {/* The value of the last year, written on its bar; the others are on the axis and in the table. */}
            <LabelList
              dataKey="average_real"
              content={({ x, y, width, index, value }) =>
                index === lastIndex && typeof x === "number" && typeof y === "number" && typeof width === "number" && typeof value === "number" ? (
                  <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={12} fontWeight={600} fill={NEUTRAL.ink}>
                    {formatMoneyTick(value)}
                  </text>
                ) : null
              }
            />
          </Bar>
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
 * Several series over the years (regions, states), each named at its last point with its last
 * value, so the chart reads without matching colors to the legend. Labels that end close
 * together are pushed apart.
 */
export function MultiLineChart({
  rows,
  series,
  caption,
  format,
  tickFormat,
  endFormat,
  detail,
}: {
  rows: Array<Record<string, number | null> & { year: number }>;
  series: LineSeries[];
  caption: string;
  format: (value: number) => string;
  tickFormat: (value: number) => string;
  /** Compact value for the end of the line (defaults to the tick format). */
  endFormat?: (value: number) => string;
  /** Second figure in the tooltip, from the same row (the share beside the amount). */
  detail?: (key: string, row: Record<string, unknown>) => string | null | undefined;
}) {
  const height = useChartHeight(320, 260);
  const wide = useWide();
  const names = Object.fromEntries(series.map((item) => [item.key, item.label]));
  const lastIndex = rows.length - 1;
  const ticks = niceTicks(maxOf(rows, series.map((item) => item.key)));
  const top = ticks[ticks.length - 1]!;
  const last = rows[lastIndex];
  const offsets = spreadLabels(
    series.flatMap((item) => {
      const value = last?.[item.key];
      return typeof value === "number" ? [{ key: item.key, value }] : [];
    }),
    top,
    height - MARGIN.top - X_AXIS_HEIGHT,
    16,
  );
  const end = endFormat ?? tickFormat;
  // Name and value on wide screens, the short name alone on phones.
  const endText = (item: (typeof series)[number], value: unknown) =>
    wide && typeof value === "number" ? `${item.short} ${end(value)}` : item.short;
  const endTexts = series.map((item) => endText(item, last?.[item.key]));
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
        <LineChart data={rows} margin={{ ...MARGIN, right: endLabelRoom(endTexts) }}>
          {GRID}
          <XAxis dataKey="year" height={X_AXIS_HEIGHT} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: NEUTRAL.grid }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={tickFormat} width={60} domain={[0, top]} ticks={ticks} />
          <Tooltip
            cursor={{ stroke: NEUTRAL.muted }}
            content={(props) => <ChartTooltip {...props} names={names} format={(value) => format(value)} detail={detail} />}
          />
          {series.map((item) => (
            <Line
              key={item.key}
              type="linear"
              dataKey={item.key}
              stroke={item.color}
              strokeWidth={2}
              dot={yearDot(item.color, lastIndex)}
              activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls={false}
            >
              <LabelList
                dataKey={item.key}
                content={({ x, y, index, value }) =>
                  index === lastIndex && typeof x === "number" && typeof y === "number" ? (
                    <EndLabel
                      x={x}
                      y={y + (offsets[item.key] ?? 0)}
                      lineY={y}
                      color={item.color}
                      text={endText(item, value)}
                    />
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
