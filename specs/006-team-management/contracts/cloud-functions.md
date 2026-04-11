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
| inviteId | string | No | Invite ID (optional — can also match by caller email) |

### Response

```ts
{ success: true; claimed: number; message?: string }
// or
{ success: false; claimed: number; message: string }
```

### Behavior
- Caller's email must match `inviteeEmailNormalized`
- Uses Firestore transaction (prevents race conditions on same invite)
- Creates: team member doc, teamMemberships reverse-lookup, sets user flags
- Sets member's `plan: 'none'`, `credits: 0` (uses owner's pool)
- Marks invite `status: 'accepted'`
- Auto-revokes pending invites from other owners (one-team-per-user)

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
