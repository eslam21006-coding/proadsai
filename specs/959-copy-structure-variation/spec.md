# Feature Specification: Phase 23 — Conditional Copy Structure, Anti-Sameness & Variation Carousel

**Feature Branch**: `959-copy-structure-variation`
**Created**: 2026-06-15
**Status**: Draft
**Input**: User description: "Phase 23 — Conditional Copy Structure + Anti-Sameness + Variation Carousel (Track 2 of the two-track copy system plan). Three sub-tracks shipping together in one PR: 23.A in-card variation carousel for 'Generate 4 More Like This'; 23.B single-hook anti-sameness via dimension pools, rotation, and cross-project memory; 23.C carousel anti-sameness via rotated story-direction pools and middle-slide angle rotation."

> **Authority**: `specs/_shared/COPY_SYSTEM_REFERENCE.md` is the single source of truth for all copy rules, structures, scoring dimensions, and pipeline facts. Where this spec and the reference disagree, the reference wins. This feature implements Section 16 (variation carousel) and Section 17 (anti-sameness, single-hook + carousel).
> **Track context**: Track 1 (Phase 22) already shipped — 6 constants in `copywriting_knowledge.ts`, 4 prompt surfaces wired, claimFlag trace, SYSTEM_TOV updated. This feature does not re-implement anything from Phase 22; it adds variation structure and cross-project diversity on top of the Phase 22 quality rules, which stay fully active.

## Clarifications

### Session 2026-06-15

- Q: How far back should the cross-project anti-repetition memory look when biasing away from recent combinations? → A: Last ~10 projects (per angle) — bias against angle+dimension+opening fingerprints from the user's most recent ~10 projects, aged out beyond that.
- Q: Does each "Generate 4 More Like This" click cost credit, and what happens on partial success (fewer than 4 valid variations)? → A: Charge the same as the current "Generate 4 More" action (no billing change); deliver the best available subset even if fewer than 4 are produced.
- Q: If the dedup + same-angle + quality gate rejects ALL candidates (zero valid variations for a click), what should the user see? → A: Show a non-blocking notice ("couldn't generate fresh variations — try again") and leave the card's existing carousel intact (reference + any prior variations unchanged).
- Q: For carousel anti-sameness (23.C), how large should the story-direction family pool be that the 4 picker cards are drawn from? → A: Use the existing spec-001 cold/retargeting angle sets (7 each: cold A–G, retargeting P–E) — draw 4 of 7, no new taxonomy.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - "Generate 4 More Like This" produces an in-card variation carousel (Priority: P1)

In Step 2, a user reviews the generated hooks, finds one they like, and clicks **"Generate 4 More Like This"** on that hook's card. Instead of four new hooks being appended to the bottom of the list (the current wrong behavior), the four new variations appear **inside the originating card** as a scrollable mini-carousel: the reference hook stays at position 1 and the four new variations occupy positions 2–5. The user navigates between them with left/right arrows and position dots, and acts on whichever variation is currently showing.

**Why this priority**: This is the most visible user-facing defect in the current copy flow and the only sub-track with a direct UI surface. It delivers immediate, demonstrable value on its own and is the headline change of the phase.

**Independent Test**: Generate a hook set, click "Generate 4 More Like This" on one card, and confirm the four variations appear inside that card as a navigable carousel (positions 2–5), the original hook is preserved at position 1, the rest of the list is unchanged, and Approve / Edit / AI Edit / Batch operate on the currently displayed variation.

**Acceptance Scenarios**:

1. **Given** a generated hook set in Step 2, **When** the user clicks "Generate 4 More Like This" on a hook card, **Then** four new variations are added inside that same card as positions 2–5 of a mini-carousel, the reference hook remains at position 1, and nothing is appended to the bottom of the list.
2. **Given** an in-card carousel showing position 1, **When** the user uses the right/left arrows or position dots, **Then** the displayed variation changes and the active position indicator updates accordingly.
3. **Given** the carousel is showing a non-reference variation, **When** the user clicks Approve / Edit / AI Edit / Batch, **Then** the action targets the currently displayed variation, not the reference hook or any other card.
4. **Given** a card that already has a variation carousel, **When** the user clicks "Generate 4 More Like This" again, **Then** the new variations extend the same card's carousel (up to a cap of ~12 positions) rather than resetting or replacing the existing ones.
5. **Given** the card has reached the ~12-position cap, **When** the user clicks "Generate 4 More Like This" again, **Then** the system does not exceed the cap and informs the user the carousel is full (no silent loss, no credit charged for a refused generation).
6. **Given** an Arabic-language project, **When** the user navigates the in-card carousel, **Then** the carousel respects right-to-left reading order (the "next" action advances leftward) and all variations render correctly RTL.
7. **Given** the reference hook has a resolved hook angle, **When** the four variations are generated, **Then** every variation uses the **same** hook angle as the reference and obeys all Phase 22 quality rules (≤6th-grade reading level, named lived symptom, claim-flag on fabricated specifics).
8. **Given** the existing hooks in the set, **When** variations are generated, **Then** each variation uses genuinely different wording — a different opening word, a different metaphor, and a different concrete lived symptom — reuses no words from the reference hook, and is deduplicated against all existing hooks in the set.
9. **Given** a carousel-ad project (not single static), **When** the user clicks "Generate 4 More Like This" on a carousel card, **Then** the card scrolls through alternative slide-1 hooks, each backed by its own full slide set, rather than producing standalone single hooks.

---

### User Story 2 - Fresh, non-repetitive hooks on every new single-hook project (Priority: P2)

A user starts several new projects over time on the same locked hook angle. Today, even with the angle correctly locked, the four generated hooks repeat the same sub-flavors in the same order and reuse the same scripted skeletons across projects, so the output feels stale. After this change, each new project draws a different mix of dimensions and opening structures within the locked angle, and the system remembers recent combinations per user to steer new generations away from what was produced recently — while the user's selected angle is never changed.

**Why this priority**: Repetition across projects erodes the core value of the product (fresh creative). It is high-impact but has no new UI surface, so it ranks below the visible carousel fix.

**Independent Test**: Run the same locked hook angle across multiple consecutive new projects for one user and confirm the four hooks differ across projects in both which dimensions are used and which opening structures are used, while the locked angle stays identical every time.

**Acceptance Scenarios**:

1. **Given** a hook angle locked by the user, **When** hooks are generated, **Then** the locked angle is preserved exactly and is never rotated or swapped.
2. **Given** the same locked angle used across several new projects, **When** each project generates its four hooks, **Then** the four dimensions drawn from that angle's pool differ across projects (not always the same four in the same order).
3. **Given** the same locked angle across several projects, **When** hooks are generated, **Then** the opening structures used (percentage / question / imperative / ratio / conditional / direct-address / time-reference) vary across projects, not just within a single set.
4. **Given** a user's recent generation history, **When** a new project generates hooks, **Then** the system biases away from recently used angle+dimension+opening combinations, yet never bans options outright — the dimension pool never starves and four hooks are always produced.
5. **Given** an angle's dimension pool, **When** the system migrates from the old fixed-4 scripts, **Then** every word of the existing dimension psychology and Arabic phrasing is preserved (restructured into a pool of 6–8 dimensions, not rewritten).
6. **Given** any generation, **When** diversity is applied, **Then** the model's sampling temperature is left unchanged — diversity comes from rotation and memory, not from raising temperature.

---

### User Story 3 - Carousel picker offers varied story directions every project (Priority: P3)

A user generates carousel ads across multiple projects. The carousel is a multi-angle **picker** — the four cards present four different story directions to choose between, and the middle slides of a chosen carousel walk through a sequence of angles. Today the same four story-direction families appear every time and the middle slides always run the same fixed A→B→C→D→E order. After this change, the four story-direction choices are drawn from a larger pool (rotated and memory-biased per project) and the middle-slide angle order is rotated per project — while every structural invariant of the committed carousel contract is preserved.

**Why this priority**: Carousel is a smaller share of usage than single hooks and is the most contract-sensitive change (it touches the spec-001 carousel slide-plan contract), so it ships last within the same PR but must ship together with 23.A and 23.B.

**Independent Test**: Generate carousels across multiple consecutive projects and confirm the four offered story directions vary across projects and the middle-slide angle order varies across projects, while no two adjacent middle slides share an angle, CTA appears only on slide 1 and the last slide, and photo injection occurs only on slide 1.

**Acceptance Scenarios**:

1. **Given** multiple new carousel projects, **When** the four story-direction cards are generated, **Then** the four families are drawn from a larger pool and differ across projects (never the same four families every time), biased by per-user memory.
2. **Given** a chosen carousel of N slides, **When** the middle slides are planned, **Then** the angle order for slides 2..N-1 is rotated per project instead of the fixed A→B→C→D→E lockstep.
3. **Given** any generated carousel plan, **When** the slide plan is produced, **Then** no two adjacent middle slides share the same angle.
4. **Given** any generated carousel plan, **When** the slide plan is produced, **Then** a CTA appears only on slide 1 and the last slide, and photo injection occurs only on slide 1.
5. **Given** the carousel middle-slide plan is a committed contract, **When** the angle-rotation behavior changes, **Then** the code, the spec-001 carousel slide-plan contract, and the corresponding reference section are updated together in the same PR and remain mutually consistent.

---

### Edge Cases

- **Variation cap reached**: Clicking "Generate 4 More Like This" when the card already holds ~12 positions must not exceed the cap, must not silently drop variations, and must not charge for a refused generation.
- **Variation generation fails / partial**: If fewer than four valid, deduplicated variations can be produced (e.g., the dedup + same-angle + quality gate rejects candidates), the card surfaces the best available subset rather than inserting low-quality or duplicate ones, and still charges the normal action cost; the reference hook always remains intact at position 1. If **zero** valid variations are produced, the system shows a non-blocking notice and leaves the card's existing carousel unchanged (see FR-006b).
- **First-ever project for a user**: With no cross-project memory yet, generation must still succeed using rotation alone (no memory bias available) and must not error.
- **Memory steers toward an empty pool**: Anti-repetition bias must never reduce the available pool to zero; if every option has been recently used, the system still selects (least-recently-used) and never blocks generation.
- **Small dimension pool**: If an angle's pool is at the minimum (6 dimensions) and four are needed, rotation must still yield a valid draw across consecutive projects without erroring.
- **Carousel with minimum slides**: A short carousel (e.g., 2–3 slides) with few or no middle slides must still satisfy all invariants (CTA on slide 1 + last, photo injection slide 1 only) when middle-slide rotation has little or nothing to rotate.
- **Arabic RTL throughout**: Carousel navigation direction, variation rendering, and all anti-sameness phrasing must remain culturally compliant and RTL-correct.
- **Legacy hook records**: Hooks generated before this change (without variation-carousel state) must still open, display, and accept a "Generate 4 More Like This" click that creates a fresh in-card carousel.

## Requirements *(mandatory)*

### Functional Requirements

**Sub-track 23.A — In-card variation carousel**

- **FR-001**: The system MUST present the variations from "Generate 4 More Like This" inside the originating hook's card as a navigable mini-carousel, with the reference hook at position 1 and the new variations at positions 2–5.
- **FR-002**: The system MUST NOT append variations to the bottom of the hook list and MUST NOT replace the original reference hook.
- **FR-003**: The card carousel MUST provide left/right arrow navigation and position dots indicating the active position.
- **FR-004**: Approve, Edit, AI Edit, and Batch actions MUST operate on the variation currently displayed in the card carousel.
- **FR-005**: Repeated clicks of "Generate 4 More Like This" on the same card MUST extend that card's existing carousel rather than reset it, up to a cap of approximately 12 positions.
- **FR-006**: When the cap is reached, the system MUST refuse further additions gracefully, inform the user, and not consume credit for the refused generation.
- **FR-006a**: Each "Generate 4 More Like This" click MUST cost the same credit as the current "Generate 4 More" action (no billing-path change). When dedup/same-angle/quality rejection yields fewer than four valid variations, the system MUST still deliver the best available subset and charge normally.
- **FR-006b**: When zero valid variations are produced for a click, the system MUST show a non-blocking notice (e.g., "couldn't generate fresh variations — try again") and leave the card's existing carousel intact (reference hook at position 1 and any prior variations unchanged); it MUST NOT relax the dedup/quality constraints to force output.
- **FR-007**: In Arabic projects, the card carousel MUST respect right-to-left order (the "next" action advances leftward) and render all variations RTL-correct.
- **FR-008**: Every variation MUST use the same resolved hook angle and the same resolved structure (the angle-formula/shape within the current 4-field model — not the deferred Section-5 field-count structures) as the reference hook (drilling deeper into the liked direction, not exploring new directions).
- **FR-009**: Every variation MUST obey all Phase 22 quality rules — ≤6th-grade reading level, named concrete lived symptom, and claim-flag on fabricated verifiable specifics — and MUST pass the existing quality/scoring gate that already applies to hooks.
- **FR-010**: Each variation MUST use genuinely different wording from the reference hook (different opening word, different metaphor, different concrete lived symptom), MUST NOT reuse words from the reference hook, and MUST be deduplicated against all existing hooks in the set.
- **FR-011**: For carousel-ad projects, "Generate 4 More Like This" MUST generate alternative full carousel angle sets — the card scrolls through alternative slide-1 hooks, each backed by its own slide set — rather than standalone single hooks.

**Sub-track 23.B — Single-hook anti-sameness (locked angle preserved)**

- **FR-012**: The user's selected hook angle MUST remain locked exactly as the current code enforces; this feature MUST NOT rotate, swap, or otherwise alter the locked angle.
- **FR-013**: Each hook angle's blueprint MUST be restructured from a fixed-4 script into a pool of 6–8 dimensions, preserving every word of the existing dimension psychology and Arabic phrasing.
- **FR-014**: The system MUST draw 4 of N dimensions from the locked angle's pool, rotating which dimensions fill the four hooks across projects (not a fixed A=Financial / B=Time / C=Status / D=Skill order).
- **FR-015**: The system MUST rotate which opening structures (percentage / question / imperative / ratio / conditional / direct-address / time-reference) are used across projects, not only within a single set.
- **FR-016**: The system MUST record, per user across projects, the angle + dimensions + opening fingerprints of generations, and bias new generations away from recently used combinations. The recency window MUST cover the user's most recent ~10 projects per angle; fingerprints older than that window age out and no longer bias new generations.
- **FR-017**: The anti-repetition mechanism MUST bias only, never ban — the dimension pool MUST never starve and four hooks MUST always be produced.
- **FR-018**: The diversity improvement MUST be achieved without changing the model's sampling temperature.

**Sub-track 23.C — Carousel anti-sameness (multi-angle picker)**

- **FR-019**: The four carousel story-direction choices MUST be drawn from the existing spec-001 angle sets (7 per campaign type: cold A–G, retargeting P–E) — drawing 4 of 7, rotated and memory-biased per project so the same four families do not recur every time. No new story-direction taxonomy is introduced.
- **FR-020**: The middle-slide angle assignment MUST be rotated per project instead of the fixed A→B→C→D→E lockstep.
- **FR-021**: All carousel slide-plan invariants MUST be preserved: no two adjacent middle slides share an angle, CTA appears only on slide 1 and the last slide, and photo injection occurs only on slide 1.
- **FR-022**: The carousel code, the spec-001 carousel slide-plan contract, and the corresponding reference section MUST be changed together in the same PR and MUST remain mutually consistent.

**Preserved invariants (apply across all sub-tracks)**

- **FR-023**: All Phase 22 quality rules (≤6th-grade, lived-symptom, claimFlag, banned-CTA list) MUST stay active; this feature adds structure and diversity on top of them and MUST NOT re-implement or weaken them.
- **FR-024**: The GCC/Meta compliance guards in the hook-angle knowledge and caption-validation logic MUST be preserved untouched.
- **FR-025**: The single-line revert switch for the image model provider MUST remain intact and MUST NOT be removed.
- **FR-026**: Code paths for the previous image engine and the post-render compositing that are currently commented out MUST stay commented, not deleted.
- **FR-027**: Arabic RTL support and cultural-compliance blocks MUST remain fully intact across the new variation and diversity behaviors.

**Out of scope (explicit exclusions)**

- **FR-028**: This feature MUST NOT add new UI dropdowns or Step-2 UI changes beyond the in-card variation carousel (23.A).
- **FR-029**: This feature MUST NOT introduce the standalone creative-text-director module (deferred to a later phase).
- **FR-030**: This feature MUST NOT change the copy-fidelity gate, the compositor, or the text-compositing logic.
- **FR-031**: This feature MUST NOT execute a scoring/rewrite pass loop; the scoring-dimension and rewrite-diagnosis constants seeded in Phase 22 stay as inert constants and MUST NOT be wired into an active loop.
- **FR-032**: This feature MUST NOT change the number of copy fields emitted.
- **FR-033**: This feature MUST NOT perform a frontend hosting deployment.

### Key Entities *(include if feature involves data)*

- **Hook variation**: An additional hook generated by "Generate 4 More Like This". Belongs to a parent hook card, occupies a carousel position (2–5, extendable to ~12), shares the reference hook's resolved angle and structure, and carries its own copy fields subject to all quality rules.
- **In-card variation carousel state**: Per-card state holding the ordered list of positions (reference at 1, variations following), the currently active position, and whether the cap has been reached.
- **Dimension pool**: Per-hook-angle set of 6–8 dimensions (replacing the fixed-4 script) from which four are drawn per project, preserving existing dimension psychology and Arabic phrasing.
- **Opening structure set**: The rotatable set of hook opening forms (percentage / question / imperative / ratio / conditional / direct-address / time-reference).
- **Cross-project anti-repetition memory**: Per-user record of recent generation fingerprints (angle + dimensions + openings) used to bias-but-not-ban future draws; stored alongside the existing creative-memory data.
- **Carousel story-direction pool**: The larger pool of story-direction families from which four picker cards are drawn per project, rotated and memory-biased.
- **Carousel slide plan**: The committed contract defining slide roles, CTA placement, photo injection, and middle-slide angle order; this feature rotates the middle-slide angle order while preserving all invariants.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a user clicks "Generate 4 More Like This", 100% of the resulting variations appear inside the originating card (positions 2–5) and 0% are appended to the bottom of the list or replace the original hook.
- **SC-002**: Across 5 consecutive new projects on the same locked angle for one user, the set of four dimensions used differs in at least 3 of the 5 projects, and the locked angle is identical in 100% of projects.
- **SC-003**: Across 5 consecutive new projects on the same locked angle, the combination of opening structures used differs in at least 3 of the 5 projects.
- **SC-004**: In every "Generate 4 More Like This" result, 100% of variations share the reference hook's angle, reuse 0 words from the reference hook, and contain no duplicate of any existing hook in the set.
- **SC-005**: 100% of generated variations and diversified hooks pass the existing Phase 22 quality rules (reading level ≤6th grade and lived-symptom present) at the same rate as current single-hook generation, with no regression in pass rate.
- **SC-006**: Across 5 consecutive new carousel projects, the four offered story-direction families differ in at least 3 of the 5 projects, and the middle-slide angle order differs in at least 3 of the 5 projects.
- **SC-007**: In 100% of generated carousel plans, no two adjacent middle slides share an angle, CTA appears only on slide 1 and the last slide, and photo injection occurs only on slide 1.
- **SC-008**: The anti-repetition memory never blocks generation: in 100% of generations (including a user's first-ever project and the worst case where all options were recently used) four hooks / a complete carousel are still produced.
- **SC-009**: Repeated clicks extend a single card's carousel without exceeding ~12 positions in 100% of cases, and the cap is communicated without consuming credit when refused.
- **SC-011**: When a click yields zero valid variations, 100% of cases show a non-blocking notice and leave the existing card carousel unchanged (no low-quality or duplicate variation is ever inserted, and the dedup/quality constraints are never relaxed to force output).
- **SC-010**: In Arabic projects, the in-card carousel navigates RTL-correctly and all variations render RTL with cultural-compliance blocks intact in 100% of cases.

## Assumptions

- **Carousel contract location (resolved)**: The carousel slide-plan contract lives at `specs/001-resolver-completeness-trace/contracts/carousel-slide-count-plan.md` (this is the single canonical home — no "Section 5.A of COPY_SYSTEM_REFERENCE.md" exists; the same-PR sync requirement (FR-022) targets that contract file plus the reference's §17 carousel paragraph plus the `slidePlanEngine.ts` + `generators.ts` code). The reference's §17 was updated in the same PR to point directly at the contract, removing the dangling "Section 5.A" pointer.
- **Variation cap**: The reference states the cap as "~12"; this spec assumes a fixed cap of 12 positions per card unless planning determines otherwise.
- **Variation count per click**: Each "Generate 4 More Like This" click produces 4 variations (matching the action label), subject to dedup/quality rejection that may yield the best available subset; the click costs the same credit as today's "Generate 4 More" action regardless of how many valid variations are delivered (zero valid → non-blocking notice, see FR-006b). [Clarified 2026-06-15]
- **Memory scope**: Cross-project anti-repetition memory is keyed per user and persists across projects using the existing creative-memory storage. The bias considers the user's most recent ~10 projects per angle; older fingerprints age out of the window. [Clarified 2026-06-15]
- **Quality gate reuse**: "All Phase 22 quality rules" and "the same scoring gate" refer to the already-shipped Phase 22 validators and constants; this feature reuses them rather than introducing new ones, and explicitly does not activate a scoring/rewrite loop (FR-031).
- **No field-count change**: The four-field copy structure is unchanged; conditional field-count (the static/carousel structure track) remains a separate, later track per the reference's Section 0 / Section 2.
- **Single PR**: All three sub-tracks (23.A, 23.B, 23.C) ship together in one pull request, as required by the input and the reference's same-PR rule for the carousel contract.
