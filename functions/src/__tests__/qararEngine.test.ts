// functions/src/__tests__/qararEngine.test.ts — Phase 14 Layer 4 Qarar Verdict Engine
// ═══════════════════════════════════════════════════════════
// node:test runner (matches the rest of the suite — see package.json
// `test` script). Verifies the exact evaluation order and the Fusha-only
// Arabic reasonAr strings documented in `specs/phase-14/qarar-rulebook.md`
// and `specs/phase-14/contracts/qararVerdict.md`.
//
// We deliberately test the engine as a pure function: no Firestore, no
// admin SDK. The wiring in `metaSync/shared.ts` reads settings/baselines
// and calls `evaluateVerdict(performance, settings, baselines)` per ad.
// ═══════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    evaluateVerdict,
    diagnose,
    IMPRESSION_GATE,
    K3_CTR_THRESHOLD,
    K3_EARLY_IMPRESSIONS,
    K4_DECAY_THRESHOLD,
    K5_SPEND_SHARE_THRESHOLD,
    FATIGUE_CTR_DROP,
    CB1_MULTIPLIER,
    CB2_MULTIPLIER,
    type AdPerformanceForVerdict,
    type FunnelSettingsForVerdict,
} from "../qararEngine.js";

// ─── Helpers ───────────────────────────────────────────────────

function makePaidFunnel(targetCpa: number): FunnelSettingsForVerdict {
    return {
        derived: {
            economicsVersion: 2,
            paid: {
                rawTargetCpa: targetCpa * 1.2,
                fullBuyerValue: targetCpa * 2,
                maxCpa: targetCpa,
                effectiveTargetCpa: targetCpa,
                capApplied: true,
            },
            computedAt: 0,
        },
    };
}

function makeFreeFunnel(targetCpl: number): FunnelSettingsForVerdict {
    return {
        derived: {
            economicsVersion: 2,
            free: {
                leadValue: targetCpl / 0.7,
                economicCeilingCpl: targetCpl,
                effectiveTargetCpl: targetCpl,
            },
            computedAt: 0,
        },
    };
}

function makeAd(overrides: Partial<AdPerformanceForVerdict> = {}): AdPerformanceForVerdict {
    return {
        impressions3d: 3000,
        spend3d: 50,
        spendToday: 5,
        ctrLink: 1.5,
        ctrAll: 2.0,
        cpm3d: 8,
        cpa3d: null,
        conversions3d: 1,
        spendSharePct: 0.4,
        // peak1dCtr matches ctrLink by default — no accidental K4 trigger
        // when tests don't override it. Tests that exercise K4 explicitly
        // override peak1dCtr.
        peak1dCtr: 1.5,
        ageDays: 3,
        ...overrides,
    };
}

const DEFAULT_BASELINES = { linkCtr90d: 1.5, cpm14d: 8, cpaCpl30d: 50, cpc30d: 1.0 };

// ─── ⏳ Data gates ─────────────────────────────────────────────

test("data gate: low impressions AND ad < 48h → ⏳ (insufficient data)", () => {
    const ad = makeAd({ impressions3d: 800, ageDays: 1, spend3d: 5 });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "⏳");
    assert.equal(r.ruleCode, "data_gate");
    // Fusha: لا توجد بيانات كافية بعد
    assert.match(r.reasonAr, /بيانات/);
});

test("data gate: 2500 impressions but ad < 48h → ⏳", () => {
    const ad = makeAd({ impressions3d: 2500, ageDays: 1 });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "⏳");
    assert.equal(r.ruleCode, "data_gate");
});

test("data gate: spends target but ad < 48h → ⏳", () => {
    // 1x target = $50, but ad is 1 day old.
    const ad = makeAd({ impressions3d: 800, spend3d: 60, ageDays: 1 });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "⏳");
});

test("data gate: passes → falls through to other rules", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 2.0, // > account average (1.5)
        cpa3d: 40,    // < target (50)
        conversions3d: 2,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🟢");
    assert.equal(r.ruleCode, "S1");
});

// ─── CB1 / CB2 (circuit breaker) ───────────────────────────────

test("CB2: today spend ≥ 2.5x target, 0 conversions, conversion → 🔴 CB2", () => {
    const target = 40;
    const ad = makeAd({
        impressions3d: 3000,
        spend3d: 200,
        spendToday: target * CB2_MULTIPLIER, // exactly 2.5x
        conversions3d: 0,
        cpa3d: null,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(target), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🔴");
    assert.equal(r.ruleCode, "CB2");
    // Fusha: إنفاق مرتفع جداً بدون تحويلات — أوقف
    assert.match(r.reasonAr, /(مرتفع|تحويلات|أوقف)/);
});

test("CB1: today spend ≥ 1.5x target, 0 conversions, conversion → 🟡 CB1", () => {
    const target = 40;
    const ad = makeAd({
        impressions3d: 3000,
        spend3d: 200,
        spendToday: target * CB1_MULTIPLIER, // exactly 1.5x
        conversions3d: 0,
        cpa3d: null,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(target), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🟡");
    assert.equal(r.ruleCode, "CB1");
});

test("CB2 takes priority over CB1 when both thresholds met", () => {
    // At 3.0x target, BOTH CB1 (≥1.5x) and CB2 (≥2.5x) qualify.
    // The first-match-wins order must pick CB2.
    const target = 40;
    const ad = makeAd({
        impressions3d: 3000,
        spend3d: 200,
        spendToday: target * 3,
        conversions3d: 0,
        cpa3d: null,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(target), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🔴");
    assert.equal(r.ruleCode, "CB2");
});

test("CB2: on 'other' campaign → does NOT fire (SC-12)", () => {
    const target = 40;
    const ad = makeAd({
        impressions3d: 3000,
        spendToday: target * 3,
        conversions3d: 0,
        cpa3d: null,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(target), "other", DEFAULT_BASELINES);
    // No circuit breaker on non-conversion → data gate passes, no kill
    // applies at this CTR (K3 needs < 0.5%), so default 🟡 "يعمل — راقب"
    assert.equal(r.ruleCode, "default_continue");
    assert.equal(r.verdict, "🟡");
});

// ─── K3 (Link CTR dead hook) ───────────────────────────────────

test("K3: Link CTR < 0.5% after 2000 impressions, conversion → 🔴 K3", () => {
    const ad = makeAd({
        impressions3d: 2000,
        ctrLink: K3_CTR_THRESHOLD * 100 * 0.5, // 0.25%
        cpa3d: null,
        conversions3d: 0,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🔴");
    assert.equal(r.ruleCode, "K3");
    // Fusha: الهوك ضعيف — لا أحد يتوقف
    assert.match(r.reasonAr, /(هوك|ضعيف|يتوقف)/);
});

test("K3: fires for 'other' campaign too (K3 applies to all objectives)", () => {
    const ad = makeAd({
        impressions3d: 2000,
        ctrLink: 0.25,
        cpa3d: null,
        conversions3d: 0,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "other", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🔴");
    assert.equal(r.ruleCode, "K3");
});

test("K3: early-callable at 1500 impressions when CTR is terrible", () => {
    // K3 has an exception: callable at K3_EARLY_IMPRESSIONS when CTR
    // is below threshold.
    const ad = makeAd({
        impressions3d: K3_EARLY_IMPRESSIONS,
        ctrLink: 0.2,
        conversions3d: 0,
        cpa3d: null,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.ruleCode, "K3");
    assert.equal(r.verdict, "🔴");
});

// ─── K4 (72-hour decay / flash creative) ──────────────────────

test("K4: day-1 peak then ≥ 50% drop → 🔴 K4", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 1.0,
        peak1dCtr: 2.5, // 60% drop from peak (2.5 → 1.0)
        cpa3d: null,
        conversions3d: 0,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🔴");
    assert.equal(r.ruleCode, "K4");
    // Fusha: إعلان مؤقت — انخفض الأداء خلال يوم
    assert.match(r.reasonAr, /(مؤقت|انخفض|يوم)/);
});

test("K4 threshold: exactly 50% drop fires K4", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 1.0,
        peak1dCtr: 2.0, // exactly 50% drop
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.ruleCode, "K4");
});

test("K4: small decay (< 50%) does NOT fire K4", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 1.0,
        peak1dCtr: 1.4, // 28% drop
        cpa3d: 40,
        conversions3d: 1,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    // 28% decay → no K4. Other rules evaluate.
    assert.notEqual(r.ruleCode, "K4");
});

// ─── K5 (starved-ad matrix) ───────────────────────────────────

test("K5 starve: < 10% spend share, ad set losing, ad weak → 🔴 K5_weak", () => {
    // "ad set losing" = the ad-set would have to be losing, but our engine
    // evaluates a single ad. The worker passes `adSetHittingTarget` from
    // the ad-set's own status. We model "losing" via a flag.
    // Set peak1dCtr=ctrLink to suppress K4 (otherwise the default peak
    // would make K4 fire first and the test would never reach K5).
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 0.5,    // weak: BELOW account avg (1.5)
        peak1dCtr: 0.5,  // no K4 trigger
        cpa3d: null,
        conversions3d: 0,
        spendSharePct: K5_SPEND_SHARE_THRESHOLD * 0.5, // 5% (< 10%)
        spend3d: 50,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES, {
        adSetHittingTarget: false,
    });
    assert.equal(r.verdict, "🔴");
    assert.equal(r.ruleCode, "K5_weak");
    assert.match(r.reasonAr, /(ضعيف|خاسرة)/);
});

test("K5 rescue: < 10% spend share, ad efficient → 🛟 K5_rescue", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 3.0,    // efficient: well above account avg
        peak1dCtr: 3.0,  // no K4 trigger
        cpa3d: 40,       // ≤ target
        conversions3d: 1,
        spendSharePct: K5_SPEND_SHARE_THRESHOLD * 0.5,
        spend3d: 50,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES, {
        adSetHittingTarget: false,
    });
    assert.equal(r.verdict, "🛟");
    assert.equal(r.ruleCode, "K5_rescue");
    assert.match(r.reasonAr, /(فعّال|محدود|انقله)/);
});

test("K5: < 10% spend share, ad set hitting target → default (leave alone)", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 0.5,    // weak
        peak1dCtr: 0.5,  // no K4 trigger
        conversions3d: 0,
        spendSharePct: K5_SPEND_SHARE_THRESHOLD * 0.5,
        spend3d: 50,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES, {
        adSetHittingTarget: true, // set is doing fine
    });
    // K5 matrix says "leave it" — falls through to default continue
    assert.notEqual(r.ruleCode, "K5_weak");
    assert.notEqual(r.ruleCode, "K5_rescue");
});

test("K5: does NOT fire on 'other' campaign (conversion-only)", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 0.5,
        peak1dCtr: 0.5,  // no K4 trigger
        conversions3d: 0,
        spendSharePct: K5_SPEND_SHARE_THRESHOLD * 0.5,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "other", DEFAULT_BASELINES, {
        adSetHittingTarget: false,
    });
    assert.notEqual(r.ruleCode, "K5_weak");
});

// ─── Fatigue ──────────────────────────────────────────────────

test("fatigue_ctr: CTR dropped ≥ 25% from peak, CPM stable → 🟡 fatigue_ctr", () => {
    // 30% drop — below K4's 50% threshold so K4 doesn't fire, but above
    // fatigue's 25% threshold so fatigue_ctr does.
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 0.7,    // was 1.0 → 30% drop
        peak1dCtr: 1.0,
        cpm3d: DEFAULT_BASELINES.cpm14d, // stable
        cpa3d: 60, // slightly above target
        conversions3d: 1,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🟡");
    assert.equal(r.ruleCode, "fatigue_ctr");
    assert.match(r.reasonAr, /(إنهاك|جدّد)/);
});

test("fatigue_cpm: CPM rising on ad vs account avg → 🟡 fatigue_cpm", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 1.6, // > account avg
        peak1dCtr: 1.6, // no CTR drop
        cpm3d: DEFAULT_BASELINES.cpm14d * 1.5, // CPM rising 50%
        cpa3d: 50,
        conversions3d: 1,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🟡");
    assert.equal(r.ruleCode, "fatigue_cpm");
    assert.match(r.reasonAr, /(خوارزمية|تعاقب)/);
});

test("fatigue: CTR drop below 25% does NOT fire", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 1.6, // 20% drop from peak 2.0
        peak1dCtr: 2.0,
        cpm3d: DEFAULT_BASELINES.cpm14d,
        cpa3d: 50,
        conversions3d: 1,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.notEqual(r.ruleCode, "fatigue_ctr");
    assert.notEqual(r.ruleCode, "fatigue_cpm");
});

// ─── S1 (winner) ───────────────────────────────────────────────

test("S1: CPA ≤ target + CTR > account avg, conversion → 🟢 S1", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 2.5, // > account 1.5
        cpa3d: 40,    // ≤ target 50
        conversions3d: 2,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🟢");
    assert.equal(r.ruleCode, "S1");
    // Fusha: إعلان ناجح — مؤهل للترقية
    assert.match(r.reasonAr, /(ناجح|ترقية)/);
});

test("S1: NOT produced on 'other' campaign (SC-12)", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 2.5,
        cpa3d: 40,
        conversions3d: 2,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "other", DEFAULT_BASELINES);
    assert.notEqual(r.ruleCode, "S1");
});

test("S1 NOT produced when CTR ≤ account avg (winning requires BOTH)", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 1.5, // = account avg (not >)
        cpa3d: 40,
        conversions3d: 2,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.notEqual(r.ruleCode, "S1");
});

// ─── Default ──────────────────────────────────────────────────

test("default: data gates met but no rule fires → 🟡 default_continue", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 1.5, // = account avg
        cpa3d: 60,    // > target (slight over)
        conversions3d: 1,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🟡");
    assert.equal(r.ruleCode, "default_continue");
    // Fusha: يعمل — راقب الأداء
    assert.match(r.reasonAr, /(يعمل|راقب)/);
});

// ─── Free funnel (CPL) ─────────────────────────────────────────

test("Free funnel: same rules with CPL — S1 fires when CPL ≤ targetCpl", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 2.5, // > account avg
        cpa3d: 8,     // CPL proxy: spend / conversions
        conversions3d: 5, // spend = 40
        spend3d: 40,
        ageDays: 3,
    });
    // 5 conversions × 8 CPL = 40 total spend, 8 CPL ≤ target 10
    const r = evaluateVerdict(ad, makeFreeFunnel(10), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🟢");
    assert.equal(r.ruleCode, "S1");
});

test("Free funnel: CB2 fires when today's spend is 2.5x targetCpl with 0 conv", () => {
    const ad = makeAd({
        impressions3d: 3000,
        cpa3d: null,
        conversions3d: 0,
        spend3d: 100,
        spendToday: 25, // 2.5x targetCpl=10
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makeFreeFunnel(10), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🔴");
    assert.equal(r.ruleCode, "CB2");
});

// ─── Diagnosis ladder ──────────────────────────────────────────

test("diagnose: K3 verdict includes diagnosisAr about hook (المشكلة في الهوك)", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 0.25,
        conversions3d: 0,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "🔴");
    assert.ok(r.diagnosisAr !== null, "diagnosis should not be null on K3");
    assert.match(r.diagnosisAr!, /(هوك)/);
});

test("diagnose: high CPM triggers creative-quality diagnosis (مشكلة في جودة التصميم)", () => {
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 1.5, // normal
        cpm3d: DEFAULT_BASELINES.cpm14d * 2, // 2x account avg
        ageDays: 3,
    });
    const d = diagnose(ad, DEFAULT_BASELINES);
    assert.ok(d);
    assert.match(d!, /(جودة التصميم|إعلان)/);
});

test("diagnose: low LP view rate triggers congruency diagnosis", () => {
    // Set ctrAll=ctrLink so the CTR-All/Link-CTR mismatch step (step 3)
    // does NOT fire first and we actually reach step 4.
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 1.5,
        ctrAll: 1.5, // no CTR-All/Link-CTR mismatch
        cpm3d: DEFAULT_BASELINES.cpm14d,
        lpViewRate: 0.5, // 50% — below 75% threshold
        ageDays: 3,
    });
    const d = diagnose(ad, DEFAULT_BASELINES);
    assert.ok(d);
    assert.match(d!, /(سرعة الصفحة|congruency|توافق)/);
});

test("diagnose: returns null on a healthy ad", () => {
    // Set ctrAll=ctrLink so the CTR-All/Link-CTR mismatch step (step 3)
    // does NOT fire first. Also set lpViewRate ≥ 75% and ≥ 1 conversion
    // so the page-CVR step (step 5) does NOT fire either.
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 1.5,
        ctrAll: 1.5,
        cpm3d: DEFAULT_BASELINES.cpm14d,
        lpViewRate: 0.9,
        conversions3d: 2,
        ageDays: 3,
    });
    assert.equal(diagnose(ad, DEFAULT_BASELINES), null);
});

// ─── Output shape ─────────────────────────────────────────────

test("output: every verdict includes reasonAr + ruleCode + evaluatedAt", () => {
    const ad = makeAd();
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
    assert.equal(typeof r.verdict, "string");
    assert.equal(typeof r.ruleCode, "string");
    assert.equal(typeof r.reasonAr, "string");
    assert.equal(typeof r.evaluatedAt, "number");
    assert.ok(r.evaluatedAt > 0);
});

// ─── Funnel settings missing ──────────────────────────────────

test("missing funnel settings: returns ⏳ with 'إعدادات مسار المبيعات غير مكتملة'", () => {
    const ad = makeAd();
    const r = evaluateVerdict(ad, null, "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "⏳");
    assert.equal(r.ruleCode, "data_gate");
    assert.match(r.reasonAr, /(إعدادات مسار المبيعات|إعدادات)/);
});

test("funnel settings with no derived targets: returns ⏳", () => {
    const ad = makeAd();
    const r = evaluateVerdict(ad, { derived: { economicsVersion: 2, computedAt: 0 } }, "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "⏳");
});

// Phase 10 T068 (FR-041, FR-042) — end-to-end gate test. An
// unstamped derived payload (the pre-phase production shape) must
// flow through `evaluateVerdict` to ⏳ with the incomplete-settings
// reason, NOT to a pass/fail verdict. The chain under test:
//
//   1. `evaluateVerdict` calls `getEffectiveTarget(settings.derived)`.
//   2. `getEffectiveTarget` returns `null` for an unstamped payload
//      (the FR-041 / R-1 mechanism; absence of `economicsVersion: 2`
//      is the signal — see cpaEconomics.ts:402 and T018 row 2).
//   3. `evaluateVerdict` sees the null target and returns ⏳ with the
//      "incomplete settings" data-gate reason.
//   4. No pass/fail verdict is written — the sync emits no verdicts
//      for this ad (verified structurally: the engine never reaches
//      the cost-vs-target comparison when the gate fires).
//
// This is the load-bearing property that protects pre-phase records
// from being re-judged against the corrected math (R-1's blocking
// finding — without the version stamp, the corrected math would
// re-judge historical ads and flood the learning aggregates).
test("end-to-end gate — unstamped derived payload (pre-phase shape) flows through evaluateVerdict to ⏳ with incomplete-settings reason, no pass/fail verdict (FR-041, FR-042)", () => {
    const ad = makeAd();

    // The pre-phase shape: `derived.paid.effectiveTargetCpa` exists
    // with a value, but `derived.economicsVersion` is absent. The
    // version stamp is the signal; without it the engine must
    // treat the payload as if the record were incomplete.
    const unstamped = {
        derived: {
            // NOTE: deliberately no `economicsVersion: 2` here — the
            // absence is the signal under test. The cast bypasses
            // the type check (which requires the stamp); the
            // runtime's `getEffectiveTarget` is what we're pinning.
            paid: {
                rawTargetCpa: 48,
                fullBuyerValue: 175.875,
                maxCpa: 70.35,
                effectiveTargetCpa: 48,
                capApplied: false,
            },
            computedAt: 0,
        },
    } as unknown as FunnelSettingsForVerdict;

    // The engine sees the unstamped payload, calls
    // `getEffectiveTarget` which returns null (FR-041 / R-1), and
    // falls into the `if (!settings || getEffectiveTarget(...) ===
    // null)` branch at qararEngine.ts:224. Returns ⏳ with the
    // data-gate reason.
    const r = evaluateVerdict(ad, unstamped, "conversion", DEFAULT_BASELINES);
    assert.equal(r.verdict, "⏳");
    assert.equal(r.ruleCode, "data_gate");
    // The reasonAr is the standard "incomplete settings" copy —
    // Simple Fusha, no technical terms (matches the rest of the
    // qarar-rulebook's data-gate strings).
    assert.match(r.reasonAr, /(إعدادات|إكتمال|ناقص)/);

    // Negative control: a stamped payload with the same effective
    // target value produces a real verdict (not ⏳). This pins that
    // the gate fires specifically because of the absent stamp — not
    // because of the target value or the ad performance.
    const stamped = makePaidFunnel(48);
    const r2 = evaluateVerdict(ad, stamped, "conversion", DEFAULT_BASELINES);
    assert.notEqual(r2.verdict, "⏳");
});

test("null baselines: returns ⏳ with 'بيانات الأداء التاريخية غير متوفرة' (no fake 1.0 fallback)", () => {
    // CodeRabbit fix: when baseline loading fails the engine MUST NOT
    // evaluate against fabricated 1.0 placeholders — those would let
    // S1 (CPA ≤ 1.0 ≪ target) or fatigue (CPM > 1.0) fire on garbage.
    // The engine returns ⏳ with a distinct reason.
    const ad = makeAd({
        impressions3d: 3000,
        ctrLink: 0.25, // would normally trigger K3
        cpa3d: null,
        conversions3d: 0,
        ageDays: 3,
    });
    const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", null);
    assert.equal(r.verdict, "⏳");
    assert.equal(r.ruleCode, "data_gate");
    assert.match(r.reasonAr, /(تاريخية|متوفرة)/);
});

// ─── Fusha + simple language invariant ───────────────────────

test("all reasonAr strings contain only simple Fusha (no Egyptian dialect)", () => {
    // Sanity: scan a sample of verdicts to ensure no Egyptian-only phrases.
    // Egyptian markers: "ده" / "دي" / "إحنا" / "عايز" / "عشان" / "كده" / "ليه"
    const egyptianMarkers = /\b(ده|دي|إحنا|عايز|عشان|كده|ليه|بس|أوي|ليه)\b/;
    const samples = [
        makeAd(),  // default
        makeAd({ ctrLink: 0.25, conversions3d: 0, ageDays: 3 }),  // K3
        makeAd({ ctrLink: 1.0, peak1dCtr: 2.0, conversions3d: 0, ageDays: 3 }),  // K4
        makeAd({ spendToday: 100, conversions3d: 0, ageDays: 3, spend3d: 100 }),  // CB
    ];
    for (const ad of samples) {
        const r = evaluateVerdict(ad, makePaidFunnel(50), "conversion", DEFAULT_BASELINES);
        assert.ok(
            !egyptianMarkers.test(r.reasonAr),
            `Egyptian marker in reasonAr: ${r.reasonAr}`,
        );
    }
});

// ─── Threshold constants exposed ───────────────────────────────

test("thresholds: default constants match the rulebook ranges", () => {
    assert.equal(IMPRESSION_GATE, 2000);
    assert.equal(K3_EARLY_IMPRESSIONS, 1500);
    assert.equal(K3_CTR_THRESHOLD, 0.005);
    assert.equal(K4_DECAY_THRESHOLD, 0.50);
    assert.equal(K5_SPEND_SHARE_THRESHOLD, 0.10);
    assert.equal(FATIGUE_CTR_DROP, 0.25);
    assert.equal(CB1_MULTIPLIER, 1.5);
    assert.equal(CB2_MULTIPLIER, 2.5);
});
