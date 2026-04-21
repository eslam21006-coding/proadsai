# Callable Contract: `unlinkMetaAccountFromWorkspace`

**Caller**: account owner only.
**Related FRs**: FR-010.

## Request

```ts
interface UnlinkMetaAccountRequest {
  workspaceId: string;
}
```

## Response

```ts
interface UnlinkMetaAccountResponse {
  ok: true;
}
```

## Authorization

- Caller MUST be owner.
- Workspace MUST be active.

## Side effects

- Clears `metaAdAccountId`, `metaAdAccountName`, `metaRoleAtLinkTime` on the workspace doc (sets them to `null` / field-delete).

## Errors

| Code | Message |
|---|---|
| `unauthenticated` | "Sign in required." |
| `permission-denied: owner_only` | "Only the account owner can unlink Meta ad accounts." |
| `not-found: workspace_not_found` | "Workspace not found." |

## Notes

- After unlink, generations produced in this workspace fall back to the user-level default Meta ad account at publish time (same behavior as pre-Phase-12).
- Idempotent: unlinking an already-unlinked workspace returns `ok: true` with no side effect.
