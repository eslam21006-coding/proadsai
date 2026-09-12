# Batch 00c — merge resolved and verified; citation table re-derived; LEG A vs the lease

**Worktree**: `D:\proads-worktrees\969-cumulative-learning`
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Scope**: owner items 1, 2, 3. Item 4 of the prior message is Batch 1 instruction
and was **not** acted on.

The re-derived citation tables live in `batch-00b-report.md`, which has been
corrected in place (the defective supporting table is replaced, with the specific
errors named).

---

## Item 1 — merge resolved and verified

Resolved as approved: `git checkout --theirs -- functions/package.json`. No
unmerged paths remain.

### The resolved file

```
VALID JSON; scripts: 45 | deps: 9 | devDeps: 10
```

Byte-comparison against `origin/main`'s blob reports a difference, and it is
**line endings only**: 8091 vs 8013 bytes across a 78-line file — exactly one CR
per line — and `diff <(tr -d '\r' main) <(tr -d '\r' resolved)` is **empty**. This
is the repo's normal CRLF checkout on Windows, the thing git warned about earlier
in this session. Content is identical to `origin/main`.

### Required names present

```
test:phase970:concurrency        PRESENT
test:phase970:dispatch           PRESENT
test:phase970:lease              PRESENT
test:phase970:orchestrator       PRESENT
test:phase970:rateLimit          PRESENT
test:whatsWorkingScope           PRESENT
test:linkUnmatchedScope          PRESENT
```

Each of the three files registered by `7b24454` appears exactly twice — once in
its named script, once in the `test` chain:

```
whatsWorkingDashboard.test.js            count=2
whatsWorkingDashboardScope.test.js       count=2
linkUnmatchedAdScope.test.js             count=2
```

### Union check on the resolved file — nothing lost

Script **names**, resolved vs pre-merge HEAD (`9338579`), all scripts, not only
`test:*`:

```
--- in PRE-MERGE HEAD but MISSING from resolved (must be empty) ---
(end)
--- added by resolution ---
test:phase970:concurrency
test:phase970:dispatch
test:phase970:lease
test:phase970:orchestrator
test:phase970:rateLimit
(end)
```

Full resolved name list, including the non-test scripts:

```
build            build:watch      deploy           lint             logs
serve            shell            start            test
test:conceptDirector      test:conditional        test:copyScoringGate
test:cultural             test:expressionMap      test:failure
test:gazeMap              test:lang               test:linkUnmatchedScope
test:phase14              test:phase14:campaignObjective
test:phase14:canonicalAngle          test:phase14:cpaEconomics
test:phase14:fingerprintAccuracy     test:phase14:funnelEconomicsParity
test:phase14:funnelSettings          test:phase14:imageMatching
test:phase14:learningAggregates      test:phase14:learningIntegration
test:phase14:metaGraph               test:phase14:metaSync
test:phase14:perceptualHash          test:phase14:qararEngine
test:phase14:targetingContext        test:phase14:tokenCrypto
test:phase970:concurrency            test:phase970:dispatch
test:phase970:lease                  test:phase970:orchestrator
test:phase970:rateLimit
test:quota       test:savedProjects  test:teamWorkspaceAccess
test:universeCopyMap                 test:whatsWorkingScope
test:workspace
```

`build`, `build:watch`, `deploy`, `lint`, `logs`, `serve`, `shell`, `start` are
all present and unchanged. Nothing from either side was dropped.

### Dependencies installed from the lockfile, not resolved fresh

`functions/node_modules` was empty, so the chain could not run. Used `npm ci`,
which installs from the lock without rewriting it:

```
lock sha BEFORE: b591008a49a7177b1717732d43dd0afd5b212858 *package-lock.json
added 755 packages in 20s
=== npm ci exit: 0 ===
lock sha AFTER : b591008a49a7177b1717732d43dd0afd5b212858 *package-lock.json
```

Hash unchanged. `git status` shows `functions/package-lock.json` untouched.

### The resolved `test` chain — raw result, including the tail

```
=== npm test EXIT CODE: 0 ===
=== total output lines: 3889 ===
```

Because the chain is `&&`-joined across 56 entries, exit 0 is only reachable if
every entry ran and exited 0. Corroborated four ways:

```
=== TAP failure totals ===
     25 # fail 0
=== 'not ok' lines ===
0
=== any "passed, N failed" with N>0 ? ===
(empty = none)
=== last line of chain ===
contractFixtures.test: PASS
```

`contractFixtures.test` is the **final** entry in the chain, so the chain reached
its end rather than stopping partway — the failure mode being guarded against.

The five Phase 970 suites and the three registered by `7b24454` all executed:

```
whatsWorkingDashboardScope tests: 13 passed, 0 failed
linkUnmatchedAdScope tests: 11 passed, 0 failed
ok 10 - structural guard — shared.ts exports GRAPH_CONCURRENCY === 8
ok 11 - structural guard — metaSync/shared.ts is the only place this constant is defined
```

---

## Item 2 — citation table re-derived mechanically

**You were right; the supporting table was wrong.** Four rows exceeded the +58
ceiling and two claimed zero movement between neighbours that moved +58. Both are
impossible, and both were mine.

**Root cause, stated plainly**: I mixed anchors between the two columns. Several
"Cited" values were recalled or estimated from an earlier `sed` window rather than
searched, while the "Correct now" values came from real greps. Two rows carried the
*post-merge* number in **both** columns and I labelled them "unmoved".

Corrected method: search a fixed anchor string in **both** blobs —
`git show 9338579:functions/src/metaSync/shared.ts` and the merged working tree.
No number computed from an offset. Full re-derived tables, the named per-row
errors, and the raw probe output are in `batch-00b-report.md` under *"Supporting
citations from Addendum §A1 — RE-DERIVED MECHANICALLY"*.

Diff stat re-run verbatim:

```
 functions/src/metaSync/shared.ts | 66 +++++++++++++++++++++++++++++++++++++---
 1 file changed, 62 insertions(+), 4 deletions(-)
```

1268 → 1326 lines, net +58, confirmed. `shared.ts` is byte-identical at the merge
base and at pre-merge HEAD, so the ceiling argument applies cleanly.

**Why deltas are +45 / +51 / +58 and nothing else** — the four insertion hunks:

```
@@ -67,6  +67,10  @@   +4   concurrency import
@@ -86,6  +90,47  @@   +41  GRAPH_CONCURRENCY doc-comment + constant
@@ -555,8 +600,14 @@   +6   mapSettledWithConcurrency call site
@@ -700,7 +751,14 @@   +7   mapWithConcurrency call site
@@ -749,7 +807,7  @@   ±0   `}));` → `});`
```

`4 + 41 + 6 + 7 = 58`. Below ~line 90 → +45; between ~560 and ~700 → +51; after
~707 → +58. Every re-derived row lands on one of those three. The single +51 is
the insights-fetch call site, which sits *inside* a changed hunk — the one place a
citation is not merely below the insertions.

**`:1228` is not a behavioural change.** There are two `matched: matchedCount`
sites in **both** blobs (pre 1118 / 1170, post 1176 / 1228, each +58). `:1176` is
the `syncSnapshots` document's `counts` block, a Firestore write; `:1228` is the
`SyncResult` return value's `counts` block, an in-memory return. Two distinct
objects, not one write per leg. Your hypothesis was reasonable given the bad
table; the code does not do it. The snapshot write still fires once per
`runSyncForAccount` call.

**Did any main-table behavioural claim rest on a computed line number? No.** Every
main-table row re-derived and confirmed. One correction that changes no claim: the
skip path's `continue` is at **pre 790 / post 848**; 789 / 847 is the
`const windows = …` line above it. The range was right, the single line is 790 →
848.

---

## Item 3 — LEG A and the lease

### Short answer

**LEG A executes INSIDE the lease window, and it is sequenced before LEG B, not
concurrent with it.** It writes five paths; the Phase 14 learning path shares
exactly **one** field with it — `lastMetaSyncAt` on
`users/{uid}/workspaces/{wid}/private/metaConnection` — and **nothing reads that
field as a gate, cooldown, cursor or watermark**. It is display-only.

**But there is a separate finding that does bear on the spec's lease requirement,
and it is not about LEG A**: the Cloud Tasks fan-out worker reaches the learning
write with **no lease at all**. Details in the last subsection.

### Is LEG A inside or outside the lease?

**Inside.** `runFullSyncWithLease` (`orchestrator.ts:824`) acquires, then wraps the
*entire* `runFullSync` call:

- `orchestrator.ts:841` — `const acquire = await acquireImpl(ownerUid, callerUid, nowMs, 10 * 60 * 1000);`
- `orchestrator.ts:871-873` — `try { return await runFullSync(opts); } finally { … releaseImpl(…) }`

And `runFullSync` calls LEG A first:

- `orchestrator.ts:652` — `const legacy = await runLegacySyncForOwner(opts.ownerUid, opts.activeWorkspaceId ?? null, {…});`

`runFullSync` has **no caller other than the lease wrapper**:

```
functions/src/index.ts:3811:        const result = await runFullSyncWithLease({     <- metaSyncPerformance
functions/src/metaSync/trigger.ts:58:            const result = await runFullSyncWithLease({  <- triggerMetaSync
functions/src/metaSync/orchestrator.ts:872:        return await runFullSync(opts);          <- the only call
```

Lease document: `metaSyncLeases/{ownerUid}` (`lease.ts:52`, `:77`, `:115`,
`:172`), TTL `LEASE_TTL_MS = 10 * 60 * 1000` (`lease.ts:53`). Note it is
per-**owner**, whereas the spec's learning lease is per-**account** — per-owner is
coarser, so it subsumes per-account for a single owner, but they are different
documents with different TTLs, which `spec.md:290` already records.

### Does LEG A run concurrently with the learning block?

**No — `await`-sequenced.** `orchestrator.ts:652` awaits LEG A to completion
before `discoverOwnedWorkspaces` (`:660`) and before LEG B's inline
`runPhase14Inline` (`:672`) or fan-out (`:698`). The learning block lives inside
`runSyncForAccount` (`shared.ts`), which LEG B reaches. Within one `runFullSync`
invocation LEG A is fully finished first.

### Every path LEG A writes

| # | Path | Site |
|---|---|---|
| 1 | root `adPerformance/{ownerUid}_{ad_id}` | `orchestrator.ts:404` |
| 2 | root `adPerformanceHistory/{ownerUid}_{ad_id}_{since}_{until}` | `orchestrator.ts:408` |
| 3 | `creativeDeployments/{doc}` — `metaAdId`, `metaAdSetId`, `metaCampaignId`, `latestMetrics` | `orchestrator.ts:453-457` |
| 4 | `metaConnections/{ownerUid}` — `lastSyncAt` | `orchestrator.ts:471-473` |
| 5 | `users/{ownerUid}/workspaces/{wid}/private/metaConnection` — `lastMetaSyncAt` | `orchestrator.ts:480-482` |

(It also *reads* `metaConnections/{ownerUid}` at `orchestrator.ts:285` and lists
workspaces at `:526-535`.)

### Overlap with the learning path

Occurrence counts of each LEG A path inside `shared.ts` (the file containing the
learning write):

```
collection("adPerformance")        shared.ts: 2
adPerformanceHistory               shared.ts: 0
creativeDeployments                shared.ts: 0
metaConnections                    shared.ts: 1
private/metaConnection             shared.ts: 0
lastMetaSyncAt                     shared.ts: 9
```

Each resolved:

- **`adPerformance` — different collection, no overlap.** Both `shared.ts`
  occurrences (`:831`, `:1025`) are `adAccountRef.collection("adPerformance")`,
  where `adAccountRef` is
  `users/{uid}/workspaces/{wid}/adAccounts/{aid}` (`shared.ts:818-821`) — a
  *subcollection*. LEG A writes the **root** `adPerformance` collection. Different
  documents entirely.
- **`adPerformanceHistory`, `creativeDeployments` — zero references.** The learning
  path never touches them.
- **`metaConnections` — no overlap.** The single occurrence (`shared.ts:1247`) is a
  code comment inside the token-decrypt helper, not a path.
- **`learningAggregates.ts` is pure** — zero matches for `getDb|firestore|admin.|collection(`.
  It cannot touch any LEG A path by construction.
- **`lastMetaSyncAt` — this is the one real overlap.** See below.

### The one shared field, and whether it is the cooldown class

**Both legs write `lastMetaSyncAt` on the same document.**

- LEG A: `orchestrator.ts:480-482` —
  `.doc(\`users/${ownerUid}/workspaces/${workspaceId}/private/metaConnection\`).set({ lastMetaSyncAt: nowMs }, { merge: true })`
- LEG B: `shared.ts:1208-1209` → `patchStoredConnection(userId, workspaceId, { lastMetaSyncAt: nowMs, … })`, whose
  `privateConnectionRef` (`metaConnection.ts:44-49`) resolves to
  `users/{uid}/workspaces/{wid}/private/metaConnection` — **the same document,
  the same field**.

This is precisely the field class you flagged. So the question is whether anything
still *reads* it as a gate. Every non-assignment use in `functions/` and `src/`:

```
functions/src/metaConnection.ts:529-530     write plumbing (patch passthrough)
functions/src/metaSync/lease.ts:31          comment: "Never keyed on lastMetaSyncAt"
functions/src/metaSync/orchestrator.ts:475  comment: batch-4 cooldown removal
functions/src/metaSync/shared.ts:19, :1203  comments
functions/src/whatsWorkingDashboard.ts:366-367   READ — display ("last synced")
src/components/WhatsWorkingDashboard.tsx:36      @deprecated — "Always null"
src/components/WhatsWorkingDashboard.tsx:187-188 READ — relativeTime() display
```

- **`shared.ts` never reads it.** All nine occurrences are two comments, one type
  member, and six `lastMetaSyncAt: nowMs` assignments. No read.
- **No cooldown, watermark, or cursor survives.** A search of
  `functions/src/metaSync/` and `index.ts` for
  `cooldown|watermark|cursor|sinceLast|lastRun` returns only comments recording
  its **removal** — `trigger.ts:8` (*"the 1-hour cooldown that lived here"*),
  `orchestrator.ts:476` (*"cooldown removal keeps this field as display-only — it
  drives 'Synced N minutes ago', not the gate"*), and `lease.ts:31-35`, which
  states the lease is deliberately kept at a **separate document** so it *"can't
  accidentally alias into a cooldown-side read/write"*.
- The only readers are the two display surfaces, and the frontend's own
  cooldown-derived field is marked `@deprecated — Always null`
  (`WhatsWorkingDashboard.tsx:36`).

**Verdict on your question**: the shared field exists, but it is not read as a
gate by anything, and specifically not by the learning path. The last-writer-wins
race between the two legs on `lastMetaSyncAt` changes a displayed timestamp by
milliseconds and nothing else. **LEG A does not touch anything the learning path
uses for correctness.**

### The finding that DOES bear on the lease requirement

Not LEG A — the **fan-out worker**.

`metaSyncAccountWorker` calls `runSyncForAccount` **directly**, with no lease:

```
functions/src/metaSync/worker.ts:19:  import { runSyncForAccount, type SyncResult } from "./shared.js";
functions/src/metaSync/worker.ts:61:      const result: SyncResult = await runSyncForAccount({
```

`worker.ts` contains **no** reference to `acquireLease`, `releaseLease`, or
`runFullSyncWithLease`. So the learning aggregate write — which lives inside
`runSyncForAccount` — is reached by two different routes:

| Route | Lease held? |
|---|---|
| Manual press → `runFullSyncWithLease` → `runFullSync` → LEG B inline (`orchestrator.ts:672`, active workspace) → `runSyncForAccount` | **Yes**, per-owner |
| Fan-out (`orchestrator.ts:698`) and the 03:00 scheduled cycle (`dispatcher.ts:137`) → Cloud Tasks → `metaSyncAccountWorker` → `runSyncForAccount` | **No lease at all** |

This does not contradict the spec — `FR-055` already says the learning lease
covers *only the learning write*, which implies it belongs inside
`runSyncForAccount` where both routes converge. It does mean the **Phase 970
in-flight guard cannot be relied on to satisfy `FR-054`**, and any Batch 1 wording
suggesting the existing lease already serialises the learning write would be
wrong. The spec's lease must be its own thing, implemented at the learning write
itself.

I am recording this rather than treating it as the stop condition, because your
stop condition was "LEG A is outside the lease **and** touches shared state" —
LEG A is *inside* the lease and touches no learning state. If you would rather I
stop on this instead, say so and I will hold.

---

## Status

- Merge **resolved, verified, and committed** with this report and
  `batch-00b-report.md`.
- `batch-00b-report.md` corrected in place; its supporting table is now
  mechanically derived.
- Batch 1 **not started**. Item 4 of the prior message remains unactioned.
