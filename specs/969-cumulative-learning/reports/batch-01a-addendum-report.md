# Batch 1A addendum — FR-074b's limitation, derived-vs-persisted, two notes, table split

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Files touched**: `specs/969-cumulative-learning/spec.md`,
`specs/969-cumulative-learning/reports/batch-01a-revision-report.md`.
**Not touched**: no file under `functions/src/` or `src/`, no test, no `package.json`.

```
 .../reports/batch-01a-revision-report.md |  3 ++-
 specs/969-cumulative-learning/spec.md    | 19 +++++++++++++++++++
 2 files changed, 21 insertions(+), 1 deletion(-)
```

Id integrity — no duplicates, no renumbering; two letter-suffix additions:

```
… FR-073 FR-074 FR-074a FR-074b FR-074c FR-074d FR-074e FR-075 FR-076
=== dupes === (empty=none)
```

`FR-074c` was moved ahead of `FR-074d` so the suffix sequence reads in order.

---

## Item 1 — FR-074b's limitation, stated

Added as a **STATED LIMITATION** sub-block on FR-074b, in the shape FR-075 already
models:

> FR-074b merges on a shared `generationId`. Where **neither** group carries a
> link, there is nothing to merge on, and **two hash groups that are genuinely one
> creative remain two creatives permanently. Nothing in this feature detects it.**

Four sub-bullets record what you asked for:

- **Scale** — on `act_995888422231015` this is **the entire account**: 0 of 383
  rows linked, and that account supplies 52 of the dataset's 146 creatives. Not an
  edge case there; the normal condition.
- **Direction of the error — inflation.** A split creative is counted twice, so the
  distinct-creative count runs **high** and FR-034 / FR-034a / FR-037 fire
  **earlier** than the deliberately-seven-times-harder bar. The gates are
  conservative by design and this erodes that, so it must not surface later as a
  surprise.
- **Why near-hash clustering is not specified** — clustering rows against *each
  other* by distance is a different operation from matching a row against the
  fingerprint index. It is **non-transitive** (A within 10 of B, B within 10 of C,
  A not within 10 of C), so it has no well-defined grouping without further
  choices, and it risks merging genuinely distinct creatives, which is a worse
  failure than splitting one. Recorded as a design decision deliberately not taken.
- **Cross-reference** to FR-034's review trigger.

**Cross-reference added to FR-034's PROVISIONAL review trigger**, as its own
paragraph:

> **A known reason the count may run high, which the review MUST weigh (FR-074b).**
> … if the review finds guidance activated on thinner evidence than expected, split
> creatives are the first thing to check, and the correct remedy may be improving
> link coverage rather than raising the number.

That last clause matters: the limitation gives the review a second candidate
explanation, so a premature activation is not automatically read as "10 is too
low".

---

## Item 2 — derived *and* persisted: FR-074d and FR-074e

**The answer is both, and they are different questions.** Added `FR-074d`:

> **The creative grouping is derived per sync; the resolved `generationId` MUST be
> persisted on the row.**

- *Derived* — the creative is never stored as a document; groups are recomputed
  from the current rows every sync, so a merge (FR-074b) or a re-link (FR-074a)
  takes effect immediately with nothing to migrate. This is what Key Entities meant
  by "a derived grouping, not a stored document", and it stays true.
- *Persisted* — when FR-074 or FR-074b resolves a row to a `generationId` the row
  did not itself carry, that link **MUST be written back to the row**.

### Why persistence is required rather than optional

Your reading was right that the two statements diverge, and the divergence is
resolved in favour of persisting, because derived-only is unsafe on the exact route
found in the revision:

A row that loses its `imageHash` would leave every hash group, carry no link of its
own, and fall to **FR-075** — the group that *cannot contribute*. A contributing row
would silently stop. That route is real: `imageHash: match?.imageHash ?? null`
(`shared.ts:1015`) writes an explicit null under `{ merge: true }`
(`shared.ts:1190`) whenever a later download fails.

Recorded reconciliation:

- **FR-014** — permits loss of metadata to prevent *further* contribution, never to
  withdraw one already made. A silent stop is a withdrawal in effect.
- **FR-020** — a row falling out of its own group is not evidence of anything, and
  no count may decrease because of it.

### FR-074e — provenance, because a written-back link is otherwise indistinguishable

You identified the mechanism precisely. Added `FR-074e`: the stored match
provenance MUST record **three** distinct origins, with strict precedence:

1. **manual** — set by the owner (`linkUnmatchedAd.ts:134-142`). Highest; never
   overridden.
2. **direct automatic** — this row's own image matched the index within threshold
   (`matchAdCreative`, `shared.ts:407`).
3. **propagated** — inherited from the group (FR-074, FR-074b). **Lowest.**

*Why*: the precedence lock at `shared.ts:864-869` locks any row whose stored
`matchType` is `"manual"` or `"auto_hash"` against re-derivation. A propagated link
written back under either value would be **indistinguishable from an original**, and
the lock would make an inferred attribution **permanent** — a wrong propagation
could never be corrected by a later direct match. A propagated link must therefore
stay **re-derivable**: it survives to keep the row contributing, and yields to a
direct or manual match the moment one appears.

Explicit reconciliation recorded: a row that loses its hash keeps its propagated
link, keeps its place in the creative, and keeps contributing. Nothing is withdrawn,
no count decreases, and the loss prevents only re-grouping by hash — exactly the
"prevent further, never withdraw" shape FR-014 requires.

---

## Note 1 — FR-012a tie-breaking

Added a sub-bullet stating that ties are harmless and **must not** be broken by
ordering machinery. "First row to seal" is under-determined when several rows seal
in one sync, because evaluation order is arbitrary — and it **carries no
information**, since target resolvability is an **account-level** condition
(FR-005d), so every row sealing in one evaluation resolves the same target.
Implementations MUST NOT introduce ordering, sequencing or tie-breaking for a
distinction with no observable consequence. The rule only bites **across** syncs,
where the account target may genuinely have changed.

## Note 2 — FR-037's open dependency on Stage 1B

Added a sub-bullet recording that *"carrying a sealed efficiency figure"* is **not
yet defined at creative scope**, and that state and figure are not the same thing:
FR-036c derives a creative's **state**, while FR-006 seals a contribution whose
efficiency figure is explicitly **absent** — so a creative can be SEALED and carry
no figure. FR-037 counts creatives carrying a **figure**, and the rule that decides
when a creative has one is Amendment 2's eligibility rule. Flagged so the two are
not conflated in the meantime.

---

## Left-alone table split (item 3's half that belongs now)

In `batch-01a-revision-report.md`, the row `FR-001–FR-007` is split:

- **`FR-001, FR-004, FR-005, FR-005a–d, FR-006, FR-007`** — sealing *mechanics* per
  row, unchanged. The original justification was correct for these.
- **~~`FR-002, FR-003`~~ — CORRECTED**, marked as **Stage 1B scope**. They define
  the **efficiency figure**, a *measure* rather than a sealing mechanic — the same
  shape of error the FR-011–FR-014 split corrected, one range earlier.

The row records the unanswered question in full so 1B inherits it stated rather
than rediscovered: is a creative's efficiency figure **aggregate-then-divide** (sum
realised cost and results across the creative's rows, divide by its single sealed
target from FR-012a) or **divide-then-average** (per-row ratios, averaged)? They
differ, and the second gives a one-result placement the same weight as a
fifty-result one — across 55 rows that is not a rounding difference.

It also records why one answer is almost certainly right: aggregate-then-divide is
what FR-021's raw sums and counts exist for, and Amendment 2's *"5 combined
conversions across all placements"* already presumes creative-level totals.
**Deferred to Stage 1B rather than decided here in passing**, since FR-002 and
FR-003 are still written per ad row and changing them belongs with the efficiency
eligibility rule.

---

## Considered and deliberately left alone

| Id | Why |
|---|---|
| **FR-074, FR-074a, FR-074b's core rule** | Correct as written. Item 1 adds a limitation to FR-074b, not a change to what it requires. |
| **FR-074c** | Unaffected — a row with a link and no hash was never dependent on propagation; it carries its own link. Moved in the file for suffix ordering only, text unchanged. |
| **FR-075** | Unchanged. FR-074d's persistence rule is precisely what keeps rows *out* of FR-075 that should not fall into it; the requirement itself still describes the genuinely keyless case. |
| **FR-076** | Unchanged. It counts rows resolving to no generation; a propagated link means such a row now resolves to one, which is the correct behaviour and the count follows it. |
| **FR-011, FR-013, FR-014** | Already scoped in the revision. FR-074e's precedence ordering is consistent with FR-011(b)'s creative-scoped effect and needs no further change there. |
| **FR-034's numeric value** | Not touched. Item 1 adds a reason the number may behave unexpectedly; it does not change the value, which is the owner's locked decision. |
| **FR-002, FR-003** | **Stage 1B**, as above. Deliberately not amended here — the aggregation rule belongs with the eligibility rule, and deciding it in an addendum would repeat the pattern of settling a measure inside a mechanics change. |
| **FR-054–FR-065 (section J), FR-059's TTL** | **Stage 1B**, unchanged from the revision's plan. |
| **SC-029, SC-029a, SC-029b** | No new criterion added here. Item 1 is a stated limitation with **no** testable behaviour to assert — the whole point is that nothing detects it — and inventing an SC for it would be a false assurance. Items 2's behaviour is asserted by SC-029b, which already covers a row whose hash is nulled by a failed download. |

**Stopping here. Stage 1B not started; it carries item 3.**
