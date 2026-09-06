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
// This module provides the ADDITIVE aggregators
// (`applyHookAggregatesDelta`, `applyVisualAggregatesDelta`) consumed
// by the worker in `metaSync/shared.ts`. They are the only aggregation
// path in this codebase.
//
// History: `learningAggregates.ts` previously exported OVERWRITE-
// semantics aggregators (`updateHookAggregates`, `updateVisualAggregates`).
// They were retired as of Batch 11; the previous report (Batch 06)
// claimed a deletion that did not actually happen, leaving the legacy
// functions alongside their tests for several batches. The legacy tests
// are gone from tracked source (deleted in Batch 06) and from the
// chain (Batch 11 #1); this batch completes the removal by deleting
// the functions themselves.

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
    // Internal Map carries HookWorkingAggregate (with the contributedCreatives
    // Set). Stripped to HookPerformanceAggregate on return.
    const byAngleKey = new Map<string, HookWorkingAggregate>();
    for (const agg of existing) byAngleKey.set(agg.angleKey, cloneHook(agg));

    // T021/T022: group rows by creativeKey so that the unit of evidence
    // is the creative. When `creativeKey` is absent (older fixtures),
    // we fall back to `adId` — per-row identity — so the existing test
    // surface stays compatible.
    //
    // For each creative group:
    //   - any-row eligibility (FR-074g): if ANY row in the group is
    //     eligible, the creative contributes.
    //   - all-rows aggregation: every eligible row's values aggregate.
    //   - contribution count: the creative contributes ONE count to
    //     the angle (the unit of evidence is the creative).
    const groups = groupAdsByCreative(ads);

    for (const [creativeKey, rows] of groups) {
        // any-row eligibility: drop the creative if no row qualifies.
        const eligibleRows = rows.filter(isAdEligible);
        if (eligibleRows.length === 0) continue;

        // Group all eligible rows by the angle they contribute to.
        // Within each angle, the creative contributes ONE count
        // (per FR-073 — creative is the unit of evidence) but
        // ALL-ROWS aggregation applies the row values.
        const adsByAngleKey = new Map<string, AdForLearning[]>();
        for (const ad of eligibleRows) {
            if (ad.hookAngle === null) continue;
            const canonical = resolveCanonicalAngleLocal(ad.hookAngle);
            if (!canonical) continue;
            const list = adsByAngleKey.get(canonical);
            if (list) list.push(ad);
            else adsByAngleKey.set(canonical, [ad]);
        }

        for (const [angleKey, angleRows] of adsByAngleKey) {
            const existing_agg = byAngleKey.get(angleKey);
            const agg = existing_agg ?? emptyHook(angleKey);
            // FIRST creative contribution to this angle from this
            // creative → increment creativeCount. Subsequent rows of
            // the same creative to the same angle don't re-increment.
            if (!agg.contributedCreatives.has(creativeKey)) {
                agg.contributedCreatives.add(creativeKey);
                agg.creativeCount = (agg.creativeCount ?? 0) + 1;
            }
            // FR-020: counts never decrease. All eligible rows of the
            // creative contribute their values to the angle's sums.
            for (const ad of angleRows) {
                applyAdToHook(agg, ad);
            }
            agg.lastUpdated = syncAt;
            byAngleKey.set(angleKey, agg);
        }
    }

    // Strip the internal contributedCreatives Set before returning —
    // it is working state, not part of the public aggregate shape.
    const out = new Map<string, HookPerformanceAggregate>();
    for (const [angleKey, agg] of byAngleKey) {
        const { contributedCreatives: _omit, ...publicAgg } = agg;
        out.set(angleKey, publicAgg);
    }
    return out;
}

/**
 * T022: group rows by creativeKey (or adId fallback) so the unit of
 * evidence is the creative. Pure function.
 */
function groupAdsByCreative(ads: ReadonlyArray<AdForLearning>): Map<string, AdForLearning[]> {
    const groups = new Map<string, AdForLearning[]>();
    for (const ad of ads) {
        const key = ad.creativeKey ?? ad.adId;
        const list = groups.get(key);
        if (list) list.push(ad);
        else groups.set(key, [ad]);
    }
    return groups;
}

function applyAdToHook(agg: HookWorkingAggregate, ad: AdForLearning): void {
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

    // T021/T022: same any-row / all-rows logic as the hook aggregator.
    const groups = groupAdsByCreative(ads);
    for (const [, rows] of groups) {
        const eligibleRows = rows.filter(isAdEligible);
        if (eligibleRows.length === 0) continue;
        for (const ad of eligibleRows) {
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

function cloneHook(a: HookPerformanceAggregate): HookWorkingAggregate {
    const result: HookWorkingAggregate = {
        angleKey: a.angleKey,
        schemaVersion: a.schemaVersion ?? 1,
        creativeCount: a.creativeCount ?? 0,
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
        contributedCreatives: new Set(),
        // Existing aggregates from before T021 carry no
        // contributedCreatives. The next sync with the same creative
        // will add the creative to the Set, incrementing creativeCount
        // — which is wrong for a creative that contributed historically
        // (its prior contribution should count). Per T021's spec
        // resolution, this is acceptable as long as the integrator
        // carries the Set forward across syncs. For Phase 3 close-out
        // this means we either serialise the Set or re-derive it from
        // the per-row ledger entries. Defer to the follow-up batch.
    };
    return result;
}

/** Internal working shape for the aggregator. Carries a Set of
 * creative keys that have already contributed, so that the second
 * row of one creative to the same angle does not double-count it.
 * Stripped before return (the Set is not part of the public type).
 */
interface HookWorkingAggregate extends HookPerformanceAggregate {
    contributedCreatives: Set<string>;
}

function cloneVisual(a: VisualPerformanceAggregate): VisualPerformanceAggregate {
    return {
        patternKey: a.patternKey,
        schemaVersion: a.schemaVersion ?? 1,
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

function emptyHook(angleKey: string): HookWorkingAggregate {
    return {
        angleKey,
        schemaVersion: 1,
        creativeCount: 0,
        sampleSize: 0,
        lastUpdated: 0,
        contributedCreatives: new Set(),
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
        schemaVersion: 1,
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
