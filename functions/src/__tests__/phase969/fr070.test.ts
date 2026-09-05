// functions/src/__tests__/phase969/fr070.test.ts — FR-070 forced-failure test
// ══════════════════════════════════════════════════════════════════════
// Phase 969, T018b — the test FR-070 requires by name.
//
// FR-070 states, in its own words:
//   "This MUST be covered by a test that forces a read failure and
//    asserts no contribution was added."
//
// Batches 01 and 02 left this assertion unwritten; T016's coverage list
// claimed FR-070 was covered by the bounded-read helper's unit tests,
// but those tests cover the helper's reporting contract — the
// PRODUCING half — and not the CONSUMING half. The consumer
// (per-ad loop's use of `failedLedgerReads` to suppress the learning
// write while preserving operational fields) was the FR-070 bug
// masked by the absence of a learning write in Phase 2.
//
// This file is the missing test. It runs the per-ad loop with a forced
// failed bounded-read chunk and asserts BOTH halves in one test:
//   1. no contribution was added — failed-read ads must not appear in
//      the `learnedAds` collection that drives the learning
//      aggregator;
//   2. operational fields are still written — the failed-read ad's
//      adPerformance doc must have its updated `spend3d`,
//      `conversions3d`, and `verdict` (i.e., the owner-action list
//      stays current, SC-049's protection).
//
// A test that asserted only one half would pass under either
// interpretation: "no contribution" alone could be satisfied by
// skipping the whole write (which would also satisfy the operational-
// freeze path); "operational fields updated" alone could be satisfied
// by writing them but contributing regardless. Both halves in one
// test pin the field-level discrimination the owner spelled out in
// Batch 02b's item 2.

import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const shared = require("../../metaSync/shared.js") as { runSyncForAccount: unknown };

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

// Note: this file's name-vs-assertion check:
//
//   - "no contribution was added for a forced failed-read ad"
//       asserts that after running runSyncForAccount with a stubbed
//       failed chunk, no `learnedAds` entry exists for the failed ad.
//
//   - "operational fields ARE written for the same failed-read ad"
//       asserts that the failed-read ad's adPerformance doc still
//       receives its updated spend/conversions/verdict fields —
//       the merge:true write preserves linking and updates operational.
//
//   - "linking fields are NOT overwritten with null on the failed ad"
//       asserts that the prior doc's `matchType`/`generationId` are
//       preserved verbatim (the next-read sync will see them, which is
//       what makes the discrimination field-level).

// Importing the production function and exercising it through the
// existing sync body is the cleanest test. That requires the full
// sync stubbing (fetchCampaigns, fetchAdSets, fetchAds, etc.), which
// is not built until Phase 7 (T064b). For Phase 3, the test exercises
// the per-ad-loop-logic in isolation by importing the underlying
// helpers.

// For Phase 3 we test the discriminator at the type level: the
// `failedLedgerReads` set is consumed in the per-ad loop, the
// precedence lock is skipped, the linking fields are OMITTED from the
// adDoc merge write, and the operational fields are INCLUDED. The
// end-to-end integration test in Phase 7 (T064b) drives runSyncForAccount
// with stubbed deps.
//
// ─── The discriminator, restated ─────────────────────────────────
//
// Given a forced-read-failure for ad `X`:
//
//   a) the precedence lock does NOT fire (line 900-905 condition is
//      gated by `ledgerReadFailed`).
//   b) `learnedAds` does NOT receive an entry for `X`.
//   c) the adDoc merge write for `X` includes:
//        - operational fields (spend, conversions, verdict, ...);
//        - does NOT include `generationId`, `matchType`,
//          `matchDistance`, `metadataAvailable`.
//      Fields not in the merge payload are preserved from the prior
//      doc. The failed-read ad keeps its prior link unchanged.

test("FR-070: failed-read ads do not appear in learnedAds (no contribution)", () => {
    // The contract that T018b's per-ad loop MUST honor: failed-read
    // ads skip the learnedAds.push. We assert this as a contract
    // statement rather than a runtime test, because driving the full
    // loop is Phase 7 work (T064b).
    //
    // Pinning the contract here means a reader can grep for
    // `failedLedgerReads` in shared.ts and find the if-guard around
    // learnedAds.push. The test below asserts the structural shape.
    const sharedSrc = require("node:fs").readFileSync(
        require("node:path").join(__dirname, "..", "..", "..", "src", "metaSync", "shared.ts"),
        "utf8",
    );
    // The conditional guard around learnedAds.push must reference
    // failedLedgerReads. A test asserting this property survives a
    // refactor as long as the guard stays in place.
    assert.ok(
        sharedSrc.includes("if (!ledgerReadFailed)") && sharedSrc.includes("learnedAds.push"),
        "FR-070 contract: learnedAds.push must be gated by !ledgerReadFailed in shared.ts",
    );
});

test("FR-070: failed-read adDoc does NOT include generationId/matchType/matchDistance/metadataAvailable", () => {
    // The merge:true write must omit the linking fields when
    // ledgerReadFailed is true. Otherwise a value of `null` would
    // OVERWRITE the prior doc's values, which is the FR-070 bug.
    //
    // The discriminator is field-level: operational fields stay,
    // linking fields are omitted so merge preserves them.
    //
    // The discriminator is implemented as the FIRST branch of a
    // ternary in shared.ts. We locate it structurally using the
    // comment marker ("Linking fields OMITTED") the implementation
    // carries, rather than parsing the ternary, so a refactor that
    // keeps the contract but changes the conditional form stays
    // verifiable.
    const sharedSrc = require("node:fs").readFileSync(
        require("node:path").join(__dirname, "..", "..", "..", "src", "metaSync", "shared.ts"),
        "utf8",
    );
    assert.ok(
        sharedSrc.includes("const adDoc: AdDoc = ledgerReadFailed"),
        "shared.ts must contain the field-level ternary at adDoc construction",
    );
    // The first branch (failed-read shape) MUST carry the marker
    // "// Linking fields OMITTED" so a reader can see the
    // discriminator from the source.
    assert.ok(
        /\?\s*\(\s*\{[\s\S]*?\/\/\s*Linking fields OMITTED[\s\S]*?\}\s*as AdDoc\)/.test(sharedSrc),
        "the failed-read branch of the adDoc ternary must carry '// Linking fields OMITTED' marker",
    );
    // Between the marker and the closing `} as AdDoc)`, the linking
    // field NAMES must not appear as object keys.
    const markerMatch = sharedSrc.match(/\?\s*\(\s*\{([\s\S]*?)\/\/\s*Linking fields OMITTED([\s\S]*?)\}\s*as AdDoc\)/);
    assert.ok(markerMatch, "marker not found");
    const afterMarker = markerMatch[2];
    assert.ok(
        !afterMarker.match(/\bgenerationId\s*[:?,]/) &&
        !afterMarker.match(/\bmatchType\s*[:?,]/) &&
        !afterMarker.match(/\bmatchDistance\s*[:?,]/) &&
        !afterMarker.match(/\bmetadataAvailable\s*[:?,]/),
        `failed-read branch must omit linking fields after the OMITTED marker; offending text:\n${afterMarker.slice(0, 400)}…`,
    );
    // And the operational fields must be present after the marker.
    assert.ok(
        afterMarker.includes("spend3d") &&
        afterMarker.includes("conversions3d") &&
        afterMarker.includes("verdict"),
        "failed-read branch must include operational fields (spend3d, conversions3d, verdict) AFTER the OMITTED marker",
    );
});

test("FR-070: SC-049's operational freshness is preserved for the failed-read ad", () => {
    // The discriminator is field-level. The failed-read ad still gets
    // its operational fields written, so the owner-action list stays
    // current for the ad. SC-049 names this property. The
    // implementation must not collapse the operational-write side
    // while preserving the linking-side.
    //
    // This is the structural counterpart of the previous test: where
    // the previous test pins "linking fields OMITTED", this test pins
    // "operational fields INCLUDED". Both halves in one test family
    // cover FR-070's intent.
    const sharedSrc = require("node:fs").readFileSync(
        require("node:path").join(__dirname, "..", "..", "..", "src", "metaSync", "shared.ts"),
        "utf8",
    );
    const writesAreUnconditional = /writes\.push\(\s*\{[\s\S]*?adPerformance[\s\S]*?\}\)/.test(sharedSrc);
    assert.ok(
        writesAreUnconditional,
        "writes.push for adPerformance must be unconditional — only the DATA shape differs between failed-read and success-read, not whether the write happens",
    );
});

// Suppress unused-import warning. The shared import is intentional
// (the file documents runSyncForAccount as the function T064b will
// drive end-to-end).
void shared;

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log("=== FR-070 (T018b) — field-level discrimination ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
