# Tasks: Independent Multi-Size Ad Generation

**Input**: Design documents from `/specs/961-independent-multisize/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: INCLUDED — the contracts define acceptance fixtures (`contracts/generateSizeVariant.md`) and SC-007 requires the existing baseline to stay green. Backend contract/unit tests are written before their implementation within each phase.

**Organization**: Tasks grouped by user story (US1, US2, US3) so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1 / US2 / US3 (story phases only)
- Exact file paths included.

## Path Conventions

Web app: backend `functions/src/`, frontend `src/`. Region `europe-west1`. PowerShell syntax. Merge via GitHub UI only. Commented-out code stays commented.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the regression baseline before any change.

- [x] T001 Capture green baseline: run `cd functions ; npm test ; cd ..` and `npm test`, plus `npm run build` and `cd functions ; npm run build ; cd ..`; record counts (culturalCompliance 929, copyQuality 71, copyStructure 206, conditionalCopyFields 77, step2OptionalFields 22, modeFormatValidator 6144) in `specs/961-independent-multisize/quickstart.md` baseline note (SC-007 reference).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared size-variant backend path + types + credit flow that ALL user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Add size-variant types to `functions/src/types.ts`: `SizeVariantStatus`, `ReferenceSource`, `SizeVariant`, `SizeVariantTraceEntry`, `GenerationScope`, `GenerateSizeVariantRequest`, `GenerateSizeVariantResponse`, and add `readonly sizeVariantTrace?: readonly SizeVariantTraceEntry[]` to `ResolutionTrace` (per data-model.md; additive only).
- [x] T003 [P] Add multi-size credit cost helper to `functions/src/entitlements.ts` (compute `designs × 5`; reuse `checkFeature` for `visualPolishes`; expose owner-balance guard helper for per-variant transactions).
- [x] T004 [P] Add frontend size-variant contract types + `httpsCallable<GenerateSizeVariantRequest, GenerateSizeVariantResponse>` wrapper (`generateSizeVariant`, timeout 300000) in `src/types.ts` and the callables module used by `src/App.tsx`.
- [x] T005 Write backend contract tests (expect FAIL first) covering all 9 fixtures from `contracts/generateSizeVariant.md` in `functions/src/__tests__/sizeVariant.test.ts`: Story-no-drop, null subhead carry-forward, uploaded-reference, same-ratio no-op, fail→refund→retry-single-charge, anchor-fail referenceSource none, ratio-outside-UI_RATIOS reject, carousel-pre-select reject, **no-anti-sameness-fingerprint-written-for-variant (FR-019a)**.
- [x] T006 Implement `generateSizeVariant()` core in `functions/src/generators.ts`: rebuild the ratio-appropriate layout/prompt for `targetAspectRatio` via `buildFinalImagePrompt({ aspectRatio: target, imageParts:[reference], styleReferencePresent:true, reflowInstruction: undefined, ...brief })`, route through `createVisualRoutingCaller` (preserve `MODEL_PROVIDER`), run `validateCopyFidelity()` with existing retries; preserve `null` copy fields (FR-006). **MUST reuse the parent's saved build plan — MUST NOT call `generateBuildPlan()` and MUST NOT write a Phase 23 anti-sameness fingerprint for variants (FR-019a).** Depends on T002.
- [x] T007 Create `functions/src/sizeVariant.ts` handler: preconditions PRE-1..PRE-6, reference resolution priority (uploaded→own_original→anchor→none), idempotency key `genId:scope:itemIndex:ratio`, no-op short-circuit (FR-011), upfront 5-credit charge + refund-on-failure (FR-012a/FR-015) in transactions, additive persistence (single→`mockupHistory`; batch/carousel→`sizeVariants[ratio]`), append `SizeVariantTraceEntry`. **MUST NOT trigger or write an anti-sameness fingerprint (FR-019a) — a variant is the same ad at a new size.** Depends on T002, T006.
- [x] T008 Register `generateSizeVariant` onCall in `functions/src/index.ts` (region europe-west1, secrets geminiApiKey+openaiApiKey, 300s, 2GiB), add `ACTION_FEATURE_MAP['generateSizeVariant']='visualPolishes'` (reuse `COSTS.generateImage=5`). Depends on T007.
- [x] T009 Make T005 fixtures pass (iterate T006–T008 until `functions/src/__tests__/sizeVariant.test.ts` is green). Depends on T005, T008.

**Checkpoint**: Shared `generateSizeVariant` callable works and is contract-tested. User stories can now begin.

---

## Phase 3: User Story 1 — Pre-select multiple sizes (Priority: P1) 🎯 MVP

**Goal**: From one brief, pre-select 1–3 sizes and generate each as an independent native design (anchor-first), grouped, with all copy elements on every size including Story CTA.

**Independent Test**: Select Square + Story, Generate once → two grouped designs, both with all non-null copy, Story shows CTA, consistent hero/palette, cost shown as 10 beforehand (quickstart Flow A).

- [x] T010 [US1] Implement anchor-first fan-out for single-image pre-select in `src/App.tsx`: generate anchor (first of `selectedSizes`) via existing `serverGenerateFinalAd`, then call `generateSizeVariant` for each remaining size using the completed anchor image as `sourceImageOverride` (FR-002a, FR-005). 
- [x] T011 [US1] Generalize credit pre-check + cost display for multi-size in `src/App.tsx` (and `src/store.ts` if needed): `totalCreditCost = designs × 5` across all selected sizes; block Generate with required-vs-available message when `userCredits < total` (FR-012/FR-013). Depends on T010.
- [x] T012 [US1] Grouped per-size display + independent per-size loading state for single image in `src/App.tsx`: push each succeeded size to `mockupHistory`, show all sizes of the ad together, spinner per size resolving independently (FR-017, FR-020). Depends on T010.
- [x] T013 [US1] Anchor-failure handling in `src/App.tsx`: if anchor fails, still fan out variants (backend sets `referenceSource:'none'`), surface anchor as a retryable failure, do not abort the run (FR-005a). Depends on T010.
- [x] T014 [US1] Refund/no-op reconciliation after a single-image run in `src/App.tsx`: `setUserCredits(prev + (reserved − Σ netCreditsCharged))` (FR-015, mirrors existing `App.tsx:5478` pattern). Depends on T011, T012.

**Checkpoint**: US1 fully functional — pre-select multi-size for single image, the dropped-CTA defect eliminated. MVP deliverable.

---

## Phase 4: User Story 2 — Resize after generation (Priority: P1)

**Goal**: Resize an existing single result to a new size via fresh generation using the original as reference; no-op on same size; null carry-forward; uploaded-reference override.

**Independent Test**: Generate Square, Resize→Story → fresh consistent Story with all copy, original retained, 5 credits; Resize→Square again → "Already generated", 0 credits (quickstart Flow B).

- [x] T015 [US2] Repoint `handleRescale` in `src/App.tsx` from `reflowImage` to `generateSizeVariant` for `scope:'single'`, passing the source's own original image as `sourceImageOverride` (FR-007). 
- [x] T016 [US2] Same-size no-op UX in `src/App.tsx`: when target equals an already-succeeded size, show "Already generated at this size" and charge 0 (FR-011, surfaces backend `noOp`). Depends on T015.
- [x] T017 [US2] Reference precedence in `src/App.tsx` resize path: if a user-uploaded reference exists on the generation, it overrides the generated image (FR-008); else use own original. Depends on T015.
- [x] T018 [US2] Add resized variant alongside original in `src/App.tsx` (`pushMockup` new size, keep source size available — FR-007). Depends on T015.

**Checkpoint**: US1 + US2 both work independently — pre-select and post-resize for single image.

---

## Phase 5: User Story 3 — Multi-size for batch & carousel (Priority: P2)

**Goal**: Batch pre-select across sizes and carousel resize-all, each item/slide a separate generation, concurrency-capped waves, per-item loading, partial-failure retry, refunds.

**Independent Test**: Batch 4 × Square+Story (8 designs) with per-item spinners and grouping; carousel 5 slides resized with 3-succeed/2-fail leaving 3 shown + retry on 2 (quickstart Flow C).

- [x] T019 [P] [US3] Add batch/carousel scope fixtures to `functions/src/__tests__/sizeVariant.test.ts`: per-item `sizeVariants[ratio]` persistence, carousel resize-only acceptance, batch item idempotency keys (write first, then confirm green).
- [x] T020 [US3] Batch pre-select fan-out in `src/App.tsx`: for each item × each selected size, generate anchor via existing batch path then `generateSizeVariant` for remaining sizes, chunked into waves of ≤10 with `Promise.allSettled` (FR-009, FR-010). Depends on Phase 2.
- [x] T021 [US3] Carousel resize-only multi-size fan-out in `src/App.tsx`: ensure carousel pre-select stays disabled (VR-2); on Resize, call `generateSizeVariant` per slide in ≤10 waves (FR-001, FR-009). Depends on Phase 2.
- [x] T022 [US3] Per-item/per-slide loading + partial-failure retry + credit refund reconciliation in `src/App.tsx`: independent spinners, retry on failed items/slides, never discard successes, reconcile credits for failures/no-ops (FR-015, SC-006). Depends on T020, T021.
- [x] T022a [US3] Implement 429/rate-limit handling for the fan-out waves in `src/App.tsx`: detect provider rate-limit errors and re-queue the affected calls with exponential backoff (base 1s, ×2, max 4 attempts, jitter) rather than failing the whole run (FR-016). Depends on T020, T021.
- [x] T023 [US3] Grouped per-size display for batch items and carousel slides in `src/App.tsx`, reading the backend `sizeVariants` map (FR-017). Depends on T020, T021.

**Checkpoint**: All three stories work; batch and carousel reach multi-size with graceful partial failures.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Neutralize HOTFIX-F (after frontend is fully migrated), docs, and regression proof.

- [x] T024 [P] Comment out HOTFIX-F reflow module bodies in `functions/src/reflowImage.ts`, `functions/src/reflowRouter.ts`, `functions/src/reflowOutpaint.ts`, `functions/src/reflowRerender.ts`, each prefixed `// Superseded by Phase 17 independent multi-size generation. Kept for reversibility.` (FR-021). Depends on US1–US3 migrated.
- [x] T025 Comment out the `reflowImage` onCall registration in `functions/src/index.ts` with the reversibility note (FR-021; only after no frontend caller remains). Depends on T015, T020, T021, T024.
- [x] T026 [P] Comment out the "REFLOW: Ratio" block at `functions/src/generators.ts` (~line 6665) with the reversibility note (FR-021).
- [x] T027 [P] Update `docs/LAUNCH_MATRIX.md` Phase 17 tasks to reflect the independent multi-size architecture (replacing the old reflow-extension tasks 17.1–17.5+).
- [x] T028 Run full backend baseline `cd functions ; npm test` — 0 new failures incl. new `sizeVariant.test.ts` (SC-007). Depends on all prior.
- [x] T029 Run frontend baseline `npm test` + `npm run build` + `cd functions ; npm run build` — all green (SC-007). Depends on all prior.
- [ ] T030 [P] Manual quickstart verification of Flows A/B/C and credit accounting per `specs/961-independent-multisize/quickstart.md`; record before/after evidence for Story 9:16 CTA presence (Principle IX, SC-002).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories.
- **User Stories (Phases 3–5)**: all depend on Foundational. US1 and US2 are both P1; US3 is P2. They are independently testable but largely edit `src/App.tsx`, so coordinate edits if worked in parallel.
- **Polish (Phase 6)**: depends on all targeted user stories (HOTFIX-F neutralization must come after the frontend stops calling `reflowImage`).

### User Story Dependencies

- **US1 (P1)**: after Phase 2. No dependency on US2/US3.
- **US2 (P1)**: after Phase 2. Independent of US1 (shares the resize callable only).
- **US3 (P2)**: after Phase 2. Reuses the same callable; independent test path.

### Within Each Story

- Backend contract tests (T005, T019) before/with their implementation.
- Backend core (T006) → handler (T007) → registration (T008) → green (T009).
- Frontend generation wiring before display/reconciliation within each story.

### Parallel Opportunities

- Phase 2: T003 and T004 are [P] (different files); T002 must precede T006/T007.
- Phase 6: T024, T026, T027, T030 are [P] (different files / manual).
- US1, US2, US3 can be staffed in parallel after Phase 2 **only if** `src/App.tsx` edits are sequenced to avoid conflicts (most US tasks touch that one file).

---

## Parallel Example: Phase 2 Foundational

```text
# After T002 (types) lands, run in parallel:
Task T003: multi-size credit cost helper in functions/src/entitlements.ts
Task T004: frontend callable types + wrapper in src/types.ts

# Backend core is sequential (same/linked files):
T006 generators.ts → T007 sizeVariant.ts → T008 index.ts → T009 make tests green
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational (critical) → 3. Phase 3 US1 → **STOP & VALIDATE** (quickstart Flow A; confirm Story CTA no-drop) → demo.

### Incremental Delivery

1. Setup + Foundational → shared callable ready.
2. US1 → pre-select multi-size single image (MVP, the core fix) → demo.
3. US2 → resize-after-generation replaces the broken Resize → demo.
4. US3 → batch & carousel multi-size with partial-failure handling → demo.
5. Polish → neutralize HOTFIX-F, docs, regression proof.

### Notes

- [P] = different files, no incomplete dependencies.
- Commit after each task or logical group; verify backend tests fail before implementing (T005/T019).
- Do not delete HOTFIX-F — comment with the reversibility note.
- Keep `getFieldSection`/`findEarliest`/`markerRegex` hoisted to function-component scope in `App.tsx`.
- Preserve the `buildFinalImagePrompt()` → `validateCopyFidelity()` contract unchanged.
