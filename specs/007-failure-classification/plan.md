# Implementation Plan: Failure Classification

**Branch**: `007-failure-classification` | **Date**: 2026-04-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-failure-classification/spec.md`

## Summary

Classify every failed generation into one of seven failure categories (`prompt_malformed`, `model_error`, `validation_reject`, `slot_repair_failed`, `numeric_hallucination`, `combination_invalid`, `credit_insufficient`), record cost estimates (model tier, retry count, estimated tokens) on all generations, and auto-refund credits on post-deduction failures. This is a backend-focused change touching `functions/src/types.ts`, `generators.ts`, `index.ts`, the frontend `GenerationRecord` type, and Firestore indexes.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)  
**Primary Dependencies**: Firebase Cloud Functions v2, Firestore, Gemini API (3.1 pro/flash/lite variants)  
**Storage**: Firestore (`generations` collection, `users/{uid}` docs)  
**Testing**: Jest (functions — `cd functions && npm test`)  
**Target Platform**: Firebase Cloud Functions (Node.js), React 19 frontend  
**Project Type**: Web service (SaaS)  
**Performance Goals**: Failure queries return in <3 seconds (SC-003)  
**Constraints**: No backfill of historical records; forward-only classification  
**Scale/Scope**: ~5 files modified, 7 failure classes, 1 new Firestore composite index

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Reliability Over Feature Count | PASS | Adds observability, does not increase feature surface |
| II. Selected Mode Obeyed | N/A | Does not affect mode selection |
| III. Launch Surface Frozen | PASS | No new launch combinations; data-layer only |
| IV. Behavior Contracts | PASS | Each failure class has explicit pass/fail mapping |
| V. Arabic Quality First-Class | N/A | Does not affect language output |
| VI. Hidden Layers Auditable | PASS | Directly improves auditability of failure reasons |
| VII. No Silent Override | PASS | Every failure is explicitly classified and traced |
| VIII. Cost Discipline | PASS | Enables cost-per-failure analysis; auto-refunds reduce wasted credits |
| IX. Proof Required | PASS | Failure records provide evidence for debugging |
| X. Spec Before Code | PASS | Spec written and clarified before this plan |
| XI. Frontend/Backend Agree | PASS | Backend writes failure records; frontend reads same `GenerationRecord` type |
| XII. Deferred Scope Deferred | PASS | No dashboard or new features — data layer only |

**Gate result**: ALL PASS — proceed to implementation.

## Project Structure

### Documentation (this feature)

```text
specs/007-failure-classification/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research output
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/           # Phase 1 contracts
│   └── generation-response.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
functions/src/
├── types.ts             # ADD: FailureClass type, CostEstimate interface
├── generators.ts        # MODIFY: Tag error paths with FailureClass, capture token counts
└── index.ts             # MODIFY: Classify errors, write failure records, auto-refund, return costEstimate

src/
└── services/
    └── feedbackService.ts  # MODIFY: Add failureClass + costEstimate to GenerationRecord

firestore.indexes.json      # MODIFY: Add composite index (failureClass, timestamp)
```

**Structure Decision**: Existing structure preserved. No new directories or files beyond type additions to `types.ts`.

## Complexity Tracking

> No constitution violations to justify. All gates pass.
