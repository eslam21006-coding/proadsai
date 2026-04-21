# Implementation Plan: QA Fixtures (Phase 3)

**Branch**: `003-qa-fixtures` | **Date**: 2026-04-08 | **Spec**: [spec.md](./spec.md)
**Input**: LAUNCH_MATRIX.md Section 14, Phase 3 (tasks 3.1–3.13)

## Summary

Phase 3 adds deterministic QA fixtures for all 9 priority lanes plus dedicated unit tests for the 4 core resolver functions. All tests run in the existing contract test infrastructure (`contractFixtures.test.ts` via `npm run test:contracts`). No new frameworks or dependencies.

## Codebase Audit

| Task | Description | Status |
|------|-------------|--------|
| 3.1 | Lane 1 — Retargeting + Carousel, 5 slides | **DONE** — `testLane1RetargetingCarousel` |
| 3.2 | Lane 2 — Cold + Single + before_after | **DONE** — `testLane2ColdSingleBeforeAfter` |
| 3.3 | Lane 3 — Cold + Carousel + value_stack, 4 gifts | **DONE** — `testLane3ColdCarouselValueStack` |
| 3.4 | Lane 4 — Cold + Carousel + standard_hero, 5 slides | **DONE** — `testLane4ColdCarouselApprovedMode` |
| 3.5 | Lane 5 — Cold + Batch + hero + value_stack | **DONE** — `testLane5ColdBatchHeroValueStack` |
| 3.6 | Lane 6 — Empty value_stack fields | **DONE** — `testLane6ColdSingleValueStack` |
| 3.7 | Lane 7 — Retargeting + Single + value_stack | **DONE** — `testLane7RetargetingSingleValueStack` |
| 3.8 | Lane 8 — Minimal + hero + Single | **DONE** — `testLane8MinimalHeroSingle` |
| 3.9 | Blocked combinations (5 cases) | **DONE** — covers `limited_access`, `module_preview`, `day_strip`, `text_only+value_stack`, `before_after+standard_hero` |
| 3.10 | `carouselSlideCountPlan()` unit tests | **DONE** — covers cold 2/5/9 + retargeting 3/5/7 |
| 3.11 | `resolveValueStackSlideCount()` edge cases | **DONE** — covers 1→3, 7→9, 10→9 cap |
| 3.12 | `filterEmptyValueStackFields()` edge cases | **DONE** — covers all-populated, all-empty, mixed |
| 3.13 | Cross-tab block test | **DONE** — `value_stack+event_ticket` returns reason containing "cross-tab" |
| — | Lane 9 — Minimal + hero + Batch | **DONE** — `testLane9MinimalHeroBatch` |
| — | Lane 10–11 — Testimonial stubs | **DONE** — `testLane10TestimonialCarouselCold`, `testLane11TestimonialCarouselRetargeting` |

## Technical Context

**Language/Version**: TypeScript 5.7 (functions)
**Testing**: Plain Node.js contract fixtures (`functions/src/contractFixtures.test.ts` via `npm run test:contracts`)
**Target file**: `functions/src/contractFixtures.test.ts` (single file, append new tests)
**No new dependencies**: Tests use `assert` from Node.js standard library + direct function imports

## Functions Under Test

All exported from `functions/src/creativeResolver.ts`:

1. **`validateLaunchSurface(inputs)`** → `LaunchSurfaceResult { allowed: boolean, reason?: string }`
2. **`carouselSlideCountPlan(campaignType, slideCount)`** → `SlideRole[]`
3. **`resolveValueStackSlideCount(gifts)`** → `ValueStackAdjustment`
4. **`filterEmptyValueStackFields(inputs)`** → `{ filtered: Record<string, unknown>, skippedFields: string[] }`

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Reliability Over Feature Count | PASS | Tests validate existing surface only, no scope expansion |
| II. Selected Mode Must Be Obeyed | PASS | Fixtures assert exact mode → output mapping |
| III. Launch Surface Is Frozen | PASS | Tests encode the frozen surface combinations |
| IV. Behavior Contracts Beat Judgment | **CORE** | This phase IS the behavior contract implementation |
| V. Arabic Quality First-Class | N/A | No language testing in this phase |
| VI. Hidden Layers Must Be Auditable | PASS | Fixtures verify resolution trace fields |
| VII. No Silent Override | PASS | Tests assert explicit allowed/blocked with reasons |
| VIII. Cost Discipline | PASS | Pure function tests — zero generation cost |
| IX. Proof Is Required | **CORE** | Fixtures ARE the proof mechanism |
| X. Spec Before Code | PASS | Spec written and reviewed before implementation |
| XI. Frontend/Backend Must Agree | N/A | Backend-only tests |
| XII. Deferred Scope Must Stay Deferred | PASS | Lanes 10–11 are stubs until Testimonial Carousel |

## Remaining Work

The test functions exist but need verification against the updated spec (2026-04-08 review aligned gift counts and blocked combos with LAUNCH_MATRIX). Specifically verify:

1. **`testValidateLaunchSurface`** includes all 5 blocked combos from task 3.9 + cross-tab test from 3.13
2. **`testResolveValueStackSlideCount`** uses gift counts 1→3, 7→9, 10→9 (not old values 3→5, 9→9)
3. **`testCarouselSlideCountPlan`** covers cold 2/5/9 + retargeting 3/5/7

## Complexity Tracking

No complexity. Single file, append-only, pure function tests.

## Project Structure

### Documentation (this feature)

```text
specs/003-qa-fixtures/
├── spec.md              # Feature specification (updated 2026-04-08)
├── plan.md              # This file
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Task breakdown (next: /speckit.tasks)
```

### Source Code (repository root)

```text
functions/src/
├── creativeResolver.ts        # Resolver functions under test
└── contractFixtures.test.ts   # All QA fixtures and unit tests (target file)
```

**Structure Decision**: All tests go into the single existing `contractFixtures.test.ts` file. No new files or directories needed.
