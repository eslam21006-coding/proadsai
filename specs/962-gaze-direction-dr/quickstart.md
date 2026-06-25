# Quickstart: Direct-Response Design Upgrades (Phase 19)

How to build, test, and verify Phase 19. Backend-only; work in the worktree
(this branch — `962-gaze-direction-dr` — is a per-feature worktree; use
the worktree root that `git rev-parse --show-toplevel` prints in your
local checkout).

## Prerequisites

- Node/npm installed; `cd functions && npm install` already run.
- Branch `962-gaze-direction-dr` checked out.

## Build & unit tests

```bash
cd functions
npm run build            # tsc — must compile clean (gazeMap.ts + edits)
npm run test:gazeMap     # NEW — Contracts A–G (resolver, image-prompt gaze block, one-highlight cap, hook-mood block, price detector, injection gating, audit trace, CTA outcome framing, reversibility) in functions/src/__tests__/gazeMap.test.ts
npm run test:expressionMap   # regression — Phase 28 still green (Contract F2)
npm test                 # full backend suite — zero regressions (SC-007, F3)
```

`test:gazeMap` mirrors `test:expressionMap`: a standalone Node script over the
compiled `lib/__tests__/gazeMap.test.js` that exits 1 on any failed assertion.
It covers the deterministic contract surface — Contracts A (resolver), B
(image-prompt gaze block), C (one-highlight + hook-mood + price helpers),
D (injection gating), E (audit trace), G (CTA outcome framing), and a
reversibility assertion (R1). Qualitative (sampling) checks for SC-001…SC-006
and SC-008–SC-010 are described below; they require actual model runs.

## What to verify (maps to spec Success Criteria & contracts)

### Deterministic (unit) — Contracts A–E, G

1. **A1–A11**: every canonical hook + objection + alias resolves; unknown → fallback (no throw); null → null; hook > objection.
2. **B1–B6**: image gaze block has the GAZE DIRECTION text, identity clause, empty-space prohibition, 9:16 vertical note, before/after split; null → "".
3. **C1–C7**: one-highlight always-on text; mood block modulates-not-overrides; price detector true on currency/%/discount, false on price-free copy.
4. **D1–D8**: injection gating — gaze+mood only with a hook; one-highlight always; price only when pricing present; before/after split; vertical note on 9:16; provider-agnostic.
5. **E1–E4**: trace `applied:true` with fields when resolved; `applied:false` + reason when not; legacy doc reads as absent.
6. **G1–G5**: assembled copy prompt contains the outcome-framing instruction; Arabic grammar rules still present.

### Qualitative (sampling) — SC-001…SC-010

Generate a sweep (single image) across the 10 hook angles with a fixed uploaded
face, then inspect:

| Check | Pass condition | SC |
|---|---|---|
| Empty-space stare / cross-eyed | 0 occurrences | SC-001 |
| Gaze matches hook emotion | ≥9/10 per angle | SC-002 |
| Gaze consistent with layout (never off into empty margin) | every sample | SC-003 |
| One clear focal point (hero), ≤1 competing highlight | every sample | SC-004 |
| CTA hints at outcome where natural; direct where it fits | majority outcome-framed | SC-005 |
| Mood modulates with hook; universe still recognizable | 100% | SC-006 |
| Face identity pixel-faithful to upload | 100% | SC-010 |

Also generate: a **before/after** ad (BEFORE reflective, AFTER forward), a
**9:16 story** (gaze within frame), a **carousel** (consistent gaze across
slides), a **batch** (per-item gaze), and a **no-hook** generation (no gaze/mood
block, one-highlight still present → SC-009).

### Reversibility (F4)

Comment out the `buildImagePromptGazeBlock(...)` + DR injection line in
`buildFinalImagePrompt` and set the mapper resolvers to return `null`; rebuild;
confirm output matches pre-Phase-19 (no GAZE DIRECTION / one-highlight / mood /
price text in the prompt).

## Evidence to capture (Constitution IX)

For the manual QA log: the exact failing→fixed rule, controlling file
(`gazeMap.ts` / `generators.ts` injection line), before/after rendered samples,
and the reproducible inputs (hook angle, aspect ratio, mode) for each sampled
generation. Record the `resolutionTrace.gazeDirection` for a hooked and a
no-hook generation to show the auditable trace (Constitution VI).

## Rollout note

Fully reversible, additive, prompt-only. No Firestore migration, no frontend
deploy, no billing/plan-gating change. Merge via GitHub UI only.
