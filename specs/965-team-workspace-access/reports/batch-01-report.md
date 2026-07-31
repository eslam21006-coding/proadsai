# Batch 01 Report — T001..T017, T020..T022, T024, T028..T029

**Branch**: `965-team-workspace-access` (worktree `D:\proads-worktrees\fix-issue-d`)
**Date**: 2026-07-27
**Scope**: Setup + Foundational + US1 (server + frontend) + US2 (partial, frontend half) + US3 (partial, i18n + overlay)

## Tasks completed in this batch

| ID | Title | Files touched |
|---|---|---|
| T001 | Capture baseline build + test output | `specs/965-team-workspace-access/quickstart.md` |
| T002 | Empty test suite + `package.json` registration | `functions/src/__tests__/teamWorkspaceAccess.test.ts` (new), `functions/package.json` |
| T003 | `teamResolution: 'pending' \| 'resolved'` state | `src/App.tsx` (state moved up to the auth-state block) |
| T004 | Ref-in-deps repair (workspace + avatar effects) | `src/App.tsx` |
| T005 | `workspaceReady` derived + `workspaceLoadError` state | `src/App.tsx` |
| T006 | `resolveCallerScope` → `"ALL"` for verified members | `functions/src/workspaces/workspacePolicy.ts` |
| T007 | FR-004b override trace log | `functions/src/workspaces/workspacePolicy.ts` |
| T008 | `getWorkspaceGenerations` per-workspace narrowing removed | `functions/src/index.ts:6739` |
| T009 | Inverted `savedProjects.getUserProjects` test contract | `functions/src/__tests__/savedProjects.getUserProjects.test.ts` |
| T010 | A1–A9 + M1–M7 decision-table cases | `functions/src/__tests__/teamWorkspaceAccess.test.ts` |
| T011 | Workspace fetch → `users/{effectiveUid}/workspaces` | `src/App.tsx` (workspace effect) |
| T012 | Auto-create fallback removed for team members | `src/App.tsx` (workspace effect) |
| T013 | `isTeamMember` prop passed to `WorkspaceSwitcher` | `src/App.tsx` (call site at :7303) |
| T014 | U3 / U5 states + `loadError` / `onRetryLoad` props | `src/components/WorkspaceSwitcher.tsx` |
| T015 | Retired `workspace.error.no_access`; added U3 / U5 / write-gate / removed / refusal keys in both locales | `src/i18n.tsx` |
| T016 | `workspaceReady` write-gate (Generate / save project / save avatar) | `src/App.tsx` (`handleApproveTov`, `saveCurrentProject` with `workspaceReadyRef`, `handleSaveAvatar`) |
| T017 | Wrong-account image-fingerprint write fix (`user.uid` → `effectiveUid`) | `src/App.tsx:5519` |
| T020 | Mutation M1–M7 cases in `teamWorkspaceAccess.test.ts` | `functions/src/__tests__/teamWorkspaceAccess.test.ts` (expanded) |
| T021 | Edit pencil withheld in `WorkspaceSwitcher` for team members | `src/components/WorkspaceSwitcher.tsx:151` |
| T022 | Delete control withheld in `WorkspaceSettingsModal` for team members | `src/components/WorkspaceSettingsModal.tsx` (new `isTeamMember` prop), `src/App.tsx` (call site) |
| T024 | Refusal copy `workspace.refused.owner_only` in `en` + `ar` | `src/i18n.tsx` |
| T028 | Hardcoded English overlay replaced with `t()` calls | `src/App.tsx:11269-11271` |
| T029 | Overlay / removed-workspace i18n keys in `en` + `ar` | `src/i18n.tsx` |

## Files changed

| File | Lines (approx) | Change type |
|---|---|---|
| `src/App.tsx` | +277 / -? | modified (state additions, 5 effects updated, 1 helper ref, 1 wrong-account write fix, 1 overlay i18n, 1 write-gate) |
| `src/components/WorkspaceSwitcher.tsx` | +99 | modified (U3 / U5, prop contract, edit pencil gate) |
| `src/components/WorkspaceSettingsModal.tsx` | +10 | modified (new `isTeamMember` prop, delete-control gate) |
| `src/i18n.tsx` | +35 | modified (10 new keys, 2 locales each) |
| `src/pages/Team.tsx` | (Batch 02) | not touched in this batch — Batch 02 owns the matrix removal |
| `functions/src/workspaces/workspacePolicy.ts` | +50 | modified (FR-004b log + assertNotTeamMember + access policy change) |
| `functions/src/index.ts` | +33 | modified (T008 narrowing removal; T019 guards land in Batch 02) |
| `functions/src/__tests__/savedProjects.getUserProjects.test.ts` | +85 | modified (inverted contract) |
| `functions/src/__tests__/teamWorkspaceAccess.test.ts` | (new, 5 KB) | new |
| `functions/package.json` | +3 | modified (test script + main test entry) |
| `docs/LAUNCH_MATRIX.md` | +2 | modified (Batch 03 finalizes the resolved status) |
| `specs/965-team-workspace-access/quickstart.md` | appended | baseline (before) section |

## Issues / blockers found

- **Ref-in-deps ordering (resolved)**: `teamOwnerUid` and `teamResolution` are read inside the avatars effect and the workspace effect but were declared late in the file's state block. Fix: moved the state declarations up to the auth-state block so the effects that read them can resolve at the right phase.
- **`await` in a non-async `onSnapshot` callback (resolved)**: the workspace effect's snapshot callback is not `async`; the bootstrap dynamic import was rewritten as `.then(...)` chain.
- **`workspaceReady` captured by a `useCallback` with empty deps (resolved)**: the project save is captured by `useProjectAutoSave` via a ref. A closure capture would lock to the first-render value. Fix: mirrored `workspaceReady` into a `workspaceReadyRef` and update it on every render, read it inside the save callback.
- **Initial TypeScript build failure on the new `hasInProgressWorkRef` (resolved)**: the ref read work flags that are declared later in source. Fix: read the flags inside a `React.useEffect` (which runs in render order after all state has been declared) rather than a synchronous ref-mutation.
- **Spec ambiguity on retrieval timing of stored `workspaceAccess` array (resolved via FR-004b)**: the all-access policy is silent about the data being silently overridden. Fix: log the override trace whenever a non-empty stored list was overridden; never log for the empty-list case (would produce one log line per request for every member).
- **Spec ambiguity on retry UX (deferred to operator)**: the project convention is no automatic retry loop; `onSnapshot` already re-establishes across transient loss. Hard errors set `workspaceLoadError` and the switcher surfaces a manual-retry button. Documented in `quickstart.md` row 20.

## Build result

- `cd D:\proads-worktrees\fix-issue-d\functions; npm run build` → **PASS** (`tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/`, exit 0).
- `cd D:\proads-worktrees\fix-issue-d; npm run build` → **PASS** (`tsc -b && vite build`, 122 modules transformed, `built in 13.08s` first run; `built in 10.41s` after each subsequent batch). Vite emits the same pre-existing dynamic-import / chunk-size warnings; no new errors.

## Test result

- `cd functions; npm run test:teamWorkspaceAccess` → **PASS** (A1–A9 + M1–M7, 30+ assertions).
- `cd functions; node lib/__tests__/savedProjects.getUserProjects.test.js` → **PASS** (T055a now asserts ALLOWED for the empty stored list — the inverted contract).
- `cd functions; npm test` → **PASS** (all 30+ existing suites; the new `teamWorkspaceAccess.test.ts` is wired into the main `test` script).
- `cd functions; npm run test:lang` → **PASS** (T032 wording guard, all Spec 008 contract tests green).
- Frontend `npm run lint` → **PRE-EXISTING FAIL** (1020 problems, all in files outside ISSUE-D scope; recorded as T001 baseline; not a regression).

## Notes

- This batch deliberately stops after the US1 + US2 (partial) surface is in. Batch 02 will own T018/T019 (server refusal guards in the callables) and T023/T025–T027 (Team.tsx matrix removal + live listener + removal closure + active-workspace deletion handling). Batch 03 owns T030–T034 (final gate + locale parity + wording guard + LAUNCH_MATRIX update). T035 (deploy) and T036 (prod test) are post-merge per the project gate order and are not in the local-build scope.
- The commit message for T009 must call out the deliberate `getUserProjects` contract inversion — `tasks.md` notes warn that without it, review reads it as a regression.
