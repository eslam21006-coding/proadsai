# Data Model: Workspace Logic (Scale Mode)

**Feature**: 012-workspace-logic
**Date**: 2026-04-21
**Source of truth for types**: `src/types.ts` (frontend) + `functions/src/types.ts` (backend; mirror)

Every entity below is either **new**, **extended**, or **unchanged-but-policy-updated**. Fields new to this phase are marked 🆕.

---

## 1. Workspace (extended)

**Firestore path**: `users/{ownerUid}/workspaces/{workspaceId}`
**Mirror type**: `interface Workspace` in `src/types.ts` (and Cloud Function mirror).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Firestore doc ID; immutable. |
| `name` | string | yes | Display name, 1–60 chars, trimmed. |
| `brandName` | string | yes | 1–60 chars, trimmed. |
| `brandUrl` | string | no | Optional brand site URL. |
| `brandColorPrimary` | string | no | `#RRGGBB` hex; validated. |
| `brandColorSecondary` | string | no | `#RRGGBB` hex; validated. |
| `logoUrl` | string | no | Firebase Storage URL to the logo. |
| `createdAt` | number (ms since epoch) | yes | Set at create; immutable. |
| `isDefault` | boolean | yes | Exactly one workspace per account has `true`; immutable after account setup. |
| `metaAdAccountId` 🆕 | string | no | Linked Meta ad account ID (`act_...`). Presence implies the workspace has its own Meta push target. |
| `metaAdAccountName` 🆕 | string | no | Display name snapshot at link time. |
| `metaRoleAtLinkTime` 🆕 | string | no | One of `ADMIN \| ADVERTISER`. Set by `linkMetaAccountToWorkspace`. Informational only — publish flow re-probes. |
| `deletedAt` 🆕 | number (ms) \| null | no | `null` or absent for active. Set by `deleteWorkspace`. Cleared by `restoreWorkspace`. 30 days after this value, record is purged. |
| `pendingReassign` 🆕 | boolean | no | `true` while the background handler moves orphan records to default. UI treats as "being deleted." |
| `pendingRestore` 🆕 | boolean | no | `true` while the background handler reverts reassigned records. UI treats as "being restored." |

**Validation rules**:
- `name` and `brandName` MUST be non-empty after trim.
- Brand color fields MUST match `/^#[0-9a-fA-F]{6}$/` if present.
- `isDefault === true` for exactly one workspace per account, set at account setup and never mutated thereafter.
- `metaAdAccountId` MUST be present in the owner's connected Meta ad accounts AND the owner's role on it MUST be `ADMIN` or `ADVERTISER` at link time (verified by R1). Cannot be validated on update to a null/missing value (unlink).
- `deletedAt` MUST be either unset or a positive timestamp ≤ now.

**Read-path rule** (enforced in every read path — callables, security rules, frontend filters):
- Active workspaces: `where('deletedAt', '==', null)` OR `deletedAt` field absent.
- Soft-deleted workspaces are invisible to every user EXCEPT the `restoreWorkspace` code path.
- After 30 days past `deletedAt`, the document is purged by the scheduled job.

**State transitions**:

```text
           ┌──────────────┐
           │    active    │  (created)
           └──────┬───────┘
                  │ deleteWorkspace (non-default only)
                  ▼
           ┌──────────────┐
           │ soft-deleted │  (deletedAt set; hidden from all reads)
           └──┬───────┬───┘
              │       │
 restoreWorkspace   30d elapse
      (< 30d)       (scheduled purge)
              │       │
              ▼       ▼
           ┌──────────────┐   ┌──────────────┐
           │    active    │   │    purged    │  (doc hard-deleted; no restore)
           └──────────────┘   └──────────────┘
```

Invariants:
- `isDefault === true` → transitions are forbidden (enforced by `deleteWorkspace`).
- `pendingReassign === true` AND `pendingRestore === true` simultaneously is forbidden (mutex).

---

## 2. Generation (extended)

**Firestore path**: `generations/{genId}`
**Mirror type**: `GenerationRecord` in existing `src/types.ts`.

Changes this phase:

| Field | Type | Change | Notes |
|---|---|---|---|
| `workspaceId` | string \| null | **now written on every new generation** (was previously optional + often undefined) | Source: `activeWorkspaceId` from the callable payload. |
| `reassignedFromWorkspaceId` 🆕 | string \| null | added | Set when a cascade-delete moves the record to default; used by restore to revert. Cleared on restore. |

Backfill rule (spec FR-015): records predating Phase 12 with missing `workspaceId` are treated as belonging to the default workspace in read-path queries — no batch backfill job.

**Validation** (on callable write):
- `workspaceId` MUST reference an `active` workspace owned by the caller (or by the caller's team owner if caller is a team member).
- If the referenced workspace has `deletedAt` set (soft-deleted), the generation callable MUST reject with `failed-precondition: workspace_soft_deleted` — clients should re-fetch the active workspace.

---

## 3. SavedProject (extended by policy, not schema)

**Firestore path**: `users/{uid}/projects/{projectId}`
**Mirror type**: `SavedProject` in `src/types.ts`.

No field additions. The existing `workspaceId?: string` field already exists.

**Delete-cascade policy** (new): when a workspace is soft-deleted, the delete handler also writes `reassignedFromWorkspaceId = <deleted workspace id>` and `workspaceId = <default workspace id>` on every matching saved project. Restore reverses this.

---

## 4. TeamMember doc (extended)

**Firestore path**: `users/{ownerUid}/team/{memberDocId}` (existing per Phase 6).
**Mirror shape** (keys only; typed loosely in existing code):

| Field | Type | Status | Notes |
|---|---|---|---|
| `memberUid` | string | existing | The team member's user ID. |
| `memberEmail` | string | existing | Normalized to lowercase. |
| `addedAt` | number | existing | |
| `role` | string | existing | Current roles from Phase 6. |
| `workspaceAccess` 🆕 | string[] | **new** | Array of workspace IDs this member can access. Empty array = no access. Owner implicitly has access to all (not represented here). |

**Validation rules**:
- `workspaceAccess` array MUST contain only IDs of the owner's active (non-soft-deleted) workspaces. When the owner deletes a workspace, the background reassign handler ALSO removes that workspace ID from every team member's `workspaceAccess`. Restore re-adds it (tracked via a `removedWorkspaceAccessByDelete: string[]` sidecar on the member doc — see R4 extension).

> **Refinement from R4**: To make restore lossless for team access, the delete handler adds a sidecar `removedWorkspaceAccessByDelete: string[]` on each team member doc whose `workspaceAccess` previously contained the deleted workspace ID. Restore inspects this sidecar, re-adds the workspace ID to `workspaceAccess`, and removes it from the sidecar.

---

## 5. WorkspaceAccessAuditEntry (new)

**Firestore path**: `users/{ownerUid}/workspace_access_audit/{entryId}`
**Entry ID format**: `{timestampMs}_{6charRandom}` (ensures time-sorted IDs under moderate clock skew).
**Mirror type**:

```ts
interface WorkspaceAccessAuditEntry {
  id: string;                 // doc ID, matches path segment
  actorUid: string;           // who performed the action (owner)
  targetMemberUid: string;    // whose access changed
  targetMemberEmail: string;  // snapshot for readability
  workspaceId: string;        // workspace involved
  workspaceNameAtEvent: string; // snapshot at event time
  action: 'grant' | 'revoke';
  timestamp: number;          // server-assigned ms since epoch
  planSnapshot: 'none' | 'starter' | 'pro' | 'scale';
}
```

**Write path**: only via `setTeamMemberWorkspaceAccess` callable (admin context); Firestore rules deny client SDK writes.

**Read path**: owner-only, via `getWorkspaceAccessAuditLog` callable OR a security-rule-governed direct read at `users/{ownerUid}/workspace_access_audit/**`. Team members and non-owners denied.

**Mutation**: immutable. No update; no delete. (Rules enforce this for every request, including the owner's.)

**Cardinality**: ≤ a few hundred per year per agency-scale account. No pagination in callable v1 beyond the usual `limit + cursor`.

---

## 6. PlanGate (logical — no persistence)

Not a stored entity. Derived from `billingState.plan` per `functions/src/billing/billingState.ts` at every workspace CRUD call.

| Plan | Workspace cap | Can link Meta ad account to workspace? | Can grant team workspace access? |
|---|---:|---|---|
| `none` | 1 (default) | no | no |
| `starter` | 1 (default) | no | no |
| `pro` | 1 (default) | yes (single account binding) | n/a (Phase 9 Team is Scale-only? verify at plan check) |
| `scale` | 10 | yes | yes |

> **Alignment note**: Confirm with `src/planconfig.ts` (`savedProjectLimit`, `audienceAvatarLimit`, etc.) that no conflicting workspace cap exists; if so, `planconfig.ts` gains a `workspaceLimit` field in this phase. Spec Assumptions explicitly reference the hotfix-09.50 plan union.

**Downgrade grace rule** (per spec Assumption): a Scale→Pro downgrade does NOT delete workspaces. The cap check only fires on `createWorkspace`, not as a retroactive audit. Existing workspaces remain accessible and editable.

---

## 7. Firestore composite indexes (additions)

Added to `firestore.indexes.json`:

```json
{
  "collectionGroup": "generations",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "workspaceId", "order": "ASCENDING" },
    { "fieldPath": "timestamp", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "generations",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "reassignedFromWorkspaceId", "order": "ASCENDING" },
    { "fieldPath": "timestamp", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "workspaces",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "deletedAt", "order": "ASCENDING" }
  ]
}
```

Rationale: first index serves the primary generation list. Second serves the restore-cascade revert query. Third serves the scheduled `purgeExpiredWorkspaces` query (collectionGroup lets one query span every tenant).

---

## 8. Firestore security rules (delta)

```text
match /users/{ownerUid}/workspaces/{workspaceId} {
  allow read: if
    request.auth.uid == ownerUid
    || exists(/databases/$(database)/documents/users/$(ownerUid)/team/$(request.auth.uid))
       && resource.data.deletedAt == null
       && workspaceId in get(/databases/$(database)/documents/users/$(ownerUid)/team/$(request.auth.uid)).data.workspaceAccess;
  allow write: if false;  // only via callables
}

match /users/{ownerUid}/workspace_access_audit/{entryId} {
  allow read: if request.auth.uid == ownerUid;
  allow write: if false; // only via callables (admin context)
}
```

---

## 9. End-to-end field touch map

| User action | Writes to | Reads from |
|---|---|---|
| Create workspace | `users/{uid}/workspaces/{new}` | `users/{uid}/workspaces` (cap check), `billingState.plan` |
| Update workspace fields | `users/{uid}/workspaces/{id}` (partial) | — |
| Delete workspace | `users/{uid}/workspaces/{id}.deletedAt`, then background: `generations[].workspaceId`, `users/{uid}/projects[].workspaceId`, `users/{uid}/team[].workspaceAccess` | same, via paginated queries |
| Restore workspace | `users/{uid}/workspaces/{id}.deletedAt = null`, then background: reverse of above | — |
| Link Meta account | `users/{uid}/workspaces/{id}.{metaAdAccountId, metaAdAccountName, metaRoleAtLinkTime}` | Meta API role probe |
| Unlink Meta account | clear those three fields | — |
| Set team member access | `users/{uid}/team/{memberDoc}.workspaceAccess`, `users/{uid}/workspace_access_audit/{new}` | `users/{uid}/team`, `users/{uid}/workspaces` |
| Generate (any step) | `generations/{new}.workspaceId`, uses `workspace.metaAdAccountId` for push | `users/{uid}/workspaces/{activeId}` |
| List workspace generations | — | `generations` (indexed query) |
| List audit log | — | `users/{uid}/workspace_access_audit` |
