# Implementation Plan: Phase 16 — Creative Modes & Art Direction QA

**Branch**: `016-creative-modes-qa` | **Date**: 2026-04-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-creative-modes-qa/spec.md`

## Summary

Harden the creative-mode and art-direction surface with a deterministic QA contract: **43 new fixtures** across the 10 launched modes, 10 approved pairs, 4 blocked combos, 8 art-direction adapt states, plus the carousel/batch/retargeting variants and a runtime self-correction drift case. Add a runtime self-correction path that detects missing required composition elements in the build plan prompt and reinforces the prompt before render, recording a `mode_composition_missing` warning on the resolution trace. Make the mode-format-campaign validator the single source of truth for both the client *Generate* gate and the server-side resolver. No new modes, no new cards, no new aspect ratios — pure coverage and self-correction.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (frontend), React 19
**Primary Dependencies**:
- Backend: Firebase Cloud Functions v2, Firebase Admin SDK, Firestore. No new dependencies.
- Frontend: React 19, Zustand 4, Tailwind CSS 3, Vite 7. No new dependencies.
- Tests: Node's built-in `node:assert/strict` (existing pattern in `functions/src/contractFixtures.test.ts` — 81 existing fixtures).
**Storage**: Firestore — existing `generations/{genId}` document; new `resolutionTrace.modeComposition` sub-object (additive only, no migration).
**Testing**: `cd functions && npm test` runs `npm run build` then 4 test files sequentially via `node lib/...`. No vitest, no jest.
**Target Platform**: Firebase Cloud Functions (Node 20) on backend; modern evergreen browsers on frontend (Vite build target).
**Project Type**: Web application — `src/` (frontend) + `functions/src/` (backend) + shared types via copy in both trees.
**Performance Goals**:
- Mode-format-campaign validator: synchronous, < 2 ms per call (no I/O).
- Build-plan post-validation scan (FR-009): < 50 ms — runs once per generation between `generateBuildPlan()` return and `buildFinalImagePrompt()`.
- Inline UI message (FR-011): < 16 ms (single render frame after selection change).
- Full Phase 16 fixture suite: < 30 s on `npm test` (added to existing run, not a separate runner).
**Constraints**:
- Backwards-compatible: all 81 existing `contractFixtures.test.ts` blocks must still pass.
- Cultural-compliance pass (`scanAndReplace`) inside `generateBuildPlan` (called at lines 3884–3926) is **unchanged**. FR-008 verification runs against the post-`generateBuildPlan` return, which is already post-compliance.
- No new external network calls inside the mode-composition validator (no LLM, no API). Pure deterministic substring/slot-map check.
- Type-only changes are not enough: any new field on `ResolutionTrace` must also have a writer in `resolutionTrace.ts` and be optional to keep legacy reads safe.
**Scale/Scope**:
- **43 new fixtures** (10 solo + 10 approved pairs + 4 carousel-specific + 3 batch-specific + 2 retargeting-specific + 1 self-correction + 4 blocked + 8 adapt states + 1 adapt-state audit).
- 1 new validator function exported from `creativeResolver.ts` (used by client + server).
- 1 audit utility for art-direction strings vs cultural-compliance trigger words (run once at build time or as part of the fixture run).
- Frontend: 1 new inline-message slot below mode cards in `InputForm.tsx`, 1 line added to the `disabled` computation for the *Generate* button.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.1.0 (12 principles).

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Reliability Over Feature Count | ✅ Pass | No new modes, cards, ratios. Pure coverage and self-correction. |
| II | The Selected Mode MUST Be Obeyed | ✅ Pass | Phase 16 directly enforces this principle (its raison d'être). |
| III | Launch Surface Is Frozen and Authoritative | ✅ Pass | Fixtures cover only the launched surface (10 modes / 10 approved pairs / 8 adapt states). Deleted modes (`limited_access`, `module_preview`, `day_strip`) are not exercised. |
| IV | Behavior Contracts Beat Subjective Judgment | ✅ Pass | Every fixture has an explicit pass/fail rule (composition language present, zones present, resolver allows/blocks, reason string match). |
| V | Arabic Quality Is First-Class | ✅ Pass | FR-008 verifies the **post-compliance** prompt (Q3 clarification) — adapt states must survive `scanAndReplace`. Audit utility flags trigger-word collisions in the catalog. |
| VI | Hidden Machine Layers MUST Be Auditable | ✅ Pass | `mode_composition_missing` warning + `adaptStateAudit` results are recorded on `resolutionTrace`. |
| VII | No Silent Override Without Rule, Signal, and Trace | ⚠️ See Complexity Tracking | Q4 chose silent reinforcement at the user surface (matches HOTFIX-E precedent for non-behavior-changing self-corrections). Trace is recorded; user signal is suppressed by design. |
| VIII | Cost Discipline Is Mandatory | ✅ Pass | Server-side validator (Q1) rejects blocked combos before render → zero credit waste. Reinforcement happens **before** the same single render call → no double-render cost. |
| IX | Proof Is Required for Every Claimed Fix | ✅ Pass | Each FR has a fixture; `quickstart.md` walks through reproducible inputs. |
| X | Spec Before Code | ✅ Pass | Spec written, clarified, and approved before this plan. |
| XI | Frontend and Backend MUST Agree on Truth | ✅ Pass | Q1 mandates both layers enforce the validator from a single source (`creativeResolver.ts`). |
| XII | Deferred Scope MUST Remain Deferred | ✅ Pass | Out of Scope section explicit (no reflow, multi-hero, DR design, concept director). |

**Initial Constitution Check**: PASS with one justified deviation (Principle VII).

### Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Principle VII — silent reinforcement (no user-facing signal when `mode_composition_missing` fires and is reinforced) | Reinforcement adds a prompt instruction the model **should already** be following. It is not a behavior change visible to the user — the rendered ad still matches the user's selection (in fact, more closely than without it). Surfacing every Gemini drift instance as a UI badge would generate dozens of false-alarm notifications per day per user, eroding trust in real signals. | A user-visible badge ("self-corrected") was considered (Q4 option B) and rejected because (a) users cannot act on it, (b) it would noise-flood the UI on every drift instance, and (c) HOTFIX-E established the precedent that non-behavior-changing soft warnings live on the resolution trace, not on the ad surface. The trace is auditable per Principle VI, satisfying the spirit of "Signaled when relevant" — internal observers can see every event. |

## Project Structure

### Documentation (this feature)

```text
specs/016-creative-modes-qa/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # /speckit.specify + /speckit.clarify output
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/
│   └── mode-format-campaign-validator.md   # validator contract (single source of truth)
└── checklists/
    └── requirements.md  # /speckit.specify output
```

### Source Code (repository root)

```text
functions/                              # Backend (Firebase Cloud Functions v2)
├── src/
│   ├── creativeResolver.ts             # MODIFY — add validateModeFormatCombination()
│   ├── generators.ts                   # MODIFY — add post-build-plan composition validator (FR-009)
│   ├── culturalCompliance.ts           # READ-ONLY (existing TRIGGER_WORDS used by audit)
│   ├── resolutionTrace.ts              # MODIFY — add modeComposition + adaptStateAudit fields
│   ├── types.ts                        # MODIFY — extend ResolutionTrace interface
│   ├── adaptStateAudit.ts              # NEW — audit getSubStyleModeFusion strings vs trigger words
│   ├── contractFixtures.test.ts        # MODIFY — add 43 new fixtures
│   └── __tests__/
│       └── modeFormatValidator.test.ts # NEW — unit tests for validator
└── package.json                        # READ-ONLY (test command unchanged)

src/                                    # Frontend (React + Vite)
├── components/
│   └── InputForm.tsx                   # MODIFY — wire validateModeFormatCombination(),
│                                       #          add inline-message slot below mode cards,
│                                       #          extend Generate button disabled gate
└── creativeResolverShared.ts           # NEW (or shared via existing import path)
                                        # Mirrors backend export so client + server use the
                                        # same source of truth (no DRY duplication).
```

**Structure Decision**: Web application — backend (`functions/`) + frontend (`src/`). The mode-format-campaign validator is the linchpin: it lives in `functions/src/creativeResolver.ts` and is **also imported by the frontend** via the existing convention (the project already imports `validateLaunchSurface` from `creativeResolver.ts` in `src/components/InputForm.tsx`; we reuse that path). This satisfies Principle XI ("frontend and backend MUST agree on truth") and Q1's clarification (both layers enforce, single source of truth).

## Phase 0: Outline & Research

**Output**: [research.md](./research.md)

Research questions resolved:

1. **R1 — How is `requiredElements` actually represented?** Findings: each mode's `requiredElements` is an array of *symbolic identifiers* (e.g. `'hero_portrait'`, `'visible_item_rows_or_cards'`), **not** natural-language strings the prompt would contain. Naïve substring match against the prompt would produce false negatives on every generation. Decision: FR-009's "case-insensitive substring match" must be implemented against the existing **slot-map vocabulary** (the natural-language patterns `buildPlanSlotMap()` already maps to slots), not against the symbolic identifiers themselves. The clarification stands; the *implementation* uses `buildPlanSlotMap()` as the lookup mechanism. See research.md § R1 for the full rationale.

2. **R2 — Where exactly does cultural compliance run?** Findings: `scanAndReplace()` is called inside `generateBuildPlan()` at lines 3884, 3902, 3910, 3918, 3926. The technical prompt **returned from** `generateBuildPlan()` is already post-compliance. FR-008 verification can simply assert on that return value. No re-ordering needed.

3. **R3 — Are the 10 approved pairs already covered by `getPairRenderExecution`?** Findings: 7 explicit pairs are covered (`value_stack`, `speaker_card`, `event_ticket`, `book_mockup+device_mockup`, `webinar_screen`, `book_mockup`, `device_mockup`). The remaining approved pairs (likely candidates: `event_ticket+speaker_card`, `webinar_screen+speaker_card`, `standard_hero+device_mockup`) **must be audited** in task T005 — they may currently fall through to per-mode appends without explicit pair-level guidance.

4. **R4 — Are the 8 adapt states already encoded?** Findings: yes, in `creativeResolver.ts::getSubStyleModeFusion()` lines 1067–1167. Each is keyed `${subStyle}__${mode}` and returns a composition-override string injected into the build plan prompt at `generators.ts` line 3000. FR-008 fixtures assert the override appears in the post-compliance prompt.

5. **R5 — Test framework choice.** Findings: Node's built-in `node:assert/strict` (no vitest, no jest). New fixtures must follow the existing `contractFixtures.test.ts` pattern: `function testXxx() { ... }` declaration, called from a top-level driver, output via `console.log`/`assert`. Compiled to `lib/contractFixtures.test.js` and run via `node lib/contractFixtures.test.js`.

6. **R6 — Validator location for client+server reuse.** Findings: existing `validateLaunchSurface()` already lives in `functions/src/creativeResolver.ts` and is imported by `src/components/InputForm.tsx`. The new `validateModeFormatCombination()` follows the same pattern — co-located in `creativeResolver.ts`, imported by both layers.

7. **R7 — Resolution-trace extension cost.** Findings: `ResolutionTrace` is defined in `functions/src/types.ts` lines 218–253 and persisted as a sub-field on `generations/{genId}`. Adding optional fields (`modeComposition?`, `adaptStateAudit?`) is purely additive — no Firestore migration, no client-side reader updates required (legacy reads ignore unknown fields).

All NEEDS CLARIFICATION items: **none remaining**.

## Phase 1: Design & Contracts

**Output**:
- [data-model.md](./data-model.md) — 7 entities: CreativeMode, ModePair, BlockedCombination, AdaptState, ModeFormatValidationResult, ModeCompositionWarning, AdaptStateAuditEntry
- [contracts/mode-format-campaign-validator.md](./contracts/mode-format-campaign-validator.md) — single contract for the validator function
- [quickstart.md](./quickstart.md) — reproducible walkthrough: clone → install → run fixture suite → trigger one drift case manually
- Agent context update: `update-agent-context.ps1 -AgentType claude` will update `CLAUDE.md` with new files

### Re-evaluate Constitution Check post-design

After laying out the data model and validator contract:

- The validator function is pure and synchronous (Principle VIII — cost discipline upheld).
- The audit utility (`adaptStateAudit.ts`) runs once at fixture time, not per-generation (Principle VIII upheld).
- All new resolution-trace fields are optional (Principle XII — no implicit promotion of deferred scope).
- The shared validator import pattern is identical to the existing `validateLaunchSurface` pattern (Principle XI confirmed).

Post-design Constitution Check: **PASS**, same justified deviation as initial check (Principle VII — silent reinforcement, documented above).
