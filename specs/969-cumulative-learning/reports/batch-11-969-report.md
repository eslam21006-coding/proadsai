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
 functions/package.json                             |  14 +-
 ...Guard.test.ts => testRegistrationGuard.test.ts} | 204 +++++----
 functions/src/learning/aggregateDelta.ts           |  24 +-
 functions/src/learningAggregates.ts                | 374 +---------------
 .../reports/batch-11-969-report.md                 | 475 +++++++++++++++++++++
 specs/969-cumulative-learning/tasks.md             |   2 +-
 6 files changed, 647 insertions(+), 446 deletions(-)
```

## §9 — Raw output — `git status --short` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" status --short
```

(no output — clean working tree)

## §10 — Raw output — full `npm test` tail with exit code (clean build)

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ Remove-Item -Recurse -Force lib
$ npm test
```

(Full output captured at `C:\temp\opencode\batch11-fix3d-npmtest.txt` on this
host. Tail below is the final chain steps + exit code.)

```
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
🗺️ selectLayoutTemplate: primary=standard_hero secondary=value_stack hookAngle=none ratio=1:1
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
🗺️ selectLayoutTemplate: primary=standard_hero secondary=none hookAngle=none ratio=1:1
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
  ✅ HFD.T2: 5-logo carousel per-slide attachment verified
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
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b2.png")
for gen=gen1 item=2. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host; value="https://example.com/b3.png")
for gen=gen1 item=3. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host;
value="https://example.com/slide-0.png") for gen=gen1 item=0. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host;
value="https://example.com/slide-1.png") for gen=gen1 item=1. Proceeding without it.
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
[reflowImage] source image URL rejected (not an allowlisted https storage host;
value="https://example.com/slide-3.png") for gen=gen1 item=3. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host;
value="https://example.com/slide-4.png") for gen=gen1 item=4. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host;
value="https://example.com/slide-5.png") for gen=gen1 item=5. Proceeding without it.
[reflowImage] source image URL rejected (not an allowlisted https storage host;
value="https://example.com/slide-6.png") for gen=gen1 item=6. Proceeding without it.
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
=== NPM TEST EXITCODE: 0
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
