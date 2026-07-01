// src/components/SideDrawer.tsx — Phase 26 slide-in side panel
// Batch 6 Revision 3: a persistent side panel with optional backdrop.
//   - `backdrop={true}` (default) — modal overlay (translucent scrim, blur off).
//   - `backdrop={false}` — PERSISTENT sidebar; the panel is fixed at the chosen
//     edge and the main content remains fully visible + interactive. No scrim.

import React, { useEffect, useRef } from "react";

export interface SideDrawerProps {
  open: boolean;
  /** Anchor side: 'end' (default, RTL-aware) or 'start' (RTL-aware). */
  side?: 'start' | 'end';
  title: string;
  /** Optional subtitle shown below the title (e.g. item count). */
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Show a semi-transparent full-screen scrim behind the panel. Default `true`
   * (modal). Pass `false` for a persistent sidebar that the user can leave
   * open while still interacting with the page behind it.
   */
  backdrop?: boolean;
  /** Render a sticky header at the top of the drawer (under the title bar). */
  header?: React.ReactNode;
  /** Required localized aria-label for both the backdrop and the close button. */
  closeLabel: string;
  /** Optional className applied to the panel's <aside> element. */
  panelClassName?: string;
  /** Optional z-index override; default is 55 (below the top nav at z-60). */
  zIndex?: number;
}

/**
 * Reusable slide-in side panel. By default it acts as a modal drawer with a
 * semi-transparent backdrop; pass `backdrop={false}` to render it as a
 * persistent sidebar that sits on the right (or left in RTL) edge of the
 * viewport without dimming the rest of the app.
 */
const SideDrawer: React.FC<SideDrawerProps> = ({
  open,
  side = 'end',
  title,
  subtitle,
  onClose,
  children,
  backdrop = true,
  header,
  closeLabel,
  panelClassName,
  zIndex,
}) => {
  // Escape-key handler + focus management for modal mode only.
  // Focus trap and restore only kick in when backdrop is enabled (modal). For
  // persistent sidebars (backdrop={false}) the page is meant to stay
  // interactive, so we leave focus alone.
  const panelRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // Keep the latest onClose in a ref so the focus effect doesn't re-run on
  // every parent re-render (which would churn the keydown listener and steal
  // focus while the panel is animating in).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !backdrop) return;

    // Remember the element that had focus when the dialog opened, so we can
    // restore it on close.
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;

    // Move initial focus to the close button so keyboard users land inside
    // the dialog immediately. Use a microtask to give the panel time to
    // mount + animate in.
    const focusTimer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 0);

    // Basic focus trap: keep Tab cycling inside the panel.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      // Restore focus to the trigger on close.
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [open, backdrop]);

  // Translate the panel off-screen when closed. `translate-x-0` is the
  // visible state, `start-0` / `end-0` anchors the drawer to the chosen
  // edge (Tailwind respects RTL for `start`/`end`).
  const closedTranslate = side === 'start' ? '-translate-x-full' : 'translate-x-full';
  const anchorClass = side === 'start'
    ? 'md:left-0 md:right-auto'
    : 'md:right-0 md:left-auto';
  const borderClass = side === 'start' ? 'border-e' : 'border-s';
  const sideMargin = side === 'start' ? 'md:mr-auto' : 'md:ml-auto';

  // Backdrop only renders when `backdrop` is true. For persistent
  // sidebars, the panel sits directly on top of the page at its anchor
  // edge with no full-screen scrim.
  const containerZ = zIndex ?? (backdrop ? 200 : 55);

  return (
    <div
      className={`fixed inset-0 pointer-events-none`}
      style={{ zIndex: containerZ }}
      role="dialog"
      aria-modal={backdrop ? 'true' : 'false'}
      aria-label={title}
      aria-hidden={!open}
    >
      {backdrop && (
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          disabled={!open}
          tabIndex={open ? 0 : -1}
          className={`absolute inset-0 bg-slate-950/70 transition-opacity duration-200 ${
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0'
          }`}
        />
      )}
      <aside
        ref={panelRef}
        // `inert` on a closed dialog removes every descendant from the tab
        // order and hides them from AT, complementing the outer `aria-hidden`
        // we set on the wrapper. Modern browsers all support `inert` natively.
        {...(!open ? { inert: '' as unknown as boolean } : {})}
        className={`absolute top-0 bottom-0 ${side === 'start' ? 'start-0' : 'end-0'} ${anchorClass} w-[80vw] sm:w-[85vw] md:w-[280px] max-w-md bg-slate-950 ${borderClass} border-slate-800 shadow-2xl shadow-black/60 flex flex-col transition-transform duration-200 ease-out
          ${open ? 'translate-x-0 pointer-events-auto' : closedTranslate}
          ${sideMargin}
          ${panelClassName ?? ''}
        `}
        dir="auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950 sticky top-0 z-[1]">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-white truncate">{title}</h2>
            {subtitle && (
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            data-sidedrawer-close
            ref={closeBtnRef}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
        {header && (
          <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/40 sticky top-[57px] z-[1]">
            {header}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </aside>
    </div>
  );
};

export default SideDrawer;
