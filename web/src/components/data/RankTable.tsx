/**
 * Ranking of names (programs, funding sources) with amount and share. A table on wide
 * screens; on a phone each row stacks the name over its numbers, so nothing is cut or shrunk.
 * The amount shown is the one the API ranked by (amountBasis): nominal for one year, corrected
 * for several, so the amount and the share always speak of the same values.
 */
import { useState } from "react";

import type { AmountBasis } from "../../lib/filters";
import { formatMoney, formatPercent } from "../../lib/format";

export interface RankRow {
  position: number;
  name: string;
  amount_nominal: number | null;
  amount_real: number | null;
  share_pct: number | null;
  contracts: number;
}

const AMOUNT_HEADER: Record<AmountBasis, string> = { nominal: "Valor concedido", real: "Valor corrigido" };

export function RankTable({
  rows,
  caption,
  nameHeader,
  basis,
  initial = 10,
}: {
  rows: RankRow[];
  caption: string;
  nameHeader: string;
  basis: AmountBasis;
  initial?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, initial);
  const max = Math.max(...rows.map((row) => row.share_pct ?? 0), 0);
  const amountHeader = AMOUNT_HEADER[basis];
  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-line text-left text-ink-2">
            <th scope="col" className="w-8 py-2 pr-2 font-medium">
              #
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {nameHeader}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {amountHeader}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Participação
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.name} className="grid grid-cols-[2rem_1fr_auto] gap-x-2 border-b border-line py-2 sm:table-row sm:py-0">
              <td className="tabular text-ink-2 sm:py-2.5 sm:pr-2">{row.position}</td>
              <td className="min-w-0 text-ink sm:py-2.5 sm:pr-3">
                <span className="break-words">{row.name}</span>
                <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-sunken">
                  <span className="block h-1.5 rounded-full bg-forest" style={{ width: `${max ? ((row.share_pct ?? 0) / max) * 100 : 0}%` }} />
                </span>
              </td>
              <td className="col-start-2 tabular text-ink-2 sm:py-2.5 sm:pr-3 sm:text-right sm:text-ink">
                <span className="sm:hidden">{amountHeader}: </span>
                {formatMoney(basis === "nominal" ? row.amount_nominal : row.amount_real)}
              </td>
              <td className="col-start-3 row-start-1 tabular text-right font-medium text-ink sm:py-2.5">{formatPercent(row.share_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > initial && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-2 min-h-10 rounded-full px-3 text-sm font-medium text-forest hover:bg-forest-50"
        >
          {expanded ? `Mostrar só os ${initial} primeiros` : `Ver todos (${rows.length})`}
        </button>
      )}
    </div>
  );
}
