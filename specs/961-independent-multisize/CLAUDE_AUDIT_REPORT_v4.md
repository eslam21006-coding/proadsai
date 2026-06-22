# Phase 17 Implementation Audit v4 — `961-independent-multisize`

**Date**: 2026-06-22
**HEAD**: `f6ab1de` fix(phase-17): persist approvedTov from serverGenerateFinalAd to Firestore
**Auditor**: Claude (strict, evidence-based; all changed files re-read from scratch)
**Audit history**: v1 = 25/33 · v2 = 33/33 · v3 = 35/35 · **v4 = 36/37** (35 + 2 new approvedTov-data-flow criteria)
**Build**: `functions` `tsc --noEmit` → exit 0; frontend `tsc --noEmit` → exit 0. No new build errors.
**Changed since v3 (`a413d4f..HEAD`)**: `functions/src/sizeVariant.ts` (+73, additive: reconstruction fallback + debug logs), `src/App.tsx` (+20, additive: `approvedTov` added to 5 `saveGeneration` calls), `src/services/feedbackService.ts` (+8, additive: `output.approvedTov` type field).

---

## Architecture (7)

- [PASS] #1 — Anchor uses `serverGenerateFinalAd`; `generateSizeVariant` never for anchor — evidence: 8 `generateSizeVariant` call sites in `src/App.tsx` (`2535, 4443, 4713, 4854, 5580, 5684, 5745, 5858`) are all non-anchor; anchor renders via `serverGenerateFinalAd` (`index.ts:4236`).
- [PASS] #2 — `generateSizeVariant` only for additional sizes + resizes — evidence: same 8 call sites (magic-edit propagation, US1 fan-out, batch fan-out, batch retry, 4 resize paths).
- [PASS] #3 — Client-side fan-out, no server-side batch loop — evidence: `functions/src/sizeVariant.ts` handles ONE variant per call; client wave loops `App.tsx:4751/5608/5778`.
- [PASS] #4 — Concurrency cap ≤10 client-side — evidence: `src/App.tsx:4749/5608/5778` `CONCURRENCY_CAP = 10`.
- [PASS] #5 — HOTFIX-F files commented/superseded, not deleted — evidence: `reflowImage.ts:1-2`, `reflowRouter.ts:1-2`, `reflowOutpaint.ts:1-2`, `reflowRerender.ts:1-2` superseded headers; callable registration commented (`index.ts:4352-4370`).
- [PASS] #6 — REFLOW block conditional on `reflowInstruction` — evidence: `functions/src/generators.ts:6665` `${reflowInstruction ? … : ''}` (generators unchanged since v2).
- [PASS] #7 — `MODEL_PROVIDER` intact — evidence: `functions/src/modelConfig.ts:3` unchanged.

## Backend — sizeVariant core (8)

- [PASS] #8 — Reuses saved build plan, no `generateBuildPlan()` — evidence: `sizeVariant.ts:162,542` use `ctx.buildPlan`/`parent.output?.buildPlan`; no `generateBuildPlan` call.
- [PASS] #9 — No Phase 23 fingerprint write — evidence: renders via `generateFinalAd` (`generators.ts:5414-7586`, no `recordAngleFingerprint` in range).
- [PASS] #10 — `buildVariantEditInstruction` ratio-appropriate for TARGET — evidence: `sizeVariant.ts:523-525` `buildVariantEditInstruction({ ..., targetRatio: data.targetAspectRatio })`; body at `688+`.
- [PASS] #11 — `buildVariantEditInstruction` called with `targetAspectRatio` — evidence: `sizeVariant.ts:525` `targetRatio: data.targetAspectRatio`; passed as `editInstruction` to `generateFinalAd` (`547`).
- [PASS] #12 — `validateCopyFidelity` actual validation — evidence: `sizeVariant.ts:561` `validateCopyFidelity(technicalPrompt, {...})`; `567` `copyFidelityPasses = fidelityCheck.passed ? 1 : 0`.
- [PASS] #13 — `null` copy fields carried forward as `null` — evidence: `sizeVariant.ts:519` `extractCopyFieldsFromResponse(ctx.approvedTov, ...)` (no coercion); `buildVariantEditInstruction` appends fields only when truthy (`706-714`).
- [PASS] #14 — Reference priority uploaded > own_original > anchor > none — evidence: `sizeVariant.ts:resolveReference` (`264-279`).
- [PASS] #15 — Same-size no-op, zero credits — evidence: `sizeVariant.ts:364-376` (`noOp:true, creditsCharged:0, netCreditsCharged:0`).

## Backend — handler/callable (5)

- [PASS] #16 — Registered onCall, europe-west1, secrets — evidence: `index.ts:4378-4392`.
- [PASS] #17 — Ratio validation vs UI_RATIOS — evidence: `sizeVariant.ts:42,44-46,74-76`.
- [PASS] #18 — Upfront 5-credit charge (value 5) — evidence: `entitlements.ts:583` `SIZE_VARIANT_CREDIT_COST = 5`; charge `sizeVariant.ts:~470`.
- [PASS] #19 — Refund on failure — evidence: `sizeVariant.ts` failure path `increment(SIZE_VARIANT_CREDIT_COST)`.
- [PASS] #20 — Idempotency prevents double-charge — evidence: `sizeVariant.ts:107-114` key + transaction guards `aborted`/`already-exists`.

## Frontend — pre-select multi-size (5)

- [PASS] #21 — Multi-select single & batch — evidence: `src/App.tsx` selector toggle on `selectedSizes`.
- [PASS] #22 — Carousel single-size only — evidence: selector `if (inputs?.adMode === 'carousel') return new Set([r.key])`; backend VR-2 (`sizeVariant.ts:92-95`).
- [PASS] #23 — Anchor-first orchestration — evidence: `App.tsx:4430+` (anchor first, then `generateSizeVariant` with anchor image at `2535`/`4443`).
- [PASS] #24 — Total credit cost displayed — evidence: `App.tsx:7256` `totalCreditCost`.
- [PASS] #25 — Insufficient credits blocked before any call — evidence: `App.tsx:4329` pre-gen gate; resize gates.

## Frontend — resize flow (4)

- [PASS] #26 — ALL resize paths call `generateSizeVariant`, NONE call `reflowImage` — evidence: single `App.tsx:5858`, batch_all `5580` (`scope:'batch'`), carousel_all `5745` (`scope:'carousel'`), carousel_slide `5684` (`scope:'carousel'`). **Zero active `httpsCallable(...,'reflowImage')` invocations** (grep confirmed).
- [PASS] #27 — Original image sent as visual reference — evidence: single `sourceImageOverride: reflowSource`; batch `orig.src`; carousel `s.sourceUrl`.
- [PASS] #28 — Edit instruction has ratio-appropriate layout + non-null text — evidence: `sizeVariant.ts:699-714` `buildVariantEditInstruction`.
- [PASS] #29 — Resize works for single/batch/carousel (all + individual slide) — evidence: single (`5858`), batch waves (`5608+`), carousel waves (`5778+`), carousel_slide (`5684`).

## Frontend — UX (4)

- [PASS] #30 — Per-item/per-slide independent loading — evidence: `App.tsx:4755/5534` `status:'rendering'` per item.
- [PASS] #31 — Partial failure: successes shown, failed offer retry — evidence: batch error tile retry button; waves keep successes.
- [PASS] #32 — Results grouped by size — evidence: Size Navigator + ratio filter.
- [PASS] #33 — 429 backoff (base 1s, ×2, max 4, jitter) — evidence: `runWithBackoff` (`4721`), `runBatchItemWithBackoff` (`5572`), `runSlideWithBackoff` (`5752`), all `attempt < 4`, `Math.min(8000, 1000 * Math.pow(2, attempt - 1)) + Math.random() * 250`.

## Residual cleanup (2)

- [PASS] #34 — Magic-Edit propagation repointed — evidence: `App.tsx:2535` `generateSizeVariant` (`scope:'single'`, ref = `result.image`), netCreditsCharged reconciled.
- [PASS] #35 — Batch reflow-retry repointed — evidence: `App.tsx:4854` `generateSizeVariant` (`scope:'single'`, ref = `item.originalUrl`).

## NEW — approvedTov data flow (2)

- [**FAIL**] #36 — *serverGenerateFinalAd in index.ts* persists approvedTov to the Firestore generation document — **Expected**: `serverGenerateFinalAd` writes approvedTov to the generations doc after a successful render. **Found**: `serverGenerateFinalAd` (`functions/src/index.ts:4236-4350`) does **NOT** write to the `generations` collection at all, and its success response (`index.ts:4333`) is `{ success, imageBase64, storageUrl, errorCode, costEstimate, resolutionTrace }` — **no `approvedTov`**. `generators.generateFinalAd` receives `approvedTov` as an *input* (`generators.ts:5415`) and never returns it. The persistence is performed **client-side** by the browser: `src/App.tsx` adds `approvedTov` to the `saveGeneration` `outputData` (5 render-phase call sites), and `src/services/feedbackService.ts:254` writes the doc via `addDoc(collection(db, 'generations'), cleanRecord)` with `output: { phase, ...outputData, fullResponse }` (`227-231`). So approvedTov IS persisted — but by the frontend, not by `serverGenerateFinalAd`. ⚠️ Reliability note: the commit body itself acknowledges "the small fraction of new docs where the frontend save raced and the field wasn't included"; a `reconstructApprovedTovFromBuildPlan` fallback (`sizeVariant.ts:238`) mitigates but is best-effort (empty when the build plan lacks a `[[PROADS_MACHINE_PLAN_V1]]` block). The data-flow itself has **no key mismatch and no gap** (see #37), so the feature works on the happy path — but the criterion as written (serverGenerateFinalAd is the writer) is not implemented.
- [PASS] #37 — `generateSizeVariant` reads approvedTov from the SAME field path that is written — evidence: read path `functions/src/sizeVariant.ts:163` `let approvedTov = parent.output?.approvedTov ?? "";`; actual write path `src/services/feedbackService.ts:227-231` `output: { phase, ...outputData }` (outputData carries `approvedTov`) → `addDoc(collection(db, 'generations'), …)` (`254`). **Read = `output.approvedTov`; write = `output.approvedTov` — exact match.** (The writer is the frontend, not `serverGenerateFinalAd` per #36, but the read path matches the actual write path.)

---

## #36 / #37 — EXACT field path (character-for-character)

| | Path | Where |
|---|---|---|
| **WRITTEN** | `output.approvedTov` | `src/services/feedbackService.ts:227-231` (`output: { phase, ...outputData }`, `outputData.approvedTov`) committed via `addDoc(collection(db, 'generations'), cleanRecord)` at `:254`. Populated from `src/App.tsx` `saveGeneration({ …, approvedTov: selectedTov })` (single: `~4406`; batch: `~4694`; carousel: `~5066`; magic-edit: `~5348`; favorites: `~5973`). |
| **READ** | `output.approvedTov` | `functions/src/sizeVariant.ts:163` `parent.output?.approvedTov`. |
| **serverGenerateFinalAd writes** | *(nothing to `generations`)* | `functions/src/index.ts:4333` returns `{success, imageBase64, storageUrl, errorCode, costEstimate, resolutionTrace}` — no Firestore generations write, no `approvedTov`. |

**Read path (`output.approvedTov`) === actual write path (`output.approvedTov`).** No key mismatch. The only discrepancy is **who** writes it: the frontend (`feedbackService`), not `serverGenerateFinalAd`.

## ALSO CHECK results

- **Full data flow**: `serverGenerateFinalAd` → returns image/URL (no copy data) → **frontend** `feedbackService.saveGeneration` writes `output.approvedTov` to the `generations` doc → `sizeVariant.readParentContext` reads `parent.output?.approvedTov` → `extractCopyFieldsFromResponse` → `buildVariantEditInstruction` + `validateCopyFidelity`. **No key-mismatch gap.** The one structural weakness is that persistence depends on a successful client-side `addDoc` (race-prone, per the commit), with a best-effort `reconstructApprovedTovFromBuildPlan` fallback.
- **Active `reflowImage` callable invocations**: **0** (all `reflowImage` strings in `App.tsx` are comments or `CREDIT_COSTS.reflowImage` cost-constant reads at `8874/8984/8985`).
- **Type errors / undefined refs**: none — `functions` and frontend `tsc --noEmit` both exit 0.

---

## Summary

**36 / 37 PASS · 1 / 37 FAIL** (#36).

## Verdict: **FAIL** (1 criterion not implemented as specified)

The single failure is a **persistence-location / criterion-attribution** issue, not a broken data flow: the happy-path data flow is complete and key-consistent (#37 PASS), but `serverGenerateFinalAd` does **not** persist `approvedTov` — the frontend does. Because the criterion explicitly names `serverGenerateFinalAd in index.ts` as the writer and the code does not implement that, #36 fails under the strict rule.

### Remediation for #36 (choose one)

1. **Make it true (server-authoritative persistence — recommended for robustness):** in `serverGenerateFinalAd` (`functions/src/index.ts:4318` success branch, after the Storage upload), write the generations doc server-side (or merge-update it) including `output.approvedTov` (the handler already has `approvedTov` in `request.data`, `index.ts:4245`). This removes the client-save race the commit body flags and guarantees the field is present before any `generateSizeVariant` call. Keep the read at `sizeVariant.ts:163` unchanged (path already matches).
2. **Reword the criterion:** if client-side persistence is the intended design, restate #36 as "the frontend persists `output.approvedTov` via `feedbackService.saveGeneration` after a successful render" — then it PASSES as-is (write/read both `output.approvedTov`, verified).

### Delta from v3

| # | v3 | v4 | Change |
|---|----|----|--------|
| #36 (new) | — | **FAIL** | `approvedTov` persistence added, but client-side (`feedbackService`), not in `serverGenerateFinalAd` as the criterion specifies. |
| #37 (new) | — | **PASS** | Read path `output.approvedTov` (`sizeVariant.ts:163`) exactly matches the actual write path `output.approvedTov` (`feedbackService.ts:227-254`). |
| #1–#35 | PASS | **PASS** | Changed files since v3 are additive (reconstruction fallback, debug logs, `approvedTov` save fields, type field); core variant/resize/backoff logic unchanged and re-confirmed; both typechecks clean. |

### Non-blocking notes (carried)
- **Cosmetic**: 3 UI cost labels still read `CREDIT_COSTS.reflowImage` (= 5, identical to `generateSizeVariant`) — `App.tsx:8874/8984/8985`.
- **Test coverage**: `functions/src/__tests__/sizeVariant.test.ts` remains structural (does not invoke `generateSizeVariantHandler`); the approvedTov read/reconstruction path is not exercised end-to-end by an automated test.
