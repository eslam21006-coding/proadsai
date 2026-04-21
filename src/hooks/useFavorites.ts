// src/hooks/useFavorites.ts — real-time favorites subscription hook + pagination + connection-state

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db, auth } from '../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  getDocs, startAfter,
  type DocumentSnapshot, type Unsubscribe
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
}

const PAGE_SIZE = 100;
const FALLBACK_PAGE_SIZE = 200;

export function useFavorites({ phase, workspaceId }: UseFavoritesOptions): FavoritesResult {
  const [headItems, setHeadItems] = useState<GenerationRecord[]>([]);
  const [tailItems, setTailItems] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [connectionState, setConnectionState] = useState<'live' | 'stale'>('live');

  const lastCursorRef = useRef<DocumentSnapshot | null>(null);
  const tailNonEmptyRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const uid = auth.currentUser?.uid;

  // Head (live) merged with tail (paginated). Dedupe by id; head wins on collision
  // so live updates to items already in tail flow through to the rendered view.
  const favorites = useMemo(() => {
    if (tailItems.length === 0) return headItems;
    const headIds = new Set<string>();
    for (const r of headItems) if (r.id) headIds.add(r.id);
    const merged: GenerationRecord[] = [...headItems];
    for (const t of tailItems) {
      if (t.id && !headIds.has(t.id)) merged.push(t);
    }
    return merged;
  }, [headItems, tailItems]);

  useEffect(() => {
    if (!uid) {
      setHeadItems([]);
      setTailItems([]);
      setLoading(false);
      setHasMore(false);
      setConnectionState('live');
      lastCursorRef.current = null;
      tailNonEmptyRef.current = false;
      return;
    }

    // Reset pagination state on every resubscribe (phase or workspace change)
    setHeadItems([]);
    setTailItems([]);
    setHasMore(false);
    setLoading(true);
    lastCursorRef.current = null;
    tailNonEmptyRef.current = false;

    let unsubscribe: Unsubscribe | null = null;
    const useWorkspace = !!workspaceId;
    const scopeField = useWorkspace ? 'workspaceId' : 'userId';
    const scopeValue = useWorkspace ? workspaceId! : uid;

    try {
      const q = query(
        collection(db, 'generations'),
        where(scopeField, '==', scopeValue),
        where('feedback.savedToFavorites', '==', true),
        where('output.phase', '==', phase),
        orderBy('timestamp', 'desc'),
        limit(PAGE_SIZE)
      );

      unsubscribe = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          const records = snap.docs.map(
            (d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord)
          );
          setHeadItems(records);
          // Only advance the cursor off the head when no tail has been loaded yet;
          // once the user has paginated, loadMore owns the cursor so we don't
          // regress it when the live head refreshes.
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
              where(scopeField, '==', scopeValue),
              where('feedback.savedToFavorites', '==', true),
              orderBy('timestamp', 'desc'),
              limit(FALLBACK_PAGE_SIZE)
            );
            unsubscribe = onSnapshot(
              fallbackQ,
              { includeMetadataChanges: true },
              (snap) => {
                const records = snap.docs
                  .map((d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord))
                  .filter((r: GenerationRecord) => r.output?.phase === phase);
                setHeadItems(records);
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
            console.warn('useFavorites: fallback subscription failed', { scopeField, scopeValue, err });
            setConnectionState('stale');
            setLoading(false);
          }
        }
      );
    } catch (err) {
      console.warn('useFavorites: primary subscription failed', { scopeField, scopeValue, err });
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
    const scopeField = useWorkspace ? 'workspaceId' : 'userId';
    const scopeValue = useWorkspace ? workspaceId! : uid;

    try {
      const cursor = lastCursorRef.current;
      if (!cursor) {
        loadingMoreRef.current = false;
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, 'generations'),
        where(scopeField, '==', scopeValue),
        where('feedback.savedToFavorites', '==', true),
        where('output.phase', '==', phase),
        orderBy('timestamp', 'desc'),
        startAfter(cursor),
        limit(PAGE_SIZE)
      );

      const snap = await getDocs(q);
      const newRecords = snap.docs.map(
        (d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord)
      );

      if (newRecords.length > 0) {
        setTailItems(prev => [...prev, ...newRecords]);
        tailNonEmptyRef.current = true;
      }
      if (snap.docs.length > 0) {
        lastCursorRef.current = snap.docs[snap.docs.length - 1];
      }
      setHasMore(snap.docs.length === PAGE_SIZE);
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
          where(scopeField, '==', scopeValue),
          where('feedback.savedToFavorites', '==', true),
          orderBy('timestamp', 'desc'),
          startAfter(cursor),
          limit(FALLBACK_PAGE_SIZE)
        );
        const fallbackSnap = await getDocs(fallbackQ);
        const filtered = fallbackSnap.docs
          .map((d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord))
          .filter((r: GenerationRecord) => r.output?.phase === phase);

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
          scopeField,
          scopeValue,
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

  return { favorites, loading, hasMore, loadMore, connectionState };
}
