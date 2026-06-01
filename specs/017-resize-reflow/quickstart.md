# Quickstart — Phase 17 Resize & Reflow (Regenerated 2026-05-29)

Manual smoke-test scenarios to verify Phase 17 end-to-end after implementation. Run against `firebase emulators:start` + `npm run dev`.

## Prerequisites

- Logged-in user on a paid plan (Starter, Pro, or Scale — all 6 ratios MUST be available; per FR-008a + Clarifications Q2).
- Account has ≥40 credits (covers all five scenarios at the unified 5-credit cost with buffer).
- At least one completed single ad, one completed batch (4 ads), and one completed carousel (7 slides) in history.
- The method-selector UI (Auto/Quick/Fresh dropdown) MUST be absent — per FR-011 + Assumptions, method selection is never user-facing. (Smoke check: open Step 4 on any generation; the only Resize control should be a single button → ratio picker → preview → Generate Resize. No method dropdown anywhere.)

## Scenario 1 — Single-ad resize 1:1 → 9:16 with English copy (P1, happy path)

1. Open the generated 1:1 single ad in Step 4.
2. Click the **Resize** button. The size picker opens.
3. Verify all 6 ratios are visible: 1:1 (marked **Current** and inactive — FR-021), 4:5, 3:4, 4:3, 9:16, 16:9. (FR-001)
4. Click **9:16**. A CSS preview appears showing the existing 1:1 image inside a 9:16 frame via `object-fit: cover`. Label: "Preview — click Generate to create the final resized version" (FR-003, FR-004). Preview must appear within 1 s (SC-006).
5. The confirm button reads "Generate Resize — 5 credits" (single scope × unified 5-credit cost). (FR-005, FR-006)
6. Click Generate Resize. Wait for completion (≤30 s — SC-001). The displayed image swaps to a fresh 9:16 output.
7. Verify a single 9:16 variant chip is now visible on the generation card. Click the 1:1 chip — display swaps back to original. Click 9:16 — display swaps forward. (FR-017)
8. Verify exactly 5 credits were debited.
9. Verify the new 9:16 image has all 4 text elements (headline, sub-headline, caption, CTA) fully inside the safe zone — no clipping. (FR-011 + FR-012, SC-004)
10. Open Firestore emulator UI → `generations/{genId}` → `variantChips[]` contains exactly one entry: `{ ratio: '9:16', url: <...>, generatedAt: <...> }` — and **no `method` field on the chip itself** (FR-017a — method is not part of chip identity).
11. Same doc → `resolutionTrace.reflowHistory[]` has one new entry with `method: 'rerender'` (internal — magnitude ≈ 0.78 ≥ 0.30), `brandColorReinforced: <true if brand colors were set>`, `textReflowOverflow: false` (assuming no reduction was needed).

## Scenario 2 — Batch_all 4 ads at 4:5 → 9:16 with one induced failure

1. Open a 4-ad batch result at 4:5.
2. Click Resize. The size picker opens with all 6 ratios.
3. Click **9:16**. A scope selector appears: "Resize this image" / "Resize all 4 images". (FR-002)
4. Choose "Resize all 4 images". CSS preview shows; confirm button reads "Generate Resize — 20 credits" (4 × 5).
5. (Optional — to test partial-success path) Before clicking Generate, in DevTools network tab, throttle / block one Gemini callable response for the duration. Click Generate Resize.
6. Verify 3 items succeed, 1 fails. Failed item shows "Resize failed — try again" indicator; its image stays unchanged. (FR-014, FR-019)
7. Verify exactly 15 credits debited (3 × 5), not 20. (FR-006 + SC-007)
8. Verify a single 9:16 chip is added to the parent generation (one chip per ratio for the whole batch — chips track whole-output ratio variants).

## Scenario 3 — Carousel per-slide resize at 4:5 → 1:1 with Arabic copy (RTL path)

1. Open an Arabic 7-slide carousel at 4:5. Navigate to slide 3.
2. Click Resize → size picker opens with all 6 ratios.
3. Click **1:1**. Scope selector shows: "Resize this slide" / "Resize all 7 slides". (FR-002)
4. Choose "Resize this slide". CSS preview shows slide 3 at 1:1. Confirm button reads "Generate Resize — 5 credits" (single slide × unified 5-credit cost). (FR-006 unified — outpaint route, but still 5 credits.)
5. Click Generate Resize. Wait for completion. Only slide 3's image swaps to the 1:1 result. Slides 1, 2, 4–7 remain at 4:5. (FR-015, FR-016)
6. Verify exactly 5 credits debited.
7. Verify Arabic text on the resized slide is right-aligned, uses an Arabic font (Cairo / Tajawal), and the copy strings (hook, sub-headline, caption, CTA) on slide 3 match the original strings **verbatim** (Clarifications Q3 — reflow never rewrites copy; cultural-compliance scan does not re-run).
8. The trace entry has `method: 'outpaint'` (internal — magnitude ≈ 0.25 < 0.30) and `textReflowOverflow` absent (outpaint preserves text via the locked region; no recomposition occurs — see research R-003).
9. `output.carouselSlides[2].imageUrl` is updated. **`variantChips` does NOT receive a new entry** — slide-scope resizes don't add chips per data-model invariant 5.

## Scenario 4 — Same-ratio no-op pinned to original metadata.aspectRatio (FR-021)

1. Open any generation. Suppose `metadata.aspectRatio = 1:1`.
2. Click Resize → size picker opens. The 1:1 button is marked **Current** and inactive. ✓
3. Click any ratio (e.g., 9:16) and complete the resize. Now there's a 9:16 chip and the displayed image is the 9:16 variant.
4. Re-open the size picker. **The 1:1 button is STILL marked Current and inactive** — even though the displayed image is now the 9:16 variant. (FR-021 — no-op check uses original `metadata.aspectRatio`, NOT the currently displayed chip's ratio.)
5. **Clicking 9:16 in the picker is NOT a no-op** — it would re-render from the 1:1 source (per FR-018). Confirm by clicking 9:16: the size picker opens preview → Generate Resize is offered → if confirmed, 5 credits are charged and the 9:16 chip is overwritten with a fresh re-render.
6. (Backend safety net) From a REST client, fire `reflowImage({ generationId, targetAspectRatio: '1:1', method: 'auto', scope: 'single' })` against this generation. Response: `{ success: true, outcomes: [{ success: true, method: null, creditsCharged: 0, outputUrl: <same as source> }], totalCreditsCharged: 0 }`. (No backend work; no credit charge.)

## Scenario 5 — Backend auto-routing is silent and audited

(Replaces the prior method-override scenario — method is no longer user-facing per FR-011.)

1. Open a 16:9 single ad and resize to 9:16. (Magnitude ≈ 3.16 — well above 0.30 — router will pick re-render.)
2. Click Resize → 9:16 → Generate Resize (5 credits). Wait for completion.
3. Verify a 9:16 chip is added. Open Firestore emulator UI → `generations/{genId}.resolutionTrace.reflowHistory[]` last entry has `method: 'rerender'` (the silent backend choice). FR-020 audit trail intact.
4. Open a 4:5 single ad and resize to 1:1. (Magnitude ≈ 0.25 — below 0.30 — router will pick outpaint.)
5. Verify a 1:1 chip is added. Same Firestore inspection: last `reflowHistory[]` entry has `method: 'outpaint'`. Same 5-credit charge (FR-006 unified cost — outpaint and re-render both cost 5).
6. **User never saw the method** — there was no Auto/Quick/Fresh dropdown anywhere in the flow. (FR-011 + Assumptions verified.)

## Acceptance checklist (run after Scenarios 1–5)

- [ ] Method-selector UI is absent from Step 4 entirely (no Auto/Quick/Fresh dropdown).
- [ ] All 6 ratios visible in the size picker (no plan-tier gating).
- [ ] The size picker's "Current" indicator follows the original `metadata.aspectRatio`, not the displayed chip.
- [ ] CSS preview renders in ≤1 s every time, costs 0 credits every time.
- [ ] Generate Resize button shows "X credits" where X = 5 × items in scope.
- [ ] Single, batch_all, carousel_all, carousel_slide all complete end-to-end at 5 credits per successful item.
- [ ] Partial-success on batch/carousel charges credits only for successful items.
- [ ] Arabic carousels preserve verbatim copy and use RTL composition on re-render outputs.
- [ ] Variant chips accumulate by ratio only, max 6 chips per generation. No chip has a `method` field on it.
- [ ] `resolutionTrace.reflowHistory` records every successful reflow with the silent backend route in `method`.
- [ ] No more than 5 items run in parallel per resize action.
- [ ] Resizing a chained variant always uses the original `output.imageUrl` as source (FR-018) — no chaining.
- [ ] Legacy generations without `output.imageUrl` reject with `failed-precondition: 'legacy_no_original'`.

## Anti-tests (must NOT happen)

- [ ] No Auto/Quick/Fresh dropdown anywhere in the Step 4 UI.
- [ ] No chip with a `method` field at rest (data-model invariant).
- [ ] No outpaint cost different from re-render cost (both are 5 credits).
- [ ] No Arabic copy ever gets rewritten on reflow (Clarifications Q3).
- [ ] No retry storm on user-pinned method failure (user can't pin a method).
- [ ] No more than 6 chips per generation (key-space cap).
- [ ] No chain back to a variant chip as source — resizing always uses `output.imageUrl` (FR-018).
