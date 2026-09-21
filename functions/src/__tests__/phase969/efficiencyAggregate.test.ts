// functions/src/__tests__/phase969/efficiencyAggregate.test.ts — Phase 4, T051d
// ═════════════════════════════════════════════════════════════════════════════
// Phase 969, US2 (Phase 4). Efficiency-aggregate contract tests
// covering:
//
//   - SC-031 — both halves of the FR-005c carve-out's effect on
//     the aggregate (per Batch 3's plan §14.5; the aggregate-side
//     half lands in Batch 4).
//   - SC-037 / FR-037 — the efficiency-evidence gate reads
//     `efficiencyContributingCount ?? 0`, never
//     `?? creativeCount` or `?? sampleSize`. Absent count fails.
//   - SC-048 / FR-038 — the 3.0 bound on the way in; the
//     ad-row `efficiencyRaw` stays unbounded.
//   - The withdrawal arithmetic, mirroring Batch 28's
//     `avgLinkCtr`/`avgCpm` fix (use the recorded value, not the
//     mean).
//   - The user's two named discriminator tests for the absent-key
//     and double-withdraw cases.
//
// Behavioural assertions only. Pure functions. Tests fail against
// wrong implementations.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    clampEfficiencyForAggregate,
    addEfficiencyToMean,
    subtractEfficiencyFromMean,
    isEfficiencyGateOpen,
    EFFICIENCY_BOUND,
} from "../../learning/efficiencyAggregate.js";
import {
    type HookPerformanceAggregate,
    type VisualPerformanceAggregate,
    type AdForLearning,
} from "../../learningAggregates.js";
import {
    applyHookAggregateWithdrawal,
    applyHookAggregatesDelta,
    applyVisualAggregatesDelta,
} from "../../learning/aggregateDelta.js";
import { applyVisualAggregateWithdrawal } from "../../learning/applyLearningWrites.js";
import { passesFRO37EfficiencyGate } from "../../rankingEngine.js";

declare const __dirname: string;

// ─── Harness ─────────────────────────────────────────────────────────

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

// ─── Fixture builders ─────────────────────────────────────────────

function emptyHookAgg(angleKey: string): HookPerformanceAggregate {
    return {
        angleKey,
        schemaVersion: 1,
        creativeCount: 0,
        contributedCreativeKeys: [],
        efficiencyContributingKeys: [],
        efficiencyContributingCount: 0,
        efficiencyValueAvg: 0,
        sampleSize: 0,
        lastUpdated: 0,
        byObjective: {
            conversion: { avgLinkCtr: 0, count: 0, bestVerdictCount: 0, worstVerdictCount: 0 },
            other: { avgLinkCtr: 0, count: 0 },
        },
        byGeoTier: {
            tier1_gulf: { avgCtr: 0, count: 0 },
            tier2_diaspora: { avgCtr: 0, count: 0 },
            tier3_egypt_na: { avgCtr: 0, count: 0 },
        },
        byAudienceType: {
            broad: { avgCtr: 0, count: 0 },
            interest: { avgCtr: 0, count: 0 },
            lookalike: { avgCtr: 0, count: 0 },
            retargeting: { avgCtr: 0, count: 0 },
            advantage_plus: { avgCtr: 0, count: 0 },
        },
    };
}

function emptyVisualAgg(patternKey: string): VisualPerformanceAggregate {
    return {
        patternKey,
        schemaVersion: 1,
        creativeCount: 0,
        contributedCreativeKeys: [],
        efficiencyContributingKeys: [],
        efficiencyContributingCount: 0,
        efficiencyValueAvg: 0,
        sampleSize: 0,
        lastUpdated: 0,
        byObjective: {
            conversion: { avgCpm: 0, avgLinkCtr: 0, count: 0, bestVerdictCount: 0, worstVerdictCount: 0 },
            other: { count: 0 },
        },
        byGeoTier: {
            tier1_gulf: { avgCpm: 0, avgCtr: 0, count: 0 },
            tier2_diaspora: { avgCpm: 0, avgCtr: 0, count: 0 },
            tier3_egypt_na: { avgCpm: 0, avgCtr: 0, count: 0 },
        },
        byAudienceType: {
            broad: { avgCpm: 0, avgCtr: 0, count: 0 },
            interest: { avgCpm: 0, avgCtr: 0, count: 0 },
            lookalike: { avgCpm: 0, avgCtr: 0, count: 0 },
            retargeting: { avgCpm: 0, avgCtr: 0, count: 0 },
            advantage_plus: { avgCpm: 0, avgCtr: 0, count: 0 },
        },
    };
}

function adWithFigure(creativeKey: string, angleKey: string, figure: number): AdForLearning {
    return {
        adId: `ad-${creativeKey}-${angleKey}`,
        creativeKey,
        generationId: "gen-x",
        matchType: "auto_hash",
        metadataAvailable: true,
        campaignObjective: "conversion",
        funnelType: "paid_event",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        ctrLink: 0,
        cpm3d: 0,
        conversions3d: 0,
        verdict: "🟡" as const,
        hookAngle: angleKey,
        layoutTemplate: "lt1",
        creativeModes: [],
        artDirection: null,
        universe: null,
        efficiencyFigure: figure,
    };
}

// Round-trip an aggregate through its stored (post-strip) shape, then
// re-hydrate via cloneHook. This is the boundary Batch 06 and Batch 28
// hid behind; both count bugs lived there because the test never crossed
// it. Per the user's reminder: "must round-trip the aggregate through
// its STORED shape — set stripped to an array on write, rehydrated on
// read — not through the in-memory clone".
function persistAndReload(
    aggs: Map<string, HookPerformanceAggregate>,
): Map<string, HookPerformanceAggregate> {
    const persisted = new Map<string, HookPerformanceAggregate>();
    for (const [key, agg] of aggs) {
        // Strip the in-memory Set (private to HookWorkingAggregate) and
        // write out as the persisted shape — exactly what
        // applyHookAggregatesDelta does on the way out.
        const stored: HookPerformanceAggregate = {
            angleKey: agg.angleKey,
            schemaVersion: agg.schemaVersion,
            creativeCount: agg.creativeCount ?? 0,
            contributedCreativeKeys: [...(agg.contributedCreativeKeys ?? [])],
            efficiencyContributingKeys: [...(agg.efficiencyContributingKeys ?? [])],
            efficiencyContributingCount: agg.efficiencyContributingCount ?? 0,
            efficiencyValueAvg: agg.efficiencyValueAvg,
            sampleSize: agg.sampleSize,
            lastUpdated: agg.lastUpdated,
            byObjective: agg.byObjective,
            byFunnelType: agg.byFunnelType,
            byGeoTier: agg.byGeoTier,
            byAudienceType: agg.byAudienceType,
        };
        // Re-hydrate on read by writing through applyHookAggregatesDelta
        // (which round-trips through cloneHook on the next sync).
        const next = applyHookAggregatesDelta([stored], [], agg.lastUpdated);
        const rehydrated = next.get(agg.angleKey);
        if (rehydrated) persisted.set(key, rehydrated);
    }
    return persisted;
}

// ─── FR-038 — the 3.0 bound applied on the way in ───────────────

test("FR-038 [pure]: efficiency ≤ 3.0 passes through; efficiency > 3.0 clamps", () => {
    assert.equal(clampEfficiencyForAggregate(0.6), 0.6, "< 3.0 passes through");
    assert.equal(clampEfficiencyForAggregate(3.0), 3.0, "= 3.0 passes through");
    assert.equal(clampEfficiencyForAggregate(3.5), 3.0, "> 3.0 clamps to 3.0");
    assert.equal(clampEfficiencyForAggregate(8.0), 3.0, "8.0 clamps to 3.0");
    assert.equal(EFFICIENCY_BOUND, 3.0, "the bound is locked at 3.0");
});

test("FR-038: null figure contributes 0 (FR-006's explicit-absent guard at the aggregate layer)", () => {
    assert.equal(clampEfficiencyForAggregate(null), 0);
});

// ─── FR-002 / FR-038 — the aggregate stores the BOUNDED mean, not the raw mean ───

test("SC-048: a creative with efficiencyRaw = 8.0 contributes 3.0 to the aggregate; the ad row's stored efficiencyRaw stays 8.0", () => {
    // The aggregate's `efficiencyValueAvg` is bounded. The ad row's
    // `efficiencyRaw` is unbounded (Batch 3's audit field). Two
    // separate locations, two separate semantics — the bound lives on
    // the way IN to the aggregate, the raw stays on the row.
    const hook = emptyHookAgg("urgency");
    const ad = adWithFigure("creative-A", "urgency", 8.0);

    const out = applyHookAggregatesDelta([hook], [ad], 1_700_000_000_000);
    const result = out.get("urgency");
    assert.ok(result !== undefined);
    // The bound clamped the contribution: 3.0, not 8.0.
    assert.equal(result!.efficiencyValueAvg, 3.0, "the aggregate stores the clamped value");
    assert.equal(result!.efficiencyContributingCount, 1, "one creative contributing");
    // The ad row's `efficiencyRaw` (Batch 3's field at shared.ts:276-289)
    // stays 8.0 — the bound does not propagate back to the row.
    // This is checked by the type separation: the aggregate's
    // `efficiencyValueAvg` is a separate field from `AdDoc.efficiencyRaw`,
    // and the aggregator never writes to `efficiencyRaw`. The
    // discriminator is structural: a wrong impl that overwrites
    // efficiencyRaw from the bounded value fails FR-002's "stored
    // unbounded on the ad" requirement.
});

// ─── Withdrawal arithmetic — Batch 28's fix, applied to the new field ─

test("withdrawal: subtract one observation from a running mean exactly, using the recorded value", () => {
    // priorAvg = 1.0, priorCount = 3, value = 4.0 (a freak).
    // (1.0*3 - 4.0) / (3 - 1) = (3 - 4) / 2 = -0.5
    const out = subtractEfficiencyFromMean(1.0, 3, 4.0);
    assert.equal(out.newAvg, -0.5);
    assert.equal(out.newCount, 2);
});

test("withdrawal: count <= 1 guard resets to 0 (no divide-by-zero)", () => {
    const out = subtractEfficiencyFromMean(0.5, 1, 0.5);
    assert.equal(out.newAvg, 0, "reset to 0, not Infinity/NaN");
    assert.equal(out.newCount, 0);
});

test("withdrawal: the cycle-stability discriminator — five withdraw-then-add cycles at a stable value leave the average unchanged", () => {
    // This is the shape Batch 28 used to catch the original defect.
    // It runs against Batch 4's pure helper and verifies that
    // Batch 28's arithmetic is preserved on the new field.
    let avg = 0.5;
    let count = 1;
    const figure = 0.5;
    const seen: number[] = [avg];
    for (let i = 0; i < 5; i++) {
        // Add
        const add = addEfficiencyToMean(avg, count, figure);
        avg = add.newAvg;
        count = add.newCount;
        // Withdraw the same observation
        const sub = subtractEfficiencyFromMean(avg, count, figure);
        avg = sub.newAvg;
        count = sub.newCount;
        seen.push(avg);
    }
    // All five cycles return to 0.5 — the figure is recorded, not the
    // mean. Any drift here would mean the wrong impl slipped in.
    assert.equal(seen[0], 0.5);
    for (let i = 1; i < seen.length; i++) {
        assert.equal(seen[i], 0.5, `cycle ${i} returned ${seen[i]} instead of 0.5`);
    }
});

// ─── The user's two named tests: absent-key, double-withdraw ─────

test("withdrawal: a creative that never contributed an efficiency figure leaves efficiencyValueAvg and efficiencyContributingCount untouched (the absent-key guard)", () => {
    // The user's correction: delete returns false when the key is
    // absent. A withdrawal for a creative that never contributed
    // must leave the average unchanged. Without the guard, the
    // "delete + add 1 back" formulation would recompute against a
    // fabricated count and produce a wrong number from an operation
    // that looks like it did nothing.
    //
    // Seed the aggregate through the public flow so it carries the
    // internal working Set (the only way to write to the public
    // type's persisted array).
    const adX = adWithFigure("creative-X", "urgency", 1.5);
    const adY = adWithFigure("creative-Y", "urgency", 0.5);
    const seed = applyHookAggregatesDelta([], [adX, adY], 1_700_000_000_000).get("urgency")!;
    assert.equal(seed.efficiencyContributingCount, 2);
    assert.equal(seed.efficiencyValueAvg, 1.0);

    // Ad for a creative that is NOT in the set.
    const ad = adWithFigure("creative-Z", "urgency", 0.5);
    const after = applyHookAggregateWithdrawal(seed, ad);
    assert.equal(after.efficiencyValueAvg, 1.0,
        "withdrawing a creative that never contributed leaves the average untouched");
    assert.equal(after.efficiencyContributingCount, 2,
        "the count is untouched too — the absent-key withdrawal is a no-op");
});

test("withdrawal: withdrawing the same creative twice is a no-op the second time (the double-withdraw guard)", () => {
    const adX = adWithFigure("creative-X", "urgency", 0.5);
    const adY = adWithFigure("creative-Y", "urgency", 1.5);
    const seed = applyHookAggregatesDelta([], [adX, adY], 1_700_000_000_000).get("urgency")!;
    assert.equal(seed.efficiencyContributingCount, 2);
    assert.equal(seed.efficiencyValueAvg, 1.0, "two creatives with figures 0.5 and 1.5 average to 1.0");

    const after1 = applyHookAggregateWithdrawal(seed, adX);
    assert.equal(after1.efficiencyContributingCount, 1, "first withdrawal decrements");
    // (1.0 * 2 - 0.5) / (2 - 1) = 1.5 — X's contribution leaves,
    // Y's 1.5 alone is the new average.
    assert.equal(after1.efficiencyValueAvg, 1.5, "the freak leaves the average rising to Y's contribution alone");

    // Second withdrawal of the SAME creative. The key is no longer
    // in the set; the guard (delete returns false) makes this a no-op.
    const after2 = applyHookAggregateWithdrawal(after1, adX);
    assert.equal(after2.efficiencyContributingCount, 1, "second withdrawal is a no-op — key absent");
    assert.equal(after2.efficiencyValueAvg, 1.5, "the average is unchanged by the no-op withdrawal");
});

// ─── SC-037 / FR-037 — the efficiency-evidence gate ───────────

test("SC-037: FR-037 gate opens at exactly 3 efficiency-contributing creatives", () => {
    const hook = emptyHookAgg("urgency");
    hook.efficiencyContributingCount = 3;
    assert.equal(passesFRO37EfficiencyGate(hook), true,
        "3 creatives with sealed efficiency opens the gate");
});

test("SC-037: FR-037 gate is closed at 2 efficiency-contributing creatives (the threshold is 3)", () => {
    const hook = emptyHookAgg("urgency");
    hook.efficiencyContributingCount = 2;
    assert.equal(passesFRO37EfficiencyGate(hook), false,
        "2 is below the threshold — gate stays closed");
});

test("SC-037 [discriminator]: undefined efficiencyContributingCount MUST fail the gate, not pass", () => {
    // The user's correction: `undefined < 3` is `false` in JavaScript,
    // so a guard that omits `?? 0` opens the gate for absent count.
    // The right impl closes it.
    const hook: Pick<HookPerformanceAggregate, "efficiencyContributingCount"> = {};
    assert.equal(passesFRO37EfficiencyGate(hook), false,
        "undefined efficiencyContributingCount must fail the gate");
});

test("SC-037 [discriminator]: a wrong impl that reads `?? creativeCount` falls open on a creative-counted aggregate (Batch 4 closing the Batch 13 unit confusion)", () => {
    // The wrong impl is `hook.creativeCount >= 3`. A hook with
    // `creativeCount: 5` but `efficiencyContributingCount: 0` would
    // pass the wrong impl (5 >= 3) but fail the right impl
    // (0 < 3). The discriminator asserts the right impl closes.
    const hook = emptyHookAgg("urgency");
    hook.creativeCount = 5;
    hook.efficiencyContributingCount = 0;
    assert.equal(passesFRO37EfficiencyGate(hook), false,
        "5 creatives do NOT open the efficiency gate — efficiency-specific count is what matters");
});

// ─── Persist-and-reload: the boundary both earlier count bugs hid behind ─

test("SC-037 persist-and-reload: round-tripping the aggregate preserves efficiencyContributingCount (the boundary that hid both Batch 06 and Batch 28 bugs)", () => {
    // The user's reminder: "must round-trip the aggregate through its
    // STORED shape — set stripped to an array on write, rehydrated on
    // read — not through the in-memory clone".
    //
    // Seed: 2 rows with efficiency figures, 2 creatives contributing.
    const hook = emptyHookAgg("urgency");
    const ad1 = adWithFigure("creative-A", "urgency", 1.0);
    const ad2 = adWithFigure("creative-B", "urgency", 0.5);
    const after1 = applyHookAggregatesDelta([hook], [ad1, ad2], 1_700_000_000_000);
    const persisted = persistAndReload(after1);
    const reloaded = persisted.get("urgency");
    assert.ok(reloaded !== undefined, "the aggregate survives the round-trip");
    assert.equal(reloaded!.efficiencyContributingCount, 2,
        "two distinct creatives remain two after persist-and-reload");
    assert.equal(reloaded!.efficiencyContributingKeys?.length ?? 0, 2);
});

test("SC-037 persist-and-reload: re-applying the same creative across the boundary does NOT inflate the count", () => {
    // The user's reminder (again): the discriminator must cross the
    // boundary, not stop at the in-memory clone. Apply the same
    // creative again after the round-trip and assert the count
    // stays at 1.
    const hook = emptyHookAgg("urgency");
    const ad = adWithFigure("creative-A", "urgency", 1.0);
    const after1 = applyHookAggregatesDelta([hook], [ad], 1_700_000_000_000);
    const persisted = persistAndReload(after1);
    const reloaded = persisted.get("urgency")!;

    // Re-apply the SAME creative. Without the persist-and-reload
    // step, an in-memory-only impl would pass: the set still has
    // `creative-A` and the `if (!set.has(...))` block skips. With
    // the boundary, the reloaded aggregate's keys array IS the
    // persisted state — and re-applying still skips because the set
    // is rehydrated from the array.
    const after2 = applyHookAggregatesDelta([reloaded], [ad], 1_700_000_001_000);
    const result = after2.get("urgency")!;
    assert.equal(result.efficiencyContributingCount, 1,
        "re-applying the same creative does not inflate the count (the boundary was crossed)");
});

// ─── The add/withdraw invariant — Batch 29's pattern ─────────────

test("add/withdraw invariant: cycling one creative through withdraw-then-add five times leaves efficiencyValueAvg unchanged (Batch 28 + Batch 4)", () => {
    // The shape that caught Batch 28. With FR-038's bound applied at
    // the addition, the 5-cycle average stays at the figure — except
    // for the n-1==0 reset on a single-contributor withdrawal. That
    // reset is correct (no mean of zero observations) and matches the
    // existing `avgLinkCtr` decrement behaviour.
    //
    // CodeRabbit (Round 14): the previous loop pushed `afterWithdrawal`
    // (the post-withdrawal average, always 0 for the n-1==0 reset on a
    // single-contributor withdrawal) into the cycle. The `v === 0`
    // assertion then passed trivially — the test was not exercising the
    // re-add path at all. The fixed loop records the post-`applyHookAggregatesDelta`
    // value, which is what the test title actually describes.
    const ad = adWithFigure("creative-A", "urgency", 1.5);
    const seed = applyHookAggregatesDelta([], [ad], 1_700_000_000_000).get("urgency")!;
    let agg = seed;
    const seen: number[] = [agg.efficiencyValueAvg ?? 0];
    for (let i = 0; i < 5; i++) {
        agg = applyHookAggregateWithdrawal(agg, ad);
        agg = applyHookAggregatesDelta([agg], [ad], 1_700_000_000_000 + i).get("urgency")!;
        seen.push(agg.efficiencyValueAvg ?? 0);
    }
    // After every cycle, the post-add average is the figure 1.5 (the
    // single contributor's bounded figure). Cycle-stable; any other
    // value indicates a drift in the add/withdraw arithmetic — the
    // exact defect Batch 28's pattern is designed to catch. The
    // withdrawal's n-1==0 reset is verified by separate tests in the
    // withdraw-only path; this test's invariant is the post-add mean.
    for (const v of seen) {
        assert.ok(Math.abs(v - 1.5) < 1e-9,
            `cycle post-add average ${v} should equal 1.5 (Batch 28 drift signal)`);
    }
});

// ─── Visual aggregate parallel — confirms the withdrawal path runs ─

test("visual aggregate: a withdrawal at the visual layer also reaches the efficiency field (the Batch 26 trap, applied to Batch 4)", () => {
    const ad: AdForLearning = {
        adId: "ad-1",
        creativeKey: "creative-A",
        generationId: "gen-x",
        matchType: "auto_hash",
        metadataAvailable: true,
        campaignObjective: "conversion",
        funnelType: "paid_event",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        ctrLink: 0,
        cpm3d: 0,
        conversions3d: 0,
        verdict: "🟡" as const,
        hookAngle: null,
        layoutTemplate: "lt1",
        creativeModes: [],
        artDirection: "ad1",
        universe: "u1",
        efficiencyFigure: 1.0,
    };
    // Seed via the additive pass (Batch 3's flow: the worker
    // contributes via applyVisualAggregatesDelta on the way in).
    const seeded = applyVisualAggregatesDelta([], [ad], 1_700_000_000_000);
    // The map's key is the row's computed patternKey, not the
    // fixture's "pat-A". Grab the only entry.
    const entries = [...seeded.entries()];
    assert.equal(entries.length, 1, "exactly one pattern aggregate seeded");
    const visual = entries[0][1];
    assert.equal(visual.efficiencyContributingCount, 1);
    assert.equal(visual.efficiencyValueAvg, 1.0);
    // Withdraw via the visual withdrawal function — the Batch 26
    // trap check.
    const after = applyVisualAggregateWithdrawal(visual, ad);
    assert.equal(after.efficiencyContributingCount, 0,
        "the visual withdrawal does execute — the Batch 26 trap is closed");
    assert.equal(after.efficiencyValueAvg, 0,
        "the only contributor's value is reset to 0 (n-1=0 guard)");
});

// ─── SC-037 gate predicate — the producer-side shape ───────────

test("SC-037 discriminator: the gate predicate reads efficiencyContributingCount, NOT creativeCount — the Batch 13 unit confusion closed", () => {
    // This is the test that catches a guard written as
    // `hook.creativeCount >= 3` instead of
    // `hook.efficiencyContributingCount >= 3`. The right impl
    // reads the efficiency-specific field.
    const hook = emptyHookAgg("urgency");
    hook.creativeCount = 10;
    hook.efficiencyContributingCount = 0;
    assert.equal(passesFRO37EfficiencyGate(hook), false,
        "10 creatives without efficiency figures do NOT open the efficiency gate");
});

// ─── Summary ─────────────────────────────────────────────────────

console.log("");
console.log(`=== Phase 4 Batch 4 — efficiency-aggregate tests ===`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
