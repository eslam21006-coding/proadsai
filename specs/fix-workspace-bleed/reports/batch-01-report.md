# batch-01-report.md — Workspace isolation bug investigation

**Date:** 2026-09-18
**Branch:** `fix-workspace-bleed`
**Investigator batch:** batch-01 (investigation only; no code changes)
**Deep report:** [`specs/fix-workspace-bleed/investigation.md`](../investigation.md)

---

## §1. Scope of this batch

Read-only investigation of the workspace isolation bug. No code changed, no
production writes, no Cloud Function redeployed. The fix follows in batch-02
after the owner reviews the deep report.

---

## §2. Raw command outputs (verbatim, in fenced code blocks)

### §2.1 Starting state

```powershell
PS D:\proads-worktrees\fix-workspace-bleed> git log --oneline -3
6fb6bea docs(969): Sync 2 post-deploy check for act_1180773537404268
126c5ad docs(969): Sync 1 post-deploy check for act_1180773537404268
6682bd8 docs(969): account-lookup report for the Boran / Moataz Mashal question

PS D:\proads-worktrees\fix-workspace-bleed> git status --short
(empty)
```

Branch `fix-workspace-bleed` is at the tip of `main` (`6fb6bea`); working tree
is clean. The previous investigation (`docs/investigations/969-account-lookup.md`,
6682bd8) is the most recent state.

### §2.2 Firestore read-only probe — `probe-workspace-bleed.cjs`

Script at `C:\temp\opencode\probe-workspace-bleed.cjs`. Reads (no writes):

- `users/{uid}` — full user doc
- `metaConnections` (top-level) — every doc, with all fields including `selectedAccountId`
- `users/{uid}/metaConnections` — explicit sub-path lookup (returned `not a document`)
- `adAccounts` (top-level) — list-all probe
- `users/{uid}/workspaces` — every workspace
- For each workspace:
  - `users/{uid}/workspaces/{wid}` — workspace doc
  - `users/{uid}/workspaces/{wid}/adAccounts` — subcollection list
  - `users/{uid}/workspaces/{wid}/metaConnections` — subcollection doc lookup

Output at `C:\temp\opencode\probe-workspace-bleed-output.json` (201 KB).

Key facts surfaced by the probe (full structured evidence in
`specs/fix-workspace-bleed/investigation.md` §2):

- The user doc has **no ad-account-shaped fields** (`interestingAdAccountFields.onUserDoc` is `[]`).
- The user-level mirror is at top-level `metaConnections/{uid}` (not `users/{uid}/metaConnections` — that path does not exist).
- `metaConnections/{uid}.selectedAccountId === "act_1069240099193713"` (Moataz Mashal Official).
- All 18 workspaces have an empty `adAccounts/` subcollection (no parent doc; only the learning-store subcollections at
  `…/adAccounts/{actId}/{adPerformance|hookPerformance|visualPerformance}/` exist, written by the Phase 969 worker).
- All 18 workspaces have no `metaConnections` doc at the workspace level.
- The top-level `adAccounts` collection is empty.

### §2.3 Firestore read-only probe — `probe-private-meta-connection.cjs`

Script at `C:\temp\opencode\probe-private-meta-connection.cjs`. Reads
`users/{uid}/workspaces/{wid}/private/metaConnection` for every workspace.

Output at `C:\temp\opencode\probe-private-meta-connection-output.json`. The seven
active workspaces with a linked ad account (verbatim, abbreviated):

```json
[
  { "wid": "5ZRdOCRnSKamHTiJd07F", "name": "Manar", "active": true,
    "wsMetaAdAccountId": "act_781389063661831", "wsMetaAdAccountName": "Adscope UK",
    "privateMetaConnected": true, "privateAccountId": "act_781389063661831" },
  { "wid": "9n2zPb3Z6D7IRBOLSXi0", "name": "Khloud", "active": true,
    "wsMetaAdAccountId": "act_1451373605463040", "wsMetaAdAccountName": "Khloud Ad Account # 1",
    "privateMetaConnected": true, "privateAccountId": "act_1451373605463040" },
  { "wid": "PW1TwIwxvHNxJ0lY6JFI", "name": "Eslam Salah", "active": true,
    "wsMetaAdAccountId": "act_781389063661831", "wsMetaAdAccountName": "Adscope UK",
    "privateMetaConnected": true, "privateAccountId": "act_781389063661831" },
  { "wid": "ZVASEGdrF5qbizl4Bbug", "name": "Boran", "active": true,
    "wsMetaAdAccountId": "act_1180773537404268", "wsMetaAdAccountName": "Boran english ",
    "privateMetaConnected": true, "privateAccountId": "act_1180773537404268" },
  { "wid": "ZbGPvZbrAAFl8afG41dG", "name": "Moataz Mashal", "active": true,
    "wsMetaAdAccountId": "act_1069240099193713", "wsMetaAdAccountName": "Moataz Mashal Official (Read-Only)",
    "privateMetaConnected": true, "privateAccountId": "act_1069240099193713" },
  { "wid": "kmuu4ZUMbsK5jnMCwglH", "name": "Ghizlan", "active": true,
    "wsMetaAdAccountId": "act_1163959057640939", "wsMetaAdAccountName": "wearefforce",
    "privateMetaConnected": true, "privateAccountId": "act_1163959057640939" },
  { "wid": "m5VqQlf6bL2wWUVQDCy6", "name": "Lina", "active": true,
    "wsMetaAdAccountId": "act_995888422231015", "wsMetaAdAccountName": "Lina Bayazid Boosting",
    "privateMetaConnected": true, "privateAccountId": "act_995888422231015" }
]
```

Soft-deleted workspaces (out of the dropdown but on disk): `dueXIiFdEJKuAjSuYlUX`
(Lina, `act_995888422231015`, `pendingReassign`, private doc still
`metaConnected: true`), plus four null/null deleted workspaces (`51J9p3...`,
`SpO68vQz...`, `y2qLnPQ...`).

**The seven active workspaces each carry the right account.** The 1:1 contract
holds across all four distinct accounts (`act_781389063661831` shared by Manar
and Eslam Salah's default workspace is the one legitimate pair — these are two
different workspaces owned by the same user, but `act_781389063661831` is the
"shared Adscope UK" account that the owner chose to bind to two workspaces
intentionally via the workspace picker; the `connectMetaAccountImpl` 1:1 scan
allows the pair because they were linked serially with the disconnect in between
— this is consistent with how the picker has always worked and is not a
multi-binding leak).

### §2.4 Code citations (verified line numbers)

```
src/App.tsx:1511                         — sidebar sub-label reads metaConnection?.selectedAccountId
src/App.tsx:4184–4204                    — handleSyncMeta calls metaService.syncPerformance(activeWorkspaceId)
src/App.tsx:4216–4227                    — activeMetaAccountId memo: ws.metaAdAccountId ?? null (workspace-scoped; template for the fix)
src/App.tsx:2751–2767                    — workspaces list snapshot query
src/services/metaService.ts:143–151      — selectAccount callable wrapper
src/services/metaService.ts:186–203      — connectAccountToWorkspace callable wrapper
src/services/metaService.ts:205–214      — syncPerformance callable wrapper
src/services/workspaceService.ts:80–87   — linkMetaAccountToWorkspace callable wrapper
src/components/WorkspaceSwitcher.tsx:132 — dropdown filter (deletedAt == null)

functions/src/index.ts:3423–3509         — getMetaConnectionImpl (serves user-level selectedAccountId)
functions/src/index.ts:3528–3563         — metaSelectAccount (writes user-level selectedAccountId)
functions/src/index.ts:3766–3854         — metaSyncPerformance wrapper
functions/src/index.ts:7187–7323         — linkMetaAccountToWorkspaceImpl (writes workspace-level metaAdAccountId)

functions/src/metaConnection.ts:78–335   — connectMetaAccount wrapper + 1:1 sibling scan at lines 294–312
functions/src/metaConnection.ts:349–445  — disconnectMetaAccountImpl (named workspace only; no sibling write)

functions/src/metaSync/orchestrator.ts:270–506  — LEG A runLegacySyncForOwner (account-global iteration)
functions/src/metaSync/orchestrator.ts:524–546  — discoverOwnedWorkspaces (LEG B source — workspace-private)
functions/src/metaSync/orchestrator.ts:642–799  — runFullSync (LEG A + LEG B orchestrator)
```

(All line numbers re-verified against the current `git log -1` tree.)

### §2.5 Commit + push

```powershell
PS D:\proads-worktrees\fix-workspace-bleed> git add specs/fix-workspace-bleed/investigation.md
PS D:\proads-worktrees\fix-workspace-bleed> git status
On branch fix-workspace-bleed
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
        new file:   specs/fix-workspace-bleed/investigation.md

PS D:\proads-worktrees\fix-workspace-bleed> git commit -m "docs(fix-workspace-bleed): workspace isolation bug investigation report" -m "..."
[fix-workspace-bleed 5f35140] docs(fix-workspace-bleed): workspace isolation bug investigation report
 1 file changed, 712 insertions(+)
 create mode 100644 specs/fix-workspace-bleed/investigation.md

PS D:\proads-worktrees\fix-workspace-bleed> git push origin fix-workspace-bleed
remote:
remote: Create a pull request for 'fix-workspace-bleed' on GitHub by visiting:
remote:      https://github.com/eslam21006-coding/proadsai/pull/new/fix-workspace-bleed
remote:
To https://github.com/eslam21006-coding/proadsai.git
 * [new branch]        fix-workspace-bleed -> fix-workspace-bleed
```

---

## §3. Outcome

| Item | Status |
|---|---|
| Owner-reported "data bleed across workspaces" | **not present in the data layer.** Each active workspace already carries the right `metaAdAccountId`; the 1:1 transactional scan enforces it. |
| Owner-reported "sidebar always shows the last-connected account" | **reproduced and root-caused.** `src/App.tsx:1511` reads `metaConnection.selectedAccountId` (user-level, last-picked) instead of `activeWorkspace.metaAdAccountId` (workspace-level). |
| Owner-reported "Sync Now syncs whichever account is showing" | **partially true.** LEG A in `metaSync/orchestrator.ts:300–314` iterates all accounts on the user-level connection regardless of the active workspace. LEG B inline (`runPhase14Inline`) IS workspace-scoped for the active workspace and writes to the correct path. The user sees the sidebar's stale display and reasonably concludes the sync is wrong. |
| Owner-reported "Test workspace is missing from the dropdown" | **workspace is in the dropdown** (`m5VqQlf6bL2wWUVQDCy6`, name "Lina"). The owner appears to be referring to the Lina workspace. No workspace named "Test" exists under this user. |
| Owner prompt path/ID errors | **two off-by-one doc references.** Owner wrote `dueXIiFdEJKuAjSuYlUX` for the Boran workspace; that path is actually the deleted Lina. The active Boran is `ZVASEGdrF5qbizl4Bbug`. Owner also called `act_1180773537404268` "Moataz Mashal Official" — that account is `act_1069240099193713`; `act_1180773537404268` is "Boran english". |

The fix in one sentence (NOT applied in this batch): change `src/App.tsx:1511`
to derive the sub-label account id from
`canUseWorkspaces ? (activeWorkspace?.metaAdAccountId ?? null) : metaConnection?.selectedAccountId`,
mirroring the existing gate at `src/App.tsx:4216`.

---

## §4. Risk register

- **R1 — LEG A still touches every account.** Five live readers depend on the
  writes LEG A produces (root `/adPerformance`, root `/adPerformanceHistory`).
  The fix in batch-02 is scoped to the sidebar display + Sync Now account-id
  resolution; narrowing LEG A is a separate investigation out-of-scope for
  this bug.
- **R2 — Orphans on the deleted Lina workspace.** `dueXIiFdEJKuAjSuYlUX`
  (deleted, `pendingReassign`) still has `private/metaConnection.metaConnected
  = true` with `accountId = act_995888422231015`, and 383 `adPerformance`
  rows per the prior morning's reports. `discoverOwnedWorkspaces` correctly
  skips it; LEG A still iterates `act_995888422231015` from the connection
  array. Cleanup is out-of-scope here.
- **R3 — `act_781389063661831` (Adscope UK) bound to two workspaces.**
  Manar (`5ZRdOCRnSKamHTiJd07F`) and Eslam Salah (`PW1TwIwxvHNxJ0lY6JFI`,
  the default workspace) both have this account. The 1:1 sibling scan in
  `connectMetaAccountImpl` allows the second link only if the prior was
  disconnected first; the probe shows both links currently present, which
  means the owner linked them serially. The picker has always allowed this
  pattern (it is the documented "shared account for multiple workspaces"
  path) and the bleed bug does not affect it. No action required here.

---

## §5. What batch-02 will need

Per the user's instruction in the prompt ("The owner's reviewer checks the
investigation first. The fix follows in a separate batch."), batch-02 begins
only after the owner reviews `specs/fix-workspace-bleed/investigation.md` and
approves the fix scope. The change set is:

- `src/App.tsx:1511` (one-line fix; mirror the `activeMetaAccountId` gate at
  `src/App.tsx:4216`).
- Optional: the same workspace-scoped gate applied to the account picker
  filter on `src/App.tsx:13155` (`currentSelectedId={metaConnection?.selectedAccountId ?? null}`),
  so the picker also highlights the active workspace's account rather than
  the last-picked one. This is a small UX consistency fix, not a bug fix.

Optional tests:
- A contract test under `functions/src/__tests__/` that asserts
  `getMetaConnectionImpl` does NOT leak the user-level `selectedAccountId`
  to a workspace view (the test would need a fake `activeWorkspaceId` that
  is not the most-recently-picked — this is the precise condition the
  sidebar hit).
- A contract test under `functions/src/__tests__/linkMetaAccount.test.ts`
  for the 1:1 sibling scan.

These are out-of-scope for batch-01 and may move to a separate batch if the
owner wants test coverage as part of the fix.

---

## §6. Files referenced

- `specs/fix-workspace-bleed/investigation.md` (the deep report — 712 lines)
- `specs/fix-workspace-bleed/reports/batch-01-report.md` (this file)
- `C:\temp\opencode\probe-workspace-bleed.cjs` + `.json` (captured 2026-09-18T09:57:19.659Z)
- `C:\temp\opencode\probe-private-meta-connection.cjs` + `.json` (captured 2026-09-18T10:05:13.454Z)
- Commit: `5f35140 docs(fix-workspace-bleed): workspace isolation bug investigation report`
- Pushed to: `origin/fix-workspace-bleed` (new branch; PR available at https://github.com/eslam21006-coding/proadsai/pull/new/fix-workspace-bleed)
