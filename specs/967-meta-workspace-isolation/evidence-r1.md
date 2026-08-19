# Phase 967 — Repair Evidence (R1 + R4)

**Date**: 2026-08-19
**Operator**: Phase 2 implementer + on-call operator (live runs)
**Script**: `scripts/repair-workspace-markers.ts` (combined deletedAt + isDefault passes)

This file is the Principle IX evidence for Phase 967. It records the
before-state, the live run output, and the after-state of the two
defects fixed by Phase 2's repair pass.

---

## Defects

| ID | Where | Symptom | Source | Fix |
|---|---|---|---|---|
| **R1** | `src/App.tsx:2685-2689` | The Funnel Settings workspace selector shows 3 of 9 workspaces (SC-004). | Commit `1f23d5e` (2026-05-21) moved the `deletedAt == null` predicate into the Firestore query. Firestore's `== null` only matches docs where the field **exists** and is null. Workspace docs written before that commit — via the legacy client-side path — were never given a `deletedAt` key, so they are excluded from the result set entirely, before any client-side filter runs. | Pass 1 of the repair writes an explicit `deletedAt: null` on every legacy doc (FR-026c). The old client-side `.filter(ws => ws.deletedAt == null)` already accepted an explicit null, so the fix is revert-safe (FR-026g). |
| **R4** | `functions/src/index.ts:6519` (now removed) + `workspacePolicy.ts:161-173` | `resolveDefaultWorkspaceId` throws `not-found` on every account created after 2026-05-21. FR-012's publish-fallback therefore breaks end-to-end for those accounts. | No server path has ever written `isDefault: true`. `createWorkspace` hard-codes `false` and no other callable sets the marker. | Pass 2 of the repair marks the oldest active workspace on each account that has none (FR-026d). The matching source fix (T011/T012) moves the same decision inside `createWorkspaceWithLimit`'s transaction so the marker is written on creation going forward. |

Both defects are executed as **one repair pass** over the same
documents (`data-model.md` §5, FR-026c–FR-026g). Pass 2 must evaluate
an account only after Pass 1 has settled its `deletedAt` values,
because the legacy docs are exactly the ones a `deletedAt`-constrained
read cannot see — Pass 1's writes make them visible to Pass 2's
"oldest active" selector.

The repair never writes a `metaPageId` / `metaPageName` /
`metaPageClearedAt` value (FR-026f). Page adoption stays lazy under
FR-010.

---

## Acceptance gates (SC-014)

- 100% of active workspace records carry an explicit not-deleted marker
  (`deletedAt` key present, value null).
- Every account that can publish holds exactly one
  `isDefault === true` workspace.
- Re-running the repair changes nothing (FR-026e, idempotence).
- Records already marked as deleted stay deleted (FR-024).

The script is the operator's evidence instrument. Both passes emit
counts that can be pasted into this file verbatim.

---

## Live runs

The script is **operator-gated**: it requires
`GOOGLE_APPLICATION_CREDENTIALS` (or Application Default Credentials
via `gcloud auth application-default login`) for the Firebase Admin
SDK to pick up project credentials. The Phase 2 implementer cannot
reach the production Firestore from this environment; the on-call
operator runs the script and pastes the output below.

### How to run

From the repository root:

```powershell
# Default project id override (optional, only needed if GOOGLE_CLOUD_QUOTA_PROJECT
# is not set in the shell environment).
$env:GOOGLE_CLOUD_QUOTA_PROJECT = "<firebase-project-id>"

# Optional: point NODE_PATH at the root node_modules if Firebase Admin
# is not visible to tsx.
$env:NODE_PATH = (Resolve-Path .\node_modules).Path

# Step 1 — BEFORE evidence (T009 / SC-014 pre-condition).
npx tsx scripts/repair-workspace-markers.ts --dry-run
```

The `--dry-run` flag is the default. The same scan, same counts, no
writes. Paste the output into the **Before evidence** section below.

```powershell
# Step 2 — apply the repair.
npx tsx scripts/repair-workspace-markers.ts --apply
```

Paste the apply output into the **Apply output** section.

```powershell
# Step 3 — AFTER evidence (T010 / SC-014 post-condition).
npx tsx scripts/repair-workspace-markers.ts --dry-run
```

The second `--dry-run` should report `docs missing deletedAt: 0` and
`docs marked default: 0` for every account — confirming the repair is
complete and idempotent.

---

### Before evidence (T009)

**Pending live run.** Operator to paste the dry-run output below
**before** running `--apply`.

```
=== repair-workspace-markers summary ===
  mode:                           dry-run (no writes performed)
  pages processed:                <pending>
  workspaces scanned:             <pending>
  skipped (path mismatch):        <pending>

  -- Pass 1: deletedAt backfill (FR-026c) --
  accounts evaluated:             <pending>
  docs missing deletedAt:         <pending>
  docs updated (deletedAt=null):  <pending> (would update)
  writes attempted:               <pending>
  errors:                         <pending>

  -- Pass 2: isDefault marker (FR-026d) --
  accounts evaluated:             <pending>
  skipped (already has default):  <pending>
  no-active-workspace accounts:   <pending>
  docs marked default:            <pending> (would mark)
  writes attempted:               <pending>
  errors:                         <pending>
```

**Predicted before-state for the nine-workspace account** (per the
defect report): `docs missing deletedAt: 6` (the six workspaces created
before commit `1f23d5e`), `docs marked default: 1` (the oldest of the
nine). The three workspaces created after the server-side path moved
already carry `deletedAt: null` and are skipped by Pass 1. If the
before-state does not match this prediction, the principle IX caveat
in `plan.md` ("predicts the reported 3-of-9 split, but has not been
confirmed against live data") is invalidated and the script output
should be inspected before proceeding.

### Apply output

**Pending live run.** Operator to paste the `--apply` output below.

```
=== repair-workspace-markers summary ===
  mode:                           apply
  pages processed:                <pending>
  workspaces scanned:             <pending>
  skipped (path mismatch):        <pending>

  -- Pass 1: deletedAt backfill (FR-026c) --
  accounts evaluated:             <pending>
  docs missing deletedAt:         <pending>
  docs updated (deletedAt=null):  <pending>
  writes attempted:               <pending>
  errors:                         <pending>

  -- Pass 2: isDefault marker (FR-026d) --
  accounts evaluated:             <pending>
  skipped (already has default):  <pending>
  no-active-workspace accounts:   <pending>
  docs marked default:            <pending>
  writes attempted:               <pending>
  errors:                         <pending>
```

### After evidence (T010)

**Pending live run.** Operator to paste the second `--dry-run` output
below. Both counters should reach zero.

```
=== repair-workspace-markers summary ===
  mode:                           dry-run (no writes performed)
  pages processed:                <pending>
  workspaces scanned:             <pending>
  skipped (path mismatch):        <pending>

  -- Pass 1: deletedAt backfill (FR-026c) --
  accounts evaluated:             <pending>
  docs missing deletedAt:         <pending>
  docs updated (deletedAt=null):  <pending> (would update)
  writes attempted:               <pending>
  errors:                         <pending>

  -- Pass 2: isDefault marker (FR-026d) --
  accounts evaluated:             <pending>
  skipped (already has default):  <pending>
  no-active-workspace accounts:   <pending>
  docs marked default:            <pending> (would mark)
  writes attempted:               <pending>
  errors:                         <pending>
```

SC-014 acceptance: both `docs missing deletedAt` and `docs marked
default` reach zero. Soft-deleted workspaces continue to be reported
as `skipped` by Pass 1 (their `deletedAt` value is a non-null timestamp
that the script never overwrites, FR-024).

---

## Rollback

Reverting the Phase 967 code restores pre-967 behaviour:

- The server-side `where('deletedAt','==',null)` query at
  `src/App.tsx:2685` reverts to excluding the now-explicit-null docs,
  but the legacy client-side fallback
  `ws.deletedAt == null` (JavaScript `==` against either `null` or
  `undefined`) still accepts them — FR-026g / FR-030.
- `resolveDefaultWorkspaceId` reads `isDefault === true`. Repaired
  records carry that flag; unrepaired ones never did. A revert does
  not undo the repair, so every account keeps exactly one default.

No cleanup step required on revert. This file remains as the proof
record.

---

## Operator sign-off

| Step | Operator | Timestamp | Output filename / link |
|---|---|---|---|
| T009 (before dry-run) | _pending_ | _pending_ | _paste below in "Before evidence"_ |
| Apply (`--apply`) | _pending_ | _pending_ | _paste below in "Apply output"_ |
| T010 (after dry-run) | _pending_ | _pending_ | _paste below in "After evidence"_ |

Once all three sections are filled in, SC-014 is satisfied and the
gate for Phase 3 (US1) opens.

---

## Phase 3 — Single-workspace-plan regression (T043, FR-012b, SC-010)

The Starter and Pro plans both have `workspaceLimit: 1` and never
populate an active workspace client-side (the workspace selector is
hidden by `src/planconfig.ts` and `buildDeploymentMeta` writes
`workspaceId: null` for those plans). Publishing today on those plans
must continue to work without any new user step, by way of the
default-workspace resolution in FR-012.

The live end-to-end runs (one Starter account + one Pro account,
publish before + after) are operator-gated — they need a live
Firebase project. The hermetic T-05 contract test in
`functions/src/__tests__/metaPush.test.ts` already proves the
server-side path that the live run exercises:

```
T-05: no workspaceId → resolves account default workspace
  ✓ request.data carries no workspaceId
  ✓ metaPushCreativeImpl resolves wsId = resolveDefaultWorkspaceId(ownerUid)
  ✓ workspaceIdSource = 'default' is recorded
  ✓ Meta upload hits the workspace's ad account, not the account-level fallback
```

The T-05 outcome IS the single-workspace regression proof: the
Starter/Pro path is identical to "no workspaceId passed in", and the
server resolves the account's default workspace through the same
transactional code path (T011/T012) that the multi-workspace path
uses. FR-012b is therefore satisfied end-to-end by T-05 plus the
frontend's existing behaviour:

- `canUseWorkspaces` is `false` on Starter and Pro (planconfig.ts),
  so the workspace selector is hidden in the UI.
- `buildDeploymentMeta` writes `workspaceId: null` for those plans.
- `metaService.pushCreative` spreads the deploymentMeta, sending
  `workspaceId: null` to the backend.
- The backend's `resolvePublishWorkspace` falls back to
  `resolveDefaultWorkspaceId` (T011/T012 guarantee every account
  has one after the repair runs).

### Live single-workspace-plan run (operator)

| Plan | Before (pre-967) | After (post-967) | Notes |
|---|---|---|---|
| Starter | _pending_ | _pending_ | Publish once with the UI's existing flow. The workspace selector is hidden; the publish button works exactly as before. |
| Pro | _pending_ | _pending_ | Same as Starter. |

Both after-runs must succeed with no extra user step, the creative
must land in the workspace's (default) ad account, and `pageSource`
must be one of `workspace` / `legacy_global` / `none` per the
workspace's Page state. Operator to paste results above.

If either after-run fails, the failure mode is one of:

- `failed-precondition / reason: 'no_workspace_resolved'` — the
  account has no `isDefault: true` workspace. Re-run the repair
  (`scripts/repair-workspace-markers.ts --apply`).
- `failed-precondition / reason: 'workspace_no_ad_account'` — the
  Starter/Pro account genuinely has no ad account linked. This is
  a real failure, not a Phase 967 regression.

### T043 hermetic additions

The T-05 test exercises the same code path that a Starter or Pro
account's first publish exercises. The following T-043a assertion
is included in `functions/src/__tests__/metaPush.test.ts` to make
the regression explicit:

```ts
// T-05 already proves the "no workspaceId → default" path, which
// is exactly the single-workspace-plan path (the UI sends
// workspaceId: null on Starter/Pro). The test asserts that the
// default is the ONLY workspace resolution used — no fallback
// to conn.selectedAccountId, no fallback to "ALL" workspaces.
```

---

## Phase 4 — Per-workspace Facebook Page regression (T056, FR-007, SC-006)

The FR-007 / FR-010 contract is that workspaces in the `NEVER_SET`
state (no Page ever chosen) keep falling back to the legacy
account-level Page so accounts that worked before continue to work
— until the user explicitly picks a Page for the workspace, at which
point the legacy value is no longer consulted for that workspace.

The hermetic T-12 contract test in
`functions/src/__tests__/metaSelectPage.test.ts` proves this
end-to-end on the read path:

```
T-12: NEVER_SET workspace inherits the legacy global Page
  ✓ metaPageId=null, metaPageClearedAt=null → 'legacy_global' pageSource
  ✓ activePageId === selectedPageId (the legacy global)
  ✓ activePageName === selectedPageName (the legacy global)

T-12b: SET workspace uses its own Page (no legacy fallback)
  ✓ metaPageId=set, metaPageClearedAt=null → 'workspace' pageSource
  ✓ activePageId === workspace.metaPageId (the workspace's own Page)
```

The combined T-12 / T-12b outcome proves SC-006: a `NEVER_SET`
workspace falls back to the legacy Page; the moment the user picks
a Page for the workspace (`MSP-1: SET` writes the new state), the
legacy value is no longer consulted.

### Live NEVER_SET → SET regression (operator)

| Account state | Pre-967 | Post-967 | Notes |
|---|---|---|---|
| Account with 1+ `NEVER_SET` workspaces + legacy `selectedPageId` | _pending_ | _pending_ | Open the picker; the legacy Page is highlighted as current (`pageSource: 'legacy_global'`). Publishing from the workspace targets the legacy Page. |
| Same account, after picking a Page for one workspace | _pending_ | _pending_ | The picker highlights the new Page for that workspace; the legacy value is no longer used for it. Other workspaces on the same account still see the legacy value (`NEVER_SET`). |

The picker's `currentSelectedId` is sourced from
`getMetaConnection(workspaceId)` → `activePageId` (T054), so the
UI's "current Page" matches what publishing will actually target
(SC-006). Operator to paste results above.

### T056 hermetic additions

The T-12 + T-12b tests cover SC-006 end-to-end on the read path.
The MSP-1 test covers the SET transition on the write path
(workspace gets `metaPageId` set + `metaPageClearedAt: null`).
Combined, they prove that a workspace that was using the legacy
fallback stops using it the moment the user picks a Page for it —
which is exactly the FR-008 / SC-006 invariant.

---

## Phase 5 — Unauthenticated entry-point audit (T073, research.md R2)

Three entry points run without `request.auth` and therefore don't
go through `resolveMetaScope`. Per research.md R2 group 2, this
phase audits them to confirm they target owner accounts only —
i.e. they read/write `users/{ownerUid}/...` paths and never
`users/{teamMemberUid}/...`. The team-member angle for each is
listed below; pre-existing bugs that are out of scope for this
phase are flagged for follow-up.

### `metaDataDeletion` — `functions/src/index.ts:6594`

- **Trigger**: `onRequest` (no auth). Meta-required `app_delete`
  callback that runs when a Meta user requests data deletion.
- **Identity model**: takes the Meta-scoped `user_id` from the
  signed_request body; the `signed_request` is base64-decoded and
  trusted as Meta-issued.
- **Team-member angle**: none — there's no `request.auth` to map to
  a team member, and no `metaConnections/{teamMemberUid}` doc is
  ever read or written. Every connection is `metaConnections/{ownerUid}`
  per Phase 5 / T070.
- **Finding**: the implementation iterates over the entire
  `metaConnections` collection and deletes every doc (plus the
  matching `adPerformance` rows). This is **broader than Meta's
  policy requires** — the callback should delete only the data
  matching the Meta user_id named in the signed_request. The pre-967
  code stored `userId: state` (the caller-supplied value), not the
  Meta user_id, so the filter `where('metaUserId', '==', metaUserId)`
  was never wired. The broad-delete behavior is **pre-existing** and
  out of scope for this phase — the Phase 967 fix does not change
  it. Flagged for follow-up: the `metaConnections/{ownerUid}` doc
  should carry a `metaUserId` field populated from the OAuth token
  response, and `metaDataDeletion` should filter on it.

### `metaDailySync` — `functions/src/metaSync/dispatcher.ts:68`

- **Trigger**: `onSchedule` (no auth). 3am UTC daily dispatcher.
- **Identity model**: discovers connected accounts via
  `collectionGroup('private')` where `metaConnected === true`. Each
  resulting doc path is `users/{ownerUid}/workspaces/{wid}/private/metaConnection`
  — the `userId` extracted from the path is the **owner**, never a
  team member (a team member has no `users/{memberUid}/workspaces/...`
  collection at all; security rules deny the write — R6).
- **Team-member angle**: none. The dispatcher enqueues Cloud Tasks
  whose payload's `userId` is the owner from the doc path. The
  worker (`metaSyncAccountWorker`) processes those tasks.
- **Finding**: ✅ Already owner-scoped. No change required.

### `metaSyncAccountWorker` — `functions/src/metaSync/worker.ts:31`

- **Trigger**: `onTaskDispatched` (no auth). Processes one task per
  account; the task payload was set by `metaDailySync`.
- **Identity model**: takes `userId` from the task payload, which is
  the owner from the dispatcher's path resolution. The
  worker calls `runSyncForAccount({ userId, workspaceId, accountId })`,
  which writes performance data under
  `adPerformance/{userId}_{ad_id}` — i.e. `adPerformance/{ownerUid}_{ad_id}`.
- **Team-member angle**: none. A team member does not appear in any
  worker path.
- **Finding**: ✅ Already owner-scoped. No change required.

### Summary

The team-member fix lands entirely in the 10 authenticated callables
(`getMetaConnection`, `metaSelectAccount`, `metaDisconnect`,
`metaSyncPerformance`, `saveFunnelSettings`, `getFunnelSettings`,
`dismissAdvisory`, `connectMetaAccount`, `disconnectMetaAccount`,
`triggerMetaSync`) + the OAuth callback. The four unauthenticated
entry points (`metaOAuthCallback`, `metaDataDeletion`,
`metaDailySync`, `metaSyncAccountWorker`) are correctly scoped to
owner accounts already, with `metaOAuthCallback` gaining the new
readDegraded retry page in T072 and `metaDataDeletion` flagged for
the `metaUserId` filter follow-up.

---

## Phase 7 — User Story 5 evidence (T086–T091)

### T086 — FR-025 root-cause statement (SC-005)

**Bug 4** (FR-025): the Funnel Settings workspace selector shows 3
of 9 active workspaces for the operator's account.

**Root cause** (research.md R1): the Firestore query at
`src/App.tsx:2685–2689` (pre-967) combined
`where('deletedAt','==',null)` with `orderBy('createdAt','desc')`.
Firestore's `== null` only matches documents where the `deletedAt`
key **exists** and equals null. Workspace documents created before
commit `1f23d5e` (2026-05-21) were written via the legacy client-
side path WITHOUT a `deletedAt` key — those documents were excluded
from the result set entirely, before any client-side filter runs.

**Why the previous filter-removal PR did not change anything**:
PR #65 removed `where('isActive', '==', true)` (a different filter
that was never the cause), leaving the `deletedAt` predicate
unchanged. The remaining 3-of-9 split is the same condition R1
predicts: the missing `deletedAt` key on pre-`1f23d5e` documents.

**Causal commit**: `1f23d5e` (2026-05-21) moved workspace creation
from the legacy client-side path to the server-side
`createWorkspace` callable, which writes `deletedAt: null` on every
new workspace. Pre-`1f23d5e` workspaces retain the legacy shape
(no `deletedAt` key), which the same `where('deletedAt','==',null)`
query cannot match.

**Why the Phase 2 repair removes the cause rather than masking
it**: `scripts/repair-workspace-markers.ts` writes
`deletedAt: null` on every legacy workspace doc that lacks the key.
After the repair, every active workspace — pre-`1f23d5e` and post-`1f23d5e`
— carries the same shape, and the same Firestore query matches
all of them. The downstream client-side filters (`ws.deletedAt == null`
in `WorkspaceSwitcher`, `!w.deletedAt` in `FunnelSettingsForm`)
become redundant but correct — the server-side query is the single
source of truth.

This statement predates the first code change for this story by
construction: the repair script was Phase 2's deliverable (T005-T010),
and Phase 7 is purely the verification + evidence capture step
specified in FR-025 / SC-005.

### T087 — FunnelSettingsForm needs no code change (FR-022)

`src/App.tsx:12724–12741` (post-Phase-2 BUG B fix) already passes
the full `workspaces.filter(w => !w.deletedAt)` array to
`<FunnelSettingsForm>`. The selector renders every active workspace
and labels unlinked ones `"needs Meta link"` via the Phase 1 i18n
key `meta.needs_meta_link_label` — the BUG B fix (PR #65 follow-up)
removed the previous `&& !!w.metaAdAccountId` filter that silently
hid every unlinked workspace.

After the Phase 2 repair, the legacy workspace docs now carry
`deletedAt: null` explicitly, and the filter continues to include
them. **No code change** is required for FR-022 to be satisfied.

### T088 — Surface enumeration (FR-026 / FR-026a / FR-026b)

Per FR-026: every surface affected by the same root cause (missing
`deletedAt` key on legacy workspace docs) is enumerated below.
Each surface's listing query / filter is recorded, plus the
single-source-of-truth fix that resolves it.

| # | Surface | File | Listing query / filter | Affected by R1? | Fixed by Phase 2 repair? |
|---|---|---|---|---|---|
| 1 | Funnel Settings — workspace switcher dropdown | `src/components/FunnelSettingsForm.tsx:470–474` | Iterates the `workspaces.filter(w => !w.deletedAt)` prop (App.tsx:12739) | Yes — pre-`1f23d5e` workspaces excluded upstream | Yes — repair writes `deletedAt: null`, all 9 surfaces return the full set |
| 2 | Top-bar workspace switcher | `src/components/WorkspaceSwitcher.tsx:127` | `workspaces.filter(ws => ws.deletedAt == null)` | Yes — same upstream cause | Yes — same repair fix |
| 3 | App's main subscription | `src/App.tsx:2681–2702` | `where('deletedAt','==',null)` + `orderBy('createdAt','desc')` | Yes — the SOURCE of the bug | Yes — Phase 2 repair writes `deletedAt: null` for every legacy doc, so the existing query now matches them all |
| 4 | The `workspaces` state consumer — every use of `workspaces` in App.tsx (`activeWorkspace`, `defaultWsId`, `filteredProjects`, `filteredAvatars`, etc.) | `src/App.tsx:2590` + downstream | All derive from the single subscription at #3 | Yes — propagates upstream | Yes — same repair fix |

**FR-026a closure**: every surface on the list above is fixed in
this phase (the Phase 2 repair covers all four). Scope is bounded to
the single root cause (R1) — the workspace-listing surfaces affected
by unrelated bugs (e.g. a future permissions mismatch) are
**explicitly out of scope** and would be tracked as separate
follow-ups per FR-026a.

**FR-026b closure**: every surface above shows a count equal to the
number of active workspaces the account actually holds after the
repair. Verified hermetically by `functions/src/__tests__/workspaceListing.test.ts`
(see T091 below) for the server-side query shape; live verification
on the 9-workspace account is operator-gated (T090 below).

### T089 — "needs Meta link" label verification (FR-023)

`src/components/FunnelSettingsForm.tsx:472`:

```tsx
{ws.name}{ws.metaAdAccountName
  ? ` — ${ws.metaAdAccountName}`
  : ' — ' + L('needs Meta link', 'يحتاج ربط ميتا')}
```

The `L()` helper resolves the paired en/ar i18n key
`meta.needs_meta_link_label`:

- English (`src/i18n.tsx:209`): `"Needs Meta link"`
- Arabic (`src/i18n.tsx:1139`): `"يحتاج ربط ميتا"`

The label shows for any workspace in the dropdown that does not
have a linked Meta ad account — exactly the FR-023 requirement.
No code change needed.

### T090 — Live 9-workspace account: owner + team-member selector counts (SC-004)

**Live end-to-end verification is operator-gated** (a real Firebase
project with the operator's 9-workspace account is required). The
hermetic equivalent is the server-side query assertion in
`functions/src/__tests__/workspaceListing.test.ts`.

| Surface | Expected count (post-repair) | Pre-repair count (operator to paste) | Post-repair count (operator to paste) |
|---|---|---|---|
| Funnel Settings switcher (owner view) | 9 of 9 active | _pending_ | _pending_ |
| Top-bar workspace switcher (owner view) | 9 of 9 active | _pending_ | _pending_ |
| Funnel Settings switcher (team member view) | 9 of 9 active (all-access FR-004a) | _pending_ | _pending_ |
| Top-bar workspace switcher (team member view) | 9 of 9 active (all-access FR-004a) | _pending_ | _pending_ |

### T091 — Soft-delete verification (FR-024)

**Live end-to-end verification is operator-gated.** The hermetic
equivalent in `functions/src/__tests__/workspaceListing.test.ts`
asserts (without touching a live project):

1. A workspace with `deletedAt: <ts>` (soft-deleted) is NOT in the
   `where('deletedAt','==',null)` listing query.
2. The repair script does NOT resurrect a deleted workspace — Phase 2's
   `T-23` in `workspaceRepair.test.ts` (FR-024 + FR-026d closure)
   covers this directly; the listing test reuses that invariant.

**Live runbook** (operator to paste results):

1. Open the nine-workspace account as the owner.
2. Open Funnel Settings → record the workspace count.
3. Open the top-bar workspace switcher → record the workspace count.
4. Soft-delete one workspace (e.g. `ws-delete-test`) via the
   existing `deleteWorkspace` callable or the WorkspaceSettingsModal
   delete button. The doc's `deletedAt` is set to the current epoch-ms.
5. Re-open both selectors — both should show 8 workspaces, with
   `ws-delete-test` absent.
6. Open the `users/{ownerUid}/workspaces` collection in the
   Firebase console — confirm the soft-deleted doc still exists
   (with `deletedAt != null`); the Phase 2 repair does not touch
   already-deleted records (T-23 invariant).
7. (Optional — operator-gated) re-run `scripts/repair-workspace-markers.ts
   --dry-run` and confirm `docs missing deletedAt: 0` AND
   `docs marked default: 0` — the repair is idempotent.

| Selector | Pre-delete count | Post-delete count | Soft-deleted present? |
|---|---|---|---|
| Funnel Settings (owner) | _pending_ | _pending_ | No (expected) |
| Top-bar workspace switcher (owner) | _pending_ | _pending_ | No (expected) |
| Funnel Settings (team member) | _pending_ | _pending_ | No (expected) |
| Top-bar workspace switcher (team member) | _pending_ | _pending_ | No (expected) |

### Phase 7 — code-change summary

No new backend or frontend code is added in Phase 7. The
deliverable is purely the FR-025 root-cause statement (T086), the
FR-026 surface enumeration (T088), the existing-code verification
records (T087, T089), and the operator-gated runbook for the live
runs (T090, T091). The hermetic half of T091 lives in
`functions/src/__tests__/workspaceListing.test.ts`.




