# Contract: Prompt Assembly Function

**Function**: `buildFinalImagePrompt()`
**Location**: `functions/src/generators.ts`

## Signature

```ts
buildFinalImagePrompt(
  input: BuildFinalImagePromptInput
): BuildFinalImagePromptResult
```

`BuildFinalImagePromptInput` fields:

| Field | Type | Description |
|-------|------|-------------|
| technicalPrompt | string | Extracted TECHNICAL_PROMPT from blueprint |
| blueprint | string | Full blueprint text (TECHNICAL_PROMPT will be stripped internally) |
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
| coreDesignRules | string | Pre-assembled design system rules (includes contract zones, sub-style constraints, mode structural rules, campaign direction) |
| carouselAnchorNote | string | Carousel anchor slide reference note |
| retargetingDesignHint | string | Retargeting visual direction hint |
| imageParts | Array\<{ inlineData: { mimeType: string; data: string } }\> | Box A/B/C images and reference ad (only those provided) |

`BuildFinalImagePromptResult` fields:

| Field | Type | Description |
|-------|------|-------------|
| textPrompt | string | The concatenated text prompt for the image model |
| imageParts | Array\<{ inlineData: { mimeType: string; data: string } }\> | Pass-through of input image parts |
| trace | ResolutionTrace | Audit record with resolvedImagePrompt, blueprintText, and technicalPrompt |

## Assembly Order (strict)

The function MUST concatenate prompt sections in this exact order:

1. **coreDesignRules** — pre-assembled design system rules (includes layout contract zone rules, aspect ratio, sub-style visual constraints, creative mode structural rules, campaign type + hook angle visual direction)
2. **TECHNICAL_PROMPT** — from blueprint extraction (when present)
3. **Stripped BLUEPRINT** — human-readable blueprint with TECHNICAL_PROMPT markers removed
4. **TEXTS + BUTTON** — hookText, subheadText, ctaName verbatim
5. **carouselAnchorNote** — carousel slide reference (when applicable)
6. **retargetingDesignHint** — retargeting visual direction (when applicable)
7. **CRITICAL TEXT RENDERING RULES** — immutable rules preventing marker/English text leakage

Items in coreDesignRules include brand color hex directives, face-consistency instructions, logo placement, mode-specific asset references, and style reference — all conditional on user input presence.

## Invariants

- The returned `textPrompt` MUST contain the exact `hookText` string from `inputs`
- The returned `textPrompt` MUST contain the exact `subheadText` string from `inputs` (when non-empty)
- The returned `textPrompt` MUST contain the exact `ctaName` string from `inputs` (when CTA is applicable for this slide)
- The returned `textPrompt` MUST contain the exact `benefitText` string from `inputs` (when non-empty)
- The returned `textPrompt` MUST NOT contain placeholder text for absent optional inputs
- The function MUST be the sole entry point for prompt assembly — no inline assembly elsewhere

## Copy Fidelity Contract

**Input**: `{ hookText, subheadText, ctaName, benefitText }` (all strings), `technicalPrompt` (string)
**Required**: `hookText` must be non-empty — blank hookText fails immediately
**Check**: For hookText and each other non-empty field, `normalizedTechnicalPrompt.includes(normalizedField)` using NFC normalization + whitespace collapse
**Pass**: hookText is non-empty AND all non-empty fields found verbatim → proceed
**Fail**: Any non-empty field absent or paraphrased → retry build plan generation (max 2 retries)
**Exhausted**: After 3 total attempts → auto-proceed with best available plan + display warning banner with cancel/retry option before image generation starts. Warning also logged for audit.
