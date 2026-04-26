# Feature Specification: Brand Colors — End-to-End Consistency

**Feature Branch**: `956-brand-colors`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "create the spec for Phase 15 — Brand Colors that's in docs/LAUNCH_MATRIX.md"

## Background

Brand colors (a primary and an optional secondary hex) are already captured per workspace and per audience avatar, and a picker exists in the input form. They are also already injected into the single-image generation prompt with an anti-placeholder guard. However, brand colors currently fall out of the pipeline in multiple places that matter to the customer: across the additional slides of a carousel, across the additional variations of a batch run, when generating a retargeting ad that should visually echo the original cold ad, and inside the post-render text compositor that paints CTAs and headlines. There is also no verification that the rendered image actually contains the brand color, and no in-form preview that lets the user trust the colors before spending credits.

This feature closes those gaps so that whenever a user has set brand colors, every asset that ships from the platform is visibly on-brand, and the user can see and trust that fact before and after generation.

## Clarifications

### Session 2026-04-26

- Q: When multiple sources can supply brand colors for a generation (form input, audience avatar, inheritance from a linked cold ad, workspace), what is the precedence order? → A: form input > audience avatar > inherited cold-ad > workspace.
- Q: For multi-asset generations (carousels, batches), does the post-render brand-color compliance check run per-asset or per-generation? → A: Per-asset — every slide and every batch item is independently flagged and independently deducted.
- Q: Do historical generation records (created before this feature ships) need their brand-color fields backfilled? → A: No backfill. Legacy generations fall back to "no brand colors" on reflow; user can manually re-enter colors at reflow time.
- Q: Do brand-color guarantees (compositor defaults, compliance check, no-placeholder rule) extend to magic edit and remix flows? → A: Yes — magic edit gets the same treatment as initial generation; remix inherits brand colors from its source asset using the same precedence rule as retargeting inheritance.
- Q: When the brand primary is used as the CTA background, how is the CTA text color chosen? → A: Auto-pick white or near-black based on the luminance of the brand primary, guaranteeing legibility.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Brand consistency across every multi-asset generation (Priority: P1)

A user with brand colors set on their workspace generates a 7-slide carousel and a 4-image batch. Every slide of the carousel — not just the first — uses the same primary brand color in a CTA, accent, or heading highlight, and the secondary brand color as a supporting accent. Every variation in the batch shares the same brand palette: composition and messaging vary, the color scheme does not. The result is a swipeable, scannable set of assets that read as one coherent brand presence rather than a collage of unrelated designs.

**Why this priority**: This is the single largest gap. Carousels and batches are the high-value, multi-asset modes; the entire point of running a multi-slide or multi-variation generation is brand presence at scale, and today that presence collapses after the first asset. Without this, the rest of the work in this phase is decorative.

**Independent Test**: With brand primary and secondary set on the workspace, generate one carousel and one batch. Open every output asset and confirm that the primary brand color appears as a clearly identifiable element (CTA, accent, or heading highlight) in 100% of slides and 100% of batch items, and that the secondary brand color appears as a supporting accent. The same test is run from the picker-only path (no workspace) to confirm explicit per-generation colors propagate identically.

**Acceptance Scenarios**:

1. **Given** a workspace with primary `#0A66C2` and secondary `#F59E0B`, **When** the user generates a 7-slide carousel, **Then** all 7 slides visibly use the primary color as a CTA/accent/heading highlight and the secondary color as a supporting accent.
2. **Given** a workspace with brand colors set, **When** the user generates a batch of 4 ad variations, **Then** all 4 variations share the same brand palette and only composition and messaging differ.
3. **Given** brand colors are set, **When** the carousel or batch is generated, **Then** no rendered asset contains a placeholder string such as "[brand color]" — only the actual chosen colors appear.

---

### User Story 2 - Retargeting ads inherit brand colors from the cold ad they target (Priority: P2)

A user who already shipped a cold-traffic ad now generates a retargeting follow-up linked to that cold ad. They do not re-enter the brand colors. The retargeting ad automatically uses the same primary and secondary colors that the original cold ad used, so a viewer who saw the cold ad immediately recognises the retargeting ad as belonging to the same brand and message.

**Why this priority**: Retargeting only works if the second exposure is recognisable as a continuation of the first. Color is the fastest recognition signal a viewer has when scrolling. This makes the retargeting feature actually deliver brand recall instead of just ad delivery.

**Independent Test**: Generate a cold ad with brand colors set. Then generate a retargeting ad linked to that cold ad without supplying brand colors in the retargeting form. Confirm the retargeting output uses the same primary and secondary colors as the cold ad. Then repeat, this time supplying different brand colors at retargeting time, and confirm the explicit input wins over inheritance.

**Acceptance Scenarios**:

1. **Given** a cold ad generated with primary `#0A66C2` and the user starts a retargeting generation linked to that cold ad **without** providing brand colors, **When** the retargeting ad is generated, **Then** the retargeting output uses `#0A66C2` as its primary brand color.
2. **Given** the same cold ad source, **When** the user provides explicit retargeting brand colors that differ from the cold ad, **Then** the retargeting output uses the explicit colors and inheritance is skipped.
3. **Given** a retargeting generation linked to a cold ad that itself had no brand colors, **When** the retargeting ad is generated, **Then** the system falls back to its normal palette behaviour without error.
4. **Given** a retargeting form linked to a cold ad with non-empty brand colors and the form's brand-color pickers are empty, **When** the user views the form, **Then** an "Inheriting brand colors from the linked cold ad" label is visible; **When** the user types any value into either picker, **Then** the label hides immediately.

---

### User Story 3 - Trustworthy in-form preview and workspace-driven defaults (Priority: P3)

A user opens the input form. The brand color picker shows live swatches that preview how the chosen primary and secondary will look together (primary as background, secondary as accent). If the active workspace has brand colors, the form auto-fills them and shows a clear "Using workspace colors" label. The user can override the colors for just this generation without changing the workspace defaults. They can see, before clicking generate, that the colors they expect are the colors that will be used.

**Why this priority**: Trust before generation. This converts the brand color feature from an invisible setting into a visible promise. It also removes the most common user error — forgetting to fill the colors when the workspace already has them — and prevents wasted credits on off-brand outputs.

**Independent Test**: Open the input form on a workspace with brand colors set. Confirm both pickers auto-fill, the swatches render side by side, and the "Using workspace colors" label is visible. Change one color in the form and confirm the swatch updates instantly and the workspace defaults are not modified.

**Acceptance Scenarios**:

1. **Given** an active workspace with brand colors set, **When** the user opens the input form, **Then** both color fields auto-fill from the workspace and a "Using workspace colors" label is shown.
2. **Given** the form is open with workspace colors loaded, **When** the user changes one of the colors, **Then** the on-screen swatch preview updates immediately and the underlying workspace defaults are unchanged.
3. **Given** no workspace brand colors are set, **When** the user opens the input form, **Then** the swatches render as empty/placeholder state and the user can pick colors directly without seeing a misleading label.

---

### User Story 4 - Brand colors used by default for CTA and headline rendering (Priority: P3)

When the post-render text compositor draws the CTA button and headline, it uses the user's brand primary as the CTA button background and the brand secondary as the headline accent by default. If the user has not provided brand colors, the compositor falls back to whatever palette the build plan picked, exactly like today. Users with brand colors get on-brand CTAs and headlines without having to think about it.

**Why this priority**: This makes the most visually prominent text on the ad — the CTA and the headline — physically on-brand without any extra user step. It is a smaller surface than carousels/batches but it touches every single rendered asset.

**Independent Test**: Generate a single ad with brand colors set and inspect the rendered CTA and headline colors against the chosen primary and secondary hex values. Then generate a single ad with no brand colors and confirm the CTA and headline use the AI-chosen palette without errors.

**Acceptance Scenarios**:

1. **Given** brand primary `#0A66C2` is set, **When** an ad is rendered, **Then** the CTA button background visibly matches `#0A66C2` (within normal anti-aliasing tolerance).
2. **Given** brand secondary `#F59E0B` is set, **When** an ad is rendered, **Then** the headline accent uses `#F59E0B`.
3. **Given** no brand colors are set, **When** an ad is rendered, **Then** the CTA and headline use the build-plan palette and no brand-color-related warnings are logged.

---

### User Story 5 - Post-render brand-color compliance check (Priority: P4)

After an image is rendered, the system inspects the dominant colors actually present in the pixels. If the user's brand primary is not represented in the image within a perceptual tolerance, the asset is flagged as missing the brand color and its creative score is reduced. The flag and the deduction are visible in the asset's record so the user (or a downstream review process) can see which generations failed to land the brand identity, even though all assets remain shippable.

**Why this priority**: This is the verification layer behind the promises made by stories 1, 2, and 4. It catches model misses (the prompt asked for the brand color but the image came out without it) and surfaces them as data rather than silent failures. It is P4 because it does not block anything — it observes and flags.

**Independent Test**: Generate a small set of ads with brand colors set. For each rendered image, confirm the system records whether the primary brand color was present in the dominant palette and that the creative score was reduced when it was not.

**Acceptance Scenarios**:

1. **Given** a generation with brand primary `#0A66C2` and a rendered image whose dominant colors include a hue within the perceptual tolerance of that primary, **When** the compliance check runs, **Then** the asset is not flagged and the creative score is unchanged.
2. **Given** a generation with brand primary set and a rendered image whose dominant colors do not include the primary within tolerance, **When** the compliance check runs, **Then** the asset record carries a brand-color-missing flag and the creative score is reduced by a fixed amount.
3. **Given** a generation that did not have brand colors set, **When** the compliance check runs, **Then** no flag is raised and the creative score is unchanged.

---

### Edge Cases

- The user provides a primary brand color but no secondary. Carousel/batch consistency rules and text compositing must work using only the primary; no broken references to a missing secondary may appear in any prompt or rendered asset.
- The user provides invalid or empty hex strings. The system treats those as "no brand colors" rather than passing malformed values into prompts.
- A retargeting ad is generated and its source cold-ad record cannot be found. The system falls back to "no inherited brand colors" and the generation proceeds normally rather than failing.
- The user changes brand colors at the workspace level after a generation has already started. The in-flight generation continues with the colors that were active at submission time; only future generations pick up the new defaults.
- A carousel or batch is partially generated when an error occurs on one item. Items that did succeed must already be on-brand; the consistency contract applies per successful item and is not weakened by sibling failures.
- The post-render compliance check encounters an image it cannot color-analyse (corrupt or zero-byte file). It records that the check could not run rather than producing a false flag, and does not block the asset from shipping.
- Two user-supplied brand colors are nearly identical. The carousel/batch consistency rules still apply; downstream behaviour does not require visual distinguishability between primary and secondary.
- The user picks a brand primary that is mid-luminance (neither clearly light nor clearly dark). The auto-contrast rule for CTA text MUST still produce a deterministic choice (the higher-contrast of white vs near-black) rather than oscillating or returning a mid-gray that would itself be illegible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST apply the user's brand primary color to every slide of a carousel generation (not only the first slide), so the primary appears as a CTA, accent, or heading highlight in each slide.
- **FR-002**: The system MUST apply the user's brand secondary color (when set) as a supporting accent on every slide of a carousel generation.
- **FR-003**: The system MUST apply the user's brand primary and secondary colors to every variation of a batch generation, such that all variations share the same palette and only composition and messaging vary.
- **FR-004**: For retargeting generations linked to a cold-ad source, the system MUST inherit brand primary and secondary from the source cold ad when the retargeting request does not supply its own brand colors.
- **FR-005**: For retargeting generations, the system MUST resolve brand colors using the precedence form input > audience avatar > inherited cold-ad > workspace default; the first source with non-empty, valid colors wins and the others are ignored.
- **FR-006**: When the post-render text compositor draws a CTA button and the user has set a brand primary, the system MUST use the brand primary as the CTA button background by default, and MUST auto-pick the CTA text color (white or near-black) based on the luminance of the brand primary so the text remains legible regardless of how light or dark the brand primary is.
- **FR-007**: When the post-render text compositor draws a headline and the user has set a brand secondary, the system MUST use the brand secondary as the headline accent by default.
- **FR-008**: When no brand primary or secondary is set, the system MUST fall back to the existing AI-chosen palette behaviour for CTA and headline rendering with no error.
- **FR-009**: The system MUST never emit a placeholder string such as "[brand color]", "[primary color]", or "[brand_name primary color]" into any rendered asset; only actual chosen colors may appear in outputs.
- **FR-010**: The input form MUST display live swatch previews next to the brand primary and secondary pickers, showing how the colors will appear together (primary as background, secondary as accent).
- **FR-011**: When the active workspace has brand colors set, the input form MUST auto-fill both pickers from the workspace and display a clearly visible "Using workspace colors" label.
- **FR-011a**: When a retargeting generation form is linked to a cold ad whose brand colors will be inherited (i.e., the form's brand-color pickers are empty AND the linked cold ad has non-empty valid brand colors), the form MUST display a clearly visible "Inheriting brand colors from the linked cold ad" label. The label hides the moment the user enters any value into the brand-color pickers. When both the workspace-defaults condition (FR-011) and the inheritance condition could be true at the same time, the inheritance label takes precedence.
- **FR-012**: The user MUST be able to override the auto-filled brand colors for a single generation without modifying the workspace defaults.
- **FR-013**: After an image is rendered for a generation that had brand colors set, the system MUST analyse the dominant colors of the rendered image and flag the asset as missing the brand color when the brand primary is not represented within a perceptual tolerance. For multi-asset generations (carousels, batches), this check MUST run independently for every slide and every batch item.
- **FR-014**: When an asset is flagged as missing the brand color, the system MUST record that flag against the specific asset on the generation record (not the generation as a whole) and MUST reduce that asset's creative score by a fixed, documented amount; sibling assets in the same carousel or batch are unaffected.
- **FR-015**: The brand-color compliance check MUST NOT run for generations that did not have brand colors set, and MUST NOT raise flags or reduce scores in that case.
- **FR-016**: Brand-color enforcement (per-slide, per-batch-item, retargeting inheritance, compositor defaults, compliance check) MUST be covered by automated fixture tests that fail when any of these guarantees regress.
- **FR-017**: The system MUST treat empty, malformed, or whitespace-only brand color values as equivalent to "no brand colors" and MUST NOT inject such values into prompts or compositors.
- **FR-018**: When a retargeting generation's source cold ad cannot be located, the system MUST fall back to "no inherited brand colors" and continue generation rather than failing.
- **FR-019**: Historical generation records created before this feature shipped MUST NOT be backfilled. When a downstream feature (such as Phase 17 reflow) operates on a legacy record without brand-color fields, the system MUST treat it as "no brand colors" and allow the user to enter brand colors at the time of the downstream action.
- **FR-020**: Magic edit flows MUST apply the same brand-color guarantees as initial generation: per-asset injection into the edit prompt, compositor defaults for any newly drawn CTA/headline, anti-placeholder rule, and the post-render compliance check on the edited output.
- **FR-021**: Remix flows that produce a new asset from a source asset MUST inherit brand colors from the source asset following the same precedence rule as retargeting inheritance (form input > audience avatar > inherited from source > workspace).

### Key Entities *(include if feature involves data)*

- **Brand color pair**: A user-chosen primary hex and an optional secondary hex. Sourced from one of four places, in precedence order: per-generation form input > audience avatar attached to the generation > inherited from a linked cold ad (retargeting only) > active workspace default. The first source in this order that has non-empty, valid colors wins; the others are ignored for that generation.
- **Generation record (brand-color aspects)**: For each generation, a record of which brand colors were active at submission time and which precedence source they came from, whether they were inherited from a source cold ad, and — after rendering — a per-asset compliance result (one flag and one score-deduction outcome per slide/per batch item, independently).
- **Cold-ad source link** (retargeting): The pointer from a retargeting generation to the cold-ad generation it follows up. Used to look up brand colors for inheritance when the retargeting request does not supply its own.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For users with brand colors set, 100% of carousel slides and 100% of batch items in a generation contain the brand primary color as a clearly identifiable element (CTA, accent, or heading highlight), measured by the post-render compliance check across a 50-generation sample.
- **SC-002**: 100% of retargeting generations linked to a cold ad with brand colors and submitted without explicit brand colors render with the cold ad's primary and secondary brand colors, verified across a 20-generation sample.
- **SC-003**: 0 rendered assets in the same 50-generation sample contain any placeholder string such as "[brand color]" or "[primary color]" in visible text or ad copy.
- **SC-004**: At least 95% of users with brand colors set on their workspace have those colors auto-filled in the form on their next generation without manual re-entry, measured over a 14-day window after launch.
- **SC-005**: The post-render compliance check never delays the user seeing a finished asset; users perceive no added wait time on generations with brand colors set versus generations without.
- **SC-006**: Automated regression tests for per-slide carousel colors, per-item batch colors, retargeting inheritance, and compliance flagging pass on every CI run; a regression in any of these four guarantees blocks merge.

## Assumptions

- Brand color data is already captured at the workspace, audience avatar, and per-generation form layers; no new data-entry surface is required beyond the in-form preview swatches.
- The single-image generation path already injects brand colors with an anti-placeholder guard and does not need to be re-specified by this feature; the gap is in carousel, batch, retargeting, text compositing, UI preview, and post-render verification.
- "Perceptual tolerance" for the post-render compliance check is a small, fixed perceptual-distance threshold — the exact numeric value is an implementation detail that can be tuned without changing the user-visible behaviour described here.
- The fixed creative-score deduction for a brand-color-missing flag is a small, documented constant; the precise number can be tuned without changing the user-visible behaviour described here.
- Users editing brand colors mid-generation accept that the in-flight generation keeps the colors that were active at submission; only future generations pick up the new defaults.
- The retargeting-to-cold-ad link already exists in the data model and can be used to look up the source ad's brand colors at retargeting time.
- This feature is a prerequisite for Phase 17 (Resize & Reflow), which depends on brand color data being reliably present and trusted on every generation record.
