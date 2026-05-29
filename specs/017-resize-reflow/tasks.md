---

description: "Task list for Phase 17 — Resize & Reflow (Regenerated 2026-05-29)"
---

# Tasks: Phase 17 — Resize & Reflow

**Input**: Design documents from `D:\proads-worktrees\017-resize-reflow\specs\017-resize-reflow\`
**Prerequisites**: spec.md ✅ (finalized) • plan.md ✅ • research.md ✅ • data-model.md ✅ • contracts/ ✅ • quickstart.md ✅

**Tests included**: YES — spec FR-022 / task 17.10 requires 5 contract fixture tests. Plus one parametric matrix test (FR-008 any-to-any coverage). Each fixture sits inside the user-story phase it validates, before the implementation tasks for that story.

**Organization**: Tasks are grouped by user story (US1 = P1 MVP, US2 = P2 batch, US3 = P2 carousel).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: US1 = single-ad resize • US2 = batch_all • US3 = carousel resize (all + per-slide).
- File paths are absolute repo-root-relative.

## Path Conventions

- Backend: `functions/src/`
- Frontend: `src/`
- Backend tests: `functions/src/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing HOTFIX-F reflow stack is intact and pin the spec's prerequisites before any implementation.

- [X] T001 Verify the existing reflow stack compiles. Files: `functions/src/reflowImage.ts`, `reflowRouter.ts`, `reflowOutpaint.ts`, `reflowRerender.ts`. Run `cd functions && npm run build` and confirm zero errors.
- [X] T002 [P] Confirm `src/planconfig.ts` exports `CREDIT_COSTS.reflowImage = 5` and `CREDIT_COSTS.generateImage = 5`. These are the canonical source of truth for the unified per-generation reflow cost (research R-001). The Generate Resize button label will read from `CREDIT_COSTS.reflowImage`. If the values diverge, escalate before T004 lands.
- [X] T002a [P] Verify the backend has NO plan-tier gate on reflow. Grep `functions/src/reflowImage.ts` and `functions/src/entitlements.ts` for any reference to `userPlan`, `canUseRatio`, or per-plan ratio enforcement on the reflow path. Confirm absent. Per Constitution Principle XI, frontend (T015 will remove the FE gate) and backend must agree — backend currently has no gate; this task confirms it stays that way.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend additions + shared utilities every user story consumes. **No US1/US2/US3 work may begin until this phase is complete.**

- [X] T003 [P] Add `SafeZoneInsetsPct` interface and `getSafeZoneForRatio(ratio: AspectRatio): SafeZoneInsetsPct` exported function to `functions/src/layoutContract.ts`. Returns the authoritative table verbatim — `1:1 → {8,8,8,8}`, `4:5 → {10,8,10,8}`, `3:4 → {12,8,12,8}`, `4:3 → {8,12,8,12}`, `9:16 → {14,8,14,8}`, `16:9 → {8,14,8,14}`. Throws on unknown ratio. Do NOT modify the existing `ASPECT_RATIO_RULES[ratio].safeZoneInset` pixel scalar (research R-002 + `contracts/getSafeZoneForRatio.md`).
- [X] T004 [P] Bump `OUTPAINT_CREDIT_COST` from `2` to `5` in `functions/src/reflowOutpaint.ts:32`. Per FR-006 unified cost (research R-001). Verify by grep that no other file inlines the literal `2` as outpaint cost.
- [X] T005 [P] Extend `functions/src/types.ts`:
  - Add `VariantChip` interface: `{ ratio: AspectRatio; url: string; cleanReflowedImageUrl?: string; generatedAt: number }`. NO `method` field on the chip itself (FR-017a — chip identity is ratio-only).
  - Reference `variantChips?: VariantChip[]` on the generation document shape (data-model.md "Phase 17 additions").
  - Extend `ReflowHistoryEntry` with optional `brandColorReinforced?: boolean`, `textReflowOverflow?: boolean`, `textReductionSteps?: 0 | 1 | 2 | 3`.
- [X] T006 Extend `functions/src/textCompositing.ts`: after the re-render route produces a clean image, call `getSafeZoneForRatio(newAspectRatio)`, recompose all text elements (headline, sub-headline, caption, CTA) inside those insets. If any element overflows at original font size, reduce in 10% steps up to 3 times. Return the composited buffer + `{ textReflowOverflow: boolean; textReductionSteps: 0 | 1 | 2 | 3 }`. **Do NOT call this on outpaint outputs** — outpaint's locked center-70% already contains pre-composited text (research R-003 + FR-011). Depends on T003.
- [X] T007 [P] Extend `functions/src/reflowRerender.ts`: read `inputs.brandColorPrimary` and `inputs.brandColorSecondary` from the source generation. When either is a non-empty hex string, append `BRAND COLOR LOCK: Maintain exact brand palette — Primary: {hex}, Secondary: {hex}.` to the re-render prompt before dispatch. When both absent, skip silently. Return `{ outputUrl, creditsCharged, brandColorReinforced: boolean }` so the caller can record the trace flag.
- [X] T008 Modify `functions/src/reflowImage.ts`:
  - **Source resolution (FR-018)** at lines 139-142: remove the `|| mockupHistory[last].url` fallback. For `scope: 'single'` source = `genData.output.imageUrl`; reject with `failed-precondition: 'legacy_no_original'` when absent. Same enforcement applies to batch/carousel scopes (require `output.batchResults[i].url` / `output.carouselSlides[i].imageUrl`).
  - **Persistence (FR-017a)** in `deductAndPersist()` around line 463: replace the `mockupHistory.arrayUnion` chip-write path with a transactional `ratio`-keyed upsert into a new `variantChips` field. Read existing chips, filter out any with `c.ratio === targetRatio`, append the new `VariantChip` (without a `method` field). Keep the existing `mockupHistory.arrayUnion` write alongside for back-compat.
  - **Trace rollup**: set top-level `resolutionTrace.brandColorReinforced` / `.textReflowOverflow` to the OR of any prior value and the current outcome's flag. Depends on T005, T006, T007.
- [X] T009 [P] Add i18n strings for the Resize UI to the frontend i18n catalog (`src/i18n/`): English + Arabic for `studio.reflow.preview_label` ("Preview — click Generate to create the final resized version"), `studio.reflow.generate_button` ("Generate Resize — {credits} credits"), `studio.reflow.scope_single` ("Resize this image"), `studio.reflow.scope_batch_all` ("Resize all {count} images"), `studio.reflow.scope_slide` ("Resize this slide"), `studio.reflow.scope_carousel_all` ("Resize all {count} slides"), `studio.reflow.current_ratio` ("Current"), `studio.reflow.legacy_no_original` ("This older generation cannot be resized — please regenerate first."). Keep keys flat and namespaced. Remove any stale `studio.reflow.method_*` strings (they will no longer be referenced after T015).

**Checkpoint**: Foundation ready — US1, US2, US3 implementation can now begin in parallel.

---

## Phase 3: User Story 1 — Single-ad resize with preview (Priority: P1) 🎯 MVP

**Goal**: From a completed single-ad result in Step 4, the user can pick a target ratio, see a free CSS preview within 1 s, confirm with "Generate Resize — 5 credits", and receive a fresh-rendered ad at the new ratio with text refit, brand colors preserved, and a ratio-only variant chip added to the parent generation.

**Independent Test**: Scenario 1 in `quickstart.md` — all 6 ratios visible, preview renders ≤1 s at 0 credits, Generate Resize commits a 1:1 → 9:16 reflow, chip added (no method field on chip), exactly 5 credits debited, text fits new 9:16 safe zone, trace records `brandColorReinforced` when brand colors set.

### Tests for User Story 1 (fixture tests from spec FR-022 / 17.10) ⚠️

> Write these tests FIRST. They MUST fail before implementation lands. Run `cd functions && npm test` after writing to confirm failure; rerun after implementation to confirm green.

- [X] T010 [P] [US1] Add fixture test (d) — "getSafeZoneForRatio returns spec table" — to `functions/src/__tests__/contractFixtures.test.ts`. Assert: `getSafeZoneForRatio('9:16')` returns `{ top: 14, right: 8, bottom: 14, left: 8 }`; `getSafeZoneForRatio('1:1')` returns `{ top: 8, right: 8, bottom: 8, left: 8 }`; `getSafeZoneForRatio('4:3')` returns `{ top: 8, right: 12, bottom: 8, left: 12 }`; `getSafeZoneForRatio('21:9' as AspectRatio)` throws. Validates T003.
- [X] T011 [P] [US1] Add fixture test (a) — "single reflow 1:1 → 9:16 returns aspectRatio '9:16' and 5 credits" — to `functions/src/__tests__/contractFixtures.test.ts`. Mock `reflowRerender.rerenderFromPlan` to return a fixed URL; invoke `reflowImageHandler` with `scope: 'single', targetAspectRatio: '9:16', method: 'auto'` against a fixture generation at `metadata.aspectRatio: '1:1'`; assert `outcomes[0].outputUrl` is set, `outcomes[0].method === 'rerender'` (magnitude ≈ 0.78 ≥ 0.30 — router internal), `outcomes[0].creditsCharged === 5`, the persisted variant chip has NO `method` field. Validates US1's end-to-end backend path under the unified cost.
- [X] T011a [P] [US1] Add fixture test (matrix) — "router covers all 30 non-identity ratio pairs" — to `functions/src/__tests__/contractFixtures.test.ts`. Iterate all 6×6 = 36 source/target pairs through `decideMethod`; for the 6 identity pairs assert magnitude === 0 and a downstream no-op would occur; for the 30 non-identity pairs assert the chosen route is `outpaint` (when magnitude < 0.30) or `rerender` (when magnitude ≥ 0.30) and that the projected cost would be `5` either way. Pure-function test — no Gemini call. Closes FR-008 any-to-any coverage.
- [X] T012 [P] [US1] Add fixture test (e) — "brand-color hex appears in re-render prompt" — to `functions/src/__tests__/contractFixtures.test.ts`. Mock `reflowRerender` to capture the prompt passed to it; invoke a re-render with source generation `inputs.brandColorPrimary: '#FF0000'`; assert the captured prompt contains `FF0000` (literal hex substring) AND the outcome carries `brandColorReinforced: true`. Validates T007.

### Implementation for User Story 1

- [X] T013 [US1] Expand the Resize popover in `src/App.tsx` (around line 7378, the `showReflowSizes` block) from 3 ratios to all 6 supported ratios: `1:1`, `4:5`, `3:4`, `4:3`, `9:16`, `16:9`. Replace the `.filter(r => ['1:1', '4:5', '9:16'].includes(r.value) && r.value !== displayRatio)` predicate with `.filter(r => r.value !== originalRatio)` where `originalRatio = genData.metadata.aspectRatio` (per FR-021 — no-op check uses the original ratio, NOT the displayed chip's ratio). Provide ratio-specific icons + labels for the 3 newly-surfaced ratios (`3:4`, `4:3`, `16:9`).
- [X] T014 [US1] In the same Resize popover, **remove the `canUseRatio(userPlan, r.value)` plan-tier check** (currently at `src/App.tsx:7392`). Per FR-008a + Clarifications Q2, all paid plans access all 6 ratios. Strip the `lock` icon and disabled-button styling — every paid-plan user sees every ratio as actionable. Free-plan blocking continues upstream of Step 4.
- [X] T015 [US1] **Delete the method-selector UI block** in `src/App.tsx:7343-7363`: the `showMethodSelector` toggle button, the conditional render of the three method buttons (Auto / Quick / Fresh), and the `setShowMethodSelector` setter. Also delete the `showMethodSelector` state variable and any associated state. Replace any reference to `reflowMethod` with the literal `'auto'` when passing to the `reflowImage` callable. Per FR-011 + Assumptions — method is never user-facing. (Research R-007.)
- [X] T016 [P] [US1] Create new React component `src/components/ReflowPreview.tsx`: takes props `sourceImageUrl: string`, `targetRatio: AspectRatio`; renders an `<img>` inside a wrapper sized to the target ratio (Tailwind `aspect-[9/16]` etc.) with `object-fit: cover`. Renders i18n string `studio.reflow.preview_label` below. Must render within 1 s of mount (SC-006) — no API call, no `useEffect` data fetching. Export as default.
- [X] T017 [US1] Wire the Resize popover to a confirm-step inline state machine in `src/App.tsx`. States: `'closed' | 'picker_open' | 'preview' | 'committing'`. Click a ratio in `'picker_open'`: if `ratio === originalRatio` short-circuit no-op (FR-021); else enter `'preview'` showing `<ReflowPreview />` plus a Generate Resize button labeled via `t('studio.reflow.generate_button', { credits: cost })` where `cost = CREDIT_COSTS.reflowImage * scopeItemCount` (T002 — unified flat 5).
- [X] T018 [US1] Hook the Generate Resize button (in `'preview'` state) to the existing `handleRescale(targetRatio)` callable wrapper around `reflowImage`. Always send `method: 'auto'`. On success, transition to `'closed'` and let the chip-render path in T019 update. On `resource-exhausted` HttpsError, show "Not enough credits" toast and stay in `'preview'`. On `failed-precondition: 'legacy_no_original'`, show the `studio.reflow.legacy_no_original` toast. Depends on T016, T017.
- [X] T019 [US1] Add variant-chip switcher UI in the Step 4 output area of `src/App.tsx`. Render one chip per `variantChips[]` entry on the active generation. Chip label = ratio only (e.g., "9:16", "4:5") — no method icon, no method tooltip (FR-017a). Clicking a chip swaps the displayed image to `chip.url` (no API call). The original ratio (`metadata.aspectRatio`) is rendered as the leftmost chip showing `output.imageUrl`. Active chip visually highlighted. Cap visual at 6 chips (data-model invariant 2). Depends on T013.

**Checkpoint**: User Story 1 fully functional and independently testable. Run quickstart.md Scenario 1, Scenario 4, Scenario 5 to verify.

---

## Phase 4: User Story 2 — Batch_all resize with partial-success (Priority: P2)

**Goal**: From a completed batch of N ads in Step 4, the user picks a target ratio, chooses "Resize all N images", confirms (cost = 5 × N), and receives N resized variants in parallel with successes and failures clearly attributed; credits charged only for successful items.

**Independent Test**: Scenario 2 in `quickstart.md` — scope selector appears for batch results, 5-concurrent cap bounds parallel execution, 3 of 4 induced-failure successes charge 15 credits (not 20), single 9:16 chip is added to the parent generation.

### Tests for User Story 2 (fixture tests from spec FR-022 / 17.10) ⚠️

- [X] T020 [P] [US2] Add fixture test (b) — "batch reflow with 4 items returns 4 outcomes" — to `functions/src/__tests__/contractFixtures.test.ts`. Mock `rerenderFromPlan` to succeed for all 4 items; invoke `reflowImageHandler` with `scope: 'batch_all', targetAspectRatio: '9:16'` against a fixture generation whose `output.batchResults` has 4 entries; assert `outcomes.length === 4`, every `outcomes[i].itemIndex` is `0..3` in order, every `outcomes[i].success === true`, `totalCreditsCharged === 20` (4 × 5). Add a partial-success variant: mock item 2 to fail with `engine_error`; assert `outcomes[2].success === false`, `outcomes[2].creditsCharged === 0`, `totalCreditsCharged === 15`, sibling items unaffected. Validates FR-014 + FR-019 + FR-006 unified cost.

### Implementation for User Story 2

- [X] T021 [US2] Add batch scope-selector UI in `src/App.tsx`. When the active generation is a batch result (`genData.output.batchResults` is a non-empty array), the Resize confirm flow shows a scope selector with two radio options: "Resize this image" (default when a batch item is focused) and `studio.reflow.scope_batch_all` interpolated with `{ count: batchResults.length }`. Selection updates the cost in the Generate Resize button label (multiplied by item count when `batch_all` is selected). Depends on T017.
- [X] T022 [US2] Add per-item loading and failure indicators to the batch grid in `src/App.tsx`. During `batch_all` reflow, each batch item shows an independent spinner overlay. As each `outcomes[i]` resolves on the callable response, swap the spinner for the new image (success) or a "Resize failed — try again" badge (failure). Re-trigger button on failed items invokes `reflowImage` again with `scope: 'batch_all'` filtered to just the failed indices (or a per-item call per failed index). Use the existing `batchResults[].status: 'rendering' | 'error'` field already present in `App.tsx` batch state. Depends on T021.

**Checkpoint**: User Stories 1 AND 2 both work independently. Run quickstart.md Scenarios 1, 2, 4, 5.

---

## Phase 5: User Story 3 — Carousel resize all + per-slide (Priority: P2)

**Goal**: From a completed N-slide carousel, the user picks a target ratio and chooses "Resize this slide" (5 credits, single slide) or "Resize all N slides" (5 × N credits, parallel, order preserved).

**Independent Test**: Scenario 3 in `quickstart.md` — carousel scope selector appears, "Resize this slide" updates only the focused slide and charges 5 credits, Arabic RTL copy survives verbatim (Q3), slide order preserved (FR-015), `output.carouselSlides[slideIndex].imageUrl` updated without creating a generation-level chip (data-model invariant 5).

### Tests for User Story 3 (fixture tests from spec FR-022 / 17.10) ⚠️

- [X] T023 [P] [US3] Add fixture test (c) — "carousel reflow preserves slide count and order" — to `functions/src/__tests__/contractFixtures.test.ts`. Mock `rerenderFromPlan` to return a unique URL per slide; invoke `reflowImageHandler` with `scope: 'carousel_all', targetAspectRatio: '1:1'` against a fixture generation whose `output.carouselSlides` has 7 entries with distinct `buildPlan` strings; assert `outcomes.length === 7`, `outcomes[i].itemIndex === i` for all `i`, slide-order ordering preserved across the 5-concurrent waves, `totalCreditsCharged === 35` (7 × 5). Add a `scope: 'carousel_slide', slideIndex: 2` variant; assert `outcomes.length === 1`, `outcomes[0].itemIndex === 2`, `outcomes[0].creditsCharged === 5` (unified — outpaint or rerender, same 5). Validates FR-015, FR-016, FR-006.

### Implementation for User Story 3

- [X] T024 [US3] Add carousel scope-selector UI in `src/App.tsx`. When the active generation is a carousel (`genData.output.carouselSlides` is a non-empty array), the Resize confirm flow shows: `studio.reflow.scope_slide` ("Resize this slide" — default; uses currently-focused slide index) and `studio.reflow.scope_carousel_all` interpolated with `{ count: carouselSlides.length }`. Cost label updates: per-slide = 5; carousel_all = 5 × N. Selection feeds `scope: 'carousel_slide' | 'carousel_all'` and `slideIndex: <focused>` (when per-slide) into the `reflowImage` callable. Depends on T017.
- [X] T025 [US3] After a successful carousel reflow, render the updated slide(s) in the existing carousel viewer in `src/App.tsx`. For `carousel_slide`: replace only the targeted slide's `imageUrl` (backend writes to `output.carouselSlides[slideIndex].imageUrl`; frontend reads from post-callable response). For `carousel_all`: replace all slides as outcomes resolve. Slide order MUST be preserved (FR-015). Depends on T024.

**Checkpoint**: All three user stories independently functional. Run quickstart.md Scenarios 1, 2, 3, 4, 5.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final fixture runs, manual verification of edge cases, lint/build cleanups, changelog.

- [X] T026 Run `cd functions && npm test`. Confirm all Phase-17 fixtures (T010, T011, T011a, T012, T020, T023) plus the existing HOTFIX-F fixtures pass. Address any flakiness or assertion drift before declaring Phase 17 done.
- [ ] T027 [P] Run quickstart.md Scenarios 1–5 manually against `firebase emulators:start + npm run dev`. **Requires manual execution — cannot be automated.** Confirm the acceptance checklist at the bottom of `quickstart.md` AND the anti-tests section. Capture any deviations as follow-up items.
- [ ] T028 [P] Verify mid-flight cancellation. **Requires manual execution with live Cloud Run — cannot be automated in this environment.**
- [X] T029 [P] Run `cd functions && npm run build` and `npm run build` (frontend root). Confirm zero TypeScript errors. Run `npm run lint`. Address any new lint issues introduced by Phase 17 changes (especially around the deleted method-selector code in `src/App.tsx`).
- [X] T030 Append a Phase 17 entry to `docs/LAUNCH_MATRIX.md`'s changelog: short paragraph summarizing what shipped (6-ratio popover, free CSS preview, batch + carousel scope selectors, ratio-only variant chips, brand-color block, text re-composition with overflow trace, method selector REMOVED, cost unified to 5/item). Mark Phase 17 as DONE.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately. T001, T002, T002a all parallelizable.
- **Phase 2 (Foundational)**: T003, T004, T005, T007, T009 may run in parallel (different files). T006 depends on T003. T008 depends on T005, T006, T007.
- **Phase 3 (US1)**: Depends on Phase 2 complete.
- **Phase 4 (US2)**: Depends on Phase 2 + T017 (US1 confirm-flow state machine inherited).
- **Phase 5 (US3)**: Depends on Phase 2 + T017. May run in parallel with US2.
- **Phase 6 (Polish)**: Depends on US1, US2, US3 complete.

### Within-story dependencies (US1, MVP path)

```
T010 ─┐
T011 ─┼─ (tests written, expected to fail)
T011a ┤
T012 ─┘
              │
T013 ──┐      │
T014 ──┤      │
T015 ──┤      │  ← parallelizable implementation tasks (T016 [P] new file)
T016 ──┤      │
T019 ──┘      │
              ↓
            T017 ── T018 ── (US1 done)
```

T013 / T014 / T015 / T019 touch `src/App.tsx` — they should be sequenced inside the file edit, not truly parallel. T016 [P] is a new file and runs in parallel.

### Parallel opportunities

- **Setup**: T001, T002, T002a all parallel.
- **Foundational**: T003, T004, T005, T007, T009 all parallel (5-wide). T006 after T003. T008 after T005/T006/T007.
- **US1 tests**: T010, T011, T011a, T012 all parallel.
- **US1 impl**: T016 [P] (new file). T013/T014/T015/T019 sequence inside `App.tsx`.
- **US2 + US3 stories**: After T017 lands, both phases run in parallel — different `App.tsx` regions + independent fixture files.
- **Polish**: T027, T028, T029 parallel; T026 sequenced first; T030 last.

---

## Parallel example — US1 launch order

```bash
# After Phase 2 checkpoint, launch all US1 tests in parallel:
Task: "T010 — getSafeZoneForRatio fixture in functions/src/__tests__/contractFixtures.test.ts"
Task: "T011 — single 1:1→9:16 fixture (5-credit assertion) in functions/src/__tests__/contractFixtures.test.ts"
Task: "T011a — router matrix fixture (30 non-identity pairs) in functions/src/__tests__/contractFixtures.test.ts"
Task: "T012 — brand-color hex fixture in functions/src/__tests__/contractFixtures.test.ts"

# Then launch parallelizable implementation:
Task: "T016 — create ReflowPreview component in src/components/ReflowPreview.tsx"

# Sequence the App.tsx-touching tasks (same file):
Task: "T013 — expand Resize popover to 6 ratios"
Task: "T014 — remove canUseRatio plan-tier check"
Task: "T015 — DELETE method-selector UI block at lines 7343-7363"
Task: "T019 — variant-chip switcher UI"

# Then integrate:
Task: "T017 — confirm-flow state machine"
Task: "T018 — hook Generate Resize → reflowImage callable with method='auto'"
```

---

## Implementation strategy

### MVP first (US1 only)

1. Phase 1 (T001, T002, T002a) — verify reflow stack + cost constants + backend gate absence.
2. Phase 2 (T003–T009) — backend additions + cost bump + i18n.
3. Phase 3 US1 (T010–T019) — single-ad resize with preview, ratio-only chip, no method selector.
4. **STOP. Run quickstart.md Scenarios 1, 4, 5.** If green: MVP shippable.

### Incremental delivery

1. After MVP, add **US2 (T020–T022)** → run Scenario 2 → ship.
2. After US2, add **US3 (T023–T025)** → run Scenario 3 → ship.

### Parallel team strategy

After Phase 2 completes:

- Developer A: US1 (T010–T019) — critical path.
- Developer B: US2 (T020–T022) — once T017 from US1 lands, B can begin.
- Developer C: US3 (T023–T025) — once T017 from US1 lands, C can begin.

Polish (Phase 6) runs after all three stories merge.

---

## Notes

- **No new TypeScript modules on backend**: every task modifies an existing file (`reflowImage.ts`, `reflowOutpaint.ts`, `reflowRerender.ts`, `layoutContract.ts`, `textCompositing.ts`, `types.ts`, `contractFixtures.test.ts`). Only one new frontend file: `src/components/ReflowPreview.tsx`.
- **No Firestore migration**: all changes additive optional fields on existing `generations/{genId}` docs.
- **No new callable**: `reflowImage` exists; Phase 17 adjusts persistence + source resolution + adds brand-color injection.
- **Method-selector UI is DELETED, not refactored**: per FR-011 + Assumptions, method is never user-facing. The callable's `method` field remains in the runtime contract for fixture tests + internal tooling.
- **Cost is FLAT 5 per item**: outpaint and re-render both charge 5. Frontend reads `CREDIT_COSTS.reflowImage` from `src/planconfig.ts`.
- **Chip schema collapsed to ratio-only**: no `method` field on `VariantChip`; key-space cap = 6 chips per generation.
- **No chaining**: source is always `output.imageUrl`; legacy generations rejected.
- **Existing HOTFIX-F invariants preserved**: 5-concurrent cap, same-ratio no-op, partial-success semantics, auto-router decision — all left alone.
- **Test-first within each story**: T010–T012 + T011a (US1), T020 (US2), T023 (US3) write fixtures expected to fail before implementation.
- Avoid: re-implementing engine logic, modifying `safeZoneInset` field shape, removing `mockupHistory.arrayUnion` (kept for back-compat), enabling plan-tier gating on ratios, re-surfacing the method selector.
