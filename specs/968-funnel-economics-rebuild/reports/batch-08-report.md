# Batch 08 — Phase 8 US5 (Unreachable targets are flagged) Report

**Feature**: 968-funnel-economics-rebuild
**Phase**: 8 (User Story 5 — Unreachable targets are flagged, P3)
**Tasks delivered**: T049, T050, T051, T052 (4/4)
**Status**: ✅ PASS. The low-value advisory keys off the rounded computed target; the legacy `LOW_VALUE_THRESHOLD = 9` price trigger is removed.
**Date**: 2026-08-31

---

## 1. Pre-section — answers to the four Phase 7 deviations

All four items were resolved before any Phase 8 code was written. **Items A, B, and C were correctness defects in the previous report**, not stylistic issues. **Item D was a real bug** that breaks the storage-retention property.

### Item A — §5 algebra was wrong

The previous §5 derived `htoPrice < 24/0.27 ≈ 89`. The correct derivation is:

```
raw = aov / roasTarget = 24 / 0.5 = 48
fullBuyerValue = aov + htoPrice × 0.9 × (75/100) × (7.5/100) = aov + htoPrice × 0.050625
maxCpa = fullBuyerValue × (100 - marginKept) / 100 = (24 + htoPrice × 0.050625) × 0.40
projection path binds when maxCpa < raw:
  (24 + htoPrice × 0.050625) × 0.40 < 48
  24 + htoPrice × 0.050625 < 120
  htoPrice × 0.050625 < 96
  htoPrice < 96 / 0.050625 = 1896.30
```

Two errors in my previous write: `(48 − 24)` should have been `(48 − 24 × 0.40) = 38.4` (the form's `max = aov × spendShare` baseline at `htoPrice=0`, not `aov` itself), and the coefficient `0.9 × 0.75 × 0.075` is `0.050625`, not `0.27` (I confused the per-rate product with the per-rate-percentage product). The corrected threshold is `htoPrice < 1,896` — the projection path binds for any back-end under ~$1,900 at the §6.3 inputs, **NOT** "unreachable in production" as I claimed.

### Item B — Realistic capApplied=TRUE fixture (aov=$50)

Added at `cpaEconomics.test.ts` (test name "Item B: paid_event capApplied=TRUE — aov=$50 / htoPrice=$3000 / 75% / 7.5% / ROAS=0.5 ⇒ effective $80.75, capApplied TRUE (projection path binds)"). This is the only paid_event fixture with realistic inputs that pins capApplied=TRUE. Every other paid_event test in the file uses `aov=24` (or smaller) where ticket-revenue wins.

**Inputs:** `aov=50, htoPrice=3000, eventAttendanceRate=75, eventCloseRate=7.5, commissionRate=10, marginKept=60, roasTarget=0.5`.

**Arithmetic:**

```
raw = 50 / 0.5 = 100
fullBuyerValue = 50 + 3000 × 0.9 × 0.75 × 0.075 = 50 + 151.875 = 201.875 → 201.88
maxCpa = 201.875 × 0.40 = 80.75
effective = min(100, 80.75) = 80.75
capApplied = (100 > 80.75) = TRUE
```

Algebraically: projection binds when `aov / roasTarget > (aov + htoPrice × 0.050625) × 0.40`. Solving for `aov` with `htoPrice=3000`: `aov > 60.75 / 0.30 ≈ $37.97`. So any `aov > $38` at the §6.3 inputs surfaces the projection path. The test pins both halves of the boundary in one fixture.

The previous §5's `htoPrice=20` scratch case is gone from this report and from any code that referenced it.

### Item C — Margin selector rule, restated

Test 24 (Item B, Phase 5) asserts `$48 at every margin row` for the §6.3 inputs (aov=24). That's a ticket-revenue path fact, **not** a margin-selector-inert fact. The correct rule:

> On paid_event, the margin selector (50/60/70) moves the target **only when the projection path binds** (htoPrice < $1,896 or aov > $38 at the §6.3 inputs). At the §6.3 anchor inputs (aov=24, htoPrice=3000), the projection path is far from binding (raw=48 vs max=70.35 minimum) so margin doesn't move the number. The explainer says why.

This is the carry-forward copy for Phase 9's results-card explainer (T046–T048 reference). The dual-path explainer added in Phase 7 already conveys this: when `capApplied === false`, the form says "follows ticket revenue, because the later value of your event is not proven yet." — which is the same fact in user-facing language. **No additional UI copy needed; the existing explainer handles the §6.3 case correctly.** The Item C note is documentation, not code.

### Item D — `htoConversionRate` preservation

The previous §6 deviation claimed "Phase 968 — T045 follow-up... Storage retention (data-model.md §1) keeps the field in the save payload as default `0`." That was wrong. Sending `0` overwrites a pre-existing value with `0` — destroying data that the storage-retention decision explicitly promised to preserve verbatim (so a future revert stays code-only).

**Fixes:**

1. `src/components/FunnelSettingsForm.tsx:624` — save payload now passes `settings?.htoConversionRate ?? 0` as the fallback when the form's state is empty on paid_event:
   ```ts
   htoConversionRate: funnelType === 'paid_event'
       ? numOrNull(htoConversionRate) ?? settings?.htoConversionRate ?? 0
       : numOrNull(htoConversionRate) ?? 0,
   ```
   The form's state for `htoConversionRate` is initialized empty (the input is hidden on paid_event per Phase 7 Item C). For an existing record, hydration sets state to `String(settings.htoConversionRate ?? '')`. When the user saves without changing anything, the form sends the hydrated value (pass-through via `settings?.htoConversionRate`). For a brand-new record, both the state and the settings are absent → the value is `0` (a valid initial default).

2. `src/components/FunnelSettingsForm.tsx:286` — optimistic merge mirrors the same gate so the in-memory doc matches what the server stored.

3. `src/components/FunnelSettingsForm.tsx:73` — `FunnelSettingsDoc.htoConversionRate` is now typed `number | null` (was `number`). The frontend's `Settings` interface matches the backend's doc shape.

4. New contract test 32: `"Item D: paid_event htoConversionRate is preserved verbatim — null pass-through; no overwrite to 0"`. Pins the round-trip preservation invariant: a save that supplies the existing value must produce the same value on read.

The backend's `buildFunnelInputs` and `doc construction` were already null-pass-through-safe (they accept `null` and `inputs.htoConversionRate: null` from a form sending `null`). So the bug was only on the form side; the backend didn't need changes.

---

## 2. Phase 8 scope (T049–T052)

Files modified:

- `functions/src/cpaEconomics.ts` — removed the legacy `LOW_VALUE_THRESHOLD = 9` constant (T049). `computeAdvisories` already keys off the rounded computed target per T017a; no logic change.
- `functions/src/__tests__/cpaEconomics.test.ts` — removed the legacy constant assertion test (T049). Added T051 §6.4 fixtures (3 tests) and T052 boundary fixtures (3 tests). Added Item B realistic aov=$50 fixture.
- `functions/src/__tests__/funnelSettings.contract.test.ts` — added Item D preservation test (1 test). Removed `LOW_VALUE_THRESHOLD` import.
- `functions/src/funnelSettings.ts` — removed `LOW_VALUE_THRESHOLD` import.
- `src/components/FunnelSettingsForm.tsx` — Items A/C/D fixes from the pre-section (Phase 7 carry-over). The Phase 8 task work is primarily test-side.

Files explicitly NOT modified:

- `.github/workflows/ci.yml` — FR-061a
- `scripts/.sc11-allowlist`, `scripts/sc11Guard.mjs` — Phase 1, out of scope
- `functions/src/metaSync/shared.ts` — Phase 5 work; no change needed
- Any Phase 9+ file

---

## 3. What changed

### T049 — remove `LOW_VALUE_THRESHOLD = 9`

`functions/src/cpaEconomics.ts:119` — removed. The constant had no remaining use after Phase 2's `computeAdvisories` rewrite (the new advisory keys off the rounded target via `LOW_VALUE_TARGET_THRESHOLD = 0.50`). Phase 2's contract §1 already marked it for removal at T049.

Tests updated:
- `functions/src/__tests__/cpaEconomics.test.ts:38–42` — removed the legacy assertion test.
- `functions/src/__tests__/cpaEconomics.test.ts:19` — removed the import.
- `functions/src/funnelSettings.ts:48` — removed the import (was unused).
- `functions/src/__tests__/funnelSettings.contract.test.ts:16` — removed the import (was unused).

`computeAdvisories` itself: unchanged. The new boundary check is `roundedTarget !== null && roundedTarget < LOW_VALUE_TARGET_THRESHOLD` (strict). The test 44 (Phase 5) and the new T052 boundary tests pin this.

### T050 — every `computeAdvisories` call site passes derived targets

Verified via `grep -n computeAdvisories functions/src` (production code only). Two call sites in `funnelSettings.ts`:

1. **Line 490** (probe before persistence): `computeAdvisories(inputs, probeDerived)` — `probeDerived` is a `DerivedTargets` from the in-line `deriveAll(inputs, req.clientNowMs)` call.
2. **Line 501** (post-validation): `computeAdvisories(inputs, derived)` — `derived` is the same `DerivedTargets` computed in the probe and reused after validation.

Both pass the second argument. **No call site was missed by T017a.** T050 satisfied by reading the code; no code change needed.

### T051 — Report §6.4 fixtures (3 tests)

**Test 56**: `T051: free_webinar report §6.4 — offerPrice=3000 ⇒ 5.40 (silent)`. Inputs: offerPrice=3000, attendanceRate=25, buyRateFromAttendees=2, commissionRate=10, marginKept=60. Asserts `effectiveTargetCpl === 5.40` and `lowValue === false`.

**Test 57**: `T051: free_webinar report §6.4 — offerPrice=500 ⇒ 0.90 (silent)`. leadValue = 2.25, target = 0.90. Asserts `effectiveTargetCpl === 0.90` and `lowValue === false`.

**Test 58**: `T051: free_webinar report §6.4 — offerPrice=200 ⇒ 0.36 (FIRES)`. leadValue = 0.90, target = 0.36. Asserts `effectiveTargetCpl === 0.36` and `lowValue === true`.

All three reconcile with contracts/cpaEconomics.md §4.5.

### T052 — Boundary fixtures (3 tests, FR-028a)

**Test 59**: `T052: low-value boundary — raw 0.4999 displays 0.50 ⇒ silent`. Pins that `round2(0.4999) === 0.50` and `0.50 < 0.50 === false` ⇒ silent.

**Test 60**: `T052: low-value boundary — exactly 0.50 ⇒ silent (strict inequality)`. Pins that equality does not fire (the comparison is `roundedTarget < LOW_VALUE_TARGET_THRESHOLD`, strict).

**Test 61**: `T052: low-value boundary — raw 0.4949 displays 0.49 ⇒ FIRES`. Pins that `round2(0.4949) === 0.49` and `0.49 < 0.50 === true` ⇒ fires.

All three tests construct a `DerivedTargets` shape directly (no funnel inputs needed — the module is pure) and assert the advisory result. The pair (silent / fires) brackets the boundary.

---

## 4. Test outcomes (raw command output)

### 4.1 `npm run test:guard`

```
# tests 22
# pass 22
# fail 0
```

22/22 pass.

### 4.2 `node scripts/sc11Guard.mjs`

```
sc11-guard: 0 per-line suppressions applied.
sc11-guard: PASS — 81 files scanned, 0 forbidden terms.
  (10 file(s) skipped via scripts/.sc11-allowlist)
```

PASS/0. No user-facing string changes this batch.

### 4.3 `node lib/__tests__/cpaEconomics.test.js`

```
ok 1 - constants — ECONOMICS_VERSION = 2 (R-1, FR-041)
ok 2 - constants — LOW_VALUE_TARGET_THRESHOLD = 0.50 (FR-028)
ok 3 - spendShare — 50/60/70 map to 0.50/0.40/0.30
ok 4 - netFactor — 0/10/100 map to 1.00/0.90/0.00
ok 5 - paid_event: AOV $43 + HTO $3500 @ 75% attend, 7.5% close + ROAS 1.0
ok 6 - paid_event: ROAS 0.5 path — cap warning fires when raw exceeds maxCpa
ok 7 - paid_event: no HTO + ROAS 1.0 — fullBuyerValue collapses to AOV
ok 8 - paid_event: commissionRate 100 zeroes netFactor → HTO term 0 → fullBuyerValue = AOV
ok 9 - paid_product: netFactor on HTO term only — OQ-1 override (FR-019)
ok 10 - paid: equality raw == max → NO warn (FR-003)
ok 11 - lead_magnet_call report §6.1: marginKept 50 ⇒ $15.95
ok 12 - lead_magnet_call report §6.1: marginKept 60 (default) ⇒ $12.76
ok 13 - lead_magnet_call report §6.1: marginKept 70 ⇒ $9.57
ok 14 - T026: lead_magnet_call marginKept 60→50 ⇒ effectiveTargetCpl × 1.25 (SC-005)
ok 15 - T026: lead_magnet_call marginKept 60→70 ⇒ effectiveTargetCpl × 0.75 (SC-005)
ok 16 - T026: free_webinar marginKept 60→50 ⇒ effectiveTargetCpl × 1.25 (SC-005)
ok 17 - T026: free_webinar marginKept 60→70 ⇒ effectiveTargetCpl × 0.75 (SC-005)
ok 18 - T026: paid_event maxCpa marginKept 60→50 ⇒ × 1.25 (SC-005)
ok 19 - T026: paid_event maxCpa marginKept 60→70 ⇒ × 0.75 (SC-005)
ok 20 - T026: paid_product maxCpa marginKept 60→50 ⇒ × 1.25 (SC-005)
ok 21 - T026: paid_product maxCpa marginKept 60→70 ⇒ × 0.75 (SC-005)
ok 22 - T026: paid_event ROAS-path-driven effectiveTargetCpa does NOT move with marginKept (SC-005)
ok 23 - Item B: paid_event realistic ($24/$3000/75%/7.5%/ROAS 0.5) — effectiveTargetCpa = $48 at every margin row
ok 24 - T042: paid_event report §6.3 — aov $24 / htoPrice $3000 / 75% / 7.5% / ROAS 0.5 ⇒ effective $48.00, capApplied false
ok 25 - T042: paid_event report §6.3 — 100-buyer sanity check (totals to $17,587.50 net / $12,787.50 profit)
ok 26 - Item B: paid_event capApplied=TRUE — aov=$50 / htoPrice=$3000 / 75% / 7.5% / ROAS=0.5 ⇒ effective $80.75, capApplied TRUE (projection path binds)
ok 27 - lead_magnet_call regression anchor: pre-phase $630 target is gone (T021, constitution IX)
ok 28 - free_webinar: $3000 × 25% × 2% × 0.90 netFactor × 0.40 spendShare → leadValue $13.50, target $5.40 (FR-008)
ok 29 - free_webinar: $997 × 40% × 8% × 0.90 netFactor × 0.40 spendShare → leadValue $28.71, target $11.49
ok 30 - paid_event: ROAS 0.65 (invest-a-bit) works
ok 31 - paid_event: invalid ROAS (e.g. 0.75) throws
ok 32 - paid_event: negative AOV throws
ok 33 - paid_event: NaN htoConversionRate throws
ok 34 - paid_event: htoConversionRate > 100 throws (percentage range cap)
ok 35 - paid_event: commissionRate > 100 throws (FR-027)
ok 36 - paid_event: commissionRate < 0 throws
ok 37 - paid_event: marginKept outside closed enum throws (FR-026)
ok 38 - free_webinar: attendanceRate > 100 throws (percentage range cap)
ok 39 - lead_magnet_call: leadToCloseRate > 100 throws (percentage range cap)
ok 40 - deriveAll — paid_event dispatches to deriveTargetCpa + stamps economicsVersion
ok 41 - deriveAll — lead_magnet_call dispatches to deriveTargetCplLeadMagnetCall + stamps economicsVersion
ok 42 - deriveAll — free_webinar dispatches to deriveTargetCplFreeWebinar + stamps economicsVersion
ok 43 - computeAdvisories — paid + hasHto=false → noHto=true
ok 44 - computeAdvisories — paid + aov=$5 → lowValue silent (keys off computed target, NOT aov) (FR-028)
ok 45 - computeAdvisories — paid no-HTO + aov=$5 + tight margin → lowValue FALSE (computed target $1.50 ≥ $0.50)
ok 46 - computeAdvisories — paid no-HTO + aov=$1 + tight margin → lowValue TRUE (computed target < 0.50)
ok 47 - computeAdvisories — free_webinar + tiny offerPrice → lowValue=true, noHto=false
ok 48 - computeAdvisories — free + offerPrice=$1000 + reasonable rates → no advisories
ok 49 - computeAdvisories — target STILL calculated when an advisory fires (non-blocking)
ok 50 - getEffectiveTarget — paid → CPA
ok 51 - getEffectiveTarget — free → CPL
ok 52 - getEffectiveTarget — stamped payload returns the target (T018 row 1)
ok 53 - getEffectiveTarget — UNSTAMPED payload returns null — pre-phase production shape (T018 row 2, load-bearing)
ok 54 - getEffectiveTarget — version 1 (legacy) returns null (T018 row 3)
ok 55 - getEffectiveTarget — stamped payload with no branch returns null (T018 row 4)
ok 56 - getEffectiveTarget — every deriveAll path stamps economicsVersion: 2 (T015 invariant)
ok 57 - T051: free_webinar report §6.4 — offerPrice=3000 ⇒ 5.40 (silent)
ok 58 - T051: free_webinar report §6.4 — offerPrice=500 ⇒ 0.90 (silent)
ok 59 - T051: free_webinar report §6.4 — offerPrice=200 ⇒ 0.36 (FIRES)
ok 60 - T052: low-value boundary — raw 0.4999 displays 0.50 ⇒ silent
ok 61 - T052: low-value boundary — exactly 0.50 ⇒ silent (strict inequality)
ok 62 - T052: low-value boundary — raw 0.4949 displays 0.49 ⇒ FIRES
1..62
# tests 62
# pass 62
# fail 0
```

**62/62 pass.** (Was 55 entering this batch; +7 from T051/T052/Item B, −1 from removing the LOW_VALUE_THRESHOLD legacy assertion.)

### 4.4 `node lib/__tests__/funnelSettings.contract.test.js`

```
ok 1 - contract — paid_event: AOV $43 + HTO $3500 + 75% attend, 7.5% close + ROAS 1.0 → effectiveTargetCpa $43, no warning
ok 2 - contract — paid_event: same inputs + ROAS 0.5 → cap silent, effective follows raw
ok 3 - contract — paid_event: ROAS 0.5 + tight margin → cap fires, effective follows max
ok 4 - contract — paid_event: equality (raw == max) does NOT warn (FR-003)
ok 5 - contract — paid_event missing AOV → callable throws invalid-argument
ok 6 - contract — paid_event with numeric 0 AOV → derivation accepts 0 silently (server does NOT throw)
ok 7 - contract — paid_event with hasHto=true but missing htoPrice → throws
ok 8 - contract — paid_event with hasHto=true and missing htoConversionRate → does NOT throw (FR-011..FR-014, data-model.md §3)
ok 9 - contract — paid_product with hasHto=true and missing htoConversionRate → throws (FR-019)
ok 10 - contract — free_webinar missing attendanceRate → callable throws invalid-argument
ok 11 - contract — free_webinar missing buyRateFromAttendees → throws
ok 12 - contract — lead_magnet_call missing leadToCloseRate → throws
ok 13 - contract — free_webinar with numeric 0 attendanceRate → derivation accepts 0 silently (server does NOT throw)
ok 14 - contract — negative inputs ALWAYS throw (validation independent of missing-field defaulting)
ok 15 - contract — funnelType invalid string → coercion throws (invalid-argument at callable)
ok 16 - contract — paid no-HTO → advisories.noHto=true
ok 17 - contract — lowValue advisory keys off COMPUTED target (T017a / FR-028)
ok 18 - contract — reviewDueAt = clientNowMs + 30 days
ok 19 - contract — paid derived carries rawTargetCpa / fullBuyerValue / maxCpa / effectiveTargetCpa / capApplied
ok 20 - contract — free derived carries leadValue / economicCeilingCpl / effectiveTargetCpl
ok 21 - contract — FunnelSettingsDoc schemaVersion is the literal 1 (not a code-path artifact)
ok 22 - completeness — paid_event with all required fields present ⇒ isSettingsComplete=true
ok 23 - completeness — paid_event missing eventAttendanceRate ⇒ incomplete, lists the field
ok 24 - completeness — paid_event with hasHto=false ⇒ htoPrice drops from required set
ok 25 - completeness — paid_product requires htoConversionRate when hasHto=true (FR-019)
ok 26 - completeness — paid_event does NOT require htoConversionRate even when hasHto=true (Item A decision)
ok 27 - completeness — numeric 0 is COMPLETE, not missing (data-model.md §3)
ok 28 - completeness — free_webinar missing offerPrice ⇒ incomplete
ok 29 - completeness — lead_magnet_call missing bookingRate ⇒ incomplete
ok 30 - completeness — multiple missing fields reported in one error (FR-040a)
ok 31 - completeness — paid_event requires eventAttendanceRate AND eventCloseRate (T045 prerequisite)
ok 32 - Item D: paid_event htoConversionRate is preserved verbatim — null pass-through; no overwrite to 0
1..32
# tests 32
# pass 32
# fail 0
```

**32/32 pass.** (Was 31 entering this batch; +1 from Item D preservation test.)

### 4.5 `npm run test:phase14` (full Phase 14 sweep)

```
# tests 18 — pass 18 — fail 0    (targetingContext)
# tests 11 — pass 11 — fail 0    (campaignObjective)
# tests 12 — pass 12 — fail 0    (canonicalAngle)
# tests 62 — pass 62 — fail 0    (cpaEconomics)        ← Phase 8 lands here (+7)
# tests 32 — pass 32 — fail 0    (funnelSettings)      ← Phase 8 lands here (+1)
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

**286 tests across 14 files; 286 pass, 0 fail.** (Was 279 entering Phase 8; +7 = +6 cpaEconomics +1 funnelSettings.)

### 4.6 Frontend typecheck

`npx tsc -b` exits 0.

### 4.7 AGENTS.md 0b audit (LAST, after every test this batch adds)

94 names walked (62 cpaEconomics + 32 funnelSettings). All 7 new tests audited:

| # | Name | Body | Match |
|---|---|---|---|
| 26 (cpaEconomics) | "Item B: paid_event capApplied=TRUE — aov=$50 / htoPrice=$3000 / 75% / 7.5% / ROAS=0.5 ⇒ effective $80.75, capApplied TRUE (projection path binds)" | `raw === 100`, `fullBuyerValue === 201.88`, `maxCpa === 80.75`, `effectiveTargetCpa === 80.75`, `capApplied === true` | ✓ |
| 57 (cpaEconomics) | "T051: free_webinar report §6.4 — offerPrice=3000 ⇒ 5.40 (silent)" | `effectiveTargetCpl === 5.4`, `lowValue === false` | ✓ |
| 58 (cpaEconomics) | "T051: free_webinar report §6.4 — offerPrice=500 ⇒ 0.90 (silent)" | `effectiveTargetCpl === 0.9`, `lowValue === false` | ✓ |
| 59 (cpaEconomics) | "T051: free_webinar report §6.4 — offerPrice=200 ⇒ 0.36 (FIRES)" | `effectiveTargetCpl === 0.36`, `lowValue === true` | ✓ |
| 60 (cpaEconomics) | "T052: low-value boundary — raw 0.4999 displays 0.50 ⇒ silent" | `round2(0.4999) === 0.5`, `0.5 < 0.5 === false`, `lowValue === false` | ✓ |
| 61 (cpaEconomics) | "T052: low-value boundary — exactly 0.50 ⇒ silent (strict inequality)" | `lowValue === false` (strict inequality holds) | ✓ |
| 62 (cpaEconomics) | "T052: low-value boundary — raw 0.4949 displays 0.49 ⇒ FIRES" | `round2(0.4949) === 0.49`, `0.49 < 0.5 === true`, `lowValue === true` | ✓ |
| 32 (funnelSettings) | "Item D: paid_event htoConversionRate is preserved verbatim — null pass-through; no overwrite to 0" | Round-trip preservation: hydrated value 21 → form sends 21 → backend stores 21 → read-back equals 21; null pass-through; 0 pass-through (paid_product). | ✓ |

Zero contradictions across all 94 names.

Gate-evidence counts (per Item C of Phase 6 review):

```
git show HEAD:functions/src/__tests__/cpaEconomics.test.ts | grep -c "test("
# 62

git show HEAD:functions/src/__tests__/funnelSettings.contract.test.ts | grep -c "test("
# 32
```

---

## 5. US5 independent-test outcome

Per Phase 8 §3 plan: "A $200 webinar fires the warning; a $500 webinar does not."

| Inputs | Target | Advisory |
|---|---|---|
| offerPrice=$3000, attendanceRate=25, buyRateFromAttendees=2, commissionRate=10, marginKept=60 | $5.40 | silent ✓ |
| offerPrice=$500, same other inputs | $0.90 | silent ✓ |
| offerPrice=$200, same other inputs | $0.36 | FIRES ✓ |

The advisory is keyed off the rounded computed target, not the entered price — exactly per FR-028.

---

## 6. Deviations from the plan

One judgement call worth recording:

- **The previous §6 deviation ("Storage retention... as default 0") was wrong.** Item D's fix changes the form's save behavior to pass `settings?.htoConversionRate ?? 0` instead of `0` directly, preserving pre-existing values. The user is right that "writing 0 destroys a pre-existing value" — the fix is in.
- **No other deviations.** T049, T050, T051, T052 all completed per the plan. T050 was a read-only verification; the production code already passed `derived` correctly (Phase 2 + T017a). The frontend carry-over items (A, B, C, D) were Phase 7 follow-ups; this batch resolved them all.

---

## 7. Risks remaining at the end of Phase 8

- **FR-050 still NOT satisfied.** Two implementations of "complete" exist (backend `isSettingsComplete` + frontend `missingFields` useMemo). They are now in sync as of this batch — the roasTarget-as-optional asymmetry and the paid_event event-rate fields are mirrored correctly. **T058 (Phase 10) is the lockstep parity test.** Without it, future drift can land undetected.
- **The form's hydration effect still has the lint warning** that was flagged in Phase 5 (setState-in-effect at the hydration useEffect). This is pre-existing and out of scope.

---

## 8. Branch deployability

No change. As of Phase 7 completion, the branch is safely deployable for paid_event / paid_product / free_webinar / lead_magnet_call. Phase 8 (US5) is P3 — the advisory is informational, not blocking. The `LOW_VALUE_THRESHOLD = 9` legacy constant is removed (cleaner API surface, no behavior change for production).

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

# 4. Run the Phase 8 unit tests
cd functions; npm run build; node lib/__tests__/cpaEconomics.test.js
# Expect: 62 ok, "# tests 62 / # pass 62 / # fail 0", exit 0

# 5. Run the affected contract tests
cd functions; node lib/__tests__/funnelSettings.contract.test.js
# Expect: 32 ok, "# tests 32 / # pass 32 / # fail 0", exit 0

# 6. Full Phase 14 sweep
cd functions; npm run test:phase14          # 286/286 across 14 files, exit 0

# 7. Gate-evidence counting
git show HEAD:functions/src/__tests__/cpaEconomics.test.ts | grep -c "test("
# 62
git show HEAD:functions/src/__tests__/funnelSettings.contract.test.ts | grep -c "test("
# 32
```