/** Notices and the loading, error and empty states shared by every widget. */
import type { ReactNode } from "react";

import { describeError } from "../../api/client";
import { cn } from "../../lib/cn";
import { Button } from "./controls";
import { Icon } from "./Icon";

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning"; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed",
        tone === "info" ? "bg-petroleum-50 text-ink" : "bg-warning-50 text-ink",
        className,
      )}
    >
      <Icon
        name={tone === "info" ? "info" : "alert"}
        size={18}
        className={cn("mt-0.5 shrink-0", tone === "info" ? "text-petroleum" : "text-warning")}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Gray blocks with the shape of the content, announced once to screen readers. */
export function Skeleton({ className, label = "Carregando dados" }: { className?: string; label?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("animate-pulse rounded-xl bg-sunken", className)}>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-3 rounded-xl bg-danger-50 p-4 text-sm text-ink", className)}>
      <p className="flex gap-2">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-danger" />
        <span>{describeError(error)}</span>
      </p>
      {onRetry && (
        <Button icon="refresh" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("rounded-xl bg-sunken p-4 text-sm text-ink-2", className)}>{children}</p>;
}

interface QueryLike<T> {
  data: T | undefined;
  error: unknown;
  isPending: boolean;
  isFetching?: boolean;
  isPlaceholderData?: boolean;
  refetch: () => unknown;
}

/**
 * Renders the states of one request: skeleton while the first answer comes, the error with a
 * retry button, and the content otherwise. While new filters load, the previous numbers stay
 * on screen, slightly faded, instead of disappearing.
 */
export function QueryView<T>({
  query,
  skeleton = "h-64",
  children,
}: {
  query: QueryLike<T>;
  skeleton?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <Skeleton className={skeleton} />;
  if (query.error && query.data === undefined) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return null;
  return (
    <div
      aria-busy={query.isFetching ? true : undefined}
      className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}
    >
      {children(query.data)}
    </div>
  );
}
