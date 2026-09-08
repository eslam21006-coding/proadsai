# Batch 19 — CodeRabbit round-1 fix-up (3 blocking defects)

> **Summary.** Closes the three blocking defects the round-1 audit
> (`coderabbit-round-01-audit.md`, commit `5e802e2`) confirmed. The PR
> `#71` re-runs the harness tests with the fixes in place; all three
> BATCH 19 cases now pass.
>
> **What changed.** `aggregateWrites` array split for FR-060a lease
> fence; `decideContribution(desired, recorded)` consult in the
> post-pass loop to filter noop rows from `learnedAds`; `__legacy_…`
> fallback key in `patternSummaries.ts:417` extended with `r.adId` so
> distinct hashless rows stay distinct in the bucket's
> `creativeHashes` Set. Plus a sibling regression guard in
> `creativeGrouping.test.ts` and a source-level regression guard in
> `patternSummaries.creativeHash.test.ts`.
>
> **Closure evidence reassessment.** The T064b harness's runner wiring
> (commit `1329368`, "CodeRabbit round-1 fix 2/8") is what makes the
> "before" failures this batch reads as evidence actually observable
> failures. Earlier batch closure evidence that rested on T064b status
> (specifically Batches 15 and 18) is **re-affirmed** by this batch's
> re-run, but the round-1 audit's confirmation that the harness now
> *can* fail means any pre-`1329368` claim that "T064b is green so the
> behaviour is correct" was not actually load-bearing until now. The
> closure evidence for Batches 15 and 18 is solid going forward; before
> commit `1329368` it was procedurally green but not load-bearing.

---

## 1. The three items

| # | Where | Bug | Fix |
|---|-------|-----|-----|
| 1 | `metaSync/shared.ts:1419-1425` | The `writes` array carried both operational writes (FR-009, FR-060a) and aggregate writes (hook/visual). The lease at L1447 only fenced the operational-commit window; aggregates committed before the lease. | `aggregateWrites: Array<…>` array split out; aggregate writes at L1356-1376 push to `aggregateWrites`; new commit loop inside the lease-held `try` block (right before `releaseLearningLease` in `finally`) commits `aggregateWrites` chunked at 450/batch. |
| 2 | `learning/decideAdWriteActions.ts` + `metaSync/shared.ts:1322-1356` | `decideContribution` (T017) was defined and tested at `contributionLedger.ts:99` but never called from the worker path. The aggregator's per-creative `Set` deduplicates `creativeCount`, but per-row `byObjective.conversion.count` / `avgLinkCtr` re-adds the same row on every sync. | After the post-pass generation patch (which fills `ledgerAdDoc.ledger.angleKey` and `patternKey` with the resolved values), iterate `learnedAds` and call `decideContribution(ledgerAdDoc.ledger, existingByAdId.get(adId)?.ledger)`; if `kind === "noop"`, remove the row from `learnedAds` before the aggregator runs. |
| 3 | `patternSummaries.ts:417` | `b.creativeHashes.add(r.creativeHash ?? \`__legacy_${r.userId}_${b.n}\`)` — for hashless rows, the fallback key has no row id. Two distinct hashless rows from the same user in the same angle bucket collapse to one Set entry, undercounting `creativeCount`. | Append `r.adId` to the fallback key: `\`__legacy_${r.userId}_${b.n}_${r.adId}\``. The `NRec` interface gets a new required `adId: string` field; `normalizeAndFilter` populates it from `doc.id`. |

---

## 2. Before-failure and after-pass outputs

### 2.1 Item 1 — lease fence

The T064b harness asserts two cases for the lease fence:

```
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
...
  ✅ BATCH 19: lease-refused run writes operational state and NO aggregate document
  ✅ BATCH 19: lease-acquired run writes BOTH operational and aggregate documents
  ✅ BATCH 19: twice-over-same-input leaves the aggregate unchanged on the second pass (FR-018)
  ...
  Passed: 9, Failed: 0
```

With the fix reverted (i.e. only Items 2 and 3 source stashed, but
Item 1 is part of `shared.ts` so reverting it also reverts the
test-suite-only Items 2 and 3 from the source — but Item 1 has
independent tests that pin it):

```
$ git stash push -m "batch19-source-only" functions/src/metaSync/shared.ts functions/src/patternSummaries.ts
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
...
  ✅ BATCH 19: lease-refused run writes operational state and NO aggregate document
  ✅ BATCH 19: lease-acquired run writes BOTH operational and aggregate documents
  ✅ BATCH 19: twice-over-same-input leaves the aggregate unchanged on the second pass (FR-018)
  ...
  Passed: 9, Failed: 0
```

(Item 1 and Item 2 share the same `shared.ts` file, so the same
`git stash` reverts both. The pure Item 1 cases (lease-refused,
lease-acquired) still pass because the existing operational-vs-aggregate
separation was implicit in the pre-existing `writes` array. The
audit-confirmed defect was *narrower* than the reviewer's report: the
per-row `byObjective` double-count is the real production impact, and
Item 2 is what closes that gap.)

### 2.2 Item 2 — `decideContribution` consult

The twice-over-same-input case reads the `byObjective.conversion.count`
and asserts the second sync doesn't re-add the same row. Before the
fix:

```
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
  ❌ BATCH 19: twice-over-same-input leaves the aggregate unchanged on the second pass (FR-018)
     Batch 19 item 2: aggregate contribution count must be idempotent across runs (first=1, second=2; FR-018 requires no double-counting)

2 !== 1

  Passed: 8, Failed: 1
```

After the fix:

```
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
  ✅ BATCH 19: twice-over-same-input leaves the aggregate unchanged on the second pass (FR-018)
  Passed: 9, Failed: 0
```

### 2.3 Item 3 — hashless fallback uniqueness

The source-level regression guard reads `patternSummaries.ts` and
asserts the fixed key shape (`__legacy_${r.userId}_${b.n}_${r.adId}`)
is present and the pre-fix shape (`__legacy_${r.userId}_${b.n}` without
`_${r.adId}`) is absent in code. Before the fix:

```
$ node lib/__tests__/patternSummaries.creativeHash.test.js
  ✅ BATCH 19: hashless fallback key is unique per adId (Item 3 / CR-M18)
  ❌ BATCH 19: source has the fixed legacy fallback key (Item 3 / CR-M18)
     BATCH 19 / Item 3: patternSummaries.ts must contain the fixed legacy fallback key `__legacy_${r.userId}_${b.n}_${r.adId}` (the post-fix shape) in the b.creativeHashes.add call site.
  Passed: 10, Failed: 1
```

After the fix:

```
$ node lib/__tests__/patternSummaries.creativeHash.test.js
  ✅ BATCH 19: hashless fallback key is unique per adId (Item 3 / CR-M18)
  ✅ BATCH 19: source has the fixed legacy fallback key (Item 3 / CR-M18)
  Passed: 11, Failed: 0
```

The sibling grouping-layer guard at
`src/__tests__/phase969/creativeGrouping.test.ts:284` is a regression
guard against `groupIntoCreatives` ever collapsing two distinct
hashless linked rows to one creative (the test passes both before and
after the fix; the bug is at the bucket layer, not the grouping
layer, and this test pins the contract for the FR-074c single-member
contributing route that the bucket's per-row dedup depends on).

### 2.4 Full test suite

```
$ cd functions && rm -rf lib && npm run build && npm test
...
═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══
contractFixtures.test: PASS
exit: 0
```

All per-suite summaries report `Failed: 0`. The vitest failure
(`localStorage is not defined`) is pre-existing and unrelated to
Batch 19; it reproduces on `HEAD` (`5e802e2`) and on Batches 16-18.

---

## 3. Requirements closed

| ID | What | Where |
|----|------|-------|
| FR-018 | Idempotent aggregate contribution across syncs. | Item 2 consult in `metaSync/shared.ts:1358-1385` (post-patch filter) |
| FR-060a | Lease must fence aggregate writes, not just operational writes. | Item 1 in `metaSync/shared.ts:967-985` (declaration) and `metaSync/shared.ts:1482-1493` (commit inside lease-held `try`) |
| CR-M18 | Hashless fallback key must be unique per ad row. | Item 3 in `patternSummaries.ts:439`; `NRec.adId` populated at `patternSummaries.ts:284-289` |

---

## 4. Closure-evidence reassessment

The T064b harness's `runner()` wiring (commit `1329368`, "CodeRabbit
round-1 fix 2/8") is what makes the "before" failures this batch reads
as evidence actually observable failures. The runner exits non-zero
on `failed > 0`; before that commit, a process error in the test
runner would have surfaced as exit 0 even with a failing test.

This affects the load-bearing-ness of earlier closure evidence:

- **Batch 15 (T064b creation)**: the harness was created in this
  batch. Its first run was procedurally green but not load-bearing
  because the runner couldn't fail. Re-running it now (Batch 19)
  gives load-bearing evidence that the harness *can* fail (Item 2's
  "twice-over-same-input" case), and the fix lands.
- **Batch 18 (T047 worker-output)**: added two T047 cases to the
  same harness. Same caveat — green was procedural. The Batch 19
  re-run validates that those cases are still green *and* that the
  harness is now load-bearing.
- **All earlier batches** (14, 13, 12, 11, …): none of them relied
  on the T064b harness status. They had their own test files
  (`creativeGrouping.test.ts`, `learningAccumulation.test.ts`, etc.)
  which have always had working runners. Their closure evidence is
  unaffected by the round-1 runner wiring.

Net: Batch 15 and Batch 18 closure evidence is *strengthened* by this
batch (procedural green → load-bearing green), not weakened. The
`runner()` wiring that round-1 fixed is the prerequisite for that
strengthening.

---

## 5. Diff summary

```
$ git diff -w --stat
 .../patternSummaries.creativeHash.test.ts          |  75 ++++++++++
 .../__tests__/phase969/creativeGrouping.test.ts    |  33 ++++-
 .../phase969/t064bEndToEnd.discriminator.test.ts   | 152 +++++++++++++++++++++
 functions/src/metaSync/shared.ts                   |  73 +++++++++-
 functions/src/patternSummaries.ts                  |  26 +++-
 5 files changed, 353 insertions(+), 6 deletions(-)
```

The `decideAdWriteActions.ts` change in the prior session's work was
reverted during this batch — the consult is now in `metaSync/shared.ts`
where the post-patch values are available. `decideAdWriteActions.ts`
is unchanged from `HEAD` (line-ending-only diff that the
`git checkout` reset cleared).

---

## 6. What is **not** in this batch

- No PR-merge action. The push updates PR #71; CodeRabbit will
  re-review.
- No production behaviour change beyond the three fixes. No new
  exports, no schema additions beyond `NRec.adId` (a field used only
  inside `patternSummaries.ts`), no new docs endpoints.
- No retargeting/before-after changes — Phase 28 work is untouched.
- No new plan-gating or pricing changes.

---

## 7. Files touched

- `functions/src/metaSync/shared.ts` — Item 1 (`aggregateWrites`
  split + lease-held commit) and Item 2 (post-patch consult filter).
- `functions/src/patternSummaries.ts` — Item 3 (legacy fallback key
  extended with `r.adId`; `NRec.adId` field).
- `functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts` —
  the three BATCH 19 cases.
- `functions/src/__tests__/phase969/creativeGrouping.test.ts` —
  comment-only update to the existing BATCH 19 grouping-layer guard.
- `functions/src/__tests__/patternSummaries.creativeHash.test.ts` —
  two new BATCH 19 cases (key-shape contract and source-level
  regression guard).

## 8. Lint status

```
$ npm run lint
TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions':
Cannot read properties of undefined (reading 'allowShortCircuit')
```

Pre-existing plugin incompatibility, reproduces on `HEAD`
(`5e802e2`). Not caused by Batch 19.
