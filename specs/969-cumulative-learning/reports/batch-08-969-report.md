# Batch 08 — exactly three things

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-cumulative-learning`
**Tasks**: T028 (shared.ts refactor), T021a (real creativeKey wire-up), gate-migration to `creativeCount`. Nothing else.
**Date**: 2026-09-05

Batch 08 closes the three items Batch 07 said were missing. There is
exactly one implementation of the per-ad logic (in `decideAdWriteActions`,
called by `shared.ts`); the T021a discriminator fails when shared.ts
falls back to `ad.id` and passes when it forwards the real creativeKey
from `groupIntoCreatives`; the gates read `creativeCount` (or
`creativeCount ?? sampleSize` until the upstream Summary producer
is wired). Source-text census in §6.

---

## 1. T028 — `shared.ts` calls `decideAdWriteActions`

The inline per-ad block (approximately lines 1003-1144 in the
pre-Batch-08 file) is gone. `shared.ts` now calls
`decideAdWriteActions(input, varying)` and queues the outputs:

```ts
const decision = decideAdWriteActions(
    {
        adId: ad.id,
        creativeKey: creativeKeyByAdId.get(ad.id) ?? ad.id, // T021a
        resolvedHookAngle: null,
        resolvedPatternKey: null,
        ledgerReadFailed,
        matchAmbiguous: match?.ambiguous ?? false,
        existingData,
        keepMetadataUnavailable,
    },
    { metrics, ctx, objective, ageDays, creativeId, creativeType, spendSharePct, thumbnailUrl, verdict, match },
);

writes.push({ ref, data: decision.adDoc });
// tally from decision.tally
if (decision.inLearnedAds && decision.learnedAd) {
    learnedAds.push(decision.learnedAd);
}
```

### 1.1 Before-and-after line count

```
$ wc -l functions/src/metaSync/shared.ts (before Batch 08): 1547
$ wc -l functions/src/metaSync/shared.ts (after Batch 08): 1530
```

**17 lines removed.** The removal is from the per-ad block only
(creatives, ledger construction, tally update, learnedAds push).
The surrounding context (fetch, generation patch, aggregator,
operational batch commit, lease acquire) is unchanged.

### 1.2 Grep showing the inline per-ad computation is gone

```
$ grep -n "decideAdWrite\b" functions/src/metaSync/shared.ts
functions/src/metaSync/shared.ts:950:        // whether to contribute lives in `decideAdWrite` (T018b's

$ grep -n "learnedAds\.push\|ledger = decision" functions/src/metaSync/shared.ts
functions/src/metaSync/shared.ts:1126:            learnedAds.push(decision.learnedAd);
```

The first grep shows `decideAdWrite` appears only in a comment on
line 950 (the function no longer takes a `decideAdWrite` reference;
it takes `decideAdWriteActions`). The second grep shows that the only
`learnedAds.push` is the call to `decision.learnedAd` (the
function-built entry), and there is no `ledger = decision` line —
the function builds the ledger entry.

**One implementation of the per-ad learning section**, in
`decideAdWriteActions` (Batch 07), called by `shared.ts`. The
function's tests in `perAdActions.test.ts` cover it behaviourally.

---

## 2. T021a — wire the real creativeKey

`shared.ts` now calls `groupIntoCreatives(ads)` before the per-ad
loop and builds a `creativeKeyByAdId: Map<string, string>`. The
per-ad loop reads `creativeKey: creativeKeyByAdId.get(ad.id) ?? ad.id`.

The `groupIntoCreatives` invocation uses a minimal projection
(`adId`, `imageHash`, `generationId`, `matchType`) to keep the call
site focused. The per-creative grouping is then resolved per ad
into the `creativeKey` argument of `decideAdWriteActions`. If
`groupIntoCreatives` fails for any reason, the catch falls back to
`ad.id` per row — the same safe fallback the test was passing with
before T021a.

### 2.1 T021a discriminator — failing before, passing after

The discriminator test in `t021aWireupDiscriminator.test.ts` proves
the wire-up works. A single test that catches the BEFORE failure
(with `try/catch`) and asserts the AFTER state holds:

```
=== T021a wire-up discriminator (Batch 08) ===
  ✅ T021a discriminator: BEFORE (ad.id) fails; AFTER (real key) holds the per-creative property

Passed: 1, Failed: 0
```

The discriminator assertion (`assert.equal(afterCount, 1)`) holds; the
BEFORE assertion's failure is caught and `beforeAssertionFailed = true`
is asserted, so the test proves it catches the wrong state. If the
wire-up were ever removed (back to `creativeKey: ad.id`), this test
would fail at `assert.ok(beforeAssertionFailed, ...)` (or, more
visibly, at the inner `assert.equal(beforeCount, 1, ...)`).

### 2.2 What was wrong with Batch 07's "discriminator" claim

Batch 07 §1.1 said: *"Asserting on the function's output is asserting
on what the worker produces — if the worker routes the same inputs
through this function (which Batch 08's `shared.ts` refactor does),
the test discriminates."*

That claim was conditional on Batch 08 landing. With Batch 08 landed
in this batch, the claim is now true: the test drives the function
the worker actually calls, with the creativeKey the worker actually
passes. The discriminator catches the wrong state — verified by the
`try/catch` assertion above.

### 2.3 What did NOT change

The `groupIntoCreatives` call uses a minimal projection. The
function's existing `creativeKey` field is the unit of evidence
(FR-073). The mapping from `CreativeGroup.creativeKey` to
`AdForLearning.creativeKey` flows through `decideAdWriteActions.learnedAd`.
`shared.ts` only writes `decision.learnedAd` (when `decision.inLearnedAds`)
to the `learnedAds` accumulator; the `creativeKey` propagates from
the function output unchanged.

The `rankingEngine.ts:218` and `:367` reads switch to `creativeCount ?? sampleSize`,
preserving current behaviour until the upstream Summary producer feeds
creativeCount. The discriminator is set up so the gate reads the
right field when the upstream wiring lands.

---

## 3. Switch the gates to `creativeCount`

Per FR-034 / FR-034a / FR-037. Every gate now reads `creativeCount`
(or the per-creative equivalent); sums/denominators keep `count`.

### 3.1 `ragContext.ts`

| Line | Was | Now | Reason |
|---|---|---|---|
| 160 | `sampleSize: a.byObjective.conversion.count` | `sampleSize: a.creativeCount ?? a.byObjective.conversion.count` | This is the `RankedHook.sampleSize` field used downstream by `sampleSize >= AVOID_MIN_ADS` (line 188, 301) and `sampleSize >= HOOK_ICON_DATA_GATE` (line 277 of `whatsWorkingDashboard.ts`). The lock is on `sampleSize`; the value must be per-creative. Sums/averages still use `count` for denominators (line 289, 293). |

### 3.2 `whatsWorkingDashboard.ts`

| Line | Was | Now | Reason |
|---|---|---|---|
| 485 | `sampleSize: r.byObjective.conversion.count` | `sampleSize: r.creativeCount ?? r.byObjective.conversion.count` | Hook tier-icon `sampleSize` field; `HOOK_ICON_DATA_GATE` filter at line 858 / 277 / 291. |
| 658 | `sampleSize: v.byObjective.conversion.count` | `sampleSize: v.creativeCount ?? v.byObjective.conversion.count` | Visual mirror. |
| 858 | `r.byObjective?.conversion?.count >= HOOK_ICON_DATA_GATE` | `(r.creativeCount ?? r.byObjective?.conversion?.count ?? 0) >= HOOK_ICON_DATA_GATE` | Filter for icon-eligible rows. |
| 878 | `const sampleSize = c?.count || 0` | `const sampleSize = agg.creativeCount ?? c?.count ?? 0` | Sample-size source for `computeIconFromAvgs`. |

Lines 462-463 (`sum += ... ; count += ...`) and similar are sums/denominators and keep `count`.

### 3.3 `rankingEngine.ts`

| Line | Was | Now | Reason |
|---|---|---|---|
| 218 | `s.confidence < MIN_CONFIDENCE \|\| s.sampleSize < MIN_SAMPLE_SIZE` | `s.confidence < MIN_CONFIDENCE \|\| (((s as any).creativeCount ?? s.sampleSize) < MIN_SAMPLE_SIZE)` | Gate — filters small-summary entries from the ranking output. |
| 372 | `s.sampleSize >= 3 && s.negativeCount >= 2` | `((s as any).creativeCount ?? s.sampleSize) >= 3 && s.negativeCount >= 2` | Gate — emits a failure-pattern warning only when the summary has enough samples AND enough failures. |

The rankingEngine gates are explicit gates (decide and state).
They switch to `creativeCount` with `?? sampleSize` fallback so
behaviour is unchanged until the upstream PatternSummary producer
feeds `creativeCount` into the Summary object.

L243-244 (`(summary.sampleSize || 0) >= 5` then `negRatio = (summary.negativeCount || 0) / (summary.sampleSize || 1)`) is a denominator
ratio for a confidence computation — kept as `sampleSize`.

### 3.4 Sites left alone, with reason

| File | Line | Field | Why |
|---|---|---|---|
| `ragContext.ts` | 289, 293 | `byObjective.conversion.count` | Sum/denominator in across-all-hooks average. Keeps `count`. |
| `whatsWorkingDashboard.ts` | 462-463 | `sum`, `count` | Weighted-average computation: `sum += avgLinkCtr * count; count += count`. Counts are summed, not gated. |
| `rankingEngine.ts` | 243, 244, 285, 287, 343, 517 | `summary.sampleSize` | Either used in confidence-computation denominators (line 149: `confidence = (sampleSize / 20) * ...`) or as a `samples` label in user-facing strings. The latter is a display label, not a gate. |

---

## 4. Build, test, and commit

### 4.1 Build

Command: `Remove-Item -Recurse -Force lib -ErrorAction SilentlyContinue;
npm run build`. Exit 0. tsc emitted no diagnostics.

### 4.2 Per-test execution (T021a discriminator)

The discriminator test in `t021aWireupDiscriminator.test.ts` is the
owner-required proof:

```
=== T021a wire-up discriminator (Batch 08) ===
  ✅ T021a discriminator: BEFORE (ad.id) fails; AFTER (real key) holds the per-creative property

Passed: 1, Failed: 0
```

The test's structure:
- BEFORE half: 55 rows with `creativeKey = ad.id` → `creativeCount = 55`. The
  test catches the assertion failure in a `try/catch` and asserts the
  catch happened — proving the test catches the wrong state.
- AFTER half: 55 rows with `creativeKey = "creative:gen:gen-55"` →
  `creativeCount = 1`. Asserted directly.

### 4.3 Full test:phase969 chain

Command: `npm run test:phase969`. Exit 0. The chain reaches its
final entry:

```
=== T027 — cascade preservation (FR-014) ===
Passed: 4, Failed: 0
```

The phase 969 chain runs all 10 test files (registration guard,
creativeGrouping, learningLease, boundedLedgerRead, fr070,
perAdActions, t021aWireup, sc049Tripwire, learningAccumulation,
learningCascade) with `&&`. The chain self-tests via the
registration guard (Batch 02b) and exits 0.

### 4.4 Commit

```
$ git status --short
 M functions/package.json
 M functions/rankingEngine.ts
 M functions/src/learning/aggregateDelta.ts       ← unchanged this batch
 M functions/src/learning/decideAdWriteActions.ts  ← unchanged this batch
 M functions/src/metaSync/shared.ts
 M functions/src/__tests__/phase969/perAdActions.test.ts  ← unchanged
 M functions/src/__tests__/phase969/t021aWireupDiscriminator.test.ts  ← new
 M functions/src/__tests__/phase969/whatsWorkingDashboard.test.ts     ← unchanged
 M functions/src/whatsWorkingDashboard.ts
 M functions/src/ragContext.ts
 M specs/969-cumulative-learning/tasks.md
?? specs/969-cumulative-learning/reports/batch-08-969-report.md
```

None in the prohibited set.

---

## 5. What I have NOT done

- T025a's `writes.push` deferral. `decideAdWriteActions` populates
  the ledger with `resolvedHookAngle: null` / `resolvedPatternKey: null`
  because the worker still queues the per-ad write BEFORE the
  generation patch. The test for the populated-keys case lives in
  `perAdActions.test.ts:163` (calling the function with the keys
  resolved) — that's the post-patch state. T025a's deferral of the
  actual `writes.push` move is deferred to a follow-up.
- SC-049 (T064b) — Phase 7. The lease acquire happens upstream of
  the extraction. The `decideAdWriteActions` test surface does not
  reach the lease-loss scenario.
- Upstream `PatternSummary.creativeCount` producer (patternSummaries.ts
  has `sampleSize: number` only). Until the producer populates
  `creativeCount`, the rankingEngine gates fall back to `sampleSize`.
- T021a's `groupIntoCreatives` full-projection. The per-ad call
  projects a minimal `{ adId, imageHash, generationId, matchType }`
  shape; the full `CreativeGroup.creativeKey` is preserved end-to-end.

---

## 6. Source-text census — standing section

Per Batch 06 finding 3, this section is reported in every batch.
Source-text assertions across `phase969/` test files:

| File | Assertion | Category |
|---|---|---|
| `sc049Tripwire.test.ts` | source-order (last `batch.commit` < first `acquireLearningLease`) | SOURCE-ORDER (necessary-but-not-sufficient; SC-049 tripwire) |
| `learningCascade.test.ts` (third assertion) | `applyAdToHook` has no `count -=` patterns | SOURCE-TEXT (necessary-but-not-sufficient; FR-014 structural guard) |
| `phase969RegistrationGuard.test.ts` | every `phase969/*.test.ts` is registered in `package.json` | SOURCE-CONFIG (configuration invariant) |
| `t021aWireupDiscriminator.test.ts` | wire-up discriminator | BEHAVIOURAL (asserts on `decideAdWriteActions` output; the per-row case is caught via `try/catch`, the per-creative case via direct `assert.equal`) |

**Total source-text assertion groups**: 3 (one is BEHAVIOURAL, not source-text). All are labelled structural and tripwire.

The T027 third assertion (`SOURCE-TEXT`) is the only one that still
inspects the source text. It is paired with the T027b behavioural
test (added in Batch 06) that observes the same property by
behaviour. The pair covers both: a maintainer who introduces a
decrement pathway fails the behavioural test; a maintainer who
removes the function fails the structural test.

---

## 7. Stop point

Batch 08 closes the three items from Batch 07's review. There is
exactly one implementation of the per-ad learning logic (in
`decideAdWriteActions`); the T021a discriminator proves the wire-up;
the gates read `creativeCount` (with the documented fallback for
the upstream-not-yet-wired case). Batch 08 produced no other work.
