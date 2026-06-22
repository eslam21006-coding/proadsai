# Phase 17 Implementation Audit v3 — `961-independent-multisize`

**Date**: 2026-06-21
**HEAD**: `a413d4f` fix(phase-17): reconcile netCreditsCharged in magic-edit auto-propagation (CR round 6)
**Auditor**: Claude (strict, evidence-based; all files re-read from scratch — no prior passes assumed)
**Spec**: `specs/961-independent-multisize/spec.md`
**Audit history**: v1 = 25/33 · v2 = 33/33 · v3 = 35/35 (33 original + 2 new residual-cleanup criteria)

**Build status**: `functions` `tsc --noEmit` → exit 0; frontend `tsc --noEmit` → exit 0. No new build errors.
**Changed since v2 (`73679b3..HEAD`)**: `src/App.tsx` only (+50/−18). All backend files unchanged since v2; critical invariants re-confirmed below.

---

## Architecture (7)

- [PASS] #1 — Anchor uses existing `serverGenerateFinalAd`; `generateSizeVariant` never for anchor — evidence: `src/App.tsx:4430+` fan-out runs AFTER the primary render; all 8 `generateSizeVariant` call sites (`2535, 4443, 4713, 4854, 5580, 5684, 5745, 5858`) are non-anchor.
- [PASS] #2 — `generateSizeVariant` only for additional sizes + resizes — evidence: same 8 call sites: magic-edit propagation (`2535`), US1 fan-out (`4443`), batch fan-out (`4713`), batch retry (`4854`), batch_all resize (`5580`), carousel_slide resize (`5684`), carousel_all resize (`5745`), single resize (`5858`). None for anchor.
- [PASS] #3 — Client-side fan-out, no server-side batch loop — evidence: `functions/src/sizeVariant.ts` handles ONE variant per call; client loops at `src/App.tsx:4751`, `5608`, `5778`.
- [PASS] #4 — Concurrency cap ≤10 client-side — evidence: `src/App.tsx:4749`, `5608`, `5778` all `const CONCURRENCY_CAP = 10;`.
- [PASS] #5 — HOTFIX-F files commented/superseded header, NOT deleted — evidence: `functions/src/reflowImage.ts:1-2`, `reflowRouter.ts:1-2`, `reflowOutpaint.ts:1-2`, `reflowRerender.ts:1-2` all carry `// Superseded by Phase 17 … Kept for reversibility.`; all present; `reflowImage` callable registration commented out (`index.ts:4360-4370`).
- [PASS] #6 — REFLOW block conditional on `reflowInstruction`, not every prompt — evidence: `functions/src/generators.ts:6665` `${reflowInstruction ? \`- REFLOW: Ratio …\` : ''}`; variant path passes no `reflowInstruction` (`sizeVariant.ts:468-477`).
- [PASS] #7 — `MODEL_PROVIDER` intact, unmodified — evidence: `functions/src/modelConfig.ts:3` unchanged; `sizeVariant.ts:465` honors it; routing via `createVisualRoutingCaller` (`index.ts:4387`).

## Backend — sizeVariant core (8)

- [PASS] #8 — Reuses saved build plan, no `generateBuildPlan()` — evidence: `functions/src/sizeVariant.ts:161` reads `parent.output?.buildPlan`; `468-469` passes `ctx.buildPlan`; no `generateBuildPlan` import/call.
- [PASS] #9 — No Phase 23 fingerprint write — evidence: variant renders via `generateFinalAd` (`generators.ts:5414-7586`); no `recordAngleFingerprint` in that range (calls live at `2879`, `7945+`).
- [PASS] #10 — `buildVariantEditInstruction` ratio-appropriate for TARGET — evidence: `functions/src/sizeVariant.ts:615-647`, uses `targetRatio` (`627-629`).
- [PASS] #11 — `buildVariantEditInstruction` called with `targetAspectRatio` — evidence: `functions/src/sizeVariant.ts:450-452` `buildVariantEditInstruction({ targetRatio: data.targetAspectRatio, ... })`; passed as `editInstruction` to `generateFinalAd` (`474`).
- [PASS] #12 — `validateCopyFidelity` actual validation (not hardcoded) — evidence: `functions/src/sizeVariant.ts:487-494` real `validateCopyFidelity(technicalPrompt, copyFields)` call; `copyFidelityPasses = fidelityCheck.passed ? 1 : 0` + warn-log on failure (`495-505`).
- [PASS] #13 — `null` copy fields carried forward as `null` — evidence: `functions/src/sizeVariant.ts:445-458` via `extractCopyFieldsFromResponse` (no coercion); `buildVariantEditInstruction` appends fields only when truthy (`633-641`).
- [PASS] #14 — Reference priority uploaded > own_original > anchor > none — evidence: `functions/src/sizeVariant.ts:191-206` `resolveReference()`.
- [PASS] #15 — Same-size no-op, zero credits — evidence: `functions/src/sizeVariant.ts:294-305` (`noOp:true, creditsCharged:0, netCreditsCharged:0` before charge).

## Backend — handler/callable (5)

- [PASS] #16 — Registered onCall, europe-west1, secrets — evidence: `functions/src/index.ts:4378-4392`.
- [PASS] #17 — Ratio validation vs UI_RATIOS — evidence: `functions/src/sizeVariant.ts:42,44-46,74-76`.
- [PASS] #18 — Upfront 5-credit charge (value 5) — evidence: `functions/src/entitlements.ts:583` `SIZE_VARIANT_CREDIT_COST = 5`; charged `sizeVariant.ts:396-399`. `CREDIT_COSTS.generateSizeVariant = 5` (`src/planconfig.ts:27`), `COSTS.generateSizeVariant = 5` (`index.ts:125`).
- [PASS] #19 — Refund on failure — evidence: `functions/src/sizeVariant.ts:580-587` (`increment(SIZE_VARIANT_CREDIT_COST)`).
- [PASS] #20 — Idempotency prevents double-charge — evidence: `functions/src/sizeVariant.ts:107-114` key; charge-transaction guards `aborted`/`already-exists` (`364-389`).

## Frontend — pre-select multi-size (5)

- [PASS] #21 — Multi-select single & batch — evidence: `src/App.tsx:7710-7711` (line region) toggle add/remove on `selectedSizes`.
- [PASS] #22 — Carousel single-size only — evidence: `src/App.tsx` selector `if (inputs?.adMode === 'carousel') return new Set([r.key]);`; backend rejects carousel pre-select (`sizeVariant.ts:92-95`).
- [PASS] #23 — Anchor-first orchestration — evidence: `src/App.tsx:4430+` (anchor first, then `generateSizeVariant` with anchor image as `sourceImageOverride` at `4443` block).
- [PASS] #24 — Total credit cost displayed before generation — evidence: `src/App.tsx:7256` `totalCreditCost` computation; rendered in the render-summary block.
- [PASS] #25 — Insufficient credits blocked before any call — evidence: `src/App.tsx:4329` `if (userCredits < totalNeeded) { setShowUpgradeModal(true); return; }`; resize gates at `5547`, `5671` regions.

## Frontend — resize flow (4)

- [PASS] #26 — ALL four resize paths call `generateSizeVariant`, NONE call `reflowImage` — evidence: single `src/App.tsx:5858` (`scope:'single'`), batch_all `5580` (`scope:'batch'`), carousel_all `5745` (`scope:'carousel'`), carousel_slide `5684` (`scope:'carousel'`, `itemIndex:slideIdx`). Zero active `httpsCallable(...,'reflowImage')` invocations remain anywhere in `App.tsx` (see full occurrence list below).
- [PASS] #27 — Original image sent as visual reference for resize — evidence: single `src/App.tsx:5858` block `sourceImageOverride: reflowSource`; batch `runBatchItemWithBackoff(r.generationId!, idx, orig.src)` (`5616`); carousel `runSlideWithBackoff(s.slideIdx, s.sourceUrl)` (`5783`).
- [PASS] #28 — Edit instruction has ratio-appropriate layout + non-null text — evidence: `functions/src/sizeVariant.ts:626-645` `buildVariantEditInstruction` ("layout rules appropriate for ${targetRatio}" + conditional Headline/Subheadline/CTA/Benefit).
- [PASS] #29 — Resize works for single, batch (all items), carousel (all slides + individual slide) — evidence: single (`5858`), batch_all waves (`5608-5616`), carousel_all waves (`5778-5783`), carousel_slide individual (`5684`).

## Frontend — UX (4)

- [PASS] #30 — Per-item/per-slide independent loading — evidence: `src/App.tsx:4755` (waves set `status:'rendering'`), per-item resolution in batch resize loop (`5601+` region).
- [PASS] #31 — Partial failure: successes shown, failed offer retry, successes preserved — evidence: batch error tile retry button (`handleBatchRetry(idx)` default `'rerender'`); waves keep succeeded items; "Resized N/M — K failed" toast without discarding successes.
- [PASS] #32 — Results grouped/displayed by size — evidence: `src/App.tsx` "Size Navigator" + grid filtered by `item.ratio === currentAspectRatio`.
- [PASS] #33 — 429 backoff (base 1s, ×2, max 4, jitter) — evidence: `runWithBackoff` `src/App.tsx:4721`/`4738-4739`; `runBatchItemWithBackoff` `5572`/`5597-5598`; `runSlideWithBackoff` `5752`/`5768-5769` — all `attempt < 4`, `Math.min(8000, 1000 * Math.pow(2, attempt - 1)) + Math.random() * 250`.

## NEW — Residual reflowImage cleanup (2)

- [PASS] #34 — Magic-Edit multi-size auto-propagation repointed to `generateSizeVariant` — evidence: `src/App.tsx:2522-2575`; line `2535` calls `generateSizeVariant` (`scope:'single'`, `sourceImageOverride: result.image`), with `netCreditsCharged` reconciliation (`2555-2562`, CR round 6). No `reflowImage` call.
- [PASS] #35 — Batch reflow-retry sub-mode repointed to `generateSizeVariant` — evidence: `src/App.tsx:4846-4865`; line `4854` calls `generateSizeVariant` (`scope:'single'`, `sourceImageOverride: item.originalUrl`). No `reflowImage` call; no-image fallback degrades to a fresh rerender (`4866-4875`).

---

## Full `reflowImage` occurrence list in `src/App.tsx`

| Line | Content | Status |
|------|---------|--------|
| 2523 | `// repointed from the commented-out \`reflowImage\` callable to the new` | comment (string-only) |
| 4474 | `// constraint as the old reflowImage path). Skip rather than` | comment |
| 4677 | `// generationId to anchor to (the reflowImage callable requires one) …` | comment |
| 4847 | `// Phase 17 — repointed from the commented-out \`reflowImage\` callable to` | comment |
| 4867 | `// Fallback when no generationId is available to anchor the reflowImage callable.` | comment |
| 5043 | `// retry and the reflowImage callable (carousel_slide / carousel_all) have a` | comment |
| 5133 | `// generateFinalAd (NOT reflowImage — a same-ratio reflow no-ops …` | comment |
| 5531 | `// loop per-combo and call reflowImage with SCOPE:'single' …` | comment |
| 8874 | `const totalCost = CREDIT_COSTS.reflowImage * scopeItemCount;` | active code — **cost-constant lookup** (`CREDIT_COSTS.reflowImage === 5`), NOT a callable invocation |
| 8984 | `… ${selectedCount} × ${CREDIT_COSTS.reflowImage})\`` (Arabic label) | active code — cost-constant lookup in UI label, NOT a callable invocation |
| 8985 | `… ${selectedCount} × ${CREDIT_COSTS.reflowImage} credits)\`` (EN label) | active code — cost-constant lookup in UI label, NOT a callable invocation |

**Active `reflowImage` callable invocations: 0.** All occurrences are comments or `CREDIT_COSTS.reflowImage` property reads. Per the audit rule, #26 is **not** failed (no active callable invocation). (Cosmetic note: the three `CREDIT_COSTS.reflowImage` label refs could use `CREDIT_COSTS.generateSizeVariant` for clarity; both equal 5, so the displayed cost is correct.)

---

## Summary

**35 / 35 PASS · 0 / 35 FAIL**

## Verdict: **PASS**

All 35 criteria are explicitly implemented. Both `functions` and frontend typecheck clean (exit 0). No active `reflowImage` callable invocations remain.

### Delta from v2

| Area | v2 | v3 | Change |
|------|----|----|--------|
| #34 (magic-edit propagation) | n/a (was Note A) | **PASS** | `bacfcce` repointed `App.tsx:2535` to `generateSizeVariant`; `a413d4f` added `netCreditsCharged` reconciliation. |
| #35 (batch reflow-retry) | n/a (was Note A) | **PASS** | `bacfcce` repointed `App.tsx:4854` to `generateSizeVariant`. |
| #26 | PASS (w/ caveat) | **PASS (clean)** | The v2 caveat (2 residual `reflowImage` callers) is resolved — zero active invocations now. |
| #1–#25, #27–#33 | PASS | **PASS** | Backend files unchanged since v2; re-confirmed. Frontend resize/UX paths re-verified after the +50/−18 `App.tsx` change. |
| Build | (not run) | exit 0 / exit 0 | `functions` + frontend `tsc --noEmit` both clean. |

### Residual notes (non-blocking, not part of the 35 criteria)

- **Cosmetic**: three UI-label cost lookups still read `CREDIT_COSTS.reflowImage` (`App.tsx:8874, 8984, 8985`). Value is identical to `generateSizeVariant` (5), so the displayed cost is correct; renaming would remove the last textual coupling to the retired action.
- **Test coverage** (carried from v2): `functions/src/__tests__/sizeVariant.test.ts` remains structural (local helper re-implementations; does not invoke `generateSizeVariantHandler`/`buildVariantEditInstruction`). An integration test stubbing the visual caller would exercise the real edit-instruction + `validateCopyFidelity` wiring end-to-end.
