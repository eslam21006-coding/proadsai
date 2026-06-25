# Feature Specification: Direct-Response Design Upgrades (Phase 19)

**Feature Branch**: `962-gaze-direction-dr`  
**Created**: 2026-06-24  
**Status**: Draft  
**Input**: User description: "Phase 19 — Direct-Response Design Upgrades: smart hero gaze direction, one-highlight cap, CTA outcome framing, price hierarchy, and hook↔visual alignment injected into the image generation prompt pipeline."

## Clarifications

### Session 2026-06-24

- Q: When a generation has no hook angle, which Phase 19 guidance applies? → A: The one-highlight cap is always injected (hook-independent); price hierarchy stays content-gated; only the hook-derived gaze and mood modulation are suppressed.
- Q: How is the art-direction gaze override (FR-006) detected? → A: Defer the art-direction override to a later phase; v1 always uses the hook-derived gaze (no override path).
- Q: Does CTA outcome framing apply to English copy too, or Arabic only? → A: Both languages — outcome-framing guidance applies to whatever language the copy is in, with length guidance adapting per language.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Smart Gaze Direction (Priority: P1)

A coach generates an ad with a pain-driven hook. The generated hero no longer stares into an empty corner of the canvas or away from the headline. Instead, the hero's gaze feels natural and intentional — slightly downward and reflective, matching the contemplative tone of the pain hook — and it never points at meaningless empty space. When the same coach switches to an authority hook, the hero instead looks directly at the viewer, projecting command and connection.

**Why this priority**: This is the core problem the phase exists to solve. Random, unnatural, or content-averse gaze is the most visible quality defect in the current output and the single biggest direct-response opportunity being missed. It delivers standalone value even if no other sub-feature ships.

**Independent Test**: Generate a series of single-image ads across the 10 canonical hook angles and confirm each hero's gaze (a) feels natural/intentional, (b) emotionally matches its hook, (c) does not point at empty canvas, and (d) shows no cross-eyed/wall-eyed artifacts — with face identity unchanged from the uploaded photo.

**Acceptance Scenarios**:

1. **Given** a single-image generation with a `pain` hook, **When** the ad is generated, **Then** the hero's gaze reads as reflective/slightly downward and does not point at empty canvas space.
2. **Given** a generation with an `authority` (logical_authority) hook, **When** the ad is generated, **Then** the hero looks directly at the viewer.
3. **Given** a generation with a hook angle present, **When** the ad is generated, **Then** the hook-derived gaze always applies (art-direction gaze override is out of scope for v1).
4. **Given** a generation with no hook angle available, **When** the ad is generated, **Then** no hook-derived gaze or mood guidance is injected and gaze is decided freely as today (the one-highlight cap is still applied).
5. **Given** any generation with gaze guidance applied, **When** the image is produced, **Then** the hero's facial identity remains pixel-faithful to the uploaded photo (identity protection is never weakened).

---

### User Story 2 - One Visual Focal Point (Priority: P2)

A coach generates an ad and receives a clean, readable composition with a single clear focal point — the hero — rather than a cluttered image where the CTA glows, the headline sparkles, the hero is dramatically lit, and a prop is highlighted all at once. Secondary visual emphasis (glow, shimmer, dramatic lighting) supports the hero or draws the eye toward the CTA, never competing with them.

**Why this priority**: Competing highlights destroy the visual hierarchy that makes a direct-response ad convert. High value, but the ad is still usable without it, so it ranks below gaze.

**Independent Test**: Generate ads that previously exhibited multiple competing highlights and confirm each output has one primary focal point (the hero) with at most one supporting secondary emphasis directed at the hero or CTA.

**Acceptance Scenarios**:

1. **Given** any image generation, **When** the ad is produced, **Then** there is one primary visual focal point (the hero) and no more than one supporting secondary highlight.
2. **Given** a secondary visual emphasis is present, **When** the ad is produced, **Then** it supports the hero or guides the eye toward the CTA button and does not compete with either.

---

### User Story 3 - CTA Outcome Framing (Priority: P2)

A coach generates an ad and the CTA copy frames an outcome or benefit ("ابدأ رحلة النمو" / "Start your growth journey") instead of a bare action ("اشترك الآن" / "Subscribe now") — when an outcome framing is natural for the context. For contexts where a direct action reads better, the copy engine still chooses the direct action.

**Why this priority**: Copy-only change that meaningfully lifts click intent, but it is independent of the visual work and reuses the existing copy pipeline, so it is parallelizable and lower-risk.

**Independent Test**: Generate ad copy across several offers in both Arabic and English and confirm CTAs hint at outcomes where natural, stay short and action-oriented, and still default to direct actions where those fit better.

**Acceptance Scenarios**:

1. **Given** an offer where an outcome framing is natural, **When** copy is generated (Arabic or English), **Then** the CTA hints at an outcome/benefit rather than only naming the action.
2. **Given** a context where a direct action reads better, **When** copy is generated, **Then** the copy engine may still produce a direct-action CTA.
3. **Given** any generated CTA, **When** copy is produced, **Then** it stays short (≈3–5 words, length adapting per language) and action-oriented, and the copy-fidelity contract is unchanged.

---

### User Story 4 - Hook↔Visual Mood Alignment (Priority: P3)

A coach generates ads across different hooks and the overall visual mood modulates with the hook emotion within the chosen art direction/universe — pain reads slightly moodier with dramatic shadows, aspiration reads brighter and warmer with an open composition, authority reads structured and symmetrical, urgency reads tighter with warm/hot accents — without overriding the universe's core aesthetic.

**Why this priority**: A polish layer that reinforces gaze and expression. Valuable but subordinate to the focal and gaze work, and it must not fight the existing art-direction system.

**Independent Test**: Generate the same offer under pain vs. aspiration vs. authority vs. urgency hooks within one universe and confirm the mood modulates appropriately while the universe's signature aesthetic remains recognizable.

**Acceptance Scenarios**:

1. **Given** a `pain` hook, **When** the ad is generated, **Then** the palette/shadows skew moodier within the active art direction.
2. **Given** an `aspiration`/`future_based` hook, **When** the ad is generated, **Then** the composition reads brighter, warmer, and more open.
3. **Given** any hook, **When** the ad is generated, **Then** the art direction and universe still control the core aesthetic; the mood modulation never overrides them.

---

### User Story 5 - Price Hierarchy (Priority: P3)

When an ad's content includes pricing (a discount or offer amount), the prices follow a clear visual hierarchy — original price smaller and struck-through, new/discounted price larger and prominent in a distinct color, savings amount/percentage highlighted but secondary to the new price. When no price is present (the common case for coach ads), nothing changes.

**Why this priority**: A soft, conditional addition that applies to a minority of ads. Lowest priority because most Pro Ads AI coach ads do not display prices.

**Independent Test**: Generate an ad whose content includes an original price, a discounted price, and a savings figure, and confirm the rendered hierarchy (struck-through original < prominent new price; savings secondary). Generate a price-free ad and confirm no pricing treatment appears.

**Acceptance Scenarios**:

1. **Given** ad content that includes both an original and a discounted price, **When** the ad is generated, **Then** the original is smaller/struck-through and the discounted price is larger and visually dominant.
2. **Given** ad content with a savings amount/percentage, **When** the ad is generated, **Then** the savings is highlighted but visually secondary to the new price.
3. **Given** ad content with no pricing elements, **When** the ad is generated, **Then** no price-hierarchy treatment is introduced.

---

### Edge Cases

- **No hook angle available**: Hook-derived gaze and mood-modulation guidance are not injected (the model decides gaze freely, as today). The hook-independent one-highlight cap is still injected, and price hierarchy still applies if pricing content is present; otherwise output matches current (pre-Phase-19) behavior.
- **Before/after mode**: The BEFORE hero may gaze reflective/downward (pain framing); the AFTER hero may gaze direct/forward (aspiration framing) — mirroring the established Phase 28 before/after split.
- **Carousel**: All slides share one consistent gaze direction derived from the single shared hook.
- **Batch**: Each batch item receives gaze guidance appropriate to its own hook angle.
- **9:16 story (vertical)**: Gaze guidance accounts for the vertical composition rather than assuming a horizontal layout.
- **No uploaded face (AI-generated hero)**: Gaze guidance still applies to the AI-generated face.
- **Art-direction gaze override**: Deferred — out of scope for v1. When a hook angle is present, the hook-derived gaze always applies (no art-direction override path in this phase).
- **Unknown / aliased hook id**: An unrecognized hook id resolves through defensive aliases or falls back to a safe, neutral gaze directive — a real run is never left without valid guidance, and a missing mapping never throws.
- **Multi-size variants (Phase 17)**: Every size variant inherits the same guidance because all sizes route through the shared image-prompt builder.
- **Provider switch**: Guidance behaves consistently regardless of which image-model provider is active.

## Requirements *(mandatory)*

### Functional Requirements

#### Gaze Direction (P1)

- **FR-001**: The system MUST derive a gaze directive from the active hook angle for every hero-bearing generation that has a hook angle, mapping each of the 10 canonical cold hook angles (`emotional`, `pain`, `curiosity`, `logic`, `social_proof`, `urgency`, `statistics`, `scarcity`, `logical_authority`, `future_based`) to a natural gaze treatment.
- **FR-002**: The gaze directive MUST be expressed to the image model as guidance (a recommended, natural treatment), not as a rigid mandatory command, so the model retains freedom to produce the most natural result for the context.
- **FR-003**: The injected gaze guidance MUST explicitly forbid the failure modes: staring into empty canvas space, cross-eyed/wall-eyed appearance, gaze pointing at nothing meaningful, robotic "always look at the CTA" behavior, and gaze that contradicts the hook emotion.
- **FR-004**: The gaze guidance MUST state that, when natural and not forced, the gaze may guide the viewer's eye toward important content (CTA or headline), and MUST defer to layout composition so the hero never stares away from the content zone.
- **FR-005**: When no hook angle is available, the system MUST NOT inject hook-derived gaze guidance (nor hook-derived mood modulation per FR-015); the model decides gaze freely as today. Hook-independent guidance (one-highlight cap per FR-011/FR-012, and price hierarchy per FR-016 when pricing is present) MUST still apply.
- **FR-006**: The art-direction gaze override is DEFERRED to a later phase and is OUT OF SCOPE for v1. In v1 the hook-derived gaze always applies when a hook angle is present; there is no art-direction override path. (The mapper MUST be structured so an override source can be added later without reworking the injection point.)
- **FR-007**: Gaze guidance MUST be injected through the single shared image-prompt construction point so it applies uniformly to single, carousel, batch, retargeting, before/after, resize, and edit generation paths.
- **FR-008**: For before/after generations, the system MUST allow the BEFORE and AFTER heroes to receive different gaze treatments (reflective/downward vs. direct/forward), consistent with the existing before/after expression split.
- **FR-009**: The gaze guidance MUST account for the canvas aspect ratio so that vertical (9:16) compositions receive layout-appropriate guidance.
- **FR-010**: An unknown or aliased hook id MUST resolve via defensive aliases or a safe fallback gaze directive; the lookup MUST never throw and MUST never leave a hero-bearing run without valid guidance.

#### One-Highlight Cap (P2)

- **FR-011**: The image-generation prompt MUST instruct that there is exactly one primary visual focal point — the hero. This guidance is hook-independent and MUST be injected for every generation that flows through the shared image-prompt assembly point, including those with no hook angle. (The Pro Ads AI pipeline is uniformly hero-centric — every generated ad has a hero subject; Phase 28's facial-expression guidance already relies on this and gates only on hook presence, never on a separate hero-detection step — so no hero-presence gate is required here.)
- **FR-012**: The prompt MUST instruct that any secondary visual emphasis (glow, shimmer, dramatic lighting) supports the hero or draws the eye toward the CTA, never competing with either, and MUST discourage multiple simultaneous glowing/sparkling/highlighted elements.

#### CTA Outcome Framing (P2)

- **FR-013**: The copy-generation prompt MUST guide the copy engine to frame the CTA around an outcome or benefit rather than only the action, while keeping it short and action-oriented. This guidance applies to copy in BOTH languages (Arabic and English), with the length target (≈3–5 words) adapting per language.
- **FR-014**: The CTA outcome guidance MUST remain advisory (the copy engine may still choose a direct-action CTA when that reads better) and MUST NOT alter the existing copy-fidelity contract or any existing optional copy fields.

#### Hook↔Visual Alignment (P3)

- **FR-015**: When a hook angle is present, the image-generation prompt MUST add hook-emotion mood-modulation guidance (e.g., pain → moodier/dramatic shadows; aspiration → brighter/warmer/open; authority → structured/symmetrical; urgency → tighter/warm accents) expressed as guidance that modulates within — and never overrides — the active art direction and universe aesthetic. When no hook angle is present, mood modulation is not injected (see FR-005).

#### Price Hierarchy (P3)

- **FR-016**: When (and only when) the ad content includes pricing elements, the image-generation prompt MUST request a price hierarchy: original price smaller/struck-through, discounted price larger/prominent/distinct color, savings highlighted but secondary to the new price.
- **FR-017**: When the ad content includes no pricing elements, the system MUST introduce no price-hierarchy treatment.

#### Cross-cutting / Guardrails

- **FR-018**: All new guidance MUST be subordinate to face-identity protection; identity rules MUST never be weakened, reordered, or de-prioritized by this feature.
- **FR-019**: The feature MUST coexist with Phase 28 expression adaptation — gaze and expression guidance operate together without one replacing or contradicting the other.
- **FR-020**: The feature MUST leave unchanged: Phase 23 anti-sameness rules, Phase 24B optional copy fields, the copy-fidelity contract, cultural compliance, and Arabic RTL handling.
- **FR-021**: The feature MUST function identically under both image-model providers (the provider switch MUST remain operative).
- **FR-022**: The system MUST record an additive, per-generation audit trace capturing the resolved gaze source (hook-derived vs. fallback; art-direction override reserved for a future phase), the hook id, the chosen gaze treatment, and whether guidance was applied — with no change to existing persisted schema beyond additive fields.
- **FR-023**: Replaced or superseded code MUST be retained (commented out, not deleted) so the change is fully reversible, and `null` MUST be the canonical "absent" sentinel for any new optional field.

### Key Entities *(include if feature involves data)*

- **Gaze Directive**: The resolved gaze treatment for a generation. Attributes: source — one of `hook` (cold hook angle), `objection` (retargeting objection id), or `fallback` (unknown/aliased id); an `art-direction override` source is reserved for a future phase — originating hook/objection id, gaze treatment label (e.g., direct-to-viewer, toward-content, reflective-downward, forward-horizon, three-quarter), and the human-readable guidance text injected into the prompt.
- **Direct-Response Guidance Block**: The composite set of prompt guidance for one generation — gaze directive, one-highlight cap, hook↔visual mood modulation, and (conditionally) price hierarchy — assembled at the single shared image-prompt construction point.
- **Resolution Trace (extended)**: The existing per-generation audit record, extended additively with a gaze/DR sub-object recording source, hook id, gaze treatment, and applied flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across a representative sample of generated ads with a hook angle, 0 outputs show the hero staring into empty canvas space and 0 outputs show cross-eyed/wall-eyed artifacts.
- **SC-002**: For each of the 10 canonical hook angles, the hero's gaze is judged to match the hook's emotional direction (e.g., pain → reflective, authority → direct-to-viewer) in at least 9 of 10 sampled generations.
- **SC-003**: In every sampled generation, the hero's gaze is consistent with the layout — it never points away from the content zone into meaningless empty space.
- **SC-004**: Every sampled generated ad presents one clear primary focal point (the hero) with no more than one competing secondary highlight.
- **SC-005**: When an outcome-framed CTA is natural for the offer, the generated CTA hints at an outcome in the majority of sampled cases, while direct-action CTAs still appear where they fit better.
- **SC-006**: Visual mood is observed to modulate with hook emotion across hooks within a single universe, while the universe's signature aesthetic remains recognizable in 100% of samples.
- **SC-007**: 100% of existing automated test suites pass with zero regressions after the change.
- **SC-008**: Phase 28 expression adaptation continues to apply correctly alongside gaze in 100% of hero-bearing samples (expression and gaze both present and non-contradictory).
- **SC-009**: Generations without a hook angle receive no hook-derived gaze or mood guidance (gaze decided freely, as pre-Phase-19), while the one-highlight cap is still present in 100% of such samples and price hierarchy appears only when pricing content is present.
- **SC-010**: Face identity remains pixel-faithful to the uploaded photo in 100% of samples (no identity regression attributable to this feature).

## Assumptions

- The 10 canonical cold hook angles and the established before/after split from Phase 28 are the authoritative inputs for gaze derivation; retargeting objection ids reuse the same resolution approach as Phase 28 where a hero is present.
- The single shared image-prompt construction point used by Phase 28 (and inherited by Phase 17 multi-size variants) is the correct and sufficient injection site for all gaze and DR guidance; no additional per-path wiring is required.
- The art-direction gaze override is deferred to a later phase; v1 always uses the hook-derived gaze when a hook is present. The gaze mapper is nonetheless structured so an override source can be layered in later without changing the injection point.
- CTA outcome framing applies to both Arabic and English copy; the one-highlight cap is hook-independent and always injected for hero-bearing generations, while hook-derived gaze and mood modulation require a hook angle.
- Price hierarchy applies only when pricing content is already present in the ad copy/build plan; the feature does not introduce prices the user did not provide.
- CTA outcome framing is advisory guidance to the existing copy engine and does not add, remove, or gate any copy field, nor change pricing/plan gating.
- All guidance is prompt-level (text injected into existing prompts); no new model calls, no Firestore schema migration, no frontend changes, and no billing/plan-gating changes are required.
- The audit trace is additive and optional; absence of the new sub-object on legacy records is valid and defaults to "not applied."
