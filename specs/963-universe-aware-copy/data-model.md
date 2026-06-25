# Phase 1 Data Model: Universe-Aware Copy

This feature adds **one** persisted data shape (an additive resolution-trace sub-object) and a few **in-memory** types in the pure mapper. No Firestore migration; no schema change to any existing document beyond an additive optional field.

## 1. Persisted: `ResolutionTrace.universeAwareCopy` (additive, optional)

**Location**: `functions/src/types.ts`, inside the `ResolutionTrace` interface, immediately after `gazeDirection?` (~L443).

```typescript
// Phase 27 — additive universe-aware-copy sub-object. Records the
// COPY-LEVEL metaphor DECISION for this generation (prompt-level, NOT
// an output verification — matches the Phase 19 gaze / Phase 28
// expression trace precedent).
//
// `applied: true`  → the RELAXED fantasy-metaphor instruction was
//   emitted into the copy prompt (style family is fantasy and no
//   suppression applied).
// `applied: false` → the STRICT anti-metaphor rule was emitted
//   (realistic / minimal / unknown family) OR the metaphor was
//   suppressed (reference ad / text-only / carousel non-hook slide);
//   `reason` explains which.
//
// `styleFamily` ALWAYS carries the resolved family, never null, even
// when suppressed (FR-013a). Field absence on a legacy generation is
// accepted as "no Phase-27 data". Additive — no migration.
readonly universeAwareCopy?: {
    readonly applied: boolean;
    readonly styleFamily: "fantasy" | "realistic" | "minimal";
    readonly reason: UniverseCopyReason;
};
```

### Field rules

| Field | Type | Rule |
|-------|------|------|
| `applied` | `boolean` | `true` ⇔ relaxed fantasy block emitted. Prompt-level fact, not output check. |
| `styleFamily` | `"fantasy" \| "realistic" \| "minimal"` | Always the resolved family (FR-013a). Unknown/absent family resolves to `realistic` (the `resolveStyleFamily` default) and is recorded as such. Never null. |
| `reason` | `UniverseCopyReason` (string union) | Exactly one canonical value (see § 3). MUST match the actual decision path (FR-013). |

### Migration / legacy
- Field is optional. Legacy `generations/{genId}` docs without it remain valid (NFR-003).
- No backfill. No reads depend on its presence.

## 2. In-memory: mapper types (`functions/src/universeCopyMap.ts`)

```typescript
export type StyleFamily = "fantasy" | "realistic" | "minimal";

export type UniverseCopyReason =
    | "fantasy-universe-metaphor-active"
    | "realistic-no-metaphor"
    | "minimal-no-metaphor"
    | "reference-ad-override"
    | "text-only-mode"
    | "carousel-non-hook-slide";

/** Inputs to the single decision function — all derivable from existing AdInputs/runtime. */
export interface UniverseCopyDecisionArgs {
    styleFamily: StyleFamily;          // from resolveStyleFamily(inputs)
    referenceAdPresent: boolean;       // from referenceAd / referenceAdOverrideActive
    isTextOnly: boolean;               // from isTextOnlyMode(inputs)
    isCarouselNonHookSlide: boolean;   // carousel slide index > 0 (false for single/batch)
}

/** Return shape — spreads directly into ResolutionTrace.universeAwareCopy. */
export interface UniverseCopyDecision {
    applied: boolean;
    styleFamily: StyleFamily;
    reason: UniverseCopyReason;
}
```

> Note: the decision shape intentionally has NO `metaphorContent` / `visualElementSuggestion` fields. `applied` is prompt-level only (clarification); we never inspect the generated copy.

## 3. Canonical `reason` values (the only allowed strings)

| `reason` | When | `applied` | `styleFamily` |
|----------|------|-----------|---------------|
| `fantasy-universe-metaphor-active` | fantasy + no suppression | `true` | `fantasy` |
| `realistic-no-metaphor` | realistic family, no suppression | `false` | `realistic` |
| `minimal-no-metaphor` | minimal family, no suppression | `false` | `minimal` |
| `reference-ad-override` | reference ad present (any family) | `false` | resolved family |
| `text-only-mode` | text-only mode (any family) | `false` | resolved family |
| `carousel-non-hook-slide` | carousel slide index > 0 (any family) | `false` | resolved family |

## 4. Decision precedence (first match wins)

```
1. referenceAdPresent            → reference-ad-override          (applied=false)
2. isTextOnly                    → text-only-mode                 (applied=false)
3. isCarouselNonHookSlide        → carousel-non-hook-slide        (applied=false)
4. styleFamily === 'fantasy'     → fantasy-universe-metaphor-active (applied=true)
5. styleFamily === 'minimal'     → minimal-no-metaphor            (applied=false)
6. else (realistic/unknown)      → realistic-no-metaphor          (applied=false)
```

This order guarantees the spec edge case "reference ad + fantasy + carousel" → `reference-ad-override` (suppression beats both fantasy and the carousel rule).

## 5. Relationships

- `universeAwareCopy` is a sibling of `expressionAdaptation` and `gazeDirection` under `ResolutionTrace`. It is written once per generation in `generateFinalAd()`.
- The decision is computed from the SAME `AdInputs` used by `generateTOV()`/`generateConcepts()`/`generateBuildPlan()`, so the trace cannot disagree with the prompt that was emitted.
- For carousels, the per-slide nature of `isCarouselNonHookSlide` means slides 2+ record `carousel-non-hook-slide` while the hook slide records the family-driven reason (see plan § Carousel nuance).
