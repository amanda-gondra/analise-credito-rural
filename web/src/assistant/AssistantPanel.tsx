/**
 * The panel of the Assistente de Dados: header, conversation (its own scroll), and the input
 * fixed at the bottom with the suggestions. The same component is the floating panel on a
 * computer and the bottom sheet on a phone (AssistantDock decides where it sits).
 */
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { Icon } from "../components/ui/Icon";
import { cn } from "../lib/cn";
import { QUESTION_MAX, QUESTION_MIN, useAssistant } from "./AssistantProvider";
import { Messages } from "./Messages";
import { describeContext } from "./screenContext";
import { suggestionsFor } from "./suggestions";

export const PANEL_TITLE = "Assistente de Dados";

interface PanelProps {
  titleId: string;
  /** Called after a "Ver no painel" link, so a phone shows the page instead of the sheet. */
  onFollowLink: () => void;
  autoFocusInput: boolean;
}

export function AssistantPanel({ titleId, onFollowLink, autoFocusInput }: PanelProps) {
  const { messages, loading, available, context, ask, retry, clear, minimize, close, panel } = useAssistant();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const counterId = useId();
  const contextText = describeContext(context);
  const trimmed = draft.trim();
  const canSend = available && !loading && trimmed.length >= QUESTION_MIN && trimmed.length <= QUESTION_MAX;

  // New message: show it, keeping the conversation's own scroll (the page does not move).
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  useEffect(() => {
    if (panel === "open" && autoFocusInput) inputRef.current?.focus({ preventScroll: true });
  }, [panel, autoFocusInput]);

  // The input grows with the text, up to about four lines.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [draft]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    ask(trimmed);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <header className="flex items-center gap-3 bg-forest px-4 py-3 text-white">
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-forest">
          <Icon name="chat" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold leading-tight">
            {PANEL_TITLE}
          </h2>
          <p className="text-sm leading-snug text-white/85">Pergunte sobre os dados do crédito rural</p>
        </div>
        <button
          type="button"
          onClick={minimize}
          aria-label="Minimizar o Assistente de Dados"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-white"
        >
          <Icon name="minus" />
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Fechar o Assistente de Dados"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus-visible:outline-white"
        >
          <Icon name="close" />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversa com o Assistente de Dados">
        {!available ? (
          <p className="rounded-2xl bg-warning-50 px-4 py-3 text-sm leading-relaxed text-ink">
            O assistente está indisponível neste ambiente. O painel, os mapas e os gráficos continuam funcionando.
          </p>
        ) : messages.length === 0 && !loading ? (
          <div className="rounded-2xl bg-sunken px-4 py-3 text-sm leading-relaxed text-ink">
            <p>Pergunte em português sobre o crédito rural concedido no Brasil de 2013 a 2025.</p>
            <p className="mt-2 text-ink-2">
              As respostas usam as mesmas consultas do painel e trazem o link para conferir cada número.
            </p>
          </div>
        ) : (
          <>
            <Messages messages={messages} loading={loading} onRetry={retry} onFollowLink={onFollowLink} />
            {messages.length > 0 && !loading && (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={clear} className="rounded-full px-3 py-1.5 text-sm font-medium text-forest hover:bg-forest-50">
                  Limpar conversa
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-line bg-surface px-3 pb-3 pt-2.5">
        {contextText && (
          <p className="mb-2 truncate px-1 text-xs text-ink-2" title="O assistente considera o que está na tela quando a pergunta não diz">
            Considerando a tela: {contextText}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`${titleId}-input`}>
            Sua pergunta
          </label>
          <textarea
            ref={inputRef}
            id={`${titleId}-input`}
            rows={1}
            value={draft}
            maxLength={QUESTION_MAX}
            disabled={!available}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Faça uma pergunta sobre os dados…"
            aria-describedby={draft.length > QUESTION_MAX - 100 ? counterId : undefined}
            enterKeyHint="send"
            className="max-h-[120px] min-h-12 flex-1 resize-none rounded-3xl border border-control bg-surface px-4 py-3 text-base leading-snug text-ink placeholder:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest disabled:bg-sunken"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Enviar pergunta"
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-forest text-white shadow-sm hover:bg-forest-hover disabled:bg-forest/40"
          >
            <Icon name="send" size={20} />
          </button>
        </div>
        {draft.length > QUESTION_MAX - 100 && (
          <p id={counterId} className="mt-1 px-1 text-right text-xs text-ink-2">
            {draft.length}/{QUESTION_MAX}
          </p>
        )}
        {available && (
          <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]">
            {suggestionsFor(context.page).map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                disabled={loading}
                onClick={() => ask(suggestion.question)}
                className={cn(
                  "inline-flex min-h-9 shrink-0 items-center rounded-full border border-control bg-surface px-3.5 text-sm text-ink",
                  "hover:border-forest hover:bg-forest-50 disabled:opacity-50",
                )}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
