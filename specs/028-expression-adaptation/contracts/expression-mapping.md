# Contract: Expression Mapping & Injection (Phase 28)

This is the behavior contract (Constitution IV) for the expression-adaptation feature. It defines required inputs, required output, blocked behaviors, acceptable variation, and fail conditions. Each row is an assertion an automated test or QA pass can verify.

## Contract A — Mapper resolution (`expressionMap.ts`)

**Required input**: a hook angle id (cold) OR a retargeting objection id; or `null`/`null`.

**Required output**: an `ExpressionDirective` (or `null` when both inputs absent).

| # | Given | Then | Type |
|---|-------|------|------|
| A1 | any id in `Object.keys(HOOK_ANGLE_KNOWLEDGE)` (the 10 canonical backend ids; identical to frontend `COLD_HOOK_ANGLES`) | returns non-null directive, `source:"hook"`, non-empty `emotion` + `description` | PASS-required |
| A2 | `pain` | emotion conveys concern/frustration; description mentions NOT anger (quiet suffering) | PASS-required |
| A3 | `emotional` | emotion = empathetic/heartfelt (confirmed default) | PASS-required |
| A4 | `statistics` | emotion = sober/analytical | PASS-required |
| A5 | `scarcity` | emotion = urgent/alert | PASS-required |
| A6 | `logical_authority` | emotion = commanding/assured | PASS-required |
| A7 | `future_based` | emotion = aspirational/hopeful | PASS-required |
| A8 | each of 12 `RETARGETING_OBJECTION_DATA` ids | returns directive, `source:"objection"`, family per data-model | PASS-required |
| A9 | `price_too_high` | analytical & evaluating | PASS-required |
| A10 | `dont_trust` | reassuring & confident | PASS-required |
| A11 | `no_time` | urgent & focused | PASS-required |
| A12 | `overwhelmed` (unmapped family member) | fallback: confident & approachable | PASS-required |
| A13 | unknown non-null id `"zzz_bogus"` | fallback directive (NOT null) | PASS-required |
| A14 | `null` angle and `null` objection | returns `null` | PASS-required |
| A15 | alias `shocking_stat` | resolves same as `statistics` | PASS-required |

## Contract B — Prompt block builder (`buildExpressionDirectionBlock`)

| # | Given | Then | Type |
|---|-------|------|------|
| B1 | any directive | output contains the emotion + description text | PASS-required |
| B2 | any directive | output states identity is priority #1 / must not change bone structure or features | PASS-required |
| B3 | any directive | output instructs blending art-direction character with hook emotion | PASS-required |
| B4 | any directive | output instructs subtle/natural, forbids exaggerated/theatrical | PASS-required |
| B5 | any directive | output contains NO gaze-direction instruction | BLOCKED behavior |
| B6 | `null` directive | builder is not called / emits empty string (no `EXPRESSION DIRECTION:` line) | PASS-required |

## Contract C — Injection into concept generation (`generators.ts`)

| # | Given | Then | Type |
|---|-------|------|------|
| C1 | cold generation with a selected hook angle | `EXPRESSION DIRECTION:` line present in the `[VISUAL ARCHITECT V5.0]` concept prompt | PASS-required |
| C2 | retargeting generation with an objection | line present, driven by `_rtCtx.objectionId` (not the cold angle) | PASS-required |
| C3 | no hook angle and not retargeting (e.g., minimal) | NO `EXPRESSION DIRECTION:` line; prompt identical to pre-Phase-28 | PASS-required |
| C4 | Arabic project | concept field content (`MOOD_EMOTION`) authored in Arabic (guidance instruction may be English) — no English leak into output fields | PASS-required (Constitution V) |
| C5 | before/after selection | new guidance present AND existing before/after block (`struggle`/`confident`) unchanged and not contradicted | PASS-required |
| C6 | batch with per-item hooks | each item's prompt uses that item's hook direction | PASS-required |
| C7 | carousel | all slides use the same direction | PASS-required |
| C8 | hook angle selected but NO reference face uploaded (no Box A) | guidance still emitted; AI-generated hero's expression follows it; trace recorded (FR-013) | PASS-required |

## Contract D — Identity & regression guardrails

| # | Given | Then | Type |
|---|-------|------|------|
| D1 | any generation | face-identity protection rules remain in `TECHNICAL_PROMPT`, unaltered, priority #1 | BLOCKED if changed |
| D2 | full test suite `cd functions && npm test` | zero new failures | PASS-required (SC-006) |
| D3 | `MODEL_PROVIDER=gemini` and `=openai` | both still produce valid generations (provider switch intact) | PASS-required |
| D4 | replaced prompt content | old content commented out, not deleted (reversibility) | PASS-required |

## Contract E — Trace audit (FR-017)

| # | Given | Then | Type |
|---|-------|------|------|
| E1 | generation with a hook angle | `resolutionTrace.expressionAdaptation = { source:"hook", sourceId, emotion, applied:true }` | PASS-required |
| E2 | generation with an objection | `expressionAdaptation.source = "objection"` | PASS-required |
| E3 | generation with no angle/objection | `expressionAdaptation` omitted or `applied:false` | PASS-required |

## Fail conditions (any → contract fail)

- A pain/fear/problem hook produces a smiling hero (success-criteria failure).
- Face identity changes (bone structure/features) relative to the uploaded photo.
- Any `COLD_HOOK_ANGLES` id returns `null` from the mapper.
- English expression text appears in an Arabic output field.
- Existing test suite regresses.
