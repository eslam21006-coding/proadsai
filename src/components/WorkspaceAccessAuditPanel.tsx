// src/components/WorkspaceAccessAuditPanel.tsx — owner-only audit log viewer
import React, { useState, useEffect } from 'react';
import { workspaceService } from '../services/workspaceService';
import type { WorkspaceAccessAuditEntry } from '../types';
import { useT } from '../i18n';

interface Props {
  ownerUid: string;
}

export default function WorkspaceAccessAuditPanel({ ownerUid }: Props) {
  const { t } = useT();
  const [entries, setEntries] = useState<WorkspaceAccessAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    workspaceService.getWorkspaceAccessAuditLog()
      .then((result) => {
        setEntries(result.data?.entries ?? []);
      })
      .catch((err) => console.warn('Audit log load failed:', err))
      .finally(() => setLoading(false));
  }, [visible, ownerUid]);

  if (!visible) {
    return (
      <div className="mt-4">
        <button
          onClick={() => setVisible(true)}
          className="px-4 py-2 rounded-xl bg-white/[0.04] text-slate-400 text-[10px] font-bold hover:bg-white/[0.08] hover:text-white transition-all"
        >
          {t('workspace.access_history.button')}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-slate-900/50 flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-white">{t('workspace.access_history.title')}</h3>
        <button
          onClick={() => setVisible(false)}
          aria-label={t('workspace.access_history.close')}
          className="text-slate-500 hover:text-white text-xs"
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="p-4 text-center text-[10px] text-slate-500">{t('workspace.access_history.loading')}</div>
      ) : entries.length === 0 ? (
        <div className="p-4 text-center text-[10px] text-slate-500">{t('workspace.access_history.empty')}</div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-[9px]">
            <thead className="bg-slate-900/30 sticky top-0">
              <tr className="text-slate-600">
                <th className="px-3 py-2 text-left font-bold">{t('workspace.access_history.col.time')}</th>
                <th className="px-3 py-2 text-left font-bold">{t('workspace.access_history.col.member')}</th>
                <th className="px-3 py-2 text-left font-bold">{t('workspace.access_history.col.workspace')}</th>
                <th className="px-3 py-2 text-left font-bold">{t('workspace.access_history.col.action')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-white/[0.02] hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-slate-400">
                    {new Date(entry.timestamp).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{entry.targetMemberEmail}</td>
                  <td className="px-3 py-2 text-slate-300">{entry.workspaceNameAtEvent}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                      entry.action === 'grant'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}>
                      {entry.action}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
