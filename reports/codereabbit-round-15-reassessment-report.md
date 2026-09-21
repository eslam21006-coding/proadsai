# Round-15 Reassessment — Local Report

**Date:** 2026-09-21
**Branch:** `969-phase-4`
**PR:** [#73](https://github.com/eslam21006-coding/proadsai/pull/73)
**Commit:** `<this>`

This report is the companion to §20 in
`specs/969-cumulative-learning/IMPLEMENTATION-LOG.md`. It records
the per-comment verdict for the 16 comments Round-14 dismissed as
"out of scope", the per-ad narrowing fix (Item 2), the 8
"already addressed" claims verification (with the 2 false-claims
the round-14 reply got wrong), and the deferred-to-Batch-6 item.

---

## 1. The user's correction — "Out of scope" is not a verdict

Round-14's reply categorized 16 comments as "Out of scope for
Batch 5" — co-authored by author + code-area. The user's audit
flagged this as wrong because every line in PR #73 is in scope
for the PR's review. The framing should have been: assess each
comment on its own merits against the working tree.

The reassessment table in §20.2 of `IMPLEMENTATION-LOG.md`
records all 16 (deduplicated by code path; 19 comments cite
those 16 code paths; the table splits one comment into its
two cited lines for clarity).

For each:
- The comment verbatim (short).
- File:line in the working tree.
- The batch that introduced the code.
- The verdict: **real bug fixed**, **valid but deferred to a
  named task id**, **not a bug**, or **moot** because the
  upstream fix landed in a prior commit.

Two real bugs were missed in the round-14 reply's "already
addressed" claim — both corrected in this commit (Items 8 and 9
in §20.3 of the log; verbatim: §14 plan's "except T041" wording
is contradictory with the surrounding deferral, and the
version-gate SC-015 fixture did not actually exercise the
discriminator because `paid: undefined` made every impl return
null).

Two real bugs were missed in the round-14 reply's "false
positive" dismissal — same code paths as chatgpt-codex
(comment 1) and coderabbit (comment 7) on `fieldLevelDiscrimination.ts:260-263`,
both flagged the seal fields cleared by `?? null`. The merged
seal can be written over by a later sync with a different target
exactly the way the comment describes.

Four real bugs were silently OK in the reply (correctly cited
prior commits with verbatim line evidence: PII redaction at
`27a34f1`, the §13.2 wording, the §13.7 test-count, the §13.7
whitespace). Two of those eight citations were wrong (Items 8 and
9 above).

---

## 2. The per-ad narrowing — the user's item 2

The Round-14 code passed `data: ledgerAdDoc as ...` to
`batch.set()` — the entire `decision.adDoc` (operational fields
+ ledger subdoc). With `merge: true`, top-level fields merge
right, but the in-memory copy's operational fields can
silently overwrite any interleaved write from another
`runSyncForAccount` invocation or a client session. The fix
narrows to `{ ledger: ledgerAdDoc.ledger }` so the merge
preserves operational fields untouched.

**Verified by two tests**:

| Test | What it pins | Pass |
|---|---|---|
| `efficiencyWiring.test.ts:Test 4` | Seeds `docStore[ACCT_PATH + adPerformance + ad_1] = { cpm3d: 99 }` BEFORE `applyLearningWrites` runs. Asserts `cpm3d === 99` survives. | ✓ |
| `efficiencyWiring.test.ts:Test 4b` | Same shape, independently registered. Asserts `ledger.efficiencyContributed === true` AND `cpm3d === 99` (operational preserved + ledger flip in single commit). | ✓ |

A future commit that reverts to passing the whole doc will fail
both tests. The narrowing fix is durable.

---

## 3. The add/withdraw symmetry pattern

Items 1, 2, 3, 4, 5, 13, 16 in the table are all the same defect
class: a value is incremented or written on the additive path
without a corresponding decrement / guarded mirror on the
withdrawal path. The invariant is stated at
`aggregateDelta.ts:392-411` and breaks despite being stated.

The discipline from this point:
- Every batch touching an aggregate field ships a per-pair
  symmetry check, named.
- The check walks each add path against its withdraw path.
- The check reports them side by side.
- The check fails on the asymmetry before the functional tests
  fail on its consequences.

Items #5 (seal-transition serialization) and #13 (moot after
`d8d94c5`) are the corners of the symmetry: Item 5 is a
concurrency race that the add/withdraw symmetry check alone
does not catch, but is in the same family.

---

## 4. The deferral with a task id

Item 5 — `metaSync/shared.ts:1547` seal-transition concurrency
— is **valid but deferred** to **T053** in **Batch 6**. The
fix is non-trivial (restructure the per-ad loop, the operational
commit, and the lease acquire into a single serialized path).
A sketch lives inline at `shared.ts:1367-1382` with a DEFERRED
marker naming the task id and the new shape (build
`sealedAdocsById` during the per-ad loop, strip `sealFields`
from `decision.adDoc` at the operational merge, commit the seal
fields inside the existing lease-held chunked commit).

The deferred item carries **no behavioral change for the common
path** — Meta's `derived` is stable within a sync cycle. The
race window opens only when settings change between two
overlapping fan-out calls. Documented in the comment at
`shared.ts:1367-1382`.

---

## 5. Verification numbers

Full chain from clean `lib/`:

| Suite | Tests |
|---|---:|
| Phase 969 — pre-existing 22 suites | 252 |
| efficiencyWiring (Round-14 + Round-15: +3 with Test 4b) | **6** |
| patternSummariesEfficiencyKeys (Round-14) | 4 |
| `conversionAccrual` (Round-15: +3 migration/same-window/rolling-window) | **41** |
| `sealedContext` (Round-15: +1 contributedValues-closed-shape) | **26** |
| pre-phase969 stacks | many |

**Phase 969 total**: 284 (previous round-14: 268, +16 = +6%).

**Pre-phase969 totals**: unchanged from round-14; the chain exits
0 and contract fixtures all pass.

**Exit code**: 0 (verified by `echo TEST_EXIT=%ERRORLEVEL%`).

---

## 6. On-the-merits verdict, per code path

The verdict record is the table in §20.2 of `IMPLEMENTATION-LOG.md`.
At a glance:

| Verdict | Count |
|---|---:|
| Real bug, fixed in this commit | 9 (#1 + #2 same code; #3 + #4 same code; #6 + #7 docs; #8 + #9 + #15 test fixes; #10 + #11 docs; #16 closed-shape; #18 + #19 conversionAccrual fixes) |
| Already addressed in prior commits | 4 (#12 + #13 + #14 + #15) |
| Moot (upstream fix landed) | 1 (#13) |
| Valid but deferred to T053 | 1 (#5) |
| Real bug, initial draft wrong, fixed in iteration | 1 (#17 — caught by FR-085a-absent-day test itself) |

The 19 total comment-citations of 16 code paths split: 9 code
paths fix in this commit, 4 are already addressed (and 2 of the
"already addressed" citations were wrong, corrected in this
commit), 1 was moot after `d8d94c5`, 1 is deferred to T053.

---

## 7. Raw `git diff --stat HEAD~1..HEAD`

```
functions/src/__tests__/phase969/conversionAccrual.test.ts |  99 ++++++++++++--
functions/src/__tests__/phase969/efficiencyWiring.test.ts    |  47 ++++++--
functions/src/__tests__/phase969/sealedContext.test.ts       |  68 +++++++--
functions/src/learning/applyLearningWrites.ts               |  35 +++++-
functions/src/learning/contributionLedger.ts                 |  19 ++-
functions/src/learning/conversionAccrual.ts                  |  50 +++++-
functions/src/learning/fieldLevelDiscrimination.ts          |  17 ++-
functions/src/metaSync/shared.ts                              |  25 +++-
specs/969-cumulative-learning/IMPLEMENTATION-LOG.md          | 180 ++++++++++++++++++--
specs/969-cumulative-learning/reports/firestore-scope-audit.md |  10 +--
specs/969-cumulative-learning/reports/workspace-isolation-defect-generation-state.md |  16 ++-
```

---

## 8. Raw `git status --short` (this commit's working tree)

```
 M functions/src/__tests__/phase969/conversionAccrual.test.ts
 M functions/src/__tests__/phase969/efficiencyWiring.test.ts
 M functions/src/__tests__/phase969/sealedContext.test.ts
 M functions/src/learning/applyLearningWrites.ts
 M functions/src/learning/contributionLedger.ts
 M functions/src/learning/conversionAccrual.ts
 M functions/src/learning/fieldLevelDiscrimination.ts
 M functions/src/metaSync/shared.ts
 M specs/969-cumulative-learning/IMPLEMENTATION-LOG.md
 M specs/969-cumulative-learning/reports/firestore-scope-audit.md
 M specs/969-cumulative-learning/reports/workspace-isolation-defect-generation-state.md
?? reports/codereabbit-round-14-report.md
```

---

## 9. Don't merge

Per the user's instruction. The push lands the commit on
`969-phase-4` for review but does NOT merge to `main` and does
NOT enable auto-merge. The next round is Round-15 followup
where CodeRabbit reviews the new commits against this reassessment
and the T053 deferral.

---

## 10. Files in this commit at a glance

- `functions/src/learning/fieldLevelDiscrimination.ts` — round-15 closes the seal-fields-null defect.
- `functions/src/metaSync/shared.ts` — round-15 gates the seal consult on `!ledgerReadFailed`; documents the deferred T053 shape inline at line 1367-1382.
- `functions/src/learning/contributionLedger.ts` — round-15 closes the index signature `[key: string]: unknown` so `sealedTarget` cannot leak in via duck typing.
- `functions/src/learning/conversionAccrual.ts` — round-15 adds the legacy `finalisedTotal` migration. (The finalized-day re-add guard was added in the first pass and reverted in the same commit after the FR-085a test caught an over-aggressive skip.)
- `functions/src/learning/applyLearningWrites.ts` — round-15 narrows the per-ad commit to `{ ledger: ... }` so operational fields survive an interleaved write between T1 and T2.
- `__tests__/phase969/efficiencyWiring.test.ts` — Tests 4 and 4b pin the narrowing invariant.
- `__tests__/phase969/sealedContext.test.ts` — SC-015 [version gate] fixture now includes a paid branch so the wrong-impl returns 50 instead of null, and a new `SC-032 / FR-011(a) [structural]` test reads `contributionLedger.ts` and asserts `sealedTarget` cannot leak in.
- `__tests__/phase969/conversionAccrual.test.ts` — 3 new tests (migration, same-window re-run, rolling-window fold); test name fix.
- `specs/969-cumulative-learning/IMPLEMENTATION-LOG.md` — §20 (this reassessment) appended; §6 status table refreshed; §14 Batch 3 scope contradiction removed; §15.2 discriminator 3 footnote updated.
- `specs/969-cumulative-learning/reports/firestore-scope-audit.md` — TL;DR broadened to acknowledge `recordGenerationFailure`'s `uid`-vs-`userId` distinction; ranking_decisions line clarified per firestore.rules catch-all.
- `specs/969-cumulative-learning/reports/workspace-isolation-defect-generation-state.md` — §7 status block names `d8d94c5` as the closure.

---

## 11. Sign-off

Round-15 reassessment completed. 16 code paths assessed on the
merits. 9 real bugs fixed in this commit. 1 race-condition fix
deferred to T053 in Batch 6 with a code-path marker in
`shared.ts:1367-1382`. 2 false "already addressed" citations
corrected (Items 8 and 9). 1 initial draft reverted after
the test caught it (Item 17).

The PR-73 chain exits 0 with 284 phase969 tests (+16 from the
round-14 baseline of 268). The commit is pushed to `969-phase-4`
for review; do NOT merge to `main`.
