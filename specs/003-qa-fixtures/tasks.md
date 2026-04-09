# Tasks: QA Fixtures (Phase 3)

**Input**: Design documents from `/specs/003-qa-fixtures/`
**Prerequisites**: plan.md (required), spec.md (required)

**Tests**: This feature IS tests — all tasks are test implementation tasks.

**Organization**: Tasks grouped by user story to enable independent implementation and verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Target file**: `functions/src/contractFixtures.test.ts` (all tasks append to this single file)
- **Source under test**: `functions/src/creativeResolver.ts`

---

## Phase 1: Setup

**Purpose**: No setup needed — infrastructure already exists

All test infrastructure is in place. The file `functions/src/contractFixtures.test.ts` exists with 24 test functions. All 4 resolver functions are exported from `functions/src/creativeResolver.ts`. The test command `npm run test:contracts` works.

**No tasks in this phase.**

---

## Phase 2: Foundational

**Purpose**: No foundational work needed — all lane fixtures and stubs are complete

Lane fixtures testLane1–testLane9 and stubs testLane10–testLane11 already exist and pass. The 4 dedicated unit test functions (`testValidateLaunchSurface`, `testCarouselSlideCountPlan`, `testResolveValueStackSlideCount`, `testFilterEmptyValueStackFields`) already exist with partial coverage.

**No tasks in this phase.**

---

## Phase 3: User Story 1 — Priority Lane Canonical Fixtures (Priority: P1) — MVP

**Goal**: All 9 lane fixtures pass with exact input/output assertions per LAUNCH_MATRIX tasks 3.1–3.8.

**Independent Test**: `cd functions && npm run test:contracts` — all testLane1 through testLane9 pass.

**Status**: COMPLETE — all 9 lane fixtures exist and pass. No tasks needed.

---

## Phase 4: User Story 2 — Launch Surface Validation Unit Tests (Priority: P2)

**Goal**: `testValidateLaunchSurface` covers all 9 passing + all blocked combos per LAUNCH_MATRIX tasks 3.9 and 3.13.

**Independent Test**: `cd functions && npm run test:contracts` — testValidateLaunchSurface passes with all assertions.

### Current State Audit

Passing combos: 9+ tested (standard_hero, value_stack, retargeting variants, before_after if in catalog). Done.
Blocked combos present: limited_access, module_preview, day_strip, value_stack+event_ticket (cross-tab), before_after+carousel. Done.
**Missing blocked combos**: `text_only+value_stack` (matrix 3.9b), `before_after+standard_hero` (matrix 3.9a).
**Missing assertion**: cross-tab reason string must contain "cross-tab" (matrix 3.13).

### Implementation

- [X] T001 [US2] Add blocked combo assertion for `before_after+standard_hero` (`selectedModes: ['before_after','standard_hero']` → `allowed: false`) in `functions/src/contractFixtures.test.ts` testValidateLaunchSurface
- [X] T002 [US2] Add blocked combo assertion for `text_only+value_stack` (`selectedModes: ['text_only','value_stack']` → `allowed: false`) in `functions/src/contractFixtures.test.ts` testValidateLaunchSurface
- [X] T003 [US2] Add reason string assertion for cross-tab pair: verify `crossTab.reason` includes the substring "cross-tab" in `functions/src/contractFixtures.test.ts` testValidateLaunchSurface
- [X] T004 [US2] Run `cd functions && npm run test:contracts` and verify testValidateLaunchSurface passes with all new assertions

**Checkpoint**: testValidateLaunchSurface covers 9 passing + 7 blocked scenarios (3 deleted modes + 1 same-tab multi-mode [text_only+value_stack] + 1 before_after+standard_hero + 1 cross-tab + 1 before_after+carousel) = 16 total assertions minimum.

---

## Phase 5: User Story 3 — Carousel Slide Plan Unit Tests (Priority: P3)

**Goal**: `testCarouselSlideCountPlan` covers cold 2/5/9 + retargeting 3/5/7 with exact angle arrays per LAUNCH_MATRIX task 3.10.

**Independent Test**: `cd functions && npm run test:contracts` — testCarouselSlideCountPlan passes.

### Current State Audit

All 6 combos tested: cold-2, cold-5, cold-9, retargeting-3, retargeting-5, retargeting-7. Done.
Exact angle arrays asserted for each. Done.
CTA placement verified (hook+close have CTA=true, middle has CTA=false). Done.

**Status**: COMPLETE — no tasks needed.

---

## Phase 6: User Story 4 — Value Stack and Empty Field Unit Tests (Priority: P4)

**Goal**: `testResolveValueStackSlideCount` covers gift counts per updated spec (1→3, 7→9, 10→9 cap) and `testFilterEmptyValueStackFields` covers all 3 scenarios.

**Independent Test**: `cd functions && npm run test:contracts` — both test functions pass.

### Current State Audit

**testResolveValueStackSlideCount**:
- 3 gifts→5 slides (existing, not in matrix but valid)
- 7 gifts→9 slides. Done.
- 9 gifts→9 capped. Done.
- 0 gifts→2 slides (edge case). Done.
- 2 gifts (with whitespace filtering)→4 slides (edge case). Done.
- **Missing**: 1 gift→3 slides (matrix 3.11)
- **Missing**: 10 gifts→9 slides capped (matrix 3.11)

**testFilterEmptyValueStackFields**:
- All populated. Done.
- All empty. Done.
- Mixed. Done.

**Status**: testFilterEmptyValueStackFields is COMPLETE. testResolveValueStackSlideCount needs 2 additions.

### Implementation

- [X] T005 [US4] Add assertion for 1 gift → 3 slides in `functions/src/contractFixtures.test.ts` testResolveValueStackSlideCount: call `resolveValueStackSlideCount(['a'])` and assert `resolvedSlideCount === 3` and `giftCount === 1`
- [X] T006 [US4] Add assertion for 10 gifts → 9 slides (capped) in `functions/src/contractFixtures.test.ts` testResolveValueStackSlideCount: call `resolveValueStackSlideCount(['a','b','c','d','e','f','g','h','i','j'])` and assert `resolvedSlideCount === 9`, `giftCount === 10`, `capped === true`
- [X] T007 [US4] Run `cd functions && npm run test:contracts` and verify testResolveValueStackSlideCount passes with all assertions

**Checkpoint**: All user stories should now be fully covered and independently verifiable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T008 Run full test suite `cd functions && npm run test:contracts` and verify all 24+ test functions pass (including the 5 original pre-existing tests)
- [X] T009 Verify SC-002 assertion count: count all assertions in testValidateLaunchSurface and confirm >= 16

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1–3**: COMPLETE — no work needed
- **Phase 4 (US2)**: Can start immediately — no dependencies
- **Phase 5 (US3)**: COMPLETE — no work needed
- **Phase 6 (US4)**: Can start immediately — no dependencies on Phase 4
- **Phase 7 (Polish)**: Depends on Phases 4 and 6 completion

### User Story Dependencies

- **US1 (P1)**: COMPLETE
- **US2 (P2)**: Independent — only modifies testValidateLaunchSurface
- **US3 (P3)**: COMPLETE
- **US4 (P4)**: Independent — only modifies testResolveValueStackSlideCount

### Parallel Opportunities

- T001, T002, T003 can run in sequence (same function, same file — cannot parallelize)
- T005, T006 can run in sequence (same function, same file — cannot parallelize)
- Phase 4 (T001–T004) and Phase 6 (T005–T007) CAN run in parallel (different test functions)

---

## Parallel Example

```bash
# Phase 4 and Phase 6 can run in parallel (different test functions):
Agent A: T001 → T002 → T003 → T004 (testValidateLaunchSurface additions)
Agent B: T005 → T006 → T007 (testResolveValueStackSlideCount additions)
# Then: T008 → T009 (final verification)
```

---

## Implementation Strategy

### MVP First (User Story 2 Only)

1. Complete T001–T004 (blocked combo assertions)
2. **STOP and VALIDATE**: Run test suite
3. All critical blocking logic is now verified

### Incremental Delivery

1. Phase 4: Add blocked combo + cross-tab reason assertions → Verify
2. Phase 6: Add gift count edge cases → Verify
3. Phase 7: Full suite validation → Done

---

## Notes

- All tasks modify a single file: `functions/src/contractFixtures.test.ts`
- No new imports needed — all functions already imported
- Total new assertions: ~7 (3 blocked combos + 1 reason string + 2 gift counts + 1 verification)
- Existing tests must continue to pass alongside new additions
- 3 warnings expected: `limited_access`, `module_preview`, `day_strip` still in backend catalog on this branch (Phase 1 cleanup pending on branch 001)
- `carouselSlideCountPlan` assigns pool[0] to hook slide, pool[1..] to middle slides
- `resolveValueStackSlideCount` returns 0 for 0 gifts (no carousel possible)
- `filterEmptyValueStackFields` checks all 9 VALUE_STACK_FIELDS — undefined fields count as skipped
