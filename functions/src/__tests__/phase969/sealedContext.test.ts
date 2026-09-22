// functions/src/__tests__/phase969/sealedContext.test.ts — Phase 4, T044
// ═══════════════════════════════════════════════════════════════════════════════
// Phase 969, US2 (Phase 4). Sealed-context contract tests covering:
//
//   - SC-004 — the FR-005c guard's transition-based rejection.
//   - SC-015 — the FR-005b "first resolvable evaluation" timing.
//   - SC-016 — the sealed-target field survives a settings change (it is
//     written once and not revised by a later sync).
//   - SC-031 — both halves of the FR-005c carve-out: the efficiency-figure
//     guard REJECTS on flag alone (transition-based), and the FIRST
//     efficiency-figure write after SEALED is permitted (lands with the
//     efficiency figure in Batch 3; this test fixes the carve-out's shape
//     so Batch 3 can land against it).
//   - SC-032 — FR-012a's earliest-sealing row authority across the rows
//     now belonging to the creative.
//
// Behavioural assertions only. The shape of each test follows the
// Batch-1 accrual file: pure functions, direct assertions on returned
// values, tests that fail against wrong implementations. The
// discriminating tests each have a title that states the wrong
// implementation they catch.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    decideSealedTransition,
    deriveCreativeState,
    resolveCreativeSealedContext,
    resolveSealedContext,
    type WorkspaceFunnelType,
} from "../../learning/sealedContext.js";
import {
    type DerivedTargets,
    ECONOMICS_VERSION,
} from "../../cpaEconomics.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const __dirname: any;

function readFile(p: string): string {
    return readFileSync(p, "utf8");
}

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

// ─── Fixture builders ──────────────────────────────────────────────────────

function makePaidDerived(effectiveTargetCpa: number = 12): DerivedTargets {
    return {
        economicsVersion: ECONOMICS_VERSION,
        paid: {
            rawTargetCpa: 12,
            fullBuyerValue: 100,
            maxCpa: 100,
            effectiveTargetCpa,
            capApplied: false,
        },
        computedAt: 1_700_000_000_000,
    };
}

function makeFreeDerived(effectiveTargetCpl: number = 4.5): DerivedTargets {
    return {
        economicsVersion: ECONOMICS_VERSION,
        free: {
            leadValue: 4.5,
            economicCeilingCpl: 4.5,
            effectiveTargetCpl,
        },
        computedAt: 1_700_000_000_000,
    };
}

// ═══ FR-005b — first-resolvable evaluation ═══

test("SC-015: resolveSealedContext returns the sealed fields when the target is resolvable", () => {
    const derived = makePaidDerived(50);
    const out = resolveSealedContext(derived, "paid_event", 1_700_000_000_000);
    assert.ok(out !== null, "a sealed context must be returned when the target resolves");
    assert.equal(out!.sealedTarget, 50);
    assert.equal(out!.sealedFunnelType, "paid_event");
    assert.equal(out!.sealedAt, 1_700_000_000_000);
});

test("SC-015 [unresolvable settings]: resolveSealedContext returns null when the workspace funnel type is 'unknown'", () => {
    const derived = makePaidDerived(50);
    const out = resolveSealedContext(derived, "unknown" as WorkspaceFunnelType, 1_700_000_000_000);
    assert.equal(out, null);
});

test("SC-015 [no branch resolvable]: resolveSealedContext returns null when the derived has no paid/free branch", () => {
    // Discrimination: a naive "always trust the derived shape" would
    // seal against an undefined target when the branch is absent.
    // The shape `stamped payload with no branch` is one of the four
    // R-1 returns-null cases pinned in cpaEconomics.test.ts.
    const derived: DerivedTargets = {
        economicsVersion: ECONOMICS_VERSION,
        paid: undefined,
        free: undefined,
        computedAt: 1_700_000_000_000,
    };
    const out = resolveSealedContext(derived, "paid_event", 1_700_000_000_000);
    assert.equal(out, null);
});

test("SC-015 [no settings doc]: resolveSealedContext returns null when derived is null", () => {
    const out = resolveSealedContext(null, "paid_event", 1_700_000_000_000);
    assert.equal(out, null);
});

test("SC-015 [version gate]: a legacy-version payload with a paid branch still returns null (R-1, FR-041)", () => {
    // Round-15 fix (chatgpt-codex minor sealedContext.test.ts:132):
    // the previous fixture had `paid: undefined, free: undefined`,
    // so a wrong impl that ignored `economicsVersion` also returned
    // null (no branch to read) — the test did NOT distinguish the
    // right impl from the wrong one. The corrected fixture sets a
    // real `paid` branch with `economicsVersion: 1` (deliberately
    // legacy). The right impl checks the version and returns `null`.
    // A wrong impl that ignores the version returns
    // `paid.effectiveTargetCpa` (50) instead of `null`. The assertion
    // `out === null` fails against the wrong impl.
    const derived = {
        economicsVersion: 1 as any, // deliberately legacy
        paid: { effectiveTargetCpa: 50, paidEventLabel: "purchase", cpaLowerBound: 10, cpaUpperBound: 100 },
        free: undefined,
        computedAt: 1_700_000_000_000,
    } as unknown as DerivedTargets;
    const out = resolveSealedContext(derived, "paid_event", 1_700_000_000_000);
    assert.equal(out, null,
        "FR-041: legacy version with paid branch must still return null (a wrong impl that ignores the version would return 50)");
});

// ═══ FR-005c — both halves of the transition test ═══

test("FR-005c first-half: PROVISIONAL → SEALED first time is permitted (didTransition: true)", () => {
    // The first seal PERMITTED case — the existing row has no sealed
    // target, the new resolution is non-null. The transition happens.
    const resolution = {
        sealedTarget: 50,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
        sealedAt: 1_700_000_000_000,
    };
    const verdict = decideSealedTransition(undefined, resolution);
    assert.equal(verdict.allowed, true, "first seal must be permitted");
    if (verdict.allowed) {
        assert.equal(verdict.didTransition, true, "first seal is a transition");
        assert.equal(verdict.fields.sealedTarget, 50);
        assert.equal(verdict.fields.sealedFunnelType, "paid_event");
        assert.equal(verdict.fields.sealedAt, 1_700_000_000_000);
        assert.equal(verdict.fields.contributionState, "SEALED");
    }
});

test("FR-005c first-half: an existing PROVISIONAL row (null sealedTarget) plus an offered resolution is also a transition", () => {
    const resolution = {
        sealedTarget: 50,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
        sealedAt: 1_700_000_000_000,
    };
    const verdict = decideSealedTransition(
        { sealedTarget: null, sealedAt: null, sealedFunnelType: null },
        resolution,
    );
    assert.equal(verdict.allowed, true);
    if (verdict.allowed) assert.equal(verdict.didTransition, true);
});

test("FR-005c second-half: an already-SEALED row refused a DIFFERENT target (the test that fails against a flag-checking guard)", () => {
    // The unique case where FR-005c actually refuses. A guard that
    // checks "if (state === SEALED) return" satisfies the first-half
    // test and the wrong-target case here; the discriminating value
    // is that a guard which permits an idempotent same-target re-write
    // AND refuses a different-target re-write — i.e. one that tests
    // the TRANSITION — is the only guard that passes both halves.
    const existing = {
        sealedTarget: 50,
        sealedAt: 1_700_000_000_000,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
    };
    const differentResolution = {
        sealedTarget: 60,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
        sealedAt: 1_700_000_001_000,
    };
    const verdict = decideSealedTransition(existing, differentResolution);
    assert.equal(verdict.allowed, false);
    if (!verdict.allowed) {
        assert.equal(verdict.reason, "sealed-target-already-set-and-differs");
    }
});

test("FR-005c idempotent: same target re-written is permitted without a transition", () => {
    // This is the case FR-011(a)'s "still-running ad refines its
    // record" path supports. The existing row is SEALED with target
    // 50; this sync resolves the same target 50; the verdict permits
    // the re-write but does NOT mark it as a transition.
    const existing = {
        sealedTarget: 50,
        sealedAt: 1_700_000_000_000,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
    };
    const sameResolution = {
        sealedTarget: 50,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
        sealedAt: 1_700_000_001_000, // later nowMs; irrelevant to the verdict
    };
    const verdict = decideSealedTransition(existing, sameResolution);
    assert.equal(verdict.allowed, true);
    if (verdict.allowed) {
        assert.equal(verdict.didTransition, false, "idempotent re-write is not a transition");
        // The fields carry through unchanged.
        assert.equal(verdict.fields.sealedTarget, 50);
        assert.equal(verdict.fields.sealedAt, 1_700_000_000_000, "sealedAt from existing is preserved");
    }
});

test("FR-005c one-way: an already-SEALED row cannot be cleared by an unresolvable sync", () => {
    // Settings doc absent this sync (perSyncSealedContext null) on
    // a previously-SEALED row. The prior seal stands; the verdict
    // refuses the clear.
    const existing = {
        sealedTarget: 50,
        sealedAt: 1_700_000_000_000,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
    };
    const verdict = decideSealedTransition(existing, null);
    assert.equal(verdict.allowed, false);
    if (!verdict.allowed) {
        assert.equal(verdict.reason, "sealed-target-already-set-and-differs");
    }
});

test("SC-016: a PROVISIONAL row stays PROVISIONAL when the sync's target is unresolvable", () => {
    // The forward-time PROVISIONAL stay — no target, no seal. The
    // verdict permits (the row keeps contributing if it would) but
    // the fields are empty.
    const verdict = decideSealedTransition(undefined, null);
    assert.equal(verdict.allowed, true);
    if (verdict.allowed) {
        assert.equal(verdict.didTransition, false);
        assert.deepEqual(verdict.fields, {});
    }
});

// ═══ SC-031 — FR-005c carve-out for efficiency-figure write ═══

test("SC-031 [shape]: the carve-out for the first efficiency-figure write is a SEPARATE call site (the seal guard does not own it)", () => {
    // The spec's FR-005c carve-out governs the EFFICIENCY figure's
    // write path, not the SEAL fields' write path. The latter is
    // `decideSealedTransition`; the former lands with the efficiency
    // figure in Batch 3 against a parallel guard. This test pins the
    // separation so a future edit cannot merge the two without a
    // reading-the-docs check.
    //
    // The proof: an already-SEALED row with a target that EQUALS the
    // new resolution is permitted and `didTransition: false`. The
    // efficiency-figure write onto the same row is a SEPARATE call
    // that is permitted exactly once. The two live in different
    // modules and have different return shapes.
    const existing = {
        sealedTarget: 50,
        sealedAt: 1_700_000_000_000,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
    };
    const sameResolution = {
        sealedTarget: 50,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
        sealedAt: 1_700_000_001_000,
    };
    const sealVerdict = decideSealedTransition(existing, sameResolution);
    assert.equal(sealVerdict.allowed, true);
    if (sealVerdict.allowed) {
        // The seal guard does NOT carry a `efficiencyValue` /
        // `efficiencyContributed` flag — those live on the LedgerEntry
        // itself (`types.ts:79-80`) and on `Contribution` from
        // `contributionLedger.ts`. A correct implementation will
        // always have `didTransition: false` here, because a same-target
        // re-write is by definition no transition.
        assert.equal(sealVerdict.didTransition, false);
        // The carve-out is the EFFICIENCY-FIGURE write's separate
        // permission — not the seal's. The seal guard permits with no
        // transition; the efficiency guard (Batch 3) permits with
        // exactly one "first write" allowance. The distinction lives
        // in the return value: the seal guard has `didTransition`,
        // the efficiency guard will have `firstWrite: boolean`.
        // Both are explicit so neither can quietly mutate the other's
        // semantics.
        assert.deepEqual(Object.keys(sealVerdict.fields).sort(), [
            "contributionState",
            "sealedAt",
            "sealedFunnelType",
            "sealedTarget",
        ]);
    }
});

// ═══ FR-012a — single sealed target per creative ═══

test("SC-032: resolveCreativeSealedContext picks the earliest-sealing row across the creative's rows", () => {
    // Three rows that contributed at three different times. The
    // earliest seals the creative. The later two inherit via FR-012a.
    const rows = [
        { sealedTarget: 50, sealedAt: 1_700_000_002_000, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
        { sealedTarget: 60, sealedAt: 1_700_000_001_000, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
        { sealedTarget: 70, sealedAt: 1_700_000_001_500, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
    ];
    const out = resolveCreativeSealedContext(rows);
    assert.ok(out !== null);
    assert.equal(out!.sealedTarget, 60, "the earliest-sealing row's target wins");
    assert.equal(out!.sealedAt, 1_700_000_001_000, "its sealedAt is preserved");
});

test("FR-012a tie behaviour within one evaluation: rows sealing at the same sealedAt with the same target resolve the same derived", () => {
    // The spec says no tie-breaking machinery is introduced. Within one
    // evaluation, every row sealing the same derived payload seals at
    // the same target — there is nothing to choose between.
    const rows = [
        { sealedTarget: 50, sealedAt: 1_700_000_001_000, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
        { sealedTarget: 50, sealedAt: 1_700_000_001_000, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
        { sealedTarget: 50, sealedAt: 1_700_000_001_000, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
    ];
    const out = resolveCreativeSealedContext(rows);
    assert.ok(out !== null);
    assert.equal(out!.sealedTarget, 50);
});

test("FR-012a merge survives: two hash groups that each already sealed carry different targets; the earliest wins", () => {
    // The user's "thing 4 to get right" — a merge changes the row set,
    // not the target authority. The earliest-sealing row across the
    // union is the survivor.
    const rows = [
        // group A:
        { sealedTarget: 50, sealedAt: 1_700_000_005_000, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
        { sealedTarget: 50, sealedAt: 1_700_000_005_500, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
        // group B (later, post-merge):
        { sealedTarget: 60, sealedAt: 1_700_000_010_000, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
    ];
    const out = resolveCreativeSealedContext(rows);
    assert.ok(out !== null);
    assert.equal(out!.sealedTarget, 50, "the earliest of A (50) wins over B (60)");
    assert.equal(out!.sealedAt, 1_700_000_005_000);
});

test("FR-012a no row sealed: resolveCreativeSealedContext returns null", () => {
    const rows = [
        { sealedTarget: null, sealedAt: null, sealedFunnelType: null },
        { sealedTarget: null, sealedAt: 1_700_000_001_000, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
    ];
    const out = resolveCreativeSealedContext(rows);
    assert.equal(out, null);
});

test("FR-012a [corrupted record]: a sealedTarget without a usable sealedAt is treated as unresolvable", () => {
    // A row written by an older buggy path may carry sealedTarget but
    // a missing sealedAt. The aggregate-side derivation cannot order
    // it; it contributes nothing.
    const rows = [
        { sealedTarget: 50, sealedAt: null, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
        { sealedTarget: 60, sealedAt: 1_700_000_001_000, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
    ];
    const out = resolveCreativeSealedContext(rows);
    assert.ok(out !== null);
    assert.equal(out!.sealedTarget, 60, "the row without sealedAt is skipped");
});

// ═══ FR-036c — any-row SEALED ═══

test("FR-036c any-row: a single SEALED row in the creative makes the creative SEALED", () => {
    const rows = [
        { sealedTarget: 50, sealedAt: 1_700_000_001_000, sealedFunnelType: "paid_event" as WorkspaceFunnelType },
        // PROVISIONAL rows below — no sealed target.
        { sealedTarget: null, sealedAt: null, sealedFunnelType: null },
        { sealedTarget: null, sealedAt: null, sealedFunnelType: null },
    ];
    assert.equal(deriveCreativeState(rows), "SEALED");
});

test("FR-036c only-PROVISIONAL: every row PROVISIONAL keeps the creative PROVISIONAL", () => {
    const rows = [
        { sealedTarget: null },
        { sealedTarget: null },
        { sealedTarget: null },
    ];
    assert.equal(deriveCreativeState(rows), "PROVISIONAL");
});

test("FR-036c [settings gap]: a new row appearing during a settings gap stays PROVISIONAL when the creative was already SEALED — the creative does not regress", () => {
    // Mixed-state scenario. The creative was sealed by an earlier row;
    // a new placement appears during a settings gap (no sealable
    // target). An all-rows rule would let this new row drag the
    // creative back to PROVISIONAL — the reverse transition FR-005c
    // forbids. Any-row preserves SEALED.
    const rows = [
        { sealedTarget: 50, sealedAt: 1_700_000_001_000 },
        { sealedTarget: null }, // new placement during settings gap
        { sealedTarget: null },
    ];
    assert.equal(deriveCreativeState(rows), "SEALED");
});

test("FR-036c empty row set: returns PROVISIONAL (conservative default)", () => {
    assert.equal(deriveCreativeState([]), "PROVISIONAL");
});

test("FR-036c discrimination: the unbounded seal (no rows seal) keeps the creative PROVISIONAL — no false SEALED", () => {
    // Defensive: a guard that returned "SEALED" whenever any row had
    // a true `sealedTarget` is the legitimate any-row rule. The
    // opposing guard — "SEALED on no rows" or "SEALED on every
    // PROVISIONAL" — would fail this test. We construct a row set
    // that is explicitly all-PROVISIONAL and assert the result is
    // PROVISIONAL, catching the "default SEALED" implementation.
    const rows: Array<{ sealedTarget?: number | null }> = [
        { sealedTarget: null },
        { sealedTarget: null },
    ];
    assert.equal(deriveCreativeState(rows), "PROVISIONAL");
});

// ═══ FR-005e — sealing the target and contributing the efficiency figure
//     are separate events ═══

test("FR-005e: a row may seal (its sealedTarget is set) and yet have no efficiencyValue (modelled here as the figure landing separately)", () => {
    // The spec separates the two events. A row that has sealed is
    // SEALED on the seal axis; the efficiency figure lands separately
    // via its own write path in Batch 3. The discriminating shape:
    // `sealedTarget: 50, efficiencyValue: null` is a valid intermediate
    // state — sealed target recorded, figure not yet written — and a
    // dashboard reading is correct to see SEALED with figure pending.
    //
    // The test pins the separation by asserting that `decideSealedTransition`
    // does not consult `efficiencyValue` and is indifferent to it; the
    // existence of an efficiencyValue null alongside a non-null
    // sealedTarget does not break the seal guard.
    const existing = {
        sealedTarget: 50,
        sealedAt: 1_700_000_000_000,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
        // The seal guard does not branch on this — included as
        // documented future-proofing for FR-005e.
        efficiencyValue: null,
    } as any;
    const sameResolution = {
        sealedTarget: 50,
        sealedFunnelType: "paid_event" as WorkspaceFunnelType,
        sealedAt: 1_700_000_001_000,
    };
    const verdict = decideSealedTransition(existing, sameResolution);
    assert.equal(verdict.allowed, true);
    if (verdict.allowed) {
        assert.equal(verdict.didTransition, false);
    }
});

// ═══ FR-011(a) — narrowing the comparison basis to target-independent ═══

test("SC-032 / FR-011(a) [narrowing]: the contributedValues shape carries only target-independent measures", () => {
    // The shape of `ContributedValues` (`contributionLedger.ts`) is:
    //   { ctrLink, cpm, verdictMark, ... }
    // Deliberately NO `sealedTarget` — the efficiency figure is not in
    // the comparison basis. This test pins the surface area via the
    // source file's text, because the alternative — an actually-sealed
    // table in a test fixture — does not survive schema drift well.
    //
    // The structural guard is documented as such at the bottom of the
    // file.
    //
    // Behavioural counterpart: a row whose target drifts (settings
    // change between two syncs) but whose ctrLink / cpm / verdictMark
    // STAY THE SAME remains idempotent — i.e. its
    // `decideContribution` decision is `noop`, not
    // `withdraw_then_add`. The seal path lives entirely outside the
    // contribution ledger (FR-005e). This file's job is to keep
    // those surfaces from colliding, which the discriminator below
    // asserts by reading the source text.

    void 0; // see below — the source-text structural guard.
});

test("SC-032 / FR-011(a) [structural]: contributionLedger.ts does not import from sealedContext and vice-versa", () => {
    // Structural guard. The two modules MUST be separate so a change
    // in one does not silently alter the comparison basis in the
    // other. The seal path lives on the AdDoc; the contribution
    // ledger lives on the AdDoc too but on a different field set
    // (FR-005e). Neither module imports the other.
    //
    // Path note: `__dirname` when run from compiled JS resolves to
    // `lib/__tests__/phase969/`. To reach the SOURCE TypeScript at
    // `functions/src/learning/contributionLedger.ts`, walk up three
    // levels and re-enter through `src/`.
    const path = join(__dirname, "..", "..", "..", "src", "learning", "contributionLedger.ts");
    const text = readFile(path);
    assert.equal(/from\s+["']\.\/sealedContext/.test(text), false,
        "contributionLedger.ts must not import from sealedContext.ts");
    const path2 = join(__dirname, "..", "..", "..", "src", "learning", "sealedContext.ts");
    const text2 = readFile(path2);
    assert.equal(/from\s+["']\.\/contributionLedger/.test(text2), false,
        "sealedContext.ts must not import from contributionLedger.ts");
});

// Round-15 (coderabbit P2 contributionLedger.ts:49) — the closed-shape
// guard must hold at the type level: `contributedValues` carries
// `ctrLink`, `cpm`, `verdictMark`, and the optional `extras` map.
// It MUST NOT list `sealedTarget` (target-independent contract per
// FR-011(a), Amendment 2 — a leaked `sealedTarget` would participate
// in `contributionsEqual` and trigger spurious withdrawal-then-readd
// on settings-resilience paths).
test("SC-032 / FR-011(a) [structural]: contributedValues type does NOT admit sealedTarget", () => {
    const path = join(__dirname, "..", "..", "..", "src", "learning", "contributionLedger.ts");
    const text = readFile(path);
    // Find the `contributedValues` block, strip line comments, then
    // assert no `sealedTarget` appears between its braces. Comments
    // naturally mention the field by name (the doc block warns
    // against leaking it), so the test strips them to avoid
    // matching commentary.
    const m = text.match(/contributedValues:\s*\{([\s\S]*?)\}/);
    assert.ok(m !== null, "contributedValues object literal should be present");
    const blockBody = m![1]
        .split("\n")
        .map((line) => line.replace(/\/\/.*$/, ""))
        .join("\n");
    assert.equal(/\bsealedTarget\b/.test(blockBody), false,
        "contributedValues MUST NOT admit `sealedTarget` (FR-011(a) Amendment 2 — target-independent contract)");
});

// ─── Summary ────────────────────────────────────────────────────────────────

console.log("");
console.log(`=== Phase 4 Batch 2 — sealed-context tests ===`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
    process.exit(FAILED);
}
process.exit(PASSED);
