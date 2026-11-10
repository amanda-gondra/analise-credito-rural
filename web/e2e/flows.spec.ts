/**
 * The interactions the brief asks to validate, on a phone and on a computer: navigation,
 * filters, state selection, the assistant (open, ask, follow a source, minimize, close,
 * history kept) and the data explorer.
 */
import { type Page, type Route, expect, test } from "@playwright/test";

import { RECORDED_ANSWER, RECORDED_QUESTION, VIEWPORTS, expectNoHorizontalScroll, waitForData } from "./support";

const PHONE = VIEWPORTS[1]; // 375 x 812
const DESKTOP = VIEWPORTS[5]; // 1366 x 768

async function mockAssistant(page: Page) {
  const bodies: unknown[] = [];
  await page.route("**/api/v1/assistant/ask", async (route: Route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RECORDED_ANSWER) });
  });
  return bodies;
}

test.describe("phone", () => {
  test.use({ viewport: { width: PHONE.width, height: PHONE.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("menu opens in a sheet, navigates and closes with Escape", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Principal" })).toBeHidden();
    await page.getByRole("button", { name: "Menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Navegação" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Menu" }).click();
    await dialog.getByRole("link", { name: "MATOPIBA" }).click();
    await expect(page).toHaveURL(/\/matopiba/);
    await expect(page.getByRole("heading", { level: 1, name: "MATOPIBA" })).toBeVisible();
  });

  test("filters open in a sheet, apply to the URL and show as chips", async ({ page }) => {
    await page.goto("/");
    await waitForData(page);
    await page.getByRole("button", { name: /^Filtros/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filtros" });
    await sheet.getByText("Pecuária").click();
    await page.screenshot({ path: "test-results/visual/filtros-375x812.png" });
    await sheet.getByRole("button", { name: "Ver resultados" }).click();
    await expect(page).toHaveURL(/activity=livestock/);
    await expect(page.getByRole("button", { name: "Remover filtro: atividade" })).toBeVisible();
    await waitForData(page);
    await expectNoHorizontalScroll(page);
  });

  test("assistant sheet: ask, see the source, follow it, and keep the history", async ({ page }) => {
    const sent = await mockAssistant(page);
    await page.goto("/estados/PI?start_year=2025&end_year=2025");
    await waitForData(page);
    await page.getByRole("button", { name: "Abrir o Assistente de Dados" }).click();
    const sheet = page.getByRole("dialog", { name: "Assistente de Dados" });
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height + 1);

    const input = sheet.getByRole("textbox", { name: "Sua pergunta" });
    await input.fill(RECORDED_QUESTION);
    await expect(input).toBeInViewport();
    await sheet.getByRole("button", { name: "Enviar pergunta" }).click();
    await expect(sheet.getByText("R$ 4,6 bilhões")).toBeVisible();
    await expect(sheet.getByText("Data da coleta: 23/10/2026")).toBeVisible();
    await page.screenshot({ path: "test-results/visual/assistente-375x812.png" });
    expect(sent[0]).toMatchObject({
      question: RECORDED_QUESTION,
      context: { page: "state", state: "PI", start_year: 2025, end_year: 2025 },
    });

    await sheet.getByRole("link", { name: /Ver Piauí no painel/ }).first().click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/estados\/PI\?start_year=2025&end_year=2025/);

    await page.getByRole("button", { name: /Abrir o Assistente de Dados/ }).click();
    await expect(sheet.getByText("R$ 4,6 bilhões")).toBeVisible();
    await sheet.getByRole("button", { name: "Fechar o Assistente de Dados" }).click();
    await expect(sheet).toBeHidden();
  });

  test("explorer shows rows as cards with details on demand", async ({ page }) => {
    await page.goto("/dados?start_year=2025&state=PI&activity=livestock");
    await waitForData(page);
    const cards = page.getByRole("list", { name: "Linhas da base de crédito rural" });
    await expect(cards).toBeVisible();
    await cards.locator("summary").first().click();
    await expect(cards.getByText("Fonte").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Baixar CSV" })).toHaveAttribute("href", /\/api\/v1\/credit\.csv\?/);
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: DESKTOP.width, height: DESKTOP.height } });

  test("selecting a state on the ranking shows its numbers and goes to the URL", async ({ page }) => {
    await page.goto("/");
    await waitForData(page);
    // The first row of the ranking, whichever UF leads in the period.
    const first = page.getByRole("button", { name: /^1 \p{Lu}/u });
    const name = (await first.locator("span").nth(1).textContent())?.trim() ?? "";
    await first.click();
    await expect(page).toHaveURL(/state=[A-Z]{2}/);
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: `Ver o perfil de ${name}` })).toBeVisible();
  });

  test("explorer shows a table, pages forward and back, and links the CSV", async ({ page }) => {
    await page.goto("/dados?start_year=2025&state=PI");
    await waitForData(page);
    const table = page.getByRole("table", { name: "Linhas da base de crédito rural" });
    await expect(table).toBeVisible();
    await expect(page.getByRole("list", { name: "Linhas da base de crédito rural" })).toBeHidden();
    const firstRow = await table.locator("tbody tr").first().textContent();
    await page.getByRole("button", { name: "Próxima" }).click();
    await expect(page.getByText("Página 2")).toBeVisible();
    await expect(table.locator("tbody tr").first()).not.toHaveText(firstRow ?? "");
    await page.getByRole("button", { name: "Anterior" }).click();
    await expect(page.getByText("Página 1")).toBeVisible();
    await expect(table.locator("tbody tr").first()).toHaveText(firstRow ?? "");
    const csv = await page.request.get(await page.getByRole("link", { name: "Baixar CSV" }).getAttribute("href") ?? "");
    expect(csv.headers()["content-type"]).toContain("text/csv");
  });

  test("map: arrows move between states and Enter selects", async ({ page }) => {
    await page.goto("/");
    await waitForData(page);
    const map = page.getByRole("group", { name: /Mapa do Brasil/ });
    await map.getByRole("button", { name: /^Mato Grosso:/ }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/state=[A-Z]{2}/);
    await expect(page.getByRole("tooltip")).toBeVisible();
  });

  test("assistant panel: floats without blocking the page, minimizes to a bar, keeps the history", async ({ page }) => {
    await mockAssistant(page);
    await page.goto("/");
    await waitForData(page);
    await page.getByRole("button", { name: "Assistente de Dados" }).click();
    const panel = page.getByRole("dialog", { name: "Assistente de Dados" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("textbox", { name: "Sua pergunta" })).toBeFocused();
    await panel.getByRole("button", { name: "Quais estados lideram?" }).click();
    await expect(panel.getByText("R$ 4,6 bilhões")).toBeVisible();
    await page.screenshot({ path: "test-results/visual/assistente-1366x768.png" });

    // The page behind stays usable.
    await page.getByRole("link", { name: "Comparar" }).first().click();
    await expect(page).toHaveURL(/\/comparar/);
    await expect(panel.getByText("R$ 4,6 bilhões")).toBeVisible();

    await panel.getByRole("button", { name: "Minimizar o Assistente de Dados" }).click();
    await expect(panel).toBeHidden();
    await page.getByRole("button", { name: /Assistente de Dados.*restaurar/ }).click();
    await expect(panel.getByText("R$ 4,6 bilhões")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("assistant errors are explained in Portuguese, with a retry", async ({ page }) => {
    await page.route("**/api/v1/assistant/ask", (route) =>
      route.fulfill({
        status: 429,
        headers: { "Retry-After": "120" },
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "assistant_limit", message: "limit", request_id: "x", details: [] } }),
      }),
    );
    await page.goto("/sobre");
    await page.getByRole("button", { name: "Assistente de Dados" }).click();
    const panel = page.getByRole("dialog", { name: "Assistente de Dados" });
    await panel.getByRole("textbox", { name: "Sua pergunta" }).fill("Quanto o Piauí recebeu?");
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("alert")).toContainText("Tente novamente em 2 minutos");
    await expect(panel.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  });
});
