# Implementation Plan: Phase 23 — Conditional Copy Structure, Anti-Sameness & Variation Carousel

**Branch**: `959-copy-structure-variation` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/959-copy-structure-variation/spec.md`

## Summary

Phase 23 adds variation structure and cross-project diversity on top of the already-shipped Phase 22 copy-quality rules, in one PR with three sub-tracks:

- **23.A — In-card variation carousel.** Replace the current "Generate 4 More Like This" behavior (which string-concatenates 4 new hooks onto the bottom of `tovText`) with a per-card variation carousel: reference hook at position 1, new variations at positions 2–5, extendable to a 12 cap, navigated by arrows + dots, RTL-aware. Approve / Edit / AI Edit / Batch act on the displayed variation. Variations share the reference hook's resolved angle, obey all Phase 22 rules, use genuinely different wording, and are deduped against the whole set.
- **23.B — Single-hook anti-sameness.** Convert each angle's fixed-4 dimension blueprint (`ANGLE_VARIATION_BLUEPRINTS`) into a pool of 6–8 dimensions (preserving every word of existing psychology + Arabic phrasing), draw 4-of-N rotated per project, rotate which of the 7 existing opening structures are used, and bias-but-never-ban against the user's most-recent-~10-projects fingerprints stored in `creativeMemory.ts`. The locked angle is never touched; temperature is unchanged.
- **23.C — Carousel anti-sameness.** Draw the 4 carousel story-direction picker cards as 4-of-7 from the existing spec-001 angle sets (rotated + memory-biased per project, instead of always the first-4 families), and rotate middle-slide angle order (instead of `pool[i % pool.length]`) while preserving all slide-plan invariants. Code (`generators.ts` + `slidePlanEngine.ts`), the spec-001 contract (`carousel-slide-count-plan.md`), and the reference's carousel section change together.

The work is grounded in the existing `tovText` string model, the inline hook-card rendering in `App.tsx`, and the existing (but unwired) `slidePlanEngine.ts`.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Admin SDK, Firestore; React 19, Zustand 4, Tailwind CSS 3, Vite 7; Gemini (text/copy generation — unchanged); OpenAI gpt-image-2 for visuals (unchanged, gated by `MODEL_PROVIDER`)
**Storage**: Firestore — `creativeMemory/{creativeId}` and `creativePatterns/{userId}/indexes/{indexKey}` (extended additively with anti-repetition fingerprints); no schema migration; frontend `tovText` string + new per-card variation state in the Zustand store
**Testing**: `cd functions && npm run test:contracts` (plain Node.js contract fixture runner in `functions/src/__tests__/`; new files must be registered in `functions/package.json` `test:contracts` chain because the runner stays manual); new unit tests for the dimension-pool drawer, opening rotation, fingerprint memory bias, and the rotated slide-plan engine
**Target Platform**: Web (Vite SPA frontend + Firebase Functions v2 backend)
**Project Type**: Web application (React frontend `src/` + Firebase Functions backend `functions/src/`)
**Performance Goals**: No added model calls beyond the existing one-call-per-"Generate 4 More" path; pool draw, rotation, and fingerprint bias are pure in-memory functions (microsecond cost); one extra Firestore read (recent fingerprints) per generation, bounded to ~10 records
**Constraints**: No temperature change (FR-018); no field-count change (FR-032); no change to the copy-fidelity gate / compositor / `textCompositing.ts` (FR-030); scoring/rewrite constants stay inert (FR-031); `MODEL_PROVIDER` revert switch and commented-out Gemini/Sharp code preserved (FR-025, FR-026); GCC/Meta + cultural-compliance guards untouched (FR-024, FR-027); no new Step-2 dropdowns beyond the in-card carousel (FR-028); no `creativeTextDirector.ts` (FR-029); no frontend hosting deploy (FR-033)
**Scale/Scope**: Per-user generation flow; anti-repetition memory bounded to ~10 recent projects per angle per user; variation carousel capped at 12 positions per card

**Resolved unknowns** (see research.md): variation cap = 12; credit = unchanged `refreshHooks` cost, partial OK; zero-result = non-blocking notice, card unchanged; carousel pool = existing 7-angle sets, draw 4-of-7; memory window = recent ~10 projects per angle. No remaining NEEDS CLARIFICATION.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|---|---|---|
| I. Reliability Over Feature Count | Adds diversity/variation on a frozen launch surface; bias-never-ban guarantees generation never starves; no new risky modes. | ✅ Pass |
| II. The Selected Mode MUST Be Obeyed | **Central guarantee.** The user-selected hook angle stays locked exactly as current code enforces (FR-012); only dimensions/openings within it diversify. Carousel invariants preserved (FR-021). | ✅ Pass |
| III. Launch Surface Is Frozen | No new lanes/combinations; reuses existing angle sets and the committed spec-001 contract; carousel pool reuses the 7-angle sets (no new taxonomy). | ✅ Pass |
| IV. Behavior Contracts Beat Subjective Judgment | Spec has 33 FRs + 11 measurable SCs + edge cases; new contracts in `contracts/` give pass/fail rules for pool draw, rotation, memory bias, slide-plan rotation, and variation-carousel state. | ✅ Pass |
| V. Arabic Quality Is First-Class | RTL carousel navigation (FR-007), Arabic dimension phrasing preserved verbatim (FR-013), cultural-compliance blocks intact (FR-027). | ✅ Pass |
| VI. Hidden Machine Layers MUST Be Auditable | Dimension draw, opening rotation, and memory bias decisions recorded to a `resolutionTrace.copyDiversity` sub-object (additive) and the fingerprint written to `creativeMemory`. | ✅ Pass |
| VII. No Silent Override Without Rule, Signal, Trace | Cap-reached and zero-result are user-signaled (FR-006, FR-006b) and traced; memory bias is rule-defined and traced. | ✅ Pass |
| VIII. Cost Discipline | No extra model calls; pure-function rotation; one bounded Firestore read; cap prevents runaway variation generation; no credit on refused/zero-result. | ✅ Pass |
| IX. Proof Is Required for Every Claimed Fix | Each sub-track ships with unit tests + before/after evidence (quickstart.md QA scenarios mapped to SCs). | ✅ Pass |
| X. Spec Before Code | Spec + clarifications complete; this plan precedes implementation. | ✅ Pass |
| XI. Frontend and Backend MUST Agree | 23.A spans store + inline card UI (frontend) and the `serverGenerateTOV('refresh')` / `serverGenerateCarouselAngles` callables (backend); the "same angle + dedupe" contract enforced on the backend, surfaced on the frontend. | ✅ Pass |
| XII. Deferred Scope MUST Remain Deferred | Conditional field-count, `creativeTextDirector.ts`, and the scoring/rewrite loop are explicitly excluded (FR-029, FR-031, FR-032). | ✅ Pass |

**Result: PASS.** No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/959-copy-structure-variation/
├── plan.md              # This file
├── spec.md              # Feature spec (+ Clarifications)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output (QA scenarios mapped to SCs)
├── contracts/           # Phase 1 output
│   ├── variation-carousel-state.md      # 23.A in-card carousel state + actions
│   ├── hook-dimension-pool.md           # 23.B pool draw + opening rotation
│   ├── anti-repetition-memory.md        # 23.B creativeMemory fingerprint bias
│   └── carousel-angle-rotation.md       # 23.C picker pool draw + middle-slide rotation
├── checklists/
│   └── requirements.md  # from /speckit.specify
└── tasks.md             # /speckit.tasks output (NOT created here)
```

### Source Code (repository root)

```text
functions/src/
├── knowledge/
│   └── hookAnglesKnowledge.ts     # 23.B: ANGLE_VARIATION_BLUEPRINTS fixed-4 → 6–8 pool; ANGLE_HARD_RULES untouched
├── generators.ts                  # 23.A backend variation prompt (same angle + dedupe);
│                                  #   23.B getAngleVariationBlueprint → pool drawer + opening rotation (~L2053, L2284-2291);
│                                  #   23.C generateCarouselAngles 4-of-7 rotation (~L7203)
├── slidePlanEngine.ts             # 23.C: buildSlidePlan middle-slide rotation (pool[i%len] → rotated); wire it in
├── creativeMemory.ts              # 23.B/23.C: record + retrieve angle/dimension/opening fingerprints (recent ~10)
├── copyDiversity.ts               # NEW: pure helpers — drawDimensions(), rotateOpenings(), biasByMemory(), rotateCarouselAngles()
├── copywriting_knowledge.ts       # untouched (Phase 22 constants; scoring/rewrite stay inert)
├── captionValidator.ts            # untouched (GCC/Meta guards preserved)
├── buildPlanSlotMap.ts            # untouched (validateCopyFidelity preserved)
├── modelConfig.ts                 # untouched (MODEL_PROVIDER revert switch preserved)
└── __tests__/
    ├── copyDiversity.test.ts          # NEW: pool draw, opening rotation, memory bias determinism
    ├── slidePlanRotation.test.ts      # NEW: rotated middle-slide invariants
    └── (existing copyQuality / contractFixtures tests stay green)

src/
├── App.tsx                        # 23.A: hook-card rendering (~L6420-6683) → in-card carousel;
│                                  #   "Generate 4 More" handler (~L6628-6668) stops string-concat, populates per-card variations;
│                                  #   Approve/Edit/AI Edit/Batch read active variation; RTL arrows (reuse lightbox pattern ~L9091)
├── store.ts                       # 23.A: add per-card variation carousel state (Map keyed by variant) + active-index + cap flag
└── services/geminiService.ts      # untouched call signatures (serverGenerateTOV 'refresh' / serverGenerateCarouselAngles)
```

**Structure Decision**: Existing web-app layout (`src/` frontend + `functions/src/` backend). 23.A is frontend-heavy (store + inline `App.tsx` card UI) plus a backend prompt tightening. 23.B and 23.C are backend-only diversity logic, extracted into a new pure-function module `copyDiversity.ts` so rotation/bias are unit-testable in isolation and the monolithic `generators.ts` only gains call-sites. `slidePlanEngine.ts` (already present but unwired) is extended and wired in for 23.C(b).

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
