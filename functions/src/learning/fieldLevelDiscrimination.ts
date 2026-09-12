// functions/src/learning/fieldLevelDiscrimination.ts — FR-070 pure decision function
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PURE module. Carves the FR-070 decision out of `metaSync/shared.ts`'s
// per-ad loop so it is testable without driving the full sync body.
//
// FR-070 distinguishes two failure modes for the bounded-read path:
//
//   1. The helper `readExistingAdDocs` correctly reports failed ids
//      (the **producing half** — verified by the bounded-read tests).
//
//   2. The per-ad loop's **consuming** half: when a chunk read failed,
//      the ad contributes nothing to the learning aggregator this
//      sync, AND its prior `matchType`/`generationId` are preserved on
//      disk, AND its operational fields (spend, verdict, conversions)
//      still get this sync's values.
//
// Behaviour of this module, in the failure case, was previously only
// asserted by reading the source. Owner correction to Batch 03 made
// that an insufficient evidence base — FR-070 names its own test, and
// the named test has to observe behaviour. So the decision is moved
// here and tested directly. `shared.ts` calls this function with the
// values it would have used inline; the contract is identical.

import type { AdDoc } from "../metaSync/shared.js";

// ─── Inputs ──────────────────────────────────────────────────────

/**
 * The fields `decideAdWrite` reads from the ad row. Narrower than
 * `MetaAd` so the call site can compose just what it has.
 */
export interface DecideAdWriteInput {
    adId: string;
    adName?: string;
    /** Existing ad doc — `undefined` for first-ever syncs or failed reads. */
    existingData: Partial<AdDoc> | undefined;
    /** Whether the bounded-read chunk that contained this ad failed. */
    ledgerReadFailed: boolean;
    /**
     * The fresh-from-Meta `match` candidate for this ad. Available
     * even when the bounded read failed — `match` is computed from a
     * different fetch (the fingerprint index), not from the bounded
     * read.
     */
    match: {
        generationId: string | null;
        matchType: "auto_hash" | "manual" | null;
        matchDistance: number | null;
        imageHash: string | null;
    } | null;
    metrics: {
        spend3d: number;
        spend7d: number;
        spendToday: number;
        impressions3d: number;
        cpa3d: number | null;
        ctrLink: number;
        ctrAll: number;
        conversions3d: number;
        frequency3d: number;
        cpm3d: number;
        peak1dCtr: number;
    };
    ctx: {
        geoTier: "tier1_gulf" | "tier2_diaspora" | "tier3_egypt_na";
        audienceType: "broad" | "interest" | "lookalike" | "retargeting" | "advantage_plus";
    };
    objective: {
        bucket: "conversion" | "other";
        raw: string;
    };
    ageDays: number;
    creativeId: string | null;
    creativeType: "image" | "video" | "unknown";
    spendSharePct: number;
    thumbnailUrl: string | undefined;
    /**
     * Verdict engine output for the ad. Required because operational
     * freshness means the verdict is still written for failed-read ads.
     */
    verdict: {
        verdict: "🟢" | "🟡" | "🔴" | "🛟" | "⏳";
        ruleCode: string;
        reasonAr: string;
        diagnosisAr: string | null;
        evaluatedAt: number;
    };
    /**
     * Cascade marker from the existing doc — `true` when the existing
     * doc was already cascade-marked and we must preserve that.
     * Undefined for first-ever syncs.
     */
    keepMetadataUnavailable: boolean;
}

// ─── Outputs ─────────────────────────────────────────────────────

/**
 * The FR-070 decision. Given an ad and the bounded-read outcome,
 * returns the two pieces of behaviour `shared.ts` produces for the
 * per-ad loop:
 *
 *   - `inLearnedAds`: whether the ad joins the `learnedAds` array the
 *     aggregator consumes. Failed-read ads MUST NOT contribute
 *     (FR-070's "no contribution was added").
 *
 *   - `adDoc`: the adPerformance document shape to write, with
 *     `merge: true` semantics. For failed-read ads, the linking
 *     fields are OMITTED (so merge preserves prior values); for
 *     successful reads, the precedence lock applies and the linking
 *     fields are INCLUDED.
 */
export interface DecideAdWriteResult {
    inLearnedAds: boolean;
    adDoc: AdDoc;
}

// ─── The decision ───────────────────────────────────────────────

export function decideAdWrite(input: DecideAdWriteInput): DecideAdWriteResult {
    const {
        adId,
        adName,
        existingData,
        ledgerReadFailed,
        match,
        metrics,
        ctx,
        objective,
        ageDays,
        creativeId,
        creativeType,
        spendSharePct,
        thumbnailUrl,
        verdict,
        keepMetadataUnavailable,
    } = input;

    // ─── Linking fields, decision: precedence or omit ───────────
    //
    // FR-070: failed-read ads do NOT re-derive linking fields from
    // fresh Meta data — the prior link, if any, must be preserved.
    // The discriminator is field-level: the merge:true write
    // preserves whatever the prior doc held for fields OMITTED from
    // the new doc.
    let generationId: string | null;
    let matchType: "auto_hash" | "manual" | null;
    let matchDistance: number | null;
    let includeLinkingFields: boolean;
    let resolvedMetadataAvailable: boolean;

    if (ledgerReadFailed) {
        // Omit linking fields entirely — merge preserves the prior
        // values (or leaves them absent for first-ever syncs).
        generationId = null;
        matchType = null;
        matchDistance = null;
        includeLinkingFields = false;
        // Without linking fields, `metadataAvailable` cannot be
        // computed (it depends on whether `generationId !== null`).
        // Omit it too — merge preserves the prior value, which is the
        // correct outcome (a re-sync with a fresh failed read keeps
        // whatever the cascade or normal-sync left there).
        resolvedMetadataAvailable = false;
    } else {
        // Precedence lock: a manual or prior auto link locks this ad
        // (existing precedence rule, unchanged).
        const existingMatchType = existingData?.matchType;
        generationId = match?.generationId ?? null;
        matchType = match?.matchType ?? null;
        matchDistance = match?.matchDistance ?? null;

        if (existingMatchType === "manual" || existingMatchType === "auto_hash") {
            // Lock — keep the prior link.
            generationId = (existingData?.generationId as string | null) ?? generationId;
            matchType = existingMatchType;
            matchDistance = (existingData?.matchDistance as number | null) ?? matchDistance;
        }
        includeLinkingFields = true;
        resolvedMetadataAvailable = keepMetadataUnavailable
            ? false
            : generationId !== null;
    }

    // ─── Operational fields, decision: always written ───────────
    //
    // FR-009 / SC-049: operational status must be current for every
    // ad in the batch. The discriminator is field-level, not
    // write-level — the merge write below the function never sees a
    // null that would overwrite operational data.
    const baseDoc: AdDoc = {
        adId,
        adName,
        thumbnailUrl,
        geoTier: ctx.geoTier,
        audienceType: ctx.audienceType,
        campaignObjective: objective.bucket,
        campaignObjectiveRaw: objective.raw,
        spend3d: metrics.spend3d,
        spend7d: metrics.spend7d,
        creativeType,
        spendToday: metrics.spendToday,
        impressions3d: metrics.impressions3d,
        cpa3d: metrics.cpa3d,
        ctrLink: metrics.ctrLink,
        ctrAll: metrics.ctrAll,
        conversions3d: metrics.conversions3d,
        frequency3d: metrics.frequency3d,
        spendSharePct,
        ageDays,
        cpm3d: metrics.cpm3d,
        peak1dCtr: metrics.peak1dCtr,
        creativeId,
        imageHash: match?.imageHash ?? null,
        verdict: verdict.verdict,
        ruleCode: verdict.ruleCode as never,
        reasonAr: verdict.reasonAr,
        diagnosisAr: verdict.diagnosisAr,
        evaluatedAt: verdict.evaluatedAt,
        schemaVersion: 1,
    };

    const adDoc: AdDoc = includeLinkingFields
        ? {
            ...baseDoc,
            generationId,
            matchType,
            matchDistance,
            metadataAvailable: resolvedMetadataAvailable,
        }
        : baseDoc;

    // ─── Learning-aggregator membership ──────────────────────────
    //
    // FR-070: failed-read ads contribute nothing to aggregates this
    // sync. The aggregator's own eligibility filter (matchType must
    // be `auto_hash` or `manual`, generationId must be non-null) is
    // applied by the aggregator later; `decideAdWrite` only enforces
    // the FR-070 gate.
    const inLearnedAds = !ledgerReadFailed;

    return { inLearnedAds, adDoc };
}
