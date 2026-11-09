import { Link } from "react-router";

import { useSharedSearch } from "../components/layout/Header";
import { PageHeader } from "../components/layout/PageHeader";
import { Icon } from "../components/ui/Icon";
import { REGIONS, REGION_LABEL, UFS } from "../lib/domain";
import { REGION_COLOR } from "../lib/palette";

export default function StatesIndexPage() {
  const search = useSharedSearch();
  return (
    <>
      <PageHeader eyebrow="Estados" title="Escolha um estado">
        <p>O perfil de cada UF reúne a posição no ranking, a evolução anual, a agricultura e a pecuária, as finalidades e os programas.</p>
      </PageHeader>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {REGIONS.map((region) => (
          <section key={region} aria-labelledby={`regiao-${region}`} className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
            {/* The accent is the color of the region in the charts of Comparar. */}
            <h2 id={`regiao-${region}`} className="mb-3 flex items-center gap-3 text-lg font-semibold tracking-tight text-ink">
              <span aria-hidden="true" className="h-6 w-1 rounded-full" style={{ backgroundColor: REGION_COLOR[region] }} />
              {REGION_LABEL[region]}
            </h2>
            <ul className="grid grid-cols-1 gap-x-4 xs:grid-cols-2">
              {UFS.filter((item) => item.region === region).map((item) => (
                <li key={item.uf} className="border-b border-line/70 last:border-b-0 xs:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                  <Link
                    to={{ pathname: `/estados/${item.uf}`, search }}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-forest-50"
                  >
                    <span className="w-7 shrink-0 font-semibold text-forest">{item.uf}</span>
                    <span className="min-w-0 flex-1 leading-snug">{item.name}</span>
                    {/* In two columns the arrow would take the room of the name; the row stays a link. */}
                    <Icon name="chevron-down" size={16} className="shrink-0 -rotate-90 text-ink-2 xs:hidden" />
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
