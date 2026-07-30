# Round 12 Report — CodeRabbit re-review fixes

**Branch**: `fix/issue-d-team-workspace-access` (worktree `D:\proads-worktrees\fix-issue-d`)
**Date**: 2026-07-29
**Commit**: `ec967f8`
**PR**: #58

## Scope

Addressed 1 outside-diff + 4 nitpick items from the CodeRabbit re-review of
commit `faff9d8` (round 11). All items from the previous round's review are
closed. Six additional prompt-for-all items remain in the latest review's
prompt-for-all block; those are documentation/process polish, not in
the actionable scope, and were left for a future batch.

## Tasks completed

| # | File | Fix |
|---|---|---|
| 1 | `src/App.tsx` (claimed-member branch) | `setTeamResolution('resolved')` and `setUser(currentUser)` were nested inside `if (ownerSnap.exists())`, so a missing or unreadable owner doc stranded a claimed member in `'pending'` forever — the workspace listener never subscribed and the write gate (`workspaceReady`) blocked every generation/save with no path to recovery short of a manual reload. Moved `setUser` + `setTeamResolution('resolved')` outside the `ownerSnap.exists()` branch. When the owner doc is absent, fall back to zero credits / `'none'` plan / `cancelled` billing status, mirroring the existing-user path at lines 1775–1782. |
| 2 | `src/components/WorkspaceSettingsModal.tsx` (props) | Widened `onSave` and `onDelete` to `void \| Promise<void>`. The modal's `handleSubmit` / `handleDelete` already `await` these callbacks and rely on rejection to drive `uiError`; the `void`-only typing made the `await` essentially invisible to the type system. Same async callback typing already adopted by `WorkspaceSwitcher.onSwitchGuardSave`. |
| 3 | `src/components/WorkspaceSwitcher.tsx` (Escape closure) | The document-level keydown listener was capturing a stale `handleGuardCancel` closure because the handler was declared below the useEffect that read it. Hoisted the handler above the useEffect, wrapped it in `useCallback` with `onSwitchGuardCancel` in deps, and added `handleGuardCancel` to the effect's dep array. The handler now always invokes the current cancellation logic. Cleared the `react-hooks/immutability` lint error. |
| 4 | `src/lib/projectAutoSave.ts` (catch binding) | Replaced `catch (err: any)` with `catch (err: unknown)` and narrowed `errMsg` via `err instanceof Error ? err.message : String(err)`. Removes a new `any` surface flagged by `@typescript-eslint/no-explicit-any` while preserving the existing message-first fallback. |
| 5 | `functions/src/index.ts` (getWorkspaceGenerations) + `functions/src/workspaces/workspacePolicy.ts` (resolveCallerScope) | The membership-proof logic in `getWorkspaceGenerations` duplicated `resolveCallerScope` with a stricter `callerData?.isTeamMember !== true` check vs the truthy `callerData?.isTeamMember &&` check in the policy helper — the two authorization paths had drifted in equality semantics. Refactored `getWorkspaceGenerations` to call `resolveCallerScope(uid)` and compare the resolved `ownerUid` against the workspace's owner. `resolveCallerScope` now also returns `storedWorkspaceAccess: string[]` so the FR-004b override trace can be emitted without re-querying Firestore. The callable's own internal error conversion for unexpected Admin SDK read failures is preserved (rather than inheriting `resolveCallerScope`'s self-scope fallback). Cross-owner reads (A6) are now an explicit `scope.ownerUid !== ownerUid` check that throws structured `permission-denied / reason: cross_owner`. |

## Files changed

| File | Change |
|---|---|
| `src/App.tsx` | Restructured the claimed-member branch so `setUser` + `setTeamResolution('resolved')` execute regardless of `ownerSnap.exists()`. Zero-credits / `'none'` plan fallback when the owner doc is absent. |
| `src/components/WorkspaceSettingsModal.tsx` | `onSave: (data) => void \| Promise<void>` and `onDelete?: (id) => void \| Promise<void>`. |
| `src/components/WorkspaceSwitcher.tsx` | Hoisted `handleGuardCancel` above the useEffect as a `useCallback([onSwitchGuardCancel])`. Added `handleGuardCancel` to the Escape useEffect dep array. |
| `src/lib/projectAutoSave.ts` | `catch (err: unknown)` with `err instanceof Error ? err.message : String(err)`. |
| `functions/src/index.ts` | `getWorkspaceGenerations` now calls `resolveCallerScope(uid)` (newly imported) and compares `scope.ownerUid` to the workspace owner. FR-004b trace uses `scope.storedWorkspaceAccess`. |
| `functions/src/workspaces/workspacePolicy.ts` | `resolveCallerScope` return type extended with `storedWorkspaceAccess: string[]`; both return statements updated. |

## Build & test gate

- `cd functions; npm run build` → **OK**
- `npm run test:teamWorkspaceAccess` → **PASS** (A1–A9 + M1–M7; M2–M5 still assert `refusalReason: 'team_member'`)
- `npm run build` (frontend) → **OK** (122 modules, `built in 17.46s`)
- `build-and-test` CI check (GitHub Actions) → **PASS**

## Items deferred (docs/process polish, not blockers)

The latest CodeRabbit review's prompt-for-all block also lists these, but
they are documentation/process items outside the actionable 1+4 fix scope:

- `specs/965-team-workspace-access/data-model.md:31-35` — Firestore line-refs update.
- `specs/965-team-workspace-access/investigation-notes.md:51-60, 147-151` — Firestore line-refs + deployment-instructions build sequence.
- `specs/965-team-workspace-access/plan.md:102-103` — Phase B callable list including linkMeta/unlinkMeta.
- `specs/965-team-workspace-access/quickstart.md:65-69` — Second cleanup/build/deploy sequence reuse.
- `specs/965-team-workspace-access/spec.md:5-6` — Header/scope clarity around deferred role-based editing.
- `src/App.tsx:7712` — `onSwitchGuardDiscard` autosave-clearing.

Happy to address any of these on request.

## Commit

```text
ec967f8 fix(issue-d): CodeRabbit round 12 - team-member stranded fix + dedup + lint
```

## Files changed count
6 files changed, 96 insertions(+), 70 deletions(-)

## Branch state
- 14 commits on `fix/issue-d-team-workspace-access`
- Pushed to `origin/fix/issue-d-team-workspace-access`
- PR #58 still open, awaiting next CodeRabbit re-review
