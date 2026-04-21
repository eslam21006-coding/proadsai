// src/components/FavoritesPanel.tsx — reusable per-step favorites panel

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFavorites } from '../hooks/useFavorites';
import { feedbackService } from '../services/feedbackService';
import type { GenerationRecord } from '../services/feedbackService';

type Phase = 'hooks' | 'concepts' | 'render' | 'caption';
type SortMode = 'newest' | 'oldest' | 'alphabetical';

interface FavoritesPanelProps {
  phase: Phase;
  onLoad: (record: GenerationRecord) => void;
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string | null;
}

const PHASE_LABELS: Record<Phase, { label: string; icon: string; color: string; ariaLabel: string }> = {
  hooks: { label: 'Hook', icon: 'fa-bolt', color: 'bg-blue-500/15 text-blue-400', ariaLabel: 'Saved hooks' },
  concepts: { label: 'Blueprint', icon: 'fa-compass-drafting', color: 'bg-violet-500/15 text-violet-400', ariaLabel: 'Saved concepts' },
  render: { label: 'Design', icon: 'fa-image', color: 'bg-emerald-500/15 text-emerald-400', ariaLabel: 'Saved designs' },
  caption: { label: 'Caption', icon: 'fa-pen-nib', color: 'bg-purple-500/15 text-purple-400', ariaLabel: 'Saved captions' },
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
  const { favorites, loading, hasMore, loadMore, connectionState } = useFavorites({ phase, workspaceId });
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [removing, setRemoving] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const sortToggleRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const prevFavoritesLenRef = useRef(0);
  const panelId = `favorites-panel-${phase}`;

  // T037: Focus management — on open, move focus to sort toggle; store pre-open activeElement
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      // Delay focus to allow DOM to render
      requestAnimationFrame(() => {
        sortToggleRef.current?.focus();
      });
    }
  }, [isOpen]);

  // T037: Escape key closes panel and returns focus to trigger
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // T031: After loadMore, move focus to first newly-added item
  const handleLoadMore = useCallback(async () => {
    const prevLen = favorites.length;
    setLoadingMore(true);
    try {
      await loadMore();
    } finally {
      setLoadingMore(false);
    }
    // Focus first new item after load — use requestAnimationFrame for DOM update
    requestAnimationFrame(() => {
      const listItems = panelRef.current?.querySelectorAll('[role="listitem"]');
      if (listItems && listItems.length > prevLen) {
        (listItems[prevLen] as HTMLElement)?.focus();
      }
    });
  }, [loadMore, favorites.length]);

  if (!isOpen) return null;

  const sorted = sortFavorites(favorites, sortMode);
  const phaseInfo = PHASE_LABELS[phase];
  const prevLen = prevFavoritesLenRef.current;
  prevFavoritesLenRef.current = sorted.length;

  const handleRemove = async (id: string | undefined) => {
    if (!id) return;
    setRemoving(id);
    try {
      await feedbackService.toggleFavorite(id, false);
    } catch (err) {
      console.warn('Failed to toggle favorite for id:', id, err);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* T035: role="region" with aria-label */}
      <div
        ref={panelRef}
        role="region"
        aria-label={phaseInfo.ariaLabel}
        id={panelId}
        className="relative w-full max-w-md bg-slate-950 border-l border-slate-800 flex flex-col h-full animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded-full ${phaseInfo.color}`}>
              <i className={`fa-solid ${phaseInfo.icon} mr-1`}></i>{phaseInfo.label}
            </span>
            <span className="text-sm font-bold text-white">Saved {phaseInfo.label}s</span>
            <span className="text-[10px] text-slate-500">({favorites.length})</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-800/60 text-slate-400 hover:text-white flex items-center justify-center transition-all" aria-label="Close panel">
            <i className="fa-solid fa-xmark text-xs"></i>
          </button>
        </div>

        {/* Sort toggle — T037: first interactive control, receives focus on open */}
        <div className="flex gap-1.5 px-4 py-2 border-b border-slate-800/50">
          {(['newest', 'oldest', 'alphabetical'] as SortMode[]).map((mode, idx) => (
            <button
              key={mode}
              ref={idx === 0 ? sortToggleRef : undefined}
              onClick={() => setSortMode(mode)}
              aria-label={`Sort by ${mode}`}
              className={`px-2.5 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all ${sortMode === mode ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-slate-900/60 text-slate-500 hover:text-slate-300 border border-transparent'}`}
            >
              {mode === 'newest' ? 'Newest' : mode === 'oldest' ? 'Oldest' : 'A-Z'}
            </button>
          ))}
        </div>

        {/* T033: Offline banner — non-blocking, aria-live polite */}
        {connectionState === 'stale' && (
          <div aria-live="polite" className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
            <p className="text-[10px] text-amber-400 font-medium flex items-center gap-1.5">
              <i className="fa-solid fa-wifi-slash text-[8px]"></i>
              Offline — showing last saved list
            </p>
          </div>
        )}

        {/* Content — T036: role="list" wrapper only when items exist */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col" {...(sorted.length > 0 ? { role: 'list', 'aria-label': `${phaseInfo.label} favorites list` } : {})}>
          {loading && favorites.length === 0 ? (
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
            <>
              {sorted.map(record => {
                const preview = getPreviewText(record);
                const dateStr = record.timestamp?.toDate
                  ? new Date(record.timestamp.toDate()).toLocaleDateString()
                  : '';
                const isImage = phase === 'render' && record.output?.imageUrl && record.output.imageUrl !== '(generated)';
                const truncatedPreview = preview.substring(0, 40);

                return (
                  <div
                    key={record.id}
                    role="listitem"
                    tabIndex={0}
                    className="bg-slate-900/60 border border-slate-800/40 rounded-xl p-3 transition-all hover:border-blue-500/30 group focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
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

                    {isImage ? (
                      <img src={record.output.imageUrl} alt={`Saved design ${record.id || ''}`} className="w-full max-h-40 object-contain rounded-lg border border-slate-800 mb-2" />
                    ) : (
                      <div dir="rtl" className="arabic-text text-[11px] text-slate-300 leading-relaxed line-clamp-3 mb-2">
                        {preview}
                      </div>
                    )}

                    {record.input?.productName && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[7px] bg-slate-800/40 text-slate-600 px-1.5 py-0.5 rounded">{record.input.productName}</span>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-slate-800/30">
                      <button
                        onClick={() => onLoad(record)}
                        aria-label={`Load ${phaseInfo.label.toLowerCase()}: ${truncatedPreview}`}
                        className="flex-1 py-1.5 rounded-lg bg-blue-600/15 text-blue-400 hover:bg-blue-600 hover:text-white text-[8px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                      >
                        <i className="fa-solid fa-upload text-[7px]"></i> Load
                      </button>
                      <button
                        onClick={() => handleRemove(record.id)}
                        disabled={removing === record.id}
                        aria-label={`Remove ${phaseInfo.label.toLowerCase()}: ${truncatedPreview} from favorites`}
                        className="py-1.5 px-2.5 rounded-lg bg-slate-800/40 text-slate-600 hover:bg-red-600/20 hover:text-red-400 text-[8px] transition-all disabled:opacity-30"
                      >
                        <i className="fa-solid fa-trash-can text-[7px]"></i>
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* T031: "Show older" button — outside role="list" to avoid aria-required-children violation */}
        {hasMore && sorted.length > 0 && (
          <div className="px-4 pb-3">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
              aria-label="Show older favorites"
              className="w-full py-2.5 rounded-xl bg-slate-800/40 border border-slate-700/30 text-slate-400 hover:text-white hover:bg-slate-800/80 text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingMore ? (
                <>
                  <div className="animate-spin w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full"></div>
                  Loading...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-chevron-down text-[8px]"></i>
                  Show older
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
