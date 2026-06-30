// src/hooks/useGenerationHistory.ts — Phase 26 unified history hook (generations + saved projects)

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db } from '../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  getDocs, startAfter,
  type DocumentSnapshot, type Query, type QuerySnapshot, type Unsubscribe, type DocumentData
} from 'firebase/firestore';
import type { GenerationRecord } from '../services/feedbackService';
import type { SavedProject } from '../types';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type HistoryItemStatus = 'draft' | 'rendered' | 'published';

/**
 * Unified row type for the History view. A HistoryItem either originates from
 * the `generations` collection (rich metadata, always rendered) or from a
 * `SavedProject` that may be a draft, rendered, or published state and may
 * not have a matching generation record (older projects).
 */
export interface HistoryItem {
  /** Stable id: generation doc id or `project-{projectId}`. */
  id: string;
  source: 'generation' | 'project';
  /** Unix ms for sorting. */
  timestamp: number;
  /** Display image (render output for generations, mockupHistory[0] for projects). */
  thumbnailUrl: string | null;
  /** Headline text from the generated hook output (or fallbacks). */
  hookText: string | null;
  /** Hook angle id for filtering. */
  hookAngle: string | null;
  /** Universe id for filtering. */
  universe: string | null;
  /** Art-direction id for filtering. */
  artDirection: string | null;
  /** Lifecycle status for filtering & badge display. */
  status: HistoryItemStatus;
  /** Saved-project display name (used when no hook text or as a secondary label). */
  projectName: string | null;
  /** Source references — exactly one is set, but both are kept for convenience. */
  generationId?: string;
  projectId?: string;
}

export interface HistoryFilters {
  /** OR'd within the category — `['pain', 'curiosity']` matches either. Empty array = no filter. */
  hookAngle?: string[];
  /** OR'd within the category. Empty array = no filter. */
  universe?: string[];
  /** OR'd within the category. Empty array = no filter. */
  artDirection?: string[];
  /** OR'd within the category. Empty array = no filter. */
  status?: HistoryItemStatus[];
}

interface UseGenerationHistoryOptions {
  /** Authenticated user id; the hook resets and idles when null. */
  uid: string | null;
  /** Optional workspace scope. When set, queries by `workspaceId`; when null, queries by `userId` and filters out workspace-tagged records. */
  workspaceId?: string | null;
  /** Client-side AND/OR filters applied to the merged history. */
  filters?: HistoryFilters;
  /** Page size for the head snapshot and each `loadMore` call. Defaults to 20. */
  pageSize?: number;
  /**
   * Locally-available saved projects. Already loaded by the host (App.tsx
   * keeps them in state), so the hook does NOT issue a second Firestore
   * query. Pass an empty array to skip the merge entirely.
   */
  savedProjects?: SavedProject[];
}

interface GenerationHistoryResult {
  /** Deduped, filtered, time-sorted history rows (newest first). */
  items: HistoryItem[];
  /** Unique universe + art-direction values across the merged history. Powers the filter dropdowns. */
  facets: { universes: string[]; artDirections: string[] };
  /** True while the generations subscription is loading or a `loadMore` is in flight. */
  loading: boolean;
  /** True when more generation pages are available past the current tail. */
  hasMore: boolean;
  /** Loads the next generation page (no-op when no more pages or already loading). */
  loadMore: () => Promise<void>;
  /** Count of the items the user is currently seeing (post-filter, post-dedup). */
  totalCount: number;
}

const DEFAULT_PAGE_SIZE = 20;
const FALLBACK_PAGE_SIZE = 40;

// ─── FIELD RESOLVERS (GenerationRecord side) ─────────────────────────────────

/**
 * Resolve the universe identifier for filter matching. The `creativeIdentity`
 * block is the canonical location, with `input.preferredUniverse` /
 * `input.universeMode` as documented fallbacks. Legacy `input.resolvedUniverse`
 * and the `input.tone` quirk (the write path persists the resolved universe
 * under `tone`) are read last so older records still match.
 */
function getUniverseOfGen(record: GenerationRecord): string | null {
  const creativeUniverse = record.creativeIdentity?.universeId;
  if (creativeUniverse != null && creativeUniverse !== '') return creativeUniverse;
  const input = record.input;
  if (!input) return null;
  if (input.preferredUniverse != null && input.preferredUniverse !== '') return input.preferredUniverse;
  if (input.universeMode != null && input.universeMode !== '') return input.universeMode;
  const direct = (input as { resolvedUniverse?: string | null }).resolvedUniverse;
  if (direct != null && direct !== '') return direct;
  if (input.tone != null && input.tone !== '') return input.tone;
  return null;
}

/**
 * Resolve the cold hook angle for filter matching. Prefers the canonical
 * `creativeIdentity.hookAngle`, falls back to legacy `input.coldHookAngle`.
 */
function getHookAngleOfGen(record: GenerationRecord): string | null {
  const creative = record.creativeIdentity?.hookAngle;
  if (creative != null && creative !== '') return creative;
  const input = record.input;
  if (!input) return null;
  const legacy = (input as { coldHookAngle?: string | null }).coldHookAngle;
  return legacy != null && legacy !== '' ? legacy : null;
}

/**
 * Resolve the art-direction (sub-style) identifier for filter matching.
 * Reads `input.visualSubStyle`, which is the single canonical source.
 */
function getArtDirectionOfGen(record: GenerationRecord): string | null {
  const input = record.input;
  if (!input) return null;
  const v = input.visualSubStyle;
  return v != null && v !== '' ? v : null;
}

/**
 * Resolve the best display hook text from the generation record. Walks
 * hookText → subhead → conceptText → productName in priority order so the
 * card shows something useful even when the copy stage never produced a
 * final hook line.
 */
function getHookTextOfGen(record: GenerationRecord): string | null {
  return (
    record.output?.hookText ||
    record.output?.subhead ||
    record.output?.conceptText ||
    record.input?.productName ||
    null
  );
}

/**
 * Convert a Firestore Timestamp / Date / ISO string to ms. Returns null when
 * unparseable so the caller can fall back to a placeholder without throwing.
 */
function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
}

// ─── FIELD RESOLVERS (SavedProject side) ────────────────────────────────────

/**
 * Extract universe id from a saved project's inputs. Uses the same precedence
 * as the generation-side resolver so the filter dropdowns stay unified.
 */
function getUniverseOfProject(p: SavedProject): string | null {
  const creative = (p as { creativeIdentity?: { universeId?: string | null } }).creativeIdentity?.universeId;
  if (creative != null && creative !== '') return creative;
  const inputs = p.inputs;
  if (!inputs) return null;
  if ((inputs as { preferredUniverse?: string | null }).preferredUniverse) {
    return (inputs as { preferredUniverse?: string | null }).preferredUniverse as string;
  }
  if ((inputs as { universeMode?: string | null }).universeMode) {
    return (inputs as { universeMode?: string | null }).universeMode as string;
  }
  const resolved = (inputs as { resolvedUniverse?: string | null }).resolvedUniverse;
  if (resolved != null && resolved !== '') return resolved;
  // Legacy quirk: older saves may persist the universe under `tone`.
  if ((inputs as { tone?: string | null }).tone) {
    return (inputs as { tone?: string | null }).tone as string;
  }
  return null;
}

function getHookAngleOfProject(p: SavedProject): string | null {
  const creative = (p as { creativeIdentity?: { hookAngle?: string | null } }).creativeIdentity?.hookAngle;
  if (creative != null && creative !== '') return creative;
  const inputs = p.inputs;
  if (!inputs) return null;
  const legacy = (inputs as { coldHookAngle?: string | null }).coldHookAngle;
  return legacy != null && legacy !== '' ? legacy : null;
}

function getArtDirectionOfProject(p: SavedProject): string | null {
  const inputs = p.inputs;
  if (!inputs) return null;
  const v = (inputs as { visualSubStyle?: string | null }).visualSubStyle;
  return v != null && v !== '' ? v : null;
}

function getHookTextOfProject(p: SavedProject): string | null {
  // Projects may not carry copy text directly. Walk the same fields used by
  // the SavedProject card header (productName, then inputs fallback).
  return p.inputs?.productName || null;
}

// ─── MAPPERS ─────────────────────────────────────────────────────────────────

/**
 * Map a `GenerationRecord` to a unified `HistoryItem`. Generations always
 * count as `rendered` since they only exist after a render completes.
 */
function generationToItem(record: GenerationRecord): HistoryItem | null {
  const id = record.id;
  if (!id) return null;
  const ts = toMillis(record.timestamp);
  return {
    id,
    source: 'generation',
    timestamp: ts,
    thumbnailUrl: record.output?.imageUrl ?? null,
    hookText: getHookTextOfGen(record),
    hookAngle: getHookAngleOfGen(record),
    universe: getUniverseOfGen(record),
    artDirection: getArtDirectionOfGen(record),
    status: 'rendered',
    projectName: record.input?.productName ?? null,
    generationId: id,
    projectId: undefined,
  };
}

/**
 * Map a `SavedProject` to a unified `HistoryItem`. Status comes from the
 * project's persisted status (with safe fallback to 'draft'). Thumbnail
 * derives from `mockupHistory[0].url` so the card mirrors what the user
 * previously saved.
 */
function projectToItem(project: SavedProject): HistoryItem | null {
  if (!project.id) return null;
  const ts = typeof project.timestamp === 'number' ? project.timestamp : 0;
  const firstMockup = project.mockupHistory?.[0];
  const thumbnail = firstMockup?.url ?? project.thumbnailUrl ?? null;
  const status: HistoryItemStatus = project.status ?? 'draft';
  // Prefix the project id so it can never collide with a generation doc id —
  // both are unique within their own collection but the History grid needs
  // a single namespace.
  return {
    id: `project-${project.id}`,
    source: 'project',
    timestamp: ts,
    thumbnailUrl: thumbnail,
    hookText: getHookTextOfProject(project),
    hookAngle: getHookAngleOfProject(project),
    universe: getUniverseOfProject(project),
    artDirection: getArtDirectionOfProject(project),
    status,
    projectName: project.name ?? null,
    generationId: undefined,
    projectId: project.id,
  };
}

// ─── DEDUPLICATION + FILTERING ───────────────────────────────────────────────

/**
 * Build a deduplicated, time-sorted list of HistoryItems from a list of
 * generations + locally available saved projects.
 *
 * Dedup rule: if a project's first mockup URL matches a generation's image
 * URL, keep the generation (richer metadata) and drop the project duplicate.
 * This collapses the "old project + matching new generation" pair into one
 * card without losing the metadata.
 *
 * Projects whose workspace doesn't match the current scope are filtered out
 * at this stage (same pattern as useFavorites.ts).
 */
function buildItems(
  headItems: GenerationRecord[],
  tailItems: GenerationRecord[],
  savedProjects: SavedProject[] | undefined,
  useWorkspace: boolean
): HistoryItem[] {
  const out: HistoryItem[] = [];
  const seenIds = new Set<string>();

  // Generations first — they win on dedup collisions. Both the live head
  // snapshot and the paginated tail contribute; concatenating them in
  // (head first) order keeps the dedup deterministic.
  const generationImageUrls = new Set<string>();
  for (const r of headItems) {
    const item = generationToItem(r);
    if (!item) continue;
    seenIds.add(item.id);
    out.push(item);
    if (item.thumbnailUrl) generationImageUrls.add(item.thumbnailUrl);
  }
  for (const r of tailItems) {
    const item = generationToItem(r);
    if (!item) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    out.push(item);
    if (item.thumbnailUrl) generationImageUrls.add(item.thumbnailUrl);
  }

  if (savedProjects && savedProjects.length > 0) {
    for (const p of savedProjects) {
      // Workspace scope filter mirrors the generations path: personal-scope
      // MUST NOT see workspace-tagged records.
      if (!useWorkspace && p.workspaceId) continue;
      const item = projectToItem(p);
      if (!item) continue;
      if (seenIds.has(item.id)) continue;
      // Drop project entries whose thumbnail matches an existing
      // generation — the generation already represents the same render.
      if (item.thumbnailUrl && generationImageUrls.has(item.thumbnailUrl)) continue;
      seenIds.add(item.id);
      out.push(item);
    }
  }

  out.sort((a, b) => b.timestamp - a.timestamp);
  return out;
}

/**
 * Apply client-side filters with AND across categories and OR within each.
 * - Empty array for a category means "no filter on this category" (show all).
 * - A record that has no value for an active category is excluded — same
 *   behavior as a SQL `WHERE x IN (...)`.
 */
function applyHistoryFilters(
  items: HistoryItem[],
  filters: HistoryFilters | undefined
): HistoryItem[] {
  if (!filters) return items;
  const hookList = filters.hookAngle ?? [];
  const universeList = filters.universe ?? [];
  const artList = filters.artDirection ?? [];
  const statusList = filters.status ?? [];

  if (
    hookList.length === 0
    && universeList.length === 0
    && artList.length === 0
    && statusList.length === 0
  ) {
    return items;
  }

  const hookSet = new Set(hookList);
  const universeSet = new Set(universeList);
  const artSet = new Set(artList);
  const statusSet = new Set(statusList);

  return items.filter((it) => {
    if (hookSet.size > 0) {
      if (it.hookAngle == null || !hookSet.has(it.hookAngle)) return false;
    }
    if (universeSet.size > 0) {
      if (it.universe == null || !universeSet.has(it.universe)) return false;
    }
    if (artSet.size > 0) {
      if (it.artDirection == null || !artSet.has(it.artDirection)) return false;
    }
    if (statusSet.size > 0) {
      if (!statusSet.has(it.status)) return false;
    }
    return true;
  });
}

// ─── HOOK ───────────────────────────────────────────────────────────────────

export function useGenerationHistory({
  uid,
  workspaceId,
  filters,
  pageSize = DEFAULT_PAGE_SIZE,
  savedProjects,
}: UseGenerationHistoryOptions): GenerationHistoryResult {
  // Generations come from a paginated Firestore subscription (live + cursor).
  // We keep the underlying GenerationRecord[] around so future calls can
  // re-merge with the saved-projects list (which lives in App state and
  // changes independently of Firestore).
  const [headItems, setHeadItems] = useState<GenerationRecord[]>([]);
  const [tailItems, setTailItems] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const lastCursorRef = useRef<DocumentSnapshot | null>(null);
  // True once loadMore has been attempted at least once. Distinct from "tail
  // has visible rows" — a page can be fully filtered out and still advance
  // the cursor, so the next head snapshot must NOT rewind lastCursorRef.
  const tailAttemptedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  // Bumped on every resubscribe so any in-flight loadMore from a stale scope
  // (workspace change, uid change) cannot write back into the new state.
  const subscriptionTokenRef = useRef(0);

  const useWorkspace = !!workspaceId;
  const resolvedFilters = filters;

  // Step 1: merge generations (head + tail) with saved projects (dedup by
  //   imageUrl so a project + matching generation collapse to one card).
  // Step 2: time-sort.
  // Step 3: apply client-side filters.
  const items = useMemo<HistoryItem[]>(() => {
    const merged = buildItems(headItems, tailItems, savedProjects, useWorkspace);
    return applyHistoryFilters(merged, resolvedFilters);
  }, [headItems, tailItems, savedProjects, useWorkspace, resolvedFilters]);

  // Facets come from the MERGED pre-filter list so the dropdowns always
  // expose every universe / art-direction the user has ever produced, even
  // those currently hidden by an active filter.
  const facets = useMemo<{ universes: string[]; artDirections: string[] }>(() => {
    const merged = buildItems(headItems, tailItems, savedProjects, useWorkspace);
    const universes = new Set<string>();
    const artDirections = new Set<string>();
    for (const it of merged) {
      if (it.universe) universes.add(it.universe);
      if (it.artDirection) artDirections.add(it.artDirection);
    }
    return {
      universes: Array.from(universes).sort(),
      artDirections: Array.from(artDirections).sort(),
    };
  }, [headItems, tailItems, savedProjects, useWorkspace]);

  // totalCount is the count the user sees — derived from the same deduped +
  // filtered list so it never disagrees with the rendered rows.
  const totalCount = items.length;

  useEffect(() => {
    if (!uid) {
      subscriptionTokenRef.current += 1;
      setHeadItems([]);
      setTailItems([]);
      setLoading(false);
      setHasMore(false);
      lastCursorRef.current = null;
      tailAttemptedRef.current = false;
      return;
    }

    // Reset all pagination state on every resubscribe (uid / workspace change)
    // so cursors + tail pages from a previous scope cannot leak into a new one.
    subscriptionTokenRef.current += 1;
    setHeadItems([]);
    setTailItems([]);
    setLoading(true);
    setHasMore(false);
    lastCursorRef.current = null;
    tailAttemptedRef.current = false;

    let unsubscribe: Unsubscribe | null = null;

    // No-workspace scope client-side filter: Firestore would need a new
    // composite index to add `where('workspaceId','==', null)` to the query,
    // so we enforce "personal scope MUST NOT see workspace records" by
    // filtering the loaded page. Same pattern as useFavorites.ts.
    const scopeFilter = (records: GenerationRecord[]): GenerationRecord[] => {
      if (useWorkspace) return records;
      return records.filter((r) => {
        const ws = (r as GenerationRecord & { workspaceId?: string | null }).workspaceId;
        return ws == null;
      });
    };

    const applyHead = (raw: GenerationRecord[], lastDoc: DocumentSnapshot | null) => {
      const filtered = scopeFilter(raw);
      // Once pagination has started, a new head snapshot can include rows
      // that were never in the head before (new renders land). Rows that
      // were in the previous head but not in this one have just fallen out
      // of the live window — preserve them by moving them into the tail so
      // they remain visible to the user instead of vanishing.
      if (tailAttemptedRef.current) {
        setHeadItems((prevHead) => {
          const newIds = new Set<string>();
          for (const h of filtered) if (h.id) newIds.add(h.id);
          const displaced: GenerationRecord[] = [];
          for (const h of prevHead) {
            if (h.id && !newIds.has(h.id)) displaced.push(h);
          }
          if (displaced.length > 0) {
            setTailItems((prevTail) => {
              const tailIds = new Set<string>();
              for (const t of prevTail) if (t.id) tailIds.add(t.id);
              const toAdd = displaced.filter((d) => d.id && !tailIds.has(d.id));
              return toAdd.length > 0 ? [...prevTail, ...toAdd] : prevTail;
            });
          }
          return filtered;
        });
      } else {
        setHeadItems(filtered);
        lastCursorRef.current = lastDoc;
        // hasMore is computed off the RAW page length so pagination keeps
        // walking even when scope filtering reduces visible count.
        setHasMore(raw.length === pageSize);
      }
      setLoading(false);
    };

    try {
      const baseConstraints = useWorkspace
        ? [where('workspaceId', '==', workspaceId)]
        : [where('userId', '==', uid)];

      const q = query(
        collection(db, 'generations'),
        ...baseConstraints,
        where('output.phase', '==', 'render'),
        orderBy('timestamp', 'desc'),
        limit(pageSize)
      );

      unsubscribe = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          const raw = snap.docs.map(
            (d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord)
          );
          const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
          applyHead(raw, lastDoc);
        },
        async () => {
          // Fallback: drop the phase filter to dodge a missing composite index
          // (matches useFavorites fallback strategy). Filter phase in memory.
          try {
            const fallbackQ = query(
              collection(db, 'generations'),
              ...baseConstraints,
              orderBy('timestamp', 'desc'),
              limit(FALLBACK_PAGE_SIZE)
            );
            unsubscribe = onSnapshot(
              fallbackQ,
              { includeMetadataChanges: true },
              (snap) => {
                const raw = snap.docs
                  .map((d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord))
                  .filter((r: GenerationRecord) => r.output?.phase === 'render');
                const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
                if (tailAttemptedRef.current) {
                  setHeadItems((prevHead) => {
                    const filtered = scopeFilter(raw);
                    const newIds = new Set<string>();
                    for (const h of filtered) if (h.id) newIds.add(h.id);
                    const displaced: GenerationRecord[] = [];
                    for (const h of prevHead) {
                      if (h.id && !newIds.has(h.id)) displaced.push(h);
                    }
                    if (displaced.length > 0) {
                      setTailItems((prevTail) => {
                        const tailIds = new Set<string>();
                        for (const t of prevTail) if (t.id) tailIds.add(t.id);
                        const toAdd = displaced.filter((d) => d.id && !tailIds.has(d.id));
                        return toAdd.length > 0 ? [...prevTail, ...toAdd] : prevTail;
                      });
                    }
                    return filtered;
                  });
                } else {
                  applyHead(raw, lastDoc);
                  setHasMore(raw.length === FALLBACK_PAGE_SIZE);
                }
                setLoading(false);
              },
              () => {
                // Non-blocking: log a sanitized warning so index/rules/connectivity
                // failures are diagnosable without exposing identifiers.
                console.warn('useGenerationHistory: fallback listener failed', {
                  scope: useWorkspace ? 'workspace' : 'personal'
                });
                setLoading(false);
              }
            );
          } catch (err) {
            console.warn('useGenerationHistory: fallback subscription failed', {
              scope: useWorkspace ? 'workspace' : 'personal',
              err
            });
            setLoading(false);
          }
        }
      );
    } catch (err) {
      console.warn('useGenerationHistory: primary subscription failed', {
        scope: useWorkspace ? 'workspace' : 'personal',
        err
      });
      setHeadItems([]);
      setLoading(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [uid, workspaceId, useWorkspace, pageSize]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || !uid) return;
    const myToken = subscriptionTokenRef.current;
    const stillFresh = () => subscriptionTokenRef.current === myToken;

    loadingMoreRef.current = true;
    setLoading(true);
    // Mark pagination as attempted BEFORE the first network call so a page
    // that yields no visible rows still flips the head/tail handoff into
    // "preserve displaced rows" mode for subsequent live snapshots.
    tailAttemptedRef.current = true;

    try {
      if (!lastCursorRef.current) {
        if (stillFresh()) setLoading(false);
        return;
      }

      const baseConstraints = useWorkspace
        ? [where('workspaceId', '==', workspaceId)]
        : [where('userId', '==', uid)];

      const scopeFilter = (records: GenerationRecord[]): GenerationRecord[] => {
        if (useWorkspace) return records;
        return records.filter((r) => {
          const ws = (r as GenerationRecord & { workspaceId?: string | null }).workspaceId;
          return ws == null;
        });
      };

      try {
        const cursor: DocumentSnapshot | null = lastCursorRef.current;
        if (!cursor) {
          if (stillFresh()) setLoading(false);
          return;
        }
        const pageQ: Query<DocumentData> = query(
          collection(db, 'generations'),
          ...baseConstraints,
          where('output.phase', '==', 'render'),
          orderBy('timestamp', 'desc'),
          startAfter(cursor),
          limit(pageSize)
        );
        const snap: QuerySnapshot<DocumentData> = await getDocs(pageQ);
        if (!stillFresh()) return;
        if (snap.docs.length === 0) {
          setHasMore(false);
          return;
        }
        lastCursorRef.current = snap.docs[snap.docs.length - 1];
        const raw = snap.docs.map(
          (d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord)
        );
        const filtered = scopeFilter(raw);
        if (filtered.length > 0) {
          setTailItems(prev => [...prev, ...filtered]);
        }
        setHasMore(snap.docs.length === pageSize);
      } catch (primaryErr) {
        // Fallback path mirrors useFavorites: drop the phase filter and filter
        // in memory. Same cursor logic, larger page so a successful fallback
        // still surfaces enough rows to be useful.
        try {
          if (!stillFresh()) return;
          const cursor = lastCursorRef.current;
          if (!cursor) {
            if (stillFresh()) setLoading(false);
            return;
          }
          const fallbackQ = query(
            collection(db, 'generations'),
            ...baseConstraints,
            orderBy('timestamp', 'desc'),
            startAfter(cursor),
            limit(FALLBACK_PAGE_SIZE)
          );
          const fallbackSnap = await getDocs(fallbackQ);
          if (!stillFresh()) return;
          const raw = fallbackSnap.docs
            .map((d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord))
            .filter((r: GenerationRecord) => r.output?.phase === 'render');
          const filtered = scopeFilter(raw);
          if (filtered.length > 0) {
            setTailItems(prev => [...prev, ...filtered]);
          }
          if (fallbackSnap.docs.length > 0) {
            lastCursorRef.current = fallbackSnap.docs[fallbackSnap.docs.length - 1];
          }
          setHasMore(fallbackSnap.docs.length === FALLBACK_PAGE_SIZE);
        } catch (fallbackErr) {
          console.warn('useGenerationHistory: loadMore fallback failed', {
            scope: useWorkspace ? 'workspace' : 'personal',
            primaryErr, fallbackErr
          });
        }
      }
    } finally {
      loadingMoreRef.current = false;
      if (stillFresh()) setLoading(false);
    }
  }, [hasMore, uid, workspaceId, useWorkspace, pageSize]);

  return { items, facets, loading, hasMore, loadMore, totalCount };
}