# Phase 970 — Post-Deploy Runbook (on-call)

**Audience:** on-call engineer after the Phase 970 Sync Unification deploy.
**Project:** `proadsai-saas`
**Region:** `europe-west1`

This runbook is the operational follow-up to investigation report
`specs/970-sync-unification/reports/batch-01-investigation.md` and
the Batch 1–4 implementation reports in the same directory. The
information here is duplicated from `batch-04-report.md` §5 and
`batch-05-report.md` §5 so the on-call engineer does not need to
walk the report tree to answer the four most-asked post-deploy
questions.

---

## 1. The figure to watch in Cloud Logging

**`120`.** That is the **peak simultaneous Graph calls** under
5-task Cloud Tasks fan-out at `GRAPH_CONCURRENCY = 8`.

It is derived in `batch-01-report.md` §2 HEADLINE and re-stated in
`batch-03-report.md` §4:

- Per-process peak = `3 × 8 = 24` (insights pass dominates; 8 outer
  ads × 3 parallel insight windows per ad).
- Aggregate under 5-task fan-out = `5 × 24 = 120`.
- Pre-fix peak was 1,149 simultaneous (insights lockstep). 24 is a
  **48× reduction**.

The Cloud Logging query to find rate-limit errors (the `code 4 /
subcode 1504022` envelope is logged at the LEG A error site inside
`runLegacySyncForAccount`, which is called from the deployed
`metaSyncPerformance` callable):

```
resource.type="cloud_function"
resource.labels.function_name=~"metaSyncPerformance"
textPayload=~"Meta insights error for account"
textPayload=~"OAuthException"
```

The deployed `triggerMetaSync` callable can also surface a rate-limit
error in the LEG B inline path; the same pattern but with that
function name. The match is regex (`=~`), not exact match, so any
deployed Meta-touching callable that emits a `console.error` with
"OAuthException" surfaces in the result. Note: `runFullSyncWithLease`
is an internal helper, NOT a Cloud Function, so a query against
its name returns nothing. Always query the deployed
`function_name`.

If that query returns anything post-deploy, the cause is rate-limit
pressure and Batch 5's retune (below) applies. The `120` figure is
**inside** Meta's published best-practices band of 50–200
simultaneous per app; a second tenant's 8-deep sync running
concurrently would push the aggregate to ~240 (over the upper edge),
which is the failure mode to monitor.

---

## 2. One-line retune if rate-limit recurs

If `OAuthException code 4 / subcode 1504022` (or `code 17 /
subcode 2446079`) fires in production after the Phase 970 deploy:

1. Open `functions/src/metaSync/shared.ts`.
2. Find the line:
   ```ts
   export const GRAPH_CONCURRENCY = 8;
   ```
3. Change `8` to `4`.
4. The structural-guard test
   `ok 10 - structural guard — shared.ts exports GRAPH_CONCURRENCY === 8`
   in `metaSyncConcurrency.test.js` will fail. Update the assertion's
   expected value to `4` (this is the anti-drift lock firing — the
   test value matches the constant value, not the other way around).
5. Rebuild + redeploy:
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions
   ```

**Trade at N=4:**

| Metric | N=8 (current) | N=4 (retune) | Delta |
|---|---|---|---|
| Per-process peak | 24 | 12 | halved |
| Aggregate under 5-task fan-out | 120 | 60 | halved |
| Wall-clock for 383-ad account at 500ms RTT | ~96s | ~190s | ~2× |
| Headroom under 540s `runSyncForAccount` ceiling | 444s | 350s | tighter but still ample |

The 2× wall-clock penalty is the explicit trade. Phase 14 has never
completed a run in production; the first real run is the evidence
that will tell us whether N=8 is the right number or N=4 was the
safer initial choice. If the first run's matching counts (ads /
matched / ambiguous / unmatched — see §4) are healthy at N=8, the
limit is not firing and the retune is unnecessary.

---

## 3. The four-rate-limit-classification contract

Both Meta rate-limit codes are classified by `isMetaRateLimit` and
collected into the result's `rateLimited[]` arrays instead of throwing.
The contract test is `functions/src/__tests__/metaSyncRateLimit.test.ts`
(10 tests):

| Code | Subcode | Type | Where it fires |
|---|---|---|---|
| 4 | 1504022 | `OAuthException` | App-wide rate limit (the one observed in production pre-Phase-970) |
| 17 | 2446079 | `OAuthException` | Per-user / app-rate variant (per investigation §8.3) |

When a press is rate-limited:

- `result.ok` is **true** (the press did not fail; the rate-limit is
  reported, not thrown).
- `result.legacy.rateLimited` lists accountIds that LEG A could
  not write (root `/adPerformance` + `/adPerformanceHistory`).
- `result.workspace.rateLimited` lists accountIds that LEG B's
  Cloud Tasks fan-out could not enqueue, OR the LEG B inline
  workspace's `runSyncForAccount` reported a rate-limit through its
  `errors[]` array.
- The dashboard toast maps to one of:
  - `sync.result.done` — no rate-limits, no queued workspaces
  - `sync.result.partial` — at least one account was rate-limited
  - `sync.result.more_coming` — at least one workspace was fanned
      out via Cloud Tasks
  - `sync.result.failed` — `result.ok === false`
  - `sync.result.busy` — `result.busy === true` (PHASE 970 bug
    2026-09-03; PHASE 970 Batch 6 fix). Distinct from `failed`: a
    second concurrent press hits the in-flight lease and is
    reported as a state (a state, not a wait and not a failure).
    The dashboard's in-modal banner and the sidebar toast both
    surface this case. Cloud Logging records it separately:
    `resultKey: "sync.result.busy"` in the inline-leg log AND
    a distinct busy-line log emitted by the wrapper. The busy
    case does NOT mean the press failed; the underlying sync is
    still in flight on another caller, and this press correctly
    bailed to avoid a double-lease collision.


---

## 4. First-successful-Phase-14-run evidence (matching counts)

Phase 14 has never completed a run in production. When the first
press succeeds end-to-end after the deploy, the matching counts
will be emitted by `App.tsx:12980-12995` in a `console.log` line
shaped:

```
📊 [Batch 5] First-successful-Phase-14-run evidence:
  {
    "ads": <number>,
    "matched": <number>,
    "ambiguous": <number>,
    "unmatched": <number>,
    "legacyRateLimited": [...],
    "workspaceQueued": <number>,
    "workspaceRateLimited": [...],
    "resultKey": "sync.result.done|partial|more_coming|failed"
  }
```

**The on-call engineer should read this line at first real press.**
The matching counts (ads / matched / ambiguous / unmatched) are the
first evidence about whether the ad-to-creative matching logic
actually works in production. The numbers will look like:

- `ads`: total ads returned by Meta's insights for the account
- `matched`: ads whose image hash matched a generation in the
  workspace's fingerprint index (`runSyncForAccount:556-563`)
- `ambiguous`: ads whose top two candidates are within the
  ambiguity margin — left unmatched (`runSyncForAccount:551-555`)
- `unmatched`: ads with no viable generation candidate

A healthy first run should show `ads > 0` and a `matched` count
proportional to the workspace's generation count. If `ads > 0`
but `matched === 0`, the matching predicate is broken — escalate.
If `ads === 0` after several presses, the legacy fetch is broken
(out of Batch 5 scope; see investigation §10 "out of scope").

The log line is emitted from inside the **deployed** Cloud Function
handlers (`metaSyncPerformance`, `triggerMetaSync`,
`metaSyncAccountWorker`), not the internal helper. Cloud Logging
indexes logs by the deployed `function_name` of the entry point —
the `runFullSyncWithLease` / `runSyncForAccount` helpers are
modules, not Cloud Functions, so a query against either name
returns nothing. The queries below use the deployed names.

**Inline leg** (active workspace — `metaSyncPerformance` and
`triggerMetaSync` both call into `runFullSync` which logs the
inline + LEG A summary):

```
resource.type="cloud_function"
resource.labels.function_name:"metaSyncPerformance"
textPayload=~"First-successful-Phase-14-run evidence \\(inline"
```

```
resource.type="cloud_function"
resource.labels.function_name:"triggerMetaSync"
textPayload=~"First-successful-Phase-14-run evidence \\(inline"
```

Either query will surface the inline leg. The trigger is server-side
`console.log`, indexed by the deployed function's name, so this
query works regardless of whether the press came from the sidebar
or the dashboard.

**Fanned-out leg** (every other live workspace — one log line
per task, server-side in `metaSyncAccountWorker`):

```
resource.type="cloud_function"
resource.labels.function_name:"metaSyncAccountWorker"
textPayload=~"First-successful-Phase-14-run evidence \\(fanned-out"
```

Every Cloud Tasks task that runs in production emits one of these.
A successful first deploy with N fan-out tasks shows N log lines,
one per workspace. The fanned-out workspaces never touch the
browser, so this server-side log is the ONLY place their counts
land — the browser log in `App.tsx` only covers the inline
workspace.

**Both legs together** (matches the Batch-5 report's overall
shape; the `\\(inline` / `\\(fanned-out` markers disambiguate):

```
resource.type="cloud_function"
textPayload=~"First-successful-Phase-14-run evidence"
```

The marker also matters because future batches may add more
evidence log lines for the matching pipeline, and the marker
distinguishes "this is the Batch-5 first-real-run count" from
later diagnostics.

---

## 5. The `canSyncNow` / `cooldownEndsAt` freeze (next-phase task)

The Phase 970 Batch 4 freeze (§9 decision 2) keeps the legacy
fields `canSyncNow` and `cooldownEndsAt` in the `getWhatsWorkingDashboard`
response so cached-JS clients that still read them render the
button as always-enabled. The fields are emitted as **frozen
literals** (`canSyncNow: true`, `cooldownEndsAt: null`)
regardless of `lastMetaSyncAt`.

**The frontend has stopped reading them.** The Phase 970 Batch 4
changes (`src/components/WhatsWorkingDashboard.tsx`) removed
`disabled={!status.canSyncNow}`, the greyed styling, and the
`whats_working.sync.cooldown` label swap — the button is now
always enabled and always shows `whats_working.sync.cta`.

**These fields are slated for deletion in a follow-up phase.**
After one release cycle (so cached-JS clients that read the old
fields are flushed from the wild), the next batch can drop the
fields from the `SyncStatus` interface entirely. Until then, the
in-code comments at `whatsWorkingDashboard.ts:91-104` and
`WhatsWorkingDashboard.tsx:14-40` document the freeze. The
`metaSyncDispatcher` already serves the dashboard; the follow-up
batch is a docs/cleanup change, not a runtime change.

Do NOT delete the fields in an ad-hoc patch — they are a deliberate
back-compat shim for one release.

---

## 6. Other known limits (out of scope)

From investigation §10 + Batch 1–4 reports:

- **Legacy fetch capped at 100 ads/account, unpaginated**
  (`index.ts:3823`). Pre-Phase 970 path. The Performance Dashboard
  silently misses ads beyond the first 100 per account. Out of
  scope for Phase 970.
- **`/adPerformanceHistory` unbounded growth** vs
  `patternSummaries`' 10,000-doc scan cap. Legacy path. Will hit
  the cap and start producing partial rollups.
- **`metaLegacySync`'s missing `creativeMemory (userId, createdAt)`
  composite index**. The 4 AM UTC scheduler logs the failure; the
  end-of-pipeline state still completes.
- **`dispatcher.ts` enqueues to `metaSyncQueue` while `worker.ts`
  declares retry config for the auto-provisioned
  `metaSyncAccountWorker` queue** — the declared config is inert.
  This is why Phase 970 Batch 1 had to keep using
  `metaSyncQueue`'s actual retry config. Out of scope; the declared
  vs actual queue is a Cloud Functions deployment detail.

---

## 7. Quick-reference: what fires from which callable

| Callable | LEG A (legacy) | LEG B (Phase 14) | Lease |
|---|---|---|---|
| `metaSyncPerformance` (manual sidebar) | inline, account-global | inline for active workspace + fan-out for the rest | yes |
| `triggerMetaSync` (manual dashboard) | inline, account-global | inline for active workspace + fan-out for the rest | yes |
| `metaDailySync` (scheduled 03:00) | (separate code path, out of scope) | n/a | no |
| `metaSyncAccountWorker` (task-dispatched LEG B fan-out) | n/a | inline for one workspace-account pair | no |

If a user complains "I press Sync Now and nothing happens" or "the
dashboard is stuck on a previous sync", the lease is the first place
to look. The `AlreadyRunningError` is thrown from inside
`runFullSyncWithLease` (an internal helper, not a Cloud Function);
the deployed callable wraps and translates it, so the log is
indexed under the deployed `function_name`:

```
resource.type="cloud_function"
resource.labels.function_name=~"metaSyncPerformance|triggerMetaSync"
textPayload=~"AlreadyRunningError"
```

A press that hit the lease throws `AlreadyRunningError` → the
  wrappers catch it and translate to `HttpsError("failed-precondition", ...)`. PHASE 970 bug
  2026-09-03 (Batch 6 fix) — the user-visible banner and the
  sidebar toast are now keyed off `result.busy` so the busy case
  surfaces `sync.result.busy` rather than `sync.result.failed`.
  A Cloud Logging query for the busy case specifically:

  ```
  resource.type="cloud_function"
  resource.labels.function_name=~"metaSyncPerformance|triggerMetaSync"
  textPayload=~"First-successful-Phase-14-run evidence"
  textPayload=~"resultKey"
  textPayload=~"busy"
  ```

  A busy entry has `"resultKey": "sync.result.busy"` and
  `"busyHolderUid": "<uid>"`. A failed entry has
  `"resultKey": "sync.result.failed"` and `"ok": false`. The two
  are distinct Cloud Logging observations; the runbook rate-limit
  watch does NOT alert on busy. The other press is the one that's
  still running; wait for it to finish (≤10 min via the lease TTL
  safety net if the running press crashed).

---

## 8. Where the source-of-truth lives

This runbook is the operational layer. The authoritative numbers and
decisions live in:

- **`specs/970-sync-unification/reports/batch-01-investigation.md`**
  — investigation, defects, approved design
- **`specs/970-sync-unification/reports/batch-01-report.md`** —
  Batch 1 §2 HEADLINE, peak derivation
- **`specs/970-sync-unification/reports/batch-03-report.md`** —
  Batch 3 §4 banner, peak vs wall-clock reconciliation
- **`specs/970-sync-unification/reports/batch-04-report.md`** —
  Batch 4, lease design + cooldown removal + cooldown-site
  enumeration
- **`specs/970-sync-unification/reports/batch-05-report.md`** —
  Batch 5, runbook entry, first-real-run matching-counts assertion

If this runbook ever disagrees with the reports, **the reports
win** — the runbook is regenerated from them. If this runbook is
silent on a question, the answer is in the reports.
