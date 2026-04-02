# Tasks: Blueprint → Long-Form Render Prompt Pipeline

**Input**: Design documents from `/specs/005-render-prompt-pipeline/`
**Prerequisites**: Phase 1 (Resolver Foundation) complete
**Status**: Ready for implementation

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Extract TECHNICAL_PROMPT as a named field and add the copy fidelity validation. Must complete before any prompt assembly or UI work.

- [X] T001 Add `[[TECHNICAL_PROMPT]]..[[/TECHNICAL_PROMPT]]` marker injection to the build plan generation prompt in `functions/src/generators.ts` — inside `generateBuildPlan()`, instruct the model to wrap the long-form English render prompt in these markers. Add the instruction near the existing `[[PROADS_MACHINE_PLAN_V1]]` marker instruction so the model outputs both.
- [X] T002 Add `technicalPrompt: string | null` field to the `parseBuildPlanEnvelope()` return type in `functions/src/buildPlanSlotMap.ts` — extract content between `[[TECHNICAL_PROMPT]]` and `[[/TECHNICAL_PROMPT]]` markers. Return `null` if markers absent. Expose on the parsed result alongside existing `blueprint` and `machinePlan` fields.
- [X] T003 Add copy fidelity validation function `validateCopyFidelity(technicalPrompt: string, hookText: string): boolean` in `functions/src/buildPlanSlotMap.ts` — returns `true` if `technicalPrompt.includes(hookText.trim())`. Export it for use in generators and tests.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile.

---

## Phase 2: US1 — Complete Input Injection Audit (Priority: P1) MVP

**Goal**: Ensure every Step 1 and Step 2 input feeds into the build plan prompt — no silently dropped fields.

**Independent Test**: Generate a build plan with all inputs filled. Grep the output for each input field. Verify zero gaps.

- [X] T004 [US1] Audit `generateBuildPlan()` in `functions/src/generators.ts` — verify `offerCreativeMode` injects the mode spec block unconditionally. If conditional or missing, fix to always inject when the mode is present.
- [X] T005 [US1] Audit `generateBuildPlan()` in `functions/src/generators.ts` — verify `visualSubStyle` injects the sub-style constraint block via `resolveVisualSubStyle()` unconditionally. Fix if conditional.
- [X] T006 [P] [US1] Audit `generateBuildPlan()` in `functions/src/generators.ts` — verify `coldHookAngle` injects angle visual direction via `getHookAngleVisualDirection()` for cold campaigns. Verify `retargetingObjection` injects objection visual direction for retargeting campaigns. Fix if either is missing or conditional.
- [X] T007 [P] [US1] Audit `generateBuildPlan()` in `functions/src/generators.ts` — verify `adTone` injects the tone mood block via `getAdToneVisualMood()` unconditionally. Fix if conditional.
- [X] T008 [P] [US1] Audit `generateBuildPlan()` in `functions/src/generators.ts` — verify `brandColorPrimary` and `brandColorSecondary` are injected as exact hex values (not generic "brand color" placeholder). If absent when provided by user, add injection. If user has not provided colors, omit section entirely.
- [X] T009 [US1] Audit `generateBuildPlan()` in `functions/src/generators.ts` — verify `hookText`, `subheadText`, and `ctaName` from Step 2 are injected under `TEXTS TO RENDER` and `CANONICAL CONTENT OWNERSHIP` unconditionally. If behind a conditional, make unconditional.
- [X] T010 [US1] Audit `generateBuildPlan()` in `functions/src/generators.ts` — verify mode-specific data fields (`valueStackItems`, `eventTitle`, `eventDate`, `valueStackPrice`, `benefitText`, etc.) are injected via `buildContentOwnershipMap()` when provided by the user. If any field is silently dropped when present, fix it. If absent, ensure no placeholder is injected.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile.

---

## Phase 3: US2 — Copy Text Fidelity Validation (Priority: P2)

**Goal**: Validate that the build plan's TECHNICAL_PROMPT contains the exact approved hookText. Auto-retry on failure.

**Independent Test**: Generate a build plan with known hookText. Verify validation passes. Mock a build plan with paraphrased text. Verify validation fails and triggers rebuild.

- [X] T011 [US2] Wire copy fidelity validation into `generateBuildPlan()` return path in `functions/src/generators.ts` — after `parseBuildPlanEnvelope()` extracts `technicalPrompt`, call `validateCopyFidelity(technicalPrompt, hookText)`. If it fails, log a warning and retry `generateBuildPlan()` (max 2 retries, 3 total attempts). Return the build plan on first passing attempt.
- [X] T012 [US2] Add retry-exhausted error handling in `functions/src/generators.ts` — when all 3 attempts fail copy fidelity, throw a typed error (e.g., `CopyFidelityError`) with a clear message. The caller in `functions/src/index.ts` (`serverGenerateBuildPlan` or `serverGenerateFinalAd`) must catch this and return `{ success: false, errorCode: 'copy_fidelity_failed' }` to the frontend.
- [X] T013 [US2] Handle `copy_fidelity_failed` error in `src/App.tsx` — when the generation returns this error code, show a user-visible error message ("Blueprint text didn't match — please retry") with a "Retry" button that re-triggers generation with the same inputs. Follow the existing error handling + toast pattern.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build && npm run build` (both backend + frontend) — clean compile.

---

## Phase 4: US3 — Blueprint Visibility in Step 3 (Priority: P3)

**Goal**: Show the human-readable blueprint to the user in Step 3 via an expandable panel, with the TECHNICAL_PROMPT stripped.

**Independent Test**: Generate an ad through Step 3. Verify the "View Blueprint" panel appears. Verify the TECHNICAL_PROMPT markers and content are not visible. Verify blueprint text is stored in the generation record.

- [X] T014 [US3] Add `stripTechnicalPrompt(blueprint: string): string` utility function in `functions/src/buildPlanSlotMap.ts` — removes everything between `[[TECHNICAL_PROMPT]]` and `[[/TECHNICAL_PROMPT]]` markers (inclusive) from the blueprint string. Export it. Also add a mirrored copy in `src/utils/` or inline in `src/App.tsx` for frontend use.
- [X] T015 [US3] Add "View Blueprint" expandable panel in `src/App.tsx` — inside the Step 3 concept card area (near existing environment/mood/lighting panels around line 5629). Show the stripped blueprint text in a collapsible panel. Default state: collapsed. Use existing accordion/chevron UI pattern. Label: "View Blueprint" (Arabic: "عرض المخطط").
- [X] T016 [P] [US3] Add `blueprintText` and `resolvedImagePrompt` fields to `CreativeMemoryRecord` in `functions/src/creativeMemory.ts` — both `string | null`, truncated to 2000 and 5000 chars respectively on write. Update `storeCreativeToMemory()` to accept and store these fields.
- [X] T017 [US3] Wire blueprint storage in `functions/src/index.ts` — in the `serverGenerateFinalAd` handler (after successful generation, in the `storeCreativeToMemory` call), pass the stripped blueprint text as `blueprintText` and the final assembled prompt as `resolvedImagePrompt`.

**Checkpoint**: `npm run build` (frontend + backend) — clean compile.

---

## Phase 5: US1+US5 — Prompt Assembly Function (Priority: P1/P5)

**Goal**: Extract inline prompt assembly from `generateFinalAd()` into a dedicated `buildFinalImagePrompt()` function. Store the resolved prompt in the resolution trace.

**Independent Test**: Call `buildFinalImagePrompt()` with known inputs. Verify the output contains all 10 sections in the correct order. Verify hookText appears verbatim.

- [X] T018 [US1] Extract `buildFinalImagePrompt()` function in `functions/src/generators.ts` — signature per `contracts/prompt-assembly.md`: `buildFinalImagePrompt(blueprint, technicalPrompt, contract, inputs, aspectRatio): { textPrompt, imageParts }`. Move the inline prompt assembly logic from `generateFinalAd()` (~line 4656+) into this function. Concatenate sections in the strict order: (1) technicalPrompt, (2) layout contract zone rules + aspect ratio, (3) sub-style visual constraints, (4) creative mode structural rules, (5) campaign type + hook angle direction, (6) brand color hex directives (when provided), (7) face-consistency for Box A (when provided), (8) logo placement for Box B (when provided), (9) mode-specific asset refs for Box C (when provided), (10) style reference for reference ad (when provided). Items 6–10 omitted when absent.
- [X] T019 [US1] Replace inline assembly in `generateFinalAd()` in `functions/src/generators.ts` — call `buildFinalImagePrompt()` instead of the inline assembly. Use the returned `textPrompt` and `imageParts` to build the Gemini call's `parts[]` array. Remove the old inline assembly code. Verify no other function assembles prompts inline (FR-006).
- [X] T020 [P] [US5] Add `resolvedImagePrompt` and `blueprintText` fields to the ResolutionTrace schema — update the trace type definition (in the resolution trace spec or `functions/src/types.ts` if the type lives there). Add the same fields to the `perSlide` array type for carousel support.
- [X] T021 [US5] Wire trace storage in `generateFinalAd()` in `functions/src/generators.ts` — after calling `buildFinalImagePrompt()`, store `textPrompt` as `resolvedImagePrompt` and the stripped blueprint as `blueprintText` on the resolution trace object before it is persisted.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile.

---

## Phase 6: US4 — Carousel Per-Slide Prompt Correctness (Priority: P4)

**Goal**: Each carousel slide gets its own `buildFinalImagePrompt()` call with correct per-slide copy text. Per-slide trace data stored.

**Independent Test**: Generate a 5-slide carousel. Inspect per-slide `resolvedImagePrompt` in the trace. Verify each slide contains its own unique hookText/subheadText.

- [X] T022 [US4] Wire `buildFinalImagePrompt()` per-slide in carousel rendering in `functions/src/generators.ts` — in the carousel slide rendering loop (inside `generateFinalAd()` or the carousel-specific render path), call `buildFinalImagePrompt()` for each slide with that slide's specific `hookText` and `subheadText` from the carousel copies. Verify slide 1's text is NOT reused for other slides.
- [X] T023 [US4] Store per-slide `blueprintText` and `resolvedImagePrompt` in the `perSlide` array of the ResolutionTrace in `functions/src/generators.ts` — for each carousel slide, after calling `buildFinalImagePrompt()`, store the result on the corresponding `perSlide[i]` entry.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile.

---

## Phase 7: US6 — Regression Guards (Priority: P6)

**Goal**: Unit tests verify prompt assembly includes all critical input categories.

**Independent Test**: `cd functions && npm run test:contracts` — all new tests pass.

- [X] T024 [US6] Add prompt assembly regression test (a) in `functions/src/contractFixtures.test.ts` — given a known `hookText` + mock blueprint + mock inputs, call `buildFinalImagePrompt()` and assert the output `textPrompt` contains the exact `hookText` string.
- [X] T025 [P] [US6] Add prompt assembly regression test (b) in `functions/src/contractFixtures.test.ts` — given `visualSubStyle: "luxury_magazine"` in inputs, call `buildFinalImagePrompt()` and assert the output contains the luxury magazine constraint block (check for a known substring from the luxury magazine sub-style rules).
- [X] T026 [P] [US6] Add prompt assembly regression test (c) in `functions/src/contractFixtures.test.ts` — given `campaignType: "retargeting"` + objection `dont_trust` in inputs, call `buildFinalImagePrompt()` and assert the output contains the retargeting trust-resolution visual direction (check for a known substring from the retargeting direction rules).
- [X] T027 [US6] Add copy fidelity validation test in `functions/src/contractFixtures.test.ts` — test `validateCopyFidelity()` with: (a) exact hookText present → returns true, (b) hookText absent → returns false, (c) hookText paraphrased → returns false, (d) Arabic hookText present → returns true.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build && npm run test:contracts` — all tests pass.

---

## Phase 8: Polish & Verification

- [X] T028 Run `npm run build` (frontend) — clean compile
- [X] T029 Run `rm -rf functions/lib && cd functions && npm run build && npm run test:contracts` — all pass
- [X] T030 Grep `functions/src/generators.ts` for inline prompt assembly outside `buildFinalImagePrompt()` — verify none exists (FR-006 compliance)
- [X] T031 Grep `functions/src/` for `resolvedImagePrompt` — verify it appears in generators.ts (trace storage), types or trace schema (field definition), creativeMemory.ts (record storage), contractFixtures.test.ts (tests)

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 (Foundational)
  ├── Phase 2: US1 — Input Audit (depends on T001 marker injection)
  ├── Phase 3: US2 — Copy Fidelity (depends on T002 extraction + T003 validation)
  ├── Phase 4: US3 — Blueprint UI (depends on T002 extraction, T014 strip function)
  └── Phase 5: US1+US5 — Prompt Assembly (depends on T002 extraction)
        └── Phase 6: US4 — Carousel Per-Slide (depends on T018/T019 buildFinalImagePrompt)
              └── Phase 7: US6 — Regression Tests (depends on T018 buildFinalImagePrompt)
Phase 8 (Polish) — depends on all
```

### Parallel Opportunities

```text
# After Phase 1:
Phase 2 (input audit) + Phase 3 (copy fidelity) + Phase 4 (blueprint UI) — all independent
# Within Phase 2:
T006 + T007 + T008 — different input categories, no file conflicts
# Within Phase 7:
T025 + T026 — independent test functions
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 + Phase 5)

1. Complete Phase 1: TECHNICAL_PROMPT extraction + copy fidelity function
2. Complete Phase 2: Audit and fix all input injection gaps
3. Complete Phase 5: Extract `buildFinalImagePrompt()` + trace storage
4. **STOP and VALIDATE**: Every input feeds the prompt, prompt is auditable

### Incremental Delivery

1. Foundational → extraction works
2. Input audit → all gaps fixed (MVP!)
3. Copy fidelity → bad prompts caught and retried
4. Blueprint UI → users see their rendering plan
5. Prompt assembly → single entry point, fully auditable
6. Carousel per-slide → carousel prompts correct
7. Regression tests → guards in place

---

## Notes

- 31 total tasks across 8 phases
- Backend imports use `.js` extension (NodeNext): `import { validateCopyFidelity } from "./buildPlanSlotMap.js"`
- `buildFinalImagePrompt()` becomes the SOLE prompt assembly entry point — no inline assembly after T019
- Copy fidelity is simple `includes()` — no fuzzy matching, no edit distance
- Optional inputs (brand colors, logos, Box C, reference ad) omitted from prompt when absent — no placeholders
- Resolution trace stores full untruncated prompts; CreativeMemoryRecord truncates for storage efficiency
- Per-slide carousel prompts each get their own `buildFinalImagePrompt()` call with correct per-slide copy
