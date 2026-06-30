// src/components/SideDrawer.tsx — Phase 26 slide-in side drawer (Batch 6 revision)

import React, { useEffect } from "react";

/**
 * Props for the reusable slide-in side drawer.
 *
 * - `open` controls visibility. The drawer stays mounted at all times;
 *   visibility is controlled by CSS transforms + opacity so the panel
 *   never unmounts (which keeps its scroll position stable).
 * - `side` picks the anchor edge. The default is `'end'` which respects
 *   writing direction — in LTR the drawer slides in from the right, in RTL
 *   from the left (uses Tailwind's `start-0` / `end-0` utilities).
 * - `title` and `onClose` are required. The drawer owns Escape-key handling
 *   and outside-backdrop click handling so callers don't need to wire them.
 */
export interface SideDrawerProps {
  open: boolean;
  /** Anchor side: 'end' (default, RTL-aware) or 'start' (RTL-aware). */
  side?: 'start' | 'end';
  title: string;
  /** Optional subtitle shown below the title (e.g. item count). */
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Render a sticky header at the top of the drawer. */
  header?: React.ReactNode;
  /** Optional aria-label override for the close button. */
  closeLabel?: string;
}

/**
 * Reusable slide-in side drawer with semi-transparent backdrop. The drawer
 * stays mounted at all times; visibility is controlled purely via CSS
 * transforms + opacity. This avoids mount/unmount flicker, keeps scroll
 * position stable, and side-steps the React-hooks lint rule against
 * setState-in-effect that would otherwise be needed to delay unmount.
 */
const SideDrawer: React.FC<SideDrawerProps> = ({
  open,
  side = 'end',
  title,
  subtitle,
  onClose,
  children,
  header,
  closeLabel,
}) => {
  // Escape-key handler — only attach the listener while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Translate the panel off-screen when closed. `translate-x-0` is the
  // visible state, `start-0` / `end-0` anchors the drawer to the chosen
  // edge (Tailwind respects RTL for `start`/`end`).
  const closedTranslate = side === 'start' ? '-translate-x-full' : 'translate-x-full';
  const anchorClass = side === 'start'
    ? 'md:left-0 md:right-auto'
    : 'md:right-0 md:left-auto';
  const borderClass = side === 'start' ? 'border-e' : 'border-s';
  const sideMargin = side === 'start' ? 'md:mr-auto' : 'md:ml-auto';

  return (
    <div
      className="fixed inset-0 z-[200] pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-hidden={!open}
    >
      {/* Backdrop — click to close. Visible only when open. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        disabled={!open}
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0'}`}
      />
      {/* Drawer panel — transforms off-screen when closed. */}
      <aside
        className={`absolute top-0 bottom-0 ${side === 'start' ? 'start-0' : 'end-0'} ${anchorClass} w-[80vw] sm:w-[85vw] md:w-[280px] max-w-md bg-slate-950 ${borderClass} border-slate-800 shadow-2xl shadow-black/60 flex flex-col transition-transform duration-200 ease-out
          ${open ? 'translate-x-0 pointer-events-auto' : closedTranslate}
          ${sideMargin}
        `}
        dir="auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80 sticky top-0 z-[1]">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-white truncate">{title}</h2>
            {subtitle && (
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel ?? "Close"}
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