# Data Model: Team Management

**Date**: 2026-04-03 | **Branch**: `006-team-management`

## Entities

### Team Invite (existing — `team_invites` collection)

No schema changes. Documenting existing fields for reference.

| Field | Type | Description |
|-------|------|-------------|
| inviteId | string | Unique invite identifier |
| ownerId | string | Team owner's user ID |
| ownerEmail | string | Team owner's email |
| ownerName | string | Team owner's display name |
| inviteeEmail | string | Invitee's email address |
| inviteeEmailNormalized | string | Lowercase normalized email for matching |
| inviteeName | string | Invitee's display name |
| role | 'editor' \| 'viewer' | Assigned role (default: 'editor'). UI shows "Member" for editor. |
| teamPlan | string | Owner's plan at time of invite |
| status | string | 'pending' \| 'sent' \| 'failed' \| 'accepted' \| 'revoked' \| 'expired' |
| createdAt | number | Creation time (epoch ms) |
| updatedAt | number | Last update time (epoch ms) |
| sentAt | number \| null | When email was sent (epoch ms) |
| acceptedAt | number \| null | When invite was claimed (epoch ms) |
| revokedAt | number \| null | When invite was revoked (epoch ms) |
| expiresAt | number | 7 days from creation (epoch ms). Reset on resend. |
| claimedByUserId | string \| null | UID of user who claimed |
| deliveryAttemptCount | number | GHL delivery attempt count |

**Storage**: Documents keyed by generated invite ID in root `team_invites` collection. Reverse lookup via `teamMemberships/{normalizedEmail}`.

**Status transitions**:
```text
pending → sent (GHL delivery succeeds)
pending → failed (GHL delivery fails)
sent → accepted (invitee claims)
sent → revoked (owner revokes)
sent → expired (expiresAt passed)
failed → sent (resend succeeds)
```

Note: `resendTeamInvite` creates a NEW invite document rather than transitioning an expired invite. Expired invites remain expired.

---

### Team Member (existing — user document fields)

No new collection. Team membership is stored as fields on the `users/{uid}` document.

| Field | Type | Description |
|-------|------|-------------|
| isTeamMember | boolean | `true` when user is on a team |
| teamOwnerUid | string \| null | Owner's UID (null if not on team) |
| teamRole | 'editor' \| 'viewer' \| null | Role within team |
| plan | string | Set to 'none' while on team (reverts on removal) |
| credits | number | Set to 0 while on team (uses owner's pool) |

**Membership lookup**: `teamMemberships/{uid}` document maps member UID → owner UID for reverse lookup.

---

### Team (implicit — owner's account)

No dedicated collection. The team is the owner's account + their `team` subcollection.

| Location | Description |
|----------|-------------|
| `users/{ownerUid}` | Owner's user doc (plan, credits, maxTeamMembers) |
| `users/{ownerUid}/team/{memberUid}` | Per-member subdoc (name, email, role, joinedAt) |
| `team_invites` (filtered by ownerId) | All invites for this team |

---

### Workspace (new — Scaling plan only)

| Field | Type | Description |
|-------|------|-------------|
| workspaceId | string | Unique workspace identifier |
| teamOwnerUid | string | Owner of the team this workspace belongs to |
| name | string | Display name (e.g., "Client A", "Client B") |
| createdAt | timestamp | Creation time |

**Storage**: `users/{ownerUid}/workspaces/{workspaceId}`. Generation records gain a `workspaceId` field to filter by workspace.

---

### GetInviteDetails Response (new endpoint)

Unauthenticated endpoint return shape. No sensitive data exposed.

| Field | Type | Description |
|-------|------|-------------|
| ownerName | string | Team owner's display name |
| inviteeEmail | string | Invitee's email (already known to them) |
| teamPlan | string | Owner's plan name |
| status | string | 'pending' \| 'sent' \| 'accepted' \| 'revoked' \| 'expired' |
| expiresAt | timestamp | Invite expiry time |
| inviteeName | string | Invitee's name from the invite |
| role | string | Assigned role |

**Not exposed**: ownerId, ownerEmail, claimedByUserId, delivery details.
