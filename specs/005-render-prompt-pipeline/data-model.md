# Data Model: Blueprint → Long-Form Render Prompt Pipeline

**Date**: 2026-04-02 | **Branch**: `005-render-prompt-pipeline`

## Entities

### BuildPlanEnvelope (extended)

Existing entity in `buildPlanSlotMap.ts`. Extended with new field.

| Field | Type | Description |
|-------|------|-------------|
| blueprint | string | Human-readable rendering plan (existing) |
| machinePlan | StructuredBuildPlanPayload \| null | Structured JSON portion (existing) |
| **technicalPrompt** | **string \| null** | **NEW — Long-form English render prompt extracted from blueprint. The exact text sent to the image model.** |

**Extraction**: Parsed from `[[TECHNICAL_PROMPT]]..[[/TECHNICAL_PROMPT]]` markers within the blueprint. Returns `null` if markers absent.

---

### ResolutionTrace (extended)

Existing entity in `specs/001-resolver-completeness-trace/`. Extended with new fields.

| Field | Type | Description |
|-------|------|-------------|
| *(all existing fields)* | | *(preserved)* |
| **resolvedImagePrompt** | **string** | **NEW — The final assembled prompt sent to the image model. Full text including all contract rules, style constraints, and copy text.** |
| **blueprintText** | **string** | **NEW — The human-readable blueprint text (TECHNICAL_PROMPT stripped).** |

**Per-slide extension** (carousel mode):

| Field | Type | Description |
|-------|------|-------------|
| *(existing perSlide fields)* | | *(preserved)* |
| **blueprintText** | **string** | **NEW — Per-slide blueprint text.** |
| **resolvedImagePrompt** | **string** | **NEW — Per-slide assembled prompt.** |

---

### CreativeMemoryRecord (extended)

Existing entity in `functions/src/creativeMemory.ts`. Extended with new fields.

| Field | Type | Description |
|-------|------|-------------|
| *(all existing fields)* | | *(preserved)* |
| **blueprintText** | **string \| null** | **NEW — Stored for debugging. Truncated to 2000 chars to control storage.** |
| **resolvedImagePrompt** | **string \| null** | **NEW — Stored for debugging. Truncated to 5000 chars to control storage.** |

---

### BuildFinalImagePromptInput (new)

Input shape for the `buildFinalImagePrompt()` function. Not persisted — runtime only.

| Field | Type | Description |
|-------|------|-------------|
| technicalPrompt | string | Extracted TECHNICAL_PROMPT from blueprint |
| contract | FullLayoutContract | Layout contract with zone rules |
| aspectRatio | AspectRatio | Target aspect ratio |
| subStyleConstraints | string \| null | Visual sub-style constraint block |
| modeStructuralRules | string \| null | Creative mode structural rules |
| campaignDirection | string \| null | Campaign type + hook angle visual direction |
| brandColors | { primary?: string, secondary?: string } | Hex color values (optional) |
| personalPhotos | string[] | Box A base64 images (optional, may be empty) |
| brandLogos | string[] | Box B base64 images (optional, may be empty) |
| modeAssets | string[] | Box C base64 images (optional, may be empty) |
| referenceAd | string \| null | Reference ad base64 (optional) |
| hookText | string | Approved hook text for this slide |
| subheadText | string | Approved subhead text for this slide |
| ctaName | string | Approved CTA button text |

---

## State Transitions

### Build Plan Validation Flow

```
generateBuildPlan() called
  → parseBuildPlanEnvelope() extracts technicalPrompt
  → validateCopyFidelity(technicalPrompt, hookText)
    → PASS: proceed to image generation
    → FAIL (attempt 1/2): retry generateBuildPlan()
    → FAIL (attempt 3): return error + retry button to user
```

### Prompt Assembly Flow

```
buildFinalImagePrompt(input) called
  → Concatenates sections in fixed order (FR-005 items 1-10)
  → Returns assembled prompt string
  → Caller stores as resolvedImagePrompt in trace
  → Caller passes to image model
```
