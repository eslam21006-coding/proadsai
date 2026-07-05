// functions/src/cpaEconomics.ts — Phase 14 Layer 1 pure CPA/CPL economics
// ═══════════════════════════════════════════════════════════
// PURE module (no Firebase / Gemini imports). Implements the four-funnel
// target-CPA / target-CPL derivation engine + cap warning + advisory
// computation. The single source of truth is `qarar-rulebook.md §2.2–2.3`;
// spec references: spec.md §2.3 + §2.6 + research.md §I.
//
// FOUR FUNNEL TYPES (closed enum — drives which conditional fields apply):
//   - paid_event         → paid CPA branch (AOV, optional HTO, ROAS target)
//   - paid_product       → paid CPA branch (same shape as paid_event)
//   - free_webinar       → two-anchor CPL (leadValue via attendance × buy)
//   - lead_magnet_call   → two-anchor CPL (leadValue via leadToCloseRate)
//
// PAID BRANCH (CPA):
//   rawTargetCpa       = AOV ÷ roasTarget
//   fullBuyerValue     = AOV + (htoPrice × htoConversionRate/100)
//                        (= AOV when hasHto=false)
//   maxCpa             = fullBuyerValue ÷ 2.0          (ROAS floor = 2.0)
//   effectiveTargetCpa = min(raw, max)
//   capApplied         = raw > max                       (strictly greater)
//
// FREE BRANCH (CPL):
//   leadValue          = offerPrice × (rate/100) × ...   (see below)
//   economicCeilingCpl = 0.70 × leadValue                 (anchor 1 — ceiling)
//   effectiveTargetCpl = economicCeilingCpl
//                        (or operationalBaselineCpl if lower, once data exists)
//
// ADVISORIES (spec §2.6 — non-blocking, informational only):
//   noHto     = paid funnel && hasHto === false
//   lowValue  = (paid ? aov : offerPrice) < 9
//
// Both advisories may fire simultaneously. The target is ALWAYS calculated,
// even when an advisory fires.
// ═══════════════════════════════════════════════════════════

// ─── Funnel type taxonomy ───────────────────────────────────

export type FunnelType =
    | "paid_event"
    | "paid_product"
    | "free_webinar"
    | "lead_magnet_call";

export const ALL_FUNNEL_TYPES: ReadonlyArray<FunnelType> = [
    "paid_event",
    "paid_product",
    "free_webinar",
    "lead_magnet_call",
];

// ROAS targets are a CLOSED 3-option enum. Spec §2.2 forbids custom values.
export type RoasTarget = 1.0 | 0.65 | 0.5;
export const ALL_ROAS_TARGETS: ReadonlyArray<RoasTarget> = [1.0, 0.65, 0.5];

// Full-Funnel ROAS floor — fixed at 2.0 (rulebook §2.2). Centralized as a
// constant so a future decision to relax/tighten the floor only changes
// one number in the codebase.
export const FULL_FUNNEL_ROAS_FLOOR = 2.0;

// Economic ceiling CPL multiplier (anchor 1) — 0.70 (rulebook §2.3).
export const ECONOMIC_CEILING_MULTIPLIER = 0.70;

// Low-value advisory threshold — < $9 AOV/offerPrice (spec §2.6).
export const LOW_VALUE_THRESHOLD = 9;

// ─── Inputs ──────────────────────────────────────────────────

export interface PaidFunnelInputs {
    funnelType: "paid_event" | "paid_product";
    aov: number;
    hasHto: boolean;
    /** 0 when hasHto=false (forced by server). */
    htoPrice: number;
    /** 0 when hasHto=false (forced by server). Entered as percent. */
    htoConversionRate: number;
    roasTarget: RoasTarget;
}

export interface FreeWebinarInputs {
    funnelType: "free_webinar";
    offerPrice: number;
    attendanceRate: number;
    buyRateFromAttendees: number;
}

export interface LeadMagnetCallInputs {
    funnelType: "lead_magnet_call";
    offerPrice: number;
    leadToCloseRate: number;
}

export type FunnelInputs =
    | PaidFunnelInputs
    | FreeWebinarInputs
    | LeadMagnetCallInputs;

// ─── Outputs ──────────────────────────────────────────────────

export interface PaidDerived {
    rawTargetCpa: number;
    fullBuyerValue: number;
    maxCpa: number;
    effectiveTargetCpa: number;
    capApplied: boolean;
}

export interface FreeDerived {
    leadValue: number;
    economicCeilingCpl: number;
    effectiveTargetCpl: number;
    /** Anchor 2 — daily judgment. Optional until 30-day history exists. */
    operationalBaselineCpl?: number;
    /** Manual fallback when no operational history. */
    manualBenchmarkCpl?: number;
}

export interface DerivedTargets {
    paid?: PaidDerived;
    free?: FreeDerived;
    computedAt: number;
}

export interface Advisories {
    noHto: boolean;
    lowValue: boolean;
}

// ─── Pure functions ──────────────────────────────────────────

/** Round to 2 decimal places (USD cents). Deterministic, locale-safe. */
export function round2(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

/**
 * Derived target CPA for the paid branch.
 *
 *   rawTargetCpa       = AOV / roasTarget
 *   fullBuyerValue     = AOV + htoPrice × (htoConversionRate / 100)
 *                        (= AOV when hasHto=false)
 *   maxCpa             = fullBuyerValue / FULL_FUNNEL_ROAS_FLOOR  (= /2.0)
 *   effectiveTargetCpa = min(rawTargetCpa, maxCpa)
 *   capApplied         = rawTargetCpa > maxCpa   (strict; equality does NOT warn — FR-003)
 *
 * @throws Error if aov < 0, htoPrice < 0, htoConversionRate < 0,
 *         roasTarget is not in ALL_ROAS_TARGETS, or aov/htoPrice are NaN.
 */
export function deriveTargetCpa(input: PaidFunnelInputs): PaidDerived {
    assertPaidInput(input);
    const aov = input.aov;
    const hasHto = input.hasHto;
    const htoPrice = hasHto ? input.htoPrice : 0;
    const htoConversionRate = hasHto ? input.htoConversionRate : 0;
    const roasTarget = input.roasTarget;

    const rawTargetCpa = aov / roasTarget;
    const fullBuyerValue = aov + htoPrice * (htoConversionRate / 100);
    const maxCpa = fullBuyerValue / FULL_FUNNEL_ROAS_FLOOR;
    const effectiveTargetCpa = Math.min(rawTargetCpa, maxCpa);
    const capApplied = rawTargetCpa > maxCpa; // strictly greater (FR-003)

    return {
        rawTargetCpa: round2(rawTargetCpa),
        fullBuyerValue: round2(fullBuyerValue),
        maxCpa: round2(maxCpa),
        effectiveTargetCpa: round2(effectiveTargetCpa),
        capApplied,
    };
}

/**
 * Derived target CPL for the free-webinar branch.
 *
 *   leadValue          = offerPrice × (attendanceRate/100) × (buyRateFromAttendees/100)
 *   economicCeilingCpl = leadValue × ECONOMIC_CEILING_MULTIPLIER   (= ×0.70)
 *   effectiveTargetCpl = economicCeilingCpl
 *
 * @throws Error if any rate or price is negative, or NaN, or if
 *         offerPrice is missing.
 */
export function deriveTargetCplFreeWebinar(input: FreeWebinarInputs): FreeDerived {
    assertFreeWebinarInput(input);
    const leadValue =
        input.offerPrice *
        (input.attendanceRate / 100) *
        (input.buyRateFromAttendees / 100);
    const economicCeilingCpl = leadValue * ECONOMIC_CEILING_MULTIPLIER;
    return {
        leadValue: round2(leadValue),
        economicCeilingCpl: round2(economicCeilingCpl),
        effectiveTargetCpl: round2(economicCeilingCpl),
    };
}

/**
 * Derived target CPL for the lead-magnet-call branch.
 *
 *   leadValue          = offerPrice × (leadToCloseRate/100)
 *   economicCeilingCpl = leadValue × ECONOMIC_CEILING_MULTIPLIER
 *   effectiveTargetCpl = economicCeilingCpl
 *
 * @throws Error if rate or price is negative, or NaN.
 */
export function deriveTargetCplLeadMagnetCall(input: LeadMagnetCallInputs): FreeDerived {
    assertLeadMagnetCallInput(input);
    const leadValue = input.offerPrice * (input.leadToCloseRate / 100);
    const economicCeilingCpl = leadValue * ECONOMIC_CEILING_MULTIPLIER;
    return {
        leadValue: round2(leadValue),
        economicCeilingCpl: round2(economicCeilingCpl),
        effectiveTargetCpl: round2(economicCeilingCpl),
    };
}

/**
 * Compute all derived targets for a funnel. Dispatches on `funnelType`.
 * Caller passes `computedAt` (epoch ms) so the module is deterministic.
 */
export function deriveAll(input: FunnelInputs, computedAt: number): DerivedTargets {
    switch (input.funnelType) {
        case "paid_event":
        case "paid_product":
            return { paid: deriveTargetCpa(input), computedAt };
        case "free_webinar":
            return { free: deriveTargetCplFreeWebinar(input), computedAt };
        case "lead_magnet_call":
            return { free: deriveTargetCplLeadMagnetCall(input), computedAt };
        default: {
            const _exhaustive: never = input;
            throw new Error(`cpaEconomics: unknown funnelType: ${_exhaustive as unknown as string}`);
        }
    }
}

/**
 * Compute the two advisory flags (spec §2.6 — non-blocking).
 *
 *   noHto     = paid funnel && hasHto === false
 *   lowValue  = (paid ? aov : offerPrice) < LOW_VALUE_THRESHOLD
 *
 * Both can fire simultaneously. The target is always calculated regardless.
 */
export function computeAdvisories(input: FunnelInputs): Advisories {
    switch (input.funnelType) {
        case "paid_event":
        case "paid_product": {
            const noHto = input.hasHto === false;
            const lowValue = typeof input.aov === "number"
                && Number.isFinite(input.aov)
                && input.aov < LOW_VALUE_THRESHOLD;
            return { noHto, lowValue: !!lowValue };
        }
        case "free_webinar":
        case "lead_magnet_call": {
            const noHto = false; // not applicable to free funnels
            const lowValue = typeof input.offerPrice === "number"
                && Number.isFinite(input.offerPrice)
                && input.offerPrice < LOW_VALUE_THRESHOLD;
            return { noHto, lowValue: !!lowValue };
        }
        default: {
            const _exhaustive: never = input;
            throw new Error(`cpaEconomics: unknown funnelType: ${_exhaustive as unknown as string}`);
        }
    }
}

/**
 * The unified `effectiveTarget` that the Qarar verdict engine consumes
 * (spec §5.2 — paid funnels → effectiveTargetCPA, free → effectiveTargetCPL).
 * Returns `null` if no targets could be derived.
 */
export function getEffectiveTarget(derived: DerivedTargets): number | null {
    if (derived.paid) return derived.paid.effectiveTargetCpa;
    if (derived.free) return derived.free.effectiveTargetCpl;
    return null;
}

/**
 * Returns the cost metric name ("CPA" or "CPL") for downstream verdict
 * rules. Internal-only label — never user-facing (SC-11 forbids "CPA"/"CPL"
 * in user copy, but this string stays server-side).
 */
export function getCostMetric(derived: DerivedTargets): "CPA" | "CPL" | null {
    if (derived.paid) return "CPA";
    if (derived.free) return "CPL";
    return null;
}

// ─── Input validation ────────────────────────────────────────

function assertFiniteNonNegative(name: string, value: unknown): void {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(`cpaEconomics: ${name} must be a finite non-negative number; got ${value}`);
    }
}

function assertPaidInput(input: PaidFunnelInputs): void {
    assertFiniteNonNegative("aov", input.aov);
    if (input.hasHto) {
        assertFiniteNonNegative("htoPrice", input.htoPrice);
        assertFiniteNonNegative("htoConversionRate", input.htoConversionRate);
    }
    if (!ALL_ROAS_TARGETS.includes(input.roasTarget)) {
        throw new Error(
            `cpaEconomics: roasTarget must be one of ${ALL_ROAS_TARGETS.join(", ")}; ` +
            `got ${input.roasTarget}`,
        );
    }
}

function assertFreeWebinarInput(input: FreeWebinarInputs): void {
    assertFiniteNonNegative("offerPrice", input.offerPrice);
    assertFiniteNonNegative("attendanceRate", input.attendanceRate);
    assertFiniteNonNegative("buyRateFromAttendees", input.buyRateFromAttendees);
}

function assertLeadMagnetCallInput(input: LeadMagnetCallInputs): void {
    assertFiniteNonNegative("offerPrice", input.offerPrice);
    assertFiniteNonNegative("leadToCloseRate", input.leadToCloseRate);
}