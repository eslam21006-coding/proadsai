# Batch 1C — four corrections, success criteria for every unasserted requirement, checklist Iteration 5

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Files touched**: `specs/969-cumulative-learning/spec.md`,
`specs/969-cumulative-learning/checklists/requirements.md`.
**Not touched**: no file under `functions/src/` or `src/`, no test, no `package.json`.

```
 .../checklists/requirements.md | 43 +++++++++++++++++++++-
 specs/969-cumulative-learning/spec.md | 43 +++++++++++++++++++---
 2 files changed, 79 insertions(+), 7 deletions(-)
```

**No correction turned out to be wrong and none conflicted with 1C**, so this is
one pass and one commit as instructed.

Success-criteria ids after the pass — no duplicates, `SC-017a` positioned directly
after `SC-017`:

```
SC-001 … SC-017 SC-017a SC-018 … SC-029 SC-029a SC-029b SC-029c
SC-030 SC-031 SC-032 SC-033 SC-034 SC-035 SC-036 SC-037 SC-038 SC-039
SC-040 SC-041 SC-042 SC-043 SC-044 SC-045 SC-046 SC-047
dupes: (none)
```

---

## Correction 1 — FR-059's clarification rewritten; it did contradict FR-054b

You are right and the contradiction was mine: FR-054b cited FR-059 as *"already
notes"* when FR-059 noted the opposite. Both halves are fixed.

FR-059's Phase 970 clarification now states:

- The two are **different documents with different keys** — the in-flight sync
  guard is per owner (`metaSyncLeases/{ownerUid}`, `lease.ts:52`, `:77`, `:115`,
  `:172`) with a 10-minute TTL (`lease.ts:53`); the learning-write lease is **per
  ad account**, in its **own collection**, keyed on the (owner, ad account) pair.
  The collection name is a planning choice; **the key is a contract**.
- The merged-artifact sentence is **struck, not softened**, with the reason: a
  lease keyed on `ownerUid` **cannot serialise per account** — an owner with three
  accounts would have all three contending for one document, so the learning write
  for account A would block account B, and a manual press holding the guard would
  block the learning write for **every** account that owner has. FR-054a places the
  lease inside `runSyncForAccount`, which runs per account, so the merged design
  **cannot express the requirement** rather than merely being undesirable.
- What may still be shared is the record **shape** (holder identity plus absolute
  expiry, FR-057); what may not be shared is the **document** or the **key**.

FR-054b's cross-reference is corrected to say FR-059 *previously said the opposite
and has been corrected*, rather than claiming an agreement that did not exist.

### Does any other requirement inherit the merged-artifact assumption?

**No — it was confined to that one clarification.** Checked every mention:

| Location | Status |
|---|---|
| **Key Entities → Learning Lease** | **Already correct** — *"one short-lived record **per ad account**"*. It agreed with FR-054b, not with FR-059. |
| **FR-056** | *"a database transaction over a **single lease document**"* — this is the **atomicity primitive** (one document per lease, so the transaction has one contended read), not a claim that the two leases share a document. Unaffected. |
| **FR-057, FR-058, FR-060–FR-064** | Mechanism only — holder identity, release, manual/scheduled divergence, fencing. Key-agnostic. Unaffected. |
| **Clarifications, session 2026-09-02** | Says *"serialize per account with a lease"* and *"a transaction over a single lease document"*. Consistent with the corrected text. |
| **SC-018, SC-019, SC-020** | Assert TTL expiry, post-takeover silence, and scheduled retry. None depends on the key. Unaffected. |

So the merged assumption existed in exactly one place and is now gone.

---

## Correction 2 — FR-083 is upward-only

Applied as decided. A still-open day **MAY be raised and MUST NOT be lowered**; a
lower re-observation is a **no-op**, not an overwrite; a finalised day is untouched
in both directions.

Reasoning recorded as you gave it: FR-020's never-decreases guarantee stays
**unconditional** — the property the whole feature exists to provide, and easier to
trust and test than one carrying an exception; FR-082's monotonicity claim becomes
**secured rather than asserted**; SC-001, SC-003 and SC-013 need no qualification;
and the accepted cost is stated plainly — **an over-counted day stays over-counted
permanently** — against rare downward revisions versus a permanently broken
guarantee.

**FR-082's "none can overcount" sentence is corrected**, because this rule makes it
false. It now reads *"All three undercount"*, followed by a sub-bullet naming the
fourth inaccuracy as the **only over-count route**, and restating the real property
as **monotonically non-decreasing by construction** — which is what FR-020 and
FR-077 need, and which is explicitly a weaker claim than accuracy.

### Does Meta revise conversion counts downward?

**Not verifiable from this repository, and I will not assert it either way.**

What is verifiable in-repo: conversion counts are read from the `actions` array
(`metaGraph.ts:105`) filtered through `RESULT_ACTION_TYPES` (`:499-506`), and
nothing in the codebase caches, compares, or reconciles a day's figure across
syncs — so the project holds **no evidence** of revisions in either direction, and
`adPerformanceHistory`'s overlapping windows cannot be differenced to produce any
(Batch 0, §Q1).

What is generally understood about the platform, flagged as **not verified here**:
attribution settles over time and counts predominantly move **upward** as
conversions are attributed after the click; Meta also performs deduplication and
invalid-activity filtering, which can move a figure **downward**; and Meta
publishes no monotonicity guarantee. So downward revisions are believed possible
and believed uncommon — which matches the assumption the decision was taken on,
but is **belief, not measurement**.

The size of the accepted cost is therefore **visible but unquantified**, and that
is recorded rather than smoothed over. A production measurement would need the
per-day figures this feature is the first thing to store, so it becomes answerable
only after implementation.

---

## Correction 3 — SC-017 now discriminates the route

You are right that SC-017 could pass on Phase 970's existing guard while FR-054a
went unimplemented. Amended to require:

- **The two contending runs arrive by different routes** — one inline through
  `runFullSync`, one through the Cloud Tasks worker (`worker.ts:19`, `:61`) — with
  the reason stated: two inline manual runs are already serialised by the per-owner
  guard and would pass **without any of FR-054a or FR-054b being implemented**.
- **The test MUST FAIL if the lease is placed at the orchestrator level** rather
  than inside `runSyncForAccount`. Stated as the criterion's purpose, so it is not
  weakened later into a generic concurrency test.
- **It must also fail if the lease is keyed per owner** rather than per account.

**`SC-017a` added** as the negative that a per-owner key would fail: two runs
writing learning for **different** accounts of the **same owner** both succeed,
neither refused. Without it, a per-owner lease passes SC-017 handsomely while
serialising accounts that should run in parallel.

---

## Correction 4 — FR-059's TTL argument, recorded not changed

Both inconsistencies recorded, **value unchanged**:

- The 540-second ceiling bounds a **whole sync**, but FR-055 scopes the lease to
  *"only the learning write … a small fraction of a sync"* — so the headroom is
  measured against a window the lease does not guard, making 15 minutes
  considerably larger relative to what it actually guards. Retained because no
  better-calibrated figure exists without production timing on the learning write,
  and because an over-long TTL **fails safe** (it delays a legitimate successor)
  rather than unsafe (it would permit two writers). Planning may revisit once the
  held window is measurable.
- With the cooldown gone, a stranded lease can be met by a legitimate manual press
  inside the TTL, while **FR-065's message says "try again in a few minutes"** —
  optimistic against a 15-minute worst case. **The English and Arabic strings are
  unchanged**, as instructed; the inconsistency is recorded so it is resolved
  deliberately rather than discovered by an owner who waited three minutes and was
  refused again. Carried into planning as needing an owner decision on wording.

---

## 1C-i — success criteria for every named requirement

| Requirement | Criterion | Note |
|---|---|---|
| **FR-002a** | **SC-030** | Discriminates the two formulas: fixture rows must carry **materially different** cost-per-result values, and the assertion names the expected number. A fixture where they coincide proves nothing. |
| **FR-005c carve-out** | **SC-031** | **Both halves**: first efficiency write permitted, **second rejected**. Records that asserting only the first passes a guard permitting everything, and only the second passes a guard permitting nothing. |
| **FR-005e** | **SC-032** | A withheld figure is distinguishable from FR-006's explicitly-absent one, and only the first can later become a number. |
| **FR-077** | **SC-033** | 5 contributes, 4 does not, 0 never does — plus the 5th conversion arriving on a **different ad row** still triggering eligibility, since the count is combined across placements. |
| **FR-078** | **SC-034** | Usage and click-through contribute in the same sync in which efficiency is withheld. |
| **FR-079** | **SC-035** | Contributes at 5, later reaches many more, retains **exactly** the figure computed at 5, across ≥3 subsequent syncs. |
| **FR-080** | **SC-036** | Performance change → **zero** efficiency withdrawals; attribution change → **exactly one**. Both in one test, so disabling withdrawal entirely cannot pass. |
| **FR-081** | **SC-037** | **Zero** additional Graph calls, verified by counting outbound insights requests against the pre-feature baseline. |
| **FR-082** | **SC-038** | Monotonically non-decreasing across every sequence, **including** one containing a lower re-observation. |
| **FR-083** | **SC-039** | All three: still-open day **raised**; same day **not lowered**; finalised day untouched. The first two together are what make it upward-only rather than frozen or overwriting. |
| **FR-084** | **SC-040** | Both failure modes the requirement names — coarser key **drops** rows, row-only key **double-counts** — asserted against the correct total. |
| **FR-085 / FR-077(b)** | **SC-041** | Stopped-with-conversion contributes; **and a parent-paused ad does not seal via (b), asserted as expected behaviour rather than a defect**. |
| **FR-086** | **SC-042** | Days-lost count **zero** through six consecutive missed syncs, **non-zero and correct from the seventh** — where loss begins. |
| **FR-054a / FR-054b** | **SC-043** | A run arriving through the Cloud Tasks worker is subject to the lease; a lease reachable only through `runFullSync` **fails**. |
| **FR-054c** | **SC-044** | Two concurrent `runSyncForAccount` invocations → one set of deltas, **zero** double-counted conversions, driven by the scheduled-versus-manual pairing. |
| **FR-074f** | **SC-045** | Distinct `matchType` values after a propagating sync remain **only** `"auto_hash"`, `"manual"`, `null` — the machine-checkable form of "no new enum value". |
| **FR-074g** | **SC-046** | All three cases in one criterion — any-row eligible, all-rows aggregate, no-eligible-row contributes nothing — because any two pass under a rule that gets the third wrong. |
| **FR-076** | **SC-047** | Four-way breakdown emitted every sync including zeros; **zero** emissions collapse it to a total. |

**Nothing on your list is silently uncovered.** Every one of the eighteen named
requirements received a criterion; none needed a "not assertable" note, because
each has observable behaviour. The requirements that genuinely have **no**
assertable behaviour are the three stated limitations, and those are handled in the
checklist rather than by inventing criteria for them.

---

## 1C-ii — every pre-existing success criterion re-read

| Criterion | Verdict |
|---|---|
| **SC-001** | **Survives, and is now stronger.** Asserts zero decreases after an economics change. Correction 2's upward-only rule removes the one path that could have breached it from inside the accrual. No qualification needed. |
| **SC-002** | Survives. Idempotency over a repeated payload — FR-084's (row, date) key and FR-083's no-op on finalised days are the mechanisms that keep it true at the new granularity. |
| **SC-003** | **Survives, unqualified**, for the same reason as SC-001. |
| **SC-004** | Survives. Sealed result immune to target change; FR-012a makes the sealed target single-valued per creative, which strengthens rather than alters it. |
| **SC-005, SC-006** | Survive unchanged. Funnel-type weighting is orthogonal to the unit of evidence and to efficiency timing. |
| **SC-007** | Survives. Guidance never switches off; FR-034's unit change alters when it switches **on**, not this. |
| **SC-008** | **Re-based in 1A** to creatives, with the 55-row fixture asserting **1**, not 55. |
| **SC-009** | Survives. All-time totals shown; the totals are now counts of creatives, which is what FR-040 already required them to be. |
| **SC-010** | Survives. **No owner-visible string is introduced by either amendment** — FR-076's counts and FR-086's are log lines, and FR-051e already bars owner-facing strings there. No Arabic was added or changed. |
| **SC-011** | Survives, and its scope grows: the amendments add fixtures, and FR-050's manifest-registration obligation covers them. |
| **SC-012** | Survives. Forced-failure isolation is unaffected by the unit or the accrual. |
| **SC-013** | **Survives, unqualified**, for the same reason as SC-001 and SC-003. |
| **SC-014** | **Re-based in 1A** to creatives, plus the case row counting used to admit. |
| **SC-015** | Survives. Sealed-target retention; FR-012a extends it across a creative's rows without weakening it. |
| **SC-016** | **Re-based in 1A** to creatives, plus the stay-at-one assertion when further rows appear. |
| **SC-017** | **Amended by correction 3**; **SC-017a** added as its negative. |
| **SC-018** | Survives. TTL expiry is key-agnostic. |
| **SC-019** | Survives. Post-takeover silence is key-agnostic. |
| **SC-020** | Survives. Scheduled retry on lease contention is unaffected by placement. |
| **SC-021** | Survives — and is now **in tension with FR-059**, since the message it validates says "a few minutes" against a 15-minute TTL. The criterion is about **language quality**, not accuracy, so it still passes as written; the accuracy problem is recorded under correction 4 and carried into planning. |
| **SC-022** | Survives. Ledger-read-failure isolation is unaffected. |
| **SC-023, SC-024** | Survive. Bounded reads and no-unbounded-scan are unaffected — a by-ID read of the current batch is still per row. |
| **SC-025** | **Survives and becomes load-bearing.** It requires the three FR-072 behaviours to be **identical** before and after. FR-072b's decision to count a propagated row as `unmatched` exists precisely to keep that true, so SC-025 now verifies the third provenance did not disturb them. |
| **SC-026** | Survives. One summary line per account; FR-076's and FR-086's counts are additional **fields on that line**, not additional lines. |
| **SC-027** | Survives. Skip-reason enumeration is untouched. |
| **SC-028** | Survives. No governed metric name or percentage is introduced by the new counts. |

---

## 1C-iii — the checklist

**Iteration 5 appended**, matching the style of Iterations 1–4: eighteen numbered
points covering Amendment 1, Amendment 2, the lease correction, the four correction
rounds, and the success-criteria work.

**Checklist re-run — one item flipped to failing:**

> - [ ] **Requirements are testable and unambiguous** — ❌ **FAILS as of Iteration 5.**

with the reason: three requirements now carry **deliberate, stated limitations that
are undetectable by construction** — FR-074b's unlinked split (*"nothing in this
feature detects it"*), FR-074e's hashless propagated row (*"frozen and
unverifiable"*), and FR-051e's governed-metric constraint (*"stated but not
enforced"*). Each is accepted and recorded, but **a passing tick would claim test
coverage that cannot exist**. Marked failing so the gap reaches planning rather
than being absorbed.

**One further item annotated rather than flipped:**

> - [x] Edge cases are identified — *note*: the list predates both amendments…

The consolidated edge-case list does not yet enumerate the creative-level cases
(partially-linked hash group, hashless propagated row, split creative's divided
conversions, a day revised downward). The requirements that introduce them state
their edge behaviour **inline** (FR-074b, FR-074e, FR-077a, FR-083), so nothing is
unhandled — this is a **documentation** incompleteness, not a specification gap, and
it is carried into planning as such. I left the tick rather than flipping it because
the behaviours are specified; flag if you would rather it were a cross.

**Carried into planning** gained five entries: the lease-inference primary risk; the
three accepted limitations with a note that near-hash clustering was **deliberately
rejected** and should not be reintroduced without treating it as a new design
decision; the FR-065 / FR-059 message inconsistency needing an owner wording
decision in both languages; and the edge-case consolidation task.

---

## Considered and deliberately left alone

| Item | Why |
|---|---|
| **FR-065's strings** | Explicitly instructed not to rewrite them in this stage. The inconsistency is recorded in FR-059 and carried into planning. **No Arabic was written or changed anywhere in this pass.** |
| **FR-059's 15-minute value** | Recorded as mis-calibrated, not changed — you asked for the inconsistency stated, not the number moved, and no better figure exists without production timing. |
| **FR-034 / FR-034a / FR-037 values** | Untouched throughout. |
| **The edge-case list itself** | Not rewritten. Consolidating it is a larger documentation pass and would have been scope creep inside a correction-plus-criteria commit; recorded as a planning task instead. |
| **FR-002, FR-003, FR-006, FR-011, FR-012, FR-012a, FR-013, FR-014** | Already settled in 1A and 1B; correction 2 touches only FR-082 and FR-083. |
| **Sections D–I generally** | Unchanged apart from FR-051b's count list (1A) and FR-051d's table row (1B). |

**Stopping here. `/speckit.clarify` not run.**
