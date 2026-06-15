# Contract: Copy Quality Constants & Trace Field

This feature exposes no external API. Its "contracts" are the internal interfaces other modules depend on: the exported constant signatures, the SYSTEM_TOV content contract, the `CLAIM_FLAG` output/parse contract, and the additive trace field. Tests assert these.

---

## C1. Exported constant signatures (`functions/src/copywriting_knowledge.ts`)

```ts
export const READING_LEVEL_BLOCK: string;
export const LIVED_SYMPTOM_BLOCK: string;
export const FABRICATION_POLICY_BLOCK: string;
export const BANNED_CTA_LIST: readonly string[];   // exactly 5 entries
export const COPY_SCORING_DIMENSIONS: string;        // defined, not wired this phase
export const COPY_REWRITE_DIAGNOSES: string;         // defined, not wired this phase
```

**Contract assertions:**
- All six are exported and importable from `./copywriting_knowledge.js`.
- All six are non-empty.
- `BANNED_CTA_LIST` deep-equals `["Learn more", "Sign up now", "Book now", "Get started", "Click here"]` (order not significant; membership is).
- File source contains the drift header line verbatim.

---

## C2. SYSTEM_TOV content contract (`functions/src/promptConstants.ts`)

After this change, the rendered `SYSTEM_TOV` string MUST contain signals for all four Track-1 rules (Section 18):

- a reading-level instruction (≤6th grade / short words / Arabic spoken فصحى),
- a lived-symptom instruction (name the concrete moment, not the abstract problem),
- a fabrication-flag instruction (invent framing; flag verifiable specifics; never delete),
- a banned-CTA instruction (none of the five phrases; CTA = `[verb] [offer] → [payoff]`).

**Contract assertion:** substring/﻿signal checks on the rendered constant (not on import structure).

---

## C3. `CLAIM_FLAG` output + parse contract

**Model output contract** (instructed by `FABRICATION_POLICY_BLOCK`): when the model writes a fabricated verifiable specific, it appends one line per specific *after* the four copy fields:
```
CLAIM_FLAG: <verbatim specific> — <one-line reason>
```

**Parser contract** (`extractCopyFieldsFromResponse()` in `generators.ts`):

| Input (model response) | `hookText/subheadText/ctaName/benefitText` | returned `claimFlags` |
|---|---|---|
| No `CLAIM_FLAG:` lines | exactly as today | `claimFlags` is always present and empty (`[]`) |
| One+ `CLAIM_FLAG:` lines | identical to the no-flag case (marker text fully stripped) | one `ClaimFlagEntry` per line |

**Hard invariant:** no `CLAIM_FLAG` substring may appear in any of the four returned fields (protects `validateCopyFidelity`).

---

## C4. Trace field contract (`functions/src/types.ts`)

```ts
export interface ClaimFlagEntry {
  text: string;
  reason: string;
  field?: "hook" | "subhead" | "cta" | "benefit" | "slide";
}

// added to ResolutionTrace:
claimFlags?: readonly ClaimFlagEntry[];
```

**Contract assertions:** optional, additive, backward-compatible (legacy docs without it remain valid); never causes a generation to fail when present.

---

## C5. Non-interference contract (regression guard)

These MUST remain behaviorally unchanged (asserted indirectly / by leaving code untouched):
- `validateCopyFidelity()` — number of fields and exact-string comparison unchanged.
- `captionValidator.ts` NUMERIC FACT VIOLATION repair — still fires on its existing triggers (FR-004a).
- `hookAnglesKnowledge.ts` honest-degradation rules — unchanged (FR-004a).
- `textCompositing.ts` — compositor unchanged.
- User's literal `inputs.cta` — never overridden (Principle II / R4).
- Field count emitted by the generator — still four (no Track-2 conditionality).
