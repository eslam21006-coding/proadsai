# Batch 3 Report — T031, T032, T034 (and the post-merge gate notes for T033, T035, T036)

> ⚠️ **ARCHIVED — do not follow the commands in this file.**
> Superseded by `tasks.md` T035 and the "Build and test" section of `quickstart.md`.
>
> In particular, the deploy commands below use a selective
> `firebase deploy --only functions:<name>,<name>` list and omit the `functions/lib` wipe. That
> contradicts **`AGENTS.md` rule #1 (FIREBASE LIB SYNC)**, which requires
> `Remove-Item -Recurse -Force functions/lib` → `cd functions; npm run build` →
> `firebase deploy --only functions`. A selective list can silently omit another changed callable,
> and a stale `lib/` deploys compiled output that does not match the branch.
>
> This file is retained for history only. The authoritative sequence lives in `tasks.md` T035.

**Branch**: `965-team-workspace-access` (worktree `D:\proads-worktrees\fix-issue-d`)
**Date**: 2026-07-27

## Tasks completed in this batch

| ID | Title | File(s) | Notes |
|---|---|---|---|
| T031 | Locale parity (SC-008) | `src/i18n.tsx` | Verified all 10 new/changed keys (`workspace.error.no_workspaces`, `workspace.error.no_workspaces_short`, `workspace.error.load_failed`, `workspace.error.load_failed_short`, `workspace.error.retry`, `workspace.refused.owner_only`, `workspace.removed_notice`, `workspace.write_gate.loading`, `team.removed_body`, `team.continue_button`) exist in both the `en` block and the `ar` block. The retired `workspace.error.no_access` is left defined (cross-reference only) in both locales — no user-facing code reads it after T014. |
| T032 | User-facing wording guard | (test) | `cd functions; npm run test:lang` → PASS. Every Spec 008 contract test green. The new strings are short, plain, dialect-free, and contain no forbidden technical terms. |
| T034 | ISSUE-D row in LAUNCH_MATRIX | `docs/LAUNCH_MATRIX.md:2501` | Updated to **Resolved by `965-team-workspace-access`**. Notes the role-based editing split to a follow-up spec per the 2026-07-27 clarification, and points the next reader at `specs/965-team-workspace-access/quickstart.md`. |

## Tasks remaining (post-merge gate, not in local-build scope)

| ID | Title | Why deferred |
|---|---|---|
| T033 | Execute the 30-row verification matrix | Manual exercise against `npm run dev` with two test accounts (Owner + Member-E, Member-V). Live sign-in + workspace flow cannot be tested from the build agent. Per `quickstart.md`, the matrix is to be run by the operator once the dev server is up. |
| T035 | Deploy changed callables to `europe-west1` | Project gate order: **deploy happens after merge via GitHub UI**. The command is recorded in `quickstart.md` and the AGENTS.md critical rule for redeploying (`Remove-Item -Recurse -Force functions/lib` then `cd functions && npm run build`) is followed by `firebase deploy --only functions`. |
| T036 | Production-test rows 1–3, 3a, 9–10, 19, and 28–29 | Requires T035. Rows 28–29 specifically check the FR-023 / FR-004b log lines (`issue-d ▸ workspace action refused …` and `issue-d ▸ workspaceAccess ignored …`) are emitted to Cloud Logging with the expected shape — this is only verifiable against the deployed build. |

## Final local-build gate

- `cd functions; npm run build` → OK
- `cd functions; npm test` → PASS (all 30+ suites; new `teamWorkspaceAccess.test.ts` and the inverted `savedProjects.getUserProjects.test.ts` are wired into the main `test` script)
- `cd functions; npm run test:lang` → PASS (T032)
- `npm run build` (frontend) → OK
- Pre-existing lint failures unchanged from baseline (T001); no new errors introduced by this fix.

## Operator handoff (in priority order)

1. **Commit and push the branch** (commit message must call out the deliberate `getUserProjects` contract inversion per `tasks.md` notes; T009).
2. **Open the PR** — `tasks.md` notes are the source of truth for the reviewer.
3. **CodeRabbit + Claude audit** — the CLAUDE-AUDIT scope is the full diff and the three batch reports (`batch-1-report.md`, `batch-2-report.md`, this file).
4. **Merge via GitHub UI** (operator-driven per the project gate order).
5. **Post-merge redeploy** (T035): `cd functions; Remove-Item -Recurse -Force lib; npm run build; firebase deploy --only functions`.
6. **Production test** (T036): execute rows 1–3, 3a, 9–10, 19, 28–29 of `specs/965-team-workspace-access/quickstart.md` against the deployed build. Rows 28–29 confirm the refusal and override log lines appear in Cloud Logging with the expected shape — the format is unverifiable before deploy and SC-011 depends on it being queryable in production.
