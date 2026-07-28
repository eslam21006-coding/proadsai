# Phase 1 Data Model — 965-team-workspace-access

**No Firestore schema change. No migration.** Every field below already exists. This document records
which fields the feature *reads*, which it deliberately *stops reading*, and the client-side state
introduced to fix the resolution race.

---

## Stored entities (read-only for this feature)

### `users/{uid}` — account document

| Field | Type | Used for |
|---|---|---|
| `isTeamMember` | `boolean` | Determines whether the person acts as a team member. Sole trigger for every withheld control and every server guard. |
| `teamOwnerUid` | `string \| null` | The account whose workspaces are shown. Resolves `effectiveUid`. |
| `teamRole` | `'editor' \| 'viewer'` | Read into `App.tsx` state; **not consulted for workspace behaviour in this feature** — no role may add, remove, or alter a workspace. Reserved for the deferred editing capability. |
| `plan` | `string` | Owner's plan, copied to the member at `App.tsx:1745`, drives `canUseWorkspaces`. |

> **Pre-existing inconsistency, not introduced and not repaired here**: `App.tsx:1745` reads
> `ownerData.plan`, while `useBillingState.ts:73` reads `ownerData.billingState.plan`. Two sources for
> the same fact. Out of scope; flagged so the next person does not read it as new.

### `users/{ownerUid}/workspaces/{workspaceId}` — workspace

| Field | Type | Used for |
|---|---|---|
| `name`, `brandName` | `string` | Picker label and secondary line. |
| `brandColorPrimary` | `string` | Picker dot and active swatch. |
| `isDefault` | `boolean` | Auto-selection (FR-005) and the undeletable-workspace rule. |
| `deletedAt` | `number \| null` | `null` means active. Filtered out for members (FR-002) and enforced in stored rules (`firestore.rules:47`). |
| `createdAt` | `number` | List ordering (`desc`). |

Read path for a team member: `users/{teamOwnerUid}/workspaces`, permitted by `firestore.rules:41-48`
without modification.

### `users/{ownerUid}/team/{memberDocId}` — membership

| Field | Type | Used for |
|---|---|---|
| `uid` | `string` | **The access boundary.** A member doc whose `uid` matches the caller proves membership. Retained and still enforced. |
| `role` | `'editor' \| 'viewer'` | Unused for workspace decisions in this feature. |
| `workspaceAccess` | `string[]` | **Deliberately no longer read for access decisions** (FR-004a). Retained unread (FR-021). Still maintained by `workspacePurge.ts:162-234` on workspace delete/restore, and still writable via the `setTeamMemberWorkspaceAccess` callable, which stays deployed but loses its only caller. |

Not readable by the member themselves — `firestore.rules:127-130` is owner-read only. This is why
access resolution has to happen on the server, and why the original "let the frontend read its own
access list" approach was abandoned.

---

## Access resolution — the state change at the heart of the feature

`resolveCallerScope(callerUid) → { ownerUid, allowedWorkspaceIds }`

| Caller | Before | After |
|---|---|---|
| Account owner | `ownerUid = self`, ids of own active workspaces, or `"ALL"` when none | unchanged |
| Verified team member | `memberData.workspaceAccess ?? []` — **`[]` for every new member** | `"ALL"` |
| `isTeamMember` set but no member doc under the owner | `[]` | `[]` — unchanged; membership unproven, access denied |
| Firestore read failure | `"ALL"` scoped to self (`ownerUid = callerUid`) | unchanged |

The third row is the security boundary and is deliberately untouched: a stale `isTeamMember` flag with
no corresponding member doc grants nothing.

---

## Client-side state (React, `src/App.tsx`)

| State | Type | Purpose |
|---|---|---|
| `teamResolution` | `'pending' \| 'resolved'` | **New.** Set to `'resolved'` once the auth handler has determined membership either way. Replaces the ref-in-dependency-array pattern that causes the defect. Effects return early while `'pending'`. |
| `workspaceReady` | `boolean` (derived) | **New.** `teamResolution === 'resolved' && (!canUseWorkspaces \|\| activeWorkspaceId != null)`. Gates every write into a workspace (FR-007a). |
| `workspaceLoadError` | `boolean` | **New.** Distinguishes "could not load" from "account has no workspace yet" (FR-019). |
| `effectiveUid` | `string \| null` | Existing (`:2218`). Promoted from ref-read to the dependency of record for workspace, avatar, and project effects. |
| `teamOwnerUid`, `teamRole`, `removedFromTeam` | existing | Unchanged in meaning. `removedFromTeam` already drives the overlay at `:11261`. |

### `teamResolution` lifecycle

```text
sign-in begins            → 'pending'   (workspace/avatar effects idle; writes withheld)
auth handler completes    → 'resolved'  (member: effectiveUid = teamOwnerUid; owner: = own uid)
sign-out / user change    → 'pending'
membership ends           → 'resolved'  with teamOwnerUid = null → listener torn down
```

The transition to `'resolved'` must happen on **both** branches of `App.tsx:1737` — the team-member
branch and the plain-user branch — or non-team users would hang behind the write gate forever. This is
the single highest-risk detail in the change.

---

## What is written

Nothing new. The feature adds no field and no document. The only write-path corrections:

| Location | Today | After |
|---|---|---|
| `App.tsx:2377-2391` | Creates a workspace when the list is empty — under the member's own account | Removed for team members entirely (FR-013) |
| `App.tsx:5519` | `users/${user.uid}/workspaces/${activeWorkspaceId}/imageFingerprints` | `users/${effectiveUid}/...` — today's path combines the member's account with the owner's workspace id and cannot satisfy `isWorkspaceMember` |
