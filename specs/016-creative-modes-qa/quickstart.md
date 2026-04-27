# Quickstart: Phase 16 — Creative Modes & Art Direction QA

**Audience**: developer, reviewer, QA on this feature.
**Goal**: from a fresh checkout, run the Phase 16 fixture suite, see all green, and reproduce one drift case manually to confirm the runtime self-correction path.
**Time**: ~10 minutes.

---

## Prerequisites

- Repository cloned, on branch `016-creative-modes-qa`.
- Node 20+ installed.
- Firebase CLI installed (only needed if you also want to run the function locally; not required for the fixture suite).

```bash
git checkout 016-creative-modes-qa
cd D:\proads-worktrees\016-creative-modes-qa     # or wherever the worktree lives
```

## Step 1 — Install dependencies

```bash
# Root (frontend)
npm install

# Backend (functions)
cd functions
npm install
cd ..
```

## Step 2 — Run the existing test suite (baseline)

Confirm the existing 81 fixtures still pass before any Phase 16 changes are layered in.

```bash
cd functions
npm test
```

Expected: all 4 test files complete, **zero** failures, pass count ≥ 81.

## Step 3 — Run the Phase 16 fixture suite

Once Phase 16 tasks have been implemented (`/speckit.tasks` → `/speckit.implement`), the same command runs the new fixtures alongside the existing ones.

```bash
cd functions
npm test
```

Expected, after Phase 16 lands:
- Pass count = 81 (existing) + 43 (Phase 16) = 124+. Exact count depends on whether any sub-fixtures are split.
- Console output prints a coverage summary at the end: `Phase 16: 10 solo modes ✓, 10 approved pairs ✓, 4 blocked ✓, 4 carousel-specific ✓, 3 batch-specific ✓, 2 retargeting-specific ✓, 1 self-correction ✓, 8 adapt states ✓, 1 audit ✓`.
- The adapt-state audit prints `audit: 8/8 strings free of cultural-compliance trigger words ✓`.
- Process exit code = 0.

## Step 4 — Reproduce a runtime self-correction case (optional manual check)

This step exercises FR-009 (the post-build-plan validator that detects missing required composition elements and reinforces the prompt).

Inputs: a `value_stack + standard_hero` mini-course generation where the build plan happens to drop the stack zone language.

```bash
# In a separate terminal, start the Firebase emulator (only the functions emulator is needed):
firebase emulators:start --only functions

# Then trigger a generation via the CLI helper:
cd functions
node lib/scripts/triggerDriftCase.js \
  --mode value_stack,standard_hero \
  --tab mini_course \
  --format single \
  --campaign cold \
  --simulateMissing stack_zone
```

The `--simulateMissing` flag is a debug-only injection point added in Phase 16 (only available when `process.env.PHASE16_DEBUG === '1'`). It strips one slot's natural-language pattern from the build plan **after** `generateBuildPlan()` returns, simulating Gemini drift.

Expected:
- The generation completes (the ad still ships — silent reinforcement per Q4).
- Inspect the resulting `generations/{genId}` document in the Firestore emulator UI.
- Verify the field `resolutionTrace.modeComposition.missing` contains an entry like:

  ```json
  {
    "mode": "value_stack",
    "missingElements": ["stack zone"],
    "reinforcementInjected": true,
    "detectedAt": "post_build_plan"
  }
  ```

- Verify the rendered image prompt (in the same document or in logs) contains the reinforcement directive `CRITICAL: This ad MUST include stack zone. Do not omit it.`

## Step 5 — Verify the frontend gate

Trigger an invalid combination from the UI to confirm the inline-message + disabled-button gate:

```bash
# From the repo root (in a third terminal):
npm run dev
```

Open the dev server in a browser, complete inputs through Step 1 of the form, then:

1. In the Creative Mode grid, select `before_after`.
2. In the Format selector, switch to `carousel`.

Expected:
- Inline message appears directly below the format selector: "Before/After cannot be used in carousel format."
- *Generate* button is disabled.
- Network tab shows **no** outbound request to the `generateAd` callable (the gate is client-only at this point; the request never fires).

Now bypass the client and confirm the server still rejects (defense-in-depth, Q1):

```bash
# From a fourth terminal, fire a direct callable invocation:
cd functions
node lib/scripts/callDirect.js \
  --callable generateAd \
  --modes before_after,standard_hero \
  --format carousel
```

Expected:
- Server returns HTTPS Callable error with `code: 'invalid_mode_format'` and `message: 'Before/After cannot be used in carousel format.'`
- **Zero credits** charged on the user's account.
- No image generated.

## Step 6 — Run the full launch-gate

The Phase 16 fixture suite is itself a launch gate. Failure of any new fixture blocks merging:

```bash
cd functions
npm test
echo "Exit code: $?"
```

Exit code 0 is the only acceptable result for launch.

---

## Troubleshooting

- **"Fixture suite hangs"**: usually a build error in `npm run build`. Check `functions/lib/` for missing files. Run `cd functions && rm -rf lib && npm run build` to clean-rebuild.
- **"Phase 16 fixtures pass locally but fail in CI"**: confirm the CI runner is on Node 20+. The fixtures use `node:assert/strict`, which requires Node 18+ but the project targets 20.
- **"Adapt-state audit reports a trigger-word collision"**: the matching string in `getSubStyleModeFusion()` (lines 1067–1167) needs a content owner to revise. Phase 16 does **not** rewrite catalog strings — it flags them.
- **"Inline message doesn't appear in the UI"**: confirm `validateModeFormatCombination` is imported in `InputForm.tsx` and called in the relevant `useEffect`. Confirm the message slot is wired into the React render tree below the offending control.
