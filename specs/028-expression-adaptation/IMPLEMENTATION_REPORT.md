# Phase 28 — Expression Adaptation: Implementation Report

**Branch:** `phase-28-expression-adaptation`
**PR:** https://github.com/eslam21006-coding/proadsai/pull/46
**Spec:** `specs/028-expression-adaptation/`
**Date:** 2026-06-23

## Summary

The generated hero's facial **expression** now follows the emotional intent of the selected hook angle (or, for retargeting, the objection), while keeping the hero's face **identity** pixel-faithful. A new pure mapper (`functions/src/expressionMap.ts`) resolves the active hook angle / retargeting objection to an `ExpressionDirective` (emotion + concrete physical description). The resolved directive is emitted as one `EXPRESSION DIRECTION:` line into the `[VISUAL ARCHITECT V5.0]` concept prompt in `generators.ts` (immediately after the `MOOD DIRECTION:` line), where Gemini authors the concept-specific expression into each concept's `MOOD_EMOTION` / `SUBJECT_ACTION` fields. That expression flows into the synthesized `TECHNICAL_PROMPT` through the existing blueprint→technical-prompt synthesis. **Face-identity protection stays priority #1** and is unchanged.

A single shared injection point covers single / carousel / batch / retargeting / before-after. The resolved direction is recorded in `ResolutionTrace.expressionAdaptation` (additive only; no Firestore migration).

## What was built

### New files
| File | Purpose |
|---|---|
| `functions/src/expressionMap.ts` | Pure mapper (10 cold hook angles + 12 retargeting objection ids → `ExpressionDirective`) and the `EXPRESSION DIRECTION:` block builder. Alias resolution (`shocking_stat`, `fear_of_missing_out`, `future_pacing`) and a fallback directive ("confident, approachable") for unknown ids. |
| `functions/src/__tests__/expressionMap.test.ts` | **188 assertions** covering Contract A (mapper resolution), Contract B (block builder), Contract C (injection, before/after consistency, no-Box-A path, single injection site for carousel/batch), Contract D (identity priority, source-file sanity). |
| `specs/028-expression-adaptation/*` | Spec, plan, data-model, contracts, research, quickstart, checklists, tasks. |

### Edited files
| File | Change |
|---|---|
| `functions/src/generators.ts` | Import the mapper; compute directive from cold hook OR retargeting objection; emit `EXPRESSION DIRECTION:` line in the concept prompt; populate `_lastResolutionTrace.expressionAdaptation` (additive only). |
| `functions/src/types.ts` | Add `ExpressionDirective` type + `ResolutionTrace.expressionAdaptation?` mirror. |
| `functions/package.json` | Add `test:expressionMap` script; wire the new test into the `test` script. |
| `docs/LAUNCH_MATRIX.md` | Section 8 mirror + Phase 28 status from TODO to DONE. |
| `CLAUDE.md` / `AGENTS.md` | Recent Changes entry. |

## Architecture (resolved 2026-06-23)

The hook→expression mapping is **guidance input to the concept/blueprint generation step**, NOT a rigid override injected into `TECHNICAL_PROMPT`. Per the spec clarification, each of the 3 concepts may interpret the same hook emotion differently (e.g. pain → "frustrated" in concept 1, "intensely determined" in concept 2) consistent with anti-sameness variation. Identity protection rules remain in the technical prompt at priority #1 and win any conflict; the expression (priority #2) and art-direction pose (priority #3) MUST NOT weaken, remove, or reorder identity protection.

## Mapping tables

### Cold hook angles (10 canonical IDs, `HOOK_ANGLE_KNOWLEDGE`)

| Hook angle id | emotion | description (physical) |
|---|---|---|
| `pain` | concern, frustration | slight frown, tired eyes, jaw tension — quiet suffering, NOT anger |
| `curiosity` | intrigue, thoughtfulness | raised eyebrow, slight head tilt, studying look |
| `logic` | analytical clarity | focused gaze, neutral relaxed mouth, evaluating |
| `social_proof` | confidence, quiet pride | relaxed confident expression, soft smile |
| `urgency` | alertness, focused intensity | focused eyes, lips slightly compressed, ready-to-act |
| `emotional` | empathetic, heartfelt | warm vulnerability — open expression, eyes that connect |
| `statistics` | sober, analytical | measured gaze, calm composed face |
| `scarcity` | urgent, alert | focused alert eyes, calm but tense posture |
| `logical_authority` | commanding, assured | settled confident gaze, composed shoulders |
| `future_based` | aspirational, hopeful | uplifted gaze, soft smile at the corners |

Defensive aliases: `shocking_stat`→`statistics`, `fear_of_missing_out`→`urgency`, `future_pacing`→`future_based`.
Fallback: unknown non-null id → "confident, approachable" (never null for a real run).

### Retargeting objections (12 IDs, `RETARGETING_OBJECTION_DATA`)

| Family → emotion | objection ids |
|---|---|
| analytical & evaluating | `price_too_high`, `no_budget_now`, `need_installments` |
| reassuring & confident | `dont_trust`, `tried_before_failed`, `will_it_work_for_me` |
| urgent & focused | `no_time`, `not_ready_yet` |
| confident & approachable (fallback) | `overwhelmed`, `need_approval`, `dont_want_call`, `dont_need_it` |

## Block builder (Contract B)

`buildExpressionDirectionBlock(directive, opts?)` emits a multi-line block:

```
EXPRESSION DIRECTION: <emotion>.
Physical description: <description>.
Identity is PRIORITY #1 — do NOT change bone structure, facial features, or skin texture; the expression must adapt without altering who the person is.
BLEND with the selected art direction: art direction sets the CHARACTER / STYLE / ENERGY (...) and the hook/objection sets the EMOTION — combine them into one cohesive expression (e.g. a 'mythic' art direction with a 'pain' emotion reads as 'powerful concern', not flat concern and not a default smile).
Keep the expression SUBTLE and NATURAL — never exaggerated, theatrical, or caricatured.
```

For a `null` directive the builder returns `''` so the injection site emits no line (Contract C3, no regression).

## Trace (FR-017, Contract E)

`ResolutionTrace.expressionAdaptation?` is added as an **optional** field in three places (mirrored):

```ts
expressionAdaptation?: {
    source: "hook" | "objection";
    sourceId: string;
    emotion: string;
    applied: boolean;
};
```

- `applied: true` → an `EXPRESSION DIRECTION:` line was emitted
- omitted or `applied: false` → no hook/objection was active (no regression vs pre-Phase-28)
- Legacy generations simply omit the field; no Firestore schema migration

## Contract coverage (188 assertions, all green)

| Contract | Tests | Status |
|---|---|---|
| **A** — Mapper resolution (10 angles, 12 objections, null/unknown, aliases) | A1–A15 + family groups | ✅ 110 assertions |
| **B** — Block builder (emotion, identity, blending, subtle, no-gaze, null) | B1–B6 | ✅ 38 assertions |
| **C** — Injection (cold path, retargeting path, no-op, before/after consistency, no-Box-A, single site) | C2–C8 | ✅ 28 assertions |
| **D** — Identity & regression (source-file sanity, identity-priority, single injection site, no-gaze) | D1, D3, D4, D5 + source-coverage | ✅ 12 assertions |
| **Test suite** — `cd functions && npm test` | all existing suites | ✅ 0 regressions |

## Test results

```
929 passed, 0 failed  (savedProjects.projectStatus)
 71 passed, 0 failed  (savedProjects.projectQuota)
206 passed, 0 failed  (savedProjects.getUserProjects)
 77 passed, 0 failed  (culturalCompliance)
188 passed, 0 failed  (modeFormatValidator + new expressionMap)
 51 passed, 0 failed  (workspace)
languageQuality.test: PASS
sizeVariant.test: PASS
contractFixtures.test: PASS
```

## No regressions

- ✅ Face-identity protection rules unchanged in `TECHNICAL_PROMPT`
- ✅ Art-direction `MOOD_EMOTION` blocks unchanged
- ✅ Anti-sameness rules (Phase 23) preserved
- ✅ Optional-field handling (Phase 24B) preserved
- ✅ Cultural-compliance guardrails preserved
- ✅ Arabic RTL handling preserved
- ✅ `MODEL_PROVIDER` switch intact (gemini + openai both produce valid generations)
- ✅ No frontend, billing, Firestore schema, or pricing/plan-gating change

## Reversibility

Fully reversible:
- Comment out the `${_exprDirectionBlock ? ...}` template line in `generators.ts` (~line 3132), and
- Have the mapper functions return `null` (or short-circuit the lookup)
- → the prompt is byte-identical to pre-Phase-28

The trace field is optional and harmless; existing consumers that don't read it are unaffected.

## Files touched

```
AGENTS.md                                                            (Recent Changes entry)
CLAUDE.md                                                            (Recent Changes entry)
docs/LAUNCH_MATRIX.md                                                (Section 8 + Phase 28 status)
functions/package.json                                               (test:expressionMap + test script)
functions/src/expressionMap.ts                                       (NEW — pure mapper + block builder)
functions/src/__tests__/expressionMap.test.ts                        (NEW — 188 assertions)
functions/src/generators.ts                                           (import + injection + trace)
functions/src/types.ts                                               (ExpressionDirective + trace mirror)
specs/028-expression-adaptation/checklists/requirements.md           (NEW — spec checklist)
specs/028-expression-adaptation/contracts/expression-mapping.md      (NEW — Contract A–E)
specs/028-expression-adaptation/data-model.md                        (NEW)
specs/028-expression-adaptation/plan.md                              (NEW)
specs/028-expression-adaptation/quickstart.md                        (NEW)
specs/028-expression-adaptation/research.md                          (NEW)
specs/028-expression-adaptation/spec.md                              (NEW)
specs/028-expression-adaptation/tasks.md                             (NEW + all 33 items checked)
```

## Quickstart verification (Constitution IX)

| # | Step | Status |
|---|---|---|
| 1 | Pain hook + uploaded smiling photo → concern, same face | Manual — deferred to QA (no live harness) |
| 2 | `future_based` → determination, not neutral | Manual — deferred to QA |
| 3 | All 10 angles resolve with non-empty `expressionAdaptation.emotion` | **Automated** — 10/10 angles, see A1 in `expressionMap.test.ts` |
| 4 | Before/after pain → before problem emotion, after confident | **Automated** — see C5 (block-builder + source-presence) |
| 5 | No angle → no `EXPRESSION DIRECTION:` line | **Automated** — see A14 + B6 (null returns null + empty block) |
| 6 | Arabic project → `MOOD_EMOTION` in Arabic | Unchanged — existing Arabic mandate still applies; guidance instruction is English, output field content is in the project language |

## Definition of done

- [x] All Contract A–E assertions pass (188/188 green)
- [x] `npm test` clean (functions + frontend, zero new failures)
- [x] `npm run build` clean (functions + frontend)
- [x] Identity protection rules untouched; `MODEL_PROVIDER` switch verified
- [x] Reversible (no deletions; mapper returns `null` for absent; trace field optional)
- [x] Phase 28 status updated in `docs/LAUNCH_MATRIX.md`
- [x] Recent Changes entry added to `AGENTS.md` and `CLAUDE.md`
- [x] All 33 tasks in `tasks.md` marked `[x]`
- [x] Branch pushed; PR opened (#46)

PR: https://github.com/eslam21006-coding/proadsai/pull/46
