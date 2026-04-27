---

description: "Phase 16 — Creative Modes & Art Direction QA tasks"
---

# Tasks: Phase 16 — Creative Modes & Art Direction QA

**Input**: Design documents from `/specs/016-creative-modes-qa/`
**Prerequisites**: plan.md, spec.md (clarified), research.md, data-model.md, contracts/mode-format-campaign-validator.md, quickstart.md

**Tests**: This is a QA phase — fixtures **are** the deliverable, not optional. Every functional requirement maps to a contract-fixture test in `functions/src/contractFixtures.test.ts` (existing 81-fixture file) plus a unit-test file for the new validator. Tests are first-class tasks below.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User Story label (US1, US2, US3) — required for story-phase tasks
- File paths are absolute-ish from repo root `D:\proads-worktrees\016-creative-modes-qa`

## Path Conventions

- Backend: `functions/src/...`
- Backend tests: `functions/src/contractFixtures.test.ts` (existing) and `functions/src/__tests__/...` (existing pattern)
- Frontend: `src/components/...`
- Test runner: `cd functions && npm test` — Node's built-in `node:assert/strict`, no vitest, no jest.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm baseline state and prepare insertion points for new fixtures.

- [x] T001 Verify baseline test suite passes — run `cd functions && npm test` and confirm exit code 0 with all 4 test files green and `contractFixtures.test.ts` reporting 81 fixture passes. Capture the pass count for the evidence pack.
- [x] T002 Add a `// ============= PHASE 16 — CREATIVE MODES & ART DIRECTION QA =============` section header and an empty `runPhase16Fixtures()` driver function near the bottom of `functions/src/contractFixtures.test.ts`. Wire the driver into the existing top-level `runAll()` (or equivalent driver) so subsequent fixture tasks have a stable insertion point. Re-run `npm test` and confirm 81 still pass (the driver is empty for now).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type extensions and trace-writer methods that User Story 1 (FR-009) and User Story 3 (FR-008 audit) both depend on.

**⚠️ CRITICAL**: User stories cannot start until these are complete.

- [x] T003 Extend `ResolutionTrace` in `functions/src/types.ts` (lines ~218–253). Add optional fields `modeComposition?: ModeCompositionTrace` and `adaptStateAudit?: AdaptStateAuditResult`. Add the four new interfaces from `data-model.md` § 6 and § 7: `ModeCompositionTrace`, `ModeCompositionWarning`, `AdaptStateAuditEntry`, `AdaptStateAuditResult`. Both new fields MUST be optional — legacy reads must not break.
- [x] T004 Add writer methods to the TraceBuilder in `functions/src/resolutionTrace.ts`: `recordModeCompositionMissing(mode: string, missingElements: string[]): void` (appends to `modeComposition.missing[]` and sets `modeComposition.reinforced = true`) and `recordAdaptStateAudit(result: AdaptStateAuditResult): void` (assigns to `adaptStateAudit`). Confirm `npm run build` succeeds.

**Checkpoint**: Foundation ready — User Stories 1, 2, 3 can proceed in parallel.

---

## Phase 3: User Story 1 — Approved combinations render the ad the user configured + runtime self-correction (Priority: P1) 🎯 MVP

**Goal**: Every solo mode, every approved pair, and every carousel/batch/retargeting variant has a deterministic fixture asserting the build plan contains the mode's documented composition language. When Gemini silently drops a required element, the runtime self-correction path detects it, records a `mode_composition_missing` warning, and reinforces the prompt before render — silently at the user surface.

**Independent Test**: Run `cd functions && npm test`. The Phase 16 driver prints `10 solo modes ✓, 10 approved pairs ✓, 4 carousel-specific ✓, 3 batch-specific ✓, 2 retargeting-specific ✓, self-correction ✓` and exit code is 0. Manually trigger a drift case via the FR-009 fixture and confirm the resolution trace contains the recorded warning + the reinforcement directive in the final image prompt.

### Implementation for User Story 1

- [x] T005 [US1] Audit `getPairRenderExecution()` in `functions/src/generators.ts` (lines ~767–867). For each of the **10 approved pairs** from launch matrix § 2.3 (enumerated in T009 below), confirm the function returns non-empty pair-level composition guidance. Add explicit pair-level handling for any approved pair currently falling through to per-mode appends. Likely candidates from research.md § R3: live-events `event_ticket+speaker_card`, `webinar_screen+speaker_card`; free-guide `standard_hero+book_mockup`, `standard_hero+device_mockup`. Each new block follows the existing `value_stack` pattern at lines ~774+.
- [x] T006 [US1] Implement post-build-plan composition validator in `functions/src/generators.ts`. Add private function `validateModeComposition(technicalPrompt: string, activeModes: string[]): { missing: ModeCompositionWarning[] }`. The function calls `buildPlanSlotMap(technicalPrompt, contract, ownership)` to map the prompt to slot fills (per research.md R1), iterates over each active mode's `requiredElements` from `CREATIVE_MODE_CATALOG[mode].validity.requiredElements`, and for any required element whose corresponding slot is missing in `slotMap.missingZones` or `slotMap.missingOverlaySlots`, builds a `ModeCompositionWarning { mode, missingElements: [<human-readable slot label>], reinforcementInjected: true, detectedAt: 'post_build_plan' }`. Returns the list (empty if all elements present).
- [x] T007 [US1] Wire `validateModeComposition` into the generation pipeline in `functions/src/generators.ts`. After `generateBuildPlan()` returns the post-compliance technical prompt and before the prompt is passed to `buildFinalImagePrompt()`: (a) call `validateModeComposition(prompt, activeModes)`; (b) for each warning in the result, call `traceBuilder.recordModeCompositionMissing(warning.mode, warning.missingElements)`; (c) append `\n\nCRITICAL: This ad MUST include ${missingElement}. Do not omit it.` to the technical prompt for each missing element (verbatim per FR-009). The reinforcement is silent at the user surface — no UI signal, no toast, no badge (Q4 clarification).
- [x] T008 [US1] Add 10 solo-mode fixtures in `functions/src/contractFixtures.test.ts` under the Phase 16 driver from T002 (FR-001). One fixture per mode in single format: `standard_hero`, `value_stack`, `before_after`, `text_only`, `event_ticket`, `webinar_screen`, `speaker_card`, `book_mockup`, `device_mockup`, `testimonial_carousel`. Each asserts (a) `validateLaunchSurface(input).allowed === true`, (b) running the prompt through `buildPlanSlotMap` returns `slotMap.contractCheck.passed === true` and `slotMap.missingZones.length === 0` for that mode's required slots, (c) the layout contract has all the mode's documented zones.
- [x] T009 [US1] Add **10 approved-pair fixtures** in `functions/src/contractFixtures.test.ts` (FR-002). One fixture per approved pair from launch matrix § 2.3 — `standard_hero+value_stack` (mini-course); `standard_hero+event_ticket`, `standard_hero+webinar_screen`, `standard_hero+speaker_card`, `event_ticket+speaker_card`, `event_ticket+webinar_screen`, `webinar_screen+speaker_card` (live-events); `standard_hero+book_mockup`, `standard_hero+device_mockup`, `book_mockup+device_mockup` (free-guide). Each asserts (a) resolver allows the pair via `validateCombination(modes)`, (b) `getPairRenderExecution(primary, secondary, …).length > 0`, (c) `buildPlanSlotMap(prompt)` shows zero missing zones for both modes' required slots. Run after T005 so the audit fix is in place. Universal blocking entries (`before_after` solo-only, `text_only` mutex) are NOT covered here — see T018.
- [x] T010 [US1] Add 4 carousel-specific fixtures in `functions/src/contractFixtures.test.ts` (FR-004, FR-005). (a) `value_stack + carousel`, gift count 3 → assert slide count auto-adjusted to 5 (3+2) and inline notification trigger fired; (b) `testimonial_carousel`, 4 testimonial uploads → assert slide count = 6 (4+2) and slide 1 = AI hook, slide 6 = CTA close; (c) `webinar_screen + carousel` → assert each slide's prompt contains webinar composition language; (d) `standard_hero + carousel` → assert slide 1 has hero composition language and slides 2+ have narrative-progression language.
- [x] T011 [US1] Add 3 batch-specific fixtures in `functions/src/contractFixtures.test.ts` (FR-006). (a) `standard_hero + batch`, 4 items → each item's prompt has hero composition + an independent hook; (b) `speaker_card + batch`, 3 items → each has speaker composition; (c) `value_stack + batch`, 4 items → each has stack-zone composition. Use the existing batch-fixture pattern from `contractFixtures.test.ts`.
- [x] T012 [US1] Add 2 retargeting-specific fixtures in `functions/src/contractFixtures.test.ts` (FR-007). (a) `standard_hero + retargeting + single` with objection `price_too_high` → assert prompt contains both hero composition language **and** objection-answering language; (b) `event_ticket + retargeting + carousel`, 4 sequential objections → assert each slide addresses its own objection while preserving ticket composition.
- [x] T013 [US1] Add 1 self-correction fixture in `functions/src/contractFixtures.test.ts` (FR-009). Construct a `value_stack + standard_hero` mini-course input. Generate the build plan, then **before** calling `validateModeComposition`, manually strip the `stack zone` natural-language pattern from the technical prompt to simulate Gemini drift. Run the validator. Assert (a) the returned warning list contains `{ mode: 'value_stack', missingElements: ['stack zone'], reinforcementInjected: true }`, (b) after wiring, the final technical prompt contains the reinforcement directive `CRITICAL: This ad MUST include stack zone. Do not omit it.`, (c) the resolution trace's `modeComposition.missing` array contains exactly one entry matching the warning.

**Checkpoint**: User Story 1 fully functional and testable independently. MVP shippable here.

---

## Phase 4: User Story 2 — Blocked combinations rejected before any credit is spent (Priority: P1)

**Goal**: Single source-of-truth `validateModeFormatCombination()` exists in `creativeResolver.ts`, is enforced by both client (inline message + disabled Generate) and server (callable rejection with `code: 'invalid_mode_format'`). Defense-in-depth — even saved-project replays cannot bypass.

**Independent Test**: Trigger `before_after + carousel` from the UI: inline message appears below the format selector, Generate button disabled, no network call. Then bypass the client (direct callable invocation): server returns `code: 'invalid_mode_format'`, zero credits charged. Run unit tests in `__tests__/modeFormatValidator.test.ts`: every decision-table row passes; fuzz test reports zero crashes over the input space.

### Implementation for User Story 2

- [x] T014 [P] [US2] Implement `validateModeFormatCombination(input)` in `functions/src/creativeResolver.ts` per `contracts/mode-format-campaign-validator.md`. Co-locate with the existing `validateLaunchSurface` export. Encode the 7-row decision table in order; first match wins. Function is pure, synchronous, no I/O. Reason strings must match the contract verbatim — they appear in the UI and in server error responses.
- [x] T015 [P] [US2] Create `functions/src/__tests__/modeFormatValidator.test.ts` with `node:assert/strict` unit tests. Cover each of the 7 decision-table rows with one positive and one negative example, plus a fuzz test that iterates over a Cartesian product of (mode-set ∈ powerSet of launched modes, format ∈ {single, carousel, batch}, campaign ∈ {cold, retargeting}) and asserts every input produces a valid `ModeFormatValidationResult` (no thrown errors, no `undefined` returns). Update `functions/package.json` line 12 `test` script to include `node lib/__tests__/modeFormatValidator.test.js` after `culturalCompliance.test.js` and before `contractFixtures.test.js`.
- [x] T016 [US2] Wire `validateModeFormatCombination` into all generation-producing callables in `functions/src/index.ts`: `generateAd`, `generateBatch`, `generateCarousel`, `reflowImage`, `magicEdit`, `editAd`, and any other callable that accepts `(modes, adFormat, campaignType)`. Call it as the **first** validation step (before rate limiting, before plan gating, before any credit deduction). On `valid: false`, throw `new HttpsError('invalid-argument', result.reason, { code: 'invalid_mode_format' })` and **do not** proceed.
- [x] T017 [US2] Wire `validateModeFormatCombination` into `src/components/InputForm.tsx`. Import from the same path that already imports `validateLaunchSurface` (existing convention — backend file directly imported by the frontend). In the component, call the validator inside a `useMemo`/`useEffect` that depends on `selectedModes`, `adFormat`, `campaignType`. When `valid: false`: render `result.reason` inline directly below the offending control (mode card grid for mode-related rejections; format selector for format-related; campaign-type toggle for campaign-related) using the existing `bg-amber-500/15 text-amber-400 border border-amber-500/20` styling pattern (around line 2293–2295). Add `(modeFormatValidation.valid === false)` to the existing `disabled` calculation for the *Generate* button (around line 2503).
- [x] T018 [US2] Add 4 blocked-combination fixtures in `functions/src/contractFixtures.test.ts` (FR-003). (a) `before_after + standard_hero` → asserts `validateModeFormatCombination` returns `{ valid: false, reason: 'Before/After is single-image only — defines the entire canvas.' }`; (b) `before_after + carousel` → reason `'Before/After is single-image only.'`; (c) `before_after + batch` → reason `'Before/After is single-image only.'`; (d) `text_only + standard_hero` → reason `'Text-only mode is mutually exclusive — it defines the entire canvas.'`. Each fixture also asserts that when the same input reaches the resolver layer (via `validateLaunchSurface` or the equivalent server-side path), the request is rejected with the same reason — confirming the single-source-of-truth invariant.

**Checkpoint**: User Stories 1 + 2 both functional and independently testable. Server-side defense-in-depth confirmed.

---

## Phase 5: User Story 3 — Art Direction adapt states deliver their declared composition override (Priority: P2)

**Goal**: All 8 explicit adapt states from `LAUNCH_MATRIX.md` § 11 (encoded in `getSubStyleModeFusion()`) deliver their documented composition override in the **post-compliance** technical prompt. The audit utility flags any adapt-state string containing a cultural-compliance trigger word as a launch blocker, without rewriting the catalog (out of scope per FR-008).

**Independent Test**: Run `cd functions && npm test`. The Phase 16 driver prints `8 adapt states ✓, audit: 8/8 strings free of cultural-compliance trigger words ✓`. If any adapt-state string contains a trigger word, the audit fixture fails and reports the offending `${subStyle}__${mode}` pair plus the matched trigger word.

### Implementation for User Story 3

- [x] T019 [P] [US3] Create new file `functions/src/adaptStateAudit.ts`. Export `auditAdaptStates(): AdaptStateAuditResult` and the supporting types (re-export from `types.ts` if cleaner). The function iterates over the 8 explicit adapt-state pairs from `LAUNCH_MATRIX.md` § 11 (hard-coded list of `${subStyleId}__${modeId}` keys in the file), calls `getSubStyleModeFusion(subStyleId, modeId)` from `functions/src/creativeResolver.ts` for each, runs `culturalCompliance.scanAndReplace(fusionString, 'imagePrompt')` (or directly checks against `culturalCompliance.TRIGGER_WORDS`) to detect trigger-word matches, and assembles an `AdaptStateAuditResult` per `data-model.md` § 7. Pure function, no I/O.
- [x] T020 [US3] Add **8 adapt-state fixtures** in `functions/src/contractFixtures.test.ts` (FR-008). The exact 8 `${subStyleId}__${modeId}` pairs from LAUNCH_MATRIX § 11 are: (1) `luxury_magazine + value_stack`, (2) `luxury_magazine + event_ticket`, (3) `anime_manga + value_stack`, (4) `anime_manga + event_ticket`, (5) `vintage_bw + value_stack`, (6) `comic_book + value_stack`, (7) `watercolor_dreamscape + event_ticket`, (8) `cinematic_film_still + value_stack`. For each pair: construct full Arabic-locale inputs (forces the cultural-compliance pass to run inside `generateBuildPlan`), call `generateBuildPlan()`, assert the substring returned by `getSubStyleModeFusion(subStyle, mode)` for that pair appears in the returned post-compliance technical prompt. Verifying post-compliance is the explicit Q3 clarification.
- [x] T021 [US3] Add 1 adapt-state audit fixture in `functions/src/contractFixtures.test.ts`. Calls `auditAdaptStates()` from T019 and asserts (a) `result.totalChecked === 8`, (b) `result.failed === 0`. On failure, the assertion message MUST report the offending `${subStyleId}__${modeId}` pair and the matched trigger word(s) so catalog owners can rewrite the string. The audit's pass is a launch-gate condition.

**Checkpoint**: All three user stories independently functional. The full Phase 16 fixture suite is green.

---

## Phase 6: Polish & Cross-cutting Concerns

**Purpose**: Verify the complete suite, capture evidence, and update project documentation.

- [x] T022 Run full `cd functions && npm test`. Confirm exit code 0 and pass count **≥ 124 (81 baseline + 43 new)**. Capture stdout to `specs/016-creative-modes-qa/evidence/test-output.txt` (or equivalent path under `docs/evidence/` per `docs/evidence-template.md`).
- [ ] T023 Run `npm run dev` and complete `quickstart.md` Step 5 manually: select `before_after` then attempt `carousel` format; confirm the inline message appears below the format selector with the exact reason string from the contract decision table; confirm *Generate* is disabled; confirm DevTools Network tab shows zero outbound generation requests. Capture a screenshot to the evidence folder.
- [x] T024 [P] Update `docs/LAUNCH_MATRIX.md` Phase 16 row state. Add a status note (e.g. "✅ Implemented — 43 fixtures green; FR-009 self-correction live; adapt-state audit clean.") so the matrix reflects launch readiness.
- [x] T025 [P] Update `CLAUDE.md` "Recent Changes" section with a one-line Phase 16 summary capturing: (a) `validateModeFormatCombination` added (single source of truth, used by `InputForm.tsx` and all generation callables in `index.ts`), (b) post-build-plan composition validator added in `generators.ts` with `mode_composition_missing` warning + verbatim reinforcement, (c) `adaptStateAudit.ts` introduced as a launch-gate, (d) 43 fixtures added across solo modes, approved pairs, blocked combos, carousel/batch/retargeting variants, self-correction, adapt states, and audit.
- [ ] T026 Run a smoke generation end-to-end (real Gemini call, dev project) on each of the 11 launch priority lanes from the constitution (Section "Priority Lanes"). For each: confirm the rendered ad obeys the selected mode (Principle II), the resolution trace contains the expected fields, and any drift instances were caught and reinforced. Record results in the evidence pack.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 → T002 (sequential — both touch the same test file)
- **Foundational (Phase 2)**: T003 → T004 (writer methods need the types)
- **User Stories**: All depend on Phase 2 completion
  - US1 (Phase 3): T005, T006, T007 must precede T013 (drift fixture needs wiring); T005 must precede T009 (pair fixtures need pair audit)
  - US2 (Phase 4): T014 must precede T015–T018; T015 can run in parallel with T014 once the function signature is locked
  - US3 (Phase 5): T019 must precede T021; T020 can run in parallel with T019 once `getSubStyleModeFusion` is read
- **Polish (Phase 6)**: T022, T023, T026 depend on US1+US2+US3 complete; T024, T025 are documentation-only and can run anytime after Phase 5 closes

### User Story Dependencies

- **US1 (P1)**: Independent of US2 and US3 — depends only on Foundational (T003, T004 — T009/T013 read the trace types).
- **US2 (P1)**: Independent of US1 and US3 — fully self-contained validator + UI wiring.
- **US3 (P2)**: Independent of US1 and US2.

All three user stories can be implemented and tested in parallel by different developers once Foundational completes.

### Within Each User Story

- US1: T005 (pair audit) → T006 → T007 (validator wired into pipeline) → T008 (solo fixtures, parallel-safe with T009 only if test-file insertion points are kept disjoint, but in practice sequential to avoid merge conflicts) → T009 → T010 → T011 → T012 → T013.
- US2: T014 → T015 (in parallel) → T016 (server wiring) → T017 (client wiring, parallel with T016) → T018 (fixtures).
- US3: T019 → T020 (parallel with T019 once `getSubStyleModeFusion` is read) → T021.

---

## Parallel Opportunities

- **Phase 1**: T001 → T002 sequential.
- **Phase 2**: T003 → T004 sequential.
- **After Phase 2**: T005 (US1), T014 (US2), T019 (US3) can run **in parallel** — different files, no dependencies on each other. This is the largest parallel-team multiplier.
- **Within US2**: T014 (`creativeResolver.ts`) and T015 (`__tests__/modeFormatValidator.test.ts`) [P]; once T014 is in, T016 (`index.ts`) and T017 (`InputForm.tsx`) [P].
- **Within US3**: T019 (`adaptStateAudit.ts`) [P] with anything outside its file.
- **Phase 6 documentation**: T024 and T025 marked [P].
- **Fixture writes inside `contractFixtures.test.ts`** are NOT parallel — same file. Sequence them.

---

## Parallel Example: Three-Developer Strategy

```text
Developer A (US1 owner):  T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013
Developer B (US2 owner):  T014 + T015 (parallel) → T016 + T017 (parallel) → T018
Developer C (US3 owner):  T019 + T020 (parallel) → T021
```

After all three converge on Phase 6:
- T022 (full test run) — anyone
- T023 (UI smoke test) — Developer B (owns frontend)
- T024 + T025 (parallel docs) — anyone
- T026 (priority-lane smoke) — anyone

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (T001–T002): baseline + scaffold.
2. Phase 2 (T003–T004): foundational types + writer methods.
3. Phase 3 (T005–T013): all of US1 — solo modes, pairs, carousel/batch/retargeting variants, runtime self-correction.
4. **STOP and VALIDATE**: run `cd functions && npm test`. Confirm 81 baseline + 30 new (US1's portion: 10 solo + 10 approved pairs + 4 carousel + 3 batch + 2 retargeting + 1 self-correction) fixtures pass. Smoke-test one drift case manually via the T013 fixture.
5. Deploy / demo if ready. The product is materially better even without US2 and US3 — the catalog is now self-correcting.

### Incremental Delivery

1. Setup + Foundational → Foundation ready.
2. + US1 → Catalog renders reliably with self-correction → Deploy/Demo (MVP).
3. + US2 → Bad combos are unreachable end-to-end → Deploy/Demo.
4. + US3 → Art-direction adapt states have a launch-gated audit → Deploy/Demo (full Phase 16 done).
5. Phase 6 → Evidence pack + docs.

### Parallel Team Strategy

Three developers, ~5 working days end-to-end:

- Day 1: Setup + Foundational together.
- Days 2–3: Three developers fork into US1, US2, US3 in parallel.
- Day 4: Converge on Phase 6 — full suite, smoke tests, docs.
- Day 5: Buffer for fixes from priority-lane smoke.

---

## Notes

- [P] tasks = different files, no dependencies — parallel-safe even on a shared branch.
- All fixture additions land in the **existing** `functions/src/contractFixtures.test.ts` to avoid touching the test runner script for that file. Only T015 introduces a new test file (`__tests__/modeFormatValidator.test.ts`) and updates `functions/package.json`.
- The reason strings in T014 and T018 must match **verbatim** between the validator implementation, the unit tests, the contract-fixture assertions, and the inline UI message rendering. The contract document is the single source of truth.
- The runtime self-correction path (T006/T007) deliberately does **not** re-render after reinforcement. The reinforcement modifies the **same** technical prompt that the **same single render call** receives. No double-render cost — Principle VIII.
- Silent-at-the-user-surface for FR-009 reinforcement (T007) is the explicit Q4 clarification. Do not add badges, toasts, or copy. The trace is the only audit channel.
- Cultural-compliance interaction: FR-008 fixtures (T020) must use Arabic-locale inputs to ensure the post-compliance pass actually runs. English-locale inputs would not exercise `scanAndReplace` and would not validate the Q3 clarification.
- The adapt-state audit (T019, T021) does **not** rewrite the catalog. It flags failures for content owners. Rewriting fusion strings is out of scope per `spec.md` Out of Scope.
