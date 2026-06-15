# Feature Specification: Phase 22 — Copy Quality Upgrade

**Feature Branch**: `958-copy-quality`
**Created**: 2026-06-14
**Status**: Draft
**Input**: User description: "Phase 22 — Copy Quality Upgrade. Add 6 constants to copywriting_knowledge.ts, wire the 3 quality rule blocks + BANNED_CTA_LIST into the 4 prompt surfaces in generators.ts, add the Track 1 system instruction (Section 18) to the TOV generation prompt. Do NOT include Phase 23 scope."

> **Authority:** This feature implements **Track 1 only** of `specs/_shared/COPY_SYSTEM_REFERENCE.md`. That document is the single source of truth for every copy rule, structure, scoring dimension, and pipeline-propagation fact referenced below. Where this spec and the reference disagree, the reference wins and this spec must be corrected.

## Overview

On-creative text (headline, subheadline, CTA, benefit, and carousel slide captions) is decided at the **generation source** inside the backend's prompt construction. Because the existing copy-fidelity contract carries the exact generated strings all the way to the rendered image (verified in spec 005 — see reference Section 1), improving the *words* at the generation source improves every static-image and carousel ad automatically, with no design-phase, gate, compositor, or UI changes required.

This feature improves those words by introducing three quality rules — **6th-grade reading level**, **lived-symptom depth**, and a **soft fabrication-flag policy** — plus a **banned-CTA list**, and applying them to the four prompt surfaces that produce on-creative copy. It also seeds two not-yet-consumed knowledge constants (scoring dimensions, rewrite diagnoses) for a later track, and establishes a drift-control discipline that keeps the reference document and the runtime constants in lockstep.

This feature is **Track 1 (Copy QUALITY)** of a two-track plan. It deliberately does **not** change the *number* of copy fields, the structure decision tree, the per-hook variation behavior, the scoring/rewrite execution loop, or any Step-2 UI. Those belong to Track 2 / Phase 23 and are explicitly out of scope (reference Sections 2, 15, 16, 17).

## Clarifications

### Session 2026-06-14

- Q: How should the new soft-flag fabrication policy interact with the existing hard anti-fabrication rules (`hookAnglesKnowledge.ts` honest-degradation rules; `captionValidator.ts` NUMERIC FACT VIOLATION repair)? → A: **Additive only.** Add the soft-flag block to the four prompt surfaces; keep the honest-degradation rules and the NUMERIC FACT VIOLATION repair fully intact. The soft-flag is a safety net *below* those hard compliance guards, not a replacement. The reference Section 0 "the hard fake-proof block is removed" wording was wrong and is corrected — what the policy frees is **creative framing** (scenarios, metaphors, hypotheticals), NOT numeric/identity compliance.
- Q: How should the non-blocking advisory (claimFlag) for a fabricated verifiable specific be surfaced in Phase 22? → A: **Structured field.** Capture the claimFlag in the generation output / `resolutionTrace` (additive field) so it can be surfaced/audited — not prompt-inline-only.
- Q: How should the banned-CTA list be enforced in Phase 22? → A: **Prompt-only.** Instruct the model never to use the five banned phrases; no post-generation detect/reject/replace guard (scoring/rewrite enforcement is the later track).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plain-language, recognizable copy on every generated ad (Priority: P1)

An advertiser generates a static image or carousel ad. The headline, subheadline, CTA, benefit, and any slide captions come back written at a 6th-grade reading level — short everyday words, short sentences, no jargon or abstract nouns (in Arabic, simple spoken-style فصحى) — and they name the **exact concrete moment** the audience already lives rather than describing the problem in the abstract.

**Why this priority**: This is the core value of the phase. Reading level and lived-symptom depth are the two hard rules that most directly determine whether copy stops the scroll and feels like "that's literally me." They ride the fidelity contract to every rendered image for free.

**Independent Test**: Generate ads across several offer types and languages; sample the produced copy fields and confirm they read at ≤6th-grade level and reference a concrete lived moment instead of an abstract category. Delivers value even if no other story ships.

**Acceptance Scenarios**:

1. **Given** an English ad request with pain-point inputs, **When** copy is generated, **Then** every emitted field uses short everyday words and short sentences with no jargon or abstract nouns, and the problem is expressed as a concrete recognizable moment (scene / time of day / specific detail) drawn from the pain and audience inputs.
2. **Given** an Arabic ad request, **When** copy is generated, **Then** the copy is simple spoken-style فصحى that a 12-year-old would say — nothing more abstract or formal.
3. **Given** a carousel ad request, **When** slide captions are generated, **Then** the same reading-level and lived-symptom rules apply to every slide caption, not only to the static fields.

### User Story 2 - No generic CTAs; CTAs tie payoff to the audience's pain (Priority: P1)

An advertiser generates an ad whose copy includes a call to action. The **model-authored** CTA wording (the benefit/connector line, the carousel CTA slide, and any CTA text the model composes) is never one of the banned generic phrases ("Learn more," "Sign up now," "Book now," "Get started," "Click here") and instead follows the form `[specific verb] [the offer] → [payoff tied to their pain/outcome]`. The advertiser's own literal CTA input is preserved verbatim and is exempt — the system never rewrites an explicit user-supplied CTA (Principle II).

**Why this priority**: Generic CTAs are a recurring quality leak and an easy, high-confidence win that rides the same fidelity contract. Banning them at the source removes them from every surface at once.

**Independent Test**: Generate ads that include a CTA across cold, retargeting, and carousel paths; confirm none of the banned phrases appear in the **model-authored** CTA wording and that it names a specific action plus a payoff tied to the audience's pain or desired outcome — while confirming a user-supplied literal CTA passes through unchanged.

**Acceptance Scenarios**:

1. **Given** any generation path that emits model-authored CTA wording, **When** copy is generated, **Then** none of the five banned phrases appear verbatim in that generated wording.
2. **Given** model-authored CTA wording is produced, **When** it is inspected, **Then** it pairs a specific action verb with a payoff connected to the audience's stated pain or outcome.
3. **Given** the advertiser supplied an explicit literal CTA (even if it matches a banned phrase), **When** the ad is generated, **Then** that user CTA is preserved verbatim and never rewritten or rejected (Principle II).

### User Story 3 - Persuasive framing is free, but invented verifiable specifics are flagged not blocked (Priority: P2)

An advertiser generates copy. The system writes persuasive **framing** freely — scenarios, hypotheticals, metaphors, illustrative composites — without needing real proof. When it outputs a fabricated **verifiable specific** (a named person's testimonial, an exact figure, a hard count, a star rating, a concrete deadline/quantity), it attaches a non-blocking advisory (a structured `claimFlag` captured in the generation output / trace) reminding the advertiser to be able to back the claim up. It never refuses or deletes the claim, and it does not flag obvious hypotheticals or metaphors.

**Why this priority**: This adds a softer safety-net policy aligned to Meta policy + GCC consumer law that frees *creative framing* while still flagging unbacked specifics. It sits **below** the existing hard compliance guards (numeric-fact and honest-degradation rules), which remain fully in force. Important for compliance posture but secondary to the always-on reading-level / lived-symptom / banned-CTA wins.

**Independent Test**: Generate copy that includes invented specifics and copy that includes only metaphors/hypotheticals; confirm the verifiable specifics carry an advisory while framing-only copy does not, and that no claim is ever removed or blocked.

**Acceptance Scenarios**:

1. **Given** copy containing a fabricated verifiable specific, **When** it is generated, **Then** the copy is still produced in full and a structured `claimFlag` (advisory + one-line reason) is captured in the generation output / trace.
2. **Given** copy containing only metaphors, hypotheticals, or illustrative scenarios, **When** it is generated, **Then** no `claimFlag` is attached and the copy is unchanged.
3. **Given** any fabricated claim, **When** the policy applies, **Then** the claim is never deleted, refused, or blocked.
4. **Given** the existing hard compliance guards (numeric-fact violation repair; honest-degradation "don't invent dates/seats/prices/precise stats" rules), **When** the soft-flag policy is added, **Then** those guards remain fully in force — the soft-flag is a safety net below them, never a relaxation of numeric/identity compliance.

### User Story 4 - Reference and runtime constants stay in lockstep (Priority: P2)

A developer maintaining the copy system changes a copy rule. They edit the reference document first, then update the corresponding exported constant in the same change set, guided by an explicit drift-control marker that names the reference as the source of truth.

**Why this priority**: The reference is a build-time design source that must never be read at runtime; the exported constants are the runtime truth. Without an enforced "edit the reference first, then sync" discipline, the two silently diverge (the "compiled lib going stale" failure mode). Important for long-term integrity but not user-facing on day one.

**Independent Test**: Confirm the constants file carries a top-of-file marker pointing at the reference, that each of the six constants transcribes its named reference section, and that all six are exported and importable by the generator.

**Acceptance Scenarios**:

1. **Given** the constants file, **When** it is opened, **Then** a top-of-file marker names `specs/_shared/COPY_SYSTEM_REFERENCE.md` as the source and instructs editing the reference first, then syncing.
2. **Given** each of the six constants, **When** compared to its named reference section, **Then** the wording faithfully transcribes that section's rules.

### Edge Cases

- **Scoring/rewrite constants defined but not consumed yet**: `COPY_SCORING_DIMENSIONS` and `COPY_REWRITE_DIAGNOSES` are added in this phase as knowledge constants, but the GPT-4o-mini scoring pass and the rewrite loop that consume them are a later track. They MUST be present, exported, and faithful to reference Sections 12–13, but they are NOT wired into any executing code path in this phase. Adding them must not change generation behavior.
- **Banned CTA appears in a non-CTA field**: The ban targets the CTA field. A banned phrase appearing incidentally inside a headline or benefit is governed by the general reading-level/lived-symptom rules, not by a hard CTA reject.
- **Carousel middle slides**: Carousel CTA visibility (last slide only, except low-price Offer/CTA) is already handled by the existing `SHOW_CTA` logic and is unchanged here; the new rules apply to caption *wording* on every slide regardless of CTA visibility.
- **Fidelity contract interaction**: The new rules change only the words emitted at the generation source. They must not alter the number of fields emitted, so the existing copy-fidelity gate, design prompt, and compositor continue to operate unchanged.
- **Existing copy libraries still present**: Existing copywriting constants (hook libraries, frameworks, awareness levels, etc.) remain. The new blocks augment the four named prompt surfaces; they must not delete or contradict the existing guidance in a way that breaks current generation.

## Requirements *(mandatory)*

### Functional Requirements

**Knowledge constants (reference "Required constants — Phase 22" table)**

- **FR-001**: The copywriting knowledge module MUST define and export six constants: `READING_LEVEL_BLOCK`, `LIVED_SYMPTOM_BLOCK`, `FABRICATION_POLICY_BLOCK`, `BANNED_CTA_LIST`, `COPY_SCORING_DIMENSIONS`, and `COPY_REWRITE_DIAGNOSES`.
- **FR-002**: `READING_LEVEL_BLOCK` MUST transcribe the 6th-grade reading-level rule from reference Section 0 and Section 9 — short everyday words, short sentences, no jargon, no abstract nouns; Arabic = simple spoken-style فصحى a 12-year-old would say.
- **FR-003**: `LIVED_SYMPTOM_BLOCK` MUST transcribe the dig-deep / lived-symptom rule from reference Section 0 and Section 9 — never state the problem abstractly; name the exact concrete moment (scene, time of day, recognizable detail) pulled from pain and audience inputs.
- **FR-004**: `FABRICATION_POLICY_BLOCK` MUST transcribe the soft-flag fabrication policy from reference Section 0 and Section 4 — invent **framing** (scenarios, hypotheticals, metaphors, illustrative composites) freely; attach a non-blocking advisory only to fabricated verifiable specifics (named person, exact figure, hard count, star rating, concrete deadline/quantity); never block, delete, or refuse; do not flag obvious hypotheticals or metaphors. The block frees creative framing only — it MUST NOT relax numeric/identity compliance.
- **FR-004a**: The soft-flag policy MUST be **additive**. The existing hard compliance guards — the `captionValidator.ts` NUMERIC FACT VIOLATION repair and the `hookAnglesKnowledge.ts` honest-degradation rules ("don't invent dates/seats/prices/precise stats") — MUST remain fully in force and unchanged. The soft-flag operates as a safety net below them.
- **FR-004b**: When the model outputs a fabricated verifiable specific, the resulting advisory MUST be captured as a **structured `claimFlag`** (carrying a one-line reason) in the generation output / `resolutionTrace`, as an additive field — not as inline prose only.
- **FR-005**: `BANNED_CTA_LIST` MUST contain exactly the five banned CTA phrases from reference Section 8: "Learn more," "Sign up now," "Book now," "Get started," "Click here."
- **FR-006**: `COPY_SCORING_DIMENSIONS` MUST transcribe the 1–10 scoring rubric from reference Section 12, including the two hard dimensions (reading level ≤6th grade and lived-symptom depth, each rejecting below 7) and the pass condition.
- **FR-007**: `COPY_REWRITE_DIAGNOSES` MUST transcribe the diagnosis→fix rewrite table from reference Section 13, including the two new rows ("Above 6th grade" and "Surface-level") and the max-2-pass rule.

**Wiring into prompt surfaces (reference "Consumed by" column + Section 2)**

- **FR-008**: The three quality rule blocks (`READING_LEVEL_BLOCK`, `LIVED_SYMPTOM_BLOCK`, `FABRICATION_POLICY_BLOCK`) MUST be applied to all four on-creative-copy prompt surfaces in the generator: the system tone-of-voice surface, the hook-generation rules surface, the carousel slide-caption prompt, and the retargeting rules surface.
- **FR-009**: `BANNED_CTA_LIST` MUST be applied as **prompt guidance** to the points where the model authors CTA wording (the benefit/connector line, the carousel CTA slide, and any model-composed CTA text) so that **generated** CTA wording never uses the five banned phrases. Enforcement is prompt-only in this phase — no post-generation detect/reject/replace guard (that belongs to the later scoring/rewrite track). The advertiser's explicit literal CTA input (`inputs.cta`) MUST NOT be overridden, rewritten, or rejected, even if it matches a banned phrase (Principle II).
- **FR-010**: The Track 1 system instruction from reference Section 18 MUST be added to the tone-of-voice generation prompt, stated for the current fixed 4-field model (the four rules: 6th-grade level, lived symptom, soft fabrication flag, banned-CTA + CTA formula), without changing the number or structure of emitted fields.
- **FR-011**: The new rules MUST apply to every on-creative copy field — headline, subheadline, CTA, benefit — and to every carousel slide caption, consistent with reference Section 9 and Section 18.

**Propagation & non-interference (reference Section 1)**

- **FR-012**: Copy quality MUST be improved only at the generation source; the feature MUST NOT add any manual design-phase wiring, and MUST rely on the existing copy-fidelity contract to carry exact strings to the rendered image.
- **FR-013**: The feature MUST NOT change the number of fields emitted, the copy-fidelity gate, the design/image prompt, the compositor, or any Step-2 UI.
- **FR-014**: `COPY_SCORING_DIMENSIONS` and `COPY_REWRITE_DIAGNOSES` MUST NOT be wired into any executing code path in this phase; defining them MUST NOT change generation behavior.

**Drift control (reference "Drift rule")**

- **FR-015**: The constants file MUST carry a top-of-file marker naming `specs/_shared/COPY_SYSTEM_REFERENCE.md` as the source of truth and instructing maintainers to edit the reference first, then sync the constants.
- **FR-016**: The application MUST NOT read, parse, or load the reference `.md` file at runtime; the exported constants are the only runtime truth.

**Scope exclusions (reference Sections 2, 15, 16, 17)**

- **FR-017**: The feature MUST NOT introduce the creative-text director module, the Step-2 UI dropdowns, the hook-angle/type/awareness option constants, the static/carousel structure constants, the conditional field-count behavior, the "generate 4 more like this" variation behavior, or the fresh-hooks anti-sameness changes. These are Phase 23 / Track 2.

### Key Entities *(include if feature involves data)*

- **Quality rule block**: A reusable, exported text constant capturing one product-owner copy rule (reading level, lived-symptom depth, or fabrication policy) in language suitable for injection into a generation prompt. Maps 1:1 to a named reference section.
- **Banned CTA list**: An exported list of the five generic CTA phrases the model is instructed not to author; it constrains model-generated CTA wording only, never the advertiser's literal CTA input.
- **Scoring rubric / rewrite-diagnosis knowledge**: Exported knowledge constants describing how copy is scored (15 dimensions, two hard) and how failing copy is diagnosed and fixed; defined now, consumed later.
- **Prompt surface**: One of the four generation entry points that produce on-creative copy — system tone-of-voice, hook-generation rules, carousel caption prompt, retargeting rules — into which the rule blocks and banned list are injected.
- **claimFlag**: An additive, structured advisory recorded on the generation output / `resolutionTrace` when a fabricated verifiable specific is produced — carries a one-line reason and is non-blocking. Captures (does not enforce) the fabrication policy this phase.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a sample of generated ads across at least three offer types and both supported languages, 100% of emitted copy fields read at a 6th-grade level or below (short everyday words, short sentences, no jargon/abstract nouns; Arabic = simple spoken فصحى).
- **SC-002**: In the same sample, every copy field expresses the problem/desire as a concrete lived moment rather than an abstract category, traceable to the pain or audience inputs.
- **SC-003**: Across all generation paths that emit **model-authored** CTA wording (cold, retargeting, carousel), 0% of that generated wording uses any of the five banned phrases, and it pairs a specific verb with a payoff tied to the audience's pain/outcome. User-supplied literal CTAs are exempt and preserved verbatim (Principle II).
- **SC-004**: 100% of copy containing a fabricated verifiable specific carries a structured `claimFlag` (with reason) in the generation output/trace; 0% of such copy is blocked, deleted, or refused; copy containing only framing/metaphor/hypothetical carries no `claimFlag`; and the existing numeric-fact and honest-degradation guards still fire on their existing triggers (the soft-flag did not relax them).
- **SC-005**: The new rules apply uniformly to all four prompt surfaces and to carousel slide captions, verified by sampling output from each surface.
- **SC-006**: Generating an ad with the new rules in place produces the same number and arrangement of copy fields as before this phase (no field-count or structure change), confirming the fidelity contract, gate, and compositor are untouched.
- **SC-007**: The reference document and the six exported constants are mutually consistent at merge time (the constants faithfully transcribe their named reference sections), and the constants file carries the drift-control marker.
- **SC-008**: No Phase 23 artifact (director module, UI dropdowns, option/structure constants, variation/anti-sameness behavior) is present in the change set.

## Assumptions

- The existing copy-fidelity contract (spec 005) and its gate, design prompt, and compositor behave as documented in reference Section 1 and require no changes for copy *quality* to propagate; only field *count* changes would touch them, and those are out of scope.
- The four prompt surfaces named in the reference (`SYSTEM_TOV`, `HOOK_GENERATION_RULES`, the carousel prompt, `RETARGETING_RULES`) are the complete and correct set of on-creative-copy generation surfaces for static-image and carousel ads; no additional surface needs the rules in this phase.
- "≤6th-grade reading level" is enforced as prompt guidance in this phase. Automated reading-level scoring (the scoring pass) is a later track; this phase ships the rule and the knowledge constant, not the scoring engine.
- Arabic reading-level guidance ("simple spoken فصحى a 12-year-old would say") is expressed within the rule block text and relies on the model honoring it; existing Arabic RTL validation and cultural-compliance guardrails remain in force and unchanged.
- The fabrication advisory is produced via prompt instruction (the model emits the flag) and is captured as a structured `claimFlag` on the generation output / `resolutionTrace` (an additive field). A separate automated claim-*detection* / scoring mechanism is part of the later scoring track and is not built here.
- The feature touches the backend generator, the copywriting knowledge module, and the generation-output/`resolutionTrace` shape (one additive `claimFlag` field). No frontend, billing, copy-fidelity-gate, design-prompt, or compositor changes are required; the field-count and structure are unchanged (FR-013).
- The existing hard compliance guards (`captionValidator.ts` numeric-fact repair; `hookAnglesKnowledge.ts` honest-degradation rules) stay exactly as-is; the soft-flag policy is layered below them, not in place of them.
- Existing copywriting constants and libraries remain in place; the new blocks augment rather than replace them on the four named surfaces.
