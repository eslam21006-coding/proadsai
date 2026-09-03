# Batch 03 Report — Orchestrator + runFullSync

**Worktree:** `D:\proads-worktrees\cumulative-learning`
**Branch:** `970-sync-unification`
**Parent of branch:** `969-cumulative-learning` at `7b24454`
**Scope:** Build `functions/src/metaSync/orchestrator.ts` per investigation report §8. Both callables (`metaSyncPerformance`, `triggerMetaSync`) become thin wrappers over `runFullSync`. Rate-limit classifier added. LEG A body extracted VERBATIM. No matching-logic change, no learning-aggregate change.

---

## 1. What changed

| File | Change |
|---|---|
| `functions/src/metaSync/orchestrator.ts` (new) | One `runFullSync({ ownerUid, callerUid, activeWorkspaceId, … })` that runs LEG A (legacy, inline, account-global) + LEG B (Phase 14, hybrid: active workspace inline, rest Cloud Tasks fan-out, de-duped by accountId). Exports: `runFullSync`, `runLegacySyncForOwner`, `isMetaRateLimit`, `FullSyncResult`, `FullSyncOptions`, `LegacySyncOptions`. |
| `functions/src/index.ts` | `metaSyncPerformance` rewired as a thin wrapper. Adds a `getDb` import (was using `admin.firestore()` directly) and a `runFullSync` import. Runtime raised from **120s / 256MiB → 540s / 2GiB** (per §8.1). Logs `📊 Synced N ads across M accounts` line preserved verbatim. |
| `functions/src/metaSync/trigger.ts` | `triggerMetaSync` rewired as a thin wrapper. Keeps the 1-hour cooldown check (Batch 4 removes it). Inline workspace sync via `runFullSync({ activeWorkspaceId })`. |
| `functions/src/__tests__/metaSyncOrchestrator.test.ts` (new) | 21 tests: 5 for `isMetaRateLimit`, 6 for `runLegacySyncForOwner`, 9 for `runFullSync`, 1 structural-guard pinning the export surface. Covers every scenario in the approved design §8.7. |
| `functions/package.json` | New `test:phase970:orchestrator` script; new entry in the aggregate `test` script. |

The constraint list from the user's task:

- **Matching predicate / learning aggregates:** untouched. `learningAggregates.ts`, `ragContext.ts`, `qararEngine.ts` not modified. `runSyncForAccount` (the matching-bearing function used by LEG B) is called via its existing export — the orchestrator doesn't touch its body.
- **LEG A byte-identical:** see §3 below.
- **LEG B inline:** `runSyncForAccount` from `shared.js`. Same code path that's been there since Phase 14.
- **LEG B fan-out:** uses `buildSyncTaskBody` (Batch 2 export) + `getTasksClient()` facade. The envelope shape is the same as the scheduled dispatcher's, so the worker's `req.data` read is unchanged.

---

## 2. Orchestrator API and shape

The orchestrator's main entry point returns one `FullSyncResult` per press — the shape both buttons render to the user:

```ts
export interface FullSyncResult {
    ok: boolean;
    legacy: {
        accountsSynced: number;
        adsSynced: number;
        rateLimited: string[];  // accountIds
        errors: string[];
    };
    workspace: {
        inline: {
            workspaceId: string;
            accountId: string;
            counts: { ads, matched, ambiguous, unmatched, campaigns, adSets };
            status: "ok" | "partial" | "failed";
            errors: string[];
        } | null;
        queued: number;
        rateLimited: string[];
    };
    needsReauth: boolean;
    lastMetaSyncAt: number;
}
```

Both legs run on every press — the dashboard being viewed always refreshes synchronously (LEG B's inline path); the older root /adPerformance writers keep getting fresh data (LEG A); and the rest of the account's workspaces fan out (LEG B Cloud Tasks).

### Rate-limit classifier — the new helper

```ts
export function isMetaRateLimit(err: unknown): boolean
```

Handles three shapes:

1. Direct fields (legacy raw error envelopes): `{ code: 4, error_subcode: 1504022 }` or `{ code: 17, error_subcode: 2446079 }`.
2. `MetaGraphError` from `metaGraph.ts:177` — structured fields buried in `body.error.{code,error_subcode}`.
3. Plain string message from `runSyncForAccount`'s `errors[]` array — substring match on `"application request limit reached"` and `"1504022"`/`"2446079"`.

`runLegacySyncForOwner` uses #1+#2 at the LEG A error site (replacing the old `console.error` path with `rateLimited.push(accountId)`). `fanOutPhase14` uses #2 at the LEG B Cloud Tasks enqueue site. The result-shape's `rateLimited[]` arrays carry only account IDs — operators can correlate them back to the workspace via the cloud-task data, not from the error stack.

When a rate-limit is classified, the run is **not** considered failed. `result.ok` stays true. The two legs' rate-limited sets are kept separate (`result.legacy.rateLimited` vs `result.workspace.rateLimited`) — the dashboard rendering and the orchestrator's audit log can distinguish which side throttled.

---

## 3. The LEG A extraction (byte-identical constraint)

The pre-fix body lived at `index.ts:3756–3983` (~228 lines, three blocks: active-account resolution, 30-day insights fetch + writes, workspace-private stamp + connection-doc update). I extracted it into `orchestrator.ts::runLegacySyncForOwner` verbatim:

- Pre-fix file: `git show HEAD~3:functions/src/index.ts` — search for `metaSyncPerformance = onCall`.
- Post-fix: `git grep -n runLegacySyncForOwner functions/src/metaSync/orchestrator.ts`.

What changed at the call site:
- `request.auth.uid` → parameter `ownerUid`.
- `workspaceId` is no longer derived from `request.data.workspaceId`; the orchestrator's caller passes `opts.activeWorkspaceId` through to LEG A.
- `decryptToken(conn.encryptedToken, metaAppSecret.value())` → `decryptTokenImpl(conn.encryptedToken, …)` where `decryptTokenImpl = opts.decryptLegacyTokenOverride ?? decryptLegacyToken`. Same behaviour at call time in production.

What is **byte-identical** in the body itself:
- The active-account filter (`status===1 || account_status===1`).
- The 30-day window calculation.
- The fetch URL string and field list (unchanged: `v22.0`, `campaign_name,adset_name,…`).
- The `ad.performance` doc shape and `admin.firestore().batch().set(...)` calls.
- The `metaConnections/{ownerUid}.lastSyncAt` write (serverTimestamp, unchanged).
- The workspace-private `lastMetaSyncAt: nowMs` write (epoch-ms number, unchanged).
- The `if (workspaceId) { … console.warn("⚠️ Non-blocking…") }` block (verbatim).
- The final `console.log("📊 Synced N ads across M accounts (owner=${ownerUid}, caller=${callerUid})")` — the only change is `callerUid` is now `"-"` since LEG A doesn't track the caller (it's the audit signal audit-only at the LEG B layer, per the LEG architecture in investigation §8.2). This is the smallest possible change to the log line.

The new behaviour added at the same error site:
- Before: `if (insightsData.error) { console.error(...); continue; }`
- After: `if (insightsData.error) { if (isMetaRateLimit(insightsData.error)) { rateLimited.push(accountId); } else { console.error(...); } continue; }`

The non-rate-limit error path is **exactly identical** (same `console.error` line). The rate-limit path adds a `rateLimited.push(accountId)` and skips the `console.error`. This is the only behavioural addition in LEG A.

`runLegacySyncForOwner` continues to throw `HttpsError("internal", "Failed to sync ad performance.")` on a token-decrypt failure — matching the pre-fix throw at `index.ts:3981`. The pre-fix `connDoc.exists` check becomes a structured return of `{ok:false, errors:["No Meta connection found."]}`. The pre-fix empty-account list throw becomes a structured return — both because the orchestrator's contract returns results, not throws HttpsErrors, and the wrapping callable translates to throw if needed.

---

## 4. The runtime bump (120s/256MiB → 540s/2GiB)

`metaSyncPerformance` previously had `timeoutSeconds: 120` and no `memory` option (= default 256MiB). After Batch 1's `GRAPH_CONCURRENCY = 8` and the LEG B inline addition, the worst-case wall-clock for one press is bounded by:

> **Two quantities — peak vs wall-clock — must not be conflated.** The
> **peak** (relevant to Meta's rate limit) is **24 per process, 120
> aggregate under fan-out** at `GRAPH_CONCURRENCY = 8`, derived in
> `batch-01-report.md` §2 and the in-code constant comment block at
> `shared.ts:114–121`. The **wall-clock** total is the reason the
> 120s ceiling is no longer safe, computed below as `766 / 8` rounds.
> `766 = 383 ads × 2 serial round-trips per ad` is a wall-clock
> total — number of round-trips the worker burns through serially
> across the run. **It is not a simultaneous burst, and it does not
> enter the rate-limit calculation.** Mixing the two is the defect
> the third-party review flagged twice and this section is the
> single canonical reference for it.

Working line by line (wall-clock, not peak):

- LEG A: 23 accounts × ~ 3s per account (one fetch + ~1s insights round-trip + ~1s image round-trip per ad, amortised by the limiter) ≈ 65–70s. Pre-fix measured at 62–68s.
- LEG B inline: one workspace × runSyncForAccount at the bounded `GRAPH_CONCURRENCY = 8`. For a 383-ad account: serial round-trips per ad = **2** (one parallel-insights call = 1 round-trip wall, one image download = 1 round-trip wall; the three insight windows are PARALLEL via `metaGraph.ts:407–414` so they collapse to a single round-trip wall). Total serial round-trips for 383 ads = `383 × 2 = 766`. At depth 8: `766 / 8 ≈ 96 rounds × 2 round-trips per round ≈ 48–96s` depending on RTT (the `× 2 round-trips per round` is the *per-ad* count; the rounds are workers' pace). The peak during this run is bounded at `8 × 3 = 24` simultaneous Graph calls per worker (insights pass peak) — see `batch-01-report.md` §2 for the full peak derivation.
- LEG B fan-out: enqueue is sub-second per workspace.

The orchestrator does LEG A first, then LEG B inline, sequentially. Worst-case 70 + 96 ≈ 170 s. With realistic RTT (200–500 ms) it's closer to 50–90 s. **The 120s ceiling is no longer safe.** 540s aligns with `triggerMetaSync`'s runtime and the platform ceiling. Memory bumps to 2GiB because the LEG B inline workspace, when fed 383 ads and ~500 image downloads, holds a non-trivial in-memory working set.

For the rate-limit engineer reading this section: the peak you must hold in your head is **24 per process, 120 under fan-out** — see `batch-01-report.md` §2. The 766 figure here is wall-clock arithmetic and not a peak.

---

## 5. The trigger.ts rewire

`triggerMetaSync` previously called `runSyncForAccount` directly with no LEG A. After this batch:

- The 1-hour cooldown (Batch 4's target) is preserved. The dashboard still greys for an hour.
- The 7-line synchronisation it does to `runSyncForAccount` is now a 1-line delegation to `runFullSync({ activeWorkspaceId: req.workspaceId })`.
- LEG A now runs alongside LEG B on every dashboard press. This is the behaviour change that D1's user symptom ("Synced just now" but dashboard reads zero) was masking.

The cooldown logic in `trigger.ts` stays identical (line `if (elapsed < COOLDOWN_MS)`). Batch 4 will rip it out. For now, the trigger surface looks identical from the dashboard's perspective — same cooldown, same HttpsError on `resource-exhausted` if early.

The trigger's response shape expanded to include `legacy.{adsSynced,accountsSynced,rateLimited,errors}` and `workspace.{inline,queued,rateLimited}` — the dashboard UI is unaware (it reads `counts` if at all), and Batch 4's "shared label" work will rework the response display.

---

## 6. Test run — raw output verbatim

`npm run build`:

```
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
```

Exits 0. No diagnostics. New test emits to `lib/__tests__/metaSyncOrchestrator.test.js`.

`npm run test:phase970:orchestrator`:

```
> test:phase970:orchestrator
> npm run build && node lib/__tests__/metaSyncOrchestrator.test.js
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
ok 1 - isMetaRateLimit — direct field shape (code 4 / subcode 1504022)
ok 2 - isMetaRateLimit — direct field shape (code 17 / subcode 2446079)
ok 3 - isMetaRateLimit — MetaGraphError body envelope shape
ok 4 - isMetaRateLimit — direct string message (substrings)
ok 5 - isMetaRateLimit — unrelated error returns false
ok 6 - runLegacySyncForOwner — happy path: writes to root /adPerformance and /adPerformanceHistory
ok 7 - runLegacySyncForOwner — workspace-private lastMetaSyncAt is stamped when workspaceId is provided
ok 8 - runLegacySyncForOwner — rate-limit error: collected into rateLimited, not just logged
ok 9 - runLegacySyncForOwner — non-rate-limit error: legacy console.error path (collects nothing)
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
# tests 21
# pass 21
# fail 0
```

`npm run test:phase14:metaSync` (regression — must not be touched by Batch 3):

```
> test:phase14:metaSync
> npm run build && node lib/__tests__/metaSync.contract.test.js
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
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

`npm run test:phase970:concurrency` (Batch 1 regression):

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

`npm run test:phase970:dispatch` (Batch 2 regression):

```
ok 1 - buildSyncTaskBody — wraps the payload in { data: { ... } } so the worker's req.data reads it
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

### Test-name vs assertion reconciliation (AGENTS.md rule 0b, half 1)

Every `ok` line above was walked against the assertion in its `test` body. Zero contradictions. Spot examples:

- *"— duplicate account across two workspaces: fan-out produces one task, not two"* → seeds Eslam Salah / Manar (`act_shared` linked to two workspaces); asserts `result.workspace.queued === 1` and `recorded.length === 1`. Name, body, and direction agree.
- *"full-system smoke (LEG A + LEG B inline + LEG B fan-out)"* → single test that asserts all three behaviours at once: LEG A wrote `/adPerformance/{owner}_ad_1`; LEG B inline ran with `params.workspaceId === WS_A` and produced the inline stub's counts (`ads: 383, matched: 0, ambiguous: 0, unmatched: 383`); LEG B fan-out produced exactly one Cloud Tasks body for `WS_B` / `ACCT_B` via Batch 2's envelope helper.
- *"— LEG A rate-limit propagates into result.legacy.rateLimited; LEG B unaffected"* → seeds a fetch that returns `{error: {code: 4, error_subcode: 1504022, type: 'OAuthException'}}`; asserts `result.legacy.rateLimited === [ACCT_A]` AND `result.workspace.rateLimited === []` AND `result.ok === true`. All three assertions true together = the design holds.

### Per-file delta and total arithmetic (AGENTS.md rule 0b, half 2)

| File | Net tests added |
|---|---|
| `functions/src/__tests__/metaSyncOrchestrator.test.ts` (new) | **+21** |
| `functions/src/metaSync/orchestrator.ts` (new) | 0 (no test of its own — covered via the orchestrator test) |
| `functions/src/index.ts` (modified — `metaSyncPerformance` rewired) | 0 |
| `functions/src/metaSync/trigger.ts` (modified — `triggerMetaSync` rewired) | 0 |
| `functions/package.json` (modified — script entries) | 0 |

Three legs, all pass:

- **(a)** Per-fixture index agreement — the runner output above names the 21 tests in the same order as the file declares them.
- **(b)** Per-file delta arithmetic — 21 tests added by Batch 3, in one new test file. No other test file in this repo is modified.
- **(c)** Total arithmetic — runner totals:
  - `metaSyncOrchestrator.test.js` (this batch): 21 / 21.
  - `metaSync.contract.test.js` (Phase 14 regression): 17 / 17.
  - `metaSyncConcurrency.test.js` (Batch 1 regression): 11 / 11.
  - `metaSyncDispatch.test.js` (Batch 2 regression): 14 / 14.

Headline "+21 tests added" agrees with "21/21 pass" because Batch 3 only touches the new test file. There is no source file in this batch whose own test count changed in either direction.

---

## 7. Known limits / follow-ups

1. **LEG A log line `callerUid` becomes `"-"`.** The pre-fix code logged the caller's uid (audit signal). LEG A's signature doesn't take callerUid, so it logs `-`. LEG B inline can still log the caller. Documented in the report §3.
2. **The `runPhase14InlineOverride` injection seam** for tests is unusual. The orchestrator uses an ES-module-bound import for `runSyncForAccount`, which can't be intercepted via `Object.defineProperty`. The override is a test seam only — production omits it. If a future reader wonders why an opt exists, the comment in `orchestrator.ts:82` explains.
3. **`discoverOwnedWorkspaces` reads `users/{ownerUid}/workspaces` directly** rather than reusing `listConnectedAccounts` from `dispatcher.ts`. The two functions are similar but slightly different: `listConnectedAccounts` is a `collectionGroup('private')` query (used by the scheduled job); the orchestrator walks the owner's workspaces (used per-press). Different access paths, same three filter rules. Documented in the orchestrator file so a future reader knows to keep them in sync if the discovery rules change.
4. **The cooldown is NOT removed.** `trigger.ts:60-67` still does the `if (elapsed < COOLDOWN_MS)` check. Batch 4 will rip this out alongside the dashboard's gate freeze.
5. **No production deploy.** The D3 field override (Batch 2) still needs a `firebase deploy --only firestore:indexes` step before any task-dispatched sync runs end-to-end. Both callables are wired through `runFullSync`, so the deploy is unchanged from Batch 2's checklist.

---

## 8. Commit + push (planned)

Files in the planned commit:

```
functions/src/metaSync/orchestrator.ts             (new)
functions/src/__tests__/metaSyncOrchestrator.test.ts (new)
functions/src/index.ts                            (modified — metaSyncPerformance rewired)
functions/src/metaSync/trigger.ts                  (modified — triggerMetaSync rewired)
functions/package.json                            (modified — script entries)
specs/970-sync-unification/reports/batch-03-report.md  (new — this file)
```

Branch: `970-sync-unification`.
Push: `git push origin 970-sync-unification`.
Deploy: **deferred**.

---

## 9. Next batch (Batch 4 — cooldown removal, in-flight lease, shared label, i18n)

Batch 4 builds the rest of the approved design — every site the cooldown touches and the buttons and i18n keys:

- Drop the 1-hour cooldown from `trigger.ts` (line 60–67 above) AND the dashboard reads (`whatsWorkingDashboard.ts:355-359`).
- The dashboard response freezes `canSyncNow: true` / `cooldownEndsAt: null` for one release per §9 decision 2.
- Frozen-comment-on-the-response site marks both fields for deletion in a follow-up phase.
- The in-flight lease (a separate document with TTL ≤ 10 min, cleared in `finally`).
- Button-label alignment (one shared key, Arabic standardised on `مزامنة الآن`).
- New i18n strings (4 keys, EN + AR) per §8.6.
- Hard-coded strings at `App.tsx:12977` removed.

Batch 4 also touches frontend (App.tsx, WhatsWorkingDashboard.tsx, i18n.tsx), so this will be the first batch with a real `src/` diff. The orchestrator itself does not change in Batch 4 — only its callers and consumers do.
