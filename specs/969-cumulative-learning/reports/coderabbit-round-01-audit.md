# CodeRabbit Round 1 Audit

**Date**: 2026-09-07
**Source**: Audit of `coderabbit-round-01.md` verdicts against the four items raised by the reviewer on `2026-09-07` after commit `97a6585`.
**Status**: Three of three reopened items are confirmed as real defects. The triage got seven fixes right and made the wrong call on three deeper issues.

---

## 1. CR-C1 invalidates Phase 7's verification

`runner()` was defined and never called. `main()` returned, the process exited 0, and failures were never reported.

### 1.1 — Re-run after the fix

After commit `1329368` wired `main().then(runner).catch(...)`, T064b's full harness:

```
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
  ✅ SC-049: pre-populated lease (different runId) → status='failed'
  ✅ SC-049 (second-half): operational writes committed BEFORE the lease refused
  ✅ T021a worker-output: queued adDoc's ledger.creativeKey is the actual creative key (not ad.id)
  ✅ T025a worker-output: queued adDoc's ledger.angleKey/patternKey are the post-pass resolved values (not null)
  ✅ T047 worker-output: workspace funnelType=paid_event → byFunnelType.paid_event.count > 0 AND byFunnelType.unknown.count === 0
  ✅ T047 worker-output (inverse): no resolvable funnelType → byFunnelType.unknown.count > 0 AND every real-funnel bucket is exactly 0
=== T064b end-to-end: SC-049 + worker-output (Phase 7) ===
Passed: 6, Failed: 0
exit code: 0
```

**All six assertions hold** under the wired runner. The four Batches 15 / 18 closure evidence claims (creative key flowing from `groupIntoCreatives`, ledger keys from the post-pass patch, both directions of the funnel-type population, FR-060a's commit-before-acquire ordering) are now genuinely verified.

### 1.2 — Full `npm test` from clean `lib/`

Exit code: 0. Every chain entry the registration guard tracks (72 ↔ 72) is in place; the four T047 worker-output cases pass; the Batch 17 Node test cases for the read side still pass; the contract fixtures and 11 priority lanes all green.

### 1.3 — Audit of every other harness in `phase969/`

Mechanical check: every file's structure, where `runner` is invoked.

| File | Where runner fires | Status |
|---|---|---|
| `boundedLedgerRead.test.ts` | Line 288 — `})();` IIFE wrapper that calls runner at the end of the IIFE | **SAFE** (IIFE-invoked) |
| `creativeGrouping.test.ts` | Top-level tests run synchronously; runner at line 284 in module scope after all tests | **SAFE** (synchronous; tests use `function test(name, fn: () => void)` with `try/catch`; failures increment `failed`; `process.exit(FAILED)` runs) |
| `fr070.test.ts` | Same pattern as creativeGrouping | **SAFE** |
| `learningAccumulation.test.ts` | Same pattern | **SAFE** |
| `learningCascade.test.ts` | Same pattern | **SAFE** |
| `learningLease.test.ts` | Line 364 — IIFE wrapper | **SAFE** |
| `perAdActions.test.ts` | Same pattern as creativeGrouping | **SAFE** |
| `t021aWireupDiscriminator.test.ts` | Same pattern | **SAFE** |
| `t025aWorkerWiringDiscriminator.test.ts` | Same pattern | **SAFE** |
| `t029GateMigrationDiscriminator.test.ts` | Same pattern | **SAFE** |
| `t064bEndToEnd.discriminator.test.ts` | `main().then(runner).catch(...)` | **SAFE** (commit `1329368`) |
| `whatsWorkingDashboardMultiFunnel.test.ts` | Line 295 calls `summary()` from inside `main()`; `summary()` calls `process.exit(failed > 0 ? FAILED : PASSED)` | **SAFE** |

**No other harness in `phase969/` is in the same state T064b was in.** Every other file's runner/summary function is invoked from a path that always runs (top-level test execution with internal try/catch, or an IIFE wrapper, or `summary()` called from `main()`).

### 1.4 — Verdict on CR-C1

**Fixed. T064b now reports failures correctly, and the six assertions hold under the wired harness.** No other phase969 harness shares the defect.

---

## 2. Codex #1 — `decideContribution` is genuinely missing from the worker

`decideContribution` exists, has all four-outcome tests, and **is never called from the worker path**.

### 2.1 — Evidence

- Defined: `functions/src/learning/contributionLedger.ts:99` — `export function decideContribution(...)`
- Tested: `functions/src/__tests__/phase969/learningAccumulation.test.ts:233-298` covers all four outcomes (add, noop, withdraw_then_add, withdraw_only)
- Called from worker path: **NONE.** `grep -r decideContribution functions/src/` returns:
  - The function definition
  - The test file
  - A docstring mention in `aggregateDelta.ts:256` ("decideContribution decision says WHEN to withdraw; this function says HOW to apply the withdrawal")

`metaSync/shared.ts` does not import `contributionLedger`. The worker calls:

- `readExistingAdDocs` (FR-068/069 bounded read)
- `groupIntoCreatives` (creative grouping via `resolveCreativeKeyByAdId` from `learningPerAdLoop.ts`)
- `decideAdWrite` / `decideAdWriteActions` (FR-070 field-level discrimination, FR-073 unit of evidence, FR-074 per-row attribution; **per-creative FR-073 is honored**)
- `applyHookAggregatesDelta` / `applyVisualAggregatesDelta` (the aggregator at L1350–L1351 of `metaSync/shared.ts`)

`applyHookAggregatesDelta` (defined in `functions/src/learning/aggregateDelta.ts`) is a **pure additive merge**. Its body in `aggregateDelta.ts:130-150`:

```ts
if (recorded) {
    const previousContribution = recorded.creativeCount ?? 0;
    agg.creativeCount = previousContribution;
    if (!agg.contributedCreatives.has(creativeKey)) {
        agg.contributedCreatives.add(creativeKey);
        agg.creativeCount = previousContribution + 1;
    }
}
// else: agg.creativeCount was already 0 from newBucket(); fall through to the row-add path
```

The `creativeCount` increment is gated by `!agg.contributedCreatives.has(creativeKey)` — a `Set` of creative keys per aggregate — so per-creative, a creative contributes at most once. But the **`byObjective.conversion.count` and other numeric fields** (e.g. `avgLinkCtr`) accumulate raw sums on every contribution without consulting the recorded entry for that row's prior values.

### 2.2 — What happens on a second sync over the same ad

The aggregator is keyed by `angleKey` (for hooks) and `patternKey` (for visuals), not by row id. Per creative:
- `agg.contributedCreatives: Set<string>` correctly prevents double-counting the per-creative contribution.
- `agg.byObjective.conversion.count += 1` runs every time `applyAdToHook` is called for that creative.

**For a single creative whose row is in the sync, the per-sync increment happens once.** Good.

**For a single ad row that maps to a single creative and is read again in a second sync, the per-creative `Set` check dedupes, but the aggregate counter at the per-row granularity (`byObjective.conversion.count`) is `learnedAds.length` for that creative — re-read = re-add.**

The reproduction condition: **if `learnedAds` is reconstructed with the same row id (because the per-ad loop in `shared.ts` re-reads everything), the per-row increment fires again.** The `decideContribution` gate, if it were called, would say: "row already contributed in the recorded entry; this is a `noop`." It is not called, so the per-row count double-adds on the second sync.

### 2.3 — Is there a worker test for the second-sync no-op?

**No.** `learningAccumulation.test.ts:SC-002` tests `applyHookAggregatesDelta` directly (the pure aggregator function), not the worker. The test is:
> "processing same payload twice produces double the count (deliberate, for FR-021 additive semantics)"

That is exactly the bug the reviewer flagged. The test documents the aggregator's behavior in isolation; it does **not** drive the worker twice. There is no test in the suite that calls `runSyncForAccount` (or its per-account inner path) twice over the same input and asserts the second pass is a no-op.

### 2.4 — Verdict on Codex #1

**The user's claim is correct.** `decideContribution` is the load-bearing function for FR-016/FR-018 (idempotent contribution). It is not called from the worker path. The worker's `applyHookAggregatesDelta` is a pure additive merge with per-creative `Set` deduplication, but **per-row counts (`byObjective.conversion.count`, `avgLinkCtr`, etc.) double on a second sync over the same input**.

**This is a blocking defect for this PR.** Closing Phase 7 with this gap means a nightly Cloud Tasks run on the same data re-adds the same conversions nightly. FR-018's "must never double-count" requirement is not enforced.

The user is right: "Your own suite contains: `SC-002: processing same payload twice produces double the count (deliberate, for FR-021 additive semantics)`. That is correct for the pure delta function in isolation. The ledger consult is what prevents it happening in the worker. If nothing consults it, that test documents the bug rather than guarding against it."

---

## 3. Codex #2 / CR-M1 — the lease does not fence the aggregate write

The rebuttal cited FR-060a (operational writes commit before the lease). The reviewer is right: the **aggregate** writes also commit before the lease. They are in the same `writes` array.

### 3.1 — Evidence — line numbers

`functions/src/metaSync/shared.ts`:

- **L1330–L1342** — `existingHook` / `existingVisual` are read; `applyHookAggregatesDelta` / `applyVisualAggregatesDelta` are called at **L1350–L1351**.
- **L1356–L1368** — the resulting aggregate maps are pushed to `writes`:
  - `for (const [angleKey, agg] of newHook) writes.push({ ref: hookPerformance.doc(angleKey), ... });` (L1356–1361)
  - `for (const [patternKey, agg] of newVisual) writes.push({ ref: visualPerformance.doc(patternKey), ... });` (L1362–1368)
- **L1381–L1410** — baselines and syncSnapshot writes are also pushed.
- **L1419–L1425** — the `writes` array commits in chunks of 450: `for (let i = 0; i < writes.length; i += 450) { const batch = getDb().batch(); for (const w of chunk) batch.set(w.ref, w.data, { merge: true }); await batch.commit(); }`
- **L1447** — `acquireLearningLease(...)` is called **AFTER** the `writes` commit loop.

### 3.2 — Are the aggregate writes inside the lease window?

**No.** The lease is acquired at L1447, the `writes` array commit at L1419–L1425. The lease acquisition post-dates the commit.

### 3.3 — Can a lease-refused run reach the aggregate write?

**Yes.** The aggregate write at L1350–L1368 happens unconditionally; it is not gated on the lease. The lease check at L1447 returns early with `ok: false` (L1475–L1482) but the aggregate has already been pushed to `writes` and committed.

### 3.4 — Verdict on Codex #2 / CR-M1

**The reviewers are correct.** The `writes` array contains both operational writes (adPerformance at the per-ad block) AND aggregate writes (hookPerformance, visualPerformance, baselines, syncSnapshot). The lease at L1447 is acquired **after** the commit at L1419–L1425. A concurrent second run reads the same baseline (`existingHook` at L1343), applies the same delta, and double-counts before the lease can be acquired. The rebuttal cited FR-060a for **operational** writes; that rule is correct, but the same `writes` array also contains **aggregate** writes that the lease was supposed to fence.

The comment at L1412–L1418 labels the writes "operational status writes" but the array contains aggregates too. The comment is incomplete.

**Both reviewers (Codex #2, CR-M1) flagged the right thing.** This is a blocking defect for this PR.

---

## 4. CR-M18 — the hashless fallback IS a collision

The reviewer is right. The literal is `__legacy_${r.userId}_${b.n}`, not `"hashless"`, but the **collision is real and worse than the reviewer said**.

### 4.1 — The key-construction line

`functions/src/patternSummaries.ts:417`:

```ts
b.creativeHashes.add(r.creativeHash ?? `__legacy_${r.userId}_${b.n}`);
```

The fallback key for hashless rows is `__legacy_${r.userId}_${b.n}`. For a single user (one ad account), all rows from that user have the same `userId`. The `b.n` is the bucket name (e.g. the angle key).

### 4.2 — Collision analysis

- **Same user, same angle, two distinct hashless ads** (e.g. two rows from `userId = "act_995888422231015"`, both for `angle = "urgency"`, both without `creativeHash`): key is `__legacy_act_995888422231015_urgency` — **IDENTICAL** → collapse into the same `Set` entry → one creative counted for two distinct hashless rows.
- **Same user, different angles**: keys differ in `b.n` → no collision.
- **Different users, same angle**: keys differ in `userId` → no collision.

The collision scope is: two or more hashless linked ads from the same user, in the same angle bucket. They collapse into one creative.

This is **undercount** (fewer creatives), not overcount. The round-1 verdict said "undercounts `creativeCount`" — that part is correct. The verdict's recommendation (use a per-record fallback) is also correct, but the proposed fix (generation document id) does not help if multiple rows share the same generationId; the unique key needs to be the row id, not the generationId.

### 4.3 — Verdict on CR-M18

**The reviewers are right; the round-1 verdict was right that the literal is shared. The proposed fix (generation document id) is also wrong for rows that share a generationId; the unique key needs to be the ad row id.**

Two distinct hashless ads from the same user, in the same angle, currently count as one creative. This is a real bug. The fix is to use `r.adId` (or a compound like `__legacy_${r.userId}_${b.n}_${r.adId}`) so each row gets a unique Set entry.

---

## 5. Other triage observations (in response to the reviewer's note)

The reviewer noted:

> The seven fixes look right, particularly CR-M23 — a test seam that was silently dropped on the production path is exactly the kind of half-working machinery that makes a test pass while proving nothing.

Agreed.

> The historical-report verdicts (M10, M13, M20, M21, M22) are reasonable: rewriting past reports to match later corrections destroys the record of what was believed when. Say that in the PR reply rather than "out of scope", which reads as a dismissal rather than a reason.

Will update the round-1 PR replies to read "historical report — rewriting would destroy the record" rather than "out of scope".

> M9, M16 and M26 all rest on "no fixture has two manual rows with different generationId." Absence from fixtures is not absence from production — that argument was wrong about split creatives and it is wrong here. Not blocking, but record it as an untested edge case rather than a speculative one.

Will update the round-1 verdicts on M9, M16, and M26 to record them as "untested edge case — no fixture covers two manual rows with different generationIds; production data does not currently exhibit this" rather than "speculative".

---

## 6. Summary

| Item | Verdict | Severity |
|---|---|---|
| **1 — CR-C1** | **Fixed.** T064b now exits non-zero on failure. All six assertions pass. No other phase969 harness shares the defect. | Resolved. |
| **2 — Codex #1** | **Confirmed real defect.** `decideContribution` is not called from the worker path. SC-002 documents the bug, not a fix. A second sync over the same input re-adds per-row counts. | **Blocking.** |
| **3 — Codex #2 / CR-M1** | **Confirmed real defect.** Aggregate writes commit at L1419–L1425; lease acquired at L1447. Both operational AND aggregate writes are in the same `writes` array, and the lease does not fence the aggregate commit. | **Blocking.** |
| **4 — CR-M18** | **Confirmed real defect, with a sharper version of the verdict.** The fallback key `__legacy_${r.userId}_${b.n}` collapses all hashless rows for the same user in the same angle to one creative. Fix is to include `r.adId` (or a compound) in the key. | **Real, scope is narrower than round-1 said but the impact is the same direction.** |

**All three reopened items (2, 3, 4) are blocking defects.** Closing Phase 7 with items 2, 3, 4 outstanding is incorrect. The audit is reported here. No code changes are made; the owner's reviewer sees the findings first.

---

## 7. Recommended next steps (for the owner to approve)

1. **Item 2 fix**: thread `decideContribution` into the per-ad decision so that on a second sync over the same input the recorded entry is consulted before applying the delta. The natural place is in `decideAdWriteActions` (Batch 07) which already builds the `learnedAd` and the `decision.adDoc`; the recorded entry can be passed in as `existingData?.ledger` (already on the doc) and the function returns `add | noop | withdraw_then_add | withdraw_only` which gates the `learnedAds.push(decision.learnedAd)`.
2. **Item 3 fix**: move the aggregate write commit (L1350–L1376) to **after** `acquireLearningLease` succeeds, while keeping the operational writes (adPerformance at the per-ad block) before. The two write groups need to be in separate `writes` arrays with separate commit windows.
3. **Item 4 fix**: change the fallback key at `patternSummaries.ts:417` to `__legacy_${r.userId}_${b.n}_${r.adId}` so each row gets a unique Set entry.

All three are real fixes with clear diffs. None is a refactor; all are additive or boundary changes. Estimated diff: ~30 lines of code + 3 new tests. The audit does not implement them — the owner's reviewer is the next stop.
