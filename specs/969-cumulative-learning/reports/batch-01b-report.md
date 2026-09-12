# Batch 1B — efficiency contributes exactly once, and the collisions it creates

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Files touched**: `specs/969-cumulative-learning/spec.md` only.
**Not touched**: no file under `functions/src/` or `src/`, no test, no `package.json`.

Ids — no renumbering, no duplicates. New section **B3** (`FR-077` … `FR-086`),
plus letter suffixes on existing ids:

```
FR-002a  FR-005e  FR-054a FR-054b FR-054c FR-054d  FR-072a FR-072b (1A final)
FR-074g  FR-077 FR-077a FR-078 FR-079 FR-080 FR-081 FR-082 FR-083 FR-084 FR-085 FR-086
=== dupes === (empty=none)
```

One id was corrected during the stage: `FR-005-0` broke the naming convention and
became **`FR-005e`**, repositioned after `FR-005d` so suffixes read in order — the
same fix applied to `FR-074c` in the addendum.

**No new success criteria in this stage.** They are Stage 1C's subject, and the
1C instruction already names the two this stage creates (write-once, day
finalisation). Adding them here would scatter the pass.

---

## FR-074f corrections (carried in from the 1A final review)

### Gap 1 — the derivation rule: `FR-074g`

Both questions answered explicitly, in the manner of FR-036c.

- **Eligibility is ANY-ROW.** A creative is eligible when at least one row
  satisfies the criteria. An all-rows rule is forbidden and the reason is stated:
  a propagated-only row carries a null `matchType` (FR-074f) and fails the per-row
  predicate individually, so all-rows would make **every creative containing a
  propagated row ineligible**, inverting FR-074d's purpose.
  - **Why any-row is safe rather than merely convenient**, as you noted: a
    propagated link **cannot exist unless at least one row in its group carries a
    real link** — FR-074 and FR-074b both propagate *from* a directly-matched or
    manually-linked row. Propagation has no other source, so an eligible creative
    always contains at least one real link and any-row can never admit a creative
    resting on nothing.
- **Aggregation is ALL-ROWS.** Once eligible, every row's measured values
  aggregate, not only the individually-eligible ones. An eligible-rows-only rule
  would make propagation achieve nothing — the propagated rows *are* the
  placements FR-073 exists to consolidate, and excluding them returns the record
  to one placement per creative.

### The cascade check — confirmed, and it surfaced a dependency

**Confirmed true, and it is not a hole.** `generationDeleteCascade.ts:70-72` queries
`.where("generationId", "==", generationId)` and marks every matching row, so a
creative is never half-cascaded and any-row eligibility cannot leave a cascaded
creative eligible through an unmarked row.

**But the check surfaced something worth recording, which I have added:** that
guarantee **depends on FR-074d's persistence**. Because the propagated
`generationId` is written to the row, the cascade's equality query matches
propagated rows too. Had the link been derived only, propagated rows would carry no
stored `generationId`, the cascade query would **miss them**, and a creative
**would** be half-cascaded. **FR-074d's persistence is therefore load-bearing for
FR-014**, not only for contribution continuity. That dependency is invisible from
either requirement read alone, so it is stated in FR-074g.

### Gap 2 — the success criterion: `SC-029c`

Added rather than deferred, since FR-074f is a behavioural change and SC-008 only
asserts that a creative contributes *once*, not that its contribution *includes*
its propagated rows.

> A creative whose group contains **one** directly-matched row and **several
> propagated-only** rows contributes the **aggregate of all its rows'** measured
> values, not only the matched row's.

The fixture is specified so it can actually fail: the propagated rows must carry
**materially different** measured values from the matched row, so an
eligible-rows-only implementation produces a visibly different number rather than
an accidentally equal one. The same construction covers the negative — a creative
with no eligible row contributes nothing.

### The Assumption

Widened as you asked. It now states that **values from rows which individually fail
the per-row predicate do enter learning through their creative**, notes this follows
from FR-074's "aggregate over all rows in the group" and so is not new in this
commit, and says why it is spelled out: it is the sentence a planner checks when
deciding what data reaches the aggregates, so the reading must not be left neutral.

---

## Efficiency contributes exactly once — new section B3

| Id | What it establishes |
|---|---|
| **FR-077** | Eligible when **(a)** 5 combined conversions across all placements, **or (b)** stopped running with ≥1. Zero conversions never contributes. |
| **FR-077a** | The split-conversion effect (below). |
| **FR-078** | Before eligibility, usage and click-through still contribute. |
| **FR-079** | Written once, never revised. |
| **FR-080** | Withdraw-then-add survives only for attribution changes (FR-011(b) / FR-013). |
| **FR-081** | Condition (a) accrues per day from `last7DaysDaily` — **no new Graph call**. |
| **FR-082** | Named **"conversions across days observed"**, never "lifetime". Three undercount caveats. |
| **FR-083** | A day stays **revisable while in the window**, finalised only on exit. |
| **FR-084** | Deduplication key is **(ad row id, date)**. |
| **FR-085** | Condition (b) from `status` — already fetched, currently discarded. |
| **FR-086** | Operational dependency on the daily dispatcher; days-lost count in the summary log. |

### `FR-011(a)` narrowed, not deleted

Amended in place with the reasoning you specified: it continues to apply to the
**target-independent** measures and **MUST NOT** re-evaluate the efficiency figure.
Recorded why deletion was wrong — FR-011(a) is also what keeps click-through and
cost-per-thousand current through FR-017's withdraw-then-add, and FR-024 requires
those to widen to all-time rather than freeze, so deleting it would freeze them at
first contribution. Narrowed in *scope of measures*, not removed.

### The threshold justification

Recorded in the spec's `*Justification*` style, verbatim in substance: at 2 one
lucky sale halves the apparent cost per result; at 5 an outlier moves it roughly
20%; at 10 the data is cleaner but almost nothing on a Gulf coaching account would
qualify — and a gate nothing passes switches the measure off.

`FR-079` adds the consequence that follows: a creative contributing at exactly 5 and
later reaching 500 **keeps the figure computed at 5**. Deliberate — the alternative
is the live feed the narrowing exists to stop — and it is why the threshold is 5
rather than 2.

### `FR-078`'s dependency, flagged as instructed

Recorded that usage and click-through do **not** accumulate today — each sync
rebuilds them — so FR-078 is a statement about the system **after** this feature,
made true by FR-024's widening, not a description of current behaviour.

### Both conditions AVAILABLE

**Condition (a)** — `FR-081` cites `fetchAdInsights7dDaily` (`metaGraph.ts:389-396`,
`time_increment: 1`), the shared `INSIGHTS_FIELDS` (`:362`, `:376`, `:393`) that
puts `actions` and `date_start` on every daily row, `countConversionActions`
(`shared.ts:355-370`) already accepting an array of rows, and the fact that these
rows are consumed today only by `spend7d` (`:284`), `peak1dCtr` (`:307`) and
`computeAgeDays` (`:1253`) — **the per-day `actions` arrays arrive every sync and
are never read.**

It also records, as you asked, that **the three-day window is a single aggregated
row and MUST NOT be used for this** — `fetchAdInsights3d` sends no `time_increment`
(`metaGraph.ts:353-366`), the code says so at `shared.ts:294`, and the `.reduce()`
calls at `:220` and `:266` iterate a one-element array while reading like a per-day
series. Stated so the misreading is not repeated.

**Condition (b)** — `FR-085` cites `status` requested at `metaGraph.ts:83`, typed at
`:145`, never read in `shared.ts`, and absent from `AdDoc` (`:170-211`). Records
that it **under-detects rather than mis-detects**: parent-level pauses are invisible
to it, an undetected stop means the creative simply never seals via (b), and the
failure mode is a **missing contribution, never a wrong one**. Notes that
`effective_status` on the same call would close the gap — one field plus one `AdDoc`
member — and that it is **not required** by this feature.

### Day accrual — the two rules

**`FR-083` — do not finalise on first observation.** Written exactly as you
specified, with the exposure stated in full: the seven-day-excludes-today claim is
the **repository's own assertion**, at `shared.ts:183-186` and `:281-283`, never
verified against Meta, and load-bearing — if false, every day is captured partial
and a no-op-on-sight rule freezes it there permanently, *"not an occasional
undercount but a systematic one, every day, on every creative."* Making a day
revisable until it leaves the window **removes the dependency entirely** and
**absorbs the late-attribution caveat**, since revisions arriving inside the window
are captured. The assertion is still recorded as unverified, with the design no
longer depending on it.

**`FR-084` — the key is (ad row id, date).** With why nothing coarser works:
(creative, date) collapses 55 placements' conversions for one day into one value and
**drops 54 rows of evidence**; ad row id alone re-adds every day the row is seen and
**double-counts**. Only the pair is both complete and idempotent.

**`FR-086`** records the dispatcher dependency (`dispatcher.ts:137`), the
six-absorbed / seventh-lost arithmetic, and adds the **days-lost-to-gaps count** to
the summary line alongside FR-076's provenance breakdown — with the reason: without
it the seventh missed sync is indistinguishable from the sixth.

---

## `FR-002` / `FR-003` — aggregate-then-divide, decided

Carried in from the addendum's deferral. **`FR-002a`** requires
**aggregate-then-divide**: sum realised cost and results across all the creative's
rows, divide to get one realised cost per result, then divide by the creative's
single sealed target. **Divide-then-average is forbidden.**

Justification: divide-then-average gives a one-result placement the same weight as
a fifty-result one, and across 55 rows a single freak row moves the figure
substantially — the **same fluke-domination problem FR-038 bounds at the aggregate**,
which must not be reintroduced one level down. Aggregate-then-divide is what
FR-021's raw sums and counts exist for, and what FR-077 already presumes in
counting *"combined conversions across all placements"*.

**Recorded coupling**: aggregate-then-divide needs a **single denominator**, which
is exactly why FR-012a fixes one sealed target per creative. The two requirements
are load-bearing for each other.

`FR-002` itself is re-based: the figure is **stored per ad row** (FR-016's storage
location) and **computed at the creative** (FR-073's unit).

---

## The four collisions

**1. Sealing versus contributing — `FR-005e`.** States them as two separate events
and explains why **no third state was added**: FR-005a's states describe whether an
*evaluation context* exists, while eligibility is a property of accumulated
conversions. Encoding it as a state would make the machine two-dimensional and put
FR-005c's one-way guarantee at risk for no gain. Also distinguishes FR-006's
**explicitly absent** figure (a final answer) from FR-077's **not-yet-determined**
one (which may become a number) — the first never becomes a number, the second may.

**2. `FR-005c` carve-out.** The first efficiency write is explicitly permitted
through the guard, with the boundary drawn: it permits not-yet-determined → a
number, **once**; it does not permit the sealed target, funnel type or moment to
change, a second write, or a return to PROVISIONAL. Adds the implementation
warning — the guard MUST test the **specific transition**, since "reject any write
to a SEALED contribution" blocks FR-077 and "allow any write" readmits everything
FR-005c forbids.

**3. `FR-051d`'s volume table row rewritten.** Refresh withdrawal now applies to
target-independent measures only, because FR-011(a) no longer re-evaluates
efficiency and FR-079 makes it write-once. The row states plainly that the
reasoning which made withdraw-then-add *"the modal outcome for every active ad"*
**no longer holds for the figure that reasoning was about.**

**4. Stacked gates.** Recorded on FR-037 as a consequence, **neither value
changed**: 5 conversions per creative × 3 creatives = **15 conversions on one angle
before efficiency affects rank at all**. Noted that 5 and 3 each look modest alone
and their product does not, that on a Gulf coaching account this is weeks versus
months, and that it compounds with FR-034's creative-counting change in the same
direction. FR-037's earlier "open dependency on Stage 1B" note is now marked
**closed** by FR-077 and FR-002a.

---

## The split-conversion effect — `FR-077a`

Stated where the threshold is defined, as instructed, and **not** added to
FR-074b's limitation block.

One cause, two errors in **opposite** directions: FR-074b's split **inflates** the
creative count (guidance fires early), while the same split **divides the
conversions**, so a creative split in two may reach 5 in neither half where the
whole would have cleared it — and its efficiency figure is **never contributed at
all**.

The consequence recorded: **they do not cancel.** An account can activate guidance
early on inflated usage while efficiency stays switched off far longer than the
stacked-gate arithmetic predicts. FR-076's provenance breakdown is the only signal,
since a low direct-match count is the precondition for splitting.

---

## Lease scope — `FR-054a` … `FR-054d`

- **`FR-054a`** — the lease MUST be **inside `runSyncForAccount`, around the
  learning write**, not at the orchestrator level. Every route passes through
  `runSyncForAccount`; an orchestrator-level lease does not.
- **`FR-054b`** — **Phase 970's lease MUST NOT be cited as satisfying this
  requirement.** `runFullSyncWithLease` (`orchestrator.ts:824`, acquiring at `:841`,
  wrapping at `:871-873`) leases the manual inline route, but `metaSyncAccountWorker`
  imports `runSyncForAccount` directly (`worker.ts:19`) and calls it at `:61` with
  no lease — so the fan-out and the entire 03:00 cycle reach the learning write
  **unleased**, and that is the route carrying most of the volume. Also records the
  scope difference: 970's lease is per **owner** with a 10-minute TTL
  (`lease.ts:52`, `:53`, `:77`); this one is per **account**.
- **`FR-054c`** — the threat model, concrete: **no platform dedup exists** (neither
  enqueue site supplies a task name — `orchestrator.ts:588-611`,
  `dispatcher.ts:162-179`); `maxConcurrentDispatches: 5` is **queue-wide**, not
  per-account (`worker.ts:39`); and three independent routes to a same-account pair
  (separate enqueuers, `maxAttempts: 3` retrying over a live original,
  `seenAccounts` deduplicating within one run only). With the reason it matters
  more now: **under overwrite semantics two workers write the same value twice
  harmlessly; under delta accumulation they add the same conversions twice,
  silently, into the figures that steer generation.**
- **`FR-054d`** — LEG A verified **not** to need coverage, recorded so it is not
  re-litigated: inside 970's lease, `await`-sequenced before LEG B
  (`orchestrator.ts:652`), five write paths none of which the learning path reads
  (the `shared.ts` `adPerformance` references are the *workspace subcollection*
  under `adAccountRef`, `:818-821`, not the root collection LEG A writes;
  `learningAggregates.ts` is pure). The one shared field, `lastMetaSyncAt`, is read
  by **no gate** — the cooldown that read it was removed, and `lease.ts:31-35`
  deliberately keeps the lease on a separate document to prevent aliasing.

## `FR-059` corrected

The TTL justification's second self-clearing argument is struck: *"the manual path
carries a 1-hour cooldown"* is **FALSE as of Phase 970** (`trigger.ts:8`, `:54`;
`orchestrator.ts:476`, `:651`). Recorded that nothing now rate-limits a second
manual press except the in-flight guard, so a stranded lease **can** be met by a
legitimate manual attempt inside the TTL. **The 15-minute value is retained on the
platform-ceiling argument alone**, which does not depend on the cooldown; the
manual-path half is struck rather than left propping it up.

---

## Considered and deliberately left alone

| Id | Why |
|---|---|
| **FR-005, FR-005a, FR-005b, FR-005d** | Unchanged. FR-005e separates two events *around* the state machine without altering the states, the transition point, or the moment-of-sealing rule. |
| **FR-006** | Unchanged. FR-005e clarifies its relationship to FR-077 (absent ≠ not-yet-determined) without changing what FR-006 requires. |
| **FR-008 – FR-010** | Operational status, per row. Untouched. |
| **FR-011(b), FR-011(c), FR-012, FR-012a, FR-013, FR-014** | Scoped in the 1A revision; Amendment 2 narrows only (a). FR-080 confirms (b) still drives withdraw-then-add. |
| **FR-015 – FR-023** | Accumulation mechanics. FR-084's key sits inside them rather than replacing them; FR-021's raw sums are cited as the reason FR-002a works. |
| **FR-024** | Unchanged and now load-bearing — FR-078 depends on it. |
| **FR-034, FR-034a values** | Untouched. Only FR-037 gained the stacked-gate consequence, and no value moved. |
| **FR-038** | Unchanged. Cited in FR-002a as the precedent for not letting one row dominate; the 3.0 bound still applies at the aggregate. |
| **FR-055 – FR-058, FR-060 – FR-065** | Lease mechanics — atomicity, holder identity, release, manual/scheduled divergence, fencing. All unaffected by *where* the lease is placed. FR-054a changes placement, not mechanism. |
| **FR-066 – FR-072b** | Ledger durability and bounded reads. Unaffected: a by-ID read of the current batch is still per row, and FR-084's per-day key lives on the row the read already returns. |
| **SC-001 – SC-029c** | **No SC added or changed in this stage.** Stage 1C is the success-criteria pass and its instruction already names write-once and day-finalisation. Adding them here would split the review surface. |

**Stopping here. Stage 1C not started.**
