# Callable Contract: `deleteWorkspace`

**Caller**: account owner only.
**Related FRs**: FR-005, FR-006, FR-006a.

## Request

```ts
interface DeleteWorkspaceRequest {
  workspaceId: string;
}
```

## Response

```ts
interface DeleteWorkspaceResponse {
  ok: true;
  pendingReassign: boolean; // true while background cascade runs
}
```

## Authorization

- Caller MUST be the owner.
- Target workspace MUST be active (`deletedAt == null`).
- Target workspace MUST NOT have `isDefault === true`.

## Side effects (synchronous)

- Sets `deletedAt = Date.now()` (epoch ms, since retention arithmetic is done in JS), `pendingReassign = true` on the workspace doc.
- Emits a user-facing UI signal (workspace disappears from switcher on next fetch).

## Side effects (asynchronous, via Firestore trigger on `deletedAt` write)

- Paginated reassign of `generations where workspaceId == target` → sets `workspaceId = defaultId`, `reassignedFromWorkspaceId = target`.
- Paginated reassign of `users/{uid}/projects where workspaceId == target` → same.
- For each team member doc whose `workspaceAccess` contained the target: moves the ID to a new sidecar `removedWorkspaceAccessByDelete` array and removes from `workspaceAccess`.
- On completion, clears `pendingReassign = false`.

## Errors

| Code | Message |
|---|---|
| `unauthenticated` | "Sign in required." |
| `permission-denied: owner_only` | "Only the account owner can delete workspaces." |
| `failed-precondition: default_workspace_undeletable` | "The default workspace can't be deleted." |
| `not-found: workspace_not_found` | "Workspace not found or already deleted." |

## Notes

- Deletion is **soft**. The workspace enters a 30-day retention window. The scheduled `purgeExpiredWorkspaces` job permanently removes the doc on the 31st day.
- The cascade does NOT delete `workspace_access_audit` entries for the workspace; those are kept per Principle VI.
- If `deletedAt` is already set on the target, respond idempotently with `ok: true, pendingReassign: <current value>`.
