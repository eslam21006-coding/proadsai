// functions/src/__tests__/learningAggregates.test.ts — Phase 14 Layer 4b
// ═══════════════════════════════════════════════════════════
// node:test runner. PURE module tests — the wiring tests in
// `learningIntegration.test.ts` exercise the worker loop.
//
// Two-component learning (spec §6):
//   - Hook angle aggregate:  Link CTR, key = canonical hook angle
//   - Visual pattern aggregate: CPM + Link CTR, key = hash of sorted
//     (layoutTemplate, creativeMode[], artDirection, universe)
//
// Only CONVERSION-objective matched ads feed learning. The patternKey
// is deterministic (sorted array → stable hash). The aggregates track
//   - byObjective: { conversion: { ... bestVerdictCount, worstVerdictCount }, other: { count } }
//   - byGeoTier: { tier1_gulf, tier2_diaspora, tier3_egypt_na }
//   - byAudienceType: { broad, interest, lookalike, retargeting, advantage_plus }
// ═══════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    computePatternKey,
    updateHookAggregates,
    updateVisualAggregates,
    type AdForLearning,
    type HookPerformanceAggregate,
    type VisualPerformanceAggregate,
} from "../learningAggregates.js";

// ─── Helpers ───────────────────────────────────────────────────

function makeAd(overrides: Partial<AdForLearning> = {}): AdForLearning {
    return {
        adId: "ad-1",
        generationId: "gen-1",
        matchType: "auto_hash",
        metadataAvailable: true,
        campaignObjective: "conversion",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        ctrLink: 1.5,
        cpm3d: 10,
        conversions3d: 2,
        hookAngle: "urgency",
        layoutTemplate: "hero_value_stack",
        creativeModes: ["standard_hero", "value_stack"],
        artDirection: "dark_cinematic",
        universe: "uae",
        verdict: "🟡",
        ...overrides,
    };
}

function emptyHookAggregate(): HookPerformanceAggregate {
    return {
        angleKey: "urgency",
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

function emptyVisualAggregate(): VisualPerformanceAggregate {
    return {
        patternKey: "",
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

// ─── Hook angle aggregate ──────────────────────────────────────

test("hook aggregate: 3 conversion ads with urgency hook → correct count + avgLinkCtr", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 1.0, hookAngle: "urgency", verdict: "🟢" }),
        makeAd({ adId: "a2", ctrLink: 2.0, hookAngle: "urgency", verdict: "🟡" }),
        makeAd({ adId: "a3", ctrLink: 3.0, hookAngle: "urgency", verdict: "🔴" }),
    ];
    const result = updateHookAggregates(ads, [emptyHookAggregate()]);
    const urgency = result.get("urgency");
    assert.ok(urgency);
    assert.equal(urgency.sampleSize, 3);
    assert.equal(urgency.byObjective.conversion.count, 3);
    // average of 1.0, 2.0, 3.0 = 2.0
    assert.equal(urgency.byObjective.conversion.avgLinkCtr, 2);
    // best/worst verdict counts
    assert.equal(urgency.byObjective.conversion.bestVerdictCount, 1); // 🟢
    assert.equal(urgency.byObjective.conversion.worstVerdictCount, 1); // 🔴
    assert.ok(urgency.lastUpdated > 0);
});

test("hook aggregate: alias resolution — 'shocking_stat' aggregates under 'statistics'", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 2.0, hookAngle: "shocking_stat", verdict: "🟢" }),
        makeAd({ adId: "a2", ctrLink: 3.0, hookAngle: "statistics", verdict: "🟡" }),
    ];
    const result = updateHookAggregates(ads, [emptyHookAggregate()]);
    // Both should roll up under "statistics"
    const stats = result.get("statistics");
    assert.ok(stats);
    assert.equal(stats.sampleSize, 2);
    assert.equal(stats.byObjective.conversion.avgLinkCtr, 2.5);
    // "shocking_stat" should NOT have its own entry
    assert.equal(result.get("shocking_stat"), undefined);
});

test("hook aggregate: alias 'fear_of_missing_out' → 'urgency'", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 2.0, hookAngle: "fear_of_missing_out" }),
    ];
    const result = updateHookAggregates(ads, [emptyHookAggregate()]);
    assert.ok(result.get("urgency"));
    assert.equal(result.get("fear_of_missing_out"), undefined);
});

test("hook aggregate: alias 'future_pacing' → 'future_based'", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 2.0, hookAngle: "future_pacing" }),
    ];
    const result = updateHookAggregates(ads, [emptyHookAggregate()]);
    assert.ok(result.get("future_based"));
});

// ─── Objective gating ──────────────────────────────────────────

test("hook aggregate: only conversion campaigns feed learning — 'other' counted in display bucket only", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 1.0, hookAngle: "urgency", campaignObjective: "conversion" }),
        makeAd({ adId: "a2", ctrLink: 2.0, hookAngle: "urgency", campaignObjective: "other" }),
    ];
    const result = updateHookAggregates(ads, [emptyHookAggregate()]);
    const urgency = result.get("urgency");
    assert.ok(urgency);
    // conversion bucket: only the conversion ad
    assert.equal(urgency.byObjective.conversion.count, 1);
    assert.equal(urgency.byObjective.conversion.avgLinkCtr, 1.0);
    // other bucket: only the other ad (display-only)
    assert.equal(urgency.byObjective.other.count, 1);
    assert.equal(urgency.byObjective.other.avgLinkCtr, 2.0);
});

test("hook aggregate: unmatched ad (matchType=null) → excluded", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 1.0, matchType: null }),
    ];
    // Empty `existing` so the result only contains aggregates the
    // engine produced this run. An unmatched ad produces no aggregate.
    const result = updateHookAggregates(ads, []);
    assert.equal(result.size, 0);
});

test("hook aggregate: deleted generation (metadataAvailable=false) → excluded", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 1.0, metadataAvailable: false }),
    ];
    const result = updateHookAggregates(ads, []);
    assert.equal(result.size, 0);
});

// ─── Visual pattern aggregate ──────────────────────────────────

test("visual aggregate: 2 ads with same template/modes/artDirection/universe → correct CPM + Link CTR", () => {
    const ads: AdForLearning[] = [
        makeAd({
            adId: "a1",
            cpm3d: 10, ctrLink: 2.0, verdict: "🟢",
            layoutTemplate: "hero_value_stack",
            creativeModes: ["standard_hero", "value_stack"],
            artDirection: "dark_cinematic",
            universe: "uae",
        }),
        makeAd({
            adId: "a2",
            cpm3d: 14, ctrLink: 3.0, verdict: "🟡",
            layoutTemplate: "hero_value_stack",
            creativeModes: ["standard_hero", "value_stack"],
            artDirection: "dark_cinematic",
            universe: "uae",
        }),
    ];
    // Empty `existing` so the result only contains aggregates the engine
    // produced this run.
    const result = updateVisualAggregates(ads, []);
    // Should produce exactly one pattern aggregate
    assert.equal(result.size, 1);
    const pattern = Array.from(result.values())[0];
    assert.equal(pattern.sampleSize, 2);
    assert.equal(pattern.byObjective.conversion.avgCpm, 12); // (10+14)/2
    assert.equal(pattern.byObjective.conversion.avgLinkCtr, 2.5); // (2+3)/2
    assert.equal(pattern.byObjective.conversion.bestVerdictCount, 1);
    assert.equal(pattern.byObjective.conversion.worstVerdictCount, 0);
});

test("visual aggregate: patternKey canonicalization — sorted modes produce same key", () => {
    const k1 = computePatternKey("hero_value_stack", ["standard_hero", "value_stack"], "dark", "uae");
    const k2 = computePatternKey("hero_value_stack", ["value_stack", "standard_hero"], "dark", "uae");
    assert.equal(k1, k2);
});

test("visual aggregate: different universes → different keys", () => {
    const k1 = computePatternKey("hero_value_stack", ["standard_hero"], "dark", "uae");
    const k2 = computePatternKey("hero_value_stack", ["standard_hero"], "dark", "sa");
    assert.notEqual(k1, k2);
});

test("visual aggregate: different art directions → different keys", () => {
    const k1 = computePatternKey("hero", ["standard_hero"], "dark", "uae");
    const k2 = computePatternKey("hero", ["standard_hero"], "bright", "uae");
    assert.notEqual(k1, k2);
});

test("visual aggregate: same image in two ad sets → separate records per context", () => {
    // Two ads, same generationId (same fingerprint) but different ad
    // sets. Spec §6.3 says "separate records per context; the creative
    // is judged by its best result across all contexts".
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 1.0, campaignObjective: "conversion", audienceType: "broad" }),
        makeAd({ adId: "a2", ctrLink: 3.0, campaignObjective: "conversion", audienceType: "interest" }),
    ];
    // Empty existing so the result is purely what the engine produced.
    const result = updateVisualAggregates(ads, []);
    // One pattern key (same template/modes), but the byAudienceType
    // breakdown tracks both 'broad' and 'interest' independently.
    assert.equal(result.size, 1);
    const pattern = Array.from(result.values())[0];
    assert.equal(pattern.sampleSize, 2);
    assert.equal(pattern.byAudienceType.broad.count, 1);
    assert.equal(pattern.byAudienceType.broad.avgCtr, 1.0);
    assert.equal(pattern.byAudienceType.interest.count, 1);
    assert.equal(pattern.byAudienceType.interest.avgCtr, 3.0);
});

// ─── Context dimensions ────────────────────────────────────────

test("hook aggregate: byGeoTier breakdown — 2 Gulf + 1 Egypt → tier1 + tier3 counts", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 2.0, geoTier: "tier1_gulf" }),
        makeAd({ adId: "a2", ctrLink: 3.0, geoTier: "tier1_gulf" }),
        makeAd({ adId: "a3", ctrLink: 1.0, geoTier: "tier3_egypt_na" }),
    ];
    const result = updateHookAggregates(ads, [emptyHookAggregate()]);
    const urgency = result.get("urgency");
    assert.ok(urgency);
    assert.equal(urgency.byGeoTier.tier1_gulf.count, 2);
    assert.equal(urgency.byGeoTier.tier1_gulf.avgCtr, 2.5);
    assert.equal(urgency.byGeoTier.tier3_egypt_na.count, 1);
    assert.equal(urgency.byGeoTier.tier3_egypt_na.avgCtr, 1.0);
    // tier2 never recorded
    assert.equal(urgency.byGeoTier.tier2_diaspora.count, 0);
});

test("hook aggregate: byAudienceType breakdown — broad vs interest counts", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 2.0, audienceType: "broad" }),
        makeAd({ adId: "a2", ctrLink: 3.0, audienceType: "interest" }),
        makeAd({ adId: "a3", ctrLink: 4.0, audienceType: "broad" }),
    ];
    const result = updateHookAggregates(ads, [emptyHookAggregate()]);
    const urgency = result.get("urgency");
    assert.ok(urgency);
    assert.equal(urgency.byAudienceType.broad.count, 2);
    assert.equal(urgency.byAudienceType.broad.avgCtr, 3.0); // (2+4)/2
    assert.equal(urgency.byAudienceType.interest.count, 1);
    assert.equal(urgency.byAudienceType.interest.avgCtr, 3.0);
});

// ─── Same-creative-multiple-contexts ───────────────────────────

test("same generationId in 2 ad sets → creative judged by best result", () => {
    // Spec §6.3: the creative is judged by its best context. So when
    // the same generationId appears in two ads (different audiences), the
    // aggregate captures both — count=2, but the avgCtr is the average
    // (and downstream Batch 05 surface picks the best context's verdict).
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 1.0, generationId: "gen-X", audienceType: "broad" }),
        makeAd({ adId: "a2", ctrLink: 3.0, generationId: "gen-X", audienceType: "interest" }),
    ];
    const result = updateHookAggregates(ads, [emptyHookAggregate()]);
    const urgency = result.get("urgency");
    assert.ok(urgency);
    assert.equal(urgency.sampleSize, 2);
    assert.equal(urgency.byAudienceType.broad.count, 1);
    assert.equal(urgency.byAudienceType.broad.avgCtr, 1.0);
    assert.equal(urgency.byAudienceType.interest.count, 1);
    assert.equal(urgency.byAudienceType.interest.avgCtr, 3.0);
});

// ─── Output shape ─────────────────────────────────────────────

test("output: every aggregate has the schema-version-shaped buckets", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 2.0, verdict: "🟡" }),
    ];
    const hookResult = updateHookAggregates(ads, [emptyHookAggregate()]);
    const urgency = hookResult.get("urgency");
    assert.ok(urgency);
    // Top-level fields
    assert.equal(typeof urgency.angleKey, "string");
    assert.equal(typeof urgency.sampleSize, "number");
    // byObjective
    assert.ok(urgency.byObjective.conversion);
    assert.ok(urgency.byObjective.other);
    // byGeoTier (all 3)
    assert.ok(urgency.byGeoTier.tier1_gulf);
    assert.ok(urgency.byGeoTier.tier2_diaspora);
    assert.ok(urgency.byGeoTier.tier3_egypt_na);
    // byAudienceType (all 5)
    for (const k of ["broad", "interest", "lookalike", "retargeting", "advantage_plus"] as const) {
        assert.ok(urgency.byAudienceType[k], `byAudienceType.${k} must exist`);
    }
});

// ─── Idempotency: running the same data twice gives the same result ─

test("idempotency: running updateHookAggregates twice on the same data is stable", () => {
    const ads: AdForLearning[] = [
        makeAd({ adId: "a1", ctrLink: 2.0, verdict: "🟢" }),
        makeAd({ adId: "a2", ctrLink: 3.0, verdict: "🟡" }),
    ];
    const r1 = updateHookAggregates(ads, [emptyHookAggregate()]);
    const r2 = updateHookAggregates(ads, [emptyHookAggregate()]);
    assert.deepEqual(
        Array.from(r1.values()).map((a) => ({ ...a })),
        Array.from(r2.values()).map((a) => ({ ...a })),
    );
});
