// functions/src/learning/contributionLedger.ts — T017 `decideContribution`
// ══════════════════════════════════════════════════════════════════════
// PURE module. The idempotency mechanism that makes FR-018 hold:
//
//   > Processing the same sync payload any number of times MUST
//   > leave the stored learning records in exactly the state
//   > produced by processing it once. No ad may ever be counted
//   > twice.
//
// The contract per `contracts/contributionLedger.md`:
//
//   | recorded    | desired       | outcome           |
//   |-------------|---------------|-------------------|
//   | absent      | present       | add               |
//   | present     | identical     | no-op             |
//   | present     | differs       | withdraw then add |
//   | present     | absent        | withdraw only     |
//
// This module exports the DECISION. The actual withdrawal and
// addition — the deltas to apply to the aggregate — live in
// `aggregateDelta.ts` (T018).

import type { ContributionLedgerEntry } from "./types.js";

// ─── Inputs ──────────────────────────────────────────────────────

/**
 * The contribution an ad WOULD make this sync. `null` means the ad
 * is no longer eligible (deleted, de-listed, or — for failed-read
 * ads per FR-070 — its prior contribution is unsafe to use).
 */
export interface Contribution {
    angleKey: string | null;
    patternKey: string | null;
    bucket: "conversion" | "other";
    geoTier: string;
    audienceType: string;
    /** The values this contribution would add to the aggregates. */
    contributedValues: {
        ctrLink: number;
        cpm: number;
        verdictMark: string;
        // Catch-all for additional measures the aggregator tracks.
        [key: string]: unknown;
    };
    /** The measurement inputs that produced the contribution. */
    measurementInputs: Record<string, unknown>;
}

// ─── Outputs ──────────────────────────────────────────────────────

export type ContributionDecision =
    | { kind: "add"; contribution: Contribution }
    | { kind: "noop" }
    | {
        kind: "withdraw_then_add";
        withdraw: ContributionLedgerEntry;
        contribute: Contribution;
    }
    | { kind: "withdraw_only"; withdraw: ContributionLedgerEntry };

// ─── Equality ─────────────────────────────────────────────────────

/**
 * Two contributions are "identical" (FR-017's no-op case) iff every
 * field matches. `contributedValues` and `measurementInputs` use deep
 * equality via JSON canonicalisation. This is the no-op decision's
 * criterion — anything else triggers withdraw-then-add.
 */
export function contributionsEqual(
    a: ContributionLedgerEntry,
    b: Contribution,
): boolean {
    if (a.angleKey !== b.angleKey) return false;
    if (a.patternKey !== b.patternKey) return false;
    if (a.bucket !== b.bucket) return false;
    if (a.geoTier !== b.geoTier) return false;
    if (a.audienceType !== b.audienceType) return false;
    // contributedValues: deep equality by JSON canonicalisation.
    if (JSON.stringify(a.contributedValues) !== JSON.stringify(b.contributedValues)) return false;
    if (JSON.stringify(a.measurementInputs) !== JSON.stringify(b.measurementInputs)) return false;
    return true;
}

// ─── The decision ───────────────────────────────────────────────

/**
 * Decide what to do given a desired contribution and the recorded
 * ledger entry for the same creative.
 *
 *   - recorded absent, desired present → **add**.
 *   - recorded present, identical to desired → **no-op**.
 *   - recorded present, differs from desired → **withdraw then add**.
 *   - recorded present, desired absent → **withdraw only**.
 *
 * `desired === null` represents an ad that should contribute nothing
 * this sync (de-listed, deleted cascade, or FR-070 failed read).
 */
export function decideContribution(
    desired: Contribution | null,
    recorded: ContributionLedgerEntry | null,
): ContributionDecision {
    if (recorded === null && desired !== null) {
        return { kind: "add", contribution: desired };
    }
    if (recorded !== null && desired === null) {
        return { kind: "withdraw_only", withdraw: recorded };
    }
    if (recorded !== null && desired !== null) {
        if (contributionsEqual(recorded, desired)) {
            return { kind: "noop" };
        }
        return {
            kind: "withdraw_then_add",
            withdraw: recorded,
            contribute: desired,
        };
    }
    // Both null: nothing to do. Distinct from noop (which means "same
    // ad contributed identically twice"). We surface noop here too
    // so callers can treat it uniformly.
    return { kind: "noop" };
}
