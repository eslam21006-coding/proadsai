# Feature Specification: Team Management

**Feature Branch**: `006-team-management`
**Created**: 2026-04-03
**Status**: In Review
**Last Reviewed**: 2026-04-15 (Phase 8 / 009 follow-up — Paddle migration, email verification gate, mandatory billing modal exemption)
**Input**: Phase 9 from LAUNCH_MATRIX.md — Team Management (15 tasks: 9.1–9.15)

## Clarifications

### Session 2026-04-03

- Q: How is the team member role (member vs viewer) assigned? → A: Owner selects role at invite time (default: member), and can change the role later from the Team page.

### Session 2026-04-04

- Q: Should the 3 scope additions beyond LAUNCH_MATRIX (role selector at invite, role change on existing members, extra `getInviteDetails` fields) be kept or removed? → A: Keep all 3. Role selection at invite time is a natural UX expectation, role changing for existing members avoids re-invite churn, and `inviteeName`/`role` in `getInviteDetails` are needed for the join page display.
- Q: What happens when a logged-in user clicks an invite link meant for a different email? → A: Show invite details but block claim with message: "This invite was sent to [email]. Log in with that email to accept."
- Q: Should the unauthenticated `getInviteDetails` endpoint have abuse protection? → A: Yes, rate limit by IP — max 10 requests/minute per IP to prevent invite ID enumeration.
- Q: What should the Team page show when a new owner has zero members and zero invites? → A: Show the invite form prominently with empty-state message: "You haven't invited anyone yet. Add your first team member below."

### Session 2026-04-15 (Phase 8 / 009 follow-up)

- Q: Phase 8 (009) introduced an email-verification gate on new Firebase Auth accounts. How does this interact with the invitee account-creation flow? → A: Email verification still applies. After the invitee submits the join page form, the Firebase Auth account is created and a verification email is sent. The invitee sees the "Verify your email" screen until they click the verification link, after which the invite is auto-claimed and they enter the team workspace.
- Q: How does the invite-claim resume flow discover which invite corresponds to the signed-in user after the user verifies their email (given the verification link may open on a different device or in a new session)? → A: The post-signin handler **discovers** pending invites by querying `team_invites` by normalized email. On any first sign-in where `users/{uid}` does not yet exist (or on the first sign-in after email verification for a newly created account), the handler runs a `team_invites` query where `inviteeEmailNormalized == currentUser.email.toLowerCase()` AND `status in ['pending','sent']` AND `expiresAt > Date.now()`. This makes the discovery device-independent (the user can click the verification link on any device) and the same query is reused by the Phase 8 mandatory-billing-modal suppression gate. No client-side state (localStorage, continueUrl, custom claims) is required. **Note**: Discovery is NOT auto-claim. See Session 2026-04-15 (second pass) Q1 for the consent-required rule that governs what happens after a match is found — the handler routes the user to `/join?inviteId=<match>` for explicit Accept/Decline, and the claim only fires on Accept.
- Q: How should the Phase 8 mandatory-billing-modal gate evaluate "user has a valid pending team invite" on every sign-in (not just the first)? → A: Re-query `team_invites` by normalized email once per sign-in (the same query used by the claim-resume flow) and cache the boolean result in memory for the remainder of the session. The query is O(1) on the indexed `inviteeEmailNormalized` field. No denormalized `hasPendingTeamInvite` flag is added to the user document — the live query is authoritative and cannot drift when invites are revoked or expire.
- Q: What should a removed team member see on their next sign-in (assuming they had no prior independent subscription)? → A: Treat them exactly like any other unpaid authenticated user. On first post-removal sign-in, a one-time toast fires ("You've been removed from [Owner Name]'s team."), then the Phase 8 mandatory billing modal takes over because their `billingState.plan === 'none'` and no valid pending team invite exists on their email. No special `formerTeamMember` flag, no account deletion, no plan restoration — the modal is the clear path back to paid use.
- Q: When should the team-specific "You've joined [Owner Name]'s team." welcome toast fire? → A: Exactly once per claim, fired immediately after `fnClaimTeamInvite` succeeds. The claim transaction MUST atomically set `users/{uid}.teamWelcomeToastShown: true` so rapid re-logins within the same window do not re-fire the toast. This decouples the team welcome toast from the Phase 8 60-second `createdAt` window (which may already be stale since verification can occur hours or days after account creation) and guarantees a single, deterministic fire point. The Phase 8 "Welcome! Your 7-day trial has started." toast remains suppressed on this path.
- Q: How should the system handle a stale `pending_plans/{email}` document (from a prior Paddle payment) when the same email later claims a team invite? → A: Dormant-plan pattern. At claim time, the `claimTeamInvite` transaction MUST consume `pending_plans/{email.toLowerCase()}` into a new `users/{uid}.dormantPlan` field (snapshotting plan, credits, creditsPerMonth, paddleSubscriptionId, paddleCustomerId, paddleUpdatePaymentUrl, paddleCancelUrl, billingStatus, nextResetDate) and then delete the pending document. While the user is on the team, `dormantPlan` is inert — the team pool drives credits and plan display. On removal (`removeTeamMember`), if `dormantPlan` is present it MUST be restored atomically as the user's active `billingState` (and the user doc's plan/credits fields) and then cleared, so the removed member lands directly on their own paid subscription instead of hitting the mandatory billing modal. If `dormantPlan` is absent on removal, the user reverts to `plan: 'none'` and sees the modal per FR-009.
- Q: Phase 8 introduced a dismiss-proof mandatory billing modal for any authenticated user whose `billingState.plan === 'none'`. Must this modal be suppressed for invitees? → A: Yes — 009 already specifies suppression when the user has `isTeamMember: true` OR their email matches a valid, unclaimed pending team invite. Phase 9 must mirror this behavior so newly claimed members enter the app normally instead of being trapped behind the pricing modal.
- Q: Phase 8 fires a "Welcome! Your 7-day trial has started." toast on first sign-in. Should this fire for team members? → A: No. The trial-started toast MUST be suppressed for users who enter the app via the team-invite claim flow — they are not on a trial of their own. A team-specific welcome message ("You've joined [Owner Name]'s team.") is shown instead.
- Q: Phase 8 migrated billing from Stripe to Paddle. Does Phase 9 need to track Paddle-specific fields on `billingState`? → A: No. The Paddle-specific fields (`paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`) live on the owner's `billingState` and are surfaced to team members only as part of the read-only owner credit display. Phase 9 only adds team-shape fields (`teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`, `isTeamOwner`, `teamOwnerName`) on top of the base `billingState` shape — it does NOT introduce or rename payment-provider fields.

### Session 2026-04-15 (Phase 8 / 009 follow-up — second pass)

- Q: The device-independent post-signin handler (prior session) would auto-claim any `team_invites` match by normalized email, silently conscripting a user into an attacker-created team on their first sign-in. How is explicit consent enforced? → A: No silent auto-claim on any path. On any post-signin where a `team_invites` entry matches by normalized email (`status in ['pending','sent']` AND `expiresAt > Date.now()`), the handler MUST route the user to `/join?inviteId=<match>` instead of calling `fnClaimTeamInvite` directly. The existing `JoinTeam` page — already built to display owner name, team plan, role label, and invitee email — is reused as the consent/confirmation screen with explicit "Accept" and "Decline" buttons. The claim only fires on Accept. Decline marks the invite as declined (new status) and releases the user back into the normal post-signin flow (mandatory billing modal if `plan === 'none'`, otherwise their own paid plan). This preserves the device-independent discovery of the previous session while closing the team-hijack vector: an attacker cannot force a stranger into their team simply by guessing their email.
- Q: Should `claimTeamInvite` also snapshot a claimant's existing active paid Paddle subscription into `dormantPlan`, or only the `pending_plans` collision case covered last session? → A: Always snapshot. The dormant-plan pattern MUST cover two distinct sources uniformly: (1) a prior `pending_plans/{email}` document (already specified last session), and (2) an existing active paid subscription on `users/{uid}` at claim time (plan ≠ `'none'` with a live `paddleSubscriptionId`). In both cases the `claimTeamInvite` transaction snapshots plan, credits, creditsPerMonth, paddleCustomerId, paddleSubscriptionId, paddleUpdatePaymentUrl, paddleCancelUrl, billingStatus, and nextResetDate into `users/{uid}.dormantPlan` before zeroing plan/credits for team membership. On removal, FR-009's restore path runs identically regardless of source. This closes the revenue/support hole where a paying user gets invited, joins the team, is later removed, and otherwise loses access to the plan they are still being billed for by Paddle.
- Q: How is `dormantPlan` kept accurate during extended team membership, given Paddle may continue to process billing events (monthly resets, payment failures, dunning, cancellation, user-initiated updates) on the snapshotted subscription behind the scenes? → A: Paddle webhook write-through. Every Paddle webhook handler that updates a subscription (`subscription.updated`, `subscription.past_due`, `subscription.canceled`, `transaction.completed`, `transaction.payment_failed`) and the monthly credit reset MUST perform a secondary-index query on `users` where `dormantPlan.paddleSubscriptionId == eventSubscriptionId`. For every match found, the handler MUST update the `dormantPlan` snapshot in place with the same field changes it would apply to a live `billingState` (plan, credits, paddleUpdatePaymentUrl, paddleCancelUrl, billingStatus, nextResetDate). The dormant snapshot therefore stays live throughout team membership, and FR-009's restore on removal is a pure in-document copy — no synchronous Paddle API call is required at removal time, keeping the removal path offline-safe. A Firestore composite index on `dormantPlan.paddleSubscriptionId` MUST be added so the secondary lookup is O(1). If Paddle cancels the subscription while the user is on the team, `dormantPlan.plan` naturally transitions to `'none'` and `dormantPlan.credits` to `0`; the subsequent removal restore then correctly sends the user to the mandatory billing modal instead of a phantom active plan.
- Q: What mechanism makes the removed-member "You've been removed from [Owner Name]'s team." toast fire exactly once on the next sign-in? → A: Flag on the user document, mirroring the `teamWelcomeToastShown` / Phase 8 `welcomeToastShown` pattern. The `removeTeamMember` transaction MUST atomically write `users/{uid}.pendingRemovalToast = { ownerName: '[Name captured at removal time]', shownAt: null }`. On every sign-in, the post-signin handler reads this field; if present with `shownAt == null`, it displays the toast using the captured owner name, then atomically deletes the `pendingRemovalToast` field from the user document. This guarantees exactly-once delivery regardless of sign-in count, handles the case where the user signs in on multiple devices (whichever device fires first clears the flag), and survives session drops. Owner name is captured at removal time rather than looked up at toast time so the message remains stable even if the owner later deletes their account or changes their display name.
- Q: Which of the new flows added in Sessions 2026-04-15 (both passes) require fixture test coverage at launch? → A: Four high-blast-radius flows MUST gain fixture coverage, bringing SC-008's count from 6 to 10 assertions: (1) `dormantPlan` capture-and-restore round trip — exercises both sources (`pending_plans/{email}` collision AND active paid subscription on `users/{uid}` at claim time), verifies that `claimTeamInvite` snapshots correctly and that `removeTeamMember` restores the snapshot verbatim; (2) Paddle webhook write-through to `dormantPlan` — simulates `subscription.updated` / `subscription.past_due` / `subscription.canceled` and the monthly credit reset on a `paddleSubscriptionId` referenced by a user's `dormantPlan`, asserts the dormant snapshot is updated in place; (3) consent Accept/Decline status transitions — asserts `claimTeamInvite` moves `team_invites.status` from `sent` to `accepted` and `declineTeamInvite` moves it to `declined` (terminal, seat released, doesn't count toward plan limit); (4) `pendingRemovalToast` write-and-consume — asserts `removeTeamMember` writes the toast field atomically with the removal, and a simulated post-signin handler run clears it after first delivery (exactly-once). `teamWelcomeToastShown` idempotency and the device-independent discovery query are deliberately NOT covered by dedicated fixtures: the former is cosmetic (a duplicate toast is not a data-corruption risk), and the latter is indirectly exercised by the Accept/Decline fixture.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invite Acceptance (Fix 404 + Account Setup) (Priority: P1)

As an invitee who receives a team invite link, I can click it and land on a working page — not a 404. If I already have an account, I log in and join the team. If I don't have an account, I create one and join the team. This is the critical path that currently does not work at all.

**Why this priority**: Every invite link currently leads to a 404. Without this fix, team invites are completely broken. No other team feature matters if invitees cannot accept invites.

**Independent Test**: Send a team invite. Click the link. Verify the page loads (no 404). Complete account setup or login. Verify the invitee joins the team and sees the shared workspace.

**Acceptance Scenarios**:

1. **Given** an invitee clicks an invite link with `?inviteId=<id>`, **When** the page loads, **Then** a join page appears showing the team owner's name, the invitee's email, and the invite status — not a 404.
2. **Given** an invitee who already has an account, **When** they log in on the join page, **Then** the join page reveals Accept and Decline buttons; on Accept the invite is claimed and they are redirected to the main app as a team member; on Decline the invite is marked `declined` and they land in their normal post-signin state (their own paid plan or the mandatory billing modal).
3. **Given** an invitee who does NOT have an account, **When** they fill in their name, password, and confirm password (email pre-filled and locked from the invite), **Then** a Firebase Auth account is created, an email verification message is sent, and they are routed to the "Verify your email" screen — consistent with the global email-only auth gate from Phase 8.
4. **Given** an invitee who has just created an account from the join page, **When** they click the verification link in their email and return to the app (on any device), **Then** the post-signin handler discovers the matching invite by normalized email and routes them to `/join?inviteId=<match>` as a consent screen — NOT a silent auto-claim. On Accept, the invite is claimed, the mandatory billing modal stays suppressed, the trial-started welcome toast does NOT fire, and the team welcome toast fires exactly once. On Decline, the invite is marked `declined` and the user enters their own normal post-signin state.
4a. **Given** any signed-in user (not just newly created invitees) whose normalized email matches an active `team_invites` entry (`status in ['pending','sent']`, not expired), **When** the post-signin handler runs, **Then** the user is routed to `/join?inviteId=<match>` for explicit consent — silent auto-claim MUST NOT occur on any code path, including for users who never visited the invite link.
5. **Given** an invite that has been revoked, **When** the invitee clicks the link, **Then** they see "This invite is no longer valid" — not a crash or 404.
6. **Given** an invite that has expired (older than 7 days), **When** the invitee clicks the link, **Then** they see "This invite has expired. Ask your team owner to resend it."
7. **Given** a user already logged in with a different email than the invite, **When** they visit the join page, **Then** they see the invite details but cannot claim it — the page shows "This invite was sent to [email]. Log in with that email to accept."

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
6. **Given** the fixture test suite, **When** `claimTeamInvite` runs for a user with a `pending_plans/{email}` document AND separately for a user with an active paid subscription on `users/{uid}`, **Then** the test asserts `dormantPlan` is populated correctly from both sources; **When** `removeTeamMember` is subsequently called, **Then** the test asserts `dormantPlan` is restored verbatim as the active billing state and the `dormantPlan` field is cleared.
7. **Given** the fixture test suite, **When** a simulated Paddle `subscription.updated` / `subscription.canceled` / monthly reset event fires for a `paddleSubscriptionId` referenced by a user's `dormantPlan`, **Then** the test asserts the `dormantPlan` snapshot on that user is updated in place with the new plan/credits/billingStatus values.
8. **Given** the fixture test suite, **When** `claimTeamInvite` runs on a valid invite, **Then** the test asserts `team_invites.status` transitions from `sent` to `accepted`; **When** `declineTeamInvite` runs on a valid invite instead, **Then** the test asserts the status transitions to `declined` (terminal) and the seat is released (not counted toward the owner's plan limit).
9. **Given** the fixture test suite, **When** `removeTeamMember` is called, **Then** the test asserts `pendingRemovalToast = { ownerName, shownAt: null }` is written atomically with the removal; **When** a simulated post-signin handler run consumes the field, **Then** the test asserts the field is deleted and does not re-fire on subsequent sign-ins.
10. **Given** the fixture test suite, **When** `getInviteDetails` is called, **Then** the test asserts it returns the correct status for expired/revoked/declined invites.

---

### Edge Cases

- What happens when an invitee's email is already a member of the team? The invite is blocked with "This email is already a team member."
- What happens when an invitee is already a member of a different team? The invite is blocked with "This user is already on another team." (A user can only be on one team at a time.)
- What happens when the team owner downgrades their plan below the current member count? Existing members remain active but no new invites can be sent until the count is within the new limit. The Team page shows a warning: "You have more members than your plan allows. Remove members or upgrade."
- What happens when a removed member had in-progress work? Their in-progress projects remain accessible to the team owner's workspace. The member loses access.
- What happens when the owner's account is deleted or suspended? All team members are automatically detached. They see "Your team is no longer active."
- What happens when two people click the same invite link? Only the first claim succeeds. The second sees "This invite has already been claimed."
- What happens when a logged-in user clicks an invite link for a different email? The join page shows invite details but blocks claiming with: "This invite was sent to [email]. Log in with that email to accept."
- What happens when an invitee creates an account from the join page but does not verify their email? They remain on the Phase 8 "Verify your email" screen until they click the verification link. The invite stays in `sent` status and is claimed only after verification completes; no automatic claim happens before verification.
- What happens when an invitee's email matches BOTH a pending team invite AND a `pending_plans/{email}` document (e.g., the same person previously paid on Paddle and was later invited to a team)? The team invite takes precedence. The mandatory billing modal is suppressed and the invite is claimed. During the claim transaction, the `pending_plans/{email}` document is consumed into `users/{uid}.dormantPlan` (preserving plan, credits, Paddle fields, billingStatus, and nextResetDate) and then deleted. The dormant plan is inert while the user is on the team. If the user is later removed via `removeTeamMember`, the removal transaction restores `dormantPlan` as the active billing state and clears the field, so the removed member lands directly on their own paid subscription without hitting the mandatory billing modal.
- What happens when a team member's first sign-in coincides with the Phase 8 welcome toast logic? The trial-started toast ("Welcome! Your 7-day trial has started.") MUST be suppressed because team members are not on a trial of their own. Instead, a team-specific welcome toast "You've joined [Owner Name]'s team." fires exactly once, immediately after `fnClaimTeamInvite` succeeds. The claim transaction atomically sets `users/{uid}.teamWelcomeToastShown: true` so rapid re-logins do not re-fire the toast. This is NOT gated by the Phase 8 60-second `createdAt` window (which may already be stale by the time verification completes).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a working invite acceptance page at a dedicated URL path, accepting an invite ID parameter. The current 404 on invite links MUST be fixed.
- **FR-002**: The invite acceptance page MUST detect whether the invitee has an existing account and show the appropriate flow: login (existing) or account creation (new). The flow MUST align with the Phase 8 email-only auth model — no Google sign-in option is shown on the join page.
- **FR-003**: New account creation on the invite page MUST collect: full name, password (≥8 characters), and password confirmation. The email MUST be pre-filled and locked from the invite record. After account creation, the system MUST send a Firebase email verification message and route the invitee to the Phase 8 "Verify your email" screen — the invite MUST NOT be claimed before verification completes.
- **FR-004**: After successful login (existing account) or email verification (newly created account), the post-signin handler MUST discover pending invites by running a `team_invites` query where `inviteeEmailNormalized == currentUser.email.toLowerCase()` AND `status in ['pending','sent']` AND `expiresAt > Date.now()`. The discovery MUST be device-independent and MUST NOT rely on client-side state (localStorage, `continueUrl` parameters, or custom claims), so the user can click the verification link on any device. When a match is found, the handler MUST route the user to `/join?inviteId=<match>` — NEVER call `fnClaimTeamInvite` silently. The `JoinTeam` page displays owner name, team plan, and role label, then presents explicit Accept and Decline buttons; the claim only fires on Accept. Decline marks the invite `declined` and releases the user into their normal post-signin state. This consent requirement applies on every code path (new-invitee verification, existing-user first sign-in, and any subsequent sign-in where `users/{uid}` does not yet exist or the user has plan `'none'`) and prevents team-hijack attacks where a malicious owner guesses a stranger's email. The Phase 8 mandatory billing modal MUST be suppressed while a matching pending invite exists on the user's email, per 009 FR-024a. The Phase 8 "trial started" welcome toast MUST be suppressed for any user whose post-signin path includes a pending-invite match (regardless of whether they ultimately Accept or Decline, since in both cases they are not on a fresh paid trial).
- **FR-005**: The system MUST provide an unauthenticated invite details endpoint that returns the owner name, invitee email, team plan, invite status, and expiry — without exposing sensitive data. Invalid invites return a status code (expired/revoked), not an error. The endpoint MUST be rate-limited to 10 requests per minute per IP to prevent invite ID enumeration.
- **FR-006**: Invites MUST expire 7 days after creation. Expired invites MUST NOT be claimable. Resending MUST reset the expiry clock.
- **FR-007**: The system MUST provide a Team page accessible from account/settings showing: member list (name, email, role, join date), pending invites (email, sent date, status, resend/revoke actions), invite form, and member count vs plan limit. When no members or invites exist, the page MUST show an empty-state prompt ("You haven't invited anyone yet. Add your first team member below.") with the invite form prominently displayed.
- **FR-008**: The invite form MUST enforce plan limits: count active members + open invites against `maxTeamMembers`. At limit, replace the form with an upgrade prompt.
- **FR-009**: Member removal MUST clear the member's team association immediately (set `isTeamMember: false`, clear `teamOwnerUid` / `teamRole`). If `users/{uid}.dormantPlan` is present, the removal transaction MUST atomically restore those fields as the active billing state (plan, credits, Paddle management URLs, billingStatus, nextResetDate) and clear `dormantPlan` — the removed member lands directly on their own paid subscription with no interruption. This restore path runs identically whether `dormantPlan` was populated from a prior `pending_plans/{email}` collision OR snapshotted from an active paid Paddle subscription the claimant held at claim time (see FR-017). If `dormantPlan` is absent, the removal transaction MUST revert `plan` to `'none'` and `credits` to `0`. In every removal path (whether dormantPlan was present or not), the removal transaction MUST also atomically write `users/{uid}.pendingRemovalToast = { ownerName: '<owner's display name at removal time>', shownAt: null }`. On the removed member's next sign-in, the post-signin handler MUST read this field and — if present with `shownAt == null` — display the one-time toast "You've been removed from [Owner Name]'s team." then atomically delete the `pendingRemovalToast` field. Owner name is captured at removal time (not looked up at toast time) so the message remains stable even if the owner later deletes their account. No `formerTeamMember` flag and no account deletion are required.
- **FR-010**: Team members MUST see the team's shared credit pool labeled with the owner's name. The credit display MUST update in real time.
- **FR-011**: Viewer-role members MUST be blocked from all credit-consuming actions. The client MUST prevent action execution and show a clear message explaining the restriction. The server MUST independently reject viewer requests as a second layer of enforcement.
- **FR-015**: Team owners MUST be able to change an existing member's role (editor/viewer) from the Team page without requiring re-invitation.
- **FR-012**: Scaling plan teams MUST have a workspace switcher in the nav, with each workspace maintaining its own generation history. Non-Scaling plans MUST NOT show the switcher.
- **FR-013**: Team state (`teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`, `isTeamOwner`, `isTeamMember`, `teamOwnerName`) MUST be available to the frontend via the same real-time mechanism as billing state. Phase 8 (009) already added the base team-awareness fields (`isTeamMember`, `teamOwnerUid`) to the unified `billingState` document; this phase extends that same `billingState` shape with the additional team fields rather than introducing a parallel listener.
- **FR-014**: Fixture tests MUST verify 10 assertions: (1) invite blocked at limit, (2) claim sets membership, (3) expired invite rejected, (4) removal clears membership, (5) viewer rejected by credit deduction, (6) `dormantPlan` capture-and-restore round trip (both sources: `pending_plans/{email}` collision AND active paid subscription on `users/{uid}` at claim time — restored verbatim on removal and cleared), (7) Paddle webhook write-through updates `dormantPlan` in place on `subscription.updated` / `subscription.canceled` / monthly reset events, (8) consent Accept transitions invite to `accepted` and Decline transitions to `declined` (seat released, not counted toward plan limit), (9) `pendingRemovalToast` is written atomically with removal and deleted on first post-signin consumption, (10) invite details returns correct status for expired/revoked/declined invites.
- **FR-016**: The invite form MUST include a role selector allowing the owner to choose between editor (displayed as "Member") and viewer roles at invite time, defaulting to editor.
- **FR-017**: `claimTeamInvite` MUST preserve the claimant's prior paid billing context in `users/{uid}.dormantPlan` before zeroing out plan and credits for team membership. Two sources MUST be handled uniformly by the same transaction: (a) if `pending_plans/{email.toLowerCase()}` exists, snapshot its fields into `dormantPlan` and delete the pending document; (b) else if the user document already has an active paid subscription (`plan !== 'none'` AND `paddleSubscriptionId` is set), snapshot the user doc's plan, credits, creditsPerMonth, paddleCustomerId, paddleSubscriptionId, paddleUpdatePaymentUrl, paddleCancelUrl, billingStatus, and nextResetDate into `dormantPlan`. If neither source applies, `dormantPlan` MUST be left null. The `dormantPlan` field is inert while the user is on the team and MUST NOT influence credit deduction, plan gating, or the Phase 8 mandatory billing modal gate. FR-009's restore path consumes it on removal.
- **FR-018**: All Paddle webhook handlers that mutate subscription state (`subscription.updated`, `subscription.past_due`, `subscription.canceled`, `transaction.completed`, `transaction.payment_failed`) and the monthly credit reset job MUST perform a secondary-index query on `users` where `dormantPlan.paddleSubscriptionId == eventSubscriptionId`. For every match, the handler MUST update that `dormantPlan` snapshot in place with the same plan/credits/URL/billingStatus/nextResetDate changes it would apply to a live `billingState`, so the snapshot stays current throughout team membership and the FR-009 restore path on removal is a pure in-document copy with no synchronous Paddle API call. A Firestore index on `dormantPlan.paddleSubscriptionId` MUST be added to support this lookup.

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
- **SC-008**: All 10 fixture test assertions pass: invite limit, claim, expiry, removal, viewer rejection, dormantPlan capture-and-restore (both sources), Paddle webhook write-through to dormantPlan, Accept/Decline status transitions, pendingRemovalToast write-and-consume, and invite details.

## Assumptions

- Backend Cloud Functions for team operations (`createTeamInvite`, `claimTeamInvite`, `removeTeamMember`, `resendTeamInvite`, `revokeTeamInvite`, `getInviteDetails`, `getTeamInvites`, `updateTeamMemberRole`) are implemented and functional.
- Team credit pooling via `resolveCreditOwner()` is implemented. The UI displays the owner's credit balance for team members.
- Server-side viewer rejection in `deductCreditsServer` is implemented. Client-side gating blocks the action and shows a toast message.
- Invite delivery happens via GHL webhook (existing). This feature does not change the delivery mechanism.
- A user can only be on one team at a time. Switching teams requires leaving the current team first.
- Phase 8 (Billing State, now Paddle-based per 009) is satisfied. The unified `billingState` document is the single source of truth for plan, credits, and base team-awareness fields (`isTeamMember`, `teamOwnerUid`). Phase 9 extends `billingState` with `teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`, `isTeamOwner`, `teamOwnerName`, `teamRole`, and `isTeamViewer`. Payment-provider fields on `billingState` are Paddle-specific (`paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`); team members read these from the owner's `billingState` for the read-only credit display only.
- Phase 8 introduced an email-verification gate on all new Firebase Auth accounts and a dismiss-proof mandatory billing modal for users whose `billingState.plan === 'none'`. For invitees, both behaviors must be coordinated: the verification gate still applies (invitees must verify their email before the invite is claimed), but the mandatory billing modal MUST be suppressed when the user's email matches a valid pending team invite or when `isTeamMember: true` is already set. This suppression rule is owned by 009 FR-024a; Phase 9 must rely on it rather than re-implement the modal logic. The suppression gate MUST evaluate the "valid pending team invite" condition by re-querying `team_invites` (indexed field `inviteeEmailNormalized`) once per sign-in and caching the boolean in memory for the session — no denormalized flag is stored on the user document, so the gate cannot drift when invites are revoked or expire.
- The Phase 8 "Welcome! Your 7-day trial has started." toast MUST be suppressed for any user entering the app via the team-invite claim flow, since team members are not on a trial of their own. Phase 9 owns the team-specific welcome message ("You've joined [Owner Name]'s team.").
- Google sign-in has been removed in Phase 8. The invite acceptance page therefore offers only email + password (login or create account) — no Google button on the join page.
- Plan limits: Starter/Creator = 1 member (owner only), Pro = 3 members, Scaling = 10 members. These are enforced at both the plan configuration level and server-side.
- Workspace separation (US6) is Scaling-plan only. The `WorkspaceSwitcher` component and `multiBrandWorkspaces` feature flag exist, but full workspace-scoped generation history isolation requires additional integration work.
- Internal role values are `editor` and `viewer`. The UI displays these as "Member" and "Viewer" respectively via i18n keys.
- Invite statuses follow the lifecycle: `pending` → `sent` (after GHL webhook) → `accepted` | `failed` | `revoked` | `expired` | `declined`. `declined` is a terminal state reached when the invitee explicitly clicks Decline on the consent screen — the invite link stops working and the seat is released back to the owner's plan limit. Open invite statuses that count toward plan limits are: `pending`, `sent`, `failed`. `declined` does NOT count toward the limit (the seat is freed for re-invite).
