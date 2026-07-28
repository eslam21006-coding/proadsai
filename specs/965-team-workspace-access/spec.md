# Feature Specification: Team Member Workspace Access

**Feature Branch**: `965-team-workspace-access`
**Created**: 2026-07-27
**Status**: Draft
**Input**: User description: "ISSUE-D — Team Member Cannot See/Switch Workspaces (BLOCKER). Team members log in but cannot see or switch the owner's workspaces. Product decision: team members get access to ALL workspaces automatically (existing and new), cannot create or delete workspaces, editors may edit workspace settings, viewers may not."

## Clarifications

### Session 2026-07-27

- Q: Is role-based workspace editing (editors may adjust workspace details) in scope for this feature, given it requires a new server-side capability rather than merely unhiding a control? → A: Split. This feature delivers workspace visibility, switching, live updates, and the create/delete restrictions including their server-side refusals. Role-based editing moves to a follow-up specification.
- Q: What becomes of the per-member workspace access matrix on the team screen, now that every team member sees every workspace regardless of what it says? → A: Remove it. The underlying per-member access data is left untouched so a future restriction feature can adopt it without a migration.
- Q: How quickly must a removed team member lose sight of the owner's workspaces, given this feature introduces a live connection to that list? → A: Immediately. The live connection is closed and the person returns to a no-access state within seconds, with no reload required.
- Q: Should refused workspace actions by team members be recorded, and if so where? → A: Diagnostic logging only. Refusals are recorded where the team can inspect them; no new owner-visible security trail is added, since responding to such a trail is a separate feature.
- Q: What should a team member see during the window between signing in and the account link resolving, when the application does not yet know whose workspaces to show? → A: Hold workspace-dependent actions behind a loading state until both the account link and the workspace selection have resolved. Nothing that writes into a workspace is reachable before then.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Team member sees and switches between the account's workspaces (Priority: P1)

A person invited onto someone else's account signs in and opens the workspace picker. They see every active workspace belonging to the account they were invited to — not an empty list, not a placeholder, not their own separate set. They pick one, and the whole application (saved projects, audience profiles, generated ads, performance data) re-scopes to that workspace.

**Why this priority**: This is the blocking defect. Without it, an invited person cannot do any per-client work, which is the entire reason teams exist on this product. Every other story in this spec is a refinement of this one.

**Independent Test**: Invite a second person onto an account that has three or more workspaces. Sign in as that person. Confirm all three workspaces are listed, confirm switching between them changes the visible saved projects and audience profiles, and confirm no error message appears.

**Acceptance Scenarios**:

1. **Given** an account owner with 3 active workspaces and 1 deleted workspace, **When** an invited team member signs in and opens the workspace picker, **Then** exactly the 3 active workspaces are listed and the deleted one is absent.
2. **Given** an invited team member viewing the workspace picker, **When** they select a workspace other than the current one, **Then** the application switches to that workspace and the saved projects, audience profiles, and generated ads shown belong to that workspace.
3. **Given** a team member who has never been granted any workspace individually, **When** they open any of the owner's workspaces, **Then** that workspace's saved projects, generated ads, and performance data are all returned to them — the workspace is never shown as empty on account of a missing individual grant.
4. **Given** an invited team member who has just signed in, **When** the application finishes loading, **Then** one workspace is already selected (the account's default workspace, or the first available one if no default is marked) without the member having to choose.
5. **Given** an invited team member whose account owner has exactly one workspace, **When** they sign in, **Then** that single workspace is selected and usable, and no error is shown.
6. **Given** an invited team member is signing in for the first time, **When** the account owner has zero workspaces, **Then** no workspace is created on the team member's behalf and the member sees a plain-language message explaining that the account has no workspace yet.
7. **Given** an invited team member has signed in but the application has not yet established which account they belong to, **When** they try to generate an ad, save a project, or save an audience profile, **Then** the action is not available and a plain-language loading state is shown until the account and workspace are settled.
8. **Given** an invited team member whose account link resolves a moment after sign-in, **When** the resolution completes, **Then** the workspaces shown belong to the owner and nothing has been written into the member's own account in the meantime.

---

### User Story 2 - Team members cannot change which workspaces exist (Priority: P1)

Only the account owner decides how many workspaces exist and what they are called. An invited person can work inside any workspace but can never add a new one, never remove an existing one, and — for now — never alter one's details, neither through a visible control nor by any other route.

**Why this priority**: Ships alongside US1 by necessity. Opening up workspace visibility without closing off destructive actions would let an invited person destroy a client's entire body of work, and would let them silently consume the owner's paid workspace allowance.

**Independent Test**: Sign in as an invited team member and confirm no control for adding, removing, or editing a workspace appears anywhere. Then confirm that a deletion request issued outside the interface is rejected with a clear refusal rather than a confusing "not found" outcome.

**Acceptance Scenarios**:

1. **Given** an invited team member with the workspace picker open, **When** they look at the picker, **Then** no control for adding a new workspace is present.
2. **Given** an invited team member with the workspace picker open, **When** they look at any workspace in the list, **Then** no control for opening that workspace's settings is present, so no path to deleting or editing it exists.
3. **Given** an invited team member (of any role), **When** a workspace-deletion request is submitted on their behalf, **Then** the request is refused on the grounds that they are not the account owner, and the workspace remains fully intact with all its data.
4. **Given** an invited team member (of any role), **When** a workspace-creation request is submitted on their behalf, **Then** the request is refused and no workspace is added to either the owner's account or the member's own account.
5. **Given** an invited team member (of any role), **When** a workspace-edit request is submitted on their behalf, **Then** the request is refused as a permission matter and the workspace details are unchanged.
6. **Given** the account owner (not a team member), **When** they open the workspace picker and a workspace's settings, **Then** the create, edit, and delete controls are all present and continue to work exactly as before.
7. **Given** the account owner viewing their team screen, **When** the screen loads, **Then** no per-workspace grant or revoke control is offered for any member, so the owner is never led to believe they have restricted a member's workspace access.

---

### User Story 3 - The account's workspace list stays live for team members (Priority: P2)

When the account owner adds a workspace for a new client, everyone already signed in on that account sees it appear in their picker on its own. Nobody has to be told to refresh the page. The same live connection works in the other direction: when the owner removes someone from the team, that person's view of the account closes immediately.

**Why this priority**: Started life as a convenience — signing out and back in already reveals a new workspace. It carries a security obligation as well: the live connection is the mechanism by which a removed person's access ends at once rather than lingering until they happen to reload. That obligation raises it above the purely cosmetic, though it remains separable from the blocking defect in US1 and US2.

**Independent Test**: Sign in as a team member in one browser and as the owner in another. Create a workspace as the owner and confirm it appears in the team member's picker without any manual reload. Then remove the member and confirm their view of the account closes without a reload.

**Acceptance Scenarios**:

1. **Given** a team member signed in with the application open, **When** the account owner creates a new workspace, **Then** the new workspace appears in the team member's picker without a page reload.
2. **Given** a team member signed in with the application open, **When** the account owner deletes a workspace the member is not currently using, **Then** that workspace disappears from the member's picker without a page reload.
3. **Given** a team member is actively using a workspace, **When** the account owner deletes that same workspace, **Then** the member is moved to the account's default workspace and told in plain language that the workspace they were using is no longer available.
4. **Given** the account owner renames a workspace or changes its brand colour, **When** a team member has the application open, **Then** the updated name and colour appear for the member without a page reload.
5. **Given** a team member signed in with the application open, **When** the account owner removes them from the team, **Then** the owner's workspaces disappear from their view within seconds without a reload, no further workspace updates reach them, and they are told plainly that their access has ended.

---

### Edge Cases

- **Owner has no workspaces at all.** The team member must never have a workspace created for them under their own account as a side effect of signing in. They see a plain-language message and no workspace-bearing features are offered.
- **A person is removed from the team while signed in.** Their view must stop showing the former owner's workspaces within seconds and without a reload, the live connection feeding them updates must be closed, and they must not be able to keep working inside one. They are told plainly that their access has ended rather than being left on an empty screen.
- **The owner's plan does not include multiple workspaces.** The team member's workspace capabilities match the owner's plan exactly — never more, never less. If the owner's plan offers only a single workspace, the member works in that one workspace and sees no picker beyond it.
- **The team member's own account also has workspaces from a previous life as an owner.** While they are a team member, they must see only the owner's workspaces; their own must not be mixed into the list.
- **The account owner deletes the workspace a team member is currently working inside.** Work in progress must not be silently discarded without the member being told.
- **A team member's ability to read the account is momentarily unavailable.** The member sees a plain-language retry message rather than an empty workspace list that looks like the account was wiped.

## Requirements *(mandatory)*

### Functional Requirements

**Visibility and switching**

- **FR-001**: The system MUST show a team member every active workspace belonging to the account owner who invited them.
- **FR-002**: The system MUST exclude deleted workspaces from what a team member sees.
- **FR-003**: The system MUST NOT show a team member any workspace belonging to their own separate account while they are acting as a team member.
- **FR-004**: The system MUST grant every team member access to all of the owner's workspaces automatically, both those that existed before they were invited and any created afterwards, with no per-workspace granting step required of the owner.
- **FR-004a**: The all-workspaces grant MUST hold wherever access is decided, not only in the interface. A team member MUST receive the account's saved projects, generated ads, and performance data for every workspace, with no separate per-workspace permission narrowing them. Establishing that the person is a member of the account remains the access boundary.
- **FR-004b**: Where the account still holds a per-member workspace list that this grant overrides, the system MUST record that the stored list was deliberately disregarded, so the decision is never silent.
- **FR-005**: The system MUST select a workspace automatically when a team member signs in — the account's default workspace, or the first available workspace when none is marked default.
- **FR-006**: The system MUST allow a team member to switch between workspaces, and MUST re-scope saved projects, audience profiles, generated ads, and performance data to the newly selected workspace.
- **FR-007**: The system MUST resolve a team member's workspace list correctly even though team membership is determined after sign-in completes — a member must never be left with an empty or wrong list because the account link was still resolving.
- **FR-007a**: Until both the account link and the workspace selection have resolved, the system MUST hold back every action that writes into a workspace — generating an ad, saving a project, saving an audience profile — behind a plain-language loading state. Nothing may be written into a workspace on the strength of an unresolved account link.
- **FR-008**: The system MUST reflect workspace additions, removals, renames, and colour changes in a signed-in team member's view without requiring a page reload.

**Creation and deletion restrictions**

- **FR-009**: The system MUST NOT offer any workspace-creation control to a team member.
- **FR-010**: The system MUST NOT offer any workspace-deletion or workspace-editing control to a team member, regardless of role. (Editing is withheld from every role for now — see Out of Scope.)
- **FR-011**: The system MUST refuse a workspace-deletion or workspace-editing request from a team member, and MUST state the refusal as a permission matter, not as a missing-workspace matter.
- **FR-012**: The system MUST refuse a workspace-creation request from a team member, and MUST NOT create a workspace under the team member's own account as a fallback.
- **FR-013**: The system MUST NOT create a workspace on a team member's behalf when the owner's workspace list comes back empty.
- **FR-014**: The system MUST leave every workspace control available to account owners exactly as it is today — this feature must not reduce what an owner can do.

**Plan and safety boundaries**

- **FR-015**: The system MUST determine a team member's workspace capabilities from the account owner's plan, never from the member's own plan or lack of one.
- **FR-016**: The system MUST stop showing the owner's workspaces to a person removed from the team. Where the live connection of FR-008 is in place, it MUST be closed on removal — so that no further workspace names, brand names, or colours reach that person, and they return to a no-access state within seconds without reloading or navigating.
- **FR-016a**: When a signed-in person's access ends, the system MUST tell them in plain language that they no longer have access, rather than leaving them on a screen that appears broken or empty.
- **FR-017**: The system MUST warn a team member before discarding unsaved work when switching workspaces, on the same terms as an owner.

**Presentation**

- **FR-018**: All new or changed messages a person can read MUST be written in plain Modern Standard Arabic with no technical vocabulary — no field names, no system names, no error codes. Because the product is offered in both Arabic and English, every such message MUST also be supplied in English to the same standard; neither language may be left to fall back to the other.
- **FR-019**: When a team member's workspace list cannot be loaded, the system MUST distinguish "this account has no workspace yet" from "the list could not be loaded right now", and MUST NOT present either as an empty list with no explanation.
- **FR-019a**: The system MUST withdraw or rewrite any existing message that tells a team member to ask the account owner for workspace access. Under FR-004 access is automatic, so such a message describes a step that no longer exists and would send the member to the owner for something the owner cannot grant.

**Owner-facing team screen**

- **FR-020**: The system MUST NOT offer the account owner any per-member, per-workspace grant or revoke control, because such a control would have no effect on what the member can see and would misrepresent the account's actual access position.
- **FR-021**: The system MUST leave each member's stored per-workspace access data intact and not use it for authorization decisions, so that a future restriction capability can adopt it without a data migration. The data may be read for required trace or observability behavior (FR-004b override trace).
- **FR-022**: The system MUST leave the rest of the team screen — inviting, listing, role assignment, and removal — working exactly as it does today.

**Observability**

- **FR-023**: The system MUST record every refused workspace creation, deletion, or edit attempt by a team member in a form the operating team can inspect, capturing which action was attempted, by whom, and on which account.
- **FR-024**: The system MUST NOT add any new owner-visible security or audit surface as part of this feature; refusals are recorded for the operating team only.

### Out of Scope

Deferred to a follow-up specification, per the 2026-07-27 clarification:

- **Role-based workspace editing.** Whether an editor may change a workspace's display name, brand name, brand website, or brand colours, and the corresponding refusal for viewers. This requires a new server-side capability — changing a workspace on the account owner's behalf does not exist today in any form — and is therefore not a matter of unhiding an existing control.
- **Consequently, in this feature no team member may change any workspace detail, regardless of role.** The editing control is withheld from all team members alongside the create and delete controls (FR-009, FR-010). The editor/viewer distinction has no effect on workspace behaviour until the follow-up ships.

### Key Entities

- **Account owner**: The person who pays for the plan. Owns every workspace on the account, and is the only person who can add, alter, or remove one.
- **Team member**: A person invited onto an owner's account. Works inside the owner's workspaces, consumes the owner's allowance, and holds one role. Neither sees nor uses any workspace of their own while acting as a member — such workspaces may exist from a previous life as an owner (see Edge Cases), but they are never shown, never written to, and never mixed into the list.
- **Role**: Either *editor* or *viewer*. Roles exist on the account today and continue to govern behaviour elsewhere in the product, but they have no bearing on workspace behaviour in this feature — no role may add, remove, or alter a workspace. The distinction becomes meaningful for workspaces only when the deferred editing capability ships.
- **Workspace**: One client or brand context. Carries a display name, brand name, brand website, brand colours, a default marker, and an optional advertising-account link. Owns the saved projects, audience profiles, generated ads, and performance data scoped beneath it.
- **Per-workspace access list**: A previously-designed per-member allowlist of workspaces. Superseded by the all-workspaces decision (FR-004): it no longer governs what a member can see, and the control for managing it is withdrawn from the team screen (FR-020). The stored data itself is retained (FR-021) so a future restriction capability can adopt it without a migration; it is read only for the FR-004b override trace, never for authorization.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member signing in for the first time reaches a usable workspace within 5 seconds, with no manual workspace selection required.
- **SC-002**: 100% of an owner's active workspaces are visible to every team member of that owner, and 0% of deleted workspaces are.
- **SC-003**: 0 of the workspaces a team member sees belong to any account other than the one that invited them.
- **SC-004**: 100% of workspace creation, deletion, and edit attempts by a team member are refused, including attempts that do not go through the interface, and each refusal states a permission reason rather than a missing-workspace reason.
- **SC-005**: 0 workspaces are created as a side effect of a team member signing in, across every combination of owner workspace count (zero, one, many) and member role.
- **SC-006**: A workspace created by the owner becomes visible to an already-signed-in team member within 10 seconds without a reload.
- **SC-007**: Account owners retain 100% of the workspace capabilities they had before this change, verified against creation, editing, deletion, and restoration.
- **SC-008**: 0 messages introduced by this feature contain technical vocabulary, verified by the project's user-facing wording check, and 0 are present in one language but missing in the other.
- **SC-009**: The per-client performance features blocked by this defect become usable by team members — a member can open the performance view for at least two different workspaces of the owner and see data scoped to each.
- **SC-010**: Once live updates are in place, a removed team member loses sight of the owner's workspaces within 10 seconds of removal without reloading, and 0 further workspace updates reach them after that point.
- **SC-011**: For 100% of refused workspace actions, the operating team can determine from records which action was attempted, by whom, and on which account — without needing to reproduce the attempt.
- **SC-012**: Across repeated team-member sign-ins, 0 generated ads, saved projects, or audience profiles are written into the wrong workspace or into the member's own account.

## Assumptions

- **Team membership is already established.** Invitation, acceptance, role assignment, and role changes all work today and are out of scope. This feature consumes the existing membership link and role, and does not change how they are created.
- **Access is all-or-nothing per account.** Per the locked product decision, a team member sees every workspace of their owner. The previously-designed per-workspace allowlist is not consulted for visibility, and its management control is withdrawn from the team screen so that it cannot misrepresent the account's real access position. The stored data is left in place so a future restriction feature can adopt it without a migration.
- **Changing a workspace on the owner's behalf does not exist yet.** Today, edit and delete requests are resolved against the requester's own account, so a team member's request never reaches the owner's workspace — it fails as though the workspace were missing. Building that capability is what makes role-based editing a separate piece of work, and is why it was split out (see Out of Scope). This feature does not build it; it only makes the existing refusal honest.
- **Refusals must be honest.** Where a team member's request is currently rejected only as a side effect of looking in the wrong account, this feature replaces that with an explicit permission refusal. The security outcome is unchanged; the clarity is not.
- **Splitting keeps the blocking fix small, but not server-free.** Visibility, switching, live updates, and the withheld controls are mostly changes to what the interface shows and asks for. Planning research then established that the server independently narrows a team member's reach to a stored per-member workspace list, which is empty for every newly invited member — so the interface alone would show the workspaces and find them all empty. Granting account-wide access therefore requires a server change as well as an interface change, and the two must land together. Recorded in `research.md` D1.
- **A team member's plan capabilities mirror the owner's.** The existing arrangement whereby a member inherits the owner's plan is assumed correct and is relied upon for FR-015.
- **The workspace picker only appears when the owner's plan includes multiple workspaces.** Owners on a single-workspace plan and their team members continue to work in one workspace with no picker, which is existing intended behaviour.
- **Deletion remains recoverable.** Workspace deletion is a soft removal with an existing restore path. Nothing in this feature changes that, and team members have access to neither.
- **Bidirectional access is not in scope.** An owner does not gain access to a team member's own separate workspaces, if any exist.
- **Scale of use.** An owner has fewer than 50 workspaces and fewer than 50 team members. The design need not address pagination at this size.
