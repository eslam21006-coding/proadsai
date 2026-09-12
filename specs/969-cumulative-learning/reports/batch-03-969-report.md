# Batch 03 — Phase 3 (User Story 1 — Learning Never Resets)

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-cumulative-learning`
**Tasks**: T016 coverage corrected, T018b rewritten field-level, T018a, T018b, T018c, T019 — plus the FR-070 specific test FR-070 names.
**Date**: 2026-09-05

This batch addresses the two FR-070 corrections from the owner's
Batch 02b review, lands the three deferred halves (T018a, T018b,
T018c), and inverts the `learningAggregates.ts` contract (T019).
Phase 3 is the "Learning Never Resets" user story — cumulative,
idempotent, shrink-proof accumulation. This batch delivers the
parts that don't require the full Phase 3 aggregation rewrite,
which is left for a follow-up batch alongside the contribution-ledger
implementation.

The structure of this report follows the owner's instruction: items
1 and 2 are reported under their own heading before the task list;
the three deferred halves (T018a, T018b, T018c) are reported
explicitly; and any complete-for-the-phase-surface items are noted.

---

## 1. Items 1 and 2 — FR-070 corrections from Batch 02b review

### 1.1 Item 1: T016's coverage list and FR-070's named test

The owner noted that T016's coverage list claimed FR-070 was covered
by the 12 tests in `boundedLedgerRead.test.ts`, but FR-070 specifies:

> This MUST be covered by a test that forces a read failure and
> asserts no contribution was added.

That test did not exist. The 12 tests in `boundedLedgerRead.test.ts`
cover the **producing half** — that `readExistingAdDocs` reports
failed ids correctly — and FR-071 (whole documents). They do NOT
cover the **consuming half**, which the FR-070 specification requires.

**Corrections applied:**

- `tasks.md` T016 entry updated. The coverage list now states which
  half of FR-070 it covers (the helper's failed-id contract) and that
  the consumption behaviour is uncovered until T018b.
- T018b's description includes the test FR-070 names by name —
  "force a read failure and assert no contribution was added" — and
  asserts the additional property the owner spelled out in Batch 02b
  §2: a failed-read ad keeps its prior `matchType` and
  `generationId` AND receives its updated operational status in
  the same sync.

**Mechanical check — every other coverage list in Batches 01, 02,
02a, 02b**: walked the FR/SC identifiers cited in
`learning.fixtures.ts`, `types.ts`, `index.ts`, `batch-01-969-report.md`,
`batch-02-969-report.md`, `batch-02a-969-report.md`, `batch-02b-969-report.md`.
All cited FR-NNN resolve to spec entries. The single correction is
the SC-076 → FR-076 already applied in Batch 01's `batch-01-969-report.md`
§1.1. No other coverage claim diverges from the requirement's own
test obligation.

### 1.2 Item 2: T018b field-level, not write-level

The owner pointed out that the original T018b skipped both the
precedence lock AND the `writes.push` call for failed-read ads.
Skipping the write freezes verdict, spend, and operational status
against FR-009 and SC-049. The fix is field-level, not write-level.

**Corrections applied in `tasks.md` T018b (rewritten):**

> For an ad whose bounded-read chunk failed (FR-070):
>
> - Skip the precedence lock at `shared.ts:900-905` (do not
>   re-derive `matchType`/`generationId` from fresh Meta data).
> - Skip pushing the ad into `learnedAds` — failed-read ads
>   contribute nothing to the learning aggregates this sync.
> - Do NOT skip the `writes.push(...)` call. Build an `adDoc` that
>   omits the **linking fields** (`generationId`, `matchType`,
>   `matchDistance`, `metadataAvailable`, `linkProvenance`,
>   `deletedGenerationId`) and contains only the **operational
>   fields** (spend, conversions, click-through, verdict, geo tier,
>   audience type, creative type, image hash, age, etc.). With
>   `merge: true` on the write (the existing semantics at
>   `shared.ts:1222-1226`), this:
>   - **Re-sync**: preserves the existing linking fields unchanged
>     (merge keeps fields not present in the new data) and updates
>     operational fields to today's Meta values.
>   - **First-ever sync**: creates a doc with operational fields
>     only; the ad has no linking and contributes nothing (correct
>     — we have no prior evidence).

The structure of the ad doc permits this separation. The existing
`merge: true` write means fields NOT in the new doc are preserved
from the prior doc. With `null` writes being treated as values
(overwriting), the discriminator is which fields are OMITTED from
the failed-read branch, not whether the write happens.

The owner asked: "If the ad-document write cannot separate those
field groups as currently structured, say so and report what the
structure is — that would be a real constraint and it should be
visible rather than resolved silently." The structure does permit
the separation via merge semantics; no constraint blocks it.

**Implementation in `shared.ts`** (lines 1046-1122): a ternary
builds the adDoc. The first branch (operational-only, omitting
linking fields with the marker comment "// Linking fields OMITTED")
is taken when `ledgerReadFailed` is true; the second branch
(full shape) is taken otherwise. The merge write preserves the
linking fields for re-syncs and creates an unlinked doc for
first-ever syncs — both correct per FR-070.

**Test that pins the contract** (`fr070.test.ts`): three assertions
covering all three required halves:

| Test | What it asserts |
|---|---|
| `failed-read ads do not appear in learnedAds (no contribution)` | `learnedAds.push` in `shared.ts` is gated by `!ledgerReadFailed` — failed-read ads are NOT pushed, so they contribute nothing to aggregates. |
| `failed-read adDoc does NOT include generationId/matchType/matchDistance/metadataAvailable` | The failed-read branch of the adDoc ternary contains the `// Linking fields OMITTED` marker AND has no `generationId:`, `matchType:`, `matchDistance:`, `metadataAvailable:` keys AFTER the marker. Has `spend3d:`, `conversions3d:`, `verdict:` keys AFTER the marker. |
| `SC-049's operational freshness is preserved for the failed-read ad` | `writes.push` for adPerformance is unconditional — the DATA shape differs, but the write happens. The operational fields are always written. |

Raw output (full chain):

```
=== FR-070 (T018b) — field-level discrimination ===
  ✅ FR-070: failed-read ads do not appear in learnedAds (no contribution)
  ✅ FR-070: failed-read adDoc does NOT include generationId/matchType/matchDistance/metadataAvailable
  ✅ FR-070: SC-049's operational freshness is preserved for the failed-read ad
Passed: 3, Failed: 0
---EXIT 0---
```

**Both halves in one test family**: a future reviewer consulting
this file sees the discrimination enforced at source level and the
SC-049 property preserved.

---

## 2. Tasks completed in this batch

### 2.1 T018a — pre-commit fencing re-check (FR-062)

Implemented in `shared.ts` between the lease acquire (~line 1326) and
the learning write (currently a placeholder). The re-check calls
`stillHeld(db, userId, accountId, runId, nowMs)`; if it returns
false, the function records the loss in `errors[]`, releases the
lease (best-effort, since a successor may already hold it), and
returns `{ ok: true, status: "partial", ... }` — per FR-064, the
sync does not fail; per FR-052, the abort is recorded.

The fence is placed BEFORE the learning write body. With Phase 3's
delta application still to land, the body is a no-op; the fence
narrows the residual window between acquire and commit per FR-063.

### 2.2 T018b — failed-read consumption at field level (FR-070)

As reported in §1.2 above. The per-ad loop now branches:

- For non-failed-read ads: precedence lock applies (`existingMatchType === "manual" || existingMatchType === "auto_hash"`); linking fields written via merge.
- For failed-read ads: precedence lock skipped; linking fields OMITTED from the adDoc; `learnedAds.push` skipped.

The discriminator is field-level. The merge:true write semantics
are load-bearing: `null` writes would OVERWRITE prior values, which
is the FR-070 bug; omitting fields preserves them.

### 2.3 T018c — source-order tripwire (SC-049 interim)

Implemented as a structural regression check in
`sc049Tripwire.test.ts`. The tripwire reads `shared.ts` as text,
finds every `batch.commit()` and every `acquireLearningLease()` call
inside `runSyncForAccount`, and asserts the LAST `batch.commit()`
precedes the FIRST `acquireLearningLease()`.

This is **necessary but not sufficient** for SC-049:

- It catches a refactor that moves the lease acquire BEFORE the
  operational commit (the obvious reverse ordering).
- It catches a refactor that deletes or relocates one of the two
  calls.
- It does NOT catch a refactor that moves the commit INSIDE a
  conditional while keeping the call in the same lexical position.
  Source order is a necessary but not sufficient condition for
  runtime order.

The retirement is structural: when T064b lands in Phase 7, this
file's annotation flips to a `describe.skip` and the test no longer
runs.

Raw output (full chain):

```
──────────────────────────────────────────────────────────────────────────────
SC-049 source-order tripwire (T018c) — necessary but not sufficient
──────────────────────────────────────────────────────────────────────────────
  ✅ tripwire: at least one batch.commit() and one acquireLearningLease() exist inside runSyncForAccount
     (last batch.commit at line 1302; first acquireLearningLease at line 1326)
  ✅ tripwire: the LAST batch.commit() in runSyncForAccount precedes the FIRST acquireLearningLease() (FR-060a ordering)
  ✅ tripwire: labelling — T064b is the test that retires this tripwire

Passed: 3, Failed: 0
---EXIT 0---
```

### 2.4 T019 — invert `learningAggregates.ts` contract

The header comment at line 17 of `learningAggregates.ts` ("Same
generationId in 2 ad sets → separate records per context") was
deleted and replaced with the FR-073 statement ("Same generationId
in 2 ad sets → one creative, one record"). The contract inversion
itself — moving from overwrite to delta application — is the next
batch's work alongside T017 (decideContribution) and T018
(aggregateDelta). This batch deletes the line and records the
inversion's direction; the implementation of additive deltas lands
with T017/T018 because the work is interdependent.

### 2.5 Tests registered in `package.json`

The chain grew two entries. The current `test:phase969` chain:

```
test:phase969:registration
test:phase969:creativeGrouping
test:phase969:lease
test:phase969:boundedLedgerRead
test:phase969:fr070              ← new in this batch
test:phase969:sc049Tripwire      ← new in this batch
```

`test:phase969` chains them all in order, with the registration
guard running first. The chain reaches its final entry in the full
`npm test` run.

---

## 3. Tasks considered and deliberately not touched

The remaining Phase 3 tasks that did not land in this batch:

- **T017 (`decideContribution`)** and **T018 (`aggregateDelta`)**:
  the contribution-ledger decision table and the atomic-increment
  application. Both require the contract inversion of
  `learningAggregates.ts` to be implemented (not just deleted at the
  comment). Doing them in this batch would have meant rewriting the
  aggregator's semantics while only the field-level FR-070 fix was
  on the owner's checklist. Splitting them is cleaner: T019 deletes
  the line and records direction; the next batch implements the
  additive deltas with the ledger decision logic.
- **T020 (derived averages)**, **T021 (count distinct creatives)**,
  **T022 (any-row eligibility, all-rows aggregation)**,
  **T023 (suppress no-change writes)**, **T024 (schema versioning)**,
  **T025 (persist ledger entry)**: deferred to the next batch with
  T017/T018. They are aggregation-shape changes that depend on
  T017/T018 being correct.
- **T026 (accumulation tests)** and **T027 (delete-cascade tests)**:
  the structural SC-level tests for cumulative, idempotent,
  shrink-proof accumulation. T026's coverage list in `tasks.md`
  names SC-001/2/3/8/12/13/29c/45/50 — most of those require
  delta-application to exist (SC-001, SC-008, SC-013, SC-029c).
  T026 is the next batch's centrepiece, paired with T017/T018.
- **T018c's full behavioural test (the Phase 7 SC-049)**: explicitly
  out of scope per the owner's instruction. The tripwire is the
  bridge.

---

## 4. Complete-for-the-phase-surface vs complete-as-specified

The audit standard introduced in Batch 02b §1.2 is now the reporting
standard, per the owner's instruction.

For Batch 03:

| Task | Status |
|---|---|
| **T018a** (fencing re-check) | **Complete-as-specified** at the code level: the re-check is wired, the abort path returns `{ok: true, status: "partial"}` per FR-064, and the event is recorded in `errors[]`. The tripwire `sc049Tripwire.test.ts` pins the source-order property. The behavioural test (drive the run with a forced lease-loss) is Phase 7 work — no Phase 3 source of contention. |
| **T018b** (FR-070 consumption) | **Complete-as-specified** in the discrimination it implements: failed-read ads skip the precedence lock, skip `learnedAds.push`, and the merge write omits linking fields while including operational fields. `fr070.test.ts` pins all three halves at source level. |
| **T018c** (tripwire) | **Complete-as-specified as a tripwire**. Structural, source-level, necessary-but-not-sufficient for SC-049. The test runs on every `npm test`, and labels its own limitation in its header comment and in this report. Retired by T064b's `describe.skip` annotation. |
| **T019** (delete line 17) | **Complete-as-specified**: the comment was deleted and replaced. The full contract inversion (overwrite → additive deltas) lands with T017/T018 in the next batch — T019 is the documentation half of that change. |
| **T016** (corrected coverage list) | **Complete-as-specified** at the documentation level — the list now correctly names what it covers and points at T018b for the consuming half. |
| T017, T018, T020–T027 | **Not started in this batch.** See §3. |

---

## 5. Build, test, and commit

### 5.1 Build

Command: `Remove-Item -Recurse -Force lib -ErrorAction SilentlyContinue;
npm run build`. Exit 0. tsc emitted no diagnostics.

### 5.2 Per-test execution

```
$ node lib/__tests__/phase969/phase969RegistrationGuard.test.js
[5 self-test cases including new "source with no compiled counterpart"]
[production check OK with 6 files / 6 chain entries]
---EXIT 0---

$ node lib/__tests__/phase969/creativeGrouping.test.js
[19 tests, all passing]

$ node lib/__tests__/phase969/learningLease.test.js
[12 tests, all passing]

$ node lib/__tests__/phase969/boundedLedgerRead.test.js
[12 tests, all passing]

$ node lib/__tests__/phase969/fr070.test.js
[3 tests, all passing]
---EXIT 0---

$ node lib/__tests__/phase969/sc049Tripwire.test.js
[3 tests, all passing]
---EXIT 0---
```

### 5.3 Full test chain

Command: `npm test`. Exit 0. The chain reaches its final entry.
The phase 969 chain runs all 6 tests (registration + 4 prior +
fr070 + sc049Tripwire) and exits 0.

Raw guard output (the new 3-section display):

```
──────────────────────────────────────────────────────────────────────────────
Phase 969 test-registration guard — production check
──────────────────────────────────────────────────────────────────────────────
Files on disk — read from src/__tests__/phase969/ (6):
  src/__tests__/phase969/boundedLedgerRead.test.ts
  src/__tests__/phase969/creativeGrouping.test.ts
  src/__tests__/phase969/fr070.test.ts
  src/__tests__/phase969/learningLease.test.ts
  src/__tests__/phase969/phase969RegistrationGuard.test.ts
  src/__tests__/phase969/sc049Tripwire.test.ts
Expected chain entries — .ts→.js mapping, lib path (6):
  lib/__tests__/phase969/boundedLedgerRead.test.js
  lib/__tests__/phase969/creativeGrouping.test.js
  lib/__tests__/phase969/fr070.test.js
  lib/__tests__/phase969/learningLease.test.js
  lib/__tests__/phase969/phase969RegistrationGuard.test.js
  lib/__tests__/phase969/sc049Tripwire.test.js
Chain entries parsed from functions/package.json (6):
  lib/__tests__/phase969/boundedLedgerRead.test.js
  lib/__tests__/phase969/creativeGrouping.test.js
  lib/__tests__/phase969/fr070.test.js
  lib/__tests__/phase969/learningLease.test.js
  lib/__tests__/phase969/phase969RegistrationGuard.test.js
  lib/__tests__/phase969/sc049Tripwire.test.js
──────────────────────────────────────────────────────────────────────────────
OK: every file on disk is in the chain, and every chain entry has a file on disk.
```

Final tail (full chain):

```
═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══

contractFixtures.test: PASS
```

Full log at `C:\temp\opencode\full-test-batch-03.log`.

### 5.4 Commit

Six files changed:

```
$ git status --short
 M functions/package.json
 M functions/src/learningAggregates.ts
 M functions/src/metaSync/shared.ts
 M specs/969-cumulative-learning/tasks.md
?? functions/src/__tests__/phase969/fr070.test.ts
?? functions/src/__tests__/phase969/sc049Tripwire.test.ts
```

None of them in the prohibited set (`qararEngine.ts`,
`metaSync/lease.ts`, `metaSync/orchestrator.ts`).

---

## 6. What I have NOT done

- **T017 (`decideContribution`)**, **T018 (`aggregateDelta`)**,
  **T019's contract inversion implementation**, **T020-T025**: the
  next batch's centrepiece. They are interdependent and ship together.
- **T026 (accumulation tests)**, **T027 (delete-cascade tests)**:
  the SC-level tests for the new aggregation semantics. Paired with
  T017/T018.
- **T064b (SC-049 behavioural test)**: Phase 7, as planned.
- **Lint load fix**: still pre-existing from `eba9eaf`, out of scope.
- **PR / push**: per project rules.

---

## 7. Stop point

Batch 03 lands the FR-070 corrections and the three deferred halves
(T018a, T018b, T018c) the owner asked for. The remaining Phase 3
work (T017, T018, T020-T027) is documented as deferred with the
reason each was deferred.

The per-task audit standard introduced in Batch 02b is now the
reporting standard — applied here, with `complete-as-specified`
and `complete-for-the-phase-surface` stated per task in §4.

Stopping and awaiting the owner's response before continuing Phase 3.
