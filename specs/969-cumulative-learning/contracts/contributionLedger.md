# Contract — `functions/src/learning/contributionLedger.ts`

**Pure.** Requirements: FR-016, FR-017, FR-018, FR-046, FR-013, FR-013a, FR-087.

## Exports

```
decideContribution(desired: Contribution|null, recorded: ContributionLedgerEntry|null)
  : ContributionDecision
```

`ContributionDecision` = `{ kind: "add"|"noop"|"withdraw_then_add"|"withdraw_only" }`
plus the deltas to apply.

## Decision table (FR-017)

| recorded | desired | outcome |
|---|---|---|
| absent | present | **add** |
| present, identical | same | **no-op** — nothing written, no count moves |
| present, differs | present | **withdraw then add** |
| present | absent (no longer eligible) | **withdraw only** — but never for metadata loss (FR-014) |

## The recomputation rule (FR-087) — the caller MUST distinguish

| Trigger | Row set | Efficiency figure |
|---|---|---|
| Re-attribution (FR-011(b)) | unchanged | **carried across unchanged** — FR-087(i) |
| Merge (FR-074b) | changed (union) | **recomputed** over the union — FR-087(ii) |

Treating them as one operation gets one of them wrong in a way no aggregate total
reveals.

**Merge shape** (FR-013a): withdraw **both**, recompute against the **earliest**
sealed target (FR-012a), add **one**. Both withdrawals complete **before** the
addition, so no intermediate state counts the creative twice.

## Invariants

- Processing the same payload N times is identical to processing it once
  (FR-018, SC-002).
- Every delta is exact — computed from raw sums and counts, never recomputed from
  history, so repeated add/withdraw accumulates **zero** drift (FR-021, SC-002).
- Metadata loss (the delete cascade) yields **no withdrawal**, only "contribute no
  further" (FR-014).
- A row with no recorded entry is treated as never having contributed (FR-046);
  absence is a statement about the **row**, never about the creative.
