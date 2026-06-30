// src/components/GenerationHistory.tsx — Phase 26 History tab: paginated rendered generations with filters

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useT } from "../i18n";
import {
  useGenerationHistory,
  type HistoryFilters,
  type HistoryItem,
} from "../hooks/useGenerationHistory";
import type { SavedProject } from "../types";
import { COLD_HOOK_ANGLES } from "../constants";
import { getCardById } from "../artDirectionConfig";
import {
  historyLabels,
  hookAngleLabels,
  hookAngleStyles
} from "../i18n/generationHistory";

/**
 * Public props for the GenerationHistory panel.
 * `uid` / `workspaceId` drive the Firestore scope; `onSelectHistory` fires
 * when a card is clicked so the host (App.tsx) can route to the matching
 * saved project.
 */
interface Props {
  uid: string | null;
  workspaceId?: string | null;
  /**
   * Locally-available saved projects. Already loaded by the host (App.tsx
   * keeps them in state), so this component does NOT issue a second
   * Firestore query. Pass an empty array to skip the merge entirely.
   */
  savedProjects?: SavedProject[];
  /**
   * Fires when a card is clicked. The host decides whether to load the
   * project directly (when `item.source === 'project'`) or look up the
   * matching saved project by imageUrl (when `item.source === 'generation'`).
   */
  onSelectHistory: (item: HistoryItem) => void;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

const HOOK_ANGLE_OPTIONS = COLD_HOOK_ANGLES.map((a) => a.id);

/**
 * Truncate a string to `max` characters, appending an ellipsis when shortened.
 * Empty / nullish input collapses to an empty string.
 */
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

// ─── STATUS BADGE ────────────────────────────────────────────────────────────

/**
 * Props for the status chip rendered on a card. Drafts / rendered / published
 * each get their own color so the user can scan a grid and tell at a glance
 * which projects are still in draft form.
 */
interface StatusBadgeProps {
  status: 'draft' | 'rendered' | 'published';
  langKey: "en" | "ar";
}

const STATUS_STYLES: Record<'draft' | 'rendered' | 'published', string> = {
  draft:     'bg-slate-500/15 text-slate-300 border-slate-500/30',
  rendered:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  published: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
};

const STATUS_LABELS: Record<'draft' | 'rendered' | 'published', { en: string; ar: string }> = {
  draft:     { en: "DRAFT",     ar: "مسودة" },
  rendered:  { en: "RENDERED",  ar: "معروض" },
  published: { en: "PUBLISHED", ar: "منشور" },
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, langKey }) => {
  const label = STATUS_LABELS[status]?.[langKey] ?? status;
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${style}`}
    >
      {label}
    </span>
  );
};

// ─── HOOK ANGLE BADGE ───────────────────────────────────────────────────────

/**
 * Props for the small colored chip that renders the resolved cold-hook-angle
 * on a generation card. Returns `null` (no chip) when the record has no hook
 * angle — avoids showing an empty badge on legacy or malformed rows.
 */
interface HookBadgeProps {
  hookId: string | null;
  langKey: "en" | "ar";
}

/**
 * Colored pill that visualizes the hook angle on a card. Each angle has a
 * unique color so the user can scan a grid and identify the dominant angle
 * without reading text.
 */
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

/**
 * Props for the multi-select filter dropdown used by the history panel.
 * `anyLabel` is the placeholder text shown in the trigger when nothing is
 * selected; it usually includes the option count (e.g. "Any (12)").
 */
interface MultiSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  anyLabel: string;
}

/**
 * Compact multi-select dropdown with checkbox options. Closes on outside
 * click and Escape key. Trigger button shows the active count when more
 * than one selection is present.
 */
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

/**
 * Props for a single history card. `onSelect` fires when the card is
 * activated (click or Enter/Space) and receives the unified HistoryItem so
 * the host can route to the matching saved project (or load it directly
 * when source === 'project').
 */
interface CardProps {
  item: HistoryItem;
  langKey: "en" | "ar";
  dir: "ltr" | "rtl";
  onSelect: (item: HistoryItem) => void;
  openLabel: string;
}

const GenerationCard: React.FC<CardProps> = React.memo(({ item, langKey, dir, onSelect, openLabel }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [prevImageUrl, setPrevImageUrl] = useState<string | null | undefined>(item.thumbnailUrl);
  const imageUrl = item.thumbnailUrl;
  const isDraft = item.status === 'draft';

  // Reset the image-failure flag whenever the resolved image URL changes —
  // otherwise a broken/pending URL would permanently disable rendering for
  // the same card even if a live snapshot later swaps in a working one.
  // Adjusted during render (not in an effect) per the React-recommended
  // pattern for "reset state when a prop changes".
  if (prevImageUrl !== imageUrl) {
    setPrevImageUrl(imageUrl);
    setImgFailed(false);
  }

  const hookText = item.hookText;
  const projectName = item.projectName;
  // Drafts have no render output, so we surface the project name as the
  // headline instead. For rendered / published rows the hook text wins.
  const displayTitle = isDraft
    ? (projectName ?? null)
    : (hookText ?? projectName ?? null);
  const universe = isDraft ? null : item.universe;
  const artDir = isDraft ? null : item.artDirection;
  const hookId = isDraft ? null : item.hookAngle;
  const date = readDate(item.timestamp);
  const dateLabel = formatRelative(date, langKey);
  // The HTML `title` attribute accepts `string | undefined`, not null.
  const titleText = displayTitle ?? undefined;

  const handleActivate = () => {
    onSelect(item);
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
        {isDraft ? (
          // Drafts render a stable placeholder so the grid stays uniform even
          // before the user has run a render pass.
          <div className="flex flex-col items-center justify-center text-slate-600 gap-2">
            <i className="fa-solid fa-pen-ruler text-3xl" />
            <span className="text-[10px]">{historyLabels.draftThumbnailAlt[langKey]}</span>
          </div>
        ) : imageUrl && !imgFailed ? (
          <img
            src={imageUrl}
            alt={truncate(displayTitle, 60) || historyLabels.noHookText[langKey]}
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
        <div className="absolute top-2 start-2 flex flex-col gap-1 items-start">
          {isDraft ? (
            <StatusBadge status="draft" langKey={langKey} />
          ) : (
            <>
              <StatusBadge status={item.status} langKey={langKey} />
              <HookBadge hookId={hookId} langKey={langKey} />
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="text-[11px] font-semibold text-white line-clamp-2 leading-snug" title={titleText}>
          {truncate(displayTitle, 60) || (
            <span className="text-slate-500 italic font-normal">
              {isDraft ? historyLabels.noProjectName[langKey] : historyLabels.noHookText[langKey]}
            </span>
          )}
        </div>
        {!isDraft && (universe || artDirLabel) && (
          <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
            {universe ? (
              <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 truncate max-w-[60%]" title={universe ?? undefined}>
                {universe}
              </span>
            ) : (
              <span className="text-slate-600 italic">{historyLabels.noUniverse[langKey]}</span>
            )}
            <span className="text-slate-700">•</span>
            {artDirLabel ? (
              <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 truncate max-w-[40%]" title={artDirLabel ?? undefined}>
                {artDirLabel}
              </span>
            ) : (
              <span className="text-slate-600 italic">{historyLabels.noArtDirection[langKey]}</span>
            )}
          </div>
        )}
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

/**
 * Phase 26 history panel: filter bar (hook angle / universe / art direction),
 * responsive card grid, load-more pagination, and loading / empty / end-of-list
 * states. All UI strings flow through `useT()`; the Firestore subscription is
 * delegated to `useGenerationHistory`.
 */
const GenerationHistory: React.FC<Props> = ({ uid, workspaceId, savedProjects, onSelectHistory }) => {
  const { dir, lang } = useT();
  const langKey = (lang === "ar" ? "ar" : "en") as "en" | "ar";

  const [hookFilter, setHookFilter] = useState<string[]>([]);
  const [universeFilter, setUniverseFilter] = useState<string[]>([]);
  const [artFilter, setArtFilter] = useState<string[]>([]);
  // Status filter is single-select (chip group) rather than multi-select — the
  // spec is "All / Drafts / Rendered / Published", each one a discrete bucket.
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'rendered' | 'published'>('all');
  const [search, setSearch] = useState('');

  const filters: HistoryFilters = useMemo(
    () => ({
      hookAngle: hookFilter,
      universe: universeFilter,
      artDirection: artFilter,
      status: statusFilter === 'all' ? [] : [statusFilter],
      search,
    }),
    [hookFilter, universeFilter, artFilter, statusFilter, search]
  );

  const { items, facets, loading, hasMore, loadMore, totalCount } = useGenerationHistory({
    uid,
    workspaceId,
    filters,
    savedProjects,
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

  const totalActiveFilters = hookFilter.length
    + universeFilter.length
    + artFilter.length
    + (statusFilter === 'all' ? 0 : 1)
    + (search.trim().length > 0 ? 1 : 0);

  const clearAll = useCallback(() => {
    setHookFilter([]);
    setUniverseFilter([]);
    setArtFilter([]);
    setStatusFilter('all');
    setSearch('');
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

  const showEmpty = !loading && items.length === 0 && !hasMore;
  const isFilteredEmpty = showEmpty && totalActiveFilters > 0;
  // The footer (load-more / end-of-list) must stay reachable whenever the
  // hook reports more pages, even if the current filtered page is empty —
  // client-side filters can legitimately hide every row on the first page
  // while older pages contain matches.
  const showFooter = items.length > 0 || hasMore;

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

      {/* Search bar */}
      <div className="px-1">
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[11px]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={historyLabels.searchPlaceholder[langKey]}
            className="w-full ps-8 pe-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-slate-500"
          />
          {search.length > 0 && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={historyLabels.clearFilter[langKey]}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-[11px]"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1 px-1" role="tablist" aria-label="Status filter">
        {(['all', 'draft', 'rendered', 'published'] as const).map((s) => {
          const labelMap = {
            all:       historyLabels.statusAll[langKey],
            draft:     historyLabels.statusDraft[langKey],
            rendered:  historyLabels.statusRendered[langKey],
            published: historyLabels.statusPublished[langKey],
          } as const;
          const isActive = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {labelMap[s]}
            </button>
          );
        })}
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
          {items.map((item) => (
            <GenerationCard
              key={item.id}
              item={item}
              langKey={langKey}
              dir={dir}
              onSelect={onSelectHistory}
              openLabel={historyLabels.openGenerationAria[langKey]}
            />
          ))}
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

      {/* Load more / end-of-list — always reachable when hasMore is true */}
      {showFooter && (
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