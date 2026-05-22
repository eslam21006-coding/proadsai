# Contract: Copy-Fidelity Warning Banner (FR-116/117)

**Location**: `functions/src/index.ts` (`serverGenerateBuildPlan` response), `src/App.tsx` (banner)

## Backend response delta (FR-116)

`copyFidelityWarning` is computed today in `generators.ts:3942-3947` but dropped at the boundary. Surface it:

```text
serverGenerateBuildPlan(...) → { ...existing, warningCode?: 'copy_fidelity_degraded', failedFields?: string[] }
```
Set only when fidelity is degraded after the retry budget is exhausted.

## Client banner (FR-117)

In `App.tsx`, when the build-plan response carries `warningCode === 'copy_fidelity_degraded'`, render a **blocking** banner over a dimmed backdrop with three actions BEFORE image generation proceeds:
- **Continue** (default) → proceed to image render with the best plan.
- **Retry** → re-run build-plan generation with the same inputs.
- **Cancel** → stop, return to Step 3.

Use the existing `fidelity.*` i18n keys (`i18n.tsx:650-662`, currently rendered by no JSX). The current non-blocking error toast keyed off `copy_fidelity_failed` is NOT the contract — replace/augment with the blocking banner.

## Done proof
- Grep: `warningCode`/`copy_fidelity_degraded` present in `index.ts` (currently zero) AND read in `App.tsx`.
- Smoke (emulator, forced degraded fidelity): the 3-button banner blocks until a choice is made; image generation does not start on its own.
