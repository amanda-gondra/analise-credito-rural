import { useState } from "react";
import { useSearchParams } from "react-router";

import { apiUrl } from "../api/client";
import { useAverageContract, useCreditPage, useFundingSources, useMetadata, usePrograms } from "../api/queries";
import { CreditCards, CreditTable } from "../components/data/CreditRows";
import { RankTable } from "../components/data/RankTable";
import { FilterBar, FilterChip } from "../components/filters/FilterBar";
import { PageHeader, scopeText } from "../components/layout/PageHeader";
import { Card } from "../components/ui/Card";
import { Button, Select, buttonClass } from "../components/ui/controls";
import { EmptyState, ErrorState, Notice, Skeleton } from "../components/ui/feedback";
import { Icon } from "../components/ui/Icon";
import { REGIONS, REGION_LABEL, type Region, UFS, ufName } from "../lib/domain";
import { BASIS_TEXT, amountBasis, apiParams, readRegion, readUf, useFilters } from "../lib/filters";
import { formatCount, formatInteger, formatMoney } from "../lib/format";

const PAGE_SIZES = ["25", "50", "100"] as const;

/** state and region of the URL; the API accepts one or the other. */
function usePlace() {
  const [params, setParams] = useSearchParams();
  const state = readUf(params.get("state"));
  const region = state ? null : readRegion(params.get("region"));
  const program = params.get("program")?.trim() || null;
  const set = (change: { state?: string | null; region?: Region | null; program?: string | null }) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [name, value] of Object.entries(change)) {
          if (value) next.set(name, value);
          else next.delete(name);
        }
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  return { state, region, program, set };
}

function Rows({ params, signature }: { params: Record<string, string | number>; signature: string }) {
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>("25");
  // Cursors of the pages already seen, to go back; reset when the filters change.
  const [trail, setTrail] = useState<{ signature: string; cursors: string[] }>({ signature, cursors: [] });
  const cursors = trail.signature === signature ? trail.cursors : [];
  const cursor = cursors[cursors.length - 1];
  const page = useCreditPage({ ...params, limit: pageSize, ...(cursor ? { cursor } : {}) });
  const body = page.data;

  const go = (next: string[]) => setTrail({ signature, cursors: next });
  const csvTooLarge = body ? body.summary.rows > body.page.csv_max_rows : false;

  return (
    <Card
      id="linhas"
      title="Linhas da base"
      scope="Uma linha por mês, UF, atividade, programa, subprograma, fonte de recursos e finalidade"
      actions={
        body && !csvTooLarge && body.summary.rows > 0 ? (
          <a href={apiUrl("/api/v1/credit.csv", params)} download className={buttonClass("primary")}>
            <Icon name="download" size={18} />
            Baixar CSV
          </a>
        ) : undefined
      }
    >
      {page.isPending ? (
        <Skeleton className="h-96" />
      ) : page.error && !body ? (
        <ErrorState error={page.error} onRetry={() => page.refetch()} />
      ) : body ? (
        <div className={page.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={page.isFetching || undefined}>
          <p className="mb-3 text-sm text-ink-2" aria-live="polite">
            <span className="font-semibold text-ink">{formatInteger(body.summary.rows)}</span> linhas ·{" "}
            {formatCount(body.summary.contracts)} contratos · {formatMoney(body.summary.amount_real)} corrigidos (dez/2025)
          </p>
          {csvTooLarge && (
            <Notice tone="warning" className="mb-3">
              O arquivo CSV aceita até {formatInteger(body.page.csv_max_rows)} linhas. Reduza o período ou escolha um estado, uma
              região ou uma atividade para baixar.
            </Notice>
          )}
          {body.data.length === 0 ? (
            <EmptyState>Nenhuma linha com esses filtros.</EmptyState>
          ) : (
            <>
              <CreditTable rows={body.data} />
              <CreditCards rows={body.data} />
            </>
          )}
          <nav aria-label="Páginas" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* Below 400 px the buttons keep only the arrow; the word stays for screen readers. */}
              <Button icon="arrow-left" disabled={cursors.length === 0} onClick={() => go(cursors.slice(0, -1))} className="max-xs:px-3">
                <span className="max-xs:sr-only">Anterior</span>
              </Button>
              <span className="px-1 text-sm text-ink-2 tabular">Página {cursors.length + 1}</span>
              <Button
                iconAfter="arrow-right"
                disabled={!body.page.next_cursor}
                onClick={() => body.page.next_cursor && go([...cursors, body.page.next_cursor])}
                className="max-xs:px-3"
              >
                <span className="max-xs:sr-only">Próxima</span>
              </Button>
            </div>
            <Select
              label="Linhas por página"
              value={pageSize}
              options={PAGE_SIZES.map((size) => ({ value: size, label: `${size} por página` }))}
              onChange={(value) => {
                setPageSize(value);
                go([]);
              }}
              hideLabel
              className="w-40"
            />
          </nav>
        </div>
      ) : null}
    </Card>
  );
}

export default function ExplorePage() {
  const { filters } = useFilters();
  const place = usePlace();
  const metadata = useMetadata();
  const params: Record<string, string | number> = { ...apiParams(filters, ["activity", "purpose"]) };
  if (place.state) params.state = place.state;
  if (place.region) params.region = place.region;
  if (place.program) params.program = place.program;
  const signature = JSON.stringify(params);

  const rankingParams = { ...apiParams(filters), ...(place.state ? { state: place.state } : {}) };
  const programs = usePrograms(rankingParams);
  const sources = useFundingSources(rankingParams);
  const average = useAverageContract(params);
  const periodRow = average.data?.data.find((row) => row.year === null);
  const basis = amountBasis(filters);

  const placeValue = place.state ? `uf:${place.state}` : place.region ? `regiao:${place.region}` : "brasil";
  const placeOptions = [
    { value: "brasil", label: "Brasil" },
    ...REGIONS.map((region) => ({ value: `regiao:${region}`, label: `Região ${REGION_LABEL[region]}` })),
    ...UFS.map((item) => ({ value: `uf:${item.uf}`, label: `${item.name} (${item.uf})` })),
  ];
  const programOptions = [{ value: "", label: "Todos os programas" }, ...(metadata.data?.programs ?? []).map((name) => ({ value: name, label: name }))];
  const extraCount = Number(Boolean(place.state || place.region)) + Number(Boolean(place.program));
  const placeLabel = place.state ? ufName(place.state) : place.region ? `Região ${REGION_LABEL[place.region]}` : null;
  const rankingScope = scopeText(filters, [], placeLabel && place.state ? [placeLabel] : []);

  return (
    <>
      <PageHeader eyebrow="Explorar dados" title="Os dados linha a linha">
        <p>
          Filtre, navegue pelas linhas e baixe o CSV para planilhas em português (separador ponto e vírgula, vírgula decimal).
          Os rankings mostram programas e fontes de recursos no mesmo recorte.
        </p>
      </PageHeader>
      <FilterBar
        controls={["period", "activity", "purpose"]}
        extraCount={extraCount}
        onResetExtra={() => place.set({ state: null, region: null, program: null })}
        extra={
          <>
            <Select
              label="Local"
              value={placeValue}
              options={placeOptions}
              onChange={(value) => {
                if (value.startsWith("uf:")) place.set({ state: value.slice(3), region: null });
                else if (value.startsWith("regiao:")) place.set({ state: null, region: value.slice(7) as Region });
                else place.set({ state: null, region: null });
              }}
              className="sm:w-60"
            />
            <Select
              label="Programa"
              value={place.program ?? ""}
              options={programOptions}
              onChange={(value) => place.set({ program: value || null })}
              className="sm:w-72"
            />
          </>
        }
        extraChips={
          <>
            {placeLabel && (
              <FilterChip label="local" onRemove={() => place.set({ state: null, region: null })}>
                {placeLabel}
              </FilterChip>
            )}
            {place.program && (
              <FilterChip label="programa" onRemove={() => place.set({ program: null })}>
                <span className="max-w-[12rem] truncate">{place.program}</span>
              </FilterChip>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {periodRow && periodRow.contracts > 0 && (
          <p className="text-sm text-ink-2">
            Valor médio por contrato no recorte: <span className="text-base font-semibold text-ink tabular">{formatMoney(periodRow.average_real)}</span>{" "}
            {basis === "nominal"
              ? `(corrigido) e ${formatMoney(periodRow.average_nominal)} (nominal).`
              : "(corrigido para dezembro de 2025)."}
          </p>
        )}

        <Rows params={params} signature={signature} />

        <div className="grid gap-6 xl:grid-cols-2">
          <Card id="programas" title="Programas" scope={`${rankingScope} · ${BASIS_TEXT[basis]}${place.region ? " (Brasil: o ranking não filtra região)" : ""}`}>
            {programs.isPending ? (
              <Skeleton className="h-80" />
            ) : programs.data?.data.length ? (
              <RankTable caption="Programas por valor no período" nameHeader="Programa" basis={basis} rows={programs.data.data.map((row) => ({ ...row, name: row.program }))} />
            ) : programs.error ? (
              <ErrorState error={programs.error} onRetry={() => programs.refetch()} />
            ) : (
              <EmptyState>Sem registros no período.</EmptyState>
            )}
          </Card>
          <Card id="fontes" title="Fontes de recursos" scope={`${rankingScope} · ${BASIS_TEXT[basis]}${place.region ? " (Brasil: o ranking não filtra região)" : ""}`}>
            {sources.isPending ? (
              <Skeleton className="h-80" />
            ) : sources.data?.data.length ? (
              <RankTable
                caption="Fontes de recursos por valor no período"
                nameHeader="Fonte de recursos"
                basis={basis}
                rows={sources.data.data.map((row) => ({ ...row, name: row.funding_source }))}
              />
            ) : sources.error ? (
              <ErrorState error={sources.error} onRetry={() => sources.refetch()} />
            ) : (
              <EmptyState>Sem registros no período.</EmptyState>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
