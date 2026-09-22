// functions/src/learning/efficiencyAggregate.ts — Phase 4, T051a / T051e
// ══════════════════════════════════════════════════════════════════════
// PURE module. The aggregate-side helpers for the efficiency figure:
// the FR-038 3.0 bound applied on the way in, and the FR-037 gate
// predicate that decides whether efficiency is allowed to influence
// ranking at all.
//
// Three small pure functions. Each one is what a discriminating
// test runs against; the discriminators in `efficiencyAggregate.test.ts`
// pin the wrong-impl shape (e.g. clamping at READ time, omitting
// the `?? 0` fallback, reading the wrong unit) for each.

// ─── FR-038 — the 3.0 bound applied on the way in ───────────

/**
 * The maximum efficiency figure allowed to enter the aggregate's
 * running mean. FR-038's locked decision: "the efficiency ratio is
 * bounded at 3.0 when folded into an aggregate average." The
 * storage layer (the unbounded `efficiencyRaw` on the ad row) is
 * untouched — this clamp governs the aggregate input only.
 *
 * A row whose figure is 8.0 contributes 3.0 to the average; a row
 * whose figure is 0.6 contributes 0.6 (unchanged). The clamp is
 * monotonic in the figure: a higher figure never produces a lower
 * contribution.
 */
export const EFFICIENCY_BOUND = 3.0 as const;

export function clampEfficiencyForAggregate(figure: number | null): number {
    if (figure === null) return 0;
    if (!Number.isFinite(figure) || figure < 0) return 0;
    if (figure > EFFICIENCY_BOUND) return EFFICIENCY_BOUND;
    return figure;
}

// ─── Add/withdraw helpers for the bounded running mean ────────
//
// These mirror the existing `applyAdToHook` / `applyHookAggregateWithdrawal`
// pattern but live in their own module so the discriminator test
// can exercise the arithmetic in isolation, without going through
// the full hook aggregate flow.

/**
 * Pure: add a single efficiency figure to a running mean.
 *
 * `priorAvg` is the average BEFORE this contribution; `priorCount`
 * is the number of creatives that contributed. `figure` is the
 * contribution (already clamped by `clampEfficiencyForAggregate`).
 *
 *   newAvg = (priorAvg * priorCount + figure) / (priorCount + 1)
 *   newCount = priorCount + 1
 *
 * Guards `priorCount < 0` (returns the figure alone; should not
 * occur in practice but the guard is here for the test fixtures
 * that hand-construct aggregates).
 */
export function addEfficiencyToMean(
    priorAvg: number | null,
    priorCount: number,
    figure: number,
): { newAvg: number; newCount: number } {
    if (priorCount < 0) {
        return { newAvg: figure, newCount: Math.max(priorCount + 1, 1) };
    }
    const baseAvg = priorAvg ?? 0;
    const newCount = priorCount + 1;
    return {
        newAvg: (baseAvg * priorCount + figure) / newCount,
        newCount,
    };
}

/**
 * Pure: subtract a single efficiency figure from a running mean.
 *
 * `priorAvg` is the average BEFORE the withdrawal; `priorCount`
 * is the count BEFORE the withdrawal (must include the withdrawn
 * observation); `figure` is the withdrawn row's own recorded
 * contribution (Batch 28's FR-021 fix: the recorded value, NOT the
 * mean, so the inverse is exact).
 *
 *   newAvg = (priorAvg * priorCount - figure) / (priorCount - 1)
 *
 * The `priorCount <= 1` guard resets to 0 rather than dividing by
 * zero — there is no mean of zero observations. Returning 0 (not
 * the prior mean) is what makes a full withdraw-then-re-add
 * round-trip land back on the original value. This is the same
 * arithmetic Batch 28 closed for `avgLinkCtr` and `avgCpm`.
 */
export function subtractEfficiencyFromMean(
    priorAvg: number | null,
    priorCount: number,
    figure: number,
): { newAvg: number; newCount: number } {
    const newCount = priorCount - 1;
    if (newCount <= 0) {
        return { newAvg: 0, newCount: 0 };
    }
    const baseAvg = priorAvg ?? 0;
    return {
        newAvg: (baseAvg * priorCount - figure) / newCount,
        newCount,
    };
}

// ─── FR-037 — the efficiency-evidence gate ──────────────────

/**
 * The owner's locked 10/3/3 decision — FR-037's efficiency-
 * evidence gate is **3 distinct creatives carrying a sealed
 * efficiency figure**. FR-034's activation gate (10 creatives,
 * any figure) is a SEPARATE predicate; this one is the
 * efficiency-specific half that Batch 13 left un-enforced
 * (`rankingEngine.ts:247` commented "FR-034 / FR-034a / FR-037"
 * but reads `creativeCount`, the wrong unit, today).
 *
 * The discriminator is the `?? 0` fallback. Absent
 * `efficiencyContributingCount` MUST be read as 0, and the gate
 * MUST refuse:
 *
 *   undefined < 3  →  false   ←  WOULD OPEN the gate (wrong)
 *   (undefined ?? 0) < 3  →  true   ←  closes the gate (right)
 *
 * `undefined < 3` evaluates to `false` in JavaScript; a guard
 * that omits `?? 0` opens the gate for an absent count rather
 * than closing it. Batch 13 hit exactly this on `creativeCount`
 * and closed it with `?? 0` there; this gate follows the same
 * pattern.
 *
 * The discriminator test (`SC-037 gate with absent count:
 * undefined must fail, not pass`) pins the shape: an absent count
 * MUST cause the gate to return false.
 */
export function isEfficiencyGateOpen(
    aggregate: { efficiencyContributingCount?: number },
    threshold: number = 3,
): boolean {
    return (aggregate.efficiencyContributingCount ?? 0) >= threshold;
}
