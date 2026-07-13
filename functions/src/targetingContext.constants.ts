// functions/src/targetingContext.constants.ts — Phase 14 Layer 2/3/4 geo/audience tables
// ═══════════════════════════════════════════════════════════
// Country-to-tier lookup table + canonical audience-type membership sets.
// Kept in a separate `.constants.ts` file so the pure classifier
// (`targetingContext.ts`) imports only typed structures and the constants
// can be unit-tested without dragging in the classifier logic.
//
// Tier definitions (spec §3.1.6 — informed by the Arabic ad market):
//   tier1_gulf       — high-spend GCC ad market (primary revenue target)
//   tier2_diaspora   — Arabic-speaking diaspora worldwide (USD/EUR pricing)
//   tier3_egypt_na   — Egypt + North Africa (lowest CPM, lowest CPA, smallest AOV)
//
// Membership is intentionally case-insensitive at the classifier level; the
// table stores lowercase canonical entries to keep lookups deterministic.
// ═══════════════════════════════════════════════════════════

import type { GeoTier, AudienceType } from "./targetingContext.js";

export const TARGETING_GEO_TIERS: Readonly<Record<GeoTier, ReadonlySet<string>>> = {
    tier1_gulf: new Set<string>([
        // ISO-3166-1 alpha-2 codes
        "ae", "sa", "kw", "qa", "bh", "om",
        // Common English spellings (lowercase canonical)
        "united arab emirates", "saudi arabia", "kuwait", "qatar", "bahrain", "oman",
        // Meta sometimes returns localized names
        "الإمارات", "السعودية", "الكويت", "قطر", "البحرين", "عمان",
    ]),
    tier2_diaspora: new Set<string>([
        // Major Western markets with Arabic-speaking populations
        "us", "usa", "united states", "ca", "canada", "gb", "uk", "united kingdom",
        "de", "germany", "fr", "france", "se", "sweden", "no", "norway", "dk", "denmark",
        "nl", "netherlands", "it", "italy", "es", "spain", "au", "australia",
    ]),
    tier3_egypt_na: new Set<string>([
        "eg", "egypt", "ma", "morocco", "tn", "tunisia", "dz", "algeria", "ly", "libya",
        "sd", "sudan", "iq", "iraq", "jo", "jordan", "lb", "lebanon", "ps", "palestine",
        "ye", "yemen", "sy", "syria",
        "مصر", "المغرب", "تونس", "الجزائر", "ليبيا", "السودان", "العراق", "الأردن",
        "لبنان", "فلسطين", "اليمن", "سوريا",
    ]),
};

// Membership sets for switch-on-string patterns + downstream type checks.
export const TARGETING_AUDIENCE_TYPES: Readonly<Record<AudienceType, true>> = {
    broad: true,
    interest: true,
    lookalike: true,
    retargeting: true,
    advantage_plus: true,
};