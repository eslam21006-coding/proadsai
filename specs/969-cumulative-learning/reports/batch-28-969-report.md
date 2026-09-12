# Batch 28 — the two nightly defects, fixed

**Branch**: `969-cumulative-learning` · **PR #71**: open, not merged
**Date**: 2026-09-12
**Scope**: Fix A (FR-021 withdrawal arithmetic), Fix B (FR-036 distinct-creative
count), Fix C (the squash message), plus the three load-bearing stale citations.
**Not merged. Phases 4, 5 and 6 not started.**
**Path** (from `pwd`): `/d/proads-worktrees/969-cumulative-learning`

---

## Result

Both merge-blocking defects are fixed, each with a test that **fails against the
pre-fix code and passes against the post-fix code** — verified by running the
*identical* test files against both, not by reasoning about them.

| | Before | After |
|---|---|---|
| Fix A — `withdrawalAverage.test.ts` | **0 passed, 7 failed** | **7 passed, 0 failed** |
| Fix B — `creativeCountPersistence.test.ts` | **1 passed, 6 failed** | **7 passed, 0 failed** |

The one test that passed before the fix is the one that should have: **B6**, which
asserts 55 rows of one creative contribute `creativeCount` 1. Row multiplicity was
always closed; repeated observation across syncs was not. That single green line in
the "before" column is the audit's blast-radius claim reproducing itself.

---

## Fix A — the withdrawal average (FR-021)

### What changed

`applyHookAggregateWithdrawal` (`functions/src/learning/aggregateDelta.ts`) now
withdraws the **average** as well as the count, using the withdrawn row's own
recorded value — the value that was already being passed in and ignored:

```ts
function withdrawAvg(avg: number, count: number, value: number): number {
    if (count <= 1) return 0;
    return round2((avg * count - value) / (count - 1));
}
```

Four averages on the hook aggregate now withdraw, each computed from the count
**before** its decrement:

| Average | Withdrawn with |
|---|---|
| `byObjective.conversion.avgLinkCtr` | `ad.ctrLink` |
| `byObjective.other.avgLinkCtr` | `ad.ctrLink` |
| `byGeoTier[tier].avgCtr` | `ad.ctrLink` |
| `byAudienceType[aud].avgCtr` | `ad.ctrLink` |

And on the visual aggregate (`applyVisualAggregateWithdrawal`,
`functions/src/learning/applyLearningWrites.ts`), **both** averages
`applyAdToVisual` maintains — they are averaged together on the way in, so they
have to come back out together or the pair diverges:

| Average | Withdrawn with |
|---|---|
| `byObjective.conversion.avgLinkCtr` | `ad.ctrLink` |
| `byObjective.conversion.avgCpm` | `ad.cpm3d` |

**The `n − 1 == 0` guard resets to zero** rather than dividing. Returning 0 rather
than the prior mean is what makes a full withdraw-then-re-add round-trip land back
on the original value — A2 asserts both the reset and that the result is finite.

**The comment at `aggregateDelta.ts:271-275` is deleted.** It claimed the average
"cannot be re-derived exactly from count alone" — true as stated, and irrelevant,
because the withdrawal never had only the count: `applyLearningWrites.ts:237` hands
it `ctrLink: withdraw.contributedValues.ctrLink` from the ledger. That comment is
what made this read as a considered trade-off through twenty-seven batches of
review, so **A7 asserts the sentence does not come back.** A structural guard is
worth its cost here precisely because the failure mode was a plausible-sounding
excuse, not a bug in logic.

`applyVisualAggregateWithdrawal` was module-private and is now exported, purely so
a test can drive it. The pre-existing TODO to lift it into `aggregateDelta.ts`
still stands; `withdrawAvgLocal` is deliberately a small duplicate so both move
together when that happens.

### Before — identical test file, pre-fix source

```
  ❌ A1: withdrawing a row off the mean gives exactly (M*n - A)/(n-1)
     avgLinkCtr must be (M*n - A)/(n-1) = 0.01, got 0.03
  ❌ A2: withdrawing the only contribution resets the average to 0, never NaN/Infinity
     must reset, not divide by zero — 0.05 !== 0
  ❌ A3: cycling one ad through withdraw-then-add 5x at a stable value leaves the average unchanged
     true average is 0.0300 and must never move; got [0.05, 0.06, 0.07, 0.08, 0.08]
  ❌ A4: byGeoTier and byAudienceType averages are withdrawn, not left standing
     tier avgCtr must be 0.01, got 0.05
  ❌ A5: the `other` objective bucket's average withdraws symmetrically
     0.05 !== 0.02
  ❌ A6: applyVisualAggregateWithdrawal withdraws both avgLinkCtr and avgCpm
     0.05 !== 0.01
  ❌ A7: the 'cannot be re-derived exactly from count alone' deferral comment is deleted
     the FR-021 deferral comment must not return — the withdrawn value IS passed in

=== FR-021 withdrawal arithmetic (Batch 28, Fix A) ===
Passed: 0, Failed: 7
EXIT=1
```

`A3`'s `[0.05, 0.06, 0.07, 0.08, 0.08]` is the drift, reproduced exactly: each step
is `M + (A − M)/n` (0.03 + 0.06/4 = 0.045 → 0.05; 0.05 + 0.04/4 = 0.06; 0.06 +
0.03/4 = 0.0675 → 0.07), converging on the cycling ad's own 0.09 and pinning at
0.08 once `round2` swallows the remaining step. The true average is 0.0300 and
should never move.

### After

```
  ✅ A1: withdrawing a row off the mean gives exactly (M*n - A)/(n-1)
  ✅ A2: withdrawing the only contribution resets the average to 0, never NaN/Infinity
  ✅ A3: cycling one ad through withdraw-then-add 5x at a stable value leaves the average unchanged
  ✅ A4: byGeoTier and byAudienceType averages are withdrawn, not left standing
  ✅ A5: the `other` objective bucket's average withdraws symmetrically
  ✅ A6: applyVisualAggregateWithdrawal withdraws both avgLinkCtr and avgCpm
  ✅ A7: the 'cannot be re-derived exactly from count alone' deferral comment is deleted

=== FR-021 withdrawal arithmetic (Batch 28, Fix A) ===
Passed: 7, Failed: 0
EXIT=0
```

### One honest note about the "before" run

The first before-run of A6 failed with `Cannot read properties of undefined` rather
than a wrong number — a defect in **my fixture**, not in the code: a non-empty
`patternKey` needs `layoutTemplate`, `artDirection` **and** `universe` all non-null
(`computePatternKeyLocal`, `aggregateDelta.ts:386-396`), and mine left two null, so
the visual aggregator skipped the row and produced an empty map. The fixture was
corrected and **both columns above were then re-run from the same corrected test
files** — the before-run by reverting the three source files to `HEAD`, rebuilding,
running, then restoring. The before/after pair is therefore a comparison of source
versions only, with the tests held constant.

---

## Fix B — `creativeCount` counts creatives, not observations (FR-036)

### What changed

The dedup set now **survives the sync**. `HookPerformanceAggregate` gains
`contributedCreativeKeys?: string[]`; `creativeCount` is **derived from its length**
rather than incremented independently, so the two cannot disagree:

- `cloneHook` hydrates the working `Set` from `a.contributedCreativeKeys ?? []`
  (previously `new Set()`, unconditionally).
- The strip step in `applyHookAggregatesDelta` writes
  `contributedCreativeKeys: [...contributedCreatives]` and
  `creativeCount: contributedCreatives.size`.
- `applyHookAggregateWithdrawal` deletes the withdrawn creative's key and
  re-derives the count.

### The choice, stated in the code rather than only here

**Persisted, not reconstructed on read.** Reconstructing the set from the per-row
ledger entries would mean reading every ad row for the account on every sync —
precisely the unbounded collection scan FR-068 removed in this same feature.
Persisting is bounded by **distinct creatives per angle** — not rows, not syncs —
which is the smallest quantity that can answer the question. That rationale is now
the doc comment on the field in `learningAggregates.ts`, not only a line in a
report, per the instruction.

**No migration is required, and none is possible to need.** `creativeCount` is new
in Phase 969 on both producers — `git show origin/main:functions/src/learningAggregates.ts`
and `...:functions/src/patternSummaries.ts` contain no occurrence of it. No
production record carries the field, so "absent ⇒ empty set" is correct rather than
lossy.

**Withdrawal removes the key.** When only *some* of a creative's rows are
withdrawn, the additive pass that always follows the withdrawals in
`applyLearningWrites` re-adds the key from the surviving rows — so the removal is
self-correcting within the sync, and a creative is left uncounted only when nothing
of it contributes any more. B5 asserts the round-trip is net zero; B4 asserts a
`withdraw_only` does decrement.

**The deferral note at `:379-387` is deleted** — the follow-up batch it deferred to
is this one. B7 asserts it does not return.

### Why no earlier test could have caught it, and what the new test must cross

The defect lives **only across a persist-and-reload boundary**. Within a single
`applyHookAggregatesDelta` call the `Set` is live and dedupes correctly, which is
why `learningAccumulation.test.ts`'s SC-008 case passes before and after this fix.
Every test in the new file therefore round-trips the aggregate through
`JSON.parse(JSON.stringify(...))` — which is what Firestore serialisation does to
it, and is exactly where a `Set` field vanished — before feeding it back in. That
requirement is written into the file's header so a future test of this behaviour
cannot quietly skip it.

### Before — identical test file, pre-fix source

```
  ❌ B1: the same creative across a persist-and-reload boundary counts ONCE, not twice
     the same creative seen again is not a second creative (FR-036); got 2
  ❌ B2: four creatives cycling for five syncs stay at creativeCount 4, not 16 or 20
     four creatives are four creatives however many nights pass; got [4, 8, 12, 16, 20, 24]
  ❌ B3: a creative missing from a later sync KEEPS its count — absence is not evidence
     got 3 — a narrower sync must not shrink the count
  ❌ B4: withdrawing a creative's only contribution decrements creativeCount
     a withdrawn creative stops being counted; got 2
  ❌ B5: withdraw-then-add of the same creative leaves creativeCount unchanged
     mid-cycle the creative is out — 2 !== 1
  ✅ B6: 55 rows of one creative still contribute creativeCount 1 (T021a unregressed)
  ❌ B7: the 'defer to the follow-up batch' note on contributedCreatives is deleted

=== FR-036 distinct-creative count across syncs (Batch 28, Fix B) ===
Passed: 1, Failed: 6
EXIT=1
```

`B2`'s `[4, 8, 12, 16, 20, 24]` is the inflation: +4 per sync for four creatives,
unbounded and linear in elapsed nights. `B3` shows it is not confined to the
all-cycle case — a **narrower** sync containing one of two creatives reported 3.

### After

```
  ✅ B1: the same creative across a persist-and-reload boundary counts ONCE, not twice
  ✅ B2: four creatives cycling for five syncs stay at creativeCount 4, not 16 or 20
  ✅ B3: a creative missing from a later sync KEEPS its count — absence is not evidence
  ✅ B4: withdrawing a creative's only contribution decrements creativeCount
  ✅ B5: withdraw-then-add of the same creative leaves creativeCount unchanged
  ✅ B6: 55 rows of one creative still contribute creativeCount 1 (T021a unregressed)
  ✅ B7: the 'defer to the follow-up batch' note on contributedCreatives is deleted

=== FR-036 distinct-creative count across syncs (Batch 28, Fix B) ===
Passed: 7, Failed: 0
EXIT=0
```

### `PatternSummary.creativeCount` — confirmed unaffected, and left alone

Re-verified rather than assumed. `patternSummaries.ts:463` sets
`creativeCount: b.creativeHashes.size` from a `Set` built **fresh in memory** per
`summarizeAccount` call (`:438`), never persisted and never carried across calls. It
is correct as written, it is a **different field on a different type from a
different producer**, and it is what `rankingEngine.ts:179` and `:406` read. **FR-034a's
floor of 3 in the ranking engine was never affected by this bug and is not affected
by this fix.** Not touched.

The affected consumers — all reading `HookPerformanceAggregate.creativeCount` — are
`ragContext.ts:167` (FR-034's activation gate of 10) and
`whatsWorkingDashboard.ts:585`, `:787`, `:996`, `:1001`, `:1021`.

---

## Fix C — the squash commit message

`reports/squash-commit-message.txt` now states three absences rather than one. The
existing "Not in this change" paragraph was kept and extended, per instruction:

- the per-day accrual and write-once efficiency figure (unchanged from the prior
  draft), now with the consequence spelled out — **no cost or conversion-efficiency
  signal reaches generation**, because a contribution carries click-through,
  cost-per-thousand and the verdict mark, and only click-through is ranked on;
- **funnel-type weighting** (FR-030, FR-031, FR-032a) — the breakdown and the
  multi-funnel indication ship, the weighting does not;
- **the creative-counted retrieval path** (FR-033, FR-034a's floor in
  `getTopWinners`, FR-035's activation latch) — `getTopWinners.ts` is untouched and
  still selects per ad row.

---

## The three load-bearing stale citations

Corrected in place in `spec.md`, where an implementer meets them:

| Requirement | Was | Now |
|---|---|---|
| FR-072a | `shared.ts:864-869` (precedence lock) | `learning/fieldLevelDiscrimination.ts:168-176`, with the original noted as where it stood when written |
| FR-074f | `whatsWorkingDashboard.ts:719` ("needs linking") | `:853`; the three `matchType` sites re-cited as `:497`, `:696`, `:853` — **verified by grep**, not assumed |
| FR-074f evidence, FR-075, and the eligibility paragraph (4 passages) | `isEligibleForLearning`, `learningAggregates.ts:119-124` | **deleted in Batch 11**; the logic is now the private `isAdEligible` at `aggregateDelta.ts:302-306` |

Also corrected: `spec.md:250` said the `learningAggregates.ts:17` header rule *"is
still live in the code"*. T019 deleted it during implementation; the paragraph is
kept, because it records *why* the rule went, with the status updated.

A new section **"Note: Citations Into Rewritten Files Are Historical"** sits
immediately before the by-design note, stating that citations into `shared.ts`,
`learningAggregates.ts` and `whatsWorkingDashboard.ts` were verified against
`origin/main` before implementation and are historical unless stated otherwise, and
that the other 25 are deliberately **not** re-cited. Spec id integrity re-checked
after the edits: **123 FR ids, 56 SC ids, zero duplicate definitions** — unchanged.

---

## Found while implementing, NOT fixed — for the owner to rule on

Scope was Fix A (averages) and Fix B (the counter). While editing those two
functions, two further **count** asymmetries were found in
`applyVisualAggregateWithdrawal`. Both are pre-existing, neither is introduced or
worsened here, and both are left alone because either direction of fix changes
stored values in a way that is the owner's call, not the implementer's:

1. **`sampleSize`** — the visual withdrawal decrements it (`applyLearningWrites.ts:87`)
   but `applyAdToVisual` never increments it. The counter can only travel downward,
   floored at 0.
2. **`byGeoTier[tier].count` and `byAudienceType[aud].count`** — the visual
   withdrawal decrements both, and `applyAdToVisual` touches neither.

Two directions exist for each — make the addition increment, or make the withdrawal
stop decrementing — and they are not equivalent: the first makes the field mean
something, the second freezes it at its current meaningless value. This is the same
class of defect as Fix A (withdrawal not symmetric with addition), which is why it
surfaced here, but it is about counts rather than averages and was outside the
instruction.

---

## Verification

### `git diff --stat HEAD~1`

```
 functions/package.json                             |   4 +-
 .../phase969/creativeCountPersistence.test.ts      | 214 +++++++++++++
 .../__tests__/phase969/withdrawalAverage.test.ts   | 231 ++++++++++++++
 functions/src/learning/aggregateDelta.ts           | 111 +++++--
 functions/src/learning/applyLearningWrites.ts      |  26 +-
 functions/src/learningAggregates.ts                |  24 ++
 .../reports/batch-28-969-report.md                 | 349 +++++++++++++++++++++
 .../reports/squash-commit-message.txt              |  23 +-
 specs/969-cumulative-learning/spec.md              |  34 +-
 9 files changed, 979 insertions(+), 37 deletions(-)
```

### `git status --short`

```
?? specs/009-billing-plan-access/contracts/stripe-webhooks.md
```

### `npm test` — full chain, clean `lib/`

```
Totals across the chain: 23 node:test suites, 424 assertions passed, 0 failed.
Plus the bespoke harnesses, including the two added by this batch:

=== FR-021 withdrawal arithmetic (Batch 28, Fix A) ===
Passed: 7, Failed: 0

=== FR-036 distinct-creative count across syncs (Batch 28, Fix B) ===
Passed: 7, Failed: 0
```

Raw tail:

```
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=9:16
📋 Render contract warnings: High-priority zone "headline" (priority 2) not referenced in build plan. | High-priority zone "hero" (priority 1) not referenced in build plan.
🛑 Deprecated REFLOW path invoked — use reflowImage callable (FR-026).
  ✅ HFF.6.l: deprecated REFLOW path returns typed error (REFLOW_DEPRECATED) — FR-026
  ✅ HFF.6.m: generation doc structure preserved (favoriteId, no new generation created)
  ✅ HFF.6.n: reflow-of-reflow uses original buildPlan (not derived)
  ✅ HFF.6.o: rerenderFromPlan calls generator with extracted plan + overridden ratio
═══ HFF — All aspect ratio reflow fixtures passed ═══


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

## What this does and does not change about the merge decision

Both merge blockers named in the review are closed, and Fix C goes with them. The
owner's ruling that T056's Arabic review is **not** a blocker — reviewed and
approved in conversation, adjustable from `main` in one line — is recorded here so
the next reader does not re-raise it.

What remains in the branch is now **absence**: Amendment 2 unbuilt, funnel weighting
unbuilt, the retrieval path still row-counted, Phase 7's observability unbuilt. The
squash message says so in those terms. Nothing in the branch now does the wrong
thing nightly.

**Not merged. Phase 4, 5 and 6 not started.**
