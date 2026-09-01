// functions/src/cpaEconomics.ts — Phase 968 Layer 1 pure CPA/CPL economics
// ═══════════════════════════════════════════════════════════
// PURE module (no Firebase / Gemini imports). Implements the four-funnel
// target-CPA / target-CPL derivation engine + cap warning + advisory
// computation. The single source of truth is the contract
// `specs/968-funnel-economics-rebuild/contracts/cpaEconomics.md`.
//
// FOUR FUNNEL TYPES (closed enum — drives which conditional fields apply):
//   - paid_event         → paid CPA branch (AOV, optional HTO, ROAS target)
//   - paid_product       → paid CPA branch (AOV, optional HTO, ROAS target,
//                          value chain productBookingRate × productShowUpRate
//                          × productCloseRate on the HTO term — Phase 12
//                          production-bug fix)
//   - free_webinar       → two-anchor CPL (leadValue via attendance × buy)
//   - lead_magnet_call   → two-anchor CPL (leadValue via bookingRate × showUpRate
//                          × leadToCloseRate)
//
// SHARED FACTORS (FR-001, FR-003):
//   spendShare = (100 - marginKept)    / 100
//   netFactor  = (100 - commissionRate) / 100
//
// PAID BRANCH (CPA) — FR-008..FR-014, FR-019, Phase 12 + Phase 13:
//   rawTargetCpa       = AOV / roasTarget
//   fullBuyerValue     = AOV + htoPrice × netFactor × (chain/100)
//                        (paid_event:   eventAttendanceRate × eventCloseRate
//                         paid_product: productBookingRate × productShowUpRate
//                                      × productQualificationRate
//                                      × productCloseRate — Phase 11 replaced
//                                      htoConversionRate with a 3-stage chain;
//                                      Phase 13 added the qualification stage
//                                      because some booked calls that happen
//                                      turn out to be unqualified, and folding
//                                      that drop-off into close rate would
//                                      conflate two different rates. The
//                                      storage slots are `product*`-prefixed
//                                      because the chain is buyer-side —
//                                      different denominator from
//                                      lead_magnet_call's lead-side chain.
//                                      Phase 12 separated the two prefix
//                                      conventions; Phase 13 added the
//                                      qualification stage to both.)
//   maxCpa             = fullBuyerValue × spendShare
//   effectiveTargetCpa = min(rawTargetCpa, maxCpa)
//   capApplied         = rawTargetCpa > maxCpa  (strict; FR-003)
//
// FREE BRANCH (CPL) — FR-005..FR-007, FR-008..FR-009, Phase 13:
//   leadValue          = offerPrice × netFactor × (chain/100)
//                        free_webinar:     attendanceRate × buyRateFromAttendees
//                        lead_magnet_call: bookingRate × showUpRate
//                                          × qualificationRate × leadToCloseRate
//                        (Phase 13 added qualificationRate to
//                        lead_magnet_call's chain — same rationale as
//                        paid_product above. lead_magnet_call keeps the
//                        unprefixed slot name, matching its sibling
//                        bookingRate/showUpRate/leadToCloseRate.)
//   economicCeilingCpl = leadValue × spendShare
//   effectiveTargetCpl = economicCeilingCpl
//
// ADVISORIES (spec §2.6 — non-blocking):
//   noHto     = paid funnel && hasHto === false
//   lowValue  = (computed target, rounded to 2dp, displayed) < LOW_VALUE_TARGET_THRESHOLD
//               (0.50) — FR-028, FR-029. The OLD price-based advisory
//               (`LOW_VALUE_THRESHOLD = 9`, keyed off `aov` / `offerPrice`)
//               is the deprecated path; the new advisory keys off the
//               COMPUTED TARGET, not the entered price. T049 (Phase 8)
//               finalises the switch; this module already supports both
//               inputs because computeAdvisories was signature-changed in
//               T017a to accept the derived targets.
//
// Both advisories may fire simultaneously. The target is ALWAYS calculated,
// even when an advisory fires.
//
// STORAGE STAMP — R-1, FR-041, FR-041a:
//   Every DerivedTargets carries `economicsVersion = ECONOMICS_VERSION = 2`.
//   This is a schema discriminator, NOT a business epoch (see data-model.md
//   §2 + plan.md R-1). It MUST NOT be read by learning code, MUST NOT
//   appear in any aggregate path, and MUST NOT gain a threshold rule.
//
//   FR-041a (load-bearing, recorded alongside ECONOMICS_VERSION):
//   any future phase that adds a REQUIRED field to DerivedTargets MUST
//   bump ECONOMICS_VERSION. The absence of the stamp on pre-phase payloads
//   is what makes `getEffectiveTarget` return `null` — the gate that
//   protects the learning loop from re-judging historical ads against the
//   corrected math.
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

// ─── Phase 968 constants (T011) ─────────────────────────────

// Storage discriminator (R-1, FR-041, FR-041a).
// FR-041a obligation: any future phase adding a required field to
// DerivedTargets MUST bump this. Recorded inline so the contract is
// visible next to the constant, not buried in a doc.
export const ECONOMICS_VERSION = 2 as const;

// Advisory boundary (FR-028, FR-028a). Replaces the role of the old
// `LOW_VALUE_THRESHOLD = 9` price trigger — FR-029 forbids keying off
// price. The advisory now keys off the computed target.
export const LOW_VALUE_TARGET_THRESHOLD = 0.50;

// Closed enum for `marginKept` (FR-026). Never free-entry (FR-025a).
export const ALL_MARGIN_KEPT: ReadonlyArray<50 | 60 | 70> = [50, 60, 70];
export const DEFAULT_MARGIN_KEPT: 50 | 60 | 70 = 60;
export const DEFAULT_COMMISSION_RATE = 10;

// Phase 968 — T041 (FR-016, FR-021): `paid_event` defaults to a
// front-end-loss posture (ROAS 0.5) — the owner accepts a controlled
// 50% loss on the front-end in exchange for back-end ticket sales.
// `paid_product` stays at the existing default of 1.0 (no loss).
// The asymmetry is enforced by `saveFunnelSettings` when the request
// omits `roasTarget`.
export const DEFAULT_PAID_EVENT_ROAS_TARGET = 0.5;

// ─── Deprecated constants (FR-002) ──────────────────────────
//
// ECONOMIC_CEILING_MULTIPLIER (was 0.70) — replaced by `spendShare`,
// derived from the owner's `marginKept`.
// FULL_FUNNEL_ROAS_FLOOR       (was 2.0) — replaced by `spendShare`.
// Neither is retained as a fallback. Removed in T013.

export type MarginKept = 50 | 60 | 70;

// ─── Inputs ──────────────────────────────────────────────────

export interface PaidFunnelInputs {
    funnelType: "paid_event" | "paid_product";
    aov: number;
    hasHto: boolean;
    /** 0 when hasHto=false (forced by server). */
    htoPrice: number;
    /**
     * Phase 11 — DEAD at read time on every funnel type. The chain
     * (productBookingRate × productShowUpRate × productCloseRate)
     * replaces it on `paid_product`; `paid_event` never read it after
     * Phase 7 Item C. The field stays in the type for additive
     * storage compatibility (data-model.md §1) but the derivation
     * never multiplies by it. Coerced to `0` when not supplied
     * (callers may pass any number — the derivation ignores the
     * value).
     */
    htoConversionRate: number;
    /** Event-attendance rate for `paid_event` (0–100, percent). 0 otherwise. */
    eventAttendanceRate: number;
    /** Event-close rate for `paid_event` (0–100, percent). 0 otherwise. */
    eventCloseRate: number;
    // Phase 12 — paid_product's chain. The fields are SCOPED to
    // `paid_product` and measure buyers → close. They are NOT shared
    // with `lead_magnet_call`, whose `bookingRate` / `showUpRate` /
    // `leadToCloseRate` slots measure leads → close. The Phase 11
    // implementation overloaded the same storage slots, which was
    // a cross-funnel aggregate hazard: any consumer that reads
    // `bookingRate` without carrying `funnelType` alongside would
    // silently average incompatible denominators (paying-customer
    // bookings vs free-lead bookings differ by roughly an order of
    // magnitude). The `product*` prefix mirrors the `event*` prefix
    // already used by `paid_event` — the codebase's existing
    // convention for funnel-scoped chain fields.
    //
    // 0 when not applicable. `0` is a legitimate value — zero
    // booking / show-up / qualification / close collapses the chain to 0.
    productBookingRate: number;
    productShowUpRate: number;
    // Phase 13 — added qualification stage. See the doc-comment at the
    // top of this file (PAID BRANCH) for the rationale. `0` is a
    // legitimate value — zero qualification collapses the chain.
    productQualificationRate: number;
    productCloseRate: number;
    /** 0–100 inclusive (FR-027). 100 zeroes leadValue; 0 leaves it intact. */
    commissionRate: number;
    /** Closed enum (50 | 60 | 70) (FR-026). */
    marginKept: MarginKept;
    roasTarget: RoasTarget;
}

export interface FreeWebinarInputs {
    funnelType: "free_webinar";
    offerPrice: number;
    attendanceRate: number;
    buyRateFromAttendees: number;
    commissionRate: number;
    marginKept: MarginKept;
}

export interface LeadMagnetCallInputs {
    funnelType: "lead_magnet_call";
    offerPrice: number;
    leadToCloseRate: number;
    bookingRate: number;
    showUpRate: number;
    // Phase 13 — added qualification stage. Some booked calls that
    // happen turn out to be unqualified; folding that drop-off into
    // close rate would conflate two different rates (the close rate
    // measures qualified attended calls that buy; qualification rate
    // measures attended calls that turn out to be qualified). The
    // field is unprefixed because lead_magnet_call owns the
    // unprefixed chain slots (bookingRate / showUpRate /
    // leadToCloseRate siblings). 0 is a legitimate value — zero
    // qualification collapses the chain.
    qualificationRate: number;
    commissionRate: number;
    marginKept: MarginKept;
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
    economicsVersion: typeof ECONOMICS_VERSION;
    paid?: PaidDerived;
    free?: FreeDerived;
    computedAt: number;
}

export interface Advisories {
    noHto: boolean;
    lowValue: boolean;
}

// ─── Shared pure helpers (T012) ─────────────────────────────

/** (100 - marginKept) / 100. FR-001. */
export function spendShare(marginKept: MarginKept): number {
    return (100 - marginKept) / 100;
}

/** (100 - commissionRate) / 100. FR-003. */
export function netFactor(commissionRate: number): number {
    return (100 - commissionRate) / 100;
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
 *   fullBuyerValue     = AOV + htoPrice × netFactor × (chain/100)
 *                        (paid_event:   eventAttendanceRate × eventCloseRate
 *                         paid_product: productBookingRate × productShowUpRate
 *                                      × productCloseRate)
 *   maxCpa             = fullBuyerValue × spendShare
 *   effectiveTargetCpa = min(rawTargetCpa, maxCpa)
 *   capApplied         = rawTargetCpa > maxCpa   (strict; FR-003)
 *
 * @throws Error if any number is non-finite/negative, if `roasTarget`
 *         is not in `ALL_ROAS_TARGETS`, if `commissionRate` is outside
 *         `[0, 100]`, or if `marginKept` is not in `ALL_MARGIN_KEPT`.
 */
export function deriveTargetCpa(input: PaidFunnelInputs): PaidDerived {
    assertPaidInput(input);
    const aov = input.aov;
    const hasHto = input.hasHto;
    const roasTarget = input.roasTarget;
    const nf = netFactor(input.commissionRate);
    const ss = spendShare(input.marginKept);

    const rawTargetCpa = aov / roasTarget;

    let fullBuyerValue: number;
    if (input.funnelType === "paid_event") {
        // FR-011..FR-014: commission + attendance × close only on HTO term.
        fullBuyerValue =
            aov +
            (hasHto ? input.htoPrice : 0) *
                nf *
                (input.eventAttendanceRate / 100) *
                (input.eventCloseRate / 100);
    } else {
        // Phase 11 / Phase 12 / Phase 13 — paid_product reads the chain
        // (productBookingRate × productShowUpRate ×
        //  productQualificationRate × productCloseRate)
        // on the HTO term. Phase 13 added the qualification stage
        // because some booked calls that happen turn out to be
        // unqualified. FR-019 / OQ-1 override: commission on HTO term
        // only — netFactor multiplies the HTO term, never the AOV
        // term.
        fullBuyerValue =
            aov +
            (hasHto ? input.htoPrice : 0) *
                nf *
                (input.productBookingRate / 100) *
                (input.productShowUpRate / 100) *
                (input.productQualificationRate / 100) *
                (input.productCloseRate / 100);
    }

    const maxCpa = fullBuyerValue * ss;
    const effectiveTargetCpa = Math.min(rawTargetCpa, maxCpa);
    const capApplied = rawTargetCpa > maxCpa;

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
 *   leadValue          = offerPrice × netFactor × (attendanceRate/100) × (buyRateFromAttendees/100)
 *   economicCeilingCpl = leadValue × spendShare
 *   effectiveTargetCpl = economicCeilingCpl
 *
 * @throws Error on invalid numeric input, commissionRate out of range,
 *         or marginKept outside ALL_MARGIN_KEPT.
 */
export function deriveTargetCplFreeWebinar(input: FreeWebinarInputs): FreeDerived {
    assertFreeWebinarInput(input);
    const leadValue =
        input.offerPrice *
        netFactor(input.commissionRate) *
        (input.attendanceRate / 100) *
        (input.buyRateFromAttendees / 100);
    const economicCeilingCpl = leadValue * spendShare(input.marginKept);
    return {
        leadValue: round2(leadValue),
        economicCeilingCpl: round2(economicCeilingCpl),
        effectiveTargetCpl: round2(economicCeilingCpl),
    };
}

/**
 * Derived target CPL for the lead-magnet-call branch.
 *
 *   leadValue          = offerPrice × netFactor × (bookingRate/100)
 *                        × (showUpRate/100) × (qualificationRate/100)
 *                        × (leadToCloseRate/100)
 *   economicCeilingCpl = leadValue × spendShare
 *   effectiveTargetCpl = economicCeilingCpl
 *
 * @throws Error on invalid numeric input, commissionRate out of range,
 *         or marginKept outside ALL_MARGIN_KEPT.
 */
export function deriveTargetCplLeadMagnetCall(input: LeadMagnetCallInputs): FreeDerived {
    assertLeadMagnetCallInput(input);
    const leadValue =
        input.offerPrice *
        netFactor(input.commissionRate) *
        (input.bookingRate / 100) *
        (input.showUpRate / 100) *
        (input.qualificationRate / 100) *
        (input.leadToCloseRate / 100);
    const economicCeilingCpl = leadValue * spendShare(input.marginKept);
    return {
        leadValue: round2(leadValue),
        economicCeilingCpl: round2(economicCeilingCpl),
        effectiveTargetCpl: round2(economicCeilingCpl),
    };
}

/**
 * Compute all derived targets for a funnel. Dispatches on `funnelType`.
 * Stamps every payload with `economicsVersion` (T015, R-1).
 * Caller passes `computedAt` (epoch ms) so the module is deterministic.
 */
export function deriveAll(input: FunnelInputs, computedAt: number): DerivedTargets {
    switch (input.funnelType) {
        case "paid_event":
        case "paid_product":
            return {
                economicsVersion: ECONOMICS_VERSION,
                paid: deriveTargetCpa(input),
                computedAt,
            };
        case "free_webinar":
            return {
                economicsVersion: ECONOMICS_VERSION,
                free: deriveTargetCplFreeWebinar(input),
                computedAt,
            };
        case "lead_magnet_call":
            return {
                economicsVersion: ECONOMICS_VERSION,
                free: deriveTargetCplLeadMagnetCall(input),
                computedAt,
            };
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
 *   lowValue  = (computed target, ROUNDED via round2) < LOW_VALUE_TARGET_THRESHOLD
 *               (FR-028). Strict inequality; equality does NOT warn (FR-028a).
 *
 * SIGNATURE CHANGED (T017a): now takes the derived targets as a second
 * argument because the low-value advisory keys off the computed target
 * rather than the entered price (FR-028). Every call site must pass
 * them — `funnelSettings.ts` was updated in the same phase.
 *
 * Both can fire simultaneously. The target is always calculated regardless.
 *
 * @throws Error only on an unknown funnelType — never on missing derived
 *         branches; if a branch is absent the target-keyed advisory is
 *         silent rather than throwing.
 */
export function computeAdvisories(input: FunnelInputs, derived: DerivedTargets): Advisories {
    const noHto =
        (input.funnelType === "paid_event" || input.funnelType === "paid_product") &&
        input.hasHto === false;

    let roundedTarget: number | null = null;
    if (derived.paid) roundedTarget = round2(derived.paid.effectiveTargetCpa);
    else if (derived.free) roundedTarget = round2(derived.free.effectiveTargetCpl);

    const lowValue = roundedTarget !== null && roundedTarget < LOW_VALUE_TARGET_THRESHOLD;

    return { noHto, lowValue };
}

/**
 * The unified `effectiveTarget` that the Qarar verdict engine consumes
 * (spec §5.2 — paid funnels → effectiveTargetCPA, free → effectiveTargetCPL).
 *
 * Returns `null` if no targets could be derived OR if the payload is not
 * stamped with `economicsVersion === ECONOMICS_VERSION` (R-1, FR-041,
 * FR-041a). This gate is the mechanism that protects the learning loop
 * from re-judging historical ads against the corrected math: pre-phase
 * payloads carry no stamp, so this returns `null` without anyone writing
 * to the document.
 */
export function getEffectiveTarget(derived: DerivedTargets): number | null {
    // T016 — version gate. The absence of the stamp is the signal.
    if (derived.economicsVersion !== ECONOMICS_VERSION) return null;
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

function assertPercentage(name: string, value: unknown): void {
    assertFiniteNonNegative(name, value);
    if ((value as number) > 100) {
        throw new Error(`cpaEconomics: ${name} must be between 0 and 100; got ${value}`);
    }
}

function assertCommissionRate(value: unknown): void {
    assertFiniteNonNegative("commissionRate", value);
    if ((value as number) > 100) {
        throw new Error(`cpaEconomics: commissionRate must be between 0 and 100; got ${value}`);
    }
}

function assertMarginKept(value: unknown): void {
    if (!ALL_MARGIN_KEPT.includes(value as 50 | 60 | 70)) {
        throw new Error(
            `cpaEconomics: marginKept must be one of ${ALL_MARGIN_KEPT.join(", ")}; got ${value}`,
        );
    }
}

function assertPaidInput(input: PaidFunnelInputs): void {
    assertFiniteNonNegative("aov", input.aov);
    assertCommissionRate(input.commissionRate);
    assertMarginKept(input.marginKept);
    if (input.hasHto) {
        assertFiniteNonNegative("htoPrice", input.htoPrice);
        // htoConversionRate is dead at read time (Phase 11). The
        // field is retained in the type for additive storage
        // compatibility (data-model.md §1) and the assertion is
        // preserved here so a future caller that supplies a value
        // outside [0, 100] still gets a clean error. The derivation
        // never multiplies by it.
        assertPercentage("htoConversionRate", input.htoConversionRate);
    }
    if (input.funnelType === "paid_event") {
        // Event-rate fields are required for paid_event derivation.
        assertPercentage("eventAttendanceRate", input.eventAttendanceRate);
        assertPercentage("eventCloseRate", input.eventCloseRate);
    }
    if (input.funnelType === "paid_product") {
        // Phase 11 / Phase 12 / Phase 13 — paid_product reads the
        // chain (productBookingRate × productShowUpRate ×
        //  productQualificationRate × productCloseRate) on the HTO
        // term. The fields are validated even when hasHto=false (the
        // derivation collapses the HTO term to 0 but the inputs must
        // still be in range — otherwise a unit test or a future code
        // path that reads them on the no-HTO branch would fail
        // opaquely).
        assertPercentage("productBookingRate", input.productBookingRate);
        assertPercentage("productShowUpRate", input.productShowUpRate);
        assertPercentage("productQualificationRate", input.productQualificationRate);
        assertPercentage("productCloseRate", input.productCloseRate);
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
    assertPercentage("attendanceRate", input.attendanceRate);
    assertPercentage("buyRateFromAttendees", input.buyRateFromAttendees);
    assertCommissionRate(input.commissionRate);
    assertMarginKept(input.marginKept);
}

function assertLeadMagnetCallInput(input: LeadMagnetCallInputs): void {
    assertFiniteNonNegative("offerPrice", input.offerPrice);
    assertPercentage("leadToCloseRate", input.leadToCloseRate);
    assertPercentage("bookingRate", input.bookingRate);
    assertPercentage("showUpRate", input.showUpRate);
    // Phase 13 — added qualification stage. See the doc-comment on
    // LeadMagnetCallInputs.qualificationRate for the rationale.
    assertPercentage("qualificationRate", input.qualificationRate);
    assertCommissionRate(input.commissionRate);
    assertMarginKept(input.marginKept);
}

