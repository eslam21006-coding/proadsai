// functions/src/varianceValidator.ts — Phase 20 Variance Validator module
// Pure, deterministic, NO AI call (Contract B7). Compares three sibling
// `ConceptBrief` slots on their normalized `varianceAxes` tokens and
// returns a `VarianceValidationResult` in well under 5ms.
//
// Behavioral guarantees (per `contracts/varianceValidator.contract.md`):
//   - B1: normalized exact match (lowercase + trim) — never fuzzy.
//   - B2: balanced mode blocks when metaphor duplicates in ≥2 of 3,
//          layout duplicates across all 3, OR headline duplicates
//          across all 3.
//   - B3: conservative mode blocks only when metaphor duplicates across
//          all 3 (forward-compat; not exercised live).
//   - B4: aggressive mode = balanced + `backgroundComplexity` duplicate
//          across all 3 (forward-compat; not exercised live).
//   - B5: fallback slots expose no `varianceAxes`; they are excluded
//          from comparison and can never create or satisfy a duplicate.
//   - B6: `passed === false` iff at least one `block` violation exists;
//          `warn` never flips `passed` (FR-017).
//   - B7: deterministic + no I/O + no randomness + no model call.
//   - B8: each violation carries the exact `duplicateConceptIndices`
//          so the orchestrator can target only the offending concepts.
//
// Mirrors the Phase 19/28 pure-mapper pattern: no Firebase / no Gemini
// SDK imports — the orchestrator (`index.ts`) passes in already-resolved
// `ConceptBrief | ConceptDirectorFallback[]` slots.

import type { VarianceMode } from "./conceptDirector.js";
import type { ConceptBrief, ConceptDirectorFallback } from "./conceptDirector.js";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

/**
 * Severity of a single variance violation. `block` flips `passed` to
 * false and may trigger a retry (C4). `warn` is recorded but never
 * flips `passed` and never triggers a retry (FR-017).
 */
export type ViolationSeverity = "block" | "warn";

/**
 * The four variance axes the validator can score. `metaphor`, `layout`,
 * `headline` are the three balanced-mode axes. `backgroundComplexity`
 * is added in `aggressive` mode (B4) — defined here for forward-compat
 * so the validator's data structure covers all four axes even though
 * only the first three ship live.
 */
export type VarianceAxis = "metaphor" | "layout" | "headline" | "backgroundComplexity";

export interface VarianceViolation {
    axis: VarianceAxis;
    duplicateConceptIndices: number[];
    severity: ViolationSeverity;
}

export interface VarianceValidationResult {
    passed: boolean;
    violations: VarianceViolation[];
}

// ═══════════════════════════════════════════════════════════
// NORMALIZATION (Contract B1)
// ═══════════════════════════════════════════════════════════

/**
 * Normalize a variance axis token for comparison. Pure: lowercase +
 * trim surrounding whitespace. NEVER strips interior characters — a
 * token is equal iff its normalized form is byte-identical (Contract
 * B1, "normalized exact match", not fuzzy / semantic).
 */
export function normalizeToken(token: string): string {
    if (typeof token !== "string") return "";
    return token.toLowerCase().trim();
}

// ═══════════════════════════════════════════════════════════
// BRIEF SLOTS — ADAPTER (Contract B5: fallbacks excluded)
// ═══════════════════════════════════════════════════════════

/**
 * Return only the varianceAxes tokens of a brief slot. A `ConceptBrief`
 * returns its tokens; a `ConceptDirectorFallback` returns an empty
 * record so the validator skips the slot entirely (B5 — a fallback
 * cannot create or satisfy a duplicate). The fourth token
 * (`backgroundComplexity`) is normalized from the brief's
 * `backgroundComplexity` field so the `aggressive` mode (B4) can apply
 * its Contract B4 duplicate-across-all-3 rule without needing an
 * additional varianceAxes token.
 */
function axesFor(slot: ConceptBrief | ConceptDirectorFallback): {
    metaphor: string;
    layout: string;
    headline: string;
    backgroundComplexity: string;
} {
    if ("fallback" in slot && slot.fallback) {
        return { metaphor: "", layout: "", headline: "", backgroundComplexity: "" };
    }
    const b = slot as ConceptBrief;
    return {
        metaphor: normalizeToken(b.varianceAxes?.metaphorToken ?? ""),
        layout: normalizeToken(b.varianceAxes?.layoutToken ?? ""),
        headline: normalizeToken(b.varianceAxes?.headlineToken ?? ""),
        backgroundComplexity: normalizeToken(b.backgroundComplexity ?? ""),
    };
}

/**
 * Find every concept index whose normalized token for `axis` equals
 * `target`. Excludes fallback slots (empty target short-circuits).
 */
function findDuplicates(
    axes: Array<{ metaphor: string; layout: string; headline: string; backgroundComplexity: string }>,
    axis: "metaphor" | "layout" | "headline" | "backgroundComplexity",
): number[] {
    const target = (a: { metaphor: string; layout: string; headline: string; backgroundComplexity: string }) =>
        axis === "metaphor" ? a.metaphor
            : axis === "layout" ? a.layout
            : axis === "headline" ? a.headline
            : a.backgroundComplexity;
    const values = axes.map(target);
    const matched: number[] = [];
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v === "") continue;
        let dupes = 0;
        for (let j = 0; j < values.length; j++) {
            if (i === j) continue;
            if (values[j] === v) dupes++;
        }
        if (dupes > 0) matched.push(i);
    }
    // Dedupe while preserving index order.
    return Array.from(new Set(matched)).sort((a, b) => a - b);
}

// ═══════════════════════════════════════════════════════════
// BALANCED MODE (live) — Contract B2
// ═══════════════════════════════════════════════════════════

function validateBalanced(axes: Array<{ metaphor: string; layout: string; headline: string; backgroundComplexity: string }>): VarianceViolation[] {
    const violations: VarianceViolation[] = [];

    // Rule 1: same metaphor appears in ≥ 2 of 3 → block.
    const metaphorDupes = findDuplicates(axes, "metaphor");
    if (metaphorDupes.length >= 2) {
        violations.push({ axis: "metaphor", duplicateConceptIndices: metaphorDupes, severity: "block" });
    }

    // Rule 2: same layout across ALL 3 → block. (Layout needs all-3;
    // a 2-of-3 layout collision is by design not blocking — see the
    // decision table in varianceValidator.contract.md.)
    const layoutDupes = findDuplicates(axes, "layout");
    const distinctLayoutTokens = new Set(axes.map(a => a.layout).filter(t => t !== ""));
    if (layoutDupes.length === 3 && distinctLayoutTokens.size === 1) {
        violations.push({ axis: "layout", duplicateConceptIndices: layoutDupes, severity: "block" });
    } else if (layoutDupes.length >= 2 && layoutDupes.length < 3) {
        // Non-blocking observation: two of three share a layout.
        // Recorded but never retried (FR-017).
        violations.push({ axis: "layout", duplicateConceptIndices: layoutDupes, severity: "warn" });
    }

    // Rule 3: same headline across ALL 3 → block. (Same all-3 rule
    // as layout.)
    const headlineDupes = findDuplicates(axes, "headline");
    const distinctHeadlineTokens = new Set(axes.map(a => a.headline).filter(t => t !== ""));
    if (headlineDupes.length === 3 && distinctHeadlineTokens.size === 1) {
        violations.push({ axis: "headline", duplicateConceptIndices: headlineDupes, severity: "block" });
    } else if (headlineDupes.length >= 2 && headlineDupes.length < 3) {
        violations.push({ axis: "headline", duplicateConceptIndices: headlineDupes, severity: "warn" });
    }

    return violations;
}

// ═══════════════════════════════════════════════════════════
// FORWARD-COMPAT MODES (Contract B3 / B4)
// ═══════════════════════════════════════════════════════════

function validateConservative(axes: Array<{ metaphor: string; layout: string; headline: string; backgroundComplexity: string }>): VarianceViolation[] {
    const violations: VarianceViolation[] = [];
    const metaphorDupes = findDuplicates(axes, "metaphor");
    const distinctMetaphorTokens = new Set(axes.map(a => a.metaphor).filter(t => t !== ""));
    if (metaphorDupes.length === 3 && distinctMetaphorTokens.size === 1) {
        violations.push({ axis: "metaphor", duplicateConceptIndices: metaphorDupes, severity: "block" });
    }
    return violations;
}

function validateAggressive(axes: Array<{ metaphor: string; layout: string; headline: string; backgroundComplexity: string }>): VarianceViolation[] {
    // Aggressive = balanced rules PLUS a `backgroundComplexity`
    // duplicate-across-all-3 block rule (Contract B4). The background
    // complexity value is read from the brief's
    // `backgroundComplexity` field directly (not a 4th varianceAxes
    // token) — keeping the varianceAxes triple unchanged while still
    // letting aggressive mode enforce one extra axis.
    const violations = validateBalanced(axes);
    const bgDupes = findDuplicates(axes, "backgroundComplexity");
    const distinctBgTokens = new Set(axes.map(a => a.backgroundComplexity).filter(t => t !== ""));
    if (bgDupes.length === 3 && distinctBgTokens.size === 1) {
        violations.push({
            axis: "backgroundComplexity",
            duplicateConceptIndices: bgDupes,
            severity: "block",
        });
    } else if (bgDupes.length >= 2 && bgDupes.length < 3) {
        violations.push({
            axis: "backgroundComplexity",
            duplicateConceptIndices: bgDupes,
            severity: "warn",
        });
    }
    return violations;
}

// ═══════════════════════════════════════════════════════════
// TOP-LEVEL VALIDATOR (Contract B1–B8)
// ═══════════════════════════════════════════════════════════

/**
 * Validate the variance of the three sibling brief slots. Pure,
 * deterministic, no AI call (B7). Returns a result with `passed` set
 * to `false` iff at least one `block` violation exists; `warn`
 * violations never flip `passed` (B6).
 *
 * Fallback slots expose no `varianceAxes` and are skipped entirely
 * (B5) — they cannot create or satisfy a duplicate.
 */
export function validateBatchVariance(
    briefs: ReadonlyArray<ConceptBrief | ConceptDirectorFallback>,
    varianceMode: VarianceMode,
): VarianceValidationResult {
    const axes = briefs.map(axesFor);
    let violations: VarianceViolation[];
    switch (varianceMode) {
        case "conservative":
            violations = validateConservative(axes);
            break;
        case "aggressive":
            violations = validateAggressive(axes);
            break;
        case "balanced":
        default:
            violations = validateBalanced(axes);
            break;
    }
    const passed = !violations.some(v => v.severity === "block");
    return { passed, violations };
}
