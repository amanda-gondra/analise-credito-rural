import { useSearchParams } from "react-router";

import { useCompareStates, useRegionsYearly } from "../api/queries";
import type { RegionYear, StateYear } from "../api/types";
import { MultiLineChart } from "../components/charts/Charts";
import { pivot } from "../components/charts/series";
import { FilterBar, FilterChip } from "../components/filters/FilterBar";
import { PageHeader, scopeText } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Button, Segmented, Select } from "../components/ui/controls";
import { EmptyState, QueryView } from "../components/ui/feedback";
import { MATOPIBA, REGIONS, REGION_LABEL, UFS, ufName } from "../lib/domain";
import { apiParams, compareTab, readUfList, useFilters } from "../lib/filters";
import { formatMoney, formatMoneyTick, formatPercent } from "../lib/format";
import { CATEGORY } from "../lib/palette";

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
  const regions = useRegionsYearly(apiParams(filters, ["activity", "purpose"]));
  const series = REGIONS.map((region, index) => ({ key: region, label: REGION_LABEL[region], short: REGION_SHORT[region], color: CATEGORY[index]! }));
  return (
    <div className="flex flex-col gap-6">
      <Card id="regioes-valor" title="Crédito por região" scope={`${scopeText(filters, ["activity", "purpose"])} · valores corrigidos`}>
        <QueryView query={regions}>
          {(body) => (
            <MultiLineChart
              rows={pivot<RegionYear>(body.data, (row) => row.region, (row) => row.amount_real)}
              series={series}
              format={(value) => formatMoney(value)}
              tickFormat={formatMoneyTick}
              caption="Crédito rural de cada região por ano, em preços de dezembro de 2025."
            />
          )}
        </QueryView>
      </Card>
      <Card id="regioes-participacao" title="Participação de cada região no ano" scope={scopeText(filters, ["activity", "purpose"])}>
        <QueryView query={regions}>
          {(body) => (
            <MultiLineChart
              rows={pivot<RegionYear>(body.data, (row) => row.region, (row) => row.share_pct)}
              series={series}
              format={(value) => formatPercent(value)}
              tickFormat={percentTick}
              caption="Participação de cada região no total de cada ano, em valores nominais."
            />
          )}
        </QueryView>
      </Card>
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
          <Card id="estados-valor" title="Crédito por estado" scope={`${scopeText(filters, [])} · valores corrigidos`}>
            <QueryView query={compare}>
              {(body) => (
                <MultiLineChart
                  rows={pivot<StateYear>(body.data, (row) => row.state, (row) => row.amount_real)}
                  series={series}
                  format={(value) => formatMoney(value)}
                  tickFormat={formatMoneyTick}
                  caption={`Crédito rural por ano de ${states.map(ufName).join(", ")}, em preços de dezembro de 2025.`}
                />
              )}
            </QueryView>
          </Card>
          <Card id="estados-participacao" title="Participação no Brasil" scope={`${scopeText(filters, [])} · valores nominais de cada ano`}>
            <QueryView query={compare}>
              {(body) => (
                <MultiLineChart
                  rows={pivot<StateYear>(body.data, (row) => row.state, (row) => row.share_of_brazil_pct)}
                  series={series}
                  format={(value) => formatPercent(value)}
                  tickFormat={percentTick}
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
