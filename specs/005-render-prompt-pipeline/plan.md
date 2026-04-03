# Implementation Plan: Blueprint → Long-Form Render Prompt Pipeline

**Branch**: `005-render-prompt-pipeline` | **Date**: 2026-04-02 | **Spec**: [spec.md](./spec.md)
**Input**: Phase 5 from LAUNCH_MATRIX.md Section 14 (tasks 5.1–5.10)

## Summary

Make the pipeline from Step 3 blueprint to image model prompt explicit, auditable, and fully fed from all user inputs. Three core changes: (1) audit and fix input injection gaps in `generateBuildPlan()`, (2) extract a dedicated `buildFinalImagePrompt()` function from inline assembly, (3) add copy text fidelity validation with auto-retry. Store the final prompt in the resolution trace for debugging. Surface the blueprint to users in Step 3 while hiding the technical prompt.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Gemini 3.1 (text + image), React 19
**Storage**: Firestore (`generations/{genId}` documents, `creativeMemory` collection)
**Testing**: Contract fixtures (`npm run test:contracts`)
**Target Platform**: Web — Firebase Hosting + Cloud Functions
**Project Type**: SaaS web application
**Performance Goals**: Build plan validation + retry adds ≤30s to generation time (within existing 300s timeout)
**Constraints**: Copy fidelity check is substring match — no fuzzy matching. Max 2 rebuild retries. Optional inputs omitted when absent (no placeholders).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Reliability Over Feature Count | PASS | This feature improves reliability of existing rendering — no new modes or combinations added |
| II. Selected Mode MUST Be Obeyed | PASS | Core goal: ensure all user selections feed the render prompt |
| III. Launch Surface Is Frozen | PASS | No new launch surface — hardening the existing pipeline |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | Adds explicit copy fidelity contract with pass/fail rules |
| V. Arabic Quality Is First-Class | PASS | Copy fidelity check works on Arabic text (exact substring match) |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | Core goal: `resolvedImagePrompt` stored in trace for every generation |
| VII. No Silent Override | PASS | Build plan fidelity failure produces user-visible error + retry |
| VIII. Cost Discipline | PASS | Max 2 retries bounded; no wasteful generation |
| IX. Proof Required for Fix | PASS | Regression tests prove the prompt assembly works |
| X. Spec Before Code | PASS | This plan + spec precedes implementation |
| XI. Frontend/Backend Must Agree | PASS | Blueprint displayed in frontend; technical prompt stays server-side |
| XII. Deferred Scope Stays Deferred | PASS | No deferred features reintroduced |

**Post-design re-check**: All principles still PASS. The `buildFinalImagePrompt()` function centralizes assembly (Principle VI), the copy fidelity contract adds explicit pass/fail rules (Principle IV), and optional input handling avoids placeholder injection (Principle II).

## Key Design Decisions

### Prompt Assembly Centralization

**Decision**: Extract inline prompt assembly from `generateFinalAd()` into a standalone `buildFinalImagePrompt()` function.

**Rationale**: Currently ~200 lines of inline assembly in `generateFinalAd()`. A single function makes the prompt auditable (Constitution VI), testable in isolation (FR-011), and prevents assembly drift (FR-006).

**Alternative rejected**: Keeping inline assembly + adding logging — still fragile, still untestable, violates FR-006.

### Copy Fidelity as Substring Match

**Decision**: Validate hookText presence via `technicalPrompt.includes(hookText.trim())`.

**Rationale**: Both strings originate from the same pipeline — no encoding mismatch. Simple, deterministic, zero false positives. Arabic text matches correctly since no re-encoding occurs between Step 2 approval and build plan generation.

**Alternative rejected**: Fuzzy/edit-distance matching — adds complexity, false positives, undermines the "verbatim" guarantee.

### TECHNICAL_PROMPT Marker Extraction

**Decision**: Extend the existing `[[PROADS_MACHINE_PLAN_V1]]` marker pattern with a new `[[TECHNICAL_PROMPT]]..[[/TECHNICAL_PROMPT]]` marker pair in the build plan output.

**Rationale**: Consistent with existing parsing architecture in `parseBuildPlanEnvelope()`. Named extraction is safer than regex substring search.

### Storage Truncation for Prompts

**Decision**: Store `blueprintText` (truncated to 2000 chars) and `resolvedImagePrompt` (truncated to 5000 chars) in `CreativeMemoryRecord` for debugging.

**Rationale**: Full prompts can be 10K+ characters. Truncation controls Firestore storage costs while preserving enough context for debugging. The resolution trace stores the full untruncated prompt.

## Project Structure

### Documentation (this feature)

```text
specs/005-render-prompt-pipeline/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity extensions
├── quickstart.md        # Developer quickstart
├── contracts/
│   └── prompt-assembly.md  # buildFinalImagePrompt() contract
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (modified files)

```text
functions/src/
├── generators.ts              # Audit generateBuildPlan(); extract buildFinalImagePrompt(); add retry logic
├── buildPlanSlotMap.ts        # Add technicalPrompt extraction; add copy fidelity validation
├── index.ts                   # Wire retry logic; store blueprintText + resolvedImagePrompt
├── creativeMemory.ts          # Add blueprintText + resolvedImagePrompt fields
├── contractFixtures.test.ts   # Add prompt assembly regression tests

src/
├── App.tsx                    # Add "View Blueprint" panel in Step 3; handle retry UI
```

## Complexity Tracking

No constitution violations to justify — all principles PASS.
