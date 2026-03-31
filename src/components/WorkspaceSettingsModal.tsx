// WorkspaceSettingsModal.tsx — Create / Edit brand workspace (Scaling plan only)
import React, { useState, useEffect } from 'react';
import type { Workspace } from '../types';

interface WorkspaceSettingsModalProps {
  workspace: Workspace | null; // null = create mode
  onSave: (data: Omit<Workspace, 'id' | 'createdAt'>) => void;
  onDelete?: (workspaceId: string) => void;
  onClose: () => void;
}

export default function WorkspaceSettingsModal({ workspace, onSave, onDelete, onClose }: WorkspaceSettingsModalProps) {
  const isEdit = !!workspace;
  const [name, setName] = useState(workspace?.name || '');
  const [brandName, setBrandName] = useState(workspace?.brandName || '');
  const [brandUrl, setBrandUrl] = useState(workspace?.brandUrl || '');
  const [colorPrimary, setColorPrimary] = useState(workspace?.brandColorPrimary || '#3b82f6');
  const [colorSecondary, setColorSecondary] = useState(workspace?.brandColorSecondary || '#1e293b');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setBrandName(workspace.brandName);
      setBrandUrl(workspace.brandUrl || '');
      setColorPrimary(workspace.brandColorPrimary || '#3b82f6');
      setColorSecondary(workspace.brandColorSecondary || '#1e293b');
    }
  }, [workspace]);

  const handleSubmit = () => {
    if (!name.trim() || !brandName.trim()) return;
    onSave({
      name: name.trim(),
      brandName: brandName.trim(),
      brandUrl: brandUrl.trim() || '',
      brandColorPrimary: colorPrimary,
      brandColorSecondary: colorSecondary,
      logoUrl: workspace?.logoUrl || '',
      isDefault: workspace?.isDefault ?? false,
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-slate-950 border border-slate-800 rounded-[2rem] max-w-lg w-full mx-4 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-b from-blue-900/20 to-transparent p-8 pb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-white">
              {isEdit ? 'Edit Workspace' : 'New Workspace'}
            </h2>
            <button onClick={onClose} className="text-slate-600 hover:text-white transition-all">
              <i className="fa-solid fa-xmark text-lg" />
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            {isEdit ? 'Update brand settings for this workspace' : 'Create a separate environment for a client brand'}
          </p>
        </div>

        {/* Form */}
        <div className="p-8 pt-2 space-y-5">
          {/* Workspace Name */}
          <div>
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">Workspace Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Client: Nike"
              className="w-full h-10 px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-white text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Brand Name */}
          <div>
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">Brand Name</label>
            <input
              type="text"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              placeholder="e.g. Nike"
              className="w-full h-10 px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-white text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Brand URL */}
          <div>
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">Brand URL <span className="text-slate-700">(optional)</span></label>
            <input
              type="url"
              value={brandUrl}
              onChange={e => setBrandUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full h-10 px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-white text-[11px] placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Colors */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">Primary Color</label>
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
              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">Secondary Color</label>
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

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || !brandName.trim()}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isEdit ? 'Save Changes' : 'Create Workspace'}
            </button>
            {isEdit && !workspace?.isDefault && onDelete && (
              confirmDelete ? (
                <button
                  onClick={() => onDelete(workspace!.id)}
                  className="h-11 px-5 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400 text-[10px] font-bold hover:bg-red-600/30 transition-colors"
                >
                  Confirm Delete
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="h-11 px-4 rounded-xl bg-white/[0.04] text-slate-500 text-[10px] font-bold hover:text-red-400 hover:bg-red-500/5 transition-colors"
                >
                  <i className="fa-solid fa-trash text-[9px]" />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
