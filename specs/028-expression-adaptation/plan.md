# Implementation Plan: Expression Adaptation (Phase 28)

**Branch**: `phase-28-expression-adaptation` (spec folder `028-expression-adaptation`) | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/028-expression-adaptation/spec.md`

## Summary

Make the generated hero's facial **expression** follow the emotional intent of the selected hook angle (or, for retargeting, the objection), while keeping face **identity** pixel-faithful. Per the 2026-06-23 clarification, this is implemented as **guidance fed into the concept/blueprint generation step**, NOT as a rigid block injected into the `TECHNICAL_PROMPT`. A new pure mapper resolves the active hook angle / retargeting objection to an *emotional direction* (emotion label + concrete physical description). That direction is emitted as one `EXPRESSION DIRECTION:` line inside the existing `[VISUAL ARCHITECT V5.0]` concept prompt (`generators.ts` ~3097), mirroring the existing `MOOD DIRECTION:` line. Gemini authors the concept-specific expression into each concept's `MOOD_EMOTION` / `SUBJECT_ACTION` fields, which then flow into the synthesized `TECHNICAL_PROMPT` through the existing blueprint→technical-prompt synthesis. Face-identity protection stays a `TECHNICAL_PROMPT` rule at priority #1. The resolved direction is recorded in `ResolutionTrace.expressionAdaptation` (additive).

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions)
**Primary Dependencies**: Firebase Cloud Functions v2; Gemini (concept/blueprint generation); OpenAI gpt-image-2 / Gemini image (gated by `MODEL_PROVIDER` in `modelConfig.ts`) — image provider is downstream and unchanged
**Storage**: Firestore `generations/{genId}` — additive only (`resolutionTrace.expressionAdaptation` sub-object); NO schema migration
**Testing**: `cd functions && npm test` (Vitest/Jest-style co-located `*.test.ts` + `functions/src/__tests__/`)
**Target Platform**: Firebase Cloud Functions (europe-west1)
**Project Type**: Web SaaS (React frontend + Firebase Functions backend) — this feature is **backend-only** (prompt engineering); no frontend change
**Performance Goals**: No new model calls; the expression direction rides the existing concept-generation Gemini call. Net token delta per generation is a few hundred characters (one guidance line). No measurable latency target change.
**Constraints**: Reversible (comment out replaced content, never delete); `null` is the canonical absent sentinel; cultural-compliance, Arabic RTL, anti-sameness (P23), optional-field handling (P24B), copy-fidelity contract, and `MODEL_PROVIDER` switch all unchanged; identity protection priority #1 preserved.
**Scale/Scope**: ~1 new module (`expressionMap.ts`), 1 new test file, ~3 edit sites in `generators.ts` (concept-prompt injection, trace assembly, `ResolutionTrace` interface), additive type mirrors in `types.ts` + `docs/LAUNCH_MATRIX.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| II — Selected mode MUST be obeyed | PASS — the selected hook/objection now drives the hero's expression; previously it was silently ignored. Identity selection still obeyed (priority #1). |
| IV — Behavior contracts beat judgment | PASS — `contracts/expression-mapping.md` defines the angle/objection → direction table with explicit pass/fail; fixtures assert every angle resolves. |
| V — Arabic quality first-class | PASS — the `EXPRESSION DIRECTION:` guidance instructs Gemini; concept field content (`MOOD_EMOTION`) is authored in the project language per the existing LANGUAGE MANDATE. No English leaks into Arabic output. |
| VI — Hidden machine layers auditable | PASS — FR-017 records the resolved direction in `ResolutionTrace.expressionAdaptation`. |
| VII — No silent override without rule, signal, trace | PASS — rule = mapper table; this is guidance not an override of identity; traced. No user-facing signal required (it's an enhancement, not a suppression). |
| VIII — Cost discipline | PASS — zero new model calls; no new retries. |
| X — Spec before code | PASS — spec + clarifications complete before this plan. |
| XI — Frontend/backend agree | N/A — backend-only; no new launch state exposed to frontend. |

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/028-expression-adaptation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── expression-mapping.md   # Phase 1 output — angle/objection → direction contract
├── checklists/
│   └── requirements.md  # from /speckit.specify
└── tasks.md             # /speckit.tasks output (NOT created here)
```

### Source Code (repository root)

```text
functions/src/
├── expressionMap.ts            # NEW — pure mapper: angle/objection → ExpressionDirective; EXPRESSION_DIRECTION_BLOCK builder
├── generators.ts               # EDIT — inject EXPRESSION DIRECTION line into [VISUAL ARCHITECT V5.0] concept prompt (~3097);
│                               #        add ResolutionTrace.expressionAdaptation field (~5135); populate it in trace assembly
├── types.ts                    # EDIT (additive) — ExpressionDirective type + mirror ResolutionTrace.expressionAdaptation
└── __tests__/ or co-located
    └── expressionMap.test.ts   # NEW — all 10 angles, retargeting families, fallback, null, blending guidance present

docs/
└── LAUNCH_MATRIX.md            # EDIT (additive) — mirror ResolutionTrace.expressionAdaptation in the documented interface (line ~798)
```

**Structure Decision**: Single backend module (`functions/src/expressionMap.ts`) modeled on the existing `culturalCompliance.ts` / `retargetingObjections.ts` pattern (pure data + helper functions + a prompt-block builder), wired into the one shared concept-prompt builder in `generators.ts` so single / carousel / batch / retargeting / before-after are all covered through a single injection point. No new directories.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
