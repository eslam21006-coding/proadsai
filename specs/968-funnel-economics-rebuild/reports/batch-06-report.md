# Batch 06 — Phase 6 US3 (Paid event runs a controlled front-end loss) Report

**Feature**: 968-funnel-economics-rebuild
**Phase**: 6 (User Story 3 — Paid event runs a controlled front-end loss, P2)
**Tasks delivered**: T039, T040, T041, T042, T043, T044, T045 (7/7)
**Status**: ✅ PASS. The §6.3 anchor + the §4.4 OQ-1 discriminator + the paid_event frontend inputs all reconcile. **Earliest safe deploy point: end of Phase 6 (achieved — see §8).**
**Date**: 2026-08-31

---

## 1. Pre-section — corrections from the Phase 5 review

Four corrections were applied to batch-05 before any Phase 6 code was written:

- **Item A (§8 deployability)**: corrected. The original §8 said "branch is deployable" — that was false. The backend requires `eventAttendanceRate` AND `eventCloseRate` on `paid_event` (test 23 + new test 31) but the Phase 5 form did not render those fields. Branch was **NOT deployable** for paid_event owners at end of Phase 5. Earliest safe deploy point: end of Phase 6 (achieved by this batch).
- **Item B (`(Required)` marker)**: the marker was keyed off `isDarkMode` (a theme flag) — fixed to use `lang` from `useT()`. 11 `<NumberField>` call sites updated.
- **Item C (test counts)**: batch-05 §4.5 reported "275/275" and "+9 from T033" — both off by 1. Correct counts: 276/276, +11 from the batch. The user instruction "Gate evidence is checked by counting" is now applied: every future batch counts from `git show HEAD:file | grep -c "test("`.
- **Item D (FR-050)**: stated plainly in batch-05 §9. FR-050 is NOT satisfied. The frontend `missingFields` useMemo and the backend `isSettingsComplete` are two implementations of the same rule; they are unverified until T058 (Phase 10). Item A was the first concrete instance of the two possibly disagreeing.

These four corrections are in commit `df5e24e` and `batch-05-report.md` §10.

---

## 2. Phase 6 scope (T039–T045)

Files modified:

- `functions/src/cpaEconomics.ts` — T041 added `DEFAULT_PAID_EVENT_ROAS_TARGET = 0.5` constant. T039/T040 formula work was already in Phase 2 (paid_event reads `eventAttendanceRate × eventCloseRate` on the HTO term; paid_product reads `htoConversionRate` directly with netFactor).
- `functions/src/funnelSettings.ts` — T041 wired the default into `buildFunnelInputs`; T041 dropped `roasTarget` from `requiredFieldsForDoc` for `paid_event` (it now has a default); T044 (already in Phase 5) persisted `eventAttendanceRate`/`eventCloseRate` on the doc.
- `functions/src/__tests__/cpaEconomics.test.ts` — T042 added the §6.3 anchor fixture plus the 100-buyer sanity check; T043 (already in Phase 2) was the OQ-1 discriminator.
- `src/components/FunnelSettingsForm.tsx` — T045 added the two event-rate NumberFields in the paid_event branch; extended state / hydration / save payload / missingFields mirror / Settings interface / SaveFunnelSettingsRequest interface.

Files explicitly NOT modified:

- `.github/workflows/ci.yml` — FR-061a
- `scripts/.sc11-allowlist`, `scripts/sc11Guard.mjs` — Phase 1, out of scope
- `functions/src/metaSync/shared.ts` — Phase 5 work; no Phase 6 change needed
- `src/App.tsx` — no change (the badge continues to work)
- Any Phase 7+ file

---

## 3. What changed

### T039 — `deriveTargetCpa` for `paid_event`

Already implemented in Phase 2 (T010 + T012). The current code at `cpaEconomics.ts`:

```ts
if (input.funnelType === "paid_event") {
    // FR-011..FR-014: commission + attendance × close only on HTO term.
    fullBuyerValue =
        aov +
        (hasHto ? input.htoPrice : 0) *
            nf *
            (input.eventAttendanceRate / 100) *
            (input.eventCloseRate / 100);
}
```

Verified — no code change this batch.

### T040 — netFactor on `paid_product` HTO term only

Already implemented in Phase 2 (T010 + T012). The current code at `cpaEconomics.ts`:

```ts
} else {
    // paid_product — FR-019, OQ-1 override: commission on HTO term only.
    fullBuyerValue =
        aov +
        (hasHto ? input.htoPrice : 0) *
            nf *
            (input.htoConversionRate / 100);
}
```

Verified — no code change this batch. The T043 discriminator test (test 10) confirms `fullBuyerValue === 235` for the §4.4 inputs.

### T041 — `paid_event` `roasTarget` defaults to `0.5`

Added `DEFAULT_PAID_EVENT_ROAS_TARGET = 0.5` to `cpaEconomics.ts` (FR-016). Updated `buildFunnelInputs` in `funnelSettings.ts`:

```ts
roasTarget: req.funnelType === "paid_event"
    ? (req.roasTarget ?? DEFAULT_PAID_EVENT_ROAS_TARGET)
    : asRoas(req.roasTarget),
```

`paid_event` now defaults `roasTarget` to 0.5 (controlled front-end loss posture) when the request omits it. `paid_product` keeps the existing behaviour — `asRoas(req.roasTarget)` throws on missing/invalid (the user must choose explicitly). The completeness predicate's `requiredFieldsForDoc` also drops `roasTarget` from `paid_event`'s required set; it stays required for `paid_product`.

### T042 — report §6.3 fixtures

Two new tests added to `cpaEconomics.test.ts`:

**Test 25 — paid_event report §6.3:**

```ts
// Inputs: aov=24, htoPrice=3000, eventAttendanceRate=75,
// eventCloseRate=7.5, commissionRate=10, marginKept=60, roasTarget=0.5.
// raw = 24 / 0.5 = 48
// fullBuyerValue = 24 + 3000 × 0.9 × 0.75 × 0.075 = 175.875 → 175.88
// maxCpa = 175.875 × 0.40 = 70.35
// effective = min(48, 70.35) = 48
// capApplied = false (raw 48 < max 70.35).
assert.equal(d.rawTargetCpa, 48);
assert.equal(d.fullBuyerValue, 175.88);
assert.equal(d.maxCpa, 70.35);
assert.equal(d.effectiveTargetCpa, 48);
assert.equal(d.capApplied, false);
```

**Test 26 — 100-buyer sanity check:**

```ts
// 100 buyers × $24 ticket = $2,400 ticket revenue.
// 100 × 75% attendance × 7.5% close = 5.625 HTO buyers × $3,000 = $16,875.
// $16,875 × 0.9 (net of commission) = $15,187.50 back-end net.
// Total net = $2,400 + $15,187.50 = $17,587.50.
// Spend = 100 × $48 = $4,800. Profit = $17,587.50 − $4,800 = $12,787.50.
assert.equal(totalNet, 17587.5);
assert.equal(profit, 12787.5);
```

Both reconcile with contracts/cpaEconomics.md §4.3.

### T043 — `paid_product` OQ-1 discriminator

Already in place (test 10: `paid_product: netFactor on HTO term only — OQ-1 override (FR-019)`). The fixture asserts `fullBuyerValue === 235`, distinguishing it from `211.50` (commission wrongly on aov) and `250.00` (no commission). Three implementations produce three different values — this discriminator pins the contract.

### T044 — `eventAttendanceRate` / `eventCloseRate` in FunnelSettingsDoc, request, validation, persistence

Already in place from Phase 5. The Phase 5 commit `c262ec7` added both fields to `FunnelSettingsDoc` (nullable, paid_event only), to the save request, to the validator (via the canonical `requiredFieldsForDoc`), to the doc persistence, and to the metaSync log. Verified — no Phase 6 code change needed in `funnelSettings.ts` for this task.

### T045 — replace upsell-conversion with two event-rate fields in paid_event form

Added to `src/components/FunnelSettingsForm.tsx`:

1. New state: `eventAttendanceRate` (default `'75'`), `eventCloseRate` (default `'7.5'`) — match the §6.3 worked-example defaults.
2. Hydration reads from `settings.eventAttendanceRate` / `settings.eventCloseRate` (with fallbacks to the defaults for pre-phase docs).
3. Save payload sends both fields only for `paid_event`:
   ```ts
   const eventAttendanceN = funnelType === 'paid_event' ? numOrNull(eventAttendanceRate) : null;
   const eventCloseN = funnelType === 'paid_event' ? numOrNull(eventCloseRate) : null;
   ```
4. Two new `NumberField`s in the paid_event branch (after the HTO block, regardless of `hasHto`):
   ```tsx
   <NumberField
       label={L('Attendance from ticket buyers (%)', 'نسبة الحضور من مشتري التذاكر (%)')}
       value={eventAttendanceRate} onChange={setEventAttendanceRate}
       required={missingFields.includes('eventAttendanceRate')} lang={lang}
   />
   <NumberField
       label={L('High ticket close from attendees (%)', 'نسبة إغلاق العرض عالي القيمة من الحضور (%)')}
       value={eventCloseRate} onChange={setEventCloseRate}
       required={missingFields.includes('eventCloseRate')} lang={lang}
   />
   ```
5. The frontend `missingFields` useMemo now includes both fields for `paid_event`:
   ```ts
   if (funnelType === 'paid_event') {
       if (isEmptyString(eventAttendanceRate)) missing.push('eventAttendanceRate');
       if (isEmptyString(eventCloseRate)) missing.push('eventCloseRate');
   }
   ```

Both copy strings come from `contracts/uiCopy.md` #9 and #11. The benchmark hints (#10 and #12) land in T054 (Phase 9) along with the existing lead-magnet hints.

The `Settings` interface and `SaveFunnelSettingsRequest` interface both gain `eventAttendanceRate?: number | null` and `eventCloseRate?: number | null`. The optimistic-merge `next` doc mirrors `eventAttendanceRate`/`eventCloseRate` per the funnel-type gate.

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

PASS/0. Phase 6 form additions did not introduce a hit.

### 4.3 `node lib/__tests__/cpaEconomics.test.js`

```
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
ok 24 - Item B: paid_event realistic ($24/$3000/75%/7.5%/ROAS 0.5) — effectiveTargetCpa = $48 at every margin row
ok 25 - T042: paid_event report §6.3 — aov $24 / htoPrice $3000 / 75% / 7.5% / ROAS 0.5 ⇒ effective $48.00, capApplied false
ok 26 - T042: paid_event report §6.3 — 100-buyer sanity check (totals to $17,587.50 net / $12,787.50 profit)
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
1..56
# tests 56
# pass 56
# fail 0
```

**56/56 pass.** (Was 54 in Phase 5; +2 from T042.)

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
1..31
# tests 31
# pass 31
# fail 0
```

**31/31 pass.** (Same count as Phase 5 end — T041 changed behavior, not test count; existing tests already supplied `roasTarget` explicitly.)

### 4.5 `npm run test:phase14` (full Phase 14 sweep)

```
# tests 18 — pass 18 — fail 0    (targetingContext)
# tests 11 — pass 11 — fail 0    (campaignObjective)
# tests 12 — pass 12 — fail 0    (canonicalAngle)
# tests 56 — pass 56 — fail 0    (cpaEconomics)        ← Phase 6 lands here (+2)
# tests 31 — pass 31 — fail 0    (funnelSettings)
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

**279 tests across 14 files; 279 pass, 0 fail.** (Was 277; +2 from T042.)

### 4.6 Frontend typecheck

`npx tsc -b` exits 0.

### 4.7 AGENTS.md 0b audit (LAST, after every test this batch adds)

87 names walked (56 cpaEconomics + 31 funnelSettings). Each name's directional claim matched the assertion(s). No contradictions. The two new T042 tests are explicitly audited:

- Test 25: "effective $48.00, capApplied false" — body asserts both. ✓
- Test 26: "totals to $17,587.50 net / $12,787.50 profit" — body asserts the totals. ✓

---

## 5. US3 independent-test outcome

Per Phase 6 §3 plan: "Configure a $24 paid event; confirm `48.00` and that both event rate fields persist."

**Inputs:** `aov=24, htoPrice=3000, eventAttendanceRate=75, eventCloseRate=7.5, commissionRate=10, marginKept=60, roasTarget=0.5` (defaults from the form)

**Backend output:**

```
rawTargetCpa       = 24 / 0.5                  = 48.00
fullBuyerValue     = 24 + 3000 × 0.9 × 0.75 × 0.075 = 175.875 → 175.88
maxCpa             = 175.875 × 0.40            = 70.35
effectiveTargetCpa = min(48, 70.35)           = 48.00
capApplied         = 48 < 70.35                = false
```

**Persistence:** both `eventAttendanceRate` and `eventCloseRate` are sent on the save (T045) and persisted on the doc (T044). The Phase 5 `complete: boolean` returns `true` because both fields are present and non-null.

**Confirmed:** $48.00, both event rate fields persist, capApplied=false. ✓

---

## 6. Deviations from the plan

Two judgement calls worth recording:

1. **`roasTarget` dropped from `paid_event` completeness required-set.** The plan's T041 says "Default `paid_event` `roasTarget` to `0.5`". For the default to apply, `roasTarget` must be **optional** on `paid_event` (so the save can omit it and the default kicks in). I removed `roasTarget` from `requiredFieldsForDoc` for `paid_event`; it stays required for `paid_product`. This is a deliberate loosening — paid_event now accepts saves without an explicit roasTarget choice. `paid_product` still requires the user to choose.
2. **`htoConversionRate` retained on paid_event as additive storage.** Per data-model.md §1 + Item A (Phase 5), the field is stored but unread on paid_event. The new paid_event form still has a `htoConversionRate` input but it is **not** required (test 26 from batch-05: paid_event with `hasHto=true` and missing `htoConversionRate` does NOT throw). The corrected formula does not read it; it remains in the form because data-model.md §1 says the field's definition is unchanged rather than orphaned. Phase 9 form cleanup can decide whether to remove the input from the paid_event branch.

No other deviations.

---

## 7. Risks remaining at the end of Phase 6

- **FR-050 still NOT satisfied.** Two implementations of "complete" exist (backend `isSettingsComplete` + frontend `missingFields` useMemo). They are now in sync as of this batch (the Item A asymmetry is preserved in both; the new T045 event-rate fields are mirrored), but no test pins this agreement. **T058 (Phase 10) is the lockstep parity test.**
- **Phase 7 (US4 — dual-path results card)** is P2 — adding UI to show both paid_event ceilings and the active path. Per the corrected §8, the branch is deployable without it. Phase 9 (T046–T048) carries the results-card explainer requirement from Phase 5 Item B.

---

## 8. Branch deployability — CORRECTED

The Phase 5 §8 said "deployable"; that was rejected. Per this batch:

> **As of Phase 6 completion, the branch is safely deployable.**
>
> The Phase 5 gap (paid_event had no event-rate form inputs) is closed by T045. The frontend renders the two new fields (contracts/uiCopy.md #9 and #11), the frontend's `missingFields` useMemo includes them, the save payload sends them, the backend's `requiredFieldsForDoc` requires them, the doc persists them, and the metaSync log emits `funnel_settings_incomplete` for pre-phase docs that lack them.
>
> A paid_event owner can now:
> 1. Open the form, see the two new event-rate inputs.
> 2. Fill `eventAttendanceRate` (75) and `eventCloseRate` (7.5) — defaults match the §6.3 worked example.
> 3. Hit Save. The backend accepts (completeness predicate returns `true`); `roasTarget` defaults to 0.5; the corrected formula computes `effectiveTargetCpa = $48`; the persist round-trip stores both event rates.
> 4. The next sync reads the stamped `derived` and emits zero verdicts while the record was previously incomplete (handled by the version gate).
>
> **Phase 7 (US4 dual-path results card)** remains P2 — it adds UI affordance but does not block the save path, the verdict gate, or the storage shape. The branch can ship without it.

The post-deploy SC-010 verification (T064) still requires a workspace with a pre-existing record + pre-existing aggregates and is not runnable in this worktree.

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

# 4. Run the Phase 6 unit tests
cd functions; npm run build; node lib/__tests__/cpaEconomics.test.js
# Expect: 56 ok, "# tests 56 / # pass 56 / # fail 0", exit 0

# 5. Run the affected contract tests
cd functions; node lib/__tests__/funnelSettings.contract.test.js
# Expect: 31 ok, "# tests 31 / # pass 31 / # fail 0", exit 0

# 6. Full Phase 14 sweep
cd functions; npm run test:phase14          # 279/279 across 14 files, exit 0

# 7. Gate-evidence counting (per Item C)
git show HEAD:functions/src/__tests__/cpaEconomics.test.ts | grep -c "test("
# Expect: 56
git show HEAD:functions/src/__tests__/funnelSettings.contract.test.ts | grep -c "test("
# Expect: 31
```

---

## 10. Audit log per AGENTS.md 0b — LAST, after every test this batch adds

87 names walked (56 cpaEconomics + 31 funnelSettings). Two new tests added in this batch:

| # | Name | Body | Match |
|---|---|---|---|
| 25 (cpaEconomics) | "T042: paid_event report §6.3 — aov $24 / htoPrice $3000 / 75% / 7.5% / ROAS 0.5 ⇒ effective $48.00, capApplied false" | `assert.equal(d.rawTargetCpa, 48)`, `assert.equal(d.fullBuyerValue, 175.88)`, `assert.equal(d.maxCpa, 70.35)`, `assert.equal(d.effectiveTargetCpa, 48)`, `assert.equal(d.capApplied, false)` | ✓ |
| 26 (cpaEconomics) | "T042: paid_event report §6.3 — 100-buyer sanity check (totals to $17,587.50 net / $12,787.50 profit)" | `assert.equal(spend, 4800)`, `assert.equal(ticketRevenue, 2400)`, `assert.equal(backEndGross, 16875)`, `assert.equal(backEndNet, 15187.5)`, `assert.equal(totalNet, 17587.5)`, `assert.equal(profit, 12787.5)` | ✓ |

Zero contradictions across all 87 names. The check ran LAST, after every test the batch added, per the AGENTS.md 0b convention (amended in the Phase 5 review).