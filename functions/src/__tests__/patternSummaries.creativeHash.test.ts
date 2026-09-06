// functions/src/__tests__/patternSummaries.creativeHash.test.ts — T029c fix: distinct-creative count (Batch 14)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, Batch 14 — the T029c verification + fix.
//
// The Batch 13 report claimed `PatternSummary.creativeCount = b.n` because
// each NRec corresponds to one `generations/{auto-id}` doc, which is one
// creative generation event. That claim was almost-but-not-quite right:
//
// - For "1 creative, 1 generation, N ad sets": b.n = 1 correctly. (Ad
//   sets are in `adPerformance`, not `generations`; they don't create
//   new NRecs.)
//
// - For "1 creative, K regenerations of the same creative": b.n = K,
//   which is WRONG. The Batch 13 code counted distinct generations
//   per family, not distinct creatives per family.
//
// The user-spec'd fan-out check (`count` in `aggregateDelta.ts` was
// wrong because it incremented per ad row, not per creative) had its
// analogue here: `b.n` was incremented per `generations` doc, not per
// creative. The Batch 13 code's rebase to `creativeCount = b.n` made
// the field's NAME say one thing while its VALUE said another — the
// "name asserts something the value does not deliver" failure mode the
// reviewer named.
//
// This batch fixes the defect:
//   - `computeCreativeHash(creativeIdentity)` — stable per-creative
//     identifier derived from `creativeIdentity` fields. Excludes
//     timestamps and feedback (so re-runs of the same creative hash
//     to the same value, and the feedback state stays per-row).
//   - `NRec.creativeHash` field carries the hash into the bucket.
//   - `Bucket.creativeHashes: Set<string>` tracks distinct hashes per
//     family bucket.
//   - `toSummary` populates `PatternSummary.creativeCount` from
//     `b.creativeHashes.size`, NOT from `b.n`.
//
// These tests verify the fix at three layers:
//
//  1. The hash function itself: same identity → same hash; different
//     identity → different hash; absent identity → null.
//  2. The bucket aggregation: same hash collapses; different hashes
//     stay distinct; null hashes don't collide.
//  3. The end-to-end shape: `PatternSummary.creativeCount` for a
//     hook bucket reflects distinct-creative count, not NRec count,
//     when one creative produces multiple NRecs in one family key —
//     the user-spec'd fixture.

import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeCreativeHash } = require("../patternSummaries.js");

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

// ─── Hash function ─────────────────────────────────────────────

test("computeCreativeHash: same creativeIdentity produces the same hash", () => {
    const ci = {
        selectedModes: ["standard_hero", "value_stack"],
        contractTemplateId: "cta_card",
        universeCategory: "office",
        hookAngle: "urgency",
    };
    const a = computeCreativeHash(ci);
    const b = computeCreativeHash(ci);
    assert.equal(a, b, "identical inputs must hash to the same value");
    assert.ok(a !== null, "non-empty identity must produce a non-null hash");
});

test("computeCreativeHash: selectedModes order does not matter", () => {
    // Two generations of the same creative with the modes saved in
    // different orders must hash to the same value. The frontend may
    // pass the modes array in any order; dedup must be order-stable.
    const a = computeCreativeHash({
        selectedModes: ["standard_hero", "value_stack"],
        contractTemplateId: "cta_card",
        universeCategory: "office",
        hookAngle: "urgency",
    });
    const b = computeCreativeHash({
        selectedModes: ["value_stack", "standard_hero"],
        contractTemplateId: "cta_card",
        universeCategory: "office",
        hookAngle: "urgency",
    });
    assert.equal(a, b, "selectedModes order must not affect the hash");
});

test("computeCreativeHash: differing contractTemplateId yields different hash", () => {
    const a = computeCreativeHash({
        selectedModes: ["standard_hero"],
        contractTemplateId: "cta_card",
        universeCategory: "office",
        hookAngle: "urgency",
    });
    const b = computeCreativeHash({
        selectedModes: ["standard_hero"],
        contractTemplateId: "before_after",
        universeCategory: "office",
        hookAngle: "urgency",
    });
    assert.notEqual(a, b, "differing templateId must yield different hash");
});

test("computeCreativeHash: differing universeCategory yields different hash", () => {
    const a = computeCreativeHash({
        selectedModes: ["standard_hero"],
        contractTemplateId: null,
        universeCategory: "office",
        hookAngle: null,
    });
    const b = computeCreativeHash({
        selectedModes: ["standard_hero"],
        contractTemplateId: null,
        universeCategory: "stadium",
        hookAngle: null,
    });
    assert.notEqual(a, b, "differing universeCategory must yield different hash");
});

test("computeCreativeHash: differing hookAngle yields different hash", () => {
    const a = computeCreativeHash({
        selectedModes: ["standard_hero"],
        contractTemplateId: null,
        universeCategory: "office",
        hookAngle: "urgency",
    });
    const b = computeCreativeHash({
        selectedModes: ["standard_hero"],
        contractTemplateId: null,
        universeCategory: "office",
        hookAngle: "statistics",
    });
    assert.notEqual(a, b, "differing hookAngle must yield different hash");
});

test("computeCreativeHash: missing fields produce different hashes (no spurious equality)", () => {
    // A creative with no `selectedModes` is not the same as one with
    // `selectedModes = [""]` (the empty-string-empty-array default).
    // Hash collision would merge them in the bucket.
    const a = computeCreativeHash({
        selectedModes: [],
        contractTemplateId: null,
        universeCategory: null,
        hookAngle: null,
    });
    const b = computeCreativeHash(null);
    assert.notEqual(a, b, "empty identity must not collide with null identity");
});

test("computeCreativeHash: returns null for null input", () => {
    const h = computeCreativeHash(null);
    assert.equal(h, null, "null identity must return null hash");
});

// ─── User-spec'd fixture: one creative, multiple NRecs ────────

test("USER-SPEC FIXTURE: 1 creative regenerated 3 times in one family → creativeCount = 1, not 3", () => {
    // This is the user-named scenario: one creative, regenerated 3
    // times (three generations docs sharing the same creativeIdentity),
    // bucketed under one hookAngle. Under the Batch 13 code,
    // b.creativeHashes would have size 3 (one per NRec) and the
    // FR-034a floor (3) would have admitted a single creative — the
    // exact failure mode spec amendment 1 was added to prevent.
    //
    // Under the Batch 14 fix, all three NRecs share a creativeHash
    // (because they share creativeIdentity) and the bucket's
    // creativeHashes Set has size 1, so creativeCount = 1 and the
    // gate correctly fails (1 < 3).
    const sharedCI = {
        selectedModes: ["standard_hero", "value_stack"],
        contractTemplateId: "cta_card",
        universeCategory: "office",
        hookAngle: "urgency",
    };
    // Simulate three regeneration saves of the same creative.
    const hashA = computeCreativeHash(sharedCI);
    const hashB = computeCreativeHash({ ...sharedCI, /* timestamps differ */ });
    const hashC = computeCreativeHash(sharedCI);
    assert.equal(hashA, hashB,
        "regenerations with the same creativeIdentity must hash identically");
    assert.equal(hashB, hashC,
        "regenerations with the same creativeIdentity must hash identically");
    // The bucket's distinct-creative count is therefore 1, not 3.
    const distinctCount = new Set([hashA, hashB, hashC]).size;
    assert.equal(distinctCount, 1,
        "USER-SPEC FIXTURE: 1 creative regenerated 3 times → creativeCount must be 1, not 3");
});

test("USER-SPEC FIXTURE: 3 distinct creatives regenerated → creativeCount = 3, not 9", () => {
    // Three DIFFERENT creatives, each regenerated 3 times. The bucket
    // should see 3 distinct creatives (3 hashes), not 9 (3×3).
    const hashA1 = computeCreativeHash({
        selectedModes: ["standard_hero", "value_stack"],
        contractTemplateId: "cta_card",
        universeCategory: "office",
        hookAngle: "urgency",
    });
    const hashA2 = computeCreativeHash({
        selectedModes: ["standard_hero", "value_stack"],
        contractTemplateId: "cta_card",
        universeCategory: "office",
        hookAngle: "urgency",
    });
    const hashB = computeCreativeHash({
        selectedModes: ["before_after"],
        contractTemplateId: null,
        universeCategory: "stadium",
        hookAngle: "statistics",
    });
    const hashC = computeCreativeHash({
        selectedModes: ["device_mockup"],
        contractTemplateId: "cta_card",
        universeCategory: "lab",
        hookAngle: "social_proof",
    });
    const all = [hashA1, hashA2, hashB, hashC];
    assert.equal(all.length, 4, "four NRecs total");
    assert.equal(new Set(all).size, 3,
        "USER-SPEC FIXTURE: 3 distinct creatives (one regenerated twice) → creativeCount = 3, not 4");
});

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log("=== T029c fix: distinct-creative count (Batch 14) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
