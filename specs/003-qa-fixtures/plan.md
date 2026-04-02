# Implementation Plan: QA Fixtures (Phase 3)

**Branch**: `003-qa-fixtures` | **Date**: 2026-04-02 | **Spec**: [spec.md](./spec.md)
**Input**: LAUNCH_MATRIX.md Section 14, Phase 3 (tasks 3.1–3.13)

## Summary

Add unit tests for the 4 core resolver functions exported by Phase 1. Lane fixtures (3.1–3.9) and stubs (3.10–3.11) already exist from Phase 2. Only 4 tasks remain: dedicated unit tests for `validateLaunchSurface`, `carouselSlideCountPlan`, `resolveValueStackSlideCount`, and `filterEmptyValueStackFields`.

## Codebase Audit

| Task | Description | Status |
|------|-------------|--------|
| 3.1–3.9 | Lane fixtures (9 lanes) | **DONE** — testLane1 through testLane9 exist |
| 3.10 (stubs) | Lane 10-11 testimonial stubs | **DONE** — testLane10, testLane11 exist as stubs |
| 3.10 | `validateLaunchSurface()` unit tests | **NOT DONE** — function not called in test file |
| 3.11 | `carouselSlideCountPlan()` unit tests | **NOT DONE** — function not called in test file |
| 3.12 | `resolveValueStackSlideCount()` unit tests | **NOT DONE** — function not called in test file |
| 3.13 | `filterEmptyValueStackFields()` unit tests | **NOT DONE** — function not called in test file |

## Technical Context

**Language/Version**: TypeScript 5.7 (functions)
**Testing**: Plain Node.js contract fixtures (`functions/src/contractFixtures.test.ts` via `npm run test:contracts`)
**Target file**: `functions/src/contractFixtures.test.ts` (single file, append new tests)
**No new dependencies**: Tests use `assert` from Node.js standard library + direct function imports

## Functions to Test

All exported from `functions/src/creativeResolver.ts`:

1. **`validateLaunchSurface(inputs)`** → `{ allowed: boolean, reason?: string }`
2. **`carouselSlideCountPlan(campaignType, slideCount)`** → `SlideRole[]`
3. **`resolveValueStackSlideCount(gifts)`** → `ValueStackAdjustment`
4. **`filterEmptyValueStackFields(inputs)`** → `{ filtered, skippedFields }`

## Constitution Check

All principles PASS. Phase 3 specifically serves Principle IV (Behavior Contracts) and Principle IX (Proof Required).

## Complexity Tracking

No complexity. Single file, append-only, pure function tests.
