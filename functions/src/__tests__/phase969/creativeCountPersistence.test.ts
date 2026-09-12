// functions/src/__tests__/phase969/creativeCountPersistence.test.ts — FR-036 distinct-creative count
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// Batch 28, Fix B. Covers the defect the scope audit found while running a
// simulation for the FR-021 withdrawal defect — the `creativeCount` column
// of that run climbed 4 → 5 → 6 → 7 → 8 while only one ad cycled.
//
// FR-036, in its own words:
//
//   > The sample size used for the activation decision MUST count distinct
//   > creatives. NEITHER REPEATED OBSERVATION ACROSS SYNCS nor multiplicity
//   > of ad rows may inflate the count.
//
// Row multiplicity was genuinely closed by T021/T021a. Repeated observation
// was not: the dedup `Set` was stripped before persisting and re-initialised
// EMPTY on read, so the same creative re-incremented the count on every sync,
// and withdrawal never decremented it. Four creatives reported 16 after four
// nights.
//
// ═══ WHY THIS FILE EXISTS SEPARATELY, AND WHAT IT MUST CROSS ═══
//
// No pre-existing test could see this, and the reason is structural rather
// than an oversight: every accumulation test drives ONE
// `applyHookAggregatesDelta` call, and within a single call the Set IS live
// and DOES dedupe correctly. `learningAccumulation.test.ts`'s SC-008 case
// ("55 rows in one creative contribute 1, not 55") passes before and after
// this fix — it tests row multiplicity within one call, which is the half
// that always worked.
//
// The defect lives only across a PERSIST-AND-RELOAD boundary. Every test
// below therefore round-trips the aggregate through its public stored shape
// (`JSON.parse(JSON.stringify(...))`, which is what Firestore serialisation
// does to it — a `Set` field would not survive, which is the whole bug)
// before feeding it back in. Any future test of this behaviour must cross
// that boundary or it proves nothing.
//
// Blast radius, confirmed and deliberately NOT touched here:
// `PatternSummary.creativeCount` (`patternSummaries.ts:463`) is a different
// field from a different producer — `b.creativeHashes.size`, a Set built
// fresh in memory per `summarizeAccount` call. It is correct as written, so
// FR-034a's floor of 3 in `rankingEngine.ts:179` is unaffected by this bug
// and by this fix.

import assert from "node:assert/strict";
import {
    applyHookAggregatesDelta,
    applyHookAggregateWithdrawal,
} from "../../learning/aggregateDelta.js";
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

function ad(creativeKey: string, adId = creativeKey + "_r1"): AdForLearning {
    return {
        adId,
        creativeKey,
        generationId: "gen_" + creativeKey,
        matchType: "auto_hash",
        metadataAvailable: true,
        campaignObjective: "conversion",
        hookAngle: "urgency",
        ctrLink: 0.03,
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
    } as unknown as AdForLearning;
}

/**
 * THE BOUNDARY THIS FILE EXISTS TO CROSS. Firestore stores JSON; anything
 * that does not survive `JSON.stringify` is gone by the next sync. Passing
 * an aggregate straight from one call into the next — which is what every
 * other test does — hides the defect entirely.
 */
function persistAndReload(aggs: HookPerformanceAggregate[]): HookPerformanceAggregate[] {
    return JSON.parse(JSON.stringify(aggs)) as HookPerformanceAggregate[];
}

const hook = (m: Map<string, HookPerformanceAggregate>) => m.get("urgency")!;
const countOf = (m: Map<string, HookPerformanceAggregate>) => hook(m).creativeCount ?? 0;

// ═══ B1 — the minimal case: one creative, two syncs ═══

test("B1: the same creative across a persist-and-reload boundary counts ONCE, not twice", () => {
    const sync1 = applyHookAggregatesDelta([], [ad("c1")], 1);
    assert.equal(countOf(sync1), 1, "first sync: one creative");

    const reloaded = persistAndReload([...sync1.values()]);
    const sync2 = applyHookAggregatesDelta(reloaded, [ad("c1")], 2);
    assert.equal(
        countOf(sync2), 1,
        `the same creative seen again is not a second creative (FR-036); got ${countOf(sync2)}`,
    );
});

// ═══ B2 — the production shape: four creatives, five nights ═══

test("B2: four creatives cycling for five syncs stay at creativeCount 4, not 16 or 20", () => {
    const creatives = ["c1", "c2", "c3", "c4"];
    const ads = creatives.map((c) => ad(c));

    let stored = persistAndReload([...applyHookAggregatesDelta([], ads, 1).values()]);
    const seen: number[] = [stored[0].creativeCount ?? 0];

    for (let sync = 2; sync <= 6; sync++) {
        // Mirror `applyLearningWrites`: all withdrawals, then the additive pass.
        let withdrawn = stored;
        for (const a of ads) {
            withdrawn = withdrawn.map((agg) => (agg.angleKey === "urgency" ? applyHookAggregateWithdrawal(agg, a) : agg));
        }
        const next = applyHookAggregatesDelta(withdrawn, ads, sync);
        stored = persistAndReload([...next.values()]);
        seen.push(stored[0].creativeCount ?? 0);
    }

    assert.deepEqual(
        seen, [4, 4, 4, 4, 4, 4],
        `four creatives are four creatives however many nights pass; got [${seen.join(", ")}]`,
    );
});

// ═══ B3 — absence is not evidence (FR-020) ═══

test("B3: a creative missing from a later sync KEEPS its count — absence is not evidence", () => {
    const sync1 = applyHookAggregatesDelta([], [ad("c1"), ad("c2")], 1);
    assert.equal(countOf(sync1), 2);

    // Sync 2 returns only c1. c2 was not withdrawn — it simply was not in
    // the batch. FR-020: a sync covering a subset must not decrease a count.
    const sync2 = applyHookAggregatesDelta(persistAndReload([...sync1.values()]), [ad("c1")], 2);
    assert.equal(countOf(sync2), 2, `got ${countOf(sync2)} — a narrower sync must not shrink the count`);
});

// ═══ B4 — withdrawal decrements when the creative's contribution goes ═══

test("B4: withdrawing a creative's only contribution decrements creativeCount", () => {
    const sync1 = applyHookAggregatesDelta([], [ad("c1"), ad("c2")], 1);
    const stored = persistAndReload([...sync1.values()]);
    assert.equal(stored[0].creativeCount, 2);

    // withdraw_only for c2 (de-listed, cascade-marked, or FR-070 failed read):
    // withdrawn and NOT re-added.
    const after = applyHookAggregateWithdrawal(stored[0], ad("c2"));
    assert.equal(
        after.creativeCount, 1,
        `a withdrawn creative stops being counted; got ${after.creativeCount}`,
    );
});

// ═══ B5 — withdraw-then-add is net zero ═══

test("B5: withdraw-then-add of the same creative leaves creativeCount unchanged", () => {
    const stored = persistAndReload([...applyHookAggregatesDelta([], [ad("c1"), ad("c2")], 1).values()]);
    const withdrawn = applyHookAggregateWithdrawal(stored[0], ad("c1"));
    assert.equal(withdrawn.creativeCount, 1, "mid-cycle the creative is out");
    const readded = applyHookAggregatesDelta([withdrawn], [ad("c1")], 2);
    assert.equal(countOf(readded), 2, `back to 2 after the additive pass; got ${countOf(readded)}`);
});

// ═══ B6 — row multiplicity stays closed (the half that always worked) ═══

test("B6: 55 rows of one creative still contribute creativeCount 1 (T021a unregressed)", () => {
    const rows = Array.from({ length: 55 }, (_, i) => ad("c1", `c1_r${i}`));
    const m = applyHookAggregatesDelta([], rows, 1);
    assert.equal(countOf(m), 1, `55 rows, one creative; got ${countOf(m)}`);
    assert.equal(hook(m).byObjective.conversion.count, 55, "all rows still aggregate their values");
});

// ═══ B7 — the deferral note is gone ═══

test("B7: the 'defer to the follow-up batch' note on contributedCreatives is deleted", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require("node:path");
    const src: string = readFileSync(
        join(__dirname, "..", "..", "..", "src", "learning", "aggregateDelta.ts"),
        "utf8",
    );
    assert.ok(
        !src.includes("Defer to the follow-up batch"),
        "the deferral note must not return — the follow-up batch is this one",
    );
});

// ═══ Runner ═══

console.log("");
console.log("=== FR-036 distinct-creative count across syncs (Batch 28, Fix B) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
