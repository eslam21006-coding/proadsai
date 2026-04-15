# Contracts: Team Management Cloud Functions

**Date**: 2026-04-10 | **Branch**: `006-team-management`

All functions are Firebase Cloud Functions v2 (onCall) located in `functions/src/index.ts`.

---

## 1. createTeamInvite (authenticated)

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Invitee's email address |
| name | string | Yes | Invitee's display name |
| role | 'editor' \| 'viewer' | Yes | Role to assign (no default — must be provided) |

### Response

```ts
{ success: true; inviteId: string; deliverySuccess: boolean; message?: string }
// or
{ success: false; message: string }
```

### Validation
- Caller must be authenticated and not a team member themselves
- Email cannot match caller's own email
- Email cannot already be an active team member
- Email cannot be a member of another team
- Seat count (active members + open invites) must be < plan limit
- Open invite statuses: `pending`, `sent`, `failed`

---

## 2. resendTeamInvite (authenticated)

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| inviteId | string | Yes | ID of existing invite to resend |

### Response

```ts
{ success: boolean; message?: string }
```

### Behavior
- Resets `expiresAt` to 7 days from now
- Retries GHL webhook delivery
- Only owner of the invite can resend

---

## 3. revokeTeamInvite (authenticated)

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| inviteId | string | Yes | ID of invite to revoke |

### Response

```ts
{ success: boolean; message?: string }
```

### Behavior
- Sets status to `revoked`, records `revokedAt`
- Cannot revoke already-accepted invites
- Only owner of the invite can revoke

---

## 4. getInviteDetails (unauthenticated)

See [get-invite-details.md](get-invite-details.md) for full contract.

### Summary
- Rate-limited: 10 req/min/IP via Firestore counter
- Returns limited invite metadata: `ownerName`, `inviteeEmail`, `inviteeName`, `teamPlan`, `role`, `status`, `expiresAt`
- `inviteeEmail` is included because the invitee needs to confirm they're claiming with the correct account; no other user PII is exposed (ownerId, ownerEmail, claimedByUserId are excluded)
- Returns status codes for invalid invites (expired/revoked/accepted/not_found)

---

## 5. claimTeamInvite (authenticated)

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| inviteId | string | Yes | Invite ID. Silent email-based matching is NOT permitted — every claim requires an explicit inviteId supplied by the Accept button on the consent screen. |

### Response

```ts
{ success: true; claimed: number; message?: string }
// or
{ success: false; claimed: number; message: string }
```

### Behavior
- Caller's email must match `inviteeEmailNormalized` (server-side verification)
- Caller must be email-verified (Phase 8 email-only auth gate — unverified callers are rejected)
- Uses Firestore transaction (prevents race conditions on same invite)
- Creates: team member doc, teamMemberships reverse-lookup, sets user flags
- **Dormant plan capture (FR-017)**: Within the same transaction, if `pending_plans/{email.toLowerCase()}` exists, snapshot its fields into `users/{uid}.dormantPlan` and delete the pending document. Else if the user document already has an active paid subscription (`plan !== 'none'` AND `paddleSubscriptionId` set), snapshot the user doc's plan, credits, creditsPerMonth, paddleCustomerId, paddleSubscriptionId, paddleUpdatePaymentUrl, paddleCancelUrl, billingStatus, and nextResetDate into `dormantPlan`. Otherwise leave `dormantPlan` null.
- Sets member's `plan: 'none'`, `credits: 0` (uses owner's pool)
- Atomically sets `users/{uid}.teamWelcomeToastShown: true` so the "You've joined [Owner Name]'s team." toast fires exactly once
- Marks invite `status: 'accepted'`
- Auto-revokes pending invites from other owners (one-team-per-user)
- MUST NOT be called by the post-signin handler silently — the handler only routes to `/join?inviteId=<match>`, and `claimTeamInvite` is invoked exclusively when the user clicks Accept on the consent screen

---

## 5a. declineTeamInvite (authenticated) — new in Session 2026-04-15 (second pass)

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| inviteId | string | Yes | Invite ID to decline |

### Response

```ts
{ success: true }
// or
{ success: false; message: string }
```

### Behavior
- Caller's email must match `inviteeEmailNormalized` (server-side verification)
- Transitions `team_invites/{inviteId}.status` from `'sent'` (or `'pending'`) to `'declined'` (terminal state)
- Sets `declinedAt` timestamp
- Releases the seat: `declined` invites do NOT count toward the owner's plan limit, so the owner can immediately re-invite the same or a different email
- Invoked when the user clicks Decline on the `/join?inviteId=X` consent screen
- After decline, the user enters their normal post-signin state (own paid plan or the Phase 8 mandatory billing modal)

---

## 6. getTeamInvites (authenticated)

### Request

No parameters (uses caller's UID as owner filter).

### Response

```ts
{ invites: TeamInviteRow[] }
```

### Behavior
- Returns all invites for the calling owner
- Auto-expires stale invites on read (lazy expiry)
- Only callable by team owners

---

## 7. removeTeamMember (authenticated)

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| memberId | string | Yes | Document ID from `users/{ownerUid}/team/{memberId}` |

### Response

```ts
{ success: boolean; message?: string }
```

### Behavior
- Deletes team member doc from owner's subcollection
- Deletes `teamMemberships/{email}` reverse-lookup
- Clears user flags: `isTeamMember`, `teamOwnerUid`, `teamRole`
- Only the team owner can remove members
- **Dormant plan restore (FR-009, FR-017)**: Within the same transaction, if `users/{uid}.dormantPlan` is present, atomically restore those fields as the active billing state (plan, credits, paddleCustomerId, paddleSubscriptionId, paddleUpdatePaymentUrl, paddleCancelUrl, billingStatus, nextResetDate) and clear the `dormantPlan` field. The removed member lands directly on their own paid subscription without hitting the mandatory billing modal. If `dormantPlan` is absent, revert `plan` to `'none'` and `credits` to `0`.
- **Removal toast (FR-009)**: In every removal path (dormantPlan present or not), the transaction atomically writes `users/{uid}.pendingRemovalToast = { ownerName: '<owner's display name captured now>', shownAt: null }`. The post-signin handler on the removed member's next sign-in reads this field, displays the "You've been removed from [Owner Name]'s team." toast, and atomically deletes the field (exactly-once delivery). Owner name is captured at removal time so the message stays stable if the owner later deletes their account.

---

## 8. updateTeamMemberRole (authenticated)

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| memberId | string | Yes | Document ID from `users/{ownerUid}/team/{memberId}` |
| role | 'editor' \| 'viewer' | Yes | New role to assign |

### Response

```ts
{ success: boolean; message?: string }
```

### Behavior
- Validates role is 'editor' or 'viewer'
- Atomic batch write to 3 locations:
  1. `users/{ownerUid}/team/{memberId}` — role field
  2. `users/{memberUid}` — teamRole field
  3. `teamMemberships/{email}` — role field
- Only the team owner can change roles

---

## Frontend Service Layer

All functions are wrapped in `src/services/teamService.ts` with typed interfaces:

```ts
export interface InviteDetailsResult {
  success: boolean;
  status?: string;
  message?: string;
  ownerName?: string;
  inviteeEmail?: string;
  inviteeName?: string;
  teamPlan?: string;
  role?: string;
  expiresAt?: number;
}

export interface CreateInviteResult {
  success: boolean;
  inviteId?: string;
  deliverySuccess?: boolean;
  message?: string;
}

export interface ClaimInviteResult {
  success: boolean;
  claimed?: number;
  message?: string;
}
```
