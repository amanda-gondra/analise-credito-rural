/**
 * Where the assistant lives on screen.
 *
 * - The button is fixed at the lower right on every page, above the safe area of phones with
 *   a home indicator. On a computer it shows the name; on a phone it is a 56 px circle with
 *   the same name as its accessible label. Pages keep a free strip at the bottom (pb-fab),
 *   so the button never covers content.
 * - Computer: a floating panel of controlled size, not modal: the page stays usable.
 *   Minimized, it becomes a bar with the name, and the conversation stays.
 * - Phone: a bottom sheet, modal, that follows the visual viewport, so the input stays right
 *   above the keyboard (Safari on iOS does not resize the page for the keyboard).
 *
 * The panel stays mounted once opened, hidden when closed: history, the conversation's
 * scroll and a half-written question survive closing, minimizing and navigating.
 */
import { type RefObject, useEffect, useId, useRef, useState } from "react";

import { Icon } from "../components/ui/Icon";
import { cn } from "../lib/cn";
import { DESKTOP_QUERY, useBodyScrollLock, useFocusTrap, useMediaQuery, useVisualViewport } from "../lib/hooks";
import { useAssistant } from "./AssistantProvider";
import { AssistantPanel, PANEL_TITLE } from "./AssistantPanel";

type ButtonRef = RefObject<HTMLButtonElement | null>;

function LaunchButton({ desktop, buttonRef }: { desktop: boolean; buttonRef: ButtonRef }) {
  const { open, panel, messages } = useAssistant();
  const ongoing = panel === "minimized" && messages.length > 0;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={open}
      aria-label={desktop ? undefined : `Abrir o ${PANEL_TITLE}`}
      aria-haspopup="dialog"
      className={cn(
        "fixed z-40 inline-flex items-center justify-center gap-2 rounded-full bg-forest text-white shadow-fab transition-colors hover:bg-forest-hover active:bg-forest-active",
        "right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))]",
        desktop ? "h-12 px-5 text-sm font-semibold" : "size-14",
      )}
    >
      <Icon name="chat" size={desktop ? 22 : 26} />
      {desktop && PANEL_TITLE}
      {ongoing && (
        <span className="absolute right-0.5 top-0.5 size-3 rounded-full bg-leaf ring-2 ring-white">
          <span className="sr-only"> (conversa em andamento)</span>
        </span>
      )}
    </button>
  );
}

function MinimizedBar({ buttonRef }: { buttonRef: ButtonRef }) {
  const { open, close } = useAssistant();
  return (
    <div className="fixed bottom-6 right-6 z-40 flex items-center gap-1 rounded-full bg-forest py-1.5 pl-2 pr-1.5 text-white shadow-fab">
      <button
        ref={buttonRef}
        type="button"
        onClick={open}
        className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-white/10"
      >
        <Icon name="chat" size={20} />
        {PANEL_TITLE}
        <span className="sr-only">: restaurar a conversa</span>
      </button>
      <button
        type="button"
        onClick={close}
        aria-label={`Fechar o ${PANEL_TITLE}`}
        className="inline-flex size-10 items-center justify-center rounded-full hover:bg-white/10"
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

function DesktopPanel({ titleId }: { titleId: string }) {
  const { panel, close } = useAssistant();
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-assistant-panel=""
      hidden={panel !== "open"}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
      className="fixed bottom-6 right-6 z-40 h-[min(40rem,calc(100dvh-7rem))] w-[27rem] overflow-hidden rounded-2xl border border-line shadow-panel"
    >
      <AssistantPanel titleId={titleId} onFollowLink={() => undefined} autoFocusInput />
    </div>
  );
}

function MobileSheet({ titleId }: { titleId: string }) {
  const { panel, close, minimize } = useAssistant();
  const open = panel === "open";
  const ref = useRef<HTMLDivElement>(null);
  const viewport = useVisualViewport(open);
  useFocusTrap(ref, open, close);
  useBodyScrollLock(open);

  const keyboardOpen = viewport.bottomInset > 80 || viewport.height < window.innerHeight * 0.7;
  const height = keyboardOpen ? viewport.height - 8 : Math.min(viewport.height * 0.88, 760);

  return (
    <div hidden={!open} data-assistant-panel="" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40" onClick={close} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ height, bottom: viewport.bottomInset }}
        className="absolute inset-x-0 flex flex-col overflow-hidden rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-panel outline-none"
      >
        <AssistantPanel titleId={titleId} onFollowLink={minimize} autoFocusInput={false} />
      </div>
    </div>
  );
}

export function AssistantDock() {
  const { panel } = useAssistant();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const titleId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // Mount the panel the first time it opens, then keep it (history and scroll survive).
  const [mounted, setMounted] = useState(false);
  if (panel === "open" && !mounted) setMounted(true);

  // When the panel closes or minimizes, focus goes back to the button that reopens it,
  // unless the visitor already moved it somewhere else (a "Ver no painel" link).
  useEffect(() => {
    if (wasOpen.current && panel !== "open") {
      const active = document.activeElement;
      const lost = !active || active === document.body || active.closest("[data-assistant-panel]") !== null;
      if (lost) buttonRef.current?.focus({ preventScroll: true });
    }
    wasOpen.current = panel === "open";
  }, [panel]);

  return (
    <>
      {mounted && (desktop ? <DesktopPanel titleId={titleId} /> : <MobileSheet titleId={titleId} />)}
      {panel === "minimized" && desktop ? (
        <MinimizedBar buttonRef={buttonRef} />
      ) : (
        panel !== "open" && <LaunchButton desktop={desktop} buttonRef={buttonRef} />
      )}
    </>
  );
}
