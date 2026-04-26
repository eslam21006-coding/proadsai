# Quickstart: Manual Verification — Brand Colors

**Branch**: `956-brand-colors` | **Date**: 2026-04-26
**Companion**: [spec.md](./spec.md), [plan.md](./plan.md)

A walk-through that any reviewer can run end-to-end to confirm the spec's five user stories deliver the promised behavior. Assumes a local dev environment with the functions emulator and Vite dev server running.

```bash
# Terminal 1 — backend
cd functions && npm run serve

# Terminal 2 — frontend
npm run dev
```

---

## Setup

1. Sign in as a test user with at least one workspace.
2. Navigate to **Workspace Settings** → set:
   - Brand primary: `#0A66C2` (LinkedIn blue — distinctive, dark)
   - Brand secondary: `#F59E0B` (amber)
3. Confirm the workspace dashboard reflects the saved colors.

---

## US3 first — Trustworthy in-form preview (5 minutes)

Story 3 is the smoke test for everything else. If the form does not behave correctly, no downstream story will be reproducible.

1. Navigate to the new-generation form.
2. **Verify**: both color pickers auto-fill with `#0A66C2` and `#F59E0B`.
3. **Verify**: a small "Using workspace colors" label is visible next to the pickers.
4. **Verify**: a swatch preview renders next to the pickers showing two stacked rectangles (primary as background, secondary as accent) with a mini CTA pill rendered in primary with auto-contrast text.
5. Change the form's primary picker to `#FFD700` (gold — light).
6. **Verify**: the "Using workspace colors" label disappears immediately.
7. **Verify**: the swatch preview updates and the mini CTA pill text flips to near-black (`#1A1A1A`) because `#FFD700` is light.
8. Reset the form's primary back to `#0A66C2`.
9. **Verify**: the "Using workspace colors" label reappears (form values once again equal workspace defaults).
10. Navigate to Workspace Settings.
11. **Verify**: workspace colors are still `#0A66C2` / `#F59E0B` — the form override did not persist.

✅ **US3 passes** when all 11 steps land as described.

---

## US1 — Brand consistency across multi-asset generations (~10 minutes)

### Carousel

1. From the form (with workspace colors auto-filled), pick:
   - Format: Carousel
   - Slides: 5
   - Any creative mode that is carousel-compatible (e.g., `value_stack`)
   - Cold campaign
   - Any product/audience copy
2. Submit.
3. Wait for all 5 slides to render.
4. **Verify (per slide)**: open the rendered image and confirm the brand primary `#0A66C2` appears as a CTA, accent, or heading highlight on **every** slide. The amber secondary should appear as a supporting accent on most slides.
5. Open the generation document in Firestore (or the in-app trace viewer if available).
6. **Verify**: `inputs.brandColorSource === 'workspace'`.
7. **Verify**: `resolutionTrace.brandColorCompliance` is an array of 5 entries, one per slide, each with `assetId: 'slide-0'..'slide-4'`, `checkRan: true`, `present: true`, `deductedScore: 0`.

### Batch

1. Same workspace, same form. Pick:
   - Format: Batch
   - Variations: 4
   - Cold campaign
2. Submit, wait for all 4 to render.
3. **Verify**: all 4 variations share the brand primary as a CTA/accent/heading highlight; composition and messaging vary, color scheme does not.
4. Firestore check: `resolutionTrace.brandColorCompliance` has 4 entries, all `present: true`.

✅ **US1 passes** when both the carousel and the batch verifications land.

---

## US2 — Retargeting inheritance (~5 minutes)

1. From the cold-carousel generation you just created in US1, take note of its `genId`.
2. Navigate to the retargeting form. Link to the cold-ad source by `genId`.
3. **Leave the brand-color pickers empty** in the retargeting form.
4. Submit a retargeting carousel (3 slides is enough).
5. **Verify**: each retargeting slide visibly uses `#0A66C2` and `#F59E0B` — same colors as the cold ad it follows.
5a. **Verify (UI)**: when you opened the retargeting form in step 3, an "Inheriting brand colors from the linked cold ad" label was visible adjacent to the empty brand-color pickers. Type any value into either picker → confirm the label disappears immediately.
6. Firestore check: `inputs.brandColorSource === 'inherited'`.
7. Repeat: open a fresh retargeting form for the same source, this time **explicitly** set primary `#FF0000` and secondary `#00FF00` in the form.
8. Submit and verify the rendered slides use red/green, not the cold ad's blue/amber.
9. Firestore check: `inputs.brandColorSource === 'form'`.

✅ **US2 passes** when both inheritance and override-via-form land.

---

## US2 extension — Magic edit and remix inheritance (~5 minutes)

Spec FR-020 / FR-021 (clarification Q4) extend brand-color guarantees to magic edit and remix flows.

### Magic edit

1. From any rendered ad in US1, open the magic-edit panel.
2. Make a small edit (e.g., "change the background to a cleaner gradient").
3. **Verify**: the edited output retains the brand primary as a CTA/accent and the headline accent in the brand secondary.
4. Firestore check on the new generation record: `inputs.brandColorSource === 'workspace'` (or `'inherited'` if the source ad was a retargeting ad), and `resolutionTrace.brandColorCompliance[0].present === true`.

### Remix

1. From the cold-carousel generation in US1, trigger a remix.
2. Do not fill in brand-color pickers in the remix form.
3. **Verify**: the remixed output uses `#0A66C2` and `#F59E0B` (inherited from the source via the same precedence rule as retargeting).
4. Firestore check: `inputs.brandColorSource === 'inherited'`.
5. Re-run the remix with explicit brand colors `#FF0000` / `#00FF00` in the form.
6. **Verify**: explicit form colors win; `inputs.brandColorSource === 'form'`.

✅ **US2 extension passes** when both magic edit and remix verifications land.

---

## US4 — Compositor defaults for CTA + headline (~3 minutes)

US4 is verifiable from any of the assets generated in US1, US2, or a fresh single-image run.

1. Pick any rendered asset from US1's carousel.
2. Use a color-picker tool (browser DevTools eyedropper, or a screenshot + image-editor sample) to read the CTA pill background color.
3. **Verify**: the sampled color is within ±5 RGB units of `#0A66C2` (anti-aliasing tolerance).
4. Read the headline accent color.
5. **Verify**: the sampled color is within ±5 RGB units of `#F59E0B`.
6. Read the CTA text color.
7. **Verify**: it is white (since `#0A66C2` is dark).
8. Now do a single-image generation with workspace **cleared** of brand colors and form pickers empty.
9. **Verify**: the rendered CTA and headline use AI-chosen colors (whatever the build plan picked). No errors in the function logs related to brand colors.

✅ **US4 passes** when both the branded and the unbranded paths render correctly.

---

## US5 — Post-render compliance check (~5 minutes)

US5 is mostly an in-trace verification.

### Happy path (already verified in US1)

The Firestore checks in US1 already confirmed `present: true` on all assets. That is the happy-path acceptance for US5.

### Negative path (synthetic forced miss)

1. In the form, set primary `#0A66C2`.
2. Pick a creative mode and product copy that are likely to result in a non-blue ad (e.g., a warm-toned mockup of food). This makes a model-side miss more probable.
3. Generate a single ad.
4. **If the ad happens to render without `#0A66C2`** — open the trace and verify:
   - `resolutionTrace.brandColorCompliance[0].checkRan === true`
   - `resolutionTrace.brandColorCompliance[0].present === false`
   - `resolutionTrace.brandColorCompliance[0].deltaE >= 15`
   - `resolutionTrace.brandColorCompliance[0].deductedScore === 10`
   - The asset's `creativeScoreResult.violations` includes `"Brand primary missing from rendered image"`.
   - The asset's `creativeScoreResult.overallScore` is reduced by 10 vs. an equivalent on-brand asset.
5. **If the ad happens to come out on-brand**: re-run with a deliberately mismatched copy a few times until you trigger the miss path; or use the contract-fixture test which forces this case deterministically.

### Skip path

1. Generate an ad with no brand colors set (workspace cleared, form empty).
2. **Verify**: `resolutionTrace.brandColorCompliance` is either absent OR every entry has `checkRan: false, skippedReason: 'no_brand_colors'`.
3. **Verify**: `creativeScoreResult.overallScore` is unchanged from baseline (no 10-point deduction).

✅ **US5 passes** when happy-path, negative-path, and skip-path all behave as described.

---

## Edge-case spot checks (~3 minutes)

| Edge case | How to verify |
|---|---|
| Brand primary set, secondary empty | Generate single ad with only primary; confirm CTA is branded and headline is unchanged from AI-chosen palette. |
| Malformed hex in form | Type `red` into the primary picker hex field; submit; confirm `inputs.brandColorSource` falls through to whatever next source has valid colors (workspace, in this case). |
| Mid-luminance primary (`#BCBCBC`) | Set primary to `#BCBCBC` (L ≈ 0.51, just past the 0.5 boundary); confirm CTA text is `#1A1A1A` (≥-clause picks near-black). |
| Retargeting with deleted cold ad | Manually orphan a retargeting record (or use a non-existent `retargetingSourceId`); confirm generation still succeeds with `brandColorSource: 'workspace'` (or `'none'` if no workspace either). |
| Carousel with one rendered slide failing decode | Inject a corrupt image into one slide buffer; confirm that slide's compliance entry has `checkRan: false, skippedReason: 'image_unanalyzable'`, sibling slides scored normally. |

---

## Regression smoke (~2 minutes)

1. Generate a single ad with **no** brand colors anywhere.
2. **Verify**: the rendered ad is indistinguishable from a pre-feature baseline (no surprise color shifts).
3. **Verify**: `inputs.brandColorSource === 'none'`, `resolutionTrace.brandColorCompliance` either absent or all-skipped.

This confirms FR-008 + FR-015: the feature is invisible to users who have not opted into brand colors.

---

## When to declare ship-ready

All five user-story sections (US1–US5) above pass on a fresh run, **and** the regression smoke passes, **and** the full `cd functions && npm test` suite is green (the new fixtures in `contractFixtures.test.ts` provide the deterministic backstop).
