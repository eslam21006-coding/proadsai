# Batch 1D — `/speckit.clarify` questions, collected and classified

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Spec scanned**: `specs/969-cumulative-learning/spec.md` (598 lines, 110 FRs, 51 SCs)

**The spec was NOT modified.** `/speckit.clarify`'s interactive loop and its
integration step were both suppressed, per instruction: questions are collected
verbatim and classified here, and the owner answers. No `## Clarifications` entry
was written.

Prerequisites resolved cleanly:

```
{"REPO_ROOT":"D:\\proads-worktrees\\969-cumulative-learning","BRANCH":"969-cumulative-learning","FEATURE_DIR":"...\\specs\\969-cumulative-learning","FEATURE_SPEC":"...\\spec.md","IMPL_PLAN":"...\\plan.md","TASKS":"...\\tasks.md"}
```

---

## Result: **five questions, and all five are Group 3.**

That is worth stating plainly. **Zero Group 1 and zero Group 2 questions survived
the queue** — not because the scan avoided those areas, but because every candidate
that touched settled ground was suppressed at generation time by the classification
rules, and is listed in §Suppressed below so the filtering is auditable rather than
invisible.

All five arise from the amendments themselves, and four of them are the same
*shape* as defects already found and fixed in this review: a rule that is
well-defined for one unit or one occurrence, and undefined when the second one
appears.

---

## Group 3 — genuine open ambiguity

### Q1 — Where do per-day conversion figures live, and for how long?

**Category**: Domain & Data Model → data volume / scale assumptions.
**Status before**: Missing.

**Question, verbatim**:

> FR-084 fixes the deduplication key at (ad row id, date), and FR-016 places the
> contribution ledger on the ad row's own document. The spec never says where the
> per-day conversion figures are stored, nor how long they are retained. Are
> per-day entries retained indefinitely for every row, or only for days still
> inside the observed window, with finalised days collapsed into a running total?

**Surrounding spec text**:

> **FR-084**: The deduplication key for conversion accrual MUST be **(ad row id,
> date)**. A creative's total is the **sum across its rows** of its rows' per-day
> figures.

> **FR-066**: Ad performance documents MUST NOT be pruned, aged out, or deleted by
> any retention policy.

**Why it materially matters**: the two requirements compose into unbounded growth
on a document that may never be pruned. At the account sizes already measured —
1008 ad rows — indefinite per-day retention is on the order of 368,000 entries per
year, against a per-document size ceiling. Conversely, retaining only in-window
days plus a running total appears sufficient for idempotency, because a
re-observation of a finalised day can be identified by date arithmetic alone
(FR-083 finalises on window exit) rather than by finding its stored entry. The two
readings produce very different data models, and the choice is not recoverable
cheaply after implementation.

**Not answerable from Batch 0**: no per-day figures exist in production today —
this feature is the first thing to store them.

---

### Q2 — On re-attribution, is the efficiency figure recomputed or carried across?

**Category**: Domain & Data Model → lifecycle / state transitions.
**Status before**: Partial (two requirements point opposite ways).

**Question, verbatim**:

> FR-079 states a creative's efficiency figure is written once and never revised.
> FR-080 states withdraw-then-add survives for attribution changes. When a
> creative's attribution changes under FR-011(b) and its contribution is withdrawn
> from the old angle and added to the new, is the figure **carried across
> unchanged** (honouring FR-079's write-once), or **recomputed** from the
> conversions accrued by then (which will usually be more than at first
> contribution)?

**Surrounding spec text**:

> **FR-079**: Once contributed, a creative's efficiency figure is **written once
> and never revised**. No performance change, no later conversion, and no
> subsequent sync may alter it.

> **FR-080**: Withdraw-then-add for the efficiency figure survives **only** for
> attribution changes (FR-011(b) / FR-013), which require a manual linking action
> and are genuinely rare.

**Why it materially matters**: it decides whether a manual re-link is a
*bookkeeping move* or a *re-measurement*. Recomputing gives the new angle a
better-evidenced figure but makes FR-079's guarantee conditional, and creates a
path by which an owner could refresh a stale figure by re-linking — the live feed
FR-011(a)'s narrowing exists to prevent. Carrying it across keeps FR-079
unconditional but can move a figure computed at 5 conversions onto an angle where
the creative has since accumulated many more. **SC-035 and SC-036 assert different
things depending on the answer**, so this blocks test design, not just
implementation.

---

### Q3 — When two already-sealed creatives merge, which sealed target survives?

**Category**: Domain & Data Model → identity & uniqueness rules.
**Status before**: Missing.

**Question, verbatim**:

> FR-074b merges two hash groups that resolve to the same generationId into one
> creative. FR-012a requires a creative to carry exactly one sealed target, fixed
> by its first row to seal. If both groups have already sealed — each with its own
> first-sealing row, and possibly against different account targets sealed at
> different times — which sealed target does the merged creative carry?

**Surrounding spec text**:

> **FR-074b**: After hash grouping and link propagation, **any two groups that
> resolve to the same `generationId` MUST merge into a single creative.**

> **FR-012a**: **A creative MUST carry exactly one sealed target across all of its
> rows.** The target sealed by the **first row of that creative to seal** becomes
> the creative's sealed target…

**Why it materially matters**: this is the FR-012a gap one level up. FR-012a was
written because rows of one creative could otherwise hold different sealed targets
and leave the efficiency ratio without a single denominator (FR-002a). A merge
joins two creatives that each already satisfy FR-012a individually and can still
produce exactly the condition FR-012a forbids. "Earliest sealing moment across both
groups" is the obvious reading and is probably right, but it is **not stated**, and
the alternative — the surviving group's target, or a re-seal — changes every
efficiency figure downstream of a merge.

**Related unresolved sub-case**: if the two groups have also both already
*contributed* their efficiency figures, the merge must withdraw two contributions
and add one; FR-013's withdraw-then-add is written for a single creative changing
attribution, not for two creatives becoming one.

---

### Q4 — Is a missing daily row zero conversions, or no observation?

**Category**: Edge Cases & Failure Handling → negative scenarios.
**Status before**: Missing.

**Question, verbatim**:

> FR-083 accrues a value per (ad row, date) from the seven-day daily insights. Meta
> returns no row for a day on which an ad had no delivery. Is an absent daily row
> recorded as **zero conversions for that day**, or treated as **not observed**,
> leaving any previously recorded value untouched?

**Surrounding spec text**:

> **FR-083**: A day's conversion figure MUST remain **revisable while that day is
> still inside the observed window** … Revision is **UPWARD-ONLY**.

> **Edge case (existing)**: *Meta stops returning an ad. Its existing contribution
> stands. Absence is not evidence of failure and must never reduce a count.*

**Why it materially matters**: under the upward-only rule the two readings mostly
converge — writing zero cannot lower an existing value — but they diverge on the
**first** observation of a day, and on whether a day that was never delivered is
"finalised at zero" or "never observed". That distinction feeds FR-086's
days-lost-to-gaps count, which SC-042 requires to be **correct**, not merely
present. If an absent row counts as an observed zero, a paused ad's days are
counted as observed and the gap count reads zero through an outage it was written
to detect.

The existing edge case governs an **ad** disappearing; it does not obviously govern
a **day** within a returned ad's window, and the spec does not extend it.

---

### Q5 — Inside `runSyncForAccount`, does a lease failure fail the account sync?

**Category**: Non-Functional → reliability; and Integration → failure modes.
**Status before**: Partial (sharpened, not created, by FR-054a).

**Question, verbatim**:

> FR-054a places the lease inside `runSyncForAccount`, around the learning write.
> FR-060 requires a scheduled run that cannot acquire the lease to signal failure
> so Cloud Tasks retries it. FR-052 requires a learning-accumulation failure not to
> break the sync. Now that the lease sits inside the account sync body, does a
> failed acquisition fail the **whole account sync** — discarding the operational
> status and snapshot writes that already succeeded — or complete the sync while
> signalling only the learning write for retry?

**Surrounding spec text**:

> **FR-052**: A learning-accumulation failure MUST NOT break the sync. On failure,
> existing records are left untouched and the failure is recorded…

> **FR-060**: … **Scheduled** — MUST NOT fail silently and MUST NOT skip. It MUST
> signal failure in the way the existing task infrastructure already understands,
> so the run is retried with backoff rather than dropped.

**Why it materially matters**: before FR-054a the lease was conceptually outside
the sync body, so "signal failure" and "don't break the sync" could both hold.
Inside `runSyncForAccount` they collide: the only failure signal Cloud Tasks
understands is the invocation throwing, and that discards the run's operational
writes — which FR-009 requires to stay current, and which SC-020 asserts must not
be silently skipped. A retry then re-does the whole account's Meta fetch to reach a
learning write that may still be contended.

**This one is arguably a defect rather than an ambiguity.** I am reporting it as a
question rather than fixing it because the resolution is an owner trade
(operational freshness versus retry simplicity), not a correction with one right
answer. **If you would rather I treat it as a defect and propose a resolution, say
so** — it is the only one of the five where I think that might be the better
route.

---

## Suppressed at generation time — with the group that suppressed them

These were produced by the taxonomy scan and removed before the queue, because
their answers are already fixed. Listed so the classification is auditable.

### Group 1 — settled by owner decision. Not re-opened.

| Candidate question the scan raised | Settled by |
|---|---|
| Should learning partition by epoch and reset when funnel type changes? | *Decisions Already Locked* — no epoch partitioning. |
| Should existing aggregate records be migrated or backfilled? | *Decisions Already Locked* — retired, not converted. |
| Should the efficiency figure be bounded at source rather than in the aggregate? | FR-003 (unbounded on the ad) + FR-038 (3.0 in the aggregate), with the bounded alternative considered and rejected. |
| Should the sealed learning result track current economics? | FR-008 / FR-009 / FR-010 — operational status recomputes, sealed result is immune. |
| Should `funnelType` filter retrieval as well as weight it? | FR-030 / FR-031 / FR-032 — weighting only, never exclusion. |
| Should the activation threshold change now that it counts creatives? | FR-034 — 10 / 3 / 3 retained, unit changed, marked PROVISIONAL. |
| Is 5 the right conversion threshold? | FR-077's justification (2 / 5 / 10 argued). |
| Should a downward revision of a still-open day be applied? | FR-083 — upward-only, owner decision, with the accepted cost recorded. |
| Should idempotency use a mechanism other than the contribution ledger? | FR-016 / FR-017 / FR-018 — ledger with delta-only writes. |

### Group 2 — settled by Batch 0 evidence. The answer is a file and line.

| Candidate question the scan raised | Answer |
|---|---|
| Is a lifetime conversion count available from Meta? | No. Every count is window-scoped; the window is a request parameter, not a field. `metaGraph.ts:52-68`, `:353-366`. Accrual per day from `last7DaysDaily` (`:389-396`) is the route — FR-081. |
| What signal expresses "stopped running"? | `status`, already requested (`metaGraph.ts:83`) and typed (`:145`), never read and never persisted (`AdDoc`, `shared.ts:170-211`) — FR-085. |
| Can `metaAdId` serve as the creative key? | No. Assigned from `ad.ad_id` (`orchestrator.ts:455`), so per-row by construction; and absent, not null, on 0 of 1008 rows and 0 of 58 deployment records — FR-074. |
| Does Phase 970's lease cover the learning write? | No. `worker.ts:19`, `:61` call `runSyncForAccount` directly with no lease — FR-054b. |
| What is the ad-row-to-creative fan-out? | 383 → 52 (7.37:1) on `act_995888422231015`; 1008 → 146 (6.90:1) across both accounts — FR-073. |
| Does Cloud Tasks deduplicate same-account tasks? | No. Neither enqueue site supplies a task name (`orchestrator.ts:588-611`, `dispatcher.ts:162-179`), so names are generated — FR-054c. |

---

## Coverage summary

| Taxonomy category | Status |
|---|---|
| Functional scope & behavior | **Clear** — four prioritised user stories, explicit out-of-scope, single actor. |
| Domain & data model — entities, relationships | **Clear** — Key Entities updated for the Creative. |
| Domain & data model — identity & uniqueness | **Outstanding → Q3** (merge of two sealed creatives). |
| Domain & data model — lifecycle / state | **Outstanding → Q2** (figure on re-attribution). |
| Domain & data model — volume / scale | **Outstanding → Q1** (per-day retention). The only category that was fully *Missing*. |
| Interaction & UX flow | **Clear** — reading surfaces specified; no new owner-visible string introduced by either amendment. |
| Performance / scalability | **Deferred to planning** — bounded reads (FR-067–FR-069) and chunk sizes are specified; throughput targets are a planning concern. |
| Reliability & availability | **Outstanding → Q5** (lease failure versus FR-052). |
| Observability | **Clear** — FR-051a–e, FR-076's four-way breakdown, FR-086's days-lost count. |
| Security & privacy | **Clear** — no new data class; workspace scoping unchanged. |
| Compliance | **Clear** — not applicable; no regulated data introduced. |
| Integration & external dependencies | **Partial, mostly resolved** — Meta failure modes covered by FR-082's three undercount routes; **Q4** is the one open case. |
| Edge cases & failure handling | **Outstanding → Q4**; otherwise resolved, and the consolidated list was extended in Iteration 5. |
| Constraints & tradeoffs | **Clear** — three limitations stated with direction of error; near-hash clustering explicitly rejected. |
| Terminology & consistency | **Clear** — "creative" versus "ad row" used consistently; "conversions across days observed" mandated over "lifetime" (FR-082). |
| Completion signals | **Clear** — 51 success criteria; every requirement named in 1C-i has one. |
| Misc / placeholders | **Clear** — no `[NEEDS CLARIFICATION]` markers; no unquantified adjectives found in requirement text. |

---

## Recommendation

**Do not run `/speckit.plan` until Q1, Q2 and Q3 are answered.** Each of the three
changes the data model or the arithmetic, and planning would otherwise commit to a
reading in passing — which is the failure mode this whole review has been
correcting. Q4 and Q5 change behaviour but not structure, so they could in
principle be answered during planning; I would still rather have them settled
first, and Q5 in particular may be better handled as a defect.

**No spec file was written. Stopping here.**
