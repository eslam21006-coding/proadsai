# Pre-merge check — PR #71 into `main`

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-11
**Scope**: read-only. Nothing merged, nothing rebased, no conflict resolved, no
force-push. The only writes are this report and
`reports/squash-commit-message.txt`.
**Path** (from `pwd`): `/d/proads-worktrees/969-cumulative-learning`

---

## Headline

**The premise of the check is false in the owner's favour: `main` has not moved.**
The branch is **0 commits behind** and **73 ahead**. `origin/main` is a strict
ancestor of `HEAD`, the merge is a fast-forward, and the merge preview is empty.

**There is one finding that matters before merging, and it is not a merge
finding**: the per-day conversion accrual and the write-once efficiency figure —
Amendment 2, FR-002/FR-002a and FR-077 through FR-087 — **are not implemented**.
See §5.

---

## 1. Divergence and merge preview

```
$ git fetch origin
(no output)

$ git rev-list --left-right --count origin/main...HEAD
0	73

$ git log --oneline origin/969-cumulative-learning..origin/main
(empty — no output)
```

The first number is **0**: `main` has **no** commit this branch lacks. The second
is 73. The branch was last synced at Batch 09 and `main` has had no commit since;
its tip is still `ffc14a8` (Phase 970, dated 2026-09-04), which this branch already
contains.

```
$ git rev-parse HEAD origin/969-cumulative-learning origin/main
40ff3406b6a6c6ea2bb3b3cd3801c0d3a92ca969
40ff3406b6a6c6ea2bb3b3cd3801c0d3a92ca969
ffc14a806b2abbb8ddb323ccff6cc49126c13a8f

$ git merge-base HEAD origin/main
ffc14a806b2abbb8ddb323ccff6cc49126c13a8f

$ git merge-base --is-ancestor origin/main HEAD
YES - origin/main is fully contained in HEAD
```

The merge-base **equals** `origin/main`'s tip. Local `HEAD` equals
`origin/969-cumulative-learning`, so nothing is unpushed.

### The merge test

```
$ git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main
exit=0
bytes: 0  lines: 0
--- output begins ---
--- output ends ---

$ grep -n -E '^(<<<<<<<|=======|>>>>>>>)' <that output>
(no matches)
```

**Clean. Zero conflict markers.** Confirmed a second way with the modern form
(git 2.53.0):

```
$ git merge-tree --write-tree --messages HEAD origin/main
41ae16c035c910b051b1c64ade74343338c495d2
exit=0
```

No conflict block, no message block. And the resulting tree is **identical to
HEAD's own tree**:

```
merge-tree result : 41ae16c035c910b051b1c64ade74343338c495d2
HEAD^{tree}       : 41ae16c035c910b051b1c64ade74343338c495d2
YES - merge result tree == HEAD tree; main contributes nothing
```

GitHub agrees:

```
$ gh pr view 71 --json ...
{"base":"main","commitCount":73,"head":"969-cumulative-learning",
 "mergeStateStatus":"CLEAN","mergeable":"MERGEABLE","number":71,
 "state":"OPEN","title":"Issue 969 — Cumulative Learning: ..."}
```

---

## 2. Conflict characterisation

**Not applicable — there are no conflicts.**

`functions/src/metaSync/shared.ts` was the file to watch. It **does not conflict**,
and it cannot: `main` has not touched it since Phase 970, which this branch already
merged at Batch 09. The per-account lease placement is not at risk from this merge,
because this merge changes nothing. Its state is recorded in §3 anyway, so it can be
checked again after the squash lands.

One housekeeping note: `git status --short` shows a single untracked file,
`specs/009-billing-plan-access/contracts/stripe-webhooks.md`, unrelated to this
feature and not added here.

---

## 3. Merge-preview state of the four properties

Because the merge result tree is byte-identical to HEAD's tree, **the merge-preview
state is the current branch state**. These line numbers are valid both before and
after the squash.

### 3.1 Lease before writes, writes inside the lease-held `try` — CONFIRMED

| Element | File:line |
|---|---|
| `acquireLearningLease(` call | `functions/src/metaSync/shared.ts:1418` |
| refusal early-return | `shared.ts:1429-1454` |
| `stillHeld` fencing re-check (FR-062) | `shared.ts:1465` |
| **`try {` opening the lease-held block** | `shared.ts:1508` |
| **`await applyLearningWrites({`** | `shared.ts:1525` |
| `releaseLearningLease` in try body | `shared.ts:1536` |
| `} finally {` | `shared.ts:1542` |
| `releaseLearningLease` in finally | `shared.ts:1543` |

Acquire (`:1418`) precedes the write (`:1525`), and the write is inside the `try`
opened at `:1508`. Verbatim from `shared.ts:1517-1524`:

```
        // BATCH 22 — Step 2: the learning read-modify-write now
        // runs INSIDE the lease-held try block. applyLearningWrites
        // owns the consult, the aggregate read, the withdrawal
        // application, the additive pass, building aggregateWrites,
        // and the chunked commit — the call site has moved
        // here from the post-pass try block, so the lease covers the
        // entire critical section. A lease-refused run skips this block
        // entirely (no read, no compute, no commit).
```

**Two observations, neither a defect, both worth knowing after a resolution:**

1. `releaseLearningLease` is called **twice** on the happy path — `:1536` in the try
   body and `:1543` in the `finally`, which always runs. It is harmless: the release
   is a transaction that returns `{released:false}` when the doc is absent
   (`learning/learningLease.ts:171`) and when the holder id does not match (`:173`).
   The cost is one redundant transaction per sync. **If a future resolution deletes
   one of the two, it must be the one at `:1536`, never the `finally`.**
2. The comment at `shared.ts:1504-1507` still reads *"Phase 3 inserts the
   learning-write body here … Until then, immediately release"*, and the placeholder
   comment at `:1509-1514` still says *"Placeholder for the Phase 3 learning write
   body"*. Both were true before Batch 22 and are now stale — the body is right
   there at `:1525`. Comment-only; no behaviour depends on them.

### 3.2 Operational batch commit before the lease (FR-060a) — CONFIRMED

The commit loop is `shared.ts:1390-1397`; acquisition is `:1418`. Commit precedes
acquisition by 21 lines with no branch between them. Verbatim, `shared.ts:1383-1397`:

```
    // Commit in chunks of 450. FIX 5B: use `merge: true` so the sync
    // does NOT wipe fields the delete cascade wrote (e.g.
    // `deletedGenerationId`, `deletedGenerationAt`, `matchedManuallyAt`).
    // These are the **operational status writes** FR-009 / FR-060a require
    // to be committed BEFORE the learning-write lease is attempted — the
    // owner-action list must reflect today's sync even when learning
    // cannot proceed.
    for (let i = 0; i < writes.length; i += 450) {
        const chunk = writes.slice(i, i + 450);
        const batch = getDb().batch();
        for (const w of chunk) batch.set(w.ref, w.data, { merge: true });
        await batch.commit().catch((e: unknown) => {
            errors.push(`batch commit failed: ${(e as Error).message}`);
        });
    }
```

The refusal path at `:1446-1453` returns `status: "failed"` **after** those writes
have committed, which is the intended FR-060a behaviour.

### 3.3 `passesFRO34Gate` reads `creativeCount`, no `?? sampleSize` — CONFIRMED

Predicate, `functions/src/rankingEngine.ts:177-181`:

```
export function passesFRO34Gate(summary: PatternSummary): boolean {
    if (summary.confidence < MIN_CONFIDENCE) return false;
    if ((summary.creativeCount ?? 0) < MIN_SAMPLE_SIZE) return false;
    return true;
}
```

The fallback is `?? 0`, **not** `?? sampleSize` — an absent `creativeCount` fails
the gate rather than silently reverting to row counting.

| Site | File:line | Form |
|---|---|---|
| Predicate | `rankingEngine.ts:177-181` | `(summary.creativeCount ?? 0) < MIN_SAMPLE_SIZE` |
| Gate site 1 — `querySummaries` | `rankingEngine.ts:251` | `if (!passesFRO34Gate(s)) continue;` |
| Gate site 2 — failure patterns | `rankingEngine.ts:406` | `if (((s.creativeCount ?? 0) >= 3) && s.negativeCount >= 2)` |
| RAG gate | `ragContext.ts:167` | `sampleSize: a.creativeCount ?? 0` (floor `RAG_MIN_SAMPLE_SIZE = 10`, `ragContext.ts:126`) |

Constants: `MIN_CONFIDENCE = 0.15` (`rankingEngine.ts:151`), `MIN_SAMPLE_SIZE = 3`
(`:152`). Gate site 2 deliberately keeps the inline form so a regression in the
predicate cannot silently take the failure-pattern path with it (`:400-405`).

A repository-wide grep for `?? sampleSize` returns matches in **comments only**
(`patternSummaries.ts:42`, `:458`; `rankingEngine.ts:160`, `:175`, `:249`) and in
the source-text assertions of
`__tests__/phase969/t029GateMigrationDiscriminator.test.ts`, whose `:155` asserts
the fallback is absent. **Zero live-code occurrences.**

### 3.4 Two withdrawal maps, keyed separately — CONFIRMED

Both in `functions/src/learning/applyLearningWrites.ts`:

| | Hook | Visual |
|---|---|---|
| Map | `withdrawalByAngle` | `withdrawalByPattern` |
| Declared | `:281` | `:300` |
| Key source | `recorded.angleKey` (`:310`) | `recorded.patternKey` (`:311`) |
| Populated | `:314-316` | `:319-321` |
| Read by | `withdrawalByAngle.get(agg.angleKey)` `:326` | `withdrawalByPattern.get(agg.patternKey)` `:342` |
| Applies | `applyHookAggregateWithdrawal` `:330` | `applyVisualAggregateWithdrawal` `:346` |

Each map is keyed and read on the **same** field, so neither lookup can cross. The
file's own header records why, `:11-19`:

```
//   - the withdrawal application against the RECORDED geometry
//       - hook withdrawals are keyed by `angleKey`
//       - visual withdrawals are keyed by `patternKey`
//     a visual withdrawal that silently never runs (Batch 26, bug 1).
```

`:339-341` names the exact regression to guard against: the earlier code was
`withdrawalByAngle.get(agg.patternKey)` — a map keyed on hook angle, looked up by
pattern key, **never matching**, so every visual withdrawal silently did nothing.
**Any resolution that collapses these two maps back into one reintroduces a
silent-no-op bug that produces no error and no log line.**

---

## 4. Squash commit message

Written to `specs/969-cumulative-learning/reports/squash-commit-message.txt`
(a file to copy from, not committed as a commit message).

Every factual claim in the owner's draft was checked against the code. **All were
accurate except one paragraph, which was removed**: the draft's conversion-accrual
paragraph described work that is not in the branch (§5). A short "Not in this
change" paragraph replaced it, so `main`'s history does not claim a behaviour the
merged code does not have.

Verified as accurate and kept unchanged: the 1008 / 146 / 55 census figures; the
10 / 3 / 3 gate values; grouping by `imageHash` with propagation, `generationId`
merge and manual precedence; the per-account lease inside `runSyncForAccount`;
Phase 970's lease being per-owner and not reaching the worker; operational writes
committing first; and the one new bilingual string
(`whats_working.multi_funnel.label` / `.tooltip`, `src/i18n.tsx:550-551` and
`:1510-1511`).

---

## 5. Finding that is not a merge finding — read before merging

**Phase 4 of the feature is specified, tasked, and not implemented.**

`functions/src/learning/index.ts:28-30`, verbatim:

```
// ─── Phase 4 — conversion accrual + efficiency figure ──────────────
// export * from "./conversionAccrual.js";  // FR-081–FR-086a
// export * from "./efficiencyFigure.js";   // FR-002, FR-002a, FR-003, FR-077–FR-080, FR-087
```

Both re-exports are commented out, and neither file exists:

```
$ ls -1 functions/src/learning/
aggregateDelta.ts  applyLearningWrites.ts  boundedLedgerRead.ts
contributionLedger.ts  creativeGrouping.ts  decideAdWriteActions.ts
fieldLevelDiscrimination.ts  index.ts  learningLease.ts
learningPerAdLoop.ts  types.ts
```

The types landed but are dead:

```
$ grep -rn "ContributionState\|DayAccrual\|efficiencyRaw\|sealedTarget" \
    functions/src src --include=*.ts --include=*.tsx | grep -v "learning/types.ts"
(no matches)
```

`ContributionState` (`types.ts:44`) and `DayAccrual` (`types.ts:91`) are declared
and referenced **nowhere** outside their own declaration.

This is **Amendment 2** — "a creative contributes to efficiency learning exactly
once, when its numbers are final" — the amendment that took Batches 1B through 1E
to specify. What shipped is **Amendment 1** (the creative as the unit of evidence)
plus the accumulation, ledger, withdrawal and lease machinery. What did not ship is
the sealing rule, the per-day upward-only accrual, and the write-once efficiency
figure.

**`tasks.md` cannot be used to judge this.** Its checkboxes were never maintained
during implementation — 1 ticked, 78 open — so they reflect the state at authoring,
not the state of the code. Shipped scope above was determined from the code alone.

Nothing here blocks the merge, and nothing here is a conflict. It is a scope fact
the owner should know **before** squashing, because the squash message is what
`main`'s history will say this change did.

---

## Summary

| # | Check | Result |
|---|---|---|
| 1 | Behind `main` | **0** (73 ahead; `main` is an ancestor) |
| 1 | Merge preview | **Clean** — empty output, tree identical to HEAD, GitHub `CLEAN`/`MERGEABLE` |
| 2 | Conflicts | **None.** `shared.ts` does not conflict and cannot |
| 3 | Lease before writes, writes inside the `try` | CONFIRMED — `:1418` / `:1508` / `:1525` |
| 3 | Operational commit before lease (FR-060a) | CONFIRMED — `:1390-1397` then `:1418` |
| 3 | Gate reads `creativeCount`, no `?? sampleSize` | CONFIRMED — `:177-181`, `:251`, `:406` |
| 3 | Two withdrawal maps keyed separately | CONFIRMED — `:281`/`:326` and `:300`/`:342` |
| 4 | Squash message | Written; one inaccurate paragraph removed |
| 5 | Phase 4 (accrual + efficiency) | **Not implemented** — modules commented out, types unused |

Not merged. Not rebased. No conflict resolved. No force-push.
