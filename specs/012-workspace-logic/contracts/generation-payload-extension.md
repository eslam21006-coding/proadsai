# Generation Callables — Payload & Record Extension

**Affected callables**: `generateHooks`, `generateConcepts`, `generateImage`, `generateCaption`, `generateCarouselSlides`, `generateBatch`.
**Related FRs**: FR-011, FR-012, FR-013, FR-024.

This is NOT a new callable — it's an additive change to the request shape and the record shape of existing generation callables.

## Request — new field

Every generation callable MUST accept:

```ts
interface GenerationRequestExtension {
  activeWorkspaceId: string;  // REQUIRED — the workspace the user had active at submit
}
```

Existing fields are unchanged. If `activeWorkspaceId` is missing, the callable throws `invalid-argument: active_workspace_required`. Clients must supply the current Zustand `activeWorkspaceId`.

## Record shape — field write

Every generation callable MUST write to the `generations/{genId}` record:

```ts
{
  ...existingFields,
  workspaceId: <request.activeWorkspaceId>,
  // reassignedFromWorkspaceId: absent at create time; only set by delete cascade
}
```

## Authorization

- Caller's access to `activeWorkspaceId` is verified using the same rule as `getWorkspaceGenerations`:
  - caller is owner of the workspace, OR
  - caller is a team member whose `workspaceAccess[]` includes the workspace ID.
- Workspace MUST be active (not soft-deleted). If soft-deleted → `failed-precondition: workspace_soft_deleted`.

## Meta push targeting

When a generation callable ultimately publishes to Meta (or returns the payload that a subsequent `pushToMeta` call will use):

1. Read the workspace's `metaAdAccountId`.
2. If present, re-probe the caller's Meta role via `GET /{adAccountId}?fields=user_role`.
3. If role is `ADMIN` or `ADVERTISER` → target that ad account.
4. If role is insufficient → throw `failed-precondition: insufficient_meta_role` with a user-facing message routing them to Meta Business Manager (edge case: post-link role downgrade).
5. If `metaAdAccountId` absent → fall back to the user-level default ad account (pre-Phase-12 behavior).

## Errors (new / shared)

| Code | Message |
|---|---|
| `invalid-argument: active_workspace_required` | "Active workspace is required for this generation." |
| `failed-precondition: workspace_soft_deleted` | "The selected workspace has been deleted. Please switch to another workspace." |
| `permission-denied: workspace_access_denied` | "You don't have access to the selected workspace." |
| `failed-precondition: insufficient_meta_role` | (as in link contract) |

## Notes

- The field `activeWorkspaceId` becomes **required** in this phase; pre-Phase-12 clients that omit it MUST be updated. Because the frontend and backend ship in lockstep, there is no backwards-compatibility path — the spec's backfill rule handles historical records, not in-flight ones.
- Resolution trace (Principle VI) MUST include a `workspaceId` field and, when the workspace has a linked Meta ad account, the `metaAdAccountId` used.
