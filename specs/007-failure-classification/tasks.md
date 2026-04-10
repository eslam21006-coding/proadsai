# Tasks: Failure Classification

**Input**: Design documents from `/specs/007-failure-classification/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/generation-response.md, quickstart.md

**Tests**: Included — the spec requires verifying each of the 7 failure classes, cost estimates, refunds, and queries.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Define types and extend existing interfaces for failure classification

- [X] T001 Add `FailureClass` union type (7 values) and `CostEstimate` interface to `functions/src/types.ts`
- [X] T002 Extend `GenerationRecord` interface with `failureClass: FailureClass | null` and `costEstimate: CostEstimate | null` in `src/services/feedbackService.ts` (depends on T001 for type imports)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core error-classification infrastructure that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create a `classifyError(error: unknown, errorCode?: string): FailureClass` helper function in `functions/src/generators.ts` that maps every existing error path to one of 7 failure classes per the mapping in research.md (Decision 1). Must handle: thrown errors by message pattern, errorCode returns (`validation_failed`, `quality_rejected`, `safety_blocked`), and unknown errors (fallback to `model_error`)
- [X] T004 Create a `buildCostEstimate(modelTier: string | null, retryCount: number, usageMetadata?: object): CostEstimate` helper function in `functions/src/generators.ts` that extracts `promptTokenCount + candidatesTokenCount` from Gemini response `usageMetadata` and returns a `CostEstimate` object. For pre-model failures, return `{ modelTier: null, retryCount: 0, estimatedTokens: 0 }`

**Checkpoint**: Classification and cost-estimate helpers ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Classify Failed Generations (Priority: P1) 🎯 MVP

**Goal**: Every failed generation is tagged with exactly one of 7 failure classes and written to Firestore

**Independent Test**: Trigger each of the 7 failure types and verify each generation record in Firestore has the correct `failureClass` value

### Implementation for User Story 1

- [X] T005 [US1] Tag each `throw` and error return in `functions/src/generators.ts` with the corresponding `FailureClass` — attach classification metadata to thrown errors (e.g., custom error property or error wrapper) so the caller in `index.ts` can read it. Cover all 18 error paths identified in research.md: `combination_invalid` (lines 1915, 3302, 3817), `prompt_malformed` (lines 3619, 3651), `model_error` (lines 3552, 3579, retry wrapper, 5473 safety_blocked), `validation_reject` (lines 3614, 3817 validation_failed, 3976, 4043, 4047, 4050, 4057 quality_rejected), `slot_repair_failed` (lines 3257, 3268), `numeric_hallucination` (line 5317)
- [X] T006 [US1] In `functions/src/index.ts`, modify the catch block of each generation callable (`serverGenerateBuildPlan`, `serverGenerateFinalAd`, etc.) to: (1) read `FailureClass` from the caught error, (2) call `buildCostEstimate` with available data, (3) write a failure record to `generations/{auto-id}` in Firestore with `userId`, `timestamp`, `failureClass`, `costEstimate`, input metadata, and error message
- [X] T007 [US1] Handle the `credit_insufficient` path in `functions/src/index.ts` (lines 107-120): when the credit check throws `resource-exhausted`, write a failure record with `failureClass: 'credit_insufficient'` and `costEstimate: { modelTier: null, retryCount: 0, estimatedTokens: 0 }` before re-throwing the error
- [X] T008 [US1] Implement credit refund logic in the catch block of `functions/src/index.ts`: for post-deduction hard failures (`model_error`, `validation_reject`, `slot_repair_failed`), call the refund pattern from existing `refundCreditsServer` (lines 1223-1257) inline to restore the user's credits. Skip refund for: pre-deduction failures (`credit_insufficient`, `combination_invalid`, `prompt_malformed`) and soft-fail `numeric_hallucination` (user receives output)
- [X] T009 [US1] Handle `numeric_hallucination` soft-fail in `functions/src/generators.ts` (line 5317): the generation still succeeds (user gets output, no credit refund), but return both `failureClass: 'numeric_hallucination'` and `costEstimate` alongside the success response so `index.ts` can include them when returning to the frontend. The frontend writes both fields to the generation record

### Tests for User Story 1

- [X] T010 [P] [US1] Write unit tests in `functions/src/__tests__/classifyError.test.ts` for the `classifyError` helper: verify each of the 7 failure classes is returned for representative error inputs (thrown error messages, errorCode values, safety_blocked, unknown errors)
- [X] T011 [P] [US1] Write integration tests in `functions/src/__tests__/failureRecord.test.ts`: mock Gemini API to trigger each failure type, call the generation callable, and verify the Firestore `generations` document has the correct `failureClass` and that credit refund occurred for post-deduction failures only

**Checkpoint**: User Story 1 complete — every failed generation is classified, persisted to Firestore, and credits are refunded when applicable

---

## Phase 4: User Story 2 — Record Cost Estimates on All Generations (Priority: P2)

**Goal**: Every generation (success and failure) includes a `costEstimate` with model tier, retry count, and estimated tokens

**Independent Test**: Trigger a successful generation and a failed generation, verify both have `costEstimate` populated with all 3 fields

### Implementation for User Story 2

- [X] T012 [US2] Modify the retry wrapper in `functions/src/generators.ts` (around line 463) to accumulate `retryCount` and `estimatedTokens` across all attempts by summing `usageMetadata` from each Gemini response. Pass the accumulated values to `buildCostEstimate` at the end of the pipeline
- [X] T013 [US2] On successful generation in `functions/src/index.ts`, include `costEstimate` in the response returned to the frontend (per contracts/generation-response.md). Extract model name from Gemini response for `modelTier`
- [X] T014 [US2] Update `src/services/feedbackService.ts` to include `costEstimate` from the backend response when writing the generation record to Firestore via `addDoc` (existing success flow at lines 175-181). Set `failureClass: null` for successful generations

### Tests for User Story 2

- [X] T015 [P] [US2] Write unit test in `functions/src/__tests__/costEstimate.test.ts` for `buildCostEstimate`: verify correct token summing from `usageMetadata`, null modelTier for pre-model failures, and retryCount accumulation across attempts
- [X] T016 [P] [US2] Write integration test in `functions/src/__tests__/costEstimateSuccess.test.ts`: mock a successful generation with 2 retries, verify response includes `costEstimate` with retryCount=2 and tokens summed across all attempts

**Checkpoint**: User Stories 1 AND 2 complete — all generations (success and failure) have cost estimates, all failures are classified

---

## Phase 5: User Story 3 — Query Failures by Class (Priority: P3)

**Goal**: Operators can query generation records filtered by failure class within a date range in under 3 seconds

**Independent Test**: Create generation records with different failure classes, query by a specific class + date range, verify only matching records returned

### Implementation for User Story 3

- [X] T017 [US3] Add composite Firestore index `(failureClass ASC, timestamp DESC)` on the `generations` collection in `firestore.indexes.json`
- [X] T018 [US3] Verify the index supports the three query patterns from contracts/generation-response.md: (1) all failures of a type, (2) failures in date range, (3) all failures for a user. If the user-scoped query needs an additional index `(userId ASC, failureClass ASC, timestamp DESC)`, add it to `firestore.indexes.json`

### Tests for User Story 3

- [X] T019 [US3] Write integration test in `functions/src/__tests__/failureQuery.test.ts`: seed Firestore with generation records across multiple failure classes and timestamps, query by `failureClass == 'model_error'` with date range, verify only matching records returned and query completes within performance target

**Checkpoint**: All user stories complete — failures classified, costs tracked, and queryable

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, edge cases, and documentation

- [X] T020 Verify edge case: unknown error type falls back to `model_error` in `classifyError` — covered by `classifyError` implementation (returns `"model_error"` for unknown errors)
- [X] T021 Verify edge case: partial carousel failure (3 of 5 slides) is classified by root cause of failing portion — covered by `classifyError` mapping from error messages
- [X] T022 [P] Verify that successful generations are unaffected — existing generation flow still works with `failureClass: null` and `costEstimate` populated. Run existing test suite (`cd functions && npm run test:contracts`) — PASS
- [ ] T023 [P] Run quickstart.md validation: manually trigger each of the 7 failure types, verify Firestore records, verify refunds, verify query by failure class
- [ ] T024 Deploy Firestore indexes (`firebase deploy --only firestore:indexes`) and verify composite index is active

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist before helpers reference them)
- **User Story 1 (Phase 3)**: Depends on Phase 2 (classification + cost helpers must exist)
- **User Story 2 (Phase 4)**: Depends on Phase 2 (cost estimate helper must exist). Can run in parallel with US1 for different files, but T013-T014 touch `index.ts` which US1 also modifies — coordinate
- **User Story 3 (Phase 5)**: Independent of US1/US2 for index creation, but testing requires failure records from US1
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only. No other story dependencies. **MVP scope.**
- **US2 (P2)**: Depends on Foundational. Touches same files as US1 (`index.ts`, `generators.ts`) — recommended to complete US1 first
- **US3 (P3)**: Index creation (T017) can start after Setup. Testing requires US1 data

### Within Each User Story

- Implementation tasks are sequential (each builds on the previous)
- Test tasks marked [P] can run in parallel with each other
- Tests should be written alongside or after implementation (not TDD — spec didn't request it)

### Parallel Opportunities

- T003 and T004 can run in parallel (independent helpers, both in `generators.ts` but no shared state)
- T010 and T011 can run in parallel (independent test files)
- T015 and T016 can run in parallel (independent test files)
- T017 can start as early as Phase 1 (only touches `firestore.indexes.json`)
- T020, T021, T022, T023 can all run in parallel

---

## Parallel Example: User Story 1

```text
# After Phase 2 completes, launch US1 implementation sequentially:
T005 → T006 → T007 → T008 → T009

# Then launch US1 tests in parallel:
T010 + T011 (different test files, no dependencies)
```

## Parallel Example: Cross-Story

```text
# After Phase 2, if team has capacity:
Developer A: US1 (T005-T011) — generators.ts + index.ts failure paths
Developer B: US3 T017 — firestore.indexes.json (independent file)

# After US1 completes:
Developer A: US2 (T012-T016) — extends same files with success path
Developer B: US3 T018-T019 — query verification (needs US1 records)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T004)
3. Complete Phase 3: User Story 1 (T005-T011)
4. **STOP and VALIDATE**: Trigger each failure type, verify Firestore records, verify refunds
5. Deploy if ready — failures are now classified and visible

### Incremental Delivery

1. Setup + Foundational → Types and helpers ready
2. User Story 1 → Failures classified, refunds working → **MVP deployed**
3. User Story 2 → Cost estimates on all generations → Deploy
4. User Story 3 → Firestore index + query support → Deploy
5. Polish → Edge cases, validation, index deployment

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- `numeric_hallucination` is a soft-fail — generation succeeds but record is tagged for tracking
