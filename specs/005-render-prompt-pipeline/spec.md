# Feature Specification: Blueprint → Long-Form Render Prompt Pipeline

**Feature Branch**: `005-render-prompt-pipeline`
**Created**: 2026-04-02
**Status**: Draft
**Input**: Phase 5 from LAUNCH_MATRIX.md — Blueprint → Long-Form Render Prompt Pipeline (10 tasks: 5.1–5.10)

## Clarifications

### Session 2026-04-02

- Q: Should FR-001/FR-002 be expanded to require mode-specific data fields (valueStackItems, eventTitle, eventDate, etc.) and uploaded assets (photos, logos, mode assets, reference ad) to feed the render prompt? → A: Yes — expand to cover all, but only inject when the user has provided them. All are optional inputs; skip gracefully when absent.
- Q: What should the user experience be when copy fidelity validation exhausts max retries? → A: Show error + "Retry" button — user can retry generation with the same inputs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete Input Injection into Render Prompt (Priority: P1)

As a user generating an ad, every input I provided in Steps 1 and 2 — product name, target audience, creative mode, art direction, universe, campaign type, hook angle, ad tone, brand colors, and copy text — MUST feed into the image generation prompt. Currently, some inputs may be missing or conditionally injected, causing the rendered image to ignore what I selected.

**Why this priority**: If the render prompt doesn't contain all inputs, the generated image will not reflect the user's choices — the core value proposition breaks. A user who selects "luxury_magazine" style and "dark_cinematic" tone but gets a generic image will lose trust.

**Independent Test**: Generate an ad with all inputs filled (creative mode, sub-style, universe, campaign type, hook angle, tone, brand colors, copy text). Inspect the final render prompt. Verify every input appears in the prompt with correct values.

**Acceptance Scenarios**:

1. **Given** a user selects `value_stack` creative mode, **When** the render prompt is assembled, **Then** the prompt contains the value stack compositional structure rules (stack zone, price panel, etc.).
2. **Given** a user selects `luxury_magazine` sub-style, **When** the render prompt is assembled, **Then** the prompt contains the luxury magazine visual constraint block (color palette, typography, lighting, forbidden elements).
3. **Given** a user selects `retargeting` campaign with objection `price_too_high`, **When** the render prompt is assembled, **Then** the prompt contains retargeting visual direction referencing the price objection.
4. **Given** a user provides brand colors `#FF5733` (primary) and `#1A1A2E` (secondary), **When** the render prompt is assembled, **Then** the prompt contains the exact hex values with placement directives (CTA button, accent elements).
5. **Given** a user approves hook text "Transform Your Business Today", **When** the render prompt is assembled, **Then** the prompt contains that exact string verbatim — not paraphrased or substituted.
6. **Given** a user selects `anime_manga` sub-style with `event_ticket` mode, **When** the render prompt is assembled, **Then** both the anime visual constraints AND ticket frame structure appear in the prompt.

---

### User Story 2 - Copy Text Fidelity Validation (Priority: P2)

As a user, the exact hook text, subhead text, and CTA name I approved in Step 2 MUST appear in the rendered image. The system must validate that the render prompt contains my approved text verbatim and reject prompts where the text was paraphrased or omitted.

**Why this priority**: Users carefully craft and approve their copy text. If the image model receives a paraphrased version, the rendered text won't match what was approved — causing confusion, rework, and loss of trust.

**Independent Test**: Generate an ad with known hook text. Inspect the build plan output. Verify the text appears verbatim. Then test with a build plan where text is missing — verify the system rejects it and retries.

**Acceptance Scenarios**:

1. **Given** a user approves hook text in Arabic, **When** the build plan is validated, **Then** the system confirms the exact string appears in the technical prompt.
2. **Given** a build plan where hook text was paraphrased by the model, **When** validation runs, **Then** the build plan is marked as failed and a rebuild is triggered.
3. **Given** a build plan where CTA name is missing, **When** validation runs, **Then** the build plan is marked as failed.

---

### User Story 3 - Blueprint Visibility in Step 3 (Priority: P3)

As a user viewing Step 3, I can see the human-readable blueprint that describes how my ad will be composed. The technical machine prompt is hidden from me but stored for debugging. I can expand a panel to view the full blueprint text.

**Why this priority**: Transparency builds trust. Users should see the rendering plan before the image is generated. But the raw technical prompt is noise for non-technical users — it belongs in the audit trail, not the UI.

**Independent Test**: Generate an ad through Step 3. Verify the blueprint panel is visible and expandable. Verify the technical prompt portion is NOT shown in the UI. Verify both are stored in the generation record.

**Acceptance Scenarios**:

1. **Given** a user reaches Step 3, **When** the blueprint is generated, **Then** a "View Blueprint" expandable panel appears showing the human-readable rendering plan.
2. **Given** the blueprint contains a `TECHNICAL_PROMPT` section, **When** displayed to the user, **Then** the technical prompt portion is stripped from the visible text.
3. **Given** an ad is generated, **When** the generation record is stored, **Then** both `blueprintText` and `resolvedImagePrompt` fields are persisted.

---

### User Story 4 - Carousel Per-Slide Prompt Correctness (Priority: P4)

As a user generating a carousel ad, each slide must receive its own render prompt with the correct per-slide copy text. Slide 2's hook text must not reuse slide 1's text.

**Why this priority**: Carousel slides each have unique copy. If the pipeline reuses slide 1's text for all slides, the carousel output is broken.

**Independent Test**: Generate a 5-slide carousel. Inspect the per-slide render prompts. Verify each slide contains its own unique hook text and subhead text. Verify per-slide blueprint and resolved prompt are stored in the trace.

**Acceptance Scenarios**:

1. **Given** a 5-slide carousel with different copy per slide, **When** render prompts are assembled, **Then** each slide's prompt contains only that slide's approved copy text.
2. **Given** a carousel generation completes, **When** the resolution trace is inspected, **Then** each slide has its own `blueprintText` and `resolvedImagePrompt` in the `perSlide` array.

---

### User Story 5 - Render Prompt Auditability (Priority: P5)

As a QA reviewer or debugging developer, I can inspect the exact prompt that was sent to the image model for any generation. The full assembled prompt is stored in the resolution trace alongside the blueprint.

**Why this priority**: Without auditability, debugging bad renders requires guessing what the model received. Storing the final prompt enables root-cause analysis and regression prevention.

**Independent Test**: Generate an ad. Query the resolution trace. Verify `resolvedImagePrompt` contains the full assembled prompt. Compare it against the blueprint to verify all inputs were correctly merged.

**Acceptance Scenarios**:

1. **Given** a completed generation, **When** the resolution trace is queried, **Then** the `resolvedImagePrompt` field contains the full assembled prompt that was sent to the image model.
2. **Given** a generation with `visualSubStyle: "dark_cinematic"`, **When** the resolved prompt is inspected, **Then** it contains the dark cinematic visual constraint block.

---

### User Story 6 - Regression Guards (Priority: P6)

As a QA reviewer, unit tests verify that the render prompt assembly correctly includes all critical input categories: copy text fidelity, sub-style constraints, and campaign-type visual direction.

**Why this priority**: Without regression guards, future changes to the prompt assembly can silently drop inputs, causing render quality to degrade without detection.

**Independent Test**: Run the contract fixture tests. Verify tests assert: (a) exact hook text presence, (b) sub-style constraint block presence, (c) retargeting visual direction presence.

**Acceptance Scenarios**:

1. **Given** a test with known `hookText` and blueprint, **When** the prompt assembly function is called, **Then** the output contains the exact `hookText`.
2. **Given** a test with `visualSubStyle: "luxury_magazine"`, **When** the prompt assembly function is called, **Then** the output contains the luxury magazine constraint block.
3. **Given** a test with `campaignType: "retargeting"` and objection `dont_trust`, **When** the prompt assembly function is called, **Then** the output contains the retargeting trust-resolution visual direction.

---

### Edge Cases

- What happens when brand colors are not provided? The prompt omits color directives and lets the art direction style drive the palette.
- What happens when the build plan model paraphrases the hook text on rebuild? The validation runs again — max 2 retries before failing with a user-visible error and a "Retry" button allowing the user to retry generation with the same inputs.
- What happens when a carousel slide has empty copy text (e.g., a testimonial slide with image only)? The copy fidelity check is skipped for slides marked as image-only.
- What happens when the technical prompt exceeds the image model's context window? The prompt is truncated from the least-critical sections (audit trail notes, redundant constraints) while preserving copy text, mode rules, and style constraints.
- What happens when the user switches sub-style after Step 2 but before Step 3? The blueprint regenerates with the new sub-style. The previous blueprint is discarded.
- What happens when optional inputs (brand colors, logos, mode assets, reference ad) are not provided? The corresponding prompt sections are omitted entirely — no placeholder text or generic defaults injected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST inject ALL Step 1 inputs into the build plan prompt before the model generates the `TECHNICAL_PROMPT`: creative mode, sub-style, universe family, universe setting, campaign type, hook angle (cold), retargeting objection (retargeting), ad tone, and brand colors (as hex values).
- **FR-002**: The system MUST inject `hookText`, `subheadText`, and `ctaName` from Step 2 under both `TEXTS TO RENDER` and `CANONICAL CONTENT OWNERSHIP` sections unconditionally — never behind a conditional. Additionally, mode-specific data fields (`valueStackItems`, `eventTitle`, `eventDate`, `valueStackPrice`, `benefitText`, etc.) MUST be injected when provided by the user — omitted gracefully when absent.
- **FR-003**: The system MUST validate after build plan generation that the `TECHNICAL_PROMPT` contains the exact `hookText` string. If absent or paraphrased, the build plan MUST be marked as failed and a rebuild triggered (max 2 retries). If retries are exhausted, the system MUST show a user-visible error with a "Retry" button allowing the user to retry generation with the same inputs.
- **FR-004**: The system MUST extract the `TECHNICAL_PROMPT` from the build plan as a named field on the parsed result — not via substring search.
- **FR-005**: The system MUST assemble the final image prompt through a single dedicated function that combines (in order): (1) the technical prompt from the blueprint, (2) layout contract zone rules and aspect ratio, (3) sub-style visual constraints, (4) creative mode structural rules, (5) campaign type and hook angle visual direction, (6) brand color hex directives (when provided), (7) face-consistency instructions for uploaded personal photos (Box A, when provided), (8) logo placement directives (Box B, when provided), (9) mode-specific asset references — book covers, device screens, etc. (Box C, when provided), (10) style reference from uploaded reference ad (when provided). Items 6–10 are optional and omitted from the prompt when the user has not provided the corresponding input.
- **FR-006**: The system MUST NOT assemble image prompts inline elsewhere after the dedicated assembly function is introduced.
- **FR-007**: The system MUST store `resolvedImagePrompt` in the resolution trace for every generation.
- **FR-008**: The system MUST display the human-readable blueprint to the user in Step 3 via an expandable panel while stripping the `TECHNICAL_PROMPT` portion from the user-facing display.
- **FR-009**: The system MUST store `blueprintText` alongside `resolvedImagePrompt` in the generation record.
- **FR-010**: For carousel mode, the system MUST call the prompt assembly function per-slide with the correct per-slide copy text and store per-slide `blueprintText` and `resolvedImagePrompt` in the resolution trace.
- **FR-011**: The system MUST include unit tests that verify: (a) exact hook text presence in assembled prompt, (b) sub-style constraint block presence, (c) retargeting visual direction presence.

### Key Entities

- **Blueprint**: The human-readable rendering plan generated in Step 3, visible to the user, describing how the ad will be composed.
- **Technical Prompt (TECHNICAL_PROMPT)**: The machine-readable long-form prompt embedded within the blueprint, sent to the image generation model. Not shown to users.
- **Resolved Image Prompt**: The final assembled prompt combining the technical prompt with all contract rules, style constraints, mode rules, and color directives. The exact string sent to the image model.
- **Resolution Trace**: The audit record capturing all resolved values, decisions, and prompts for a generation run.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Step 1 input categories (creative mode, sub-style, universe, campaign type, hook angle, tone, brand colors) appear in the final render prompt for every generation.
- **SC-002**: Approved copy text appears verbatim in the render prompt in 100% of generations — zero paraphrasing, zero omissions.
- **SC-003**: Build plans with missing or paraphrased copy text are caught and rebuilt before reaching the image model.
- **SC-004**: Users can view their blueprint in Step 3 without seeing the raw technical prompt.
- **SC-005**: Every generation has a stored `resolvedImagePrompt` and `blueprintText` available for debugging within the generation record.
- **SC-006**: Carousel slides each have their own correct per-slide prompt — zero cross-slide text leakage.
- **SC-007**: Regression tests pass for all three critical input categories (copy fidelity, sub-style constraints, campaign-type direction).

## Assumptions

- Phase 1 (Resolver Foundation) is complete. The resolver, layout contracts, and creative mode catalog are available.
- The current `TECHNICAL_PROMPT` generation happens inside the same Gemini call that produces the blueprint — this architecture is preserved, not replaced. The change is about what inputs feed that call and how the output is consumed.
- The `buildPlanSlotMap.ts` module already handles blueprint parsing and validation. This feature extends it with `TECHNICAL_PROMPT` extraction and copy fidelity checks.
- The resolution trace schema already exists and is extensible with new fields.
- "Verbatim" copy fidelity means exact string match — the approved text must appear as a substring in the technical prompt. Whitespace normalization is acceptable.
- The "View Blueprint" UI panel follows existing expandable panel patterns in the Step 3 interface.
- The prompt assembly function replaces all current inline prompt assembly — no dual-path execution where some generations use the old path.
- Max 2 rebuild retries for copy fidelity validation failure. After that, the generation fails with a user-visible error.
