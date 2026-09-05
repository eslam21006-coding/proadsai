# Tasks: Cumulative Learning for Ad Performance

**Input**: Design documents from `/specs/969-cumulative-learning/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: **INCLUDED — the specification requires them.** FR-050 mandates that every
test file be registered by path in the runner manifest, and the spec carries 56
success criteria that are explicit test obligations. Several are written to
*discriminate* rather than observe (SC-030, SC-031, SC-039, SC-040, SC-045, SC-046,
SC-048), so their fixtures are specified, not incidental.

**Organization**: grouped by user story. Phases 1–2 are shared; each story phase is
an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1–US4, mapping to the spec's prioritised user stories

## Path Conventions

Backend service: `functions/src/…`, tests in `functions/src/__tests__/…`, compiled to
`functions/lib/…` before running. The frontend (`src/`) needs **no change** for this
feature.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: module scaffolding and the test-registration harness that FR-050 requires.

- [ ] T001 Create the feature module directory `functions/src/learning/` with an index barrel at `functions/src/learning/index.ts` re-exporting the six modules named in plan.md
- [ ] T002 [P] Define shared feature types (`LinkProvenance`, `CreativeGroup`, `ContributionLedgerEntry`, `DayAccrual`, `AcquireResult`) in `functions/src/learning/types.ts` per data-model.md §1–§7
- [ ] T003 [P] Add a `test:phase969` script and register it in the `test` chain in `functions/package.json`, so every file added below has a registration target from the start (FR-050)
- [ ] T004 [P] Add fixture builders for constructed cases in `functions/src/__tests__/__fixtures__/learning.fixtures.ts` — linked, propagated, merged and hashless rows. Production cannot supply these: only 5 of 1008 rows are linked and zero generations map to two hashes (quickstart.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the creative as the unit of evidence, the lease that protects every
write, and the bounded read. **No user story can be implemented before these land.**

**⚠️ CRITICAL**: T009–T013 (lease) come before any delta accumulation. Under today's
overwrite semantics two concurrent writers are harmless; under delta accumulation
they add the same conversions twice. Building the lease first means that double-count
can never be introduced.

### Creative grouping — the unit of evidence

- [ ] T005 Implement `groupIntoCreatives` in `functions/src/learning/creativeGrouping.ts` per `contracts/creativeGrouping.md`: group by `imageHash`, propagate the generation link within a group, manual beats automatic (FR-073, FR-074, FR-074a)
- [ ] T006 Add cross-group merge to `functions/src/learning/creativeGrouping.ts` — groups resolving to the same `generationId` become one creative (FR-074b). **Merge only on shared `generationId`; distance-based clustering of hashes is forbidden**
- [ ] T007 Add the two key-absence cases to `functions/src/learning/creativeGrouping.ts` — a row with a `generationId` and no `imageHash` joins that generation's creative and **contributes** (FR-074c); a row with neither key forms a **non-contributing** group (FR-075)
- [ ] T008 [P] Write grouping contract tests in `functions/src/__tests__/creativeGrouping.test.ts` covering SC-029, SC-029a, SC-029b, SC-046, plus idempotency and order-independence; register the file in `functions/package.json`

### Learning-write lease — per account, inside `runSyncForAccount`

- [ ] T009 Implement `acquireLearningLease` / `releaseLearningLease` / `stillHeld` in `functions/src/learning/learningLease.ts` per `contracts/learningLease.md` — **a NEW collection keyed on `(ownerUid, accountId)`**, single-document transaction, 15-minute TTL, release verifies holder identity (FR-054, FR-056–FR-059)
- [ ] T010 Wire the lease **inside `runSyncForAccount`** in `functions/src/metaSync/shared.ts`, around the learning write only (FR-054a, FR-055). **Do not modify `functions/src/metaSync/lease.ts`** and do not add a call in `functions/src/metaSync/orchestrator.ts`
- [ ] T011 Implement the mandatory ordering in `functions/src/metaSync/shared.ts` — commit the operational status writes, **then** attempt the lease, **then** signal failure (FR-060, FR-060a). The natural order is the reverse
- [ ] T012 Add the pre-commit fencing re-check and abort path in `functions/src/metaSync/shared.ts` — re-verify holding immediately before committing, abort the learning write without failing the sync, record the event (FR-062, FR-064, FR-052)
- [ ] T013 [P] Write lease tests in `functions/src/__tests__/learningLease.test.ts` covering SC-017 (**two different routes** — one inline, one via the Cloud Tasks worker), SC-017a (two accounts of one owner both proceed), SC-018, SC-019, SC-020 (a scheduled run signals for retry rather than being dropped), SC-043, SC-044 (**zero** conversions counted twice under the scheduled-versus-manual pairing), SC-049; register the file in `functions/package.json`

### Bounded prior-state read

- [ ] T014 Replace the unbounded `adPerformance` collection scan at `functions/src/metaSync/shared.ts:831` with a chunked by-ID read over exactly the current batch, chunk size **300**, every chunk completing before any write (FR-067, FR-069). The read MUST return **whole documents, never projections** (FR-071) — a `.select()` would silently drop the cascade-written `deletedGenerationId` and `metadataAvailable` fields, which live outside the strict shape the sync writes. **Remove the old read entirely** (FR-068)
- [ ] T015 Make a failed chunk read abort the learning write for that chunk rather than read as "no prior contribution" in `functions/src/metaSync/shared.ts` (FR-070) — conflating them produces the double-count FR-018 forbids
- [ ] T016 [P] Write bounded-read tests in `functions/src/__tests__/boundedLedgerRead.test.ts` covering SC-022, SC-023, SC-024, and SC-025 (the match-link precedence lock, the delete-cascade preservation flag, and the matched/ambiguous/unmatched tallies **identical** before and after); register the file in `functions/package.json`

**Checkpoint**: creatives are derivable, the learning write is serialised on every
route, and prior state is read in bounded fashion. User stories can begin.

---

## Phase 3: User Story 1 — Learning Never Resets (Priority: P1) 🎯 MVP

**Goal**: aggregates accumulate across the account's whole history, are idempotent
under repeat processing, and never shrink on a partial sync.

**Independent Test**: run the same sync payload ten times and confirm the stored
record after the tenth is field-for-field identical to after the first; then run a
sync over a strict subset and confirm every record is unchanged or larger, never
smaller.

- [ ] T017 [P] [US1] Implement `decideContribution` in `functions/src/learning/contributionLedger.ts` per `contracts/contributionLedger.md` — the add / no-op / withdraw-then-add / withdraw-only decision table (FR-016, FR-017)
- [ ] T018 [US1] Implement per-record delta application in `functions/src/learning/aggregateDelta.ts` — atomic increments for sums, counts, win/loss totals and the per-funnel-type breakdown; a withdrawal is a **negative delta**, never a recomputation (FR-021, research.md §D3)
- [ ] T019 [US1] Invert the contract of `functions/src/learningAggregates.ts` from overwrite to delta, and **delete the module-header rule at line 17** (*"Same generationId in 2 ad sets → separate records per context"*), which FR-073 overturns
- [ ] T020 [US1] Add derived averages recomputed from sums and counts under their existing names in `functions/src/learningAggregates.ts` (FR-022) — derived output, not accumulated state
- [ ] T021 [US1] Make counts count **distinct creatives**, not ad rows, in `functions/src/learningAggregates.ts` and `functions/src/learning/aggregateDelta.ts` (FR-036, FR-073)
- [ ] T022 [US1] Implement any-row eligibility and all-rows aggregation in `functions/src/learning/aggregateDelta.ts` (FR-074g) — a creative is eligible if **any** row qualifies, and **every** row's values then aggregate
- [ ] T023 [US1] Suppress writes to angle and pattern records that received no change this sync in `functions/src/metaSync/shared.ts` (FR-019), and guarantee no stored count, average or total ever decreases (FR-020)
- [ ] T024 [P] [US1] Add schema versioning to the aggregate records in `functions/src/learning/aggregateDelta.ts` — below-version records read as **absent** and are **replaced in full** on first write, never incremented onto (FR-042, FR-043, FR-044, FR-045)
- [ ] T025 [US1] Persist the ledger entry and the resolved `linkProvenance` on each ad row in `functions/src/metaSync/shared.ts` (FR-016, FR-074d, FR-074e). **`matchType` gains no new value** (FR-074f) — a propagated row keeps `matchType: null` so the lock at `shared.ts:864-869` does not fire
- [ ] T026 [P] [US1] Write accumulation tests in `functions/src/__tests__/learningAccumulation.test.ts` asserting that the click-through and cost-per-thousand measures keep their **existing field names, units and meaning**, and that the objective / geo-tier / audience-type partitions are **unchanged in name and meaning** — only the accumulation window widens (FR-024, FR-025); and covering SC-001 (**zero** decreases after an economics change), SC-002 (ten identical runs, zero drift), SC-003 (partial sync, byte-identical untouched records), SC-008 (the 55-row creative contributes **1**, not 55), SC-012 (a forced accumulation failure leaves records unchanged and does not fail the sync), SC-013 (monotonic non-decrease across ten syncs), SC-029c (one matched row plus several propagated rows aggregates **all** of them), SC-045 and SC-050; register the file in `functions/package.json`
- [ ] T027 [P] [US1] Write delete-cascade tests in `functions/src/__tests__/learningCascade.test.ts` — metadata loss prevents further contribution but **never withdraws** one already made (FR-014), and a creative is never half-cascaded because the cascade queries by `generationId` (FR-074g); register the file in `functions/package.json`

**Checkpoint**: US1 is independently deliverable and is the MVP — cumulative,
idempotent, shrink-proof accumulation, which is the owner's stated defect.

---

## Phase 4: User Story 2 — A Result, Once Earned, Stays Earned (Priority: P2)

**Goal**: an ad's learning result reflects the economics it actually ran against; the
efficiency figure is contributed once, when the creative's numbers are final.

**Independent Test**: record a result under one cost target, change the target,
re-sync, and confirm the sealed result, sealed target and sealed efficiency figure
are unchanged — while the day-to-day operational status has moved to the new target.

### Sealed evaluation context

- [ ] T028 [US2] Record the sealed target, sealed funnel type, sealed timestamp and contribution state on each ad row in `functions/src/metaSync/shared.ts`, written in the same operation as the learning result (FR-001, FR-004, FR-005a, FR-007)
- [ ] T029 [US2] Implement the one-way PROVISIONAL→SEALED guard in the write path in `functions/src/learning/contributionLedger.ts` — enforced in code, not by convention (FR-005b, FR-005c, FR-005d)
- [ ] T030 [US2] Implement the single-sealed-target-per-creative rule in `functions/src/learning/creativeGrouping.ts` — the **earliest-sealing row among all rows now belonging to the creative** (FR-012a). **Do not add ordering or tie-breaking machinery**: rows sealing in one evaluation resolve the same account-level target, so ties carry no information
- [ ] T031 [US2] Implement the creative-state derivation in `functions/src/learning/creativeGrouping.ts` — SEALED if **any** row is SEALED, PROVISIONAL only while **every** row is (FR-036c)
- [ ] T032 [US2] Keep the operational status recomputing against current economics, separately from the sealed result, in `functions/src/metaSync/shared.ts` (FR-008, FR-009, FR-010)
- [ ] T033 [US2] Implement the FR-011 re-evaluation triggers in `functions/src/learning/contributionLedger.ts` with **(a) narrowed to target-independent measures only** — it must not re-evaluate the efficiency figure (FR-011, FR-012)

### Conversion accrual

- [ ] T034 [P] [US2] Implement `accrueDays` in `functions/src/learning/conversionAccrual.ts` per `contracts/conversionAccrual.md` — per-day counts from `last7DaysDaily`, key **(ad row id, date)**, **upward-only** revision while in window (FR-081, FR-083, FR-084). **Never use the three-day window**, which is a single aggregated row (`shared.ts:294`)
- [ ] T035 [US2] Implement bounded retention in `functions/src/learning/conversionAccrual.ts` — a day leaving the window folds into `finalisedTotal`, increments `finalisedDayCount`, and its map entry is **deleted** (FR-084a); window membership is pure date arithmetic
- [ ] T036 [US2] Treat an absent daily row as **not observed, never zero** in `functions/src/learning/conversionAccrual.ts` (FR-085a)
- [ ] T036a [US2] Name the accumulated total **"conversions across days observed"** in identifiers, comments and logs across `functions/src/learning/conversionAccrual.ts`, and never "lifetime" or "since inception" (FR-082). Verify with a grep for `lifetime` under `functions/src/learning/` returning nothing — a naming rule with no guard is violated by the first developer who types the obvious word
- [ ] T037 [P] [US2] Persist the already-fetched `status` onto `AdDoc` in `functions/src/metaSync/shared.ts` and add it to the interface at `shared.ts:170-211` (FR-085). No new Graph call; `metaGraph.ts:83` already requests it. **Do not add `effective_status`** — deferred
- [ ] T038 [US2] Implement `isStopped` in `functions/src/learning/conversionAccrual.ts` (FR-077(b), FR-085) — it **under-detects** parent-level pauses by design; an undetected stop is a missing contribution, never a wrong one

### Efficiency figure

- [ ] T039 [US2] Implement aggregate-then-divide in `functions/src/learning/efficiencyFigure.ts` — sum realised cost and results across **all** the creative's rows, divide, then divide by the single sealed target (FR-002, FR-002a, FR-003). **Divide-then-average is forbidden**
- [ ] T040 [US2] Implement FR-077 eligibility in `functions/src/learning/efficiencyFigure.ts` — 5 combined conversions across all placements, **or** stopped with ≥1; zero never contributes
- [ ] T041 [US2] Implement write-once in `functions/src/learning/efficiencyFigure.ts` (FR-079) and the FR-005c carve-out in the write guard in `functions/src/learning/contributionLedger.ts` — the guard MUST test the **specific transition**, not the SEALED flag
- [ ] T042 [US2] Implement the FR-087 recomputation rule in `functions/src/learning/contributionLedger.ts` — **carry across** on re-attribution (row set unchanged), **recompute over the union** on merge (row set changed). These are different operations; treating them as one gets one wrong invisibly
- [ ] T043 [US2] Implement the merge reconciliation shape in `functions/src/learning/contributionLedger.ts` (FR-013a) — withdraw **both**, recompute against the **earliest** sealed target, add **one**, with both withdrawals completing before the addition
- [ ] T044 [P] [US2] Write sealed-context tests in `functions/src/__tests__/sealedContext.test.ts` covering SC-004, SC-015, SC-016, SC-032; register the file in `functions/package.json`
- [ ] T045 [P] [US2] Write accrual tests in `functions/src/__tests__/conversionAccrual.test.ts` covering SC-037 (**zero** additional Graph calls), SC-038, SC-039 (raise, **no-lower**, finalised untouched — all three), SC-040 (asserted against **both** wrong keys), SC-041 (parent-paused ad does **not** seal, asserted as expected), SC-051; register the file in `functions/package.json`
- [ ] T046 [P] [US2] Write efficiency tests in `functions/src/__tests__/efficiencyFigure.test.ts` covering SC-030 (materially different per-row values so the two formulas diverge), SC-031 (**both** halves of the carve-out), SC-033, SC-034, SC-035, SC-036, SC-048 (merge fixture with different figures **and** different targets); register the file in `functions/package.json`

**Checkpoint**: US2 delivers trustworthy accumulated evidence on top of US1's stable
accumulation.

---

## Phase 5: User Story 3 — Winners Transfer Between Funnels (Priority: P3)

**Goal**: a proven angle stays eligible in a different funnel, ranked behind an
equally-proven same-funnel angle but never excluded.

**Independent Test**: build a record where an angle has strong evidence from one
funnel type and none from a second; request guidance for the second and confirm the
angle is still offered, and that an equally-evidenced same-funnel angle ranks ahead.

- [ ] T047 [P] [US3] Add the per-funnel-type breakdown, including an explicit `unknown` bucket, to the aggregate records in `functions/src/learning/aggregateDelta.ts` (FR-027, FR-032)
- [ ] T048 [US3] Keep funnel type out of record identity in `functions/src/learningAggregates.ts` — one angle has exactly one record spanning every funnel type (FR-028) — and keep headline totals all-funnel (FR-029)
- [ ] T049 [US3] Implement funnel-type **weighting** in the retrieval path in `functions/src/getTopWinners.ts` — weight toward same-funnel evidence, **never filter, exclude, suppress or zero** (FR-030, FR-031, FR-032a)
- [ ] T050 [US3] Implement the per-item floor and the efficiency-evidence gate in `functions/src/getTopWinners.ts`, both counted in **creatives** — 3 contributing creatives before a top-performer appearance (FR-034a), 3 creatives carrying a sealed figure before efficiency influences ranking (FR-037)
- [ ] T051 [US3] Bound the efficiency value folded into an angle's average at **3.0** in `functions/src/learning/aggregateDelta.ts`, retaining the raw unbounded figure on the ad row (FR-038)
- [ ] T052 [P] [US3] Write cross-funnel tests in `functions/src/__tests__/crossFunnelRetrieval.test.ts` covering SC-005 (zero exclusions), SC-006 (same-funnel ranks ahead), SC-014 (a creative across 55 rows clears **none** of the three gates alone); register the file in `functions/package.json`

**Checkpoint**: US3 delivers the second half of the owner's sentence — learning that
transfers between funnels.

---

## Phase 6: User Story 4 — The Owner Sees the All-Time Truth (Priority: P4)

**Goal**: the dashboard and the creative-guidance path both report all-time,
creative-counted figures, in both languages, with no jargon.

**Independent Test**: populate a record spanning several funnel types and multiple
syncs, then confirm the dashboard and the guidance path report figures consistent
with the all-time record, in both languages.

- [ ] T053 [US4] Update `functions/src/whatsWorkingDashboard.ts` to read the new record shape, keeping the existing click-through-derived tier icons working (FR-039) and presenting all-time totals (FR-040)
- [ ] T054 [US4] Update `functions/src/getTopWinners.ts` to read the new record shape, retaining existing click-through-against-account-average selection behaviour (FR-033)
- [ ] T055 [US4] Make the guidance activation threshold count **10 distinct creatives** and latch on in `functions/src/getTopWinners.ts` — once met, no partial or failed sync may switch it back off (FR-034, FR-035, FR-036a, FR-036b)
- [ ] T056 [US4] Add the plain-language multi-funnel indication to `functions/src/whatsWorkingDashboard.ts` and its two bilingual strings to `src/i18n.tsx` (FR-041, FR-047). **This is the one new owner-visible string this feature introduces** — it has nothing to display before this feature, because cross-funnel evidence does not exist until it ships. Arabic must be **simple Fusha**: no dialect, no jargon, no raw measurement values, no percentages (FR-048, FR-049)
- [ ] T057 [P] [US4] Write dashboard tests in `functions/src/__tests__/whatsWorkingAllTime.test.ts` covering SC-007, SC-009, SC-010, and SC-021 (FR-065's existing bilingual message carries **zero** technical terms and **zero** raw measurement values — the string is unchanged by this feature, but the assertion is not currently made anywhere); register the new file in `functions/package.json` (FR-050)

**Checkpoint**: the feature is visible to the owner. All four stories delivered.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: the observability the feature is judged by, and the final gates.

- [ ] T058 Emit **one summary line per account per sync** from `functions/src/metaSync/shared.ts` carrying additions, unchanged no-ops, refresh withdrawals, re-attribution withdrawals, seal transitions and skips (FR-051, FR-051a, FR-051b)
- [ ] T059 Break the skip count down by enumerated reason in `functions/src/metaSync/shared.ts` — no creative link, creative metadata unavailable, no resolvable angle, no resolvable visual pattern, learning write aborted (FR-051c)
- [ ] T060 Add the **four-way link-provenance breakdown** to the summary line in `functions/src/metaSync/shared.ts` — direct automatic, manual, propagated-only, no generation — emitted every sync including zeros, **never collapsed to a single total** (FR-076)
- [ ] T061 Add the **days-lost-to-gaps** count to the summary line in `functions/src/metaSync/shared.ts`, counting dates **no sync's window covered** and **not** dates for which no row was returned (FR-086, FR-086a)
- [ ] T062 [P] Restrict individual event lines to the events that cannot fire in bulk in `functions/src/metaSync/shared.ts` — re-attribution withdrawal, lease acquisition failure, lease lost mid-write, ledger chunk read failure (FR-051d)
- [ ] T063 [P] Keep log content to identifiers, state names, reason codes and counts in `functions/src/metaSync/shared.ts` — no owner-facing strings, no governed metric names, no percentages (FR-051e). **This constraint is stated but not automatically enforced; uphold it in review**
- [ ] T064 [P] Write observability tests in `functions/src/__tests__/learningObservability.test.ts` covering SC-026, SC-027, SC-028, SC-042, SC-042a, SC-047; register the file in `functions/package.json`
- [ ] T064a Assert the verdict engine is unmodified: `git diff --stat main -- functions/src/qararEngine.ts` returns empty (FR-026). **Do not modify `functions/src/qararEngine.ts`** — it computes correctly and the defect is at the write site, not the compute site. This prohibition previously appeared in no task and no design document
- [ ] T065 Add the no-pruning note at the `adPerformance` write site in `functions/src/metaSync/shared.ts` (FR-066) — the ledger is authoritative for correctness, so deleting an ad document silently re-enables double-counting
- [ ] T066 Confirm every data access added by this feature uses the lazy database-handle pattern, with no handle acquired at module load, across `functions/src/learning/*.ts` (FR-053)
- [ ] T067 Run the full chain defined in `functions/package.json` (`cd functions && npm test`) and confirm it reaches its **final** entry, not merely that it starts (FR-050, SC-011) — a chain that stops partway is the failure mode being guarded against
- [ ] T068 Record the FR-083 **post-implementation verification** as a dated follow-up in `specs/969-cumulative-learning/quickstart.md` (§After deployment) — once per-day figures are stored, compare a day across successive syncs while it remains in the window and report whether downward revisions occur and at what magnitude

---

## Dependencies

```
Phase 1 (Setup)
   └─▶ Phase 2 (Foundational: grouping → lease → bounded read)   ⚠️ BLOCKING
          ├─▶ Phase 3 — US1 (P1)  🎯 MVP
          │      └─▶ Phase 4 — US2 (P2)   [needs US1's ledger + delta path]
          │             └─▶ Phase 5 — US3 (P3)   [needs US2's sealed efficiency figure]
          │                    └─▶ Phase 6 — US4 (P4)   [needs the record shape US1–US3 produce]
          └─▶ Phase 7 (Polish)   [counts wire in as each phase lands]
```

**Story independence**: US1 is fully independent once Phase 2 lands. US2 depends on
US1's ledger. US3 depends on US2's sealed figure — the spec says so directly
("it depends on P2 having sealed a comparable efficiency figure"). US4 is last
because the record must exist before it can be displayed.

**Within Phase 2, the order is not arbitrary**: the lease (T009–T013) must precede
any delta accumulation. This is the item most likely to be inferred wrongly, and its
mistake is invisible to any test that does not drive two routes.

## Parallel Execution Examples

**Phase 1** — T002, T003, T004 in parallel after T001.

**Phase 2** — T008 runs alongside T009–T012 (different files). T013 and T016 are
parallel to each other. T005 → T006 → T007 are sequential: same file.

**Phase 3 (US1)** — T017 and T024 in parallel; T026 and T027 in parallel once
T017–T025 land. T018–T023 touch overlapping files and are sequential.

**Phase 4 (US2)** — three independent tracks: sealed context (T028–T033), accrual
(T034–T038, with T034 and T037 parallel), efficiency (T039–T043). The three test
tasks T044, T045, T046 are parallel to each other.

**Phase 7** — T062, T063, T064 in parallel; T058–T061 are sequential (one file, one
log line).

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That delivers cumulative, idempotent,
shrink-proof accumulation — the owner's stated defect and the load-bearing fix.
Everything after it is written onto a record that no longer erases itself.

**Incremental delivery**: each story phase is independently testable against the
Independent Test stated in its heading, and each ends at a checkpoint.

## Do NOT build

All four are locked decisions, and one was explicitly considered and rejected:

- **No near-hash clustering** — non-transitive; merging distinct creatives is worse
  than splitting one (FR-074b, `contracts/creativeGrouping.md`)
- **No epoch partitioning** (FR-015) · **No backfill** (FR-043) · **No migration**
  (FR-044, FR-045)

Three limitations are **accepted and undetectable by construction**. Do not attempt
to close them: FR-074b's unlinked split, FR-074e's hashless propagated row,
FR-051e's unenforced governed-metric guard.
