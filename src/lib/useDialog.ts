'use client';

import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog behaviour for an overlay element:
 *  - moves focus into the dialog when it opens and back to the trigger when it closes
 *  - keeps Tab / Shift+Tab inside the dialog
 *  - Escape calls `onClose` (only for the top-most open dialog)
 *
 * Returns a stable callback ref; spread it with the ARIA attributes:
 *   const ref = useDialog(() => setOpen(false));
 *   {open && <div ref={ref} role="dialog" aria-modal="true" aria-label="…">…</div>}
 *
 * Pass `null` as onClose for dialogs that must be answered explicitly.
 */
export function useDialog(onClose: (() => void) | null) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  return useCallback((node: HTMLElement | null) => {
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);

    // Prefer an element marked autofocus, then the first focusable, then the dialog itself.
    const initial = node.querySelector<HTMLElement>('[autofocus], [data-autofocus]') ?? focusables()[0];
    if (initial) initial.focus();
    else {
      node.tabIndex = -1;
      node.focus();
    }

    const isTopmost = () => {
      const open = document.querySelectorAll('[aria-modal="true"]');
      return open[open.length - 1] === node;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (e.key === 'Escape' && !e.defaultPrevented && onCloseRef.current) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, []);
}
