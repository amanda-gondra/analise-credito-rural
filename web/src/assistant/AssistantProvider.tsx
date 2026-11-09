/**
 * State of the Assistente de Dados, above the routes: the conversation survives navigation,
 * minimizing and closing; only "Limpar conversa" or a reload clears it.
 */
import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";

import { ApiError, postJson } from "../api/client";
import { useMetadata } from "../api/queries";
import type { AskResponse, ScreenContext } from "../api/types";
import { screenContext } from "./screenContext";

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 500;

export interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  response?: AskResponse;
  /** For an assistant message that failed: what to show and the question to send again. */
  error?: { text: string; question: string };
}

export type PanelState = "closed" | "open" | "minimized";

interface AssistantValue {
  panel: PanelState;
  messages: Message[];
  loading: boolean;
  /** false: no language model configured on the server (GET /metadata). */
  available: boolean;
  context: ScreenContext;
  open: () => void;
  close: () => void;
  minimize: () => void;
  ask: (question: string) => void;
  retry: (message: Message) => void;
  clear: () => void;
}

const AssistantContext = createContext<AssistantValue | null>(null);

function minutes(seconds: number | null): string {
  if (!seconds) return "alguns minutos";
  const value = Math.max(1, Math.ceil(seconds / 60));
  return value === 1 ? "1 minuto" : `${value} minutos`;
}

export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return "Não foi possível obter a resposta. Tente novamente.";
  switch (error.code) {
    case "assistant_limit":
      return `Você chegou ao limite de perguntas ao assistente. Tente novamente em ${minutes(error.retryAfter)}.`;
    case "rate_limited":
      return "Muitos pedidos em pouco tempo. Aguarde um minuto e tente novamente.";
    case "assistant_unavailable":
      return "O assistente está indisponível agora. O painel e os gráficos continuam funcionando.";
    case "validation_error":
      return `A pergunta precisa ter entre ${QUESTION_MIN} e ${QUESTION_MAX} caracteres.`;
    case "network_error":
      return "Não foi possível falar com o servidor. Verifique a conexão e tente novamente.";
    default:
      return "Não foi possível obter a resposta. Tente novamente.";
  }
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const metadata = useMetadata();
  const [panel, setPanel] = useState<PanelState>("closed");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const nextId = useRef(1);
  const pending = useRef<AbortController | null>(null);

  const context = useMemo(() => screenContext(location.pathname, location.search), [location.pathname, location.search]);

  const send = useCallback((question: string, screen: ScreenContext) => {
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    postJson<AskResponse>("/api/v1/assistant/ask", { question, context: screen }, controller.signal)
      .then((response) => {
        setMessages((list) => [...list, { id: nextId.current++, role: "assistant", text: response.answer, response }]);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMessages((list) => [
          ...list,
          { id: nextId.current++, role: "assistant", text: "", error: { text: errorText(error), question } },
        ]);
      })
      .finally(() => {
        if (pending.current === controller) {
          pending.current = null;
          setLoading(false);
        }
      });
  }, []);

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (pending.current || question.length < QUESTION_MIN || question.length > QUESTION_MAX) return;
      setMessages((list) => [...list, { id: nextId.current++, role: "user", text: question }]);
      send(question, context);
    },
    [send, context],
  );

  const retry = useCallback(
    (message: Message) => {
      if (pending.current || !message.error) return;
      setMessages((list) => list.filter((item) => item.id !== message.id));
      send(message.error.question, context);
    },
    [send, context],
  );

  const clear = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
    setLoading(false);
    setMessages([]);
  }, []);

  const value = useMemo<AssistantValue>(
    () => ({
      panel,
      messages,
      loading,
      available: metadata.data?.assistant_available ?? true,
      context,
      open: () => setPanel("open"),
      close: () => setPanel("closed"),
      minimize: () => setPanel("minimized"),
      ask,
      retry,
      clear,
    }),
    [panel, messages, loading, metadata.data?.assistant_available, context, ask, retry, clear],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant must be used inside AssistantProvider");
  return value;
}
