# Research: Team Management

**Date**: 2026-04-03 | **Updated**: 2026-04-10 | **Branch**: `006-team-management`

## R1: Backend Functions (Complete)

**Decision**: All 8 Cloud Functions are implemented and functional.

**Findings**: All team Cloud Functions exist and are functional:
- `createTeamInvite` — creates invite, sends via GHL webhook, validates seat limits
- `resendTeamInvite` — refreshes expiry to 7 days, retries GHL delivery
- `revokeTeamInvite` — marks invite as revoked
- `claimTeamInvite` — matches caller email to invite, creates team member, sets flags via transaction
- `getTeamInvites` — lists all invites for owner, auto-expires stale on read
- `getInviteDetails` — unauthenticated endpoint for join page, rate-limited (10 req/min/IP)
- `removeTeamMember` — deletes member from subcollection, clears user flags
- `updateTeamMemberRole` — changes member role atomically in 3 locations
- `createTeamMember` — legacy compat wrapper (redirects to createTeamInvite)

**Rationale**: Full backend surface is complete. No new backend functions needed.

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

**Decision**: WorkspaceSwitcher component and `multiBrandWorkspaces` feature flag are implemented. Full workspace-scoped generation history isolation is deferred.

**Findings**: `WorkspaceSwitcher.tsx` renders in the nav for Scaling plan teams. `WorkspaceSettingsModal.tsx` exists. Firestore rules include `users/{uid}/workspaces/{workspaceId}` with team-aware access. However, generation queries are not yet scoped by workspace ID — all generations appear in all workspaces.

**Rationale**: The UI infrastructure is in place. Full isolation requires changes to every generation query across the app (projects, avatars, history). This is a separate scope item to avoid blocking core team management launch.

---

## R7: Role Change Function (Existing)

**Decision**: Use existing `updateTeamMemberRole` Cloud Function. No new backend work needed.

**Findings**: `updateTeamMemberRole` exists at `functions/src/index.ts:2463`. It:
- Accepts `memberId` and `role` ('editor' | 'viewer')
- Updates role atomically in 3 locations via batch write: team subcollection doc, member's user doc, and `teamMemberships` reverse-lookup doc
- Validates auth and role values

**Rationale**: The spec's "role change action" on the Team page can call this function directly. No new backend work required.

---

## R8: Rate Limiting for `getInviteDetails`

**Decision**: Add IP-based rate limiting (10 requests/minute/IP) to the `getInviteDetails` endpoint.

**Findings**: No rate limiting currently exists in the Cloud Functions codebase. No Firebase App Check, no custom middleware, no throttling libraries. All functions use basic auth checks only.

**Approach**: Since `getInviteDetails` is the only unauthenticated endpoint, implement rate limiting within the function itself using a Firestore-based counter keyed by IP address (from `request.rawRequest.ip`). Check count before processing; reject with `resource-exhausted` if over 10/min.

**Alternatives rejected**: Firebase App Check — requires client-side SDK integration and doesn't work for unauthenticated new users who haven't loaded the app yet. External rate limiting service — over-engineered for a single endpoint.

---

## R9: Email Mismatch on Join Page

**Decision**: Frontend-only check. Show friendly message when logged-in user's email doesn't match the invite.

**Findings**: `claimTeamInvite` already enforces email matching server-side (line 2163 in index.ts): `inviteData.inviteeEmailNormalized !== callerEmail` returns `{ success: false, message: 'This invite is for a different email address.' }`. The frontend should detect the mismatch *before* attempting the claim and show: "This invite was sent to [email]. Log in with that email to accept."

**Rationale**: The server-side check is the security boundary. The frontend check is a UX improvement to avoid a confusing failed claim attempt.

---

## R10: Viewer Gating Implementation (Updated 2026-04-10)

**Decision**: Dual-layer enforcement — client toast + server rejection. No visual button disabling.

**Findings**: The current implementation blocks viewer actions via `deductCredits()` in App.tsx (returns `false` + shows toast: "Viewers cannot perform this action"). Server-side, `resolveCreditOwner()` in `entitlements.ts` throws `permission-denied` for viewers. Generation buttons are NOT visually disabled or styled differently for viewers.

**Rationale**: Toast-on-click is more accessible than tooltip-on-hover (works on touch devices). Server enforcement is the security boundary. Visual button disabling could be added as a UX enhancement but is not required for correctness.

**Alternatives considered**: Tooltip on hover (spec originally said this) → Current toast-on-click approach is simpler and covers mobile.

---

## R11: Firestore Security Rules for Team Access (Updated 2026-04-10)

**Decision**: Denormalized `isTeamMember` + `teamOwnerUid` fields on user document enable Firestore security rules to grant cross-user access.

**Findings**: Rules check `resource.data.isTeamMember == true && resource.data.teamOwnerUid == userId` to allow team members to read owner's subcollections (projects, avatars, workspaces). `teamMemberships/{email}` is email-gated for reverse lookup. `users/{uid}/team/{memberId}` is owner-read-only, Cloud-Functions-write-only.

**Rationale**: Firestore rules cannot perform cross-document lookups. Denormalization is the standard pattern. Custom Claims were rejected due to 1-hour token cache staleness.
