# Quickstart: Workspace Logic (Scale Mode)

**Feature**: 012-workspace-logic
**Audience**: engineers implementing or verifying Phase 12.

## Prerequisites

- Node 20+, pwsh, Firebase CLI.
- Local `.env` wired per existing repo conventions (no new env vars for this phase).
- A test Paddle plan config that supports a `scale` and a `pro` seat for the test user (backend: `@paddle/paddle-node-sdk`; client-side overlay: Paddle.js v2).
- A test Meta Business account with at least two ad accounts — one where the test user is `ADVERTISER` and one where they are `ANALYST` (to verify the role gate).

## 1. Start the dev stack

```bash
# Terminal 1 — frontend
npm run dev

# Terminal 2 — functions emulator (includes Firestore emulator)
firebase emulators:start --only functions,firestore
```

Seed the emulator Firestore with a test user whose `billingState.plan = 'scale'` and a default workspace (use existing seed tooling, or create one manually via the UI on first login).

## 2. Run the backend contract tests

```bash
cd functions
npm run test:workspace
```

Expected new-passing cases (from `workspace.test.ts`):

1. `createWorkspace` below Scale plan → `permission-denied: scale_plan_required`.
2. `createWorkspace` 11th workspace on Scale → `failed-precondition: workspace_limit_reached`.
3. `deleteWorkspace` on default → `failed-precondition: default_workspace_undeletable`.
4. `deleteWorkspace` on non-default → returns `ok: true, pendingReassign: true`, eventual `deletedAt` set.
5. When called with ANALYST role, `linkMetaAccountToWorkspace` → `failed-precondition: insufficient_meta_role`.
6. With ADVERTISER role, linking via `linkMetaAccountToWorkspace` → `ok`, fields written, `metaRoleAtLinkTime: 'ADVERTISER'`.
7. If ad account ID is not in the connected list, `linkMetaAccountToWorkspace` → `failed-precondition: meta_account_not_connected`.
8. Generation callable without `activeWorkspaceId` → `invalid-argument: active_workspace_required`.
9. Generation callable writes the `workspaceId` field.
10. `setTeamMemberWorkspaceAccess` writes one audit entry per grant/revoke in the diff.
11. `getWorkspaceGenerations` by a non-owner, non-accessing team member → `permission-denied: workspace_access_denied`.
12. Soft-delete then restore within window → workspace reappears, generations revert `workspaceId`.

## 3. Manual smoke test

1. Sign in as a Scale-plan user. Confirm you have exactly one workspace ("Default") in the switcher.
2. Open workspace settings → "Create Workspace". Name it "Client Brand A" with brand name "Brand A Inc." and primary color `#FF6A00`. Save. Confirm it appears in the switcher and can be made active.
3. In "Client Brand A" settings, open the Meta Ad Account section. Pick an ad account where your role is `ADVERTISER`. Confirm the name shows in settings after save.
4. Start a generation inside "Client Brand A". Move past Step 1. Go to the switcher and pick "Default". Confirm the switch guard dialog appears. Click "Cancel" — the active workspace should be unchanged. Click the switcher again and choose "Discard & Switch" — confirm the in-progress work is cleared and the active workspace is now "Default".
5. Complete one generation in "Default", then switch to "Client Brand A" and complete one there. In the saved projects / generation history view, confirm each workspace shows only its own work.
6. Open Team page. Invite a teammate. In their row, tick the "Client Brand A" checkbox and leave "Default" unchecked. Save. Log in as the teammate — confirm only "Client Brand A" is visible in their switcher.
7. Back as owner: delete "Client Brand A". Verify:
   - It disappears from the switcher.
   - The teammate no longer sees it on their next switcher load.
   - The generation you made in it now appears under "Default" in the history list.
   - An audit entry logged the revoke for the teammate. Inspect via `getWorkspaceAccessAuditLog` — open the browser devtools console and call `workspaceService.getWorkspaceAccessAuditLog({})`, or from the emulator run `firebase functions:shell` and execute `getWorkspaceAccessAuditLog({}, { auth: { uid: '<ownerUid>' } })`. The returned `entries` array should contain one entry with `action: 'revoke'`, `workspaceId` matching "Client Brand A", and `targetMemberUid`/`targetMemberEmail` matching the teammate.
8. Call `restoreWorkspace({ workspaceId })` (via a script or temporary devtools handler since this phase ships no end-user restore UI). Verify:
   - "Client Brand A" reappears in the owner's switcher.
   - The teammate's access is restored on next load.
   - The generation moves back to "Client Brand A" in the history list.

## 4. Arabic-language smoke

Switch the UI language to Arabic (existing toggle). Re-run steps 2–4 above. Every new user-facing string added in this phase (see research.md R9) MUST appear in Arabic with correct RTL direction.

## 5. Downgrade smoke

Via admin tooling or billingState fixture, downgrade the test user to `pro` while 3 workspaces exist.

- Verify all 3 workspaces remain listable and editable.
- Attempt to create a workspace and expect `permission-denied: scale_plan_required`.
- Ensure `linkMetaAccountToWorkspace` on an existing workspace still works (Pro retains Meta linking on its one default workspace — verify this matches the final plan-gate table in data-model.md #6).

Upgrade back to `scale`; creation works again.

## 6. Scheduled purge verification

Set `deletedAt` on a test workspace to `now - 30 days` (matching `THIRTY_DAYS_MS` and the cutoff in `purgeExpiredWorkspaces`) via direct Firestore write. Manually trigger `purgeExpiredWorkspaces` from the emulator functions shell. Confirm the workspace document is hard-deleted while `workspace_access_audit` entries stored under `users/{uid}/workspace_access_audit` remain untouched.

## Contract-to-code map

| Contract | Wired in |
|---|---|
| `createWorkspace` | `functions/src/index.ts` → `functions/src/workspaces/workspacePolicy.ts` |
| `updateWorkspace` | `functions/src/index.ts` |
| `deleteWorkspace` | `functions/src/index.ts` → background handler in `functions/src/workspaces/workspacePurge.ts`-adjacent delete handler |
| `restoreWorkspace` | same |
| `linkMetaAccountToWorkspace` | `functions/src/index.ts` (role probe in `functions/src/workspaces/metaRoleProbe.ts`) |
| `unlinkMetaAccountFromWorkspace` | `functions/src/index.ts` |
| `setTeamMemberWorkspaceAccess` | `functions/src/index.ts` + `functions/src/workspaces/auditLog.ts` |
| `getWorkspaceGenerations` | `functions/src/index.ts` |
| `getWorkspaceAccessAuditLog` | `functions/src/index.ts` |
| `purgeExpiredWorkspaces` | `functions/src/workspaces/workspacePurge.ts` (scheduled) |
| Generation payload extension | every `generate*` in `functions/src/generators.ts` + `functions/src/index.ts` |
| `WorkspaceSettingsModal` extensions | `src/components/WorkspaceSettingsModal.tsx` |
| `WorkspaceSwitcher` extensions | `src/components/WorkspaceSwitcher.tsx` |
| Team access matrix UI | `src/pages/Team.tsx` |
