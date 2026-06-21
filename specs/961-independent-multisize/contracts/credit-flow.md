# Contract: Credit Flow (Multi-Size)

Covers FR-012, FR-012a, FR-013, FR-014, FR-015, FR-011 and SC-005.

## Pricing

- 5 credits per **rendered design** (per image). Text generation (hooks/concepts) unchanged at 1 credit.
- A "design" = one (scope-item × size). Same-size no-ops are excluded from cost.

## Cost computation (frontend, pre-commit)

```text
designs   = anchorCount + variantCount         // across all selected sizes & items, minus no-ops
totalCost = designs × 5
```

- **Single**, 2 sizes → 2 designs → 10 credits.
- **Single** generate then resize → +1 design → +5 credits.
- **Batch 4 × 2 sizes** → 8 designs → 40 credits.
- **Carousel 5 slides × resize to 1 new size** → 5 designs → 25 credits.

The total MUST be displayed before the user commits (FR-012). Reuses the existing `totalCreditCost` UI (`App.tsx:2582`, cost calc `App.tsx:7090`), generalized so additional sizes count as full designs (× `generateImage`).

## Affordability gate (both layers)

| Layer | Rule |
|---|---|
| Frontend (FR-013) | If `userCredits < totalCost` → block Generate/Resize, show "Need X credits, you have Y". Nothing is requested. |
| Backend (PRE-6) | Each variant transaction guards owner balance ≥ 5; the anchor path keeps its existing guard. |

Net effect: nothing starts if the whole request is unaffordable; per-variant guards prevent overspend under races.

## Charge + refund lifecycle (per design)

```text
affordability ok ──► charge 5 upfront (transaction) ──► generate
                                                          ├─ success ──► keep charge (net 5)
                                                          └─ failure ──► refund 5 (net 0)   (FR-015)
no-op (same ratio already succeeded) ──► charge 0 (net 0)                                   (FR-011)
```

- **Net invariant (SC-005)**: total net credits charged = `5 × successfully rendered designs`.
- **Idempotency (FR-014)**: key `genId:scope:itemIndex:targetRatio`. Retrying a failed design reuses the key; an already-`succeeded` key short-circuits to no-op.
- **Reconciliation (frontend)**: after a run, `setUserCredits(prev + (totalReserved − sum(netCharged)))` to reflect refunds/no-ops — mirrors the existing reflow reconciliation (`App.tsx:5478`).

## Anchor accounting

- The anchor design is charged by the existing `serverGenerateFinalAd` path (`generateImage: 5`), unchanged.
- Variants are charged by `generateSizeVariant`. The frontend `totalCost` includes both so the user sees one number.

## Test assertions

- 1 size selected → behaves as today (no variant charge). (Edge: single size)
- 3 sizes, all succeed → net 15. (SC: all three)
- 3 sizes, 1 variant fails → net 10 (failed refunded). (FR-015)
- Resize to existing size → net 0. (FR-011)
- Insufficient credits for full request → blocked, net 0, no calls fired. (FR-013)
- Retry failed variant → exactly one additional 5-credit charge on eventual success, never two. (FR-014)
