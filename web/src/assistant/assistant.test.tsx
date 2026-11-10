import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantDock } from "./AssistantDock";
import { AssistantProvider } from "./AssistantProvider";
import { emphasize, panelLinks } from "./Messages";
import { describeContext, screenContext } from "./screenContext";

// A real answer of the assistant (Gemini, 08/11/2026), as the API returns it.
const ANSWER = {
  answer:
    "Em 2025, o Piauí recebeu R$ 4,6 bilhões em crédito rural, o que representou 1,3% do total nacional (R$ 361,2 bilhões). \n\nFonte: Banco Central do Brasil (MDCR).",
  out_of_scope: false,
  provider: "gemini",
  sources: [
    { tool: "yearly_totals", filters: {}, panel_path: "/estados/PI?start_year=2025&end_year=2025", data: [] },
    { tool: "yearly_totals", filters: {}, panel_path: "/estados/PI?start_year=2025&end_year=2025", data: [] },
  ],
  meta: {
    source: "Banco Central do Brasil, Matriz de Dados do Crédito Rural (MDCR)",
    price_index: "IPCA",
    price_base: "2025-12",
    collected_at: "2026-10-23T12:00:00Z",
    notice: "Resposta escrita por um modelo de linguagem a partir dos dados do projeto. Os números vêm do banco; confira no painel.",
  },
};

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderAt(path: string, children: ReactNode = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AssistantProvider>
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
          {children}
          <AssistantDock />
        </AssistantProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** fetch: metadata says the assistant is available; ask answers with `ask`. */
function mockApi(ask: () => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/api/v1/metadata")) {
      return new Response(JSON.stringify({ assistant_available: true, programs: [], years: [] }), { status: 200 });
    }
    if (url.includes("/api/v1/assistant/ask")) return ask();
    return new Response("{}", { status: 404 });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("screen context", () => {
  it("describes what is on screen with the words of the API", () => {
    expect(screenContext("/estados/pi", "?start_year=2025&activity=livestock")).toEqual({
      page: "state",
      state: "PI",
      start_year: 2025,
      end_year: 2025,
      activity: "livestock",
    });
    expect(screenContext("/comparar", "?aba=estados&states=PI,MA&activity=livestock")).toEqual({
      page: "compare",
      states: ["PI", "MA"],
      start_year: 2017,
      end_year: 2025,
    });
    expect(screenContext("/dados", "?region=sul")).toMatchObject({ page: "data", region: "sul" });
    expect(screenContext("/sobre", "?state=PI")).toEqual({ page: "about" });
    expect(screenContext("/matopiba", "?activity=livestock")).not.toHaveProperty("activity");
  });

  it("never passes invalid values on to the API", () => {
    expect(screenContext("/", "?state=XX&start_year=1990&activity=pecuaria")).toEqual({
      page: "overview",
      start_year: 2017,
      end_year: 2025,
    });
  });

  it("reads as a short line above the input", () => {
    expect(describeContext(screenContext("/estados/PI", "?start_year=2025&activity=livestock"))).toBe("Piauí · Pecuária · 2025");
    expect(describeContext({ page: "about" })).toBeNull();
  });
});

describe("messages", () => {
  it("sets the amounts and percentages of an answer in bold", () => {
    const { container } = render(<p>{emphasize(ANSWER.answer)}</p>);
    expect([...container.querySelectorAll("strong")].map((node) => node.textContent)).toEqual([
      "R$ 4,6 bilhões",
      "1,3%",
      "R$ 361,2 bilhões",
    ]);
  });

  it("links each page of the panel once", () => {
    expect(panelLinks(ANSWER.sources)).toEqual(["/estados/PI?start_year=2025&end_year=2025"]);
  });
});

describe("assistant panel", () => {
  it("sends the question with the screen context, shows the answer, its source and keeps the history", async () => {
    const fetchMock = mockApi(() => new Response(JSON.stringify(ANSWER), { status: 200 }));
    const user = userEvent.setup();
    renderAt("/estados/PI?start_year=2025&end_year=2025");

    await user.click(screen.getByRole("button", { name: "Assistente de Dados" }));
    const panel = screen.getByRole("dialog", { name: "Assistente de Dados" });
    expect(within(panel).getByText("Considerando a tela: Piauí · 2025")).toBeInTheDocument();
    await user.type(within(panel).getByRole("textbox", { name: "Sua pergunta" }), "Qual a participação do Piauí?{Enter}");

    expect(await within(panel).findByText("R$ 4,6 bilhões")).toBeInTheDocument();
    expect(within(panel).getByText("Data da coleta: 23/10/2026")).toBeInTheDocument();
    expect(within(panel).getAllByRole("link", { name: /no painel/ })).toHaveLength(1);
    const askCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/assistant/ask"));
    expect(JSON.parse(String(askCall?.[1]?.body))).toEqual({
      question: "Qual a participação do Piauí?",
      context: { page: "state", state: "PI", start_year: 2025, end_year: 2025 },
    });

    await user.click(within(panel).getByRole("button", { name: "Fechar o Assistente de Dados" }));
    expect(panel).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Assistente de Dados" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Assistente de Dados" }));
    expect(within(panel).getByText("Qual a participação do Piauí?")).toBeVisible();
  });

  it("sends the previous question with a follow-up, and forgets it after clearing the conversation", async () => {
    const fetchMock = mockApi(() => new Response(JSON.stringify(ANSWER), { status: 200 }));
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Assistente de Dados" }));
    const panel = screen.getByRole("dialog", { name: "Assistente de Dados" });
    const input = within(panel).getByRole("textbox", { name: "Sua pergunta" });
    const asked = () =>
      fetchMock.mock.calls
        .filter(([url]) => String(url).includes("/assistant/ask"))
        .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

    await user.type(input, "Quanto o Piauí recebeu em 2025?{Enter}");
    await within(panel).findByText("R$ 4,6 bilhões");
    await user.type(input, "E o Ceará?{Enter}");
    await waitFor(() => expect(asked()).toHaveLength(2));
    expect(asked()[0]).not.toHaveProperty("previous_question");
    expect(asked()[1]).toMatchObject({ question: "E o Ceará?", previous_question: "Quanto o Piauí recebeu em 2025?" });

    await waitFor(() => expect(within(panel).getByRole("button", { name: "Limpar conversa" })).toBeEnabled());
    await user.click(within(panel).getByRole("button", { name: "Limpar conversa" }));
    await user.type(input, "Quem lidera?{Enter}");
    await waitFor(() => expect(asked()).toHaveLength(3));
    expect(asked()[2]).not.toHaveProperty("previous_question");
  });

  it("follows a source link to the page of the panel", async () => {
    mockApi(() => new Response(JSON.stringify(ANSWER), { status: 200 }));
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Assistente de Dados" }));
    const panel = screen.getByRole("dialog", { name: "Assistente de Dados" });
    await user.click(within(panel).getByRole("button", { name: "Quais estados lideram?" }));
    await user.click(await within(panel).findByRole("link", { name: /Ver Piauí no painel/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/estados/PI?start_year=2025&end_year=2025");
  });

  it("explains a refused question and lets the visitor try again", async () => {
    let calls = 0;
    mockApi(() => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ error: { code: "assistant_unavailable", message: "x" } }), { status: 503 })
        : new Response(JSON.stringify(ANSWER), { status: 200 });
    });
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Assistente de Dados" }));
    const panel = screen.getByRole("dialog", { name: "Assistente de Dados" });
    await user.type(within(panel).getByRole("textbox", { name: "Sua pergunta" }), "Quanto o Piauí recebeu?{Enter}");

    expect(await within(panel).findByRole("alert")).toHaveTextContent("O assistente está indisponível agora.");
    await user.click(within(panel).getByRole("button", { name: "Tentar novamente" }));
    expect(await within(panel).findByText("R$ 4,6 bilhões")).toBeInTheDocument();
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not send questions shorter than 3 characters", async () => {
    const fetchMock = mockApi(() => new Response(JSON.stringify(ANSWER), { status: 200 }));
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "Assistente de Dados" }));
    const panel = screen.getByRole("dialog", { name: "Assistente de Dados" });
    await user.type(within(panel).getByRole("textbox", { name: "Sua pergunta" }), "oi{Enter}");
    expect(within(panel).getByRole("button", { name: "Enviar pergunta" })).toBeDisabled();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/assistant/ask"))).toBe(false));
  });
});
