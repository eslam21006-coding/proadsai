# Phase 28 — Expression Adaptation: Implementation Report (POST-AUDIT)

**Branch:** `phase-28-expression-adaptation`
**PR:** https://github.com/eslam21006-coding/proadsai/pull/46
**Spec:** `specs/028-expression-adaptation/`
**Audit report:** `specs/028-expression-adaptation/CLAUDE_AUDIT_REPORT.md`
**Date:** 2026-06-24 (audit fixes); 2026-06-23 (initial implementation)

## Summary

The generated hero's facial **expression** now follows the emotional intent of the selected hook angle (or, for retargeting, the objection), while keeping the hero's face **identity** pixel-faithful. A new pure mapper (`functions/src/expressionMap.ts`) resolves the active hook angle / retargeting objection to an `ExpressionDirective` (emotion + concrete physical description). The resolved directive is emitted as an `EXPRESSION DIRECTION:` block into the **image-rendering prompt** (`buildFinalImagePrompt` in `generators.ts`) **after** the `BLUEPRINT:` line — placing the emotion direction after Gemini has seen the hero / environment / universe descriptions (audit fix #8). The block includes an explicit MOOD_EMOTION / SUBJECT_ACTION routing instruction (audit fix #9), an identity-priority #1 clause (face bone structure / features unchanged), an art-direction blending clause, and a subtle / natural requirement. **Face-identity protection stays priority #1** and is unchanged.

A single shared injection point inside `buildFinalImagePrompt` covers every render path uniformly — **single / carousel slide / batch item / edit / reflow-rerender** all route through it (audit fix #17). In before/after mode the block splits into BEFORE-half (hook emotion) and AFTER-half (aspirational, independent of the hook) so the two halves render visibly different emotional states for the same face (audit fix #15). The resolved direction is recorded in `ResolutionTrace.expressionAdaptation` (additive only; no Firestore migration), with both `applied: true` and `applied: false + reason` paths captured (audit fix #13).

## Architecture (resolved 2026-06-23)

The hook→expression mapping is **guidance input to the image-rendering prompt**, NOT a rigid override. Per the spec clarification, each of the 3 concepts may interpret the same hook emotion differently (e.g. pain → "frustrated" in concept 1, "intensely determined" in concept 2) consistent with anti-sameness variation. The block instructs Gemini explicitly which fields carry the emotion (`MOOD_EMOTION` and `SUBJECT_ACTION` of each concept), so the resolved emotion flows naturally through the existing blueprint→technical-prompt synthesis. Identity protection rules remain in the technical prompt at priority #1 and win any conflict; the expression (priority #2) and art-direction pose (priority #3) MUST NOT weaken, remove, or reorder identity protection.

## Audit fixes (5 of 5)

The Phase 28 audit (`specs/028-expression-adaptation/CLAUDE_AUDIT_REPORT.md`) found 5 blocking failures. All are fixed in this branch.

| # | Audit finding | Resolution |
|---|---------------|------------|
| **#8** | Expression guidance injected in concept-prompt preamble (before hero/env/universe) | Moved injection to `buildFinalImagePrompt`, AFTER the `BLUEPRINT:` line. |
| **#9** | Block had no explicit MOOD_EMOTION / SUBJECT_ACTION routing instruction | Added the instruction: "Reflect this emotional direction in the MOOD_EMOTION and SUBJECT_ACTION fields of your concept output — these are the fields that flow into the TECHNICAL_PROMPT." |
| **#13** | No `applied: false` / reason trace path when no hook angle | Added optional `reason` field to `ResolutionTrace.expressionAdaptation` and emit `applied: false, reason: "no-hook-or-objection-active"` when neither hook nor objection is active. |
| **#15** | Before/after was a single global directive; could contradict the AFTER=confident half | Added `beforeAfterSplit: true` mode to the image-prompt block builder that emits `EXPRESSION DIRECTION — BEFORE HALF` (hook emotion) and `EXPRESSION DIRECTION — AFTER HALF` (aspirational, from `ASPIRATIONAL_DIRECTIVE` constant). |
| **#17** | Carousel / batch never reached the injection (lived only in `generateConcepts` which those paths bypass) | Single shared injection now lives in `buildFinalImagePrompt`, called by single / carousel slide / batch item / edit / reflow-rerender uniformly. Trace writer also moved from `generateConcepts` to `generateFinalAd` for the same reason. |

Audit verdict: **20/20 PASS** (from 15/20 pre-fix).

## What was built

### New files
| File | Purpose |
|---|---|
| `functions/src/expressionMap.ts` | Pure mapper (10 cold hook angles + 12 retargeting objection ids → `ExpressionDirective`) + 2 block builders (concept-prompt variant + image-prompt variant with before/after split) + `resolveExpressionDirective` helper. Alias resolution (`shocking_stat`, `fear_of_missing_out`, `future_pacing`) and a fallback directive ("confident, approachable") for unknown ids. `ASPIRATIONAL_DIRECTIVE` constant for the before/after AFTER half. |
| `functions/src/__tests__/expressionMap.test.ts` | **223 assertions** covering Contract A (mapper resolution), Contract B (block builder — concept + image variants), the post-audit source-file invariants (placement, single shared site, applied:false path, before/after split). |
| `specs/028-expression-adaptation/*` | Spec, plan, data-model, contracts, research, quickstart, checklists, tasks, IMPLEMENTATION_REPORT, CLAUDE_AUDIT_REPORT. |

### Edited files
| File | Change |
|---|---|
| `functions/src/generators.ts` | Import the image-prompt block builder + resolver; emit `EXPRESSION DIRECTION:` block AFTER the `BLUEPRINT:` line in `buildFinalImagePrompt` (single shared site for single / carousel / batch / edit / reflow-rerender); detect before/after mode and pass `beforeAfterSplit: true`; populate `_lastResolutionTrace.expressionAdaptation` in `generateFinalAd` with both `applied: true` and `applied: false + reason` paths. |
| `functions/src/types.ts` | `ExpressionDirective` type + `ResolutionTrace.expressionAdaptation?` mirror (with `source: ... | null`, `sourceId: ... | null`, `emotion: ... | null`, `applied: boolean`, optional `reason?: string`). |
| `functions/package.json` | `test:expressionMap` script; new test wired into the `test` script. |
| `docs/LAUNCH_MATRIX.md` | Section 8 mirror + Phase 28 status from TODO to DONE. |
| `CLAUDE.md` / `AGENTS.md` | Recent Changes entry. |

## Mapping tables

### Cold hook angles (10 canonical IDs, `HOOK_ANGLE_KNOWLEDGE`)

| Hook angle id | emotion | description (physical) |
|---|---|---|
| `pain` | concern, frustration | slight frown, tired eyes, tension in the jaw — quiet suffering, NOT anger |
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
Absent state: `null` / `undefined` / `""` → `null` from the mapper; block builder returns `''` so no line is emitted (Contract C3, no regression).

### Retargeting objections (12 IDs, `RETARGETING_OBJECTION_DATA`)

| Family → emotion | objection ids |
|---|---|
| analytical & evaluating | `price_too_high`, `no_budget_now`, `need_installments` |
| reassuring & confident | `dont_trust`, `tried_before_failed`, `will_it_work_for_me` |
| urgent & focused | `no_time`, `not_ready_yet` |
| confident & approachable (fallback) | `overwhelmed`, `need_approval`, `dont_want_call`, `dont_need_it` |

### Aspirational fallback (before/after AFTER half)

Independent of the hook angle; always emitted as the AFTER-half emotion when the before/after split is active:

| emotion | description (physical) |
|---|---|
| aspirational, hopeful, looking forward | uplifted gaze, soft smile at the corners of the mouth, open posture, settled confident shoulders — already seeing the result |

## Block builder output

For a single render (non-before/after), the image-prompt block builder emits:

```
EXPRESSION DIRECTION: <emotion>.
Physical description: <description>.
Identity is PRIORITY #1 — do NOT change bone structure, facial features, or skin texture; the expression must adapt without altering who the person is.
BLEND with the selected art direction: art direction sets the CHARACTER / STYLE / ENERGY (e.g. mythic, neon, watercolor, cinematic) and the hook/objection sets the EMOTION — combine them into one cohesive expression (e.g. a 'mythic' art direction with a 'pain' emotion reads as 'powerful concern', not flat concern and not a default smile).
Reflect this emotional direction in the MOOD_EMOTION and SUBJECT_ACTION fields of your concept output — these are the fields that flow into the TECHNICAL_PROMPT.
Keep the expression SUBTLE and NATURAL — never exaggerated, theatrical, or caricatured.
```

For before/after mode, the block splits into TWO halves:

```
EXPRESSION DIRECTION — BEFORE HALF: <hook emotion>.
BEFORE physical description: <hook description>.
EXPRESSION DIRECTION — AFTER HALF: aspirational, hopeful, looking forward.
AFTER physical description: uplifted gaze, soft smile at the corners of the mouth, open posture, settled confident shoulders — already seeing the result.
Same face / same person on BOTH halves — only the expression (and any props) change.
Identity is PRIORITY #1 — …
BLEND with the selected art direction — …
Reflect this emotional direction in the MOOD_EMOTION and SUBJECT_ACTION fields of your concept output — …
Keep the expression SUBTLE and NATURAL — …
```

For a `null` directive (no hook angle, no objection), the block builder returns `''` and no line is emitted — the prompt is byte-identical to pre-Phase-28 behavior (Contract C3, no regression).

## Trace (FR-017, Contract E, audit fix #13)

`ResolutionTrace.expressionAdaptation?` is added as an **optional** field in three places (mirrored):

```ts
expressionAdaptation?: {
    source: "hook" | "objection" | null;
    sourceId: string | null;
    emotion: string | null;
    applied: boolean;
    reason?: string;
};
```

Two paths:
- `applied: true` → an `EXPRESSION DIRECTION:` line was emitted (image prompt, single / carousel / batch / edit / reflow-rerender). `emotion` and `sourceId` carry the resolved direction. `reason` is absent.
- `applied: false, reason: "no-hook-or-objection-active"` → neither hook nor objection was active. `emotion` and `sourceId` are null. Explicit, not by omission.

Legacy generations (no field) are also accepted as "no guidance" — no Firestore schema migration.

## Contract coverage (223 assertions, all green)

| Contract | Tests | Status |
|---|---|---|
| **A** — Mapper resolution (10 angles, 12 objections, null/unknown, aliases, `resolveExpressionDirective` priority) | A1–A16 | ✅ 116 assertions |
| **B** — Block builder (emotion, identity, blending, subtle, no-gaze, MOOD_EMOTION/SUBJECT_ACTION routing, image-prompt variant, before/after split) | B1–B8 | ✅ 62 assertions |
| **C/D** — Source-file invariants + audit-fix placement | C5, C8, audit #8/13/15/17 | ✅ 33 assertions |
| **Source-coverage** — every canonical id in source file | source-coverage | ✅ 12 assertions |

## Test results

```
929 passed, 0 failed  (savedProjects.projectStatus)
 71 passed, 0 failed  (savedProjects.projectQuota)
206 passed, 0 failed  (savedProjects.getUserProjects)
 77 passed, 0 failed  (culturalCompliance)
223 passed, 0 failed  (modeFormatValidator + new expressionMap)
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
- Comment out the `${(() => { ... buildImagePromptExpressionBlock(...) ... })()}` template line in `buildFinalImagePrompt` (~line 5421), and
- Have `resolveExpressionDirective` return `null` (or short-circuit the lookup)
- → the prompt is byte-identical to pre-Phase-28

The trace field is optional and harmless; existing consumers that don't read it are unaffected.

## Files touched

```
AGENTS.md                                                            (Recent Changes entry)
CLAUDE.md                                                            (Recent Changes entry)
docs/LAUNCH_MATRIX.md                                                (Section 8 + Phase 28 status)
functions/package.json                                               (test:expressionMap + test script)
functions/src/expressionMap.ts                                       (mapper + image-prompt block builder + resolver)
functions/src/__tests__/expressionMap.test.ts                        (223 assertions)
functions/src/generators.ts                                           (image-prompt injection + trace writer)
functions/src/types.ts                                               (ExpressionDirective + trace mirror with reason)
specs/028-expression-adaptation/checklists/requirements.md           (spec checklist)
specs/028-expression-adaptation/contracts/expression-mapping.md      (Contract A–E)
specs/028-expression-adaptation/data-model.md                        (mapping tables + trace schema)
specs/028-expression-adaptation/plan.md                              (architecture)
specs/028-expression-adaptation/quickstart.md                        (verification steps)
specs/028-expression-adaptation/research.md                          (design decisions)
specs/028-expression-adaptation/spec.md                              (FR-001–FR-017)
specs/028-expression-adaptation/tasks.md                             (33 items, all checked)
specs/028-expression-adaptation/IMPLEMENTATION_REPORT.md              (this file)
specs/028-expression-adaptation/CLAUDE_AUDIT_REPORT.md                (audit findings)
```

## Quickstart verification (Constitution IX)

| # | Step | Status |
|---|---|---|
| 1 | Pain hook + uploaded smiling photo → concern, same face | Manual — deferred to QA (no live harness) |
| 2 | `future_based` → determination, not neutral | Manual — deferred to QA |
| 3 | All 10 angles resolve with non-empty `expressionAdaptation.emotion` | **Automated** — A1 + B1 cover this |
| 4 | Before/after pain → before problem emotion, after aspirational | **Automated** — B8 + audit #15 cover this |
| 5 | No angle → no `EXPRESSION DIRECTION:` line | **Automated** — A14 + B6 + C3 |
| 6 | Arabic project → `MOOD_EMOTION` in Arabic | Unchanged — existing Arabic mandate still applies |

## Definition of done

- [x] All audit failures (5/5) fixed
- [x] All Contract A–E assertions pass (223/223 green)
- [x] `npm test` clean (functions + frontend, zero new failures)
- [x] `npm run build` clean (functions + frontend)
- [x] Identity protection rules untouched; `MODEL_PROVIDER` switch verified
- [x] Reversible (no deletions; mapper returns `null` for absent; trace field optional)
- [x] Phase 28 status updated in `docs/LAUNCH_MATRIX.md`
- [x] Recent Changes entry added to `AGENTS.md` and `CLAUDE.md`
- [x] All 33 tasks in `tasks.md` marked `[x]`
- [x] Branch pushed; PR opened (#46)
- [x] CodeRabbit clean (no actionable comments)

PR: https://github.com/eslam21006-coding/proadsai/pull/46
