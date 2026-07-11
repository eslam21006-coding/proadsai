// src/components/MetaAccountPickerModal.tsx
// ═══════════════════════════════════════════════════════════════════════════
// PRO ADS AI — META AD ACCOUNT PICKER
// Lightweight modal that lists the user's connected Meta ad accounts and
// lets them pick one (or change the current selection). Mounted in two
// flows:
//   1. Automatically after a successful Meta OAuth connection, when the
//      user has 2+ accounts (1-account case auto-selects).
//   2. On demand from the menu entry "Change Account" / "تغيير الحساب".
//
// The selected accountId is written back through the parent via onSelect;
// the parent is responsible for both `metaService.selectAccount` (global
// connection) and `workspaceService.linkMetaAccountToWorkspace` (workspace
// link) — keeping this component free of network/IO concerns.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect } from "react";
import { useT } from "../i18n";

export interface MetaAccountPickerItem {
  id: string;
  name: string;
}

export interface MetaAccountPickerModalProps {
  open: boolean;
  accounts: MetaAccountPickerItem[];
  /** Currently selected accountId (from the global connection, NOT the workspace). */
  currentSelectedId: string | null;
  /** Set true while a select is in flight to disable the cards. */
  selecting: boolean;
  /** Optional inline error string to surface (parent passes localized text). */
  errorMessage?: string | null;
  onSelect: (accountId: string) => void | Promise<void>;
  onClose: () => void;
}

export default function MetaAccountPickerModal({
  open,
  accounts,
  currentSelectedId,
  selecting,
  errorMessage,
  onSelect,
  onClose,
}: MetaAccountPickerModalProps) {
  const { t } = useT();

  // Close on Escape — standard modal affordance, only while not selecting.
  useEffect(() => {
    if (!open || selecting) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, selecting, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4"
      onClick={selecting ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="meta-account-picker-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-b from-blue-900/20 to-transparent p-6 pb-4 border-b border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="meta-account-picker-title"
                className="text-lg font-black text-white"
              >
                <i className="fa-brands fa-meta text-blue-400 mr-2" />
                {t('meta.picker_title')}
              </h2>
              <p className="mt-1 text-[10px] text-slate-400">
                {t('meta.picker_subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={selecting}
              aria-label={t('common.close')}
              className="shrink-0 text-slate-500 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {accounts.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-8">
              {t('workspace.settings.meta_connect_prompt')}
            </p>
          ) : (
            <ul className="space-y-2" role="listbox" aria-label={t('meta.picker_title')}>
              {accounts.map(acc => {
                const isCurrent = acc.id === currentSelectedId;
                return (
                  <li key={acc.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      disabled={selecting}
                      onClick={() => {
                        if (isCurrent) {
                          // Re-selecting the current account is a no-op —
                          // but still dismiss the picker so the user isn't
                          // stranded in the modal.
                          onClose();
                          return;
                        }
                        void onSelect(acc.id);
                      }}
                      className={`w-full text-start px-4 py-3 rounded-xl border transition-all flex items-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed ${
                        isCurrent
                          ? 'border-blue-500/40 bg-blue-500/10'
                          : 'border-slate-800 bg-slate-900/40 hover:border-blue-500/30 hover:bg-slate-900/70'
                      }`}
                    >
                      <span
                        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                          isCurrent ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <i className="fa-solid fa-rectangle-ad text-sm" aria-hidden="true" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-bold text-white truncate">
                          {acc.name || acc.id}
                        </span>
                        <span className="block text-[9px] text-slate-500 font-mono truncate" dir="ltr">
                          {acc.id}
                        </span>
                      </span>
                      {isCurrent ? (
                        <span className="shrink-0 flex items-center gap-1 text-[9px] font-bold text-blue-300">
                          <i className="fa-solid fa-circle-check text-xs" aria-hidden="true" />
                          {t('meta.picker_current')}
                        </span>
                      ) : (
                        <span className="shrink-0 px-2 py-1 rounded-md bg-slate-800 text-slate-300 text-[9px] font-bold">
                          {t('meta.picker_select')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px]"
            >
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={selecting}
            className="h-9 px-4 rounded-xl bg-white/[0.04] text-slate-300 text-[10px] font-bold hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('meta.picker_cancelling')}
          </button>
        </div>
      </div>
    </div>
  );
}
