/**
 * Map, legend, the selected UF and the ranking, side by side on a computer and stacked on a
 * phone (map first). The selection lives in the URL (state=PI) so it can be shared.
 */
import { useMemo } from "react";
import { Link } from "react-router";

import type { StateRank } from "../../api/types";
import { ACTIVITY_LABEL, type Activity, REGION_LABEL, ufName } from "../../lib/domain";
import { type Filters, amountBasis, readUf, useParam } from "../../lib/filters";
import { formatCount, formatMoney, formatPercent, formatPeriod } from "../../lib/format";
import { Icon } from "../ui/Icon";
import { BrazilMap, type Ramp } from "./BrazilMap";
import { MapLegend } from "./MapLegend";
import { RankingList } from "./RankingList";

function rampOf(activity: Activity | null): Ramp {
  return activity ?? "total";
}

export function TerritoryView({ rows, filters }: { rows: StateRank[]; filters: Filters }) {
  const [rawSelected, setSelected] = useParam("state");
  const selected = readUf(rawSelected);
  const ramp = rampOf(filters.activity);
  const byUf = useMemo(() => new Map(rows.map((row) => [row.state, row])), [rows]);
  const shares = useMemo(() => new Map(rows.map((row) => [row.state, row.share_pct])), [rows]);
  const period = formatPeriod(filters.startYear, filters.endYear);
  const subject = filters.activity ? ACTIVITY_LABEL[filters.activity].toLowerCase() : "crédito rural";
  const chosen = selected ? byUf.get(selected) : undefined;
  // The amount the API ranked by (amountBasis): granted (nominal) inside one year; for several
  // years only the corrected sum, because nominal amounts of different years do not add up.
  const singleYear = amountBasis(filters) === "nominal";
  const mainLabel = singleYear ? "Valor concedido" : "Valor corrigido";
  const mainAmount = (row: StateRank) => (singleYear ? row.amount_nominal : row.amount_real);

  const describe = (uf: string) => {
    const row = byUf.get(uf);
    if (!row) return <p className="text-ink-2">Sem registros no período.</p>;
    return (
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-ink-2">
        <dt>{mainLabel}</dt>
        <dd className="tabular text-right font-medium text-ink">{formatMoney(mainAmount(row))}</dd>
        <dt>Participação</dt>
        <dd className="tabular text-right font-medium text-ink">{formatPercent(row.share_pct)}</dd>
        <dt>Posição</dt>
        <dd className="tabular text-right text-ink">{row.position}º</dd>
      </dl>
    );
  };

  const label = (uf: string) => {
    const row = byUf.get(uf);
    return row ? `${ufName(uf)}: ${formatPercent(row.share_pct)} do total, ${row.position}º lugar` : `${ufName(uf)}: sem registros`;
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <BrazilMap
          shares={shares}
          ramp={ramp}
          selected={selected}
          onSelect={setSelected}
          describe={describe}
          label={label}
          title={`Mapa do Brasil: participação de cada UF no ${subject} de ${period}`}
        />
        <p className="mt-2 text-xs text-ink-2">
          Use as setas para percorrer os estados no mapa e Enter para selecionar. Malha: IBGE (2022).
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <MapLegend ramp={ramp} title={`Participação no total de ${period}`} />
        {chosen ? (
          <div className="rounded-2xl bg-forest-50 p-4" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-ink">{ufName(chosen.state)}</p>
                <p className="text-sm text-ink-2">
                  {REGION_LABEL[chosen.region]} · {chosen.position}º lugar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Limpar a seleção"
                className="inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-forest-100"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink-2">{mainLabel}</dt>
                <dd className="tabular text-base font-semibold text-ink">{formatMoney(mainAmount(chosen))}</dd>
              </div>
              <div>
                <dt className="text-ink-2">Participação</dt>
                <dd className="tabular text-base font-semibold text-ink">{formatPercent(chosen.share_pct)}</dd>
              </div>
              {singleYear && (
                <div>
                  <dt className="text-ink-2">Corrigido (dez/2025)</dt>
                  <dd className="tabular text-ink">{formatMoney(chosen.amount_real)}</dd>
                </div>
              )}
              <div>
                <dt className="text-ink-2">Contratos</dt>
                <dd className="tabular text-ink">{formatCount(chosen.contracts)}</dd>
              </div>
            </dl>
            <Link
              to={{
                pathname: `/estados/${chosen.state}`,
                search: `?start_year=${filters.startYear}&end_year=${filters.endYear}`,
              }}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full text-sm font-semibold text-forest underline-offset-4 hover:underline"
            >
              Ver o perfil de {ufName(chosen.state)}
              <Icon name="arrow-right" size={16} />
            </Link>
          </div>
        ) : (
          <p className="rounded-2xl bg-sunken p-4 text-sm text-ink-2">
            Selecione um estado no mapa ou na lista para ver os números dele.
          </p>
        )}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Ranking dos estados</h3>
          <RankingList rows={rows} ramp={ramp} selected={selected} onSelect={setSelected} />
        </div>
      </div>
    </div>
  );
}
