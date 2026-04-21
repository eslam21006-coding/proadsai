// src/hooks/useFavorites.ts — real-time favorites subscription hook + pagination + connection-state

import { useState, useEffect, useCallback, useRef } from 'react';
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

export function useFavorites({ phase, workspaceId }: UseFavoritesOptions): FavoritesResult {
  const [favorites, setFavorites] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [connectionState, setConnectionState] = useState<'live' | 'stale'>('live');
  const lastCursorRef = useRef<DocumentSnapshot | null>(null);
  const loadingMoreRef = useRef(false);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setFavorites([]);
      setLoading(false);
      setHasMore(false);
      setConnectionState('live');
      return;
    }

    let unsubscribe: Unsubscribe | null = null;

    const subscribe = () => {
      setLoading(true);
      const useWorkspace = !!workspaceId;
      const scopeField = useWorkspace ? 'workspaceId' : 'userId';
      const scopeValue = useWorkspace ? workspaceId : uid;

      try {
        const q = query(
          collection(db, 'generations'),
          where(scopeField, '==', scopeValue),
          where('feedback.savedToFavorites', '==', true),
          where('output.phase', '==', phase),
          orderBy('timestamp', 'desc'),
          limit(100)
        );

        unsubscribe = onSnapshot(
          q,
          (snap) => {
            const records = snap.docs.map(
              (d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord)
            );
            setFavorites(records);
            lastCursorRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
            setHasMore(snap.docs.length === 100);
            setLoading(false);
            setConnectionState('live');
          },
          async () => {
            try {
              const fallbackQ = query(
                collection(db, 'generations'),
                where(scopeField, '==', scopeValue),
                where('feedback.savedToFavorites', '==', true),
                orderBy('timestamp', 'desc'),
                limit(200)
              );
              unsubscribe = onSnapshot(
                fallbackQ,
                (snap) => {
                  const records = snap.docs
                    .map((d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord))
                    .filter((r: GenerationRecord) => r.output?.phase === phase);
                  setFavorites(records);
                  lastCursorRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
                  setHasMore(snap.docs.length === 200);
                  setLoading(false);
                  setConnectionState('live');
                },
                () => {
                  setConnectionState('stale');
                  setLoading(false);
                }
              );
            } catch {
              setConnectionState('stale');
              setLoading(false);
            }
          }
        );
      } catch {
        setFavorites([]);
        setLoading(false);
      }
    };

    subscribe();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [phase, workspaceId, uid]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || !uid) return;
    loadingMoreRef.current = true;
    setLoading(true);

    try {
      const useWorkspace = !!workspaceId;
      const scopeField = useWorkspace ? 'workspaceId' : 'userId';
      const scopeValue = useWorkspace ? workspaceId : uid;
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
        limit(100)
      );

      const snap = await getDocs(q);
      const newRecords = snap.docs.map(
        (d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord)
      );

      if (newRecords.length > 0) {
        setFavorites(prev => [...prev, ...newRecords]);
      }
      lastCursorRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : lastCursorRef.current;
      setHasMore(snap.docs.length === 100);
    } catch {
      try {
        const useWorkspace = !!workspaceId;
        const scopeField = useWorkspace ? 'workspaceId' : 'userId';
        const scopeValue = useWorkspace ? workspaceId : uid;
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
          limit(200)
        );
        const fallbackSnap = await getDocs(fallbackQ);
        const filtered = fallbackSnap.docs
          .map((d: DocumentSnapshot) => ({ id: d.id, ...d.data() } as GenerationRecord))
          .filter((r: GenerationRecord) => r.output?.phase === phase);

        if (filtered.length > 0) {
          setFavorites(prev => [...prev, ...filtered]);
        }
        lastCursorRef.current = fallbackSnap.docs.length > 0 ? fallbackSnap.docs[fallbackSnap.docs.length - 1] : lastCursorRef.current;
        setHasMore(fallbackSnap.docs.length === 200);
      } catch {
        // silent — pagination failed
      }
    } finally {
      loadingMoreRef.current = false;
      setLoading(false);
    }
  }, [phase, workspaceId, uid, hasMore]);

  return { favorites, loading, hasMore, loadMore, connectionState };
}
