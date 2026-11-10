/**
 * Rows of the data explorer. Wide screens: a table with every column. Phones: one card per
 * row with what identifies it and its amount; the other columns open on demand. Text is
 * never shrunk to fit: long program names wrap.
 */
import type { CreditRow } from "../../api/types";
import { ACTIVITY_LABEL, PURPOSE_LABEL, type Purpose } from "../../lib/domain";
import { formatInteger, formatMoney, formatMoneyFull, monthName } from "../../lib/format";

const purposeLabel = (value: string) => PURPOSE_LABEL[value as Purpose] ?? value;
const rowKey = (row: CreditRow) =>
  [row.year, row.month, row.state, row.activity, row.program, row.subprogram, row.funding_source, row.purpose].join("|");

export function CreditTable({ rows }: { rows: CreditRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Linhas da base de crédito rural</caption>
        <thead className="bg-sunken text-left text-ink">
          <tr>
            {["Mês", "UF", "Atividade", "Finalidade", "Programa", "Fonte de recursos"].map((header) => (
              <th key={header} scope="col" className="whitespace-nowrap px-3 py-2.5 font-medium">
                {header}
              </th>
            ))}
            {["Contratos", "Valor nominal", "Valor corrigido"].map((header) => (
              <th key={header} scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-line align-top">
              <td className="whitespace-nowrap px-3 py-2.5 tabular">
                {String(row.month).padStart(2, "0")}/{row.year}
              </td>
              <td className="px-3 py-2.5 font-medium">{row.state}</td>
              <td className="whitespace-nowrap px-3 py-2.5">{ACTIVITY_LABEL[row.activity]}</td>
              <td className="whitespace-nowrap px-3 py-2.5">{purposeLabel(row.purpose)}</td>
              <td className="min-w-48 px-3 py-2.5">
                {row.program}
                {row.subprogram !== "SEM SUBPROGRAMA" && <span className="block text-xs text-ink-2">{row.subprogram}</span>}
              </td>
              <td className="min-w-40 px-3 py-2.5">{row.funding_source}</td>
              <td className="px-3 py-2.5 text-right tabular">{formatInteger(row.contracts)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular">{formatMoneyFull(row.amount_nominal)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular">{formatMoneyFull(row.amount_real)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CreditCards({ rows }: { rows: CreditRow[] }) {
  return (
    <ul className="flex flex-col gap-2 md:hidden" aria-label="Linhas da base de crédito rural">
      {rows.map((row) => (
        <li key={rowKey(row)} className="rounded-xl border border-line bg-surface">
          <details className="group">
            <summary className="flex min-h-14 list-none flex-col gap-0.5 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-ink">
                  {row.state} · {monthName(row.month, true)}/{row.year}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular text-ink">{formatMoney(row.amount_nominal)}</span>
              </span>
              <span className="text-sm text-ink-2">
                {ACTIVITY_LABEL[row.activity]} · {purposeLabel(row.purpose)}
              </span>
              <span className="break-words text-sm text-ink">{row.program}</span>
              <span className="mt-1 text-sm font-medium text-forest">
                <span className="group-open:hidden">Ver detalhes</span>
                <span className="hidden group-open:inline">Ocultar detalhes</span>
              </span>
            </summary>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-line px-4 py-3 text-sm">
              <dt className="text-ink-2">Subprograma</dt>
              <dd className="break-words text-ink">{row.subprogram}</dd>
              <dt className="text-ink-2">Fonte</dt>
              <dd className="break-words text-ink">{row.funding_source}</dd>
              <dt className="text-ink-2">Contratos</dt>
              <dd className="tabular text-ink">{formatInteger(row.contracts)}</dd>
              <dt className="text-ink-2">Nominal</dt>
              <dd className="tabular text-ink">{formatMoneyFull(row.amount_nominal)}</dd>
              <dt className="text-ink-2">Corrigido</dt>
              <dd className="tabular text-ink">{formatMoneyFull(row.amount_real)}</dd>
            </dl>
          </details>
        </li>
      ))}
    </ul>
  );
}
