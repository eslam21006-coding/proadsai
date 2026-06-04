# Feature Specification: OpenAI gpt-image-2 + Native Text Rendering

**Feature Branch**: `openai-image-swap`
**Created**: 2026-06-04
**Status**: Draft
**Input**: User description: "Phase 025 — OpenAI gpt-image-2 + Native Text Rendering. Swap the visual generation engine from Gemini (image-without-text) + Sharp (fixed-zone Arabic text compositing) to OpenAI gpt-image-2, which renders the complete image including all ad copy with free-form, design-appropriate placement. All non-text creative rules (face identity, wardrobe, cultural guardrails, brand color, logo, layout zones, gaze, creative modes, carousel anchor, safe zones) are preserved unchanged. The swap is fully reversible via a single config flag plus uncommenting preserved code — zero code deleted."

## Overview

Today every generated ad tends toward the same structural skeleton: Gemini renders the complete image (text included) but under a rigid prompt contract that pushes copy into the same zones on every image, so ads look structurally identical regardless of concept. (An earlier Sharp post-processing step in `textCompositing.ts` once composited Arabic copy, but **Sharp text compositing was already inert in the pipeline before this phase** — it is no longer part of the live render path.)

This phase replaces the visual engine with OpenAI **gpt-image-2**, a model that renders the *complete* image — hero, scene, branding, **and** the ad copy — in a single pass, placing text where the composition calls for it. The change is gated behind a single provider flag so the entire system can revert to the Gemini pipeline by flipping the flag and restoring the commented Gemini prompt block.

## Clarifications

### Session 2026-06-04

- Q: What is the acceptance bar for Arabic text rendering quality, given gpt-image-2 produces text generatively (with variance) rather than via deterministic Sharp compositing? → A: A sampled manual QA review must find ≥95% of Arabic ads with correct right-to-left, connected Arabic letterforms (no broken letters, no Latin substitution). This replaces the unverifiable "100%" bar.
- Q: What per-image timeout should the system enforce for a single gpt-image-2 call before treating it as a failure (refund + error)? → A: 120 seconds per image. A call exceeding 120s is treated as a generation failure (descriptive error + credit refund), identical to other engine failures.
- Q: How should multi-item runs (carousel up to 10 slides, batch up to 36 items) be dispatched to gpt-image-2, given OpenAI's account-tier rate limits? → A: Keep the existing 5-concurrent cap unchanged; OpenAI rate-limit (429) errors surface as per-item generation failures (refund), no special retry/backoff in this phase.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visually distinct text layouts per design (Priority: P1)

A marketer generates ads in Arabic and English. With the new engine, the ad copy (hook, supporting line, CTA, benefit) is rendered *inside* the image by the model, placed naturally for that specific composition — overlaid on a dark area, inside a card or shape, split across zones, or in a dedicated panel. No two concepts share the same text skeleton.

**Why this priority**: This is the core value of the phase. The current fixed-zone compositing is the single biggest cause of "every ad looks the same." Delivering varied, design-appropriate text placement is the entire point of the swap.

**Independent Test**: Generate 3 concepts for the same offer and confirm each has a visibly different text layout, with correct copy content, on the first attempt.

**Acceptance Scenarios**:

1. **Given** an Arabic offer with a hero, **When** the user generates an ad, **Then** the returned image contains the Arabic hook/supporting/CTA/benefit copy rendered in right-to-left, fully connected Arabic script (no broken letterforms, no Latin substitution), placed appropriately for the composition.
2. **Given** an Arabic offer with no hero, **When** the user generates an ad, **Then** the copy is integrated naturally into the design rather than stamped into a fixed zone.
3. **Given** an English offer, **When** the user generates 3 concepts, **Then** each concept shows a distinct text layout.
4. **Given** any generated ad, **When** the image returns, **Then** the CTA appears inside a visually distinct button or shape with sufficient text/background contrast.

---

### User Story 2 - All non-text creative guarantees preserved (Priority: P1)

A returning user who relies on hero face fidelity, Islamic cultural compliance for Arabic ads, brand-color enforcement, logo placement, layout-zone proportions, gaze direction, and creative modes (event_ticket, value_stack, before_after, speaker_card, webinar_screen, etc.) sees all of these behave exactly as before. The only thing that changed is *how text gets onto the image*.

**Why this priority**: The swap must not regress any of the launch-quality guarantees the product is built on. A change that improves text variety but breaks face identity or cultural compliance is a net loss.

**Independent Test**: Run an Arabic ad with a hero through a creative mode and confirm face identity, cultural compliance, brand color, logo, and the mode's required elements are all present and correct.

**Acceptance Scenarios**:

1. **Given** an Arabic ad, **When** generated, **Then** Islamic cultural guardrails (wardrobe, haram-motif substitution) are enforced exactly as in the prior pipeline.
2. **Given** an offer with a defined hero, **When** generated across multiple concepts or carousel slides, **Then** the hero's facial structure remains consistent and inviolable.
3. **Given** an event_ticket (or other) creative mode, **When** generated, **Then** the mode's signature element renders with the correct copy inside it.
4. **Given** a brand with defined colors and a logo, **When** generated, **Then** brand color injection and logo placement rules apply unchanged.

---

### User Story 3 - Reflow, Polish, carousel, and batch keep working (Priority: P2)

A user who reframes an ad (reflow 1:1 → 9:16), edits one with the Polish Engine, generates a 5-slide carousel, or runs a 4-item batch finds all of these working on the new engine — same hero across carousel slides, same hero after reflow, edit instructions applied to the full image, and every batch item produced.

**Why this priority**: These downstream flows share the visual caller. They must not break, but they are validated after the core single-ad path is confirmed.

**Independent Test**: Reflow a generated ad from 1:1 to 9:16 and confirm the same hero appears in a new composition; run a 5-slide carousel and confirm hero consistency with per-slide layout variety.

**Acceptance Scenarios**:

1. **Given** a generated 1:1 ad, **When** the user reflows it to 9:16, **Then** the same hero appears in a recomposed image.
2. **Given** a 5-slide carousel, **When** generated, **Then** each slide has a unique text placement and the same hero across all slides.
3. **Given** a generated ad, **When** the user applies a Polish edit instruction, **Then** the edit is applied to the full image.
4. **Given** a 4-item batch, **When** generated, **Then** all 4 items are produced, each with a different layout.

---

### User Story 4 - Operator can revert to the previous engine (Priority: P2)

An operator who finds the new engine underperforming can revert the entire system to the Gemini pipeline by flipping one configuration value and restoring the commented Gemini prompt block in `buildFinalImagePrompt` — no code recovery, no re-implementation.

**Why this priority**: Reversibility is a non-negotiable safety property for swapping the core generation engine. It is P2 only because it is exercised after the forward path is built.

**Independent Test**: Set the provider flag back to the previous engine, restore the commented Gemini prompt block, and confirm the legacy path produces a correct ad with no broken references.

**Acceptance Scenarios**:

1. **Given** the new engine is active, **When** the operator switches the provider flag to the previous engine and restores the commented Gemini prompt block, **Then** the Gemini pipeline produces a correct ad.
2. **Given** a revert has been performed, **When** the build runs, **Then** there are no broken imports or dangling references — all previous code is intact.

---

### Edge Cases

- **Empty optional copy fields**: When the supporting line or benefit line is empty, that line is omitted entirely from the rendered image (not rendered as a blank or placeholder).
- **Reference photos present vs. absent**: When the offer includes Box A hero reference photo(s), the engine must use the image-edit path seeded with the reference. When no reference is present, it uses the pure generation path.
- **Aspect ratios with no exact engine size**: Aspect ratios that don't map to a native engine size (e.g., 4:5, 3:4, 4:3) must map to the closest supported size for that orientation.
- **Provider/engine error**: An engine failure (auth, rate limit, content rejection, timeout) surfaces as a normal generation failure with credit refund — identical to existing error handling — and never crashes the pipeline.
- **Slow generation**: A single gpt-image-2 call that exceeds the 120-second per-image timeout is treated as a generation failure (descriptive error + credit refund). In multi-item runs (carousel/batch), one item timing out does not abort sibling items.
- **Missing engine credential**: When the new engine is selected but its API credential is unavailable, the call fails with a descriptive error and refund, not a silent crash.
- **Rate-limit during multi-item run**: When OpenAI returns a rate-limit (429) response mid-batch/carousel, the affected item fails with refund while sibling items continue; the run does not abort, and no automatic retry is performed in this phase.
- **Copy fidelity verification**: Because text is now embedded by the model, the existing copy-fidelity retry verification cannot inspect rendered text; on the new path it is bypassed (the system trusts the model to render the provided copy). The verification logic remains intact for the previous engine's path.
- **Legacy records re-rendered after the swap**: Saved generations created under the old pipeline, when re-rendered or reflowed, follow the new path's rules.

## Requirements *(mandatory)*

### Functional Requirements

**Engine swap & provider selection**

- **FR-001**: The system MUST support a single, centrally defined provider selector with exactly two values — the new engine (OpenAI gpt-image-2) and the previous engine (Gemini) — that determines which visual generator is used.
- **FR-002**: All visual-capable flows MUST read the provider selector and route the image render to the corresponding visual caller: **final-ad generation, reflow, polish/edit (region edit), carousel, and batch — all route through `MODEL_PROVIDER`**. Carousel and batch reuse the final-ad render path (there is no separate image callable), so routing the final-ad flow covers them. No other behavior in these flows changes.
- **FR-003**: When the new engine is selected, the system MUST send the complete prompt (visual + ad copy) to gpt-image-2 and return the full rendered image including text.
- **FR-004**: The new engine's caller MUST be drop-in compatible with the existing visual-caller interface so that no downstream code requires changes to consume its output.
- **FR-005**: The new engine's caller MUST return the **same response shape `createGeminiCaller` produces** — the candidates structure with raw base64 (no `data:` prefix; `generators.ts:5919` prepends the prefix) — so downstream storage and display are unaffected.

**Native text rendering**

- **FR-006**: On the new path, the system MUST pass the ad copy (main hook, supporting line, CTA button label, benefit line) to the model for in-image rendering, omitting any optional line that is empty.
- **FR-007**: The new-path prompt MUST instruct the model to place text where it best fits the composition (overlaid on dark areas, inside shapes/cards, split across zones, integrated into the scene, or in dedicated panels) and to make each design's text layout different.
- **FR-008**: The new-path prompt MUST require Arabic text to be right-to-left, fully connected Arabic script — never broken letters, never Latin substitution — with zero tolerance for malformed letterforms.
- **FR-009**: The new-path prompt MUST require the CTA to render inside a visually distinct button or shape, with sufficient text/background contrast on all copy.
- **FR-010**: The new-path prompt MUST include explicit quality direction for ultra-high-resolution, professional advertising output with every element sharp and intentional.

**Preserved creative rules (must not change)**

- **FR-011**: The new-path prompt MUST preserve, unchanged, the hero face identity lock (inviolable facial structure) and hero wardrobe/customization rules.
- **FR-012**: The new-path prompt MUST preserve, unchanged, the cultural guardrails (Islamic compliance for Arabic ads), brand-color injection/enforcement, and logo placement rules.
- **FR-013**: The new-path prompt MUST preserve, unchanged, the layout-contract zone proportions (hero zone, CTA zone), gaze direction, safe-zone percentages, and the structural parameters of the prompt builder.
- **FR-014**: The new-path prompt MUST preserve, unchanged, all creative-mode rules (event_ticket, value_stack, before_after, speaker_card, webinar_screen, and the rest) and the carousel visual directive and style anchor.
- **FR-015**: All copy generation (hooks, tone of voice, concepts, captions), universe selection logic, hero customization logic, billing/credits/plans, Firestore data model and security rules, and all frontend behavior MUST remain unchanged by this phase.

**Reference images & aspect ratios**

- **FR-016**: When hero reference photo(s) are present, the new engine MUST use its image-edit capability seeded with the first reference image plus the prompt; when none are present, it MUST use pure image generation from the prompt. (Verify gpt-image-2 `images.edit()` multi-image support during implementation; if supported, pass **all** hero reference images — not just the first — to maintain face-fidelity parity with the Gemini path.)
- **FR-017**: The system MUST map each supported aspect ratio (1:1, 9:16, 4:5, 3:4, 4:3, 16:9) to the closest valid engine size for that orientation. Exact size values MUST be confirmed against current gpt-image-2 capabilities before release.

**Copy-fidelity gating**

- **FR-018**: When the new engine is selected, the system MUST skip the copy-fidelity retry verification (which cannot inspect model-embedded text) and trust the model to render the provided copy.
- **FR-019**: The copy-fidelity verification MUST remain fully functional for the previous-engine path; it is gated by provider, not removed.

**Reliability & error handling**

- **FR-020**: Engine credentials MUST be accessed lazily inside the function body, never at module load, and the previous and new engine credentials MUST be able to coexist.
- **FR-021**: Both visual callers MUST fail with descriptive errors and MUST NOT crash the pipeline; new-engine errors MUST surface as generation failures with credit refund, identical to existing error handling.
- **FR-021a**: The new engine MUST enforce a 120-second per-image timeout; a call exceeding it is treated as a generation failure (descriptive error + credit refund). In multi-item runs, one item exceeding the timeout MUST NOT abort sibling items (best-effort partial success, consistent with existing carousel/batch reflow semantics).
- **FR-021b**: Multi-item runs (carousel, batch) MUST retain the existing 5-concurrent dispatch cap unchanged. OpenAI rate-limit (HTTP 429) responses MUST surface as per-item generation failures with refund; no automatic retry/backoff is introduced in this phase.

**Reversibility (non-negotiable)**

- **FR-022**: The system MUST support a full revert to the previous Gemini pipeline in two steps: (1) switch the provider selector to the previous engine, and (2) restore the commented Gemini prompt block in `buildFinalImagePrompt` (T008). Sharp text compositing was already inert in the pipeline before this phase, so no Sharp call needs re-enabling.
- **FR-023**: No code MAY be deleted in this phase. The previous-engine (Gemini) prompt block MUST be preserved in a disabled (commented) state, recoverable without re-implementation. `functions/src/textCompositing.ts` is preserved **intact** (not commented — it was already inert in the live render path); only `compositeArabicText()` call sites are commented if any remain.
- **FR-024**: After a revert, the build MUST contain no broken imports or dangling references, and the previous pipeline MUST produce correct output.

### Key Entities *(include if feature involves data)*

- **Provider selector**: A single source of truth identifying the active visual engine (new vs. previous) and the new engine's model identifier. Read by the final-ad generation, reflow, polish/edit, carousel, and batch flows.
- **Visual caller**: An interchangeable component that accepts the existing request shape (prompt text parts + reference-image parts + aspect ratio) and returns the same response shape as `createGeminiCaller` (candidates structure, raw base64). Two implementations exist — previous engine and new engine — sharing one interface.
- **Ad copy bundle**: The text content rendered into the image — main hook, supporting line (optional), CTA button label, benefit line (optional).
- **Engine credential**: A secret used only when its engine is selected; previous and new credentials coexist and are read lazily at call time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across any 3 concepts generated for the same offer, all 3 have visibly distinct text layouts (0 of 3 share an identical text skeleton).
- **SC-002**: In a sampled manual QA review, ≥95% of Arabic ads render copy in right-to-left, fully connected Arabic script with correct letterforms and no Latin substitution. (Generative variance makes a literal 100% unverifiable; the bar is a measurable QA pass rate with human review.)
- **SC-003**: Every generated ad places the CTA inside a visually distinct button/shape with legible contrast.
- **SC-004**: All preserved creative guarantees (hero face identity, cultural compliance, brand color, logo placement, creative-mode elements, carousel hero consistency) pass at the same rate as the previous pipeline — zero regressions.
- **SC-005**: All downstream flows — single ad, 5-slide carousel, 4-item batch, reflow (1:1 → 9:16), and Polish edit — complete successfully on the new engine.
- **SC-006**: An operator can revert to the previous pipeline in two documented steps, and the reverted build compiles with no broken references and produces a correct ad.
- **SC-007**: Engine failures result in a user-visible generation failure with credit refund in 100% of failure cases, with zero pipeline crashes.
- **SC-008**: Zero lines of previous-engine or Sharp-compositing code are deleted; all are recoverable from the disabled (commented) state.

## Assumptions

- **gpt-image-2 capability**: The OpenAI gpt-image-2 model can render legible, correctly-connected right-to-left Arabic text in-image at advertising quality. The exact supported output sizes per aspect ratio will be confirmed against current API capabilities before release; the listed mappings (e.g., 1:1 → 1024×1024, 9:16 → 1024×1792, 16:9 → 1792×1024) are starting assumptions, not guarantees.
- **Default active engine**: The new engine (gpt-image-2) is the default active provider for this phase; the previous engine remains available as the revert target.
- **Interface compatibility**: The new caller can fully satisfy the existing visual-caller interface, so downstream consumers (storage, display, reflow, carousel, batch) need no changes.
- **Reference-image edit path**: When hero reference photos exist, the first reference image seeds the edit path at minimum. If gpt-image-2 `images.edit()` supports multiple input images (verified during implementation, FR-016), all hero references are passed to maintain face-fidelity parity with the Gemini path; otherwise the first reference is used.
- **Copy fidelity trust**: With text embedded by the model, the prior automated copy-fidelity retry loop provides no value on the new path and is safely bypassed; copy correctness on the new path is validated by the prompt instructions and human/QA review rather than automated re-render verification.
- **Reflow safe-zone validation**: The Sharp text-compositing module may still be referenced by reflow safe-zone validation; that module is left intact. Sharp text compositing was already inert in the live render path before this phase, so there are no active `compositeArabicText()` call sites to disable.
- **No data-model change**: This phase introduces no Firestore schema changes, no security-rule changes, and no frontend changes.
- **Engine-agnostic copy generation**: Copy generation uses separate creative models and is unaffected by the visual-engine swap.

## Out of Scope

- Any change to copy generation, tone of voice, concepts, captions, or cultural guardrails *in copy prompts*.
- Any change to the universe database or selection logic.
- Any change to billing, credits, plans, Stripe, or GHL.
- Any change to the Firestore data model, security rules, or frontend code.
- Permanent removal/deletion of the Gemini prompt block or the Sharp compositing code (must remain recoverable).
- Building a runtime/admin UI toggle for the provider selector (selection is a code-level configuration in this phase).
