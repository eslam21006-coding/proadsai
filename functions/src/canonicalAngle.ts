// functions/src/canonicalAngle.ts — Phase 14 Layer 4b/7 shared alias resolver
// ═══════════════════════════════════════════════════════════
// PURE module. Centralized resolver for "hook angle" identifiers.
//
// Two distinct sources of hook-angle strings exist in the codebase:
//
//   1. The CANONICAL 10 cold-hook angle IDs that the generation pipeline
//      uses (e.g. `statistics`, `urgency`, `future_based`). These are the
//      IDs recognized by `gazeMap.ts`, `expressionMap.ts`, and the broader
//      "cold hook" concept taxonomy. They appear in user-facing UI as the
//      label text for the angle buttons (Step 1 / Step 2).
//
//   2. LEGACY ALIASES that older runs / older inputs may carry. Three are
//      currently in scope (research §G):
//
//        shocking_stat       → statistics
//        fear_of_missing_out → urgency
//        future_pacing       → future_based
//
//      The same three aliases appear in BOTH `gazeMap.ts` (Phase 19) and
//      `expressionMap.ts` (Phase 28) as separate `HOOK_ALIAS_MAP`
//      constants. This module consolidates them so the Phase 14 learning
//      aggregates (US5), dashboard (US6), hook-angle icons (US7), and RAG
//      gating (US8) all resolve aliases consistently.
//
// CRITICAL INVARIANT: this module MUST mirror the alias map in
// `gazeMap.ts` and `expressionMap.ts`. If a new alias is added to those
// mappers, it MUST also be added here. The unit test asserts that the
// three source-mapper aliases are all present here (forward-compat
// sentinel).
//
// Spec §6 — "Aliases resolved to canonical before aggregation"
// research §G — "Aliases resolved to canonical before aggregation".
// ═══════════════════════════════════════════════════════════

import { getKnownHookAngleIds as getGazeKnownHookAngleIds } from "./gazeMap.js";
import { getKnownHookAngleIds as getExpressionKnownHookAngleIds } from "./expressionMap.js";

// Note: gazeMap / expressionMap's `HOOK_ALIAS_MAP` is module-private. We
// re-declare the same three aliases here and assert identity via the
// runtime invariant check below (mirroring Phase 19/28's `HOOK_ALIAS_MAP`
// is a documented invariant — see module header).

// ─── Canonical 10 ─────────────────────────────────────────────
//
// Re-exported from `gazeMap.ts` so all Phase 14 modules read from one
// place. The two source mappers (`gazeMap.ts` / `expressionMap.ts`) MUST
// keep their lists identical; this module asserts that invariant at
// module load (cheap, side-effect-free, will throw if anyone drifts).

export const ALL_CANONICAL_HOOK_ANGLES: ReadonlyArray<string> = (() => {
    const gazeIds = getGazeKnownHookAngleIds();
    const expressionIds = getExpressionKnownHookAngleIds();
    if (gazeIds.length !== expressionIds.length || !gazeIds.every((id) => expressionIds.includes(id))) {
        throw new Error(
            `canonicalAngle: gazeMap and expressionMap declare different canonical hook-angle sets ` +
            `(gaze=${gazeIds.length}, expression=${expressionIds.length}). Update one of them — ` +
            `the two must stay in lockstep per the established Phase 19/28 invariant.`,
        );
    }
    return [...gazeIds].sort();
})();

/**
 * The Phase 14 hook-alias map. MUST mirror the entries in
 * `gazeMap.ts` / `expressionMap.ts` `HOOK_ALIAS_MAP`. The alias TARGETS
 * MUST exist in `ALL_CANONICAL_HOOK_ANGLES`.
 */
const PHASE14_HOOK_ALIAS_MAP: Readonly<Record<string, string>> = {
    shocking_stat: "statistics",
    fear_of_missing_out: "urgency",
    future_pacing: "future_based",
};

for (const [alias, canonical] of Object.entries(PHASE14_HOOK_ALIAS_MAP)) {
    if (!ALL_CANONICAL_HOOK_ANGLES.includes(canonical)) {
        throw new Error(
            `canonicalAngle: alias '${alias}' → '${canonical}' but '${canonical}' ` +
            `is not in the canonical 10 (declared by gazeMap.ts / expressionMap.ts).`,
        );
    }
}

// ─── Resolvers ────────────────────────────────────────────────

/**
 * Resolve an arbitrary hook-angle string to a CANONICAL canonical hook
 * angle id. Three rules:
 *
 *   1. If the input is empty/null/non-string → returns the fail-safe
 *      default `urgency` (the most-used angle in the existing creative
 *      memory data; conservative choice).
 *   2. If the input is a legacy alias (e.g. `shocking_stat`) → returns
 *      the canonical target (`statistics`).
 *   3. If the input is already a canonical id → returns it unchanged.
 *   4. Otherwise (a fully unknown id) → returns the input unchanged so
 *      callers can decide how to bucket it. Learning aggregates will
 *      surface it under its raw id; UI is responsible for not showing
 *      unknown ids to users (gazeMap's fallback covers the visual side).
 *
 * Pure — no side effects, deterministic.
 */
export function resolveCanonicalAngle(
    input: unknown,
    failSafe: string = "urgency",
): string {
    if (typeof input !== "string") return failSafe;
    const trimmed = input.trim();
    if (trimmed === "") return failSafe;
    if (Object.prototype.hasOwnProperty.call(PHASE14_HOOK_ALIAS_MAP, trimmed)) {
        return PHASE14_HOOK_ALIAS_MAP[trimmed];
    }
    return trimmed;
}

/**
 * Returns `true` iff the input resolves to a CANONICAL canonical hook
 * angle id (one of the 10 in `ALL_CANONICAL_HOOK_ANGLES`). Aliases are
 * resolved first; unknown / empty / null / non-string inputs resolve to
 * `false` (NOT `resolveCanonicalAngle`'s fail-safe default — the
 * "is-canonical" predicate is stricter than the "resolve" path).
 */
export function isCanonicalAngle(input: unknown): boolean {
    if (typeof input !== "string") return false;
    const trimmed = input.trim();
    if (trimmed === "") return false;
    // Resolve aliases (e.g. shocking_stat → statistics). Unknown inputs
    // are returned unchanged by resolveCanonicalAngle — which means they
    // will not be in the canonical list and the predicate returns false.
    const resolved = PHASE14_HOOK_ALIAS_MAP[trimmed] ?? trimmed;
    return ALL_CANONICAL_HOOK_ANGLES.includes(resolved);
}

/**
 * Map of every known alias to its canonical target. Useful for debug
 * dumps and the dashboard's "alias audit" surface.
 */
export function getHookAliasMap(): Readonly<Record<string, string>> {
    return { ...PHASE14_HOOK_ALIAS_MAP };
}

/**
 * Inverse of `getHookAliasMap`: returns the list of canonical hook
 * angle ids that have at least one alias mapping to them.
 */
export function getCanonicalAnglesWithAliases(): ReadonlyArray<string> {
    const targets = new Set<string>(Object.values(PHASE14_HOOK_ALIAS_MAP));
    return Array.from(targets).sort();
}