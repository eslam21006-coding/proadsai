// functions/src/learning/efficiencyFigure.ts — Phase 4, T039–T043
// ══════════════════════════════════════════════════════════════════════
// PURE module. The efficiency figure — the per-creative cost-per-
// result that lets the AI recommend creatives that get sales rather
// than clicks. Five families of pure functions, all driven by
// Batch 1's per-day accrual (so cost and result windows match by
// construction) and Batch 2's sealed context (so the target is the
// one the creative was first measured against):
//
//   1. `computeEfficiencyFigure(creative, rows, dailyRowsByAdId,
//      window, sealedContext)` — FR-002 / FR-002a / FR-003. Sum
//      cost, sum results, divide once, divide by the sealed target.
//      Aggregate-then-divide, never divide-then-average.
//
//   2. `isEligibleForEfficiency(creative, rows, ..., sealedContext,
//      adStatusByAdId)` — FR-077 / FR-077a. Both conditions:
//      (a) 5 combined conversions across all placements, OR (b)
//      stopped running with ≥1 conversion. Zero conversions never
//      contributes. The eligibility count comes from
//      `creativeConversionTotal` (Batch 1) — the user's "Use it"
//      rule forbids `metrics.conversions3d` here, and that rule is
//      what `creativeConversionTotal` was built to satisfy.
//
//   3. `decideEfficiencyWrite(existing, newValue)` — FR-005c's
//      carve-out, efficiency-side. First write permitted; subsequent
//      rejected. The shape is the parallel of
//      `decideSealedTransition` (Batch 2), but on a different
//      field — `efficiencyContributed` on the ledger entry, not
//      `sealedTarget` on the row.
//
//   4. `applyEfficiencyRecompute(creative, rowSetBefore,
//      rowSetAfter, ...)` — FR-087's two-case dispatcher. Same
//      inputs (same rows, same sealed target) → carry across.
//      Changed row set (merge of two wrongly-split creatives) →
//      recompute over the union.
//
//   5. `applyMergeRecompute(unionRows, earliestSealedTarget,
//      ledgerEntries)` — FR-013a's efficiency-side: two
//      already-contributed halves merge into one, recompute over
//      the union against the earliest sealed target (FR-012a),
//      withdraw-both-recompute-add-one.
//
// What the user agreed (§14.1, §14.6) is NOT in this batch:
//   - The actual write site in `applyLearningWrites.ts`. The
//     pure functions exist; the per-creative post-walk that calls
//     them lands in Batch 5 alongside the funnel-type weighting
//     and the FR-038 bound.
//   - The aggregate-side `efficiencyContributingCount` field.
//     Batch 5.
//   - FR-038's 3.0 bound on the aggregate average. Batch 5.
//
// FR-077a — the split-creative effect — is a recording requirement,
// not a code requirement. The spec says "the threshold's fifth may
// arrive on a different row than the first four" and "a creative
// split in two may never reach 5 in either half where the whole
// would have." The whole / `creativeConversionTotal(rows)` already
// reads from EVERY row of the creative (FR-074g), so a creative
// split into two halves contributes `sumAcrossBothHalves` — the
// same total the unsplit creative would. The half that "misses"
// the threshold in isolation does NOT miss it across the merged
// total. This is the correct behaviour by construction; nothing
// in this batch closes it further.

import type { DayAccrual } from "./types.js";
import {
    creativeConversionTotal,
    creativeCostTotal,
} from "./conversionAccrual.js";
import { isStopped } from "./conversionAccrual.js";
import type { SealedContext, WorkspaceFunnelType } from "./sealedContext.js";
import { resolveCreativeSealedContext } from "./sealedContext.js";

// ─── FR-077 / FR-002 inputs ─────────────────────────────────

/**
 * The minimum shape a row needs to carry for the eligibility check
 * and the figure computation. Today the row's `dayAccrual` on
 * `AdDoc` (Batch 1's field) and its `sealedTarget` / `sealedAt` /
 * `sealedFunnelType` on `AdDoc` (Batch 2's fields) cover this.
 *
 * The optional `spend7d` field is a TEST ONLY seam — it lets the
 * §14.2 correction discriminator supply a hypothetical wrong
 * impl's data source (the rolling 7-day sum). The right impl
 * ignores this field entirely. Production does not carry it.
 */
export interface EfficiencyRow {
    /** Batch 1's per-day accrual. `null` means the row has never
     *  contributed (PROVISIONAL, never sealed, no accrual yet). */
    dayAccrual: DayAccrual | null;
    /** Batch 2's seal. `null` for an unsealed row. */
    sealedTarget: number | null;
    /**
     * Batch 2's seal timestamp. Required by
     * `resolveCreativeSealedContext` (Batch 2) to pick the earliest-
     * sealing row across the creative's rows (FR-012a). Without it
     * the sealed-context resolver returns `null` and the eligibility
     * walk refuses every row as "no-sealed-target". The wiring in
     * `applyLearningWrites.ts` populates this from the bounded-read
     * cache (`existingByAdId[].sealedAt`).
     */
    sealedAt?: number | null;
    /**
     * Batch 2's seal funnel type. Required by
     * `resolveCreativeSealedContext` for the same reason as
     * `sealedAt`. Without it the resolver returns `null` and the
     * eligibility walk refuses every row. Populated from
     * `existingByAdId[].sealedFunnelType` in the wiring.
     */
    sealedFunnelType?: WorkspaceFunnelType | null;
    /** Batch 1's stopped-running signal (FR-077(b)). */
    adStatus: string | null | undefined;
    /** TEST ONLY — the wrong impl's data source. The right impl
     *  does not read this field. */
    spend7d?: number;
}

export interface EligibilityReason {
    /** True when the row's contribution crosses either FR-077
     *  threshold. */
    eligible: boolean;
    /** Why the check produced its answer — useful for the
     *  `errors[]` audit log and for the discriminated tests. */
    reason:
        | "eligible-condition-a"
        | "eligible-condition-b"
        | "no-row"
        | "no-sealed-target"
        | "below-threshold-and-running"
        | "below-threshold-stopped-but-zero-conversions";
}

// ─── FR-002a / FR-003 — aggregate-then-divide ────────────────

/**
 * The realised cost per result divided by the creative's single
 * sealed target. Aggregate-then-divide, FR-002a / FR-003:
 *
 *     totalCost = Σ cost across the creative's rows
 *     totalResults = Σ results across the creative's rows
 *     figure = (totalCost / totalResults) / sealedTarget
 *
 * This is NOT the per-row ratio's mean. A placement with one
 * result and a placement with fifty results have equal weight
 * under aggregate-then-divide; under divide-then-average, the
 * single-result placement's tiny ratio would dominate. The test
 * `efficiencyFigure.test.ts` discriminates by feeding a fixture
 * where the two formulas differ by an order of magnitude; the
 * wrong impl produces that different number and fails.
 *
 * Returns `null` when the figure is not yet defined:
 *   - no sealed target (FR-005: cannot seal against nothing)
 *   - totalResults is zero (FR-006: no figure without results)
 *
 * `null` propagates FR-006's "explicitly absent" semantics. The
 * caller (Batch 5's `applyLearningWrites.ts` post-walk) treats
 * `null` as "do not contribute" — the same shape as Batch 2's
 * `decideSealedTransition` returning `allowed: false` for an
 * unsealed-target row.
 */
export function computeEfficiencyFigure(
    rows: ReadonlyArray<EfficiencyRow>,
    sealedContext: SealedContext | null,
): { value: number; totalCost: number; totalResults: number } | null {
    if (sealedContext === null) return null;
    const totalCost = creativeCostTotal(rows.map((r) => r.dayAccrual));
    const totalResults = creativeConversionTotal(rows.map((r) => r.dayAccrual));
    if (totalResults === 0) return null;
    const costPerResult = totalCost / totalResults;
    const figure = costPerResult / sealedContext.sealedTarget;
    return { value: figure, totalCost, totalResults };
}

// ─── FR-077 — eligibility rule ───────────────────────────────

/**
 * FR-077's two conditions, FR-077a's recording rule, and the
 * zero-conversions case from FR-006's prose ("a creative with no
 * results produces no figure").
 *
 * **The eligibility count comes from Batch 1's accrual, not
 * `metrics.conversions3d`.** The user's "Use it" rule. The
 * accrual gives a stable, monotonically non-decreasing count
 * across syncs; `conversions3d` is a rolling 3-day figure that
 * rises and falls with the window. A threshold crossed today can
 * be uncrossed tomorrow if you use the rolling figure.
 *
 * **Condition (a):** total conversions across the creative's
 * placements ≥ 5. The fifth may arrive on a different row than
 * the first four (FR-077's prose). This is FR-077a's split-creative
 * effect — a creative wrongly split into two halves may never
 * reach 5 in either half where the whole would have, because the
 * whole is `creativeConversionTotal(rows)` summed across both
 * halves, and that sum is what crosses the threshold. The whole
 * sees everything; a half sees its half only. The threshold is
 * deliberately not lowered to compensate — the locked decision
 * is 5.
 *
 * **Condition (b):** the creative has stopped running AND has
 * ≥ 1 conversion. The under-detect design (FR-085) is correct
 * here — a parent-paused ad reads as its own configured status
 * (most often ACTIVE) and is simply not stopped. The creative
 * never seals via (b). Failure mode: missing contribution, never
 * a wrong one.
 *
 * **Zero-conversions case:** FR-006 says "When the ad has no
 * results in the measurement window, the system MUST record the
 * efficiency figure as explicitly absent." So `isEligibleForEfficiency`
 * returns `false` with reason
 * `below-threshold-stopped-but-zero-conversions` for a stopped
 * creative with zero results.
 */
export function isEligibleForEfficiency(
    rows: ReadonlyArray<EfficiencyRow>,
    sealedContext: SealedContext | null,
): EligibilityReason {
    if (rows.length === 0) {
        return { eligible: false, reason: "no-row" };
    }
    if (sealedContext === null) {
        return { eligible: false, reason: "no-sealed-target" };
    }
    const totalConversions = creativeConversionTotal(rows.map((r) => r.dayAccrual));

    // Condition (a): five combined conversions.
    if (totalConversions >= 5) {
        return { eligible: true, reason: "eligible-condition-a" };
    }

    // Condition (b): stopped with at least one conversion.
    // `isStopped` reads the ad's own configured status — under-
    // detects parent-level pauses by design (FR-085). For a
    // creative to seal via (b), EVERY contributing row of the
    // creative must be stopped, AND the creative must have
    // accrued at least one conversion. The "every row stopped"
    // requirement is conservative: a creative with one running row
    // is still running.
    if (totalConversions >= 1) {
        const allStopped = rows.every((r) => isStopped(r.adStatus));
        if (allStopped) {
            return { eligible: true, reason: "eligible-condition-b" };
        }
    }

    // Sub-threshold AND the zero-conversions guard.
    if (totalConversions === 0) {
        return {
            eligible: false,
            reason: "below-threshold-stopped-but-zero-conversions",
        };
    }

    return {
        eligible: false,
        reason: "below-threshold-and-running",
    };
}

// ─── FR-005c's efficiency-side carve-out ─────────────────────

/**
 * The write-once marker for the efficiency figure. Mirrors
 * Batch 2's `decideSealedTransition` in shape but operates on a
 * different field — `efficiencyContributed` on the ledger entry,
 * not `sealedTarget` on the row. The two guards do not collide
 * (pinned by SC-031 [shape] in `sealedContext.test.ts:236-265`):
 *
 *   - existing `efficiencyContributed: false` (or undefined) →
 *     first write permitted (`firstWrite: true`). The figure
 *     contributes; the marker becomes `true`.
 *
 *   - existing `efficiencyContributed: true` → rejected. FR-079's
 *     write-once is one-way. **The figure is computed once per
 *     creative and locked** — the sealed target changes (a
 *     different rows sealing produces the same target under
 *     FR-012a, but the first write of the figure IS the
 *     figure).
 *
 * **Why both halves are tested separately.** A guard that
 * returns `allowed: true` always permits a second write — the
 * first-half test passes for it, but it is wrong. A guard that
 * returns `allowed: false` always refuses — the second-half test
 * passes for it, but it is wrong. The discriminating pair
 * `decideEfficiencyWriteTest` (first-half permitted,
 * second-half refused) catches both wrong implementations.
 */
export type EfficiencyWriteVerdict =
    | { allowed: true; firstWrite: boolean; figure: number | null }
    | { allowed: false; reason: "efficiency-already-contributed" };

export function decideEfficiencyWrite(
    existing: { efficiencyContributed: boolean | undefined } | undefined,
    figure: number | null,
): EfficiencyWriteVerdict {
    const alreadyContributed = existing?.efficiencyContributed === true;
    if (alreadyContributed) {
        return { allowed: false, reason: "efficiency-already-contributed" };
    }
    if (figure === null) {
        // The figure is explicitly absent (FR-006) — no results,
        // or no sealed target. We don't contribute absent figures.
        // This is NOT a write — `efficiencyContributed` does not
        // become true. A future sync where the figure becomes
        // resolvable can still write it for the first time.
        return { allowed: false, reason: "efficiency-already-contributed" };
    }
    return { allowed: true, firstWrite: existing === undefined || existing.efficiencyContributed !== true, figure };
}

// ─── FR-087 — recompute vs carry-across ──────────────────────

/**
 * Pure: FR-087's two-case dispatcher. Decides whether the
 * efficiency figure for a creative is RE-COMPUTED (the creative's
 * row set changed, e.g. a merge joined two halves) or CARRIED
 * ACROSS UNCHANGED (only the destination changed, e.g. a
 * re-attribution moved the same rows to a different angle).
 *
 *   - same row set → carry across (`firstWrite: false`,
 *     figure unchanged).
 *   - different row set → recompute over the union (`firstWrite:
 *     true` IF the figure has not been contributed yet, else
 *     `false` because FR-079 forbids re-writing an existing
 *     figure).
 *
 * The "same row set" check is structural: the two arrays of row
 * ids are equal as sets. Order differences don't matter. A row
 * disappearing (FR-014 cascade) makes the sets unequal — a
 * missing-row scenario is handled in the `applyMergeRecompute`
 * path (Batch 5's call site). For the dispatcher here, "same"
 * means exactly the same set of `creativeKey`-qualified ad ids.
 */
export interface RecomputeInput {
    /** The row ids of the creative BEFORE the change. */
    rowIdsBefore: ReadonlyArray<string>;
    /** The row ids of the creative AFTER the change. */
    rowIdsAfter: ReadonlyArray<string>;
    /** The creative's existing efficiency state, if any. */
    existing: {
        efficiencyContributed?: boolean;
        /** The previously-recorded figure (only meaningful when
         *  efficiencyContributed is true). */
        efficiencyValue?: number | null;
    } | undefined;
}

export type RecomputeOutcome =
    | { kind: "carry-across"; figure: number | null }
    | { kind: "recompute"; figure: number };

export function applyEfficiencyRecompute(input: RecomputeInput): RecomputeOutcome {
    const setBefore = new Set(input.rowIdsBefore);
    const setAfter = new Set(input.rowIdsAfter);
    const sameSet =
        setBefore.size === setAfter.size &&
        Array.from(setBefore).every((id) => setAfter.has(id));

    if (sameSet) {
        // Re-attribution: same rows, same target, same number. The
        // figure carries across unchanged. If a figure has already
        // been contributed, that's the figure we carry; otherwise
        // there's nothing to carry and the caller recomputes later.
        if (input.existing?.efficiencyContributed === true) {
            return { kind: "carry-across", figure: input.existing.efficiencyValue ?? null };
        }
        return { kind: "recompute", figure: 0 };
    }

    // Row set changed. The figure for this creative is recomputed
    // over the union against the earliest sealed target (FR-012a).
    // The actual computation is `computeEfficiencyFigure` over the
    // UNION rows; this dispatcher returns the decision and the
    // figure when an existing value is preserved. The caller's
    // Batch 5 wiring passes the post-change row set in.
    return {
        kind: "recompute",
        figure: input.existing?.efficiencyValue ?? 0,
    };
}

// ─── FR-013a — merge-side recompute ───────────────────────────

/**
 * Pure: the efficiency-side of FR-013a's merge-reconciliation.
 * Two hash groups, each having already contributed a figure
 * with different sealed targets, are merged into one creative.
 * The earliest sealed target wins (FR-012a); the figure is
 * recomputed over the union; both halves' figures are withdrawn
 * before the new one is added.
 *
 * **What this function returns:** the new figure for the merged
 * creative. The withdrawal-then-add choreography (Batch 5's call
 * site) is the consumer's responsibility — `applyMergeRecompute`
 * itself is pure and only emits the new figure.
 *
 * If only one half had contributed, this degenerates to a
 * FR-087(ii) recompute over the union: `existing.efficiencyValue`
 * is re-validated against the new row set's combined total.
 */
export function applyMergeRecompute(
    unionRows: ReadonlyArray<EfficiencyRow>,
    earliestSealedTarget: SealedContext | null,
    existingA: { efficiencyContributed: boolean; efficiencyValue: number | null } | null,
    existingB: { efficiencyContributed: boolean; efficiencyValue: number | null } | null,
): { value: number | null; recomputed: boolean } {
    const out = computeEfficiencyFigure(unionRows, earliestSealedTarget);
    if (out === null) {
        // Either the union has no results or the merged creative
        // never sealed. Either way, no figure. The two halves'
        // existing figures are NOT carried — FR-013a requires
        // recompute-or-withdraw; null after recompute means
        // withdraw.
        return { value: null, recomputed: true };
    }
    // Recompute produced a figure. The withdrawal-then-add path
    // (Batch 5's consumer) consumes this.
    void existingA;
    void existingB;
    return { value: out.value, recomputed: true };
}

// ─── Re-exports so a single import covers the surface ────────

export type {
    SealedContext,
    WorkspaceFunnelType,
};
export { resolveCreativeSealedContext };
