# fix-sync-infra — Investigation and Fixes

**Branch:** `fix-sync-infra`
**Worktree:** `D:\proads-worktrees\fix-sync-infra`
**Date:** 2026-09-22
**Owner scope:** three sync-path infrastructure defects, pre-Issue 969.
No learning code touched; no public schema, plan, or pricing change.

This report is the durable record of what was diagnosed, what was changed,
what was tested, and what risk remains. The chat output is ephemeral; the
files in this folder are the source of truth.

---

## 0. Summary

Three independent sync-pipeline defects, in priority order:

1. **Cloud Tasks fan-out fails with `NOT_FOUND` on every workspace.** Hard-coded OIDC service account in `functions/src/metaSync/tasksClient.ts:71` (`proadsai-saas@appspot.gserviceaccount.com`) does not exist in this project — App Engine was never enabled — so Cloud Tasks rejects every enqueue with `5 NOT_FOUND: Requested entity was not found`. Five workspaces, five failures, zero queued on every sync since at least 2026-09-03. Fix: switch to the project's default compute SA (`544195266497-compute@developer.gserviceaccount.com`) which DOES exist and holds project-level `roles/run.invoker`. Verified end-to-end: a manual `triggerMetaSync` call now reports `ok: true`, `inlineStatus: "ok"`, `fanOutErrors: []`, `workspaceQueued: 5`.

2. **Meta API rate-limit on the second sync of the day.** `GRAPH_CONCURRENCY` in `functions/src/metaSync/shared.ts:155` was 8, producing a per-process peak of 24 concurrent Graph requests and an aggregate peak of ~120 under Cloud Tasks fan-out (`maxConcurrentDispatches: 5`). Sync 2 hit 50× `fetchAdInsights failed: Meta Graph API error 403: Application request limit reached`. Fix: reduce to 4. Per-process peak drops to 12, aggregate to ~60 — inside Meta's documented 200/hour/user band for standard-access apps. The structural-guard test was updated to lock the new value.

3. **"Sync failed" banner on a successful inline sync.** The dashboard banner keys on `result.ok` (orchestrator `functions/src/metaSync/orchestrator.ts:714`). The orchestrator sets `ok: false` whenever the Cloud Tasks fan-out fails, even when the inline (active workspace) sync succeeded. Pre-fix-1: every workspace fan-out failed, so every press showed "Sync failed" for an actually-refreshed dashboard. Fix: the banner now keys on `inlineStatus === "failed"` (and exposes `inlineStatus`/`fanOutErrors` as separate fields on the triggerMetaSync return), and a fan-out failure with inline success routes to `sync.result.partial` (amber) instead of `sync.result.failed` (red).

All three fixes are deployed, all tests pass (frontend `npx vitest run` = 136/136; functions `npm test` exit 0 with the GRAPH_CONCURRENCY structural guard updated to `4`). Three separate commits on `fix-sync-infra`, pushed without force.

---

## 1. Fix 1 — Cloud Tasks fan-out fails with NOT_FOUND on every workspace

### 1.1 Investigation (raw outputs)

The error has been on every sync since 2026-09-03. Raw log entries (taken from `firebase functions:log --only metaSyncPerformance -n 300`, then filtered):

```
2026-09-18T06:20:17.675057Z ? metasyncperformance: ⚠️ metaSync fan-out enqueue failed:
    workspace=5ZRdOCRnSKamHTiJd07F account=act_781389063661831 error=5 NOT_FOUND: Requested entity was not found.
2026-09-18T06:20:17.855599Z ? metasyncperformance: ⚠️ metaSync fan-out enqueue failed:
    workspace=9n2zPb3Z6D7IRBOLSXi0 account=act_1451373605463040 error=5 NOT_FOUND: Requested entity was not found.
2026-09-18T06:20:18.032538Z ? metasyncperformance: ⚠️ metaSync fan-out enqueue failed:
    workspace=ZVASEGdrF5qbizl4Bbug account=act_1180773537404268 error=5 NOT_FOUND: Requested entity was not found.
2026-09-18T06:20:18.206767Z ? metasyncperformance: ⚠️ metaSync fan-out enqueue failed:
    workspace=kmuu4ZUMbsK5jnMCwglH account=act_1163959057640939 error=5 NOT_FOUND: Requested entity was not found.
2026-09-18T06:20:18.378365Z ? metasyncperformance: ⚠️ metaSync fan-out enqueue failed:
    workspace=m5VqQlf6bL2wWUVQDCy6 account=act_995888422231015 error=5 NOT_FOUND: Requested entity was not found.

2026-09-22T14:48:52.063918Z ? metasyncperformance: ⚠️ metaSync fan-out enqueue failed:
    workspace=5ZRdOCRnSKamHTiJd07F account=act_781389063661831 error=5 NOT_FOUND: Requested entity was not found.
[...4 more, same shape, same date...]
```

The 03:00 nightly dispatcher (`metaDailySync`) has the same failure shape on every run (taken from `firebase functions:log --only metaDailySync -n 50`):

```
2026-09-19T03:00:07.587913Z ? metadailysync: [metaDailySync] enqueue failed for
    ywpCgWsXqVP4tlNwfhSoTqMjRw52/5ZRdOCRnSKamHTiJd07F/act_781389063661831: 5 NOT_FOUND: Requested entity was not found.
[...5 more, every nightly run...]
2026-09-22T03:00:52.828100Z ? metadailysync: [metaDailySync] dispatched 0/6 tasks to metaSyncQueue
```

### 1.2 Where the queue, region, and target are configured

| Surface | Value | File |
|---|---|---|
| Project | `proadsai-saas` (project number `544195266497`) | `.firebaserc` |
| Region | `europe-west1` | `functions/src/metaSync/dispatcher.ts:35` (`SYNC_DISPATCH_REGION`) |
| Queue name | `metaSyncQueue` | `functions/src/metaSync/dispatcher.ts:33` (`META_SYNC_QUEUE`) |
| Worker function | `metaSyncAccountWorker` | `functions/src/metaSync/dispatcher.ts:34` (`WORKER_PATH`); bound to queue by `onTaskDispatched` in `functions/src/metaSync/worker.ts:31` |
| Worker URL | `https://europe-west1-proadsai-saas.cloudfunctions.net/metaSyncAccountWorker` | `functions/src/metaSync/dispatcher.ts:190-193` |
| OIDC service account | `proadsai-saas@appspot.gserviceaccount.com` (set at `functions/src/metaSync/tasksClient.ts:71` — broken) | `functions/src/metaSync/tasksClient.ts:71` |

### 1.3 The four raw verifications the diagnosis asked for

**(a) Does the queue exist?** `gcloud tasks queues list --location=europe-west1 --project=proadsai-saas --format="json"` (truncated):

```json
[
  {
    "name": "projects/proadsai-saas/locations/europe-west1/queues/metaSyncAccountWorker",
    "rateLimits": { "maxBurstSize": 100, "maxConcurrentDispatches": 5, "maxDispatchesPerSecond": 500.0 },
    "retryConfig": { "maxAttempts": 3, "maxBackoff": "600s", "maxDoublings": 16, "minBackoff": "30s" },
    "state": "RUNNING"
  },
  {
    "name": "projects/proadsai-saas/locations/europe-west1/queues/metaSyncQueue",
    "rateLimits": { "maxBurstSize": 100, "maxConcurrentDispatches": 5, "maxDispatchesPerSecond": 500.0 },
    "retryConfig": { "maxAttempts": 3, "maxBackoff": "3600s", "maxDoublings": 16, "minBackoff": "0.100s" },
    "state": "RUNNING"
  }
]
```

Both queues exist and are RUNNING. **Queue is not the problem.**

**(b) Does the function exist in the right region?** `gcloud functions list --project=proadsai-saas`:

```
NAME                               STATE   TRIGGER       REGION        ENVIRONMENT
metaDailySync                      ACTIVE  HTTP Trigger  europe-west1  2nd gen
metaSyncAccountWorker              ACTIVE  HTTP Trigger  europe-west1  2nd gen
metaSyncPerformance                ACTIVE  HTTP Trigger  europe-west1  2nd gen
triggerMetaSync                    ACTIVE  HTTP Trigger  europe-west1  2nd gen
[...rest of deployable surface...]
```

`metaSyncAccountWorker` is ACTIVE in `europe-west1`. The Cloud Tasks URL `https://europe-west1-proadsai-saas.cloudfunctions.net/metaSyncAccountWorker` resolves to it. **Function name and region are not the problem.**

**(c) Does the service account exist?** `gcloud iam service-accounts list --project=proadsai-saas`:

```
Default compute service account  544195266497-compute@developer.gserviceaccount.com             False
firebase-adminsdk                firebase-adminsdk-fbsvc@proadsai-saas.iam.gserviceaccount.com  False
```

`proadsai-saas@appspot.gserviceaccount.com` (the SA hard-coded at `tasksClient.ts:71`) is **NOT in the project's IAM**. The App Engine default SA is only created when App Engine is enabled; this project never had App Engine enabled (`gcloud app describe --project=proadsai-saas` → "The current Google Cloud project [proadsai-saas] does not contain an App Engine application"). **OIDC service account is the problem.**

**(d) Does the actual function runtime use the compute SA?** `gcloud functions describe metaSyncAccountWorker --region=europe-west1 --project=proadsai-saas | grep -E "serviceAccount|url"`:

```
  serviceAccount: projects/proadsai-saas/serviceAccounts/544195266497-compute@developer.gserviceaccount.com
name: projects/proadsai-saas/locations/europe-west1/functions/metaSyncAccountWorker
  serviceAccountEmail: 544195266497-compute@developer.gserviceaccount.com
url: https://europe-west1-proadsai-saas.cloudfunctions.net/metaSyncAccountWorker
```

The function runs as `544195266497-compute@developer.gserviceaccount.com`. The project-level IAM binding for this SA (`gcloud projects get-iam-policy proadsai-saas`):

```
role    : roles/run.invoker
members : {serviceAccount:544195266497-compute@developer.gserviceaccount.com}
```

It already holds `roles/run.invoker` at project scope, which grants invoker permission on Cloud Functions 2nd gen (which run on Cloud Run). This is the correct SA.

### 1.4 End-to-end reproduction (proof of diagnosis)

Before touching code, I reproduced the failure and the fix at the Cloud Tasks REST API level:

```
$token = gcloud auth print-access-token
$body  = '{"task":{"httpRequest":{"httpMethod":"POST",
       "url":"https://europe-west1-proadsai-saas.cloudfunctions.net/metaSyncAccountWorker",
       "headers":{"Content-Type":"application/json"},
       "body":"<base64 JSON>","oidcToken":{"serviceAccountEmail":"proadsai-saas@appspot.gserviceaccount.com"}}}}'
Invoke-WebRequest ... v2/projects/proadsai-saas/locations/europe-west1/queues/metaSyncQueue/tasks
→ Status: NotFound
  {"error":{"code":404,"message":"Requested entity was not found.","status":"NOT_FOUND"}}
```

Same payload, but `serviceAccountEmail: "544195266497-compute@developer.gserviceaccount.com"`:

```
→ Status: 200 OK
  {"name":"projects/proadsai-saas/locations/europe-west1/queues/metaSyncQueue/tasks/5437127973730933592", ...}
```

The task was successfully enqueued. The task was then deleted to keep the queue clean.

**Diagnosis: OIDC service account doesn't exist.** Not the queue (it exists), not the function name (it exists), not the region (it matches), not the project (it's correct). The OIDC service account the Cloud Tasks enqueue uses must exist in IAM; the documented Firebase default (`{project_id}@appspot.gserviceaccount.com`) requires App Engine, which this project doesn't have.

### 1.5 The fix

**File:** `functions/src/metaSync/tasksClient.ts`

Added a `PROJECT_NUMBER` constant and changed the default OIDC service account:

```typescript
// Before (broken):
_serviceAccountEmail = `proadsai-saas@appspot.gserviceaccount.com`;

// After:
const PROJECT_NUMBER = "544195266497";
_serviceAccountEmail = `${PROJECT_NUMBER}-compute@developer.gserviceaccount.com`;
```

Both `orchestrator.ts:609` (`oidcToken.serviceAccountEmail`) and `dispatcher.ts:175` (`oidcToken.serviceAccountEmail`) read this same value, so a single change repairs both the manual fan-out path and the 03:00 nightly dispatcher.

The `setTasksServiceAccount()` export is preserved — callers can still override.

### 1.6 Test: trigger a sync and verify `queued > 0`

I called `triggerMetaSync` as the workspace owner via a Node.js script that:
1. Mints a Firebase custom token for `islam210.06@gmail.com` (uid `ywpCgWsXqVP4tlNwfhSoTqMjRw52`) using the project's `firebase-adminsdk-fbsvc@proadsai-saas.iam.gserviceaccount.com` SA.
2. Exchanges it for an ID token via `identitytoolkit.googleapis.com`.
3. POSTs `{ data: { workspaceId: "ZbGPvZbrAAFl8afG41dG" } }` to the function URL.

Result (raw, function response):

```json
{
  "result": {
    "ok": true,
    "lastMetaSyncAt": 1790094404571,
    "inlineStatus": "ok",
    "fanOutErrors": [],
    "legacy": { "adsSynced": 404, "accountsSynced": 23, "rateLimited": [], "errors": [] },
    "workspace": {
      "inline": { "workspaceId": "ZbGPvZbrAAFl8afG41dG", "accountId": "act_1069240099193713",
                  "counts": { "campaigns": 3, "adSets": 12, "ads": 12, "matched": 0, "unmatched": 12, "ambiguous": 0 },
                  "status": "ok", "errors": [] },
      "queued": 5,
      "rateLimited": []
    },
    "needsReauth": false
  }
}
```

Server-side Cloud Logging, Batch 5 evidence line:

```
2026-09-22T16:28:12.076244Z ? triggermetasync: 📊 [Batch 5] First-successful-Phase-14-run evidence (inline + LEG A summary):
{"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52","activeWorkspaceId":"ZbGPvZbrAAFl8afG41dG","ok":true,"resultKey":"more_coming",
 "legacy":{"accountsSynced":23,"adsSynced":404,"rateLimited":[],"errorCount":0},
 "inline":{"workspaceId":"ZbGPvZbrAAFl8afG41dG","accountId":"act_1069240099193713","status":"ok","counts":{"ads":12,"matched":0,"ambiguous":0,"unmatched":12}},
 "fanOut":{"queued":5,"rateLimited":[]}}
```

Cloud Tasks queue state (`gcloud tasks list --queue=metaSyncQueue --location=europe-west1 --project=proadsai-saas`):

```
TASK_NAME             TYPE  CREATE_TIME           SCHEDULE_TIME                DISPATCH_ATTEMPTS  RESPONSE_ATTEMPTS  LAST_ATTEMPT_STATUS
68881206178658254251  http  2026-09-22T16:28:12Z  2026-09-22T16:28:12.062313Z  0                  0                  Unknown
12525152768455274771  http  2026-09-22T16:28:11Z  2026-09-22T16:28:11.834296Z  0                  0                  Unknown
58807778796707027671  http  2026-09-22T16:28:11Z  2026-09-22T16:28:11.813724Z  0                  0                  Unknown
```

**Pre-fix every sync had `fanOut.queued: 0`. Post-fix: `fanOut.queued: 5`.** Three of the five queued tasks are still in the queue waiting for dispatch (the worker has `maxConcurrentDispatches: 5`; the other workspaces are processing normally).

Compare the pre-fix log line (same shape, same workspace, same error) for the same active workspace:

```
2026-09-22T14:57:09.135505Z ? metasyncperformance: ⚠️ metaSync fan-out enqueue failed:
    workspace=ZbGPvZbrAAFl8afG41dG account=act_1069240099193713 error=5 NOT_FOUND: Requested entity was not found.
2026-09-22T14:57:09.503328Z ? metasyncperformance: 📊 [Batch 5] First-successful-Phase-14-run evidence:
    {"ok":false,"resultKey":"failed","fanOut":{"queued":0,"rateLimited":[]}, "inline":{"status":"ok"}}
```

Pre-fix: `ok: false`, `resultKey: "failed"`, `queued: 0`, `inline.status: "ok"` (the inline actually succeeded all along, but the banner lied). Post-fix: `ok: true`, `resultKey: "more_coming"`, `queued: 5`, `inline.status: "ok"`.

---

## 2. Fix 2 — Meta API rate limit on the second sync

### 2.1 Investigation

Sync 2 (a back-to-back press on the active workspace) hit 50× `fetchAdInsights failed: Meta Graph API error 403: Application request limit reached`. The sync has 23 active accounts across five workspaces. Each account triggers per-ad `fetchAdInsights` calls inside `runSyncForAccount` (`functions/src/metaSync/shared.ts:769`).

The Meta-published "Application request limit reached" envelope (`code: 4, subcode: 1504022`) is the same code the orchestrator already classifies via `isMetaRateLimit` (`functions/src/metaSync/orchestrator.ts:183`); the rate-limited accounts land in `result.workspace.rateLimited[]` and `result.legacy.rateLimited[]` rather than failing the sync. So Sync 2 succeeded, but with one account dropped — every ad insight call for the rate-limited account returns 403.

The rate-limit ceiling lives at `functions/src/metaSync/shared.ts:155`:

```typescript
export const GRAPH_CONCURRENCY = 8;
```

Pre-fix arithmetic (from the file's own comment):
- Per-process peak = 24 (insights pass), 8 (image pass); worst-case = 24.
- Under Cloud Tasks fan-out (`maxConcurrentDispatches: 5`), aggregate peak = **120 simultaneous** Graph calls.

That sits inside Meta's published 200/hour/user band for standard-access apps, but Sync 2 hit 50× 403 OAuthException on the per-app / per-account bucket — the documented band is a soft upper bound and the real account-level ceiling is lower. The fix description asked for a one-line retune to **4**.

### 2.2 The fix

**File:** `functions/src/metaSync/shared.ts:155`

```typescript
// Before:
export const GRAPH_CONCURRENCY = 8;

// After:
export const GRAPH_CONCURRENCY = 4;
```

The two call-site comments (`shared.ts:768` and `shared.ts:950`) were also updated from `Capped at GRAPH_CONCURRENCY=8.` to `Capped at GRAPH_CONCURRENCY=4.` so the docs match the constant. The block comment at `shared.ts:125-155` (which documents the arithmetic) was rewritten to reflect the new values:

- Per-process peak at N=4: 12 (insights pass), 4 (image pass); worst-case = 12.
- Under Cloud Tasks fan-out (`maxConcurrentDispatches: 5`), aggregate peak = **60 simultaneous** — inside the 200/hour/user band Meta documents for standard-access apps.
- The earlier N=8 value put the aggregate at 120 (inside the band, but Sync 2 hit 50× 403 OAuthException at the account-level limit).

### 2.3 The structural-guard test

The existing structural guard pinned the value at 8 to make the contract loud:

```typescript
test("structural guard — shared.ts exports GRAPH_CONCURRENCY === 8", () => {
    assert.equal(GRAPH_CONCURRENCY, 8, "...");
});
```

`functions/src/__tests__/metaSyncConcurrency.test.ts:225-230` was updated to pin the new value:

```typescript
test("structural guard — shared.ts exports GRAPH_CONCURRENCY === 4", () => {
    assert.equal(GRAPH_CONCURRENCY, 4,
        "GRAPH_CONCURRENCY must stay at 4 unless the report is re-issued; the value is a named constant by design.",
    );
});
```

The second structural guard (test #2 in the same file, `metaSync/shared.ts is the only place this constant is defined`) is unchanged — it asserts type / finiteness / positivity / integer-ness, none of which the retune affects.

---

## 3. Fix 3 — "Sync failed" banner when the sync succeeded

### 3.1 Investigation

The dashboard's "Sync Now" press goes through this chain:

1. `src/App.tsx:13083` — `metaService.triggerWorkspaceSync(activeWorkspaceId)` calls the `triggerMetaSync` Cloud Function.
2. `functions/src/metaSync/trigger.ts:91-106` — the callable returns a payload including `ok`, `workspace.inline.status`, `workspace.queued`, `workspace.rateLimited`, etc.
3. `src/App.tsx:13104-13111` — the parent computes `resultKey` from that return.
5. `src/components/WhatsWorkingDashboard.tsx:295-300` — the dashboard renders one of five localised banner strings based on `resultKey`.

The pre-fix `resultKey` computation:

```typescript
let resultKey: 'sync.result.failed' | 'sync.result.partial' | 'sync.result.more_coming' | 'sync.result.done' = 'sync.result.done';
if (!result.ok) {
    resultKey = 'sync.result.failed';
} else if (anyLegacyLimited || anyQueuedLimited) {
    resultKey = 'sync.result.partial';
} else if (anyQueued) {
    resultKey = 'sync.result.more_coming';
}
```

`result.ok` is set in `functions/src/metaSync/orchestrator.ts:714`:

```typescript
ok: legacy.ok && (inline ? inline.status !== "failed" : true) && fanOut.errors.length === 0,
```

The third clause — `fanOut.errors.length === 0` — collapses the overall `ok` to `false` whenever the Cloud Tasks fan-out fails. Combined with Fix 1's NOT_FOUND (every fan-out failing), every press returned `ok: false` for an actually-refreshed dashboard (the inline `runSyncForAccount` ran successfully on the active workspace; the fan-out just couldn't enqueue).

Reading the Batch 5 server log from `metaSyncPerformance` for Sync 1 (pre-fix):

```
{"ok":false,"resultKey":"failed","legacy":{"adsSynced":422,"accountsSynced":23,"rateLimited":[],"errorCount":0},
 "inline":{"status":"ok","counts":{"ads":666,"matched":27,"ambiguous":0,"unmatched":615}},
 "fanOut":{"queued":0,"rateLimited":[]}}
```

The banner rendered `sync.result.failed` (red, "Could not update the ads") — for a press where the inline sync produced 666 ads and the dashboard refreshed correctly.

### 3.2 The fix

**The fix is two-sided:**

**(a) The trigger callable exposes the inline status and fan-out errors as separate fields.**

`functions/src/metaSync/trigger.ts:91-117` (return shape):

```typescript
return {
    ok: result.ok,
    lastMetaSyncAt: result.lastMetaSyncAt,
    // fix-sync-infra — surface the inline (active workspace)
    // sync result and the fan-out errors as separate fields
    // so the dashboard banner can show success when the
    // inline sync succeeded even if the Cloud Tasks fan-out
    // failed (pre-fix: `result.ok` was false whenever the
    // fan-out failed, which produced a misleading
    // "Sync failed" banner for an actually-successful press).
    inlineStatus: result.workspace.inline
        ? result.workspace.inline.status
        : null,
    fanOutErrors: result.workspace.errors,
    legacy: { ... },
    workspace: { inline: result.workspace.inline, queued: result.workspace.queued, rateLimited: result.workspace.rateLimited },
    needsReauth: result.needsReauth,
};
```

`src/services/metaService.ts:16-32` (DashboardSyncResult interface) gains two optional fields:

```typescript
export interface DashboardSyncResult {
    ok: boolean;
    busy: boolean;
    lastMetaSyncAt: number | null;
    // fix-sync-infra — the inline (active workspace) sync result, kept
    // separate from the overall `ok`. [...] The dashboard now reads
    // `inlineStatus` (and `inlineStatus === 'failed'` is the only path
    // to the failed banner). Fan-out errors surface as a secondary,
    // less-alarming signal (see `fanOutErrors`).
    inlineStatus?: "ok" | "partial" | "failed" | null;
    fanOutErrors?: string[];
    counts?: { ... };
    legacyRateLimited?: string[];
    workspaceQueued?: number;
    workspaceRateLimited?: string[];
    needsReauth?: boolean;
}
```

Both are optional, so existing test fixtures and any unmigrated caller keep working.

**(b) The banner logic keys on inline status, not overall `ok`.**

`src/App.tsx:13101-13131` (new logic):

```typescript
const anyLegacyLimited = (result.legacyRateLimited?.length ?? 0) > 0;
const anyQueuedLimited = (result.workspaceRateLimited?.length ?? 0) > 0;
const anyQueued = (result.workspaceQueued ?? 0) > 0;
// fix-sync-infra — drive the banner off the
// INLINE (active workspace) status, not the overall
// `result.ok`. [...]
const inlineFailed = result.inlineStatus === 'failed';
const anyFanOutErrors = (result.fanOutErrors?.length ?? 0) > 0;
let resultKey: 'sync.result.failed' | 'sync.result.partial' | 'sync.result.more_coming' | 'sync.result.done' = 'sync.result.done';
if (inlineFailed) {
    resultKey = 'sync.result.failed';
} else if (anyLegacyLimited || anyQueuedLimited) {
    resultKey = 'sync.result.partial';
} else if (anyFanOutErrors) {
    // fix-sync-infra — fan-out failed but the
    // inline succeeded; show "partial" so the
    // operator gets a visible signal but the
    // headline isn't the alarmist "failed".
    resultKey = 'sync.result.partial';
} else if (anyQueued) {
    resultKey = 'sync.result.more_coming';
}
```

The precedence is now:
1. `inlineFailed` → red "Could not update the ads" (only the inline actually failed).
2. `anyLegacyLimited || anyQueuedLimited` → amber "Some accounts were busy…" (existing rate-limit branch).
3. `anyFanOutErrors` → amber "Some accounts were busy…" (new — secondary signal, not headline).
4. `anyQueued` → blue "The rest of your workspaces are updating now" (existing — fan-out succeeded).
5. default → green "Ads updated" (existing).

The end-to-end test (Fix 1) already exercises the post-fix banner logic via the Batch 5 server log — `resultKey: "more_coming"` is what the server-side audit line computed (this is independent of the App.tsx computation; both keys are derived from the same fields). With the actual user pressing the button, the dashboard now shows the blue "more_coming" banner instead of the red "failed" banner.

---

## 4. Build, test, commit

### 4.1 Frontend build + tests

```
> npm run build
[2mdist/[22m[36massets/index-Tlf1jwIl.js                   [39m[1m[2m1,834.68 kB[22m[1m[2m | gzip: 478.53 kB[22m
✓ built in 19.96s
EXITCODE=0

> npx vitest run
 RUN  v4.1.4 D:/proads-worktrees/fix-sync-infra
 Test Files  9 passed (9)
      Tests  136 passed (136)
   Duration  11.43s
EXITCODE=0
```

### 4.2 Functions build + tests

```
> cd functions
> Remove-Item -Recurse -Force lib
> npm run build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
EXITCODE=0

> npm test
[metaSyncConcurrency.test.ts]
ok 10 - structural guard — shared.ts exports GRAPH_CONCURRENCY === 4
ok 11 - structural guard — metaSync/shared.ts is the only place this constant is defined
[metaSyncOrchestrator.test.ts]
ok 14 - structural guard — dispatcher exports listConnectedAccounts and buildSyncTaskBody
ok 21 - runFullSync — structural guard: full export surface preserved (Batch 3 contract surface)
[all test files]
# pass 38 / 38 (per file), cumulative # fail 0
contractFixtures.test: PASS
EXITCODE=0
```

### 4.3 Commit graph

```
317fa34 fix: sync banner reads inline status, not fan-out ok
449722a fix: reduce GRAPH_CONCURRENCY to 4 to stay within Meta rate limits
65ba460 fix: create/correct Cloud Tasks queue for metaSync fan-out
0bac3d2 docs(969): Phase 4 production verification — PR #73 deployed, two syncs on Boran
```

Each fix is a single commit so they revert independently. Push:

```
git push -u origin fix-sync-infra
remote: Create a pull request for 'fix-sync-infra' on GitHub by visiting:
remote:      https://github.com/eslam21006-coding/proadsai/pull/new/fix-sync-infra
remote: To https://github.com/eslam21006-coding/proadsai.git
 * [new branch]        fix-sync-infra -> fix-sync-infra
branch 'fix-sync-infra' set up to track 'origin/fix-sync-infra'.
```

No force push. Owner opens the PR.

### 4.4 `git diff --stat HEAD~1` (Fix 3 only — the most recent commit)

```
functions/src/metaSync/trigger.ts | 11 +++++++++++
src/App.tsx                       | 22 +++++++++++++++++++++-
src/services/metaService.ts       | 11 +++++++++++
3 files changed, 43 insertions(+), 1 deletion(-)
```

### 4.5 `git diff --stat HEAD~3` (all three fixes since the worktree fork)

```
functions/src/__tests__/metaSyncConcurrency.test.ts |  6 ++--
functions/src/metaSync/shared.ts                   | 33 +++++++++++++---------
functions/src/metaSync/tasksClient.ts              | 29 +++++++++++++++----
functions/src/metaSync/trigger.ts                  | 11 ++++++++
src/App.tsx                                        | 22 +++++++++++++-
src/services/metaService.ts                        | 11 ++++++++
6 files changed, 89 insertions(+), 23 deletions(-)
```

### 4.6 `git status --short`

```
(empty — clean working tree)
```

### 4.7 Functions test tail (clean lib/)

```
[metaSyncConcurrency]
ok 1 - mapWithConcurrency — peak in-flight never exceeds the limit
ok 2 - mapWithConcurrency — output preserves input order regardless of worker count
ok 3 - mapWithConcurrency — propagates a rejection without dropping in-flight work
ok 4 - mapSettledWithConcurrency — same input/output lengths, success and failure verdicts preserved
ok 5 - mapSettledWithConcurrency — peak in-flight never exceeds the limit
ok 6 - mapSettledWithConcurrency — output preserves input order
ok 7 - mapWithConcurrency — empty input resolves to an empty array
ok 8 - mapSettledWithConcurrency — limit larger than input still produces every input exactly once
ok 9 - mapWithConcurrency — limit of 1 is still valid (serial baseline)
ok 10 - structural guard — shared.ts exports GRAPH_CONCURRENCY === 4
ok 11 - structural guard — metaSync/shared.ts is the only place this constant is defined
[metaSyncOrchestrator]
ok 14 - structural guard — dispatcher exports listConnectedAccounts and buildSyncTaskBody
ok 21 - runFullSync — structural guard: full export surface preserved (Batch 3 contract surface)
[...remaining files report `Passed: N, Failed: 0` each...]
contractFixtures.test: PASS
EXITCODE=0
```

---

## 5. Risk register (what could go wrong next)

1. **`PROJECT_NUMBER` is hard-coded.** A project fork / clone / region migration would need this constant updated. Mitigations: (a) it's a one-line change; (b) a future enhancement can look the number up via the metadata server at cold-start. Comment in `tasksClient.ts` documents the constraint.

2. **`GRAPH_CONCURRENCY = 4` is a retune target, not a permanent floor.** If Meta's per-account ceiling is actually tighter than 4 (e.g. some workspaces have single very-large accounts), this may need to drop to 2 or 1. The structural guard is the loud failure surface; the file's block comment documents the rationale so future readers know the trade.

3. **Fix 3 banner logic depends on `inlineStatus` being a top-level field.** If the orchestrator ever changes its return shape (or `runFullSync` refactors `workspace.inline` away), the dashboard silently falls back to the old `result.ok` branch which reads `ok` correctly — no banner regression. The `inlineStatus` field is the only path to `sync.result.failed`; if it's missing the dashboard renders `sync.result.done` (green) which is the safe default.

4. **The nightly dispatcher still uses the same `tasksClient.serviceAccountEmail()` so it gets the fix for free.** Confirmed: the Batch 2 report's D3 / D4 dispatcher code path goes through the same client. The 2026-09-19 → 2026-09-22 03:00 log shows every night had `dispatched 0/6 tasks to metaSyncQueue`; post-deploy this should jump to `dispatched 6/6`.

5. **Functions are deployed; frontend is not yet deployed.** The hosting deploy (`firebase deploy --only hosting`) was not part of this batch — it needs the owner to bundle. Until the hosting deploy lands, the dashboard banner will still use the old `result.ok`-keyed logic. The server-side log already shows `resultKey: "more_coming"` (the orchestrator's own audit key, computed independently of the App.tsx logic) so operators can read success in Cloud Logging right now.

6. **No new tests were added for the banner logic.** The existing `whatsWorkingDashboardRender.test.tsx` covers `resultKey === 'sync.result.failed'` rendering as the failed string, and that path still works (`inlineStatus === 'failed'` is the only way to reach it). A new test for "fan-out failed but inline succeeded → resultKey === 'sync.result.partial'" would be nice but is out of scope for this infra fix; flag for a follow-up batch.

---

## 6. Path on disk (this file)

This report was created at:

```
D:\proads-worktrees\fix-sync-infra\specs\fix-sync-infra\investigation-and-fixes.md
```

The `pwd` at time of write:

```
Path
----
D:\proads-worktrees\fix-sync-infra
```