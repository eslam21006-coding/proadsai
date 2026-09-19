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

---

## 11. Workspace isolation defect — generation state (Paused 2026-09-19)

**Branch:** `969-phase-4`. Phase 4 Batch 3 paused pending owner review of the investigation.
**Author:** investigation, read-only. No fix code. No deployment.

A team member working in workspace `ZbGPvZbrAAFl8afG41dG` (Moataz Mashal) reached the Hooks step on a generation. The owner opened their own session and saw the same failed project at the same step, on a different workspace. The persistence and the read path are tracked end-to-end in `specs/969-cumulative-learning/reports/workspace-isolation-defect-generation-state.md` and a parallel cross-user trace in `docs/investigations/gen-leak.md`. Top-line summary below.

### 11.1 What's wrong

The in-progress generation state lives in two layers, both keyed by `uid` only, never by `workspaceId`:

1. **`users/{ownerUid}/projects/{projectId}`** — `workspaceId` is a *field* on the doc, not a path segment. The `saveProject` callable (`functions/src/index.ts:7772-8000`) correctly resolves the team member's writes onto the owner via `resolveCallerScope` (`functions/src/workspaces/workspacePolicy.ts:339-438`) and stamps `userId = ownerUid`. That is correct for quota/plan attribution. But the *owner branch* of the auto-restore at `src/App.tsx:4567-4648` reads every doc under `users/{ownerUid}/projects` (no `where('workspaceId',...)` predicate at `src/App.tsx:439-451`) and picks `savedProjects[0]` — the global most recent — to load as live state. If the most recent is a team member's doc from another workspace, the owner's session resumes the team member's draft.
2. **`ProAdsDB_V2.projects` IndexedDB** — keyed by `id`, with a `userId` index. `getAllProjectsFromDB(userId)` at `src/App.tsx:360-373` is `index.getAll(userId)` — same unfiltered read, mirrored to disk via the same merge step.

Verified against production data on 2026-09-19: 360 SavedProject docs under the owner's namespace; ~49% by `creatorEmail` of team-member accounts (separate Firebase auth uids). The `workspaceId = ZbGPvZbrAAFl8afG41dG` set has three docs, one of which (`1789823908575`) is Ahmed Basha's mid-flow `tov_review` doc, populated with `tovText` (904 chars), `phase: tov_review`, `creatorEmail: ahmedbasha16422@gmail.com`, `creatorName: Ahmed Basha`. That is the exact symptom the report describes.

### 11.2 What's NOT wrong

- The `generations/{auto-id}` collection — the artefact the prompt's section 2 mentions — is correctly cross-user-blocked by `firestore.rules:240-244` (`resource.data.userId == request.auth.uid`, no team-member exception). The owner cannot read team-member-written `generations` docs from a client session. Verified: 0 of 20 Moataz `generations` have a `uid` field (so the latent `recordGenerationFailure` field-name bug at `functions/src/index.ts:4165` does not contribute here).
- The 969 worker outputs at `users/{uid}/workspaces/{wid}/adAccounts/{aid}/...` — every subcollection under the workspace subtree (adPerformance, hookPerformance, visualPerformance, imageFingerprints, baselines, syncSnapshots, settings) — are workspace-scoped at the path level. Verified by `specs/969-cumulative-learning/reports/firestore-scope-audit.md`. The cumulative-learning data is not contaminated.

### 11.3 Where the fix lands

Read site (`src/App.tsx:4567-4648`, query at `src/App.tsx:439-451` and `src/App.tsx:360-373`). Schema, rules, and write path do not change. The fix restricts the auto-restore set to `users/{ownerUid}/projects` where `workspaceId == activeWorkspaceId ?? <defaultWorkspaceId>`, and picks `savedProjects[0]` from that subset. If the subset is empty, the in-progress session lands on a brand-new project (Brief/Step 1), never on a cross-workspace doc. See investigation `§5.3` for the schema-vs-query trade-off.

### 11.4 Decisions the reviewer needs to lock

1. Does the editor want a 'resume last session anywhere' affordance as a separate UI surface (not the default auto-restore), or is the global most-recent auto-restore to be removed entirely? The former preserves the 'where was I?' experience; the latter is the safer default.
2. Does the IndexedDB cache need a one-shot migration to `workspaceId`-stamped IndexedDB rows (so offline / cold-start behaviour matches the new query), or can the cloud read dominate? Current code merges IndexedDB with cloud; both must converge on the same partition.
3. Does the autosave's `resolvedWorkspaceId = (canUseWorkspaces && activeWorkspaceId) || existingProject?.workspaceId` (`src/App.tsx:4842-4844`) need to also enforce that `existingProject?.workspaceId === activeWorkspaceId` before resuming? Without this, the autosave can repaint an auto-loaded cross-workspace doc under the active workspace and quietly 're-home' it.

### 11.5 Pause state and batch plan

Phase 4 Batch 3 paused. Fix lands in Batch 4 (or wherever the reviewer schedules it). No code in Batch 2 has been touched.

---

## 12. Auto-restore removal (Phase 4 Batch 3, resumed)

**Branch:** `969-phase-4`. Batch 3 resumed 2026-09-19 after the owner locked decision §11.4 #1 in favour of "remove the global most-recent auto-restore entirely — every session starts blank at step 1."
**Author:** Batch 3 implementation. Two surgical edits in `src/App.tsx`. No schema, rules, or backend change.

The investigation above (§11) diagnosed the workspace-isolation defect and asked three reviewer questions. Question #1 is now answered (see §12.5); questions #2 and #3 are answered implicitly by the chosen shape — IndexedDB no longer participates in the restore, so the IndexedDB workspaceId-migration question is moot, and the autosave's `resolvedWorkspaceId` chain never resumes a cross-workspace doc because nothing is ever resumed automatically. Both still need confirmation if a future 'resume last session' affordance is reintroduced.

### 12.1 What the auto-restore was doing (kept)

The effect at `src/App.tsx:4567-4648` did two distinct things on mount:

1. **Project-list load for the sidebar.** Cloud (workspaceService for team members / `getAllProjectsFromFirestore` for owners) → IndexedDB → merge → `setProjects(savedProjects)` → mirror cloud-only docs to IndexedDB for offline access. Kept.
2. **Auto-load of the most recent project into live state.** `setCurrentProjectId(mostRecent.id)`, `setPhase`, `setInputs` (with plan-agnostic shape migration), `setTovText`, `setConceptsText`, `setSelectedTov`, `setSelectedConcept`, `setBuildPlan`, `setMockupHistory`, `setHistoryIndex`, `setResolvedUniverse`, `setCaptionText`, `setBatchCaptions`, `setBatchResults`, `setBatchHookGroups`, `setCarouselSlides`, `setHighestUnlockedPhase`, and `setShowStrippedAssetsWarning`. Plus `projectEstablishedRef.current = mostRecent.id` so the cap-detection effect treats the session as "established." Removed.

### 12.2 The three pre-flight findings (recovery cost, currentProjectId, auto-save empty-snapshot)

The owner asked for these before any edit landed. They were checked by reading the code, not by running the app.

**(a) Recovery case (refresh mid-generation).** Yes — there is one. A user who refreshes mid-generation loses their in-flight work: any `tovText`, `conceptsText`, `buildPlan`, `mockupHistory`, `captionText`, batch state, or carousel slides that haven't yet been auto-saved are discarded on the next mount. The auto-save debounces 3 s and ceiling-flushes at 30 s (`src/lib/projectAutoSave.ts:14-15`), so any keystroke or render within that window is in-memory only and dies with the page. **Cost:** stated and accepted. The owner's decision stands. The mitigations that survive the change are: (i) `localStorage.adInputsDraft` in `InputForm` (`src/components/InputForm.tsx:329,1107,2564`) — the input form's typed-into fields re-load on remount; this is a separate, manual save path that pre-dates the auto-restore and is unchanged; (ii) auto-save still fires once the user lands on real content (see §12.3 below for the gate).

**(b) Code that assumes `currentProjectId` is set on load.** No white-screen risk identified. `currentProjectId` initial value is `Date.now().toString()` at `src/App.tsx:1801` — a string, not `null`. The auto-save snapshot built at line 4847 reads `id: currentProjectId`; downstream consumers in the file are: `existingProject = currentProjectId ? projects.find(...) : undefined` (line 4839) — the falsy guard is correct against the timestamp string; `setCurrentProjectId(p.id)` from `loadProject` (line 5468) overwrites it on a sidebar click; `resetToBlankProject` (line 5577) re-mints a fresh timestamp id. The Zustand store type at `src/store.ts:97` does allow `string | null`, but the App-level state never carries `null` after the lazy init. No code path crashes when `currentProjectId` is the initial timestamp string.

**(c) Auto-save behaviour with no loaded project — the active defect.** Without an auto-restore to overwrite `currentProjectId` with the most recent saved project's id, the auto-save effect at `src/App.tsx:4755-4886` would have queued an **empty** snapshot on every page load: `inputs = null`, `mockupHistory = []`, `carouselSlides = []`, `batchResults = []`, `batchCaptions = []`, `batchHookGroups = []`, `tovText = ''`, `conceptsText = ''`, `buildPlan = ''`, `captionText = ''`, `phase = 'input'`, `historyIndex = -1`, and `id = Date.now().toString()` from the useState lazy init. After the 3 s debounce the auto-save module writes this empty `SavedProject` to IndexedDB; after the cloud round-trip it writes a fresh empty doc to Firestore under `users/{uid}/projects/{Date.now().toString()}`. **Every page load would create a new stray empty doc.** This is the live regression the change had to guard against.

### 12.3 What the change does

Two edits in `src/App.tsx`:

1. **Delete the auto-restore branch** in the history-engine `useEffect` (former `src/App.tsx:4597-4641`). The project-list load + cloud-to-IndexedDB mirror above it is preserved verbatim. After the edit, the effect's deps `[user, effectiveUid]` and the once-per-session guard `hasRestoredRef` continue to protect the project-list load — `hasRestoredRef` is reset to `false` on logout so the next sign-in refetches. The comment block at `src/App.tsx:4577-4585` records that the auto-restore was removed here and links the workspace-isolation defect as the reason.
2. **Add an empty-snapshot guard** at the top of the auto-save `useEffect` (`src/App.tsx:4744-4768`). The snapshot is gated on real content:

   ```ts
   const snapshotIsEmpty =
     !inputs &&
     mockupHistory.length === 0 &&
     carouselSlides.length === 0 &&
     batchResults.length === 0 &&
     batchCaptions.length === 0 &&
     batchHookGroups.length === 0 &&
     !tovText &&
     !conceptsText &&
     !buildPlan &&
     !captionText;
   if (snapshotIsEmpty) return;
   ```

   A snapshot is meaningful iff it carries inputs, renders, a carousel, a batch, or generated text. Anything else — including a fully-blank fresh mount — exits the effect without queuing a save. The user-typing-into-the-form case still saves (the form's `setInputs` flow lands `inputs.productName` and the auto-save fires when `inputs !== null`). The `resetToBlankProject` → blank state → no-save path is also exercised (deleting the current project or starting a brand-new one does not produce a stray empty doc).

   The cap-detection branch above this point (lines ~4792-4832) is unchanged in shape. `projectEstablishedRef.current` continues to be the gate that distinguishes "user-loaded existing project" from "freshly saved new project"; the only writer is now `loadProject` at `src/App.tsx:5467` (the auto-restore no longer touches it). Comments at lines 1675-1679 (`hasRestoredRef` purpose), 1793-1800 (`projectEstablishedRef` purpose), 4792-4800 and 4825-4831 (cap-detection comment blocks), 5442-5447 (`migrateProjectInputsShape` rationale), and 47-49 (`detectStrippedAssets` rationale) all record the removal. The references the change does **not** touch — `setShowStrippedAssetsWarning` (lines 5497, 8652), `migrateProjectInputsShape` (line 5448), `loadProject` (line 5467), `resetToBlankProject` (line 5577) — continue to be the user-initiated paths the system relies on.

### 12.4 The white-screen concern

The owner noted a reported white-screen with `Cannot read properties of undefined (reading 'length')` in minified code after a cache clear, and asked whether the restore path was the source.

**Code-reading answer (no live reproduction in this environment):** the restore path is **not** the source. Walking the empty-store path:

1. `getAllProjectsFromFirestore(effectiveUid)` → `[]` (no projects).
2. `getAllProjectsFromDB(effectiveUid)` → `[]` (cache-cleared IndexedDB).
3. `mergeProjects([], [])` → `[]`.
4. `setProjects([])`.
5. `savedProjects.length === 0` → branch skipped. **No state mutations, no `.length` access on anything undefined.**

The post-change auto-save path with the empty-snapshot guard in §12.3 also does not crash: it exits before reading any field. The pre-change auto-save path (without the guard) would have written an empty snapshot — that round-trip is observable in IndexedDB / Firestore but doesn't crash the renderer. The InputForm falls back to `getDefaultInputs()` when both `initialValues` and the `localStorage.adInputsDraft` are empty (`src/components/InputForm.tsx:326-337`).

So the reported white-screen, **if** it reproduces after a cache clear, originates elsewhere — most plausibly from a different path that does dereference `.length` on an undefined property (the `setMockupHistory(mostRecent.mockupHistory)` call at the old `src/App.tsx:4619` would have set `mockupHistory` state to `undefined` for any saved project missing that field, and the auto-save then read `.length` — but that requires at least one saved project to be present, which contradicts the "after cache clear" description). The reported error is left unfixed here per the owner's instruction; report only.

### 12.5 Decisions the reviewer needs to lock (resolved + remaining)

1. **§11.4 #1 — remove vs. affordance.** **Resolved: remove entirely.** Every session starts blank at step 1. The sidebar lists the user's saved projects (filtered by workspace correctly — `filteredProjects` at `src/App.tsx:3022`); opening a project from the sidebar uses `loadProject` at `src/App.tsx:5467`, which sets `projectEstablishedRef.current` so the cap-detection effect treats the session as established and clears stale warnings.
2. **§11.4 #2 — IndexedDB workspaceId migration.** **Moot by §12.5 #1.** The IndexedDB cache no longer participates in the restore path. The cloud read dominates because no read happens at all. If a future 'resume last session' affordance is reintroduced, this question returns.
3. **§11.4 #3 — autosave `resolvedWorkspaceId` enforcement.** **Moot by §12.5 #1.** Without the auto-restore, the autosave never paints a cross-workspace doc under the active workspace because nothing is ever auto-painted. The autosave's workspace-resolution at `src/App.tsx:4842-4844` is unchanged and continues to be the right contract for projects that ARE loaded (from the sidebar) or created (via `handleStartDesign`).

### 12.6 Verification (run on 2026-09-19, port 5173)

The owner's verification recipe:

```powershell
cd "D:\proads-worktrees\969-phase-4"
npm run build          # EXIT 0
npx vitest run         # EXIT 0
cd functions
Remove-Item -Recurse -Force lib
npm run build          # EXIT 0
npm test               # EXIT 0
```

```text
$ npm run build
> tsc -b && vite build
vite v7.3.5 building client environment for production...
✓ 124 modules transformed.
✓ built in 13.03s
EXIT: 0
```

```text
$ npx vitest run
RUN v4.1.4 D:/proads-worktrees/969-phase-4
Test Files  8 passed (8)
Tests       106 passed (106)
Start at    21:43:16
Duration    10.83s
EXIT: 0
```

```text
$ cd functions
$ Remove-Item -Recurse -Force lib
$ npm run build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
EXIT: 0
```

```text
$ npm test
…
contractFixtures.test: PASS
EXIT: 0
```

The functions suite is long (the `npm test` script chains 60+ test files including the Phase-969 cumulative learning suite, the billing suite, the cultural-compliance suite, the resolver suites, and the contract fixtures). The aggregate green count across the chain is the same as before the change — every prior assertion still passes. No new tests were added for this batch: the auto-save guard lives inside an `useEffect` inside the 13 600-line App.tsx monolith, and the existing vitest suite targets components, not the App-level state machine. A regression test would require mocking the entire App with its Firebase context, which is out of scope for this batch.

Dev server verification (port 5173, `--strictPort`, the port the Firebase referrer allowlist permits):

```text
$ npx vite --port 5173 --strictPort
VITE v7.3.5 ready in 512 ms
➜  Local:   http://localhost:5173/

$ Invoke-WebRequest http://localhost:5173/
STATUS=200
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head> ... <title>Pro Ads AI</title> ...

$ (transformed App.tsx served by Vite)
mostRecent references    = 0    (auto-restore branch removed)
snapshotIsEmpty          = 2    (the guard var + comment reference)
setMockupHistory         = 10   (still used by loadProject / resetToBlankProject / etc.)
setTovText               = 11
setBuildPlan             = 15
```

The four behavioural checks the owner asked for cannot be reproduced in this environment (no live browser session), but the code-reading equivalent holds: opening the app lands on step 1 with empty inputs (initial state at `src/App.tsx:2487-3357` is `phase: 'input'`, `inputs: null`, every array empty, every text field empty — preserved unchanged by this batch); switching workspaces does not load anything (no auto-restore runs); the sidebar still lists that workspace's saved projects (`filteredProjects` at `src/App.tsx:3022` is untouched); opening from the sidebar still works (`loadProject` at `src/App.tsx:5467` is unchanged); saving a new project still works and still lands under the right workspace (the auto-save path is unchanged for any non-empty snapshot; the workspace assignment at `src/App.tsx:4842-4844` is unchanged).

### 12.7 What this batch does NOT deliver

- **A 'resume last session' affordance.** Owner locked §12.5 #1 against it for now. The owner may reintroduce it later; if so, the answer to §11.4 #2 (IndexedDB workspaceId migration) returns, and the autosave's `resolvedWorkspaceId` chain at `src/App.tsx:4842-4844` will need the additional cross-workspace resume guard at §11.4 #3.
- **A fix for the white-screen report.** Per §12.4, the restore path is not the source. The crash originates elsewhere; investigation is not done here. **Update from §13 below:** §13 closes one of the candidate crash paths in this exact file (loadProject → state-becomes-undefined → auto-save reads `.length`), but the original report remains unrooted.
- **A regression test for the empty-snapshot guard.** See §12.6 — the guard is in an App-level `useEffect` and the existing vitest harness is component-scoped. A future batch could extract the guard to a pure helper (`isEmptySnapshot(state) → boolean`) and pin it with a unit test; that's a separate refactor. **Landed in §13.**

### 12.8 Files touched

- `src/App.tsx` — removed the auto-restore branch in the history-engine effect; added the empty-snapshot guard in the auto-save effect; updated nine comment blocks to record the removal (`hasRestoredRef`, `projectEstablishedRef`, the cap-detection comments, `migrateProjectInputsShape`, `detectStrippedAssets`, the section dividers). No new imports, no new exports, no type changes, no schema, rules, or backend changes.

---

## 13. Empty-snapshot guard extraction (Phase 4 Batch 3 follow-up)

**Branch:** `969-phase-4`. Batch 3 follow-up committed after the owner accepted the live-session verification in §12 and asked §12.7 #3 to land in this batch instead of a later one.
**Author:** extraction + 30-test pure-helper regression suite. Three files touched.

§12.7 listed the guard's lack of a regression test as a "non-deliverable". §12.6 named the structural reason: the predicate lived inline in a `useEffect` inside the 13,600-line App monolith, and the vitest harness is component-scoped, so testing it directly would require mocking the entire App with its Firebase context. That combination — load-bearing logic, no test, buried where nobody reads — is exactly how the empty-snapshot bug got there in the first place. The fix is structural: move the predicate to a pure function and pin it.

### 13.1 The extraction

**New file: `src/utils/isEmptySnapshot.ts`** (108 lines). Exports one pure function `isEmptySnapshot(s: SnapshotShape): boolean` and a narrow input type `SnapshotShape`. The type admits exactly the ten fields the predicate reads — `inputs`, the five arrays (`mockupHistory`, `carouselSlides`, `batchResults`, `batchCaptions`, `batchHookGroups`), and the four text fields (`tovText`, `conceptsText`, `buildPlan`, `captionText`). A wider type would invite callers to pass more than the function reads and hide what it depends on.

**The implementation.** Three rules:

1. `inputs != null` → `false` (any non-null object is content; `getDefaultInputs()` returns an object with all-empty strings, but the user typed into it, so it's a real draft — drilling into field-level emptiness here would duplicate work the downstream cap-detection already does).
2. `(arr?.length ?? 0) > 0` for each of the five arrays. The `?.` and `??` make `undefined` arrays safely count as empty.
3. Truthy check on each of the four text fields. `''` falls through to "empty"; `undefined` falls through too (truthy check covers both).

**The wiring.** `src/App.tsx`'s auto-save effect (the same one the inline guard lived in at the old `src/App.tsx:4757-4768`, now at `src/App.tsx:4754-4773`) calls the helper with an explicit ten-field object. The helper import is `import { isEmptySnapshot } from './utils/isEmptySnapshot';` added to the existing utils-import block at `src/App.tsx:15`.

### 13.2 The behaviour change vs. the inline guard (the white-screen mechanism)

The inline guard used `mockupHistory.length === 0` and four sibling `.length` reads. If any of those arrays is `undefined`, that read throws `TypeError: Cannot read properties of undefined (reading 'length')` — the exact error shape the white-screen report names.

That crash is reachable. `loadProject` at `src/App.tsx:5467` calls `setMockupHistory(p.mockupHistory)`, and a malformed SavedProject whose doc lacks the `mockupHistory` field lands `undefined` in state. On the next render the auto-save effect fires, reads `mockupHistory.length`, and crashes. §12.4 listed this as a candidate mechanism for the white-screen report and explicitly noted that the inline guard did NOT survive it.

**The helper does.** `(arr?.length ?? 0) > 0` is `false` for `undefined` and `[]`; the predicate returns `true` (snapshot is empty → save skipped, no throw). Tests §13.4 #5 below pin this for every array field individually, plus a "every field undefined" worst-case fixture.

The behaviour change is therefore strictly an improvement: where the inline guard crashed, the helper saves no work and continues normally; where the inline guard saved nothing (the empty-fresh-mount case), the helper also saves nothing — same outcome.

### 13.3 Other emptiness-check patterns on the same fields

The owner asked §3 to confirm there is no other inline duplicate of the auto-save guard. Searched: every reference to `mockupHistory.length === 0`, `isEmpty`, `stepsWithData`, `hasMeaningfulData`, `hasData` across `src/`. One related-but-distinct predicate surfaces, which is worth naming so it doesn't drift later:

**`src/lib/projectStepsData.ts:7` — `stepsWithData(p)`.** Returns a per-step boolean record (`input`, `tov_review`, `concept_review`, `render_studio`, `primary_text`) for a *saved* `SavedProject`. It is a read-side predicate the `SavedProjectCard` and `loadProject` use to render which steps a project has reached. It is **not** the same shape as `isEmptySnapshot`:

- Input is a `Pick<SavedProject, ...>` of nine fields, not a live-state `SnapshotShape` of ten. `stepsWithData` reads `selectedTov`; `isEmptySnapshot` reads `conceptsText`.
- The `input` check uses `Object.keys(project.inputs ?? {}).length > 0` — that counts the number of keys in `inputs`, so a saved AdInputs with all-empty string fields still registers as "has data" because the keys exist. `isEmptySnapshot` uses `inputs != null` — same object identity, no field drilling.
- `stepsWithData` operates on a *persisted* doc (loaded from Firestore / IndexedDB). `isEmptySnapshot` operates on the *live session* state the auto-save effect snapshots.

Substituting one for the other would be wrong in both directions. **No change made** to `stepsWithData` in this batch.

No other file contains the same inline emptiness predicate. The auto-save effect's gate is the only consumer of `isEmptySnapshot`.

### 13.4 The test file

**New file: `src/__tests__/isEmptySnapshot.test.ts`** (227 lines, 30 tests). Five `describe` blocks mirror the five distinctions the owner named:

1. **Blank snapshot is empty** (the case the guard exists for) — 2 tests.
2. **Each field alone makes the snapshot non-empty** — 10 tests, one per field. If someone drops a field from the predicate in a future refactor, exactly one of these fails and the failing test name names the dropped field.
3. **Empty string is NOT content** (text fields) — 4 tests (`''` is empty for each text field) plus 1 defensive test that `' '` (whitespace) IS content (the predicate reads truthiness, not trimmed length — a separate concern from any rendering-layer trimming).
4. **Empty array is NOT content** (array fields) — 5 tests (`[]` is empty for each array).
5. **Undefined and null are handled safely** — 8 tests: every-field-undefined (worst case), each array-undefined individually (the §12.4 crash path), `inputs: undefined` (the type permits it), and the reverse case (a single array present alongside every other array undefined → still non-empty, so a future partial-restore path can't accidentally regress to "everything missing means save").

The test file uses a `blank(overrides?)` helper that returns a fully-empty `SnapshotShape` with the supplied overrides, so each test's setup is one line.

### 13.5 Verification

```powershell
cd "D:\proads-worktrees\969-phase-4"
npm run build          # EXIT 0
npx vitest run         # EXIT 0
cd functions
Remove-Item -Recurse -Force lib
npm run build          # EXIT 0
npm test               # EXIT 0
```

```text
$ npm run build
> tsc -b && vite build
vite v7.3.5 building client environment for production...
✓ 125 modules transformed.   # was 124 — one new file
✓ built in 17.81s
EXIT: 0
```

```text
$ npx vitest run
RUN v4.1.4 D:/proads-worktrees/969-phase-4
Test Files  9 passed (9)        # was 8 — one new file
Tests       136 passed (136)    # was 106 — +30 from isEmptySnapshot.test.ts
Start at    22:21:09
Duration    13.11s
EXIT: 0
```

The new file alone, verbose (so each assertion name is visible):

```text
$ npx vitest run --reporter=verbose src/__tests__/isEmptySnapshot.test.ts

isEmptySnapshot — blank snapshot is empty (the case the guard exists for)
  ✓ a fully blank snapshot returns true (everything at its empty default) 2ms
  ✓ every field null + every array empty + every text '' is empty 0ms

isEmptySnapshot — each field alone makes the snapshot non-empty
  ✓ inputs alone (everything else blank) → non-empty 0ms
  ✓ mockupHistory with one entry (everything else blank) → non-empty 0ms
  ✓ carouselSlides with one entry (everything else blank) → non-empty 0ms
  ✓ batchResults with one entry (everything else blank) → non-empty 0ms
  ✓ batchCaptions with one entry (everything else blank) → non-empty 0ms
  ✓ batchHookGroups with one entry (everything else blank) → non-empty 0ms
  ✓ tovText alone (everything else blank) → non-empty 1ms
  ✓ conceptsText alone (everything else blank) → non-empty 0ms
  ✓ buildPlan alone (everything else blank) → non-empty 0ms
  ✓ captionText alone (everything else blank) → non-empty 0ms

isEmptySnapshot — empty string is NOT content (text fields)
  ✓ tovText: '' is empty 0ms
  ✓ conceptsText: '' is empty 0ms
  ✓ buildPlan: '' is empty 0ms
  ✓ captionText: '' is empty 0ms
  ✓ tovText: ' ' (whitespace) is NOT empty — content includes non-empty trimmed strings 0ms

isEmptySnapshot — empty array is NOT content (array fields)
  ✓ mockupHistory: [] is empty 0ms
  ✓ carouselSlides: [] is empty 0ms
  ✓ batchResults: [] is empty 0ms
  ✓ batchCaptions: [] is empty 0ms
  ✓ batchHookGroups: [] is empty 0ms

isEmptySnapshot — undefined and null are handled safely
  ✓ every array undefined (no .length access) → still returns a value (does not throw) 1ms
  ✓ mockupHistory: undefined alone (the §12.4 crash path) → no throw, treated as empty 0ms
  ✓ carouselSlides: undefined alone → no throw, treated as empty 0ms
  ✓ batchResults: undefined alone → no throw, treated as empty 0ms
  ✓ batchCaptions: undefined alone → no throw, treated as empty 0ms
  ✓ batchHookGroups: undefined alone → no throw, treated as empty 0ms
  ✓ inputs: undefined (not just null) is treated as empty 0ms
  ✓ a single array present alongside every other array undefined → non-empty (the field-still-matters check) 0ms

Test Files  1 passed (1)
     Tests  30 passed (30)
EXIT: 0
```

```text
$ cd functions; npm run build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
EXIT: 0
```

```text
$ cd functions; npm test
… (full chain — same shape as §12.6) …
contractFixtures.test: PASS
EXIT: 0
```

The functions suite is untouched by this frontend-only change. The same exit codes as §12.6 confirm no regression.

### 13.6 What this batch does NOT deliver

- **A fix for the white-screen report (the original report).** This batch closes the *candidate* crash path the §12.4 walk named — the auto-save effect reading `.length` on a `mockupHistory` that `loadProject` set to `undefined`. The original report (against an unspecified minified stack) remains unrooted. The two arrays-out-of-five undefined cases the test pins are the most plausible mechanism; if the white-screen reproduces in the next live verification, that path is now closed and the search moves elsewhere.
- **A test for `stepsWithData`.** §13.3 notes it as a related-but-distinct predicate. Out of scope for this batch.
- **An `isEmptySnapshot` consumer in the cloud sync round-trip.** The cloud write path is gated on `workspaceReady` (`src/App.tsx:4674-4688`) and the `stripHeavyImageData` stripper. Empty snapshots still go through to Firestore if the auto-save's local-only queue ever accepted one — the auto-save's `saveProjectToDB` followed by the `saveProject` callable is the second layer. Adding `isEmptySnapshot` to the second layer is a defense-in-depth move that this batch does not make; the local auto-save's gate is the only place the bug can enter, and that gate is now pinned.

### 13.7 Files touched

- `src/utils/isEmptySnapshot.ts` — **new**. 108 lines. Pure function + narrow input type + safety-contract docstring.
- `src/__tests__/isEmptySnapshot.test.ts` — **new**. 227 lines. 30 tests across 5 `describe` blocks.
- `src/App.tsx` — imported the helper (one line added to the existing utils-import block at line 15); replaced the ten-line inline predicate with a ten-line helper call (lines 4754-4773). Net change +18 / -13.
- No schema, rules, or backend changes. No changes to any other file.
