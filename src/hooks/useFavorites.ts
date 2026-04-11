// src/hooks/useFavorites.ts — real-time favorites subscription hook

import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot,
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
}

export function useFavorites({ phase, workspaceId }: UseFavoritesOptions): FavoritesResult {
  const [favorites, setFavorites] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      // Guard: no user — reset state and exit
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guard clause: reset on logout
      setFavorites([]); setLoading(false);
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
            setLoading(false);
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
                  setLoading(false);
                },
                () => {
                  setFavorites([]);
                  setLoading(false);
                }
              );
            } catch {
              setFavorites([]);
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

  return { favorites, loading };
}
