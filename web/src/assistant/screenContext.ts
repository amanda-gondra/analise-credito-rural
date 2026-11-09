/**
 * What the visitor is looking at, sent with every question (POST /assistant/ask, field
 * "context"). The API validates every field against closed lists; the model uses it only to
 * fill what the question leaves open ("este estado", "no período").
 */
import type { ScreenContext } from "../api/types";
import { ACTIVITY_LABEL, REGION_LABEL, ufName } from "../lib/domain";
import { compareTab, readFilters, readRegion, readUf, readUfList } from "../lib/filters";
import { formatPeriod } from "../lib/format";

type Page = ScreenContext["page"];
/** A UF abbreviation; readUf and readUfList only return values from the list of 27. */
type Uf = NonNullable<ScreenContext["state"]>;

export function pageOf(pathname: string): { page: Page; uf: Uf | null } {
  const state = /^\/estados\/([A-Za-z]{2})\/?$/.exec(pathname);
  if (state) return { page: "state", uf: readUf(state[1] ?? null) as Uf | null };
  if (pathname.startsWith("/comparar")) return { page: "compare", uf: null };
  if (pathname.startsWith("/matopiba")) return { page: "matopiba", uf: null };
  if (pathname.startsWith("/dados")) return { page: "data", uf: null };
  if (pathname.startsWith("/sobre")) return { page: "about", uf: null };
  return { page: "overview", uf: null };
}

export function screenContext(pathname: string, search: string): ScreenContext {
  const params = new URLSearchParams(search);
  const { page, uf } = pageOf(pathname);
  if (page === "about") return { page };

  const filters = readFilters(params);
  const context: ScreenContext = { page, start_year: filters.startYear, end_year: filters.endYear };
  // Only where the page applies the activity filter: MATOPIBA and the comparison of states
  // show both activities together.
  const usesActivity = page !== "matopiba" && !(page === "compare" && compareTab(params) === "estados");
  if (filters.activity && usesActivity) context.activity = filters.activity;

  if (page === "state" && uf) context.state = uf;
  if (page === "overview" || page === "data") {
    const selected = readUf(params.get("state")) as Uf | null;
    if (selected) context.state = selected;
  }
  if (page === "data") {
    const region = readRegion(params.get("region"));
    if (region && !context.state) context.region = region;
  }
  if (page === "compare") {
    const states = readUfList(params.get("states")) as Uf[];
    if (states.length >= 2) context.states = states;
  }
  return context;
}

/** The same context in words, shown above the input so the visitor knows what is sent. */
export function describeContext(context: ScreenContext): string | null {
  const parts: string[] = [];
  if (context.state) parts.push(ufName(context.state));
  if (context.states) parts.push(context.states.join(", "));
  if (context.region) parts.push(REGION_LABEL[context.region]);
  if (context.activity) parts.push(ACTIVITY_LABEL[context.activity]);
  if (context.start_year && context.end_year) parts.push(formatPeriod(context.start_year, context.end_year));
  return parts.length ? parts.join(" · ") : null;
}
