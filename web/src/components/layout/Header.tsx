/**
 * Desktop (>= 1024 px): logo and the six links in one row. Smaller screens: logo and a
 * "Menu" button that opens the same links in a side sheet. One navigation, never two.
 * Links keep the shared filters (period, activity, purpose), so moving between pages does
 * not reset what the visitor chose.
 */
import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";

import logo from "../../assets/logo.webp";
import { cn } from "../../lib/cn";
import { readFilters, writeFilters } from "../../lib/filters";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";

export const NAV_ITEMS = [
  { to: "/", label: "Visão geral", end: true },
  { to: "/estados", label: "Estados", end: false },
  { to: "/comparar", label: "Comparar", end: false },
  { to: "/matopiba", label: "MATOPIBA", end: false },
  { to: "/dados", label: "Explorar dados", end: false },
  { to: "/sobre", label: "Sobre", end: false },
] as const;

/** The shared filters of the current URL, as a query string for the other pages. */
export function useSharedSearch(): string {
  const { search } = useLocation();
  // writeFilters leaves the defaults out, so an untouched page links without a query string.
  const text = writeFilters(new URLSearchParams(), readFilters(new URLSearchParams(search))).toString();
  return text ? `?${text}` : "";
}

function NavLinks({ onNavigate, vertical }: { onNavigate?: () => void; vertical?: boolean }) {
  const search = useSharedSearch();
  return (
    <ul className={cn("flex", vertical ? "flex-col gap-1" : "items-center gap-1")}>
      {NAV_ITEMS.map((item) => (
        <li key={item.to}>
          <NavLink
            to={{ pathname: item.to, search }}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center rounded-full font-medium transition-colors",
                vertical ? "min-h-12 px-4 text-base" : "min-h-10 px-3.5 text-sm",
                isActive ? "bg-forest-100 text-forest" : "text-ink hover:bg-sunken",
              )
            }
          >
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const search = useSharedSearch();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-16 lg:px-8">
        <Link to={{ pathname: "/", search }} className="shrink-0 rounded-md" aria-label="Análise de Crédito Rural, página inicial">
          <img src={logo} alt="" width={327} height={96} className="h-9 w-auto lg:h-10" />
        </Link>
        <nav aria-label="Principal" className="hidden lg:block">
          <NavLinks />
        </nav>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-control px-4 text-sm font-medium text-ink hover:bg-sunken lg:hidden"
        >
          <Icon name="menu" size={18} />
          Menu
        </button>
      </div>
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Navegação" side="right">
        <nav aria-label="Principal">
          <NavLinks vertical onNavigate={() => setMenuOpen(false)} />
        </nav>
      </Sheet>
    </header>
  );
}
