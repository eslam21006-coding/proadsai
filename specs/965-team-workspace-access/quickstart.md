# Quickstart — 965-team-workspace-access

Verification matrix for ISSUE-D. Constitution IX requires before/after evidence for every claimed fix,
so each row states what happens **today** as well as what must happen after.

All commands are PowerShell (`;` not `&&`). Functions deploy to `europe-west1`.

## Baseline (before) — captured 2026-07-27 by T001

- `cd D:\proads-worktrees\fix-issue-d\functions; npm run build` → **OK** (`tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/`, exit 0).
- `cd D:\proads-worktrees\fix-issue-d\functions; npm test` → **PASS** — full Node `assert/strict` suite green; final line `contractFixtures.test: PASS`. The 8 phase-14 sub-suites, RAG injection, getTopWinners, phase 20 wiring, and creative-mode / aspect-ratio fixtures all pass.
- `cd D:\proads-worktrees\fix-issue-d; npm run build` → **OK** — `tsc -b && vite build`, `dist/index.html 1.02 kB`, 122 modules transformed, `built in 13.08s`. Vite emits its standard pre-existing chunk-size / dynamic-import warnings — unchanged from before this fix.
- `cd D:\proads-worktrees\fix-issue-d; npm run lint` → **PRE-EXISTING FAIL** (1020 problems, 999 errors, 21 warnings) — none introduced by this fix. Errors live in files not touched by ISSUE-D (`pricing/`, `feedbackService`, `geminiService`, `metaService`, `store.ts`, `modeFieldSchema`, etc.). The fix-touched files (`App.tsx`, `WorkspaceSwitcher.tsx`, `WorkspaceSettingsModal.tsx`, `Team.tsx`, `i18n.tsx`, `workspacePolicy.ts`, the test files) hold the line — any new error in one of these files is a regression and must be cleaned before the batch closes.

## Test accounts needed

| Account | Setup |
|---|---|
| **Owner** | Scale plan, **3 active workspaces** + 1 deleted, saved projects and generated ads in at least two of them |
| **Member-E** | Invited onto Owner, role `editor`, `workspaceAccess` left empty (the default — this is the failing case) |
| **Member-V** | Invited onto Owner, role `viewer` |
| **Solo** | Ordinary owner, not in any team — regression control for SC-007 |

> Do **not** pre-populate `workspaceAccess`. An empty array is what every newly invited member has, and
> it is precisely the state the current build fails on.

## Build and test

```powershell
# Fail fast: any native command with a nonzero exit code stops the chain.
# Each command chain pipes to `if (!$?) { throw "step failed" }`; PowerShell's
# `$?` reflects the success of the previous native command.

function Run-Step {
    param([scriptblock]$Cmd)
    & $Cmd
    if (!$?) { throw "Build/test step failed: $Cmd" }
}

Run-Step { Set-Location -LiteralPath 'D:\proads-worktrees\fix-issue-d\functions'; npm run build }
Run-Step { Set-Location -LiteralPath 'D:\proads-worktrees\fix-issue-d\functions'; npm test }
Run-Step { Set-Location -LiteralPath 'D:\proads-worktrees\fix-issue-d'; npm run build }
Run-Step { Set-Location -LiteralPath 'D:\proads-worktrees\fix-issue-d'; npm run lint }
```

Phase A must be deployed before the frontend checks mean anything:

```powershell
firebase deploy --only functions:getUserProjects,functions:getWorkspaceGenerations,functions:createWorkspace,functions:updateWorkspace,functions:deleteWorkspace,functions:restoreWorkspace
```

## Verification matrix

### US1 — visibility and switching

| # | Action | Today (broken) | Required | Covers |
|---|---|---|---|---|
| 1 | Sign in as Member-E, open the picker | empty, or the member's own list | all **3** active workspaces; deleted one absent | FR-001, FR-002, SC-002 |
| 2 | Check the saved projects in each workspace | **empty — server denies on empty `workspaceAccess`** | the owner's projects appear in each | FR-004a, AS-1.3 |
| 3 | Open generated ads / performance for two workspaces | denied | data scoped to each workspace | SC-009, SC-011 |
| 3a | As Member-E, switch workspaces and check **all four** in turn: saved projects, audience profiles, generated ads, performance data | audience profiles do not re-scope (same ref-in-deps defect at `App.tsx:1977`) | all four re-scope to the selected workspace | FR-006 |
| 4 | Sign in and time to a usable workspace | n/a | ≤ 5 s, no manual selection | FR-005, SC-001 |
| 5 | Hard-refresh repeatedly (10×), watch the picker | may briefly show the member's own account | never shows a non-owner workspace | FR-007, SC-003 |
| 6 | During the first second after sign-in, try to Generate | reachable — **can write to the wrong workspace** | withheld behind a loading state | FR-007a, SC-012 |
| 7 | After 10 sign-ins, inspect `users/{memberUid}/workspaces` | **a workspace has been auto-created** | collection does not exist | FR-013, SC-005 |
| 7a | As Member-E with work in progress (a rendered concept or batch), switch workspace | unreachable — member cannot switch at all | the save / discard / cancel guard appears before the switch | FR-017 |

### US2 — withheld controls

| # | Action | Required | Covers |
|---|---|---|---|
| 8 | Member-E and Member-V open the picker | no create button; no edit pencil on any row | FR-009, FR-010 |
| 9 | Call `deleteWorkspace` directly as Member-E | `permission-denied`, **not** `not-found`; workspace intact | FR-011, SC-004 |
| 10 | Call `createWorkspace` directly as Member-E | `permission-denied`; nothing created under either account | FR-012, SC-005 |
| 11 | Call `updateWorkspace` directly as Member-E | `permission-denied`; details unchanged | FR-011 |
| 12 | Owner opens the team screen | no per-workspace grant/revoke grid | FR-020, AS-2.7 |
| 13 | Owner: invite, change a role, remove a member | all work as before | FR-022 |
| 14 | Inspect a member doc after step 12 | `workspaceAccess` still present and unchanged | FR-021 |

### US3 — live list and revocation

| # | Action | Required | Covers |
|---|---|---|---|
| 15 | Member-E signed in; Owner creates a workspace | appears for the member ≤ 10 s, no reload | FR-008, SC-006 |
| 16 | Owner renames a workspace / changes its colour | updates for the member ≤ 10 s | AS-3.4 |
| 17 | Owner deletes a workspace the member is not using | disappears ≤ 10 s | AS-3.2 |
| 18 | Owner deletes the workspace the member **is** using | member moves to default; told plainly; unsaved work not silently lost | AS-3.3 |
| 19 | Owner removes Member-E while signed in | workspaces clear ≤ 10 s; **no further updates arrive**; overlay shown | FR-016, SC-010 |
| 20 | Watch the browser console during step 19 | no unhandled permission error — listener closed deliberately | FR-016 |

### Owner regression — SC-007 (must be run; the feature must cost the owner nothing)

| # | Action | Required |
|---|---|---|
| 21 | Solo: create, edit, delete, restore a workspace | all succeed exactly as before |
| 22 | Solo: attempt to delete the default workspace | refused, existing message |
| 23 | Solo: switch workspaces, confirm projects/avatars re-scope | unchanged |

### Language — Constitution V

| # | Action | Required | Covers |
|---|---|---|---|
| 24 | Repeat steps 1, 8, 12, 19 with the interface in Arabic | every message in plain Fusha; **no English leaks** | FR-018, SC-008 |
| 25 | Inspect the removal overlay in Arabic | Arabic — today it is **hardcoded English** at `App.tsx:11269-11271` | FR-016a |
| 26 | Search the diff for new `t()` keys | every key present in both `en` and `ar` in `i18n.tsx` | SC-008 |
| 27 | Confirm `workspace.error.no_access` no longer tells anyone to ask the owner for access | retired or rewritten | FR-019a |

### Logging — FR-023, SC-011

| # | Action | Required | Covers |
|---|---|---|---|
| 28 | After steps 9–11, query Cloud Logging for `issue-d ▸ workspace action refused` | one line per refusal, each naming action, caller, and account | FR-023 |
| 29 | Give a member a non-empty `workspaceAccess`, then load a workspace outside it | `issue-d ▸ workspaceAccess ignored (all-access policy)` emitted; access still granted | FR-004b |
| 30 | Confirm the owner sees no new security or audit surface | nothing added to the team screen | FR-024 |

## Gate order

Per project convention, no step may be skipped:

```text
implement → build → test → commit → push → PR → CodeRabbit → Claude audit
→ npm run dev test → merge via GitHub UI → deploy → production test
```

Deploy Phase A + B (functions) **before** production-testing the frontend — the frontend checks in
US1 rows 2 and 3 fail against the old server regardless of how correct the frontend is.
