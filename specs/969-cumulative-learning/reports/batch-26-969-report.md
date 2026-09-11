# Batch 26 — close the visual-withdrawal deadlock (Bug 1+2) and commit-failure reporting (Bug 3)

> **Reviewer found three real defects by reading the verbatim
> Batch 25 artifact.** The summary in Batch 23's report said
> "extract; the function commits internally" — true at the surface,
> false in detail. The visual-withdrawal map was keyed on
> `hookAngle` and looked up by `agg.patternKey`. The two key
> spaces never intersect; the visual pass was a no-op for every
> visual aggregate. This batch closes Bug 1 (deadlock),
> Bug 2 (the wrong-pattern follow-on), and Bug 3 (the commit
> failure swallowed into `errors[]` while `ran: true` was
> returned).

---

## 1. The three bugs in plain prose

### Bug 1 — visual withdrawals never executed

The withdrawal map is built from `hookAngle`:

```ts
for (const wad of withdrawalHookAds) {
    const hookAngle = wad.hookAngle;
    if (hookAngle === null) continue;
    const key: string = hookAngle as string;
    withdrawalByAngle.set(key, [wad]);
}
```

The hook pass looks up correctly:

```ts
hookBase = hookBase.map((agg) => {
    const withdrawals = withdrawalByAngle.get(agg.angleKey);
```

The visual pass looked up the same map by a different key space:

```ts
visualBase = visualBase.map((agg) => {
    const withdrawals = withdrawalByAngle.get(agg.patternKey);
```

`agg.patternKey` is a composite produced by `computePatternKey`
(layout × modes × art direction × universe, then djb2). `agg.angleKey`
is a canonical hook id (`urgency`, `statistics`). The two key spaces
never intersect. `withdrawalByAngle.get(agg.patternKey)` returned
`undefined` for every visual aggregate, every time.

**`applyVisualAggregateWithdrawal` was written, exported, and
unreachable.** Its consequence: FR-013 on the visual half was
broken. When a creative's attribution changes, the hook
aggregate withdraws correctly and the visual aggregate keeps the
old contribution permanently — counted under the old pattern
AND the new one. That is precisely the defect Batch 21 closed
for hooks, still live for visuals.

**Nothing caught it** because `BATCH 21 item 2` asserts only the
hook side: *"urgency count returns to 0."* No assertion touches
`visualPerformance`.

### Bug 2 — even with Bug 1 fixed, the withdrawal record carried the wrong pattern geometry

The reconstruction spreads the current ad and overrides a few
fields:

```ts
const oldAd: AdForLearning = {
    ...ad,
    hookAngle: withdraw.angleKey,
    campaignObjective: withdraw.bucket as AdForLearning["campaignObjective"],
    ctrLink: withdraw.contributedValues.ctrLink,
    ...
};
```

`hookAngle` is taken from the recorded entry — correct. But
`layoutTemplate`, `creativeModes`, `artDirection` and `universe`
come through `...ad` at their **current** values, and those are
the inputs `computePatternKey` derives the pattern key from. So
even with Bug 1 fixed, the visual withdrawal would target the
pattern the creative moved **to**, not the one it moved **from**.

`withdraw.patternKey` is already on the ledger entry and was
never read.

### Bug 3 — a failed commit reports as a successful run

```ts
await batch.commit().catch((e: unknown) => {
    params.errors.push(`aggregate batch commit failed: ${(e as Error).message}`);
});
...
return { ran: true, hookWrites, visualWrites };
```

The per-chunk handler swallowed the failure into `errors`, the
loop continued, and the function returned `ran: true` with
`hookWrites` and `visualWrites` counting writes **built**, not
writes **committed**. A run whose every chunk failed reported full
success.

The reviewer's prescribed fix is the second option:

> Let the commit failure propagate to the outer catch, which
> already records the error and returns `emptyResult` — the
> "leave existing records untouched" behaviour the comment
> describes.

That is closer to what the surrounding comments claim the
function does. Either way, `ran: true` with zero committed
writes must not be reachable.

---

## 2. The fixes

### File: `functions/src/learning/applyLearningWrites.ts`

The header now explicitly states the two key spaces:

```ts
//   - the withdrawal application against the RECORDED geometry
//     (FR-013 / FR-017):
//       - hook withdrawals are keyed by `angleKey`
//         (a canonical hook id such as "urgency" or "statistics")
//       - visual withdrawals are keyed by `patternKey`
//         (a composite produced by `computePatternKey` — layout,
//         modes, art direction, universe)
//     The two key spaces never intersect. Conflating them produces
//     a visual withdrawal that silently never runs (Batch 26, bug 1).
```

The withdrawal application now builds **two** maps with distinct
key spaces:

```ts
if (withdrawalHookAds.length > 0) {
    // ─── Hook-withdrawal map: keyed by `angleKey` (canonical hook id).
    const withdrawalByAngle = new Map<string, AdForLearning[]>();
    // ─── Visual-withdrawal map: keyed by `patternKey`. The recorded
    // ledger entry carries the OLD patternKey — we use it directly,
    // so the visual withdrawal targets the OLD pattern, not the
    // current ad's geometry.
    const withdrawalByPattern = new Map<string, AdForLearning[]>();

    for (let i = 0; i < withdrawalHookAds.length; i++) {
        const wad = withdrawalHookAds[i];
        const recorded = params.existingByAdId.get(wad.adId)?.ledger as ContributionLedgerEntry | undefined;
        if (!recorded) continue;
        const oldAngleKey = recorded.angleKey;
        const oldPatternKey = recorded.patternKey;

        if (oldAngleKey !== null) {
            const existingA = withdrawalByAngle.get(oldAngleKey);
            if (existingA !== undefined) existingA.push(wad);
            else withdrawalByAngle.set(oldAngleKey, [wad]);
        }
        if (oldPatternKey !== null) {
            const existingP = withdrawalByPattern.get(oldPatternKey);
            if (existingP !== undefined) existingP.push(wad);
            else withdrawalByPattern.set(oldPatternKey, [wad]);
        }
    }

    hookBase = hookBase.map((agg) => {
        const withdrawals = withdrawalByAngle.get(agg.angleKey);
        ...
    });
    visualBase = visualBase.map((agg) => {
        // Look up the visual-withdrawal map by `agg.patternKey`.
        // The map is keyed on the RECORDED patternKey, so this
        // matches precisely the OLD pattern the visual
        // aggregate represents.
        const withdrawals = withdrawalByPattern.get(agg.patternKey);
        ...
    });
}
```

The `oldAd` reconstruction keeps the recorded overrides for
`campaignObjective`, `geoTier`, `audienceType` (consumed by
`applyVisualAggregateWithdrawal`). The patternKey itself comes
from `recorded.patternKey` directly — not from the current ad's
geometry — which is the authority for the map lookup.

The commit loop now lets `batch.commit()` throw:

```ts
for (let i = 0; i < aggregateWrites.length; i += chunkSize) {
    const chunk = aggregateWrites.slice(i, i + chunkSize);
    const batch = dbLike.batch();
    for (const w of chunk) batch.set(w.ref, w.data, { merge: true });
    await batch.commit();   // throws on failure → outer catch records error
}
```

The outer catch was already in place:

```ts
} catch (e: unknown) {
    params.errors.push(`learning aggregate update failed: ${(e as Error).message}`);
    return emptyResult;   // ran: false
}
```

The comment block above the catch block was updated to spell out
that `ran: false` is the contract on failure.

### Tests

Three new cases in `applyLearningWritesLease.test.ts`:

- **`test6_visualPatternWithdrawal`** — creative changes pattern
  P1→P2 with hook angle unchanged. Seed `visualPerformance` with
  count=1 at the OLD pattern; the function must withdraw (1→0)
  and add to the NEW pattern (0→1). Old behaviour: visual
  withdrawal never ran, so OLD stayed at 1 AND NEW counted its
  own contribution (a hidden double-count).

  ```
  $ node lib/__tests__/phase969/applyLearningWritesLease.test.js
     OLD(oldP_zzz).count=0, NEW(1bnqphs).count=1, hook(urgency).count=1
   Γ£à BATCH 26 visual withdrawal: pattern P1→P2 withdraws OLD visual, adds NEW visual
  ```

- **`test7_visualStaysWhenHookChanges`** — creative changes hook
  angle (urgency → statistics) but the pattern geometry is
  unchanged. Seed `visualPerformance` at the SHARED pattern with
  count=1. After the fix: visual withdraws 1 (1→0), additive
  adds 1 (0→1). Net count = 1. Pre-fix behaviour: visual
  withdrawal never ran, additive added 1, count went 1→2.

  ```
     visual(1bnqphs).count=1
   Γ£à BATCH 26 hook-only change: visual count preserved (no over-withdraw)
  ```

- **`test8_commitFailureReturnsNotRan`** — stub `batch.commit()`
  rejects. The function must return `ran: false` and populate
  `errors[]`. Pre-fix behaviour: per-chunk handler swallowed the
  failure; function returned `ran: true` with `hookWrites = 1`.

  ```
     ran=false, errors=["learning aggregate update failed: simulated commit failure"]
   Γ£à BATCH 26 commit failure: ran=false, errors[] populated, no commit landed
  ```

All three new cases pass. All five prior cases (BATCH 24/25)
still pass.

```
=== BATCH 24/25/26 — applyLearningWrites function-level (Step 3) ===
Passed: 8, Failed: 0
```

---

## 3. Build + `npm test` from clean `lib/`

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ pwd

Path
----
D:\proads-worktrees\969-cumulative-learning\functions

$ Remove-Item -Recurse -Force lib
$ npm run build

> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

$ echo "exit: $LASTEXITCODE"
exit: 0
```

Full `npm test` from clean `lib/`:

```
$ npm test
...
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

=== BATCH 24/25/26 — applyLearningWrites function-level (Step 3) ===
Passed: 8, Failed: 0

contractFixtures.test: PASS

$ echo "exit: $LASTEXITCODE"
exit: 0
```

Every phase969 file green:

```
$ npm run test:phase969
Passed: 19, Failed: 0   # creativeGrouping
Passed: 12, Failed: 0   # learningLease
Passed: 12, Failed: 0   # boundedLedgerRead
Passed: 7,  Failed: 0   # fr070
Passed: 11, Failed: 0   # perAdActions
Passed: 2,  Failed: 0   # t021aWireup
Passed: 18, Failed: 0   # learningAccumulation
Passed: 4,  Failed: 0   # learningCascade
Passed: 2,  Failed: 0   # t025aWorkerWiring
Passed: 5,  Failed: 0   # t029GateMigration
Passed: 10, Failed: 0   # t064b
Passed: 8,  Failed: 0   # applyLearningWritesLease (5 BATCH 24/25 + 3 BATCH 26)
```

The BATCH 21 item 2 hook assertion still passes — the hook side
was unaffected by these visual fixes (it asserts on
`hookPerformance` only, not `visualPerformance`).

---

## 4. Why none of this was visible in summaries

The Batch 22/23/24 reports described `applyLearningWrites.ts`
as the unit that "owns consult + read + withdrawal + additive +
commit". That description is accurate at the file level. It
became inaccurate the moment a reader actually walked the
withdrawal block:

```ts
visualBase = visualBase.map((agg) => {
    const withdrawals = withdrawalByAngle.get(agg.patternKey);  // ← wrong key space
```

`withdrawalByAngle` was keyed on `hookAngle`. The lookup was on
`patternKey`. The two key spaces never intersect. The summary
hides the bug; reading the bytes shows it.

Bug 3 had the same shape: the summary said "commit failure
records error and returns emptyResult". The actual code said
"commit failure records error and returns `ran: true` with
`hookWrites` counting writes **built**". The summary was a
description of what the comment claims; the code did something
else.

The header comment for `applyVisualAggregateWithdrawal` said
"see `aggregateDelta.ts:107`" — but at that line in
`aggregateDelta.ts` (the inner loop of `applyHookAggregatesDelta`,
not `applyVisualAggregatesDelta`) the function is never called
from the visual side, because the call site was a dead lookup.
The doc-comment pointed to the wrong file, and the wrong file
referenced the right shape — the symmetry was documentation-only.

The Batch 26 header for the function now points the two
withdrawal maps at their respective key spaces explicitly:

```ts
//   - hook withdrawals are keyed by `angleKey`
//   - visual withdrawals are keyed by `patternKey`
//     The two key spaces never intersect. Conflating them produces
//     a visual withdrawal that silently never runs.
```

A future reader should not have to derive this from the loop
bodies.

---

## 5. State

- `aae58fa` fix(969): Batch 26 — close visual-withdrawal deadlock (Bug 1+2) and commit-failure reporting (Bug 3)
- `8985a8c` docs(969): Batch 25 — Item 1 verbatim artifact + Step 3 unfenced discriminator
- `edca51c` test(969): Batch 25 — add avgLinkCtr fenced-vs-unfenced discriminator
- `76cc1cc` docs(969): Batch 24 — Step 2 + Step 3 report
- `e991988` fix(969): Batch 24 — Step 2: move applyLearningWrites call site inside lease-held try block
- `706935f` fix(969): Batch 23 — Step 1 redo: extract applyLearningWrites with return-value pattern
- `cff4717` Revert "fix(969): Batch 22 - Step 1: extract applyLearningWrites without behaviour change"
- `c18fe50` Revert "docs(969): Batch 22 - Step 1 report"
- `db6ac12` docs(969): Batch 22a — review of Batch 22

Item 1 of Batch 22's review-of-review (lease fence covering the
read-modify-write) is now closed for the **hook** half, which
T064b's BATCH 20 lease-refused test pins. Item 1 is also now
closed for the **visual** half, which Batch 26's tests 6 and 7
pin. Item 1 was structurally the same defect on both halves;
the hook-side fix was the easy half.

Files changed in this commit:

- `functions/src/learning/applyLearningWrites.ts` — 159 / -30
  lines. Withdrawal application: two maps with distinct key
  spaces. Commit loop: throws on failure. Header: explicit
  hook-vs-pattern key spaces.

- `functions/src/__tests__/phase969/applyLearningWritesLease.test.ts` —
  +274 / -13 lines. Three new cases (test6/7/8) covering the
  visual withdrawal, hook-only-change preservation, and commit
  failure. Updated the runner header to `BATCH 24/25/26`.

Working tree clean except for the always-untracked
`specs/009-billing-plan-access/contracts/stripe-webhooks.md`.

---

## 6. The three raw outputs the reviewer asked for

```
$ git diff --stat HEAD~1
 .../phase969/applyLearningWritesLease.test.ts      | 287 ++++++++++++++++++++-
 functions/src/learning/applyLearningWrites.ts      | 159 +++++++++---
 2 files changed, 416 insertions(+), 30 deletions(-)

$ git status --short
?? specs/009-billing-plan-access/contracts/stripe-webhooks.md

$ pwd

Path
----
D:\proads-worktrees\969-cumulative-learning
```

(`git diff HEAD~1 HEAD` shows the Batch 26 fix in `applyLearningWrites.ts` and
`applyLearningWritesLease.test.ts`.)

### `npm test` tail with exit code from clean `lib/`

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ pwd

Path
----
D:\proads-worktrees\969-cumulative-learning\functions

$ Remove-Item -Recurse -Force lib
$ npm run build

> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

$ echo "build exit: $LASTEXITCODE"
exit: 0

$ npm test
... (full chain runs through every test group: registration,
    savedProjects, contractFixtures upstream + 50+ phase-prefixed
    groups + billing + the contractFixtures end-of-suite check) ...
  ✅ HFF.6.a: 1:1 → 4:5 auto-routes to outpaint (magnitude=0.2500)
  ✅ HFF.6.b: 4:5 → 9:16 auto-routes to rerender (magnitude=0.4222)
  ✅ HFF.6.c: outpaint byte-identity preserved in center region
  ✅ HFF.6.d: extractBuildPlan + rerenderFromPlan exercise real path; NoPlanError propagated
  ✅ HFF.6.e: user override outpaint on 4:5 → 9:16
  ✅ HFF.6.f: user override rerender on 1:1 → 4:5
  ✅ HFF.6.g: outpaint drift detected → fallback triggered
  ✅ HFF.6.h: carousel_all 5 slides have plans, router picks rerender for 1:1 -> 9:16
  ✅ HFF.6.i: NoPlanError on slide 3 (index 2), 4 others have plans
  ✅ HFF.6.j: same-ratio no-op (magnitude=0)
  ✅ HFF.6.k: invalid target ratio '2:1' rejected at callable boundary
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=9:16
📋 Render contract warnings: High-priority zone "headline" (priority 2) not referenced in build plan. | High-priority zone "hero" (priority 1) not referenced in build plan.
🛑 Deprecated REFLOW path invoked — use reflowImage callable (FR-026).
  ✅ HFF.6.l: deprecated REFLOW path returns typed error (REFLOW_DEPRECATED) — FR-026
  ✅ HFF.6.m: generation doc structure preserved (favoriteId, no new generation created)
  ✅ HFF.6.n: reflow-of-reflow uses original buildPlan (not derived)
  ✅ HFF.6.o: rerenderFromPlan calls generator with extracted plan + overridden ratio
═══ HFF — All aspect ratio reflow fixtures passed ═══


═══ Phase 16 — Creative Modes & Art Direction QA ═══
  ✅ 10 solo modes ✓
  ✅ 10 approved pairs ✓
  ✅ 4 carousel-specific ✓
  ✅ 3 batch-specific ✓
  ✅ 2 retargeting-specific ✓
  ✅ self-correction ✓
  ✅ 4 blocked combinations ✓
  ✅ 8 adapt states ✓
  ✅ audit: 8/8 strings free of cultural-compliance trigger words ✓

═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══

contractFixtures.test: PASS

$ echo "test exit: $LASTEXITCODE"
exit: 0
```

---

## 7. Path

This report was written to:

`D:\proads-worktrees\969-cumulative-learning\specs\969-cumulative-learning\reports\batch-26-969-report.md`

The path was constructed by copying from `pwd` output:

```
$ cd "D:\proads-worktrees\969-cumulative-learning"
$ pwd

Path
----
D:\proads-worktrees\969-cumulative-learning
```

joined to `specs\969-cumulative-learning\reports\batch-26-969-report.md`.
Not typed from memory.
