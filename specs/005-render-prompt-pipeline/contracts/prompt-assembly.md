# Contract: Prompt Assembly Function

**Function**: `buildFinalImagePrompt()`
**Location**: `functions/src/generators.ts`

## Signature

```
buildFinalImagePrompt(
  blueprint: string,
  technicalPrompt: string,
  contract: FullLayoutContract,
  inputs: AdInputs,
  aspectRatio: AspectRatio
): { textPrompt: string, imageParts: ImagePart[] }
```

## Assembly Order (strict)

The function MUST concatenate prompt sections in this exact order:

1. **TECHNICAL_PROMPT** — from blueprint extraction
2. **Layout contract** — zone rules + aspect ratio from `compileFullContract()`
3. **Sub-style visual constraints** — from `resolveVisualSubStyle()`
4. **Creative mode structural rules** — from mode spec in `CREATIVE_MODE_CATALOG`
5. **Campaign type + hook angle visual direction** — from `getHookAngleVisualDirection()` / retargeting context
6. **Brand color hex directives** — `brandColorPrimary`, `brandColorSecondary` (when provided)
7. **Face-consistency instructions** — referencing Box A personal photos (when provided)
8. **Logo placement directives** — referencing Box B brand logos (when provided)
9. **Mode-specific asset references** — Box C book covers, device screens, etc. (when provided)
10. **Style reference** — from uploaded reference ad (when provided)

Items 6–10 are omitted when the user has not provided the corresponding input. No placeholder text is injected for absent optional inputs.

## Return Shape

- `textPrompt`: The concatenated text string (sections 1–10 joined)
- `imageParts`: Array of `{ mimeType, data }` objects for Box A/B/C images and reference ad (only those provided)

## Invariants

- The returned `textPrompt` MUST contain the exact `hookText` string from `inputs`
- The returned `textPrompt` MUST contain the exact `ctaName` string from `inputs` (when CTA is applicable for this slide)
- The returned `textPrompt` MUST NOT contain placeholder text for absent optional inputs
- The function MUST be the sole entry point for prompt assembly — no inline assembly elsewhere

## Copy Fidelity Contract

**Input**: `hookText` (string), `technicalPrompt` (string)
**Check**: `technicalPrompt.includes(hookText.trim())`
**Pass**: hookText found verbatim → proceed
**Fail**: hookText absent → mark build plan failed, trigger rebuild (max 2 retries)
**Exhausted**: After 3 total attempts → return error with retry affordance to user
