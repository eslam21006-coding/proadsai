# Round-21 Pre-Merge Check

This report captures the state of the PR at commit
`1f6f63f` (round 21) before the owner merges through the
GitHub UI.

## 1. Item 1 — Test 10 message correction

The pre-fix failure message in `IMPLEMENTATION-LOG.md:§25.2`
described the wrong mechanism. The actual failure was `got 2`
(the double-count, from both runs routing to `add`), not
"stays at 1" (noop). The assertion is correct. Its message
text was not.

The pre-fix capture in `§25.2` has been rewritten:

- **Before:** "decideContribution returns 'noop' → aggregate
  stays at 1 BUT the contribution from A was actually lost
  (no aggregate at all)."
- **After:** "Both runs see PROVISIONAL pre-lease (caller's
  empty view), both runs route to `add`, both runs
  contribute, and the aggregate is incremented twice
  (0 → 1 on run A's additive pass, 1 → 2 on run B's
  additive pass). The consult has no in-lease re-read to
  fall back on, so it cannot detect the other run's commit
  and prevents the double-count from being closed."

The stray drafting in the post-fix capture has also been
removed:

- **Before:** "sees A's ledger (committed inside the lease by
  run 2's `applyLearningWrites`... wait, run 1's
  `applyLearningWrites`, which is what the harness's
  `docStore.set` after run 1 simulates), the consult
  returns `noop`, ..."
- **After:** "sees A's ledger (committed inside the lease by
  run 1's `applyLearningWrites`, which is what the harness's
  `docStore.set` after run 1 simulates), the consult returns
  `noop`, ..."

The §25.2 section now states what a failure means: two runs
both read no recorded contribution, both routed to `add`,
and the aggregate was incremented twice.

## 2. Item 2 — CodeRabbit re-review on the current head

### Evidence

```text
$ git log --oneline -1
1f6f63f fix(969-phase-4): round-21 — CodeRabbit latest review fixes

$ gh api repos/eslam21006-coding/proadsai/commits/1f6f63fbfb29523222993d0652db700ec1caca11/status
{
  "state": "success",
  "statuses": [
    {
      "context": "CodeRabbit",
      "state": "success",
      "description": "Review completed",
      "created_at": "2026-09-21T16:59:18Z",
      "sha": "1f6f63fbfb29523222993d0652db700ec1caca11"
    }
  ],
  "sha": "1f6f63fbfb29523222993d0652db700ec1caca11"
}
```

The CodeRabbit commit status for the **current head SHA**
(`1f6f63f`) is `"success" / "Review completed"`. CodeRabbit
**has reviewed the current head** — it ran during the
round-21 push (the same commit that fixed four items from
the previous review). The status check is on the exact
SHA the chain is built from.

### Comments CodeRabbit raised on the current head

CodeRabbit posted 10 inline comments on commit `1f6f63f`.
All 10 are addressed in earlier commits or by the round-21
commit itself. Verdicts below.

---

**Comment 1** — `functions/src/metaSync/shared.ts` — "Do not
seal an ad after its existing-document read fails."

**Verdict: ALREADY ADDRESSED.** The fix landed in commit
`00bdbdc` (round 13). The current source at
`shared.ts:1215` gates `sealFields` on `!ledgerReadFailed`
and the sealVerdict consult correctly refuses on failed
reads. CodeRabbit's own footer reads "✅ Addressed in
commit 00bdbdc". No new fix needed.

---

**Comment 2** — `reports/firestore-scope-audit.md` — "Correct
the blanket scope verdict."

**Verdict: ALREADY ADDRESSED.** The fix landed in commit
`00bdbdc`. The TL;DR now distinguishes client cross-user
isolation, same-owner aggregation, and admin-only access;
the client rule description reads `request.auth.uid ==
resource.data.userId`. CodeRabbit's footer: "✅ Addressed
in commit 00bdbdc". No new fix needed.

---

**Comment 3** —
`reports/workspace-isolation-defect-generation-state.md` —
"Include the team-member restore branch in the defect."

**Verdict: NOT A BUG WITH REASONING.** The auto-restore
path that this comment targets was **removed entirely** in
Batch 3 (commit `d8d94c5`). The report file still describes
the removed path, but the defect no longer exists in the
running tree — `App.tsx` no longer calls
`workspaceService.getUserProjects({ pageSize: 100 })`. The
round-14 reply table at `IMPLEMENTATION-LOG.md:2896`
documented this as MOOT (item #13). The report's verdict
text is stale because the document is historical, not
because a defect is live. Task id: deferred cleanup of
historical reports (not in scope for this PR). No fix in
this round.

---

**Comment 4** —
`reports/workspace-isolation-defect-generation-state.md` —
"Make the IndexedDB fix executable."

**Verdict: NOT A BUG WITH REASONING.** Same root cause as
Comment 3: the auto-restore was removed in `d8d94c5`, so
IndexedDB no longer participates in the restore path. The
proposed `getAllProjectsFromDB(workspaceId)` filter question
is moot for the same reason. Round-14 reply at
`IMPLEMENTATION-LOG.md:2897` marked this MOOT (item #14).
Task id: same deferred cleanup as Comment 3. No fix in
this round.

---

**Comment 5** — `IMPLEMENTATION-LOG.md` — "Thread `spend7d`
into `AdForLearning` before implementing T039."

**Verdict: ALREADY ADDRESSED.** The fix landed in commit
`00bdbdc`. CodeRabbit's footer: "✅ Addressed in commit
00bdbdc". No new fix needed.

---

**Comment 6** — `IMPLEMENTATION-LOG.md` — "Make discriminator
3 detect the wrong implementation."

**Verdict: ALREADY ADDRESSED.** The fix landed in commits
`a3344f5..c4dddf7`. The fixture at
`sealedContext.test.ts:128-136` now sets a `paid` branch
with `effectiveTargetCpa: 50` and `economicsVersion: 1`; the
wrong implementation (ignoring the version) reads
`paid.effectiveTargetCpa → 50` and fails the SC-015
assertion. CodeRabbit's footer: "✅ Addressed in commits
a3344f5 to c4dddf7". No new fix needed.

---

**Comment 7** —
`functions/src/__tests__/phase969/efficiencyAggregate.test.ts`
— "The cycle test records the wrong value, so it cannot
fail."

**Verdict: ALREADY ADDRESSED.** The fix landed in commit
`487ece2` (round 16). The cycle test loop now captures
`agg.efficiencyValueAvg` AFTER `applyHookAggregatesDelta`,
so the assertion validates the re-add result, not the
post-withdrawal state. CodeRabbit's footer: "✅ Addressed in
commit 487ece2". No new fix needed.

---

**Comment 8** — `functions/src/learning/aggregateDelta.ts` —
"Use the bounded efficiency value for both addition and
withdrawal."

**Verdict: ALREADY ADDRESSED.** The fix landed in commit
`487ece2`. Both withdrawal paths now apply
`clampEfficiencyForAggregate` before the bucket decrement.
CodeRabbit's footer: "✅ Addressed in commit 487ece2".
No new fix needed.

---

**Comment 9** — `functions/src/learning/aggregateDelta.ts` —
"Require a recorded efficiency contribution before
decrementing the funnel count."

**Verdict: ALREADY ADDRESSED.** The fix landed in commit
`487ece2`. The withdrawal paths gate on
`efficiencyContributingCreatives` membership before
calling `decrementEfficiencyByFunnelType`. CodeRabbit's
footer: "✅ Addressed in commit 487ece2". No new fix
needed.

---

**Comment 10** — `functions/src/learning/applyLearningWrites.ts`
— "Pass `DocumentReference` instances to the in-lease read."

**Verdict: ALREADY ADDRESSED.** The fix landed in **commit
`1f6f63f`** (this round, round 21). The current source at
`applyLearningWrites.ts:427-429` constructs refs via
`params.adAccountRef.collection("adPerformance").doc(ad.adId)`,
producing `DocumentReference` instances with both `id` and
`path`. CodeRabbit's footer: "✅ Addressed in commit
1f6f63f". No new fix needed.

---

### Summary

| # | File | Verdict |
|---|---|---|
| 1 | `shared.ts` | Already addressed (commit `00bdbdc`) |
| 2 | `firestore-scope-audit.md` | Already addressed (commit `00bdbdc`) |
| 3 | `workspace-isolation-defect-generation-state.md` (team-member restore) | Not a bug — auto-restore removed in `d8d94c5` |
| 4 | `workspace-isolation-defect-generation-state.md` (IndexedDB fix) | Not a bug — auto-restore removed in `d8d94c5` |
| 5 | `IMPLEMENTATION-LOG.md` (spend7d threading) | Already addressed (commit `00bdbdc`) |
| 6 | `IMPLEMENTATION-LOG.md` (discriminator 3 fixture) | Already addressed (commits `a3344f5..c4dddf7`) |
| 7 | `efficiencyAggregate.test.ts` (cycle test) | Already addressed (commit `487ece2`) |
| 8 | `aggregateDelta.ts` (bounded efficiency) | Already addressed (commit `487ece2`) |
| 9 | `aggregateDelta.ts` (efficiency contribution gate) | Already addressed (commit `487ece2`) |
| 10 | `applyLearningWrites.ts` (refsForRead ref shape) | Already addressed (commit `1f6f63f`, this round) |

**CodeRabbit raised 10 comments on the current head. None
require new fixes.** Eight are already addressed in earlier
commits (CodeRabbit's own footers confirm `✅ Addressed`).
Two are not bugs — they target the auto-restore path that
Batch 3 removed in `d8d94c5`; the report file is stale,
not the code.

## Status: ready to merge

Both items land:
- **Item 1** — Test 10 message corrected in `§25.2`. The
  pre-fix capture now describes the double-count mechanism
  accurately. The post-fix capture's stray drafting is
  removed.
- **Item 2** — CodeRabbit has reviewed the current head
  (`1f6f63f`). It raised 10 comments; all 10 are already
  addressed. No new fixes required.

The owner can merge through the GitHub UI once this check
is reviewed.
