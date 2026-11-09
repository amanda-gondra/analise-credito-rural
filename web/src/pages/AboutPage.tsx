import type { ReactNode } from "react";

import { apiUrl } from "../api/client";
import { useMetadata } from "../api/queries";
import { PageHeader } from "../components/layout/PageHeader";
import { formatDate } from "../lib/format";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
      <div className="flex flex-col gap-3 text-base leading-relaxed text-ink">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  const metadata = useMetadata();
  const collected = metadata.data?.years.map((year) => year.collected_at).sort().at(-1);
  const ipca = metadata.data?.price_index;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Sobre" title="Os dados e a metodologia">
        <p>Um projeto de portfólio de análise de dados públicos: do arquivo do Banco Central ao painel e ao assistente.</p>
      </PageHeader>
      <div className="flex flex-col gap-5">
        <Section title="De onde vêm os números">
          <p>
            Da Matriz de Dados do Crédito Rural (MDCR) do Banco Central do Brasil: o crédito rural concedido por mês de emissão,
            UF, atividade, programa, subprograma, fonte de recursos e finalidade, de 2013 a 2025.
          </p>
          <p>
            A fonte revisa os dados diariamente; cada arquivo carregado guarda a data da coleta.
            {collected && <> Coleta mais recente: {formatDate(collected)}.</>}
          </p>
        </Section>
        <Section title="Valores nominais e corrigidos">
          <p>
            O valor nominal é o do mês da contratação. O valor corrigido leva cada mês a preços de dezembro de 2025 pelo IPCA
            (IBGE, tabela 1737 do SIDRA), para que anos diferentes possam ser comparados e somados.
            {ipca && <> Último mês do IPCA carregado: {ipca.last_month.split("-").reverse().join("/")}.</>}
          </p>
          <p>
            Participações dentro de um mesmo ano usam valores nominais; totais de vários anos usam valores corrigidos.
          </p>
        </Section>
        <Section title="Período e recortes">
          <p>
            O período padrão é 2017 a 2025, a série principal. De 2013 a 2016 os dados existem, mas a classificação de programas e
            finalidades mudou antes de 2017; compare esses anos com cautela.
          </p>
          <p>
            MATOPIBA é tratado como os quatro estados inteiros (Maranhão, Tocantins, Piauí e Bahia), porque a base soma os
            municípios dentro de cada UF.
          </p>
          <p>O mapa usa a malha de UFs do IBGE (2022) em projeção de áreas iguais, para que o tamanho dos estados seja comparável.</p>
        </Section>
        <Section title="O Assistente de Dados">
          <p>
            Responde perguntas em português usando as mesmas consultas do painel. Um modelo de linguagem escolhe a consulta e
            escreve a frase; os números vêm do banco de dados, e cada resposta traz o link para conferir no painel.
          </p>
          <p>
            Ele considera a página e os filtros em tela quando a pergunta não diz o recorte, e explica com um texto fixo quando o
            assunto está fora dos dados (municípios, bancos, juros, inadimplência, previsões). Pode errar: confira sempre a fonte.
          </p>
        </Section>
        <Section title="API aberta">
          <p>
            Todas as rotas usadas pelo site estão documentadas e podem ser consultadas diretamente, inclusive as linhas da base em
            páginas e em CSV.
          </p>
          <p>
            <a href={apiUrl("/docs")} className="font-semibold text-forest underline underline-offset-4">
              Documentação da API
            </a>
          </p>
        </Section>
      </div>
    </div>
  );
}
