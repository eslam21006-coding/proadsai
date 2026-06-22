# Phase 17 Implementation Audit v2 — `961-independent-multisize`

**Date**: 2026-06-21
**HEAD**: `73679b3` fix(phase-17): fix edit instruction, batch/carousel resize crash, and reflow prompt injection
**Auditor**: Claude (strict, evidence-based; every file re-read from scratch — no v1 passes assumed)
**Spec**: `specs/961-independent-multisize/spec.md`

---

## Architecture (7)

- [PASS] #1 — Anchor uses existing `serverGenerateFinalAd`; `generateSizeVariant` never called for anchor — evidence: `src/App.tsx:4405-4433` (fan-out runs AFTER the primary `mockupResult` from the existing path; only `extraSizes` call `generateSizeVariant`). All `generateSizeVariant` call sites (`4419, 4689, 5548, 5652, 5713, 5826`) are non-anchor. No anchor render routes through `sizeVariant.ts`.
- [PASS] #2 — `generateSizeVariant` only for additional sizes + resizes — evidence: `src/App.tsx:4419` (US1 extra sizes), `4689` (batch extra sizes), `5548` (batch_all resize), `5652` (carousel_slide resize), `5713` (carousel_all resize), `5826` (single resize). No anchor usage.
- [PASS] #3 — Client-side fan-out, no server-side batch loop — evidence: `functions/src/sizeVariant.ts:212-595` handles exactly ONE variant per invocation; all multi-item loops are client-side (`src/App.tsx:4727`, `5579`, `5748` wave loops; `4412` sequential).
- [PASS] #4 — Concurrency cap ≤10 client-side — evidence: `src/App.tsx:4725`, `5576`, `5746` all `const CONCURRENCY_CAP = 10;` with wave chunking.
- [PASS] #5 — HOTFIX-F files commented/superseded header, NOT deleted — evidence: `functions/src/reflowImage.ts:1-2`, `reflowRouter.ts:1-2`, `reflowOutpaint.ts:1-2`, `reflowRerender.ts:1-2` all carry `// Superseded by Phase 17 independent multi-size generation. Kept for reversibility.`; all four files still present (not deleted). The `reflowImage` callable registration is additionally commented out (`functions/src/index.ts:4360-4370`, inside `/* */`).
- [PASS] #6 — REFLOW block conditional on `reflowInstruction`, NOT injected into every prompt — evidence: `functions/src/generators.ts:6665` `${reflowInstruction ? \`- REFLOW: Ratio ${currentAspectRatio}. Spatial reflow only...\` : ''}`. The variant path does NOT pass `reflowInstruction` (`sizeVariant.ts:468-477` passes only through `styleReference`; the 11th positional `reflowInstruction` is undefined), so the line is omitted for variants and fresh single renders.
- [PASS] #7 — `MODEL_PROVIDER` intact, unmodified — evidence: `functions/src/modelConfig.ts:3` `export const MODEL_PROVIDER: "openai" | "gemini" = "openai";`; `sizeVariant.ts:465` honors it (`deps.modelProvider ?? MODEL_PROVIDER`); routing via `createVisualRoutingCaller` (`index.ts:4387`).

## Backend — sizeVariant core (8)

- [PASS] #8 — Reuses saved build plan, does NOT call `generateBuildPlan()` — evidence: `functions/src/sizeVariant.ts:161` reads `parent.output?.buildPlan`; `468-469` passes `ctx.buildPlan` to `generateFinalAd`. No `generateBuildPlan` import/call (only doc-comment mentions at `4`, `443`, confirming intent).
- [PASS] #9 — Does NOT write a Phase 23 anti-sameness fingerprint — evidence: variant renders via `generateFinalAd` (`generators.ts:5414-7586`); `awk` over that range shows **zero** `recordAngleFingerprint` calls (they live at `generators.ts:2879` and `7945+`, outside the range). `sizeVariant.ts` never calls it.
- [PASS] #10 — `buildVariantEditInstruction` builds a ratio-appropriate edit instruction for the TARGET ratio — evidence: `functions/src/sizeVariant.ts:615-647`; lines `627-629` use `targetRatio` ("adapt this ad from ${sourceRatio} to ${targetRatio} canvas… use the layout rules appropriate for ${targetRatio}"). Called with `targetRatio: data.targetAspectRatio` at `450-452`.
- [PASS] #11 — `buildFinalImagePrompt` OR `buildVariantEditInstruction` called with `targetAspectRatio` — evidence: `functions/src/sizeVariant.ts:450-459` `buildVariantEditInstruction({ targetRatio: data.targetAspectRatio, ... })`; the result is passed as `editInstruction` to `generateFinalAd(..., data.targetAspectRatio, variantEditInstruction, ...)` (`468-474`), and `generateFinalAd` assembles the prompt from the saved build plan for that ratio.
- [PASS] #12 — `validateCopyFidelity` runs with actual validation (not hardcoded `1`) — evidence: `functions/src/sizeVariant.ts:487-494`: `const { technicalPrompt } = parseBuildPlanEnvelope(ctx.buildPlan); const fidelityCheck = validateCopyFidelity(technicalPrompt, {...copyFields}); copyFidelityPasses = fidelityCheck.passed ? 1 : 0;` — a real call whose result drives `copyFidelityPasses` and a warn-log on failure (`495-505`). (Note: it validates the reused build plan's technical prompt against the copy fields — a text-fidelity check, inherent to `validateCopyFidelity`, not image inspection.)
- [PASS] #13 — `null` copy fields carried forward as `null`, not "" — evidence: `functions/src/sizeVariant.ts:445-458` derives fields via `extractCopyFieldsFromResponse` (no coercion); `buildVariantEditInstruction` only appends `subheadText`/`ctaName`/`benefitText` lines when truthy (`633-641`), so null fields produce no text. Test fixture 2 (`__tests__/sizeVariant.test.ts`) asserts null inheritance.
- [PASS] #14 — Reference priority uploaded > own_original > anchor > none — evidence: `functions/src/sizeVariant.ts:191-206` `resolveReference()` returns in exactly that order.
- [PASS] #15 — Same-size no-op, zero credits — evidence: `functions/src/sizeVariant.ts:294-305` (existing `succeeded` variant → returns `noOp:true, creditsCharged:0, netCreditsCharged:0` before any charge); frontend surfaces "Already generated at this size" (`App.tsx` single-resize no-op handler).

## Backend — handler/callable (5)

- [PASS] #16 — Registered onCall, region europe-west1, secrets — evidence: `functions/src/index.ts:4378-4392` `export const generateSizeVariant = onCall({ region: "europe-west1", secrets: [geminiApiKey, openaiApiKey], timeoutSeconds: 300, memory: "2GiB", maxInstances: 30 }, ...)`.
- [PASS] #17 — Server-side ratio validation vs UI_RATIOS — evidence: `functions/src/sizeVariant.ts:42` `UI_RATIOS = ["1:1","3:4","9:16"]`, `44-46` `isUIRatio`, `74-76` rejects non-UI_RATIO with `invalid-argument` before any charge.
- [PASS] #18 — Upfront 5-credit charge per design (value = 5) — evidence: `functions/src/entitlements.ts:583` `SIZE_VARIANT_CREDIT_COST = 5`; charged upfront in transaction `sizeVariant.ts:396-399` (`increment(-SIZE_VARIANT_CREDIT_COST)`). `COSTS.generateSizeVariant = 5` (`index.ts:125`), `CREDIT_COSTS.generateSizeVariant = 5` (`src/planconfig.ts:27`).
- [PASS] #19 — Refund on failure — evidence: `functions/src/sizeVariant.ts:580-587` (failure path: `refundRef.update({ credits: increment(SIZE_VARIANT_CREDIT_COST) })`); trace records `refunded` (`538`).
- [PASS] #20 — Idempotency key prevents double-charge — evidence: `functions/src/sizeVariant.ts:107-114` `buildIdempotencyKey` (`genId:scope:itemIndex:ratio`); the charge transaction re-reads the doc and throws `aborted` on a concurrent `pending` same-key variant / `already-exists` on `succeeded` (`364-389`).

## Frontend — pre-select multi-size (5)

- [PASS] #21 — Multi-select for single & batch — evidence: `src/App.tsx:7710-7711` toggle add/remove on `selectedSizes` for non-carousel modes; `selectedSizes: Set<AspectRatio>` (`2599`).
- [PASS] #22 — Carousel restricted to single-size pre-select — evidence: `src/App.tsx:7708` `if (inputs?.adMode === 'carousel') return new Set([r.key]);` (forces single-select); backend rejects carousel pre-select (`sizeVariant.ts:92-95`, VR-2).
- [PASS] #23 — Anchor-first orchestration — evidence: `src/App.tsx:4405-4433` (anchor `mockupResult` produced first via existing path; `extraSizes` then call `generateSizeVariant` with `sourceImageOverride` = anchor image at `4432`).
- [PASS] #24 — Total credit cost displayed before generation (designs × 5) — evidence: `src/App.tsx:7256` `totalCreditCost = totalSelectedConcepts * (perPrimaryCost + (numSizes - 1) * perReflowCost)`; rendered at `7744/7758/7780/7799`.
- [PASS] #25 — Insufficient credits blocked before any generation — evidence: `src/App.tsx:4329` `if (userCredits < totalNeeded) { ... setShowUpgradeModal(true); return; }` ahead of render; resize paths gate too (`5515`, `5639`).

## Frontend — resize flow (4)

- [PASS] #26 — All four named resize paths call `generateSizeVariant` (not `reflowImage`) — evidence: **single** `src/App.tsx:5826` (`scope:'single'`), **batch_all** `5548/5552` (`scope:'batch'`), **carousel_all** `5713` (`scope:'carousel'`), **carousel_slide** `5652/5656` (`scope:'carousel'`, `itemIndex:slideIdx`). All four repointed off the commented-out `reflowImage`. ⚠️ See Note A — two *non-resize-picker* paths (magic-edit multi-size propagation `2530`, batch retry "reflow" sub-mode `4823`) still reference the dead `reflowImage` callable.
- [PASS] #27 — Original generated image sent as visual reference for resize — evidence: `src/App.tsx:5835` single resize `sourceImageOverride: reflowSource` ("ALWAYS the ORIGINAL generation source"); batch `5584` (`orig.src`); carousel `5660`. Backend resolves as `own_original` (`sizeVariant.ts:199-200`).
- [PASS] #28 — Edit instruction contains ratio-appropriate layout rules + all non-null text elements — evidence: `functions/src/sizeVariant.ts:626-645` `buildVariantEditInstruction` emits "use the layout rules appropriate for ${targetRatio}" (`629`) and conditionally lists Headline/Subheadline/CTA/Benefit only when non-null (`631-641`), plus "All four text layers and the CTA button must be visible and balanced" (`642-643`).
- [PASS] #29 — Resize works for single, batch (all items), carousel (all slides + individual slide) — evidence: single (`5826`), batch_all all items via waves (`5579-5596`), carousel_all all slides (`5748-5751`), carousel_slide individual (`5652`) — all via `generateSizeVariant`.

## Frontend — UX (4)

- [PASS] #30 — Per-item/per-slide independent loading — evidence: `src/App.tsx:4730`, `5534` set each item to `status:'rendering'`; per-item resolution (`5601-5617`); per-tile spinner/done/error render (`8088`).
- [PASS] #31 — Partial failure: successes shown, failed offer retry, successes preserved — evidence: batch error tile `src/App.tsx:8088-8089` ("Resize failed" + `<button onClick={() => handleBatchRetry(idx)}>Try again</button>`, default `retryMode='rerender'` → fresh rerender at `4834-4842`); waves keep succeeded items (`5604-5610`); `5623-5626` shows "Resized N/M — K failed" without discarding successes.
- [PASS] #32 — Results grouped/displayed by size — evidence: `src/App.tsx:7832` "Size Navigator" over selected sizes; grid filters by `item.ratio === currentAspectRatio` (`7929`); per-size done counts (`7857`).
- [PASS] #33 — `runWithBackoff` AND `runBatchItemWithBackoff` base 1s, ×2, max 4, jitter — evidence: `runWithBackoff` `src/App.tsx:4697`/`4714-4715` (`attempt < 4`, `Math.min(8000, 1000 * Math.pow(2, attempt - 1)) + Math.random() * 250`); `runBatchItemWithBackoff` `5540`/`5565-5566` (identical formula); plus `runSlideWithBackoff` `5720`/`5736-5737`.

---

## Summary

**33 / 33 PASS · 0 / 33 FAIL**

## Verdict: **PASS**

All 33 criteria are explicitly implemented in the code. Commit `73679b3` resolved every failure from the v1 audit.

### Delta from v1 (previously-failing criteria that now PASS)

| # | v1 | v2 | What changed |
|---|----|----|--------------|
| #5 | FAIL | **PASS** | Criterion v2 accepts "commented out OR superseded header"; all four reflow files carry the superseded header and are not deleted (`reflowImage.ts:1-2` etc.). |
| #6 | FAIL | **PASS** | The `- REFLOW: Ratio` line in `coreDesignRules` is now gated: `generators.ts:6665` `${reflowInstruction ? … : ''}` — no longer injected into every render. |
| #10 | FAIL | **PASS** | New `buildVariantEditInstruction` (`sizeVariant.ts:615-647`) builds a real, target-ratio-appropriate directive (was `undefined`). |
| #11 | FAIL | **PASS** | `buildVariantEditInstruction({ targetRatio: data.targetAspectRatio })` (`450-452`) supplies the target ratio. |
| #12 | FAIL | **PASS** | Real `validateCopyFidelity(technicalPrompt, copyFields)` call (`488-494`); `copyFidelityPasses` set from result, no longer hardcoded `1`. |
| #26 | FAIL | **PASS** | `batch_all` (`5552`) and `carousel_slide` (`5656`) resize repointed from the dead `reflowImage` callable to `generateSizeVariant`. |
| #28 | FAIL | **PASS** | The edit instruction now carries ratio-appropriate layout rules + non-null copy fields (`626-645`), instead of a literal "undefined" command. |
| #29 | FAIL | **PASS** | Batch all-items resize now uses `generateSizeVariant` with `<=10` waves + 429 backoff (`5540-5596`), no longer crashing on the commented-out callable. |

### Notes (non-blocking; not part of the 33 criteria)

- **Note A — two residual `reflowImage` callers remain** (outside the four named resize paths): `src/App.tsx:2530` (Magic-Edit multi-size auto-propagation, gated by `selectedSizes.size > 1`, wrapped in try/catch) and `src/App.tsx:4823` (batch-item retry when the user picks the optional **"reflow"** retry sub-mode at `7997`/`8082`). Both target the commented-out `reflowImage` callable and would fail at runtime if reached. The default batch retry ("Try again", `8089`) uses `retryMode='rerender'` and is unaffected. Recommend repointing both to `generateSizeVariant` or removing the dead callable references for full consistency.
- **Note B — test suite is structural.** `functions/src/__tests__/sizeVariant.test.ts` still re-implements helper logic locally and does **not** import/invoke `generateSizeVariantHandler` or `buildVariantEditInstruction` (50 assertions, none against the real handler). The edit-instruction/`validateCopyFidelity` wiring is therefore not exercised end-to-end by the suite. Consider an integration test that stubs the visual caller and asserts a real `editInstruction` (containing the target ratio + non-null copy) and a real `validateCopyFidelity` pass.
