# Feature Specification: Testimonial Carousel

**Feature Branch**: `004-testimonial-carousel`
**Created**: 2026-04-02
**Status**: Draft
**Input**: Phase 4 from LAUNCH_MATRIX.md Section 14 — Testimonial Carousel (9 tasks: 4.1–4.9)

## Clarifications

### Session 2026-04-02

- Q: When does platform detection run? → A: During generation (server-side, batch). Upload shows a generic "Testimonial" badge. Detection runs when the user clicks Generate.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Testimonial Screenshot Upload (Priority: P1)

As a user creating a carousel ad, I can upload multiple testimonial screenshots from any messaging platform. The system accepts them and makes them available for carousel generation.

**Why this priority**: Without upload, no testimonial carousel can be created.

**Independent Test**: Upload 1, 3, and 7 screenshots. Verify each is accepted, previewed, and stored for generation.

**Acceptance Scenarios**:

1. **Given** a user on a Pro+ plan in carousel mode, **When** they select testimonial carousel mode, **Then** a multi-file upload area labeled "Testimonial Screenshots" appears.
2. **Given** a user uploads 4 testimonial screenshots, **When** uploads complete, **Then** all 4 are previewed with a platform badge on each.
3. **Given** a user has testimonial mode active and switches to single format, **When** the switch occurs, **Then** the system auto-switches back to carousel with a toast: "Testimonials require carousel — switched automatically."
4. **Given** a user tries to generate with zero screenshots uploaded, **When** they click generate, **Then** generation is blocked with: "Upload at least one testimonial screenshot."

---

### User Story 2 - Platform Detection (Priority: P2)

As a user, the system automatically detects which messaging platform each screenshot came from and shows a platform badge. Supported platforms: WhatsApp, Instagram DM, Facebook, Email, Google Review, Telegram. Unrecognized screenshots fall back to "Unknown."

**Why this priority**: Correct detection determines whether the mockup frame matches the source platform.

**Independent Test**: Upload one screenshot from each of the 7 platform types. Verify correct detection for each.

**Acceptance Scenarios**:

1. **Given** a WhatsApp chat screenshot, **When** detected, **Then** the badge shows "WhatsApp."
2. **Given** an unrecognized screenshot, **When** detected, **Then** the badge shows "Other."
3. **Given** detection completes after generation, **When** the user views the generated slides, **Then** each testimonial slide shows the detected platform in its mockup frame. During upload, a generic "Testimonial" badge is shown.

---

### User Story 3 - Platform Mockup Rendering (Priority: P3)

As a user, each testimonial slide renders the screenshot inside a platform-accurate UI frame — not a raw pasted image.

**Why this priority**: Professional mockup frames are the core visual differentiator.

**Independent Test**: Generate slides for each of the 7 platform types. Verify correct UI elements per platform.

**Acceptance Scenarios**:

1. **Given** a WhatsApp screenshot, **When** rendered, **Then** it appears inside a chat bubble with green header and timestamp.
2. **Given** an Instagram DM screenshot, **When** rendered, **Then** it appears inside the IG interface with visible username.
3. **Given** a Facebook screenshot, **When** rendered, **Then** it appears inside a blue-header comment card.
4. **Given** an email screenshot, **When** rendered, **Then** it appears inside an inbox card view.
5. **Given** a Google Review screenshot, **When** rendered, **Then** it appears inside a star rating card.
6. **Given** a Telegram screenshot, **When** rendered, **Then** it appears inside Telegram-style blue chrome.
7. **Given** an unknown screenshot, **When** rendered, **Then** it appears inside a clean quote card with avatar placeholder.

---

### User Story 4 - Hook Slide (Cold Campaign) (Priority: P4)

As a user creating a cold testimonial carousel, slide 1 is an AI-generated hook that creates curiosity to swipe. It references testimonials indirectly without showing any testimonial content. It has a CTA button.

**Why this priority**: The hook determines swipe rate. Showing testimonials on slide 1 kills curiosity.

**Independent Test**: Generate 3 cold testimonial carousels. Verify slide 1 creates curiosity, shows no testimonial content, and has CTA.

**Acceptance Scenarios**:

1. **Given** a cold testimonial carousel, **When** slide 1 is generated, **Then** the headline creates curiosity to swipe.
2. **Given** slide 1, **When** inspected, **Then** zero testimonial text or screenshot content is visible.
3. **Given** slide 1, **When** inspected, **Then** a CTA button is present.

---

### User Story 5 - Hook Slide (Retargeting Campaign) (Priority: P5)

As a user creating a retargeting testimonial carousel, slide 1 names the selected objection AND teases testimonials as evidence. It has a CTA button.

**Why this priority**: Retargeting hooks must address the viewer's specific objection to convert.

**Independent Test**: Generate retargeting testimonial carousels for 3 different objections. Verify each slide 1 names the objection.

**Acceptance Scenarios**:

1. **Given** a retargeting carousel with objection "price_too_high", **When** slide 1 is generated, **Then** the headline names the price objection AND teases testimonial proof.
2. **Given** slide 1, **When** inspected, **Then** a CTA button is present.

---

### User Story 6 - Slide Count Auto-Adjustment (Priority: P6)

As a user, the carousel slide count auto-adjusts to: testimonial count + 1 (hook) + 1 (close), capped at the plan's maximum slide count.

**Why this priority**: Manual slide count management leads to empty or mismatched slides.

**Independent Test**: Upload 1, 3, 5, and 8 testimonials. Verify slide count adjusts to 3, 5, 7, and plan-capped value.

**Acceptance Scenarios**:

1. **Given** 3 testimonials uploaded, **When** slide count resolves, **Then** carousel is 5 slides with notification.
2. **Given** 8 testimonials on a Pro plan (max 5 slides), **When** slide count resolves, **Then** capped at 5 — only 3 testimonials used.
3. **Given** 1 testimonial uploaded, **When** slide count resolves, **Then** carousel is 3 slides (hook + testimonial + close).

---

### User Story 7 - Close Slide (Priority: P7)

As a user, the last slide is a CTA close. For cold, it may reference a key testimonial stat. For retargeting, it is an objection-resolution close — not generic.

**Why this priority**: A weak close wastes testimonial buildup.

**Acceptance Scenarios**:

1. **Given** a cold testimonial carousel, **When** the last slide is generated, **Then** it has a CTA button.
2. **Given** a retargeting carousel with objection "dont_trust", **When** the last slide is generated, **Then** the close is connected to trust resolution.
3. **Given** any testimonial carousel, **When** inspected, **Then** CTA appears only on slide 1 and the last slide.

---

### User Story 8 - QA Fixture Replacement (Priority: P8)

As a QA reviewer, the Lane 10 and Lane 11 stub fixtures in `contractFixtures.test.ts` are replaced with fully functional fixtures that validate testimonial carousel behavior.

**Why this priority**: Stubs provide no validation. Real fixtures prove the feature works.

**Acceptance Scenarios**:

1. **Given** the Lane 10 fixture (Cold testimonial, 3 screenshots), **When** executed, **Then** `resolveTestimonialSlideCount(3)` returns 5 and fixture passes.
2. **Given** the Lane 11 fixture (Retargeting testimonial, objection "price_too_high", 2 screenshots), **When** executed, **Then** slide 1 angle is "objection_hook" and fixture passes.

---

### Edge Cases

- What happens when a user uploads 0 testimonials and tries to generate? Blocked with "Upload at least one testimonial screenshot."
- What happens when a user uploads more testimonials than the plan allows slides for? The system uses as many as fit (max slides - 2 for hook + close) and shows a notification.
- What happens when platform detection is ambiguous? Falls back to "Unknown/Other" with a clean quote card.
- What happens when a user switches from testimonial carousel to regular carousel? Testimonial screenshots preserved in state but not used. Regular slide plan takes over.
- What happens when a retargeting testimonial carousel has no objection-relevant testimonials? All testimonials shown as-is. Framing connects them to the objection at the headline level.
- What happens when a testimonial screenshot is very low resolution? Accepted and rendered at best available quality. No rejection for resolution.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST add `testimonial_carousel` as a creative mode in the resolver, available for both cold and retargeting campaigns in carousel format only.
- **FR-002**: The system MUST provide a multi-file upload area for testimonial screenshots when testimonial carousel mode is active (Pro+ plan, carousel format).
- **FR-003**: The system MUST detect the messaging platform of each uploaded screenshot during generation (server-side, batch), assigning one of 7 types: WhatsApp, Instagram DM, Facebook, Email, Google Review, Telegram, or Unknown/Other. During upload, screenshots show a generic "Testimonial" badge — platform badges appear after generation completes.
- **FR-004**: The system MUST render each testimonial screenshot inside a platform-accurate mockup frame on its carousel slide, following the 7 platform mockup rules from LAUNCH_MATRIX Lane 10.
- **FR-005**: The system MUST generate an AI hook for slide 1. For cold: creates curiosity, references testimonials indirectly, shows no testimonial content. For retargeting: names the objection AND teases testimonials as evidence.
- **FR-006**: The system MUST auto-adjust slide count to: testimonial count + 2 (hook + close), capped at plan max. The user MUST be notified when adjusted.
- **FR-007**: The system MUST generate a CTA close slide. For cold: may reference a key testimonial stat. For retargeting: objection-resolution close, not generic.
- **FR-008**: CTA buttons MUST appear only on slide 1 and the last slide — never on middle testimonial slides.
- **FR-009**: The system MUST auto-switch from single to carousel when testimonial mode is active and format is single, with a toast notification.
- **FR-010**: The system MUST block generation if testimonial mode is active but zero screenshots are uploaded.
- **FR-011**: Art direction MUST be consistent across all slides of a testimonial carousel.
- **FR-012**: The Lane 10 and Lane 11 QA fixture stubs MUST be replaced with fully functional fixtures.

### Key Entities

- **Testimonial Screenshot**: Uploaded image with detected platform type, upload order, and base64 data.
- **Platform Type**: One of 7 recognized platforms determining the mockup frame style.
- **Platform Mockup Frame**: Visual template wrapping a screenshot in platform-accurate UI elements.
- **Testimonial Slide Plan**: Slide 1 = hook (no testimonial), middles = one testimonial per slide in mockup, last = CTA close.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can upload testimonial screenshots and generate a testimonial carousel end-to-end in both cold and retargeting modes.
- **SC-002**: Platform detection correctly identifies the source for at least 80% of real-world screenshots across the 7 platform types.
- **SC-003**: Every testimonial slide renders inside a platform-accurate mockup matching the detected platform.
- **SC-004**: Slide count auto-adjusts to testimonial count + 2 (capped at plan max) in 100% of cases with user notification.
- **SC-005**: Zero testimonial content appears on slide 1 for cold campaigns.
- **SC-006**: Retargeting slide 1 names the objection and teases testimonials. Close slide is objection-connected.
- **SC-007**: CTA appears only on slide 1 and last slide — zero on middle testimonial slides.
- **SC-008**: Lane 10 and Lane 11 QA fixtures pass with real assertions (not stubs).

## Assumptions

- Phases 1–3 are complete. The resolver, frontend enforcement, and QA fixture infrastructure are available.
- `testimonial_carousel` is a new creative mode added to `CREATIVE_MODE_CATALOG` in both backend and frontend resolvers.
- Platform detection runs server-side during generation as a batch operation (not per-upload). Upload is instant with a generic badge. Detection uses visual heuristics via AI vision.
- Mockup frames are generated by the AI image model — the prompt instructs the model to render the screenshot inside the platform UI. No static template compositing.
- The testimonial upload area is part of the input form (Step 1), appearing when testimonial mode is selected.
- Each testimonial gets exactly one slide. No multi-testimonial slides.
- The hook slide is generated by the same AI pipeline as other carousel hooks with testimonial-specific framing instructions.
- Art direction applies the same way as other carousel types — consistent across all slides.
- The retargeting variant uses the same 12 canonical objections + custom text.
