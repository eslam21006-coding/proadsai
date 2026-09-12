# Phase 1 — Data Model

**Feature**: Cumulative Learning for Ad Performance
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05

Field names below are this phase's choice; the **requirements they satisfy** are
cited on each. Everything is **additive** — no field is removed, no collection is
migrated (FR-044, FR-045).

---

## 1. Ad Performance Record — `.../adAccounts/{aid}/adPerformance/{adId}`

One per **ad row**. This is the **storage location** of the ledger, **not** the unit
of evidence (FR-073, FR-016).

### Existing fields — unchanged

`AdDoc` as defined at `functions/src/metaSync/shared.ts:170-211`. Notably
`generationId`, `matchType`, `matchDistance`, `metadataAvailable`, `imageHash`,
`conversions3d`, `cpa3d`, `verdict`, `schemaVersion`.

**`matchType` gains no new value** (FR-074f) — it stays `"auto_hash" | "manual" | null`.

### New fields

| Field | Type | Requirement | Notes |
|---|---|---|---|
| `linkProvenance` | `"manual" \| "direct_auto" \| "propagated" \| null` | FR-074e, FR-074f | **Separate field**, deliberately not a `matchType` value. Precedence: manual > direct_auto > propagated. A `propagated` row keeps `matchType: null`, so the lock at `shared.ts:864-869` does not fire and the row stays re-derivable. |
| `adStatus` | `string \| null` | FR-085 | The already-fetched, currently-discarded `status` (`metaGraph.ts:83`, `:145`). Configured status only — under-detects parent pauses, by design. |
| `sealedTarget` | `number \| null` | FR-001, FR-012a | Inherited from the creative, never sealed independently per row. |
| `sealedFunnelType` | `string \| "unknown" \| null` | FR-004 | |
| `sealedAt` | `number \| null` | FR-005d | Epoch ms. Feeds "earliest-sealing row" (FR-012a). |
| `contributionState` | `"PROVISIONAL" \| "SEALED"` | FR-005a | Per row. The **creative's** state is derived by FR-036c, never stored. |
| `efficiencyRaw` | `number \| null` | FR-002, FR-003 | Unbounded on the row; bounded at 3.0 only in the aggregate (FR-038). `null` = not yet determined; distinguish from FR-006's explicitly-absent (see §5). |
| `ledger` | `ContributionLedgerEntry \| null` | FR-016, FR-046 | §2. `null` = never contributed. |
| `dayAccrual` | `DayAccrual` | FR-081–FR-084a | §3. |

**Retention**: never pruned (FR-066). The reason is recorded at the write site: the
ledger is authoritative for correctness, so deleting the document silently re-enables
double-counting.

---

## 2. `ContributionLedgerEntry` — embedded on the ad row

The **sole mechanism of idempotency** (FR-016, FR-017, FR-018).

| Field | Type | Requirement |
|---|---|---|
| `creativeKey` | `string` | FR-073 — the creative this row contributed under |
| `angleKey` | `string \| null` | FR-016 |
| `patternKey` | `string \| null` | FR-016 |
| `bucket` | `"conversion" \| "other"` | FR-025 |
| `geoTier`, `audienceType` | `string` | FR-025 |
| `contributedValues` | `{ ctrLink, cpm, verdictMark, … }` | FR-016 — every value folded in |
| `measurementInputs` | `object` | FR-011(a) — what the result was derived from; the comparison basis |
| `efficiencyContributed` | `boolean` | FR-079 — write-once marker |
| `efficiencyValue` | `number \| null` | FR-002a — the figure as contributed |
| `schemaVersion` | `number` | FR-042, FR-043 |

**Comparison outcomes** (FR-017): absent → **add**; identical → **no-op**; differs →
**withdraw then add**.

---

## 3. `DayAccrual` — embedded on the ad row

Per-day conversion accrual (FR-081), **bounded** (FR-084a).

| Field | Type | Requirement |
|---|---|---|
| `days` | `{ [isoDate: string]: number }` | FR-083, FR-084 — **only days inside the observed window** |
| `finalisedTotal` | `number` | FR-084a — sum of days that have left the window |
| `finalisedDayCount` | `number` | FR-084a — count of those days; sanity-check and FR-086 input |
| `lastObservedWindow` | `{ since: string; until: string } \| null` | FR-086a — the window bounds of the last sync, for gap arithmetic |

**Rules**:

- Deduplication key is **(ad row id, date)** — the row is the document, the date is
  the map key (FR-084).
- A day inside the window is **revisable upward only** (FR-083): a higher value
  replaces, a lower value is a **no-op**.
- A day leaving the window is **finalised**: added to `finalisedTotal`,
  `finalisedDayCount` incremented, its map entry **deleted** (FR-084a).
- Window membership is **pure date arithmetic**; no stored flag (FR-084a).
- **An absent daily row is `not observed`, never `0`** (FR-085a) — the key is simply
  not written.

**A creative's conversion total** = Σ over its rows of (`finalisedTotal` + Σ `days`).

---

## 4. Creative — **derived, never stored**

The **unit of evidence** (FR-073). It has no document. Recomputed each sync
(FR-074d).

### Derivation, in order

1. **Group** ad rows by `imageHash` (FR-074).
2. **Propagate**: if any row in a group carries a `generationId`, every row in the
   group resolves to it (FR-074). Ties → **manual beats automatic** (FR-074a).
3. **Merge**: any two groups resolving to the same `generationId` become one creative
   (FR-074b).
4. **Attach**: a row with a `generationId` and no `imageHash` joins that generation's
   creative (FR-074c).
5. **Persist** the resolved link back to the row with `linkProvenance: "propagated"`
   (FR-074d, FR-074e).
6. Rows with **neither** key form their own single-member group — **non-contributing**
   (FR-075).

### Derived properties

| Property | Rule | Requirement |
|---|---|---|
| Eligibility | **ANY-ROW** — eligible if ≥1 row satisfies the criteria | FR-074g |
| Aggregation | **ALL-ROWS** — every row's values aggregate once eligible | FR-074g |
| Contribution state | **SEALED if any row is SEALED**; PROVISIONAL only while every row is | FR-036c |
| Sealed target | the **earliest-sealing** row among all rows **now belonging** to the creative | FR-012a |
| Efficiency figure | **aggregate-then-divide** — Σcost ÷ Σresults ÷ sealed target | FR-002a |

**Known limitations, not defects** — two unlinked groups that are one creative never
merge (FR-074b), and a hashless propagated row's attribution is frozen (FR-074e).
Both are undetectable by construction; **do not attempt to close them**.

---

## 5. State — two machines, kept separate

### Contribution state (per row, one-way)

```
PROVISIONAL ──(a target becomes resolvable, FR-005b)──▶ SEALED
     ▲                                                    │
     └────────────── FORBIDDEN (FR-005c) ─────────────────┘
```

### Efficiency figure (per creative) — **not** a state machine, and deliberately so

```
not-yet-determined ──(FR-077 eligibility met)──▶ a number   [once only, FR-079]
                   └─(FR-006: zero results)────▶ explicitly absent  [final]
```

**`not-yet-determined` ≠ `explicitly absent`** (FR-005e): the first may become a
number, the second never will. FR-005e states why no third contribution state was
added — the states describe whether an *evaluation context* exists, while eligibility
is a property of accumulated conversions.

**FR-005c carve-out**: the **first** efficiency write onto a SEALED contribution is
permitted; a **second** is rejected. The guard must test the **specific transition**,
not the SEALED flag — "reject any write to SEALED" blocks FR-077, "allow any write"
readmits everything FR-005c forbids (SC-031).

---

## 6. Hook Angle Record / Visual Pattern Record

`.../hookPerformance/{angleKey}` and `.../visualPerformance/{patternKey}`. Identity
is the angle or pattern **alone**; funnel type is a dimension inside, never part of
identity (FR-028).

| Field | Type | Requirement |
|---|---|---|
| `schemaVersion` | `number` | FR-042 — below current ⇒ read as **absent** (FR-043), replaced **in full** on first write (FR-044) |
| `creativeCount` | `number` | FR-036 — **distinct creatives**, never ad rows |
| `sums` | `{ ctrLinkSum, cpmSum, efficiencySum, … }` | FR-021 — raw, so add/withdraw is exact and drift-free |
| `counts` | `{ contributing, sealedEfficiency, … }` | FR-021, FR-037 |
| `winTotal`, `lossTotal` | `number` | existing verdict counts |
| `byFunnelType` | `{ [type \| "unknown"]: { sums, counts } }` | FR-027, FR-032 |
| `byObjective`, `byGeoTier`, `byAudienceType` | unchanged | FR-025 |
| derived averages | `number` | FR-022 — computed from sums/counts, under existing names |

**Headline totals stay all-funnel** (FR-029), so a reader ignoring the breakdown sees
complete cross-funnel evidence. All contributions are **atomic increments** — a
withdrawal is a **negative delta**, never a recomputation (FR-021, research §D3).

---

## 7. Learning Lease — NEW collection, per account

One document per `(ownerUid, accountId)`. **Distinct from
`metaSyncLeases/{ownerUid}`** (FR-054b, FR-059 as corrected).

| Field | Type | Requirement |
|---|---|---|
| `holderUid` | `string` | FR-057 — release verifies identity (FR-058) |
| `runId` | `string` | FR-057 — unique per run; the fencing token for FR-062 |
| `expiresAtMs` | `number` | FR-057, FR-059 — TTL **15 min** |

Acquired and released **atomically in a single-document transaction** (FR-056). A
plain read-then-write reintroduces the race and is forbidden.

---

## 8. Field-level invariants worth asserting

| Invariant | Requirement | Criterion |
|---|---|---|
| `matchType` ∈ {`"auto_hash"`, `"manual"`, `null`} after a propagating sync | FR-074f | SC-045 |
| A creative appears in aggregates exactly once | FR-073 | SC-008 |
| No count, sum or total ever decreases across syncs | FR-020 | SC-001, SC-003, SC-013, SC-038 |
| `days` map size ≤ window size, independent of account age | FR-084a | SC-050 |
| `efficiencyContributed` transitions false→true at most once | FR-079 | SC-031, SC-035 |
| A propagated row counts as **unmatched** in the existing tallies | FR-072b | SC-025 |
