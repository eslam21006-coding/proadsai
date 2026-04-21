// src/components/WorkspaceAccessAuditPanel.tsx — owner-only audit log viewer
import React, { useState, useEffect } from 'react';
import { workspaceService } from '../services/workspaceService';
import type { WorkspaceAccessAuditEntry } from '../types';

interface Props {
  ownerUid: string;
}

export default function WorkspaceAccessAuditPanel({ ownerUid }: Props) {
  const [entries, setEntries] = useState<WorkspaceAccessAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    workspaceService.getWorkspaceAccessAuditLog()
      .then((result) => {
        setEntries((result.data as any)?.entries ?? []);
      })
      .catch((err) => console.error('Audit log load failed:', err))
      .finally(() => setLoading(false));
  }, [visible, ownerUid]);

  if (!visible) {
    return (
      <div className="mt-4">
        <button
          onClick={() => setVisible(true)}
          className="px-4 py-2 rounded-xl bg-white/[0.04] text-slate-400 text-[10px] font-bold hover:bg-white/[0.08] hover:text-white transition-all"
        >
          View access history
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-slate-900/50 flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-white">Workspace Access History</h3>
        <button
          onClick={() => setVisible(false)}
          className="text-slate-500 hover:text-white text-xs"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {loading ? (
        <div className="p-4 text-center text-[10px] text-slate-500">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="p-4 text-center text-[10px] text-slate-500">No access changes recorded yet.</div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-[9px]">
            <thead className="bg-slate-900/30 sticky top-0">
              <tr className="text-slate-600">
                <th className="px-3 py-2 text-left font-bold">Time</th>
                <th className="px-3 py-2 text-left font-bold">Member</th>
                <th className="px-3 py-2 text-left font-bold">Workspace</th>
                <th className="px-3 py-2 text-left font-bold">Action</th>
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
