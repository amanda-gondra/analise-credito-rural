import { useMatopiba } from "../api/queries";
import type { MatopibaYear } from "../api/types";
import { MultiLineChart } from "../components/charts/Charts";
import { pivot } from "../components/charts/series";
import { FilterBar } from "../components/filters/FilterBar";
import { PageHeader, scopeText } from "../components/layout/PageHeader";
import { Card, Kpi } from "../components/ui/Card";
import { Notice, QueryView, Skeleton } from "../components/ui/feedback";
import shapes from "../data/uf-shapes.json";
import { MATOPIBA, ufName } from "../lib/domain";
import { apiParams, useFilters } from "../lib/filters";
import { formatCount, formatMoney, formatMoneyTick, formatPercent } from "../lib/format";
import { CATEGORY, SERIES_COLOR } from "../lib/palette";

const BLOC = "MATOPIBA";

/** Brazil with the four states of the bloc highlighted (a locator, not data). */
function Locator() {
  const [x, y, w, h] = shapes.viewBox;
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label="Mapa do Brasil com Maranhão, Tocantins, Piauí e Bahia destacados" className="mx-auto block h-auto w-full max-w-[16rem]">
      {shapes.ufs.map((item) => {
        const inBloc = (MATOPIBA as readonly string[]).includes(item.uf);
        return (
          <path
            key={item.uf}
            d={item.d}
            fill={inBloc ? SERIES_COLOR.real : "#e4e9e3"}
            stroke="#ffffff"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {shapes.ufs
        .filter((item) => (MATOPIBA as readonly string[]).includes(item.uf))
        .map((item) => (
          <text key={item.uf} x={item.cx} y={item.cy} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={700} fill="#ffffff" aria-hidden="true">
            {item.uf}
          </text>
        ))}
    </svg>
  );
}

export default function MatopibaPage() {
  const { filters } = useFilters();
  const matopiba = useMatopiba(apiParams(filters));
  const end = filters.endYear;
  const rows = matopiba.data?.data ?? [];
  const blocEnd = rows.find((row) => row.state === null && row.year === end);
  const series = MATOPIBA.map((uf, index) => ({ key: uf, label: ufName(uf), short: uf, color: CATEGORY[index]! }));
  const withBloc = (data: MatopibaYear[]) => pivot(data, (row) => row.state ?? BLOC, (row) => row.share_of_brazil_pct);

  return (
    <>
      <PageHeader eyebrow="Fronteira agrícola" title="MATOPIBA">
        <p>
          Maranhão, Tocantins, Piauí e Bahia, os estados da fronteira agrícola do Cerrado, juntos e um a um.
        </p>
      </PageHeader>
      <FilterBar controls={["period"]} />

      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {matopiba.isPending ? (
            <Skeleton className="h-32" />
          ) : (
            <dl className="grid grid-cols-1 gap-3 xs:grid-cols-3 lg:grid-cols-3" aria-label={`MATOPIBA em ${end}`}>
              <Kpi label={`Concedido em ${end}`} value={formatMoney(blocEnd?.amount_nominal)} detail="valor nominal, quatro estados" />
              <Kpi label={`Participação no Brasil em ${end}`} value={formatPercent(blocEnd?.share_of_brazil_pct)} detail="valores nominais" />
              <Kpi label={`Contratos em ${end}`} value={formatCount(blocEnd?.contracts)} />
            </dl>
          )}
          <div className="row-span-2 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <Locator />
          </div>
          <Notice>
            O painel considera os quatro estados inteiros. A delimitação oficial da Embrapa reúne 337 municípios desses estados,
            mas a base do projeto soma os municípios dentro de cada UF, então não permite recortar só a parte do Cerrado.
          </Notice>
        </div>

        <Card id="participacao" title="Participação no crédito rural do Brasil" scope={`${scopeText(filters, [])} · valores nominais de cada ano`}>
          <QueryView query={matopiba}>
            {(body) => (
              <MultiLineChart
                rows={withBloc(body.data)}
                series={[{ key: BLOC, label: "MATOPIBA (quatro estados)", short: "Bloco", color: SERIES_COLOR.real }, ...series]}
                format={(value) => formatPercent(value)}
                tickFormat={(value) => `${value.toLocaleString("pt-BR")}%`}
                caption="Participação do MATOPIBA e de cada um dos seus estados no crédito rural do Brasil, ano a ano."
              />
            )}
          </QueryView>
        </Card>

        <Card id="estados" title="Crédito por estado do MATOPIBA" scope={`${scopeText(filters, [])} · valores corrigidos`}>
          <QueryView query={matopiba}>
            {(body) => (
              <MultiLineChart
                rows={pivot(body.data.filter((row) => row.state !== null), (row) => row.state ?? "", (row) => row.amount_real)}
                series={series}
                format={(value) => formatMoney(value)}
                tickFormat={formatMoneyTick}
                caption="Crédito rural de Maranhão, Tocantins, Piauí e Bahia por ano, em preços de dezembro de 2025."
              />
            )}
          </QueryView>
        </Card>
      </div>
    </>
  );
}
