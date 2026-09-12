# Batch 00b — merge from `main` (Phase 970) and citation re-verification

**Worktree**: `D:\proads-worktrees\969-cumulative-learning`
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Scope**: owner items 1 and 2. Read-only apart from the merge itself. Items 3
and 4 are Batch 1 instructions and were **not** acted on.

---

## Item 1 — merge result

```
git fetch origin
git merge origin/main
```

`origin/main` is at `ffc14a8` — *"Phase 970 — Sync Unification: one orchestrator,
one button, in-flight lease (#70)"*. Divergence before the merge: **4 ahead, 1 behind** (I first reported this
backwards — see "Item 1 (revisited)" below).

### Merge output, verbatim

```
Auto-merging functions/package.json
CONFLICT (content): Merge conflict in functions/package.json
Auto-merging functions/src/whatsWorkingDashboard.ts
Auto-merging src/components/WhatsWorkingDashboard.tsx
Auto-merging src/i18n.tsx
Automatic merge failed; fix conflicts and then commit the result.
```

### Status

```
M  firestore.indexes.json
UU functions/package.json
A  functions/src/__tests__/metaSyncConcurrency.test.ts
A  functions/src/__tests__/metaSyncDispatch.test.ts
A  functions/src/__tests__/metaSyncLease.test.ts
A  functions/src/__tests__/metaSyncOrchestrator.test.ts
A  functions/src/__tests__/metaSyncRateLimit.test.ts
M  functions/src/__tests__/whatsWorkingDashboard.test.ts
M  functions/src/index.ts
A  functions/src/metaSync/concurrency.ts
M  functions/src/metaSync/dispatcher.ts
A  functions/src/metaSync/lease.ts
A  functions/src/metaSync/orchestrator.ts
M  functions/src/metaSync/shared.ts
M  functions/src/metaSync/trigger.ts
M  functions/src/metaSync/worker.ts
M  functions/src/whatsWorkingDashboard.ts
A  specs/970-sync-unification/POST_DEPLOY_RUNBOOK.md
A  specs/970-sync-unification/reports/batch-01-investigation.md
A  specs/970-sync-unification/reports/batch-01-report.md
```

### The conflict — NOT resolved, per instruction

**One conflicted file: `functions/package.json`. One hunk, at lines 37-46.** It is
`scripts` only — no dependency, engine, or version conflict.

- **HEAD** contributes the `test` chain as it stood on this branch.
- **origin/main** contributes five new `test:phase970:*` scripts plus the same
  `test` chain with five entries appended.

I diffed the two `test` chains entry by entry rather than eyeballing them:

```
=== in origin/main but NOT in HEAD ===
node lib/__tests__/metaSyncConcurrency.test.js
node lib/__tests__/metaSyncDispatch.test.js
node lib/__tests__/metaSyncLease.test.js
node lib/__tests__/metaSyncOrchestrator.test.js
node lib/__tests__/metaSyncRateLimit.test.js
=== in HEAD but NOT in origin/main ===
(empty above = HEAD's test chain is a strict subset)
```

**HEAD's `test` chain is a strict subset of origin/main's.** Resolution is
therefore "take origin/main's hunk", losing nothing. **Left unresolved; the merge
is still in progress.**

> This branch DID modify `functions/package.json` (commit `7b24454`), so the
> conflict is legitimate rather than spurious. Both sides nonetheless converge,
> because main carries `7b24454`'s content via the PR #70 squash without carrying
> its commit. Full accounting in "Item 1 (revisited)" below.

The conflicted file is `package.json`, which no item-2 citation touches, and every
file item 2 does touch merged cleanly — so item 2 was verified against the merged
working tree without resolving anything.

### Phase 970 confirmed present

| Thing | Where | Value |
|---|---|---|
| `runFullSync` orchestrator | `functions/src/metaSync/orchestrator.ts:642` | present |
| `runFullSyncWithLease` | `orchestrator.ts:824` | present |
| Graph concurrency limiter | `functions/src/metaSync/shared.ts:132` | **`GRAPH_CONCURRENCY = 8`** |
| Concurrency helpers | `functions/src/metaSync/concurrency.ts:36,67,107` | `mapWithConcurrency`, `mapSettledWithConcurrency`, `peakConcurrency` |
| In-flight lease | `functions/src/metaSync/lease.ts:53` | `LEASE_TTL_MS = 10 * 60 * 1000` |
| Scheduled cadence | `dispatcher.ts:137` | `"0 3 * * *"` — daily, unchanged |

**Correcting my own Addendum §A1.** I wrote that the "8" factor "could not be
confirmed" and that the Phase 970 fix "is not present in this worktree". The second
half was right and is now fixed; the first half was an artefact of the stale
branch. Your figure was correct. The arithmetic is documented in-repo at
`shared.ts:114-120`: at N = 8 the per-process peak is `3N = 24` (the three insight
windows are parallel, so it is 3N and not 3N+N), and under
`maxConcurrentDispatches: 5` the **aggregate peak is 120**. The same header
(`shared.ts:100-104`) cites the pre-fix figure as *"For a 383-ad account that
produced ~1,149 Graph requests at once"* — 383 × 3, the same account this
investigation measured.

---

## Item 1 (revisited) — the conflict explained. Outcome B: diff is NON-EMPTY.

### Correction: I reported the divergence backwards

My earlier report said *"1 ahead, 4 behind"*. That is wrong, and it is my
misreading of `git rev-list --left-right --count origin/main...HEAD`, which
printed `1	4`. The left number is `origin/main`-only and the right is `HEAD`-only,
so the branch is **4 ahead, 1 behind** — the reverse of what I wrote.

This matters because it invalidated the premise of the question. The branch is not
"1 commit ahead, documentation only". It is 4 ahead, and **one of those four is a
code commit that modified `functions/package.json`**:

```
c5e79bc  docs(969): Batch 0 addendum …                        docs only
9338579  docs(969): Batch 0 read-only investigation …         docs only
f652eaf  docs: commit approved 969 cumulative learning spec …  docs only
7b24454  fix(scope): extend Phase 967 conversion to           CODE — touches
         whatsWorkingDashboard + linkUnmatchedAd               functions/package.json | 4 +-
```

So the conflict is **legitimate, not spurious**. Line-ending normalisation is not
the cause.

### `git merge-base HEAD origin/main`

```
544e817f39969804e4bc806db17af5ec39a38ba4
```

### `git diff 544e817 HEAD -- functions/package.json` — NON-EMPTY

```diff
@@ -12,6 +12,8 @@
     "test:copyScoringGate": "npm run build && node lib/__tests__/copyScoringGate.test.js",
+    "test:whatsWorkingScope": "npm run build && node lib/__tests__/whatsWorkingDashboard.test.js && node lib/__tests__/whatsWorkingDashboardScope.test.js",
+    "test:linkUnmatchedScope": "npm run build && node lib/__tests__/linkUnmatchedAdScope.test.js",
     "test:teamWorkspaceAccess": "npm run build && node lib/__tests__/teamWorkspaceAccess.test.js",
@@ -32,7 +34,7 @@
-    "test": "… && node lib/__tests__/phase20Wiring.test.js && node lib/contractFixtures.test.js",
+    "test": "… && node lib/__tests__/phase20Wiring.test.js && node lib/__tests__/whatsWorkingDashboard.test.js && node lib/__tests__/whatsWorkingDashboardScope.test.js && node lib/__tests__/linkUnmatchedAdScope.test.js && node lib/contractFixtures.test.js",
```

(The `test` line is elided at `…` only where the two sides are character-identical;
the full lines are in the working tree at `functions/package.json:37-46`.)

**What this branch changed**: it added two script names —
`test:whatsWorkingScope`, `test:linkUnmatchedScope` — and appended three test
files to the `test` chain: `whatsWorkingDashboard.test.js`,
`whatsWorkingDashboardScope.test.js`, `linkUnmatchedAdScope.test.js`. That is
exactly the test registration `7b24454`'s own commit message describes, and it is
precisely the FR-050 class of change you flagged as the worst thing to resolve
blind.

### Why git conflicted even though both sides converge

```
=== does origin/main contain 7b24454 as an ancestor? ===
NO — not an ancestor

=== PR merges on main since merge-base ===
ffc14a8 Phase 970 — Sync Unification: one orchestrator, one button, in-flight lease (#70)
```

`ffc14a8` is a **squash** of PR #70, which was branched from a point already
carrying `7b24454`'s content. So `origin/main` holds the *content* of `7b24454`
but not its *commit*. Both sides therefore modified the same hunk since
`544e817`, and git conflicted — correctly — even though the two results converge.

### Convergence verified, not assumed

Presence of each thing this branch added, on both sides:

```
                                           HEAD  origin/main
test:whatsWorkingScope                        1       1
test:linkUnmatchedScope                       1       1
whatsWorkingDashboard.test.js                 2       2
whatsWorkingDashboardScope.test.js            2       2
linkUnmatchedAdScope.test.js                  2       2
```

(Count 2 = once in its named `test:*` script, once in the `test` chain.)

Full script-**name** set comparison — all scripts, not only `test:*`, so `build`,
`lint`, `serve`, `shell`, `start`, `deploy`, `logs`, `build:watch` are included:

```
--- script names in HEAD but NOT origin/main ---
(end)
--- script names in origin/main but NOT HEAD ---
test:phase970:concurrency
test:phase970:dispatch
test:phase970:lease
test:phase970:orchestrator
test:phase970:rateLimit
(end)
```

**HEAD's script-name set is a strict subset of `origin/main`'s.** The only
difference is the five Phase 970 names. Combined with the earlier entry-by-entry
`test`-chain comparison (also empty complement on the HEAD side), taking
`origin/main`'s hunk wholesale loses **nothing** — including nothing from
`7b24454`'s test registration.

And `7b24454`'s code reached main too, so this is not a package.json-only
convergence:

```
functions/src/linkUnmatchedAd.ts                           diff-lines=0
functions/src/__tests__/linkUnmatchedAdScope.test.ts       diff-lines=0
functions/src/__tests__/whatsWorkingDashboardScope.test.ts diff-lines=0
functions/src/whatsWorkingDashboard.ts                     diff-lines=65
src/components/WhatsWorkingDashboard.tsx                   diff-lines=313
src/i18n.tsx                                               diff-lines=87
```

The three zero-diff files are byte-identical between HEAD and `origin/main`. The
three non-zero ones are files Phase 970 changed *further* on top of `7b24454`'s
content — and all three auto-merged cleanly.

### Status

**Not resolved.** Your rule for outcome B is "show the diff and stop", and the
reason you gave — that resolving an unexplained `package.json` change on autopilot
is the worst case — applies to my confidence as much as to anything else. The
change is now explained and the resolution is verified safe, but clearing it is
your call.

The resolution I would apply on your word is unchanged: **take `origin/main`'s
hunk wholesale**, justified by the strict-subset result on both the script-name set
and the `test`-chain entry set.

---

## Item 2 — citation re-verification

**Result: every behavioural claim still holds. Nothing changed behaviourally.**
Line numbers moved, and one citation moved file. Details below.

`functions/src/metaGraph.ts`, `functions/src/learningAggregates.ts` and
`functions/src/linkUnmatchedAd.ts` were **not touched by the merge at all**
(`git diff --stat` empty for each), so every citation into those three files is
byte-identical.

`functions/src/metaSync/shared.ts` changed by **+62 / −4**, and the entire
substantive diff is the concurrency wrapper:

```
+import {
+    mapSettledWithConcurrency,
+    mapWithConcurrency,
+} from "./concurrency.js";
+export const GRAPH_CONCURRENCY = 8;
-        const insightsEntries = await Promise.allSettled(
-            ads.map(async (ad) => [ad.id, await fetchAdInsights(accessToken, ad.id)] as const),
+        const insightsEntries = await mapSettledWithConcurrency(
+            ads,
+            GRAPH_CONCURRENCY,
+            async (ad) => [ad.id, await fetchAdInsights(accessToken, ad.id)] as const,
-    await Promise.allSettled(ads.map(async (ad) => {
+    await mapWithConcurrency(ads, GRAPH_CONCURRENCY, async (ad) => {
-    }));
+    });
```

Everything else in that file is the same code at a +58-line offset.

### Corrected citation table

| # | Claim | Cited (pre-970) | Correct now | Behaviour |
|---|---|---|---|---|
| 1 | `metaAdId` assigned from `ad.ad_id` | `index.ts:3931` | **`metaSync/orchestrator.ts:455`** — *moved file* | **unchanged** |
| 2 | Overwrite semantics | `learningAggregates.ts:165-172` | `:165-172` — unchanged | **unchanged** |
| 3 | *"Same generationId in 2 ad sets → separate records per context."* | `learningAggregates.ts:17` | `:17` — unchanged | **unchanged** |
| 4a | `status` requested | `metaGraph.ts:83` | `:83` — unchanged | **unchanged** |
| 4b | `status` typed | `metaGraph.ts:145` | `:145` — unchanged | **unchanged** |
| 4c | `status` never read, never persisted | `AdDoc` `shared.ts:125-166` | **`shared.ts:170-211`** | **unchanged** — no `status` member in `AdDoc`; `ad.status` matches nowhere in `shared.ts` |
| 5 | `time_increment: 1` on the 7-day daily call | `metaGraph.ts:389-396` | `:389-396` — unchanged | **unchanged** |
| 6 | Shared `INSIGHTS_FIELDS` across all three calls | `metaGraph.ts:362, :376, :393` | unchanged (plus `:538`, the async escape hatch) | **unchanged** |
| 7 | `countConversionActions` accepts an array of rows | *your note said* `metaGraph.ts:310-325`; it is in `shared.ts` | **`shared.ts:355-370`** | **unchanged** — signature still `(rows: ReadonlyArray<Record<string, unknown>>)` |
| 8 | Manual links locked indefinitely | `shared.ts:806-810` | **`shared.ts:864-869`** | **unchanged** — same `if (existingMatchType === "manual" \|\| existingMatchType === "auto_hash")` |
| 9 | Manual link targets a single document | `linkUnmatchedAd.ts:121-125` | `:121-125` — unchanged | **unchanged** |
| 10 | `if (!windows) continue` is the only skip path | `shared.ts:789-790` | **`shared.ts:847-848`** | **unchanged — and no new skip paths.** See below. |
| 11 | Matching per ad row, keyed by ad id | `shared.ts:703`, `:751` | **`shared.ts:761`, `:809`** | **unchanged** — `Promise.allSettled(ads.map(…))` → `mapWithConcurrency(ads, GRAPH_CONCURRENCY, …)`; still one closure per ad, still `adMatchResults.set(ad.id, result)` |

### Item 10, checked specifically as you asked

Your A2 conclusion — fetched equals stored — depends on `if (!windows) continue`
being the only skip. I enumerated **every** `continue` in `shared.ts`:

```
359:        if (!Array.isArray(actions)) continue;      <- inside countConversionActions
361:            if (!a || typeof a !== "object") continue; <- inside countConversionActions
363:            if (typeof actionType !== "string") continue; <- inside countConversionActions
430:            continue;                               <- inside matchAdCreative (bad fingerprint guard)
712:        if (!windows) continue;                     <- adSetTotals rollup loop
724:        if (!windows) continue;                     <- perAdSet spend/conversion rollup loop
848:        if (!windows) continue;                     <- THE AD-DOC-WRITE LOOP
1077:                if (!entry.generationId) continue;  <- learning metadata patch
1079:                if (!gen) continue;                 <- learning metadata patch
1135:                if (!patternKey) continue;          <- visual aggregate write
```

Only `:848` sits in the loop that writes ad documents (`for (const ad of ads)` at
`:846`). `:712` and `:724` are pre-loops computing rollups; `:359-363` and `:430`
are inside pure helpers; `:1077`, `:1079`, `:1135` are in the learning-aggregate
block, downstream of the ad write. **970 introduced no new skip path**, and the
one that exists is unchanged. **A2's conclusion stands.**

### Supporting citations from Addendum §A1 — RE-DERIVED MECHANICALLY

> **This table replaces an earlier version that was wrong.** The earlier version
> mixed anchors between its two columns: several "Cited" values were recalled or
> estimated from a `sed` window rather than searched, and two rows carried a
> post-merge number in *both* columns and called the line "unmoved". Four rows
> exceeded the file's own +58 net-growth ceiling and were therefore impossible.
> Every row below is now produced by searching for a fixed anchor string in
> **both** blobs — `git show 9338579:functions/src/metaSync/shared.ts` for
> pre-merge and the merged working tree for post-merge. **No line number below is
> computed from an offset.**

Diff stat, verbatim, against the merge base:

```
 functions/src/metaSync/shared.ts | 66 +++++++++++++++++++++++++++++++++++++---
 1 file changed, 62 insertions(+), 4 deletions(-)
```

`shared.ts` is byte-identical at the merge base (`544e817`) and at pre-merge HEAD
(`9338579`) — `git diff 544e817 9338579 -- functions/src/metaSync/shared.ts` is
empty — so the two stats coincide. Line counts: **1268 → 1326**, net **+58**.

**Why the deltas are +45, +51 and +58 and nothing else.** The four insertion
hunks are:

```
@@ -67,6  +67,10  @@   +4   concurrency import
@@ -86,6  +90,47  @@   +41  GRAPH_CONCURRENCY doc-comment + constant
@@ -555,8 +600,14 @@   +6   mapSettledWithConcurrency call site
@@ -700,7 +751,14 @@   +7   mapWithConcurrency call site
@@ -749,7 +807,7  @@   ±0   `}));` → `});`
```

`4 + 41 + 6 + 7 = 58`. So a line's delta is **+45** below line ~90, **+51**
between ~560 and ~700, and **+58** after ~707. Every row below lands on exactly
one of those three values. Nothing exceeds the ceiling.

| Claim (anchor searched) | Pre-merge | Post-merge | Delta |
|---|---|---|---|
| `Meta returns one row per ad` comment | 249 | **294** | +45 |
| `export function sumSpend3d(` | 175 | **220** | +45 |
| `export function aggregateAdMetrics(` | 221 | **266** | +45 |
| `const conversions3d = countConversionActions(threeDayRows);` | 247 | **292** | +45 |
| `preset — excludes today's partial day)` | 139 | **184** | +45 |
| `this is already "last 7 days, complete days only")` | 238 | **283** | +45 |
| `const spend7d = sumField(` | 239 | **284** | +45 |
| `const peak1dCtr = windows.last7DaysDaily.length > 0` | 262 | **307** | +45 |
| `export async function loadWorkspaceFingerprints(` | 334 | **379** | +45 |
| `export async function matchAdCreative(` | 362 | **407** | +45 |
| insights fetch closure (`await fetchAdInsights(...)`) | 559 | **610** | **+51** |
| `imageHash: match?.imageHash ?? null,` | 957 | **1015** | +58 |
| ad-doc write ref (`.collection("adPerformance").doc(ad.id)`) | **967** | **1025** | +58 |
| unbounded scan (`await adAccountRef.collection("adPerformance").get()`) | **773** | **831** | +58 |
| `learnedAds.push({` | **983** | **1041** | +58 |
| `entry.hookAngle =` (generation-metadata patch) | **1028** | **1086** | +58 |
| snapshot `counts` — `syncSnapshots` doc | **1118** | **1176** | +58 |
| snapshot `counts` — `SyncResult` return value | **1170** | **1228** | +58 |
| `batch.set(w.ref, w.data, { merge: true });` | 1132 | **1190** | +58 |
| `function computeAgeDays(_ad: MetaAd,` | 1195 | **1253** | +58 |
| `function isEligibleForLearning` (`learningAggregates.ts`, file untouched) | 119 | 119 | 0 |

**Bold** = a value the earlier table got wrong.

#### The specific errors, named

| Row | Earlier table said | Actual | What went wrong |
|---|---|---|---|
| `learnedAds.push` | 975 → 1041 (+66) | **983 → 1041 (+58)** | "Cited" 975 was estimated from a `sed` window, never searched |
| Generation-metadata patch | 1016 → 1086 (+70) | **1028 → 1086 (+58)** | same |
| Snapshot `counts` | 1100-1120 → 1176, 1228 (+76 / +108) | **1118 → 1176 and 1170 → 1228** | one estimated pre-citation conflated with two distinct post-locations |
| Ad-doc write ref | "`:1025` — coincidentally unmoved" | **967 → 1025 (+58)** | post-merge number recorded in **both** columns |
| Unbounded scan | "`:831` — unchanged" | **773 → 831 (+58)** | post-merge number recorded in **both** columns |
| `sumSpend3d` | 178-181 → 220 (+42) | **175 → 220 (+45)** | pre-citation pointed at the body, post at the signature — mixed anchors |
| `aggregateAdMetrics` | 235-247 → 266 (+31) | **221 → 266 (+45)** | same mixed-anchor error |

You were right that "all content-identical; offsets only" and those numbers could
not both be true. The heading was true; the numbers were not.

#### `:1228` explained — NOT a behavioural change

There are **two** `matched: matchedCount` sites, in **both** blobs:

```
--- pre-merge ---            --- post-merge ---
1118:  matched: matchedCount,   1176:  matched: matchedCount,
1170:  matched: matchedCount,   1228:  matched: matchedCount,
```

Two before, two after; each moved +58. They are different objects, not one write
executed twice:

- **`:1176`** is inside the `syncSnapshots` document's `counts` block (a Firestore
  write).
- **`:1228`** is inside the `SyncResult` **return value**'s `counts` block (an
  in-memory return, no write).

Your hypothesis — once per leg — was reasonable given my bad table, but it is not
what the code does. The snapshot write still happens exactly once per
`runSyncForAccount` call. **No behavioural change; the error was mine in the
table, not the code's.**

#### The +51 row, explained rather than waved through

The insights-fetch anchor moves **+51**, not +45 or +58, because the
`mapSettledWithConcurrency` hunk (`@@ -555,8 +600,14 @@`, +6) is inserted *at that
very construct*. It sits after the +45 cumulative and before the +7 that produces
+58. This is the one place where a citation lands inside a changed hunk rather
than merely below one — and it is the call site whose wrapper changed, which is
exactly where that is expected.

#### Did any MAIN-table behavioural claim rest on a computed line number?

**No.** Re-derived with the same mechanical method, every main-table row is
confirmed:

| Claim (anchor) | Pre | Post | Delta |
|---|---|---|---|
| `interface AdDoc {` | 125 | 170 | +45 |
| `function countConversionActions(rows:` | 310 | 355 | +45 |
| `if (existingMatchType === "manual" \|\| existingMatchType === "auto_hash") {` | 806 | 864 | +58 |
| `for (const ad of ads) {` / `const windows` / `if (!windows) continue;` (write loop) | 788 / 789 / **790** | 846 / 847 / **848** | +58 |
| `Promise.allSettled(ads.map` → `mapWithConcurrency(ads, GRAPH_CONCURRENCY` | 703 | 761 | +58 |
| `adMatchResults.set(ad.id, result);` | 751 | 809 | +58 |

One correction inside the main table, which does not affect any claim: I gave the
skip path as "789-790 → 847-848". The `continue` itself is at **pre 790 / post
848**; 789 / 847 is the `const windows = …` line above it. The range was right;
the single line is 790 → 848.


### One structural change worth recording, not a contradiction

The legacy user-level sync body was **relocated, not removed**. It is now "LEG A"
inside `orchestrator.ts` — the header at `:5` and `:252` names it *"the legacy
`metaSyncPerformance` body, account-global, INLINE … (was at
`index.ts:3756–3983`)"*. Within it, unchanged:

- root `adPerformance` write — `orchestrator.ts:404` (was `index.ts:3881`)
- `adPerformanceHistory` write — `orchestrator.ts:408` (was `index.ts:3886`)
- `metaAdId: ad.ad_id` — `orchestrator.ts:455` (was `index.ts:3931`)
- rolling 30-day window — `orchestrator.ts:327-328` (was `index.ts:3815-3816`)
- `perfDoc` shape, still carrying no `imageHash` / `generationId` / `matchType` — `orchestrator.ts:389-400`

`metaSyncPerformance` still exists at `index.ts:3766` but is now a thin wrapper.
The one genuine behavioural change is that **both legs now run on every sync**
(`orchestrator.ts:635-641`: *"Both LEGs run on every press"*), where previously
they were separate entry points.

This does **not** overturn the Batch 0 "two ad-performance stores" finding — there
are still two stores, and the learning store is still the workspace-scoped one. It
changes only *who writes them*: one orchestrator instead of two entry points. The
Batch 1 spec text should cite `orchestrator.ts:455` for `metaAdId`, not
`index.ts:3931`.

### Conclusions unaffected

- **`metaAdId` cannot be the grouping key** — still assigned from `ad.ad_id`
  (`orchestrator.ts:455`), still absent from `AdDoc`.
- **Condition (a) route intact** — `last7DaysDaily` still `time_increment: 1`,
  still shares `INSIGHTS_FIELDS`, still consumed only by `spend7d` / `peak1dCtr` /
  `computeAgeDays`. `metaGraph.ts` untouched.
- **Condition (b) route intact** — `status` still requested, still typed, still
  never persisted.
- **Q3 unchanged** — matching still per ad row, manual link still single-document,
  precedence lock still indefinite.
- **A2 unchanged** — no new skip paths.
- **The `learningAggregates.ts` contradiction is still live** — module header
  `:17` is untouched, and Phase 970 did not modify the learning path at all.

---

## What I need from you

1. **How to resolve `functions/package.json`.** My reading: take origin/main's
   hunk wholesale — HEAD's `test` chain is a verified strict subset, so nothing on
   this branch is lost. Say the word and I will resolve it that way and complete
   the merge commit. **I have not touched it.**
2. **Approve this report**, after which Batch 1 begins with items 3 and 4 folded
   in, using the corrected citations in the table above.

**Stopping here. The merge is unresolved and in progress; no Batch 1 work has
started.**
