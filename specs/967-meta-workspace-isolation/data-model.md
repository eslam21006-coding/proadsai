# Phase 1 Data Model: Workspace-Aware Meta Integration

**Feature**: `967-meta-workspace-isolation` | **Date**: 2026-08-18

All changes are additive. No collection is created, renamed, or removed.

---

## 1. Workspace — `users/{ownerUid}/workspaces/{workspaceId}`

The unit of Meta identity. Gains the Page half of the routing pair it already holds for ad accounts.

| Field | Type | Status | Notes |
|---|---|---|---|
| `name` | `string` | existing | |
| `brandName` | `string` | existing | |
| `isDefault` | `boolean` | existing — **repair needed** | Never written as `true` by any server path (R4). Exactly one active workspace per account must carry `true`. |
| `createdAt` | `number` | existing | Present on every document, legacy and current. Safe to order by. |
| `deletedAt` | `number \| null` | existing — **repair needed** | **Absent** on workspaces created before 2026-05-21 (R1). Must exist and be `null` on every active workspace. |
| `metaAdAccountId` | `string \| null` | existing | Set only by `linkMetaAccountToWorkspace`. |
| `metaAdAccountName` | `string \| null` | existing | |
| `metaRoleAtLinkTime` | `string \| null` | existing | Role probed at link time. |
| **`metaPageId`** | **`string \| null`** | **NEW** (FR-005) | The workspace's Facebook Page. `null` = none recorded. |
| **`metaPageName`** | **`string \| null`** | **NEW** (FR-005) | Display name, ≤200 chars, mirrors the existing global cap. |
| **`metaPageClearedAt`** | **`number \| null`** | **NEW** (FR-011a) | Set when an ad-account change clears the Page. Distinguishes *never chosen* (eligible for the legacy fallback) from *deliberately cleared* (not eligible). |

### Validation rules

- `metaPageId` MUST be present in the account's `metaConnections/{ownerUid}.pages[]` at the moment of selection (mirrors the ad-account check at `index.ts:6733-6736`).
- `metaPageName` is truncated to 200 characters.
- `metaPageId` and `metaPageName` MUST NOT be writable through `updateWorkspace` — add both to its forbidden list (R7, FR-007 integrity).
- `metaPageClearedAt` is server-set only; never accepted from a caller.

### State transitions — Page

```
                    ┌──────────────────────────────────────────┐
                    │ NEVER_SET                                │
                    │ metaPageId=null, metaPageClearedAt=null  │
                    │ → legacy global Page applies (FR-007)    │
                    └──────────────┬───────────────────────────┘
                                   │ user selects a Page
                                   ▼
                    ┌──────────────────────────────────────────┐
                    │ SET                                      │
                    │ metaPageId="123", metaPageClearedAt=null │
                    │ → global never consulted (FR-008)        │
                    └──────────────┬───────────────────────────┘
                                   │ ad account changed OR removed (FR-011)
                                   ▼
                    ┌──────────────────────────────────────────┐
                    │ CLEARED                                  │
                    │ metaPageId=null, metaPageClearedAt=<ts>  │
                    │ → legacy fallback does NOT apply         │
                    │   (FR-011a); publish still allowed       │
                    │   (FR-015a)                              │
                    └──────────────┬───────────────────────────┘
                                   │ user selects a Page
                                   └──────────► SET
```

`NEVER_SET` and `CLEARED` both show "no Page" to the user and both permit publishing. They differ **only** in whether the legacy global Page is consulted. Without `metaPageClearedAt` the two are indistinguishable and FR-011a cannot be enforced — a cleared Page would silently inherit the global one, reopening the cross-client leak FR-011 exists to close.

---

## 2. Meta Connection — `metaConnections/{ownerUid}`

Unchanged in shape. Two fields change in **meaning** only.

| Field | Type | Status | Notes |
|---|---|---|---|
| `userId` | `string` | existing | Always an **owner** uid after this phase, including when a team member authorised (FR-020a-i). |
| `encryptedToken` | `string` | existing | Single account-wide credential. Unchanged. |
| `expiresAt` | `number` | existing | |
| `adAccounts` | `array` | existing | **Remains the source of truth** for what is available. |
| `pages` | `array` | existing | **Remains the source of truth** for what is available. |
| `selectedAccountId` | `string \| null` | **→ LEGACY** | Read-only fallback (FR-009). Never authoritative for routing. |
| `selectedPageId` | `string \| null` | **→ LEGACY** | Fallback only for workspaces in `NEVER_SET` (FR-007). |
| `selectedPageName` | `string \| null` | **→ LEGACY** | |
| `connectedAt` / `lastSyncAt` / `status` | mixed | existing | |

Writes to the legacy fields continue (so a revert restores current behaviour cleanly — FR-030); reads stop treating them as authoritative.

---

## 3. Creative Deployment — `creativeDeployments/{deploymentId}`

Attribution record for a publish. Extended for traceability (FR-027).

| Field | Type | Status | Notes |
|---|---|---|---|
| `userId` | `string` | existing | **Behaviour change**: now always the owner uid, never a team member's. |
| `adAccountId` | `string` | existing | **Behaviour change**: resolved from the workspace, never from `selectedAccountId`. |
| `workspaceId` | `string \| null` | existing | **Behaviour change**: server-resolved and always populated; no longer a client-supplied passthrough that may be null. |
| `pageId` / `pageName` | `string \| null` | existing | **Behaviour change**: resolved from the workspace. `null` is a valid recorded outcome (FR-027). |
| **`workspaceIdSource`** | **`'request' \| 'default'`** | **NEW** (FR-012) | Whether the caller named the workspace or the server resolved the account default. |
| **`pageSource`** | **`'workspace' \| 'legacy_global' \| 'none'`** | **NEW** (FR-028) | Counts remaining un-migrated workspaces. |
| **`pushedByUid`** | **`string`** | **NEW** (FR-020a, FR-027) | The actual caller. `userId` is the owner; this records who acted. |
| `metaAdId` / `metaCreativeId` / `metaAdSetId` / `metaCampaignId` | `null` | existing | Still always `null` — no ad is created (R8). |

---

## 4. Derived / non-persisted

**Caller Scope** — computed per request by `resolveCallerScope(callerUid)`, never stored:

| Field | Type | Use |
|---|---|---|
| `ownerUid` | `string` | Every Firestore path in scope |
| `allowedWorkspaceIds` | `string[] \| "ALL"` | FR-004, FR-021 enforcement |
| `storedWorkspaceAccess` | `string[]` | Audit trace |
| `readDegraded` | `boolean?` | **Must be checked before using `ownerUid`** (FR-003) |

---

## 5. Data repair — **approved** (R1 Option A + R4 Option A, 2026-08-18)

Not a feature migration. Repairs legacy documents to the shape every current code path already assumes. One pass covers both defects (FR-026c–FR-026g).

| # | Target | Condition | Write |
|---|---|---|---|
| 1 | `users/*/workspaces/*` | `deletedAt` key absent | `deletedAt: null` |
| 2 | `users/*/workspaces/{oldest active}` | account has no workspace with `isDefault: true` | `isDefault: true` |

**Ordering matters**: repair 1 must complete for an account before repair 2 evaluates it. "Oldest active" is determined by `createdAt` ascending among workspaces with `deletedAt == null` — and until repair 1 lands, the legacy documents are exactly the ones a `deletedAt`-constrained read cannot see. Reading them requires an unconstrained collection scan (Admin SDK bypasses rules), not the client query shape.

**Properties**
- **Idempotent** (FR-026e) — re-running writes nothing. Both conditions are self-extinguishing.
- **Additive** — no field is removed or overwritten with a different value; a workspace already carrying both markers is untouched.
- **Never writes a Page** (FR-026f) — `metaPageId` is not part of the repair. Page adoption stays lazy (FR-010).
- **Revert-safe** (FR-026g, FR-030) — repaired documents are valid under both old and new code. The old code's client-side `.filter(ws => ws.deletedAt == null)` accepts an explicit `null` just as it accepted an absent field.

### Source fix (FR-026d)

`createWorkspace` currently hard-codes `isDefault: false` (`index.ts:6519`). It must instead mark the first workspace on an account as the default.

**The decision must be made inside the existing `createWorkspaceWithLimit` transaction**, which already reads the active-workspace list (`workspacePolicy.ts:139`). Deciding outside the transaction lets two concurrent creations on a fresh account each see zero workspaces and both claim `isDefault: true`, leaving `resolveDefaultWorkspaceId`'s `.limit(1)` to pick between them arbitrarily.

Without this fix the repair is a one-off that decays: every account created afterwards would again have no default.

---

## Index requirements

The existing query `where('deletedAt','==',null) + orderBy('createdAt','desc')` needs a composite index on `(deletedAt ASC, createdAt DESC)`, which must already exist since the query runs today. Under R1 Option B (drop the predicate) a single-field `createdAt` index suffices and the composite becomes unused. No new index is required by any option.
