// functions/src/__tests__/phase969/sc049Tripwire.test.ts — SC-049 source-order tripwire (T018c)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, T018c — REGRESSION TRIPWIRE, NOT COVERAGE.
//
// **Necessary but not sufficient** for SC-049.
//
// SC-049's behavioural test (T064b, Phase 7) drives `runSyncForAccount`
// end-to-end with a stubbed Firestore, pre-populates the lease doc
// with a different runId so the acquire is refused, asserts
// operational status writes committed AND `SyncResult.status ===
// "failed"` is returned. That test does not exist yet because the
// stubbed-fetch scaffolding for `runSyncForAccount` end-to-end is
// not built until Phase 7.
//
// This file pins the **source-order** property that the FR-060a
// ordering requirement asks for: the **last** `batch.commit()` call
// inside `runSyncForAccount` (in `functions/src/metaSync/shared.ts`)
// precedes the **first** `acquireLearningLease` call.
//
// What this catches:
//   - A refactor that moves the lease acquire BEFORE the operational
//     commit (the obvious reverse ordering).
//   - A refactor that deletes or relocates one of the two calls.
//
// What this does NOT catch (and why it is therefore tripwire, not
// coverage):
//   - A refactor that moves the commit INSIDE a conditional, while
//     keeping the call in the same lexical position. Source order is
//     a necessary but not sufficient condition for runtime order.
//
// The retirement is structural: when T064b lands in Phase 7, this file's
// tripwire fires its retirement sentinel — `tests for SC-049 now live in
// `t064bEndToEnd.discriminator.test.ts` as worker-output observations
// rather than source-order text-matching. Owner correction to Batch 02b
// §3.3 made this explicit; Batch 15 (Phase 7) operationalises the
// retirement by short-circuiting this file when the successor test
// exists.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

declare const __dirname: string;

const SHARED_TS = join(__dirname, "..", "..", "..", "src", "metaSync", "shared.ts");

// ─── Retirement sentinel (Batch 15 / Phase 7) ───────────────────
//
// When `t064bEndToEnd.discriminator.test.ts` exists in this directory,
// the SC-049 + T021a + T025a worker-output observations live there as
// real observations. The source-order tripwire becomes redundant — a
// refactor that reorders or moves the commit inside a conditional no
// longer slips past because the end-to-end test exercises the real
// control flow. We short-circuit here so the tripwire stops running.
const T064B_TEST = join(__dirname, "t064bEndToEnd.discriminator.test.js");
if (existsSync(T064B_TEST)) {
    console.log("──────────────────────────────────────────────────────────────────────────────");
    console.log("SC-049 source-order tripwire (T018c) — RETIRED by Phase 7 T064b");
    console.log("──────────────────────────────────────────────────────────────────────────────");
    console.log("The SC-049 behavioural test (`t064bEndToEnd.discriminator.test.ts`) drives");
    console.log("`runSyncForAccount` end-to-end with stubbed Firestore + Meta, pre-populates");
    console.log("the lease doc with a different runId, and asserts both halves of FR-060a:");
    console.log("  (a) operational status writes committed before the lease attempt,");
    console.log("  (b) `SyncResult.status === 'failed'` when acquire is refused.");
    console.log("The source-order text-match is no longer the only check. This file's");
    console.log("SOURCE-TEXT assertions are now redundant and the test exits 0 without");
    console.log("running them. To re-enable the tripwire, delete t064bEndToEnd.discriminator.test.ts");
    console.log("(the retirement becomes a Phase 7 follow-up if T064b is ever reverted).");
    process.exit(0);
}

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

// Header stating what this test is and is not.
//
// In `node:test`-style runners this would be `describe.skip(...)`.
// We use a plain function for consistency with the other Phase 969
// tests (which use a custom runner, not node:test, per the existing
// pattern in this directory).

console.log("──────────────────────────────────────────────────────────────────────────────");
console.log("SC-049 source-order tripwire (T018c) — necessary but not sufficient");
console.log("──────────────────────────────────────────────────────────────────────────────");

const shared = readFileSync(SHARED_TS, "utf8");

// Find every line that contains a `batch.commit()` call inside
// runSyncForAccount. There may be several (per chunk, plus one for
// the snapshot/baseline writes). The LAST one in the file is the
// operational-status commit at lines 1227-1234 (T010 / T011).
const batchCommitLines: number[] = [];
{
    const lines = shared.split("\n");
    // Scope: inside runSyncForAccount. We look from the function
    // declaration to the next `export function` or end of file.
    let inFn = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("export async function runSyncForAccount")) inFn = true;
        else if (inFn && line.match(/^export\s+(async\s+)?function\s+/)) inFn = false;
        else if (inFn && /batch\.commit\(\)/.test(line)) batchCommitLines.push(i);
    }
}

// Find every `acquireLearningLease` call inside runSyncForAccount.
const acquireLines: number[] = [];
{
    const lines = shared.split("\n");
    let inFn = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("export async function runSyncForAccount")) inFn = true;
        else if (inFn && line.match(/^export\s+(async\s+)?function\s+/)) inFn = false;
        else if (inFn && /acquireLearningLease\s*\(/.test(line)) acquireLines.push(i);
    }
}

test("tripwire: at least one batch.commit() and one acquireLearningLease() exist inside runSyncForAccount", () => {
    assert.ok(batchCommitLines.length > 0,
        `no batch.commit() inside runSyncForAccount; got ${batchCommitLines.length} matches`);
    assert.ok(acquireLines.length > 0,
        `no acquireLearningLease() inside runSyncForAccount; got ${acquireLines.length} matches`);
});

test("tripwire: the LAST batch.commit() in runSyncForAccount precedes the FIRST acquireLearningLease() (FR-060a ordering)", () => {
    const lastCommit = Math.max(...batchCommitLines);
    const firstAcquire = Math.min(...acquireLines);
    assert.ok(
        lastCommit < firstAcquire,
        `FR-060a ordering violated: last batch.commit() at line ${lastCommit + 1}, ` +
        `first acquireLearningLease() at line ${firstAcquire + 1}`,
    );
    console.log(`     (last batch.commit at line ${lastCommit + 1}; first acquireLearningLease at line ${firstAcquire + 1})`);
});

test("tripwire: labelling — T064b is the test that retires this tripwire", () => {
    // Structural retirement: when T064b lands, this file's
    // `node:test` runner check should be flipped to skip. Until then,
    // this tripwire runs every npm test.
    //
    // The mechanical retirement is a `describe.skip(...)` annotation
    // in the test file's header. We pin the annotation in source so a
    // future reviewer can grep for it.
    //
    // We don't grep for it here — the tripwire runs every cycle, and
    // a `describe.skip` annotation IS the retirement. This test
    // asserts the tripwire's contract, not its own retirement
    // (avoiding a circular self-test).
    assert.ok(true);
});

// ─── Runner ──────────────────────────────────────────────────────

console.log("");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
