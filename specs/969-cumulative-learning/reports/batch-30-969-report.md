# Batch 30 — `creativeCount` on the visual aggregate

**Branch**: `969-cumulative-learning` · **PR #71**
**Date**: 2026-09-12
**Scope**: the visual `creativeCount` gap the Batch 29 pair audit surfaced.
**Phases 4, 5 and 6 not started.**
**Path** (from `pwd`): `/d/proads-worktrees/969-cumulative-learning`

---

## Result

| | Before | After |
|---|---|---|
| `visualCreativeCount.test.ts` | **1 passed, 9 failed** | **10 passed, 0 failed** |

The single "before" pass is **V10** — *55 rows of one creative must NOT clear the
gate* — and it passed **vacuously**, because the value was `0` for every input.
Third batch running, a test has passed for the wrong reason before the fix and the
right one after; it is called out here for the same reason it was in Batches 28 and
29, so the "before" column is never mistaken for partial correctness.

Batches 28 and 29 re-run unregressed: **7/7**, **7/7**, **10/10**.

---

## The defect

`creativeCount` was **read** on visual aggregates and **never written**.

- `VisualPerformanceAggregate` (`learningAggregates.ts:190`) declared no such field.
  Batch 28's `contributedCreativeKeys` went to the **hook** aggregate only.
- `whatsWorkingDashboard.ts:787` builds every visual row as
  `sampleSize: v.creativeCount ?? 0` and passes the result to `pickHotAngle`
  (`:789`), which filters `sampleSize >= HOOK_ICON_DATA_GATE` (`= 3`, `:88`).
- So `visualHotKey` was **always `null`**, and no visual pattern could receive the
  🔥 icon whatever its evidence.

This is T029b's visual half. The scope audit recorded T029b as shipped on the
strength of the hook half, which is exactly the kind of half-landing that a
`?? 0` fallback makes invisible: the dashboard did not error, it just never awarded
an icon.

---

## What changed

The visual aggregate now carries the same two fields as the hook aggregate, with the
same lifecycle and the same derivation rule:

| | Hook (Batch 28) | Visual (this batch) |
|---|---|---|
| Persisted key list | `contributedCreativeKeys?: string[]` | same |
| Count | `creativeCount` **derived** from the set's size | same |
| Hydrated on read by | `cloneHook` | `cloneVisual` |
| Stripped to the array on write by | `applyHookAggregatesDelta` | `applyVisualAggregatesDelta` |
| Key dropped on withdrawal by | `applyHookAggregateWithdrawal` | `applyVisualAggregateWithdrawal` |

Three points worth stating rather than leaving to be re-derived:

**The creative key was being discarded by the visual loop.**
`for (const [, rows] of groups)` threw away the key `groupAdsByCreative` had just
computed. It is now `for (const [creativeKey, rows] of groups)`.

**One creative counts once per PATTERN, not once overall.** A creative contributing
to two patterns counts once in each, because the patterns are separate records and
the question each answers is *"how many creatives back this pattern"*. V8 asserts it.

**Persisted rather than reconstructed on read**, for the same reason as the hook:
reconstruction would mean re-reading every ad row for the account on every sync —
the unbounded scan FR-068 removed in this same feature. The bound is distinct
creatives per pattern, not rows and not syncs. The rationale is in the field's doc
comment.

**No migration.** `creativeCount` is new in Phase 969 on both aggregates, so no
production record carries either field and "absent ⇒ empty set" is correct rather
than lossy — verified for the hook in Batch 28 by
`git show origin/main:functions/src/learningAggregates.ts`, and the visual field is
new in this batch.

The withdrawal carries the **ADD/WITHDRAW INVARIANT** comment Batch 29 introduced,
naming this field as one more pair that must agree in both directions.

---

## Before — field declared, nothing populating it

The test cannot compile against a type without the field, so the declaration was
added first and the **population logic** — which is the actual fix — second. The
"before" column below is a clean build with the field present and unwritten, which
is precisely the state the dashboard was reading.

```
  ❌ V1: a visual aggregate carries creativeCount after a sync — got 0
  ❌ V2: 55 rows of one creative in one pattern report creativeCount 1, not 55 — got 0
  ❌ V3: the same creative across a persist-and-reload boundary counts ONCE — got 0
  ❌ V4: four creatives cycling for five syncs stay at creativeCount 4
     got [0, 0, 0, 0, 0, 0]
  ❌ V5: withdrawing a creative's only contribution decrements visual creativeCount
     undefined !== 2
  ❌ V6: withdraw-then-add of one visual creative is net zero — undefined !== 1
  ❌ V7: a creative missing from a later sync keeps its count — got 0
  ❌ V8: a creative contributing to two patterns counts once in each — got undefined
  ❌ V9: three distinct creatives clear HOOK_ICON_DATA_GATE, so a visual pattern can get 🔥
     three creatives must clear the icon gate of 3; got 0
     (before this batch it was always 0, so visualHotKey was always null)
  ✅ V10: 55 rows of ONE creative do NOT clear the gate — fan-out cannot manufacture evidence

=== FR-036 on the visual aggregate (Batch 30) ===
Passed: 1, Failed: 9
EXIT=1
```

## After

```
  ✅ V1: a visual aggregate carries creativeCount after a sync
  ✅ V2: 55 rows of one creative in one pattern report creativeCount 1, not 55
  ✅ V3: the same creative across a persist-and-reload boundary counts ONCE
  ✅ V4: four creatives cycling for five syncs stay at creativeCount 4
  ✅ V5: withdrawing a creative's only contribution decrements visual creativeCount
  ✅ V6: withdraw-then-add of one visual creative is net zero
  ✅ V7: a creative missing from a later sync keeps its count
  ✅ V8: a creative contributing to two patterns counts once in each, not once overall
  ✅ V9: three distinct creatives clear HOOK_ICON_DATA_GATE, so a visual pattern can get 🔥
  ✅ V10: 55 rows of ONE creative do NOT clear the gate — fan-out cannot manufacture evidence

=== FR-036 on the visual aggregate (Batch 30) ===
Passed: 10, Failed: 0
EXIT=0
```

**V9 and V10 are a pair and only mean something together.** V9 asserts the gate can
now open; V10 asserts fan-out still cannot open it. A fix that made `creativeCount`
count rows would pass V9 and fail V10 — which is the exact regression Amendment 1
exists to prevent.

Batches 28 and 29, re-run against this source:

```
=== FR-021 withdrawal arithmetic (Batch 28, Fix A) ===              Passed: 7,  Failed: 0
=== FR-036 distinct-creative count across syncs (Batch 28, Fix B) === Passed: 7,  Failed: 0
=== add/withdraw symmetry across every pair (Batch 29) ===           Passed: 10, Failed: 0
```

---

## One owner-visible consequence, stated plainly

Visual patterns on the "What's Working" dashboard **can now receive the 🔥 icon**,
once three distinct creatives back one pattern. Before this batch none ever could.
No string changed and no new string was added — the icon and its gate already
existed; the number they depend on did not.

---

## The squash message

**Checked, unchanged.** Batch 30 populates a field that was already declared,
already read and already gated. It adds no capability and removes none, so none of
the three absences the message lists moves.

---

## Verification

### `git diff --stat HEAD~1`

```
 functions/package.json                             |   3 +-
 .../__tests__/phase969/visualCreativeCount.test.ts | 198 +++++++++++++++++++++
 functions/src/learning/aggregateDelta.ts           |  54 +++++-
 functions/src/learning/applyLearningWrites.ts      |  12 ++
 functions/src/learningAggregates.ts                |  20 +++
 .../reports/batch-30-969-report.md                 | 189 ++++++++++++++++++++
 6 files changed, 470 insertions(+), 6 deletions(-)
```

### `git status --short`

```
?? specs/009-billing-plan-access/contracts/stripe-webhooks.md
```

### `npm test` — full chain, clean `lib/`

```
Totals across the chain: 23 node:test suites, 424 assertions passed, 0 failed.
Plus the bespoke harnesses, including all four phase-969 suites added by Batches 28-30:

=== FR-021 withdrawal arithmetic (Batch 28, Fix A) ===
Passed: 7, Failed: 0

=== FR-036 distinct-creative count across syncs (Batch 28, Fix B) ===
Passed: 7, Failed: 0

=== add/withdraw symmetry across every pair (Batch 29) ===
Passed: 10, Failed: 0

=== FR-036 on the visual aggregate (Batch 30) ===
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
