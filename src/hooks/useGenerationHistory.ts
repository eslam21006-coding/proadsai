// src/hooks/useGenerationHistory.ts — paginated subscription hook for all rendered generations (Phase 26)

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db } from '../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  getDocs, startAfter,
  type DocumentSnapshot, type Query, type QuerySnapshot, type Unsubscribe, type DocumentData
} from 'firebase/firestore';
import type { GenerationRecord } from '../services/feedbackService';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface HistoryFilters {
  /** OR'd within the category — `['pain', 'curiosity']` matches either. Empty array = no filter. */
  hookAngle?: string[];
  /** OR'd within the category. Empty array = no filter. */
  universe?: string[];
  /** OR'd within the category. Empty array = no filter. */
  artDirection?: string[];
}

interface UseGenerationHistoryOptions {
  uid: string | null;
  workspaceId?: string | null;
  filters?: HistoryFilters;
  pageSize?: number;
}

interface GenerationHistoryResult {
  items: GenerationRecord[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  totalCount: number;
}

const DEFAULT_PAGE_SIZE = 20;
const FALLBACK_PAGE_SIZE = 40;

// ─── HELPER ─────────────────────────────────────────────────────────────────

/**
 * Resolve the universe identifier for filter matching. The frontend schema
 * documents `input.resolvedUniverse`, but legacy generations (and the
 * `saveGeneration` write path on the backend) actually persist the universe
 * under `input.tone`. Read both so the history view filters correctly across
 * every persisted record.
 */
function getUniverseOf(record: GenerationRecord): string | null {
  const input = (record as GenerationRecord).input;
  if (!input) return null;
  const direct = (input as { resolvedUniverse?: string | null }).resolvedUniverse;
  if (direct != null && direct !== '') return direct;
  if (input.tone != null && input.tone !== '') return input.tone;
  return null;
}

function getHookAngleOf(record: GenerationRecord): string | null {
  const input = (record as GenerationRecord).input;
  if (!input) return null;
  const v = (input as { coldHookAngle?: string | null }).coldHookAngle;
  return v != null && v !== '' ? v : null;
}

function getArtDirectionOf(record: GenerationRecord): string | null {
  const input = (record as GenerationRecord).input;
  if (!input) return null;
  const v = input.visualSubStyle;
  return v != null && v !== '' ? v : null;
}

/**
 * Apply client-side filters with AND across categories and OR within each.
 * - Empty array for a category means "no filter on this category" (show all).
 * - A record that has no value for a filtered category matches nothing under
 *   that category, so it is excluded — same behavior as a SQL `WHERE x IN (...)`.
 */
function applyHistoryFilters(
  records: GenerationRecord[],
  filters: HistoryFilters | undefined
): GenerationRecord[] {
  if (!filters) return records;
  const hookList = filters.hookAngle ?? [];
  const universeList = filters.universe ?? [];
  const artList = filters.artDirection ?? [];

  if (hookList.length === 0 && universeList.length === 0 && artList.length === 0) {
    return records;
  }

  const hookSet = new Set(hookList);
  const universeSet = new Set(universeList);
  const artSet = new Set(artList);

  return records.filter((r) => {
    if (hookSet.size > 0) {
      const v = getHookAngleOf(r);
      if (v == null || !hookSet.has(v)) return false;
    }
    if (universeSet.size > 0) {
      const v = getUniverseOf(r);
      if (v == null || !universeSet.has(v)) return false;
    }
    if (artSet.size > 0) {
      const v = getArtDirectionOf(r);
      if (v == null || !artSet.has(v)) return false;
    }
    return true;
  });
}

// ─── HOOK ───────────────────────────────────────────────────────────────────

export function useGenerationHistory({
  uid,
  workspaceId,
  filters,
  pageSize = DEFAULT_PAGE_SIZE
}: UseGenerationHistoryOptions): GenerationHistoryResult {
  const [headItems, setHeadItems] = useState<GenerationRecord[]>([]);
  const [tailItems, setTailItems] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const lastCursorRef = useRef<DocumentSnapshot | null>(null);
  const tailNonEmptyRef = useRef(false);
  const loadingMoreRef = useRef(false);
  // Bumped on every resubscribe so any in-flight loadMore from a stale scope
  // (workspace change, uid change) cannot write back into the new state.
  const subscriptionTokenRef = useRef(0);

  const useWorkspace = !!workspaceId;
  const resolvedFilters = filters;

  // Head + tail merge with dedup by id, head winning on collision so live
  // updates to records already in the static tail flow through to the view.
  const items = useMemo(() => {
    const headIds = new Set<string>();
    const merged: GenerationRecord[] = [];
    for (const h of headItems) {
      if (h.id) {
        merged.push(h);
        headIds.add(h.id);
      }
    }
    for (const t of tailItems) {
      if (t.id && !headIds.has(t.id)) {
        merged.push(t);
      }
    }
    return applyHistoryFilters(merged, resolvedFilters);
  }, [headItems, tailItems, resolvedFilters]);

  const totalCount = useMemo(
    () => applyHistoryFilters([...headItems, ...tailItems], resolvedFilters).length,
    [headItems, tailItems, resolvedFilters]
  );

  useEffect(() => {
    if (!uid) {
      subscriptionTokenRef.current += 1;
      setHeadItems([]);
      setTailItems([]);
      setLoading(false);
      setHasMore(false);
      lastCursorRef.current = null;
      tailNonEmptyRef.current = false;
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
    tailNonEmptyRef.current = false;

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
          setHeadItems(scopeFilter(raw));
          if (!tailNonEmptyRef.current) {
            lastCursorRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
            // hasMore is computed off the RAW page length so pagination keeps
            // walking even when scope filtering reduces visible count.
            setHasMore(snap.docs.length === pageSize);
          }
          setLoading(false);
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
                setHeadItems(scopeFilter(raw));
                if (!tailNonEmptyRef.current) {
                  lastCursorRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
                  setHasMore(snap.docs.length === FALLBACK_PAGE_SIZE);
                }
                setLoading(false);
              },
              () => {
                setLoading(false);
              }
            );
          } catch (err) {
            console.warn('useGenerationHistory: fallback subscription failed', {
              useWorkspace, workspaceId, uid, err
            });
            setLoading(false);
          }
        }
      );
    } catch (err) {
      console.warn('useGenerationHistory: primary subscription failed', {
        useWorkspace, workspaceId, uid, err
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
          tailNonEmptyRef.current = true;
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
            tailNonEmptyRef.current = true;
          }
          if (fallbackSnap.docs.length > 0) {
            lastCursorRef.current = fallbackSnap.docs[fallbackSnap.docs.length - 1];
          }
          setHasMore(fallbackSnap.docs.length === FALLBACK_PAGE_SIZE);
        } catch (fallbackErr) {
          console.warn('useGenerationHistory: loadMore fallback failed', {
            useWorkspace, workspaceId, uid,
            lastCursorId: lastCursorRef.current?.id ?? null,
            primaryErr, fallbackErr
          });
        }
      }
    } finally {
      loadingMoreRef.current = false;
      if (stillFresh()) setLoading(false);
    }
  }, [hasMore, uid, workspaceId, useWorkspace, pageSize]);

  return { items, loading, hasMore, loadMore, totalCount };
}