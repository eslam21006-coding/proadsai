# Contract: Resolution-Trace & Diagnostic Persistence (FR-301, FR-137, FR-304, FR-303)

**Location**: `functions/src/generators.ts` (main generation completion), `functions/src/index.ts`, with `functions/src/reflowImage.ts:492-519` as the reference implementation.

## Trace persistence (FR-301 — keystone)

Replicate the `reflowImage` transaction pattern onto the main generation-completion path:
```pseudo
db.runTransaction(tx => {
  const snap = tx.get(generations/{genId})
  tx.set(generations/{genId}, { resolutionTrace: <built trace> }, { merge: true })
})
```
- **Additive**: `resolutionTrace` is optional; legacy docs without it must read fine.
- Closes the observability half of Phases 1, 5, 6, 7, 15, 16 in one place.

## culturalViolation inversion (FR-137)

Currently emitted in the client response (`index.ts:3891`) and never persisted — **invert**: persist `culturalViolation` onto `generations/{genId}` (within the same trace write where possible) AND strip it from the client payload. No window where it is neither.

## Blueprint + resolved prompt (FR-304)

Mirror `blueprintText` and `resolvedImagePrompt` (today only in `creativeMemory`) onto the main `generations/{genId}` doc.

## Sole assembly entry point (FR-303)

Route production prompt assembly through `buildFinalImagePrompt` (today test-only); remove the inline assembly in `generateFinalAd` (`generators.ts:~5680-5699`). The assembled prompt feeding FR-304 must come from this single function.

## Done proof
- After a real generation, reading `generations/{genId}` returns a populated `resolutionTrace` (and `blueprintText`/`resolvedImagePrompt`).
- `culturalViolation` is on the doc, NOT in the client response (grep both).
- Grep: `buildFinalImagePrompt` called from the live `generateFinalAd` path (not only tests); no inline assembly remains.
