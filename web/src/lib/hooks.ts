import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Tailwind's lg breakpoint (1024 px): desktop navigation and the floating assistant panel. */
export const DESKTOP_QUERY = "(min-width: 64rem)";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * While active: focus moves into the container, Tab cycles inside it, Escape calls onEscape,
 * and on release focus returns to the element that opened it.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  // The latest callback, without restarting the trap (and moving focus) on every render.
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("[hidden]"));
    const initial = container.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? container;
    initial.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && escapeRef.current) {
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [ref, active]);
}

/** Stops the page behind a sheet from scrolling, without moving it (the scroll position stays). */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [active]);
}

export interface ViewportBox {
  /** Height of the part of the page the visitor sees (smaller while the keyboard is open). */
  height: number;
  /** Distance between the bottom of what is visible and the bottom of the layout viewport. */
  bottomInset: number;
}

function readViewport(): ViewportBox {
  const viewport = window.visualViewport;
  if (!viewport) return { height: window.innerHeight, bottomInset: 0 };
  const bottomInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  return { height: viewport.height, bottomInset };
}

/**
 * The visual viewport, which shrinks when the on-screen keyboard opens. Safari on iOS does
 * not resize the page for the keyboard, so a bottom sheet uses bottomInset to stay above it.
 */
export function useVisualViewport(active: boolean): ViewportBox {
  const [box, setBox] = useState<ViewportBox>(() =>
    typeof window === "undefined" ? { height: 0, bottomInset: 0 } : readViewport(),
  );
  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    const update = () => setBox(readViewport());
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active]);
  return box;
}

/** True once `busy` has stayed true for `delay` ms (to tell a cold start from a quick load). */
export function useDelayedFlag(busy: boolean, delay: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!busy) {
      setLate(false);
      return;
    }
    const timer = window.setTimeout(() => setLate(true), delay);
    return () => window.clearTimeout(timer);
  }, [busy, delay]);
  return late;
}
