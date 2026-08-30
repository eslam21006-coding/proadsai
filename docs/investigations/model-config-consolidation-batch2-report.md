# Batch 2 Report — Switch the copy model to `gemini-3.7-flash`

**Worktree:** `D:\proads-worktrees\model-config-consolidation`
**Branch:** `model-config-consolidation`
**PR:** https://github.com/eslam21006-coding/proadsai/pull/67 (NOT merged)

---

## Changes

- **`functions/src/modelConfig.ts:21–28`** — `CREATIVE_MODEL_PRO` / `CREATIVE_MODEL_LITE` switched from `"gemini-3.1-pro-preview"` (preview) to `"gemini-3.7-flash"` (GA).
  - Previous values kept as commented-out `REVERT` lines directly above the new constants, matching the existing revert-style comment pattern in this file (same shape as the `MODEL_PROVIDER` / `COPY_SCORING_ENABLED` revert discussion above).
  - `LOGIC_MODEL` and `VISUAL_MODEL` deliberately untouched.
- No other files required edits for Batch 2.

## Risks addressed

- **No MINIMAL → LOW conversions** — Batch 0 section C confirmed zero `thinkingConfig` calls target the creative constants. Only `VISUAL_MODEL` calls use `thinkingConfig` (4 sites, all `'High'`), and Batch 2 explicitly does not touch `VISUAL_MODEL`.
- **Config compatibility** — creative call sites (8 of them, all in `generators.ts:3011, 3090, 8823, 9156, 9716, 9985, 10056, 10433`) use only `systemInstruction` + `temperature`. `gemini-3.7-flash` accepts both. No config-key incompatibility.
- **Endpoint drift in `testimonialMockup.ts`** — already fixed in Batch 1 (file-local `"gemini-3.1-flash-image-preview"` deleted, module now uses the consolidated `"gemini-3.1-flash-image"`). Nothing more to do here.
- **`principleVault.ts`** — already imports the consolidated `LOGIC_MODEL` from Batch 1. Nothing more to do.

## Build

`cd functions && npm run build` exited 0 (zero errors). Compiled `lib/modelConfig.js` shows the new exports:

```
exports.CREATIVE_MODEL_PRO  = "gemini-3.7-flash";
exports.CREATIVE_MODEL_LITE = "gemini-3.7-flash";
exports.LOGIC_MODEL         = "gemini-2.5-flash-lite";
exports.VISUAL_MODEL        = "gemini-3.1-flash-image";
```

Mandatory pre-deploy step (AGENTS.md rule #1): re-run `npm run build` in `functions/` before any deploy so the deployed `lib/` matches the source.

## Commit / PR

- Commit: `8acb1c9` — `config: consolidate model constants, switch copy model to gemini-3.7-flash`
- Pushed to `origin/model-config-consolidation`
- **PR #67** opened: https://github.com/eslam21006-coding/proadsai/pull/67
- **NOT merged.** Awaiting review and approval.

## Post-deploy watch-list

These are out-of-scope for this task but worth tracking once the change ships:

1. **Arabic copy quality** — Flash vs Pro family may produce different headline tone. `captionValidator`, `validateHookResponse`, Arabic ratio checks will surface regressions in logs.
2. **Cost / latency** — Flash is materially cheaper and faster than Pro; cost estimates in billing logs should drop.
3. **Structured-output regressions** — none of the creative call sites use `responseSchema` today, but if any are added later, Flash-family schema support has historically been narrower than Pro.
4. **Revert path** — flip the two commented-out `REVERT` lines above the active `gemini-3.7-flash` declarations back to live code if quality regressions appear in production. No other file needs to change.