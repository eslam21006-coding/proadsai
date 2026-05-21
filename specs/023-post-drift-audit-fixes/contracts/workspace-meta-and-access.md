# Contract: Workspace Meta Routing & Team Access (FR-118..125, FR-211/213)

**Location**: `functions/src/index.ts` (`metaPushCreativePack`), `functions/src/workspaces/workspacePolicy.ts`, `src/App.tsx`, `src/components/*`

> **Linked-fix pair**: FR-119 (writes `workspaceAccess`) → unblocks FR-211/FR-213 (read it). FR-119 lands first.

## Meta routing (FR-118)

`metaPushCreativePack` resolves the target ad account as:
```text
target = workspace.metaAdAccountId ?? conn.selectedAccountId   // workspace-first, user-default fallback
```
Today it always uses `conn.selectedAccountId` (`index.ts:4612` area). No schema change; read-path only.

## Team workspace-access (FR-119/120)

- **FR-119**: Team-page per-member matrix (checkbox per workspace) → calls `setTeamMemberWorkspaceAccess({ memberDocId, workspaceAccess: string[] })`, writing `workspaceAccess` onto `users/{ownerUid}/team/{autoId}`.
- **FR-120**: wire `WorkspaceAccessAuditPanel.tsx` into the Team page (currently imported by nothing) → calls `getWorkspaceAccessAuditLog`.

## resolveCallerScope correction (FR-211)

Read the canonical model `users/{ownerUid}/team/{autoId}` (`where('uid','==',callerUid)`, `workspaceAccess[]`); remove the stale `team/meta` + `members/{uid}.workspaceIds` path. (Mirror `getWorkspaceGenerations`, `index.ts:5768-5777`.)

## getUserProjects client wiring (FR-213)

`src/` calls `getUserProjects({ workspaceId?, status?, cursor? })` for team members (currently zero references); owners keep the local path. Paginated, ordered most-recent-first.

## Switch guard + gating (FR-121/124/125)

- **FR-121**: `hasInProgressWork` real selector in `store.ts`, passed to `<WorkspaceSwitcher>` → guard fires mid-generation.
- **FR-124**: remove direct `addDoc`/`setDoc` workspace writes in `App.tsx` (`:1729,1746`); route through `createWorkspace`/`updateWorkspace` callables (gated).
- **FR-125**: pass `plan` + `metaAdAccounts` props to `WorkspaceSettingsModal` (`App.tsx:8681`) → Scale gate + Meta section render.

## Rules/indexes (FR-122) — code-ready, owner deploys
Verify the committed `firestore.rules` (workspace/audit predicates) + `firestore.indexes.json` (3 composite indexes) in the emulator/rules-playground; owner runs `firebase deploy` separately.

## Done proof
- `metaPushCreativePack`: grep shows `workspace.metaAdAccountId` read; emulator publish from a linked workspace targets that account.
- A member granted workspace A sees only A's projects via `getUserProjects`; permission-denied leaks no metadata.
- `hasInProgressWork` is a selector (not static `false`) and is passed at the switcher render site.
