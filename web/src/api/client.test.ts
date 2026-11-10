import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiUrl, describeError, getJson, postJson } from "./client";

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api client", () => {
  it("builds URLs without empty parameters", () => {
    expect(apiUrl("/api/v1/totals/yearly", { start_year: 2017, state: null, activity: "" })).toBe(
      "/api/v1/totals/yearly?start_year=2017",
    );
  });

  it("returns the JSON body of a successful answer", async () => {
    const fetchMock = respond(200, { data: [1], meta: {} });
    await expect(getJson("/api/v1/metadata", { a: 1 })).resolves.toEqual({ data: [1], meta: {} });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/metadata?a=1", expect.objectContaining({ method: "GET" }));
  });

  it("turns the API error body into ApiError with code, request id and Retry-After", async () => {
    respond(
      429,
      { error: { code: "assistant_limit", message: "limit", request_id: "abc", details: [] } },
      { "Retry-After": "120" },
    );
    const error = (await postJson("/api/v1/assistant/ask", { question: "x" }).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.code, error.requestId, error.retryAfter]).toEqual([429, "assistant_limit", "abc", 120]);
  });

  it("survives an error body that is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>", { status: 502, statusText: "Bad Gateway" }));
    const error = (await getJson("/x").catch((e: unknown) => e)) as ApiError;
    expect([error.status, error.code]).toEqual([502, "http_502"]);
  });

  it("reports a network failure without leaking details", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await getJson("/x").catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: "network_error" });
    expect(describeError(error)).toMatch(/Não foi possível falar com o servidor/);
  });

  it("explains each known error in Portuguese", () => {
    expect(describeError(new ApiError(503, "database_unavailable", ""))).toMatch(/banco de dados/);
    expect(describeError(new ApiError(422, "export_too_large", ""))).toMatch(/CSV/);
    expect(describeError(new Error("boom"))).toMatch(/Algo deu errado/);
  });
});
