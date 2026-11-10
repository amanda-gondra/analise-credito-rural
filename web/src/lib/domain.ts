/**
 * The vocabulary of the API (api/app/filters.py) with the words the site shows.
 * The 27 UFs come from the IBGE file of the map, so names and regions have one source.
 */
import shapes from "../data/uf-shapes.json";

export const FIRST_YEAR = 2013;
export const LAST_YEAR = 2025;
/** Main series (decision D9): the default period. Before 2017 the classification changed. */
export const MAIN_SERIES = { start: 2017, end: 2025 } as const;
export const YEARS: readonly number[] = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

export const ACTIVITIES = ["agricultural", "livestock"] as const;
export type Activity = (typeof ACTIVITIES)[number];
export const ACTIVITY_LABEL: Record<Activity, string> = { agricultural: "Agricultura", livestock: "Pecuária" };

export const PURPOSES = ["custeio", "investimento", "comercializacao", "industrializacao"] as const;
export type Purpose = (typeof PURPOSES)[number];
export const PURPOSE_LABEL: Record<Purpose, string> = {
  custeio: "Custeio",
  investimento: "Investimento",
  comercializacao: "Comercialização",
  industrializacao: "Industrialização",
};

export const REGIONS = ["norte", "nordeste", "sudeste", "sul", "centro-oeste"] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABEL: Record<Region, string> = {
  norte: "Norte",
  nordeste: "Nordeste",
  sudeste: "Sudeste",
  sul: "Sul",
  "centro-oeste": "Centro-Oeste",
};

/** MATOPIBA as whole states (decision D7). */
export const MATOPIBA = ["MA", "TO", "PI", "BA"] as const;

export interface UfInfo {
  uf: string;
  name: string;
  region: Region;
}

function toRegion(name: string): Region {
  const key = name.toLowerCase() as Region;
  if (!REGIONS.includes(key)) throw new Error(`unknown region ${name}`);
  return key;
}

export const UFS: readonly UfInfo[] = shapes.ufs.map(({ uf, name, region }) => ({ uf, name, region: toRegion(region) }));
const BY_ABBR = new Map(UFS.map((info) => [info.uf, info]));

export function ufInfo(uf: string | null | undefined): UfInfo | undefined {
  return uf ? BY_ABBR.get(uf.toUpperCase()) : undefined;
}

export function ufName(uf: string): string {
  return ufInfo(uf)?.name ?? uf;
}

export function isUf(value: string | null | undefined): value is string {
  return Boolean(value && BY_ABBR.has(value.toUpperCase()));
}

export function isActivity(value: string | null | undefined): value is Activity {
  return ACTIVITIES.includes(value as Activity);
}

export function isPurpose(value: string | null | undefined): value is Purpose {
  return PURPOSES.includes(value as Purpose);
}

export function isRegion(value: string | null | undefined): value is Region {
  return REGIONS.includes(value as Region);
}
