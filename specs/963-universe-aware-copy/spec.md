# Feature Specification: Universe-Aware Copy

**Feature Branch**: `963-universe-aware-copy`
**Created**: 2026-06-25
**Status**: Draft
**Input**: User description: "Phase 27 — Universe-Aware Copy. When a FANTASY universe is selected, Gemini copy generation should include a subtle metaphor in the copy (headline, subheadline, CTA, or benefit — Gemini decides) that connects the hook to the universe theme, and the blueprint must describe that metaphor visually so the image renders it coherently. Realistic and minimal universes stay literal."

---

## Overview *(plain-language summary for the founder)*

Today, every ad's written copy stays strictly literal no matter which "universe" (visual world) the user picks. A hard rule in the copy-generation step — the **METAPHOR RULE** — tells the AI: *"the universe is for the picture only; never let the universe theme leak into the words."* This was the right call for realistic universes (a doctor's office, a modern kitchen), where a metaphor would sound forced or confusing.

But the product also offers ~500 **fantasy** universes (mythic battlefields, ancient kingdoms, space frontiers, anime worlds). For those, the strictly-literal rule throws away the whole point of the fantasy world: the words and the picture feel disconnected. The picture shows a warrior-king on a battlefield, but the copy reads like a plain business ad.

**Phase 27** changes one thing: when the chosen universe is a **fantasy** universe, the copy AI is now *allowed* (not forced into a story, just allowed a light touch) to weave **one subtle, evocative word or short phrase** that echoes the universe into the copy — and the visual blueprint is told to render a matching visual element so the picture and the words agree. For **realistic** and **minimal** universes, nothing changes: the strict literal rule stays exactly as it is today.

This is a backend copy-prompt change only. There is no new screen, no new button, no pricing change, and no database schema change. Every decision is recorded in the existing per-generation audit trail (the resolution trace) so the founder and reviewers can see, for any ad, whether a universe metaphor was applied and why.

---

## Clarifications

### Session 2026-06-25

- Q: What does `universeAwareCopy.applied: true` assert — that the relaxed rule was emitted into the copy prompt, or that a metaphor was verified present in the output? → A: **Rule emitted (prompt-level)**. `applied: true` means the relaxed metaphor instruction was injected into the copy prompt for an eligible (fantasy, non-suppressed) run. It records the DECISION, not the model's obedience — matching the Phase 19 gaze / Phase 28 expression trace precedent. It is deterministic and testable by inspecting the assembled prompt. Output-quality measures (e.g. "exactly one subtle metaphor appeared") are QA/manual checks, not automated trace assertions.
- Q: When the reason is not fantasy-derived (e.g. `text-only-mode`, or `reference-ad-override` on a non-fantasy universe), what should `styleFamily` carry? → A: **Always the resolved family**. `styleFamily` always carries the actually-resolved family (`'fantasy' | 'realistic' | 'minimal'`) even when the metaphor is suppressed; `reason` explains the suppression. (e.g. a suppressed fantasy run records `styleFamily: 'fantasy', applied: false, reason: 'reference-ad-override'`.) The field is never null.
- Q: Is the "at most one subtle metaphor" subtlety limit a hard enforced cap or advisory guidance? → A: **Advisory (prompt guidance only)**. The relaxed rule steers the AI toward one subtle word/short phrase and away from full themed sentences, but there is NO new post-generation enforcement/rejection pass. Over-aggressive output is a QA-caught quality issue, consistent with how every other copy-style rule works today and with the "no new parallel path" constraint.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fantasy universe gets a subtle, coherent metaphor (Priority: P1)

A user generates an ad and selects a **fantasy** universe (for example a mythic-epic battlefield world) with a pricing/competition hook. The generated copy now carries one light, evocative touch that echoes the world (e.g. a single word like "battlefield" / "ساحة المعركة" used as a metaphor for the competitive market), and the picture's blueprint describes a matching visual element (e.g. the hero standing in an arena holding a price scroll) so the rendered image and the words feel like the same world.

**Why this priority**: This is the entire purpose of the phase. Without it, fantasy universes deliver disconnected copy + image. It is the MVP — if only this ships, the feature delivers value.

**Independent Test**: Generate a single ad with any fantasy universe and a hook. Confirm (a) the assembled copy prompt carries the relaxed metaphor instruction (the strict rule is NOT emitted), (b) the build plan / blueprint describes a visual element matching the metaphor, (c) the resolution trace records `universeAwareCopy.applied: true` with `styleFamily: 'fantasy'`, and (d) — as a QA/manual quality check, not an automated trace assertion — the copy reads with at most one subtle universe-echoing word/phrase (not a full thematic sentence, not a sci-fi story).

**Acceptance Scenarios**:

1. **Given** a fantasy universe is selected and a hook is active, **When** the copy prompt is assembled, **Then** the relaxed metaphor instruction is emitted (and the strict anti-metaphor rule is NOT), permitting at most one subtle universe-echoing word or short phrase that still makes complete sense to a reader who never sees the image.
2. **Given** the copy carries a universe metaphor, **When** the build plan / blueprint is produced, **Then** the blueprint describes a concrete visual element that renders that metaphor coherently in the image.
3. **Given** a fantasy universe generation completes, **When** the resolution trace is written, **Then** it contains `universeAwareCopy: { applied: true, styleFamily: 'fantasy', reason: 'fantasy-universe-metaphor-active' }`.
4. **Given** a fantasy universe, **When** copy is generated, **Then** as a QA/manual quality check the copy is NOT a multi-sentence themed narrative and does NOT depend on the image to be understood (advisory subtlety guardrail — prompt-steered, not code-enforced).

---

### User Story 2 - Realistic and minimal universes stay strictly literal (Priority: P1)

A user generates an ad with a **realistic** universe (e.g. a modern clinic) or with the **minimal** style family. The copy stays exactly as literal and direct as it is today — no universe vocabulary, no metaphor — preserving the current proven behavior.

**Why this priority**: This is the safety contract. A regression here (metaphors bleeding into realistic/minimal copy) would degrade the dominant, proven path. It is co-critical with Story 1 — the feature is only acceptable if literal universes are demonstrably unchanged.

**Independent Test**: Generate ads with a realistic universe and separately with the minimal family. Confirm the copy contains no universe vocabulary or metaphor, behaves identically to pre-Phase-27 output, and the resolution trace records `applied: false` with the correct literal reason.

**Acceptance Scenarios**:

1. **Given** a realistic universe is selected, **When** copy is generated, **Then** the copy stays literal with no universe metaphor, and the trace records `universeAwareCopy: { applied: false, styleFamily: 'realistic', reason: 'realistic-no-metaphor' }`.
2. **Given** the minimal style family is selected, **When** copy is generated, **Then** the copy stays literal with no universe metaphor, and the trace records `universeAwareCopy: { applied: false, styleFamily: 'minimal', reason: 'minimal-no-metaphor' }`.
3. **Given** a realistic or minimal generation, **When** the copy prompt is assembled, **Then** the existing strict anti-metaphor METAPHOR RULE is emitted unchanged (byte-for-byte equivalent to today).

---

### User Story 3 - Reference ad suppresses the metaphor (Priority: P2)

A user provides a **reference ad** and also has a fantasy universe selected. Because a reference ad overrides everything below it in the visual precedence chain (including the universe), the universe metaphor is fully suppressed — the copy follows the reference ad, not the fantasy world.

**Why this priority**: Protects the established precedence contract. Lower than P1 because it is a guard on an edge combination, but it must hold to avoid contradicting the documented precedence chain.

**Independent Test**: Generate a fantasy-universe ad WITH a reference ad attached. Confirm no universe metaphor appears and the trace records `reason: 'reference-ad-override'` with `applied: false`.

**Acceptance Scenarios**:

1. **Given** a reference ad is provided AND a fantasy universe is selected, **When** copy is generated, **Then** no universe metaphor is added and the trace records `universeAwareCopy: { applied: false, styleFamily: 'fantasy', reason: 'reference-ad-override' }`.

---

### User Story 4 - Carousel applies the metaphor only on the hook slide (Priority: P2)

A user generates a **carousel** with a fantasy universe. The metaphor appears only on the hook slide (slide 1). Every subsequent slide stays literal so the carousel reads cleanly and the theme does not become repetitive or overbearing.

**Why this priority**: Defines correct multi-slide behavior. Important for carousel quality but narrower in scope than the single-ad core.

**Independent Test**: Generate a fantasy-universe carousel. Confirm slide 1 copy may carry the metaphor while slides 2+ stay literal, and each slide's trace reflects this (`fantasy-universe-metaphor-active` for slide 1; `carousel-non-hook-slide` for slides 2+).

**Acceptance Scenarios**:

1. **Given** a fantasy-universe carousel, **When** slide 1 (hook slide) copy is generated, **Then** it may carry one subtle metaphor and its trace records `applied: true, reason: 'fantasy-universe-metaphor-active'`.
2. **Given** a fantasy-universe carousel, **When** slides 2+ copy is generated, **Then** they stay literal and their trace records `applied: false, reason: 'carousel-non-hook-slide'`.

---

### User Story 5 - Text-only mode never adds a metaphor (Priority: P3)

A user generates in **text-only** mode (no rendered universe scene). Because there is no universe being rendered, no metaphor is added regardless of the selected style family.

**Why this priority**: A clean no-op guard for a mode where the metaphor would have nothing visual to anchor to. Low risk, low frequency, but must be correct.

**Independent Test**: Generate in text-only mode with a fantasy universe selected. Confirm no metaphor is added and the trace records `reason: 'text-only-mode'`.

**Acceptance Scenarios**:

1. **Given** text-only mode, **When** copy is generated, **Then** no universe metaphor is added and the trace records `universeAwareCopy: { applied: false, reason: 'text-only-mode' }`.

---

### User Story 6 - Custom (user-typed) fantasy universe still works (Priority: P3)

A user types their **own custom universe** description and the style family resolves to fantasy. The metaphor still applies, drawing its vocabulary from the user's custom universe text rather than a catalog entry.

**Why this priority**: Ensures the feature is keyed on the resolved style family, not on a fixed catalog lookup, so custom universes are not silently excluded.

**Independent Test**: Generate with a custom fantasy universe description. Confirm a subtle metaphor consistent with the custom text appears and the trace records `applied: true, styleFamily: 'fantasy'`.

**Acceptance Scenarios**:

1. **Given** a custom universe with fantasy style family, **When** copy is generated, **Then** a subtle metaphor drawn from the custom universe text appears and the blueprint describes it visually, with the trace recording `applied: true, styleFamily: 'fantasy'`.

---

### Edge Cases

- **Batch mode**: Different hooks across batch items naturally produce different metaphors; different concepts translate each hook differently. No special batch logic is required — each item resolves its own metaphor state independently through the same shared copy path.
- **Unknown / missing style family**: If the resolved style family is anything other than `fantasy` (including absent, unrecognized, or defaulted), the system treats it as literal (no metaphor) — the same safe default as realistic/minimal.
- **Fantasy universe but no hook active**: The metaphor still anchors to the universe theme; absence of a specific hook angle must not cause an error or an empty/forced metaphor. (If no copy scenario benefits, Gemini may choose to keep it literal — the relaxation is permissive, not mandatory.)
- **Over-aggressive metaphor**: If the AI produces a full thematic sentence or a metaphor that only makes sense with the image, that violates the subtlety guardrail and must be treated as a failure of the relaxed rule, not acceptable output.
- **Realistic/minimal regression**: Any universe vocabulary appearing in realistic or minimal copy is a hard failure.
- **Reference ad + fantasy + carousel**: Reference-ad suppression takes precedence over the carousel hook-slide rule — suppression wins.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST relax the existing copy-generation anti-metaphor rule ONLY when the resolved style family is `fantasy`, permitting one subtle, evocative universe-echoing word or short phrase in the copy.
- **FR-002**: The system MUST keep the existing strict anti-metaphor METAPHOR RULE fully intact (unchanged behavior) for `realistic` and `minimal` style families, and for any unrecognized/absent style family (literal default).
- **FR-003**: The metaphor placement MUST be left to the copy AI's judgement across headline, subheadline, CTA, or benefit text — there is no fixed field priority.
- **FR-004**: The relaxed rule MUST steer toward subtlety as ADVISORY prompt guidance (not a code-enforced cap): at most one evocative word or short phrase, NOT a full thematic sentence and NOT a multi-sentence narrative; the copy MUST still make complete sense to a reader who never sees the image. No new post-generation enforcement/rejection pass is introduced — over-aggressive output is a QA-caught quality issue.
- **FR-005**: When the copy carries a universe metaphor, the rendered-image prompt MUST instruct the renderer to describe a concrete matching visual element so the image renders the metaphor coherently. **As-built**: the visual-coherence block is injected into the shared image-prompt assembly point `buildFinalImagePrompt()` (after the `BLUEPRINT:` line, Phase 19 gaze pattern), so it reaches every render path.
- **FR-006**: Metaphor vocabulary MAY be informed by the selected universe's existing descriptive attributes (visual motifs, aspiration signals, tone) and by a custom universe's user-typed text.
- **FR-007**: When a reference ad is present, the system MUST suppress the metaphor entirely regardless of style family (reference ad overrides the universe per the existing visual precedence chain).
- **FR-008**: In carousel mode, the metaphor MUST be allowed only on the hook slide (slide 1); all subsequent slides MUST stay literal.
- **FR-009**: In text-only mode, the system MUST NOT add a metaphor (no universe is rendered).
- **FR-010**: In batch mode, the system MUST require no special-case logic — each batch item resolves its own metaphor state through the shared copy path.
- **FR-011**: The relaxation MUST flow through a single shared decision module (the pure mapper) consumed at the existing emission sites (the two `generateTOV` copy-rule sites + the blueprint visual-coherence injection in `buildFinalImagePrompt()` + the trace write in `generateFinalAd()`) — multiple emission sites are expected, but no new *parallel* copy-generation path may be created. The decision logic lives in exactly one place; only the strict-vs-relaxed text swap (copy) and the gated additive injection (blueprint) are applied at each existing site.
- **FR-012**: The system MUST record a `universeAwareCopy` sub-object on the resolution trace for every generation, with fields `applied` (boolean), `styleFamily` (`'fantasy' | 'realistic' | 'minimal'`), and `reason` (string). `applied: true` means the relaxed metaphor instruction was EMITTED into the copy prompt (a prompt-level decision record, NOT a verification that a metaphor appeared in the output) — matching the Phase 19 gaze / Phase 28 expression trace precedent.
- **FR-013**: The `reason` value MUST accurately reflect the decision path, using the canonical set: `fantasy-universe-metaphor-active`, `realistic-no-metaphor`, `minimal-no-metaphor`, `reference-ad-override`, `text-only-mode`, `carousel-non-hook-slide`.
- **FR-013a**: The `styleFamily` field MUST always carry the actually-resolved family (`'fantasy' | 'realistic' | 'minimal'`), never null, even when the metaphor is suppressed for another reason (e.g. a suppressed fantasy run records `styleFamily: 'fantasy', applied: false` with the suppressing `reason`).
- **FR-014**: The change MUST NOT restructure the image-generation prompt assembly or alter existing logic in `buildFinalImagePrompt()`, and MUST NOT edit the gaze (Phase 19) or expression (Phase 28) blocks. **As-built clarification**: adding ONE additive, gated (`applied:true`-only), reversible blueprint visual-coherence injection block into `buildFinalImagePrompt()` — the same single-shared-injection-point pattern Phase 19 (gaze) and Phase 28 (expression image-block) already use — IS permitted and is the chosen site; it carries blueprint content through the assembly point without changing existing structure, and is subordinate to the existing identity / costume / composition rules.
- **FR-015**: The change MUST NOT alter copy-fidelity validation behavior — the metaphor lives within the copy the AI authors and is still subject to the existing fidelity contract unchanged.
- **FR-016**: The feature MUST be fully reversible: restoring the strict rule for fantasy (and neutralizing the trace decision) MUST return output to byte-equivalent pre-Phase-27 behavior, with replaced rule text retained (commented) rather than deleted.

### Non-Functional / Guardrail Requirements

- **NFR-001**: No frontend change — the universe selection UI is untouched.
- **NFR-002**: No new backend callable and no change to existing callable signatures.
- **NFR-003**: No Firestore schema migration — the `universeAwareCopy` trace field is additive and optional; legacy generations without it are valid.
- **NFR-004**: No pricing, plan-gating, or credit change — the feature is available wherever copy generation already runs.
- **NFR-005**: Arabic-first copy quality rules (no leading و, self-contained phrasing, cultural-compliance guardrails) MUST be preserved; the metaphor must respect them.

### Key Entities

- **Style Family**: The resolved visual world category for a generation — one of `fantasy`, `realistic`, or `minimal`. The single controller for whether the metaphor is permitted. Resolved from existing inputs; minimal is a style-family setting, not a catalog universe.
- **Universe**: The selected visual world (catalog entry or custom user text), carrying descriptive attributes (visual motifs, aspiration signals, tone) that can inform metaphor vocabulary. Already available to the copy prompt.
- **Universe Metaphor**: At most one subtle evocative word or short phrase in the copy that echoes the universe theme; paired with a blueprint visual element so the image renders it coherently.
- **Resolution Trace `universeAwareCopy`**: The additive per-generation audit record of the metaphor DECISION (prompt-level, not output verification) — `applied` (was the relaxed instruction emitted), `styleFamily` (always the resolved family, never null), `reason` (canonical decision-path string).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of fantasy-universe single-ad generations (reference ad absent, not text-only), the assembled copy prompt emits the relaxed metaphor instruction and the trace records `applied: true` (automated/deterministic check); and on QA/manual review the copy reads with at most one subtle universe-echoing word or short phrase with the blueprint describing a matching visual element (quality check, not an automated trace assertion).
- **SC-002**: In 100% of realistic and minimal generations, the strict anti-metaphor rule is emitted and the copy contains zero universe metaphors — identical to pre-Phase-27 output.
- **SC-003**: In 100% of generations where a reference ad is present, no universe metaphor appears regardless of style family.
- **SC-004**: In 100% of fantasy-universe carousels, the metaphor appears only on slide 1; slides 2+ contain zero metaphors.
- **SC-005**: In 100% of text-only generations, no universe metaphor appears.
- **SC-006**: 100% of generations write a `universeAwareCopy` trace sub-object whose `reason` matches the actual decision path from the canonical reason set.
- **SC-007**: On QA/manual review, zero fantasy-universe copy outputs are multi-sentence themed narratives or depend on the image to be understood (advisory subtlety guardrail holds; this is a prompt-steered quality target, not a code-enforced gate).
- **SC-008**: Disabling the feature (restoring the strict rule for fantasy) returns realistic, minimal, and fantasy copy to byte-equivalent pre-Phase-27 output — proving full reversibility.

---

## Assumptions

- The resolved style family (`fantasy` / `realistic` / `minimal`) and the resolved universe string are already available at the copy-prompt assembly point and require no new plumbing.
- "Minimal" is a style-family setting, not a catalog universe entry; it is always treated as literal.
- The founder's latest direction supersedes the older launch-matrix note that restricted the metaphor to "subheadline or benefit (not headline)." Per the confirmed decisions, placement is now Gemini's choice across headline, subheadline, CTA, or benefit. (Recorded here because the two sources differ; the founder's confirmed decision is authoritative.)
- The metaphor relaxation is **permissive, not mandatory**: for fantasy universes the AI is allowed to use a subtle metaphor; if no copy scenario benefits, the AI may still keep a given field literal. The success criteria treat the presence of at most one subtle metaphor (or a justified literal choice) as conforming — the failure mode is an over-aggressive metaphor or a metaphor leaking into realistic/minimal.
- The blueprint already flows into the image-generation path; Phase 27 enriches it via ONE additive gated injection block at the shared assembly point `buildFinalImagePrompt()` (Phase 19/28 pattern) and does not restructure the builder's existing logic.
- Custom universes resolve a style family the same way catalog universes do; a fantasy custom universe is eligible for the metaphor.
- Reference-ad suppression sits above the universe in the existing visual precedence chain and therefore overrides the carousel hook-slide rule when both apply.

---

## Out of Scope

- Any frontend / universe-selection UI change.
- New Firebase callables or changes to existing callable signatures.
- Firestore schema migrations (the trace field is additive/optional).
- Changes to the gaze-direction (Phase 19) or expression (Phase 28) prompt blocks.
- Structural changes to the final image-prompt builder's existing logic, or any change to copy-fidelity validation. (One additive, gated, reversible blueprint injection block at the shared assembly point is in scope per FR-014.)
- Pricing, plan-gating, or credit changes.
- Art-direction-driven (as opposed to style-family-driven) metaphor control — the controller is explicitly the universe's style family.

---

## Dependencies

- Requires the Phase 5 generation pipeline (copy generation + build plan + resolution trace) to be in place — it is.
- Relies on the existing single copy-prompt assembly point and the existing resolution-trace writer.

---

## Delivery Gate Order *(process — must follow)*

implement → build → test → commit → push → PR → CodeRabbit (fix ALL comments) → Claude audit → test on `npm run dev` (localhost) → merge via GitHub UI → deploy functions → production test.
