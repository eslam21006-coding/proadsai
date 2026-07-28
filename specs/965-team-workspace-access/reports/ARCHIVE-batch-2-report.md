# Batch 2 Report — T016, T018, T019, T023, T025, T026, T027, T030

**Branch**: `965-team-workspace-access` (worktree `D:\proads-worktrees\fix-issue-d`)
**Date**: 2026-07-27

## Tasks completed in this batch

| ID | Title | File(s) | Notes |
|---|---|---|---|
| T016 | Write-gate on `workspaceReady` | `src/App.tsx` | Generate (`handleApproveTov`), project save (`saveCurrentProject`), and avatar save (`handleSaveAvatar`) all short-circuit with the plain-language `workspace.write_gate.loading` toast when the gate is closed. The project-save closure sees the latest `workspaceReady` through a ref because the save callback is captured by `useProjectAutoSave` via a ref. |
| T018 | `assertNotTeamMember` helper | `functions/src/workspaces/workspacePolicy.ts` | Single source of truth for the refusal. Reads the caller's user doc, throws `HttpsError('permission-denied', …, { reason: 'team_member' })`, and emits the FR-023 log line. |
| T019 | Guard every mutation callable | `functions/src/index.ts` (createWorkspace, updateWorkspace, deleteWorkspace, restoreWorkspace) | First statement after `if (!request.auth)`. The `createWorkspace` guard is the SC-005 closure: without it, a member's create succeeded and silently wrote to their own account. |
| T023 | Workspace access matrix removed | `src/pages/Team.tsx` | UI table, `handleWorkspaceAccessToggle`, `workspaces` list state, `wsAccessLoading` state, and the workspace-listing effect are all gone. The `setTeamMemberWorkspaceAccess` callable stays deployed (FR-021) — it's still called by `workspacePurge.ts` for delete/restore. |
| T025 | `getDocs` → `onSnapshot` | `src/App.tsx` (workspace effect) | Live listener with proper teardown. The unsubscribe runs whenever `effectiveUid` or `teamResolution` changes. |
| T026 | Close listener on removal | `src/App.tsx` (real-time user-doc listener) | The existing removal detection at `App.tsx:1945-1947` now also clears `workspaces` and `activeWorkspaceId`. The workspace effect's dep on `effectiveUid` ensures the snapshot detaches when membership ends. |
| T027 | Active-workspace deletion | `src/App.tsx` (workspace effect callback) | When the live snapshot reports the active workspace gone, the snapshot callback switches to the account's default. If `hasInProgressWorkRef.current` is true it queues a `pendingWorkspaceSwitch` for the switcher to surface the save/discard guard; otherwise the move is silent and a plain notice is shown. The `hasInProgressWorkRef` is updated by a render-phase effect so the snapshot callback can read the latest flags without taking them as deps. |
| T030 | Final build + test green gate | (recorded) | `functions` build OK; full `npm test` green (every existing suite). Frontend `npm run build` OK. |

## Build status

- `functions` `npm run build` → OK
- `functions` `npm test` → PASS (all 30+ suites including the new `teamWorkspaceAccess.test.ts`, the inverted `savedProjects.getUserProjects.test.ts`, and every existing phase-14 / RAG / cultural / HFE / HFF fixture)
- Frontend `npm run build` → OK; 122 modules, `built in 11.41s`

## Issues found

- Initial build error from the new `hasInProgressWorkRef` reading work flags that are declared later in source. Fixed by reading the flags inside a `React.useEffect` (which runs in render order after all state has been declared) rather than in a synchronous ref-mutation at the top of the workspace state block.
- Initial build error from `await import('./services/workspaceService')` inside a non-async arrow passed to `onSnapshot`. Fixed by hoisting the dynamic import into its own `.then(...)` chain.

## Tasks remaining (Batch 3 — finalize / verify)

- T031 — verify locale parity: every new i18n key in both `en` and `ar`
- T032 — run the project's user-facing wording guard (languageQuality.test)
- T033 — execute the 30-row manual verification matrix (frontend, dev server)
- T034 — update the ISSUE-D row in `docs/LAUNCH_MATRIX.md` to resolved
- T035 — deploy the changed callables to `europe-west1`
- T036 — production-test rows 1–3, 3a, 9–10, 19, and 28–29 (requires deploy)

T033, T035, T036 require dev/prod access and live Cloud Logging; they are the project gate, not in scope of the local build.
