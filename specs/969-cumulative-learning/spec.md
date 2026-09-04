# Feature Specification: Cumulative Learning for Ad Performance

**Feature Branch**: `969-cumulative-learning`
**Created**: 2026-09-02
**Status**: Draft
**Input**: User description: "Build cumulative learning for the ad performance system. The learning aggregates do not accumulate — each sync rebuilds an angle's aggregate entirely from that sync's ads and overwrites the stored record. Changing funnel settings rewrites verdicts and shrinks the counts; a partial sync silently shrinks the signal. Persist the evaluation context, freeze the per-ad verdict at write time, make aggregates truly cumulative and idempotent, record funnel type for weighting (never exclusion), and update the retrieval and dashboard readers. No epoch partitioning. No backfill or migration."

**Source of truth for current state**: `docs/investigations/learning-cumulative-investigation.md` (every finding verified against code with file:line evidence).

---

## Context: What Is Broken

The account owner stated the requirement verbatim:

> "I don't want to be working on a low-ticket funnel and having an amazing learning experience, only to have everything reset once I switch to another funnel. It should be accumulative. When something works in a specific funnel, we should use that learning in different funnels."

Three defects produce the reset the owner experiences:

1. **The aggregate is rebuilt, not accumulated.** Each sync computes an angle's record entirely from that sync's ads and replaces the stored record. Nothing merges with history (investigation §3.2).
2. **The evaluation context is discarded.** The cost target an ad was judged against is loaded once per sync, used to produce a win/lose mark, and then dropped. Nothing records what the ad was measured against, so no past result can be compared to a present one (investigation §2.2).
3. **The same ad is counted again on every sync it appears in.** There is no record of what an ad has already contributed, so contribution is neither idempotent nor retractable (investigation §3.5).

The consequence is that an ad judged a winner under a $50 target becomes a non-winner under a $30 target on the very next sync, and the angle's winner count falls — even though nothing about the ad's actual performance changed. A sync that covers only part of the account has the same effect on the angles it happened to touch.

## Context: Decisions Already Locked

These are settled and are not re-opened by this specification:

- **No epoch partitioning.** Partitioning learning by epoch and resetting on funnel-type change is rejected. It destroys the accumulated value the owner is asking to preserve.
- **No backfill, no migration.** There are no active users. Existing aggregate records carry frozen counts whose original target is unrecoverable. They are **retired**, not converted. Learning starts clean.
- **Click-through and cost-per-thousand behaviour is preserved.** Those measures are target-independent and already span funnel types. Their meaning, units, and funnel-blindness do not change.
- **The verdict engine is not in scope.** It computes correctly. The defect is at the write site, not the compute site.

---

## Clarifications

### Session 2026-09-02

- Q: An ad evaluated before funnel economics are resolvable seals with no target, and FR-011's two material-change triggers do not include settings completion — so it can never gain an efficiency figure. How should this be handled? → A: Option A — provisional until sealable. The contribution is marked PROVISIONAL and contributes usage and click-through immediately; the first evaluation at which a target is resolvable seals it. The transition is one-way and MUST be enforced in code, not by convention: no path — settings change, re-sync, manual refresh, or economics version bump — may return a SEALED ad to PROVISIONAL. Sealing uses the target resolvable **at the moment of sealing**, not backdated to when the ad ran; this is a known and accepted imprecision. While PROVISIONAL, the ad's click-through contribution **does** count toward the guidance activation threshold, because that threshold gates click-through-driven guidance and click-through is target-independent; the efficiency figure retains its own separate evidence gate.
- Q: How do concurrent and duplicate syncs resolve, given the ledger's read-compare-write is not atomic and Cloud Tasks retries can redeliver an identical payload? → A: Option A — serialize per account with a lease, subject to five conditions. The lease MUST expire on its own after **15 minutes** (derived from the platform's 540-second execution ceiling, not estimated). It MUST cover **only the learning write**, not the whole sync, since concurrent Meta fetches are harmless and only the check-then-act is racy. Acquisition and release MUST be atomic via a **transaction over a single lease document**, and release MUST verify holder identity. The **manual** path fails fast with a bilingual message; the **scheduled** path MUST NOT fail silently and instead signals failure so the existing task retry configuration re-dispatches it. A run MUST re-verify it still holds the lease immediately before committing and abort if it does not; the residual window between check and commit is acknowledged explicitly rather than papered over.
- Q: The contribution ledger lives on the ad document and is now load-bearing for correctness, but the sync reads that collection with an unbounded scan that grows with account age. How is ledger durability reconciled with that read? → A: Option A — permanent ledger, bounded read. Ad documents MUST never be pruned, with the reason recorded at the write site so a future retention policy hits it before the code is written. The unbounded scan MUST be **removed entirely**, not left alongside the new read, and replaced by a by-ID read over exactly the current batch — chunked at **300** (a value-list query caps at 30, too small; a multi-document fetch has no documented count cap, so the chunk is policy), with every chunk completing before any write. A failed chunk read MUST abort the learning write for that chunk rather than read as "no prior contribution", since conflating the two produces the double-count FR-018 forbids; this needs its own test. Reads MUST return whole documents, not projections, or cascade-written fields are lost. Three non-learning behaviours share this read — the match-link precedence lock, the delete-cascade preservation flag, and the match tallies — and are explicitly in scope; all three are per-ad lookups for ads already in the batch, so the bounded read is behaviour-identical for each.
- Q: FR-051 required an audit record "sufficient to explain why any count is what it is", which read literally means per-ad logging — contradicting the sync path's standing convention of one line per account, written specifically to prevent log spam. How is auditability structured? → A: Option A — layered. The **ledger is the per-ad audit trail**; logs must not duplicate what it already stores durably. Logs emit one summary line per account per sync, with skips **broken down by enumerated reason** rather than a single bucket. Individual event lines are permitted only for events that cannot fire in bulk. Two events initially classified as rare are not: **seal transitions** are bimodal (zero in steady state, then the entire provisional backlog at once when settings complete), and **refresh withdrawals are the modal case** — a live ad's rolling metrics move nearly every sync, making withdraw-then-add the common path for every active ad rather than an exception. Both are counts. Only re-attribution withdrawals, lease acquisition failures, lease-lost-mid-write, and ledger chunk read failures get individual lines. Log content is restricted to identifiers, state names, reason codes, and counts — no owner-facing strings, no governed metric names, no percentages — following the funnel-settings observability precedent. The automated guard for governed metric names does not walk the backend tree, so this is **stated but not enforced**, and that gap is recorded deliberately.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Learning Never Resets (Priority: P1)

The owner has been running a low-ticket funnel for weeks. The system has watched dozens of ads and built up a picture of which hook angles and which visual patterns earn results. The owner then changes the funnel's economics, or runs a shorter manual refresh that only covers part of the account. When the owner next looks at what the system has learned, **the accumulated picture is still there, unchanged and undiminished**. Nothing that was learned has been forgotten, and nothing has been counted twice.

**Why this priority**: This is the owner's stated requirement and the load-bearing defect. Without it, every other improvement is written onto a record that erases itself. It is also the minimum viable slice: cumulative, idempotent, shrink-proof accumulation delivers the owner's core ask even before any new measure is added.

**Independent Test**: Run the same sync payload repeatedly and confirm the stored learning record after the tenth run is identical to the record after the first. Then run a sync covering a strict subset of the previous ads and confirm every stored record — including those for angles the partial sync did not touch — is unchanged or larger, never smaller.

**Acceptance Scenarios**:

1. **Given** an account whose learning record shows an angle used 12 times with 5 successes, **When** a sync runs that returns those same 12 ads with unchanged performance data, **Then** the record still shows 12 uses and 5 successes — not 24 and 10, and not 12 and 5 recomputed from scratch.
2. **Given** an account with learning recorded across four hook angles, **When** a partial refresh returns ads belonging to only one of those angles, **Then** the records for the other three angles are byte-for-byte unchanged and the touched angle's counts do not decrease.
3. **Given** an account with an established learning record, **When** the owner changes the funnel's cost target and the next sync runs, **Then** no angle's usage count and no angle's success count decreases.
4. **Given** an ad that has already contributed to an angle's record, **When** that ad appears in twenty subsequent syncs with unchanged performance data, **Then** it is counted exactly once across all twenty.

---

### User Story 2 - A Result, Once Earned, Stays Earned (Priority: P2)

An ad performed well against the economics that were in force when it ran. Later the owner changes those economics — a different price point, a different offer, a different funnel entirely. The ad's place in the learning record still reflects how it actually did **at the time it ran, against the target it was actually running against**. Changing today's settings does not retroactively rewrite yesterday's result. At the same time, the owner's day-to-day action list still reflects today's economics, because an ad that is too expensive under the new target is still too expensive today.

**Why this priority**: This is what makes accumulation *meaningful* rather than merely *stable*. Without a recorded evaluation context, an accumulated count is a pile of results measured against unknown and mutually incomparable yardsticks. It is P2 rather than P1 because P1 already stops the visible loss; P2 makes what survives trustworthy.

**Independent Test**: Record an ad's learning result under one cost target, change the target, re-run the sync, and confirm the ad's stored learning result and its stored evaluation context are unchanged — while confirming the same ad's day-to-day status line has moved to reflect the new target.

**Acceptance Scenarios**:

1. **Given** an ad whose learning result was sealed against a $50 target, **When** the owner lowers the target to $30 and a sync runs, **Then** the ad's sealed learning result, its sealed target, and its sealed efficiency figure are all unchanged.
2. **Given** that same ad and that same target change, **When** the owner opens the day-to-day view, **Then** the ad's current status reflects the new $30 target, because the current status is an action list, not a history.
3. **Given** an ad that is still running and gathering new data, **When** a sync brings genuinely new performance data for it, **Then** its learning result is re-evaluated — but against the target sealed on its first evaluation, never against a newer target — and the angle's totals are adjusted so the ad is still represented exactly once.
4. **Given** an ad running under a funnel whose economics cannot be resolved, **When** the sync evaluates it, **Then** its contribution is recorded as provisional — it contributes to usage and click-through learning but not to efficiency learning, and no target is recorded.
5. **Given** that provisional ad, **When** the owner completes the funnel settings weeks later and a sync runs, **Then** the ad seals against the target resolvable at that moment, gains an efficiency figure, and the account's distinct-ad count does not increase — the ad was already counted.
6. **Given** an ad whose contribution is already sealed, **When** any path attempts to re-evaluate it against a different resolvable target — a settings change, a manual refresh, or an economics version bump — **Then** the write path refuses the change and the original sealed target survives.

---

### User Story 3 - Winners Transfer Between Funnels (Priority: P3)

The owner proves a hook angle on a low-ticket funnel. Months later the owner launches a high-ticket funnel with completely different economics. The system does not start from zero: it still knows that angle works, it says so, and it says so more confidently when it has also seen the angle succeed in a funnel like the new one. It never withholds a proven winner just because the winner was proven somewhere else.

**Why this priority**: This is the second half of the owner's sentence — "when something works in a specific funnel, we should use that learning in different funnels." It depends on P2 having sealed a comparable efficiency figure, which is why it follows.

**Independent Test**: Build a learning record where an angle has strong evidence from one funnel type and no evidence at all from a second. Request guidance for the second funnel type and confirm the angle is still offered, and confirm that a second angle with equally strong evidence *from the requested funnel type* is ranked ahead of it.

**Acceptance Scenarios**:

1. **Given** an angle with strong evidence recorded entirely under one funnel type, **When** guidance is requested for a different funnel type, **Then** the angle is still eligible to appear among the recommended angles.
2. **Given** two angles with comparable overall evidence, one proven under the requested funnel type and one proven only elsewhere, **When** guidance is requested, **Then** the same-funnel angle ranks higher.
3. **Given** an angle proven only under a different funnel type, **When** guidance is requested, **Then** the angle is never filtered out, suppressed, or zeroed on the grounds of funnel type alone.
4. **Given** an ad whose funnel type cannot be determined, **When** it contributes to learning, **Then** it still contributes to the angle's overall totals and is recorded under an explicit unknown bucket, not silently attributed to a real funnel type.

---

### User Story 4 - The Owner Sees the All-Time Truth (Priority: P4)

The owner opens the "What's Working" view. The counts shown are all-time counts across every funnel the owner has ever run — not "what happened in the last refresh". The angles the system recommends when generating new creative are drawn from that same all-time record. Every number and label the owner reads is in plain language, in both English and simple Fusha Arabic, with no advertising jargon and no raw measurement values.

**Why this priority**: The reading surfaces are additive changes over the new record shape. They are last because the record must exist and be correct before it can be displayed, but the feature is not delivered until the owner can actually see the accumulated learning.

**Independent Test**: Populate a learning record spanning several funnel types and multiple syncs, then confirm both the dashboard view and the creative-guidance path report figures consistent with the all-time record, in both languages, with no jargon.

**Acceptance Scenarios**:

1. **Given** an angle with all-time usage across three separate syncs, **When** the owner opens the "What's Working" view, **Then** the usage and success counts shown are the all-time totals.
2. **Given** an account that has crossed the threshold at which the system begins steering creative generation with learned guidance, **When** a later partial sync runs, **Then** the guidance stays switched on — it can never switch back off because a refresh was incomplete.
3. **Given** an angle whose evidence spans more than one funnel type, **When** the owner views it, **Then** a plain-language line indicates the angle has worked in more than one of the owner's funnels, in the owner's language.
4. **Given** any newly introduced owner-visible text, **When** it is displayed in either supported language, **Then** it contains no advertising jargon and no raw measurement values.

---

### Edge Cases

- **An ad has no conversions.** No efficiency figure can be computed. The ad still contributes usage, click-through, and cost-per-thousand learning, and still contributes its win/lose mark if the engine produced one. It contributes nothing to the efficiency measure.
- **The funnel's economics cannot be resolved** (settings absent, incomplete, or not stamped with the current economics version). The contribution is recorded as PROVISIONAL — usage, click-through, and cost-per-thousand evidence count normally, no target or efficiency figure is recorded, and the ad must never be sealed against a placeholder or infinite target.
- **A provisional ad becomes sealable weeks later.** The owner completes funnel settings after several syncs have already run. Every PROVISIONAL ad still present seals on the next evaluation, against the target resolvable at that moment (FR-005d). Its usage and click-through evidence was already counted and must not be counted a second time.
- **A sealed ad is presented with a different resolvable target.** It keeps its original sealed target, sealed efficiency figure, and sealed funnel type. The write path must refuse the change rather than rely on callers not attempting it.
- **An economics version bump changes how targets are derived.** Sealed ads are unaffected — a version bump is a settings change, and FR-005c names it explicitly as a path that may not re-open a sealed contribution.
- **A single fluke conversion produces an absurd cost figure** — one conversion on high spend can yield an efficiency figure tens of times worse than target. The raw figure is preserved on the ad's own record for audit; the value folded into the angle's average is bounded so one such ad cannot dominate the angle.
- **An ad is linked to a generation for the first time after it already contributed.** Its angle and visual pattern change. Its previous contribution must be withdrawn from the old angle before the new one is added, so the ad is still represented exactly once overall.
- **A generation is deleted after its ad already contributed.** The existing system invariant is that already-learned signal stands and aggregates are not recomputed on delete. That invariant is preserved: deletion does not withdraw a contribution already made; it only prevents further contributions.
- **Two syncs for the same account overlap.** The second run cannot acquire the learning lease. A manual run tells the owner a refresh is already in progress; a scheduled run signals failure so the task infrastructure retries it with backoff. Neither writes learning concurrently with the other.
- **A sync crashes or is killed by the platform while holding the lease.** The lease expires on its own 15 minutes after acquisition. No manual intervention, no permanently locked account.
- **A lease is force-expired and taken over while its original holder is still running.** The original holder detects on its pre-commit re-verification that it no longer holds the lease and aborts its learning write entirely, leaving existing records untouched. It does not write alongside its replacement.
- **A run's lease expired and was taken over, and the run then finishes and tries to release.** Release verifies holder identity, so the stale run cannot release its successor's lease.
- **A scheduled run exhausts its retries against a persistently held lease.** Treated as deduplication rather than loss: another run was writing that account's learning throughout. The next scheduled cycle restores full coverage, and FR-020 guarantees the run that won cannot have shrunk anything.
- **A ledger read fails for part of the batch.** The learning write for those ads is abandoned and their existing contributions stand. They are never treated as uncontributed, because a read failure is missing information rather than evidence of absence.
- **The batch contains more ads than a single by-ID read can carry.** The read is chunked, and every chunk completes before any write is issued, so a partially-read ledger cannot produce a partially-applied set of contribution decisions.
- **Someone later adds a retention policy to ad performance documents.** Forbidden, with the reason recorded at the write site itself, because deleting an ad document erases its ledger entry and silently re-enables double-counting for that ad.
- **A learning record predating this feature is encountered.** It is treated as absent — it contributes zero to every reader and is replaced in full on first write, never incremented onto.
- **Meta stops returning an ad.** Its existing contribution stands. Absence is not evidence of failure and must never reduce a count.
- **An angle is seen for the very first time.** Accumulation onto a non-existent record must produce the same result as accumulation onto an empty one.

---

## Requirements *(mandatory)*

### A. Sealed Evaluation Context (per ad)

- **FR-001**: The system MUST record, on each ad's performance record, the cost target that was in force at the moment the ad's learning result was determined.
- **FR-002**: The system MUST record, on each ad's performance record, an **efficiency figure** expressing the ad's realised cost per result relative to that same sealed target.
- **FR-003**: The efficiency figure MUST be defined as **realised cost per result divided by the sealed target**, stored raw and unbounded. A value of 1.0 means the ad landed exactly on target; 0.6 means it came in 40% under target; values above 1.0 mean it exceeded target. Lower is better.
  - *Justification*: this formula is lossless, directly interpretable in the owner's own framing ("an ad at 0.6× its own target"), and target-normalised — so 0.6 on a $12 lead funnel and 0.6 on a $200 product funnel are literally the same number, which is the cross-funnel comparability this feature exists to create. The bounded alternative `min(cost, target) / target` was considered and rejected: it caps at 1.0 and therefore erases the entire distinction between "hit target" and "beat target threefold", which is precisely the winner signal the owner wants to carry between funnels.
- **FR-004**: The system MUST record, on each ad's performance record, the funnel type in force when its learning result was sealed, or an explicit unknown marker when it cannot be determined.
- **FR-005**: When the cost target cannot be resolved, the system MUST NOT seal a placeholder, a zero, or an unbounded stand-in for it. Instead, the ad's contribution is marked **PROVISIONAL** per FR-005a. An unresolvable target is an unfinished evaluation, not a sealed decision.
- **FR-005a**: Every learning contribution MUST carry exactly one of two states:
  - **PROVISIONAL** — no cost target was resolvable at evaluation time. The ad contributes usage, click-through, and cost-per-thousand evidence normally, and contributes its win/lose mark if the engine produced one. It carries no sealed target and no efficiency figure.
  - **SEALED** — a cost target was resolvable and has been recorded, together with the efficiency figure and funnel type derived from it.
- **FR-005b**: The transition PROVISIONAL → SEALED MUST occur at the first evaluation at which a cost target is resolvable.
- **FR-005c**: The transition MUST be **one-way, and enforced in code rather than by convention**. Once a contribution is SEALED, no code path may return it to PROVISIONAL or alter its sealed target — not a funnel settings change, not a re-sync, not a manual refresh, not an economics version bump. The enforcement MUST be a guard in the write path, not a comment or a caller-side discipline.
- **FR-005d**: Sealing MUST use the target resolvable **at the moment of sealing**, not the target that was in force when the ad ran.
  - *Known and accepted imprecision*: an ad first seen in week 1 with no settings, and sealed in week 3 when settings are completed, seals against week 3's target even though its spend was incurred in week 1. This is deliberate. The alternative — reconstructing week 1's target — is **impossible**, because no settings history is retained (investigation §2.3 established that only the current settings document exists). The trade is that an approximate efficiency figure beats no efficiency figure, and the approximation is bounded to the window between an ad's first appearance and the completion of funnel settings, which is a one-time setup gap rather than an ongoing condition.
- **FR-006**: When the ad has no results in the measurement window, the system MUST record the efficiency figure as explicitly absent while still sealing the target if one was resolvable. Such a contribution is SEALED, not PROVISIONAL: the target was known, the ad simply produced nothing to measure against it.
- **FR-007**: The state, the sealed context, and the learning result MUST be written in the same operation, so an ad can never carry a result without the context and state that produced it.

### B. Freezing and Re-evaluation

- **FR-008**: The system MUST distinguish two separate things carried on an ad's record: the **operational status** the owner acts on today, and the **sealed learning result** the accumulated record counts.
- **FR-009**: The operational status MUST continue to be recomputed on every sync against the current economics, unchanged from present behaviour. It is an action list, and it must stay current.
- **FR-010**: The sealed learning result and its sealed context MUST NOT be rewritten because the funnel's economics changed. A change to settings alone is **never** a material change.
- **FR-011**: The system MUST re-evaluate an ad's sealed learning result when, and only when, one of the following material changes occurs:
  - **(a) The ad's own measured performance changed** — the measurement inputs the result was derived from differ from those recorded with the sealed result. A still-running ad continues to refine its own record as real data arrives.
  - **(b) The ad's creative attribution changed** — the ad became linked to a generation, or its link changed, altering which angle or which visual pattern it belongs to.
  - **(c) A PROVISIONAL contribution became sealable** — a cost target is resolvable for the first time (FR-005b). This is not an exception to FR-010: there is no sealed context here to protect, only an unfinished one to complete. It can occur at most once per ad, and FR-005c forbids the reverse.
- **FR-012**: On re-evaluation under FR-011(a), the system MUST evaluate against the **sealed** target, never the current one. The sealed target is fixed at the moment an ad's contribution is sealed and never changes for the life of that ad. A SEALED ad presented with a different resolvable target MUST retain its original sealed target — this is a required test, not merely an intended behaviour.
- **FR-013**: On re-evaluation under FR-011(b), the system MUST withdraw the ad's previous contribution from the angle and visual pattern it was previously attributed to before adding its new contribution, so the ad remains represented exactly once in total.
- **FR-014**: Loss of creative metadata (the delete cascade) MUST NOT withdraw a contribution already made. It MUST only prevent the ad from contributing further. This preserves the existing invariant that already-learned signal stands.

### C. Cumulative, Idempotent Accumulation

- **FR-015**: Angle and visual-pattern records MUST accumulate across the entire history of the account. A stored record MUST represent all-time evidence, not the most recent sync's evidence.
- **FR-016**: The system MUST maintain, for every ad, a durable record of exactly what that ad has already contributed to the learning aggregates — the angle, the visual pattern, the bucket, and every measured value folded in.
- **FR-017**: On each sync, for each eligible ad, the system MUST compare the contribution the ad *should* make against the contribution it has *already made*, and act as follows:
  - No prior contribution → **add**.
  - Prior contribution identical to the desired one → **no-op**. Nothing is written and no count moves. This is the idempotency guarantee.
  - Prior contribution differs (material change per FR-011) → **withdraw the prior contribution, then add the new one**.
- **FR-018**: Processing the same sync payload any number of times MUST leave the stored learning records in exactly the state produced by processing it once. No ad may ever be counted twice.
- **FR-019**: The system MUST NOT write to an angle's or pattern's record when that angle or pattern received no change in this sync. An untouched record is left untouched.
- **FR-020**: A sync covering a subset of the account's ads MUST NOT decrease any stored count, average, or total. Absence of an ad from a sync is not evidence and carries no weight.
- **FR-021**: Records MUST store the raw sums and counts from which averages are derived, so that a contribution can be added or withdrawn exactly, without recomputing from history and without accumulating rounding drift across repeated operations.
- **FR-022**: Records MUST also carry the derived averages under their existing names and units, so existing readers continue to work without change.
- **FR-023**: Accumulation MUST be safe under concurrent syncs for the same account: two writers touching the same record must not lose or duplicate a contribution. The mechanism is specified in section J.

### D. Preserved Measures

- **FR-024**: Click-through and cost-per-thousand measures MUST retain their current names, units, meaning, and funnel-blindness. The only change permitted is that their accumulation window widens from "the last sync" to "all time" — which is the correction this feature exists to make, not a restructuring of the measure.
- **FR-025**: The existing partitions — objective bucket, geographic tier, and audience type — MUST be preserved unchanged in name and meaning.
- **FR-026**: The verdict engine MUST NOT be modified. All changes occur at the write site and the read sites.

### E. Funnel Type: Weighting, Never Exclusion

- **FR-027**: Angle and visual-pattern records MUST carry a per-funnel-type breakdown of their evidence, including an explicit bucket for unknown.
- **FR-028**: Funnel type MUST NOT be part of a record's identity. One angle has exactly one record spanning every funnel type the owner has ever run.
- **FR-029**: A record's headline totals MUST remain the all-funnel totals, so any reader that ignores the funnel-type breakdown sees the complete cross-funnel evidence.
- **FR-030**: Retrieval MUST use funnel type only to **weight** results toward same-funnel evidence. It MUST NOT use funnel type to filter, exclude, suppress, or zero any angle or pattern.
- **FR-031**: An angle with strong evidence and zero same-funnel evidence MUST remain eligible for recommendation and MUST remain capable of ranking among the top recommendations.
- **FR-032**: Evidence recorded under the **unknown** funnel bucket MUST receive no same-funnel weighting boost for any requested funnel type, and MUST NOT be treated as matching the requested type. It MUST still count toward the record's headline totals and MUST NOT be excluded from retrieval — unknown provenance is weaker evidence, never disqualifying evidence. This is the only reading consistent with FR-030 and FR-031.
- **FR-032a**: The efficiency figure MUST be usable as a cross-funnel comparison basis: because it is target-normalised, evidence gathered under one funnel's economics is directly comparable to evidence gathered under another's.

### F. Reading Surfaces

- **FR-033**: The creative-guidance retrieval path MUST read the new record shape. The change is additive: existing selection behaviour based on click-through against the account average is retained.
- **FR-034**: The sample-size threshold that activates learned guidance MUST be retained at **10**. Its meaning changes, and the change MUST be recorded as a **provisional** decision pending real usage data — not asserted as still-correct.

  **What 10 used to represent.** Under the replaced semantics, the threshold counted matched, result-driving ads present in a *single* sync. Because a sync reflects the account's currently-returned ads, meeting it required roughly ten such ads to exist *concurrently*. That is a substantial bar: it implied an account of real size, actively running, right now.

  **What 10 represents under this feature.** Ten **distinct ads across all time**, in any combination of funnels, in any combination of time periods. An owner launching two qualifying ads a week reaches it in about five weeks. Spread evenly across four funnel types, it is two or three ads per funnel.

  **Two properties are genuinely lost, and neither is recovered by this feature:**
  1. **The concurrency bar is gone.** Ten ads that never ran at the same time now clear a gate that previously required ten running together.
  2. **An implicit recency property is gone.** The old per-sync window incidentally guaranteed the evidence was *current*. All-time counting removes that guarantee entirely. Ten ads accumulated over six months may reflect creative approaches, audiences, and market conditions that no longer hold, and nothing in the threshold detects this.

  **Why the value is not being changed now.** Raising it would be a guess. There is no usage data to calibrate against, there is one user, and a higher bar delays the feature's value for that user with no evidence that it buys better signal. Lowering it is plainly unsafe. Ten is retained as the incumbent value, carried forward deliberately rather than by default.

  **This is therefore marked PROVISIONAL.** It MUST be revisited once the first account has accumulated real cumulative evidence. The review MUST examine: whether guidance activated before the evidence was worth acting on; whether the evidence at activation was concentrated in a single funnel type or a single stale time period; and whether accounts that activated early produced worse creative than accounts that activated later. Any of those findings justifies raising the threshold, adding a recency qualifier, or splitting the single threshold into separate account-level and per-funnel gates. **No structural change is required to act on that finding** — the threshold is a named constant.

  **Correction to the prior draft.** An earlier version of this requirement justified the value partly by claiming the downstream ranking rules retain their own independent minimum-evidence gates. That is true of the "avoid" list, which requires at least 3 ads per angle, but it is **not** true of the top-performer list, which today admits any angle with at least one qualifying ad. Weakening the account-level gate without noticing that gap would allow a single-ad angle to become the top recommendation. FR-034a closes it.

- **FR-034a**: An angle or visual pattern MUST NOT appear among the recommended top performers until it carries at least **3** contributing ads of its own. This per-item floor is required because the account-level threshold in FR-034 is materially weaker than the one it replaces; the account gate alone no longer guarantees that any individual recommendation rests on more than one observation. The value matches the existing minimum used by the "avoid" list, so both directions of the recommendation now rest on the same evidentiary floor.
- **FR-035**: Once the activation threshold has been met for an account, a subsequent partial or failed sync MUST NOT switch learned guidance back off.
- **FR-036**: The sample size used for the activation decision MUST count **distinct ads**. An ad must not be able to inflate the count by being observed in more than one sync.
- **FR-036a**: PROVISIONAL contributions MUST count toward the activation threshold and toward the per-item floor in FR-034a.
  - *Justification*: a threshold should count the ads that carry the measure it gates. Everything the activation threshold controls — the recommended angles, the avoid list, the caption guidance — is driven by click-through, and click-through is target-independent, which is exactly the property that makes it accumulate across funnels in the first place. A PROVISIONAL ad carries complete, valid click-through evidence; only its efficiency figure is missing. Excluding it would withhold guidance from an owner with real evidence purely because a settings document was incomplete, which converts a setup problem into an evidence problem. The efficiency figure retains its own independent gate under FR-037, counted only over ads carrying a sealed figure. Two measures, two gates, each counting the ads that actually carry it.
- **FR-036b**: When a PROVISIONAL contribution seals, it MUST NOT increment the distinct-ad count again. The ad was already counted; sealing changes what it carries, not whether it exists.
- **FR-037**: The efficiency figure MUST NOT influence ranking for an angle or pattern until that angle or pattern has at least **3** ads carrying a sealed efficiency figure, consistent with the existing minimum-evidence gate used elsewhere in retrieval.
- **FR-038**: The value folded into an angle's or pattern's average efficiency MUST be bounded at **3.0**, while the raw unbounded figure is retained on the ad's own record.
  - *Justification*: the verdict engine already treats 2.5× target as its worst-case ceiling; beyond 3× an ad is unambiguously a loser and further magnitude carries no additional decision value, only leverage over the average. Bounding at the aggregate rather than at the source keeps the ad-level record honest and auditable.
- **FR-039**: The "What's Working" dashboard MUST read the new record shape. Its existing tier icons, which are derived from click-through against the account average, MUST continue to work.
- **FR-040**: The counts the dashboard presents MUST be the all-time totals.
- **FR-041**: The dashboard MUST show a plain-language indication when an angle's or pattern's evidence spans more than one of the owner's funnels.

### G. Retirement of Prior Records (no migration)

- **FR-042**: Learning records MUST carry a schema version.
- **FR-043**: Readers MUST treat any learning record below the current schema version as **absent** — contributing zero, not partially counted, not mixed with new evidence.
- **FR-044**: The first write to a record below the current schema version MUST **replace the record in full**, so that no stale field from the retired shape can survive alongside the new one. It MUST NOT be an increment onto the old record.
- **FR-045**: No prior count, average, or total may be carried forward into the new shape. Learning starts clean.
- **FR-046**: An ad performance record with no recorded contribution is treated as never having contributed, and will make its first contribution on the next sync that includes it.

### H. Owner-Facing Language

- **FR-047**: Every owner-visible string introduced or changed by this feature MUST ship in both English and simple Fusha Arabic. No dialect.
- **FR-048**: Owner-visible strings MUST NOT contain advertising jargon — no click-through rate, no cost-per-acquisition, no cost-per-lead, no cost-per-thousand — and MUST NOT expose raw measurement values or percentages.
- **FR-049**: The efficiency figure is an internal measure. It MUST NOT be shown to the owner as a number, a ratio, or a percentage. It may only influence ordering, wording, and tier icons.

### I. Verification and Auditability

- **FR-050**: Every test file added by this feature MUST be registered by path in the runner manifest. A test that compiles and reviews cleanly but is never executed provides no protection.
  - *Note*: an existing dashboard test file is present in the test directory but absent from the runner manifest. Since this feature modifies that surface, its registration is in scope.
- **FR-051**: Auditability MUST be **layered**, with the ledger as the record of truth and logs carrying only what the ledger cannot answer at a glance.
- **FR-051a**: The **contribution ledger is the per-ad audit trail**. Any question of the form "why is this count what it is" MUST be answerable by reading the ledger entries of the ads in that bucket. Logs MUST NOT duplicate per-ad detail that the ledger already stores durably and queryably.
- **FR-051b**: Logs MUST emit **one summary line per account per sync**, consistent with the existing convention in the sync path (*"One line per account (NOT per ad) — keeps this from becoming log spam across a large sync"*). The line MUST carry counts for: additions, unchanged no-ops, refresh withdrawals, re-attribution withdrawals, seal transitions, and skips.
- **FR-051c**: The skip count MUST be **broken down by enumerated reason**, never reported as a single bucket. A bare total answers nothing; the reason is the question anyone is actually asking. The reasons are: no creative link, creative metadata unavailable, no resolvable angle, no resolvable visual pattern, and learning write aborted.
- **FR-051d**: Individual event lines are permitted **only for events that cannot fire in bulk**. Each event type's expected volume MUST be respected as follows:

  | Event | Expected volume | Treatment |
  |---|---|---|
  | Addition | Every eligible ad on first contribution; the entire account on first sync | **Count only** |
  | Unchanged no-op | The modal outcome for dormant ads, every sync | **Count only** |
  | Refresh withdrawal (performance change) | **The modal outcome for every active ad, every sync** — a live ad's rolling metrics move almost daily, so withdraw-then-add is the common path, not an exception | **Count only** |
  | Seal transition | **Bimodal**: zero in steady state, because an ad seals directly on first evaluation when settings are complete and never passes through the provisional state. Then the **entire provisional backlog at once** the moment settings are completed | **Count only** |
  | Re-attribution withdrawal | Genuinely rare — requires a manual linking action | Individual line |
  | Lease acquisition failure | Rare; at most one per run | Individual line |
  | Lease lost mid-write | Near-zero; unreachable under normal operation per FR-063 | Individual line |
  | Ledger chunk read failure | Rare; bounded by chunk count per sync, and reported per chunk with the number of ads affected, never per ad | Individual line |

- **FR-051e**: Log content MUST contain **no owner-facing strings and no governed metric names** — no click-through rate, cost per acquisition, cost per lead, or cost per thousand, in full or abbreviated form, and no percentage values. Permitted content is identifiers, state names, reason codes, and counts only. This follows the precedent already set by the funnel-settings observability line, which emits workspace and account identifiers, the funnel type, and the names of missing fields, and nothing measured.
  - *Known enforcement gap*: the automated guard that blocks governed metric names in owner-facing copy does not walk the backend source tree, so this constraint is **stated but not enforced**. It must be upheld in review. This gap is recorded here deliberately rather than left implicit.
- **FR-052**: A learning-accumulation failure MUST NOT break the sync. On failure, existing records are left untouched and the failure is recorded, consistent with current behaviour.
- **FR-053**: All data access introduced by this feature MUST use the project's lazy database-handle pattern. No handle may be acquired at module load time.

### J. Serialized Learning Writes

- **FR-054**: Learning accumulation for a single ad account MUST be serialized by a **lease**. Only one run may perform the ledger's read-compare-write and the resulting aggregate deltas for a given account at a time.
- **FR-055**: The lease MUST cover **only the learning write** — the ledger comparison, the contribution decisions, and the aggregate delta writes. It MUST NOT cover the whole sync.
  - *Rationale*: two runs fetching Meta data, computing metrics, and writing operational status concurrently is harmless — those writes are idempotent overwrites of per-ad facts. Only the check-then-act on the ledger is racy. Scoping the lease to the learning write keeps the held window to a small fraction of a sync, which proportionally shrinks every failure mode the lease itself introduces.
- **FR-056**: Acquisition MUST be **atomic**. The primitive is a **database transaction over a single lease document**, which reads the current lease and writes a new one only if the document is absent or its expiry has passed. Transactional isolation on the read document is what makes two simultaneous acquisitions mutually exclusive; a plain read followed by a write reintroduces the exact race the lease exists to eliminate and MUST NOT be used.
- **FR-057**: The lease MUST carry a unique **holder identity** for the run that acquired it, and an absolute **expiry timestamp**.
- **FR-058**: Release MUST also be atomic and MUST verify holder identity — a run may only release a lease it still holds. A run whose lease already expired and was taken over MUST NOT be able to release its successor's lease.
- **FR-059**: The lease MUST **expire on its own** with a time-to-live of **15 minutes**.
  - *Justification*: both sync entry points are capped by the platform at 540 seconds (9 minutes), after which the runtime terminates the process — no sync can exceed this, so 15 minutes sits roughly 6 minutes above a ceiling that cannot be crossed. That headroom absorbs clock skew and leaves room for a process killed mid-run to hold a stale lease briefly without ever blocking a legitimate successor for a meaningful period. The scheduled cycle is 24 hours and the manual path carries a 1-hour cooldown, so even a worst-case stranded lease self-clears long before the next legitimate attempt. A lease with no expiry is forbidden outright: a crash or platform timeout would lock that account's learning permanently, recoverable only by manual intervention.
  - **Phase 970 (bug 2026-09-03) clarification**: the **learning-write lease** referenced in FR-059 is distinct from Phase 970 Batch 4's **in-flight sync guard** (`functions/src/metaSync/lease.ts`). They share the lease document shape (`metaSyncLeases/{ownerUid}`) but not the TTL. The learning-write lease uses 15 min per FR-059; the in-flight sync guard uses 10 min. The 10-min TTL is shorter than the platform ceiling (540 s) plus slack, because the guard's job is to suppress concurrent presses, not to make a crashed press visible days later. The two are merged into a single implementation artifact today (the guard IS the lease, and the lease is the guard), with the implementation reading the call site to determine which timeout to apply; a future implementation may split them into two collections with the same shape and two different TTLs.
- **FR-060**: A run that cannot acquire the lease MUST behave differently depending on how it was triggered:
  - **Manual** — fail fast and tell the owner, in their language, that a refresh is already running and to try again shortly. The owner is present and can retry; a hanging call is worse than a clear answer.
  - **Scheduled** — MUST NOT fail silently and MUST NOT skip. It MUST signal failure in the way the existing task infrastructure already understands, so the run is retried with backoff rather than dropped. The existing retry configuration (3 attempts, 30s to 600s backoff) is sufficient and needs no change.
- **FR-061**: If a scheduled run exhausts its retries because the lease was held throughout, that is **not** a loss of learning and MUST NOT be treated as one. Contention means another run was writing that account's learning at the time. The dropped run is deduplication, not data loss. The one case worth noting is a full scheduled run losing to a narrower manual one; FR-020 guarantees the narrower run cannot shrink anything, and the next scheduled cycle restores full coverage.
- **FR-062**: A run MUST re-verify that it still holds the lease — matching holder identity and unexpired — **immediately before committing** its learning writes, and MUST abort the learning write entirely if it does not. A run whose lease was force-expired and taken over MUST NOT continue writing alongside its replacement.
- **FR-063**: The residual window between that final check and the commit MUST be acknowledged rather than papered over: the check narrows the window, it does not eliminate it, because the commit itself cannot be made conditional on the lease. This is accepted because FR-059's time-to-live exceeds the platform's own execution ceiling, which makes takeover-while-running unreachable under normal operation; the check exists for the pathological case, not the expected one.
- **FR-064**: Aborting a learning write under FR-062 MUST leave existing records untouched and MUST NOT fail the surrounding sync, consistent with FR-052. The abort MUST be recorded as an auditable event.
- **FR-065**: The "already refreshing" message MUST ship in English and simple Fusha Arabic, free of technical terms, per FR-047 and FR-048:
  - English: "Your ad data is already being refreshed. Please try again in a few minutes."
  - Arabic: "يتم الآن تحديث بيانات إعلاناتك. حاول مرة أخرى بعد بضع دقائق."

### K. Ledger Durability and Bounded Reads

- **FR-066**: Ad performance documents MUST NOT be pruned, aged out, or deleted by any retention policy. The reason MUST be stated in the document itself, at the collection's write site, so that anyone later adding a retention policy encounters it before writing the code rather than after: **the contribution ledger lives on the ad document and is authoritative for correctness — deleting an ad document silently re-enables double-counting**, because the ad then reads as never having contributed and is added again the next time it appears.
- **FR-067**: The ledger and the other prior-state fields MUST be read **by document ID, for exactly the ads in the current batch**, never by scanning the collection. Correctness MUST NOT depend on an unbounded scan completing.
- **FR-068**: The existing unbounded collection read MUST be **removed entirely**, not left in place beside the new one. Two paths reading the same data is how the removed one survives a refactor and quietly becomes authoritative again.
- **FR-069**: By-ID reads MUST be chunked, and **every chunk MUST complete before any write is issued**, so a partially-read ledger can never produce a partially-applied contribution decision.
  - *Cap and chunk size*: a value-list query (`in` on document ID) is capped at **30** values per query, which is too small to be practical here. A direct multi-document fetch has **no documented per-call document-count cap** — it is bounded by request and response size and by the call deadline — so the chunk size is a policy choice rather than an API limit. It MUST be set to **300**, which is conservative against response size, clears any realistic per-sync ad count in a small number of chunks, and is consistent in spirit with the write path's existing 450-operation chunking.
- **FR-070**: A failed chunk read — timeout, quota exhaustion, or any transient error — MUST NOT be treated as "these ads have no prior contribution". It MUST **abort the learning write for that chunk**, leaving those ads' existing contributions untouched.
  - *Rationale*: an empty result and a genuinely absent contribution are indistinguishable at the call site, and conflating them re-adds every ad in the chunk, producing precisely the double-count FR-018 forbids. A read failure is missing information, never evidence of absence. This MUST be covered by a test that forces a read failure and asserts no contribution was added.
- **FR-071**: By-ID reads MUST return **whole documents**, not projections. Fields written by the delete cascade (`deletedGenerationId` and the cascade's `metadataAvailable` mark) live outside the strict shape the sync writes, and a projection would silently break the cascade-preservation behaviour.
- **FR-072**: Three existing behaviours besides learning read this prior state and are therefore **explicitly in scope** for the read-pattern change. All three are per-ad lookups for ads already in the current batch, so the bounded read is behaviour-identical for each, and each MUST be verified as unchanged:
  - the match-link precedence lock, where a prior manual or automatic link locks the ad's attribution;
  - the delete-cascade preservation flag, which stops the sync from undoing a cascade mark;
  - the matched / ambiguous / unmatched tallies, which derive from the locked attribution values.

---

### Key Entities

- **Ad Performance Record** — one per ad. Already carries measured performance, creative attribution, and an operational status. Gains: the **sealed target**, the **sealed efficiency figure**, the **sealed funnel type**, the **sealed learning result**, and the **contribution ledger entry** describing exactly what this ad has folded into the aggregates.
- **Contribution Ledger Entry** — carried on the ad's own record, not in a separate store, so it is loaded by the reads the sync already performs. Describes the angle, the visual pattern, the bucket, and every value contributed, plus the measurement inputs that produced it. This entry is the sole mechanism of idempotency: comparing desired against recorded is what makes a repeated sync a no-op.
- **Hook Angle Record** — one per canonical angle, spanning all funnel types. All-time sums, counts, derived averages, win and loss totals, efficiency totals, and a per-funnel-type breakdown. Identity is the angle alone; funnel type is a dimension inside it, never part of its identity.
- **Visual Pattern Record** — one per visual pattern key, with the same structure and the same identity rule.
- **Sealed Evaluation Context** — the tuple of target, efficiency figure, funnel type, and the moment of sealing. Fixed when the contribution transitions to SEALED and thereafter immune to settings changes.
- **Contribution State** — a one-way state machine with exactly two states, PROVISIONAL and SEALED, carried on the contribution ledger entry. PROVISIONAL means no target was resolvable yet; SEALED means the evaluation context is fixed. Only the PROVISIONAL → SEALED direction is reachable, and that constraint is enforced in the write path rather than assumed of callers.
- **Funnel Settings** — the existing source of the cost target and funnel type. Read-only to this feature.
- **Learning Lease** — one short-lived record per ad account, held only for the duration of that account's learning write. Carries a holder identity and an absolute expiry. Acquired and released atomically; expires on its own. It guards the ledger's check-then-act, and nothing else.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After changing funnel economics and running a sync, **zero** angles and **zero** visual patterns show a decreased usage count or success count.
- **SC-002**: Processing an identical sync payload ten consecutive times produces learning records identical to processing it once — verified field by field, with **zero** drift in any count, sum, or average.
- **SC-003**: A sync covering a strict subset of the account's ads leaves **100%** of untouched records byte-for-byte identical, and decreases **zero** values on the touched ones.
- **SC-004**: For an ad whose learning result was sealed under one target, changing the target and re-syncing leaves its sealed result, sealed target, sealed efficiency figure, and sealed funnel type **100% unchanged**, while its day-to-day operational status reflects the new target.
- **SC-005**: An angle with evidence from one funnel type only is still eligible to be recommended for a different funnel type in **100%** of cases; funnel type causes **zero** exclusions.
- **SC-006**: Given two angles of comparable overall evidence, the one with same-funnel evidence ranks ahead of the one without, in **100%** of ranking comparisons.
- **SC-007**: Once an account has crossed the guidance activation threshold, **zero** subsequent syncs — partial, failed, or complete — switch guidance back off.
- **SC-008**: Every ad that has ever been eligible for learning is represented in the aggregates **exactly once**, verifiable by comparing the sum of aggregate usage counts against the count of distinct contributing ads.
- **SC-009**: The counts the owner sees in the "What's Working" view equal the all-time totals for **100%** of angles and patterns shown.
- **SC-010**: **100%** of owner-visible strings introduced by this feature exist in both English and simple Fusha Arabic, and **zero** of them contain advertising jargon, raw measurement values, or percentages.
- **SC-011**: **100%** of test files added by this feature are reachable by the project's standard test command, verified by confirming each new file's execution appears in a clean run.
- **SC-012**: A forced failure in the accumulation path leaves **100%** of existing learning records unchanged and does not fail the sync.
- **SC-013**: An account starting from zero reaches meaningful accumulated learning through ordinary use and never regresses: across a sequence of at least ten syncs including at least two partial ones and at least one settings change, total recorded evidence is **monotonically non-decreasing**.
- **SC-014**: **Zero** angles or visual patterns carrying fewer than 3 contributing ads appear among the recommended top performers, verified against an account that has crossed the activation threshold on the strength of many thin items rather than a few substantial ones.
- **SC-015**: A SEALED ad presented with a different resolvable target retains its original sealed target, sealed efficiency figure, and sealed funnel type in **100%** of attempts, across every path that could plausibly attempt it — settings change, re-sync, manual refresh, and economics version bump. Verified by a test that asserts the retained values, not by inspection.
- **SC-016**: An ad evaluated before funnel settings are complete contributes usage and click-through evidence immediately, and gains an efficiency figure on the first evaluation after settings are completed — while the account's distinct-ad count increases by exactly **one** across the whole sequence, not two.
- **SC-017**: Two runs attempting to write learning for the same account at the same time result in exactly **one** writer. Verified by driving two concurrent acquisitions and asserting one succeeds and one is refused — the outcome must hold across repeated trials, not merely on a single observed run.
- **SC-018**: A run that abandons its lease without releasing it blocks no subsequent run beyond the 15-minute expiry, verified by acquiring, abandoning, and re-acquiring after expiry with **zero** manual intervention.
- **SC-019**: A run whose lease has been taken over performs **zero** learning writes after the takeover, and leaves **100%** of existing records unchanged.
- **SC-020**: A scheduled run that cannot acquire the lease is retried by the task infrastructure rather than dropped, verified by confirming the run signals failure in the form the infrastructure acts on. **Zero** scheduled runs terminate successfully having silently skipped learning.
- **SC-021**: The "already refreshing" message is present in both English and simple Fusha Arabic and contains **zero** technical terms and **zero** raw measurement values.
- **SC-022**: A forced ledger-read failure results in **zero** contributions added for the affected ads and **zero** changes to their existing contributions — verified by a test that induces the failure, not by inspection.
- **SC-023**: The volume of prior-state data read per sync is a function of the current batch size only, and does **not** grow with account age. Verified by confirming the read count against a ledger containing far more ads than the batch.
- **SC-024**: **Zero** unbounded collection scans of ad performance data remain in the sync path after the change, verified by search rather than by review.
- **SC-025**: The match-link precedence lock, the delete-cascade preservation flag, and the matched / ambiguous / unmatched tallies produce **identical** results before and after the read-pattern change, including for an ad carrying cascade-written fields outside the sync's own document shape.
- **SC-026**: A sync of any size emits **exactly one** learning summary line per account, and the number of individual event lines does not scale with the number of ads. Verified by syncing an account whose entire provisional backlog seals at once and confirming that produces a count, not one line per ad.
- **SC-027**: The summary line's skip total is broken down by enumerated reason in **100%** of emissions; **zero** emissions report skips as an undifferentiated total.
- **SC-028**: **Zero** log lines emitted by this feature contain an owner-facing string, a governed metric name in full or abbreviated form, or a percentage value.

---

## Assumptions

- **No active users.** Existing aggregate and ad performance records may be retired without owner-visible loss, and no migration, backfill, or dual-read period is required.
- **Cost target resolution is unchanged.** The existing rule — paid funnels use the effective cost-per-acquisition target, free funnels the effective cost-per-lead target, and an unresolvable or unstamped economics payload yields no target — is consumed as-is, not modified.
- **The learning eligibility rules are unchanged.** Only ads with a confirmed creative link, available metadata, and a resolvable angle or pattern contribute. This feature changes how contributions are recorded, not which ads qualify.
- **The measurement window is unchanged.** The existing rolling window that feeds the verdict engine continues to define an ad's measured performance.
- **Funnel type comes from the account's funnel settings** at the moment of sealing. It is not inferred from the ad, the campaign, or the creative. When settings are absent or carry an unrecognised type, the funnel type is recorded as explicitly unknown.
- **The dashboard's tier icons continue to be derived from click-through against the account average.** The efficiency figure informs ordering and wording, not the icon tier, in this feature.
- **Concurrent and duplicate syncs are a live condition, not a hypothetical.** There is no per-account serialization today; a manual sync runs inline while scheduled syncs dispatch through a task queue, and that queue retries on failure, so an identical payload can be delivered more than once. The lease in section J exists for conditions the system already produces.
- **Both sync entry points are capped at 540 seconds by the platform.** The 15-minute lease time-to-live is derived from that ceiling rather than estimated from observed runtimes.
- **The existing task retry configuration is reused, not modified.** Three attempts with 30-to-600-second backoff already exists and is sufficient for lease contention.
- **The manual sync's existing 1-hour cooldown remains in force** and independently makes manual-versus-manual contention rare. The lease addresses manual-versus-scheduled and retry-driven duplicate delivery.
- **Writes continue to use the sync's existing batched-commit path**, so the accumulation design must be expressible as per-record deltas applied within that path rather than as read-modify-write loops outside it.
- **The existing invariant that aggregates are not recomputed on generation delete is retained** and takes precedence over any general "withdraw on change" reading of the contribution rules.
- **Retrieval weighting strength is a tuning parameter**, not a behavioural contract. The contract is that same-funnel evidence ranks ahead of equivalent cross-funnel evidence and that cross-funnel evidence is never excluded; the exact weight is chosen during planning and may be adjusted without respecifying.
- **Bound and threshold values** (efficiency bound 3.0, minimum efficiency evidence 3, per-item top-performer floor 3, activation threshold 10) are stated as requirements here because they carry justification, but they are expected to be expressed as named constants so they can be revisited without a structural change.
- **The activation threshold is provisional, not settled.** FR-034 retains the value 10 while recording that the evidence it now represents is materially weaker than the evidence it represented before. It is carried forward because there is no data to calibrate a better value against, and it is expected to be revisited against real usage. Planning should not treat it as a fixed contract.
