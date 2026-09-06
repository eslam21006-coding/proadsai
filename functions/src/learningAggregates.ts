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
    /**
     * T024: schema version. Records below the current version are
     * read as absent by the worker (FR-042/43). Workers emit the
     * current version on every write. Optional in the type for backward compatibility.
     */
    schemaVersion?: number;
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
