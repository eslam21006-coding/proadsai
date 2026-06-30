// src/components/GenerationHistory.tsx — Phase 26 History tab: paginated rendered generations with filters

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useT } from "../i18n";
import {
  useGenerationHistory,
  type HistoryFilters
} from "../hooks/useGenerationHistory";
import type { GenerationRecord } from "../services/feedbackService";
import { COLD_HOOK_ANGLES } from "../constants";
import { getCardById } from "../artDirectionConfig";
import {
  historyLabels,
  hookAngleLabels,
  hookAngleStyles
} from "../i18n/generationHistory";

interface Props {
  uid: string | null;
  workspaceId?: string | null;
  onSelectGeneration: (generationId: string, record: GenerationRecord) => void;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

const HOOK_ANGLE_OPTIONS = COLD_HOOK_ANGLES.map((a) => a.id);

function truncate(str: string | null | undefined, max: number): string {
  if (!str) return "";
  return str.length <= max ? str : str.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Resolve a Firestore Timestamp / Date / ISO string to a Date instance.
 * Returns null when the input is missing or unparsable so the caller can fall
 * back to a placeholder label without throwing.
 */
function readDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // Firestore Timestamp has `.toDate()`.
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Format a date as a short relative-time string in the active UI language.
 * Examples: "just now", "5 minutes ago", "3 hours ago", "yesterday",
 * "3 days ago", "2 weeks ago", "Jan 12". Buckets are coarse on purpose —
 * a rough estimate is more useful than an exact time for a history scan.
 */
function formatRelative(date: Date | null, lang: "en" | "ar"): string {
  if (!date) return "";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const future = diffSec < 0;
  const absSec = Math.abs(diffSec);
  const minutes = Math.round(absSec / 60);
  const hours = Math.round(absSec / 3600);
  const days = Math.round(absSec / 86400);
  const weeks = Math.round(absSec / (86400 * 7));

  // Try Intl.RelativeTimeFormat first — gives localized strings for free.
  try {
    const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar" : "en", { numeric: "auto" });
    if (absSec < 60) return rtf.format(future ? absSec : -absSec, "second");
    if (minutes < 60) return rtf.format(future ? minutes : -minutes, "minute");
    if (hours < 24) return rtf.format(future ? hours : -hours, "hour");
    if (days < 7) return rtf.format(future ? days : -days, "day");
    if (weeks < 4) return rtf.format(future ? weeks : -weeks, "week");
  } catch {
    // Intl not available — fall through to the absolute formatter below.
  }
  return date.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
    month: "short",
    day: "numeric",
    year: days > 365 ? "numeric" : undefined,
  });
}

function getUniverseDisplay(record: GenerationRecord): string | null {
  const creative = record.creativeIdentity?.universeId;
  if (creative) return creative;
  const input = record.input;
  if (!input) return null;
  if (input.preferredUniverse) return input.preferredUniverse;
  if ((input as { resolvedUniverse?: string }).resolvedUniverse) {
    return (input as { resolvedUniverse?: string }).resolvedUniverse as string;
  }
  // NOTE: `input.tone` is intentionally NOT used as a universe fallback for
  // DISPLAY. The backend write path persists `resolvedUniverse` into `tone`,
  // so tone can sometimes hold a universe value — but `tone` is semantically
  // a different field (ad tone), so showing it as a universe would mislead
  // the user. The filter hook still reads tone so legacy rows stay findable.
  return null;
}

function getHookAngleDisplay(record: GenerationRecord): string | null {
  const creative = record.creativeIdentity?.hookAngle;
  if (creative) return creative;
  const input = record.input as { coldHookAngle?: string | null } | undefined;
  return input?.coldHookAngle ?? null;
}

function getArtDirectionDisplay(record: GenerationRecord): string | null {
  return record.input?.visualSubStyle ?? null;
}

function getHookText(record: GenerationRecord): string {
  return (
    record.output?.hookText ||
    record.output?.subhead ||
    record.output?.conceptText ||
    record.input?.productName ||
    ""
  );
}

// ─── HOOK ANGLE BADGE ───────────────────────────────────────────────────────

interface HookBadgeProps {
  hookId: string | null;
  langKey: "en" | "ar";
}

const HookBadge: React.FC<HookBadgeProps> = ({ hookId, langKey }) => {
  if (!hookId) return null;
  const label = hookAngleLabels[hookId]?.[langKey] ?? hookId.replace(/_/g, " ");
  const style = hookAngleStyles[hookId]?.twClass
    ?? "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${style}`}
    >
      {label}
    </span>
  );
};

// ─── FILTER DROPDOWN ────────────────────────────────────────────────────────

interface MultiSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  anyLabel: string;
}

const MultiSelectDropdown: React.FC<MultiSelectProps> = ({ label, options, selected, onChange, anyLabel }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const summary =
    selected.length === 0
      ? anyLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors ${
          selected.length > 0
            ? "bg-blue-600/15 border-blue-500/40 text-blue-300 hover:border-blue-400/60"
            : "bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600"
        }`}
      >
        <span className="text-slate-400">{label}:</span>
        <span className="max-w-[120px] truncate">{summary}</span>
        <i className={`fa-solid fa-chevron-down text-[8px] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-30 mt-1.5 start-0 min-w-[200px] max-h-[260px] overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-xl shadow-black/40 py-1 scrollbar-thin"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-slate-500">{anyLabel}</div>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <button
                  type="button"
                  key={opt.value}
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(opt.value)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-start hover:bg-slate-800/70 transition-colors ${
                    checked ? "text-blue-300" : "text-slate-200"
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 flex-shrink-0 rounded border flex items-center justify-center ${
                      checked ? "bg-blue-600 border-blue-500" : "border-slate-600 bg-slate-800"
                    }`}
                  >
                    {checked && <i className="fa-solid fa-check text-[8px] text-white" />}
                  </span>
                  <span className="flex-1 truncate">{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

// ─── HISTORY CARD ───────────────────────────────────────────────────────────

interface CardProps {
  record: GenerationRecord;
  langKey: "en" | "ar";
  dir: "ltr" | "rtl";
  onSelect: (id: string, record: GenerationRecord) => void;
  openLabel: string;
}

const GenerationCard: React.FC<CardProps> = React.memo(({ record, langKey, dir, onSelect, openLabel }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [prevImageUrl, setPrevImageUrl] = useState<string | null | undefined>(record.output?.imageUrl);
  const imageUrl = record.output?.imageUrl;

  // Reset the image-failure flag whenever the resolved image URL changes —
  // otherwise a broken/pending URL would permanently disable rendering for
  // the same card even if a live snapshot later swaps in a working one.
  // Adjusted during render (not in an effect) per the React-recommended
  // pattern for "reset state when a prop changes".
  if (prevImageUrl !== imageUrl) {
    setPrevImageUrl(imageUrl);
    setImgFailed(false);
  }

  const hookText = getHookText(record);
  const universe = getUniverseDisplay(record);
  const artDir = getArtDirectionDisplay(record);
  const hookId = getHookAngleDisplay(record);
  const date = readDate(record.timestamp);
  const dateLabel = formatRelative(date, langKey);

  const handleActivate = () => {
    if (record.id) onSelect(record.id, record);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.currentTarget !== e.target) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleActivate();
    }
  };

  // Resolve the human-readable art direction name from the catalog when
  // possible; fall back to a normalized version of the id.
  const artDirLabel = artDir
    ? (getCardById(artDir)?.[langKey === "ar" ? "labelAr" : "labelEn"] ?? artDir.replace(/_/g, " "))
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={openLabel}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      dir={dir}
      className="group relative flex flex-col bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden cursor-pointer hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
    >
      <div className="aspect-[4/5] w-full bg-slate-800 flex items-center justify-center overflow-hidden relative">
        {imageUrl && !imgFailed ? (
          <img
            src={imageUrl}
            alt={truncate(hookText, 60) || historyLabels.noHookText[langKey]}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-600 gap-2">
            <i className="fa-regular fa-image text-2xl" />
            <span className="text-[10px]">{historyLabels.noHookText[langKey]}</span>
          </div>
        )}
        <div className="absolute top-2 start-2">
          <HookBadge hookId={hookId} langKey={langKey} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="text-[11px] font-semibold text-white line-clamp-2 leading-snug" title={hookText}>
          {truncate(hookText, 60) || (
            <span className="text-slate-500 italic font-normal">{historyLabels.noHookText[langKey]}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
          {universe ? (
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 truncate max-w-[60%]" title={universe}>
              {universe}
            </span>
          ) : (
            <span className="text-slate-600 italic">{historyLabels.noUniverse[langKey]}</span>
          )}
          <span className="text-slate-700">•</span>
          {artDirLabel ? (
            <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 truncate max-w-[40%]" title={artDirLabel}>
              {artDirLabel}
            </span>
          ) : (
            <span className="text-slate-600 italic">{historyLabels.noArtDirection[langKey]}</span>
          )}
        </div>
        {dateLabel && (
          <div className="text-[9px] text-slate-500 mt-0.5" title={date ? date.toLocaleString(langKey === "ar" ? "ar-EG" : "en-US") : undefined}>
            {dateLabel}
          </div>
        )}
      </div>
    </div>
  );
});
GenerationCard.displayName = "GenerationCard";

// ─── COMPONENT ──────────────────────────────────────────────────────────────

const GenerationHistory: React.FC<Props> = ({ uid, workspaceId, onSelectGeneration }) => {
  const { dir, lang } = useT();
  const langKey = (lang === "ar" ? "ar" : "en") as "en" | "ar";

  const [hookFilter, setHookFilter] = useState<string[]>([]);
  const [universeFilter, setUniverseFilter] = useState<string[]>([]);
  const [artFilter, setArtFilter] = useState<string[]>([]);

  const filters: HistoryFilters = useMemo(
    () => ({
      hookAngle: hookFilter,
      universe: universeFilter,
      artDirection: artFilter,
    }),
    [hookFilter, universeFilter, artFilter]
  );

  const { items, facets, loading, hasMore, loadMore, totalCount } = useGenerationHistory({
    uid,
    workspaceId,
    filters,
  });

  // Facets come from the SAME subscription as `items` — they include the
  // unfiltered universe / art-direction values from every loaded row (head +
  // tail), so dropdown options stay populated even when an active filter
  // happens to hide every current card. This is the project's chosen shape:
  // a single Firestore subscription, no duplicated queries.
  const universeOptions = useMemo(
    () => facets.universes.map((v) => ({ value: v, label: v })),
    [facets.universes]
  );

  const artDirectionOptions = useMemo(
    () =>
      facets.artDirections.map((v) => {
        const card = getCardById(v);
        const label = card
          ? (langKey === "ar" ? card.labelAr : card.labelEn)
          : v.replace(/_/g, " ");
        return { value: v, label };
      }),
    [facets.artDirections, langKey]
  );

  const hookAngleOptions = useMemo(
    () =>
      HOOK_ANGLE_OPTIONS.map((id) => ({
        value: id,
        label: hookAngleLabels[id]?.[langKey] ?? id.replace(/_/g, " "),
      })),
    [langKey]
  );

  const anyHookLabel = historyLabels.filterAnyCount[langKey].replace("{n}", String(hookAngleOptions.length));
  const anyUniverseLabel = historyLabels.filterAnyCount[langKey].replace("{n}", String(universeOptions.length));
  const anyArtLabel = historyLabels.filterAnyCount[langKey].replace("{n}", String(artDirectionOptions.length));

  const totalActiveFilters = hookFilter.length + universeFilter.length + artFilter.length;

  const clearAll = useCallback(() => {
    setHookFilter([]);
    setUniverseFilter([]);
    setArtFilter([]);
  }, []);

  // Active-filter chip list — flat array used to render the chip row.
  const activeChips = useMemo(() => {
    const chips: { id: string; label: string; onRemove: () => void }[] = [];
    for (const id of hookFilter) {
      const opt = hookAngleOptions.find((o) => o.value === id);
      chips.push({
        id: `hook-${id}`,
        label: opt?.label ?? id,
        onRemove: () => setHookFilter((prev) => prev.filter((v) => v !== id)),
      });
    }
    for (const id of universeFilter) {
      const opt = universeOptions.find((o) => o.value === id);
      chips.push({
        id: `universe-${id}`,
        label: opt?.label ?? id,
        onRemove: () => setUniverseFilter((prev) => prev.filter((v) => v !== id)),
      });
    }
    for (const id of artFilter) {
      const opt = artDirectionOptions.find((o) => o.value === id);
      chips.push({
        id: `art-${id}`,
        label: opt?.label ?? id,
        onRemove: () => setArtFilter((prev) => prev.filter((v) => v !== id)),
      });
    }
    return chips;
  }, [hookFilter, universeFilter, artFilter, hookAngleOptions, universeOptions, artDirectionOptions]);

  const countLabel =
    totalCount === 1
      ? historyLabels.countSingular[langKey].replace("{n}", "1")
      : historyLabels.countPlural[langKey].replace("{n}", String(totalCount));

  const showEmpty = !loading && items.length === 0;
  const isFilteredEmpty = showEmpty && totalActiveFilters > 0;

  return (
    <div className="space-y-3" dir={dir}>
      <div className="flex items-center justify-between px-1">
        <div className="flex flex-col">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {historyLabels.title[langKey]}
          </h3>
          <span className="text-[10px] text-slate-500 mt-0.5">{countLabel}</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <MultiSelectDropdown
          label={historyLabels.filterHookAngle[langKey]}
          options={hookAngleOptions}
          selected={hookFilter}
          onChange={setHookFilter}
          anyLabel={anyHookLabel}
        />
        <MultiSelectDropdown
          label={historyLabels.filterUniverse[langKey]}
          options={universeOptions}
          selected={universeFilter}
          onChange={setUniverseFilter}
          anyLabel={anyUniverseLabel}
        />
        <MultiSelectDropdown
          label={historyLabels.filterArtDirection[langKey]}
          options={artDirectionOptions}
          selected={artFilter}
          onChange={setArtFilter}
          anyLabel={anyArtLabel}
        />
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          {activeChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600/15 border border-blue-500/40 text-[10px] text-blue-300"
            >
              <span className="font-semibold">{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`${historyLabels.clearFilter[langKey]}: ${chip.label}`}
                className="text-blue-300/70 hover:text-white transition-colors"
              >
                <i className="fa-solid fa-xmark text-[9px]" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-[10px] font-semibold text-slate-400 hover:text-white transition-colors px-2 py-0.5"
          >
            {historyLabels.clearAllFilters[langKey]}
          </button>
        </div>
      )}

      {/* Card grid */}
      {showEmpty ? (
        <div className="text-center py-10 text-slate-500 text-xs">
          {isFilteredEmpty ? historyLabels.emptyFiltered[langKey] : historyLabels.empty[langKey]}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[70vh] overflow-y-auto pr-1 scrollbar-thin">
          {items.map((record, idx) => {
            // Stable key: prefer Firestore doc id; fall back to a string made
            // from the row's timestamp (always unique in practice for renders
            // produced in this app) and finally to the loop index when both
            // are missing. Math.random is intentionally NOT used — that would
            // be an impure call during render and could change every paint.
            let key: string;
            if (record.id) {
              key = record.id;
            } else {
              const ts = record.timestamp?.toMillis?.();
              key = typeof ts === "number" ? `ts-${ts}` : `idx-${idx}`;
            }
            return (
              <GenerationCard
                key={key}
                record={record}
                langKey={langKey}
                dir={dir}
                onSelect={onSelectGeneration}
                openLabel={historyLabels.openGenerationAria[langKey]}
              />
            );
          })}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && items.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden animate-pulse">
              <div className="aspect-[4/5] bg-slate-800" />
              <div className="p-2.5 space-y-2">
                <div className="h-3 bg-slate-800 rounded w-3/4" />
                <div className="h-2 bg-slate-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more / end-of-list */}
      {items.length > 0 && (
        <div className="flex items-center justify-center pt-2">
          {hasMore ? (
            <button
              type="button"
              onClick={() => {
                // Catch pagination rejections so they surface as a sanitized
                // warning rather than an unhandled promise rejection.
                loadMore().catch((error: unknown) => {
                  console.warn('Failed to load more generation history records', error);
                });
              }}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed text-[11px] font-semibold text-white transition-colors flex items-center gap-2"
            >
              {loading && <i className="fa-solid fa-spinner fa-spin text-[10px]" />}
              {historyLabels.loadMore[langKey]}
            </button>
          ) : (
            <span className="text-[10px] text-slate-500">{historyLabels.endOfList[langKey]}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default GenerationHistory;