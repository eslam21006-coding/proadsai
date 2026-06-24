# Phase 28 — Expression Adaptation — Audit Report

**Branch**: `phase-28-expression-adaptation` · **PR**: #46 · **Date**: 2026-06-24
**Auditor**: Claude (strict, code-evidence based)
**Files audited**: `functions/src/expressionMap.ts`, `functions/src/__tests__/expressionMap.test.ts`, `functions/src/generators.ts` (injection + trace), `functions/src/types.ts`

---

## Mapper (6)

- [PASS] #1 — `getHookExpressionDirection()` covers all 10 cold hook angles from `HOOK_ANGLE_KNOWLEDGE`, not frontend `src/constants.ts` — evidence: `functions/src/expressionMap.ts:41-82` (10 canonical keys), explicit "NOT imported here" note `functions/src/expressionMap.ts:29-32`; test iterates `Object.keys(HOOK_ANGLE_KNOWLEDGE)` `functions/src/__tests__/expressionMap.test.ts:54-71`.
- [PASS] #2 — Each of the 10 angles returns a distinct emotion label + physical description; subtlety is carried in the descriptions ("slight", "quiet", "soft", "composed") and reinforced by the block builder — evidence: `functions/src/expressionMap.ts:42-81`.
- [PASS] #3 — Retargeting objections mapped by family (price / trust / timing + fallback) — evidence: `functions/src/expressionMap.ts:134-136` (id sets), `:156-173` (family directives + fallback).
- [PASS] #4 — Unrecognized angle ID → confident/approachable fallback, never crash/null — evidence: `functions/src/expressionMap.ts:103-106` (fallback const), `:124-125` (returned for non-canonical id).
- [PASS] #5 — No angle / null / empty input → returns `null` (no-op signal) — evidence: `functions/src/expressionMap.ts:115-117` (hook), `:151-153` (objection).
- [PASS] #6 — `buildExpressionDirectionBlock` produces a well-formed text block (label + emotion + description + clauses; `''` for null) — evidence: `functions/src/expressionMap.ts:208-233`.

## Injection point (5)

- [PASS] #7 — Expression guidance is injected into the GEMINI concept-generation prompt (`[VISUAL ARCHITECT V5.0]`, inside `generateConcepts`), NOT the OpenAI TECHNICAL_PROMPT — evidence: `functions/src/generators.ts:3125-3132` (prompt header + emitted block); `generateConcepts` declared `functions/src/generators.ts:2917`.
- [FAIL] #8 — Guidance should appear AFTER hero/environment/universe description. **Found**: the `EXPRESSION DIRECTION` line is emitted in the prompt **preamble** at `functions/src/generators.ts:3132`, immediately after `LANGUAGE MANDATE`/`MOOD DIRECTION` and **before** the creative-mode/hero block (`:3134+`) and before the concept output template that contains `SUBJECT_ACTION`/`ENVIRONMENT_DESC`/universe (`:4068+`, env at `:4089`). **Expected**: placed after the hero/environment/universe description. Placement is the opposite of the criterion.
- [FAIL] #9 — Guidance must instruct Gemini to reflect the expression in the `MOOD_EMOTION` and `SUBJECT_ACTION` fields. **Found**: the block builder text contains the emotion, description, identity clause, blend clause, and subtlety clause but **never references `MOOD_EMOTION` or `SUBJECT_ACTION`** (`functions/src/expressionMap.ts:214-232`); the injection site adds no such instruction (`functions/src/generators.ts:3132`). The design relies on Gemini *implicitly* placing the emotion — there is no explicit field-routing instruction. **Expected**: explicit "reflect this in MOOD_EMOTION and SUBJECT_ACTION".
- [PASS] #10 — Art-direction blending rule present (art direction = CHARACTER/STYLE/ENERGY, hook = EMOTION, blend them; "powerful concern" example) — evidence: `functions/src/expressionMap.ts:224-228`.
- [PASS] #11 — Subtlety clause present ("Keep the expression SUBTLE and NATURAL — never exaggerated, theatrical, or caricatured") — evidence: `functions/src/expressionMap.ts:229-231`.

## Trace (3)

- [PASS] #12 — `resolutionTrace.expressionAdaptation` is written with `source`, `sourceId`, `emotion`, `applied` — evidence: `functions/src/generators.ts:3116-3121`; interface `functions/src/generators.ts:5202-5207`, mirror `functions/src/types.ts:405-409`. **Note (naming)**: the criterion names `hookAngle`/`resolvedEmotion`; the implementation uses `sourceId`/`emotion` (semantically equivalent — `sourceId` carries the angle/objection id, `emotion` carries the resolved emotion). `source` and `applied` match exactly. All four data points are captured.
- [FAIL] #13 — Trace must record `applied:false` **with a reason** when no hook angle is present. **Found**: when `_exprDirective` is null the code writes **nothing** — the `if (_exprDirective)` block is only entered on a truthy directive and there is **no `else`** that records `applied:false` (`functions/src/generators.ts:3113-3123`). Additionally, the `expressionAdaptation` type has **no `reason` field** at all (`functions/src/generators.ts:5202-5207`, `functions/src/types.ts:405-409`). The "no hook" case is signalled only by omission. **Expected**: an explicit `{ applied:false, reason:... }` record.
- [PASS] #14 — Trace records `applied:true` with the fallback emotion for unrecognized angles — evidence: unrecognized id yields a truthy fallback directive (`functions/src/expressionMap.ts:124-125`), so the trace block runs with `applied:true` and `emotion:"confident, approachable"` (`functions/src/generators.ts:3113-3121`).

## Edge cases (3)

- [FAIL] #15 — Before/after: BEFORE must use the hook expression, AFTER must use the aspirational/`future_based` expression. **Found**: there is **no before/after-aware expression logic** in Phase 28. `_exprDirective` is computed unconditionally from the hook angle (`functions/src/generators.ts:3103-3106`) and emitted as a **single global** `EXPRESSION DIRECTION` line — it is **not partitioned into BEFORE vs AFTER**. The BEFORE=struggle / AFTER=confident text at `functions/src/generators.ts:3147` is the **pre-existing** block (not driven by the hook mapping, and unchanged by this PR). For a problem-oriented hook (e.g. pain → "concern, frustration") the global directive can even **contradict** the AFTER=confident half. **Expected**: split logic mapping BEFORE→hook emotion, AFTER→aspirational.
- [PASS] #16 — No uploaded face (no Box A): expression guidance still applies. The injection is unconditional on reference-photo presence (`functions/src/generators.ts:3132`) and the mapper takes only an id (`functions/src/expressionMap.ts:114,150`) — independent of Box A. Test C8: `functions/src/__tests__/expressionMap.test.ts:303-320`.
- [FAIL] #17 — Carousel must use the same expression across slides; batch must use per-item expression. **Found**: the injection exists at exactly **one site**, inside `generateConcepts` (`functions/src/generators.ts:3132`). The **carousel callable does NOT call `generateConcepts`** — it uses `generateCarouselAngles` (`functions/src/index.ts:4578`) and `generateCarouselSlideCopies` (`functions/src/index.ts:4611`), and slides render via `generateFinalAd` from a pre-built `buildPlan` (`functions/src/generators.ts:5457` param; carousel/batch route through `generateFinalAd` per `functions/src/generators.ts:6873`). `generateFinalAd` does **not** regenerate concepts. Therefore **carousel slides never receive the EXPRESSION DIRECTION guidance** — the "same expression across slides" behavior is not delivered (no expression is injected for carousel at all). The test (`functions/src/__tests__/expressionMap.test.ts:277-290`) only asserts `injectionCount === 1` and that `generateConcepts` exists; it does **not** prove carousel/batch route through it (the "carousel and batch both call generateConcepts" claim at `:281-282` is an unverified comment).

## No regressions (3)

- [PASS] #18 — Face identity protection rules in TECHNICAL_PROMPT are untouched. `git diff origin/main...HEAD -- functions/src/generators.ts` shows **+42 additions, 0 deletions** (no lines removed/moved); Box A face-identity rules remain intact, e.g. `functions/src/generators.ts:3038`, `:3412-3442` ("Box A = face reference ONLY"), `:3337`.
- [PASS] #19 — Phase 17 variant path `functions/src/sizeVariant.ts` is NOT modified — evidence: file absent from `git diff --stat origin/main...HEAD` (changed set is generators.ts, expressionMap.ts, types.ts, test, docs, specs only).
- [PASS] #20 — All existing suites pass (`cd functions && npm test`, exit code 0): culturalCompliance **929**, copyQuality **71**, copyStructure **206**, conditionalCopyFields **77**, sizeVariant **51**, expressionMap **188** (+ modeFormat, languageQuality, workspace, creativeResolverParity, contractFixtures all PASS).

---

## Summary

**15/20 PASS, 5/20 FAIL**

| # | Criterion | Result |
|---|-----------|--------|
| 1 | All 10 angles from HOOK_ANGLE_KNOWLEDGE | PASS |
| 2 | Distinct emotion + description per angle | PASS |
| 3 | Retargeting families mapped | PASS |
| 4 | Unknown ID → fallback | PASS |
| 5 | Null input → null | PASS |
| 6 | Block builder well-formed | PASS |
| 7 | Injected into Gemini concept prompt (not OpenAI) | PASS |
| 8 | Guidance AFTER hero/env/universe description | **FAIL** |
| 9 | Instructs reflecting in MOOD_EMOTION + SUBJECT_ACTION | **FAIL** |
| 10 | Art-direction blending rule | PASS |
| 11 | Subtlety clause | PASS |
| 12 | Trace has source/angle/emotion/applied | PASS (field naming differs) |
| 13 | Trace `applied:false` + reason when no hook | **FAIL** |
| 14 | Trace `applied:true` + fallback emotion for unknown | PASS |
| 15 | Before/after: BEFORE=hook, AFTER=aspirational | **FAIL** |
| 16 | No Box A → guidance still applies | PASS |
| 17 | Carousel same / batch per-item | **FAIL** |
| 18 | Identity protection untouched | PASS |
| 19 | sizeVariant.ts unmodified | PASS |
| 20 | All existing suites pass | PASS |

## Verdict: **FAIL** (15/20 — requires 20/20)

### Blocking issues (must fix before merge)

1. **#17 (most severe) — Carousel is entirely uncovered.** The expression guidance lives only in `generateConcepts`, which the carousel path never calls (`generateCarouselAngles`/`generateCarouselSlideCopies` → `generateFinalAd`). FR-011 (carousel same expression) is not delivered. Batch coverage is also unverified by the same reasoning (it depends on the batch orchestration calling `generateConcepts` per item — not proven in code). The passing test gives false confidence: it asserts a single injection site but not that carousel/batch reach it.
2. **#9 — No explicit MOOD_EMOTION/SUBJECT_ACTION routing.** The block never tells Gemini where to apply the emotion; the architecture's core claim (emotion flows via those fields) is not instructed, only hoped for.
3. **#15 — Before/after not split.** A single global directive is emitted; it is not partitioned BEFORE=hook / AFTER=aspirational and can contradict the pre-existing AFTER=confident half. FR-010 not delivered.
4. **#8 — Placement is preamble, not after the scene description.** Contradicts the criterion's required ordering.
5. **#13 — No `applied:false`/reason trace path** (and no `reason` field in the type). The "no hook" case is recorded only by omission.

### Note on task status
`tasks.md` shows T023 (before/after), T025 (carousel/batch verification), and T033 marked complete, but the audit shows the corresponding behaviors (#15, #17) are not actually delivered — those tasks were closed without enforcing the behavior in code (the verification tasks relied on a test that does not exercise the carousel/batch render paths).
