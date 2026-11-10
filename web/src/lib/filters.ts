/**
 * Filters live in the URL, with the words of the API (start_year, end_year, activity,
 * purpose, state, states, region, program), so a page can be shared, reloaded or opened
 * from a link of the assistant and show the same numbers. Invalid values fall back to the
 * defaults instead of breaking the page.
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import {
  type Activity,
  FIRST_YEAR,
  LAST_YEAR,
  MAIN_SERIES,
  type Purpose,
  type Region,
  isActivity,
  isPurpose,
  isRegion,
  isUf,
} from "./domain";

export interface Filters {
  startYear: number;
  endYear: number;
  activity: Activity | null;
  purpose: Purpose | null;
}

export const DEFAULT_FILTERS: Filters = {
  startYear: MAIN_SERIES.start,
  endYear: MAIN_SERIES.end,
  activity: null,
  purpose: null,
};

function year(value: string | null): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const number = Number(value);
  return number >= FIRST_YEAR && number <= LAST_YEAR ? number : null;
}

export function readFilters(params: URLSearchParams): Filters {
  const start = year(params.get("start_year"));
  const end = year(params.get("end_year"));
  let startYear = start ?? DEFAULT_FILTERS.startYear;
  let endYear = end ?? DEFAULT_FILTERS.endYear;
  if (startYear > endYear) {
    startYear = DEFAULT_FILTERS.startYear;
    endYear = DEFAULT_FILTERS.endYear;
  }
  const activity = params.get("activity");
  const purpose = params.get("purpose");
  return {
    startYear,
    endYear,
    activity: isActivity(activity) ? activity : null,
    purpose: isPurpose(purpose) ? purpose : null,
  };
}

/** The URL with these filters; defaults are left out so links stay short. */
export function writeFilters(params: URLSearchParams, filters: Filters): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (name: string, value: string | number | null, fallback: string | number | null) => {
    if (value === null || value === fallback) next.delete(name);
    else next.set(name, String(value));
  };
  set("start_year", filters.startYear, DEFAULT_FILTERS.startYear);
  set("end_year", filters.endYear, DEFAULT_FILTERS.endYear);
  set("activity", filters.activity, null);
  set("purpose", filters.purpose, null);
  return next;
}

/** How many filters differ from the defaults (the period counts as one). */
export function changedFilters(filters: Filters): number {
  const period = filters.startYear !== DEFAULT_FILTERS.startYear || filters.endYear !== DEFAULT_FILTERS.endYear;
  return Number(period) + Number(filters.activity !== null) + Number(filters.purpose !== null);
}

export type FilterKey = "activity" | "purpose";

/** Query parameters of an API route that accepts the period and the listed filters. */
export function apiParams(filters: Filters, accepted: readonly FilterKey[] = []): Record<string, string | number> {
  const params: Record<string, string | number> = { start_year: filters.startYear, end_year: filters.endYear };
  if (accepted.includes("activity") && filters.activity) params.activity = filters.activity;
  if (accepted.includes("purpose") && filters.purpose) params.purpose = filters.purpose;
  return params;
}

export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);

  const update = useCallback(
    (change: Partial<Filters>) => {
      setParams((current) => writeFilters(current, { ...readFilters(current), ...change }), {
        replace: true,
        preventScrollReset: true,
      });
    },
    [setParams],
  );

  const reset = useCallback(() => {
    setParams((current) => writeFilters(current, DEFAULT_FILTERS), { replace: true, preventScrollReset: true });
  }, [setParams]);

  return { filters, update, reset, changed: changedFilters(filters) };
}

/** One URL parameter beyond the shared filters (state on the overview, tab on Comparar...). */
export function useParam(name: string) {
  const [params, setParams] = useSearchParams();
  const value = params.get(name);
  const set = useCallback(
    (next: string | null) => {
      setParams(
        (current) => {
          const copy = new URLSearchParams(current);
          if (next === null || next === "") copy.delete(name);
          else copy.set(name, next);
          return copy;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [name, setParams],
  );
  return [value, set] as const;
}

export function readUf(value: string | null): string | null {
  return isUf(value) ? value.toUpperCase() : null;
}

/** states=PI,MA (or repeated): two to five distinct UFs; anything else is ignored. */
export function readUfList(value: string | null, max = 5): string[] {
  if (!value) return [];
  const list = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item, index, all) => isUf(item) && all.indexOf(item) === index);
  return list.slice(0, max);
}

/**
 * Tab of the Comparar page: "estados" when asked for or when the link brings states
 * (the assistant links compare_states with states=...), "regioes" otherwise.
 */
export function compareTab(params: URLSearchParams): "regioes" | "estados" {
  const tab = params.get("aba");
  if (tab === "estados" || tab === "regioes") return tab;
  return readUfList(params.get("states")).length > 0 ? "estados" : "regioes";
}

export function readRegion(value: string | null): Region | null {
  const lower = value?.toLowerCase() ?? null;
  return isRegion(lower) ? lower : null;
}

/**
 * Which amount stands for a period, by the conventions of the queries (sql/queries.sql): inside
 * one year the amount granted (nominal); a sum of several years only at the prices of one date
 * (corrected to December 2025). Rankings of the API order and compute shares the same way.
 */
export type AmountBasis = "nominal" | "real";

export function amountBasis(filters: Pick<Filters, "startYear" | "endYear">): AmountBasis {
  return filters.startYear === filters.endYear ? "nominal" : "real";
}

export const BASIS_TEXT: Record<AmountBasis, string> = {
  nominal: "valores nominais",
  real: "valores corrigidos",
};
