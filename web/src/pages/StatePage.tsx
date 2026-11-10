import { Link, useParams } from "react-router";

import {
  useAverageContract,
  useFundingSources,
  usePrograms,
  usePurposes,
  useSeasonality,
  useStateProfile,
  useYearlyTotals,
} from "../api/queries";
import { AverageChart, SeasonalityChart, ShareStackChart, TrendChart } from "../components/charts/Charts";
import { activityReading, averageReading, purposeReading, seasonalityReading, trendReading } from "../components/charts/readings";
import { ACTIVITY_SERIES, PURPOSE_SERIES, activityRows, purposeRows } from "../components/charts/series";
import { RankTable } from "../components/data/RankTable";
import { FilterBar } from "../components/filters/FilterBar";
import { PageHeader, scopeText } from "../components/layout/PageHeader";
import { Locator } from "../components/map/Locator";
import { Card, Kpi } from "../components/ui/Card";
import { buttonClass } from "../components/ui/controls";
import { EmptyState, QueryView, Skeleton } from "../components/ui/feedback";
import { Icon } from "../components/ui/Icon";
import { REGION_LABEL, ufInfo } from "../lib/domain";
import { BASIS_TEXT, amountBasis, apiParams, useFilters } from "../lib/filters";
import { formatCount, formatMoney, formatPercent, formatPeriod } from "../lib/format";
import NotFoundPage from "./NotFoundPage";

export default function StatePage() {
  const { uf: rawUf } = useParams();
  const info = ufInfo(rawUf);
  const { filters } = useFilters();
  const uf = info?.uf ?? "";
  const valid = Boolean(info);
  const period = apiParams(filters);
  const profile = useStateProfile(uf, period, valid);
  const totals = useYearlyTotals({ ...apiParams(filters, ["activity", "purpose"]), state: uf }, valid);
  const purposes = usePurposes({ ...apiParams(filters, ["activity"]), state: uf }, valid);
  const seasonality = useSeasonality({ ...apiParams(filters, ["purpose"]), state: uf }, valid);
  const average = useAverageContract({ ...apiParams(filters, ["activity", "purpose"]), state: uf }, valid);
  // The indicators describe the whole state, like the profile: without the activity and purpose filters.
  const averageAll = useAverageContract({ ...period, state: uf }, valid);
  const programs = usePrograms({ ...period, state: uf }, valid);
  const sources = useFundingSources({ ...period, state: uf }, valid);

  if (!info) return <NotFoundPage />;
  const range = formatPeriod(filters.startYear, filters.endYear);
  const end = filters.endYear;
  const basis = amountBasis(filters);
  const periodSearch = `?start_year=${filters.startYear}&end_year=${filters.endYear}`;
  const ranking = profile.data?.data.ranking;
  // The average of the period (the period row of the API): nominal for one year, corrected for several.
  const periodAverage = averageAll.data?.data.find((row) => row.year === null);

  return (
    <>
      <PageHeader
        eyebrow={`Estado · ${REGION_LABEL[info.region]}`}
        title={info.name}
        aside={
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-3 pr-5 shadow-card">
            <Locator ufs={[info.uf]} label={`Mapa do Brasil com ${info.name} destacado`} className="block h-auto w-24 sm:w-28" />
            <div className="border-l border-line pl-4">
              {ranking ? (
                <>
                  <p className="text-3xl font-bold tracking-tight text-ink">{ranking.position}º</p>
                  <p className="max-w-[11rem] text-sm leading-snug text-ink-2">entre as 27 UFs em crédito rural, {range}</p>
                </>
              ) : (
                <Skeleton className="h-14 w-36" />
              )}
            </div>
          </div>
        }
      >
        <p>Crédito rural concedido no estado, com a posição entre as 27 UFs e a composição por atividade, finalidade e programa.</p>
      </PageHeader>
      <FilterBar controls={["period", "activity", "purpose"]} />

      <div className="flex flex-col gap-6">
        {profile.isPending ? (
          <div className="grid grid-cols-1 gap-3 min-[22.5rem]:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
        ) : ranking ? (
          <dl className="grid grid-cols-1 gap-3 min-[22.5rem]:grid-cols-2 lg:grid-cols-4" aria-label={`Indicadores de ${info.name} em ${range}`}>
            {basis === "nominal" ? (
              <Kpi label="Crédito concedido" value={formatMoney(ranking.amount_nominal)} detail={`valor nominal, ${range}`} />
            ) : (
              <Kpi label="Crédito concedido" value={formatMoney(ranking.amount_real)} detail={`${range}, em preços de dez/2025`} />
            )}
            <Kpi label="Participação no Brasil" value={formatPercent(ranking.share_pct)} detail={`${ranking.position}º lugar entre as UFs`} />
            <Kpi label="Contratos" value={formatCount(ranking.contracts)} detail={`em ${range}`} />
            <Kpi
              label="Valor médio por contrato"
              value={formatMoney(basis === "nominal" ? periodAverage?.average_nominal : periodAverage?.average_real)}
              detail={basis === "nominal" ? "valor nominal" : "em preços de dez/2025"}
            />
          </dl>
        ) : (
          profile.data && <EmptyState>Não há registros de crédito rural para {info.name} em {range}.</EmptyState>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card
            id="evolucao"
            title="Evolução do crédito rural"
            scope={`${scopeText(filters, ["activity", "purpose"], [info.uf])} · R$ por ano`}
            reading={totals.data ? trendReading(totals.data.data, end) : null}
          >
            <QueryView query={totals}>
              {(body) => <TrendChart rows={body.data} caption={`Crédito rural de ${info.name} por ano, nominal e corrigido.`} />}
            </QueryView>
          </Card>
          <Card
            id="atividades"
            title="Agricultura e pecuária"
            scope={`${scopeText(filters, [], [info.uf])} · participação no ano`}
            reading={profile.data ? activityReading(profile.data.data.activities, end) : null}
          >
            <QueryView query={profile}>
              {(body) => (
                <ShareStackChart
                  rows={activityRows(body.data.activities)}
                  series={ACTIVITY_SERIES}
                  caption={`Participação da agricultura e da pecuária no crédito de ${info.name} em cada ano.`}
                />
              )}
            </QueryView>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card
            id="finalidades"
            title="Finalidades do crédito"
            scope={`${scopeText(filters, ["activity"], [info.uf])} · participação no ano`}
            reading={purposes.data ? purposeReading(purposes.data.data, end) : null}
          >
            <QueryView query={purposes}>
              {(body) => (
                <ShareStackChart
                  rows={purposeRows(body.data)}
                  series={PURPOSE_SERIES}
                  caption={`Participação de cada finalidade no crédito de ${info.name} em cada ano.`}
                />
              )}
            </QueryView>
          </Card>
          <Card
            id="sazonalidade"
            title="Sazonalidade mensal"
            scope={`${scopeText(filters, ["purpose"], [info.uf])} · parte do crédito do ano`}
            reading={seasonality.data ? seasonalityReading(seasonality.data.data, range) : null}
          >
            <QueryView query={seasonality}>
              {(body) => <SeasonalityChart rows={body.data} caption={`Participação de cada mês no crédito anual de ${info.name}.`} />}
            </QueryView>
          </Card>
        </div>

        <Card
          id="valor-medio"
          title="Valor médio por contrato"
          scope={`${scopeText(filters, ["activity", "purpose"], [info.uf])} · em preços de dez/2025`}
          reading={average.data ? averageReading(average.data.data, range) : null}
        >
          <QueryView query={average}>
            {(body) => <AverageChart rows={body.data} caption={`Valor médio por contrato em ${info.name}, em preços de dezembro de 2025.`} />}
          </QueryView>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card id="programas" title="Programas e linhas de crédito" scope={`${scopeText(filters, [], [info.uf])} · ${BASIS_TEXT[basis]}`}>
            <QueryView query={programs} skeleton="h-80">
              {(body) =>
                body.data.length ? (
                  <RankTable
                    caption={`Programas de crédito rural em ${info.name}`}
                    nameHeader="Programa"
                    basis={basis}
                    rows={body.data.map((row) => ({ ...row, name: row.program }))}
                  />
                ) : (
                  <EmptyState>Sem registros no período.</EmptyState>
                )
              }
            </QueryView>
          </Card>
          <Card id="fontes" title="Fontes de recursos" scope={`${scopeText(filters, [], [info.uf])} · ${BASIS_TEXT[basis]}`}>
            <QueryView query={sources} skeleton="h-80">
              {(body) =>
                body.data.length ? (
                  <RankTable
                    caption={`Fontes de recursos do crédito rural em ${info.name}`}
                    nameHeader="Fonte de recursos"
                    basis={basis}
                    rows={body.data.map((row) => ({ ...row, name: row.funding_source }))}
                  />
                ) : (
                  <EmptyState>Sem registros no período.</EmptyState>
                )
              }
            </QueryView>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to={{ pathname: "/dados", search: `${periodSearch}&state=${info.uf}` }} className={buttonClass("secondary")}>
            <Icon name="download" size={18} />
            Ver e baixar as linhas de {info.uf}
          </Link>
          <Link to={{ pathname: "/comparar", search: `${periodSearch}&aba=estados&states=${info.uf}` }} className={buttonClass("secondary")}>
            Comparar com outros estados
            <Icon name="arrow-right" size={18} />
          </Link>
        </div>
      </div>
    </>
  );
}
