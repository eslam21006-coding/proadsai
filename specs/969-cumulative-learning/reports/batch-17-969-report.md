# Batch 17 — Phase 7 correction: multi-funnel reads `byFunnelType`, not `byObjective`

**Feature**: Cumulative Learning for Ad Performance (Phase 969)
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-06
**Owner audit**: 2026-09-06 (Batch 16 review flagged the wrong dimension)

This batch corrects a defect in Batch 16's `multiFunnel` flag and lands
T047 — the per-funnel-type breakdown FR-027 requires — which the
audit correctly identified as the gap that made the Batch 16 wiring
wrong by construction.

Two questions the audit asked me to settle rather than choose at the
keyboard, both settled:

1. **`unknown` bucket.** Per FR-032, evidence under `unknown` receives no
   same-funnel weighting boost and is **never** treated as matching a
   requested type. **Decision: unknown + 1 real funnel is 1 real funnel,
   not 2.** Owner-relevant reading: a row whose funnel attribution is
   missing is weaker evidence, not a separate funnel. The label's job
   is to claim a span the evidence does establish; claiming a span from
   `unknown` would be false confidence.

2. **Whether the breakdown exists on the aggregate today.** FR-027
   requires it. **It was NOT populated.** T047 was `[P] [US3]` and
   unresolved. **This batch lands T047 minimum scope end-to-end so the
   dashboard reads real data.** Reading a different field that
   happens to be present — the Batch 16 reading — was exactly the
   failure mode the audit flagged.

---

## §1 — Defect demonstrated against the Batch 16 implementation

The four cases the audit called out, asserted by a single Node test
(`functions/src/__tests__/phase969/whatsWorkingDashboardMultiFunnel.test.ts`)
that drives `getWhatsWorkingDashboardImpl` directly with stubbed
Firestore. Two runs, as established.

### §1.1 — Run against Batch 16 (raw)

```
$ node lib/__tests__/phase969/whatsWorkingDashboardMultiFunnel.test.js

whatsWorkingDashboard — FR-041 multi-funnel wiring

  ❌ case (a): two real funnels paid_event + paid_product → label SHOWS
     — case (a) failed: an angle used in BOTH paid_event and paid_product
       must show the multi-funnel label
     false !== true
  ✅ case (b): one funnel only → label ABSENT
  ✅ case (c): one funnel + unknown → label ABSENT (FR-032 reading)
  ❌ case (d): byObjective.other.count > 0 BUT only one funnel → label ABSENT
     (closing pin)
     — case (d) failed: a non-learning-eligible (byObjective.other)
       audience is not a second funnel type
     true !== false

============================================================
whatsWorkingDashboard multi-funnel tests: 2 passed, 2 failed
============================================================
exitcode 1
```

Two of four cases fail. Cases (b) and (c) pass by accident
(`byObjective.other.count === 0` returns `false`, which matches
expected) — not because the wiring reads the right dimension. The
defect is mechanical:

- (a) FAILS: motivating case. Both `paid_event` and `paid_product`
  funnel contributions are buried in `byObjective.conversion.count`.
  Reading `byObjective.other.count > 0` as a proxy for "second funnel"
  misses it.
- (d) FAILS: closing pin. A non-conversion campaign in
  `byObjective.other` (e.g., brand-awareness traffic) fires the label
  even though the angle is only in one funnel type.

### §1.2 — Run against this batch's fix (raw)

```
$ node lib/__tests__/phase969/whatsWorkingDashboardMultiFunnel.test.js

whatsWorkingDashboard — FR-041 multi-funnel wiring

  ✅ case (a): two real funnels paid_event + paid_product → label SHOWS
  ✅ case (b): one funnel only → label ABSENT
  ✅ case (c): one funnel + unknown → label ABSENT (FR-032 reading)
  ✅ case (d): byObjective.other.count > 0 BUT only one funnel → label ABSENT
     (closing pin)

============================================================
whatsWorkingDashboard multi-funnel tests: 4 passed, 0 failed
============================================================
exitcode 0
```

All four pass. The closing pin case (d) — which depended on the same
defect as (a) but in the opposite direction — is now correct. Cases
(b) and (c) keep passing for the right reason: real funnel count is
exactly 1 in those fixtures.

---

## §2 — What changed

### §2.1 — T047 minimum-scope landed end-to-end

Per-funnel-type breakdown now populated from the worker's per-ad
block. The shape is additive and FR-021-compatible (counts are
non-decreasing per the additive contract; row-count, not creative-count,
matches the `byObjective.conversion.count` semantics already in place).

**Files touched:**

| File | Change |
|---|---|
| `functions/src/learningAggregates.ts` | Added `FunnelTypeBucketKey`, `FunnelTypeBucket`, `ByFunnelTypeBreakdown`, `EMPTY_BY_FUNNEL_TYPE`, `resolveFunnelTypeBucketKey`. `AdForLearning` gains optional `funnelType`. `HookPerformanceAggregate` and `VisualPerformanceAggregate` gain optional `byFunnelType`. Older aggregates that pre-date T047 default to zero counts on read. |
| `functions/src/learning/aggregateDelta.ts` | Imports `EMPTY_BY_FUNNEL_TYPE` and `resolveFunnelTypeBucketKey`. `applyAdToHook`, `applyAdToVisual`, and `applyHookAggregateWithdrawal` populate / decrement `byFunnelType[ad.funnelType ?? "unknown"].count` symmetrically. `cloneHook`, `cloneVisual`, `emptyHook`, `emptyVisual` carry the field. Two helpers: `cloneByFunnelType` (defensive normaliser) and `incrementByFunnelType` / `decrementByFunnelType`. |
| `functions/src/metaSync/shared.ts` | Reads the workspace's `funnelType` once per sync from the settings doc (FR-027's source — already loaded as `funnelSettings.derived`). Threads it into the per-ad block via a new `workspaceFunnelType` variable in scope. The per-ad block passes it to `decidePerAdActionsForWorker`. |
| `functions/src/learning/decideAdWriteActions.ts` | `PerAdActionsInput` gains optional `funnelType`. Builds `AdForLearning.funnelType` from the input. |
| `functions/src/learning/learningPerAdLoop.ts` | `PerAdWorkerContext` gains required `funnelType`; `PerAdWorkerInputs` gains optional `funnelType` (optional so existing tests stay type-clean). Helper threads it through. |
| `functions/src/whatsWorkingDashboard.ts` | Exports `isMultiFunnel(byFunnelType)` (the single source of truth). Both `StrongestAngle.multiFunnel` and `StrongestVisual.multiFunnel` call it. |
| `functions/src/__tests__/phase969/whatsWorkingDashboardMultiFunnel.test.ts` | New file. Drives `getWhatsWorkingDashboardImpl` directly with stubbed Firestore. The four cases. Wired into `test:phase969:multiFunnel` and into `test:phase969` chain. |
| `functions/package.json` | Added `test:phase969:multiFunnel`; spliced it into the `test:phase969` chain. |

### §2.2 — `isMultiFunnel` source of truth (the single function)

```ts
const REAL_FUNNEL_KEYS = [
    "paid_event",
    "paid_product",
    "free_webinar",
    "lead_magnet_call",
] as const;

export function isMultiFunnel(byFunnelType: unknown): boolean {
    if (!byFunnelType || typeof byFunnelType !== "object") return false;
    let span = 0;
    for (const key of REAL_FUNNEL_KEYS) {
        const bucket = (byFunnelType as Record<string, unknown>)[key];
        if (bucket && typeof bucket === "object") {
            const count = (bucket as { count?: unknown }).count;
            if (typeof count === "number" && count > 0) span += 1;
            if (span >= 2) return true;
        }
    }
    return false;
}
```

Three decisions written next to the source:

1. **Real funnel types only.** `unknown` alone is 0. `unknown` + 1 real
   is 1. FR-032 says unknown receives no same-funnel weighting and never
   matches a requested type — its non-functional role matches an
   exclusive reading here.
2. **Row-count, not creative-count.** Mirrors the
   `byObjective.conversion.count` semantics already in place
   (FR-020a: counts are non-decreasing per the additive contract).
   Mixed unit would either inflate the count or require a parallel
   per-funnel creative count; consistency wins.
3. **`conversion` + `other` from the objective split are not funnel
   types.** FR-041 names the owner's funnels (the four funnel
   settings). The objective split predates this feature and was
   Batch 16's reading — wrong dimension.

### §2.3 — Defensive read for older aggregates

The `isMultiFunnel` helper reads the breakdown object defensively:

- missing `byFunnelType` → treats as zero counts → returns `false`.
- missing keys within `byFunnelType` → treats as zero counts for those
  real funnel types → returns `false`.
- `count` not a number → treats as zero → returns `false`.

Aggregates that pre-date T047 (FR-042 schemaVersion 1 records
written before this batch) default to the safe answer: label absent
until the next sync, at which point the worker writes
`byFunnelType` and `isMultiFunnel` reads real attribution.

---

## §3 — Test name vs assertion check (Rule 0b)

Walking the new `functions/src/__tests__/phase969/whatsWorkingDashboardMultiFunnel.test.ts`:

| Runner description                                                                                                                                                                    | Assertion                                                                                                                                                              | Match? |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| `case (a): two real funnels paid_event + paid_product → label SHOWS`                                                                                                                   | `expect(angle!.multiFunnel, true)` — the fixture has `byFunnelType.paid_event.count=8` AND `paid_product.count=4`. `isMultiFunnel` returns true.                      | ✅      |
| `case (b): one funnel only → label ABSENT`                                                                                                                                            | `expect(angle!.multiFunnel, false)` — only `paid_event.count=8`; the other three zero.                                                                              | ✅      |
| `case (c): one funnel + unknown → label ABSENT (FR-032 reading)`                                                                                                                       | `expect(angle!.multiFunnel, false)` — `paid_event.count=5`, `unknown.count=3`; real span is 1.                                                                    | ✅      |
| `case (d): byObjective.other.count > 0 BUT only one funnel → label ABSENT (closing pin)`                                                                                              | `expect(angle!.multiFunnel, false)` — `byObjective.other.count=5` but `byFunnelType` has only `paid_event.count=8`; reading the right dimension returns false.      | ✅      |

Names tell the truth. The shape that drives these assertions is the
real `getWhatsWorkingDashboardImpl` reading real per-funnel-type data
from a stubbed Firestore, not a duplicated source-of-truth formula in
the test.

---

## §4 — Test that did NOT change

`src/__tests__/whatsWorkingMultiFunnel.test.tsx` (Batch 16) keeps
passing unmodified. It tests the **frontend conditional render**
against a preset `multiFunnel: boolean`. That is the correct concern
for that test — the boolean is computed server-side; the frontend
just renders. The same scope is now reliably correct because the
server-side computation is correct.

The cross-check between server-side computation and frontend render
is captured in this batch's Node test, which drives the server-side
impl directly.

---

## §5 — Source-text census — Phase 7 final (after Batch 17)

### §5.1 — Three categories unchanged

SOURCE-TEXT / SOURCE-CONFIG (structural guards), BEHAVIOURAL
(drives real code, observes real output), SIMULATION (reclassified
Batch 12).

### §5.2 — Census entries — post-Batch 17

| File                                                                                  | Assertion                                                                                       | Category                                | Status                                                |
|---------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|-----------------------------------------|-------------------------------------------------------|
| `learningCascade.test.ts:156`                                                        | `applyAdToHook` has no `count -=` patterns                                                       | SOURCE-TEXT (FR-014 structural)         | active                                                |
| `t029GateMigrationDiscriminator.test.ts:313`                                        | rankingEngine.ts inline gate reads `creativeCount` directly                                     | SOURCE-TEXT (T029c gate migration)       | active                                                |
| `testRegistrationGuard.test.ts` (chain-wide, Batch 11)                                | every lib chain entry has a `.ts` source on disk and vice versa                                   | SOURCE-CONFIG (configuration)            | active                                                |
| `t021aWireupDiscriminator.test.ts:172-216`                                          | T021a BEFORE/AFTER driving simulation harness                                                    | SIMULATION                              | active                                                |
| `t025aWorkerWiringDiscriminator.test.ts:195-289`                                     | T025a BEFORE/AFTER driving simulation harness                                                    | SIMULATION                              | active                                                |
| `perAdActions.test.ts:101-181`                                                       | T021a discriminator: drives `decideAdWriteActions`                                               | SIMULATION                              | active                                                |
| `perAdActions.test.ts:243-290`                                                       | T025a function-level: drives `decideAdWriteActions`                                              | SIMULATION                              | active                                                |
| `t029GateMigrationDiscriminator.test.ts:195-289`                                     | T029c discriminator: drives `passesFRO34Gate`                                                    | SIMULATION                              | active                                                |
| `t029GateMigrationDiscriminator.test.ts:295-301`                                     | confidence-below-MIN_CONFIDENCE fails the gate even at scale                                      | BEHAVIOURAL                             | active                                                |
| `t064bEndToEnd.discriminator.test.ts` (4 tests)                                     | SC-049 + worker-output (T021a creative key, T025a ledger keys)                                   | BEHAVIOURAL                             | active                                                |
| `whatsWorkingMultiFunnel.test.tsx` (7 vitest tests, Batch 16)                        | multi-funnel frontend conditional render + SC-010 bilingual + zero jargon                        | BEHAVIOURAL (frontend render)           | active                                                |
| `whatsWorkingDashboardMultiFunnel.test.ts` (4 Node tests, Batch 17)                  | multi-funnel server-side computation over the byFunnelType breakdown                              | BEHAVIOURAL (server impl)               | **active — new**                                      |

**Counts** in `lib/`: 72 chain entries (was 71 in Batch 16). The new
entry is BEHAVIOURAL — drives real `getWhatsWorkingDashboardImpl`
against an in-memory Firestore stub, observes real output. No SOURCE-TEXT
guards added or removed.

---

## §6 — Raw output — `git diff --stat HEAD~1` after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" diff --stat HEAD~1 HEAD
 functions/package.json                                          |   3 +-
 functions/src/__tests__/phase969/whatsWorkingDashboardMultiFunnel.test.ts | 298 +++++++++++++++
 functions/src/learning/aggregateDelta.ts                        |  62 +++
 functions/src/learning/decideAdWriteActions.ts                  |  12 +
 functions/src/learning/learningPerAdLoop.ts                     |  13 +
 functions/src/learningAggregates.ts                             |  68 +++
 functions/src/metaSync/shared.ts                                |  17 +
 functions/src/whatsWorkingDashboard.ts                          | 121 +++++---
 8 files changed, 569 insertions(+), 25 deletions(-)
```

## §7 — Raw output — `git status --short` after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" status --short
```

(no output — clean working tree)

## §8 — Raw output — full chain tail from clean `lib/`

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ Remove-Item -Recurse -Force lib
$ npm test
```

Full raw output saved at `C:\temp\opencode\batch17-final-npmtest.txt`
(350+ KB, every per-test `✅` retained verbatim). Excerpt — the four
multi-funnel cases plus chain tail:

```
> test:phase969:multiFunnel
> npm run build && node lib/__tests__/phase969/whatsWorkingDashboardMultiFunnel.test.js

  ✅ case (a): two real funnels paid_event + paid_product → label SHOWS
  ✅ case (b): one funnel only → label ABSENT
  ✅ case (c): one funnel + unknown → label ABSENT (FR-032 reading)
  ✅ case (d): byObjective.other.count > 0 BUT only one funnel → label ABSENT (closing pin)

whatsWorkingDashboard multi-funnel tests: 4 passed, 0 failed
…

contractFixtures.test: PASS
exit: 0
```

`npm test` exits **0** from a clean `lib/`. Every chain entry the
registration guard tracks (72 ↔ 72) is in place; the four multi-funnel
cases pass.

## §9 — Frontend `npx vitest run` (Batch 16 vitest unchanged)

```
 RUN  v4.1.4 D:/proads-worktrees/969-cumulative-learning

 Test Files  8 passed (8)
      Tests  106 passed (106)
```

All 106 frontend tests pass.

## §10 — Items that did NOT change

### §10.1 — i18n.tsx strings (Batch 16)

`whats_working.multi_funnel.label` and `.tooltip` (and their Arabic
counterparts, byte-identical to the owner-approved text) are unchanged
in this batch. Only the value of `multiFunnel` is now correctly
computed. The label surface — what the owner sees — is the same.

### §10.2 — T029c SOURCE-TEXT guard

Per Batch 16 §3.4. Unchanged.

### §10.3 — T068

Already recorded in `specs/969-cumulative-learning/quickstart.md`
§After deployment (line 103). No additional recording needed.

### §10.4 — Three retired guards from Batch 16

`sc049Tripwire.test.ts` (deleted), `t021aWireupDiscriminator.test.ts`
SOURCE-TEXT body deleted, `t025aWorkerWiringDiscriminator.test.ts`
SOURCE-TEXT body deleted. None re-introduced.

### §10.5 — Phase 7 closes

Per the user's "no other work in this batch" directive, this batch
fixes Batch 16's defect and lands T047. No Phase 8 scope creep.

---

## §11 — Path

`specs/969-cumulative-learning/reports/batch-17-969-report.md`

## §12 — Commits (this batch)

- `<code commit>` `fix(969): Phase 7 Batch 17 - read multi-funnel from byFunnelType, populate T047`
- `<this report>` `docs(969): Batch 17 — report (dimension corrected + T047 landed + census)`
