// src/components/FavoritesPanel.tsx — reusable per-step favorites panel

import { useState } from 'react';
import { useFavorites } from '../hooks/useFavorites';
import { feedbackService, type GenerationRecord } from '../services/feedbackService';

type Phase = 'hooks' | 'concepts' | 'render' | 'caption';
type SortMode = 'newest' | 'oldest' | 'alphabetical';

interface FavoritesPanelProps {
  phase: Phase;
  onLoad: (record: GenerationRecord) => void;
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string | null;
}

const PHASE_LABELS: Record<Phase, { label: string; icon: string; color: string }> = {
  hooks: { label: 'Hook', icon: 'fa-bolt', color: 'bg-blue-500/15 text-blue-400' },
  concepts: { label: 'Blueprint', icon: 'fa-compass-drafting', color: 'bg-violet-500/15 text-violet-400' },
  render: { label: 'Design', icon: 'fa-image', color: 'bg-emerald-500/15 text-emerald-400' },
  caption: { label: 'Caption', icon: 'fa-pen-nib', color: 'bg-purple-500/15 text-purple-400' },
};

function getPreviewText(record: GenerationRecord): string {
  const o = record.output;
  if (o.hookText) return o.hookText;
  if (o.conceptText) return o.conceptText.substring(0, 200);
  if (o.captionText) return o.captionText.substring(0, 200);
  if (o.imageUrl && o.imageUrl !== '(generated)') return '[Image]';
  return o.fullResponse?.substring(0, 150) || 'No preview';
}

function sortFavorites(favs: GenerationRecord[], mode: SortMode): GenerationRecord[] {
  const sorted = [...favs];
  if (mode === 'newest') {
    sorted.sort((a, b) => {
      const ta = a.timestamp?.toMillis?.() || 0;
      const tb = b.timestamp?.toMillis?.() || 0;
      return tb - ta;
    });
  } else if (mode === 'oldest') {
    sorted.sort((a, b) => {
      const ta = a.timestamp?.toMillis?.() || 0;
      const tb = b.timestamp?.toMillis?.() || 0;
      return ta - tb;
    });
  } else {
    sorted.sort((a, b) => getPreviewText(a).localeCompare(getPreviewText(b)));
  }
  return sorted;
}

export default function FavoritesPanel({ phase, onLoad, isOpen, onClose, workspaceId }: FavoritesPanelProps) {
  const { favorites, loading } = useFavorites({ phase, workspaceId });
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [removing, setRemoving] = useState<string | null>(null);

  if (!isOpen) return null;

  const sorted = sortFavorites(favorites, sortMode);
  const phaseInfo = PHASE_LABELS[phase];

  const handleRemove = async (id: string) => {
    setRemoving(id);
    try {
      await feedbackService.toggleFavorite(id, false);
    } catch {
      // Real-time subscription will remove it; log silently
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-950 border-l border-slate-800 flex flex-col h-full animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded-full ${phaseInfo.color}`}>
              <i className={`fa-solid ${phaseInfo.icon} mr-1`}></i>{phaseInfo.label}
            </span>
            <span className="text-sm font-bold text-white">Saved {phaseInfo.label}s</span>
            <span className="text-[10px] text-slate-500">({favorites.length})</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-800/60 text-slate-400 hover:text-white flex items-center justify-center transition-all">
            <i className="fa-solid fa-xmark text-xs"></i>
          </button>
        </div>

        {/* Sort toggle */}
        <div className="flex gap-1.5 px-4 py-2 border-b border-slate-800/50">
          {(['newest', 'oldest', 'alphabetical'] as SortMode[]).map(mode => (
            <button key={mode} onClick={() => setSortMode(mode)}
              className={`px-2.5 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all ${sortMode === mode ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-slate-900/60 text-slate-500 hover:text-slate-300 border border-transparent'}`}>
              {mode === 'newest' ? 'Newest' : mode === 'oldest' ? 'Oldest' : 'A-Z'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center py-12 space-y-3">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-[10px] text-slate-500">Loading favorites...</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <i className="fa-solid fa-bookmark text-3xl text-slate-700"></i>
              <p className="text-sm text-slate-500 font-semibold">No saved {phaseInfo.label.toLowerCase()}s yet</p>
              <p className="text-[10px] text-slate-600">Click the bookmark icon on any {phaseInfo.label.toLowerCase()} to save it here</p>
            </div>
          ) : (
            sorted.map(record => {
              const preview = getPreviewText(record);
              const dateStr = record.timestamp?.toDate
                ? new Date(record.timestamp.toDate()).toLocaleDateString()
                : '';
              const isImage = phase === 'render' && record.output?.imageUrl && record.output.imageUrl !== '(generated)';

              return (
                <div key={record.id} className="bg-slate-900/60 border border-slate-800/40 rounded-xl p-3 transition-all hover:border-blue-500/30 group">
                  {/* Meta row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[7px] font-bold uppercase px-1.5 py-0.5 rounded ${phaseInfo.color}`}>
                        {phaseInfo.label}
                      </span>
                      {record.feedback?.rating === 'used' && (
                        <span className="text-[7px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                          <i className="fa-solid fa-rocket mr-0.5"></i>Used
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] text-slate-600">{dateStr}</span>
                  </div>

                  {/* Preview */}
                  {isImage ? (
                    <img src={record.output.imageUrl} className="w-full max-h-40 object-contain rounded-lg border border-slate-800 mb-2" />
                  ) : (
                    <div dir="rtl" className="arabic-text text-[11px] text-slate-300 leading-relaxed line-clamp-3 mb-2">
                      {preview}
                    </div>
                  )}

                  {/* Product info */}
                  {record.input?.productName && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-[7px] bg-slate-800/40 text-slate-600 px-1.5 py-0.5 rounded">{record.input.productName}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-slate-800/30">
                    <button onClick={() => onLoad(record)}
                      className="flex-1 py-1.5 rounded-lg bg-blue-600/15 text-blue-400 hover:bg-blue-600 hover:text-white text-[8px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1">
                      <i className="fa-solid fa-upload text-[7px]"></i> Load
                    </button>
                    <button onClick={() => handleRemove(record.id!)}
                      disabled={removing === record.id}
                      className="py-1.5 px-2.5 rounded-lg bg-slate-800/40 text-slate-600 hover:bg-red-600/20 hover:text-red-400 text-[8px] transition-all disabled:opacity-30">
                      <i className="fa-solid fa-trash-can text-[7px]"></i>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
