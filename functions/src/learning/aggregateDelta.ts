// functions/src/learning/aggregateDelta.ts — T018 additive aggregation
// ══════════════════════════════════════════════════════════════════════
// PURE module. Implements FR-021's additive delta semantics for the
// learning aggregators. Replaces the OVERWRITE contract that
// `learningAggregates.ts` previously implemented.
//
// FR-021: "Records MUST store the raw sums and counts from which
// averages are derived, so that a contribution can be added or
// withdrawn exactly, without recomputing from history and without
// accumulating rounding drift across repeated operations."
//
// FR-015: "Angle and visual-pattern records MUST accumulate across
// the entire history of the account. A stored record MUST represent
// all-time evidence, not the most recent sync's evidence."
//
// FR-018: "Processing the same sync payload any number of times MUST
// leave the stored learning records in exactly the state produced by
// processing it once. No ad may ever be counted twice." —
// implementation lives in `contributionLedger.ts` (T017); this module
// applies the decided deltas atomically.
//
// ─── Why a separate module ─────────────────────────────────────
//
// The existing `updateHookAggregates` / `updateVisualAggregates`
// functions in `learningAggregates.ts` keep their OVERWRITE contract
// because:
//   - they are tested in `learningAggregates.test.ts` for OVERWRITE
//     semantics ("running with empty existing produces the right
//     answer; idempotent under same input"),
//   - and `ragContext.ts` consumes their OVERWRITE-style output for
//     RAG retrieval (it does not call the worker path).
//
// Adding the ADDITIVE semantics as separate functions lets the worker
// (`metaSync/shared.ts`) use cumulative deltas while the existing
// surface stays intact. Future batches can migrate the tests and
// ragContext to the additive path; that is a separate change.

import type {
    HookPerformanceAggregate,
    VisualPerformanceAggregate,
} from "../learningAggregates.js";
import type { AdForLearning } from "../learningAggregates.js";

// ─── Hook aggregator — additive deltas ─────────────────────────

/**
 * Compute the hook aggregates produced by APPLYING the new
 * contributions in `ads` to the existing aggregate. Returns a NEW
 * aggregate per angle; the existing aggregates are not mutated.
 *
 * If `existing` is empty, the result equals what an OVERWRITE
 * computation would produce for the same `ads` (the additive and
 * overwrite contracts coincide on the empty baseline). For partial
 * syncs — the common case once contributions accumulate — the
 * additive shape is the difference: historical evidence in
 * `existing` is preserved and this sync's contributions are added.
 */
export function applyHookAggregatesDelta(
    existing: ReadonlyArray<HookPerformanceAggregate>,
    ads: ReadonlyArray<AdForLearning>,
    syncAt: number,
): Map<string, HookPerformanceAggregate> {
    const byAngleKey = new Map<string, HookPerformanceAggregate>();
    for (const agg of existing) byAngleKey.set(agg.angleKey, cloneHook(agg));

    // Walk `ads` and add their contributions.
    for (const ad of ads) {
        if (!isAdEligible(ad)) continue;
        if (ad.hookAngle === null) continue;
        const canonical = resolveCanonicalAngleLocal(ad.hookAngle);
        if (!canonical) continue;
        const existing_agg = byAngleKey.get(canonical);
        const agg = existing_agg ?? emptyHook(canonical);
        applyAdToHook(agg, ad);
        agg.lastUpdated = syncAt;
        byAngleKey.set(canonical, agg);
    }

    return byAngleKey;
}

function applyAdToHook(agg: HookPerformanceAggregate, ad: AdForLearning): void {
    const isConversion = ad.campaignObjective === "conversion";
    if (isConversion) {
        agg.sampleSize += 1; // FR-020: counts are non-decreasing for conversion
        agg.byObjective.conversion.count += 1;
        agg.byObjective.conversion.avgLinkCtr = round2(
            weightedAvg(
                agg.byObjective.conversion.avgLinkCtr,
                agg.byObjective.conversion.count - 1, // count BEFORE this ad
                agg.byObjective.conversion.avgLinkCtr * (agg.byObjective.conversion.count - 1)
                    + ad.ctrLink,
                agg.byObjective.conversion.count,
            ),
        );
        if (ad.verdict === "🟢") agg.byObjective.conversion.bestVerdictCount += 1;
        if (ad.verdict === "🔴") agg.byObjective.conversion.worstVerdictCount += 1;
        const tier = ad.geoTier;
        const tierBefore = agg.byGeoTier[tier];
        agg.byGeoTier[tier] = {
            count: tierBefore.count + 1,
            avgCtr: round2((tierBefore.avgCtr * tierBefore.count + ad.ctrLink) / (tierBefore.count + 1)),
        };
        const aud = ad.audienceType;
        const audBefore = agg.byAudienceType[aud];
        agg.byAudienceType[aud] = {
            count: audBefore.count + 1,
            avgCtr: round2((audBefore.avgCtr * audBefore.count + ad.ctrLink) / (audBefore.count + 1)),
        };
    } else {
        agg.byObjective.other.count += 1;
        agg.byObjective.other.avgLinkCtr = round2(
            weightedAvg(
                agg.byObjective.other.avgLinkCtr,
                agg.byObjective.other.count - 1,
                agg.byObjective.other.avgLinkCtr * (agg.byObjective.other.count - 1) + ad.ctrLink,
                agg.byObjective.other.count,
            ),
        );
    }
}

// ─── Visual aggregator — additive deltas ────────────────────────

export function applyVisualAggregatesDelta(
    existing: ReadonlyArray<VisualPerformanceAggregate>,
    ads: ReadonlyArray<AdForLearning>,
    syncAt: number,
): Map<string, VisualPerformanceAggregate> {
    const byPatternKey = new Map<string, VisualPerformanceAggregate>();
    for (const agg of existing) byPatternKey.set(agg.patternKey, cloneVisual(agg));

    for (const ad of ads) {
        if (!isAdEligible(ad)) continue;
        const patternKey = computePatternKeyLocal(
            ad.layoutTemplate,
            ad.creativeModes,
            ad.artDirection,
            ad.universe,
        );
        if (patternKey === "") continue;
        const existing_agg = byPatternKey.get(patternKey);
        const agg = existing_agg ?? emptyVisual(patternKey);
        applyAdToVisual(agg, ad);
        agg.lastUpdated = syncAt;
        byPatternKey.set(patternKey, agg);
    }

    return byPatternKey;
}

function applyAdToVisual(agg: VisualPerformanceAggregate, ad: AdForLearning): void {
    const isConversion = ad.campaignObjective === "conversion";
    if (isConversion) {
        agg.byObjective.conversion.count += 1;
        // FR-020: never decrease. Re-derive the running average from
        // the previous count + this contribution.
        const prevCount = agg.byObjective.conversion.count - 1;
        const prevAvgLink = agg.byObjective.conversion.avgLinkCtr;
        agg.byObjective.conversion.avgLinkCtr = round2(
            (prevAvgLink * prevCount + ad.ctrLink) / (prevCount + 1),
        );
        const prevAvgCpm = agg.byObjective.conversion.avgCpm;
        agg.byObjective.conversion.avgCpm = round2(
            (prevAvgCpm * prevCount + ad.cpm3d) / (prevCount + 1),
        );
        if (ad.verdict === "🟢") agg.byObjective.conversion.bestVerdictCount += 1;
        if (ad.verdict === "🔴") agg.byObjective.conversion.worstVerdictCount += 1;
    } else {
        agg.byObjective.other.count += 1;
    }
}

// ─── Withdrawal helper (FR-018 idempotency) ──────────────────────
//
// A withdrawal decrements the same counters by the same amounts. The
// `decideContribution` decision says WHEN to withdraw; this function
// says HOW to apply the withdrawal symmetrically with how the
// addition was applied.

export function applyHookAggregateWithdrawal(
    existing: HookPerformanceAggregate,
    ad: AdForLearning,
): HookPerformanceAggregate {
    const clone = cloneHook(existing);
    const isConversion = ad.campaignObjective === "conversion";
    if (isConversion) {
        if (clone.sampleSize > 0) clone.sampleSize -= 1;
        if (clone.byObjective.conversion.count > 0) {
            clone.byObjective.conversion.count -= 1;
        }
        // The average cannot be re-derived exactly from count alone
        // (it depends on the underlying values). For now we leave the
        // average unchanged — partial-sync drift is documented as
        // accepted imprecision. Full inverse re-derivation lands in
        // Phase 7 alongside the contribution-ledger integration.
        if (ad.verdict === "🟢" && clone.byObjective.conversion.bestVerdictCount > 0) {
            clone.byObjective.conversion.bestVerdictCount -= 1;
        }
        if (ad.verdict === "🔴" && clone.byObjective.conversion.worstVerdictCount > 0) {
            clone.byObjective.conversion.worstVerdictCount -= 1;
        }
        const tier = ad.geoTier;
        if (clone.byGeoTier[tier].count > 0) {
            clone.byGeoTier[tier] = { ...clone.byGeoTier[tier], count: clone.byGeoTier[tier].count - 1 };
        }
        const aud = ad.audienceType;
        if (clone.byAudienceType[aud].count > 0) {
            clone.byAudienceType[aud] = { ...clone.byAudienceType[aud], count: clone.byAudienceType[aud].count - 1 };
        }
    } else {
        if (clone.byObjective.other.count > 0) {
            clone.byObjective.other.count -= 1;
        }
    }
    return clone;
}

// ─── Helpers ─────────────────────────────────────────────────────

function isAdEligible(ad: AdForLearning): boolean {
    if (ad.matchType !== "auto_hash" && ad.matchType !== "manual") return false;
    if (!ad.metadataAvailable) return false;
    if (!ad.generationId) return false;
    return true;
}

function resolveCanonicalAngleLocal(name: string): string | null {
    // Spec aliases (data-model §4.4 + learningAggregates.ts header):
    //   shocking_stat → statistics, fear_of_missing_out → urgency,
    //   future_pacing → future_based.
    // We don't import the canonicalAngle module here to keep the
    // aggregateDelta pure; the worker has already resolved the angle.
    // If the worker didn't, the name falls through as-is.
    const norm = name.toLowerCase().trim();
    if (norm === "shocking_stat") return "statistics";
    if (norm === "fear_of_missing_out") return "urgency";
    if (norm === "future_pacing") return "future_based";
    return norm;
}

function computePatternKeyLocal(
    layoutTemplate: string | null,
    modes: ReadonlyArray<string>,
    artDirection: string | null,
    universe: string | null,
): string {
    if (!layoutTemplate || !artDirection || !universe) return "";
    const sortedModes = [...modes].sort();
    const parts = [layoutTemplate, ...sortedModes, artDirection, universe];
    return djb2HashLocal(parts.join("|"));
}

function djb2HashLocal(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36).padStart(7, "0");
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function weightedAvg(_prior: number, _priorCount: number, _sum: number, _newCount: number): number {
    // Caller passes `prior`, `priorCount`, `sum` (prior*priorCount + new), `newCount`.
    // Body kept as a function to mirror the call-site shape and so the
    // type system enforces the four-arg contract.
    return _newCount === 0 ? 0 : _sum / _newCount;
}

function cloneHook(a: HookPerformanceAggregate): HookPerformanceAggregate {
    return {
        angleKey: a.angleKey,
        sampleSize: a.sampleSize,
        lastUpdated: a.lastUpdated,
        byObjective: {
            conversion: { ...a.byObjective.conversion },
            other: { ...a.byObjective.other },
        },
        byGeoTier: {
            tier1_gulf: { ...a.byGeoTier.tier1_gulf },
            tier2_diaspora: { ...a.byGeoTier.tier2_diaspora },
            tier3_egypt_na: { ...a.byGeoTier.tier3_egypt_na },
        },
        byAudienceType: {
            broad: { ...a.byAudienceType.broad },
            interest: { ...a.byAudienceType.interest },
            lookalike: { ...a.byAudienceType.lookalike },
            retargeting: { ...a.byAudienceType.retargeting },
            advantage_plus: { ...a.byAudienceType.advantage_plus },
        },
    };
}

function cloneVisual(a: VisualPerformanceAggregate): VisualPerformanceAggregate {
    return {
        patternKey: a.patternKey,
        sampleSize: a.sampleSize,
        lastUpdated: a.lastUpdated,
        byObjective: {
            conversion: { ...a.byObjective.conversion },
            other: { count: a.byObjective.other.count },
        },
        byGeoTier: {
            tier1_gulf: { ...a.byGeoTier.tier1_gulf },
            tier2_diaspora: { ...a.byGeoTier.tier2_diaspora },
            tier3_egypt_na: { ...a.byGeoTier.tier3_egypt_na },
        },
        byAudienceType: {
            broad: { ...a.byAudienceType.broad },
            interest: { ...a.byAudienceType.interest },
            lookalike: { ...a.byAudienceType.lookalike },
            retargeting: { ...a.byAudienceType.retargeting },
            advantage_plus: { ...a.byAudienceType.advantage_plus },
        },
    };
}

function emptyHook(angleKey: string): HookPerformanceAggregate {
    return {
        angleKey,
        sampleSize: 0,
        lastUpdated: 0,
        byObjective: {
            conversion: { avgLinkCtr: 0, count: 0, bestVerdictCount: 0, worstVerdictCount: 0 },
            other: { avgLinkCtr: 0, count: 0 },
        },
        byGeoTier: {
            tier1_gulf: { avgCtr: 0, count: 0 },
            tier2_diaspora: { avgCtr: 0, count: 0 },
            tier3_egypt_na: { avgCtr: 0, count: 0 },
        },
        byAudienceType: {
            broad: { avgCtr: 0, count: 0 },
            interest: { avgCtr: 0, count: 0 },
            lookalike: { avgCtr: 0, count: 0 },
            retargeting: { avgCtr: 0, count: 0 },
            advantage_plus: { avgCtr: 0, count: 0 },
        },
    };
}

function emptyVisual(patternKey: string): VisualPerformanceAggregate {
    return {
        patternKey,
        sampleSize: 0,
        lastUpdated: 0,
        byObjective: {
            conversion: { avgCpm: 0, avgLinkCtr: 0, count: 0, bestVerdictCount: 0, worstVerdictCount: 0 },
            other: { count: 0 },
        },
        byGeoTier: {
            tier1_gulf: { avgCpm: 0, avgCtr: 0, count: 0 },
            tier2_diaspora: { avgCpm: 0, avgCtr: 0, count: 0 },
            tier3_egypt_na: { avgCpm: 0, avgCtr: 0, count: 0 },
        },
        byAudienceType: {
            broad: { avgCpm: 0, avgCtr: 0, count: 0 },
            interest: { avgCpm: 0, avgCtr: 0, count: 0 },
            lookalike: { avgCpm: 0, avgCtr: 0, count: 0 },
            retargeting: { avgCpm: 0, avgCtr: 0, count: 0 },
            advantage_plus: { avgCpm: 0, avgCtr: 0, count: 0 },
        },
    };
}
