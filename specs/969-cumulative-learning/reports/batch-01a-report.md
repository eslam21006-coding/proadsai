# Batch 1A — re-base the unit of learning from the ad row to the creative

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Files touched**: `specs/969-cumulative-learning/spec.md` only.

> **REVISED.** Four defects were found in this stage on review and fixed in a
> follow-up commit; a stale Assumption was corrected at the same time. The stat
> block and the id lists below describe the ORIGINAL 1A commit and are left as
> written for the record. See **`batch-01a-revision-report.md`** for what changed:
> FR-074b (cross-group merge), FR-074c (linked row with no hash), FR-011/FR-012/
> FR-012a/FR-013/FR-014 scoping, FR-036c (creative state derivation), SC-029a,
> SC-029b, and the removed-cooldown Assumption. The left-alone table below has
> been corrected in place for FR-011–FR-014.
**Not touched**: no file under `functions/src/` or `src/`, no test, no `package.json`.

```
 specs/969-cumulative-learning/spec.md | 75 ++++++++++++++++++++++++-----------
 1 file changed, 52 insertions(+), 23 deletions(-)
```

Id integrity after the edit — no duplicates, no renumbering, new ids continue the
sequence from the previous maximum (`FR-072`, `SC-028`):

```
=== duplicate FR definitions? ===
(empty = no dupes)
FR-001 … FR-072 FR-073 FR-074 FR-074a FR-075 FR-076
SC-001 … SC-028 SC-029
```

---

## 1. Requested first: the Cloud Tasks concurrency answer

Read-only, verified in the merged tree. **The spec text for this belongs in Stage
1B**, where the lease requirement (`FR-054` / `FR-055`) lives — it is reported here
because you asked for it "while writing", and it is not yet in `spec.md`.

### Are task names deterministic per account per cycle?

**No. No task name is set anywhere, so Cloud Tasks auto-generates one, and there is
no platform-level deduplication.**

Both enqueue sites build a task object containing **only** `httpRequest` — no
`name` field:

- fan-out: `functions/src/metaSync/orchestrator.ts:588-611`
- scheduled dispatcher: `functions/src/metaSync/dispatcher.ts:162-179`

A search for a `name:` key on any task object across `functions/src/metaSync/`
returns nothing. Cloud Tasks only deduplicates against a **caller-supplied**
deterministic name; with generated names, two enqueues for the same account
produce two independent tasks.

### Can `maxConcurrentDispatches: 5` put two tasks for the *same* account in flight?

**Yes.** `maxConcurrentDispatches: 5` (`functions/src/metaSync/worker.ts:39`) is a
**queue-wide** cap on simultaneous dispatches. Nothing in it, and nothing
elsewhere, constrains those five slots to five *distinct* accounts.

Three independent ways two same-account tasks come to exist:

1. **Two enqueuing sources.** The 03:00 scheduled dispatcher
   (`dispatcher.ts:137`, `"0 3 * * *"`) and a manual press's fan-out
   (`orchestrator.ts:698`) both enqueue for the same account, with no shared
   registry between them.
2. **Retries.** `maxAttempts: 3` with 30–600 s backoff (`worker.ts:33-37`). A task
   that timed out from the queue's perspective can be retried while the original
   invocation is still running.
3. **No cross-run dedup.** The dispatcher de-dups by `accountId` **within a single
   run** (`dispatcher.ts:100-104`, `seenAccounts`), but not across runs, and not
   against the manual fan-out at all.

### The concrete concurrency the lease must defend against

**Two or more concurrent `runSyncForAccount` invocations for the same ad account,
with no platform-level deduplication available**, arising from scheduled-plus-manual
overlap or from a Cloud Tasks retry overlapping its own original.

This will be written into `spec.md` in Stage 1B as the stated threat model for
`FR-054`, together with the finding that Phase 970's lease does not reach
`worker.ts`.

---

## 2. Requirements ADDED

New section **B2 — The Unit of Evidence: The Creative, Not the Ad Row**, inserted
between section B and section C (foundational, so it precedes the accumulation
rules that depend on it).

| Id | What it says |
|---|---|
| **FR-073** | The **creative** is the unit of evidence. One creative contributes exactly once to any angle or visual-pattern record regardless of how many ad rows carry it. Explicitly separates *unit of evidence* from *storage location of the ledger*, which stays on the ad document. |
| **FR-074** | Creatives are identified by grouping ad rows on `imageHash`; where any row in a hash group carries a generation link, **every** row in the group resolves to that same `generationId`. |
| **FR-074a** | Where rows in one hash group disagree, **manual attribution wins** — the precedence the sync already enforces at `shared.ts:864-869`. |
| **FR-075** | A row with neither key forms its own single-member group — **and cannot contribute to any angle or visual-pattern record**, stated explicitly rather than implied. |
| **FR-076** | The per-sync summary line MUST report how many contributions came from unlinked rows, emitted every sync including when zero. |
| **SC-029** | A partially-linked hash group resolves to **exactly one** creative; the 55-row / 1-linked case is the required fixture. |

### The fallback split, closed rather than recorded

`FR-074`'s justification states why "group by `generationId`, falling back to
`imageHash`" is insufficient: manual linking targets exactly one document
(`linkUnmatchedAd.ts:121-125`) and the sync locks that link indefinitely
(`shared.ts:864-869`), so linking one row of the 55-row creative yields a permanent
1-row group and a permanent 54-row group, with the evidence-bearing majority
reading as unlinked and never healing. Grouping on `imageHash` first and
propagating the link across the group closes it. `FR-074a` supplies the tie-break
from an existing rule rather than inventing one.

### The contradiction, named

Section B2's preamble names it verbatim:

> The module header of `functions/src/learningAggregates.ts:17` states the current
> rule as: *"Same generationId in 2 ad sets → separate records per context."*

with the note that Phase 970 did not touch it, so it is still live in code and must
be recognised as superseded rather than binding.

### Evidence recorded in the spec

- `metaAdId` cannot be the key: assigned from `ad.ad_id` at
  **`orchestrator.ts:455`**, with the Phase 970 relocation from `index.ts:3931`
  recorded explicitly so the old citation is not read as removed behaviour; and it
  is **absent, not null** — 0 of 1008 ad rows (`AdDoc`, `shared.ts:170-211`, has no
  such member) and 0 of 58 deployment records.
- Fan-out: **7.37:1** for `act_995888422231015` (source of 383 / 52 / 55) **and**
  **6.90:1** for the two-account dataset (1008 → 146).
- Unlinked baseline: 5 of 1008 rows (0.5%) linked; `act_995888422231015` has
  **zero** linked rows, so the `generationId` branch of FR-074 is currently
  **inert** on that account. Recorded both in FR-076 and as an Assumption.
- `fetched == stored` recorded as a property of the two observed syncs, **not an
  invariant**, citing `shared.ts:848`.

---

## 3. Requirements AMENDED

| Id | Change |
|---|---|
| **FR-016** | Ledger stays **per ad row** (storage); added a sub-bullet separating unit from storage — evidence rolls up to the creative, counted once. |
| **FR-034** | Threshold 10 now counted in **distinct creatives**. "What 10 represents" rewritten. Two new justification paragraphs: the ~7× harder gate and ~74 ad rows, accepted deliberately; and that row counting let the single 55-row creative clear all three gates alone — the exact thin-evidence failure FR-034a was added in Iteration 3 to prevent, meaning that floor never closed the hole it was written for. |
| **FR-034** (review trigger) | PROVISIONAL marking **kept**; trigger restated for the changed unit — the value was calibrated against rows and is now applied to creatives, so it is *entirely uncalibrated*; carrying the number forward preserves the constant, not its evidential meaning. Added a new review question: whether it now fails to activate for an account doing real work. |
| **FR-034a** | Floor of 3 now counted in **creatives**. |
| **FR-036** | Counts **distinct creatives**; states both inflation paths are closed — twenty ad sets counts once, twenty syncs counts once. |
| **FR-036a** | PROVISIONAL is a property of the **creative**, not a row; body wording moved from "ad" to "creative". |
| **FR-036b** | Distinct-**creative** count; added that a creative gaining an extra ad row also must not increment. |
| **FR-037** | Efficiency gate of 3 now counted in **creatives**. |
| **FR-046** | Absence of a ledger entry is a statement about the **row**, never the creative; a newly-appearing row adds a placement, not a second creative. |
| **FR-051b** | Count list extended with **contributions originating from unlinked rows** (FR-076). |
| **SC-008** | Counts **creatives**; adds the explicit 55-row fixture — must contribute **1**, not 55. |
| **SC-014** | Counts **creatives**; adds the case row counting used to admit — one creative across 55 rows must clear **none** of the three gates alone. |
| **SC-016** | Counts **creatives**; adds that the count must stay at one when further rows of the same creative appear later. |
| **Key Entities** | `Ad Performance Record` → per **ad row**, storage location not unit. **New `Creative` entity** — the unit of evidence, a derived grouping, not a stored document. `Contribution Ledger Entry` → per row, rolling up to the creative. `Hook Angle Record` → every count is a count of creatives. `Visual Pattern Record` → same rule. |
| **Assumptions** (3 bullets) | Eligibility rules unchanged — Amendment 1 changes the unit counted, not `isEligibleForLearning`. Threshold values keep 10 / 3 / 3 and change unit. New bullet: the `imageHash` path is the only one production exercises, so fixtures must construct the linked path. |

---

## 4. Considered and deliberately LEFT ALONE

| Id | Why unchanged |
|---|---|
| **FR-001–FR-007** | Sealing context is per-evaluation and rides on the ad row's ledger entry. Whether the *contribution* is counted per creative does not change what a sealed target is. Stage 1B revisits FR-005a–d and FR-006 for the separate reason of splitting sealing from efficiency contribution. |
| **FR-008–FR-010** | Operational status is deliberately **per ad row** — it is the owner's action list, and the owner pauses individual ads, not abstract creatives. Re-basing it to the creative would break the action list. |
| ~~**FR-011–FR-014**~~ | **CORRECTED IN THE 1A REVISION — this row was wrong.** These are about the **sealed learning result**, not the operational status, so the FR-008–FR-010 reasoning never applied to them. FR-013 in particular still carried the per-**ad** counting invariant that FR-073 re-bases. All four are now scoped explicitly: FR-011 (row-scoped detection, creative-scoped effect, per trigger), FR-012 + new FR-012a (one sealed target per creative), FR-013 (re-based to the creative), FR-014 (creative-scoped effect, row-scoped mechanism). FR-011(a) is still narrowed in Stage 1B for the separate efficiency reason. |
| **FR-015, FR-017–FR-023** | Accumulation mechanics (add / no-op / withdraw-then-add, idempotency, no-shrink, raw sums). These operate on ledger entries, which stay per row. The roll-up is a counting rule layered above them, not a change to them. |
| **FR-024, FR-025** | Preserved measures and existing partitions. Amendment 1 changes the unit counted, not the measures or the partition names. |
| **FR-026** | Verdict engine untouched — still true. |
| **FR-027–FR-032a** | Funnel-type weighting. Orthogonal to the unit of evidence; a per-funnel-type breakdown of creatives works exactly as one of ads. |
| **FR-033, FR-035, FR-038–FR-041** | Retrieval wiring, the no-switch-off guarantee, the 3.0 aggregate bound, and the dashboard readers. None of these counts ads; they consume records whose counts changed unit underneath them. |
| **FR-042–FR-045** | Schema versioning and retirement. Unaffected — nothing is migrated, so no old count needs re-basing to creatives. |
| **FR-047–FR-049** | Owner-facing language. Amendment 1 introduces **no owner-visible string** (FR-076's count is a log line, and FR-051e already forbids owner-facing strings in logs). Flagged per the standing instruction: this stage produces no user-facing text, therefore no Arabic. |
| **FR-050** | Test-manifest registration — unchanged obligation. |
| **FR-051, FR-051a, FR-051c, FR-051e** | Only FR-051b's count list needed the new entry; the layering, the skip-reason enumeration, and the content restriction are unaffected. |
| **FR-051d** | Its volume table is rewritten in **Stage 1B** (refresh withdrawal), not here. Deliberately deferred to keep the stages separable. |
| **FR-052–FR-072** | Failure isolation, lazy handles, the lease section, ledger durability and bounded reads. Section J is rewritten in **Stage 1B**; sections I and K are unaffected by the unit change — a by-ID read of the current batch is still per row. |
| **SC-001–SC-007, SC-009–SC-013, SC-015, SC-017–SC-028** | Re-read each against B2. None counts ads: they assert non-decrease, idempotency, byte-identity, cross-funnel eligibility, ranking order, language, lease behaviour, read-bounding, and log shape. All survive the unit change unaltered. |

---

## 5. Not done in this stage, by design

- The Cloud Tasks threat model and the `worker.ts` lease finding — **Stage 1B**
  (`FR-054` / `FR-055`).
- `FR-011(a)` narrowing, the efficiency eligibility rule, day accrual, and the four
  collisions including `FR-005a`–`FR-005d`, `FR-005c`, `FR-051d` and the stacked
  gates — **Stage 1B**.
- The remaining new success criteria (write-once efficiency, day finalisation,
  unlinked-count SC) and the checklist Iteration 5 — **Stage 1C**.
- The three-day-window-is-one-row note belongs with the conversion accrual text —
  **Stage 1B**.

**Stopping here. Stage 1B not started.**
