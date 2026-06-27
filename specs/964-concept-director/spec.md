# Feature Specification: Phase 20 — Concept Director (Option A, backend-only)

**Feature Branch**: `964-concept-director`
**Created**: 2026-06-26
**Status**: Draft
**Input**: User description: "Phase 20 — Concept Director (Option A: WITHOUT Creative Memory). Add a hidden backend stage that produces a specialized brief per concept (visual metaphor, headline architecture, layout archetype, forbidden props, gaze direction) so each of the 3 sibling concepts in a batch looks genuinely different — instead of the same metaphor/layout/headline with a different pose. Build only 20.B (Concept Director module), 20.C (Variance Validator), 20.D (Pipeline Integration), 20.G (tests). Skip 20.A, 20.E, 20.F, and creative-memory wiring (20.D.7). Backend-only, additive, fail-open, behind a per-user feature flag + Remote Config kill switch."

## Overview *(context for reviewers — not a template section)*

Today, when the system generates the three concept options for a single ad request, all three come out near-identical: the same visual metaphor, the same layout shape, the same headline structure — they differ only in the hero's pose. The result is "every ad looks like the same machine made it."

This feature inserts a hidden **Concept Director** stage that, before the existing concept-generation step runs, authors a distinct creative brief for each of the three concepts — deliberately steering each toward a different visual metaphor, headline architecture, and layout archetype, and giving each its own list of forbidden props and a specific gaze direction. A deterministic **Variance Validator** then checks that the three briefs are genuinely different and, if two or three collide on a core axis, asks the Director to redo the offending one (max one retry). The enriched briefs feed the existing concept pipeline, which then renders visibly more varied concepts.

The whole stage is invisible to the user (no new screens, no new buttons), additive, and fail-open: if anything goes wrong it silently falls back to today's behavior with zero regression. It ships dark behind a per-user flag and a global kill switch so it can be rolled out gradually and disabled instantly.

**Scope note (Option A):** This build delivers the Concept Director, the Variance Validator, the pipeline wiring, and the tests. It deliberately excludes the user-facing "Brief Coherence Check" banner (20.A/20.E), the user-facing "Variance Mode" toggle (20.F), live telemetry collection (the analytics part of 20.G), and any wiring to past winning ads / creative memory (20.D.7) — those are deferred to later phases. The "variance mode" concept is hardcoded to `balanced` for this build, but the interface accepts the mode so a future toggle can drive it without re-architecting.

## Clarifications

### Session 2026-06-26

- Q: Should the Concept Director run for carousel and batch generations in this build, or only the standard single-ad 3-concept flow? → A: Single-ad 3-concept flow only — carousel and batch generations keep today's behavior in this build. **(SUPERSEDED 2026-06-27 — see below.)**
- Q: What per-concept time limit should bound the Concept Director before it falls back to existing logic? → A: 15 seconds per concept.
- Q: How should the Variance Validator decide that two concepts' variance markers are "the same"? → A: Normalized exact match (compare canonical tokens after lowercasing + trimming whitespace).

### Session 2026-06-27

- Q (C1, raised in /speckit.analyze): The backend cannot distinguish single-ad from batch — both call `serverGenerateConcepts` with `mode='initial'` and identical payloads (single-ad App.tsx:4202; batch per-hook App.tsx:7225); carousel uses separate callables (`serverGenerateCarouselAngles` / `serverGenerateCarouselSlideCopies`). Given "no frontend changes," how should the gate scope resolve? → A: **Include batch.** The stage gates on `mode === 'initial'` at `serverGenerateConcepts`, which covers single-ad AND each batch hook (every such call is a "3 concepts for one hook" flow that fits the 3-sibling design). **Carousel remains excluded** because it uses separate callables. This **supersedes** the 2026-06-26 "single-ad only" answer. No frontend change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Three concepts that actually look different (Priority: P1)

A user submits a single ad request and approves a hook. The system generates three concept options. With the Concept Director active, the three concepts are visibly distinct: a different visual metaphor, a different layout shape, and a different headline treatment in each — not three poses of the same idea. The user can pick the one that best fits their taste instead of feeling like they were shown one idea three times.

**Why this priority**: This is the entire reason the phase exists. If the three concepts are not meaningfully more varied than today, the feature delivers no value. Every other story supports or protects this one.

**Independent Test**: Enable the feature flag for a test user, run a generation, and confirm the three resulting concepts differ on visual metaphor, layout archetype, and headline architecture — verifiable by inspecting the three concept briefs (each carries distinct varianceAxes tokens) and by visual review of the three rendered concepts.

**Acceptance Scenarios**:

1. **Given** a user with the feature enabled and a normal ad brief, **When** they generate three concepts, **Then** the three concepts carry three different visual metaphors and do not all share the same layout shape or the same headline architecture.
2. **Given** a user with the feature enabled, **When** the three briefs are produced, **Then** each brief contains a concrete visual metaphor (a depictable image, e.g. "a folded newspaper left on a subway seat", not an abstract idea like "media is dying"), a chosen headline architecture, a layout archetype, a hero gaze direction, and at least three forbidden props.
3. **Given** a user without the feature enabled (flag off), **When** they generate three concepts, **Then** the output is identical to today's behavior with no added latency from the new stage.

---

### User Story 2 - Never block, never break (fail-open safety) (Priority: P1)

When the Concept Director cannot do its job — a model call fails, times out, returns malformed output, or violates a hard rule — the generation must still complete using today's proven pipeline. The user never sees an error, never loses credits to a failure introduced by this stage, and never waits indefinitely. Reliability is non-negotiable because this stage sits in the critical path of every generation for enabled users.

**Why this priority**: This feature is being added to the live generation path. The founder's explicit requirement is "zero regression risk." A variance feature that occasionally breaks generation is worse than no variance feature. This story is co-P1 with Story 1.

**Independent Test**: Force each failure mode (simulated model failure, timeout, malformed output, hard-rule violation) for one or more concepts and confirm the generation completes normally, that the affected concept(s) fall back to existing behavior while unaffected concepts keep their enriched briefs, and that the fallback is recorded.

**Acceptance Scenarios**:

1. **Given** the Concept Director fails for one of the three concepts, **When** the generation continues, **Then** that one concept is produced by today's existing logic while the other two keep their Director briefs, and the user sees a normal successful result.
2. **Given** the Concept Director fails or times out for all three concepts, **When** the generation continues, **Then** all three concepts are produced by today's existing logic and the result is indistinguishable from a flag-off generation.
3. **Given** any failure in the new stage, **When** the generation completes, **Then** no user-facing error is shown and credits are charged exactly as they would be for a normal successful generation (no double-charge, no charge-on-failure introduced by this stage).
4. **Given** the Concept Director is taking too long, **When** a per-concept time limit is exceeded, **Then** the stage abandons enrichment for that concept and falls back rather than holding the generation open.

---

### User Story 3 - Catch and fix accidental sameness (Variance Validator + retry) (Priority: P2)

Even with per-concept briefs, the Director can occasionally produce two concepts that collapse onto the same core idea. A deterministic checker compares the three briefs and, if they duplicate on a core axis (for the default mode: the same visual metaphor appears in two or more of the three, or all three share the same layout, or all three share the same headline architecture), it asks the Director to redo the offending concept(s) once — telling it which ideas to avoid. If the redo still collides, the system ships what it has rather than looping or blocking.

**Why this priority**: This raises the quality ceiling of Story 1 and guards against the most common failure of multi-concept generation (silent convergence). It is P2 because Story 1 already delivers most of the value; the validator is the safety net that makes the variety reliable rather than occasional.

**Independent Test**: Feed the validator three briefs that duplicate on a core axis and confirm it flags the duplication, triggers exactly one retry of the offending concept with the duplicate ideas added to the avoid-list, and — if the retry still duplicates — proceeds without further retries and records the outcome.

**Acceptance Scenarios**:

1. **Given** three briefs where the same visual metaphor appears in two of them (default mode), **When** the validator runs, **Then** it flags a blocking duplication and triggers one retry of the offending concept.
2. **Given** three briefs where all three share the same layout shape (default mode), **When** the validator runs, **Then** it flags a blocking duplication.
3. **Given** a retry that still produces a duplicate, **When** the validator runs again, **Then** the system ships the concepts as-is, performs no second retry, and records that variance was not fully achieved.
4. **Given** three briefs that are already distinct on all core axes, **When** the validator runs, **Then** it passes with no retry and no added latency beyond the single check.
5. **Given** the validator runs, **When** it compares the three briefs, **Then** it reaches a verdict using only the briefs themselves (no model/AI call) and returns near-instantly.

---

### User Story 4 - Safe, reversible rollout (flag + kill switch) (Priority: P2)

The team needs to turn this feature on for a few test users first, watch results, and either widen the rollout or shut it off instantly if quality drops — all without a code deploy. A per-user flag (default off) decides whether an individual user gets the new stage. A single global kill switch overrides every per-user flag and disables the stage for everyone within roughly a minute of being flipped.

**Why this priority**: This is what makes shipping the feature to the live path acceptable. It is P2 because it gates *how* Story 1 reaches users, not *whether* the core capability works.

**Independent Test**: Toggle the per-user flag and confirm the stage runs only for flagged users; flip the global kill switch and confirm all users — including flagged ones — revert to today's behavior within the cache window, with no deploy required.

**Acceptance Scenarios**:

1. **Given** the per-user flag is off (its default), **When** the user generates concepts, **Then** the new stage does not run and behavior matches today exactly.
2. **Given** the per-user flag is on, **When** the user generates concepts, **Then** the new stage runs.
3. **Given** the global kill switch is on, **When** any user generates concepts — including users whose per-user flag is on, **Then** the new stage is skipped for everyone.
4. **Given** the global kill switch is flipped, **When** at most the cache window (~60 seconds) passes, **Then** the change takes effect for new generations without a deploy.

---

### Edge Cases

- **Hero-less ads** (text-only, value-stack, ticket-only, device/book mockup modes): concepts that have no hero person must still be enriched where it makes sense (metaphor, layout, headline, forbidden props) without forcing a hero gaze or hero pose. The Director must produce a coherent brief for a hero-absent concept (its hero-presence is "absent") and the validator must not penalize that.
- **Carousel vs batch generations** (per Clarifications 2026-06-27): the stage runs for every `serverGenerateConcepts` call with `mode === 'initial'` — this includes the **single-ad** flow AND each **batch** hook (both are "3 concepts for one hook" generations). **Carousel is excluded** because it uses separate callables (`serverGenerateCarouselAngles` / `serverGenerateCarouselSlideCopies`) that never reach this path. `refresh` / `precision` / edit calls are excluded by the mode check. The integration MUST NOT crash or mismatch item counts on any non-`initial` path.
- **Inviolable user choices**: the user's explicit selections — sub-style, creative mode, language, aspect ratio, brand colors/logo — are never overridden by the Director. Each concept brief specializes *within* the user's chosen sub-style; it never swaps it for another.
- **Non-Latin / Arabic output**: human-readable brief fields (metaphor description, pose description) must be in the user's language; internal category labels (the fixed choices the downstream pipeline reads) stay in their fixed English form so the existing pipeline keeps working.
- **Partial sibling visibility**: the first concept has no prior siblings to differ from; the second sees the first; the third sees the first two. The stage must work correctly at each step, including when an earlier sibling fell back (and therefore exposes no varianceAxes tokens to avoid).
- **Retry exhaustion**: after the single permitted retry, if variance still fails, the system ships the best available concepts and records the failure — it must never enter a second retry or block the user.
- **Hard-rule violations in Director output**: if a brief violates a hard constraint (e.g. fewer than three forbidden props, more than two highlighted phrases), that brief is treated as a failure and that concept falls back — it is not shipped in a malformed state.
- **Toggling mid-flight**: a generation must use a single consistent decision (run new stage or not) for its whole lifetime; it must not enrich concept 1 and then mid-generation behave inconsistently because a flag changed.

## Requirements *(mandatory)*

### Functional Requirements

**Concept Director (core)**

- **FR-001**: The system MUST provide a Concept Director stage that, for a single ad request, produces one specialized creative brief per concept (three by default), each intended to be visibly distinct from its siblings.
- **FR-002**: Each concept brief MUST include, at minimum: a concrete visual metaphor (a depictable image plus the emotional reason it fits the hook), a headline architecture chosen from a fixed set, a layout archetype chosen from a fixed set, a hero gaze direction chosen from a fixed set, a hero-presence value (present / absent / partial / multiple subjects), a specific hero pose description, a list of allowed props, a list of forbidden props, a background-complexity level, an accent/brand-color behavior, a logo treatment, a sub-style specialization (recording the user's chosen sub-style and how this concept specializes within it), a small set of restraint rules, the concept's index, and a set of short varianceAxes tokens (one each for metaphor, layout, and headline) used by the validator.
- **FR-003**: The visual metaphor MUST be a concrete, depictable image rather than an abstract concept — testable by example (e.g. "newspaper folded on a subway seat" passes; "media is dying" fails).
- **FR-004**: Human-readable brief fields MUST be written in the user's language; the fixed category labels that the downstream pipeline consumes MUST remain in their canonical English form regardless of user language.
- **FR-005**: The Director MUST run the three concepts **sequentially**, and each concept MUST be given the prior siblings' varianceAxes tokens so it can deliberately avoid repeating them. Concept 1 sees none; concept 2 sees concept 1; concept 3 sees concepts 1 and 2.
- **FR-006**: The Director MUST accept a variance-mode parameter and MUST support a `balanced` mode in which siblings are steered to differ on hero pose, composition, visual metaphor, headline architecture, and layout archetype. For this build the mode is fixed to `balanced`; the other modes (`conservative`, `aggressive`) MAY be defined for forward-compatibility but are not exercised by the live path.
- **FR-007**: The Director MUST accept a "past winning ads" input for forward-compatibility, and this input MUST default to empty. This build MUST NOT wire that input to any creative-memory source; the Director MUST behave correctly with it empty.
- **FR-008**: The Director MUST NOT override the user's inviolable choices (sub-style, creative mode, language, aspect ratio, brand colors/logo). Each brief's sub-style specialization MUST record the user's exact chosen sub-style as its origin and specialize within it.
- **FR-009**: The Director MUST enforce hard constraints on each brief before accepting it, including at least: at most two highlighted phrases, at least three forbidden props, at least two restraint rules, and a sub-style-origin that exactly equals the user's chosen sub-style. A brief failing any hard constraint MUST be treated as a Director failure for that concept (see fallback).

**Fallback / fail-open**

- **FR-010**: If the Director fails for a concept — model call failure, timeout beyond a per-concept limit, malformed/unparseable output, schema mismatch, or hard-constraint violation — the system MUST fall back to today's existing concept-generation logic for that concept only, leaving any successfully enriched siblings unaffected.
- **FR-011**: A Director fallback MUST NOT surface a user-facing error and MUST NOT change how credits are charged relative to a normal successful generation.
- **FR-012**: The Director stage MUST NOT be able to hold a generation open indefinitely; a per-concept time limit of **15 seconds** MUST bound how long enrichment may take before that concept falls back to existing logic.

**Variance Validator**

- **FR-013**: The system MUST provide a Variance Validator that compares the three sibling briefs and decides whether they are sufficiently distinct, using only the briefs' varianceAxes tokens — with no model/AI call — and returning effectively instantly. Two markers are considered "the same" when their canonical tokens match after **normalization (lowercasing + trimming surrounding whitespace)** — an exact match on the normalized token, not a fuzzy/semantic similarity.
- **FR-014**: In `balanced` mode the validator MUST flag a blocking duplication when any of these is true (using the normalized-match rule from FR-013): the same visual-metaphor token appears in two or more of the three concepts; all three share the same layout token; or all three share the same headline token. Note (by design): the Director *steers* sibling differences on more axes than the validator *checks* — pose and composition variance are steered by the prompt (FR-006) but are deliberately NOT validated; the validator is a deterministic safety net on the three core token axes (metaphor / layout / headline) only, matching LAUNCH_MATRIX 20.C.2.
- **FR-015**: When the validator flags a blocking duplication and no retry has yet happened for this request, the system MUST regenerate the offending concept(s) by re-running the Director with the duplicated markers added to that concept's avoid-list. This retry MUST be limited to **at most one** per concept.
- **FR-016**: If a retry still fails validation, the system MUST ship the concepts as-is, perform no further retries, and record that full variance was not achieved. The validator MUST NEVER block or fail the user's generation.
- **FR-017**: The validator MAY additionally raise non-blocking (warn-level) observations that are recorded but never trigger a retry.

**Pipeline integration**

- **FR-018**: The enriched briefs MUST feed into the existing concept-generation step, enriching its prompt rather than replacing it — using the brief's visual metaphor to inform the scene, its layout archetype to steer composition, its forbidden props to populate the prohibition list, and its hero gaze/pose to steer the hero — while all of today's existing logic remains intact as the fallback path.
- **FR-019**: The existing concept-quality checks MUST be made aware of the chosen headline architecture so that intentionally novel headline shapes (e.g. a one-giant-word treatment, a huge-number anchor, a manifesto) are not incorrectly rejected as "broken." Standard checks for genuinely malformed output MUST remain.
- **FR-020**: The new stage MUST run before the existing concept step in the pipeline order, followed by the validator (with its single retry), and then the unchanged downstream steps.
- **FR-021**: A generation MUST make a single, consistent decision about whether the new stage runs, and apply it for the entire lifetime of that generation.

**Feature flag & kill switch**

- **FR-022**: The system MUST gate the new stage behind a per-user feature flag that defaults to off. When off, the new stage is skipped entirely and behavior matches today.
- **FR-023**: The system MUST provide a single global kill switch that, when on, disables the new stage for all users regardless of their per-user flag.
- **FR-024**: The kill switch state MUST take effect for new generations within roughly 60 seconds of being changed, without requiring a code deploy. Reading the kill switch MUST NOT add meaningful latency or load to each generation (it may be cached briefly).

**Observability (audit trail only — live telemetry deferred)**

- **FR-025**: Each generation that involves the new stage MUST record an additive audit entry capturing whether the Director ran, how many concepts fell back, whether the validator triggered a retry, how many retries occurred, and whether full variance was ultimately achieved. This entry MUST be additive (no change to existing stored shapes) and MUST be optional/absent for generations that did not run the stage or pre-date it.
- **FR-026**: Collection of aggregate rollout/health telemetry into a separate analytics store is explicitly **out of scope** for this build and deferred; the per-generation audit entry in FR-025 is the only observability deliverable here.

**Tests**

- **FR-027**: The build MUST include automated tests covering: (a) three balanced-mode briefs carry distinct visual-metaphor markers; (b) every brief has at least three forbidden props; (c) each brief's sub-style origin exactly equals the user's chosen sub-style; (d) a simulated Director failure yields a fallback for that concept; (e) hero gaze direction is always one of the allowed values; (f) when one concept falls back, the other two still proceed enriched.
- **FR-028**: The build MUST include automated tests for the validator covering: (a) balanced mode flags when the metaphor marker matches in two of three; (b) the same-layout-across-all-three rule flags; (c) a non-duplicating set passes with no retry; (d) a retry triggers on duplication; (e) after one failed retry the system ships as-is.

### Out of Scope (explicitly deferred)

- The user-facing "Brief Coherence Check" banner and the pre-generation coherence reviewer (20.A, 20.E).
- The user-facing "Variance Mode" toggle and its workspace setting (20.F); the mode is hardcoded to `balanced` here.
- Wiring the Director to past winning ads / creative memory / RAG (20.D.7) — deferred until that upstream system exists.
- Running the stage for **carousel** generations (per Clarifications 2026-06-27) — carousel uses separate callables and is excluded. (Batch IS in scope as of 2026-06-27: each batch hook is a `serverGenerateConcepts` `mode='initial'` call and is covered.)
- Aggregate telemetry collection into an analytics store (the analytics portion of 20.G).
- Any frontend change, any new user-triggered backend entry point, any data-schema migration, any pricing/credit/plan change, and any change to the existing expression, gaze, universe-copy, copy-fidelity, or final-image-prompt logic.

### Key Entities *(include if feature involves data)*

- **Concept Brief**: The Director's per-concept output. Holds the visual metaphor (description + key visual element + emotional reason), headline architecture, highlight cardinality (count + phrases + treatment), layout archetype, hero presence, hero gaze direction, specific hero pose, allowed props, forbidden props, background complexity, accent behavior, logo treatment, sub-style specialization (origin + specialization + key departure), restraint rules, concept index, and the three varianceAxes tokens (metaphor / layout / headline). Relationship: three Concept Briefs belong to one ad request and are compared against each other.
- **Director Fallback Signal**: The alternative Director output when enrichment cannot be produced — carries a "fell back" indicator and a reason. Consumed downstream as the signal to run existing logic for that one concept.
- **Variance Validation Result**: The validator's verdict over the three briefs — pass/fail plus a list of violations (which axis, which concepts collided, and whether the violation is blocking or merely a warning).
- **Generation Audit Entry**: An additive, optional record attached to an existing generation capturing the stage's behavior (Director ran, fallback count, retry triggered, retry count, variance achieved). Relationship: zero-or-one per generation; absent on legacy/flag-off generations.
- **Per-user Feature Flag**: A boolean on the user's record, default off, deciding whether the stage runs for that user.
- **Global Kill Switch**: A single boolean read at generation start (briefly cached) that, when on, disables the stage for everyone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For generations with the feature enabled, at least 95% produce three concepts whose visual metaphors are all distinct from one another (measured by the varianceAxes tokens across a representative sample).
- **SC-002**: In blind review of paired samples (feature on vs. feature off) for the same brief, reviewers rate the feature-on set as "more visually varied" in at least 70% of pairs.
- **SC-003**: Zero increase in user-facing generation failures attributable to the new stage: the generation success rate for enabled users is statistically indistinguishable from the success rate for disabled users.
- **SC-004**: 100% of forced Director-failure scenarios (model failure, timeout, malformed output, hard-rule violation) complete the generation via fallback with no user-facing error and no change in credits charged.
- **SC-005**: When two or more concepts collide on a core axis, the system performs exactly one retry of the offending concept(s) and never more — verified across the validator test suite with no observed second retry.
- **SC-006**: Flipping the global kill switch reverts all users — including flag-on users — to today's behavior for new generations within 60 seconds, with no deploy.
- **SC-007**: With the per-user flag off (the default for all users at ship time), generation output and latency are unchanged from today.
- **SC-008**: Every enabled-path generation writes the additive audit entry, and no existing stored generation shape changes (legacy generations remain valid with the field absent).
- **SC-009**: All specified automated tests for the Director and the Validator pass.

## Assumptions

- **A1 (model infrastructure)**: The LAUNCH_MATRIX names "GPT-5" for the Director. Per founder decision #2, this build uses the **existing text/reasoning model infrastructure already in the codebase** (the same model path used by the current concept and copy steps) and adds **no new external API integration**. The Director is a structured-reasoning text call, not an image call, so it routes through the existing text path, not the image provider.
- **A2 (variance mode)**: The mode is hardcoded to `balanced` for the live path. The interface accepts the mode parameter so a future toggle (deferred 20.F) can drive it without re-architecture.
- **A3 (creative memory)**: "Past winning ads" defaults to empty and is intentionally unwired. The Director is expected to work well without it; wiring is deferred to the phase that builds creative memory.
- **A4 (default ship state)**: At ship time the per-user flag is off for all users and the kill switch is off; the feature reaches users only as the flag is deliberately enabled, starting with test users.
- **A5 (fail-open is mandatory)**: Any ambiguity about behavior on error resolves toward "fall back to existing behavior and never block the user."
- **A6 (no schema migration)**: All new persisted data is additive and optional. Existing generation records remain valid without it; no migration runs.
- **A7 (multi-item flows — RESOLVED, revised 2026-06-27)**: The stage runs for every `serverGenerateConcepts` call with `mode === 'initial'` — covering single-ad AND batch-per-hook (each is a 3-concept-for-one-hook generation that fits the 3-sibling design). **Carousel is excluded** structurally (separate callables). This revises the 2026-06-26 "single-ad only" assumption after analyze found batch and single-ad indistinguishable at the backend without a frontend signal (which is out of scope). The invariant for non-`initial` / carousel paths is "never invoked; never crash, never block, never mismatch counts."
- **A8 (advisory enrichment)**: The Director enriches the existing concept prompt; it does not replace the existing logic, which remains the fallback path for every concept.
- **A9 (user invisibility)**: This build adds no user-visible UI. Users perceive the feature only as more varied concepts.
- **A10 (consistency per generation)**: The decision to run the stage is evaluated once at generation start and held for the whole generation, so the kill switch cannot produce a half-enriched, half-fallback inconsistency within a single request.

## Dependencies

- The existing concept-generation step and its single shared image-prompt assembly point, which the enriched briefs flow into and which remains the fallback path.
- The existing text/reasoning model infrastructure (no new integration).
- The existing per-user record store (for the feature flag) and the existing remote-configuration mechanism (for the kill switch).
- The existing per-generation audit/trace record (extended additively).
- **Not** dependent on creative memory / RAG / past winning ads (deferred), and **not** dependent on any of the deferred 20.A/20.E/20.F user-facing pieces.
