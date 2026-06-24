# Feature Specification: Expression Adaptation (Phase 28)

**Feature Branch**: `phase-28-expression-adaptation`
**Spec Folder**: `028-expression-adaptation`
**Created**: 2026-06-23
**Status**: Draft
**Input**: User description: "Add expression adaptation instructions to the generation prompt, mapped to the hook angle. The model preserves face identity correctly but does NOT adapt the facial expression to match the hook's emotional context (e.g., a pain hook produces a smiling hero). Identity stays priority #1; expression adaptation is priority #2; art-direction pose is #3. Blend art-direction character with hook emotion. Handle retargeting objections, before/after split, carousel, batch, and no-uploaded-face cases."

## Why This Matters

When an advertiser uploads their photo and writes a pain hook — *"هل تشعر بالقهر حين يسبقك مدربون أضعف؟"* ("Do you feel crushed when weaker trainers surpass you?") — the generated hero currently smiles brightly. The face is correctly *theirs* (identity is protected), but the emotion contradicts the message. A worried fear hook produces a relaxed, happy hero. This emotional mismatch makes the creative feel inauthentic and weakens the ad's persuasive pull. Phase 28 makes the hero's facial **expression** follow the emotional intent of the hook, while keeping the hero's **identity** pixel-faithful.

## Clarifications

### Session 2026-06-23

- Q: For the 5 hook-angle IDs that exist in code but were absent from the original mapping table (`emotional, statistics, scarcity, logical_authority, future_based`), which expression mapping should be used? → A: Use the recommended per-angle defaults (emotional → empathetic/heartfelt; statistics → sober analytical; scarcity → urgent/alert; logical_authority → commanding/assured; future_based → aspirational/hopeful).
- Q: Should the hook-to-expression mapping be injected as a rigid override block in the TECHNICAL_PROMPT, or feed the concept-generation step? → A: It must NOT be a rigid prompt injection. The mapping is **guidance input** to the concept/blueprint generation step. The chosen emotional direction informs the blueprint's `MOOD_EMOTION` and `SUBJECT_ACTION` fields, where Gemini crafts a concept-specific expression; that expression then flows naturally into the `TECHNICAL_PROMPT` during blueprint synthesis. Each of the 3 concepts may interpret the same hook emotion differently (e.g., pain → "frustrated" in concept 1, "intensely determined" in concept 2). Identity protection remains a TECHNICAL_PROMPT rule and stays priority #1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pain hook produces an emotionally congruent hero (Priority: P1)

An advertiser selects a pain-amplification hook angle and generates a single static ad with their uploaded photo. The hero's face shows quiet concern/frustration consistent with the pain message, while remaining unmistakably the same person from the uploaded photo.

**Why this priority**: This is the core defect the phase exists to fix and the most common, most visible failure. Delivering only this story already produces a viable improvement.

**Independent Test**: Generate a single ad with an uploaded face and a pain-angle hook; verify the hero is not smiling and shows concern/frustration, and that bone structure/features match the uploaded photo.

**Acceptance Scenarios**:

1. **Given** an uploaded hero photo with a neutral or smiling expression and a pain hook angle, **When** the ad is generated, **Then** the hero shows concern/frustration (slight frown, tired eyes, jaw tension — not anger) and NOT a bright smile.
2. **Given** the same uploaded photo, **When** comparing the generated hero to the source photo, **Then** the bone structure, facial features, and skin texture are unchanged — only the expression differs.
3. **Given** a pain hook, **When** concept generation runs, **Then** the pain emotional direction is supplied as guidance and the resulting blueprint's `MOOD_EMOTION`/`SUBJECT_ACTION` describe a concern/frustration expression, which carries into the synthesized technical prompt without overriding the face-identity rules.

---

### User Story 2 - Every hook angle drives its mapped expression (Priority: P1)

An advertiser using any available hook angle (not just pain) gets a hero whose expression matches that angle's emotional intent — determination for aspiration-style angles, intrigue for curiosity, alert intensity for urgency, analytical focus for logic, confident pride for social proof, and so on.

**Why this priority**: Without full coverage, only one angle is fixed and the rest still produce mismatched emotion. The mapping must cover the actual hook-angle set that exists in the product.

**Independent Test**: For each available hook angle, generate an ad and confirm the angle's emotional direction was supplied to concept generation and the rendered hero reflects it.

**Acceptance Scenarios**:

1. **Given** a curiosity hook, **When** generated, **Then** the hero shows intrigue/thoughtfulness (raised eyebrow, slight head tilt, studying look).
2. **Given** an urgency hook, **When** generated, **Then** the hero shows alert intensity (focused eyes, compressed lips, ready-to-act energy).
3. **Given** a logic hook, **When** generated, **Then** the hero shows analytical clarity (focused, evaluating, neutral mouth, sharp eyes).
4. **Given** ANY hook angle that exists in the product's hook-angle list, **When** generated, **Then** that angle resolves to a defined emotional direction supplied to concept generation (no angle falls through to "no guidance").

---

### User Story 3 - Retargeting objections drive expression (Priority: P2)

An advertiser running a retargeting campaign selects an objection (e.g., price, trust/been-burned, no-time). The hero's expression matches the objection's emotional posture (analytical for price, reassuring for trust, urgent for timing, confident/approachable as the fallback).

**Why this priority**: Retargeting is a distinct, gated (Pro+) generation path that does not use cold hook angles. It must be covered so the feature is consistent across campaign types, but it serves fewer generations than cold-traffic angles.

**Independent Test**: Generate a retargeting ad for each objection family and confirm the mapped expression appears in the technical prompt and in the rendered hero.

**Acceptance Scenarios**:

1. **Given** a price/budget/payment objection, **When** generated, **Then** the hero shows analytical, evaluating expression.
2. **Given** a trust/been-burned/tried-before objection, **When** generated, **Then** the hero shows reassuring, confident expression.
3. **Given** a timing/no-time/not-ready objection, **When** generated, **Then** the hero shows urgent, focused expression.
4. **Given** any objection with no specific mapping, **When** generated, **Then** the hero shows the fallback confident, approachable expression.

---

### User Story 4 - Art-direction character blends with hook emotion (Priority: P2)

An advertiser using a strong art direction (e.g., a "mythic/epic" look that already implies "visionary, powerful, determined") with a pain hook gets a hero whose expression blends both — e.g., "powerful concern", not a flat "concerned" that erases the art direction's character, and not a generic smile that ignores the hook.

**Why this priority**: Without blending, the new emotional-direction guidance would either fight the art direction or be overridden by it, regressing the look advertisers chose.

**Independent Test**: Generate the same hook under two art directions with distinct character; confirm the expression reflects the hook emotion expressed through each art direction's character.

**Acceptance Scenarios**:

1. **Given** an art direction that specifies a character/energy AND a hook with an emotion, **When** generated, **Then** the blueprint's expression combines the art direction's character with the hook's emotion (character sets the *style*, hook sets the *emotion*).
2. **Given** an art-direction pose block, **When** the emotional direction is supplied to concept generation, **Then** the pose block is unchanged and the resulting expression does not contradict the pose.

---

### User Story 5 - Before/after split shows emotional contrast (Priority: P2)

An advertiser using before/after split-screen gets a hero whose BEFORE half carries the hook's problem emotion (e.g., pain/fear) and whose AFTER half carries an aspirational, confident expression — creating a visible emotional transformation across the divider, with the same face on both halves.

**Why this priority**: Before/after is a distinct composition with two emotional states in one image; getting it wrong undermines the format's whole point.

**Independent Test**: Generate a before/after ad with a pain hook; confirm the before half reads as the problem emotion and the after half reads as confident/determined, same identity on both halves.

**Acceptance Scenarios**:

1. **Given** a before/after selection with a problem-oriented hook, **When** generated, **Then** the BEFORE half shows the hook's emotion and the AFTER half shows an aspirational/confident expression.
2. **Given** before/after, **When** the prompt is produced, **Then** the new emotional-direction guidance is consistent with (does not contradict) the existing before/after composition rules.

---

### User Story 6 - Carousel and batch behave per their nature (Priority: P3)

A carousel keeps one consistent expression across all slides (same hook → same emotion). A batch run, where each item may carry a different hook from anti-sameness rotation, gives each item the expression for its own hook.

**Why this priority**: These are multi-output paths; consistency (carousel) and per-item variation (batch) must follow the same expression logic without surprises, but they build on the single-image behavior already covered above.

**Independent Test**: Generate a carousel and confirm all slides share one expression; generate a batch with rotating hooks and confirm each item's expression matches its own hook.

**Acceptance Scenarios**:

1. **Given** a carousel with a single hook, **When** generated, **Then** every slide uses the same mapped expression.
2. **Given** a batch where items carry different hooks, **When** generated, **Then** each item's hero uses the expression mapped to that item's hook.

---

### Edge Cases

- **No hook angle selected**: No emotional-direction guidance is added; the blueprint's default mood/expression behavior applies (current behavior — no regression).
- **No uploaded face (AI-generated hero, no reference photo)**: The emotional-direction guidance still applies and shapes the AI-generated face's expression.
- **Hook angle has no expression mapping**: Must not happen for any angle that exists in the product; a defined default applies so no generation is left without emotional-direction guidance. (See Assumptions on the angle-ID mismatch.)
- **Identity vs. expression conflict**: If honoring the expression would alter identity (bone structure/features), identity wins — the expression is moderated rather than the face changed.
- **Theatrical risk**: Expressions must be subtle and natural, never exaggerated or caricatured.
- **Gaze direction**: Out of scope here — handled separately (Phase 19). The emotional-direction guidance must not introduce gaze-direction rules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For every hero-bearing generation (single image, carousel, batch, retargeting, before/after), the system MUST derive an emotional direction from the active hook angle (or retargeting objection) and supply it as **guidance input** to the concept/blueprint generation step — NOT as a rigid override block injected directly into the technical prompt.
- **FR-002**: The supplied emotional direction MUST inform the blueprint's hero-describing fields (`MOOD_EMOTION` and `SUBJECT_ACTION`), where the concept generator crafts a concept-specific expression; that expression MUST then flow into the synthesized technical prompt via the existing blueprint→technical-prompt synthesis.
- **FR-003**: The emotional direction is a DEFAULT/guidance, not a fixed verbatim expression. The system MUST allow each of the generated concepts to interpret the same hook emotion differently (e.g., pain → "frustrated" in one concept, "intensely determined" in another), consistent with anti-sameness variation.
- **FR-004**: The face-identity protection rules MUST remain in the technical prompt as priority #1 and win any conflict; the expression (priority #2) and art-direction pose (priority #3) MUST NOT weaken, remove, or reorder identity protection. If honoring the expression would alter identity, the expression is moderated, not the face.
- **FR-005**: The system MUST map each hook angle that exists in the product's cold-hook-angle list to a defined emotional direction (emotion + concrete physical description), with NO angle left unmapped. Canonical angle IDs: `emotional, pain, curiosity, logic, social_proof, urgency, statistics, scarcity, logical_authority, future_based` (frontend `src/constants.ts` `COLD_HOOK_ANGLES`; backend runtime authority is `functions/src/knowledge/hookAnglesKnowledge.ts` `HOOK_ANGLE_KNOWLEDGE` — identical 10-id set). The 5 angles absent from the original request map as: `emotional` → empathetic/heartfelt; `statistics` → sober/analytical; `scarcity` → urgent/alert; `logical_authority` → commanding/assured; `future_based` → aspirational/hopeful (per Clarifications 2026-06-23).
- **FR-006**: The system MUST map retargeting objections to emotional directions by family: price/budget/payment → analytical & evaluating; trust/been-burned/tried-before → reassuring & confident; timing/no-time/not-ready → urgent & focused; all other objections → confident & approachable (fallback).
- **FR-007**: When the active hook angle is absent (none selected), the system MUST fall back to the blueprint's existing default mood/expression behavior with no change from today (no emotional-direction guidance is added).
- **FR-008**: When an art direction implies its own character/energy, the supplied guidance MUST instruct that the art direction's character/style be blended with the hook's emotion (e.g., "powerful concern"), rather than one replacing the other.
- **FR-009**: The supplied guidance MUST request subtle, natural expressions and explicitly discourage exaggerated or theatrical results.
- **FR-010**: For before/after compositions, the BEFORE state MUST carry the hook's (problem) emotion and the AFTER state MUST carry an aspirational/confident emotion, consistent with — and not contradicting — the existing before/after `MOOD_EMOTION` composition rules.
- **FR-011**: For carousels, all slides MUST use the same emotional direction (one hook → one emotion across slides).
- **FR-012**: For batches, each item MUST use the emotional direction of that item's own hook (supporting per-item hook variation from anti-sameness rotation).
- **FR-013**: The emotional-direction guidance MUST apply even when no reference face was uploaded, guiding the AI-generated hero's expression.
- **FR-014**: The feature MUST NOT introduce gaze-direction instructions (gaze is owned by a separate phase).
- **FR-015**: The feature MUST preserve all existing behaviors with zero regressions, specifically: face-identity protection, art-direction pose blocks, anti-sameness rules (Phase 23), optional-field handling (Phase 24B), the copy-fidelity contract, cultural-compliance guardrails, Arabic RTL handling, and the image-provider switch.
- **FR-016**: The feature MUST be reversible: replaced prompt content is commented out rather than deleted, and the absent/unselected state is represented by the project's canonical absent sentinel.
- **FR-017**: The emotional direction resolved for a generation (source angle/objection → emotion) MUST be recorded in the generation's resolution trace for audit and test verification (additive only; no schema migration).

### Key Entities *(include if feature involves data)*

- **Hook Angle**: An existing selectable cold-traffic angle (canonical IDs above) that conveys the ad's persuasive emotional direction. Resolves to the emotional direction for cold-traffic generations.
- **Retargeting Objection**: An existing selectable objection (grouped by blame layer: circumstances / other people / self) used in retargeting generations. Resolves to the emotional direction for retargeting generations.
- **Emotional Direction (guidance)**: The derived mapping output — an emotion label plus a concrete physical description, and the source angle/objection it came from. It is supplied as **input** to concept/blueprint generation (shaping `MOOD_EMOTION`/`SUBJECT_ACTION`), not injected verbatim into the technical prompt. The absent state is the canonical absent sentinel.
- **Blueprint Expression Fields**: The concept's `MOOD_EMOTION` and `SUBJECT_ACTION` fields, where the concept-specific expression is authored and from which it flows into the synthesized technical prompt.
- **Art-Direction Character**: The character/energy implied by the selected art direction, blended with the hook's emotion to shape the final expression style.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a pain-angle generation with an uploaded smiling photo, the rendered hero shows concern/frustration and NOT a smile in at least 9 of 10 sampled generations.
- **SC-002**: For an aspiration-style angle (`future_based`), the rendered hero shows determination/focus (not a flat neutral or unrelated emotion) in at least 9 of 10 sampled generations.
- **SC-003**: Across all hook angles that exist in the product, 100% resolve to a defined emotional direction that is supplied to concept generation and recorded in the resolution trace (no angle yields "no guidance").
- **SC-004**: In side-by-side comparison of generated hero vs. uploaded photo across a sample set, identity is judged "same person" in 100% of cases while expression changed in the cases where the hook called for a different emotion.
- **SC-005**: Before/after generations show a distinguishable problem→confident emotional shift across the divider in at least 9 of 10 sampled generations, with the same identity on both halves.
- **SC-006**: All existing automated test suites pass with zero new failures attributable to this change.
- **SC-007**: Reviewers rate sampled expressions as "subtle/natural" rather than "exaggerated/theatrical" in at least 9 of 10 cases.

## Assumptions

- **Hook-angle ID mismatch (resolved 2026-06-23)**: The feature request and the launch matrix describe angles named `pain, aspiration, curiosity, fear, social_proof, authority, urgency, contrast, story, logic`. The actual canonical IDs in the codebase are `emotional, pain, curiosity, logic, social_proof, urgency, statistics, scarcity, logical_authority, future_based`. Only `pain, curiosity, logic, social_proof, urgency` overlap. Per Clarifications, the implementation maps the **actual** canonical IDs and treats the request's table as the **intent** where names overlap. The 5 non-overlapping IDs map to the confirmed defaults in FR-005 (`emotional`→empathetic/heartfelt; `statistics`→sober/analytical; `scarcity`→urgent/alert; `logical_authority`→commanding/assured; `future_based`→aspirational/hopeful). The request's `aspiration/fear/authority/contrast/story` names are honored as emotional templates applied to the closest real IDs and to retargeting/before-after states.
- **Mechanism (confirmed 2026-06-23)**: The mapping is guidance fed to concept generation, not a rigid technical-prompt override. Expression is authored by the concept generator into `MOOD_EMOTION`/`SUBJECT_ACTION` and synthesized into the technical prompt; identity protection stays a technical-prompt rule at priority #1.
- Before/after already encodes "struggle"/"frustration" (before) and "confident"/"triumph" (after) in the existing `MOOD_EMOTION` rules; Phase 28 reinforces and standardizes this rather than replacing it.
- "Hero-bearing generation" means any generation that renders a human hero; generations without a hero are unaffected.
- Expression realism is assessed by human review on a sampled set (no automated emotion-detection scoring is in scope).
- The image-generation provider remains switchable; the emotional-direction guidance is written to be effective regardless of the active provider.
- No frontend, billing, Firestore schema migration, or pricing/plan-gating change is required by this feature.
