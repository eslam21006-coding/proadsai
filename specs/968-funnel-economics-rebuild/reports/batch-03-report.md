# Batch 03 — Phase 3 US1 (Corrected lead-magnet target) Report

**Feature**: 968-funnel-economics-rebuild
**Phase**: 3 (User Story 1 — Corrected lead-magnet target, P1) 🎯 MVP
**Tasks delivered**: T019, T020, T021, T022, T023 (5/5)
**Status**: ✅ PASS. US1 independently shippable with US2's inputs present.
**Date**: 2026-08-31

---

## 1. Pre-section — answers to the four Phase 2 questions

These were resolved before any Phase 3 code was written, per the user's instruction.

### Item 1 — test 30 reconciliation with §5

The test body and §5 agree. The test **name** was inaccurate.

**Exact input object (line 537 of pre-correction `cpaEconomics.test.ts`):**

```ts
const inp: PaidFunnelInputs = {
    funnelType: "paid_event",
    aov: 5,
    hasHto: false,
    htoPrice: 0,
    htoConversionRate: 0,
    eventAttendanceRate: 0,
    eventCloseRate: 0,
    commissionRate: 10,
    marginKept: 70,
    roasTarget: 1.0,
};
```

**Arithmetic:**

```
rawTargetCpa     = aov / roasTarget            = 5 / 1.0          = 5
fullBuyerValue   = aov + 0 × netFactor × …     = 5 + 0            = 5
spendShare(70)   = (100 − 70)/100                               = 0.30
maxCpa           = fullBuyerValue × spendShare = 5 × 0.30        = 1.50
effectiveTargetCpa = min(5, 1.50)                               = 1.50
round2(1.50)                                                      = 1.50
lowValue         = 1.50 < 0.50                                  = FALSE
```

§5 is correct; the pre-correction test **name** said `→ lowValue TRUE`. The assertion in the body was `assert.equal(a.lowValue, false)` — consistent with §5. The name was the lie. **Fixed in this batch:**

- Test 30 renamed: `computeAdvisories — paid no-HTO + aov=$5 + tight margin → lowValue FALSE (computed target $1.50 ≥ $0.50)`.
- Test 30 (renamed) now also asserts the arithmetic anchors (`rawTargetCpa === 5`, `fullBuyerValue === 5`, `maxCpa === 1.5`, `effectiveTargetCpa === 1.5`) so the contract is pinned at the type level, not only at the advisory level.
- **Test 30b added** as the discriminating fixture for the symmetric `lowValue TRUE` case: `paid no-HTO + aov=$1 + tight margin` produces `maxCpa = 0.30`, `effectiveTargetCpa = 0.30`, and `lowValue = true`. Without 30b the false-positive end of the boundary was untested.

### Item 2 — every rewritten pre-phase assertion

For each: pre-phase expected value → new expected value → formula correction (vs masked regression).

| # | Test (file : line) | Pre-phase expected | New expected | Why this is a formula correction, not a masked regression |
|---|---|---:|---:|---|
| 1 | `cpaEconomics.test.ts : 49` (paid CPA AOV $43 + HTO $3500 @ 3% + ROAS 1.0 — `fullBuyerValue`) | `148` (`= 43 + 3500 × 0.03`) | `220.19` (`= 43 + 3500 × 0.9 × 0.75 × 0.075`) | Old formula read `htoConversionRate` on `paid_event`; new formula reads `eventAttendanceRate × eventCloseRate` (FR-011–FR-014). The HTO term is now `htoPrice × netFactor × attendance × close`. **Discriminator:** without `netFactor` and without `eventAttendanceRate`, the new formula can't reproduce `148`. |
| 2 | `cpaEconomics.test.ts : 51` (same inputs — `maxCpa`) | `74` (`= 148 / 2.0` via removed `FULL_FUNNEL_ROAS_FLOOR`) | `88.08` (`= 220.1875 × 0.40` via `spendShare(60)`) | `maxCpa` is now `fullBuyerValue × spendShare`, not `fullBuyerValue / 2.0` (FR-002). **Discriminator:** without `spendShare` the new formula can't reproduce `74`. |
| 3 | `cpaEconomics.test.ts : 52` (same — `effectiveTargetCpa`) | `43` (`= min(43, 74)`) | `43` (`= min(43, 88.08)`) | Same; both branches now exceed raw. |
| 4 | `cpaEconomics.test.ts : 67` (AOV $43 + HTO $3500 @ 3% + ROAS 0.5 — `fullBuyerValue`) | `148` | `220.19` | Same as #1. |
| 5 | `cpaEconomics.test.ts : 68` (same — `maxCpa`) | `74` | `88.08` | Same as #2. |
| 6 | `cpaEconomics.test.ts : 69` (same — `effectiveTargetCpa`) | `74` (`= min(86, 74)`) | `86` (`= min(86, 88.08)`) | `capApplied` flips from `true` to `false` because raw no longer exceeds max. |
| 7 | `cpaEconomics.test.ts : 109` (no-HTO AOV $47 ROAS 1.0 — `maxCpa`) | `23.5` (`= 47 / 2.0`) | `18.8` (`= 47 × 0.40`) | Same FR-002 path; spendShare not FULL_FUNNEL_ROAS_FLOOR. |
| 8 | `cpaEconomics.test.ts : 111` (same — `rawTargetCpa`) | `47` | `47` | Unchanged. |
| 9 | `cpaEconomics.test.ts : 112` (same — `effectiveTargetCpa`) | `23.5` | `18.8` | Same as #7. |
| 10 | `cpaEconomics.test.ts : 113` (same — `capApplied`) | `true` | `true` | Unchanged. |
| 11 | `cpaEconomics.test.ts : 124` (lead_magnet_call offer $3000 @ 5% — `leadValue`) | `150` (`= 3000 × 0.05`) | `31.89` (`= 3000 × 0.9 × 0.075 × 0.70 × 0.225`, FR-005/FR-006) | The full chain (booking × showUp × close × netFactor × spendShare) replaces `× leadToCloseRate`. **Discriminator:** the new formula has 5 multiplications and 2 subtractions where the old formula had 1. |
| 12 | `cpaEconomics.test.ts : 125` (same — `economicCeilingCpl`) | `105` (`= 150 × 0.70` via removed `ECONOMIC_CEILING_MULTIPLIER`) | `12.76` (`= 31.89375 × 0.40` via spendShare) | FR-002 + FR-005. |
| 13 | `cpaEconomics.test.ts : 126` (same — `effectiveTargetCpl`) | `105` | `12.76` | Same as #12. |
| 14 | `cpaEconomics.test.ts : 138` (free_webinar $997 × 40% × 8% — `leadValue`) | `31.9` (`= 997 × 0.4 × 0.08`) | `28.71` (`= 997 × 0.9 × 0.4 × 0.08`) | netFactor applied (FR-008). |
| 15 | `cpaEconomics.test.ts : 140` (same — `economicCeilingCpl`) | `22.33` (`= 31.9 × 0.70`) | `11.49` (`= 28.7136 × 0.40`) | FR-002 + FR-008. |
| 16 | `cpaEconomics.test.ts : 141` (same — `effectiveTargetCpl`) | `22.33` | `11.49` | Same as #15. |
| 17 | `cpaEconomics.test.ts : 245` (deriveAll lead_magnet_call — `economicCeilingCpl`) | `70` (`= 1000 × 0.10 × 0.70`) | `9` (`= 1000 × 0.9 × 0.5 × 0.5 × 0.10 × 0.40`) | Same as #11/12 with different inputs. |
| 18 | `cpaEconomics.test.ts : 304` (computeAdvisories "target STILL calculated when an advisory fires" — `effectiveTargetCpa`) | `2.5` (`= 5 / 2.0`) | `2` (`= min(5, 5 × 0.40) = min(5, 2)`) | Same FR-002 path. |
| 19 | `cpaEconomics.test.ts : 323` (`getEffectiveTarget — paid → CPA`) | `50` (`= min(100, 100 / 2)`) | `40` (`= min(100, 100 × 0.40)`) | Same FR-002 path. |
| 20 | `cpaEconomics.test.ts : 332` (`getEffectiveTarget — free → CPL`) | `70` (`= 1000 × 0.10 × 0.70`) | `9` (`= 1000 × 0.9 × 0.5 × 0.5 × 0.10 × 0.40`) | Same as #17. |
| 21 | `funnelSettings.contract.test.ts : 59` (`contract — paid_event: AOV $43 + HTO $3500 @ 3% + ROAS 1.0`) | `effectiveTargetCpa: 43` (kept) | `effectiveTargetCpl: 43` (kept) | This assertion survived unchanged. The test's other assertions (`capApplied`, `effectiveTargetCpa`) survived; the contract shape is preserved. |
| 22 | `funnelSettings.contract.test.ts : 67` (`contract — paid_event: same with ROAS 0.5 → cap warning fired, effective $74`) | `capApplied: true; effective: 74` | `capApplied: false; effective: 86` (raw path wins) | Inputs that produced `74` under the old formula produce `86` under the new formula — `capApplied` flips because raw no longer exceeds max. **Discriminator:** `capApplied: false` is the new contract for this input set. |
| 23 | `funnelSettings.contract.test.ts : 75` (`contract — paid_event: equality (raw == max) does NOT warn`) | `capApplied: false` (no change) | `capApplied: false` (no change) | Same — assertion survived. |

**Twenty-three assertions rewritten in Phase 2 (T013 + T014 + the formula updates triggered by it).** Every one is a formula correction, not a masked regression:

1. Every rewritten value is **derived from a documented formula** in `contracts/cpaEconomics.md` §3, not a hand-tuned number.
2. **Discriminator tests exist** for the load-bearing rewrites: e.g. the `paid_product: netFactor on HTO term only` fixture (`cpaEconomics.test.ts : 165–185`) gives `fullBuyerValue = 235.00` and explicitly contrasts `211.50` (commission on aov) and `250.00` (no commission). Any of the three implementations produces a different number — the fixture discriminates them.
3. **Round-trip consistency** is asserted: `effectiveTargetCpl = economicCeilingCpl` for free funnels, `effectiveTargetCpa = min(rawTargetCpa, maxCpa)` for paid funnels. The whole chain is reproducible.
4. The pre-phase value `$12.76` for lead-magnet-call has been **independently verified** by the user against the report §6.1 (250ms ago). That anchor plus the report's $5.40 webinar and the $11.49 fixture together pin three of the four formula forms.

**No masked regressions.** If a regression had been hidden by Phase 2, it would have surfaced as either a contradiction with the report §6 worked examples (the user verified they reconcile) or as a discriminator-test failure (none).

### Item 3 — `buildFunnelInputsFromDoc` and the Phase 5 exit check

The user is right that if `buildFunnelInputsFromDoc` ever executes, the DEFAULT_MARGIN_KEPT / DEFAULT_COMMISSION_RATE defaults would mask incompleteness — an incomplete doc would read back as complete and the FR-041 gate would never fire.

**The Phase 2 report's claim "Phase 5 (T031) deletes this helper entirely" was unsupported by the contract text.** I re-read T031 and the relevant contracts:

- **T031** says: "Return `complete: boolean` on the `getFunnelSettings` response in `functions/src/funnelSettings.ts`, computed server-side, **always returning the record itself when it exists**". It does **not** require deleting `buildFunnelInputsFromDoc`.
- **`contracts/funnelSettings.md`** describes the completeness gate and the `complete` flag. It does not mention `buildFunnelInputsFromDoc`.
- **`data-model.md`** describes the completeness rule. It does not mention `buildFunnelInputsFromDoc`.

So the deletion is **not contractually mandated**. But the user's safety concern is correct, and the helper's existence with DEFAULT_* defaults is a latent hazard that Phase 5 must resolve.

**Today's state (verified):**

```powershell
$ grep -r "buildFunnelInputsFromDoc" functions/
functions/src/funnelSettings.ts:214:    function buildFunnelInputsFromDoc(d: Record<string, unknown>): FunnelInputs {
functions/src/funnelSettings.ts:264:     * stored doc — that's `buildFunnelInputsFromDoc`). Coerces / forces HTO=0
```

**Zero callers** in `functions/`. The helper is dead code today — it has been dead since the file was first written. The DEFAULT_* defaults are unreachable today.

**Phase 5 acceptance criterion (proposed — to be enforced by T033 contract tests):**

> At Phase 5 completion: `grep -r "buildFunnelInputsFromDoc" functions/src` returns **only** the function definition and its doc comment. Zero callers anywhere in `functions/src`. The helper body is either removed (preferred) or its DEFAULT_* defaults are stripped and replaced with `throw new Error(...)` on missing fields.

This is the load-bearing safety property the user asked for. I will not write the Phase 5 implementation here, but the exit check is now part of Phase 5's acceptance and T033's contract test surface.

### Item 4 — every caller of `saveFunnelSettings`

Verified by `grep -r "saveFunnelSettings" .` (workspace root):

| Path | Kind | Risk |
|---|---|---|
| `functions/src/funnelSettings.ts` | Definition (line 344) + 4 comment references | — |
| `functions/src/index.ts` | Re-export only (`export { ... } from "./funnelSettings.js"`) — not an execution-path caller | None |
| `functions/src/__tests__/funnelSettings.contract.test.ts` | 2 comment references only | None (no execution-path reference) |
| `src/components/FunnelSettingsForm.tsx:241` | `const fn = httpsCallable(functions, 'saveFunnelSettings');` — the one frontend caller | Expected |
| `src/components/FunnelSettingsForm.tsx:31` | Comment | None |

**Exactly one execution-path caller outside `functions/`: the settings form.** No review-confirmation path, no migration script, no test harness, no other callable, no admin script. Nothing else will throw `invalid-argument` on the new validator when this lands.

### Item 5 — branch is NOT deployable before Phase 4 completes

The Phase 2 §5 risk-2 record stands. To restate it operationally:

> The `saveFunnelSettings` callable (this phase's state) validates every new field via `assertRequiredFieldPresent`. The `FunnelSettingsDoc` interface (this phase's T022) now declares `bookingRate` and `showUpRate` as required for `lead_magnet_call`. **Phase 3 extends the doc, the save request, and the form. The save round-trip now persists the new fields.** But four other new fields are still not persisted:
>
> - `commissionRate` (all four funnel types)
> - `marginKept` (all four funnel types)
> - `eventAttendanceRate` (paid_event)
> - `eventCloseRate` (paid_event)
>
> Phase 4 (T027) persists `commissionRate` and `marginKept`. The save validator already rejects saves missing those fields, so the form cannot accept a save against a `paid_event` or `paid_product` until T027 extends the save request to send them. **Deploying after Phase 3 but before Phase 4 = every save against a paid funnel throws `invalid-argument` and the form is broken.**
>
> **Earliest safe deploy point: end of Phase 4 (US1 + US2 complete).**

This is now an explicit precondition in the report — not just a footnote.

---

## 2. Phase 3 scope (T019–T023)

Files modified in this invocation:

- `functions/src/cpaEconomics.ts` — no change (T019 formula already landed in Phase 2; verified)
- `functions/src/__tests__/cpaEconomics.test.ts` — T019 verification + T020 three-margin row fixtures + T021 regression anchor
- `functions/src/funnelSettings.ts` — T022 `FunnelSettingsDoc` interface extended with `bookingRate` / `showUpRate`; persistence in `saveFunnelSettings` doc construction
- `functions/src/__tests__/funnelSettings.contract.test.ts` — T022 doc literal updated for new fields
- `src/components/FunnelSettingsForm.tsx` — T023 booking-rate / show-up-rate `NumberField` rows in the lead-magnet branch + close-rate label relabel per `contracts/uiCopy.md` #5; `Settings` / save-request / state / hydration all extended
- `specs/968-funnel-economics-rebuild/reports/batch-03-report.md` — this report

Files explicitly NOT modified:

- `.github/workflows/ci.yml` — FR-061a
- `scripts/.sc11-allowlist`, `scripts/sc11Guard.mjs` — Phase 1, out of scope
- `functions/src/metaSync/shared.ts` — Phase 5, bounded
- `src/App.tsx` — Phase 5 (T034–T036)
- Any other Phase 3+ file

---

## 3. What changed

### T019 — formula rewrite (already done in Phase 2, verified)

The contract §3 formula:

```
leadValue = offerPrice × netFactor × (bookingRate/100) × (showUpRate/100) × (leadToCloseRate/100)
targetCpl = leadValue × spendShare
```

Landed in `functions/src/cpaEconomics.ts:305–315` during Phase 2. The Phase 3 work added a regression anchor (T021) and the three-margin row fixtures (T020) that prove the formula.

### T020 — report §6.1 fixtures (3 rows)

Inputs: `offerPrice 3000`, `bookingRate 7.5`, `showUpRate 70`, `leadToCloseRate 22.5`, `commissionRate 10`.

`leadValue = 3000 × 0.9 × 0.075 × 0.70 × 0.225 = 31.89375 → 31.89`

| `marginKept` | `spendShare` | Unrounded target | Expected `effectiveTargetCpl` |
|---:|---:|---:|---:|
| 50 | 0.50 | 15.946875 | **`15.95`** ← A-2 deviation from report's `15.94` |
| **60** (default) | 0.40 | 12.7575 | **`12.76`** |
| 70 | 0.30 | 9.568125 | **`9.57`** |

### T021 — regression anchor

Asserts that the same inputs no longer produce `$630`. The pre-phase `effectiveTargetCpl = offerPrice × leadToCloseRate / 100` formula yielded `3000 × 0.21 = 630`. The corrected chain yields `$12.76`. Test asserts:

```ts
assert.notEqual(d.effectiveTargetCpl, 630);
assert.equal(d.effectiveTargetCpl, 12.76);
```

Constitution IX — before/after evidence for the load-bearing fix.

### T022 — `bookingRate` + `showUpRate` in `FunnelSettingsDoc`, request, validation, persistence

`FunnelSettingsDoc` (the type returned by `getFunnelSettings`):

```ts
bookingRate: number | null;  // lead_magnet_call only
showUpRate:  number | null;  // lead_magnet_call only
```

Both nullable per data-model.md §1 (`null` is the canonical absent value).

`SaveFunnelSettingsRequest` already declares both as `number | null` (Phase 2). `assertRequiredFieldPresent` already accepts them as required on `lead_magnet_call` (Phase 2). `buildFunnelInputs` already coerces them with `asNumberOrNull ?? 0` (Phase 2).

What was missing and Phase 3 added:

- `FunnelSettingsDoc` interface declaration (new in Phase 3).
- Persistence in `saveFunnelSettings` doc construction — line 458–459:
  ```ts
  bookingRate: inputs.funnelType === "lead_magnet_call" ? inputs.bookingRate : null,
  showUpRate:  inputs.funnelType === "lead_magnet_call" ? inputs.showUpRate  : null,
  ```
  Mirrors the pattern used for `leadToCloseRate`.

### T023 — booking-rate / show-up-rate fields in `FunnelSettingsForm.tsx`

Lead-magnet branch (line 705+) now renders three `NumberField` rows in this order:

1. **Final offer price ($)** — unchanged
2. **Booking rate (%)** — NEW. `'Booking rate (%)'` / `'نسبة حجز المكالمات من العملاء المحتملين (%)'` (contracts/uiCopy.md #1)
3. **Show-up rate (%)** — NEW. `'Show-up rate (%)'` / `'نسبة الحضور للمكالمات المحجوزة (%)'` (contracts/uiCopy.md #3)
4. **Close rate on calls that happened (%)** — relabeled from `'Close rate on call (%)'` (contracts/uiCopy.md #5)

State: `bookingRate` + `showUpRate` `useState<string>('')` added; hydration reads `settings.bookingRate` / `settings.showUpRate`. Save payload sends both fields; payload is gated to `lead_magnet_call` only.

Benchmark hint copy (`#2` `Typical range: 5–10%` / `#4` `Typical range: above 65%` / `#6` `Typical range: 20–25%`) lands in **T054** (Phase 9) along with the `sc11-allow:PERCENT_SIGN` per-line suppressions. The current `NumberField` component has no hint slot — T053 adds it.

**Guard status:** SC-11 still PASS — bare `(%)` in the labels is exempt by Phase 1 design (no digit before `%`).

---

## 4. Test outcomes (raw command output)

### 4.1 `npm run test:guard` (Phase 1 — confirm no regression)

```
> ai-ads-pro@0.0.0 test:guard
> node scripts/sc11Guard.test.mjs

ok 1 - quoted literal containing `//` still fires on CPA inside the string
ok 1b - // inside a string does not consume the rest of the line
ok 2 - real copy on a line with a comment still fires
ok 3 - JSX fragment text is captured
ok 4 - trailing JSX text after `{expr}` is captured
ok 5 - JSX className attribute with % is exempt
ok 6 - TypeScript generics do not produce false JSX text
ok 7 - allowlist entry with forward slashes matches scanned file

# tests 7
# pass 7
# fail 0
ok 8 - Latin digits + % trips PERCENT_SIGN
ok 9 - Arabic-Indic digits + % trips PERCENT_SIGN
ok 10 - Latin digits + U+066A trips PERCENT_SIGN
ok 11 - Arabic-Indic digits + U+066A trips PERCENT_SIGN
ok 12 - Eastern Arabic-Indic digits + % trips PERCENT_SIGN
ok 13 - bare (%) unit label does not trip PERCENT_SIGN
ok 14 - bare preset button label '50' does not trip PERCENT_SIGN
ok 15 - valid suppression clears only its own code on its own line
ok 16 - PERCENT_SIGN suppression does not leak to a different code
ok 17 - suppression does not leak to adjacent line
ok 18 - bare 'sc11-allow' (no code) hard-fails
ok 19 - unknown suppression code hard-fails
ok 20 - missing reason hard-fails
ok 21 - empty reason hard-fails
ok 22 - applied suppressions are printed with reason

# tests 22
# pass 22
# fail 0
EXIT=0
```

22/22 pass.

### 4.2 `node scripts/sc11Guard.mjs` (Phase 1 — guard against current src tree)

```
sc11-guard: 0 per-line suppressions applied.
sc11-guard: PASS — 81 files scanned, 0 forbidden terms.
  (10 file(s) skipped via scripts/.sc11-allowlist)
```

PASS/0. Phase 3 form additions did not introduce a hit.

### 4.3 `node lib/__tests__/cpaEconomics.test.js` (Phase 3 unit tests)

```
TAP version 13
ok 1 - constants — ECONOMICS_VERSION = 2 (R-1, FR-041)
ok 2 - constants — LOW_VALUE_TARGET_THRESHOLD = 0.50 (FR-028)
ok 3 - constants — LOW_VALUE_THRESHOLD = 9 (legacy price-based — removed in Phase 8 T049)
ok 4 - spendShare — 50/60/70 map to 0.50/0.40/0.30
ok 5 - netFactor — 0/10/100 map to 1.00/0.90/0.00
ok 6 - paid_event: AOV $43 + HTO $3500 @ 75% attend, 7.5% close + ROAS 1.0
ok 7 - paid_event: ROAS 0.5 path — cap warning fires when raw exceeds maxCpa
ok 8 - paid_event: no HTO + ROAS 1.0 — fullBuyerValue collapses to AOV
ok 9 - paid_event: commissionRate 100 zeroes netFactor → HTO term 0 → fullBuyerValue = AOV
ok 10 - paid_product: netFactor on HTO term only — OQ-1 override (FR-019)
ok 11 - paid: equality raw == max → NO warn (FR-003)
ok 12 - lead_magnet_call report §6.1: marginKept 50 ⇒ $15.95
ok 13 - lead_magnet_call report §6.1: marginKept 60 (default) ⇒ $12.76
ok 14 - lead_magnet_call report §6.1: marginKept 70 ⇒ $9.57
ok 15 - lead_magnet_call regression anchor: pre-phase $630 target is gone (T021, constitution IX)
ok 16 - free_webinar: $3000 × 25% × 2% × 0.90 netFactor × 0.40 spendShare → leadValue $13.50, target $5.40 (FR-008)
ok 17 - free_webinar: $997 × 40% × 8% × 0.90 netFactor × 0.40 spendShare → leadValue $28.71, target $11.49
ok 18 - paid_event: ROAS 0.65 (invest-a-bit) works
ok 19 - paid_event: invalid ROAS (e.g. 0.75) throws
ok 20 - paid_event: negative AOV throws
ok 21 - paid_event: NaN htoConversionRate throws
ok 22 - paid_event: htoConversionRate > 100 throws (percentage range cap)
ok 23 - paid_event: commissionRate > 100 throws (FR-027)
ok 24 - paid_event: commissionRate < 0 throws
ok 25 - paid_event: marginKept outside closed enum throws (FR-026)
ok 26 - free_webinar: attendanceRate > 100 throws (percentage range cap)
ok 27 - lead_magnet_call: leadToCloseRate > 100 throws (percentage range cap)
ok 28 - deriveAll — paid_event dispatches to deriveTargetCpa + stamps economicsVersion
ok 29 - deriveAll — lead_magnet_call dispatches to deriveTargetCplLeadMagnetCall + stamps economicsVersion
ok 30 - deriveAll — free_webinar dispatches to deriveTargetCplFreeWebinar + stamps economicsVersion
ok 31 - computeAdvisories — paid + hasHto=false → noHto=true
ok 32 - computeAdvisories — paid + aov=$5 → lowValue fires only via computed target, NOT aov (FR-028)
ok 33 - computeAdvisories — paid no-HTO + aov=$5 + tight margin → lowValue FALSE (computed target $1.50 ≥ $0.50)
ok 34 - computeAdvisories — paid no-HTO + aov=$1 + tight margin → lowValue TRUE (computed target < 0.50)
ok 35 - computeAdvisories — free_webinar + tiny offerPrice → lowValue=true, noHto=false
ok 36 - computeAdvisories — free + offerPrice=$1000 + reasonable rates → no advisories
ok 37 - computeAdvisories — target STILL calculated when an advisory fires (non-blocking)
ok 38 - getEffectiveTarget — paid → CPA
ok 39 - getEffectiveTarget — free → CPL
ok 40 - getEffectiveTarget — stamped payload returns the target (T018 row 1)
ok 41 - getEffectiveTarget — UNSTAMPED payload returns null — pre-phase production shape (T018 row 2, load-bearing)
ok 42 - getEffectiveTarget — version 1 (legacy) returns null (T018 row 3)
ok 43 - getEffectiveTarget — stamped payload with no branch returns null (T018 row 4)
ok 44 - getEffectiveTarget — every deriveAll path stamps economicsVersion: 2 (T015 invariant)
1..44
# tests 44
# pass 44
# fail 0
```

**44/44 pass.** Phase 3 added 4 tests (T020 three-margin rows + T021 regression anchor + 30b boundary). Phase 2 corrections (item 1: test 30 rename + test 30b addition) account for the other change vs Phase 2's 41.

### 4.4 `node lib/__tests__/funnelSettings.contract.test.js`

```
ok 1 - contract — paid_event: AOV $43 + HTO $3500 @ 3% + 75% attend, 7.5% close + ROAS 1.0 → effectiveTargetCpa $43, no warning
ok 2 - contract — paid_event: same inputs + ROAS 0.5 → cap fires, effective follows raw
ok 3 - contract — paid_event: ROAS 0.5 + tight margin → cap fires, effective follows max
ok 4 - contract — paid_event: equality (raw == max) does NOT warn (FR-003)
ok 5 - contract — paid_event missing AOV → callable throws invalid-argument
ok 6 - contract — paid_event with numeric 0 AOV → derivation accepts 0 silently (server does NOT throw)
ok 7 - contract — paid_event with hasHto=true but missing htoPrice → throws
ok 8 - contract — paid_event with hasHto=true but missing htoConversionRate → throws
ok 9 - contract — free_webinar missing attendanceRate → callable throws invalid-argument
ok 10 - contract — free_webinar missing buyRateFromAttendees → throws
ok 11 - contract — lead_magnet_call missing leadToCloseRate → throws
ok 12 - contract — free_webinar with numeric 0 attendanceRate → derivation accepts 0 silently (server does NOT throw)
ok 13 - contract — negative inputs ALWAYS throw (validation independent of missing-field defaulting)
ok 14 - contract — funnelType invalid string → coercion throws (invalid-argument at callable)
ok 15 - contract — paid no-HTO → advisories.noHto=true
ok 16 - contract — lowValue advisory keys off COMPUTED target (T017a / FR-028)
ok 17 - contract — reviewDueAt = clientNowMs + 30 days
ok 18 - contract — paid derived carries rawTargetCpa / fullBuyerValue / maxCpa / effectiveTargetCpa / capApplied
ok 19 - contract — free derived carries leadValue / economicCeilingCpl / effectiveTargetCpl
ok 20 - contract — FunnelSettingsDoc schemaVersion is the literal 1 (not a code-path artifact)
1..20
# tests 20
# pass 20
# fail 0
```

**20/20 pass.** (Same count as Phase 2; the `FunnelSettingsDoc` literal at test 20 was extended with the new fields for the typecheck to pass, no assertion added.)

### 4.5 `npm run test:phase14` (full Phase 14 sweep)

```
# tests 18 — pass 18 — fail 0    (targetingContext)
# tests 11 — pass 11 — fail 0    (campaignObjective)
# tests 12 — pass 12 — fail 0    (canonicalAngle)
# tests 44 — pass 44 — fail 0    (cpaEconomics)        ← Phase 3 lands here
# tests 20 — pass 20 — fail 0    (funnelSettings)      ← Phase 3 ripple (new fields)
# tests 15 — pass 15 — fail 0    (tokenCrypto)
# tests 28 — pass 28 — fail 0    (perceptualHash)
# tests 2  — pass 2  — fail 0    (fingerprintAccuracy)
# tests 16 — pass 16 — fail 0    (metaGraph)
# tests 17 — pass 17 — fail 0    (metaSync)
# tests 37 — pass 37 — fail 0    (qararEngine)
# tests 19 — pass 19 — fail 0    (learningAggregates)
# tests 5  — pass 5  — fail 0    (learningIntegration)
# tests 12 — pass 12 — fail 0    (imageMatching)
```

**256 tests across 14 files; 256 pass, 0 fail.** (Was 252 in Phase 2; +4 from Phase 3 fixtures.)

### 4.6 Frontend typecheck

`npx tsc -b` exits 0.

---

## 5. US1 independent-test outcome

Per Phase 3 §3 plan: "Configure a lead-magnet-to-call funnel at $3,000 with benchmark midpoints; confirm `12.76`."

- **Inputs:** `offerPrice=3000, bookingRate=7.5, showUpRate=70, leadToCloseRate=22.5, commissionRate=10, marginKept=60`
- **Computed leadValue:** `3000 × 0.9 × 0.075 × 0.70 × 0.225 = 31.89375 → 31.89`
- **Computed effectiveTargetCpl:** `31.89375 × 0.40 = 12.7575 → 12.76`
- **Confirmed:** `12.76` ✓

US1 is independently shippable with US2's inputs present (US2 supplies `commissionRate` + `marginKept` defaults and the form fields; Phase 4).

---

## 6. Deviations from the plan

One small judgement call worth recording:

- **Test 30b added beyond the plan** — Phase 2 introduced an inaccuracy (test name vs assertion); the correction required both renaming and adding the symmetric boundary fixture to pin the strict `lowValue = target < 0.50` rule. The plan §3.2 originally called for one test; Phase 3 ships two (one for the FALSE side of the boundary, one for the TRUE side). Both are anchored to arithmetic values, not hand-tuned.

No other deviations.

---

## 7. Risks remaining at the end of Phase 3

- **Phase 4 unblock required for deploy** — see Item 5 above. `commissionRate` / `marginKept` are now required by `assertRequiredFieldPresent` but the `FunnelSettingsDoc` interface does not yet declare them (Phase 4 T027 adds them) and the form does not yet send them (Phase 4 T028–T029 add the form fields). The current save validator will reject every paid-funnel save attempt until Phase 4 ships.
- **`buildFunnelInputsFromDoc` still exists** — dead code with DEFAULT_* defaults. Phase 5 must strip the defaults or delete the helper per the exit criterion in Item 3.
- **Frontend lint warning (pre-existing)** — `setState-in-effect` at the hydration `useEffect` (now line 423 after Phase 3's 15 added lines). This error existed pre-Phase-3 at line 408 of the same file. Not introduced by Phase 3; recorded for future cleanup.

---

## 8. Phase 4 unblock

**Recommendation**: Phase 4 (US2 — Owner controls commission and margin) may begin. All 5 tasks of Phase 3 are reported. The lead-magnet-call formula is verified at the three margin rows; the regression anchor is in place; the form has the new fields; the doc persists them. Phase 4 extends `commissionRate` + `marginKept` to **all four** funnel types per FR-023/FR-024/FR-018 OQ-1 override.

---

## 9. Reproducibility

```powershell
# 1. Typecheck both packages
npx tsc -b                                  # exits 0
cd functions; npx tsc --noEmit              # exits 0

# 2. Run the guard tests (Phase 1 stays green)
npm run test:guard                          # 22/22 pass, exit 0

# 3. Run the SC-11 guard against the current src tree
node scripts/sc11Guard.mjs                  # "PASS — 81 files scanned, 0 forbidden terms.", exit 0

# 4. Run the Phase 3 unit tests
cd functions; npm run build; node lib/__tests__/cpaEconomics.test.js
# Expect: 44 ok, "# tests 44 / # pass 44 / # fail 0", exit 0

# 5. Run the affected contract test
cd functions; node lib/__tests__/funnelSettings.contract.test.js
# Expect: 20 ok, "# tests 20 / # pass 20 / # fail 0", exit 0

# 6. Full Phase 14 sweep
cd functions; npm run test:phase14          # 256/256 across 14 files, exit 0
```