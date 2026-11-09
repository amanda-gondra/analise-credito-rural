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
import { ACTIVITY_SERIES, PURPOSE_SERIES, activityRows, purposeRows } from "../components/charts/series";
import { RankTable } from "../components/data/RankTable";
import { FilterBar } from "../components/filters/FilterBar";
import { PageHeader, scopeText } from "../components/layout/PageHeader";
import { Card, Kpi } from "../components/ui/Card";
import { buttonClass } from "../components/ui/controls";
import { EmptyState, QueryView, Skeleton } from "../components/ui/feedback";
import { Icon } from "../components/ui/Icon";
import { REGION_LABEL, ufInfo } from "../lib/domain";
import { apiParams, useFilters } from "../lib/filters";
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
  const programs = usePrograms({ ...period, state: uf }, valid);
  const sources = useFundingSources({ ...period, state: uf }, valid);

  if (!info) return <NotFoundPage />;
  const range = formatPeriod(filters.startYear, filters.endYear);
  const periodSearch = `?start_year=${filters.startYear}&end_year=${filters.endYear}`;

  return (
    <>
      <PageHeader eyebrow={`Estado · ${REGION_LABEL[info.region]}`} title={info.name}>
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
        ) : profile.data?.data.ranking ? (
          <dl className="grid grid-cols-1 gap-3 min-[22.5rem]:grid-cols-2 lg:grid-cols-4" aria-label={`Indicadores de ${info.name} em ${range}`}>
            <Kpi label="Posição entre as UFs" value={`${profile.data.data.ranking.position}º`} detail={`em ${range}`} />
            <Kpi label="Valor corrigido" value={formatMoney(profile.data.data.ranking.amount_real)} detail="preços de dez/2025" />
            <Kpi label="Participação no Brasil" value={formatPercent(profile.data.data.ranking.share_pct)} detail={`total de ${range}`} />
            <Kpi label="Contratos" value={formatCount(profile.data.data.ranking.contracts)} detail={`em ${range}`} />
          </dl>
        ) : (
          profile.data && <EmptyState>Não há registros de crédito rural para {info.name} em {range}.</EmptyState>
        )}

        <Card id="evolucao" title="Evolução anual" scope={scopeText(filters, ["activity", "purpose"], [info.uf])}>
          <QueryView query={totals}>
            {(body) => <TrendChart rows={body.data} caption={`Crédito rural de ${info.name} por ano, nominal e corrigido.`} />}
          </QueryView>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card id="atividades" title="Agricultura e pecuária" scope={`${scopeText(filters, [], [info.uf])} · participação no ano`}>
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
          <Card id="finalidades" title="Finalidades" scope={`${scopeText(filters, ["activity"], [info.uf])} · participação no ano`}>
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
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card id="sazonalidade" title="Meses de contratação" scope={scopeText(filters, ["purpose"], [info.uf])}>
            <QueryView query={seasonality}>
              {(body) => <SeasonalityChart rows={body.data} caption={`Participação de cada mês no crédito anual de ${info.name}.`} />}
            </QueryView>
          </Card>
          <Card id="valor-medio" title="Valor médio por contrato" scope={`${scopeText(filters, ["activity", "purpose"], [info.uf])} · corrigido`}>
            <QueryView query={average}>
              {(body) => <AverageChart rows={body.data} caption={`Valor médio por contrato em ${info.name}, em preços de dezembro de 2025.`} />}
            </QueryView>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card id="programas" title="Programas" scope={`${scopeText(filters, [], [info.uf])} · valores corrigidos`}>
            <QueryView query={programs} skeleton="h-80">
              {(body) =>
                body.data.length ? (
                  <RankTable
                    caption={`Programas de crédito rural em ${info.name}`}
                    nameHeader="Programa"
                    rows={body.data.map((row) => ({ ...row, name: row.program }))}
                  />
                ) : (
                  <EmptyState>Sem registros no período.</EmptyState>
                )
              }
            </QueryView>
          </Card>
          <Card id="fontes" title="Fontes de recursos" scope={`${scopeText(filters, [], [info.uf])} · valores corrigidos`}>
            <QueryView query={sources} skeleton="h-80">
              {(body) =>
                body.data.length ? (
                  <RankTable
                    caption={`Fontes de recursos do crédito rural em ${info.name}`}
                    nameHeader="Fonte de recursos"
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
