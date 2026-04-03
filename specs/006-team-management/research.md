# Research: Team Management

**Date**: 2026-04-03 | **Branch**: `006-team-management`

## R1: Existing Backend Functions

**Decision**: Build frontend UI on top of existing Cloud Functions. Add one new function (`getInviteDetails`).

**Findings**: All 7 team Cloud Functions exist and are functional:
- `createTeamInvite` — creates invite, sends via GHL webhook, validates seat limits
- `resendTeamInvite` — refreshes expiry to 7 days, retries GHL delivery
- `revokeTeamInvite` — marks invite as revoked
- `claimTeamInvite` — matches caller email to invite, creates team member, sets flags via transaction
- `getTeamInvites` — lists all invites for owner, auto-expires stale on read
- `createTeamMember` — legacy compat wrapper
- `removeTeamMember` — deletes member from subcollection, clears user flags

**Missing**: `getInviteDetails(inviteId)` — unauthenticated endpoint for the join page. Must be created (task 9.4).

**Rationale**: Reuse everything. Only new backend work is `getInviteDetails` and adding `expiresAt` enforcement to `claimTeamInvite`.

---

## R2: Invite Firestore Schema

**Decision**: Use existing `team_invites` collection as-is. No schema changes needed.

**Findings**: Documents have: `inviteId`, `ownerId`, `ownerEmail`, `ownerName`, `inviteeEmail`, `inviteeEmailNormalized`, `inviteeName`, `role` ('editor'|'viewer'), `teamPlan`, `status` ('pending'|'sent'|'failed'|'accepted'|'revoked'|'expired'), `createdAt`, `updatedAt`, `sentAt`, `acceptedAt`, `revokedAt`, `expiresAt`, `deliveryAttemptCount`, `lastDeliveryError`, `ghlDeliveryStatus`, `claimedByUserId`.

**Note**: The spec says roles are "member/viewer" but the backend uses "editor/viewer". Canonical term: **editor** (not "member") to match existing data. The spec's UI label can show "Member" to users while storing "editor" in the database.

---

## R3: Frontend Routing Architecture

**Decision**: Add URL-based route handling for `/join`. The app currently uses conditional rendering (no router library). The `/join` route must be detected from `window.location.pathname` early in the render flow.

**Findings**: App.tsx returns conditional JSX: LoadingAuth → LoginScreen → OnboardingQuiz → WelcomeScreen → Main App. No router library (react-router, etc.) is installed. All navigation is state-driven.

**Rationale**: Adding a full router is out of scope. Instead, detect `/join` path at the top of the component tree and render the JoinTeam component before the normal auth/app flow. This is the minimal change.

**Alternatives rejected**: Installing react-router — too invasive for one route, risk of breaking existing state-driven navigation.

---

## R4: Team Member Model

**Decision**: Use existing user document fields. No changes needed.

**Findings**: When a user joins a team, their user doc gets: `isTeamMember: true`, `teamOwnerUid: <owner UID>`, `teamRole: 'editor'|'viewer'`, `plan: 'none'`, `credits: 0`. Credit resolution happens via `resolveCreditOwner()` which returns the owner's credit pool for team members.

---

## R5: Billing State Mechanism

**Decision**: Extend the existing Firestore user doc listener to expose team state fields.

**Findings**: Billing state is read from the Firestore `users/{uid}` document via a real-time listener in App.tsx. Fields like `billingStatus`, `plan`, `credits` are already synced. Team fields (`isTeamMember`, `teamOwnerUid`, `teamRole`) are already on the user doc but not yet exposed to the frontend as a structured "team state" object.

**Rationale**: No new listener needed — just read and surface the existing fields. For `teamOwnerName` and `teamMemberCount`, a secondary read from the owner's doc or the `team` subcollection count is needed.

---

## R6: Workspace Separation (Scaling Plan)

**Decision**: Defer detailed workspace design to implementation. Core approach: add a `workspaceId` field to generation records and filter by it.

**Findings**: No workspace infrastructure exists. Generations are stored per-user in `users/{uid}/projects`. For workspace separation, generation records would need a `workspaceId` field, and the UI would need a workspace switcher in the nav that sets the active workspace context.

**Rationale**: This is the lowest-priority story (P6). The core data model change (add `workspaceId` to generations) is straightforward. The workspace CRUD (create, rename, delete) can be kept minimal — just a name and ID.
