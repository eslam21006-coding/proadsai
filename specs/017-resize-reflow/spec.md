# Feature Specification: Phase 17 — Resize & Reflow

**Feature Branch**: `017-resize-reflow`
**Created**: 2026-05-28
**Status**: Draft
**Input**: User description: "Phase 17 — Resize & Reflow. Complete the missing pieces so users can resize a finished ad to any of the 6 supported aspect ratios from Step 4: batch reflow, carousel per-slide reflow, safe-zone re-validation, text re-compositing at the new ratio, brand-color preservation, and a free CSS preview before credits are committed."

**Glossary**: Reflow (backend callable name) and Resize (UI label) refer to the same operation and are used interchangeably in this spec.

## Clarifications

### Session 2026-05-28

- Q: How does a resized output appear in the user's history — new top-level card, variant chip on the original, or inline toggle that evicts older versions? → A: Variant chip attached to the original generation (one card per concept; click a chip to switch the displayed ratio). Reuses the existing `mockupHistory` pattern.
- Q: Plan tier gating — is Resize available to all paid plans, Pro+ only, or scope-gated (single on all plans, bulk on Pro+)? → A: All paid plans (Starter, Pro, Scale). 1 credit per reflowed image regardless of plan, no tier gate on single / batch_all / carousel_all / carousel_slide. (superseded — see FR-006: cost equals one generation credit per resized image).
- Q: For Arabic reflows, should the RTL-aware compositor be used AND should the cultural-compliance scan re-run? → A: RTL-aware compositor IS used for Arabic; the cultural-compliance scan does NOT re-run on reflow. Reflow trusts the original generation's already-scrubbed copy and re-uses it verbatim — it only repositions and re-fits, never rewrites words.
- Q: When reflowing a batch or full carousel, how many items run concurrently? → A: 5 concurrent per resize action (matches the existing HOTFIX-F / 955-aspect-reflow router cap). A 10-slide carousel resize runs in two waves of 5. Larger groups queue, not fail.
- Q: How many resized variant chips are retained per generation? → A: Keep the latest variant per aspect ratio; older same-ratio chips are evicted on overwrite. Upper bound: 6 chips per generation (one per supported ratio). Re-resizing an existing ratio replaces the prior chip rather than appending. The backend-selected method (not user-facing) does not affect chip identity.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resize a finished single ad to a different aspect ratio with preview (Priority: P1)

A marketer has just generated a square (1:1) Facebook feed ad in Step 4. They now realize they also need a 9:16 Story version of the same creative. They want to see roughly what the resized ad would look like *before* spending credits, and when they commit, they want the resulting ad to keep the same brand colors, the same headline copy, and have the text repositioned so it fits cleanly inside the new ratio (not clipped, not floating off-frame).

**Why this priority**: Single-ad reflow is the most common Resize action — it covers the everyday "I built one ad, now I need it in a second placement" flow. Without it, every secondary placement requires a fresh generation from scratch (a full credit cost and a re-roll of the visual concept). This is the MVP of the phase.

**Independent Test**: From a completed single-ad result in Step 4, pick a target ratio different from the current one, see a CSS-based preview rendered in under 1 second with no credit charge, then press **Generate Resize** and receive a freshly composed ad at the new ratio with text fitted to the new safe zone and brand colors intact.

**Acceptance Scenarios**:

1. **Given** a completed 1:1 ad displayed in Step 4, **When** the user clicks the **9:16** ratio button, **Then** an instant CSS preview of the existing image cropped/extended to a 9:16 frame appears with the label "Preview — click Generate to create the final resized version" and a button reading "Generate Resize — {N} credits" where N equals the cost of one image generation (single scope = 1× generation cost).
2. **Given** the CSS preview is showing, **When** the user does *not* click Generate Resize, **Then** zero credits are deducted and the user can dismiss the preview or pick a different ratio.
3. **Given** the CSS preview is showing for 9:16, **When** the user clicks **Generate Resize**, **Then** exactly the cost of one image generation is deducted (single scope = 1× generation cost), a new image is produced at 9:16 with the same brand colors as the original, the headline / sub-headline / caption / CTA are repositioned inside the 9:16 safe zone, and the result replaces the displayed ad while the original 1:1 version remains accessible in history.
4. **Given** the headline text would overflow the new ratio's safe zone, **When** the system re-composes text, **Then** the font size is reduced in 10% steps (up to 3 steps) until it fits, the final ad ships with no clipped text, and the system records that an overflow reduction occurred for diagnostic review.
5. **Given** the original generation specified a primary and/or secondary brand color, **When** the resized ad is produced, **Then** that exact brand palette is preserved in the new composition (no new dominant colors introduced).
6. **Given** the user has insufficient credits for the resize, **When** they click **Generate Resize**, **Then** the action is blocked with a clear "Not enough credits" message and no preview is consumed.

---

### User Story 2 - Resize an entire batch of ads at once (Priority: P2)

A media buyer has just used Batch mode to generate 4 ads of the same offer in a single click. The campaign manager now wants the same 4 ads also rendered as 9:16 Stories so they can run them on Reels and TikTok. The buyer wants to resize all 4 in one action, see clearly which ones succeed and which fail, and only pay for the ones that succeed.

**Why this priority**: Batch users came to the product *because* they want to amortize one decision across many ads — making them resize each ad one-by-one breaks that promise. P2 (not P1) because the single-ad path is the prerequisite and the more common entry point; once it works, extending it to "do this N times in parallel" is the natural follow-up.

**Independent Test**: From a completed batch of 4 ads in Step 4, pick a target ratio, choose the "Resize all 4 images" scope option, confirm the preview, and receive 4 reflowed ads back with a clear per-item status (succeeded vs failed) and credits charged only for the items that succeeded.

**Acceptance Scenarios**:

1. **Given** a completed batch of 4 ads at 1:1 displayed in Step 4, **When** the user clicks a different ratio, **Then** a scope selector appears with two options: "Resize this image" (acts on whichever batch item is in focus) and "Resize all 4 images".
2. **Given** "Resize all 4 images" is selected and the user has at least 4× the per-generation credit cost available, **When** they click **Generate Resize**, **Then** all 4 items are reflowed in parallel and 4× the per-generation credit cost is debited upon successful completion.
3. **Given** 3 of 4 batch items reflow successfully and 1 fails, **When** the operation completes, **Then** the 3 successful items show their new resized images, the 1 failed item retains its original image and shows a "Resize failed — try again" indicator, and exactly 3× the per-generation credit cost is charged (not 4×).
4. **Given** any batch reflow is in progress, **When** the user looks at the batch grid, **Then** each item shows an independent loading indicator until that item's result is known (so one slow item doesn't block visibility into the others).

---

### User Story 3 - Resize an entire carousel or a single slide (Priority: P2)

A coach has built a 7-slide carousel for Facebook (4:5) and wants the same carousel as 1:1 Instagram square posts. They want a single action that resizes every slide while preserving the slide order and the per-slide copy. In a different session, the same coach wants to fix only slide 3 (which got cropped weirdly) without re-resizing the other 6 slides.

**Why this priority**: Carousels are a core creative mode in the product, but per-slide-correction is a lower-frequency operation than single-ad and batch resize. Same value tier as batch (P2): high-value when needed, but builds on the P1 single-ad path.

**Independent Test**: From a completed carousel in Step 4, pick a target ratio, choose either "Resize this slide" or "Resize all N slides", confirm the preview, and receive the carousel back with the chosen scope reflowed, slide order intact, and copy preserved.

**Acceptance Scenarios**:

1. **Given** a 7-slide carousel at 4:5 displayed in Step 4, **When** the user clicks a different ratio while slide 3 is in focus, **Then** a scope selector appears with: "Resize this slide" (slide 3 only) and "Resize all 7 slides".
2. **Given** "Resize all 7 slides" is selected, **When** the user clicks **Generate Resize** with at least 7× the per-generation credit cost available, **Then** all 7 slides are reflowed, slide order is preserved (slide 1 stays slide 1, slide 7 stays slide 7), each slide's copy is repositioned into the new safe zone, and 7× the per-generation credit cost is debited.
3. **Given** "Resize this slide" is selected for slide 3, **When** the operation completes, **Then** only slide 3 is replaced with its resized version, the other 6 slides remain at the original ratio, and exactly 1× the per-generation credit cost is debited.
4. **Given** any carousel reflow completes, **When** the user clicks through the carousel, **Then** the slide ordering and the slide-to-slide narrative (hook → body → CTA) is preserved.

---

### Edge Cases

- **Same-ratio click**: Clicking the ratio the ad is *already* at is a no-op — no preview, no charge, the ratio button is shown in a "current" highlighted state and behaves as inactive.
- **Text genuinely cannot fit**: If 3 rounds of 10% font reduction still cannot fit the text inside the new safe zone (e.g., a very long Arabic headline going from 16:9 to 9:16), the ad ships anyway with the smallest size attempted and the diagnostic flag set, so the user is never blocked from receiving output.
- **Mid-flight cancellation**: If the user closes the page or navigates away mid-resize, in-flight work that was already charged completes server-side; partially-charged work for batch/carousel charges only for items that finished.
- **Network failure on one batch/carousel item**: That item is treated as a failure (refunded, marked failed in UI), and successful siblings still ship. The user can retry just the failed items.
- **Ratio not in the supported set of 6**: Out of scope. The Resize button group exposes only the 6 supported ratios (1:1, 4:5, 3:4, 4:3, 9:16, 16:9); custom ratios are not offered.
- **Brand colors not set on the original**: The brand-color preservation step is skipped silently — the resize still works, it just doesn't add the brand-color reinforcement.
- **CSS preview disagrees with final output**: The preview is explicitly framed as a preview, not a promise. The label "Preview — click Generate to create the final resized version" sets expectations that the committed result may refine framing, text fit, and edges beyond what CSS object-fit shows.
- **Retargeting mode**: Out of scope for this phase. Reflow availability for retargeting is tracked separately.

## Requirements *(mandatory)*

### Functional Requirements

**Surface & entry points**

- **FR-001**: Step 4 of the result view MUST display a Resize control offering all 6 supported aspect ratios (1:1, 4:5, 3:4, 4:3, 9:16, 16:9), with the ad's current ratio visually distinguished and non-interactive.
- **FR-002**: For single-ad results, the Resize control MUST act on the visible ad. For batch results, the Resize control MUST expose a scope selector with "Resize this image" and "Resize all N images" options. For carousel results, the Resize control MUST expose a scope selector with "Resize this slide" and "Resize all N slides" options. N is the actual count in the user's result, not a fixed number.

**Preview before commit**

- **FR-003**: Clicking a target ratio in the Resize control MUST display a no-charge preview that shows roughly how the existing image will frame inside the target ratio. The preview MUST appear within 1 second of the click and MUST NOT deduct credits.
- **FR-004**: The preview MUST be labeled as a preview (wording that makes clear the final committed output may differ in framing, text fit, and edges) so users do not mistake it for the final result.
- **FR-005**: A clearly labeled **Generate Resize** action MUST be presented next to the preview, showing the exact credit cost ("Generate Resize — X credit(s)"), where X is the number of images that will be reflowed under the chosen scope.

**Commit & credits**

- **FR-006**: Resize costs the same credits as a single image generation. One resize = one generation credit cost. Batch of 4 = 4× generation cost. Carousel of 7 slides = 7× generation cost. The Generate Resize button displays the total cost before the user commits. Failed items in a batch / carousel reflow MUST NOT be charged — the user pays only for items successfully delivered.
- **FR-007**: If the user does not have sufficient credits for the chosen scope, the Generate Resize action MUST be blocked with a clear message before any work is performed. No preview consumption is required to discover insufficient credits.
- **FR-008**: Resize MUST succeed for all 6 supported aspect ratios as both source and target (any-to-any).
- **FR-008a**: Resize MUST be available to every paid plan tier (Starter, Pro, Scale) at the same per-generation credit cost defined by FR-006 (one resize = one image-generation credit cost). No scope (single, batch_all, carousel_all, carousel_slide) is gated by plan tier. The free / `none` plan continues to follow existing access rules (i.e., no paid actions including resize).

**Output behavior**

- **FR-009**: A resized output MUST have the requested target aspect ratio.
- **FR-010**: A resized output MUST preserve the original creative's brand color palette when the original generation specified primary and/or secondary brand colors. No new dominant colors may be introduced. When the original did not set brand colors, this requirement is satisfied trivially.
- **FR-011**: Every resized output produces a result with text correctly positioned for the new ratio. The backend auto-routes to the appropriate method silently — the re-render path re-composites text into the new safe zone after a full image re-render; the outpaint path preserves text via the locked-region guarantee. Font size reduction (10% per step, max 3) applies when text overflows the safe zone on re-render outputs. `textReflowOverflow: true` is logged on the resolution trace when reduction triggers. Method selection is never exposed to the user.
- **FR-012**: When text cannot fit the new safe zone at its original size, the system MUST attempt up to 3 successive 10% font-size reductions before shipping. If the smallest attempted size still overflows, the ad MUST ship with the smallest attempted size rather than blocking the user; the overflow event MUST be recorded for diagnostic review.
- **FR-013**: A safe-zone definition MUST exist for every supported aspect ratio. Taller ratios receive larger top/bottom insets; wider ratios receive larger left/right insets; 1:1 uses a uniform inset. Unknown ratios MUST be rejected explicitly rather than silently falling back.

**Batch & carousel semantics**

- **FR-014**: Batch reflow MUST execute per-item in parallel with best-effort partial-success semantics — successful items ship even when sibling items fail. Per-item status (success / failure) MUST be reflected in the result UI. Concurrency is capped at 5 items running simultaneously per resize action (matching the existing HOTFIX-F deterministic-reflow router cap); requests beyond the cap MUST queue and execute in subsequent waves rather than failing.
- **FR-015**: Carousel reflow MUST preserve slide order (slide 1 remains slide 1, slide N remains slide N) and per-slide copy associations.
- **FR-016**: A single-slide carousel reflow MUST leave the other slides untouched and MUST NOT alter the carousel's slide count.

**History & non-destruction**

- **FR-017**: A resize action MUST NOT destroy the original ad. The original generation remains the canonical history entry (one card per concept); each successful resize is attached to that same generation as a variant chip labeled with its aspect ratio. Clicking a chip switches the displayed ratio in place without creating a new top-level history card. This reuses the existing `mockupHistory`-style variant pattern.
- **FR-017a**: Each resized variant is stored as a chip keyed by its aspect ratio only. Maximum 6 chips — one per supported ratio. Chips are labeled with the ratio (e.g. 9:16, 4:5). No method label is shown to the user. When a new resize produces a result for a ratio that already has a chip, the chip is replaced.
- **FR-018**: Every resize uses the original generation's `imageUrl` as the source — regardless of which variant or chip is currently displayed. Chaining resizes (resizing a resized output) is not supported. The original is always the source.

**Resilience & diagnostics**

- **FR-019**: When a per-item operation in a batch or carousel resize fails, the failed item MUST be visibly marked, MUST NOT be charged, and the user MUST be able to retry just the failed items without re-resizing the successful ones.
- **FR-020**: Resize operations MUST record diagnostic signals (e.g., the backend-selected method (not user-facing), text-overflow events, brand-color reinforcement applied) on the generation's resolution trace so the team can investigate quality issues post-hoc without rerunning.

**Surface honesty**

- **FR-021**: Clicking a ratio that matches the original generation's aspect ratio is a no-op — no callable is invoked, no credits are deducted, no preview is shown. The no-op check uses the original generation's `metadata.aspectRatio`, not the currently displayed chip's ratio. Example: original is 1:1, user resized to 9:16 and is viewing that chip — clicking 1:1 is a no-op, clicking 9:16 again is NOT a no-op (it re-renders from the original 1:1 source).

### Key Entities *(include if feature involves data)*

- **Generation**: An existing finished ad record. Stores the original aspect ratio, the build plan that produced it, brand color inputs (if any), and — after resize — a list of attached reflowed variant chips plus a per-resize diagnostic trace. Remains the single canonical history card no matter how many resizes are performed.
- **Resize Action**: A user-initiated request bundling `{ source generation, target aspect ratio, scope, optional slide index }`. Produces 1..N reflowed images and a credit ledger entry per successful image.
- **Reflowed Variant (chip)**: The output of one image being resized, attached to its parent generation as a selectable chip labeled with its aspect ratio. Stores the new image, the new aspect ratio, the pre-text image (so text can be re-composited later), and any diagnostic flags (overflow reduction applied, etc.). Chips accumulate on the parent across multiple resize actions.
- **Safe Zone Definition**: A per-aspect-ratio set of percentage insets (top/right/bottom/left) used to fit re-composited text inside the visible frame.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who has finished a single ad can produce a same-creative variant at a different aspect ratio in under 30 seconds from the moment they click a ratio button (including preview, confirm, render, text composite).
- **SC-002**: A user who has finished a batch of 4 ads can produce 4 resized variants at a new ratio in a single confirmation, with at most a 4× total wait versus the single-ad case (i.e., parallel execution, not serial). The 5-concurrent cap means batches of ≤5 items run in a single wave; batches of 6–10 run in two waves; SC-002 applies to the typical (≤4) batch sizes.
- **SC-003**: A user who has finished a 7-slide carousel can resize the whole carousel in a single confirmation while keeping slide order and per-slide copy correctly paired in 100% of successful runs.
- **SC-004**: At least 95% of resized outputs have all text elements (headline, sub-headline, caption, CTA) fully inside the new ratio's safe zone without any visible clipping. The remaining ≤5% ship at a reduced font size with a diagnostic flag set; none ship clipped.
- **SC-005**: 100% of resize prompts where `brandColorPrimary` is set include the `BRAND COLOR LOCK` instruction block — validated by fixture test T012.
- **SC-006**: The CSS preview renders within 1 second of a ratio-button click in 95% of clicks and costs 0 credits in 100% of clicks.
- **SC-007**: Credits charged for a resize equal the count of *successfully* delivered images in 100% of runs (no over-charging on partial failures, no under-charging on successes).
- **SC-008**: Repeat-ratio clicks (clicking the ratio the ad is already at) result in 0 credit deductions and 0 server-side work in 100% of clicks.

## Assumptions

- The deterministic two-path reflow router (delivered by HOTFIX-F / 955-aspect-reflow) is the engine that produces resized images. This phase wires UX, batch/carousel scope, text re-composition, brand-color preservation, and the CSS preview on top of that engine. The backend-selected method (not user-facing) is chosen automatically by the router — the user sees a single Resize action with no method selector.
- Brand colors (primary, secondary) are already captured on the generation record by Phase 15 (956-brand-colors). When absent, the brand-color reinforcement is skipped silently.
- The 6 supported aspect ratios (1:1, 4:5, 3:4, 4:3, 9:16, 16:9) are the complete set for the foreseeable future of this phase. Custom ratios are not in scope.
- Safe-zone insets follow taller-ratio-needs-larger-vertical-padding / wider-ratio-needs-larger-horizontal-padding logic, with 1:1 uniform. Concrete values are provided in the build matrix.
- Credit pricing for resize equals the cost of one image generation per resized image (one resize = one generation credit cost; batch of 4 = 4× generation cost; carousel of 7 = 7× generation cost). The Generate Resize button displays the total cost before the user commits. The underlying per-generation rate is governed elsewhere and is not part of this spec.
- Retargeting-mode reflow is out of scope for this phase and is tracked separately.
- The CSS preview is a UI-only approximation (object-fit-style framing). It is not expected to be pixel-accurate to the committed render — only to give the user a confidence read on framing before they spend credits.
- Failures of individual items in batch or carousel reflow are normal and acceptable; the platform contract is best-effort partial success, not all-or-nothing.
- The user's existing generation history (single ads, batches, carousels) is the source of records that can be resized. Resize cannot be invoked outside of a finished generation.
