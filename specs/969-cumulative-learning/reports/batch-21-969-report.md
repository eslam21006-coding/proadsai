# Batch 21 — CodeRabbit round-2 review-of-review: Item 2 fix (Item 1 partially addressed)

> **Scope of this batch.** The user identified two real defects in the
> Branch 19/20 work: the lease covers only the commit, and the
> ledger consult handles only the `noop` outcome. **Item 2
> (FR-013 / FR-017) is closed with a behavioural test.** **Item 1
> (FR-054a / FR-055 / FR-060a) is NOT closed in this batch.** The
> structural fix — acquire the lease BEFORE the ledger consult and
> the `existingHookDocs` / `existingVisualDocs` read, hold through
> the commit and release — is documented as a known gap; the
> `runSyncForAccount` source change required for it was attempted,
> reverted, and is recorded below as a follow-up. Item 1 is
> partially addressed: the `aggregateWrites` and the aggregate
> commit loop are INSIDE the lease-held try block, but the lease
> acquire itself is still AFTER the aggregate read (the
> read-modify-write is therefore not yet fully fenced).
>
> **Census change.** This batch RETRACTS Batch 19's §A§3
> `decideContribution` line — the only entry that asserted all
> four outcomes were handled (it wasn't). The behavioural test
> added here is the load-bearing evidence for Item 2.
>
> **Lint status.** Unchanged from prior batches — pre-existing
> `@typescript-eslint` plugin incompatibility on `HEAD` reproduces
> in this batch.

---

## 1. The two items and what this batch does

### Item 1 (FR-054a / FR-055): lease covers only the commit, not the read-modify-write — **NOT closed**

The audit and the user's review correctly identified that
`acquireLearningLease` runs at L1591 — *after* the post-pass loop,
the ledger consult, and the `existingHookDocs` / `existingVisualDocs`
read. The lease fence therefore covers only the aggregate commit at
L1694.

The required fix is: move the lease acquire so it spans the
read-modify-write (post-pass loop + ledger consult + aggregate read +
aggregate compute + aggregate commit).

I attempted this restructure three times. Each attempt left the
function in a state that:

- **Compile-checked clean** (`tsc` exit 0, `npm run build` exit 0).
- **Failed multiple existing tests** (specifically
  `BATCH 20: lease-acquired run writes BOTH operational and aggregate
  documents` and `BATCH 19: twice-over-same-input`).
- The failures were caused by indent drift in the moved blocks: when
  the post-pass + aggregate work moved from after the per-ad loop
  to inside the lease-held try, the indent didn't match its new
  context, and the `}` for the early-return `if (!ok)` block was
  lost during the move. The lease-acquired case then hit a path
  where the post-pass loop ran at wrong indent (the function
  compiled but executed the inner blocks as siblings, not children,
  of the try).

I reverted each attempt to a known-good state and stopped. **Item
1 remains open.** The known-good state has the same shape as Batch
19: lease-acquired runs and aggregates ARE written, but the lease
fence is incomplete.

I did not write a discriminating test for Item 1 because the user's
review said:
> If interleaving cannot be expressed against T064b's stubs, say
> so and stop rather than closing the item on the reordering alone.

T064b's stubs serialise each `await test(...)`; the harness cannot
interleave two `runSyncForAccount` calls within a single test. A
proper test would require either:

1. A direct unit test of the consult + read + compute + commit
   sequence against a mock that runs two interleaved calls; or
2. A new harness that drives two parallel syncs.

Neither was built. **Per the user's instruction, Item 1 is NOT
closed.** A follow-up batch is needed.

### Item 2 (FR-013 / FR-017): only `noop` handled — **closed**

The legacy guard `if (!desired || !recorded) continue;` discarded the
`add` case before `decideContribution` saw it; the only branch the
function acted on was `noop`. `withdraw_then_add` and
`withdraw_only` fell through as plain additions, which means an
angle change (manual re-link, re-resolved angle) silently
double-counts: the contribution to the OLD bucket never gets
withdrawn, and the contribution to the NEW bucket is added on top.

The fix is `functions/src/metaSync/shared.ts`:

1. The ledger consult now populates a `withdrawalHookAds` array
   for every `withdraw_only` and `withdraw_then_add` outcome.
   For `withdraw_only`, the row is removed from `learnedAds`.
   For `withdraw_then_add`, the row stays in `learnedAds` so
   `applyHookAggregatesDelta` adds to the NEW bucket.
2. The aggregate compute now applies the withdrawals FIRST
   (using `applyHookAggregateWithdrawal` from `aggregateDelta.ts`
   and a locally-defined `applyVisualAggregateWithdrawal` symmetric
   to it), THEN the additive pass runs against the post-withdrawal
   baseline.
3. A local `applyVisualAggregateWithdrawal` helper is added to
   `shared.ts` because `aggregateDelta.ts` ships only the hook
   variant; the helper mirrors the hook shape (decrement
   `sampleSize`, `byObjective.conversion.count`, `byGeoTier`,
   `byAudienceType`, and `byFunnelType`). TODO comment notes it
   should be lifted into `aggregateDelta.ts` in a follow-up.

#### Line numbers before and after

The consult block is at **L1315-L1390** (post-pass loop, in the
existing `if (learnedAds.length > 0) { try { ... } catch { ... } }`).
The aggregate read / compute / push block is at **L1390-L1510**
(aggregate read at L1395, compute at L1416, push at L1501/L1508).
The baselines + snapshot push is at L1523-L1555. The operational
commit is at L1556-L1589. The lease acquire is at L1591. The
aggregate commit (inside the lease-held try) is at L1694.

Net structural change in this batch: zero. The Item 2 fix is
purely the new logic inside the existing blocks.

#### Behavioural test (`functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts`)

```typescript
await test("BATCH 21 item 2: ad angle change A→B leaves A's count at prior and increments B", async () => {
    resetStub();
    seedConnection();
    // Seed generation with hookAngle = "urgency" so the FIRST sync
    // contributes to angle A ("urgency").
    seedGenerationMatch({});
    bucket("learningLeases").delete(`${OWNER}_${ACCT_A}`);
    seedImageMatchStubs();
    metaGraph.setFetchImplForTests(seedFetchOneAd());
    seedFunnelSettings("resolve", "paid_event");

    const first = await runSyncForAccount({ ... });
    // First sync: hook aggregate for "urgency" written, count=1.

    // Mutate the generation doc to change hookAngle to "statistics".
    // (The seed helper resets on each call; mutate the bucket directly.)
    const genDoc = bucket("generations").get("gen_1") as Record<string, any>;
    bucket("generations").set("gen_1", {
        ...genDoc,
        creativeIdentity: { ...(genDoc.creativeIdentity ?? {}), hookAngle: "statistics" },
    });

    const second = await runSyncForAccount({ ... });
    // After BATCH 21 fix: urgency's count returns to 0 (withdrawn),
    // statistics's count becomes 1 (added).

    // Assertions: urgency count must be 0; statistics count must be 1.
});
```

#### Before / after failure outputs

Reverted to pre-fix (only the consult block reverts to the
original `if (!desired || !recorded) continue; if (decision.kind ===
"noop") { ... }` and the aggregate compute reverts to `applyHookAggregatesDelta(existingHook, ...)` without withdrawal application):

```
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
  Γ¥î BATCH 21 item 2: ad angle change A→B leaves A's count at prior and increments B
     BATCH 21 item 2: angle-change must withdraw from OLD bucket (urgency count returned to 0, got 1; the FR-013 withdraw-then-add path failed)

1 !== 0

  Passed: 9, Failed: 1
```

With the fix applied:

```
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
  Γ£à BATCH 21 item 2: ad angle change A→B leaves A's count at prior and increments B
  ...
  Passed: 10, Failed: 0
```

The test discriminates. **Item 2 is closed with load-bearing evidence.**

The user's review noted:
> `if (!desired || !recorded) continue;` discards the `add` case
> before `decideContribution` sees it, which is why
> `decideContribution(desired, recorded ?? null)`'s null branch is
> unreachable. That is harmless today but the guard and the call
> disagree about what the function is for; make them consistent.

The fix removes the guard. `decideContribution(desired ?? null,
recorded ?? null)` is now called for every row in `learnedAds`;
the four outcomes (`add`, `noop`, `withdraw_then_add`,
`withdraw_only`) are all reachable and all acted upon.

---

## 2. Affected requirements

| Requirement | Status this batch |
|---|---|
| FR-013 (creative attribution: contributions to old buckets must be withdrawn on re-link) | Closed — `withdraw_then_add` and `withdraw_only` handled; behavioural test asserts A's count returns to 0 when the angle moves to B. |
| FR-017 (contribution ledger integrity across syncs) | Closed — same as above. |
| FR-054a / FR-055 (lease spans read-modify-write) | **Not closed.** Documented as a known gap; a follow-up batch is needed. |

---

## 3. Closure-evidence reassessment

This batch RETRACTS Batch 19's §A§3 census entry that asserted all four
`decideContribution` outcomes were handled. The behavioural test
added here is the load-bearing evidence for Item 2. The previous
source-text assertion was removed in Batch 20 (as part of the
SOURCE-TEXT category retirement); nothing in this batch reopens it.

Item 1's claim from Batch 19's §A§1 ("the lease spans read-modify-write
of the aggregate") was *overstated*: the lease was acquired AFTER the
existingHookDocs / existingVisualDocs read. **Item 1 is NOT closed by
Batch 19 or by Batch 20 or by this batch.** The closure-evidence
record for Item 1 must read: "closure-claim retracted; structural fix
required."

---

## 4. Raw diff and status

```
$ git diff -w --stat
 .../phase969/t064bEndToEnd.discriminator.test.ts   |  77 ++++++++++++
 functions/src/metaSync/shared.ts                   | 139 ++++++++++++++++++---
 2 files changed, 202 insertions(+), 14 deletions(-)

$ git status --short
 M functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts
 M functions/src/metaSync/shared.ts
?? specs/009-billing-plan-access/contracts/stripe-webhooks.md

$ cd functions && rm -rf lib && npm run build && npm test
... (full output at C:\temp\opencode\batch21-fulltest3.txt)
═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══
contractFixtures.test: PASS
exit: 0
```

---

## 5. Files touched

- `functions/src/metaSync/shared.ts` — Item 2 fix: ledger consult handles all four `decideContribution` outcomes; aggregate compute applies withdrawals first via `applyHookAggregateWithdrawal` (hook) and a new local `applyVisualAggregateWithdrawal` (visual).
- `functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts` — new behavioural test: `BATCH 21 item 2: ad angle change A→B leaves A's count at prior and increments B`. Discriminates against reverted code (count=1 vs count=0).

---

## 6. Lint status

Pre-existing `@typescript-eslint` plugin incompatibility at HEAD
reproduces. Unchanged.
