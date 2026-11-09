import { type Page, expect } from "@playwright/test";

/** The sizes the brief asks to check, from a small phone to a large monitor. */
export const VIEWPORTS = [
  { name: "320x640", width: 320, height: 640, phone: true },
  { name: "375x812", width: 375, height: 812, phone: true },
  { name: "390x844", width: 390, height: 844, phone: true },
  { name: "430x932", width: 430, height: 932, phone: true },
  { name: "768x1024", width: 768, height: 1024, phone: false },
  { name: "1366x768", width: 1366, height: 768, phone: false },
  { name: "1920x1080", width: 1920, height: 1080, phone: false },
] as const;

export const PAGES = [
  { name: "visao-geral", path: "/" },
  { name: "estados", path: "/estados" },
  { name: "estado-pi", path: "/estados/PI" },
  { name: "comparar-regioes", path: "/comparar" },
  { name: "comparar-estados", path: "/comparar?aba=estados&states=PI,MA" },
  { name: "matopiba", path: "/matopiba" },
  { name: "dados", path: "/dados?start_year=2025&state=PI" },
  { name: "sobre", path: "/sobre" },
] as const;

/**
 * An answer the assistant really gave (Gemini, 08/11/2026) to the question below, served by a
 * route mock so the tests never call the language model.
 */
export const RECORDED_QUESTION = "Qual a participação do Piauí no crédito rural do Brasil em 2025?";
export const RECORDED_ANSWER = {
  answer:
    "Em 2025, o Piauí recebeu R$ 4,6 bilhões em crédito rural, o que representou 1,3% do total nacional (R$ 361,2 bilhões). \n\nFonte: Banco Central do Brasil (MDCR).",
  out_of_scope: false,
  provider: "gemini",
  sources: [
    {
      tool: "yearly_totals",
      filters: { start_year: 2025, end_year: 2025, state: "PI", activity: null, purpose: null },
      panel_path: "/estados/PI?start_year=2025&end_year=2025",
      data: [],
    },
    {
      tool: "yearly_totals",
      filters: { start_year: 2025, end_year: 2025, state: null, activity: null, purpose: null },
      panel_path: "/?start_year=2025&end_year=2025",
      data: [],
    },
  ],
  meta: {
    source: "Banco Central do Brasil, Matriz de Dados do Crédito Rural (MDCR)",
    price_index: "IPCA (IBGE, SIDRA table 1737)",
    price_base: "2025-12",
    collected_at: "2026-10-23T12:00:00Z",
    notice:
      "Resposta escrita por um modelo de linguagem a partir dos dados do projeto. Os números vêm do banco; confira no painel.",
  },
};

/** Waits until every widget has left its loading state. */
export async function waitForData(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 30_000 });
}

/** The page never scrolls sideways: nothing is wider than the screen. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        // Elements inside a horizontal scroller (tables, chip rows) may extend past it on purpose.
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (["auto", "scroll", "hidden"].includes(style.overflowX) && parent !== document.body) return false;
        }
        return box.right > width + 1 || box.left < -1;
      })
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className.toString().slice(0, 60)}`);
    return { scrollWidth: document.documentElement.scrollWidth, width, wide };
  });
  expect(overflow.wide, `elements wider than ${overflow.width}px`).toEqual([]);
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);
}
