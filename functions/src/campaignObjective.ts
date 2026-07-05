// functions/src/campaignObjective.ts — Phase 14 Layer 4/5 campaign-objective gating
// ═══════════════════════════════════════════════════════════
// PURE module. Classifies Meta campaign objectives into one of two buckets:
//
//   'conversion' — the campaign is optimized to drive a measurable business
//                  outcome (sales, leads, app events, etc). This is the only
//                  bucket that FEEDS learning, RAG, icons, and
//                  `pastWinningAds` (research §G, spec §5.6).
//
//   'other'      — everything else (awareness, reach, engagement, traffic,
//                  video views, store visits, lead-form views). For 'other':
//                    - K3 (dead-hook) and K4 (creative decay) MAY fire (they
//                      are creative-quality checks that hold regardless of
//                      objective);
//                    - CB1/CB2/K1/K2/K5/K6/K7/fatigue/S1 are DISABLED;
//                    - the ad NEVER becomes a winner;
//                    - the ad NEVER feeds learning, RAG, or `pastWinningAds`.
//
// Spec §5.6 — "an unrecognized objective can never pollute conversion
// learning". Anything not in the known-conversion set resolves to 'other'.
// ═══════════════════════════════════════════════════════════

export type CampaignObjectiveBucket = "conversion" | "other";

export interface CampaignObjectiveResult {
    /** The canonical bucket. */
    bucket: CampaignObjectiveBucket;
    /** The original Meta objective string (echoed for trace). */
    raw: string;
}

/**
 * Canonical Meta campaign-objective names that drive the
 * 'conversion' bucket. The approved list per spec §5.6 is intentionally
 * closed and lowercase. Only the seven objectives explicitly approved by
 * the project are recognized as conversion-oriented:
 *
 *   - Direct sales / revenue: OUTCOME_SALES, SALES, CONVERSIONS,
 *     PRODUCT_CATALOG_SALES
 *   - Lead generation (any form): OUTCOME_LEADS, LEAD_GENERATION, LEADS
 *
 * Anything else — including `MESSAGES` (engagement), `APP_INSTALLS` /
 * `APP_EVENTS` (legacy app-tracking, not part of SC-12), and
 * `OFFSITE_CONVERSIONS` (deprecated catalog path) — resolves to `other`
 * so it cannot pollute conversion learning, RAG, or `pastWinningAds`
 * (research §F: "fail-safe unknown → other").
 */
export const CONVERSION_OBJECTIVES: ReadonlySet<string> = new Set<string>([
    // Direct sales / revenue
    "outcome_sales",
    "sales",
    "conversions",
    "product_catalog_sales",
    // Lead generation (any form)
    "outcome_leads",
    "lead_generation",
    "leads",
]);

/**
 * Classify a Meta campaign objective string into a CampaignObjectiveBucket.
 * Pure, deterministic, fail-safe. Always returns a result.
 *
 * @param objective Raw Meta objective string (e.g. from `campaign.objective`)
 *                  — may be null/undefined/non-string for safety.
 */
export function classifyCampaignObjective(objective: unknown): CampaignObjectiveResult {
    if (typeof objective !== "string") {
        return { bucket: "other", raw: "" };
    }
    const norm = objective.toLowerCase().trim();
    if (norm === "") return { bucket: "other", raw: objective };
    if (CONVERSION_OBJECTIVES.has(norm)) {
        return { bucket: "conversion", raw: objective };
    }
    return { bucket: "other", raw: objective };
}

/**
 * Convenience: returns just the bucket (no raw echo) for use in switch-on-string
 * patterns. Equivalent to `classifyCampaignObjective(o).bucket`.
 */
export function campaignObjectiveBucket(objective: unknown): CampaignObjectiveBucket {
    return classifyCampaignObjective(objective).bucket;
}

/**
 * Whether the given objective is the kind of campaign that should feed
 * winners, learning, RAG, and `pastWinningAds`. Equivalent to
 * `campaignObjectiveBucket(o) === 'conversion'`.
 */
export function isConversionObjective(objective: unknown): boolean {
    return campaignObjectiveBucket(objective) === "conversion";
}

/**
 * Verdict-rule gating predicate (spec §5.6). For an 'other' objective, ONLY
 * K3 and K4 are allowed to fire (creative-quality checks that hold
 * regardless of objective). CB1/CB2/K1/K2/K5/K6/K7/fatigue/S1 are blocked.
 *
 * @param ruleCode The Qarar rule code being evaluated (e.g. "K3", "CB2", "S1").
 * @param bucket The campaign's objective bucket (from `campaignObjectiveBucket`).
 */
export function isRuleAllowedForObjective(
    ruleCode: string,
    bucket: CampaignObjectiveBucket,
): boolean {
    // K3 (dead-hook) and K4 (creative decay) are the only creative-quality
    // checks that hold regardless of objective.
    const alwaysAllowed = new Set<string>(["K3", "K4"]);
    if (alwaysAllowed.has(ruleCode)) return true;
    // Everything else is conversion-only.
    return bucket === "conversion";
}

/** All canonical Meta objectives known to classify as 'conversion'. */
export const ALL_CONVERSION_OBJECTIVES: ReadonlyArray<string> = Array.from(CONVERSION_OBJECTIVES).sort();

/** The two canonical buckets (for type guards / exhaustive switches). */
export const ALL_OBJECTIVE_BUCKETS: ReadonlyArray<CampaignObjectiveBucket> = ["conversion", "other"];