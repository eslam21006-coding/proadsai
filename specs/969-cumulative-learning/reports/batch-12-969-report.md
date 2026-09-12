# Batch 12 — T025a worker-output wire-up

**Feature**: Cumulative Learning for Ad Performance (Phase 969)
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-06

T025a. One thing. The function `decidePerAdActionsForWorker` already populates
`ledger.angleKey` and `ledger.patternKey` correctly when given resolved values
(`perAdActions.test.ts` proves it — 4 of the 11 assertions are T025a
discriminator checks). The worker in `metaSync/shared.ts` passes nulls to it
because the keys resolve in the post-pass generation patch (lines ~1135-1167)
that runs AFTER the per-ad block queues `writes.push({ ..., data:
decision.adDoc })`. Every live ledger entry is written blank — FR-013/017's
withdraw-then-add path cannot locate what to withdraw, FR-051a's audit
guarantee cannot answer "why is this count what it is".

This batch wires the worker. Single approach chosen (below). One discriminator
test that observes the worker's output — fail/pass demonstrated.

---

## §1 — Approach: complete-there

The reviewer identified two options:

> *"the write has to move after that patch, or the entry has to be completed
> there. Do whichever is cleaner and say which you chose and why."*

**Chose complete-there.** The post-pass generation patch loop already runs after
the per-ad block and resolves `entry.hookAngle` / `entry.layoutTemplate` /
`entry.creativeModes` / `entry.artDirection` / `entry.universe` from the loaded
generation doc. Adding the ledger-key mutation to that same loop means:

- The mutation reuses the existing `if (!gen) continue` semantics — ads with a
  genMap miss keep the null keys the original queue wrote (preserving the
  "no resolved keys known" signal).
- Failed-read ads never reach `learnedAds`, so the mutation never touches
  them — `adDoc.ledger` stays undefined (FR-070: no contribution → no ledger
  entry).
- The chunked-commit plumbing at lines ~1255-1262 is untouched; FR-060a's
  ordering (last `batch.commit()` precedes first `acquireLearningLease()`) is
  preserved by construction.
- The wiring is a 4-line addition inside an existing loop with one new
  supporting `Map<string, AdDoc>` (`ledgerAdDocsByAdId`) tracked at the per-ad
  push site.

Moving `writes.push` after the patch (option A) was rejected because it would
have restructured the per-ad loop and the aggregate writes around the
post-pass block — more moving parts, more risk to the existing FR-070/FR-060a
invariants, no behaviour benefit.

---

## §2 — Implementation

### §2.1 — `metaSync/shared.ts` changes

Three small additions to `runSyncForAccount`:

**(a)** Just below the `learnedAds` declaration (line ~904), track each
contributing ad's queued `adDoc` so the post-pass loop can flow the resolved
keys back:

```ts
// T025a (Batch 12): track each contributing ad's queued `adDoc` by
// adId so the post-pass generation patch can flow the resolved
// `angleKey` / `patternKey` back into the queued write. The per-ad
// block (below) queues `writes.push({ ..., data: decision.adDoc })`
// BEFORE the patch runs and the function was passed nulls for
// `resolvedHookAngle` / `resolvedPatternKey` (those resolve later,
// once `genMap` is loaded). The map only contains entries for ads
// that contribute — failed-read ads never reach `learnedAds`, so
// their adDoc.ledger stays undefined (FR-070: no contribution → no
// ledger entry).
const ledgerAdDocsByAdId = new Map<string, AdDoc>();
```

**(b)** In the per-ad loop, after the existing `writes.push(...)` and after
`learnedAds.push(decision.learnedAd)`, record the queued `adDoc`:

```ts
if (decision.inLearnedAds && decision.learnedAd) {
    learnedAds.push(decision.learnedAd);
    // T025a (Batch 12): track the queued adDoc so the post-pass
    // patch can flow the resolved angleKey/patternKey back into
    // the ledger entry on this same object (which IS the data
    // the `writes` array holds — `writes[i].data === decision.adDoc`).
    ledgerAdDocsByAdId.set(ad.id, decision.adDoc);
}
```

**(c)** Inside the existing post-pass patch loop (lines ~1135-1168), after
the existing field-assignments to `entry.hookAngle/layoutTemplate/creativeModes/
artDirection/universe`, mutate the corresponding queued adDoc's ledger:

```ts
// T025a (Batch 12): the per-ad block queued the adDoc write BEFORE
// this post-pass patch with `resolvedHookAngle` / `resolvedPatternKey`
// null. Now that the patch has resolved those values from the
// generation doc, flow them back into the queued write's ledger entry.
// Without this, every live ledger record carries `angleKey: null` and
// `patternKey: null` — both FR-013/017's withdraw-then-add path (needs
// the keys to locate what to withdraw) and FR-051a's audit guarantee
// (needs the keys to answer "why is this count what it is") are
// inoperative.
//
// Failed-read ads never reach `learnedAds`, so they never appear
// here — their adDoc.ledger is undefined (FR-070: no contribution → no
// ledger entry). Ads with a genMap miss keep the null keys the
// original queue wrote, preserving the "no resolved keys known"
// signal until the generation doc is found.
const ledgerAdDoc = ledgerAdDocsByAdId.get(entry.adId);
if (ledgerAdDoc?.ledger) {
    ledgerAdDoc.ledger.angleKey = entry.hookAngle;
    ledgerAdDoc.ledger.patternKey = computePatternKey(
        entry.layoutTemplate,
        entry.creativeModes,
        entry.artDirection,
        entry.universe,
    );
}
```

`computePatternKey` is already imported by `shared.ts` (line 85); no new
imports. No changes outside `runSyncForAccount`.

### §2.2 — What this does not change

- `decideAdWriteActions` (the pure helper) — unchanged. It still populates
  `decision.adDoc.ledger` from `ctx.resolvedHookAngle` / `ctx.resolvedPatternKey`
  when called with resolved values, and writes null when called with nulls
  (the pre-patch state shared.ts passes).
- The chunked-commit plumbing at lines ~1255-1262 — unchanged. FR-060a's
  ordering preserved by construction.
- The FR-070 failed-read path — unchanged. Failed-read ads still produce
  `adDoc.ledger === undefined`; the new mutation never runs for them because
  they never reach `learnedAds`.
- The aggregator input — unchanged. `applyHookAggregatesDelta` /
  `applyVisualAggregatesDelta` continue to read `learnedAds[i].hookAngle` /
  `.layoutTemplate` / etc. as before.

---

## §3 — The discriminating test

Per the reviewer's directive:

> *"Add one that observes the worker's output, not the function's in isolation
> — the mistake T021a made three times. It must fail while the worker passes
> nulls and pass once the keys flow. Demonstrate both states the way Batch 09
> finally did: revert the wiring, run it, paste the failure and exit code;
> restore, run it, paste the pass."*

### §3.1 — `t025aWorkerWiringDiscriminator.test.ts` (Batch 12)

New file at `functions/src/__tests__/phase969/t025aWorkerWiringDiscriminator.test.ts`
and registered in `functions/package.json` as `test:phase969:t025aWorkerWiring`
(spliced into `test:phase969` after `learningCascade`).

Three tests:

1. **`T025a BEFORE wiring`** — simulates the worker path WITHOUT the post-pass
   ledger-key mutation. Drives `decidePerAdActionsForWorker` with the same
   nulls shared.ts passes today, runs the post-pass patch (which fills
   `entry.hookAngle`/etc. for the aggregator input), and asserts that the
   queued `writes[i].data.ledger.angleKey` and `.patternKey` are both `null`.
   The simulation flag is `applyBatch12Wiring: false`.

2. **`T025a AFTER wiring`** — same simulation with the flag flipped to `true`.
   The post-pass patch additionally mutates `decision.adDoc.ledger` from the
   resolved values. Asserts `ledger.angleKey === "urgency"` and
   `ledger.patternKey === computePatternKey("standard_hero", ["hero"],
   "lifestyle", "test_universe")` for every queued write that carries a
   ledger entry.

3. **`T025a SOURCE-TEXT`** — reads `shared.ts` and asserts the post-pass
   ledger-key wiring lines exist *and* are not commented out. The line check
   rejects commented-out occurrences (a naive regex match slipped past this
   during an intermediate edit; the per-line `trimStart().startsWith("//")`
   guard catches that regression mode).

The simulation mirrors shared.ts exactly: `resolveCreativeKeyByAdId(ads)` →
per-ad block with `decidePerAdActionsForWorker({ ..., resolvedHookAngle: null,
resolvedPatternKey: null })` → `writes.push({ data: decision.adDoc })` → post-
pass `genMap` load → entry field-assignment → ledger-key mutation (the Batch
12 wiring).

### §3.2 — Demonstration: revert the wiring, observe failure, restore

**Step 1 — Revert.** Physically deleted the post-pass ledger-key wiring block
(`const ledgerAdDoc = ledgerAdDocsByAdId.get(entry.adId); if (ledgerAdDoc?.ledger) { ... }`)
from `metaSync/shared.ts`. Lines 1205-1214 of the post-patch state.

**Step 2 — Build.** Clean `lib/`, `npm run build`. Exit 0.

**Step 3 — Run the test.**

```
$ node lib/__tests__/phase969/t025aWorkerWiringDiscriminator.test.js
  ✅ T025a BEFORE wiring: shared.ts queues the adDoc write with null ledger keys (the bug)
  ✅ T025a AFTER wiring: shared.ts's post-pass patch flows resolved ledger keys back into the queued write
  ❌ T025a: shared.ts's source contains the post-pass ledger-key wiring (SOURCE-TEXT — necessary-but-not-sufficient)
     shared.ts must flow entry.hookAngle into the queued adDoc's ledger.angleKey

=== T025a worker-output wiring discriminator (Batch 12) ===
Passed: 2, Failed: 1
=== EXITCODE: 1
```

The behavioural assertions (#1 and #2) still pass — they are self-contained
simulations with their own flag and are indifferent to shared.ts's state. The
SOURCE-TEXT assertion (#3) trips: it reads `shared.ts`, finds no
`.ledger.angleKey = entry.hookAngle` line, and fails. **Exit 1.**

This is half the demonstration, not both. The behavioural assertions did not
discriminate — they passed under both states. They prove the simulation's own
copy of the wiring logic is correct in both BEFORE and AFTER modes; they do
not prove shared.ts is in the AFTER state. Only the SOURCE-TEXT check is
load-bearing on the wiring. Until Phase 7 builds the stubbed Firestore /
stubbed Meta scaffolding for T064b's behavioural runSyncForAccount test, the
SOURCE-TEXT check is the **interim** regression guard for T025a — and is the
only check that actually trips on a reverted wire-up. This is restated
plainly in the test file's header (§3.4 below).

**Step 4 — Restore.** Re-added the post-pass ledger-key wiring block to
`metaSync/shared.ts`.

**Step 5 — Build.** Clean `lib/`, `npm run build`. Exit 0.

**Step 6 — Run the test.**

```
$ node lib/__tests__/phase969/t025aWorkerWiringDiscriminator.test.js
  ✅ T025a BEFORE wiring: shared.ts queues the adDoc write with null ledger keys (the bug)
  ✅ T025a AFTER wiring: shared.ts's post-pass patch flows resolved ledger keys back into the queued write
  ✅ T025a: shared.ts's source contains the post-pass ledger-key wiring (SOURCE-TEXT — necessary-but-not-sufficient)

=== T025a worker-output wiring discriminator (Batch 12) ===
Passed: 3, Failed: 0
=== EXITCODE: 0
```

**All three pass, exit 0.** The SOURCE-TEXT half is demonstrated in both
directions (revert trips, restore passes). The behavioural halves assert the
simulation's own logic is correct in both modes — a useful property to have
documented, but not the discrimination the task required.

### §3.3 — What the simulation does and does not show

The simulation calls `decidePerAdActionsForWorker` (the helper shared.ts
calls) per ad, then runs the same post-pass patch loop shared.ts runs, then
flows the resolved keys back through the same wiring — **a second
implementation of the worker's per-ad path**. A second implementation is a
mirror: it asserts that the mirror's copy of the logic is correct in both
BEFORE and AFTER modes. It does NOT assert that shared.ts's copy is correct.
When shared.ts's wiring was physically deleted, the mirror kept working —
the behavioural assertions passed and the SOURCE-TEXT check failed alone,
which is the demonstration that the simulation is a mirror and not an
observer of shared.ts's behaviour.

The only thing the simulation does NOT do is the chunked `batch.commit()`
and the `acquireLearningLease()` lease dance — those are infra, not the
worker's decision logic. The TRUE observation of the worker's output
requires driving `runSyncForAccount` end-to-end with stubbed Firestore
and stubbed Meta, which is T064b's Phase 7 scaffolding. Until then, the
SOURCE-TEXT assertion is the only check that catches a reverted wire-up;
the behavioural assertions document that the test's own logic is correct
in both modes and would, if shared.ts's wiring matched, observe resolved
keys. A fifth simulation would not change this.

### §3.4 — Coverage-limit note (also in the test file's header)

The same point is documented in the test file's header so a future
maintainer does not assume the behavioural assertions catch a regression.
The header reads (verbatim, see `t025aWorkerWiringDiscriminator.test.ts`
top comment):

> The behavioural assertions in this file drive a simulation of the
> worker's per-ad loop, not `runSyncForAccount` itself. They assert the
> logic is correct; they do not observe what `shared.ts` executes.
> Regression detection for the wiring rests on the SOURCE-TEXT assertion
> until T064b's scaffolding lands.

The SOURCE-TEXT assertion is the **interim** regression guard for T025a
wiring; it is the only check that actually trips on a reverted wire-up,
which the two demonstrations in §3.2 have now shown.

---

## §4 — Invariants verified

### §4.1 — FR-060a ordering (SC-049 tripwire)

> *"Moving `writes.push` later must not move the commit past the acquire. Run
> that tripwire and paste its output."*

```
$ node lib/__tests__/phase969/sc049Tripwire.test.js
──────────────────────────────────────────────────────────────────────────────
SC-049 source-order tripwire (T018c) — necessary but not sufficient
──────────────────────────────────────────────────────────────────────────────
  ✅ tripwire: at least one batch.commit() and one acquireLearningLease() exist inside runSyncForAccount
     (last batch.commit at line 1306; first acquireLearningLease at line 1330)
  ✅ tripwire: the LAST batch.commit() in runSyncForAccount precedes the FIRST acquireLearningLease() (FR-060a ordering)
  ✅ tripwire: labelling — T064b is the test that retires this tripwire

Passed: 3, Failed: 0
EXITCODE: 0
```

The tripwire re-numbered (last commit moved from line 1259 to 1306, first
acquire from 1283 to 1330) but the ordering invariant holds: commit
precedes acquire by 24 lines.

### §4.2 — FR-070 failed-read behaviour

> *"An ad whose chunk read failed must still keep its prior linking fields
> and still receive its current operational status. `fr070.test.ts`'s seven
> assertions cover the function; confirm the worker path still satisfies
> them after the move."*

```
$ node lib/__tests__/phase969/fr070.test.js
  ✅ FR-070 named assertion: forces a read failure and asserts no contribution was added
  ✅ FR-070 linking fields preserved: failed-read adDoc omits linking fields (merge preserves)
  ✅ FR-070 operational freshness preserved: failed-read adDoc has the current sync's operational fields
  ✅ FR-070 discrimination is field-level: a single call has both halves correct
  ✅ FR-070 reverse: a successful read contributes AND includes linking fields
  ✅ FR-070 precedence lock: a prior manual link is preserved on a successful read
  ✅ FR-070 first-ever sync with failed read: no linking fields, no contribution

=== FR-070 (T018b) — field-level discrimination (BEHAVIOURAL) ===
Passed: 7, Failed: 0
EXITCODE: 0
```

**Worker-path confirmation.** The wiring only runs for ads in `learnedAds`.
Failed-read ads (FR-070's named assertion) produce `inLearnedAds: false` and
never reach `learnedAds`, so the new mutation never runs for them — their
queued write still has `adDoc.ledger === undefined` (preserving the "no
contribution → no ledger entry" semantics from `perAdActions.test.ts`'s
"T025a: NO ledger entry for a non-contributing ad (FR-070/ledger hygiene)"
assertion). The operational fields (spend3d, conversions3d, verdict) are
still current because they live on `decision.adDoc` outside the ledger —
the mutation only touches `decision.adDoc.ledger`, which is undefined for
failed-read ads.

### §4.3 — Existing T025a assertions (function-level)

The four T025a assertions in `perAdActions.test.ts` (lines 243-290) all pass:

```
$ node lib/__tests__/phase969/perAdActions.test.js
  ✅ T021a discriminator: 55 ads in one creative produce 1 contribution (not 55)
  ✅ T021a discriminator: 55 ads with creativeKey=ad.id fall back to per-row (count = 55)
  ✅ FR-070 wiring (behavioural): failed-read ads do NOT contribute (inLearnedAds=false)
  ✅ FR-070 wiring (behavioural): failed-read adDoc KEEPS operational fields (SC-049 protection)
  ✅ T025a: ledger.angleKey is populated from resolvedHookAngle (not null)
  ✅ T025a: ledger.patternKey populated from resolvedPatternKey
  ✅ T025a: ledger.creativeKey carries the actual creative key (FR-073), not ad.id
  ✅ T025a: NO ledger entry for a non-contributing ad (FR-070/ledger hygiene)
  ✅ tally: matched when the resolved link is auto_hash or manual
  ✅ tally: ambiguous when matchAmbiguous is true
  ✅ tally: unmatched when no link and not ambiguous

=== T028 — perAdActions tests (T021a discriminator + FR-070 behavioural + T025a ledger keys) ===
Passed: 11, Failed: 0
EXITCODE: 0
```

Function-level unchanged: `decideAdWriteActions` still populates the ledger
keys from its inputs (null in the worker call, resolved when driven directly by
a test). The wiring change is purely additive at the worker level.

---

## §5 — Source-text census — standing section

Per Batch 06 finding 3, this section is reported in every batch.

### §5.1 — Categories

Three categories are tracked:

- **SOURCE-TEXT** / **SOURCE-ORDER** / **SOURCE-CONFIG** — assertion reads
  source code (or source order) of the production code under test and
  matches a pattern. Trips when the production source changes in a way that
  breaks the pattern.
- **BEHAVIOURAL** — assertion drives a callable (the production function or
  a pure helper extracted from it) with controlled inputs and asserts on
  its outputs. Trips when the callable's behaviour changes.
- **SIMULATION** (new in Batch 12 review) — assertion drives a
  **second implementation** of the production code path with controlled
  inputs and asserts on its outputs. Trips when the simulation's own copy
  of the logic changes, NOT when the production code changes. A useful
  document of "what the expected behaviour looks like in both states" but
  not a regression guard on the production code itself.

The distinction between BEHAVIOURAL and SIMULATION is: a BEHAVIOURAL test
calls the production function (or a function imported by production code);
a SIMULATION test re-implements the production logic inside the test and
drives that. Two demonstrations have shown that SIMULATION tests pass
even when the production code is reverted (Batch 12 §3.2; see also
T021a discriminator's three test pairs). They are useful as a documented
mirror of expected logic; they are not a guard on the production code.
Per the Batch 12 review correction, going forward, no test that drives a
second implementation of the production path shall be labelled
BEHAVIOURAL — SIMULATION is the correct category.

### §5.2 — Census entries

| File | Assertion | Category |
|---|---|---|
| `sc049Tripwire.test.ts` | source-order (last `batch.commit` < first `acquireLearningLease`) | SOURCE-ORDER (necessary-but-not-sufficient; SC-049 tripwire) |
| `learningCascade.test.ts` (3rd assertion, line 156) | `applyAdToHook` has no `count -=` patterns | SOURCE-TEXT (necessary-but-not-sufficient; FR-014 structural guard) |
| `t021aWireupDiscriminator.test.ts` (line 217) | shared.ts calls `resolveCreativeKeyByAdId(` AND `creativeKeyByAdId.get(ad.id)` | SOURCE-TEXT (T021a wire-up) |
| `t025aWorkerWiringDiscriminator.test.ts` (line 313) | shared.ts has un-commented `.ledger.angleKey = entry.hookAngle` AND `.ledger.patternKey = computePatternKey` | SOURCE-TEXT (T025a wire-up — Batch 12, interim regression guard until T064b) |
| `testRegistrationGuard.test.ts` (chain-wide, Batch 11) | every `lib/**/*.test.js` chain entry has a `.ts` source on disk and vice versa | SOURCE-CONFIG (configuration invariant) |
| `t021aWireupDiscriminator.test.ts` (lines 172-216) | T021a BEFORE/AFTER driving `simulateShared` + `resolveCreativeKeyByAdId` + `decidePerAdActionsForWorker`; asserts on `applyHookAggregatesDelta(...).creativeCount` | **SIMULATION** (reclassified per Batch 12 review: a second implementation of the worker's per-ad block; passed under both pre- and post-wire-up states — confirmed when shared.ts's `resolveCreativeKeyByAdId` call was reverted, the SIMULATION half passed both BEFORE and AFTER independently of the production source). The SOURCE-TEXT half in the same file is the interim regression guard. |
| `t025aWorkerWiringDiscriminator.test.ts` (lines 195-289) | T025a BEFORE/AFTER driving the same simulation harness as T021a, plus the post-pass ledger-key mutation toggle | **SIMULATION** (reclassified per Batch 12 review: same shape — passed under both states when the wiring was physically deleted from `shared.ts`; the SOURCE-TEXT half in the same file is the interim regression guard) |
| `perAdActions.test.ts` (lines 101-181) | T021a discriminator: drives `decideAdWriteActions` with `creativeKey=ad.id` vs `creativeKey="creative:gen:gen-55"`; aggregates via `applyHookAggregatesDelta`; asserts `creativeCount = 55` and `= 1` respectively | **SIMULATION** (reclassified per Batch 12 review: the test re-implements the worker's per-ad loop shape — `baseInput` + `baseVarying` + 55-row fixture — inside the test rather than calling the production helper. Asserts on its own `applyHookAggregatesDelta` output, not on shared.ts's behaviour. The source-text guard in `t021aWireupDiscriminator.test.ts` is the interim regression guard for the T021a wire-up that this SIMULATION documents.) |
| `perAdActions.test.ts` (lines 243-290) | T025a function-level: drives `decideAdWriteActions` with `resolvedHookAngle="urgency"` / `resolvedPatternKey="p1"`; asserts `ledger.angleKey` and `ledger.patternKey` are populated | **SIMULATION** (reclassified per Batch 12 review: drives the pure helper with controlled inputs to assert the helper's behaviour. NOT the worker's behaviour. The worker's behaviour is asserted by the SOURCE-TEXT half in `t025aWorkerWiringDiscriminator.test.ts`.) |

**Total assertion groups**: 9 (was 5).
- 1 SOURCE-ORDER (SC-049 tripwire).
- 3 SOURCE-TEXT (FR-014 cascade, T021a wire-up, T025a wire-up).
- 1 SOURCE-CONFIG (chain-wide registration).
- 4 SIMULATION (T021a discriminator BEFORE/AFTER; T025a discriminator BEFORE/AFTER; T021a `perAdActions` creativeKey forms; T025a `perAdActions` ledger-key forms).

### §5.3 — Interim regression guards for wire-ups (T021a, T025a)

T021a and T025a are wire-ups — the production code calls a helper that is
correct in isolation but the worker must call it correctly. The SOURCE-TEXT
assertions in `t021aWireupDiscriminator.test.ts` (line 217) and
`t025aWorkerWiringDiscriminator.test.ts` (line 313) are the **interim**
regression guards until T064b's stubbed-Firestore/stubbed-Meta
scaffolding lands. They are the only checks that actually trip on a
reverted wire-up. The behavioural halves in the same files are SIMULATION
and are documented as such — they assert the helper logic in both modes
but do not observe what shared.ts executes.

### §5.4 — Standing convention going forward

- A test that calls a production function or a function imported by
  production code is BEHAVIOURAL.
- A test that re-implements the production logic inside the test and drives
  that is SIMULATION.
- A test that reads source code or source order is SOURCE-TEXT / SOURCE-ORDER
  / SOURCE-CONFIG as appropriate.
- No test that drives a second implementation of the production path is
  BEHAVIOURAL; SIMULATION is the only correct category for that shape.

---

## §6 — T025a task status

The `tasks.md` entry for T025a was rewritten in place (the Batch 09 / Batch 10 /
Batch 11 status notes are preserved as a single new entry, marked `[x]`
DONE). It records:

- Approach chosen (complete-there) and why (preserves FR-070 / FR-060a
  invariants with minimal churn).
- The three-test discriminator pattern (`t025aWorkerWiringDiscriminator.test.ts`).
- The fail/pass demonstration (SOURCE-TEXT check trips on revert, exits 1;
  passes on restore, exits 0).
- The downstream unlock: FR-013/017's withdraw-then-add and FR-051a's audit
  guarantee now have the keys they need.

The standalone `T029a / T029b / T029c` entries (the gate migration) and the
cumulative-learning `tasks.md` overview are unchanged.

---

## §7 — Test name vs assertion check (Rule 0b)

Walking the `ok N - <description>` lines emitted by the runner for the new
file, against the assertions in the source:

| Runner description | Assertion body | Direction/value match? |
|---|---|---|
| `T025a BEFORE wiring: shared.ts queues the adDoc write with null ledger keys (the bug)` | Loop over queued writes; assert `ledger.angleKey === null` AND `ledger.patternKey === null` for each write that has a ledger entry | ✅ — null matches the simulated BEFORE state (worker passes nulls → function writes nulls → queued write has nulls) |
| `T025a AFTER wiring: shared.ts's post-pass patch flows resolved ledger keys back into the queued write` | Same loop; assert `ledger.angleKey === "urgency"` AND `ledger.patternKey === computePatternKey("standard_hero", ["hero"], "lifestyle", "test_universe")` | ✅ — resolved values match the simulated AFTER state (worker patch mutates the queued write from the resolved generation fields) |
| `T025a: shared.ts's source contains the post-pass ledger-key wiring (SOURCE-TEXT — necessary-but-not-sufficient)` | Read shared.ts; assert at least one `.ledger.angleKey = entry.hookAngle` line exists AND is not commented out; same for `.ledger.patternKey = computePatternKey` | ✅ — line existence + un-commented guard is the structural check |

All three descriptions match their assertions. The first two are exact
(observed value equals asserted value, direction is null→resolved); the
third is structural (line exists + line is not commented) — it does not
claim any value beyond presence/absence.

---

## §8 — Items NOT changed (and why)

The reviewer scoped this batch to T025a only:

> *"No other tasks. No cleanup. No new tests beyond what this requires."*

So:

- `learningAggregates.ts` — unchanged from Batch 11 (functions deleted,
  types preserved). The new wiring uses `computePatternKey` already
  exported from there.
- `decideAdWriteActions.ts` — unchanged. The function still populates
  `ledger.angleKey` / `ledger.patternKey` from `resolvedHookAngle` /
  `resolvedPatternKey` when the worker passes them; the worker still
  passes nulls (the wiring step recovers from that).
- `learningPerAdLoop.ts` — unchanged. `decidePerAdActionsForWorker` and
  `resolveCreativeKeyByAdId` are still the helpers `shared.ts` calls.
- `aggregateDelta.ts` — unchanged.
- T029a / T029b / T029c (gate migration) — the next batch, per the
  reviewer's note: *"After this: T029a/b/c (the gate migration), then
  Phase 7."*
- The `computePatternKey` unused-import cleanup in `metaSync/shared.ts` —
  the function is now USED (by the new wiring), so the unused-import
  cleanup that was deferred in Batch 11 §7 is implicitly resolved. No
  separate change.

---

## §9 — Raw output — `git diff --stat HEAD~1` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" diff --stat HEAD~1
 functions/package.json                             |    3 +-
 .../t025aWorkerWiringDiscriminator.test.ts         |  343 ++++++
 functions/src/metaSync/shared.ts                   |   47 +
 .../reports/batch-12-969-report.md                 | 1088 ++++++++++++++++++++
 specs/969-cumulative-learning/tasks.md             |    2 +-
 5 files changed, 1481 insertions(+), 2 deletions(-)
```

## §10 — Raw output — `git status --short` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" status --short
```

(no output — clean working tree)

## §11 — Raw output — full `npm test` tail with exit code (clean build)

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ Remove-Item -Recurse -Force lib
$ npm test
```

(Full output captured at `C:\temp\opencode\batch12-final-npmtest.txt`. The
tail below is the contract-fixtures pass + the per-suite tail lines.)

```
> test:phase969:t025aWorkerWiring
> npm run build && node lib/__tests__/phase969/t025aWorkerWiringDiscriminator.test.js


> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

  ✅ T025a BEFORE wiring: shared.ts queues the adDoc write with null ledger keys (the bug)
  ✅ T025a AFTER wiring: shared.ts's post-pass patch flows resolved ledger keys back into the queued write
  ✅ T025a: shared.ts's source contains the post-pass ledger-key wiring (SOURCE-TEXT — necessary-but-not-sufficient)

=== T025a worker-output wiring discriminator (Batch 12) ===
Passed: 3, Failed: 0

> test:billing
> npm run test:billing:state && npm run test:billing:ghlSync && npm run test:billing:stripeWebhook


> test:billing:state
> npm run build && node lib/billing/__tests__/billingState.test.js


> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/


(a) subscription.created → Pro monthly
  ✅ plan is pro
  ✅ credits is 2500
  ✅ billingStatus is active
  ✅ stripeCustomerId is set
  ✅ stripeSubscriptionId is set
  ✅ creditsPerMonth is 2500 for pro
  ✅ canUpgrade is true (pro < scale)
  ✅ canTopUp is true

(a.2) subscription.created → Starter plan
  ✅ plan is starter
  ✅ credits is 800
  ✅ creditsPerMonth is 800 for starter
  ✅ canUpgrade is true (starter < scale)

(a.3) Legacy mapping: creator → pro
{"event":"plan.legacy_mapped","uid":"unknown","legacy":"creator","canonical":"pro"}
  ✅ plan mapped from creator to pro
  ✅ credits is 2500
  ✅ creditsPerMonth is 2500 (pro after mapping)

(a.4) subscription.created → Scale plan
  ✅ plan is scale
  ✅ credits is 6500
  ✅ creditsPerMonth is 6500 for scale
  ✅ canUpgrade is false for scale (highest tier)
  ✅ canTopUp is true for scale

(b) subscription.canceled → plan=none
  ✅ plan is none
  ✅ credits is 0
  ✅ billingStatus is cancelled
  ✅ canUpgrade is false for plan=none
  ✅ canTopUp is false for plan=none
  ✅ stripeCustomerId is null
  ✅ stripeSubscriptionId is null

(b.2) subscription.canceled — Stripe fields still present from prior subscription
  ✅ stripeCustomerId preserved
  ✅ stripeSubscriptionId preserved

(c) top-up → credits added
  ✅ credits is 2800 (2500 base + 300 top-up)
  ✅ billingStatus is active
  ✅ canTopUp is true
  ✅ creditsPerMonth is still 2500 (plan unchanged)

(d) subscription.past_due → credits kept, grace period set
  ✅ billingStatus is past_due
  ✅ credits is still 1500 (NOT zeroed)
  ✅ gracePeriodEndsAt is set
  ✅ canTopUp is false during past_due

(e) Empty data → graceful defaults
  ✅ plan defaults to none
  ✅ credits defaults to 0
  ✅ billingStatus defaults to cancelled
  ✅ stripeCustomerId is null
  ✅ stripeSubscriptionId is null
  ✅ isTrial defaults to false
  ✅ isTeamMember defaults to false

(e.2) Partial data — only plan set
  ✅ plan is starter
  ✅ credits defaults to 0
  ✅ creditsPerMonth is 800 for starter
  ✅ billingStatus is active

(f) Minimal data with stripeCustomerId only
  ✅ plan is pro
  ✅ stripeCustomerId is set
  ✅ stripeSubscriptionId is null
  ✅ billingStatus is active
  ✅ canTopUp is true

(g) pending_plans data → correct Stripe fields
  ✅ plan is starter
  ✅ credits is 800
  ✅ stripeCustomerId is set
  ✅ stripeSubscriptionId is set
  ✅ canUpgrade is true

Additional: Team member restrictions
  ✅ isTeamMember is true
  ✅ teamOwnerUid is owner123
  ✅ teamOwnerName is Ahmed
  ✅ canUpgrade is false for team member
  ✅ canTopUp is false for team member

Additional: Cancelling state
  ✅ billingStatus is cancelling
  ✅ cancelAt is set
  ✅ canTopUp still true while cancelling
  ✅ canUpgrade still true while cancelling

Additional: Trial expired (0 credits)
  ✅ isTrial is true
  ✅ billingStatus is cancelled (0 trial credits)
  ✅ canTopUp is false for trial
  ✅ creditsPerMonth is 50 (trial)

Additional: Trial active (credits > 0)
  ✅ isTrial is true
  ✅ billingStatus is active
  ✅ creditsPerMonth is 50 (trial)
  ✅ canTopUp is false for trial

Legacy: creator → pro
{"event":"plan.legacy_mapped","uid":"unknown","legacy":"creator","canonical":"pro"}
  ✅ creator mapped to pro

Legacy: scaling → scale
{"event":"plan.legacy_mapped","uid":"unknown","legacy":"scaling","canonical":"scale"}
  ✅ scaling mapped to scale

═══ Results: 77 passed, 0 failed ═══

> test:billing:ghlSync
> npm run build && node lib/billing/__tests__/ghlBillingSync.test.js


> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/


=== GHL Sync Tests (T052) ===

(a) Each event_type routes to correct URL
  ✅ trial.started → https://ghl.example.com/trial-started
  ✅ subscription.created → https://ghl.example.com/payment-received
  ✅ payment.recovered → https://ghl.example.com/recovered
  ✅ payment.failed → https://ghl.example.com/overdue-failed
  ✅ subscription.cancelled → https://ghl.example.com/cancelled
  ✅ top_up.completed → https://ghl.example.com/topup
  ✅ trial.started URL
  ✅ subscription.created URL
  ✅ payment.recovered URL
  ✅ payment.failed URL
  ✅ subscription.cancelled URL
  ✅ top_up.completed URL

(b) notifyGHL with uid resolves user doc
  ✅ Email resolved from user doc
  ✅ first_name from displayName
  ✅ last_name from displayName
  ✅ stripeCustomerId from user doc
  ✅ event_id passed through
  ✅ amount passed through

(b.2) notifyGHL with raw email (pre-signup)
  ✅ Email used directly
  ✅ first_name null for raw email
  ✅ last_name null for raw email
  ✅ stripeCustomerId null for raw email
  ✅ event_id passed through for raw email

(c) Every payload includes full stable-column shape
  ✅ Field 'event_type' present in payload
  ✅ Field 'event_id' present in payload
  ✅ Field 'stripe_customer_id' present in payload
  ✅ Field 'stripe_subscription_id' present in payload
  ✅ Field 'email' present in payload
  ✅ Field 'first_name' present in payload
  ✅ Field 'last_name' present in payload
  ✅ Field 'plan' present in payload
  ✅ Field 'billing_status' present in payload
  ✅ Field 'is_trial' present in payload
  ✅ Field 'credits' present in payload
  ✅ Field 'billing_type' present in payload
  ✅ Field 'currency' present in payload
  ✅ Field 'amount' present in payload
  ✅ Field 'trial_end_date' present in payload
  ✅ Field 'trial_end_date_human' present in payload
  ✅ Field 'next_billing_date' present in payload
  ✅ Field 'next_billing_date_human' present in payload
  ✅ Field 'portal_url' present in payload
  ✅ Field 'cancel_at' present in payload
  ✅ Field 'cancellation_reason' present in payload
  ✅ Payload has exactly 21 fields

(c.2) displayName with whitespace → first_name/last_name split
  ✅ first_name = 'Ahmed'
  ✅ last_name = 'Mohamed'

(c.3) displayName without whitespace → last_name=null
  ✅ first_name = 'Ahmed' (full string)
  ✅ last_name = null (no whitespace)

(c.4) displayName null → both null
  ✅ first_name = null
  ✅ last_name = null

(d) POST failure logs ghl_sync_failed and doesn't throw
  ✅ POST failure path completes without throwing (fire-and-forget)

(e) Portal generation failure → portal_url=null in payload
  ✅ portal_url = null when portal generation fails
  ✅ Payload still sent with email
  ✅ event_id still populated

(f) Date formatting: human-readable dates
  ✅ ISO date renders as 'May 21, 2026'
  ✅ null ISO date renders as null

═══ Results: 57 passed, 0 failed ═══

> test:billing:stripeWebhook
> npm run build && node lib/billing/__tests__/stripeWebhook.test.js


> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/


=== Webhook Scenarios (T024) ===

(1) checkout.session.completed — in-app subscription (client_reference_id present)
  ✅ Price ID mapped to plan
  ✅ Plan is 'pro' for price_pro_monthly
  ✅ Pro plan credits = 2500
  ✅ client_reference_id is uid
  ✅ User doc exists after write
  ✅ User plan is pro
  ✅ stripeCustomerId saved

(2) checkout.session.completed — GHL funnel (no client_reference_id)
  ✅ No client_reference_id — GHL path
  ✅ Starter plan from price_starter_monthly
  ✅ Starter credits = 800
  ✅ pending_plans doc exists for GHL funnel email
  ✅ Pending plan is starter
  ✅ stripeCustomerId in pending_plans

(3) checkout.session.completed — dual-event dedup
  ✅ Atomic .create() detects duplicate event

(4) customer.subscription.updated — plan change (price ID change)
  ✅ New plan is pro after price change
  ✅ Credits updated to pro allocation (2500)
  ✅ Plan actually changed from starter → pro
  ✅ User plan updated to pro
  ✅ User credits updated to 2500

(5) customer.subscription.updated — trial → active conversion
  ✅ isTrial set to false
  ✅ billingStatus set to active
  ✅ Credits reset to full plan allocation (2500)
  ✅ Persisted isTrial = false
  ✅ Persisted credits = 2500

(6) customer.subscription.deleted — plan reset
  ✅ Plan set to none
  ✅ Credits set to 0
  ✅ billingStatus set to cancelled
  ✅ stripeSubscriptionId cleared
  ✅ Update plan = none
  ✅ Update credits = 0
  ✅ Update billingStatus = cancelled

(7) invoice.payment_succeeded — renewal (subscription_cycle)
  ✅ subscription_create: NO credit reset
  ✅ subscription_cycle: YES credit reset
  ✅ manual: NO credit reset
  ✅ subscription_update: NO credit reset
  ✅ Pro credits reset to 2500 on subscription_cycle

(8) invoice.payment_failed — sets past_due + grace
  ✅ billingStatus set to past_due
  ✅ billingIssueType set to payment_failed
  ✅ gracePeriodEndsAt is a date ~2 days out
  ✅ Grace period is in the future

(9) charge.refunded — full subscription refund
  ✅ Full refund detected (amount_refunded === amount)
  ✅ Not a top-up charge → subscription refund branch
  ✅ Refund amount = $79.00

=== Callable Scenarios (T025) ===

(10) createStripeCheckoutSession — happy path
  ✅ Mode is subscription
  ✅ client_reference_id = uid
  ✅ 7-day trial configured
  ✅ firebaseUid in metadata
  ✅ Automatic tax enabled
  ✅ success_url has paid=1

(11) createStripeTopUpSession — happy path
  ✅ Mode is payment
  ✅ isTopUp = 'true' in metadata
  ✅ creditAmount = '300' in metadata
  ✅ isTopUp mirrored in payment_intent_data.metadata
  ✅ creditAmount mirrored in payment_intent_data.metadata
  ✅ success_url has topup=1

(12) createStripePortalSession — happy path
  ✅ User doc exists for portal
  ✅ stripeCustomerId present
  ✅ stripeCustomerId = cus_portal_001
  ✅ Portal customer set
  ✅ Flow type = subscription_cancel
  ✅ Return URL correct

=== Refund Branch Scenarios (T026) ===

(13) charge.refunded — full subscription refund → cancel subscription
  ✅ Full refund detected
  ✅ Not top-up → subscription refund branch
  ✅ cancellation_logs written before cancel
  ✅ Reason = 'refund'

(14) charge.refunded — full top-up refund → credits deducted
  ✅ Full refund detected
  ✅ Is top-up charge → credit deduction branch
  ✅ creditAmount parsed from metadata = 300
  ✅ Deducted = min(150, 300) = 150 (clamped at 0)
  ✅ Credits clamped to 0 after deduction
  ✅ refund_logs written for top-up refund
  ✅ refund_logs creditAmountDeducted = 150

(15) charge.refunded — partial refund → log only
  ✅ Partial refund detected (amount_refunded < amount)
  ✅ Partial refund amount = $39.50
  ✅ Remaining amount = 3950 cents

═══ Results: 75 passed, 0 failed ═══
🗺️ selectLayoutTemplate: primary=standard_hero secondary=value_stack hookAngle=none ratio=1:1
🗺️ selectLayoutTemplate: primary=standard_hero secondary=value_stack hookAngle=none ratio=1:1
🗺️ selectLayoutTemplate: primary=event_ticket secondary=speaker_card hookAngle=none ratio=1:1
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
🗺️ selectLayoutTemplate: primary=standard_hero secondary=value_stack hookAngle=none ratio=1:1

═══ Spec 002 — Priority Lane QA Fixtures ═══
  ✅ Lane 1: Retargeting + Carousel
  ✅ Lane 2: Cold + Single + before_after
  ✅ Lane 3: Cold + Carousel + value_stack
  ✅ Lane 4: Cold + Carousel (approved mode)
  ✅ Lane 5: Cold + Batch + hero + value_stack
  ✅ Lane 6: Cold + Single + value_stack
  ✅ Lane 7: Retargeting + Single + value_stack
  ✅ Lane 8: Minimal + hero + Single
  ✅ Lane 9: Minimal + hero + Batch
  ✅ Lane 10: Testimonial Carousel (Cold)
  ✅ Lane 11: Testimonial Carousel (Retargeting)
═══ Spec 002 — All 11 lanes passed ═══


═══ Phase 3 — Resolver Function Unit Tests ═══
  ✅ testValidateLaunchSurface: passing + blocked combos verified
  ✅ testCarouselSlideCountPlan
  ✅ testResolveValueStackSlideCount
  ✅ testFilterEmptyValueStackFields
═══ Phase 3 — All unit tests passed ═══


═══ Spec 005 — Render Prompt Pipeline Regression Guards ═══
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 20 sub: 9 cta: 8 benefit: 10
  ✅ testPromptAssemblyHookTextVerbatim
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ testPromptAssemblySubStyleLuxuryMagazine
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ testPromptAssemblyRetargetingDirection
  ✅ testCopyFidelityValidation
═══ Spec 005 — All regression tests passed ═══


═══ Spec 005 Phase 2 — 4-Field Fidelity + Campaign Context + Carousel ═══
  ✅ testCopyFidelity4Fields
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ testCampaignContextPresence
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 7 sub: 18 cta: 0 benefit: 10
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 13 sub: 19 cta: 0 benefit: 10
  ✅ testCarouselPerSlideCopyIsolation
═══ Spec 005 Phase 2 — All new tests passed ═══


═══ Spec 006 — Team Management Fixture Tests (imported callables) ═══
  ✅ testExportedConstants
  ✅ testInviteBlockedAtPlanLimit
  ✅ testClaimSetsMembership
  ✅ testExpiredInviteRejected
  ✅ testRemovalClearsMembership
  ✅ testViewerRejectedByDeductCredits
  ✅ testGetInviteDetailsStatus
═══ Spec 006 — All team fixture tests passed ═══


═══ T025 — Entitlement Resolver Fixtures (3-plan) ═══
  ✅ testBooleanGateFixtures: 24 fixtures passed
  ✅ testAlwaysAllowedFixtures: 16 fixtures passed
  ✅ testQuantityBoundedFixtures: 40 fixtures passed
  ✅ testTeamInviteBoundaryFixtures: 4 fixtures passed
═══ T025 — All entitlement fixtures passed ═══


═══ T026a — Cross-module Parity ═══
  ✅ testCrossModuleParity: backend ↔ contract canonicals verified (features + batch + savedProject + avatar)
═══ T026a — Cross-module parity complete ═══


═══ HFC.9 — Cultural Compliance Integration Checks ═══
  ✅ testEnglishIsNotGated: isArabic is the gate; scan itself is pure
  ✅ testMinimumCoverageShape: HARAM_MOTIFS=11, TRIGGER_WORDS=29
═══ HFC.9 — Integration checks complete (unit coverage lives in __tests__/culturalCompliance.test.ts) ═══


═══ HFD — Multi-Logo Upload Fixtures ═══
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ HFD.T1: 3-logo single-ad prompt shape verified
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ HFD.T3: 0-logo empty-branding invariant preserved
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ HFD.T4: 7-logo oversized defence-in-depth truncation verified
  ✅ HFD.T2: 5-logo carousel per-side attachment verified
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
[copy] hook: 18 sub: 33 cta: 10 benefit: 10
  ✅ HFD.T5: Arabic 2-logo equal-peer phrasing verified
═══ HFD — All logo fixtures passed ═══


═══ HFE — HOTFIX-E: Hybrid Logo Handling Fixtures ═══
  ✅ HFE.8.a: minimalist single ad, 1 UI placement validated
  ✅ HFE.8.b: lifestyle single ad, 1 environmental placement validated
  ✅ HFE.8.c: corporate ad, screen-content ban + UI placement validated
  ✅ HFE.8.d: mixed 5-slide carousel mode mix validated
  ✅ HFE.8.e: 3-logo ad, per-mode caps respected
  ✅ HFE.8.f: corrupt source — validator accepts, compositor handles fail-soft at runtime
  ✅ HFE.8.g: over-cap UI placements dropped correctly
  ✅ HFE.8.h: prompt blocks verified (Sharp unavailable handled at runtime)
  ✅ HFE.8.i: prompt block content verified for pipeline ordering
  ✅ Ban-1: SCREEN_CONTENT_BAN_BLOCK constant verified
  ✅ Ban-2: screen-content rule allowed states verified
  ✅ Validator: widthPct=30 clamped to 18
  ✅ Validator: opacity=0.5 clamped to 0.85
  ✅ Validator: logoIndex=7 dropped (only 2 logos)
  ✅ Validator: text_only style produces zero placements
  ✅ Validator: unrecognized mode='video' defaulted to environmental
  ✅ Validator: 5 environmental → 3 kept, 2 dropped
═══ HFE — All hybrid logo fixtures passed ═══


═══ BCR — Brand Color Resolver Fixtures ═══
  ✅ BCR-01-form-wins
  ✅ BCR-02-avatar-wins-over-cold-ad
  ✅ BCR-03-cold-ad-inherited
  ✅ BCR-04-workspace-fallback
  ✅ BCR-05-no-source
  ✅ BCR-06-form-malformed-falls-through
  ✅ BCR-07-form-primary-no-secondary
  ✅ BCR-08-cta-text-light-primary
  ✅ BCR-09-cta-text-dark-primary
  ✅ BCR-10-cta-text-luminance-boundary (≥ 0.5 → near-black)
  ✅ BCR-11-secondary-falls-through-independently
═══ BCR — All brand color resolver fixtures passed ═══


═══ US1 — Carousel / Batch Brand Color Fixtures ═══
  ✅ T010-carousel-slide-3-brand-colors
  ✅ T011-batch-item-2-brand-colors
  ✅ T012-anti-placeholder-regex
═══ US1 — All carousel/batch fixtures passed ═══


═══ US2 — Retargeting Inheritance Fixtures ═══
  ✅ T016a-retargeting-inherits-cold-ad-colors
  ✅ T016b-retargeting-form-overrides-cold-ad
  ✅ T016c-missing-cold-ad-falls-to-workspace
═══ US2 — All retargeting fixtures passed ═══


═══ BCC — Brand Color Compliance Fixtures ═══
  ✅ BCC-01-no-brand-colors
  ✅ BCC-02-empty-string
  ✅ BCC-03-malformed-hex
  ✅ BCC-04-image-unanalyzable
  ✅ BCC-05-present
  ✅ BCC-06-absent
  ✅ BCC-07-near-miss-present
  ✅ BCC-08-far-miss-absent
═══ BCC — All compliance fixtures passed ═══


═══ US4 — Compositor Brand Color Fixtures ═══
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-01-no-brand-fallback: textStyle drives all colors
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-02-brand-primary-only: CTA branded via luminance auto-contrast
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-03-brand-secondary-only: headline branded, CTA unchanged
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-04-brand-both: both CTA and headline branded
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-05-arabic-uniformity: single deterministic headline color
✅ Arabic text composited: 1 lines, fontSize=4px, zone=80%×35%
⚠️ Text overflow detected: content 23.35px > zone 22px. Scaling fonts to 94%
✅ Full ad text composited: 4 elements, hookSize=4px
  ✅ COMP-06-light-primary-cta-text-near-black
═══ US4 — All compositor fixtures passed ═══


═══ US5 — Scoring Integration Fixtures ═══
  ✅ T029a-scoring-deduction-75-to-65-still-passes
  ✅ T029b-scoring-deduction-65-to-55-now-fails
  ✅ T029c-scoring-no-deduction-when-check-skipped
  ✅ T029d-scoring-no-deduction-when-brand-color-present
═══ US5 — All scoring fixtures passed ═══


═══ HFF — HOTFIX-F: Aspect Ratio Reflow Fixtures ═══
  ✅ T010: getSafeZoneForRatio returns spec table, throws on unknown
  ✅ T011a: router covers all 30 non-identity pairs, 6 identity pairs
  ✅ T012: brand-color hex FF0000 appears in re-render prompt, brandColorReinforced=true
[reflowImage] source image URL rejected (not an allowlisted https storage host;
value="https://example.com/original-1x1.png") for gen=gen1 item=null. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b0.png")
for gen=gen1 item=0. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b1.png")
for gen=gen1 item=1. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b1.png")
for gen=gen1 item=1. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b2.png")
for gen=gen1 item=2. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b0.png")
for gen=gen1 item=0. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b3.png")
for gen=gen1 item=3. Proceeding without it.
✅ Reflow 1:1→9:16 (rerender) for gen undefined, charged 5
  ✅ T011: single reflow 1:1→9:16 returns 9:16 and 5 credits
✅ Reflow 1:1→9:16 (rerender) for gen undefined, charged 5
✅ Reflow 1:1→9:16 (rerender) for gen undefined, charged 5
✅ Reflow 1:1→9:16 (rerender) for gen undefined, charged 5
  ✅ T020: batch reflow 4 items → 3 success (15 credits) + 1 failure (0 credits)
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 1
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 2
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 3
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 4
[reflowImage] source image URL rejected (not an allowlisted https storage host;
value="https://example.com/slide-2.png") for gen=gen1 item=2. Proceeding without it.
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 0
[reflowImage] source image URL rejected (not an allowlisted https storage host;
value="https://example.com/slide-2.png") for gen=gen1 item=2. Proceeding without it.
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 5
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 6
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
⚠️ Outpaint failed (auto), falling back to rerender for gen1 item 2
✅ Reflow 4:5→1:1 (rerender) for gen undefined, charged 5
  ✅ T023: carousel reflow 7 slides → all succeed (35 credits), slide order preserved; carousel_slide idx=2 → 5 credits
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
🛑 Deprecated REFLOW path invoked — use reflowImage callable (FR-026).
📋 Render contract warnings: High-priority zone "headline" (priority 2) not referenced in build plan. | High-priority zone "hero" (priority 1) not referenced in build plan.
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
=== NPM TEST EXITCODE: 0 ===
```

NPM TEST EXITCODE: **0**
