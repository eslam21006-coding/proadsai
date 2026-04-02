# Feature Specification: QA Fixtures

**Feature Branch**: `003-qa-fixtures`
**Created**: 2026-04-02
**Status**: Draft
**Input**: Phase 3 from LAUNCH_MATRIX.md Section 14 — QA Fixtures (13 tasks: 3.1–3.13)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Priority Lane Canonical Fixtures (Priority: P1)

As a QA reviewer, I have a set of 9 canonical test fixtures — one per priority lane — each containing exact input data and pass/fail assertions. Running these fixtures deterministically validates that each launch lane behaves correctly through the resolver.

**Why this priority**: Without canonical fixtures, QA depends on subjective "it looks fine" judgment — violating Constitution Principle IV (Behavior Contracts Beat Subjective Judgment) and Principle IX (Proof Is Required).

**Independent Test**: Run all 9 lane fixtures. Each fixture calls resolver functions with exact inputs and asserts outputs. All must pass.

**Acceptance Scenarios**:

1. **Given** the Lane 1 fixture (Retargeting + Carousel, 5 slides), **When** executed, **Then** slide 1 and slide 5 have CTA=true, slides 2-4 have CTA=false, and middle slides have retargeting angles P, M, R in order.
2. **Given** the Lane 2 fixture (Cold + Single + before_after), **When** executed, **Then** `validateLaunchSurface` allows the solo mode, and pairing before_after with standard_hero is blocked.
3. **Given** the Lane 3 fixture (Cold + Carousel + value_stack, 4 gifts), **When** executed, **Then** `resolveValueStackSlideCount` returns 6, and empty fields are absent from filtered output.
4. **Given** the Lane 4 fixture (Cold + Carousel, 5 slides), **When** executed, **Then** `carouselSlideCountPlan('cold', 5)` returns angles [hook, A, B, C, close] with correct CTA placement.
5. **Given** the Lane 5 fixture (Cold + Batch + hero + value_stack), **When** executed, **Then** `validateLaunchSurface` allows the combination.
6. **Given** the Lane 6 fixture (Cold + Single + value_stack), **When** executed, **Then** empty value_stack fields are suppressed from the filtered output.
7. **Given** the Lane 7 fixture (Retargeting + Single + value_stack), **When** executed, **Then** `validateLaunchSurface` allows the combination with an objection.
8. **Given** the Lane 8 fixture (Minimal + hero + Single), **When** executed, **Then** `validateLaunchSurface` allows it and `resolveStyleFamily` returns 'minimal'.
9. **Given** the Lane 9 fixture (Minimal + hero + Batch), **When** executed, **Then** same minimal checks pass for batch format.

---

### User Story 2 - Launch Surface Validation Unit Tests (Priority: P2)

As a developer, I have unit tests that verify `validateLaunchSurface()` correctly allows every approved combination and blocks every invalid one — including deleted modes, cross-tab pairs, and solo-only pairing attempts.

**Why this priority**: The launch surface validator is the gate for all generation. False positives let invalid combos through; false negatives block valid users.

**Independent Test**: Run the validateLaunchSurface test suite. Every assertion must pass.

**Acceptance Scenarios**:

1. **Given** one passing combination per lane (9 tests), **When** validated, **Then** all return `allowed: true`.
2. **Given** deleted modes (`limited_access`, `module_preview`, `day_strip`) as input, **When** validated, **Then** each returns `allowed: false`.
3. **Given** a cross-tab pair (e.g., `value_stack` + `event_ticket`), **When** validated, **Then** returns `allowed: false` with a reason mentioning "cross-tab" or "not supported."
4. **Given** `before_after` + carousel format, **When** validated, **Then** returns `allowed: false` with "single-image only."

---

### User Story 3 - Carousel Slide Plan Unit Tests (Priority: P3)

As a developer, I have unit tests that verify `carouselSlideCountPlan()` returns the exact angle sequence for cold and retargeting carousels at various slide counts.

**Why this priority**: The slide plan determines the narrative arc of every carousel. Wrong angles or CTA placement breaks the ad's storytelling structure.

**Independent Test**: Call the function with cold 2/5/9 and retargeting 3/5/7. Verify exact angle arrays.

**Acceptance Scenarios**:

1. **Given** cold carousel with 2 slides, **When** the plan is generated, **Then** both slides have CTA=true (hook + close).
2. **Given** cold carousel with 9 slides, **When** the plan is generated, **Then** middle slides have angles A, B, C, D, E, F, G in order.
3. **Given** retargeting carousel with 7 slides, **When** the plan is generated, **Then** middle slides have angles P, M, R, I, C in order.

---

### User Story 4 - Value Stack and Empty Field Unit Tests (Priority: P4)

As a developer, I have unit tests that verify `resolveValueStackSlideCount()` correctly computes slide counts, and `filterEmptyValueStackFields()` correctly strips empty fields.

**Why this priority**: Value stack auto-adjustment and empty field suppression are core to preventing broken or incomplete ad output.

**Independent Test**: Run both test suites. All assertions pass.

**Acceptance Scenarios**:

1. **Given** 3 gifts, **When** `resolveValueStackSlideCount` runs, **Then** returns 5 slides.
2. **Given** 7 gifts, **When** runs, **Then** returns 9 slides (cap).
3. **Given** 9 gifts, **When** runs, **Then** returns 9 slides (cap, not 11).
4. **Given** mixed populated and empty value_stack fields, **When** `filterEmptyValueStackFields` runs, **Then** only non-empty fields remain in output.
5. **Given** all fields empty/whitespace, **When** runs, **Then** returns empty object.

---

### Edge Cases

- What happens if `carouselSlideCountPlan` is called with slideCount < 2 or > 9? It should throw an error.
- What happens if `resolveValueStackSlideCount` receives an empty array? It should return the minimum slide count (2: hook + close).
- What happens if `filterEmptyValueStackFields` receives fields not in the target list? They should pass through unchanged.
- What happens if a fixture's expected output changes after a resolver update? The fixture fails, signaling the developer to review the contract.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A canonical test fixture MUST exist for each of the 9 priority lanes (Lanes 1–9), containing exact input data and deterministic assertions against resolver function outputs.
- **FR-002**: Each lane fixture MUST call the actual resolver functions (`validateLaunchSurface`, `carouselSlideCountPlan`, `resolveValueStackSlideCount`, `filterEmptyValueStackFields`) with exact inputs — not mock data.
- **FR-003**: `validateLaunchSurface()` MUST have unit tests covering: one passing combination per lane, one blocked combination per deleted mode, one cross-tab pair, and one before_after + carousel attempt.
- **FR-004**: `carouselSlideCountPlan()` MUST have unit tests verifying exact angle arrays for cold 2/5/9 slides and retargeting 3/5/7 slides.
- **FR-005**: `resolveValueStackSlideCount()` MUST have unit tests for 3 gifts (→5), 7 gifts (→9), and 9 gifts (→9 cap).
- **FR-006**: `filterEmptyValueStackFields()` MUST have unit tests for: all fields populated, all fields empty, and mixed populated/empty.
- **FR-007**: All fixtures and tests MUST pass when run via the existing contract test command. No new test infrastructure is required.
- **FR-008**: Lanes 10 and 11 (Testimonial Carousel) MUST remain as stubs that pass with a log message until Phase 4 (Testimonial Carousel) is implemented.

### Key Entities

- **Lane Fixture**: A self-contained test function for one priority lane. Contains exact `AdInputs` JSON, calls resolver functions, and asserts expected outputs.
- **Unit Test**: A focused test for a single resolver function. Tests multiple input/output scenarios without depending on other functions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 9 lane fixtures pass when run via the contract test command.
- **SC-002**: `validateLaunchSurface()` tests cover at least 9 passing + 5 blocking scenarios (14 total assertions minimum).
- **SC-003**: `carouselSlideCountPlan()` tests cover 6 slide count scenarios (3 cold + 3 retargeting) with exact angle array verification.
- **SC-004**: `resolveValueStackSlideCount()` tests cover 3 gift count scenarios with correct slide count outputs.
- **SC-005**: `filterEmptyValueStackFields()` tests cover 3 scenarios (all populated, all empty, mixed).
- **SC-006**: Zero test infrastructure changes — all tests run via the existing `npm run test:contracts` command.
- **SC-007**: Lanes 10 and 11 stubs pass without errors.

## Assumptions

- Phase 1 (Resolver Foundation) is complete. All resolver functions (`validateLaunchSurface`, `carouselSlideCountPlan`, `resolveValueStackSlideCount`, `filterEmptyValueStackFields`) are exported and available.
- The existing contract test infrastructure (`functions/src/contractFixtures.test.ts` run via `npm run test:contracts`) is used. No Jest, Vitest, or other test framework is added.
- Fixtures test the resolver logic (pure functions), not the generation pipeline. They do not call Gemini, fal.ai, or any external service.
- Lane fixtures assert resolver outputs (resolution trace fields, slide plans, validation results), not visual output quality. Visual quality is tested manually per the evidence workflow.
- The existing 5 test functions in `contractFixtures.test.ts` must continue to pass alongside the new fixtures.
