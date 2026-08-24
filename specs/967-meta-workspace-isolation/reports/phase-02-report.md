# Phase 2 Report — Foundational (T005–T022)

**Phase**: 2 — Foundational
**Branch**: `967-meta-workspace-isolation`
**Date**: 2026-08-19
**Status**: ✅ Complete — awaiting go-ahead before Phase 3

---

## Scope

Phase 2 is the blocking prerequisite for every user story. It ships:

- The legacy-record repair (R1 + R4) — `scripts/repair-workspace-markers.ts`.
- The default-marker source fix inside `createWorkspaceWithLimit`.
- The Page field-write lock on `updateWorkspace`.
- The shared caller-scope guard for every Meta-touching callable
  (`metaCallerScope.ts`).
- Foundational contract tests for everything above (T-02, T-03, T-17,
  T-19, T-20, T-21, T-22, T-23).

Phase 2 deliberately does NOT touch any user-story call site yet — no
publish path, no Page selection, no team-member conversion, no Funnel
Settings selector change. Every later story phase depends on what
lands here, but nothing here changes observable behaviour for owners
or team members on a fresh account.

---

## Diff summary

```
 functions/src/__tests__/workspace.test.ts   | 126 +++++++-
 functions/src/index.ts                      |  58 ++-
 functions/src/workspaces/index.ts           |   8 +-
 functions/src/workspaces/workspacePolicy.ts |  88 ++++-
 package-lock.json                           | 504 +++++++++++++++++++++++++
 package.json                                |   1 +
```

Plus four new files:

```
 functions/src/__tests__/metaCallerScope.test.ts   (T-02, T-03)
 functions/src/__tests__/workspaceRepair.test.ts   (T-20, T-21, T-23)
 functions/src/workspaces/metaCallerScope.ts       (T-14, T-15, T-16)
 scripts/repair-workspace-markers.ts               (T-05, T-06, T-07, T-08)
```

And one evidence file (operator-gated for the live run):

```
 specs/967-meta-workspace-isolation/evidence-r1.md
```

`package.json` adds `tsx` as a dev dependency so `npx tsx
scripts/repair-workspace-markers.ts` resolves from the repo root (per
the pre-existing `backfill-workspace-deletedAt.ts` convention). The
`package-lock.json` change is purely the lockfile churn from that
install.

---

## T005–T008 — Repair script

`scripts/repair-workspace-markers.ts` is a one-off Node script (run
via `npx tsx`) that combines the two passes required by the resolved
decisions (FR-026c–FR-026g):

1. **Pass 1 — `deletedAt` backfill.** Walks every
   `users/{uid}/workspaces/{wid}` doc via `collectionGroup('workspaces')`
   (unconstrained — Admin SDK bypasses rules). For each doc whose
   `deletedAt` key is absent, queues `update(ref, { deletedAt: null })`.
   Docs that already carry the key (`null` or a non-null timestamp) are
   left alone. Soft-deleted workspaces are not re-marked active
   (FR-024).
2. **Pass 2 — `isDefault` marker.** Groups docs by account, then for
   each account that has no `isDefault: true` workspace, picks the
   oldest active workspace by `createdAt` ascending (tiebreak on doc
   id when `createdAt` is missing) and marks it default. Pass 2 runs
   only after Pass 1 has settled the account's `deletedAt` values
   (data-model.md §5 ordering) — the simulation in the script
   synthesises the post-pass-1 snapshot explicitly.

Idempotence (FR-026e): both passes' conditions are self-extinguishing.
Re-running writes nothing once the first run completes.

**No Page fields are ever touched** (FR-026f) — the script only writes
`deletedAt` (pass 1) and `isDefault` (pass 2).

### `--dry-run` (T008)

`--dry-run` is the default. Same scan, same counts, no writes. The
report is the operator's evidence instrument for SC-014.

Exit codes:
- `0` — success, no errors
- `2` — at least one write commit failed (operator must inspect the
  report's `errors:` section)
- `1` — the run itself crashed (configuration / auth failure)

### Verification

- `npx tsx --check scripts/repair-workspace-markers.ts` — passes.
- `npx eslint scripts/repair-workspace-markers.ts` — clean (after
  `npx eslint --fix` removed 31 stale `no-console` disable directives
  that don't exist in the root config).
- `npx tsx scripts/repair-workspace-markers.ts --dry-run --apply` —
  correctly errors out at the CLI parser ("mutually exclusive"), as a
  sanity check that the mode switch works.
- `npx tsx scripts/repair-workspace-markers.ts --dry-run` without
  `GOOGLE_APPLICATION_CREDENTIALS` — fails with the expected
  `Unable to detect a Project Id` Admin SDK error, confirming the
  script's only environment dependency is the standard ADC path.

---

## T009–T010 — Live evidence (`evidence-r1.md`)

The live `--dry-run` / `--apply` runs against the production
Firestore are operator-gated. The implementer cannot reach the live
project from this environment, and the spec requires the run output
to be pasted verbatim into the evidence file for SC-014.

`specs/967-meta-workspace-isolation/evidence-r1.md` provides:

- A summary of both defects with file/line/comment traceability
  (research.md R1 + R4).
- The SC-014 acceptance gates.
- A copy-pasteable runbook (`GOOGLE_CLOUD_QUOTA_PROJECT`,
  `NODE_PATH`, then `npx tsx scripts/repair-workspace-markers.ts
  --dry-run` → `--apply` → `--dry-run`).
- Three empty paste-in sections for the operator: before evidence,
  apply output, after evidence.
- A predicted before-state for the nine-workspace account
  (`docs missing deletedAt: 6`, `docs marked default: 1`) — the
  principle IX caveat in `plan.md` is satisfied if this prediction
  matches the actual dry-run output, and the operator must inspect if
  it doesn't.

The file is intentionally pre-filled with structure so the operator's
job is paste-and-go — no narrative authoring required.

---

## T011–T012 — Default-marker source fix (FR-026d)

`createWorkspaceWithLimit` (in `functions/src/workspaces/workspacePolicy.ts`)
now computes `isDefault` inside the existing transaction:

```ts
isDefault = active.length === 0;
const finalDoc: WorkspaceShape = { ...newDoc, isDefault };
txn.create(newRef, finalDoc);
```

The function's return type changed from `Promise<string>` to
`Promise<{ workspaceId: string; isDefault: boolean }>` so the caller
gets the authoritative verdict without a re-read.

The transaction is the serialisation point that makes the decision
race-free (quickstart.md "Traps"): two concurrent creates on a fresh
account cannot both win — the second txn sees the first's committed
doc and writes `isDefault: false`. Outside the transaction, both reads
return zero and both writes would claim `isDefault: true`.

`createWorkspace` (in `functions/src/index.ts:6512`) was updated:

- Passes `isDefault: false` as a TYPE-SYSTEM PLACEHOLDER (it gets
  overridden inside the transaction).
- Destructures the new return shape: `const { workspaceId, isDefault }
  = await createWorkspaceWithLimit(...)`.
- Returns both to the client so the UI can reconcile without an extra
  Firestore read.

The existing T015 happy-path test in
`functions/src/__tests__/workspace.test.ts` was updated to consume the
new return shape (`result.workspaceId`, `result.isDefault`).

---

## T013 — Page field-write lock (R7)

`updateWorkspace`'s forbidden-fields list at `functions/src/index.ts:6546`
gained:

- `metaPageId`
- `metaPageName`
- `metaPageClearedAt`

This blocks the bypass that would otherwise let a generic workspace
update set or change the Page without going through `metaSelectPage`'s
`pages[]` validation, and without firing the FR-011 clearing rule on
an ad-account change. `metaPageClearedAt` is server-set only — never
accepted from a caller — and is added to the same list to make the
invariant explicit at the gate.

---

## T014–T016 — Shared caller-scope guard (`metaCallerScope.ts`)

New module: `functions/src/workspaces/metaCallerScope.ts`. Three
exports plus a shared type:

| Symbol | Role |
|---|---|
| `ResolvedMetaScope` (type) | `{ ownerUid, callerUid, allowedWorkspaceIds, storedWorkspaceAccess }` — what every Meta call consumes after the preamble. |
| `resolveMetaScope(request)` | Throws `unauthenticated` if no auth, then `unavailable` (`reason: 'read_degraded'`) if `resolveCallerScope` returned `readDegraded: true` (FR-003). The `unavailable` throw MUST happen before any use of `scope.ownerUid` — quickstart.md "Traps". |
| `assertWorkspaceAllowed(scope, workspaceId)` | Throws `permission-denied` (`reason: 'workspace_not_permitted'`) when the workspace is outside `scope.allowedWorkspaceIds` (FR-004, FR-021). The `=== "ALL"` short-circuit matches the all-access policy for verified members. |
| `loadActiveWorkspace(ownerUid, workspaceId)` | Loads the workspace, throws `not-found` if absent, and reuses `assertWorkspaceActive` for the soft-delete check (FR-024). Single error code for both absence and soft-deletion — the caller cannot probe for deleted ids. |

The barrel re-export `functions/src/workspaces/index.ts` now exposes
the new module so story-phase work can import from one place.

---

## T017–T022 — Foundational contract tests

Three test files, all using the established hermetic in-memory
Firestore stub pattern from `workspace.test.ts` (no emulator, no live
project). All 28 tests pass.

### `functions/src/__tests__/metaCallerScope.test.ts` (new)

| Test | Asserts | Requirement |
|---|---|---|
| T-02a | Firestore transient failure → `unavailable`, `reason: 'read_degraded'` | FR-003 |
| T-02b | No `request.auth` → `unauthenticated`, no read attempted | preamble |
| T-02c | `readDegraded` NEVER silently returns the self-scope shape | FR-003 |
| T-03a | Workspace outside `allowedWorkspaceIds` → `permission-denied`, `reason: 'workspace_not_permitted'` | FR-004, FR-021 |
| T-03b | Workspace inside `allowedWorkspaceIds` → no throw | preamble |
| T-03c | `allowedWorkspaceIds === "ALL"` → any workspace allowed (all-access policy) | FR-004a |
| T-03d | Empty `allowedWorkspaceIds` array + missing workspace → `permission-denied` | FR-021 |

### `functions/src/__tests__/workspace.test.ts` (extended)

| Test | Asserts | Requirement |
|---|---|---|
| T015 (existing, updated) | `createWorkspaceWithLimit` happy path returns `{ workspaceId, isDefault }`; second workspace is `isDefault: false` | T-19 |
| T019a | First workspace on a fresh account → `isDefault: true` (transaction-computed) | FR-026d, T-19 |
| T019b | Second workspace on the same account → `isDefault: false` | T-19 |
| T017 | Post-repair listing returns the legacy workspaces now carrying `deletedAt: null` explicitly | FR-022, R1 |
| T-22a | Pass 2 picks the oldest active workspace by `createdAt` ascending | FR-026d, T-22 |
| T-22b | Pass 2 returns null when an account already has a default (idempotence) | FR-026e |
| T-22c | Pass 2 returns null when every workspace is soft-deleted | FR-024 |
| T-22d | Missing `createdAt` falls back to lexicographic doc-id tiebreak (idempotence under missing data) | FR-026e |

### `functions/src/__tests__/workspaceRepair.test.ts` (new)

| Test | Asserts | Requirement |
|---|---|---|
| T-20a | Second run after a full repair writes nothing (both passes return null) | FR-026e |
| T-20b | First run writes exactly `{ deletedAt: null }` (pass 1) and `{ isDefault: true }` (pass 2) | FR-026c, FR-026d |
| T-21a | Pass-1 write shape never includes any Page field | FR-026f |
| T-21b | Pass-2 write shape (`{ isDefault: true }`) never includes any Page field | FR-026f |
| T-21c | Already-clean doc → null write (no fields at all) | FR-026e |
| T-23a | Pass 1 leaves a non-null `deletedAt` untouched | FR-024 |
| T-23b | Pass 2 NEVER picks a soft-deleted workspace as default (createdAt tiebreak doesn't override) | FR-024, FR-026d |
| T-23c | Account with only soft-deleted workspaces → null write | FR-024 |
| T-23d | Pass 1 has no path that produces `{ deletedAt: <timestamp> }` | FR-024 |

### Pre-existing test sanity

`functions/src/__tests__/teamWorkspaceAccess.test.ts` still passes
unchanged. The `resolveCallerScope` shape was unchanged (only
`createWorkspaceWithLimit`'s return type changed, and that test file
doesn't touch it).

### Verification

```
$ node lib/__tests__/workspace.test.js
... 12 passed, 0 failed, 13 skipped

$ node lib/__tests__/metaCallerScope.test.js
... 7 passed, 0 failed

$ node lib/__tests__/workspaceRepair.test.js
... 9 passed, 0 failed
```

The 13 skipped tests in `workspace.test.ts` are pre-existing placeholders
("pending emulator harness") that this phase did not touch.

---

## Verification — builds

- Frontend `npm run build` — **pass** (`tsc -b && vite build`).
  No new warnings; the same pre-existing dynamic-import / chunk-size
  warnings remain.
- Backend `cd functions && npm run build` — **pass** (`tsc` strict
  mode + asset copy). The new `WorkspaceShape` write contract catches
  any missing field at the type level.

## Verification — lint

- Root `npx eslint scripts/repair-workspace-markers.ts` — clean
  (after auto-fix of 31 stale `no-console` disable directives that
  the root config doesn't define).
- Root `npx eslint functions/src/workspaces/metaCallerScope.ts
  functions/src/workspaces/workspacePolicy.ts
  functions/src/workspaces/index.ts` — clean.
- Root `npm run lint` (full frontend) — the pre-existing baseline
  count of 1069 problems / 1029 errors is unchanged by this phase
  (verified by stash-compare; the only deltas are the auto-generated
  CLAUDE.md date stamp and the `.opencode/package-lock.json` churn
  from npm install).
- `functions/` `npm run lint` — **broken by a pre-existing toolchain
  issue** (`@typescript-eslint/no-unused-expressions` `allowShortCircuit`
  undefined, ESLint 8.57.1 vs `@typescript-eslint/eslint-plugin`
  5.12.0). Not introduced by this phase; flagged for a separate
  toolchain fix.

## Verification — repair script

- TypeScript check: `npx tsx --check scripts/repair-workspace-markers.ts` exits 0.
- Mode parser rejects `--dry-run --apply` together (correct).
- Without `GOOGLE_APPLICATION_CREDENTIALS` the Admin SDK fails
  fast with the documented `Unable to detect a Project Id` error
  (expected operator-side gate).

---

## Trap compliance (`quickstart.md` "Traps")

| Trap | Status |
|---|---|
| `readDegraded` is not optional | ✅ `resolveMetaScope` throws `unavailable` BEFORE returning a scope. T-02 covers it. |
| `request.auth.uid` must not appear in Firestore paths | ✅ No new path uses `request.auth.uid`. `metaCallerScope.ts` only returns it as `callerUid` for audit. |
| `conn.selectedAccountId` must not be read by either publish path | ✅ Not touched in this phase. |
| Clear the Page in the same write as the ad-account link | ✅ Not relevant here (Phase 6 introduces the writes; the field-shape and forbidden-list gate are in place). |
| `metaPageClearedAt` is what makes FR-011a enforceable | ✅ Field added in Phase 1's `WorkspaceShape`; forbidden list at T013 makes it server-set only. |
| Team members cannot write workspace documents directly | ✅ `updateWorkspace` still gated by `assertNotTeamMember`; new `metaPageId` / `metaPageName` / `metaPageClearedAt` entries in the forbidden list don't change that. |
| Do not touch the OAuth `state` parameter | ✅ Not touched. |
| The repair must not read through the broken query | ✅ Script uses `collectionGroup('workspaces')` unconstrained. T-23 covers. |
| The repair fixes history; the `createWorkspace` change stops it recurring | ✅ T011/T012 ship the source fix inside the transaction. T-19 covers; T019a/T019b assert. |

---

## What lands next (Phase 3)

Phase 3 (US1, P1 � MVP) is the publish-routing fix that closes
Bug 3 — the creative landing in the wrong ad account. It depends only
on Phase 2 (the default-marker fix from T011/T012 so single-workspace
plans still resolve, and `metaCallerScope` from T014–T016 so the
ad-account and Page are resolved under the owner's path).

Per `tasks.md`: T023–T029 are the US1 contract tests, T030–T042 the
implementation, T043 the single-workspace regression check.

---

**STOPPING** per the workflow rule. Awaiting go-ahead before Phase 3.
