# Implementation Plan: Blueprint → Long-Form Render Prompt Pipeline

**Branch**: `005-render-prompt-pipeline` | **Date**: 2026-04-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-render-prompt-pipeline/spec.md`

## Summary

Make the blueprint-to-image-prompt pipeline explicit, auditable, and fully fed from all user inputs (Steps 1 and 2). The pipeline is largely implemented — this plan addresses remaining gaps: expanding copy fidelity validation to all 4 copy fields, wiring carousel per-slide prompts, adding a warning banner for retry exhaustion, verifying storage completeness, and expanding regression test coverage.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Gemini 3.1 (text + image), React 19, Zustand, Tailwind CSS 3
**Storage**: Firestore (`generations/{genId}`, `creativeMemory/{creativeId}`)
**Testing**: Node.js assert (contractFixtures.test.ts), `cd functions && npm test`
**Target Platform**: Firebase Functions (Node.js), Vite SPA (browser)
**Project Type**: Web service (backend) + SPA (frontend)
**Performance Goals**: Blueprint generation < 30s, prompt assembly < 100ms (function-local)
**Constraints**: Image model context window limits prompt length; 3 max build plan attempts per generation
**Scale/Scope**: Single-user generations, carousel up to 10 slides

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Reliability Over Feature Count | PASS | No new features — hardening existing pipeline |
| II. Selected Mode Must Be Obeyed | PASS | Core purpose: ensure all mode selections feed the prompt |
| III. Launch Surface Frozen | PASS | Working within approved launch surface |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | Adding explicit copy fidelity pass/fail rules |
| V. Arabic Quality First-Class | PASS | Arabic text validated verbatim via NFC normalization |
| VI. Hidden Machine Layers Must Be Auditable | PASS | Core purpose: resolvedImagePrompt + blueprintText stored per generation |
| VII. No Silent Override | PASS | Warning banner for retry exhaustion; trace for all decisions |
| VIII. Cost Discipline | PASS | Max 2 retries; auto-proceed avoids wasting credits |
| IX. Proof Required for Fix | PASS | Regression tests (FR-011) with before/after evidence |
| X. Spec Before Code | PASS | Spec complete and clarified |
| XI. Frontend and Backend Must Agree | PASS | Frontend strips TECHNICAL_PROMPT; backend validates copy fidelity; both layers enforce same rules |
| XII. Deferred Scope Must Remain Deferred | PASS | Only working on approved scope (tasks 5.1–5.10) |

**All gates pass. No violations to justify.**

## Project Structure

### Documentation (this feature)

```text
specs/005-render-prompt-pipeline/
├── plan.md              # This file
├── research.md          # Phase 0 output (updated 2026-04-10)
├── data-model.md        # Phase 1 output (updated 2026-04-10)
├── quickstart.md        # Phase 1 output (updated 2026-04-10)
├── contracts/           # Phase 1 output
│   └── prompt-assembly.md  # buildFinalImagePrompt() contract (updated 2026-04-10)
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
functions/src/
├── generators.ts          # generateBuildPlan(), buildFinalImagePrompt(), generateFinalAd()
├── buildPlanSlotMap.ts    # parseBuildPlanEnvelope(), validateCopyFidelity(), stripTechnicalPrompt()
├── creativeMemory.ts      # CreativeMemoryRecord with blueprintText, resolvedImagePrompt
├── index.ts               # Cloud Function entry points, retry wiring, Firestore writes
├── contractFixtures.test.ts  # Regression tests (T024-T027 exist, expand coverage)
├── layoutContract.ts      # FullLayoutContract, compileFullContract()
└── knowledge/
    └── offerCreativeModes.ts  # Creative mode catalog

src/
├── App.tsx               # Step 3 UI, "View Blueprint" panel (line 5676), toast system
├── components/
│   └── InputForm.tsx     # Step 1/2 input collection
└── store.ts              # Zustand state
```

**Structure Decision**: No new directories needed. All changes modify existing files within the established `functions/src/` and `src/` structure.

## Implementation Status & Remaining Work

### Already Implemented (verified via codebase research)

| Task | What Exists | File:Line |
|------|-------------|-----------|
| 5.1 | `generateBuildPlan()` injects all Step 1 fields: productName, targetAudience, challenges, transformation, offerType, creative mode, sub-style, hook angle, tone, brand colors | generators.ts:982-3393 |
| 5.2 | hookText/subheadText/ctaName/benefitText injected unconditionally via ownership map | generators.ts:3386, buildPlanSlotMap.ts:27-39 |
| 5.4 | `parseBuildPlanEnvelope()` extracts technicalPrompt as named field via `[[TECHNICAL_PROMPT]]` markers | buildPlanSlotMap.ts:330-338 |
| 5.5 | `buildFinalImagePrompt()` is the sole assembly function with correct delegation | generators.ts:3733-3789 |
| 5.6 | `resolvedImagePrompt` stored in ResolutionTrace (5000 char limit) | generators.ts:3783 |
| 5.7 | "View Blueprint" expandable panel exists in Step 3 UI | App.tsx:5676-5703 |
| 5.8 | `blueprintText` stored in creativeMemory (2000 char limit) | creativeMemory.ts:154 |
| 5.10 (partial) | T024: hookText verbatim, T025: luxury_magazine, T026: retargeting direction, T027: copy fidelity (hookText only) | contractFixtures.test.ts:670-729 |

### Remaining Work (gaps to close)

| Task | Gap | Priority |
|------|-----|----------|
| 5.3 | `validateCopyFidelity()` checks hookText only — must expand to all 4 fields (hookText, subheadText, ctaName, benefitText) | P1 |
| 5.3 | Retry exhaustion must show warning banner with cancel/retry option (not just log) | P1 |
| 5.9 | Carousel per-slide: verify `buildFinalImagePrompt()` called per-slide with correct copy; populate `perSlide` trace array | P2 |
| 5.8 | Verify `blueprintText` + `resolvedImagePrompt` stored in main generation doc (`generations/{genId}`), not only in creativeMemory | P2 |
| 5.7 | Verify TECHNICAL_PROMPT is stripped from user-facing blueprint display in App.tsx | P3 |
| 5.10 | Expand tests: (a) 4-field fidelity validation, (b) carousel per-slide copy isolation, (c) campaign context field presence | P3 |
| 5.1/5.2 | Audit: walk all conditionals in `generateBuildPlan()` to ensure no input is silently dropped in any code path | P3 |

## Complexity Tracking

> No constitution violations to justify. All gates pass.

## Post-Design Constitution Re-Check

| Principle | Status |
|-----------|--------|
| I–XII | All PASS — no design decisions introduced complexity or scope beyond approved work |
