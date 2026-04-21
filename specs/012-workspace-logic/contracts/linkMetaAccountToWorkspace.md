# Callable Contract: `linkMetaAccountToWorkspace`

**Caller**: account owner only.
**Related FRs**: FR-008, FR-009, FR-011.

## Request

```ts
interface LinkMetaAccountRequest {
  workspaceId: string;
  metaAdAccountId: string;     // e.g., "act_123456789"
  metaAdAccountName: string;   // display name snapshot
}
```

## Response

```ts
interface LinkMetaAccountResponse {
  ok: true;
  metaRoleAtLinkTime: 'ADMIN' | 'ADVERTISER';
}
```

## Authorization

- Caller MUST be the owner of `workspaceId`.
- Workspace MUST be active.
- `metaAdAccountId` MUST be in the owner's connected Meta ad accounts (from `metaService.getConnection()` stored shape).
- Owner's role on `metaAdAccountId`, as reported by Meta Marketing API (`GET /{adAccountId}?fields=user_role`), MUST be `ADMIN` or `ADVERTISER`.

## Side effects

- Writes `metaAdAccountId`, `metaAdAccountName`, `metaRoleAtLinkTime` onto the workspace doc.
- If the workspace already had a linked ad account, it is overwritten (re-linking requires a fresh role probe).

## Errors

| Code | Message |
|---|---|
| `unauthenticated` | "Sign in required." |
| `permission-denied: owner_only` | "Only the account owner can link Meta ad accounts." |
| `not-found: workspace_not_found` | "Workspace not found." |
| `failed-precondition: meta_account_not_connected` | "This Meta ad account is not in your connected accounts." |
| `failed-precondition: insufficient_meta_role` | "Your Meta role on this ad account doesn't allow publishing. Request Advertiser access in Meta Business Manager to link it." |
| `failed-precondition: meta_connection_missing` | "Connect your Meta account first." |
| `unavailable: meta_api_error` | "Could not verify Meta role right now. Please try again." |

## Notes

- Meta API role probe is one HTTP call. Expected latency: ~200ms.
- The role value is cached on the workspace doc for audit/debugging; it is NOT treated as authoritative for publish — publish re-probes.
