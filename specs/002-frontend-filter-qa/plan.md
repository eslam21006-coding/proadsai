# Implementation Plan: Frontend Enforcement (Phase 2)

**Branch**: `002-frontend-filter-qa` | **Date**: 2026-04-02 | **Spec**: [spec.md](./spec.md)
**Input**: LAUNCH_MATRIX.md Section 14, Phase 2 (tasks 2.1–2.12)

## Summary

Phase 2 enforces the launch surface on the frontend. After auditing the codebase, **11 of 12 tasks are already complete** from a prior implementation session. Only 1 task remains: removing `before_after` from the `ColdHookAngle` type union in `src/types.ts`.

## Codebase Audit Results

| Task | Description | Status | Evidence |
|------|-------------|--------|----------|
| 2.1 | Remove deleted modes from InputForm.tsx | **DONE** | 0 grep matches |
| 2.2 | Remove deleted modes from constants.ts | **DONE** | 0 grep matches |
| 2.3 | Move before_after to Creative Mode grid | **DONE** | `id: 'before_after'` in creativeResolver.ts |
| 2.4 | Remove before_after from COLD_HOOK_ANGLES | **DONE** | 0 grep matches in constants.ts |
| 2.5 | Slice AD_LANGUAGES to 7 | **DONE** | fr/es/de/tr/pt absent |
| 2.6 | Consume validateLaunchSurface in InputForm | **DONE** | Imported + called in useMemo |
| 2.7 | Universe dropdown visible for Minimal | **DONE** | Universe logic present |
| 2.8 | Art Direction label | **DONE** | "Art Direction" label in UI |
| 2.9 | Reference ad Pro plan gate | **DONE** | referenceAdUpload gate present |
| 2.10 | value_stack slideCount auto-override | **DONE** | resolveValueStackSlideCount wired |
| 2.11 | Testimonial slideCount stub | **DONE** | Spec G stub comment present |
| 2.12 | Override signals | **DONE** | override signal references present |

## Remaining Work

`src/types.ts` line 87: `| "before_after"` still in `ColdHookAngle` type union. Remove it.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend)
**Build**: Clean compile passes with current state.

## Constitution Check

All 12 principles PASS.
