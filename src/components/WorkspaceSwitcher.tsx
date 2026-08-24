// WorkspaceSwitcher.tsx — Dropdown for switching between brand workspaces (Scaling plan only)
import React, { useState, useRef, useEffect } from 'react';
import type { Workspace } from '../types';
import { useT } from '../i18n';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSwitch: (id: string) => void;
  onCreateNew: () => void;
  onEditWorkspace: (ws: Workspace) => void;
  isTeamMember?: boolean;
  // ISSUE-D (T014): the new account has no workspace yet vs. the list
  // could not be loaded right now. The switcher surfaces one of the two
  // plain-language messages in the dropdown. `onRetryLoad` is invoked by
  // the user from inside the U5 message; without it the panel would be
  // a dead end.
  loadError?: boolean;
  onRetryLoad?: () => void;
  hasInProgressWork?: boolean;
  switchGuardTarget?: string | null;
  onSwitchGuardCancel?: () => void;
  onSwitchGuardDiscard?: (targetId: string) => void;
  // May be async: the parent flushes the pending auto-save before the switch
  // is allowed to proceed, and `handleGuardSave` awaits it.
  onSwitchGuardSave?: (targetId: string) => void | Promise<void>;
  // Theme flag, same contract as MetaAccountPickerModal / MetaPagePickerModal
  // (optional, defaults to dark) so the switch guard renders with the same
  // light/dark palette as the rest of the modal vocabulary.
  isDarkMode?: boolean;
}

export default function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSwitch,
  onCreateNew,
  onEditWorkspace,
  isTeamMember,
  loadError,
  onRetryLoad,
  hasInProgressWork,
  switchGuardTarget,
  onSwitchGuardCancel,
  onSwitchGuardDiscard,
  onSwitchGuardSave,
  isDarkMode = true,
}: WorkspaceSwitcherProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  // True while the parent's save-before-switch flush is in flight. The guard
  // buttons are disabled for the duration so a second click cannot switch the
  // workspace out from under an in-progress save.
  const [guardSaving, setGuardSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Round-11 (CodeRabbit re-review): focus target for the guard dialog.
  // The wrapper isn't focusable (it's a plain <div>), so the
  // onKeyDown handler bound to the wrapper only fires when focus is
  // already inside it. For the externally-triggered path
  // (switchGuardTarget effect opens the guard from outside, no prior
  // focus inside) Escape was unreachable and the backdrop click was
  // the only dismissal. The useEffect below moves focus into the
  // dialog on open and binds Escape at the document level while the
  // guard is active.
  const guardDialogRef = useRef<HTMLDivElement>(null);
  // Round-12 (CodeRabbit re-review): hoist handleGuardCancel above the
  // Escape-key useEffect so the document-level keydown listener captures
  // the current cancellation logic. The previous declaration lived
  // after the effect, so the listener held the stale closure from the
  // render in which the guard opened — a later onSwitchGuardCancel
  // prop identity change would not be picked up. useCallback
  // memoizes the handler so the effect's dependency array is stable.
  const handleGuardCancel = React.useCallback(() => {
    onSwitchGuardCancel?.();
    setGuardOpen(false);
    setPendingTarget(null);
  }, [onSwitchGuardCancel]);

  // Round-18 (CodeRabbit re-review): the previous code mirrored
  // `switchGuardTarget` (the externally-triggered target) into
  // `pendingTarget` (the manual-switch target) via a useEffect, which
  // had two problems:
  //   1. The synchronous setState in the effect triggered
  //      `react-hooks/set-state-in-effect` (an extra render pass on every
  //      externally-triggered guard open).
  //   2. The mirror overwrote an in-flight *manual* guard's
  //      `pendingTarget` if the parent raised a forced switch at the same
  //      time — the user's manual selection would silently be lost.
  // The fix is to keep `pendingTarget` for the manual path only, and
  // derive the effective target as `switchGuardTarget ?? pendingTarget`.
  // The external path always takes precedence while it is set; the
  // manual path is preserved when no external target is active.
  const effectiveGuardTarget = switchGuardTarget ?? pendingTarget;
  // Round-19 (CodeRabbit re-review): the externally-triggered branch is
  // closed by the explicit `guardOpen = guardOpen || !!switchGuardTarget`
  // plus the Save / Discard handlers setting `guardOpen` to false when
  // they fire. The previous `React.useEffect` block at this site was an
  // external-target cleanup attempt that was unreachable — both Save
  // and Discard were keying off `pendingTarget`, so they never fired
  // for the externally-triggered path, and `guardOpen` stayed true. The
  // Save/Discard handlers now use `effectiveGuardTarget` and reset
  // `guardOpen` to false themselves, so the leftover effect is dead
  // code. Removed.
  const guardIsOpen = guardOpen || !!switchGuardTarget;

  // Round-11: focus the dialog on open and bind Escape at the document
  // level while the guard is active. The wrapper is a plain <div>
  // (not focusable by default); tabIndex={-1} on the inner panel lets
  // .focus() land inside without entering the tab order. The
  // document-level keydown handler runs regardless of where focus is.
  //
  // Round-20 (CodeRabbit re-review): key off guardIsOpen (which fires for
  // both the internal pendingTarget path and the externally-triggered
  // switchGuardTarget path) rather than guardOpen alone. Without this
  // change the externally-triggered path — where the parent sets
  // switchGuardTarget but never updates guardOpen until Save/Discard run
  // — would never receive focus or an Escape listener.
  useEffect(() => {
    if (!guardIsOpen) return;
    guardDialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guardSaving) handleGuardCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [guardIsOpen, guardSaving, handleGuardCancel]);

  const activeWorkspaces = workspaces.filter(ws => ws.deletedAt == null);

  // ISSUE-D: under the all-access contract (FR-004), a verified team
  // member sees every active workspace of the owner. The previous
  // per-workspace allowlist filter is retired; the visible list equals
  // the active list. (If a future restriction feature reintroduces
  // per-member filtering, the call site in App.tsx will pass
  // `workspaceAccess` again and this component will need to accept it.)
  const visibleWorkspaces = activeWorkspaces;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSwitch = (id: string) => {
    if (hasInProgressWork && id !== activeWorkspaceId) {
      setPendingTarget(id);
      setGuardOpen(true);
      return;
    }
    onSwitch(id);
    setOpen(false);
  };

  // Round-19 (CodeRabbit re-review): both handlers must key off the
  // effective guard target, not pendingTarget. The externally-triggered
  // path (owner-deleted-workspace) only ever sets `switchGuardTarget`,
  // leaving `pendingTarget` null. The previous handlers read `pendingTarget`
  // and short-circuited on the externally-triggered path — Save / Discard
  // silently no-op'd while the dialog stayed open. Using
  // `effectiveGuardTarget` (switchGuardTarget ?? pendingTarget) is the
  // single source of truth for both trigger paths.
  const handleGuardDiscard = () => {
    const target = effectiveGuardTarget;
    if (target) {
      onSwitchGuardDiscard?.(target);
      // Round-2 #3/#6: in the externally-triggered path (parent already
      // called onSwitch while opening this dialog), target IS the current
      // active id and a second onSwitch is a no-op. Skip the call when
      // the parent has already moved the active pointer — that keeps this
      // idempotent across both trigger paths.
      if (target !== activeWorkspaceId) onSwitch(target);
    }
    setGuardOpen(false);
    setPendingTarget(null);
    setOpen(false);
  };

  // CodeRabbit round 4 (Critical): `onSwitchGuardSave` persists the in-flight
  // project, and it MUST complete before `onSwitch` advances the active
  // workspace. The auto-save snapshot is tagged from the active workspace id,
  // so switching first attributes the member's work to the destination
  // workspace instead of the one they were working in. Awaiting the handler is
  // what keeps "Save & Switch" honest — it saves, then switches.
  //
  // Round-5 (CodeRabbit re-review): if the parent's save handler rejects,
  // we must NOT proceed to onSwitch — otherwise the work would be silently
  // mis-attributed (the source workspace is still active but the failure
  // means the queued snapshot never landed). Catching the rejection here
  // keeps the guard open, leaves `pendingTarget` set so the switcher
  // reopens with the same target on the next render, and surfaces the
  // parent's already-shown toast. The user picks Save again or Cancel.
  //
  // Round-7 (CodeRabbit re-review): the upstream `forceFlush` now returns
  // an explicit `{ ok, error }` so the parent can also throw on the
  // no-throw failure path (doSave was previously catching internally and
  // resolving normally). Our catch still handles both shapes.
  //
  // Round-19: use effectiveGuardTarget (not pendingTarget) so the
  // externally-triggered path is wired up correctly. See note on
  // handleGuardDiscard.
  const handleGuardSave = async () => {
    const target = effectiveGuardTarget;
    if (!target) return;
    setGuardSaving(true);
    let saveOk = true;
    try {
      await onSwitchGuardSave?.(target);
    } catch {
      saveOk = false;
    } finally {
      setGuardSaving(false);
    }
    if (!saveOk) {
      // Keep the dialog open so the member can Save again (after fixing
      // any local IndexedDB / network issue) or Cancel. The parent has
      // already cleared pendingWorkspaceSwitch? No — the parent's catch
      // re-throws before the clear, so pendingWorkspaceSwitch stays set.
      return;
    }
    if (target !== activeWorkspaceId) onSwitch(target);
    setGuardOpen(false);
    setPendingTarget(null);
    setOpen(false);
  };

  // ISSUE-D T014: replace the old "no_access" branch (which sent the
  // member to the owner to ask for access — FR-019a forbids that) with
  // two distinct states. U3: the account legitimately has no workspace
  // yet. U5: the list failed to load and a manual retry is offered.
  const isEmpty = visibleWorkspaces.length === 0;
  const showLoadError = isEmpty && !!loadError;
  const showNoWorkspaces = isEmpty && !loadError;
  const active = visibleWorkspaces.find(w => w.id === activeWorkspaceId) || visibleWorkspaces.find(w => w.isDefault);
  // T014 also fixes the collapsed-button label. The previous default
  // was `workspace.switcher.default_name` ("Default Workspace") which
  // would name a workspace that does not exist when the list is empty.
  // Now: if the list is empty, the label is the appropriate message;
  // otherwise it is the active workspace name.
  const displayName = showLoadError
    ? t('workspace.error.load_failed_short')
    : showNoWorkspaces
      ? t('workspace.error.no_workspaces_short')
      : (active?.name || t('workspace.switcher.default_name'));
  const brandColor = active?.brandColorPrimary || '#3b82f6';

  // ─── Modal palette ──────────────────────────────────────────────────
  // Token values copied verbatim from MetaAccountPickerModal so the guard
  // cannot drift from the shared modal design system. The guard previously
  // hard-coded the dark palette (bg-slate-950 / text-white / text-slate-400),
  // which rendered as a black panel in light mode while every other modal
  // switched to white.
  const dk = isDarkMode;
  const shell = dk ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-2xl';
  const headerGradient = dk ? 'bg-gradient-to-b from-blue-900/20 to-transparent border-slate-800' : 'bg-gradient-to-b from-blue-50 to-transparent border-slate-200';
  const subtitleText = dk ? 'text-slate-400' : 'text-slate-500';
  const closeBtn = dk ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900';
  const footerBorder = dk ? 'border-slate-800' : 'border-slate-200';
  const footerBtn = dk ? 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200';
  const footerBtnMuted = dk ? 'bg-white/[0.04] text-slate-500 hover:text-white' : 'bg-slate-50 text-slate-500 hover:text-slate-900 hover:bg-slate-100';
  const guardTitle = dk ? 'text-white' : 'text-slate-900';
  const guardEyebrow = dk ? 'text-blue-300/80' : 'text-blue-700';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="h-9 px-3 rounded-lg bg-white/[0.04] flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-[10px] font-semibold"
      >
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: brandColor }}
        />
        <span className="max-w-[120px] truncate">{displayName}</span>
        <i className={`fa-solid fa-chevron-down text-[7px] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 bg-slate-900 border border-slate-800/80 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-[100]">
          <div className="px-3 py-2 border-b border-white/[0.04]">
            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{t('workspace.switcher.brand_workspaces')}</p>
          </div>
          <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
            {showLoadError ? (
              // U5: could not load. Plain retry message, distinct from U3.
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] text-slate-400 mb-2">{t('workspace.error.load_failed')}</p>
                {onRetryLoad && (
                  <button
                    onClick={() => { onRetryLoad(); }}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-[10px] font-bold text-white hover:bg-white/[0.12] transition-colors"
                  >
                    {t('workspace.error.retry')}
                  </button>
                )}
              </div>
            ) : showNoWorkspaces ? (
              // U3: this account has no workspace yet. The "ask your
              // team owner" branch is gone (FR-019a). For an owner, the
              // create button below still appears. For a team member, no
              // create is offered (FR-013) and the message is the full
              // explanation.
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] text-slate-400">{t('workspace.error.no_workspaces')}</p>
              </div>
            ) : (
              visibleWorkspaces.map(ws => (
                <div
                  key={ws.id}
                  className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all group ${
                    (ws.id === activeWorkspaceId || (!activeWorkspaceId && ws.isDefault))
                      ? 'bg-blue-500/10'
                      : 'hover:bg-white/[0.04]'
                  }`}
                  onClick={() => handleSwitch(ws.id)}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0 border border-white/10"
                    style={{ backgroundColor: ws.brandColorPrimary || '#3b82f6' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-white truncate">{ws.name}</p>
                    <p className="text-[8px] text-slate-500 truncate">{ws.brandName}</p>
                  </div>
                  {ws.isDefault && (
                    <span className="text-[7px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">{t('workspace.switcher.default_badge')}</span>
                  )}
                  {/* ISSUE-D T021: the edit pencil is withheld for team
                      members (FR-010). They cannot change a workspace's
                      name, brand, or colours — the deferred role-based
                      editing feature will bring the control back if
                      editors are later granted that capability. */}
                  {!isTeamMember && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditWorkspace(ws); }}
                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-white transition-all px-1"
                      aria-label={t('workspace.settings.edit_title')}
                    >
                      <i className="fa-solid fa-pen text-[8px]" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          {/* ISSUE-D: the create button stays gated on !isTeamMember
              (FR-009). The previous version was already gated — the
              T021 audit verified this, the gate is restated here. */}
          {!isTeamMember && !showLoadError && (
            <div className="border-t border-white/[0.04] p-2">
              <button
                onClick={() => { onCreateNew(); setOpen(false); }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] text-slate-400 text-[10px] font-bold hover:bg-white/[0.08] hover:text-white transition-all"
              >
                <i className="fa-solid fa-plus text-[8px]" /> {t('workspace.switcher.new_workspace')}
              </button>
            </div>
          )}
        </div>
      )}

      {guardIsOpen && effectiveGuardTarget && (
        // Round-9 (CodeRabbit re-review): dialog semantics + Escape key.
        // role="dialog" + aria-modal="true" so screen readers announce
        // the modal; aria-labelledby points at the title; Escape cancels
        // (and is inert while a save is in flight — same as the backdrop
        // click). Other dialogs in this codebase (the funnel-settings
        // modal) already set role="dialog" aria-modal="true", so the
        // guard now matches the rest of the modal vocabulary.
        //
        // Round-11: the wrapper's onKeyDown was removed (the wrapper
        // isn't focusable, so the handler only fired when focus was
        // already inside — a footgun for the externally-triggered path).
        // Escape is now bound at the document level by the useEffect
        // above, and the inner panel takes a ref + tabIndex={-1} so
        // focus lands inside when the guard opens.
        //
        // Hotfix bundle — restyled to match the design system of
        // MetaAccountPickerModal / WorkspaceSettingsModal (rounded-2xl,
        // blue-tinted gradient header with a border-b, neutral footer
        // with a border-t, explicit close button, icon + eyebrow above
        // the title). The previous version was a flat panel with no
        // header or footer chrome — functional but visually off-brand.
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-switch-guard-title"
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
        >
          {/* Backdrop click is inert while a save is in flight — dismissing the
              dialog mid-flush would switch the workspace out from under it. */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={guardSaving ? undefined : handleGuardCancel} />
          <div
            ref={guardDialogRef}
            tabIndex={-1}
            className={`relative ${shell} border rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden outline-none`}
            onClick={e => e.stopPropagation()}
          >
            <div className={`${headerGradient} p-6 pb-5 border-b`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-[9px] font-black uppercase tracking-widest ${guardEyebrow} mb-1.5`}>
                    <i className="fa-solid fa-shuffle text-[8px] me-1.5" aria-hidden="true" />
                    {t('workspace.switch_guard.eyebrow')}
                  </p>
                  <h3 id="workspace-switch-guard-title" className={`text-lg font-black ${guardTitle}`}>{t('workspace.switch_guard.title')}</h3>
                </div>
                <button
                  type="button"
                  onClick={handleGuardCancel}
                  disabled={guardSaving}
                  aria-label={t('close')}
                  className={`shrink-0 ${closeBtn} transition-all disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
                </button>
              </div>
              <p className={`text-[11px] ${subtitleText} mt-2 leading-relaxed`}>{t('workspace.switch_guard.body')}</p>
            </div>
            <div className={`px-6 py-5 border-t ${footerBorder} flex items-center gap-3`}>
              <button
                type="button"
                onClick={handleGuardSave}
                disabled={guardSaving}
                className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {guardSaving ? t('workspace.switch_guard.saving') : t('workspace.switch_guard.save')}
              </button>
              <button
                type="button"
                onClick={handleGuardDiscard}
                disabled={guardSaving}
                className={`flex-1 h-11 rounded-xl ${footerBtn} text-[10px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {t('workspace.switch_guard.discard')}
              </button>
              <button
                type="button"
                onClick={handleGuardCancel}
                disabled={guardSaving}
                className={`flex-1 h-11 rounded-xl ${footerBtnMuted} text-[10px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {t('workspace.switch_guard.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

