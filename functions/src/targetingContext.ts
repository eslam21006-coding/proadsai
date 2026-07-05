// functions/src/targetingContext.ts — Phase 14 Layer 2/3/4 targeting context
// ═══════════════════════════════════════════════════════════
// PURE module (no Firebase / Gemini imports). Classifies Meta targeting
// signals (geo + audience type) so the verdict engine and learning
// aggregates can bucket ads by context without depending on Meta's full
// targeting payload (which is large and version-dependent).
//
// Spec references: spec.md §3.1.6 (targeting context), research.md §G
// (three context dimensions: geo tier, audience type, campaign objective).
//
// OUTPUT SCHEMA (closed):
//   geoTier:        'tier1_gulf' | 'tier2_diaspora' | 'tier3_egypt_na'
//   audienceType:   'broad' | 'interest' | 'lookalike' | 'retargeting' | 'advantage_plus'
//
// FAIL-SAFE: unknown inputs resolve to the lowest-priority bucket so a
// missing signal never silently promotes an ad into the learned bucket.
//   geoTier       → 'tier3_egypt_na' (lowest volume)
//   audienceType  → 'broad'             (lowest specificity)
//
// Both classifiers are pure functions — deterministic, no I/O, no model
// call. Trivially unit-testable against a table.

import {
    TARGETING_GEO_TIERS,
    TARGETING_AUDIENCE_TYPES,
} from "./targetingContext.constants.js";

export type GeoTier = "tier1_gulf" | "tier2_diaspora" | "tier3_egypt_na";
export type AudienceType =
    | "broad"
    | "interest"
    | "lookalike"
    | "retargeting"
    | "advantage_plus";

export interface TargetingContext {
    geoTier: GeoTier;
    audienceType: AudienceType;
}

// ─── Geo tier classifier ──────────────────────────────────────

/**
 * Normalize a country/locale string for matching. Lowercases, trims, strips
 * surrounding brackets (the repo rule — Gemini literal-copy hazard
 * notwithstanding, this is server-side and safe but consistent with the
 * project's normalization conventions).
 */
function normalizeCountry(input: string): string {
    return input.toLowerCase().trim();
}

/**
 * Classify a single country code/name into one of the 3 geo tiers.
 * Pure. Unknown → 'tier3_egypt_na' (fail-safe, lowest priority).
 */
export function classifyGeoTier(country: string | null | undefined): GeoTier {
    if (!country || typeof country !== "string") return "tier3_egypt_na";
    const c = normalizeCountry(country);
    for (const [tier, members] of Object.entries(TARGETING_GEO_TIERS) as Array<[GeoTier, ReadonlySet<string>]>) {
        if (members.has(c)) return tier;
    }
    return "tier3_egypt_na";
}

/**
 * Classify a list of country codes/names by majority. Used when the ad set
 * targets multiple geos (Meta supports geo arrays). Returns the tier of
 * the FIRST matched country (deterministic; ties broken by document order).
 * If no countries match any tier, returns the fail-safe default.
 */
export function classifyGeoTierFromList(countries: ReadonlyArray<string> | null | undefined): GeoTier {
    if (!Array.isArray(countries) || countries.length === 0) return "tier3_egypt_na";
    for (const c of countries) {
        const tier = classifyGeoTier(c);
        if (tier !== "tier3_egypt_na") return tier;
    }
    return "tier3_egypt_na";
}

/**
 * Best-effort extract of a country signal from a Meta targeting payload.
 * Looks for `targeting.geo_locations.countries[0].code`, then falls back to
 * `targeting.geo_locations.regions[0].name` / `cities[0].name`. Returns null
 * if nothing readable is present.
 */
export function extractCountryFromTargeting(targeting: unknown): string | null {
    if (!targeting || typeof targeting !== "object") return null;
    const t = targeting as Record<string, unknown>;
    const geo = t.geo_locations as Record<string, unknown> | undefined;
    if (geo && Array.isArray(geo.countries) && geo.countries.length > 0) {
        const first = geo.countries[0] as Record<string, unknown> | string;
        if (typeof first === "string") return first;
        if (first && typeof first === "object" && "code" in first && typeof first.code === "string") {
            return first.code;
        }
        if (first && typeof first === "object" && "name" in first && typeof first.name === "string") {
            return first.name;
        }
    }
    if (geo && Array.isArray(geo.regions) && geo.regions.length > 0) {
        const first = geo.regions[0] as Record<string, unknown> | string;
        if (typeof first === "string") return first;
        if (first && typeof first === "object" && "name" in first && typeof first.name === "string") {
            return first.name;
        }
    }
    return null;
}

/**
 * Convenience: classify a Meta `targeting` payload into a GeoTier without
 * manually extracting countries.
 */
export function classifyGeoTierFromTargeting(targeting: unknown): GeoTier {
    const country = extractCountryFromTargeting(targeting);
    return classifyGeoTier(country);
}

// ─── Audience-type classifier ─────────────────────────────────

/**
 * Classify a Meta ad set's audience type from its targeting payload. Looks
 * at `targeting.custom_audiences`, `targeting.lookalike_spec`, `flexible_spec`,
 * and `targeting.audience_size_lower_bound`. Returns the highest-priority
 * match in this order:
 *
 *   1. retargeting     — any custom_audience OR has audience_size_lower_bound ≤ 1000
 *   2. lookalike       — any lookalike_spec present
 *   3. interest        — any flexible_spec OR interests present (non-broad)
 *   4. advantage_plus  — any advantageaudience OR `targeting.targeting_optimization` set
 *   5. broad           — none of the above
 *
 * Order matters. A retargeting+lookalike ad (possible) becomes 'retargeting'.
 */
export function classifyAudienceType(targeting: unknown): AudienceType {
    if (!targeting || typeof targeting !== "object") return "broad";
    const t = targeting as Record<string, unknown>;

    // 1. Retargeting: custom audiences present, OR a tiny audience size
    if (Array.isArray(t.custom_audiences) && t.custom_audiences.length > 0) {
        return "retargeting";
    }
    if (typeof t.audience_size_lower_bound === "number" && t.audience_size_lower_bound > 0 && t.audience_size_lower_bound <= 1000) {
        return "retargeting";
    }
    if (typeof t.audience_size_lower_bound === "number" && t.audience_size_lower_bound === 0) {
        // Audience size 0 with no exclusions usually means a very tight retargeting.
        // But we can't disambiguate from "no data" — fall through to other signals.
    }

    // 2. Lookalike
    if (Array.isArray(t.lookalike_spec) && t.lookalike_spec.length > 0) return "lookalike";

    // 3. Interest
    const hasInterestSignal =
        (Array.isArray(t.flexible_spec) && t.flexible_spec.length > 0) ||
        (Array.isArray(t.interests) && t.interests.length > 0) ||
        (Array.isArray(t.behaviors) && t.behaviors.length > 0);
    if (hasInterestSignal) return "interest";

    // 4. Advantage+ (Meta's audience-expansion flag)
    if (Array.isArray(t.advantage_audience) && t.advantage_audience.length > 0) return "advantage_plus";
    if (typeof t.targeting_optimization === "string" && t.targeting_optimization.length > 0) return "advantage_plus";

    // 5. Broad — no targeting signals
    return "broad";
}

/**
 * Convenience: assemble the full TargetingContext from a single Meta
 * targeting payload. Both fields are computed and returned together so
 * downstream code can pass one object.
 */
export function classifyTargeting(targeting: unknown): TargetingContext {
    return {
        geoTier: classifyGeoTierFromTargeting(targeting),
        audienceType: classifyAudienceType(targeting),
    };
}

// ─── Allowed-set exports (for test verification) ──────────────

export const ALL_GEO_TIERS: ReadonlyArray<GeoTier> = [
    "tier1_gulf",
    "tier2_diaspora",
    "tier3_egypt_na",
];

export const ALL_AUDIENCE_TYPES: ReadonlyArray<AudienceType> = [
    "advantage_plus",
    "broad",
    "interest",
    "lookalike",
    "retargeting",
];

// Re-export membership sets for downstream switch-on-string utilities.
export { TARGETING_GEO_TIERS, TARGETING_AUDIENCE_TYPES };