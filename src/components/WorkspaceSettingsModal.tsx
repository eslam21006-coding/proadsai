// WorkspaceSettingsModal.tsx — Create / Edit brand workspace (Scaling plan only)
import React, { useState, useEffect } from 'react';
import type { Workspace } from '../types';
import { workspaceService } from '../services/workspaceService';
import type { UserPlan } from '../planconfig';
import { useT } from '../i18n';

interface WorkspaceSettingsModalProps {
  workspace: Workspace | null;
  onSave: (data: Omit<Workspace, 'id' | 'createdAt'>) => void;
  onDelete?: (workspaceId: string) => void;
  onClose: () => void;
  plan?: UserPlan;
  metaAdAccounts?: { id: string; name: string }[];
}

function isMetaEligible(plan?: UserPlan): boolean {
  return plan === 'pro' || plan === 'scale';
}

export default function WorkspaceSettingsModal({ workspace, onSave, onDelete, onClose, plan, metaAdAccounts }: WorkspaceSettingsModalProps) {
  const { t } = useT();
  const isEdit = !!workspace;
  const [name, setName] = useState(workspace?.name || '');
  const [brandName, setBrandName] = useState(workspace?.brandName || '');
  const [brandUrl, setBrandUrl] = useState(workspace?.brandUrl || '');
  const [colorPrimary, setColorPrimary] = useState(workspace?.brandColorPrimary || '#3b82f6');
  const [colorSecondary, setColorSecondary] = useState(workspace?.brandColorSecondary || '#1e293b');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedMetaAccount, setSelectedMetaAccount] = useState<string>(workspace?.metaAdAccountId || '');
  const [saving, setSaving] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [linkedMeta, setLinkedMeta] = useState<{
    id?: string;
    name?: string;
    role?: 'ADMIN' | 'ADVERTISER' | 'ANALYST' | 'INSUFFICIENT';
  }>({
    id: workspace?.metaAdAccountId,
    name: workspace?.metaAdAccountName,
    role: workspace?.metaRoleAtLinkTime,
  });

  const isScale = plan === 'scale';
  const showMetaSection = isEdit && isMetaEligible(plan);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setBrandName(workspace.brandName);
      setBrandUrl(workspace.brandUrl || '');
      setColorPrimary(workspace.brandColorPrimary || '#3b82f6');
      setColorSecondary(workspace.brandColorSecondary || '#1e293b');
      setSelectedMetaAccount(workspace.metaAdAccountId || '');
      setLinkedMeta({
        id: workspace.metaAdAccountId,
        name: workspace.metaAdAccountName,
        role: workspace.metaRoleAtLinkTime,
      });
    } else {
      // Reset to create-mode defaults when the modal switches from edit → create.
      setName('');
      setBrandName('');
      setBrandUrl('');
      setColorPrimary('#3b82f6');
      setColorSecondary('#1e293b');
      setSelectedMetaAccount('');
      setLinkedMeta({ id: undefined, name: undefined, role: undefined });
      setConfirmDelete(false);
      setUiError(null);
    }
  }, [workspace]);

  const handleSubmit = async () => {
    if (!name.trim() || !brandName.trim()) return;
    setSaving(true);
    setUiError(null);
    try {
      if (!isEdit) {
        await workspaceService.createWorkspace({
          name: name.trim(),
          brandName: brandName.trim(),
          brandUrl: brandUrl.trim() || undefined,
          brandColorPrimary: colorPrimary,
          brandColorSecondary: colorSecondary,
        });
      } else {
        await workspaceService.updateWorkspace({
          workspaceId: workspace!.id,
          name: name.trim(),
          brandName: brandName.trim(),
          brandUrl: brandUrl.trim() || null,
          brandColorPrimary: colorPrimary,
          brandColorSecondary: colorSecondary,
        });
      }
      onSave({
        name: name.trim(),
        brandName: brandName.trim(),
        brandUrl: brandUrl.trim() || '',
        brandColorPrimary: colorPrimary,
        brandColorSecondary: colorSecondary,
        logoUrl: workspace?.logoUrl || '',
        isDefault: workspace?.isDefault ?? false,
      });
    } catch (err) {
      console.warn('Workspace save failed:', err);
      setUiError(t('workspace.settings.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!workspace || !onDelete) return;
    setSaving(true);
    setUiError(null);
    try {
      await workspaceService.deleteWorkspace(workspace.id);
      onDelete(workspace.id);
    } catch (err) {
      console.warn('Workspace delete failed:', err);
      setUiError(t('workspace.settings.delete_failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleLinkMeta = async () => {
    if (!workspace || !selectedMetaAccount) return;
    const account = metaAdAccounts?.find(a => a.id === selectedMetaAccount);
    setUiError(null);
    try {
      const result = await workspaceService.linkMetaAccountToWorkspace({
        workspaceId: workspace.id,
        metaAdAccountId: selectedMetaAccount,
        metaAdAccountName: account?.name || selectedMetaAccount,
      });
      const role = (result.data?.metaRoleAtLinkTime ?? undefined) as
        | 'ADMIN'
        | 'ADVERTISER'
        | 'ANALYST'
        | 'INSUFFICIENT'
        | undefined;
      setLinkedMeta({
        id: selectedMetaAccount,
        name: account?.name || selectedMetaAccount,
        role,
      });
    } catch (err) {
      console.warn('Meta link failed:', err);
      setUiError(t('workspace.settings.meta_link_failed'));
    }
  };

  const handleUnlinkMeta = async () => {
    if (!workspace) return;
    setUiError(null);
    try {
      await workspaceService.unlinkMetaAccountFromWorkspace(workspace.id);
      setSelectedMetaAccount('');
      setLinkedMeta({});
    } catch (err) {
      console.warn('Meta unlink failed:', err);
      setUiError(t('workspace.settings.meta_unlink_failed'));
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-slate-950 border border-slate-800 rounded-[2rem] max-w-lg w-full mx-4 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-b from-blue-900/20 to-transparent p-8 pb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-white">
              {isEdit ? t('workspace.settings.edit_title') : t('workspace.settings.new_title')}
            </h2>
            <button
              onClick={onClose}
              aria-label={t('close')}
              className="text-slate-600 hover:text-white transition-all"
            >
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            {isEdit ? t('workspace.settings.edit_subtitle') : t('workspace.settings.new_subtitle')}
          </p>
          {!isScale && !isEdit && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px]">
              {t('workspace.error.scale_required')}
            </div>
          )}
        </div>

        <div className="p-8 pt-2 space-y-5">
          <div>
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">{t('workspace.settings.field.name')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('workspace.settings.field.name_placeholder')}
              className="w-full h-10 px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-white text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">{t('workspace.settings.field.brand')}</label>
            <input
              type="text"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              placeholder={t('workspace.settings.field.brand_placeholder')}
              className="w-full h-10 px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-white text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">{t('workspace.settings.field.url')} <span className="text-slate-700">{t('workspace.settings.field.url_optional')}</span></label>
            <input
              type="url"
              value={brandUrl}
              onChange={e => setBrandUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full h-10 px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-white text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">{t('workspace.settings.field.primary_color')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorPrimary}
                  onChange={e => setColorPrimary(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-800 cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={colorPrimary}
                  onChange={e => setColorPrimary(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-900/60 border border-slate-800 text-white text-[10px] font-mono focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">{t('workspace.settings.field.secondary_color')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorSecondary}
                  onChange={e => setColorSecondary(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-800 cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={colorSecondary}
                  onChange={e => setColorSecondary(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-900/60 border border-slate-800 text-white text-[10px] font-mono focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            </div>
          </div>

          {showMetaSection && (
            <div className="border-t border-white/[0.04] pt-4">
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-2">{t('workspace.settings.meta_section_label')}</label>
              {linkedMeta.id ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <p className="text-[10px] font-bold text-white">{linkedMeta.name}</p>
                    <p className="text-[8px] text-slate-500">
                      {linkedMeta.role === 'ADMIN'
                        ? t('roles.meta.admin')
                        : linkedMeta.role === 'ADVERTISER'
                          ? t('roles.meta.advertiser')
                          : linkedMeta.role === 'ANALYST'
                            ? t('roles.meta.analyst')
                            : linkedMeta.role === 'INSUFFICIENT'
                              ? t('roles.meta.insufficient')
                              : (linkedMeta.role ?? t('roles.unknown'))}
                    </p>
                  </div>
                  <button
                    onClick={handleUnlinkMeta}
                    className="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-[10px] font-bold hover:bg-red-500/20 transition-colors"
                  >
                    {t('workspace.settings.disconnect')}
                  </button>
                </div>
              ) : (
                <div>
                  {(!metaAdAccounts || metaAdAccounts.length === 0) ? (
                    <p className="text-[10px] text-slate-500">{t('workspace.settings.meta_connect_prompt')}</p>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={selectedMetaAccount}
                        onChange={e => setSelectedMetaAccount(e.target.value)}
                        className="flex-1 h-10 px-3 rounded-xl bg-slate-900/60 border border-slate-800 text-white text-[10px] focus:outline-none focus:border-blue-500/50"
                      >
                        <option value="">{t('workspace.settings.meta_select_placeholder')}</option>
                        {metaAdAccounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleLinkMeta}
                        disabled={!selectedMetaAccount}
                        className="px-4 rounded-xl bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-500 disabled:opacity-40 transition-colors"
                      >
                        {t('workspace.settings.link')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {uiError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px]">
              {uiError}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || !brandName.trim() || saving || (!isScale && !isEdit)}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving
                ? t('workspace.settings.saving')
                : (isEdit ? t('workspace.settings.save_changes') : t('workspace.settings.create'))}
            </button>
            {isEdit && !workspace?.isDefault && onDelete && (
              confirmDelete ? (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="h-11 px-5 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400 text-[10px] font-bold hover:bg-red-600/30 transition-colors"
                >
                  {saving ? t('workspace.settings.deleting') : t('workspace.settings.confirm_delete')}
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  aria-label={t('delete')}
                  className="h-11 px-4 rounded-xl bg-white/[0.04] text-slate-500 text-[10px] font-bold hover:text-red-400 hover:bg-red-500/5 transition-colors"
                >
                  <i className="fa-solid fa-trash text-[9px]" aria-hidden="true" />
                </button>
              )
            )}
          </div>
          {isEdit && !workspace?.isDefault && confirmDelete && (
            <p className="text-[9px] text-slate-500 text-center">
              {t('workspace.settings.delete_notice')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
