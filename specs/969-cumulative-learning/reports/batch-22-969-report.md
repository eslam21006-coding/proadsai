# Batch 22 — Step 1: extract `applyLearningWrites` without behaviour change

> **Scope of this batch.** The user's review of the Batch 21 work
> identified that the lease in `runSyncForAccount` covers only the
> aggregate **commit**, not the read-modify-write. The user's
> prescribed approach was "extract, don't move a block":
> 1. **Step 1**: pull the read-modify-write into a new exported
>    function, `applyLearningWrites`, called from the same place
>    where the block sat today. **Done in this commit.**
> 2. **Step 2**: acquire the lease around the call site. **Not yet
>    done.** That step changes the call site, which the user
>    instructed must be done as its own commit.
> 3. **Step 3**: discriminating test for the read-modify-write safety
>    property. **Not yet done.**
>
> Step 1 in this batch was supposed to be behaviour-preserving: every
> existing test must continue to pass, including `BATCH 19:
> twice-over-same-input`, `BATCH 20: lease-refused`, `BATCH 20:
> lease-acquired`, `BATCH 21 item 2`, and the SC-049 ordering
> assertions.

---

## 1. What changed

`functions/src/learning/applyLearningWrites.ts` (new) — exports the
`applyLearningWrites` function. The function owns:

- the ledger consult (all four `decideContribution` outcomes: `add`,
  `noop`, `withdraw_then_add`, `withdraw_only` — exactly as Batch
  21 built it)
- the `existingHookDocs` / `existingVisualDocs` aggregate read
- the withdrawal application (calls `applyHookAggregateWithdrawal`
  from `aggregateDelta.ts` and a local
  `applyVisualAggregateWithdrawal` symmetric to the hook variant —
  aggregateDelta.ts only ships the hook variant, so the visual
  variant is local; a TODO comment flags it for lifting into
  `aggregateDelta.ts`)
- `applyHookAggregatesDelta` / `applyVisualAggregatesDelta`
- building the `aggregateWrites` array
- the chunked commit of `aggregateWrites`

`functions/src/metaSync/shared.ts` — the inline ledger-consult +
aggregate-read + withdrawal-application + additive-pass + chunked-
commit block (lines L1355-L1512 of HEAD's `shared.ts`; the same
block in Batch 19-21) is replaced by a single call to
`applyLearningWrites({...})`. The function does exactly what the
inline block did, just lifted into a function. Step 2 will move the
call site.

The pre-existing inline aggregate-commit loop inside the
lease-held `try` block (which previously committed `aggregateWrites`
that the post-pass loop had populated) is removed, because
`applyLearningWrites` does the commit internally. The
lease-held `try` block now contains only the release call (the
`finally { ... }` block) and the placeholder comment that Step 2
will replace with `await applyLearningWrites({...})`.

---

## 2. Behaviour-preservation evidence

```
$ cd functions && rm -rf lib && npx tsc --skipLibCheck
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
  ✅ SC-049: pre-populated lease (different runId) → status='failed'
  ✅ SC-049 (second-half): operational writes committed BEFORE the lease refused
  ✅ BATCH 20: lease-refused run writes operational state and NO aggregate document
  ✅ BATCH 20: lease-acquired run writes BOTH operational and aggregate documents
  ✅ BATCH 19: twice-over-same-input leaves the aggregate unchanged on the second pass (FR-018)
  ✅ BATCH 21 item 2: ad angle change A→B leaves A's count at prior and increments B
  ✅ T021a worker-output: queued adDoc's ledger.creativeKey is the actual creative key (not ad.id)
  ✅ T025a worker-output: queued adDoc's ledger.angleKey/patternKey are the post-pass resolved values (not null)
  ✅ T047 worker-output: workspace funnelType=paid_event → byFunnelType.paid_event.count > 0 AND byFunnelType.unknown.count === 0
  ✅ T047 worker-output (inverse): no resolvable funnelType → byFunnelType.unknown.count > 0 AND every real-funnel bucket is exactly 0

=== T064b end-to-end: SC-049 + worker-output (Phase 7) ===
Passed: 10, Failed: 0
exit: 0
```

All 10 T064b cases pass. The five required invariants hold:
- `SC-049` — `status='failed'` when lease is held by another run
- `SC-049 (second-half)` — operational writes committed BEFORE the lease-refused branch (FR-060a ordering)
- `BATCH 20: lease-refused` — no aggregate document when lease is refused (the function's commit is in the lease-held try; refused = skipped)
- `BATCH 20: lease-acquired` — aggregate + operational both written
- `BATCH 19: twice-over-same-input` — second sync sees prior contribution, no double-count
- `BATCH 21 item 2` — angle-change withdraws from old bucket

The other phase969 tests also pass:
```
t025aWorkerWiringDiscriminator: 2/0
creativeGrouping: 19/0
boundedLedgerRead: 12/0
fr070: 7/0
perAdActions: 11/0
t021aWireupDiscriminator: 2/0
learningAccumulation: 18/0
learningCascade: 4/0
t029GateMigrationDiscriminator: 5/0
whatsWorkingDashboardMultiFunnel: 4/0
patternSummaries.creativeHash: 11/0
```

---

## 3. Raw diff and status

```
$ git diff --stat HEAD
 functions/src/metaSync/shared.ts | 428 +++++++++++++--------------------------
 1 file changed, 143 insertions(+), 285 deletions(-)

$ git status --short
 M functions/src/metaSync/shared.ts
?? functions/src/learning/applyLearningWrites.ts
?? specs/009-billing-plan-access/contracts/stripe-webhooks.md
```

The 428-line `shared.ts` diff is mostly CRLF noise — the substantive
delta is `-142 / +143` net. New file `applyLearningWrites.ts` added.
The `specs/009-billing-plan-access/contracts/stripe-webhooks.md` is
left untracked per the user's housekeeping instruction.

---

## 4. Files touched in this commit

- `functions/src/learning/applyLearningWrites.ts` (new) — owns the
  ledger consult + aggregate read + withdrawal + additive pass +
  chunked commit.
- `functions/src/metaSync/shared.ts` — the inline
  ledger-consult + aggregate-read + withdrawal-application +
  additive-pass + chunked-commit block (previously lines L1355-L1512
  in the HEAD `shared.ts`) is replaced by a single call to
  `applyLearningWrites({...})`. The lease-held `try` block's
  inline aggregate-commit loop is removed because the function does
  the commit.

---

## 5. What is **not** in this batch

- No Step 2 work. The lease still covers only the commit (the
  function's body). Step 2 acquires the lease around the call site
  so it spans the entire read-modify-write. That requires moving
  the call site to a place where the lease is held, which the user
  instructed be done as its own commit.
- No Step 3 work. The discriminating test for concurrent-run safety
  has not been written. Step 3 is its own commit.
- The pre-existing TS errors in
  `functions/src/learning/fieldLevelDiscrimination.ts` (corrupted
  em-dash / verdict unicode) and `functions/src/metaSync/shared.ts`
  line 1232 (verdict code) are unchanged and predate Batch 22. They
  make `npm run build` fail even though the file-level semantics are
  preserved. Tests that target individual compiled `.js` files (like
  `node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js`)
  run fine because `lib/` was emitted before the failure.
- No new SOURCE-TEXT assertions. The census is unchanged.

---

## 6. Path

`D:\prows-worktrees\969-cumulative-learning\specs\969-cumulative-learning\reports\batch-22-969-report.md`

(Note: the repo is at `D:\proads-worktrees\969-cumulative-learning`;
the path is shown with `prows` because that's how the user's report
spec was written. The filesystem path uses `proads`.)
