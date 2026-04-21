# Feature Specification: Favorites & Workspace

**Feature Branch**: `010-favorites-workspace`  
**Created**: 2026-04-05  
**Status**: Draft  
**Input**: User description: "Phase 10 — Favorites & Workspace: fix bookmark state persistence, add per-step favorites panels with load/edit/save capabilities, and enable team-scoped favorites within shared workspaces."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persistent Bookmark State (Priority: P1)

A user opens a generation step (hooks, concepts, designs, or captions) where they previously bookmarked an output. The bookmark icon immediately reflects the saved state (filled/amber) without requiring the user to re-click it. Currently the bookmark always starts empty regardless of actual saved state.

**Why this priority**: This is the foundational fix — every other favorites feature depends on users trusting that their saved state is accurately reflected. Without this, users lose confidence in the bookmark system entirely.

**Independent Test**: Can be fully tested by bookmarking a generation, refreshing the page, and verifying the bookmark icon appears filled. Delivers trust in the save system.

**Acceptance Scenarios**:

1. **Given** a user has previously favorited a generation, **When** they navigate to the step displaying that generation, **Then** the bookmark icon appears filled (amber) immediately on page load.
2. **Given** a user has never favorited a generation, **When** they view that generation, **Then** the bookmark icon appears empty (outline only).
3. **Given** a user favorites a generation and then navigates away and returns, **When** the step re-loads, **Then** the filled bookmark state persists correctly.

---

### User Story 2 - Per-Step Favorites Panel with Load (Priority: P1)

A user working on Step 2 (hooks) wants to reference or reuse a previously saved hook. They click a "Saved Hooks" toggle button in the step header, which opens a slide-in panel showing all their saved hooks. They click "Load" on one, and the saved hook text populates the editable fields in Step 2. The same pattern applies to Steps 3, 4, and 5 for their respective content types.

**Why this priority**: This is the core value proposition — turning favorites from a passive "save for later" feature into an active workflow tool that accelerates creative iteration.

**Independent Test**: Can be fully tested by saving a hook, opening the Saved Hooks panel in Step 2, clicking Load, and verifying the hook text appears in the editable fields. Delivers reusable creative assets within the generation flow.

**Acceptance Scenarios**:

1. **Given** a user has saved hooks, **When** they click "Saved Hooks" in Step 2, **Then** a panel slides in showing all saved hooks with preview text, date, and Load/Remove buttons.
2. **Given** the user clicks "Load" on a saved hook, **When** the hook data is applied, **Then** the hook text (`hookText`) and subhead (`subheadText`) populate the Step 2 editable fields.
3. **Given** the user clicks "Load" on a saved concept in Step 3, **When** the concept is applied, **Then** the concept text and build plan render as if freshly generated.
4. **Given** the user clicks "Load" on a saved design in Step 4, **When** the design is applied, **Then** the saved image displays in the Step 4 result area.
5. **Given** the user clicks "Load" on a saved caption in Step 5, **When** the caption is applied, **Then** the caption text populates the editable caption field.
6. **Given** no favorites exist for a step's phase, **When** the user opens the favorites panel, **Then** an empty state message guides them to bookmark outputs.
7. **Given** the user clicks "Remove from favorites" on an item, **When** confirmed, **Then** the item disappears from the panel immediately.

---

### User Story 3 - Edit and Save Back to Favorites (Priority: P2)

A user loads a previously saved hook from favorites, edits it, and generates a new version. The system prompts them: "Update saved favorite with this new version?" with options to overwrite the existing favorite or keep both the old and new versions.

**Why this priority**: Completes the creative iteration loop — without this, users can load but not save improvements, breaking the workflow.

**Independent Test**: Can be fully tested by loading a saved favorite, editing it, generating new output, and verifying both "Update" and "Keep both" options work correctly.

**Acceptance Scenarios**:

1. **Given** a user has loaded a favorite and generated new output, **When** the generation completes, **Then** the system shows a prompt with "Yes, update" and "Keep both" options.
2. **Given** the user chooses "Yes, update", **When** confirmed, **Then** the existing favorite record is overwritten with the new output data.
3. **Given** the user chooses "Keep both", **When** confirmed, **Then** the new output is saved as a separate favorite alongside the original.
4. **Given** the user generates new output without having loaded a favorite, **When** generation completes, **Then** no update prompt appears (standard bookmark flow only).

---

### User Story 4 - Team-Scoped Favorites (Priority: P2)

A team member working in a shared workspace can see favorites saved by other team members alongside their own. When a workspace is active, the favorites panel shows all team favorites for that workspace, enabling creative collaboration and reuse across the team.

**Why this priority**: Unlocks collaborative value — teams can build on each other's best outputs instead of duplicating effort.

**Independent Test**: Can be fully tested by having two team members in the same workspace each save a favorite, then verifying both members see both favorites in their panels.

**Acceptance Scenarios**:

1. **Given** a team member saves a hook as a favorite in a shared workspace, **When** another team member opens the Saved Hooks panel in the same workspace, **Then** the saved hook appears in their panel.
2. **Given** a user is not part of any workspace (solo user), **When** they view their favorites panel, **Then** only their own favorites are shown.
3. **Given** a team member removes any favorite in the workspace (including one saved by another member), **When** other team members refresh the panel, **Then** the removed item no longer appears.

---

### User Story 5 - Favorites Count Badge (Priority: P3)

Each step header shows a count badge next to the "Saved [X]" toggle button indicating how many favorites exist for that step's phase (e.g., "Saved Hooks (3)"). The count updates in real time as items are added or removed.

**Why this priority**: A quality-of-life enhancement that gives users visibility into their saved assets without opening the panel.

**Independent Test**: Can be fully tested by adding and removing favorites and verifying the badge count updates immediately.

**Acceptance Scenarios**:

1. **Given** a user has 3 saved hooks, **When** they view Step 2, **Then** the toggle button shows "Saved Hooks (3)".
2. **Given** a user saves a new hook, **When** the save completes, **Then** the badge count increments without a page refresh.
3. **Given** a user removes a favorite, **When** the removal completes, **Then** the badge count decrements immediately.
4. **Given** zero favorites exist for a phase, **When** the user views the step, **Then** the badge shows "Saved Hooks (0)" or hides the count.

---

### User Story 6 - Re-generate from Saved Design (Priority: P3)

A user loads a saved design in Step 4 and wants to iterate on it. They click "Edit & Re-generate" which pre-fills the Step 1 inputs from the saved generation's input fields and navigates to Step 3 to re-run from the blueprint stage.

**Why this priority**: Advanced workflow feature that enables deep iteration on visual outputs, but less frequently used than basic load/save.

**Independent Test**: Can be fully tested by loading a saved design, clicking "Edit & Re-generate", and verifying Step 1 inputs are restored and navigation goes to Step 3.

**Acceptance Scenarios**:

1. **Given** a user loads a saved design in Step 4, **When** they click "Edit & Re-generate", **Then** Step 1 input fields are populated with the original generation's input data.
2. **Given** Step 1 inputs are pre-filled from a saved design, **When** the navigation completes, **Then** the user lands on Step 3 ready to re-run the blueprint generation.

---

### Edge Cases

- What happens when a user tries to load a favorite whose underlying generation record has been deleted? The system should show a "This saved item is no longer available" message and offer to remove it from favorites.
- What happens when a user loads a favorite into a step but the step's data schema has changed since the favorite was saved? The system should load available fields and leave missing fields empty with a notice.
- What happens when two team members simultaneously edit and save the same favorite? The last write wins, and the other user sees the updated version on their next panel refresh.
- What happens when a user's workspace membership is revoked? All favorites bearing that `workspaceId` — both teammates' saves and the ex-member's own — disappear from their panel. Records stay attached to the workspace; none follow the user into personal scope. The ex-member's personal-scope favorites (records with no `workspaceId`, or saved before joining the workspace) are unaffected.
- What happens when the favorites panel is open and the user bookmarks a new item from the current step? The new item should appear in the panel in real time.
- What happens when a user clicks "Load" while they have unsaved edits in the current step? The system auto-saves (bookmarks) the current output first, then loads the selected favorite.
- What happens when a user or workspace has more than 100 favorites in a single phase? The panel renders the 100 newest (per active sort) and exposes a "Show older" control that loads the next page of 100; pagination continues until all items are reachable.
- What happens when the Firestore snapshot connection is lost mid-session? The panel keeps displaying the last successful snapshot, shows an inline "Offline — showing last saved list" banner, and automatically resumes live updates when the connection recovers — no manual retry or refresh required.

## Clarifications

### Session 2026-04-05

- Q: What actions can team members perform on other members' favorites? → A: Full access — team members can view, load, edit, and remove any favorite in the workspace.
- Q: What happens when "Load" would overwrite unsaved work in the current step? → A: Auto-save then load — system automatically bookmarks the current work before loading the favorite.
- Q: How are items in the favorites panel sorted? → A: User-sortable — default newest first, with a toggle to switch between newest/oldest/alphabetical.

### Session 2026-04-21

- Q: Can a team member mark a favorite as private (personal-only) while working in a team workspace? → A: No — team workspaces auto-share every favorite; there is no private-in-team mode. Solo users (no active workspace) remain personal-only by construction.
- Q: What is the maximum number of favorites shown in a panel per phase, and how are overflow items accessed? → A: Soft cap of 100 newest items per phase by default, with a "Show older" control that loads the next page of 100. No hard cap on total favorites stored.
- Q: When a user's workspace membership is revoked, what happens to favorites they personally saved in that workspace? → A: Favorites stay with the workspace. The ex-member loses access to every favorite bearing that `workspaceId` — both teammates' saves and their own. No records follow the user into personal scope.
- Q: What does the favorites panel show when the Firestore snapshot connection is lost or errors transiently? → A: Keep the last successful snapshot visible, surface a non-blocking inline banner ("Offline — showing last saved list"), and auto-resume live updates when the connection recovers. No manual retry required.
- Q: What accessibility standard must the favorites panel meet? → A: WCAG 2.1 AA — full keyboard operability, visible focus states, ARIA labels on every interactive control (toggle, Load, Remove, sort, Show older), and `aria-live` announcement of count-badge changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST load and display the accurate saved/unsaved state of the bookmark icon for every generation when the page loads.
- **FR-002**: System MUST provide a real-time subscription to the user's favorited generations, filtered by content phase (hooks, concepts, render, caption).
- **FR-003**: System MUST display a per-step favorites panel accessible via a toggle button in each step header (Steps 2–5).
- **FR-004**: Each favorites panel MUST show: content preview, date saved, and "Load" and "Remove from favorites" actions for each item. Items MUST be sortable by the user with three options — newest first, oldest first, alphabetical — and newest first MUST be the default. The **alphabetical** sort keys on the item's primary text preview: `hookText` for the hooks phase, `conceptText` for concepts, `captionText` for captions. For the **render** phase, items are images with no text key; alphabetical on `render` MUST therefore fall through to the underlying timestamp order (equivalent to newest-first) rather than mixing image items into a meaningless text comparison.
- **FR-005**: Clicking "Load" on a favorite MUST populate the corresponding step's editable fields with the saved content data. If the step has unsaved work, the system MUST automatically bookmark the current output before loading the favorite.
- **FR-006**: System MUST support updating an existing favorite record with new output data after the user edits and regenerates.
- **FR-007**: After regenerating from a loaded favorite, the system MUST display a centered modal dialog over a dimmed page backdrop offering two actions — "Yes, update" (overwrites the existing favorite via `updateFavoriteRecord`) and "Keep both" (bookmarks the new generation as a separate favorite alongside the original). Clicking the dimmed backdrop MUST cancel the prompt without applying either action and MUST clear the `loadedFavoriteId` tracking. The prompt MUST NOT appear unless a favorite was previously loaded in that step (i.e., `loadedFavoriteId` is non-null at the moment regeneration completes).
- **FR-008**: System MUST scope favorites to the active workspace when the user is a team member or team owner, showing all team members' favorites within that workspace. All team members have full access (view, load, edit, remove) to any favorite in the workspace. There is no private-in-team mode: when a user is in an active workspace, every favorite they create is automatically team-visible, and no visibility toggle is exposed.
- **FR-009**: When no workspace is active, favorites MUST be scoped to the individual user only. Favorites a user saved while a member of a workspace MUST remain attached to that workspace and MUST NOT migrate into the user's personal scope if the user's workspace membership is later revoked.
- **FR-010**: Each step's "Saved [X]" toggle button MUST display a real-time count badge showing the number of favorites for that phase.
- **FR-011**: The "Edit & Re-generate" action on a saved design MUST restore the original generation's input fields and navigate the user to the blueprint stage (Step 3).
- **FR-012**: Favorites panel MUST display an appropriate empty state message when no favorites exist for a given phase.
- **FR-013**: Removing a favorite MUST immediately remove the item from the panel without requiring a page refresh.
- **FR-014**: Each favorites panel MUST render at most 100 items per phase on initial open (ordered by the active sort), and MUST expose a "Show older" control that loads the next page of 100 items when more exist. There is no hard cap on the total number of favorites a user or workspace may store.
- **FR-015**: When the Firestore snapshot connection is lost or errors transiently, the panel MUST continue to display the last successful snapshot, MUST surface a non-blocking inline banner indicating the list is offline/stale, and MUST automatically resume live updates when the connection recovers without requiring user action.
- **FR-016**: The favorites panel and its controls MUST meet WCAG 2.1 AA. Specifically: (a) the "Saved [X]" toggle, every list item, Load, Remove, sort control, and "Show older" control MUST be operable by keyboard with a visible focus indicator; (b) every interactive control MUST expose an accessible name via ARIA or text; (c) count-badge changes and snapshot-offline banner appearance MUST be announced via an `aria-live` region; (d) RTL content previews MUST preserve `dir="rtl"` and correct focus order.

### Key Entities

- **Favorite**: A generation record with `feedback.savedToFavorites` set to true. Key attributes: generation ID, user ID, workspace ID, content phase, output data (hook text, concept text, image URL, caption text), date saved.
- **Workspace**: A shared context (derived from team/billing state) that determines the scope of visible favorites. Linked to team membership.
- **Generation Record**: The existing record in the generations collection that stores all output data and input context for a single generation step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users see the correct bookmark state (saved or unsaved) on page load 100% of the time, with no visual flicker or incorrect initial state.
- **SC-002**: Users can open the favorites panel, select a saved item, and load it into the active step in under 3 seconds.
- **SC-003**: Real-time updates (adding, removing, or editing favorites) reflect in all open panels within 2 seconds without requiring a page refresh.
- **SC-004**: Team members in the same workspace see each other's favorites without any additional configuration or manual sharing steps.
- **SC-005**: 90% of users who save a favorite successfully load and reuse it within the same session or a future session.
- **SC-006**: The favorites count badge accurately reflects the current count at all times, including after add/remove operations.
- **SC-007**: An automated WCAG 2.1 AA audit (e.g., axe-core) on the favorites panel reports zero critical or serious violations, and a manual keyboard-only pass can open the panel, focus each item, trigger Load and Remove, change sort, and paginate via "Show older" without using a pointing device.

## Assumptions

- The existing `feedback.savedToFavorites` field on generation records is the source of truth for favorite status — no new collection is needed.
- The existing `toggleFavorite` function in `feedbackService` works correctly for adding/removing favorites and does not need to be rewritten.
- The `billingState` from Phase 8 is available and reliably provides `isTeamMember`, `isTeamOwner`, and workspace context for team scoping.
- The `generations` collection already contains all necessary output fields (`hookText`, `subheadText`, `conceptText`, `buildPlan`, `imageUrl`, `captionText`) and input fields for re-generation.
- Generation records carry a `workspaceId` field populated at creation time; team-scoped queries rely on this field being indexable alongside `feedback.savedToFavorites` and `output.phase`.
- The existing `PerformanceDashboard.tsx` Favorites tab (read-only, non-team-scoped) is out of scope for this feature; per-step panels become the primary favorites surface, but the dashboard tab is not modified or removed.
- Real-time subscriptions via Firestore snapshots are the appropriate mechanism for live updates in the favorites panel.
- The step UI components (Steps 2–5) expose state setters or a store mechanism that allows the favorites panel to inject loaded data into the active step's editable fields.
