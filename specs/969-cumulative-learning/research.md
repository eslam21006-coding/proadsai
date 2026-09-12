# Phase 0 — Research

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05

The specification carries two clarification sessions resolving nine questions, so
almost nothing was left open at requirement level. This document resolves the
**three design choices that remained**, plus one confirmation the plan depends on.

Everything here is a *how*, not a *what* — no decision below changes a requirement.

---

## D1 — How per-day conversion figures are stored

**Decision**: a bounded map on the ad performance document, keyed by ISO date, holding
only days still inside the observed window, alongside two scalars: a running
`finalisedTotal` and a `finalisedDayCount`.

**Rationale**: FR-084a mandates the *retention policy*; it names no storage shape, so
the shape is this phase's choice. A map on the ad row's own document is chosen
because:

- FR-016 already places the contribution ledger on that document, and FR-067 reads
  those documents **by ID for the current batch**. Per-day data on the same document
  costs **zero additional reads**.
- FR-071 requires **whole documents, not projections**, so anything stored here is
  read whether or not it is wanted — which is exactly why FR-084a bounds it. With the
  window bounded, the per-row footprint is constant: at most one entry per day in the
  window plus two scalars.
- Bounding satisfies SC-050 and, transitively, SC-023 — read volume is a function of
  batch size, never account age.

**Alternatives considered**:

| Alternative | Rejected because |
|---|---|
| A subcollection per ad row (`.../adPerformance/{adId}/days/{date}`) | Multiplies reads by the window size and breaks the single-read-per-row property FR-067 was written to obtain. Firestore subcollections are not returned with the parent document. |
| A separate top-level per-day collection | Same read cost, plus it re-creates the unbounded scan FR-068 exists to delete. |
| Unbounded map, all days retained forever | **Breaches SC-023 through FR-071** — ~367,920 entries/year at the 1008 rows already measured, read in full on every sync. This is the option FR-084a forbids. |
| Keep only the running total, no per-day entries | Cannot satisfy FR-083's upward-only revision: with no stored per-day value there is nothing to compare a re-observation against, so a raised day cannot be distinguished from a duplicate. |

**Consequence recorded**: once a day is folded in, the ledger can no longer answer
"which days composed this total" — accepted in FR-084a and consistent with FR-051a,
whose audit guarantee is over contributions to aggregates.

---

## D2 — Where the per-account learning lease lives

**Decision**: a new top-level collection, one document per `(ownerUid, accountId)`
pair. `functions/src/metaSync/lease.ts` is **not** modified or reused.

**Rationale**: FR-054b requires that Phase 970's lease not be cited as satisfying
FR-054, and FR-059's corrected clarification requires a different document with a
different key. The two are verified different in kind:

| | Phase 970 in-flight guard | This feature's learning-write lease |
|---|---|---|
| Key | `metaSyncLeases/{ownerUid}` (`lease.ts:52`, `:77`) | `(ownerUid, accountId)` |
| TTL | 10 min (`lease.ts:53`) | 15 min (FR-059) |
| Scope | suppresses concurrent presses by one owner | serialises one account's learning write |
| Covers the Cloud Tasks worker? | **No** — `worker.ts:19`, `:61` | **Yes**, by construction (FR-054a) |

**Alternatives considered**:

| Alternative | Rejected because |
|---|---|
| Reuse `metaSyncLeases/{ownerUid}` with a longer TTL | **Cannot serialise per account.** An owner with three ad accounts would have all three contending for one document, and a manual press would block every account's learning write. FR-059's clarification struck exactly this design. |
| One artifact selecting a TTL by call site | Same defect; struck by FR-059's corrected clarification. |
| Lease at the orchestrator, wrapping `runFullSync` | Does not reach `worker.ts` — the route carrying most of the volume. **SC-043 fails this.** |
| No lease; rely on Cloud Tasks deduplication | There is none: neither enqueue site supplies a task name (`orchestrator.ts:588-611`, `dispatcher.ts:162-179`), so names are generated (FR-054c). |

**Shape sharing is fine, and is used**: holder identity + absolute expiry (FR-057),
acquired and released in a single-document transaction (FR-056). What may not be
shared is the document or the key.

---

## D3 — How the delta contract replaces the overwrite contract

**Decision**: `learningAggregates.ts` keeps its function signatures and its pure
character, but its documented contract inverts from **"the worker OVERWRITES the
Firestore doc with the returned value"** to **"the worker applies the returned
per-record deltas"**. The module's header rule *"Same generationId in 2 ad sets →
separate records per context"* (`learningAggregates.ts:17`) is **deleted**, since
FR-073 overturns it.

**Rationale**: the Assumptions section requires accumulation to be expressible as
**per-record deltas applied within the existing batched-commit path**, not as
read-modify-write loops outside it. Firestore's atomic increment satisfies this for
sums and counts, which is why FR-021 requires raw sums and counts to be stored rather
than only averages: an increment is exactly a delta, and FR-022's derived averages
are recomputed from them on read.

**The primary risk the checklist flagged, resolved**: the "Carried into planning"
note asked that planning **say plainly** if delta accumulation cannot be expressed
inside the existing merge-semantics batch. **It can**, with one qualification worth
stating rather than discovering:

- Sums, counts, win/loss totals and per-funnel-type breakdowns are all **additive**
  and map directly to atomic increments inside the existing batch.
- **Averages (FR-022) are not additive** and must be written as computed values.
  Since they are pure functions of the sums and counts in the same document, and the
  lease (FR-054) serialises the only writer per account, computing them in the same
  operation is safe. They are **derived output, not accumulated state** — which is
  what FR-021 and FR-022 already say when read together.
- **Withdrawal is a negative delta**, not a recomputation, which is precisely why
  FR-021 forbids recomputing from history and why it stops rounding drift under
  FR-018's repeat-processing guarantee.

**Alternatives considered**:

| Alternative | Rejected because |
|---|---|
| Read-modify-write per aggregate document | Contradicts the Assumptions' batched-commit constraint, and reintroduces the race the lease exists to remove — at a second layer. |
| Recompute each aggregate from all history each sync | This is the present defect (investigation §3.2), and it is unbounded in account age. |
| Store only averages and back-solve | Cannot express exact withdrawal; accumulates rounding drift across repeated add/withdraw, breaching SC-002's zero-drift requirement. |

---

## C1 — Confirmation: no new Graph API call is needed

Not a decision — a confirmation the plan's cost claim rests on, restated here so it
is not re-litigated.

- `fetchAdInsights7dDaily` (`metaGraph.ts:389-396`) already sends `time_increment: 1`,
  so Meta returns **one row per day**.
- It shares `INSIGHTS_FIELDS` with the other windows (`metaGraph.ts:362`, `:376`,
  `:393`), so each daily row already carries `actions` and `date_start`/`date_stop`.
- `countConversionActions` (`shared.ts:355-370`) already accepts an **array of rows**
  and yields a single day's count unmodified.
- Those rows are consumed today only by `spend7d` (`shared.ts:284`), `peak1dCtr`
  (`:307`) and `computeAgeDays` (`:1253`) — **the per-day `actions` arrays arrive on
  every sync and are never read.**
- `status` for FR-085 is likewise already requested (`metaGraph.ts:83`) and typed
  (`:145`), and merely never persisted.

**The three-day window is a single aggregated row and MUST NOT be used** —
`fetchAdInsights3d` sends no `time_increment` (`metaGraph.ts:353-366`), stated in the
code at `shared.ts:294`. The `.reduce()` calls at `shared.ts:220` and `:266` iterate a
one-element array and read like a per-day series without being one.

**Net effect on cost**: Graph calls unchanged (SC-037); Firestore reads **reduced**,
because FR-068 removes an unbounded collection scan. Constitution VIII satisfied
without a trade.

---

## Post-design re-check of the Constitution

Re-evaluated after Phase 1. **Verdict unchanged: PASS**, with the two deliberate
checklist failures recorded in `plan.md`.

Two principles were re-examined specifically because the design could have moved
them:

- **VI (auditability)** — D1 collapses finalised days, which *reduces* what the
  ledger can explain. Re-checked against FR-051a: its guarantee is over
  **contributions to aggregates**, and every contribution remains fully explicable
  from the ledger entry. Day-level accrual is an input to a contribution, not a
  contribution. **Still PASS**, and the loss is recorded in FR-084a rather than
  absorbed.
- **VIII (cost discipline)** — D1 could have added reads. It does not: per-day data
  sits on a document FR-067 already reads by ID. **Still PASS.**

**V (Arabic) is unchanged and requires no work**: this feature introduces zero new
owner-visible strings, and FR-065's existing bilingual message is untouched. The
FR-059/FR-065 tension ("try again in a few minutes" against a 15-minute TTL) is
carried as an owner decision, not resolved by an unreviewed edit.
