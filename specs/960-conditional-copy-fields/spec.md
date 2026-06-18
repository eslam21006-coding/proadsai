# Feature Specification: Phase 24B — Conditional Copy Fields (Optional Fields Plumbing)

**Feature Branch**: `phase-24-conditional-copy`
**Spec Folder**: `specs/960-conditional-copy-fields/`
**Created**: 2026-06-18
**Status**: Draft
**Input**: User description: "Phase 24B — Conditional Copy Fields (Optional Fields Plumbing). Make subheadText, ctaName, and benefitText genuinely optional end-to-end. hookText is NEVER optional. No decision brain yet — the model is not told when to omit fields. Phase B only stops the pipeline breaking when it emits fewer than 4 fields. Two tasks: T19 (optional fields in step-2 UI) and T20 (parser handles fewer than 4 fields)."

## Context & Authority

This is **Phase B only** from Section 18.2 of `specs/_shared/creative-text-decision-system-spec.md`, and Track 2 (early step) of `specs/_shared/COPY_SYSTEM_REFERENCE.md` Section 2. It is also the Phase 24 entry in `docs/LAUNCH_MATRIX.md` (TODO Critical).

- **Phase A (Phase 22) is already done.** It added the 6th-grade reading rule, the lived-symptom rule, the soft `claimFlag`, and the warning chip. Those quality rules and the `claimFlag` behavior stay active and are NOT modified here.
- **Phase C is out of scope.** No decision brain, no structure selection, no `creativeTextDirector.ts`, no scoring pass.

The product today is hardcoded to a fixed four-field copy shape: `hookText → subheadText → ctaName → benefitText`. The four fields travel through a three-layer fidelity contract (Step-2 generation → image-prompt injection → fidelity gate → render → compositing). The pipeline is described as roughly 70% ready for optional fields: the dedup/QA layer can already blank a field, the image-prompt builder already conditionals CTA/benefit "when non-empty", the fidelity gate already checks only non-empty fields, the carousel path already hides CTA on middle slides, and the compositor already counts only non-empty elements. The remaining blockers are: (1) the step-2 UI always *shows* all four fields and assumes they exist, and (2) the hook parser always *emits* four fields and treats a missing field as a parse failure rather than an intentional absence.

**This phase closes exactly those two gaps and nothing else.** It makes the *number* of copy fields conditional in plumbing terms, without yet adding any logic that *decides* when to omit a field. The model is still not told to omit anything; Phase B only guarantees that *if* fewer than four fields ever arrive, the UI and the parser handle it correctly instead of breaking.

## Clarifications

### Session 2026-06-18

- Q: When an OPTIONAL field is expected but unreadable/malformed (a true parse failure, not an intentional absence), what should the pipeline do? → A: Retry the build-plan parse within the existing fidelity retry cap; if still unreadable, log the failure (surfaced, not silent) and degrade the field to absent so the ad still ships.
- Q: Should a dedup/QA-blanked optional field be normalized to absent (null) and treated as intentionally absent everywhere? → A: Yes — a dedup-blanked optional field becomes null/absent and is treated as intentionally absent throughout (UI hides it, fidelity gate and QA accept it).
- Q: When hookText is absent/unreadable for a variation (never optional), what is the required behavior? → A: Treat as a generation failure for that variation and retry within existing limits; a variation is never rendered without a hook.
- Q: Should the user be able to ADD an absent optional field in step-2, or is absent final this phase? → A: Absent is final in step-2 for this phase — no add-field affordance; bringing absent fields back is deferred to Phase C.
- Q (from /speckit.analyze, Constitution VII): Should a parse-failure degrade-to-absent or a dedup-blank be signaled to the user, or is log + trace sufficient? → A: **Log + trace is sufficient; no UI signal.** Dropped optional fields (parse-failure degrade or dedup-blank) are not user-signaled because the field's absence is self-evident in the card. This satisfies Principle VII's "signaled to the user when relevant" — for a dropped optional on-creative field that never carried valid content, a separate signal is not relevant; the rule is defined, the override is logged, and it is recorded in `resolutionTrace.copyFieldStatus`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Step-2 UI renders cleanly when copy fields are absent (Priority: P1)

A user generates ad copy and one or more of the three optional fields (subheadline, CTA, benefit) is absent for a given hook variation. The step-2 review screen presents that variation without empty boxes, orphaned labels, broken layout, or dead per-field controls. The headline is always present and always shown.

**Why this priority**: This is the live step-2 surface that every single generation flows through. If absent fields render as broken slots or stale placeholder text, every user sees a visibly broken product. This is one of the two highest-risk tasks in the phase (T19) and must be a paranoid checkpoint.

**Independent Test**: Feed step-2 a hook variation that has only a headline (and separately: headline + subhead, headline + CTA + benefit, headline + subhead + CTA, etc.). Confirm the card renders with no empty field shells, no labels pointing at nothing, and no layout collapse, in both English (LTR) and Arabic (RTL).

**Acceptance Scenarios**:

1. **Given** a hook variation where subheadline, CTA, and benefit are all absent, **When** the user views it in step-2, **Then** only the headline is displayed and no empty field containers, labels, or separators for the absent fields appear.
2. **Given** a hook variation where only the CTA is absent, **When** the user views it, **Then** the headline, subheadline, and benefit display normally and nothing related to the CTA renders.
3. **Given** any hook variation with absent fields, **When** the card renders, **Then** the per-field "regenerate" control is shown only for fields that are present, and is hidden (not merely disabled) for absent fields.
4. **Given** Arabic copy with absent fields, **When** the card renders, **Then** right-to-left alignment, ordering, and direction remain correct for the fields that are present.

### User Story 2 - Parser distinguishes "intentionally absent" from "failed to parse" (Priority: P1)

When the generation output contains fewer than four fields, the parser records each missing optional field as a genuine absence (null / undefined) rather than inventing an empty string, a placeholder, or a duplicate. A field that the generator never produced must be indistinguishable in its *intent* from a field that a future decision brain deliberately omits — and clearly distinguishable from a field that was *expected but could not be read* (a real parse failure).

**Why this priority**: This is the hardest and most error-prone invariant in the phase (T20) and the second paranoid checkpoint. The downstream fidelity gate, dedup/QA layer, and image-prompt builder all branch on whether a field is "non-empty." If an absent field leaks through as `""` it pollutes those branches; if a parse failure is silently swallowed as "absent" it hides real defects. The two states must be explicit and separately observable.

**Independent Test**: Run the parser against outputs that (a) legitimately contain fewer than four fields and (b) are malformed such that an expected field cannot be read. Confirm (a) yields null/undefined optional fields with no error state, and (b) is surfaced as a parse failure — never silently converted into "absent."

**Acceptance Scenarios**:

1. **Given** generator output that contains a headline only, **When** parsed, **Then** subheadText, ctaName, and benefitText are each null/undefined — never `""`, never a placeholder string, never a copy of another field.
2. **Given** generator output where an expected OPTIONAL field is present but unreadable/malformed, **When** parsed, **Then** the parse is retried within the existing fidelity retry cap; if still unreadable, the failure is logged (surfaced, not silent) and the field is degraded to absent so the ad still ships — it is never silently recorded as "intentionally absent" without the logged failure.
3. **Given** any parsed result, **When** the fidelity gate (`validateCopyFidelity()`) runs, **Then** null/absent optional fields are accepted as valid and do not trigger a fidelity retry.
4. **Given** any parsed result, **When** the dedup/QA layer runs, **Then** a null/absent field is treated as intentionally absent and is never counted as a duplicate or a parse error.
5. **Given** a hook variation, **When** parsed, **Then** hookText is always present; an absent or unreadable hookText is a hard failure, never an "intentionally absent" outcome.
6. **Given** any field that IS present, **When** parsed and validated, **Then** the Phase 22 quality rules and the `claimFlag` behavior remain active on that field exactly as before.

### User Story 3 - Existing step-2 actions work on whatever fields are present (Priority: P2)

A user runs Approve, Edit, AI-Edit, Batch, and the Phase 23.A in-card variation carousel on a hook variation that has fewer than four fields. Each action operates correctly on the fields that exist and does not assume the absent fields exist.

**Why this priority**: These actions are existing functionality that must not regress. They are P2 (rather than P1) because they build on the rendering and parsing foundations in Stories 1 and 2 — if those are correct, these should follow, but they still require explicit verification because they each read the field set.

**Independent Test**: On a hook variation missing one or more optional fields, exercise Approve, Edit, AI-Edit, Batch, and scroll the Phase 23.A variation carousel. Confirm each completes without error and acts only on present fields.

**Acceptance Scenarios**:

1. **Given** a hook variation missing the subheadline, **When** the user clicks Approve, **Then** approval succeeds and carries forward only the present fields.
2. **Given** a hook variation missing the CTA and benefit, **When** the user uses Edit or AI-Edit, **Then** the editor operates on present fields only and does not create empty editable slots for absent fields.
3. **Given** a Batch action across variations with differing field sets, **When** it runs, **Then** each variation is processed against its own present fields without forcing a four-field shape.
4. **Given** the Phase 23.A in-card variation carousel containing variations with differing field counts, **When** the user scrolls through positions, **Then** each position renders cleanly per Story 1 and the carousel navigation (including Arabic RTL leftward-next) still works.

### Edge Cases

- **All three optional fields absent (headline-only variation)**: renders headline alone, cleanly; the most extreme but explicitly supported case.
- **Mixed field sets within one variation carousel**: position 1 may have four fields, position 2 may have one; navigation and rendering must tolerate the mix.
- **Whitespace-only field value from the generator**: treated as absent (null), never rendered as a real field — must not bypass the "never empty string" rule.
- **A genuine parse failure on an optional field**: retried within the fidelity cap, then logged and degraded to absent — surfaced via the log, never silently downgraded to "absent."
- **Absent hookText**: always a hard failure; hookText is never optional; the variation is retried within existing limits and never rendered hookless.
- **Dedup-blanked optional field**: normalized to null/absent and treated as intentionally absent everywhere (not left as an empty string).
- **Carousel middle slides** that already hide CTA via the existing `SHOW_CTA: no` marker: behavior must remain unchanged (this phase does not alter the carousel rendering rules).
- **Legacy / previously saved generations** that always carried four fields: continue to render and parse correctly (four present fields is still a valid case).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST treat `subheadText`, `ctaName`, and `benefitText` as genuinely optional across the step-2 UI and the hook parser.
- **FR-002**: The system MUST always require `hookText`; an absent or unreadable `hookText` MUST be a hard failure and MUST NEVER be recorded as "intentionally absent." On hookText hard failure for a variation, the system MUST treat it as a generation failure for that variation and retry within existing generation limits; a variation MUST NEVER be rendered without a hook.
- **FR-003**: The step-2 UI MUST render a hook variation that is missing one or more optional fields without empty field containers, orphaned labels, placeholder text, separators for absent fields, or layout collapse.
- **FR-004**: The step-2 UI MUST show the per-field regenerate control only for fields that are present, and MUST hide (not merely disable) that control for absent fields. An absent optional field is final within step-2 for this phase: the system MUST NOT provide an affordance to add a field the generator did not produce (deferred to Phase C).
- **FR-005**: The step-2 UI MUST preserve correct Arabic right-to-left alignment, ordering, and direction for whatever fields are present.
- **FR-006**: The parser MUST represent an absent optional field as null/undefined and MUST NEVER substitute an empty string, a placeholder, or a duplicate of another field.
- **FR-007**: The parser MUST distinguish "intentionally absent" (the field was not produced) from "failed to parse" (a field that was expected could not be read), and the two states MUST be explicitly and separately observable.
- **FR-008**: A genuine parse failure MUST NOT be silently converted into "intentionally absent." On an OPTIONAL-field parse failure, the system MUST retry the build-plan parse within the existing fidelity retry cap; if the field is still unreadable after retries, the system MUST log the failure (surfaced, not silent) and degrade the field to absent so the ad still ships.
- **FR-009**: `validateCopyFidelity()` MUST accept null/absent optional fields as valid and MUST NOT trigger a fidelity retry on account of an absent field.
- **FR-010**: The dedup/QA layer MUST treat a null/absent field as intentionally absent — never as a duplicate and never as a parse failure. When the dedup/QA layer blanks an optional field because it duplicates another, that field MUST be normalized to null/absent (not an empty string) and MUST thereafter be treated as intentionally absent everywhere (UI hides it; fidelity gate and QA accept it). Dedup-blanking remains the existing Phase 23 behavior in all other respects.
- **FR-011**: The Phase 22 quality rules (6th-grade reading level, lived-symptom depth) and the `claimFlag` behavior MUST remain active on every field that IS present, unchanged.
- **FR-012**: The Phase 23.A in-card variation carousel MUST continue to function when variations contain fewer than four fields, including across positions with differing field counts and including Arabic RTL navigation.
- **FR-013**: Approve, Edit, AI-Edit, and Batch MUST operate on whatever fields are present for a variation and MUST NOT assume absent fields exist.
- **FR-014**: A whitespace-only field value from the generator MUST be treated as absent (null), not rendered as a present field.
- **FR-015**: Previously valid four-field output MUST continue to render and parse correctly; this phase adds tolerance for fewer fields without removing support for four.
- **FR-016**: The "intentionally absent vs failed to parse" distinction MUST be covered by explicit automated tests (this is called out as the hardest invariant and a paranoid checkpoint).
- **FR-017**: This phase MUST NOT change the model's instructions about *when* to omit fields; the generator is not told to omit anything. The change is plumbing only — the system stops breaking *if* fewer than four fields arrive.

### Out of Scope (explicit exclusions)

- **OOS-001**: No `creativeTextDirector.ts` (Phase C).
- **OOS-002**: No decision tree or structure selection.
- **OOS-003**: No scoring pass.
- **OOS-004**: No changes to Phase 23 anti-sameness logic or the variation carousel behavior (beyond confirming it still works with fewer fields).
- **OOS-005**: No changes to `captionValidator.ts`, `textCompositing.ts`, or `culturalCompliance.ts`.
- **OOS-006**: No frontend hosting deployment as part of this spec.
- **OOS-007**: No change to which fields the model emits or any prompt instruction telling the model to omit fields.

### Key Entities *(include if feature involves data)*

- **Hook variation copy set**: the unit reviewed in step-2. Contains a required `hookText` and three optional fields (`subheadText`, `ctaName`, `benefitText`). After this phase, each optional field is either present (a real value) or absent (null/undefined) — never an empty string or placeholder.
- **Parse result state**: for each field, a tri-state distinction — present / intentionally absent / parse failure. Absent and failure must be separately observable; only failure is an error condition (and only for optional fields; for hookText, both absence and failure are errors).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of hook variations with one or more absent optional fields render in step-2 with zero empty field shells, orphaned labels, placeholder strings, or layout breakage, in both English and Arabic.
- **SC-002**: Per-field regenerate controls appear for 100% of present fields and 0% of absent fields.
- **SC-003**: For every parsed output containing fewer than four fields, each absent optional field is null/undefined in 100% of cases and an empty string or placeholder in 0% of cases.
- **SC-004**: In a test set that mixes legitimately-short outputs with deliberately-malformed outputs, the parser classifies 100% of short outputs as "absent" and 100% of malformed outputs as "parse failure," with zero cross-contamination between the two.
- **SC-005**: `validateCopyFidelity()` triggers zero fidelity retries that are caused solely by an intentionally-absent field.
- **SC-006**: The dedup/QA layer reports zero false duplicate or false parse-error flags attributable to a null/absent field.
- **SC-007**: Approve, Edit, AI-Edit, Batch, and the Phase 23.A variation carousel each complete successfully on variations with fewer than four fields, with a 0% error rate attributable to a missing field.
- **SC-008**: All previously-passing four-field generation, parsing, fidelity, and rendering behavior continues to pass (no regression).
- **SC-009**: Automated tests explicitly assert the "intentionally absent vs failed to parse" distinction and pass.
- **SC-010**: For every optional-field parse failure, a failure is logged in 100% of cases before any degrade-to-absent occurs (no silent degradation), and the field ships as absent rather than blocking the ad.
- **SC-011**: 100% of dedup-blanked optional fields are represented as null/absent (0% as empty string) and are accepted by the fidelity gate and QA layer without triggering a retry or duplicate/parse-error flag.

## Assumptions

- The downstream layers already documented as conditional-ready (image-prompt builder conditionaling CTA/benefit, `validateCopyFidelity()` checking only non-empty fields, carousel `SHOW_CTA` hiding, compositor counting only non-empty elements) behave as described in `COPY_SYSTEM_REFERENCE.md` Section 1 and require no change beyond what FR-009/FR-010 specify for the fidelity gate and dedup/QA layer.
- "Absent" is represented as null/undefined in the parsed model and as "do not render" in the UI; the exact internal sentinel is an implementation detail provided it is never an empty string or placeholder and is distinguishable from a parse failure.
- The four-field default still produces four fields in normal operation; this phase does not by itself cause fewer fields to be emitted — it only ensures correct handling if/when they are (e.g., by a future Phase C, or by the existing dedup layer blanking a field).
- The Phase 23.A variation carousel and Phase 23 anti-sameness logic are functionally correct as shipped and only need to keep working with a variable field count.
- Arabic detection and RTL behavior already in place (≥70%-Arabic-script, non-blocking) continue to govern direction; this phase does not alter that rule, only ensures it applies to whichever fields are present.

## Dependencies

- **Phase A (Phase 22)** must be in place: the 6th-grade rule, lived-symptom rule, soft `claimFlag`, and warning chip. This phase keeps them active and unchanged.
- **Phase 23 / 23.A** (anti-sameness + in-card variation carousel) must be in place; this phase must not regress them.
- Touch points are limited to `src/App.tsx` (step-2 UI, T19) and `functions/src/generators.ts` (parser + fidelity/dedup interaction, T20).

## Paranoid Checkpoints

Per the source spec (§18.4) and the feature request, **both** tasks in this phase are flagged as the highest-risk in the phase and require paranoid checkpoints:

- **T19 — Optional fields in step-2 UI (`src/App.tsx`)**: touches the live step-2 UI that every generation flows through.
- **T20 — Parser handles fewer than 4 fields (`functions/src/generators.ts`)**: the "intentionally absent ≠ failed to parse" invariant is the hardest in the phase and is where the parser and dedup/QA layer interact.
