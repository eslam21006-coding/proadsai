# Contract: `functions/src/cpaEconomics.ts`

**Feature**: `968-funnel-economics-rebuild`
**Module property**: PURE. No Firestore, no network, no `Date.now()` inside derivation (callers pass `computedAt`). FR-047.

Every number below was computed with the specified rounding rule and verified, not hand-derived.

---

## 1. Constants

### Removed (FR-002)

| Constant | Old value | Replaced by |
|---|---|---|
| `ECONOMIC_CEILING_MULTIPLIER` | `0.70` | `spendShare`, derived from the owner's `marginKept` |
| `FULL_FUNNEL_ROAS_FLOOR` | `2.0` | `spendShare`, derived from the owner's `marginKept` |

Neither may be retained as a fallback. The existing test assertions for both (`cpaEconomics.test.ts:26-32`) must be **deleted**, not updated.

### Added

| Constant | Value | Role |
|---|---|---|
| `ECONOMICS_VERSION` | `2` | Stamped onto every `DerivedTargets`. Gates stale pre-phase payloads (R-1). |
| `LOW_VALUE_TARGET_THRESHOLD` | `0.50` | Advisory boundary. Replaces the role of `LOW_VALUE_THRESHOLD = 9`. |
| `ALL_MARGIN_KEPT` | `[50, 60, 70]` | Closed enum. |
| `DEFAULT_MARGIN_KEPT` | `60` | New-record default. |
| `DEFAULT_COMMISSION_RATE` | `10` | New-record default. |

`LOW_VALUE_THRESHOLD = 9` is removed — FR-029 forbids keying the advisory off price.

---

## 2. Shared factors

```
spendShare = (100 - marginKept)  / 100
netFactor  = (100 - commissionRate) / 100
```

| `marginKept` | `spendShare` |
|---|---|
| 50 | 0.50 |
| 60 | 0.40 |
| 70 | 0.30 |

---

## 3. Formulas

### `lead_magnet_call`

```
leadValue = offerPrice × netFactor × (bookingRate/100) × (showUpRate/100)
            × (qualificationRate/100) × (leadToCloseRate/100)
targetCpl = leadValue × spendShare
```

The qualification stage (Phase 13) separates attended calls that turn
out to be qualified from calls that buy — folding that drop-off into
the close rate would conflate two different rates. See
`docs/investigations/funnel-economics-paid-product-form-bug.md` §13
for the rationale.

### `free_webinar`

```
leadValue = offerPrice × netFactor × (attendanceRate/100) × (buyRateFromAttendees/100)
targetCpl = leadValue × spendShare
```

### `paid_event`

```
rawTargetCpa   = aov / roasTarget                                        // default roasTarget 0.5
fullBuyerValue = aov + htoPrice × netFactor × (eventAttendanceRate/100) × (eventCloseRate/100)
ceilingCpa     = fullBuyerValue × spendShare
effectiveTarget = min(rawTargetCpa, ceilingCpa)
capApplied      = rawTargetCpa > ceilingCpa                              // strict
```

### `paid_product`

```
rawTargetCpa   = aov / roasTarget                                        // default roasTarget 1.0 (unchanged)
fullBuyerValue = aov + htoPrice × netFactor
                × (productBookingRate/100) × (productShowUpRate/100)
                × (productQualificationRate/100) × (productCloseRate/100)
ceilingCpa     = fullBuyerValue × spendShare
effectiveTarget = min(rawTargetCpa, ceilingCpa)
capApplied      = rawTargetCpa > ceilingCpa
```

Phase 13 added `productQualificationRate` to the buyer-side chain
(matching the new `qualificationRate` on lead_magnet_call's
lead-side chain above). The `htoConversionRate` slot is dead at read
time on every funnel type as of Phase 11; storage retention
(data-model.md §1) keeps the field on the doc but it never enters
the derivation.

**Commission placement (FR-003, FR-017, FR-019)**: `netFactor` multiplies the **high-ticket term only**, on both paid types. `aov` is self-serve checkout revenue and is never reduced by commission.

**Rounding (FR-048)**: compute the whole chain unrounded, round **once** at the end via `round2`.

---

## 4. Fixtures

### 4.1 Lead magnet → call — report §6.1

Phase 13 inputs: `offerPrice 3000`, `bookingRate 7.5`, `showUpRate 60`, `qualificationRate 50`, `leadToCloseRate 25`, `commissionRate 10`.

`leadValue` = 3000 × 0.90 × 0.075 × 0.60 × 0.50 × 0.25 = **15.1875 → `15.19`**

| `marginKept` | Unrounded target | Expected `effectiveTargetCpl` |
|---|---|---|
| 50 | 7.59375 | **`7.59`** |
| **60 (default)** | 6.075 | **`6.08`** |
| 70 | 4.55625 | **`4.56`** |

> **A-2**: report §6.1 prints `15.94` for the 50 row. Rounding once at the end gives `15.95`; the 60 and 70 rows match the report exactly. The fixture asserts `15.95`.
>
> Phase 13 — show-up benchmark moved from `>65%` to `60%`, the qualification stage (50%) was added, and the close rate now measures QUALIFIED attended calls at 25% (was 20–25% on all attended calls). The default-row anchor moves from $12.76 → $6.08.

**Regression anchor**: the same inputs under the pre-phase formula produced `630`. A test asserting the old value is gone is worth keeping (constitution IX — before/after evidence).

### 4.2 Free webinar — report §6.2

Inputs: `offerPrice 3000`, `attendanceRate 25`, `buyRateFromAttendees 2`, `commissionRate 10`, `marginKept 60`.

`leadValue` = **`13.50`** · `effectiveTargetCpl` = **`5.40`**

### 4.3 Paid event — report §6.3

Inputs: `aov 24`, `htoPrice 3000`, `eventAttendanceRate 75`, `eventCloseRate 7.5`, `commissionRate 10`, `marginKept 60`, `roasTarget 0.5`.

| Output | Expected |
|---|---|
| `rawTargetCpa` | `48.00` |
| `fullBuyerValue` | `175.88` (raw 175.875) |
| `maxCpa` (ceiling) | `70.35` |
| `effectiveTargetCpa` | **`48.00`** |
| `capApplied` | `false` |

Sanity check over 100 ticket buyers: spend `4800`, ticket revenue `2400`, back-end sales `5.625`, back-end gross `16875`, net of commission `15187.50`, **total net `17587.50`**, **profit `12787.50`**. Matches report §6.3.

### 4.4 Paid product — OQ-1 override

Phase 13 inputs: `aov 100`, `htoPrice 3000`, `productBookingRate 20`, `productShowUpRate 60`, `productQualificationRate 50`, `productCloseRate 25`, `commissionRate 10`, `marginKept 60`, `roasTarget 1.0`.

| Output | Expected |
|---|---|
| `rawTargetCpa` | `100.00` |
| `fullBuyerValue` | **`140.50`** |
| `maxCpa` | `56.20` |
| `effectiveTargetCpa` | **`56.20`** |
| `capApplied` | `true` |

**This fixture discriminates the OQ-1 placement.** Three implementations give three different `fullBuyerValue`s:

| Implementation | `fullBuyerValue` | Verdict |
|---|---|---|
| Commission on high-ticket term only | **`140.50`** | ✅ correct (FR-019) |
| Commission on `aov` too | `130.50` | ❌ violates FR-003 |
| No commission (report's original §5) | `145.00` | ❌ violates the OQ-1 override |

### 4.4a Paid product — second-discriminator fixture (Phase 11 §B)

Discriminator against accidental chain-collapse or stage-drop regressions. Inputs chosen so the chain product is non-round (0.005625), so dropping one stage zeroes the HTO term and a regression that halves one stage still fails:

`aov 100`, `htoPrice 3000`, `productBookingRate 7.5`, `productShowUpRate 60`, `productQualificationRate 50`, `productCloseRate 25`, `commissionRate 10`, `marginKept 60`, `roasTarget 1.0`.

| Output | Expected |
|---|---|
| Chain product | `0.075 × 0.60 × 0.50 × 0.25 = 0.005625` |
| HTO contribution | `3000 × 0.9 × 0.005625 = 15.1875` |
| `fullBuyerValue` | **`115.19`** |

Dropping any stage (`productBookingRate=0`, `productShowUpRate=0`, `productQualificationRate=0`, or `productCloseRate=0`) zeroes the HTO term and collapses `fullBuyerValue` to `aov = 100`. Doubling `productBookingRate` from `7.5` to `15` doubles the HTO contribution (multiplicative, not additive).

### 4.5 Advisory — report §6.4

Webinar at `attendanceRate 25`, `buyRateFromAttendees 2`, `commissionRate 10`, `marginKept 60`.

| `offerPrice` | `leadValue` | Target | Advisory |
|---|---|---|---|
| 3000 | 13.50 | `5.40` | silent |
| 500 | 2.25 | `0.90` | silent |
| 200 | 0.90 | `0.36` | **fires** |

### 4.6 Advisory boundary — FR-028a

Assert directly against `computeAdvisories` with a constructed derived payload; the module is pure, so no funnel inputs are needed.

| Raw target | `round2` | Advisory | Note |
|---|---|---|---|
| `0.4999` | `0.50` | **silent** | Tests the displayed value, not the raw one |
| `0.50` | `0.50` | **silent** | Strict inequality — equality does not warn |
| `0.4949` | `0.49` | **fires** | Paired control proving the boundary is live |

### 4.7 Version gate — R-1

| Input `derived` | `getEffectiveTarget` |
|---|---|
| `{ economicsVersion: 2, free: { effectiveTargetCpl: 12.76, … } }` | `12.76` |
| `{ free: { effectiveTargetCpl: 630, … } }` *(no stamp — pre-phase)* | **`null`** |
| `{ economicsVersion: 1, free: { … } }` | **`null`** |
| `{ economicsVersion: 2 }` *(stamped, no branch)* | `null` |

The second row is the load-bearing one: it is the exact shape sitting on every existing production document.

### 4.8 Margin scaling — SC-005

At fixed inputs, moving `marginKept` 60 → 50 multiplies the margin-driven ceiling by exactly `1.25`; 60 → 70 by exactly `0.75`. Assert on both free types and on `maxCpa` for both paid types. Where a paid funnel's `effectiveTargetCpa` is set by `rawTargetCpa`, it must **not** move — ticket revenue is independent of retained margin.

---

## 5. Validation

Unchanged in style — throw on invalid input.

| Input | Rule |
|---|---|
| Any price | finite, `>= 0` |
| Any rate | finite, `0 <= r <= 100` |
| `commissionRate` | finite, `0 <= c <= 100` (FR-027). `0` and `100` both valid. |
| `marginKept` | must be exactly `50`, `60`, or `70` (FR-026) |
| `roasTarget` | unchanged closed enum `1.0 | 0.65 | 0.5` |

### Edge behaviour

| Case | Expected |
|---|---|
| `commissionRate = 100` | `netFactor = 0` → lead value `0`, target `0.00`, advisory fires. Paid types keep their `rawTargetCpa` path. No divide-by-zero, no negative target. |
| `commissionRate = 0` | No deduction. Targets rise by exactly the commission's former share. |
| Any rate `= 0` | Chain collapses to `0`; advisory fires. Valid input, not an error. |
| `offerPrice = 0` | Target `0.00`; advisory fires. |
| `rawTargetCpa === ceilingCpa` | `capApplied = false` (strict inequality, existing convention) |

---

## 6. Public surface

```ts
export const ECONOMICS_VERSION: 2;
export const LOW_VALUE_TARGET_THRESHOLD: 0.50;
export const ALL_MARGIN_KEPT: ReadonlyArray<50 | 60 | 70>;
export const DEFAULT_MARGIN_KEPT: 60;
export const DEFAULT_COMMISSION_RATE: 10;

export type MarginKept = 50 | 60 | 70;

export function deriveTargetCpa(input: PaidFunnelInputs): PaidDerived;
export function deriveTargetCplFreeWebinar(input: FreeWebinarInputs): FreeDerived;
export function deriveTargetCplLeadMagnetCall(input: LeadMagnetCallInputs): FreeDerived;
export function deriveAll(input: FunnelInputs, computedAt: number): DerivedTargets;
export function computeAdvisories(input: FunnelInputs, derived: DerivedTargets): Advisories;  // SIGNATURE CHANGED
export function getEffectiveTarget(derived: DerivedTargets): number | null;                    // BEHAVIOUR CHANGED
export function getCostMetric(derived: DerivedTargets): "CPA" | "CPL" | null;                  // unchanged
export function round2(n: number): number;                                                     // unchanged
export function spendShare(marginKept: 50 | 60 | 70): number;                                  // Phase 2 helper (FR-001)
export function netFactor(commissionRate: number): number;                                     // Phase 2 helper (FR-003)
```

**Two breaking changes to note for callers:**

- `computeAdvisories` now needs the derived targets, because the low-value advisory keys off the computed target rather than the entered price (FR-028). Every call site must pass them.
- `getEffectiveTarget` returns `null` for any payload lacking `economicsVersion: 2`. This is the mechanism, not a side effect — see R-1.
