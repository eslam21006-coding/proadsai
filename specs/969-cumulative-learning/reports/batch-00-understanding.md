# Batch 00 — Understanding

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-cumulative-learning`
**Date written**: 2026-09-05
**Status of report**: starting point. No code written yet.

This is the first deliverable the owner asked for: a plain-language
statement of what the feature does, what I propose to build first, and
anything in the specification I want to flag before writing code.

---

## 1. What the feature does, in plain language

Today, every time the system syncs an owner's ad account it **rebuilds**
the learning record from scratch: it looks at the ads it just fetched,
tallies which ones performed well, and overwrites the previous totals.
Nothing that was learned yesterday survives a sync today.

The owner explained the defect in their own words:

> "I don't want to be working on a low-ticket funnel and having an amazing
> learning experience, only to have everything reset once I switch to
> another funnel."

Three things cause the reset:

1. **The tally is replaced, not added to.** Yesterday's record is
   thrown away every sync, so a tally that took a week to grow resets
   in one rebuild.
2. **The yardstick the ad was judged against is forgotten.** Each ad is
   compared to a "cost target" (how much the owner is willing to pay per
   lead). If the target changes — from $50 to $30 — the same ad is
   re-judged and counted differently, even though its real performance
   didn't change.
3. **The same ad can be counted more than once.** If the ad shows up
   in three syncs, three judgments land against it, even though it
   should count once.

The fix has four parts:

- **Make learning cumulative**: every sync *adds* to the totals. The
  totals never shrink, even if a sync covers only part of the account,
  and even if the cost target changes.
- **Freeze the evaluation context**: the moment an ad is judged, the
  target it was judged against, the funnel type, and the timestamp are
  written onto the ad's record and locked there. They cannot be
  overwritten by a later settings change.
- **Make counting idempotent**: each ad carries a "ledger" entry that
  records exactly what it has already contributed. On every sync, the
  system compares "what should I contribute now?" against "what did I
  contribute last time?" — and either adds, does nothing, or
  withdraws-then-adds. An ad counted three times in three syncs now
  counts once.
- **Count the creative, not the ad row**: Meta assigns each placement
  of the same image its own row, so one image can show up as 55 rows.
  Grouping by image and merging where a link proves two groups are the
  same creative means one image counts as one piece of evidence, no
  matter how many placements it ran in.

A second feature rides on this: the **efficiency figure**, a single
number that compares actual cost per result to the target the ad was
running against. The figure is target-normalised, so a result that came
in at 60% of target on a $50 funnel and one at 60% of target on a $200
funnel are *literally the same number* — which is what makes learning
transfer between funnels.

Three things the owner has locked and the implementer must not
re-litigate:

- **No near-hash clustering** (perceptually grouping similar images).
  It is non-transitive — A is close to B, B is close to C, but A is not
  close to C — so it has no well-defined grouping and would merge
  genuinely different images.
- **No backfill, no migration.** There are no active users. The old
  records are retired, not converted.
- **Upward-only day revision.** A day's conversion count may be raised
  if Meta reports a higher number later; it may never be lowered. This
  keeps the never-decreases guarantee unconditional.

---

## 2. The "claims this feature will make false" — re-read

The spec has a section immediately before the Requirements titled
*"Note: Claims This Feature Will Make False By Design"*. It is a list
of statements about today's code that this feature is *supposed* to
invalidate. I have re-read it. The seven entries are:

| Claim, true today | Made false by | What changes |
|---|---|---|
| `learningAggregates.ts:17` states *"Same generationId in 2 ad sets → separate records per context"* | FR-073 | The header line is deleted; counting moves from ad row to creative. |
| The learning aggregators use **overwrite** semantics — the worker replaces the stored doc with the returned value | FR-015, FR-021 | The contract inverts to **delta** (atomic increments, not replacement). |
| The sync reads `adPerformance` with an **unbounded collection scan** (`shared.ts:831`) | FR-067, FR-068 | Replaced by a chunked by-ID read and **removed entirely** — not left alongside. |
| `status` is requested (`metaGraph.ts:83`) and typed (`:145`) but **never read and never persisted**; `AdDoc` has no status member | FR-085 | Persisted onto `AdDoc` (used for the "stopped running" eligibility check). |
| The per-day `actions` arrays from `last7DaysDaily` arrive every sync and are **never read** | FR-081 | Consumed for conversion accrual (no new Graph call). |
| **No per-account learning lease exists.** The only lease is `metaSyncLeases/{ownerUid}` (`lease.ts:52`), which is per **owner** | FR-054, FR-054a | A new per-account lease is added; `lease.ts` is **not** modified. |
| Ad rows carry no ledger, no sealed context and no per-day accrual | FR-016, FR-001, FR-081 | New fields added to `AdDoc`. |

These are the targets. If I finish and any of them are still true, the
feature is not delivered. I will check each one in the closing report.

The same section also records that 59 other `path:line` citations
across the spec were re-verified on 2026-09-05 and are confirmed
correct. I am working from a stable picture of the codebase.

---

## 3. Three traps I have been warned about

The user-facing input (and the spec's three locked decisions) each
flag a place where a reasonable implementer gets it wrong. I have
written them down so I cannot infer around them.

### 3.1 The lease is new, per account, and goes inside `runSyncForAccount`

Phase 970 already has a lease at `functions/src/metaSync/lease.ts`. It
looks like it covers this case but it does not. It is keyed **per
owner** (`metaSyncLeases/{ownerUid}`), and it does not reach
`worker.ts:19`/`:61`, where the Cloud Tasks worker calls
`runSyncForAccount` directly without going through
`runFullSyncWithLease`. So the Cloud Tasks fan-out and the 03:00
scheduled cycle reach the learning write unleased.

FR-054a requires a **new** lease, in a **new collection**, keyed on
`(ownerUid, accountId)`, acquired inside `runSyncForAccount`. The
existing `lease.ts` is **not** modified. T010 forbids me from
modifying it and forbids a lease call in `orchestrator.ts`. The
discriminating test (SC-017, SC-043) fails if I reuse the existing one.

### 3.2 Commit ordering under FR-060a

The natural code path is: acquire lease, do work, write. The spec says
the order must be: commit operational status writes, **then** attempt
the lease, **then** signal failure on a missed acquisition. This is
because signalling failure does **not** roll back a committed write.
The retry re-applies the operational writes harmlessly (FR-055 already
establishes them as idempotent per-ad overwrites), and the learning
write gets another attempt. The reverse order would mean a contended
account's ads silently stop getting fresh operational status while
every retry re-fetches the whole account.

### 3.3 Re-attribution and merge are different operations (FR-087)

When an ad's creative attribution changes (it gets re-linked to a
different generation), the efficiency figure **moves across unchanged**
— same rows, same sealed target, same number. When two hash groups
that are actually one creative are merged, the figure is **recomputed
over the union** against the earliest surviving sealed target.

Treating them as one operation will get one of them wrong, and a
single aggregate total cannot tell you which. SC-048 is written to
catch it: the fixture has the two halves carrying materially different
figures and different sealed targets, so neither carrying-forward nor
averaging can pass.

---

## 4. What I propose as Batch 1

**Phase 1: Setup (T001–T004)** in `tasks.md`. Four tasks, all small:

| Task | Description | Why in Batch 1 |
|---|---|---|
| T001 | Create `functions/src/learning/` directory with an index barrel re-exporting the six modules named in plan.md | The feature gets its own module rather than growing `metaSync/shared.ts` (which is already 1326 lines per plan.md §Project Structure). |
| T002 | Define shared feature types in `functions/src/learning/types.ts` — `LinkProvenance`, `CreativeGroup`, `ContributionLedgerEntry`, `DayAccrual`, `AcquireResult` (per data-model.md §1–§7) | The six downstream modules (Phase 2 and beyond) all import from this file. Building types first means every later test can import them. |
| T003 | Add a `test:phase969` script and register it in the `test` chain in `functions/package.json` | The runner is **not** a `for each test do ... end` loop — every test file must be named in `package.json`. FR-050 and the project rule (the test rule that has bitten this project twice) require this. T003 establishes the registration target before any tests are written. |
| T004 | Add fixture builders for constructed cases in `functions/src/__tests__/__fixtures__/learning.fixtures.ts` — linked, propagated, merged and hashless rows | The spec's FR-074b and FR-074c are unreachable in production data (5 linked rows total; zero generations spanning two hashes). T004 ensures the fixtures exist before the Phase 2 test files reference them. |

**Why Phase 1, not Phase 2.** Phase 2 (T005–T016) is the decision-laden
work: creative grouping, the new lease inside `runSyncForAccount`,
bounded reads. Building the lease *before* the test harness is wired
would mean I cannot prove the lease call site is correct without
shipping untested scaffolding. Phase 1 builds the harness first; Phase
2 lands on it.

**Why not Phase 1 + Phase 2 together.** The user-facing input says
*one phase per batch, then stop*. Phase 2 alone is 12 tasks with three
independent test files. It deserves its own report and its own
approval gate.

---

## 5. What Phase 2 will look like (preview, not Batch 1)

For the owner's awareness — Phase 2, which I will propose as Batch 2
after Batch 1 is approved, has three tracks:

1. **Creative grouping** (T005–T008): the pure function
   `groupIntoCreatives` per `contracts/creativeGrouping.md`. Replaces
   the rule "same generationId → separate records" with "group by
   imageHash, propagate link within a group, merge on shared
   generationId".
2. **Learning-write lease** (T009–T013): the new
   `acquireLearningLease` / `releaseLearningLease` / `stillHeld`
   primitives per `contracts/learningLease.md`. Wired inside
   `runSyncForAccount` (not orchestrator.ts, not the existing
   `lease.ts`). The three independently-testable properties: SC-017
   (only one writer for two concurrent runs of the same account),
   SC-017a (two accounts of one owner both proceed), SC-049 (lease
   acquired after operational writes commit, not before).
3. **Bounded reads** (T014–T016): replace the unbounded
   `adPerformance` collection scan at `shared.ts:831` with a chunked
   by-ID read of the current batch, chunks of 300, every chunk
   completing before any write. SC-022, SC-023, SC-024, SC-025.

T009–T012 (lease) must precede any delta accumulation. Under today's
overwrite semantics two concurrent writers are harmless; under delta
accumulation they add the same conversions twice. Building the lease
first means that double-count can never be introduced.

---

## 6. Items in the specification I find unclear or worth flagging

These are not blockers. They are places where I read the spec twice and
want the owner's confirmation before committing.

### 6.1 Test orchestration for SC-017 (two routes, one account)

SC-017 says "two contending runs MUST arrive by DIFFERENT ROUTES: one
inline through `runFullSync`, one through the Cloud Tasks worker
(`worker.ts:19`, `:61`)." The unit test cannot drive both worker.ts
and the inline path concurrently in a CI environment. My plan is:

- Have the test call `runSyncForAccount` twice in parallel — once with
  `trigger: "manual"` and once with `trigger: "scheduled"` — from the
  same Node process. Both call paths converge on `runSyncForAccount`,
  and the lease is acquired there.
- The discriminating property is *where the lease is acquired* — inside
  `runSyncForAccount`, not in `runFullSyncWithLease` at the
  orchestrator level. If the lease were in the orchestrator wrapper, the
  second concurrent `runSyncForAccount` (with a synthetic `manual`
  trigger) would still acquire it independently, and the test would
  pass for the wrong reason.

I will verify this discrimination during Phase 2 (T013). Flagging now
because the spec's intent is clear (catch a lease placed in the wrong
place) but the test mechanics need a deliberate choice.

### 6.2 Lazy DB handle usage (T066)

FR-053 requires the lazy database-handle pattern: no `getDb()` call at
module load. The existing code follows this pattern (I confirmed by
grep). I will follow it in every new module. There is no automated
guard for this; T066 is a review task. Flagging because it's easy to
slip a module-level `getDb()` in for tests and forget to remove it.

### 6.3 FR-083 post-implementation verification (T068)

T068 records a verification step in `quickstart.md`: once per-day
figures are being stored, compare a day's recorded value across
successive syncs while it remains in the window, and report whether
Meta revises downward. This is **not** a test; it is a deployment
follow-up. I will record it as T068 instructs and produce no automated
test for it (none is possible — it requires real production data over
real time).

### 6.4 The Arabic string (T056) — owner review

T056 is in Phase 6 (US4) and the spec explicitly says **wait for
owner review** before shipping it. I will surface the proposed English
and Arabic and stop. SC-010 passing is not enough: SC-010 confirms the
string exists in both languages, but only a Gulf coach can judge
whether the Fusha reads naturally. Flagging now because I want to
confirm this gating survives contact with the build pipeline (it must
block, not just slow).

### 6.5 T064a — explicit guard against modifying `qararEngine.ts`

This task did not appear in earlier drafts of `tasks.md` and is
introduced explicitly here. The verdict engine computes correctly; the
defect is at the write site. I will run `git diff --stat main --
functions/src/qararEngine.ts` as the last check of Phase 7 and report
an empty diff.

### 6.6 The phrase "creative metadata unavailable" in FR-051c

The skip reason "creative metadata unavailable" implies the
generation's metadata was looked up and not found. In current code
`metadataAvailable: false` covers this case (the sync writes that flag
when a generation has no angle/pattern/etc.). I will use the same
flag rather than introduce a new check. Flagging because the
enumeration in FR-051c names the reason but does not tie it to the
existing flag; I am tying them and want the owner to know.

### 6.7 The data-model.md §5 description of the contribution-state machine

The model says the row carries `contributionState: "PROVISIONAL" |
"SEALED"`, FR-005a makes the state machine one-way (PROVISIONAL →
SEALED), and FR-005e separates "sealed with figure not yet
contributed" from "sealed with figure explicitly absent". These are
three different things stored on the row. I will need to be careful
about which fields encode which — data-model.md §1 gives a column per
field (`contributionState`, `efficiencyRaw`, `ledger.efficiencyContributed`)
and I will follow that mapping exactly. Flagging because it is the
area most likely to be implemented inconsistently across the eight
files that touch the ad row.

---

## 7. What I have NOT done yet

Per the owner's instructions, this is a starting point and **no code
has been written this turn**. Specifically:

- No source files modified.
- No new files created.
- No test scripts registered in `package.json` yet.
- No build, no test, no commit, no push.
- The git working tree is at the branch HEAD (clean against `main`).

I will stop here and wait for the owner's response before Batch 1.

---

## 8. Open question for the owner

The plan documents and spec are detailed enough that I do not need a
clarification call. There is one operational question I would like an
answer to:

> For the Batch 1 fixture file (T004): should I put it under
> `functions/src/__tests__/__fixtures__/learning.fixtures.ts` (matching
> the existing `savedProjects.fixtures.ts` precedent) or somewhere
> else?

My default is the existing precedent. I will proceed with that unless
the owner says otherwise. It does not block Batch 1.
