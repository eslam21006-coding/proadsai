// functions/src/__tests__/phase969/fr070Wiring.test.ts — wiring assertion for T018b's decideAdWrite
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, Batch 05 finding 3.
//
// `fr070.test.ts` (Batch 04) covers `decideAdWrite` in isolation: it
// drives the pure function with synthetic inputs and asserts on
// returned values. That covers the helper's correctness.
//
// It does NOT cover the call site. Shared.ts could call decideAdWrite
// with the wrong `ledgerReadFailed` value (e.g. always passing
// `failedLedgerReads.has(ad.id) === false`) and the FR-070 tests
// would still pass — they would simply never exercise the failed-read
// branch via the wiring.
//
// This file is a structural check. It reads shared.ts and asserts:
//
//   1. `decideAdWrite` is imported.
//   2. `failedLedgerReads` is populated from `boundedResult.failedIds`.
//   3. `ledgerReadFailed = failedLedgerReads.has(ad.id)` is computed.
//   4. `decideAdWrite({ ..., ledgerReadFailed, ... })` is called with
//      that computed value as a property of the input object.
//
// It does NOT assert runtime behaviour — that requires driving
// runSyncForAccount end-to-end with stubbed deps, which is Phase 7
// work (T064b). This file pins the call-site shape so a refactor that
// drops or renames the wire-up trips the test before runtime.
//
// SC-049's behavioural test (lease-loss) covers the lease side at
// runtime in Phase 7. This file covers the FR-070 wiring at source.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

declare const __dirname: string;
const SHARED_TS = join(__dirname, "..", "..", "..", "src", "metaSync", "shared.ts");

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

const shared = readFileSync(SHARED_TS, "utf8");

test("wiring: shared.ts imports decideAdWrite", () => {
    assert.ok(
        /import\s*\{[^}]*\bdecideAdWrite\b[^}]*\}\s*from\s*["'][^"']*fieldLevelDiscrimination(?:\.js)?["']/.test(shared),
        "shared.ts must import decideAdWrite from fieldLevelDiscrimination",
    );
});

test("wiring: failedLedgerReads is populated from boundedResult.failedIds", () => {
    // The bounded read returns failedIds; we copy them into the
    // Set the per-ad loop reads from. A regression that skipped this
    // copy would mean ledgerReadFailed is always false.
    assert.ok(
        /for\s*\(\s*const\s+id\s+of\s+boundedResult\.failedIds\s*\)\s*failedLedgerReads\.add\(id\)/.test(shared),
        "shared.ts must populate failedLedgerReads from boundedResult.failedIds",
    );
});

test("wiring: ledgerReadFailed = failedLedgerReads.has(ad.id)", () => {
    // The single-line computation that drives the discriminator.
    // Anything more elaborate (e.g. .filter, .map, .some) is suspicious.
    assert.ok(
        /const\s+ledgerReadFailed\s*=\s*failedLedgerReads\.has\(\s*ad\.id\s*\)/.test(shared),
        "shared.ts must compute ledgerReadFailed via failedLedgerReads.has(ad.id)",
    );
});

test("wiring: decideAdWrite is called with ledgerReadFailed in the input", () => {
    // The call-site must pass the computed value into the helper. A
    // refactor that hard-codes `ledgerReadFailed: false` would break
    // every FR-070 contract at runtime even though fr070.test.ts still
    // passes.
    const callMatch = shared.match(/decideAdWrite\(\s*\{([\s\S]*?)\}\s*\)/);
    assert.ok(callMatch, "decideAdWrite call-site not found in shared.ts");
    const inside = callMatch[1];
    assert.ok(
        /\bledgerReadFailed\b/.test(inside),
        "decideAdWrite call-site must pass ledgerReadFailed",
    );
    assert.ok(
        /,\s*ledgerReadFailed\s*[,}]/.test(inside) || /ledgerReadFailed\s*:/.test(inside),
        "decideAdWrite call-site must pass ledgerReadFailed as a named field",
    );
});

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log("=== FR-070 wiring (T018b) — structural check on shared.ts call-site ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
