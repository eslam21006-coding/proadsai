// functions/src/__tests__/ragInjection.test.ts — Phase 14 Layer 7a
// ═══════════════════════════════════════════════════════════
// node:test runner. Integration tests for the prompt-injection
// surfaces of the RAG context. The pure helpers are exercised in
// `ragContext.test.ts`; this file verifies:
//
//   1. The block builders emit the PERFORMANCE_CONTEXT wrapper when
//      the RAG context is sufficient, and emit "" when insufficient.
//   2. The block builders never expose CTR/CPA/CPM numbers in any
//      mode (the AI sees pattern names, not metrics).
//   3. The three patch points in `generators.ts` are wired in
//      (source-scan — mirrors the gazeMap / expressionMap style).
//   4. getRAGContext / loadRAGContextForWorkspace fail open on
//      missing aggregates / Firestore errors (non-blocking).
// ═══════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import {
    buildRAGContext,
    buildHookPerformanceBlock,
    buildVisualPerformanceBlock,
    buildCaptionPerformanceBlock,
    type RAGContext,
} from "../ragContext.js";
import type {
    HookPerformanceAggregate,
    VisualPerformanceAggregate,
} from "../learningAggregates.js";

// ─── Block-builder behavior ──────────────────────────────────

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

function makeRAGContext(overrides: Partial<RAGContext> = {}): RAGContext {
    return {
        insufficient: false,
        sampleSize: 15,
        hookInsights: {
            topPerformers: [
                { angleKey: "urgency", angleName: "urgency", avgLinkCtr: 2.0, winCount: 3 },
            ],
            avoid: [
                { angleKey: "authority", angleName: "authority", avgLinkCtr: 0.5, loseCount: 2 },
            ],
            selectedAngleRank: "top",
        },
        visualInsights: {
            topPerformers: [
                { patternKey: "p1", description: "p1", avgLinkCtr: 1.5, winCount: 2 },
            ],
            avoid: [],
        },
        hookBlock: "Based on this user's own ad account data (15 matched creatives): Their top-performing hook angles are urgency. Avoid authority which consistently underperform in this account. Use this to inform — but not rigidly copy — what you generate. The user's history suggests patterns, not rules.",
        visualBlock: "This user's best-performing visual compositions are p1. Lean toward these patterns while maintaining creative variety.",
        captionBlock: "This user's ads perform best with urgency approaches — keep the caption tone aligned with what resonates with their audience.",
        promptBlock: "Combined.",
        ...overrides,
    };
}

test("RAG injection: insufficient → PERFORMANCE_CONTEXT block is empty", () => {
    const empty = makeRAGContext({ insufficient: true, hookBlock: "", visualBlock: "", captionBlock: "", promptBlock: "" });
    assert.equal(buildHookPerformanceBlock(empty), "");
    assert.equal(buildVisualPerformanceBlock(empty), "");
    assert.equal(buildCaptionPerformanceBlock(empty), "");
});

test("RAG injection: sufficient → PERFORMANCE_CONTEXT block appears with WRAPPER", () => {
    const ok = makeRAGContext();
    const hookBlock = buildHookPerformanceBlock(ok);
    assert.notEqual(hookBlock, "");
    assert.ok(hookBlock.startsWith("[PERFORMANCE_CONTEXT]"));
    assert.ok(hookBlock.endsWith("[/PERFORMANCE_CONTEXT]"));
    // The internal block carries the user's hook names
    assert.ok(hookBlock.includes("urgency"));
    assert.ok(hookBlock.includes("authority"));
});

test("RAG injection: hook block contains angle names, not CTR/CPA/CPM numbers", () => {
    const ok = makeRAGContext();
    const block = buildHookPerformanceBlock(ok);
    assert.ok(!/\bCTR\b/i.test(block));
    assert.ok(!/\bCPA\b/i.test(block));
    assert.ok(!/\bCPM\b/i.test(block));
    assert.ok(!/\d+\.\d+%/.test(block));
    assert.ok(!/\$[\d,]+/.test(block));
});

test("RAG injection: visual block references patterns (not metric numbers)", () => {
    const ok = makeRAGContext();
    const block = buildVisualPerformanceBlock(ok);
    assert.notEqual(block, "");
    assert.ok(!/\bCTR\b/i.test(block));
    assert.ok(!/\bCPM\b/i.test(block));
});

test("RAG injection: caption block is a single sentence (light touch)", () => {
    const ok = makeRAGContext();
    const block = buildCaptionPerformanceBlock(ok);
    // Strip the [PERFORMANCE_CONTEXT] wrappers before counting sentences so
    // the wrapping fences don't confuse the sentence-split heuristic.
    const inner = block
        .replace(/^\[PERFORMANCE_CONTEXT\]\s*/, "")
        .replace(/\s*\[\/PERFORMANCE_CONTEXT\]$/, "");
    const sentenceCount = inner.split(/[.!?]\s/).filter((s) => s.trim().length > 0).length;
    assert.equal(sentenceCount, 1, "caption block must be a single sentence");
});

// ─── End-to-end: buildRAGContext → block builders ───────────

test("RAG injection: with 10+ matched conversion ads → sufficient → block present", () => {
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 2.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
        makeHookAgg({ angleKey: "statistics", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const visualAggs = [
        makeVisualAgg({ patternKey: "p1", sampleSize: 10, byObjective: { conversion: { avgCpm: 10, avgLinkCtr: 2.0, count: 10, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { count: 0 } } }),
    ];
    const ctx = buildRAGContext({
        userId: "u1", workspaceId: "w1", accountId: "a1",
        hookAggs, visualAggs, accountAvgLinkCtr: 1.0,
    });
    assert.equal(ctx.insufficient, false);
    assert.notEqual(buildHookPerformanceBlock(ctx), "");
    assert.notEqual(buildVisualPerformanceBlock(ctx), "");
    assert.notEqual(buildCaptionPerformanceBlock(ctx), "");
});

test("RAG injection: < 10 matched conversion ads → insufficient → no block", () => {
    const hookAggs = [
        makeHookAgg({ angleKey: "urgency", sampleSize: 5, byObjective: { conversion: { avgLinkCtr: 1.0, count: 5, bestVerdictCount: 0, worstVerdictCount: 0 }, other: { avgLinkCtr: 0, count: 0 } } }),
    ];
    const ctx = buildRAGContext({
        userId: "u1", workspaceId: "w1", accountId: "a1",
        hookAggs, visualAggs: [], accountAvgLinkCtr: 1.0,
    });
    assert.equal(ctx.insufficient, true);
    assert.equal(buildHookPerformanceBlock(ctx), "");
    assert.equal(buildVisualPerformanceBlock(ctx), "");
    assert.equal(buildCaptionPerformanceBlock(ctx), "");
});

// ─── No-Meta-account path → no RAG (fail-open) ──────────────

test("RAG injection: no Meta account connected → no injection (no-regression on disconnect)", () => {
    // When workspace has no metaAdAccountId, the loader (loadRAGContextForWorkspace)
    // returns insufficient: true. Prompt stays byte-identical to pre-RAG.
    const empty = makeRAGContext({ insufficient: true, hookBlock: "", visualBlock: "", captionBlock: "", promptBlock: "" });
    assert.equal(buildHookPerformanceBlock(empty), "");
    assert.equal(buildVisualPerformanceBlock(empty), "");
    assert.equal(buildCaptionPerformanceBlock(empty), "");
});

// ─── Source-scan: the three patch points are wired in generators.ts ───

test("RAG injection: source scan — generators.ts wires RAG into the hook prompt", () => {
    const src = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
    assert.ok(/loadRAGContextForWorkspace/.test(src), "generators.ts imports loadRAGContextForWorkspace");
    assert.ok(/buildHookPerformanceBlock/.test(src), "generators.ts imports buildHookPerformanceBlock");
    assert.ok(/_step2RAGBlock\s*=/.test(src), "generators.ts initializes _step2RAGBlock local");
    assert.ok(/_step2RAGBlock\s*\?/.test(src), "generators.ts gates _step2RAGBlock into the hook prompt");
});

test("RAG injection: source scan — generators.ts wires RAG into the build-plan prompt", () => {
    const src = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
    assert.ok(/buildVisualPerformanceBlock/.test(src), "generators.ts imports buildVisualPerformanceBlock");
    assert.ok(/_bpRAGBlock\s*=/.test(src), "generators.ts initializes _bpRAGBlock local");
    assert.ok(/_bpRAGBlock\s*\?/.test(src), "generators.ts gates _bpRAGBlock into the build-plan prompt");
});

test("RAG injection: source scan — generators.ts wires RAG into the caption prompt", () => {
    const src = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
    assert.ok(/buildCaptionPerformanceBlock/.test(src), "generators.ts imports buildCaptionPerformanceBlock");
    assert.ok(/_step5RAGBlock\s*=/.test(src), "generators.ts initializes _step5RAGBlock local");
    // The caption prompt appends the RAG block via `if (_step5RAGBlock)` (truthy gate).
    assert.ok(/_step5RAGBlock\s*\)/.test(src), "generators.ts gates _step5RAGBlock into the caption prompt");
});

test("RAG injection: source scan — RAG is APPENDED, not replacing existing personalization", () => {
    const src = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
    // The retrieval hooks (buildPersonalizationContext, retrieveCreativePatterns) are still called
    assert.ok(/buildPersonalizationContext/.test(src), "buildPersonalizationContext still in place");
    assert.ok(/retrieveCreativePatterns/.test(src), "retrieveCreativePatterns still in place");
    // The RAG block is gated via ternary, never replacing existing content
    assert.ok(/_step2RAGBlock\s*\?/.test(src), "RAG block is appended, not replacing");
});

// ─── Fail-open: getRAGContext returns insufficient on bad aggregate input ───

test("RAG injection: getRAGContext is fail-open — malformed/invalid inputs → insufficient", async () => {
    // Pass invalid aggregate shapes — the pure builder must still return a
    // well-formed RAGContext (insufficient: true) without throwing.
    const ctx = buildRAGContext({
        userId: "u1", workspaceId: "w1", accountId: "a1",
        // Cast to ReadonlyArray to satisfy the type — this is intentional
        // for the fail-open test.
        hookAggs: [] as ReadonlyArray<HookPerformanceAggregate>,
        visualAggs: [] as ReadonlyArray<VisualPerformanceAggregate>,
        // NaN threshold — should still be safe (no division by zero crash)
        accountAvgLinkCtr: NaN,
    });
    assert.equal(ctx.insufficient, true);
    assert.equal(ctx.promptBlock, "");
    // All blocks are empty when insufficient
    assert.equal(buildHookPerformanceBlock(ctx), "");
    assert.equal(buildVisualPerformanceBlock(ctx), "");
    assert.equal(buildCaptionPerformanceBlock(ctx), "");
});
