# Implementation Plan: Independent Multi-Size Ad Generation

**Branch**: `961-independent-multisize` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/961-independent-multisize/spec.md`

## Summary

Replace the broken reflow/resize path (HOTFIX-F) with **independent per-size regeneration**. Each requested size is rendered as a fresh native design: the anchor (primary) size uses the existing unchanged single-size pipeline (`serverGenerateFinalAd`), and every additional size and every resize uses a new size-variant path that re-runs `buildFinalImagePrompt()` → `validateCopyFidelity()` for the target aspect ratio while passing the anchor/source image **as a visual reference** (`imageParts` + `styleReferencePresent`), never as pixels to transform. Generation fans out client-side anchor-first in concurrency-capped waves (≤10). Credits are charged upfront with auto-refund on per-design failure. The Firestore schema is extended additively (single → existing `mockupHistory`; batch/carousel → per-ratio `sizeVariants` maps; `ResolutionTrace.sizeVariantTrace`). HOTFIX-F code is commented out, not deleted.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (Vite frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Admin SDK, Firestore, Firebase Storage; OpenAI `gpt-image-2` for visuals (gated by `MODEL_PROVIDER` in `modelConfig.ts`), Gemini 3.5 for copy/concepts; React 19, Zustand, Tailwind CSS 3, Vite 7
**Storage**: Firestore `generations/{genId}` (additive only — no migration): single-image variants reuse existing `mockupHistory: {url, ratio}[]`; batch items and carousel slides gain `sizeVariants: { [ratio]: SizeVariant }`; `ResolutionTrace` gains optional `sizeVariantTrace`. Rendered images in Firebase Storage (existing path scheme).
**Testing**: Functions test suites under `functions/src/__tests__/` (culturalCompliance, copyQuality, copyStructure, conditionalCopyFields, modeFormatValidator) via `cd functions && npm test`; frontend `step2OptionalFields` suite via `npm test`.
**Target Platform**: Firebase Cloud Functions region `europe-west1` (project `proadsai-saas`); web app (`app.proadsai.com`)
**Project Type**: Web (React frontend `src/` + Firebase Functions backend `functions/src/`)
**Performance Goals**: Each variant generation completes within the existing 300s per-callable timeout; client orchestrates fan-out in waves of ≤10 concurrent provider image calls; partial failures resolve independently per design.
**Constraints**: Additive Firestore schema only (no migration); `MODEL_PROVIDER` switch must remain functional; reuse `buildFinalImagePrompt()` → `validateCopyFidelity()` contract unchanged; `getFieldSection`/`findEarliest`/`markerRegex` remain hoisted to function-component scope in `App.tsx`; HOTFIX-F (`reflowImage.ts`, `reflowRouter.ts`, `reflowOutpaint.ts`, `reflowRerender.ts`) and the `generators.ts:6665` "REFLOW: Ratio" block commented out (not deleted); `null` is the canonical absent sentinel for optional copy fields; Phase 22/23/24B behavior preserved; merge via GitHub UI only.
**Scale/Scope**: Single, batch (Pro 4/run, Scale 36/run), carousel (Pro 7 slides, Scale 10 slides) × up to 3 sizes; largest pre-select run ≈ 36 items × 3 sizes (batch) handled in concurrency-capped waves; carousel reaches multiple sizes via resize only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Reliability Over Feature Count | Replaces an intermittently-failing reflow with native per-size generation; reduces launch risk, no new exotic surface. | PASS |
| II. The Selected Mode MUST Be Obeyed | Each requested size renders exactly the selected non-null copy fields and the selected canvas; no silent drift. | PASS |
| III. Launch Surface Frozen | Sizes restricted to `UI_RATIOS` (1:1, 3:4, 9:16); carousel pre-select deliberately excluded. | PASS |
| IV. Behavior Contracts Beat Judgment | spec.md has explicit acceptance scenarios, edge cases, and measurable SCs; contracts/ defines pass/fail per callable. | PASS |
| V. Arabic Quality First-Class | Arabic RTL + cultural compliance untouched; same prompt-build/validate contract per size (FR-019). | PASS |
| VI. Hidden Machine Layers Auditable | New size-variant path writes `ResolutionTrace.sizeVariantTrace` (provider, ratio, reference source, fidelity passes, retries, errors). | PASS |
| VII. No Silent Override w/o Rule, Signal, Trace | No-op same-size (signaled "Already generated at this size" + traced), anchor-fail→brief fallback (signaled as retryable failure + traced), refunds (logged). | PASS |
| VIII. Cost Discipline | Affordability pre-check before any charge; no-op detection; idempotency key prevents double-charge; failed designs refunded; no wasteful retries beyond existing fidelity loop. | PASS |
| IX. Proof for Every Fix | Existing suites must stay green; new contract fixtures + before/after on Story 9:16 CTA presence. | PASS |
| X. Spec Before Code | spec.md complete and clarified before this plan. | PASS |
| XI. Frontend and Backend Agree | Allowed sizes, carousel-no-preselect, and affordability enforced in BOTH layers. | PASS |
| XII. Deferred Scope Stays Deferred | Carousel pre-select and non-UI_RATIOS sizes remain out of scope. | PASS |

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/961-independent-multisize/
├── plan.md              # This file
├── spec.md              # Feature specification (clarified)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (callable contracts)
│   ├── generateSizeVariant.md
│   └── credit-flow.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
functions/src/
├── generators.ts            # generateBuildPlan(), buildFinalImagePrompt(), validateCopyFidelity chain;
│                            #   add generateSizeVariant() (new path); comment out REFLOW block (~6665)
├── sizeVariant.ts           # NEW — size-variant orchestration handler (callable body, reference resolution,
│                            #   per-variant credit charge+refund, idempotency, trace assembly)
├── index.ts                 # Register new callable generateSizeVariant; COSTS/ACTION_FEATURE_MAP entry;
│                            #   comment out reflowImage registration (HOTFIX-F superseded)
├── types.ts                 # SizeVariant, SizeVariantStatus, ReferenceSource, SizeVariantTraceEntry,
│                            #   GenerateSizeVariantRequest/Response; extend mockupHistory usage docs
├── entitlements.ts          # credit cost helper for multi-size totals (designs × 5); reuse checkFeature
├── modelConfig.ts           # unchanged (OPENAI_SIZE_BY_ASPECT already covers 1:1/3:4/9:16)
├── reflowImage.ts           # comment out body — // Superseded by Phase 17 ... Kept for reversibility.
├── reflowRouter.ts          # comment out body — superseded
├── reflowOutpaint.ts        # comment out body — superseded
├── reflowRerender.ts        # comment out body — superseded
└── __tests__/
    └── sizeVariant.test.ts  # NEW — contract/unit fixtures for the size-variant path

src/
├── App.tsx                  # Repoint additional-size fan-out + Resize from reflowImage → generateSizeVariant;
│                            #   anchor-first sequencing; per-size grouped display; per-design loading;
│                            #   credit pre-check + cost display; keep getFieldSection hoisted
├── store.ts                 # selectedSizes already present; add per-design variant status if needed
└── constants.ts             # UI_RATIOS source remains authoritative (1:1, 3:4, 9:16)
```

**Structure Decision**: Existing web split (`functions/src/` backend + `src/` frontend). The feature is mostly additive: one new backend module (`sizeVariant.ts`) + one new callable, additive types, and frontend re-pointing of existing multi-size scaffolding (the `selectedSizes` Set, cost pre-calc, per-item loading, and partial-failure handlers already exist). HOTFIX-F files are neutralized in place by commenting.

## Architecture Decisions (summary; detail in research.md)

1. **Anchor-first fan-out (client-orchestrated)** — Frontend generates the anchor size via the existing `serverGenerateFinalAd` (unchanged), then fans out the remaining sizes by calling the new `generateSizeVariant` callable in waves of ≤10, passing the completed anchor image as the visual reference. Each variant is its own function invocation, so no single execution risks the 540s ceiling. This resolves the deferred concurrency-scope question: the cap is a **client fan-out** concern, not a single-function batch.
2. **Size-variant generation reuses the copy-fidelity contract** — `generateSizeVariant()` rebuilds the layout/prompt for the target ratio (via the saved build plan + the existing `buildFinalImagePrompt()` at `aspectRatio = target`), passes the reference image in `imageParts` with `styleReferencePresent = true`, and sets **no** `reflowInstruction`. `validateCopyFidelity()` runs per size with its existing retries (FR-018).
3. **Reference resolution priority** — uploaded reference → source's own original → anchor → none (FR-008, FR-003). Recorded as `ReferenceSource` in the trace.
4. **Credit flow** — Frontend computes `total = designs × 5`, blocks if `userCredits < total` (FR-013). Backend charges 5 upfront at the start of each variant's transaction and refunds 5 on that variant's failure; net = 5 × successes (FR-012a, FR-015). Idempotency key `genId:scope:itemIndex:targetRatio` prevents double-charge on retry (FR-014); same-size success short-circuits as no-op with 0 charge (FR-011).
5. **Additive persistence** — single → `mockupHistory` (existing); batch item / carousel slide → `sizeVariants[ratio]`; trace → `sizeVariantTrace`. No migration; legacy docs behave as before.
6. **HOTFIX-F neutralized, not removed** — reflow files + the `generators.ts` REFLOW block commented with the reversibility note; `reflowImage` callable registration commented out; frontend stops calling it.

## Complexity Tracking

No constitutional violations — table intentionally omitted.
