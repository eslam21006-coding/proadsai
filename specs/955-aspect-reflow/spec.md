# Feature Specification: HOTFIX-F — Deterministic Aspect Ratio Reflow

**Feature Branch**: `955-aspect-reflow`
**Created**: 2026-04-25
**Status**: Draft
**Input**: User description: "create the spec of \"HOTFIX-F — Deterministic Aspect Ratio Reflow (CRITICAL — P0)\" that's mentioned in \"docs/LAUNCH_MATRIX.md\""

## Overview

The current "Resize" / aspect-ratio reflow path sends the already-rendered ad back to the image-generation model and asks it to "redraw the same ad at a new aspect ratio." This is a **generative edit**, and a generative edit is the wrong tool for an aspect-ratio change: when the canvas changes shape by more than ~30 % (for example 4:5 → 9:16, or 1:1 → 9:16), the model rebuilds the composition from scratch and stretches or squashes the subject to fill the new canvas. The most common visible failure is a vertically-elongated face on the new ratio — the hero's head and features distort, the wordmark on a t-shirt warps, and the price stack on the offer overlay mis-aligns. The ad is unshippable.

Reflow is, by nature, **a canvas-shape change, not a creative change**. The hero, the text, the colors, the logos, and the offer overlay are all already correct. The only thing that needs to change is *the framing* — what is visible on the new canvas. Once it is framed as "fit the existing composition into a new canvas shape," there are exactly two correct tools, and neither of them is a generative edit:

1. **Smart outpaint (small ratio change)** — extend only the outer margins of the rendered image so the canvas fills the new shape, with the **center of the image (the hero, the text, the offer, the logos) byte-identical to the original**. The model is allowed to invent only the new margin pixels. This is fast, cheap, preserves the composition exactly, and is right whenever the new ratio is similar enough that margin extension is sufficient.
2. **Re-render from plan (large ratio change)** — load the saved build plan that produced the original ad, swap the `aspectRatio` field to the new ratio, and run the **full rendering pipeline fresh** (build-plan → image render → text compositing → logo compositing → offer overlay). This is not an edit — it is a brand-new render of the same concept at the new ratio's safe zones. It costs more credits and takes longer, but it is the only correct tool when the canvas shape has changed enough that margin extension would cut off the hero or stretch text.

This hotfix replaces the generative-edit reflow path with a **deterministic two-route reflow router**: a magnitude check picks outpaint or re-render automatically, with a user-visible override for cases where the auto-router picks the wrong one. The user's existing rendered image is never sent back through a generative edit again.

## Clarifications

### Session 2026-04-25

- Q: How is "magnitude of ratio change" computed for the auto-router? → A: Compute each ratio as a numeric value (width ÷ height), call them `current` and `target`. Compute the **symmetric fold-change** as `magnitude = max(target / current, current / target) − 1`. If the magnitude is **less than 30 %**, route to outpaint. If it is **30 % or more**, route to re-render. The 30 % threshold is the empirical break-even point in the launch matrix between "margin extension is enough" and "the canvas has changed shape enough that the composition itself must be re-laid-out." The fold-change formula is **direction-symmetric** (1:1 → 4:5 has the same magnitude as 4:5 → 1:1) and treats the ratio change as a multiplicative shape change. Examples for the six supported ratios: 1:1 ↔ 4:5 = 25 % → outpaint. 4:5 ↔ 3:4 ≈ 6.7 % → outpaint. 1:1 ↔ 9:16 ≈ 77.8 % → rerender. **4:5 ↔ 9:16 ≈ 42.2 % → rerender** (the headline failure case from the launch matrix). 1:1 ↔ 16:9 ≈ 77.8 % → rerender. 4:3 ↔ 16:9 ≈ 33.3 % → rerender.
- Q: What region of the rendered image is locked during outpaint? → A: The **center 70 %** of the image (35 % inset on each side, vertically and horizontally) is locked. Only the outer 30 % padding (the margins of the new canvas) is regenerated. This guarantees that the hero, the headline, the subhead, the CTA button, the offer overlay (price / total-value / savings), and any UI logos are preserved pixel-identical from the original render. The outpaint engine receives a binary mask: white in the outer margin (regenerate this), black in the center 70 % (do not touch this).
- Q: What happens when the outpaint engine fails (transient model error, mask processing error, image-processing error, the engine returns an output where the locked center pixels are no longer pixel-identical to the original)? → A: Fall back automatically to the re-render-from-plan route for that same target ratio. Record the fallback on the resolution trace with the original outpaint failure reason. Charge the user only for the route that ultimately succeeded (do not double-charge). Never deliver a reflow output where the locked center has drifted from the original.
- Q: What happens when re-render-from-plan cannot be performed because the saved build plan is missing or corrupt on a legacy generation record? → A: For that case, fall back to outpaint regardless of the magnitude (better to ship a slightly-imperfectly-framed reflow than to fail the user's resize action). Record the fallback on the resolution trace. If outpaint also fails on a missing-plan record, surface a clear error to the user telling them this generation record predates plan persistence and recommending a fresh generation; do not silently deliver the original generative-edit reflow as a fallback.
- Q: How is the credit cost split between outpaint and re-render? → A: Re-render-from-plan costs **the same as a fresh single-image generation** (it is, by definition, a fresh generation at a new ratio). Outpaint costs **less than a fresh generation** because only the margin pixels are regenerated, not the whole image; the exact discount is set by the platform pricing matrix and is not part of this spec. When the auto-router falls back from outpaint to re-render mid-flight (per the previous clarification), the user is charged only for the route that ultimately succeeded.
- Q: When the user's project is a batch or a carousel rather than a single ad, does the reflow router run per item? → A: Yes — the magnitude check, the outpaint/re-render decision, and the success/failure handling all run **per item** (per batch variant, per carousel slide). One slide may be outpainted while another slide of the same carousel is re-rendered, because the per-slide creative might cross the 30 % threshold differently on edge ratios; in practice, since all slides of one reflow share the same source-and-target ratio pair, all per-slide decisions are usually identical, but the router does not assume so. The user is charged per item that was actually reflowed.
- Q: What is the user-visible interface to override the auto-router? → A: Step 4's existing Resize control gains a small method selector with three radio options: **Auto (recommended)**, **Quick (outpaint)**, and **Fresh render (re-render)**. The default is **Auto**. The user picks Auto unless they have already seen the auto-router pick the wrong tool for their specific creative; the override exists so they are not stuck with the auto choice when their judgment differs.
- Q: Where does a reflow output land in the persistence model? → A: A reflow is a **variant** of the source generation, not a new generation. The source generation record remains canonical: the new `{ url, ratio }` is appended to the source's `mockupHistory` (the existing Phase 17 shape), and the per-item reflow record (source ratio, target ratio, percent change, method attempted, override flag, fallback flag, fallback reason, final method) is appended to the source's `resolutionTrace.reflowHistory[]`. No new `generations/{id}` document is created for a reflow. Favorites and saved-projects remain scoped to the source generation. Re-render-from-plan always loads the **original** generation's saved build plan (per FR-011), so re-reflowing a reflow uses the canonical plan rather than any earlier reflow's intermediate state.
- Q: How strictly is the locked-region verification check defined? → A: **Byte-identical decoded pixels.** The verification compares the source image and the outpaint output as decoded pixel buffers (post-decode, pre-storage); every pixel inside the locked center 70 % MUST match exactly across all channels. No perceptual tolerance, no ΔE allowance, no hash-distance allowance — any drift, however small, triggers the FR-014 fallback to rerender. This implies the outpaint engine MUST operate losslessly on the locked region; a Sharp-based pure-margin-extension engine meets this bar trivially because it never touches the locked pixels (it only allocates new outer-margin pixels). A model-driven outpaint engine can be considered if and only if it outputs a lossless format (PNG / lossless WebP) and respects the mask exactly. The "deterministic" in this hotfix's name is non-negotiable.
- Q: When a multi-item reflow (carousel or batch) has partial failures, what does the user receive? → A: **Best-effort with per-item reporting.** Successful items append to the source generation's `mockupHistory` immediately and independently. Failed items surface a per-item error in the response (item index + failure reason + final method attempted). The user retries failed items individually from Step 4. The source generation's `mockupHistory` is NOT rolled back when partials occur — the user keeps every successful re-render, even if a sibling slide failed. The user is charged only for items that ultimately succeeded. Carousel coherence at the new ratio (i.e., the user wanting all 5 slides at 9:16) is the user's call to retry the failed slides; the system does not auto-retry, and it does not delete successful slides to enforce all-or-nothing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A 4:5 → 9:16 reflow no longer stretches the hero's face (Priority: P1)

A user has just rendered a portrait ad at 4:5 and now wants a 9:16 vertical-story version for Reels and Stories. Today the user clicks Resize → 9:16, and the rendered image comes back with the hero's face visibly elongated (vertical stretch), the wordmark on a logo or a t-shirt warped, and the offer overlay mis-aligned. The user expects the resize to produce a new 9:16 image that **looks like the same ad at the new ratio** — same person, same proportions, same text, same offer, same logos, same colors — without any stretching, squashing, or warping of the subject.

**Why this priority**: Vertical-stretch reflow is the single most-reported failure on the current pipeline and a hard publication blocker. A stretched face is unshippable on its own. 4:5 → 9:16 is also the highest-volume reflow path in the product (every portrait ad eventually gets a Reels variant), so this single fix removes the largest single source of post-render rejections.

**Independent Test**: Render a 4:5 ad with a clear hero face. Click Resize → 9:16 with method = Auto. Confirm that (a) the new 9:16 image has the same face proportions as the source (head height-to-width ratio within ±5 %), (b) the rendered text strings are identical character-for-character to the source, (c) the offer overlay (price / total-value / savings) is positioned in a 9:16-appropriate safe zone with no overlap and no missing element, and (d) the resolution trace records that re-render-from-plan was used (auto-router picked re-render because the symmetric fold-change is ≈ 42.2 %, above the 30 % threshold).

**Acceptance Scenarios**:

1. **Given** a 4:5 portrait ad has been fully rendered, **When** the user reflows to 9:16 with method = Auto, **Then** the auto-router selects re-render-from-plan, the saved build plan is loaded with `aspectRatio` swapped to 9:16, the full pipeline runs fresh, and the output 9:16 image has no vertical stretching of the hero.
2. **Given** the source ad has a logo on a t-shirt or a coffee mug (an environmental logo), **When** the 9:16 re-render runs, **Then** the new image has the logo on the same kind of object, naturally rendered at the new ratio's framing — not the old image's logo region stretched.
3. **Given** the source ad has an offer overlay (price / total-value / savings), **When** the 9:16 re-render runs, **Then** the offer overlay is composited fresh into the new 9:16 safe zones, no element overflows, and no element is dropped.
4. **Given** the user expected the new 9:16 image to share the same hero, the same hook copy, the same colors, and the same offer, **When** the user inspects the result, **Then** all four are preserved (because the build plan that produced them is reused), even though the canvas shape has changed.

---

### User Story 2 — A 1:1 → 4:5 reflow preserves the hero and the offer pixel-identically (Priority: P1)

A user has rendered a 1:1 square ad and now wants a 4:5 portrait variant for the feed. Today the user clicks Resize → 4:5 and the rendered image comes back with the hero subtly redrawn — the face is *similar* but not the same person, a button is in a slightly different shape, the offer overlay numbers are re-laid-out and one or two are missing. The user expects the resize to produce a 4:5 image where the **center of the image is byte-identical to the source 1:1**, with the new top and bottom margin pixels invented seamlessly to fit the taller canvas.

**Why this priority**: Square-to-portrait reflow is the second-highest-volume reflow path in the product, and the user's expectation (and the correct behavior) is that the visible content does not change at all — only the framing does. A "similar but not the same" hero on the second variant breaks brand recognition across the campaign. Tied at P1 with Story 1 because the two routes (small-change outpaint and large-change re-render) together are the full router; a P0 hotfix needs both routes correct.

**Independent Test**: Render a 1:1 ad. Click Resize → 4:5 with method = Auto. Confirm that (a) the auto-router selects outpaint (symmetric fold-change is 25 %, under the 30 % threshold), (b) the center 70 % of the new 4:5 image is pixel-identical to the corresponding center region of the source 1:1, (c) only the new top/bottom margin pixels differ, (d) the resolution trace records that outpaint was used and which region was locked.

**Acceptance Scenarios**:

1. **Given** a 1:1 square ad has been rendered, **When** the user reflows to 4:5 with method = Auto, **Then** the auto-router computes a symmetric fold-change of 25 %, selects outpaint, and the output 4:5 image's center 70 % (35 % inset on each side) is pixel-identical to the source's corresponding region.
2. **Given** the outpaint engine receives the source image and a binary mask (white margins, black center 70 %), **When** the new margin pixels are produced, **Then** they continue the source background seamlessly (color, lighting, gradient continuation) — no visible seam at the lock boundary.
3. **Given** the source ad already had an offer overlay and UI logo composited onto it, **When** the outpaint reflow runs, **Then** those overlays are preserved exactly because they are inside the locked center 70 %.
4. **Given** the user reflows from 4:5 → 3:4 (a ~6.7 % symmetric fold-change), **When** the auto-router picks a route, **Then** outpaint is chosen and runs.
5. **Given** outpaint has finished, **When** the resolution trace is inspected, **Then** it records that outpaint ran, the locked-region inset percentages, the source ratio, and the target ratio.

---

### User Story 3 — A user can force the route the auto-router did not pick (Priority: P2)

A user has just used Auto reflow on a hero photo where outpaint was technically the right call by the magnitude rule (small percent change), but the new margins produced by the model are visibly seamy. The user expects to be able to switch the same reflow over to **Fresh render** (re-render-from-plan) without leaving Step 4, paying the higher credit cost, and getting a clean composed-from-scratch result at the new ratio. Conversely, when the auto-router picks re-render but the user only wants the cheap quick reflow and accepts the framing risk, the user expects to be able to switch to **Quick** (outpaint).

**Why this priority**: The auto-router is right most of the time but cannot be right every time, because creative judgment is involved (some compositions extend cleanly past the lock boundary; others do not). The override is what makes the hotfix robust to corner cases without growing the auto-router into a policy-laden decision tree. P2 because the auto-router alone (Stories 1–2) covers release-blocking failures; the override polishes the tail.

**Independent Test**: Render an ad. Use Resize and explicitly pick Quick (outpaint) for a target ratio where the auto-router would have picked Fresh; confirm outpaint runs. Then use Resize and explicitly pick Fresh (re-render) for a ratio where the auto-router would have picked Quick; confirm re-render runs. Inspect the resolution trace and confirm that, for both runs, the trace records `method: 'outpaint'` or `method: 'rerender'` matching the user's explicit choice (not the auto recommendation).

**Acceptance Scenarios**:

1. **Given** the user opens the Resize method selector in Step 4 (which may be collapsed by default to show only the current selection with an Edit toggle, per research.md R8), **When** the user expands the selector, **Then** three radio options are visible: Auto (recommended), Quick (outpaint), Fresh render (re-render), and Auto is the default selection.
2. **Given** the user picks Quick for a 4:5 → 9:16 reflow (which Auto would route to re-render), **When** the reflow runs, **Then** outpaint is invoked despite the magnitude exceeding 30 %, and the resolution trace records `method: 'outpaint', userOverride: true`.
3. **Given** the user picks Fresh for a 1:1 → 4:5 reflow (which Auto would route to outpaint), **When** the reflow runs, **Then** re-render-from-plan is invoked despite the magnitude being under 30 %, and the resolution trace records `method: 'rerender', userOverride: true`.
4. **Given** the user has not changed the selector, **When** the user clicks Resize, **Then** Auto is used and the trace records the auto-router's chosen method without `userOverride`.

---

### User Story 4 — Outpaint failure transparently falls back to re-render-from-plan (Priority: P2)

A user runs Auto reflow on a 4:5 → 3:4 (a small percent change, so the auto-router picks outpaint). The outpaint engine returns an output where the locked center has drifted (one or more pixels in the locked region differ from the source). The user expects the system to detect the drift, automatically re-run the same reflow via re-render-from-plan, and deliver a correct result — without surfacing the outpaint failure as a user-visible error and without double-charging credits.

**Why this priority**: Outpaint engines are not 100 % reliable at honoring a hard center-lock instruction; in rare cases the engine "improves" the locked region. The whole point of the deterministic reflow is that the locked region cannot drift, so the system must verify it and have a safe fallback. P2 because Stories 1–3 cover the happy paths and the explicit override; this story covers the silent-correctness backstop.

**Independent Test**: Inject a synthetic outpaint failure (a stub that returns an output with a deliberately altered locked region). Run Auto reflow. Confirm that (a) the system detects the drift via center-region comparison, (b) the re-render-from-plan route runs as a fallback, (c) the user receives a correct re-rendered image, (d) the resolution trace records the outpaint failure reason and the fallback transition, and (e) the user is charged only for the route that ultimately succeeded.

**Acceptance Scenarios**:

1. **Given** outpaint returns successfully but the locked center pixels differ from the source, **When** the post-outpaint verification runs, **Then** the system rejects the outpaint output, falls back to re-render-from-plan, and delivers the re-rendered image to the user.
2. **Given** outpaint throws an exception (transient model error, image-processing error, mask error), **When** the error is caught, **Then** the system falls back to re-render-from-plan automatically and delivers the re-rendered image to the user.
3. **Given** a fallback occurred, **When** the resolution trace is inspected, **Then** it records the original method attempt (outpaint), the failure reason (engine error or center-drift verification failure), and the successful fallback method (rerender).
4. **Given** a fallback occurred, **When** credits are reconciled, **Then** the user is charged only for the route that ultimately succeeded (re-render), not for both.

---

### User Story 5 — Carousel and batch reflow apply the router per item (Priority: P2)

A user has generated a 5-slide carousel and a 4-variant batch. The user reflows the whole carousel (or the whole batch) to a new aspect ratio. The user expects the auto-router to run **per item**: each slide and each batch variant is independently routed to outpaint or re-render based on its own source ratio and any per-item particulars; per-item failures fall back independently; the user is charged per item that was actually reflowed; partial failures do not block delivery of the items that succeeded.

**Why this priority**: Carousel and batch reflow is the volume case for Pro and Scale users — single-ad reflow alone (Stories 1–4) covers the core fix, but the pipeline must apply the same router per item or the carousel/batch UX silently falls back to the broken old path. P2 because single-ad reflow (Stories 1–4) is the release gate; carousel/batch reflow is the next-step quality gate.

**Independent Test**: Generate a 5-slide carousel at 1:1. Reflow the whole carousel to 9:16 with method = Auto. Confirm that (a) all 5 slides are routed to re-render-from-plan (because 1:1 → 9:16 is ≥30 %), (b) all 5 slides come back with no vertical-stretch hero failures, (c) per-slide success/failure is reported independently, (d) the carousel slide order is preserved. Repeat with a 4-variant batch from 4:5 → 3:4 (small percent change) and confirm all 4 variants are routed to outpaint.

**Acceptance Scenarios**:

1. **Given** a 5-slide carousel is reflowed to a new ratio with method = Auto, **When** each slide is processed, **Then** the magnitude check runs per slide (using each slide's own source ratio against the target) and each slide is routed independently.
2. **Given** a 4-variant batch is reflowed with method = Auto, **When** each variant is processed, **Then** the magnitude check runs per variant and each variant is routed independently; partial failures do not block the variants that succeed.
3. **Given** any slide of a carousel reflow falls back from outpaint to re-render due to verification failure (per User Story 4), **When** the fallback runs, **Then** that one slide's fallback does not affect the routing of any other slide of the same carousel.
4. **Given** a carousel reflow is delivered, **When** the user views the result, **Then** the slide order is preserved exactly, and per-slide credits are deducted equal to the route that ultimately succeeded for each slide.
5. **Given** the screen-content ban from HOTFIX-E and the cultural-compliance rules from `0951-hotfix-cultural-compliance` are part of the build plan, **When** any slide is re-rendered at the new ratio, **Then** those rules apply to the re-render exactly as they applied to the original render — because the plan that drives the re-render is the same plan, and the full pipeline runs on the new ratio.

---

### Edge Cases

- **Source ratio equals target ratio (no-op reflow)**: the system MUST short-circuit before invoking either route; do not call outpaint, do not call re-render, do not deduct credits, and surface a soft notice to the user.
- **Target ratio is unsupported**: only the six already-defined ratios (1:1, 4:5, 3:4, 4:3, 9:16, 16:9) are valid targets. An unsupported value is rejected at the callable boundary with a clear error; no reflow is attempted.
- **Saved build plan is missing or corrupt on a legacy generation record**: per the clarification, the system falls back to outpaint regardless of magnitude (better to ship slightly-imperfect framing than fail). If outpaint also fails, surface a clear error explaining the record predates plan persistence and recommending a fresh generation.
- **The source image was itself a previous reflow output**: re-render-from-plan still uses the **original** generation's saved build plan with the new ratio (not a plan derived from the previous reflow), so the new render is from the canonical concept. Outpaint operates on the latest available rendered image as its input.
- **The source has UI-mode logos composited (HOTFIX-E)**: outpaint preserves them because they are in the locked center 70 %. Re-render-from-plan re-runs the HOTFIX-E hybrid logo pipeline against the new canvas's safe zones, so UI-logo positions resolve fresh against the new layout — a known interaction acknowledged by HOTFIX-E.
- **The source has Arabic right-to-left composited text**: outpaint preserves it because it is in the locked center. Re-render-from-plan re-runs the Arabic compositing on the new canvas at the new ratio's text safe zones.
- **The source has the offer overlay (price / total-value / savings) composited**: same rule — preserved by outpaint, re-composited fresh onto the new ratio by re-render.
- **Outpaint succeeds but produces a visible seam at the lock boundary**: the verification step checks pixel-identity inside the lock; it does not grade visual seam quality. The user can override to Fresh render in Step 4 if seam quality is unacceptable; this is exactly what the override is for.
- **Outpaint succeeds and the locked region is pixel-identical, but the new margin pixels are obviously wrong (e.g., fingers in the new margin from the model imagining a body part outside the source)**: same answer — verification is pixel-identity in the locked region only; visible-quality issues in the margins are caught by the user, who can re-run with Fresh render.
- **Re-render-from-plan succeeds but produces a hero that looks slightly different from the source** (because it is genuinely a fresh model render): this is expected and not a failure. The face-consistency contract for reflow is "same person at the new ratio" (driven by the same plan and the same hero photo references), not "same pixels as the previous render at a different ratio." A user who needs identical pixels must accept outpaint or stay on the source ratio.
- **Concurrency: the user clicks Resize twice in quick succession at two different target ratios**: the second click cancels or supersedes the first; only the latest target ratio is delivered, only the latest is charged, no prior in-flight render is left orphaned in storage.
- **The source generation record is from before the build plan was persisted**: see the legacy-record clarification above.
- **User invokes reflow on a `text_only` ad (no hero photo, no logos, no offer overlay)**: both routes work; the auto-router still picks by magnitude. The router does not have a special case for `text_only`.

## Requirements *(mandatory)*

### Functional Requirements

#### Routing and method selection

- **FR-001**: The reflow path MUST be a deterministic two-route router. The two routes are **outpaint** (extend canvas margins, lock center) and **rerender** (re-render-from-plan at the new ratio). No other route, and specifically no generative-edit reflow, MUST be invoked from the user-facing reflow control.
- **FR-002**: The auto-router MUST compute the magnitude of the ratio change as a **symmetric fold-change**: `magnitude = max(target / current, current / target) − 1`, where `current` and `target` are each ratio's numeric value (width ÷ height). The formula MUST be direction-symmetric — the magnitude of `A → B` MUST equal the magnitude of `B → A`. If the magnitude is **less than 30 %**, the router MUST select outpaint. If the magnitude is **30 % or more**, the router MUST select rerender. The 4:5 → 9:16 case (the launch matrix's headline failure case) MUST resolve to rerender under this formula (its magnitude is ≈ 42.2 %).
- **FR-003**: The reflow callable MUST accept a method parameter with three valid values: `auto`, `outpaint`, `rerender`. `auto` invokes the magnitude router (FR-002). `outpaint` and `rerender` force their respective routes regardless of magnitude. The user's explicit choice MUST be honored even if the auto-router would have chosen differently.
- **FR-004**: The reflow callable MUST reject any target aspect ratio that is not one of the six supported ratios (1:1, 4:5, 3:4, 4:3, 9:16, 16:9) with a clear error before invoking either route.
- **FR-005**: When the source ratio equals the target ratio, the callable MUST short-circuit, return the source image unchanged, deduct zero credits, and surface a soft notice to the caller — no route is invoked.

#### Outpaint route (the small-change route)

- **FR-006**: The outpaint route MUST extend the rendered image's outer margins to fill the new canvas shape, while keeping the **center 70 % of the original image (35 % inset on each side, vertically and horizontally) byte-identical to the source**.
- **FR-007**: The outpaint engine MUST NOT regenerate any pixel in the locked center 70 % region of the source image. The engine MAY satisfy this by construction (e.g., a Sharp-based pure margin extension that only allocates new outer-margin pixels and never re-encodes the source buffer) or, for a future model-driven engine, by a binary-mask contract whose center 70 % is "do not touch" and whose outer 30 % is "regenerate to fit the new canvas." The post-output verification in FR-008 enforces this regardless of engine choice.
- **FR-008**: After the outpaint engine returns its output, the route MUST verify that every pixel inside the locked center 70 % is byte-identical to the corresponding pixel in the source image. The comparison MUST be performed on decoded pixel buffers (post-decode, pre-storage) across all color channels; no perceptual tolerance, no ΔE allowance, and no hash-distance allowance is permitted. If any locked pixel has drifted by any amount, the system MUST treat the outpaint as failed and trigger the fallback to rerender (FR-014). This requirement implies the outpaint engine MUST operate losslessly on the locked region; engine choice is constrained accordingly.
- **FR-009**: The outpaint route's new margin pixels MUST visually continue the source's background — same color tone, same lighting, same background style — and MUST NOT contain new subjects, new text, new logos, or new chart-/dashboard-/screen-content. For a Sharp-based engine this is satisfied by an `extendWith: 'mirror'` (or equivalent edge-clamp) extension policy; for a future model-driven engine, the engine's prompt or instructions MUST encode the same constraint. Visible quality issues in the margin pixels are out of scope for the FR-008 verification (which covers locked-region drift only) and are caught by the user via the FR-023 method selector (Fresh render override).
- **FR-010**: The outpaint route MUST preserve, by construction, every overlay that was already composited into the source — UI-mode logos (HOTFIX-E), Arabic right-to-left text, offer-overlay (price / total-value / savings) — because they all sit inside the locked center 70 %.

#### Re-render-from-plan route (the large-change route)

- **FR-011**: The rerender route MUST load the **original** generation record's saved build plan, swap its `aspectRatio` field to the target ratio, and run the full rendering pipeline fresh: build-plan resolution → image render → text compositing → logo compositing → offer-overlay compositing. The rerender is a brand-new render — not an edit of the previous render.
- **FR-012**: The rerender route MUST re-resolve every overlay against the new canvas's safe zones — the Arabic text positions, the UI-logo positions (per HOTFIX-E auto-shift / drop rules), the offer-overlay layout — because the safe zones are different on the new ratio.
- **FR-013**: The rerender route MUST preserve every input that drove the original concept: hero photos, hook copy, subhead, CTA name, brand colors, mode, dialect, offer values, logos, cultural-compliance rules. Only the `aspectRatio` is changed.

#### Failure handling and fallback

- **FR-014**: If the outpaint route fails — whether by raised exception (transient model error, image-processing error, mask error) or by post-output verification failure (locked-region drift) — the system MUST automatically fall back to the rerender route for the same target ratio, and MUST record on the resolution trace the original outpaint method attempt, the failure reason, and the fallback to rerender.
- **FR-015**: If the rerender route fails because the saved build plan is missing or corrupt on a legacy record, the system MUST fall back to the outpaint route regardless of the magnitude rule. If outpaint also fails on a missing-plan record, the system MUST surface a clear error to the user explaining that the record predates plan persistence and recommending a fresh generation; the system MUST NOT silently reuse the deprecated generative-edit reflow path as a fallback.
- **FR-016**: A failure on one item of a carousel reflow or a batch reflow MUST NOT block delivery of the other items. The system MUST follow a **best-effort with per-item reporting** model: successful items append to the source generation's `mockupHistory` immediately and independently; failed items surface a per-item error (carrying at minimum the item index, the failure reason, and the final method attempted) in the response payload. The user MUST be able to retry failed items individually. The source generation's `mockupHistory` MUST NOT be rolled back when partials occur — successful items remain regardless of sibling failures. The system MUST NOT auto-retry a failed item (that decision is the user's via the override). The carousel slide order MUST be preserved exactly across the items that did succeed, and the user MUST be charged only for the items (and routes) that actually succeeded.

#### Credits

- **FR-017**: The rerender route MUST cost the same as a fresh single-image generation. The outpaint route MUST cost less than a fresh generation (exact discount governed by the platform pricing matrix and outside this spec). When the auto-router falls back from outpaint to rerender mid-flight (FR-014), the user MUST be charged only for the route that ultimately succeeded.
- **FR-018**: A no-op reflow (FR-005) MUST deduct zero credits.
- **FR-019**: A reflow rejected at the callable boundary (unsupported target ratio per FR-004, missing source generation, missing build plan with both routes failing per FR-015) MUST deduct zero credits.

#### Carousel and batch propagation

- **FR-020**: Carousel reflow MUST run the magnitude check, the route selection, the outpaint/rerender execution, the verification step, and the failure-to-fallback path **per slide**. Per-slide success/failure MUST be reported in the result. Slide order MUST be preserved.
- **FR-021**: Batch reflow MUST run all of the above **per batch variant**. Per-variant success/failure MUST be reported in the result.
- **FR-022**: Per-slide and per-variant fallbacks (outpaint → rerender) MUST be independent — one slide's fallback MUST NOT affect the routing of any other slide.

#### User-visible method selector

- **FR-023**: Step 4 of the user interface MUST expose a method selector alongside the Resize control with three options: **Auto (recommended)**, **Quick (outpaint — keeps subject identical, fastest)**, **Fresh render (re-render — best for dramatic ratio changes)**. The default MUST be Auto.
- **FR-024**: When the user picks a non-Auto method, the user's choice MUST be passed to the reflow callable and the callable MUST honor it without invoking the magnitude router. The resolution trace MUST record `userOverride: true`.

#### Recording and traceability

- **FR-025**: Each reflow execution MUST record on the resolution trace: source ratio, target ratio, percent change, method attempted (`outpaint` / `rerender`), whether it was the auto-router's choice or a user override, whether a fallback occurred and the reason, and which method ultimately delivered the result. For carousel/batch reflows, this record MUST be per-item.
- **FR-026**: The pre-existing generative-edit reflow path MUST be removed or fully gated off so that no future caller can re-introduce it via the user-facing reflow control. The deletion or gating MUST be visible in the code that owns the old reflow path.

#### Backward compatibility and pipeline preservation

- **FR-027**: This hotfix MUST NOT regress the offer-overlay compositing (price / total-value / savings), the Arabic right-to-left text compositing, or the HOTFIX-E hybrid logo pipeline. All three MUST continue to operate correctly on both reflow routes — preserved by the locked-center contract on outpaint, and re-applied fresh by the full pipeline on rerender.
- **FR-028**: Generation records created before this hotfix that DO have a saved build plan MUST be reflowable via either route exactly as new generations. Records that LACK a saved build plan (genuinely legacy) MUST follow the FR-015 fallback chain and the FR-019 no-charge rule when both routes fail.

#### Output persistence

- **FR-029**: A reflow output MUST be persisted as a variant of the source generation, not as a new generation. The source generation record remains canonical and MUST NOT be cloned or duplicated. The new `{ url, ratio }` MUST be appended to the source generation's existing `mockupHistory` array (the Phase 17 shape). The per-item reflow record described in FR-025 MUST be appended to the source generation's `resolutionTrace.reflowHistory[]`. No new `generations/{id}` Firestore document MUST be created for a reflow.
- **FR-030**: Favorites, saved-projects, and any other features that scope by generation record MUST continue to operate on the source generation; a reflow MUST NOT introduce a separate favoritable / saveable identity.
- **FR-031**: When the user reflows an image that is itself a previous reflow output, the rerender route MUST load the **original** source generation's saved build plan (not any plan derived from an earlier reflow) and the new `{ url, ratio }` MUST still be appended to the same source generation's `mockupHistory`.

#### Fallback signaling

- **FR-032**: When an auto-routed reflow falls back (outpaint → rerender per FR-014, or rerender → outpaint per FR-015), the per-item response MUST carry `fallbackFrom` and `fallbackReason` and the frontend MUST render a small dismissable post-fact notice adjacent to the affected `mockupHistory` thumbnail — e.g., "Auto-upgraded to Fresh render for a clean result" (when `fallbackFrom === 'outpaint'`), or "Auto-fell-back to Quick reflow because this generation predates plan persistence" (when `fallbackFrom === 'rerender'`). The notice MUST be informational (visually distinct from error rows). User-override fallbacks do not occur (research.md R6); this requirement applies only to auto-router fallbacks. This satisfies the "Signaled to the user when relevant" condition of constitution Principle VII.

### Key Entities

- **Reflow Request**: One user-initiated reflow action. Has: source generation record reference, target aspect ratio, method (`auto` / `outpaint` / `rerender`), scope (`single` / `batch_all` / `carousel_all` / `carousel_slide`).
- **Reflow Decision**: The router's per-item output. Has: source ratio, target ratio, percent change, chosen method, user-override flag.
- **Reflow Outcome**: The per-item result. Has: chosen method (as decided), method that ultimately delivered the result (after any fallback), failure reason if any, output image URL, credit cost charged.
- **Locked Region**: The center 70 % rectangular region of the source image used by outpaint (35 % inset on each side, vertically and horizontally). Pixels here MUST be preserved byte-identical from source to outpaint output.
- **Build Plan (re-used)**: The original generation record's saved planning payload, consumed unchanged except for the `aspectRatio` field by the rerender route.
- **Resolution Trace (extended)**: The per-generation diagnostic record. Now includes a `reflowHistory[]` array that grows by one entry per executed reflow on this generation, each entry carrying the fields described in FR-025 (source ratio, target ratio, magnitude, method attempted, override flag, fallback flag, fallback reason, final method).
- **Mockup History (re-used)**: The source generation's existing `mockupHistory: { url, ratio }[]` array (introduced by Phase 17). Each successful reflow appends one entry. The array's length is the count of distinct rendered variants of the same source generation; the array IS the variant set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across a manual review sample of 20 reflows from 4:5 to 9:16 (the headline failure case from the launch matrix), at least 19 (95 %+) show no vertical stretching of the hero — head height-to-width ratio within ±5 % of the source — and zero contain text that has been re-laid-out into a different copy than the source. The pre-hotfix baseline on the same prompts shows fewer than 30 % correct.
- **SC-002**: Across a manual review sample of 20 reflows from 1:1 to 4:5 (the canonical small-change case), 20/20 (100 %) have a center 70 % region that is byte-identical to the source 1:1, verified by automated pixel comparison.
- **SC-003**: Across all reflows within the sample, 100 % of decisions where the auto-router was used are correctly classified — `<30 %` symmetric fold-change → outpaint, `≥30 %` symmetric fold-change → rerender — verified by inspecting the resolution trace against the computed magnitude. The 4:5 → 9:16 case in particular MUST classify to rerender in 100 % of runs.
- **SC-004**: The pre-existing generative-edit reflow path (the old REFLOW prompt sent to the image-generation model) records zero invocations from the user-facing reflow control over a 7-day post-release window. (Internal-only callers, if any remain, are out of scope for this metric.)
- **SC-005**: Across a sample of 20 outpaint runs, 0 (zero) deliver an output where the locked center 70 % has drifted from the source. Drift, if it ever occurs, triggers the FR-014 fallback before the user receives the output.
- **SC-006**: Carousel reflow on a 5-slide carousel preserves slide order in 100 % of runs, and reports per-slide success/failure independently in 100 % of partial-failure cases.
- **SC-007**: User-reported incidents of the form "my face is stretched after I resized" and "my text is wrong on the resized version" drop to zero within 14 days of release; pre-release baseline is captured from existing support / feedback channels.
- **SC-008**: Backward compatibility: 100 % of generation records and saved projects that have a persisted build plan continue to reflow successfully after this hotfix. Legacy records without a build plan follow the documented fallback chain (outpaint, then a clear error) and never silently invoke the deprecated generative-edit path.
- **SC-009**: The hotfix introduces zero regressions on the offer-overlay pipeline, the Arabic right-to-left text-compositing pipeline, and the HOTFIX-E hybrid logo pipeline — verified on a sample of 10 pre-hotfix and 10 post-hotfix reflows that exercise all three features.
- **SC-010**: When the user explicitly overrides the auto-router (Quick or Fresh), the chosen route runs in 100 % of cases and the resolution trace records `userOverride: true` in 100 % of those cases.

## Assumptions

- The original generation record stores the build plan that produced the rendered image, and the build plan is sufficient to drive a fresh full-pipeline render at any of the six supported aspect ratios. This assumption is the basis for the rerender route; if a record lacks a plan, the FR-015 fallback chain handles it.
- The center 70 % of any rendered ad always contains the hero, the headline, the subhead, the CTA button, and any composited overlays (UI logos, offer overlay, Arabic text), because the layout contract reserves the outer margins as visual breathing room. This assumption is the basis for the locked-region rule on outpaint; the launch matrix's Phase 17 introduces explicit per-ratio safe-zone insets that further support this.
- The outpaint engine operates losslessly on the locked region. A Sharp-based pure-margin-extension engine satisfies this trivially because it allocates new outer-margin pixels without touching the locked decoded pixel buffer. A model-driven outpaint call satisfies this only if it returns a lossless format (PNG / lossless WebP) and respects the mask exactly; failure to honor either is detected by the post-output byte-identity check (FR-008) and triggers the rerender fallback (FR-014). The verification step is the safety net regardless of which engine is selected.
- The 30 % magnitude threshold is the right break-even point between outpaint and rerender for the six supported aspect ratios. This is the value specified in the launch matrix and is treated as fixed for this hotfix; if production data shows the boundary should shift, that is a follow-up tuning, not a re-spec.
- The rerender route's credit cost equaling a fresh single-image generation is consistent with the platform's pricing model (a fresh full-pipeline render is, by definition, a fresh generation).
- The user interface real estate in Step 4 has room for a three-option method selector adjacent to the Resize ratio buttons. If layout review during implementation requires a different presentation (dropdown, expandable, etc.), the underlying contract (Auto / Quick / Fresh, with Auto default) is preserved.

## Dependencies

- **Phase 5 — Render Prompt Pipeline**: this hotfix re-uses the build-plan + render pipeline that Phase 5 established. The pipeline must be in place and stable so that the rerender route can call it cleanly.
- **Phase 17 — Resize & Reflow** (saved build plan, per-ratio safe zones, layout contract integration): provides the saved build plan that the rerender route consumes, the per-ratio safe-zone definitions used after rerender, and the existing reflow callable that this hotfix replaces the underlying body of.
- **HOTFIX-E — Hybrid Logo Handling** (PR #27, merged): UI-logo positions need to re-resolve against the new canvas's safe zones on rerender; this hotfix invokes the HOTFIX-E logo pipeline as part of the full re-render. On outpaint, the existing UI-logo composite is preserved by the locked-center contract.
- **0951-hotfix-cultural-compliance**: the cultural-compliance and Arabic wardrobe rules are part of the build plan that the rerender route consumes; they apply to the rerender exactly as they applied to the original render.
- **HOTFIX-D — Multi-Logo Upload**: the multi-logo set is part of the build plan and is re-applied by the full pipeline on rerender; it is preserved by outpaint.
- **Phase 19 — Direct-Response Design Upgrades**: blocked on this hotfix per the launch matrix; does not begin until HOTFIX-E and HOTFIX-F are stable.

## Out of Scope

- Replacing the outpaint engine itself (Sharp-based extension vs. model-driven outpaint) is an implementation detail. This spec mandates the locked-center contract and the verification step, not the choice of engine.
- Tuning the 30 % magnitude threshold based on post-release production data. Treated as a fixed constant for this hotfix.
- Adding new aspect ratios beyond the six already supported (1:1, 4:5, 3:4, 4:3, 9:16, 16:9). The router operates over the existing set.
- A user-facing CSS preview of the new ratio's framing before committing the reflow. Phase 17 introduces the preview; this hotfix does not change it.
- Per-pixel rejection or auto-retry of outpaint outputs based on visible-quality grading of the new margin pixels (e.g., seam detection, fingers-in-the-margin detection). The verification step checks pixel-identity inside the lock only; the user is the judge of margin quality and uses the override (Story 3) to switch routes.
- Magic Edit interactions with reflowed images. Owned by Phase 11.
- Any change to the Resize button group's per-ratio buttons themselves; this hotfix only adds the method selector adjacent to them.
- Any change to the offer-overlay (price / total-value / savings) pipeline, the Arabic right-to-left text-compositing pipeline, or the HOTFIX-E hybrid logo pipeline. All three are preserved unchanged and continue to run on both reflow routes.
- Any change to the saved-projects schema beyond the resolution-trace extension described in FR-025.
- Any change to the upload UI or upload count caps. Owned by HOTFIX-D and the existing project setup flows.
