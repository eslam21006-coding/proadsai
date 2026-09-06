// functions/src/learning/learningPerAdLoop.ts — pure per-ad decision for the worker (Batch 09)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, T028 (Batch 09) — extract the per-ad block of
// `runSyncForAccount` into a pure function. The worker calls
// `decidePerAdActionsForWorker(ad, match, existingData, failedLedgerReads,
// creativeKeyByAdId, metrics, ...)`; the function resolves the per-ad
// worker context into `decideAdWriteActions` inputs and returns the
// decision.
//
// This is the level the owner demanded for the T021a discriminator
// (Batch 07 review finding 1): a test that exercises the code path
// `shared.ts` runs, with `shared.ts` deciding the `creativeKey`.
// Before T021a's wire-up, `creativeKeyByAdId` was empty and the
// per-row fallback gave every ad its own creative key. After the
// wire-up, `groupIntoCreatives` populates the map with the actual
// creative key. The discriminator test drives this function with both
// maps and observes the worker's actual output.
//
// Prior refactors (Batch 07's `decideAdWriteActions`, Batch 08's
// `shared.ts` switch) wrapped the per-ad decision logic in a pure
// helper. This module wraps the per-ad CONTEXT RESOLUTION — the parts
// that were inline in `shared.ts` after Batch 08 — so the test can
// drive them.

import type { AdDoc } from "../metaSync/shared.js";
import {
    decideAdWriteActions,
    type PerAdActionsResult,
    type PerAdVaryingInputs,
} from "./decideAdWriteActions.js";
import type { AdForLearning } from "../learningAggregates.js";
import { groupIntoCreatives } from "./creativeGrouping.js";
import type { MatchCandidate } from "../perceptualHash.js";

/**
 * The input to `resolveCreativeKeyByAdId` — exactly the projection
 * `shared.ts` passes to `groupIntoCreatives`. Tests can drive this
 * with the same inputs the worker uses and observe the per-creative
 * map the worker builds.
 */
export interface CreativeGroupingInput {
    adId: string;
    imageHash: string | null;
    generationId: string | null;
    matchType: "auto_hash" | "manual" | null;
    linkProvenance: "manual" | "direct_auto" | "propagated" | null;
}

/**
 * Build the per-creative map the worker uses. This is exactly the
 * logic `shared.ts` runs before the per-ad loop:
 *   1. `groupIntoCreatives(ads)` returns `CreativeGroup[]`.
 *   2. For each group, for each row, set `creativeKeyByAdId.set(row.adId, group.creativeKey)`.
 *
 * Tests drive this with the same inputs the worker uses and observe
 * the per-creative map. The discriminator test verifies all 55 ads
 * share the same key (per-creative aggregation, FR-073).
 */
export function resolveCreativeKeyByAdId(
    ads: ReadonlyArray<CreativeGroupingInput>,
): Map<string, string> {
    const out = new Map<string, string>();
    try {
        const groups = groupIntoCreatives(ads as any); // ReadonlyArray → mutable
        for (const group of groups) {
            for (const row of group.rows) {
                out.set(row.adId, group.creativeKey);
            }
        }
    } catch {
        // Per-row fallback: empty map, `ad.id` is the per-ad block's
        // safety net.
    }
    return out;
}

/**
 * The per-ad worker context. The worker assembles this from its
 * several pre-pass outputs (the bounded read, the match candidates,
 * the per-creative grouping) and passes it to the function.
 */
export interface PerAdWorkerContext {
    /** The ad's `creativeKey` resolved from the per-creative
     * grouping. `creativeKeyByAdId.get(ad.id)` IS the resolution —
     * the worker computes that map and passes the per-ad value. */
    creativeKey: string;
    /** Whether the bounded-read chunk containing this ad failed. */
    ledgerReadFailed: boolean;
    /** The existing adPerformance doc (undefined for first-ever syncs
     * or failed reads). */
    existingData: Partial<AdDoc> | undefined;
    /** Whether the existing record is cascade-marked. */
    keepMetadataUnavailable: boolean;
    /** Whether the match candidate is ambiguous. */
    matchAmbiguous: boolean;
}

export interface PerAdWorkerInputs {
    adId: string;
    /** Resolved creativeKey. The test supplies the per-row fallback
     * (`ad.id`) BEFORE the wire-up and the real key AFTER. */
    creativeKey: string;
    /** The post-pass-resolved hookAngle. The worker fills this in
     * after `groupIntoCreatives` patches `learnedAds[i].hookAngle`. */
    resolvedHookAngle: string | null;
    /** The post-pass-resolved patternKey. Same lifecycle. */
    resolvedPatternKey: string | null;
    match: PerAdVaryingInputs["match"];
    existingData: Partial<AdDoc> | undefined;
    ledgerReadFailed: boolean;
    matchAmbiguous: boolean;
    keepMetadataUnavailable: boolean;
    /** The varying inputs (metrics, ctx, objective, etc.). */
    varying: PerAdVaryingInputs;
}

export interface PerAdWorkerResult {
    decision: PerAdActionsResult;
    /** Which tally counter (`matched` / `ambiguous` / `unmatched`)
     * the worker should increment. */
    tally: "matched" | "ambiguous" | "unmatched";
}

/**
 * Pure function: given the per-ad worker context and varying inputs,
 * resolve them into `decideAdWriteActions` and return the result +
 * tally. The worker applies the side effects (writes.push,
 * learnedAds.push, counter increments) from the result.
 *
 * The function is what `shared.ts`'s per-ad block reduces to. Tests
 * can drive it with both the BEFORE (creativeKey=ad.id) and AFTER
 * (creativeKey=groupIntoCreatives(ads).get(ad.id)) states and observe
 * the per-creative property (FR-073): 55 rows in one creative must
 * produce `creativeCount === 1`, not 55.
 */
export function decidePerAdActionsForWorker(
    inputs: PerAdWorkerInputs,
): PerAdWorkerResult {
    const decision = decideAdWriteActions(
        {
            adId: inputs.adId,
            creativeKey: inputs.creativeKey,
            resolvedHookAngle: inputs.resolvedHookAngle,
            resolvedPatternKey: inputs.resolvedPatternKey,
            ledgerReadFailed: inputs.ledgerReadFailed,
            matchAmbiguous: inputs.matchAmbiguous,
            existingData: inputs.existingData,
            keepMetadataUnavailable: inputs.keepMetadataUnavailable,
        },
        inputs.varying,
    );

    // Tally: which bucket does this ad increment? Mirrors the
    // pre-Batch-08 inline logic in shared.ts.
    const genId = decision.adDoc.generationId ?? null;
    const matchType = decision.adDoc.matchType ?? null;
    let tally: "matched" | "ambiguous" | "unmatched";
    if (genId && (matchType === "auto_hash" || matchType === "manual")) {
        tally = "matched";
    } else if (inputs.matchAmbiguous) {
        tally = "ambiguous";
    } else {
        tally = "unmatched";
    }

    return { decision, tally };
}
