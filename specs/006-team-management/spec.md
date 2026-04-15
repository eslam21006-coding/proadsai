# Feature Specification: Team Management

**Feature Branch**: `006-team-management`
**Created**: 2026-04-03
**Status**: In Review
**Last Reviewed**: 2026-04-10
**Input**: Phase 9 from LAUNCH_MATRIX.md — Team Management (15 tasks: 9.1–9.15)

## Clarifications

### Session 2026-04-03

- Q: How is the team member role (member vs viewer) assigned? → A: Owner selects role at invite time (default: member), and can change the role later from the Team page.

### Session 2026-04-04

- Q: Should the 3 scope additions beyond LAUNCH_MATRIX (role selector at invite, role change on existing members, extra `getInviteDetails` fields) be kept or removed? → A: Keep all 3. Role selection at invite time is a natural UX expectation, role changing for existing members avoids re-invite churn, and `inviteeName`/`role` in `getInviteDetails` are needed for the join page display.
- Q: What happens when a logged-in user clicks an invite link meant for a different email? → A: Show invite details but block claim with message: "This invite was sent to [email]. Log in with that email to accept."
- Q: Should the unauthenticated `getInviteDetails` endpoint have abuse protection? → A: Yes, rate limit by IP — max 10 requests/minute per IP to prevent invite ID enumeration.
- Q: What should the Team page show when a new owner has zero members and zero invites? → A: Show the invite form prominently with empty-state message: "You haven't invited anyone yet. Add your first team member below."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invite Acceptance (Fix 404 + Account Setup) (Priority: P1)

As an invitee who receives a team invite link, I can click it and land on a working page — not a 404. If I already have an account, I log in and join the team. If I don't have an account, I create one and join the team. This is the critical path that currently does not work at all.

**Why this priority**: Every invite link currently leads to a 404. Without this fix, team invites are completely broken. No other team feature matters if invitees cannot accept invites.

**Independent Test**: Send a team invite. Click the link. Verify the page loads (no 404). Complete account setup or login. Verify the invitee joins the team and sees the shared workspace.

**Acceptance Scenarios**:

1. **Given** an invitee clicks an invite link with `?inviteId=<id>`, **When** the page loads, **Then** a join page appears showing the team owner's name, the invitee's email, and the invite status — not a 404.
2. **Given** an invitee who already has an account, **When** they log in on the join page, **Then** the invite is automatically claimed and they are redirected to the main app as a team member.
3. **Given** an invitee who does NOT have an account, **When** they fill in their name, password, and confirm password (email pre-filled and locked from the invite), **Then** an account is created and the invite is automatically claimed.
4. **Given** an invite that has been revoked, **When** the invitee clicks the link, **Then** they see "This invite is no longer valid" — not a crash or 404.
5. **Given** an invite that has expired (older than 7 days), **When** the invitee clicks the link, **Then** they see "This invite has expired. Ask your team owner to resend it."
6. **Given** a user already logged in with a different email than the invite, **When** they visit the join page, **Then** they see the invite details but cannot claim it — the page shows "This invite was sent to [email]. Log in with that email to accept."

---

### User Story 2 - Team Page (Member & Invite Management) (Priority: P2)

As a team owner, I can view a Team page that shows my current members, pending invites, and a form to invite new members. I can resend or revoke pending invites and remove existing members.

**Why this priority**: The team page is the management hub. Without it, owners cannot see who is on their team or manage invites.

**Independent Test**: Navigate to the Team page. Verify the member list, pending invites list, and invite form are all visible with correct data.

**Acceptance Scenarios**:

1. **Given** a team owner on the Team page, **When** the page loads, **Then** they see: current members (name, email, role, join date) with a role change action, pending invites (email, role, sent date, status), an invite form with role selector, and a member count vs plan limit ("2 / 3 members on Pro").
2. **Given** a team owner, **When** they enter an email, name, and role (member or viewer, default: member) in the invite form and submit, **Then** a new invite is created and appears in the pending invites list with status "Sent".
3. **Given** a pending invite in the list, **When** the owner clicks "Resend", **Then** the invite email is resent, the expiry clock resets, and the status updates.
4. **Given** a pending invite in the list, **When** the owner clicks "Revoke" and confirms ("This invite link will stop working."), **Then** the invite is revoked and its link stops working.
5. **Given** a team member in the list, **When** the owner clicks "Remove" and confirms ("Remove [Name]? They will lose access immediately."), **Then** the member is removed, loses access, and their account reverts to no plan or their own independent plan.
6. **Given** a new team owner with zero members and zero pending invites, **When** they visit the Team page, **Then** they see "You haven't invited anyone yet. Add your first team member below." with the invite form prominently displayed.

---

### User Story 3 - Plan Limit Enforcement (Priority: P3)

As a team owner, I cannot invite more members than my plan allows. If I reach the limit, the system tells me to upgrade.

**Why this priority**: Without limit enforcement, teams could exceed their plan allocation, breaking the billing model.

**Independent Test**: On a Pro plan (max 3 members), invite members until the limit is reached. Verify the invite form is replaced with an upgrade prompt.

**Acceptance Scenarios**:

1. **Given** a Pro plan owner with 3 active members, **When** they try to invite another, **Then** they see "Your Pro plan allows 3 members. Upgrade to Scaling for up to 10."
2. **Given** the limit check, **When** counting members, **Then** both active members AND open (unclaimed) invites count toward the limit.
3. **Given** a Starter or Creator plan owner (limit: 1), **When** they visit the Team page, **Then** the invite form is hidden and the page shows "Team invites are available on Pro and above."

---

### User Story 4 - Team Credit Visibility (Priority: P4)

As a team member, I can see the team's shared credit pool in the app. As the owner, I see "Team credits — your account." As a member, I see "Team credits — [Owner Name]'s account."

**Why this priority**: Team members need to know whose credits they are consuming and how many remain.

**Independent Test**: Log in as a team member. Verify the credit bar shows the team label and the owner's credit balance (not the member's own balance).

**Acceptance Scenarios**:

1. **Given** a team member logged in, **When** they view the credit bar, **Then** it shows "Team credits — [Owner Name]'s account" with the owner's credit balance.
2. **Given** a team owner logged in, **When** they view the credit bar, **Then** it shows "Team credits — your account" with their credit balance.
3. **Given** a credit-consuming action by a team member, **When** the action completes, **Then** the credit bar updates in real time to reflect the deduction from the owner's pool.

---

### User Story 5 - Role-Based Action Gating (Priority: P5)

As a viewer-role team member, I cannot trigger credit-consuming actions. Generation buttons show a tooltip explaining why.

**Why this priority**: Viewers should be able to browse but not spend the owner's credits.

**Independent Test**: Log in as a viewer. Click the Generate button. Verify it shows a tooltip instead of generating.

**Acceptance Scenarios**:

1. **Given** a viewer-role team member, **When** they hover or click a generation button, **Then** they see a tooltip: "Viewers cannot generate — ask your team owner."
2. **Given** a viewer-role team member, **When** they attempt any credit-consuming action, **Then** the server rejects the request.

---

### User Story 6 - Workspace Separation (Scaling Plan) (Priority: P6)

As a Scaling plan team, members can switch between workspaces. Each workspace has its own generation history. Non-Scaling plans share one workspace with no switcher.

**Why this priority**: Multi-brand agencies on the Scaling plan need separate workspaces to avoid mixing client assets.

**Independent Test**: On a Scaling plan, create two workspaces. Generate in workspace A. Switch to workspace B. Verify workspace B's history is empty.

**Acceptance Scenarios**:

1. **Given** a Scaling plan team, **When** a member opens the nav, **Then** a workspace switcher is visible.
2. **Given** a member switches from Workspace A to Workspace B, **When** they view generation history, **Then** only Workspace B's history appears.
3. **Given** a non-Scaling plan team, **When** they view the nav, **Then** no workspace switcher is shown — all members share one workspace.

---

### User Story 7 - Invite Expiry (Priority: P7)

As a team owner, invites expire after 7 days. Resending an invite resets the expiry clock.

**Why this priority**: Stale invites should not remain claimable indefinitely.

**Independent Test**: Create an invite. Wait for (or simulate) 7 days. Attempt to claim. Verify it is rejected as expired.

**Acceptance Scenarios**:

1. **Given** an invite created 8 days ago, **When** the invitee clicks the link, **Then** they see "This invite has expired."
2. **Given** an expired invite, **When** the owner clicks "Resend", **Then** the expiry resets to 7 days from now and the invite becomes valid again.

---

### User Story 8 - QA Fixtures (Priority: P8)

As a QA reviewer, fixture tests verify the core team operations: invite creation blocked at limit, invite claim sets team membership, expired invite rejection, member removal clears membership, and viewer role rejection.

**Why this priority**: Without automated tests, regressions in team operations are undetectable.

**Independent Test**: Run the fixture test suite. Verify all team assertions pass.

**Acceptance Scenarios**:

1. **Given** the fixture test suite, **When** `createTeamInvite` is called at plan limit, **Then** the test asserts it is blocked.
2. **Given** the fixture test suite, **When** `claimTeamInvite` is called with a valid invite, **Then** the test asserts the user has `isTeamMember: true` and `teamOwnerUid` set.
3. **Given** the fixture test suite, **When** `claimTeamInvite` is called with an expired invite, **Then** the test asserts it fails.
4. **Given** the fixture test suite, **When** `removeTeamMember` is called, **Then** the test asserts `isTeamMember` is cleared.
5. **Given** the fixture test suite, **When** a viewer calls `deductCreditsServer`, **Then** the test asserts it is rejected.

---

### Edge Cases

- What happens when an invitee's email is already a member of the team? The invite is blocked with "This email is already a team member."
- What happens when an invitee is already a member of a different team? The invite is blocked with "This user is already on another team." (A user can only be on one team at a time.)
- What happens when the team owner downgrades their plan below the current member count? Existing members remain active but no new invites can be sent until the count is within the new limit. The Team page shows a warning: "You have more members than your plan allows. Remove members or upgrade."
- What happens when a removed member had in-progress work? Their in-progress projects remain accessible to the team owner's workspace. The member loses access.
- What happens when the owner's account is deleted or suspended? All team members are automatically detached. They see "Your team is no longer active."
- What happens when two people click the same invite link? Only the first claim succeeds. The second sees "This invite has already been claimed."
- What happens when a logged-in user clicks an invite link for a different email? The join page shows invite details but blocks claiming with: "This invite was sent to [email]. Log in with that email to accept."

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a working invite acceptance page at a dedicated URL path, accepting an invite ID parameter. The current 404 on invite links MUST be fixed.
- **FR-002**: The invite acceptance page MUST detect whether the invitee has an existing account and show the appropriate flow: login (existing) or account creation (new).
- **FR-003**: New account creation on the invite page MUST collect: full name, password, and password confirmation. The email MUST be pre-filled and locked from the invite record.
- **FR-004**: After successful login or account creation, the invite MUST be automatically claimed and the user redirected to the main app as a team member.
- **FR-005**: The system MUST provide an unauthenticated invite details endpoint that returns the owner name, invitee email, team plan, invite status, and expiry — without exposing sensitive data. Invalid invites return a status code (expired/revoked), not an error. The endpoint MUST be rate-limited to 10 requests per minute per IP to prevent invite ID enumeration.
- **FR-006**: Invites MUST expire 7 days after creation. Expired invites MUST NOT be claimable. Resending MUST reset the expiry clock.
- **FR-007**: The system MUST provide a Team page accessible from account/settings showing: member list (name, email, role, join date), pending invites (email, sent date, status, resend/revoke actions), invite form, and member count vs plan limit. When no members or invites exist, the page MUST show an empty-state prompt ("You haven't invited anyone yet. Add your first team member below.") with the invite form prominently displayed.
- **FR-008**: The invite form MUST enforce plan limits: count active members + open invites against `maxTeamMembers`. At limit, replace the form with an upgrade prompt.
- **FR-009**: Member removal MUST clear the member's team association immediately, revert their plan, and show them "You've been removed from this team. Contact your team owner." on their next action.
- **FR-010**: Team members MUST see the team's shared credit pool labeled with the owner's name. The credit display MUST update in real time.
- **FR-011**: Viewer-role members MUST be blocked from all credit-consuming actions. The client MUST prevent action execution and show a clear message explaining the restriction. The server MUST independently reject viewer requests as a second layer of enforcement.
- **FR-015**: Team owners MUST be able to change an existing member's role (editor/viewer) from the Team page without requiring re-invitation.
- **FR-012**: Scaling plan teams MUST have a workspace switcher in the nav, with each workspace maintaining its own generation history. Non-Scaling plans MUST NOT show the switcher.
- **FR-013**: Team state (`teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`, `isTeamOwner`, `isTeamMember`, `teamOwnerName`) MUST be available to the frontend via the same real-time mechanism as billing state.
- **FR-014**: Fixture tests MUST verify: invite blocked at limit, claim sets membership, expired invite rejected, removal clears membership, viewer rejected by credit deduction, and invite details returns correct status for expired/revoked invites.
- **FR-016**: The invite form MUST include a role selector allowing the owner to choose between editor (displayed as "Member") and viewer roles at invite time, defaulting to editor.

### Key Entities

- **Team Invite**: A pending invitation from a team owner to a prospective member. Has: invitee email, invitee name, owner ID, assigned role (editor/viewer, default: editor — displayed as "Member"/"Viewer" in the UI), status (pending/sent/claimed/revoked/expired/failed), expiry date, creation date.
- **Team Member**: A user who has claimed an invite and is associated with a team. Has: user ID, team owner ID, role (editor/viewer — displayed as "Member"/"Viewer"), join date.
- **Team**: Implicitly defined by the owner's account. The owner IS the team. Members are associated via `teamOwnerUid`. Plan limits come from the owner's subscription.
- **Workspace**: A logical separation of generation history within a team. Only available on Scaling plan. Members can switch between workspaces.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Invite links lead to a working page in 100% of cases — zero 404 errors.
- **SC-002**: New invitees can create an account and join a team in under 2 minutes from clicking the invite link.
- **SC-003**: Team owners can invite, resend, revoke, and remove from a single Team page with zero navigation to other screens.
- **SC-004**: Plan limits are enforced at 100% accuracy — no team exceeds its plan's member limit including pending invites.
- **SC-005**: Expired invites (>7 days) are rejected in 100% of claim attempts.
- **SC-006**: Team members see the correct shared credit balance within 2 seconds of any credit-consuming action.
- **SC-007**: Viewer-role members are blocked from all credit-consuming actions in 100% of attempts (client + server).
- **SC-008**: All 6 fixture test assertions pass: invite limit, claim, expiry, removal, viewer rejection, invite details.

## Assumptions

- Backend Cloud Functions for team operations (`createTeamInvite`, `claimTeamInvite`, `removeTeamMember`, `resendTeamInvite`, `revokeTeamInvite`, `getInviteDetails`, `getTeamInvites`, `updateTeamMemberRole`) are implemented and functional.
- Team credit pooling via `resolveCreditOwner()` is implemented. The UI displays the owner's credit balance for team members.
- Server-side viewer rejection in `deductCreditsServer` is implemented. Client-side gating blocks the action and shows a toast message.
- Invite delivery happens via GHL webhook (existing). This feature does not change the delivery mechanism.
- A user can only be on one team at a time. Switching teams requires leaving the current team first.
- Phase 8 (Billing State) dependency is satisfied. Team state fields (`teamOwnerUid`, `teamRole`, `teamOwnerName`, `isTeamMember`, `isTeamViewer`, `isTeamOwner`) are available via Firestore real-time listeners.
- Plan limits: Starter/Creator = 1 member (owner only), Pro = 3 members, Scaling = 10 members. These are enforced at both the plan configuration level and server-side.
- Workspace separation (US6) is Scaling-plan only. The `WorkspaceSwitcher` component and `multiBrandWorkspaces` feature flag exist, but full workspace-scoped generation history isolation requires additional integration work.
- Internal role values are `editor` and `viewer`. The UI displays these as "Member" and "Viewer" respectively via i18n keys.
- Invite statuses follow the lifecycle: `pending` → `sent` (after GHL webhook) → `accepted` | `failed` | `revoked` | `expired`. Open invite statuses that count toward plan limits are: `pending`, `sent`, `failed`.
