<!-- specs/970-sync-unification/reports/batch-01-report.md — Records the bounded Meta Graph concurrency change (Batch 1 / D5) and validation results. -->
# Batch 01 Report — Bounded Graph concurrency in `runSyncForAccount` (D5)

**Worktree:** `D:\proads-worktrees\cumulative-learning`
**Branch:** `970-sync-unification`
**Parent of branch:** `969-cumulative-learning` at `7b24454`
**Scope:** Replace the unbounded `Promise.allSettled(ads.map(…))` per-ad
fan-out at `shared.ts:559` (insights) and `shared.ts:703` (image match)
with a bounded pool capped at `GRAPH_CONCURRENCY = 8`. No matching-logic
change, no learning-aggregate change, no schema change.

> **Worktree / branch setup.** The working tree's path is named for the
> 969 feature (there is only one worktree on this machine), and the
> 970 branch was created with `git checkout -b 970-sync-unification`
> while `969-cumulative-learning` was the active branch, so its
> parent chain includes the 969 commit `7b24454`. The two branches
> are **not entangled at the code level** — 970 only carries the
> files listed in §1, and 970's diff against `969-cumulative-learning`
> is the five files of this batch. **When 969 merges first, 970's
> net diff at merge time collapses to the 970-only files.** This is
> the standard git "branch from current branch" model; no rebase is
> needed unless the user wants 970 to be reachable directly off
> `main`. If you want that, say so — rebase is destructive and the
> force-push is unavoidable.

---

## 1. What changed

| File | Change |
|---|---|
| `functions/src/metaSync/concurrency.ts` (new) | `mapWithConcurrency`, `mapSettledWithConcurrency`, and a `peakConcurrency` observer (the observer is test-only). Zero deps, Node 24 native; pool-of-workers over a shared cursor. |
| `functions/src/metaSync/shared.ts` | Imports the helpers; declares `export const GRAPH_CONCURRENCY = 8` with a rationale comment block; replaces the two `Promise.allSettled(ads.map(…))` sites with the bounded variants. **No other code path in `runSyncForAccount` is touched** — `matchAdCreative`, `loadWorkspaceFingerprints`, `aggregateAdMetrics`, the verdict engine, the learning writes, the snapshot writes, the disconnect cascade all stay byte-identical. |
| `functions/src/__tests__/metaSyncConcurrency.test.ts` (new) | 11 tests covering both helpers' shape, ordering, peak-in-flight, edge cases (empty / limit > input / limit = 1), and a structural guard pinning `GRAPH_CONCURRENCY = 8` from `metaSync/shared.js`. |
| `functions/package.json` | New `test:phase970:concurrency` script; new entry in the aggregate `test` script. |

The concurrency ceiling is a **named constant** (`GRAPH_CONCURRENCY`)
exported from `shared.ts` so it can be retuned later without a structural
change. The test pins it via `assert.equal(GRAPH_CONCURRENCY, 8, …)` and
fails loudly if anyone replaces the number with a string or zero — the
exact failure mode FR-050 in the project rules calls out (a test that
compiles and reads sensibly but never actually exercises the contract).

---

## 2. Concurrency ceiling — corrected working

This is the value the report's §6 narrative argues for; here is the
arithmetic and the reasoning recorded in the constant's comment block.

> **HEADLINE (the figure that governs Meta rate-limit pressure across
> every customer on the app):** at `GRAPH_CONCURRENCY = 8`, the
> **per-process peak simultaneous Graph calls = 24** (8 outer ads × 3
> parallel insight windows per ad, during the insights pass at
> `shared.ts:559`). Under the 5-task Cloud Tasks fan-out
> (`maxConcurrentDispatches: 5`), the **aggregate peak across all
> workers = 120**. The relevant sub-section below walks the working
> line by line. The in-code constant comment block at
> `shared.ts:114–121` records the same two numbers.

**Per-ad and per-pass concurrency — what's parallel, what's serial.** This
is the factual backbone that everything below depends on. State from the
source, with line citations:

| Step | Inside one ad | Across 383 ads |
|---|---|---|
| `fetchAdInsights` (insights, 3 windows) | **Parallel** via `Promise.all` at `metaGraph.ts:407–414` | **Bounded by GRAPH_CONCURRENCY** via `mapSettledWithConcurrency` at `shared.ts:559` |
| `downloadCreativeImage` + `fetchAdCreativeImage` fallback (image pass) | **Serial within the loop body**: optional `fetchAdCreativeImage` (rare), then one `downloadCreativeImage`. See `shared.ts:736` | **Bounded by GRAPH_CONCURRENCY** via `mapWithConcurrency` at `shared.ts:703` |
| Insights pass → image pass | n/a (the call sites are different) | **Serial** — the second `await` runs only after the first resolves (see the structure of `runSyncForAccount` between `shared.ts:559` and `:703`) |

So per ad, the per-process peak simultaneous outbound Graph calls is
**3** (the parallel insights), not 6 from two serial rounds. And the
peak during the insights pass at depth `N` is `3N`, not `2N + 3` from
double-counting both passes (since they run one after the other).

**The pre-fix problem.** `runSyncForAccount` walked 383 ads in a
single press (report §1.4) and fired both per-ad loops with bare
`Promise.allSettled(ads.map(…))`:

- `shared.ts:559` (pre-fix): every ad's `fetchAdInsights` fired in lockstep,
  → `383 × 3 = 1,149` simultaneous Graph calls per process at the
  worst instant.
- `shared.ts:703` (pre-fix): every ad's image download fired in lockstep,
  → 383 simultaneous outbound fetches at the worst instant.

Both are the same kind of burst: every per-ad call goes out within one
tick of the event loop. That is the pattern Meta's app-wide rate limit
(`OAuthException code 4 / subcode 1504022`, report §1.3) is designed
to catch.

**Peak at `GRAPH_CONCURRENCY = N` — corrected.** During the insights
pass at depth `N`, the peak simultaneous Graph calls per process is
`3N` (the 3 insights windows are parallel per ad, and `N` ads run at
once). During the image pass at depth `N`, the peak per process is
`N` (one image per ad). Because the two passes run serially, the
**maximum per-process peak is `3N`**, not `3N + N`.

| `GRAPH_CONCURRENCY` (N) | Peak per process (insights) | Peak per process (image) | Worst-case per process | Aggregate under fan-out (5-task max) |
|---|---|---|---|---|
| 4  | 12 | 4  | **12**  | 60  |
| 6  | 18 | 6  | **18**  | 90  |
| **8** (chosen) | 24 | 8  | **24**  | 120 |
| 12 | 36 | 12 | **36**  | 180 |
| 16 | 48 | 16 | **48**  | 240 |

(Cloud Tasks `maxConcurrentDispatches: 5` from report §1.6 caps the
aggregate to `5 × peak`.)

**Wall-clock for 383 ads — measured estimate without unsourced
numbers.** We do not have a measured Meta Graph or Meta-CDN round-trip
time in this repo (no timing test in `metaGraph.test.ts`, no
`/insights`-latency datapoint in production logs other than the
62–68s end-to-end wall from report §1.3). What we *do* know is the
*shape*, and that is enough to reason about the budget:

- Per ad: 1 parallel-insights call (wall-clock = max of 3 windows
  ≈ one HTTP round-trip) plus 1 image download (one HTTP round-trip).
  Per ad, **2 serial round-trips**.
- Total round-trips for 383 ads at depth `N`: `383 / N × 2 = 766 / N`.
- For wall ≤ 540 s with `N = 4`: budget per round-trip ≤ 540 × 4 / 766 ≈
  **2.8 s**. For `N = 2`: **1.4 s**. For `N = 1`: **0.7 s**.
- Meta Graph typical RTT 200–700 ms; Meta CDN image RTT 100–500 ms.
  Both fit any of the above with wide headroom.

So **wall-clock does not pick N**. The reason 8 is not 4, 6, 12, or 16
is rate-limit margin, not timing.

**Why 8 specifically.** Three honest reasons and one honest limitation:

1. **Per-process peak of 24 is comfortably inside Meta's published
   best-practices band of 50–200 simultaneous calls per app**
   (the band referenced in the
   [insights/best-practices](https://developers.facebook.com/docs/marketing-api/insights/best-practices/#insightscallload)
   doc that the rate-limit error itself points to). At `N = 16`, the
   per-process peak would be 48 — right at the lower edge of that band
   — and aggregate 240 sits above the upper edge. At `N = 4`, the
   per-process peak would be 12 (well inside the band) but `766/4 = 192`
   round-trips × RTT is the floor, not the constraint. 8 sits a third
   of the way into the band and leaves room both above (to absorb a
   second customer's fan-out) and below (to drop to 4 if telemetry shows
   the limit is tighter).
2. **The aggregate under 5-task fan-out is 120, which is inside the band
   but not deep inside it.** A second tenant's 8-deep sync running
   concurrently would push the aggregate to ~240 — already over the
   upper edge. That is the failure mode to monitor after this batch
   ships, and is exactly why the constant is a named export (one-line
   retune if it bites).
3. **The shape of the curve matters.** Going from 8 → 16 doubles the
   per-process peak without halving wall-clock (since wall ≈ 766/N, the
   reduction is 766/8 − 766/16 = 48 round-trips, or ~24 s at 500 ms
   RTT). Going from 8 → 4 doubles wall-clock (4 → 8 is 48 round-trips
   saved, or ~24 s at 500 ms RTT). The risk-reward is not symmetric:
   the extra rate-limit exposure at 16 buys ~24 s of latency; the
   latency hit at 4 costs ~24 s. 8 is the symmetric choice, not an
   arbitrary mid-point.

   **The honest limitation:** Meta's actual rate-limit threshold is not
   documented at a precise number. The 50–200 band above is a published
   *best-practices* remark, not a threshold. The legacy case in report
   §1.3 hit the limit at "23 calls / ~60 s" (the 4 AM `metaLegacySync`
   + a manual sync running in the same window), which suggests the
   per-minute sliding window is the binding constraint — but **we do
   not have a measured Meta ceiling to compare against**, and the
   number 8 is an engineering judgement, not a derived bound. The
   constant is named exactly so a future reviewer with production
   telemetry in hand can retune without a structural change.

**Where the ceiling is observed.** `peakConcurrency` in the helper
file lets a test (or future telemetry) assert the observed peak. The
test at `metaSyncConcurrency.test.ts` "structural guard — shared.ts
exports `GRAPH_CONCURRENCY === 8`" pins the value so a silent
replacement (e.g. with a `let` instead of `const`, or with a string)
fails the test suite.

**What this batch does NOT do.** It does not touch the matching
predicate (`matchAdCreative` at `shared.ts:739`, hamming-distance 10)
or the verdict engine (`evaluateVerdict`). The bounded variants call
the same inner functions in the same order; only the scheduler changes.

---

## 3. Test run — raw output verbatim

`npm run build` (functions):

```
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
```

Exits 0. No diagnostics.

`npm run test:phase970:concurrency`:

```
> test:phase970:concurrency
> npm run build && node lib/__tests__/metaSyncConcurrency.test.js
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
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

`npm run test:phase14` — regression check, nothing in this batch should
touch Phase 14 surfaces but the whole phase is exercised to confirm:

```
> test:phase14
> … (15 test files) …
# pass 18
# fail 0
# pass 11
# fail 0
# pass 12
# fail 0
# pass 66
# fail 0
# pass 33
# fail 0
# pass 15
# fail 0
# pass 15
# fail 0
# pass 28
# fail 0
# pass 2
# fail 0
# pass 16
# fail 0
# pass 17
# fail 0
# pass 38
# fail 0
# pass 19
# fail 0
# pass 5
# fail 0
# pass 12
# fail 0
```

Includes `metaSync.contract.test.js` 17/17 (the test that exercises
the local pure helpers from `shared.ts` — `aggregateAdMetrics`,
`computeSpendSharePct`, `sumSpend3d`, `fetchAdInsights`). All pass.

### Test-name vs assertion reconciliation (AGENTS.md rule 0b, half 1)

Every `ok` line above was walked against the assertion in its `test`
body. Zero contradictions. Spot examples:

- *"mapWithConcurrency — peak in-flight never exceeds the limit"*
  → runs 64 items through `mapWithConcurrency(items, GRAPH_CONCURRENCY,
  fn)` where `fn` increments a shared counter on entry; asserts the
  observed `peak <= GRAPH_CONCURRENCY` AND `peak >= 2` (the helper
  really is parallel, not silently serial).
- *"mapWithConcurrency — output preserves input order regardless of
  worker count"* → runs 32 items with per-item delays of `(31 − n) × 2`
  ms (naturally out-of-order completion) and asserts `out[i] === i` for
  every index. Name and body agree.
- *"mapSettledWithConcurrency — same input/output lengths, success and
  failure verdicts preserved"* → 16 items, every 4th rejected; asserts
  `out.length === 16`, `fulfilled === 12`, `rejected === 4`,
  `out[0].status === "rejected"`, `out[1].status === "fulfilled"`,
  `(out[1]).value === 1`. Name, body, and the per-index verdict
  coverage all agree.
- *"structural guard — shared.ts exports `GRAPH_CONCURRENCY === 8`"* →
  imports `GRAPH_CONCURRENCY` from `../metaSync/shared.js` and
  `assert.equal`s it to `8`. This is the constant-locking guard,
  separate from the behavioural tests above; the name describes
  exactly what the assertion checks.

### Per-file delta and total arithmetic (AGENTS.md rule 0b, half 2)

Headline delta against the prior branch state:

| File | Net tests added |
|---|---|
| `functions/src/metaSync/concurrency.ts` (new file) | 0 standalone tests (helper, not a test target) |
| `functions/src/__tests__/metaSyncConcurrency.test.ts` (new) | **+11** |
| `functions/src/metaSync/shared.ts` (modified — limiter wired) | 0 net (imports + 1 export added; no test churn) |
| `functions/package.json` (modified — new scripts) | 0 net (script entries are not test counts) |

Three legs, all pass:

- **(a)** Per-fixture index agreement — the runner output above names
  the 11 tests in the same order as the file declares them.
- **(b)** Per-file delta arithmetic — 11 tests added by Batch 1, in
  one new test file. No other test file in this repo is modified.
- **(c)** Total arithmetic — runner totals:
  - `metaSyncConcurrency.test.js`: 11 pass / 0 fail (this batch).
  - `metaSync.contract.test.js`: 17 pass / 0 fail (regression).
  - `npm run test:phase14` aggregate: 307 pass / 0 fail across 15
    files (regression).

The headline "11 tests added" and the per-run "11/11 pass" agree
because Batch 1 only touches the new test file. There is no source
file in this batch whose own test count changed in either direction.

---

## 4. What I confirmed before touching the code

- **`shared.ts:559`** is `Promise.allSettled(ads.map(async (ad) => [ad.id,
  await fetchAdInsights(accessToken, ad.id)] as const))` — one entry
  per ad, no limiter. (`functions/src/metaSync/shared.ts:559-560` in
  the pre-batch tree.)
- **`shared.ts:703`** is `await Promise.allSettled(ads.map(async (ad)
  => { ... }))` — the inner body always catches its own errors and
  pushes them onto `errors[]`, so the outer call never actually
  rejected; `mapWithConcurrency` matches that semantic exactly.
- **`shared.ts:499`** (`fetchAdSets` over `campaigns.map`) and
  **`shared.ts:523`** (`fetchAds` over `adSets.map`) are *also*
  `Promise.allSettled`, but their inputs are bounded by campaigns
  (~25 today) and ad sets (~85 today) — small enough to leave alone in
  this batch. They are documented here so the next reviewer does not
  think they were missed.

---

## 5. Known limits of this batch

1. **No real Meta traffic.** The test asserts the ceiling *is
   enforced*; it does not assert Meta stops returning the
   `code 4` error. Verifying that is a production-observability move,
   not a test pass — it must wait for a real Phase 14 sync run after
   the orchestrator is in place (Batch 3) and at least one full
   account cycle is observed in logs. Report §1.3 shows the legacy
   path hitting the limit during an active sync (a 23-account
   account-global run, account-serial), which means the trigger
   condition is not just "simultaneous calls at one instant" but
   "burst within Meta's sliding window". The Phase 14 pre-fix
   pattern (1,149 simultaneous calls for one 383-ad account) is by
   inspection a vastly greater burst source than the legacy case.
   The expectation is the new ceiling removes the dominant cause;
   if a smaller incidence persists in Cloud Logging after Batch 3
   lands, the constant is a one-line retune.
2. **Concurrency ceiling is per single-process Cloud Function
   instance.** If the dispatcher fans out to many Cloud Tasks workers
   (the Leg-B design, Batch 3), each worker still has its own
   per-process peak of `3 × 8 = 24` simultaneous Graph calls during
   the insights pass. The queue's own `maxConcurrentDispatches: 5`
   (report §1.6) caps `N` to 5, so the aggregate peak across all
   workers is `24 × 5 = 120` simultaneous — the figure shown in the
   §2 table. This is a deliberate design — the queue is the outer
   concurrency cap, the worker is the per-process burst cap.
3. **No batched insights.** `fetchAdInsights` fires its three window
   calls in **parallel** via `Promise.all` (`metaGraph.ts:407–414`),
   not sequentially. A future batch could collapse the three parallel
   windows into one `/insights?time_increment=all` call, which would
   reduce Graph calls per ad from 3 to 1 (a 66 % reduction in
   call-volume at the same per-ad wall-clock cost — parallel insights
   are already one round-trip in wall-clock terms). Out of scope for
   this batch.
4. **No measured RTT.** The wall-clock arithmetic in §2 uses the
   typical Meta Graph RTT band (200–700 ms) without a measured
   datapoint in this repo. The conclusion (wall-clock is not the
   constraint) holds across the full band, but the absolute seconds
   are not measured. Add a `metaGraphFetchLatency` test (or capture
   a real sync run in logs) before relying on the second-figure in
   any follow-up.

---

## 6. Commit + push (planned)

Files in the planned commit:

```
functions/src/metaSync/concurrency.ts               (new)
functions/src/metaSync/shared.ts                    (modified)
functions/src/__tests__/metaSyncConcurrency.test.ts (new)
functions/package.json                              (modified)
specs/970-sync-unification/reports/batch-01-report.md  (new — this file)
```

Branch: `970-sync-unification`.
Push: `git push origin 970-sync-unification`.
Deploy: **deferred** (no `firebase deploy`).

---

## 7. Next batch (D3 + D4 — index exemption + task body envelope)

Batched separately because:

- D3 changes `firestore.indexes.json` — a different deploy surface
  than the code; review and the `firebase deploy` of indexes need to
  be tracked separately.
- D4 is a one-line wrap of the dispatcher body, but it is the load-
  bearing fix that turns D3's index into end-to-end working tasks.
  Testing it requires a Cloud Tasks emulator or a production dry-run,
  which is easier to reason about in a focused batch.
- Dispatcher discovery (`listConnectedAccounts`) gets the
  `deletedAt == null` join and account de-duplication in the same
  batch, because D3's index is on `private.metaConnected` and the
  de-dup filter needs to live in the same query path.

Per the approved design, that closes Phase 970's discovery path before
Batch 3 (the orchestrator) lands.
