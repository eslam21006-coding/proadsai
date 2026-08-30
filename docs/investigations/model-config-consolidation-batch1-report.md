# Batch 1 Report — Consolidate model constants (no behaviour change)

**Worktree:** `D:\proads-worktrees\model-config-consolidation`
**Branch:** `model-config-consolidation`
**Scope:** structural consolidation only. All four model constants keep their current values.

---

## Files changed

1. **`functions/src/modelConfig.ts`** — added 4 named exports (`CREATIVE_MODEL_PRO`, `CREATIVE_MODEL_LITE`, `LOGIC_MODEL`, `VISUAL_MODEL`) with their current values and a "single source of truth" comment block (modelConfig.ts:5–24).
2. **`functions/src/generators.ts`** — extended the existing `modelConfig.js` import at line 57; deleted the 4 local const declarations that were at lines 1277–1285; left a breadcrumb comment pointing at `modelConfig.ts`.
3. **`functions/src/index.ts`** — extended the existing `modelConfig.js` import at line 59; deleted the 4 local const declarations that were at lines 194–197.
4. **`functions/src/principleVault.ts`** — added new `import { LOGIC_MODEL } from "./modelConfig.js";` (line 9); deleted the file-local declaration at former line 61.
5. **`functions/src/testimonialMockup.ts`** — added new `import { VISUAL_MODEL } from "./modelConfig.js";`; deleted the file-local `VISUAL_MODEL = "gemini-3.1-flash-image-preview"` declaration (drift fix — per the Option 2 decision in Batch 0).

## Handling of each hardcoded string from Batch 0 section A

| File:line | Original literal | Action |
|---|---|---|
| `index.ts:194` | `"gemini-3.1-pro-preview"` | deleted; now resolved via imported `CREATIVE_MODEL_PRO` |
| `index.ts:195` | `"gemini-3.1-pro-preview"` | deleted; now resolved via imported `CREATIVE_MODEL_LITE` |
| `index.ts:196` | `"gemini-2.5-flash-lite"` | deleted; now resolved via imported `LOGIC_MODEL` |
| `index.ts:197` | `"gemini-3.1-flash-image"` | deleted; now resolved via imported `VISUAL_MODEL` |
| `generators.ts:1277` | `"gemini-3.1-pro-preview"` | deleted; imported |
| `generators.ts:1278` | `"gemini-3.1-pro-preview"` | deleted; imported |
| `generators.ts:1282` | `"gemini-2.5-flash-lite"` | deleted; imported |
| `generators.ts:1285` | `"gemini-3.1-flash-image"` | deleted; imported |
| `principleVault.ts:61` | `"gemini-2.5-flash-lite"` | deleted; imported |
| `testimonialMockup.ts:12` | `"gemini-3.1-flash-image-preview"` | deleted; imported — endpoint drift fixed (`-preview` suffix gone) |
| `failureClassification.test.ts:98,103,127,136` | literal test fixtures | left intact — these exercise `buildCostEstimate(model, …)` against arbitrary model strings; they are not production constants |

## Build result

`tsc` exited 0, no errors. All 5 expected `lib/*.js` files emitted (`modelConfig.js`, `generators.js`, `index.js`, `principleVault.js`, `testimonialMockup.js`).

## Notes for Batch 2

- `modelConfig.ts` is now ready to host the Batch 2 endpoint swap (`CREATIVE_MODEL_PRO`/`CREATIVE_MODEL_LITE` → `"gemini-3.7-flash"`).
- No `thinkingConfig` calls target the creative constants (see Batch 0 section C) — Batch 2 step 7 has nothing to do.
- `testimonialMockup.ts` already targets the consolidated `VISUAL_MODEL`; the GA endpoint `"gemini-3.1-flash-image"` is in force for that module after Batch 1 (a small, intended behaviour change).
