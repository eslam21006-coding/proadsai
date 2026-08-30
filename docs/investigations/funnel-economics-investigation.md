# Funnel Economics Investigation

**Path in repo:** `docs/investigations/funnel-economics-investigation.md`
**Status:** Investigation only — no code changes. Implementation worktree to be created after approval.
**Date:** 2026-08-30
**Author:** Claude (strategic coordinator)
**Scope:** `src/components/FunnelSettingsForm.tsx`, `functions/src/cpaEconomics.ts`, `functions/src/funnelSettings.ts`, `src/i18n.tsx`

---

## 1. Summary

The funnel settings module produces cost-per-lead and cost-per-acquisition targets that are wrong by a factor of 5–22x on two of the four funnel types. The root cause is not a coding bug — every formula executes exactly as written. The formulas themselves model the funnels incorrectly.

Three structural problems:

1. **Missing funnel stages.** The lead-magnet-to-call funnel multiplies offer price by the close rate, treating every lead as if it reaches a sales call. Two stages (booking and show-up) are absent from the model entirely.
2. **No commission.** Call-closed high-ticket sales carry a sales commission that is never subtracted from revenue before targets are derived.
3. **A hidden, hardcoded margin.** A `0.70` constant silently decides how much of each sale the business keeps. Nobody chose it, the user cannot see it, and it was doing double duty as both a commission buffer and a profit margin.

A fourth, smaller problem: the "offer value too low" advisory watches the offer price, when the number that actually determines whether a funnel is advertisable is the derived lead value.

Worked severity, using the benchmark rates in §4: a coach running a $3,000 program off a lead magnet is currently told that **$630 per lead** is an acceptable acquisition cost. The correct figure is **$12.76**. At $630 they would spend roughly $53,000 to produce a single $3,000 sale.

---

## 2. Current formulas (as implemented)

From `functions/src/cpaEconomics.ts`.

### Constants

| Constant | Value | Role |
|---|---|---|
| `ECONOMIC_CEILING_MULTIPLIER` | `0.70` | Applied to lead value on both free funnels |
| `FULL_FUNNEL_ROAS_FLOOR` | `2.0` | Divides full buyer value on both paid funnels |
| `LOW_VALUE_THRESHOLD` | `9` | Fires the low-value advisory |

### Paid event / paid product

```
rawTargetCpa       = aov / roasTarget
fullBuyerValue     = aov + htoPrice × (htoConversionRate / 100)
maxCpa             = fullBuyerValue / 2.0
effectiveTargetCpa = min(rawTargetCpa, maxCpa)
capApplied         = rawTargetCpa > maxCpa
```

### Free webinar

```
leadValue          = offerPrice × (attendanceRate/100) × (buyRateFromAttendees/100)
effectiveTargetCpl = leadValue × 0.70
```

### Lead magnet → call

```
leadValue          = offerPrice × (leadToCloseRate / 100)
effectiveTargetCpl = leadValue × 0.70
```

---

## 3. Defects

### D-1 — Lead-magnet-to-call omits booking and show-up (critical)

`leadValue = offerPrice × leadToCloseRate` treats the close rate as if it applies to leads. It applies to calls that actually happened. The real chain is lead → booked call → attended call → sale.

At a $3,000 offer and a 30% close rate the current formula yields a lead value of $900 and a target of $630. Correct chain at benchmark rates yields a lead value of $31.89. **Error factor: ~20x.**

### D-2 — No commission on call-closed revenue (critical)

Every high-ticket sale that closes on a call carries a sales commission (10% default per product owner). Gross revenue is used throughout. Targets are therefore inflated by the commission rate on every funnel where the money arrives via a call.

Does **not** apply to self-serve checkout revenue — a $17 or $24 event ticket bought through a checkout page has no commission attached.

### D-3 — Hidden margin constant (major)

`0.70` and `2.0` are invisible to the user and were never a deliberate business choice. They conflate "money set aside for commission" with "profit the business keeps." Once commission becomes its own input (D-2), the remaining multiplier is purely a margin decision and belongs to the user.

### D-4 — Paid event cannot run a front-end loss (major)

The paid-event target is `aov / roasTarget`, with `fullBuyerValue / 2.0` acting only as a **ceiling** — it can pull the target down, never push it up. The `roasTarget` default is `1.0` (break-even).

A paid event is a front-end-loss model by design: lose money on the ticket, profit on the back end. With the default settings the app forbids the strategy it is supposed to support.

**Confirmed by product owner:** the industry anchor for paid events is approximately **0.5 ROAS on front-end ticket revenue** — a controlled loss, not an unbounded one. The existing lower-of-two structure already expresses this correctly; only the default value and the ceiling's inputs are wrong.

### D-5 — Low-value advisory watches the wrong field (minor)

`computeAdvisories` fires `lowValue` when `offerPrice < 9` or `aov < 9`. But a $500 offer sold through a webinar at 25% attendance and 2% purchase produces a lead value of $2.25 and a target of $0.90. The offer price is $500, so no warning fires, and the user receives a target no market can hit.

**Confirmed by product owner:** the trigger should be the **computed target under $0.50**, not the offer price. Sub-$2 lead costs remain achievable in some markets and should not be flagged.

### D-6 — AOV field is unexplained (minor)

The paid funnels ask for "Average order value" with no explanation. A coach selling a $17 ticket with an order bump has a true AOV nearer $24 and will type 17. That understates every downstream number by roughly 30%.

---

## 4. Benchmark rates

Supplied by the product owner from managed spend. These become the helper text under each input field.

| Field | Typical range |
|---|---|
| **Lead magnet → call** | |
| Booking rate (lead → booked call) | 5–10% |
| Show-up rate (booked → attended) | above 65% |
| Close rate on attended calls | 20–25% |
| **Free webinar** | |
| Attendance from registrations | 20–30% |
| Purchase from attendees | 1–3% |
| **Paid event** | |
| Attendance from ticket buyers | 70–80% |
| High-ticket close from attendees | 5–10% |

Midpoints used in every worked example below: booking 7.5%, show-up 70%, close 22.5%, webinar attendance 25%, webinar purchase 2%, event attendance 75%, event close 7.5%. Commission 10%. Margin kept 60%.

---

## 5. Corrected formulas

### New inputs

| Field | Type | Default | Applies to |
|---|---|---|---|
| `bookingRate` | percent | — | lead_magnet_call |
| `showUpRate` | percent | — | lead_magnet_call |
| `eventAttendanceRate` | percent | — | paid_event |
| `eventCloseRate` | percent | — | paid_event |
| `commissionRate` | percent | 10 | lead_magnet_call, free_webinar, paid_event |
| `marginKept` | preset 50 \| 60 \| 70 | 60 | all |

`marginKept` replaces both `ECONOMIC_CEILING_MULTIPLIER` and `FULL_FUNNEL_ROAS_FLOOR`.

```
spendShare = (100 - marginKept) / 100
netFactor  = (100 - commissionRate) / 100
```

`marginKept` is a three-button preset matching the existing `ROAS_OPTIONS` visual pattern — **not** a free-entry number. A non-technical user typing `90` would set an unreachable target and conclude the app is broken.

### Lead magnet → call

```
leadValue    = offerPrice × netFactor × booking × showUp × close
targetCpl    = leadValue × spendShare
```

### Free webinar

```
leadValue    = offerPrice × netFactor × attendance × purchaseRate
targetCpl    = leadValue × spendShare
```

### Paid event

```
rawTargetCpa     = aov / roasTarget                    // roasTarget default 0.5
fullBuyerValue   = aov + htoPrice × netFactor × eventAttendance × eventClose
ceilingCpa       = fullBuyerValue × spendShare
effectiveTarget  = min(rawTargetCpa, ceilingCpa)
```

Commission applies **only** to the `htoPrice` term. Ticket revenue (`aov`) is self-serve and uncommissioned.

### Paid product

```
rawTargetCpa     = aov / roasTarget                    // default unchanged at 1.0
fullBuyerValue   = aov + htoPrice × (htoConversionRate / 100)
ceilingCpa       = fullBuyerValue × spendShare
effectiveTarget  = min(rawTargetCpa, ceilingCpa)
```

No attendance model (no event) and no commission field — see Open Question OQ-1.

---

## 6. Worked examples

### 6.1 Lead magnet → call, $3,000 offer

```
netFactor  = 0.90
leadValue  = 3000 × 0.90 × 0.075 × 0.70 × 0.225 = $31.89
leads per sale = 1 / (0.075 × 0.70 × 0.225)    = 84.66
```

| Margin kept | Cap per lead | Ad spend per sale | Net revenue | Profit | % of gross |
|---|---|---|---|---|---|
| 50% | $15.94 | $1,350 | $2,700 | $1,350 | 45% |
| **60% (default)** | **$12.76** | **$1,080** | **$2,700** | **$1,620** | **54%** |
| 70% | $9.57 | $810 | $2,700 | $1,890 | 63% |

Current production value for this funnel: **$630**. Corrected: **$12.76**.

### 6.2 Free webinar, $3,000 offer

```
leadValue = 3000 × 0.90 × 0.25 × 0.02 = $13.50
cap       = 13.50 × 0.40             = $5.40 per registration
registrations per sale = 1 / (0.25 × 0.02) = 200
```

Spend per sale $1,080 against $2,700 net. Profit $1,620 — identical to 6.1, confirming the margin selector behaves consistently across funnel types.

### 6.3 Paid event, $24 AOV, $3,000 back end

```
rawTargetCpa   = 24 / 0.5                              = $48.00
fullBuyerValue = 24 + 3000 × 0.90 × 0.75 × 0.075       = $175.88
ceilingCpa     = 175.88 × 0.40                         = $70.35
effectiveTarget = min(48.00, 70.35)                    = $48.00
```

Sanity check on 100 ticket buyers:

| Line | Amount |
|---|---|
| Ad spend (100 × $48) | $4,800 |
| Ticket revenue (100 × $24) | $2,400 |
| Attendees (75) → back-end sales (5.6) | — |
| Back-end gross (5.6 × $3,000) | $16,875 |
| Back-end net of 10% commission | $15,188 |
| **Total net revenue** | **$17,588** |
| **Profit** | **$12,788** |

Front end runs at 0.5 ROAS on ticket revenue alone — exactly the industry anchor. Back end carries the funnel.

### 6.4 Low-value advisory

| Scenario | Lead value | Target | Warning |
|---|---|---|---|
| $3,000 webinar | $13.50 | $5.40 | No |
| $500 webinar | $2.25 | $0.90 | No — tight but achievable |
| $200 webinar | $0.90 | $0.36 | **Yes** |

---

## 7. The ROAS path dominates on paid events

With a realistic front-end AOV the ROAS path ($48) is always lower than the ceiling path ($70.35), so **`min()` always selects the ROAS path**. The two new event rate fields are collected, displayed, and have no effect on the target.

This is not a defect and should not be "fixed" by removing the `min()`. A $24 front end cannot justify $70 acquisition on a projection alone; the tighter number is the correct one to ship.

**Recommendation:** the results card renders both numbers with a plain-Fusha line naming which is active and why — to the effect of *"your target is based on ticket revenue, because the back-end value of your event has not been proven yet."* The rate fields then have an honest job: they are visible, and they become the lever that moves once real performance data exists.

**Phase 14 tie-in (future, not this phase):** once the learning loop holds real back-end conversion data for a workspace, the ceiling path can be allowed to win — replacing the user's estimated rates with measured ones. Noted here so the field names and data shape are chosen with that future in mind.

---

## 8. Funnel epoch (concern #2)

### Problem

`settings/current` is a single document, overwritten on save. No history, no version. When a client changes funnel type:

1. New targets apply immediately.
2. The next nightly sync **re-judges every historical ad** against the new target.
3. `hookPerformance` and `visualPerformance` aggregates accumulate `bestVerdictCount` / `worstVerdictCount` permanently and are never recomputed — verdicts recorded under the old economics are already baked in.

Step 3 is the real damage: the RAG learning loop, the product's stated moat, can be silently corrupted by a client changing their offer.

### Recommended design: two tiers, not one

Not every settings change should reset learning. The aggregates track `avgLinkCtr` and `avgCpm`, which are **objective creative signals independent of the target**. Only the verdict counts depend on it.

**Tier 1 — business change. Bumps `businessEpoch`, resets learning.**
- `funnelType` changes
- `offerPrice` or `aov` changes by more than 25%

**Tier 2 — target tuning. Recomputes targets, learning preserved.**
- `marginKept`, `commissionRate`, `roasTarget`, any rate field

### Implementation

- `businessEpoch: number` on the settings doc, starting at 1.
- `verdictEpoch` stamped on each `adPerformance` doc at verdict time.
- Aggregates written under `learning/{epoch}/hookPerformance/...` and `learning/{epoch}/visualPerformance/...`. Epoch-scoped paths mean no reset logic and no data loss — the old epoch's aggregates remain readable.
- RAG injection and the 10-matched-ad gate read the current epoch only.
- Migration: all existing settings docs and aggregates receive `businessEpoch: 1`.

### Correction to earlier guidance

I previously advised that the epoch **must** ship alongside the funnel math because the margin change would alter everyone's targets. Under the two-tier design above that is no longer true — a margin change is Tier 2 and preserves learning. Migration is clean: existing users receive `marginKept: 60` and `commissionRate: 10`, targets drop to correct values, aggregates survive.

**Recommendation is still to ship the epoch in the same phase**, because funnel-type changes are the actual scenario in concern #2 and they remain unprotected until it lands. But this is now a scheduling choice, not a dependency.

---

## 9. Arabic labels (simple Fusha)

| English | Arabic |
|---|---|
| Average order value | قيمة الطلب |
| *hint:* the average a customer pays you | متوسط ما يدفعه العميل الواحد |
| Booking rate | نسبة حجز المكالمات من العملاء المحتملين |
| Show-up rate | نسبة الحضور للمكالمات المحجوزة |
| Close rate on calls that happened | نسبة الإغلاق في المكالمات التي تمت |
| Attendance from ticket buyers | نسبة الحضور من مشتري التذاكر |
| Purchase rate from attendees | نسبة الشراء من الحضور |
| Sales commission | عمولة المبيعات |
| Margin you want to keep | نسبة الربح التي تريد الاحتفاظ بها |
| High ticket price *(renamed from "upsell price")* | سعر العرض عالي القيمة |
| Typical range | المعتاد |

`htoPrice` remains the field name in code. Label change only.

---

## 10. Implementation risk: SC-11 lint guard

The SC-11 guard scans string literals and JSX text for forbidden user-facing terms, **including percentage values**. The benchmark helper text ("typical: 5–10%") may trip it.

The rule exists to stop raw performance metrics (CTR, CPA, CPM) reaching users. Input-field guidance is a different category, and the form already ships percentage-labelled inputs. Minimax must verify whether SC-11 blocks the helper text and, if so, add a scoped allowlist for funnel-settings input hints rather than weakening the guard globally.

Helper text renders as muted text **below** each field, not as an HTML placeholder — a placeholder vanishes the moment the user starts typing, which is precisely when they need it.

---

## 11. Change list

| # | Change | Files |
|---|---|---|
| 1 | Add `bookingRate` + `showUpRate` to lead_magnet_call | form, cpaEconomics, funnelSettings, i18n |
| 2 | Replace paid_event `htoConversionRate` with `eventAttendanceRate` × `eventCloseRate` | form, cpaEconomics, funnelSettings, i18n |
| 3 | Paid event `roasTarget` default → 0.5 | form, cpaEconomics |
| 4 | Add `commissionRate`, default 10, scoped to call-closed revenue | form, cpaEconomics, funnelSettings, i18n |
| 5 | Add `marginKept` preset selector (50/60/70, default 60); remove `ECONOMIC_CEILING_MULTIPLIER` and `FULL_FUNNEL_ROAS_FLOOR` | form, cpaEconomics |
| 6 | Benchmark helper text on every rate field, EN + AR | form, i18n |
| 7 | AOV plain-language hint, EN + AR | form, i18n |
| 8 | Rename "upsell price" → "high ticket price" (label only) | form, i18n |
| 9 | Low-value advisory fires on computed target < $0.50 | cpaEconomics |
| 10 | Results card shows both paths on paid_event with active-path explainer | form, i18n |
| 11 | `businessEpoch` + epoch-scoped learning aggregates | funnelSettings, metaSync/shared, learningAggregates |

---

## 12. Open questions

**OQ-1 — Does paid_product get a commission field?**
Commission was scoped to "high-ticket sales closed on a call." A paid product with a high-ticket upsell may well close that upsell on a call, in which case it needs the field. Currently excluded. **Needs a decision before implementation.**

**OQ-2 — Does the 25% threshold for a Tier 1 epoch bump feel right?**
A coach raising a $3,000 program to $3,500 (17%) would not reset learning; a move to $4,000 (33%) would. Threshold is a judgement call.

**OQ-3 — Team member permissions.**
Product owner has approved editors creating workspaces, linking ad accounts, and connecting/disconnecting Meta. Recommendation: **workspace deletion stays owner-only**, as it is the one irreversible action and it destroys a client's full history. Requires a separate change to `assertNotTeamMember` call sites and is **out of scope for this phase** — tracked separately.

---

## 13. Testing notes

- `cpaEconomics.ts` is a pure module with no Firestore or network dependencies. Every formula in §5 is unit-testable directly, and the §6 worked examples should become fixtures.
- Backend Cloud Functions cannot be verified with `npm run dev` — `saveFunnelSettings` and `getFunnelSettings` changes require a deploy to test.
- Rebuild sequence before deploy: `Remove-Item -Recurse -Force lib` → `npm run build` → `firebase deploy --only functions`.
- Migration must be verified against a workspace holding existing settings **and** existing learning aggregates, confirming targets change while aggregates survive.
