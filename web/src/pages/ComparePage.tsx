import { useSearchParams } from "react-router";

import { useCompareStates, useRegionsYearly, useYearlyTotals } from "../api/queries";
import type { RegionYear, StateYear } from "../api/types";
import { MultiLineChart } from "../components/charts/Charts";
import { regionAmountReading, regionShareReading, statesAmountReading, statesShareReading } from "../components/charts/readings";
import { pivotWith } from "../components/charts/series";
import { FilterBar, FilterChip } from "../components/filters/FilterBar";
import { PageHeader, scopeText } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Button, Segmented, Select } from "../components/ui/controls";
import { EmptyState, QueryView } from "../components/ui/feedback";
import { MATOPIBA, REGIONS, REGION_LABEL, type Region, UFS, ufName } from "../lib/domain";
import { apiParams, compareTab, readUfList, useFilters } from "../lib/filters";
import { formatMoney, formatMoneyTick, formatPercent } from "../lib/format";
import { CATEGORY, REGION_COLOR } from "../lib/palette";

const REGION_SHORT: Record<(typeof REGIONS)[number], string> = {
  norte: "N",
  nordeste: "NE",
  sudeste: "SE",
  sul: "S",
  "centro-oeste": "CO",
};

const PRESETS = [
  { label: "PI e MA", states: ["PI", "MA"] },
  { label: "Região Sul", states: ["PR", "SC", "RS"] },
  { label: "MATOPIBA", states: [...MATOPIBA] },
  { label: "Maiores do Sudeste", states: ["MG", "SP"] },
];

function percentTick(value: number) {
  return `${value.toLocaleString("pt-BR")}%`;
}

function Regions() {
  const { filters } = useFilters();
  const params = apiParams(filters, ["activity", "purpose"]);
  const regions = useRegionsYearly(params);
  const totals = useYearlyTotals(params);
  const end = filters.endYear;
  const series = REGIONS.map((region) => ({ key: region, label: REGION_LABEL[region], short: REGION_SHORT[region], color: REGION_COLOR[region] }));
  const ofEnd = (regions.data?.data ?? []).filter((row) => row.year === end && row.share_pct !== null);
  const brazil = totals.data?.data.find((row) => row.year === end);
  const ranked = [...ofEnd].sort((a, b) => (b.share_pct ?? 0) - (a.share_pct ?? 0));
  const first = ranked[0];
  const lastRegion = ranked.at(-1);
  return (
    <div className="flex flex-col gap-6">
      <Card
        id="regioes-valor"
        title="Crédito por região"
        scope={`${scopeText(filters, ["activity", "purpose"])} · R$ por ano, em preços de dez/2025`}
        reading={regions.data ? regionAmountReading(regions.data.data, end) : null}
      >
        <QueryView query={regions}>
          {(body) => (
            <MultiLineChart
              rows={pivotWith<RegionYear>(body.data, (row) => row.region, (row) => row.amount_real, (row) => row.share_pct, "share")}
              series={series}
              format={(value) => formatMoney(value)}
              tickFormat={formatMoneyTick}
              detail={(key, row) => {
                const share = row[`${key}__share`];
                return typeof share === "number" ? `${formatPercent(share)} do ano` : null;
              }}
              caption="Crédito rural de cada região por ano, em preços de dezembro de 2025."
            />
          )}
        </QueryView>
      </Card>
      <Card
        id="regioes-participacao"
        title="Participação de cada região no ano"
        scope={`${scopeText(filters, ["activity", "purpose"])} · % do total do Brasil, valores nominais`}
        reading={regions.data ? regionShareReading(regions.data.data, end) : null}
      >
        <QueryView query={regions}>
          {(body) => (
            <MultiLineChart
              rows={pivotWith<RegionYear>(body.data, (row) => row.region, (row) => row.share_pct, (row) => row.amount_nominal, "amount")}
              series={series}
              format={(value) => formatPercent(value)}
              tickFormat={percentTick}
              endFormat={(value) => formatPercent(value)}
              detail={(key, row) => {
                const amount = row[`${key}__amount`];
                return typeof amount === "number" ? formatMoney(amount) : null;
              }}
              caption="Participação de cada região no total de cada ano, em valores nominais."
            />
          )}
        </QueryView>
      </Card>
      {first && lastRegion && (
        <section aria-labelledby="destaques" className="rounded-2xl border border-line bg-forest-50/60 p-4 sm:p-6">
          <h2 id="destaques" className="mb-4 text-base font-semibold text-ink sm:text-lg">
            Destaques de {end}
          </h2>
          <dl className="grid gap-4 sm:grid-cols-3 sm:divide-x sm:divide-line">
            <div className="sm:pr-4">
              <dt className="text-sm text-ink-2">Crédito rural no Brasil</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-ink">{formatMoney(brazil?.amount_nominal)}</dd>
              <dd className="mt-0.5 text-sm text-ink-2">
                valor nominal
                {typeof brazil?.change_real_pct === "number" && <>; {formatPercent(brazil.change_real_pct, { sign: true })} real sobre {end - 1}</>}
              </dd>
            </div>
            <div className="sm:px-4">
              <dt className="text-sm text-ink-2">Maior participação</dt>
              <dd className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
                <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: REGION_COLOR[first.region as Region] }} />
                {REGION_LABEL[first.region as Region]}
              </dd>
              <dd className="mt-0.5 text-sm text-ink-2">{formatPercent(first.share_pct)} do crédito do Brasil</dd>
            </div>
            <div className="sm:pl-4">
              <dt className="text-sm text-ink-2">Menor participação</dt>
              <dd className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
                <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: REGION_COLOR[lastRegion.region as Region] }} />
                {REGION_LABEL[lastRegion.region as Region]}
              </dd>
              <dd className="mt-0.5 text-sm text-ink-2">{formatPercent(lastRegion.share_pct)} do crédito do Brasil</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}

function States({ states, setStates }: { states: string[]; setStates: (next: string[]) => void }) {
  const { filters } = useFilters();
  const ready = states.length >= 2;
  const compare = useCompareStates({ ...apiParams(filters), states: states.join(",") }, ready);
  const series = states.map((uf, index) => ({ key: uf, label: ufName(uf), short: uf, color: CATEGORY[index]! }));
  const available = UFS.filter((item) => !states.includes(item.uf));

  return (
    <div className="flex flex-col gap-6">
      <Card id="escolha" title="Estados comparados" scope="De 2 a 5 estados">
        <div className="flex flex-col gap-4">
          {states.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Estados escolhidos">
              {states.map((uf, index) => (
                <li key={uf}>
                  <FilterChip label={ufName(uf)} onRemove={() => setStates(states.filter((item) => item !== uf))}>
                    <span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-full" style={{ backgroundColor: CATEGORY[index] }} />
                    {ufName(uf)}
                  </FilterChip>
                </li>
              ))}
            </ul>
          )}
          {states.length < 5 && (
            <Select
              label="Adicionar estado"
              value=""
              options={[{ value: "", label: "Escolha um estado…" }, ...available.map((item) => ({ value: item.uf, label: `${item.name} (${item.uf})` }))]}
              onChange={(value) => value && setStates([...states, value])}
              className="max-w-sm"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-2">Sugestões:</span>
            {PRESETS.map((preset) => (
              <Button key={preset.label} onClick={() => setStates(preset.states)} className="min-h-9 px-3">
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {!ready ? (
        <EmptyState>Escolha pelo menos dois estados para comparar.</EmptyState>
      ) : (
        <>
          <Card
            id="estados-valor"
            title="Crédito por estado"
            scope={`${scopeText(filters, [])} · R$ por ano, em preços de dez/2025`}
            reading={compare.data ? statesAmountReading(compare.data.data, filters.endYear) : null}
          >
            <QueryView query={compare}>
              {(body) => (
                <MultiLineChart
                  rows={pivotWith<StateYear>(body.data, (row) => row.state, (row) => row.amount_real, (row) => row.share_of_brazil_pct, "share")}
                  series={series}
                  format={(value) => formatMoney(value)}
                  tickFormat={formatMoneyTick}
                  detail={(key, row) => {
                    const share = row[`${key}__share`];
                    return typeof share === "number" ? `${formatPercent(share)} do Brasil` : null;
                  }}
                  caption={`Crédito rural por ano de ${states.map(ufName).join(", ")}, em preços de dezembro de 2025.`}
                />
              )}
            </QueryView>
          </Card>
          <Card
            id="estados-participacao"
            title="Participação no Brasil"
            scope={`${scopeText(filters, [])} · % do total do Brasil, valores nominais de cada ano`}
            reading={compare.data ? statesShareReading(compare.data.data, filters.endYear) : null}
          >
            <QueryView query={compare}>
              {(body) => (
                <MultiLineChart
                  rows={pivotWith<StateYear>(body.data, (row) => row.state, (row) => row.share_of_brazil_pct, (row) => row.amount_nominal, "amount")}
                  series={series}
                  format={(value) => formatPercent(value)}
                  tickFormat={percentTick}
                  endFormat={(value) => formatPercent(value)}
                  detail={(key, row) => {
                    const amount = row[`${key}__amount`];
                    return typeof amount === "number" ? formatMoney(amount) : null;
                  }}
                  caption={`Participação de ${states.map(ufName).join(", ")} no crédito rural do Brasil em cada ano.`}
                />
              )}
            </QueryView>
          </Card>
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  const [params, setParams] = useSearchParams();
  const tab = compareTab(params);
  const states = readUfList(params.get("states"));

  const update = (change: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [name, value] of Object.entries(change)) {
          if (value === null || value === "") next.delete(name);
          else next.set(name, value);
        }
        return next;
      },
      { replace: true, preventScrollReset: true },
    );

  return (
    <>
      <PageHeader eyebrow="Comparar" title="Regiões e estados lado a lado">
        <p>
          Evolução e participação no total do Brasil. Os valores corrigidos usam preços de dezembro de 2025; as participações
          de cada ano usam valores nominais.
        </p>
      </PageHeader>
      <div className="mb-4">
        <Segmented
          label="Comparar"
          hideLabel
          value={tab}
          options={[
            { value: "regioes", label: "Regiões" },
            { value: "estados", label: "Estados" },
          ]}
          onChange={(value) => update({ aba: value })}
        />
      </div>
      {tab === "regioes" ? (
        <>
          <FilterBar controls={["period", "activity", "purpose"]} />
          <Regions />
        </>
      ) : (
        <>
          <FilterBar controls={["period"]} />
          <States states={states} setStates={(next) => update({ states: next.join(","), aba: "estados" })} />
        </>
      )}
    </>
  );
}
