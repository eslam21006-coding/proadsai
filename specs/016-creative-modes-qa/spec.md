# Feature Specification: Phase 16 — Creative Modes & Art Direction QA

**Feature Branch**: `016-creative-modes-qa`
**Created**: 2026-04-27
**Status**: Draft
**Input**: User description: "create spec for \"Phase 16 — Creative Modes & Art Direction QA\" inside docs/LAUNCH_MATRIX.md"
**Source Matrix**: `docs/LAUNCH_MATRIX.md` § Phase 16 (lines 1619–1644)

---

## Clarifications

### Session 2026-04-27

- Q: Does Phase 16 require server-side rejection of invalid mode-format combos, or is client-only gating sufficient for launch? → A: Both client gating and server-side rejection — defense-in-depth, same pattern as plan-gating in 09.50-hotfix-plan-alignment.
- Q: How does the post-build-plan validator decide a required mode element is "missing" from the prompt? → A: Reuse the existing `buildPlanSlotMap()` mechanism (which already does case-insensitive substring matching of natural-language slot patterns against the prompt and produces `slotMap.missingZones` / `slotMap.missingOverlaySlots`). For each active mode, if any required slot maps to a missing zone or overlay, the mode flags `mode_composition_missing` and the **human-readable slot label** (e.g. `"stack zone"`, `"hero zone"`) — not the symbolic `requiredElements[i]` ID (e.g. `"visible_item_rows_or_cards"`) — is appended verbatim to the reinforcement directive. The symbolic IDs in `CREATIVE_MODE_CATALOG[mode].validity.requiredElements` are not natural-language strings the prompt would contain, so direct substring matching against them would always report missing — see research.md § R1.
- Q: At what point in the pipeline does FR-008 verification run, and how do adapt-state strings interact with the cultural-compliance scan-and-replace pass? → A: Verify against the post-compliance technical prompt (the prompt the model actually receives). Phase 16 also runs a one-pass audit of the 8 adapt-state composition strings; any containing cultural-compliance trigger words are flagged as a launch blocker for the catalog owners.
- Q: When `mode_composition_missing` reinforcement fires, what does the user see? → A: Silent at the user surface. Warning recorded on the resolution trace only (same convention as HOTFIX-E logo soft-warnings); no badge, toast, or copy in the ad-detail UI; ad ships with the reinforced prompt.

---

## Summary

Phase 16 hardens the creative-mode and art-direction surface so that every approved combination of *(creative mode × ad format × campaign type × art direction)* either renders correctly or is rejected before generation — deterministically, every time. The pieces (10 modes, 10 approved pair layouts, 8 adapt states, mode pairs per tab, blocked combos, carousel slide-count auto-adjustment) already exist individually in the codebase. What is missing is the QA contract that proves they hold together, plus runtime self-correction when the model silently drops a mode's required composition element.

This is a **launch-blocking quality phase**. The user-facing outcome is: "the ad I configured is the ad I get, or I am told why I cannot configure it that way — never a credit-burning surprise."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Approved combinations render the ad the user configured (Priority: P1)

A user picks a creative mode (or an approved pair, e.g. *Standard Hero + Value Stack*), an ad format (single, carousel, or batch), and a campaign type (cold or retargeting), then generates. The returned image contains the compositional zones of every active mode — the hero zone, the stack zone, the speaker card, the ticket, the device mockup, etc. — without silent omission. If the underlying generation drops a required element, the system detects it before the image is rendered and reinforces the prompt to put it back.

**Why this priority**: This is the core promise of the product's mode catalog. If picking *Speaker Card + Webinar Screen* sometimes returns a generic hero shot with no speaker and no screen, the catalog is decorative, not functional. Every other phase assumes mode fidelity is reliable.

**Independent Test**: A QA fixture suite runs deterministic input JSON for each of the 10 solo modes (single format), each of the 10 approved mode pairs, and the carousel / batch / retargeting variants of each mode. For every fixture, the suite asserts that the build plan prompt contains the documented composition language for each active mode and that the layout contract has the matching zones. Any generation whose prompt is missing a required element triggers a logged self-correction; the fixture asserts that the reinforcement directive is present and the warning is recorded on the resolution trace.

**Acceptance Scenarios**:

1. **Given** a Mini-Course tab with `standard_hero + value_stack` selected for a single-format cold ad, **when** the build plan is produced, **then** the prompt contains both the hero composition language and the stack-zone composition language, and the layout contract exposes a `heroZone` and a `stackZone`.
2. **Given** a Live-Events tab with `event_ticket + webinar_screen` selected, **when** the build plan is produced, **then** both composition layers appear and neither is silently merged.
3. **Given** any approved mode + carousel + retargeting combination, **when** the build plan is produced, **then** every slide's prompt includes the mode's required composition language *and* an objection-answering directive aligned with that slide's position.
4. **Given** a build plan in which the model omits a required mode element (e.g. value-stack rendering with no stack zone language), **when** the post-plan validator runs, **then** a `mode_composition_missing` warning is recorded on the resolution trace and a reinforcement line ("CRITICAL: this ad MUST include …") is appended to the image prompt before render.

---

### User Story 2 — Blocked combinations are refused before any credit is spent (Priority: P1)

A user attempts a combination that the launch matrix declares incompatible: *before_after* paired with any other mode, *before_after* in carousel or batch format, or *text_only* in any pair. The interface tells them inline — directly under the mode card — exactly why the combination is rejected, and the *Generate* button is disabled. No image is produced, no credit is charged, and the server never receives an invalid request.

**Why this priority**: Launching with a permissive client and a server that silently produces something is the worst failure mode — the user pays, gets garbage, and blames the model. This story makes invalid configurations visibly invalid at the point of selection.

**Independent Test**: For every documented blocked combination (4 categories: `before_after + any`, `before_after + carousel`, `before_after + batch`, `text_only + any`), a UI fixture asserts that selecting the offending pair shows an inline message containing the documented reason string, the *Generate* button enters a disabled state, and a server-side validator returns `{ valid: false, reason: <string> }` for the same input. A backend fixture asserts the same combinations are rejected at the resolver layer even if the client is bypassed.

**Acceptance Scenarios**:

1. **Given** the user has selected `before_after`, **when** they then choose carousel format, **then** an inline message appears below the format selector explaining "Before/After is single-image only," the *Generate* button is disabled, and no API call is issued.
2. **Given** the user attempts to add `text_only` to any active mode, **when** the second mode is selected, **then** an inline message appears explaining "Text-only mode is mutually exclusive — it defines the entire canvas," and the conflicting selection is blocked.
3. **Given** a malformed request that bypasses the client (e.g. via a saved-project replay), **when** the server-side validator runs, **then** the request is rejected with the documented reason and no generation begins.

---

### User Story 3 — Art Direction adapt states deliver their declared composition override (Priority: P2)

A user picks an art-direction sub-style (e.g. *Luxury Magazine*, *Cinematic*, *Editorial*) on top of a creative mode, expecting that combination to produce the documented compositional treatment for that pair (e.g. *Luxury Magazine + Value Stack* should render a magazine-cover sidebar with gold-accent prices — not a generic stack). The 8 explicit adapt-state combinations defined in Section 11 of the launch matrix all behave as documented.

**Why this priority**: The art-direction surface is the user's primary visual lever once mode is locked. Adapt states are the contract between "I picked a card" and "the picture changed in the way the card promised." Without this guarantee, art-direction cards become cosmetic noise.

**Independent Test**: A fixture per declared adapt-state pair asserts the build plan prompt contains the specific composition override documented for that pair. The fixture also asserts that the precedence chain (Reference Ad > Family > Art Direction > Universe > Mode Layout) is honored — the mode layout is preserved even when art direction overrides the aesthetic.

**Acceptance Scenarios**:

1. **Given** `luxury_magazine` art direction with `value_stack` mode, **when** the build plan is produced, **then** the prompt contains the documented "magazine cover sidebar" and "gold accent prices" directives, the layout contract still exposes the stack zone, and the precedence trace logs `resolvedSubStyle: "luxury_magazine"`.
2. **Given** the *Minimal* family is active, **when** any art-direction card is requested, **then** the resolver clears art direction (no cards available for minimal) and logs `artDirectionCleared: true, reason: "family_minimal"`.
3. **Given** a *Reference Ad* upload is present, **when** an art-direction card is also selected, **then** the reference wins, art direction is suppressed, and the mode layout (zones, CTA rules, slide structure) is preserved.

---

### Edge Cases

- **Carousel slide-count auto-adjustment.** When *value_stack* is active in carousel mode and the user changes gift count, slide count must auto-adjust to *gift count + 2* (one hook slide, one close slide). When *testimonial_carousel* is active, slide count must auto-adjust to *testimonial count + 2*. The user must see an inline notification explaining the adjustment, and they must not be able to override it into an invalid count.
- **Pair render execution returns empty.** If the pair-resolution function returns empty composition guidance for any of the 10 approved pairs (i.e. a regression introduced a missing case), the launch gate fails and the build plan must not proceed.
- **Mode required element drift.** The model occasionally drops a required composition element. The system must detect this *before* render, log a warning, and reinforce the prompt rather than silently shipping a degraded ad.
- **Batch independence.** Each batch item must independently render the active mode's composition. A batch of 4 *speaker_card* ads must produce 4 ads each with a speaker composition — not 1 speaker ad and 3 generic heroes.
- **Retargeting + sequential objections.** Carousel retargeting must address objections sequentially (slide 1 = objection 1, slide 2 = objection 2, …) while preserving the active mode's composition on every slide.
- **Empty / unknown art direction card.** If an art-direction card is selected that is not part of the family's card set (e.g. due to stale state on family switch), it must be cleared, not silently passed through.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For each of the 10 launched creative modes, the system MUST be able to demonstrate (via a deterministic fixture run) that solo + single-format generation produces a build plan prompt containing the mode's documented required composition language and a layout contract with the mode's documented zones.
- **FR-002**: For each of the **10 approved mode pairs** declared in launch matrix § 2.3 (Mini-Course: 1 pair; Live Events: 6 pairs; Free Guide: 3 pairs), the system MUST resolve the pair to a non-empty render-execution composition guidance string and produce a layout contract containing zones for both modes. Universal blocking rules (`before_after` solo-only, `text_only` mutex) are categorically separate and are covered by FR-003.
- **FR-003**: The system MUST reject every documented blocked combination (`before_after + any other mode`, `before_after + carousel`, `before_after + batch`, `text_only + any other mode`) at both the client (inline UI message + disabled *Generate*) and the server (resolver returns `{ allowed: false, reason: <string> }`). At least four blocked-combination fixtures MUST be exercised.
- **FR-004**: For carousel format, the system MUST auto-adjust slide count when *value_stack* is active (slide count = gift count + 2) and when *testimonial_carousel* is active (slide count = testimonial count + 2), and MUST surface an inline notification to the user explaining the adjustment.
- **FR-005**: For each of the carousel-specific mode behaviors (*value_stack*, *testimonial_carousel*, *webinar_screen*, *standard_hero*), the system MUST produce per-slide build plan content consistent with the documented per-slide rules (slide 1 hero/hook, middle slides composition, last slide CTA close).
- **FR-006**: For each of the batch-compatible modes (*standard_hero*, *speaker_card*, *value_stack*, and any other single-compatible mode used in batch), every batch item's build plan prompt MUST contain the active mode's required composition language. Each item MUST have an independent hook but the same layout.
- **FR-007**: For each retargeting variant of each compatible mode, the build plan prompt MUST contain objection-answering language *and* the mode's composition language. Carousel retargeting MUST address sequential objections.
- **FR-008**: For each of the 8 explicit art-direction adapt states declared in § 11 of the launch matrix, the **post-compliance** technical prompt (the prompt the model actually receives, i.e. after `culturalCompliance.scanAndReplace()` has run) MUST contain the documented composition override for that pair, and the precedence chain (Reference > Family > Art Direction > Universe > Mode Layout) MUST be honored. Phase 16 MUST also include a one-pass audit of the 8 adapt-state composition strings; any string containing a cultural-compliance trigger word is flagged as a launch blocker on the resolution trace and reported to the catalog owners (rewriting the catalog is out of scope for Phase 16).
- **FR-009**: After the build plan is produced and before the image is rendered, the system MUST scan the technical prompt for the active mode's required composition slots using the existing `buildPlanSlotMap()` mechanism (which performs case-insensitive substring matching of natural-language slot patterns against the prompt and produces `slotMap.missingZones` and `slotMap.missingOverlaySlots`). For each active mode, if any of its required slots is reported missing, the mode flags as `mode_composition_missing`. The system MUST then (a) record a `mode_composition_missing` warning on the resolution trace including the active mode and the **human-readable slot label(s)** that were missing (e.g. `"stack zone"`, `"hero zone"` — NOT the symbolic `requiredElements[i]` IDs which never appear in the prompt verbatim) and (b) append a reinforcement directive ("CRITICAL: This ad MUST include [human-readable slot label verbatim]. Do not omit it.") to the image prompt. The reinforcement and warning MUST be **silent at the user surface** — no badge, toast, or copy in the ad-detail UI; the ad ships with the reinforced prompt and the warning is visible only on the resolution trace. The silent-at-user-surface choice is a justified deviation from constitution Principle VII, documented in `plan.md` Complexity Tracking.
- **FR-010**: The system MUST expose a single deterministic mode-format-campaign validation function that, given the current modes and chosen ad format and campaign type, returns `{ valid: true }` or `{ valid: false, reason: <string> }`. This function MUST be the single source of truth used by both the client (to gate the *Generate* button) and the server (to reject malformed requests).
- **FR-011**: When a mode-format-campaign combination is invalid, the user-facing surface MUST display the `reason` string inline at the point of selection (not at submit time) and MUST disable the *Generate* button until the user changes their selection.
- **FR-012**: The fixture suite covering FR-001 through FR-008 MUST be runnable as part of the standard backend test command (i.e. it MUST be integrated into the existing contract-fixtures test harness). Pass/fail of this suite is a launch gate.

### Key Entities

- **Creative Mode**: One of the 10 launched modes (`standard_hero`, `value_stack`, `before_after`, `text_only`, `event_ticket`, `webinar_screen`, `speaker_card`, `book_mockup`, `device_mockup`, `testimonial_carousel`). Each has documented required composition language, layout zones, and compatibility rules.
- **Mode Pair**: An approved 2-mode combination per tab (10 in total) with a layout key and documented composition for both modes simultaneously.
- **Blocked Combination**: A declared incompatible mode/format pairing that must be rejected before generation. At minimum: `before_after + any`, `before_after + carousel`, `before_after + batch`, `text_only + any`.
- **Art Direction Adapt State**: One of the 8 explicit *(art-direction × creative-mode)* combinations from § 11 of the launch matrix, each with a documented composition override (e.g. *luxury_magazine + value_stack* → magazine cover sidebar + gold accent prices).
- **Mode-Format-Campaign Validation**: The single function that returns `{ valid, reason? }` for an `(modes[], adFormat, campaignType)` tuple. Used by both client UI gating and server request rejection.
- **Resolution Trace Warning**: A `mode_composition_missing` entry recorded when a required mode element is detected as missing post-plan and a reinforcement directive is injected.
- **QA Fixture**: One deterministic input-JSON-plus-assertions test entry. Phase 16 introduces **43 new fixtures**: 10 solo modes + 10 approved pairs + 4 carousel-specific + 3 batch-specific + 2 retargeting-specific + 1 self-correction (drift) + 4 blocked combinations + 8 adapt states + 1 adapt-state audit pass.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the 10 launched creative modes pass their solo single-format fixture (mode-required composition language present, mode-required zones present in layout contract).
- **SC-002**: 100% of the 10 approved mode pairs pass their fixture (both modes' composition languages present, both zones present, non-empty render-execution guidance).
- **SC-003**: 100% of the declared blocked combinations are rejected before any generation request reaches image rendering. The user sees the documented inline reason at the point of selection. Wasted credits on blocked-combination attempts go to zero.
- **SC-004**: 100% of the 8 declared art-direction adapt states deliver the documented composition override in the **post-compliance** technical prompt on a fixture run, with the precedence chain logged correctly on every generation. The launch gate fails if any of the 8 adapt-state composition strings contains a cultural-compliance trigger word.
- **SC-005**: When a required mode composition element is missing from the build plan, the runtime self-correction path catches it and reinforces the prompt in 100% of detected cases. Resolution-trace warnings are recorded on every detection so drift can be tracked.
- **SC-006**: Carousel slide-count auto-adjustment fires correctly for value_stack and testimonial_carousel; the user never has to manually correct slide count for either feature, and they always see an inline notification when an adjustment occurs.
- **SC-007**: The mode-format-campaign validation function is the single source of truth — the same function is invoked by the client *Generate* gate and the server request validator. Divergence between client-allowed and server-rejected cases is zero.
- **SC-008**: The Phase 16 fixture suite runs as part of the standard backend test command and a regression that breaks any approved combination or admits any blocked combination is detected automatically (i.e. the launch gate is enforceable in CI rather than only by manual review).

## Assumptions

- The 10 launched creative modes are the post-launch-cleanup set declared in § 2.2 of the launch matrix. The deleted modes (`limited_access`, `module_preview`, `day_strip`) are out of scope and are not exercised by any fixture.
- The 10 approved mode pairs are exactly those enumerated in § 2.3 (1 pair for Mini-Course, 6 for Live Events, 3 for Free Guide). The universal blocking rules (`before_after` solo-only, `text_only` mutex) are categorically separate and are covered by FR-003. New pair additions require their own fixture before they are considered launchable.
- The 8 art-direction adapt states are exactly those enumerated in § 11 of the launch matrix. Pairs not enumerated there fall through to default precedence behavior and are not separately covered in this phase.
- "Required composition language" for each mode is sourced from `CREATIVE_MODE_CATALOG[mode].validity.requiredElements` (existing in `creativeResolver.ts`). Phase 16 does not redefine these elements — it asserts they appear in the build plan prompt.
- Runtime self-correction (FR-009) reinforces the prompt once per missing element. No second-chance regeneration is added in this phase; the reinforcement is the corrective step, and the warning records the drift for downstream tracking.
- The mode-format-campaign validation function (FR-010) is shared between client and server via a single source file (existing convention: validators in `creativeResolver.ts` are imported by both layers).
- "Inline message" means a message rendered directly under the offending control (mode card, format selector) within the same step of the form — not a modal, toast, or page-level banner.
- This phase introduces no new user-facing creative modes, no new art-direction cards, and no new aspect ratios. It is purely a coverage and self-correction phase over the existing launched surface.

## Dependencies

- **Phase 1** (Frontend launch-surface filtering) complete — the dropdown / mode-grid surface presents only launched modes and combinations.
- **Phase 3** (Resolver + QA fixtures harness) complete — the fixture infrastructure used in 16.1–16.7 already exists and accepts new entries.
- **Phase 5** (Render Prompt Pipeline) complete — `generateBuildPlan()`, `buildFinalImagePrompt()`, and the resolution-trace logging surface are stable enough to add the post-plan validator in 16.9.

## Out of Scope

- Adding new creative modes, mode pairs, or art-direction cards.
- Changing the precedence chain in § 4 of the launch matrix.
- Introducing reflow / aspect-ratio behavior (covered in Phase 17).
- Multi-hero support inside any mode (covered in Phase 18).
- Direct-response design upgrades like gaze direction, highlight cardinality, price hierarchy (covered in Phase 19).
- Concept Director / brief coherence (covered in Phase 20).
