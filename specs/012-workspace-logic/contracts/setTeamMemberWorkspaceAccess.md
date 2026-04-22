# Callable Contract: `setTeamMemberWorkspaceAccess`

**Caller**: account owner only.
**Related FRs**: FR-017, FR-018, FR-019, FR-020, FR-020a.

## Request

```ts
interface SetTeamMemberWorkspaceAccessRequest {
  memberDocId: string;          // ID of the team doc at users/{ownerUid}/team/{memberDocId}
  workspaceAccess: string[];    // full replacement list of workspace IDs
}
```

This is a full-replace operation. The caller supplies the desired post-state array; the backend computes the diff (added / removed) for audit logging.

## Response

```ts
interface SetTeamMemberWorkspaceAccessResponse {
  ok: true;
  granted: string[];   // workspaceIds newly added
  revoked: string[];   // workspaceIds newly removed
}
```

## Authorization

- Caller MUST be the owner (the `ownerUid` in the team doc path).
- Every workspace ID in `workspaceAccess` MUST reference an active (non-soft-deleted) workspace owned by the caller.
- Target member doc MUST exist under the caller's `team` subcollection.

## Side effects

- Writes new `workspaceAccess` array on `users/{ownerUid}/team/{memberDocId}`.
- For every ID in `granted`: appends one audit entry with `action: 'grant'`.
- For every ID in `revoked`: appends one audit entry with `action: 'revoke'`.
- Audit entries are written in a single batched transaction with the member-doc update so either all writes commit or none do.

## Errors

| Code | Message |
|---|---|
| `unauthenticated` | "Sign in required." |
| `permission-denied: owner_only` | "Only the account owner can change team workspace access." |
| `not-found: team_member_not_found` | "Team member not found." |
| `failed-precondition: invalid_workspace_id` | "One or more workspace IDs are invalid or soft-deleted." |

## Notes

- The audit log captures the `planSnapshot` (owner's plan at the time) so a later downgrade doesn't erase the context of when access was granted.
- If `workspaceAccess` equals the member's current value (no-op), the callable writes no audit entries and responds `{ ok: true, granted: [], revoked: [] }`.
- Revoked access takes effect for the member on their next workspace-scoped callable request (not automatically in their already-open session — their next list/switch/generate call will be refused).
