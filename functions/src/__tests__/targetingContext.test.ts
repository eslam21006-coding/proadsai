// functions/src/__tests__/targetingContext.test.ts
// Phase 14 — Layer 2/3/4 pure module unit tests. node:test runner.
// Mirrors the gazeMap.test.ts / conceptDirector.test.ts source style.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    classifyGeoTier,
    classifyGeoTierFromList,
    classifyGeoTierFromTargeting,
    classifyAudienceType,
    classifyTargeting,
    extractCountryFromTargeting,
    ALL_GEO_TIERS,
    ALL_AUDIENCE_TYPES,
    type GeoTier,
    type AudienceType,
} from "../targetingContext.js";

// ─── Geo tier classifier ──────────────────────────────────────

test("classifyGeoTier — tier1_gulf on GCC codes (case-insensitive)", () => {
    assert.equal(classifyGeoTier("AE"), "tier1_gulf");
    assert.equal(classifyGeoTier("sa"), "tier1_gulf");
    assert.equal(classifyGeoTier("KW"), "tier1_gulf");
    assert.equal(classifyGeoTier("QA"), "tier1_gulf");
    assert.equal(classifyGeoTier("BH"), "tier1_gulf");
    assert.equal(classifyGeoTier("OM"), "tier1_gulf");
});

test("classifyGeoTier — tier1_gulf on English name variants", () => {
    assert.equal(classifyGeoTier("United Arab Emirates"), "tier1_gulf");
    assert.equal(classifyGeoTier("Saudi Arabia"), "tier1_gulf");
});

test("classifyGeoTier — tier2_diaspora on Western codes", () => {
    assert.equal(classifyGeoTier("US"), "tier2_diaspora");
    assert.equal(classifyGeoTier("USA"), "tier2_diaspora");
    assert.equal(classifyGeoTier("ca"), "tier2_diaspora");
    assert.equal(classifyGeoTier("GB"), "tier2_diaspora");
    assert.equal(classifyGeoTier("Germany"), "tier2_diaspora");
});

test("classifyGeoTier — tier3_egypt_na on MENA codes", () => {
    assert.equal(classifyGeoTier("EG"), "tier3_egypt_na");
    assert.equal(classifyGeoTier("ma"), "tier3_egypt_na");
    assert.equal(classifyGeoTier("TN"), "tier3_egypt_na");
});

test("classifyGeoTier — unknown → fail-safe tier3_egypt_na", () => {
    assert.equal(classifyGeoTier("ZZ"), "tier3_egypt_na");
    assert.equal(classifyGeoTier(""), "tier3_egypt_na");
    assert.equal(classifyGeoTier(null), "tier3_egypt_na");
    assert.equal(classifyGeoTier(undefined), "tier3_egypt_na");
    assert.equal(classifyGeoTier("Atlantis"), "tier3_egypt_na");
});

test("classifyGeoTierFromList — first matched tier wins, falls through on no-match", () => {
    assert.equal(classifyGeoTierFromList(["ZZ", "AE", "US"]), "tier1_gulf");
    assert.equal(classifyGeoTierFromList(["ZZ", "EG"]), "tier3_egypt_na");
    assert.equal(classifyGeoTierFromList([]), "tier3_egypt_na");
    assert.equal(classifyGeoTierFromList(null), "tier3_egypt_na");
});

test("extractCountryFromTargeting — reads code, then name, then region name, then cities[].country/name", () => {
    assert.equal(extractCountryFromTargeting({ geo_locations: { countries: [{ code: "AE" }] } }), "AE");
    assert.equal(extractCountryFromTargeting({ geo_locations: { countries: [{ name: "Saudi Arabia" }] } }), "Saudi Arabia");
    assert.equal(extractCountryFromTargeting({ geo_locations: { regions: [{ name: "California" }] } }), "California");
    // cities[].country wins over cities[].name — country is the authoritative
    // tiering signal; a city name like "Riyadh" is not a country and would
    // mis-tier as the tier3 fall-through.
    assert.equal(extractCountryFromTargeting({ geo_locations: { cities: [{ name: "Riyadh", country: "SA" }] } }), "SA");
    // cities[].country fallback when no .name.
    assert.equal(extractCountryFromTargeting({ geo_locations: { cities: [{ country: "AE" }] } }), "AE");
    // cities[].name fallback when no .country (last-resort signal).
    assert.equal(extractCountryFromTargeting({ geo_locations: { cities: [{ name: "Riyadh" }] } }), "Riyadh");
    assert.equal(extractCountryFromTargeting({ geo_locations: { countries: [] } }), null);
    assert.equal(extractCountryFromTargeting({}), null);
    assert.equal(extractCountryFromTargeting(null), null);
});

test("classifyGeoTierFromTargeting — convenience pipe", () => {
    assert.equal(
        classifyGeoTierFromTargeting({ geo_locations: { countries: [{ code: "sa" }] } }),
        "tier1_gulf",
    );
    assert.equal(
        classifyGeoTierFromTargeting({ geo_locations: { countries: [{ code: "ZZ" }] } }),
        "tier3_egypt_na",
    );
});

// ─── Audience-type classifier ─────────────────────────────────

test("classifyAudienceType — retargeting: custom_audiences present", () => {
    assert.equal(
        classifyAudienceType({ custom_audiences: [{ id: "abc" }] }),
        "retargeting",
    );
});

test("classifyAudienceType — retargeting: tiny audience_size_lower_bound", () => {
    assert.equal(classifyAudienceType({ audience_size_lower_bound: 100 }), "retargeting");
    assert.equal(classifyAudienceType({ audience_size_lower_bound: 999 }), "retargeting");
});

test("classifyAudienceType — lookalike wins over interest when no retargeting", () => {
    assert.equal(
        classifyAudienceType({ lookalike_spec: [{ country: "US" }] }),
        "lookalike",
    );
});

test("classifyAudienceType — interest: flexible_spec OR interests OR behaviors", () => {
    assert.equal(
        classifyAudienceType({ flexible_spec: [{ interests: [{ id: "1" }] }] }),
        "interest",
    );
    assert.equal(classifyAudienceType({ interests: [{ id: "1" }] }), "interest");
    assert.equal(classifyAudienceType({ behaviors: [{ id: "1" }] }), "interest");
});

test("classifyAudienceType — advantage_plus: advantage_audience or targeting_optimization", () => {
    assert.equal(classifyAudienceType({ advantage_audience: [{}] }), "advantage_plus");
    assert.equal(classifyAudienceType({ targeting_optimization: "expansion" }), "advantage_plus");
});

test("classifyAudienceType — broad: no targeting signals", () => {
    assert.equal(classifyAudienceType({}), "broad");
    assert.equal(classifyAudienceType(null), "broad");
    assert.equal(
        classifyAudienceType({ audience_size_lower_bound: 50_000 }),
        "broad",
    );
});

test("classifyAudienceType — retargeting outranks lookalike", () => {
    assert.equal(
        classifyAudienceType({
            custom_audiences: [{ id: "abc" }],
            lookalike_spec: [{ country: "US" }],
        }),
        "retargeting",
    );
});

// ─── classifyTargeting (combined) ─────────────────────────────

test("classifyTargeting — both fields populated from one payload", () => {
    const ctx = classifyTargeting({
        geo_locations: { countries: [{ code: "AE" }] },
        custom_audiences: [{ id: "x" }],
    });
    assert.equal(ctx.geoTier, "tier1_gulf");
    assert.equal(ctx.audienceType, "retargeting");
});

test("classifyTargeting — empty payload → both fail-safe defaults", () => {
    const ctx = classifyTargeting({});
    assert.equal(ctx.geoTier, "tier3_egypt_na");
    assert.equal(ctx.audienceType, "broad");
});

// ─── Membership sets / taxonomy ───────────────────────────────

test("ALL_GEO_TIERS / ALL_AUDIENCE_TYPES export the 3 + 5 canonical values", () => {
    assert.equal(ALL_GEO_TIERS.length, 3);
    assert.deepEqual(new Set(ALL_GEO_TIERS), new Set<GeoTier>(["tier1_gulf", "tier2_diaspora", "tier3_egypt_na"]));
    assert.equal(ALL_AUDIENCE_TYPES.length, 5);
    assert.deepEqual(new Set(ALL_AUDIENCE_TYPES), new Set<AudienceType>(["broad", "interest", "lookalike", "retargeting", "advantage_plus"]));
});