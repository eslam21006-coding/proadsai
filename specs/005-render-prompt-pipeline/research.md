# Research: Blueprint → Long-Form Render Prompt Pipeline

**Date**: 2026-04-10 (updated) | **Branch**: `005-render-prompt-pipeline`

## R1: Current Implementation State

**Decision**: The pipeline is partially implemented. Focus work on gaps, not rewrites.

**Findings**: Codebase research reveals significant existing infrastructure:

| Component | File:Line | Status |
|-----------|-----------|--------|
| `generateBuildPlan()` | generators.ts:3296 | EXISTS — Step 1 inputs injected (productName:982, targetAudience:989, challenges:990, transformation:991, offerType:3352, creative mode, sub-style, hook angle, tone, brand colors:3393) |
| `buildFinalImagePrompt()` | generators.ts:3733 | EXISTS — single assembly function returning `{ textPrompt, imageParts, trace }` |
| `parseBuildPlanEnvelope()` | buildPlanSlotMap.ts:330 | EXISTS — extracts `technicalPrompt` via `[[TECHNICAL_PROMPT]]` markers as named field |
| `validateCopyFidelity()` | buildPlanSlotMap.ts:545 | EXISTS — **checks hookText ONLY** via NFC normalization |
| `stripTechnicalPrompt()` | buildPlanSlotMap.ts:551 | EXISTS — strips `[[TECHNICAL_PROMPT]]` markers for user-facing display |
| `ResolutionTrace` | generators.ts:3782 | EXISTS — `resolvedImagePrompt` (5000 chars), `blueprintText` (2000 chars), `technicalPrompt` (3000 chars) |
| `creativeMemory` storage | creativeMemory.ts:154-155 | EXISTS — stores `blueprintText` and `resolvedImagePrompt` |
| "View Blueprint" UI panel | App.tsx:5676 | EXISTS — expandable panel in Step 3 |
| Regression tests | contractFixtures.test.ts:670-729 | EXISTS — T024 (hookText verbatim), T025 (luxury_magazine), T026 (retargeting direction), T027 (copy fidelity) |

**Rationale**: Extending the existing architecture is lower-risk than rewriting. The `buildFinalImagePrompt()` function is already the single assembly point (FR-006 compliance).

**Alternatives rejected**: Full rewrite — too risky, existing architecture is sound.

---

## R2: Copy Fidelity Validation — Implemented

**Decision**: `validateCopyFidelity()` now supports both a legacy string overload (backward-compatible) and an object overload accepting `{ hookText, subheadText, ctaName, benefitText }`.

**Current implementation** (buildPlanSlotMap.ts): The object overload returns `CopyFidelityResult { passed: boolean, failedFields: string[] }`. hookText is required — blank hookText fails immediately. Other fields are validated only when non-empty. NFC normalization + whitespace collapse applied to all comparisons. The `failedFields` array identifies which fields failed for debugging and UI display.

**Rationale**: Per FR-003 — any absent/paraphrased field triggers retry. The `failedFields` output enables targeted warning messages in the UI banner.

**Alternatives rejected**:
- Single combined string check — masks which field failed
- Only hookText (matrix 5.3 literal scope) — rejected per clarification

---

## R3: Prompt Assembly Order Verification

**Decision**: Current `buildFinalImagePrompt()` assembly order is correct but achieves FR-005 through delegation, not direct inclusion.

**Findings**: The function (generators.ts:3755-3780) assembles:
1. `coreDesignRules` (param) — contains layout contract zone rules, aspect ratio, sub-style constraints, creative mode rules
2. `technicalPrompt` — extracted from blueprint
3. Stripped blueprint
4. Copy texts (hookText, subheadText, ctaName, benefitText)
5. `carouselAnchorNote` — carousel context
6. `retargetingDesignHint` — campaign type visual direction
7. Text rendering rules block
8. `imageParts` (param) — Box A photos, Box B logos, Box C assets, style reference

FR-005's 10-item list maps correctly:
- Items 1-5: split between `coreDesignRules` param and `technicalPrompt`
- Item 6 (brand colors): injected upstream in `generateBuildPlan()`, echoed in TECHNICAL_PROMPT
- Items 7-10 (uploads): passed via `imageParts` multimodal array

**Rationale**: The delegation pattern is correct for this architecture — Gemini needs these inputs at build plan generation time, not just at final assembly. No structural change needed.

---

## R4: Carousel Per-Slide Prompt Wiring

**Decision**: Wire `buildFinalImagePrompt()` per-slide in carousel generation path with per-slide copy text. Populate `ResolutionTrace.perSlide`.

**Findings**: `ResolutionTrace.perSlide` type is defined (generators.ts:3786 area) but needs verification that it's populated during carousel runs. The carousel flow generates per-slide build plans, but each slide's `buildFinalImagePrompt()` call must use that slide's specific hookText/subheadText — not slide 1's text reused. The `perSlide` trace array must store per-slide `blueprintText` and `resolvedImagePrompt`.

**Alternatives rejected**: Shared prompt with slide-number injection — violates FR-010 (per-slide copy correctness).

---

## R5: Warning Banner UX Pattern

**Decision**: Use existing toast/banner pattern for retry exhaustion warning with cancel/retry action buttons.

**Findings**: App.tsx already has:
- `showToast()` for success/error states (lines 3238, 3260)
- `copy_fidelity_failed` error code handling (line 3366)
- The warning banner should auto-proceed after a timeout (or immediately if user doesn't intervene), with "Cancel" and "Retry" action buttons.

**Alternatives rejected**: Modal dialog — too disruptive for a warning that doesn't require action (auto-proceeds by default).

---

## R6: blueprintText Storage Verification

**Decision**: Verify `blueprintText` is stored in the primary Firestore generation document, not only in `creativeMemory`.

**Findings**: Currently stored in `creativeMemory/{creativeId}` (creativeMemory.ts:154-155) as part of the creative memory audit trail. FR-009 requires it in the generation record (`generations/{genId}`). Need to verify the main generation document also persists these fields.

**Alternatives rejected**: Store only in creativeMemory — FR-009 explicitly requires it in the generation record.
