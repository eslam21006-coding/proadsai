# Issue 969 — Cumulative Learning Implementation Log

This file is the durable record of the cumulative-learning work
on `main`. It is the post-merge companion to the per-batch
reports in `specs/969-cumulative-learning/reports/`. Read
those for the per-batch detail; this log captures the
end-to-end production-verification findings, cross-batch
regressions, and operator notes that span batches.

---

## 1. Production Verification — Phase 4 (PR #73) Status

**Date:** 2026-09-22
**Working directory:** `D:\Pro Ads AI - SaaS - FAL` (branch: `main`)
**Owner:** `islam210.06@gmail.com` (uid `ywpCgWsXqVP4tlNwfhSoTqMjRw52`)
**Read-only against Firestore.** No fixes attempted.

A standalone report at
`specs/969-cumulative-learning/reports/phase4-production-verification.md`
records every figure verbatim and the full capture-script
artefact list. This section is the summary cross-reference.

### 1.1 Headline — the verification cannot be performed as scoped

`gh pr view 73 --json state,mergedAt,mergeCommit` returns:

```json
{"mergeCommit": null, "mergedAt": null, "state": "OPEN",
 "title": "969 phase 4", "headRefName": "969-phase-4",
 "baseRefName": "main"}
```

26 commits ahead of `main` (`git log --oneline main..969-phase-4`
shows the entire Phase 4 batch series and rounds 16-22).

The most recent manual sync in Cloud Logging is
`2026-09-18T07:42:57Z`. That sync ran against PR #71's deployed
code (`firebase-functions-hash: ca72e596b9983f793f5efe68b46795b7160ffca5`
for `metaSyncPerformance`). PR #71 was the cumulative learning
deploy, merged `2026-09-12T09:00:52Z`. PR #72 (workspace-bleed
frontend fix) was merged `2026-09-19T09:22:54Z` and does not
change what gets written to Firestore.

No owner-triggered sync has happened in the last 4 days.
Zero `triggerMetaSync`, `metaSyncPerformance`, or
`metaSyncAccountWorker` entries in the 30-day freshness window
after `2026-09-18T07:42:57Z`.

### 1.2 Path under measurement

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268
```

- Workspace `ZVASEGdrF5qbizl4Bbug`: `name: "Boran"`,
  `metaAdAccountId: "act_1180773537404268"`,
  `metaAdAccountName: "Boran english "`,
  `metaPageName: "Coach Boran Haj Yahya"`.
- 18 workspaces total for this owner. The Boran workspace is
  the one whose inline path actually ran on Sep 18 (per
  `activeWorkspaceId: "ZVASEGdrF5qbizl4Bbug"` in Cloud Logging).

### 1.3 In-lease read succeeded? — cannot be answered

A search of Cloud Logging for `chunk failed`,
`DocumentReference`, `path`, `getAll`, `db.getAll`,
`freshFailedReads`, or `readExistingAdDocs` in the 30-day
window returns **zero hits**.

This is **not** because the in-lease read succeeded cleanly.
The deployed `applyLearningWrites.ts` is the PR #71 version,
which does not call `readExistingAdocs` inside the lease at
all. Round-19's architectural fix (`d5aeef1`) that moves the
ledger write inside the lease-held commit, plus round-21's
`path`-fix (`1f6f63f`), are on `969-phase-4` and unmerged.

### 1.4 Learning wrote at all

| Metric | Sync 1 (Sep 18 07:11Z) | Sync 2 (Sep 18 07:42Z) | Today (Sep 22) | Δ |
|---|---|---|---|---|
| `adPerformance` total | 718 | 718 | **718** | 0 |
| `adPerformance` with `ledger` | 642 (89.4%) | 666 (92.8%) | **666 (92.8%)** | 0 |
| `hookPerformance` total | 1 | 1 | **1** | 0 |
| `visualPerformance` total | 0 | 0 | **0** | 0 |
| `evaluatedAt` max | 2026-09-18T07:11Z | 2026-09-18T07:42Z | **2026-09-18T07:42:53.549Z** | 0 |

Side-by-side, the counts are bit-for-bit identical to Sync 2
(`docs/investigations/969-sync-check-02.md` §1.2).

### 1.5 Side-by-side — nothing doubled between syncs

| Aggregate field | Sync 1 | Sync 2 | Today | Δ (today − sync 2) |
|---|---|---|---|---|
| `pain.creativeCount` | 1 | 1 | **1** | 0 |
| `pain.contributedCreativeKeys.length` | 1 | 1 | **1** | 0 |
| `pain.byObjective.conversion.count` | 32 | 32 | **32** | 0 |
| `pain.byObjective.conversion.avgLinkCtr` | 0.17 | 0.17 | **0.17** | 0 |
| `pain.byFunnelType.free_webinar` | 27 | 27 | **27** | 0 |
| `pain.byFunnelType.unknown` | 0 | 0 | **0** | 0 |
| `pain.contributedCreativeKeys[0]` | `creative:gen:UtCCphz5jAgFIEWCa7WQ` | (same) | **(same)** | — |
| `pain.lastUpdated` | 07:11 UTC | 07:42 UTC | **07:42 UTC** | 0 |

None of the four critical-check fields moved. No sync has
touched the data since Sep 18 — `pain.lastUpdated` is stable.

### 1.6 Phase 4 fields — none appear anywhere

| Field | Count of docs carrying it (out of 718) |
|---|---|
| `dayAccrual` | **0** |
| `adStatus` | **0** |
| `sealedTarget` | **0** |
| `sealedFunnelType` | **0** |
| `sealedAt` | **0** |
| `contributionState` | **0** |
| `efficiencyRaw` | **0** |
| `efficiencyContributingCount` on `pain` | absent (field not present) |
| `efficiencyValueAvg` on `pain` | absent |

`functions/src/learning/types.ts:91-105` defines
`DayAccrual`. A grep for `dayAccrual` across `functions/src`
returns zero hits. A grep for `adStatus` returns zero hits.
A grep for `sealedTarget` returns zero hits. **The fields do
not exist in the deployed source code at all.** (They exist
in `functions/src/learning/types.ts` only as a type
declaration and an interface.) The Phase 4 batches that
build the persistence write-paths are on `969-phase-4` and
not merged.

### 1.7 Workspace's configured funnel type

The Boran workspace has no `settings/funnelSettings` doc.
Verified directly:

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/settings/funnelSettings
```

Returns `{__exists: false}`. The workspace doc itself carries
no `funnelType` field either.

The 27 in `pain.byFunnelType.free_webinar` come from the
per-generation funnel type lookup at write time, not from a
workspace-level setting. The 5-row gap between
`byObjective.conversion.count = 32` and the sum of
`byFunnelType` buckets (= 27) is the propagated-to-`pain`
rows that share a hash but have no generation id to read a
funnel type from. Same as Sync 2.

### 1.8 Efficiency figures — zero on a fresh deploy; expected

Best accrued creative so far:
`creative:gen:UtCCphz5jAgFIEWCa7WQ` on the `pain` angle, with
**32 contributed rows** under it (27 direct + 5 propagated
siblings).

No creative is in the SEALED state (sealedTarget not
populated anywhere). No row carries `dayAccrual`, so no
per-day figure can be measured yet.

This tells the owner how far the first real figure is.
**Zero contribution rows have any accrued-conversions data,
because the FR-081 accrual code is in PR #73 (unmerged). The
data the owner would need to verify efficiency is precisely
what the unmerged PR adds.** When PR #73 lands and a sync
runs, `dayAccrual` will start populating per-row, and the
aggregate will gain `efficiencyContributingCount` once any
creative's per-day figure crosses the 5-conversions gate.

### 1.9 Errors and skips (verbatim, the active sync pair)

The Boran Sync 2 (07:42:57Z) and Sync 3 (07:42:57Z — second
run after Sync 2) Cloud Logging summary:

```
Sync 1 (06:44:25Z, owner on Moataz Mashal, no inline learning):
  📊 [Batch 5] First-successful-Phase-14-run evidence (inline + LEG A summary):
    {"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
     "activeWorkspaceId":"ZbGPvZbrAAFl8afG41dG",
     "ok":false,
     "resultKey":"failed",
     "legacy":{"accountsSynced":23,"adsSynced":422,"rateLimited":[],"errorCount":0},
     "inline":{"workspaceId":"ZbGPvZbrAAFl8afG41dG",
               "accountId":"act_1069240099193713",
               "status":"ok",
               "counts":{"ads":12,"matched":0,"ambiguous":0,"unmatched":12}},
     "fanOut":{"queued":0,"rateLimited":[]}}

Sync 2 (07:13:22Z, owner on Boran, inline learning ran):
  📊 [Batch 5] First-successful-Phase-14-run evidence (inline + LEG A summary):
    {"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
     "activeWorkspaceId":"ZVASEGdrF5qbizl4Bbug",
     "ok":false,
     "resultKey":"failed",
     "legacy":{"accountsSynced":23,"adsSynced":422,"rateLimited":[],"errorCount":0},
     "inline":{"workspaceId":"ZVASEGdrF5qbizl4Bbug",
               "accountId":"act_1180773537404268",
               "status":"partial",
               "counts":{"ads":666,"matched":27,"ambiguous":0,"unmatched":615}},
     "fanOut":{"queued":0,"rateLimited":["act_1180773537404268"]}}

Sync 3 (07:42:57Z — second run after Sync 2, on Boran):
  📊 [Batch 5] First-successful-Phase-14-run evidence (inline + LEG A summary):
    {"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
     "activeWorkspaceId":"ZVASEGdrF5qbizl4Bbug",
     "ok":false,
     "resultKey":"failed",
     "legacy":{"accountsSynced":23,"adsSynced":422,"rateLimited":[],"errorCount":0},
     "inline":{"workspaceId":"ZVASEGdrF5qbizl4Bbug",
               "accountId":"act_1180773537404268",
               "status":"ok",
               "counts":{"ads":666,"matched":27,"ambiguous":0,"unmatched":639}},
     "fanOut":{"queued":0,"rateLimited":[]}}
```

**Cloud Tasks fan-out still failing every sync.** On Sync 2
(07:42:57Z), verbatim:

```
⚠️ metaSync fan-out enqueue failed:
   workspace=5ZRdOCRnSKamHTiJd07F
   account=act_781389063661831
   error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
   workspace=9n2zPb3Z6D7IRBOLSXi0
   account=act_1451373605463040
   error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
   workspace=ZbGPvZbrAAFl8afG41dG
   account=act_1069240099193713
   error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
   workspace=kmuu4ZUMbsK5jnMCwglH
   account=act_1163959057640939
   error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
   workspace=m5VqQlf6bL2wWUVQDCy6
   account=act_995888422231015
   error=5 NOT_FOUND: Requested entity was not found.
```

`fanOut.queued: 0` on every sync. Every cross-workspace
fan-out fails with `5 NOT_FOUND`. This is a pre-existing
issue (also documented in `969-sync-check-01.md` §7.1 and
`969-sync-check-02.md` §6). It determines whether the nightly
03:00 fan-out to all workspaces runs — it doesn't, only the
active workspace's inline path runs the new learning code.

No lease refusals, no OAuth rate-limit hits, no in-lease-read
errors logged.

### 1.10 Verdict

| Check | Verdict |
|---|---|
| In-lease read succeeded in production | **Cannot verify** — PR #73 (which contains the round-21 `path`-fix and round-22 stub-tightening) is unmerged. The deployed `applyLearningWrites.ts` does not have the in-lease re-read. |
| Learning wrote at all | **Yes** — 666 of 718 adPerformance rows carry a ledger entry. Counts unchanged from Sync 2 (Sep 18). |
| Nothing doubled between syncs | **Yes** — Sync 2 and Sync 3 left all four critical-check fields unchanged. |
| Phase 4 fields appearing | **No** — `dayAccrual`, `adStatus`, `sealedTarget`, `sealedFunnelType`, `sealedAt`, `contributionState`, `efficiencyRaw`, `efficiencyContributingCount`, `efficiencyValueAvg`: all zero. The fields do not exist in the deployed source code. |
| Efficiency figures present | **Zero, as expected** on a fresh deploy — best accrued creative is `creative:gen:UtCCphz5jAgFIEWCa7WQ` with 32 contributed rows on the `pain` angle. No SEALED creatives. |
| Errors / skips | **Cloud Tasks fan-out still failing** — 5× `5 NOT_FOUND` on every sync (every cross-workspace dispatch). `fanOut.queued: 0`. Pre-existing issue, outside this PR. **No lease refusals, no OAuth rate-limit hits, no in-lease-read errors logged.** |
| Owner has run two manual syncs back to back against PR #73 | **No evidence in Cloud Logging.** The most recent `triggerMetaSync` / `metaSyncPerformance` entry is `2026-09-18T07:42:57Z`, against PR #71's code. PR #73 is `state: OPEN, mergeCommit: null, mergedAt: null`. |

**The prompt's verification depends on code that has not been
deployed.** PR #73 needs to be merged and deployed first; then
a manual sync on the Boran workspace will exercise the
in-lease re-read against real Firestore and surface any
`chunk failed` errors in Cloud Logging. The probe today
shows only that the PR #71 baseline state is unchanged and
that PR #73's data-shape changes have not touched the
database.

---

## 2. Capture artefacts

- `C:\temp\opencode\probe-phase4-meta.json` — full read of
  `metaConnections/{uid}` (user-level + top-level + workspace
  listing + adAccounts + funnelSettings per workspace).
- `C:\temp\opencode\probe-phase4-paths.json` — first page
  of the data path probe (25 adPerformance docs visible).
- `C:\temp\opencode\probe-phase4-counts.json` — full
  paginated probe of `adPerformance` (all 718),
  `hookPerformance` (1), `visualPerformance` (0);
  field-presence counts; top-20 ledged creatives.
- `C:\temp\opencode\logs-30d.txt` — Cloud Logging stdout
  filter, 30-day freshness, manual + scheduled entries that
  mention `Synced`, `Phase 14`, or `First-successful`.
- `C:\temp\opencode\logs-match-detail.txt` — filtered
  match list (timestamps + payload) for sync events.

---

## 3. Cross-references

- `docs/investigations/969-sync-check-01.md` — Sync 1
  (Sep 18 07:11Z) post-deploy check for the PR #71 deploy.
- `docs/investigations/969-sync-check-02.md` — Sync 2
  (Sep 18 07:42Z) post-deploy check for the PR #71 deploy.
  All four critical-check fields already passed (no
  doubling, no shrinkage, no avgLinkCtr movement).
- `docs/investigations/969-production-baseline.md` — pre-sync
  baseline capture for the Boran workspace.
- `specs/969-cumulative-learning/reports/phase4-production-verification.md`
  — the standalone report for this verification.
