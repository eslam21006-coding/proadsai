// src/components/FavoritesPanel.tsx — reusable per-step favorites panel (localized, WCAG 2.1 AA)

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFavorites } from '../hooks/useFavorites';
import { feedbackService } from '../services/feedbackService';
import type { GenerationRecord } from '../services/feedbackService';
import { useT } from '../i18n';

type Phase = 'hooks' | 'concepts' | 'render' | 'caption';
type SortMode = 'newest' | 'oldest' | 'alphabetical';

interface FavoritesPanelProps {
  phase: Phase;
  onLoad: (record: GenerationRecord) => void;
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string | null;
}

// Visual attributes only — labels come from i18n at render time.
const PHASE_STYLES: Record<Phase, { icon: string; color: string }> = {
  hooks: { icon: 'fa-bolt', color: 'bg-blue-500/15 text-blue-400' },
  concepts: { icon: 'fa-compass-drafting', color: 'bg-violet-500/15 text-violet-400' },
  render: { icon: 'fa-image', color: 'bg-emerald-500/15 text-emerald-400' },
  caption: { icon: 'fa-pen-nib', color: 'bg-purple-500/15 text-purple-400' },
};

function sortFavorites(
  favs: GenerationRecord[],
  mode: SortMode,
  previewOf: (r: GenerationRecord) => string
): GenerationRecord[] {
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
    sorted.sort((a, b) => previewOf(a).localeCompare(previewOf(b)));
  }
  return sorted;
}

export default function FavoritesPanel({ phase, onLoad, isOpen, onClose, workspaceId }: FavoritesPanelProps) {
  const { t, dir } = useT();
  const { favorites, loading, hasMore, loadMore, connectionState } = useFavorites({ phase, workspaceId });
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [removing, setRemoving] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const sortToggleRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelId = `favorites-panel-${phase}`;

  const phaseLabel = t(`fav.phase_label.${phase}`);
  const regionLabel = t(`fav.aria_region.${phase}`);
  const styles = PHASE_STYLES[phase];

  const previewOf = useCallback((record: GenerationRecord): string => {
    const o = record.output;
    if (o.hookText) return o.hookText;
    if (o.conceptText) return o.conceptText.substring(0, 200);
    if (o.captionText) return o.captionText.substring(0, 200);
    if (o.imageUrl && o.imageUrl !== '(generated)') return t('fav.preview_image');
    return o.fullResponse?.substring(0, 150) || t('fav.preview_none');
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => {
        sortToggleRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Single source of truth for panel closure: Escape key, close button, and
  // backdrop click all route through this so focus is consistently restored
  // to the toggle that opened the panel.
  const closeAndRestoreFocus = useCallback(() => {
    onClose();
    triggerRef.current?.focus();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAndRestoreFocus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeAndRestoreFocus]);

  // ID-based focus diff: capture existing item IDs before loadMore, then focus
  // the first item whose ID is new after the page arrives. Robust against
  // client-side re-sorting (alphabetical / oldest) which would break
  // positional indexing.
  const handleLoadMore = useCallback(async () => {
    const prevIds = new Set<string>();
    panelRef.current?.querySelectorAll<HTMLElement>('[data-fav-id]').forEach(el => {
      const id = el.dataset.favId;
      if (id) prevIds.add(id);
    });
    setLoadingMore(true);
    try {
      await loadMore();
    } finally {
      setLoadingMore(false);
    }
    requestAnimationFrame(() => {
      const items = panelRef.current?.querySelectorAll<HTMLElement>('[data-fav-id]');
      if (!items) return;
      for (const el of Array.from(items)) {
        const id = el.dataset.favId;
        if (id && !prevIds.has(id)) {
          el.focus();
          return;
        }
      }
    });
  }, [loadMore]);

  if (!isOpen) return null;

  const sorted = sortFavorites(favorites, sortMode, previewOf);

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

  const sortLabel = (mode: SortMode) =>
    mode === 'newest' ? t('fav.sort_newest')
      : mode === 'oldest' ? t('fav.sort_oldest')
        : t('fav.sort_alpha');

  return (
    <div className="fixed inset-0 z-[150] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAndRestoreFocus} />
      <div
        ref={panelRef}
        role="region"
        aria-label={regionLabel}
        id={panelId}
        dir={dir}
        className="relative w-full max-w-md bg-slate-950 border-l border-slate-800 flex flex-col h-full animate-in slide-in-from-right duration-300"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded-full ${styles.color}`}>
              <i className={`fa-solid ${styles.icon} mr-1`}></i>{phaseLabel}
            </span>
            <span className="text-sm font-bold text-white">{regionLabel}</span>
            <span className="text-[10px] text-slate-500">({favorites.length})</span>
          </div>
          <button
            onClick={closeAndRestoreFocus}
            aria-label={t('fav.close_panel')}
            className="w-8 h-8 rounded-lg bg-slate-800/60 text-slate-400 hover:text-white flex items-center justify-center transition-all"
          >
            <i className="fa-solid fa-xmark text-xs"></i>
          </button>
        </div>

        <div className="flex gap-1.5 px-4 py-2 border-b border-slate-800/50">
          {(['newest', 'oldest', 'alphabetical'] as SortMode[]).map((mode, idx) => (
            <button
              key={mode}
              ref={idx === 0 ? sortToggleRef : undefined}
              onClick={() => setSortMode(mode)}
              aria-label={t('fav.sort_by', { mode: sortLabel(mode) })}
              className={`px-2.5 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all ${sortMode === mode ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-slate-900/60 text-slate-500 hover:text-slate-300 border border-transparent'}`}
            >
              {sortLabel(mode)}
            </button>
          ))}
        </div>

        {connectionState === 'stale' && (
          <div aria-live="polite" className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
            <p className="text-[10px] text-amber-400 font-medium flex items-center gap-1.5">
              <i className="fa-solid fa-wifi-slash text-[8px]"></i>
              {t('fav.offline_banner')}
            </p>
          </div>
        )}

        <div
          className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col"
          {...(sorted.length > 0 ? { role: 'list', 'aria-label': t('fav.aria_list', { label: phaseLabel }) } : {})}
        >
          {loading && favorites.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-[10px] text-slate-500">{t('fav.loading')}</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <i className="fa-solid fa-bookmark text-3xl text-slate-700"></i>
              <p className="text-sm text-slate-500 font-semibold">{t('fav.empty_title', { label: phaseLabel.toLowerCase() })}</p>
              <p className="text-[10px] text-slate-600">{t('fav.empty_desc', { label: phaseLabel.toLowerCase() })}</p>
            </div>
          ) : (
            sorted.map(record => {
              const preview = previewOf(record);
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
                  data-fav-id={record.id}
                  className="bg-slate-900/60 border border-slate-800/40 rounded-xl p-3 transition-all hover:border-blue-500/30 group focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[7px] font-bold uppercase px-1.5 py-0.5 rounded ${styles.color}`}>
                        {phaseLabel}
                      </span>
                      {record.feedback?.rating === 'used' && (
                        <span className="text-[7px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                          <i className="fa-solid fa-rocket mr-0.5"></i>{t('fav.used_badge')}
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] text-slate-600">{dateStr}</span>
                  </div>

                  {isImage ? (
                    <img
                      src={record.output.imageUrl}
                      alt={t('fav.saved_design_alt', { id: record.id || '' })}
                      className="w-full max-h-40 object-contain rounded-lg border border-slate-800 mb-2"
                    />
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
                      aria-label={t('fav.aria_load', { label: phaseLabel.toLowerCase(), preview: truncatedPreview })}
                      className="flex-1 py-1.5 rounded-lg bg-blue-600/15 text-blue-400 hover:bg-blue-600 hover:text-white text-[8px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                    >
                      <i className="fa-solid fa-upload text-[7px]"></i> {t('fav.load')}
                    </button>
                    <button
                      onClick={() => handleRemove(record.id)}
                      disabled={removing === record.id}
                      aria-label={t('fav.aria_remove', { label: phaseLabel.toLowerCase(), preview: truncatedPreview })}
                      className="py-1.5 px-2.5 rounded-lg bg-slate-800/40 text-slate-600 hover:bg-red-600/20 hover:text-red-400 text-[8px] transition-all disabled:opacity-30"
                    >
                      <i className="fa-solid fa-trash-can text-[7px]"></i>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {hasMore && sorted.length > 0 && (
          <div className="px-4 pb-3">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
              aria-label={t('fav.aria_show_older')}
              className="w-full py-2.5 rounded-xl bg-slate-800/40 border border-slate-700/30 text-slate-400 hover:text-white hover:bg-slate-800/80 text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingMore ? (
                <>
                  <div className="animate-spin w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full"></div>
                  {t('fav.loading_more')}
                </>
              ) : (
                <>
                  <i className="fa-solid fa-chevron-down text-[8px]"></i>
                  {t('fav.show_older')}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
