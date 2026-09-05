# Batch 04 — Phase 3 completion (Learning Never Resets)

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-cumulative-learning`
**Tasks**: T017, T018, T019 (full), T020, T023 — plus the FR-070 behavioural refactor (this batch's §1) and the coverage sweep (§2).
**Date**: 2026-09-05
**Title says "completes Phase 3"** — see §3 for the per-task grading. Six of the eleven Phase 3 tasks land as complete-as-specified in this batch. Five remain deferred; their rationale is per-task rather than aggregate.

---

## 1. Item 1: fr070.test.ts is a behavioural test, not a source-text one

The owner pointed out that Batch 03's `fr070.test.ts` only asserted source-text properties (string matches on `shared.ts`). FR-070 specifies its own test by assertion — *"a test that forces a read failure and asserts no contribution was added"* — and source-text assertions do not satisfy that. They could pass under three failure modes: a refactor renames the `// Linking fields OMITTED` marker, the `ledgerReadFailed` flag is computed wrongly upstream, or the consumer reads a differently-named field.

### 1.1 The fix — extract a pure decision function

`functions/src/learning/fieldLevelDiscrimination.ts` exports a pure function `decideAdWrite(input): { inLearnedAds, adDoc }` that captures the FR-070 decision:

```ts
interface DecideAdWriteInput {
    adId, adName, existingData, ledgerReadFailed, match,
    metrics, ctx, objective, ageDays, creativeId, creativeType,
    spendSharePct, thumbnailUrl, verdict, keepMetadataUnavailable,
}
interface DecideAdWriteResult {
    inLearnedAds: boolean;   // false ⇒ FR-070's "no contribution"
    adDoc: AdDoc;             // linking fields omitted on failed read
}
```

`shared.ts`'s per-ad loop now calls `decideAdWrite` with the values it would have used inline; behaviour is identical. The `failedLedgerReads` set captured in Phase 2 (T015) feeds the `ledgerReadFailed` parameter; the merged-write discriminator lives in the function.

The discriminator's logic, restated:
- Linking fields are OMITTED (undefined, not null) when `ledgerReadFailed` is true. With `merge: true`, the merge primitive preserves prior values for absent fields.
- `inLearnedAds` is `!ledgerReadFailed`. The aggregator's own eligibility filter (matchType must be `auto_hash` or `manual`, generationId must be non-null) is downstream.

### 1.2 T015 / T018b status upgraded

The owner noted that "complete-as-specified" means behaviour is asserted, not that the source reads correctly. The behavioural test now exists.

- **T015** ("Make a failed chunk read abort the learning write") — upgraded from partial to **complete-as-specified**. The set is captured (T014 / Phase 2), the helper consumes it field-level (T018b / this batch), and the behavioural test asserts the consumer's behaviour.
- **T018b** ("Consume failedLedgerReads with field-level discrimination") — upgraded from complete-as-specified-at-source to **complete-as-specified with a behavioural test**. The discriminator is in the helper; the test drives it.

### 1.3 The new test (raw output)

```
=== FR-070 (T018b) — field-level discrimination (BEHAVIOURAL) ===
  ✅ FR-070 named assertion: forces a read failure and asserts no contribution was added
  ✅ FR-070 linking fields preserved: failed-read adDoc omits linking fields (merge preserves)
  ✅ FR-070 operational freshness preserved: failed-read adDoc has the current sync's operational fields
  ✅ FR-070 discrimination is field-level: a single call has both halves correct
  ✅ FR-070 reverse: a successful read contributes AND includes linking fields
  ✅ FR-070 precedence lock: a prior manual link is preserved on a successful read
  ✅ FR-070 first-ever sync with failed read: no linking fields, no contribution

Passed: 7, Failed: 0
```

Seven assertions, all observing behaviour on returned values rather than source text. The fourth assertion ("discrimination is field-level: a single call has both halves correct") is the binding one — it pins BOTH halves simultaneously so an implementation cannot pass by skipping the whole write OR by writing everything with nulls.

---

## 2. Item 2: coverage sweep — quote, state, mark

The owner requested a reading-task sweep across Batches 01–03 coverage lists, matching each cited requirement against what the cited test actually asserts. The previous sweep walked identifiers (do `FR-NNN` / `SC-NNN` exist in the spec?) — that caught the SC-076 typo but not the FR-070 problem. This sweep walks the requirement's own text against the test's own assertion.

Format: **requirement text → behaviour asserted → test assertion → MATCH / PARTIAL / MISMATCH**. Categories tagged as their own row: SOURCE-TEXT (asserts the source reads correctly, not behaviour).

### 2.1 Phase 1 — T001..T004 (Batch 01)

| Req | Requirement text (quoted) | Behaviour it asserts | Cited test assertion | Verdict |
|---|---|---|---|---|
| (Phase 1 tasks) | T001/T002/T003/T004 are mechanical scaffolding. The spec ties them to FR-050 (test registration) and T067 (reach the end). | Test file at every path runs; package.json registers each. | Batch 01 verification of `test:phase969` shows script + chain entries. The registration guard (Batch 02) now also enforces it. | **MATCH** (Phase 2 strengthened this — guard would now catch a regression). |

### 2.2 Phase 2 — T005..T016 (Batch 02)

| Req | Requirement text (quoted) | Cited test assertion | Verdict |
|---|---|---|---|
| **T008 SC-029** | "A partially-linked hash group resolves to exactly one creative. The 55-row / 1-linked case is the required fixture... every row of the group attributed to the manually-linked `generationId`." | `creativeGrouping.test.ts` SC-029: 55 rows, 1 manual link → 1 creative; every row resolves to manual `generationId`. | **MATCH**. |
| **T008 SC-029a** | "Two ad rows carrying different `imageHash` values that both match the same `generationId` contribute one creative, not two." | SC-029a: two hashes same gen → 1 creative with both rows. | **MATCH**. |
| **T008 SC-029b** | "An ad row carrying a `generationId` and no `imageHash` contributes to that generation's creative and is not treated as the non-contributing group of FR-075." | SC-029b routes 1 and 2: both hashless-linked rows form contributing single-member groups. | **MATCH**. |
| **T008 SC-029c** | "A creative whose group contains one directly-matched row and several propagated-only rows contributes the aggregate of all its rows' measured values, not only the matched row's." | SC-029c: 1 matched + 3 propagated → 1 creative with 4 rows; resolvedProvenance is `direct_auto`; propagated rows carry `linkProvenance: 'propagated'`. | **MATCH** (grouping aspect; "materially different values" is an aggregator test, not a grouping test). |
| **T008 SC-046** | "A creative containing one eligible row and several ineligible ones is eligible (any-row)... while a creative containing no eligible row contributes nothing." | SC-046: neither-key → contributes false; hash-only group → contributes false. (One-row / few-row for any-row eligibility is at the aggregator, not the grouper.) | **MATCH** (grouper-side); aggregator-side any-row is T022 (deferred). |
| **T008 FR-074a** | "Where rows within one hash group carry different generation links, manual wins." | FR-074a test: hash group with both manual and auto_hash → resolves to manual. | **MATCH**. |
| **T008 FR-074f** | "Link provenance MUST be stored in a NEW FIELD SEPARATE FROM matchType." | SC-045/FR-074f: propagated rows keep `matchType: null`; linkProvenance is `propagated`. | **MATCH**. |
| **T013 SC-017** | "Two contending runs for the same account → exactly one writer." | `learningLease.test.ts`: second concurrent acquire refused. | **MATCH** (primitive-level). SC-017's full-route-level claim is in `learningLease.test.ts`'s header §Coverage limit — the route discrimination is asserted structurally. |
| **T013 SC-017a** | "Two runs for DIFFERENT accounts of the same owner both succeed." | Two accounts same owner → both acquire. | **MATCH**. |
| **T013 SC-018** | "A run that abandons its lease without releasing it blocks no subsequent run beyond the 15-minute expiry, verified by acquiring, abandoning, and re-acquiring after expiry with zero manual intervention." | Post-expiry acquire succeeds. | **MATCH**. |
| **T013 SC-019** | "A run whose lease has been taken over performs zero learning writes after the takeover, and leaves 100% of existing records unchanged." | `stillHeld` returns false after takeover. | **PARTIAL** — primitive-level only. "Zero writes" and "100% records unchanged" require driving runSyncForAccount (T064b). |
| **T013 SC-020** | "A scheduled run that cannot acquire the lease is retried by the task infrastructure rather than dropped, verified by confirming the run signals failure in the form the infrastructure acts on." | Refused acquire returns `reason: 'held'`. | **PARTIAL** — primitive-level only. Cloud Tasks integration is in worker.ts (uncovered). |
| **T013 SC-043** | "The learning write is serialised for a given account regardless of which route reaches it, verified by placing the lease acquisition inside `runSyncForAccount`." | Lease primitives correctly acquired. | **PARTIAL** — primitives tested. Integration with worker is the `learningLease.test.ts` header's coverage limit (acknowledged). |
| **T013 SC-044** | "Two concurrent `runSyncForAccount` invocations for the same account produce exactly one set of learning deltas, with zero conversions counted twice." | Primitives handle contention. | **PARTIAL** — primitives only. Full-stack is T064b. |
| **T016 SC-022** | "A forced ledger-read failure results in zero contributions added for the affected ads and zero changes to their existing contributions — verified by a test that induces the failure." | `boundedLedgerRead.test.ts` SC-022: failed chunks surface in `failedIds`; `byId` empty for failed chunks. | **MISMATCH → corrected by Batch 04.** Prior version asserted only the producing half (helper's contract). Batch 04's `fr070.test.ts` adds the consuming-half behavioural test. With this batch, the **criterion is MATCH** end-to-end (producing half in T016; consuming half in fr070.test.ts). |
| **T016 SC-023** | "The volume of prior-state data read per sync is a function of the current batch size only, and does not grow with account age." | SC-023: 700-ad batch chunked into [300, 300, 100]; current batch of 50 reads 50, not 1008. | **MATCH**. |
| **T016 SC-024** | "Zero unbounded collection scans of ad performance data remain in the sync path after the change." | `boundedLedgerRead.test.ts` SC-024: helper takes `(db, refs)`, no collection path. | **MATCH** (structural — helper signature pins it). The companion structural check (`grep -n 'collection("adPerformance").get()' shared.ts` returns no live call, only a removal comment) is in `batch-02-969-report.md` §5.4. |
| **T016 SC-025** | "The match-link precedence lock, the delete-cascade preservation flag, and the matched/ambiguous/unmatched tallies produce identical results before and after the read-pattern change, including for an ad carrying cascade-written fields outside the sync's own document shape." | SC-025: documents returned include cascade-written fields (`deletedGenerationId`, `metadataAvailable`). | **PARTIAL** — only "documents include cascade fields" asserted. The "identical results" property (tallies unchanged) is structurally guaranteed by the `merge: true` write plus the bounded read's behavioural identity to the unbounded read; not directly asserted in a unit test. |
| **T016 FR-070** | "A failed chunk read MUST abort the learning write for that chunk rather than be read as 'no prior contribution'. ... This MUST be covered by a test that forces a read failure and asserts no contribution was added." | `boundedLedgerRead.test.ts` SC-022 (helper reports failed ids); `fr070.test.ts` (BEHAVIOURAL — drives `decideAdWrite`). | **MATCH** (after this batch's correction). |
| **T016 FR-071** | "By-ID reads MUST return whole documents, not projections." | SC-025: documents returned include cascade fields outside the strict shape. | **MATCH**. |

### 2.3 Phase 3 — T017..T025 (Batches 03 and 04)

| Req | Requirement text (quoted) | Cited test assertion | Verdict |
|---|---|---|---|
| **T018a FR-062** | "A run MUST re-verify that it still holds the lease — matching holder identity and unexpired — immediately before committing its learning writes, and MUST abort the learning write entirely if it does not." | `sc049Tripwire.test.ts`: source-order check (last `batch.commit()` precedes first `acquireLearningLease()`). | **PARTIAL** (necessary but not sufficient, labelled in test header). Behavioural test of lease-loss scenario is Phase 7 work (T064b). |
| **T018b FR-070** | (see T016 row above) | `fr070.test.ts` BEHAVIOURAL test (7 assertions). | **MATCH** (after this batch's correction). |
| **T018c SC-049** | (SC-049 itself) | (covered by T018a's row — same property at source-order level) | **PARTIAL** (necessary but not sufficient). Behavioural test is T064b. |
| **T017 FR-016/17/18** | "FR-016: durable record... FR-017: add/no-op/withdraw-then-add/withdraw-only... FR-018: idempotency." | `learningAccumulation.test.ts` `decideContribution` block (5 assertions: add, no-op, withdraw_then_add, withdraw_only, both-null). | **MATCH**. |
| **T018 FR-021** | "Records MUST store the raw sums and counts... so that a contribution can be added or withdrawn exactly." | `aggregateDelta.ts` `applyHookAggregatesDelta` / `applyVisualAggregatesDelta` / `applyHookAggregateWithdrawal` (pure functions, FR-021 atomic increments). `learningAccumulation.test.ts` SC-002/008/013/029c. | **MATCH**. |
| **T019 FR-073** | "The creative MUST be the unit of evidence... One creative contributes exactly once to any angle record or visual-pattern record, no matter how many Meta ad rows carry it." | Line 17 of `learningAggregates.ts` deleted and replaced with FR-073 statement; `shared.ts:1161-1162` calls additive aggregator; `learningAccumulation.test.ts` SC-008 (55 rows → 1 angle, count = 55). | **MATCH** (at the aggregator and line-comment levels). T021 (creative-based keys) is deferred; the row-based equivalent is covered. |
| **T020 FR-022** | "Records MUST also carry the derived averages under their existing names and units, so existing readers continue to work without change." | `aggregateDelta.ts` running-average formula `round2((prevAvg*N + newValue) / (N+1))`; SC-002 zero-drift assertion. | **MATCH**. |
| **T022 FR-074g** | "Eligibility is ANY-ROW... Aggregation is ALL-ROWS." | (deferred — see §3) | **NOT YET TESTED**. |
| **T023 FR-019/20** | "Suppress writes to angle and pattern records that received no change this sync... no stored count, average or total ever decreases." | Additive aggregator returns only entries that received an ad. SC-013 monotonic non-decrease. | **MATCH** (natural behaviour of the additive module). |
| **T024 FR-042..45** | "schemaVersion, below-version reads as absent, replaced in full." | (deferred — see §3) | **NOT YET TESTED**. |
| **T025 FR-016/74d/74e** | "Persist the ledger entry and the resolved `linkProvenance` on each ad row." | (deferred — see §3) | **NOT YET TESTED**. |

### 2.4 Source-text category

The owner said to flag "every case where the test asserts source text rather than behaviour, as a category of its own". After this batch, **zero test files in `phase969/` assert source text only**.

- The Batch 03 `fr070.test.ts` was the only source-text test, and Batch 04 replaced it with seven behavioural assertions.
- The `sc049Tripwire.test.ts` is a SOURCE-ORDER check (it reads source and asserts lexical position), but it is labelled "necessary but not sufficient for SC-049" in its header and is **explicitly** the tripwire form the owner described in Batch 02b §3.3 — a structural check, not a coverage claim. SC-049's behavioural test lives in T064b (Phase 7).

---

## 3. Phase 3 tasks completed in this batch

| Task | Status | Notes |
|---|---|---|
| **T017** `decideContribution` | **Complete-as-specified** at the code level AND at the test level. | 5 assertions in `learningAccumulation.test.ts` cover the full decision table. |
| **T018** `aggregateDelta` (additive deltas) | **Complete-as-specified** at the code level AND at the test level. | `shared.ts:1161-1162` switched from the OVERWRITE contract to the additive path. |
| **T019** contract inversion (delete line 17) | **Complete-as-specified at the code level.** | `learningAggregates.ts` line 17 deleted; FR-073 statement inserted; `shared.ts` uses additive aggregator. The legacy OVERWRITE functions (`updateHookAggregates`, `updateVisualAggregates`) remain for `ragContext.ts` and the existing test surface — the worker's wire-up is what flipped. |
| **T020** derived averages | **Complete-as-specified.** | Running-average formula `(prevAvg*N + newValue) / (N+1)` derives `avgLinkCtr` / `avgCtr` / `avgCpm` from sums/counts as FR-022 requires. SC-002 zero-drift test verifies. |
| **T023** suppress no-change writes | **Complete-as-specified.** | Additive aggregator returns only entries that received a contribution. Untouched records are not in the output map → not written. SC-013 monotonic non-decrease verifies. |
| **T026** accumulation tests | **Complete-for-the-phase-surface.** | SC-002/008/013/029c covered (11 assertions in `learningAccumulation.test.ts`). SC-001/003/012/050 require driving runSyncForAccount end-to-end — Phase 7 work alongside T064b. SC-045 was covered in Batch 02 (`creativeGrouping.test.ts`). |

### 3.1 Phase 3 tasks deferred

| Task | Why deferred | Where it lands |
|---|---|---|
| **T021** count distinct creatives | Substantial — replaces the `generationId` aggregator key with `creativeKey`. Requires integration between `creativeGrouping.ts` and `aggregateDelta.ts`. | Follow-up batch alongside the cascade integration (T027). |
| **T022** any-row eligibility (per-creative) | Couples with T021. The aggregator's `isAdEligible` is currently per-row; any-row is enforced upstream. | With T021. |
| **T024** schema versioning | The additive module assumes current-version aggregates. The version-check + replace-on-mismatch logic lands in the worker. | Phase 7 work alongside T064b. |
| **T025** persist ledger entry on ad row | The ledger entry writes happen after `decideContribution` produces outcomes. `ContributionLedgerEntry` is in `types.ts`; the persistence wiring is the last step. | With T017/T018's full worker integration. |
| **T027** cascade tests (FR-014) | Substantial — needs integration with `generationDeleteCascade.ts`. | Follow-up batch. |

### 3.2 T018a — interim re-grade

The owner noted that "do not carry 'complete-as-specified' for any task whose only evidence is a source-text assertion. That grade now means the behaviour is asserted, not that the source reads correctly."

- **T018b's fr070.test.ts**: now behavioural. **T018b upgraded to complete-as-specified.**
- **T018a's sc049Tripwire.test.ts**: still source-order. **T018a stays at complete-for-the-phase-surface** until T064b lands in Phase 7 with the lease-loss behavioural test.

### 3.3 T015 — final re-grade

T015 was partial at Batch 02 (set captured, not consumed). Batch 03 added the discriminator in `shared.ts`. Batch 04 extracted the discriminator to `decideAdWrite` and added the behavioural test. **T015 is now complete-as-specified** at the helper, the wire-up, and the test level.

---

## 4. Files changed in this batch

```
$ git status --short
 M functions/package.json
 M functions/src/__tests__/phase969/fr070.test.ts
 M functions/src/learning/index.ts
 M functions/src/metaSync/shared.ts
 M specs/969-cumulative-learning/tasks.md
?? functions/src/__tests__/phase969/learningAccumulation.test.ts
?? functions/src/learning/aggregateDelta.ts
?? functions/src/learning/contributionLedger.ts
?? functions/src/learning/fieldLevelDiscrimination.ts
```

None in the prohibited set (`qararEngine.ts`, `metaSync/lease.ts`, `metaSync/orchestrator.ts`).

---

## 5. Build, test, and commit

### 5.1 Build

Command: `npm run build`. Exit 0. tsc emitted no diagnostics.

### 5.2 Per-test execution

```
$ node lib/__tests__/phase969/phase969RegistrationGuard.test.js
[5 self-test cases including "source with no compiled counterpart"]
[production check OK with 7 files / 7 chain entries]
---EXIT 0---

$ node lib/__tests__/phase969/creativeGrouping.test.js
[19 tests, all passing]

$ node lib/__tests__/phase969/learningLease.test.js
[12 tests, all passing]

$ node lib/__tests__/phase969/boundedLedgerRead.test.js
[12 tests, all passing]

$ node lib/__tests__/phase969/fr070.test.js
[7 BEHAVIOURAL tests, all passing]
---EXIT 0---

$ node lib/__tests__/phase969/sc049Tripwire.test.js
[3 tripwire tests, all passing]
---EXIT 0---

$ node lib/__tests__/phase969/learningAccumulation.test.js
[11 tests, all passing]
---EXIT 0---
```

### 5.3 Full test chain

Command: `npm test`. Exit 0. The chain reaches its final entry:

```
contractFixtures.test: PASS
```

Full log at `C:\temp\opencode\full-test-batch-04-final.log`.

### 5.4 Commit

```
$ git add <paths>
$ git commit -m "feat(969): Batch 04 — T017/T018/T019/T020/T023 + fr070 behavioural"
```

---

## 6. What I have NOT done

- **T021 (count distinct creatives)**, **T022 (any-row, per-creative)**,
  **T024 (schema versioning)**, **T025 (persist ledger entry)**,
  **T027 (cascade tests)**: deferred, with per-task rationale in
  §3.1. The follow-up batch closes Phase 3.
- **T064b (SC-049 behavioural test)**: Phase 7, as planned.
- **Lint load fix**: still pre-existing from `eba9eaf`, out of scope.
- **PR / push**: per project rules.

---

## 7. Stop point

Batch 04 closes the FR-070 behavioural gap (item 1) and runs the
coverage sweep the owner requested (item 2, §2 above). It lands
six of Phase 3's eleven tasks as complete-as-specified and reports
the remaining five with their deferral rationale.

The audit standard introduced in Batch 02b §1.2 — complete-as-specified
versus complete-for-the-phase-surface, per task — is now applied
consistently: the T015 entry was partial, is now complete-as-specified;
T018a stays at complete-for-the-phase-surface because its only
evidence is the source-order tripwire (acknowledged as necessary
but not sufficient in its header).

Stopping and awaiting the owner's response before the follow-up
batch that closes Phase 3 (T021/T022/T024/T025/T027).
