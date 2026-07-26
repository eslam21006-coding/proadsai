// src/hooks/useHookAngleIcons.ts
// Phase 14 Layer 6 — fetches the hook-angle performance icon map
// from the backend getHookAnglePerformance callable. Cached per
// (workspaceId, accountId) pair.

import { useEffect, useState } from "react";
import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

export interface HookAngleIconEntry {
    icon: "🔥" | "✅" | "⚠️" | null;
    tooltipAr: string | null;
}

export interface UseHookAngleIconsResult {
    icons: Record<string, HookAngleIconEntry> | null;
    loading: boolean;
    error: string | null;
    bestAngles: Array<{ angleKey: string; nameAr: string }>;
}

// Cache stores the full payload (icons + bestAngles). On hit,
// both fields are restored so consumers that depend on bestAngles
// (e.g. the ⚠️ tooltip suggestion list) do not see an empty array.
// Note: the cache is never invalidated on its own — a follow-up
// call to `invalidateHookAngleIconsCache()` is required after a Meta
// sync (or any action that changes the underlying aggregates).
interface CachedHookAnglePayload {
    icons: UseHookAngleIconsResult["icons"];
    bestAngles: UseHookAngleIconsResult["bestAngles"];
}
const CACHE = new Map<string, CachedHookAnglePayload>();

/**
 * Drop every cached entry. Call after handleSyncMeta so the next
 * dashboard mount fetches fresh icons instead of serving stale data.
 */
export function invalidateHookAngleIconsCache(): void {
    CACHE.clear();
}

export function useHookAngleIcons(
    workspaceId: string | null,
    accountId: string | null,
): UseHookAngleIconsResult {
    const [state, setState] = useState<UseHookAngleIconsResult>({
        icons: null,
        loading: false,
        error: null,
        bestAngles: [],
    });

    useEffect(() => {
        if (!workspaceId || !accountId) {
            setState({ icons: null, loading: false, error: null, bestAngles: [] });
            return;
        }
        const cacheKey = `${workspaceId}::${accountId}`;
        const cached = CACHE.get(cacheKey);
        if (cached) {
            setState({
                icons: cached.icons,
                loading: false,
                error: null,
                bestAngles: cached.bestAngles,
            });
            return;
        }
        let cancelled = false;
        setState({ icons: null, loading: true, error: null, bestAngles: [] });
        (async () => {
            try {
                const fn = httpsCallable(functions, "getHookAnglePerformance");
                const res = await fn({ workspaceId, accountId });
                const data = res.data as {
                    icons: Record<string, HookAngleIconEntry>;
                    bestAngles: Array<{ angleKey: string; nameAr: string }>;
                };
                const payload: CachedHookAnglePayload = {
                    icons: data.icons,
                    bestAngles: data.bestAngles ?? [],
                };
                CACHE.set(cacheKey, payload);
                if (!cancelled) {
                    setState({
                        icons: payload.icons,
                        loading: false,
                        error: null,
                        bestAngles: payload.bestAngles,
                    });
                }
            } catch (e) {
                if (!cancelled) {
                    setState({
                        icons: null,
                        loading: false,
                        error: (e as Error).message ?? "unknown",
                        bestAngles: [],
                    });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [workspaceId, accountId]);

    return state;
}
