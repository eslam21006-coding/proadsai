// functions/src/__tests__/campaignObjective.test.ts
// Phase 14 — Layer 4/5 pure module unit tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    classifyCampaignObjective,
    campaignObjectiveBucket,
    isConversionObjective,
    isRuleAllowedForObjective,
    CONVERSION_OBJECTIVES,
    ALL_CONVERSION_OBJECTIVES,
    ALL_OBJECTIVE_BUCKETS,
} from "../campaignObjective.js";

// ─── Conversion bucket ────────────────────────────────────────

test("classifyCampaignObjective — outcome_sales → conversion", () => {
    assert.equal(classifyCampaignObjective("OUTCOME_SALES").bucket, "conversion");
    assert.equal(classifyCampaignObjective("sales").bucket, "conversion");
    assert.equal(classifyCampaignObjective("Sales").bucket, "conversion");
});

test("classifyCampaignObjective — outcome_leads / lead_generation → conversion", () => {
    assert.equal(classifyCampaignObjective("OUTCOME_LEADS").bucket, "conversion");
    assert.equal(classifyCampaignObjective("lead_generation").bucket, "conversion");
    assert.equal(classifyCampaignObjective("Leads").bucket, "conversion");
});

test("classifyCampaignObjective — apps / messages / offsite → other (not in approved set)", () => {
    // SC-12: only the seven approved outcomes (OUTCOME_SALES, SALES,
    // CONVERSIONS, PRODUCT_CATALOG_SALES, OUTCOME_LEADS,
    // LEAD_GENERATION, LEADS) feed the conversion bucket. APP_INSTALLS,
    // APP_EVENTS, MESSAGES (engagement), and OFFSITE_CONVERSIONS
    // (deprecated catalog path) are explicitly non-conversion so they
    // cannot pollute learning / RAG / pastWinningAds.
    assert.equal(classifyCampaignObjective("APP_INSTALLS").bucket, "other");
    assert.equal(classifyCampaignObjective("APP_EVENTS").bucket, "other");
    assert.equal(classifyCampaignObjective("app_events").bucket, "other");
    assert.equal(classifyCampaignObjective("MESSAGES").bucket, "other");
    assert.equal(classifyCampaignObjective("messages").bucket, "other");
    assert.equal(classifyCampaignObjective("OFFSITE_CONVERSIONS").bucket, "other");
    assert.equal(classifyCampaignObjective("offsite_conversions").bucket, "other");
});

// ─── Other bucket (non-conversion Meta objectives) ────────────

test("classifyCampaignObjective — awareness / reach / engagement → other", () => {
    for (const obj of [
        "AWARENESS",
        "REACH",
        "BRAND_AWARENESS",
        "POST_ENGAGEMENT",
        "PAGE_LIKES",
        "ENGAGEMENT",
        "VIDEO_VIEWS",
        "TRAFFIC",
        "STORE_VISITS",
        "LEAD_FORM_VIEWS",
    ]) {
        assert.equal(classifyCampaignObjective(obj).bucket, "other", `expected 'other' for ${obj}`);
    }
});

test("classifyCampaignObjective — failed-SPEC objectives (MESSAGES / APP_* / OFFSITE_*) → other", () => {
    // SC-12: these were removed from the conversion set per spec — they
    // previously fed the conversion bucket and must now bucket to 'other'
    // so the verdict path K3/K4-only and learning/RAG protection holds.
    for (const obj of [
        "MESSAGES",
        "APP_INSTALLS",
        "APP_EVENTS",
        "OFFSITE_CONVERSIONS",
    ]) {
        assert.equal(classifyCampaignObjective(obj).bucket, "other", `expected 'other' for ${obj}`);
    }
});

// ─── Fail-safe: unknown / null / non-string ────────────────────

test("classifyCampaignObjective — unknown / null / non-string → other (fail-safe)", () => {
    assert.equal(classifyCampaignObjective("some_future_meta_objective_we_dont_know").bucket, "other");
    assert.equal(classifyCampaignObjective("").bucket, "other");
    assert.equal(classifyCampaignObjective("   ").bucket, "other");
    assert.equal(classifyCampaignObjective(null).bucket, "other");
    assert.equal(classifyCampaignObjective(undefined).bucket, "other");
    assert.equal(classifyCampaignObjective(42).bucket, "other");
    assert.equal(classifyCampaignObjective({}).bucket, "other");
    assert.equal(classifyCampaignObjective([]).bucket, "other");
});

test("classifyCampaignObjective — raw echoed for trace", () => {
    assert.equal(classifyCampaignObjective("OUTCOME_SALES").raw, "OUTCOME_SALES");
    assert.equal(classifyCampaignObjective("weird_unknown").raw, "weird_unknown");
    assert.equal(classifyCampaignObjective(null).raw, "");
});

// ─── Convenience predicates ───────────────────────────────────

test("campaignObjectiveBucket / isConversionObjective alias correctly", () => {
    assert.equal(campaignObjectiveBucket("OUTCOME_SALES"), "conversion");
    assert.equal(campaignObjectiveBucket("AWARENESS"), "other");
    assert.equal(isConversionObjective("OUTCOME_SALES"), true);
    assert.equal(isConversionObjective("AWARENESS"), false);
    assert.equal(isConversionObjective(null), false);
});

// ─── Objective gating (SC-12: K3+K4 always fire; CB/K1/K2/K5/S1 conversion-only) ──

test("isRuleAllowedForObjective — K3 and K4 always allowed (creative-quality checks)", () => {
    assert.equal(isRuleAllowedForObjective("K3", "conversion"), true);
    assert.equal(isRuleAllowedForObjective("K3", "other"), true);
    assert.equal(isRuleAllowedForObjective("K4", "conversion"), true);
    assert.equal(isRuleAllowedForObjective("K4", "other"), true);
});

test("isRuleAllowedForObjective — CB1/CB2/K1/K2/K5/K6/K7/fatigue/S1 conversion-only", () => {
    const blockedOnOther = ["CB1", "CB2", "K1", "K2", "K5", "K6", "K7", "fatigue", "S1"];
    for (const rule of blockedOnOther) {
        assert.equal(isRuleAllowedForObjective(rule, "conversion"), true, `${rule} should be allowed for conversion`);
        assert.equal(isRuleAllowedForObjective(rule, "other"), false, `${rule} must be blocked for 'other' objective`);
    }
});

// ─── Membership / taxonomy exports ─────────────────────────────

test("CONVERSION_OBJECTIVES + ALL_* exports expose the taxonomy", () => {
    assert.ok(CONVERSION_OBJECTIVES.size > 0);
    assert.equal(ALL_CONVERSION_OBJECTIVES.length, CONVERSION_OBJECTIVES.size);
    assert.deepEqual(new Set(ALL_CONVERSION_OBJECTIVES), CONVERSION_OBJECTIVES);
    assert.deepEqual(ALL_OBJECTIVE_BUCKETS, ["conversion", "other"]);
});