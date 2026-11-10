/** The conversation: questions, answers with their sources, the waiting and the failures. */
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";

import type { AssistantSource } from "../api/types";
import { Icon } from "../components/ui/Icon";
import { ufName } from "../lib/domain";
import { formatDate } from "../lib/format";
import type { Message } from "./AssistantProvider";

// Amounts and percentages written by the model, set in bold so the key figure stands out.
const FIGURE = /(R\$\s?[\d.,]+(?:\s(?:bilhões|bilhão|milhões|milhão|mil))?|[−-]?\d[\d.]*,?\d*\s?%)/g;

export function emphasize(text: string): ReactNode[] {
  return text.split(FIGURE).map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-semibold text-ink">
        {part}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

/** One link per page of the panel, in the order the answer used them (at most three). */
export function panelLinks(sources: AssistantSource[]): string[] {
  return [...new Set(sources.map((source) => source.panel_path))].slice(0, 3);
}

/** What the link opens, so two links of one answer never read the same. */
export function linkLabel(path: string): string {
  const pathname = path.split("?")[0] ?? "/";
  const state = /^\/estados\/([A-Za-z]{2})$/.exec(pathname);
  if (state) return `Ver ${ufName(state[1] ?? "")} no painel`;
  if (pathname.startsWith("/comparar")) return "Ver no Comparar";
  if (pathname.startsWith("/matopiba")) return "Ver o MATOPIBA no painel";
  if (pathname.startsWith("/dados")) return "Ver em Explorar dados";
  return "Ver na visão geral";
}

export function Avatar() {
  return (
    <span aria-hidden="true" className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-forest text-white">
      <Icon name="chat" size={16} />
    </span>
  );
}

function AssistantAnswer({ message, onFollowLink }: { message: Message; onFollowLink: () => void }) {
  const response = message.response;
  const links = response && !response.out_of_scope ? panelLinks(response.sources) : [];
  return (
    <div className="flex items-start gap-2.5">
      <Avatar />
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-md bg-sunken px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
          <span className="sr-only">Assistente: </span>
          {message.text.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} className="mt-2 first:mt-0 whitespace-pre-line">
              {emphasize(paragraph)}
            </p>
          ))}
          {response?.meta?.collected_at && (
            <p className="mt-2 text-sm text-ink-2">Data da coleta: {formatDate(response.meta.collected_at)}</p>
          )}
          {links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {links.map((path) => (
                <Link
                  key={path}
                  to={path}
                  onClick={onFollowLink}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-control bg-surface px-3.5 text-sm font-medium text-forest hover:bg-forest-50"
                >
                  <Icon name="open" size={16} />
                  {linkLabel(path)}
                  <Icon name="arrow-right" size={16} />
                </Link>
              ))}
            </div>
          )}
        </div>
        {response?.meta?.notice && (
          <p className="mt-2 flex gap-1.5 px-1 text-xs leading-relaxed text-ink-2">
            <Icon name="info" size={14} className="mt-0.5 shrink-0" />
            {response.meta.notice}
          </p>
        )}
      </div>
    </div>
  );
}

function FailedAnswer({ message, onRetry, disabled }: { message: Message; onRetry: () => void; disabled: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Avatar />
      <div role="alert" className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-danger-50 px-4 py-3 text-sm leading-relaxed text-ink">
        <p>{message.error?.text}</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-control bg-surface px-3.5 text-sm font-medium text-forest hover:bg-forest-50 disabled:opacity-50"
        >
          <Icon name="refresh" size={16} />
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export function Waiting() {
  return (
    <div className="flex items-start gap-2.5">
      <Avatar />
      <div className="rounded-2xl rounded-tl-md bg-sunken px-4 py-3 text-sm text-ink-2">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex gap-1" aria-hidden="true">
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="size-1.5 animate-bounce rounded-full bg-forest" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </span>
          Consultando os dados…
        </span>
      </div>
    </div>
  );
}

interface MessagesProps {
  messages: Message[];
  loading: boolean;
  onRetry: (message: Message) => void;
  onFollowLink: () => void;
}

export function Messages({ messages, loading, onRetry, onFollowLink }: MessagesProps) {
  return (
    <ol className="flex flex-col gap-4">
      {messages.map((message) => (
        <li key={message.id}>
          {message.role === "user" ? (
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-forest-100 px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
                <span className="sr-only">Você: </span>
                {message.text}
              </p>
            </div>
          ) : message.error ? (
            <FailedAnswer message={message} onRetry={() => onRetry(message)} disabled={loading} />
          ) : (
            <AssistantAnswer message={message} onFollowLink={onFollowLink} />
          )}
        </li>
      ))}
      {loading && (
        <li>
          <Waiting />
        </li>
      )}
    </ol>
  );
}
