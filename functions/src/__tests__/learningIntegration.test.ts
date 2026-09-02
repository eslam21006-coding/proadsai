// functions/src/__tests__/learningIntegration.test.ts — Phase 14 T045
// ═══════════════════════════════════════════════════════════
// End-to-end integration of Layers 4 + 4b. The worker code in
// `metaSync/shared.ts` reads from Firestore + Meta + KMS — we test the
// pipeline shape here WITHOUT those dependencies: build the same
// `AdForLearning` records the worker would build, run them through
// `evaluateVerdict` + `updateHookAggregates` + `updateVisualAggregates`,
// and assert the end-to-end behavior.
//
// This catches: a verdict that says 🟢 S1 + a matched conversion ad
// with a non-empty hook angle + same template as a sibling → both
// hook AND visual aggregates are populated correctly.
// ═══════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateVerdict, type FunnelSettingsForVerdict } from "../qararEngine.js";
import {
    updateHookAggregates,
    updateVisualAggregates,
    type AdForLearning,
    type HookPerformanceAggregate,
    type VisualPerformanceAggregate,
} from "../learningAggregates.js";

function makePaidFunnel(targetCpa: number): FunnelSettingsForVerdict {
    return {
        derived: {
            economicsVersion: 2,
            paid: {
                rawTargetCpa: targetCpa * 1.2,
                fullBuyerValue: targetCpa * 2,
                maxCpa: targetCpa,
                effectiveTargetCpa: targetCpa,
                capApplied: true,
            },
            computedAt: 0,
        },
    };
}

function emptyHook(angleKey: string): HookPerformanceAggregate {
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

function emptyVisual(patternKey: string): VisualPerformanceAggregate {
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

const DEFAULT_BASELINES = { linkCtr90d: 1.5, cpm14d: 8, cpaCpl30d: 50, cpc30d: 1.0 };

// ─── End-to-end: conversion + auto_hash match → verdict + both aggregates ─

test("integration: conversion + auto_hash match → verdict computed + hook + visual aggregates updated", () => {
    // Step 1: build the per-ad performance snapshot the worker would build
    //         before calling evaluateVerdict.
    const adPerf = {
        impressions3d: 3000,
        spend3d: 50,
        spendToday: 5,
        ctrLink: 2.0,         // > account avg (1.5)
        ctrAll: 2.5,
        cpm3d: 8,
        cpa3d: 40,            // < target (50)
        conversions3d: 2,
        spendSharePct: 0.4,
        peak1dCtr: 2.0,
        ageDays: 3,
    };

    // Step 2: run the verdict engine.
    const verdictResult = evaluateVerdict(
        adPerf,
        makePaidFunnel(50),
        "conversion",
        DEFAULT_BASELINES,
    );
    assert.equal(verdictResult.verdict, "🟢");
    assert.equal(verdictResult.ruleCode, "S1");

    // Step 3: build the AdForLearning record the worker would build.
    const adForLearning: AdForLearning = {
        adId: "ad-1",
        generationId: "gen-1",
        matchType: "auto_hash",
        metadataAvailable: true,
        campaignObjective: "conversion",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        ctrLink: adPerf.ctrLink,
        cpm3d: adPerf.cpm3d,
        conversions3d: adPerf.conversions3d,
        verdict: verdictResult.verdict,
        hookAngle: "urgency",
        layoutTemplate: "hero_value_stack",
        creativeModes: ["standard_hero", "value_stack"],
        artDirection: "dark_cinematic",
        universe: "uae",
    };

    // Step 4: run both aggregators.
    const newHook = updateHookAggregates([adForLearning], [emptyHook("urgency")]);
    const newVisual = updateVisualAggregates(
        [adForLearning],
        [emptyVisual("placeholder")], // pre-existing placeholder pattern key
    );

    // Step 5: assert — both aggregates contain the new ad.
    const hook = newHook.get("urgency");
    assert.ok(hook);
    assert.equal(hook.sampleSize, 1);
    assert.equal(hook.byObjective.conversion.count, 1);
    assert.equal(hook.byObjective.conversion.bestVerdictCount, 1); // 🟢

    // Look up the visual pattern by its computed key (not by index — the
    // `existing` placeholder may have been seeded first into the result).
    // Use a placeholder for the visual fixture that doesn't shadow the
    // computed key (the hook fixture already uses "urgency" too).
    // Re-run with a fresh aggregator to find the new pattern key.
    const fresh = updateVisualAggregates([adForLearning], []);
    const pattern = Array.from(fresh.values())[0];
    assert.ok(pattern);
    assert.equal(pattern.sampleSize, 1);
    assert.equal(pattern.byObjective.conversion.count, 1);
    assert.equal(pattern.byObjective.conversion.bestVerdictCount, 1); // 🟢
    // The engine produced a fresh pattern entry with a non-empty key.
    assert.ok(pattern.patternKey.length > 0);
});

// ─── End-to-end: non-conversion ad → verdict may fire, aggregates not updated ─

test("integration: non-conversion ad → verdict may fire but aggregates NOT updated in conversion bucket", () => {
    // Non-conversion ads: K3 + K4 still fire (creative-quality), but
    // CB / K5 / S1 / fatigue are disabled. For the test, use a CTR
    // that does NOT trigger K3 (so the engine returns default_continue
    // 🟡), then verify the aggregator only counts this in the
    // `byObjective.other` display bucket.
    const adPerf = {
        impressions3d: 3000,
        spend3d: 50,
        spendToday: 5,
        ctrLink: 1.5,         // = account avg, not < 0.5
        ctrAll: 2.0,
        cpm3d: 8,
        cpa3d: null,
        conversions3d: 1,
        spendSharePct: 0.4,
        peak1dCtr: 1.5,
        ageDays: 3,
    };
    const verdictResult = evaluateVerdict(
        adPerf,
        makePaidFunnel(50),
        "other",   // NOT conversion
        DEFAULT_BASELINES,
    );
    // No kill / CB / S1 fires on 'other' — default 🟡.
    assert.equal(verdictResult.verdict, "🟡");
    assert.equal(verdictResult.ruleCode, "default_continue");

    const adForLearning: AdForLearning = {
        adId: "ad-other-1",
        generationId: "gen-other-1",
        matchType: "auto_hash",
        metadataAvailable: true,
        campaignObjective: "other", // non-conversion
        geoTier: "tier1_gulf",
        audienceType: "broad",
        ctrLink: adPerf.ctrLink,
        cpm3d: adPerf.cpm3d,
        conversions3d: adPerf.conversions3d,
        verdict: verdictResult.verdict,
        hookAngle: "urgency",
        layoutTemplate: "hero_value_stack",
        creativeModes: ["standard_hero"],
        artDirection: "dark_cinematic",
        universe: "uae",
    };
    const newHook = updateHookAggregates([adForLearning], []);
    const urgency = newHook.get("urgency");
    assert.ok(urgency);
    // conversion bucket: ZERO (only 'other' counts)
    assert.equal(urgency.byObjective.conversion.count, 0);
    // 'other' bucket: counts toward display-only
    assert.equal(urgency.byObjective.other.count, 1);
    assert.equal(urgency.byObjective.other.avgLinkCtr, 1.5);
    // byGeoTier / byAudienceType also empty (those track conversion only)
    assert.equal(urgency.byGeoTier.tier1_gulf.count, 0);
});

// ─── End-to-end: unmatched ad → no aggregate update ─

test("integration: unmatched ad (matchType=null) → no aggregate update", () => {
    const adForLearning: AdForLearning = {
        adId: "ad-unmatched-1",
        generationId: "gen-1",
        matchType: null,  // worker sets this to null when image matching failed
        metadataAvailable: true,
        campaignObjective: "conversion",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        ctrLink: 2.0,
        cpm3d: 8,
        conversions3d: 2,
        verdict: "🟢",
        hookAngle: "urgency",
        layoutTemplate: "hero_value_stack",
        creativeModes: ["standard_hero"],
        artDirection: "dark_cinematic",
        universe: "uae",
    };
    const result = updateHookAggregates([adForLearning], []);
    // No aggregate produced for an unmatched ad.
    assert.equal(result.size, 0);
});

// ─── End-to-end: deleted generation (metadataAvailable: false) → no aggregate update ─

test("integration: deleted generation (metadataAvailable=false) → no aggregate update", () => {
    // Simulates the case where the generation was deleted after the ad
    // was matched. The cascade trigger set metadataAvailable=false. The
    // worker still includes the ad in learnedAds (so verdicts + counters
    // are correct), but the learning aggregator must SKIP it.
    const adForLearning: AdForLearning = {
        adId: "ad-deleted-gen",
        generationId: "gen-deleted",
        matchType: "manual",  // still matched, but the gen is gone
        metadataAvailable: false,
        campaignObjective: "conversion",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        ctrLink: 2.0,
        cpm3d: 8,
        conversions3d: 1,
        verdict: "🟢",
        hookAngle: "urgency",
        layoutTemplate: "hero_value_stack",
        creativeModes: ["standard_hero"],
        artDirection: "dark_cinematic",
        universe: "uae",
    };
    const result = updateHookAggregates([adForLearning], []);
    assert.equal(result.size, 0);
});

// ─── End-to-end: S1 + K3 outcomes coexist correctly across multiple ads ─

test("integration: multiple ads feed the same hook with mixed verdicts", () => {
    // Ad 1: 🟢 S1 winner with urgency hook
    const v1 = evaluateVerdict(
        {
            impressions3d: 3000, spend3d: 50, spendToday: 5,
            ctrLink: 2.0, ctrAll: 2.5, cpm3d: 8, cpa3d: 40,
            conversions3d: 2, spendSharePct: 0.4, peak1dCtr: 2.0, ageDays: 3,
        },
        makePaidFunnel(50), "conversion", DEFAULT_BASELINES,
    );
    // Ad 2: 🔴 K3 dead hook with urgency hook (this is contrived — K3
    // doesn't depend on the hook angle — but it tests that verdict
    // counts roll up correctly).
    const v2 = evaluateVerdict(
        {
            impressions3d: 3000, spend3d: 50, spendToday: 5,
            ctrLink: 0.2, ctrAll: 0.3, cpm3d: 8, cpa3d: null,
            conversions3d: 0, spendSharePct: 0.4, peak1dCtr: 1.0, ageDays: 3,
        },
        makePaidFunnel(50), "conversion", DEFAULT_BASELINES,
    );
    assert.equal(v1.verdict, "🟢");
    assert.equal(v2.verdict, "🔴");

    const ads: AdForLearning[] = [
        {
            adId: "a1", generationId: "g1", matchType: "auto_hash",
            metadataAvailable: true, campaignObjective: "conversion",
            geoTier: "tier1_gulf", audienceType: "broad",
            ctrLink: v1.ruleCode === "S1" ? 2.0 : 0, cpm3d: 8, conversions3d: 2,
            verdict: v1.verdict, hookAngle: "urgency",
            layoutTemplate: "hero_value_stack", creativeModes: ["standard_hero"],
            artDirection: "dark_cinematic", universe: "uae",
        },
        {
            adId: "a2", generationId: "g2", matchType: "auto_hash",
            metadataAvailable: true, campaignObjective: "conversion",
            geoTier: "tier1_gulf", audienceType: "broad",
            ctrLink: 0.2, cpm3d: 8, conversions3d: 0,
            verdict: v2.verdict, hookAngle: "urgency",
            layoutTemplate: "hero_value_stack", creativeModes: ["standard_hero"],
            artDirection: "dark_cinematic", universe: "uae",
        },
    ];
    const result = updateHookAggregates(ads, []);
    const urgency = result.get("urgency");
    assert.ok(urgency);
    assert.equal(urgency.sampleSize, 2);
    assert.equal(urgency.byObjective.conversion.count, 2);
    assert.equal(urgency.byObjective.conversion.bestVerdictCount, 1); // 🟢 from ad 1
    assert.equal(urgency.byObjective.conversion.worstVerdictCount, 1); // 🔴 from ad 2
});
