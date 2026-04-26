# Quickstart — HOTFIX-F Manual Verification Recipe

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

This recipe walks an engineer through verifying the HOTFIX-F changes locally end-to-end. Estimated time: 15–20 minutes once the hotfix is implemented.

## Prerequisites

- Node ≥ 18, `npm` installed.
- Firebase emulator suite (`firebase` CLI ≥ 13).
- Repo cloned, this branch checked out: `955-aspect-reflow`.
- Sharp built for the local platform (already a project dep; `cd functions && npm install` if missing).
- A test Firebase project credential (or use the emulator).

## Step 1 — Build & start emulators

```bash
cd D:/proads-worktrees/0954-hotfix-aspect-reflow

# Frontend
npm install
npm run build

# Backend
cd functions
npm install
npm run build           # tsc compile
cd ..

# Start emulators (Functions + Firestore + Storage)
npm run dev:emulators   # or: firebase emulators:start --only functions,firestore,storage
```

In a second terminal:

```bash
npm run dev             # vite dev server
```

## Step 2 — Run the new fixture suite

The tests added in `functions/src/contractFixtures.test.ts` (per [contracts/reflowImage-callable.md](./contracts/reflowImage-callable.md) §Test contract) cover the 12 HFF.6 fixtures.

```bash
cd functions
npm test -- contractFixtures
```

**Expected**: 12 new fixture cases pass (HFF.6.a through HFF.6.l). The byte-identity test (HFF.6.c) compares the locked center 70 % rectangle of a fixture PNG (`functions/src/__tests__/__fixtures__/reflow-source-1x1.png`) against the Sharp output — must match exactly across all RGBA channels.

## Step 3 — Headline failure case (4:5 → 9:16)

This is the launch-matrix anchor. Verify it interactively in the browser.

1. Sign in to the local emulator at `http://localhost:5173`.
2. Step 1 → fill any inputs (a portrait-style brand works well, e.g. wellness coach).
3. Step 2 → generate hooks; Step 3 → generate concepts and a build plan.
4. Step 4 → render at **4:5**. Save the rendered image URL — this is the source.
5. In Step 4, click **Resize** → pick `9:16` → leave method = **Auto**.
6. Wait for the result (~30 s — rerender route).

**Expected outcomes**:
- The new 9:16 image shows the same hero with normal facial proportions (no vertical stretch).
- The headline, subhead, CTA, and any offer-overlay numbers are character-for-character identical to the source 4:5.
- In the Firestore emulator UI, open `generations/{genId}.resolutionTrace.reflowHistory[0]`:
  - `sourceRatio: '4:5'`, `targetRatio: '9:16'`
  - `magnitude` ≈ 0.422
  - `method: 'rerender'`
  - `userOverride: null`, `fallbackFrom: null`
  - `outputUrl` is set and matches the displayed image
- `mockupHistory[]` has grown by one entry with `ratio: '9:16'`.

**Failure-mode check**: if the result has a stretched face, the hotfix is broken — file a bug.

## Step 4 — Small-change case (1:1 → 4:5)

1. Render a fresh ad at **1:1** (don't reuse the previous source).
2. Click **Resize** → pick `4:5` → method = **Auto**.
3. Wait for the result (~3 s — outpaint route).

**Expected outcomes**:
- The center 70 % of the new 4:5 image is visually pixel-identical to the corresponding region of the source 1:1.
- Only the new top and bottom margin pixels are different (mirrored extension).
- In `resolutionTrace.reflowHistory[0]`:
  - `method: 'outpaint'`
  - `magnitude` === 0.25
  - `fallbackFrom: null`

**Pixel verification (advanced)**: download both images, open in any tool that supports raw pixel inspection, sample 10 random pixels in the center 70 % rectangle, confirm RGBA values match across both images.

## Step 5 — User override (Quick / Fresh)

1. Repeat Step 3 (4:5 → 9:16) but click the **Edit** toggle next to the method label and pick **Quick (outpaint)**.
2. Wait for the result.

**Expected outcomes**:
- The image returns *fast* (~3 s) because outpaint was forced.
- The new 9:16 image will likely show seamy or ill-fitting margins (the canvas-shape change is large enough that outpaint is geometrically wrong) — this is *expected* and the whole point of the override; the user accepted this trade-off.
- In `resolutionTrace.reflowHistory[0]`:
  - `method: 'outpaint'`
  - `userOverride: 'outpaint'`
  - `fallbackFrom: null` (overrides do NOT fall back per research.md R4/R6)

3. Repeat with **Fresh render** on a 1:1 → 4:5 reflow (forces rerender on a small change).

**Expected**: rerender executes (~30 s), `userOverride: 'rerender'`.

## Step 6 — Carousel reflow (per-item routing)

1. Generate a 5-slide carousel at 1:1 (Step 3 carousel mode → Step 4 render carousel).
2. In Step 4, click the carousel's **Resize all slides** → pick `9:16` → method = **Auto**.
3. Wait for completion (~150 s — 5 rerenders, capped at 5 concurrent).

**Expected outcomes**:
- All 5 slides return at 9:16 with no stretched faces.
- Slide order preserved.
- `outcomes.length === 5`; every outcome has `method: 'rerender'`.
- `mockupHistory` has grown by 5 entries.
- `reflowHistory.length === 5`, with `itemIndex` 0 through 4.

## Step 7 — Partial-failure handling (synthetic)

This requires injecting a failure for one slide. Easiest path: create a test carousel where slide 3 has `buildPlan: undefined` (legacy-record simulation), then trigger a 1:1 → 9:16 reflow.

**Expected outcomes**:
- Slides 1, 2, 4, 5 succeed; slide 3 fails.
- Response `outcomes[2].success === false` with `errorCode: 'no_plan'`.
- `mockupHistory` grows by 4 (not 5).
- The failed slide's UI row shows an error badge and a "Retry" button.
- `creditsCharged` reflects only the 4 successful items.

## Step 8 — Confirm the deprecated path is gated off

```bash
cd functions
npm test -- failureClassification    # or grep for the deprecated REFLOW path
```

In `generators.ts`, the `editInstruction?.includes("REFLOW")` branch (`generators.ts:5188`) is now reachable only via internal callers, not via any user-facing path. Verify by grep:

```bash
grep -nE "REFLOW.*editInstruction" src/    # should be empty
```

The frontend no longer constructs `REFLOW: Ratio …` prompts; all user-facing reflows go through `httpsCallable('reflowImage')`.

## Step 9 — Smoke-test the existing pipelines for non-regression (FR-027)

1. Render an Arabic ad with right-to-left text overlays at 4:5 → reflow to 1:1 (outpaint route).
2. Render an ad with the offer overlay (price / total-value / savings) at 1:1 → reflow to 4:5.
3. Render an ad with a HOTFIX-E UI logo at 1:1 → reflow to 4:5.

**Expected**: all three reflows preserve the respective overlay content perfectly (because they're inside the locked center 70 %). The text remains right-to-left, the offer numbers stay aligned, the UI logo stays pixel-perfect.

## Step 10 — Lint, typecheck, and final test pass

```bash
cd D:/proads-worktrees/0954-hotfix-aspect-reflow
npm run lint
cd functions
npm run build         # tsc strict mode passes
npm test              # all tests green
```

**Expected**: lint clean, typecheck clean, all tests pass.

## Done

If every step above behaves as expected, the hotfix is functionally complete. File a PR with:
- The full diff
- A summary that links to spec.md, plan.md, research.md, and this quickstart
- Before/after screenshots for the headline 4:5 → 9:16 case (Step 3) and the byte-identity case (Step 4)
- Confirmation that all 12 new fixture tests pass

Per Constitution Principle IX, the PR is "claimed fix with proof" only when these screenshots and the 12 fixtures are attached.
