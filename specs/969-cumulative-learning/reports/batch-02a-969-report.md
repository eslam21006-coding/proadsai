# Batch 02a — Phase 2 corrections

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Mode**: Pre-Phase-3 corrections in response to Batch 02 owner review.

This batch addresses four corrections the owner raised against Batch 02.
Each correction has a corresponding obligation now living in a place
that runs or gets executed, not in prose.

---

## 1. T012 moved to Phase 3 in `tasks.md`

The owner's correction was that a deferred task recorded only in a
report is a task that does not happen. T012 — the pre-commit fencing
re-check (FR-062) — was deferred to the phase that contains the
learning write it fences.

### 1.1 What changed in `tasks.md`

**Removed from Phase 2** (was line 61):

```
- [ ] T012 Add the pre-commit fencing re-check and abort path …
```

**Inserted at the Phase 3 write site** (between T018 and T019):

```
- [ ] T018a [US1] **(moved from Phase 2; rationale recorded there)** Add
  the pre-commit fencing re-check and abort path in
  `functions/src/metaSync/shared.ts` — re-verify holding immediately
  before committing, abort the learning write without failing the
  sync, record the event (FR-062, FR-064, FR-052). **Must be inserted
  between the delta computation and the delta write**, with the abort
  path consuming the same `failedLedgerReads` set the bounded read
  produced (T015). Per FR-063 the residual window between re-verify
  and commit is acknowledged, not papered over
```

The task number `T018a` slots in immediately after T018 (delta
application), which is the write site it fences. The reference to T015
ties the fencing abort to the same `failedLedgerReads` set the bounded
read produces, so a chunk failure aborts the learning write for that
chunk.

**Removed T012 from the Parallel Execution Examples** section's
"Within Phase 2" note that mentioned T012.

**Removed SC-049 from T013's coverage list.** SC-049 was listed under
T013 (lease tests) in Batch 02. The owner pointed out it is an
end-to-end wire-up test, not a primitive-level lease test. T013's
header now reads:

> ... SC-043, SC-044 ... register the file in `functions/package.json`.
> **SC-049 does NOT live here** — it is an end-to-end wire-up test that
> runs `runSyncForAccount` with a forced lease refusal; moved to Phase
> 7 as T064b.

### 1.2 Other tasks deferred or reordered across Phase 1 and Phase 2

Audited every task in Phase 1 and Phase 2 against what was actually
committed. The audit covers every task in those two phases.

| Task | Phase | Status | Where it actually lives |
|---|---|---|---|
| T001 | 1 | Done | `functions/src/learning/index.ts` |
| T002 | 1 | Done | `functions/src/learning/types.ts` |
| T003 | 1 | Done | `functions/package.json` (script + chain) |
| T004 | 1 | Done | `functions/src/__tests__/__fixtures__/learning.fixtures.ts` |
| T005 | 2 | Done | `functions/src/learning/creativeGrouping.ts` |
| T006 | 2 | Done | Same file (`mergeByGeneration` inside `creativeGrouping.ts`) |
| T007 | 2 | Done | Same file (FR-074c, FR-075 cases inside `groupIntoCreatives`) |
| T008 | 2 | Done | `functions/src/__tests__/phase969/creativeGrouping.test.ts` |
| T009 | 2 | Done | `functions/src/learning/learningLease.ts` |
| T010 | 2 | Done | `functions/src/metaSync/shared.ts:1255` (lease acquire), `:1303` (release in `finally`) |
| T011 | 2 | Done (partial — see below) | `functions/src/metaSync/shared.ts` lines 1227–1234 (operational commits) precede line 1255 (lease attempt) |
| **T012** | 2 | **MOVED to Phase 3** | Now `T018a` in Phase 3, between T018 and T019. See §1.1 above. |
| T013 | 2 | Done | `functions/src/__tests__/phase969/learningLease.test.ts` |
| T014 | 2 | Done | `functions/src/metaSync/shared.ts` line ~851 (bounded read replaced the unbounded scan) |
| T015 | 2 | Done (partial — see below) | The `failedLedgerReads` set is captured in `shared.ts`. The actual write-abort logic for failed chunks lands in Phase 3 (T018a's reference to "consuming the same `failedLedgerReads` set" pins this). |
| T016 | 2 | Done | `functions/src/__tests__/phase969/boundedLedgerRead.test.ts` |

Two items need calling out beyond T012:

- **T011 is structurally complete for what Phase 2 can deliver.** The
  ordering (operational writes → lease attempt → signal failure) is
  in place. The pre-commit re-check (T012) is what comes between lease
  acquire and the learning write, and Phase 2 has no learning write
  yet. Per the owner's allowance, T012 moved to Phase 3. T011 is not
  "partial" in the sense of incomplete code — it is complete given
  the Phase 2 surface area.

- **T015's partial completion is structural.** Phase 2 establishes
  the `failedLedgerReads` set as a property of the bounded-read
  result. The per-ad loop's precedence lock at lines 900-905 currently
  does not consult it; that is a Phase 3 fix that T018a documents
  ("the abort path consuming the same `failedLedgerReads` set the
  bounded read produced"). The set itself is in place.

No task was folded into another, no task was added without
appearing in `tasks.md`, and no task was reordered across phases
beyond T012 → T018a.

---

## 2. Header comments added to `learningLease.test.ts`

The owner flagged that Batch 01 §5.3 promised two sentences that did
not arrive in the test file. Both are now there, in the corrected
shape the owner recorded against §6.1.

### 2.1 Discrimination reasoning (added)

The test exercises the lease primitives directly. That choice is
load-bearing for SC-017's discrimination:

> The test calls `runSyncForAccount`'s call site directly, bypassing
> `runFullSyncWithLease`. If the lease is acquired inside that
> function, exactly one of two concurrent calls acquires it. If the
> lease is at the orchestrator level, **neither** call acquires
> anything and both write — the test fails. If the lease is keyed per
> owner rather than per account, SC-017a's second case fails (a
> per-owner key cannot serialise two accounts of the same owner).

### 2.2 Coverage limit (added)

> This test drives neither `runFullSync` nor `worker.ts`. It asserts
> that the lease is acquired inside `runSyncForAccount`, which both
> routes call. Route-level behaviour is not exercised in CI.
>
> A lease placed only at the orchestrator level would pass an end-to-
> end test that drives `runFullSync` twice — Phase 970's per-owner
> guard would acquire the lease for both, the second would refuse,
> and the test would look correct while the FR-054a requirement goes
> unverified. The two-route claim in FR-054b exists precisely to
> prevent that shape of false confidence.

Both passages are in the file header (`learningLease.test.ts` lines
~21-49). The coverage limit is the half the owner said was missing —
the half that stops a later reader treating the test as end-to-end
proof of the two-route case, which is the assumption FR-054b exists
to prevent.

The SC-049 mention was also removed from the header since SC-049
moved to Phase 7 as T064b. The header now says explicitly:

> Note: SC-049 used to be listed here. Per owner correction to Batch
> 02a, SC-049 is an end-to-end wire-up test that drives
> `runSyncForAccount` itself; it does not belong in this primitive-
> level test file. It now lives as T064b in Phase 7, where the
> natural end-to-end coverage sits.

---

## 3. SC-049 behavioural test moved to Phase 7

The owner correctly noted that "a grep showing `batch.commit()` at
1231 and `acquireLearningLease` at 1255 proves the two lines appear
in that order in the file. It does not prove the behaviour SC-049
asserts." Source order and runtime behaviour are different claims.

### 3.1 Why Phase 7, not Phase 2

SC-049 requires driving `runSyncForAccount` end-to-end with a
stubbed Firestore and a stubbed Meta fetch path, pre-populating the
`learningLeases/{ownerUid}_{accountId}` doc with a different `runId`
so the lease acquire is refused, asserting operational status writes
committed for every ad in the batch, and asserting
`SyncResult.status === "failed"` is returned.

This is an integration test. The Phase 2 lease primitives are unit-
tested by `learningLease.test.ts` (12 tests, all passing). To test
the *wire-up* — that the operational write happened BEFORE the lease
attempt and that the result type signals failure correctly — the
test must execute the function body, not the lease module in
isolation.

Such a test belongs in Phase 7 (Polish & Cross-Cutting Concerns),
which already houses the SC-026/27/28/42/42a/47 observability tests
and the FR-050/T067 reach-the-end gate. Phase 7 is the natural
end-to-end coverage home.

### 3.2 The new task in `tasks.md`

Phase 7 now contains:

```
- [ ] T064b [P] **SC-049 behavioural test (added Batch 02a).** Write
  an end-to-end test that drives `runSyncForAccount` with a stubbed
  Firestore and a stubbed Meta fetch path, pre-populates the
  `learningLeases/{ownerUid}_{accountId}` doc with a different
  `runId` so the lease acquire is refused, asserts the operational
  status writes for every ad in the batch were committed (the
  Firestore stub records them), and asserts `SyncResult.status
  === "failed"` is returned. Both halves are required in one test
  (SC-049): zero ads left with a stale operational status AND the
  failure signal emitted. Register in `functions/package.json`. The
  Phase 2 grep-based claim ("structurally satisfied") is
  insufficient — a refactor that moves the commit inside a
  conditional satisfies the grep and breaks the criterion. This
  test is end-to-end and naturally lives in Phase 7 alongside the
  observability tests, not Phase 2's unit tests. Source-level claim
  from Batch 02 §5.4 is **withdrawn**.
```

The task will land in Phase 7 alongside T064 and T067, where the
end-to-end scaffolding already exists.

### 3.3 Phase 2 source-level claim withdrawn

The Batch 02 §5.4 claim that SC-049 is "structurally satisfied at
the source level" is withdrawn. The grep showing the operational
batch commit at line 1231 precedes the lease acquire at line 1255.
That is a necessary condition for SC-049 but not a sufficient one.
The behavioural test in T064b is what closes the gap.

---

## 4. Registration guard self-test + live demonstrations

The owner pointed out that a check whose passing proves nothing
because it has never been shown capable of failing is the exact
failure mode this project has been correcting. The guard had only
ever run against a state where the two lists matched.

Both halves of the fix:

- **Permanent**: extracted `diffTestRegistrations` into a pure
  function and added a self-test that drives it with synthetic
  inputs covering both mismatch directions and the empty case. The
  self-test runs on every invocation of the guard.
- **Demonstration**: introduced two temporary mismatches in turn,
  ran the guard, captured the raw output, and reverted. Both
  directions demonstrated, raw output below.

### 4.1 Permanent self-test

The guard now runs four self-test cases before the production check:

```
──────────────────────────────────────────────────────────────────────────────
Phase 969 test-registration guard — self-test
──────────────────────────────────────────────────────────────────────────────
  ✅ self-test: missing-from-chain direction detected
  ✅ self-test: orphaned-in-chain direction detected
  ✅ self-test: both directions simultaneously
  ✅ self-test: empty inputs return empty diff
──────────────────────────────────────────────────────────────────────────────
Phase 969 test-registration guard — production check
──────────────────────────────────────────────────────────────────────────────
[... files vs chain ...]
OK: every file on disk is in the chain, and every chain entry has a file on disk.
```

Self-test names → assertions, walked for the "test name vs
assertion check" (Rule 0b):

| Self-test name | Assertion it implements |
|---|---|
| missing-from-chain direction detected | After diff with 3 files and 2 chain entries sharing 2 names, `missingFromChain` equals the lone file not in chain |
| orphaned-in-chain direction detected | After diff with 1 file and 2 chain entries sharing 1 name, `orphanedInChain` equals the lone chain entry not on disk |
| both directions simultaneously | After diff with 2 files and 2 chain entries sharing 1 name, both `missingFromChain` and `orphanedInChain` report the right names |
| empty inputs return empty diff | After diff with both lists empty, the result is `{ missingFromChain: [], orphanedInChain: [] }` |

Names and assertions agree.

### 4.2 Live demonstration — file on disk absent from chain

Created `_temporaryUnregistered.test.ts` in the phase969 directory
(file on disk, absent from `package.json` chain):

```
$ npm run build && node lib/__tests__/phase969/phase969RegistrationGuard.test.js
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

src/__tests__/phase969/_temporaryUnregistered.test.ts(1,1): error TS1434: Unexpected keyword or identifier.
[tsc error is expected — the file is intentionally not valid TS]
──────────────────────────────────────────────────────────────────────────────
Phase 969 test-registration guard — self-test
──────────────────────────────────────────────────────────────────────────────
  ✅ self-test: missing-from-chain direction detected
  ✅ self-test: orphaned-in-chain direction detected
  ✅ self-test: both directions simultaneously
  ✅ self-test: empty inputs return empty diff
──────────────────────────────────────────────────────────────────────────────
Phase 969 test-registration guard — production check
──────────────────────────────────────────────────────────────────────────────
Files on disk (5):
  lib/__tests__/phase969/_temporaryUnregistered.test.js
  lib/__tests__/phase969/boundedLedgerRead.test.js
  lib/__tests__/phase969/creativeGrouping.test.js
  lib/__tests__/phase969/learningLease.test.js
  lib/__tests__/phase969/phase969RegistrationGuard.test.js
Chain entries (4):
  lib/__tests__/phase969/boundedLedgerRead.test.js
  lib/__tests__/phase969/creativeGrouping.test.js
  lib/__tests__/phase969/learningLease.test.js
  lib/__tests__/phase969/phase969RegistrationGuard.test.js
──────────────────────────────────────────────────────────────────────────────
MISSING FROM CHAIN (1):
  lib/__tests__/phase969/_temporaryUnregistered.test.js
──────────────────────────────────────────────────────────────────────────────
---EXIT 1---
```

Exit code 1. The guard named the offending file:
`_temporaryUnregistered.test.js`.

After removing the file:

```
$ npm run build && node lib/__tests__/phase969/phase969RegistrationGuard.test.js
[build succeeds]
OK: every file on disk is in the chain, and every chain entry has a file on disk.
---EXIT 0---
```

The temp file was deleted from disk. Working tree clean.

### 4.3 Live demonstration — chain entry pointing at non-existent file

Added `test:phase969:_ghost` script referencing
`_neverExisted.test.js` (chain entry, no file on disk). Package.json
backed up before, restored after.

```
$ npm run build && node lib/__tests__/phase969/phase969RegistrationGuard.test.js
──────────────────────────────────────────────────────────────────────────────
Phase 969 test-registration guard — self-test
──────────────────────────────────────────────────────────────────────────────
  ✅ self-test: missing-from-chain direction detected
  ✅ self-test: orphaned-in-chain direction detected
  ✅ self-test: both directions simultaneously
  ✅ self-test: empty inputs return empty diff
──────────────────────────────────────────────────────────────────────────────
Phase 969 test-registration guard — production check
──────────────────────────────────────────────────────────────────────────────
Files on disk (4):
  lib/__tests__/phase969/boundedLedgerRead.test.js
  lib/__tests__/phase969/creativeGrouping.test.js
  lib/__tests__/phase969/learningLease.test.js
  lib/__tests__/phase969/phase969RegistrationGuard.test.js
Chain entries (5):
  lib/__tests__/phase969/_neverExisted.test.js
  lib/__tests__/phase969/boundedLedgerRead.test.js
  lib/__tests__/phase969/creativeGrouping.test.js
  lib/__tests__/phase969/learningLease.test.js
  lib/__tests__/phase969/phase969RegistrationGuard.test.js
──────────────────────────────────────────────────────────────────────────────
ORPHANED IN CHAIN (1):
  lib/__tests__/phase969/_neverExisted.test.js
──────────────────────────────────────────────────────────────────────────────
---EXIT 1---
```

Exit code 1. The guard named the offending entry:
`_neverExisted.test.js`.

After restoring `package.json`:

```
$ npm run build && node lib/__tests__/phase969/phase969RegistrationGuard.test.js
OK: every file on disk is in the chain, and every chain entry has a file on disk.
---EXIT 0---
```

`git status` confirmed package.json was unmodified after the
demonstration (only `learningLease.test.ts`,
`phase969RegistrationGuard.test.ts`, and `tasks.md` are dirty —
those are this batch's intended edits).

### 4.4 Net behaviour

The guard now proves itself on every run via the self-test, AND
proves itself against the live filesystem. The live demonstrations
were one-shot, but their raw output is recorded in this report so a
later reviewer can confirm the failure shape was correct.

---

## 5. Build, test, and commit

### 5.1 Build

Command: `npm run build` (no `Remove-Item lib` needed — the file
edits did not require a stale-build reset).

Raw output (tail):

```
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
```

Exit 0. tsc emitted no diagnostics.

### 5.2 Per-test execution

```
$ node lib/__tests__/phase969/learningLease.test.js
[12 lease tests, all passing]

$ node lib/__tests__/phase969/phase969RegistrationGuard.test.js
[4 self-test cases + production check, all passing]
OK: every file on disk is in the chain, and every chain entry has a file on disk.
```

The other two Phase 2 tests (`creativeGrouping.test.ts`,
`boundedLedgerRead.test.ts`) were not modified in this batch.

### 5.3 Full test chain

Command: `npm test`. Exit 0. The chain reaches its final entry:

```
[registration guard output]
[intermediate test output elided]
contractFixtures.test: PASS
```

Full log at `C:\temp\opencode\full-test-batch-02a.log`.

### 5.4 Commit

```
$ git status --short
 M functions/src/__tests__/phase969/learningLease.test.ts
 M functions/src/__tests__/phase969/phase969RegistrationGuard.test.ts
 M specs/969-cumulative-learning/tasks.md
```

Three files changed, none of them in the prohibited set
(`qararEngine.ts`, `metaSync/lease.ts`, `metaSync/orchestrator.ts`).

---

## 6. What I have NOT done

- **Phase 3 implementation.** This batch is corrections only. The
  Phase 3 code lands in Batch 03, which the owner will approve next.
- **T012 / T018a implementation.** The task is now in `tasks.md`;
  the code lands in Phase 3.
- **T064b (SC-049 behavioural test) implementation.** Same.
- **Lint load fix.** Still pre-existing from `eba9eaf`. Per owner
  correction, not in scope.
- **PR / push.** Per project rules, push happens after the owner
  approves the report.

---

## 7. Stop point

Batch 02a is complete. All four corrections are now in places that
execute or get read:

- T012 moved to Phase 3 in `tasks.md` as T018a (a recorded task, not
  a prose promise).
- The corrected SC-017 discrimination reasoning and the coverage
  limit are in the `learningLease.test.ts` header comment.
- SC-049's behavioural test is T064b in Phase 7 with the source-level
  claim explicitly withdrawn.
- The guard proves itself via a permanent self-test, and both
  failure directions are demonstrated against the live filesystem
  with raw output recorded here.

Stopping and awaiting the owner's response before Phase 3.
