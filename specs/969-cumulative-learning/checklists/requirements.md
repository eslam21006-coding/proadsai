<!-- specs/969-cumulative-learning/checklists/requirements.md — Checklist for the cumulative-learning feature specification (Phase 969). -->
# Specification Quality Checklist: Cumulative Learning for Ad Performance

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [ ] **Requirements are testable and unambiguous** — ❌ **FAILS as of Iteration 5.** Three requirements now carry **deliberate, stated limitations that are undetectable by construction**, so they are unambiguous but **not testable**: FR-074b's unlinked split (two hash groups that are one creative stay two, and *nothing in this feature detects it*), FR-074e's hashless propagated row (attribution *frozen and unverifiable* — no direct match can ever appear for it), and FR-051e's governed-metric-name constraint (*stated but not enforced*, because the automated guard does not walk the backend tree). Each is a known, accepted gap rather than an oversight, and each is recorded in the spec as such — but a passing tick here would claim test coverage that cannot exist. Marked failing so the gap is visible to planning rather than absorbed.
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified — *note*: the edge-case list predates both amendments and does not yet enumerate the creative-level cases (a partially-linked hash group, a hashless propagated row, a split creative's divided conversions, a day revised downward). The requirements that introduce them state their own edge behaviour inline (FR-074b, FR-074e, FR-077a, FR-083), so nothing is unhandled; but the consolidated list is now incomplete relative to the requirements, and is carried into planning as a documentation gap rather than a specification one.
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation Notes

### Iteration 1 — issues found and corrected

1. **Jargon leaked into requirements.** Early drafts named the measures directly (CTR, CPM, CPA, cpa3d, evaluatedTarget, evaluatedRatio, funnelType, angleKey, patternKey). Corrected: requirements now say "click-through", "cost-per-thousand", "realised cost per result", "sealed target", "efficiency figure", "angle", "visual pattern". Field-level naming is deferred to planning. The one place implementation vocabulary survives deliberately is the Context section, which quotes the investigation's findings — that section is background, not requirement text.

2. **Two decisions the prompt asked to be justified were initially asserted without reasoning.** Corrected: FR-003 (the efficiency formula, with the bounded alternative explicitly considered and rejected), FR-034 (the activation threshold, with an explicit statement of the semantic change from per-sync to all-time), and FR-038 (the aggregate bound, tied to the verdict engine's existing worst-case ceiling) each now carry an inline justification.

3. **The freezing requirement was ambiguous between two different things.** An early draft read as though the ad's day-to-day status should also freeze, which would break the owner's action list. Corrected: FR-008 through FR-012 now split the operational status (stays live against current economics) from the sealed learning result (immune to settings changes), and US2 scenarios 1 and 2 test both halves against each other.

4. **"Material change" was underdefined.** The prompt required a precise definition. Corrected: FR-011 enumerates exactly two triggers — the ad's own measured performance changed, or its creative attribution changed — and FR-010 states that a settings change is never one. FR-012 adds the load-bearing detail that re-evaluation still uses the sealed target, not the current one.

5. **Idempotency was stated as a goal rather than a mechanism.** Corrected: FR-016 and FR-017 specify the contribution ledger and the three-way add / no-op / withdraw-then-add comparison, which is what makes SC-002 and SC-008 verifiable rather than aspirational.

6. **The delete-cascade invariant conflicted with the withdrawal rule.** A general "withdraw when the contribution changes" reading would have withdrawn contributions when metadata was lost on generation delete, contradicting the existing system invariant that already-learned signal stands. Corrected: FR-014 carves this out explicitly, the edge-case list names it, and the Assumptions section records that the existing invariant takes precedence.

7. **Retirement of prior records was implied but not required.** Without it, new accumulation would merge onto retired counts. Corrected: section G (FR-042 through FR-046) specifies versioning, treat-as-absent reads, and full replacement on first write.

### Iteration 2 — verification

All checklist items pass. No [NEEDS CLARIFICATION] markers remain; every gap the prompt left open was decided in the spec with a stated justification, as the prompt directed.

### Iteration 3 — owner amendment to FR-034 (post-approval)

The owner approved the spec with one amendment: FR-034 restated the threshold's meaning without re-justifying it, and "10 distinct ads ever" is reached on far thinner evidence than "10 matched conversion ads in a single sync". Value unchanged; justification rewritten.

Changes made:

1. **FR-034 now states the two properties that were genuinely lost** — the concurrency bar (ten ads that never ran together now clear a gate that once required ten running at once) and an implicit recency guarantee (the old per-sync window incidentally ensured the evidence was current; all-time counting removes that entirely and nothing detects staleness).
2. **FR-034 is marked PROVISIONAL** rather than justified as still-correct, with a named review trigger and the three specific findings that would justify raising it, adding a recency qualifier, or splitting it into separate account-level and per-funnel gates.
3. **A factual error in the prior justification is corrected in place.** It claimed downstream ranking retains independent minimum-evidence gates. That holds for the "avoid" list (3 ads per angle) but not for the top-performer list, which admits any angle with a single qualifying ad. Weakening the account gate without closing that would let a one-ad angle become the top recommendation.
4. **FR-034a added** — a per-item floor of 3 contributing ads before an angle or pattern can be recommended, matching the existing "avoid" floor so both directions of the recommendation rest on the same evidentiary base. **SC-014** added to verify it.
5. **Assumptions updated** to record that the threshold is provisional and must not be treated by planning as a fixed contract.

### Iteration 4 — clarification session 2026-09-02

Four questions asked and integrated; see the `## Clarifications` section of the spec for the recorded answers. Summary of what changed:

1. **Provisional/sealed state machine** (FR-005 through FR-005d, FR-011c, FR-036a/b). Closed a hole where any ad evaluated before funnel settings were complete would be permanently barred from efficiency learning. One-way transition, enforced in the write path rather than by convention. Sealing uses the target at the moment of sealing, with the backdating imprecision stated explicitly as accepted and the reason it cannot be avoided (no settings history is retained).
2. **Learning lease** (section J, FR-054 through FR-065). Verified in code that concurrent and duplicate syncs are a live condition — no lock exists, manual and scheduled paths can overlap, and the task queue retries. Lease scoped to the learning write only, 15-minute expiry derived from the platform's 540-second execution ceiling, atomic acquire and release via single-document transaction, divergent behaviour for manual (fail fast) versus scheduled (signal for retry), and a pre-commit fencing check with its residual window acknowledged rather than papered over.
3. **Ledger durability and bounded reads** (section K, FR-066 through FR-072). Ad documents may never be pruned, with the reason recorded at the write site. The unbounded collection scan is removed entirely and replaced by a chunked by-ID read. A failed chunk read aborts rather than reading as "no prior contribution" — the failure mode that would silently reintroduce double-counting. Three non-learning consumers of that read were identified in code and brought explicitly into scope.
4. **Layered auditability** (FR-051 through FR-051e). Resolved a contradiction between the original FR-051 and the sync path's standing one-line-per-account convention. Two event types initially classified as rare were found not to be — seal transitions fire in bulk, and refresh withdrawals are the modal case for every active ad on every sync — and were reclassified as counts.

**Resolved by decision rather than by question**: how unknown funnel type interacts with retrieval weighting (FR-032). Only one reading is consistent with FR-030 and FR-031 — no boost, never excluded — so it did not warrant the remaining question.

### Iteration 5 — owner amendments 1 and 2, and four correction rounds (post-approval)

Two amendments were agreed after the spec was approved, and each went through review rounds that found defects in the amendment work itself. Both amendments change things the spec previously stated positively, so this is a revision throughout, not an append.

**Amendment 1 — the unit of learning is the creative, not the Meta ad row.**

1. **New section B2 (FR-073 – FR-076, FR-074a–g).** The creative is the unit of evidence; the ad row remains the *storage location* of the ledger. Production fan-out: 383 rows → 52 creatives (7.37:1) on `act_995888422231015`, largest creative 55 rows; 1008 rows → 146 creatives (6.90:1) across both accounts. `metaAdId` cannot be the key — assigned from `ad.ad_id` at `orchestrator.ts:455` (relocated from `index.ts:3931` by Phase 970), and **absent, not null**, on 0 of 1008 rows and 0 of 58 deployment records.
2. **The contradiction being overturned is named**: `learningAggregates.ts:17`, *"Same generationId in 2 ad sets → separate records per context"* — untouched by Phase 970 and still live.
3. **The fallback split is closed, not merely recorded.** Group by `imageHash`; any generation link in a group resolves the whole group; manual beats automatic (FR-074a, the precedence already at `shared.ts:864-869`). The naive `generationId`-then-`imageHash` fallback would split one creative permanently, because manual linking targets a single document (`linkUnmatchedAd.ts:121-125`) and the lock never heals.
4. **Constants keep 10 / 3 / 3 and change unit to creatives** (FR-034, FR-034a, FR-037). Justification records both halves: ~7× harder, activation at ~74 ad rows, accepted deliberately; and that row counting let a single 55-row creative clear all three gates alone — the exact thin-evidence failure FR-034a was added in Iteration 3 to prevent, meaning that floor never closed the hole it was written for. FR-034 keeps its PROVISIONAL marking with the review trigger restated.
5. **Four defects found in the amendment on review and fixed**: cross-group merge (FR-074b — perceptual matching is distance-based, so one creative can produce several hashes); a linked row with no hash (FR-074c); FR-011–FR-014 wrongly grouped with FR-008–FR-010 as operational status, when they govern the sealed result (FR-011 scoped per trigger, FR-012a added, FR-013 re-based, FR-014 scoped); and a creative-level state asserted with no derivation rule (FR-036c, any-row).
6. **Two further gaps found in the fix**: FR-074b's merge requires a link and most rows have none, so unlinked splits persist undetected — stated as a limitation and cross-referenced from FR-034's review trigger; and the propagated link is both **derived** (the grouping) and **persisted** (the link), with FR-074e requiring a third provenance origin so a written-back link cannot inherit the lock's authority.
7. **Provenance is stored in a separate field, not a new `matchType` value** (FR-074f), decided on evidence: `matchType` is branched on at `getTopWinners.ts:79`/`:185`, `learningAggregates.ts:120`, and `whatsWorkingDashboard.ts:412`/`:569`/`:719` — more readers than FR-072 has ever named, and `:719` builds the owner-facing "needs linking" list by filtering `matchType === null`, so a new enum value would silently drop propagated rows from it. FR-072a and FR-072b record the per-behaviour verdict and the tally treatment.
8. **Eligibility becomes per creative** (FR-074g): any-row for eligibility, all-rows for aggregation. The cascade check confirmed no creative is half-cascaded — and surfaced that this holds *only because* FR-074d persists the link, making FR-074d load-bearing for FR-014.

**Amendment 2 — a creative contributes to efficiency learning exactly once.**

9. **New section B3 (FR-077 – FR-086).** Eligible at 5 combined conversions across all placements, or stopped running with ≥1; zero never contributes; usage and click-through unaffected; written once, never revised; withdraw-then-add survives only for attribution changes.
10. **FR-011(a) narrowed, not deleted** — it still governs the target-independent measures, because it is also what keeps click-through and cost-per-thousand current under FR-017 while FR-024 widens them to all time. Deleting it would have frozen them at first contribution.
11. **Both eligibility conditions are AVAILABLE, not blocked**, contrary to the initial reading. Condition (a) accrues per day from `last7DaysDaily` (`metaGraph.ts:389-396`, `time_increment: 1`), which shares `INSIGHTS_FIELDS` and is currently received and discarded — no new Graph call. Condition (b) uses `status`, already requested (`metaGraph.ts:83`) and typed (`:145`) but never persisted. The three-day window is a **single aggregated row**, not a per-day series (`shared.ts:294`), and the spec says so to stop the `.reduce()` misreading being repeated.
12. **Day accrual rules**: a day stays revisable while inside the window and is finalised on exit (FR-083), which removes the design's dependency on the repo's own unverified *"last_7d excludes today"* assertion and absorbs late attribution. Revision is **upward-only** — a lower re-observation is a no-op — because a plain overwrite would breach FR-020's never-decreases guarantee. The accepted cost is recorded: an over-counted day stays over-counted permanently, the only over-count route among four known inaccuracies. Deduplication key is **(ad row id, date)** (FR-084).
13. **FR-002a decides aggregate-then-divide**, forbidding divide-then-average, which would give a one-result placement the same weight as a fifty-result one — the fluke domination FR-038 already bounds one level up. Coupled to FR-012a's single sealed target, which supplies the denominator.
14. **Four collisions resolved**: FR-005e separates sealing a target from contributing a figure and explains why no third state was added; FR-005c gains an explicit carve-out with the boundary drawn and a warning that the guard must test the transition rather than the SEALED flag; FR-051d's refresh-withdrawal row is rewritten; and the stacked-gate consequence is recorded on FR-037 — 5 × 3 = **15 conversions per angle** — with neither value changed.
15. **FR-077a records the split-conversion effect**: one cause (FR-074b's undetectable split) produces two errors in opposite directions — inflated usage counts and suppressed efficiency contribution — which do not cancel.

**Lease placement, corrected against Phase 970.**

16. **FR-054a–d.** The lease belongs **inside `runSyncForAccount`**, around the learning write. Phase 970's `runFullSyncWithLease` covers only the manual inline route; `metaSyncAccountWorker` imports `runSyncForAccount` directly (`worker.ts:19`, `:61`) with no lease, so the fan-out and the whole 03:00 cycle reach the learning write unleased. The threat model is concrete: no task names at either enqueue site so no platform dedup, a queue-wide dispatch cap, and three independent routes to a same-account pair. LEG A is recorded as verified safe.
17. **FR-059 corrected twice.** Its cooldown-based self-clearing argument is **struck as false** — Phase 970 Batch 4 removed the 1-hour cooldown — and its Phase 970 clarification, which claimed the two leases share `metaSyncLeases/{ownerUid}` and are one artifact selecting a TTL by call site, is **struck as contradicting FR-054b**: a per-owner key cannot serialise per account. The remaining ceiling-based TTL argument is recorded as **calibrated against the wrong window**, since FR-055 scopes the lease to a fraction of a sync; the value is retained for want of better data and because an over-long TTL fails safe.
18. **Stale Assumption corrected**: the 1-hour manual cooldown no longer exists, so manual-versus-manual contention is no longer rare.

**Success criteria.** SC-008, SC-014 and SC-016 re-based to creatives; SC-017 amended to require the two contending runs arrive by **different routes** and to fail if the lease sits at the orchestrator level; SC-017a, SC-029, SC-029a–c and SC-030 – SC-047 added, covering every requirement introduced by both amendments.

**Checklist re-run.** *Requirements are testable and unambiguous* is now marked **failing**, and *Edge cases are identified* carries a note. See the top of this file.

### Carried into planning

- **An existing dashboard test file is present in the test directory but absent from the runner manifest** — the exact failure mode FR-050 guards against, on a surface this feature modifies. Registration is in scope.
- **PRIMARY RISK — concurrency (FR-023) against the batched-commit path (Assumptions).** The accumulation design must be expressible as per-record deltas inside the existing batched commit, not as read-modify-write loops outside it. Owner direction: if it turns out delta accumulation *cannot* be expressed within the existing merge-semantics batch without read-modify-write loops outside it, planning must **say so plainly rather than working around it**. That is the finding that would force a redesign, and surfacing it early is cheaper than discovering it in implementation.
- **Retrieval weighting strength is left as a tuning parameter.** The contract is ordering and non-exclusion (FR-030, FR-031, SC-005, SC-006); the weight itself is a planning choice.
- **PRIMARY RISK (Amendment 2) — the lease will be inferred wrongly.** Phase 970 already has a lease that *looks* like it covers the learning write and does not reach `worker.ts`. FR-054a, FR-054b and SC-043 exist specifically to stop that inference. Planning MUST state where the lease is placed and MUST NOT reuse `metaSyncLeases/{ownerUid}`.
- **Three stated limitations are accepted, undetectable, and must not be re-solved in planning**: FR-074b's unlinked split, FR-074e's hashless propagated row, and FR-051e's unenforced governed-metric guard. Each is recorded with its direction of error. Near-hash clustering was considered for the first and **deliberately rejected** as non-transitive; planning should not reintroduce it without treating it as a new design decision.
- **FR-065's owner-facing message is inconsistent with FR-059's TTL** — *"try again in a few minutes"* against a 15-minute worst case. The strings were deliberately not rewritten during the amendment work; resolving this needs an owner decision on the wording, in both English and simple Fusha Arabic.
- **The edge-case list is incomplete relative to the amended requirements** (see the checklist note). Consolidating it is a documentation task for planning, not a specification gap — the behaviours are all stated inline.
