// functions/src/__tests__/phase969/efficiencyFigure.test.ts — Phase 4, T046
// ═══════════════════════════════════════════════════════════════════════════════
// Phase 969, US2 (Phase 4). Efficiency-figure contract tests covering:
//
//   - SC-030 — aggregate-then-divide, not divide-then-average.
//   - SC-031 — both halves of the FR-005c carve-out for the
//     efficiency-figure write.
//   - SC-033 — FR-077's threshold of 5 conversions across all
//     placements (the 5 may arrive on a different row).
//   - SC-034 — FR-077(b)'s stopped-with-≥1 condition; under-detect.
//   - SC-035 — FR-079 write-once in BOTH directions (one test for
//     each half; the discriminating pair catches a guard that always
//     allows or always refuses).
//   - SC-036 — FR-087's two-case dispatcher: same row set → carry
//     across; changed row set → recompute.
//   - SC-048 — the FR-074b merge shape: FR-013a's recompute over
//     the union against the earliest sealed target.
//
// Plus the §14.2 correction test: the figure uses the accrued
// spend (Batch 1's per-day entry), NOT `metrics.spend7d` (the
// rolling 7-day sum). Two runs against the wrong impl produce
// figures an order of magnitude apart.
//
// Behavioural assertions only. Pure functions, direct assertions on
// returned values, tests that fail against wrong implementations.
// Each discriminating test's title names the wrong implementation it
// catches.

import assert from "node:assert/strict";

import {
    applyEfficiencyRecompute,
    applyMergeRecompute,
    computeEfficiencyFigure,
    decideEfficiencyWrite,
    isEligibleForEfficiency,
    type EfficiencyRow,
} from "../../learning/efficiencyFigure.js";
import type { DayAccrual } from "../../learning/types.js";

// ─── Fixture builders ─────────────────────────────────────────────────────

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

function rowWith(
    days: { [iso: string]: { conversions: number; spend: number } },
    sealedTarget: number | null = null,
    adStatus: string | null = "ACTIVE",
): EfficiencyRow {
    return {
        dayAccrual: {
            days,
            finalisedConversions: 0,
            finalisedSpend: 0,
            finalisedDayCount: 0,
            lastObservedWindow: null,
        },
        sealedTarget,
        adStatus,
    };
}

function emptyRow(sealedTarget: number | null = null): EfficiencyRow {
    return rowWith({}, sealedTarget);
}

function sealed(target: number): { sealedTarget: number; sealedFunnelType: "paid_event"; sealedAt: number } {
    return { sealedTarget: target, sealedFunnelType: "paid_event", sealedAt: 1_700_000_000_000 };
}

// ─── FR-077 — eligibility rule (SC-033, SC-034) ─────────────────

test("SC-033: condition (a) — 5 combined conversions across all placements makes the creative eligible", () => {
    // Three rows that together exceed 5: 2 + 2 + 2 = 6. The fifth
    // is split across rows, not on a single row — FR-077a's
    // "may arrive on a different row than the first four".
    const rows: EfficiencyRow[] = [
        rowWith({ "2025-01-01": { conversions: 2, spend: 20 } }),
        rowWith({ "2025-01-02": { conversions: 2, spend: 20 } }),
        rowWith({ "2025-01-03": { conversions: 2, spend: 20 } }),
    ];
    const reason = isEligibleForEfficiency(rows, sealed(20));
    assert.equal(reason.eligible, true);
    assert.equal(reason.reason, "eligible-condition-a");
});

test("SC-033 boundary: exactly 4 conversions is NOT eligible (the locked decision is 5, not 4)", () => {
    const rows: EfficiencyRow[] = [
        rowWith({ "2025-01-01": { conversions: 2, spend: 20 } }),
        rowWith({ "2025-01-02": { conversions: 2, spend: 20 } }),
    ];
    const reason = isEligibleForEfficiency(rows, sealed(20));
    assert.equal(reason.eligible, false);
    assert.equal(reason.reason, "below-threshold-and-running");
});

test("SC-034: condition (b) — stopped running with ≥1 conversion makes the creative eligible", () => {
    const rows: EfficiencyRow[] = [
        rowWith({ "2025-01-01": { conversions: 1, spend: 5 } }, 20, "PAUSED"),
    ];
    const reason = isEligibleForEfficiency(rows, sealed(20));
    assert.equal(reason.eligible, true);
    assert.equal(reason.reason, "eligible-condition-b");
});

test("SC-041 / FR-085: parent-paused ad with own status=ACTIVE is NOT stopped — under-detect, never eligible via (b)", () => {
    // The under-detect case: a campaign-paused ad reads as ACTIVE
    // and isStopped returns false. The creative never seals via
    // (b). This is the conservative design — missing contribution,
    // never wrong contribution.
    const rows: EfficiencyRow[] = [
        rowWith({ "2025-01-01": { conversions: 3, spend: 15 } }, 20, "ACTIVE"),
    ];
    const reason = isEligibleForEfficiency(rows, sealed(20));
    assert.equal(reason.eligible, false);
    assert.equal(reason.reason, "below-threshold-and-running");
});

test("FR-006 zero-conversions: stopped with zero conversions is NOT eligible (FR-006 explicit-absent guard)", () => {
    const rows: EfficiencyRow[] = [
        rowWith({}, 20, "DELETED"),
    ];
    const reason = isEligibleForEfficiency(rows, sealed(20));
    assert.equal(reason.eligible, false);
    assert.equal(reason.reason, "below-threshold-stopped-but-zero-conversions");
});

test("FR-077 no sealed target: an unsealed creative is NOT eligible", () => {
    const rows: EfficiencyRow[] = [
        rowWith({ "2025-01-01": { conversions: 10, spend: 100 } }, null),
    ];
    const reason = isEligibleForEfficiency(rows, null);
    assert.equal(reason.eligible, false);
    assert.equal(reason.reason, "no-sealed-target");
});

// ─── FR-002a / FR-003 — aggregate-then-divide (SC-030) ──────────

test("SC-030: aggregate-then-divide produces a single, weighted figure across the creative's rows", () => {
    // Discriminating fixture: rows with materially different
    // cost-per-result values so the two formulas diverge.
    //   Row 1: 1 conversion, $5   → cost-per-result $5
    //   Row 2: 50 conversions, $1000 → cost-per-result $20
    //   Per-row ratio mean:    ($5 + $20) / 2 = $12.50
    //   Aggregate-then-divide: ($5 + $1000) / (1 + 50) = $1005/51 ≈ $19.71
    //   / sealed target $20 = $0.985
    //
    // The fixture ALSO supplies spend7d so the wrong impl
    // (using `spend7d`) has a different value to read. With
    // spend7d=20 per row: wrong totalCost = 40, wrong figure = 40/51/20 ≈ 0.039.
    const rows: EfficiencyRow[] = [
        { ...rowWith({ "2025-01-01": { conversions: 1, spend: 5 } }), spend7d: 20 },
        { ...rowWith({ "2025-01-02": { conversions: 50, spend: 1000 } }), spend7d: 20 },
    ];
    const totalCost = 5 + 1000; // = 1005
    const totalResults = 1 + 50;  // = 51
    const expected = (totalCost / totalResults) / 20; // = 1005/51/20 ≈ 0.9852941176470588
    const out = computeEfficiencyFigure(rows, sealed(20));
    assert.ok(out !== null);
    assert.equal(out!.totalCost, totalCost);
    assert.equal(out!.totalResults, totalResults);
    assert.equal(out!.value, expected);
});

test("SC-030 discriminator: against a divide-then-average impl, the same fixture produces a different number", () => {
    // Same fixture as SC-030 with spend7d supplied so a wrong
    // impl reading spend7d has something to read. The two
    // formulas produce clearly different numbers. The real impl is
    // aggregate-then-divide; the test fails against any impl
    // that returns the per-row ratio mean.
    const rows: EfficiencyRow[] = [
        { ...rowWith({ "2025-01-01": { conversions: 1, spend: 5 } }), spend7d: 20 },
        { ...rowWith({ "2025-01-02": { conversions: 50, spend: 1000 } }), spend7d: 20 },
    ];
    const out = computeEfficiencyFigure(rows, sealed(20));
    assert.ok(out !== null);
    const perRowRatioMean = (5 / 1 + 1000 / 50) / 2; // = (5 + 20) / 2 = 12.5
    assert.notEqual(out!.value, perRowRatioMean,
        "real impl returns aggregate-then-divide, not the per-row ratio mean");
    // And the real figure is what we expect.
    assert.equal(out!.value, (1005 / 51) / 20);
});

test("FR-006 / SC-030: zero conversions across all rows returns null (explicitly absent, FR-006)", () => {
    const rows: EfficiencyRow[] = [
        rowWith({ "2025-01-01": { conversions: 0, spend: 5 } }),
        rowWith({ "2025-01-02": { conversions: 0, spend: 10 } }),
    ];
    const out = computeEfficiencyFigure(rows, sealed(20));
    assert.equal(out, null);
});

test("FR-005 no sealed target: returns null — never seal against nothing", () => {
    const rows: EfficiencyRow[] = [
        rowWith({ "2025-01-01": { conversions: 3, spend: 15 } }, null),
    ];
    const out = computeEfficiencyFigure(rows, null);
    assert.equal(out, null);
});

// ─── §14.2 correction — spend window discriminator (SC-038) ──

test("§14.2 correction: the figure uses ACCRUED spend, not metrics.spend7d (a 90-day-old creative)", () => {
    // This is the user's named test. A creative running 90 days
    // has 90 days of conversions and 90 days of spend. The
    // accrued figure is totalCost = 4500 / totalResults = 180,
    // divided by sealed target 20. = 4500/180/20 = 1.25.
    //
    // A wrong impl that uses `metrics.spend7d` (rolling 7-day
    // sum, NOT the per-day accrual) would compute
    // totalCost = 4 placements × 7 days × $12.50/day = $350,
    // and the figure would be 350/180/20 = 0.0972...
    //
    // The real impl produces 1.25; the spend7d-impl produces
    // 0.0972. ~13× off. This test is the discriminator — it
    // supplies spend7d in the fixture so a wrong impl has
    // data to read, and asserts the right impl ignores it.
    const rows: EfficiencyRow[] = [];
    const numPlacements = 4;
    const numDays = 90;
    const spendPerDayPerRow = 12.5;
    const spend7dPerRow = spendPerDayPerRow * 7; // 7-day rolling sum
    for (let r = 0; r < numPlacements; r++) {
        const days: { [iso: string]: { conversions: number; spend: number } } = {};
        for (let d = 0; d < numDays; d++) {
            const day = new Date(2025, 8, 1);
            day.setDate(day.getDate() + d);
            const iso = day.toISOString().slice(0, 10);
            days[iso] = { conversions: 0.5, spend: spendPerDayPerRow };
        }
        const row: EfficiencyRow = {
            dayAccrual: {
                days,
                finalisedConversions: 0,
                finalisedSpend: 0,
                finalisedDayCount: 0,
                lastObservedWindow: null,
            },
            sealedTarget: 20,
            adStatus: "ACTIVE",
            // The wrong impl's data source. The right impl ignores this.
            spend7d: spend7dPerRow,
        };
        rows.push(row);
    }
    const out = computeEfficiencyFigure(rows, sealed(20));
    assert.ok(out !== null);
    assert.equal(out!.totalCost, 4500, "90 days × 4 placements × $12.50/day = $4500");
    assert.equal(out!.totalResults, 180, "90 days × 4 placements × 0.5/day = 180");
    assert.equal(out!.value, 1.25, "4500/180/20 = 1.25");

    // The wrong impl's value, for comparison:
    // wrong totalCost = 4 × spend7dPerRow = 4 × 87.5 = 350
    // wrong figure = 350 / 180 / 20 = 0.0972...
    const wrongTotalCost = numPlacements * spend7dPerRow;
    const wrongFigure = wrongTotalCost / 180 / 20;
    assert.ok(Math.abs(out!.value - wrongFigure) > 1,
        `real impl (${out!.value}) and spend7d impl (${wrongFigure.toFixed(4)}) differ by more than 1 — the discriminator passes`);
});

// ─── FR-005c's efficiency-side carve-out (SC-031, SC-035) ─────

test("SC-035 first-half: a fresh creative's first efficiency write is permitted (firstWrite: true)", () => {
    const verdict = decideEfficiencyWrite(undefined, 1.25);
    assert.equal(verdict.allowed, true);
    if (verdict.allowed) {
        assert.equal(verdict.firstWrite, true);
        assert.equal(verdict.figure, 1.25);
    }
});

test("SC-035 first-half: an existing ledger entry with efficiencyContributed: false is also a first write", () => {
    const verdict = decideEfficiencyWrite({ efficiencyContributed: false }, 1.25);
    assert.equal(verdict.allowed, true);
    if (verdict.allowed) assert.equal(verdict.firstWrite, true);
});

test("SC-035 second-half: a second efficiency write onto an already-contributed creative is refused (FR-079 write-once)", () => {
    const verdict = decideEfficiencyWrite({ efficiencyContributed: true }, 1.25);
    assert.equal(verdict.allowed, false);
    if (!verdict.allowed) {
        assert.equal(verdict.reason, "efficiency-already-contributed");
    }
});

test("SC-035 second-half: a guard that always permits would fail this test (the discriminating shape)", () => {
    // The wrong impl returns `{ allowed: true, ... }` here.
    // This test pins the refusal with a direct assertion.
    const verdict = decideEfficiencyWrite({ efficiencyContributed: true }, 2.5);
    assert.equal(verdict.allowed, false,
        "FR-079 forbids a second write onto an already-contributed creative");
});

test("SC-035 first-half: a guard that always refuses would fail this test (the other discriminating shape)", () => {
    // The wrong impl returns `{ allowed: false, ... }` here.
    // This test pins the permission with a direct assertion.
    const verdict = decideEfficiencyWrite(undefined, 1.25);
    assert.equal(verdict.allowed, true,
        "the first efficiency write MUST be permitted (FR-005c carve-out)");
});

test("FR-006 explicit-absent: a null figure is not contributed (and does NOT lock efficiencyContributed)", () => {
    // If the figure is null (FR-006's "explicitly absent"), we
    // must NOT contribute. A future sync where the figure becomes
    // resolvable should still be able to write the first time.
    const verdict = decideEfficiencyWrite(undefined, null);
    assert.equal(verdict.allowed, false);
});

// ─── FR-087 — recompute vs carry-across (SC-036) ───────────

test("SC-036 re-attribution: same row set carries the figure across unchanged", () => {
    const verdict = applyEfficiencyRecompute({
        rowIdsBefore: ["row-A", "row-B"],
        rowIdsAfter: ["row-A", "row-B"],
        existing: { efficiencyContributed: true, efficiencyValue: 1.25 },
    });
    assert.equal(verdict.kind, "carry-across");
    if (verdict.kind === "carry-across") {
        assert.equal(verdict.figure, 1.25, "the figure carries across unchanged");
    }
});

test("SC-036 re-attribution: same row set with no prior contribution goes to recompute (no figure to carry)", () => {
    const verdict = applyEfficiencyRecompute({
        rowIdsBefore: ["row-A", "row-B"],
        rowIdsAfter: ["row-A", "row-B"],
        existing: undefined,
    });
    assert.equal(verdict.kind, "recompute",
        "no existing figure → recompute (the dispatcher decides; computeEfficiencyFigure computes)");
});

test("SC-036 merge: changed row set recomputes over the union", () => {
    // A merge joins two halves (rows A,B + rows C,D → rows A,B,C,D).
    // Same row sets → carry-across; different row sets → recompute.
    const verdict = applyEfficiencyRecompute({
        rowIdsBefore: ["row-A", "row-B"],
        rowIdsAfter: ["row-A", "row-B", "row-C", "row-D"],
        existing: { efficiencyContributed: true, efficiencyValue: 1.25 },
    });
    assert.equal(verdict.kind, "recompute",
        "a row set change forces recompute (FR-087's two-case dispatcher)");
});

test("SC-036 discriminator: a single-shape impl that always carries across fails the merge case", () => {
    // The wrong impl returns `{ kind: "carry-across", ... }` for
    // BOTH same-set and changed-set. This test pins the recompute
    // outcome on a changed-set input — the wrong impl would fail.
    const verdict = applyEfficiencyRecompute({
        rowIdsBefore: ["row-A"],
        rowIdsAfter: ["row-A", "row-B"],
        existing: { efficiencyContributed: true, efficiencyValue: 1.0 },
    });
    assert.equal(verdict.kind, "recompute");
});

// ─── SC-048 — FR-013a / FR-074b merge shape ─────────────────

test("SC-048: merge with two halves (different sealed targets) — earliest target wins, recompute over the union", () => {
    // Two hash groups merging into one. Each half had its own seal
    // at different times. The earliest sealed target wins (FR-012a).
    // The figure is recomputed over the union.
    //
    //   Half A: 2 rows, 4 conversions total, $80 total
    //   Half B: 2 rows, 6 conversions total, $120 total
    //   Union: 10 conversions total, $200 total
    //   Earliest sealed target: $30 (Half A's)
    //   Figure: (200/10) / 30 = 2/3 ≈ 0.6666...
    const halfA: EfficiencyRow[] = [
        { ...rowWith({ "2025-01-01": { conversions: 2, spend: 40 } }, 30), spend7d: 28 },
        { ...rowWith({ "2025-01-02": { conversions: 2, spend: 40 } }, 30), spend7d: 28 },
    ];
    const halfB: EfficiencyRow[] = [
        { ...rowWith({ "2025-01-03": { conversions: 3, spend: 60 } }, 50), spend7d: 42 },
        { ...rowWith({ "2025-01-04": { conversions: 3, spend: 60 } }, 50), spend7d: 42 },
    ];
    const earliest = sealed(30);
    const out = applyMergeRecompute(
        [...halfA, ...halfB],
        earliest,
        { efficiencyContributed: true, efficiencyValue: 80 / 4 / 30 },
        { efficiencyContributed: true, efficiencyValue: 120 / 6 / 50 },
    );
    assert.equal(out.recomputed, true);
    assert.equal(out.value, 0.6666666666666666);
});

test("SC-048 discriminator: a single-shape impl that always returns the first half's figure fails the merge case", () => {
    // The wrong impl returns `existingA.efficiencyValue` for both
    // halves — it cannot recompute. This test pins the recomputed
    // outcome against the actual union arithmetic.
    const halfA: EfficiencyRow[] = [
        rowWith({ "2025-01-01": { conversions: 4, spend: 80 } }, 30),
    ];
    const halfB: EfficiencyRow[] = [
        rowWith({ "2025-01-02": { conversions: 6, spend: 120 } }, 50),
    ];
    const earliest = sealed(30);
    const out = applyMergeRecompute(
        [...halfA, ...halfB],
        earliest,
        { efficiencyContributed: true, efficiencyValue: 80 / 4 / 30 },
        { efficiencyContributed: true, efficiencyValue: 120 / 6 / 50 },
    );
    // Real figure: totalCost 200 / totalResults 10 / target 30 = 0.666...
    // Wrong impl: returns existingA.efficiencyValue = 80/4/30 = 0.666... too!
    // The discriminator here is the recomputed flag + value
    // independence from existingA's value. We choose a different
    // existingA value to discriminate:
    const wrong = 0.42; // an arbitrary wrong impl's value
    // Real impl reads the union arithmetic, not the existing value.
    // If a wrong impl is "return existingA.efficiencyValue", a
    // different existingA value yields a different number.
    const outWithDifferentExistingA = applyMergeRecompute(
        [...halfA, ...halfB],
        earliest,
        { efficiencyContributed: true, efficiencyValue: wrong },
        { efficiencyContributed: true, efficiencyValue: 120 / 6 / 50 },
    );
    assert.equal(outWithDifferentExistingA.value, 0.6666666666666666,
        "the merge figure is computed from the union, not from existingA — wrong impl reads existingA and yields a different number");
});

// ─── FR-077a — split-creative recording (the recording rule) ───

test("FR-077a: a creative split across two halves — the whole's total still crosses 5 (the split effect)", () => {
    // The whole's `creativeConversionTotal(rows)` reads from EVERY
    // row, so a creative split into halves (one with 3, the other
    // with 3) still totals 6 — the threshold is crossed across
    // the union, not within either half.
    const whole: EfficiencyRow[] = [
        rowWith({ "2025-01-01": { conversions: 3, spend: 30 } }, 20),
        rowWith({ "2025-01-02": { conversions: 3, spend: 30 } }, 20),
    ];
    const reason = isEligibleForEfficiency(whole, sealed(20));
    assert.equal(reason.eligible, true,
        "the whole sees both halves; the split's conversions sum to 6 and cross the threshold");
});

// ─── Summary ─────────────────────────────────────────────────────────────

console.log("");
console.log(`=== Phase 4 Batch 3 — efficiency-figure tests ===`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
    process.exit(FAILED);
}
process.exit(PASSED);
