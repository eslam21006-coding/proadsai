# Batch 04 — Phase 4 US2 (Owner controls commission and margin) Report

**Feature**: 968-funnel-economics-rebuild
**Phase**: 4 (User Story 2 — Owner controls commission and margin, P1) 🎯 MVP
**Tasks delivered**: T024, T025, T026, T027, T028, T029 (6/6)
**Status**: ✅ PASS. US1 + US2 = minimum viable correction.
**Date**: 2026-08-31

---

## 1. Pre-section — answers to the four Phase 3 carry-over items

These were resolved before any Phase 4 code was written.

### 1.1 — Two more inaccurate test names (item 1)

The user found two more inaccurate test names in `funnelSettings.contract.test.ts`. Fixed:

| Test (line) | Old name | Issue | New name |
|---|---|---|---|
| `:91` | `paid_event: AOV $43 + HTO $3500 @ 3% + 75% attend, 7.5% close + ROAS 1.0` | `@ 3%` referred to `htoConversionRate`, which paid_event no longer reads (paid_event uses `eventAttendanceRate × eventCloseRate`). Stale reference. | `paid_event: AOV $43 + HTO $3500 + 75% attend, 7.5% close + ROAS 1.0`. The fixture body still supplies `htoConversionRate: 3` (additive storage per data-model.md §1) but a comment notes it's unused on paid_event. |
| `:109` | `paid_event: same inputs + ROAS 0.5 → cap fires, effective follows raw` | Self-contradictory: "cap fires" AND "effective follows raw" cannot both be true. Body asserted `capApplied: false; effectiveTargetCpa: 86`. | `paid_event: same inputs + ROAS 0.5 → cap silent, effective follows raw`. |

The runner now emits:

```
ok 1 - contract — paid_event: AOV $43 + HTO $3500 + 75% attend, 7.5% close + ROAS 1.0 → effectiveTargetCpa $43, no warning
ok 2 - contract — paid_event: same inputs + ROAS 0.5 → cap silent, effective follows raw
```

20/20 still pass.

**Third test name fixed during this batch (audit per AGENTS.md 0b):**

| Test | Old name | Issue | New name |
|---|---|---|---|
| `cpaEconomics.test.ts` (test 32) | `paid + aov=$5 → lowValue fires only via computed target, NOT aov (FR-028)` | Misleading: "fires" implied lowValue=TRUE; the body asserts `lowValue: false`. The test pins the contract direction change (pre-phase `aov<9` would have fired; new contract correctly does not fire because the target $2.00 is above $0.50). | `paid + aov=$5 → lowValue silent (keys off computed target, NOT aov) (FR-028)`. The body comment now explicitly states the test pins the direction change, not a fire-on-this-input. |

The runner now emits:

```
ok 32 - computeAdvisories — paid + aov=$5 → lowValue silent (keys off computed target, NOT aov) (FR-028)
```

44/44 still pass (now 53/53 with the T026 additions — see §5).

### 1.2 — AGENTS.md 0b convention added (item 1, future-batch check)

`AGENTS.md §0b` now reads:

> Before reporting a batch, walk the `ok N - <description>` lines emitted by the runner. For every line, assert the description is consistent with the assertion(s) in the corresponding test source — same direction (TRUE/FALSE), same value, same branch. Any contradiction is fixed in code, not papered over with a comment.

This rule exists because inaccurate test names are a class of failure mode the runner cannot detect. Applied in this batch: 64 test names walked; 0 contradictions found after the three fixes above.

### 1.3 — Report row 21 typo confirmed (item 2)

Row 21 in the batch-03-report table had `effectiveTargetCpl: 43 (kept)` in the right-hand column — that was a copy/paste artefact. The actual source code is `assert.equal(d.paid.effectiveTargetCpa, 43)` and has always been. Paid funnels produce CPA, not CPL. **Report typo, not a real field change.** The right-hand cell is corrected to `effectiveTargetCpa: 43 (kept)`.

### 1.4 — Phase 5 criterion is DELETION-only (item 3)

The original criterion offered two alternatives: "removed (preferred) or its DEFAULT_* defaults are stripped and replaced with `throw new Error(...)` on missing fields." The "or throw" alternative is removed. **Deletion only.** A dead helper that throws is still a dead helper that can be wired up later by a future change that doesn't know about the safety property. The Phase 5 acceptance criterion now reads:

> At Phase 5 completion: `buildFunnelInputsFromDoc` is **deleted outright**. The function definition and its doc comment are both removed. `grep -r "buildFunnelInputsFromDoc" functions/src` returns **zero matches**.

### 1.5 — Deviation row 11 framing (item 4)

Row 11 in the batch-03-report table compared two different input sets: pre-phase `leadToCloseRate=5` only vs new `bookingRate=7.5, showUpRate=70, leadToCloseRate=22.5`. The conclusion stands (formula correction, not regression) because the *formula structure* is what changed — but the framing overstated it as a like-for-like before/after. The row's discriminator column now notes explicitly that the inputs differ and explains why the comparison still discriminates.

---

## 2. Phase 4 scope (T024–T029)

Files modified in this invocation:

- `functions/src/cpaEconomics.ts` — no change (T024 formula already landed in Phase 2; verified)
- `functions/src/__tests__/cpaEconomics.test.ts` — T026 margin-scaling fixtures (9 tests including the ROAS-path-doesn't-move discriminator)
- `functions/src/funnelSettings.ts` — T027 `FunnelSettingsDoc` interface extended with `commissionRate` + `marginKept`; persistence in `saveFunnelSettings` doc construction
- `functions/src/__tests__/funnelSettings.contract.test.ts` — T027 doc literal updated for new fields
- `src/components/FunnelSettingsForm.tsx` — T027 + T028 + T029: `commissionRate` + `marginKept` in `Settings` / save-request / state / hydration / save payload; commission `NumberField` in every funnel branch; `MARGIN_OPTIONS` three-button preset following the `ROAS_OPTIONS` pattern, with 60 preselected for a new record

Files explicitly NOT modified:

- `.github/workflows/ci.yml` — FR-061a
- `scripts/.sc11-allowlist`, `scripts/sc11Guard.mjs` — Phase 1, out of scope
- `functions/src/metaSync/shared.ts` — Phase 5, bounded
- `src/App.tsx` — Phase 5 (T034–T036)
- Any Phase 5+ file

---

## 3. What changed

### T024 — netFactor applied to free-webinar formula (already done in Phase 2, verified)

The contract §3 formula:

```
leadValue = offerPrice × netFactor × (attendanceRate/100) × (buyRateFromAttendees/100)
targetCpl = leadValue × spendShare
```

Landed in `cpaEconomics.ts` during Phase 2 (T010 + T012). Test 16 (Phase 3) is the §6.2 fixture and passes.

### T025 — report §6.2 fixture (already done in Phase 3)

Test 16 asserts the §6.2 worked example: `3000 × 25% × 2% × 0.90 netFactor = 13.50 leadValue`, `13.50 × 0.40 spendShare = 5.40 target`. Passes.

### T026 — margin-scaling fixtures per contracts §4.8 (SC-005)

Nine new tests covering the §4.8 contract:

| Test | Inputs | Expected |
|---|---|---|
| `lead_magnet_call marginKept 60→50 ⇒ × 1.25` | $3000 / 7.5% / 70% / 22.5% / commission 10 | 12.76 × 1.25 = 15.95 |
| `lead_magnet_call marginKept 60→70 ⇒ × 0.75` | same | 12.76 × 0.75 = 9.57 |
| `free_webinar marginKept 60→50 ⇒ × 1.25` | $3000 / 25% / 2% / commission 10 | 5.40 × 1.25 = 6.75 |
| `free_webinar marginKept 60→70 ⇒ × 0.75` | same | 5.40 × 0.75 = 4.05 |
| `paid_event maxCpa marginKept 60→50 ⇒ × 1.25` | $24 / 3000 HTO / 75% / 7.5% / ROAS 0.5 | 70.35 × 1.25 = 87.94 |
| `paid_event maxCpa marginKept 60→70 ⇒ × 0.75` | same | 70.35 × 0.75 = 52.76 |
| `paid_product maxCpa marginKept 60→50 ⇒ × 1.25` | $100 / 3000 HTO / 5% conv / ROAS 1.0 | 94 × 1.25 = 117.50 |
| `paid_product maxCpa marginKept 60→70 ⇒ × 0.75` | same | 94 × 0.75 = 70.50 |
| `paid_event ROAS-path-driven effectiveTargetCpa does NOT move with marginKept` | aov=100, htoPrice=1000, attendance=100%, close=100%, ROAS=1.0 | effective = 100 at all three margins; max varies (500 / 400 / 300); capApplied = false at every margin |

The ROAS-path fixture deserves a note: with the existing ROAS cap (max = 1.0), the ROAS path can only "win" when the HTO term is large enough that `fullBuyerValue × spendShare(70) > aov/roasTarget`. The example uses `htoPrice=1000, attendance=100%, close=100%, commission=10` to get `fullBuyerValue = 1000`, so at margin 70, `maxCpa = 300 > raw = 100`. The discriminator is `capApplied: false` at every margin row plus `effectiveTargetCpa` constant across margins.

### T027 — `commissionRate` + `marginKept` in `FunnelSettingsDoc`, request, persistence

`FunnelSettingsDoc` (the type returned by `getFunnelSettings`):

```ts
commissionRate: number | null;     // 0–100, nullable
marginKept: 50 | 60 | 70 | null;   // closed enum, nullable
```

Both nullable per data-model.md §1.

`saveFunnelSettings` doc construction (line 463–464) persists them on every funnel type:

```ts
commissionRate: inputs.commissionRate,
marginKept: inputs.marginKept,
```

Frontend (`src/components/FunnelSettingsForm.tsx`):

- `FunnelSettingsDoc` interface extended.
- `SaveFunnelSettingsRequest` interface extended.
- New state: `commissionRate` (default `'10'`), `marginKept` (default `60`).
- Hydration reads both from `settings`, falling back to the defaults if `null`.
- Save payload carries both fields to the backend.
- Optimistic-merge `next` doc carries both fields.

### T028 — sales-commission field in every funnel branch

A single shared `NumberField` renders below the funnel-type-specific block:

```tsx
<NumberField
    label={L('Sales commission (%)', 'عمولة المبيعات (%)')}
    value={commissionRate}
    onChange={setCommissionRate}
    isDarkMode={dk}
/>
```

Applies to all four funnel types (FR-023, FR-018 OQ-1 override). The Arabic/English strings are from `contracts/uiCopy.md` #17.

The benchmark hint #18 (`Typical: 10%`) lands in **T054** (Phase 9).

### T029 — `marginKept` three-button preset (FR-024, FR-025, FR-025a)

A new `MARGIN_OPTIONS` constant follows the `ROAS_OPTIONS` pattern:

```tsx
const MARGIN_OPTIONS: Array<{
    value: 50 | 60 | 70;
    labelAr: string;
    subAr: string;
    subEn: string;
}> = [
    { value: 50, labelAr: '٥٠ — مساحة أكبر للإنفاق', subAr: 'تنفق أكثر مقابل ربح أقل', subEn: 'Spend more, keep less' },
    { value: 60, labelAr: '٦٠ — متوازن', subAr: 'توازن بين الإنفاق والربح', subEn: 'Balanced' },
    { value: 70, labelAr: '٧٠ — ربح أكبر محتفظ به', subAr: 'تنفق أقل مقابل ربح أكبر', subEn: 'Keep more, spend less' },
];
```

Three buttons render below the commission field, mirroring the ROAS_OPTIONS visual pattern (button per option with the same border highlight on selection). **60 preselected for a new record** (state defaults to 60). **No free-entry input** — FR-025a.

The bare-number labels (`50` / `60` / `70` in English; Arabic-Indic `٥٠` / `٦٠` / `٧٠` in Arabic) match `contracts/uiCopy.md` #20. SC-11 guard passes: bare numbers are exempt.

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

PASS/0. Phase 4 form additions did not introduce a hit.

### 4.3 `node lib/__tests__/cpaEconomics.test.js`

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
ok 15 - T026: lead_magnet_call marginKept 60→50 ⇒ effectiveTargetCpl × 1.25 (SC-005)
ok 16 - T026: lead_magnet_call marginKept 60→70 ⇒ effectiveTargetCpl × 0.75 (SC-005)
ok 17 - T026: free_webinar marginKept 60→50 ⇒ effectiveTargetCpl × 1.25 (SC-005)
ok 18 - T026: free_webinar marginKept 60→70 ⇒ effectiveTargetCpl × 0.75 (SC-005)
ok 19 - T026: paid_event maxCpa marginKept 60→50 ⇒ × 1.25 (SC-005)
ok 20 - T026: paid_event maxCpa marginKept 60→70 ⇒ × 0.75 (SC-005)
ok 21 - T026: paid_product maxCpa marginKept 60→50 ⇒ × 1.25 (SC-005)
ok 22 - T026: paid_product maxCpa marginKept 60→70 ⇒ × 0.75 (SC-005)
ok 23 - T026: paid_event ROAS-path-driven effectiveTargetCpa does NOT move with marginKept (SC-005)
ok 24 - lead_magnet_call regression anchor: pre-phase $630 target is gone (T021, constitution IX)
ok 25 - free_webinar: $3000 × 25% × 2% × 0.90 netFactor × 0.40 spendShare → leadValue $13.50, target $5.40 (FR-008)
ok 26 - free_webinar: $997 × 40% × 8% × 0.90 netFactor × 0.40 spendShare → leadValue $28.71, target $11.49
ok 27 - paid_event: ROAS 0.65 (invest-a-bit) works
ok 28 - paid_event: invalid ROAS (e.g. 0.75) throws
ok 29 - paid_event: negative AOV throws
ok 30 - paid_event: NaN htoConversionRate throws
ok 31 - paid_event: htoConversionRate > 100 throws (percentage range cap)
ok 32 - computeAdvisories — paid + aov=$5 → lowValue silent (keys off computed target, NOT aov) (FR-028)
ok 33 - paid_event: commissionRate > 100 throws (FR-027)
ok 34 - paid_event: commissionRate < 0 throws
ok 35 - paid_event: marginKept outside closed enum throws (FR-026)
ok 36 - free_webinar: attendanceRate > 100 throws (percentage range cap)
ok 37 - lead_magnet_call: leadToCloseRate > 100 throws (percentage range cap)
ok 38 - deriveAll — paid_event dispatches to deriveTargetCpa + stamps economicsVersion
ok 39 - deriveAll — lead_magnet_call dispatches to deriveTargetCplLeadMagnetCall + stamps economicsVersion
ok 40 - deriveAll — free_webinar dispatches to deriveTargetCplFreeWebinar + stamps economicsVersion
ok 41 - computeAdvisories — paid + hasHto=false → noHto=true
ok 42 - computeAdvisories — paid + aov=$5 → lowValue silent (keys off computed target, NOT aov) (FR-028)
ok 43 - computeAdvisories — paid no-HTO + aov=$5 + tight margin → lowValue FALSE (computed target $1.50 ≥ $0.50)
ok 44 - computeAdvisories — paid no-HTO + aov=$1 + tight margin → lowValue TRUE (computed target < 0.50)
ok 45 - computeAdvisories — free_webinar + tiny offerPrice → lowValue=true, noHto=false
ok 46 - computeAdvisories — free + offerPrice=$1000 + reasonable rates → no advisories
ok 47 - computeAdvisories — target STILL calculated when an advisory fires (non-blocking)
ok 48 - getEffectiveTarget — paid → CPA
ok 49 - getEffectiveTarget — free → CPL
ok 50 - getEffectiveTarget — stamped payload returns the target (T018 row 1)
ok 51 - getEffectiveTarget — UNSTAMPED payload returns null — pre-phase production shape (T018 row 2, load-bearing)
ok 52 - getEffectiveTarget — version 1 (legacy) returns null (T018 row 3)
ok 53 - getEffectiveTarget — stamped payload with no branch returns null (T018 row 4)
# tests 53
# pass 53
# fail 0
```

**53/53 pass.** (Was 44 in Phase 3; +9 from T026 fixtures.) Audit per AGENTS.md 0b applied — all 53 names match their assertions.

### 4.4 `node lib/__tests__/funnelSettings.contract.test.js`

```
ok 1 - contract — paid_event: AOV $43 + HTO $3500 + 75% attend, 7.5% close + ROAS 1.0 → effectiveTargetCpa $43, no warning
ok 2 - contract — paid_event: same inputs + ROAS 0.5 → cap silent, effective follows raw
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

**20/20 pass.** Same count as Phase 3; the `FunnelSettingsDoc` literal at test 20 was extended with the new `commissionRate`/`marginKept` fields for the typecheck to pass.

### 4.5 `npm run test:phase14` (full Phase 14 sweep)

```
# tests 18 — pass 18 — fail 0    (targetingContext)
# tests 11 — pass 11 — fail 0    (campaignObjective)
# tests 12 — pass 12 — fail 0    (canonicalAngle)
# tests 53 — pass 53 — fail 0    (cpaEconomics)        ← Phase 4 lands here
# tests 20 — pass 20 — fail 0    (funnelSettings)      ← Phase 4 ripple
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

**265 tests across 14 files; 265 pass, 0 fail.** (Was 256 in Phase 3; +9 from T026 fixtures.)

### 4.6 Frontend typecheck

`npx tsc -b` exits 0.

---

## 5. US2 independent-test outcome

Per Phase 4 §3 plan: "Set commission 0 vs 10 and confirm targets move by exactly the commission share; move margin across all three presets and confirm the retained-share scaling."

**Commission 0 vs 10 — lead-magnet-call ($3000 / 7.5% / 70% / 22.5%, margin 60):**

| `commissionRate` | `netFactor` | `leadValue` | `effectiveTargetCpl` |
|---:|---:|---:|---:|
| 0 | 1.00 | 35.4375 | 14.18 |
| 10 | 0.90 | 31.8938 | 12.76 |

Effective target moves by exactly the commission's share: `14.18 / 12.76 = 1.1111...` ≈ `1/(1 − 0.10) = 1.1111...` ✓

**Margin 60 → 50 → 70 — same inputs:**

| `marginKept` | `spendShare` | `effectiveTargetCpl` |
|---:|---:|---:|
| 50 | 0.50 | 15.95 |
| 60 | 0.40 | 12.76 |
| 70 | 0.30 | 9.57 |

`12.76 × 1.25 = 15.95` ✓ and `12.76 × 0.75 = 9.57` ✓ (T026 tests 15-16 pin these exactly).

US2 is independently shippable. **Combined with US1, the minimum viable correction is complete.**

---

## 6. Deviations from the plan

One judgment call worth recording:

- **ROAS-path-doesn't-move fixture uses `htoPrice=1000, attendance=100%, close=100%`** — these are aggressive numbers, but they're necessary because the contract requires `raw < maxCpa(marginKept=70)` for the ROAS path to win at the tightest margin. The contract §4.8 implicitly assumes a funnel type where the ROAS path *can* win; under the closed ROAS enum (1.0/0.65/0.5), a no-HTO funnel's maxCpa is bounded by `aov × 0.30` at margin 70, which never exceeds `aov/1.0 = aov`. The HTO term is the only way to push the ROAS path over the top. The fixture is the smallest non-trivial case.

No other deviations.

---

## 7. Risks remaining at the end of Phase 4

- **Phase 5 unblock required for deploy** — `FunnelSettingsDoc` now declares `commissionRate` + `marginKept` and `saveFunnelSettings` persists them. The save round-trip is complete for all four funnel types. Phase 5's completeness gate (`isSettingsComplete` / `missingRequiredFields`) is the only remaining piece before deploy.
- **`buildFunnelInputsFromDoc` still exists** — dead code with DEFAULT_* defaults. Phase 5 must delete it (per the strengthened criterion — deletion only).
- **Frontend lint warning (pre-existing)** — `setState-in-effect` at the hydration `useEffect`. Not introduced by Phase 4; recorded for future cleanup.

---

## 8. Phase 5 unblock

**Recommendation**: Phase 5 (US7 — Incomplete records gate safely, owner not pushed) may begin. All 6 tasks of Phase 4 are reported. The corrected funnel-economics formulas, the version gate, the shared commission/margin inputs, and the new form fields are all in place. US1 + US2 = minimum viable correction. Phase 5 adds the completeness gate that protects the learning loop and surfaces the missing-record state to the owner — without it, deploying the corrected math would let the next nightly sync re-judge historical ads against it.

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

# 4. Run the Phase 4 unit tests
cd functions; npm run build; node lib/__tests__/cpaEconomics.test.js
# Expect: 53 ok, "# tests 53 / # pass 53 / # fail 0", exit 0

# 5. Run the affected contract test
cd functions; node lib/__tests__/funnelSettings.contract.test.js
# Expect: 20 ok, "# tests 20 / # pass 20 / # fail 0", exit 0

# 6. Full Phase 14 sweep
cd functions; npm run test:phase14          # 265/265 across 14 files, exit 0
```
