// functions/src/copyDiversity.ts
// ═══════════════════════════════════════════════════════════════════════════
// PHASE 23 — 23.B / 23.C diversity engine
// Implements specs/_shared/COPY_SYSTEM_REFERENCE.md §16/§17 — edit the
// reference first, then sync.
// ═══════════════════════════════════════════════════════════════════════════
// Pure helpers shared by the single-hook (23.B) and carousel (23.C) paths:
//   - makeProjectSeed: stable per-user, per-project, per-day seed
//   - biasByMemory:    down-weights (never bans) recently used ids
//   - drawDimensions:  4-of-N from ANGLE_DIMENSION_POOLS with bias
//   - drawOpenings:    4-of-7 OPENING_STRUCTURES with bias
//
// All helpers are deterministic and side-effect free. Bias NEVER bans: if
// every option is in the recent window, the LEAST-recently-used option
// wins. Four hooks / a complete carousel are always returned (SC-008).
// ═══════════════════════════════════════════════════════════════════════════

import {
    drawDimensions as _drawDimensions,
    drawOpenings as _drawOpenings,
} from "./knowledge/hookAnglesKnowledge.js";
import { getRecentFingerprints, type AngleFingerprint } from "./creativeMemory.js";
import type { DimensionEntry, OpeningStructure } from "./knowledge/hookAnglesKnowledge.js";

// Re-export the types and the dimension/opening drawers so call-sites only
// need to import from copyDiversity.ts.
export type { AngleFingerprint, DimensionEntry, OpeningStructure };
export { _drawDimensions as drawDimensions, _drawOpenings as drawOpenings };

// ─── Make a stable per-project seed ──────────────────────────────────────────
//
// `userId + projectId + angleKey` is hashed and the timestamp is truncated
// to the current UTC day. The result is a 32-bit unsigned int that is
// stable across replays of the same project on the same day (so retried
// generations don't reshuffle dimensions) but flips when the calendar day
// rolls over. This is the same per-day-rotation discipline the product
// owner specified in spec clarification Q3 (recent ~10 projects = a few
// days of activity).
export function makeProjectSeed(userId?: string | null, projectId?: string | null, angleKey?: string | null): number {
    const day = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const seedStr = `${userId || "anon"}|${projectId || "default"}|${angleKey || "any"}|${day}`;
    return stringHash32(seedStr);
}

function stringHash32(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

// ─── Down-weight recent ids, never ban ────────────────────────────────────────
//
// Pure function. `recentIds` is treated as FIFO recency — index 0 is the
// oldest recent entry, the last entry is the most recent (strongest
// down-weight). Returns a stable order with the least-recent first.
export function biasByMemory<T extends { id: string }>(
    candidates: readonly T[],
    recentIds: readonly string[],
): T[] {
    if (recentIds.length === 0 || candidates.length === 0) return candidates.slice();
    const recencyScore = new Map<string, number>();
    // Score = position+1: oldest (index 0) gets the lowest score (1), most
    // recent gets the highest. The subsequent ascending sort by `ra - rb`
    // then places the LEAST-recent (lowest score) items first — which is
    // the bias we want. (Previously `recentIds.length - i` produced the
    // opposite: most-recent scored highest, so they sorted first.)
    for (let i = 0; i < recentIds.length; i++) {
        recencyScore.set(recentIds[i]!, i + 1);
    }
    return candidates.slice().sort((a, b) => {
        const ra = recencyScore.get(a.id) || 0;
        const rb = recencyScore.get(b.id) || 0;
        if (ra === rb) return 0;
        return ra - rb; // least-recent (lowest score) first
    });
}

// ─── Asynchronously fetch recent fingerprints for a user+angle ───────────────
//
// Non-blocking wrapper around creativeMemory. If the call fails (cold
// start, network blip, etc.) we return [] so the seed/rotation path
// proceeds with no bias. Generation MUST NOT fail because of memory.
export async function getRecentFingerprintsForRotation(
    userId: string | null | undefined,
    angleKey: string,
    limit: number = 10,
): Promise<AngleFingerprint[]> {
    if (!userId) return [];
    try {
        // Over-fetch then filter by angleKey in memory so single-hook recents and
        // carousel recents don't cross-contaminate (avoids a composite Firestore
        // index on angleKey+timestamp). Bias-never-ban still holds downstream.
        const all = await getRecentFingerprints(userId, limit * 4);
        // Firestore returns newest-first. Take the latest `limit` matches
        // first (slice BEFORE reverse, otherwise we'd return the oldest
        // `limit` entries from the window — opposite of what the caller
        // wants). The downstream drawer treats index 0 as the oldest entry
        // (FIFO), so reverse the trimmed window before returning.
        return all
            .filter((f) => f.angleKey === angleKey)
            .slice(0, limit)
            .reverse();
    } catch (e) {
        console.warn("⚠️ getRecentFingerprintsForRotation failed (non-blocking):", e);
        return [];
    }
}
