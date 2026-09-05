# Batch 1A revision — four defects fixed, one stale assumption corrected

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Files touched**: `specs/969-cumulative-learning/spec.md`,
`specs/969-cumulative-learning/reports/batch-01a-report.md`.
**Not touched**: no file under `functions/src/` or `src/`, no test, no `package.json`.

```
 .../reports/batch-01a-report.md        |  3 +-
 specs/969-cumulative-learning/spec.md  | 40 +++++++++++++++++-----
 2 files changed, 33 insertions(+), 10 deletions(-)
```

(plus the revision banner added to the 1A report afterwards)

Id integrity — no duplicates, no renumbering, all additions are letter suffixes on
existing ids:

```
FR-001 … FR-012 FR-012a FR-013 … FR-036a FR-036b FR-036c FR-037 …
       … FR-073 FR-074 FR-074a FR-074b FR-074c FR-075 FR-076
SC-001 … SC-028 SC-029 SC-029a SC-029b
=== duplicates? === (empty = none)
```

---

## Two read-only checks you asked for, run before editing

### Defect 1 — does production contain two hashes mapping to one generation?

**No — zero cases.** Raw output:

```
=== DEFECT 1: distinct imageHash values per generationId ===
generationId                            distinctHashes  hashes
UtCCphz5jAgFIEWCa7WQ                                  1   f5e9a98dadad8d9d

generationIds mapping to MORE THAN ONE imageHash: 0
total linked generationIds: 1

=== matchDistance values on linked rows (threshold is 10) ===
[1,1,1,1,1]
```

Only **one** `generationId` is linked at all across 1008 rows, and it maps to
exactly one hash. **The case cannot be sampled and must be constructed in
fixtures** — recorded in FR-074b and in SC-029a, consistent with the Assumption
already added in 1A that the linked path generally must be constructed rather than
sampled.

Worth noting alongside it: all five linked rows sit at `matchDistance: 1` against a
permitted threshold of **10**. The mechanism that makes defect 1 real is exactly
that headroom — nine bits of slack in which a second hash of the same creative can
land and still match.

### Defect 2 — can a row carry a `generationId` with no `imageHash`?

**Yes, reachable by two routes; zero present in production today.** Raw output:

```
=== DEFECT 2 census: key presence combinations ===
  generationId AND imageHash : 5
  generationId, NO imageHash : 0
  imageHash, NO generationId : 1003
  NEITHER key                : 0
```

**Is `imageHash` written independently of match success? Yes.**
`result.imageHash = hash` (`shared.ts:796`) executes **before**
`matchAdCreative` (`shared.ts:797`), so the hash is stored whenever the image was
downloadable and hashable, regardless of whether a match was found. It is null only
when the ad has no image URL (`shared.ts:792`) or the download/hash throws
(`shared.ts:794-802`).

The two routes that produce a linked row with no hash:

- **(a)** `linkUnmatchedAd.ts:146-155` — the pre-sync manual-link branch creates a
  record carrying `generationId` and `matchType: "manual"` with **no `imageHash`
  field at all**.
- **(b)** An already-linked row whose image download fails on a later sync:
  `imageHash: match?.imageHash ?? null` (`shared.ts:1015`) writes an explicit null
  under `{ merge: true }` (`shared.ts:1190`), while the precedence lock
  (`shared.ts:864-869`) preserves the `generationId`. **A previously-hashed linked
  row can lose its hash.**

**One correction to the framing in your defect note.** `shared.ts:430` is *not* the
route. That guard sits inside `matchAdCreative`'s loop over the fingerprint index
and skips a **malformed stored fingerprint entry** so one bad index row cannot abort
matching for every ad. It never causes the *ad's own* hash to be absent. The two
routes above are the actual ones. Recorded in the spec as a precision note, because
the wrong citation would otherwise have been written in as evidence.

---

## Defect 1 — fixed: FR-074b

**Added `FR-074b`**, nested under FR-074 alongside FR-074a:

> After hash grouping and link propagation, **any two groups that resolve to the
> same `generationId` MUST merge into a single creative.** Grouping on `imageHash`
> alone is necessary but not sufficient.

Justification records that perceptual matching is **distance-based, not exact** —
`matchAdCreative` (`shared.ts:407`) accepts any candidate within a Hamming distance
of 10 (`shared.ts:797`) and stores the accepted distance per row as
`matchDistance` — so one creative can legitimately produce more than one hash via a
re-upload, re-encode, or platform-side re-compression. Without the merge, one
creative becomes two groups and is counted twice: the same failure FR-073 exists to
prevent, by a different route than FR-074a closes.

**Added `SC-029a`**: two rows with **different** `imageHash` values matching the
**same** `generationId` contribute **one** creative, not two — verified by a
constructed fixture, with the zero-cases-in-production fact stated in the criterion
itself so nobody later tries to source it from real data.

## Defect 2 — fixed: FR-074c

**Added `FR-074c`**: a row carrying a `generationId` but no `imageHash` is
attributed to that generation's creative, joining the group already resolving to
it; where no other row resolves to that generation, it forms its own single-member
group **that does contribute**.

The distinction from FR-075 is stated explicitly rather than left to inference:
FR-075's group cannot contribute because `isEligibleForLearning` fails without a
`generationId`; here it **passes**, and every angle and pattern field is readable
from the matched generation. Missing hash costs such a row nothing but hash-based
grouping, and the link supplies grouping directly.

Both reachability routes, the production census (5 / 1003 / 0), and the
`shared.ts:430` precision note are recorded in the requirement.

**Added `SC-029b`**, covering both routes.

## Defect 3 — fixed: FR-011, FR-012, FR-012a, FR-013, FR-014

You were right, and the single grouped justification is what let it through.
FR-008–FR-010 really are operational status; FR-011–FR-014 are the sealed learning
result and were never covered by that reasoning.

| Id | Scope now stated |
|---|---|
| **FR-011** | **Row-scoped detection, creative-scoped effect**, with a per-trigger breakdown: (a) row-scoped in detection, because each row carries its own metrics and one placement moving says nothing about its siblings; (b) creative-scoped in effect, because FR-074a propagates a manual re-link across the whole group; (c) creative-scoped, because target resolvability is an account-level condition. |
| **FR-012** | Reworded from "an ad's contribution" to "a contribution" — the retention rule holds at either scope. |
| **FR-012a** *(new)* | **A creative MUST carry exactly one sealed target across all its rows.** |
| **FR-013** | **Re-based to the creative** — withdraw the *creative's* previous contribution so the *creative* stays represented exactly once. |
| **FR-014** | **Creative-scoped in effect, row-scoped in mechanism** — the cascade marks by `generationId`, so it reaches every row at once and a creative is never half-cascaded. |

### Can a creative's rows hold differing sealed targets? — Yes, and that is why FR-012a exists

FR-001 writes the sealed target on **each ad row's** record, and FR-005d seals
against the target resolvable **at the moment of sealing**. Rows of one creative do
not necessarily seal at the same moment — a new placement of an existing creative
first appears in a later sync — and the account's cost target can change in
between. So under the pre-revision rules, **one creative could hold two or more
different sealed targets**, and its efficiency figure (FR-002, FR-003) would be a
ratio against no single denominator.

FR-012a fixes the target sealed by the **first row of that creative to seal** as
the creative's target; every row, including later arrivals, inherits it rather than
sealing independently. Recorded consistency:

- **With FR-005c** — inheritance is not a re-opening. The creative's target is
  written once and never revised; a later row adopts it rather than creating a
  competitor, so the one-way guarantee is strengthened.
- **With FR-005d** — it widens the already-accepted imprecision from "an ad seals
  against the target in force when it sealed" to "a creative seals against the
  target in force when its first row sealed". Same trade, already accepted, and the
  alternative — a creative with several targets — is worse.

### One row of a multi-row creative changing attribution while siblings do not

Stated in FR-013 explicitly rather than left inferable: **this does not arise as a
partial re-attribution.** FR-074a propagates the manual link across the whole hash
group, so a re-link on any single row re-attributes every row in the same pass; the
withdraw-then-add operates on the creative as a whole — one withdrawal, one
addition. There is never a state where some rows of a creative count toward one
angle and the rest toward another.

The one residual case is recorded too: a row that *leaves* the group entirely — its
hash changes so it no longer groups with its siblings, and it carries no link of
its own — is not a re-attribution but the appearance of a **new** creative. It is
added, not swapped, and the original creative's contribution is untouched.

## Defect 4 — fixed: FR-036c

**Added `FR-036c`**:

> A creative is **SEALED if *any* of its rows is SEALED**, and PROVISIONAL only
> while *every* row is PROVISIONAL.

- *Why any-row rather than all-rows*: the machine is one-way (FR-005c). Once any
  row has sealed, a resolvable target has been recorded for that creative and
  cannot be un-recorded, so "PROVISIONAL" would be a false statement from that
  moment. Requiring all rows would also let a single new placement appearing during
  a settings gap drag an already-sealed creative back toward PROVISIONAL — exactly
  the reverse transition FR-005c forbids.
- *Why mixed states are rare, stated rather than assumed impossible*: sealing turns
  on whether the **account's** economics are resolvable (FR-005d), not on anything
  the row carries, so all rows present at one evaluation seal together. A mixed
  state arises in exactly one shape — a row that **first appears during the
  settings gap**, after siblings have already sealed. Uncommon but reachable, so
  the rule is stated.

`FR-036a` now points at FR-036c for the derivation instead of asserting the
creative-level state unsupported. **Key Entities → Contribution State** rewritten
to say the state is stored per row and read per creative, and that these are not
the same thing.

## Stale assumption — corrected

The Assumption claiming the 1-hour manual cooldown *"remains in force and
independently makes manual-versus-manual contention rare"* is **struck through and
marked FALSE AS OF PHASE 970**, citing the removal at `trigger.ts:8`, `:54` and
`orchestrator.ts:476`, `:651`. The corrected text states that manual-versus-manual
contention is **no longer rare**, and that the learning-write lease must be sized
without leaning on a cooldown that no longer exists.

**FR-059 is flagged, not yet fixed** — its TTL justification still cites the
cooldown as one of two self-clearing arguments. A sub-bullet on the corrected
Assumption records that this half no longer holds and that FR-059 is corrected in
Stage 1B, where section J is in scope. Flagged rather than left to stand, as
instructed.

---

## Also updated

**Key Entities**, three entries:

- **Creative** — now names FR-074b (merge) and FR-074c (linked row with no hash)
  alongside FR-074 / FR-074a.
- **Contribution State** — records that the ledger entry is per row, the creative's
  state is derived by FR-036c, and the sealed context is the first-sealing row's
  (FR-012a).
- **Sealed Evaluation Context** — now **single-valued per creative**; a creative can
  never hold two different sealed targets.

**`batch-01a-report.md`** — the left-alone table row `FR-008–FR-014` is split. The
`FR-011–FR-014` half is struck through and marked **CORRECTED**, stating that the
operational-status reasoning never applied to them and listing the four scope
decisions. A revision banner was added at the top of that report pointing here; its
original stat block and id lists are left as written, for the record.

---

## Considered and deliberately left alone

| Id | Why |
|---|---|
| **FR-008–FR-010** | Genuinely operational status, genuinely per ad row. The owner pauses individual ads. Unchanged, and the 1A justification for these three was correct. |
| **FR-001, FR-004, FR-005, FR-005a–d, FR-006, FR-007** | Sealing **mechanics** per row are unchanged; FR-012a constrains what the *creative* may hold without altering how a row seals. FR-005a–d and FR-006 are still Stage 1B's, for the separate reason of splitting sealing from efficiency contribution. |
| ~~**FR-002, FR-003**~~ | **CORRECTED IN THE 1A ADDENDUM — these did not belong in the row above.** They define the **efficiency figure**, which is a *measure*, not a sealing mechanic — the same shape of error the FR-011–FR-014 split corrected, one range earlier. Both are still written **per ad row**, and FR-073 leaves an unanswered question: is a creative's efficiency figure computed by **aggregate-then-divide** (sum realised cost and results across the creative's rows, divide by its single sealed target from FR-012a) or **divide-then-average** (per-row ratios, then averaged)? These differ, and the second gives a one-result placement the same weight as a fifty-result one — not a rounding difference across 55 rows. Aggregate-then-divide is almost certainly right: it is what FR-021's raw sums and counts exist for, and Amendment 2's *"5 combined conversions across all placements"* already presumes creative-level totals. **Deferred to Stage 1B**, where the efficiency eligibility rule lives, rather than decided here in passing. |
| **FR-015, FR-017–FR-023** | Accumulation mechanics operate on ledger entries, which remain per row. FR-013's re-basing changes what is withdrawn, not how. |
| **FR-074, FR-074a** | Correct as written; FR-074b and FR-074c extend rather than replace them. |
| **FR-075** | Correct as written. FR-074c is a *different* case and is stated as such rather than folded in, precisely so the two are not conflated. |
| **FR-076** | Unaffected — the unlinked count is about rows resolving to no generation, which FR-074c does not change. |
| **SC-029** | Kept as the FR-074a fixture; SC-029a and SC-029b are siblings for FR-074b and FR-074c rather than an edit to it. |
| **FR-054–FR-065 (section J)** | Lease scope, the `worker.ts` finding, and the FR-059 TTL correction are all **Stage 1B**. Only the stale Assumption is corrected now, because it is a false statement about production and you asked for it now. |
| **FR-051d, FR-011(a) narrowing** | **Stage 1B**, unchanged from the 1A plan. |

**Stopping here. Stage 1B not started.**
