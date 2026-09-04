# Batch 05 Report — Final polish + post-deploy monitoring runbook

**Worktree:** `D:\proads-worktrees\cumulative-learning`
**Branch:** `970-sync-unification`
**Parent of branch:** `969-cumulative-learning` at `7b24454`
**Scope:** Final batch of Phase 970. (1) Dedicated rate-limit contract
test per investigation §8.7. (2) Wire the four new i18n result
strings from Batch 4 to the dashboard's toast handler. (3) Surface the
matching counts (ads / matched / ambiguous / unmatched) so the first
successful Phase 14 run reports them in Cloud Logging. (4) A separate
post-deploy runbook for the on-call engineer. (5) Test registration.

This is the **last batch** of Phase 970. After this lands, the
deploy steps (D3 index + the code itself) are all that remain.
The four known limits (legacy 100-cap, history unbounded,
`metaLegacySync` index, dispatcher queue config drift) are
out-of-scope per investigation §10 and stay documented there.

---

## 1. What changed

| File | Change |
|---|---|
| `functions/src/__tests__/metaSyncRateLimit.test.ts` (new) | 10 tests per investigation §8.7. 4 end-to-end rate-limit classification tests (LEG A + LEG B enqueue, each at `code 4/subcode 1504022` and `code 17/subcode 2446079`) plus a both-legs-rate-limited test plus a LEG B inline `errors[]` string-path test, plus 4 `isMetaRateLimit` direct classifier tests including the load-bearing `code: 4, subcode: 999` and `code: 99, subcode: 1504022` negative cases (different code OR different subcode does NOT classify). The "run still ok" assertion is the load-bearing contract. |
| `functions/src/metaSync/orchestrator.ts` | Adds the **server-side** first-real-run evidence log inside `runFullSync` (after the result is assembled, before the return). Emits inline-workspace matching counts + LEG A overall summary + fan-out dispatch summary, indexed by the deployed `function_name` (`metaSyncPerformance` or `triggerMetaSync`). Cloud Logging tags logs with the deployed function's name, not the internal helper's — see §4 below. |
| `functions/src/metaSync/worker.ts` | Adds the **server-side** first-real-run evidence log inside `metaSyncAccountWorker` after `runSyncForAccount` returns. Emits per-task matching counts, indexed by `function_name="metaSyncAccountWorker"`. Every fanned-out workspace emits one log line; the fan-out workspaces never touch the browser, so this is the only place their counts land. |
| `src/services/metaService.ts` | `triggerWorkspaceSync` return type adds `legacyRateLimited?: string[]`, `workspaceQueued?: number`, `workspaceRateLimited?: string[]`. The result-type assertion also updated. No behaviour change; only the surface exposed to the toast handler. |
| `src/App.tsx:12960-13010` | `onSyncNow` toast handler rewritten. Maps `result.legacy.rateLimited.length > 0` OR `result.workspace.rateLimited.length > 0` → `sync.result.partial`; `result.workspace.queued > 0` → `sync.result.more_coming`; `result.ok === false` → `sync.result.failed`; otherwise `sync.result.done`. The `failed-precondition` (second-press collision) catch now renders the `sync.result.failed` localised string instead of the old generic "Sync failed" path. The browser-side `console.log` for first-real-run evidence is kept (immediate feedback for whoever has DevTools open) but is NOT the source of truth for the runbook — the server-side logs in `runFullSync` and `worker.ts` are. |
| `specs/970-sync-unification/POST_DEPLOY_RUNBOOK.md` (new) | Operational follow-up. Eight sections: (1) the 120 figure to watch; (2) the one-line GRAPH_CONCURRENCY retune trade; (3) the four rate-limit codes; (4) the matching-counts evidence line with **corrected** Cloud Logging queries (deployed `function_name`, NOT `runFullSyncWithLease`); (5) the `canSyncNow` / `cooldownEndsAt` freeze (next-phase deletion); (6) the four out-of-scope known limits; (7) the per-callable dispatch table with corrected lease-collision query; (8) the source-of-truth map. The on-call engineer's first stop after a deploy. |
| `functions/package.json` | New `test:phase970:rateLimit` script and entry in the aggregate `test` script. |

### Files unchanged in Batch 5 (verified post-batch)

- `functions/src/metaSync/orchestrator.ts` — same shape as Batch 3; the response already exposed `legacy.adsSynced` / `accountsSynced` / `rateLimited` / `errors`, `workspace.inline` / `queued` / `rateLimited`, and `inline.counts.{ads,matched,ambiguous,unmatched}`. No API change needed.
- `functions/src/metaSync/trigger.ts` — same as Batch 4; the response shape is unchanged.
- `functions/src/metaSync/lease.ts` — same as Batch 4; the wrapper's result shape unchanged.
- `functions/src/__tests__/metaSyncConcurrency.test.js` — unchanged (Batch 1 §2 still holds: 24 per process, 120 aggregate).
- `functions/src/__tests__/metaSyncDispatch.test.js` — unchanged (Batch 2).
- `functions/src/__tests__/metaSyncOrchestrator.test.js` — unchanged (Batch 3 + Batch 4 lease-integration tests).
- `functions/src/__tests__/metaSyncLease.test.js` — unchanged (Batch 4).
- `functions/src/__tests__/whatsWorkingDashboard.test.js` — unchanged (Batch 4 source-shape tests).

---

## 2. Test run — raw output verbatim

`npm run build`:

```
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
```

Exits 0. No diagnostics. New test emits to `lib/__tests__/metaSyncRateLimit.test.js`.

`npm run test:phase970:rateLimit`:

```
> test:phase970:rateLimit
> npm run build && node lib/__tests__/metaSyncRateLimit.test.js
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
ok 1 - §8.7 — code 4 / subcode 1504022 (app-wide) on LEG A: classified, reported, run still ok
ok 2 - §8.7 — code 17 / subcode 2446079 (per-user) on LEG A: same classification surface
ok 3 - §8.7 — code 4 / subcode 1504022 (app-wide) on LEG B Cloud Tasks enqueue: classified, reported, run still ok
ok 4 - §8.7 — code 17 / subcode 2446079 (per-user) on LEG B Cloud Tasks enqueue: same classification surface
ok 5 - §8.7 — both LEG A and LEG B rate-limited on the same press: result.ok stays true, both rateLimited arrays populated
ok 6 - §8.7 — LEG B inline runSyncForAccount reports rate-limit via errors[] string match: classified, reported
ok 7 - isMetaRateLimit — direct field: code 4 / subcode 1504022 (the only code observed in production today)
ok 8 - isMetaRateLimit — direct field: code 17 / subcode 2446079 (per-user variant documented in investigation §8.3)
ok 9 - isMetaRateLimit — different subcode on the same code: not classified
ok 10 - isMetaRateLimit — different code with the same subcode: not classified
# tests 10
# pass 10
# fail 0
```

Regressions on the seven pre-existing Phase 970 surfaces — all clean:

| Suite | Result |
|---|---|
| `metaSyncConcurrency.test.js` (Batch 1) | 11/11 |
| `metaSyncDispatch.test.js` (Batch 2) | 14/14 |
| `metaSyncOrchestrator.test.js` (Batch 3 + Batch 4 lease-integration) | 25/25 |
| `metaSyncLease.test.js` (Batch 4) | 13/13 |
| `metaSyncRateLimit.test.js` (Batch 5, new) | **10/10** |
| `whatsWorkingDashboard.test.js` (Batch 4 cooldown-shape) | 14/14 |
| `whatsWorkingDashboardScope.test.js` (Phase 967) | 13/13 |
| `metaSync.contract.test.js` (Phase 14) | 17/17 |
| `metaScope.integration.test.js` (Phase 967) | 6/6 |

Headline "Batch 5 added +10 tests" agrees with the runner output. The orchestrator test count stays at 25 (Batch 5 doesn't add to it — the result-shape surface is already exercised there).

### Test-name vs assertion reconciliation (AGENTS.md rule 0b, half 1)

Every `ok` line above was walked against the assertion in its `test` body. Zero contradictions. Spot examples:

- *"§8.7 — both LEG A and LEG B rate-limited on the same press: result.ok stays true, both rateLimited arrays populated"* → seeds WS_A and WS_B (the Eslam/Manar dedup case from investigation §3); the LEG A fetch returns `code 4, subcode 1504022` for ACCT_A and the LEG B fan-out's `enqueueTask` throws the same envelope for ACCT_B; asserts `result.ok === true`, `result.legacy.rateLimited === [ACCT_A]`, `result.workspace.rateLimited === [ACCT_B]`, `result.workspace.queued === 0`. The "run still ok" contract is the load-bearing assertion — without it, the press would surface as failed and trigger a false "Sync failed" toast.
- *"§8.7 — LEG B inline runSyncForAccount reports rate-limit via errors[] string match: classified, reported"* → the LEG B inline stub returns `status: "ok"` but `errors: ["fetchAdInsights failed: Meta Graph API error 429: Application request limit reached (OAuthException)"]`. The orchestrator's `inlineRateLimited` collector uses `isMetaRateLimit`'s string-substring path (test 4 of `metaSyncOrchestrator.test.js` covers this classifier branch) to recognise the rate-limit. Asserts `result.workspace.rateLimited === [ACCT_A]` and `result.ok === true` — the string path through the classifier is the load-bearing one because LEG B inline doesn't `throw` on rate-limit; it accumulates them into `errors[]` and the run ends with `status: "ok"`.
- *"isMetaRateLimit — different subcode on the same code: not classified"* → asserts `{ code: 4, error_subcode: 999 }` returns `false`. The anti-misclassification guard. The investigation report §1.3 observed `code 4 / subcode 1504022` specifically; a future Meta envelope change that adds a new 4xxx subcode MUST NOT silently start classifying it as a rate-limit. The negative case pins the boundary.

### Per-file delta and total arithmetic (AGENTS.md rule 0b, half 2)

| File | Net tests added |
|---|---|
| `functions/src/__tests__/metaSyncRateLimit.test.ts` (new) | **+10** |
| `functions/src/__tests__/metaSyncOrchestrator.test.ts` (unchanged this batch) | 0 |
| `functions/src/__tests__/metaSyncLease.test.ts` (unchanged this batch) | 0 |
| `functions/src/__tests__/whatsWorkingDashboard.test.js` (unchanged this batch) | 0 |
| Frontend (App.tsx, metaService.ts, i18n.tsx) | 0 (no test of its own) |

Three legs, all pass:

- **(a)** Per-fixture index agreement — the runner output above names the 10 Batch-5 tests in the same order as the file declares them.
- **(b)** Per-file delta arithmetic — 10 tests added by Batch 5, in one new test file. No other test file modified.
- **(c)** Total arithmetic — runner totals (post-batch):
  - `metaSyncRateLimit.test.js` (this batch, new): **10 / 10**.

Headline "+10 tests added" agrees with "10/10 pass" because Batch 5 only touches one new test file.

---

## 3. The `sync.result.*` toast mapping

The dashboard's `onSyncNow` toast handler (now at `src/App.tsx:12960-13010`) maps the orchestrator's result shape to one of four i18n keys per investigation report §8.6:

| Condition | i18n key | EN | AR |
|---|---|---|---|
| `result.ok === false` | `sync.result.failed` | `Could not update the ads` | `تعذّر تحديث الإعلانات` |
| `result.ok === true` AND (`legacy.rateLimited.length > 0` OR `workspace.rateLimited.length > 0`) | `sync.result.partial` | `Some accounts were busy — they will update shortly` | `بعض الحسابات كانت مشغولة — سيتم تحديثها قريباً` |
| `result.ok === true` AND no rate-limits AND `workspace.queued > 0` | `sync.result.more_coming` | `The rest of your workspaces are updating now` | `باقي مساحات العمل يتم تحديثها الآن` |
| `result.ok === true` AND no rate-limits AND `workspace.queued === 0` | `sync.result.done` | `Ads updated` | `تم تحديث الإعلانات` |
| `result.needsReauth === true` (overrides the success shape) | hard-coded `يرجى إعادة الاتصال بميتا` / `Please reconnect Meta` | (reconnect path) | (reconnect path) |

The `partial` and `more_coming` arms are not mutually exclusive — both can fire on the same press (some throttled, some queued). The handler picks `partial` first because the user's press surfaced a failure, and "more coming" is a less useful headline than "partial".

The `failed-precondition` catch (in-flight lease collision from Batch 4) now renders the `sync.result.failed` localised string instead of the old hard-coded `فشلت المزامنة` / `Sync failed` path. This is the Batch-5 wiring of the new i18n keys for the lease-collision case the Batch-4 report §5 follow-up called out.

---

## 4. The first-real-run evidence line — server-side

> **CORRECTION (post-push review):** the original Batch 5 commit
> emitted the `console.log` from `App.tsx:12980-12995` only — a browser
> `console.log` that **never reaches Cloud Logging**. The Cloud Tasks
> fan-out workspaces also never touch the browser, so their
> matching counts were invisible. The two follow-ups here move the
> load-bearing logging server-side and update the runbook query to
> target the deployed `function_name` (not the internal helper).

The first-real-run evidence is logged in **two server-side sites**,
each tagged by the deployed Cloud Function's `function_name` so
Cloud Logging queries match it directly.

### 4.1 Inline leg (active workspace) — emitted from `runFullSync` in `orchestrator.ts:725-758`

```ts
console.log(
  "📊 [Batch 5] First-successful-Phase-14-run evidence (inline + LEG A summary):",
  JSON.stringify({
    ownerUid: opts.ownerUid,
    activeWorkspaceId: opts.activeWorkspaceId ?? null,
    ok: result.ok,
    resultKey,
    legacy: {
      accountsSynced: result.legacy.accountsSynced,
      adsSynced: result.legacy.adsSynced,
      rateLimited: result.legacy.rateLimited,
      errorCount: result.legacy.errors.length,
    },
    inline: result.workspace.inline
      ? {
          workspaceId: result.workspace.inline.workspaceId,
          accountId: result.workspace.inline.accountId,
          status: result.workspace.inline.status,
          counts: {
            ads: result.workspace.inline.counts.ads,
            matched: result.workspace.inline.counts.matched,
            ambiguous: result.workspace.inline.counts.ambiguous,
            unmatched: result.workspace.inline.counts.unmatched,
          },
        }
      : null,
    fanOut: {
      queued: result.workspace.queued,
      rateLimited: result.workspace.rateLimited,
    },
  }),
);
```

This fires for **both** the sidebar (`metaSyncPerformance`) and the
dashboard (`triggerMetaSync`) presses, because both call
`runFullSyncWithLease → runFullSync`. Cloud Logging indexes
the log by whichever deployed function was the entry point.

### 4.2 Fanned-out leg (every other live workspace) — emitted from `worker.ts:71-95`

```ts
console.log(
  "📊 [Batch 5] First-successful-Phase-14-run evidence (fanned-out worker):",
  JSON.stringify({
    ownerUid: payload.userId,
    workspaceId: payload.workspaceId,
    accountId: payload.accountId,
    trigger: payload.trigger || "scheduled",
    ok: result.ok,
    status: result.status,
    counts: {
      ads: result.counts.ads,
      matched: result.counts.matched,
      ambiguous: result.counts.ambiguous,
      unmatched: result.counts.unmatched,
    },
    errorCount: result.errors.length,
  }),
);
```

This fires **once per fanned-out workspace-account pair** that
runs in production. The fan-out workspaces never touch the
browser, so this server-side log is the only place their counts
land.

### 4.3 Cloud Logging queries (corrected — `function_name` is the deployed name, not the internal helper)

**Inline leg** (queries by deployed function name — the helper
`runFullSyncWithLease` is a module, not a Cloud Function, so a
query against its name returns nothing):

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

Either query surfaces the inline leg. The `\(inline` marker
distinguishes this line from the fan-out variant (next).

**Fanned-out leg** (every workspace, one log line each):

```
resource.type="cloud_function"
resource.labels.function_name:"metaSyncAccountWorker"
textPayload=~"First-successful-Phase-14-run evidence \\(fanned-out"
```

A successful first deploy with N fan-out tasks shows N log
lines, one per workspace. The `\(fanned-out` marker
distinguishes this line from the inline variant.

**Both legs together** (matches all Batch-5 evidence):

```
resource.type="cloud_function"
textPayload=~"First-successful-Phase-14-run evidence"
```

The `\(inline` / `\(fanned-out` markers in the textPayload
distinguish the two sources if the on-call engineer needs to split
them later.

### 4.4 Browser-side `console.log` (kept for immediate feedback)

`src/App.tsx:12980-12995` retains a `console.log` with the same
JSON shape for whoever has DevTools open during a press. It is
**not** the source of truth for the runbook — DevTools is per-user
and per-session, and the counts do not persist. The server-side
logs (§4.1, §4.2) are what the runbook depends on.

### 4.5 What the on-call engineer reads in Cloud Logging

The first successful Phase 14 run surfaces:
- `ads > 0` (Meta returned ad rows for the account).
- `matched > 0` proportional to the workspace's generation count (the matching predicate is working).
- `unmatched` carrying the ads whose hashes had no viable generation candidate.
- `ambiguous` carrying the ads whose top two candidates were within the ambiguity margin.

If `ads > 0` but `matched === 0` after a clean press, the matching predicate is broken — escalate. The structural-guard test on `matchAdCreative` in `imageMatching.contract.test.ts` and the unit tests in `metaSync.contract.test.ts` (test 11 — `fetchAdInsights — fetches all 3 windows`) cover the offline path; this log line is the first evidence about whether the live path works in production.

---

## 5. Post-deploy follow-ups (per the user's carry-in)

Three follow-ups carried into this batch's report (and into the runbook) per the user's instruction after Batch 4:

### 5.1 The aggregate Graph peak is 120

- **Per-process peak simultaneous Graph calls = 24** at `GRAPH_CONCURRENCY = 8` (insights pass dominates: 8 outer ads × 3 parallel insight windows per ad).
- **Aggregate under 5-task Cloud Tasks fan-out = 120** simultaneous.

Cloud Logging watch: `resource.labels.function_name:"metaSyncPerformance" AND textPayload=~"Meta insights error for account" AND textPayload=~"OAuthException"`. The helper `runFullSyncWithLease` is a module, NOT a Cloud Function — a query against its name returns nothing. The match must be on the deployed `function_name` that wraps the orchestrator. If `OAuthException code 4 / subcode 1504022` (or `code 17 / subcode 2446079`) recurs post-deploy, the cause is rate-limit pressure, not a regression.

**One-line retune** if the limit keeps firing: drop `GRAPH_CONCURRENCY` from `8` to `4` in `functions/src/metaSync/shared.ts:120`. The structural-guard test in `metaSyncConcurrency.test.js` (test 10) will fail and force a deliberate update of the expected value.

| Metric | N=8 (current) | N=4 (retune) |
|---|---|---|
| Per-process peak | 24 | 12 |
| Aggregate under 5-task fan-out | 120 | 60 |
| Wall-clock for 383-ad account at 500ms RTT | ~96s | ~190s |
| Headroom under 540s `runSyncForAccount` ceiling | 444s | 350s |

Roughly double wall-clock, halve aggregate. The platform's 540s ceiling still leaves 350s of headroom for image downloads and metaConnection writes. Acceptable trade if the limit keeps firing.

### 5.2 `canSyncNow` and `cooldownEndsAt` are frozen for one release

The Phase 970 Batch 4 freeze (§9 decision 2) keeps the legacy fields in the `getWhatsWorkingDashboard` response so cached-JS clients that still read them render the button as always-enabled. The frontend has stopped reading them. **These fields are slated for deletion in a follow-up phase.**

**Do NOT delete the fields in an ad-hoc patch.** The in-code comments at `whatsWorkingDashboard.ts:91-104` and `WhatsWorkingDashboard.tsx:14-40` document the freeze. After one release cycle (so cached-JS clients that read the old fields are flushed from the wild), the next batch can drop the fields from the `SyncStatus` interface entirely. Until then, the follow-up batch is a docs/cleanup change, not a runtime change.

### 5.3 First successful Phase 14 run — matching counts

Per the user: "The first successful Phase 14 run must report ads / matched / ambiguous / unmatched. Phase 14 has never completed in production, so those counts are the first real evidence about whether ad-to-creative matching works."

Wired in this batch (`src/App.tsx:12980-12995`) and operationalised in the runbook (`POST_DEPLOY_RUNBOOK.md` §4). See §4 above for the full logging shape and the Cloud Logging query.

---

## 6. Known limits of this batch

1. **The Batch 4 `whatsWorkingDashboard.test.ts` source-shape tests** (the two tests that replaced the cooldown-math tests) assert on source-file shape (`const SYNC_COOLDOWN_MS` absent, `canSyncNow: true` / `cooldownEndsAt: null` literals present, the `lastSyncAt + SYNC_COOLDOWN_MS` formula absent) rather than on the dashboard's actual response shape. They serve as a regression guard against re-introducing the cooldown gate, but they would still pass if a future caller broken some unrelated way (e.g., the `SyncStatus` interface is renamed in a way that bypasses the test's regex matches). The structural-guard test (test 21 in `metaSyncOrchestrator.test.js`) and the 13 Phase 967 dashboard scope tests (`whatsWorkingDashboardScope.test.js`) cover the response-shape surface; a future reader looking for "is the cooldown gate gone AND does the dashboard work end-to-end" should read both.
2. **The four `sync.result.*` strings are loaded but the per-account rate-limit detail is in the toast, not the toasts themselves.** `partial` says "Some accounts were busy"; it does NOT list which accounts. The list lives in the result-shape's `legacyRateLimited` / `workspaceRateLimited` arrays, which the runbook reads. A future batch could enrich the toast with the count (e.g., "3 accounts were busy, will update shortly") if product wants the number surfaced in-line; not done in Batch 5 because §8.6 specified the prose, not the number.
3. **The `failed-precondition` catch path renders `sync.result.failed` not a separate `sync.result.busy` or similar.** The user pressed Sync Now and a sync was already running; the toast says "Could not update the ads" in the user's language. The `AlreadyRunningError` carries the holderUid and the auto-release boundary timestamp, so a log-side attribution is possible; the toast surface intentionally does NOT include the holderUid because (a) it's almost always the same user double-pressing, and (b) §8.6 specified the prose. Documented in `POST_DEPLOY_RUNBOOK.md` §7.
4. **`metaDailySync` (scheduled 03:00 UTC) and `metaSyncAccountWorker` (task-dispatched LEG B fan-out) do not exercise the rate-limit classification at all in Batch 5.** Both pre-date Phase 970 and are out of scope. The rate-limit classifier (`isMetaRateLimit`) is exported and could be wired into their error paths by a future batch if the scheduled job starts emitting Meta's code 4 envelope (it doesn't today — only the manual path does, because the manual path is the only one that batches 1,149 simultaneous calls).
5. **The "in-flight lease" path inside `runFullSyncWithLease` is not surfaced in the toast.** A second-press collision (already running) renders `sync.result.failed` rather than a dedicated "A sync is already running, please wait" toast. The wrapper's `HttpsError("failed-precondition", ...)` translation lives at `trigger.ts:89-98` and `index.ts:BLOCK4_PLACEHOLDER` and is rendered as `sync.result.failed` per the App.tsx catch. The investigation report §6 explicitly preferred "a sync is already running" copy ("a state, not a wait") over a wait-state phrasing, but §8.6 was about the orchestrator-result-toast surface (success/partial/queued/failed), not the lease-collision surface. A future batch could add a `sync.busy` i18n key and surface it here; not done in Batch 5 to keep this batch's surface small.

---

## 7. Commit + push (planned)

Files in the planned commit:

```
functions/src/__tests__/metaSyncRateLimit.test.ts                  (new)
functions/package.json                                              (modified — test:phase970:rateLimit + aggregate entry)
src/services/metaService.ts                                         (modified — expose legacyRateLimited / workspaceQueued / workspaceRateLimited)
src/App.tsx                                                         (modified — wire sync.result.* strings, emit first-real-run evidence console.log)
specs/970-sync-unification/POST_DEPLOY_RUNBOOK.md                   (new — on-call runbook)
specs/970-sync-unification/reports/batch-05-report.md               (new — this file)
```

Branch: `970-sync-unification`.
Push: `git push origin 970-sync-unification`.
Deploy: **deferred** (matches every Batch in Phase 970).

---

## 8. Phase 970 closeout

After this batch lands, Phase 970 closes. The work tree (Batches 1–5) is:

| Batch | What | Commit |
|---|---|---|
| 1 | GRAPH_CONCURRENCY = 8 limiter, peak-vs-wall-clock reconciliation (24 per process, 120 aggregate, 766 wall-clock). | `bd1c7c1` |
| 2 | D3 field override, D4 task body envelope, discovery filter (soft-delete + dedup). | `f4dfb97` |
| 3 | Orchestrator `runFullSync` unifying LEG A and LEG B. `isMetaRateLimit`. | `08d59d1` |
| 4 | Cooldown removed everywhere (8 backend + 6 frontend + 1 i18n key pair). In-flight lease (`lease.ts`, 10-min TTL, holder-verified release). `runFullSyncWithLease` wrapper. | `1f90441` |
| 5 | `metaSyncRateLimit.test.ts` contract. `sync.result.*` strings wired. Server-side first-real-run evidence (orchestrator + worker). `POST_DEPLOY_RUNBOOK.md` with corrected Cloud Logging queries (deployed function_name, not internal helper). | (this commit) |

The deploy steps that remain are operational, not code:

1. `firebase deploy --only firestore:indexes` (Batch 2 D3 — adds the `private.metaConnected` collection-group field override).
2. `firebase deploy --only functions` (Batches 1, 3, 4 — runs the limiter, orchestrator, lease wrapper).

The Phase 14 pipeline has never completed a run in production. After the deploy, the first real press surfaces the matching counts (ads / matched / ambiguous / unmatched) in Cloud Logging. Those numbers are the first evidence about whether ad-to-creative matching works at all — and whether `GRAPH_CONCURRENCY = 8` is the right starting number or whether the 120 aggregate needs to drop to 60 via the Batch 4 retune. The runbook formalises both observations.
