import type { ReactNode } from "react";

import { ACTIVITY_LABEL, PURPOSE_LABEL } from "../../lib/domain";
import type { FilterKey, Filters } from "../../lib/filters";
import { formatPeriod } from "../../lib/format";

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 max-w-3xl">
      {eyebrow && (
        <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-forest-100 px-3 py-1 text-sm font-medium text-forest">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-leaf" />
          {eyebrow}
        </p>
      )}
      <h1 className="text-balance text-2xl font-bold tracking-tight text-ink sm:text-3xl lg:text-4xl">{title}</h1>
      {children && <div className="mt-3 text-pretty text-base leading-relaxed text-ink-2">{children}</div>}
    </div>
  );
}

const FILTER_WORD: Record<FilterKey, string> = { activity: "atividade", purpose: "finalidade" };

/**
 * The slice a card shows: period and the filters its route applies. When the page has a
 * filter the route does not accept, the card says so instead of silently ignoring it.
 */
export function scopeText(filters: Filters, accepted: readonly FilterKey[], extra: string[] = []): string {
  const parts = [formatPeriod(filters.startYear, filters.endYear), ...extra];
  if (filters.activity && accepted.includes("activity")) parts.push(ACTIVITY_LABEL[filters.activity]);
  if (filters.purpose && accepted.includes("purpose")) parts.push(PURPOSE_LABEL[filters.purpose]);
  const ignored = (["activity", "purpose"] as const).filter((key) => filters[key] && !accepted.includes(key));
  const note = ignored.length ? ` (sem o filtro de ${ignored.map((key) => FILTER_WORD[key]).join(" e ")})` : "";
  return parts.join(" · ") + note;
}
