// functions/src/qararEngine.ts — Phase 14 Layer 4 Qarar Verdict Engine
// ═══════════════════════════════════════════════════════════
// PURE module (no Firebase / Firestore / network). The Qarar verdict
// engine follows the exact evaluation order documented in
// `specs/phase-14/qarar-rulebook.md` and `contracts/qararVerdict.md`:
//
//   1. Data gates (must pass before any verdict fires) → ⏳
//   2. Circuit breaker (today only, conversion-only) → 🔴 CB2 / 🟡 CB1
//   3. Kill rules (K3, K4, K5) → 🔴 / 🛟
//   4. Fatigue → 🟡 (CTR drop, CPM rise)
//   5. S1 winner → 🟢 (conversion only)
//   6. Default continue → 🟡 (Fusha: "يعمل — راقب الأداء")
//
// Unified target: every rule uses `effectiveTarget` (effectiveTargetCPA
// for paid funnels, effectiveTargetCPL for free). The rules, thresholds,
// and multipliers are identical; only the target value and cost metric
// change between funnel types.
//
// Arabic strings are Fusha-only (no Egyptian dialect). All strings are
// internal — SC-11 forbids "CPA"/"CPL"/percentages in user-facing copy,
// but these are engine outputs and stay server-side.
// ═══════════════════════════════════════════════════════════

import { getEffectiveTarget, type DerivedTargets } from "./cpaEconomics.js";
import {
    campaignObjectiveBucket,
    isRuleAllowedForObjective,
    type CampaignObjectiveBucket,
} from "./campaignObjective.js";

// ─── Tunable constants (rulebook §10 — implementation defaults) ──

/** Minimum impressions before any verdict can fire (3-day rolling). */
export const IMPRESSION_GATE = 2000;

/** Min hours since the ad started serving before a verdict can fire. */
export const MIN_AGE_HOURS = 48;

/** K3: dead hook — Link CTR below this. */
export const K3_CTR_THRESHOLD = 0.005; // 0.5%

/** K3 early-callable threshold: K3 fires at this impression count
 * (instead of IMPRESSION_GATE) when CTR is below threshold. */
export const K3_EARLY_IMPRESSIONS = 1500;

/** K4: 72-hour decay threshold — CTR drop from peak. */
export const K4_DECAY_THRESHOLD = 0.50; // 50%

/** K5: starved-ad threshold — ad gets < this share of ad-set spend. */
export const K5_SPEND_SHARE_THRESHOLD = 0.10; // 10%

/** Fatigue: CTR drop threshold (vs 3-day peak). */
export const FATIGUE_CTR_DROP = 0.25; // 25%

/** CB1: today's spend multiplier (vs effectiveTarget). */
export const CB1_MULTIPLIER = 1.5;

/** CB2: today's spend multiplier (vs effectiveTarget). */
export const CB2_MULTIPLIER = 2.5;

/** LP View Rate threshold (below = potential page/landing issue). */
export const LP_VIEW_RATE_THRESHOLD = 0.75;

/** CPM "rising on this ad" threshold vs account average. */
export const CPM_RISE_THRESHOLD = 1.20; // 20% above account avg

// ─── Output shape ──────────────────────────────────────────────

export type VerdictCode = "🟢" | "🟡" | "🔴" | "🛟" | "⏳";

export type RuleCode =
    | "data_gate"
    | "CB2"
    | "CB1"
    | "K3"
    | "K4"
    | "K5_weak"
    | "K5_rescue"
    | "fatigue_ctr"
    | "fatigue_cpm"
    | "S1"
    | "default_continue";

export interface VerdictResult {
    verdict: VerdictCode;
    ruleCode: RuleCode;
    reasonAr: string;
    diagnosisAr: string | null;
    evaluatedAt: number;
}

// ─── Inputs ────────────────────────────────────────────────────

/**
 * Snapshot of an ad's performance + matched generation metadata, scoped
 * to the fields the engine reads. The worker in `metaSync/shared.ts`
 * builds this shape from `AdPerformanceRecord` (data-model §3) and the
 * `MetaAd` + `InsightsTimeWindows` from the worker loop.
 */
export interface AdPerformanceForVerdict {
    impressions3d: number;
    spend3d: number;
    spendToday: number;
    ctrLink: number;             // percent (e.g. 1.5 means 1.5%)
    ctrAll: number;              // percent
    cpm3d: number;               // account-currency value
    cpa3d: number | null;        // cost-per-acquisition (3-day rolling) or null
    conversions3d: number;
    spendSharePct: number;       // 0..1 fraction of ad-set spend
    peak1dCtr: number;           // peak single-day CTR (3-day window)
    ageDays: number;             // days since the ad started serving
    lpViewRate?: number;         // optional — LP views ÷ link clicks
}

export interface FunnelSettingsForVerdict {
    derived: DerivedTargets;
}

export interface VerdictOptions {
    /** Whether the parent ad-set is currently hitting its target.
     * Used by the K5 starved-ad matrix. Default: undefined → engine
     * uses the loose interpretation (any ad with < 10% share and weak
     * efficiency is at-risk regardless of ad-set state). */
    adSetHittingTarget?: boolean;
}

// ─── Arabic reason strings (Fusha, server-side only) ─────────

const REASON_DATA_GATE_FRIENDLY = "لا توجد بيانات كافية بعد";
const REASON_DATA_GATE_FUNNEL_MISSING = "إعدادات مسار المبيعات غير مكتملة";
const REASON_CB2 = "إنفاق مرتفع جداً بدون تحويلات — أوقف";
const REASON_CB1 = "إنفاق مرتفع بدون تحويلات — راقب";
const REASON_K3 = "الهوك ضعيف — لا أحد يتوقف";
const REASON_K4 = "إعلان مؤقت — انخفض الأداء خلال يوم";
const REASON_K5_WEAK = "إعلان ضعيف في مجموعة خاسرة";
const REASON_K5_RESCUE = "إعلان فعّال لكنه محدود — انقله إلى مجموعة إعلانية جديدة";
const REASON_FATIGUE_CTR = "إنهاك إبداعي — جدّد التصميم";
const REASON_FATIGUE_CPM = "الخوارزمية تعاقب هذا التصميم";
const REASON_S1 = "إعلان ناجح — مؤهل للترقية";
const REASON_DEFAULT = "يعمل — راقب الأداء";

// ─── Helpers ──────────────────────────────────────────────────

function cpa3dMatchesTarget(ad: AdPerformanceForVerdict, target: number): boolean {
    if (ad.cpa3d === null) return false;
    return ad.cpa3d <= target;
}

function aboveAccountAverage(adCtr: number, baselineCtr: number): boolean {
    return adCtr > baselineCtr;
}

function toBucket(value: string | null | undefined): CampaignObjectiveBucket {
    if (value === null || value === undefined) return "other";
    // Fast-path: if the caller already passed the bucket label
    // ("conversion" | "other"), trust it. Otherwise treat the string as a
    // raw Meta objective name and classify via the canonical resolver
    // (which knows the seven conversion objectives like OUTCOME_SALES,
    // CONVERSIONS, etc.).
    if (value === "conversion" || value === "other") return value;
    return campaignObjectiveBucket(value);
}

// ─── Diagnosis ladder (spec §5.4) ─────────────────────────────

/**
 * Run the diagnosis ladder top-down, stop at the first broken level.
 * Returns an Arabic one-liner or null when the ad is healthy on every
 * level. Only invoked for 🔴 / 🟡 verdicts (the worker uses
 * `result.diagnosisAr` only when `result.verdict` is non-🟢).
 */
export function diagnose(
    ad: AdPerformanceForVerdict,
    baselines: { linkCtr90d: number; cpm14d: number; cpaCpl30d: number; cpc30d: number },
): string | null {
    // 1. CPM — high on ad vs account average
    if (ad.cpm3d > baselines.cpm14d * CPM_RISE_THRESHOLD) {
        return "مشكلة في جودة التصميم";
    }
    // 2. Link CTR — low despite normal CPM
    if (ad.ctrLink < baselines.linkCtr90d) {
        return "المشكلة في الهوك";
    }
    // 3. CTR-All vs Link CTR mismatch
    if (ad.ctrAll > ad.ctrLink * 1.2) {
        return "الإعلان يجذب التفاعل لكن لا يدفع إلى الضغط";
    }
    // 4. LP View Rate
    if (typeof ad.lpViewRate === "number" && ad.lpViewRate < LP_VIEW_RATE_THRESHOLD) {
        return "مشكلة في سرعة الصفحة أو توافق الرسالة";
    }
    // 5. Page CVR (proxy: low conversions despite healthy clicks)
    if (ad.ctrLink >= baselines.linkCtr90d && ad.conversions3d === 0 && ad.impressions3d >= IMPRESSION_GATE) {
        return "الإعلان ليس المشكلة — المشكلة في الصفحة أو العرض";
    }
    return null;
}

// ─── Main entry point ──────────────────────────────────────────

/**
 * Evaluate the creative-level rules in the exact order documented in
 * the rulebook. STOPS at the first rule that fires. Returns a verdict
 * with the firing rule's code, Arabic reason, and (for 🔴 / 🟡) a
 * one-line diagnosis from the ladder.
 */
export function evaluateVerdict(
    ad: AdPerformanceForVerdict,
    settings: FunnelSettingsForVerdict | null,
    campaignObjective: string | null | undefined,
    baselines: { linkCtr90d: number; cpm14d: number; cpaCpl30d: number; cpc30d: number },
    options: VerdictOptions = {},
): VerdictResult {
    const now = Date.now();
    const bucket = toBucket(campaignObjective);

    // Funnel settings missing → ⏳ with a distinct reason.
    if (!settings || getEffectiveTarget(settings.derived) === null) {
        return {
            verdict: "⏳",
            ruleCode: "data_gate",
            reasonAr: REASON_DATA_GATE_FUNNEL_MISSING,
            diagnosisAr: null,
            evaluatedAt: now,
        };
    }
    const target = getEffectiveTarget(settings.derived) as number;

    // ─── Step 1: Data gates ────────────────────────────────────
    // Impressions gate OR spend gate; ad must be ≥ 48h old.
    // K3 early-callable: when CTR is below threshold, the impressions
    // gate drops to K3_EARLY_IMPRESSIONS (rulebook §Part 4 / K3).
    const ctrIsTerrible = ad.ctrLink < K3_CTR_THRESHOLD * 100; // ctrLink is in percent
    const impressionsThreshold = ctrIsTerrible ? K3_EARLY_IMPRESSIONS : IMPRESSION_GATE;
    const impressionsOk = ad.impressions3d >= impressionsThreshold;
    const spendGateOk = ad.spend3d >= 1 * target;
    const ageOk = ad.ageDays * 24 >= MIN_AGE_HOURS;
    if (!ageOk || (!impressionsOk && !spendGateOk)) {
        return {
            verdict: "⏳",
            ruleCode: "data_gate",
            reasonAr: REASON_DATA_GATE_FRIENDLY,
            diagnosisAr: null,
            evaluatedAt: now,
        };
    }

    // ─── Step 2: Circuit breaker (conversion only) ────────────
    // CB2 first (higher threshold) so a single firing on a single ad
    // can't get swallowed by CB1.
    if (isRuleAllowedForObjective("CB2", bucket) && isRuleAllowedForObjective("CB1", bucket)) {
        if (ad.spendToday >= CB2_MULTIPLIER * target && ad.conversions3d === 0) {
            return {
                verdict: "🔴",
                ruleCode: "CB2",
                reasonAr: REASON_CB2,
                diagnosisAr: diagnose(ad, baselines),
                evaluatedAt: now,
            };
        }
        if (ad.spendToday >= CB1_MULTIPLIER * target && ad.conversions3d === 0) {
            return {
                verdict: "🟡",
                ruleCode: "CB1",
                reasonAr: REASON_CB1,
                diagnosisAr: diagnose(ad, baselines),
                evaluatedAt: now,
            };
        }
    }

    // ─── Step 3: Kill rules ────────────────────────────────────
    // K3: applies to ALL objectives (creative-quality check).
    if (isRuleAllowedForObjective("K3", bucket)) {
        if (ctrIsTerrible) {
            return {
                verdict: "🔴",
                ruleCode: "K3",
                reasonAr: REASON_K3,
                diagnosisAr: diagnose(ad, baselines),
                evaluatedAt: now,
            };
        }
    }

    // K4: 72-hour decay — also applies to all objectives (creative-
    // quality check). Requires peak1dCtr > 0 to compute a drop.
    if (isRuleAllowedForObjective("K4", bucket)) {
        if (ad.peak1dCtr > 0 && ad.ctrLink > 0) {
            const drop = (ad.peak1dCtr - ad.ctrLink) / ad.peak1dCtr;
            if (drop >= K4_DECAY_THRESHOLD) {
                return {
                    verdict: "🔴",
                    ruleCode: "K4",
                    reasonAr: REASON_K4,
                    diagnosisAr: diagnose(ad, baselines),
                    evaluatedAt: now,
                };
            }
        }
    }

    // K5: starved-ad matrix (conversion only). Skip if age < 48h — K5
    // specifically requires the ad to have been around long enough to
    // have an honest share-of-spend.
    if (isRuleAllowedForObjective("K5", bucket) && ad.ageDays * 24 >= MIN_AGE_HOURS) {
        if (ad.spendSharePct < K5_SPEND_SHARE_THRESHOLD) {
            // Ad is starved. The decision depends on (a) ad-set state
            // and (b) ad's own efficiency on its small spend. We model
            // "efficient on small spend" as:
            //   - Link CTR > account average, OR
            //   - CPA ≤ target on a small sample (≥ 1 conversion).
            // The K5_rescue branch fires when the ad is efficient
            // REGARDLESS of conversion count — the rulebook matrix says
            // 🛟 applies to "any ad-set state" when the ad is efficient
            // (rulebook §5.0).
            const efficient = aboveAccountAverage(ad.ctrLink, baselines.linkCtr90d)
                || (ad.conversions3d > 0 && cpa3dMatchesTarget(ad, target));
            if (efficient) {
                return {
                    verdict: "🛟",
                    ruleCode: "K5_rescue",
                    reasonAr: REASON_K5_RESCUE,
                    diagnosisAr: diagnose(ad, baselines),
                    evaluatedAt: now,
                };
            }
            // Not efficient + 0 conversions → only kill when the ad-set
            // is losing. Otherwise (ad-set hitting target) the rulebook
            // says "leave it" — fall through to the next rule.
            if (ad.conversions3d === 0 && options.adSetHittingTarget === false) {
                return {
                    verdict: "🔴",
                    ruleCode: "K5_weak",
                    reasonAr: REASON_K5_WEAK,
                    diagnosisAr: diagnose(ad, baselines),
                    evaluatedAt: now,
                };
            }
            // adSetHittingTarget === true OR undefined, OR the ad has
            // some conversions but isn't efficient enough for K5_rescue:
            // fall through to fatigue / S1.
        }
    }

    // ─── Step 4: Fatigue (conversion only) ────────────────────
    if (isRuleAllowedForObjective("fatigue_ctr", bucket)) {
        if (ad.peak1dCtr > 0 && ad.ctrLink > 0) {
            const ctrDrop = (ad.peak1dCtr - ad.ctrLink) / ad.peak1dCtr;
            // CPM-stable check: the ad's current CPM is at or below the
            // account's 14-day average. A 20% tolerance avoids noise.
            const cpmStable = ad.cpm3d <= baselines.cpm14d * 1.20;
            if (ctrDrop >= FATIGUE_CTR_DROP && cpmStable) {
                return {
                    verdict: "🟡",
                    ruleCode: "fatigue_ctr",
                    reasonAr: REASON_FATIGUE_CTR,
                    diagnosisAr: diagnose(ad, baselines),
                    evaluatedAt: now,
                };
            }
        }
    }
    if (isRuleAllowedForObjective("fatigue_cpm", bucket)) {
        if (ad.cpm3d > baselines.cpm14d * CPM_RISE_THRESHOLD) {
            return {
                verdict: "🟡",
                ruleCode: "fatigue_cpm",
                reasonAr: REASON_FATIGUE_CPM,
                diagnosisAr: diagnose(ad, baselines),
                evaluatedAt: now,
            };
        }
    }

    // ─── Step 5: S1 winner (conversion only) ───────────────────
    if (isRuleAllowedForObjective("S1", bucket)) {
        if (
            cpa3dMatchesTarget(ad, target)
            && aboveAccountAverage(ad.ctrLink, baselines.linkCtr90d)
        ) {
            return {
                verdict: "🟢",
                ruleCode: "S1",
                reasonAr: REASON_S1,
                diagnosisAr: diagnose(ad, baselines),
                evaluatedAt: now,
            };
        }
    }

    // ─── Step 6: Default continue ──────────────────────────────
    return {
        verdict: "🟡",
        ruleCode: "default_continue",
        reasonAr: REASON_DEFAULT,
        diagnosisAr: diagnose(ad, baselines),
        evaluatedAt: now,
    };
}
