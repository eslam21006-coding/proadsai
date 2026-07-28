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

  // Round-2 #3/#6: react to externally-triggered switches too. When App.tsx
  // sets `pendingWorkspaceSwitch` after the owner deletes the active
  // workspace during in-progress work, the parent has already performed
  // the actual switch — we just need to open the existing guard dialog
  // so the member sees the save/discard confirmation.
  //
  // Audit F1: this effect previously opened only when
  // `switchGuardTarget !== activeWorkspaceIdRef.current`. That guard could
  // never pass. The parent sets the target to the SAME id it just made
  // active, React batches both updates into one render, and the ref was
  // assigned during that render — so the comparison was always a value
  // against itself and the dialog was unreachable dead code.
  //
  // The trigger is the transition of `switchGuardTarget` from null to
  // non-null. There is nothing to compare it to: the parent only sets it
  // when it has already decided the guard is warranted.
  React.useEffect(() => {
    if (switchGuardTarget) {
      setPendingTarget(switchGuardTarget);
      setGuardOpen(true);
    } else {
      // Parent cleared the guard state — close the dialog if it was
      // showing an externally-triggered prompt.
      setGuardOpen(false);
      setPendingTarget(null);
    }
  }, [switchGuardTarget]);

  const activeWorkspaces = workspaces.filter(ws => ws.deletedAt == null);

  // ISSUE-D: under the all-access contract, a team member's filter MUST
  // be undefined here. The previous per-workspace allowlist filter is
  // retired — the contract (FR-004) is that every verified member sees
  // every active workspace of the owner. The filter expression below
  // preserves the legacy `isTeamMember && workspaceAccess` shape so that
  // if a future restriction feature reintroduces the array, the call site
  // re-enables the filter by passing it again; today it is left
  // undefined and the visible list equals activeWorkspaces.
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

  const handleGuardDiscard = () => {
    if (pendingTarget) {
      onSwitchGuardDiscard?.(pendingTarget);
      // Round-2 #3/#6: in the externally-triggered path (parent already
      // called onSwitch while opening this dialog), pendingTarget IS
      // the current active id and a second onSwitch is a no-op. Skip
      // the call when the parent has already moved the active pointer
      // — that keeps this idempotent across both trigger paths.
      if (pendingTarget !== activeWorkspaceId) onSwitch(pendingTarget);
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
  const handleGuardSave = async () => {
    if (pendingTarget) {
      setGuardSaving(true);
      try {
        await onSwitchGuardSave?.(pendingTarget);
      } finally {
        setGuardSaving(false);
      }
      if (pendingTarget !== activeWorkspaceId) onSwitch(pendingTarget);
    }
    setGuardOpen(false);
    setPendingTarget(null);
    setOpen(false);
  };

  const handleGuardCancel = () => {
    onSwitchGuardCancel?.();
    setGuardOpen(false);
    setPendingTarget(null);
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

      {guardOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          {/* Backdrop click is inert while a save is in flight — dismissing the
              dialog mid-flush would switch the workspace out from under it. */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={guardSaving ? undefined : handleGuardCancel} />
          <div className="relative bg-slate-950 border border-slate-800 rounded-2xl max-w-sm w-full mx-4 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">{t('workspace.switch_guard.title')}</h3>
            <p className="text-sm text-slate-400 mb-6">{t('workspace.switch_guard.body')}</p>
            <div className="flex gap-3">
              <button
                onClick={handleGuardSave}
                disabled={guardSaving}
                className="flex-1 h-10 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {guardSaving ? t('workspace.switch_guard.saving') : t('workspace.switch_guard.save')}
              </button>
              <button
                onClick={handleGuardDiscard}
                disabled={guardSaving}
                className="flex-1 h-10 rounded-xl bg-white/[0.06] text-slate-300 text-xs font-bold hover:bg-white/[0.1] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {t('workspace.switch_guard.discard')}
              </button>
              <button
                onClick={handleGuardCancel}
                disabled={guardSaving}
                className="flex-1 h-10 rounded-xl bg-white/[0.04] text-slate-500 text-xs font-bold hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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

