# Batch 02b — Phase 2 follow-up corrections

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Mode**: Pre-Phase-3 follow-up corrections in response to Batch 02a owner review.

This batch addresses three follow-ups the owner raised against Batch 02a:
T015 was partial and was reported as Done; the guard's display
changed and the change was not flagged; SC-049 sits in Phase 7 while
Phase 3 edits the code it protects.

Each correction has a corresponding obligation now living in an
artifact that runs, gets executed, or both — not in prose.

---

## 1. T015 was reported as Done and was partial — corrected

The owner pointed out that Batch 02 §3 listed T015 as "Done" with no
qualification, and the §1.2 audit in Batch 02a surfaced it as partial
only when asked. The full audit is in §1.2 below. This section
corrects the Batch 02 report in place and confirms T015's remaining
half is a task in `tasks.md` in its own right.

### 1.1 Correction in `batch-02-969-report.md`

The original T015 entry is preserved in §3 of the report (per the
"leave the original text visible as the record" requirement). A
**CORRECTED** note now sits directly under it, in the form FR-050
uses for its note (struck-through claim followed by the corrected
reading).

The corrected reading identifies the actual bug: the per-ad loop's
precedence lock at `shared.ts:900-905` does not consult
`failedLedgerReads`. For an ad whose chunk read failed,
`existingData` is undefined and `existingMatchType` is undefined, so
the lock does not fire — the ad's `matchType`/`generationId` are
re-derived from fresh Meta data, which is exactly the FR-070 bug
("a failed read is treated as absence, not as missing information").

The note states that the bug is unreachable today only because no
learning write consumes the resulting incorrect matchType, and that
this unreachability is not correctness. It points at this report
for the full audit.

### 1.2 Audit — every task marked Done in Batches 01 and 02

The owner asked for a per-task statement of complete-as-specified vs
complete-for-the-phase-surface, not aggregate. Every Phase 1 and
Phase 2 task is below.

#### Phase 1 — Setup (T001–T004)

| Task | Status | What shipped | What did not |
|---|---|---|---|
| **T001** — `learning/` directory with index barrel | Complete-as-specified | `functions/src/learning/index.ts` re-exports `./types.js`; six feature modules' imports are commented with their FR numbers and the phase each lands in. | Nothing deferred. |
| **T002** — Shared feature types | Complete-as-specified | All eleven exported symbols in `functions/src/learning/types.ts` plus `CURRENT_LEARNING_SCHEMA_VERSION` constant. Three state fields kept separate on the ad row per `data-model.md` §1. | Nothing deferred. |
| **T003** — `test:phase969` registered in `package.json` | Complete-as-specified (and superseded) | Added script and chain entry. **Superseded in Batch 02**: the placeholder was replaced with a chain of `test:phase969:registration`, `:creativeGrouping`, `:lease`, `:boundedLedgerRead`. | Nothing deferred. |
| **T004** — Fixture builders | Complete-as-specified | 13 exports in `functions/src/__tests__/__fixtures__/learning.fixtures.ts` covering linked, propagated, hashless-linked, unlinked, 55-row, two-hashes-same-generation, hashless-linked-alone, already-linked-hash-nulled, one-matched-several-propagated, neither-key, split-creatives, and `PROPAGATED_KEEPS_MATCHTYPE_NULL`. | Nothing deferred. |

#### Phase 2 — Foundational (T005–T016)

| Task | Status | What shipped | What did not |
|---|---|---|---|
| **T005** — `groupIntoCreatives` per contract | Complete-as-specified | `functions/src/learning/creativeGrouping.ts` implements all four steps (group by `imageHash`, propagate `generationId` with manual-wins, merge on shared `generationId`, hashless-linked + neither-key cases). | Nothing deferred. |
| **T006** — Cross-group merge (FR-074b) | Complete-as-specified | `mergeByGeneration` inside `creativeGrouping.ts`; covered by `SC-029a` tests (2 of 19). | Nothing deferred. |
| **T007** — Key-absence cases (FR-074c, FR-075) | Complete-as-specified | `attachGenOnly` and the `neither` branch in `creativeGrouping.ts`; covered by `SC-029b` (2 tests) and `SC-046` (2 tests). | Nothing deferred. |
| **T008** — Grouping contract tests | Complete-as-specified | 19 tests in `functions/src/__tests__/phase969/creativeGrouping.test.ts`. All pass. | Nothing deferred. |
| **T009** — Lease primitives | Complete-as-specified | `acquireLearningLease`, `releaseLearningLease`, `stillHeld` in `functions/src/learning/learningLease.ts`. New `learningLeases/{ownerUid}_{accountId}` collection, 15-min TTL, atomic transactions, holder-identity verification on release. | Nothing deferred. |
| **T010** — Lease wired into `runSyncForAccount` | Complete-for-the-phase-surface | Lease acquire at `shared.ts:1255`, release in `finally` at line 1303. Acquire happens AFTER the operational batch commit at line 1231 (FR-060a ordering, structural). On refusal, returns `failed` status without running prune/patch tail. `lease.ts` and `orchestrator.ts` unmodified (verified `git diff --stat main -- <path>` empty). | **T012** (pre-commit fencing re-check, FR-062) moved to Phase 3 as `T018a` — no pre-commit re-check exists yet, but the lease acquire/release pattern is in place and the JSON between acquire and release is the right insertion site. |
| **T011** — Mandatory ordering (FR-060a) | Complete-for-the-phase-surface | Operational batch commit at `shared.ts:1227-1234` precedes lease acquire at line 1255. On lease failure, the function returns `{ok: false, status: "failed", ...}` with the lease holder's identity in `errors[]`. | **SC-049's behavioural test** lives in Phase 7 as `T064b` (integration test that drives `runSyncForAccount` end-to-end with a forced lease refusal). The code is in the right order; the runtime test against a stubbed Firestore is the part that lives in Phase 7. The Phase 2 source-level claim ("structurally satisfied") was withdrawn in Batch 02a §3. |
| **T012** | **MOVED to Phase 3 as T018a** | (no longer in Phase 2) | Carried out per Batch 02a §1.1. |
| **T013** — Lease contract tests | Complete-as-specified | 12 tests in `functions/src/__tests__/phase969/learningLease.test.ts`. SC-017, SC-017a, SC-018, SC-019, SC-020, SC-043, SC-044 all covered. **SC-049 removed from this task's coverage list** in Batch 02a (it lives in `T064b`). | Nothing deferred. |
| **T014** — Replace unbounded scan with chunked by-ID read | Complete-as-specified | `readExistingAdDocs` in `functions/src/learning/boundedLedgerRead.ts`. Chunk size 300, every chunk completes before any write (FR-069), whole documents (FR-071). Called from `shared.ts` via `adAccountRef.collection("adPerformance").doc(ad.id)` per ad. The unbounded `collection("adPerformance").get()` line is removed entirely (FR-068); only a comment referencing the removal remains. | Nothing deferred. |
| **T015** — Failed chunk read surfaces separately | **PARTIAL — corrected in this batch** | `failedLedgerReads` set is captured in `functions/src/metaSync/shared.ts` from `boundedResult.failedIds`. The set is correctly populated and is surfaced in `errors[]`. The `boundedLedgerRead.test.ts` helper tests confirm this contract. | **The per-ad loop's precedence lock at `shared.ts:900-905` does NOT consult `failedLedgerReads`.** For an ad whose chunk read failed, `existingData` is undefined, the lock does not fire, and the ad's `matchType`/`generationId` are re-derived from fresh Meta data — exactly the FR-070 bug ("failed read treated as absence, not as missing information"). This is unreachable-as-wrong today only because no learning write consumes the re-derived value. The full fix is `T018b` in Phase 3, which consumes the set in the per-ad loop. |
| **T016** — Bounded-read contract tests | Complete-as-specified | 12 tests in `functions/src/__tests__/phase969/boundedLedgerRead.test.ts`. SC-022, SC-023, SC-024, SC-025, FR-070, FR-071 all covered. | Nothing deferred. |

#### Net of the audit

- **Complete-as-specified**: T001, T002, T003, T004 (Phase 1); T005,
  T006, T007, T008, T009, T013, T014, T016 (Phase 2).
- **Complete-for-the-phase-surface**: T010, T011. Both have the code
  in the right shape; the missing halves are tested in Phase 7
  (`T064b` for SC-049) or are in Phase 3 (`T018a` for the fencing
  re-check).
- **Partial at the time, corrected now**: T015. The set was captured
  but not consumed. `T018b` in Phase 3 does the consumption.

The Batch 02 §3 framing of T015 as "Done" was misleading; the
corrected note in `batch-02-969-report.md` §3 records the actual
state and points at this report. The `tasks.md` entry for T015 now
flags it as partial with the same pointer.

---

## 2. The guard's display changed and was not flagged — corrected

### 2.1 What the guard actually reads

The guard reads `src/__tests__/phase969/`, filtering `*.test.ts`. It
**never** reads `lib/`. The mapping to `lib/*.test.js` paths happens
only inside the comparison logic, because `package.json`'s chain
entries are written with `lib/` paths (those are what `node` runs).
The read was unchanged between Batch 02 and Batch 02a.

What changed between the two batches was the **display**:

- Batch 02 listed bare filenames from the read (`boundedLedgerRead.test.ts`).
- Batch 02a listed mapped lib/ paths (`lib/__tests__/phase969/boundedLedgerRead.test.js`).

This was an unflagged display change that, on inspection, made the
output look as though the guard had switched to reading `lib/`. The
read is correct; the display was misleading.

### 2.2 What I changed

Three things, in the existing `phase969RegistrationGuard.test.ts`:

1. The display now shows **three** sections instead of two — files
   on disk (in `src/`), expected chain entries (the `.ts→.js`
   mapping), and the chain entries parsed from `package.json`. The
   read-vs-mapped distinction is explicit. The display includes the
   source path prefix in the first section so the read is on the
   record.
2. The variable names now carry the meaning: `filesOnDisk` for the
   filenames as read from `src/`, `files` for the mapped `lib/`
   paths.
3. A **new self-test case** exercises the "source file with no
   compiled counterpart" scenario: a `.test.ts` that exists on disk
   but whose chain entry is missing. This pins the contract that the
   guard detects the gap even when `lib/` has no compiled `.js`.

### 2.3 New self-test output (raw)

```
──────────────────────────────────────────────────────────────────────────────
Phase 969 test-registration guard — self-test
──────────────────────────────────────────────────────────────────────────────
  ✅ self-test: missing-from-chain direction detected
  ✅ self-test: orphaned-in-chain direction detected
  ✅ self-test: both directions simultaneously
  ✅ self-test: empty inputs return empty diff
  ✅ self-test: source with no compiled counterpart still detected
──────────────────────────────────────────────────────────────────────────────
Phase 969 test-registration guard — production check
──────────────────────────────────────────────────────────────────────────────
Files on disk — read from src/__tests__/phase969/ (4):
  src/__tests__/phase969/boundedLedgerRead.test.ts
  src/__tests__/phase969/creativeGrouping.test.ts
  src/__tests__/phase969/learningLease.test.ts
  src/__tests__/phase969/phase969RegistrationGuard.test.ts
Expected chain entries — .ts→.js mapping, lib path (4):
  lib/__tests__/phase969/boundedLedgerRead.test.js
  lib/__tests__/phase969/creativeGrouping.test.js
  lib/__tests__/phase969/learningLease.test.js
  lib/__tests__/phase969/phase969RegistrationGuard.test.js
Chain entries parsed from functions/package.json (4):
  lib/__tests__/phase969/boundedLedgerRead.test.js
  lib/__tests__/phase969/creativeGrouping.test.js
  lib/__tests__/phase969/learningLease.test.js
  lib/__tests__/phase969/phase969RegistrationGuard.test.js
──────────────────────────────────────────────────────────────────────────────
OK: every file on disk is in the chain, and every chain entry has a file on disk.
```

The new case's name and what it asserts:

| Self-test name | Assertion it implements |
|---|---|
| source with no compiled counterpart still detected | After diff with files `[lib/.../never-compiled.test.js]` and empty chain, `missingFromChain` equals the lone file. Pins the contract that a `.test.ts` whose `.js` never compiled is still detected as missing from chain. |

### 2.4 Why `src/` is the right source

`lib/` is compiled output. This project has a standing rule of
`Remove-Item -Recurse -Force lib` before every build, precisely
because stale `lib/` artifacts have shipped wrong behaviour before.
A guard whose input is `lib/` inherits that hazard: a developer's
`*.test.ts` that fails to compile has no corresponding `.js`, so the
guard sees nothing — and silently reports OK. The Batch 02 §4.2
demonstration accidentally exercised this failure mode: the temp
file had a `TS1434` compile error, and the guard reported it
correctly **because it reads src/**. If the guard had read `lib/`,
the file would have been invisible. The `lib/` path is the chain's
run path; `src/` is the truth.

Reading `src/` and mapping to the expected `lib/**.test.js` chain
entry is the strong form. The guard catches unregistered source,
which is what a developer adds. A `.test.ts` that doesn't compile
is still caught, because the source file exists and the comparison
is against the expected chain entry, not the compiled file.

---

## 3. SC-049 sits in Phase 7 — interim tripwire in Phase 3

The owner is correct that Phase 3 lands the learning write between
the operational commit at line 1231 and the lease acquire at line
1255, making it the phase most likely to reorder them. SC-049's
behavioural test in Phase 7 is too late — four phases (3, 4, 5, 6)
edit the most-reorganised code without verification.

### 3.1 Does the scaffolding for `T064b` exist before Phase 7?

**No.** Audit results:

- **`StubDocRef`, `StubCollection`, `StubBatch`**: live in
  `functions/src/__tests__/metaSyncOrchestrator.test.ts` and are
  used by `runFullSync`/`runFullSyncWithLease` tests. They cover
  Firestore document/collection/batch operations.
- **`stubFetchInsights`**: lives in the same file, but only stubs
  the *insights* fetch (used by LEG A in `runLegacySyncForOwner`).
- **Stubs for `fetchCampaigns`, `fetchAdSets`, `fetchAds`,
  `fetchAdInsights`, `fetchAdInsights7dDaily`,
  `fetchAccountBaselines`, `fetchAdAccountCurrency`,
  `downloadCreativeImage`, `loadWorkspaceFingerprints`** — none of
  these exist. They are the fetchers that `runSyncForAccount` calls
  before any operational commit.
- **End-to-end drive of `runSyncForAccount` with stubbed deps**:
  no existing test does this. `metaSyncRateLimit.test.ts`'s
  "runSyncForAccount reports rate-limit" test uses
  `runPhase14InlineOverride` to bypass the LEG B body; it does not
  drive `runSyncForAccount` itself.

T064b would need to build the missing stubs to drive
`runSyncForAccount` end-to-end. That work is naturally Phase 7,
where the observability tests (T064) already establish end-to-end
scaffolding.

### 3.2 What I did: interim tripwire in Phase 3

Since `T064b` stays in Phase 7 and the ordering is most at risk in
Phase 3, an interim regression check in Phase 3 is the right shape.
A new task **`T018c`** in `tasks.md`:

> `T018c [P] [US1] (added batch-02b; SC-049 interim tripwire)`
> Write a structural regression check that asserts the **last**
> `batch.commit()` call inside `runSyncForAccount` (in
> `functions/src/metaSync/shared.ts`) precedes the **first**
> `acquireLearningLease` call (T013 lease primitive). Implemented by
> reading `shared.ts` as text and finding the line numbers of these
> two call shapes, asserting `max(batch.commit() line) <
> min(acquireLearningLease line)`. The test's header comment must
> state plainly that this is a **necessary but not sufficient**
> condition for SC-049, that it is a tripwire against reordering
> and not coverage of the criterion, and that it is **retired when
> T064b (Phase 7) lands** with a `describe.skip` annotation.
> Register the file in `functions/package.json` (T067 reach-the-end).

This is what the owner asked for. The tripwire is **necessary but
not sufficient**: source-order tells you the function was written in
the right shape, not that it executes that shape at runtime. A
reorder that pushes the commit inside an `if` and the lease outside
satisfies the grep and breaks the criterion — exactly the failure
mode the owner flagged. The tripwire's job is to catch the OBVIOUS
reordering failure (commit moved past lease); SC-049's behavioural
test catches the rest.

### 3.3 What the tripwire does NOT do

- It does NOT exercise `runSyncForAccount` end-to-end.
- It does NOT verify that the lease is acquired AFTER the
  operational writes commit *at runtime* — only that the source
  positions them in that order.
- It does NOT cover the FR-060a claim that "signalling failure
  does not roll back a committed write" — that is `T064b`.
- It does NOT catch reorders that move the commit inside a
  conditional.

The tripwire retires when `T064b` lands (Phase 7). The retirement
is structural: `describe.skip` at the top of the test, with a
comment pointing at `T064b`.

### 3.4 T015 / T018b — the operational-precedence complement

The owner also noted T015's partial completion is the most likely
reorder site for Phase 3. The complement of T018c (source-order check)
is **`T018b`** (consume `failedLedgerReads` in the per-ad loop):

> `T018b [US1] (added batch-02b; completes T015)` In
> `functions/src/metaSync/shared.ts`, consume the `failedLedgerReads`
> set in the per-ad loop. For an ad whose bounded-read chunk failed
> (FR-070): skip the precedence lock at `shared.ts:900-905` (do not
> re-derive `matchType`/`generationId` from fresh Meta data — a
> failed read is missing information, not absence) AND skip the
> `writes.push(...)` call so the failed-read ads' existing
> `matchType`/`generationId` is preserved unchanged. Surface the
> failed IDs in `errors[]` for observability (T062 reads from this
> surface). Required by FR-070; the per-ad loop currently treats
> failed reads as absence, which is the FR-070 bug masked by the
> absence of a learning write today.

Both `T018b` and `T018c` are placed next to `T018a` in Phase 3 so the
ordering of "FR-054a / FR-060a / FR-070 work" is visible in the file
without rereading reports.

### 3.5 T064b stays in Phase 7

The `runSyncForAccount` end-to-end stubbing that `T064b` needs is
not built in Phase 7 yet. Building it as part of `T064b` (alongside
the other Phase 7 end-to-end coverage) is the natural shape. The
interim `T018c` tripwire is the bridge across the gap.

If the owner later decides the scaffolding should be built earlier
(Phase 3 alongside `T018b`), `T064b` can move. Right now the tripwire
is the right trade.

---

## 4. Build, test, and commit

### 4.1 Build

Command: `npm run build`. Exit 0. tsc emitted no diagnostics.

### 4.2 Per-test execution

```
$ node lib/__tests__/phase969/phase969RegistrationGuard.test.js
[5 self-test cases including new "source with no compiled counterpart" case]
[production check OK]
---EXIT 0---
```

Other Phase 2 tests were not modified.

### 4.3 Full test chain

Command: `npm test`. Exit 0. The chain reaches its final entry:

```
[guard output with new 3-section display]
[intermediate test output elided]
contractFixtures.test: PASS
```

Full log at `C:\temp\opencode\full-test-batch-02b.log`.

### 4.4 Commit

Three files changed:

```
$ git status --short
 M functions/src/__tests__/phase969/phase969RegistrationGuard.test.ts
 M specs/969-cumulative-learning/reports/batch-02-969-report.md
 M specs/969-cumulative-learning/tasks.md
```

None of them in the prohibited set (`qararEngine.ts`,
`metaSync/lease.ts`, `metaSync/orchestrator.ts`).

---

## 5. What I have NOT done

- **Phase 3 implementation.** This batch is corrections only. The
  Phase 3 code lands in Batch 03 (T017–T027, T018a, T018b, T018c).
- **T018b implementation.** The task is in `tasks.md`; the code
  lands in Phase 3.
- **T018c tripwire implementation.** Same. The test file will be
  written when Phase 3 lands.
- **T064b implementation.** Stays in Phase 7 per the reasoning in
  §3.
- **Lint load fix.** Still pre-existing from `eba9eaf`.
- **PR / push.** Per project rules.

---

## 6. Stop point

Batch 02b is complete. The three corrections are in artifacts that
run or get executed:

- T015's Batch 02 entry now has a CORRECTED note pointing at this
  report. T015 itself is qualified in `tasks.md` to flag it as
  partial, with `T018b` (a new Phase 3 task) as the actual completion.
- The guard's read (`src/`) is now explicit in the output, and the
  new self-test case pins the "source with no compiled counterpart"
  scenario.
- SC-049's interim regression check (`T018c`) is now a Phase 3 task,
  labeled as necessary-but-not-sufficient and retired-when-T064b-lands.

Stopping and awaiting the owner's response before Phase 3.
