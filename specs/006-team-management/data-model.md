# Data Model: Team Management

**Date**: 2026-04-03 | **Updated**: 2026-04-10 | **Branch**: `006-team-management`

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
sent → accepted (invitee explicitly clicks Accept on the consent screen)
sent → declined (invitee explicitly clicks Decline on the consent screen — terminal, seat released, does not count toward plan limit)
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
| isTeamMember | boolean | `true` when user is on a team (also surfaced on `billingState` by Phase 8) |
| teamOwnerUid | string \| null | Owner's UID (null if not on team; also surfaced on `billingState` by Phase 8) |
| teamRole | 'editor' \| 'viewer' \| null | Role within team |
| plan | string | Set to 'none' while on team (reverts on removal) |
| credits | number | Set to 0 while on team (uses owner's pool) |
| teamWelcomeToastShown | boolean | Set to `true` atomically by `claimTeamInvite` so the "You've joined [Owner Name]'s team." toast fires exactly once per claim, independent of Phase 8's `createdAt` window |
| pendingRemovalToast | object \| null | Written atomically by `removeTeamMember` as `{ ownerName: '<captured at removal>', shownAt: null }`. Consumed by the post-signin handler on the removed member's next sign-in: it displays the "You've been removed from [Owner Name]'s team." toast and then atomically deletes the field. Owner name is captured at removal time so the message stays stable if the owner later deletes their account. Exactly-once delivery regardless of sign-in count. |
| dormantPlan | object \| null | Snapshot of a prior paid subscription preserved across team membership. Populated atomically by `claimTeamInvite` from one of two sources (checked in order): (1) a `pending_plans/{email.toLowerCase()}` document left by a prior Paddle payment made before the user created a Firebase Auth account, OR (2) the user's existing active paid subscription on `users/{uid}` (`plan !== 'none'` AND `paddleSubscriptionId` set). Contains `plan`, `credits`, `creditsPerMonth`, `paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`, `billingStatus`, `nextResetDate`. Inert while `isTeamMember: true` — it MUST NOT influence credit deduction, plan gating, or the Phase 8 mandatory-billing-modal gate. Restored and cleared atomically by `removeTeamMember` (FR-009) so the removed user lands directly on their own paid subscription without hitting the mandatory billing modal. |

**Membership lookup**: `teamMemberships/{normalizedEmail}` document maps member email → owner UID for reverse lookup (one-team-per-user enforced by document uniqueness).

**Phase 8 / 009 coordination**: The unified `billingState` document introduced in Phase 8 already carries base team-awareness fields (`isTeamMember`, `teamOwnerUid`). Phase 9 extends the same `billingState` shape with additional team-shape fields (`teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`, `isTeamOwner`, `teamOwnerName`, `teamRole`, `isTeamViewer`) — it does NOT introduce a parallel listener and does NOT modify Paddle-specific billing fields (`paddleCustomerId`, `paddleSubscriptionId`, `paddleUpdatePaymentUrl`, `paddleCancelUrl`), which remain owner-only.

---

### Team (implicit — owner's account)

No dedicated collection. The team is the owner's account + their `team` subcollection.

| Location | Description |
|----------|-------------|
| `users/{ownerUid}` | Owner's user doc (plan, credits, maxTeamMembers) |
| `users/{ownerUid}/team/{memberId}` | Per-member subdoc (name, email, role, uid, status, invitedAt, joinedAt, inviteId) |
| `teamMemberships/{normalizedEmail}` | Reverse lookup: email → ownerUid, role, teamPlan, joinedAt, memberId |
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

### Rate Limits (`rateLimits` collection)

IP-based rate limiting for `getInviteDetails` endpoint.

| Field | Type | Description |
|-------|------|-------------|
| count | number | Request count in this minute window |
| ip | string | Caller's IP address |
| minute | string | ISO minute key (YYYY-MM-DDTHH:MM) |

**Storage**: `rateLimits/{ip}_{minuteKey}`. 10 requests per minute per IP. Non-blocking write (request proceeds if write fails).

---

### GetInviteDetails Response (endpoint)

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
