import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

interface CardProps {
  title?: ReactNode;
  /** Which data and filters the card shows ("2017–2025 · Pecuária · valores de dez/2025"). */
  scope?: ReactNode;
  /**
   * What the chart says, in one sentence written from the API values ("Em 2025, custeio teve a
   * maior parte: 55,4%."), so the reader does not have to work it out from the marks.
   */
  reading?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Card({ title, scope, reading, actions, children, className, id }: CardProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6", className)}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="text-base font-semibold leading-snug tracking-tight text-ink sm:text-lg">
                {title}
              </h2>
            )}
            {scope && <p className="mt-0.5 text-sm text-ink-2">{scope}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {reading && (
        <p className="-mt-1 mb-4 border-l-2 border-leaf pl-3 text-sm leading-relaxed text-ink">{reading}</p>
      )}
      {children}
    </section>
  );
}

/** A number with its label, for the row of indicators at the top of a page. */
export function Kpi({ label, value, detail }: { label: ReactNode; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card sm:px-5 sm:py-4">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{value}</dd>
      {detail && <dd className="mt-1 text-sm text-ink-2">{detail}</dd>}
    </div>
  );
}
