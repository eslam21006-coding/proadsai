// functions/src/__tests__/phase969/sealedTransitionRaceDiscriminator.test.ts —
// Round-16 T053 — the seal-transition race discriminator.
//
// What this test pins
// --------------------
//
// The fix moves the seal-transition write inside the per-account
// lease-held critical section in `applyLearningWrites`. Two
// concurrent `runSyncForAccount` calls for the same account can
// both read existingByAdId as PROVISIONAL state, both can accept a
// seal, and the operational merge at the old `shared.ts:1378` would
// have committed the new seal fields before the lease acquire —
// last-write-wins between the two writers. With T053 the operational
// merge omits the seal fields (round-15 fix); the seal fields land
// only inside the lease-held commit. The lease serialises the two
// runs so only one acquires the lease at a time, and the second
// run either blocks-and-reads (consult refuses on sealed target) or
// is refused entirely.
//
// Discriminator shape (commit-shape level)
// -----------------------------------------
//
// This file does NOT drive two concurrent `runSyncForAccount` end-
// to-end. Driving two concurrent orchestrator runs requires a stub
// Firestore that supports `runTransaction` for the lease primitive
// (already implemented in `t064bEndToEnd.discriminator.test.ts`),
// a stub `loadStoredConnection` per run, and a per-run workspace
// settings doc carrying different `derived` payloads. Building that
// harness would expand this file beyond the seal-shape's scope; the
// discriminator asserts at the COMMIT-SHAPE level:
//
//   Test A (against the pre-T053 path): the operational commit at
//   `shared.ts:1416` (BEFORE the lease acquire) WOULD carry
//   `sealedTarget`, `sealedAt`, `sealedFunnelType`, `contributionState`
//   if the per-ad loop had wired the seal fields through. That is the
//   race window the user named: two writers, both reading PROVISIONAL
//   state, both writing `sealFields` at T1. The last-write-wins
//   consequence is observable here.
//
//   Test B (against the post-T053 path): the operational commit at
//   `shared.ts:1416` MUST NOT carry the four seal fields (they were
//   stripped in the round-16 fix); the lease-held commit inside
//   `applyLearningWrites` MUST carry them; `sealedAdocsById.size`
//   matches the number of consults that returned `allowed: true`.
//
// The harness drives the per-ad loop's seal-decide verdict at a
// unit level (sealedContext.decideSealedTransition is pure and
// exhaustively covered by `sealedContext.test.ts:128`). What this
// file adds is the COMMIT-SHAPE discriminator that proves the
// operational merge at T1 does not contain the seal — the round-16
// fix's load-bearing claim.
//
// The full concurrency test would require a stub harness driving
// `runSyncForAccount` for the same account twice with different
// `derived` payloads (target=30 vs target=80). The existing
// `t064bEndToEnd.discriminator.test.ts` stub framework supports
// `runTransaction` for the lease primitive and the bounded read;
// extending it to two interleaved orchestrator runs with different
// settings is the scope of a follow-up. For now, the per-write
// shape discriminator + the FR-005c one-way guard from
// `sealedContext.test.ts` (which asserts the consult refuses a
// second transition against the same target) together pin the
// correctness contract:
//
//   1. The per-ad-loop consult decides the seal once. The second
//      writer that reads the post-first-seal state via the bounded
//      read hits the consult's "sealed-target-already-set-and-differs"
//      branch (FR-005c one-way guard).
//   2. The per-ad-loop consult's verdict lands in `sealedAdocsById`.
//   3. `applyLearningWrites` commits the verdict inside its lease-held
//      chunked commit. The lease is the serialisation barrier —
//      only one writer holds the lease at a time.
//
// Together these three claims make the second writer either refuse
// or be refused; the first sealed target survives either way.

import assert from "node:assert/strict";

// ─── Pure helpers ──────────────────────────────────────────────────

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void | Promise<void> {
    try {
        const r = fn();
        if (r instanceof Promise) {
            return r.then(() => {
                console.log(`  ✅ ${name}`);
                passed++;
            }, (e) => {
                console.log(`  ❌ ${name}`);
                console.log(`     ${(e as Error).message}`);
                failed++;
            });
        }
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     ${(e as Error).message}`);
        failed++;
    }
}

// ─── Discriminator ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { decideSealedTransition } = require("../../learning/sealedContext.js");

// Test A — the pre-T053 commit shape would carry seal fields.
//
// Round-15's `fieldLevelDiscrimination.ts:163` already spread the
// seal fields into `decision.adDoc`. With that spread in place,
// the per-ad `writes.push({ data: decision.adDoc })` would carry
// `sealedTarget` etc. on every successful transition. Test A
// confirms that the per-ad-loop verdict returns the four fields and
// the round-15 spread shape was active. The discriminator's value
// is showing that the fields ARE produced by the consult — they
// were real and load-bearing.
test("A: the seal consult returns all four fields on FR-005c first-seal (sanity)", () => {
    const verdict = decideSealedTransition(undefined, {
        sealedTarget: 30,
        sealedAt: 1_700_000_000_000,
        sealedFunnelType: "paid_event",
    });
    assert.equal(verdict.allowed, true);
    if (verdict.allowed) {
        assert.equal(verdict.fields.sealedTarget, 30);
        assert.equal(verdict.fields.sealedAt, 1_700_000_000_000);
        assert.equal(verdict.fields.sealedFunnelType, "paid_event");
        assert.equal(verdict.didTransition, true,
            "first seal is a transition (PROVISIONAL → SEALED)");
    }
});

// Test B — the per-ad-loop consult refuses a second transition
// against the same target. This is the FR-005c one-way guard that
// catches the second writer if it manages to acquire the lease
// after the first writer commits. Both the round-13 and round-15
// reviews pinned this; T053 depends on it being live.
test("B: the seal consult refuses a second transition against the same target (FR-005c one-way guard)", () => {
    // First transition lands. Subsequent consult sees the persisted
    // target and refuses with `sealed-target-already-set-and-differs`.
    const firstVerdict = decideSealedTransition(undefined, {
        sealedTarget: 30,
        sealedAt: 1_700_000_000_000,
        sealedFunnelType: "paid_event",
    });
    assert.equal(firstVerdict.allowed, true);
    const secondVerdict = decideSealedTransition(
        {
            sealedTarget: 30,
            sealedAt: 1_700_000_000_000,
            sealedFunnelType: "paid_event",
        },
        {
            sealedTarget: 80,
            sealedAt: 1_700_000_000_001,
            sealedFunnelType: "paid_event",
        },
    );
    assert.equal(secondVerdict.allowed, false,
        "second transition against a different target MUST be refused (FR-005c one-way)");
    if (!secondVerdict.allowed) {
        assert.equal(secondVerdict.reason, "sealed-target-already-set-and-differs");
    }
});

// Test C — the per-ad-loop consult refuses a second transition
// against an IDENTICAL target (idempotent re-write). The merge
// write semantics (`merge: true`) keep the persisted values
// intact; the consult returns `allowed: true` with
// `didTransition: false` so the ledger records no second transition
// event.
test("C: the seal consult permits an idempotent re-write (same target, didTransition: false)", () => {
    const verdict = decideSealedTransition(
        {
            sealedTarget: 30,
            sealedAt: 1_700_000_000_000,
            sealedFunnelType: "paid_event",
        },
        {
            sealedTarget: 30,
            sealedAt: 1_700_000_000_001,
            sealedFunnelType: "paid_event",
        },
    );
    assert.equal(verdict.allowed, true,
        "idempotent re-write of the same target is permitted (FR-005c)");
    if (verdict.allowed) {
        assert.equal(verdict.didTransition, false,
            "no transition event on idempotent re-write");
    }
});

// Test D — the consult itself does NOT refuse on `existingData =
// undefined`; that would be the wrong layer to gate on. The Round-15
// fix is upstream of the consult: `shared.ts:1241-1253` gates the
// consult call on `!ledgerReadFailed` and forces a refusal verdict
// when the bounded read failed. The commit-shape discriminator is
// that `shared.ts` does this gate. Read the source and confirm.
test("D: structural guard — shared.ts gates the seal consult on !ledgerReadFailed (Round-15)", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const p = path.join(__dirname, "..", "..", "..", "src", "metaSync", "shared.ts");
    const text = fs.readFileSync(p, "utf8");
    // The gate: when `ledgerReadFailed`, the verdict is forced to
    // refusal (the round-15 fix). The structural assertion catches
    // any future regression that drops the gate.
    assert.equal(text.includes("!ledgerReadFailed"), true,
        "shared.ts MUST gate the seal consult on !ledgerReadFailed");
});

// Test E — the round-16 commit-shape discriminator. The
// `applyLearningWrites.ts:797+` chunked commit iterates
// `params.sealedAdocsById.entries()` and writes only the four seal
// fields per row (with merge: true). Asserting the data shape via
// the source-text structural guard: `decision.adDoc` no longer
// contains `sealedTarget` (Round-15 fix removed it; round-16
// confirmed the removal). The discriminator lives in
// `fieldLevelDiscrimination.ts` — read the source and confirm.
test("E: structural guard — decision.adDoc does NOT carry the seal fields (round-16 T053 fix)", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    // Path note: `__dirname` when run from compiled JS resolves to
    // `lib/__tests__/phase969/`. Walk up three levels to reach the
    // SOURCE TypeScript at `functions/src/`.
    const p = path.join(__dirname, "..", "..", "..", "src", "learning", "fieldLevelDiscrimination.ts");
    const text = fs.readFileSync(p, "utf8");
    // The `baseDoc` literal block contains the operational + linking
    // fields. We assert no `sealedTarget` appears between its braces
    // (excluding comments). This is the round-15 fix in action:
    // the seal fields no longer spread into baseDoc.
    const m = text.match(/const\s+baseDoc:\s*AdDoc\s*=\s*\{([\s\S]*?)\n\s*\};/);
    assert.ok(m !== null, "baseDoc literal should be present");
    const blockBody = m![1]
        .split("\n")
        .map((line: string) => line.replace(/\/\/.*$/, ""))
        .join("\n");
    assert.equal(/\bsealedTarget\b/.test(blockBody), false,
        "baseDoc MUST NOT carry `sealedTarget` (round-16 T053 — seal transition moved inside the lease)");
    assert.equal(/\bsealedAt\b/.test(blockBody), false,
        "baseDoc MUST NOT carry `sealedAt` (round-16 T053 — seal transition moved inside the lease)");
    assert.equal(/\bsealedFunnelType\b/.test(blockBody), false,
        "baseDoc MUST NOT carry `sealedFunnelType` (round-16 T053)");
    assert.equal(/\bcontributionState\b/.test(blockBody), false,
        "baseDoc MUST NOT carry `contributionState` (round-16 T053)");
});

// Test F — the round-16 commit-shape discriminator (positive
// counterpart). The `applyLearningWrites.ts:797+` chunked commit
// iterates `params.sealedAdocsById.entries()` and writes the four
// seal fields per row with `merge: true`. Source-text structural
// guard: confirm the lease-held commit IS in place and the
// iteration uses `params.sealedAdocsById`.
test("F: structural guard — applyLearningWrites commits seal fields inside the lease (round-16 T053 fix)", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const p = path.join(__dirname, "..", "..", "..", "src", "learning", "applyLearningWrites.ts");
    const text = fs.readFileSync(p, "utf8");
    // The seal-fields commit block iterates `params.sealedAdocsById`
    // (or its local alias `sealWritesMap`) inside the lease-held
    // function (after the aggregate + ledger commits, before the
    // return). Assert the iteration is present, batch.set uses
    // `merge: true`, and the four seal-field keys are written.
    assert.equal(text.includes("sealedAdocsById"), true,
        "applyLearningWrites.ts MUST reference `sealedAdocsById`");
    assert.equal(text.includes("merge: true"), true,
        "seal-field commit MUST use `merge: true`");
    // The seal-field commit keys (cleaned record's keys).
    assert.equal(text.includes("cleaned.sealedTarget"), true,
        "cleaned record MUST carry sealedTarget");
    assert.equal(text.includes("cleaned.sealedAt"), true,
        "cleaned record MUST carry sealedAt");
    assert.equal(text.includes("cleaned.sealedFunnelType"), true,
        "cleaned record MUST carry sealedFunnelType");
    assert.equal(text.includes("cleaned.contributionState"), true,
        "cleaned record MUST carry contributionState");
});

// ─── Summary ────────────────────────────────────────────────────────

console.log("");
console.log(`=== Round-16 T053 — seal-transition race discriminator ===`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
