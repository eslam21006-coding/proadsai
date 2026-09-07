// functions/src/learning/decideAdWriteActions.ts — per-ad pure decision function (Batch 07)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, T028 — extract the per-ad learning section of `runSyncForAccount`
// into a pure function. The worker calls it once per ad; it returns
// everything the worker would have done inline.
//
// Per Batch 07 finding 4: three prior requests for behavioural tests
// produced source-text because `runSyncForAccount` could not be called
// from a test. `decideAdWrite` (in `fieldLevelDiscrimination.ts`)
// broke that pattern for one level; this module breaks it for the
// next level. The same shape — inputs in, actions out — lifts the
// worker's per-ad decision out of the inline loop and into a unit
// the test suite can drive.
//
// What this function produces:
//   - `inLearnedAds`: whether the ad joins the `learnedAds` array the
//     aggregator consumes.
//   - `adDoc`: the ad-doc shape to write to Firestore (with optional
//     `ledger` field for T025a's contribution-record).
//   - `tally`: how to update the `matched`/`ambiguous`/`unmatched`
//     counters in `SyncResult.counts`.
//   - `generationId`: the resolved generationId for `matchedGenIds`.
//
// FR-070 (T018b) is satisfied by `decideAdWrite` inside this function.
// FR-073 (T021) is satisfied when the worker passes the actual
// creativeKey through `creativeKey` — until T021a lands, the worker
// passes `ad.id` per the Batch 05 placeholder. The discriminator test
// in `learningAccumulation.test.ts` (Batch 07 §5) drives the function
// directly with both keys and asserts the discriminator holds.

import type { AdDoc } from "../metaSync/shared.js";
import { CURRENT_LEARNING_SCHEMA_VERSION } from "./types.js";
import {
    decideAdWrite,
    type DecideAdWriteInput,
} from "./fieldLevelDiscrimination.js";
import type { AdForLearning } from "../learningAggregates.js";

// ─── Inputs ──────────────────────────────────────────────────────

/**
 * The full per-ad context the worker computes across its several
 * loops. `decidedAdWriteActions` consumes a SINGLE row of this; the
 * worker iterates `decideAdWriteActions` once per ad.
 */
export interface PerAdActionsInput {
    /** The ad row from Meta. */
    adId: string;
    /** The creativeKey (FR-073 unit of evidence). Until T021a's worker
     * integration lands, the worker sets this to `ad.id`. */
    creativeKey: string;
    /**
     * The post-patch hookAngle (resolved after `groupIntoCreatives`
     * fills `learnedAds[i].hookAngle`). NULL when the input is run
     * pre-patch; the post-patch caller fills it in.
     */
    resolvedHookAngle: string | null;
    /**
     * The post-patch layoutTemplate. Same NULL semantics as
     * `resolvedHookAngle`. Used to populate `ledger.patternKey` when
     * resolved.
     */
    resolvedPatternKey: string | null;
    /** Whether the bounded-read chunk for this ad failed (FR-070). */
    ledgerReadFailed: boolean;
    /** Whether the match candidate was ambiguous (used for the
     * matched/ambiguous/unmatched tally — independent of the FR-070
     * discriminator). */
    matchAmbiguous: boolean;
    /** Forwarded to `decideAdWrite` for the precedence lock. */
    existingData: Partial<AdDoc> | undefined;
    /** Forwarded to `decideAdWrite` for the cascade-preservation mark. */
    keepMetadataUnavailable: boolean;
    /**
     * FR-027 (Phase 969 T047) — the workspace's funnel type at sync
     * time. Threads through to `AdForLearning.funnelType` so the
     * aggregator's per-funnel-type breakdown reflects real
     * attribution. Optional; helper defaults to "unknown" (FR-032).
     */
    funnelType?: import("../learningAggregates.js").FunnelTypeBucketKey;
}

/** Inputs that vary per-ad (metrics, verdict, match). */
export interface PerAdVaryingInputs {
    metrics: DecideAdWriteInput["metrics"];
    ctx: DecideAdWriteInput["ctx"];
    objective: DecideAdWriteInput["objective"];
    ageDays: number;
    creativeId: string | null;
    creativeType: DecideAdWriteInput["creativeType"];
    spendSharePct: number;
    thumbnailUrl: string | undefined;
    verdict: DecideAdWriteInput["verdict"];
    match: DecideAdWriteInput["match"];
    /**
     * The ad's display name as returned by Meta. Threads through to
     * `baseDoc.adName` so the worker preserves it on `merge: true`
     * writes instead of overwriting with the literal `""` that
     * `decideAdWrite` previously received.
     */
    adName: string;
}

// ─── Outputs ────────────────────────────────────────────────────

export type AdTally = "matched" | "ambiguous" | "unmatched";

/**
 * The full per-ad action set. The worker queues the writes, updates
 * the counters and `matchedGenIds`, and pushes to `learnedAds` based
 * on these outputs.
 */
export interface PerAdActionsResult {
    /** Whether the ad joins `learnedAds` (FR-070). False for failed-read ads. */
    inLearnedAds: boolean;
    /** The full adDoc shape to write to Firestore, with optional `ledger`
     * field. The `merge: true` write semantics preserve linking fields
     * not present here (FR-070's field-level discrimination). */
    adDoc: AdDoc;
    /** Whether to increment `matched`/`ambiguous`/`unmatched` in
     * `SyncResult.counts`. */
    tally: AdTally;
    /** The resolved generationId for `matchedGenIds` (null when no link). */
    generationId: string | null;
    /** The `AdForLearning` entry to push onto `learnedAds`, populated
     * only when `inLearnedAds` is true. The `creativeKey` flows from
     * `input.creativeKey` — FR-073's unit of evidence. */
    learnedAd: AdForLearning | null;
}

// ─── The decision ──────────────────────────────────────────────

export function decideAdWriteActions(
    ctx: PerAdActionsInput,
    varying: PerAdVaryingInputs,
): PerAdActionsResult {
    // FR-070 (T018b): the discriminator's input comes from the
    // bounded-read outcome + the match candidate. We forward the
    // existing data and ledgerReadFailed flag.
    const decision = decideAdWrite({
        adId: ctx.adId,
        adName: varying.adName,
        existingData: ctx.existingData,
        ledgerReadFailed: ctx.ledgerReadFailed,
        match: varying.match,
        metrics: varying.metrics,
        ctx: varying.ctx,
        objective: varying.objective,
        ageDays: varying.ageDays,
        creativeId: varying.creativeId,
        creativeType: varying.creativeType,
        spendSharePct: varying.spendSharePct,
        thumbnailUrl: varying.thumbnailUrl,
        verdict: varying.verdict,
        keepMetadataUnavailable: ctx.keepMetadataUnavailable,
    });

    // Tally: independent of FR-070. Counts the resolved linkage so
    // that failed-read ads (where decision.adDoc.generationId is
    // undefined per FR-070) increment `unmatched`.
    let tally: AdTally;
    if (decision.adDoc.generationId && (decision.adDoc.matchType === "auto_hash" || decision.adDoc.matchType === "manual")) {
        tally = "matched";
    } else if (ctx.matchAmbiguous) {
        tally = "ambiguous";
    } else {
        tally = "unmatched";
    }

    // Build the `learnedAds` entry IF the ad contributes. The
    // `creativeKey` flows through per-creative aggregation (FR-073,
    // T021a). Hook/layout are null until T021a's worker integration
    // patches them; today they're placeholders.
    //
    // `ledger` is the contribution record (T025). Until T025a
    // populates the keys, `angleKey` and `patternKey` are `null`;
    // the field-level FR-051a audit guarantee is dormant until
    // populated (see T025 / T025a note in `tasks.md`).
    if (decision.inLearnedAds) {
        const ad: AdForLearning = {
            adId: ctx.adId,
            creativeKey: ctx.creativeKey,
            generationId: decision.adDoc.generationId ?? null,
            matchType: decision.adDoc.matchType ?? null,
            metadataAvailable: decision.adDoc.metadataAvailable ?? false,
            campaignObjective: varying.objective.bucket,
            // FR-027 / T047 — funnel attribution read from the
            // workspace's funnel settings; missing attribution falls
            // back to "unknown" inside the aggregator (the helper
            // does the resolution).
            funnelType: ctx.funnelType,
            geoTier: varying.ctx.geoTier,
            audienceType: varying.ctx.audienceType,
            ctrLink: varying.metrics.ctrLink,
            cpm3d: varying.metrics.cpm3d,
            conversions3d: varying.metrics.conversions3d,
            verdict: varying.verdict.verdict,
            // Pre-patch these are null; the post-patch pass in the
            // worker fills them. The hook/layout are known at this
            // point when the caller has already run the generation
            // patch.
            hookAngle: ctx.resolvedHookAngle,
            layoutTemplate: ctx.resolvedPatternKey, // PatternKey is the visual hash; layoutTemplate is unrelated.
            creativeModes: [],
            artDirection: null,
            universe: null,
        };
        decision.adDoc.ledger = {
            creativeKey: ctx.creativeKey,
            angleKey: ctx.resolvedHookAngle,
            patternKey: ctx.resolvedPatternKey,
            bucket: varying.objective.bucket,
            geoTier: varying.ctx.geoTier,
            audienceType: varying.ctx.audienceType,
            contributedValues: {
                ctrLink: varying.metrics.ctrLink,
                cpm: varying.metrics.cpm3d,
                verdictMark: varying.verdict.verdict,
            },
            measurementInputs: {
                spend3d: varying.metrics.spend3d,
                conversions3d: varying.metrics.conversions3d,
            },
            efficiencyContributed: false,
            efficiencyValue: null,
            schemaVersion: CURRENT_LEARNING_SCHEMA_VERSION,
        };
        (decision as PerAdActionsResult & { _learnedAd: AdForLearning })._learnedAd = ad;
    }

    return {
        inLearnedAds: decision.inLearnedAds,
        adDoc: decision.adDoc,
        tally,
        generationId: decision.adDoc.generationId ?? null,
        learnedAd: decision.inLearnedAds
            ? (decision as PerAdActionsResult & { _learnedAd: AdForLearning })._learnedAd
            : null,
    };
}
