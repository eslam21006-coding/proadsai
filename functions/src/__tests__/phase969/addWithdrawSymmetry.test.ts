// functions/src/__tests__/phase969/addWithdrawSymmetry.test.ts — the add/withdraw invariant
// ═════════════════════════════════════════════════════════════════════════════════════════
// Batch 29. THE INVARIANT, stated once:
//
//   EVERY counter or average the withdrawal changes MUST be one the
//   addition changes, in the same branch, by the inverse amount.
//
// Two batches running, an add/withdraw pair has disagreed — FR-021's
// averages (Batch 28) and FR-036's creative count (Batch 28). Both were
// found by accident. This file exists so the rest were found on purpose,
// and so the next divergence is caught by a test rather than by a reader.
//
// A pair can disagree in either direction, and both are defects:
//
//   - The withdrawal subtracts from a field the addition never adds to.
//     The counter only ever travels downward and floors at zero. Nothing
//     reads a number that is always zero, so it fails silently.
//   - The addition adds to a field the withdrawal never subtracts from.
//     The counter only ever travels upward. Because withdraw-then-add is
//     the modal path (`contributedValues` carries `ctrLink` and `cpm`,
//     which move whenever spend moves), this inflates on EVERY sync —
//     the same shape as the `creativeCount` defect in Batch 28.
//
// The cycle tests below are the shape that caught both earlier defects:
// run withdraw-then-add five times with a stable value and assert nothing
// moved. A defect that is invisible in one call is obvious in five.

import assert from "node:assert/strict";
import {
    applyHookAggregatesDelta,
    applyHookAggregateWithdrawal,
    applyVisualAggregatesDelta,
} from "../../learning/aggregateDelta.js";
import { applyVisualAggregateWithdrawal } from "../../learning/applyLearningWrites.js";
import type {
    AdForLearning,
    HookPerformanceAggregate,
    VisualPerformanceAggregate,
} from "../../learningAggregates.js";

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

function ad(o: Partial<AdForLearning> = {}): AdForLearning {
    return {
        adId: "a1",
        creativeKey: "c1",
        generationId: "gen_c1",
        matchType: "auto_hash",
        metadataAvailable: true,
        campaignObjective: "conversion",
        hookAngle: "urgency",
        ctrLink: 0.04,
        cpm3d: 12,
        conversions3d: 1,
        spend3d: 100,
        verdict: "🟢",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        funnelType: "paid_event",
        layoutTemplate: "lt1",
        creativeModes: [],
        artDirection: "ad1",
        universe: "u1",
        ...o,
    } as unknown as AdForLearning;
}

const oneVisual = (m: Map<string, VisualPerformanceAggregate>) => [...m.values()][0];
const oneHook = (m: Map<string, HookPerformanceAggregate>) => m.get("urgency")!;

// ═══════════════════════════════════════════════════════════════════
// GROUP 1 — the three the owner named: visual counters the withdrawal
// decrements and the addition never incremented.
// ═══════════════════════════════════════════════════════════════════

test("S1: adding a visual contribution increments sampleSize, byGeoTier and byAudienceType", () => {
    const m = applyVisualAggregatesDelta([], [ad()], 1);
    const v = oneVisual(m);
    assert.equal(v.sampleSize, 1, `sampleSize must increment; got ${v.sampleSize}`);
    assert.equal(v.byGeoTier.tier1_gulf.count, 1, `byGeoTier count must increment; got ${v.byGeoTier.tier1_gulf.count}`);
    assert.equal(v.byAudienceType.broad.count, 1, `byAudienceType count must increment; got ${v.byAudienceType.broad.count}`);
});

test("S2: withdrawing that contribution returns all three to their prior values", () => {
    const seeded = oneVisual(applyVisualAggregatesDelta([], [ad()], 1));
    const after = applyVisualAggregateWithdrawal(seeded, ad());
    assert.equal(after.sampleSize, 0, `sampleSize back to 0; got ${after.sampleSize}`);
    assert.equal(after.byGeoTier.tier1_gulf.count, 0, `byGeoTier back to 0; got ${after.byGeoTier.tier1_gulf.count}`);
    assert.equal(after.byAudienceType.broad.count, 0, `byAudienceType back to 0; got ${after.byAudienceType.broad.count}`);
});

test("S3: cycling a visual creative through withdraw-then-add 5x leaves all three unchanged", () => {
    const rows = [ad({ adId: "a1", creativeKey: "c1" }), ad({ adId: "a2", creativeKey: "c2", ctrLink: 0.06, cpm3d: 20 })];
    let cur = [...applyVisualAggregatesDelta([], rows, 1).values()];
    const start = {
        sampleSize: cur[0].sampleSize,
        geo: cur[0].byGeoTier.tier1_gulf.count,
        aud: cur[0].byAudienceType.broad.count,
    };
    assert.equal(start.sampleSize, 2, `two rows must give sampleSize 2; got ${start.sampleSize}`);

    const cycling = ad({ adId: "a2", creativeKey: "c2", ctrLink: 0.06, cpm3d: 20 });
    for (let sync = 2; sync <= 6; sync++) {
        const withdrawn = cur.map((a) => applyVisualAggregateWithdrawal(a, cycling));
        cur = [...applyVisualAggregatesDelta(withdrawn, [cycling], sync).values()];
    }
    assert.deepEqual(
        {
            sampleSize: cur[0].sampleSize,
            geo: cur[0].byGeoTier.tier1_gulf.count,
            aud: cur[0].byAudienceType.broad.count,
        },
        start,
        "five withdraw-then-add cycles at a stable value must move nothing",
    );
});

test("S4: no visual counter can go negative when a withdrawal exceeds what was added", () => {
    const empty = oneVisual(applyVisualAggregatesDelta([], [ad()], 1));
    let cur = empty;
    for (let i = 0; i < 5; i++) cur = applyVisualAggregateWithdrawal(cur, ad());
    assert.ok(cur.sampleSize >= 0, `sampleSize went negative: ${cur.sampleSize}`);
    assert.ok(cur.byGeoTier.tier1_gulf.count >= 0, `byGeoTier went negative: ${cur.byGeoTier.tier1_gulf.count}`);
    assert.ok(cur.byAudienceType.broad.count >= 0, `byAudienceType went negative: ${cur.byAudienceType.broad.count}`);
    assert.ok(cur.byObjective.conversion.count >= 0, `conversion.count went negative: ${cur.byObjective.conversion.count}`);
    assert.ok(cur.byObjective.other.count >= 0, `other.count went negative: ${cur.byObjective.other.count}`);
    assert.ok(
        (cur.byObjective.conversion.bestVerdictCount ?? 0) >= 0,
        `bestVerdictCount went negative: ${cur.byObjective.conversion.bestVerdictCount}`,
    );
});

// ═══════════════════════════════════════════════════════════════════
// GROUP 2 — found on purpose by walking every pair. The withdrawal
// never subtracted these, so they inflate on the MODAL path.
// ═══════════════════════════════════════════════════════════════════

test("S5: the visual withdrawal decrements bestVerdictCount and worstVerdictCount", () => {
    const win = ad({ verdict: "🟢" });
    const lose = ad({ adId: "a2", creativeKey: "c2", verdict: "🔴" });
    const seeded = oneVisual(applyVisualAggregatesDelta([], [win, lose], 1));
    assert.equal(seeded.byObjective.conversion.bestVerdictCount, 1);
    assert.equal(seeded.byObjective.conversion.worstVerdictCount, 1);

    const afterWin = applyVisualAggregateWithdrawal(seeded, win);
    assert.equal(
        afterWin.byObjective.conversion.bestVerdictCount, 0,
        `withdrawing a 🟢 must decrement bestVerdictCount; got ${afterWin.byObjective.conversion.bestVerdictCount}`,
    );
    const afterLose = applyVisualAggregateWithdrawal(afterWin, lose);
    assert.equal(
        afterLose.byObjective.conversion.worstVerdictCount, 0,
        `withdrawing a 🔴 must decrement worstVerdictCount; got ${afterLose.byObjective.conversion.worstVerdictCount}`,
    );
});

test("S6: cycling a 🟢 visual creative 5x does not inflate bestVerdictCount", () => {
    const win = ad({ verdict: "🟢" });
    let cur = [...applyVisualAggregatesDelta([], [win], 1).values()];
    for (let sync = 2; sync <= 6; sync++) {
        const withdrawn = cur.map((a) => applyVisualAggregateWithdrawal(a, win));
        cur = [...applyVisualAggregatesDelta(withdrawn, [win], sync).values()];
    }
    assert.equal(
        cur[0].byObjective.conversion.bestVerdictCount, 1,
        `one winning creative is one win after five syncs; got ${cur[0].byObjective.conversion.bestVerdictCount}`,
    );
});

test("S7: the HOOK byFunnelType withdrawal fires only in the branch the addition fired in", () => {
    // `applyAdToHook` increments byFunnelType INSIDE the conversion branch.
    // The withdrawal decremented it unconditionally, so a non-conversion ad
    // subtracted a bucket count it never contributed. FR-025 keeps the
    // partition's meaning fixed, so the ADDITION is the correct side here:
    // the withdrawal is aligned to it rather than the other way round.
    const conv = ad({ campaignObjective: "conversion", funnelType: "paid_event" });
    const other = ad({ adId: "a2", creativeKey: "c2", campaignObjective: "other", funnelType: "paid_event" });

    const seeded = oneHook(applyHookAggregatesDelta([], [conv, other], 1));
    assert.equal(
        seeded.byFunnelType?.paid_event.count, 1,
        `only the conversion row contributes to the funnel bucket; got ${seeded.byFunnelType?.paid_event.count}`,
    );

    // Withdrawing the NON-conversion row must not touch the bucket.
    const after = applyHookAggregateWithdrawal(seeded, other);
    assert.equal(
        after.byFunnelType?.paid_event.count, 1,
        `a non-conversion withdrawal must not decrement a bucket it never incremented; got ${after.byFunnelType?.paid_event.count}`,
    );
});

test("S8: the HOOK byFunnelType survives five withdraw-then-add cycles of a non-conversion row", () => {
    const conv = ad({ campaignObjective: "conversion", funnelType: "paid_event" });
    const other = ad({ adId: "a2", creativeKey: "c2", campaignObjective: "other", funnelType: "paid_event" });
    let cur = [...applyHookAggregatesDelta([], [conv, other], 1).values()];
    for (let sync = 2; sync <= 6; sync++) {
        const withdrawn = cur.map((a) => applyHookAggregateWithdrawal(a, other));
        cur = [...applyHookAggregatesDelta(withdrawn, [other], sync).values()];
    }
    const bucket = oneHook(new Map(cur.map((a) => [a.angleKey, a]))).byFunnelType?.paid_event.count;
    assert.equal(bucket, 1, `the conversion row's single contribution must stand; got ${bucket}`);
});

// ═══════════════════════════════════════════════════════════════════
// GROUP 3 — the visual geo/audience AVERAGES, now that the counts move.
// A count without its average is half a partition.
// ═══════════════════════════════════════════════════════════════════

test("S9: visual byGeoTier and byAudienceType maintain avgCtr and avgCpm, and withdraw them", () => {
    const a1 = ad({ adId: "a1", creativeKey: "c1", ctrLink: 0.02, cpm3d: 10 });
    const a2 = ad({ adId: "a2", creativeKey: "c2", ctrLink: 0.06, cpm3d: 30 });
    const seeded = oneVisual(applyVisualAggregatesDelta([], [a1, a2], 1));
    assert.equal(seeded.byGeoTier.tier1_gulf.avgCtr, 0.04, `tier avgCtr; got ${seeded.byGeoTier.tier1_gulf.avgCtr}`);
    assert.equal(seeded.byGeoTier.tier1_gulf.avgCpm, 20, `tier avgCpm; got ${seeded.byGeoTier.tier1_gulf.avgCpm}`);

    const after = applyVisualAggregateWithdrawal(seeded, a2);
    // (0.04*2 - 0.06)/1 = 0.02 ; (20*2 - 30)/1 = 10
    assert.equal(after.byGeoTier.tier1_gulf.avgCtr, 0.02, `got ${after.byGeoTier.tier1_gulf.avgCtr}`);
    assert.equal(after.byGeoTier.tier1_gulf.avgCpm, 10, `got ${after.byGeoTier.tier1_gulf.avgCpm}`);
    assert.equal(after.byAudienceType.broad.avgCtr, 0.02, `got ${after.byAudienceType.broad.avgCtr}`);
    assert.equal(after.byAudienceType.broad.avgCpm, 10, `got ${after.byAudienceType.broad.avgCpm}`);
});

// ═══════════════════════════════════════════════════════════════════
// GROUP 4 — the invariant is stated in the code, so the next reader
// meets it before writing the next pair.
// ═══════════════════════════════════════════════════════════════════

test("S10: the add/withdraw invariant is stated at both withdrawal sites", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require("node:path");
    const root = join(__dirname, "..", "..", "..", "src", "learning");
    const delta: string = readFileSync(join(root, "aggregateDelta.ts"), "utf8");
    const writes: string = readFileSync(join(root, "applyLearningWrites.ts"), "utf8");
    const NEEDLE = "ADD/WITHDRAW INVARIANT";
    assert.ok(delta.includes(NEEDLE), "aggregateDelta.ts must state the invariant");
    assert.ok(writes.includes(NEEDLE), "applyLearningWrites.ts must state the invariant");
});

// ═══ Runner ═══

console.log("");
console.log("=== add/withdraw symmetry across every pair (Batch 29) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
