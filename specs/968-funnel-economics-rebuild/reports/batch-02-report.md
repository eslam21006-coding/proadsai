# Batch 02 — Phase 2 Foundational Report

**Feature**: 968-funnel-economics-rebuild
**Phase**: 2 (Foundational — blocks every user story)
**Tasks delivered**: T010, T011, T012, T013, T014, T015, T016, T017, T017a, T018 (10/10)
**Status**: ✅ PASS. Phase 3 unblocked.
**Date**: 2026-08-31

---

## 1. Scope

Files modified in this invocation:

- `functions/src/cpaEconomics.ts` — formulas rewritten, version stamp added, version gate added, shared helpers added, validation extended, signature change for `computeAdvisories`
- `functions/src/funnelSettings.ts` — `computeAdvisories` call sites updated for the new second-argument signature; `SaveFunnelSettingsRequest` + `assertRequiredFieldPresent` + `buildFunnelInputs` + `buildFunnelInputsFromDoc` extended for the new shared fields
- `functions/src/__tests__/cpaEconomics.test.ts` — fixtures extended for new fields, `computeAdvisories` 2-arg calls, T014 (removed constant assertions), T018 (version-gate fixtures)
- `functions/src/__tests__/funnelSettings.contract.test.ts` — fixtures + expected outputs updated for the new formula
- `functions/src/__tests__/qararEngine.test.ts` — `DerivedTargets` literals stamped with `economicsVersion: 2`
- `functions/src/__tests__/learningIntegration.test.ts` — `DerivedTargets` literal stamped with `economicsVersion: 2`
- `AGENTS.md` — section 0a added (batch-report convention)

Files explicitly NOT modified (per user input):

- `.github/workflows/ci.yml` — FR-061a
- `scripts/.sc11-allowlist` and `scripts/sc11Guard.mjs` — Phase 1, out of scope
- `functions/src/metaSync/shared.ts` — FR-042 log belongs to Phase 5; only the bounded change there is approved
- Any Phase 3+ file

---

## 2. What changed

### T010 — new fields on every input interface + `MarginKept` type

Added to `functions/src/cpaEconomics.ts`:

- `PaidFunnelInputs`: `eventAttendanceRate: number`, `eventCloseRate: number`, `commissionRate: number`, `marginKept: MarginKept`
- `FreeWebinarInputs`: `commissionRate: number`, `marginKept: MarginKept`
- `LeadMagnetCallInputs`: `bookingRate: number`, `showUpRate: number`, `commissionRate: number`, `marginKept: MarginKept`

`MarginKept = 50 | 60 | 70` is the closed-enum type (FR-026).

### T011 — added constants + FR-041a obligation

`ECONOMICS_VERSION = 2 as const` — stamped on every `DerivedTargets`. The FR-041a obligation is recorded inline next to the constant: **any future phase adding a required field to `DerivedTargets` MUST bump this**.

`LOW_VALUE_TARGET_THRESHOLD = 0.50` — replaces the role of the legacy `LOW_VALUE_THRESHOLD = 9` price trigger.

`ALL_MARGIN_KEPT = [50, 60, 70]`, `DEFAULT_MARGIN_KEPT = 60`, `DEFAULT_COMMISSION_RATE = 10`.

`LOW_VALUE_THRESHOLD = 9` is retained as a deprecated constant (Phase 8 T049 removes it for good). It is no longer used by `computeAdvisories`.

### T012 — shared pure helpers

```ts
spendShare(marginKept)   // (100 - marginKept) / 100
netFactor(commissionRate) // (100 - commissionRate) / 100
```

Both exported for downstream use and tested.

### T013 — removed constants

`FULL_FUNNEL_ROAS_FLOOR` and `ECONOMIC_CEILING_MULTIPLIER` are removed. No fallback retained (FR-002). The paid branch's `maxCpa` is now `fullBuyerValue × spendShare`, not `fullBuyerValue / 2.0`.

### T014 — test assertions for removed constants deleted

`functions/src/__tests__/cpaEconomics.test.ts` lines 26–32 (pre-phase) asserted the values of the now-removed constants. They are deleted. The `LOW_VALUE_THRESHOLD = 9` assertion at the next test stays (Phase 8 owns its removal).

### T015 — every `DerivedTargets` carries `economicsVersion`

`deriveAll` now returns:

```ts
{ economicsVersion: 2, paid?: PaidDerived, free?: FreeDerived, computedAt: number }
```

The stamp is load-bearing: pre-phase payloads carry no stamp, and `getEffectiveTarget` returns `null` because of that absence — not because anyone wrote anything.

### T016 — `getEffectiveTarget` version gate

```ts
if (derived.economicsVersion !== ECONOMICS_VERSION) return null;
```

This is the mechanism that protects the learning loop from re-judging historical ads against the corrected math. Every pre-phase `{ free: { effectiveTargetCpl: 630 } }` shape returns `null`.

### T017 — validation

`assertCommissionRate` (FR-027): 0–100 inclusive, finite, non-negative. `0` and `100` both valid.

`assertMarginKept` (FR-026): must be one of `50 | 60 | 70`. Anything else throws.

### T017a — `computeAdvisories` signature change

```ts
// before
export function computeAdvisories(input: FunnelInputs): Advisories;

// after
export function computeAdvisories(input: FunnelInputs, derived: DerivedTargets): Advisories;
```

The `lowValue` advisory now keys off the **rounded computed target** (`< 0.50`), not the entered price (FR-028). The signature change is in the foundational phase per plan F9 so Phases 3–7 build against the final shape.

`funnelSettings.ts` was updated at both call sites (line 333 probe; line 341 post-validation). Both now pass `deriveAll(...)` result as the second argument.

### T018 — version-gate fixtures

`functions/src/__tests__/cpaEconomics.test.ts` gains four `getEffectiveTarget` fixtures matching contract §4.7:

| Input | Expected |
|---|---|
| `{ economicsVersion: 2, free: { effectiveTargetCpl: 12.76, … } }` | `12.76` |
| `{ free: { effectiveTargetCpl: 630, … } }` (no stamp — pre-phase) | **`null`** ← load-bearing |
| `{ economicsVersion: 1, free: { … } }` | `null` |
| `{ economicsVersion: 2 }` (no branch) | `null` |

Plus a sweep test asserting every `deriveAll` path stamps `economicsVersion: 2` and produces a non-null `getEffectiveTarget` return (i.e. the gate doesn't regress current-state inputs).

---

## 3. Test outcomes (raw command output)

### 3.1 `npm run test:guard` (Phase 1 — confirm no regression)

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

22/22 pass. Phase 1 stays green.

### 3.2 `node lib/__tests__/cpaEconomics.test.js` (Phase 2 unit tests)

```
TAP version 13
# Subtest: constants — ECONOMICS_VERSION = 2 (R-1, FR-041)
ok 1 - constants — ECONOMICS_VERSION = 2 (R-1, FR-041)
# Subtest: constants — LOW_VALUE_TARGET_THRESHOLD = 0.50 (FR-028)
ok 2 - constants — LOW_VALUE_TARGET_THRESHOLD = 0.50 (FR-028)
# Subtest: constants — LOW_VALUE_THRESHOLD = 9 (legacy price-based — removed in Phase 8 T049)
ok 3 - constants — LOW_VALUE_THRESHOLD = 9 (legacy price-based — removed in Phase 8 T049)
# Subtest: spendShare — 50/60/70 map to 0.50/0.40/0.30
ok 4 - spendShare — 50/60/70 map to 0.50/0.40/0.30
# Subtest: netFactor — 0/10/100 map to 1.00/0.90/0.00
ok 5 - netFactor — 0/10/100 map to 1.00/0.90/0.00
# Subtest: paid_event: AOV $43 + HTO $3500 @ 75% attend, 7.5% close + ROAS 1.0
ok 6 - paid_event: AOV $43 + HTO $3500 @ 75% attend, 7.5% close + ROAS 1.0
# Subtest: paid_event: ROAS 0.5 path — cap warning fires when raw exceeds maxCpa
ok 7 - paid_event: ROAS 0.5 path — cap warning fires when raw exceeds maxCpa
# Subtest: paid_event: no HTO + ROAS 1.0 — fullBuyerValue collapses to AOV
ok 8 - paid_event: no HTO + ROAS 1.0 — fullBuyerValue collapses to AOV
# Subtest: paid_event: commissionRate 100 zeroes netFactor → HTO term 0 → fullBuyerValue = AOV
ok 9 - paid_event: commissionRate 100 zeroes netFactor → HTO term 0 → fullBuyerValue = AOV
# Subtest: paid_product: netFactor on HTO term only — OQ-1 override (FR-019)
ok 10 - paid_product: netFactor on HTO term only — OQ-1 override (FR-019)
# Subtest: paid: equality raw == max → NO warn (FR-003)
ok 11 - paid: equality raw == max → NO warn (FR-003)
# Subtest: lead_magnet_call: $3000 × 7.5% × 70% × 22.5% × 0.90 netFactor × 0.40 spendShare → target $12.76 (FR-005)
ok 12 - lead_magnet_call: $3000 × 7.5% × 70% × 22.5% × 0.90 netFactor × 0.40 spendShare → target $12.76 (FR-005)
# Subtest: free_webinar: $3000 × 25% × 2% × 0.90 netFactor × 0.40 spendShare → leadValue $13.50, target $5.40 (FR-008)
ok 13 - free_webinar: $3000 × 25% × 2% × 0.90 netFactor × 0.40 spendShare → leadValue $13.50, target $5.40 (FR-008)
# Subtest: free_webinar: $997 × 40% × 8% × 0.90 netFactor × 0.40 spendShare → leadValue $28.71, target $11.49
ok 14 - free_webinar: $997 × 40% × 8% × 0.90 netFactor × 0.40 spendShare → leadValue $28.71, target $11.49
# Subtest: paid_event: ROAS 0.65 (invest-a-bit) works
ok 15 - paid_event: ROAS 0.65 (invest-a-bit) works
# Subtest: paid_event: invalid ROAS (e.g. 0.75) throws
ok 16 - paid_event: invalid ROAS (e.g. 0.75) throws
# Subtest: paid_event: negative AOV throws
ok 17 - paid_event: negative AOV throws
# Subtest: paid_event: NaN htoConversionRate throws
ok 18 - paid_event: NaN htoConversionRate throws
# Subtest: paid_event: htoConversionRate > 100 throws (percentage range cap)
ok 19 - paid_event: htoConversionRate > 100 throws (percentage range cap)
# Subtest: paid_event: commissionRate > 100 throws (FR-027)
ok 20 - paid_event: commissionRate > 100 throws (FR-027)
# Subtest: paid_event: commissionRate < 0 throws
ok 21 - paid_event: commissionRate < 0 throws
# Subtest: paid_event: marginKept outside closed enum throws (FR-026)
ok 22 - paid_event: marginKept outside closed enum throws (FR-026)
# Subtest: free_webinar: attendanceRate > 100 throws (percentage range cap)
ok 23 - free_webinar: attendanceRate > 100 throws (percentage range cap)
# Subtest: lead_magnet_call: leadToCloseRate > 100 throws (percentage range cap)
ok 24 - lead_magnet_call: leadToCloseRate > 100 throws (percentage range cap)
# Subtest: deriveAll — paid_event dispatches to deriveTargetCpa + stamps economicsVersion
ok 25 - deriveAll — paid_event dispatches to deriveTargetCpa + stamps economicsVersion
# Subtest: deriveAll — lead_magnet_call dispatches to deriveTargetCplLeadMagnetCall + stamps economicsVersion
ok 26 - deriveAll — lead_magnet_call dispatches to deriveTargetCplLeadMagnetCall + stamps economicsVersion
# Subtest: deriveAll — free_webinar dispatches to deriveTargetCplFreeWebinar + stamps economicsVersion
ok 27 - deriveAll — free_webinar dispatches to deriveTargetCplFreeWebinar + stamps economicsVersion
# Subtest: computeAdvisories — paid + hasHto=false → noHto=true
ok 28 - computeAdvisories — paid + hasHto=false → noHto=true
# Subtest: computeAdvisories — paid + aov=$5 → lowValue fires only via computed target, NOT aov (FR-028)
ok 29 - computeAdvisories — paid + aov=$5 → lowValue fires only via computed target, NOT aov (FR-028)
# Subtest: computeAdvisories — paid no-HTO + aov=$5 + tight margin → lowValue TRUE (computed target < 0.50)
ok 30 - computeAdvisories — paid no-HTO + aov=$5 + tight margin → lowValue TRUE (computed target < 0.50)
# Subtest: computeAdvisories — free_webinar + tiny offerPrice → lowValue=true, noHto=false
ok 31 - computeAdvisories — free_webinar + tiny offerPrice → lowValue=true, noHto=false
# Subtest: computeAdvisories — free + offerPrice=$1000 + reasonable rates → no advisories
ok 32 - computeAdvisories — free + offerPrice=$1000 + reasonable rates → no advisories
# Subtest: computeAdvisories — target STILL calculated when an advisory fires (non-blocking)
ok 33 - computeAdvisories — target STILL calculated when an advisory fires (non-blocking)
# Subtest: getEffectiveTarget — paid → CPA
ok 34 - getEffectiveTarget — paid → CPA
# Subtest: getEffectiveTarget — free → CPL
ok 35 - getEffectiveTarget — free → CPL
# Subtest: getEffectiveTarget — stamped payload returns the target (T018 row 1)
ok 36 - getEffectiveTarget — stamped payload returns the target (T018 row 1)
# Subtest: getEffectiveTarget — UNSTAMPED payload returns null — pre-phase production shape (T018 row 2, load-bearing)
ok 37 - getEffectiveTarget — UNSTAMPED payload returns null — pre-phase production shape (T018 row 2, load-bearing)
# Subtest: getEffectiveTarget — version 1 (legacy) returns null (T018 row 3)
ok 38 - getEffectiveTarget — version 1 (legacy) returns null (T018 row 3)
# Subtest: getEffectiveTarget — stamped payload with no branch returns null (T018 row 4)
ok 39 - getEffectiveTarget — stamped payload with no branch returns null (T018 row 4)
# Subtest: getEffectiveTarget — every deriveAll path stamps economicsVersion: 2 (T015 invariant)
ok 40 - getEffectiveTarget — every deriveAll path stamps economicsVersion: 2 (T015 invariant)
1..40
# tests 40
# pass 40
# fail 0
```

**40/40 pass.**

### 3.3 `node lib/__tests__/funnelSettings.contract.test.js`

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

**20/20 pass.**

### 3.4 `node lib/__tests__/qararEngine.test.js`

```
ok 1 - data gate: low impressions AND ad < 48h → ⏳ (insufficient data)
ok 2 - data gate: 2500 impressions but ad < 48h → ⏳
ok 3 - data gate: spends target but ad < 48h → ⏳
ok 4 - data gate: passes → falls through to other rules
ok 5 - CB2: today spend ≥ 2.5x target, 0 conversions, conversion → 🔴 CB2
ok 6 - CB1: today spend ≥ 1.5x target, 0 conversions, conversion → 🟡 CB1
ok 7 - CB2 takes priority over CB1 when both thresholds met
ok 8 - CB2: on 'other' campaign → does NOT fire (SC-12)
ok 9 - K3: Link CTR < 0.5% after 2000 impressions, conversion → 🔴 K3
ok 10 - K3: fires for 'other' campaign too (K3 applies to all objectives)
ok 11 - K3: early-callable at 1500 impressions when CTR is terrible
ok 12 - K4: day-1 peak then ≥ 50% drop → 🔴 K4
ok 13 - K4 threshold: exactly 50% drop fires K4
ok 14 - K4: small decay (< 50%) does NOT fire K4
ok 15 - K5 starve: < 10% spend share, ad set losing, ad weak → 🔴 K5_weak
ok 16 - K5 rescue: < 10% spend share, ad efficient → 🛟 K5_rescue
ok 17 - K5: < 10% spend share, ad set hitting target → default (leave alone)
ok 18 - K5: does NOT fire on 'other' campaign (conversion-only)
ok 19 - fatigue_ctr: CTR dropped ≥ 25% from peak, CPM stable → 🟡 fatigue_ctr
ok 20 - fatigue_cpm: CPM rising on ad vs account avg → 🟡 fatigue_cpm
ok 21 - fatigue: CTR drop below 25% does NOT fire
ok 22 - S1: CPA ≤ target + CTR > account avg, conversion → 🟢 S1
ok 23 - S1: NOT produced on 'other' campaign (SC-12)
ok 24 - S1 NOT produced when CTR ≤ account avg (winning requires BOTH)
ok 25 - default: data gates met but no rule fires → 🟡 default_continue
ok 26 - Free funnel: same rules with CPL — S1 fires when CPL ≤ targetCpl
ok 27 - Free funnel: CB2 fires when today's spend is 2.5x targetCpl with 0 conv
ok 28 - diagnose: K3 verdict includes diagnosisAr about hook (المشكلة في الهوك)
ok 29 - diagnose: high CPM triggers creative-quality diagnosis (مشكلة في جودة التصميم)
ok 30 - diagnose: low LP view rate triggers congruency diagnosis
ok 31 - diagnose: returns null on a healthy ad
ok 32 - output: every verdict includes reasonAr + ruleCode + evaluatedAt
ok 33 - missing funnel settings: returns ⏳ with 'إعدادات مسار المبيعات غير مكتملة'
ok 34 - funnel settings with no derived targets: returns ⏳
ok 35 - null baselines: returns ⏳ with 'بيانات الأداء التاريخية غير متوفرة' (no fake 1.0 fallback)
ok 36 - all reasonAr strings contain only simple Fusha (no Egyptian dialect)
ok 37 - thresholds: default constants match the rulebook ranges
1..37
# tests 37
# pass 37
# fail 0
```

**37/37 pass.**

### 3.5 `node lib/__tests__/learningIntegration.test.js`

```
ok 1 - integration: conversion + auto_hash match → verdict computed + hook + visual aggregates updated
ok 2 - integration: non-conversion ad → verdict may fire but aggregates NOT updated in conversion bucket
ok 3 - integration: unmatched ad (matchType=null) → no aggregate update
ok 4 - integration: deleted generation (metadataAvailable=false) → no aggregate update
ok 5 - integration: multiple ads feed the same hook with mixed verdicts
1..5
# tests 5
# pass 5
# fail 0
```

**5/5 pass.**

### 3.6 `npm run test:phase14` (full Phase 14 sweep)

Per-file counts:

```
# tests 18 — pass 18 — fail 0    (targetingContext)
# tests 11 — pass 11 — fail 0    (campaignObjective)
# tests 12 — pass 12 — fail 0    (canonicalAngle)
# tests 40 — pass 40 — fail 0    (cpaEconomics)        ← Phase 2 lands here
# tests 20 — pass 20 — fail 0    (funnelSettings)      ← Phase 2 lands here
# tests 15 — pass 15 — fail 0    (tokenCrypto)
# tests 28 — pass 28 — fail 0    (perceptualHash)
# tests 2  — pass 2  — fail 0    (fingerprintAccuracy)
# tests 16 — pass 16 — fail 0    (metaGraph)
# tests 17 — pass 17 — fail 0    (metaSync)
# tests 37 — pass 37 — fail 0    (qararEngine)         ← Phase 2 lands here
# tests 19 — pass 19 — fail 0    (learningAggregates)
# tests 5  — pass 5  — fail 0    (learningIntegration) ← Phase 2 lands here
# tests 12 — pass 12 — fail 0    (imageMatching)
```

**252 tests across 14 files; 252 pass, 0 fail.**

### 3.7 Typecheck

`cd functions && npx tsc --noEmit` exits 0.

---

## 4. Deviations from the plan

Two judgement calls worth recording:

1. **Read-path builder updated minimally** — `buildFunnelInputsFromDoc` in `funnelSettings.ts` is dead code today (never called) but Phase 2's input-shape change made its body fail the typecheck. I added the new fields with `DEFAULT_MARGIN_KEPT`/`DEFAULT_COMMISSION_RATE` defaults so it compiles. Phase 5 (T031) deletes this helper entirely in favour of the typed `derived` snapshot — the defaults are temporary scaffolding, not a behaviour choice. **No runtime change.**

2. **Two pre-phase contract test expectations rewritten** — `cpaEconomics.test.ts` and `funnelSettings.contract.test.ts` had assertions like "effective $74" that depended on the removed `FULL_FUNNEL_ROAS_FLOOR = 2.0` formula. With the corrected formula those assertions no longer hold for the same inputs. The replacements use inputs that exercise the new shape meaningfully (event rates, marginKept variations) and assert the new expected outputs. The semantic meaning of every test (e.g. "ROAS 0.5 ⇒ cap warning") is preserved at the type/contract level. This is the contract change Phase 2 ships — Phase 3+ will land more comprehensive fixtures per plan tasks T020/T025/T026/T042/T043/T051/T052.

---

## 5. Risks remaining at the end of Phase 2

- **No persistence yet** — the `FunnelSettingsDoc` interface in `funnelSettings.ts` does NOT yet declare the new fields (`commissionRate`, `marginKept`, `bookingRate`, `showUpRate`, `eventAttendanceRate`, `eventCloseRate`). The save path validates them and the read path defaults them, but a write that lands today would not persist them. **Phase 3 (T022) and Phase 4 (T027) extend the doc shape and the save request validation.**
- **`saveFunnelSettings` will reject every existing pre-phase doc on update** — the new required-field validator now requires `commissionRate`/`marginKept`/`bookingRate`/`showUpRate`/`eventAttendanceRate`/`eventCloseRate` to be present (non-null) in the save request. Pre-phase docs don't have them; the next save attempt against such a doc will throw `invalid-argument` until the form supplies them. **This is intentional and exactly what Phase 5's completeness gate needs**: the next owner-driven edit is the path out of `INCOMPLETE`. The `metaSync` read path is unaffected because `getEffectiveTarget` returns `null` for every existing pre-phase payload via the version gate.
- **`computeAdvisories` low-value advisory now silently false for the legacy price-based edge case** — pre-phase, `lowValue` fired on `aov < 9` (the removed `LOW_VALUE_THRESHOLD`). Under the new contract it keys off the computed target, so a pre-phase-shape doc with `aov: 5` will produce `lowValue: false` because the computed target is `2.00` (well above 0.50). **No production consumer relies on the legacy semantics**; this is the intended direction per FR-028/FR-029.

---

## 6. Phase 3 unblock

**Recommendation**: Phase 3 (US1 — corrected lead-magnet target) may begin. All 10 tasks of Phase 2 are reported. The foundational scaffolding is in place: corrected formulas, shared factors, version gate, signature-changed advisory. The next phase ships the lead-magnet-call worked example as the first of the report §6 fixtures (T020) and the regression anchor (T021).

---

## 7. Reproducibility

```powershell
# 1. Typecheck the functions package
cd functions; npx tsc --noEmit
# Expect: silent (exit 0)

# 2. Run the Phase 2 unit tests
cd functions; npm run build; node lib/__tests__/cpaEconomics.test.js
# Expect: "ok 1 .. ok 40", "# tests 40 / # pass 40 / # fail 0", exit 0

# 3. Run the affected contract tests
cd functions; node lib/__tests__/funnelSettings.contract.test.js
# Expect: "ok 1 .. ok 20", "# tests 20 / # pass 20 / # fail 0", exit 0

# 4. Run the full Phase 14 sweep
cd functions; npm run test:phase14
# Expect: 252 tests across 14 files, all pass

# 5. Confirm Phase 1 guard tests still pass
npm run test:guard
# Expect: "ok 1 .. ok 22", "# tests 22 / # pass 22 / # fail 0", exit 0
```