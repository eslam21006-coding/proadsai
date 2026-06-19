# Implementation Plan: Phase 24B — Conditional Copy Fields (Optional Fields Plumbing)

**Branch**: `phase-24-conditional-copy` (spec folder `specs/960-conditional-copy-fields/`) | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/960-conditional-copy-fields/spec.md`

## Summary

Make `subheadText`, `ctaName`, and `benefitText` genuinely optional end-to-end while `hookText` stays mandatory. No decision brain (Phase C). The work closes exactly two gaps: (T20) the backend parser in `functions/src/generators.ts` currently invents `""` / `inputs.cta` defaults for missing fields and cannot tell "intentionally absent" from "failed to parse"; (T19) the step-2 UI in `src/App.tsx` renders all four fields and three per-field regenerate buttons unconditionally.

**Technical approach (from research):**
1. Introduce a canonical **`null` = intentionally-absent** representation for the three optional copy fields (per FR-006), widening the four copy-field interfaces from `string` to `string | null` on those three fields only (`hookText` stays `string`).
2. Add a **separate per-field parse status** (`present | absent | parse_failure`) so absence and failure are distinguishable (FR-007/FR-008). The field value is `null` for both absent and post-degrade failure; the status structure is the thing that distinguishes them and is logged.
3. On an **optional-field parse failure**, retry within the existing `MAX_COPY_FIDELITY_ATTEMPTS` loop, then log (surfaced, not silent) and degrade to `null` so the ad ships (clarification Q1).
4. **Dedup-blanked** optional fields are normalized to `null` instead of `""` and treated as intentionally absent everywhere (clarification Q2).
5. On **missing/unreadable `hookText`**, treat as a generation failure for that variation and retry within existing limits; never render hookless (clarification Q3).
6. Step-2 UI renders only present fields, hides (not disables) per-field regenerate controls for absent fields, keeps Arabic RTL intact for present fields, and offers **no add-field affordance** (clarification Q4). Approve/Edit/AI-Edit/Batch and the Phase 23.A variation carousel operate on whatever fields are present.

Downstream layers (`buildFinalImagePrompt` truthiness conditionals, `validateCopyFidelity` empty-skip, carousel `SHOW_CTA`, `textCompositing` non-empty counting) already tolerate falsy fields; `null` is falsy, so they keep working with targeted null-guards where string methods are called.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (Vite frontend)
**Primary Dependencies**: React 19 + Zustand 4 + Tailwind CSS 3 (frontend); Firebase Cloud Functions v2, Firebase Admin SDK, Firestore (backend). No new dependencies.
**Storage**: Firestore — `generations/{genId}.resolutionTrace` (additive sub-object only; no migration). No schema change to copy fields beyond widening in-memory/transport types.
**Testing**: `cd functions && npm test` (Jest/ts-jest, existing `functions/src/__tests__/*`); frontend has no step-2 test harness today (Vitest available via `npm run` scripts; new tests added under `src/**/__tests__` or `functions/src/__tests__`).
**Target Platform**: Web (Vite SPA) + Firebase Cloud Functions (Node).
**Project Type**: Web application (frontend `src/` + backend `functions/src/`).
**Performance Goals**: No new latency budget. Parse-failure retry MUST reuse the existing `MAX_COPY_FIDELITY_ATTEMPTS` cap (no extra model calls beyond today's retry ceiling) — Constitution VIII (cost discipline).
**Constraints**: No `creativeTextDirector.ts`; no decision tree/scoring; no changes to `captionValidator.ts`, `textCompositing.ts`, `culturalCompliance.ts`; no Phase 23 anti-sameness behavior changes; no frontend hosting deploy. The model is NOT told to omit fields (FR-017) — this is plumbing only.
**Scale/Scope**: Two primary files (`functions/src/generators.ts`, `src/App.tsx`) plus the shared type definitions they depend on (`functions/src/buildPlanSlotMap.ts`, `functions/src/types.ts`, `src/types.ts`, `src/utils/hookVariationParser.ts`) and the `resolutionTrace` plumbing. ~4 hook variations per run; carousel multi-slide already conditional.

**Unknowns**: None remain. All four clarification questions resolved (see spec §Clarifications). The `""`-vs-`null` reconciliation and the parse-failure signal design are resolved in `research.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Relevance | Status |
|---|---|---|
| I. Reliability over feature count | Phase reduces breakage when <4 fields arrive; adds no user-facing feature surface. | ✅ PASS |
| II. Selected mode obeyed | No mode/format selection touched. Present fields render exactly as authored. | ✅ PASS |
| III. Launch surface frozen | No new combinations; Phase 24 is in LAUNCH_MATRIX TODO-Critical. | ✅ PASS |
| IV. Behavior contracts beat judgment | Spec has explicit FRs + acceptance scenarios + SCs; contracts/ formalize parser & UI pass/fail. | ✅ PASS |
| V. Arabic quality first-class | FR-005 + US1 AC4 require RTL intact for present fields; quickstart verifies AR. | ✅ PASS |
| VI. Hidden machine layers auditable | Parse-failure & degrade-to-absent recorded in `resolutionTrace` (additive sub-object). | ✅ PASS — design includes trace |
| VII. No silent override without rule, signal, trace | Degrade-to-absent (Q1) and dedup-blank→null (Q2) are rule-defined, logged, and traced; never silent. | ✅ PASS |
| VIII. Cost discipline | Parse-failure retry reuses existing retry cap; no new model calls. | ✅ PASS |
| IX. Proof for every fix | Tests assert absent-vs-parsefail distinction (FR-016/SC-009); before/after via fixtures. | ✅ PASS |
| X. Spec before code | Spec + clarifications complete before this plan. | ✅ PASS |
| XI. Frontend & backend agree on truth | Both layers adopt the same null-absent + present/absent/failure contract (data-model.md is shared). | ✅ PASS |
| XII. Deferred scope stays deferred | Add-field affordance, decision brain, scoring explicitly deferred to Phase C (FR-004, OOS-001..003). | ✅ PASS |

**Result: PASS (no violations).** One scope note recorded in Complexity Tracking re: the `""`→`null` type widening blast radius — justified by FR-006 and Constitution XI, not a violation.

## Project Structure

### Documentation (this feature)

```text
specs/960-conditional-copy-fields/
├── plan.md              # This file
├── research.md          # Phase 0 output — "" vs null, parse-failure signal, retry/degrade, dedup, hookText
├── data-model.md        # Phase 1 output — tri-state field status + widened copy-field types
├── quickstart.md        # Phase 1 output — manual + automated verification steps
├── contracts/           # Phase 1 output
│   ├── copy-parser.contract.md      # T20 — parser output & status guarantees
│   └── step2-ui.contract.md         # T19 — render/hide/RTL/actions guarantees
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
functions/src/
├── generators.ts            # T20 — resolveOwnedRenderText() (566–623), retry loop (4560–4615),
│                            #       dedup block (5388–5427), buildFinalImagePrompt() (5027–5199),
│                            #       extractCopyFieldsFromResponse() (672–680)
├── buildPlanSlotMap.ts      # validateCopyFidelity() (696–740), CopyFidelityFields (684–689) — null-guard + widen
├── types.ts                 # ClaimFlagEntry (231–235), ResolutionTrace sub-objects — add copyFieldStatus trace
├── resolutionTrace.ts       # TraceBuilder (34–73), persistTrace (270–278) — add setCopyFieldStatus()
└── __tests__/
    ├── copyQuality.test.ts          # extend: absent-vs-parsefail parser tests
    └── conditionalCopyFields.test.ts # NEW — T20 invariant tests (FR-016/SC-009)

src/
├── App.tsx                  # T19 — tov_review (6217–6824): field render (6586/6593/6603–6610),
│                            #       per-field regen buttons (6587/6594/6611), variation carousel (6744–6809),
│                            #       Approve/Edit/AI-Edit/Batch (6630–6665, 4022, 3948, 6849–6898)
├── types.ts                 # TextOverride (358–363), CarouselSlideCopy (365–370), HookVariation (706–714) — widen
└── utils/
    └── hookVariationParser.ts  # parseHookVariations / extractClaimFlags (32–44, 137) — null for absent
```

**Structure Decision**: Existing web-app layout (`src/` frontend + `functions/src/` backend). No new top-level directories. The data-model (field status contract) is shared truth consumed by both layers (Constitution XI); it lives in `data-model.md` and is mirrored in the two `types.ts` files.

## Complexity Tracking

| Item | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Widen 3 optional fields from `string` → `string \| null` across 4+ interfaces (both `types.ts`, `buildPlanSlotMap.ts`, `generators.ts` `OwnedRenderText`) | FR-006 mandates absent = `null`, never `""`. Constitution XI requires both layers to share the representation. | Keeping `""` as the absent marker: rejected because (a) FR-006 explicitly forbids it, and (b) `""` cannot be combined with a status field cleanly without ambiguity. Note: this widening is the main blast-radius cost of the phase and touches every consumer that calls a string method on an optional field — each needs a null-guard. Documented, not a constitution violation. |
| Separate per-field parse-status structure (`present \| absent \| parse_failure`) | The phase's hardest invariant (FR-007/FR-008): `null` alone encodes "no value" but cannot distinguish intentional absence from a logged parse failure. | Encoding failure as a sentinel string (e.g. `"__PARSE_FAILURE__"`): rejected — violates FR-006 (placeholder string) and leaks into render/fidelity layers. |
