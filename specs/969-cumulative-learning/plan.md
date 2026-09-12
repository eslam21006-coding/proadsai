# Implementation Plan: Cumulative Learning for Ad Performance

**Branch**: `969-cumulative-learning` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/969-cumulative-learning/spec.md`

## Summary

Learning aggregates today are **rebuilt** from each sync's ads and overwritten, so
changing funnel settings or running a partial sync silently shrinks the record. This
feature makes accumulation **cumulative, idempotent and shrink-proof**, and re-bases
the unit of evidence from the **Meta ad row** to the **creative** (Amendment 1), while
making a creative's efficiency figure a **write-once** contribution taken when its
numbers are final (Amendment 2).

Technical approach: keep the pure aggregator's *shape* but invert its contract from
**overwrite** to **delta**; introduce a per-ad-row **contribution ledger** as the
idempotency mechanism; derive **creatives** by grouping rows on `imageHash` with
generation-link propagation and cross-group merge; accrue conversions **per (ad row,
date)** from daily insight rows the sync already fetches and discards; and serialise
the learning write with a **per-account lease placed inside `runSyncForAccount`** —
not the Phase 970 per-owner guard, which does not reach the Cloud Tasks worker.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (Vite frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Admin SDK, `@google-cloud/tasks`; React 19 (read surfaces only)
**Storage**: Firestore — `users/{uid}/workspaces/{wid}/adAccounts/{aid}/{adPerformance,hookPerformance,visualPerformance}`; one new per-account lease collection
**Testing**: `node:test` over compiled `lib/__tests__/*.test.js`, each registered in `functions/package.json` (FR-050)
**Target Platform**: Cloud Functions v2, `europe-west1`, Node 24
**Project Type**: Backend service (Firebase Functions) with an existing React read surface
**Performance Goals**: prior-state reads bounded by current batch size, not account age (SC-023, SC-050); no additional Graph API calls (SC-037)
**Constraints**: 540 s platform execution ceiling; Firestore 1 MiB document limit and 500-op batch limit (existing code chunks at 450); `GRAPH_CONCURRENCY = 8`, `maxConcurrentDispatches: 5`
**Scale/Scope**: today 2 ad accounts, 1008 ad rows → 146 creatives; 1 owner. Design targets growth in rows/day, not in accounts.

No `NEEDS CLARIFICATION` remains. The spec carries two clarification sessions
(2026-09-02, 2026-09-05) resolving nine questions; §Phase 0 records the three
design choices that remained open at requirement level.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1.*

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Reliability over feature count** | **PASS** | No new user-facing surface. Three limitations are stated rather than papered over (FR-074b, FR-074e, FR-051e), and near-hash clustering was explicitly rejected as non-transitive. |
| **II. Selected mode MUST be obeyed** | **N/A** | No mode/format selection is touched. |
| **III. Launch surface frozen** | **PASS** | Additive to an existing lane; no new combination is enabled. |
| **IV. Behavior contracts beat judgment** | **PASS** | 56 success criteria; every requirement named in the 1C pass carries one. Several are written to *discriminate* (SC-030, SC-031, SC-039, SC-040, SC-046, SC-048). |
| **V. Arabic quality first-class** | **PASS, with work** | This feature introduces **one** new owner-visible string: **FR-041's multi-funnel indication**, which has nothing to display before this feature because cross-funnel evidence does not exist until it ships. Delivered by **T056** in English and simple Fusha, asserted by **SC-010** and **SC-021**. FR-065's existing bilingual message is unchanged. The FR-059/FR-065 wording tension is recorded and deferred to an owner decision, not resolved by a silent edit. |
| **VI. Hidden layers MUST be auditable** | **PASS** | FR-051a–e layered auditability; the ledger is the per-row audit trail; FR-076's four-way provenance breakdown and FR-086's days-lost count are the two new signals. |
| **VII. No silent override without rule, signal, trace** | **PASS** | Every fallback is named: propagation provenance (FR-074e), merge (FR-074b), upward-only revision (FR-083), lease abort (FR-064). |
| **VIII. Cost discipline** | **PASS** | **Zero** additional Graph calls (FR-081, SC-037): the per-day rows are already fetched and discarded. Reads become *cheaper* — FR-068 removes an unbounded collection scan. |
| **IX. Proof required for every fix** | **PASS** | Batch 0 established current behaviour with `file:line` evidence and production queries; every requirement cites its controlling site. |
| **X. Spec before code** | **PASS** | Spec approved, twice amended, six checklist iterations, two clarification sessions. |
| **XI. Frontend and backend agree** | **PASS** | Read surfaces consume the aggregates; FR-072b keeps the matched/ambiguous/unmatched tallies byte-identical so `whatsWorkingDashboard.ts:719`'s "needs linking" list is unaffected. |
| **XII. Deferred scope stays deferred** | **PASS** | `effective_status` (FR-085), the FR-065 rewording, and near-hash clustering are all recorded as **not** in scope. |

### Gate result: **PASS with two recorded checklist failures, both deliberate.**

The specification's own checklist carries two ❌ items. Neither blocks planning, and
both are recorded rather than argued away:

1. **"Requirements are testable and unambiguous"** — three stated limitations are
   undetectable *by construction*. The requirements are testable; the acknowledged
   non-guarantees are not. **Planning MUST NOT attempt to close them** (see
   Complexity Tracking).
2. **"No implementation details leak into specification"** and its mirror for
   success criteria — four requirements name this project's own artifacts because
   they are unenforceable without the name. This plan *depends* on that
   specificity; removing it would be the regression.

## Project Structure

### Documentation (this feature)

```text
specs/969-cumulative-learning/
├── plan.md              # This file
├── research.md          # Phase 0 — the three open design choices, resolved
├── data-model.md        # Phase 1 — entities, fields, state, derivation rules
├── quickstart.md        # Phase 1 — how to run and verify the feature
├── contracts/           # Phase 1 — module contracts
│   ├── creativeGrouping.md
│   ├── contributionLedger.md
│   ├── conversionAccrual.md
│   └── learningLease.md
├── checklists/requirements.md
├── reports/             # Batch 0–1F review record
└── tasks.md             # Phase 2 — NOT created by /speckit.plan
```

### Source Code (repository root)

```text
functions/src/
├── learning/                          # NEW — the feature's own module
│   ├── index.ts                       # barrel re-export
│   ├── types.ts                       # shared feature types (data-model.md)
│   ├── creativeGrouping.ts            # FR-073, FR-074, FR-074a–g
│   ├── contributionLedger.ts          # FR-016, FR-017, FR-018, FR-046
│   ├── conversionAccrual.ts           # FR-081–FR-086a
│   ├── efficiencyFigure.ts            # FR-002, FR-002a, FR-003, FR-077–FR-080, FR-087
│   ├── aggregateDelta.ts              # FR-015, FR-019–FR-022
│   └── learningLease.ts               # FR-054–FR-065 (per ACCOUNT, new collection)
├── learningAggregates.ts              # MODIFIED — overwrite contract → delta contract
├── metaSync/
│   ├── shared.ts                      # MODIFIED — ordering (FR-060a), bounded read
│   │                                  #   (FR-067–FR-069), lease call site (FR-054a)
│   └── lease.ts                       # UNTOUCHED — Phase 970's per-owner guard
├── metaGraph.ts                       # MODIFIED — persist `status` only (FR-085)
├── whatsWorkingDashboard.ts           # MODIFIED — read the new record shape (FR-039)
├── getTopWinners.ts                   # MODIFIED — read the new record shape (FR-033)
└── __tests__/                         # NEW test files, each registered in package.json

src/
└── i18n.tsx                           # MODIFIED — FR-041's multi-funnel indication
                                       #   (en + simple Fusha). The ONLY frontend change.
```

**Structure Decision**: a new `functions/src/learning/` module rather than growth
inside `metaSync/shared.ts`, which is already 1326 lines and carries the whole sync
body. The pure/impure split of the existing `learningAggregates.ts` is preserved and
extended: **grouping, ledger comparison, accrual arithmetic and efficiency
computation are pure and unit-testable**; only `learningLease.ts` and the call sites
in `shared.ts` touch Firestore. This keeps the constitution's auditability principle
cheap to satisfy and lets the discriminating success criteria (SC-030, SC-040,
SC-046, SC-048) run without emulators.

## Implementation Tracks

Ordered so each track is independently verifiable and the highest-risk item is not
last.

> **These are TRACKS, not the phases in `tasks.md`.** `tasks.md` is organised by
> **user story**; the table below is organised by **implementation order**. They do
> not correspond one-to-one — track 3 is not tasks' Phase 3. The mapping is given in
> the rightmost column.

| # | Phase | Delivers | Key requirements | Gate |
|---|---|---|---|---|
| **1** | **Creative grouping (pure)** | `creativeGrouping.ts` | FR-073, FR-074, FR-074a–g | SC-029, SC-029a–c, SC-045, SC-046 |
| **2** | **Lease + ordering** | `learningLease.ts`, `shared.ts` ordering | FR-054a–d, FR-060a, FR-056–FR-065 | SC-017, SC-017a, SC-043, SC-044, SC-049 |
| **3** | **Bounded reads** | replace the unbounded scan | FR-067–FR-072b | SC-023, SC-024, SC-025 |
| **4** | **Contribution ledger + delta aggregation** | `contributionLedger.ts`, `aggregateDelta.ts`, `learningAggregates.ts` contract inversion | FR-015–FR-023, FR-042–FR-046 | SC-002, SC-003, SC-008, SC-013 |
| **5** | **Sealed context + state** | sealing, FR-012a, FR-036c | FR-001–FR-014 | SC-004, SC-015, SC-016, SC-032 |
| **6** | **Conversion accrual** | `conversionAccrual.ts`, persist `status` | FR-081–FR-086a | SC-037, SC-038, SC-039, SC-040, SC-041, SC-042, SC-042a, SC-050, SC-051 |
| **7** | **Efficiency figure** | `efficiencyFigure.ts`, FR-087 | FR-002a, FR-077–FR-080, FR-087 | SC-030, SC-031, SC-033–SC-036, SC-048 |
| **8** | **Read surfaces + logging** | dashboard, retrieval, summary line | FR-033–FR-041, FR-051a–e, FR-076 | SC-005–SC-007, SC-009, SC-026–SC-028, SC-047 |

**Why phase 2 is second, not last.** It is the item the owner flagged as most likely
to be inferred wrongly, and it is the only phase whose mistake is *invisible in
testing that does not specifically drive two routes*. Building it before the delta
accumulation of phase 4 means the double-count it prevents can never be introduced
in the first place.

## Three decisions the plan makes explicitly

These are called out because each is a place an implementer would reasonably infer
the wrong thing.

### 1. The lease is NEW, per account, and inside `runSyncForAccount`

**Not** Phase 970's `metaSyncLeases/{ownerUid}`.

- **Placement**: acquisition happens inside `runSyncForAccount`, around the learning
  write only (FR-054a, FR-055). Every route converges there; the orchestrator does
  not.
- **Why 970's lease cannot be reused**: `metaSyncAccountWorker` imports
  `runSyncForAccount` directly (`worker.ts:19`) and calls it at `:61` with no lease,
  so the fan-out and the whole 03:00 cycle reach the learning write unleased
  (FR-054b). It is also keyed **per owner**, which cannot serialise per account — an
  owner with three accounts would have all three contending for one document.
- **Collection**: a new one, keyed on `(ownerUid, accountId)`. `lease.ts` is
  **untouched**; the record *shape* is shared (holder identity + absolute expiry,
  FR-057), the document and key are not.
- **The discriminating test is SC-043 and SC-017a**: SC-043 fails if the lease is
  reachable only through `runFullSync`; SC-017a fails if the key is per owner,
  because two accounts of one owner must both proceed.

### 2. Commit ordering under FR-060a

```
1. fetch → compute → COMMIT operational status writes   (FR-009)
2. THEN acquire the learning-write lease                 (FR-054a)
3. on failure, signal for retry                          (FR-060)
```

The natural implementation order is the reverse, and nothing outside FR-060a forbids
it. Signalling failure does **not** roll back a committed write; the retry re-applies
the operational writes harmlessly, because FR-055 already establishes them as
idempotent per-ad overwrites. **SC-049** asserts both halves.

### 3. FR-087 — re-attribution and merge are different operations

| Trigger | Row set | Action | Requirement |
|---|---|---|---|
| **Re-attribution** (FR-011(b)) | unchanged | withdraw, **carry the figure across**, add | FR-087(i), FR-013 |
| **Merge** (FR-074b) | changed (union) | withdraw **both**, **recompute** over the union against the **earliest** sealed target, add **one** | FR-087(ii), FR-013a, FR-012a |

Treating them as one operation gets one of them wrong in a way no aggregate total
reveals. **SC-048** is written to catch it: the two halves carry materially different
figures *and* different sealed targets, so neither carrying-forward nor averaging can
pass.

## Complexity Tracking

*Filled because the Constitution Check records two deliberate checklist failures.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Spec names implementation artifacts (`runSyncForAccount`, `worker.ts:19`/`:61`, `matchType`) inside requirement text — FR-054a, FR-054b, FR-060a, FR-074f | Each requirement is **unenforceable without the name**. FR-054b exists precisely because a lease placed elsewhere satisfies the words and not the requirement. | A behaviour-only phrasing ("serialise the learning write per account") is exactly what Phase 970's existing lease already appears to satisfy — which is the failure mode. |
| Three limitations are undetectable by construction — FR-074b (unlinked split), FR-074e (hashless propagated row), FR-051e (unenforced guard) | Each is an accepted gap with a stated direction of error, recorded rather than hidden. | **Near-hash clustering** was considered for the first and **rejected**: clustering rows against each other by distance is non-transitive (A~B, B~C, A≁C), so it has no well-defined grouping, and merging genuinely distinct creatives is a worse failure than splitting one. **Planning MUST NOT reintroduce it.** |
| A fourth known inaccuracy runs in the over-count direction — FR-083's upward-only rule | Keeps FR-020's never-decreases guarantee **unconditional**, which is the property the feature exists to provide. | A plain overwrite breaches FR-020 whenever the platform revises a day downward. FR-083 carries a **post-implementation verification** to quantify the accepted cost, which is currently unmeasurable because nothing stores per-day figures yet. |

## Locked decisions — this plan proposes none of them

Confirmed against the owner's four prohibitions:

- **No near-hash clustering** — explicitly rejected above and in FR-074b.
- **No epoch partitioning** — the aggregate carries all-time evidence (FR-015).
- **No backfill** — records below the schema version read as absent (FR-043).
- **No migration** — first write **replaces in full** (FR-044); no prior count is
  carried forward (FR-045).

## Phase status

- [x] Phase 0 — research complete → `research.md`
- [x] Phase 1 — design complete → `data-model.md`, `contracts/`, `quickstart.md`
- [x] Constitution Check re-evaluated post-design — verdict unchanged, see
      `research.md` §Post-design re-check
- [ ] Phase 2 — `/speckit.tasks` (not run)
