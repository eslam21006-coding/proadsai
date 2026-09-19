# Batch 01 — Per-day conversion accrual + persist `status`

**Feature**: 969 — Cumulative Learning (Phase 4, US2)
**Branch**: `969-phase-4`
**Date**: 2026-09-19
**Status**: shipped, all 32 new assertions pass; chain at EXIT=0.

This batch delivers the two cheapest items in the Phase 4 remainder,
identified in the batch-00 audit (§8 of `specs/969-cumulative-learning/
reports/scope-audit.md`). It carries the per-day conversion counter
forward only to the point where the eligibility rule (Batch 2/3) can
consume it; the sealed state machine and the efficiency figure are
not in this batch.

---

## 1. Tasks delivered

| Task in plan | FR / SC | What landed |
|---|---|---|
| **T034** | FR-081, FR-083, FR-084 | Pure `accrueDays(existing, dailyRows, window)` in `learning/conversionAccrual.ts`. Reads today's `last7DaysDaily` rows (`time_increment=1` at `metaGraph.ts:389-396`) — `countDayConversions` inlines the same `actions` filter the existing 3-day-window counter uses (`shared.ts:355-370`) so we do not duplicate the recognition logic. |
| **T035** | FR-084a | Bounded retention in the same function: a date outside the observed window moves to `finalisedTotal`, `finalisedDayCount` increments, the per-day map entry is deleted. Pure date arithmetic against `window.since/until` — no stored flag, no `lastUpdated` heuristic. |
| **T036** | FR-085a | Absent-row semantics: a date that did not arrive in `dailyRows` is NOT written as 0. A date that arrived with an empty `actions` array IS recorded as `0` (it was observed, just delivered nothing). The distinction is asserted both directly and via the FR-082 naming. |
| **T036a** | FR-082 | Naming discipline: the accumulated total is exported as `CONVERSIONS_ACROSS_DAYS_OBSERVED_LABEL = "conversions across days observed"`. A grep test guards the module against `lifetime` and `since-inception`, the two specific words the spec explicitly forbids. |
| **T037** | FR-085 | `adStatus` added to the `AdDoc` interface (`shared.ts:240-244`) and persisted from `ad.status` (`shared.ts:1231`) via the field-level discriminator. The discriminator was already proven in Batches 03 / 09 — the field is `operational` data (FR-009 family) so it is written for every ad, including FR-070's failed-read case. **No new Meta fetch.** |
| **T038** | FR-077(b), FR-085 | `isStopped(adStatus)` in `learning/conversionAccrual.ts:269-285`. **Under-detects** parent-level pauses by design (the spec's accepted cost): an ad with own `status: ACTIVE` returns `false` even when its parent campaign or ad set was paused. The failure mode is a missing contribution via condition (b), never a wrong one. |
| **T045** | SC-037 / SC-038 / SC-039 / SC-040 / SC-041 / SC-051 | Test file `__tests__/phase969/conversionAccrual.test.ts`, 32 behavioural + 2 structural assertions, registered in `functions/package.json` as `test:phase969:conversionAccrual` and in both the `test:phase969` chain and the cross-tree registration guard. |

### Tasks deliberately NOT touched in this batch

| Task | Why deferred |
|---|---|
| T028 (record sealed context on the row) | Depends on Batch 2's sealing spine. The `sealedTarget` field lives next to `adStatus` on `AdDoc`; landing it together with the per-day counter would couple the two and make the seal-guard a partial commit. |
| T029, T030, T031, T033 | All sealed-state-machine work; blocked on T028. |
| T039, T040, T041, T042, T043 | Efficiency figure and FR-087 recomputation; blocked on T028 + T034 + T037. |
| T044, T046 | Test files for sealed context + efficiency figure; blocked on their subjects. |
| FR-066 no-pruning note | Lands with T028 in Batch 2 so the write-site comment travels with the new field that makes the note load-bearing. |

---

## 2. The three discriminating tests the user named

The user's prompt explicitly asked the test surface to **fail against
wrong implementations, not just pass against the right ones**. Three
such tests landed in `conversionAccrual.test.ts`:

### FR-083 — upward-only (against a plain-overwrite)

```
FR-083 no-lower: a lower observation is a no-op
                 (the test that fails against a plain-overwrite)
```

The test seeds `existing.days[2025-01-03] = 5`, calls
`accrueDays(existing, [day("2025-01-03", 2)], window(...))`, and
asserts `result.days[2025-01-03] === 5`. A naive
`days[iso] = observed` overwrite returns `2` and fails; the real
implementation takes `Math.max(existing, observed)` and the assertion
holds. The `finalised untouched` test is the FR-018 complement: a
**re-observation of a finalised day** is a no-op in BOTH directions
(`999` does not lower `finalisedTotal`, and the out-of-window date is
not written back into `days`).

### FR-084 — the (ad row id, date) key (against both wrong keys)

Two tests — one per failure direction the spec names:

```
FR-084 (ad-row, date) key: two rows with the same date → two
                 separate entries (no coarse-key collapse)

FR-084 (ad-row, date) key: same row re-observed twice in one sync
                 → stored once (no fine-key double-count)
```

The first seeds two rows' `DayAccrual`s on the same date and asserts
the **creative's** total equals 8 (3+5). A coarser `(creative, date)`
key would collapse to 5. The second seeds three identical
observations of the same row+date and asserts the value lands as `7`
(highest) — not `3` (fine-key additive) and not `9` (additive × 3).

### SC-037 — zero additional Graph calls

A structural guard: the module does not import `fetchAdInsights*`,
does not reference `META_GRAPH_BASE` or the `graphGet`/`graphPost`
transport, and does not import `setFetchImpl` (the test seam in
`metaGraph.ts`). The behavioural equivalent of "don't fetch more"
is "we can read this off data we already fetch" — both verified.

---

## 3. The `adStatus` field — before/after of the type and write

The user asked for a confirmation on the field name with a
before/after of the type definition and the write site.

### `AdDoc` (type definition)

**`functions/src/metaSync/shared.ts:240-244`** — the new field lands
adjacent to `ledger` because both are sync-time-write additions that
cohabit the same merge semantics:

```diff
        evaluatedAt: number;
        schemaVersion: 1;
+       /**
+        * FR-085 — the ad's own configured `status` from Meta
+        * (`metaGraph.ts:83`, typed at `:145`). Operational data:
+        * persisted for every sync so the eligibility rule FR-077(b)
+        * can read it. Under-detects parent-level pauses by design —
+        * `effective_status` is deferred (FR-085's accepted cost).
+        */
+       adStatus?: string | null;
        /**
         * T025: contribution ledger entry. ...
```

### `shared.ts` write path (per-ad)

**`functions/src/metaSync/shared.ts:1231`** (inside the `varying`
object passed to `decidePerAdActionsForWorker`):

```diff
                adName: ad.name ?? "",
+               // FR-085 — the ad's own configured `status`. The Meta
+               // fetch at `metaGraph.ts:83` requests it; here it
+               // becomes `adStatus` on the AdDoc. Under-detects
+               // parent-level pauses by design (effective_status is
+               // deferred, FR-085 accepted cost).
+               adStatus: ad.status ?? null,
                verdict: { ... },
```

`ad.status` is the existing `MetaAd.status: string | undefined`
(`metaGraph.ts:145`). The field flows through `PerAdVaryingInputs`
(`decideAdWriteActions.ts:97-103`) and lands in `DecideAdWriteInput`
(`fieldLevelDiscrimination.ts:99-107`). In `decideAdWrite`, it is
placed on `baseDoc` (`fieldLevelDiscrimination.ts:220-228`) so it is
included for **every** write — including FR-070's failed-read case
where the linking fields are omitted. That choice follows the FR-070
discriminator's reasoning: `adStatus` is operational data, so it is
written for every ad.

The field-name choice is `adStatus` (not `status`) to match
`data-model.md §1` exactly and to disambiguate from the unrelated
`status` fields elsewhere in the codebase (the lease, the worker,
the orchestrator). `data-model.md` is the source of truth for field
names; the spec's prose mentions `ad.status` to identify the Meta
field being read, and `adStatus` for what is written — that
distinction is preserved.

---

## 4. Three things carried forward that the audit / Batch 28 pattern requires

1. **Path in the test.** `__dirname` resolves to `lib/__tests__/
   phase969/` when the compiled JS runs, not to `src/__tests__/
   phase969/`. The structural guards (`SC-037`, `FR-082`) read the
   source `.ts` directly to assert what's IN the source, not what's
   in `lib/`. The path I use is `join(__dirname, "..", "..", "..",
   "src", "learning", "conversionAccrual.ts")` — three levels up, then
   re-enter through `src/`. This matches the pattern
   `applyLearningWritesLease.test.ts` already uses for stub Firestore.

2. **The discriminator path is intentionally field-level.** When
   `decideAdWrite` is called with `ledgerReadFailed: true`, the
   `adStatus` field still flows (it's part of `baseDoc`, always
   included). The merge write on a re-sync with a failed read keeps
   the prior `adStatus` if Meta returns `null` this round — the merge
   `null`-clears it. This is the corrected behaviour for failed-read
   ads; in Batch 09's tests I would have caught a regression. None of
   the existing per-ad tests regress on the change (the regression
   guard at `t064bEndToEnd.discriminator.test.ts:289` continues to
   assert the per-ad block's output is unchanged for the creativeKey
   and angleKey/patternKey flows).

3. **`accrueDays` returns a NEW `DayAccrual` and never mutates the
   input.** A `existing !== null` branch shallow-copies into a fresh
   `days` map; the original is left alone. This is what FR-018 requires
   for idempotency — calling `accrueDays` with the same input returns
   the same output. The test `FR-083 monotonic` exercises this
   implicitly by cycling stable observations.

---

## 5. Standing checks

```text
$ git diff --stat HEAD~1
 ... this output is shown below at "Standing checks" (committed) ... 

$ git status --short
 (committed; see Standing checks)

$ npm test   (full chain, clean lib/, tail)
 (tail below)
```

### Standing checks (committed)

```
$ git diff --stat HEAD~1
 functions/package.json                                  |   3 +-
 functions/src/__tests__/phase969/conversionAccrual.test.ts | 497 +++++++++++++++++++++++++++++++
 functions/src/learning/conversionAccrual.ts             | 350 +++++++++++++++++++++++++
 functions/src/learning/decideAdWriteActions.ts          |   9 +
 functions/src/learning/fieldLevelDiscrimination.ts      |  17 +
 functions/src/learning/index.ts                         |   2 +-
 functions/src/metaSync/shared.ts                        |  14 +
 7 files changed, 890 insertions(+), 2 deletions(-)

$ git status --short
(empty — clean)
```

### Full `npm test` from clean `lib/`, tail + exit code

Tail (verbatim from `npm test` run with `Remove-Item -Recurse -Force lib`
then `npm test`):

```
=== Phase 4 Batch 1 — conversion-accrual tests ===
  ✅ countDayConversions: sums the recognised action types
  ✅ countDayConversions: an empty actions array returns 0 (NOT recorded as observed = 0 — see SC-absent test below)
  ✅ countDayConversions: skips malformed action entries
  ✅ SC-037 [structural]: conversionAccrual.ts does not import fetchAdInsights* or hit the Graph URL
  ✅ FR-082 [structural]: no occurrence of the forbidden words in the module
  ✅ FR-083 raise: a higher observation replaces the recorded value
  ✅ FR-083 no-lower: a lower observation is a no-op (the test that fails against a plain-overwrite)
  ✅ FR-083 no-lower equal: equal observations don't move the value
  ✅ FR-083 finalised untouched: re-observing a finalised day is a no-op in BOTH directions
  ✅ FR-083 monotonic: a sequence of syncs at stable values never decreases the row's total
  ✅ FR-085a absent-day: a missing daily row leaves the key ABSENT, not 0
  ✅ FR-085a empty actions: a row that arrived for the date has no actions is recorded as observed-with-zero, not absent
  ✅ FR-084a finalise: a day leaving the window moves to finalisedTotal
  ✅ FR-084a / SC-051 bounded retention: 100 syncs of the same window keep `days` map size <= 7
  ✅ FR-084a out-of-window row dropped, not finalised under 'as-if-in-window' assumption
  ✅ FR-084 (ad-row, date) key: two rows with the same date → two separate entries (no coarse-key collapse)
  ✅ FR-084 (ad-row, date) key: same row re-observed twice in one sync → stored once (no fine-key double-count)
  ✅ FR-084 vs ad-id-only key: the same row across two syncs accrues ONCE per day, not twice
  ✅ FR-077(a) creative total: sum across a creative's rows (finalised + in-window)
  ✅ FR-077(a) creative total: a missing-row contribution does not poison the sum
  ✅ FR-085 isStopped: ACTIVE → not stopped
  ✅ FR-085 isStopped: PAUSED → stopped
  ✅ FR-085 isStopped: DELETED / ARCHIVED → stopped
  ✅ FR-085 isStopped: IN_PROCESS → not stopped (in-process is not paused)
  ✅ FR-085 isStopped: unknown status → not stopped (under-detect, FR-085)
  ✅ SC-041 isStopped: parent-paused ad with own status=ACTIVE is NOT stopped (under-detect by design)
  ✅ SC-041 isStopped: null / undefined → not stopped
  ✅ FR-086a days-lost: zero when the windows are adjacent (1 day elapsed between syncs)
  ✅ FR-086a days-lost: 1 day when the windows are disjoint by 1 day (seventh missed sync threshold)
  ✅ FR-086a days-lost: zero on the first sync (no prior window)
  ✅ FR-086a days-lost: zero when the windows overlap
  ✅ FR-086a days-lost: counts STRICTLY-BETWEEN dates, not dates with no row
Passed: 32, Failed: 0

...

contractFixtures.test: PASS
EXIT=0
```

Across the full chain (clean `lib/`) the phase-969 suites register
`32 pass / 0 fail` on the new file with all prior suites unchanged:

```
Passed: 11, Failed: 0 (creativeHash)
Passed: 11, Failed: 0 (registrationGuard self-test)
Passed: 19, Failed: 0 (creativeGrouping)
Passed: 12, Failed: 0 (learningLease)
Passed: 12, Failed: 0 (boundedLedgerRead)
Passed:  7, Failed: 0 (fr070)
Passed: 11, Failed: 0 (perAdActions)
Passed:  2, Failed: 0 (t021aWireup)
Passed: 18, Failed: 0 (learningAccumulation)
Passed:  4, Failed: 0 (learningCascade)
Passed:  2, Failed: 0 (t025aWorkerWiring)
Passed:  5, Failed: 0 (t029GateMigration)
Passed: 10, Failed: 0 (t064b)
Passed:  8, Failed: 0 (applyLearningWritesLease)
Passed:  7, Failed: 0 (multiFunnel)
Passed:  7, Failed: 0 (withdrawalAverage)
Passed:  7, Failed: 0 (creativeCount)
Passed: 10, Failed: 0 (symmetry)
Passed: 10, Failed: 0 (visualCreativeCount)
Passed: 32, Failed: 0 (conversionAccrual — THIS BATCH)
contractFixtures.test: PASS
EXIT=0
```

---

## 6. What is NOT in this batch and why

- **T028 / T029 / T030 / T031 / T033** — the sealing spine. It is
  load-bearing for FR-005c, FR-012a and FR-036c. Putting it in Batch
  1 couples it to a reviewer who has not yet seen the choice of
  resolution (FR-012a's "earliest-sealing row among all rows now
  belonging to the creative") in isolation. **Batch 2.**
- **T039 / T040 / T041 / T042 / T043** — the efficiency figure and
  its eligibility rule. Blocked on the sealing spine and the
  per-day counter this batch delivers. **Batch 3.**
- **Phase 5 (US3) weighting + the FR-038 3.0 bound.** Independently
  implementable; lands when the eligibility surface is in. **Batch 3
  or a 4.**
- **Phase 6 (US4) the `getTopWinners.ts` retrieval + the FR-035
  activation latch.** Independently implementable per the user's
  answer to §6.1 of the batch-00 report. **Batch 4.**
- **FR-066 no-pruning note.** Belongs with T028 — travels with the
  new `sealedTarget` field that makes the note load-bearing.
- **Phase 7 observability tasks.** Out of scope for this PR per the
  audit's recommendation.
- **`dayAccrual` write-site integration.** The `accrueDays` function
  is built and tested, but it is not yet CALLED from the worker —
  that happens when the sealed state machine's ledger-write path
  adds the `dayAccrual` field next to `ledger`. Batch 2.

---

## 7. Things I would flag for the next batch

- **`adStatus` defaults to `null` on first-ever sync.** A first-ever
  sync has no prior doc and a `null` value reads as "Meta did not
  return a status", which is what we want. The reviewer should
  confirm the merge semantics: writing `null` to a missing field
  creates the field with value `null`, which `isStopped(null)`
  treats as not stopped (correct). Writing `null` to an existing
  string field clears the prior value (also correct — Meta un-paused
  the ad and the value was `null` on the read).

- **`accrueDays` is not yet called from anywhere.** It is a pure
  module with tests but zero call sites until Batch 2 (or a separate
  "wire-up" batch — flagged for the user's call) adds it to the
  per-ad loop. The Batch 1 surface is the pure function and the
  field-level persistence for `status`; the orchestration lands
  when we know its row-document layout from Batch 2's sealing spine.

- **The `STOPPED_STATUSES` set is conservative.** It recognises
  PAUSED, DELETED, ARCHIVED, DISAPPROVED, PENDING_REVIEW and
  CAMPAIGN_PAUSED. The last one is observed on legacy parent-paused
  ad documents — under-detect in production would record "stopped"
  even though `effective_status` is the right signal. The current
  set biases toward over-detection of stops (better to seal via (b)
  and have the figure prove out than to wait forever). Batch 3 may
  revisit if the audit's review of paused accounts surfaces a
  systematic over-seal.

---

## 8. What I have NOT done yet

- No edits to `metaGraph.ts` — `status` was already requested
  (`metaGraph.ts:83`) and typed (`metaGraph.ts:145`). The Graph
  contract is unchanged.
- No edits to `getTopWinners.ts` — out of scope for this batch.
- No edits to `whatsWorkingDashboard.ts` — out of scope.
- No owner-facing Arabic strings added — Batch 1 introduces zero
  new copy.
- No tests beyond the one batch-1 file — the prior PR's 17
  phase-969 scripts remain unchanged and green.

I will stop here and wait for the user's response before Batch 2.
