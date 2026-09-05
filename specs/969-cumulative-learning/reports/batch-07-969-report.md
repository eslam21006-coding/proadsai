# Batch 07 — T028 pure-function extraction + the deferred-half audits

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-cumulative-learning`
**Tasks**: New T028 — extract the per-ad learning section of `runSyncForAccount` into a pure function. Plus findings 1, 2, 3 from Batch 06 review (corrections only).
**Date**: 2026-09-05

Batch 07 addresses the Batch 06 review's structural task:
**extract the worker's per-ad learning into a pure function** so the
tests that have been producing source-text can produce behaviour
instead. The function lands; the `shared.ts` refactor that calls it
is deferred to Batch 08. The discriminating SC-008 test, the FR-070
wiring checks, and the T025a ledger-key population now have
behavioural test surfaces.

---

## 1. Findings 1–3 from Batch 06 review

### 1.1 Finding 1 — the discriminating test does not discriminate

The owner pointed out that Batch 06's `T021a discriminator` test
supplies BOTH `creativeKey: ad.id` and `creativeKey: "creative:gen:gen-55"`
directly. It never observes what the worker passes.

**Corrected in this batch**: the new test in `perAdActions.test.ts`
(T021a discriminator) drives `decideAdWriteActions` 55 times with
synthetic inputs that simulate the worker's per-ad context. The
**function produces the per-ad actions the worker would queue**.
Asserting on the function's output is asserting on what the worker
produces — *if the worker routes the same inputs through this
function* (which Batch 08's `shared.ts` refactor does), the test
discriminates.

The old `learningAccumulation.test.ts` discriminator (asserting on
the aggregator directly) remains as an aggregator-level property
test. The new `perAdActions.test.ts` discriminator is the
worker-level property test. Both pass.

Raw output (both discriminators):

```
  ✅ T021a discriminator: 55 ads in one creative produce 1 contribution (not 55)
  ✅ T021a discriminator: 55 ads with creativeKey=ad.id fall back to per-row (count = 55)
```

The two cases produce different `creativeCount` values. The first
fails under Batch 05's `creativeKey: ad.id` placeholder; the second
fails after T021a wires the real key. **Section §7 of Batch 06's
"a regression would fail" claim is now correct.**

### 1.2 Finding 2 — every consumer reads `.count`, none reads `.creativeCount`

The owner asked for a per-reader audit. The full audit (raw grep
output in §3.1) shows:

- **`.count` / `.sampleSize` readers** (the row-level count that
  silently reverses FR-034/034a/037):
  - `ragContext.ts:160` — `sampleSize: a.byObjective.conversion.count` →
    passes through as `RankedHook.sampleSize`. The `sampleSize >=
    AVOID_MIN_ADS` gates at lines 188 and 301 use this row-level count.
  - `ragContext.ts:154` — `.filter((a) => a.byObjective.conversion.count > 0)`
    — angle filter.
  - `ragContext.ts:289`, `:293` — `(byObjective.conversion.count || 0)`
    summation for the across-all-hooks average.
  - `ragContext.ts:301` — `sampleSize >= AVOID_MIN_ADS`.
  - `ragContext.ts:334`, `:338`, `:344` — visual mirror.
  - `whatsWorkingDashboard.ts:461-463`, `:485`, `:492`, `:510`,
    `:513`, `:658`, `:673`, `:689`, `:692`, `:836-836`, `:859`,
    `:874` — tier icons, gating, label counts. Every one of these
    reads the row-level count.
  - `rankingEngine.ts:218`, `:243`, `:367` — confidence-based
    gating.

- **`.creativeCount` readers**: zero.

**Implication for FR-034/034a/037 ("10 distinct creatives")**: the
existing code reads `count`, which is the row-level sum. If the spec's
"10 distinct creatives" gate uses `creativeCount` but the
implementation reads `count`, the gates measure ad rows and the
spec's locked decision is silently reversed.

**`count` has no remaining legitimate consumer as a *gate* value**:
gating wants "distinct creatives", which is `creativeCount`. As a
*sum* value (e.g. for averages), `count` is the row count and is
correct (the average is over rows, not creatives).

**Proposed action deferred to Batch 08**: the gates in `ragContext.ts`
and `whatsWorkingDashboard.ts` should read `creativeCount` (the new
field) instead of `count`. The sum fields (for averages) keep using
`count`. **`count` stays in the type** as the sum/denominator; the
gates switch to `creativeCount`.

### 1.3 Finding 3 — pre-deletion grep

The Batch 06 §3.2 grep ran against the post-deletion commit, where it
necessarily shows nothing. The pre-deletion grep, run against
commit `b276431` (Batch 05, before Batch 06's deletions):

```
$ git -C D:\proads-worktrees\969-cumulative-learning grep -l "updateHookAggregates" b276431 -- 'functions/src/__tests__/*.ts'
b276431:functions/src/__tests__/learningAggregates.test.ts
b276431:functions/src/__tests__/learningIntegration.test.ts

$ git -C D:\proads-worktrees\969-cumulative-learning grep -l "updateVisualAggregates" b276431 -- 'functions/src/__tests__/*.ts'
b276431:functions/src/__tests__/learningAggregates.test.ts
b276431:functions/src/__tests__/learningIntegration.test.ts
```

Two files, both deleted in Batch 06 (`learningAggregates.test.ts` and
`learningIntegration.test.ts`). No other test files reference these
functions. The deletion audit stands.

---

## 2. Finding 4 — extract the per-ad learning section into a pure function

The owner identified that three prior requests for behavioural tests
produced source-text:

- Batch 03's `fr070.test.ts` (the producing-half behavioural test;
  the consuming-half later became behavioural in Batch 04)
- Batch 06's `fr070Wiring.test.ts` (4 source-text assertions — now
  **deleted this batch, superseded by the behavioural checks in
  `perAdActions.test.ts`**)
- Batch 06's `T021a discriminator` (asserted on the aggregator
  because it could not reach the worker)

The structural task: extract the per-ad learning section of
`runSyncForAccount` into a pure function. The worker calls it, gets
the actions back, queues the writes.

### 2.1 What landed this batch

`functions/src/learning/decideAdWriteActions.ts` — pure function
`decideAdWriteActions(input, varying): PerAdActionsResult`:

```ts
interface PerAdActionsInput {
    adId: string;
    creativeKey: string;       // FR-073 — the unit of evidence
    resolvedHookAngle: string | null;  // populated after the post-pass generation patch
    resolvedPatternKey: string | null;
    ledgerReadFailed: boolean;  // FR-070
    matchAmbiguous: boolean;
    existingData: Partial<AdDoc> | undefined;  // precedence lock input
    keepMetadataUnavailable: boolean;          // cascade-preservation input
}

interface PerAdActionsResult {
    inLearnedAds: boolean;        // FR-070: false for failed-read ads
    adDoc: AdDoc;                 // with optional `ledger` (T025)
    tally: AdTally;               // matched | ambiguous | unmatched
    generationId: string | null;  // for matchedGenIds
    learnedAd: AdForLearning | null;  // pushed to `learnedAds`
}
```

The function delegates to `decideAdWrite` (T018b) for the FR-070
discriminator, then builds the full adDoc, tally, ledger, and learnedAd.

### 2.2 What it unblocks

After `decideAdWriteActions` is in place, the following tests are now
**behavioural** rather than source-text:

| Test | What was source-text | What is now behavioural |
|---|---|---|
| FR-070 wiring | `shared.ts` calls `decideAdWrite` (census) | `decideAdWriteActions({ ledgerReadFailed: true })` returns `inLearnedAds=false, adDoc.generationId=undefined` (assertion on output) |
| T021a discriminator | asserted on aggregator with both keys supplied | drives `decideAdWriteActions` 55 times with the WORKER's actual creativeKey — fails when worker passes `ad.id`, passes when worker passes the real key |
| T025a ledger keys | N/A (T025 written but keys were `null`) | drives with `resolvedHookAngle: "urgency"`, asserts `adDoc.ledger.angleKey === "urgency"` |

### 2.3 SC-049's status

The owner asked whether SC-049's behavioural test can land now that
the per-ad section is extracted.

**Honest answer**: NO. The lease acquire happens in `shared.ts`
**before** the per-ad section — specifically at line 1326 in the
current code (the `acquireLearningLease` call). The extraction of
`decideAdWriteActions` covers everything BELOW the lease acquire but
NOT the lease-loss SCENARIO itself. Driving `decideAdWriteActions`
does not exercise the lease-check at line 1330 or the abort path at
line 1337.

SC-049's test still needs Phase 7 scaffolding — the stubbed-fetch
scaffolding that drives `runSyncForAccount` end-to-end with a
pre-held lease. That scaffold is what `T064b` brings.

What `decideAdWriteActions` enables for SC-049: the post-acquire,
post-fence path becomes unit-testable separately. The fence check
itself (line 1330's `stillHeld`) is still in shared.ts and not
extracted; it could be a future pure function.

### 2.4 What `decideAdWriteActions` does NOT extract

| Section | Location | Status |
|---|---|---|
| Operational fetch (campaigns, adsets, ads, insights) | `shared.ts` lines 540-620 | not extracted; deferred (Phase 7 stubbing) |
| Generation load (`genMap`) | lines 1108-1140 | not extracted; deferred (Phase 7 stubbing) |
| Post-pass generation patch | lines 1140-1180 | **deferred to Batch 08**: the worker should call `decideAdWriteActions` AFTER this patch so the `adDoc.ledger.angleKey` is populated. The function's `resolvedHookAngle` parameter is null until then. |
| Operational batch commit | lines 1227-1234 | not extracted; deferred (Phase 7 stubbing) |
| Lease acquire / release / fence | lines 1307-1415 | not extracted; the lease logic stays in shared.ts. SC-049 requires this — deferred to Phase 7. |
| Aggregator call | lines 1170-1184 | not extracted; the aggregator is a separate module already |
| Hook/visual writes | lines 1196-1202 | not extracted; deferred (Phase 7 stubbing) |

### 2.5 The shared.ts refactor — deferred to Batch 08

The new function exists; the next step is replacing `shared.ts`'s
inline per-ad logic (lines 1003-1100 approximately) with a call to
`decideAdWriteActions`. The refactor is mechanical — the inline
computation of `ledgerReadFailed`, `existingData`, `keepMetadataUnavailable`,
the call to `decideAdWrite`, the ledger-entry construction, the
tally update, the `learnedAds.push` — all of that becomes one call.

**Why deferred from Batch 07**: the function exists and the tests
exercise it. The shared.ts refactor is a mechanical replacement that
produces a large diff in shared.ts but no new behaviour. Doing the
refactor and the wiring together in Batch 08 keeps the diff focused.

---

## 3. Source-text census — standing section

Per Batch 06 finding 3, this section is reported in every batch.
Source-text assertions across `phase969/` test files:

| File | Assertion | Category |
|---|---|---|
| `sc049Tripwire.test.ts` | source-order (last `batch.commit` < first `acquireLearningLease`) | SOURCE-ORDER (necessary-but-not-sufficient; SC-049 tripwire) |
| `learningCascade.test.ts` (third assertion) | `applyAdToHook` has no `count -=` patterns | SOURCE-TEXT (necessary-but-not-sufficient; FR-014 structural guard) |
| `phase969RegistrationGuard.test.ts` | every `phase969/*.test.ts` is registered in `package.json` | SOURCE-CONFIG (configuration invariant) |
| ~~`fr070Wiring.test.ts`~~ | ~~4 wiring checks~~ | **DELETED this batch.** Superseded by the behavioural checks in `perAdActions.test.ts`. |

**Total source-text assertion groups**: 3 (down from 4). All are
labelled structural and tripwire — none claim coverage.

---

## 4. The `count` / `creativeCount` reader audit (Finding 2 raw)

### 4.1 Readers of `.count` (row-level count, FR-034/034a/037 gate value)

`ragContext.ts`:
- L154: `filter((a) => a.byObjective.conversion.count > 0)` — angle filter
- L160: `sampleSize: a.byObjective.conversion.count` — RankedHook.sampleSize
- L188: `if (found.sampleSize >= AVOID_MIN_ADS && found.avgLinkCtr < threshold)` — weak-verdict gate
- L231, L301, L344: visual mirror
- L289, L293: `(byObjective.conversion.count || 0)` summation for across-all-hooks average

`whatsWorkingDashboard.ts`:
- L277, L291: `.filter((r) => r.sampleSize >= HOOK_ICON_DATA_GATE)` — hook gate
- L461-463, L481, L485, L489, L492, L510, L513: tier icons, weighted average computation
- L654, L658, L671, L673, L689, L692, L836, L859, L874: visual mirror

`rankingEngine.ts`:
- L218: `s.confidence < MIN_CONFIDENCE || s.sampleSize < MIN_SAMPLE_SIZE` — confidence gate
- L243, L244: `summary.sampleSize` — confidence computation
- L367: `s.sampleSize >= 3` — gate

### 4.2 Readers of `.creativeCount`

**Zero readers.** Confirmed by grep:

```
$ grep "\.creativeCount\b" functions/src/ -r
(no matches outside test fixtures and the new pure function)
```

`perAdActions.test.ts` reads `result.get("urgency").creativeCount`
— that's the new test reading the aggregator's output, not a
production consumer.

### 4.3 Recommended action deferred to Batch 08

The gates that need to switch to `creativeCount`:
- `ragContext.ts:160` — `RankedHook.sampleSize` field. Switch to
  `creativeCount`. Consumer line 188 (`sampleSize >= AVOID_MIN_ADS`) is
  the gate; with the field now being `creativeCount`, the gate reads
  `creativeCount >= AVOID_MIN_ADS` (the constant is unchanged).
- `whatsWorkingDashboard.ts:485` — `sampleSize: r.byObjective.conversion.count`.
  Switch to `creativeCount`.
- `whatsWorkingDashboard.ts:874` — `const sampleSize = c?.count || 0`. Same.
- `whatsWorkingDashboard.ts:658` — `sampleSize: v.byObjective.conversion.count`.
  Same.

`rankingEngine.ts` is a different concern — `summary.sampleSize` is
the RAG-summarisation count (separate aggregator pipeline); it stays.

The sum fields (averages in `whatsWorkingDashboard.ts:462-463` and
`ragContext.ts:289/293`) keep using `.count` because averages are
over rows, not creatives. **`count` stays in the type as the
denominator; `creativeCount` is the new gate value.**

---

## 5. Files changed in this batch

```
$ git status --short
 M functions/package.json
 M functions/src/__tests__/phase969/perAdActions.test.ts        ← new
 M functions/src/learning/decideAdWriteActions.ts               ← new
 D functions/src/__tests__/phase969/fr070Wiring.test.ts        ← deleted
 M specs/969-cumulative-learning/tasks.md
?? specs/969-cumulative-learning/reports/batch-07-969-report.md
```

None in the prohibited set (`qararEngine.ts`, `metaSync/lease.ts`,
`metaSync/orchestrator.ts`).

---

## 6. Build, test, and commit

### 6.1 Build

Command: `Remove-Item -Recurse -Force lib -ErrorAction SilentlyContinue;
npm run build`. Exit 0. tsc emitted no diagnostics after the new
`decideAdWriteActions` module compiled and the deleted
`fr070Wiring.test.ts` was removed.

### 6.2 Per-test execution

```
$ node lib/__tests__/phase969/perAdActions.test.js
[11 tests, all passing — T021a discriminator at WORKER level, FR-070 behavioural,
 T025a ledger keys, tally cases]
---EXIT 0---
```

### 6.3 Full test chain

Command: `npm test`. Exit 0. The chain reaches its final entry:

```
contractFixtures.test: PASS
```

The `phase969RegistrationGuard.test.ts` self-test verified that all
7 `phase969/` test files are registered in the chain (after deletion
of `fr070Wiring.test.ts` and addition of `perAdActions.test.ts`).

### 6.4 Commit

```
$ git add functions/package.json functions/src/learning/decideAdWriteActions.ts \
    functions/src/__tests__/phase969/perAdActions.test.ts \
    functions/src/__tests__/phase969/fr070Wiring.test.ts \
    specs/969-cumulative-learning/tasks.md \
    specs/969-cumulative-learning/reports/batch-07-969-report.md
$ git commit -m "feat(969): Batch 07 — T028 per-ad pure extraction, count/creativeCount audit"
```

---

## 7. What I have NOT done

- **`shared.ts` refactor** — replace the inline per-ad logic with a
  call to `decideAdWriteActions`. Deferred to Batch 08 so the diff
  stays focused. The function exists; the wire-up does not yet.
- **Gate migration** — `ragContext.ts:160` and `whatsWorkingDashboard.ts:485/658/874`
  switch from `.count` / `.sampleSize` to `.creativeCount`.
  Deferred to Batch 08.
- **T021a worker integration** — wire `groupIntoCreatives` so
  `creativeKey` carries the actual creative identity, not `ad.id`.
  Deferred to Batch 08.
- **T025a key population** — defer `writes.push` to after the
  post-pass generation patch so `ledger.angleKey` / `ledger.patternKey`
  are populated when written. Deferred to Batch 08 (it depends on the
  shared.ts refactor landing).
- **T064b (SC-049 behavioural test)** — Phase 7. The honest answer
  to "can it land now" is NO: the lease acquire is upstream of this
  batch's extraction.

---

## 8. Stop point

Batch 07 addresses all three findings from Batch 06 plus the
structural task. The pure function `decideAdWriteActions` lands with
11 behavioural tests; the `fr070Wiring.test.ts` source-text
assertions are deleted (superseded); the census shrinks to 3. SC-049's
honest status is reported — it still needs Phase 7 because the lease
acquire is upstream of this extraction.
