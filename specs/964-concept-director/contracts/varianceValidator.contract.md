# Contract B — Variance Validator module (`functions/src/varianceValidator.ts`)

Pure, deterministic, **no AI call**. Returns in <5ms.

## Exports

```ts
export type ViolationSeverity = "block" | "warn";
export type VarianceAxis = "metaphor" | "layout" | "headline" | "backgroundComplexity";
export interface VarianceViolation {
  axis: VarianceAxis;
  duplicateConceptIndices: number[];
  severity: ViolationSeverity;
}
export interface VarianceValidationResult { passed: boolean; violations: VarianceViolation[] }

export function normalizeToken(token: string): string; // lowercase + trim
export function validateBatchVariance(
  briefs: Array<ConceptBrief | ConceptDirectorFallback>,
  varianceMode: VarianceMode,
): VarianceValidationResult;
```

## Behavioral guarantees

- **B1 (normalized match)**: Two tokens are equal iff `normalizeToken(a) === normalizeToken(b)` (lowercase + trim). No fuzzy/semantic comparison.
- **B2 (balanced rules)**: In `balanced` mode a `block` violation is raised when any holds:
  - `metaphor`: the same normalized `metaphorToken` appears in **≥2 of 3** concepts.
  - `layout`: the same normalized `layoutToken` appears across **all 3**.
  - `headline`: the same normalized `headlineToken` appears across **all 3**.
- **B3 (conservative rules)**: `block` only when `metaphorToken` is identical across **all 3** (no block when only layout matches). *(Defined for forward-compat; not exercised live.)*
- **B4 (aggressive rules)**: balanced rules **plus** `block` when `backgroundComplexity` is identical across **all 3**. *(Forward-compat; not exercised live.)*
- **B5 (fallback skips)**: A `ConceptDirectorFallback` slot exposes no `varianceAxes`; it is excluded from comparison and can never create or satisfy a duplicate. With ≥2 fallbacks, no metaphor "≥2 of 3" block is possible.
- **B6 (passed flag)**: `passed === false` iff at least one `block` violation exists. `warn` violations never flip `passed`.
- **B7 (determinism & speed)**: Same input ⇒ same output; no I/O, no randomness, no model call; completes well under 5ms.
- **B8 (violation detail)**: Each violation lists the exact `duplicateConceptIndices` so the orchestrator knows which concept(s) to retry.

## Decision table (balanced, the live mode)

| metaphorToken dup | layoutToken all-3 | headlineToken all-3 | passed |
|---|---|---|---|
| none | no | no | ✅ true |
| 2 of 3 | — | — | ❌ false (metaphor block) |
| 3 of 3 | — | — | ❌ false (metaphor block) |
| none | yes | no | ❌ false (layout block) |
| none | no | yes | ❌ false (headline block) |
| none | 2 of 3 only | no | ✅ true (layout needs all 3) |
