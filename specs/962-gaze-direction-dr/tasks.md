---
description: "Task list for Phase 19 — Direct-Response Design Upgrades (gaze direction)"
---

# Tasks: Direct-Response Design Upgrades (Phase 19)

**Input**: Design documents from `/specs/962-gaze-direction-dr/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — the feature is defined by explicit behavior contracts (Constitution IV) and quickstart.md specifies a `gazeMap.test.ts` mirroring Phase 28's `expressionMap.test.ts`. Pure-mapper contracts (A–C, E, G) are deterministically unit-testable; injection contracts (D) and guardrails (F) are partly verified by unit assertions and partly by quickstart sampling.

**Organization**: Tasks are grouped by the 5 user stories from spec.md (US1=P1, US2=P2, US3=P2, US4=P3, US5=P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US5 from spec.md
- Exact file paths included

## ⚠️ Shared-file note (affects [P] eligibility)

- `functions/src/gazeMap.ts` (NEW) holds the mapper + ALL block builders → US1, US2, US4, US5 add to it. Same file ⇒ those tasks are **sequential** (not [P]) even though the functions are logically independent.
- `functions/src/generators.ts` (EDIT) holds BOTH the image-prompt injection (`buildFinalImagePrompt`, ~line 5428) used by US1/US2/US4/US5 AND the copy CTA block (~line 2478) used by US3. Same file ⇒ injection tasks are **sequential**. US3 edits a different region and is logically independent.
- `functions/src/__tests__/gazeMap.test.ts` (NEW) collects every story's contract tests → one test task per story, **sequential** on that file.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tooling so the new test file is runnable.

- [ ] T001 [P] Add `"test:gazeMap": "node lib/__tests__/gazeMap.test.js"` script to `functions/package.json`, mirroring the existing `test:expressionMap` entry
- [ ] T002 [P] Create empty test scaffold `functions/src/__tests__/gazeMap.test.ts` with the Phase 28 standalone-runner harness (assertion helper + `process.exit(1)` on failure), copied from `functions/src/__tests__/expressionMap.test.ts`

**Checkpoint**: `npm run test:gazeMap` is wired (will pass trivially until tests are added).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types that every block builder and the trace depend on.

**⚠️ CRITICAL**: No user-story implementation can begin until this phase is complete.

- [ ] T003 Create `functions/src/gazeMap.ts` and define the `GazeTreatment` union (`direct_to_viewer | toward_content | reflective_downward | forward_horizon | three_quarter`) and the `GazeDirective` interface (`source`, `sourceId`, `treatment`, `description`) per data-model.md §1–§2
- [ ] T004 [P] Add the additive optional `gazeDirection?` sub-object (`source: "hook"|"objection"|"fallback"|null`, `sourceId: string|null`, `treatment: string|null`, `applied: boolean`, `reason?: string`) to the `ResolutionTrace` type in `functions/src/types.ts` per data-model.md §5 (additive only — no migration)

**Checkpoint**: Shared types compile; both files build clean.

---

## Phase 3: User Story 1 - Smart Gaze Direction (Priority: P1) 🎯 MVP

**Goal**: Resolve a hook-derived (or objection-derived) gaze treatment and inject a natural, advisory `GAZE DIRECTION` block into every hero-bearing image prompt, with before/after split, 9:16 awareness, identity protection, and an audit trace.

**Independent Test**: Run `npm run test:gazeMap` (Contracts A, B, plus D/E gaze rows) and generate a single-image sweep across the 10 hook angles — gaze matches hook emotion, no empty-space stare, no cross-eyed artifacts, face identity unchanged.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL before implementation)

- [ ] T005 [US1] Add Contract A + B + E test cases to `functions/src/__tests__/gazeMap.test.ts`: resolver coverage A1–A11 (10 hooks, 12 objections, aliases, unknown→fallback no-throw, null→null, hook>objection priority, whitespace-only hook fall-through), image-block B1–B7 (GAZE DIRECTION text, identity clause, empty-space/cross-eyed/robotic prohibitions, 9:16 vertical note, before/after split, null→"", positive guide-toward-content clause), and trace E1–E4 shape assertions

### Implementation for User Story 1

- [ ] T006 [US1] In `functions/src/gazeMap.ts`, add `HOOK_GAZE_MAP` (10 canonical angles → treatment+description per research.md R3), `HOOK_ALIAS_MAP` (shocking_stat→statistics, fear_of_missing_out→urgency, future_pacing→future_based), `GAZE_FALLBACK_DIRECTIVE` (three_quarter, never-empty-space), and `GAZE_ASPIRATIONAL_DIRECTIVE` (forward_horizon, AFTER-half)
- [ ] T007 [US1] In `functions/src/gazeMap.ts`, add the objection→treatment grouping (price/trust/timing families, reusing the Phase 28 grouping shape from `expressionMap.ts`) for retargeting heroes
- [ ] T008 [US1] In `functions/src/gazeMap.ts`, implement resolvers `getHookGazeDirection()`, `getObjectionGazeDirection()`, `resolveGazeDirective({coldHookAngle, retargetingObjection})` (hook>objection priority; null only for null/empty input; non-null id never throws/never null — FR-010), and `getKnownHookAngleIds()`
- [ ] T009 [US1] In `functions/src/gazeMap.ts`, implement `buildImagePromptGazeBlock(directive, {beforeAfterSplit, aspectRatio})`: emits the `GAZE DIRECTION` block with identity-priority clause (eye/head orientation only — never alters facial features), advisory/natural clause, the forbidden-failure-modes clause, the positive guide-toward-content clause (when natural and not forced, the gaze MAY lead the viewer's eye toward the CTA/headline — FR-004), composition-defer note, aspect-ratio note (9:16/4:5 vertical → keep gaze in frame; 16:9 → horizontal headroom), and a BEFORE(hook)/AFTER(aspirational) split when `beforeAfterSplit`; returns `""` for null directive
- [ ] T010 [US1] In `functions/src/generators.ts` `buildFinalImagePrompt()` (~line 5428, immediately AFTER the Phase 28 expression block, after BLUEPRINT), inject the result of `buildImagePromptGazeBlock(resolveGazeDirective({coldHookAngle, retargetingObjection ?? retargetingObjections?.[0] ?? null}), { beforeAfterSplit: isBeforeAfterSelection(inputs, inputs.coldHookAngle), aspectRatio })` (mirroring the Phase 28 expression-block shape so a null directive injects nothing); the new `gazeInputs` typed view is `AdInputs & { coldHookAngle?, retargetingObjection?, retargetingObjections? }` so no new `any` cast is added (Nitpick #2). The `buildImagePromptGazeBlock` call is also wrapped in the same DR IIFE that emits `ONE_HIGHLIGHT_BLOCK` (US2), the hook-mood block (US4), and the price-hierarchy block (US5) so all four blocks share one local comment header at the injection site. Comment out nothing it replaces is new (additive).
- [ ] T011 [US1] In `functions/src/generators.ts` `generateFinalAd()` (~line 5524, beside the existing `expressionAdaptation` trace write), populate `_lastResolutionTrace.gazeDirection` = applied directive `{source, sourceId, treatment, applied:true}` or `{source:null, sourceId:null, treatment:null, applied:false, reason:"no-hook-or-objection-active"}` per Contract E

**Checkpoint**: US1 fully functional — gaze block injected on all hero paths, trace recorded; `npm run test:gazeMap` green for A/B/E; Phase 28 expression block still present and correct (F2).

---

## Phase 4: User Story 2 - One Visual Focal Point (Priority: P2)

**Goal**: Always inject a hook-independent one-highlight cap so every hero-bearing ad has a single focal point.

**Independent Test**: `npm run test:gazeMap` (Contract C1, D1/D2) — the one-highlight block is present for both hooked AND no-hook generations; sampled ads show one focal point with ≤1 supporting secondary highlight.

### Tests for User Story 2 ⚠️

- [ ] T012 [US2] Add Contract C1 + D2 test cases to `functions/src/__tests__/gazeMap.test.ts`: `ONE_HIGHLIGHT_BLOCK` is non-empty and states one primary focal point (hero) + ≤1 supporting secondary emphasis + forbids multiple glow/sparkle/highlight; and assert the no-hook injection path still includes it while excluding the gaze block

### Implementation for User Story 2

- [ ] T013 [US2] In `functions/src/gazeMap.ts`, add the exported `ONE_HIGHLIGHT_BLOCK` constant string per data-model.md §4 / Contract C1
- [ ] T014 [US2] In `functions/src/generators.ts` `buildFinalImagePrompt()` (same injection region as T010), inject `ONE_HIGHLIGHT_BLOCK` **unconditionally** for every prompt assembled here — independent of whether a gaze directive resolved (FR-011, Contract D1/D2). No hero-detection gate is needed: the pipeline is uniformly hero-centric (same assumption Phase 28's facial-expression block relies on — it gates only on hook, never on hero presence)

**Checkpoint**: One-highlight cap present on every generation including no-hook; US1 + US2 both pass independently.

---

## Phase 5: User Story 3 - CTA Outcome Framing (Priority: P2)

**Goal**: Add advisory outcome-framing guidance to the Gemini copy prompt's CTA/benefit block, for both Arabic and English, without weakening existing rules.

**Independent Test**: `npm run test:gazeMap` (Contract G presence assertion on the exported guidance constant) + quickstart copy sampling shows outcome-hinted CTAs where natural and direct actions where they fit.

### Tests for User Story 3 ⚠️

- [ ] T015 [US3] Add Contract G test to `functions/src/__tests__/gazeMap.test.ts`: import the exported `CTA_OUTCOME_FRAMING_BLOCK` constant **from the side-effect-free `functions/src/gazeMap.ts`** (NOT from `generators.ts`, which would pull heavy module side-effects into the standalone test runner) and assert it (a) is non-empty, (b) states outcome/benefit framing, (c) marks itself advisory (direct action still allowed), (d) keeps ≈3–5 words / per-language length, (e) references both languages

### Implementation for User Story 3

- [ ] T016 [US3] Define the exported `CTA_OUTCOME_FRAMING_BLOCK` constant in the side-effect-free `functions/src/gazeMap.ts`, then `import` it into `functions/src/generators.ts` and splice it into the existing CTA/benefit block of the copy-generation prompt (~line 2478–2516, after the benefit-formula section, before output formatting) per Contract G; preserve the existing banned-pattern rules, Arabic grammar/flow rules (no leading و, self-contained phrase), and the copy-fidelity contract unchanged (FR-014, F5)

**Checkpoint**: Copy prompt carries outcome-framing guidance in both languages; existing copy rules intact.

---

## Phase 6: User Story 4 - Hook↔Visual Mood Alignment (Priority: P3)

**Goal**: When a hook is present, modulate the visual mood within (never overriding) the art direction/universe.

**Independent Test**: `npm run test:gazeMap` (Contract C2–C4, D1) — mood block reflects hook emotion and states modulate-not-override; absent on no-hook; sampled ads show mood shift with universe still recognizable.

### Tests for User Story 4 ⚠️

- [ ] T017 [US4] Add Contract C2–C4 test cases to `functions/src/__tests__/gazeMap.test.ts`: `buildHookVisualMoodBlock(pain)` → moodier/dramatic shadows; `(future_based)` → brighter/warmer/open; every output states it modulates WITHIN and never overrides art direction/universe; `(null)` → `""`

### Implementation for User Story 4

- [ ] T018 [US4] In `functions/src/gazeMap.ts`, implement `buildHookVisualMoodBlock(directive)` mapping hook emotion families to mood modulation (pain→moodier/shadows, aspiration/future→brighter/warmer/open, authority→structured/symmetrical, urgency→tighter/warm accents), each explicitly subordinate to the active art direction/universe; `null`→`""`
- [ ] T019 [US4] In `functions/src/generators.ts` `buildFinalImagePrompt()` (same injection region), inject `buildHookVisualMoodBlock(directive)` **only when a gaze directive resolved** (hook-gated per FR-015 / Contract D1); no-hook path injects nothing

**Checkpoint**: Mood block hook-gated and present alongside gaze; US1–US4 pass independently.

---

## Phase 7: User Story 5 - Price Hierarchy (Priority: P3)

**Goal**: When (and only when) the copy contains pricing, inject a price-hierarchy block.

**Independent Test**: `npm run test:gazeMap` (Contract C5–C7, D3/D4) — detector true on currency/%/discount, false on price-free copy (and on bare years); block present only when pricing detected, independent of hook.

### Tests for User Story 5 ⚠️

- [ ] T020 [US5] Add Contract C5–C7 + D3/D4 test cases to `functions/src/__tests__/gazeMap.test.ts`: `detectPriceContent` true on "خصم 50٪" / "199 SAR" / "$49", false on price-free coach copy and on a bare year like "2026"; `buildPriceHierarchyBlock()` states original smaller/struck-through, discounted larger/prominent/distinct-color, savings highlighted-but-secondary; injection present only when detected

### Implementation for User Story 5

- [ ] T021 [US5] In `functions/src/gazeMap.ts`, implement `detectPriceContent({hookText, subheadText, benefitText, badges})` (currency/number/percent/discount-keyword scan, Arabic ٪ + Latin %, GCC currencies ر.س/د.إ/SAR/AED/$, خصم/offer; must NOT fire on a bare year) and `buildPriceHierarchyBlock()` per data-model.md §4 / Contract C7
- [ ] T022 [US5] In `functions/src/generators.ts` `buildFinalImagePrompt()` (same injection region), inject `buildPriceHierarchyBlock()` **only when `detectPriceContent(...)` is true** (content-gated, hook-independent per FR-016/FR-017, Contract D3/D4)

**Checkpoint**: Price block conditional and correct; US1–US5 all pass independently.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Regression, reversibility, evidence, docs.

- [ ] T023 Run `cd functions && npm run build` — fix any type errors; confirm `gazeMap.ts`, `types.ts`, `generators.ts` compile clean
- [ ] T024 Run `cd functions && npm test` and `npm run test:expressionMap` — confirm zero regressions (SC-007, F2, F3); Phase 28 expression + mode/format validator suites green
- [ ] T025 Verify reversibility (F4): temporarily comment out the T010/T014/T019/T022 injection lines and force resolvers to return `null`; rebuild; confirm prompt output matches pre-Phase-19 (no GAZE DIRECTION / one-highlight / mood / price text); then restore
- [ ] T026 Execute quickstart.md qualitative sampling (SC-001…SC-006, SC-008–SC-010): 10-hook sweep, before/after, 9:16 story, carousel, batch, no-hook; capture `resolutionTrace.gazeDirection` for a hooked and a no-hook generation as audit evidence (Constitution VI/IX)
- [ ] T027 [P] Update `CLAUDE.md` Recent Changes with the Phase 19 entry (gazeMap.ts, injection point, contracts, reversibility) and mark Phase 19 status in `docs/LAUNCH_MATRIX.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — T001/T002 can start immediately and run in parallel.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**. T003 (gazeMap types) and T004 (trace type) are different files → parallel.
- **User Stories (Phase 3–7)**: all depend on Foundational. US1 is the MVP. US2–US5 each depend on Foundational only and are independently testable, BUT they add to the shared `gazeMap.ts` and `generators.ts` injection region, so when worked concurrently they must coordinate those two files (see Shared-file note).
- **Polish (Phase 8)**: depends on all desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories. Establishes the resolver + injection region reused by US2/US4/US5.
- **US2 (P2)**: after Foundational. Logically independent (adds a constant + an always-on injection). Practically shares the injection region with US1.
- **US3 (P2)**: after Foundational. Fully independent — edits the copy block, a different region/file concern; no dependency on US1.
- **US4 (P3)**: after Foundational. Uses the directive from US1's resolver; best sequenced after US1.
- **US5 (P3)**: after Foundational. Independent of hook resolver (content-gated); shares the injection region.

### Within Each User Story

- Test task first (write to fail) → mapper constants → resolvers → block builder → injection → trace.
- gazeMap.ts tasks are sequential (same file); the generators.ts injection depends on the corresponding builder existing.

### Parallel Opportunities

- **Setup**: T001 ∥ T002 (different files).
- **Foundational**: T003 ∥ T004 (different files).
- **Polish**: T027 ∥ T023–T026 prerequisites (docs are a different file).
- **Cross-story logical independence**: US3 (copy block) is genuinely independent of the image-prompt work and could be built in parallel by a second developer with light merge coordination on `generators.ts`.
- NOTE: the per-story pure builders (ONE_HIGHLIGHT, mood, price) are logically independent but live in the shared `gazeMap.ts`, so they are NOT marked [P].

---

## Parallel Example: Setup + Foundational

```bash
# Phase 1 (parallel):
Task T001: "Add test:gazeMap script to functions/package.json"
Task T002: "Create gazeMap.test.ts runner scaffold"

# Phase 2 (parallel — different files):
Task T003: "Define GazeTreatment + GazeDirective in functions/src/gazeMap.ts"
Task T004: "Add ResolutionTrace.gazeDirection? to functions/src/types.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (CRITICAL, blocks all).
2. Phase 3 US1 (gaze resolver + injection + trace).
3. **STOP & VALIDATE**: run `npm run test:gazeMap` + 10-hook sampling. This alone solves the core problem (random gaze) and is shippable.

### Incremental Delivery

1. Foundation → US1 (MVP, gaze) → demo.
2. + US2 (one-highlight, always-on) → demo.
3. + US3 (CTA framing, copy) → demo.
4. + US4 (mood) → demo.
5. + US5 (price hierarchy) → demo.
6. Polish (regression, reversibility, evidence, docs).

Each story adds value without breaking earlier ones; all guidance is additive, prompt-only, and reversible.

---

## Notes

- [P] = different files, no dependency on incomplete tasks. Most Phase 19 work concentrates in two shared files, so [P] is intentionally sparse — see the Shared-file note.
- Face-identity rule stays priority #1 — no task reorders or weakens it (F1).
- `null` is the only "absent" sentinel; replaced code is commented out, not deleted (FR-023).
- `MODEL_PROVIDER` switch must remain operative on both Gemini and OpenAI paths (FR-021) — verified in T023/T026.
- Commit after each task or logical group; merge via GitHub UI only.
