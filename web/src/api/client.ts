/**
 * Calls to the API. Every error becomes ApiError with the code of the API's error body
 * ({"error": {"code", "message", "request_id", "details"}}), so screens decide what to say
 * by code, in Portuguese, and never show raw server text.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export type QueryValue = string | number | boolean | null | undefined;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly retryAfter: number | null;

  constructor(status: number, code: string, message: string, requestId: string | null = null, retryAfter: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

export function apiUrl(path: string, params: Record<string, QueryValue> = {}): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") query.set(name, String(value));
  }
  const text = query.toString();
  return `${BASE_URL}${path}${text ? `?${text}` : ""}`;
}

interface ErrorBody {
  error?: { code?: unknown; message?: unknown; request_id?: unknown };
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBody | null = null;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = null;
  }
  const error = body?.error;
  const retry = Number(response.headers.get("Retry-After"));
  return new ApiError(
    response.status,
    typeof error?.code === "string" ? error.code : `http_${response.status}`,
    typeof error?.message === "string" ? error.message : response.statusText,
    typeof error?.request_id === "string" ? error.request_id : response.headers.get("X-Request-ID"),
    Number.isFinite(retry) && retry > 0 ? retry : null,
  );
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { Accept: "application/json", ...init.headers } });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "network_error", "The API could not be reached.");
  }
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}

export function getJson<T>(path: string, params: Record<string, QueryValue> = {}, signal?: AbortSignal): Promise<T> {
  return request<T>(apiUrl(path, params), { method: "GET", signal });
}

export function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(apiUrl(path), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    signal,
  });
}

/** What to tell the visitor about a failed request, in Portuguese. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Algo deu errado ao carregar os dados. Tente novamente.";
  switch (error.code) {
    case "network_error":
      return "Não foi possível falar com o servidor. Verifique a conexão e tente novamente.";
    case "database_unavailable":
      return "O banco de dados não respondeu a tempo. Tente novamente em alguns segundos.";
    case "rate_limited":
      return "Muitos pedidos em pouco tempo. Aguarde um minuto e tente novamente.";
    case "validation_error":
      return "Algum filtro tem um valor que a API não aceita. Restaure os filtros padrão.";
    case "export_too_large":
      return "A seleção tem linhas demais para um arquivo CSV. Reduza o período ou acrescente filtros.";
    default:
      return "Algo deu errado ao carregar os dados. Tente novamente.";
  }
}
