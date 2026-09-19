# Batch 00 — Phase 4 Understanding

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-phase-4` (continuation of `969-cumulative-learning`, shipped
in PR #71 / commit `efcdb04`)
**Date**: 2026-09-19
**Status of report**: starting point. No code written yet.

This is the second PR. The first shipped Phases 1–3 and 7 of
[`specs/969-cumulative-learning/tasks.md`](./tasks.md); the remaining work
is Phases 4 (sealed context + per-day conversion accrual + efficiency
figure), 5 (cross-funnel, owners-locked threshold, FR-038 bound) and 6
(retrieval path + dashboard updates + owner-visible Fusha string). This PR
is the three of them, scoped here for batch-by-batch delivery.

---

## 1. What the prior PR shipped and what is missing

The prior PR shipped Phase 1 (Setup), Phase 2 (Foundational: creative
grouping + per-account lease + bounded ledger read), Phase 3 (US1: cumulative
delta accumulation with the per-row contribution ledger), partial Phase 5
(`byFunnelType` breakdown + multi-funnel label) and partial Phase 7
(SC-049 behavioural end-to-end test, the registration guard, the
qa-fixtures handler, and the `qararEngine.ts` no-touch check).

What was found not yet implemented when the prior PR merged
(`specs/969-cumulative-learning/reports/scope-audit.md` §4 and §5):

- **All of Phase 4 (Amendment 2)** is missing. The two modules
  `conversionAccrual.ts` and `efficiencyFigure.ts` are referenced in
  `learning/index.ts:29-30` only as **comments**. `DayAccrual` in
  `learning/types.ts:91` is declared and never used. Both efficiency
  fields on `ContributionLedgerEntry` (`efficiencyContributed`,
  `efficiencyValue`) are hard-coded to `false` / `null` at
  `decideAdWriteActions.ts:224-225`. `AdDoc` at `shared.ts:186-241` has
  no `sealedTarget`, no `sealedFunnelType`, no `sealedAt`, no
  `contributionState`, no `efficiencyRaw`, no `adStatus`, no
  `dayAccrual`.
- **Defects inside shipped Phase 3** (`scope-audit.md` §4/C, fixed in
  Batches 28/29/30): the withdrawal average drift, `creativeCount`
  counting creative-sync-observations rather than distinct creatives,
  and `FR-074g`'s all-rows aggregation that was inverted to
  eligible-rows-only. **All three are fixed and shipped before this PR
  begins** (the test suite on this branch is at 424 pass / 0 fail, with
  Batches 28/29/30 in). This PR does not need to revisit them — only to
  build on a stable baseline.
- **`FR-019` write-suppression is now in**, per Batches 28/29/30's pass.
- **`FR-021`'s raw-sums storage is partly in** — averages no longer drift,
  but the additive `sums.{ctrLinkSum,cpmSum,efficiencySum}` shape from
  data-model.md §6 is not yet present. That is the surface Phase 4
  writes the efficiency-sum into. This PR can either (a) keep the
  existing derived-average surface and add a single new derived scalar
  `efficiencyValue` along-side it for FR-002, or (b) extend `sums` with
  `efficiencySum`. The locked decision is documented below in §4.2.
- **No owner-visible content from this PR yet**. The dashboard surfaces
  Phase 5's "have we seen enough yet" icons and the multi-funnel label
  exist. The threshold reading from `creativeCount` is sound
  (Batch 13); the FR-035 activation LATCH is **absent**, and T055 is
  listed as an open independently-implementable task
  (`scope-audit.md` §5 Phase 6).
- **`getTopWinners.ts` is untouched**. It still selects winners **per ad
  row** (`getTopWinners.ts:157-161`). T054 is the open
  independently-implementable retrieval update.

The scope audit's §4 discriminates the prior PR as **53 shipped, 13
partial, 50 absent, 7 NA** out of 123 FRs, with **26 of 56** SCs covered
by a phase-969 test. This PR ships the rest of Phase 4 (the missing 50
absent + the 13 partial that depend on the sealed efficiency figure), and
that alone moves the SC cover-line substantially without re-litigating
shipped work.

---

## 2. What Phases 4, 5 and 6 deliver

The user's prompt summarises the work in plain terms. Reading the spec
and the audit together:

### Phase 4 — US2 (Amendment 2) — "a result, once earned, stays earned"

- The **sealed evaluation context** on every contributed ad row:
  `sealedTarget`, `sealedFunnelType`, `sealedAt`, `contributionState`
  ∈ {PROVISIONAL, SEALED} (FR-001, FR-004, FR-005a, FR-005b, FR-005d,
  FR-007). One-way PROVISIONAL→SEALED with a code guard, not a
  convention (FR-005c), plus its FR-005c carve-out for the first
  efficiency-figure write (SC-031).
- The **single sealed target per creative** (FR-012a): the earliest
  sealing row among all rows now belonging to the creative is the
  authority; no ordering or tie-breaking machinery is introduced.
- The **creative-state derivation** (FR-036c): SEALED if **any** row is
  SEALED, PROVISIONAL only while **every** row is.
- The **operational/recomputed status stays separate** (FR-008, FR-009,
  FR-010, FR-011 — narrowed: target-independent measures only).
- The **per-day conversion counting** (FR-081 through FR-086a), with
  bounded retention (FR-084a), upward-only revision while in window
  (FR-083), absent-days-are-not-zero (FR-085a), and the days-lost-to-
  gaps count distinct from dates-with-no-row (FR-086, FR-086a).
- The **`status` field** persisted onto `AdDoc` (FR-085) from the
  Graph call that already requests it (`metaGraph.ts:83`).
- The **eligibility rule** FR-077: a creative contributes its efficiency
  figure when (a) it reaches **5 combined conversions across all
  placements** OR (b) it has stopped running and carries ≥1. Zero never
  contributes.
- The **efficiency figure** itself (FR-002, FR-002a, FR-003, FR-079,
  FR-080) computed by aggregate-then-divide, write-once, with the
  **recomputation rule** FR-087 — carry across on re-attribution,
  recompute over the union on merge.
- **FR-013a's merge reconciliation** — withdraw both, recompute
  against the earliest sealed target, add one.
- **FR-066's no-pruning note** at the write site of `adPerformance`.
- A dedicated task file `tests/conversionAccrual.test.ts`, two phase-969
  scripts and chain entries.

### Phase 5 — US3 — "winners transfer between funnels"

This is mostly already built (the breakdown and the label), what is
missing is the **weighting** in the retrieval path that `getTopWinners.ts`
ultimately consumes (T049, T050), and the FR-038 bound at 3.0 for the
efficiency value folded into an angle's average. T049 carries a
specific Batch-18 warning **not to weight on `byFunnelType.count`**
(which counts rows, not creatives — it would re-create the 7.4:1
fan-out inflation); the fix is `byFunnelTypeCreativeCount`, a parallel
field counted in distinct creatives. **The efficiency half of T050 is
blocked on Phase 4's sealed figure** and lands with this PR.

### Phase 6 — US4 — "the owner sees the all-time truth"

Mostly already built (tier icons, all-time totals, multi-funnel label).
The remaining items:

- T053 (dashboard reads new shape — already done; residual is the
  all-time confidence the new fields give it).
- T054 (`getTopWinners.ts` reads the new record shape). This is
  independently implementable and lands in Batch 1 per the audit's §8
  ordering, because it closes the **only path still selecting per ad
  row** that reaches generation. Until T054 lands, one creative across
  many placements can fill every winner slot that feeds the AI prompt.
- T055 (the FR-035 activation **latch** — once 10 distinct creatives
  are seen, guidance stays on through partial / failed syncs;
  independently implementable).
- T056 (the multi-funnel indication in both languages — **shipped**,
  but `specs/969-cumulative-learning/reports/scope-audit.md` §4/H
  notes the owner review that the plan promised has not been recorded
  anywhere — see §6 below).
- T057 (the dashboard all-time test file — partly covered by the
  existing `whatsWorkingDashboardMultiFunnel.test.ts`; the SC-007/009/
  021 assertions need to land).

### What this PR does **not** do

- **No Phase 7 observability tasks (T058–T064, T065)** — those stay
  deferred, per the scope-audit recommendation. The "one summary line
  per account per sync" with the four-way provenance breakdown and the
  days-lost count is required by FR-051/FR-076/FR-086, but the
  audit's prior batches chose to merge the PR with Phase 7 observability
  absent and that condition holds. This PR keeps that boundary.
- **No FR-085 `effective_status`** — `status` alone under-detects
  parent-level pauses; that is the locked decision.
- **No FR-048 `lifetime` naming violation** — the grep T036a names is
  built into the test.

---

## 3. What I propose as Batch 1

A batch must be **independently testable** and not skip the test
registration discipline (`functions/src/__tests__/testRegistrationGuard.test.ts`
catches a gap every time the chain is touched). Two clusters naturally
batch together: the **conversion accrual + status persistence** track
(T034/T037/T035/T036/T036a/T038/T045), and the **sealed-context +
efficiency-figure + recomputation-rule** track (T028/T029/T030/T031/
T033/T039/T040/T041/T042/T043/T044/T046). The Phase 5 weighting +
bound on Phase 6 retrieval are smaller and fit a follow-up batch.

**Batch 1 (this report's deliverable)** is the lower-cost track that the
audit identifies as **independently implementable today**: T034
(`accrueDays`), T037 (persist `status`), T035 (bounded retention), T036
(absent days are not zero), T036a (no `lifetime` naming), T038
(`isStopped`), and T045 (their dedicated test file). The audit's §8
orders these as the "fastest route to the owner's sentence" because both
inputs — per-day `actions` rows and the `status` field — **already
arrive** on every sync and are currently discarded. No new Graph call.

Justification for starting here and not with the sealed-context track:

1. The two inputs are already paid for. The per-day actions arrive via
   `fetchAdInsights7dDaily` (`metaGraph.ts:389-396`) with
   `time_increment=1`; `countConversionActions` at `shared.ts:355-370`
   already takes an array of rows and would yield a per-day count
   unmodified. The `status` field is requested at `metaGraph.ts:83`
   and typed at `:145` — both currently discarded before reaching
   `AdDoc`. Neither requires touching Meta fetches.
2. FR-083 (upward-only revision) and FR-086 (days-lost count) are the
   **two owner-locked decisions** in the unimplemented scope. They are
   short to build and they unblock the eligibility rule that the AI
   recommendation needs to learn what gets sales.
3. The sealed-context track depends on the funnel-economics resolver
   already being able to deliver a sealed target. That resolver lives
   in `entitlements.ts` / `cpaEconomics.ts` and is wired into the
   `verdict` engine, but producing it from a SYNC context (outside
   the existing per-call resolver) needs its own review. Putting it in
   Batch 2 gives a checkpoint for that resolver path.
4. The audit's §8 / Phase 4 order says **T034 + T037 are the two
   cheapest items in the whole remainder** and parallels T037's status
   work with T028's sealing — i.e. add `status` first, then the sealed
   state machine, then accrual, then efficiency. Batch 1 follows that
   order.

| Task in Batch 1 | Requirement | Touches |
|---|---|---|
| T037 | FR-085 — persist `status` onto `AdDoc` (the fetch is already there) | `metaSync/shared.ts` (AdDoc interface + per-ad write path) |
| T034 | FR-081/FR-083/FR-084 — `accrueDays` pure function | NEW `learning/conversionAccrual.ts` |
| T035 | FR-084a — bounded retention (finalise on exit, drop the map entry) | `learning/conversionAccrual.ts` |
| T036 | FR-085a — absent rows are not zero | `learning/conversionAccrual.ts` |
| T036a | FR-082 — naming rule, with a grep guard | `learning/conversionAccrual.ts`, the test |
| T038 | FR-077(b) / FR-085 — `isStopped` only from own `status`, **under-detects by design** | `learning/conversionAccrual.ts` |
| T045 | SC-037/038/039/040/041/051 — the test file | NEW `__tests__/phase969/conversionAccrual.test.ts` |

Test registration for T045: every new test file **must** be added both
as `test:phase969:conversionAccrual` in `functions/package.json` and in
the `test:phase969` chain, plus to the outer `test` chain that the
`testRegistrationGuard` walks. The guard catches a missing entry.

I deliberately keep T033 (FR-011 re-evaluation triggers) out of Batch 1
even though it is the natural neighbour of T034/T037. T033 widens an
existing decision table (`decideContribution` in
`learning/contributionLedger.ts`) and depends on T028 having emitted a
ledger entry with `sealedAt` to compare against. It belongs with Batch
2's sealing spine.

I also keep the test files `sealedContext.test.ts` (T044) and
`efficiencyFigure.test.ts` (T046) out — their subjects are not in this
batch. Adding them later in Batch 2 / Batch 3 with the chain registered
together is the way the prior batches established.

---

## 4. Anything in the spec the first PR has made stale

The user's prompt explicitly asks: *what in the spec is stale because
the merged work changed files the spec cites into?*

The audit already enumerated this — `scope-audit.md` §7 found **28 of 63**
`path:line` citations in `spec.md` are now stale (every citation into
`shared.ts`, `learningAggregates.ts` and `whatsWorkingDashboard.ts`,
which the prior PR rewrote — 3005 lines changed in `shared.ts` alone).
Of those 28 stale citations, **three are load-bearing** for a Phase 4
implementer following the spec text directly:

1. **`shared.ts:170-211`** (cited by the data-model.md §1 *"AdDoc as
   defined at `functions/src/metaSync/shared.ts:170-211`"*) — line 211
   is now `};`, the AdDoc interface goes to line 241 and the field
   `creation` block has expanded with `verdict`, `ruleCode`,
   `reasonAr`, `diagnosisAr`, `evaluatedAt`, `schemaVersion`, `ledger`.
   `ledgier` is **on the type now**, so new fields like `sealedTarget`
   next to it is the right neighbourhood.
2. **`shared.ts:864-869`** (cited from FR-072a and §7 of the audit's
   load-bearing list as "the match-link precedence lock") — the lock
   has moved into `learning/fieldLevelDiscrimination.ts:168-176`. The
   spec's wording is correct, the line is not.
3. **`learningAggregates.ts:119-124`** (cited four times across
   `spec.md` for the live per-row eligibility predicate) — the
   function `isEligibleForLearning` was deleted in Batch 11 (the module
   says so at its own `learningAggregates.ts:20`). The logic lives on
   as the private `isAdEligible` at `aggregateDelta.ts:302-306`.

The spec's own "Note: Citations Into Rewritten Files Are Historical" at
`spec.md:170-187` already recorded this for the prior batch's three
large files. The mitigation the user prompt asks me to do is the same as
the audit's recommendation in §7 of `scope-audit.md`:

> add one line to the spec stating that all `path:line` citations were
> verified against `origin/main` before implementation and that
> `shared.ts`, `learningAggregates.ts` and `whatsWorkingDashboard.ts`
> have since been rewritten, so citations into those three files are
> historical — plus a targeted fix for the three load-bearing ones above,
> because those are the citations a future implementer will actually
> follow.

I will not edit the spec for Batch 1 — the spec note at lines 170–187
already says exactly the right thing and was added in Batch 28 by the
prior implementer. The targeted fix for the three load-bearing citations
is **out of scope for code delivery** — that is a spec-text change and
its surface is owned at the project level, not in this PR's chat
output. I'll note it in the Batch 1 report so the user can decide.

Two additional stalenesses the audit flagged but the user's prompt
doesn't list:

- **`spec.md:128-130` "status is requested... but `ad.status` is never
  read"** — this line is one of the "Claims This Feature Will Make
  False By Design" rows. After this PR, `status` is read and persisted.
  The row should retire at PR time the same way the line *"Same
  generationId in 2 ad sets → separate records per context"* retired
  in Batch 11's `learningAggregates.ts:15-20`.
- **`spec.md:201` "The per-day `actions` arrays... arrive every sync
  and are **never read**"** — same situation. The row should retire
  when the reading lands.

I will fold both retirements into the Batch 2 sealed-context report
when those tasks land; for Batch 1 they remain accurate.

### 4.2 The `sums.{...}` shape decision

`data-model.md §6` describes the hook aggregate as storing
`sums: { ctrLinkSum, cpmSum, efficiencySum, ... }` with derived
averages computed from the sums. The prior PR landed the additive deltas
*and* the round-trip-correct `avgLinkCtr` (Batch 28's `withdrawAvg`
re-derives the average from the recorded value), but **did not introduce
a separate `sums` block**. The shipped additive aggregator uses the
count-and-mean pair and re-derives the mean on withdrawal.

For Phase 4 I propose the **narrowest change that satisfies FR-002a**:

- Keep the existing count-and-mean surface on the hook aggregate.
- Add a derived scalar `byObjective.conversion.efficiencyAvg` (and the
  same on `byFunnelType`, `byGeoTier`, `byAudienceType` buckets as
  appropriate) **and** a count of contributing creatives
  `byObjective.conversion.efficiencyContributingCount`, computed at
  additive pass time from **only** creatives whose
  `efficiencyValue !== null` and `efficiencyRaw !== null`. This gives
  the angle's average efficiency figure a stable basis that doesn't
  drift on every withdraw-and-re-add.
- **Do not** introduce a multi-field `sums: { … }` block. The batch
  already proves the count-and-mean pair is drift-free under the
  narrowed add/withdraw invariant. Adding a third block would create a
  parallel surface the existing readers cannot consume, and none of
  the criteria asks for it.

I will record this decision in the Batch 2 efficiency-report when
T039 lands; flagging here because data-model.md §6 may need a one-line
clarification that the `sums.{...}` is "as needed for efficiency",
not a structural rewrite. **If the user prefers the full `sums`
block, flag it now and I will scope it into Batch 1; otherwise Batch
2 lands with the narrowest change.**

---

## 5. Test discipline for this batch

The user's prompt is explicit:

- **No source-text tests.** Assert behaviour, not what the source code
  contains. If something can only be asserted at the source level,
  label it as a structural guard and do not count it as coverage.
- **Test registration** through the chain. `functions/src/__tests__/
  testRegistrationGuard.test.ts` is the gate.
- **Raw command output verbatim** in the report, including tails and
  exit codes.

Batch 1's test surface (T045) is **all behavioural** because the accrued
state lives on the `DayAccrual` object the test constructs directly and
because `accrueDays` is a pure function over `existing + rows +
window`. The structural guards (T036a's `lifetime`/`since-inception`
grep) are labelled structural, fired only when their subject is alive in
code, and are **out of Batch 1's behavioural test surface**.

Two patterns the prior PR established that Batch 1 inherits:

- `node:test` + `node:assert/strict`. The `applyLearningWritesLease.test.ts`
  preamble-style stub-Firestore pattern is the precedent for any test
  that needs to drive an endpoint touching the bounded read; T045's
  pure-function surface needs no stubs at all.
- SC numbers in test descriptions. The runner walks test names against
  the spec's 56 success criteria to catch name-vs-body drift. Every
  new assertion names the SC(s) it covers — SC-037, SC-038, SC-039,
  SC-040, SC-041, SC-051.

---

## 6. Open questions worth flagging before code

These are not blockers. They are places where the spec, the audit and
the prompt diverge or are silent, and I want the user's confirmation
before I commit.

### 6.1 The activation LATCH (FR-035) — in this PR or a follow-up?

The Phase 6 latch (once guidance is on, it stays on) is independently
implementable. It is required to make the FR-034 threshold meaningful
under partial syncs. The audit lists it as a Phase 6 task
(`scope-audit.md` §5 Phase 6 row T055's FR-035 half) and says it can
land in parallel with Phase 4. **I propose it as its own batch —
Batch 3 — so it lands with its own end-to-end behaviour test
(retro-cutting the threshold under a partial sync and asserting the
gate stays open).** If the user prefers to fold it into this PR, say
so and I will scope it into Batch 1.

### 6.2 The owner-review gate on T056's Fusha string

`scope-audit.md §4/H` notes that T056's English + Arabic string
(`i18n.tsx:550-551` and `:1510-1511`) shipped without a recorded
owner review. The string has been in `i18n.tsx` since Batch 17 and the
plan's Constitution V verdict passed on the basis that a review would
happen. **I will not surface this for review in Batch 1.** It is its
own thing and needs the owner's eyes on the Fusha wording — I prefer
to handle it as a separate check-in once the FR-041 multi-funnel
surface is visible. Flagging now so it is not forgotten.

### 6.3 `applyLearningWritesLease.test.ts` already uses a stub
Firestore. T045's `conversionAccrual.test.ts` is pure-function — do I
need to touch the worker integration at all?

T034's `accrueDays` lives in its own module and has no Firestore
handle in scope. The call site inside `runSyncForAccount` (where the
resulting `DayAccrual` is merged into the queued `adDoc` write with
`merge: true`) is **Batch 2 work** in the audit's order (it requires
the sealed state machine and FR-037's evidence gate to land first).
Batch 1 lands:

- the pure module;
- the test file;
- T037's `status` persist (a write-site change to `AdDoc` and the per-ad
  write — minimal, lands as a single merge write of an `adStatus` field).

No integration with `applyLearningWrites` in Batch 1. The accrued value
becomes visible to the eligibility rule only after Batch 2 wires it
into the per-ad loop and Batch 3 computes the efficiency figure from
it. Flagging because Batch 1's `status` persistence alone has no visible
test surface — the read of `adStatus` happens in T038's `isStopped`,
which IS Batch 1, but the consumer (Batch 3's FR-077b call) is not.

### 6.4 The Arabic strings this PR introduces

Batch 1 introduces **no new owner-visible strings**. The eligibility
threshold (FR-077) and the days-lost count (FR-086) are internal
operational metrics read by the worker and the dashboard respectively;
neither needs bilingual copy. The dashboard reader
(`whatsWorkingDashboard.ts`) already handles `multiFunnel` and the
tier icons. **If Batch 3's LATCH ends up needing an "activated" label,
I will flag it then.**

---

## 7. What I have NOT done yet

Per the user's instructions, this is a starting point and **no code
has been written this turn**. Specifically:

- No source files modified. No new files created.
- No edits to `functions/package.json`. No test scripts registered yet.
- No build, no test, no commit, no push.
- The git working tree is at the branch HEAD (`969-phase-4`), clean
  against `main`.
- I verified the prior PR's green state with the full test chain from a
  clean `lib/` (last tail: `contractFixtures.test: PASS`, `EXIT=0`).
  The state the prior PR merged is what this PR is building on.

I will stop here and wait for the user's response before Batch 1.

---

## 8. Summary

| Area | State | This batch |
|---|---|---|
| Phase 3 (US1, MVP) | **Shipped** — four defects fixed in Batches 28/29/30 | None — stable baseline |
| Phase 4 (US2, sealed context) | **Not implemented** | Batch 1 (status + accrual + bounded retention + absent-day rule) |
| Phase 4 (US2, efficiency) | **Not implemented** | Batch 2 (sealed state machine + eligibility + efficiency figure + FR-087) |
| Phase 5 (US3, weighting + bound) | Partial (the breakdown ships; weighting + bound absent) | Batch 3 (FR-030 weighting + FR-038 bound + cross-funnel tests) |
| Phase 6 (US4, retrieval + latch) | Partial (label ships; retrieval per-row; no latch) | Batch 4 (`getTopWinners.ts` reads new shape + FR-035 latch + dashboard tests) |
| Phase 7 (Polish, summary line + days-lost) | Partial (gates + a guard; six logging tasks absent) | Deferred — out of scope for this PR |
| FR-066 no-pruning note | **Not implemented** | Lands with T028 in Batch 2 |

Three risks worth re-stating before code:

- **Audit §4/C was a warning about defective code; this branch's
  baseline is post-fix.** I will not re-litigate the fixes; they are
  green and tested. If anyone moves the conversation to "should we also
  rebuild X", the answer is "no, X is in and green — tell me which
  FR-XXX you want built next".
- **`getTopWinners.ts` is the longest-standing unfixed retrieval path.**
  It still selects per ad row and feeds the AI prompt. Even leaving
  Phase 4 aside, it is the one artefact the prior PR left that the
  current PR can close cheaply (Batch 4 in the table above).
- **No GRAPH call change.** Per FR-081 and the locked decision, none
  of Batch 1, 2, 3 or 4 introduces a new Meta fetch. SC-037 (zero
  additional Graph calls) holds without effort.
