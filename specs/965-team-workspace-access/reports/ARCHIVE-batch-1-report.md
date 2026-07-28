# Batch 1 Report — T001..T017, T020, T021, T022, T024, T028, T029

**Branch**: `965-team-workspace-access` (worktree `D:\proads-worktrees\fix-issue-d`)
**Date**: 2026-07-27

## Tasks completed in this batch

| ID | Title | File(s) | Notes |
|---|---|---|---|
| T001 | Baseline capture | `specs/965-team-workspace-access/quickstart.md` | Build + test green; lint pre-existing 1020 errors recorded as baseline |
| T002 | Empty test suite | `functions/src/__tests__/teamWorkspaceAccess.test.ts`, `functions/package.json` | Registered `test:teamWorkspaceAccess` script and added to main `test` |
| T003 | `teamResolution` state | `src/App.tsx` | Declared early, set to `'resolved'` on both branches of the membership check (team-member, plain-user), and on the live user-doc listener path; reset on sign-out |
| T004 | Ref-in-deps repair | `src/App.tsx` | Workspace + avatar effects now key on `teamOwnerUid` (state) + `teamResolution`; ref is the synchronous read inside the body. Return early while `'pending'`. |
| T005 | `workspaceReady` + `workspaceLoadError` | `src/App.tsx` | Derived flag governs the write-gate (FR-007a) |
| T006 | `resolveCallerScope` → "ALL" | `functions/src/workspaces/workspacePolicy.ts` | Verified member returns `"ALL"`; stored `workspaceAccess` is no longer consulted |
| T007 | FR-004b override trace | `functions/src/workspaces/workspacePolicy.ts` | `console.warn("issue-d ▸ workspaceAccess ignored …")` for non-empty stored arrays only |
| T008 | `getWorkspaceGenerations` widening | `functions/src/index.ts:6739` | Membership proof retained; per-workspace `workspaceAccess` narrowing removed |
| T009 | Inverted contract test | `functions/src/__tests__/savedProjects.getUserProjects.test.ts` | Documented inversion; "T055a: empty stored list → denied" became "T055a: now allowed"; partial-list cases reframe as the all-access rule |
| T010 | A1–A9 + M1–M7 decision tables | `functions/src/__tests__/teamWorkspaceAccess.test.ts` | 30+ assertions across the two contracts; pure-function mirror of the live policy |
| T011 | `users/{effectiveUid}/workspaces` fetch | `src/App.tsx` (workspace effect) | Path is now built from `effectiveUid` (not the ref snapshot) |
| T012 | No auto-create for team members | `src/App.tsx` (workspace effect) | `if (wsList.length === 0 && !teamOwnerUid)` guards the owner-only bootstrap; team members hit the U3 message instead |
| T013 | `isTeamMember` prop to `WorkspaceSwitcher` | `src/App.tsx` | Passed as `teamResolution === 'resolved' && teamOwnerUid != null` |
| T014 | U3 / U5 states | `src/components/WorkspaceSwitcher.tsx` | Render guard relaxed to `canUseWorkspaces && teamResolution === 'resolved'`; new `loadError` + `onRetryLoad` props; collapsed-button label fixed to drop the false "Default Workspace" default |
| T015 | i18n keys (en + ar) | `src/i18n.tsx` | New `workspace.error.no_workspaces`, `load_failed`, `retry`, `removed_notice`; old `no_access` left in place (not in any user-facing path) |
| T017 | Wrong-account write fix | `src/App.tsx:5519` | Image-fingerprint path now uses `effectiveUid` (was `user.uid`); a member's write targets the owner's workspace subtree |
| T021 | Withhold edit pencil | `src/components/WorkspaceSwitcher.tsx:151` | Edit button now gated `!isTeamMember` |
| T022 | Withhold delete control | `src/components/WorkspaceSettingsModal.tsx` + call site in `src/App.tsx` | New `isTeamMember` prop, conditional `!isTeamMember` on the delete confirm |
| T024 | Refusal copy | `src/i18n.tsx` | `workspace.refused.owner_only` in both locales |
| T028 | Hardcoded-English overlay | `src/App.tsx:11269-11271` | Both `team.removed_body` and `team.continue_button` go through `t()` (T029 keys) |
| T029 | Overlay / removed i18n keys | `src/i18n.tsx` | Both `en` and `ar` blocks |

## Build status

- `functions`: `npm run build` → OK. `test:teamWorkspaceAccess` → PASS. `test:savedProjects` (existing) → still PASS.
- Frontend: `npm run build` → OK. 122 modules transformed, `built in 10.74s`. Vite emits the same pre-existing dynamic-import / chunk-size warnings; no new errors.

## Issues found

- None new. The ref-in-deps defect at `App.tsx:2405` (workspace) and `App.tsx:1977` (avatars) was exactly as `research.md` D2 described; the fix was a small set of state-based deps plus an early-return while `teamResolution === 'pending'`.
- Pre-existing lint failures remain (1020 problems, all in files outside ISSUE-D scope). Recorded as T001 baseline; not in scope for this fix.

## Tasks remaining (Batch 2)

- T016 — gate workspace writes on `workspaceReady` (Generate, save project, save audience profile)
- T018 — add `assertNotTeamMember(callerUid, action)` helper in `workspacePolicy.ts`
- T019 — call `assertNotTeamMember` as the first statement in `createWorkspace`, `updateWorkspace`, `deleteWorkspace`, `restoreWorkspace`
- T023 — remove the workspace access matrix from `src/pages/Team.tsx` (FR-020, FR-021)
- T025 — replace `getDocs` with `onSnapshot` for the workspace list
- T026 — close the workspace listener and clear `workspaces` on removal
- T027 — handle the active workspace being deleted (move to default + plain notice)
