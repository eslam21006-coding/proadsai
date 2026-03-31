// WorkspaceSwitcher.tsx — Dropdown for switching between brand workspaces (Scaling plan only)
import React, { useState, useRef, useEffect } from 'react';
import type { Workspace } from '../types';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSwitch: (id: string) => void;
  onCreateNew: () => void;
  onEditWorkspace: (ws: Workspace) => void;
}

export default function WorkspaceSwitcher({ workspaces, activeWorkspaceId, onSwitch, onCreateNew, onEditWorkspace }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const active = workspaces.find(w => w.id === activeWorkspaceId) || workspaces.find(w => w.isDefault);
  const displayName = active?.name || 'Default Workspace';
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
            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Brand Workspaces</p>
          </div>
          <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
            {workspaces.map(ws => (
              <div
                key={ws.id}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all group ${
                  (ws.id === activeWorkspaceId || (!activeWorkspaceId && ws.isDefault))
                    ? 'bg-blue-500/10'
                    : 'hover:bg-white/[0.04]'
                }`}
                onClick={() => { onSwitch(ws.id); setOpen(false); }}
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
                  <span className="text-[7px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">Default</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onEditWorkspace(ws); }}
                  className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-white transition-all px-1"
                >
                  <i className="fa-solid fa-pen text-[8px]" />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-white/[0.04] p-2">
            <button
              onClick={() => { onCreateNew(); setOpen(false); }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] text-slate-400 text-[10px] font-bold hover:bg-white/[0.08] hover:text-white transition-all"
            >
              <i className="fa-solid fa-plus text-[8px]" /> New Workspace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
