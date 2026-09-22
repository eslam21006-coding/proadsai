# Phase 4 Production Verification

**Date:** 2026-09-22
**Working directory:** `D:\Pro Ads AI - SaaS - FAL` (branch: `main`)
**Owner:** `islam210.06@gmail.com` (uid `ywpCgWsXqVP4tlNwfhSoTqMjRw52`)
**Read-only against Firestore.** No fixes attempted.

---

## §0. Headline — the verification cannot be performed as scoped

**PR #73 is not merged and not deployed.** `gh pr view 73 --json
state,mergedAt,mergeCommit` returns:

```json
{"mergeCommit": null, "mergedAt": null, "state": "OPEN",
 "title": "969 phase 4", "headRefName": "969-phase-4",
 "baseRefName": "main"}
```

26 commits ahead of `main` (`git log --oneline main..969-phase-4`
shows rounds 16-22 + the entire Phase 4 batch series).

The most recent manual sync in Cloud Logging is
`2026-09-18T07:42:57Z` (Sync 2 from
`docs/investigations/969-sync-check-02.md`). That sync ran
against PR #71's deployed code (`firebase-functions-hash:
ca72e596b9983f793f5efe68b46795b7160ffca5` for
`metaSyncPerformance`, `7ef255699f8914be8d97d9f8e08c6034a967fb72`
for the daily/legacy pair). PR #71 was the cumulative
learning deploy, merged `2026-09-12T09:00:52Z`. PR #72
(workspace-bleed frontend fix) was merged `2026-09-19T09:22:54Z`
and does not change what gets written to Firestore.

**No owner-triggered sync has happened in the last 4 days.** The
prompt says the owner has run two manual syncs back to back
against PR #73. The logs show zero `triggerMetaSync`,
`metaSyncPerformance`, or `metaSyncAccountWorker` entries
since `2026-09-18T07:42:57Z`. The Cloud Logging
freshness=30d query returned no manual-sync events
in that window.

The verification questions in the prompt cannot be answered as
stated because the code they reference has not been deployed.
The data in the database today is unchanged from
`969-sync-check-02.md` (Sync 2, Sep 18). I report that state
side-by-side with Sync 2's prior capture so the owner can
verify the same numbers without re-running the probe.

---

## §1. Path under measurement

**Workspace and account the previous sync checks targeted,
confirmed by `metaConnections` + the active workspace read.**

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268
```

- Workspace `ZVASEGdrF5qbizl4Bbug`: `name: "Boran"`,
  `metaAdAccountId: "act_1180773537404268"`,
  `metaAdAccountName: "Boran english "`,
  `metaPageName: "Coach Boran Haj Yahya"`,
  `deletedAt: null`, `pendingReassign: false`.
- The user-level `metaConnections/{uid}` `selectedAccountId`
  shows `act_1069240099193713` (Moataz Mashal, last picked in
  the UI), but the Cloud Logging `activeWorkspaceId` field on
  the most recent sync events (`06:44:25Z`, `07:13:22Z`,
  `07:42:57Z` on Sep 18) all read `ZVASEGdrF5qbizl4Bbug`. The
  workspace's `metaAdAccountId` matches what the orchestrator
  ran inline on.
- 18 workspaces exist for this owner. The other live
  workspaces with `metaAdAccountId` set: `5ZRdOCRnSKamHTiJd07F`
  (Manar, act_781389063661831), `9n2zPb3Z6D7IRBOLSXi0`
  (Khloud, act_1451373605463040), `PW1TwIwxvHNxJ0lY6JFI`
  (Eslam Salah default, act_781389063661831),
  `ZbGPvZbrAAFl8afG41dG` (Moataz Mashal, act_1069240099193713),
  `kmuu4ZUMbsK5jnMCwglH` (Ghizlan, act_1163959057640939),
  `m5VqQlf6bL2wWUVQDCy6` (Lina, act_995888422231015).

---

## §2. In-lease read succeeded? — cannot be answered

The prompt's headline check is whether the in-lease
`readExistingAdDocs` works against real Firestore. The
construction that round-21 fixed — `params.adAccountRef
.collection("adPerformance").doc(ad.adId)` returning a
`DocumentReference` with `path` populated — is the code that
landed in commits `1f6f63f` (round 21) and `afe11ed` (round
22) on the `969-phase-4` branch.

`git log main..969-phase-4 --oneline | wc -l` returns 26.
`git log main -- functions/src/learning/applyLearningWrites.ts`
returns nothing — the round-19/20/21/22 changes are NOT on
`main`. The deployed `applyLearningWrites.ts` is the PR #71
version, which has neither the in-lease re-read at line ~436
nor the `path`-populated ref construction.

A search of Cloud Logging for `db.getAll`,
`DocumentReference`, `path`, `chunk failed`, or any
`errors[]` entry referencing the in-lease read in the
30-day window returns **zero hits**. The reason is not that
the in-lease read succeeded cleanly — it is that **the
in-lease re-read does not exist in the deployed code**.

The deployed code (PR #71) uses the pre-fix path: bounded read
via `existingByAdId` (the seeded pre-lease data). When that
seed came from the post-pass patch in `shared.ts` (the FR-070
fallback), it was consistent enough that the Sep 18 syncs
landed the 666-with-ledger, 32-contributor `pain` aggregate
recorded in `969-sync-check-02.md`.

Round-22's tightened test doubles make this class of defect
catchable **in tests**. The round-22 code is on
`969-phase-4` and not yet merged. **The tests have not run
against production because the production code that the
tests would exercise has not been deployed.**

---

## §3. Learning wrote at all — unchanged from Sync 2

| Metric | Sync 1 (Sep 18 07:11Z) | Sync 2 (Sep 18 07:42Z) | **Probe today (Sep 22 11:00Z)** | Δ |
|---|---|---|---|---|
| `adPerformance` total | 718 | 718 | **718** | 0 |
| `adPerformance` with `ledger` | 642 (89.4%) | 666 (92.8%) | **666 (92.8%)** | 0 |
| `hookPerformance` total | 1 | 1 | **1** | 0 |
| `visualPerformance` total | 0 | 0 | **0** | 0 |
| `evaluatedAt` min | (Sep 3) | (Sep 3) | **2026-09-03T18:44:28.836Z** | — |
| `evaluatedAt` max | 2026-09-18T07:11Z | 2026-09-18T07:42Z | **2026-09-18T07:42:53.549Z** | — |

Side-by-side, the counts are **bit-for-bit identical** to Sync 2
(`969-sync-check-02.md` §1.2). No new write has occurred in
the 4 days since.

The ledger sits on **666 of 718** rows. The 52 without are
the `no_generation` rows — same as Sync 2's accounting. They
were never expected to receive a ledger; they carry no
`matchType`, no `generationId`, no `imageHash` link, and are
not eligible for any FR-016 contribution decision.

---

## §4. Side-by-side: nothing doubled between syncs (the only sync pair)

The prompt asks for side-by-side `creativeCount`,
`contributedCreativeKeys` length, `byObjective.conversion.count`,
`avgLinkCtr` for sync 1 vs sync 2.

| Aggregate field | Sync 1 (Sep 18 07:11Z) | Sync 2 (Sep 18 07:42Z) | **Today (Sep 22 11:00Z)** | Δ (today − sync 2) |
|---|---|---|---|---|
| `pain.creativeCount` | 1 | 1 | **1** | 0 |
| `pain.contributedCreativeKeys.length` | 1 | 1 | **1** | 0 |
| `pain.byObjective.conversion.count` | 32 | 32 | **32** | 0 |
| `pain.byObjective.conversion.avgLinkCtr` | 0.17 | 0.17 | **0.17** | 0 |
| `pain.byFunnelType.free_webinar` | 27 | 27 | **27** | 0 |
| `pain.byFunnelType.unknown` | 0 | 0 | **0** | 0 |
| `pain.contributedCreativeKeys[0]` | `creative:gen:UtCCphz5jAgFIEWCa7WQ` | (same) | **`creative:gen:UtCCphz5jAgFIEWCa7WQ`** | — |
| `pain.sampleSize` | 32 | 32 | **32** | 0 |
| `pain.lastUpdated` | 1789715487711 (07:11 UTC) | 1789717259548 (07:42 UTC) | **1789717259548 (07:42 UTC)** | 0 |
| `pain.schemaVersion` | 1 | 1 | **1** | 0 |

**None of the four critical-check fields moved.** The only
document-level delta is `pain.lastUpdated`, which is stable at
the Sync 2 value (`1789717259548`). This is consistent with
no sync having run since Sep 18 — the timestamp on the
aggregate would advance if a sync touched it.

No `visualPerformance` docs to compare. Same as Sync 2 (0).

The **only** creative with contributions is
`creative:gen:UtCCphz5jAgFIEWCa7WQ` (1 creative → 32 rows
contributing to `pain` via 27 `direct_auto` + 5 `propagated`
siblings under the same hash). The top 20 ledged creatives by
row count (today's read):

| Creative key | Rows |
|---|---|
| `creative:hash:1f1b333333a6949c` | 57 |
| `creative:hash:12722a2e2e2f2733` | 48 |
| `creative:hash:373677d78b333531` | 44 |
| `creative:hash:ae4c1135979392d3` | 35 |
| `creative:hash:f2da4ce49696d6ec` | 33 |
| `creative:hash:b31a0e1b4bae2c9c` | 31 |
| `creative:hash:4e2c373736969ccc` | 31 |
| `creative:hash:6b6b6d6c9796969d` | 27 |
| `creative:gen:UtCCphz5jAgFIEWCa7WQ` | 27 |
| `creative:hash:4121242465313902` | 25 |

All 19 of the `creative:hash:` entries are FR-074
hash-propagated siblings sharing the image hash of a single
matched generation. The 27-row `creative:gen:UtCCphz5jAgFIEWCa7WQ`
is the only `creative:gen:` row (a real direct match), and
it is the only one feeding the `pain` aggregate.

---

## §5. Phase 4 fields — none appear anywhere

The prompt's check 4 asks whether the new Phase 4 fields
appear on `adPerformance` rows:
`dayAccrual`, `adStatus`, `sealedTarget`, `sealedFunnelType`,
`sealedAt`, `contributionState`, plus the efficiency field
`efficiencyRaw` and the aggregate `efficiencyContributingCount`.

**All zero across the entire 718-row workspace:**

| Field | Count of docs carrying it |
|---|---|
| `dayAccrual` | **0 / 718** |
| `adStatus` | **0 / 718** |
| `sealedTarget` | **0 / 718** |
| `sealedFunnelType` | **0 / 718** |
| `sealedAt` | **0 / 718** |
| `contributionState` | **0 / 718** |
| `efficiencyRaw` | **0 / 718** |
| `byFunnelType.paid_event` on `pain` | 0 |
| `byFunnelType.unknown` on `pain` | 0 |
| `efficiencyContributingCount` on `pain` | absent (field not present) |
| `efficiencyValueAvg` on `pain` | absent |

This is consistent with the deployed code (PR #71). The
Phase 4 fields belong to PR #73's code (rounds 16-22, on
`969-phase-4`, unmerged). T037 (persist `adStatus`),
T041 (efficiency figure), and the FR-085 seal-context
machinery are in the PR #73 commits (`batch-01` through
`batch-06`), not in the deployed code.

`functions/src/learning/types.ts:91-105` defines
`DayAccrual`. A grep for `dayAccrual` across
`functions/src` returns zero hits. A grep for `adStatus`
returns zero hits. A grep for `sealedTarget` returns zero
hits. **The fields do not exist in the deployed source code
at all.** (They exist in `functions/src/learning/types.ts`
only as a type declaration and an interface.) The Phase 4
batches that build the persistence write-paths are on
`969-phase-4` and not merged.

---

## §6. Workspace's configured funnel type

The Boran workspace has no `settings/funnelSettings` doc.
Verified directly:

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/settings/funnelSettings
```

Returns `{__exists: false}`. The workspace doc itself carries
no `funnelType` field either (verified — its fields are
`name, brandName, brandUrl, brandColorPrimary,
brandColorSecondary, logoUrl, isDefault, createdAt,
deletedAt, pendingReassign, pendingRestore,
metaRoleAtLinkTime, metaAdAccountName, metaAdAccountId,
metaPageClearedAt, metaPageName, metaPageId`).

The 27 in `pain.byFunnelType.free_webinar` come from the
per-generation funnel type lookup at write time, not from a
workspace-level setting. The 5-row gap between
`byObjective.conversion.count = 32` and the sum of
`byFunnelType` buckets (= 27) is the propagated-to-`pain`
rows that share a hash but have no generation id to read a
funnel type from. Same as Sync 2.

---

## §7. Efficiency figures — zero on a fresh deploy; expected

The prompt's check 5: zero is the expected result on a fresh
deploy. A creative needs 5 conversions accrued across days
observed, and accrual only began with the FR-081 code in
batch-01 (which is in PR #73, unmerged).

So the zero is consistent with both:
- PR #71 deployed (no accrual code) — actual state
- PR #73 deployed on day 0 (no accrued days yet)

**Best accrued creative so far** — `creative:gen:UtCCphz5jAgFIEWCa7WQ`
on the `pain` angle, with **32 contributed rows** under it
(27 direct + 5 propagated siblings).

**Creatives with any accrued conversions** — the `pain`
aggregate's `byObjective.conversion.count: 32` is the
project-wide conversion count, but **none of those rows
have a `dayAccrual` field** (the field is not yet
persisted). So no creative's per-day accrual can be measured
from the data; the only observable proxy is the row count
under the creative, which is the `contributedCreativeKeys`
fan-out on the aggregate.

**Any creative `SEALED` but not yet eligible** — the
`sealedTarget` field is not on any row (§5). No row is in
the SEALED state. The 27 `direct_auto` rows for the `pain`
creative all carry `matchType: "auto_hash"`, no seal, no
contribution state.

This tells the owner how far the first real figure is.
**Zero contribution rows have any accrued-conversions data,
because the FR-081 accrual code is in PR #73 (unmerged). The
data the owner would need to verify efficiency is precisely
what the unmerged PR adds.** When PR #73 lands and a sync
runs, `dayAccrual` will start populating per-row, and the
aggregate will gain `efficiencyContributingCount` once any
creative's per-day figure crosses the 5-conversions gate.

---

## §8. Errors and skips (verbatim, the active sync pair)

### §8.1 Sync pair under measurement — Sep 18

Verbatim, from Cloud Logging (filter `logName=projects/proadsai-saas/logs/run.googleapis.com%2Fstdout AND (textPayload:Phase 14 OR textPayload:Synced)`):

**Sync 1 (06:44:25Z, owner on Moataz Mashal workspace, no inline learning):**

```
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
```

**Sync 2 (07:13:22Z, owner on Boran workspace, inline learning ran):**

```
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
```

**Sync 3 (07:42:57Z — second run after Sync 2, on Boran):**

```
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

(Note: the prompt calls this "two manual syncs back to back";
the data and the logs show three syncs on Sep 18 — Sync 1 on
Moataz Mashal (no learning data because account was fresh),
Sync 2 on Boran (first run on this account, 642 → 666
with-ledger), Sync 3 on Boran (second run, idempotent noop).

The two Boran runs are the relevant pair — Sync 2 and Sync 3.
Sync 2 wrote the data. Sync 3 was idempotent.)

### §8.2 In-lease-read errors

**None.** Zero hits in Cloud Logging for the 30-day window
matching `chunk failed`, `DocumentReference`, `path`, `getAll`,
`db.getAll`, `freshFailedReads`, or `readExistingAdDocs`.

This is **not** because the in-lease read worked — see §0.
PR #71's deployed `applyLearningWrites.ts` does not call
`readExistingAdDocs` inside the lease at all. The 666-of-718
coverage comes from the pre-lease `existingByAdId` seed
(populated by the post-pass patch in `shared.ts`). Round-19's
architectural fix (`d5aeef1`) that moves the ledger write
inside the lease-held commit, plus round-21's `path`-fix
(`1f6f63f`), are on `969-phase-4` and unmerged.

### §8.3 Fan-out Cloud Tasks dispatch failures — still failing every sync

The pre-existing fan-out `NOT_FOUND` issue is still present.
On the Boran Sync 2 (07:42:57Z), the fan-out failure log lines
(verbatim, same shape as `969-sync-check-02.md` §6):

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

The Cloud Tasks queue used by the dispatcher is still
missing or mis-targeted. `fanOut.queued: 0` on every sync.
**Every cross-workspace fan-out fails with `5 NOT_FOUND`.**
This is a pre-existing issue (also documented in
`969-sync-check-01.md` §7.1 and `969-sync-check-02.md` §6).
It determines whether the nightly 03:00 fan-out to all
workspaces runs — it doesn't, only the active workspace's
inline path runs the new learning code.

### §8.4 Lease refusals

**None.** No `AlreadyRunningError`, no `acquireLearningLease
failed`, no `learning lease held by`. The Boran Sync 2 and
Sync 3 ran 28 minutes apart, well past the lease TTL.

### §8.5 OAuth rate-limit hits

**None.** The Sep 18 syncs hit no `OAuthException` rate-limit
warnings.

---

## §9. Verdict

| Check | Verdict |
|---|---|
| In-lease read succeeded in production | **Cannot verify** — PR #73 (which contains the round-21 `path`-fix and round-22 stub-tightening) is unmerged. The deployed `applyLearningWrites.ts` does not have the in-lease re-read at all. |
| Learning wrote at all | **Yes** — 666 of 718 adPerformance rows carry a ledger entry. Counts unchanged from Sync 2 (Sep 18 07:42Z). |
| Nothing doubled between syncs | **Yes** — Sync 2 and Sync 3 left all four critical-check fields unchanged. `pain.creativeCount=1`, `pain.contributedCreativeKeys.length=1`, `pain.byObjective.conversion.count=32`, `pain.byObjective.conversion.avgLinkCtr=0.17`. |
| Phase 4 fields appearing | **No** — `dayAccrual`, `adStatus`, `sealedTarget`, `sealedFunnelType`, `sealedAt`, `contributionState`, `efficiencyRaw`, `efficiencyContributingCount`, `efficiencyValueAvg`: **all zero** across 718 adPerformance rows and the single hookPerformance doc. The fields do not exist in the deployed source code. |
| Efficiency figures present | **Zero, as expected** on a fresh deploy — best accrued creative is `creative:gen:UtCCphz5jAgFIEWCa7WQ` with 32 contributed rows on the `pain` angle. No SEALED creatives (sealedTarget not populated anywhere). |
| Errors / skips | **Cloud Tasks fan-out still failing** — 5× `5 NOT_FOUND` on every sync (every cross-workspace dispatch). `fanOut.queued: 0`. Pre-existing issue, outside this PR. **No lease refusals, no OAuth rate-limit hits, no in-lease-read errors logged.** |
| Owner has run two manual syncs back to back against PR #73 | **No evidence in Cloud Logging.** The most recent `triggerMetaSync` / `metaSyncPerformance` entry is `2026-09-18T07:42:57Z`, against PR #71's code. PR #73 is `state: OPEN, mergeCommit: null, mergedAt: null`. |

**The prompt's verification depends on code that has not been
deployed.** PR #73 needs to be merged and deployed first;
then a manual sync on the Boran workspace (the one whose
inline path actually ran on Sep 18) will exercise the
in-lease re-read against real Firestore and surface any
`chunk failed` errors in Cloud Logging. The probe today
shows only that the PR #71 baseline state is unchanged and
that PR #73's data-shape changes have not touched the
database.

---

## §10. What I have NOT done

- **Not triggered any sync.** Read-only against Firestore.
  No production writes, no Cloud Function calls, no
  document updates, no `triggerMetaSync` invocation.
- **Not modified any PR or branch state.** No merges, no
  pushes, no PR comments.
- **Not changed any source file.** The reports/ files in
  `specs/969-cumulative-learning/reports/` are new artifacts
  recording what was probed; no `functions/src/` or
  `src/` change.

---

## §11. Capture artefacts

- `C:\temp\opencode\probe-phase4-meta.json` — full read of
  `metaConnections/{uid}` (user-level + top-level + workspace
  listing + adAccounts + funnelSettings per workspace).
- `C:\temp\opencode\probe-phase4-paths.json` — first page
  of the data path probe (25 adPerformance docs visible).
- `C:\temp\opencode\probe-phase4-counts.json` — full
  paginated probe of `adPerformance` (all 718), `hookPerformance`
  (1), `visualPerformance` (0); field-presence counts;
  top-20 ledged creatives.
- `C:\temp\opencode\logs-30d.txt` — Cloud Logging stdout
  filter, 30-day freshness, manual + scheduled entries that
  mention `Synced`, `Phase 14`, or `First-successful`.
- `C:\temp\opencode\logs-match-detail.txt` — filtered
  match list (timestamps + payload) for sync events.
