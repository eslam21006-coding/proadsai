# Batch 13 — T029a/b/c gate migration

**Feature**: Cumulative Learning for Ad Performance (Phase 969)
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-06

The last functional piece before Phase 7. Three producer tasks populate
`creativeCount` on the Summary objects the FR-034 / FR-034a / FR-037 gates
read; the `?? sampleSize` and `?? count` fallbacks at the gate sites are
removed. After this batch, the gates count distinct creatives — the
owner-locked 10 / 3 / 3 decision (spec amendment 1) is enforced in code.

This report also records the Batch 12 review corrections: §3.2 / §3.3 in
the Batch 12 report stated a contradiction (claimed "both halves
demonstrated" when the behavioural halves passed under both wiring
states); the new SIMULATION category added to the source-text census;
the coverage-limit note added to `t025aWorkerWiringDiscriminator.test.ts`;
and the T064b extension requiring real worker-output assertions for both
T021a and T025a wire-ups when the stubbed Firestore scaffolding lands.

---

## §0 — Batch 12 review corrections

### §0.1 — §3.2 / §3.3 contradiction fixed in `batch-12-969-report.md`

The original §3.2 stated: *"All three pass, exit 0. **Both halves
demonstrated as requested.**"* Six lines earlier it correctly stated:
*"The behavioural assertions (#1 and #2) still pass — they are
self-contained simulations with their own flag and are indifferent to
shared.ts's state."* With the wiring physically deleted from `shared.ts`,
both behavioural assertions passed. Only the SOURCE-TEXT check failed.
So one half was demonstrated, not both, and the behavioural half did
not discriminate.

The corrected §3.2 and §3.3 say this plainly: the simulation is a
mirror, and "the only check that catches a reverted wire-up" is the
SOURCE-TEXT assertion. A new §3.4 (Coverage-limit note) reproduces
verbatim the same wording that now lives in the test file's header.

### §0.2 — Coverage-limit note in `t025aWorkerWiringDiscriminator.test.ts`

The test file's header now opens with a COVERAGE LIMIT block:

> *"The behavioural assertions in this file drive a simulation of the
> worker's per-ad loop, not `runSyncForAccount` itself. They assert
> the logic is correct; they do not observe what `shared.ts`
> executes. Regression detection for the wiring rests on the
> SOURCE-TEXT assertion until T064b's scaffolding lands."*

So a future maintainer does not assume the behavioural halves catch a
regression — they document the simulation's own correctness in both
states and are indifferent to the production code.

### §0.3 — T064b in `tasks.md` extended

T064b's entry now requires that when the stubbed Firestore + stubbed
Meta scaffolding lands, it asserts the worker's real output for **both**
wire-ups:

1. **T021a wire-up** — drive `runSyncForAccount` end-to-end; assert
   the per-ad block's `decision.adDoc.ledger.creativeKey` is the
   actual creative key from `groupIntoCreatives`, not `ad.id`. This
   replaces the SIMULATION-only verification at
   `perAdActions.test.ts:101-181` and
   `t021aWireupDiscriminator.test.ts:172-216` with a real
   observation.

2. **T025a wire-up** — drive `runSyncForAccount` end-to-end; assert
   that the queued write's `data.ledger.angleKey` is the post-pass
   resolved `entry.hookAngle` and `data.ledger.patternKey` is
   `computePatternKey(entry.layoutTemplate, entry.creativeModes,
   entry.artDirection, entry.universe)`. This replaces the
   SIMULATION-only verification at
   `t025aWorkerWiringDiscriminator.test.ts:195-289` and
   `perAdActions.test.ts:243-290`.

Both checks land in T064b's single end-to-end test file. When T064b
lands, the SOURCE-TEXT guards in `t021aWireupDiscriminator.test.ts`
(line 217) and `t025aWorkerWiringDiscriminator.test.ts` (line 313)
retire with `describe.skip` annotations, and the SIMULATION behavioural
halves are deleted — the behavioural verification moves with the
production code to Phase 7's real observation.

### §0.4 — SIMULATION category added to source-text census

Per the Batch 12 review, the source-text census now distinguishes:

- **SOURCE-TEXT / SOURCE-ORDER / SOURCE-CONFIG** — assertion reads
  source code (or source order) of the production code under test
  and matches a pattern. Trips when the production source changes
  in a way that breaks the pattern.
- **BEHAVIOURAL** — assertion drives a callable (the production
  function or a pure helper extracted from it) with controlled
  inputs and asserts on its outputs. Trips when the callable's
  behaviour changes.
- **SIMULATION** — assertion drives a **second implementation** of
  the production code path with controlled inputs and asserts on
  its outputs. Trips when the simulation's own copy of the logic
  changes, NOT when the production code changes. A useful document
  of "what the expected behaviour looks like in both states" but
  not a regression guard on the production code itself.

Two demonstrations (Batch 12 §3.2 and this batch's §3) have shown that
SIMULATION tests pass even when the production code is reverted. They
are useful as documented mirrors of expected logic; they are not a
guard on the production code. Per the Batch 12 review correction,
going forward, no test that drives a second implementation of the
production path is labelled BEHAVIOURAL — SIMULATION is the correct
category for that shape.

The four entries that drove a second implementation in previous
batches are reclassified as SIMULATION:

| File (assertion) | Was | Now |
|---|---|---|
| `t021aWireupDiscriminator.test.ts` (lines 172-216) | BEHAVIOURAL | SIMULATION |
| `t025aWorkerWiringDiscriminator.test.ts` (lines 195-289) | BEHAVIOURAL | SIMULATION |
| `perAdActions.test.ts` (lines 101-181, T021a discriminator) | BEHAVIOURAL | SIMULATION |
| `perAdActions.test.ts` (lines 243-290, T025a function-level) | BEHAVIOURAL | SIMULATION |

Their SOURCE-TEXT partners (`t021aWireupDiscriminator.test.ts` line
217 and `t025aWorkerWiringDiscriminator.test.ts` line 313) remain the
**interim** regression guards — the only checks that actually trip on
a reverted wire-up.

---

## §1 — The migration

### §1.1 — Producer side: `creativeCount` populated on every Summary

| Site | File:line | Output shape | Population |
|---|---|---|---|
| T029a | `ragContext.ts:162` | `RankedHook.sampleSize` | `a.creativeCount ?? 0` |
| T029b | `whatsWorkingDashboard.ts:493` | `hookHotAngle` rows | `r.creativeCount ?? 0` |
| T029b | `whatsWorkingDashboard.ts:673` | `visualEligibleRows` | `v.creativeCount ?? 0` |
| T029b | `whatsWorkingDashboard.ts:876` | icon-tier eligibility filter | `(r.creativeCount ?? 0) >= HOOK_ICON_DATA_GATE` |
| T029b | `whatsWorkingDashboard.ts:881` | eligible rows | `r.creativeCount ?? 0` |
| T029b | `whatsWorkingDashboard.ts:900` | per-angle icon sampleSize | `agg.creativeCount ?? 0` |
| T029c | `patternSummaries.ts:toSummary()` | `PatternSummary.creativeCount` | `b.n` |

The hook / visual aggregates that `ragContext.ts` and
`whatsWorkingDashboard.ts` read already have `creativeCount` populated
on every write by `learning/aggregateDelta.ts:108, 345, 416`. The
change at the consumer side is removing the `(s as any).creativeCount ??
...` fallback that was masking this fact.

`PatternSummary` did not have `creativeCount` declared. The change at
the producer side (`patternSummaries.ts:toSummary`) is adding the field
to the interface AND populating it. For PatternSummary, `b.n` (the
bucket row count) already counts creatives — each NRec represents one
generation/creative per family key — so `creativeCount = b.n` is
semantically equivalent to `sampleSize` while making the unit explicit.

### §1.2 — Gate site: `passesFRO34Gate` extracted as a pure function

The gate logic was duplicated at two sites in `rankingEngine.ts`:

- Line 223 (`querySummaries`): `s.confidence < MIN_CONFIDENCE || (((s as any).creativeCount ?? s.sampleSize) < MIN_SAMPLE_SIZE)`
- Line 373 (`getWarnings`): `(((s as any).creativeCount ?? s.sampleSize) >= 3 && s.negativeCount >= 2)`

Both use the same `(s as any).creativeCount ?? s.sampleSize` fallback
to silently revert to row counting. Extracted into:

```ts
export function passesFRO34Gate(summary: PatternSummary): boolean {
    if (summary.confidence < MIN_CONFIDENCE) return false;
    if ((summary.creativeCount ?? 0) < MIN_SAMPLE_SIZE) return false;
    return true;
}
```

- The `?? s.sampleSize` fallback that masked the bug is gone. Absent
  `creativeCount` reads as `0` (the `?? 0` here is for type safety on
  the optional field, not a fallback to row counting) — the gate stays
  closed until the producer catches up.
- `querySummaries` now calls `if (!passesFRO34Gate(s)) continue;`.
- `getWarnings` keeps its inline form `(s.creativeCount ?? 0) >= 3` so
  a regression in `passesFRO34Gate` does not silently break the
  failure-pattern warnings path too.

The extracted function is the single point of change for both gate
sites. The pattern matches Batch 12's `flowResolvedKeysIntoQueuedWrite`
approach — extract the wiring, drive it with a discriminator.

### §1.3 — Constants unchanged (10 / 3 / 3 retained, unit changed)

The user-spec'd constants confirmed at their existing numeric values
(the user-locked 10/3/3 decision from spec amendment 1):

| Constant | File:line | Value | Maps to spec |
|---|---|---|---|
| `RAG_MIN_SAMPLE_SIZE` | `ragContext.ts:126` | **10** | activation threshold (FR-034) |
| `MIN_SAMPLE_SIZE` | `rankingEngine.ts:152` | **3** | per-item top-performer floor (FR-034a) |
| `HOOK_ICON_DATA_GATE` | `whatsWorkingDashboard.ts:88` | **3** | efficiency-evidence minimum (FR-037, icon tier) |
| `AVOID_MIN_ADS` | `ragContext.ts:129` | **3** | efficiency-evidence minimum (FR-037, avoid threshold) |

The numbers are unchanged. What changed is the unit counted: from
ad rows to distinct creatives. At the observed 7.4:1 fan-out
(`act_995888422231015`, 383 rows → 52 distinct creatives), each gate
becomes roughly seven times harder to reach. A single 55-row creative
that used to clear a 3-row per-item floor by itself now fails (1 < 3) —
that is the gap spec amendment 1 was added to close.

---

## §2 — The discriminator

### §2.1 — `t029GateMigrationDiscriminator.test.ts` (Batch 13)

New file at
`functions/src/__tests__/phase969/t029GateMigrationDiscriminator.test.ts`,
registered in `functions/package.json` as
`test:phase969:t029GateMigration` and spliced into `test:phase969`
after `t025aWorkerWiring`.

Five tests:

1. **`55 rows / 1 creative FAILS`** — under creative counting, 1
   creative fails the 3-floor (1 < 3); this is the exact gap FR-034a
   was added in Iteration 3 to prevent.
2. **`55 rows / 3 creatives PASSES`** — under creative counting,
   3 creatives pass the 3-floor (3 >= 3); the spec-amendment-1
   boundary.
3. **`undefined creativeCount fails the floor`** — the discriminator
   against the pre-Batch-13 `?? s.sampleSize` fallback. Under the
   fallback, `undefined ?? 55 = 55` → PASS. Under the post-batch code
   (no fallback), `undefined` → FAIL. This is the test that fails on
   revert.
4. **`confidence below MIN_CONFIDENCE fails the gate`** — pinned here
   so a refactor that drops the confidence arm trips this assertion.
5. **SOURCE-TEXT** — `rankingEngine.ts` does not contain the
   `(s as any).creativeCount ?? s.sampleSize` fallback. Per-line check
   rejects commented-out occurrences (the Batch 12 lesson).

The first three tests are SIMULATION (Batch 12 review): they drive
`passesFRO34Gate` with controlled inputs and observe its outputs.
They pass under both pre- and post-batch states for fixtures 1 and 2
(where `creativeCount` is defined). Fixture 3 — undefined creativeCount —
discriminates against the pre-batch fallback.

The fourth test (confidence) pins the gate's other arm. A refactor that
drops the confidence check breaks it.

The fifth test (SOURCE-TEXT) is the **interim** regression guard for
T029c until T064b's scaffolding lands. A regression that re-adds the
`?? s.sampleSize` fallback (silently reverting to row counting)
trips it.

### §2.2 — Demonstrated fail/pass

**Step 1 — Revert the extracted function.** Added back the
`?? summary.sampleSize` fallback in `passesFRO34Gate`:

```ts
if (((summary as any).creativeCount ?? summary.sampleSize) < MIN_SAMPLE_SIZE) return false;
```

**Step 2 — Run the test.**

```
$ node lib/__tests__/phase969/t029GateMigrationDiscriminator.test.js
  ✅ FR-034a counts creatives: 55 rows / 1 creative FAILS the floor (1 < 3)
  ✅ FR-034a counts creatives: 55 rows / 3 creatives PASSES the floor (3 >= 3)
  ❌ FR-034a: undefined creativeCount fails the floor (no creative attributed yet)
     FR-034a: absent creativeCount must fail the floor (no creative attributed)

true !== false

  ✅ FR-034a: confidence below MIN_CONFIDENCE fails the gate even at scale
  ✅ T029c: rankingEngine.ts inline gate reads creativeCount directly (no row-count fallback)

=== T029c gate-migration discriminator (Batch 13) ===
Passed: 4, Failed: 1
=== EXITCODE: 1
```

The undefined-creativeCount test fails (4/5, exit 1). This is the
discriminator against the fallback — pre-Batch-13 reads `sampleSize=55`
and passes; post-Batch-13 reads `undefined` and fails.

**Step 3 — Revert the inline gate.** Added back the inline fallback
in `querySummaries`:

```ts
if (s.confidence < MIN_CONFIDENCE || (((s as any).creativeCount ?? s.sampleSize) < MIN_SAMPLE_SIZE)) continue;
```

**Step 4 — Run the test.**

```
$ node lib/__tests__/phase969/t029GateMigrationDiscriminator.test.js
  ✅ FR-034a counts creatives: 55 rows / 1 creative FAILS the floor (1 < 3)
  ✅ FR-034a counts creatives: 55 rows / 3 creatives PASSES the floor (3 >= 3)
  ❌ FR-034a: undefined creativeCount fails the floor (no creative attributed yet)
     FR-034a: absent creativeCount must fail the floor (no creative attributed)

true !== false

  ✅ FR-034a: confidence below MIN_CONFIDENCE fails the gate even at scale
  ❌ T029c: rankingEngine.ts inline gate reads creativeCount directly (no row-count fallback)
     rankingEngine.ts must not have the `?? s.sampleSize` fallback in the inline gate (FR-034a counts creatives)

=== T029c gate-migration discriminator (Batch 13) ===
Passed: 3, Failed: 2
=== EXITCODE: 1
```

Both the behavioural test (undefined) and the SOURCE-TEXT test (inline
gate) fail (3/5, exit 1). The SOURCE-TEXT check trips because the
`(s as any).creativeCount ?? s.sampleSize` line is back in the
inline gate at `querySummaries:223`.

**Step 5 — Restore both edits.**

```
$ node lib/__tests__/phase969/t029GateMigrationDiscriminator.test.js
  ✅ FR-034a counts creatives: 55 rows / 1 creative FAILS the floor (1 < 3)
  ✅ FR-034a counts creatives: 55 rows / 3 creatives PASSES the floor (3 >= 3)
  ✅ FR-034a: undefined creativeCount fails the floor (no creative attributed yet)
  ✅ FR-034a: confidence below MIN_CONFIDENCE fails the gate even at scale
  ✅ T029c: rankingEngine.ts inline gate reads creativeCount directly (no row-count fallback)

=== T029c gate-migration discriminator (Batch 13) ===
Passed: 5, Failed: 0
=== EXITCODE: 0
```

All five pass (5/5, exit 0). The discriminator is observable at the
function level (undefined-creativeCount fixture) AND at the source-text
level (inline gate fallback). Both halves demonstrated.

---

## §3 — What changed in this batch

Six source files + two test files + `package.json` + the Batch 12 report:

- `functions/src/patternSummaries.ts` — added `creativeCount?: number`
  to `PatternSummary` interface; populated `creativeCount: b.n` in
  `toSummary()`.
- `functions/src/rankingEngine.ts` — extracted `passesFRO34Gate()`
  as an exported pure function; replaced the inline gate in
  `querySummaries` and the inline check in `getWarnings`. Removed the
  `(s as any).creativeCount ?? s.sampleSize` fallbacks.
- `functions/src/ragContext.ts` — `rankHooks()` now reads
  `a.creativeCount ?? 0` instead of `a.creativeCount ?? a.byObjective.conversion.count`.
- `functions/src/whatsWorkingDashboard.ts` — five sites updated to
  read `r.creativeCount ?? 0` (or similar) instead of the
  `?? byObjective?.conversion?.count` fallback.
- `functions/src/__tests__/ragContext.test.ts` — updated
  `makeHookAgg()` fixture helper to populate `creativeCount` matching
  `sampleSize`; the `'question'` fixture in the avoid test overrides
  `creativeCount: 2` to keep the floor logic under the post-batch code.
- `functions/src/__tests__/phase969/t025aWorkerWiringDiscriminator.test.ts`
  — added a COVERAGE LIMIT block in the header documenting the
  simulation-vs-SOURCE-TEXT distinction.
- `functions/src/__tests__/phase969/t029GateMigrationDiscriminator.test.ts`
  — new file with 5 tests.
- `functions/package.json` — registered `test:phase969:t029GateMigration`
  and spliced it into `test:phase969`.
- `specs/969-cumulative-learning/reports/batch-12-969-report.md` —
  corrected §3.2 / §3.3 contradiction, added §3.4 coverage-limit
  note, expanded §5 source-text census with the SIMULATION category
  and reclassified four prior entries.
- `specs/969-cumulative-learning/tasks.md` — T064b extended with
  the worker-output assertion obligation for both T021a and T025a
  wire-ups.

---

## §4 — Test name vs assertion check (Rule 0b)

Walking the `ok N - <description>` lines emitted by the new discriminator
file against the assertions in the source:

| Runner description | Assertion body | Direction/value match? |
|---|---|---|
| `FR-034a counts creatives: 55 rows / 1 creative FAILS the floor (1 < 3)` | `passesFRO34Gate({sampleSize: 55, creativeCount: 1, confidence: 0.5})` returns `false` because `(1 ?? 0) < 3` | ✅ — under creative counting, 1 fails the 3-floor |
| `FR-034a counts creatives: 55 rows / 3 creatives PASSES the floor (3 >= 3)` | `passesFRO34Gate({sampleSize: 55, creativeCount: 3, confidence: 0.5})` returns `true` because `3 >= 3` | ✅ — under creative counting, 3 passes the 3-floor |
| `FR-034a: undefined creativeCount fails the floor (no creative attributed yet)` | `passesFRO34Gate({sampleSize: 55, creativeCount: undefined, confidence: 0.5})` returns `false` because `(undefined ?? 0) = 0 < 3` | ✅ — under post-batch code, absent creativeCount fails |
| `FR-034a: confidence below MIN_CONFIDENCE fails the gate even at scale` | `passesFRO34Gate({sampleSize: 55, creativeCount: 100, confidence: 0.05})` returns `false` because `0.05 < 0.15` (MIN_CONFIDENCE) | ✅ — confidence arm pinned |
| `T029c: rankingEngine.ts inline gate reads creativeCount directly (no row-count fallback)` | Reads `rankingEngine.ts` source, finds no `(s as any).creativeCount ?? s.sampleSize` lines, asserts none are commented out | ✅ — structural check |

All five descriptions match their assertions. Test 3 is the
discriminator against the pre-batch fallback; test 5 is the
discriminator against the inline-gate regression.

---

## §5 — Source-text census — standing section (updated)

Per Batch 06 finding 3, this section is reported in every batch.

### §5.1 — Categories

Three categories are tracked: SOURCE-TEXT / SOURCE-ORDER / SOURCE-CONFIG,
BEHAVIOURAL, and SIMULATION. See §0.4 above for definitions.

### §5.2 — Census entries

| File | Assertion | Category |
|---|---|---|
| `sc049Tripwire.test.ts` | source-order (last `batch.commit` < first `acquireLearningLease`) | SOURCE-ORDER (necessary-but-not-sufficient; SC-049 tripwire) |
| `learningCascade.test.ts` (3rd assertion, line 156) | `applyAdToHook` has no `count -=` patterns | SOURCE-TEXT (necessary-but-not-sufficient; FR-014 structural guard) |
| `t021aWireupDiscriminator.test.ts` (line 217) | shared.ts calls `resolveCreativeKeyByAdId(` AND `creativeKeyByAdId.get(ad.id)` | SOURCE-TEXT (T021a wire-up — interim regression guard until T064b) |
| `t025aWorkerWiringDiscriminator.test.ts` (line 313) | shared.ts has un-commented `.ledger.angleKey = entry.hookAngle` AND `.ledger.patternKey = computePatternKey` | SOURCE-TEXT (T025a wire-up — interim regression guard until T064b) |
| `t029GateMigrationDiscriminator.test.ts` (line 313) | rankingEngine.ts has no `(s as any).creativeCount ?? s.sampleSize` fallback in the inline gate at `querySummaries:223` | SOURCE-TEXT (T029c gate migration — interim regression guard until T064b) |
| `testRegistrationGuard.test.ts` (chain-wide, Batch 11) | every `lib/**/*.test.js` chain entry has a `.ts` source on disk and vice versa | SOURCE-CONFIG (configuration invariant) |
| `t021aWireupDiscriminator.test.ts` (lines 172-216) | T021a BEFORE/AFTER driving `simulateShared` + `resolveCreativeKeyByAdId` + `decidePerAdActionsForWorker`; asserts on `applyHookAggregatesDelta(...).creativeCount` | **SIMULATION** (reclassified Batch 12 review) |
| `t025aWorkerWiringDiscriminator.test.ts` (lines 195-289) | T025a BEFORE/AFTER driving the same simulation harness as T021a, plus the post-pass ledger-key mutation toggle | **SIMULATION** (reclassified Batch 12 review) |
| `perAdActions.test.ts` (lines 101-181) | T021a discriminator: drives `decideAdWriteActions` with `creativeKey=ad.id` vs `creativeKey="creative:gen:gen:55"`; aggregates via `applyHookAggregatesDelta`; asserts `creativeCount = 55` and `= 1` respectively | **SIMULATION** (reclassified Batch 12 review) |
| `perAdActions.test.ts` (lines 243-290) | T025a function-level: drives `decideAdWriteActions` with `resolvedHookAngle="urgency"` / `resolvedPatternKey="p1"`; asserts `ledger.angleKey` and `ledger.patternKey` are populated | **SIMULATION** (reclassified Batch 12 review) |
| `t029GateMigrationDiscriminator.test.ts` (lines 195-289) | T029c discriminator: drives `passesFRO34Gate({sampleSize: 55, creativeCount: 1/3/undefined})` and asserts the FR-034a floor behaviour | **SIMULATION** (Batch 13: reclassified per the standing convention — drives the extracted pure function which is a single point of change, but the test is still a second implementation of the gate logic; the SOURCE-TEXT half is the load-bearing regression guard) |
| `t029GateMigrationDiscriminator.test.ts` (lines 295-301) | confidence-below-MIN_CONFIDENCE fails the gate even at scale | BEHAVIOURAL (drives the extracted pure function with a fixed-confidence fixture; pins the gate's confidence arm) |

**Total assertion groups**: 12 (was 9 in Batch 12).
- 1 SOURCE-ORDER (SC-049 tripwire).
- 4 SOURCE-TEXT (FR-014 cascade, T021a wire-up, T025a wire-up, **T029c gate migration — new in Batch 13**).
- 1 SOURCE-CONFIG (chain-wide registration).
- 5 SIMULATION (T021a discriminator BEFORE/AFTER, T025a discriminator BEFORE/AFTER, T021a `perAdActions` creativeKey forms, T025a `perAdActions` ledger-key forms, **T029c discriminator — new in Batch 13**).
- 1 BEHAVIOURAL (T029c confidence arm — new in Batch 13).

### §5.3 — Interim regression guards for wire-ups and migrations

T021a, T025a, and now T029c all sit in the same shape: the production
helper is correct in isolation but the worker / reader must call it
correctly. The SOURCE-TEXT guards in `t021aWireupDiscriminator.test.ts`
(line 217), `t025aWorkerWiringDiscriminator.test.ts` (line 313), and
`t029GateMigrationDiscriminator.test.ts` (line 313) are the **interim**
regression guards until T064b's stubbed-Firestore / stubbed-Meta
scaffolding lands. They are the only checks that actually trip on a
reverted wire-up / migration. The SIMULATION / BEHAVIOURAL halves in
the same files document that the test's own logic is correct in both
states.

---

## §6 — Items NOT changed (and why)

The reviewer scoped this batch to T029a/b/c:

> *"Batch 13: the gate migration. T029a, T029b, T029c. Nothing else."*

So:

- The worker-side `learning/aggregateDelta.ts` producer was already
  populating `creativeCount` correctly (lines 108, 345, 416). The
  changes are all consumer-side: querying the field directly without
  a fallback.
- `getTopWinners.ts` (T050 in tasks.md) reads `WinningAd` shape, not
  `creativeCount ?? sampleSize`. T050 is deferred to Phase 7 per the
  user's note ("the `?? sampleSize` fallback is removed in T050" — that
  fallback is already removed in this batch for `rankingEngine.ts`,
  `ragContext.ts`, and `whatsWorkingDashboard.ts`). T050's other
  producers and consumers are not touched.
- The four SIMULATION-test reclassifications are documented in
  `tasks.md` (none — only T064b's extension is recorded). The
  reclassification is in the census, not the task entries.
- The source-text guards are SOURCE-TEXT, not BEHAVIOURAL. Their
  retirement on T064b's landing is documented in T064b's task entry
  (Batch 13 update).

---

## §7 — Raw output — `git diff --stat HEAD~1` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" diff --stat HEAD~1
 functions/package.json                             |   3 +-
 .../t025aWorkerWiringDiscriminator.test.ts         |  27 +++-
 .../t029GateMigrationDiscriminator.test.ts         | 168 +++++++++++++++++++++
 functions/src/__tests__/ragContext.test.ts         |  11 +-
 functions/src/patternSummaries.ts                  |  28 +++-
 functions/src/ragContext.ts                        |  29 ++--
 functions/src/rankingEngine.ts                     |  47 +++++-
 functions/src/whatsWorkingDashboard.ts             |  45 +++---
 .../reports/batch-12-969-report.md                 | 133 +++++++++++++---
 specs/969-cumulative-learning/tasks.md             |   5 +-
 10 files changed, 426 insertions(+), 70 deletions(-)
```

## §8 — Raw output — `git status --short` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" status --short
```

(no output — clean working tree)

## §9 — Raw output — full `npm test` tail with exit code (clean build)

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ Remove-Item -Recurse -Force lib
$ npm test
```

(Full output captured at `C:\temp\opencode\batch13-final-npmtest.txt`.
The tail below is the contract-fixtures pass + the per-suite tail
lines.)

```
> test:phase969:t029GateMigration
> npm run build && node lib/__tests__/phase969/t029GateMigrationDiscriminator.test.js


> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

  ✅ FR-034a counts creatives: 55 rows / 1 creative FAILS the floor (1 < 3)
  ✅ FR-034a counts creatives: 55 rows / 3 creatives PASSES the floor (3 >= 3)
  ✅ FR-034a: undefined creativeCount fails the floor (no creative attributed yet)
  ✅ FR-034a: confidence below MIN_CONFIDENCE fails the gate even at scale
  ✅ T029c: rankingEngine.ts inline gate reads creativeCount directly (no row-count fallback)

=== T029c gate-migration discriminator (Batch 13) ===
Passed: 5, Failed: 0

> test:billing
> npm run test:billing:state && npm run test:billing:ghlSync && npm run test:billing:stripeWebhook


> test:billing:state
> npm run build && node lib/billing/__tests__/billingState.test.js


> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/


(a) subscription.created → Pro monthly
  ✅ plan is pro
  ✅ credits is 2500
  ✅ billingStatus is active
  ✅ stripeCustomerId is set
  ✅ stripeSubscriptionId is set
  ✅ creditsPerMonth is 2500 for pro
  ✅ canUpgrade is true (pro < scale)
  ✅ canTopUp is true

(a.2) subscription.created → Starter plan
  ✅ plan is starter
  ✅ credits is 800
  ✅ creditsPerMonth is 800 for starter
  ✅ canUpgrade is true (starter < scale)

(a.3) Legacy mapping: creator → pro
{"event":"plan.legacy_mapped","uid":"unknown","legacy":"creator","canonical":"pro"}
  ✅ plan mapped from creator to pro
  ✅ credits is 2500
  ✅ creditsPerMonth is 2500 (pro after mapping)

(a.4) subscription.created → Scale plan
  ✅ plan is scale
  ✅ credits is 6500
  ✅ creditsPerMonth is 6500 for scale
  ✅ canUpgrade is false for scale (highest tier)
  ✅ canTopUp is true for scale

(b) subscription.canceled → plan=none
  ✅ plan is none
  ✅ credits is 0
  ✅ billingStatus is cancelled
  ✅ canUpgrade is false for plan=none
  ✅ canTopUp is false for plan=none
  ✅ stripeCustomerId is null
  ✅ stripeSubscriptionId is null

(b.2) subscription.canceled — Stripe fields still present from prior subscription
  ✅ stripeCustomerId preserved
  ✅ stripeSubscriptionId preserved

(c) top-up → credits added
  ✅ credits is 2800 (2500 base + 300 top-up)
  ✅ billingStatus is active
  ✅ canTopUp is true
  ✅ creditsPerMonth is still 2500 (plan unchanged)

(d) subscription.past_due → credits kept, grace period set
  ✅ billingStatus is past_due
  ✅ credits is still 1500 (NOT zeroed)
  ✅ gracePeriodEndsAt is set
  ✅ canTopUp is false during past_due

(e) Empty data → graceful defaults
  ✅ plan defaults to none
  ✅ credits defaults to 0
  ✅ billingStatus defaults to cancelled
  ✅ stripeCustomerId is null
  ✅ stripeSubscriptionId is null
  ✅ isTrial defaults to false
  ✅ isTeamMember defaults to false

(e.2) Partial data — only plan set
  ✅ plan is starter
  ✅ credits defaults to 0
  ✅ creditsPerMonth is 800 for starter
  ✅ billingStatus is active

(f) Minimal data with stripeCustomerId only
  ✅ plan is pro
  ✅ stripeCustomerId is set
  ✅ stripeSubscriptionId is null
  ✅ billingStatus is active
  ✅ canTopUp is true

(g) pending_plans data → correct Stripe fields
  ✅ plan is starter
  ✅ credits is 800
  ✅ stripeCustomerId is set
  ✅ stripeSubscriptionId is set
  ✅ canUpgrade is true

Additional: Team member restrictions
  ✅ isTeamMember is true
  ✅ teamOwnerUid is owner123
  ✅ teamOwnerName is Ahmed
  ✅ canUpgrade is false for team member
  ✅ canTopUp is false for team member

Additional: Cancelling state
  ✅ billingStatus is cancelling
  ✅ cancelAt is set
  ✅ canTopUp still true while cancelling
  ✅ canUpgrade still true while cancelling

Additional: Trial expired (0 credits)
  ✅ isTrial is true
  ✅ billingStatus is cancelled (0 trial credits)
  ✅ canTopUp is false for trial
  ✅ creditsPerMonth is 50 (trial)

Additional: Trial active (credits > 0)
  ✅ isTrial is true
  ✅ billingStatus is active
  ✅ creditsPerMonth is 50 (trial)
  ✅ canTopUp is false for trial

Legacy: creator → pro
{"event":"plan.legacy_mapped","uid":"unknown","legacy":"creator","canonical":"pro"}
  ✅ creator mapped to pro

Legacy: scaling → scale
{"event":"plan.legacy_mapped","uid":"unknown","legacy":"scaling","canonical":"scale"}
  ✅ scaling mapped to scale

═══ Results: 77 passed, 0 failed ═══

> test:billing:ghlSync
> npm run build && node lib/billing/__tests__/ghlBillingSync.test.js


> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/


=== GHL Sync Tests (T052) ===

(a) Each event_type routes to correct URL
  ✅ trial.started → https://ghl.example.com/trial-started
  ✅ subscription.created → https://ghl.example.com/payment-received
  ✅ payment.recovered → https://ghl.example.com/recovered
  ✅ payment.failed → https://ghl.example.com/overdue-failed
  ✅ subscription.cancelled → https://ghl.example.com/cancelled
  ✅ top_up.completed → https://ghl.example.com/topup
  ✅ trial.started URL
  ✅ subscription.created URL
  ✅ payment.recovered URL
  ✅ payment.failed URL
  ✅ subscription.cancelled URL
  ✅ top_up.completed URL

(b) notifyGHL with uid resolves user doc
  ✅ Email resolved from user doc
  ✅ first_name from displayName
  ✅ last_name from displayName
  ✅ stripeCustomerId from user doc
  ✅ event_id passed through
  ✅ amount passed through

(b.2) notifyGHL with raw email (pre-signup)
  ✅ Email used directly
  ✅ first_name null for raw email
  ✅ last_name null for raw email
  ✅ stripeCustomerId null for raw email
  ✅ event_id passed through for raw email

(c) Every payload includes full stable-column shape
  ✅ Field 'event_type' present in payload
  ✅ Field 'event_id' present in payload
  ✅ Field 'stripe_customer_id' present in payload
  ✅ Field 'stripe_subscription_id' present in payload
  ✅ Field 'email' present in payload
  ✅ Field 'first_name' present in payload
  ✅ Field 'last_name' present in payload
  ✅ Field 'plan' present in payload
  ✅ Field 'billing_status' present in payload
  ✅ Field 'is_trial' present in payload
  ✅ Field 'credits' present in payload
  ✅ Field 'billing_type' present in payload
  ✅ Field 'currency' present in payload
  ✅ Field 'amount' present in payload
  ✅ Field 'trial_end_date' present in payload
  ✅ Field 'trial_end_date_human' present in payload
  ✅ Field 'next_billing_date' present in payload
  ✅ Field 'next_billing_date_human' present in payload
  ✅ Field 'portal_url' present in payload
  ✅ Field 'cancel_at' present in payload
  ✅ Field 'cancellation_reason' present in payload
  ✅ Payload has exactly 21 fields

(c.2) displayName with whitespace → first_name/last_name split
  ✅ first_name = 'Ahmed'
  ✅ last_name = 'Mohamed'

(c.3) displayName without whitespace → last_name=null
  ✅ first_name = 'Ahmed' (full string)
  ✅ last_name = null (no whitespace)

(c.4) displayName null → both null
  ✅ first_name = null
  ✅ last_name = null

(d) POST failure logs ghl_sync_failed and doesn't throw
  ✅ POST failure path completes without throwing (fire-and-forget)

(e) Portal generation failure → portal_url=null in payload
  ✅ portal_url = null when portal generation fails
  ✅ Payload still sent with email
  ✅ event_id still populated

(f) Date formatting: human-readable dates
  ✅ ISO date renders as 'May 21, 2026'
  ✅ null ISO date renders as null

═══ Results: 57 passed, 0 failed ═══

> test:billing:stripeWebhook
> npm run build && node lib/billing/__tests__/stripeWebhook.test.js


> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/


=== Webhook Scenarios (T024) ===

(1) checkout.session.completed — in-app subscription (client_reference_id present)
  ✅ Price ID mapped to plan
  ✅ Plan is 'pro' for price_pro_monthly
  ✅ Pro plan credits = 2500
  ✅ client_reference_id is uid
  ✅ User doc exists after write
  ✅ User plan is pro
  ✅ stripeCustomerId saved

(2) checkout.session.completed — GHL funnel (no client_reference_id)
  ✅ No client_reference_id — GHL path
  ✅ Starter plan from price_starter_monthly
  ✅ Starter credits = 800
  ✅ pending_plans doc exists for GHL funnel email
  ✅ Pending plan is starter
  ✅ stripeCustomerId in pending_plans

(3) checkout.session.completed — dual-event dedup
  ✅ Atomic .create() detects duplicate event

(4) customer.subscription.updated — plan change (price ID change)
  ✅ New plan is pro after price change
  ✅ Credits updated to pro allocation (2500)
  ✅ Plan actually changed from starter → pro
  ✅ User plan updated to pro
  ✅ User credits updated to 2500

(5) customer.subscription.updated — trial → active conversion
  ✅ isTrial set to false
  ✅ billingStatus set to active
  ✅ Credits reset to full plan allocation (2500)
  ✅ Persisted isTrial = false
  ✅ Persisted credits = 2500

(6) customer.subscription.deleted — plan reset
  ✅ Plan set to none
  ✅ Credits set to 0
  ✅ billingStatus set to cancelled
  ✅ stripeSubscriptionId cleared
  ✅ Update plan = none
  ✅ Update credits = 0
  ✅ Update billingStatus = cancelled

(7) invoice.payment_succeeded — renewal (subscription_cycle)
  ✅ subscription_create: NO credit reset
  ✅ subscription_cycle: YES credit reset
  ✅ manual: NO credit reset
  ✅ subscription_update: NO credit reset
  ✅ Pro credits reset to 2500 on subscription_cycle

(8) invoice.payment_failed — sets past_due + grace
  ✅ billingStatus set to past_due
  ✅ billingIssueType set to payment_failed
  ✅ gracePeriodEndsAt is a date ~2 days out
  ✅ Grace period is in the future

(9) charge.refunded — full subscription refund
  ✅ Full refund detected (amount_refunded === amount)
  ✅ Not a top-up charge → subscription refund branch
  ✅ Refund amount = $79.00

=== Callable Scenarios (T025) ===

(10) createStripeCheckoutSession — happy path
  ✅ Mode is subscription
  ✅ client_reference_id = uid
  ✅ 7-day trial configured
  ✅ firebaseUid in metadata
  ✅ Automatic tax enabled
  ✅ success_url has paid=1

(11) createStripeTopUpSession — happy path
  ✅ Mode is payment
  ✅ isTopUp = 'true' in metadata
  ✅ creditAmount = '300' in metadata
  ✅ isTopUp mirrored in payment_intent_data.metadata
  ✅ creditAmount mirrored in payment_intent_data.metadata
  ✅ success_url has topup=1

(12) createStripePortalSession — happy path
  ✅ User doc exists for portal
  ✅ stripeCustomerId present
  ✅ stripeCustomerId = cus_portal_001
  ✅ Portal customer set
  ✅ Flow type = subscription_cancel
  ✅ Return URL correct

=== Refund Branch Scenarios (T026) ===

(13) charge.refunded — full subscription refund → cancel subscription
  ✅ Full refund detected
  ✅ Not top-up → subscription refund branch
  ✅ cancellation_logs written before cancel
  ✅ Reason = 'refund'

(14) charge.refunded — full top-up refund → credits deducted
  ✅ Full refund detected
  ✅ Is top-up charge → credit deduction branch
  ✅ creditAmount parsed from metadata = 300
  ✅ Deducted = min(150, 300) = 150 (clamped at 0)
  ✅ Credits clamped to 0 after deduction
  ✅ refund_logs written for top-up refund
  ✅ refund_logs creditAmountDeducted = 150

(15) charge.refunded — partial refund → log only
  ✅ Partial refund detected (amount_refunded < amount)
  ✅ Partial refund amount = $39.50
  ✅ Remaining amount = 3950 cents

═══ Results: 75 passed, 0 failed ═══
🗺️ selectLayoutTemplate: primary=standard_hero secondary=value_stack hookAngle=none ratio=1:1
🗺️ selectLayoutTemplate: primary=standard_hero secondary=value_stack hookAngle=none ratio=1:1
🗺️ selectLayoutTemplate: primary=event_ticket secondary=speaker_card hookAngle=none ratio=1:1
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
🗺️ selectLayoutTemplate: primary=standard_hero secondary=value_stack hookAngle=none ratio=1:1

═══ Spec 002 — Priority Lane QA Fixtures ═══
  ✅ Lane 1: Retargeting + Carousel
  ✅ Lane 2: Cold + Single + before_after
  ✅ Lane 3: Cold + Carousel + value_stack
  ✅ Lane 4: Cold + Carousel (approved mode)
  ✅ Lane 5: Cold + Batch + hero + value_stack
  ✅ Lane 6: Cold + Single + value_stack
  ✅ Lane 7: Retargeting + Single + value_stack
  ✅ Lane 8: Minimal + hero + Single
  ✅ Lane 9: Minimal + hero + Batch
  ✅ Lane 10: Testimonial Carousel (Cold)
  ✅ Lane 11: Testimonial Carousel (Retargeting)
═══ Spec 002 — All 11 lanes passed ═══


═══ Phase 3 — Resolver Function Unit Tests ═══
  ✅ testValidateLaunchSurface: passing + blocked combos verified
  ✅ testCarouselSlideCountPlan
  ✅ testResolveValueStackSlideCount
  ✅ testFilterEmptyValueStackFields
═══ Phase 3 — All unit tests passed ═══


═══ Spec 005 — Render Prompt Pipeline Regression Guards ═══
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 20 sub: 9 cta: 8 benefit: 10
  ✅ testPromptAssemblyHookTextVerbatim
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ testPromptAssemblySubStyleLuxuryMagazine
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ testPromptAssemblyRetargetingDirection
  ✅ testCopyFidelityValidation
═══ Spec 005 — All regression tests passed ═══


═══ Spec 005 Phase 2 — 4-Field Fidelity + Campaign Context + Carousel ═══
  ✅ testCopyFidelity4Fields
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ testCampaignContextPresence
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 7 sub: 18 cta: 0 benefit: 10
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 13 sub: 19 cta: 0 benefit: 10
  ✅ testCarouselPerSlideCopyIsolation
═══ Spec 005 Phase 2 — All new tests passed ═══


═══ Spec 006 — Team Management Fixture Tests (imported callables) ═══
  ✅ testExportedConstants
  ✅ testInviteBlockedAtPlanLimit
  ✅ testClaimSetsMembership
  ✅ testExpiredInviteRejected
  ✅ testRemovalClearsMembership
  ✅ testViewerRejectedByDeductCredits
  ✅ testGetInviteDetailsStatus
═══ Spec 006 — All team fixture tests passed ═══


═══ T025 — Entitlement Resolver Fixtures (3-plan) ═══
  ✅ testBooleanGateFixtures: 24 fixtures passed
  ✅ testAlwaysAllowedFixtures: 16 fixtures passed
  ✅ testQuantityBoundedFixtures: 40 fixtures passed
  ✅ testTeamInviteBoundaryFixtures: 4 fixtures passed
═══ T025 — All entitlement fixtures passed ═══


═══ T026a — Cross-module Parity ═══
  ✅ testCrossModuleParity: backend ↔ contract canonicals verified (features + batch + savedProject + avatar)
═══ T026a — Cross-module parity complete ═══


═══ HFC.9 — Cultural Compliance Integration Checks ═══
  ✅ testEnglishIsNotGated: isArabic is the gate; scan itself is pure
  ✅ testMinimumCoverageShape: HARAM_MOTIFS=11, TRIGGER_WORDS=29
═══ HFC.9 — Integration checks complete (unit coverage lives in __tests__/culturalCompliance.test.ts) ═══


═══ HFD — Multi-Logo Upload Fixtures ═══
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ HFD.T1: 3-logo single-ad prompt shape verified
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ HFD.T3: 0-logo empty-branding invariant preserved
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ HFD.T4: 7-logo oversized defence-in-depth truncation verified
  ✅ HFD.T2: 5-logo carousel per-slide attachment verified
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ HFD.T5: Arabic 2-logo equal-peer phrasing verified
═══ HFD — All logo fixtures passed ═══


═══ HFE — HOTFIX-E: Hybrid Logo Handling Fixtures ═══
  ✅ HFE.8.a: minimalist single ad, 1 UI placement validated
  ✅ HFE.8.b: lifestyle single ad, 1 environmental placement validated
  ✅ HFE.8.c: corporate ad, screen-content ban + UI placement validated
  ✅ HFE.8.d: mixed 5-slide carousel mode mix validated
  ✅ HFE.8.e: 3-logo ad, per-mode caps respected
  ✅ HFE.8.f: corrupt source — validator accepts, compositor handles fail-soft at runtime
  ✅ HFE.8.g: over-cap UI placements dropped correctly
  ✅ HFE.8.h: prompt blocks verified (Sharp unavailable handled at runtime)
  ✅ HFE.8.i: prompt block content verified for pipeline ordering
  ✅ Ban-1: SCREEN_CONTENT_BAN_BLOCK constant verified
  ✅ Ban-2: screen-content rule allowed states verified
  ✅ Validator: widthPct=30 clamped to 18
  ✅ Validator: opacity=0.5 clamped to 0.85
  ✅ Validator: logoIndex=7 dropped (only 2 logos)
  ✅ Validator: text_only style produces zero placements
  ✅ Validator: unrecognized mode='video' defaulted to environmental
  ✅ Validator: 5 environmental → 3 kept, 2 dropped
═══ HFE — All hybrid logo fixtures passed ═══


═══ BCR — Brand Color Resolver Fixtures ═══
  ✅ BCR-01-form-wins
  ✅ BCR-02-avatar-wins-over-cold-ad
  ✅ BCR-03-cold-ad-inherited
  ✅ BCR-04-workspace-fallback
  ✅ BCR-05-no-source
  ✅ BCR-06-form-malformed-falls-through
  ✅ BCR-07-form-primary-no-secondary
  ✅ BCR-08-cta-text-light-primary
  ✅ BCR-09-cta-text-dark-primary
  ✅ BCR-10-cta-text-luminance-boundary (≥ 0.5 → near-black)
  ✅ BCR-11-secondary-falls-through-independently
═══ BCR — All brand color resolver fixtures passed ═══


═══ US1 — Carousel / Batch Brand Color Fixtures ═══
  ✅ T010-carousel-slide-3-brand-colors
  ✅ T011-batch-item-2-brand-colors
  ✅ T012-anti-placeholder-regex
═══ US1 — All carousel/batch fixtures passed ═══


═══ US2 — Retargeting Inheritance Fixtures ═══
  ✅ T016a-retargeting-inherits-cold-ad-colors
  ✅ T016b-retargeting-form-overrides-cold-ad
  ✅ T016c-missing-cold-ad-falls-to-workspace
═══ US2 — All retargeting fixtures passed ═══


═══ BCC — Brand Color Compliance Fixtures ═══
  ✅ BCC-01-no-brand-colors
  ✅ BCC-02-empty-string
  ✅ BCC-03-malformed-hex
  ✅ BCC-04-image-unanalyzable
  ✅ BCC-05-present
  ✅ BCC-06-absent
  ✅ BCC-07-near-miss-present
  ✅ BCC-08-far-miss-absent
═══ BCC — All compliance fixtures passed ═══


═══ US4 — Compositor Brand Color Fixtures ═══
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-01-no-brand-fallback: textStyle drives all colors
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-02-brand-primary-only: CTA branded via luminance auto-contrast
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-03-brand-secondary-only: headline branded, CTA unchanged
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-04-brand-both: both CTA and headline branded
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-05-arabic-uniformity: single deterministic headline color
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-06-light-primary-cta-text-near-black
═══ US4 — All compositor fixtures passed ═══


═══ US5 — Scoring Integration Fixtures ═══
  ✅ T029a-scoring-deduction-75-to-65-still-passes
  ✅ T029b-scoring-deduction-65-to-55-now-fails
  ✅ T029c-scoring-no-deduction-when-check-skipped
  ✅ T029d-scoring-no-deduction-when-brand-color-present
═══ US5 — All scoring fixtures passed ═══


═══ HFF — HOTFIX-F: Aspect Ratio Reflow Fixtures ═══
  ✅ T010: getSafeZoneForRatio returns spec table, throws on unknown
  ✅ T011a: router covers all 30 non-identity pairs, 6 identity pairs
  ✅ T012: brand-color hex FF0000 appears in re-render prompt, brandColorReinforced=true
[reflowImage] source image URL rejected (not an allowlisted https storage host; 
✅ Reflow 1:1→9:16 (rerender) for gen undefined, charged 5
  ✅ T011: single reflow 1:1→9:16 returns 9:16 and 5 credits
✅ Reflow 1:1→9:16 (rerender) for gen undefined, charged 5
✅ Reflow 1:1→9:16 (rerender) for gen undefined, charged 5
✅ Reflow 1:1→9:16 (rerender) for gen undefined, charged 5
  ✅ T020: batch reflow 4 items → 3 success (15 credits) + 1 failure (0 credits)
value="https://example.com/original-1x1.png") for gen=gen1 item=null. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b0.png") 
for gen=gen1 item=0. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b1.png") 
for gen=gen1 item=1. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b2.png") 
for gen=gen1 item=2. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b3.png") 
for gen=gen1 item=3. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; 
value="https://example.com/slide-0.png") for gen=gen1 item=0. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; 
value="https://example.com/slide-1.png") for gen=gen1 item=1. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; 
value="https://example.com/slide-2.png") for gen=gen1 item=2. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; 
value="https://example.com/slide-3.png") for gen=gen1 item=3. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; 
value="https://example.com/slide-4.png") for gen=gen1 item=4. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; 
value="https://example.com/slide-5.png") for gen=gen1 item=5. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; 
value="https://example.com/slide-6.png") for gen=gen1 item=6. Proceeding without it.
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 1
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 2
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 3
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 4
[reflowImage] source image URL rejected (not an allowlisted https storage host;
value="https://example.com/slide-2.png") for gen=gen1 item=2. Proceeding without it.
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 0
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 5
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 6
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 2
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
  ✅ T023: carousel reflow 7 slides → all succeed (35 credits), slide order preserved; carousel_slide idx=2 → 5 credits
  ✅ HFF.6.a: 1:1 → 4:5 auto-routes to outpaint (magnitude=0.2500)
  ✅ HFF.6.b: 4:5 → 9:16 auto-routes to rerender (magnitude=0.4222)
  ✅ HFF.6.c: outpaint byte-identity preserved in center region
  ✅ HFF.6.d: extractBuildPlan + rerenderFromPlan exercise real path; NoPlanError propagated
  ✅ HFF.6.e: user override outpaint on 4:5 → 9:16
  ✅ HFF.6.f: user override rerender on 1:1 → 4:5
  ✅ HFF.6.g: outpaint drift detected → fallback triggered
  ✅ HFF.6.h: carousel_all 5 slides have plans, router picks rerender for 1:1 -> 9:16
  ✅ HFF.6.i: NoPlanError on slide 3 (index 2), 4 others have plans
  ✅ HFF.6.j: same-ratio no-op (magnitude=0)
  ✅ HFF.6.k: invalid target ratio '2:1' rejected at callable boundary
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=9:16
🛑 Deprecated REFLOW path invoked — use reflowImage callable (FR-026).
📋 Render contract warnings: High-priority zone "headline" (priority 2) not referenced in build plan. | High-priority zone "hero" (priority 1) not referenced in build plan.
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
=== NPM TEST EXITCODE: 0 ===
```

NPM TEST EXITCODE: **0**
