// functions/src/learningAggregates.ts — Phase 14 Layer 4b Two-Component Learning
// ═══════════════════════════════════════════════════════════
// PURE module (no Firestore / network). The worker in
// `metaSync/shared.ts` reads the existing aggregate docs, builds a list
// of `AdForLearning` from the ad-loop results, and calls:
//   - `updateHookAggregates(ads, hookDocs)` → Map<canonicalAngle, HookAggregate>
//   - `updateVisualAggregates(ads, visualDocs)` → Map<patternKey, VisualAggregate>
//
// RULES (spec §6 + §5.6):
//   - Only CONVERSION-objective matched ads feed the byObjective.conversion
//     bucket. "other" objective ads go in byObjective.other (display-only).
//   - Only `matchType: "auto_hash" | "manual"` and `metadataAvailable: true`
//     ads are eligible.
//   - Hook angle alias resolution: shocking_stat→statistics,
//     fear_of_missing_out→urgency, future_pacing→future_based.
//   - patternKey = hash of sorted [layoutTemplate, modes[], artDirection, universe].
//   - Same generationId in 2 ad sets → separate records per context.
//   - All verdict counts (`bestVerdictCount` = 🟢, `worstVerdictCount` = 🔴) are
//     tracked per angle / pattern.
// ═══════════════════════════════════════════════════════════

import { resolveCanonicalAngle } from "./canonicalAngle.js";

// ─── Types ─────────────────────────────────────────────────────

export type LearningVerdict = "🟢" | "🟡" | "🔴" | "🛟" | "⏳";

/** Mirrors the data-model §5 hookPerformance aggregate. */
export interface HookPerformanceAggregate {
    angleKey: string;
    sampleSize: number;
    lastUpdated: number;
    byObjective: {
        conversion: {
            avgLinkCtr: number;
            count: number;
            bestVerdictCount: number;  // 🟢
            worstVerdictCount: number; // 🔴
        };
        other: {
            avgLinkCtr: number;
            count: number;
        };
    };
    byGeoTier: {
        tier1_gulf: { avgCtr: number; count: number };
        tier2_diaspora: { avgCtr: number; count: number };
        tier3_egypt_na: { avgCtr: number; count: number };
    };
    byAudienceType: {
        broad: { avgCtr: number; count: number };
        interest: { avgCtr: number; count: number };
        lookalike: { avgCtr: number; count: number };
        retargeting: { avgCtr: number; count: number };
        advantage_plus: { avgCtr: number; count: number };
    };
}

/** Mirrors the data-model §6 visualPerformance aggregate. */
export interface VisualPerformanceAggregate {
    patternKey: string;
    sampleSize: number;
    lastUpdated: number;
    byObjective: {
        conversion: {
            avgCpm: number;
            avgLinkCtr: number;
            count: number;
            bestVerdictCount: number;
            worstVerdictCount: number;
        };
        other: {
            count: number;
        };
    };
    byGeoTier: {
        tier1_gulf: { avgCpm: number; avgCtr: number; count: number };
        tier2_diaspora: { avgCpm: number; avgCtr: number; count: number };
        tier3_egypt_na: { avgCpm: number; avgCtr: number; count: number };
    };
    byAudienceType: {
        broad: { avgCpm: number; avgCtr: number; count: number };
        interest: { avgCpm: number; avgCtr: number; count: number };
        lookalike: { avgCpm: number; avgCtr: number; count: number };
        retargeting: { avgCpm: number; avgCtr: number; count: number };
        advantage_plus: { avgCpm: number; avgCtr: number; count: number };
    };
}

/** Input shape — the worker builds this list from its ad loop. */
export interface AdForLearning {
    adId: string;
    /** Generation id (matched). Required for hook + pattern aggregates. */
    generationId: string | null;
    /** Match type from the worker — `null` ads are SKIPPED. */
    matchType: "auto_hash" | "manual" | null;
    /** The delete-cascade flag — `false` SKIPS the ad from learning. */
    metadataAvailable: boolean;
    /** "conversion" | "other" — controls the byObjective bucket. */
    campaignObjective: "conversion" | "other";
    geoTier: "tier1_gulf" | "tier2_diaspora" | "tier3_egypt_na";
    audienceType: "broad" | "interest" | "lookalike" | "retargeting" | "advantage_plus";
    ctrLink: number;
    cpm3d: number;
    conversions3d: number;
    /** Pre-resolved Qarar verdict (Layer 4 output). */
    verdict: LearningVerdict;
    /** Required for hook learning — angle from the matched generation. */
    hookAngle: string | null;
    /** Required for visual pattern learning — from the matched generation. */
    layoutTemplate: string | null;
    creativeModes: string[];
    artDirection: string | null;
    universe: string | null;
}

// ─── Eligibility check (used by both aggregators) ─────────────

function isEligibleForLearning(ad: AdForLearning): boolean {
    if (ad.matchType !== "auto_hash" && ad.matchType !== "manual") return false;
    if (!ad.metadataAvailable) return false;
    if (!ad.generationId) return false;
    return true;
}

// ─── Pattern key: deterministic hash of the visual pattern ────

/**
 * Compute a stable pattern key from the visual pattern components. The
 * modes array is SORTED before hashing so `["a","b"]` and `["b","a"]`
 * produce the same key. A non-cryptographic djb2-style hash is enough —
 * the key only needs to be deterministic and short.
 */
export function computePatternKey(
    layoutTemplate: string | null,
    modes: ReadonlyArray<string>,
    artDirection: string | null,
    universe: string | null,
): string {
    if (!layoutTemplate || !artDirection || !universe) return "";
    const sortedModes = [...modes].sort();
    const parts = [layoutTemplate, ...sortedModes, artDirection, universe];
    const joined = parts.join("|");
    return djb2Hash(joined);
}

/** Small djb2 hash → 8-char base36 string. Deterministic, no deps. */
function djb2Hash(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    // Force unsigned and base36 for compact string.
    return (h >>> 0).toString(36).padStart(7, "0");
}

// ─── Hook aggregate ──────────────────────────────────────────

/**
 * Build / update the per-canonical-angle hook aggregates from the worker's
 * ad loop. Returns a `Map<canonicalAngleKey, HookPerformanceAggregate>`
 * containing every angle the ads touched — callers can diff this against
 * the existing Firestore docs to know which to write.
 *
 * OVERWRITE semantics: the returned aggregate is computed entirely from
 * `ads` (the current sync's contribution). The `existing` parameter is
 * used only to provide a structural template (the worker reads existing
 * aggregates from Firestore; if a particular angle is empty in `existing`
 * we still know what shape the output doc should have). The worker is
 * expected to OVERWRITE the Firestore doc with the returned value —
 * NOT merge with it — so re-running this function on the same input
 * produces an identical result (passed-back-as-existing is a no-op).
 *
 * `syncAt` is the synchronization timestamp (epoch ms). The worker
 * passes a single value for the whole sync so all aggregates carry
 * the same `lastUpdated`. This makes the function deterministic for
 * the same input — previously `Date.now()` was called per call and
 * the result drifted between calls.
 *
 * This is the CRITICAL invariant: the same ad, processed in two
 * successive syncs, must NOT be double-counted. The worker is
 * responsible for not including the same ad in two sync windows; the
 * aggregator guarantees that within a single call, the result is fully
 * determined by the input.
 */
export function updateHookAggregates(
    ads: ReadonlyArray<AdForLearning>,
    existing: ReadonlyArray<HookPerformanceAggregate>,
    syncAt: number = Date.now(),
): Map<string, HookPerformanceAggregate> {
    // Build a per-angle accumulator. Local to this call — does not
    // merge with `existing`. After processing, we materialize the
    // accumulator into the final shape using the existing doc (if
    // present) for any structural fields we don't compute.
    const acc = new Map<string, HookAccumulator>();
    for (const ad of ads) {
        if (!isEligibleForLearning(ad)) continue;
        if (ad.hookAngle === null) continue;
        const canonical = resolveCanonicalAngle(ad.hookAngle);
        if (!canonical) continue;
        const angleKey = canonical;
        const existing_agg = acc.get(angleKey);
        const a: HookAccumulator = existing_agg ?? {
            angleKey,
            conversionCount: 0,
            conversionLinkCtrSum: 0,
            conversionBestCount: 0,
            conversionWorstCount: 0,
            otherCount: 0,
            otherLinkCtrSum: 0,
            geoCounts: { tier1_gulf: 0, tier2_diaspora: 0, tier3_egypt_na: 0 },
            geoCtrSum: { tier1_gulf: 0, tier2_diaspora: 0, tier3_egypt_na: 0 },
            audCounts: { broad: 0, interest: 0, lookalike: 0, retargeting: 0, advantage_plus: 0 },
            audCtrSum: { broad: 0, interest: 0, lookalike: 0, retargeting: 0, advantage_plus: 0 },
        };
        const isConversion = ad.campaignObjective === "conversion";
        if (isConversion) {
            a.conversionCount += 1;
            a.conversionLinkCtrSum += ad.ctrLink;
            if (ad.verdict === "🟢") a.conversionBestCount += 1;
            if (ad.verdict === "🔴") a.conversionWorstCount += 1;
            a.geoCounts[ad.geoTier] += 1;
            a.geoCtrSum[ad.geoTier] += ad.ctrLink;
            a.audCounts[ad.audienceType] += 1;
            a.audCtrSum[ad.audienceType] += ad.ctrLink;
        } else {
            a.otherCount += 1;
            a.otherLinkCtrSum += ad.ctrLink;
        }
        acc.set(angleKey, a);
    }

    // Materialize the final aggregate shape. CRITICAL: only output
    // entries for angles that the current sync actually contributed
    // to. Do NOT union with `existing` — that would zero-out
    // historical data on partial syncs (the spec's invariant:
    // "Aggregates are NOT recomputed on delete", but the same
    // principle applies to partial-sync writes). Angles present in
    // `existing` but not in this call's input are simply NOT in the
    // output map; the worker only writes entries it sees, so the
    // Firestore docs for the other angles are preserved untouched.
    const out = new Map<string, HookPerformanceAggregate>();
    for (const [angleKey, a] of acc) {
        const agg: HookPerformanceAggregate = emptyHookAggregateFor(angleKey);
        // sampleSize counts conversion ads only (spec §6.2: "byObjective
        // .conversion is the ONLY bucket that feeds learning"). The
        // byObjective.other bucket is display-only and is NOT added
        // to sampleSize — a count of 10 "other" ads with 0 conversion
        // ads would otherwise suggest the angle has 10 samples when
        // it has zero learning-relevant data.
        agg.sampleSize = a.conversionCount;
        agg.lastUpdated = syncAt;
        if (a.conversionCount > 0) {
            agg.byObjective.conversion.count = a.conversionCount;
            agg.byObjective.conversion.avgLinkCtr = round2(a.conversionLinkCtrSum / a.conversionCount);
            agg.byObjective.conversion.bestVerdictCount = a.conversionBestCount;
            agg.byObjective.conversion.worstVerdictCount = a.conversionWorstCount;
        }
        if (a.otherCount > 0) {
            agg.byObjective.other.count = a.otherCount;
            agg.byObjective.other.avgLinkCtr = round2(a.otherLinkCtrSum / a.otherCount);
        }
        for (const t of ["tier1_gulf", "tier2_diaspora", "tier3_egypt_na"] as const) {
            if (a.geoCounts[t] > 0) {
                agg.byGeoTier[t].count = a.geoCounts[t];
                agg.byGeoTier[t].avgCtr = round2(a.geoCtrSum[t] / a.geoCounts[t]);
            }
        }
        for (const au of ["broad", "interest", "lookalike", "retargeting", "advantage_plus"] as const) {
            if (a.audCounts[au] > 0) {
                agg.byAudienceType[au].count = a.audCounts[au];
                agg.byAudienceType[au].avgCtr = round2(a.audCtrSum[au] / a.audCounts[au]);
            }
        }
        out.set(angleKey, agg);
    }
    return out;
}

interface HookAccumulator {
    angleKey: string;
    conversionCount: number;
    conversionLinkCtrSum: number;
    conversionBestCount: number;
    conversionWorstCount: number;
    otherCount: number;
    otherLinkCtrSum: number;
    geoCounts: { tier1_gulf: number; tier2_diaspora: number; tier3_egypt_na: number };
    geoCtrSum: { tier1_gulf: number; tier2_diaspora: number; tier3_egypt_na: number };
    audCounts: { broad: number; interest: number; lookalike: number; retargeting: number; advantage_plus: number };
    audCtrSum: { broad: number; interest: number; lookalike: number; retargeting: number; advantage_plus: number };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function emptyHookAggregateFor(angleKey: string): HookPerformanceAggregate {
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

// ─── Visual pattern aggregate ────────────────────────────────

// ─── Visual pattern aggregate ────────────────────────────────

/**
 * Build / update the per-patternKey visual aggregates from the worker's
 * ad loop. OVERWRITE semantics — same contract as
 * `updateHookAggregates`. The result is computed entirely from `ads`;
 * the worker OVERWRITES the Firestore doc with the returned value.
 *
 * `syncAt` is the synchronization timestamp (epoch ms). See
 * `updateHookAggregates` for the determinism rationale.
 */
export function updateVisualAggregates(
    ads: ReadonlyArray<AdForLearning>,
    existing: ReadonlyArray<VisualPerformanceAggregate>,
    syncAt: number = Date.now(),
): Map<string, VisualPerformanceAggregate> {
    // Local per-patternKey accumulator.
    const acc = new Map<string, VisualAccumulator>();
    for (const ad of ads) {
        if (!isEligibleForLearning(ad)) continue;
        const patternKey = computePatternKey(
            ad.layoutTemplate,
            ad.creativeModes,
            ad.artDirection,
            ad.universe,
        );
        if (patternKey === "") continue;
        const a: VisualAccumulator = acc.get(patternKey) ?? {
            patternKey,
            conversionCount: 0,
            conversionCpmSum: 0,
            conversionLinkCtrSum: 0,
            conversionBestCount: 0,
            conversionWorstCount: 0,
            otherCount: 0,
            geoCounts: { tier1_gulf: 0, tier2_diaspora: 0, tier3_egypt_na: 0 },
            geoCpmSum: { tier1_gulf: 0, tier2_diaspora: 0, tier3_egypt_na: 0 },
            geoCtrSum: { tier1_gulf: 0, tier2_diaspora: 0, tier3_egypt_na: 0 },
            audCounts: { broad: 0, interest: 0, lookalike: 0, retargeting: 0, advantage_plus: 0 },
            audCpmSum: { broad: 0, interest: 0, lookalike: 0, retargeting: 0, advantage_plus: 0 },
            audCtrSum: { broad: 0, interest: 0, lookalike: 0, retargeting: 0, advantage_plus: 0 },
        };
        const isConversion = ad.campaignObjective === "conversion";
        if (isConversion) {
            a.conversionCount += 1;
            a.conversionCpmSum += ad.cpm3d;
            a.conversionLinkCtrSum += ad.ctrLink;
            if (ad.verdict === "🟢") a.conversionBestCount += 1;
            if (ad.verdict === "🔴") a.conversionWorstCount += 1;
            a.geoCounts[ad.geoTier] += 1;
            a.geoCpmSum[ad.geoTier] += ad.cpm3d;
            a.geoCtrSum[ad.geoTier] += ad.ctrLink;
            a.audCounts[ad.audienceType] += 1;
            a.audCpmSum[ad.audienceType] += ad.cpm3d;
            a.audCtrSum[ad.audienceType] += ad.ctrLink;
        } else {
            a.otherCount += 1;
        }
        acc.set(patternKey, a);
    }

    // Materialize. CRITICAL: only output entries for patternKeys that
    // the current sync actually contributed to. Do NOT union with
    // `existing` — that would zero-out historical data on partial
    // syncs. Patterns present in `existing` but not in this call's
    // input are simply NOT in the output map; the worker only writes
    // entries it sees, so the Firestore docs for the other patterns
    // are preserved untouched.
    const out = new Map<string, VisualPerformanceAggregate>();
    for (const [patternKey, a] of acc) {
        if (!patternKey) continue;
        const agg: VisualPerformanceAggregate = emptyVisualAggregateFor(patternKey);
        // sampleSize counts conversion ads only (spec §6.2).
        agg.sampleSize = a.conversionCount;
        agg.lastUpdated = syncAt;
        if (a.conversionCount > 0) {
            agg.byObjective.conversion.count = a.conversionCount;
            agg.byObjective.conversion.avgCpm = round2(a.conversionCpmSum / a.conversionCount);
            agg.byObjective.conversion.avgLinkCtr = round2(a.conversionLinkCtrSum / a.conversionCount);
            agg.byObjective.conversion.bestVerdictCount = a.conversionBestCount;
            agg.byObjective.conversion.worstVerdictCount = a.conversionWorstCount;
        }
        if (a.otherCount > 0) {
            agg.byObjective.other.count = a.otherCount;
        }
        for (const t of ["tier1_gulf", "tier2_diaspora", "tier3_egypt_na"] as const) {
            if (a.geoCounts[t] > 0) {
                agg.byGeoTier[t].count = a.geoCounts[t];
                agg.byGeoTier[t].avgCpm = round2(a.geoCpmSum[t] / a.geoCounts[t]);
                agg.byGeoTier[t].avgCtr = round2(a.geoCtrSum[t] / a.geoCounts[t]);
            }
        }
        for (const au of ["broad", "interest", "lookalike", "retargeting", "advantage_plus"] as const) {
            if (a.audCounts[au] > 0) {
                agg.byAudienceType[au].count = a.audCounts[au];
                agg.byAudienceType[au].avgCpm = round2(a.audCpmSum[au] / a.audCounts[au]);
                agg.byAudienceType[au].avgCtr = round2(a.audCtrSum[au] / a.audCounts[au]);
            }
        }
        out.set(patternKey, agg);
    }
    return out;
}

interface VisualAccumulator {
    patternKey: string;
    conversionCount: number;
    conversionCpmSum: number;
    conversionLinkCtrSum: number;
    conversionBestCount: number;
    conversionWorstCount: number;
    otherCount: number;
    geoCounts: { tier1_gulf: number; tier2_diaspora: number; tier3_egypt_na: number };
    geoCpmSum: { tier1_gulf: number; tier2_diaspora: number; tier3_egypt_na: number };
    geoCtrSum: { tier1_gulf: number; tier2_diaspora: number; tier3_egypt_na: number };
    audCounts: { broad: number; interest: number; lookalike: number; retargeting: number; advantage_plus: number };
    audCpmSum: { broad: number; interest: number; lookalike: number; retargeting: number; advantage_plus: number };
    audCtrSum: { broad: number; interest: number; lookalike: number; retargeting: number; advantage_plus: number };
}

function emptyVisualAggregateFor(patternKey: string): VisualPerformanceAggregate {
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

function cloneVisualAggregate(agg: VisualPerformanceAggregate): VisualPerformanceAggregate {
    return {
        patternKey: agg.patternKey,
        sampleSize: agg.sampleSize,
        lastUpdated: agg.lastUpdated,
        byObjective: {
            conversion: { ...agg.byObjective.conversion },
            other: { ...agg.byObjective.other },
        },
        byGeoTier: {
            tier1_gulf: { ...agg.byGeoTier.tier1_gulf },
            tier2_diaspora: { ...agg.byGeoTier.tier2_diaspora },
            tier3_egypt_na: { ...agg.byGeoTier.tier3_egypt_na },
        },
        byAudienceType: {
            broad: { ...agg.byAudienceType.broad },
            interest: { ...agg.byAudienceType.interest },
            lookalike: { ...agg.byAudienceType.lookalike },
            retargeting: { ...agg.byAudienceType.retargeting },
            advantage_plus: { ...agg.byAudienceType.advantage_plus },
        },
    };
}
