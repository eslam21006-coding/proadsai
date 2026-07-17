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

const CACHE = new Map<string, UseHookAngleIconsResult["icons"]>();

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
            setState({ icons: cached, loading: false, error: null, bestAngles: [] });
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
                CACHE.set(cacheKey, data.icons);
                if (!cancelled) {
                    setState({
                        icons: data.icons,
                        loading: false,
                        error: null,
                        bestAngles: data.bestAngles ?? [],
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
