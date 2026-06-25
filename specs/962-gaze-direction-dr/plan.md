# Implementation Plan: Direct-Response Design Upgrades (Phase 19)

**Branch**: `962-gaze-direction-dr` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/962-gaze-direction-dr/spec.md`

## Summary

Phase 19 injects direct-response design guidance into the existing image- and copy-generation prompts, following the exact pattern Phase 28 (expression adaptation) established. A new pure mapper `functions/src/gazeMap.ts` resolves each of the 10 canonical cold hook angles (plus retargeting objections) to a `GazeDirective` (gaze treatment label + concrete physical description). A `buildImagePromptGazeBlock()` builder emits a `GAZE DIRECTION:` block, plus a hook-independent one-highlight cap, a hook-gated hook↔visual mood-modulation block, and a content-gated price-hierarchy block — all injected at the single shared assembly point `buildFinalImagePrompt()` in `generators.ts` (the same point Phase 28 uses, after the BLUEPRINT). CTA outcome-framing guidance is added to the existing Gemini copy-generation benefit block (both Arabic and English). An additive `ResolutionTrace.gazeDirection` sub-object records source/hookId/treatment/applied. No new model calls, no Firestore migration, no frontend changes, no billing/plan-gating changes. Fully reversible (comment-out injection + mapper returns null). Art-direction gaze override is deferred to a later phase per clarification.

## Technical Context

**Language/Version**: TypeScript 5.7 (Firebase Cloud Functions v2 backend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Admin SDK; OpenAI gpt-image-2 (visuals, gated by `MODEL_PROVIDER`), Gemini (copy/concepts). No new dependencies.
**Storage**: Firestore `generations/{genId}` — additive only (`ResolutionTrace.gazeDirection?` sub-object). No migration.
**Testing**: Node-based unit test runner mirroring `functions/src/__tests__/expressionMap.test.ts` (standalone script, exits 1 on failure); run via an `npm run test:gazeMap` script paralleling `test:expressionMap`.
**Target Platform**: Firebase Functions (europe-west1), project `proadsai-saas`.
**Project Type**: Web app — backend (functions/) only for this phase; frontend untouched.
**Performance Goals**: No latency change — prompt-only text injection; zero additional model calls.
**Constraints**: Face-identity protection rules MUST never be weakened/reordered (priority #1). `MODEL_PROVIDER` switch must stay operative on both Gemini and OpenAI paths. `null` is the canonical absent sentinel. Replaced code commented-out, not deleted. Cultural compliance + Arabic RTL unchanged.
**Scale/Scope**: One new file (`gazeMap.ts`), edits to `generators.ts` (image-prompt injection + copy CTA block) and `types.ts` (additive trace field), one new test file. ~10 canonical hooks + 12 objection ids + aliases + fallback.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Reliability Over Feature Count | PASS — additive guidance; no new selectable surface; fully reversible. |
| II. Selected Mode MUST Be Obeyed | PASS — gaze/DR guidance never changes the user-selected campaign/format/mode/language; it modulates *within* the selection. |
| III. Launch Surface Frozen | PASS — no new launch combinations; touches existing render paths only. |
| IV. Behavior Contracts Beat Subjective Judgment | PASS — `contracts/` define required inputs, required output, blocked behaviors, acceptable variation, fail conditions for each sub-feature. |
| V. Arabic Quality First-Class | PASS — CTA outcome framing applies to both languages and explicitly preserves existing Arabic grammar/flow rules; no Arabic weakening. |
| VI. Hidden Machine Layers Auditable | PASS — `ResolutionTrace.gazeDirection` records source/hookId/treatment/applied for every hero-bearing generation. |
| VII. No Silent Override Without Rule, Signal, Trace | PASS — gaze is additive guidance, not an override of user intent; it is rule-defined and traced. Art-direction override is **deferred** (Principle XII honored). |
| VIII. Cost Discipline | PASS — zero new model calls; no extra retries; prompt-text only. |
| IX. Proof Required for Every Fix | PASS — unit-test contracts + quickstart before/after evidence procedure defined. |
| X. Spec Before Code | PASS — spec + clarifications complete before this plan. |
| XI. Frontend/Backend Agree on Truth | PASS — backend-only change; no frontend state introduced; no launch-state validity change. |
| XII. Deferred Scope Remains Deferred | PASS — art-direction gaze override explicitly deferred with written spec note; mapper structured to add it later. |

**Result: PASS — no violations. Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/962-gaze-direction-dr/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── gaze-map.contract.md
│   ├── dr-guidance-injection.contract.md
│   └── cta-outcome-framing.contract.md
├── checklists/
│   └── requirements.md  # (from /speckit.specify)
└── tasks.md             # /speckit.tasks output (NOT created here)
```

### Source Code (repository root)

```text
functions/
├── src/
│   ├── gazeMap.ts                      # NEW — pure mapper + block builders (mirrors expressionMap.ts)
│   ├── generators.ts                   # EDIT — inject DR guidance in buildFinalImagePrompt(); add CTA outcome guidance in copy benefit block; write gazeDirection trace in generateFinalAd()
│   ├── types.ts                        # EDIT — additive ResolutionTrace.gazeDirection? sub-object
│   └── __tests__/
│       └── gazeMap.test.ts             # NEW — Contracts A–E (mirrors expressionMap.test.ts)
└── package.json                        # EDIT — add "test:gazeMap" script

src/                                    # Frontend — UNTOUCHED this phase
```

**Structure Decision**: Existing Firebase-functions backend layout. Phase 19 is backend-only prompt engineering. The single new module `gazeMap.ts` sits beside `expressionMap.ts`; all wiring goes through the already-established sole assembly point `buildFinalImagePrompt()` (`generators.ts:5260`) and the existing copy benefit block (`generators.ts:~2478`). No new directories, services, or frontend files.

## Complexity Tracking

> No constitution violations — section intentionally empty.
