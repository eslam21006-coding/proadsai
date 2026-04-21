// src/hooks/useFavorites.ts — real-time favorites subscription hook + pagination + connection-state

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db, auth } from '../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  getDocs, startAfter,
  type DocumentSnapshot, type Query, type QuerySnapshot, type Unsubscribe, type DocumentData
} from 'firebase/firestore';
import type { GenerationRecord } from '../services/feedbackService';

type Phase = 'hooks' | 'concepts' | 'render' | 'caption';

interface UseFavoritesOptions {
  phase: Phase;
  workspaceId?: string | null;
}

interface FavoritesResult {
  favorites: GenerationRecord[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  connectionState: 'live' | 'stale';
  markRemovedInList: (id: string) => void;
}

const PAGE_SIZE = 100;
const FALLBACK_PAGE_SIZE = 200;

export function useFavorites({ phase, workspaceId }: UseFavoritesOptions): FavoritesResult {
  const [headItems, setHeadItems] = useState<GenerationRecord[]>([]);
  const [tailItems, setTailItems] = useState<GenerationRecord[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [connectionState, setConnectionState] = useState<'live' | 'stale'>('live');

  const lastCursorRef = useRef<DocumentSnapshot | null>(null);
  const tailNonEmptyRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const uid = auth.currentUser?.uid;

  // Head (live) merged with tail (paginated). Dedupe by id; head wins on collision
  // so live updates to items already in tail flow through to the rendered view.
  // `removedIds` provides an optimistic-removal escape hatch so consumers can
  // drop items from the rendered list immediately after calling toggleFavorite(id,false)
  // — needed because the static tail won't self-heal via onSnapshot.
  const favorites = useMemo(() => {
    const headIds = new Set<string>();
    const mergedHead: GenerationRecord[] = [];
    for (const h of headItems) {
      if (h.id && !removedIds.has(h.id)) {
        mergedHead.push(h);
        headIds.add(h.id);
      }
    }
    if (tailItems.length === 0) return mergedHead;
    const mergedTail: GenerationRecord[] = [];
    for (const t of tailItems) {
      if (t.id && !removedIds.has(t.id) && !headIds.has(t.id)) {
        mergedTail.push(t);
      }
    }
    return [...mergedHead, ...mergedTail];
  }, [headItems, tailItems, removedIds]);

  const markRemovedInList = useCallback((id: string) => {
    setRemovedIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Self-heal: if an id in `removedIds` re-appears in the live head or in a
  // fresh tail fetch, drop it from the set so the record becomes visible
  // again. Covers the re-bookmark-after-remove flow and any remote revert.
  useEffect(() => {
    setRemovedIds(prev => {
      if (prev.size === 0) return prev;
      const liveIds = new Set<string>();
      for (const h of headItems) if (h.id) liveIds.add(h.id);
      for (const t of tailItems) if (t.id) liveIds.add(t.id);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (liveIds.has(id)) { changed = true; continue; }
        next.add(id);
      }
      return changed ? next : prev;
    });
  }, [headItems, tailItems]);

  useEffect(() => {
    if (!uid) {
      setHeadItems([]);
      setTailItems([]);
      setRemovedIds(new Set());
      setLoading(false);
      setHasMore(false);
      setConnectionState('live');
      lastCursorRef.current = null;
      tailNonEmptyRef.current = false;
      return;
    }

    // Reset all state on every resubscribe (phase or workspace change) so
    // pagination cursors, removed-id optimism, and tail pages from the prior
    // scope don't leak into the new scope.
    setHeadItems([]);
    setTailItems([]);
    setRemovedIds(new Set());
    setHasMore(false);
    setLoading(true);
    lastCursorRef.current = null;
    tailNonEmptyRef.current = false;

    let unsubscribe: Unsubscribe | null = null;
    const useWorkspace = !!workspaceId;

    // Client-side post-filter for the "no workspace" scope: Firestore would
    // need a new composite index to add `where('workspaceId','==', null)` to
    // the query, so we enforce FR-009 (workspace-owned records MUST NOT appear
    // in personal scope) by filtering the loaded page. The head is bounded to
    // 100 docs, so the filter cost is trivial.
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
        where('feedback.savedToFavorites', '==', true),
        where('output.phase', '==', phase),
        orderBy('timestamp', 'desc'),
        limit(PAGE_SIZE)
      );

      unsubscribe = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          const raw = snap.docs.map(
            (d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord)
          );
          setHeadItems(scopeFilter(raw));
          // Only advance the cursor off the head when no tail has been loaded yet;
          // once the user has paginated, loadMore owns the cursor so we don't
          // regress it when the live head refreshes. `hasMore` is computed off
          // the RAW page length (not the filtered length) so pagination keeps
          // walking even when scope-filtered items reduce visible count.
          if (!tailNonEmptyRef.current) {
            lastCursorRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
            setHasMore(snap.docs.length === PAGE_SIZE);
          }
          setLoading(false);
          setConnectionState(snap.metadata.fromCache ? 'stale' : 'live');
        },
        async () => {
          try {
            const fallbackQ = query(
              collection(db, 'generations'),
              ...baseConstraints,
              where('feedback.savedToFavorites', '==', true),
              orderBy('timestamp', 'desc'),
              limit(FALLBACK_PAGE_SIZE)
            );
            unsubscribe = onSnapshot(
              fallbackQ,
              { includeMetadataChanges: true },
              (snap) => {
                const raw = snap.docs
                  .map((d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord))
                  .filter((r: GenerationRecord) => r.output?.phase === phase);
                setHeadItems(scopeFilter(raw));
                if (!tailNonEmptyRef.current) {
                  lastCursorRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
                  setHasMore(snap.docs.length === FALLBACK_PAGE_SIZE);
                }
                setLoading(false);
                setConnectionState(snap.metadata.fromCache ? 'stale' : 'live');
              },
              () => {
                setConnectionState('stale');
                setLoading(false);
              }
            );
          } catch (err) {
            console.warn('useFavorites: fallback subscription failed', { useWorkspace, workspaceId, uid, err });
            setConnectionState('stale');
            setLoading(false);
          }
        }
      );
    } catch (err) {
      console.warn('useFavorites: primary subscription failed', { useWorkspace, workspaceId, uid, err });
      setHeadItems([]);
      setLoading(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [phase, workspaceId, uid]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || !uid) return;
    loadingMoreRef.current = true;
    setLoading(true);

    const useWorkspace = !!workspaceId;
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
      if (!lastCursorRef.current) {
        loadingMoreRef.current = false;
        setLoading(false);
        return;
      }

      // Keep fetching pages until we've accumulated PAGE_SIZE visible items
      // (after client-side scope filtering) OR Firestore returns a short page
      // (tail exhausted). Hard cap on iterations protects against runaway loops
      // when the scope filter rejects everything in a very large history.
      const MAX_ITERATIONS = 5;
      const accumulated: GenerationRecord[] = [];
      let exhausted = false;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const cursor: DocumentSnapshot | null = lastCursorRef.current;
        if (!cursor) { exhausted = true; break; }
        const pageQ: Query<DocumentData> = query(
          collection(db, 'generations'),
          ...baseConstraints,
          where('feedback.savedToFavorites', '==', true),
          where('output.phase', '==', phase),
          orderBy('timestamp', 'desc'),
          startAfter(cursor),
          limit(PAGE_SIZE)
        );
        const snap: QuerySnapshot<DocumentData> = await getDocs(pageQ);
        if (snap.docs.length === 0) { exhausted = true; break; }
        lastCursorRef.current = snap.docs[snap.docs.length - 1];
        const raw = snap.docs.map(
          (d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord)
        );
        accumulated.push(...scopeFilter(raw));
        if (snap.docs.length < PAGE_SIZE) { exhausted = true; break; }
        if (accumulated.length >= PAGE_SIZE) break;
      }

      if (accumulated.length > 0) {
        setTailItems(prev => [...prev, ...accumulated]);
        tailNonEmptyRef.current = true;
      }
      setHasMore(!exhausted);
    } catch (primaryErr) {
      try {
        const cursor = lastCursorRef.current;
        if (!cursor) {
          loadingMoreRef.current = false;
          setLoading(false);
          return;
        }

        const fallbackQ = query(
          collection(db, 'generations'),
          ...baseConstraints,
          where('feedback.savedToFavorites', '==', true),
          orderBy('timestamp', 'desc'),
          startAfter(cursor),
          limit(FALLBACK_PAGE_SIZE)
        );
        const fallbackSnap = await getDocs(fallbackQ);
        const rawFiltered = fallbackSnap.docs
          .map((d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord))
          .filter((r: GenerationRecord) => r.output?.phase === phase);
        const filtered = scopeFilter(rawFiltered);

        if (filtered.length > 0) {
          setTailItems(prev => [...prev, ...filtered]);
          tailNonEmptyRef.current = true;
        }
        if (fallbackSnap.docs.length > 0) {
          lastCursorRef.current = fallbackSnap.docs[fallbackSnap.docs.length - 1];
        }
        setHasMore(fallbackSnap.docs.length === FALLBACK_PAGE_SIZE);
      } catch (fallbackErr) {
        console.warn('useFavorites: loadMore pagination failed', {
          useWorkspace,
          workspaceId,
          uid,
          lastCursorId: lastCursorRef.current?.id ?? null,
          primaryErr,
          fallbackErr,
        });
      }
    } finally {
      loadingMoreRef.current = false;
      setLoading(false);
    }
  }, [phase, workspaceId, uid, hasMore]);

  return { favorites, loading, hasMore, loadMore, connectionState, markRemovedInList };
}
