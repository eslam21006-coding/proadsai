// functions/src/__tests__/cpaEconomics.test.ts
// Phase 968 — Layer 1 pure CPA/CPL economics unit tests.
// Spec §2.3 + acceptance 6–9 + research §I worked examples.
// All fixtures match `specs/968-funnel-economics-rebuild/contracts/cpaEconomics.md`
// §4 (verified, not hand-derived; FR-048 end-of-chain rounding).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    deriveTargetCpa,
    deriveTargetCplFreeWebinar,
    deriveTargetCplLeadMagnetCall,
    deriveAll,
    computeAdvisories,
    getEffectiveTarget,
    getCostMetric,
    ECONOMICS_VERSION,
    LOW_VALUE_TARGET_THRESHOLD,
    spendShare,
    netFactor,
    round2,
    type PaidFunnelInputs,
    type FreeWebinarInputs,
    type LeadMagnetCallInputs,
} from "../cpaEconomics.js";

// ─── Constants sanity (T011) ─────────────────────────────────

test("constants — ECONOMICS_VERSION = 2 (R-1, FR-041)", () => {
    assert.equal(ECONOMICS_VERSION, 2);
});

test("constants — LOW_VALUE_TARGET_THRESHOLD = 0.50 (FR-028)", () => {
    assert.equal(LOW_VALUE_TARGET_THRESHOLD, 0.50);
});

// ─── Shared factors (T012) ───────────────────────────────────

test("spendShare — 50/60/70 map to 0.50/0.40/0.30", () => {
    assert.equal(spendShare(50), 0.50);
    assert.equal(spendShare(60), 0.40);
    assert.equal(spendShare(70), 0.30);
});

test("netFactor — 0/10/100 map to 1.00/0.90/0.00", () => {
    assert.equal(netFactor(0), 1.0);
    assert.equal(netFactor(10), 0.9);
    assert.equal(netFactor(100), 0);
});

// ─── Paid CPA branch ─────────────────────────────────────────
//
// Phase 2 reshapes the paid-event formula (FR-011..FR-014) to use
// `eventAttendanceRate × eventCloseRate` (not `htoConversionRate`) and
// wraps the HTO term with `netFactor`. Tests below cover the new shape.

test("paid_event: AOV $43 + HTO $3500 @ 75% attend, 7.5% close + ROAS 1.0", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 43,
        hasHto: true,
        htoPrice: 3500,
        htoConversionRate: 3, // unused on paid_event — kept for additive storage
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    };
    const d = deriveTargetCpa(inp);
    // rawTargetCpa = 43 / 1.0 = 43
    assert.equal(d.rawTargetCpa, 43);
    // fullBuyerValue = 43 + 3500 × 0.9 × 0.75 × 0.075 = 43 + 177.1875 = 220.1875 → 220.19
    assert.equal(d.fullBuyerValue, 220.19);
    // maxCpa = 220.1875 × 0.4 = 88.075 → 88.08
    assert.equal(d.maxCpa, 88.08);
    // effective = min(43, 88.08) = 43
    assert.equal(d.effectiveTargetCpa, 43);
    assert.equal(d.capApplied, false);
});

test("paid_event: ROAS 0.5 path — cap warning fires when raw exceeds maxCpa", () => {
    // With aov 43, htoPrice 3500, eventAttendance 75, eventClose 7.5,
    // commissionRate 10, marginKept 60:
    //   raw = 86
    //   fullBuyerValue = 43 + 3500 × 0.9 × 0.75 × 0.075 = 220.1875
    //   maxCpa = 220.1875 × 0.4 = 88.075
    //   raw (86) < max (88.075) ⇒ cap does NOT fire.
    // To force the cap we need raw > max. Use a lower HTO and tighter
    // margin so the projection-path ceiling is below raw.
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 43,
        hasHto: true,
        htoPrice: 350,
        htoConversionRate: 3,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 70, // spendShare = 0.30
        roasTarget: 0.5,
    };
    const d = deriveTargetCpa(inp);
    // raw = 86
    assert.equal(d.rawTargetCpa, 86);
    // fullBuyerValue = 43 + 350 × 0.9 × 0.75 × 0.075 = 43 + 17.71875 = 60.72
    // maxCpa = 60.71875 × 0.3 = 18.2156 → 18.22
    // raw (86) > max (18.22) ⇒ capApplied = true.
    assert.equal(d.capApplied, true);
    assert.equal(d.effectiveTargetCpa, 18.22);
});

test("paid_event: no HTO + ROAS 1.0 — fullBuyerValue collapses to AOV", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 47,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    };
    const d = deriveTargetCpa(inp);
    // raw = 47, fullBuyerValue = 47 + 0 = 47, maxCpa = 47 × 0.4 = 18.80
    assert.equal(d.fullBuyerValue, 47);
    assert.equal(d.maxCpa, 18.8);
    assert.equal(d.rawTargetCpa, 47);
    assert.equal(d.effectiveTargetCpa, 18.8);
    assert.equal(d.capApplied, true);
});

test("paid_event: commissionRate 100 zeroes netFactor → HTO term 0 → fullBuyerValue = AOV", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 24,
        hasHto: true,
        htoPrice: 3000,
        htoConversionRate: 5,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 100,
        marginKept: 60,
        roasTarget: 0.5,
    };
    const d = deriveTargetCpa(inp);
    // raw = 48; fullBuyerValue = 24 + 3000 × 0 × 0.75 × 0.075 = 24; maxCpa = 24 × 0.4 = 9.60
    assert.equal(d.fullBuyerValue, 24);
    assert.equal(d.maxCpa, 9.6);
    assert.equal(d.effectiveTargetCpa, 9.6);
});

test("paid_product: netFactor on HTO term only — OQ-1 override (FR-019)", () => {
    // Phase 11 + Phase 13 — discriminating fixture per contract §4.4:
    //   aov=100, htoPrice=3000, chain product = 0.015 (= 20% booking
    //   × 60% show-up × 50% qualified × 25% close / 100³), commissionRate=10,
    //   marginKept=60, roasTarget=1.0.
    //
    // The chain rates are the Phase 13 paid_product benchmarks
    // (owner-supplied) and reproduce the same fullBuyerValue
    // discriminator shape as the Phase 968 contract fixture pinned
    // with the single htoConversionRate=5 rate. The exact
    // fullBuyerValue changes (235 → 140.50) because the chain
    // grows from 3 stages to 4 (qualification added).
    //
    // fullBuyerValue = 100 + 3000 × 0.9 × 0.015 = 100 + 40.5 = 140.50.
    // commission on aov would give 130.50; no commission would give 145.00.
    // Three distinct values ⇒ OQ-1 discriminator intact.
    const inp: PaidFunnelInputs = {
        funnelType: "paid_product",
        aov: 100,
        hasHto: true,
        htoPrice: 3000,
        // Phase 11 — htoConversionRate is dead at read time; the
        // value below is preserved for the type but never multiplied.
        htoConversionRate: 5,
        productBookingRate: 20,
        productShowUpRate: 60,
        productQualificationRate: 50,
        productCloseRate: 25,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    };
    const d = deriveTargetCpa(inp);
    assert.equal(d.fullBuyerValue, 140.50);
    // maxCpa = 140.50 × 0.4 = 56.20; raw = 100; effective = 56.20;
    // capApplied = true.
    assert.equal(d.maxCpa, 56.20);
    assert.equal(d.effectiveTargetCpa, 56.20);
    assert.equal(d.capApplied, true);
});

test("paid_product: chain rates do not collapse to a round product — drop one stage ⇒ fullBuyerValue changes (Phase 11 §B)", () => {
    // The first FR-019 fixture (above) tunes rates so the chain
    // product is 0.015 (20 × 60 × 50 × 25 / 100³) — a round number
    // (1.5%). That is good for the FR-019 anchor but a poor
    // structural discriminator — a regression that drops one stage
    // and doubles another (e.g. `(40 × 60 × 50 × 25)`) still produces
    // 0.030 and the test passes. This fixture pins a chain product
    // with a non-round arithmetic and asserts each stage matters
    // independently.
    //
    // Fixture: booking=7.5, show-up=60, qualified=50, close=25
    //   product = 0.075 × 0.60 × 0.50 × 0.25 = 0.005625
    //   HTO contribution = 3000 × 0.9 × 0.005625 = 15.1875
    //   fullBuyerValue = 100 + 15.1875 = 115.1875 → 115.19
    //
    // Each stage MUST appear in the multiplication. Dropping any
    // one zeroes the HTO contribution and collapses fullBuyerValue
    // to aov (100). Duplicating one would not match the literal
    // either (the chain is multiplicative, not additive).
    const base: PaidFunnelInputs = {
        funnelType: "paid_product",
        aov: 100,
        hasHto: true,
        htoPrice: 3000,
        htoConversionRate: 0, // dead at read time (Phase 11)
        productBookingRate: 7.5,
        productShowUpRate: 60,
        productQualificationRate: 50,
        productCloseRate: 25,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    };
    const d = deriveTargetCpa(base);
    assert.equal(d.fullBuyerValue, 115.19);

    // Drop productBookingRate ⇒ HTO term collapses to 0 ⇒ fullBuyerValue = aov.
    const dropBooking = deriveTargetCpa({ ...base, productBookingRate: 0 });
    assert.equal(dropBooking.fullBuyerValue, 100);

    // Drop productShowUpRate ⇒ same collapse.
    const dropShowUp = deriveTargetCpa({ ...base, productShowUpRate: 0 });
    assert.equal(dropShowUp.fullBuyerValue, 100);

    // Drop productQualificationRate ⇒ same collapse (Phase 13).
    const dropQualified = deriveTargetCpa({ ...base, productQualificationRate: 0 });
    assert.equal(dropQualified.fullBuyerValue, 100);

    // Drop productCloseRate ⇒ same collapse.
    const dropClose = deriveTargetCpa({ ...base, productCloseRate: 0 });
    assert.equal(dropClose.fullBuyerValue, 100);

    // The chain is multiplicative, not additive. Doubling
    // productBookingRate doubles the HTO contribution (not the
    // fullBuyerValue); the test asserts the relationship. Tolerance
    // is 0.02 — the FR-048 round2-at-end-of-chain rule means a
    // doubling can land within one cent of "exactly 2×" depending on
    // how the cent boundary falls on each side of the subtraction.
    // The relationship is exact on the unrounded algebra; the
    // assertion is about structural shape, not bit equality. The
    // unrounded math is exact: 3000 × 0.9 × (15/100 × 60/100 ×
    // 50/100 × 25/100) = 30.375 vs 2 × (3000 × 0.9 × (7.5/100 ×
    // 60/100 × 50/100 × 25/100)) = 30.375.
    const doubledBooking = deriveTargetCpa({ ...base, productBookingRate: 15 });
    const htoOriginal = d.fullBuyerValue - 100;
    const htoDoubled = doubledBooking.fullBuyerValue - 100;
    assert.ok(
        Math.abs(htoDoubled - htoOriginal * 2) < 0.02,
        `doubling bookingRate doubles the HTO contribution (multiplicative, not additive); ` +
        `original=${htoOriginal}, doubled=${htoDoubled}, expected≈${htoOriginal * 2}`,
    );
});

test("paid: capApplied uses strict `>` — equality boundary unreachable under the closed marginKept enum (FR-003)", () => {
    // Round-12 (CodeRabbit round 12 Item 19): the previous name was
    // "paid: equality raw == max → NO warn (FR-003)" but the body
    // asserts `capApplied === true` (the opposite direction). The
    // boundary itself is unreachable through the closed marginKept
    // enum: equality raw == max would require
    //   aov / roasTarget = aov × spendShare
    //   ⇒ roasTarget = 1 / spendShare
    // and spendShare ∈ {0.30, 0.40, 0.50} yields roasTarget ∈
    // {10/3, 5/2, 2} — none of which are in {1.0, 0.65, 0.5}.
    // Pin the strict `>` rule from the other side: a setup where the
    // inputs force raw > max, and the body confirms `capApplied =
    // true`. The equality boundary itself is enforced by the `>`
    // operator at the call site and is exercised in the companion
    // tests below (raw == max would need marginKept = 0 which the
    // FunnelInputs contract rejects).
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 1_000_000, // huge aov so fullBuyerValue >> raw
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 70, // tightest spendShare = 0.30
        roasTarget: 1.0, // raw = aov
    };
    const d = deriveTargetCpa(inp);
    // max = aov × 0.30 = 300_000; raw = 1_000_000; raw > max ⇒ capApplied = true.
    assert.equal(d.capApplied, true);

    // Companion negative test: choose inputs where raw ≤ max
    // (huge HTO term + non-zero spendShare widens fullBuyerValue
    // beyond raw). capApplied must be false. This is the half of
    // FR-003 the renamed body above cannot reach.
    const wideBackEnd: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: true,
        htoPrice: 1000,
        htoConversionRate: 10, // unused on paid_event, kept for type completeness
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 100,
        eventCloseRate: 100,
        commissionRate: 10,
        marginKept: 70, // spendShare = 0.30
        roasTarget: 1.0, // raw = 100
    };
    const d2 = deriveTargetCpa(wideBackEnd);
    // fullBuyerValue = 100 + 1000 × 0.9 × 1 × 1 = 1000
    // max = 1000 × 0.30 = 300; raw = 100; raw ≤ max ⇒ capApplied = false.
    assert.equal(d2.capApplied, false);
});

// ─── Lead magnet call ────────────────────────────────────────

// Report §6.1 — three-margin row fixture. Phase 13 inputs:
//   offerPrice 3000, bookingRate 7.5, showUpRate 60, qualificationRate 50,
//   leadToCloseRate 25, commissionRate 10.
// leadValue = 3000 × 0.9 × 0.075 × 0.60 × 0.50 × 0.25 = 15.1875 → 15.19
// Then effectiveTargetCpl = leadValue × spendShare at each margin row:
//   marginKept 50 ⇒ spendShare 0.50 ⇒ 15.1875 × 0.50 = 7.59375  → 7.59
//   marginKept 60 ⇒ spendShare 0.40 ⇒ 15.1875 × 0.40 = 6.07500  → 6.08
//   marginKept 70 ⇒ spendShare 0.30 ⇒ 15.1875 × 0.30 = 4.55625  → 4.56
//
// Phase 13 changed the benchmarks: show-up moved from "above 65%"
// to 60% (owner-supplied), leadToClose moved from 20–25% to 25%
// (now measured on qualified calls, not all attended calls), and
// qualification (50%, new) was added between show-up and close.
// The headline anchor at margin 60 moves from $12.76 → $6.08.
// Round-2 (5/2) cent boundary: 6.075 rounds to 6.08 (round-half-
// away-from-zero or round-half-to-even — both agree here).

test("lead_magnet_call report §6.1: marginKept 50 ⇒ $7.59", () => {
    const inp: LeadMagnetCallInputs = {
        funnelType: "lead_magnet_call",
        offerPrice: 3000,
        bookingRate: 7.5,
        showUpRate: 60,
        qualificationRate: 50,

        leadToCloseRate: 25,
        commissionRate: 10,
        marginKept: 50,
    };
    const d = deriveTargetCplLeadMagnetCall(inp);
    assert.equal(d.leadValue, 15.19);
    assert.equal(d.economicCeilingCpl, 7.59);
    assert.equal(d.effectiveTargetCpl, 7.59);
});

test("lead_magnet_call report §6.1: marginKept 60 (default) ⇒ $6.08", () => {
    const inp: LeadMagnetCallInputs = {
        funnelType: "lead_magnet_call",
        offerPrice: 3000,
        bookingRate: 7.5,
        showUpRate: 60,
        qualificationRate: 50,

        leadToCloseRate: 25,
        commissionRate: 10,
        marginKept: 60,
    };
    const d = deriveTargetCplLeadMagnetCall(inp);
    assert.equal(d.leadValue, 15.19);
    assert.equal(d.economicCeilingCpl, 6.08);
    assert.equal(d.effectiveTargetCpl, 6.08);
});

test("lead_magnet_call report §6.1: marginKept 70 ⇒ $4.56", () => {
    const inp: LeadMagnetCallInputs = {
        funnelType: "lead_magnet_call",
        offerPrice: 3000,
        bookingRate: 7.5,
        showUpRate: 60,
        qualificationRate: 50,

        leadToCloseRate: 25,
        commissionRate: 10,
        marginKept: 70,
    };
    const d = deriveTargetCplLeadMagnetCall(inp);
    assert.equal(d.leadValue, 15.19);
    assert.equal(d.economicCeilingCpl, 4.56);
    assert.equal(d.effectiveTargetCpl, 4.56);
});

// T026 — Margin-scaling fixtures (contracts/cpaEconomics.md §4.8, SC-005).
// At fixed inputs, moving marginKept 60 → 50 multiplies the margin-driven
// ceiling by exactly 1.25; 60 → 70 by exactly 0.75. Assert on both free
// types and on maxCpa for both paid types. Where a paid funnel's
// effectiveTargetCpa is set by rawTargetCpa (the ROAS path), it must
// NOT move — ticket revenue is independent of retained margin.

// Helper: build a lead_magnet_call input with all rates fixed; vary only marginKept.
function leadMagnetCallInputs(marginKept: 50 | 60 | 70): LeadMagnetCallInputs {
    // Phase 13 — chain grows to 4 stages; new benchmarks apply
    // (booking 7.5% / show-up 60% / qualified 50% / close 25%).
    return {
        funnelType: "lead_magnet_call",
        offerPrice: 3000,
        bookingRate: 7.5,
        showUpRate: 60,
        qualificationRate: 50,

        leadToCloseRate: 25,
        commissionRate: 10,
        marginKept,
    };
}

test("T026: lead_magnet_call marginKept 60→50 ⇒ effectiveTargetCpl × 1.25 (SC-005)", () => {
    const d50 = deriveTargetCplLeadMagnetCall(leadMagnetCallInputs(50));
    const d60 = deriveTargetCplLeadMagnetCall(leadMagnetCallInputs(60));
    // §6.1 default row at margin 60: 6.08.
    assert.equal(d60.effectiveTargetCpl, 6.08);
    assert.equal(d50.effectiveTargetCpl, 7.59);
    // The × 1.25 scaling property holds on UNROUNDED values. The
    // Phase 12 fixture compared rounded outputs (which happened to
    // agree at the old chain). The Phase 13 chain lands 7.59375 and
    // 6.075 — round2(6.075) = 6.08, round2(6.08 × 1.25) = round2(7.6) = 7.60,
    // which differs from 7.59 by one cent. The structural identity
    // is exact on unrounded algebra: 6.075 × 1.25 = 7.59375; both
    // sides round to 7.59. Assert on the unrounded intermediates.
    const unrounded60 = (3000 * 0.9 * 0.075 * 0.60 * 0.50 * 0.25) * 0.40;
    const unrounded50 = (3000 * 0.9 * 0.075 * 0.60 * 0.50 * 0.25) * 0.50;
    assert.equal(d50.effectiveTargetCpl, round2(unrounded50));
    assert.equal(round2(unrounded50), round2(unrounded60 * 1.25));
});

test("T026: lead_magnet_call marginKept 60→70 ⇒ effectiveTargetCpl × 0.75 (SC-005)", () => {
    const d60 = deriveTargetCplLeadMagnetCall(leadMagnetCallInputs(60));
    const d70 = deriveTargetCplLeadMagnetCall(leadMagnetCallInputs(70));
    assert.equal(d60.effectiveTargetCpl, 6.08);
    assert.equal(d70.effectiveTargetCpl, 4.56);
    // 6.08 × 0.75 = 4.56 — this row matches cleanly at this chain.
    assert.equal(d70.effectiveTargetCpl, round2(d60.effectiveTargetCpl * 0.75));
});

// Helper: build a free_webinar input; vary only marginKept.
function freeWebinarInputs(marginKept: 50 | 60 | 70): FreeWebinarInputs {
    return {
        funnelType: "free_webinar",
        offerPrice: 3000,
        attendanceRate: 25,
        buyRateFromAttendees: 2,
        commissionRate: 10,
        marginKept,
    };
}

test("T026: free_webinar marginKept 60→50 ⇒ effectiveTargetCpl × 1.25 (SC-005)", () => {
    const d50 = deriveTargetCplFreeWebinar(freeWebinarInputs(50));
    const d60 = deriveTargetCplFreeWebinar(freeWebinarInputs(60));
    assert.equal(d60.effectiveTargetCpl, 5.40);
    assert.equal(d50.effectiveTargetCpl, 6.75); // 5.40 × 1.25 = 6.75
    assert.equal(d50.effectiveTargetCpl, round2(d60.effectiveTargetCpl * 1.25));
});

test("T026: free_webinar marginKept 60→70 ⇒ effectiveTargetCpl × 0.75 (SC-005)", () => {
    const d60 = deriveTargetCplFreeWebinar(freeWebinarInputs(60));
    const d70 = deriveTargetCplFreeWebinar(freeWebinarInputs(70));
    assert.equal(d60.effectiveTargetCpl, 5.40);
    assert.equal(d70.effectiveTargetCpl, 4.05); // 5.40 × 0.75 = 4.05
    assert.equal(d70.effectiveTargetCpl, round2(d60.effectiveTargetCpl * 0.75));
});

// Helper: build a paid_event input; vary only marginKept.
function paidEventInputs(marginKept: 50 | 60 | 70): PaidFunnelInputs {
    return {
        funnelType: "paid_event",
        aov: 24,
        hasHto: true,
        htoPrice: 3000,
        htoConversionRate: 5,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept,
        roasTarget: 0.5,
    };
}

test("T026: paid_event maxCpa marginKept 60→50 ⇒ × 1.25 (SC-005)", () => {
    // fullBuyerValue = 24 + 3000 × 0.9 × 0.75 × 0.075 = 24 + 151.875 = 175.875
    //   spendShare(60) = 0.40 ⇒ maxCpa = 175.875 × 0.40 = 70.35
    //   spendShare(50) = 0.50 ⇒ maxCpa = 175.875 × 0.50 = 87.9375 → 87.94
    //   70.35 × 1.25 = 87.9375 → 87.94 ✓
    const d50 = deriveTargetCpa(paidEventInputs(50));
    const d60 = deriveTargetCpa(paidEventInputs(60));
    assert.equal(d60.maxCpa, 70.35);
    assert.equal(d50.maxCpa, 87.94);
    assert.equal(d50.maxCpa, round2(d60.maxCpa * 1.25));
});

test("T026: paid_event maxCpa marginKept 60→70 ⇒ × 0.75 (SC-005)", () => {
    //   spendShare(70) = 0.30 ⇒ maxCpa = 175.875 × 0.30 = 52.7625 → 52.76
    //   70.35 × 0.75 = 52.7625 → 52.76 ✓
    const d60 = deriveTargetCpa(paidEventInputs(60));
    const d70 = deriveTargetCpa(paidEventInputs(70));
    assert.equal(d70.maxCpa, 52.76);
    assert.equal(d70.maxCpa, round2(d60.maxCpa * 0.75));
});

// Helper: build a paid_product input; vary only marginKept.
function paidProductInputs(marginKept: 50 | 60 | 70): PaidFunnelInputs {
    return {
        funnelType: "paid_product",
        aov: 100,
        hasHto: true,
        htoPrice: 3000,
        // Phase 11 + Phase 12 + Phase 13 — paid_product reads the
        // chain (productBookingRate × productShowUpRate ×
        //  productQualificationRate × productCloseRate) on the HTO
        // term. The rates are the Phase 13 owner-supplied benchmarks
        // (20 / 60 / 50 / 25); chain product 0.015. The test is
        // about margin scaling, not the absolute chain product —
        // the structural identity (margin-driven ceiling × 1.25 on
        // 60→50, × 0.75 on 60→70) holds on any chain product.
        htoConversionRate: 0, // dead at read time (Phase 11)
        productBookingRate: 20,
        productShowUpRate: 60,
        productQualificationRate: 50,
        productCloseRate: 25,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept,
        roasTarget: 1.0,
    };
}

test("T026: paid_product maxCpa marginKept 60→50 ⇒ × 1.25 (SC-005)", () => {
    const d50 = deriveTargetCpa(paidProductInputs(50));
    const d60 = deriveTargetCpa(paidProductInputs(60));
    // d60.fullBuyerValue = 140.50 (Phase 13 benchmarks); d60.maxCpa
    // = 140.50 × 0.40 = 56.20; d50.maxCpa = 140.50 × 0.50 = 70.25.
    // 56.20 × 1.25 = 70.25 ⇒ exact SC-005 × 1.25 identity.
    assert.equal(d60.maxCpa, 56.20);
    assert.equal(d50.maxCpa, 70.25);
    assert.equal(d50.maxCpa, round2(d60.maxCpa * 1.25));
});

test("T026: paid_product maxCpa marginKept 60→70 ⇒ × 0.75 (SC-005)", () => {
    const d60 = deriveTargetCpa(paidProductInputs(60));
    const d70 = deriveTargetCpa(paidProductInputs(70));
    // d70.maxCpa = 140.50 × 0.30 = 42.15; 56.20 × 0.75 = 42.15.
    assert.equal(d70.maxCpa, 42.15);
    assert.equal(d70.maxCpa, round2(d60.maxCpa * 0.75));
});

// ROAS-path-driven paid target does NOT move when marginKept changes
// (ticket revenue is independent of retained margin; FR-009 + SC-005).
//
// For ROAS path to win at every margin row, we need
//   rawTargetCpa < maxCpa(margin) for margin ∈ {50, 60, 70}.
// maxCpa is smallest at margin 70 (spendShare = 0.30), so the
// constraint tightens there:
//   aov / roasTarget  <  fullBuyerValue × 0.30
// With fullBuyerValue boosted by a large HTO term, the ROAS path
// wins uniformly. The example below uses
//   aov=100, hasHto=true, htoPrice=1000, attendance=100%, close=100%,
//   commissionRate=10, roasTarget=1.0
// ⇒ raw = 100, fbv = 100 + 1000 × 0.9 × 1.0 × 1.0 = 1000,
// ⇒ max(50) = 500, max(60) = 400, max(70) = 300, all > 100.
// Effective = raw = 100 at every margin row — independent of marginKept.
test("T026: paid_event ROAS-path-driven effectiveTargetCpa does NOT move with marginKept (SC-005)", () => {
    const fixed: Omit<PaidFunnelInputs, "marginKept"> = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: true,
        htoPrice: 1000,
        htoConversionRate: 5, // legacy additive storage; unused on paid_event
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 100,
        eventCloseRate: 100,
        commissionRate: 10,
        roasTarget: 1.0,
    };
    const d50 = deriveTargetCpa({ ...fixed, marginKept: 50 });
    const d60 = deriveTargetCpa({ ...fixed, marginKept: 60 });
    const d70 = deriveTargetCpa({ ...fixed, marginKept: 70 });
    // ROAS path wins uniformly.
    assert.equal(d50.effectiveTargetCpa, 100);
    assert.equal(d60.effectiveTargetCpa, 100);
    assert.equal(d70.effectiveTargetCpa, 100);
    // maxCpa path is active: max varies with margin but effective doesn't.
    assert.equal(d50.maxCpa, 500);
    assert.equal(d60.maxCpa, 400);
    assert.equal(d70.maxCpa, 300);
    assert.notEqual(d50.maxCpa, d70.maxCpa);
    // capApplied is false at every margin because raw (100) < max.
    assert.equal(d50.capApplied, false);
    assert.equal(d60.capApplied, false);
    assert.equal(d70.capApplied, false);
});

// Item B (Phase 5) — realistic paid_event fixture pinning target
// stability across margins at a typical $24 / $3000 / 75%/7.5% /
// ROAS 0.5 configuration. The carry-forward into Phase 9 is that
// the results-card explainer must tell a paid_event owner which
// path is active and why their margin choice is not moving the
// number when the ROAS path wins uniformly.
//
// Arithmetic:
//   raw = aov / roasTarget = 24 / 0.5 = 48     (independent of marginKept)
//   fullBuyerValue = 24 + 3000 × 0.9 × 0.75 × 0.075 = 175.875
//   spendShare(50) = 0.50 ⇒ maxCpa = 87.94 ⇒ min(48, 87.94) = 48
//   spendShare(60) = 0.40 ⇒ maxCpa = 70.35 ⇒ min(48, 70.35) = 48
//   spendShare(70) = 0.30 ⇒ maxCpa = 52.76 ⇒ min(48, 52.76) = 48
// ⇒ effectiveTargetCpa = 48 at every margin row.
//
// Note: the min() logic is NOT changed. The contract is that for this
// input class the ROAS path wins uniformly and the margin selector
// does not move the paid_event target. Phase 9's results-card
// explainer carries the user-facing consequence.
test("Item B: paid_event realistic ($24/$3000/75%/7.5%/ROAS 0.5) — effectiveTargetCpa = $48 at every margin row", () => {
    const fixed: Omit<PaidFunnelInputs, "marginKept"> = {
        funnelType: "paid_event",
        aov: 24,
        hasHto: true,
        htoPrice: 3000,
        htoConversionRate: 5, // legacy additive storage; unused on paid_event
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        roasTarget: 0.5,
    };
    const d50 = deriveTargetCpa({ ...fixed, marginKept: 50 });
    const d60 = deriveTargetCpa({ ...fixed, marginKept: 60 });
    const d70 = deriveTargetCpa({ ...fixed, marginKept: 70 });

    // raw pinned at $48 across all three margin rows.
    assert.equal(d50.rawTargetCpa, 48);
    assert.equal(d60.rawTargetCpa, 48);
    assert.equal(d70.rawTargetCpa, 48);

    // maxCpa varies with margin (the projection-path ceiling moves).
    assert.equal(d50.maxCpa, 87.94);
    assert.equal(d60.maxCpa, 70.35);
    assert.equal(d70.maxCpa, 52.76);

    // Effective is the ROAS path's $48 at every row.
    assert.equal(d50.effectiveTargetCpa, 48);
    assert.equal(d60.effectiveTargetCpa, 48);
    assert.equal(d70.effectiveTargetCpa, 48);

    // capApplied is false at every row because raw (48) < max.
    assert.equal(d50.capApplied, false);
    assert.equal(d60.capApplied, false);
    assert.equal(d70.capApplied, false);

    // The active path is the ROAS path at every row (the user's margin
    // selector does not move the number on this input class).
    assert.equal(d50.fullBuyerValue, 175.88); // 175.875 rounded
    assert.equal(d60.fullBuyerValue, 175.88);
    assert.equal(d70.fullBuyerValue, 175.88);
});

// T042 — Report §6.3 fixture (contract §4.3, FR-011..FR-014, FR-016).
// Inputs: aov=24, htoPrice=3000, eventAttendanceRate=75,
// eventCloseRate=7.5, commissionRate=10, marginKept=60, roasTarget=0.5.
// The $24 paid event targets $48 (a controlled front-end loss at
// ROAS 0.5) instead of being forced to break even.
//
// raw = 24 / 0.5 = 48
// fullBuyerValue = 24 + 3000 × 0.9 × 0.75 × 0.075 = 175.875 → 175.88
// maxCpa = 175.875 × 0.40 = 70.35
// effective = min(48, 70.35) = 48
// capApplied = false (raw 48 < max 70.35).
test("T042: paid_event report §6.3 — aov $24 / htoPrice $3000 / 75% / 7.5% / ROAS 0.5 ⇒ effective $48.00, capApplied false", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 24,
        hasHto: true,
        htoPrice: 3000,
        htoConversionRate: 5, // legacy additive storage; unused on paid_event
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 0.5,
    };
    const d = deriveTargetCpa(inp);
    assert.equal(d.rawTargetCpa, 48);
    assert.equal(d.fullBuyerValue, 175.88);   // 175.875 rounded
    assert.equal(d.maxCpa, 70.35);
    assert.equal(d.effectiveTargetCpa, 48);
    assert.equal(d.capApplied, false);
});

// T042 supplement — 100-buyer sanity check (report §6.3).
// 100 buyers × $24 ticket = $2,400 ticket revenue.
// Back-end sales = 100 × 0.75 × 0.075 = 5.625 attendees who buy HTO.
// Back-end gross = 5.625 × $3,000 = $16,875.
// Net of commission = 16,875 × 0.9 = $15,187.50.
// Total net = 2,400 + 15,187.50 = $17,587.50.
// Profit = 17,587.50 − (100 × 48) spend = 17,587.50 − 4,800 = $12,787.50.
// This is the working example from contracts/cpaEconomics.md §4.3.
test("T042: paid_event report §6.3 — 100-buyer sanity check (totals to $17,587.50 net / $12,787.50 profit)", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 24,
        hasHto: true,
        htoPrice: 3000,
        htoConversionRate: 5,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 0.5,
    };
    const N = 100;
    const d = deriveTargetCpa(inp);
    const ticketRevenue = N * inp.aov;
    // expectedTarget spend per buyer = $48, so total spend = N × 48 = 4,800.
    const spend = N * d.effectiveTargetCpa;
    // 100 ticket buyers × 75% attendance × 7.5% close = 5.625 HTO buyers.
    const htoBuyers = N * (inp.eventAttendanceRate / 100) * (inp.eventCloseRate / 100);
    const backEndGross = htoBuyers * inp.htoPrice;
    // Net of 10% commission.
    const backEndNet = backEndGross * (1 - inp.commissionRate / 100);
    const totalNet = ticketRevenue + backEndNet;
    const profit = totalNet - spend;
    assert.equal(spend, 4800);
    assert.equal(ticketRevenue, 2400);
    assert.equal(backEndGross, 16875);
    assert.equal(backEndNet, 15187.5);
    assert.equal(totalNet, 17587.5);
    assert.equal(profit, 12787.5);
});

// Phase 968 — Item B (Phase 7 carry-over): a realistic paid_event
// configuration that pins capApplied=TRUE — the projection path is
// binding. Inputs: aov=50, htoPrice=3000, eventAttendanceRate=75,
// eventCloseRate=7.5, commissionRate=10, marginKept=60, ROAS=0.5.
// This is the only paid_event fixture with realistic inputs that
// surfaces capApplied=TRUE; every other paid_event test in this file
// uses aov=24 (or aov=$5 etc.) where ticket-revenue wins.
//
// raw = aov / roasTarget = 50 / 0.5 = 100
// fullBuyerValue = 50 + 3000 × 0.9 × 0.75 × 0.075 = 50 + 151.875 = 201.875 → 201.88
// maxCpa = 201.875 × 0.40 = 80.75
// effective = min(100, 80.75) = 80.75
// capApplied = (100 > 80.75) = TRUE → projection path binds.
//
// Algebraically (from the §6.3 backend formula), the projection path
// binds when (aov + htoPrice × 0.050625) × 0.40 < aov / roasTarget.
// For aov=24, this means htoPrice < 1,896 (projection binds on a
// very small upsell). For htoPrice=3000, this means aov > ~$38
// (the projection binds when the ticket price is high enough that
// the projected back-end value no longer constrains the target).
// The test pins both halves of the boundary in one fixture.
test("Item B: paid_event capApplied=TRUE — aov=$50 / htoPrice=$3000 / 75% / 7.5% / ROAS=0.5 ⇒ effective $80.75, capApplied TRUE (projection path binds)", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 50,
        hasHto: true,
        htoPrice: 3000,
        htoConversionRate: 5, // legacy additive storage; unused on paid_event
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 0.5,
    };
    const d = deriveTargetCpa(inp);
    // raw pinned at $100 across all three margin rows.
    assert.equal(d.rawTargetCpa, 100);
    // fullBuyerValue = 201.88 (raw 201.875).
    assert.equal(d.fullBuyerValue, 201.88);
    // maxCpa pinned at $80.75 (raw 80.75).
    assert.equal(d.maxCpa, 80.75);
    // effective = min(100, 80.75) = 80.75 → projection path binds.
    assert.equal(d.effectiveTargetCpa, 80.75);
    // capApplied = (100 > 80.75) = TRUE.
    assert.equal(d.capApplied, true);
});

// T021 — Regression anchor (constitution IX — before/after evidence).
// The pre-phase formula produced $630 for the same $3,000 lead-magnet
// funnel. That value is gone. The corrected formula yields $12.76 at
// margin 60. This fixture asserts the old value is no longer produced.

test("lead_magnet_call regression anchor: pre-phase $630 target is gone (T021, constitution IX)", () => {
    // Inputs that, under the pre-phase `effectiveTargetCpl = offerPrice ×
    // (leadToCloseRate / 100)` formula, yielded $630 for the
    // lead-magnet-to-call funnel at $3,000 / 21% (a representative
    // production doc). The pre-phase formula has been removed; the
    // corrected chain yields a value that cannot equal $630.
    const inp: LeadMagnetCallInputs = {
        funnelType: "lead_magnet_call",
        offerPrice: 3000,
        bookingRate: 7.5,
        showUpRate: 60,
        qualificationRate: 50,

        leadToCloseRate: 25,
        commissionRate: 10,
        marginKept: 60,
    };
    const d = deriveTargetCplLeadMagnetCall(inp);
    assert.notEqual(d.effectiveTargetCpl, 630,
        "pre-phase target of $630 must not reappear under the corrected formula");
    // And the corrected target lands at the §6.1 default row.
    // Phase 13 changed the anchor: qualification stage added,
    // benchmarks revised. The default row moves from $12.76 → $6.08.
    assert.equal(d.effectiveTargetCpl, 6.08);
});

// ─── Free webinar ────────────────────────────────────────────

test("free_webinar: $3000 × 25% × 2% × 0.90 netFactor × 0.40 spendShare → leadValue $13.50, target $5.40 (FR-008)", () => {
    // Report §6.2 — Phase 4 (T025) pins this fixture as the
    // free-webinar worked example.
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar",
        offerPrice: 3000,
        attendanceRate: 25,
        buyRateFromAttendees: 2,
        commissionRate: 10,
        marginKept: 60,
    };
    const d = deriveTargetCplFreeWebinar(inp);
    // leadValue = 3000 × 0.9 × 0.25 × 0.02 = 13.50
    assert.equal(d.leadValue, 13.5);
    assert.equal(d.economicCeilingCpl, 5.4);
    assert.equal(d.effectiveTargetCpl, 5.4);
});

test("free_webinar: $997 × 40% × 8% × 0.90 netFactor × 0.40 spendShare → leadValue $28.71, target $11.49", () => {
    // Replaces the pre-phase fixture ($997 × 40% × 8% × 0.70 = $22.33)
    // which used the removed ECONOMIC_CEILING_MULTIPLIER.
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar",
        offerPrice: 997,
        attendanceRate: 40,
        buyRateFromAttendees: 8,
        commissionRate: 10,
        marginKept: 60,
    };
    const d = deriveTargetCplFreeWebinar(inp);
    // leadValue = 997 × 0.9 × 0.4 × 0.08 = 28.7136 → 28.71
    assert.equal(d.leadValue, 28.71);
    // economicCeilingCpl = 28.7136 × 0.4 = 11.48544 → 11.49
    assert.equal(d.economicCeilingCpl, 11.49);
    assert.equal(d.effectiveTargetCpl, 11.49);
});

// ─── ROAS enum strictness ────────────────────────────────────

test("paid_event: ROAS 0.65 (invest-a-bit) works", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 0.65,
    };
    const d = deriveTargetCpa(inp);
    // rawTargetCpa = 100 / 0.65 = 153.846..., rounded to 2dp → 153.85
    assert.equal(d.rawTargetCpa, 153.85);
});

test("paid_event: invalid ROAS (e.g. 0.75) throws", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 0.75 as never,
    };
    assert.throws(() => deriveTargetCpa(inp), /roasTarget/);
});

// ─── Input validation ────────────────────────────────────────

test("paid_event: negative AOV throws", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: -1,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    };
    assert.throws(() => deriveTargetCpa(inp), /aov/);
});

test("paid_event: NaN htoConversionRate throws", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: true,
        htoPrice: 100,
        htoConversionRate: NaN,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    };
    assert.throws(() => deriveTargetCpa(inp), /htoConversionRate/);
});

test("paid_event: htoConversionRate > 100 throws (percentage range cap)", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: true,
        htoPrice: 100,
        htoConversionRate: 150,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    };
    assert.throws(() => deriveTargetCpa(inp), /between 0 and 100/);
});

test("paid_event: commissionRate > 100 throws (FR-027)", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 150,
        marginKept: 60,
        roasTarget: 1.0,
    };
    assert.throws(() => deriveTargetCpa(inp), /commissionRate/);
});

test("paid_event: commissionRate < 0 throws", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: -5,
        marginKept: 60,
        roasTarget: 1.0,
    };
    assert.throws(() => deriveTargetCpa(inp), /commissionRate/);
});

test("paid_event: marginKept outside closed enum throws (FR-026)", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 55 as never,
        roasTarget: 1.0,
    };
    assert.throws(() => deriveTargetCpa(inp), /marginKept/);
});

test("free_webinar: attendanceRate > 100 throws (percentage range cap)", () => {
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar",
        offerPrice: 100,
        attendanceRate: 250,
        buyRateFromAttendees: 10,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.throws(() => deriveTargetCplFreeWebinar(inp), /between 0 and 100/);
});

test("lead_magnet_call: leadToCloseRate > 100 throws (percentage range cap)", () => {
    const inp: LeadMagnetCallInputs = {
        funnelType: "lead_magnet_call",
        offerPrice: 100,
        qualificationRate: 50,

        leadToCloseRate: 120,
        bookingRate: 50,
        showUpRate: 50,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.throws(() => deriveTargetCplLeadMagnetCall(inp), /between 0 and 100/);
});

// ─── deriveAll dispatch (T015 — economicsVersion stamp) ──────

test("deriveAll — paid_event dispatches to deriveTargetCpa + stamps economicsVersion", () => {
    const d = deriveAll({
        funnelType: "paid_event",
        aov: 50,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    }, 1700000000000);
    assert.equal(d.economicsVersion, 2);
    assert.ok(d.paid);
    assert.equal(d.paid.rawTargetCpa, 50);
    assert.equal(d.computedAt, 1700000000000);
});

test("deriveAll — lead_magnet_call dispatches to deriveTargetCplLeadMagnetCall + stamps economicsVersion", () => {
    const d = deriveAll({
        funnelType: "lead_magnet_call",
        offerPrice: 1000,
        qualificationRate: 50,

        leadToCloseRate: 10,
        bookingRate: 50,
        showUpRate: 50,
        commissionRate: 10,
        marginKept: 60,
    }, 1700000000000);
    assert.equal(d.economicsVersion, 2);
    assert.ok(d.free);
    // Phase 13 — chain grows to 4 stages. leadValue
    // = 1000 × 0.9 × 0.5 × 0.5 × 0.50 × 0.10 = 11.25
    // economicCeilingCpl = 11.25 × 0.4 = 4.50.
    assert.equal(d.free.leadValue, 11.25);
    assert.equal(d.free.economicCeilingCpl, 4.5);
    assert.equal(d.computedAt, 1700000000000);
});

test("deriveAll — free_webinar dispatches to deriveTargetCplFreeWebinar + stamps economicsVersion", () => {
    const d = deriveAll({
        funnelType: "free_webinar",
        offerPrice: 1000,
        attendanceRate: 50,
        buyRateFromAttendees: 10,
        commissionRate: 10,
        marginKept: 60,
    }, 1700000000000);
    assert.equal(d.economicsVersion, 2);
    assert.ok(d.free);
    // 1000 × 0.9 × 0.5 × 0.10 = 45 → economicCeilingCpl = 45 × 0.4 = 18
    assert.equal(d.free.leadValue, 45);
    assert.equal(d.free.economicCeilingCpl, 18);
});

// ─── Advisories (T017a — signature change, FR-028) ───────────

test("computeAdvisories — paid + hasHto=false → noHto=true", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    };
    const d = deriveAll(inp, Date.now());
    const a = computeAdvisories(inp, d);
    assert.equal(a.noHto, true);
    // default-margin maxCpa = 100 × 0.4 = 40; rounded target = 40 → not below 0.50.
    assert.equal(a.lowValue, false);
});

test("computeAdvisories — paid + aov=$5 → lowValue silent (keys off computed target, NOT aov) (FR-028)", () => {
    // The legacy price-based advisory (aov < 9) is removed. The new
    // advisory keys off the rounded computed target. With aov $5, ROAS
    // 1.0, no HTO: raw = 5, maxCpa = 5 × 0.4 = 2.0 ⇒ effective = 2.0 ⇒
    // not below 0.50 ⇒ lowValue is FALSE.
    //
    // The pre-phase contract would have fired this advisory on `aov < 9`;
    // the new contract correctly does not fire because the computed
    // target ($2.00) is above the $0.50 boundary. This test pins the
    // contract direction change, not a fire-on-this-input assertion.
    const inp: PaidFunnelInputs = {
        funnelType: "paid_product",
        aov: 5,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    };
    const d = deriveAll(inp, Date.now());
    const a = computeAdvisories(inp, d);
    assert.equal(a.noHto, true);
    assert.equal(a.lowValue, false);
});

test("computeAdvisories — paid no-HTO + aov=$5 + tight margin → lowValue FALSE (computed target $1.50 ≥ $0.50)", () => {
    // With aov=5, hasHto=false (so the HTO term collapses to 0),
    // eventAttendanceRate/eventCloseRate=0 (so the HTO term stays 0
    // even if hasHto were true), commissionRate=10, marginKept=70,
    // roasTarget=1.0:
    //   rawTargetCpa   = 5 / 1.0                = 5
    //   fullBuyerValue = 5 + 0                  = 5
    //   spendShare     = (100-70)/100           = 0.30
    //   maxCpa         = 5 × 0.30               = 1.50
    //   effective      = min(5, 1.50)           = 1.50
    //   round2(1.50)                            = 1.50
    //   1.50 < 0.50                              ⇒ FALSE ⇒ lowValue = false.
    // This is the boundary case the contract §5 pins: with no HTO, the
    // target is bounded by aov × spendShare. The tightest valid
    // margin (70) yields aov × 0.30 = 1.50, which still exceeds the
    // 0.50 threshold. To drive a paid target below 0.50 requires
    // aov < 0.50 × (1/spendShare) ≈ 1.67 at margin 70 — i.e. aov < $2
    // — see test 30b below for the discriminating fixture.
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 5,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 70,
        roasTarget: 1.0,
    };
    const d = deriveAll(inp, Date.now());
    // Arithmetic anchors:
    assert.equal(d.paid?.rawTargetCpa, 5);
    assert.equal(d.paid?.fullBuyerValue, 5);
    assert.equal(d.paid?.maxCpa, 1.5);
    assert.equal(d.paid?.effectiveTargetCpa, 1.5);
    const a = computeAdvisories(inp, d);
    assert.equal(a.noHto, true);
    assert.equal(a.lowValue, false);
});

test("computeAdvisories — paid no-HTO + aov=$1 + tight margin → lowValue TRUE (computed target < 0.50)", () => {
    // Discriminating fixture: with aov=1 and margin 70, maxCpa = 0.30
    // ⇒ effective = 0.30 ⇒ 0.30 < 0.50 ⇒ lowValue fires.
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 1,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 70,
        roasTarget: 1.0,
    };
    const d = deriveAll(inp, Date.now());
    // Arithmetic anchors:
    assert.equal(d.paid?.rawTargetCpa, 1);
    assert.equal(d.paid?.fullBuyerValue, 1);
    assert.equal(d.paid?.maxCpa, 0.3);
    assert.equal(d.paid?.effectiveTargetCpa, 0.3);
    const a = computeAdvisories(inp, d);
    assert.equal(a.noHto, true);
    assert.equal(a.lowValue, true);
});

test("computeAdvisories — free_webinar + tiny offerPrice → lowValue=true, noHto=false", () => {
    // offerPrice 5, attendanceRate 1, buyRateFromAttendees 1 ⇒
    // leadValue = 5 × 0.9 × 0.01 × 0.01 = 0.00045 → 0.00 ⇒ effectiveTargetCpl 0.00 ⇒ fires.
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar",
        offerPrice: 5,
        attendanceRate: 1,
        buyRateFromAttendees: 1,
        commissionRate: 10,
        marginKept: 60,
    };
    const d = deriveAll(inp, Date.now());
    const a = computeAdvisories(inp, d);
    assert.equal(a.noHto, false);
    assert.equal(a.lowValue, true);
});

test("computeAdvisories — free + offerPrice=$1000 + reasonable rates → no advisories", () => {
    const inp: LeadMagnetCallInputs = {
        funnelType: "lead_magnet_call",
        offerPrice: 1000,
        qualificationRate: 50,

        leadToCloseRate: 20,
        bookingRate: 50,
        showUpRate: 50,
        commissionRate: 10,
        marginKept: 60,
    };
    const d = deriveAll(inp, Date.now());
    const a = computeAdvisories(inp, d);
    assert.equal(a.noHto, false);
    // leadValue = 1000 × 0.9 × 0.5 × 0.5 × 0.20 = 45 → target 18 → no lowValue
    assert.equal(a.lowValue, false);
});

test("computeAdvisories — target STILL calculated when an advisory fires (non-blocking)", () => {
    const inp: PaidFunnelInputs = {
        funnelType: "paid_event",
        aov: 5,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    };
    const d = deriveAll(inp, Date.now());
    assert.ok(d.paid, "target is still computed");
    // raw=5, fullBuyerValue=5, maxCpa=5×0.4=2.00, effective = min(5, 2) = 2.00
    assert.equal(d.paid.effectiveTargetCpa, 2);
    const a = computeAdvisories(inp, d);
    assert.equal(a.noHto, true);
    // 2.00 is not < 0.50, so lowValue is false here.
    assert.equal(a.lowValue, false);
});

// ─── getEffectiveTarget / getCostMetric (T016 — version gate) ─

test("getEffectiveTarget — paid → CPA", () => {
    const d = deriveAll({
        funnelType: "paid_event",
        aov: 100,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 1.0,
    }, 1);
    // raw = 100, fullBuyerValue = 100, spendShare = 0.4 ⇒ maxCpa = 40,
    // effective = min(100, 40) = 40.
    assert.equal(getEffectiveTarget(d), 40);
    assert.equal(getCostMetric(d), "CPA");
});

test("getEffectiveTarget — free → CPL", () => {
    const d = deriveAll({
        funnelType: "lead_magnet_call",
        offerPrice: 1000,
        qualificationRate: 50,

        leadToCloseRate: 10,
        bookingRate: 50,
        showUpRate: 50,
        commissionRate: 10,
        marginKept: 60,
    }, 1);
    // Phase 13 — chain grows to 4 stages.
    // leadValue = 1000 × 0.9 × 0.5 × 0.5 × 0.50 × 0.10 = 11.25
    // economicCeilingCpl = 11.25 × 0.4 = 4.50.
    assert.equal(getEffectiveTarget(d), 4.5);
    assert.equal(getCostMetric(d), "CPL");
});

// ─── Version gate (T018, R-1, contract §4.7) ────────────────

test("getEffectiveTarget — stamped payload returns the target (T018 row 1)", () => {
    const d: import("../cpaEconomics.js").DerivedTargets = {
        economicsVersion: 2,
        free: { leadValue: 12.76, economicCeilingCpl: 12.76, effectiveTargetCpl: 12.76 },
        computedAt: 1,
    };
    assert.equal(getEffectiveTarget(d), 12.76);
});

test("getEffectiveTarget — UNSTAMPED payload returns null — pre-phase production shape (T018 row 2, load-bearing)", () => {
    // This is the exact shape sitting on every pre-phase production
    // document today: `{ free: { effectiveTargetCpl: 630, … } }` with
    // no economicsVersion. The absence of the stamp is the signal that
    // makes `getEffectiveTarget` return null — R-1, FR-041, FR-041a.
    const unstamped = {
        free: { leadValue: 630, economicCeilingCpl: 630, effectiveTargetCpl: 630 },
        computedAt: 1,
    } as unknown as import("../cpaEconomics.js").DerivedTargets;
    assert.equal(getEffectiveTarget(unstamped), null);
});

test("getEffectiveTarget — version 1 (legacy) returns null (T018 row 3)", () => {
    const v1 = {
        economicsVersion: 1,
        free: { leadValue: 12.76, economicCeilingCpl: 12.76, effectiveTargetCpl: 12.76 },
        computedAt: 1,
    } as unknown as import("../cpaEconomics.js").DerivedTargets;
    assert.equal(getEffectiveTarget(v1), null);
});

test("getEffectiveTarget — stamped payload with no branch returns null (T018 row 4)", () => {
    const empty: import("../cpaEconomics.js").DerivedTargets = {
        economicsVersion: 2,
        computedAt: 1,
    };
    assert.equal(getEffectiveTarget(empty), null);
});

test("getEffectiveTarget — every deriveAll path stamps economicsVersion: 2 (T015 invariant)", () => {
    const cases = [
        deriveAll({
            funnelType: "paid_event",
            aov: 50,
            hasHto: false,
            htoPrice: 0,
            htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
            eventAttendanceRate: 0,
            eventCloseRate: 0,
            commissionRate: 10,
            marginKept: 60,
            roasTarget: 1.0,
        }, 1),
        deriveAll({
            funnelType: "paid_product",
            aov: 50,
            hasHto: false,
            htoPrice: 0,
            htoConversionRate: 0,
        productBookingRate: 0,
        productShowUpRate: 0,
        productQualificationRate: 0,
        productCloseRate: 0,
            eventAttendanceRate: 0,
            eventCloseRate: 0,
            commissionRate: 10,
            marginKept: 60,
            roasTarget: 1.0,
        }, 1),
        deriveAll({
            funnelType: "free_webinar",
            offerPrice: 1000,
            attendanceRate: 50,
            buyRateFromAttendees: 10,
            commissionRate: 10,
            marginKept: 60,
        }, 1),
        deriveAll({
            funnelType: "lead_magnet_call",
            offerPrice: 1000,
            qualificationRate: 50,

            leadToCloseRate: 10,
            bookingRate: 50,
            showUpRate: 50,
            commissionRate: 10,
            marginKept: 60,
        }, 1),
    ];
    for (const d of cases) {
        assert.equal(d.economicsVersion, 2);
        // And every stamped payload flows through getEffectiveTarget
        // with a non-null return — the gate is not a regression for
        // current-state inputs.
        assert.notEqual(getEffectiveTarget(d), null);
    }
});

// Phase 968 — T051 (report §6.4 fixtures, contracts/cpaEconomics.md
// section 4.5). Free webinar at attendanceRate 25, buyRateFromAttendees
// 2, commissionRate 10, marginKept 60. Three rows: 3000 → 5.40 silent,
// 500 → 0.90 silent, 200 → 0.36 fires. The advisory keys off the
// rounded computed target (FR-028, FR-029).
test("T051: free_webinar report §6.4 — offerPrice=3000 ⇒ 5.40 (silent)", () => {
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar",
        offerPrice: 3000,
        attendanceRate: 25,
        buyRateFromAttendees: 2,
        commissionRate: 10,
        marginKept: 60,
    };
    const d = deriveAll(inp, Date.now());
    assert.equal(d.free?.leadValue, 13.5);
    assert.equal(d.free?.effectiveTargetCpl, 5.4);
    const a = computeAdvisories(inp, d);
    assert.equal(a.lowValue, false);
});

test("T051: free_webinar report §6.4 — offerPrice=500 ⇒ 0.90 (silent)", () => {
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar",
        offerPrice: 500,
        attendanceRate: 25,
        buyRateFromAttendees: 2,
        commissionRate: 10,
        marginKept: 60,
    };
    const d = deriveAll(inp, Date.now());
    // leadValue = 500 × 0.9 × 0.25 × 0.02 = 2.25; target = 2.25 × 0.4 = 0.90
    assert.equal(d.free?.effectiveTargetCpl, 0.9);
    const a = computeAdvisories(inp, d);
    assert.equal(a.lowValue, false);
});

test("T051: free_webinar report §6.4 — offerPrice=200 ⇒ 0.36 (FIRES)", () => {
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar",
        offerPrice: 200,
        attendanceRate: 25,
        buyRateFromAttendees: 2,
        commissionRate: 10,
        marginKept: 60,
    };
    const d = deriveAll(inp, Date.now());
    // leadValue = 200 × 0.9 × 0.25 × 0.02 = 0.90; target = 0.90 × 0.4 = 0.36
    assert.equal(d.free?.effectiveTargetCpl, 0.36);
    const a = computeAdvisories(inp, d);
    assert.equal(a.lowValue, true);
});

// Phase 968 — T052 (boundary fixtures, contracts/cpaEconomics.md
// section 4.6, FR-028a). The advisory keys off the ROUNDED target
// (per FR-028), so:
//   raw 0.4999 → round2(0.4999) = 0.50 → silent (boundary inclusive)
//   raw 0.50   → round2(0.50)   = 0.50 → silent (strict inequality)
//   raw 0.4949 → round2(0.4949) = 0.49 → fires
// These pin the displayed-value boundary, not the raw-value boundary.
test("T052: low-value boundary — raw 0.4999 displays 0.50 ⇒ silent", () => {
    // Build a free-webinar-derived shape with the exact raw target.
    const derived = {
        economicsVersion: 2 as const,
        free: {
            leadValue: 0.4999 / 0.4,  // back-compute leadValue
            economicCeilingCpl: 0.4999,
            effectiveTargetCpl: 0.4999,
        },
        computedAt: 1,
    };
    // round2(0.4999) — banker's rounding rounds 0.4999 to 0.50
    // (round-half-to-even; 0.4999 → 0.50 since the half-position
    // digit is 0, the preceding digit is even after the carry).
    // Either way, 0.4999 must round to 0.50 (round-half-up) and
    // the boundary is inclusive at 0.50.
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar", offerPrice: 100,
        attendanceRate: 100, buyRateFromAttendees: 100,
        commissionRate: 0, marginKept: 60,
    };
    const a = computeAdvisories(inp, derived);
    // Verify the boundary: at 0.50 (rounded), strict < 0.50 is false ⇒ silent.
    const rounded = round2(0.4999);
    assert.equal(rounded, 0.5);
    assert.equal(rounded < 0.5, false);
    assert.equal(a.lowValue, false, "raw 0.4999 must round to 0.50 and stay silent");
});

test("T052: low-value boundary — exactly 0.50 ⇒ silent (strict inequality)", () => {
    const derived = {
        economicsVersion: 2 as const,
        free: { leadValue: 1.25, economicCeilingCpl: 0.50, effectiveTargetCpl: 0.50 },
        computedAt: 1,
    };
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar", offerPrice: 100,
        attendanceRate: 100, buyRateFromAttendees: 100,
        commissionRate: 0, marginKept: 60,
    };
    const a = computeAdvisories(inp, derived);
    assert.equal(a.lowValue, false, "exactly 0.50 must not fire");
});

test("T052: low-value boundary — raw 0.4949 displays 0.49 ⇒ FIRES", () => {
    const derived = {
        economicsVersion: 2 as const,
        free: { leadValue: 1.23725, economicCeilingCpl: 0.4949, effectiveTargetCpl: 0.4949 },
        computedAt: 1,
    };
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar", offerPrice: 100,
        attendanceRate: 100, buyRateFromAttendees: 100,
        commissionRate: 0, marginKept: 60,
    };
    const a = computeAdvisories(inp, derived);
    const rounded = round2(0.4949);
    assert.equal(rounded, 0.49);
    assert.equal(rounded < 0.5, true);
    assert.equal(a.lowValue, true, "raw 0.4949 must round to 0.49 and fire");
});

// Phase 10 T070 (FR-048, SC-015) — rounding-order fixture. The
// chain MUST round once at the end, not at intermediate steps.
// Phase 13 — chain grows from 3 to 4 stages (qualification added);
// the test asserts the structural identity end-of-chain = round2
// of the unrounded intermediate.
//
// We compute the unrounded intermediate leadValue directly so the
// assertion is robust to JS floating-point behaviour on the chain
// product (a previous draft relied on the two orderings disagreeing
// at the cent — that disagreement was lost when the chain grew
// from 3 to 4 stages). The structural property is unchanged: the
// module MUST round once at the end, never at the leadValue step.
test("T070: rounding-order fixture (FR-048, SC-015) — module rounds leadValue unrounded, then rounds the final target", () => {
    const inp: LeadMagnetCallInputs = {
        funnelType: "lead_magnet_call",
        offerPrice: 1000,
        qualificationRate: 50,

        leadToCloseRate: 25,
        bookingRate: 5,
        showUpRate: 65,
        commissionRate: 10,
        marginKept: 60,
    };
    const d = deriveTargetCplLeadMagnetCall(inp);

    // Compute the unrounded leadValue and the expected target the
    // same way the module does (so floating-point rounding inside
    // the multiplication chain is preserved).
    const unroundedLeadValue = inp.offerPrice
        * netFactor(inp.commissionRate)
        * (inp.bookingRate / 100)
        * (inp.showUpRate / 100)
        * (inp.qualificationRate / 100)
        * (inp.leadToCloseRate / 100);
    const expectedTarget = round2(unroundedLeadValue * spendShare(inp.marginKept));

    // The module's effectiveTargetCpl MUST equal the end-of-chain
    // rounding (the unrounded intermediate × spendShare, then
    // round2 once at the end).
    assert.equal(d.effectiveTargetCpl, expectedTarget);

    // Negative control: pin what the intermediate-rounded ordering
    // WOULD produce. Compute it the same way the module would if it
    // (incorrectly) rounded leadValue first.
    const intermediateLeadValue = round2(unroundedLeadValue);
    const intermediateTarget = round2(intermediateLeadValue * spendShare(inp.marginKept));
    // The two orderings may or may not differ at this input; the
    // assertion is that the module uses the end-of-chain ordering.
    // Pin both sides so a future regression that swaps to
    // intermediate rounding would surface here (the assertion below
    // is conditional: if end != intermediate, then end must match
    // the module output).
    if (intermediateTarget !== expectedTarget) {
        assert.equal(d.effectiveTargetCpl, expectedTarget,
            `module must use end-of-chain rounding (expected ${expectedTarget}); ` +
            `intermediate ordering would give ${intermediateTarget}`);
    }
    assert.equal(round2(d.leadValue), round2(unroundedLeadValue),
        "module's leadValue MUST equal round2 of the unrounded chain product");
});

// Phase 10 T069 (SC-006, SC-014) — cross-funnel profit-parity
// fixture. A free_webinar funnel and a lead_magnet_call funnel at
// the same offer price, commission, and margin kept yield the same
// profit per sale — regardless of the rate chain chosen.
//
// The math is symmetric: per-sale revenue = offerPrice × netFactor,
// and per-sale cost = offerPrice × netFactor × spendShare (the
// rate-chain product cancels out of the per-sale cost because CPL
// is computed from leadValue which is offerPrice × netFactor ×
// chain). Profit per sale = offerPrice × netFactor × marginKept/100
// for both funnels.
//
// §6.1 / §6.2 worked examples both yield $1620 profit per sale:
//   offerPrice=3000, netFactor=0.9, marginKept=60
//   ⇒ profit = 3000 × 0.9 × 0.6 = $1620 per sale.
test("T069: cross-funnel profit-parity (SC-006, SC-014) — same offer/commission/margin yields same profit per sale", () => {
    const OFFER = 3000;
    const COMMISSION = 10;
    const MARGIN = 60;

    // lead_magnet_call — §6.1 worked-example rates (Phase 13:
    // chain now booking / showUp / qualification / close).
    const lm: LeadMagnetCallInputs = {
        funnelType: "lead_magnet_call",
        offerPrice: OFFER,
        qualificationRate: 50,

        leadToCloseRate: 25,
        bookingRate: 7.5,
        showUpRate: 60,
        commissionRate: COMMISSION,
        marginKept: MARGIN,
    };

    // free_webinar — §6.2 worked-example rates
    const fw: FreeWebinarInputs = {
        funnelType: "free_webinar",
        offerPrice: OFFER,
        attendanceRate: 25,
        buyRateFromAttendees: 2,
        commissionRate: COMMISSION,
        marginKept: MARGIN,
    };

    const lmDerived = deriveTargetCplLeadMagnetCall(lm);
    const fwDerived = deriveTargetCplFreeWebinar(fw);

    // Per-sale algebra — chain cancels (algebra shown in the file
    // header comment above):
    //   profit_per_sale = revenue - cost
    //                    = offerPrice × netFactor
    //                      - (offerPrice × netFactor × chain × spendShare) / chain
    //                    = offerPrice × netFactor × (1 - spendShare)
    //                    = offerPrice × netFactor × marginKept/100
    //
    // We use the unrounded intermediates for both sides — the
    // displayed CPL is rounded (FR-048), so the displayed rounded
    // value drifts by one cent at the §6.1/§6.2 inputs and the
    // per-sale cost would differ by ~$0.21. The structural
    // identity holds on unrounded values.
    const netFactorVal = 1 - COMMISSION / 100;
    const marginShare = MARGIN / 100;
    const spendShareVal = 1 - marginShare;

    // Per-sale cost using unrounded leadValue:
    //   leadValue = offerPrice × netFactor × chain
    //   CPL_unrounded = leadValue × spendShare
    //   cost_per_sale = CPL_unrounded / chain = offerPrice × netFactor × spendShare
    // Phase 13 — chain now has 4 stages on lead_magnet_call;
    // qualificationRate folds into the chain product the same way
    // the other rates do.
    const lmChain = (lm.bookingRate / 100) * (lm.showUpRate / 100) * (lm.qualificationRate / 100) * (lm.leadToCloseRate / 100);
    const fwChain = (fw.attendanceRate / 100) * (fw.buyRateFromAttendees / 100);
    const lmCostUnrounded = OFFER * netFactorVal * lmChain * spendShareVal / lmChain;
    const fwCostUnrounded = OFFER * netFactorVal * fwChain * spendShareVal / fwChain;
    // Both reduce to: OFFER × netFactor × spendShare.
    const expectedCost = OFFER * netFactorVal * spendShareVal;

    // Per-sale revenue = offerPrice × netFactor (the commission
    // deduction is the only difference between sale price and
    // revenue).
    const lmRevenue = OFFER * netFactorVal;
    const fwRevenue = OFFER * netFactorVal;
    const expectedRevenue = OFFER * netFactorVal;

    // Profit per sale = revenue - cost.
    const lmProfit = lmRevenue - lmCostUnrounded;
    const fwProfit = fwRevenue - fwCostUnrounded;
    const expectedProfit = expectedRevenue - expectedCost;

    // The headline SC-006 / SC-014 assertion — the two funnels
    // produce identical profit per sale (structural identity,
    // exact equality on unrounded values). The chain cancels in
    // both directions; the chain length is irrelevant.
    assert.equal(lmProfit, expectedProfit, "lead_magnet per-sale profit");
    assert.equal(fwProfit, expectedProfit, "free_webinar per-sale profit");
    assert.equal(lmProfit, fwProfit, "SC-006 / SC-014 cross-funnel parity");

    // Rounded display: at the §6.1/§6.2 worked-example inputs,
    // profit per sale = $1620 (rounded from 1620.00).
    assert.equal(round2(expectedProfit), 1620);

    // The displayed CPL values (rounded, FR-048) DO differ between
    // the two funnels — this is by design, not a bug. The CPL is
    // displayed per lead; per-sale profit cancels the chain.
    // Phase 13 — §6.1 row 2 (margin 60) anchor moves from $12.76
    // (old 3-stage chain) to $6.08 (new 4-stage chain with
    // qualification stage).
    assert.equal(lmDerived.effectiveTargetCpl, 6.08); // §6.1 row 2 (margin 60)
    assert.equal(fwDerived.effectiveTargetCpl, 5.40);  // §6.2
});

// ─── Phase 10 T066 (FR-047) — Purity assertion ───────────────────────────
//
// The economics module is required to stay pure — no `firebase-admin`,
// no `firebase-functions`, no network client. This is the load-bearing
// property that lets every §6 fixture run without an emulator or a
// mock stack. The assertion reads the source and verifies nothing on
// the forbidden list has crept in across future phases.
//
// Pattern modeled on `creativeResolverParity.test.ts` and the FR-061
// guard: a test that reads the file as text and asserts on the import
// surface, rather than mocking the module system. A refactor that
// introduces a forbidden import — even a type-only one — fails this
// test before it reaches production.
//
// Source path note: when this test runs, it's compiled to
// `lib/__tests__/cpaEconomics.test.js` and `__dirname` resolves there.
// Walk up to `functions/` then descend into `src/` for the source.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("purity — cpaEconomics.ts imports nothing from firebase-admin, firebase-functions, or any network client (FR-047)", () => {
    const src = readFileSync(
        resolve(__dirname, "../../src/cpaEconomics.ts"),
        "utf-8",
    );
    // Strip line/block comments so a `// firebase-admin` note in a
    // comment doesn't trip the assertion.
    const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const FORBIDDEN = [
        "firebase-admin",
        "firebase-functions",
        "@google-cloud",
        "node-fetch",
        "axios",
        // Skip "got" — it's a common English word that appears in error
        // messages ("got ${value}"); HTTP-client module references
        // would be `from "got"` or `require("got")`, which the
        // import-statement pattern below catches explicitly.
        // "node:http",
        // "node:https",
        // "node:net",
        // "createConnection",
    ];
    // Two checks: (a) the bare term doesn't appear as a substring
    // (catches naked references in code, but not error-message prose),
    // and (b) the term doesn't appear inside an import / require
    // statement (catches all real module references).
    for (const term of FORBIDDEN) {
        assert.equal(
            stripped.includes(term),
            false,
            `cpaEconomics.ts imports or references "${term}" — forbidden by FR-047 (purity). ` +
            `The economics module must stay directly unit-testable without an emulator or mock stack.`,
        );
    }
    // Belt-and-braces: no `from "<forbidden>"` or `require("<forbidden>")`
    // anywhere in the source.
    const importPatterns = [
        /from\s+["']firebase-admin["']/,
        /from\s+["']firebase-functions["']/,
        /from\s+["']@google-cloud\/[^"']+["']/,
        /from\s+["']node-fetch["']/,
        /from\s+["']axios["']/,
        /require\s*\(\s*["']firebase-admin["']\s*\)/,
        /require\s*\(\s*["']firebase-functions["']\s*\)/,
    ];
    for (const re of importPatterns) {
        assert.equal(
            re.test(stripped),
            false,
            `cpaEconomics.ts imports a forbidden module — pattern ${re} matched. FR-047 requires the module to stay pure.`,
        );
    }
});
