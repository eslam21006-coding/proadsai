# Callable Contract: `updateWorkspace`

**Caller**: account owner only.
**Related FRs**: FR-004.

## Request

```ts
interface UpdateWorkspaceRequest {
  workspaceId: string;
  name?: string;
  brandName?: string;
  brandColorPrimary?: string | null;  // null = clear
  brandColorSecondary?: string | null;
  logoUrl?: string | null;
  brandUrl?: string | null;
}
```

Only supplied (non-undefined) fields are written. `null` explicitly clears a field. Omitting a field leaves it untouched.

## Response

```ts
interface UpdateWorkspaceResponse {
  ok: true;
}
```

## Authorization

- Caller MUST be the owner of `workspaceId`.
- Workspace MUST be active (`deletedAt == null`).

## Side effects

- Partial Firestore `.update()` with only the supplied fields. Field-level last-write-wins. No revision-token check (per R5 / Q2).

## Errors

| Code | Message |
|---|---|
| `unauthenticated` | "Sign in required." |
| `permission-denied: owner_only` | "Only the account owner can edit workspace settings." |
| `not-found: workspace_not_found` | "Workspace not found or already deleted." |
| `invalid-argument: invalid_hex_color` | "Brand color must be a 6-digit hex value." |
| `invalid-argument: name_too_long` | "Workspace name must be 60 characters or fewer." |

## Notes

- Meta ad account fields (`metaAdAccountId` / `metaAdAccountName` / `metaRoleAtLinkTime`) are NOT accepted here. Use `linkMetaAccountToWorkspace` / `unlinkMetaAccountFromWorkspace` to mutate them (they require Meta role verification).
- `isDefault` and `createdAt` are immutable and rejected if supplied.
- `deletedAt` is never accepted here; use `deleteWorkspace` / `restoreWorkspace`.
