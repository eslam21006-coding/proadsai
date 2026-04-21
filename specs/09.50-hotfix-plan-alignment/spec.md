# Feature Specification: Plan Structure Alignment Hotfix (Phases 1–9)

**Feature Branch**: `hotfix/plan-alignment`
**Created**: 2026-04-20
**Status**: Draft
**Input**: User description: "HOTFIX — Plan Structure Alignment (Apply to Phases 1–9) from docs/LAUNCH_MATRIX.md"

## Clarifications

### Session 2026-04-20

- Q: In the per-plan team-member limit, does the number include the owner or only invitees? → A: Owner-inclusive. Starter (1) = owner only, no invites. Pro (3) = owner + 2 invitees. Scale (10) = owner + 9 invitees. Existing `currentCount >= maxTeamMembers` gating stays correct.
- Q: How should existing users already over the new `savedProjectLimit` or `audienceAvatarLimit` caps be treated on first post-deploy login? → A: Soft grandfather. All existing records remain fully accessible and editable. Creating a new record is blocked while the user is over cap, with an inline "You're already at N/M — delete some or upgrade" message. Mirrors the Phase 6 team-over-limit pattern. No silent data loss, no forced cleanup.

## Context

The pricing page has been finalized with **3 plans** (Starter / Pro / Scale), not 4. The previously planned **Creator** plan no longer exists, and the internal identifier `scaling` has been renamed to `scale`. Phases 1–9 of the launch build were shipped against the older 4-plan structure, so the already-merged code must be retrofitted to match the final pricing table before Phase 10+ begins. This hotfix is a pure alignment — no new product features, only corrections to plan identifiers, entitlement gates, UI gating labels, per-plan limits, and test fixtures.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Starter user gets the full creative engine (Priority: P1)

A customer on the Starter plan opens the ad-generation form. Today the form hides or greys out the majority of hook angles, hook types, copywriting strategies, and ad tones because the code was gating them for Creator+ tiers. After the hotfix, the full library of 11 hook angles, 12 hook types, 8 copywriting strategies, and 11 ad tones is visible and selectable on Starter. Features that are genuinely paid (retargeting, fantasy universe, art direction, batch, carousel, reference ads) are clearly locked with an "Upgrade to Pro" message instead of being invisible.

**Why this priority**: Starter is the only plan a new user lands on. If the creative engine is artificially crippled, first-generation quality suffers and conversion drops. Removing the Creator-tier gates is the largest user-visible correction in the hotfix.

**Independent Test**: Log in as a Starter account, open Step 1, and confirm every hook angle / hook type / strategy / tone option is enabled. Confirm retargeting, fantasy, art direction, batch, carousel, and reference ads each show a locked-state "Upgrade to Pro" affordance rather than being absent.

**Acceptance Scenarios**:

1. **Given** a Starter user on Step 1, **When** they open the hook-angle selector, **Then** all 11 angles are selectable.
2. **Given** a Starter user, **When** they try to enable retargeting, **Then** they see a "Upgrade to Pro" lock state, not a blank or silently-disabled control.
3. **Given** a Starter user, **When** they try to enable fantasy universe, **Then** they see the same upgrade lock state.
4. **Given** a Starter user, **When** they view the tone dropdown, **Then** all 11 tones are selectable with no per-plan filtering.

---

### User Story 2 — Pro user unlocks batch, retargeting, fantasy, and carousel within Pro limits (Priority: P1)

A Pro customer opens the ad-generation form. They can now enable retargeting, fantasy universe, art direction, batch mode, and carousel. Batch mode is capped at 4 ads per run (1 size × 2 hooks × 2 concepts). Carousel mode caps slide count at 7. Reference ad upload is allowed. If they try to exceed the Pro limits (e.g., request 5 batch combos or 8 carousel slides), they get a clear `batch_limit_exceeded` / slide-count error rather than a silent truncation.

**Why this priority**: Pro is the revenue-driver tier. Every feature that used to require Creator-or-Scale must now work on Pro within the advertised limits. If batch/carousel/retargeting silently fail for paying Pro customers, we break the pricing promise on day one.

**Independent Test**: Log in as a Pro account, attempt batch generation with 4 combinations (pass), then 5 (fail with explicit error). Attempt carousel with 7 slides (pass), then 8 (fail). Enable retargeting, fantasy, and reference-ad upload and confirm all three are usable.

**Acceptance Scenarios**:

1. **Given** a Pro user, **When** they request a batch of 4 ads, **Then** generation succeeds.
2. **Given** a Pro user, **When** they request a batch of 5 ads, **Then** the backend rejects with an explicit plan-limit error and the UI surfaces it.
3. **Given** a Pro user, **When** they configure carousel with 7 slides, **Then** generation succeeds.
4. **Given** a Pro user, **When** they configure carousel with 8 slides, **Then** the UI and backend both block the request.
5. **Given** a Pro user, **When** they enable retargeting, **Then** the retargeting flow works without a plan error.

---

### User Story 3 — Scale user gets the ceiling advertised on the pricing page (Priority: P2)

A Scale customer runs the largest possible jobs. They can run batch with up to 36 ads per run (3 sizes × 4 hooks × 3 concepts). They can run carousel with up to 10 slides. They can create up to 10 team members and unlimited saved projects and unlimited audience avatars. All numeric ceilings match the pricing page exactly.

**Why this priority**: Scale is the enterprise tier. Limits must match marketing copy exactly; a ceiling mismatch (e.g., still capping carousel at 9 because of a stale constant) undermines trust and support load.

**Independent Test**: Log in as a Scale account. Attempt batch with 36 combinations (pass) and 37 (fail). Attempt carousel with 10 slides (pass) and 11 (fail). Create an 11th team member (fail). Create a 31st saved project (succeed — unlimited on Scale).

**Acceptance Scenarios**:

1. **Given** a Scale user, **When** they request a batch of 36 ads, **Then** generation succeeds.
2. **Given** a Scale user, **When** they configure 10-slide carousel, **Then** generation succeeds.
3. **Given** a Scale user, **When** they save their 100th project, **Then** the save succeeds (no limit).

---

### User Story 4 — No `creator` or `scaling` identifier remains anywhere (Priority: P1)

Developers and support staff can rely on the codebase and data model using only the three canonical plan IDs: `starter`, `pro`, `scale` (plus `none` for unauthenticated / unpaid). A repo-wide search for `creator` or `scaling` returns zero plan-related hits. User documents in Firestore, the Zustand store, TypeScript unions, cloud function plan checks, and test fixtures all agree on these three IDs.

**Why this priority**: Identifier drift is the root cause of silent entitlement bugs. If any single file keeps `scaling` while the rest moves to `scale`, a user's `plan === 'scale'` check will falsely return false and downgrade paying customers mid-session.

**Independent Test**: Run `grep -r "creator\|scaling" src/ functions/src/` and confirm zero plan-related matches. Cross-check the TypeScript `UserPlan` union is exactly `'none' | 'starter' | 'pro' | 'scale'`.

**Acceptance Scenarios**:

1. **Given** the repo after hotfix, **When** a search for the `creator` literal is run, **Then** no plan-related hits are found.
2. **Given** the repo after hotfix, **When** a search for the `scaling` literal is run, **Then** no plan-related hits are found.
3. **Given** the repo after hotfix, **When** the `UserPlan` type is inspected, **Then** it contains exactly `none`, `starter`, `pro`, `scale`.

---

### User Story 5 — Test fixtures reflect the 3-plan world (Priority: P2)

Contract fixture tests continue to cover plan-gated behaviour accurately. Tests that used to simulate a Creator user are re-pointed to Pro (since Creator-tier features are now bundled into Pro). Tests that used to check Scale-only batch now check Pro-allowed / Scale-unlimited batch. Every fixture passes against the 3-plan structure.

**Why this priority**: Fixtures are the regression guard. If they still run against the 4-plan world they either fail loudly (blocking release) or, worse, pass on obsolete logic.

**Independent Test**: Run `cd functions && npm test`. All plan-related contract fixtures pass. None reference `creator`.

**Acceptance Scenarios**:

1. **Given** the full backend test suite, **When** it runs, **Then** every plan-related fixture passes.
2. **Given** a fixture that previously targeted the Creator tier, **When** inspected, **Then** it now targets Pro.

---

### Edge Cases

- A user whose Firestore `users/{uid}` document still holds legacy `plan: 'scaling'` or `plan: 'creator'` must continue to resolve to a working plan after deploy (migrate on read: `scaling` → `scale`, `creator` → `pro`) rather than being treated as unpaid.
- A Paddle subscription whose Paddle-side price ID was previously mapped to Creator must, after the hotfix, be mapped to Pro (Creator-tier features are now bundled into Pro) so no one loses entitlements at webhook time.
- A Pro user mid-session requesting exactly the batch ceiling (4 ads) must succeed; off-by-one at the boundary is a regression risk.
- A Starter user who had a legacy-selected disallowed feature (e.g., a saved draft with retargeting enabled) must have the disallowed feature gracefully stripped on load rather than crashing the step.
- A team owner on Pro whose team is already at the 3-seat cap (owner + 2 invitees) must not be forced to remove anyone after deploy; new invites are simply blocked until someone is removed or the owner upgrades.
- A user whose pre-deploy saved-project count or audience-avatar count exceeds the newly introduced cap on their plan must retain full read/edit access to every existing record; only new creations are blocked while they are over cap. No record is deleted, hidden, or made read-only by the hotfix itself.

## Requirements *(mandatory)*

### Functional Requirements

**Plan identifiers**

- **FR-001**: The system MUST recognise exactly three paid plans — `starter`, `pro`, `scale` — plus `none` for unauthenticated or unpaid users.
- **FR-002**: The system MUST NOT expose or accept the legacy identifiers `creator` or `scaling` anywhere in its code, type definitions, data payloads, UI, or tests.
- **FR-003**: The system MUST migrate any existing `users/{uid}` records with legacy `plan: 'scaling'` to `plan: 'scale'` and any with legacy `plan: 'creator'` to `plan: 'pro'` on read, so in-flight users never see an unpaid state due to the rename.

**Per-plan numeric limits** (must match the finalised pricing table)

- **FR-004**: The system MUST grant Starter 800 credits/month, Pro 2500 credits/month, Scale 6500 credits/month.
- **FR-005**: The system MUST cap total team seats (owner-inclusive) at 1 for Starter (owner only, no invites), 3 for Pro (owner + 2 invitees), and 10 for Scale (owner + 9 invitees). The gate MUST treat `currentCount >= maxTeamMembers` as blocking new invites, where `currentCount = (non-owner members) + (open invites) + 1 for the owner`.
- **FR-006**: The system MUST cap saved projects at 10 for Starter, 30 for Pro, and unlimited for Scale. Existing records already above the cap at deploy time MUST remain fully accessible and editable (soft grandfather); only the creation of new records MUST be blocked while the user is over cap, with an inline "You're already at {current}/{cap} saved projects — delete some or upgrade to save more" message.
- **FR-007**: The system MUST cap audience avatars at 5 for Starter, 15 for Pro, and unlimited for Scale. Existing avatars above the cap MUST remain fully accessible and editable (soft grandfather); only the creation of new avatars MUST be blocked while over cap, with an equivalent inline message.
- **FR-008**: Batch generation MUST be unavailable on Starter, produce at most 4 ads per run on Pro, and produce up to 36 ads per run on Scale.
- **FR-009**: Carousel generation MUST be unavailable on Starter, cap at 7 slides on Pro, and cap at 10 slides on Scale.

**Creative-engine un-gating (Starter gets the full library)**

- **FR-010**: All 11 hook angles MUST be selectable on every paid plan (Starter included).
- **FR-011**: All 12 hook types MUST be selectable on every paid plan.
- **FR-012**: All 8 copywriting strategies MUST be selectable on every paid plan.
- **FR-013**: All 11 ad tones MUST be selectable on every paid plan.
- **FR-014**: No per-plan slicing logic MAY filter hook angles, hook types, copywriting strategies, or ad tones.

**Paid-feature re-gating (features previously at Creator+ move to Pro+)**

- **FR-015**: Retargeting MUST be gated to Pro and Scale plans only.
- **FR-016**: The fantasy universe family MUST be gated to Pro and Scale plans only.
- **FR-017**: Art direction MUST be gated to Pro and Scale plans only.
- **FR-018**: Batch mode MUST be gated to Pro and Scale plans only (with per-plan caps from FR-008).
- **FR-019**: Reference ad uploads MUST be gated to Pro and Scale plans only.

**Locked-state UI behaviour**

- **FR-020**: When a Starter user encounters a Pro-gated control, the system MUST render a visible locked state with an "Upgrade to Pro" affordance; it MUST NOT silently hide or silently disable the control.
- **FR-021**: The carousel slide count selector MUST show options 2–7 for Pro and 2–10 for Scale.
- **FR-022**: The batch configuration UI MUST display the plan-specific ceiling (e.g., "Up to 4 ads per run" for Pro, "Up to 36 ads per run" for Scale).

**Backend enforcement**

- **FR-023**: The backend MUST reject a batch request exceeding the caller's plan cap with an explicit permission-denied-style error that the UI can surface as an inline message.
- **FR-024**: The backend MUST reject a carousel request with a slide count exceeding the caller's plan cap with a similarly explicit error.
- **FR-025**: The entitlement resolver MUST return a non-blocking "allowed" result for any ungated feature on any paid plan (i.e., Starter can request hooks / tones / strategies freely) and a blocking "denied" result with a user-readable reason for any gated feature on a plan that does not grant it.
- **FR-026**: The launch-surface validator MUST NOT reference the `creator` plan in its hierarchy.
- **FR-027**: Every cloud function that reads a plan name MUST use the three canonical IDs (`starter`, `pro`, `scale`) and MUST NOT branch on `creator` or `scaling`.

**Test coverage**

- **FR-028**: Every contract fixture that previously targeted the Creator tier MUST be retargeted to Pro (since Creator-tier features are now bundled into Pro) and continue to pass.
- **FR-029**: Batch contract fixtures MUST cover Pro-allowed (cap 4) and Scale-allowed (cap 36) paths; carousel fixtures MUST cover Pro (cap 7) and Scale (cap 10) paths.

### Key Entities *(include if feature involves data)*

- **Plan configuration record** — The single source of truth for per-plan limits (credits, team size, saved-project cap, audience-avatar cap, batch config object, carousel max slides, boolean gates for retargeting / fantasy / art-direction / batch / carousel / reference-ads). Exactly three entries keyed by `starter`, `pro`, `scale`.
- **Entitlement decision** — A pure function output shaped `{ allowed: boolean, reason?: string, limit?: number }` used by every gated UI control and backend action. Consumes the plan ID, the feature name, and optionally a requested quantity.
- **User billing state** — The per-user resolved view (plan ID, remaining credits, team counts, role flags) that every client component reads. Must never contain `creator` or `scaling`.
- **Contract fixture** — A scripted input/output pair that asserts the entitlement resolver and validators return the expected decision for a given plan-plus-feature combination. Every fixture references one of the three canonical plan IDs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A repo-wide text search for the literal `creator` or `scaling` in a plan context returns zero results after the hotfix ships.
- **SC-002**: 100% of existing contract fixture tests pass after being migrated to the 3-plan structure.
- **SC-003**: A Starter user can open Step 1 and select any hook angle, hook type, copywriting strategy, or ad tone without seeing an upgrade prompt — measured by manual QA walkthrough covering all four selectors.
- **SC-004**: A Pro user can successfully generate a 4-ad batch and a 7-slide carousel, and receives an explicit plan-limit error when requesting 5 ads or 8 slides — verified by four end-to-end runs.
- **SC-005**: A Scale user can successfully generate a 36-ad batch and a 10-slide carousel — verified by two end-to-end runs.
- **SC-006**: All per-plan numeric limits displayed in the UI (credits, team size, saved projects, audience avatars, batch/carousel caps) exactly match the values in the pricing page — verified by a side-by-side comparison.
- **SC-007**: Existing users whose Firestore records still carry `plan: 'scaling'` or `plan: 'creator'` continue to receive correct entitlements (mapped to `scale` and `pro` respectively) with zero support tickets related to lost access in the 7 days post-deploy.
- **SC-008**: No regression in the already-shipped Phase 1–9 behaviour: every behaviour contract that passed before the hotfix still passes after.

## Assumptions

- The finalised pricing table in `docs/LAUNCH_MATRIX.md` Sections 13 (row 13) and 14 (HOTFIX table HF.1–HF.10) is authoritative — no further pricing changes are expected during this hotfix.
- The Creator tier's features are a strict subset of Pro's — every Creator-tier entitlement can be safely promoted to Pro without introducing ambiguity.
- The Paddle-side price/product mapping has already been, or will be, updated to emit Pro-tier webhooks for any customer previously provisioned on a Creator price ID; this spec covers in-app code alignment, not Paddle dashboard configuration.
- Legacy Firestore records using `plan: 'scaling'` or `plan: 'creator'` are rare enough that a read-time mapping (rather than a one-off migration job) is acceptable, but a follow-up migration script may be authored if support surface grows.
- The hotfix is scoped to alignment only — new features (e.g., adding a new plan, introducing new gated capabilities) are explicitly out of scope.
- No changes to Phase 10+ are made by this hotfix; Phase 10 onward will be implemented against the 3-plan structure from the start.
