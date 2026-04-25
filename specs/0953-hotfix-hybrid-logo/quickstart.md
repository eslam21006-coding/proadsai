# Quickstart: HOTFIX-E Post-Deploy Validation

**Date**: 2026-04-24
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This is the post-deploy validation walkthrough for HOTFIX-E. Run all 8 checks in order on a freshly-deployed environment (preferably staging first, then production). Each check has a clear pass/fail signal and a corresponding spec § FR / SC reference.

## Prerequisites

- The hotfix branch (`0953-hotfix-hybrid-logo`) is merged to `main` and deployed to Cloud Functions in `europe-west1`.
- The contract fixtures pass locally: `cd functions && npm test` exits 0 (specifically the HFE.8 fixtures in `contractFixtures.test.ts`).
- You have a test account with at least Pro plan (carousel access required for Check 4).
- You have at least 3 test logo PNGs available locally — one wordmark, one circular monogram, one square iconmark.

## Check 1 — Pixel-perfect UI logo on a minimalist single ad (FR-008, SC-001)

1. Open the app, start a new project.
2. Step 1 inputs: select "Minimalist" or "Corporate" creative style; English language; pick a universe like "Office Tower" or "Studio".
3. Box B: upload one logo PNG (the wordmark works best for visual confirmation).
4. Generate a single ad through Step 4.
5. Open the rendered image at full resolution.

**Pass**: the rendered ad has the wordmark in a clean corner placement (typically top-right), letters spelled exactly as in the uploaded source, no font substitution, no letter rearrangement, no "SIRM" / "SRM" distortion.
**Fail**: the wordmark is misspelled or distorted in any way.

## Check 2 — Naturally rendered environmental logo on a lifestyle ad (FR-013, SC-002)

1. Start another new project.
2. Step 1: select "Lifestyle", "Authentic", or "Documentary" style; pick a universe with a coffee or desk context.
3. Box B: upload the same wordmark PNG.
4. Generate the ad.
5. Open the rendered image.

**Pass**: the logo appears as a physical object in the scene — printed on a coffee mug the hero is holding, on the laptop lid, on a t-shirt chest, on signage behind the hero, or similar. The logo respects the surface's perspective (curved on the mug, foreshortened on the laptop), matches the scene's lighting, and reads as part of the scene rather than an overlay.
**Fail**: the logo is missing entirely, or is awkwardly grafted on like a flat sticker, or appears in a corner badge style (which means the planner picked UI mode for a lifestyle ad — review the resolution trace's `logoPipeline.perLogo[0].chosenMode`).

## Check 3 — Device screens never show fake content (FR-016, FR-017, SC-003)

1. Start a new project.
2. Step 1: pick a universe / creative mode that includes a laptop, monitor, tablet, or phone (e.g. "Office Tower" + `device_mockup` creative mode, or "Hero Photographer Studio" with a laptop in scene).
3. Generate 5 ads (single mode, re-roll 5 times).
4. Open each rendered image at full resolution and inspect every visible device screen.

**Pass (5/5)**: every device screen across the 5 renders is one of: blank dark surface, abstract gradient, out-of-focus glow, or dimmed unreadable blur. ZERO instances of fake logos, fake text, fake charts, fake dashboards, fake app UI, fake notification badges, fake terminal output, fake slide decks.
**Fail (any of 5)**: any device screen contains any text or logo or chart. Pull the assembled image prompt from the generation log and verify the `SCREEN_CONTENT_BAN_BLOCK` constant string is present verbatim. If the block is present, the model violated the ban (record the case for the post-deploy review pool); if absent, the line-2192 rewrite or the per-iteration injection is missing.

## Check 4 — Mixed-mode carousel propagation (FR-020, FR-021, FR-023)

1. Start a new project on a Pro+ account.
2. Step 1: pick a creative mode and ad type that supports 5-slide carousel; English; any universe; upload one logo.
3. Generate the full 5-slide carousel.
4. Inspect each slide.

**Pass**: slide 1 shows a clean UI-style logo (corner badge), slides 2–4 show the logo as part of the scene (mug, t-shirt, signage, etc.), slide 5 shows a UI-style logo again (matching the brand-recognition CTA pattern). Open the resolution trace and verify `logoPipeline.perLogo` for each slide reflects the expected `chosenMode`.
**Fail**: every slide has the same mode (planner default mix not applied), or slides 2–4 have UI-mode logos (storytelling slides should not), or any slide is missing the logo entirely (and the trace does not record a `drops[]` entry explaining why).

## Check 5 — Three-logo cap respected (FR-006)

1. Start a new project.
2. Step 1: pick any style; upload 5 logo PNGs into Box B (use the multi-logo upload from HOTFIX-D).
3. Generate a single ad.
4. Open the resolution trace.

**Pass**: `logoPipeline.perLogo.length` is at most 5; the count of UI entries is at most 2; the count of environmental entries is at most 3. If the planner emitted more than the per-mode cap, `logoPipeline.drops[]` records the over-cap drops (`reason: 'over_ui_cap'` or `'over_environmental_cap'`).
**Fail**: more than 2 UI entries appear in `perLogo`, or more than 3 environmental entries, or the `drops[]` log is missing for over-cap entries.

## Check 6 — UI logo width and opacity clamped (FR-004, Q3, Q4)

1. (Engineering check, not user-visible.) Inspect 10 generation records' resolution traces.
2. For each, pull `logoPipeline.clamps[]` if present.

**Pass**: any clamp event has `clampedValue` strictly within [5, 18] for `widthPct` and within [0.85, 1.0] for `opacity`. Spot-check the rendered ad for any clamped record: the logo size and opacity should look correct (not the raw out-of-bound value).
**Fail**: a clamp event records a `clampedValue` outside the allowed range, OR a logo on a rendered ad clearly violates the size bounds (e.g. fills > 30% of canvas width).

## Check 7 — UI compositing failure fail-soft delivery (FR-027)

1. (Engineering check, requires manual fault injection.) In a staging environment, replace one of the test logo files with a deliberately corrupt PNG (random bytes with a `.png` extension).
2. Upload that corrupt PNG plus one valid logo PNG.
3. Step 1: pick a Minimalist style so the planner picks UI mode for both.
4. Generate a single ad.

**Pass**: the ad is delivered (no error toast, no failed generation). The valid logo appears at its planned UI placement. The corrupt logo's planned zone is left clear in the rendered image. The resolution trace records `logoPipeline.softWarnings[]` with `reason: 'composite_failed'` (or `'corrupt_source'`) for the corrupt logo's `logoIndex`.
**Fail**: the whole generation hard-fails, or the valid logo is also missing, or no soft warning is recorded.

## Check 8 — Backward compatibility on legacy saved projects (FR-025, SC-008)

1. Pick 5 saved projects that were created BEFORE this hotfix deployed (any project from before 2026-04-24 should qualify; check the project's `createdAt`).
2. Open each one in the saved-project loader and re-render Step 4.

**Pass (5/5)**: every project loads and re-renders without error. The rendered image looks substantially the same as the original (any legacy logo is rendered by the model in environmental style — no UI compositing risk). The resolution trace records `logoPipeline.perLogo[i].chosenMode === 'environmental'` for any legacy logo.
**Fail (any of 5)**: a project errors on load (likely a parser regression in `parseStructuredBuildPlanResponse()` — verify the `logoPlacements` defaulting), or a legacy logo gets UI compositing (defaulting was inverted), or the rendered image is meaningfully different from the original.

## Sign-off

All 8 checks pass → HOTFIX-E is launch-ready on the deployed environment.
Any check fails → file the failing case under `docs/launch-incidents/` with the resolution trace JSON attached and roll back per the launch-rollback runbook.

## What is NOT validated by this quickstart

- Per-pixel logo color accuracy (deferred to a post-launch quality pass; HFE.5 covers shape/text fidelity).
- Environmental-logo perspective accuracy beyond "looks like part of the scene" (out of scope per spec — this is model-quality, not deterministic).
- Reflow interaction (HOTFIX-F sibling work — verified by HOTFIX-F's own quickstart).
- Magic-edit interaction (Phase 11; not required for this hotfix).
