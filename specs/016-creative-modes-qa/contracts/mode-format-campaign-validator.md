# Contract: `validateModeFormatCombination`

**Owner file**: `functions/src/creativeResolver.ts`
**Imported by**: `src/components/InputForm.tsx` (frontend) and `functions/src/index.ts` (backend callables)
**Phase**: 16 — Creative Modes & Art Direction QA
**Status**: NEW (added by this phase)

This is the single source of truth for "is this mode + format + campaign combination valid for launch?". The function is deterministic, synchronous, has no I/O, and is consumed identically by both layers.

---

## Signature

```ts
export type ModeFormatValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export interface ModeFormatValidationInput {
  modes: string[];                                   // selected creative modes (1 or 2)
  adFormat: 'single' | 'carousel' | 'batch';
  campaignType: 'cold' | 'retargeting';
}

export function validateModeFormatCombination(
  input: ModeFormatValidationInput
): ModeFormatValidationResult;
```

## Invariants

1. **Pure function.** No side effects, no I/O, no logging, no Firestore reads. Same inputs → same output forever.
2. **Single source of truth.** Both layers call **this exact function**. No re-implementation in `InputForm.tsx`. No alternate path in `index.ts`. If the function changes, both layers change together by definition.
3. **Determinism.** Returns within < 2 ms on commodity hardware (no async work).
4. **Total.** Every possible `(modes, adFormat, campaignType)` tuple maps to exactly one of `{ valid: true }` or `{ valid: false, reason }`. No exceptions thrown for unknown modes — they map to `{ valid: false, reason: 'Combination is not in the launch surface.' }`.
5. **String stability.** `reason` strings are stable identifiers — they appear verbatim in the UI and in server error responses. Changing a reason string is a frontend-visible change and requires updating the corresponding fixture string.

## Decision table (ordered; first match wins)

| # | Condition | Result |
|---|---|---|
| 1 | `modes.includes('before_after')` && `modes.length > 1` | `{ valid: false, reason: 'Before/After is single-image only — defines the entire canvas.' }` |
| 2 | `modes.includes('before_after')` && `adFormat !== 'single'` | `{ valid: false, reason: 'Before/After is single-image only.' }` |
| 3 | `modes.includes('text_only')` && `modes.length > 1` | `{ valid: false, reason: 'Text-only mode is mutually exclusive — it defines the entire canvas.' }` |
| 4 | `modes.includes('testimonial_carousel')` && `adFormat !== 'carousel'` | `{ valid: false, reason: 'Testimonial Carousel requires carousel format.' }` |
| 5 | `modes.length === 1` && mode is in launched set && `adFormat` is allowed for that mode (per § 2.4 of LAUNCH_MATRIX) | `{ valid: true }` |
| 6 | `modes.length === 2` && pair is in `ALLOWED_PAIRS` && `adFormat` is allowed for that pair | `{ valid: true }` |
| 7 | otherwise | `{ valid: false, reason: 'Combination is not in the launch surface.' }` |

## Caller contracts

### Frontend caller — `src/components/InputForm.tsx`

The caller MUST:
1. Invoke `validateModeFormatCombination(currentInput)` after every selection change to `selectedModes`, `adFormat`, or `campaignType`.
2. If `result.valid === false`, render `result.reason` inline directly below the offending control (the mode card, format selector, or campaign-type toggle that was last changed).
3. Add `result.valid === false` to the `disabled` calculation for the *Generate* button.
4. NOT cache the result — it must be recomputed on every change (cost is < 2 ms; caching introduces staleness risk).

### Backend caller — `functions/src/index.ts`

Every callable that produces a generation (`generateAd`, `generateBatch`, `generateCarousel`, `reflowImage`, `magicEdit`, `editAd`, etc. — anywhere a `(modes, adFormat, campaignType)` tuple is accepted) MUST:
1. Invoke `validateModeFormatCombination` as the **first** validation step, before any rate limiting, plan gating, or generation work.
2. If `result.valid === false`, return an error with `result.reason` as the user-facing message and `code: 'invalid_mode_format'` (HTTPS Callable error code), and **do not** charge credits.
3. NOT bypass the function under any condition — the function is the only valid arbiter.

## Test contract

The function MUST have:

1. **Unit tests** in `functions/src/__tests__/modeFormatValidator.test.ts` covering:
   - Each row of the decision table, with at least one positive and one negative example per row.
   - Invariant 4 (totality): random fuzz over `(mode-set, format, campaign)` space — no input crashes the function.
2. **Fixture-suite tests** in `functions/src/contractFixtures.test.ts` covering:
   - All 4 explicit blocked-combination categories (FR-003).
   - At least one allowed combination per launched mode (FR-001).
   - At least one allowed combination per approved pair (FR-002).

The fixture suite must be runnable via `cd functions && npm test` and must add zero failures to existing 81-fixture pass count.

## Backwards compatibility

- The function is NEW; there is no prior version to be compatible with.
- Adding new launched modes or pairs in the future is additive: append a row to ALLOWED_PAIRS / launched-mode set; the decision table is already total.
- Removing a mode is a breaking change requiring a coordinated frontend + backend release. (Out of scope for Phase 16 — Principle XII protects deferred scope.)

## Non-goals

- The function does **not** check plan-tier gating (handled by `validateLaunchSurface` upstream).
- The function does **not** check Arabic-locale art-direction constraints (handled by cultural compliance and the adapt-state audit).
- The function does **not** check input quality (e.g. uploaded photos, copy length) — it only governs the discrete mode + format + campaign tuple.
