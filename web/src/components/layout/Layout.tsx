import { useIsFetching } from "@tanstack/react-query";
import { Suspense } from "react";
import { Link, Outlet, ScrollRestoration } from "react-router";

import { AssistantDock } from "../../assistant/AssistantDock";
import { AssistantProvider } from "../../assistant/AssistantProvider";
import { useDelayedFlag } from "../../lib/hooks";
import { Skeleton } from "../ui/feedback";
import { Header } from "./Header";

/** The API on a free plan sleeps when idle; the first request can take tens of seconds. */
function ColdStartNotice() {
  const late = useDelayedFlag(useIsFetching() > 0, 5000);
  if (!late) return null;
  return (
    <div role="status" className="border-b border-line bg-petroleum-50 px-4 py-2 text-center text-sm text-ink">
      Carregando os dados. Se o servidor estava em repouso, a primeira resposta pode levar até um minuto.
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-ink-2 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <p>
          Fonte: Banco Central do Brasil, Matriz de Dados do Crédito Rural (MDCR). Valores reais em preços de dezembro
          de 2025 (IPCA/IBGE).
        </p>
        <p>
          <Link to="/sobre" className="font-medium text-forest underline-offset-4 hover:underline">
            Sobre os dados e a metodologia
          </Link>
        </p>
      </div>
    </footer>
  );
}

export function Layout() {
  return (
    <AssistantProvider>
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-forest px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <Header />
      <ColdStartNotice />
      <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 pb-fab pt-6 outline-none sm:px-6 lg:px-8 lg:pt-8">
        <Suspense fallback={<Skeleton className="h-96" label="Carregando a página" />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <AssistantDock />
      <ScrollRestoration />
    </AssistantProvider>
  );
}
