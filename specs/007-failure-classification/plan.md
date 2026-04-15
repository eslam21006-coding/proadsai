# Implementation Plan: Failure Classification

**Branch**: `007-failure-classification` | **Date**: 2026-04-04 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-failure-classification/spec.md`

## Summary

Classify every failed generation into one of seven failure categories and record cost estimates (model tier, retries, tokens) on all generations. Auto-refund credits on post-deduction failures. Enable Firestore queries by failure class for cost-per-failure-type analysis.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Gemini 3.1 API, Firestore
**Storage**: Firestore (`generations/{genId}` collection)
**Testing**: Mocha + Chai (functions), Vitest (frontend)
**Target Platform**: Firebase Cloud Functions (Node.js 22), React 19 frontend
**Project Type**: Web service (Firebase backend + React frontend)
**Performance Goals**: Failure queries return in <3 seconds (SC-003)
**Constraints**: 7 failure classes exactly (Spec F), forward-only (no backfill)
**Scale/Scope**: Existing `generations` collection — 2 new fields per document, 1 composite index

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Reliability Over Feature Count | PASS | Backend-only observability layer, no new user-facing features |
| II. Selected Mode Must Be Obeyed | N/A | No mode selection changes |
| III. Launch Surface Is Frozen | PASS | No new combinations; adds tracing to existing surface |
| IV. Behavior Contracts Beat Judgment | PASS | Explicit 7-class mapping with pass/fail rules per error path |
| V. Arabic Quality First-Class | N/A | Language-agnostic feature |
| VI. Hidden Layers Must Be Auditable | PASS | This feature *adds* the audit trace for generation failures |
| VII. No Silent Override | PASS | Credit refund is explicit and recorded; failure class always set |
| VIII. Cost Discipline | PASS | Core purpose — tracks cost of failures to reduce waste |
| IX. Proof Required for Fixes | PASS | Failure records + cost estimates provide the proof data |
| X. Spec Before Code | PASS | Full spec with 6 clarifications completed |
| XI. Frontend/Backend Must Agree | PASS | Backend writes failure records; frontend extends success response only |
| XII. Deferred Scope Stays Deferred | PASS | No dashboard (deferred), data layer only |

**Post-Design Re-Check**: All principles still pass. Research decisions (error mapping, backend-first writes, Gemini usageMetadata extraction) align with constitution — particularly Principle VI (auditability) and VIII (cost discipline).

No violations. Complexity Tracking section not needed.

## Project Structure

### Documentation (this feature)

```text
specs/007-failure-classification/
├── plan.md              # This file
├── spec.md              # Feature specification (with clarifications)
├── research.md          # Phase 0: error mapping, cost source, refund strategy
├── data-model.md        # Phase 1: FailureClass, CostEstimate, GenerationRecord changes
├── quickstart.md        # Phase 1: key files, failure classes, refund rules
├── contracts/
│   └── generation-response.md  # Phase 1: success/error response contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
functions/src/
├── types.ts             # ADD: FailureClass type, CostEstimate interface
├── generators.ts        # MODIFY: tag each error path with FailureClass, capture tokens
└── index.ts             # MODIFY: catch + classify errors, write failure records, refund credits

src/services/
└── feedbackService.ts   # MODIFY: extend GenerationRecord interface, include costEstimate

firestore.indexes.json   # ADD: composite index (failureClass ASC, timestamp DESC)
```

**Structure Decision**: No new files created beyond types. All changes are modifications to existing files plus one new type definition and one Firestore index entry. This aligns with the "extend, don't restructure" approach from research.md.

## Phase 0: Research (Complete)

All unknowns resolved in [research.md](research.md):

1. **Error Path Mapping** — 18 error paths across generators.ts and index.ts mapped to 7 classes
2. **Where to Record** — Backend writes failure records directly; success returns costEstimate to frontend
3. **Cost Data Source** — Gemini API `usageMetadata` provides exact token counts
4. **Credit Refund** — Inline refund in catch block using existing `refundCreditsServer` pattern
5. **Firestore Index** — Composite `(failureClass, timestamp)` for date-range queries
6. **numeric_hallucination** — Remains soft-fail; tagged on record but generation still succeeds

## Phase 1: Design (Complete)

All design artifacts in place:

- [data-model.md](data-model.md) — FailureClass enum, CostEstimate shape, GenerationRecord extensions, state transitions, validation rules
- [contracts/generation-response.md](contracts/generation-response.md) — Success response extension, error handling flow, failure record schema, query contract
- [quickstart.md](quickstart.md) — Key files, 7 classes, refund rules, testing approach

## Phase 2: Task Decomposition

Ready for `/speckit.tasks` to generate ordered implementation tasks based on:
- 5 source files to modify (types.ts, generators.ts, index.ts, feedbackService.ts, firestore.indexes.json)
- 6 tasks from LAUNCH_MATRIX Phase 7 (7.1–7.6)
- 9 functional requirements (FR-001–FR-009)
- Credit refund logic (FR-009) as cross-cutting concern
