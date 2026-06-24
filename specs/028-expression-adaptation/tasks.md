---
description: "Task list for Expression Adaptation (Phase 28)"
---

# Tasks: Expression Adaptation (Phase 28)

**Input**: Design documents from `/specs/028-expression-adaptation/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/expression-mapping.md ✅

**Tests**: INCLUDED. This feature is contract-driven (`contracts/expression-mapping.md` defines explicit PASS/BLOCKED assertions) and SC-006 mandates zero regressions, so unit tests are part of scope (Constitution IV — behavior contracts).

**Organization**: Tasks grouped by user story (US1–US6 from spec.md) in priority order. The mechanism is a single shared mapper + one injection point, so foundational plumbing is built once (Phase 2) and each story adds its specific mapping data / block language / verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US6 (user-story phases only)

## Path Conventions

Backend-only feature. All source under `functions/src/`. Tests co-located as `functions/src/*.test.ts` (run via `cd functions && npm test`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new module + type scaffolding referenced by every later phase.

- [x] T001 [P] Create `functions/src/expressionMap.ts` skeleton: export signatures `getHookExpressionDirection(angle: string | null): ExpressionDirective | null`, `getObjectionExpressionDirection(objectionId: string | null): ExpressionDirective | null`, `buildExpressionDirectionBlock(directive: ExpressionDirective | null, opts?): string` — all returning `null`/`''` stubs for now. Model file structure on `functions/src/culturalCompliance.ts`.
- [x] T002 [P] Add `ExpressionDirective` interface (`source: "hook" | "objection"; sourceId: string; emotion: string; description: string`) to `functions/src/types.ts` per data-model.md.
- [x] T003 [P] Create test scaffold `functions/src/expressionMap.test.ts` importing the module, the backend authoritative angle list `HOOK_ANGLE_KNOWLEDGE` from `./knowledge/hookAnglesKnowledge` (use `Object.keys(HOOK_ANGLE_KNOWLEDGE)` — the 10 canonical ids), and `RETARGETING_OBJECTION_DATA` from `./retargetingObjections`. Do NOT import from frontend `../../src/constants` — `functions/` does not import the frontend package.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire the trace field, the shared block builder, the single injection point, and trace population so the pipeline runs end-to-end. With no mapping data yet, the mapper returns `null` and behavior is byte-identical to today (safe no-op).

**⚠️ CRITICAL**: No user story can be verified until this phase is complete.

- [x] T004 Add optional `expressionAdaptation?: { source: "hook" | "objection"; sourceId: string; emotion: string; applied: boolean }` to the `ResolutionTrace` interface in `functions/src/generators.ts` (~line 5135). Additive only.
- [x] T005 [P] Mirror the same optional `expressionAdaptation?` field in the `ResolutionTrace` type in `functions/src/types.ts`.
- [x] T006 [P] Mirror the `expressionAdaptation?` field in the documented `ResolutionTrace` interface in `docs/LAUNCH_MATRIX.md` (~line 798).
- [x] T007 Implement the base `buildExpressionDirectionBlock(directive)` in `functions/src/expressionMap.ts`: returns `''` for `null`; otherwise emits an `EXPRESSION DIRECTION:` text containing the emotion + description, an identity-is-priority-#1 clause (must not change bone structure/features), a subtle/natural clause that forbids exaggerated/theatrical, and NO gaze-direction instruction (Contract B1, B2, B4, B5, B6).
- [x] T008 Wire the single injection point in `functions/src/generators.ts` `[VISUAL ARCHITECT V5.0]` concept prompt (~lines 3097–3103): compute `const _exprDirective = _effectiveColdHookAngle ? getHookExpressionDirection(_effectiveColdHookAngle) : getObjectionExpressionDirection(_rtCtx.objectionId)`, then emit `${buildExpressionDirectionBlock(_exprDirective)}` on its own line immediately after the `MOOD DIRECTION:` line. Guard so `null` → no line emitted. Additive (nothing replaced; no comment-out needed).
- [x] T009 Populate `expressionAdaptation` on `_lastResolutionTrace` in the concept-generation trace-assembly path in `functions/src/generators.ts`: set `{ source, sourceId, emotion, applied: true }` when a directive was emitted; omit or `applied:false` otherwise (FR-017, Contract E1–E3).

**Checkpoint**: Build passes; with empty mapping data the prompt is unchanged from pre-Phase-28 (Contract C3 holds trivially).

---

## Phase 3: User Story 1 - Pain hook produces an emotionally congruent hero (Priority: P1) 🎯 MVP

**Goal**: A pain hook yields a hero showing concern/frustration (not a smile), same identity.

**Independent Test**: Generate a single ad with an uploaded face + pain angle → hero shows concern/frustration, face matches upload; `resolutionTrace.expressionAdaptation.emotion` reflects pain.

### Tests for User Story 1

- [x] T010 [P] [US1] In `functions/src/expressionMap.test.ts`: assert `getHookExpressionDirection('pain')` returns a directive whose emotion conveys concern/frustration and whose description mentions "not anger"/quiet suffering (Contract A2); assert block builder output for it contains the identity-priority and subtle clauses (Contract B1, B2, B4).

### Implementation for User Story 1

- [x] T011 [US1] Implement the request-overlap cold-angle entries in `getHookExpressionDirection` in `functions/src/expressionMap.ts`: `pain` → concern/frustration (slight frown, tired eyes, jaw tension — not anger); plus `curiosity`, `logic`, `social_proof`, `urgency` per data-model.md table. (`source:"hook"`, `sourceId` = angle id.)
- [x] T012 [US1] Manually verify quickstart.md step 1 (pain hook + uploaded smiling photo → concern, same face) and confirm `expressionAdaptation` is recorded in the generation trace.

**Checkpoint**: MVP — pain (and the 5 overlap angles) drive expression end-to-end; identity preserved.

---

## Phase 4: User Story 2 - Every hook angle drives its mapped expression (Priority: P1)

**Goal**: All 10 `COLD_HOOK_ANGLES` ids resolve to a defined emotional direction (no angle unmapped).

**Independent Test**: For each angle, the mapper returns a non-null directive and the trace records a non-empty emotion (SC-003).

### Tests for User Story 2

- [x] T013 [P] [US2] In `functions/src/expressionMap.test.ts`: coverage test asserting EVERY id in `Object.keys(HOOK_ANGLE_KNOWLEDGE)` (the 10 canonical backend angle ids — confirmed identical to frontend `COLD_HOOK_ANGLES`) → non-null directive with non-empty `emotion` + `description` (Contract A1); assert the 5 confirmed defaults map as specified (Contract A3–A7); assert aliases `shocking_stat`→statistics, `fear_of_missing_out`→FOMO-urgent, `future_pacing`→future_based (Contract A15); assert unknown id `"zzz_bogus"` → fallback directive, not null (Contract A13); assert `getHookExpressionDirection(null)` and both-null → `null` (Contract A14).

### Implementation for User Story 2

- [x] T014 [US2] Add the 5 confirmed-default cold-angle entries to `getHookExpressionDirection` in `functions/src/expressionMap.ts`: `emotional`→empathetic/heartfelt; `statistics`→sober/analytical; `scarcity`→urgent/alert; `logical_authority`→commanding/assured; `future_based`→aspirational/hopeful (FR-005, Clarif. 2026-06-23).
- [x] T015 [US2] Add defensive alias resolution + the fallback directive (confident/approachable) for unrecognized non-null ids in `functions/src/expressionMap.ts` (Decision 5).

**Checkpoint**: 100% of selectable cold angles produce traced expression guidance (SC-003).

---

## Phase 5: User Story 3 - Retargeting objections drive expression (Priority: P2)

**Goal**: Retargeting generations map the active objection to an expression family.

**Independent Test**: Generate a retargeting ad per objection family → trace `source:"objection"` with the correct family emotion.

### Tests for User Story 3

- [x] T016 [P] [US3] In `functions/src/expressionMap.test.ts`: assert every id in `RETARGETING_OBJECTION_DATA` (all 12) maps to the correct family (Contract A8–A12): price/budget/payment→analytical; trust/burned/tried→reassuring; timing/no-time/not-ready→urgent; others→confident/approachable fallback; all return `source:"objection"`.

### Implementation for User Story 3

- [x] T017 [US3] Implement `getObjectionExpressionDirection` in `functions/src/expressionMap.ts` with the four family groupings + fallback per data-model.md (covers all 12 `RETARGETING_OBJECTION_DATA` ids).
- [x] T018 [US3] Confirm the T008 injection branch selects `getObjectionExpressionDirection(_rtCtx.objectionId)` when `_effectiveColdHookAngle` is null (retargeting), and that the trace sets `source:"objection"` (Contract C2, E2). Adjust the branch in `functions/src/generators.ts` if needed.

**Checkpoint**: Retargeting path drives expression independently of cold angles.

---

## Phase 6: User Story 4 - Art-direction character blends with hook emotion (Priority: P2)

**Goal**: Guidance blends art-direction character (style) with the hook emotion, not replacing either.

**Independent Test**: Same hook under two art directions → expression reflects hook emotion expressed through each art direction's character; art-direction `MOOD_EMOTION` blocks unchanged.

### Tests for User Story 4

- [x] T019 [P] [US4] In `functions/src/expressionMap.test.ts`: assert `buildExpressionDirectionBlock` output contains the blending instruction (art direction = character/style, hook = emotion; e.g. produces "powerful concern" not flat "concern") (Contract B3).

### Implementation for User Story 4

- [x] T020 [US4] Enhance `buildExpressionDirectionBlock` in `functions/src/expressionMap.ts` with the blending clause (FR-008): art direction sets character, hook sets emotion; do not flatten or replace the art direction's energy.
- [x] T021 [US4] Confirm no edit was made to the per-art-direction `MOOD_EMOTION` default blocks in `functions/src/generators.ts` (~lines 4076–4091) — they MUST stay unchanged (Contract D1 spirit / FR keeps art-direction blocks).

**Checkpoint**: Blending verified; art-direction blocks untouched.

---

## Phase 7: User Story 5 - Before/after split shows emotional contrast (Priority: P2)

**Goal**: BEFORE half = hook/problem emotion, AFTER half = aspirational/confident; same identity; existing before/after rules not contradicted.

**Independent Test**: Generate before/after with a pain hook → before reads problem emotion, after reads confident; same face both halves (SC-005).

### Tests for User Story 5

- [x] T022 [P] [US5] In `functions/src/expressionMap.test.ts` (or a focused generators-prompt check): assert that when `isBeforeAfterSelection` is true the emitted guidance is consistent with the existing before/after block and does not remove/override "BEFORE … struggle expression / AFTER … confident expression" (Contract C5).

### Implementation for User Story 5

- [x] T023 [US5] In `functions/src/generators.ts`, ensure the expression guidance reinforces (does not contradict) the existing before/after block (~line 3118) and `MOOD_EMOTION` before/after templates (~lines 4044, 4060). Add a brief reinforcement note only if a contradiction is found; otherwise leave the existing block intact (FR-010).
- [x] T024 [US5] Manually verify quickstart.md step 4 (before/after pain hook).

**Checkpoint**: Before/after contrast preserved and reinforced.

---

## Phase 8: User Story 6 - Carousel and batch behave per their nature (Priority: P3)

**Goal**: Carousel = one expression across slides; batch = per-item hook → per-item expression.

**Independent Test**: Carousel slides share one direction; batch items with rotating hooks each get their own.

### Implementation for User Story 6

- [x] T025 [US6] Verify that because the injection lives in the shared concept-prompt builder, batch items each pass their own `inputs.coldHookAngle` (per-item direction) and carousel slides share the run's single hook. Confirm via the carousel/batch generation paths in `functions/src/generators.ts`; add per-item plumbing ONLY if a path bypasses the shared builder (Contract C6, C7).
- [x] T026 [US6] Manually verify a carousel (consistent expression) and a batch with rotating hooks (per-item expression) per quickstart.md.

**Checkpoint**: Multi-output paths behave correctly with no new branching unless required.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T027 [P] Verify reversibility: any replaced prompt content is commented out (not deleted) and `null` is used as the absent sentinel throughout `functions/src/expressionMap.ts` and the injection site (Contract D4, FR-016).
- [x] T028 [P] Run `cd functions && npm test` — all suites green, zero regressions (Contract D2, SC-006).
- [x] T029 [P] Run `cd functions && npm run build` and repo-root `npm run build` — both compile clean; confirm frontend untouched.
- [x] T030 Verify `MODEL_PROVIDER=gemini` and `MODEL_PROVIDER=openai` both still produce valid generations (Contract D3).
- [x] T031 [P] Update `docs/LAUNCH_MATRIX.md` Phase 28 status and add a Phase 28 entry to `CLAUDE.md` "Recent Changes".
- [x] T032 Run full quickstart.md manual verification (steps 1–6) and record before/after evidence (Constitution IX).
- [x] T033 [P] Verify FR-013 (no uploaded face / no Box A): generate an ad with a hook angle but NO reference photo and confirm the expression guidance still applies to the AI-generated hero and `resolutionTrace.expressionAdaptation` is recorded (Contract C8).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories (provides the injection point, trace field, block builder).
- **User Stories (Phase 3–8)**: All depend on Foundational. US1 first (MVP). US2 depends on US1 (extends the same `getHookExpressionDirection` data object). US3, US4 are independent of US1/US2 after Foundational. US5 depends on US1 (uses cold pain direction). US6 depends on US1 (shared builder behavior).
- **Polish (Phase 9)**: Depends on all targeted stories.

### User Story Dependencies

- **US1 (P1)**: After Foundational. MVP.
- **US2 (P1)**: After US1 (same mapper data object — sequence to avoid edit conflicts in `expressionMap.ts`).
- **US3 (P2)**: After Foundational (separate function `getObjectionExpressionDirection`); independent of US1/US2.
- **US4 (P2)**: After Foundational (edits `buildExpressionDirectionBlock`); independent of mapping data.
- **US5 (P2)**: After US1 (relies on cold pain direction + before/after path).
- **US6 (P3)**: After US1 (verifies shared-builder behavior).

### Within Each User Story

- Tests before/with implementation; assert they fail before the data exists, pass after.
- Mapper data before injection verification.

### Parallel Opportunities

- T001, T002, T003 (Setup) — all [P], different files.
- T005, T006 (trace mirrors) — [P] with each other (different files); T004 first (canonical interface).
- Test-writing tasks (T010, T013, T016, T019, T022) are [P] across stories (same test file but distinct `describe` blocks — coordinate if edited concurrently).
- US3 (T016–T018) and US4 (T019–T021) can proceed in parallel by different developers after Foundational.
- Polish T027, T028, T029, T031 — [P].

---

## Parallel Example: Setup Phase

```bash
# Launch Setup tasks together (different files):
Task: "T001 Create functions/src/expressionMap.ts skeleton"
Task: "T002 Add ExpressionDirective to functions/src/types.ts"
Task: "T003 Create functions/src/expressionMap.test.ts scaffold"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1.
2. **STOP and VALIDATE**: pain hook → concern, identity intact, trace recorded.
3. This is a shippable improvement on its own.

### Incremental Delivery

1. Foundation ready (Phases 1–2).
2. US1 (pain + overlap angles) → validate → demo (MVP).
3. US2 (full angle coverage) → validate (SC-003).
4. US3 (retargeting) → US4 (blending) → US5 (before/after) → US6 (carousel/batch).
5. Polish: regression suite, build, provider switch, docs, quickstart evidence.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- All edits to `functions/src/generators.ts` (T004, T008, T009, T018, T023, T021-verify) touch the SAME file — sequence them; not [P] with each other.
- `expressionMap.ts` data tasks (T011, T014, T015, T017, T020) touch the SAME file — sequence within the file.
- Additive trace field → no Firestore migration; legacy generations simply omit `expressionAdaptation`.
- Identity protection rules in `TECHNICAL_PROMPT` MUST remain untouched and priority #1 (Contract D1).
- Commit after each task or logical group; record before/after evidence for Constitution IX.
