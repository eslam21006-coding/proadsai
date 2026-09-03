# Phase 970 — Sync Unification · Batch 01 Investigation Report

**Date:** 2026-09-02
**Branch:** `969-cumulative-learning` (worktree `D:/proads-worktrees/cumulative-learning`)
**Scope:** Read-only investigation. No code changed. Implementation awaits approval.
**Project:** `proadsai-saas`

---

## 0. Executive summary

The two-buttons/two-collections problem is real and confirmed. Investigating it surfaced
**three further blocking defects** that mean the Phase 14 sync pipeline has never
successfully run in production by any path — manual, scheduled, or task-dispatched:

| # | Defect | Evidence | Consequence |
|---|---|---|---|
| D1 | Two buttons write two different collections | `index.ts:3883` vs `shared.ts:967` | Known. Dashboard reads a collection the pressed button never writes. |
| D2 | Legacy sync stamps the cooldown field the Phase 14 button reads | `index.ts:3968-3971` → `whatsWorkingDashboard.ts:355-359` | Known. Wrong sync locks out right sync for 1h. |
| **D3** | **`metaDailySync` throws `FAILED_PRECONDITION` on every nightly run** — the `collectionGroup('private').where('metaConnected','==',true)` query needs a `COLLECTION_GROUP_ASC` index exemption that is not in `firestore.indexes.json` (`fieldOverrides: []`) | Cloud Logging, every night 03:00 UTC | Scheduled Phase 14 sync has **never** enqueued a single task. |
| **D4** | **Dispatcher posts the task body un-enveloped** — `dispatcher.ts:100` sends `{userId,…}`, but `onTaskDispatched` reads `req.body.data` (`firebase-functions/lib/common/providers/tasks.js:42`) | Source read | Even with D3 fixed, every task would fail `metaSyncAccountWorker: missing required fields in payload`. |
| **D5** | **Unbounded Graph concurrency in `runSyncForAccount`** — `Promise.allSettled(ads.map(…))` at `shared.ts:559` (3 insights calls/ad) and `shared.ts:703` (1 image download/ad), no limiter | Source read + rate-limit errors in prod logs | ~1,265 simultaneous Graph calls for a 383-ad account. This, not press frequency, is what trips Meta's app-level limit. |

Net: **`triggerMetaSync` has zero request logs in its entire history**, and the only
Phase-14 `adPerformance` data anywhere in the project is 383 docs under a **soft-deleted**
workspace, last written 2026-07-25.

---

## 1. Raw command output

### 1.1 `metaDailySync` — nightly failure (D3)

```
[2026-08-31T03:00:09.188430Z] ERROR metadailysync :: Error: 9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index for collection private and field metaConnected. You can create it here: https://console.firebase.google.com/v1/r/project/proadsai-saas/firestore/indexes?create_exemption=Clhwcm9qZWN0cy9wcm9hZHNhaS1zYWFzL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9wcml2YXRlL2ZpZWxkcy9tZXRhQ29ubmVjdGVkEAIaEQoNbWV0YUNvbm5lY3RlZBAB
    at entryFromArgs (/workspace/node_modules/firebase-functions/lib/logger/index.js:120:13)
    at Object.error (/workspace/node_modules/firebase-functions/lib/logger/index.js:109:8)
    at httpFunc (/workspace/node_modules/firebase-functions/lib/v2/providers/scheduler.js:53:25)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
[2026-09-01T03:00:07.954353Z] ERROR metadailysync :: Error: 9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index for collection private and field metaConnected. …
[2026-09-02T03:00:39.667469Z] ERROR metadailysync :: Error: 9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index for collection private and field metaConnected. …
```

Reproduced locally against production Firestore with the same query:

```
--- collectionGroup private where metaConnected==true (what metaDailySync dispatches) ---
ERR 9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index for collection private and field metaConnected.
```

`firestore.indexes.json` → `fieldOverrides: []` (32 composite indexes, no field overrides).

### 1.2 `triggerMetaSync` — zero request logs since 2026-07-01

```
ENTRIES: 28
[2026-08-04T09:30:26.742249Z] INFO triggermetasync :: Starting new instance. Reason: DEPLOYMENT_ROLLOUT …
[2026-08-04T09:30:29.148647Z] INFO triggermetasync :: Default STARTUP TCP probe succeeded after 1 attempt for container "worker" on port 8080.
… (26 more, all DEPLOYMENT_ROLLOUT cold starts / probes) …
[2026-09-02T18:41:10.246268Z] INFO triggermetasync :: Default STARTUP TCP probe succeeded after 1 attempt for container "worker" on port 8080.
```

No `🔄 Manual sync (owner=…)` line (`trigger.ts:87`) has ever been emitted.
`metasyncaccountworker` likewise: cold starts only.

### 1.3 `metaSyncPerformance` — today's three runs, and the rate limit

```
[2026-09-02T15:44:58.041737Z]  metasyncperformance :: 📊 Synced 529 ads across 23 accounts (owner=ywpCgWsXqVP4tlNwfhSoTqMjRw52, caller=W2NejafltNbRLhlHQTesow1HRwU2)
[2026-09-02T15:49:53.982953Z]  metasyncperformance :: 📊 Synced 529 ads across 23 accounts (owner=ywpCgWsXqVP4tlNwfhSoTqMjRw52, caller=W2NejafltNbRLhlHQTesow1HRwU2)
[2026-09-02T18:51:50.238194Z]  metasyncperformance :: Meta insights error for account act_1163959057640939: {
  message: 'Application request limit reached',
  type: 'OAuthException',
  is_transient: true,
  code: 4,
  error_subcode: 1504022,
  error_user_title: 'Too many API requests',
  error_user_msg: 'There have been too many calls from this app. Wait a bit and try again. For more info, please refer to https://developers.facebook.com/docs/marketing-api/insights/best-practices/#insightscallload.',
  fbtrace_id: 'An4emhx1YASvpT42xnbuqHF'
}
[2026-09-02T18:52:38.961890Z]  metasyncperformance :: 📊 Synced 429 ads across 23 accounts (owner=ywpCgWsXqVP4tlNwfhSoTqMjRw52, caller=W2NejafltNbRLhlHQTesow1HRwU2)
```

Wall-clock per run (first log line → completion): 68s, 68s, 62s. Function timeout is **120s**
(`index.ts:3759`), memory default **256 MiB** (no `memory` option set).

### 1.4 Workspace-scoped Phase 14 data — the whole project

```
=== 9n2zPb3Z6D7IRBOLSXi0 "Khloud" LIVE linked=act_1451373605463040
   acct act_1451373605463040: adPerformance=0 hookPerf=0 visualPerf=0 baselines=false snapshots=0

=== PW1TwIwxvHNxJ0lY6JFI "Eslam Salah" LIVE linked=act_781389063661831
   acct act_781389063661831: adPerformance=0 hookPerf=0 visualPerf=0 baselines=false snapshots=0

=== ZVASEGdrF5qbizl4Bbug "Boran" LIVE linked=act_1180773537404268
   acct act_1180773537404268: adPerformance=0 hookPerf=0 visualPerf=0 baselines=false snapshots=0

=== dueXIiFdEJKuAjSuYlUX "Lina" DELETED@2026-08-01T14:18:58.157Z linked=act_995888422231015
   acct act_995888422231015: adPerformance=383 hookPerf=0 visualPerf=0 baselines=true snapshots=7
      latest snapshot: 2026-07-25T09:46:40.710Z trigger=manual counts={"ads":383,"campaigns":25,"adSets":85,"matched":0,"ambiguous":0,"unmatched":383} status=ok

=== kmuu4ZUMbsK5jnMCwglH "Ghizlan" LIVE linked=act_1163959057640939
   acct act_1163959057640939: adPerformance=0 hookPerf=0 visualPerf=0 baselines=false snapshots=0

=== m5VqQlf6bL2wWUVQDCy6 "Lina" LIVE linked=act_995888422231015
   acct act_995888422231015: adPerformance=0 hookPerf=0 visualPerf=0 baselines=false snapshots=0

--- any workspace-scoped adPerformance anywhere ---
distinct adAccount paths with syncSnapshots: 1
   users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/dueXIiFdEJKuAjSuYlUX/adAccounts/act_995888422231015 -> adPerformance=383
```

> **Probe note.** `ws.collection('adAccounts').get()` returns 0 even where data exists — the
> `adAccounts/{id}` parent documents are never created, only their subcollections. Any future
> probe must use `listDocuments()`. Same reason `collectionGroup('adAccounts')` returns 0.

### 1.5 Root `/adPerformance` — what the legacy path actually holds

```
ROOT /adPerformance total rows for owner: 700
  act_995888422231015: rows=101 spend=23828.25
  act_1180773537404268: rows=153 spend=14095.18
  act_1163959057640939: rows=140 spend=9283.47
  act_1366487675484883: rows=107 spend=6384.09
  act_437983975409008: rows=82 spend=5585.18
  act_781389063661831: rows=88 spend=2532.89
  act_1454723818838899: rows=26 spend=617.15
  act_1238105357423284: rows=1 spend=286.39
  act_1080792863676655: rows=1 spend=69.87
  act_493408227392229: rows=1 spend=26.54
```

Latest `syncedAt` per account: all `2026-09-02T18:51:41Z`–`18:52:38Z` except
`act_1163959057640939` (`15:49:00Z` — the rate-limited account, skipped at 18:51) and
`act_1080792863676655` (`2026-08-29`).

### 1.6 Cloud Tasks queues (both exist, both RUNNING)

```
{
 "queues": [
  {
   "name": "projects/proadsai-saas/locations/europe-west1/queues/metaSyncAccountWorker",
   "rateLimits": { "maxDispatchesPerSecond": 500, "maxBurstSize": 100, "maxConcurrentDispatches": 5 },
   "retryConfig": { "maxAttempts": 3, "minBackoff": "30s", "maxBackoff": "600s", "maxDoublings": 16 },
   "state": "RUNNING"
  },
  {
   "name": "projects/proadsai-saas/locations/europe-west1/queues/metaSyncQueue",
   "rateLimits": { "maxDispatchesPerSecond": 500, "maxBurstSize": 100, "maxConcurrentDispatches": 5 },
   "retryConfig": { "maxAttempts": 3, "minBackoff": "0.100s", "maxBackoff": "3600s", "maxDoublings": 16 },
   "state": "RUNNING"
  }
 ]
}
```

Note the dispatcher enqueues to **`metaSyncQueue`** (`dispatcher.ts:19`) while the
`onTaskDispatched` worker is bound to the auto-provisioned **`metaSyncAccountWorker`** queue.
Both accept the task (the dispatcher builds a raw `httpRequest` task with OIDC), so this is not
itself fatal — but the retry/backoff config that actually applies is `metaSyncQueue`'s, not the
one declared in `worker.ts:33-40`.

### 1.7 `metaLegacySync` (4am scheduled) — succeeds nightly

```
[2026-09-02T04:02:03.953254Z]  metalegacysync :: ✅ [metaLegacySync] complete: 3 success, 0 errors
```

(Its `creativeMemory` sub-step fails on a separate missing `creativeMemory (userId, createdAt)`
composite index — out of scope, logged for the record.)

---

## 2. (a) Every reader of root `/adPerformance` and `/adPerformanceHistory`

### `/adPerformance` — writers

| file:line | Function | Scope | Keying |
|---|---|---|---|
| `functions/src/index.ts:3883` | `metaSyncPerformance` (callable — the **sidebar button**) | all `status===1` accounts on `metaConnections/{ownerUid}` | `{ownerUid}_{adId}`, `merge:true` |
| `functions/src/index.ts:6457` | `metaLegacySync` (scheduled, 04:00 UTC daily) | all `metaConnections` with `status==='active'` | `{uid}_{adId}`, `merge:true` |

### `/adPerformance` — readers

| file:line | Caller | Query | Breaks if legacy write path changes? |
|---|---|---|---|
| `src/components/PerformanceDashboard.tsx:140` | Old Performance Dashboard (client) | `where userId == uid` + optional `where workspaceId == ws` | **Yes.** This is the surface the requirement says must keep showing current data. |
| `src/services/feedbackService.ts:499` | Client-side AI prompt context | `where userId == uid`, `orderBy syncedAt desc`, `limit 20` | Yes — silently degrades prompt quality (no error). |
| `functions/src/serverUtils.ts:117` | Server-side AI prompt context (`buildUserContext`) | `where userId == uid`, `orderBy syncedAt desc`, `limit 20` | Yes — same, silent. |
| `functions/src/index.ts:3732` | `metaDisconnect` — deletes all owner rows in 500-doc chunks | `where userId == ownerUid` | No (delete-only). |
| `functions/src/index.ts:6673` | Meta data-deletion webhook — deletes rows | `where userId == doc.id` | No (delete-only). |

Security rule: `firestore.rules:248` — client **read-only**, `resource.data.userId == request.auth.uid`.
Indexes: `(userId ASC, syncedAt DESC)` — `firestore.indexes.json`.

### `/adPerformanceHistory` — writers

| file:line | Function |
|---|---|
| `functions/src/index.ts:3887` | `metaSyncPerformance` only. `metaLegacySync` does **not** write history. |

Doc id `{ownerUid}_{adId}_{since}_{until}` — with a rolling 30-day window this means **one new
doc per ad per calendar day**, never pruned.

### `/adPerformanceHistory` — readers

| file:line | Caller | Query |
|---|---|---|
| `functions/src/patternSummaries.ts:278` | `runFullReconciliation` / `runIncrementalRollup` (invoked by `patternSummariesIncremental` / `patternSummariesReconcile`, `index.ts:4531`/`4549`) | **unfiltered global scan**, `limit(10000)` (`CAPS.PERF_HISTORY`) |

Rule: `firestore.rules:265` — client read own docs, `write: if false`.

### Verdict on (a)

**Nothing breaks if we leave the legacy write path exactly as it is.** The safe design is
strictly additive: keep `metaSyncPerformance`'s body byte-identical in behaviour and *add* the
Phase 14 leg alongside it. No reader above needs to change.

Two pre-existing data-fidelity gaps, reported not fixed:

- **The legacy fetch is capped at 100 ads per account with no pagination** (`index.ts:3823`,
  `limit=100`, no `paging.next` follow). The old Performance Dashboard silently misses ads
  beyond the first 100 per account.
- **`/adPerformanceHistory` grows one doc per ad per day forever** and `patternSummaries` scans
  it unfiltered at 10,000 docs. It will hit the cap and start producing partial rollups.

### Phase 14 collection — for symmetry

Path: `users/{uid}/workspaces/{wid}/adAccounts/{aid}/adPerformance/{adId}`

| file:line | Role |
|---|---|
| `functions/src/metaSync/shared.ts:967` | writer (`runSyncForAccount`) |
| `functions/src/whatsWorkingDashboard.ts:374` | reader — What's Working dashboard |
| `functions/src/getTopWinners.ts:154` | reader — `loadTopWinners`, feeds generation prompts (`index.ts:4805`) |
| `functions/src/linkUnmatchedAd.ts:125` | writer — manual ad↔generation linking |
| `functions/src/generationDeleteCascade.ts:71` | writer — marks `metadataAvailable=false` on generation delete |

`getTopWinners` is a second consumer that has been starved by the same root cause — worth noting
that fixing the sync also un-breaks winner-informed generation prompts.

---

## 3. (b) How each sync is scoped

| | Sidebar (`metaSyncPerformance`) | Dashboard (`triggerMetaSync`) |
|---|---|---|
| Entry | `App.tsx:4184` → `metaService.ts:183` | `App.tsx:12960` → `metaService.ts:219` |
| Also called from | `PerformanceDashboard.tsx:171` (`handleSync`, **no** workspaceId) | — |
| Auth scope | `resolveMetaScope` → `ownerUid` | `resolveMetaScope` → `ownerUid` + `assertWorkspaceAllowed` |
| Account source | `metaConnections/{ownerUid}.adAccounts` filtered `status===1 \|\| account_status===1`; falls back to `selectedAccountId` | `loadStoredConnection(ownerUid, workspaceId).accountId` — exactly one |
| Accounts per press | **23** (today) | **1** |
| Workspaces per press | 0 — account-global; `workspaceId` is only used for (i) an `INSUFFICIENT` role pre-check and (ii) the `lastMetaSyncAt` stamp | **1** |
| Ads per account | ≤100, unpaginated | full hierarchy: campaigns → ad sets → ads (383 measured for `act_995888422231015`) |
| Graph calls per ad | 0 (one account-level insights call total) | **3** insights + 0–1 creative fetch + 1 image download |
| Does matching? | No | Yes (`loadWorkspaceFingerprints` — **workspace-scoped**) |
| Writes verdicts / baselines / hook+visual aggregates? | No | Yes |
| Runtime | 120s / 256 MiB | 540s / 2 GiB |
| Measured duration | 62–68s | never run |

**The scope difference is not symmetric and cannot be waved away.** Phase 14 output is keyed by
workspace *and* its matching index is workspace-scoped, so an ad account not linked to any
workspace has nowhere to write. Today:

- 23 active accounts on the connection
- **6** live workspace↔account pairs, over **5 distinct accounts**
- `act_781389063661831` is linked to **two** live workspaces (`PW1TwIwxvHNxJ0lY6JFI` "Eslam
  Salah" and `5ZRdOCRnSKamHTiJd07F` "Manar") — a naive "sync every workspace" loop fetches that
  account twice
- 12 live workspaces have **no** linked account and no `private/metaConnection` doc at all

So "both buttons do the full job" resolves to:

> **Leg A (legacy):** every active account on the connection — 23 today.
> **Leg B (Phase 14):** every *live* workspace with a linked, connected account — 6 pairs / 5
> distinct accounts today.

These two sets are deliberately different sizes. That is inherent to the two data models, not a
bug to unify away.

---

## 4. (c) Every cooldown site

### Backend

| file:line | What |
|---|---|
| `functions/src/metaSync/trigger.ts:23` | `const COOLDOWN_MS = 60 * 60 * 1000` |
| `functions/src/metaSync/trigger.ts:59-71` | reads `lastMetaSyncAt`, throws `HttpsError("resource-exhausted", "Sync cooldown active — try again in N minutes.")` |
| `functions/src/metaSync/trigger.ts:99-110` | `readLastSyncAt()` helper — exists only for the cooldown |
| `functions/src/metaSync/trigger.ts:4` | file header comment documenting the cooldown |
| `functions/src/whatsWorkingDashboard.ts:91` | `const SYNC_COOLDOWN_MS = 60 * 60 * 1000` |
| `functions/src/whatsWorkingDashboard.ts:104-105` | `SyncStatus.canSyncNow` / `cooldownEndsAt` fields |
| `functions/src/whatsWorkingDashboard.ts:355-359` | computes `cooldownEndsAt` / `canSyncNow` |
| `functions/src/whatsWorkingDashboard.ts:368-369` | emits them in the response |

### The field itself

`users/{uid}/workspaces/{wid}/private/metaConnection.lastMetaSyncAt` (epoch ms, number).

| Writer | file:line |
|---|---|
| `runSyncForAccount` via `patchStoredConnection` | `metaSync/shared.ts` (multiple sites) |
| `metaSyncPerformance` — the cross-contamination | `functions/src/index.ts:3968-3971` |

| Reader | file:line | Purpose |
|---|---|---|
| `triggerMetaSync.readLastSyncAt` | `trigger.ts:99` | cooldown gate — **remove** |
| `whatsWorkingDashboard` | `whatsWorkingDashboard.ts:~350` | cooldown **and** the "Synced N minutes ago" display — **keep the display, drop the gate** |

The field must survive; only its use as a gate goes.

### Frontend

| file:line | What |
|---|---|
| `src/components/WhatsWorkingDashboard.tsx:20-21` | `SyncStatus.canSyncNow` / `cooldownEndsAt` type fields |
| `src/components/WhatsWorkingDashboard.tsx:173` | `disabled={!status.canSyncNow}` |
| `src/components/WhatsWorkingDashboard.tsx:175-179` | greyed styling branch (`bg-slate-800 text-slate-500 cursor-not-allowed`) |
| `src/components/WhatsWorkingDashboard.tsx:180-182` | label swap → `t("whats_working.sync.cooldown")` |
| `src/App.tsx:12976-12978` | catch branch → toast `'Sync on cooldown — try again later'` / `'المزامنة في فترة انتظار — حاول لاحقاً'` (hard-coded, not i18n) |
| `src/services/metaService.ts:236-243` | swallows `resource-exhausted` into a soft `{ok:false}` |
| `src/services/metaService.ts:194-205` | comment block describing the cooldown contract |

### i18n strings to delete

| key | EN (`i18n.tsx:498`) | AR (`i18n.tsx:1435`) |
|---|---|---|
| `whats_working.sync.cooldown` | `Synced just now — try again later` | `تمت المزامنة للتو — حاول لاحقاً` |

Plus the two hard-coded strings at `App.tsx:12977`.

`whats_working.sync.next_run` (`i18n.tsx:496` / `1433`, "Next sync in {n} hours" /
"المزامنة التالية بعد {n} ساعة") is **not currently rendered** by any component — `nextScheduledSyncAt`
is returned but never displayed. Flagging it: it is a wait-state string and should go too, or be
left dormant. **Decision needed.**

### Tests referencing the cooldown

| file:line | What |
|---|---|
| `functions/src/__tests__/whatsWorkingDashboard.test.ts:174-190` | two tests asserting `canSyncNow=false` within 1h / `true` after |
| `functions/src/__tests__/metaSync.contract.test.ts:10` | header comment |

`App.tsx:3279`, `6825`, `7744`, `7917` also handle `resource-exhausted` — those are **credit**
exhaustion on generation callables, unrelated. Not touching them.

---

## 5. (d) Can the Phase 14 sync cover all connected accounts in one press?

**Not as written, and not by simply looping — but the fan-out machinery already exists and is
90% wired.**

Three blockers, all fixable:

1. **D3 — missing index.** `metaDailySync`'s discovery query needs a single-field collection-group
   exemption on `private.metaConnected`. Add to `firestore.indexes.json`:
   ```json
   "fieldOverrides": [
     { "collectionGroup": "private", "fieldPath": "metaConnected",
       "indexes": [ { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" } ] }
   ]
   ```
2. **D4 — task body envelope.** `dispatcher.ts:100` sends the payload bare; `onTaskDispatched`
   reads `req.body.data`. Must wrap: `Buffer.from(JSON.stringify({ data: { … } }))`.
3. **Discovery is unfiltered by workspace state.** `listConnectedAccounts` (`dispatcher.ts:41-66`)
   pulls every `private/metaConnection` with `metaConnected===true` — including the **soft-deleted**
   `dueXIiFdEJKuAjSuYlUX`, and it hits the same account twice for the two workspaces sharing
   `act_781389063661831`. Needs a `deletedAt == null` join and account de-duplication.

**Doing it inline instead is not viable at current data size.** One account
(`act_995888422231015`, 383 ads) already means ~1,265 Graph calls plus 383 image downloads.
Six pairs inline in a single 540s / 2 GiB request would fire ~7,600 concurrent Graph calls and
buffer ~2,300 images. That will trip Meta's app-level limit and likely OOM.

**Conclusion:** the Phase 14 leg must fan out per workspace-account pair via Cloud Tasks — with
one exception, below.

---

## 6. (e) Cost and time if both syncs run on every press

### Per press, current data

| | Leg A (legacy, 23 accounts) | Leg B — one account (383 ads) | Leg B — all 5 distinct accounts |
|---|---|---|---|
| Graph API calls | 23 | ~1,265 | ~4,000–6,300 |
| Image downloads | 0 | 383 (~38 MB) | ~1,500 (~150 MB) |
| Firestore reads | ~1,000–1,600 | ~390 | ~2,000 |
| Firestore writes | ~1,060 | ~390 | ~2,000 |
| Wall clock | **62–68s measured** | est. 40–90s bounded | est. 3–8 min via queue @ 5 concurrent |

### Money

Negligible, and not the constraint.

- Firestore writes: ~3,000/press × $0.18 per 100k ≈ **$0.005/press**
- Firestore reads: ~3,600/press × $0.06 per 100k ≈ **$0.002/press**
- Compute: 2 GiB × ~150s ≈ 300 GB-s ≈ **$0.0008/press**
- Egress: Graph→Function ingress is free; image bytes are inbound

**≈ $0.01 per press.** Even 200 presses/day is ~$2/day. Money is not the risk.

### The actual constraint: Meta's app-level rate limit

Today's logs show `OAuthException code 4 / subcode 1504022` firing on the **cheap** legacy path
at 23 account-level calls. The Phase 14 path is roughly **50× more Graph calls per ad**. Meta's
`code 4` limit is **app-wide**, not per-user — one person hammering the button degrades sync for
every customer on the app.

Two honest observations:

1. **The unbounded `Promise.allSettled` (D5) is the dominant cause, not press frequency.** A
   single Phase 14 sync of one 383-ad account fires ~1,149 insights calls with no limiter
   (`shared.ts:559`). Bounding that to ~8 concurrent removes far more rate-limit pressure than
   any cooldown ever did.
2. **Removing the cooldown without bounding concurrency will make rate-limit errors routine.**
   The mitigation is a limiter + de-duplication + graceful reporting — all of which are
   compatible with "press it as often as you like".

### Non-cooldown safeguard — **APPROVED 2026-09-03**

An **in-flight guard**: if a sync for this owner is already running, the second press returns
"a sync is already running" instead of starting a duplicate. This is a concurrency guard, not a
time-based cooldown — pressing again the instant the first finishes works. Today's logs show two
presses 5 minutes apart producing byte-identical results (529 ads twice), i.e. the second press
was pure waste.

Implementation constraints for the guard, so it can never degrade into a cooldown:

- Keyed on a **lease document** with a short TTL (≤10 min, i.e. longer than the worst-case run,
  shorter than any plausible stuck state), cleared in a `finally` block on every exit path
  including thrown errors.
- **Never** keyed on `lastMetaSyncAt` — that field is what caused D2. It stays display-only.
- A stale lease (TTL expired) is ignored and overwritten, so a crashed run cannot lock the button.
- The user-facing string is "a sync is already running", not "try again later" — it describes a
  state, not a wait.

---

## 7. (3) Button labels today

| Button | Key | EN | AR |
|---|---|---|---|
| Sidebar menu item (`App.tsx:1582`) | `topbar.menu_meta_sync` | `Sync Now` | `قم بالمزامنة` |
| Sidebar main Meta entry (`App.tsx:1536`) | `topbar.menu_meta_connected` (click → sync) | — | — |
| Dashboard button (`WhatsWorkingDashboard.tsx:181`) | `whats_working.sync.cta` | `Sync Now` | `مزامنة الآن` |
| Dashboard button, blocked state (`:182`) | `whats_working.sync.cooldown` | `Synced just now — try again later` | `تمت المزامنة للتو — حاول لاحقاً` |
| Old Performance Dashboard (`PerformanceDashboard.tsx:171`) | *(inline `handleSync`)* | — | — |

English already agrees. **Arabic does not**: `قم بالمزامنة` (imperative "do the syncing") vs
`مزامنة الآن` ("sync now"). Proposal: both point at one shared key pair, Arabic standardised on
**`مزامنة الآن`** — simple Fusha, matches the existing backend constant
`AR_S_RESYNC_CONNECTED_BTN` (`whatsWorkingDashboard.ts:38`). `whats_working.sync.cooldown` is
deleted; the button has exactly one label and one enabled state.

---

## 8. Proposed implementation

### 8.1 Shape — one orchestrator, two existing callables

Create `functions/src/metaSync/orchestrator.ts` exporting:

```ts
runFullSync({ ownerUid, callerUid, activeWorkspaceId }): Promise<FullSyncResult>
```

Both existing callables become thin wrappers over it. **No new callable name**, so no client
authorization or deployment surface changes, and any stale client keeps working:

- `metaSyncPerformance` (`index.ts:3756`) → `resolveMetaScope` → `runFullSync`
- `triggerMetaSync` (`trigger.ts:29`) → `resolveMetaScope` + `assertWorkspaceAllowed` → `runFullSync`

`metaSyncPerformance`'s runtime options must be raised from **120s / 256 MiB → 540s / 2 GiB** to
match the trigger, since it now carries the inline Phase 14 leg.

### 8.2 What `runFullSync` does

**Leg A — legacy, account-global, inline.** The current `metaSyncPerformance` body extracted
verbatim into `runLegacySyncForOwner(ownerUid)`. Behaviour unchanged, so every reader in §2 is
unaffected. Keeps root `/adPerformance` + `/adPerformanceHistory` fresh for the old Performance
Dashboard and the AI prompt context. ~65s.

**Leg B — Phase 14, workspace-scoped, hybrid:**

- **Inline** for `activeWorkspaceId` (when there is one): `runSyncForAccount` for that single
  workspace-account pair. The user always sees *their own* dashboard refresh synchronously, which
  is the experience the button promises.
- **Fanned out** via Cloud Tasks for every *other* live workspace with a linked, connected
  account, de-duplicated by account id. Lands within a couple of minutes.
- When there is no active workspace (the old Performance Dashboard's `handleSync`, or a
  non-workspace plan), *all* pairs fan out and nothing runs inline.

**Return shape** — one result both buttons render:

```ts
{
  ok: boolean,
  legacy: { accountsSynced: number, adsSynced: number, rateLimited: string[] },
  workspace: {
    inline: { workspaceId, accountId, counts: {ads, matched, ambiguous, unmatched} } | null,
    queued: number,
    rateLimited: string[]
  },
  needsReauth: boolean,
  lastMetaSyncAt: number
}
```

### 8.3 Supporting fixes (required for the above to work)

1. **D3** — add the `private.metaConnected` `COLLECTION_GROUP_ASC` field override to
   `firestore.indexes.json` and deploy indexes.
2. **D4** — wrap the dispatcher's task body in `{ data: … }` (`dispatcher.ts:100`).
3. **D5** — add a small concurrency limiter (~8) around the two unbounded `Promise.allSettled`
   maps in `shared.ts:559` and `shared.ts:703`. **This does not touch matching logic** — the
   limiter wraps the same calls in the same order; `matchAdCreative` and `loadWorkspaceFingerprints`
   are untouched.
4. **Discovery filter** — `listConnectedAccounts` joins the parent workspace doc and skips
   `deletedAt != null`; de-duplicates by `accountId`. Shared by the dispatcher and Leg B's fan-out.
5. **Rate-limit classification** — a `isMetaRateLimit(err)` helper matching
   `code === 4 && error_subcode === 1504022` (plus `code 17 / subcode 2446079`, the per-user
   variant). Rate-limited accounts are collected into `rateLimited[]` and reported, never thrown.
   Applied to both legs.

### 8.4 Cooldown removal — exhaustive list

Delete every site enumerated in §4:

- `trigger.ts`: `COOLDOWN_MS`, the gate block (`:59-71`), `readLastSyncAt` (`:99-110`), header comment
- `whatsWorkingDashboard.ts`: `SYNC_COOLDOWN_MS` (`:91`), `canSyncNow`/`cooldownEndsAt` from the
  `SyncStatus` interface (`:104-105`), the computation (`:355-359`), the response fields (`:368-369`).
  **`lastMetaSyncAt` stays** — it drives "Synced N minutes ago".
- `WhatsWorkingDashboard.tsx`: type fields (`:20-21`), `disabled` (`:173`), greyed branch
  (`:175-179`), label swap (`:180-182`) → always `t("whats_working.sync.cta")`, always enabled
- `App.tsx:12976-12978`: the `resource-exhausted` toast branch
- `metaService.ts:236-243`: the `resource-exhausted` swallow; `:194-205` comment rewritten
- `i18n.tsx`: delete `whats_working.sync.cooldown` EN (`:498`) + AR (`:1435`)
- Tests: `whatsWorkingDashboard.test.ts:174-190` replaced with an assertion that no cooldown field
  is emitted

### 8.5 Labels

Sidebar and dashboard both use `whats_working.sync.cta`; `topbar.menu_meta_sync` AR changed
`قم بالمزامنة` → `مزامنة الآن` (or the key is aliased). Both buttons say the same thing because
they now do the same thing.

### 8.6 New user-facing strings (EN + simple Fusha, no technical terms)

| key | EN | AR |
|---|---|---|
| `sync.result.done` | `Ads updated` | `تم تحديث الإعلانات` |
| `sync.result.partial` | `Some accounts were busy — they will update shortly` | `بعض الحسابات كانت مشغولة — سيتم تحديثها قريباً` |
| `sync.result.more_coming` | `The rest of your workspaces are updating now` | `باقي مساحات العمل يتم تحديثها الآن` |
| `sync.result.failed` | `Could not update the ads` | `تعذّر تحديث الإعلانات` |

No "rate limit", "API", "quota", "sync queue", "cooldown".

### 8.7 Tests — all registered in `functions/package.json`

| file | Covers |
|---|---|
| `functions/src/__tests__/metaSyncOrchestrator.test.ts` | both legs invoked once per press; inline-vs-queued split; no-active-workspace path; soft-deleted workspaces excluded; duplicate account de-duplicated; result shape |
| `functions/src/__tests__/metaSyncRateLimit.test.ts` | `code 4 / 1504022` and `code 17 / 2446079` classified as rate-limited, reported not thrown; run still `ok` |
| `functions/src/__tests__/metaSyncDispatch.test.ts` | task body is `{data:{…}}`; discovery filters `deletedAt`; de-duplication |
| `functions/src/__tests__/whatsWorkingDashboard.test.ts` (edit) | cooldown tests replaced — response carries no `canSyncNow` / `cooldownEndsAt` |

Registered as `test:phase970:*` scripts plus appended to the aggregate `test` script — matching
the existing `test:phase14:*` convention.

### 8.8 Reversibility

- `MODEL`-style flag not needed; the change is additive. Reverting the orchestrator commit
  restores both callables to their current bodies.
- No Firestore schema change. No document is deleted or reshaped. The index field-override is
  additive.
- The cooldown fields are removed from the response, not renamed — an old cached client reading
  `canSyncNow === undefined` renders the button as `disabled={!undefined}` → `disabled={true}`.
  **Mitigation: ship `canSyncNow: true` / `cooldownEndsAt: null` as frozen constants for one
  release**, then delete. Flagged for your call.

---

## 9. Decisions — resolved 2026-09-03

| # | Decision | Resolution |
|---|---|---|
| 1 | **In-flight guard** (§6) | **Approved.** Lease-based, ≤10 min TTL, cleared in `finally`, stale leases ignored. Never keyed on `lastMetaSyncAt`. |
| 2 | **Stale-client compatibility** (§8.8) | **Freeze for one release.** Backend keeps emitting `canSyncNow: true` / `cooldownEndsAt: null` as literal constants; frontend stops reading them. Deleted in a follow-up phase. |
| 3 | **Fan-out scope** | **All of the owner's live workspaces**, regardless of which team member presses. `resolveMetaScope` already resolves member → owner; the data is owner-scoped. Both buttons stay equivalent across users. |
| 4 | **`whats_working.sync.next_run`** (§4) | **Delete**, both languages. It is a wait-state string and is not rendered by any component. Author's call under the "any UI string about waiting is removed" constraint. |
| 5 | **Feature directory** | `specs/970-sync-unification/`. Next free number after 969; author's call, trivially renamable before the commit. |

### Consequence of decision 2 on §8.4

The cooldown-removal list changes in exactly one place: `whatsWorkingDashboard.ts:368-369` keeps
emitting the two fields as **frozen constants** (`canSyncNow: true`, `cooldownEndsAt: null`)
rather than being deleted. `SYNC_COOLDOWN_MS` (`:91`) and the computation (`:355-359`) still go.
The `SyncStatus` interface keeps both fields, annotated as deprecated-for-one-release. Everything
else in §8.4 is unchanged, including the frontend deletions — the current client stops reading
them immediately, so the frozen values exist purely for browsers on cached JS.

---

## 10. Out of scope / reported only

- Legacy fetch capped at 100 ads/account, unpaginated (`index.ts:3823`)
- `/adPerformanceHistory` unbounded growth vs `patternSummaries`' 10,000-doc scan cap
- `metaLegacySync`'s missing `creativeMemory (userId, createdAt)` composite index
- `dispatcher.ts` enqueues to `metaSyncQueue` while `worker.ts` declares retry config for the
  auto-provisioned `metaSyncAccountWorker` queue — the declared config is inert
- Matching logic and learning aggregates: untouched, per constraint
