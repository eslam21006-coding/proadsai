# Implementation Plan: Resolver Completeness, Resolution Trace & Slide Plans

**Branch**: `001-resolver-completeness-trace` | **Date**: 2026-04-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-resolver-completeness-trace/spec.md`

## Summary

Extend the existing creative resolver (`functions/src/creativeResolver.ts`) to enforce the approved launch surface, build deterministic carousel slide plans, auto-adjust value_stack slide counts, suppress empty fields, and produce a structured resolution trace on every generation run. Remove 3 deleted modes, reclassify `before_after` from hook angle to creative mode, add minimal style family support, enforce the visual precedence chain, and consolidate offer types from 5 to 3. The resolver remains pure synchronous in-memory computation (< 50ms p95); the trace is persisted fire-and-forget on the generation document.

## Technical Context

**Language/Version**: TypeScript 5.7.3 (functions/backend)
**Primary Dependencies**: Firebase Cloud Functions v2 (`firebase-functions` 7.2.2), `firebase-admin` 13.6.1, Node.js 24
**Storage**: Cloud Firestore (`generations/{genId}` document — trace persisted as field)
**Testing**: Node.js native `assert` module via `npm run test:contracts`; contract fixtures in `functions/src/contractFixtures.test.ts`
**Target Platform**: Firebase Cloud Functions, Europe-West1, 2GB memory, 300s timeout
**Project Type**: Web service (Firebase Cloud Functions backend for SaaS)
**Performance Goals**: Resolver execution < 50ms p95; pure in-memory, no async I/O
**Constraints**: Resolver must not break language propagation (Arabic quality — Spec E scope). Frontend changes are Spec C scope — this spec is backend/resolver only.
**Scale/Scope**: ~1,133 lines in existing resolver; ~25,700 lines total backend. 18 functional requirements, 11 priority lanes, 9 user stories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Reliability Over Feature Count | PASS | Removes 3 modes, consolidates offer types from 5→3, blocks invalid combos |
| II. Selected Mode Must Be Obeyed | PASS | Resolver enforces user selections; overrides are explicit, traced, and signaled |
| III. Launch Surface Frozen & Authoritative | PASS | Launch Surface Registry is single source of truth for all validation |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | 11 priority lanes with explicit pass/fail rules; SC-001 requires 100% coverage |
| V. Arabic Quality First-Class | PASS | Spec explicitly states resolver must not alter language propagation; Arabic validated in Spec E |
| VI. Hidden Layers Must Be Auditable | PASS | Resolution trace documents every resolver decision (FR-011, FR-012) |
| VII. No Silent Override Without Rule, Signal, Trace | PASS | Every override logged in trace; user notified for slide count changes (FR-009) |
| VIII. Cost Discipline | PASS | Server-side guard blocks invalid combos before credit deduction (Assumption 8) |
| IX. Proof Required for Every Fix | PASS | Contract fixtures validate resolver behavior with before/after evidence |
| X. Spec Before Code | PASS | This plan follows ratified spec with 5 clarifications resolved |
| XI. Frontend & Backend Must Agree | PASS | Server independently validates same combinations (US-1 AS-5); frontend is Spec C |
| XII. Deferred Scope Stays Deferred | PASS | Only approved launch combinations are implemented; deferred modes are removed |

**Result**: All 12 principles PASS. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-resolver-completeness-trace/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── validate-launch-surface.md
│   ├── resolution-trace.md
│   ├── carousel-slide-count-plan.md
│   └── value-stack-functions.md
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
functions/
├── src/
│   ├── types.ts                   # MODIFY — shared type definitions
│   ��── creativeResolver.ts        # MODIFY — extend resolver (SSoT)
│   ├── index.ts                   # MODIFY — add launch surface guard at entry
│   ├── generators.ts              # MODIFY — consume trace, slide plans
│   ├── layoutContract.ts          # MODIFY — consume resolved inputs
│   ├── captionValidator.ts        # MODIFY — remove deleted mode keywords
│   ├── selectorLimits.ts          # MODIFY — remove deleted mode gates
│   ├── patternSummaries.ts        # MODIFY — remove deleted mode references
│   ├── modeFieldSchema.ts         # MODIFY — remove deleted mode schemas
│   ├── entitlements.ts            # MODIFY — update plan gates for consolidated offer types
│   ├── knowledge/
│   │   ├── offerCreativeModes.ts  # MODIFY — remove deleted modes, add before_after
│   │   └── hookAnglesKnowledge.ts # MODIFY — remove before_after from hook angles
│   ├── slidePlanEngine.ts         # NEW — deterministic carousel slide plans
│   ├── resolutionTrace.ts         # NEW — trace builder + types
│   ├── launchSurface.ts           # NEW — launch surface registry + validation
│   ├── emptyFieldFilter.ts        # NEW — value_stack field suppression
│   └── contractFixtures.test.ts   # MODIFY — add resolver, trace, slide plan tests
```

**Structure Decision**: Web application with `functions/` backend. All changes in `functions/src/`. No new top-level directories. 4 new files, 12 modified files.

## Complexity Tracking

> No violations to justify — all 12 constitution principles pass.
