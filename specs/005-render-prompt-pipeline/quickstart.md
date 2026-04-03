# Quickstart: Blueprint → Long-Form Render Prompt Pipeline

## What This Feature Does

Makes the pipeline from user-visible blueprint (Step 3) to machine-executable image prompt explicit, auditable, and fully fed from all user inputs. Adds copy text fidelity validation, a dedicated prompt assembly function, and stores the final prompt for debugging.

## Key Files to Modify

| File | Change |
|------|--------|
| `functions/src/generators.ts` | Audit `generateBuildPlan()` input injection; extract `buildFinalImagePrompt()` from inline assembly in `generateFinalAd()`; add `generateTestimonialHookSlide`/close retries |
| `functions/src/buildPlanSlotMap.ts` | Add `technicalPrompt` extraction to `parseBuildPlanEnvelope()`; add copy fidelity check to validation |
| `functions/src/index.ts` | Wire retry logic for build plan failures; store `blueprintText` + `resolvedImagePrompt` in generation record |
| `functions/src/creativeMemory.ts` | Add `blueprintText` and `resolvedImagePrompt` fields to `CreativeMemoryRecord` |
| `functions/src/contractFixtures.test.ts` | Add regression tests for prompt assembly |
| `src/App.tsx` | Add "View Blueprint" expandable panel in Step 3; strip TECHNICAL_PROMPT from display; handle retry on fidelity failure |

## Build & Test

```bash
# Backend compile check
cd functions && rm -rf lib && npm run build

# Contract fixtures (includes new prompt assembly tests)
cd functions && npm run test:contracts

# Frontend compile check
npm run build
```

## Architecture Notes

- `buildFinalImagePrompt()` is the SOLE entry point for prompt assembly after this feature
- Copy fidelity validation runs after `generateBuildPlan()`, before image model call
- Resolution trace stores `resolvedImagePrompt` per generation (and per-slide for carousels)
- Blueprint display strips `[[TECHNICAL_PROMPT]]..[[/TECHNICAL_PROMPT]]` markers before showing to user
- Optional inputs (brand colors, logos, Box C, reference ad) are omitted from the prompt when not provided — no placeholder injection
