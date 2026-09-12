# Batch 29 — the add/withdraw invariant, audited pair by pair

**Branch**: `969-cumulative-learning` · **PR #71**: open, not merged
**Date**: 2026-09-12
**Scope**: the visual counter asymmetry the owner named, plus every other
add/withdraw pair in `aggregateDelta.ts` — found on purpose this time.
**Not merged. Phases 4, 5 and 6 not started.**
**Path** (from `pwd`): `/d/proads-worktrees/969-cumulative-learning`

---

## Result

**Six asymmetries, not three.** The owner named three; walking every pair found three
more, and **two of the three new ones inflate nightly on read surfaces** — the same
shape as Batch 28's `creativeCount` defect.

| | Before | After |
|---|---|---|
| `addWithdrawSymmetry.test.ts` | **2 passed, 8 failed** | **10 passed, 0 failed** |

The two that passed before did so vacuously: S2 and S4 assert counters return to
zero and never go negative, and every counter involved was already stuck at zero.

Batch 28's suites re-run unregressed: **7/7** and **7/7**.

---

## First, the question asked before implementing

**Does anything read `sampleSize`, `byGeoTier` or `byAudienceType` on the visual
aggregate today?**

**No — and the premise that "the hook equivalents are read" is not correct either.
Neither side's breakdowns are read by anything.**

`byGeoTier` and `byAudienceType` appear in exactly four non-test files, and two of
them are the aggregator and its withdrawal:

```
$ grep -rn "byGeoTier\|byAudienceType" functions/src src --include=*.ts --include=*.tsx \
    | awk -F: '{print $1}' | sort | uniq -c | sort -rn
     32 functions/src/learning/aggregateDelta.ts
      5 functions/src/__tests__/phase969/withdrawalAverage.test.ts
      4 functions/src/learningAggregates.ts            <- the type declaration
      4 functions/src/learning/applyLearningWrites.ts
      4 functions/src/__tests__/ragInjection.test.ts
      4 functions/src/__tests__/ragContext.test.ts
      4 functions/src/__tests__/phase969/learningAccumulation.test.ts
      4 functions/src/__tests__/phase969/applyLearningWritesLease.test.ts
      2 functions/src/__tests__/phase969/whatsWorkingDashboardMultiFunnel.test.ts
      2 functions/src/__tests__/phase969/learningCascade.test.ts
```

No consumer file appears at all. **Neither the hook's nor the visual's geo-tier and
audience-type partitions reach any surface.** They are written and never read, on
both aggregates.

**Top-level `sampleSize` is also write-only on both.** It is *declared* in the
dashboard's `VisualAggShape` (`whatsWorkingDashboard.ts:653`) and never referenced.
Every `sampleSize` the readers actually consume is a **projected** field on a
derived shape, built from a different source:

| Reader | Field named `sampleSize` | Actually built from |
|---|---|---|
| `ragContext.ts:167` (`rankHooks`) | `RankedHook.sampleSize` | `a.creativeCount ?? 0` |
| `ragContext.ts:345` (`visualRanked`) | `RankedVisual.sampleSize` | `v.byObjective.conversion.count` |
| `whatsWorkingDashboard.ts:585`, `:787`, `:1001` | dashboard row `sampleSize` | `creativeCount ?? 0` |

So this fix is, as the instruction anticipated, **currently unobservable from any
surface**. It was made anyway, for the reason given: the fields are in the persisted
shape, and FR-025 preserves the objective / geo-tier / audience-type partitions **by
name and meaning**. A partition that only ever decrements is wrong regardless of who
reads it today, and the next reader to wire it up would inherit a field that has been
counting downward for months.

---

## The full pair-by-pair audit

Two pairs exist. Every counter and average in each, with its state **before** this
batch. ✅ symmetric · ❌ asymmetric.

### Pair 1 — `applyAdToHook` ↔ `applyHookAggregateWithdrawal`

| Field | Addition | Withdrawal | |
|---|---|---|---|
| `sampleSize` | `+1` (conversion) | `−1` (conversion) | ✅ |
| `byObjective.conversion.count` | `+1` | `−1` | ✅ |
| `byObjective.conversion.avgLinkCtr` | weighted | `withdrawAvg` | ✅ *(Batch 28)* |
| `byObjective.conversion.bestVerdictCount` | `+1` if 🟢 | `−1` if 🟢 | ✅ |
| `byObjective.conversion.worstVerdictCount` | `+1` if 🔴 | `−1` if 🔴 | ✅ |
| `byObjective.other.count` | `+1` (other) | `−1` (other) | ✅ |
| `byObjective.other.avgLinkCtr` | weighted | `withdrawAvg` | ✅ *(Batch 28)* |
| `byGeoTier[t].count` | `+1` (conversion) | `−1` (conversion) | ✅ |
| `byGeoTier[t].avgCtr` | weighted | `withdrawAvg` | ✅ *(Batch 28)* |
| `byAudienceType[a].count` | `+1` (conversion) | `−1` (conversion) | ✅ |
| `byAudienceType[a].avgCtr` | weighted | `withdrawAvg` | ✅ *(Batch 28)* |
| **`byFunnelType[k].count`** | **`+1` CONVERSION ONLY** (`:176`, inside the branch) | **`−1` ALWAYS** (outside the branch) | **❌ #4** |
| `creativeCount` / `contributedCreativeKeys` | key added | key deleted | ✅ *(Batch 28)* |

### Pair 2 — `applyAdToVisual` ↔ `applyVisualAggregateWithdrawal`

| Field | Addition | Withdrawal | |
|---|---|---|---|
| **`sampleSize`** | **never** | **`−1` (conversion)** | **❌ #1** |
| `byObjective.conversion.count` | `+1` | `−1` | ✅ |
| `byObjective.conversion.avgLinkCtr` | weighted | `withdrawAvgLocal` | ✅ *(Batch 28)* |
| `byObjective.conversion.avgCpm` | weighted | `withdrawAvgLocal` | ✅ *(Batch 28)* |
| **`byObjective.conversion.bestVerdictCount`** | **`+1` if 🟢** | **never** | **❌ #5** |
| **`byObjective.conversion.worstVerdictCount`** | **`+1` if 🔴** | **never** | **❌ #6** |
| `byObjective.other.count` | `+1` (other) | `−1` (other) | ✅ |
| **`byGeoTier[t].count`** | **never** | **`−1` (conversion)** | **❌ #2** |
| `byGeoTier[t].avgCtr` / `.avgCpm` | never | never | ⚠️ inert both ways |
| **`byAudienceType[a].count`** | **never** | **`−1` (conversion)** | **❌ #3** |
| `byAudienceType[a].avgCtr` / `.avgCpm` | never | never | ⚠️ inert both ways |
| `byFunnelType[k].count` | `+1` always | `−1` always | ✅ |

**Asymmetries #1–#3** are the ones the owner named. **#4–#6** were found by walking
the table, and #5 and #6 are the more serious of the six:

- **#5 / #6 — the visual verdict counters inflate on the modal path.** The addition
  increments, nothing decremented, and `withdraw_then_add` fires on every sync where
  spend moved. Measured before the fix: **one 🟢 creative cycled five times reported
  six wins.** Both fields are read — `ragContext.ts:346` and `:347` build the visual
  ranking's `winCount` / `loseCount` from them, and the dashboard's visual sort uses
  `bestVerdictCount` (`whatsWorkingDashboard.ts:626`). This is a third nightly
  inflator of the same family as Batch 28's `creativeCount`.
- **#4 — the hook funnel bucket is over-decremented, and it is read.** The addition
  increments `byFunnelType` inside the conversion branch; the withdrawal decremented
  it unconditionally, so a **non-conversion** row subtracted a bucket count it never
  contributed. Measured before the fix: **cycling one non-conversion row five times
  drove a bucket holding a real conversion contribution from 1 to 0.** That bucket is
  what `isMultiFunnel` reads (`whatsWorkingDashboard.ts:624`, `:823`) — so this
  silently switches off **FR-041's multi-funnel indication**, the one new
  owner-visible string this feature introduces.

---

## What changed, and which side of each pair was fixed

The instruction's rule — *make the addition increment* — applies where the addition
never touched the field. Two of the six needed the opposite side, and the reasoning
is recorded in the code, not only here.

| # | Field | Side fixed | Why that side |
|---|---|---|---|
| 1, 2, 3 | visual `sampleSize`, `byGeoTier`, `byAudienceType` | **addition** | The instruction's rule. FR-025 keeps the partitions by name and meaning, so the partition is filled in rather than the withdrawal gutted. Mirrors `applyAdToHook`, **plus `avgCpm`**, which visual buckets carry and hook buckets do not |
| 4 | hook `byFunnelType` | **withdrawal** | The addition is the well-defined side. Widening it to non-conversion rows would change what *"evidence spans more than one funnel"* means — which FR-025 forbids and FR-041 depends on. The withdrawal is moved inside the conversion branch instead |
| 5, 6 | visual `bestVerdictCount`, `worstVerdictCount` | **withdrawal** | The breach is the other direction — the addition already increments. Making the withdrawal decrement mirrors the hook exactly and preserves meaning; removing the increment would break a live read surface |

Because the visual geo/audience **counts** now move, their **averages** move too
(#9 in the tests): a partition with counts and permanently-zero averages is half a
partition, and the type has carried `avgCtr` and `avgCpm` all along.

### The invariant is now stated in the code

Per the instruction, and in those terms, above `applyHookAggregateWithdrawal` in
`aggregateDelta.ts`, with a pointer to it from `applyLearningWrites.ts`:

> **EVERY counter or average the withdrawal changes MUST be one the addition changes,
> in the SAME BRANCH, by the inverse amount.**

It names both directions of breach and why each is silent — the downward kind floors
at zero and reads as "no data"; the upward kind inflates on every sync because
withdraw-then-add is the modal path — and it tells the next author to add a **cycle
test** when adding a field to either side. `S10` asserts the invariant is present at
both withdrawal sites, so it cannot be tidied away.

---

## Before — identical test file, pre-fix source

```
  ❌ S1: adding a visual contribution increments sampleSize, byGeoTier and byAudienceType
     sampleSize must increment; got 0
  ✅ S2: withdrawing that contribution returns all three to their prior values
  ❌ S3: cycling a visual creative through withdraw-then-add 5x leaves all three unchanged
     two rows must give sampleSize 2; got 0
  ✅ S4: no visual counter can go negative when a withdrawal exceeds what was added
  ❌ S5: the visual withdrawal decrements bestVerdictCount and worstVerdictCount
     withdrawing a 🟢 must decrement bestVerdictCount; got 1
  ❌ S6: cycling a 🟢 visual creative 5x does not inflate bestVerdictCount
     one winning creative is one win after five syncs; got 6
  ❌ S7: the HOOK byFunnelType withdrawal fires only in the branch the addition fired in
     a non-conversion withdrawal must not decrement a bucket it never incremented; got 0
  ❌ S8: the HOOK byFunnelType survives five withdraw-then-add cycles of a non-conversion row
     the conversion row's single contribution must stand; got 0
  ❌ S9: visual byGeoTier and byAudienceType maintain avgCtr and avgCpm, and withdraw them
     tier avgCtr; got 0
  ❌ S10: the add/withdraw invariant is stated at both withdrawal sites
     aggregateDelta.ts must state the invariant

=== add/withdraw symmetry across every pair (Batch 29) ===
Passed: 2, Failed: 8
EXIT=1
```

**S6's `6` and S8's `0` are the two findings that matter** — an inflating win count on
a read surface, and a funnel bucket driven to zero underneath FR-041.

**S2 and S4 passing is not reassurance.** S2 asserts three counters return to zero and
S4 that none goes negative; every counter involved was already pinned at zero, so both
passed for the wrong reason. They are kept because they stop being vacuous once S1
lands, and they are exactly the shape of assertion that lets a broken field look fine.

## After

```
  ✅ S1: adding a visual contribution increments sampleSize, byGeoTier and byAudienceType
  ✅ S2: withdrawing that contribution returns all three to their prior values
  ✅ S3: cycling a visual creative through withdraw-then-add 5x leaves all three unchanged
  ✅ S4: no visual counter can go negative when a withdrawal exceeds what was added
  ✅ S5: the visual withdrawal decrements bestVerdictCount and worstVerdictCount
  ✅ S6: cycling a 🟢 visual creative 5x does not inflate bestVerdictCount
  ✅ S7: the HOOK byFunnelType withdrawal fires only in the branch the addition fired in
  ✅ S8: the HOOK byFunnelType survives five withdraw-then-add cycles of a non-conversion row
  ✅ S9: visual byGeoTier and byAudienceType maintain avgCtr and avgCpm, and withdraw them
  ✅ S10: the add/withdraw invariant is stated at both withdrawal sites

=== add/withdraw symmetry across every pair (Batch 29) ===
Passed: 10, Failed: 0
EXIT=0
```

Batch 28 re-run against the Batch 29 source, unregressed:

```
=== FR-021 withdrawal arithmetic (Batch 28, Fix A) ===
Passed: 7, Failed: 0

=== FR-036 distinct-creative count across syncs (Batch 28, Fix B) ===
Passed: 7, Failed: 0
```

---

## Found while auditing, NOT fixed — for the owner to rule on

**`creativeCount` is read on visual aggregates and never written.**

This is not an add/withdraw asymmetry — it is a field read on one side and absent on
the other — so it sits outside this batch's instruction. But it was found by the same
walk and has a concrete consequence:

- `VisualPerformanceAggregate` (`learningAggregates.ts:190-205`) declares **no**
  `creativeCount`. `emptyVisual` does not set it, `cloneVisual` does not carry it, and
  `applyVisualAggregatesDelta` never populates it. Batch 28's `contributedCreativeKeys`
  was added to the **hook** aggregate only.
- `whatsWorkingDashboard.ts:787` reads `sampleSize: v.creativeCount ?? 0` for every
  visual row, and feeds that to `pickHotAngle` (`:789`), which filters
  `sampleSize >= HOOK_ICON_DATA_GATE` (`= 3`, `:88`).
- Therefore `visualHotKey` is **always `null`**: no visual pattern can ever receive the
  🔥 icon, whatever its evidence.

This is T029b's visual half, which the scope audit recorded as done on the strength of
the hook half. The fix is a schema addition mirroring Batch 28 onto the visual
aggregate — a design decision plus a persisted-shape change, which is the owner's call
rather than an implementer's, exactly as the visual counter asymmetry was.

---

## The squash message

**Unchanged, and checked rather than assumed.** Batch 29 corrects internal arithmetic;
it does not add or remove a capability, so nothing the message claims or disclaims
moves. The three absences it lists — the accrual and efficiency figure, funnel-type
weighting, and the creative-counted retrieval path — are all still exactly as stated.

The visual `creativeCount` gap above is **not** added to it: it is a defect in shipped
behaviour, not an absence of scope, and it is unresolved rather than knowingly
deferred. It belongs in the owner's decision queue, not in `main`'s history.

---

## Verification

### `git diff --stat HEAD~1`

```
 functions/package.json                             |   3 +-
 .../__tests__/phase969/addWithdrawSymmetry.test.ts | 264 ++++++++++++++++++
 functions/src/learning/aggregateDelta.ts           |  71 ++++-
 functions/src/learning/applyLearningWrites.ts      |  48 +++-
 .../reports/batch-29-969-report.md                 | 304 +++++++++++++++++++++
 5 files changed, 682 insertions(+), 8 deletions(-)
```

### `git status --short`

```
?? specs/009-billing-plan-access/contracts/stripe-webhooks.md
```

### `npm test` — full chain, clean `lib/`

```
Totals across the chain: 23 node:test suites, 424 assertions passed, 0 failed.
Plus the bespoke harnesses, including all three phase-969 suites added by Batches 28-29:

=== FR-021 withdrawal arithmetic (Batch 28, Fix A) ===
Passed: 7, Failed: 0

=== FR-036 distinct-creative count across syncs (Batch 28, Fix B) ===
Passed: 7, Failed: 0

=== add/withdraw symmetry across every pair (Batch 29) ===
Passed: 10, Failed: 0
```

Raw tail:

```


═══ Phase 16 — Creative Modes & Art Direction QA ═══
  ✅ 10 solo modes ✓
  ✅ 10 approved pairs ✓
  ✅ 4 carousel-specific ✓
  ✅ 3 batch-specific ✓
  ✅ 2 retargeting-specific ✓
  ✅ self-correction ✓
  ✅ 4 blocked combinations ✓
  ✅ 8 adapt states ✓
  ✅ audit: 8/8 strings free of cultural-compliance trigger words ✓

═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══

contractFixtures.test: PASS
EXIT=0
```

---

**Not merged — the owner merges through the GitHub UI. Phases 4, 5 and 6 not started.**
