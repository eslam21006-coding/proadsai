# Feature Specification: Independent Multi-Size Ad Generation

**Feature Branch**: `961-independent-multisize`
**Created**: 2026-06-21
**Status**: Draft
**Input**: User description: "Phase 17 — Replace the broken reflow/resize path with independent per-size regeneration. Users pre-select one or more sizes (Square 1:1, Portrait 3:4, Story 9:16) before generating, or resize an existing result to a new size after generation. Each size is generated as a fresh native design using the original image only as a visual reference (hero, environment, colors), with the full copy and layout prompt rebuilt for the target canvas. Applies across single image, batch, and carousel modes. Supersedes HOTFIX-F."

## Clarifications

### Session 2026-06-21

- Q: When are the 5-credits-per-design charged, and what happens to credits for a failed design? → A: Charge the full request total upfront (after the affordability pre-check), then auto-refund the credits for any design that ends up failing.
- Q: In a pre-select multi-size run, if the anchor (primary size) generation fails, what happens to the variant sizes that use it as a visual reference? → A: Variants proceed, generated from the shared brief without a visual reference; the anchor is surfaced as a retryable failure (partial success).
- Q: How should sizes be sequenced in a pre-select multi-size run? → A: Generate the anchor size first via the existing single-size path, then fan out the remaining sizes in parallel using the completed anchor as the visual reference.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pre-select multiple sizes before generating (Priority: P1)

As a marketer creating an ad, I want to choose more than one size in the generation form before I press Generate, so that I receive my ad in every placement size I need (e.g. feed Square and Story) in a single run, each one properly composed for its own canvas shape rather than squeezed or cropped.

**Why this priority**: This is the core value of the feature and the primary replacement for the broken reflow path. It eliminates the dropped-text defect on tall canvases and gives users platform-ready creatives in one action. Without it, the feature delivers nothing.

**Independent Test**: Select Square 1:1 + Story 9:16 in the form, press Generate once, and confirm two independent designs are produced — both showing every requested copy element (headline, plus subheadline / CTA / benefit when present) with zero dropped elements, and visibly consistent hero, environment, and color palette across the two sizes.

**Acceptance Scenarios**:

1. **Given** a complete brief and exactly one size selected, **When** the user presses Generate, **Then** the system behaves exactly as today — one design at one size, no behavioral change.
2. **Given** a complete brief and two sizes selected (Square + Story), **When** the user presses Generate, **Then** the system produces two designs from the same brief, displayed grouped together, each rendering all non-null copy fields with no dropped elements.
3. **Given** a complete brief and all three sizes selected, **When** the user presses Generate, **Then** three designs are produced (15 credits total) and the credit cost was shown before the user committed.
4. **Given** the Story 9:16 design specifically, **When** generation completes, **Then** the CTA and benefit text are present and legible — the headline/CTA loss from the old reflow path does not occur.
5. **Given** the primary (anchor) size and one or more additional sizes are requested, **When** generation runs, **Then** the additional sizes are visually consistent with the anchor (same hero appearance, same environment, same color palette) while each layout is optimized for its own canvas — and no body distortion (merged legs, stretched proportions) appears, because each size is generated natively rather than transformed.

---

### User Story 2 - Resize an existing result to a new size (Priority: P1)

As a marketer who already generated an ad at one size, I want to click Resize and pick a different size, so that I can add a placement-ready version (e.g. a Story version of my Square ad) without re-entering my brief — and have it look like the same ad, not a stretched copy.

**Why this priority**: This replaces the current broken "Resize" button directly and is the post-generation counterpart to Story 1. It is equally critical because it is the path most users reach for after seeing a result they like.

**Independent Test**: Generate at Square 1:1, click Resize, choose Story 9:16, and confirm a fresh design is produced at the new size — visually consistent with the original (same hero, environment, palette) and showing all non-null copy elements correctly composed for the taller canvas. Confirm 5 credits were charged and shown beforehand.

**Acceptance Scenarios**:

1. **Given** a generated Square design, **When** the user resizes to Story 9:16, **Then** a fresh design is produced using the original generated image as a visual reference plus the full rebuilt prompt for the new canvas, not a reflow/transform of the pixels.
2. **Given** the original brief had a null optional field (e.g. no subheadline), **When** the user resizes, **Then** the resized design also omits that field — null is carried forward and produces no text.
3. **Given** the user uploaded their own reference image for the original generation, **When** the user resizes, **Then** the resize uses the user's uploaded reference (it overrides the generated image as the visual reference).
4. **Given** a design already exists at the target size, **When** the user requests a resize to that same size, **Then** the system performs a no-op, shows "Already generated at this size", and deducts no credits.
5. **Given** the resize completes, **Then** the new variant is added to the result (the original size remains available) — resizing does not destroy the source.

---

### User Story 3 - Multi-size for batch and carousel (Priority: P2)

As a power user running batch or carousel generations, I want every item or slide available in the sizes I need, so that a multi-item campaign is placement-ready end to end, with partial failures handled gracefully rather than blocking the whole run.

**Why this priority**: Batch and carousel are Pro/Scale capabilities layered on top of the single-image flows in Stories 1 and 2. They depend on those flows working first, so they are P2, but they are essential to the feature being complete for paying tiers.

**Independent Test**: Run a batch of 4 with Square + Story pre-selected (8 designs), confirm waves of concurrent generation with per-item loading and correct grouping; separately, generate a 5-slide carousel and resize all slides to a new size, confirming per-slide loading and that 3-succeed/2-fail leaves the 3 successes visible with retry offered on the 2 failures.

**Acceptance Scenarios**:

1. **Given** batch mode, **When** the user pre-selects multiple sizes and generates, **Then** every batch item is produced at every selected size (e.g. 4 items × 2 sizes = 8 designs), each as a separate generation, with per-item/per-size loading state.
2. **Given** carousel mode, **When** the user wants multiple sizes, **Then** multi-size is available only through the resize flow (not pre-select); resizing a carousel resizes all slides to the new size, each as a separate generation with per-slide loading state.
3. **Given** a large multi-size request (e.g. batch 4 × 3 sizes = 12 designs), **When** generation runs, **Then** calls execute in waves capped at a maximum concurrency so the provider is not overwhelmed, and each image resolves its own loading state independently.
4. **Given** a multi-item resize where some succeed and some fail, **When** the run finishes, **Then** successful items are shown and failed items offer retry — a partial failure never discards the successful results.
5. **Given** a provider rate limit is hit mid-run, **When** remaining calls are queued, **Then** they retry with backoff rather than failing the whole batch.

---

### Edge Cases

- **Single size selected**: identical to current behavior — no new code path is exercised for the anchor; the existing single-size generation produces it.
- **All three sizes selected**: three independent generations from one brief, 15 credits, cost shown up front.
- **Resize to an already-generated size**: no-op, "Already generated at this size", zero credits.
- **Batch + multiple pre-selected sizes**: e.g. 4 × 3 = 12 designs run in concurrency-capped waves.
- **Carousel + resize**: e.g. 5 slides → new size = 5 generations, per-slide loading.
- **Provider rate limit during parallel generation**: queue remaining calls, retry with exponential backoff, do not fail the whole batch.
- **Insufficient credits**: total cost is checked before any generation starts; if the user cannot afford the full request, it is blocked with a clear message showing required vs. available credits — nothing is charged.
- **Anchor failure in pre-select run**: if the anchor size fails, the variant sizes still generate (from the brief, without a visual reference) and the anchor is shown as a retryable failure; the run is not aborted.
- **Designs fail after upfront charge**: the full total is charged upfront after the affordability check, and credits for any failed design are auto-refunded so net charge equals 5 × successful designs.
- **Null optional fields (Phase 24B)**: a null field in the source brief stays null for every additional size — no text is added to the prompt or the image.
- **User-uploaded reference image**: always overrides the generated image as the visual reference, for both pre-select and resize.
- **Provider/function time limits**: a single generation must complete within the platform function time limit; very large multi-size requests are decomposed so no single execution exceeds that limit.
- **Retry of a failed variant**: re-requesting a failed variant must not double-charge — the same request is treated idempotently.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support requesting a design at one or more sizes drawn exclusively from the allowed size set (Square 1:1, Portrait 3:4, Story 9:16). Pre-selecting multiple sizes before generation MUST be available for single-image and batch modes. Carousel mode MUST obtain multiple sizes only through the resize flow, not pre-select.
- **FR-002**: When multiple sizes are requested in one run, the system MUST produce each size as an independent generation from the same shared brief (same hook, concept, art direction, hero, environment, colors, and copy fields).
- **FR-002a**: A pre-select multi-size run MUST be sequenced anchor-first: the anchor (primary) size is generated to completion first, then the remaining sizes fan out in parallel using the completed anchor design as their visual reference. The system MUST NOT generate all sizes in parallel directly from the brief with no cross-size reference.
- **FR-003**: Each additional (non-anchor) size and each resize MUST be generated as a fresh native design for the target canvas — the original image is supplied only as a visual reference for consistency (hero appearance, environment, color palette), never as pixels to transform, stretch, or crop.
- **FR-004**: The prompt for each size MUST be the full generation prompt rebuilt for that canvas — including all non-null copy elements (headline always; subheadline, CTA, benefit when present), hero description, environment, art direction, brand colors, and layout rules appropriate to the aspect ratio.
- **FR-005**: The anchor (primary) size in a pre-select multi-size run MUST be produced by the existing unchanged single-size generation path. Only non-anchor sizes and resizes use the new size-variant path.
- **FR-005a**: If the anchor generation fails in a pre-select multi-size run, the remaining (variant) sizes MUST still proceed — generated from the shared brief without a visual reference — and the anchor MUST be surfaced as a retryable failure (partial success). A failed anchor MUST NOT abort the whole run.
- **FR-006**: Optional copy fields that are null in the source brief MUST remain null for every additional size and resize (Phase 24B carry-forward) — null produces no prompt text and no rendered text.
- **FR-007**: The Resize action MUST produce a fresh design at the chosen size using the source image as a visual reference plus the rebuilt prompt, and MUST add the new variant alongside the original rather than replacing the source.
- **FR-008**: If the user uploaded their own reference image, that uploaded reference MUST override the generated image as the visual reference for all additional sizes and resizes.
- **FR-009**: Resizing a batch MUST resize every batch item, and resizing a carousel MUST resize every slide — each item/slide as a separate generation.
- **FR-010**: Parallel generations MUST execute with a maximum concurrency cap (no more than 10 simultaneous provider image calls) to avoid rate limits and timeouts; each design MUST surface its own independent loading state.
- **FR-011**: Requesting a size that already exists and succeeded for the same scope MUST be a no-op: the system shows "Already generated at this size" and charges zero credits.
- **FR-012**: The system MUST price each rendered design at 5 credits and MUST display the total credit cost (designs × 5) before the user commits to a generation or resize.
- **FR-012a**: After the affordability pre-check passes, the system MUST charge each design's 5 credits upfront — at the start of that design's generation, before it renders (the full request total is effectively reserved as the designs fan out) — then MUST automatically refund the 5 credits for every design that ends up failing. Net credits charged MUST equal 5 × number of successfully rendered designs.
- **FR-013**: The system MUST verify the user can afford the full requested cost before starting; if not, it MUST block the request with a message showing required vs. available credits and MUST NOT charge anything.
- **FR-014**: Retrying a failed variant MUST be idempotent — it MUST NOT double-charge credits for the same variant request.
- **FR-015**: Partial failures MUST be tolerated: successful designs are shown and failed designs offer retry; a partial failure MUST NOT discard successful results, and credits for failed designs MUST be refunded per FR-012a.
- **FR-016**: On a provider rate limit, remaining queued calls MUST retry with exponential backoff rather than failing the entire run.
- **FR-017**: Results MUST be displayed grouped so the user sees all sizes of the same ad (or all sizes of the same item/slide) together.
- **FR-018**: The system MUST preserve the existing copy-fidelity guarantee for every size — the exact requested copy strings MUST reach each rendered image via the existing build-prompt-and-validate-with-retries contract.
- **FR-019**: Phase 22 copy-quality rules (readability, lived-symptom language, claim validation), Phase 23 anti-sameness rules for batch/carousel, Arabic RTL rendering, and GCC cultural compliance MUST remain fully active and unaffected.
- **FR-019a**: Anti-sameness variation MUST apply only to the primary/distinct results of a batch or carousel. Size variants of an already-produced result MUST NOT trigger or write a new anti-sameness fingerprint — a variant is the same ad at a different size, not a new creative.
- **FR-020**: The size-variant lifecycle MUST be tracked per design with states pending → succeeded, and failed as a terminal state until explicit user retry, so loading, grouping, and retry can be driven from that status.
- **FR-021**: The superseded reflow implementation (HOTFIX-F router: outpaint vs. re-render, and the old "REFLOW: Ratio" prompt block) MUST be retained as commented-out code (not deleted) with a note that Phase 17 supersedes it, preserving reversibility.
- **FR-022**: All multi-size behavior MUST work across every supported creative mode and format combination already supported today (single, batch within tier caps, carousel within tier caps), with no regression to existing modes, art directions, or universe selections.

### Key Entities *(include if feature involves data)*

- **Multi-Size Request**: a generation or resize request carrying the shared brief, the target size(s) from the allowed set, the scope (single / batch / carousel), and the visual-reference source. Drives how many designs are produced and the total credit cost.
- **Size Variant**: one rendered design at one specific size belonging to a parent result. Has a target ratio, a status (pending / succeeded / failed), the URL when succeeded, and an audit of which image seeded its visual reference (uploaded / source-original / anchor / none). For single images, variants accumulate on the existing per-result history; for batch items and carousel slides, variants are keyed by ratio on the item/slide.
- **Visual Reference**: the image supplied to guide a variant's appearance — resolved in priority order as user-uploaded reference, then the result's own original image, then the anchor design. Never used as pixels to transform.
- **Credit Cost Estimate**: the pre-commit total shown to the user, computed as number of designs to render × 5 credits, with same-size no-ops excluded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a user selects Square + Story from one brief, both sizes are generated independently and 100% of requested non-null copy elements (headline, subheadline, CTA, benefit) appear in both designs — zero dropped elements.
- **SC-002**: Story 9:16 renders all requested text elements including CTA in 100% of generations — the headline/CTA loss observed on the old reflow path is eliminated.
- **SC-003**: Across sizes of the same ad, hero appearance, environment, and color palette are recognizably consistent while each layout is composed for its own canvas, as confirmed by reviewer comparison, with no body-distortion artifacts.
- **SC-004**: The Resize action produces a fresh native design at the new size (not a stretched/cropped transform) in 100% of cases, and resizing to an already-generated size is a no-op with zero credits charged.
- **SC-005**: Credit accounting is exact — the total is shown before commit, insufficient-credit requests are blocked with nothing charged, the full total is charged upfront and failed designs are auto-refunded so net credits charged equal 5 × successfully rendered designs, and no retry double-charges.
- **SC-006**: For batch and carousel multi-size, partial failures preserve all successful designs and offer retry on failures in 100% of partial-failure cases; large requests stay within the concurrency cap.
- **SC-007**: All pre-existing automated test suites pass with zero new failures (cultural compliance 929, copyQuality 71, copyStructure 206, conditionalCopyFields 77, step2OptionalFields 22, modeFormatValidator 6144 fuzz; ~7,690+ total), and Phase 22 / 23 / 24B behaviors remain green.

## Assumptions

- The allowed size set is exactly Square 1:1, Portrait 3:4, Story 9:16, sourced from the existing single source of truth for sizes; no new sizes are introduced.
- "Anchor/primary size" means the first size in a pre-select run (or the originally generated size for a resize); it is produced by the existing single-size pipeline unchanged.
- Maximum provider image concurrency is 10 simultaneous calls; backoff retry handles transient rate limits.
- Credit price is fixed at 5 credits per rendered image design and 1 credit per text generation (unchanged from current pricing); only image designs are multiplied by size count.
- The data model is additive only — no migration. Single-image variants reuse the existing per-result history; batch items and carousel slides gain a per-ratio variant map. Legacy records without variant data behave as before.
- Idempotency for variants is keyed by generation + scope + item index + target ratio to prevent double-charge on retry.
- The existing build-prompt → validate-copy-fidelity-with-retries contract is reused per size without modification.
- HOTFIX-F (specs/955-aspect-reflow) is superseded; its code is commented out rather than removed, consistent with the project's reversibility constraint.
- Carousel pre-select is intentionally out of scope per prior clarification; carousel reaches multiple sizes only via resize, matching existing carousel UX where size selection happens post-generation.
