# Issue 969 — Cumulative Learning — Implementation Log

**Branch**: `969-cumulative-learning` (PR #71, shipped) → `969-phase-4`
(continuation, in progress at the time of this consolidation)
**Date of consolidation**: 2026-09-19
**Two-PR shape**: this log covers both. Each section names which.

A 20-minute read for a new developer who has not seen the feature
before, written so the next person can understand the feature, the
locked decisions, the traps, and where the work stands now without
reading the 51 batch-reports archived in git history.

The feature itself is described first in plain language; then the
owner-locked decisions that every reviewer needs to know not to
re-litigate; then the defects that surfaced and how each was caught
(reading the code, not running tests, was the larger of the two);
then the verification methods that repeatedly worked; then the
stated limitations and the production baseline.

---

## 1. What the feature does

Learning aggregates no longer overwrite on every sync. Evidence
accumulates all-time across the account's whole history, even when
the owner changes funnel economics or runs a partial sync.

### The defect it fixed

Before this feature, every time the system synced an owner's ad
account it **rebuilt** the learning record from scratch: looked at
the ads it just fetched, tallied which ones performed well, and
**overwrote** the previous totals. Nothing that was learned yesterday
survived a sync today. The owner explained the defect in their own
words:

> *"I don't want to be working on a low-ticket funnel and having an
> amazing learning experience, only to have everything reset once
> I switch to another funnel."*

### The four parts

The fix has four parts, all of which shipped in PR #71 or are
shipping in PR #71's continuation (the Phase 4 remainder):

1. **Cumulative accumulation.** Every sync *adds* to the totals. The
   totals never shrink, even if a sync covers only part of the
   account (FR-020's never-decreases), and even if the cost target
   changes (FR-010).

2. **Sealed evaluation context.** The moment an ad is judged, the
   cost target, the funnel type, and the timestamp are written
   onto the ad's record and locked there. They cannot be overwritten
   by a later settings change (FR-001, FR-005c's one-way PROVISIONAL
   → SEALED guard).

3. **Idempotent counting.** Each ad carries a `ledger` entry
   recording exactly what it has already contributed. On every
   sync, the system compares "what should I contribute now" against
   "what did I contribute last time" — and either adds, does
   nothing, or withdraws-then-adds (FR-017's four-outcome decision
   table). An ad counted three times in three syncs counts once.

4. **The creative as the unit of evidence.** Meta assigns each
   placement of the same image its own ad row, so one image can
   show up as 55 rows. Grouping rows by `imageHash`, propagating
   any generation link within the group, merging groups on shared
   `generationId`, and counting once per creative (FR-073) means
   one image counts as one piece of evidence, no matter how many
   placements it ran in.

A second ride-on figure ships with this: the **efficiency figure**,
a single number per creative that compares realised cost per result
to the sealed target. It is target-normalised, so 0.6 on a $12 lead
funnel and 0.6 on a $200 product funnel are literally the same
number — which is what makes the figure usable as a cross-funnel
comparison and lets learning transfer between funnels (FR-002a,
FR-032a).

### The cumulative gates that decide which learnings count

Three gates, each **counted in distinct creatives** (not rows) per
the owner-locked decision (FR-073):

| Gate | Value | What it gates | Lives at |
|---|---|---|---|
| **Activation** (FR-034, FR-035) | 10 distinct creatives | Turns guidance on for the AI's creative generation; latches on permanently | `ragContext.ts` (read by `getTopWinners`) |
| **Per-item floor** (FR-034a) | 3 distinct creatives | A top-performer slot can be mentioned to the AI | `rankingEngine.ts` and `whatsWorkingDashboard.ts` |
| **Efficiency-evidence** (FR-037) | 3 distinct creatives carrying a sealed efficiency figure | Efficiency actually influences ranking | `rankingEngine.ts` (efficiency half blocked on Phase 4) |

The owner-locked decision is **10/3/3 counted in creatives**, **not**
in ad rows. At the observed fan-out of 7.4:1 (largest account) that
makes each gate roughly seven times harder to reach than under row
counting. The 10 retention is deliberate, not by default — the
owner accepted a delay because row counting let one observed 55-row
creative **clear the floor by itself**, defeating FR-034a's purpose
entirely.

### What accumulates vs what does not

| Measure | Accumulates? | Threshold | Notes |
|---|---|---|---|
| Usage / impression count | yes | — | every row's contribution is counted once (FR-015) |
| Click-through (avgLinkCtr) | yes | additive-mean | derived from raw sums+counts (FR-021, FR-022) |
| Cost-per-thousand (avgCpm) | yes | additive-mean | same |
| **Efficiency figure** (cost-per-result ÷ sealed target) | **yes, write-once** | **5 combined conversions** OR stopped-with-≥1 | contributed exactly once per creative (FR-077, FR-079, FR-080); never revised (FR-011(a) narrowed) |
| Per-creative result total (FR-077(a)) | yes, monotonic | derived | sum of `finalisedTotal + Σ days` across the creative's rows (FR-084a bounded) |

### What does not reach the AI yet

The shipped ranking path reads `avgLinkCtr`, `creativeCount`, and
the verdict mark. **The efficiency figure does not yet reach ranking
and FR-037's efficiency half is not yet enforced** — Phase 4 builds
the efficiency-figure pipeline; the read-side consumer in
`getTopWinners.ts` lands in Batch 4.

---

## 2. The locked decisions, and why

These are owner-locked. Eight in total. Re-litigating any of them
is a substantive change, not an implementation choice.

### Why no epoch partitioning (FR-015)

Partitions that reset on funnel-type change were rejected up front:
they destroy the accumulated value the feature exists to preserve.
The headline `creativeCount` is the all-time count, computed across
every funnel the owner has ever run.

### Why no backfill, no migration (FR-042–FR-045)

There are no active users. Existing aggregate records carry frozen
counts whose original target is unrecoverable. They are **retired,
not converted** — below-version reads return absent and first-write
replaces in full. A deliberate production test was run on
`act_1180773537404268`'s `pain` aggregate: pre-969 `count: 5` →
post-969 `count: 32` (the doc was **updated in place**, not retired).
This contradicted the spec's literal "retire don't convert" wording
but matched its **intent**: old data does not block new writes, and
no historical contribution is recomputed. The squash message
documents this as the truthful behaviour.

### Why upward-only day revision (FR-083)

A Meta revision can be either upward or downward. If we accepted
both, FR-020's "no count ever decreases" guarantee would carry an
exception — and exceptions are how the guarantee gets violated
silently and never recovered. The fix was to make the guarantee
unconditional (no count ever decreases for any reason) at the
accepted cost that **an over-counted day stays over-counted
permanently**. The accepted cost is rare (downward Meta revisions
are infrequent; deduplication, fraud filtering and late correction
account for most cases). The forward tool for quantifying the
trade-off is recorded in the `quickstart.md` follow-up section,
which the operator runs across successive syncs once per-day figures
exist. **(Phase 4 batch 1 is the first thing to store per-day
figures, so the follow-up becomes actionable only after Batch 1
ships.)**

### Why threshold of 5 conversions (FR-077)

At 2 conversions, one lucky sale halves the apparent cost per
result. At 5, an outlier moves the figure by roughly 20%, which sits
under the existing 3.0 bound (FR-038) and is tolerable. At 10
almost nothing on a Gulf coaching account would qualify. The 5 is
the point at which the figure is worth recording and still
reachable. The clause is **combined** across the creative's
placements and **the threshold's fifth may arrive on a different
row** than the first four.

### Why the 10/3/3 gates count distinct creatives (FR-034/034a/037)

Across `act_995888422231015`, the fan-out is 7.37:1 (383 rows → 52
creatives, largest single creative spanning 55 rows); across both
connected accounts the average is 6.90:1 (1008 rows → 146
creatives). At that fan-out, **row counting means a single creative
clears every gate by itself**. The 55-row `pain` creative in
`act_1180773537404268` clears a 10-row activation threshold with
seven rows of evidence to spare. The per-item floor of 3 (then 3
rows, now 3 creatives) exists to prevent exactly this; row counting
made that floor decoration. **The owner accepted the 7.4× delay
in activation** this causes; the alternative is thinner evidence.

### Why aggregate-then-divide for the efficiency figure (FR-002a)

Sum cost and results across the creative's rows, divide cost by
results **once**, then divide by the sealed target. Divide-then-
average would weight a one-result placement identically to a
fifty-result one. Across a 55-row creative that is a one-result
placement outweighing fifty — exactly the fluke-domination problem
FR-038 bounds at 3.0.

### Why `funnelType` is weighting, never exclusion (FR-030/031/032a)

Evidence gathered under one funnel is **directly comparable** to
evidence under another (because the efficiency figure is target-
normalised). Suppression or filtering on funnel type would
contradict this — a record that earned its keep must be searchable
from any funnel's perspective. The unknown bucket (FR-032)
receives no same-funnel weighting boost but is still counted in
totals and surfaced in retrieval; it is weak evidence, never
disqualifying evidence. **A `byFunnelType` weighting path that
consumed `count` (rows) instead of `creativeCount` (creatives)
would re-create the 7.4:1 inflation** — the Batch 18 note in
`tasks.md` warned of this and the fix (parallel
`byFunnelTypeCreativeCount`) is still pending.

### Why no near-hash clustering (FR-074b limitation)

Clustering rows against each other by perceptual distance is
**non-transitive** (A close to B, B close to C, A not close to C).
Without a well-defined grouping, it merges genuinely distinct
creatives — a worse failure than splitting one. **State-of-the-art
deliberately rejects it.** The cost is that two unlinked hash
groups that are genuinely one creative never merge, and the
distinct-creative count inflates. The acceptance is recorded
against FR-034's PROVISIONAL review trigger.

---

## 3. The defects found and how each was caught

Six defects shaped this feature. Three were found **by reading
code against a requirement** (audits); three were found **by
tests that demonstrated a bug** (fail-then-pass pairs). The pattern
matters: code-reading found things that the green suite was
silent about, and the suite caught what code-reading would have
missed.

### Defects found by reading

**1. The withdrawal average subtracted the mean, not the row's
own value.** (FR-021, Fix A.)

`applyHookAggregateWithdrawal` decremented `count` and left
`avgLinkCtr` untouched, with a comment deferring the average
re-derivation "because it depends on the underlying values". The
comment was a thought-terminating cliché — the value was being
passed in and ignored (`applyLearningWrites.ts:237` hands the
function `ctrLink: withdraw.contributedValues.ctrLink` from the
ledger). The defect lived for twenty-seven batches because the
suite drove ten identical runs (the SC-002 test, which takes the
`noop` path and never withdraws). **The first cycle test A3
demonstrated the drift:** `[0.05, 0.06, 0.07, 0.08, 0.08]` over five
cycles of a 0.09 ad against a `{0.01, 0.01, 0.01, 0.09}` cohort,
true mean 0.0300. The mean climbs geometrically by `(A − M)/n`
per sync toward the cycling ad's value. Why "toward A" not "toward
the mean": every direction prediction in the audit was wrong once
empirically, and the corrected directional read is recorded there.

**2. `creativeCount` counted creative-sync-observations, not
distinct creatives.** (FR-036, Fix B.)

The dedup `Set` was stripped before persisting and re-initialised
**empty** on read. Withdrawal never decremented it. Growth:
+1 per creative per sync, unbounded. The owner-locked 10-creative
activation gate silently read creative-**nights**, not creatives.
Same family of bug as defect 1 — a plausible comment deferred the
fix. Fix: persist the keys as `contributedCreativeKeys` and derive
`creativeCount` from their length; the two cannot disagree.

**3. The visual withdrawal was keyed by `hookAngle` and looked up
by `patternKey`. The two key spaces never intersect.** (Bug 1, Batch 26.)

`applyVisualAggregateWithdrawal` was written, exported and
unreachable. `agg.patternKey` is a composite from `computePatternKey`
(layout × modes × art direction × universe, djb2-hashed);
`agg.angleKey` is a canonical hook id. `withdrawalByAngle.get(
agg.patternKey)` returned undefined for every visual aggregate,
every time. **Hidden by green BATCH 21 item 2** which asserted only
the hook side; no test asserted visual withdrawal. **The reviewer's
verbatim diff for Batch 25 caught this — the summary in Batch 23's
report described the function as "consult + read + withdrawal +
additive + commit", accurate at the file level, false in detail.**

These three were all **self-documented in the code as deferred** —
the comment at `aggregateDelta.ts:271-275`, the note at `:379-387`,
and the doc-comment for `applyVisualAggregateWithdrawal`. The
comments let the defects read as deliberate trade-offs for twenty
batches of review. Bug 2 of the same Batch 26 fix (a header comment
citing the wrong file) and bug 3 (a commit failure swallowed into
`errors[]` while `ran: true` was returned) were found the same way
— by walking the code at the line the comment pointed at.

### Defects found by tests

**4. The same WRONG second behaviour at once.** (Batch 29, the add/
withdraw symmetry invariant.)

A purge-audit pair-by-pair found `bestVerdictCount` and
`worstVerdictCount` were **added** by `applyAdToVisual` but **never
subtracted** by `applyVisualAggregateWithdrawal`. Five cycles of one
🟢 creative reported six wins. Two kinds of breach are defects:
withdrawal subtracts what the addition never adds (the counter
floors at zero), and addition adds what the withdrawal never
subtracts (the counter inflates). Both are silent because neither
ever errors. The paired cycle test is the durable guard.

**5. The visual `creativeCount` was always 0.** (Batch 30.)

`VisualPerformanceAggregate.creativeCount` was declared on the
type but **never populated**. The dashboard's `pickHotAngle` reads
it, falls back to 0 via the existing `?? 0` operator, and silently
returns `null` for `visualHotKey`. No visual pattern could
receive the 🔥 icon whatever its evidence — a dashboard defect
that did not error, only under-decorated. V9 and V10 are a pair
that pin it (V9 opens the gate, V10 proves fan-out cannot).

**6. The hashless fallback key collapsed distinct rows.** (Batch 19,
Item 3.)

`patternSummaries.ts:417` keyed the per-bucket dedup `Set` on
`__legacy_${r.userId}_${b.n}` — distinct hashless rows from the
same user in the same angle bucket collapsed to one Set entry,
undercounting `creativeCount` in the dashboard. Fix: append
`r.adId`. Easy to miss because `r.adId: string` was not yet a
required field — the discriminator lived in a default-branch
fallback. The test pair (a behavioural key-uniqueness case +
a structural case that reads source for the fixed string shape)
together catch it.

### The ledger consult that was wired into the worker but tested
in isolation (defect #7, Batch 19, Item 2)

`decideContribution` (T017) was defined, exported and tested in
`learning/contributionLedger.ts` — but never **called** from the
worker. The aggregator's per-creative Set deduplicated
`creativeCount`, but per-row `byObjective.conversion.count`
re-added the same row on every sync, doubling it on each pass. The
test-only contract passed; the production behaviour drifted. The
shape of this defect is the one reading-the-code catch family does
*not* protect against — the unit was built, the unit's tests passed,
the unit was on the shelf. **The fix lives at the consumer site
(matched a hook+visual call after the post-pass generation
patch), not in the unit's surface.** Reviews against "what did the
unit's tests say" alone would have green-checked the worker path
forever.

### Eight pre-existing defects recorded at scan time, four caught
and shipped in the same PR (Batches 28/29/30/Fix A and B)

The two nightly defects (#1 FR-021 withdrawal drift and #2 FR-036
creative count inflation), the visual-withdrawal deadlock (#3), the
commit-failure swallowing (#4) — four caught during the prior PR's
scope audit and fixed as merge-blockers. The remaining four
count-asymmetry defects in `applyVisualAggregateWithdrawal`
(`sampleSize`, `byGeoTier[tier].count`, `byAudienceType[aud].count`)
**were found but explicitly NOT fixed** at the time because the
direction of fix (increment the addition vs stop decrementing) is
an owner-visible count question that does not belong to the
implementer. Recorded as "Found while implementing, NOT fixed" in
the Batch 28 report.

### Why this matters more than the list

A test that exercises the code path the worker runs is a
behavioural assertion. A source-text test that reads `shared.ts`
for a string is **not** — and the suite relied on several of those
during the earlier batches (recorded in `cumulative-learning/
reports/batch-23-969-report.md` §7). The audit-correction cycle
that closed Batches 28/29/30 was the moment this project learned
the difference: every test added in those batches runs against the
real function with synthetic inputs. Source-text guards are used
for **the specific and narrow claim** that a sentence or field
shape does not regress, with a self-test that proves the guard
itself can fail in both directions.

---

## 4. The verification methods that recur

Six patterns reappear in the test files. They were chosen because
each caught something the others missed.

### The "drives `applyHookAggregatesDelta` with N creatives × M
rows and asserts `creativeCount === N`" discriminator

Used for SC-008 and the Batch-5-fix discriminator. The test
constructs `N × M` ads, drives the aggregator, asserts the count
field. **A wrong implementation can pass this for one direction
(rows-as-creatives) and fail for the other (creatives-as-creatives).
**The discriminator cannot be satisfied by both interpretations**
because the two answers differ for `M ≠ 1`.

### The "five stable syncs at identical inputs leave the field
unchanged" cycle

Used for the withdrawal average (A3), the creative count
persistence (B2), and `avgLinkCtr` (the Batch 25 unfenced-vs-
fenced discriminator). The shape: drive the function N+1 times at
**stable values**, assert the final value equals the initial value.
A drift of `(A − M)/n` per cycle is exactly observable. **This is
the verification that found defect #1's true direction** and the
same one that closed the creative-count inflation.

### The add/withdraw symmetry invariant

Used for `addWithdrawSymmetry.test.ts` (S1–S10). Every counter
the addition changes must be one the withdrawal changes, in the
same branch, by the inverse amount. **A pair-by-pair audit exposed
the two counter types of inflation that batch tests miss**: withdrawal
subtracts where addition never adds (the counter floors at zero);
addition adds where withdrawal never subtracts (the counter
inflates on every sync, since `contributedValues` moves every sync).

### "Drive `runSyncForAccount` end-to-end with a stubbed Firestore
+ Meta stub" (T064b)

The harness at `t064bEndToEnd.discriminator.test.ts` made
end-to-end assertions possible without emulators. It caught
**the lease-fence shape (operational writes before lease acquisition)
behaviourally** rather than as a source-text read. The test files
in this style are 1000+ lines because the harness dominates, but the
discriminating assertions are short. Use this when the property
is about the integration shape and not the unit's output.

### "Extract the worker inline block into a pure function" (Batch 07)

When something in the per-ad block resists testing, lift the
inline block into a `pure` helper with named inputs and outputs,
then write the test against the helper. The worker shrinks by the
size of the lifted block; the test gains `import foo; foo(...)`
ergonomics. **Used for** `decideAdWrite` (T018b field-level
discrimination), `decideAdWriteActions` (T028 per-ad actions),
`decidePerAdActionsForWorker` (T021a/T025a wire-up), and
`applyLearningWrites` (Batch 23, after the first two extractions
introduced regressions). **The pattern is reliable, but it has
a sharp edge**: extracting one function at a time, with a green
suite at every step, gets you a behaviour-preserving refactor;
extracting two at once is how Batch 22's Item 1 regressed.

### "Same test file, pre-fix and post-fix source — run both"
demonstration

Used for Fix A (withdrawal average), Fix B (`creativeCount`),
Batch 26 (visual withdrawal deadlock), and Batch 19 (`decideContribution`
consult). The format: stash the source-but-not-the-test change, run
the test against HEAD source, observe failure; un-stash, rebuild,
observe pass. **The "before" output is what proves the test
discriminates** — a test whose "before" run was green is, by
construction, not a regression guard for that change. The
report's "before" column is never optional; a green "before"
without explanation (e.g. "the test vacuously passed because the
field was 0 for every input") is a known failure mode and is
called out as such.

---

## 5. The stated limitations

These are deliberate, accepted and **undetectable by
construction**. A future reader must not discover them as
surprises. Each is named in `spec.md` and recorded here for
completeness; nothing in this feature closes any of them.

### FR-074b — two unlinked hash groups that are one creative

The merge requires a `generationId` link; most rows have none
(of 1008, only 1 generationId is linked at all — `UtCCphz5jAgFIEWCa7WQ`,
mapping to one hash `f5e9a98dadad8d9d`). Where neither group has
a link, there is no signal to merge on, and **two unlinked hash
groups that are genuinely one creative stay two creatives
permanently**. Direction of error: **inflation** of distinct-
creative count. The activation gate fires earlier than the
deliberately-seven-times-harder threshold the spec designed for.
**Not fixable within this feature** — fix would require a
near-hash clustering, which is non-transitive and would merge
genuinely distinct creatives (a worse failure).

### FR-074e — a hashless row's propagated link is frozen

If a row loses its `imageHash` after the first link is established,
the propagation still flows from FR-074d's persistence — but
**the row that lost its hash cannot be re-derived any more**.
Once that propagated attribution is written, no direct match can
later appear, and the row stays attributed to its propagated
generation permanently. The error direction: **mis-attribution
plus inflation** (a spurious creative count, a wrong angle).
Bound: the frequency of a linked row losing its hash, which is
the frequency of an image download failure on a previously-matched
row — observed at zero in production.

### FR-051e — unenforced terminological guard

`scripts/sc11Guard.mjs` walks `src/` only. Nothing walks
`functions/`. The terminological-guard that catches governed
metric names in owner-visible strings is therefore
**documented but not enforced** for the backend tree. The codebase
has no automated replacement; the rule holds by code review.

### FR-038 — the 3.0 bound on aggregated efficiency

The aggregate folds each contributing creative's raw unbounded
figure into the angle's average, with an upper bound of 3.0 (so a
single freak row cannot dominate the angle). The row's own
**stored figure is unbounded** — the bound only applies at the
fold point. Aggregate published number: capped at 3.0; raw row
audit number: full unbounded value.

### FR-066 — no pruning of `adPerformance` documents

Ad documents may never be pruned. The reason is recorded at the
write site itself (Batch 2 will land the comment with the
sealed-state write path): deleting an ad document erases its
ledger entry and silently re-enables double-counting for that ad.
A future retention policy can land, but it must traverse the
ledger first.

### The ledger grows with creative count, not with account age

Per FR-071 (whole-document by-ID reads return full docs, not
projections) and SC-023 (read volume bounded by batch size, not
account age), the bounded read is now behaviour-identical for the
five reads that previously scanned `adPerformance`. The same
discipline applies to the ledger; current read volume is **bounded
by the current batch size**, not by historical record count.

---

## 6. What shipped and what did not

### What shipped (PR #71, squash `efcdb04`)

- **Amendment 1: the creative as unit of evidence.** Groups by
  `imageHash`, propagates `generationId` links, manual beats
  automatic, merges on shared link, attaches hashless linked rows,
  persists propagated links with `linkProvenance: "propagated"`
  on a separate field (so `matchType` carries no new value).
- **Per-creative aggregation in the hook and visual aggregates.**
  `creativeCount` (distinct creatives), `contributedCreativeKeys`
  (the persisted set), `byFunnelTypeCreativeCount` field still
  pending (Batch 3 alongside weighting).
- **The contribution ledger on every ad row** with all four
  `decideContribution` outcomes wired (add, noop,
  withdraw-then-add, withdraw-only).
- **Per-account learning lease** keyed on `(ownerUid,
  accountId)`, inside `runSyncForAccount`, not in `orchestrator.ts`,
  with FR-060a's commit-operational-then-attempt ordering.
- **Bounded by-ID read** for `adPerformance` at chunk size 300,
  whole documents returned.
- **FR-019's write-suppression** for untouched aggregates (ships
  corrected in Batches 28/29/30; the original implementation
  rewrote every existing aggregate every sync).
- **The multi-funnel indication** in both English and Arabic Fusha.
- **All three nightly defects fixed** before merge: the withdrawal
  average drift, the `creativeCount` observation-counting
  inflation, the visual-withdrawal deadlock (and one sibling: the
  swallow-the-commit-failure `ran: true` bug).
- **The "needs linking" filter unchanged.** Spec cites
  `whatsWorkingDashboard.ts:719`; the file rewrote and the
  filter is at `:853` now — corrected in place per FR-074f.

### What did not ship (named in the squash message)

The squash message states three absences honestly. They are the
right shape of an honest commit message — three absences the next
reader expects to find, named in the message so they don't have to
re-discover them.

1. **The per-day conversion accrual and the write-once efficiency
   figure** (FR-002, FR-002a, FR-077 to FR-087). Module file
   `conversionAccrual.ts` exists (Batch 1 ships `accrueDays` +
   `isStopped`); `efficiencyFigure.ts` does not. Net effect today:
   **no cost or conversion-efficiency signal reaches the AI**.
   A contribution carries `ctrLink`, `cpm3d`, and the verdict mark;
   `ragContext.ts` ranks on `avgLinkCtr` only. The owner wanted the
   AI to learn what gets **sales**, not what gets clicks; that
   learning lands in PR continuation Batches 2 and 3.

2. **Funnel-type weighting** (FR-030, FR-031, FR-032a). The
   `byFunnelTypeCreativeCount` field (distinct creatives per bucket)
   is the prerequisite for a non-inflated weighting path. The
   breakdown and the multi-funnel indication ship; the retrieval
   path does not weight toward same-funnel evidence yet. A
   weighting path on `byFunnelType.count` (rows) would recreate
   the 7.4:1 fan-out — the Batch 18 note in `tasks.md` warned of
   this and the fix is still pending.

3. **The creative-counted retrieval path** (FR-033; FR-034a's
   floor in `getTopWinners`; FR-035's activation latch).
   `getTopWinners.ts` is untouched and still selects winners **per
   ad row**. One creative across 55 rows can still fill every
   winner slot. The activation gate at `ragContext.ts:167` reads
   `creativeCount`, which the door-monster is sound; the latch
   (`once on, stays on`) is absent — a partial sync that drops
   the count below 10 could open the gate later.

### Where PR continuation (`969-phase-4`) stands at consolidation

- **Batch 0 (planning)**: shipped (`specs/969-cumulative-learning/
  reports/phase4-batch-00-understanding.md`).
- **Batch 1 (T034/T037/T035/T036/T036a/T038/T045)**: shipped
  (`phase4-batch-01.md`). 32 new behavioural tests. Pure
  `accrueDays` and `isStopped`; `adStatus` persisted onto `AdDoc`.
- **Batch 2 (T028/T029/T030/T031/T033/T044)**: sealed state
  machine + FR-005c guard + FR-012a earliest-sealing rule +
  FR-036c creative-state derivation. Pending.
- **Batch 3 (T039-T043/T046 + Phase 5 weighting + bound)**:
  efficiency figure, eligibility rule, FR-087 recomputation,
  FR-013a merge, FR-038 bound, cross-funnel weighting. Pending.
- **Batch 4 (Phase 6 retrieval + latch)**: `getTopWinners.ts`
  per-creative + FR-035 activation latch + dashboard tests.
  Pending.

The four absences in the squash message shrink to one (cross-
funnel weighting) after Batch 3, and to zero after Batch 4 ships.
The pipeline is on track.

---

## 7. Production baseline and verification results

The numbers below were captured against `act_995888422231015`
(pre-sync baseline, `docs/investigations/969-production-baseline.md`)
and `act_1180773537404268` (post-deploy Sync 1 and Sync 2,
`docs/investigations/969-sync-check-{01,02}.md`). They are the
**headline evidence** the feature works.

### Pre-sync baseline (after PR #71 deploy, before any new sync ran)

| Metric | Value | Surface |
|---|---|---|
| Workspace-scoped `adPerformance` for `act_995888422231015` | **383** | PR-969 writes here |
| Of those, `adDocsWithLedger` | **0** | expected (field is new in PR-969) |
| Workspace-scoped `hookPerformance` for this account | **0** | expected |
| Workspace-scoped `visualPerformance` for this account | **0** | expected |
| Legacy top-level `adPerformance` for `act_995888422231015` | **452** | LEG A, untouched |
| Aggregate docs carrying any new Phase-969 field | 0 (anywhere in the project) | expected |

### Two-sync comparison (post-deploy, `act_1180773537404268`,
28 minutes apart)

| Field | Sync 1 | Sync 2 | Δ | Verdict |
|---|---|---|---|---|
| `pain.creativeCount` | **1** | **1** | 0 | **PASS — no double-counting** (FR-018) |
| `pain.contributedCreativeKeys.length` | **1** | **1** | 0 | **PASS — invariant holds** (FR-036) |
| `pain.byObjective.conversion.count` | **32** | **32** | 0 | **PASS — non-shrinking** (FR-020) |
| `pain.byObjective.conversion.avgLinkCtr` | **0.17** | **0.17** | 0 | **PASS — stable** (no withdrawal fired on identical input) |
| `pain.sampleSize` | 32 | 32 | 0 | tr – same as `byObjective` |
| `pain.schemaVersion` | 1 | 1 | 0 | unaffected |
| `pain.byFunnelType.free_webinar` | 27 | 27 | 0 | unrelated |
| `pain.byFunnelType.unknown` | 0 | 0 | 0 | unrelated |
| `adPerformance` docs (account total) | 718 | 718 | 0 | unrelated |
| `adPerformance` docs with `ledger` | 642 | 666 | +24 | new propagation; expected |
| `FR-076` derived `direct_auto` | 27 | 27 | 0 | matching stable |
| `FR-076` derived `propagated` | 615 | 639 | +24 | hash-group propagation working |
| `FR-076` derived `no_generation` | 76 | 52 | −24 | link rate up |
| Orchestrator `inline.counts.matched` | 27 | 27 | 0 | stable |
| Orchestrator `inline.counts.unmatched` | 615 | 639 | +24 | matches derived `propagated` |
| Orchestrator `inline.status` | `partial` | `ok` | improved | second run completed cleanly |

**Four critical checks, all pass on production data:**

1. **`creativeCount` unchanged** (was the audit's night-defect
   concern — Fix B closed). PASS.
2. **`contributedCreativeKeys.length` equals `creativeCount`**
   (the invariant Fix B holds). PASS.
3. **`byObjective.conversion.count` non-shrinking** (FR-020
   contract). PASS.
4. **`avgLinkCtr` stable** (Fix A + identical inputs take the
   noop path). PASS.

The 24-row delta in the project-wide `with-ledger` count and the
matched/unmatched shift reflect hash-group propagation across the
two syncs, not defects (the 24 rows gained linkage via newly-
matched hash siblings in Sync 2's Meta pull — exactly the FR-074
design working).

### The fan-out failure, stated so it isn't mistaken for a
learning-read bug

Both Sync 1 and Sync 2 saw all **five** cross-workspace fan-out
dispatches fail with `5 NOT_FOUND: Requested entity was not found`
in Cloud Logging. This is **the fan-out path**, not the
learning read or write path. The Cloud Tasks dispatch is failing
because the cross-workspace account docs are missing the GCP
service-account identity the worker requires. The active Boran
workspace's manual LEG B path runs inline and **completes cleanly
on both syncs**; the fan-out failure does not affect the learning
data path on the active workspace. **Pre-existing; not Phase-969-
introduced; documented for the reader.**

---

## 8. The first batch on the continuation branch

Phase 4 Batch 1 (`specs/969-cumulative-learning/reports/phase4-
batch-01.md`, commit `b9f2bff`) shipped on `969-phase-4` while
this consolidation was being prepared. It builds:

- **The `accrueDays` pure function** (FR-081, FR-083, FR-084,
  FR-084a). Dedup key `(adRowId, date)`, window membership pure
  date arithmetic, upward-only revision, absent-row not-zero,
  bounded retention (finalise on exit, drop the map entry).
- **`isStopped` (FR-077(b), FR-085).** Reads the ad's own
  configured status; under-detects parent-level pauses by design
  (records the parent's pause to stay as the missing-contribution
  failure mode rather than a wrong-figure failure mode).
- **`adStatus` persisted onto `AdDoc`** (FR-085). Operational
  data, written for every ad including FR-070's failed-read
  case.
- **32 behavioural assertions in `conversionAccrual.test.ts`**
  covering SC-037 (zero new Graph calls), SC-038 (never decreases),
  SC-039 (raise, no-lower, finalised-untouched — discriminating
  against plain overwrite), SC-040 (correct key vs both wrong
  keys), SC-041 (parent-paused under-detect), SC-051 (100 syncs,
  bounded map).
- **The FR-082 naming guard** forbids `lifetime` and `since-
  inception` in source; greps would catch a future regression.

The batch's contribution goes to owner decision **6.1** (the
activation latch stays a Batch 3 item) and to **the FR-020
property** the two-sync production check confirms is correct
across the new code path. Nothing in Batch 1 changes the AI's
output yet — the per-day counter sits on the row document, awaiting
Batch 2's sealed-context write site that will turn the running
count into the criterion for the eligibility rule.

The seven tasks in the batch are the cheapest items in the Phase 4
remainder; the rest lands in Batch 2 (sealed context) and Batch 3
(efficiency figure + Phase 5 weighting).

---

## 9. Where the record lives now

This log replaces 51 batch / addendum / revision / audit / CodeRabbit
round reports from the first PR plus the batch-00 understanding
and batch-01 report from this PR continuation. The originals are
in git history under `specs/969-cumulative-learning/reports/`; a
`git checkout <commit> -- specs/969-cumulative-learning/reports/`
brings any of them back as needed. Going forward, **one report per
batch**, appended as a section to this log via edit-in-place (no
new files). If a batch needs a correction, edit its existing
section.

The handful of files kept at the prior path are:

- `IMPLEMENTATION-LOG.md` (this file).
- `phase4-batch-00-understanding.md` and `phase4-batch-01.md` —
  the two Phase-4-batch reports up to this consolidation. **They
  are candidates for being absorbed into §8 above on the next
  housekeeping pass.** Owner to decide.

Every batch after this consolidation writes by editing `§10+
future batches` rather than creating a new file. The convention is
documented once, in the second paragraph above, so reviewers
expecting the old pattern can find their way.

---

## 10. Batch 2 — the sealing spine (T028/T029/T030/T031/T033/T044)

**What this batch delivers.** When a creative's performance is first
measured against a resolvable cost target, that target is written
onto the row and locked. A later settings change does not re-open the
seal. The operational status keeps recomputing against current
economics — the two stay separate (FR-008 / FR-009 / FR-010). Phase
4's sealed-state machinery now exists in code; Phase 5 and 6 work
can land downstream.

### 10.1 The resolver question, answered

The funnel-economics target is resolved by `getEffectiveTarget(derived:
DerivedTargets): number | null` at `cpaEconomics.ts:476`. It is
**pure**: takes an already-resolved `DerivedTargets` payload and
returns a number or `null`. It performs no Firestore reads, takes no
secrets, and is exercised in tests without stubs.

The payload it consumes is **loaded once per sync** at
`shared.ts:746-784` from a single read
(`users/{uid}/workspaces/{wid}/adAccounts/{act}/settings/current`),
inside the per-account lease window. Already in scope by the time
the per-ad loop runs.

**Rejection paths the resolver already encodes:**
- `derived.economicsVersion !== ECONOMICS_VERSION` (the version
  gate, FR-041 / R-1).
- `paid.effectiveTargetCpa` and `free.effectiveTargetCpl` both
  absent or null.

**Batch 2's addition:** a fourth gate — `workspaceFunnelType ===
"unknown"` — refuses to seal against a workspace whose settings
doc did not expose a funnel bucket. Without this, the seal path
would persist `"unknown"` as a real `sealedFunnelType`, which is
exactly the "no placeholder, no unbounded stand-in" failure mode
FR-005 forbids. The discriminator test `SC-015
[unresolvable settings]` pins this gate; the corresponding
discriminating-without-this-gate demo failed that test correctly.

**Zero new Firestore reads were introduced.** The new
`perSyncSealedContext = resolveSealedContext(...)` call sits
inside the existing per-account critical section, immediately
after the settings read. The per-row logic then asks the same
`decideSealedTransition` for every ad. Both are pure functions
of the already-loaded payload.

### 10.2 What landed in code

**Pure module — `functions/src/learning/sealedContext.ts`.** Three
families of pure functions:

- `resolveSealedContext(derived, workspaceFunnelType, nowMs)`
  returns `SealedContext | null`. The `null` return IS the
  "stay PROVISIONAL" answer — no placeholder, no `Infinity`
  fallback (the existing verdict engine's `?? Infinity` pattern
  at `shared.ts:1128` is unchanged; only the seal path is
  null-aware).
- `decideSealedTransition(existing, newResolution)` returns
  `{ allowed: true; fields; didTransition }` or
  `{ allowed: false; reason }`. **The guard tests the
  transition, not the flag** — see §10.4 for the three behavioural
  halves and the before/after of an incorrect guard.
- `resolveCreativeSealedContext(rows)` and
  `deriveCreativeState(rows)` — the aggregate-side derivations
  for FR-012a and FR-036c. Called by Batch 5 / Batch 6 readers.

**Per-row write site — `metaSync/shared.ts`.** The new
`perSyncSealedContext` is computed once per sync after the
settings load. Inside the per-ad loop, the worker:

1. Reads the existing `sealedTarget` / `sealedAt` /
   `sealedFunnelType` from the bounded-read `existingData`
   (absent → undefined, so the guard sees a "PROVISIONAL" row).
2. Calls `decideSealedTransition(existing, perSyncSealedContext)`.
3. Threads the verdict's `fields` through `decideAdWrite`
   (via `sealFields` on `PerAdVaryingInputs` →
   `DecideAdWriteInput`) so they land in `baseDoc` and ride
   the existing `merge: true` write.
4. On `allowed: false` (FR-005c refusal — only the
   "different target" or "clear an existing seal" cases
   reach this branch), the worker omits the four sealed fields
   entirely; the merge preserves the prior values per
   FR-070's field-level discrimination. The refusal is logged
   on `errors[]` as `seal_refused  adId=...  reason=...
   existing=...  attempted=...` so the operator can audit
   without spam (FR-051c discipline).

**Per-row read site — `metaSync/shared.ts:266-302`.** The four
sealed fields are added to `AdDoc`. They are `?: T | null` so a
failed-merge-write that does not include them preserves the prior
values (FR-070).

**`contributionLedger.ts` doc.** FR-011(a)'s narrowing is
documented in the `ContributedValues` interface and
`contributionsEqual`: the comparison basis carries `ctrLink`,
`cpm`, `verdictMark` and NO `sealedTarget`. The efficiency figure
(FR-002a / FR-077) lands on the ledger entry's separate
`efficiencyValue` / `efficiencyContributed` fields, behind its own
write-once guard in Batch 3. A structural guard in
`sealedContext.test.ts` asserts the two modules do not import each
other, so a future edit cannot quietly cross them.

### 10.3 What was deliberately not changed

- `getEffectiveTarget` itself. It is pure and correct. We added
  one gate around it (workspaceFunnelType), not inside it.
- `decideContribution` in `contributionLedger.ts`. Re-evaluation
  for target-independent measures (FR-011(a) already narrowed)
  runs through it unchanged. The behavioural discipline is the
  new doc comment, not new code.
- The verdict engine's `?? Infinity` fallback at `shared.ts:1128`.
  The verdict engine needs a number for the K5 matrix; the seal
  path is now null-aware and does NOT use that fallback.
  Touching the verdict engine would have been a change of
  scope.
- `applyLearningWrites`. The aggregate side of FR-005c (the
  efficiency figure's write-once) lands in Batch 3, not now.

### 10.4 The three discriminating tests, with before/after pairs

The user explicitly asked for tests that fail against wrong
implementations. Three pairs follow; each discards a non-trivial
wrong implementation and demonstrates the test catches it.

**Discriminator A — FR-005c second-half.** A guard that simply
checks `if (wasSealed) return refusal` (a flag-only guard)
satisfies the FR-005c second-half test ("different target
refused") AND breaks the idempotent re-write path. The wrong
guard I temporarily installed reduced
`Passed: 25, Failed: 0` to **`Passed: 22, Failed: 3`**, with
the three failures being:

```
❌ FR-005c idempotent: same target re-written is permitted without a transition
   Expected values to be strictly equal: false !== true
❌ SC-031 [shape]: the carve-out for the first efficiency-figure write is a SEPARATE call site
   Expected values to be strictly equal: false !== true
❌ FR-005e: a row may seal (its sealedTarget is set) and yet have no efficiencyValue
   Expected values to be strictly equal: false !== true
```

The three tests that failed are precisely the three that lean on
the idempotent path. The wrong guard could not tell them apart
from the FR-005c-refusal case; the discriminating shape is the
absent `didTransition: true` flag, which the correct guard sets.
The discriminator test title names this:
*"an already-SEALED row refused a DIFFERENT target (the test that
fails against a flag-checking guard)"*.

**Discriminator B — FR-036c any-row vs all-rows.** A guard that
implements `deriveCreativeState` as "SEALED only when every row
is SEALED" (the wrong all-rows rule) satisfies FR-036c's
"only-PROVISIONAL" test and the discrimination test, but breaks
the settings-gap and empty-set cases. Wrong guard's run:
**`Passed: 22, Failed: 3`**, with:

```
❌ FR-036c any-row: a single SEALED row in the creative makes the creative SEALED
❌ FR-036c [settings gap]: a new row appearing during a settings gap stays PROVISIONAL
                       when the creative was already SEALED — the creative does not regress
❌ FR-036c empty row set: returns PROVISIONAL (conservative default)
```

The settings-gap failure is exactly the user's "thing 3 to get
right" — a new placement appearing during a settings gap must
not drag the already-sealed creative back to PROVISIONAL. The
discriminator test's title names this case explicitly so a
reader sees what the test catches.

**Discriminator C — FR-005b workspaceFunnelType gate.** A
`resolveSealedContext` that drops the `workspaceFunnelType ===
"unknown"` check would seal a row whose workspace has no funnel
bucket exposed, persisting `"unknown"` as a real sealedFunnelType
(the placeholder failure mode FR-005 forbids). Wrong impl
run: **`Passed: 24, Failed: 1`**, with:

```
❌ SC-015 [unresolvable settings]: resolveSealedContext returns null when the workspace funnel type is 'unknown'
```

After reverting each wrong impl, the suite returns to 25/25
pass. **The three discriminating tests are the only way these
three distinct wrong implementations are caught by the suite.**

### 10.5 Test discipline

The `sealedContext.test.ts` file (25 tests) is pure-function:
no stubs, no Firestore, no Meta fetch. The shape follows the
Batch-1 accrual file — direct assertions on returned values,
discriminating test titles that name the wrong implementation
they catch, structural guards labelled as such.

The chain (`npm run test:phase969`) is **`EXIT=0`** with the
sealedContext suite at the end. Total phase-969 suite count:
19 prior suites + the new `sealedContext`, all green at 25
new assertions:
`creativeGrouping 19, learningLease 12, boundedLedgerRead 12,
fr070 7, perAdActions 11, t021aWireup 2, learningAccumulation 18,
learningCascade 4, t025aWorkerWiring 2, t029GateMigration 5,
t064b 10, applyLearningWritesLease 8, multiFunnel 7,
withdrawalAverage 7, creativeCount 7, symmetry 10,
visualCreativeCount 10, conversionAccrual 32, sealedContext 25`.

Full chain `npm test` from clean `lib/`: `contractFixtures.test:
PASS`, `EXIT=0`. Nothing regresses.

### 10.6 What this batch does NOT deliver

- **The efficiency figure itself.** Batch 3 (T039 + T040 +
  T041 + T042 + T043 + T046). The place where it lands is
  documented at `contributionLedger.ts:62-69` — separate from
  the seal fields, behind a write-once guard. The
  `efficiencyValue` / `efficiencyContributed` slots on
  `ContributionLedgerEntry` already exist (types.ts:79-80)
  and have no callers; Batch 3 fills them.
- **The aggregate's per-creative sealed target wiring.** The
  `resolveCreativeSealedContext` pure function is built; the
  worker call site that feeds it remains to land when the
  efficiency figure arrives. The wiring is one line:
  `resolveCreativeSealedContext(rows.map(r => ({ sealedTarget,
  sealedAt, sealedFunnelType: r.sealedFunnelType })))`.
- **The FR-005c carve-out's efficiency-side guard.** The shape
  is pinned by SC-031's "shape" test (the seal and the
  efficiency-figure write are separate call sites). The
  actual guard lands in Batch 3.
