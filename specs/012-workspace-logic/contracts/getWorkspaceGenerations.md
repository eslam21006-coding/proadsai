# Callable Contract: `getWorkspaceGenerations`

**Caller**: account owner OR team member with access to the queried workspace.
**Related FRs**: FR-013, FR-014, FR-015, FR-016, FR-025.

## Request

```ts
interface GetWorkspaceGenerationsRequest {
  workspaceId: string;
  limit?: number;                             // default 20, max 50
  cursor?: { timestamp: number; id: string }; // composite cursor (timestamp DESC, __name__ DESC)
}
```

## Response

```ts
interface GetWorkspaceGenerationsResponse {
  items: GenerationSummary[];
  nextCursor: { timestamp: number; id: string } | null;
}

interface GenerationSummary {
  id: string;
  workspaceId: string | null;
  userId: string;
  timestamp: number;
  kind: 'hooks' | 'concepts' | 'image' | 'caption' | 'carousel' | 'batch';
  summary: string;
  // ... minimal fields needed by the list UI; full record fetched on detail click
}
```

## Authorization

Resolved in this precedence order:

1. If `callerUid === ownerUid(workspaceId)` → allow.
2. Else if a `users/{ownerUid}/team/{memberDoc}` exists with `memberUid === callerUid` AND `workspaceAccess[]` contains `workspaceId` → allow.
3. Else → `permission-denied: workspace_access_denied`.

Workspace MUST be active. Soft-deleted workspaces are treated as non-existent for this callable.

## Query behavior

- Primary query: `where('userId', '==', ownerUid) AND where('workspaceId', '==', workspaceId) ORDER BY timestamp DESC, __name__ DESC LIMIT <limit>`.
- When `workspaceId === defaultWorkspaceId`, a second query `where('userId', '==', ownerUid) AND where('workspaceId', '==', null)` is merged client-side in the callable (per FR-015 — legacy records surface under the default) using the same ordering and startAfter semantics so merged results are deterministic.
- Pagination uses `startAfter(cursor.timestamp, cursor.id)` — the secondary sort on document id guarantees stable paging when rows share a timestamp.

## Errors

| Code | Message |
|---|---|
| `unauthenticated` | "Sign in required." |
| `permission-denied: workspace_access_denied` | "You don't have access to this workspace." |
| `not-found: workspace_not_found` | "Workspace not found." |

## Notes

- The response payload is a summary, not full generation records, to keep per-page payload under ~500KB.
- Composite index on `(userId ASC, workspaceId ASC, timestamp DESC)` is required; added in `firestore.indexes.json`.
