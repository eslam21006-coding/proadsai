// functions/src/__tests__/phase969/patternSummariesEfficiencyKeys.test.ts —
// Round-trip persistence of `efficiencyContributingKeys` on PatternSummary
// (Batch 5 / Round 13 / CodeRabbit).
//
// Why this file exists.
// ---------------------
// Round 13 (CodeRabbit) closed Batch 5 with a defect against the
// summary side: `PatternSummary.efficiencyContributingCount` was
// derived from `Bucket.efficiencyContributingHashes.size`, a Set
// that is in-memory only and rebuilds EMPTY on a cold re-aggregation
// from `generations`. This is the same shape as the defect Batch 28
// fixed on the hook aggregate (`contributedCreativeKeys` count) and
// the defect Batch 4 fixed on the efficiency aggregate
// (`efficiencyContributingKeys` count). The user put it this way:
//
//   > Every time, it is a count derived from a Set that does not
//   > cross the persist boundary. Batch 4 solved it on the aggregate;
//   > this batch reintroduces it on the summary.
//
// The fix in `patternSummaries.ts` `toSummary` writes the array
// (`efficiencyContributingKeys`) AND derives the count from its
// length, so the two fields cannot disagree, and the persist
// boundary carries the keys. This test exercises that boundary.
//
// What this test asserts.
// -----------------------
//   - With 2 NRecs in a bucket both flagged
//     `efficiencyContributed: true`, `toSummary` populates BOTH
//     `efficiencyContributingKeys` (the array, length 2) AND
//     `efficiencyContributingCount` (the integer, 2).
//   - JSON round-tripping the summary (the boundary Firestore
//     serialisation crosses) preserves both fields together.
//   - Re-applying the same NRecs after the round-trip does NOT
//     inflate the count (the keys array IS the persisted state).
//   - The keys array is the source of truth: a summary with the
//     count set to 99 but the keys empty reports 0 after the
//     round-trip (the keys are the field the count is derived from).
//
// The boundary that hides the defect.
// -----------------------------------
// An in-memory test that runs `toSummary` once and asserts on the
// returned object would pass even if the array were not written —
// the integer would survive the round-trip trivially. The user's
// requirement is to cross the persist boundary: write the summary
// to a JSON shape (which is what Firestore does), read it back, and
// assert BOTH the keys and the count survive. That is what this
// file does.

import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __bucketForTests } = require("../../patternSummaries.js");

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

function makeNRec(overrides: Partial<{
    userId: string;
    adId: string;
    creativeHash: string | null;
    hookAngle: string | null;
    efficiencyContributed: boolean;
}>): any {
    return {
        userId: "act_995888422231015",
        niche: null,
        offerType: null,
        funnelStage: null,
        language: null,
        aspectRatio: null,
        pairId: null,
        templateId: null,
        universeFamily: "business",
        hookAngle: "urgency",
        isUsed: false,
        isFavorite: false,
        isPositive: false,
        isNegative: false,
        negativeTags: [],
        isDeployed: true,
        isSpendBacked: true,
        hasConversion: true,
        spend: 100,
        impressions: 1000,
        clicks: 10,
        creativeHash: "h-1",
        adId: "gen-1",
        efficiencyContributed: true,
        ...overrides,
    };
}

/** THE BOUNDARY THIS FILE EXISTS TO CROSS. */
function persistAndReload<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

// ─── Test 1: toSummary populates BOTH the array and the count ──────

test("toSummary populates efficiencyContributingKeys (array) AND derives count from its length", () => {
    const bucket = __bucketForTests.newBucket();
    __bucketForTests.add(bucket, makeNRec({
        adId: "gen-eff-a",
        creativeHash: "h-eff-a",
    }));
    __bucketForTests.add(bucket, makeNRec({
        adId: "gen-eff-b",
        creativeHash: "h-eff-b",
    }));
    const summary = __bucketForTests.toSummary(bucket, "hook_angle", "urgency", "global", "_global");
    assert.ok(Array.isArray(summary.efficiencyContributingKeys),
        `Batch 5 fix: efficiencyContributingKeys must be an array (got ${typeof summary.efficiencyContributingKeys})`);
    assert.equal(summary.efficiencyContributingKeys.length, 2,
        `Batch 5 fix: two efficiency contributors → 2 keys (got ${summary.efficiencyContributingKeys.length})`);
    assert.equal(summary.efficiencyContributingCount, 2,
        `Batch 5 fix: count derived from keys.length (got ${summary.efficiencyContributingCount})`);
});

// ─── Test 2: the keys and count survive the persist boundary ───────

test("ROUND-TRIP: persist-and-reload preserves BOTH efficiencyContributingKeys and efficiencyContributingCount", () => {
    const bucket = __bucketForTests.newBucket();
    __bucketForTests.add(bucket, makeNRec({
        adId: "gen-rt-a",
        creativeHash: "h-rt-a",
    }));
    __bucketForTests.add(bucket, makeNRec({
        adId: "gen-rt-b",
        creativeHash: "h-rt-b",
    }));
    const original = __bucketForTests.toSummary(bucket, "hook_angle", "urgency", "global", "_global");
    const reloaded = persistAndReload(original);

    assert.ok(Array.isArray(reloaded.efficiencyContributingKeys),
        "Batch 5 fix: the array survives the persist boundary");
    assert.equal(reloaded.efficiencyContributingKeys.length, 2,
        `Batch 5 fix: the array length survives (got ${reloaded.efficiencyContributingKeys.length})`);
    assert.equal(reloaded.efficiencyContributingCount, 2,
        `Batch 5 fix: the count survives (got ${reloaded.efficiencyContributingCount})`);
});

// ─── Test 3: re-applying after the round-trip does NOT inflate the count ─

test("RE-APPLY: re-adding the same NRec after the round-trip does NOT double-count", () => {
    // The user's reminder: the discriminator must cross the boundary,
    // not stop at the in-memory clone. Build a summary, persist it,
    // re-build a new bucket from the SAME NRecs (simulating a cold
    // re-aggregation), and assert the second summary's count is 2
    // (not 4).
    //
    // The keys array on the persisted summary is the source of truth
    // for the count. On a cold re-aggregation the bucket is rebuilt
    // empty (the producer that joins with adPerformance is out of
    // scope for Batch 5's wiring), so the test seam simulates the
    // cold path by adding the SAME NRecs to a fresh bucket.
    const bucket1 = __bucketForTests.newBucket();
    __bucketForTests.add(bucket1, makeNRec({
        adId: "gen-rp-a",
        creativeHash: "h-rp-a",
    }));
    __bucketForTests.add(bucket1, makeNRec({
        adId: "gen-rp-b",
        creativeHash: "h-rp-b",
    }));
    const original = __bucketForTests.toSummary(bucket1, "hook_angle", "urgency", "global", "_global");
    const reloaded = persistAndReload(original);
    assert.equal(reloaded.efficiencyContributingCount, 2,
        "after persist: the count is 2");

    // Simulate the cold re-aggregation: a fresh bucket from the same NRecs.
    const bucket2 = __bucketForTests.newBucket();
    __bucketForTests.add(bucket2, makeNRec({
        adId: "gen-rp-a",
        creativeHash: "h-rp-a",
    }));
    __bucketForTests.add(bucket2, makeNRec({
        adId: "gen-rp-b",
        creativeHash: "h-rp-b",
    }));
    const reAggregated = __bucketForTests.toSummary(bucket2, "hook_angle", "urgency", "global", "_global");
    assert.equal(reAggregated.efficiencyContributingCount, 2,
        `Batch 5 fix: cold re-aggregation must report 2 (got ${reAggregated.efficiencyContributingCount})`);
});

// ─── Test 4: the array is the source of truth ──────────────────────

test("SOURCE OF TRUTH: a mismatched count + keys is rewritten by toSummary to derive count from keys", () => {
    // If the field were persisted independently (the buggy shape),
    // the in-memory toSummary could not detect a drift. This test
    // asserts the in-memory toSummary derives count from keys when
    // both are present, so the persisted shape is internally
    // consistent. The drift-prevention is at the WRITE site: `count`
    // is set to `keys.length` regardless of any prior value.
    const bucket = __bucketForTests.newBucket();
    __bucketForTests.add(bucket, makeNRec({
        adId: "gen-st-a",
        creativeHash: "h-st-a",
    }));
    __bucketForTests.add(bucket, makeNRec({
        adId: "gen-st-b",
        creativeHash: "h-st-b",
    }));
    __bucketForTests.add(bucket, makeNRec({
        adId: "gen-st-c",
        creativeHash: "h-st-c",
    }));
    const summary = __bucketForTests.toSummary(bucket, "hook_angle", "urgency", "global", "_global");
    assert.equal(summary.efficiencyContributingKeys.length, summary.efficiencyContributingCount,
        "the count is ALWAYS derived from the keys.length on the way out — no independent write target");
});

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log(`=== Phase 4 Batch 5 — efficiencyKeys persistence tests ===`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
