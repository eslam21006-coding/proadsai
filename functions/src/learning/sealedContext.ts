// functions/src/learning/sealedContext.ts — Phase 4, T028–T033
// ══════════════════════════════════════════════════════════════════════
// PURE module. The sealed evaluation context that locks a creative's
// judgement at the moment of first measurement against a resolvable
// target.
//
// Why a separate module. The contribution ledger carries
// *what the row contributed*; this module carries *what was true
// when the contribution was decided*. The two are written in the
// same per-row merge (FR-007) but live as separate field sets on
// `AdDoc` so the operational status can keep recomputing against
// current economics (FR-009) without ever overwriting the sealed
// values (FR-005c, FR-010).
//
// Three families of pure functions:
//
//   1. `resolveSealedContext` — given this sync's resolved funnel
//      settings (already loaded once per sync at `shared.ts:746-784`)
//      and the workspace's resolved funnel type, decide whether the
//      sealed fields can be written THIS sync and what their values
//      are. `null` means the target is unresolvable; the row stays
//      PROVISIONAL (FR-005b). This single function is the consumer of
//      `getEffectiveTarget` for the sealing path.
//
//   2. `decideSealedTransition` — the FR-005c guard. Reads the
//      existing ad doc's sealed fields and the new resolution and
//      returns either the new values to write (with `didTransition`
//      indicating whether PROVISIONAL → SEALED happened) or a refusal
//      with reason. The guard tests the TRANSITION, not the flag —
//      see the doc block on the function below.
//
//   3. The aggregate-side functions used by Batch 3's eligibility /
//      efficiency figure:
//      - `resolveCreativeSealedContext` — FR-012a's "one target per
//        creative" derivation. The earliest-sealing row across the
//        creative's rows is the authority. Tie-breaking is
//        deliberately NOT specified; within a single evaluation every
//        row resolving the same `derived` payload seals the same
//        target, so the rule only bites across syncs.
//      - `deriveCreativeState` — FR-036c. SEALED if any row is SEALED
//        (carries `sealedTarget` non-null); PROVISIONAL only when every
//        row is PROVISIONAL.
//
// Why the functions are pure. The seal reads are account-level
// (the workspace's settings doc is loaded once per sync, before the
// per-ad loop). The per-row write adds zero Firestore reads. The
// resolver `getEffectiveTarget` is itself pure (`cpaEconomics.ts:476`)
// — takes a `DerivedTargets` and returns a number or null. Putting the
// seal decision in a pure module means the FR-005c guard is testable
// without stubs and can be exercised against wrong implementations
// directly.

import { getEffectiveTarget, type DerivedTargets } from "../cpaEconomics.js";

// ─── Types ─────────────────────────────────────────────────

/**
 * The workspace's resolved funnel-type bucket. Mirrors the discriminator
 * in `learningAggregates.ts` and `workspaceFunnelType` in `shared.ts`.
 * `unknown` is the bucket when no settings doc was reachable; the seal
 * path treats it as not sealable (FR-005b extended — without a
 * settings doc the target cannot be resolvable).
 */
export type WorkspaceFunnelType =
    | "paid_event"
    | "paid_product"
    | "free_webinar"
    | "lead_magnet_call"
    | "unknown";

/**
 * The sealed values this sync would write. `sealedAt` is the moment
 * of sealing in epoch ms — NOT the moment the ad row was created.
 * Late-sealing rows inherit their creative's `sealedAt` via FR-012a,
 * not their own `sealedAt` (a row first appearing after its siblings
 * sealed inherits the creative-level target; it does not seal a new
 * one against whatever target is resolvable today).
 */
export interface SealedContext {
    sealedTarget: number;
    sealedFunnelType: WorkspaceFunnelType;
    sealedAt: number;
}

/**
 * The fields the per-row write carries. Optional individually so the
 * worker can use the same `AdDoc` shape whether or not a seal happened
 * this sync (FR-070's field-level discrimination pattern: a failed-
 * transition write omits the sealed fields and merge keeps the prior
 * values).
 */
export interface AdSealFields {
    sealedTarget?: number | null;
    sealedFunnelType?: WorkspaceFunnelType | null;
    sealedAt?: number | null;
    contributionState?: "PROVISIONAL" | "SEALED";
}

/**
 * The verdict of the FR-005c guard. The `didTransition` flag is the
 * value the ledger entry needs to record whether THIS sync performed
 * the PROVISIONAL → SEALED transition (vs an idempotent re-write).
 */
export type SealTransitionVerdict =
    | { allowed: true; fields: AdSealFields; didTransition: boolean }
    | { allowed: false; reason: "sealed-target-already-set-and-differs" };

// ─── 1. Resolve this sync's sealed context (FR-005b) ────────

/**
 * Decide what the sealed fields would be THIS sync. Returns `null`
 * when the target is not resolvable — the row stays PROVISIONAL.
 *
 * Rejection paths (any of which produces `null`):
 *   - `derived` is null (no settings doc loaded this sync).
 *   - `derived.economicsVersion !== ECONOMICS_VERSION` (R-1 version
 *     gate inside `getEffectiveTarget`; FR-041).
 *   - `workspaceFunnelType === "unknown"` (no settings doc exposed a
 *     funnel bucket; the seal cannot record an "unknown" type
 *     without a target).
 *
 * Note — tie behaviour within a single sync. Multiple rows sealing in
 * the same evaluation all receive the same `sealedAt` (the sync's
 * `nowMs`) because target resolvability is account-level. The spec
 * is explicit that no tie-breaking machinery is introduced — FR-012a's
 * "earliest-sealing row among all rows now belonging to the creative"
 * rule only bites across syncs.
 */
export function resolveSealedContext(
    derived: DerivedTargets | null,
    workspaceFunnelType: WorkspaceFunnelType,
    nowMs: number,
): SealedContext | null {
    if (derived === null) return null;
    if (workspaceFunnelType === "unknown") return null;
    const target = getEffectiveTarget(derived);
    if (target === null) return null;
    return {
        sealedTarget: target,
        sealedFunnelType: workspaceFunnelType,
        sealedAt: nowMs,
    };
}

// ─── 2. FR-005c guard (the transition, not the flag) ─────────

/**
 * Pure: the FR-005c one-way PROVISIONAL → SEALED guard. Returns
 * either the new sealed fields (with `didTransition` indicating
 * whether a transition happened) or a refusal.
 *
 * Why this tests the TRANSITION, not the flag. The requirement is
 * that the transition happens once and never reverses. A guard
 * written as `if (existingAdDoc.contributionState === "SEALED")
 * return` permits an idempotent same-target re-write and rejects a
 * meaningful transition only if a different target is offered — so
 * the test "the first seal is permitted" passes against the wrong
 * guard. The guard below passes both halves:
 *
 *   - existing `sealedTarget` is null/absent → PROVISIONAL.
 *     `didTransition: true`. The new sealed fields are written.
 *
 *   - existing `sealedTarget` equals the new target → idempotent.
 *     `didTransition: false`. The fields carry through unchanged.
 *
 *   - existing `sealedTarget` is set AND differs from the new
 *     target → refused. The PROVISIONAL → SEALED transition has
 *     already happened, and the seal is one-way. FR-005c. The
 *     per-row write omits the sealed fields (FR-070) and the prior
 *     values stand.
 *
 *   - existing `sealedTarget` is set AND `newResolution` is null
 *     → refused with the same reason (the target is unresolvable
 *     this sync; the seal that already happened cannot be re-opened
 *     to a different value, including "clear it").
 *
 * `didTransition` exists so the ledger entry can record whether THIS
 * sync performed the seal. A `false` is still a normal write — just
 * idempotent — and does not generate an error event.
 *
 * The SC-031 carve-out (the FIRST efficiency-figure write onto an
 * already-SEALED contribution is permitted) lives on the EFFICIENCY
 * field's write path, not here. This guard governs the SEAL fields.
 * The two are deliberately separate (FR-005e).
 */
export function decideSealedTransition(
    existing: {
        sealedTarget?: number | null;
        sealedAt?: number | null;
        sealedFunnelType?: WorkspaceFunnelType | null;
    } | undefined,
    newResolution: SealedContext | null,
): SealTransitionVerdict {
    const existingTarget = existing?.sealedTarget;
    const existingAt = existing?.sealedAt;

    const wasSealed = existingTarget !== undefined && existingTarget !== null;
    const newIsResolved = newResolution !== null;

    // Rejected case 1: an unsealed target and a different one offered —
    // FR-005c. A row that was sealed against one target cannot be
    // re-sealed against another; the seal is one-way.
    if (wasSealed && newIsResolved && existingTarget !== newResolution.sealedTarget) {
        return { allowed: false, reason: "sealed-target-already-set-and-differs" };
    }
    // Rejected case 2: an existing seal cannot be cleared by an
    // unresolvable target this sync. The prior seal stands; this sync
    // contributes nothing on the sealed axis.
    if (wasSealed && !newIsResolved) {
        return { allowed: false, reason: "sealed-target-already-set-and-differs" };
    }

    if (!wasSealed && newIsResolved) {
        // PROVISIONAL → SEALED transition. didTransition: true so the
        // ledger entry can record the seal as a state event.
        return {
            allowed: true,
            didTransition: true,
            fields: {
                sealedTarget: newResolution.sealedTarget,
                sealedFunnelType: newResolution.sealedFunnelType,
                sealedAt: newResolution.sealedAt,
                contributionState: "SEALED",
            },
        };
    }

    if (wasSealed && newIsResolved && existingTarget === newResolution.sealedTarget) {
        // Idempotent re-write. The fields are unchanged; the worker
        // can still write them (preserves the persistedSealedAt against
        // race conditions where an external update touched it) but
        // no transition happened. If the existing projection carries
        // a sealedFunnelType, carry it through; otherwise re-resolve
        // from the new resolution (the two are the same when a target
        // is resolvable).
        return {
            allowed: true,
            didTransition: false,
            fields: {
                sealedTarget: existingTarget,
                sealedFunnelType: existing?.sealedFunnelType
                    ?? newResolution.sealedFunnelType,
                sealedAt: existingAt ?? newResolution.sealedAt,
                contributionState: "SEALED",
            },
        };
    }

    // wasSealed === false AND newIsResolved === false — the row
    // remains PROVISIONAL. Operational fields are still written by
    // the worker; the sealed axis contributes nothing this sync.
    return {
        allowed: true,
        didTransition: false,
        fields: {},
    };
}

// ─── 3. FR-012a single-sealed-target-per-creative ────────────

/**
 * Pure: aggregate the sealed fields across a creative's rows into
 * the single sealed target that the creative carries, per FR-012a.
 *
 * The rule — "the earliest-sealing row among all rows now belonging
 * to the creative is the authority" — has no tie-breaking within a
 * single evaluation, because every row sealing in that evaluation
 * resolves the same `derived` payload. Tie-breaking machinery is
 * deliberately not introduced (the spec is explicit about this);
 * the rule only bites across syncs, where the account's target may
 * genuinely have changed.
 *
 * `null` returns:
 *   - no row has a sealed target (the creative is fully PROVISIONAL);
 *   - the input row set is empty.
 *
 * Inputs are read-only projections of the row document's sealed
 * fields. The function never reaches into Firestore.
 */
export function resolveCreativeSealedContext(
    rows: ReadonlyArray<{
        sealedTarget?: number | null;
        sealedAt?: number | null;
        sealedFunnelType?: WorkspaceFunnelType | null;
    }>,
): SealedContext | null {
    let earliest: { target: number; sealedAt: number; funnelType: WorkspaceFunnelType } | null = null;
    for (const row of rows) {
        const target = row.sealedTarget;
        if (target === undefined || target === null) continue;
        const sealedAt = row.sealedAt;
        if (sealedAt === undefined || sealedAt === null) continue;
        // Reject the deterministic-shape mismatch of a corrupted record;
        // a sealedTarget without a usable sealedAt cannot contribute to
        // FR-012a's ordering. The seal that wrote it was missing a
        // required field; treat it as unresolvable here.
        const funnelType = row.sealedFunnelType;
        if (funnelType === undefined || funnelType === null) continue;
        if (earliest === null || sealedAt < earliest.sealedAt) {
            earliest = { target, sealedAt, funnelType };
        }
    }
    if (earliest === null) return null;
    return {
        sealedTarget: earliest.target,
        sealedFunnelType: earliest.funnelType,
        sealedAt: earliest.sealedAt,
    };
}

// ─── 4. FR-036c creative-state derivation ──────────────────

/**
 * Pure: the creative's contribution state derived from its rows.
 * SEALED if ANY row is SEALED (carries a non-null `sealedTarget`);
 * PROVISIONAL only while EVERY row is PROVISIONAL.
 *
 * The any-row rule is load-bearing. FR-005c makes the transition
 * one-way: once a row has sealed, the resolvable target that made
 * it seal is recorded and cannot be un-recorded. An all-rows rule
 * would let a new placement appearing during a settings gap drag an
 * already-sealed creative back toward PROVISIONAL — the reverse
 * transition FR-005c forbids.
 *
 * The mixed-state shape arises in exactly one scenario: a row first
 * appearing during a settings gap, after its siblings have sealed.
 * Uncommon but reachable; this function handles it without an
 * intermediate "MIXED" state because the binary (SEALED | PROVISIONAL)
 * is sufficient — any row SEALED wins, and PROVISIONAL is the
 * conservative default only when no row has.
 *
 * Empty row set returns PROVISIONAL — a creative with no rows has
 * no evidence either way, and the conservative answer is what the
 * owner would want to see.
 */
export function deriveCreativeState(
    rows: ReadonlyArray<{ sealedTarget?: number | null }>,
): "PROVISIONAL" | "SEALED" {
    for (const row of rows) {
        const t = row.sealedTarget;
        if (t !== undefined && t !== null) {
            return "SEALED";
        }
    }
    return "PROVISIONAL";
}
