# Feature Specification: Resolver Completeness, Resolution Trace & Slide Plans

**Feature Branch**: `001-resolver-completeness-trace`
**Created**: 2026-03-31
**Status**: Draft
**Input**: User description: "Phase 1 from LAUNCH_MATRIX.md — Spec B: Resolver Completeness + Trace + Slide Plans + Empty Field Filtering"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Launch Surface Validation (Priority: P1)

As a user selecting creative options (offer type, campaign type, ad format, creative mode), the system must validate my combination against the approved launch surface and prevent me from generating ads with invalid or deprecated combinations. If my combination is not approved, I see a clear inline message explaining why, and generation is blocked.

**Why this priority**: Without a validated launch surface, users can select combinations that produce broken, unsupported, or inconsistent ad output. This is the gate that every other feature depends on — all downstream logic assumes only valid combinations pass through.

**Independent Test**: Can be fully tested by attempting every approved combination from the Launch Surface Registry and verifying each is allowed, then attempting every removed/deprecated combination and verifying each is blocked with a reason string.

**Acceptance Scenarios**:

1. **Given** a user selects "Mini-Course" offer type with "standard_hero" creative mode and "single" ad format, **When** the system validates the combination, **Then** generation proceeds normally (approved combination).
2. **Given** a user attempts to use "limited_access" creative mode, **When** the system validates the combination, **Then** generation is blocked and the user sees an inline message explaining this mode is not available.
3. **Given** a user selects "before_after" mode with "carousel" ad format, **When** the system validates the combination, **Then** generation is blocked with the message "Before/After is single-image only."
4. **Given** a user selects "Live Events" tab with "standard_hero" and "event_ticket" as paired modes, **When** the system validates, **Then** the combination is approved with the correct layout key.
5. **Given** a user selects a valid combination on the frontend, **When** the request reaches the server, **Then** the server independently validates the same combination and rejects it if invalid (server-side guard).

---

### User Story 2 - Structured Carousel Slide Plans (Priority: P2)

As a user generating a carousel ad (cold or retargeting), every slide in my carousel follows a predetermined narrative structure based on the campaign type, slide count, and creative mode. The system automatically assigns the correct narrative angle to each slide so that the generated carousel tells a coherent story.

**Why this priority**: Carousel ads with inconsistent or random slide structures waste user credits and produce incoherent output. Predetermined slide plans guarantee every carousel follows a proven narrative arc.

**Independent Test**: Can be tested by generating carousels at every supported slide count (2–9) for both cold and retargeting campaigns, then verifying each slide has the correct assigned narrative angle and CTA placement.

**Acceptance Scenarios**:

1. **Given** a user generates a 5-slide cold carousel, **When** the slide plan is built, **Then** slide 1 has a Hook + CTA, slides 2–4 have distinct angles from the cold pool (A, B, C), and slide 5 has a Close + CTA.
2. **Given** a user generates a 3-slide retargeting carousel with objection "price_too_high", **When** the slide plan is built, **Then** slide 1 names the objection as tension + CTA, slide 2 uses angle P (Proof), and slide 3 has a Close + CTA.
3. **Given** a user generates a 9-slide cold carousel, **When** the slide plan is built, **Then** all 7 cold angles (A through G) are used exactly once across middle slides, with no two adjacent slides sharing the same angle.
4. **Given** any carousel with more than 2 slides, **When** the plan is generated, **Then** CTA appears only on slide 1 and the last slide — never on middle slides.

---

### User Story 3 - Value Stack Carousel Auto-Adjustment (Priority: P3)

As a user creating a carousel with the value_stack creative mode, the slide count is automatically adjusted to match the number of gifts I provided — one gift per slide, plus a hook slide and a close slide. I am notified when the system overrides my selected slide count.

**Why this priority**: Without auto-adjustment, users must manually count gifts and set the slide count correctly, which is error-prone and leads to empty or duplicate slides.

**Independent Test**: Can be tested by providing varying numbers of gifts (3–9+) in value_stack carousel mode and verifying the slide count adjusts to N+2 (capped at 9) with a user-facing notification.

**Acceptance Scenarios**:

1. **Given** a user provides 4 gifts in value_stack carousel mode, **When** the system resolves the slide count, **Then** the carousel is set to 6 slides (4 + 2) and the user sees "Carousel adjusted to 6 slides — one gift per slide."
2. **Given** a user provides 8 gifts, **When** the slide count resolves, **Then** it is capped at 9 slides with the last gift and close merged on the final slide.
3. **Given** a user provides 2 gifts, **When** the slide count resolves, **Then** the carousel is 4 slides.
4. **Given** a user's original slide count selection differs from the auto-adjusted count, **When** the override fires, **Then** the user's selection is replaced and they are notified.

---

### User Story 4 - Empty Value Stack Field Suppression (Priority: P4)

As a user filling out the value_stack form, any field I leave empty is treated as if it does not exist. It is never rendered, never mentioned in the generated ad copy, and never appears in any generated image. I do not see placeholder text, blank rows, or missing value calculations for fields I chose not to fill.

**Why this priority**: Showing empty or placeholder fields in generated ads looks unprofessional and confuses viewers. Users expect the system to gracefully handle partial input.

**Independent Test**: Can be tested by submitting value_stack input with some fields populated and some empty, then verifying the generated output contains only the populated fields and no reference to empty ones.

**Acceptance Scenarios**:

1. **Given** a user fills in gift names and prices but leaves guarantee and proof statement empty, **When** the ad is generated, **Then** the output shows gifts and prices but contains no mention of a guarantee or proof statement.
2. **Given** a user fills in only the stack title and one gift, **When** the ad is generated, **Then** only those two pieces of information appear — no empty rows, no "N/A" labels, no blank spaces where other fields would have been.
3. **Given** a user provides price and original value but not savings, **When** the price contrast is rendered, **Then** the system shows price vs. original value but does not show a savings callout.

---

### User Story 5 - Resolution Trace Audit Trail (Priority: P5)

As a system operator or support team member reviewing a generation run, I can access a complete resolution trace that documents every decision the system made: which campaign type was resolved, which creative modes were applied, whether any overrides fired (reference ad, art direction cleared, slide count adjusted), which empty fields were suppressed, and what the final per-slide structure looks like.

**Why this priority**: Without a resolution trace, debugging failed or unexpected generations requires guessing. The trace provides a complete audit trail that makes every generation reproducible and explainable.

**Independent Test**: Can be tested by generating an ad with known inputs, then retrieving the resolution trace and verifying every field matches the expected values.

**Acceptance Scenarios**:

1. **Given** a generation completes successfully, **When** the resolution trace is retrieved, **Then** it contains: resolved campaign type, creative mode(s), style family, art direction (trace field: `subStyle`), reference ad override status, slide count (original and resolved if different), empty fields skipped, and per-slide structure.
2. **Given** a generation where the reference ad overrode the universe and art direction, **When** the trace is reviewed, **Then** it shows `referenceAdOverrideActive: true` along with the overridden universe and sub-style values.
3. **Given** a carousel generation, **When** the trace is reviewed, **Then** the `perSlide` array shows each slide number, whether it has a CTA, its narrative angle, and whether photos were injected.

---

### User Story 6 - Deleted Modes Removal (Priority: P6)

As a user, I cannot see, select, or generate ads using the "limited_access", "module_preview", or "day_strip" creative modes. These modes do not appear in any dropdown, card grid, or mode selector. They cannot be reached by any user interaction.

**Why this priority**: These modes were product-owner-decided to be removed entirely (not deferred). Leaving them in the system creates confusion and potential for generating unsupported output.

**Independent Test**: Can be tested by searching the entire codebase for references to these three mode names and verifying zero matches in any user-facing or resolver logic.

**Acceptance Scenarios**:

1. **Given** a user browses creative mode options for any offer type, **When** they view the mode selector, **Then** "limited_access", "module_preview", and "day_strip" do not appear.
2. **Given** a user submits a generation request referencing a deleted mode, **When** the server validates, **Then** the request is rejected.
3. **Given** any creative mode pairing rule, **When** the resolver evaluates pairings, **Then** no pairing rule references a deleted mode.

---

### User Story 7 - Minimal Style Family Support (Priority: P7)

As a user selecting the "minimal" visual style family, the system suppresses all environment/scene rendering in my generated ads while keeping the universe dropdown visible in the input form. My ads use clean, solid backdrops with no worldbuilding, no art direction cards, and no environmental context.

**Why this priority**: The minimal family is a new third option alongside realistic and fantasy. Without proper resolver support, it would either render scenes incorrectly or hide UI elements that should stay visible.

**Independent Test**: Can be tested by selecting minimal family, providing various universe values, and verifying that generated output contains no environmental scene while the universe dropdown remains interactive.

**Acceptance Scenarios**:

1. **Given** a user selects "minimal" as the style family, **When** the ad is generated, **Then** no environment or scene is rendered — the backdrop is a solid color or minimal gradient.
2. **Given** a user selects "minimal" with a universe value of "Tokyo", **When** the ad is generated, **Then** the Tokyo setting is NOT applied to the scene (environment suppressed).
3. **Given** a user is on the minimal family, **When** they view the art direction section, **Then** no art direction cards are available.
4. **Given** a user switches from "realistic" to "minimal", **When** the switch occurs, **Then** any previously selected art direction card is cleared.

---

### User Story 8 - Before/After Reclassification and Offer Type Consolidation (Priority: P8)

As a user, I find "before_after" in the creative mode grid (not the hook angle selector), and the offer type dropdown shows exactly 3 options (Live Event, Free Guide, Mini-Course). The system correctly enforces that before_after and text_only are solo-only modes that cannot be paired.

**Why this priority**: before_after was incorrectly classified as a hook angle. Moving it to the creative mode grid and consolidating offer types aligns the resolver with the approved launch surface. Without this, users select combinations that the system cannot validate correctly.

**Independent Test**: Verify before_after does not appear in hook angle options. Verify it appears as a creative mode in all 3 tabs. Verify pairing before_after with any other mode is blocked. Verify offer type dropdown has exactly 3 entries with correct tab mappings.

**Acceptance Scenarios**:

1. **Given** a user opens the hook angle selector for a cold campaign, **When** they view available angles, **Then** "before_after" does not appear — only the 10 approved angles are listed.
2. **Given** a user browses creative modes for "Mini-Course", **When** they view the mode grid, **Then** "before_after" appears as a selectable creative mode.
3. **Given** a user selects "before_after" and then tries to add "standard_hero" as a second mode, **When** the system validates, **Then** the pairing is blocked with "Before/After is single-image only."
4. **Given** a user selects "text_only" and tries to pair it with any mode, **When** the system validates, **Then** the pairing is blocked with "Text Only is a standalone mode."
5. **Given** a user views the offer type dropdown, **When** they see the options, **Then** exactly 3 entries appear: "Live Event", "Free Guide", "Mini-Course".

---

### User Story 9 - Visual Precedence Chain Enforcement (Priority: P9)

As a user who uploads a reference ad while also selecting an art direction and universe, the system correctly resolves visual conflicts by applying the precedence chain: reference ad wins over art direction and universe, while my creative mode layout is always preserved.

**Why this priority**: Without a formal precedence chain, visual inputs conflict silently, producing unpredictable output. The chain makes resolution deterministic and traceable.

**Independent Test**: Generate ads with overlapping visual inputs (reference ad + art direction + universe) and verify the highest-priority input wins in each case, with overrides logged in the resolution trace.

**Acceptance Scenarios**:

1. **Given** a user uploads a reference ad AND selects an art direction card, **When** the ad is generated, **Then** the reference ad's visual style is used and art direction is suppressed. The trace shows `referenceAdOverrideActive: true` and `overriddenSubStyle`.
2. **Given** a user selects art direction "luxury_magazine" AND universe "Dubai", **When** the ad is generated, **Then** the luxury_magazine aesthetic takes visual priority while Dubai informs wardrobe and location.
3. **Given** a user selects "text_only" mode, **When** the resolver runs, **Then** universe, art direction, and style family are all suppressed. The trace shows `textOnlyActive: true`.

---

### Edge Cases

- What happens when a user provides more than 7 gifts in a value_stack carousel? The slide count is capped at 9, with the last gift and close slide merged.
- What happens when a user switches offer types after selecting a creative mode that is not valid for the new offer type? The system must validate on every change and block invalid combinations.
- What happens when a retargeting carousel has no testimonial provided but uses angle P (Proof)? The system falls back to product result claims or data instead of testimonials.
- What happens when a user provides a reference ad while also selecting art direction? The reference ad wins; art direction is suppressed. The trace must reflect this override.
- What happens when a user selects "text_only" mode? Universe, art direction, and photo upload sections are hidden, and the resolution trace reflects `textOnlyActive: true`.
- What happens when carousel slide 2+ is being generated? Hero photos from Box A are NOT re-injected; slide 1 serves as the style reference for all subsequent slides.
- What happens when a user switches between realistic and fantasy families? Art direction cards not belonging to the new family are cleared; the universe resets to the new family's default.
- What happens when a Scaling plan user selects retargeting + batch? It is approved — batch generates single-image retargeting × N using the same pipeline.
- What happens when a user tries to pair before_after with value_stack in a carousel? before_after is solo-only — the pairing is blocked before it reaches carousel logic.
- What happens when a generation fails partway through the pipeline? The resolution trace is still written with whatever fields were resolved up to the failure point. Trace write failure does not fail the generation — it is logged and skipped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST validate every creative combination (offer type, campaign type, ad format, creative mode pair) against the approved Launch Surface Registry before allowing generation.
- **FR-002**: The system MUST block generation and display a clear reason when a combination is not approved, both on the frontend (inline message) and the server (rejection with reason).
- **FR-003**: The system MUST completely remove "limited_access", "module_preview", and "day_strip" from all creative mode catalogs, mode pairing rules, and sub-style compatibility rules.
- **FR-003a**: The system MUST reclassify "before_after" as a creative mode (available in all three tabs: mini_course, live_events, free_guide) and remove it from the hook angle selector. The approved cold hook angles are exactly 10: emotional, logic, urgency, scarcity, pain, curiosity, statistics, social_proof, logical_authority, future_based.
- **FR-003b**: The system MUST enforce "before_after" and "text_only" as solo-only modes — they cannot be paired with any other mode. Attempting to pair them MUST be blocked with a reason.
- **FR-003c**: The system MUST consolidate offer types so the dropdown contains exactly 3 entries: "Live Event" (mapping to tab live_events — replaces Free Webinar, Paid Workshop, and Challenge), "Free Guide" (tab free_guide), and "Mini-Course" (tab mini_course).
- **FR-004**: The system MUST accept campaign type (cold/retargeting), ad format (single/carousel/batch), and visual style family (realistic/fantasy/minimal) as resolver inputs. When visual style family is not provided, it MUST default to "realistic."
- **FR-005**: The system MUST support "minimal" as a visual style family that suppresses all environment/scene rendering while keeping the universe input field visible to the user.
- **FR-006**: The system MUST generate a structured slide plan for every carousel generation, assigning a specific narrative angle to each slide based on campaign type and slide count.
- **FR-007**: The system MUST ensure CTA buttons appear only on slide 1 and the last slide of any carousel — never on middle slides.
- **FR-008**: The system MUST auto-adjust carousel slide count when value_stack mode is active, using the formula: resolved slides = number of non-empty gifts + 2, capped at 9.
- **FR-009**: The system MUST notify the user when their slide count selection is overridden, showing the new count and reason.
- **FR-010**: The system MUST suppress any empty value_stack field so it never appears in the generation blueprint, prompt, or rendered output — an empty field does not exist. The canonical fields subject to suppression are: `valueStackTitle`, `valueStackItems`, `valueStackBonuses`, `valueStackPrice`, `valueStackOriginalValue`, `valueStackSavings`, `valueStackGuarantee`, `valueStackDeliveryFormat`, `valueStackProofStatement`.
- **FR-011**: The system MUST produce a complete resolution trace for every generation run, recording all resolved inputs, overrides, empty field suppressions, and per-slide structure.
- **FR-012**: The system MUST persist the resolution trace alongside the generation record for auditing and debugging.
- **FR-013**: The system MUST centralize the retargeting hook angle clearing rule (cold hook angle is null when retargeting is selected) into the resolver rather than scattering it inline.
- **FR-014**: ~~The system MUST delete the dead code file `step3point5.ts` that is not imported anywhere.~~ **Satisfied**: File does not exist in the codebase. Step 3.5 logic lives in `layoutContract.ts` and is actively used — NOT dead code.
- **FR-015**: The system MUST clear art direction when the user switches visual style families, and log the reason in the resolution trace.
- **FR-016**: The system MUST enforce the visual control precedence chain: (1) Reference Ad overrides universe and art direction but preserves mode layout, (2) Style Family controls which art direction cards are available, (3) Art Direction overrides universe rendering aesthetic, (4) Universe controls scene environment, (5) Creative Mode Layout is never overridden. The resolver MUST apply these priorities in order and record each override in the resolution trace.
- **FR-017**: The system MUST validate "retargeting + batch" as an approved launch combination for Scaling plan users. Batch retargeting generates single-image retargeting × N using the same pipeline. N is the product of selected variation dimensions (hooks × concepts × sizes). The resolver runs once; the pipeline instantiates one job per combination. N is capped at 30 to prevent runaway generation.
- **FR-018**: The system MUST persist the resolution trace as a field on the generation document (not as a sub-collection), matching the schema defined in LAUNCH_MATRIX Section 8. The trace shares the generation document's lifecycle — it is retained as long as the generation document exists and requires no separate cleanup policy.

### Key Entities

- **Launch Surface**: The authoritative registry of approved offer types, creative modes, mode pairings, campaign types, ad formats, and plan requirements. All validation decisions reference this single source of truth.
- **Resolution Trace**: A structured record produced on every generation run, documenting: resolved campaign type, creative modes (trace field: `resolvedCreativeModes`), style family, art direction (trace field: `resolvedSubStyle`), reference ad override status, hook angle, objection, mode compatibility result, slide count (original and resolved), empty fields skipped, auto-switch events, and per-slide breakdowns (CTA presence, narrative angle, photo injection). Terminology note: user-facing language uses "creative mode" and "art direction"; internal trace fields use `creativeMode` and `subStyle` respectively. The term "ad mode" is deprecated — use "creative mode" in all new code and documentation.
- **Carousel Slide Plan**: A deterministic mapping from (campaign type, slide count) to a per-slide array of roles and narrative angles. Cold carousels use angles A–G (7 angles: Direct value, Curiosity, Social proof, Problem agitation, Mechanism, Objection pre-emption, Identity). Retargeting carousels use angles P, M, R, I, C, Q, E (7 angles: Proof, Mechanism, Risk reversal, Identity shift, Cost of inaction, Question reframe, Evidence comparison).
- **Visual Precedence Chain**: A 5-level priority system that resolves conflicts between visual inputs. From highest to lowest: Reference Ad > Style Family > Art Direction > Universe > Creative Mode Layout. Each override is logged in the resolution trace.
- **Value Stack Auto-Adjustment**: A rule that overrides the user's selected slide count to N+2 (gift count + hook + close), capped at 9, when value_stack mode is active in a carousel.
- **Empty Field Suppression**: A filter that strips any value_stack field that is undefined or whitespace-only before it reaches any generation logic. Suppressed field names are recorded in the resolution trace. The canonical value_stack fields subject to suppression are: `valueStackTitle`, `valueStackItems`, `valueStackBonuses`, `valueStackPrice`, `valueStackOriginalValue`, `valueStackSavings`, `valueStackGuarantee`, `valueStackDeliveryFormat`, `valueStackProofStatement`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every approved combination from the Launch Surface Registry passes validation; every removed or invalid combination is blocked with a human-readable reason — 100% coverage, zero false positives or negatives.
- **SC-002**: Carousel ads at every supported slide count (2–9) for both cold and retargeting campaigns follow the exact narrative angle sequence defined in the slide plans — every slide's role is predictable and correct.
- **SC-003**: Value stack carousel slide count auto-adjusts to match gift count + 2 in 100% of cases, and the user sees a notification confirming the adjustment.
- **SC-004**: Zero empty value_stack fields appear in any generated output across all test cases — no blank rows, no placeholders, no "N/A" labels.
- **SC-004a**: Resolver execution completes in < 50ms p95 — validated via benchmark tests. The resolver performs no async I/O; all logic is pure in-memory computation.
- **SC-005a**: A resolution trace is produced (built in memory) for 100% of generation runs, containing all mandatory fields with no missing entries.
- **SC-005b**: Resolution trace persistence uses fire-and-forget semantics — write failures are logged but do not fail the generation. Persistence failures should be monitored via server logs (console.warn). Target: >99% successful writes under normal operation.
- **SC-006**: Users cannot discover, select, or generate with "limited_access", "module_preview", or "day_strip" through any user interaction path — zero references in user-facing surfaces.
- **SC-007**: Minimal family ads contain no environmental scene rendering in 100% of test cases while the universe dropdown remains visible and interactive in the input form.
- **SC-008**: All deleted mode cleanup is complete with zero remaining references in pairing rules, compatibility tables, or mode catalogs.
- **SC-009**: "before_after" does not appear in any hook angle list or selector — it appears only as a creative mode available in all 3 tabs, enforced as solo-only.
- **SC-010**: The offer type dropdown contains exactly 3 entries (Live Event, Free Guide, Mini-Course) with correct tab mappings. No other offer types are selectable.
- **SC-011**: Visual precedence chain is enforced deterministically — reference ad always overrides art direction and universe; mode layout is never overridden — verified across all conflict scenarios.

## Clarifications

### Session 2026-04-06

- Q: What is the canonical set of value_stack fields subject to empty-field suppression? → A: valueStackTitle, valueStackItems, valueStackBonuses, valueStackPrice, valueStackOriginalValue, valueStackSavings, valueStackGuarantee, valueStackDeliveryFormat, valueStackProofStatement
- Q: What is the acceptable resolver execution latency? → A: < 50ms p95 (hard real-time, requires benchmarks)
- Q: How is the batch count N determined? → A: N = product of selected variation dimensions (hooks × concepts × sizes). Resolver runs once; pipeline instantiates one job per combination. Max cap = 30.
- Q: Should the spec standardize terminology for "ad mode" vs "creative mode" and "sub-style" vs "art direction"? → A: User-facing: "creative mode" + "art direction"; internal/trace fields: `creativeMode` + `subStyle`. "Ad mode" is deprecated.
- Q: What is the retention policy for resolution traces? → A: Retained as long as the generation document exists (no separate cleanup).

## Assumptions

- The Launch Surface Registry in the LAUNCH_MATRIX.md file is the single source of truth for all approved combinations — no other document or inline code logic overrides it.
- The three deleted modes (limited_access, module_preview, day_strip) are permanently removed, not deferred — no migration path or backward compatibility is needed.
- The resolution trace schema defined in the LAUNCH_MATRIX.md Section 8 is the authoritative structure — all fields listed are mandatory.
- Existing generation pipeline code (generators, layout contracts, build plans, caption validation, scoring engine) is already functional and should not be rebuilt — only extended with new resolver inputs and trace output.
- The `step3point5.ts` file is confirmed dead code (not imported anywhere) and can be safely deleted.
- All 11 priority lanes (behavior contracts) will be validated via QA fixtures in a later phase — this phase focuses on the resolver foundation they depend on.
- Carousel slide plans are deterministic — given the same campaign type and slide count, the system always produces the same angle sequence.
- The server-side launch surface guard runs at the entry point of every generation handler, before any credit deduction or AI model calls begin.
- The creative resolver is the single authority for resolving all creative decisions — no inline logic in generators or other files should duplicate resolver responsibilities.
- When `visualStyleFamily` is not provided in resolver inputs, it defaults to "realistic."
- The resolution trace is persisted as a field on the `generations/{genId}` document (e.g., `generations/{genId}.resolutionTrace`), not as a separate sub-collection document. This matches LAUNCH_MATRIX Section 8 wording.
- Resolver changes must not alter language propagation behavior — Arabic output quality is validated separately in Spec E but must not be regressed by this phase.
- LAUNCH_MATRIX G15 (deleted modes still in codebase) is split: resolver-side deletion is this spec (Spec B); frontend-side deletion is Spec C.
- The offer type consolidation (5 → 3) affects the tab mapping logic in the resolver. The frontend dropdown change is Spec C scope.
- "before_after" reclassification from hook angle to creative mode affects both the resolver (this spec) and the frontend hook angle selector (Spec C). This spec handles the resolver/backend side.
