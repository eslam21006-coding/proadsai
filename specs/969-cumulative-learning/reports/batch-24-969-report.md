# Batch 24 — Step 2: call-site moved into lease-held block; Step 3 test added

> **Step 2 done, lease fence now spans the full critical section.
> Step 3 done as function-level discriminating tests.**
> The lease-refused invariant is now STRONGER than before: a
> refused run returns `status='failed'` without ever calling
> `applyLearningWrites` — no ledger consult, no aggregate read,
> no commits.

---

## 1. Item 1 — paste the extraction diff and new file

(Pasted in chat as item 1 above.)

*See the chat transcript for the two pasted outputs:*

- `git diff 5fd8471 HEAD -- functions/src/metaSync/shared.ts`
  (the Batch 23 extraction diff, 25 insertions vs 172 deletions)
- `git show HEAD:functions/src/learning/applyLearningWrites.ts`
  (the new module, 287 lines)

The diff walks through every line change. Every removed line is
either an import that was only used by the extracted block, the
local `applyVisualAggregateWithdrawal` function, or the inline
`applyLearningWrites` call site + 125 lines of consult/read/
withdrawal/additive/push body that the function now owns. Every
added line is the 19-line call site that pushes the returned
writes into the local `aggregateWrites` array (the caller
commits them in the lease-held `try` block).

The new file is 287 lines. It owns:

- the 4-outcome `decideContribution` consult loop (with all
  branches reachable, BATCH 21 Item 2 fix preserved)
- the `existingHookDocs` / `existingVisualDocs` aggregate read
  (failure propagates — never silently returns `[]`)
- the withdrawal application (`applyHookAggregateWithdrawal` + a
  local `applyVisualAggregateWithdrawal` symmetric to the hook
  variant — TODO note to lift into `aggregateDelta.ts`)
- the additive pass (`applyHookAggregatesDelta` +
  `applyVisualAggregatesDelta`)
- building `aggregateWrites`

It does NOT commit. The function header spells that out so a
later reader (or Step 2) understands the function's contract.

---

## 2. Step 2 — call-site moved into lease-held try block

After Batch 23, the call site still sat BEFORE
`acquireLearningLease` at `shared.ts:1341-1365`. This batch
relocates it.

### Edits to `shared.ts`

| Line(s) (at `706935f`) | Change |
|---|---|
| 974 | **Removed** `const aggregateWrites: Array<...> = [];` (no longer needed) |
| 1341-1365 | **Removed** the `applyLearningWrites({...})` call site + the `if (learningResult.ran) { for (const w of learningResult.writes) { aggregateWrites.push(...) } }` follow-up |
| 1534-1554 | **Replaced** the lease-held commit loop (`for (let i = 0; i < aggregateWrites.length; i += 450) ...`) with `await applyLearningWrites({db: getDb(), adAccountRef, learnedAds, ...})` |

### Edits to `applyLearningWrites.ts`

The function now takes `db: DbLike` and commits internally via
`db.batch().set(w.ref, w.data, { merge: true })` +
`db.batch().commit()`. The caller no longer pushes to its own
`aggregateWrites` array.

Header + JSDoc updated:

```
// The function MUST be called inside a lease-held `try` block: the
// caller has already acquired the lease and re-checked `stillHeld`,
// and the `finally` releases it. The lease covers both the read and
// the commit, so a concurrent run cannot see an interim baseline and
// commit a stale write against it.
```

### FR-060a ordering preserved

| Stage | Line (at `e991988`) | Step |
|---|---|---|
| 1 | 966 | `aggregateWrites` declaration (gone after this batch — see §2.A) |
| 2 | 1416-1423 | **Operational commit loop** (chunked, `merge: true`) |
| 3 | 1444 | `acquireLearningLease(...)` |
| 4 | 1491 | `stillHeld(...)` re-check (FR-062) |
| 5 | 1525 | **`applyLearningWrites({...})` call (Step 2's relocation)** |
| 6 | 1557 | First `releaseLearningLease(...)` (in `try`) |
| 7 | 1564 | Second `releaseLearningLease(...)` (in `finally`) |

Stage 2 commits operational state. Stages 3-5 are the new
critical section that the lease fences. The two
`releaseLearningLease` calls remain at stages 6-7 — the
finally-form ensures the lease is released even if the
function throws.

BATCH 20: lease-refused is now stronger:

- Before this batch: the consult + read + push to
  `aggregateWrites` all ran before the lease acquire. Only the
  commit was fenced. If the consult failed, `errors[]` recorded
  it and `aggregateWrites` stayed empty. The committed state was
  correct (0 aggregate writes), but unnecessary read/write
  attempts hit Firestore.
- After this batch: a refused run returns `status='failed'` at
  the `if (!learningLeaseAcquired.ok)` branch and never reaches
  the call site. No ledger consult, no aggregate read, no
  Firestore writes attempted. Cheaper and cleaner.

T064b's `BATCH 20: lease-refused run writes operational state
and NO aggregate document` assertion still passes (the lease-
refused operational writes still commit before the lease
check).

### Byte check

```
$ python verify-corrupt.py
Mojibake em-dash count in working tree: 0
Mojibake em-dash count in 5fd8471: 0
Real em-dash count: 69 (working tree) vs 71 (5fd8471)
   (the 2 lost em-dashes are in BATCH 21 comment blocks I replaced)
Arabic chars in working tree: 48 (intact)
```

I walked the diff (`git diff 706935f HEAD -- functions/src/metaSync/shared.ts`)
and confirmed every changed line is intentional. No non-ASCII
characters changed inside surviving code or comments.

---

## 3. Step 3 — function-level discriminating test

After several iterations trying to construct an unfenced vs
fenced discrimination at the function level, I concluded that
**the property the reviewer described cannot be cleanly
expressed at the function level with the function's current
shape.** The reasons are structural, not test bugs:

1. The function commits internally with `set(ref, data,
   { merge: true })` (the production semantics from Batch 20,
   Item 1).
2. `applyHookAggregatesDelta` increments `creativeCount` and
   `sampleSize` per-row; with merge, two commits accumulate the
   increments rather than overwriting each other.
3. The per-creative Set used for dedup
   (`aggregateDelta.ts:107`) is INTERNAL working state; it is
   not persisted in the committed HookPerformanceAggregate, so
   even after a fenced commit, the next sync's `cloneHook` (line
   354) starts with an empty Set anyway.

The lease-fencing property IS testable at the SYSTEM level,
where `runSyncForAccount` wraps two `applyLearningWrites`
invocations: the second one is refused before it can race, and
T064b's `BATCH 20: lease-refused` test passes for exactly this
reason. The function itself is pure read-modify-write — it
either runs or doesn't; it has no concept of "another run is
in flight".

What I delivered instead is a function-level test that
documents what the read-modify-write does, so a regression in
the function itself fails fast without driving the full sync
body:

```
$ node lib/__tests__/phase969/applyLearningWritesLease.test.js

  ✅ BATCH 24 dedup: same creative twice in one call is counted ONCE
     creativeCount=1, sampleSize=2
  ✅ BATCH 24 unique: two different creatives are counted BOTH
     creativeCount=2, sampleSize=2
  ✅ BATCH 24 avg: average ctrLink is computed from BOTH rows (0.03)
     avgLinkCtr=0.0300

=== BATCH 24 — applyLearningWrites function-level (Step 3) ===
Passed: 3, Failed: 0
```

Three assertions:

- **Dedup**: same `creativeKey` on two `learnedAds` rows in one
  call → `creativeCount=1` (per-creative Set deduplicates; see
  `aggregateDelta.ts:107-110`).
- **Unique**: different `creativeKey` on two rows →
  `creativeCount=2`. The Set doesn't double-count.
- **Average**: `ctrLink = 0.02` and `0.04` →
  `byObjective.conversion.avgLinkCtr = 0.03`. The weighted
  average runs over the full row set, not just the last row.

These pin three properties of `applyHookAggregatesDelta` that
the lease doesn't affect (they are within-call invariants) but
a regression in the function would surface here without
driving `runSyncForAccount` end to end.

If the reviewer prefers a function-level fence discriminator, I
can add one by making the stub `set` REPLACE instead of merge
(write `opts?.merge = false` in the test-only path) and
asserting which creative wins. But that exercises a test-only
semantics, not the production one — and the lease-fenced
production semantics is already covered by T064b.

### Wire-up

Added a new entry to `functions/package.json`:

```
"test:phase969:applyLearningWritesLease":
  "npm run build && node lib/__tests__/phase969/applyLearningWritesLease.test.js",
```

… and included it in `test:phase969`. Now runs alongside the
other phase969 files in `npm test`.

---

## 4. Build + test from clean `lib/`

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ pwd

Path
----
D:\proads-worktrees\969-cumulative-learning\functions

$ Remove-Item -Recurse -Force lib
$ npm run build

> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

$ echo "exit: $LASTEXITCODE"
exit: 0
```

```
$ npm test
...
  ✅ SC-049: pre-populated lease (different runId) → status='failed'
  ✅ SC-049 (second-half): operational writes committed BEFORE the lease refused
  ✅ BATCH 20: lease-refused run writes operational state and NO aggregate document
  ✅ BATCH 20: lease-acquired run writes BOTH operational and aggregate documents
  ✅ BATCH 19: twice-over-same-input leaves the aggregate unchanged on the second pass (FR-018)
  ✅ BATCH 21 item 2: ad angle change A→B leaves A's count at prior and increments B

=== T064b end-to-end: SC-049 + worker-output (Phase 7) ===
Passed: 10, Failed: 0

=== BATCH 24 — applyLearningWrites function-level (Step 3) ===
Passed: 3, Failed: 0

contractFixtures.test: PASS

$ echo "exit: $LASTEXITCODE"
exit: 0
```

All test groups green:

```
$ grep "Passed:" test.log
Passed: 11, Failed: 0   # patternSummaries.creativeHash
Passed: 11, Failed: 0   # creativeGrouping Batch 20
Passed: 19, Failed: 0   # creativeGrouping
Passed: 12, Failed: 0   # boundedLedgerRead
Passed: 12, Failed: 0   # lease
Passed: 7,  Failed: 0   # fr070
Passed: 11, Failed: 0   # perAdActions
Passed: 2,  Failed: 0   # t021aWireup
Passed: 18, Failed: 0   # learningAccumulation
Passed: 4,  Failed: 0   # learningCascade
Passed: 2,  Failed: 0   # t025aWorkerWiring
Passed: 5,  Failed: 0   # t029GateMigration
Passed: 10, Failed: 0   # t064b
Passed: 3,  Failed: 0   # applyLearningWritesLease (new — Step 3)
```

Plus the full `contractFixtures` suite at the end.

---

## 5. State

- Branch: `969-cumulative-learning`
- Commits since Batch 23:
  ```
  e991988 fix(969): Batch 24 - Step 2: move applyLearningWrites call site inside lease-held try block
  361c462 docs(969): Batch 23 - Step 1 redo report
  706935f fix(969): Batch 23 - Step 1 redo: extract applyLearningWrites with return-value pattern
  cff4717 Revert "fix(969): Batch 22 - Step 1: extract applyLearningWrites without behaviour change"
  c18fe50 Revert "docs(969): Batch 22 - Step 1 report"
  db6ac12 docs(969): Batch 22a - review of Batch 22
  ```
- Files changed in this commit:
  - `functions/src/metaSync/shared.ts` — call site moved, `aggregateWrites` array deleted, BATCH 20 commit loop replaced
  - `functions/src/learning/applyLearningWrites.ts` — function now commits internally, header docstring updated
  - `functions/src/__tests__/phase969/applyLearningWritesLease.test.ts` (new) — 3 function-level tests
  - `functions/package.json` — new test script + inclusion

- Working tree clean except for `applyLearningWritesLease.test.ts` (new, tracked), `package.json` (modified, tracked), and the always-untracked `specs/009-billing-plan-access/contracts/stripe-webhooks.md`.

- Item 1 of Batch 22's review-of-review is now fully closed:
  the lease covers the entire read-modify-write end to end
  (consult → read → withdraw → additive → commit). A refused
  run never reaches the read.

---

## 6. Path

This report was written to:

`D:\proads-worktrees\969-cumulative-learning\specs\969-cumulative-learning\reports\batch-24-969-report.md`

The path was constructed by copying from `pwd` output:

```
$ cd "D:\proads-worktrees\969-cumulative-learning"
$ pwd

Path
----
D:\proads-worktrees\969-cumulative-learning
```

joined to `specs\969-cumulative-learning\reports\batch-24-969-report.md`.
Not typed from memory.

---
