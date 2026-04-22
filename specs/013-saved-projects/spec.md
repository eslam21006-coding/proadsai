# Feature Specification: Saved Projects

**Feature Branch**: `013-saved-projects`
**Created**: 2026-04-22
**Status**: Draft
**Input**: User description: "Phase 13 — Saved Projects: turn the existing save/load shell into a real project library — every saved project carries a status (draft / rendered / published), shows a real image thumbnail once it has been rendered, and exposes a step-by-step navigator so a user can resume work from any previously completed step. Per-plan project limits are enforced at save time, the list is searchable and filterable by workspace and status, projects can be deleted across all storage backends with confirmation, in-progress edits are continuously auto-saved with a visible save indicator, and team members can list project history scoped to the workspaces they have access to. Covers rows 13.1–13.10 in docs/LAUNCH_MATRIX.md and Definition-of-Done item #16."

## Clarifications

### Session 2026-04-22

- Q: How should the project library handle accessibility and Arabic-first / RTL behaviour? → A: Mirror existing launched surfaces — status badges combine colour with a short text label (Arabic + English equivalent), the project list and step navigator flip naturally in RTL, no new formal a11y commitments are added beyond what already-launched surfaces meet.
- Q: Can a project's status ever revert from `published` to `rendered`? → A: No — `published` is a one-way latch. Once a project is recorded as `published`, it stays `published` even if the Meta ad ID, Meta link, or workspace Meta binding later disappears. Demotion from `published` is never allowed.
- Q: How is the thumbnail derived for carousel and batch projects (where "first render" is ambiguous)? → A: For a carousel, the thumbnail is **slide 1** — slide 1 is the intentional intro/cover slide whose job is to spark curiosity and prompt the swipe, so it carries the meaning of a "cover". For a batch, the thumbnail is **item 1** — every batch item is an independent single-format render with no inherent ordering meaning, so item 1 is chosen as a stable deterministic pick rather than a "best" one. The thumbnail refreshes when Step 4 produces a new first slide / first item / single image (e.g., the user re-renders Step 4 or switches format); it does not refresh on later slides or later batch items.
- Q: What happens when cloud auto-saves keep failing in a row (e.g., the user is offline or their session expired)? → A: After **3 consecutive failed cloud saves** the indicator escalates from the transient "save failed" state to a **persistent, non-blocking banner** that names the problem and offers a manual "Try saving now" action. Local-only saves continue in the background throughout the failure window so the user's edits are never one tab-close away from being lost; the banner is dismissed automatically as soon as the next cloud save succeeds. The UI is never hard-blocked.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Saved projects carry status and a real thumbnail (Priority: P1)

After a user runs the generation pipeline far enough to render an image, the corresponding saved project records that it now has at least one render and stores a persistent thumbnail of that first render. If the user later pushes the ad to Meta, the project records that it has been published. Until the first render, the project is recognised as a draft and shows a placeholder. The project list panel shows each project's thumbnail (or placeholder) plus a colour-coded status badge so a user can tell at a glance which projects are still drafts, which have art, and which have shipped.

**Why this priority**: This is the visual identity layer of the project library. Without status and thumbnails, the list is just names and dates and the user has no way to tell their work apart at a glance. It is also Definition-of-Done item #16, which gates launch.

**Independent Test**: Create a project but stop in Step 1 — confirm it appears in the list with a draft badge and a placeholder thumbnail. Run the same project through to a successful render — confirm the project's status flips to rendered and the first rendered image now shows as the project's thumbnail across reloads. Push the ad to Meta — confirm the status flips to published and the badge changes colour. The thumbnail must persist across browser reloads, sign-out / sign-in, and switching devices on the same account.

**Acceptance Scenarios**:

1. **Given** a saved project that has never been rendered, **When** the user opens the project list, **Then** the card shows a draft status badge and a placeholder thumbnail (no image).
2. **Given** a saved project that has at least one rendered image, **When** the user opens the project list, **Then** the card shows a rendered status badge and the persisted thumbnail image.
3. **Given** a saved project that has been pushed to Meta, **When** the user opens the project list, **Then** the card shows a published status badge.
4. **Given** the first render of a project completes, **When** the project is next loaded from any device or session, **Then** the same thumbnail image is displayed (the thumbnail is durable, not derived on the fly each session).
5. **Given** a project's first render produced a temporary in-memory image, **When** the project is saved, **Then** the system persists a stable image reference for the thumbnail so reloads continue to display it.
6. **Given** a project with no render, **When** the project is reloaded, **Then** no thumbnail upload occurs and the placeholder remains.

---

### User Story 2 — Per-plan saved-project limit enforced at save time (Priority: P1)

When a user attempts to save a *new* project, the system checks how many saved projects they already have against the cap allowed by their billing plan: 10 for Starter, 30 for Pro, unlimited for Scale. At-limit users are blocked with an inline message that names the cap, names their current plan, and points them to upgrade. Updating an existing project does not consume new quota and is never blocked by the limit.

**Why this priority**: The project limit is a billing-tier differentiator and is part of Definition-of-Done item #16. Without it, a Starter user can hoard unlimited projects and the Scale tier loses concrete payoff. Enforcing at save time (not at list-render time) prevents data loss from the user's perspective — they know before clicking save that they're at the cap.

**Independent Test**: As a Starter-plan user with 10 saved projects, attempt to save an 11th — the save is blocked with an inline message naming the 10-project Starter cap. Update an existing project — the update succeeds even though the user is at the cap. Upgrade to Pro and immediately attempt the same 11th save — the save now succeeds. As a Scale user, save a 31st project — success.

**Acceptance Scenarios**:

1. **Given** a Starter user with 10 saved projects, **When** they attempt to save a new project, **Then** the save is refused with a message that names "10-project limit on the Starter plan" and surfaces an upgrade path.
2. **Given** a Pro user with 30 saved projects, **When** they attempt to save a new project, **Then** the save is refused with a message that names "30-project limit on the Pro plan" and surfaces an upgrade path.
3. **Given** a Scale user with any number of saved projects, **When** they save a new project, **Then** the save succeeds.
4. **Given** a Starter user with 10 saved projects, **When** they edit and re-save one of those existing projects, **Then** the update succeeds (the limit applies only to creating new projects).
5. **Given** the user is over their cap because they downgraded plans (e.g., Pro → Starter while holding 25 projects), **When** they try to create a new project, **Then** creation is blocked with the same upgrade-path message; existing projects remain readable, editable, and deletable.

---

### User Story 3 — Resume from any completed step via project navigator (Priority: P1)

Each project card shows a small step indicator with one dot per pipeline step (Step 1 inputs → Step 2 tone/concept → Step 3 build plan → Step 4 render → Step 5 caption). A dot is filled when the project has data for that step. Clicking a filled dot loads the project and jumps directly to that step instead of always landing on the project's last active step. Clicking an unfilled dot is not allowed (no skipping ahead to a step whose prerequisites are missing). When the user opens the project the normal way, the system still resumes at the last active step as before.

**Why this priority**: This is the headline new behaviour of the phase. The existing save/load already brings the user back into the project, but always at the last active step — which forces re-navigation when the user wanted to revise an earlier decision. Direct step-resume is also Definition-of-Done item #16.

**Independent Test**: Open a project that has data for Steps 1, 2, 3, and 4 (no caption yet). Confirm the navigator shows four filled dots and one empty dot. Click the Step 2 dot — the project loads and the app is parked at Step 2 with the previously selected tone visible. Click the Step 5 dot — nothing happens (or the dot is non-interactive) because Step 5 has no data. Open the same project via its main card body — the app lands at Step 4 (the last active step) as it does today.

**Acceptance Scenarios**:

1. **Given** a project that has inputs, tone, build plan, and at least one render but no caption, **When** the user opens the project list, **Then** the project's step navigator shows Steps 1–4 as filled and Step 5 as empty.
2. **Given** a project's navigator, **When** the user clicks the Step 3 dot, **Then** the project is loaded and the active step is set to Step 3 (not the project's last-saved step).
3. **Given** a project with no build plan, **When** the user clicks the Step 4 dot, **Then** the click is ignored (the dot is visually disabled and not actionable) because Step 4 prerequisites are missing.
4. **Given** a project, **When** the user opens it via the card body rather than a specific step dot, **Then** the app resumes at the project's last active step (existing behaviour preserved).
5. **Given** an invalid target step is requested programmatically (e.g., via a stale link), **When** the load runs, **Then** the system falls back to the project's last active step and surfaces no error to the user.

---

### User Story 4 — Search and filter the project library (Priority: P2)

A user with many saved projects can find a specific one quickly. Above the project list, a search input filters by project name (case-insensitive substring). A workspace selector narrows the list to a single workspace. Status tabs (All / Draft / Rendered / Published) narrow the list by status. The three filters compose: searching while a status tab is active shows only matching projects within that status.

**Why this priority**: Becomes essential as soon as a user crosses ~20 projects (which Pro hits at its cap and Scale exceeds routinely). It is P2 because the P1 stories deliver the core "I can see, identify, and resume any project" value even with no filters.

**Independent Test**: Create 6 projects across two workspaces, with mixed statuses. Type a partial name into search — only matching projects remain. Switch to a workspace filter — only that workspace's matches remain. Switch the status tab to "Rendered" — only rendered projects across both filters remain. Clear the search — the workspace + status filters still apply. Reset all filters — the full list returns.

**Acceptance Scenarios**:

1. **Given** the project list contains projects "Spring sale", "Summer launch", and "Autumn promo", **When** the user types "sum" into search, **Then** only "Summer launch" remains.
2. **Given** the user has projects in workspaces A and B, **When** they pick workspace B in the workspace filter, **Then** only workspace B projects are listed.
3. **Given** mixed-status projects, **When** the user picks the "Published" tab, **Then** only published projects are listed.
4. **Given** a search term, a workspace filter, and a status tab are all set, **When** the list renders, **Then** only projects matching all three filters appear.
5. **Given** filters are active, **When** the user clears the search input, **Then** the workspace and status filters remain in effect.

---

### User Story 5 — Delete a project with confirmation across all storage (Priority: P2)

Each project card has a delete control. Clicking it shows a confirmation dialog that names the project and warns the action cannot be undone. On confirm, the project is removed from the user's project library, its persisted thumbnail image is removed, and the project no longer appears in any list — on this device or any other device the same user signs in on. Cancelling the dialog leaves everything intact.

**Why this priority**: Without an explicit delete with confirmation, users cannot reclaim quota or clean up abandoned drafts safely. P2 because it is a maintenance feature, not part of the headline workflow — and the limit-blocked save in Story 2 still gives the user a clear path forward (upgrade) even before delete ships.

**Independent Test**: Save a project that has a thumbnail. Click delete on its card. The confirmation dialog appears naming that project. Cancel — the project remains. Click delete again, confirm — the project disappears from the list. Reload the page — still gone. Sign in on a second device — still gone there too. The previously stored thumbnail image is no longer reachable.

**Acceptance Scenarios**:

1. **Given** a saved project with a thumbnail, **When** the user clicks delete on its card, **Then** a confirmation dialog appears that names the project and warns the action is irreversible.
2. **Given** the confirmation dialog is open, **When** the user cancels, **Then** the project remains in the list and on all storage tiers.
3. **Given** the user confirms deletion, **When** the request completes, **Then** the project is removed from local storage, removed from the user's cloud project library, and its persisted thumbnail image is removed.
4. **Given** a project was deleted on device A, **When** the user opens the same account on device B, **Then** the project is absent from device B's list.
5. **Given** the user is at their plan's project cap, **When** they delete a project, **Then** they can immediately save a new project (the deletion frees one quota slot).

---

### User Story 6 — Continuous auto-save with visible save indicator (Priority: P2)

While the user is working through Steps 1–5, the system continuously persists their work in the background. After any meaningful change (a form field, a tone selection, a hook pick, a render completion, a caption edit), a save is queued; multiple rapid changes coalesce into a single save so the user is not penalised for typing fast. The application header surfaces a small status indicator: while a save is in flight it shows "Saving…", and for two seconds after a successful save it shows "Saved" with a checkmark, then quietly disappears. The user does not have to click an explicit save button to keep their progress.

**Why this priority**: Eliminates the "did I save?" anxiety that comes with multi-step pipelines and prevents lost work from accidental tab close. P2 because the explicit save path users have today still works — auto-save is additive insurance, not a blocker for the rest of the phase.

**Independent Test**: Begin a new project and fill in a Step 1 field. Wait — within a short window, the header indicator briefly shows "Saving…" then "Saved", and the project appears in the project list as a draft without the user clicking a save button. Type ten characters into a field in quick succession — the indicator only shows one save cycle, not ten. Close the tab and reopen the app — the project is recoverable from the list with the data the user last entered.

**Acceptance Scenarios**:

1. **Given** the user is editing any field in Steps 1–5, **When** they make a change and pause briefly, **Then** the system queues and completes a background save and the header indicator briefly shows "Saving…" then "Saved".
2. **Given** the user is typing rapidly, **When** several edits happen in quick succession, **Then** the system coalesces them into a single save rather than firing one save per keystroke.
3. **Given** an auto-save completes, **When** two seconds have passed, **Then** the "Saved" indicator quietly disappears (not persistent visual noise).
4. **Given** the user closes the tab in the middle of editing without clicking any explicit save, **When** they reopen the app and look at their project list, **Then** the in-progress project is present with the data they last entered before closing.
5. **Given** a background save fails (e.g., transient network issue), **When** the failure is observed, **Then** the indicator surfaces a non-blocking error state and the system retries on the next change without losing the user's in-progress work.

---

### User Story 7 — Team members can list projects in their accessible workspaces (Priority: P3)

A team member who has been granted access to one or more of an account owner's workspaces can list the saved projects within those workspaces. Members never see projects from workspaces they do not have access to, regardless of how the list is requested. Listings are paginated for large project sets so a busy workspace does not flood a member's view in one request.

**Why this priority**: Extends the workspace-scoping model from Phase 12 into the project library so a team member working on a client brand can pick up a project the owner started. P3 because the single-operator Scale and Pro/Starter cases (the majority of users at launch) already get full value from Stories 1–6 without team listing.

**Independent Test**: An owner creates two projects in workspace A and one in workspace B. A team member with access to workspace A only requests the project list for workspace A — they see both projects there. They request the list for workspace B — the request is refused with an access-denied response. The owner requests both lists — both succeed.

**Acceptance Scenarios**:

1. **Given** a team member has access to workspace A only, **When** they request the project list for workspace A, **Then** they see all projects from any team member or the owner produced within workspace A.
2. **Given** a team member has access to workspace A only, **When** they request the project list for workspace B, **Then** the request is refused with an access-denied response.
3. **Given** a workspace contains a large number of projects, **When** any user lists that workspace's projects, **Then** the response is paginated (a bounded number of records per page, plus a way to ask for the next page) and ordered by most recent first.
4. **Given** any caller, **When** they apply a status filter at list time, **Then** only projects matching that status are returned within the same access rules.
5. **Given** a non-team user, **When** they request the project list for a workspace belonging to another user, **Then** the request is refused.

---

### Edge Cases

- A user starts a project, never reaches Step 4, and abandons it. The project remains as a draft with a placeholder thumbnail. It still counts against the per-plan project cap — so Starter users with 10 abandoned drafts cannot save an 11th project until they delete some.
- A render completes but the temporary image source becomes unavailable before the persistent thumbnail is stored. The thumbnail field is left unset and the card shows the draft placeholder; the project's status is still treated as rendered because the project has render history. A subsequent successful render replaces and persists the thumbnail.
- A user deletes a project from device A while device B is showing it. On device B the next list refresh removes the card; if the user attempts to open the card before refresh, the open fails gracefully with a "no longer available" message.
- Two devices auto-save the same project within seconds of each other. The latest save wins at the project level (last-write-wins) consistent with the conflict policy already established in Phase 12 for workspace edits — no merge UI is shown.
- A user is over their project cap because of a plan downgrade and tries to *update* an existing project. The update is allowed (the cap applies only to creating new projects).
- A user clicks the Step 4 dot on a project whose thumbnail was deleted (e.g., manually purged storage). The project still loads to Step 4; the thumbnail simply renders as the placeholder until a re-render produces a new one.
- Status filter "Published" returns zero projects for a user who has never connected Meta. The list shows an empty state explaining that no projects have been pushed yet.
- A project's workspace was deleted in Phase 12 (workspaces soft-delete + cascade re-assignment). The project surfaces under the default workspace and the workspace filter for the deleted workspace is not selectable.
- A previously `published` project loses its Meta ad ID (e.g., the user disconnects Meta or the ad is removed in Meta Business Manager). The project remains badged `published` per FR-002 — the badge reflects the project's publishing history, not the current state of the Meta binding. The user can still re-render and re-publish from the project; doing so does not change the latched status.
- The user is offline (or their auth session expired) and continues editing for several minutes. Local saves keep succeeding so no work is lost; cloud saves fail. After 3 consecutive cloud-save failures the persistent banner appears with a "Try saving now" action (FR-017). The user reconnects, the next cloud save succeeds, the banner clears automatically.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each saved project MUST carry a status of exactly one of: draft, rendered, published. Status MUST be derivable from the project's data: a project with at least one rendered image entry is at minimum rendered; a project for which a Meta push has been recorded is at minimum published; otherwise draft.
- **FR-002**: Status MUST be (re)computed at save time based on the project's current data, persisted with the project, and MUST be monotonically non-decreasing along the order draft → rendered → published. A project may move forward in this order or stay where it is, but MUST never move backward — in particular, a project that has ever been recorded as published MUST remain published even if its Meta ad ID, Meta link, or owning workspace's Meta binding is later removed. This ensures the badge reflects the project's publishing history, not a transient Meta-binding state.
- **FR-003**: Each saved project MUST be able to carry a persistent thumbnail image reference. Projects with no render MUST have no thumbnail reference.
- **FR-004**: When a successful render for a project produces a new "cover image" — defined per project format as the single rendered image (single format), slide 1 (carousel format), or item 1 (batch format) — the system MUST persist a durable thumbnail reference pointing at that cover image. The thumbnail MUST survive page reload, sign-out / sign-in, and use on a different device by the same account. Renders of later slides (slides 2+) or later batch items (items 2+) MUST NOT replace the thumbnail. A re-render of Step 4 that produces a new cover image (including a format switch) MUST refresh the thumbnail to the new cover image.
- **FR-005**: The project list MUST visually display, for every project, the project name, the timestamp of last update, the status as a badge that combines a colour and a short text label (so the status is readable without colour and survives a grayscale screenshot), and the thumbnail (or a placeholder when no thumbnail exists). The list and the per-card step navigator MUST mirror the user's active text direction (RTL when the active language is Arabic, LTR otherwise), consistent with existing launched surfaces.
- **FR-006**: Saved-project capacity per user MUST be enforced as: Starter = 10, Pro = 30, Scale = unlimited. The cap MUST be sourced from the per-plan configuration so plan-config changes propagate without code edits.
- **FR-007**: The capacity check MUST run at save time for *new* projects only. Updating an existing project MUST never be blocked by the capacity check, even if the user is currently over their cap (e.g., after a plan downgrade).
- **FR-008**: When a save is blocked by capacity, the user MUST see an inline message that names their current plan, names the cap that was hit, and surfaces an upgrade path.
- **FR-009**: Each project card MUST display a step navigator showing one dot per pipeline step. A dot MUST appear "filled" when the project has data for that step and "empty" otherwise. Step → data mapping: Step 1 = inputs present, Step 2 = tone selection present, Step 3 = build plan present, Step 4 = at least one rendered image present, Step 5 = caption text present.
- **FR-010**: Clicking a filled step dot MUST load the project and place the user at that step. Clicking an empty (or otherwise unavailable) dot MUST be a no-op. Opening the project via its card body (not a specific dot) MUST resume at the project's last active step (existing behaviour preserved).
- **FR-011**: When a step-targeted load is requested for a step whose data is missing or invalid, the system MUST fall back to the project's last active step rather than landing the user on a broken step.
- **FR-012**: The project library view MUST provide three composable filters: a name search (case-insensitive substring match), a workspace filter (single workspace), and a status filter (All / Draft / Rendered / Published). All three MUST be applicable at the same time, and clearing any one MUST leave the others in effect.
- **FR-013**: Each project card MUST expose a delete control. Selecting it MUST present a confirmation dialog that names the project and warns the action is irreversible.
- **FR-014**: Confirming delete MUST remove the project from local storage, from the user's cloud project library, and MUST remove the persisted thumbnail image so it is no longer reachable. The project MUST stop appearing in lists on every device the user signs in on.
- **FR-015**: Deletion MUST be idempotent: a delete request for an already-removed project MUST succeed silently rather than error.
- **FR-016**: While the user is editing within Steps 1–5, the system MUST persist their work continuously in the background. Saves MUST be coalesced (debounced) so a burst of rapid edits results in a small number of saves, not one save per keystroke.
- **FR-017**: The application header MUST display a save status indicator: "Saving…" while a save is in flight, then "Saved" with a checkmark for a brief window after success, then disappear quietly. A failed background save MUST surface a non-blocking error state without destroying the user's in-progress work; the system MUST retry on the next change. After **3 consecutive failed cloud saves**, the indicator MUST escalate to a **persistent, non-blocking banner** that names the problem (e.g., "Saving to cloud failed — your work is safe locally") and exposes a manual "Try saving now" action. Local-only persistence MUST continue in the background throughout the failure window so the user's edits are never one tab-close away from being lost. The banner MUST be dismissed automatically as soon as the next cloud save succeeds. The UI MUST NOT be hard-blocked at any point in this flow.
- **FR-018**: Auto-save MUST never silently overwrite the user's later, in-memory edits with an older snapshot returned from a slow save round-trip; in any race, the user's most recent in-memory state MUST prevail.
- **FR-019**: A backend project-listing capability MUST exist that accepts optional filters (workspace, status, page size, page cursor) and returns the matching projects ordered most recent first, paginated.
- **FR-020**: Project listing MUST honour workspace access rules established in Phase 12: a team member MUST only receive projects from workspaces they have been granted access to. Requests for workspaces the caller cannot see MUST be refused with an access-denied response. The account owner MUST always be able to list projects from any of their own workspaces.
- **FR-021**: Across all storage tiers (local + cloud), the project record set for a given user MUST be reconciled on sign-in: cloud and local records MUST be merged and de-duplicated, with the more recently updated record winning per project. (Existing reconciliation behaviour MUST be preserved; no regression.)
- **FR-022**: Pre-existing saved projects with no status field MUST be treated as draft until they are next saved, at which point status MUST be computed and persisted per FR-001/FR-002 with no user action required.
- **FR-023**: Pre-existing saved projects with no thumbnail MUST display the placeholder. The first save after a render MUST produce and persist the durable thumbnail per FR-004.

### Key Entities *(include if feature involves data)*

- **Saved Project**: A user-owned record of one in-progress or completed ad creative run. Carries a name, an owning user, an owning workspace, a last-update timestamp, the inputs and outputs of every pipeline step the user has completed (inputs, tone/concept selection, build plan, render history, caption variants, batch results), the project's current pipeline step, a *status* (draft / rendered / published — new in this phase), and a *thumbnail reference* (new in this phase) pointing at the persisted first-render image when one exists. A saved project belongs to exactly one workspace; visibility for non-owners follows the workspace-access rules from Phase 12.
- **Project Thumbnail Asset**: The durable image stored to back a saved project's thumbnail reference. Created when the project's first render completes; deleted when the project itself is deleted. Lives in user-scoped storage so other accounts cannot reach it.
- **Project List Filter Set**: The composable set of filters used when rendering or fetching a project list — name search, workspace, status, page size, page cursor. Not persisted; reset per session.
- **Plan Project Cap**: A per-plan numeric cap (10 for Starter, 30 for Pro, unlimited for Scale) sourced from the existing plan configuration record. Read at new-project save time to enforce capacity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of saved projects expose a status of exactly one of draft / rendered / published, and the displayed status matches the project's underlying data state on every render.
- **SC-002**: 100% of projects whose pipeline has produced at least one rendered image display a real thumbnail in the project list (not a placeholder), measured across page reload, sign-out / sign-in, and device switch within the same account.
- **SC-003**: A user can locate a target project in a list of 30 projects and resume work at the desired pipeline step in under 30 seconds end-to-end (open list → identify project via thumbnail and badge → click target step dot → land at that step).
- **SC-004**: Attempting to save a new project while at the per-plan cap is refused 100% of the time and surfaces an upgrade-path message within the same interaction (no silent loss, no separate billing detour required to discover the cap).
- **SC-005**: 0% of saved projects exceed the user's plan cap as a result of the new-project save path. (Pre-existing over-cap states from plan downgrades are tolerated and editable, but the new-project path never adds to them.)
- **SC-006**: After any single edit in Steps 1–5, the corresponding draft project is reachable from a fresh tab open within 60 seconds, with no explicit save action by the user.
- **SC-007**: A burst of 10 rapid edits within 5 seconds produces no more than 2 background save round-trips (coalescing target).
- **SC-008**: Deleted projects disappear from the project list on a second signed-in device within one list refresh cycle, and 0% of project deletions leave an orphaned thumbnail asset reachable to any user.
- **SC-009**: A team member listing projects for a workspace they do not have access to receives an access-denied response on 100% of attempts, with no project metadata leaked in the response payload.
- **SC-010**: Pre-existing saved projects (created before this phase) load and display correctly with a derived draft status until next save, with zero user-visible errors and zero data loss during the migration window.

## Assumptions

- **Phase 10 (favourites + workspace scoping) and Phase 12 (workspace logic) are in place.** Workspace IDs on saved projects, the workspace switcher, and the team workspace-access matrix are pre-existing; this phase consumes them and does not redefine them.
- **The per-plan saved-project caps are 10 / 30 / unlimited (Starter / Pro / Scale).** These come from `LAUNCH_MATRIX.md` row "Saved project limits" and the `savedProjectLimit` field on `PLANS`. This spec treats them as authoritative; any later change is a config change, not a re-spec.
- **Status taxonomy is exactly draft / rendered / published.** No additional intermediate statuses (e.g., "scheduled", "archived") are in scope for this phase.
- **A project counts as published when a Meta ad ID has been recorded against it.** Other distribution targets are not in scope for this phase.
- **The project's "cover image" is the canonical thumbnail.** Cover image is defined per format: the single rendered image for single-format projects; slide 1 for carousel projects (slide 1 is the intentional intro/cover that sparks curiosity and prompts the swipe); item 1 for batch projects (batch items are independent single renders with no inherent ordering, so item 1 is a stable deterministic pick rather than a "best" one). Re-renders of later carousel slides, later batch items, or reflow outputs do not replace the thumbnail. A Step-4 re-render that produces a new cover image — including a format switch — does refresh the thumbnail. Manual thumbnail re-pick is out of scope.
- **Thumbnail images live in user-scoped storage with an access boundary that mirrors the saved-project access rules.** Delete cascades from project → thumbnail.
- **Conflict policy on concurrent edits is last-write-wins at the project level**, mirroring the policy adopted in Phase 12 for workspace edits. No merge UI, no revision-token rejection.
- **Auto-save coalescing window is "tens of seconds, not seconds".** A short single-digit-seconds window risks one save per keystroke; a multi-minute window risks losing too much on tab close. The implementation may pick the exact debounce, with the FR-016 / SC-007 envelope as the constraint.
- **The migration of pre-existing projects is opportunistic, not bulk.** Old projects load as draft and are upgraded on next save (FR-022). No batch rewrite is required.
- **The continuous auto-save indicator lives in the application header**, alongside the existing app-wide status surface, rather than per-step. This mirrors how other launch-quality status indicators (workspace switch, save state) are surfaced.
- **List pagination ordering is most-recent-first** by last-update timestamp. The exact page size is an implementation choice consistent with FR-019; clients SHOULD treat the cursor as opaque.
- **Search is name-substring only, case-insensitive.** Tag search, full-text search across captions/inputs, and fuzzy matching are out of scope for this phase.
- **No "archive" or "soft delete" of projects.** Delete is permanent (with the confirmation dialog as the safety net), unlike the workspace soft-delete model from Phase 12.
- **The Phase 13 surface is additive to existing save/load.** Existing flows (auto-save on draft creation, cloud + local merge on login, legacy mode sanitiser on load) remain in effect and must not regress.
- **Accessibility and i18n stance is "mirror existing launched surfaces".** No new formal accessibility commitments (e.g., WCAG conformance level, full keyboard-navigation guarantees, screen-reader-only labels) are introduced for this phase beyond the colour + text-label badge pattern in FR-005 and the natural RTL mirroring of layout already used elsewhere in the app.
