// functions/src/__tests__/phase969/withdrawalAverage.test.ts — FR-021 withdrawal arithmetic
// ════════════════════════════════════════════════════════════════════════════════════════
// Batch 28, Fix A. Covers the defect the scope audit found by reading
// `aggregateDelta.ts:260-298` against FR-021:
//
//   > Records MUST store the raw sums and counts from which averages are
//   > derived, so that a contribution can be added or withdrawn EXACTLY,
//   > without accumulating rounding drift across repeated operations.
//
// `applyHookAggregateWithdrawal` decremented every count and left the
// averages untouched, on the stated grounds that "the average cannot be
// re-derived exactly from count alone". True, and irrelevant: the
// withdrawn row's own `ctrLink` is recorded on the ledger
// (`decideAdWriteActions.ts:216`) and handed to the function by
// `applyLearningWrites.ts:237`. It was passed in and ignored.
//
// Why no existing test sees this: `withdraw_then_add` fires only when the
// contribution DIFFERS from the recorded one, and SC-002 drives ten
// IDENTICAL runs, which take the `noop` branch and never withdraw at all.
// The fixtures at `applyLearningWritesLease.test.ts:369-373` assert a
// FRESH mean (0.03 from 0.02 and 0.04); a fresh mean and a
// post-withdrawal mean are different quantities. This file is deliberately
// NOT an extension of those fixtures, so the distinction stays visible.
//
// The correct arithmetic on withdrawal, with aggregate count `n`, mean `M`
// and the withdrawn row's own recorded value `A`:
//
//     newAvg = (M*n - A) / (n - 1)          n - 1 == 0  =>  reset to 0
//
// The pre-fix code left the average at `M`, which on the next add produced
// `(M*n - M + B)/n` instead of `(M*n - A + B)/n` — wrong by exactly
// `(A - M)/n` per cycle, dragging the angle's average GEOMETRICALLY toward
// the value of whichever of its ads cycle (M' - A = (M - A)(1 - 1/n)).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    applyHookAggregatesDelta,
    applyHookAggregateWithdrawal,
} from "../../learning/aggregateDelta.js";
import { applyVisualAggregateWithdrawal } from "../../learning/applyLearningWrites.js";
import { applyVisualAggregatesDelta } from "../../learning/aggregateDelta.js";
import type { AdForLearning, HookPerformanceAggregate } from "../../learningAggregates.js";

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ❌ ${name}`);
        console.log(`     ${(e as Error).message}`);
    }
}

// ─── Fixture builder ──────────────────────────────────────────────
// Deliberately local. These cases are about arithmetic, not about the
// grouping shapes `learning.fixtures.ts` exists to construct.

function ad(overrides: Partial<AdForLearning> & { adId: string; creativeKey: string; ctrLink: number }): AdForLearning {
    return {
        generationId: "gen_" + overrides.creativeKey,
        matchType: "auto_hash",
        metadataAvailable: true,
        campaignObjective: "conversion",
        hookAngle: "urgency",
        cpm3d: 10,
        conversions3d: 1,
        spend3d: 100,
        verdict: "🟡",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        funnelType: "paid_event",
        layoutTemplate: "lt1",
        creativeModes: [],
        artDirection: null,
        universe: null,
        ...overrides,
    } as unknown as AdForLearning;
}

const hook = (m: Map<string, HookPerformanceAggregate>) => m.get("urgency")!;

// ═══ A1 — single withdrawal of a row whose value differs from the mean ═══

test("A1: withdrawing a row off the mean gives exactly (M*n - A)/(n-1)", () => {
    // Seed {0.01, 0.01, 0.01, 0.09} => M = 0.03, n = 4.
    const seeded = applyHookAggregatesDelta([], [
        ad({ adId: "a1", creativeKey: "c1", ctrLink: 0.01 }),
        ad({ adId: "a2", creativeKey: "c2", ctrLink: 0.01 }),
        ad({ adId: "a3", creativeKey: "c3", ctrLink: 0.01 }),
        ad({ adId: "a4", creativeKey: "c4", ctrLink: 0.09 }),
    ], 1);
    const before = hook(seeded);
    assert.equal(before.byObjective.conversion.avgLinkCtr, 0.03, "seed mean must be 0.03");
    assert.equal(before.byObjective.conversion.count, 4);

    // Withdraw the 0.09 row. (0.03*4 - 0.09)/3 = 0.03/3 = 0.01
    const after = applyHookAggregateWithdrawal(before, ad({ adId: "a4", creativeKey: "c4", ctrLink: 0.09 }));
    assert.equal(after.byObjective.conversion.count, 3, "count must decrement");
    assert.equal(
        after.byObjective.conversion.avgLinkCtr, 0.01,
        `avgLinkCtr must be (M*n - A)/(n-1) = 0.01, got ${after.byObjective.conversion.avgLinkCtr}`,
    );
});

// ═══ A2 — the n-1 == 0 guard ═══

test("A2: withdrawing the only contribution resets the average to 0, never NaN/Infinity", () => {
    const seeded = applyHookAggregatesDelta([], [ad({ adId: "a1", creativeKey: "c1", ctrLink: 0.05 })], 1);
    const after = applyHookAggregateWithdrawal(hook(seeded), ad({ adId: "a1", creativeKey: "c1", ctrLink: 0.05 }));
    assert.equal(after.byObjective.conversion.count, 0);
    assert.equal(after.byObjective.conversion.avgLinkCtr, 0, "must reset, not divide by zero");
    assert.ok(Number.isFinite(after.byObjective.conversion.avgLinkCtr), "must be finite");
});

// ═══ A3 — the repeated case (the production shape) ═══

test("A3: cycling one ad through withdraw-then-add 5x at a stable value leaves the average unchanged", () => {
    const seed = [
        ad({ adId: "a1", creativeKey: "c1", ctrLink: 0.01 }),
        ad({ adId: "a2", creativeKey: "c2", ctrLink: 0.01 }),
        ad({ adId: "a3", creativeKey: "c3", ctrLink: 0.01 }),
        ad({ adId: "a4", creativeKey: "c4", ctrLink: 0.09 }),
    ];
    let cur = [...applyHookAggregatesDelta([], seed, 1).values()];
    assert.equal(hook(new Map(cur.map((a) => [a.angleKey, a]))).byObjective.conversion.avgLinkCtr, 0.03);

    const cycling = ad({ adId: "a4", creativeKey: "c4", ctrLink: 0.09 });
    const seen: number[] = [];
    for (let sync = 2; sync <= 6; sync++) {
        // Mirror `applyLearningWrites`: withdrawals first, then the additive pass.
        const withdrawn = cur.map((a) => (a.angleKey === "urgency" ? applyHookAggregateWithdrawal(a, cycling) : a));
        cur = [...applyHookAggregatesDelta(withdrawn, [cycling], sync).values()];
        seen.push(hook(new Map(cur.map((a) => [a.angleKey, a]))).byObjective.conversion.avgLinkCtr);
    }
    assert.deepEqual(
        seen, [0.03, 0.03, 0.03, 0.03, 0.03],
        `true average is 0.0300 and must never move; got [${seen.join(", ")}]`,
    );
});

// ═══ A4 — the geo-tier and audience-type averages withdraw too ═══

test("A4: byGeoTier and byAudienceType averages are withdrawn, not left standing", () => {
    const seeded = applyHookAggregatesDelta([], [
        ad({ adId: "a1", creativeKey: "c1", ctrLink: 0.01 }),
        ad({ adId: "a2", creativeKey: "c2", ctrLink: 0.09 }),
    ], 1);
    const before = hook(seeded);
    assert.equal(before.byGeoTier.tier1_gulf.avgCtr, 0.05, "seed tier mean must be 0.05");

    const after = applyHookAggregateWithdrawal(before, ad({ adId: "a2", creativeKey: "c2", ctrLink: 0.09 }));
    // (0.05*2 - 0.09)/1 = 0.01
    assert.equal(after.byGeoTier.tier1_gulf.count, 1);
    assert.equal(after.byGeoTier.tier1_gulf.avgCtr, 0.01, `tier avgCtr must be 0.01, got ${after.byGeoTier.tier1_gulf.avgCtr}`);
    assert.equal(after.byAudienceType.broad.avgCtr, 0.01, `audience avgCtr must be 0.01, got ${after.byAudienceType.broad.avgCtr}`);
});

// ═══ A5 — the non-conversion bucket ═══

test("A5: the `other` objective bucket's average withdraws symmetrically", () => {
    const other = (o: Partial<AdForLearning> & { adId: string; creativeKey: string; ctrLink: number }) =>
        ({ ...ad(o), campaignObjective: "other" }) as AdForLearning;
    const seeded = applyHookAggregatesDelta([], [
        other({ adId: "a1", creativeKey: "c1", ctrLink: 0.02 }),
        other({ adId: "a2", creativeKey: "c2", ctrLink: 0.08 }),
    ], 1);
    const before = hook(seeded);
    assert.equal(before.byObjective.other.avgLinkCtr, 0.05);
    const after = applyHookAggregateWithdrawal(before, other({ adId: "a2", creativeKey: "c2", ctrLink: 0.08 }));
    // (0.05*2 - 0.08)/1 = 0.02
    assert.equal(after.byObjective.other.avgLinkCtr, 0.02, `got ${after.byObjective.other.avgLinkCtr}`);
});

// ═══ A6 — the visual aggregate: avgLinkCtr AND avgCpm ═══

test("A6: applyVisualAggregateWithdrawal withdraws both avgLinkCtr and avgCpm", () => {
    // A non-empty patternKey needs layoutTemplate AND artDirection AND
    // universe all non-null (computePatternKeyLocal returns "" otherwise,
    // and the aggregator skips the row).
    const vis = (o: { adId: string; creativeKey: string; ctrLink: number; cpm3d: number }) =>
        ({ ...ad(o), artDirection: "ad1", universe: "u1" }) as AdForLearning;
    const seeded = applyVisualAggregatesDelta([], [
        vis({ adId: "a1", creativeKey: "c1", ctrLink: 0.01, cpm3d: 10 }),
        vis({ adId: "a2", creativeKey: "c2", ctrLink: 0.09, cpm3d: 30 }),
    ], 1);
    assert.equal(seeded.size, 1, "fixture must produce exactly one visual pattern");
    const key = [...seeded.keys()][0];
    const before = seeded.get(key)!;
    assert.equal(before.byObjective.conversion.avgLinkCtr, 0.05, "seed ctr mean 0.05");
    assert.equal(before.byObjective.conversion.avgCpm, 20, "seed cpm mean 20");

    const after = applyVisualAggregateWithdrawal(before, vis({ adId: "a2", creativeKey: "c2", ctrLink: 0.09, cpm3d: 30 }));
    assert.equal(after.byObjective.conversion.count, 1);
    // (0.05*2 - 0.09)/1 = 0.01 ; (20*2 - 30)/1 = 10
    assert.equal(after.byObjective.conversion.avgLinkCtr, 0.01, `got ${after.byObjective.conversion.avgLinkCtr}`);
    assert.equal(after.byObjective.conversion.avgCpm, 10, `got ${after.byObjective.conversion.avgCpm}`);
});

// ═══ A7 — the deferral comment is gone ═══
// A naming/structure guard: the comment at aggregateDelta.ts:271-275 asserted
// a constraint that does not exist and is what made this read as intentional
// through 27 batches of review. A future edit that restores it restores the
// excuse, so the guard is worth its cost.

declare const __dirname: string;
const AGGREGATE_DELTA_TS = join(__dirname, "..", "..", "..", "src", "learning", "aggregateDelta.ts");

test("A7: the 'cannot be re-derived exactly from count alone' deferral comment is deleted", () => {
    const src = readFileSync(AGGREGATE_DELTA_TS, "utf8");
    assert.ok(
        !src.includes("cannot be re-derived exactly from count alone"),
        "the FR-021 deferral comment must not return — the withdrawn value IS passed in",
    );
});

// ═══ Runner ═══

console.log("");
console.log("=== FR-021 withdrawal arithmetic (Batch 28, Fix A) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
