# Batch 04 Report — Cooldown removal + in-flight lease + shared label + i18n

**Worktree:** `D:\proads-worktrees\cumulative-learning`
**Branch:** `970-sync-unification`
**Parent of branch:** `969-cumulative-learning` at `7b24454`
**Scope:** Remove the 1-hour cooldown that lived at every layer of the
sync press path, replace it with a state-based in-flight lease
(`lease.ts`, TTL ≤10 min, finally-cleared, overwrite-on-expire,
holder-identity-verified), standardise the two "Sync Now" button
labels on one shared Arabic string, freeze the legacy
`canSyncNow` / `cooldownEndsAt` fields for one release per §9
decision 2, and add the four user-facing result strings from §8.6.

---

## 1. What changed

### Backend (9 files)

| File | Change |
|---|---|
| `functions/src/metaSync/lease.ts` (new) | `acquireLease(db, ownerUid, holderUid, nowMs, ttlMs?)` and `releaseLease(db, ownerUid, holderUid)`. Deps-injected (`db` + `nowMs`) so the test suite drives them with an in-memory Firestore stub. Holds a `metaSyncLeases/{ownerUid}` doc with `holderUid`, `acquiredAtMs`, `expiresAtMs`. Acquire uses `runTransaction` to serialise across processes. Stale leases (TTL expired, `<=` not `<`) are overwritten on the next acquire. Release verifies holder identity inside the transaction. Exports `LEASE_TTL_MS = 10 * 60 * 1000`, `LEASE_DOC_COLLECTION = "metaSyncLeases"`, and `AlreadyRunningError` — the typed refusal callers translate. |
| `functions/src/metaSync/orchestrator.ts` | Adds `runFullSyncWithLease(opts)`. Wraps `runFullSync` in `acquireLease` → `runFullSync` → `releaseLease` (try/finally). Throws `AlreadyRunningError` when acquire returns `ok: false`. The lease's two helpers are overridable via `acquireLeaseOverride` / `releaseLeaseOverride` test seams. Release failures are swallowed (logged, not fatal) — the TTL safety net is the recovery path. |
| `functions/src/metaSync/trigger.ts` | Replaces `COOLDOWN_MS` + `readLastSyncAt` + the 8-line cooldown gate block with one `runFullSyncWithLease` call. Catches `AlreadyRunningError` and throws `HttpsError("failed-precondition", "A Meta sync is already running for this account. Please wait a moment and try again.")`. The cooldown is **gone**. |
| `functions/src/index.ts` | `metaSyncPerformance` (manual sidebar) calls `runFullSyncWithLease` instead of `runFullSync` directly. Same `HttpsError("failed-precondition", …)` translation. |
| `functions/src/whatsWorkingDashboard.ts` | Removes `SYNC_COOLDOWN_MS` const and the `cooldownEndsAt` / `canSyncNow` computation. The `SyncStatus` interface keeps both fields (annotated `@deprecated`) so cached-JS clients still compile, but the dashboard emits them as **frozen constants** (`canSyncNow: true`, `cooldownEndsAt: null`) regardless of input. The `readLastSyncAt` import is no longer needed and removed. |
| `functions/src/__tests__/metaSyncLease.test.ts` (new) | 13 tests for the lease: fresh acquire writes the doc, same-caller re-acquire extends TTL, contended acquire returns `ok: false` with holder info, stale lease is overwritten, boundary at exactly `expiresAtMs` is stale, release succeeds for holder, release refuses for non-holder, release is no-op with no doc, release refuses after takeover, `AlreadyRunningError` carries `holderUid` + `expiresAtMs`, error message describes a state not a wait (anti-cooldown copy rule), `LEASE_TTL_MS === 10 * 60 * 1000`, `LEASE_DOC_COLLECTION === "metaSyncLeases"` (not under `users/` or `metaConnections/`). |
| `functions/src/__tests__/metaSyncOrchestrator.test.ts` | Adds 4 lease-integration tests at the end: `runFullSyncWithLease` acquires with the right identity (ownerUid, holderUid, nowMs, 10-min TTL) and releases in finally; throws `AlreadyRunningError` when acquire reports held (and skips release — we never took the lease); release runs in finally even when `runFullSync` throws (LEG B inline blow-up); release failures are swallowed (logged, not fatal). Updates the existing structural-guard test to also assert `runFullSyncWithLease` is exported. |
| `functions/src/__tests__/whatsWorkingDashboard.test.ts` | Replaces the two cooldown-math tests (lines 174–190 in the pre-batch file) with two source-shape tests that pin the Batch-4 invariant: `SYNC_COOLDOWN_MS` const is gone; `canSyncNow: true` and `cooldownEndsAt: null` literals are present; the `lastSyncAt + SYNC_COOLDOWN_MS` formula is gone; the `SyncStatus` interface still has the fields (deprecated, but present so cached-JS clients compile). |
| `functions/package.json` | New `test:phase970:lease` script and entry in the aggregate `test` script. |

### Frontend (4 files)

| File | Change |
|---|---|
| `src/components/WhatsWorkingDashboard.tsx` | Removes `disabled={!status.canSyncNow}`, the greyed styling branch (`bg-slate-800 text-slate-500 cursor-not-allowed`), and the `whats_working.sync.cooldown` label swap. The button is now always enabled and always shows `whats_working.sync.cta`. The `SyncStatus` interface keeps `canSyncNow` and `cooldownEndsAt` (annotated `@deprecated` per the freeze rule). |
| `src/App.tsx` | Removes the `resource-exhausted` toast branch in the `triggerWorkspaceSync` catch (lines 12976–12978) — the server no longer emits that error, so the catch path that special-cased it is dead code. Replaced with a single generic failure toast. |
| `src/services/metaService.ts` | Removes the `resource-exhausted` swallow in `triggerWorkspaceSync`'s catch (lines 236–243). Throws the error instead so the caller's catch block handles it. The `triggerWorkspaceSync` doc comment notes that the cooldown gate is gone. |
| `src/i18n.tsx` | EN: deletes `whats_working.sync.cooldown`, deletes `whats_working.sync.next_run` (wait-state string, not rendered per §4 decision 4), adds 4 new keys under a new top-level `sync.result.*` group: `done` / `partial` / `more_coming` / `failed` (drafted per §8.6 — plain language, no "rate limit" / "API" / "queue" / "cooldown"). AR: same key set, plus the `topbar.menu_meta_sync` AR value is now `مزامنة الآن` (was `قم بالمزامنة`), matching the dashboard CTA and the existing `AR_S_RESYNC_CONNECTED_BTN` constant per §7. |

### Cooldown site enumeration (from investigation §4, verified post-batch)

| Site | Pre-batch | Post-batch |
|---|---|---|
| `functions/src/metaSync/trigger.ts:23` `const COOLDOWN_MS` | present | **removed** |
| `functions/src/metaSync/trigger.ts:59-71` cooldown gate | present | **removed** (replaced by lease wrapper) |
| `functions/src/metaSync/trigger.ts:99-110` `readLastSyncAt` | present | **removed** (file no longer needs to read `lastMetaSyncAt` for a gate) |
| `functions/src/metaSync/trigger.ts:4` cooldown file-header comment | present | **rewritten** to describe the lease wrapper |
| `functions/src/whatsWorkingDashboard.ts:91` `const SYNC_COOLDOWN_MS` | present | **removed** |
| `functions/src/whatsWorkingDashboard.ts:104-105` `canSyncNow` / `cooldownEndsAt` fields | derived from `lastSyncAt` | **frozen literals** `true` / `null` per §9 decision 2 |
| `functions/src/whatsWorkingDashboard.ts:355-359` `cooldownEndsAt` / `canSyncNow` computation | derived from `lastMetaSyncAt + SYNC_COOLDOWN_MS` | **frozen** |
| `functions/src/whatsWorkingDashboard.ts:368-369` emits them | derived | **frozen** |
| `src/components/WhatsWorkingDashboard.tsx:20-21` `canSyncNow` / `cooldownEndsAt` type fields | present | **kept (deprecated)** so cached-JS clients compile |
| `src/components/WhatsWorkingDashboard.tsx:173` `disabled={!status.canSyncNow}` | present | **removed** |
| `src/components/WhatsWorkingDashboard.tsx:175-179` greyed styling | present | **removed** |
| `src/components/WhatsWorkingDashboard.tsx:180-182` label swap to `whats_working.sync.cooldown` | present | **removed** |
| `src/App.tsx:12976-12978` `resource-exhausted` toast | present | **removed** |
| `src/services/metaService.ts:236-243` `resource-exhausted` swallow | present | **removed** |
| `src/services/metaService.ts:194-205` cooldown contract comment | present | **rewritten** to describe the lease |
| `i18n.tsx` `whats_working.sync.cooldown` (EN + AR) | present | **removed** |
| `i18n.tsx` `whats_working.sync.next_run` (EN + AR) | present | **removed** per §4 decision 4 |
| `i18n.tsx` `topbar.menu_meta_sync` AR (`قم بالمزامنة`) | present | **standardised** to `مزامنة الآن` per §7 |

`App.tsx:3279, 6825, 7744, 7917` handle `resource-exhausted` for **credit** exhaustion on generation callables — investigation §4 explicitly excluded these from Batch-4 scope ("those are credit exhaustion on generation callables, unrelated. Not touching them.") Confirmed untouched.

---

## 2. Test run — raw output verbatim

`npm run build`:

```
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
```

Exits 0. No diagnostics. New test emits to `lib/__tests__/metaSyncLease.test.js`.

`npm run test:phase970:lease`:

```
> test:phase970:lease
> npm run build && node lib/__tests__/metaSyncLease.test.js
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
ok 1 - acquireLease — fresh acquire succeeds and writes the lease doc
ok 2 - acquireLease — same caller re-acquiring extends the TTL (idempotent)
ok 3 - acquireLease — contended (held by another caller, not stale) returns ok:false with holder info
ok 4 - acquireLease — stale lease is overwritten by a fresh caller
ok 5 - acquireLease — boundary at exactly expiresAtMs is treated as stale (≤ not <)
ok 6 - releaseLease — succeeds when caller is the holder
ok 7 - releaseLease — refuses to release a lease held by another caller
ok 8 - releaseLease — no-op when there is no lease doc
ok 9 - releaseLease — no-op after takeover (stale run cannot release successor's lease)
ok 10 - AlreadyRunningError — carries holderUid and expiresAtMs
ok 11 - AlreadyRunningError — message describes a state, not a wait (per investigation §6 copy rule)
ok 12 - LEASE_TTL_MS — is exactly 10 minutes (per investigation §6 upper bound)
ok 13 - LEASE_DOC_COLLECTION — is a separate top-level collection, NOT under any user document
# tests 13
# pass 13
# fail 0
```

`npm run test:phase970:orchestrator` (now includes the 4 new lease-integration tests):

```
ok 1 - isMetaRateLimit — direct field shape (code 4 / subcode 1504022)
ok 2 - isMetaRateLimit — direct field shape (code 17 / subcode 2446079)
ok 3 - isMetaRateLimit — MetaGraphError body envelope shape
ok 4 - isMetaRateLimit — direct string message (substrings)
ok 5 - isMetaRateLimit — unrelated error returns false
ok 6 - runLegacySyncForOwner — happy path: writes to root /adPerformance and /adPerformanceHistory
ok 7 - runLegacySyncForOwner — workspace-private lastMetaSyncAt is stamped when workspaceId is provided
ok 8 - runLegacySyncForOwner — rate-limit error: collected into rateLimited, not just logged
ok 9 - runLegacySyncForOwner — non-rate-limit error: legacy `console.error` path (collects nothing)
ok 10 - runLegacySyncForOwner — no Meta connection: ok=false, no throw, empty rateLimited
ok 11 - runLegacySyncForOwner — no active accounts: returns ok=false with message
ok 12 - runFullSync — LEG A runs and LEG B inline for active workspace; rest fan-out
ok 13 - runFullSync — no activeWorkspaceId: inline is null, all live workspaces fan out
ok 14 - runFullSync — soft-deleted workspace is skipped from fan-out
ok 15 - runFullSync — workspace with metaConnected=false is skipped
ok 16 - runFullSync — duplicate account across two workspaces: fan-out produces one task, not two
ok 17 - runFullSync — LEG A rate-limit propagates into result.legacy.rateLimited; LEG B unaffected
ok 18 - runFullSync — LEG B inline throws a non-rate-limit error: result captures the failure shape
ok 19 - runFullSync — LEG B enqueue throws a rate-limit error: accountId lands in workspace.rateLimited
ok 20 - runFullSync — full-system smoke (LEG A + LEG B inline + LEG B fan-out)
ok 21 - runFullSync — structural guard: full export surface preserved (Batch 3 contract surface)
ok 22 - runFullSyncWithLease — acquires the lease, runs, releases in finally
ok 23 - runFullSyncWithLease — throws AlreadyRunningError when acquire reports the lease is held
ok 24 - runFullSyncWithLease — release runs in finally even when runFullSync throws
ok 25 - runFullSyncWithLease — release failures are swallowed (logged, not fatal)
# tests 25
# pass 25
# fail 0
```

`node lib/__tests__/whatsWorkingDashboard.test.js` (cooldown-math tests replaced with frozen-shape tests):

```
ok 1 - icon computation: below data gate → null
ok 2 - icon computation: top angle → 🔥
ok 3 - icon computation: above 75% of avg but below 100% → ✅
ok 4 - icon computation: at or below 75% of account avg → ⚠️
ok 5 - tooltip strings: never contain forbidden terms (CTR/CPA/CPL/CPM/percent)
ok 6 - tooltip strongest is plain Fusha Arabic (no digits, no Latin)
ok 7 - tooltip weak prefix: pure Fusha, no technical terms
ok 8 - best-2 selection: sorts by avgLinkCtr descending, filters by sample gate
ok 9 - unmatched filter: only matchType=null ads are returned
ok 10 - recent verdicts: sorted by evaluatedAt DESC
ok 11 - PHASE 970 Batch 4 — SyncStatus cooldown fields are FROZEN literals, not derived from lastMetaSyncAt
ok 12 - PHASE 970 Batch 4 — canSyncNow/cooldownEndsAt are not gated by lastMetaSyncAt
ok 13 - count strings: include {used} placeholder for the runtime value
ok 14 - spend label: 7-day phrasing, currency-aware formatting (USD prefix, others suffix)
# tests 14
# pass 14
# fail 0
```

Regressions on previously-passing tests (no changes in scope, but verifying the orchestrator + dashboard changes didn't break the pre-existing surfaces):

- `npm run test:phase970:concurrency` — **11/11 pass** (Batch 1)
- `npm run test:phase970:dispatch` — **14/14 pass** (Batch 2)
- `npm run test:phase14:metaSync` — **17/17 pass** (Phase 14)
- `node lib/__tests__/metaScope.integration.test.js` — **6/6 pass** (Phase 967)
- `node lib/__tests__/whatsWorkingDashboardScope.test.js` — **13/13 pass** (Phase 967)
- `npm run test:phase970:lease` — **13/13 pass** (Batch 4 new)
- `npm run test:phase970:orchestrator` — **25/25 pass** (Batch 3 + 4 new)
- `node lib/__tests__/whatsWorkingDashboard.test.js` — **14/14 pass** (Batch 4 cooldown-shape)

### Test-name vs assertion reconciliation (AGENTS.md rule 0b, half 1)

Every `ok` line above was walked against the assertion in its `test` body. Zero contradictions. Spot examples:

- *"— throws AlreadyRunningError when acquire reports the lease is held"* → uses `assert.rejects(...)` with a validator that checks `err instanceof AlreadyRunningError` AND `err.holderUid === "another_caller"`; after rejection, asserts `releaseCalls === 0` (we never took the lease, so we don't release one). Three assertions, name covers all of them.
- *"— release runs in finally even when runFullSync throws"* → seeds WS_A so the LEG B inline path runs; the `runPhase14InlineOverride` throws "LEG B inline blew up mid-run"; after rejection, asserts `releaseCalls.length === 1` with the right ownerUid/callerUid. The finally block is the only thing that can fire this assertion in the error path.
- *"PHASE 970 Batch 4 — SyncStatus cooldown fields are FROZEN literals, not derived from lastMetaSyncAt"* → reads the source file, asserts `SYNC_COOLDOWN_MS` const is gone (`! /const\s+SYNC_COOLDOWN_MS\s*=/.test(src)`), the frozen literals are present (`canSyncNow: true`, `cooldownEndsAt: null`), and the gate formula `lastSyncAt + SYNC_COOLDOWN_MS` is gone. Three negative-presence assertions on the same source string.
- *"AlreadyRunningError — message describes a state, not a wait (per investigation §6 copy rule)"* → asserts the error message does NOT contain "try again later" (the wait-state phrasing the investigation §6 explicitly banned) AND does contain "already running" (the state phrasing the same rule mandates). The test fails if a future copywriter regresses to wait-state language.

### Per-file delta and total arithmetic (AGENTS.md rule 0b, half 2)

| File | Net tests added |
|---|---|
| `functions/src/__tests__/metaSyncLease.test.ts` (new) | **+13** |
| `functions/src/__tests__/metaSyncOrchestrator.test.ts` (modified — 4 new lease-integration tests) | **+4** |
| `functions/src/__tests__/whatsWorkingDashboard.test.ts` (modified — replaced 2 cooldown-math tests with 2 source-shape tests) | **0 net** (2 → 2) |
| Backend (orchestrator, trigger, index, whatsWorkingDashboard, package.json) | 0 (no test of its own — covered via orchestrator + dashboard tests) |
| Frontend (i18n.tsx, App.tsx, WhatsWorkingDashboard.tsx, metaService.ts) | 0 (purely type/UX) |

Three legs, all pass:

- **(a)** Per-fixture index agreement — runner output above names the 17 Batch-4-added tests in the same order as the file declares them.
- **(b)** Per-file delta arithmetic — 13 + 4 + 0 = **17 new tests** in 2 modified files (one brand-new, one extended). No other test files modified.
- **(c)** Total arithmetic — runner totals (post-batch):
  - `metaSyncLease.test.js` (this batch, new): **13 / 13**.
  - `metaSyncOrchestrator.test.js` (Batch 3 + 4 new): **25 / 25**.
  - `whatsWorkingDashboard.test.js` (replaced tests): **14 / 14**.

Headline "+17 tests added" agrees with the file-by-file addition. There is no source file in this batch whose own test count changed in either direction.

---

## 3. The lease's interaction with the rate-limit ceiling (Batch 1 §2 working)

`runFullSyncWithLease` adds a single `runTransaction` to each press (acquire) plus a `runTransaction` on every exit path (release). The rate-limit numbers Batch 1 + 3 settled on are unaffected by Batch 4:

- **Per-process peak simultaneous Graph calls = 24** at `GRAPH_CONCURRENCY = 8` (insights pass, `8 × 3` parallel windows).
- **Aggregate under 5-task Cloud Tasks fan-out = 120** simultaneous (the figure to watch in Cloud Logging — see follow-ups §5 below).

The lease's two extra `runTransaction` calls are sub-millisecond each. The `metaSyncLeases/{ownerUid}` doc is a single-field doc at a top-level path (not a collection-group query), so the per-press overhead is two point reads plus a write at most — well under any Meta rate-limit threshold.

---

## 4. Known limits of this batch

1. **`metaDailySync` and `metaSyncAccountWorker` do NOT acquire the lease.** Investigation §6 specifies the lease for the **press** path (manual). The scheduled job and the task-dispatched worker don't take the lease — they don't share the press concern. The dedup-by-accountId at the discovery layer (Batch 2) handles redundant fan-out; the Cloud Tasks retry config handles the rare stuck-task case. If a future reviewer wants the worker to also acquire the lease, the test seam in `lease.ts` supports it without further code changes.
2. **The four new `sync.result.*` strings are defined but not yet rendered in the toast.** `App.tsx:12967` shows a generic "Synced N ads" toast on success. The richer `done` / `partial` / `more_coming` / `failed` strings are loaded and ready; Batch 5 will wire them to the result shape `runFullSyncWithLease` already returns (`result.legacy.rateLimited.length > 0` → `partial`, `result.workspace.queued > 0` → `more_coming`, etc.). The strings are not orphaned — they're in the i18n layer and keyed for the next batch.
3. **`SyncStatus.canSyncNow` / `cooldownEndsAt` are kept in the response shape but always emit `true` / `null`.** Cached-JS clients that still read them render the button as always enabled. Frontend tests that import the `SyncStatus` interface still compile. The fields are slated for deletion in Batch 5+ per §9 decision 2.
4. **`PerformanceDashboard.tsx`'s inline `handleSync`** is unaffected. It calls `metaService.syncPerformance()` which routes to `metaSyncPerformance` (the sidebar callable) — the new lease wrapper there protects it from concurrent-press races automatically. The investigation §4 explicit note "those are **credit** exhaustion on generation callables, unrelated" covers the `App.tsx:3279, 6825, 7744, 7917` `resource-exhausted` handlers — left untouched.

---

## 5. Follow-ups for Batch 5 (and post-deploy ops)

Per the user's instruction (recorded explicitly so the post-deploy operator finds it):

> "Record 120 explicitly in the Batch 5 report's follow-ups as the number to watch in Cloud Logging after the first real run. If code 4 / subcode 1504022 recurs after this phase deploys, GRAPH_CONCURRENCY is the one-line retune — and note that lowering it to 4 halves the aggregate to 60 while roughly doubling wall-clock, which is an acceptable trade if the limit keeps firing."

Concretely carried forward:

- **The figure to watch in Cloud Logging after the first real run is `120`.** That is the peak simultaneous Graph calls under 5-task Cloud Tasks fan-out at `GRAPH_CONCURRENCY = 8`. (See `batch-01-report.md` §2 HEADLINE; `batch-03-report.md` §4 banner.) If a real run logs `OAuthException code 4 / subcode 1504022` after this phase deploys, the cause is rate-limit pressure, not a regression.
- **One-line retune:** drop `GRAPH_CONCURRENCY` from 8 to 4 in `functions/src/metaSync/shared.ts:120`. Rebuild + redeploy. The structural-guard test `ok 10 - structural guard — shared.ts exports GRAPH_CONCURRENCY === 8` will fail and force a deliberate update of the test value (the guard is the anti-drift lock, not an anti-change lock).
- **Trade at N=4:** per-process peak falls to 12 simultaneous (3N, N=4); aggregate under 5-task fan-out falls to 60 (5 × 12). Wall-clock for a 383-ad account roughly doubles (from ~96s to ~190s at typical 500ms RTT). The platform's 540s `runSyncForAccount` ceiling still leaves 350s of headroom for image downloads and metaConnection writes. Acceptable trade if the limit keeps firing.
- **Diagnostic log emitted at the rate-limit classification site** (`functions/src/metaSync/orchestrator.ts:599` and `:660`): `console.error('Meta insights error for account …', insightsData.error)` — this is the existing `console.error` log, NOT a new line. The shape `{ code: 4, error_subcode: 1504022, type: 'OAuthException' }` is searchable in Cloud Logging via `resource.labels.function_name:"runFullSyncWithLease" AND textPayload:"OAuthException"`.
- **First-real-run checklist** (Batch 5+ is when this fires): when the dashboard gets pressed for the first time post-deploy, the `metaSyncLeases/{ownerUid}` collection creates one doc per active owner. The doc TTL is 10 minutes. If a press fails with `failed-precondition` (the `AlreadyRunningError` translated by the wrapper), the `runFullSync` did NOT execute — the dashboard's `Sync Now` button is the only side the user sees. After 10 minutes with no further press, the lease expires on its own and a new press takes over without user action.

---

## 6. Commit + push (planned)

Files in the planned commit:

```
functions/src/metaSync/lease.ts                                       (new)
functions/src/metaSync/orchestrator.ts                               (modified — runFullSyncWithLease + acquire/release seams)
functions/src/metaSync/trigger.ts                                    (modified — cooldown removed, lease-wrapped)
functions/src/index.ts                                               (modified — metaSyncPerformance lease-wrapped)
functions/src/whatsWorkingDashboard.ts                                (modified — SYNC_COOLDOWN_MS const removed, fields frozen)
functions/src/__tests__/metaSyncLease.test.ts                        (new)
functions/src/__tests__/metaSyncOrchestrator.test.ts                 (modified — +4 lease-integration tests, structural guard expanded)
functions/src/__tests__/whatsWorkingDashboard.test.ts                 (modified — 2 cooldown-math tests replaced with 2 source-shape tests)
functions/package.json                                               (modified — test:phase970:lease + aggregate entry)
src/components/WhatsWorkingDashboard.tsx                             (modified — button always enabled, label always cta)
src/App.tsx                                                           (modified — resource-exhausted toast branch removed)
src/services/metaService.ts                                          (modified — resource-exhausted swallow removed)
src/i18n.tsx                                                          (modified — sync.cooldown/next_run deleted, sync.result.* + topbar AR added)
specs/970-sync-unification/reports/batch-04-report.md                 (new — this file)
```

Branch: `970-sync-unification`.
Push: `git push origin 970-sync-unification`.
Deploy: **deferred**. The dashboard's `canSyncNow` / `cooldownEndsAt` fields still emit frozen literals; the actual removal in a follow-up phase is part of §9 decision 2. No D3 / D4 / D5 / orchestrator behaviour is re-shipped in this batch — all of those are stable from Batches 1–3.

---

## 7. Next batch (Batch 5 — tests + registration polish, post-deploy ops)

Batch 5 is the final batch. From the investigation §10 and the project rules:

- **Register all new tests** in `functions/package.json` (Batch 4 already did this; Batch 5 confirms).
- **Test name vs assertion reconciliation** (AGENTS.md rule 0b) — already done in this report's §2.
- **Operational dashboard / post-deploy monitoring** — Batch 5's `metaSyncRateLimit.test.ts` from the approved §8.7 test list: a dedicated contract that drives `isMetaRateLimit` against the two Meta codes end-to-end, plus a rate-limit-classification log assertion.
- **Document the 120 / 60 / retune trade** in the deployment runbook (Batch 5's deliverable). The §5 follow-up above is the source; the runbook formalises it for the on-call engineer.
- **`runFullSyncWithLease` Cloud Logging verification** — after the first real press, the `📊 Synced N ads …` and `🔄 Manual sync (owner=…, caller=…)` log lines should appear with the `rateLimitedLegacy=[…]` and `rateLimitedQueued=[…]` fields populated if any account hit a 4/1504022. Those fields are new in Batch 4 (added to the log line) — Batch 5's runbook calls them out as the post-deploy check.

After Batch 5, Phase 970 closes. Cooldown is fully removed, both press paths are rate-limit-safe, the orchestrator handles the legacy + Phase 14 + rate-limit + lease paths in one place, and the dashboard has the labels and result strings ready for Batch 5's wiring.
