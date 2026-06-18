# Phase 1 Data Model: Conditional Copy Fields (Phase 24B)

This data model is the **shared truth** consumed by both the backend (`functions/src/`) and the frontend (`src/`) per Constitution XI. Where a type exists in both layers, both must change together.

---

## Core concept: tri-state per field

Each copy field has, conceptually, two coordinates:

| Coordinate | Type | Meaning |
|---|---|---|
| **value** | `string` or `null` | The text, or `null` when not present |
| **status** | `present \| absent \| parse_failure` | Why the value is/ isn't there |

The **value** is what renders and what the fidelity gate checks. The **status** is what distinguishes "intentionally absent" from "failed to parse" (FR-007/FR-008) and what gets logged/traced.

### Status definition

```ts
// NEW — shared concept (mirror in functions/src/types.ts and src/types.ts)
export type CopyFieldStatus = "present" | "absent" | "parse_failure";
```

### Status rules (validation invariants)

| Field | Allowed statuses | Value when `present` | Value when `absent`/`parse_failure` |
|---|---|---|---|
| `hookText` | `present`, `parse_failure` — **never `absent`** (FR-002) | non-empty `string` | n/a (failure → retry the variation, never ship hookless; D5) |
| `subheadText` | `present`, `absent`, `parse_failure` | non-empty `string` | `null` |
| `ctaName` | `present`, `absent`, `parse_failure` | non-empty `string` | `null` |
| `benefitText` | `present`, `absent`, `parse_failure` | non-empty `string` | `null` |

**Hard invariants (asserted in tests, FR-016):**
- An optional field with status `present` MUST have a non-null, non-empty, non-whitespace-only value.
- An optional field with status `absent` or `parse_failure` MUST have value `null` — NEVER `""`, NEVER a placeholder, NEVER a copy of another field (FR-006).
- A whitespace-only parsed value → normalized to `{ value: null, status: absent }` (FR-014).
- `parse_failure` is only assigned after the retry cap is exhausted; before the field is degraded, a failure must be logged (FR-008, SC-010).
- `hookText` status is never `absent` (FR-002, D5).

---

## Type changes (widening)

`hookText` stays `string`. The three optional fields widen `string → string | null`. All four interfaces below are touched.

### Backend — `functions/src/`

```ts
// generators.ts  (currently 536–541, all string)
interface OwnedRenderText {
  hookText: string;                 // unchanged — required
  subheadText: string | null;       // widened
  ctaName: string | null;           // widened
  benefitText: string | null;       // widened
}

// buildPlanSlotMap.ts  (currently 684–689, all string)
export interface CopyFidelityFields {
  hookText: string;
  subheadText: string | null;
  ctaName: string | null;
  benefitText: string | null;
}

// generators.ts  TextOverride (972–974)  — widen the 3 optional fields
// generators.ts  CarouselSlideCopy (978–980) — ctaText/subheadText/benefitText widen (carousel already blanks via SHOW_CTA; null-tolerant)
```

### Frontend — `src/types.ts`

```ts
// TextOverride (358–363)
export interface TextOverride {
  hookText: string;
  subheadText: string | null;
  ctaName: string | null;
  benefitText: string | null;
}

// CarouselSlideCopy (365–370) — widen ctaText/subheadText/benefitText

// HookVariation (706–714)
export interface HookVariation {
  hookText: string;
  subheadText: string | null;
  ctaName: string | null;
  benefitText: string | null;
  rawBlock: string;
  claimFlags?: readonly ClaimFlagEntry[];
  variationIndex: number;
}
```

### New status carrier (parser output)

The parser returns the values plus a status map. Minimal additive shape:

```ts
// NEW — co-located with the parser (generators.ts) and mirrored where the frontend parses (hookVariationParser.ts)
export interface CopyFieldStatuses {
  hookText: CopyFieldStatus;        // "present" | "parse_failure"
  subheadText: CopyFieldStatus;
  ctaName: CopyFieldStatus;
  benefitText: CopyFieldStatus;
}

// resolveOwnedRenderText / extractCopyFieldsFromResponse return shape gains statuses
interface OwnedRenderTextResult {
  text: OwnedRenderText;
  statuses: CopyFieldStatuses;
}
```

> Note: the existing `resolveOwnedRenderText` returns `OwnedRenderText` directly. The widening either (a) returns the richer `OwnedRenderTextResult`, or (b) keeps returning `OwnedRenderText` and computes statuses in the `extractCopyFieldsFromResponse` wrapper (672–680). Option (b) is lower-blast-radius and preferred — finalize in /speckit.tasks.

---

## Trace model (additive, no migration)

```ts
// functions/src/types.ts — ResolutionTrace gains (mirrors claimFlags @291, culturalViolation @263–267)
readonly copyFieldStatus?: {
  readonly hookText: CopyFieldStatus;
  readonly subheadText: CopyFieldStatus;
  readonly ctaName: CopyFieldStatus;
  readonly benefitText: CopyFieldStatus;
  readonly degradedToAbsent?: readonly ("subheadText" | "ctaName" | "benefitText")[]; // fields that hit parse_failure → null
  readonly dedupBlanked?: readonly ("subheadText" | "ctaName" | "benefitText")[];       // fields nulled by dedup
};
```

```ts
// functions/src/resolutionTrace.ts — TraceBuilder gains (mirrors setClaimFlags @71)
setCopyFieldStatus(status: ResolutionTrace["copyFieldStatus"]): TraceBuilder;
```

- Written before persist (`persistTrace`, resolutionTrace.ts 270–278). No Firestore schema migration — additive optional field, exactly like `culturalViolation` / `logoPipeline` precedent.

---

## Lifecycle / state transitions per field (optional fields)

```
model output ──► parser
                  │
                  ├─ marker present, block readable, non-whitespace ──► { value: <string>, status: present }
                  │
                  ├─ marker absent  OR  block whitespace-only ───────► { value: null, status: absent }
                  │
                  └─ marker present, block UNREADABLE ──► retry (≤ MAX_COPY_FIDELITY_ATTEMPTS)
                                                            ├─ recovered ──► { value: <string>, status: present }
                                                            └─ still bad ──► LOG + { value: null, status: parse_failure }
                  ▼
            dedup/QA layer
                  └─ duplicate of another field ──► { value: null, status: absent }   (was present)
                  └─ compact-ratio truncation ────► { value: <shorter string>, status: present }  (still present)
                  ▼
            buildFinalImagePrompt  (renders only non-null)  ──► validateCopyFidelity (skips null) ──► render/composite
```

`hookText` follows the same diagram **except** the `absent` branch is illegal: marker-absent/whitespace/unreadable all route to the variation-level retry (D5), and after the cap a hard failure (never a shipped hookless variation).

---

## Entities (spec → model)

| Spec entity | Model realization |
|---|---|
| **Hook variation copy set** | `OwnedRenderText` / `HookVariation` with `hookText: string` + three `string \| null` optional fields |
| **Parse result state (tri-state)** | `CopyFieldStatus` + `CopyFieldStatuses` map; surfaced to trace via `ResolutionTrace.copyFieldStatus` |

---

## Backward compatibility

- A legacy/previous four-field output parses to four `present` statuses and four non-null values — unchanged behavior (FR-015, SC-008).
- `null` is falsy, so all existing truthiness-based consumers (`buildFinalImagePrompt`, `validateCopyFidelity`, `textCompositing`, carousel) behave identically to the old `""` for absent fields — only the literal value and the new status differ.
- Firestore: no migration. `copyFieldStatus` is additive-optional; documents written before this phase simply lack it (readers treat missing as "all present", consistent with legacy four-field behavior).
