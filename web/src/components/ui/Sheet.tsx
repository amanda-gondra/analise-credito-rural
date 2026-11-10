/**
 * Modal sheet: from the right (menu) or from the bottom (filters on a phone). Focus stays
 * inside while open, Escape and the backdrop close it, and focus returns to the opener.
 */
import { type ReactNode, useId, useRef } from "react";

import { cn } from "../../lib/cn";
import { useBodyScrollLock, useFocusTrap } from "../../lib/hooks";
import { Icon } from "./Icon";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "right" | "bottom";
  children: ReactNode;
  footer?: ReactNode;
}

export function Sheet({ open, onClose, title, side = "bottom", children, footer }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open, onClose);
  useBodyScrollLock(open);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "absolute flex flex-col bg-surface shadow-panel outline-none",
          side === "right"
            ? "inset-y-0 right-0 w-[min(22rem,88vw)] pt-[env(safe-area-inset-top)]"
            : "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-sunken"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
