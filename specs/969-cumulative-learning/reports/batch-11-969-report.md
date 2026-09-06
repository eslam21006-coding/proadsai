# Batch 11 — Test-chain repair + function deletion + guard widening

**Feature**: Cumulative Learning for Ad Performance (Phase 969)
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-06

Three items in this batch, executed in the order the reviewer specified:

1. **Repair the test chain.** The `npm test` chain in `functions/package.json` still
   referenced `learningAggregates.test.js` and `learningIntegration.test.js` whose
   `.ts` sources had been deleted in Batch 06. The chain only ran because stale
   compiled `.js` artifacts survived in the gitignored `lib/` directory. On a clean
   `Remove-Item -Recurse -Force lib; npm run build`, those `.js` files did not
   come back, and `npm test` exited 1 at the first missing module. Batch 11 removes
   the dead entries from both the named scripts and the main chain.

2. **Delete the two legacy functions properly.** `updateHookAggregates` and
   `updateVisualAggregates` were claimed as deleted in the Batch 06 deletion table,
   but the underlying source was left in place — only the test files were deleted.
   The misleading comment block that claimed a removal that did not happen is
   replaced with one that accurately records Batch 11's actual deletion.

3. **Widen the test-registration guard.** The Phase 969 guard detected drift in
   `src/__tests__/phase969/` only. The drift Batch 11 surfaced was outside that
   directory: three Stripe-migration billing tests under
   `src/billing/__tests__/` were never in the chain. The guard now scans the
   entire codebase and is wired as the first entry in the outer `npm test` chain.

Verification ran twice — once against the pre-fix tree (the failure case the
reviewer predicted), once against the post-fix tree (the green case the deliverable
requires).

---

## §1 — Pre-fix verification (the broken chain)

### §1.1 — Raw command and exit code

```powershell
PS D:\proads-worktrees\969-cumulative-learning\functions> Remove-Item -Recurse -Force lib
PS D:\proads-worktrees\969-cumulative-learning\functions> npm run build

> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

# BUILD EXITCODE: 0

PS D:\proads-worktrees\969-cumulative-learning\functions> npm test
```

Chain entry 42 (the first dead entry):

```
node:internal/modules/cjs/loader:1433
  throw err;
  ^

Error: Cannot find module
'D:\proads-worktrees\969-cumulative-learning\functions\lib\__tests__\learningAggregates.test.js'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1430:15)
    ...
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v22.22.3
```

```
NPM TEST EXITCODE: 1
```

The chain ran 41 entries successfully (clean rebuild + every test that has a `.ts`
source), then died on the first dead entry. **EXITCODE: 1.**

### §1.2 — Mechanically-derived audit of every chain entry

The reviewer asked whether any other `node lib/...` entry in the `test` chain
points at a `.js` file with no corresponding `.ts` source. Derived mechanically
by extracting every `node lib/<path>.test.js` reference from `functions/package.json`,
mapping each to its expected `src/<path>.test.ts`, and checking `Test-Path`:

| Chain | Entries | Present `.ts` | Missing `.ts` |
|---|---|---|---|
| `npm test` (outer) | 56 | 54 | **2** |
| `npm run test:phase969` (sub-chain) | 10 | 10 | 0 |

The two missing `.ts` sources, and only these two, are:

```
js                                              expectedTs
lib/__tests__/learningAggregates.test.js        src/__tests__/learningAggregates.test.ts
lib/__tests__/learningIntegration.test.js       src/__tests__/learningIntegration.test.ts
```

The `phase969/` sub-chain (covered by the existing guard) was clean. Nothing
else in the outer chain was affected.

---

## §2 — Item 1: Repair the chain

### §2.1 — Changes to `functions/package.json`

- Removed the two dead named scripts:
  - `"test:phase14:learningAggregates": "npm run build && node lib/__tests__/learningAggregates.test.js"`
  - `"test:phase14:learningIntegration": "npm run build && node lib/__tests__/learningIntegration.test.js"`
- Removed the same two entries from the `test:phase14` aggregator chain.
- Removed the same two entries from the outer `test` chain
  (`node lib/__tests__/learningAggregates.test.js && node lib/__tests__/learningIntegration.test.js`
  between `qararEngine.test.js` and `imageMatching.contract.test.js`).

Post-fix audit (`node lib/...test.js` references in `package.json` mapped to
`.ts` sources): **112 / 112 present, 0 missing.**

### §2.2 — Clean-build verification (item 1 alone)

```powershell
PS D:\proads-worktrees\969-cumulative-learning\functions> Remove-Item -Recurse -Force lib
PS D:\proads-worktrees\969-cumulative-learning\functions> npm run build
# BUILD EXITCODE: 0
PS D:\proads-worktrees\969-cumulative-learning\functions> npm test
# NPM TEST EXITCODE: 0
```

The chain now passes from a clean `lib/`. (Stale artifacts are no longer masking
the deletion.)

---

## §3 — Item 2: Delete the two functions properly

### §3.1 — Pre-deletion call-site grep (excluding tests)

`grep -rn "updateHookAggregates\|updateVisualAggregates\|HookAccumulator\|VisualAccumulator\|emptyHookAggregateFor\|emptyVisualAggregateFor" functions/src/ --exclude=*__tests__*`:

```
learningAggregates.ts:6:   //   - `updateHookAggregates(ads, hookDocs)` → Map<canonicalAngle, HookAggregate>
learningAggregates.ts:7:   //   - `updateVisualAggregates(ads, visualDocs)` → Map<patternKey, VisualAggregate>
learningAggregates.ts:191: // `updateHookAggregates` and `updateVisualAggregates` were the legacy
learningAggregates.ts:229: export function updateHookAggregates(
learningAggregates.ts:238:     const acc = new Map<string, HookAccumulator>();
learningAggregates.ts:246:         const a: HookAccumulator = existing_agg ?? {
learningAggregates.ts:287:     const agg: HookPerformanceAggregate = emptyHookAggregateFor(angleKey);
learningAggregates.ts:323: interface HookAccumulator {
learningAggregates.ts:341: function emptyHookAggregateFor(angleKey: string): HookPerformanceAggregate {
learningAggregates.ts:371: // `updateHookAggregates`. The result is computed entirely from `ads`;
learningAggregates.ts:375: // `updateHookAggregates` for the determinism rationale.
learningAggregates.ts:377: export function updateVisualAggregates(
learningAggregates.ts:383:     const acc = new Map<string, VisualAccumulator>();
learningAggregates.ts:393:         const a: VisualAccumulator = acc.get(patternKey) ?? {
learningAggregates.ts:437:     const agg: VisualPerformanceAggregate = emptyVisualAggregateFor(patternKey);
learningAggregates.ts:470: interface VisualAccumulator {
learningAggregates.ts:486: function emptyVisualAggregateFor(patternKey: string): VisualPerformanceAggregate {

learning\aggregateDelta.ts:24: // The existing `updateHookAggregates` / `updateVisualAggregates`
```

All 18 hits are in two files:
- 17 in `learningAggregates.ts` itself (the file containing the function bodies,
  helpers, types, and the misleading comment block).
- 1 in `learning/aggregateDelta.ts` (a single comment reference).

**Both function names are 100% unused outside their own source file.**

### §3.2 — Deletions

`learningAggregates.ts` is rewritten. Removed:

- `updateHookAggregates` (function body)
- `updateVisualAggregates` (function body)
- `HookAccumulator` (interface)
- `VisualAccumulator` (interface)
- `emptyHookAggregateFor` (function)
- `emptyVisualAggregateFor` (function)
- `isEligibleForLearning` (function — only called by the two deleted functions)
- `round2` (function — only called by the two deleted functions; a separate
  unrelated `round2` exists in `cpaEconomics.ts`)

Kept (real exports / types still consumed by `metaSync/shared.ts`,
`ragContext.ts`, `aggregateDelta.ts`, `decideAdWriteActions.ts`,
`learningPerAdLoop.ts`, `ragContext.test.ts`, `ragInjection.test.ts`):

- Type exports: `LearningVerdict`, `HookPerformanceAggregate`,
  `VisualPerformanceAggregate`, `AdForLearning`
- Function exports: `computePatternKey` (used by `shared.ts`'s worker call)
- Private helper: `djb2Hash` (used by `computePatternKey`)

The file's header comment block is also rewritten. The previous version said
*"The worker in `metaSync/shared.ts` reads the existing aggregate docs, builds
a list of `AdForLearning` from the ad-loop results, and calls: updateHookAggregates
/ updateVisualAggregates…"* — that was the source of the misleading claim that
the functions were the worker's call sites. They never were; the worker calls
`applyHookAggregatesDelta` / `applyVisualAggregatesDelta` in `aggregateDelta.ts`.
The new header accurately describes what the module now exports and notes
the Batch 11 deletion of the legacy functions.

### §3.3 — Comment block in `learning/aggregateDelta.ts`

The `aggregateDelta.ts` file header contained a comment block (lines 22–36) that
said:

> *"The existing `updateHookAggregates` / `updateVisualAggregates` functions in
> `learningAggregates.ts` keep their OVERWRITE contract because: they are tested
> in `learningAggregates.test.ts` for OVERWRITE semantics … and `ragContext.ts`
> consumes their OVERWRITE-style output for RAG retrieval … Adding the ADDITIVE
> semantics as separate functions lets the worker … use cumulative deltas while
> the existing surface stays intact. Future batches can migrate the tests and
> ragContext to the additive path; that is a separate change."*

That comment is wrong on three counts post-deletion: the legacy functions do not
exist; the legacy tests do not exist; and `ragContext.ts` does not consume them
(it consumes the types from `learningAggregates.ts`, which we kept). Replaced with
a comment block that accurately describes the additive aggregators as the only
aggregation path in this codebase and notes that this batch retires the legacy
code.

### §3.4 — Clean-build verification (item 1 + item 2)

```powershell
PS D:\proads-worktrees\969-cumulative-learning\functions> Remove-Item -Recurse -Force lib
PS D:\proads-worktrees\969-cumulative-learning\functions> npm test
# NPM TEST EXITCODE: 0
```

Full chain passes from a clean `lib/` after the function deletion. No test relies
on the deleted exports.

---

## §4 — Item 3: Widen the registration guard beyond `phase969/`

### §4.1 — Why widen

The Phase 969 guard (`src/__tests__/phase969/phase969RegistrationGuard.test.ts`)
checked only files under `src/__tests__/phase969/`. Batch 11's first run of the
widened guard caught real drift outside that directory: three Stripe-migration
billing tests under `src/billing/__tests__/` (`billingState.test.ts`,
`ghlBillingSync.test.ts`, `stripeWebhook.test.ts`) were never in the chain. They
exist in `src/`, they have a non-trivial test runner output, they were committed
in 6e3ae71 (the Stripe migration), and they have been running **outside** the
chain since Batch 06 — that is the same class of failure mode as the
`learningAggregates`/`learningIntegration` drift, just on the "added a test, forgot
to wire it" side instead of the "deleted a test, forgot to remove the entry" side.

### §4.2 — What changed

The phase969-scoped guard is replaced by a chain-wide guard:

- **Old file**: `src/__tests__/phase969/phase969RegistrationGuard.test.ts`
  (deleted; not part of `lib/` rebuild, so `git rm` was a clean deletion).
- **New file**: `src/__tests__/testRegistrationGuard.test.ts`

The new guard keeps the same diff function (`diffTestRegistrations`), the same
five self-test cases (the synthetic inputs that pin both mismatch directions),
and the same `process.exit(1)` failure shape. The production inputs widen:

| Inputs (old) | Inputs (new) |
|---|---|
| Files: `readdirSync(src/__tests__/phase969)` → `.test.ts` | Files: recursive walk of `src/` (incl. `__tests__/`, `__tests__/phase969/`, `billing/__tests__/`, etc.) + top-level `src/*.test.ts` |
| Chain: regex over `test:phase969*` scripts only | Chain: regex over **every** script string in `package.json` |
| Path root: `src/__tests__/phase969/` (one level under `__tests__/`) | Path root: `src/` (full codebase under the functions tree) |

Two bugs caught and fixed during the widening:

1. **Recursive walk lost the original root.** The first version called
   `walkTestFiles(full)` on each subdirectory, which re-rooted the path
   computation and flattened every path to its basename. Fixed by threading the
   original `SRC_DIR` through the recursion.
2. **`FUNCTIONS_DIR` resolved to the repo root.** The new guard file lives one
   level shallower than the phase969-scoped one (`src/__tests__/` rather than
   `src/__tests__/phase969/`), so the original `resolve(ownCompiledPath, "..",
   "..", "..", "..")` over-shot into the repo root and the walk read the
   FRONTEND `src/` directory. Fixed to `resolve(__dirname, "..", "..")` (3 levels
   up = `functions/`).

### §4.3 — Wiring changes in `functions/package.json`

- Removed: `"test:phase969:registration": "node lib/__tests__/phase969/phase969RegistrationGuard.test.js"`
- Added: `"test:registration": "npm run build && node lib/__tests__/testRegistrationGuard.test.js"`
- Added: `"test:billing:state"`, `"test:billing:ghlSync"`, `"test:billing:stripeWebhook"`, plus the aggregator `"test:billing"` — the three tests the wider guard caught as missing-from-chain.
- Outer `test` chain updated:
  - **First entry** is now `npm run test:registration &&` (the wider guard runs
    before every other test).
  - `npm run test:phase969` no longer contains the registration script (that
    role moved to the top-level `test:registration`).
  - `npm run test:billing` is spliced in after `npm run test:phase969` and
    before `node lib/contractFixtures.test.js`.

Post-fix audit (`node lib/...test.js` references in `package.json` mapped to
`.ts` sources): **115 / 115 present, 0 missing.** The wider guard reports the
same number on a re-run from clean `lib/`.

### §4.4 — Clean-build verification (items 1 + 2 + 3)

```powershell
PS D:\proads-worktrees\969-cumulative-learning\functions> Remove-Item -Recurse -Force lib
PS D:\proads-worktrees\969-cumulative-learning\functions> npm test
# NPM TEST EXITCODE: 0
```

Full chain passes from a clean `lib/` with the wider guard running first, the
three newly-registered billing tests running in their slot, and the rest of
the chain unchanged. (Full tail with exit code at the bottom of this report.)

---

## §5 — T025a status re-verification

Per the reviewer's note in the batch brief, T025a's task entry has been updated.
The `decidePerAdActionsForWorker` function in
`functions/src/learning/learningPerAdLoop.ts` populates `ledger.angleKey` and
`ledger.patternKey` from `resolvedHookAngle` / `resolvedPatternKey` when given
resolved values — `perAdActions.test.ts` shows this with 4 of the 11 assertions
being T025a discriminator checks. **The function is correct in isolation.** But
the worker-side `writes.push(...)` call in `metaSync/shared.ts` still spreads
the operational-only shape, so the live ledger entries are written with
`angleKey: null` and `patternKey: null`.

The T025a entry in `tasks.md` (line 111) was edited to record this state
explicitly. The shape is the same as T021a was before Batch 09's wire-up: the
function in isolation is correct, the integration has not been wired. T029a,
T029b, T029c entries are recorded as standalone lines (lines 134, 135, 136)
from Batch 10; their status notes are unchanged.

---

## §6 — What changed in this batch

Six files:

- `functions/package.json` — chain repaired (item 1), wider guard registered at
  the head of the outer chain (item 3), three billing tests added (`test:billing:*`
  scripts and aggregator).
- `functions/src/learningAggregates.ts` — legacy OVERWRITE functions and private
  helpers deleted (item 2); type exports and `computePatternKey` preserved;
  misleading header rewritten.
- `functions/src/learning/aggregateDelta.ts` — comment block that referenced
  the now-deleted functions rewritten to describe the current state.
- `functions/src/__tests__/testRegistrationGuard.test.ts` — new chain-wide guard
  replacing the phase969-scoped one.
- `functions/src/__tests__/phase969/phase969RegistrationGuard.test.ts` — deleted
  (replaced by the chain-wide version).
- `specs/969-cumulative-learning/tasks.md` — T025a entry updated with Batch 10
  and Batch 11 status notes (re-verification of work not done).

One batch report (this file) per Rule 0a.

---

## §7 — Items that were not changed (and why)

- `learningAggregates.ts` types (`HookPerformanceAggregate`,
  `VisualPerformanceAggregate`, `AdForLearning`, `LearningVerdict`) — preserved.
  They are consumed by `aggregateDelta.ts`, `ragContext.ts`,
  `decideAdWriteActions.ts`, `learningPerAdLoop.ts`, `shared.ts`, and the
  frontend via `knowledge/` mirrors.
- `computePatternKey` / `djb2Hash` — preserved. `shared.ts` still imports
  `computePatternKey` (the import is currently unused inside the worker body,
  but the contract is part of the public surface).
- `metaSync/shared.ts` `computePatternKey` import — currently a dead import
  (the post-Batch-05 worker calls `applyHookAggregatesDelta` /
  `applyVisualAggregatesDelta` instead of computing its own pattern keys).
  Not removed in this batch; that is a separate cleanup.
- The OVERWRITE-vs-additive contract tension in `aggregateDelta.ts` header —
  gone (the header now describes the additive path as the only one).
- T021a, T029a, T029b, T029c status — unchanged from Batch 10. They are still
  recorded as standalone entries; they are still NOT STARTED; the live aggregates
  still count ad rows, not creatives.

---

## §8 — Raw output — `git diff --stat HEAD~1` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" diff --stat HEAD~1
```

## §9 — Raw output — `git status --short` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" status --short
```

## §10 — Raw output — full `npm test` tail with exit code (clean build)

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ Remove-Item -Recurse -Force lib
$ npm test
```

(Full output is in `C:\temp\opencode\batch11-fix3d-npmtest.txt` on this host;
the tail below is the final contract-fixtures pass + the exit-code line.)

```
...

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

[... 75 stripeWebhook assertions ...]

═══ Results: 75 passed, 0 failed ═══

[... Spec 002 / Phase 3 / Spec 005 / Spec 005 Phase 2 / Spec 006 / T025 / T026a /
     HFC.9 / HFD / HFE / BCR / US1 / US2 / BCC / US4 / US5 / HFF / Phase 16 fixtures ...]

═══ Phase 16 — Creative Modes & Art Direction QA Fixtures ═══
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

---

## §11 — Audit numbers (the chain-wide guard's own output)

When the wider guard runs against a clean `lib/`, it prints its own audit:

```
Chain-wide test-registration guard — production check
──────────────────────────────────────────────────────────────────────────────
Test files on disk (68, src-relative): 68 entries listed
Expected chain entries (68, lib path): 68 entries listed
Chain entries parsed from functions/package.json (68): 68 entries listed
──────────────────────────────────────────────────────────────────────────────
OK: every file on disk is in the chain, and every chain entry has a file on disk.
```

The three numbers all agree at **68**. The previously-orphaned billing tests
(`lib/billing/__tests__/*.test.js`) are now in both lists; the previously-
dangling `learningAggregates.test.js` / `learningIntegration.test.js` entries
are gone from both lists.

Per-fixture breakdown:

| Surface | Count | Notes |
|---|---|---|
| `src/__tests__/*.test.ts` (top-level, incl. phase969/) | 62 | recursive walk |
| `src/billing/__tests__/*.test.ts` | 3 | newly-registered |
| `src/*.test.ts` (top-level — contractFixtures, failureClassification, languageQuality) | 3 | already in chain, count unchanged |
| **Total** | **68** | matches chain-entry count |

All 115 `node lib/...test.js` references in `functions/package.json` map to
present `.ts` sources. No drift.
