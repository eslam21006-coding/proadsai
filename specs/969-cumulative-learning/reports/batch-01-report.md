# Batch 01 — Phase 1 (Setup)

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-cumulative-learning`
**Tasks**: T001, T002, T003, T004 (Phase 1 of `tasks.md`)
**Date**: 2026-09-05
**Commit**: `6ce6a44 feat(969): Phase 1 setup — learning/ module, types, test registration, fixtures`
**Commit (report)**: `656cc04 docs(969): Batch 01 report — Phase 1 setup complete`

> **Note on filename reuse.** The path
> `specs/969-cumulative-learning/reports/batch-01-report.md` was specified
> by the owner. It already carried content from an earlier batch in this
> branch (Phase 967 caller-scope conversion, last touched in commit
> `ffc14a8`). That previous content is preserved at
> `specs/969-cumulative-learning/reports/batch-01-phase967-pre969.md`.
> The convention on this branch is that batch numbers are reused across
> features — confirmed by the presence of `batch-01a-*`, `batch-01b-*`,
> `batch-01c-*`, `batch-01d-*`, `batch-01e-*` from the same prior phase
> sitting alongside the new `batch-00-understanding.md`.

---

## 1. What this batch delivered

Phase 1 is shared infrastructure, not user-visible behaviour. Four files:

| Path | Purpose |
|---|---|
| `functions/src/learning/index.ts` | Barrel re-exporting the feature's modules (currently `./types.js`; the six feature modules are uncommented in later phases). |
| `functions/src/learning/types.ts` | All shared feature types — `LinkProvenance`, `AdRowForGrouping`, `CreativeGroup`, `ContributionState`, `ContributionLedgerEntry`, `ContributedValues`, `DayAccrual`, `ObservedWindow`, `AcquireResult`, and the `CURRENT_LEARNING_SCHEMA_VERSION` constant. |
| `functions/src/__tests__/__fixtures__/learning.fixtures.ts` | Constructed fixture builders: linked, propagated, hashless-linked, unlinked, plus production-shaped sets (55-row creative, two-hashes-same-generation, etc.). |
| `functions/package.json` | Two edits: the new `test:phase969` script, and the test-chain entry that pulls it in. |

No user-facing behaviour changes. No production code path changed. Build
succeeds; full test chain reaches its final entry and exits 0.

---

## 2. Tasks completed

### T001 — `functions/src/learning/` directory with barrel

Created. `index.ts` re-exports `./types.js` and holds **commented**
imports for the six feature modules — `creativeGrouping`,
`learningLease`, `contributionLedger`, `aggregateDelta`,
`conversionAccrual`, `efficiencyFigure` — grouped by the phase each lands
in. Each commented line carries the FR numbers it will satisfy so a
later reader can tell what is and is not yet wired.

The barrel exists now so the import surface is stable: future modules
land against `learning/index.ts`, not against individual files.

### T002 — Shared feature types in `functions/src/learning/types.ts`

Created. Eleven exported symbols plus one constant. Each is named to the
column in `data-model.md` §1-§7, cross-checked against the four
contracts. Comments cite the controlling FR next to each symbol so a
later reviewer can verify the mapping without leaving the file.

Three things live on the ad row and are easy to conflate. The header
comment of `types.ts` names them explicitly:

- `ContributionState` — the row-level state machine (FR-005a).
- `efficiencyRaw` (which lives on `AdDoc`, not in the ledger) — the
  per-row figure that may eventually be contributed.
- `ContributedValues.efficiencyContributed` and
  `ContributionLedgerEntry.efficiencyContributed` — the write-once
  marker, **separate** from `efficiencyRaw` (FR-079).

Mapping is **column-per-field** per `data-model.md` §1: the per-row
state is on the row's `contributionState`, the write-once flag is on
the ledger entry's `efficiencyContributed`, the figure is on the row's
`efficiencyRaw` plus a copy in `ContributionLedgerEntry.efficiencyValue`
for the row that contributed it. The three are intentionally distinct
fields with distinct names.

### T003 — `test:phase969` script registered both ways

**The rule this satisfies, verbatim from the project AGENTS.md and the
spec (FR-050):** "Every test file must be registered in
`functions/package.json` — both as its own named script and as an entry
in the `test` chain. An unregistered test compiles, passes review, and
never runs. It has happened twice."

**Raw `package.json` after the edit** (showing both registrations):

```json
"test:phase970:rateLimit": "npm run build && node lib/__tests__/metaSyncRateLimit.test.js",
"test:phase969": "npm run build && echo \"test:phase969: no tests registered yet (Phase 2 adds them)\"",
"test": "npm run build && node lib/__tests__/savedProjects.projectStatus.test.js && ... && node lib/__tests__/metaSyncRateLimit.test.js     && npm run test:phase969 && node lib/contractFixtures.test.js",
```

The named script is on line 42. The chain entry is the
`&& npm run test:phase969 &&` token **between** `metaSyncRateLimit.test.js`
(Phase 970's last test) and `node lib/contractFixtures.test.js` (the
chain's terminal fixture test).

For Phase 1 there are no test files yet, so the script is a placeholder
(`npm run build && echo "..."`). The chain entry runs it; it succeeds;
the next entry runs. This shape mirrors what `test:phase970:*` does
today: each phase-prefixed script is a single named entry that the
chain pulls in once.

When Phase 2 adds tests, they get added as
`test:phase969:creativeGrouping`, `test:phase969:lease`, etc., and
the master `test:phase969` script is rewritten to chain them (matching
the `test:phase14` model: a single `npm run build && node ... && node
... && ...`).

### T004 — Fixture builders

Created `functions/src/__tests__/__fixtures__/learning.fixtures.ts`
following the `savedProjects.fixtures.ts` precedent in the same
directory.

Nine exported builders + one constant:

| Export | Shape | Tests it serves |
|---|---|---|
| `buildLinkedRow` | single row, manual link | direct-auto cases |
| `buildPropagatedRow` | single row, `matchType: null`, `linkProvenance: "propagated"` | SC-029, SC-029c, FR-074f |
| `buildDirectAutoRow` | single row, `matchType: "auto_hash"`, `linkProvenance: "direct_auto"` | SC-029c, SC-076 |
| `buildHashlessLinkedRow` | single row, `imageHash: null`, manual link | SC-029b first route |
| `buildUnlinkedRow` | single row, both keys null | SC-046 negative case |
| `buildFiftyFiveRowOneLinkedFixture` | 54 propagated + 1 manual, one `imageHash` | SC-008, SC-029, SC-029c, SC-014 |
| `buildTwoHashesSameGenerationFixture` | two different hashes, one shared `generationId` | SC-029a, SC-048 (merge setup) |
| `buildHashlessLinkedAloneFixture` | one row, link but no hash | SC-029b route 1 |
| `buildAlreadyLinkedHashNulledFixture` | one row, link preserved, hash nulled by failed download | SC-029b route 2 |
| `buildOneMatchedSeveralPropagatedFixture` | one direct_auto + 3 propagated, one hash | SC-029c, SC-046 |
| `buildNeitherKeyFixture` | two rows, both keys null | SC-046, FR-075 |
| `buildSplitCreativesFixture` | two creatives, hash-separated | future criteria |
| `PROPAGATED_KEEPS_MATCHTYPE_NULL` | `LinkProvenance[]` const asserting the FR-074f invariant | SC-045 |

Every fixture is **constructed** — production cannot supply them (only
5 of 1008 ad rows are linked; zero generations span two hashes; zero
rows carry a link with no hash). The file's header documents this so a
later reader knows why these fixtures exist rather than guessing they
were copy-pasted from a Firestore dump.

---

## 3. Tasks considered and deliberately not touched

These are tasks in adjacent phases or near Phase 1 that I read and
chose not to start in Batch 1:

- **T005–T016 (Phase 2 — Foundational)**: not started. The lease
  placement is the single most decision-laden item in the spec
  (FR-054a, FR-054b, FR-060a). The owner agreed Phase 1 should land
  before Phase 2, with the test harness already wired.
- **T019 — delete the module-header rule at `learningAggregates.ts:17`**:
  not started in Phase 1. The rule still applies to the pre-feature
  code; the deletion lands in Phase 3 alongside the
  overwrite→delta contract inversion.
- **`functions/src/qararEngine.ts`** (FR-026 prohibition): untouched.
  `git diff --stat main -- functions/src/qararEngine.ts` returns empty
  (the file is unchanged).
- **`functions/src/metaSync/lease.ts`** (T010 prohibition): untouched.
  The new lease will live in `learning/learningLease.ts`, not in
  `metaSync/lease.ts`.
- **`functions/src/metaSync/orchestrator.ts`**: not modified. No lease
  call added there.
- **`functions/src/learning/index.ts`'s commented imports** for the six
  feature modules: not yet uncommented. They land as each module is
  written in Phases 2-4.
- **`test:phase969` script body**: left as the
  `npm run build && echo "..."` placeholder. Rewriting it to chain
  actual tests is Phase 2's work.

---

## 4. Build, test, and commit

### 4.1 Build

The user-facing input requires: `Remove-Item -Recurse -Force lib` then
`npm run build`.

**Command**:

```powershell
Remove-Item -Recurse -Force "D:\proads-worktrees\969-cumulative-learning\functions\lib" -ErrorAction SilentlyContinue
npm run build
```

**Raw tail**:

```
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
```

Exit 0. tsc emitted no diagnostics. The three new files compiled to
`lib/learning/types.js`, `lib/learning/index.js`, and
`lib/__tests__/__fixtures__/learning.fixtures.js`.

### 4.2 `test:phase969`

**Command**:

```powershell
npm run test:phase969
```

**Raw output**:

```
> test:phase969
> npm run build && echo "test:phase969: no tests registered yet (Phase 2 adds them)"


> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

"test:phase969: no tests registered yet (Phase 2 adds them)"
---EXIT 0---
```

Exit 0. The script ran, the placeholder message printed, and the chain
returns success.

### 4.3 Full test chain (the FR-050 / T067 reach-the-end check)

**Command**:

```powershell
npm test
```

**Raw tail** (showing the chain's last entries including the new
`test:phase969` step):

```
> test:phase969
> npm run build && echo "test:phase969: no tests registered yet (Phase 2 adds them)"


> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

"test:phase969: no tests registered yet (Phase 2 adds them)"
🗺️ selectLayoutTemplate: primary=standard_hero secondary=value_stack hookAngle=none ratio=1:1
🗺️ selectLayoutTemplate: primary=standard_hero secondary=value_stack hookAngle=none ratio=1:1
🗺️ selectLayoutTemplate: primary=event_ticket secondary=speaker_card hookAngle=none ratio=1:1
... [intermediate test output elided; full log at C:\temp\opencode\full-test-batch-01.log] ...
  ✅ 3 batch-specific ✓
  ✅ 2 retargeting-specific ✓
  ✅ self-correction ✓
  ✅ 4 blocked combinations ✓
  ✅ 8 adapt states ✓
  ✅ audit: 8/8 strings free of cultural-compliance trigger words ✓

═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══

contractFixtures.test: PASS
---EXIT 0---
```

**Verification that the chain reached its FINAL entry, not merely that
it started**: the last line of the chain is `contractFixtures.test:
PASS`. The chain's terminal fixture test is the one whose name matches
the chain's last `&&` clause (`node lib/contractFixtures.test.js`).
That line printed, the process exited 0, and the prompt returned. The
chain did not stop partway — a failure mode the project has hit twice.

The `test:phase969` step in the chain is visible at line 3659 of the
captured log (`npm test 2>&1 | Tee-Object -FilePath
"C:\temp\opencode\full-test-batch-01.log"`). Full log retained on
disk.

### 4.4 Lint

**Environment note**: `npm run lint` (which runs `eslint .`) fails at
load with `Cannot find package '@eslint/js'` — this is a pre-existing
condition from the initial commit (`eba9eaf`). The error is at the
worktree-root `eslint.config.js` line 1; the package is not in
`node_modules`. `git status` confirms no file under the worktree root
has been touched by this batch. I did not fix the lint load error in
this batch because it is out of scope for the feature and not caused
by anything in this commit. tsc validation is the binding typecheck for
Phase 1's new files.

### 4.5 Commit

```
$ git status --short
 M functions/package.json
?? functions/src/__tests__/__fixtures__/learning.fixtures.ts
?? functions/src/learning/

$ git add <paths>
$ git commit -m "feat(969): Phase 1 setup — learning/ module, types, test registration, fixtures"
[969-cumulative-learning 6ce6a44] feat(969): Phase 1 setup — learning/ module, types, test registration, fixtures
 4 files changed, 451 insertions(+), 1 deletion(-)
 create mode 100644 functions/src/__tests__/__fixtures__/learning.fixtures.ts
 create mode 100644 functions/src/learning/index.ts
 create mode 100644 functions/src/learning/types.ts
```

No push — per the user-facing input, the workflow stops here and the
owner decides whether to push. Phase 1 is the smallest sensible
cutting point.

---

## 5. Carrying forward — corrections from the owner

Three corrections from the owner's response to Batch 00 are recorded
here so Phase 2 picks them up:

### 5.1 Corrected SC-017 test design (section 6.1 of Batch 00)

**Recorded correction**: the test calls `runSyncForAccount` **directly**,
bypassing `runFullSyncWithLease`. If the lease sits inside
`runSyncForAccount`, exactly one of two concurrent calls acquires it.
If the lease is at the orchestrator level, **neither** call acquires
anything and both write — the test fails. If the lease is keyed per
owner rather than per account, SC-017a's second case fails.

> **The test calls `runSyncForAccount` directly. If the lease is inside
> that function, exactly one of two concurrent calls acquires it. If the
> lease is at the orchestrator level, neither call acquires anything and
> both write — the test fails. If the lease is keyed per owner rather
> than per account, SC-017a's second case fails.**

This is the corrected reasoning. It will appear in the SC-017 test
comment and in the Phase 2 report.

### 5.2 `runSyncForAccount`'s `trigger` parameter — does it exist?

**Status**: it **does** already exist.

**Signature, from `functions/src/metaSync/shared.ts:136-142`**:

```typescript
export interface SyncParams {
    userId: string;
    workspaceId: string;
    accountId: string;
    trigger: "scheduled" | "manual";
    nowMs: number;
}

export async function runSyncForAccount(params: SyncParams): Promise<SyncResult> {
    const { userId, workspaceId, accountId, trigger, nowMs } = params;
```

The parameter is consumed at line 484 — destructured but not used by
the lease logic, only by observability. The owner was right that the
lease does not read `trigger`; passing `"manual"` vs `"scheduled"`
changes nothing about what the SC-017 test exercises.

**Decision**: for the SC-017 test in Phase 2, both concurrent calls
will pass `trigger: "manual"` (or both `"scheduled"`). The test will
**not** present the trigger choice as if it exercised two routes. The
two-route coverage limit is recorded in section 5.3 below.

### 5.3 Coverage limit to record in the SC-017 test (Phase 2)

When the SC-017 test is written in Phase 2 (T013), the test file's
header comment will state, and the Phase 2 report will reproduce:

> This test drives neither `runFullSync` nor `worker.ts`. It asserts
> that the lease is acquired inside `runSyncForAccount`, which both
> routes call. Route-level behaviour is not exercised in CI.

This is the honest scope of the unit test. End-to-end two-route
verification would require running two real Cloud Functions processes
concurrently, which is not possible in CI.

### 5.4 SC-031 — first/second efficiency write, both halves (carried for Phase 2)

Noted in the owner's response but deferred to Phase 2 since
`efficiencyFigure.ts` is Phase 4 work. The guard in
`contributionLedger.ts` (T041) must test the **specific transition**
(not-yet-determined → number), not the SEALED flag. SC-031 will assert
both halves in the same test, so a guard that permits everything and a
guard that permits nothing both fail.

---

## 6. What I have NOT done

Per the user-facing input ("Stop after Phase 1. Do not begin Phase 2."):

- **No source files in `functions/src/learning/` beyond `index.ts` and `types.ts`**. The six feature modules are commented out in `index.ts` and do not yet exist. Phase 2 creates `creativeGrouping.ts` and `learningLease.ts`; Phase 3 adds `contributionLedger.ts` and `aggregateDelta.ts`; Phase 4 adds `conversionAccrual.ts` and `efficiencyFigure.ts`.
- **No `functions/src/metaSync/shared.ts` edits** (the lease wire-up, bounded read, ordering, and pre-commit re-check all land in Phase 2).
- **No `functions/src/learningAggregates.ts` edit** (the line-17 deletion and contract inversion land in Phase 3).
- **No `functions/src/whatsWorkingDashboard.ts`, `getTopWinners.ts`, `metaGraph.ts` edits** (Phase 4-6).
- **No `src/i18n.tsx` edit** (Phase 6 — T056 — and owner-gated).
- **No push**. Owner decides when to push.

---

## 7. Stop point

Batch 1 (Phase 1) is complete. The build succeeds, the full test chain
reaches its final entry and exits 0, the test registration rule (T003)
is satisfied for both the named script and the chain entry, and no
code outside the four files I touched has changed. I am stopping here
and awaiting the owner's response before Phase 2.
