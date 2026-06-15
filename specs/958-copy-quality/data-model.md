# Phase 1 Data Model: Copy Quality Upgrade

This feature is prompt-and-knowledge centric. The "data model" is (a) the six exported knowledge constants and (b) one additive runtime trace entity. No Firestore migration; all additions are optional/additive.

---

## A. Knowledge constants (in `functions/src/copywriting_knowledge.ts`)

| Constant | Type | Implements (reference) | Wired this phase? | Consumed by |
|---|---|---|---|---|
| `READING_LEVEL_BLOCK` | `string` | Sec 0 (reading level) + Sec 9 | ✅ yes | SYSTEM_TOV + 4 surfaces |
| `LIVED_SYMPTOM_BLOCK` | `string` | Sec 0 (depth) + Sec 9 | ✅ yes | SYSTEM_TOV + 4 surfaces |
| `FABRICATION_POLICY_BLOCK` | `string` | Sec 0 (fabrication) + Sec 4 | ✅ yes | SYSTEM_TOV + 4 surfaces; defines the `CLAIM_FLAG:` output contract |
| `BANNED_CTA_LIST` | `readonly string[]` (5 items) | Sec 8 | ✅ yes (prompt-only) | CTA-wording injection points |
| `COPY_SCORING_DIMENSIONS` | `string` | Sec 12 | ❌ defined, not wired (FR-014) | future scoring pass |
| `COPY_REWRITE_DIAGNOSES` | `string` | Sec 13 | ❌ defined, not wired (FR-014) | future rewrite loop |

### Content invariants (validated by `copyQuality.test.ts`)

- **`READING_LEVEL_BLOCK`**: states ≤6th-grade; short everyday words; short sentences; no jargon; no abstract nouns; Arabic = simple spoken-style فصحى a 12-year-old would say.
- **`LIVED_SYMPTOM_BLOCK`**: never state the problem abstractly; name the exact concrete moment (scene / time of day / recognizable detail); pull from pain + audience inputs.
- **`FABRICATION_POLICY_BLOCK`**: invent **framing** (scenarios/hypotheticals/metaphors) freely; flag — never block/delete/refuse — fabricated **verifiable specifics** (named person, exact figure, hard count, star rating, concrete deadline/quantity); do NOT flag obvious hypotheticals/metaphors; **frees creative framing only, never numeric/identity compliance**; emit `CLAIM_FLAG: <text> — <reason>` lines after the copy fields for each flagged specific.
- **`BANNED_CTA_LIST`** = exactly `["Learn more", "Sign up now", "Book now", "Get started", "Click here"]`.
- **`COPY_SCORING_DIMENSIONS`**: the 15-dimension 1–10 rubric incl. the two hard dimensions (reading level ≤6th grade, lived-symptom depth — each reject <7) and the pass condition (avg ≥8 AND no applicable dim <6 AND dims 14–15 ≥7).
- **`COPY_REWRITE_DIAGNOSES`**: the diagnosis→fix table incl. "Above 6th grade" and "Surface-level" rows + max-2-pass rule.

### File header (drift control)

Top-of-file comment immediately after the existing version block:
```
// Implements specs/_shared/COPY_SYSTEM_REFERENCE.md — edit the reference first, then sync these constants.
```

---

## B. Runtime entity — `ClaimFlagEntry` + `ResolutionTrace.claimFlags`

**Location:** `functions/src/types.ts` (alongside the existing `ResolutionTrace` interface, ~lines 231–282).

### New interface

```ts
export interface ClaimFlagEntry {
  /** The verbatim fabricated verifiable specific the model emitted. */
  text: string;
  /** One-line reason the user should be able to back it up. */
  reason: string;
  /** Which copy field the specific appeared in, when determinable. */
  field?: "hook" | "subhead" | "cta" | "benefit" | "slide";
}
```

### Additive field on `ResolutionTrace`

```ts
// added to the existing ResolutionTrace interface — optional, additive, no migration
claimFlags?: readonly ClaimFlagEntry[];
```

**Rules:**
- Populated only when the model emits `CLAIM_FLAG:` lines; otherwise absent/empty.
- Non-blocking: presence never fails generation, never deletes copy.
- Additive & optional → legacy `generations/{genId}` docs are unaffected (field simply missing).
- Mirrors the existing additive-sub-object convention on `ResolutionTrace` (`culturalViolation?`, `logoPipeline?`, `visualProvider?`).

### Lifecycle

```
TOV model response (4 fields + optional CLAIM_FLAG: lines)
   │
extractCopyFieldsFromResponse()  → strips CLAIM_FLAG lines, returns {hookText, subheadText, ctaName, benefitText, claimFlags?}
   │                                (marker text MUST NOT appear in the 4 fields)
caller (generateTOV / carousel)  → writes claimFlags into resolutionTrace.claimFlags
   │
Firestore generations/{genId}    → persisted additively for audit
```

**Invariant (gate safety):** No `CLAIM_FLAG` substring may survive into any of the four copy fields, so `validateCopyFidelity()` behavior is byte-identical to before for the copy fields.

---

## C. What is explicitly NOT modeled (Phase 23 / deferred)

- No `HOOK_ANGLE_OPTIONS` / `HOOK_TYPE_OPTIONS` / `AWARENESS_LEVEL_OPTIONS`.
- No `STATIC_STRUCTURES` / `CAROUSEL_FRAMEWORKS` / `CREATIVE_TEXT_SYSTEM_INSTRUCTION`.
- No conditional field-count; the four fields are always emitted (gate/compositor untouched).
- No scoring/rewrite execution state (the two constants are inert knowledge text).
- No per-hook variation ("more like this") or anti-sameness memory structures.
