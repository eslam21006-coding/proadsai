# Batch 20 — CodeRabbit round-1 fix-up: review-of-review

> **Summary.** This is the review-of-review for Batch 19. Three
> issues are corrected. The three blocking defects are still
> closed by Batch 19's code changes; what was wrong was the
> evidence. **Two items had evidence gaps**; one item turned out
> to defend a non-manifesting bug. The audit's premise about Item
> 3 was wrong; the fix is harmless and defensive, but the
> collision the audit described never actually happens in the
> bucket code path. **One item's evidence was correct but the
> test was structurally non-discriminating** (Item 1); the test
> has been rewritten to actually fail on reverted source.
>
> **What changed.** Two test files (T064b and patternSummaries)
> have new behavioural tests replacing the source-text and
> structurally non-discriminating tests. Item 3's source-text
> test has been **retired**, consistent with the project's
> explicit decision in Batches 03-16 to remove that category.
> `patternSummaries.ts` gains a test seam (`__bucketForTests`)
> to support the new behavioural test.
>
> **Closure-evidence reassessment (the user asked for it).**
> Batches 15 and 18 were **unverified**, not "weaker than now."
> Evidence that could not fail was not weak evidence; it was not
> evidence. They are now verified: this batch's re-run on the
> load-bearing harness produces a passing result and the harness
> can fail (Item 2's failure on the reverted build). The
> "strengthened" framing in Batch 19's §4 was wrong; this batch
> substitutes the right framing.

---

## 1. The two items that needed correction

| # | Defect in Batch 19's evidence | What this batch does |
|---|---|---|
| 1 | The two lease cases (`BATCH 19: lease-refused run writes operational state and NO aggregate document`, `BATCH 19: lease-acquired run writes BOTH operational and aggregate documents`) **passed on the reverted source**. The "before" run in `C:\temp\opencode\batch19-before-t064b.txt` showed all three cases green. The lease-refused case never exercised the bug. | The lease-refused test now seeds the image-match stubs (`seedImageMatchStubs()`) so the per-ad block populates `learnedAds` and the aggregate branch actually runs. With reverted `shared.ts`, this case now fails: `"found 1 writes at users/.../hookPerformance"`. With the fix in place, it passes. |
| 3 | The Item 3 verification was a source-text assertion: read `patternSummaries.ts`, assert the literal `__legacy_${r.userId}_${b.n}_${r.adId}` was present. The category (SOURCE-TEXT) was deliberately retired across Batches 03-16; the census tracks its retirements; three entries in the same category were deleted outright in Batch 16. Adding one back reopens the category the project is closing. | The source-text tests are replaced by a behavioural test that drives `add()` and `newBucket()` through a new test seam (`__bucketForTests`) on `patternSummaries.ts`. The behavioural test directly asserts the bucket's `creativeHashes.size` invariant. The seam is the only production-facing change to `patternSummaries.ts`. |

---

## 2. **Item 1 — verdict: (b), the two lease cases do not discriminate**

The user's review offered three possibilities:
- **(a) the stash didn't revert what I thought** — confirmed false. `git stash push <paths>` reverts tracked modifications, and the stash was applied. The build was clean from a freshly-deleted `lib/`. The `lib/` was rebuilt against the reverted source.
- **(b) the two lease cases do not discriminate** — **this is what happened.** The lease-refused case, before this batch, did not seed the image-match stubs. Without the stubs, `loadWorkspaceFingerprints` returns an empty index, `matchAdCreative` finds no match, the per-ad block produces `matchType: null`, `isAdEligible` returns `false` for the aggregator, `learnedAds` stays empty, the `if (learnedAds.length > 0)` block does not execute, no aggregate writes are pushed to `writes`. The aggregate code path never runs in the lease-refused test. The assertion `bucket(hookPath).size === 0` is true regardless of the lease-fence fix.
- **(c) the audit was wrong and there was no defect** — false. The audit is correct that aggregate writes push to `writes` and commit before the lease. With the test fixed (see below), the reverted source DOES write aggregates on lease-refused.

### 2.1 Diagnostic evidence (raw, unmodified)

`C:\temp\opencode\batch19-before-t064b.txt` (the "before" run with the BATCH 19 source):

```
  ✅ BATCH 19: lease-refused run writes operational state and NO aggregate document
  ✅ BATCH 19: lease-acquired run writes BOTH operational and aggregate documents
  ✅ BATCH 19: twice-over-same-input leaves the aggregate unchanged on the second pass (FR-018)
  Passed: 9, Failed: 0
```

The lease-refused case passes. The bug was not exercised.

After the diagnostic instrumentation (Bucket dump in the test itself), the lease-refused case on reverted source reported `writes count=3` with only `adPerformance`. The aggregate push did not execute. The aggregate branch did not run because `learnedAds` was empty (no image-match seed).

### 2.2 The fix — `seedImageMatchStubs()` in the lease-refused test

`functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts` (lease-refused test, before/after):

Before (BATCH 19, non-discriminating):

```typescript
await test("BATCH 19: lease-refused run writes operational state and NO aggregate document", async () => {
    resetStub();
    seedConnection();
    seedGenerationMatch({});
    setLeaseHeldByOtherRunner();
    metaGraph.setFetchImplForTests(seedFetchOneAd());
    // ...
});
```

After (BATCH 20, discriminating):

```typescript
await test("BATCH 20: lease-refused run writes operational state and NO aggregate document", async () => {
    resetStub();
    seedConnection();
    seedGenerationMatch({});
    // BATCH 20: seed the image-match stubs so the per-ad block
    // populates `learnedAds`. Without this, the aggregate code path
    // doesn't execute and the bug (aggregate commit before lease)
    // is not exercised — the original BATCH 19 lease-refused case
    // passed on reverted source because of this gap. With the
    // stubs in place, `learnedAds` is non-empty, aggregates are
    // pushed to `writes`, and on reverted source they commit
    // before the lease is acquired.
    seedImageMatchStubs();
    setLeaseHeldByOtherRunner();
    metaGraph.setFetchImplForTests(seedFetchOneAd());
    // ...
});
```

The lease-acquired test already seeded `seedImageMatchStubs()` (BATCH 18). The asymmetry was the gap.

### 2.3 Now-failure and now-pass outputs

Reverted `shared.ts` (the audit's "aggregate commit at L1419-L1425, lease acquired at L1447" picture, restored):

```
$ git stash push -m "batch20-revert-source" functions/src/metaSync/shared.ts functions/src/patternSummaries.ts
$ cd functions
$ rm -rf lib
$ npm run build
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
  ✅ SC-049: pre-populated lease (different runId) → status='failed'
  ✅ SC-049 (second-half): operational writes committed BEFORE the lease refused
  ❌ BATCH 20: lease-refused run writes operational state and NO aggregate document
     Batch 19 item 1: lease-refused must NOT commit any hook aggregate document (found 1 writes at users/owner_uid_AAAA/workspaces/ws_alpha/adAccounts/act_alpha/hookPerformance)

1 !== 0

  ✅ BATCH 20: lease-acquired run writes BOTH operational and aggregate documents
  ❌ BATCH 19: twice-over-same-input leaves the aggregate unchanged on the second pass (FR-018)
     Batch 19 item 2: aggregate contribution count must be idempotent across runs (first=1, second=2; FR-018 requires no double-counting)

2 !== 1

  ✅ T021a worker-output: queued adDoc's ledger.creativeKey is the actual creative key (not ad.id)
  ✅ T025a worker-output: queued adDoc's ledger.angleKey/patternKey are the post-pass resolved values (not null)
  ✅ T047 worker-output: workspace funnelType=paid_event → byFunnelType.paid_event.count > 0 AND byFunnelType.unknown.count === 0
  ✅ T047 worker-output (inverse): no resolvable funnelType → byFunnelType.unknown.count > 0 AND every real-funnel bucket is exactly 0
  Passed: 7, Failed: 2
  exit: 1
```

The lease-refused case now fails on reverted source. Item 1 is proved.

With the fix restored (BATCH 19 + BATCH 20 test fix):

```
$ git stash pop
$ cd functions
$ rm -rf lib
$ npm run build
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
  ✅ SC-049: pre-populated lease (different runId) → status='failed'
  ✅ SC-049 (second-half): operational writes committed BEFORE the lease refused
  ✅ BATCH 20: lease-refused run writes operational state and NO aggregate document
  ✅ BATCH 20: lease-acquired run writes BOTH operational and aggregate documents
  ✅ BATCH 19: twice-over-same-input leaves the aggregate unchanged on the second pass (FR-018)
  ✅ T021a worker-output: queued adDoc's ledger.creativeKey is the actual creative key (not ad.id)
  ✅ T025a worker-output: queued adDoc's ledger.angleKey/patternKey are the post-pass resolved values (not null)
  ✅ T047 worker-output: workspace funnelType=paid_event → byFunnelType.paid_event.count > 0 AND byFunnelType.unknown.count === 0
  ✅ T047 worker-output (inverse): no resolvable funnelType → byFunnelType.unknown.count > 0 AND every real-funnel bucket is exactly 0
  Passed: 9, Failed: 0
  exit: 0
```

The lease cases now pass with the fix and fail without it. **Item 1 is closed with load-bearing evidence.**

---

## 3. **Item 3 — verdict: source-text assertion retired; the bug as described in the audit does not actually manifest**

The audit said:

> "Same user, same angle, two distinct hashless ads (e.g. two rows
> from `userId = "act_995888422231015"`, both for `angle =
> "urgency"`, both without `creativeHash`): key is
> `__legacy_act_995888422231015_urgency` — IDENTICAL → collapse
> into the same `Set` entry → one creative counted for two
> distinct hashless rows."

The premise is that two distinct hashless rows produce the same
fallback key, so they collide in the Set.

`patternSummaries.ts:417`'s `add()` is:

```ts
function add(b: Bucket, r: NRec): void {
    b.n++;                                        // L404 — POST-increment
    if (r.isUsed) b.used++;
    // ... other increments ...
    if (r.niche) b.niches.add(r.niche);
    // ...
    b.creativeHashes.add(r.creativeHash ?? `__legacy_${r.userId}_${b.n}`);  // L417 — uses post-increment b.n
}
```

`b.n++` is **post-increment**: it runs BEFORE the `b.creativeHashes.add(...)` call, and `b.n` is read at L417 after the increment. **Every successive `add()` call gets a different `b.n`.** Two `add()` calls with the same `userId` and same `b.n` cannot happen in one bucket — the first call increments `b.n` from 0 to 1, the second from 1 to 2.

So the collision the audit described **never happens in this code path.** Each row gets a unique legacy key from `b.n` alone.

I verified this empirically: I temporarily reverted the fix to `__legacy_${r.userId}_${b.n}` (no `_${r.adId}` suffix), built from clean `lib/`, ran the new behavioural test, and got **PASS** (size === 2, the fix's claim).

```
$ # Revert just the legacy key in patternSummaries.ts
$ # build + run
$ node lib/__tests__/patternSummaries.creativeHash.test.js
  ✅ computeCreativeHash: same creativeIdentity produces the same hash
  ✅ computeCreativeHash: selectedModes order does not matter
  ✅ computeCreativeHash: differing contractTemplateId yields different hash
  ✅ computeCreativeHash: differing universeCategory yields different hash
  ✅ computeCreativeHash: differing hookAngle yields different hash
  ✅ computeCreativeHash: missing fields produce different hashes (no spurious equality)
  ✅ computeCreativeHash: returns null for input null
  ✅ USER-SPEC FIXTURE: 1 creative regenerated 3 times in one family → creativeCount = 1, not 3
  ✅ USER-SPEC FIXTURE: 3 distinct creatives regenerated → creativeCount = 3, not 9
  ✅ BATCH 20: two distinct hashless rows from one user in one bucket are TWO creatives (Item 3 / CR-M18)
  ✅ BATCH 20: same creativeHash on two rows collapses to ONE creative (T029c regression guard)
  Passed: 11, Failed: 0
```

The bug as the audit described it **does not exist in the current code path.**

### 3.1 What I'm doing about it

I am **not reverting the code fix.** The fix is harmless and defensive: `__legacy_${r.userId}_${b.n}_${r.adId}` is strictly more unique than `__legacy_${r.userId}_${b.n}`. If anyone in the future calls `add()` outside the `aggregate()` function (which always increments `b.n` first), or refactors the post-increment to a pre-increment, the `_${r.adId}` suffix preserves the dedup invariant. The fix has value as defensive insurance against future refactors.

But I am retracting Batch 19's claim that the fix closes a real bug. **The bug doesn't manifest; the fix is defensive.** The CR-M18 verdict in `coderabbit-round-01-audit.md` §4.3 was based on a misreading of what `b.n` is.

### 3.2 The test changes

The source-text assertions in `patternSummaries.creativeHash.test.ts`:

```
// (deleted) test("BATCH 19: hashless fallback key is unique per adId (Item 3 / CR-M18)", () => { ... })
// (deleted) test("BATCH 19: source has the fixed legacy fallback key (Item 3 / CR-M18)", () => { ... })
```

are replaced by behavioural tests that drive the actual `add()` and `newBucket()`:

```typescript
test("BATCH 20: two distinct hashless rows from one user in one bucket are TWO creatives (Item 3 / CR-M18)", () => {
    const { __bucketForTests } = require("../patternSummaries.js");
    const bucket = __bucketForTests.newBucket();
    __bucketForTests.add(bucket, makeNRec({ userId: "act_995888422231015", adId: "gen-distinct-a", creativeHash: null, hookAngle: "urgency" }));
    __bucketForTests.add(bucket, makeNRec({ userId: "act_995888422231015", adId: "gen-distinct-b", creativeHash: null, hookAngle: "urgency" }));
    assert.equal(bucket.n, 2, "two rows were added");
    assert.equal(bucket.creativeHashes.size, 2,
        "BATCH 20 / Item 3: two distinct hashless rows for one user in one bucket must produce two creatives (got creativeHashes.size=" + bucket.creativeHashes.size + ")");
});
```

The test seam `__bucketForTests = { newBucket, add }` is exported from `patternSummaries.ts`. Production code does not import from `__bucketForTests`; the underscore prefix signals test-only. The seam is **not** a barrel re-export — `patternSummaries.ts` is not re-exported through any barrel, so production code paths cannot accidentally import the seam.

The test still passes with the fix (and, as shown above, also passes without the fix — because the bug doesn't actually manifest). It is a behavioural guard against future refactors that might cause the bug to manifest.

### 3.3 Census update

Per Batch 16 §A§5.1, the **SOURCE-TEXT / SOURCE-ORDER / SOURCE-CONFIG** category is structural guards that pin a property of source code rather than behaviour. The category was deliberately retired across Batches 03-16; three entries in the same category were deleted outright in Batch 16.

Batch 19 introduced one new SOURCE-TEXT entry (`BATCH 19: source has the fixed legacy fallback key`) and one contract entry that re-derived the key. Both are now retired (this batch).

| Entry | Status |
|---|---|
| `patternSummaries.creativeHash.test.ts` (BATCH 19: hashless fallback key is unique per adId) — re-derives the key with the public shape | retired; replaced by behavioural `BATCH 20: two distinct hashless rows from one user in one bucket are TWO creatives` |
| `patternSummaries.creativeHash.test.ts` (BATCH 19: source has the fixed legacy fallback key) — reads `patternSummaries.ts` and asserts the literal string | retired; the SOURCE-TEXT category was explicitly closed in Batches 03-16 |

The `patternSummaries.creativeHash.test.ts` file now has 11 BEHAVIOURAL cases (`Passed: 11, Failed: 0`). No SOURCE-TEXT entries remain.

The `creativeGrouping.test.ts:284` sibling guard (a FR-074c contract test for the grouping-layer's single-member contributing route) is kept as-is. The user's review noted it *"passes both before and after the fix"* and *"confirms nothing currently observes the collision"* — agreed. It is a contract guard for a related guarantee (the single-member contributing route), not evidence for Item 3. The test name comment now reflects this distinction.

---

## 4. Closure-evidence reassessment (correcting Batch 19's §4)

Batch 19's §4 stated:

> "Batch 15 and Batch 18 closure evidence is *strengthened* by this batch (procedural green → load-bearing green), not weakened."

The user's review was:

> "Evidence that could not fail was not weak evidence, it was not evidence. Say that the earlier claims were unverified until commit `1329368` and are verified now — not that they were green and became greener."

Correcting Batch 19's §4. The right framing:

- **Batch 15 (T064b creation).** The T064b harness was created in this batch. Its first run was **procedurally green but not load-bearing** because the harness's `runner()` couldn't fail (`process.exit` always saw `failed === 0` due to the unrun `main().then(runner).catch(...)` wiring). The "before" failure on Item 2 in this batch's §2.3 is the first load-bearing failure observation of T064b. **Batch 15's closure evidence was unverified until commit `1329368` and is verified by this batch.**

- **Batch 18 (T047 worker-output cases).** Two cases were added to T064b for FR-027 plumbing. Same caveat as Batch 15: procedural green until `1329368`. The Batch 20 re-run validates that the cases are still green *and* that the harness can now fail. **Batch 18's closure evidence was unverified until commit `1329368` and is verified by this batch.**

- **All earlier batches** (1 through 14): none of them relied on T064b status. They had their own test files (`creativeGrouping.test.ts`, `learningAccumulation.test.ts`, etc.) which have always had working runners. Their closure evidence is unaffected by the round-1 runner wiring. **No reassessment needed.**

- **Batch 19 itself.** Batch 19's claim that the lease cases were evidence is **partially retracted.** Item 1's "before" failure on reverted source was not actually observable (the lease-refused case never exercised the aggregate path). Batch 20's test rewrite (adding `seedImageMatchStubs()` to the lease-refused case) is the corrected evidence.

---

## 5. The audit (coderabbit-round-01-audit.md) corrections

The audit's two claims are partially retracted here:

- **§3 (Codex #2 / CR-M1): lease fence.** Confirmed. The reverted-source failure (`found 1 writes at users/.../hookPerformance` on lease-refused) is now the load-bearing evidence. The audit's verdict stands.

- **§4 (CR-M18: hashless fallback).** **Retracted in form, retained in principle.** The audit's claim that two distinct hashless rows collapse to one Set entry is empirically wrong at this code path — `b.n++` runs before the legacy key derivation, so distinct rows get distinct keys. The CR-M18 *defensive concern* is real (if `b.n` ever stopped being distinct, the collision would happen), but the audit's *manifesting bug* is not. The code fix is retained as defensive insurance. The Batch 19 source-text verification of the fix is replaced by a behavioural test.

---

## 6. Diff summary

```
$ git diff -w --stat
 .../patternSummaries.creativeHash.test.ts          | 118 ++++++++-
 .../phase969/t064bEndToEnd.discriminator.test.ts   | 271 +++++++++++++++++----
 functions/src/metaSync/shared.ts                   |  61 ++++-
 functions/src/patternSummaries.ts                  |  26 +-
 4 files changed, 415 insertions(+), 61 deletions(-)
```

`git diff -w --stat` excludes whitespace. The raw `git diff --stat` also reports BOM/line-ending churn on these files; the substantive change is what `-w` shows.

## 7. Full test suite

```
$ cd functions && rm -rf lib && npm run build && npm test
...
═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══
contractFixtures.test: PASS
exit: 0
```

Per-group summaries (from `C:\temp\opencode\batch20-fulltest.txt`):

| Test file | Passed | Failed |
|---|---|---|
| `patternSummaries.creativeHash.test.js` | 11 | 0 |
| `creativeGrouping.test.js` (compiled from `.ts`) | 20 | 0 |
| `learningLease.test.js` | 12 | 0 |
| `boundedLedgerRead.test.js` | 12 | 0 |
| FR-070 discriminator | 7 | 0 |
| perAdActions / T021a / T025a | 11 | 0 |
| T021a wire-up | 2 | 0 |
| T026 (SC-002 / SC-008 / SC-013 / SC-029c / T021/T022/T024) | 18 | 0 |
| T027 cascade preservation | 4 | 0 |
| T025a AFTER wiring | 2 | 0 |
| T029c gate migration | 5 | 0 |
| T064b end-to-end | 9 | 0 |
| Phase 969 phase969 suite | 77 | 0 |
| GHL Sync (T052) | 57 | 0 |
| Webhook Scenarios (T024) | 75 | 0 |
| All Phase 3 / Spec 005 / Spec 006 / HFD / HFE / BCR / US1 / US2 / BCC / US4 / US5 / HFF / Phase 16 / culturalCompliance / phase13 / phase14 / phase15 / phase16 / phase17 / phase18 | all | 0 |

`Failed: 0` across every test group. `contractFixtures.test: PASS`. Exit 0.

## 8. Lint status

```
$ npm run lint
TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions':
Cannot read properties of undefined (reading 'allowShortCircuit')
```

Pre-existing plugin incompatibility, reproduces on `HEAD`
(`5e802e2`). Not caused by Batch 19 or Batch 20.

## 9. What is **not** in this batch

- No production behaviour change beyond the test rewrites and the addition of the `__bucketForTests` seam. No new exports except the seam. No schema changes.
- No production code change to `patternSummaries.ts`'s `add()` function. (The audit's bug doesn't manifest; the existing fix is defensive and retained.)
- No new plan-gating or pricing changes.
- No retargeting/before-after changes.

## 10. Files touched

- `functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts` — BATCH 19 lease cases renamed to BATCH 20; lease-refused case seeds `imageMatchStubs()` so the aggregate code path actually runs.
- `functions/src/__tests__/patternSummaries.creativeHash.test.ts` — source-text assertions retired; behavioural tests added (drive the `__bucketForTests` seam).
- `functions/src/patternSummaries.ts` — adds the `__bucketForTests` test seam; no production-logic changes.
- `functions/src/metaSync/shared.ts` — unchanged from Batch 19's commit `6af4343` (the lease-fence and ledger-consult fixes remain; this batch only fixed the test that was supposed to verify them).
