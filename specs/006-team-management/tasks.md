# Tasks: Team Management

**Input**: Design documents from `/specs/006-team-management/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Status**: Phase 8 / 009 follow-up in progress — 40 original tasks complete, 8 new tasks added from Session 2026-04-15 (both passes)
**Last Updated**: 2026-04-15
**Prerequisite**: Phase 8 (Billing State, Paddle per 009) — satisfied; new surface area must land in the same branch as 009 for the Paddle webhook write-through touchpoint

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Translation strings, service wrappers, and shared utilities needed by multiple stories

- [x] T001 [P] Add team translation strings (English + Arabic) to `src/i18n.tsx` — keys for: join page titles, invite status messages ("This invite is no longer valid", "This invite has expired. Ask your team owner to resend it.", "This invite was sent to [email]. Log in with that email to accept."), team page labels, plan limit messages ("Your [Plan] plan allows [max] members. Upgrade to Scaling for up to 10.", "You have more members than your plan allows. Remove members or upgrade.", "Team invites are available on Pro and above."), credit labels, viewer tooltip, empty state, removal message, role labels ("Member"/"Viewer"). Minimum 22 keys.
- [x] T002 [P] Create `src/services/teamService.ts` — export callable wrappers for: `fnGetInviteDetails(inviteId)`, `fnCreateTeamInvite(data)`, `fnResendTeamInvite(inviteId)`, `fnRevokeTeamInvite(inviteId)`, `fnClaimTeamInvite(inviteId)`, `fnGetTeamInvites()`, `fnRemoveTeamMember(memberId)`, `fnUpdateTeamMemberRole(memberId, role)`. Each wraps `httpsCallable()` from Firebase Functions SDK. (Session 2026-04-15 second pass adds `fnDeclineTeamInvite(inviteId)` — see T011d.)
- [x] T003 [P] Add `getInviteDetails` Cloud Function in `functions/src/index.ts` — onCall, unauthenticated (`region: "europe-west1"`, no auth check). Implement per contract in `contracts/get-invite-details.md`: read from `team_invites` by `inviteId`, return `{ success, ownerName, inviteeEmail, inviteeName, teamPlan, role, status, expiresAt }` for claimable invites. Return `{ success: false, status, message }` for expired/revoked/accepted/not_found. Check `expiresAt` before returning.
- [x] T004 Add IP-based rate limiting to `getInviteDetails` in `functions/src/index.ts` — before processing, read/increment a Firestore counter at `rateLimits/{ip}` (keyed by `request.rawRequest.ip`). If count exceeds 10 within the current minute window, throw `HttpsError('resource-exhausted', 'Too many requests. Try again shortly.')`. Use minute-granularity document IDs for auto-cleanup.
- [x] T004a [P] Add Firestore indexes in `firestore.indexes.json` — two new composite indexes required by Session 2026-04-15 follow-up: (1) `team_invites` collection with fields `inviteeEmailNormalized` ASC and `status` ASC and `expiresAt` ASC, supporting the device-independent post-signin discovery query (T011a) and the mandatory-billing-modal suppression gate; (2) `users` collection with field `dormantPlan.paddleSubscriptionId` ASC, supporting the Paddle webhook write-through loop (T030b). Deploy via `firebase deploy --only firestore:indexes`.

**Checkpoint**: Backend endpoint ready, frontend service wrappers ready, translations ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Team state exposure in frontend — MUST be complete before any **frontend** user story can use team context. Backend-only stories (US7, US8) may start earlier.

**CRITICAL**: No frontend user story work can begin until this phase is complete

- [x] T005 Add team state fields to frontend user state in `src/App.tsx` — extend the existing Firestore `users/{uid}` listener to extract and expose: `isTeamMember`, `teamOwnerUid`, `teamRole`, `isTeamOwner` (derived: `maxTeamMembers > 1` on the user doc — all plans with team capacity set this field). Make these available via the existing app state/context mechanism.
- [x] T006 Add team owner metadata to frontend state in `src/App.tsx` — when `isTeamMember === true`, perform a secondary read of `users/{teamOwnerUid}` to get `teamOwnerName`. When `isTeamOwner === true`, read `users/{uid}/team` subcollection count for `teamMemberCount` and query `team_invites` where `ownerId == uid` and `status in ['pending','sent']` for `teamOpenInvites`. Expose `teamOwnerName`, `teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`.
- [x] T007 Add "removed from team" detection in `src/App.tsx` — when the user doc listener detects `isTeamMember` changed from `true` to `false` (team member was removed): show a blocking message overlay: "You've been removed from this team. Contact your team owner." via `t()`. Provide a "Sign out" or "Continue as free user" action depending on whether they have an independent plan. This applies to all team members regardless of role.

**Checkpoint**: Frontend team state available, removal detection active — frontend user story implementation can now begin

---

## Phase 3: User Story 1 — Invite Acceptance (Priority: P1) MVP

**Goal**: Fix the critical 404 on invite links. Invitees land on a working page, log in or create an account, and join the team.

**Independent Test**: Send a team invite. Click the link. Verify the page loads (no 404). Complete login or account creation. Verify the invitee joins the team.

### Implementation for User Story 1

- [x] T008 [US1] Add `/join` route detection in `src/App.tsx` — at the top of the component render, check `window.location.pathname.startsWith('/join')`. If true, extract `inviteId` from `URLSearchParams`. Render `<JoinTeam inviteId={inviteId} />` and skip the normal auth/app flow. Import `JoinTeam` from `src/pages/JoinTeam.tsx`.
- [x] T009 [US1] Create `src/pages/JoinTeam.tsx` — loading state: call `fnGetInviteDetails(inviteId)` on mount. Show loading spinner while fetching. On success (`success: true`): display owner name, invitee email, invitee name, team plan, role label ("Member"/"Viewer"), and expiry. On failure: show status-specific message — expired: "This invite has expired. Ask your team owner to resend it.", revoked: "This invite is no longer valid", accepted: "This invite has already been claimed", not_found: "This invite is no longer valid". All strings via `t()` from `src/i18n.tsx`.
- [x] T010 [US1] Add existing-user login flow to `src/pages/JoinTeam.tsx` — when invite details load successfully, check if the invitee email has a Firebase Auth account (use `fetchSignInMethodsForEmail`). If yes: show login form with email pre-filled and locked, password field. On submit: `signInWithEmailAndPassword` only. Do **NOT** call `fnClaimTeamInvite` after login — the claim is deferred to T011c (Accept/Decline UI), which renders as soon as the page detects a signed-in verified user whose email matches the invite. **Security invariant**: no code path on the join page may invoke `fnClaimTeamInvite` without an explicit click on the Accept button. This preserves the consent-required rule from Session 2026-04-15 (second pass) Q1 and closes the team-hijack vector that would otherwise exist for victims whose email already has a Firebase Auth account (an attacker-created invite would silently conscript them on their next login). **Regression note**: the originally shipped version of this task auto-claimed after login; that behavior must be removed. Mark this task `[ ]` until the auto-claim call is deleted and the T011c Accept/Decline UI is verified to fire correctly on the existing-user path.
- [x] T011 [US1] Add new-user account creation flow to `src/pages/JoinTeam.tsx` — if `fetchSignInMethodsForEmail` returns empty: show account creation form with fields: full name (editable, pre-filled from `inviteeName`), email (pre-filled + locked from invite), password (≥8 chars), confirm password. On submit: validate passwords match and length → `createUserWithEmailAndPassword` → `updateProfile({ displayName })` → `sendEmailVerification(user)` (Phase 8 email-only auth gate) → route the user to the Phase 8 `VerifyEmailScreen`. Do NOT call `fnClaimTeamInvite` yet — the claim runs after verification. Do NOT persist `pendingInviteId` in localStorage — the post-signin handler rediscovers the invite by email query, so the flow remains device-independent.
- [x] T011a [US1] Wire device-independent post-signin invite discovery in `src/App.tsx` (or the shared post-signin handler used by Phase 8) — when `onAuthStateChanged` observes a verified user whose `users/{uid}` document does not yet exist OR whose `billingState.plan === 'none'` with no active team membership, query `team_invites` where `inviteeEmailNormalized == currentUser.email.toLowerCase()` AND `status in ['pending','sent']` AND `expiresAt > Date.now()`. If a matching invite is found, route the user to `/join?inviteId=<match>` — DO NOT call `fnClaimTeamInvite` silently. The join page presents explicit Accept and Decline buttons; the claim only fires on Accept (see T011c). The query MUST NOT depend on localStorage, `continueUrl` parameters, or custom claims, so the user can click the verification link on a different device and still reach the consent screen.
- [x] T011c [US1] Add Accept / Decline UI to `src/pages/JoinTeam.tsx` — when the join page loads with a valid invite AND the current user is signed in and verified AND their email matches the invite, show two buttons: "Accept invite" (primary) and "Decline" (secondary). On Accept: call `fnClaimTeamInvite(inviteId)` → redirect to `/`. On Decline: call `fnDeclineTeamInvite(inviteId)` → show a brief confirmation ("Invite declined") → redirect the user to their normal post-signin state (own paid plan or the Phase 8 mandatory billing modal). The page MUST NOT auto-submit on load, ensuring explicit consent.
- [x] T011d [US1] Add `declineTeamInvite` Cloud Function in `functions/src/index.ts` — onCall, authenticated. Accept `inviteId`. Verify the authenticated user's normalized email matches `team_invites/{inviteId}.inviteeEmailNormalized`. Transition the invite status to `declined`, set `declinedAt` timestamp, and release the seat (seat counting already excludes `declined` status). Return `{ success: true }`. Add a corresponding `fnDeclineTeamInvite` wrapper in `src/services/teamService.ts`.
- [x] T011b [US1] Suppress mandatory billing modal and trial welcome toast for invitees — in the Phase 8 mandatory-billing-modal gate and welcome-toast logic (owned by 009), ensure both are skipped when (a) the user has `isTeamMember: true`, OR (b) a valid unclaimed `team_invites` document exists with `inviteeEmailNormalized === currentUser.email.toLowerCase()`. This mirrors 009 FR-024a. The gate MUST re-query `team_invites` once per sign-in (reusing the T011a query) and cache the boolean in memory for the remainder of the session — no denormalized flag on the user doc. Verify by creating a new invitee end-to-end and confirming neither the modal nor the "7-day trial" toast ever appears.
- [x] T011e [US1] Extend `claimTeamInvite` in `functions/src/index.ts` for dormantPlan capture and welcome-toast idempotency (FR-017, FR-004) — within the existing Firestore transaction, BEFORE zeroing the user's plan/credits for team membership: (a) read `pending_plans/{email.toLowerCase()}`; if it exists, snapshot its full field set into `users/{uid}.dormantPlan` and delete the pending document in the same transaction; (b) else if the user document already has an active paid subscription (`plan !== 'none'` AND `paddleSubscriptionId` is set), snapshot the user doc's `plan`, `credits`, `creditsPerMonth`, `paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`, `billingStatus`, and `nextResetDate` into `dormantPlan`; (c) else leave `dormantPlan` null. Also atomically set `users/{uid}.teamWelcomeToastShown: true` so the "You've joined [Owner Name]'s team." toast fires exactly once per claim regardless of the Phase 8 60-second `createdAt` window. Fixture coverage: T036a.
- [x] T012 [US1] Add email mismatch detection to `src/pages/JoinTeam.tsx` — after invite details load, check if there is a currently logged-in user (`firebase.auth().currentUser`). If logged in AND `currentUser.email !== inviteeEmail`: show invite details (read-only) with message "This invite was sent to [inviteeEmail]. Log in with that email to accept." and a "Sign out and continue" button that signs out then re-renders the login/signup flow.

**Checkpoint**: Invite links work end-to-end — zero 404s. New users complete email verification before the invite is claimed. Mandatory billing modal and trial welcome toast are suppressed for invitees. Existing users and email-mismatch cases handled gracefully.

---

## Phase 4: User Story 2 — Team Page (Priority: P2)

**Goal**: Team owners can view and manage their team from a single page: member list, pending invites, invite form, resend/revoke/remove/role-change actions.

**Independent Test**: Navigate to Team page. Verify member list, pending invites, invite form, and all management actions work.

### Implementation for User Story 2

- [x] T013 [US2] Create `src/pages/Team.tsx` — page layout with sections: header ("Team" + member count vs plan limit "2 / 3 members on Pro"), member list, pending invites list, and invite form. Use Tailwind CSS for styling consistent with existing pages.
- [x] T014 [US2] Implement member list in `src/pages/Team.tsx` — fetch from `users/{ownerUid}/team` subcollection via Firestore listener. Display each member: name, email, role (show "Member" for `editor`, "Viewer" for `viewer`), join date formatted. Add role change dropdown/toggle per member that calls `fnUpdateTeamMemberRole(memberId, newRole)`. Add "Remove" button per member.
- [x] T015 [US2] Implement pending invites list in `src/pages/Team.tsx` — call `fnGetTeamInvites()` or set up Firestore listener on `team_invites` where `ownerId == currentUser.uid` and `status in ['pending','sent']`. Display each invite: email, role label, sent date, status badge. Add "Resend" button (calls `fnResendTeamInvite(inviteId)`) and "Revoke" button (calls `fnRevokeTeamInvite(inviteId)` after confirmation dialog: "This invite link will stop working.").
- [x] T016 [US2] Implement invite form in `src/pages/Team.tsx` — form fields: invitee email (required, email validation), invitee name (required), role selector (dropdown: "Member" / "Viewer", default: "Member"). On submit: map "Member" → `'editor'`, "Viewer" → `'viewer'`, call `fnCreateTeamInvite({ email, name, role })`. On success: new invite appears in pending list. On error: map server error codes to specific translated messages (e.g., "This email is already a team member", "This user is already on another team") via `t()`.
- [x] T017 [US2] Implement member removal confirmation in `src/pages/Team.tsx` — when "Remove" clicked, show confirmation dialog: "Remove [Name]? They will lose access immediately." On confirm: call `fnRemoveTeamMember(memberId)`. On success: member disappears from list, count updates.
- [x] T017a [US2] Extend `removeTeamMember` in `functions/src/index.ts` for dormantPlan restore and removal toast (FR-009) — within the existing Firestore transaction: (a) if `users/{uid}.dormantPlan` is present, atomically restore its fields (`plan`, `credits`, `creditsPerMonth`, `paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`, `billingStatus`, `nextResetDate`) onto the user doc as the active billing state, then clear the `dormantPlan` field — the removed user lands directly back on their own paid subscription with no interruption. If `dormantPlan` is absent, revert `plan` to `'none'` and `credits` to `0`. (b) In every removal path (dormantPlan present or not), atomically write `users/{uid}.pendingRemovalToast = { ownerName: '<owner's display name captured at removal time>', shownAt: null }` so the removed member's next sign-in fires a one-time "You've been removed from [Owner Name]'s team." toast. Owner name is captured now, not looked up later, so the message stays stable if the owner later deletes their account. Fixture coverage: T036a (restore), T036d (toast).
- [x] T017b [US2] Wire `pendingRemovalToast` consumption in `src/App.tsx` post-signin handler — on every sign-in, after loading the user doc, check if `pendingRemovalToast` is present with `shownAt == null`. If so: display a toast using `t('team.removedFromTeam', { ownerName: pendingRemovalToast.ownerName })` and atomically delete the `pendingRemovalToast` field from the user doc. Exactly-once delivery: whichever device fires first clears the flag.
- [x] T018 [US2] Implement empty state in `src/pages/Team.tsx` — when member list is empty AND pending invites list is empty: show "You haven't invited anyone yet. Add your first team member below." with the invite form prominently displayed below. Hide the empty member/invite list sections.
- [x] T019 [US2] Add Team page navigation in `src/App.tsx` — add a "Team" link/button in the account/settings area (only visible when `isTeamOwner === true`). Clicking navigates to the Team page. Use the existing state-driven navigation pattern (no router — conditionally render `<Team />` based on app state).

**Checkpoint**: Team owners can manage their entire team from one page. All CRUD actions work with real-time updates.

---

## Phase 5: User Story 3 — Plan Limit Enforcement (Priority: P3)

**Goal**: Invite form enforces plan limits. At-limit owners see upgrade prompt. Over-limit owners (after downgrade) see warning. Starter/Creator owners see "not available" message.

**Independent Test**: On Pro plan (max 3), fill team to limit. Verify invite form replaced with upgrade prompt.

### Implementation for User Story 3

- [x] T020 [US3] Add plan limit check to invite form in `src/pages/Team.tsx` — before rendering the invite form, compute `currentCount = teamMemberCount + teamOpenInvites` (from team state). If `currentCount >= maxTeamMembers`: hide the invite form and show "Your [Plan] plan allows [max] members. Upgrade to [next plan] for up to [next limit]." (Plan→Scaling: "Upgrade to Scaling for up to 10."). All strings via `t()`.
- [x] T021 [US3] Add over-limit warning in `src/pages/Team.tsx` — when `teamMemberCount > maxTeamMembers` (owner downgraded plan below current member count): show a warning banner at top of Team page: "You have more members than your plan allows. Remove members or upgrade." via `t()`. Existing members remain active but the invite form is hidden (covered by T020's limit check).
- [x] T022 [US3] Add Starter/Creator plan restriction in `src/pages/Team.tsx` — if `maxTeamMembers <= 1` (Starter or Creator): hide the invite form entirely. Show message: "Team invites are available on Pro and above." Do not render member list or pending invites sections (owner is the only member).

**Checkpoint**: Plan limits enforced at 100% accuracy on the frontend including downgrade edge case. Server-side enforcement already exists in `createTeamInvite`.

---

## Phase 6: User Story 4 — Team Credit Visibility (Priority: P4)

**Goal**: Team members see shared credit pool labeled with owner's name. Real-time updates within 2 seconds.

**Independent Test**: Log in as team member. Verify credit bar shows team label and owner's credit balance.

### Implementation for User Story 4

- [x] T023 [US4] Add team credit label in `src/App.tsx` — in the credit display area, when `isTeamMember === true`: show "Team credits — [teamOwnerName]'s account" with the owner's credit balance (read from owner's doc via the secondary listener from T006). When `isTeamOwner === true` and team has members: show "Team credits — your account" with own credit balance. Use `t()` for all labels. Credit balance must update in real time via existing Firestore listener.

**Checkpoint**: Team members see correct credit context. Real-time updates working.

---

## Phase 7: User Story 5 — Role-Based Action Gating (Priority: P5)

**Goal**: Viewer-role members cannot trigger credit-consuming actions. Buttons show tooltip.

**Independent Test**: Log in as viewer. Click Generate. Verify tooltip shown, no generation triggered.

### Implementation for User Story 5

- [x] T024 [US5] Add viewer gating to credit-consuming actions in `src/App.tsx` — when `teamRole === 'viewer'`: block all credit-consuming actions in the `deductCredits()` function. Show toast message: "Viewers cannot perform this action. Ask your team owner to upgrade your role." via `showToast()`. Server independently rejects via `resolveCreditOwner()` in `functions/src/entitlements.ts`.
- [x] T040 [US5] (Optional) Add visual disable to generation buttons in `src/App.tsx` — when `isTeamViewer === true`: apply `opacity-50 pointer-events-none` or `cursor-not-allowed` styling to generation buttons. Add hover tooltip: "Viewers cannot generate — ask your team owner." via `t()`. This is a UX enhancement on top of the existing toast-on-click + server rejection.

**Checkpoint**: Viewer gating enforced on client (toast + server rejection). Optional: visual button disable for improved UX.

---

## Phase 8: User Story 6 — Workspace Separation (Priority: P6)

**Goal**: Scaling plan teams get workspace switcher with management UI. Each workspace has own generation history. Non-Scaling: no switcher.

**Independent Test**: On Scaling plan, create two workspaces. Generate in A. Switch to B. Verify B's history is empty.

### Implementation for User Story 6

- [x] T025 [US6] Add workspace Cloud Functions in `functions/src/index.ts` — create `createWorkspace(name)`, `renameWorkspace(workspaceId, name)`, `deleteWorkspace(workspaceId)` Cloud Functions. Each operates on `users/{ownerUid}/workspaces/{workspaceId}` subcollection with fields: `workspaceId`, `name`, `createdAt`. Add `workspaceId` field to generation records. Only callable by team owners on Scaling plan.
- [x] T026 [US6] Add workspace switcher in nav in `src/App.tsx` — when `billingState.multiBrandWorkspaces === true` (Scaling plan): show workspace dropdown in the nav. List workspaces from `users/{ownerUid}/workspaces` subcollection. Selecting a workspace sets active `workspaceId` in app state. Default to first workspace. When not Scaling: hide switcher entirely.
- [x] T027 [US6] Add workspace management UI in `src/pages/Team.tsx` — when `billingState.multiBrandWorkspaces === true`: show a "Workspaces" section on the Team page. List existing workspaces (name, created date). Provide "Create workspace" form (name field), "Rename" action per workspace, and "Delete" action per workspace (with confirmation). Calls `fnCreateWorkspace`, `fnRenameWorkspace`, `fnDeleteWorkspace` from `src/services/teamService.ts`.
- [x] T028 [US6] Filter generation history by workspace in `src/App.tsx` — when `workspaceId` is set in app state, filter all generation queries (projects, avatars, history) to include `where('workspaceId', '==', activeWorkspaceId)`. New generations created while a workspace is active must include the `workspaceId` field in the Firestore document. Non-Scaling users: no filter (all generations visible). This requires changes across all generation-related Firestore queries.

**Checkpoint**: Workspace separation working for Scaling plans with full CRUD and history filtering. Non-Scaling unaffected.

---

## Phase 9: User Story 7 — Invite Expiry (Priority: P7)

**Goal**: Verify that invites expire after 7 days and resending resets the clock.

**Independent Test**: Create invite. Simulate 7-day expiry. Attempt claim. Verify rejection.

### Implementation for User Story 7

- [x] T029 [US7] Verify expiry enforcement in `claimTeamInvite` in `functions/src/index.ts` — confirm that the function checks `expiresAt` before allowing claim. If `Date.now() > expiresAt`, return `{ success: false, message: 'This invite has expired.' }`. If not present, add the check.
- [x] T030 [US7] Verify resend resets expiry in `resendTeamInvite` in `functions/src/index.ts` — confirm that the function updates `expiresAt` to `Date.now() + 7 * 24 * 60 * 60 * 1000` when resending. If not present, add the update.
- [x] T030a [US7] Add dormantPlan write-through to Paddle webhook handlers in `functions/src/billing/paddleWebhook.ts` (FR-018, Phase 8 / 009 touchpoint) — in every subscription-mutating handler (`subscription.updated`, `subscription.past_due`, `subscription.canceled`, `transaction.completed`, `transaction.payment_failed`), after the primary `billingState` write completes, perform a secondary-index query: `users` where `dormantPlan.paddleSubscriptionId == eventSubscriptionId`. For every match, update the `dormantPlan` snapshot in place with the same field changes applied to a live `billingState` (plan, credits, paddleUpdatePaymentUrl, paddleCancelUrl, billingStatus, nextResetDate). The query depends on index T004a. This is the ONLY Phase 9 change to 009-owned files. Fixture coverage: T036b.
- [x] T030b [US7] Add dormantPlan write-through to the monthly credit reset scheduled function in `functions/src/billing/billingState.ts` (or wherever the monthly reset job lives per 009) — in addition to refreshing each active user's `billingState.credits` to the plan allocation, also run the same secondary-index query on `users` where `dormantPlan.paddleSubscriptionId == reset target's subscription`, and refresh `dormantPlan.credits` to the plan allocation + update `dormantPlan.nextResetDate`. Fixture coverage: T036b (monthly reset sub-case).

**Checkpoint**: Expiry enforcement verified. Resend resets clock. Paddle webhooks and the monthly reset keep every `dormantPlan` snapshot in sync with its source subscription, so `removeTeamMember` restore is always current without a synchronous Paddle API call.

---

## Phase 10: User Story 8 — QA Fixtures (Priority: P8)

**Goal**: Fixture tests verify 10 core team operations (6 original + 4 added in Session 2026-04-15 second pass). All assertions pass.

**Independent Test**: Run `cd functions && npm run test:contracts`. All team assertions pass.

### Implementation for User Story 8

- [x] T031 [P] [US8] Add fixture test: invite blocked at plan limit in `functions/src/teamFixtureTests.ts` — set up a team at max capacity, attempt `createTeamInvite`, assert it is rejected with a plan-limit error.
- [x] T032 [P] [US8] Add fixture test: claim sets membership in `functions/src/teamFixtureTests.ts` — create invite, call `claimTeamInvite`, (via `isClaimable` logic), assert membership state after claim has verifies `isTeamMember`, and `teamOwnerUid` are set correctly.
- [x] T033 [P] [US8] Add fixture test: expired invite rejected in `functions/src/teamFixtureTests.ts` — create invite with `expiresAt` in past, attempt `claimTeamInvite`, (via `isClaimable` logic), assert expired invites are rejected. Test expired invite with `Date.now() > expiresAt` as expired.
- [x] T034 [P] [US8] Add fixture test: removal clears membership in `functions/src/teamFixtureTests.ts` — add a team member, call `removeTeamMember`, assert `isTeamMember` is cleared on the user doc.
- [x] T035 [P] [US8] Add fixture test: viewer rejected by deductCreditsServer in `functions/src/teamFixtureTests.ts` — set user as viewer-role team member, attempt `deductCreditsServer`, assert it is rejected.
- [x] T036 [P] [US8] Add fixture test: getInviteDetails status correctness in `functions/src/contractFixtures.test.ts` — create expired invite, call `getInviteDetails`, assert `{ success: false, status: 'expired' }`. Create revoked invite, assert `{ success: false, status: 'revoked' }`. Create valid invite, assert `{ success: true }` with correct fields.
- [x] T036a [P] [US8] Add fixture test: dormantPlan capture-and-restore round trip in `functions/src/teamFixtureTests.ts` — two sub-cases. (a) Write a `pending_plans/{email}` doc with paid plan data, call `claimTeamInvite`, assert `users/{uid}.dormantPlan` contains the pending-plan fields and the `pending_plans` doc is deleted. (b) Create a user with an active paid subscription (`plan: 'pro'`, `paddleSubscriptionId` set, 1400 credits), call `claimTeamInvite`, assert `dormantPlan` captures the active subscription fields and user is now on the team pool (`plan: 'none'`, `credits: 0`). For both sub-cases: subsequently call `removeTeamMember` and assert the user doc's plan/credits/paddleSubscriptionId/paddleUpdatePaymentUrl/paddleCancelUrl/billingStatus/nextResetDate are restored verbatim from `dormantPlan` and the `dormantPlan` field is cleared.
- [x] T036b [P] [US8] Add fixture test: Paddle webhook write-through to dormantPlan in `functions/src/teamFixtureTests.ts` — seed a user with `dormantPlan.paddleSubscriptionId = 'sub_test'` and `isTeamMember: true`. Simulate a `subscription.updated` webhook event targeting `sub_test` with a new plan/credit allocation, assert the user's `dormantPlan` snapshot is updated in place (plan, credits, billingStatus reflect the new values) while the live billing state for the team membership is unchanged. Repeat for `subscription.canceled` (assert `dormantPlan.plan` becomes `'none'`, credits `0`) and the monthly credit reset job (assert `dormantPlan.credits` is refreshed to the plan allocation).
- [x] T036c [P] [US8] Add fixture test: Accept/Decline status transitions in `functions/src/teamFixtureTests.ts` — (a) create a valid invite, call `claimTeamInvite`, assert `team_invites/{inviteId}.status` transitions from `'sent'` to `'accepted'` and that the seat counts toward the owner's plan limit. (b) Create a separate valid invite, call `declineTeamInvite`, assert the status transitions to `'declined'`, that `declinedAt` is set, and that subsequent `createTeamInvite` calls can now succeed at the same plan limit (the declined seat is released and does NOT count toward the limit).
- [x] T036d [P] [US8] Add fixture test: pendingRemovalToast write-and-consume idempotency in `functions/src/teamFixtureTests.ts` — add a team member, call `removeTeamMember`, assert `users/{uid}.pendingRemovalToast` is written atomically with the removal containing `{ ownerName: <captured owner name>, shownAt: null }`. Simulate a post-signin handler run that consumes the field: assert the toast would fire and the `pendingRemovalToast` field is atomically deleted. Simulate a second post-signin handler run: assert no toast fires and no field is present (exactly-once).

**Checkpoint**: All 10 fixture test assertions pass. `npm run test:contracts` green.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Build verification and final cleanup

- [x] T037 [P] Run frontend build check — `npm run build` must complete with zero errors
- [x] T038 [P] Run backend build check — `cd functions && rm -rf lib && npm run build` must complete with zero errors
- [x] T039 Verify all `t()` keys resolve in both English and Arabic — no missing translation warnings in console

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately. T001, T002, T003 are parallel. T004 depends on T003. T004a (Firestore indexes) is independent and can run in parallel with T001–T003.
- **Phase 2 (Foundational)**: Depends on Phase 1 completion (needs service wrappers). T005 → T006 → T007 are sequential.
- **Phases 3–8 (Frontend Stories)**: All depend on Phase 2 completion.
- **Phases 9–10 (Backend Stories)**: US7 can start immediately. US8 depends on T004a (fixture tests need the new indexes) and on T011e / T017a / T030a / T030b / T011d (the code each fixture exercises must exist first).
- **Phase 11 (Polish)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2. No dependencies on other stories. **This is the MVP.** Session 2026-04-15 adds T011a, T011b, T011c, T011d, T011e — all within US1 scope. T011e (dormantPlan capture in `claimTeamInvite`) depends on Phase 8 / 009's `pending_plans` collection already existing.
- **US2 (P2)**: Can start after Phase 2. Independent of US1 (different page). T017a and T017b add dormantPlan restore + `pendingRemovalToast` — they depend on T011e having established the dormantPlan field shape but do not depend on any US1 frontend task.
- **US3 (P3)**: Depends on US2 (modifies the Team page invite form).
- **US4 (P4)**: Can start after Phase 2. Independent (modifies credit display in App.tsx).
- **US5 (P5)**: Can start after Phase 2. Independent (modifies generation buttons in App.tsx).
- **US6 (P6)**: Can start after Phase 2. Independent (workspace Cloud Functions + switcher + Team page section + history filtering).
- **US7 (P7)**: Can start immediately (backend verification only — no frontend dependency). T030a and T030b touch 009-owned files (`functions/src/billing/paddleWebhook.ts`, `functions/src/billing/billingState.ts`) and require the 009 branch merged or available.
- **US8 (P8)**: Can start after T003 + T004a + the code each fixture exercises (T011d, T011e, T017a, T030a, T030b). T036a–T036d are blocked on their respective implementation tasks.

### Parallel Opportunities

After Phase 2 completes, the following can run in parallel:
- **Stream A** (frontend — join page + consent): US1 (T008–T012, T011a–T011c)
- **Stream B** (frontend — team page): US2 (T013–T019, T017b) → US3 (T020–T022)
- **Stream C** (frontend — app chrome): US4 (T023) + US5 (T024)
- **Stream D** (frontend — workspaces): US6 (T025–T028)
- **Stream E** (backend — team Cloud Functions): US1 backend (T011d, T011e) + US2 backend (T017a) + US7 (T029–T030)
- **Stream F** (backend — 009 touchpoint): US7 Paddle write-through (T030a, T030b) — depends on 009 branch availability
- **Stream G** (backend verification): US8 (T031–T036, T036a–T036d) — blocked on Streams E and F

---

## Parallel Example: Phase 1

```text
# All three can run simultaneously (different files):
T001: Add team translations in src/i18n.tsx
T002: Create service wrappers in src/services/teamService.ts
T003: Add getInviteDetails in functions/src/index.ts

# Then sequentially:
T004: Add rate limiting to getInviteDetails (depends on T003)
```

## Parallel Example: User Story 8

```text
# All ten fixture tests can run in parallel (same file, independent test cases):
T031: Fixture — invite blocked at limit
T032: Fixture — claim sets membership
T033: Fixture — expired invite rejected
T034: Fixture — removal clears membership
T035: Fixture — viewer rejected
T036: Fixture — getInviteDetails status
T036a: Fixture — dormantPlan capture-and-restore round trip (both sources)
T036b: Fixture — Paddle webhook write-through to dormantPlan
T036c: Fixture — Accept/Decline status transitions
T036d: Fixture — pendingRemovalToast write-and-consume idempotency
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T007)
3. Complete Phase 3: US1 — Invite Acceptance (T008–T012)
4. **STOP and VALIDATE**: Click an invite link → page loads → login/signup works → team joined
5. Deploy if ready — the critical 404 bug is fixed

### Incremental Delivery

1. Setup + Foundational → backend endpoint and frontend state ready
2. US1 → Invite links work (MVP!)
3. US2 → Team management page live
4. US3 → Plan limits enforced in UI (including downgrade warning)
5. US4 + US5 → Credit visibility + viewer gating
6. US6 → Workspace separation with management UI (Scaling only)
7. US7 + US8 → Backend verification + fixture tests
8. Polish → Build clean, translations verified

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Backend stores role as `'editor'` — UI displays "Member". Map in all frontend code.
- All user-facing strings must use `t()` from `src/i18n.tsx` — no hardcoded strings. New i18n keys required by Session 2026-04-15: `team.acceptInvite`, `team.declineInvite`, `team.inviteDeclined`, `team.joinedTeamToast`, `team.removedFromTeam` — all must ship with EN + AR.
- New Cloud Functions after Session 2026-04-15 second pass: `declineTeamInvite` (T011d). `claimTeamInvite` and `removeTeamMember` are extended (T011e, T017a) rather than replaced. Workspace CRUD still adds 3 Cloud Functions (US6 only).
- Phase 8 (Billing State, Paddle per 009) dependency is satisfied. Team state fields are available via Firestore listeners. Session 2026-04-15 adds two Paddle-webhook touchpoints (T030a, T030b) into 009-owned files and relies on 009 FR-024a for mandatory-billing-modal suppression.
- Task count: 40 original tasks complete (T001–T039, T040); 8 new tasks added from Session 2026-04-15 two passes (T004a, T011a, T011b, T011c, T011d, T011e, T017a, T017b, T030a, T030b, T036a, T036b, T036c, T036d — some of which are already-listed elsewhere). Open items are all marked `[ ]`.
- **Security invariant**: No code path may auto-claim an invite without explicit user consent. `claimTeamInvite` is the only Cloud Function that can transition `team_invites.status` to `accepted`, and it is invoked exclusively from the Accept button on the `/join?inviteId=X` consent screen. Any regression that routes auto-claim logic through the post-signin handler reopens the team-hijack vector closed in Session 2026-04-15 second pass Q1.
