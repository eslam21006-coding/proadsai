# Phase 17 Implementation Audit — `961-independent-multisize`

**Date**: 2026-06-21
**Auditor**: Claude (strict, evidence-based)
**Spec**: `specs/961-independent-multisize/spec.md`
**Method**: Read actual source. A criterion is PASS only where the code explicitly implements it; implicit/assumed behavior is FAIL.

---

## Architecture (7)

- [PASS] #1 — Anchor uses existing `serverGenerateFinalAd`; `generateSizeVariant` never called for anchor — evidence: `src/App.tsx:4405-4475` (fan-out runs AFTER the primary `mockupResult` from the existing render path; only `extraSizes` call `generateSizeVariant`). Anchor render never routes through `sizeVariant.ts`.
- [PASS] #2 — `generateSizeVariant` only for additional sizes + resizes — evidence: call sites `src/App.tsx:4418` (US1 extra sizes), `4688` (batch extra sizes), `5657` (carousel resize), `5770` (single resize). No anchor call site.
- [PASS] #3 — Client-side fan-out, no server-side batch loop — evidence: `functions/src/sizeVariant.ts` handles exactly ONE variant per invocation; orchestration loops are client-side (`src/App.tsx:4412` for-loop, `4727` wave loop, `5538`/`5655` `Promise.allSettled`).
- [PASS] #4 — Concurrency cap ≤10 enforced client-side — evidence: `src/App.tsx:4725` `const CONCURRENCY_CAP = 10;` + `4727-4741` wave chunking via `Promise.allSettled`.
- [FAIL] #5 — HOTFIX-F files commented out with superseded comment, NOT deleted — Expected: the four reflow module **bodies** commented out (per task T024). Found: files carry only a superseded **header comment**; their bodies are **live, compiled, and imported** — `functions/src/reflowImage.ts:1-6` (header only), still imported at `functions/src/index.ts:29` (`import { reflowImageHandler }`) and `reflowRerender.ts:5` imports live `generateFinalAd`; `reflowRouter.ts:7` exports live `RATIO_TO_NUMERIC` consumed by `reflowOutpaint.ts:7`. Only the `reflowImage` **callable registration** is commented (`index.ts:4361`), not the files. Not deleted ✓ and superseded comment ✓, but "commented out" ✗.
- [FAIL] #6 — REFLOW block in generators.ts commented out OR unreachable — Expected: the "REFLOW: Ratio" instruction block neutralized. Found: `functions/src/generators.ts:6668` `- REFLOW: Ratio ${currentAspectRatio}. Spatial reflow only...` is **active**, living inside `coreDesignRules` (defined `generators.ts:5951`), which is injected into **every** render — both the fresh path (`buildFinalImagePrompt(..., coreDesignRules, ...)` at `6913`) and the edit path (`${coreDesignRules}` at `6822`). It fires on every `generateFinalAd` call including size variants. Not commented, not unreachable. (Note: the *separate* gated REFLOW-MODE block at `6730-6801` is reachable only via `INTERNAL_REFLOW_TOKEN`/`isInternalReflow` and is effectively dead now, but criterion #6 targets the line at ~6665+, which is live.)
- [PASS] #7 — `MODEL_PROVIDER` switch intact, unmodified — evidence: `functions/src/modelConfig.ts:3` `export const MODEL_PROVIDER: "openai" | "gemini" = "openai";`; `sizeVariant.ts:435` respects it (`deps.modelProvider ?? MODEL_PROVIDER`); routing preserved via `createVisualRoutingCaller` (`index.ts:4387`).

## Backend — sizeVariant core (8)

- [PASS] #8 — Reuses saved build plan, does NOT call `generateBuildPlan()` — evidence: `functions/src/sizeVariant.ts:156` reads `parent.output?.buildPlan`; `438-447` passes `ctx.buildPlan` to `generateFinalAd`. No `generateBuildPlan` import or call in `sizeVariant.ts`.
- [PASS] #9 — Does NOT write a Phase 23 anti-sameness fingerprint — evidence: variant renders via `generateFinalAd` (`generators.ts:5414-7586`); `recordAngleFingerprint` calls live at `generators.ts:2879` and `7945+` — both OUTSIDE that range. `sizeVariant.ts` never calls it.
- [FAIL] #10 — Layout contract derived for the TARGET ratio via `buildFinalImagePrompt` — Expected: variant rebuilds the ratio-appropriate layout contract through `buildFinalImagePrompt`. Found: `sizeVariant.ts:445` passes `ref.image` as `base64ToEdit`; in `generators.ts:6670` `if (base64ToEdit)` is then TRUE, routing the variant into the **edit/polish branch** (`6802`), NOT the fresh path. `buildFinalImagePrompt` is only invoked in the `else` branch (`generators.ts:6900`, reached only when `base64ToEdit` is falsy). So the layout contract is never built for variants that have a reference (i.e., the mainline resize + pre-select flows).
- [FAIL] #11 — `buildFinalImagePrompt` called with `targetAspectRatio` — Expected: `buildFinalImagePrompt({ aspectRatio: target, ... })` per research R1 / contract step 5. Found: NOT called for variants. `sizeVariant.ts:438-447` calls `generateFinalAd(...)` with `base64ToEdit = ref.image`, which forces the edit path (`generators.ts:6670/6802`); `buildFinalImagePrompt` (`generators.ts:6900`) sits in the unreachable `else`. The variant prompt is the EDIT/POLISH template (`6804-6823`) with `editInstruction` undefined (renders literal "undefined" at `6810`).
- [FAIL] #12 — `validateCopyFidelity` runs with retries on the variant output — Expected: copy-fidelity validation on each variant. Found: `validateCopyFidelity` is only called at `generators.ts:4705` and `4943`, both inside the build-plan function (< line 5414); it is NOT called anywhere in `generateFinalAd` (5414-7586) and never in `sizeVariant.ts`. The handler hardcodes `copyFidelityPasses = 1` (`sizeVariant.ts:448`) without running any validation. Since the variant reuses the saved plan and renders via the edit path, no copy-fidelity pass occurs.
- [PASS] #13 — `null` copy fields carried forward as `null`, not "" — evidence: copy fields come from the parent's stored brief (`ctx.inputs`/`approvedTov`), not re-coerced; the edit-path prompt explicitly branches on null (`generators.ts:6815-6817` "NO SUBHEADLINE / NO CTA"). Test fixture 2 (`__tests__/sizeVariant.test.ts:151-174`) asserts `subheadText === null` inheritance.
- [PASS] #14 — Reference priority uploaded > own_original > anchor > none — evidence: `functions/src/sizeVariant.ts:186-201` `resolveReference()` returns in exactly that order.
- [PASS] #15 — Same-size no-op, zero credits — evidence: `functions/src/sizeVariant.ts:289-300` (existing `succeeded` variant → returns `noOp:true, creditsCharged:0, netCreditsCharged:0` before any charge).

## Backend — handler/callable (5)

- [PASS] #16 — Registered onCall, region europe-west1, secrets — evidence: `functions/src/index.ts:4378-4392` `export const generateSizeVariant = onCall({ region: "europe-west1", secrets: [geminiApiKey, openaiApiKey], timeoutSeconds: 300, memory: "2GiB", ... })`.
- [PASS] #17 — Server-side ratio validation vs UI_RATIOS — evidence: `functions/src/sizeVariant.ts:37` `UI_RATIOS = ["1:1","3:4","9:16"]`, `39-41` `isUIRatio`, `69-71` rejects non-UI_RATIO with `invalid-argument` before any charge (PRE-3).
- [PASS] #18 — Upfront 5-credit charge per design (value = 5) — evidence: `functions/src/entitlements.ts:583` `SIZE_VARIANT_CREDIT_COST = 5`; charged upfront in transaction `sizeVariant.ts:391-394` (`increment(-SIZE_VARIANT_CREDIT_COST)`). `COSTS.generateImage = 5` and `COSTS.generateSizeVariant = 5` (`index.ts:125`). Value is 5. (Note: uses the parallel `SIZE_VARIANT_CREDIT_COST` constant, not `COSTS.generateImage` directly — same value.)
- [PASS] #19 — Refund on failure — evidence: `functions/src/sizeVariant.ts:522-535` (failure path: `refundRef.update({ credits: increment(SIZE_VARIANT_CREDIT_COST) })`); trace records `refunded` (`480`).
- [PASS] #20 — Idempotency key prevents double-charge — evidence: `functions/src/sizeVariant.ts:102-109` `buildIdempotencyKey` (`genId:scope:itemIndex:ratio`); transaction re-reads the doc and aborts on a concurrent `pending`/`succeeded` same-key variant (`348-384`, `HttpsError('aborted')`/`'already-exists'`).

## Frontend — pre-select multi-size (5)

- [PASS] #21 — Multi-select for single & batch — evidence: `src/App.tsx:2599` `selectedSizes: Set<AspectRatio>`; selector toggles add/remove (`7648-7657`) for non-carousel modes.
- [PASS] #22 — Carousel restricted to single-size pre-select — evidence: `src/App.tsx:7651-7652` `if (inputs?.adMode === 'carousel') return new Set([r.key]);` (forces single-select); backend also rejects carousel pre-select (`sizeVariant.ts:87-91`, PRE-4/VR-2).
- [PASS] #23 — Anchor-first orchestration — evidence: `src/App.tsx:4405-4433` (anchor `mockupResult` produced first via existing path; `extraSizes` then call `generateSizeVariant` with `sourceImageOverride` = anchor image at `4432`).
- [PASS] #24 — Total credit cost displayed before generation (designs × 5) — evidence: `src/App.tsx:7693` renders `{totalCreditCost}`; `7688` shows "concepts × {numSizes} sizes"; cost derives from `numSizes` (`7197`). (Minor: stale helper text at `7674` still says "auto-reflow" but the numeric cost is shown.)
- [PASS] #25 — Insufficient credits blocked before any generation — evidence: `src/App.tsx:4329` `if (userCredits < totalNeeded) { ... setShowUpgradeModal(true); return; }` ahead of the render; resize paths gate too (`5515`, `5586`, `5630`).

## Frontend — resize flow (4)

- [FAIL] #26 — Resize calls `generateSizeVariant` (NOT `reflowImage`) — Expected: all resize scopes route to `generateSizeVariant`. Found: only **single** (`src/App.tsx:5770`) and **carousel_all** (`5657`) use it. **batch_all** still calls `reflowImage` (`5536`) and **carousel_slide** still calls `reflowImage` (`5595`); the multi-size auto-reflow at `2530` also calls `reflowImage`. Worse, the `reflowImage` callable is commented out (`functions/src/index.ts:4361`), so these calls hit a non-existent function at runtime.
- [PASS] #27 — Original image sent as visual reference for resize — evidence: `src/App.tsx:5780` single resize passes `sourceImageOverride: reflowSource` ("ALWAYS the ORIGINAL generation source"); backend resolves it as `own_original` (`sizeVariant.ts:194-196`).
- [FAIL] #28 — Full generation prompt rebuilt for the target canvas (not just "resize to X") — Expected: the variant rebuilds the full generation prompt via `buildFinalImagePrompt`. Found: because `base64ToEdit` is set (`sizeVariant.ts:445`), the variant renders through the EDIT/POLISH prompt branch (`generators.ts:6802-6823`) with `editInstruction` undefined, NOT the full prompt-assembly entry point (`buildFinalImagePrompt`, `generators.ts:6900`, bypassed). The model is told "You are editing the attached image" + reuses `coreDesignRules` (which still carries the active "REFLOW: Ratio … Spatial reflow only" line), and the OpenAI path routes to `images.edit` (`openAIImageCaller.ts:88`). This is closer to an edit/transform than a fresh full-prompt rebuild.
- [FAIL] #29 — Resize works for single, batch (all items), carousel (all slides) — Found: single (`5770`, gSV) ✓ and carousel-all-slides (`5657`, gSV) ✓, but **batch all-items** resize uses `reflowImage` (`5536`) — a callable that is commented out (`index.ts:4361`) and thus runtime-broken; `carousel_slide` likewise (`5595`). Batch resize does not deliver the Phase 17 native-regeneration path.

## Frontend — UX (4)

- [PASS] #30 — Per-item/per-slide independent loading — evidence: `src/App.tsx:4730` sets each wave item to `status:'rendering'`; per-item resolution (`4744-4752`); batch tiles render spinner/done/error per item (`8033`).
- [PASS] #31 — Partial failure: successes shown, failed offer retry, successes preserved — evidence: `src/App.tsx:8033-8034` error tile renders "Resize failed" + `<button onClick={() => handleBatchRetry(idx)}>Try again</button>`; waves keep succeeded items (`4748-4755`); `5568-5573` shows "Resized N/M — K failed" without discarding successes.
- [PASS] #32 — Results grouped/displayed by size — evidence: `src/App.tsx:7777` "Size Navigator" tabs over selected sizes; grid filters by `item.ratio === currentAspectRatio` (`7874`); per-size done counts (`7802`).
- [PASS] #33 — `runWithBackoff` base 1s, ×2, max 4 attempts, jitter — evidence: `src/App.tsx:4697-4718` `runWithBackoff` (`attempt < 4`, `delay = Math.min(8000, 1000 * Math.pow(2, attempt - 1)) + Math.random() * 250`); carousel variant `5665-5685`.

---

## Summary

**25 / 33 PASS · 8 / 33 FAIL**

Failures: #5, #6, #10, #11, #12, #26, #28, #29.

## Verdict: **FAIL**

The credit/idempotency/registration/validation-gate scaffolding and the frontend pre-select/UX are solid, but the **core rendering mechanism does not match the Phase 17 architecture**, and the HOTFIX-F retirement is inconsistent (registration commented while callers remain).

### Failures + remediation

1. **#10/#11/#12/#28 — Variants render through the edit/transform path, not the fresh `buildFinalImagePrompt` path.**
   Root cause: `functions/src/sizeVariant.ts:445` passes the reference image as `base64ToEdit`, which makes `generators.ts:6670 if (base64ToEdit)` true → EDIT/POLISH branch (`6802`, with `editInstruction` undefined) and `images.edit`. `buildFinalImagePrompt` (`6900`) and `validateCopyFidelity` are never reached for variants.
   **Remediation**: Pass the reference as `styleReference` ONLY (leave `base64ToEdit` undefined) so `generateFinalAd` takes the `else` fresh path (`generators.ts:6825+`) → `buildFinalImagePrompt({ aspectRatio: target, styleReferencePresent: true, reflowInstruction: undefined, ... })` and pushes the style anchor (`6935-6942`). Confirm `validateCopyFidelity` runs on that path (or add an explicit pass), and set `copyFidelityPasses` from the real result rather than hardcoding `1`.

2. **#6 — Active "REFLOW: Ratio … Spatial reflow only" line contaminates every render.**
   `functions/src/generators.ts:6668` inside `coreDesignRules` (`5951`) is injected into both fresh and edit prompts.
   **Remediation**: Comment out (or gate behind `reflowInstruction`) the `- REFLOW: Ratio …` line in `coreDesignRules` with the reversibility note (FR-021). It should never appear in a fresh native generation.

3. **#26/#29 — Batch-all and carousel-slide resize still call the commented-out `reflowImage` callable.**
   `src/App.tsx:5536` (batch_all) and `5595` (carousel_slide) — plus the `2530` auto-reflow — call `httpsCallable(..., 'reflowImage')`, but `functions/src/index.ts:4361` has the registration commented out → runtime "not-found".
   **Remediation**: Repoint `batch_all` and `carousel_slide` (and the `2530` multi-size auto-reflow) to `generateSizeVariant` (scope `'batch'`/`'carousel'`, correct `itemIndex`, `sourceImageOverride` = each item's/slide's own original), mirroring the carousel-all (`5655`) and single (`5770`) paths. OR, if a phased migration is intended, re-enable the `reflowImage` registration until those callers are migrated.

4. **#5 — HOTFIX-F module bodies are not commented out (only a header comment was added).**
   Task T024 specified commenting the bodies of `reflowImage.ts` / `reflowRouter.ts` / `reflowOutpaint.ts` / `reflowRerender.ts`. They remain live and imported (`index.ts:29`, `reflowRerender.ts:5`).
   **Remediation**: Either (a) comment out the module bodies with the `// Superseded by Phase 17 … Kept for reversibility.` prefix and remove the live `reflowImageHandler` import once #26/#29 no longer need it, or (b) consciously revise FR-021/T024 to accept "registration commented + header note" as the chosen neutralization and document that the bodies are intentionally retained (e.g., for shared `RATIO_TO_NUMERIC`/outpaint utilities). As written, it does not satisfy the criterion.

### Note on test coverage
`functions/src/__tests__/sizeVariant.test.ts` re-implements helper logic locally (UI_RATIOS, reference priority, idempotency key, cost) and does **not** invoke `generateSizeVariantHandler` or the real render path. Fixture 1 ("Story 9:16 no-drop") only checks `isUIRatio`, not actual CTA rendering — so the edit-path defect (#10–#12) is not caught by the suite. Consider an integration test that stubs the visual caller and asserts the variant goes through `buildFinalImagePrompt` (e.g., spy that `base64ToEdit` is NOT set / `styleReferencePresent` IS set).
