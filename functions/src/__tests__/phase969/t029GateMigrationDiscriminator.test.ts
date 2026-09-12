// functions/src/__tests__/phase969/t029GateMigrationDiscriminator.test.ts — T029c gate-migration discriminator (Batch 13)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, T029a/b/c (Batch 13) — the discriminating test.
//
// Spec amendment 1: the FR-034 / FR-034a / FR-037 gates count **distinct
// creatives**, not ad rows. The numeric values stay at the locked 10 / 3 / 3
// (activation threshold / per-item floor / efficiency-evidence minimum);
// what changes is the unit. Before this batch, every gate site reads
// `creativeCount ?? sampleSize` (or `?? byObjective.conversion.count`),
// silently falling back to the per-row count whenever the producer had
// not populated `creativeCount` — which until Batch 12 meant every
// read. The single 55-row creative in `act_995888422231015` clears a
// 3-row per-item floor by itself under that fallback; that is precisely
// the thin-evidence failure FR-034a was added to prevent.
//
// This batch wires the producers (T029c in `patternSummaries.ts:toSummary`,
// T029a in `ragContext.ts:rankHooks`, T029b in
// `whatsWorkingDashboard.ts`) to populate `creativeCount` on every output
// and removes the `?? sampleSize` / `?? count` fallbacks at every
// gate site. The discriminator observes the gate's behaviour under both
// states.
//
// The gate predicate `passesFRO34Gate` is extracted from
// `rankingEngine.ts:querySummaries` (line 223) and `getWarnings`
// (line 373) into a single pure function exported from
// `rankingEngine.ts`. The test drives it directly with three
// fixtures:
//
//   1. 55 rows / 1 creative: gate FAILS (1 < 3).
//   2. 55 rows / 3 creatives: gate PASSES (3 >= 3).
//   3. 55 rows / no creativeCount (the pre-T029c producer state):
//      gate FAILS under the post-batch code (no `?? sampleSize`
//      fallback) — absent creativeCount is treated as fail so the
//      gate stays closed until the producer catches up.
//
// The discriminator is observable at the gate function boundary under
// fixtures 1 and 3. Fixture 1 demonstrates the locked 10/3/3 unit
// change (per-creative, not per-row); fixture 3 demonstrates the
// fallback removal (a row-counted summary now fails the floor where
// it would have passed before).
//
// SOURCE-TEXT structural check: verifies the inline gate inside
// `querySummaries` does not regress to the `?? s.sampleSize`
// fallback — the same per-line guard pattern Batch 12 used for the
// T025a wire-up. The behavioural halves in this file are SIMULATION
// of the gate function (Batch 12 review correction); the SOURCE-TEXT
// half is the interim regression guard for T029c until T064b's
// stubbed-Firestore scaffolding lands.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

declare const __dirname: string;
const RANKING_ENGINE_TS = join(__dirname, "..", "..", "..", "src", "rankingEngine.ts");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { passesFRO34Gate } = require("../../rankingEngine.js");

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     ${(e as Error).message}`);
        failed++;
    }
}

// ─── Fixtures ─────────────────────────────────────────────────────

function makeSummary(overrides: Record<string, unknown> = {}) {
    return {
        summaryId: "test:scope:family:key",
        family: "hook_angle" as const,
        key: "urgency",
        scope: "user" as const,
        scopeValue: "u1",
        niche: null,
        offerType: null,
        funnelStage: null,
        language: null,
        aspectRatio: null,
        sampleSize: 55,
        // `creativeCount` defaults to absent in the pre-T029c fixture;
        // tests override it to exercise both producer states.
        ...overrides,
    };
}

// ─── The discriminator ──────────────────────────────────────────

test("FR-034a counts creatives: 55 rows / 1 creative FAILS the floor (1 < 3)", () => {
    // The discriminator: under row counting (pre-Batch-13), 55 rows
    // would pass the 3-row per-item floor. Under creative counting
    // (post-Batch-13), 1 creative fails the same floor. This is the
    // exact gap FR-034a was added in Iteration 3 to prevent.
    const summary = makeSummary({ creativeCount: 1 });
    assert.equal(passesFRO34Gate(summary), false,
        "FR-034a: 1 creative must fail the floor (1 < 3) — the unit counts creatives, not rows");
});

test("FR-034a counts creatives: 55 rows / 3 creatives PASSES the floor (3 >= 3)", () => {
    // The discriminator: under creative counting, 3 creatives pass
    // the floor. This is the boundary the spec amendment 1 picked:
    // 10 / 3 / 3 retained, unit changed to distinct creatives.
    const summary = makeSummary({ creativeCount: 3 });
    assert.equal(passesFRO34Gate(summary), true,
        "FR-034a: 3 creatives must pass the floor (3 >= 3) — distinct-creative counting");
});

test("FR-034a: undefined creativeCount fails the floor (no creative attributed yet)", () => {
    // The discriminator against the fallback. pre-Batch-13 the inline
    // code `?? s.sampleSize` would have read 55 and passed. Under the
    // post-Batch-13 code (no fallback), absent `creativeCount` is
    // treated as fail so the gate stays closed until the producer
    // catches up — there is no creative attributed yet, so no
    // signal is honest.
    const summary = makeSummary();
    assert.equal(passesFRO34Gate(summary), false,
        "FR-034a: absent creativeCount must fail the floor (no creative attributed)");
});

test("FR-034a: confidence below MIN_CONFIDENCE fails the gate even at scale", () => {
    // The second arm of the OR gate: even with enough creatives,
    // a low-confidence summary is filtered out. Pinned here so a
    // refactor that drops the confidence check trips this assertion.
    const summary = makeSummary({ creativeCount: 100, confidence: 0.05 });
    assert.equal(passesFRO34Gate(summary), false,
        "FR-034a: confidence below MIN_CONFIDENCE (0.15) must fail the gate");
});

test("T029c: rankingEngine.ts inline gate reads creativeCount directly (no row-count fallback)", () => {
    // SOURCE-TEXT structural check. The pre-Batch-13 inline code was
    // `(((s as any).creativeCount ?? s.sampleSize) < MIN_SAMPLE_SIZE)`;
    // the post-Batch-13 inline code is `if (!passesFRO34Gate(s))
    // continue;`. A regression that re-introduces the `??
    // s.sampleSize` fallback (silently reverting to row counting) is
    // the failure mode the spec amendment 1 was added to prevent, so
    // the check rejects both uncommented occurrences and commented
    // ones (a regression that wraps the fallback in `//` slipped past
    // a naive regex in Batch 12's T025a guard).
    const src = readFileSync(RANKING_ENGINE_TS, "utf8");
    const lines = src.split("\n");
    const angleKeyFallbackLines = lines.filter((l) =>
        /\(s as any\)\.creativeCount\s*\?\?\s*s\.sampleSize/.test(l));
    assert.ok(angleKeyFallbackLines.length === 0,
        "rankingEngine.ts must not have the `?? s.sampleSize` fallback in the inline gate (FR-034a counts creatives)");
    for (const l of angleKeyFallbackLines) {
        assert.ok(!l.trimStart().startsWith("//"),
            "the angleKey fallback line is commented out — restore the wire-up");
    }
});

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log("=== T029c gate-migration discriminator (Batch 13) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
