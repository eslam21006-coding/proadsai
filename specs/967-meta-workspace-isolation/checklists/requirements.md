# Specification Quality Checklist: Workspace-Aware Meta Integration

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-18
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### Validation iteration 1 — 2026-08-18

**Passing**: The spec was rewritten from a code-level defect report into behaviour-level requirements. Function names, Firestore paths, field names, and the `resolveCallerScope` helper were removed from all normative text and replaced with the outcome they produce ("act on the account that owns the data", "record its own Facebook Page identifier"). Success criteria are all user- or business-observable counts and rates with a stated baseline where one exists (3 of 9 workspaces; every team-member Meta operation failing today).

**Resolved — 2026-08-18, clarification session**: All markers closed and 3 further ambiguities found during the taxonomy scan were resolved in the same session. See `## Clarifications` in the spec. Both items below are now answered; retained for traceability.

**Was open — 2 [NEEDS CLARIFICATION] markers**:

1. **FR-020** — Are account-wide Meta authorisation actions (connect, disconnect) owner-only, or opened to team members alongside linking? The source request said to apply the caller-scope fix to *every* Meta operation, which resolves *whose* data is touched but does not decide *who may sever the connection for the whole account*. No safe default: the destructive reading (owner-only) contradicts "apply to every callable", and the permissive reading lets one team member cut Meta access for every other workspace.
2. **FR-026** — If the Bug 4 investigation finds the same workspace-dropping condition on other listing surfaces, are those in scope for this phase or deferred? Cannot be defaulted before the root cause is known; it directly sets the phase boundary.

Both are scope/security-class questions, which the guidance ranks highest. They must be resolved before `/speckit.plan`.

**Answers recorded**: (1) FR-020 — connect and disconnect are both open to team members, because the owner typically has no Meta access and the team member is the media buyer who does. (2) FR-026 — every surface hit by the same root cause is fixed in this phase, bounded to that one cause.

**Additional resolutions from the scan** (not in the original spec, found during clarification): FR-012 no longer hard-requires a workspace in the publish request — it would have broken every publish on single-workspace plans; the server resolves the default workspace instead. FR-011 now clears a workspace's Page unconditionally on ad account change rather than validating it, because no per-ad-account Page validity signal exists. FR-009a scopes the legacy-fallback ban to routing decisions, resolving a contradiction with the performance-sync non-goal.

### Validation iteration 2 — 2026-08-18, second clarification pass

Four further clarifications recorded (9 total). Two were contradictions rather than gaps, both found by checking the spec against the code instead of against itself:

- **The authorisation callback has no signed-in caller.** It is an HTTP endpoint that takes the identity from the value carried through the authorisation round-trip. FR-020 (team members may connect) was therefore unimplementable as written, and directly contradicted the non-goal that left the authorisation flow untouched. Resolved by FR-020a-i / FR-020a-ii: resolve the identity to the owner *after* reading it, changing nothing about how it is carried or validated.
- **Publishing does not create an ad.** It places the creative in the ad account's media library; no ad, ad set, or campaign is created, and no Meta request consumes the Facebook Page. Two consequences: the severity framing throughout the spec was wrong (confidentiality exposure, not ad spend), and the Page gate in the previous FR-015a would have refused publishes that succeed today over a field nothing reads. Both corrected; the ad-account gate stays because the upload genuinely uses it.

Also added: reversibility (FR-029–FR-031, SC-013) and language parity (FR-028a–FR-028c, SC-012), both previously absent categories.

**Editorial tightening, not a new decision**: FR-011 now reads "changing — including removing it entirely". Without it, unlinking an ad account would leave a Page behind that a later link to a different client's account would inherit, reopening the exact leak FR-011 exists to close. This follows the rule's stated intent rather than adding to it.

**Deliberate non-standard structure**: User Story 5 is ranked P5 by value but is explicitly sequenced FIRST, because its root cause is unknown and may also be suppressing the workspace lists that Stories 1–4 depend on. This is recorded in the story's "Sequencing constraint" note, in FR-025, and in SC-005 (which requires the written root-cause statement to predate the first selector change).
