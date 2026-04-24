# Feature Specification: HOTFIX-D — Multi-Logo Upload (Box B → Max 5)

**Feature Branch**: `953-hotfix-multi-logo`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "create a spec for \"HOTFIX-D — Multi-Logo Upload (Box B → Max 5)\" that's mentioned in \"docs/LAUNCH_MATRIX.md\""

## Overview

The brand-assets input ("Box B") accepts only one logo at a time even though the underlying data model already supports up to five. This hotfix lifts the cap to five across every surface that touches a logo — the upload UI, the input-sanitization layer, the hook/concept/render/caption generation entry points, and the rendering instructions — so a single ad design can legitimately show multiple brand marks (e.g. a company logo plus a certification badge plus a partner logo). This must also propagate through carousel and batch flows so every slide and every variant receives the full set.

## Clarifications

### Session 2026-04-24

- Q: When user drops more logos than the remaining capacity (N existing + M new > 5), what is the exact behavior? → A: Accept the first (5 − N) files from the drop in drop order; reject the remainder with a user-visible message (e.g. "Only 5 logos allowed — X extra file(s) ignored."). Previously-uploaded logos are preserved.
- Q: At what level should primary/secondary hierarchy between uploaded logos be enforced? → A: No hierarchy. All uploaded logos are treated as equal peers. The render instructions MUST direct the model to give every uploaded logo similar visual weight (comparable size, balanced placement). No "primary" logo concept exists. Upload order has no prominence meaning.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload multiple brand logos for one ad (Priority: P1)

An advertiser is producing a single ad that must feature their company logo, an industry certification badge, and a partner-brand logo together. Today the upload area silently discards everything after the first file, so the ad ships missing two of the three brand marks. The user expects to upload all three logos, see all three previewed in the form, and see all three rendered in the final design as equal peer brand marks at comparable visual weight.

**Why this priority**: This is the reason the hotfix exists. Campaigns that require co-branding, certification signals, or agency/partner credit are blocked entirely by the one-logo cap. No advertiser will ship an ad that is legally or contractually missing a required mark, so the workflow simply stops here without this fix.

**Independent Test**: Upload three logos into Box B, run a single-image generation, and confirm that (a) the form previews all three before submission, (b) the "Max 5" label replaces the current "Max 1" label, and (c) the rendered ad contains visible representation of all three logos. Delivers the headline business value on its own.

**Acceptance Scenarios**:

1. **Given** the user is on the input form with an empty Box B, **When** they upload three logo files in one go, **Then** all three appear as preview thumbnails in Box B and none are silently dropped.
2. **Given** Box B already holds two logos, **When** the user drags in three more, **Then** all five are accepted and the upload zone indicates the user has reached the maximum of five.
3. **Given** Box B holds five logos, **When** the user attempts to upload a sixth, **Then** the sixth is rejected with a visible message naming the count ignored and the existing five are preserved.
4. **Given** Box B holds three logos, **When** the user drops four more in a single action, **Then** the first two (in drop order) are accepted (total = five) and the remaining two are rejected with a visible message; the original three are preserved.
5. **Given** Box B holds three logos, **When** the user generates a single ad, **Then** the final rendered image contains distinct visual representation of each of the three logos.
6. **Given** the user has uploaded logos and then refreshes or reloads a saved project containing multiple logos, **When** the form re-hydrates, **Then** all previously uploaded logos are restored (not truncated to one).

---

### User Story 2 - Multi-logo support in carousel and batch (Priority: P2)

A user running a carousel campaign or a batch variant set expects every slide and every variant to carry the same brand marks as the parent concept. Today, even if the first slide shows a logo, later slides and batch variants can be generated without all of the uploaded logos passed through, producing an inconsistent set where branding disappears mid-way through a carousel.

**Why this priority**: Carousel and batch are premium plan features and are a primary reason Pro/Scale customers pay for the product. Inconsistent branding across slides breaks the core promise of those flows. It ranks P2 only because single-ad (Story 1) is the most common generation path and the one new users hit first.

**Independent Test**: Upload two logos, generate a 5-slide carousel and a 4-item batch, and confirm every slide and every batch item receives both logos in its generation input — verifiable from the generation record and from visual inspection of the outputs.

**Acceptance Scenarios**:

1. **Given** the user has uploaded three logos, **When** a carousel of five slides is generated, **Then** every slide's generation input includes all three logos and every rendered slide shows them.
2. **Given** the user has uploaded two logos, **When** a batch of four variants is generated, **Then** every variant's generation input includes both logos and every rendered variant shows them.
3. **Given** the user has uploaded five logos on a carousel run, **When** the user views any slide's saved generation record, **Then** the record reflects the full five-logo set and is not truncated to one.

---

### User Story 3 - Equal-peer logo rendering (Priority: P3)

When more than one logo is uploaded, the user expects all uploaded logos to be treated as equal-weight brand marks in the final design — comparable size, balanced placement — rather than one being singled out as dominant. Co-branding, certification-plus-brand, and partner-plus-agency lockups are all cases where no single mark should visually outrank the others.

**Why this priority**: Without the equal-peer rule, the model could arbitrarily pick one logo to enlarge and shrink the rest, which would contradict co-branding intent. It is ranked P3 because the technical unblock (Stories 1 & 2) is the critical deliverable; equal-peer treatment is a quality rule layered on top and does not gate release.

**Independent Test**: Upload three logos, render a single ad, and confirm that no single logo is disproportionately larger than the others — the three marks read as peers, not as one-big-plus-two-small.

**Acceptance Scenarios**:

1. **Given** the user has uploaded three logos in any order, **When** the ad is rendered, **Then** the three logos appear at comparable size with balanced placement; no one logo is visibly dominant over the others.
2. **Given** the user has uploaded a single logo, **When** the ad is rendered, **Then** that logo is rendered with the same prominence it has had historically — this hotfix introduces no visual regression for the existing one-logo case.
3. **Given** the user has uploaded zero logos, **When** the ad is rendered, **Then** the image contains no invented brand marks or placeholder branding — the zero-logo behavior is preserved.
4. **Given** the user has uploaded two logos in order A then B, **When** the ad is rendered, **Then** rendering upload order A,B versus upload order B,A produces outputs of comparable quality — upload order MUST NOT assign one logo greater prominence.

---

### Edge Cases

- A user uploads six or more logos in a single drop into an empty Box B — the first five (in drop order) are accepted, the remainder are rejected with a visible message naming the count ignored; no files are silently dropped.
- A user already has three logos and drops four more — the first two of the four are accepted (reaching the cap of five), the remaining two are rejected with a visible message; the existing three logos are preserved untouched.
- A user uploads a file that is not a valid image — rejection is handled exactly as it is today for single-logo uploads; the multi-logo change does not weaken file validation.
- A saved project was created under the old one-logo cap — on reload it still loads correctly with its single logo and can be extended up to five.
- A carousel or batch is generated with zero logos uploaded — the existing "no branding marks in the image" behavior is preserved.
- A user removes one logo from a five-logo set — the remaining four are kept in order, the removed slot is closed, and the upload zone again accepts one more.
- A logo upload fails mid-batch (network drop) — partially uploaded logos are either all accepted or the failed entry is clearly marked so the user can retry; no silent truncation to one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The brand-assets input area MUST accept between zero and five logo images in a single advertising project.
- **FR-002**: The upload zone MUST display a visible capacity indicator that reads "Max 5" (not "Max 1") so the user knows the real limit before trying to upload.
- **FR-003**: The upload zone MUST show a preview thumbnail for every accepted logo, up to five, and MUST allow the user to remove any individual logo without losing the others.
- **FR-004**: When a user submits a batch of uploads that would push the total above five, the system MUST accept the first (5 − current) files in drop order, reject the remainder, and surface a user-visible message naming the count of rejected files (e.g. "Only 5 logos allowed — 2 extra file(s) ignored."). Previously-uploaded logos MUST be preserved; the system MUST NOT silently drop files and MUST NOT reject the entire drop when a partial subset can be accepted.
- **FR-005**: The input-sanitization layer that prepares user inputs before generation MUST preserve up to five logos and MUST NOT truncate the logo array to one on any code path.
- **FR-006**: The hook-generation entry point MUST receive all uploaded logos (up to five).
- **FR-007**: The concept/blueprint-generation entry point MUST receive all uploaded logos (up to five).
- **FR-008**: The image/render-generation entry point MUST receive all uploaded logos (up to five).
- **FR-009**: The caption-generation entry point (and any other generation entry point that consumes brand assets) MUST receive all uploaded logos (up to five).
- **FR-010**: The render instructions given to the image-generation model MUST direct it to render every uploaded logo as a distinct physical brand element in the scene, with all logos treated as equal peers — comparable visual size, balanced placement, no single logo made dominant. The render instructions MUST NOT designate any logo as "primary" or instruct the model to enlarge the first-uploaded logo relative to the others. Upload order is a storage ordering only and MUST NOT map to visual prominence.
- **FR-011**: The render instructions MUST retain the existing rule that, when zero logos are uploaded, the rendered image contains no invented brand marks or placeholder branding.
- **FR-012**: The existing rule that the model must render only logos the user has uploaded (and never invent a new one) MUST remain in force under the multi-logo rule.
- **FR-013**: Every slide in a carousel generation MUST receive the full logo set (up to five), not just the first logo.
- **FR-014**: Every item in a batch generation MUST receive the full logo set (up to five), not just the first logo.
- **FR-015**: Generation records persisted for later retrieval MUST store the full logo set used for that generation, so that reload and re-render operations do not silently lose logos.
- **FR-016**: Projects saved under the previous one-logo cap MUST continue to load and render correctly after this change — the hotfix MUST be backward-compatible with existing saved data.
- **FR-017**: The multi-logo change MUST NOT alter the visual result for the single-logo case — a one-logo ad generated after the hotfix must look substantially the same as before.

### Key Entities

- **Brand Logo Set**: The unordered (for rendering purposes) collection of 0–5 image files a user has attached to a project's brand-assets slot ("Box B"). Storage/display order is preserved as a stable list so UI interactions (preview, remove, reload) are deterministic, but this order carries no semantic meaning about visual prominence — all logos are equal peers at render time. Each element is a single image uploaded by the user.
- **Generation Record**: The persisted record of a single ad generation (single, carousel slide, or batch item). Includes the full Brand Logo Set used, so reload/re-render can restore the full set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can upload five logos into the brand-assets input area and all five are accepted, previewed, and included in the final rendered ad — measured by a manual end-to-end test and a fixture test.
- **SC-002**: The upload capacity indicator in the brand-assets input area reads "Max 5" at the time of release; zero production surfaces still show "Max 1".
- **SC-003**: Across every generation entry point (hooks, concepts, render, caption) and every generation mode (single ad, carousel, batch), the count of logos that reach the generation step is equal to the count the user uploaded — never 1, never 0 (unless the user actually uploaded 0).
- **SC-004**: User-reported incidents of the form "I uploaded multiple logos and only one appeared" drop to zero within 14 days of release; pre-release baseline is to be captured from support/feedback channels.
- **SC-005**: For ads generated with 2+ logos, at least 90% of rendered outputs visibly contain every uploaded logo — validated via a manual review sample (N=20) on release day.
- **SC-006**: Zero regressions in the one-logo case: a visual-diff review of 10 one-logo ads generated pre- and post-hotfix shows no meaningful change in how the single logo is rendered.
- **SC-007**: Backward compatibility: 100% of projects saved before this hotfix continue to load and generate successfully after the hotfix, measured against a sample of ≥10 pre-hotfix saved projects.
- **SC-008**: Equal-peer rendering: on a manual review sample (N=20) of 2+-logo ads, at least 80% of outputs show the uploaded logos at comparable visual size with no single logo dominant over the others. No render instruction refers to a "primary" logo or privileges upload order for prominence.

## Assumptions

- The underlying data model already defines brand logos as an array (up to five); this hotfix enforces that capacity end-to-end and does not require a schema migration.
- File-type and file-size validation for individual logo images remains unchanged — this hotfix only changes the accepted count, not the accepted format.
- The image-generation model is capable of rendering multiple distinct brand marks in a single scene when explicitly instructed to do so; quality of placement is a follow-on concern addressed by the separate HOTFIX-E (Deterministic Logo Compositing), which is out of scope here.
- Carousel and batch flows already propagate other inputs (hook text, style, audience, etc.) per-slide/per-item; this hotfix extends the same propagation pattern to the full logo set.
- The hotfix is a behavioral/prompt correction only — no new UI components, no new storage buckets, no new API surfaces. All work happens inside existing upload, sanitization, and generation paths.
- All uploaded logos are treated as equal peers at render time; upload order is preserved only as a stable list for deterministic UI behavior (previews, removal, reload) and does not assign visual prominence.
- "Box B" is the conventional internal name for the brand-assets input area and is already understood by the team; any user-visible label remains the existing localized "Brand Assets" / equivalent.

## Dependencies

- No blocking dependency on other hotfixes (LAUNCH_MATRIX lists HOTFIX-D as "no dependency — apply any time").
- Quality of the multi-logo visual result will improve further once HOTFIX-E (Deterministic Logo Compositing) ships, which will paste the actual logo PNGs on top of the rendered scene instead of relying on the model to reproduce them. HOTFIX-D is a prerequisite for HOTFIX-E to be meaningful — if the generation pipeline still receives only one logo, deterministic compositing would have only one logo to place.

## Out of Scope

- Deterministic pixel-perfect logo placement (handled by HOTFIX-E).
- A "reorder logos" control or a "mark this one as primary" picker — the hotfix does not introduce any notion of a primary logo; all uploaded logos are equal peers.
- Per-logo placement zone controls exposed in the UI.
- Changing the logo file count cap beyond five.
- Non-image brand assets (e.g. brand guideline PDFs, brand fonts) — this hotfix is scoped to image logos only.
- Any behavior change to `personalPhotos` (Box A), which already supports up to five.
