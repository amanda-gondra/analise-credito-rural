import { useState } from "react";

import { useActivities, useAverageContract, usePurposes, useSeasonality, useStateRanking, useYearlyTotals } from "../api/queries";
import { AverageChart, SeasonalityChart, ShareStackChart, TrendChart } from "../components/charts/Charts";
import { activityReading, averageReading, purposeReading, seasonalityReading, trendReading } from "../components/charts/readings";
import { ACTIVITY_SERIES, PURPOSE_SERIES, activityRows, purposeRows } from "../components/charts/series";
import { FilterBar } from "../components/filters/FilterBar";
import { PageHeader, scopeText } from "../components/layout/PageHeader";
import { TerritoryView } from "../components/map/TerritoryCard";
import { Card, Kpi } from "../components/ui/Card";
import { Segmented } from "../components/ui/controls";
import { QueryView, Skeleton } from "../components/ui/feedback";
import { BASIS_TEXT, amountBasis, apiParams, useFilters } from "../lib/filters";
import { formatCount, formatMoney, formatPercent, formatPeriod } from "../lib/format";

function Indicators() {
  const { filters } = useFilters();
  const params = apiParams(filters, ["activity", "purpose"]);
  const totals = useYearlyTotals(params);
  const average = useAverageContract(params);
  const end = filters.endYear;
  const year = totals.data?.data.find((row) => row.year === end);
  const averageYear = average.data?.data.find((row) => row.year === end);

  if (totals.isPending) {
    return (
      <div className="grid grid-cols-1 gap-3 min-[22.5rem]:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    );
  }
  return (
    <dl className="grid grid-cols-1 gap-3 min-[22.5rem]:grid-cols-2 lg:grid-cols-4" aria-label={`Indicadores de ${end}`}>
      <Kpi label={`Concedido em ${end}`} value={formatMoney(year?.amount_nominal)} detail="valor nominal" />
      <Kpi
        label={`Variação real em ${end}`}
        value={formatPercent(year?.change_real_pct, { sign: true })}
        detail={year?.change_real_pct == null ? "escolha um período com o ano anterior" : `sobre ${end - 1}, corrigida pelo IPCA`}
      />
      <Kpi label={`Contratos em ${end}`} value={formatCount(year?.contracts)} detail={year ? `${year.contracts.toLocaleString("pt-BR")} contratos` : undefined} />
      <Kpi
        label={`Valor médio por contrato em ${end}`}
        value={formatMoney(averageYear?.average_nominal)}
        detail={averageYear ? `corrigido: ${formatMoney(averageYear.average_real)}` : undefined}
      />
    </dl>
  );
}

function Distribution() {
  const { filters } = useFilters();
  const [view, setView] = useState<"activity" | "purpose">("activity");
  const activities = useActivities(apiParams(filters), view === "activity");
  const purposes = usePurposes(apiParams(filters, ["activity"]), view === "purpose");
  return (
    <Card
      id="distribuicao"
      title="Como se distribui o crédito rural"
      scope={
        view === "activity"
          ? `${scopeText(filters, [])} · participação no total de cada ano`
          : `${scopeText(filters, ["activity"])} · participação no total de cada ano`
      }
      reading={
        view === "activity"
          ? activities.data
            ? activityReading(activities.data.data, filters.endYear)
            : null
          : purposes.data
            ? purposeReading(purposes.data.data, filters.endYear)
            : null
      }
      actions={
        <Segmented
          label="Distribuir por"
          hideLabel
          size="sm"
          value={view}
          options={[
            { value: "activity", label: "Atividade" },
            { value: "purpose", label: "Finalidade" },
          ]}
          onChange={setView}
        />
      }
    >
      {view === "activity" ? (
        <QueryView query={activities}>
          {(body) => (
            <ShareStackChart
              rows={activityRows(body.data)}
              series={ACTIVITY_SERIES}
              caption="Participação da agricultura e da pecuária no crédito rural de cada ano, em valores nominais."
            />
          )}
        </QueryView>
      ) : (
        <QueryView query={purposes}>
          {(body) => (
            <ShareStackChart
              rows={purposeRows(body.data)}
              series={PURPOSE_SERIES}
              caption="Participação de custeio, investimento, comercialização e industrialização no crédito de cada ano."
            />
          )}
        </QueryView>
      )}
    </Card>
  );
}

export default function OverviewPage() {
  const { filters } = useFilters();
  const segment = apiParams(filters, ["activity", "purpose"]);
  const ranking = useStateRanking(segment);
  const totals = useYearlyTotals(segment);
  const seasonality = useSeasonality(apiParams(filters, ["purpose"]));
  const average = useAverageContract(segment);

  return (
    <>
      <PageHeader eyebrow="Panorama nacional" title="Crédito rural concedido no Brasil">
        <p>
          Quanto crédito rural foi contratado, onde e para quê, de 2013 a 2025, com os dados oficiais do Banco Central.
          Valores corrigidos estão em preços de dezembro de 2025.
        </p>
      </PageHeader>
      <FilterBar controls={["period", "activity", "purpose"]} />

      <div className="flex flex-col gap-6">
        <Indicators />

        <Card id="mapa" title="Distribuição por estado" scope={`${scopeText(filters, ["activity", "purpose"])} · ${BASIS_TEXT[amountBasis(filters)]}`}>
          <QueryView query={ranking} skeleton="h-[28rem]">
            {(body) => <TerritoryView rows={body.data} filters={filters} />}
          </QueryView>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card
            id="evolucao"
            title="Evolução do crédito rural"
            scope={`${scopeText(filters, ["activity", "purpose"])} · R$ por ano`}
            reading={totals.data ? trendReading(totals.data.data, filters.endYear) : null}
          >
            <QueryView query={totals}>
              {(body) => (
                <TrendChart
                  rows={body.data}
                  caption="Crédito rural por ano, em valores nominais e corrigidos para dezembro de 2025."
                />
              )}
            </QueryView>
          </Card>
          <Distribution />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card
            id="sazonalidade"
            title="Em que meses o crédito é contratado"
            scope={`${scopeText(filters, ["purpose"])} · parte do crédito do ano`}
            reading={seasonality.data ? seasonalityReading(seasonality.data.data, formatPeriod(filters.startYear, filters.endYear)) : null}
          >
            <QueryView query={seasonality}>
              {(body) => (
                <SeasonalityChart
                  rows={body.data}
                  caption="Participação média de cada mês no crédito do ano, com o menor e o maior ano do período."
                />
              )}
            </QueryView>
          </Card>
          <Card
            id="valor-medio"
            title="Valor médio por contrato"
            scope={`${scopeText(filters, ["activity", "purpose"])} · em preços de dez/2025`}
            reading={average.data ? averageReading(average.data.data, formatPeriod(filters.startYear, filters.endYear)) : null}
          >
            <QueryView query={average}>
              {(body) => <AverageChart rows={body.data} caption="Valor médio por contrato em cada ano, em preços de dezembro de 2025." />}
            </QueryView>
          </Card>
        </div>
      </div>
    </>
  );
}
