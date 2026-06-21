# Quickstart: Independent Multi-Size Ad Generation (Phase 17)

Manual verification guide for the feature. Assumes a Pro/Scale account with credits. Provider `MODEL_PROVIDER='openai'` (gpt-image-2).

## Prerequisites

```powershell
# from worktree root
npm install ; cd functions ; npm install ; cd ..
npm run build            # tsc + vite build (frontend)
cd functions ; npm run build ; cd ..   # functions tsc
```

Run existing test baseline before changes (must stay green afterward):

```powershell
cd functions ; npm test ; cd ..
npm test                 # frontend step2OptionalFields suite
```

Baseline (captured 2026-06-21, T001): culturalCompliance 929, copyQuality 71, copyStructure 206, conditionalCopyFields 77, step2OptionalFields 22, modeFormatValidator 6144 fuzz (~7,690+ total, 0 failed). Exit code 0.

## Flow A — Pre-select multiple sizes (User Story 1)

1. Open the generator, complete a brief (Arabic and English both), reach the size selector (Step 2/3).
2. Select **Square 1:1** + **Story 9:16** (multi-select via `selectedSizes`). Confirm the credit cost shows **10** before generating.
3. Press **Generate**.
   - ✅ Anchor (Square) generates first via the existing path.
   - ✅ Story fans out via `generateSizeVariant` using the Square as visual reference.
   - ✅ Both designs render **all** non-null copy elements (headline + subheadline/CTA/benefit where present). **Story shows the CTA** (the old reflow bug is gone — SC-002).
   - ✅ Hero, environment, and palette are recognizably consistent across both; no stretched/merged-limb distortion (SC-003).
4. Select **all three sizes** on a fresh brief → cost shows **15**, three grouped designs produced.

## Flow B — Resize after generation (User Story 2)

1. Generate at **Square 1:1** only.
2. Click **Resize**, choose **Story 9:16**.
   - ✅ Cost shows **5** before confirming.
   - ✅ A fresh Story design appears (reference = the Square original), with all copy elements; the Square remains available (`mockupHistory`).
3. Click **Resize → Square 1:1** again (already generated).
   - ✅ "Already generated at this size", **0 credits** charged (FR-011).
4. With a brief that had **no subheadline (null)**, resize → ✅ resized design has no subheadline (FR-006).
5. With a **user-uploaded reference**, resize → ✅ uses the uploaded reference, not the generated image (FR-008).

## Flow C — Batch & carousel (User Story 3)

1. **Batch of 4**, pre-select **Square + Story** → cost **40**; press Generate.
   - ✅ 8 designs, per-item/per-size spinners resolve independently, grouped by size.
   - ✅ Force a failure (e.g. throttle) → successes shown, failed items offer **retry**; credits for failures refunded (net = 5 × successes).
2. **Carousel of 5 slides** → generate, then **Resize all slides** to a new size.
   - ✅ Carousel multi-size is available only via resize (no pre-select — VR-2).
   - ✅ 5 per-slide generations; 3-succeed/2-fail leaves 3 shown + retry on 2 (SC-006).

## Credit accounting check (SC-005)

- Before each run the total is shown; insufficient credits blocks with required-vs-available and **nothing is charged**.
- After a partial-failure run, balance reflects refunds (net = 5 × successful designs).
- Retrying a failed variant charges exactly once more on success — never twice (FR-014).

## Regression checks

- Single-size generation behaves exactly as before (no new path for the anchor).
- Arabic RTL + cultural compliance unaffected (run an Arabic brief through Flow A).
- HOTFIX-F code is present but commented with the reversibility note; `reflowImage` callable no longer invoked by the UI.
- Re-run the full test baseline → 0 new failures (SC-007).

## Done criteria

All acceptance scenarios in spec.md US1–US3 pass; SC-001…SC-007 verified; test baseline green.
