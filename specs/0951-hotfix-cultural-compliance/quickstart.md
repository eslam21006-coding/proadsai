# Quickstart: Cultural Compliance Hotfix — Post-Deploy Validation

**Feature**: `0951-hotfix-cultural-compliance`
**Date**: 2026-04-23

This walk-through verifies that the hotfix ships to production correctly. Run every step after deploy. Every check has a clear pass/fail line. Any failure blocks launch.

## Prerequisites

- Deploy HFC.1–HFC.9 to production.
- Sign in with both an Arabic-configured test account and an English-configured test account.
- Have the `r_wine_cellar`, `r_private_jet`, and `r_rooftop_bar` universe ids ready for manual selection checks.

## Check 1 — Arabic picker hides the seven blocked environments (FR-007, SC-002)

1. Log in as the Arabic test account.
2. Open Step 1 and set the ad language to `ar_fusha` (or `ar-SA`, `ar-EG` — any `ar*` locale).
3. Open the universe picker and scroll the full list.

**PASS**: None of the following entries appear: Wine Cellar, Wine Tasting Room, Rooftop Bar, Cigar Lounge, Tuscan Vineyard, Dance Studio, Premium Sushi Counter.
**FAIL**: Any of the above appears. Revert and investigate.

## Check 2 — English picker shows every environment (FR-008, SC-004)

1. Log in as the English test account.
2. Open Step 1 and set the ad language to `en`.
3. Open the universe picker.

**PASS**: Wine Cellar, Rooftop Bar, Cigar Lounge, Vineyard, Dance Studio, and every other universe are visible.
**FAIL**: Any of the above is hidden.

## Check 3 — Arabic ad in `r_private_jet` renders without champagne (FR-004, FR-012, FR-016, SC-001)

1. In the Arabic test account, pick `r_private_jet` (a universe that historically had `'champagne'` in its motifs).
2. Generate a single ad with a simple coaching offer. Wait for the render.
3. Visually inspect the rendered image. Also inspect the generated build plan (via the dev inspector or the resolution-trace document in Firestore).

**PASS**: The image contains no champagne flute, no wine glass, no drinking vessel implying alcohol. The build-plan text contains the `CULTURAL COMPLIANCE (MANDATORY — Arabic market):` block BEFORE the `TECHNICAL_PROMPT` section. The motif list passed to the prompt contains `sparkling drinks`, not `champagne`.
**FAIL**: Any alcohol element is visible in the render, or the compliance block is missing from the build plan.

## Check 4 — Arabic ad with human figures renders modest wardrobe (FR-019, FR-020, SC-003)

1. In the Arabic test account, pick a universe that typically includes a hero figure (e.g., `r_executive_office`). Choose a creative mode that renders a person (e.g., `standard_hero`).
2. Generate and inspect the render AND the build-plan wardrobe section.

**PASS**: The figure is dressed conservatively per FR-019 (shoulders covered, no deep neckline, lower body covered to below the knee or trousers for female figures; business-casual minimum for male figures). The build-plan wardrobe section contains the `ARABIC MARKET WARDROBE RULES:` block.
**FAIL**: Figure is shown in a tank top, revealing neckline, short skirt/shorts, swimwear, or any combination of the forbidden items; or the wardrobe block is missing.

## Check 5 — Arabic carousel has compliance block on every slide (FR-017, SC-005)

1. In the Arabic test account, configure a carousel of at least 4 slides.
2. Generate. Retrieve the per-slide build-plan artifacts (from Firestore `generations/{genId}.output.carouselSlides[*]` or the function logs).

**PASS**: Every slide's prompt contains the `CULTURAL COMPLIANCE (MANDATORY — Arabic market):` block, including slide 3 and slide 4. The ARABIC MARKET WARDROBE RULES block is also present if the slide has a figure.
**FAIL**: Any slide ≥ 2 is missing the compliance block.

## Check 6 — Post-validation trigger-word scan catches leaks (FR-022, FR-023, FR-024, SC-006)

Skip this manually; it is the hardest check to force without a test stub. Instead, run the HFC.9 fixture suite in the production functions environment.

```bash
cd functions
npm test -- contractFixtures.test --testNamePattern="cultural compliance"
```

**PASS**: All cultural-compliance fixtures pass, including the image-prompt-layer scan fixture, the ad-copy-layer scan fixture, the both-layer aggregation fixture, the English no-op fixture, and the table-invariants fixture.
**FAIL**: Any fixture fails. The resolution trace must show `culturalViolation: { caught: true, matchedWords: [...], sourceLayer: 'imagePrompt' | 'adCopy' | 'both' }` for the two scan fixtures.

Additionally, inspect one recent Arabic generation's `resolutionTrace` document in Firestore for production data:

1. Open `generations/<any Arabic genId>` in the Firestore console.
2. Look at the `resolutionTrace` sub-document.

**PASS**: Either the `culturalViolation` field is absent (nothing caught — ideal) or it has the shape `{ caught: true, matchedWords: [...], sourceLayer: ... }` with plausible values.
**FAIL**: Malformed shape, `caught: false` emitted, or the field leaks into the user-facing API response.

## Check 7 — English ad is unaffected by guardrails (FR-008, FR-015, FR-021, FR-025, SC-004)

1. In the English test account, pick `r_wine_cellar` and generate a single ad.
2. Inspect the build plan and the final image prompt.

**PASS**: The image renders a wine cellar with wine (or equivalent) — the English market freedom is preserved. The build plan contains NO `CULTURAL COMPLIANCE (MANDATORY — Arabic market):` block and NO `ARABIC MARKET WARDROBE RULES:` block. The `resolutionTrace.culturalViolation` field is absent.
**FAIL**: Any Arabic guardrail text is present in the English prompt, or the English image is substituted with non-alcoholic content.

## Check 8 — Mid-session language switch and saved-project load behavior (FR-009, FR-010, FR-011)

Three sub-checks:

**8a — Language switch auto-clears environment**:

1. In Step 1, set `adLanguage` to `en`, pick `r_wine_cellar`, fill in a hook and subhead.
2. Flip `adLanguage` to `ar_fusha`.
3. Observe the state.

**PASS**: The universe picker is now empty (the `r_wine_cellar` selection was auto-cleared). The hook text and subhead text are preserved. An inline prompt on the picker says roughly "Pick an Arabic-safe environment" (English) / equivalent Arabic. The Generate button is disabled.
**FAIL**: Environment stays set, or other fields were reset, or Generate is enabled.

**8b — Pre-hotfix saved project loads with full data preserved**:

1. Use a test saved project (created pre-hotfix or manually seeded) whose `universeId` is `r_wine_cellar` and `adLanguage` is `ar_fusha`. The project has hooks, concept text, and build-plan history.
2. Load the project.

**PASS**: All fields (hook, subhead, concept, build-plan history, mockup history, copy) are visible and editable. The universe picker shows the inline "Pick an Arabic-safe environment" prompt. The Generate button is disabled until the user picks an Arabic-safe universe. No modal interrupted the load.
**FAIL**: Load is blocked by a modal, any field was reset, or Generate is enabled.

**8c — Legacy `r_sushi_bar` id remaps without error**:

1. Use a test saved project whose stored `universeId` is the legacy `r_sushi_bar`.
2. Load the project.

**PASS**: The project loads and the resolved universe is `Premium Sushi Counter` (`r_sushi_counter`). No unknown-universe error appears in the console or on screen. If the saved project is Arabic-configured, the same picker-prompt-and-blocked-Generate behavior as 8b applies because `r_sushi_counter` is also `arabicSafe: false`.
**FAIL**: Load fails, or a console error mentions an unknown universe id.

## Rollback criteria

Any FAIL above blocks launch. Roll back with:

```bash
# Revert the hotfix PR
git revert <merge-sha>
npm run build && firebase deploy --only functions,hosting
```

No data rollback is required: the `arabicSafe` field removal is backward-compatible (older code never read it); the `resolutionTrace.culturalViolation` field removal is backward-compatible (older traces never wrote it); the `r_sushi_bar` → `r_sushi_counter` rename can be reverted by restoring the old id in the data file (the read-side legacy map on the loader becomes a no-op).
