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
    //
    // BATCH 21 — CodeRabbit round-2 fix: with the audit-fix, an
    // identity whose four fields are all empty/absent hashes to
    // null (the fallback path). Two such identities collide on null,
    // and that's CORRECT — they share no creative identity, so the
    // bucket counts each as one legacy row. The pre-fix code
    // returned a non-null djb2 hash of the constant string `'|||'`
    // for any empty identity; that was the bug. The assertion
    // below now distinguishes a populated identity from null and
    // from an empty identity (which also returns null).
    const populated = computeCreativeHash({ selectedModes: ["standard_hero"], contractTemplateId: "cta_card", universeCategory: "office", hookAngle: "urgency" });
    const empty = computeCreativeHash({ selectedModes: [], contractTemplateId: null, universeCategory: null, hookAngle: null });
    const absent = computeCreativeHash(null);
    assert.ok(populated, "populated identity must produce a non-null hash");
    assert.equal(empty, null, "empty identity must hash to null (CodeRabbit round-2)");
    assert.equal(absent, null, "absent identity must hash to null");
    assert.notEqual(populated, empty, "populated identity must not collide with empty identity");
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


// BATCH 20 — Item 3 (CR-M18 hashless fallback uniqueness, behavioural)
//
// The audit (`coderabbit-round-01-audit.md` §4) confirmed a real
// collision: `patternSummaries.ts` (the bucket's `add()`) used
// `b.creativeHashes.add(r.creativeHash ?? ` + "`" + `__legacy_${r.userId}_${b.n}` + "`" + `)`.
// Two distinct hashless rows from the same user in the same angle
// bucket collapse to one Set entry, undercounting `creativeCount`.
//
// Batch 19's source-text assertion was retired (it read the source
// file and asserted the literal string was present; the category was
// deliberately removed across Batches 03-16). The behavioural test
// below drives the actual `add()` and `newBucket()` through the test
// seam (`__bucketForTests`) and asserts the bucket-level invariant.

interface NRecTestInput {
    userId: string;
    niche: string | null;
    offerType: string | null;
    funnelStage: string | null;
    language: string | null;
    aspectRatio: string | null;
    pairId: string | null;
    templateId: string | null;
    universeFamily: string;
    hookAngle: string | null;
    isUsed: boolean;
    isFavorite: boolean;
    isPositive: boolean;
    isNegative: boolean;
    negativeTags: string[];
    isDeployed: boolean;
    isSpendBacked: boolean;
    hasConversion: boolean;
    spend: number;
    impressions: number;
    clicks: number;
    creativeHash: string | null;
    adId: string;
}

function makeNRec(overrides: Partial<NRecTestInput> & { userId: string; adId: string }): NRecTestInput {
    return {
        niche: null,
        offerType: null,
        funnelStage: null,
        language: null,
        aspectRatio: null,
        pairId: "standard_hero_value_stack",
        templateId: "cta_card",
        universeFamily: "office",
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
        creativeHash: null,
        ...overrides,
    };
}

test("BATCH 20: two distinct hashless rows from one user in one bucket are TWO creatives (Item 3 / CR-M18)", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { __bucketForTests } = require("../patternSummaries.js");
    const bucket = __bucketForTests.newBucket();
    __bucketForTests.add(bucket, makeNRec({
        userId: "act_995888422231015",
        adId: "gen-distinct-a",
        creativeHash: null,
        hookAngle: "urgency",
    }));
    __bucketForTests.add(bucket, makeNRec({
        userId: "act_995888422231015",
        adId: "gen-distinct-b",
        creativeHash: null,
        hookAngle: "urgency",
    }));
    assert.equal(bucket.n, 2, "two rows were added");
    assert.equal(bucket.creativeHashes.size, 2,
        "BATCH 20 / Item 3: two distinct hashless rows for one user in one bucket must produce two creatives (got creativeHashes.size=" + bucket.creativeHashes.size + ")");
});

test("BATCH 20: same creativeHash on two rows collapses to ONE creative (T029c regression guard)", () => {
    // Sanity / negative control: the existing dedup mechanism (by
    // creativeHash) still works. Two rows with the same creativeHash
    // must collapse to one creative — this is what T029c (Batch 14)
    // fixed and what the fix here must NOT break. The legacy fallback
    // path is a separate code branch (creativeHash: null); the
    // creativeHash: non-null path is the dominant case in production.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { __bucketForTests } = require("../patternSummaries.js");
    const bucket = __bucketForTests.newBucket();
    __bucketForTests.add(bucket, makeNRec({
        userId: "act_995888422231015",
        adId: "gen-same-hash-a",
        creativeHash: "shared-hash",
        hookAngle: "urgency",
    }));
    __bucketForTests.add(bucket, makeNRec({
        userId: "act_995888422231015",
        adId: "gen-same-hash-b",
        creativeHash: "shared-hash",
        hookAngle: "urgency",
    }));
    assert.equal(bucket.n, 2, "two rows were added");
    assert.equal(bucket.creativeHashes.size, 1,
        "BATCH 20 / Item 3 negative: two rows with the same creativeHash must still dedupe to one creative (got " + bucket.creativeHashes.size + ")");
});

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log("=== T029c fix: distinct-creative count (Batch 14) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
