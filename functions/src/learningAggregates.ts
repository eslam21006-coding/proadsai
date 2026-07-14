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
 * IDEMPOTENT: re-running on the same input is a no-op.
 */
export function updateHookAggregates(
    ads: ReadonlyArray<AdForLearning>,
    existing: ReadonlyArray<HookPerformanceAggregate>,
): Map<string, HookPerformanceAggregate> {
    // Seed the result from the existing aggregates (cloned, not aliased).
    const out = new Map<string, HookPerformanceAggregate>();
    for (const agg of existing) {
        out.set(agg.angleKey, cloneHookAggregate(agg));
    }

    for (const ad of ads) {
        if (!isEligibleForLearning(ad)) continue;
        if (ad.hookAngle === null) continue;

        const canonical = resolveCanonicalAngle(ad.hookAngle);
        if (!canonical) continue;
        // Some canonical ids include uppercase or punctuation that
        // wouldn't match the doc id. We trust canonicalAngle to return
        // the canonical 10 ids; everything else is bucketed under the
        // raw input. For the purposes of this engine, the canonical id
        // IS the doc key.
        const angleKey = canonical;
        const agg = out.get(angleKey) ?? emptyHookAggregateFor(angleKey);

        // Determine which bucket to write to.
        const isConversion = ad.campaignObjective === "conversion";
        if (isConversion) {
            const b = agg.byObjective.conversion;
            const oldCount = b.count;
            b.count += 1;
            b.avgLinkCtr = incrementalMean(b.avgLinkCtr, oldCount, ad.ctrLink);
            if (ad.verdict === "🟢") b.bestVerdictCount += 1;
            if (ad.verdict === "🔴") b.worstVerdictCount += 1;
        } else {
            const o = agg.byObjective.other;
            const oldCount = o.count;
            o.count += 1;
            o.avgLinkCtr = incrementalMean(o.avgLinkCtr, oldCount, ad.ctrLink);
        }

        // byGeoTier — only counts on the conversion bucket
        if (isConversion) {
            const g = agg.byGeoTier[ad.geoTier];
            const oldCount = g.count;
            g.count += 1;
            g.avgCtr = incrementalMean(g.avgCtr, oldCount, ad.ctrLink);
        }

        // byAudienceType — only counts on the conversion bucket
        if (isConversion) {
            const a = agg.byAudienceType[ad.audienceType];
            const oldCount = a.count;
            a.count += 1;
            a.avgCtr = incrementalMean(a.avgCtr, oldCount, ad.ctrLink);
        }

        agg.sampleSize += 1;
        agg.lastUpdated = Date.now();
        out.set(angleKey, agg);
    }
    return out;
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

function cloneHookAggregate(agg: HookPerformanceAggregate): HookPerformanceAggregate {
    return {
        angleKey: agg.angleKey,
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

// ─── Visual pattern aggregate ────────────────────────────────

/**
 * Build / update the per-patternKey visual aggregates from the worker's
 * ad loop. Same idempotency + return-shape contract as
 * `updateHookAggregates`.
 */
export function updateVisualAggregates(
    ads: ReadonlyArray<AdForLearning>,
    existing: ReadonlyArray<VisualPerformanceAggregate>,
): Map<string, VisualPerformanceAggregate> {
    const out = new Map<string, VisualPerformanceAggregate>();
    for (const agg of existing) {
        out.set(agg.patternKey, cloneVisualAggregate(agg));
    }

    for (const ad of ads) {
        if (!isEligibleForLearning(ad)) continue;
        const patternKey = computePatternKey(
            ad.layoutTemplate,
            ad.creativeModes,
            ad.artDirection,
            ad.universe,
        );
        if (patternKey === "") continue;
        const agg = out.get(patternKey) ?? emptyVisualAggregateFor(patternKey);

        const isConversion = ad.campaignObjective === "conversion";
        if (isConversion) {
            const b = agg.byObjective.conversion;
            const oldCount = b.count;
            b.count += 1;
            b.avgCpm = incrementalMean(b.avgCpm, oldCount, ad.cpm3d);
            b.avgLinkCtr = incrementalMean(b.avgLinkCtr, oldCount, ad.ctrLink);
            if (ad.verdict === "🟢") b.bestVerdictCount += 1;
            if (ad.verdict === "🔴") b.worstVerdictCount += 1;
        } else {
            agg.byObjective.other.count += 1;
        }

        if (isConversion) {
            const g = agg.byGeoTier[ad.geoTier];
            const oldCount = g.count;
            g.count += 1;
            g.avgCpm = incrementalMean(g.avgCpm, oldCount, ad.cpm3d);
            g.avgCtr = incrementalMean(g.avgCtr, oldCount, ad.ctrLink);
        }

        if (isConversion) {
            const a = agg.byAudienceType[ad.audienceType];
            const oldCount = a.count;
            a.count += 1;
            a.avgCpm = incrementalMean(a.avgCpm, oldCount, ad.cpm3d);
            a.avgCtr = incrementalMean(a.avgCtr, oldCount, ad.ctrLink);
        }

        agg.sampleSize += 1;
        agg.lastUpdated = Date.now();
        out.set(patternKey, agg);
    }
    return out;
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

// ─── Helper: incremental mean (Welford-style, no deps) ────────

/**
 * Update a running mean in O(1). Returns the new mean after `count+1`
 * samples with the latest value being `next`. The previous mean is `current`
 * and the previous count is `count`.
 */
function incrementalMean(current: number, count: number, next: number): number {
    if (count === 0) return next;
    // (count * current + next) / (count + 1), rounded to 2dp for stable reads.
    const m = (count * current + next) / (count + 1);
    return Math.round(m * 100) / 100;
}
