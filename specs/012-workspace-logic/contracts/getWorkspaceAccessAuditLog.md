# Callable Contract: `getWorkspaceAccessAuditLog`

**Caller**: account owner only.
**Related FRs**: FR-020b.

## Request

```ts
interface GetWorkspaceAccessAuditLogRequest {
  limit?: number;              // default 50, max 200
  cursor?: string;             // previous page's last entry id
  filterMemberUid?: string;    // optional: only entries targeting this member
  filterWorkspaceId?: string;  // optional: only entries for this workspace
}
```

## Response

```ts
interface GetWorkspaceAccessAuditLogResponse {
  entries: WorkspaceAccessAuditEntry[];
  nextCursor: string | null;
}
```

## Authorization

- Caller MUST match the `ownerUid` of the audit subcollection path.
- Team members / non-owners → `permission-denied: owner_only`.

## Query behavior

- Base query: `collection('users/{ownerUid}/workspace_access_audit') ORDER BY timestamp DESC LIMIT <limit>`.
- Optional filters applied server-side via `where('targetMemberUid', '==', ...)` / `where('workspaceId', '==', ...)`.

## Errors

| Code | Message |
|---|---|
| `unauthenticated` | "Sign in required." |
| `permission-denied: owner_only` | "Only the account owner can view the access audit log." |

## Notes

- No structured export (CSV/JSON download) in this phase.
- No retention policy this phase — entries are kept indefinitely.
- Intended caller is an owner-only UI panel (minimal listing) — a later phase can add richer filtering and export.
