# Batch 1A final — provenance breakdown, hashless-row limitation, storage decision

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Files touched**: `specs/969-cumulative-learning/spec.md` only.
**Not touched**: no file under `functions/src/` or `src/`, no test, no `package.json`.

Ids — no renumbering, no duplicates; three letter-suffix additions
(`FR-072a`, `FR-072b`, `FR-074f`):

```
FR-071 FR-072 FR-072a FR-072b FR-073 FR-074 FR-074a FR-074b FR-074c FR-074d FR-074e FR-074f FR-075 FR-076
=== dupes === (empty=none)
```

**Nothing here makes Stage 1B wrong.** Proceeding to 1B, carrying the FR-002 /
FR-003 aggregation question and the split-conversion effect.

---

## Item 1 — FR-076 rewritten as a four-way provenance breakdown

You are right that the behaviour was correct and the **signal** was not.

`FR-076` now requires four counts, never a single total:

1. contributions from rows with a **direct automatic** match;
2. contributions from rows with a **manual** link;
3. contributions from rows carrying a **propagated** link only;
4. contributions from rows resolving to **no** generation.

Justification rewritten to say why the total would be actively misleading:
**direct-match volume is the only one of the four that tracks matching health.**
Propagation writes a resolved `generationId` back to rows that never earned one, so
a 55-row group with **one** direct match reports **zero** unlinked contributions —
near-perfect matching on the strength of one real match, and it keeps reporting
that while direct matching degrades, for as long as one row per group still
matches. The recorded degradation signature is **a falling direct count against a
rising propagated count**, visible only in the breakdown.

Baseline restated against the new shape: **5 direct, 0 manual, 0 propagated, 1003
unlinked** across 1008 rows; `act_995888422231015` contributes **0 / 0 / 0 / 383**.
The requirement names **the 5** as the number to watch.

`FR-051b`'s count list updated, with an explicit prohibition on collapsing the
breakdown to a total.

---

## Item 2 — the hashless propagated row, stated as a limitation

Your analysis is correct and I could not find a fix inside this feature either.

`FR-074e`'s re-derivability claim is now **qualified in its own sentence** —
"yields to a direct or manual match the moment one appears — **for any row that
still carries an `imageHash`**" — rather than left unconditional, followed by a
**STATED LIMITATION** block recording:

- **Trigger sequence**, exactly as you set it out: a row in a group resolving to
  `G` loses its hash (`shared.ts:1015` under `{ merge: true }` at `:1190`) and is
  written back with a propagated link to `G`; a sibling is later manually re-linked
  to `G'`; FR-074a moves the hash group, but the hashless row is in no hash group,
  so it does not move; under FR-074c it attaches to `G`'s creative and, where no
  other row resolves to `G`, becomes **its own contributing creative attributed to
  a generation nothing else uses**.
- **Frozen and unverifiable** — no direct match can appear for a row with nothing to
  hash, and no owner will manually link a row that already reads as linked.
- **Direction: mis-attribution plus inflation** — evidence lands on the wrong angle
  and pattern, *and* a spurious extra creative is counted. Both work against the
  conservative intent of FR-034 / FR-034a / FR-037, as FR-074b's limitation does.
- **Bound**: the frequency of a *linked* row losing its hash. Cross-referenced to
  the new FR-076 breakdown, which makes exactly this observable — a rising
  propagated-only count with no matching rise in direct matches is this limitation
  accruing.
- **Not fixable within this feature**, with the reason: correcting the row requires
  placing it back in the group it must be revalidated against, and the key for
  doing that is the thing it lost.

---

## Item 3 — provenance goes in a SEPARATE FIELD. `FR-074f`, `FR-072a`, `FR-072b`

### The decision and the evidence

**A new field, separate from `matchType`. `matchType`'s existing values and their
meanings do not change, and no value is added to it.**

I did not decide this on the abstract "weaker change" argument. I enumerated the
readers first, and they settle it:

**Evidence 1 — `matchType` has more readers than this spec has ever enumerated.**
FR-072 names three behaviours. The field is branched on at least at
`getTopWinners.ts:79` and `:185`, `learningAggregates.ts:120`, and
`whatsWorkingDashboard.ts:412`, `:569`, `:719` — two of those surfaces this feature
does not otherwise touch. The sharpest case: `whatsWorkingDashboard.ts:719` builds
the owner-facing **"needs linking" list** by filtering `matchType === null`. A
propagated row carrying a new enum value would **silently vanish from that list**,
hiding from the owner exactly the rows whose attribution is least certain. That is
a user-visible regression produced by an enum widening, in a surface FR-072 never
named.

**Evidence 2 — the separate field gives FR-074e's re-derivability for free.** The
lock (`shared.ts:864-869`) fires only on `"manual"` or `"auto_hash"`. A
propagated-only row keeps `matchType` `null`, so the lock does not fire and the row
is re-matched every sync — which *is* the required re-derivability, obtained from
existing behaviour rather than from a new exclusion branch a later refactor could
drop.

### The consequence I had to state rather than let be discovered

Learning eligibility is today a **per-row** predicate rejecting a null `matchType`
(`learningAggregates.ts:119-124`; the same test at `getTopWinners.ts:79`). With
provenance in a separate field, a propagated-only row has `matchType` `null` and
**would be rejected — defeating the purpose of persisting the link at all**
(FR-074d).

`FR-074f` therefore requires eligibility to be evaluated **per creative** (FR-073),
not per row. The **criteria** are unchanged — resolvable generation, available
metadata, resolvable angle or pattern — only the **unit** changes, which is
Amendment 1's subject. The Assumption that previously read *"Amendment 1 does not
relax `isEligibleForLearning`"* is corrected to match, so the spec does not
contradict itself.

### FR-072 amended — `FR-072a`

Records that Amendment 1 introduces a third provenance and re-states the
behaviour-identical claim per named behaviour rather than assuming it survives:

| Behaviour | Verdict | What must be verified |
|---|---|---|
| Match-link precedence lock | **Unaffected, deliberately** — branches on `matchType`, which gains no value; a propagated-only row keeps `null` and stays re-matchable | the **negative**: that a propagated link never causes the lock to fire |
| Delete-cascade preservation flag | **Unaffected** — reads `metadataAvailable` and `deletedGenerationId`, which provenance does not touch | that a propagated row is cascaded like any other row of its creative (FR-014) |
| Matched / ambiguous / unmatched tallies | **Unaffected in value**; meaning now stated | see FR-072b |

### How a propagated row is counted — `FR-072b`

**Counted as `unmatched`.**

- *Not `matched`*: that would restate item 1's problem on a second surface — the
  tallies would report improving coverage produced entirely by propagation while
  direct matching degraded unseen. The tallies are, and must remain, a measure of
  **direct** match coverage.
- *Not a fourth bucket*: the tallies are a pre-existing surface FR-072 requires to
  be behaviour-identical, and a propagated-only row already has `matchType` `null`,
  so it falls to `unmatched` with **no code change and no value change**. A new
  bucket would break the identity FR-072 exists to protect. Propagated
  contributions are reported in FR-076's breakdown, the surface built for it.
- *The oddity is deliberate and stated*: a propagated row **contributes to
  learning** while counting as **unmatched** in the tallies. The two answer
  different questions — "is this creative's evidence attributable?" versus "did
  perceptual matching find this row?" — and the spec says they must be read
  together rather than making them agree by weakening one.

---

## Considered and deliberately left alone

| Id | Why |
|---|---|
| **FR-074, FR-074a, FR-074b, FR-074c, FR-074d** | Unchanged. Item 2 qualifies FR-074e's wording only; the grouping, merge, hashless-with-link and derived-plus-persisted rules are all still as written. |
| **FR-074b's limitation block** | **Not** extended with the split-conversion effect, per your instruction — it belongs where the eligibility threshold is defined. Carried to Stage 1B. |
| **FR-075** | Unchanged. FR-072b's "counted as unmatched" is about the tallies, not about FR-075's non-contributing group; a propagated row still contributes. |
| **FR-034 / FR-034a / FR-037 values** | Untouched. Item 2's limitation adds a second inflation source; it does not change the owner's locked numbers. |
| **FR-072's original three bullets** | Left verbatim. FR-072a adds to them rather than rewriting them, so the pre-Amendment-1 obligations stay legible. |
| **SC-001 – SC-029b** | No new criterion. Item 1's breakdown is asserted by FR-076's own testability clause (seed known counts of each provenance, assert each emitted count) and belongs in the Stage 1C success-criteria pass, not scattered here. Item 2 is a limitation with **no assertable behaviour** — same reasoning you accepted for FR-074b's limitation, and adding one would be false assurance. Item 3's tally treatment is verified by SC-025, which already requires the tallies to be **identical** before and after, and FR-072b's whole design is to keep that true. |
| **Sections A, C–K generally** | Untouched beyond FR-051b's count list and FR-072's addendum. |

---

## Carried into Stage 1B

1. **FR-002 / FR-003 aggregation** — aggregate-then-divide versus
   divide-then-average for a creative's efficiency figure, with the reasoning
   already recorded in the revision report's left-alone table.
2. **The split-conversion effect** — a split creative also splits its
   **conversions**, so a creative divided in two may never reach the 5-conversion
   eligibility threshold in either half where the whole would have cleared it
   comfortably. Splitting therefore **inflates usage counts while suppressing
   efficiency contribution** — two effects in opposite directions from one cause.
   To be stated alongside the eligibility rule.
3. **FR-037's open dependency** — "carrying a sealed efficiency figure" is still
   undefined at creative scope (state ≠ figure, per FR-006).
4. **FR-059's TTL justification** — still cites the removed 1-hour cooldown.
5. **Lease scope** — inside `runSyncForAccount`; Phase 970's lease does not reach
   `worker.ts:19`, `:61`; plus the Cloud Tasks threat model from the 1A report.
6. **FR-011(a) narrowing, FR-005a–d / FR-006 split, FR-051d's volume table, the
   stacked gates.**

**Proceeding to Stage 1B.**
