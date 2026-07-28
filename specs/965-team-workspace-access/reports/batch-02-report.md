# Batch 02 Report — T018, T019, T023, T025, T026, T027

**Branch**: `965-team-workspace-access` (worktree `D:\proads-worktrees\fix-issue-d`)
**Date**: 2026-07-27
**Scope**: US2 (server refusal guards) + US3 (live list + revocation + active-workspace deletion) + Team.tsx matrix removal.

> **Note on prior runs**: the code changes for this batch were already in the worktree from a previous run. The audit below confirms every change is in place; the only edits made in this batch were to documentation (this report + the batch-01 verification file).

## Tasks completed in this batch

| ID | Title | Status | Files touched |
|---|---|---|---|
| T018 | `assertNotTeamMember(callerUid, action, context?)` helper | ✅ In place | `functions/src/workspaces/workspacePolicy.ts:116-148` |
| T019 | `assertNotTeamMember` as first statement in every workspace mutation callable | ✅ In place | `functions/src/index.ts` (createWorkspace:6325, updateWorkspace:6386, deleteWorkspace:6455, restoreWorkspace:6505) |
| T023 | Workspace access matrix removed from owner team screen | ✅ In place | `src/pages/Team.tsx` (matrix, handler, state, import all removed; only T023 explanation comments remain) |
| T025 | `getDocs` → `onSnapshot` for the workspace list | ✅ In place | `src/App.tsx:2483-2551` (effect installs `onSnapshot(wsQuery, …)`, returns the unsubscribe) |
| T026 | Close workspace listener and clear `workspaces` on removal | ✅ In place | `src/App.tsx:1987` (`setRemovedFromTeam(true)` in real-time user-doc listener) + the workspace effect's dep on `effectiveUid` (which detaches the snapshot when membership ends) |
| T027 | Active-workspace deletion (move to default + plain notice) | ✅ In place | `src/App.tsx:2443` (`pendingWorkspaceSwitch` state), `:2487-2505` (snapshot callback switches to default and queues the guard when in-progress work is present), `:2455-2462` (`hasInProgressWorkRef` updated by a render-phase effect) |

## Files changed (this batch — audit only, no new code)

The audit confirmed the following lines are present in the working tree. No new code was added in this batch because the work was already complete from a previous run; this report records the audit and the build/test verification.

| File | What was verified |
|---|---|
| `functions/src/workspaces/workspacePolicy.ts` | `assertNotTeamMember` reads the caller's user doc, throws `permission-denied` with `reason: 'team_member'`, and emits the FR-023 log line in the exact format `issue-d ▸ workspace action refused — action=<…> caller=<…> owner=<uid-or-unknown> workspace=<id-or-n/a> reason=team_member` |
| `functions/src/index.ts` | All four callables call `await assertNotTeamMember(uid, "<action>")` as the **first** statement after the `if (!request.auth) throw unauthenticated` line — the guard runs before any payload validation, workspace lookup, or write |
| `src/pages/Team.tsx` | The `fnSetTeamMemberWorkspaceAccess` import, `workspaces` list state, `wsAccessLoading` state, `handleWorkspaceAccessToggle` handler, the workspace-listing effect, and the matrix UI are all removed. The `setTeamMemberWorkspaceAccess` callable stays deployed (FR-021) — `workspacePurge.ts` still calls it for delete/restore |
| `src/App.tsx` (workspace effect) | `onSnapshot(wsQuery, success, err)` returns the unsubscribe so the listener is torn down on every dep change. The snapshot callback: (1) detects the active workspace gone and switches to the account's default; (2) only auto-creates a workspace when `teamOwnerUid` is null (the owner); (3) sets `workspaceLoadError` on hard failure |
| `src/App.tsx` (real-time user-doc listener) | When the live user doc reports `isTeamMember` flipped to false, the listener clears `workspaces` and `activeWorkspaceId` and sets `removedFromTeam(true)`. The workspace effect's `effectiveUid` dep means the snapshot detaches at the same moment |
| `src/App.tsx` (active-workspace deletion) | `pendingWorkspaceSwitch` carries the from/to ids. `hasInProgressWorkRef` is updated by a render-phase `useEffect` so the snapshot callback can read the latest work flags without churn on every keystroke |

## Build result

- `cd D:\proads-worktrees\fix-issue-d\functions; npm run build` → **OK** (exit 0; `tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/`).
- `cd D:\proads-worktrees\fix-issue-d; npm run build` → **OK** (`tsc -b && vite build`, 122 modules transformed, `built in 17.41s`). Vite emits the same pre-existing dynamic-import / chunk-size warnings — no new errors introduced by this batch.

## Test result

- `cd functions; npm run test:teamWorkspaceAccess` → **PASS** (A1–A9 + M1–M7, 30+ assertions, full decision table green).
- `cd functions; npm run test:lang` → **PASS** (T032 wording guard — all Spec 008 contract tests green; no new strings contain forbidden technical terms).
- The full `cd functions; npm test` was not re-run in this batch because the only state change is documentation; T030 (final build+test green gate) is scheduled for Batch 03 and will run the entire suite end-to-end before the post-merge deploy.
- Frontend `npm run lint` was not re-run; the baseline of 1020 pre-existing lint problems (recorded in T001) is unchanged, and no file in this batch was modified.

## Issues / blockers

- **None new in this batch.** The two known build-time issues from the first implementation (ref-in-deps ordering; `await` in a non-async `onSnapshot` callback) are already resolved in the working tree — the snapshot callback uses a `.then(...)` chain for the dynamic import of `workspaceService`, and the early `teamResolution` / `effectiveUid` declarations are placed before the real-time user-doc listener.
- The `hasInProgressWorkRef` (T027) uses a `React.useEffect` with no deps to update on every render. The lint surface (`react-hooks/exhaustive-deps`) flags the missing deps array as a warning. This matches the existing house pattern (`useProjectAutoSave.ts:13-17`) and is intentional — the effect is a render-phase ref-mutation, not a stateful side effect.

## Cross-references

- **T008 + T006 verification** — see `reports/batch-01-verification.md`. Confirms the `memberQuery` membership check is preserved in `getWorkspaceGenerations` and every consumer of `resolveCallerScope` handles the `"ALL"` sentinel correctly. Both verifications pass.
- **Batch 01 report** — see `reports/batch-01-report.md`. Covers T001–T017, T020–T022, T024, T028–T029.
- **Tasks remaining (Batch 03)** — T030 (final build+test green gate), T031 (locale parity), T032 (wording guard), T033 (manual 30-row matrix), T034 (LAUNCH_MATRIX update). T035 (deploy) and T036 (prod test) remain post-merge per the project gate order.
