// functions/src/__tests__/ragContext.test.ts — Phase 14 Layer 7a RAG context
// ═══════════════════════════════════════════════════════════
// node:test runner. PURE module tests — the pure helper
// `buildRAGContext(input, hookAggs, visualAggs, accountAvgCtr)` is exercised
// against deterministic aggregate inputs; the wiring tests in
// `ragInjection.test.ts` exercise the prompt-injection sites.
//
// Spec §9 — RAG injection. Activation gate: sampleSize >= 10
// conversion-matched creatives. Below 10 → insufficient: true and
// promptBlock: ''. Above 10 → top 3 angles by conversion avgLinkCtr,
// bottom 3 (with >= 3 ads and avgLinkCtr <= 75% of account average).
// The promptBlock must contain angle + pattern names, never numeric
// metric values (no CTR/CPA/CPM numbers).
// ═══════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import type {
    HookPerformanceAggregate,
    VisualPerformanceAggregate,
} from "../learningAggregates.js";
import { buildRAGContext } from "../ragContext.js";

// ─── Helpers ───────────────────────────────────────────────────

function makeHookAgg(overrides: Partial<HookPerformanceAggregate> = {}): HookPerformanceAggregate {
    return {
        angleKey: "urgency",
        sampleSize: 5,
        lastUpdated: 1000,
        byObjective: {
            conversion: { avgLinkCtr: 1.5, count: 5, bestVerdictCount: 2, worstVerdictCount: 1 },
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
        ...overrides,
    };
}

function makeVisualAgg(overrides: Partial<VisualPerformanceAggregate> = {}): VisualPerformanceAggregate {
    return {
        patternKey: "abc1234",
        sampleSize: 5,
        lastUpdated: 1000,
        byObjective: {
            conversion: { avgCpm: 10, avgLinkCtr: 1.5, count: 5, bestVerdictCount: 2, worstVerdictCount: 1 },
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
        ...overrides,
    };
}

// ─── Activation gate ──────────────────────────────────────────

test("RAG: < 10 matched conversion ads → insufficient: true, promptBlock: ''", () => {
    // 8 hook-aggregate records (5 conversion ads in one + 3 in another = 8)
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.5, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "statistics", sampleSize: 3, byObjective: { conversion: { avgLinkCtr: 1.0, count: 3, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0 },
    );
    assert.equal(result.insufficient, true);
    assert.equal(result.promptBlock, "");
    assert.equal(result.sampleSize, 8);
    // No insights emitted when insufficient
    assert.equal(result.hookInsights.topPerformers.length, 0);
    assert.equal(result.hookInsights.avoid.length, 0);
});

test("RAG: 10+ matched conversion ads → insufficient: false, promptBlock populated", () => {
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.5, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "statistics", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0 },
    );
    assert.equal(result.insufficient, false);
    assert.equal(result.sampleSize, 10);
    assert.notEqual(result.promptBlock, "");
    assert.ok(result.promptBlock.length > 0);
});

// ─── Top performers ───────────────────────────────────────────

test("RAG: topPerformers returns top 3 angles by conversion avgLinkCtr", () => {
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 2.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "statistics", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.5, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "social_proof", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.2, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "future_based", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0 },
    );
    assert.equal(result.hookInsights.topPerformers.length, 3);
    assert.equal(result.hookInsights.topPerformers[0].angleKey, "urgency");
    assert.equal(result.hookInsights.topPerformers[1].angleKey, "statistics");
    assert.equal(result.hookInsights.topPerformers[2].angleKey, "social_proof");
});

// ─── Avoid ────────────────────────────────────────────────────

test("RAG: avoid returns bottom 3 angles with avgLinkCtr <= 75% of account average AND >= 3 ads", () => {
    // accountAvg = 1.0 → 75% = 0.75
    // - authority: avgLinkCtr = 0.5 (below 0.75) with 5 ads → AVOID
    // - logical_authority: avgLinkCtr = 0.4 (below 0.75) with 5 ads → AVOID
    // - curiosity: avgLinkCtr = 0.6 (below 0.75) with 5 ads → AVOID
    // - contrast: avgLinkCtr = 0.8 (above 0.75) with 5 ads → NOT avoid
    // - question: avgLinkCtr = 0.3 (below 0.75) with 2 ads → NOT avoid (>= 3 gate)
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 2.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "authority", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 0.5, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "logical_authority", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 0.4, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "curiosity", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 0.6, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "contrast", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 0.8, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "question", sampleSize: 2, byObjective: { conversion: { avgLinkCtr: 0.3, count: 2, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0 },
    );
    assert.equal(result.hookInsights.avoid.length, 3);
    const avoidKeys = result.hookInsights.avoid.map((a) => a.angleKey).sort();
    assert.deepEqual(avoidKeys, ["authority", "curiosity", "logical_authority"]);
    // 'contrast' (above 75%) and 'question' (< 3 ads) are NOT in avoid
    assert.ok(!result.hookInsights.avoid.find((a) => a.angleKey === "contrast"));
    assert.ok(!result.hookInsights.avoid.find((a) => a.angleKey === "question"));
});

// ─── selectedAngleRank ────────────────────────────────────────

test("RAG: selectedAngleRank correctly classifies selected angle as top/good/weak/unknown", () => {
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 2.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "statistics", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "authority", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 0.5, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    // accountAvg = 1.0 ⇒ 75% = 0.75
    // urgency (top) → top
    let result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0, hookAngle: "urgency" },
    );
    assert.equal(result.hookInsights.selectedAngleRank, "top");
    // statistics (>= 0.75) → good
    result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0, hookAngle: "statistics" },
    );
    assert.equal(result.hookInsights.selectedAngleRank, "good");
    // authority (< 0.75) → weak
    result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0, hookAngle: "authority" },
    );
    assert.equal(result.hookInsights.selectedAngleRank, "weak");
    // unknown angle → unknown
    result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0, hookAngle: "nonexistent" },
    );
    assert.equal(result.hookInsights.selectedAngleRank, "unknown");
    // no hookAngle provided → undefined
    result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0 },
    );
    assert.equal(result.hookInsights.selectedAngleRank, undefined);
});

// ─── visual insights ──────────────────────────────────────────

test("RAG: visualInsights top 3 and avoid patterns populated", () => {
    const visualAggs = [
        makeVisualAgg({ patternKey: "p1", sampleSize: 5, byObjective: { conversion: { avgCpm: 10, avgLinkCtr: 2.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { count: 0 } } }),
        makeVisualAgg({ patternKey: "p2", sampleSize: 5, byObjective: { conversion: { avgCpm: 10, avgLinkCtr: 1.5, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { count: 0 } } }),
        makeVisualAgg({ patternKey: "p3", sampleSize: 5, byObjective: { conversion: { avgCpm: 10, avgLinkCtr: 1.2, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { count: 0 } } }),
        makeVisualAgg({ patternKey: "p4", sampleSize: 5, byObjective: { conversion: { avgCpm: 10, avgLinkCtr: 0.3, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { count: 0 } } }),
        makeVisualAgg({ patternKey: "p5", sampleSize: 5, byObjective: { conversion: { avgCpm: 10, avgLinkCtr: 0.2, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { count: 0 } } }),
    ];
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 10, byObjective: { conversion: { avgLinkCtr: 1.0, count: 10, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs, accountAvgLinkCtr: 1.0 },
    );
    assert.equal(result.visualInsights.topPerformers.length, 3);
    assert.equal(result.visualInsights.topPerformers[0].patternKey, "p1");
    // p4 + p5 are below 75% of 1.0 AND have >= 3 ads → avoid
    const avoidKeys = result.visualInsights.avoid.map((a) => a.patternKey).sort();
    assert.deepEqual(avoidKeys, ["p4", "p5"]);
});

// ─── promptBlock content ──────────────────────────────────────

test("RAG: promptBlock contains top angle names and avoid angle names", () => {
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 2.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "statistics", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "authority", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 0.5, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0 },
    );
    // Top angle names: urgency and statistics
    assert.ok(result.promptBlock.includes("urgency"), "promptBlock should contain top angle 'urgency'");
    assert.ok(result.promptBlock.includes("statistics"), "promptBlock should contain second-top angle 'statistics'");
    // Avoid angle name: authority
    assert.ok(result.promptBlock.includes("authority"), "promptBlock should contain avoid angle 'authority'");
});

test("RAG: promptBlock does NOT contain technical metric values (CTR/CPA/CPM numbers)", () => {
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 2.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "statistics", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "authority", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 0.5, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0 },
    );
    // No metric names should appear
    assert.ok(!/\bCTR\b/i.test(result.promptBlock), "promptBlock must not contain 'CTR'");
    assert.ok(!/\bCPA\b/i.test(result.promptBlock), "promptBlock must not contain 'CPA'");
    assert.ok(!/\bCPM\b/i.test(result.promptBlock), "promptBlock must not contain 'CPM'");
    // No explicit numeric percentages (e.g., "2.0%", "1.5%")
    assert.ok(!/\d+\.\d+%/.test(result.promptBlock), "promptBlock must not contain numeric percentages");
    // No $X CPA values
    assert.ok(!/\$[\d,]+/.test(result.promptBlock), "promptBlock must not contain dollar values");
});

// ─── Empty inputs ─────────────────────────────────────────────

test("RAG: empty hookAggs → hookInsights empty, still works", () => {
    const visualAggs = [
        makeVisualAgg({ patternKey: "p1", sampleSize: 10, byObjective: { conversion: { avgCpm: 10, avgLinkCtr: 2.0, count: 10, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs: [], visualAggs, accountAvgLinkCtr: 2.0 },
    );
    assert.equal(result.insufficient, false);
    assert.equal(result.hookInsights.topPerformers.length, 0);
    assert.equal(result.hookInsights.avoid.length, 0);
    assert.equal(result.visualInsights.topPerformers.length, 1);
    assert.notEqual(result.promptBlock, "");
});

test("RAG: empty visualAggs → visualInsights empty, still works", () => {
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 10, byObjective: { conversion: { avgLinkCtr: 2.0, count: 10, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 2.0 },
    );
    assert.equal(result.insufficient, false);
    assert.equal(result.hookInsights.topPerformers.length, 1);
    assert.equal(result.visualInsights.topPerformers.length, 0);
    assert.equal(result.visualInsights.avoid.length, 0);
    assert.notEqual(result.promptBlock, "");
});

// ─── Hook-visual-specific block builders ──────────────────────

test("RAG: buildHookPerformanceBlock emits a hook-only summary text", () => {
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 2.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "statistics", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "authority", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 0.5, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0 },
    );
    const hookBlock = result.hookBlock;
    assert.notEqual(hookBlock, "");
    assert.ok(hookBlock.includes("urgency"));
    assert.ok(!hookBlock.includes("CTR") && !hookBlock.includes("CPA"));
});

test("RAG: buildVisualPerformanceBlock emits a visual-only summary text", () => {
    const visualAggs = [
        makeVisualAgg({ patternKey: "p1", sampleSize: 5, byObjective: { conversion: { avgCpm: 10, avgLinkCtr: 2.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { count: 0 } } }),
        makeVisualAgg({ patternKey: "p2", sampleSize: 5, byObjective: { conversion: { avgCpm: 10, avgLinkCtr: 1.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { count: 0 } } }),
    ];
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 10, byObjective: { conversion: { avgLinkCtr: 1.0, count: 10, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs, accountAvgLinkCtr: 1.0 },
    );
    const visualBlock = result.visualBlock;
    assert.notEqual(visualBlock, "");
});

test("RAG: buildCaptionPerformanceBlock emits a single-sentence light-touch caption", () => {
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 10, byObjective: { conversion: { avgLinkCtr: 2.0, count: 10, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const result = buildRAGContext(
        { userId: "u1", workspaceId: "w1", accountId: "a1", hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0, hookAngle: "urgency" },
    );
    const captionBlock = result.captionBlock;
    assert.notEqual(captionBlock, "");
    // Single-sentence light touch → should match exactly one sentence
    const sentenceCount = captionBlock.split(/[.!?]\s/).filter((s) => s.trim().length > 0).length;
    assert.equal(sentenceCount, 1, "captionBlock must be a single sentence");
    // Must reference the top angle
    assert.ok(captionBlock.includes("urgency"));
});
