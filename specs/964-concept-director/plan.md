# Implementation Plan: Phase 20 — Concept Director (Option A, backend-only)

**Branch**: `964-concept-director` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/964-concept-director/spec.md`

## Summary

Insert a hidden, fail-open **Concept Director** stage ahead of the existing single-call concept generator. For an enabled user, on every `serverGenerateConcepts` call with `mode === 'initial'` (single-ad AND batch-per-hook; carousel excluded via separate callables — C1, 2026-06-27), the stage runs a pure-reasoning text model **3× sequentially** — each call seeing the prior siblings' varianceAxes tokens — to author three deliberately distinct creative briefs (visual metaphor, headline architecture, layout archetype, forbidden props, hero gaze/pose, etc.). A deterministic, no-AI **Variance Validator** then checks the three briefs for collisions on core axes and triggers **at most one** retry of the offending concept(s). The validated briefs **enrich** the existing `[VISUAL ARCHITECT V5.0]` prompt inside `generateConcepts()` — they do not replace it. Any failure (model error, >15s timeout, malformed output, schema/hard-rule violation) falls back to today's exact behavior for that concept. The stage is gated by a per-user flag (`users/{uid}.conceptDirectorEnabled`, default `false`) and a global Firebase Remote Config kill switch (`conceptDirectorKillSwitch`, 60s cache). An additive `ResolutionTrace.conceptDirector` records what happened. No frontend change, no new callable, no schema migration, no pricing change.

**Technical approach** follows the established pure-mapper pattern (`expressionMap.ts`, `gazeMap.ts`, `universeCopyMap.ts`): a side-effect-free module owns the schema, prompt-builder, enum sets, hard-constraint validation, and the enrichment-block builder; orchestration (model calls, flag/kill-switch reads, retry loop, trace write) lives in the callable/generator layer that already holds `uid` and the Gemini caller.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions); compiled to JS run on Node 20.
**Primary Dependencies**: Firebase Cloud Functions v2 (`^7.2.2`), Firebase Admin SDK (`^13.6.1`) — Firestore + Remote Config; the existing Gemini text caller injected via `generators.setGeminiCaller(createGeminiCaller(...))` (no new model SDK, no new API). The OpenAI image provider is untouched (Director is a text/JSON call only).
**Storage**:
- `users/{uid}.conceptDirectorEnabled: boolean` (per-user flag, default false — additive field).
- Remote Config parameter `conceptDirectorKillSwitch: boolean` (global kill switch).
- `generations/{genId}.resolutionTrace.conceptDirector` (additive, optional sub-object — no migration).
**Testing**: `node:test` built by `tsc`, each `*.test.ts` compiled to `lib/...` and appended to the `functions` `test` npm script (mirrors `gazeMap.test.ts` / `expressionMap.test.ts`). New file: `functions/src/__tests__/conceptDirector.test.ts` (or fixtures inside `contractFixtures.test.ts` per 20.G).
**Target Platform**: Firebase Functions v2, region `europe-west1`, `serverGenerateConcepts` onCall (timeout 120s, 1GiB).
**Project Type**: Web app (React frontend + Functions backend). **This feature is backend-only.**
**Performance Goals**: Director adds ≤3 sequential text calls (each bounded at **15s**) plus ≤1 retry call on the live path; Variance Validator is pure and returns in <5ms (no AI). Flag read = 1 cached Firestore doc read already loaded for the generation; kill-switch read cached 60s in-process.
**Constraints**: Fail-open (never block, never error to user, credits unchanged on fallback); additive only (no schema migration, no existing-behavior change); single consistent run/skip decision per generation; enum category labels stay canonical English; human-readable brief fields in user's language; `conservative`/`aggressive` modes defined but only `balanced` exercised.
**Scale/Scope**: One new pure module (`conceptDirector.ts`), one new pure validator (`varianceValidator.ts`), one additive trace field, one flag field, one kill-switch read helper, enrichment wiring at the single `generateConcepts()` prompt-assembly point, and tests. Runs for every `serverGenerateConcepts` call with `mode === 'initial'` — single-ad AND batch-per-hook (revised 2026-06-27, C1); carousel is excluded structurally (separate callables).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Verdict |
|-----------|-----------|---------|
| I. Reliability Over Feature Count | Fail-open fallback + flag + kill switch = zero added launch risk; ships dark. | ✅ Pass |
| II. The Selected Mode MUST Be Obeyed | User's inviolable choices (sub-style, mode, language, ratio, brand) are never overridden (FR-008); brief specializes within sub-style. | ✅ Pass |
| III. Launch Surface Is Frozen | Scope = `serverGenerateConcepts` `mode='initial'` (single-ad + batch-per-hook); carousel + deferred parts (20.A/E/F, memory, telemetry) explicitly excluded. | ✅ Pass |
| IV. Behavior Contracts Beat Subjective Judgment | Pass/fail rules per FR; contracts/ define inputs, required output, blocked behaviors, variance rules, fail conditions. | ✅ Pass |
| V. Arabic Quality Is First-Class | Brief human-readable fields authored in user's language; enums stay English for the pipeline; no relaxation of existing Arabic rules. | ✅ Pass |
| VI. Hidden Machine Layers MUST Be Auditable | `ResolutionTrace.conceptDirector` records ran/fallbacks/retries/variance-achieved (FR-025). | ✅ Pass |
| VII. No Silent Override Without Rule, Signal, Trace | Every fallback/retry is rule-defined and trace-recorded; the stage enriches rather than overrides. | ✅ Pass |
| VIII. Cost Discipline Is Mandatory | Max 1 retry; validator is deterministic/no-AI; 15s per-concept ceiling; flag-gated rollout; no wasteful loops. | ✅ Pass |
| IX. Proof Is Required for Every Claimed Fix | Tests (FR-027/028) + quickstart give reproducible before/after evidence. | ✅ Pass |
| X. Spec Before Code | Spec + clarifications + this plan precede implementation. | ✅ Pass |
| XI. Frontend and Backend MUST Agree | Backend-only; flag enforced server-side; no frontend state exposed; no invalid state reachable. | ✅ Pass |
| XII. Deferred Scope MUST Remain Deferred | 20.A/20.E/20.F, creative-memory (20.D.7), carousel, telemetry collection explicitly deferred in spec + plan (batch is in scope as of 2026-06-27, C1). | ✅ Pass |

**Result: PASS — no violations. Complexity Tracking section omitted (nothing to justify).**

## Project Structure

### Documentation (this feature)

```text
specs/964-concept-director/
├── plan.md              # This file
├── spec.md              # Feature spec (+ Clarifications 2026-06-26)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── conceptDirector.contract.md
│   ├── varianceValidator.contract.md
│   ├── integration.contract.md
│   └── trace.contract.md
├── checklists/
│   └── requirements.md  # /speckit.specify quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
functions/
├── src/
│   ├── conceptDirector.ts          # NEW — pure module: schema, enums, prompt builder,
│   │                               #       hard-constraint validation, enrichment-block builder,
│   │                               #       fallback signal. No Gemini/Firebase imports.
│   ├── varianceValidator.ts        # NEW — pure module: deterministic token comparison,
│   │                               #       balanced-mode rejection rules, normalized match.
│   ├── conceptDirectorConfig.ts    # NEW (small, REQUIRED separate file — pinned 2026-06-27) —
│   │                               #       kill-switch read (Remote Config + 60s cache) + flag read helper;
│   │                               #       imported by index.ts. Not inlined.
│   ├── generators.ts               # EDIT — generateConcepts(): accept optional director briefs,
│   │                               #       enrich the [VISUAL ARCHITECT V5.0] prompt, leave existing
│   │                               #       logic intact as fallback; headline-architecture-aware
│   │                               #       quick-reject whitelist.
│   ├── index.ts                    # EDIT — serverGenerateConcepts: flag + kill-switch gate (uid here),
│   │                               #       run Director 3× sequential + Variance Validator + ≤1 retry,
│   │                               #       pass briefs into generateConcepts, write trace.
│   ├── types.ts                    # EDIT — add ResolutionTrace.conceptDirector (additive, optional).
│   └── __tests__/
│       └── conceptDirector.test.ts # NEW — Director + Validator fixtures (FR-027 / FR-028).
└── package.json                    # EDIT — append the new test file to the `test` script.
```

**Structure Decision**: Backend-only change inside the existing `functions/` package. New logic is isolated in two side-effect-free modules (`conceptDirector.ts`, `varianceValidator.ts`) to match the proven `gazeMap.ts` / `expressionMap.ts` / `universeCopyMap.ts` pattern — pure, unit-testable without Gemini, and reversible by neutralizing the module + removing the single enrichment call. Orchestration (model calls, flag/kill-switch, retry loop, trace) stays in `index.ts`/`generators.ts` where `uid` and the injected Gemini caller already live. No frontend directory is touched.

## Complexity Tracking

> No constitution violations — section intentionally empty.
