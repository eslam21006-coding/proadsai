# Phase 0 Research: Expression Adaptation (Phase 28)

All Technical Context items are resolved (no NEEDS CLARIFICATION remain — the spec's 2026-06-23 clarifications fixed both the mapping defaults and the mechanism). This document records the design decisions and the code evidence behind them.

## Decision 1 — Injection point: concept-generation prompt, not TECHNICAL_PROMPT

- **Decision**: Emit one `EXPRESSION DIRECTION:` line into the `[VISUAL ARCHITECT V5.0]` concept prompt in `generators.ts` (~line 3097), immediately alongside the existing `MOOD DIRECTION: ${getAdToneVisualMood(inputs.adTone)}` line (line 3103). The hook angle is already resolved there as `_effectiveColdHookAngle` (line 3095: `_rtCtx.isRetargeting ? null : inputs.coldHookAngle`) and the retargeting objection as `_rtCtx.objectionId` (via `buildNormalizedRetargetingContext`, line 3093).
- **Rationale**: This is the single shared prompt builder for the concepts whose 7 fields (`SUBJECT_ACTION, ENVIRONMENT_DESC, MOOD_EMOTION, LIGHTING_LOGIC, TEXT_LAYOUT, BUTTON_POSITION, BRANDING_LOGIC`) are later synthesized into the `TECHNICAL_PROMPT` (synthesis step at ~line 4398, "Synthesize this raw concept into a technical rendering blueprint"). Injecting here makes the emotion flow naturally into `MOOD_EMOTION`/`SUBJECT_ACTION` and downstream into the technical prompt — exactly the architecture the product owner specified. Single/carousel/batch all route through this builder, so one edit covers all paths.
- **Alternatives considered**:
  - *Rigid block in TECHNICAL_PROMPT after identity rules* (original request) — **rejected** by clarification: brittle, one fixed expression per hook, fights the blueprint and art-direction fields.
  - *Editing each per-art-direction `MOOD_EMOTION` default block (lines 4076–4091)* — rejected: there are many substyle branches; duplicating the mapping across them is unmaintainable and contradicts "art direction blocks stay unchanged" (FR keeps pose/art-direction blocks intact).

## Decision 2 — Mapper as a pure module modeled on existing patterns

- **Decision**: New `functions/src/expressionMap.ts` exporting: `getHookExpressionDirection(angle: string | null): ExpressionDirective | null`, `getObjectionExpressionDirection(objectionId: string | null): ExpressionDirective | null`, and `buildExpressionDirectionBlock(directive, opts): string`. Data is a static record keyed by canonical angle ID.
- **Rationale**: Mirrors `culturalCompliance.ts` (centralized block + helpers) and `retargetingObjections.ts` (static data + lookup helpers). Pure functions are trivially unit-testable (Constitution IV) and reversible.
- **Alternatives**: Inline `switch` inside `generators.ts` — rejected (untestable in isolation, clutters the 8k-line file).

## Decision 3 — Canonical angle IDs and the 5 confirmed defaults

- **Decision**: Map the **actual** `COLD_HOOK_ANGLES` IDs from `src/constants.ts`: `emotional, pain, curiosity, logic, social_proof, urgency, statistics, scarcity, logical_authority, future_based`. Confirmed defaults for the 5 absent from the original request: `emotional`→empathetic/heartfelt; `statistics`→sober/analytical; `scarcity`→urgent/alert; `logical_authority`→commanding/assured; `future_based`→aspirational/hopeful (Clarifications 2026-06-23, FR-005).
- **Rationale**: The original request and `LAUNCH_MATRIX` named angles (`aspiration/fear/authority/contrast/story`) that do not exist as IDs; mapping the real IDs guarantees no selectable angle is unmapped (SC-003).
- **Evidence**: `src/constants.ts:108` `COLD_HOOK_ANGLES`. Note `generators.ts` also references a few non-catalog ids defensively (`shocking_stat`, `fear_of_missing_out`, `future_pacing`) at lines 2323–2334 — the mapper SHOULD include aliases for these so the lookup never returns null for a real run; unknown ids fall back to a defined default (see Decision 5).

## Decision 4 — Retargeting objection → expression families

- **Decision**: Map by family (FR-006): price/budget/payment (`price_too_high, no_budget_now, need_installments`) → analytical & evaluating; trust/been-burned/tried-before (`dont_trust, tried_before_failed, will_it_work_for_me`) → reassuring & confident; timing/no-time/not-ready (`no_time, not_ready_yet`) → urgent & focused; all others (`overwhelmed, need_approval, dont_want_call, dont_need_it`) → confident & approachable (fallback).
- **Rationale**: Retargeting uses objections, not cold angles (`generators.ts:3095` sets `_effectiveColdHookAngle = null` when retargeting; objection id available as `_rtCtx.objectionId`). Family grouping keeps the table small and covers all 12 `RETARGETING_OBJECTION_DATA` ids.
- **Evidence**: `functions/src/retargetingObjections.ts` (12 objections across 3 blame layers).

## Decision 5 — Absent / fallback handling

- **Decision**: `null` hook angle AND `null` objection (e.g., minimal mode, or angle not selected) → return `null`; no `EXPRESSION DIRECTION:` line is emitted and behavior is unchanged from today (FR-007). An unrecognized but non-null angle id → defined fallback direction (confident/approachable) rather than null, so a real generation is never left without guidance.
- **Rationale**: `null` is the project's canonical absent sentinel. Preserves current behavior when nothing is selected; defends against id drift.

## Decision 6 — Art-direction blending & subtlety

- **Decision**: The `buildExpressionDirectionBlock` text instructs Gemini to (a) treat the emotional direction as the **emotion**, (b) keep the art direction's **character/style** (which Gemini is already authoring into `MOOD_EMOTION`), producing a blend like "powerful concern" (FR-008), and (c) keep expressions **subtle and natural, not theatrical** (FR-009), and (d) NOT alter identity or introduce gaze instructions (FR-004, FR-014).
- **Rationale**: Matches the launch-matrix note ("subtle and natural — not exaggerated") and avoids fighting existing art-direction `MOOD_EMOTION` defaults (lines 4076–4091).

## Decision 7 — Before/after reinforcement

- **Decision**: For before/after selections, the guidance reinforces the existing rule (BEFORE = hook/problem emotion, AFTER = aspirational/confident) without contradiction (FR-010). The existing before/after block already states "BEFORE half: hero ... struggle expression. AFTER half: same hero ... confident expression" (`generators.ts:3118`) and the before/after `MOOD_EMOTION` templates (lines 4044, 4060). The mapper's pain/problem direction aligns with "struggle"; no rewrite of the before/after block.
- **Rationale**: Keep the working before/after composition; only ensure the new guidance is consistent (Constitution II/III — don't break the frozen launch behavior).

## Decision 8 — Trace shape (FR-017, additive)

- **Decision**: Add optional `expressionAdaptation?: { source: "hook" | "objection"; sourceId: string; emotion: string; applied: boolean }` to `ResolutionTrace` (`generators.ts:5135`), mirror in `types.ts` `ResolutionTrace`, and mirror the documented interface in `docs/LAUNCH_MATRIX.md` (~line 798). Populate in the concept-generation trace assembly path. `applied:false` (or absent) when no direction was emitted.
- **Rationale**: Constitution VI (auditable) + SC-003 verifiability. Additive optional field → no migration, matches how `culturalViolation`, `modeComposition`, `sizeVariantTrace`, `copyDiversity` were added.

## Decision 9 — Testing approach

- **Decision**: `functions/src/expressionMap.test.ts` asserts: every `COLD_HOOK_ANGLES` id returns a non-null directive with a non-empty emotion + description; the 5 confirmed defaults map as specified; each of the 12 retargeting objection ids maps to the correct family; unknown id → fallback; `null` → `null`; `buildExpressionDirectionBlock` output contains the identity-priority + subtle + blend language. Plus a guard test that the existing suites still pass (`cd functions && npm test`).
- **Rationale**: Pure mapper is fully unit-testable; satisfies Constitution IV and SC-006 (zero regressions).
