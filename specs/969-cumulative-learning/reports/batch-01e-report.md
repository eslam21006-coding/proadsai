# Batch 1E — the five clarification answers written into the spec

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Files touched**: `specs/969-cumulative-learning/spec.md` only.
**Not touched**: no file under `functions/src/` or `src/`, no test, no `package.json`.

```
 specs/969-cumulative-learning/spec.md | 53 ++++++++++++++++++++++++++++++++---
 1 file changed, 49 insertions(+), 4 deletions(-)
```

Integrity after the pass — every cross-reference resolves, no duplicates:

```
FR defined: 123 | FR cited distinct: 123 | cited but NOT defined: (none)
SC defined:  56 | SC cited but NOT defined: (none)
FR dupes: (none)   SC dupes: (none)
SC-001 … SC-042 SC-042a SC-043 … SC-047 SC-048 SC-049 SC-050 SC-051
```

`## Clarifications` now carries two sessions: `### Session 2026-09-02` (four
questions, unchanged) and `### Session 2026-09-05` (five questions), following the
file's existing `- Q: … → A: …` convention.

---

## A process error I made, and corrected

An intermediate edit script wrote the file **before** checking whether all its
anchors had matched. One anchor failed (a multi-line anchor written with `\n`
against a working tree that git had checked out as CRLF), the script reported
`FAILED` and exited non-zero — **but the partial write had already landed**. My
retry then applied the same additions a second time, producing duplicate
`SC-042a`, `SC-048`, `SC-049`, `SC-050` and `SC-051` lines.

Caught by the id-integrity check, removed, and verified clean above. Recording it
because the near-miss is instructive: **the duplicates would not have changed any
requirement's meaning, so a reader reviewing prose rather than running the id check
would very likely have missed them.** The mechanical check is what caught it, which
is the same lesson as the citation-table re-derivation earlier in this review.

---

## Q1 — bounded retention: `FR-084a`

Written as **mandated**, not preferred, exactly as you framed it. The requirement
states the chain: **FR-071** requires whole-document by-ID reads, **SC-023**
requires read volume not to grow with account age, **FR-066** forbids pruning — so
unbounded per-day entries breach SC-023 *through* FR-071, because every sync would
read every day ever recorded for every ad in the batch. The 367,920-entries-per-year
figure is in the requirement.

Retention: in-window days only; on finalisation the entry is discarded and folded
into a **running finalised total** plus a **count of finalised days**.

Recorded as you specified:

- **Nothing is lost by collapsing** — FR-083 makes a finalised day immutable, and
  window membership is **pure date arithmetic**, so no stored flag is needed and a
  discarded entry can never be needed again.
- **Why the count and not only the total** — it lets the total be sanity-checked
  against the number of days that should have been observed, and it is FR-086's
  input. A total alone cannot distinguish a low figure from a short history.
- **Accepted cost against FR-051a** — the ledger can no longer answer *"which days
  composed this total"*. Stated as consistent, with the reason: FR-051a's guarantee
  is over **contributions to aggregates**, not over day-level accrual.

**`SC-050`** asserts it: after a sequence spanning far more days than the window,
stored entries per row equal the window size and do not grow with account age; and
the finalised total and count equal the sum and number of days discarded, so
collapsing loses no arithmetic.

---

## Q2 and Q3 — one rule, stated once: `FR-087`

> **The efficiency figure is RECOMPUTED when the creative's set of rows changes. It
> is CARRIED ACROSS UNCHANGED when only its destination changes.**

Placed as a single requirement with your rationale — the figure is a function of
the rows and the sealed target (FR-002a, FR-012a); unchanged inputs must give an
unchanged output, and a genuinely changed row set means the previous figure was
computed over an incomplete set. **Referenced from FR-013, FR-074b, FR-079 and
FR-080 rather than restated**, as instructed.

### Q2 — carry across

`FR-087(i)`. The where/what distinction is written into both requirements: FR-080
moves **where** the figure is counted, FR-079 governs **what the number is** — and
the spec now says they are orthogonal once that is stated, so **SC-035 and SC-036
both hold and neither depends on the other's reading**.

### Q3 — recompute over the union; earliest sealed target survives

`FR-087(ii)`, plus three supporting edits:

- **`FR-012a` rephrased**, not supplemented: *"the first row of that creative to
  seal"* → *"the **earliest-sealing row among all rows now belonging to the
  creative**"*. A sub-bullet records **why the wording is deliberate** — the old
  phrasing is well-defined only for a creative whose membership never changes, and
  undefined the moment a merge joins two groups that have each already sealed,
  reproducing the multi-target condition FR-012a exists to forbid. The new phrasing
  makes a merge simply widen the set the rule ranges over, so no separate merge rule
  is needed.
- **`FR-013a` added** for the two-withdrawals-one-addition shape FR-013's one-for-one
  wording did not cover: withdraw both, recompute over the union against the
  surviving target, add exactly one. **Ordering is specified** — both withdrawals
  complete before the addition, so no intermediate state counts the creative twice —
  and the one-sided and neither-sided cases are covered, with a pointer to FR-077a
  for the case where the union reaches eligibility sooner than either half.
- **A merge is an identity correction** and belongs under FR-080's exception, not
  FR-079's prohibition. Stated explicitly, because the natural reading of FR-079
  forbids it.

**`SC-048`** asserts the merge case, which nothing previously did — SC-029a only
asserted that a merge yields one creative, not what its figure is. Written to
discriminate: the two halves must carry **materially different figures** and
**different sealed targets**, so neither carrying one half forward nor averaging
the two can pass; and the intermediate state is asserted, so the creative is never
counted twice or zero times.

---

## Q4 — `FR-085a` and `FR-086a`

**`FR-085a`** — an absent daily row means the ad did not deliver: **not observed,
never zero**. Recorded that writing zero is drawing evidence from absence, which
the edge-case list already forbids for an ad and applies identically to a day; and
that the two readings converge for a day that already has a value under upward-only
but **diverge on first observation** and on whether a never-delivered day is
finalised at zero or never observed.

**`FR-086a`** — the distinction the question did not draw, written as the more
consequential half:

| Case | Gap? |
|---|---|
| Date **inside** an observed window, no row returned → the ad did not run | **No.** Does not increment. |
| Date **outside every observed window** because syncs were missed | **Yes.** Increments. |

With the reason it is load-bearing, in the terms you gave: a paused or low-budget ad
produces absent rows constantly, so conflating them would make the count non-zero
continuously, an operator would learn to ignore it, and **a real seven-day outage —
the thing SC-042 exists to catch — would arrive as noise inside noise. The count
must be zero in normal operation to function as an alarm at all.** And the test is
clean, because window coverage is pure date arithmetic from the sync's own bounds.

**`SC-042a`** asserts the distinction in one test with both cases present, and
states the failing condition: a count that rises for a non-delivering ad fails.
**`SC-051`** asserts FR-085a directly.

---

## Q5 — `FR-060a`, ordering rather than a trade

You were right and my framing was wrong. **Signalling failure does not roll back a
committed write**, so there is no freshness-versus-retry trade to make. The
mandatory sequence is written in:

1. Fetch, compute, and **commit** the operational status writes FR-009 requires.
2. **Then** attempt the learning-write lease.
3. On failure, signal in the form the task infrastructure acts on (FR-060) —
   **after step 1 has committed**.

Recorded: the retry re-applies the operational writes harmlessly, because
**FR-055's own rationale already establishes they are "idempotent overwrites of
per-ad facts"**; nothing is discarded; and FR-052's guarantee is intact because the
learning failure did not break the sync's operational work.

**Why it is stated explicitly** is written into the requirement: the wrong ordering
— lease before commit, or throwing without committing — is the natural thing to
implement, and nothing in FR-052, FR-054a or FR-060 as previously worded forbade
it. The consequence of getting it wrong is spelled out: a contended account's ads
silently stop having a current operational status while every retry re-fetches the
whole account.

One extension I added: **the manual path too.** FR-060's fail-fast message and
FR-065's string are emitted after the operational writes commit, so an owner told a
refresh is already running still gets a current action list from the run that told
them. Flagging it as an addition rather than a restatement.

**`SC-049`** asserts both halves in one test — zero ads left stale **and** the
failure signal emitted — and names the failing implementation: attempting the lease
before committing operational writes.

---

## Everything added in this pass

| Id | Answer |
|---|---|
| **FR-084a** | Q1 — bounded per-day retention, mandated by FR-071 + SC-023 + FR-066 |
| **FR-087** | Q2 + Q3 — the shared recomputation rule, with (i) carry across and (ii) recompute |
| **FR-013a** | Q3 — two withdrawals, one addition, with ordering |
| **FR-085a** | Q4 — absent daily row is not observed, never zero |
| **FR-086a** | Q4 — gap count tracks uncovered dates, not undelivered days |
| **FR-060a** | Q5 — commit operational writes, then attempt the lease, then signal |
| **SC-042a** | Q4 — the gap-versus-non-delivery distinction |
| **SC-048** | Q3 — the merged creative's figure |
| **SC-049** | Q5 — operational freshness under lease failure |
| **SC-050** | Q1 — bounded retention |
| **SC-051** | Q4 — absent row leaves the day unobserved |

**Amended in place**: `FR-012a` (rephrased to be merge-safe), `FR-013` (FR-013a
attached), `FR-074b` (references the merge rules), `FR-079` (points at FR-087),
`FR-080` (covers merges; defers the number to FR-087), `FR-084` (FR-084a attached),
`FR-086` (FR-086a attached), `FR-060` (FR-060a attached), `SC-042` (SC-042a
attached).

---

## Considered and deliberately left alone

| Item | Why |
|---|---|
| **FR-002a, FR-012a's core rule, FR-077, FR-079's write-once principle** | FR-087 is a scoping statement over them, not a change to any of them. FR-079 still forbids revision; FR-087 names the one case that was never a revision. |
| **FR-083's upward-only rule** | Untouched. FR-084a governs retention, not revision; a day still inside the window is still revisable upward, and finalisation is unchanged. |
| **FR-052, FR-054a, FR-055** | Unchanged. FR-060a orders them rather than altering any of them. |
| **FR-065's strings** | Still not rewritten. The FR-059 tension recorded in 1C stands; FR-060a only fixes *when* the message is emitted, not its wording. **No Arabic was written or changed in this pass.** |
| **FR-074b's stated limitation** | Untouched. The merge rules apply where a link exists; the unlinked split remains undetectable, as recorded. |
| **The checklist** | Not re-run. Nothing in these five answers changes a checklist verdict: the three undetectable limitations are unaffected, and the new requirements all carry criteria. Flag if you would rather I re-ran it. |

**Stopping here. `/speckit.plan` not run.**
