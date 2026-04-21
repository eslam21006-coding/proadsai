# Callable Contract: `createWorkspace`

**Caller**: authenticated user (always the account owner — team members cannot call).
**Module**: `functions/src/index.ts` (wires it), logic lives in `functions/src/workspaces/workspacePolicy.ts`.
**Related FRs**: FR-001, FR-002, FR-003, FR-007.

## Request

```ts
interface CreateWorkspaceRequest {
  name: string;                     // 1-60 chars after trim
  brandName: string;                // 1-60 chars after trim
  brandColorPrimary?: string;       // #RRGGBB if present
  brandColorSecondary?: string;     // #RRGGBB if present
  logoUrl?: string;                 // Firebase Storage URL if present
  brandUrl?: string;                // optional
}
```

## Response

```ts
interface CreateWorkspaceResponse {
  workspaceId: string;
}
```

## Authorization

- Caller MUST be signed in (`context.auth.uid` present).
- Caller's `billingState.plan` MUST be `'scale'`. Below-Scale → `permission-denied: scale_plan_required`.
- Caller's active (non-soft-deleted) workspace count MUST be `< 10`. Else → `failed-precondition: workspace_limit_reached`.

## Side effects

- Writes one document to `users/{uid}/workspaces/{autoId}` with `isDefault: false`, `createdAt: now()`, `deletedAt: null`. No audit entry — workspace creation is not a grant/revoke action.

## Errors

| Code | Message |
|---|---|
| `unauthenticated` | "Sign in required." |
| `permission-denied: scale_plan_required` | "Creating more than one workspace requires the Scale plan." |
| `failed-precondition: workspace_limit_reached` | "You've reached the 10-workspace limit on the Scale plan." |
| `invalid-argument: name_required` | "Workspace name is required." |
| `invalid-argument: brand_name_required` | "Brand name is required." |
| `invalid-argument: invalid_hex_color` | "Brand color must be a 6-digit hex value like #A1B2C3." |

## Happy-path example

```json
// Request
{ "name": "Client Brand A", "brandName": "Brand A Inc.", "brandColorPrimary": "#FF6A00" }

// Response
{ "workspaceId": "wks_7kQp..." }
```

## Sad-path example (Pro plan)

```json
// Request (same as above)
// Response — thrown as HttpsError
{ "code": "permission-denied", "message": "Creating more than one workspace requires the Scale plan.", "details": { "reason": "scale_plan_required" } }
```
