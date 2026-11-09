/**
 * The filters of a page. Computer: one row under the page title, sticky while scrolling.
 * Phone and tablet: a "Filtros" button with the number of active filters, which opens the
 * same controls in a bottom sheet, and the active filters as chips that can be removed one
 * by one. Values live in the URL (lib/filters.ts).
 */
import { type ReactNode, useState } from "react";

import { ACTIVITY_LABEL, type Activity, MAIN_SERIES, PURPOSE_LABEL, PURPOSES, type Purpose, YEARS } from "../../lib/domain";
import { type Filters, useFilters } from "../../lib/filters";
import { formatPeriod } from "../../lib/format";
import { ACTIVITY_COLOR } from "../../lib/palette";
import { Button, Segmented, Select } from "../ui/controls";
import { Notice } from "../ui/feedback";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";

export type FilterControl = "period" | "activity" | "purpose";

interface FilterBarProps {
  controls: readonly FilterControl[];
  /** Page-specific controls (state, region, program...) shown with the shared ones. */
  extra?: ReactNode;
  /** Chips of the page-specific filters, with their own remove buttons. */
  extraChips?: ReactNode;
  extraCount?: number;
  onResetExtra?: () => void;
}

const ACTIVITY_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "agricultural", label: ACTIVITY_LABEL.agricultural, swatch: ACTIVITY_COLOR.agricultural },
  { value: "livestock", label: ACTIVITY_LABEL.livestock, swatch: ACTIVITY_COLOR.livestock },
] as const;

const PURPOSE_OPTIONS = [{ value: "all", label: "Todas as finalidades" }, ...PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABEL[p] }))];

function Controls({ controls, filters, update, extra }: { controls: readonly FilterControl[]; filters: Filters; update: (change: Partial<Filters>) => void; extra?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-5 lg:gap-y-3">
      {controls.includes("period") && (
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-sm font-medium text-ink">Período</legend>
          <div className="flex items-center gap-2">
            <Select
              label="Ano inicial"
              hideLabel
              value={String(filters.startYear)}
              options={YEARS.filter((year) => year <= filters.endYear).map((year) => ({ value: String(year), label: String(year) }))}
              onChange={(value) => update({ startYear: Number(value) })}
              className="w-24"
            />
            <span className="text-sm text-ink-2" aria-hidden="true">
              a
            </span>
            <Select
              label="Ano final"
              hideLabel
              value={String(filters.endYear)}
              options={YEARS.filter((year) => year >= filters.startYear).map((year) => ({ value: String(year), label: String(year) }))}
              onChange={(value) => update({ endYear: Number(value) })}
              className="w-24"
            />
          </div>
        </fieldset>
      )}
      {controls.includes("activity") && (
        <Segmented
          label="Atividade"
          value={filters.activity ?? "all"}
          options={ACTIVITY_OPTIONS}
          onChange={(value) => update({ activity: value === "all" ? null : (value as Activity) })}
        />
      )}
      {controls.includes("purpose") && (
        <Select
          label="Finalidade"
          value={filters.purpose ?? "all"}
          options={PURPOSE_OPTIONS}
          onChange={(value) => update({ purpose: value === "all" ? null : (value as Purpose) })}
          className="sm:w-56"
        />
      )}
      {extra}
    </div>
  );
}

function Chip({ children, onRemove, label }: { children: ReactNode; onRemove: () => void; label: string }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-1 rounded-full bg-forest-100 pl-3 pr-1 text-sm font-medium text-forest">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro: ${label}`}
        className="inline-flex size-7 items-center justify-center rounded-full hover:bg-forest-200"
      >
        <Icon name="close" size={14} />
      </button>
    </span>
  );
}

export { Chip as FilterChip };

export function FilterBar({ controls, extra, extraChips, extraCount = 0, onResetExtra }: FilterBarProps) {
  const { filters, update, reset } = useFilters();
  const [open, setOpen] = useState(false);
  const periodChanged = filters.startYear !== MAIN_SERIES.start || filters.endYear !== MAIN_SERIES.end;
  const sharedCount =
    (controls.includes("period") && periodChanged ? 1 : 0) +
    (controls.includes("activity") && filters.activity ? 1 : 0) +
    (controls.includes("purpose") && filters.purpose ? 1 : 0);
  const count = sharedCount + extraCount;
  const resetAll = () => {
    reset();
    onResetExtra?.();
  };

  const chips = (
    <>
      {controls.includes("period") && periodChanged && (
        <Chip label="período" onRemove={() => update({ startYear: MAIN_SERIES.start, endYear: MAIN_SERIES.end })}>
          {formatPeriod(filters.startYear, filters.endYear)}
        </Chip>
      )}
      {controls.includes("activity") && filters.activity && (
        <Chip label="atividade" onRemove={() => update({ activity: null })}>
          {ACTIVITY_LABEL[filters.activity]}
        </Chip>
      )}
      {controls.includes("purpose") && filters.purpose && (
        <Chip label="finalidade" onRemove={() => update({ purpose: null })}>
          {PURPOSE_LABEL[filters.purpose]}
        </Chip>
      )}
      {extraChips}
    </>
  );

  return (
    <div className="mb-6 flex flex-col gap-3">
      {/* Computer: the controls themselves. */}
      <div className="sticky top-16 z-20 -mx-2 hidden rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur lg:block">
        <div className="flex items-end justify-between gap-4">
          <Controls controls={controls} filters={filters} update={update} extra={extra} />
          {count > 0 && (
            <Button variant="ghost" icon="refresh" onClick={resetAll} className="shrink-0">
              Restaurar padrão
            </Button>
          )}
        </div>
      </div>

      {/* Phone and tablet: a button, the chips, and a sheet with the controls. */}
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <Button icon="filter" onClick={() => setOpen(true)} aria-haspopup="dialog">
          Filtros{count > 0 ? ` (${count})` : ""}
        </Button>
        {count === 0 ? (
          <span className="text-sm text-ink-2">
            {formatPeriod(filters.startYear, filters.endYear)}
            {controls.includes("activity") ? " · todas as atividades" : ""}
          </span>
        ) : (
          chips
        )}
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filtros"
        footer={
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={resetAll} disabled={count === 0}>
              Limpar filtros
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Ver resultados
            </Button>
          </div>
        }
      >
        <Controls controls={controls} filters={filters} update={update} extra={extra} />
      </Sheet>

      {controls.includes("period") && filters.startYear < MAIN_SERIES.start && (
        <Notice tone="warning">
          Antes de 2017 a classificação de programas e finalidades era diferente. Compare esses anos com cautela.
        </Notice>
      )}
    </div>
  );
}
