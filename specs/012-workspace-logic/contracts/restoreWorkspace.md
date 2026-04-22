# Callable Contract: `restoreWorkspace`

**Caller**: account owner only. (Support-operator path: a separate admin tool can call this on the owner's behalf using an internal service account — out of scope for this phase. This phase ships the owner-callable surface so support can guide an owner through it if needed.)

**Related FRs**: FR-006a, FR-006b.

## Request

```ts
interface RestoreWorkspaceRequest {
  workspaceId: string;
}
```

## Response

```ts
interface RestoreWorkspaceResponse {
  ok: true;
  pendingRestore: boolean;
}
```

## Authorization

- Caller MUST be the owner.
- Target workspace MUST exist (not yet purged).
- Target workspace MUST have `deletedAt` set AND `now - deletedAt < 30 days`.

## Side effects (synchronous)

- Clears `deletedAt = null`, sets `pendingRestore = true`.

## Side effects (asynchronous, Firestore trigger on `deletedAt` clear)

- Queries `generations where reassignedFromWorkspaceId == target` (paginated, batches of 400) → sets `workspaceId = target`, clears `reassignedFromWorkspaceId`.
- Queries `users/{ownerUid}/projects where reassignedFromWorkspaceId == target` → same.
- For every team member doc with `removedWorkspaceAccessByDelete` containing the target: moves the ID back to `workspaceAccess` and removes from the sidecar.
- On completion, clears `pendingRestore = false`.

## Errors

| Code | Message |
|---|---|
| `unauthenticated` | "Sign in required." |
| `permission-denied: owner_only` | "Only the account owner can restore a workspace." |
| `failed-precondition: workspace_purged` | "This workspace was deleted more than 30 days ago and cannot be restored." |
| `failed-precondition: workspace_not_deleted` | "This workspace is not deleted and does not need restoration." |
| `not-found: workspace_not_found` | "Workspace not found." |

## Notes

- The 30-day window is calculated against server time, not client time.
- Restore does NOT re-probe the Meta role of the linked ad account. The stored `metaAdAccountId` is preserved as-is; if the role has since become insufficient, the next publish attempt detects it (per spec edge case).
