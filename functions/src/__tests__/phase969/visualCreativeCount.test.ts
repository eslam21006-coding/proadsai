// functions/src/__tests__/phase969/visualCreativeCount.test.ts — FR-036 on the VISUAL aggregate
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Batch 30. Closes the gap the Batch 29 pair audit surfaced: `creativeCount`
// was READ on visual aggregates and never WRITTEN.
//
//   - `VisualPerformanceAggregate` declared no such field.
//   - Batch 28's `contributedCreativeKeys` went to the HOOK aggregate only.
//   - `whatsWorkingDashboard.ts:787` reads `sampleSize: v.creativeCount ?? 0`
//     for every visual row and feeds it to `pickHotAngle` (`:789`), which
//     filters `sampleSize >= HOOK_ICON_DATA_GATE` (= 3).
//
// So `visualHotKey` was ALWAYS null and no visual pattern could ever receive
// the 🔥 icon, whatever its evidence. The consequence test (V6) asserts the
// gate can now actually open, because a count that is merely present but
// never clears its gate would still be useless.
//
// The semantics mirror the hook exactly (FR-036, FR-073): one creative is one
// count per PATTERN, no matter how many ad rows carry it, and no matter how
// many syncs observe it. The unit of evidence is the creative.
//
// Every test that could be fooled by an in-memory Set crosses a
// persist-and-reload boundary — `JSON.parse(JSON.stringify(...))`, which is
// what Firestore serialisation does, and where a `Set` field vanished in the
// defect Batch 28 fixed. That requirement is inherited deliberately: it is the
// only boundary at which this class of defect is visible.

import assert from "node:assert/strict";
import {
    applyVisualAggregatesDelta,
} from "../../learning/aggregateDelta.js";
import { applyVisualAggregateWithdrawal } from "../../learning/applyLearningWrites.js";
import type { AdForLearning, VisualPerformanceAggregate } from "../../learningAggregates.js";

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

function ad(creativeKey: string, adId = creativeKey + "_r1", o: Partial<AdForLearning> = {}): AdForLearning {
    return {
        adId,
        creativeKey,
        generationId: "gen_" + creativeKey,
        matchType: "auto_hash",
        metadataAvailable: true,
        campaignObjective: "conversion",
        hookAngle: "urgency",
        ctrLink: 0.04,
        cpm3d: 12,
        conversions3d: 1,
        spend3d: 100,
        verdict: "🟡",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        funnelType: "paid_event",
        // A non-empty patternKey needs all three non-null
        // (`computePatternKeyLocal`), so every fixture here sets them.
        layoutTemplate: "lt1",
        creativeModes: [],
        artDirection: "ad1",
        universe: "u1",
        ...o,
    } as unknown as AdForLearning;
}

function persistAndReload(aggs: VisualPerformanceAggregate[]): VisualPerformanceAggregate[] {
    return JSON.parse(JSON.stringify(aggs)) as VisualPerformanceAggregate[];
}

const one = (m: Map<string, VisualPerformanceAggregate>) => [...m.values()][0];
const countOf = (m: Map<string, VisualPerformanceAggregate>) => one(m).creativeCount ?? 0;

// ═══ V1 — the field exists and is populated at all ═══

test("V1: a visual aggregate carries creativeCount after a sync", () => {
    const m = applyVisualAggregatesDelta([], [ad("c1")], 1);
    assert.equal(countOf(m), 1, `one creative must report creativeCount 1; got ${countOf(m)}`);
});

// ═══ V2 — row multiplicity (the fan-out this feature exists to close) ═══

test("V2: 55 rows of one creative in one pattern report creativeCount 1, not 55", () => {
    const rows = Array.from({ length: 55 }, (_, i) => ad("c1", `c1_r${i}`));
    const m = applyVisualAggregatesDelta([], rows, 1);
    assert.equal(countOf(m), 1, `55 rows, one creative; got ${countOf(m)}`);
    assert.equal(one(m).byObjective.conversion.count, 55, "all rows still aggregate their values");
});

// ═══ V3 — repeated observation across syncs (the Batch 28 class) ═══

test("V3: the same creative across a persist-and-reload boundary counts ONCE", () => {
    const sync1 = applyVisualAggregatesDelta([], [ad("c1")], 1);
    const sync2 = applyVisualAggregatesDelta(persistAndReload([...sync1.values()]), [ad("c1")], 2);
    assert.equal(countOf(sync2), 1, `the same creative seen again is not a second creative; got ${countOf(sync2)}`);
});

test("V4: four creatives cycling for five syncs stay at creativeCount 4", () => {
    const ads = ["c1", "c2", "c3", "c4"].map((c) => ad(c));
    let stored = persistAndReload([...applyVisualAggregatesDelta([], ads, 1).values()]);
    const seen = [stored[0].creativeCount ?? 0];
    for (let sync = 2; sync <= 6; sync++) {
        let withdrawn = stored;
        for (const a of ads) withdrawn = withdrawn.map((agg) => applyVisualAggregateWithdrawal(agg, a));
        stored = persistAndReload([...applyVisualAggregatesDelta(withdrawn, ads, sync).values()]);
        seen.push(stored[0].creativeCount ?? 0);
    }
    assert.deepEqual(seen, [4, 4, 4, 4, 4, 4], `got [${seen.join(", ")}]`);
});

// ═══ V5 — the add/withdraw invariant (Batch 29) holds for this field too ═══

test("V5: withdrawing a creative's only contribution decrements visual creativeCount", () => {
    const stored = persistAndReload([...applyVisualAggregatesDelta([], [ad("c1"), ad("c2")], 1).values()]);
    assert.equal(stored[0].creativeCount, 2);
    const after = applyVisualAggregateWithdrawal(stored[0], ad("c2"));
    assert.equal(after.creativeCount, 1, `a withdrawn creative stops being counted; got ${after.creativeCount}`);
});

test("V6: withdraw-then-add of one visual creative is net zero", () => {
    const stored = persistAndReload([...applyVisualAggregatesDelta([], [ad("c1"), ad("c2")], 1).values()]);
    const withdrawn = applyVisualAggregateWithdrawal(stored[0], ad("c1"));
    assert.equal(withdrawn.creativeCount, 1, "mid-cycle the creative is out");
    const readded = applyVisualAggregatesDelta([withdrawn], [ad("c1")], 2);
    assert.equal(countOf(readded), 2, `back to 2 after the additive pass; got ${countOf(readded)}`);
});

// ═══ V7 — absence is not evidence (FR-020) ═══

test("V7: a creative missing from a later sync keeps its count", () => {
    const sync1 = applyVisualAggregatesDelta([], [ad("c1"), ad("c2")], 1);
    const sync2 = applyVisualAggregatesDelta(persistAndReload([...sync1.values()]), [ad("c1")], 2);
    assert.equal(countOf(sync2), 2, `a narrower sync must not shrink the count; got ${countOf(sync2)}`);
});

// ═══ V8 — one creative spanning two patterns counts once in EACH ═══

test("V8: a creative contributing to two patterns counts once in each, not once overall", () => {
    const rows = [
        ad("c1", "c1_r1", { artDirection: "ad1" }),
        ad("c1", "c1_r2", { artDirection: "ad2" }),
    ];
    const m = applyVisualAggregatesDelta([], rows, 1);
    assert.equal(m.size, 2, `two art directions must give two patterns; got ${m.size}`);
    for (const [k, v] of m) {
        assert.equal(v.creativeCount, 1, `pattern ${k} must count the creative once; got ${v.creativeCount}`);
    }
});

// ═══ V9 — the consequence: the dashboard's icon gate can now open ═══

test("V9: three distinct creatives clear HOOK_ICON_DATA_GATE, so a visual pattern can get 🔥", () => {
    // `whatsWorkingDashboard.ts:787` builds the row as
    // `sampleSize: v.creativeCount ?? 0` and `pickHotAngle` (`:789`) filters
    // `sampleSize >= HOOK_ICON_DATA_GATE` (= 3, `:88`). Before this batch the
    // value was always `undefined ?? 0`, so `visualHotKey` was always null and
    // no visual pattern could ever be awarded the icon.
    const GATE = 3;
    const m = applyVisualAggregatesDelta([], [ad("c1"), ad("c2"), ad("c3")], 1);
    const rowSampleSize = one(m).creativeCount ?? 0;
    assert.ok(
        rowSampleSize >= GATE,
        `three creatives must clear the icon gate of ${GATE}; got ${rowSampleSize} ` +
        `(before this batch it was always 0, so visualHotKey was always null)`,
    );
});

// ═══ V10 — row multiplicity cannot fake the gate ═══

test("V10: 55 rows of ONE creative do NOT clear the gate — fan-out cannot manufacture evidence", () => {
    const GATE = 3;
    const rows = Array.from({ length: 55 }, (_, i) => ad("c1", `c1_r${i}`));
    const m = applyVisualAggregatesDelta([], rows, 1);
    const rowSampleSize = one(m).creativeCount ?? 0;
    assert.ok(
        rowSampleSize < GATE,
        `one creative across 55 rows must NOT clear the gate of ${GATE}; got ${rowSampleSize}`,
    );
});

// ═══ Runner ═══

console.log("");
console.log("=== FR-036 on the visual aggregate (Batch 30) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
