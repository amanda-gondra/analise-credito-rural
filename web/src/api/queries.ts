/**
 * One hook per API route. The query key is the route plus its parameters, so two widgets
 * asking for the same data share one request, and a filter change refetches only what uses it.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { type QueryValue, getJson } from "./client";
import type {
  ActivityShare,
  AverageContract,
  CreditPage,
  Envelope,
  FundingSourceRank,
  MatopibaYear,
  Metadata,
  MonthShare,
  ProgramRank,
  PurposeShare,
  RegionYear,
  StateProfile,
  StateRank,
  StateYear,
  YearlyTotal,
} from "./types";

type Params = Record<string, QueryValue>;

function useRoute<T>(path: string, params: Params, enabled = true) {
  return useQuery({
    queryKey: [path, params],
    queryFn: ({ signal }) => getJson<Envelope<T>>(path, params, signal),
    enabled,
    // Keep the previous numbers on screen while new filters load, instead of blanking the page.
    placeholderData: keepPreviousData,
  });
}

export const useMetadata = () =>
  useQuery({
    queryKey: ["/api/v1/metadata"],
    queryFn: ({ signal }) => getJson<Metadata>("/api/v1/metadata", {}, signal),
    staleTime: 60 * 60 * 1000,
  });

export const useYearlyTotals = (params: Params, enabled = true) =>
  useRoute<YearlyTotal[]>("/api/v1/totals/yearly", params, enabled);

export const useStateRanking = (params: Params, enabled = true) =>
  useRoute<StateRank[]>("/api/v1/states/ranking", params, enabled);

export const useStateProfile = (uf: string, params: Params, enabled = true) =>
  useRoute<StateProfile>(`/api/v1/states/${uf}/profile`, params, enabled);

export const useCompareStates = (params: Params, enabled = true) =>
  useRoute<StateYear[]>("/api/v1/states/compare", params, enabled);

export const useRegionsYearly = (params: Params, enabled = true) =>
  useRoute<RegionYear[]>("/api/v1/regions/yearly", params, enabled);

export const useMatopiba = (params: Params, enabled = true) =>
  useRoute<MatopibaYear[]>("/api/v1/regions/matopiba/yearly", params, enabled);

export const useActivities = (params: Params, enabled = true) =>
  useRoute<ActivityShare[]>("/api/v1/activities/yearly", params, enabled);

export const usePurposes = (params: Params, enabled = true) =>
  useRoute<PurposeShare[]>("/api/v1/purposes/yearly", params, enabled);

export const usePrograms = (params: Params, enabled = true) =>
  useRoute<ProgramRank[]>("/api/v1/programs/ranking", params, enabled);

export const useFundingSources = (params: Params, enabled = true) =>
  useRoute<FundingSourceRank[]>("/api/v1/funding-sources/ranking", params, enabled);

export const useSeasonality = (params: Params, enabled = true) =>
  useRoute<MonthShare[]>("/api/v1/seasonality", params, enabled);

export const useAverageContract = (params: Params, enabled = true) =>
  useRoute<AverageContract[]>("/api/v1/contracts/average", params, enabled);

export const useCreditPage = (params: Params, enabled = true) =>
  useQuery({
    queryKey: ["/api/v1/credit", params],
    queryFn: ({ signal }) => getJson<CreditPage>("/api/v1/credit", params, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
