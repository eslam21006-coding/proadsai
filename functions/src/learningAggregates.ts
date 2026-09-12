// functions/src/learningAggregates.ts — Phase 14 Layer 4b types + pattern-key helpers
// ═══════════════════════════════════════════════════════════
// PURE module (no Firestore / network). Provides:
//   - Type definitions for the additive hook/visual aggregate shapes
//     (`HookPerformanceAggregate`, `VisualPerformanceAggregate`) and the
//     per-ad input shape (`AdForLearning`) consumed by the worker in
//     `metaSync/shared.ts`.
//   - `computePatternKey(...)` — deterministic hash of the visual pattern
//     components used by the worker to group rows into visual aggregate
//     keys.
//
// History: this module originally exported two OVERWRITE-semantics
// aggregators (`updateHookAggregates` / `updateVisualAggregates`) plus a
// cohort of private helpers. The Batch 06 deletion table documented
// their removal, but the code was left in place — the chain kept running
// only because stale compiled `.js` artifacts survived in the
// gitignored `lib/`. Batch 11 retires them properly:
//   - `updateHookAggregates`, `updateVisualAggregates`, `HookAccumulator`,
//     `VisualAccumulator`, `emptyHookAggregateFor`, `emptyVisualAggregateFor`,
//     `isEligibleForLearning`, `round2` — all deleted.
//   - The additive replacements in `learning/aggregateDelta.ts`
//     (`applyHookAggregatesDelta`, `applyVisualAggregatesDelta`) are what
//     the worker now calls.
// ═══════════════════════════════════════════════════════════

import { resolveCanonicalAngle } from "./canonicalAngle.js";

// ─── Types ─────────────────────────────────────────────────────

export type LearningVerdict = "🟢" | "🟡" | "🔴" | "🛟" | "⏳";

/**
 * FR-027 (Phase 969 T047): the per-funnel-type breakdown keys. The four
 * funnel types are the owner's funnel taxonomy
 * (`paid_event | paid_product | free_webinar | lead_magnet_call`); the
 * `unknown` bucket is the explicit home for rows whose funnel attribution
 * could not be resolved (FR-032 — receives no same-funnel weighting; never
 * matches a requested type; still counts toward headline totals).
 */
export type FunnelTypeBucketKey =
    | "paid_event"
    | "paid_product"
    | "free_webinar"
    | "lead_magnet_call"
    | "unknown";

/** Per-funnel-type bucket shared by hook + visual aggregates. */
export interface FunnelTypeBucket {
    count: number;
}

/** Whole per-funnel-type breakdown on a hook or visual aggregate. */
export interface ByFunnelTypeBreakdown {
    paid_event: FunnelTypeBucket;
    paid_product: FunnelTypeBucket;
    free_webinar: FunnelTypeBucket;
    lead_magnet_call: FunnelTypeBucket;
    unknown: FunnelTypeBucket;
}

export const EMPTY_BY_FUNNEL_TYPE: ByFunnelTypeBreakdown = {
    paid_event: { count: 0 },
    paid_product: { count: 0 },
    free_webinar: { count: 0 },
    lead_magnet_call: { count: 0 },
    unknown: { count: 0 },
};

/**
 * Per-funnel-type breakdown shared by hook + visual aggregates.
 *
 * **The counts are ROW counts, not creative counts.** Every contributing
 * row attributes once to one of the four real funnel buckets or to
 * the explicit `unknown` bucket (FR-032). The shape mirrors
 * `byObjective.conversion.count`: non-decreasing under FR-020a's
 * additive contract, all-rows semantics.
 *
 * **Why this matters for the FR-030 weighting path.** `isMultiFunnel`
 * (Batch 17 source of truth in `whatsWorkingDashboard.ts`) only
 * reads the >0 boolean per bucket, so row counts suffice for the
 * FR-041 boolean indicator. The retrieval-side SAME-FUNNEL WEIGHTING
 * that FR-030 will need is a different surface — it must weigh
 * by **distinct creatives** per funnel (the FR-073 unit of evidence),
 * not by raw row count. If FR-030's landing reads `byFunnelType`
 * directly, one creative fanned across 55 rows under one funnel
 * outweighs a creative in another funnel 55:1 in any
 * popularity-weighted score. That is exactly the same 7.4:1 fan-out
 * inflation Batch 06 closed with `creativeCount` and
 * `contributedCreatives` on `byObjective`, rebuilt here per funnel.
 *
 * **The implementation path when FR-030 lands:** mirror
 * `HookWorkingAggregate.contributedCreatives` (a `Set<creativeKey>`
 * per bucket) AND expose a `byFunnelTypeCreativeCount:
 * Partial<Record<FunnelTypeBucketKey, number>>` field — populated
 * alongside `count` in `applyAdToHook`/`applyAdToVisual`. Do NOT
 * consume `byFunnelType.count` directly for retrieval weighting;
 * the dashboard's `multiFunnel` boolean is the ONLY legitimate
 * current consumer (Batch 17 owner audit). The seam of "
 * `count` per bucket, weighted by row count" is a known production
 * hazard worth not repeating.
 *
 * FR-027 requires the field to exist; FR-030 will require the
 * unit to change. The seam is "row counts are sufficient for the
 * FR-041 boolean, but FR-030's retrieval weighting must not consume
 * these directly." This note exists so the FR-030 implementer
 * does not need to re-learn the unit mismatch.
 */

/** Mirrors the data-model §5 hookPerformance aggregate. */
export interface HookPerformanceAggregate {
    angleKey: string;
    /**
     * T024: schema version. Records below the current version are
     * read as absent by the worker (FR-042/43). Workers emit the
     * current version on every write. Optional in the type for
     * backward compatibility with test fixtures that pre-date T024 —
     * readers treat a missing value as version 0 (below current).
     */
    schemaVersion?: number;
    /**
     * T021: count of distinct creatives that have contributed to
     * this angle (FR-036, FR-073). One creative = one count, regardless
     * of how many rows it carries. Distinct from `sampleSize` (rows)
     * and the per-bucket `count` fields (also rows). Optional for
     * backward compatibility with older fixtures.
     */
    creativeCount?: number;
    /**
     * Batch 28 (Fix B, FR-036) — the creative keys behind {@link creativeCount}.
     *
     * `creativeCount` is DERIVED from this array's length; the array is the
     * state. It exists because the dedup set has to survive the sync: it was
     * previously an in-memory `Set` that was stripped before persisting and
     * re-initialised empty on read, so the same creative re-incremented the
     * count on every sync and `creativeCount` became a count of
     * creative-sync-OBSERVATIONS. FR-036 forbids exactly that: "Neither
     * repeated observation across syncs nor multiplicity of ad rows may
     * inflate the count."
     *
     * WHY PERSISTED RATHER THAN RE-DERIVED ON READ. Re-deriving the set from
     * the per-row ledger entries would mean reading every ad row for the
     * account on every sync — the unbounded collection scan FR-068 removed.
     * Persisting is bounded by DISTINCT CREATIVES per angle (not rows, not
     * syncs), which is the smallest quantity that can answer the question.
     *
     * Optional on read: absent means "no creative recorded yet", which is
     * correct for every record written before this field existed — no
     * production record carries `creativeCount` at all, since both it and
     * this field are new in Phase 969 and unmerged.
     */
    contributedCreativeKeys?: string[];
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
    /**
     * FR-027 (Phase 969 T047) per-funnel-type breakdown. Optional on
     * read for forward compatibility — readers MUST default to
     * {@link EMPTY_BY_FUNNEL_TYPE} when the field is absent (older
     * aggregates from before T047). The dashboard's multi-funnel
     * indication reads from this field (FR-041); see `isMultiFunnel`
     * in `whatsWorkingDashboard.ts` for the source of truth.
     */
    byFunnelType?: ByFunnelTypeBreakdown;
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
    /**
     * T024: schema version. Records below the current version are
     * read as absent by the worker (FR-042/43). Workers emit the
     * current version on every write. Optional in the type for backward compatibility.
     */
    schemaVersion?: number;
    patternKey: string;
    /**
     * Batch 30 (FR-036, FR-073) — distinct creatives contributing to this
     * VISUAL pattern. The hook aggregate has carried this since Batch 28;
     * the visual one did not, while the dashboard read it regardless
     * (`whatsWorkingDashboard.ts:787`, `sampleSize: v.creativeCount ?? 0`)
     * and fed it to `pickHotAngle` against a gate of 3 — so `visualHotKey`
     * was always null and no visual pattern could ever be awarded the icon.
     *
     * DERIVED from {@link contributedCreativeKeys}.length, never incremented
     * independently, so the two cannot disagree.
     */
    creativeCount?: number;
    /**
     * Batch 30 — the creative keys behind {@link creativeCount}. Persisted
     * for the same reason as the hook equivalent: reconstructing the set from
     * per-row ledger entries would mean re-reading every ad row per sync,
     * which is the unbounded scan FR-068 removed. Bounded by distinct
     * creatives per pattern — not rows, not syncs.
     */
    contributedCreativeKeys?: string[];
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
    /** FR-027 per-funnel-type breakdown — see HookPerformanceAggregate. */
    byFunnelType?: ByFunnelTypeBreakdown;
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
    /**
     * T021: creative key. The unit of evidence for learning (FR-073).
     * Set by the worker from `groupIntoCreatives`. When absent (older
     * test fixtures), the aggregator falls back to per-row identity so
     * the test surface stays compatible.
     */
    creativeKey?: string;
    /** Generation id (matched). Required for hook + pattern aggregates. */
    generationId: string | null;
    /** Match type from the worker — `null` ads are SKIPPED. */
    matchType: "auto_hash" | "manual" | null;
    /** The delete-cascade flag — `false` SKIPS the ad from learning. */
    metadataAvailable: boolean;
    /** "conversion" | "other" — controls the byObjective bucket. */
    campaignObjective: "conversion" | "other";
    /**
     * FR-027 (Phase 969 T047): the funnel type attributed to this row
     * from the workspace's funnel settings at sync time. Required
     * by the worker's read path; older fixtures and tests that omit
     * it fall back to `unknown` inside the aggregator (FR-032 — the
     * unknown bucket still counts toward headline totals).
     */
    funnelType?: FunnelTypeBucketKey;
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

/**
 * Resolve an ad row's `funnelType` to a known bucket. Falls back to
 * `"unknown"` for any input that is absent, malformed, or outside
 * the four funnel types. Per FR-032 unknown evidence still counts
 * toward headline totals — receiving bucket, not disqualifying bucket.
 */
export function resolveFunnelTypeBucketKey(raw: unknown): FunnelTypeBucketKey {
    if (raw === "paid_event" || raw === "paid_product"
        || raw === "free_webinar" || raw === "lead_magnet_call") return raw;
    return "unknown";
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
