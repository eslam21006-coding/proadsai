# Feature Specification: Workspace Logic (Scale Mode)

**Feature Branch**: `012-workspace-logic`
**Created**: 2026-04-21
**Status**: Draft
**Input**: User description: "Phase 12 — Workspace Logic (Scale Mode): give Scale-plan accounts true multi-workspace capability — each workspace ties to its own Meta ad account, scopes generations and saved projects, and exposes per-member access controls so team owners can carve up which workspaces each teammate sees. Covers rows 12.1–12.12 in docs/LAUNCH_MATRIX.md."

## Clarifications

### Session 2026-04-21

- Q: When an owner deletes a non-default workspace, is the workspace record gone permanently or retrievable? → A: Soft delete with a 30-day retention window; the workspace is hidden from all listings on delete and can be restored within 30 days by a support-initiated action, after which it is permanently purged.
- Q: When two edits to the same workspace race, how is the conflict resolved? → A: Last-write-wins at field granularity — each supplied field overwrites whatever value is currently stored, and fields not supplied in the request are left untouched. No revision token, no rejection on stale state.
- Q: Does the system need to record an audit log of workspace-access grants and revocations? → A: Yes — a minimal append-only audit entry per change (actor user ID, target member user ID, workspace ID, action grant-or-revoke, timestamp), readable by the account owner only. No structured export, retention policy, or admin query UI is in scope for this phase.
- Q: What minimum Meta permission is required on an ad account before it can be linked to a workspace? → A: Advertiser-or-higher — the role must permit ad creation/editing/publishing. Link attempts on ad accounts where the owner has only Analyst-or-lower (read-only) permission MUST be rejected with an explanatory error at link time, not silently accepted and failed later at push.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Scale owner creates, edits, and deletes workspaces (Priority: P1)

A Scale-plan account owner opens workspace settings and creates a second workspace for a new client brand. They fill in name, brand name, and brand colors. They later update the brand logo, and — once the client engagement ends — delete the workspace. They are never allowed to delete the default workspace, and any generations or saved projects that lived under the deleted workspace are automatically reassigned to the default so no creative history is lost. A Pro-plan owner who tries the same action sees a clear upgrade message explaining that multi-workspace is a Scale-plan capability.

**Why this priority**: Workspace CRUD is the foundation of everything else in this phase. Without create/edit/delete, per-workspace Meta accounts, workspace-scoped generations, and team access controls all have nothing to bind to. This is also the primary Scale-plan differentiator that the billing tier is built around.

**Independent Test**: A Scale owner creates a new workspace and confirms it appears in the workspace switcher. They rename it, confirm the new name persists across a reload. They attempt to delete the default workspace and are blocked with a message. They delete a non-default workspace and confirm prior generations from that workspace are still visible under the default workspace. A Pro owner attempts the same create action and receives an upgrade prompt.

**Acceptance Scenarios**:

1. **Given** a Scale-plan owner with 1 existing workspace, **When** they create a new workspace with name "Client Brand A" and brand colors, **Then** the workspace is saved, appears in the switcher, and can be made active.
2. **Given** a Scale-plan owner has reached the 10-workspace limit, **When** they attempt to create an 11th, **Then** the request is refused with a limit-reached message that names the current count and the cap.
3. **Given** a Pro-plan owner, **When** they attempt to create a second workspace, **Then** the request is refused with a "Scale plan required" message and a clear upgrade path is surfaced.
4. **Given** a Starter or free-tier owner, **When** they attempt to create a second workspace, **Then** the same Scale-plan required message is shown.
5. **Given** a workspace exists, **When** the owner edits any subset of its fields (name, brand name, brand colors, logo), **Then** only the provided fields change and unrelated fields are preserved.
6. **Given** a Scale owner attempts to delete the default workspace, **When** they confirm, **Then** the deletion is blocked with a "Default workspace cannot be deleted" message.
7. **Given** a non-default workspace has 4 generations and 2 saved projects attached, **When** the owner deletes it, **Then** all 6 records are reassigned to the default workspace and remain accessible there.

---

### User Story 2 — Per-workspace Meta ad account linking (Priority: P1)

A Scale owner has connected their Meta Business account and has access to five Meta ad accounts across different client brands. Inside each workspace, they open settings and pick which Meta ad account that workspace should use. When the team later generates ads inside "Client Brand A" workspace, pushes to Meta go to Client Brand A's ad account — not the user's default. The owner can also unlink a Meta ad account from a workspace at any time, which reverts that workspace to the account-level default. The system refuses to link an ad account the user has not actually connected.

**Why this priority**: Per-workspace Meta binding is the product reason a Scale owner needs multi-workspace in the first place — running multiple client brands from one account requires that each brand's ads publish to the correct Meta ad account. Without this, workspaces are only visual/organizational and the Scale tier has no concrete payoff.

**Independent Test**: A Scale owner with at least two connected Meta ad accounts opens workspace settings for workspace B, selects a specific ad account from the dropdown of connected accounts, saves, and sees the linked account name displayed in settings. They generate an ad inside workspace B and verify the push targets the linked ad account. They click "Disconnect" and confirm the workspace no longer reports a linked ad account. Attempting to link an account ID that is not in the user's connected accounts is rejected.

**Acceptance Scenarios**:

1. **Given** a Scale owner has connected 3 Meta ad accounts, **When** they open workspace settings for workspace B and pick one from the dropdown, **Then** that workspace stores the Meta ad account reference (ID and display name) and shows it in settings.
2. **Given** workspace B has a linked Meta ad account, **When** a generation inside workspace B is pushed to Meta, **Then** the push targets that workspace's linked ad account, not the user-level default.
3. **Given** workspace B has a linked Meta ad account, **When** the owner clicks "Disconnect", **Then** the linked ad account reference is cleared and generations from workspace B fall back to the user-level default.
4. **Given** the user has no Meta connection at all, **When** they open the Meta ad account section in workspace settings, **Then** the dropdown shows an empty state prompting them to connect Meta first.
5. **Given** a linked Meta ad account ID that is not present in the user's connected accounts, **When** the system receives a link request for it, **Then** the request is rejected and the workspace's Meta binding is unchanged.
6. **Given** an ad account the owner can see on their Meta connection but only at Analyst (read-only) or lower role, **When** they attempt to link it to a workspace, **Then** the request is rejected with a clear "insufficient Meta role" error pointing them to Meta Business Manager to request Advertiser access, and the workspace's Meta binding is unchanged.

---

### User Story 3 — Workspace-scoped generations and saved work (Priority: P1)

Every generation produced while a workspace is active is tagged with that workspace. The saved-projects list and generation history respect the active workspace: switching from "Client Brand A" to "Client Brand B" shows only Brand B's work. Team members who share a workspace can see that workspace's generations — but they can never see a workspace's generations if they do not have access to that workspace.

**Why this priority**: Without workspace scoping on the generation/projects data, the UI shows a mixed bag of every client's creative to everyone looking — the opposite of what a Scale owner with multiple client brands wants. This also underpins the team-access story: you cannot restrict access to something that was never tagged.

**Independent Test**: An owner makes one generation in workspace A and one in workspace B, switches the active workspace, and verifies each view shows only the matching workspace's work. A team member with access to workspace A but not workspace B is shown workspace A's generations but cannot see or open workspace B's generations even if given a direct link/ID.

**Acceptance Scenarios**:

1. **Given** the active workspace is A, **When** a generation completes, **Then** the generation record stores workspace A as its workspace reference.
2. **Given** the active workspace is B, **When** the user opens the generation history or saved-projects list, **Then** only workspace B's work is listed (plus records with no workspace reference from before this phase, treated per the migration rule in Assumptions).
3. **Given** a team member has access to workspace A but not workspace B, **When** they request the generation list for workspace B, **Then** the request is refused with an access-denied response.
4. **Given** a team member has access to workspace A, **When** they list generations for workspace A, **Then** they see both their own and other team members' generations produced within workspace A.
5. **Given** a non-team user, **When** they list generations for a workspace belonging to another user, **Then** the request is refused.

---

### User Story 4 — Team workspace access control (Priority: P2)

A Scale owner with a team opens the Team page and, next to each team member, ticks which workspaces that member may access. By default a member has no workspace access until the owner grants it explicitly. Members see only the workspaces they have been granted in their switcher and generation history; the owner always sees every workspace. When the owner revokes a member's access to a workspace, the member's switcher updates on next load and any active session in that workspace falls back to the first workspace they still have access to.

**Why this priority**: This gates the "Scale for agencies" use case, where one account owner serves many client brands with assigned teammates. It sits at P2 because the basic Scale use case (one owner, multiple workspaces, no team) already works after Stories 1–3; team access control adds headroom but is not required for a single-operator Scale account.

**Independent Test**: Owner creates 2 workspaces (A and B), invites 1 team member, assigns the member to workspace A only. Member logs in and sees only workspace A in their switcher. Owner adds workspace B to the member; member reloads and sees both. Owner revokes workspace A from the member; member reloads and sees only workspace B.

**Acceptance Scenarios**:

1. **Given** the owner has 2 workspaces and 1 team member with no workspace assignments, **When** the member logs in, **Then** their workspace switcher shows no selectable workspaces beyond a clearly disabled "No workspace access — contact your team owner" state.
2. **Given** the owner assigns workspace A to a team member, **When** the member reloads, **Then** the switcher shows workspace A and it can be selected and used.
3. **Given** a team member has access to workspace A only, **When** they open any workspace-scoped list (generations, saved projects, favorites), **Then** only workspace A's records are available.
4. **Given** the owner revokes workspace A from a member, **When** the member reloads, **Then** workspace A is removed from their switcher and they are returned to whatever remaining workspace they have access to (or the "no access" state).
5. **Given** the owner, **When** they open the switcher, **Then** all workspaces for the account are visible regardless of any team-access matrix.

---

### User Story 5 — Workspace switch guard during an in-progress generation (Priority: P2)

A user is halfway through a generation (has moved past Step 1 and has entered data in later steps) and clicks the workspace switcher. Instead of silently wiping the in-progress work, the system interrupts with a dialog: "Switching workspace will start a new project. Save current work?" with options "Save & Switch", "Discard & Switch", and "Cancel". "Save & Switch" persists the current draft before switching workspaces; "Discard & Switch" throws it away; "Cancel" leaves the active workspace unchanged.

**Why this priority**: Prevents a silent-data-loss foot-gun that becomes more likely the moment multi-workspace exists. It is P2 because it is a guardrail around an existing flow rather than net-new functionality, and the core Scale value can be delivered without it — but shipping multi-workspace without this guard is user-hostile.

**Independent Test**: Begin a generation, fill in data in Step 2, click the workspace switcher to pick a different workspace. Confirm the dialog appears with all three options. "Cancel" keeps the workspace and the draft as-is. "Discard & Switch" wipes the draft. "Save & Switch" saves a draft project and then switches.

**Acceptance Scenarios**:

1. **Given** the user is on Step 1 with no data entered, **When** they pick a different workspace, **Then** the switch happens immediately without prompting.
2. **Given** the user has entered data in Step 2 or later, **When** they pick a different workspace, **Then** the switch guard dialog appears before the switch is committed.
3. **Given** the switch guard is open, **When** the user clicks "Cancel", **Then** the active workspace does not change and the current in-progress work is unchanged.
4. **Given** the switch guard is open, **When** the user clicks "Save & Switch", **Then** the current in-progress work is saved as a draft project against the current workspace, and only then does the active workspace change.
5. **Given** the switch guard is open, **When** the user clicks "Discard & Switch", **Then** the in-progress work is cleared and the active workspace changes.

---

### Edge Cases

- A Scale subscription downgrades to Pro while the account has 5 workspaces. Existing workspaces are not deleted. The owner retains read/edit/delete access to all existing workspaces but cannot create new ones while on Pro. (See Assumptions — downgrade grace rule.)
- A user's Meta connection expires or is revoked while workspaces still reference Meta ad accounts. Linked references remain stored but generations in those workspaces fall back to showing a "Reconnect Meta" banner rather than silently pushing to a broken account.
- The default workspace reference is ever missing (corrupted state). The first workspace created at account setup is the default, and the system refuses any operation that would leave the account with zero workspaces.
- A team member's session is active in workspace A when the owner revokes workspace A. The member's next workspace-scoped action fails with an access-denied response and the client redirects to a workspace they still have access to (or the "no access" empty state).
- Two team members with shared access to workspace A both generate at the same time. Each generation is tagged with workspace A and attributed to the correct user; neither overwrites the other.
- Two owner sessions edit the same workspace at the same time — one renames the workspace, the other changes the brand primary color. Both writes succeed; the workspace ends up with the new name AND the new brand primary color, because field-level last-write-wins applies per field supplied in each request.
- A workspace is deleted while another team member has it open. The member's next workspace-scoped action fails gracefully and the client switches them to the default workspace. The workspace enters the 30-day soft-delete window and disappears from their switcher on next load.
- A workspace was deleted 10 days ago and the owner asks support to restore it. The workspace reappears in the switcher, all team-member access entries are re-activated, and the generations that had been reassigned to the default workspace move back to the restored workspace with their original workspace reference intact.
- A workspace was deleted 31 days ago. The record has been permanently purged; no restore is possible even by support. Generations that were reassigned to the default workspace remain there permanently.
- An ad account that was linked to a workspace is removed from the user's Meta account (account-level disconnect). The workspace keeps the stored reference but generations surface a reconnect prompt rather than a silent failure.
- An ad account that was linked to a workspace at Advertiser role is later downgraded to Analyst by the Meta Business Manager admin. Existing stored link is not auto-unlinked, but the next publish attempt detects the insufficient-role state and surfaces a "your Meta role on this ad account no longer permits publishing — please request Advertiser access" prompt instead of silently failing at the Meta API.
- A generation record predating this phase exists with no workspace reference. It is treated as belonging to the default workspace for listing purposes and is not hidden from view. (See Assumptions — backfill rule.)

## Requirements *(mandatory)*

### Functional Requirements

**Workspace CRUD & plan gating**

- **FR-001**: The system MUST let a Scale-plan owner create a new workspace with name, brand name, optional brand colors (primary and secondary), and optional logo.
- **FR-002**: The system MUST refuse workspace creation for any plan below Scale and return an error that clearly names "Scale plan required" so the UI can render an upgrade prompt.
- **FR-003**: The system MUST enforce a cap of 10 workspaces per Scale-plan account and refuse creation beyond that cap with a limit-reached message.
- **FR-004**: The system MUST let an owner update any subset of a workspace's editable fields (name, brand name, brand colors, logo, linked Meta ad account reference) without affecting unsupplied fields. Concurrent edits to the same workspace MUST be resolved by last-write-wins at field granularity: each supplied field overwrites the currently stored value for that field, and fields not supplied in the request remain untouched. The system MUST NOT reject a write on the basis of a stale revision token or prior update timestamp.
- **FR-005**: The system MUST prevent deletion of the workspace flagged as default and return an error identifying the default-workspace constraint.
- **FR-006**: The system MUST, on deletion of a non-default workspace, reassign all generations and saved projects that referenced the deleted workspace to the default workspace and then mark the workspace as soft-deleted (rather than permanently purging the record).
- **FR-006a**: The system MUST retain soft-deleted workspaces for 30 days after deletion; during this window the workspace MUST be excluded from every workspace listing, switcher result, and workspace-scoped query for all users, and MUST be restorable by a support-initiated action. On the 30th day after deletion the workspace record and its associated soft-delete metadata MUST be permanently purged.
- **FR-006b**: The system MUST, when a workspace is restored within the 30-day window, return the workspace to the switcher and restore every team-member access entry, linked Meta ad account reference, and workspace-tagged generation/saved-project linkage exactly as it existed at the moment of deletion. Records that were reassigned to the default workspace during delete MUST revert to the restored workspace on restore.
- **FR-007**: The system MUST guarantee every account has exactly one active (non-soft-deleted) default workspace at all times — one is created at account setup and cannot be deleted.

**Per-workspace Meta ad account**

- **FR-008**: The system MUST let an owner associate exactly one Meta ad account (by ID and display name) with a workspace.
- **FR-009**: The system MUST refuse any Meta-ad-account link request where the supplied ad account ID is not present in the owner's currently connected Meta ad accounts, OR where the owner's role on that ad account is below Advertiser (i.e., does not permit ad creation/editing/publishing). The rejection MUST return a distinct, human-readable error naming the reason (unknown ad account vs. insufficient role) so the UI can display an actionable message and, in the role-insufficient case, point the owner to Meta Business Manager to request Advertiser access.
- **FR-010**: The system MUST let an owner unlink the Meta ad account from a workspace, reverting that workspace to the account-level default.
- **FR-011**: The system MUST, when publishing a generation to Meta from a workspace that has a linked ad account, target that workspace's linked ad account — not the user-level default.
- **FR-012**: The system MUST surface a reconnect prompt (rather than attempt to publish) when a workspace's linked Meta ad account is stored but the owner's Meta connection is missing, expired, or no longer contains that ad account.

**Workspace-scoped data**

- **FR-013**: The system MUST tag every new generation record with the workspace that was active when the generation was produced.
- **FR-014**: The system MUST let users list generations filtered by workspace, with pagination, and MUST only return records the requesting user is authorized to see (owner of the workspace, or team member with access to the workspace).
- **FR-015**: The system MUST treat generation records with no workspace reference as belonging to the default workspace for listing purposes, so pre-existing records remain visible.
- **FR-016**: The system MUST refuse workspace-scoped list requests from users who are neither the workspace's owner nor a team member granted access to the workspace.

**Team workspace access**

- **FR-017**: The system MUST let a team owner assign a set of workspaces to each team member (the member's accessible-workspaces list).
- **FR-018**: The system MUST, for team members, filter the workspace switcher and every workspace-scoped list to only workspaces in the member's accessible-workspaces list.
- **FR-019**: The system MUST show every workspace in the account to the owner regardless of any team-access assignments.
- **FR-020**: The system MUST, when a member's access to a workspace is revoked, ensure subsequent workspace-scoped requests from that member for that workspace are refused and the member's client is not left indefinitely stuck in that workspace.
- **FR-020a**: The system MUST record an append-only audit entry for every team workspace-access change (both grant and revoke), capturing at minimum: the acting user's identity, the target member's identity, the workspace ID, the action type (`grant` or `revoke`), and a server-side timestamp. Entries MUST NOT be editable or deletable by any user.
- **FR-020b**: The system MUST let the account owner retrieve the audit log for their own account, filtered optionally by target member or workspace. Team members (non-owners) MUST NOT be able to read audit entries. No structured export, retention schedule, or dedicated admin query UI is required for this phase — a simple owner-scoped listing is sufficient.

**Workspace switching guard**

- **FR-021**: The system MUST, when the user switches workspace while a generation is in progress (any step beyond Step 1 has data), present a confirmation dialog offering "Save & Switch", "Discard & Switch", and "Cancel".
- **FR-022**: The system MUST persist the in-progress generation as a draft project attached to the currently-active workspace before completing a "Save & Switch".
- **FR-023**: The system MUST not interrupt workspace switching when no step beyond Step 1 has data.

**Cross-cutting**

- **FR-024**: The system MUST record a minimum identifying payload on the generation record that includes the workspace reference so downstream features (favorites scoping, saved projects scoping, RAG context) can filter correctly.
- **FR-025**: The system MUST fail closed on every workspace-scoped operation where the requester's authorization to the workspace cannot be confirmed — no operation silently falls through to returning another workspace's data.

### Key Entities *(include if feature involves data)*

- **Workspace**: A named container that groups creative work for one brand or client. Attributes: identity (workspace ID), display name, brand name, optional brand colors (primary, secondary), optional logo, default-flag (exactly one per account), optional linked Meta ad account (ID + display name), audit timestamps, soft-delete state (deleted-at timestamp; absent when the workspace is active). Read-path queries MUST filter out soft-deleted workspaces by default so only active workspaces surface in listings and switchers. Relationship: owned by one account; referenced by Generations, Saved Projects, and (via access list) Team Members.
- **Meta Ad Account Link**: A stored reference from a workspace to one Meta ad account the owner has connected. Attributes: ad account ID, ad account display name. Must match an entry in the owner's connected Meta ad accounts at link time; becomes "stale" if that ad account is later removed from the owner's Meta connection.
- **Generation (extended)**: Existing entity; gains a workspace reference captured at creation time. Listing and access control respect that reference.
- **Saved Project (extended)**: Existing entity; already carries a workspace reference. Deletion of a workspace reassigns its saved projects to the default.
- **Team Member Workspace Access**: A per-member, per-account list of workspace IDs the member can access. Empty list means no workspace access. The owner is implicitly granted every workspace.
- **Workspace Access Audit Entry**: An append-only record of one grant or revoke action on a team member's workspace access. Attributes: acting user ID, target member user ID, workspace ID, action (`grant` | `revoke`), server-side timestamp. Readable only by the account owner; never editable or deletable.
- **Plan Gate**: A lookup from the account's subscription plan to the max number of workspaces allowed. Below Scale: 1 (default only). Scale: 10.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Scale owner can create a new workspace, link a Meta ad account to it, and publish an ad that reaches the correct Meta ad account on their first attempt, without needing support or documentation help.
- **SC-002**: 100% of generations created after this phase ships carry a workspace reference, and 100% of workspace-scoped list requests return only records the requester is authorized to see (audited over the first 30 days post-launch).
- **SC-003**: Zero cases of cross-workspace data bleed are reported in the first 90 days — no team member sees a workspace they were not granted, and no workspace lists another workspace's generations.
- **SC-004**: A Pro-plan user attempting to create a second workspace receives a clear "Scale plan required" message within 1 second of their action, with a path to upgrade.
- **SC-005**: When an owner deletes a non-default workspace containing generations and saved projects, 100% of those records are reassigned to the default workspace and remain listable there — measured by comparing pre- and post-delete counts. If the workspace is restored within the 30-day retention window, 100% of the reassigned records revert to the restored workspace — measured by comparing pre-delete and post-restore counts per workspace.
- **SC-006**: Workspace switching mid-generation causes zero silent data loss — every switch initiated with in-progress work either saves a draft, explicitly discards at user request, or is cancelled. Telemetry counts "discard & switch" and "cancel" choices to verify the dialog is being shown.
- **SC-007**: A team member can be productive in their assigned workspaces within 5 minutes of first login — their switcher shows only the workspaces they can use and nothing they cannot.

## Assumptions

- **Requires Phase 8 and Phase 9.** Billing tier resolution (`billingState.plan` = `starter` | `pro` | `scale` | `none`) and team membership resolution (owner vs. member, team membership list) are already reliable by the time this phase runs. This spec does not re-derive those.
- **Scale-plan definition.** "Scale plan" means `billingState.plan === 'scale'` per the hotfix 09.50-hotfix-plan-alignment union (`'none' | 'starter' | 'pro' | 'scale'`). Pro plan gets exactly the default workspace; Starter/none also get only the default workspace; Scale gets up to 10 total workspaces.
- **Downgrade grace rule.** A Scale → Pro downgrade does NOT delete existing workspaces. The account retains read/edit/delete of all existing workspaces; only creation of additional workspaces is blocked until the account is back on Scale. This avoids destructive side-effects from a billing state change alone.
- **Backfill rule for pre-existing generations.** Generation records that predate this phase and lack a workspace reference are treated as belonging to the default workspace for listing purposes. No backfill migration is required — the read path handles it.
- **Meta connection is already OAuth'd.** Phase 12 does not change Meta OAuth flow; it only reads the existing "connected Meta ad accounts" list (from the prior Meta connection work) and writes a chosen ad account ID into the workspace.
- **Workspace is singular per active session.** At any moment a user has exactly one active workspace; all generation and listing operations implicitly apply to it unless the caller explicitly names a workspace ID.
- **Team access is additive only.** The owner is implicitly granted every workspace. Members get nothing by default; the owner explicitly grants per-workspace access. There is no "remove workspace from the owner" semantic.
- **"Mid-generation" trigger for the switch guard.** The guard fires when any generation step beyond Step 1 has data — matching the trigger used by the existing saved-projects auto-save flow. No heuristic beyond that is in scope here.
- **Default workspace creation is out of scope.** The default workspace is assumed to already exist per account from prior phases; this phase does not create it.
- **Draft save on "Save & Switch" reuses existing saved-projects plumbing.** The switch guard's save path calls the already-established saved-projects save mechanism rather than inventing a new persistence surface.
- **Out of scope for this phase**: workspace-level billing or separate subscription per workspace, cross-workspace analytics aggregation, workspace-level credit pools, workspace archiving (as distinct from deletion), structured export/download and dedicated admin query UI for the workspace-access audit log (the append-only log itself IS in scope per FR-020a/FR-020b — only the export and a dedicated audit dashboard are deferred), moving a single generation between workspaces post-hoc, custom per-workspace permission roles beyond "access / no access".
