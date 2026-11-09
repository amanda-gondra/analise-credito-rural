import { Link } from "react-router";

import { useSharedSearch } from "../components/layout/Header";
import { PageHeader } from "../components/layout/PageHeader";
import { Icon } from "../components/ui/Icon";
import { REGIONS, REGION_LABEL, UFS } from "../lib/domain";

export default function StatesIndexPage() {
  const search = useSharedSearch();
  return (
    <>
      <PageHeader eyebrow="Estados" title="Escolha um estado">
        <p>O perfil de cada UF reúne a posição no ranking, a evolução anual, a agricultura e a pecuária, as finalidades e os programas.</p>
      </PageHeader>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {REGIONS.map((region) => (
          <section key={region} aria-labelledby={`regiao-${region}`} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <h2 id={`regiao-${region}`} className="mb-2 text-base font-semibold text-ink">
              {REGION_LABEL[region]}
            </h2>
            <ul className="grid grid-cols-1 gap-1 xs:grid-cols-2">
              {UFS.filter((item) => item.region === region).map((item) => (
                <li key={item.uf}>
                  <Link
                    to={{ pathname: `/estados/${item.uf}`, search }}
                    className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 text-sm text-ink hover:bg-forest-50"
                  >
                    <span className="min-w-0 truncate">
                      <span className="mr-2 inline-block w-7 font-semibold text-forest">{item.uf}</span>
                      {item.name}
                    </span>
                    <Icon name="arrow-right" size={16} className="shrink-0 text-ink-2" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
