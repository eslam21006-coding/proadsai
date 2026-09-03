# Batch 02 Report — D3, D4, and the discovery filter

**Worktree:** `D:\proads-worktrees\cumulative-learning`
**Branch:** `970-sync-unification`
**Parent of branch:** `969-cumulative-learning` at `7b24454`
**Scope:** Three coupled fixes the Phase 14 scheduled dispatch path needs
to actually run. Without these, `metaDailySync` (3 AM UTC) fails nightly
with no tasks enqueued, and even with the index fix every dispatched
task would die on a wrong-shape body. Investigation report §5 and §8.3.

---

## 1. What changed

| File | Change |
|---|---|
| `firestore.indexes.json` | D3. Adds `fieldOverrides` entry — a single-field `COLLECTION_GROUP_ASC` exemption for `private.metaConnected`. The pre-fix `fieldOverrides: []` was the root cause of the nightly `FAILED_PRECONDITION`. **Field change only; no deployed index yet.** The deploy is a separate `firebase deploy --only firestore:indexes` step (§5). |
| `functions/src/metaSync/dispatcher.ts` | D4 + discovery. (a) `listConnectedAccounts` is exported (was a private function — export was needed to test it). (b) The body of each enqueued task is wrapped in `{ data: … }` via the new `buildSyncTaskBody(acct, nowMs)` helper, also exported. (c) Discovery now joins the parent workspace doc, skips soft-deleted workspaces (`deletedAt != null`), and de-duplicates by `accountId` — same account linked to two workspaces produces one dispatch, not two (today's `act_781389063661831` is on both "Eslam Salah" and "Manar", investigation report §3). |
| `functions/src/__tests__/metaSyncDispatch.test.ts` (new) | 14 tests: 3 for `buildSyncTaskBody` (envelope shape, stability, literal trigger), 10 for `listConnectedAccounts` (live + soft-deleted + dedup + cross-owner + mixed), 1 structural guard pinning the exports. |
| `functions/package.json` | New `test:phase970:dispatch` script; new entry in the aggregate `test` script. |

`runSyncForAccount`, `matchAdCreative`, the verdict engine, and the
learning aggregates are not touched. The matching and verdict paths
keep their byte-identical shape.

---

## 2. D3 — `private.metaConnected` field override

### Symptom (investigation §1.1)

Every night at 03:00 UTC the dispatcher threw:

```
[2026-08-31T03:00:09Z] ERROR metadailysync :: Error: 9 FAILED_PRECONDITION:
  The query requires a COLLECTION_GROUP_ASC index for collection private
  and field metaConnected.
```

`firestore.indexes.json` shipped `fieldOverrides: []`. The query at
`dispatcher.ts:43–46` — `collectionGroup('private').where('metaConnected', '==', true)` —
is single-field on a collection group, which requires the field override
to be declared.

### Fix

One new entry, additive. After this batch, `firestore.indexes.json`
ends with:

```json
"fieldOverrides": [
  {
    "collectionGroup": "private",
    "fieldPath": "metaConnected",
    "indexes": [
      { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" }
    ]
  }
]
```

### Why this is the right shape

Three constraints the override has to satisfy simultaneously:

- The query is `where('metaConnected', '==', true)` — equality on a single field.
  → `order: "ASCENDING"` (Firestore accepts `==` against any indexed field; the
  ASC index covers equality reads for `==`).
- The query is `collectionGroup('private')`, not `collection('private')`.
  → `queryScope: "COLLECTION_GROUP"`. A regular scope would miss every
  cross-workspace `users/{uid}/workspaces/{wid}/private/metaConnection`
  match.
- The shape matches the existing exemption-letter pattern documented in the
  investigation report §1.1 (the failing stack trace literally included
  the create-exemption URL). Future readers can find the override by the
  collection-group name.

### Why this is not a test target

`fieldOverrides` is enforced server-side by Firestore. A unit test that
"asserts the field override is in place" would either (a) introspect the
JSON — testing the file, not the runtime — or (b) issue the same
collectionGroup query against a stub and check that the stub returns
what we seeded, which tests the stub, not Firestore. The override is
included in a separate "deploy indexes" step (per §5 below).

### What **does** get tested around D3

The contract that D3 enables: `listConnectedAccounts` actually returns
`private/metaConnection` rows. That contract is the **subject** of 10
tests in `metaSyncDispatch.test.ts`, exercising it through the same
`collectionGroup('private')` shape the production code uses. If D3
had not landed, the worker's *first* task in production would still
fail (different failure mode — the index); but locally and in CI the
contract tests pass with our Firestore stub.

---

## 3. D4 — Task body envelope

### Symptom (investigation §1.2)

`onTaskDispatched` reads `req.body.data` — this is the documented
`firebase-functions/lib/common/providers/tasks.js:42` contract.
`dispatcher.ts:101` (pre-fix) sent `JSON.stringify({ userId, workspaceId,
... })` — the bare payload — so every dispatched task threw:

> metaSyncAccountWorker: missing required fields in payload

This happened for **every** task ever queued. Combined with D3, the
Phase 14 pipeline had a 100% failure rate across all paths (manual,
scheduled, task-dispatched).

### Fix

`buildSyncTaskBody(acct, nowMs)` exported as a pure helper. Used in
`metaDailySync` at `dispatcher.ts:153`. Output is:

```json
{
  "data": {
    "userId": "...",
    "workspaceId": "...",
    "accountId": "...",
    "trigger": "scheduled",
    "nowMs": 1700000000000
  }
}
```

This shape matches `SyncTaskPayload` at `worker.ts:23–29` and the
`req.data` read at `worker.ts:53`. The worker destructures
`payload.userId`, `payload.workspaceId`, `payload.accountId`,
`payload.trigger`, `payload.nowMs` — exactly what the envelope carries.

### Why `buildSyncTaskBody` is exported

Two reasons:

1. The contract test reads the bytes of the body and asserts the
   envelope shape — a unit test on the string-form alone is more
   legible than mocking `getTasksClient().enqueueTask`.
2. The orchestrator (Batch 3) will reuse the same envelope for the
   inline Leg B dispatch path. Exporting now avoids a second refactor
   next batch.

### Tests

`metaSyncDispatch.test.ts`:

- `buildSyncTaskBody — wraps the payload in { data: { … } } so the worker's req.data reads it`
- `buildSyncTaskBody — JSON is parseable and stable across calls`
- `buildSyncTaskBody — trigger is exactly the literal 'scheduled'`

The "no leaked top-level fields" assertion is built into test 1 —
`parsed.userId === undefined`, `parsed.workspaceId === undefined`. The
envelope is not just present; it is the **only** place the fields live.

---

## 4. Discovery filter — soft-deleted + dedup

### Soft-deleted workspaces

`listConnectedAccounts` now joins the parent workspace doc:

```ts
const workspaceSnap = await getDb()
    .collection("users").doc(uid)
    .collection("workspaces").doc(workspaceId)
    .get();
const wsData = workspaceSnap.data();
if (!wsData || wsData.deletedAt != null) continue;
```

Two skip rules:

- `!wsData` — workspace doc absent entirely (Firestore hard delete).
  No workspace → no dispatch.
- `wsData.deletedAt != null` — soft-deleted workspace (the
  investigation §1.4 `dueXIiFdEJKuAjSuYlUX` case). Kept on the
  collectionGroup because the `private/metaConnection` doc was never
  cleaned up; the dispatcher would otherwise keep queuing tasks for
  it forever.

Three treated-as-not-deleted cases (kept):

- `wsData.deletedAt === null` (current soft-delete-aware workspaces).
- `deletedAt` field absent entirely on the workspace doc
  (legacy workspaces predate the soft-delete column).
- The workspace doc exists but `private/metaConnection.metaConnected`
  is `false` — caught by the `where('metaConnected', '==', true)` filter
  before the workspace join.

### Account deduplication

Today's production data has `act_781389063661831` linked to **two**
live workspaces ("Eslam Salah" and "Manar", investigation §3).
Pre-fix, `listConnectedAccounts` produced two entries, and the
dispatcher enqueued two tasks. Both tasks targeted the same Meta ad
account; the worker hit the same Graph endpoints twice on the same
night, wasting ~3,000 Graph calls per night (per-account peak pre-D5
was ~1,500; 2 × that).

Post-fix, the dispatcher maintains a `Set<string>` of seen account IDs
across the loop. The first workspace encountered (sorted by
`__name__` ASC) wins; the second is silently dropped. Result:
`act_781389063661831` dispatches exactly once per night.

### Why the de-dup is silent

The de-dup is logged elsewhere — the dispatcher already logs the
dispatched-vs-discovered counts at `dispatcher.ts:165–170`:

```
[metaDailySync] dispatched X/Y tasks to metaSyncQueue
```

If `X < Y`, the missing accounts are the de-duplicated ones. The
operator can see it from the existing log without a new log line.
Adding a per-account de-dup log line would itself trip D5's
rate-limit reasoning (no — it'd be one line per de-dup, bounded by
`MAX_DISPATCH_PER_RUN` per night — the only burst this would create
is at night, where the rate-limit tolerance is highest). Decision
made to skip the log; it can be added later if operators ask.

### Tests

10 of the 14 tests in `metaSyncDispatch.test.ts` exercise
`listConnectedAccounts`. Highlights:

- *"— skips soft-deleted workspaces (deletedAt != null)"* — exact case
  from investigation §1.4.
- *"— de-duplicates by accountId across workspaces (Eslam Salah / Manar case)"* —
  exact case from investigation §3.
- *"— keeps workspaces where the deletedAt field is missing entirely (legacy pre-soft-delete workspaces)"* —
  legacy compatibility.
- *"— keeps workspaces with deletedAt explicitly null"* — current shape.
- *"— skips workspaces where the workspace doc is missing entirely"* —
  hard-delete case is distinct from soft-delete.
- *"— mixed: dedup, soft-deleted, and live all coexist correctly"* —
  four-fixture interaction in one test, asserting the combined
  filter holds up.

---

## 5. Test run — raw output verbatim

`npm run build`:

```
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
```

Exits 0. No diagnostics. New test file emits to
`lib/__tests__/metaSyncDispatch.test.js`.

`npm run test:phase970:dispatch`:

```
> test:phase970:dispatch
> npm run build && node lib/__tests__/metaSyncDispatch.test.js
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
ok 1 - buildSyncTaskBody — wraps the payload in { data: { … } } so the worker's req.data reads it
ok 2 - buildSyncTaskBody — JSON is parseable and stable across calls
ok 3 - buildSyncTaskBody — trigger is exactly the literal 'scheduled'
ok 4 - listConnectedAccounts — returns the live, connected workspace
ok 5 - listConnectedAccounts — skips soft-deleted workspaces (deletedAt != null)
ok 6 - listConnectedAccounts — keeps workspaces with deletedAt explicitly null
ok 7 - listConnectedAccounts — keeps workspaces where the deletedAt field is missing entirely on the workspace doc (legacy pre-soft-delete workspaces)
ok 8 - listConnectedAccounts — skips workspaces where the workspace doc is missing entirely
ok 9 - listConnectedAccounts — skips docs where metaConnected is false
ok 10 - listConnectedAccounts — de-duplicates by accountId across workspaces (Eslam Salah / Manar case)
ok 11 - listConnectedAccounts — distinct accounts under the same owner all dispatch
ok 12 - listConnectedAccounts — distinct accounts across different owners all dispatch
ok 13 - listConnectedAccounts — mixed: dedup, soft-deleted, and live all coexist correctly
ok 14 - structural guard — dispatcher exports listConnectedAccounts and buildSyncTaskBody
# tests 14
# pass 14
# fail 0
```

`npm run test:phase970:concurrency` (Batch 1 regression check):

```
ok 1 - mapWithConcurrency — peak in-flight never exceeds the limit
ok 2 - mapWithConcurrency — output preserves input order regardless of worker count
ok 3 - mapWithConcurrency — propagates a rejection without dropping in-flight work
ok 4 - mapSettledWithConcurrency — same input/output lengths, success and failure verdicts preserved
ok 5 - mapSettledWithConcurrency — peak in-flight never exceeds the limit
ok 6 - mapSettledWithConcurrency — output preserves input order
ok 7 - mapWithConcurrency — empty input resolves to an empty array
ok 8 - mapSettledWithConcurrency — limit larger than input still produces every input exactly once
ok 9 - mapWithConcurrency — limit of 1 is still valid (serial baseline)
ok 10 - structural guard — shared.ts exports GRAPH_CONCURRENCY === 8
ok 11 - structural guard — metaSync/shared.ts is the only place this constant is defined
# tests 11
# pass 11
# fail 0
```

`npm run test:phase14:metaSync` (existing dispatcher + sync contract
regression — Batch 2 must not break this):

```
ok 1 - aggregateAdMetrics — 3-day rolling + conversion count
ok 2 - aggregateAdMetrics — no conversions → cpa3d null
ok 3 - aggregateAdMetrics — empty windows return zeros
ok 4 - aggregateAdMetrics — ctrLink derived from inline_link_clicks / impressions
ok 5 - aggregateAdMetrics — peak1dCtr from 7-day daily breakdown
ok 6 - aggregateAdMetrics — spend7d sums the last_7d daily window (display-only)
ok 7 - sumSpend3d — sums spend across the 3-day window per ad
ok 8 - computeSpendSharePct — ad's share within its ad set
ok 9 - computeSpendSharePct — ad set sum = 0 → no divide-by-zero
ok 10 - computeSpendSharePct — ad not in set → 0%
ok 11 - fetchAdInsights — fetches all 3 windows; failure in one doesn't poison others
ok 12 - fetchAdInsights — all three windows succeed when API is healthy
ok 13 - idempotency — aggregateAdMetrics is deterministic
ok 14 - partial failure — sumSpend3d ignores missing windows gracefully
ok 15 - SyncResult — empty counts shape matches contract
ok 16 - dispatcher — exports the spec-required queue name and path
ok 17 - sample hierarchy shape — verifies the SyncResult aggregator accepts Meta's shape
# tests 17
# pass 17
# fail 0
```

### Test-name vs assertion reconciliation (AGENTS.md rule 0b, half 1)

Every `ok` line above was walked against the assertion in its `test`
body. Zero contradictions. Spot examples:

- *"buildSyncTaskBody — wraps the payload in { data: { … } } so the
  worker's req.data reads it"* → parses the JSON; asserts
  `parsed.data` exists; asserts each field of `SyncTaskPayload`
  (`userId`, `workspaceId`, `accountId`, `trigger`, `nowMs`) is
  present at `parsed.data.X`; asserts `parsed.userId === undefined`
  and `parsed.workspaceId === undefined` to catch a regression that
  leaks fields past the envelope. Name, body, and direction agree.
- *"buildSyncTaskBody — trigger is exactly the literal 'scheduled'"* →
  asserts `parsed.data.trigger === 'scheduled'`. Body is a single
  equality; the name names it exactly.
- *"listConnectedAccounts — de-duplicates by accountId across
  workspaces (Eslam Salah / Manar case)"* → seeds the two-workspace
  shared-account scenario from investigation §3; asserts the result
  length is `1` and `out[0].accountId === 'act_shared'`. Name
  describes the case; body asserts the dedup.
- *"listConnectedAccounts — skips soft-deleted workspaces
  (deletedAt != null)"* → seeds `workspaceDeleted: true`; asserts
  result length is `0`. Name, body, direction agree.
- *"listConnectedAccounts — keeps workspaces where the deletedAt
  field is missing entirely (legacy pre-soft-delete workspaces)"* →
  seeds a workspace doc with no `deletedAt` field; asserts length
  is `1`. Companion test *"— skips workspaces where the workspace
  doc is missing entirely"* covers the hard-delete case (no
  workspace doc at all).
- *"structural guard — dispatcher exports listConnectedAccounts and
  buildSyncTaskBody"* → asserts both are functions on the module
  exports. This is the lock against a future refactor that moves
  them back to private and silently undoes Batch 2.

### Per-file delta and total arithmetic (AGENTS.md rule 0b, half 2)

| File | Net tests added |
|---|---|
| `functions/src/__tests__/metaSyncDispatch.test.ts` (new) | **+14** |
| `functions/package.json` (modified — new scripts) | 0 net |
| `functions/src/metaSync/dispatcher.ts` (modified — exports + body envelope + filter + dedup) | 0 net |
| `firestore.indexes.json` (modified — D3 field override) | 0 net |

Three legs, all pass:

- **(a)** Per-fixture index agreement — the runner output above names
  the 14 tests in the same order as the file declares them.
- **(b)** Per-file delta arithmetic — 14 tests added by Batch 2, in
  one new test file. No other test file in this repo is modified.
- **(c)** Total arithmetic — runner totals:
  - `metaSyncDispatch.test.js` (this batch): 14 / 14.
  - `metaSyncConcurrency.test.js` (Batch 1 regression): 11 / 11.
  - `metaSync.contract.test.js` (Phase 14 regression): 17 / 17.

Headline "+14 tests added" agrees with "14/14 pass" because Batch 2
only touches the new test file. There is no source file in this
batch whose own test count changed in either direction.

---

## 6. Known limits of this batch

1. **The D3 field override is in source but not yet deployed.** The
   `firestore deploy --only firestore:indexes` step that activates it
   is a separate command and is **explicitly out of Batch 2 scope**
   per the batch boundary ("Batch 2 — D3 + D4 — the index exemption
   and the task body envelope"). Pre-deploy correctness check is
   documented below in §7.

2. **The dedup is silent.** The dispatcher logs the
   `dispatched/discovered` count at the end of the run; the operator
   can see a discrepancy between the two without an extra log line per
   dedup. The investigation report mentions "de-dup by `accountId`"
   without specifying visibility, so silence was the default.

3. **Workspace read adds one extra `get()` per workspace.** The dedup
   + soft-delete join costs one Firestore read per discovered
   connection. For tonight's data (under 30 live connected workspaces
   in total across the whole app) this is negligible. If the count
   ever climbs into the thousands, the join should move into the
   query (Firestore 9+ supports cross-subcollection filters, though
   that path is currently undocumented in this codebase). Not a
   blocker for v1.

4. **The dispatcher's worker URL is hardcoded.** `workerUrl()`
   builds `https://{region}-proadsai-saas.cloudfunctions.net/…`.
   That pre-dates Batch 2 and is left untouched — out of scope, and
   the report's investigation §1.6 notes it as inert config drift
   that Batch 3 (orchestrator) does not need to fix either.

---

## 7. Pre-deploy checklist (manual step before Batch 3)

D3 (the index override) does not take effect until a deploy runs.
The deploy is a separate command:

```
firebase deploy --only firestore:indexes --project proadsai-saas
```

That step was deliberately kept out of this batch's commit because
the test suite runs against compiled `lib/`, not against live
Firestore. After Batch 2 lands but before Batch 3 (the orchestrator)
ships, the deploy must happen so the discovery path actually works
end-to-end. Logged here so it isn't lost.

---

## 8. Commit + push (planned)

Files in the planned commit:

```
firestore.indexes.json                           (modified — D3)
functions/src/metaSync/dispatcher.ts             (modified — exports + envelope + filter + dedup)
functions/src/__tests__/metaSyncDispatch.test.ts (new)
functions/package.json                           (modified — script entries)
specs/970-sync-unification/reports/batch-02-report.md  (new — this file)
```

Branch: `970-sync-unification`.
Push: `git push origin 970-sync-unification`.
Deploy: **deferred**. `firebase deploy --only firestore:indexes` is a
manual pre-Batch-3 step documented in §7, **not** part of this commit.

---

## 9. Next batch (D5 done; Batch 3 — orchestrator + runFullSync)

Batch 3 builds the new `metaSync/orchestrator.ts`:

- One `runFullSync({ ownerUid, callerUid, activeWorkspaceId })`
  function.
- Both `metaSyncPerformance` and `triggerMetaSync` become thin
  wrappers over it (no new callable name → no client/authorization
  surface change).
- Leg A: extract the legacy body verbatim, account-global, inline.
- Leg B: hybrid. Inline for the caller's active workspace; Cloud
  Tasks fan-out for the other live workspaces, de-duplicated by
  account.
- `metaSyncPerformance` runtime raised from 120s / 256 MiB to
  540s / 2 GiB.
- Plus the `isMetaRateLimit()` classifier that collects rate-limited
  accounts into the result rather than throwing.

The orchestrator re-uses `buildSyncTaskBody` (Batch 2 export) for
its Leg B fan-out body, so the D4 envelope stays consistent across
both call sites. The contract test scaffolding (`shared.ts:967`,
`listConnectedAccounts`, `buildSyncTaskBody` already exported) is
in place for the orchestrator's tests.
