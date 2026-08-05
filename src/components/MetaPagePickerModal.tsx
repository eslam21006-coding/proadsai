// src/components/MetaPagePickerModal.tsx
// ═══════════════════════════════════════════════════════════════════════════
// PRO ADS AI — META FACEBOOK PAGE PICKER
// Lightweight modal that lists the user's connected Facebook Pages and lets
// them pick one (or skip). Mirrors MetaAccountPickerModal's structure and
// accessibility patterns. Mounted in two flows:
//   1. Automatically after the ad-account picker on a fresh OAuth connect.
//   2. On demand from the "Change Page" menu entry.
//
// The selected pageId is written back through the parent via onSelect; the
// parent is responsible for `metaService.selectPage`. This component stays
// free of network/IO concerns.
//
// Skip behaviour: the "Skip" footer button calls onSkip() so the user can
// decline without picking. Page selection is optional for the current
// image-upload push flow — required only when we wire /adcreatives.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";
import { useT } from "../i18n";

export interface MetaPagePickerItem {
  id: string;
  name: string;
}

export interface MetaPagePickerModalProps {
  open: boolean;
  pages: MetaPagePickerItem[];
  currentSelectedId: string | null;
  selecting: boolean;
  errorMessage?: string | null;
  isDarkMode?: boolean;
  onSelect: (pageId: string | null, pageName: string | null) => void | Promise<void>;
  onSkip: () => void;
  onClose: () => void;
}

export default function MetaPagePickerModal({
  open,
  pages,
  currentSelectedId,
  selecting,
  errorMessage,
  isDarkMode = true,
  onSelect,
  onSkip,
  onClose,
}: MetaPagePickerModalProps) {
  const { t } = useT();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const selectingRef = useRef(selecting);
  const onCloseRef = useRef(onClose);
  useEffect(() => { selectingRef.current = selecting; }, [selecting]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    function focusableElements(): HTMLElement[] {
      if (!dialog) return [];
      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!selectingRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusableElements();
      const active = document.activeElement as HTMLElement | null;
      if (items.length === 0 || !dialog?.contains(active)) {
        e.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey) {
        if (active === first) { e.preventDefault(); last.focus(); }
      } else {
        if (active === last) { e.preventDefault(); first.focus(); }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocusedRef.current?.focus?.();
      previouslyFocusedRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  const dk = isDarkMode;
  const shell = dk ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-2xl';
  const headerGradient = dk ? 'bg-gradient-to-b from-indigo-900/20 to-transparent border-slate-800' : 'bg-gradient-to-b from-indigo-50 to-transparent border-slate-200';
  const subtitleText = dk ? 'text-slate-400' : 'text-slate-500';
  const closeBtn = dk ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900';
  const cardBase = dk ? 'border-slate-800 bg-slate-900/40 hover:border-indigo-500/30 hover:bg-slate-900/70' : 'border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/60';
  const cardActive = dk ? 'border-indigo-500/60 bg-indigo-500/15' : 'border-indigo-500 bg-indigo-50';
  const cardIcon = dk ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500';
  const cardIconActive = dk ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700';
  const cardTitle = dk ? 'text-white' : 'text-slate-900';
  const cardIdText = dk ? 'text-slate-500' : 'text-slate-400';
  const cardPill = dk ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700';
  const cardActivePill = dk ? 'text-indigo-300' : 'text-indigo-700';
  const footerBorder = dk ? 'border-slate-800' : 'border-slate-200';
  const footerBtn = dk ? 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200';
  const footerPrimary = dk ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white';
  const bodyEmpty = dk ? 'text-slate-400' : 'text-slate-500';
  const errorBox = dk
    ? 'bg-red-500/10 border-red-500/20 text-red-400'
    : 'bg-red-50 border-red-200 text-red-700';

  return (
    <div className="fixed inset-0 z-[211] flex items-center justify-center p-4" onClick={selecting ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meta-page-picker-title"
        tabIndex={-1}
        className={`relative ${shell} border rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden focus:outline-none`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`${headerGradient} p-6 pb-4 border-b`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="meta-page-picker-title" className={`text-lg font-black ${dk ? 'text-white' : 'text-slate-900'}`}>
                <i className="fa-brands fa-facebook text-indigo-500 me-2" />
                {t('meta.page_picker_title')}
              </h2>
              <p className={`mt-1 text-[10px] ${subtitleText}`}>{t('meta.page_picker_subtitle')}</p>
            </div>
            <button type="button" onClick={onClose} disabled={selecting} aria-label={t('common.close')} className={`shrink-0 ${closeBtn} transition-all disabled:opacity-40 disabled:cursor-not-allowed`}>
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {pages.length === 0 ? (
            <p className={`text-[11px] ${bodyEmpty} text-center py-8`}>{t('meta.page_picker_empty')}</p>
          ) : (
            <ul className="space-y-2" aria-label={t('meta.page_picker_title')}>
              {pages.map(p => {
                const isCurrent = p.id === currentSelectedId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={selecting}
                      onClick={() => {
                        if (isCurrent) {
                          onClose();
                          return;
                        }
                        Promise.resolve(onSelect(p.id, p.name)).catch((err) => {
                          console.warn('Failed to select Meta page:', err);
                        });
                      }}
                      className={`w-full text-start px-4 py-3 rounded-xl border transition-all flex items-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed ${
                        isCurrent ? cardActive : cardBase
                      }`}
                      aria-pressed={isCurrent}
                    >
                      <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${isCurrent ? cardIconActive : cardIcon}`}>
                        {isCurrent ? (
                          <i className="fa-solid fa-circle-check text-sm" aria-hidden="true" />
                        ) : (
                          <i className="fa-solid fa-flag text-sm" aria-hidden="true" />
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[12px] font-bold ${cardTitle} truncate`}>{p.name || p.id}</span>
                        <span className={`block text-[9px] ${cardIdText} font-mono truncate`} dir="ltr">{p.id}</span>
                      </span>
                      {isCurrent ? (
                        <span className={`shrink-0 flex items-center gap-1 text-[9px] font-bold ${cardActivePill}`}>
                          <i className="fa-solid fa-circle-check text-xs" aria-hidden="true" />
                          {t('meta.picker_current')}
                        </span>
                      ) : (
                        <span className={`shrink-0 px-2 py-1 rounded-md ${cardPill} text-[9px] font-bold`}>{t('meta.picker_select')}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {errorMessage && (
            <div role="alert" className={`px-3 py-2 rounded-lg border ${errorBox} text-[10px]`}>
              {errorMessage}
            </div>
          )}
        </div>

        <div className={`px-6 py-4 border-t ${footerBorder} flex items-center justify-end gap-2`}>
          <button
            type="button"
            onClick={onSkip}
            disabled={selecting}
            className={`h-9 px-4 rounded-xl ${footerBtn} text-[10px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {t('meta.page_picker_skip')}
          </button>
          {currentSelectedId ? (
            <button
              type="button"
              onClick={onClose}
              disabled={selecting}
              className={`h-9 px-4 rounded-xl ${footerPrimary} text-[10px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {t('meta.page_picker_done')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
