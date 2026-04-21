# Tasks: Blueprint → Long-Form Render Prompt Pipeline (Phase 2)

**Input**: Design documents from `/specs/005-render-prompt-pipeline/`
**Prerequisites**: Phase 1 tasks (T001–T031) complete. Pipeline is operational.
**Status**: Ready for implementation — closing remaining gaps from spec clarifications (2026-04-10)

**Context**: The original 31 tasks (T001–T031) are complete. This task list addresses gaps identified during the spec review and clarification session on 2026-04-10:
1. `validateCopyFidelity()` checks only `hookText` — must expand to all 4 copy fields
2. Retry exhaustion shows error toast — must show warning banner with cancel/retry before image generation
3. Carousel `perSlide` trace population needs verification/wiring
4. `blueprintText` in main generation document needs verification
5. Test coverage needs expansion for 4-field fidelity and carousel copy isolation

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational — Expand Copy Fidelity Signature

**Purpose**: Update the core validation function to check all 4 unconditional copy fields per FR-003 (updated 2026-04-10)

- [x] T032 Expand `validateCopyFidelity()` in `functions/src/buildPlanSlotMap.ts` — change signature from `(technicalPrompt: string | null, hookText: string): boolean` to accept an object `{ hookText, subheadText, ctaName, benefitText }`. For each non-empty field, apply NFC normalization + whitespace collapse and check `normalizedPrompt.includes(normalizedField)`. Return `{ passed: boolean, failedFields: string[] }` so callers know which field(s) failed. Keep backward compatibility by also exporting or adapting the old signature if needed.

**Checkpoint**: `cd functions && rm -rf lib && npm run build` — clean compile.

---

## Phase 2: US2 — 4-Field Copy Fidelity Validation (Priority: P2) MVP

**Goal**: Validate all 4 copy fields (hookText, subheadText, ctaName, benefitText) in the TECHNICAL_PROMPT. On retry exhaustion, show warning banner with cancel/retry option.

**Independent Test**: Generate a build plan with known hookText + subheadText + ctaName + benefitText. Verify validation checks all 4. Mock a plan with paraphrased subheadText. Verify it triggers rebuild.

- [x] T033 [US2] Update `validateCopyFidelity()` call site in `functions/src/generators.ts` — where `validateCopyFidelity()` is currently called after `parseBuildPlanEnvelope()`, pass all 4 copy fields: `{ hookText, subheadText, ctaName, benefitText }`. Check the `passed` result. If `!passed`, log which fields failed via `failedFields` and trigger retry as before (max 2 retries, 3 total attempts).
- [x] T034 [US2] Update retry-exhausted handling in `functions/src/generators.ts` — when all 3 attempts fail copy fidelity, instead of throwing `CopyFidelityError`, return the best available build plan with a warning flag: `{ buildPlan, copyFidelityWarning: { failed: true, failedFields: string[] } }`. The caller should NOT block generation.
- [x] T035 [US2] Update `functions/src/index.ts` — in the `serverGenerateBuildPlan` or `serverGenerateFinalAd` handler, when the returned result includes `copyFidelityWarning.failed === true`, return `{ success: true, warningCode: 'copy_fidelity_degraded', failedFields: [...] }` alongside the normal generation response. Do NOT return `success: false` — generation proceeds.
- [x] T036 [US2] Update warning UX in `src/App.tsx` — when the generation response includes `warningCode: 'copy_fidelity_degraded'`, display a warning banner (not error toast) BEFORE image generation starts, with: (a) message explaining which copy fields couldn't be verified, (b) "Continue" button (prominent default — proceeds to image generation), (c) "Retry" button (re-triggers build plan generation with same inputs), (d) "Cancel" button (stops generation, returns user to Step 3). The banner blocks until the user clicks one of the three buttons — no auto-dismiss, no auto-timeout. "Continue" is the expected default action. Follow existing toast/banner styling patterns.

**Checkpoint**: `cd functions && rm -rf lib && npm run build && cd .. && npm run build` — both backend + frontend compile clean.

---

## Phase 3: US4 — Carousel Per-Slide Trace Verification (Priority: P4)

**Goal**: Verify carousel per-slide prompts use correct per-slide copy text and populate the `perSlide` trace array.

**Independent Test**: Generate a 3-slide carousel. Inspect `ResolutionTrace.perSlide` — each entry should have unique `resolvedImagePrompt` and `blueprintText` with that slide's specific copy.

- [x] T037 [US4] Audit carousel rendering path in `functions/src/generators.ts` — find where `buildFinalImagePrompt()` is called for carousel slides. Verify each slide's call receives that slide's specific `hookText`/`subheadText` from the carousel copies (not slide 1's text reused). If text is shared across slides, fix to use per-slide copy from the approved carousel hook data.
- [x] T038 [US4] Verify `perSlide` trace population in `functions/src/generators.ts` — after each per-slide `buildFinalImagePrompt()` call, verify the returned `trace.resolvedImagePrompt` and `trace.blueprintText` are stored in the `ResolutionTrace.perSlide[i]` entry. If `perSlide` array is not being populated, wire it up.

**Checkpoint**: `cd functions && rm -rf lib && npm run build` — clean compile.

---

## Phase 4: US3+US5 — Storage Verification (Priority: P3/P5)

**Goal**: Verify `blueprintText` and `resolvedImagePrompt` are stored in the main Firestore generation document, and that the frontend strips TECHNICAL_PROMPT from the blueprint display.

**Independent Test**: Generate an ad. Query `generations/{genId}` document directly. Verify both fields exist. Check Step 3 UI — blueprint panel should show no `[[TECHNICAL_PROMPT]]` markers.

- [x] T039 [P] [US5] Audit `functions/src/index.ts` — verify that the `generations/{genId}` Firestore document write includes `blueprintText` and `resolvedImagePrompt` fields from the resolution trace. If only stored in `creativeMemory` but not the main generation doc, add the fields to the generation doc write.
- [x] T040 [P] [US3] Audit `src/App.tsx` "View Blueprint" panel (around line 5676) — verify the blueprint text displayed to the user has `[[TECHNICAL_PROMPT]]..[[/TECHNICAL_PROMPT]]` content stripped. If the stripping happens server-side (in the response), verify the backend strips it. If client-side, verify the frontend applies `stripTechnicalPrompt()` or equivalent before display.

**Checkpoint**: `npm run build` — frontend compiles clean.

---

## Phase 5: US6 — Expanded Regression Tests (Priority: P6)

**Goal**: Expand regression tests to cover 4-field copy fidelity validation, carousel per-slide copy isolation, and campaign context field presence.

**Independent Test**: `cd functions && npm test` — all new tests pass.

- [x] T041 [P] [US6] Add 4-field copy fidelity test in `functions/src/contractFixtures.test.ts` — test `validateCopyFidelity()` with the new multi-field signature: (a) all 4 fields present → `{ passed: true }`, (b) hookText present but subheadText paraphrased → `{ passed: false, failedFields: ['subheadText'] }`, (c) ctaName missing → `{ passed: false, failedFields: ['ctaName'] }`, (d) empty benefitText skipped → `{ passed: true }` (empty fields not validated), (e) Arabic text across all 4 fields → `{ passed: true }`, (f) empty hookText → `{ passed: false, failedFields: ['hookText'] }` (hookText is required).
- [x] T042 [P] [US6] Add campaign context field presence test in `functions/src/contractFixtures.test.ts` — given a mock `buildFinalImagePrompt()` input with `productName: "FitPro"`, `targetAudience: "busy professionals"`, verify the assembled `textPrompt` or `coreDesignRules` contains these campaign context values. This guards FR-001 (campaign context fields added 2026-04-10).
- [x] T043 [P] [US6] Add carousel per-slide copy isolation test in `functions/src/contractFixtures.test.ts` — call `buildFinalImagePrompt()` twice with different hookText values (slide 1: "عرض خاص", slide 2: "فرصة لا تتكرر"). Assert slide 1's `textPrompt` contains only slide 1's hookText. Assert slide 2's `textPrompt` contains only slide 2's hookText and NOT slide 1's.

**Checkpoint**: `cd functions && rm -rf lib && npm run build && npm test` — all tests pass.

---

## Phase 6: US1 — Input Injection Audit (Priority: P1)

**Goal**: Walk all conditionals in `generateBuildPlan()` to verify no Step 1 input is silently dropped in any code path.

**Independent Test**: Grep the build plan prompt template for each field name. Verify all 14 Step 1 fields (productName, targetAudience, challenges, transformation, offerType, offerCreativeMode, visualSubStyle, visualStyleFamily, preferredUniverse, campaignType, coldHookAngle, retargetingObjection, adTone, brandColorPrimary/Secondary) appear.

- [x] T044 [US1] Audit all conditionals in `generateBuildPlan()` in `functions/src/generators.ts` — walk every `if` statement that guards input injection. For each conditional, verify: (a) the condition is correct (e.g., cold-only fields guarded by `campaignType === 'cold'`), (b) the field is not silently dropped when the condition is true and input is provided, (c) campaign context fields (`productName`, `targetAudience`, `challenges`, `transformation`, `offerType`) are injected unconditionally. Document any fixes applied.

**Checkpoint**: `cd functions && rm -rf lib && npm run build` — clean compile.

---

## Phase 7: Polish & Verification

- [x] T045 Run `npm run build` (frontend) — clean compile with no warnings
- [x] T046 Run `cd functions && rm -rf lib && npm run build && npm test` — all backend tests pass
- [x] T047 Grep `functions/src/generators.ts` for inline prompt assembly outside `buildFinalImagePrompt()` — verify none exists (FR-006 compliance check)
- [x] T048 Grep `functions/src/` for `resolvedImagePrompt` — verify it appears in: generators.ts (trace storage), index.ts (generation doc write), creativeMemory.ts (record storage), contractFixtures.test.ts (tests)

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 (Foundational — T032 expand validateCopyFidelity)
  ├── Phase 2: US2 — 4-Field Fidelity (depends on T032)
  ├── Phase 5: US6 — Tests (depends on T032 for new signature)
  └── Independent of Phases 3, 4, 6

Phase 3 (US4 — Carousel) — Independent, can start immediately
Phase 4 (US3+US5 — Storage) — Independent, can start immediately
Phase 6 (US1 — Audit) — Independent, can start immediately

Phase 7 (Polish) — depends on all
```

### Parallel Opportunities

```text
# After Phase 1 (T032):
Phase 2 (4-field fidelity) + Phase 3 (carousel) + Phase 4 (storage) + Phase 6 (audit) — all independent

# Within Phase 4:
T039 + T040 — different files (index.ts vs App.tsx)

# Within Phase 5:
T041 + T042 + T043 — independent test functions in same file
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2)

1. Complete Phase 1: Expand `validateCopyFidelity()` signature
2. Complete Phase 2: Wire 4-field validation + warning banner UX
3. **STOP and VALIDATE**: All 4 copy fields validated, warning banner works

### Incremental Delivery

1. Foundational (T032) → new signature ready
2. 4-field fidelity (T033-T036) → all copy fields validated, UX updated (MVP!)
3. Carousel verification (T037-T038) → per-slide prompts confirmed correct
4. Storage verification (T039-T040) → blueprintText in generation doc confirmed
5. Expanded tests (T041-T043) → regression guards for all new behavior
6. Input audit (T044) → final completeness pass
7. Polish (T045-T048) → full verification

---

## Notes

- 17 new tasks (T032–T048) across 7 phases
- Continues from completed tasks T001–T031
- Backend imports use `.js` extension (NodeNext): `import { validateCopyFidelity } from "./buildPlanSlotMap.js"`
- `validateCopyFidelity()` returns `{ passed, failedFields }` — callers check `passed` and log `failedFields`
- Warning banner is NOT an error — it blocks until user clicks Continue (default), Retry, or Cancel
- Carousel per-slide tasks are verification/audit — may require no code changes if already wired
- Storage verification tasks are audit — may require no code changes if already stored
