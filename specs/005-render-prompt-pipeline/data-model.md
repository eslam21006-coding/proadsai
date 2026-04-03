# Data Model: Blueprint → Long-Form Render Prompt Pipeline

**Date**: 2026-04-02 | **Branch**: `005-render-prompt-pipeline`

## Entities

### BuildPlanEnvelope (extended)

Existing entity in `buildPlanSlotMap.ts`. Extended with new field.

| Field | Type | Description |
|-------|------|-------------|
| blueprint | string | Human-readable rendering plan (existing) |
| machinePlan | StructuredBuildPlanPayload \| null | Structured JSON portion (existing) |
| **technicalPrompt** | **string \| null** | **NEW — Long-form English render prompt extracted from blueprint. May be null if markers absent.** |

**Extraction**: Parsed from `[[TECHNICAL_PROMPT]]..[[/TECHNICAL_PROMPT]]` markers within the blueprint. Returns `null` if markers absent.

---

### ResolutionTrace (extended)

Existing entity in `functions/src/generators.ts`. Extended with new fields.

| Field | Type | Description |
|-------|------|-------------|
| **resolvedImagePrompt** | **string \| null** | **NEW — The final assembled prompt sent to the image model, truncated to 5000 chars.** |
| **blueprintText** | **string \| null** | **NEW — The human-readable blueprint text (TECHNICAL_PROMPT stripped), truncated to 2000 chars. May be null.** |
| **technicalPrompt** | **string \| null** | **NEW — The extracted TECHNICAL_PROMPT content, truncated to 3000 chars. May be null if markers absent.** |
| perSlide | Array \| undefined | Optional per-slide trace entries (carousel mode) |

**Per-slide entry** (carousel mode):

| Field | Type | Description |
|-------|------|-------------|
| slideIndex | number | Slide position |
| **resolvedImagePrompt** | **string \| null** | **Per-slide assembled prompt.** |
| **blueprintText** | **string \| null** | **Per-slide blueprint text.** |

---

### CreativeMemoryRecord (extended)

Existing entity in `functions/src/creativeMemory.ts`. Extended with new fields.

| Field | Type | Description |
|-------|------|-------------|
| *(all existing fields)* | | *(preserved)* |
| **blueprintText** | **string \| null** | **NEW — Stripped blueprint, truncated to 2000 chars on write.** |
| **resolvedImagePrompt** | **string \| null** | **NEW — Extracted TECHNICAL_PROMPT, truncated to 5000 chars on write.** |

---

### BuildFinalImagePromptInput (new)

Input shape for the `buildFinalImagePrompt()` function. Not persisted — runtime only. Matches the interface in `functions/src/generators.ts`.

| Field | Type | Description |
|-------|------|-------------|
| technicalPrompt | string | Extracted TECHNICAL_PROMPT from blueprint |
| blueprint | string | Full blueprint text (stripped internally) |
| contract | FullLayoutContract | Layout contract with zone rules |
| inputs | AdInputs | All user inputs from Steps 1 and 2 |
| aspectRatio | AspectRatio | Target aspect ratio |
| hookText | string | Approved hook text for this slide |
| subheadText | string | Approved subhead text |
| ctaName | string | Approved CTA button text |
| benefitText | string | Benefit text |
| badges | string \| undefined | Badge text (optional) |
| resolvedUniverse | string | Resolved universe setting |
| costumeRules | string | Costume/wardrobe rules |
| coreDesignRules | string | Pre-assembled design rules (contract zones, sub-style, mode rules, campaign direction) |
| carouselAnchorNote | string | Carousel anchor slide reference note |
| retargetingDesignHint | string | Retargeting visual direction hint |
| imageParts | Array\<{ inlineData: { mimeType: string; data: string } }\> | Image inputs (Box A/B/C, reference ad) |

---

## State Transitions

### Build Plan Validation Flow

```text
generateBuildPlan() called
  → parseBuildPlanEnvelope() extracts technicalPrompt
  → validateCopyFidelity(technicalPrompt, hookText)
    → PASS + contract PASS: proceed to image generation
    → FAIL (attempt 1/2): retry generateBuildPlan()
    → FAIL (attempt 3): proceed with best available plan + warning (non-blocking)
```

### Prompt Assembly Flow

```text
buildFinalImagePrompt(input) called
  → Concatenates sections in fixed order
  → Returns assembled prompt string + trace
  → Caller stores trace.resolvedImagePrompt in generation record
  → Caller passes textPrompt + imageParts to image model
```
