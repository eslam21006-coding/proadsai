# Feature Specification: HOTFIX-E — Hybrid Logo Handling

**Feature Branch**: `0953-hotfix-hybrid-logo`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "create the spec for \"HOTFIX-E — Hybrid Logo Handling (CRITICAL — P0)\" mentioned in \"docs/LAUNCH_MATRIX.md\""

## Overview

The current image-generation pipeline asks the underlying model to render every brand logo into the final ad image as part of one combined drawing pass. This produces two recurring failures that block release:

1. **Logos drawn as UI elements (corner badges, top-bar lockups, CTA button marks) are visibly distorted.** The model treats them as text and rearranges the letters into nonsense like "SIRM" / "SRM". This is a trust-killer — the brand mark is literally wrong on the finished ad.
2. **Device screens hallucinate fake content.** The model invents fake logos, fake dashboards, fake charts, and unreadable text on laptop screens, monitor screens, tablet screens, and phone screens whenever a device appears in the scene, because the current prompt invites the model to put "content" on the screen.

By contrast, the model is consistently good at rendering logos that exist as **physical objects in the scene** — a logo on a coffee mug, a laptop lid, a t-shirt chest, a sign behind the hero, a book cover, a portfolio. In those cases it treats the logo like a texture and respects perspective, lighting, and material.

This hotfix replaces the current "render everything in one pass" approach with a **HYBRID pipeline that routes each logo placement to the right rendering path based on a per-placement MODE**:

- **UI logos** (corner badges, top-bar lockups, CTA button marks) — the model is told to LEAVE THE ZONE CLEAR; the logo is then placed deterministically post-render so it is pixel-perfect, with controlled width, opacity, and a subtle drop shadow.
- **Environmental logos** (mug, laptop lid, wall art, t-shirt, signage, merch, book cover, tablet back) — the model renders them naturally inside the scene, matching perspective, lighting, and material. No post-render compositing is applied.
- **Device screens** (laptop screen, monitor, tablet front, phone, smartwatch face) — the model is forbidden from rendering ANY text, logo, chart, graph, dashboard, or app UI. Screens MUST be blank/dark, an abstract glow, an out-of-focus blur, or a dimmed unreadable surface. No exceptions.

The visual style of the ad determines the default mode (minimalist / corporate → UI; lifestyle / authentic / documentary → environmental; mixed in carousels — first and last slides UI for brand recognition, middle slides environmental for storytelling).

This is a HYBRID fix, not a ban: it preserves the creative placements users love (logo on a mug, logo on a t-shirt, logo embossed on a leather portfolio) while eliminating the distorted-text failures and the fake-screen-content failures.

## Clarifications

### Session 2026-04-24

- Q: When the AI plans a UI logo in a zone that collides with a planned text overlay (hook, subhead, price, CTA), what is the expected behavior? → A: Auto-shift the UI logo to the nearest non-colliding zone of the same vertical band (e.g. top-right collides → try top-left → top-center). Log the auto-shift on the resolution trace so it is reviewable. Never overlap text. Dropping the logo is a last resort only when no non-colliding zone exists anywhere on the canvas (see the separate unresolvable-collision clarification below).
- Q: What is the cap on number of logos per placement mode in a single ad? → A: At most 2 UI-mode logos per ad (to preserve clean composition). At most 3 environmental-mode logos per ad (only if natural to the scene — never invent surfaces just to host a logo). The total respects the existing five-logo upload cap from HOTFIX-D.
- Q: For carousel ads, how should the mix of modes be distributed across slides? → A: First slide and last slide use UI mode for brand recognition and CTA respectively; middle slides default to environmental mode for storytelling. The AI MAY override the default for a given slide if the slide's individual style strongly suggests the other mode.
- Q: When the deterministic UI-logo compositing step itself fails (corrupt logo file, unsupported format, image-processing error, missing source after re-load), what should the pipeline do? → A: Emit the base rendered image with the planned UI logo zone left clear (no logo placed for that one logo), record a per-logo soft warning on the resolution trace identifying which logo failed and why, and do NOT block delivery of the rest of the ad. Other UI logos and other generations in the batch/carousel are unaffected.
- Q: When a UI-logo placement collides with a planned text zone and no non-colliding candidate exists in the same vertical band, what should happen? → A: Try the other vertical band's candidate zones first (e.g. top-band exhausted → try bottom-band candidates). If still no non-colliding candidate exists anywhere, drop just that one UI logo, record the drop on the resolution trace with the reason, and deliver the ad without it. Do NOT hard-fail the whole generation. Do NOT drop the text overlay.
- Q: What are the numeric bounds for UI-mode logo width as a percentage of canvas width? → A: Minimum 5% (any smaller becomes illegible on social feed thumbnails). Maximum 18% (any larger competes with hero and text overlays for visual weight). Default 12% (matches typical premium / minimalist corner-logo conventions). The planner MUST emit values in [5, 18]; values outside the range MUST be clamped to the nearest bound and the clamp logged on the resolution trace.
- Q: What are the numeric bounds for UI-mode logo opacity? → A: Opacity range [0.85, 1.0], default 1.0. A brand mark is not a watermark — it should read fully and clearly. The 0.85 floor is a safety valve for visually busy corners where the planner explicitly chooses a subtle reduction; anything below 0.85 looks like a stale screenshot artifact and undermines the trust this hotfix is fixing. Values outside [0.85, 1.0] MUST be clamped to the nearest bound and the clamp logged on the resolution trace.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pixel-perfect UI logos for minimalist and corporate ads (Priority: P1)

A user is generating a minimalist or corporate-style ad with a logo planned for the top-right corner (a UI placement). Today the rendered ad shows a distorted version of the logo — letters rearranged, mark unreadable, brand name spelled wrong ("SIRM" / "SRM" instead of the real wordmark). The user expects the logo to appear exactly as uploaded — correct letters, correct proportions, correct colors, no distortion — at the planned position, size, and opacity.

**Why this priority**: This is the headline reason the hotfix is rated CRITICAL P0. A distorted brand mark on a finished ad is unshippable. The user cannot deliver the ad to a client with the wordmark spelled wrong, so the workflow stops here without the fix. UI logos are also the most common placement for premium / minimalist creative, which is a primary use case.

**Independent Test**: Upload one logo, generate a minimalist single ad, and confirm that (a) the rendered image leaves the planned logo zone visually clear, (b) the final delivered image has the logo placed exactly as uploaded with no letter distortion, no font substitution, and no color shift, and (c) the logo's final width and opacity match the values in the build plan.

**Acceptance Scenarios**:

1. **Given** the user has uploaded one logo and the AI plans a UI placement in the top-right at 12% width, **When** the ad is rendered and finalized, **Then** the final image contains the uploaded logo at top-right at exactly 12% of the canvas width, with the logo's letters and shape pixel-faithful to the uploaded source.
2. **Given** a UI placement is planned, **When** the model renders the base image, **Then** the planned UI logo zone in the base image is visually clear (no model-drawn logo in that zone) and is filled in by the post-render compositing step.
3. **Given** the user uploads a logo with transparency, **When** the UI placement is composited onto the rendered scene, **Then** the transparency is preserved — only the logo mark itself is visible, not a rectangular box around it.
4. **Given** a generated ad has a UI logo in the corner, **When** a reviewer inspects the wordmark at full resolution, **Then** the wordmark spelling, kerning, and proportions match the uploaded source — no "SIRM" / "SRM" / hallucinated letterforms.

---

### User Story 2 - Natural environmental logos for lifestyle and authentic ads (Priority: P1)

A user is generating a lifestyle ad — for example, a hero holding a branded coffee mug, sitting at a desk with a branded laptop lid visible, or wearing a t-shirt with a chest-print logo. Today either the logo is missing entirely from the scene or it is awkwardly grafted on like a sticker that ignores the object's perspective. The user expects the logo to appear as a natural part of the physical object — curved with the mug, foreshortened with the laptop lid, fabric-textured on the t-shirt — with scene-appropriate lighting.

**Why this priority**: Lifestyle and authentic-style ads are the second major creative category and the one that drives social/UGC-style performance. Without a natural-looking environmental logo, the ad reads as either branded stock photography (no brand) or a fake composite (overlay). This blocks the lifestyle creative path entirely. Tied at P1 with Story 1 because the two together (UI + environmental) are the full hybrid pipeline.

**Independent Test**: Upload one logo, generate a lifestyle single ad with the AI prompted to use environmental placement on a coffee mug, and confirm that the rendered image shows the logo painted onto the mug with correct curvature, correct lighting/shadow, and consistent material — and that no post-render compositing step modified the logo region (the model did all the work).

**Acceptance Scenarios**:

1. **Given** the user has uploaded one logo and the AI plans an environmental placement on a coffee mug, **When** the ad is rendered, **Then** the rendered image shows the logo on the mug with correct ceramic curvature, lighting consistent with the rest of the scene, and natural integration (not a flat sticker).
2. **Given** an environmental placement is planned, **When** the post-render pipeline runs, **Then** no UI compositing step is applied to that logo's region — the model's output for that region is the final output for that region.
3. **Given** the user uploads two logos and the AI plans environmental placements on a t-shirt and on signage behind the hero, **When** the ad is rendered, **Then** both logos appear on their respective surfaces with surface-appropriate rendering (fabric texture for t-shirt, painted/printed look for signage).
4. **Given** an environmental placement, **When** the wordmark is inspected, **Then** it is recognizably the uploaded brand mark even though it follows the object's perspective and lighting (not a perfect pixel replica — perspective transformation is expected and welcome).

---

### User Story 3 - Device screens never show fake content (Priority: P1)

A user is generating an ad with a laptop, monitor, tablet, phone, or smartwatch in the scene. Today the model invents fake content on the device screen — a fake dashboard, a fake chart, fake brand logos, unreadable text, an invented app UI. The user expects the screen to be blank, an abstract glow, an out-of-focus blur, or a dimmed unreadable surface — never invented logos, never invented text, never invented charts.

**Why this priority**: Fake screen content is the single highest-frequency hallucination in the current pipeline and is a publication blocker on its own. Even when UI and environmental logos are correct, a fake "Acme Dashboard" on a laptop screen makes the ad unshippable. Tied at P1 because no creative path is safe to ship until this rule is enforced.

**Independent Test**: Generate ten ads spanning different styles and contexts, every one of which contains a device with a screen visible. Confirm that zero of the ten rendered images contain a fake logo, fake text, fake chart, fake graph, fake dashboard, or invented app UI on any device screen.

**Acceptance Scenarios**:

1. **Given** an ad scene contains a laptop, **When** the ad is rendered, **Then** the laptop screen is one of: completely blank dark surface, abstract gradient, out-of-focus soft glow, or dimmed unreadable blur — and contains no logos, no text, no charts, no graphs, no app UI, no dashboards.
2. **Given** an ad scene contains a tablet or phone in the foreground, **When** the ad is rendered, **Then** the device's display is treated identically to the laptop screen rule above.
3. **Given** an ad scene contains a smartwatch on the hero's wrist, **When** the ad is rendered, **Then** the watch face is blank/abstract — no fake numerals, no fake notification text, no fake brand logo on the watch face.
4. **Given** the previous prompt language invited "Device screen shows content, not blank", **When** the new screen-content ban is in effect, **Then** that older invitation language is removed or neutralized so it cannot override the ban.
5. **Given** ten ads are generated containing device screens, **When** the outputs are reviewed, **Then** zero contain fake screen content of any kind.

---

### User Story 4 - UI logo placement never collides with text overlays (Priority: P2)

A user generates an ad whose layout reserves the bottom-right zone for a CTA button. The AI initially plans a UI logo in the same bottom-right zone. The user expects the system to detect the collision and automatically shift the UI logo to the nearest non-colliding zone, with the shift logged for review — never overlapping the text, and never silently dropping the logo.

**Why this priority**: UI-logo-on-CTA collisions break ad legibility but happen only on a subset of layouts where the AI's mode choice clashes with the layout contract. Worth fixing for release-quality output but not blocking: the larger structural issue (Stories 1–3) gates release first.

**Independent Test**: Force a build plan where a UI logo placement and a text overlay zone are in the same canvas region; run the pipeline and confirm the logo is auto-shifted to the nearest valid zone and the auto-shift is recorded on the resolution trace.

**Acceptance Scenarios**:

1. **Given** a UI logo is planned in a zone that overlaps a planned text overlay, **When** the post-render compositing step runs, **Then** the UI logo is auto-shifted to the nearest non-colliding zone in the same vertical band before being composited.
2. **Given** an auto-shift occurs, **When** the generation record is inspected, **Then** the resolution trace includes a flag indicating the auto-shift happened, the original target zone, and the actual placement zone.
3. **Given** an environmental logo overlaps a text zone in the rendered base image, **When** the post-render pipeline runs, **Then** no auto-shift is performed on the environmental logo (it is the model's responsibility to place environmental logos within the scene, not the compositing layer's).
4. **Given** every same-band zone is occupied, **When** the pipeline cannot find a non-colliding zone in the original vertical band, **Then** it attempts candidates in the other vertical band before giving up.
5. **Given** no non-colliding zone exists anywhere on the canvas, **When** the pipeline exhausts every candidate, **Then** that single UI logo is dropped (the ad is still delivered), the drop is recorded on the resolution trace with the reason and candidates exhausted, the conflicting text overlay is preserved, and the other logos and slides/variants are unaffected.

---

### User Story 5 - Style-aware mode selection across carousels and batch (Priority: P2)

A user generates a 5-slide carousel and a 4-item batch with multiple uploaded logos. The user expects the AI to pick UI vs environmental mode appropriate to each slide's / each variant's individual style — for example, in a carousel, slide 1 (brand introduction) and slide 5 (CTA) use UI logos for clean brand recognition while slides 2–4 (storytelling) use environmental logos. In a batch, each variant picks the mode that fits its individual creative direction.

**Why this priority**: Mixed-mode placement is what makes carousels feel like a coherent campaign instead of a uniform template. Important for release quality and for the Pro/Scale carousel/batch experience but not blocking the core single-ad fix (Stories 1–3).

**Independent Test**: Generate one 5-slide carousel and one 4-variant batch, each with one uploaded logo, and confirm that (a) at least one slide / variant uses UI mode and at least one uses environmental mode, (b) the slides where UI mode was chosen have pixel-perfect logos, and (c) the slides where environmental mode was chosen have naturally-rendered scene logos.

**Acceptance Scenarios**:

1. **Given** a 5-slide carousel is generated with one uploaded logo, **When** the build plan is produced, **Then** slide 1 and slide 5 default to UI mode and slides 2–4 default to environmental mode (the AI MAY override per individual slide style).
2. **Given** a 4-variant batch is generated with one uploaded logo and four different style directions, **When** each variant is produced, **Then** each variant's logo placement mode reflects its style (minimalist variants → UI; lifestyle variants → environmental).
3. **Given** every slide / every batch variant is produced, **When** any slide / variant uses UI mode, **Then** that slide / variant runs through the deterministic post-render compositing path (User Story 1).
4. **Given** every slide / every batch variant is produced, **When** any slide / variant uses environmental mode, **Then** that slide / variant skips the UI compositing path for that logo (User Story 2).
5. **Given** the carousel or batch contains a device with a screen, **When** every slide / every variant is rendered, **Then** the screen-content ban from User Story 3 applies on every slide / every variant.

---

### Edge Cases

- **Text-only style is selected**: no logos are placed at all (no UI compositing, no environmental rendering instructions); the existing zero-logo behavior is preserved end-to-end.
- **Zero logos uploaded**: no UI compositing runs, no environmental rendering instructions are emitted, and the existing "no invented brand marks" rule from HOTFIX-D is preserved.
- **More than 2 UI logos planned**: the planner cap of 2 UI logos per ad is enforced; surplus logos must be re-planned to environmental mode or dropped, never silently rendered as additional UI marks.
- **More than 3 environmental logos planned**: the planner cap of 3 environmental logos is enforced; surplus logos must drop rather than crowd the scene with unnatural surfaces.
- **An environmental placement is planned for a surface that does not appear in the rendered scene**: the resulting render simply lacks that logo (the system does not retroactively add a surface); this is logged as a soft warning, not a hard failure.
- **A UI placement zone falls outside the canvas after auto-shift attempts**: the system tries the other vertical band; if no non-colliding zone exists anywhere, it drops just that one UI logo (logging the drop on the resolution trace) and delivers the ad without it. Other logos, the conflicting text overlay, and other slides/variants are preserved.
- **The uploaded logo PNG is non-square or has unusual proportions**: UI compositing preserves aspect ratio when fitting to the planned width percentage; the height is computed from the logo's aspect, not assumed.
- **The uploaded logo is a low-resolution source**: UI compositing does not upscale beyond a sane factor; environmental rendering is unaffected (the model treats the source as a visual reference).
- **A reflow / aspect-ratio change occurs after generation**: UI logo positions must be re-resolved against the new canvas's safe zones (interaction with HOTFIX-F).
- **Saved projects from before this hotfix**: legacy generation records that did not store a placement mode are treated as fully environmental at re-load (the safer default — no risk of UI distortion), preserving backward compatibility.
- **The deterministic UI compositing step fails for one logo (corrupt PNG, unsupported format, image-processing error, missing source after re-load)**: the base rendered image is delivered with that one logo's planned zone left clear, a per-logo soft warning is recorded on the resolution trace identifying the logo and the failure reason, and other UI logos / other slides / other batch variants are unaffected.

## Requirements *(mandatory)*

### Functional Requirements

#### Mode classification and planning

- **FR-001**: For every ad generation, the build plan MUST produce a logo-placement record per uploaded logo, and each record MUST carry an explicit MODE — either `ui` or `environmental` — chosen by the planner based on the creative style.
- **FR-002**: The MODE choice MUST default to `ui` for minimalist, corporate, and conference-style creatives, and to `environmental` for lifestyle, authentic, documentary, and product-focused creatives. The planner MAY override the default per individual ad if the style strongly indicates the other mode.
- **FR-003**: A `text_only` creative style MUST produce zero logo placements regardless of how many logos the user uploaded.
- **FR-004**: For UI mode placements, the build plan MUST specify a canvas zone (one of: top-left, top-right, top-center, bottom-left, bottom-right, bottom-center, center), a width as a percentage of canvas width in the inclusive range [5, 18] (default 12), and an opacity in the inclusive range [0.85, 1.0] (default 1.0). Values outside either range MUST be clamped to the nearest bound and the clamp recorded on the resolution trace.
- **FR-005**: For environmental mode placements, the build plan MUST specify a physical surface (e.g. coffee mug, laptop lid, wall art, t-shirt chest, signage, book cover, tablet back) and a brief description of how the logo is physically rendered (material, perspective, lighting cue).
- **FR-006**: At most 2 UI-mode placements may be planned for any single ad. At most 3 environmental-mode placements may be planned for any single ad. The total across both modes MUST NOT exceed the user's uploaded logo count.

#### UI mode rendering rules

- **FR-007**: When at least one UI mode placement is planned, the rendering instructions to the image-generation model MUST tell the model to LEAVE THE PLANNED UI ZONE(S) CLEAR and unobstructed in its output, explicitly stating that the logo will be placed post-render.
- **FR-008**: After the model returns the rendered image, the pipeline MUST place every UI-mode logo deterministically at its planned zone, width, and opacity, using the uploaded source logo (not a model re-drawing).
- **FR-009**: UI-mode placement MUST preserve the uploaded logo's transparency so the logo mark — not a rectangular background — appears on the final image.
- **FR-010**: UI-mode placement MUST apply a subtle drop shadow or comparable contrast aid sufficient for legibility against varying scene backgrounds, without overpowering the logo.
- **FR-011**: UI-mode placement MUST validate that the planned zone does not collide with any planned text overlay zone in the layout contract; on collision, the system MUST auto-shift the placement to the nearest non-colliding zone in the same vertical band and record the auto-shift on the generation's resolution trace.
- **FR-012**: If no non-colliding zone exists in the same vertical band after exhausting all candidates, the system MUST attempt the other vertical band's candidate zones before giving up. If still no non-colliding candidate exists anywhere on the canvas, the system MUST drop just that one UI logo, record the drop on the resolution trace with the reason and the candidates exhausted, and deliver the ad without that single logo. The system MUST NOT hard-fail the whole generation, MUST NOT overlap the logo on the text, and MUST NOT drop the conflicting text overlay. Other logos and other slides / batch variants MUST be unaffected.
- **FR-012a**: A UI placement planned at the `center` zone is treated as its own vertical band of one. If that center placement collides with a text or CTA zone, the system MUST drop that one UI logo directly without attempting any auto-shift to a corner or edge zone, and MUST record the drop on the resolution trace. Rationale: auto-shifting a centered lockup (planner's intent is a deliberately centered brand mark) to an off-center zone would defeat the planner's intent more than dropping the logo. Other logos and other slides / batch variants MUST be unaffected.

#### Environmental mode rendering rules

- **FR-013**: When at least one environmental mode placement is planned, the rendering instructions to the image-generation model MUST tell the model to render the logo as a physical object on the specified surface, matching the surface's perspective, lighting, and material, using the uploaded logo as a visual reference.
- **FR-014**: Environmental mode placements MUST NOT trigger the post-render UI compositing step for that logo — the model's rendered output for that surface is the final output for that surface.
- **FR-015**: Environmental mode placements MUST be subtle and naturally part of the scene — the rendering instructions MUST NOT request large, hero-sized scene logos that read as overlays.

#### Device screen content ban

- **FR-016**: The rendering instructions to the image-generation model MUST contain an absolute ban on rendering text, logos, charts, graphs, dashboards, app UIs, notification badges, or any other text-based or symbolic content on any device screen — including but not limited to laptop screens, monitor screens, tablet displays, phone displays, smartwatch faces, and any other displayed device surface.
- **FR-017**: The rendering instructions MUST direct the model that device screens, when present, MUST be one of: a completely blank dark screen, an abstract gradient, an out-of-focus soft glow, or a dimmed screen with unreadable blur. No exceptions.
- **FR-018**: Any prior prompt language that invited the model to put "content" on device screens MUST be removed or neutralized so it cannot override the screen-content ban.
- **FR-019**: The screen-content ban MUST apply uniformly to single ads, every slide of a carousel, and every variant of a batch.

#### Carousel and batch propagation

- **FR-020**: Carousel build plans MUST default to UI mode for the first slide and the last slide (brand recognition + CTA) and to environmental mode for the middle slides (storytelling). The planner MAY override the default for an individual slide whose style strongly indicates the other mode.
- **FR-021**: Every slide of a carousel MUST run the per-slide hybrid pipeline independently — UI placements on that slide are composited post-render for that slide; environmental placements are rendered by the model on that slide.
- **FR-022**: Every variant of a batch MUST run the per-variant hybrid pipeline independently and pick its mode from its own style.
- **FR-023**: The screen-content ban (FR-016 to FR-019) MUST be re-applied on every slide and every variant.

#### Recording, traceability, and backward compatibility

- **FR-024**: Each generation record MUST persist the per-logo placement mode, planned zone or surface, planned width or surface description, and any auto-shift events so the choices and corrections are reviewable later.
- **FR-025**: Generation records produced before this hotfix (which lack an explicit per-logo mode) MUST be treated as fully environmental on re-load and re-render — the safer default — preserving backward compatibility without risking UI distortion on legacy plans.
- **FR-026**: The hybrid pipeline MUST NOT regress the existing offer-overlay (price / total-value / savings) compositing or the existing Arabic right-to-left text compositing — both run after the hybrid logo pipeline and continue to operate on their own zones.
- **FR-027**: When the deterministic UI-logo compositing step fails for a single logo (corrupt source file, unsupported format, image-processing error, missing source on re-load), the pipeline MUST emit the base rendered image with that logo's planned UI zone left clear (no logo placed for the failed entry), record a per-logo soft warning on the resolution trace identifying the logo and the failure reason, and continue to deliver the ad. The failure of one UI-logo placement MUST NOT block delivery of the ad, MUST NOT block the other UI placements on the same ad, and MUST NOT block other slides of a carousel or other variants of a batch.

### Key Entities

- **Logo Placement**: One element of the per-ad placement plan. Has: a reference to the uploaded logo (by index), an explicit mode (`ui` or `environmental`), a target location (canvas zone for UI, physical surface for environmental), a size hint (width percentage for UI, scale-relative-to-object for environmental), and optional rendering metadata (opacity for UI, environmental-context string for environmental).
- **Build Plan**: The pre-render contract returned by the planning step for one ad, one slide, or one batch variant. Now includes a `logoPlacements` array of Logo Placement records and the existing layout, palette, hook, and copy fields.
- **Resolution Trace**: The per-generation diagnostic record. Now includes per-placement records of which mode was used, whether a UI placement was auto-shifted to avoid colliding with text, and whether any cap (max 2 UI / max 3 environmental) caused a placement to be re-routed or dropped.
- **Layout Contract**: The per-aspect-ratio definition of safe zones for text and CTA overlays. Used by UI-mode placement validation to detect collisions and drive auto-shift.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across a manual review sample of 20 ads generated with a UI-mode logo placement, at least 19 (95%+) show the uploaded wordmark exactly correct — no letter rearrangement, no font substitution, no "SIRM" / "SRM" style distortion. The pre-hotfix baseline on the same prompts shows fewer than 30% correct.
- **SC-002**: Across a manual review sample of 20 ads generated with an environmental-mode logo placement, at least 17 (85%+) show the logo naturally integrated into the named surface (mug, t-shirt, signage, etc.) with surface-appropriate perspective and lighting. (Threshold lower than SC-001 because environmental rendering remains a model judgment call.)
- **SC-003**: Across a manual review sample of 20 ads containing any device with a screen (laptop, monitor, tablet, phone, smartwatch), zero (0/20) contain a fake logo, fake text, fake chart, fake dashboard, fake app UI, or any invented content on any device screen.
- **SC-004**: For every ad whose build plan placed a UI logo in a zone that collided with a planned text overlay zone, 100% of those collisions are auto-shifted to a non-colliding zone, and 100% of those shifts are recorded on the resolution trace.
- **SC-005**: For mixed carousels of 5 slides with one uploaded logo, the default plan distributes UI mode to slide 1 and slide 5 and environmental mode to slides 2–4 in at least 90% of generations (override is allowed when slide style strongly indicates otherwise).
- **SC-006**: User-reported incidents of the form "the logo on my ad is spelled wrong" or "there's a fake dashboard on the laptop" drop to zero within 14 days of release; pre-release baseline is captured from existing support / feedback channels.
- **SC-007**: The hotfix introduces zero regressions on offer-overlay compositing (price / total-value / savings) and zero regressions on Arabic right-to-left text compositing — verified on a sample of 10 pre-hotfix and 10 post-hotfix renders covering both features.
- **SC-008**: Backward compatibility: 100% of generation records and saved projects created before this hotfix continue to load and re-render successfully after the hotfix, with the legacy logos defaulted to environmental mode and no UI distortion introduced as a side effect.
- **SC-009**: Across a sample of 10 lifestyle ads generated with environmental mode, qualitative review confirms the logo reads as part of the scene (not pasted on top), measured by side-by-side comparison against the same prompt rendered without environmental-mode wording.

## Assumptions

- The image-generation model is reliably able to leave a planned canvas zone unobstructed when explicitly instructed to do so. This assumption is the basis for the UI-mode "leave zone clear" approach; if the model occasionally paints into the cleared zone anyway, the post-render compositing step still places the correct logo on top, so the outcome remains correct even on this failure.
- The image-generation model is reliably able to render a logo as a physical object on a named surface (mug, t-shirt, etc.) when given the uploaded logo as a visual reference. Quality is expected to be high but not pixel-perfect (perspective and lighting transformation are expected and welcome).
- The existing post-render Sharp-based compositing pipeline used for offer overlays and Arabic text is a sufficient foundation for adding the UI-logo compositing path — no new image-processing engine is required.
- The existing brand-logo upload path (HOTFIX-D, up to 5 logos) is already in place. This hotfix consumes the multi-logo set; it does not change the upload cap.
- The existing layout contract (per-aspect-ratio text safe zones) is sufficient to drive collision detection for UI-logo placement; no new layout primitives are introduced.
- Generation records persisted before this hotfix do not contain a per-logo placement mode field. They will be treated as fully environmental on re-load, which preserves correctness (no UI distortion possible on legacy data) at the cost of not retroactively gaining pixel-perfect UI placement.
- The screen-content ban is enforceable through prompt instruction alone (no per-image pixel inspection of device screens is required to reach release-quality results, and post-hoc rejection-and-retry of screens is out of scope).

## Dependencies

- **HOTFIX-D — Multi-Logo Upload (PR #26, merged)**: this hotfix depends on the multi-logo upload set already being passed through every generation entry point. Without HOTFIX-D, only one logo would ever reach the planner.
- **Phase 5 — Render Prompt Pipeline**: this hotfix modifies the build-plan + render pipeline that Phase 5 established; the pipeline must be in place and stable.
- **HOTFIX-F — Deterministic Aspect Ratio Reflow**: HOTFIX-E and HOTFIX-F are sibling P0s. UI-logo positions need to re-resolve against the new canvas's safe zones when an aspect ratio change occurs; the interaction with HOTFIX-F is acknowledged here but the reflow logic itself is owned by HOTFIX-F.
- **Phase 19 — Direct-Response Design Upgrades**: blocked on this hotfix per the launch matrix; does not begin until HOTFIX-E and HOTFIX-F are stable.

## Out of Scope

- Pixel-perfect deterministic placement of environmental logos (mug, t-shirt, etc.). Environmental logos remain a model rendering — quality improvement on environmental logos is a future-quality concern, not part of this hotfix.
- A user-facing toggle to force UI vs environmental mode per logo. The hotfix relies on the planner picking mode from style; an explicit user override is a follow-up.
- Per-zone user-facing customization of UI logo position, width, or opacity beyond what the planner produces.
- Detection or rejection of invented screen content via post-hoc image inspection. The screen-content ban is enforced through prompt instruction; pixel-level enforcement is a separate quality concern.
- Any change to the offer-overlay (price / total-value / savings) pipeline or the Arabic right-to-left text-compositing pipeline. Both are preserved unchanged and run after the hybrid logo pipeline.
- Any change to the upload UI or upload count cap. The upload path is owned by HOTFIX-D; this hotfix only consumes its output.
- Aspect-ratio reflow behavior. Owned by HOTFIX-F; this hotfix only acknowledges that UI-logo positions must re-resolve against the new canvas after a reflow.
- Magic Edit interactions with composited logos (re-edits over a UI-composited logo). Owned by Phase 11.
