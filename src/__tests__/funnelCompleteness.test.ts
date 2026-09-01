// src/__tests__/funnelCompleteness.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 968 — Phase 10 T058 (frontend side). Pairs with
// `functions/src/__tests__/funnelEconomicsParity.test.ts` to pin
// agreement between the frontend's `computeMissingFields` and the
// backend's `missingRequiredFields`. The parity test owns the
// backend behavior + the cross-side agreement; this file owns the
// frontend behavior at the form layer.
//
// Two tests at the same level (frontend vitest + backend node:test)
// constitute the constitution XI parity gate. The cross-side parity
// assertion itself lives in the backend file (it is the canonical
// source of the rule) — this file just pins the frontend side
// against the same fixtures so a future regression surfaces as a
// vitest failure at the moment the form code breaks.

import { describe, it, expect } from "vitest";
import {
    computeMissingFields,
    type ComputeMissingFieldsInput,
} from "../components/FunnelSettingsForm";

// ─── Fixtures ──────────────────────────────────────────────────────────────
//
// Hand-curated from `data-model.md §3` + `FR-039` + `FR-040a` + the
// Item A decision in `batch-05-report.md`. Each fixture's `expected`
// array is the canonical missing-field set the frontend must agree
// with — the backend's `missingRequiredFields` is asserted against
// the same fixtures in the parity test.

const EMPTY_PAID_EVENT = {
    funnelType: "paid_event" as const,
    hasHto: false,
    aov: "",
    roasTarget: null,
    htoPrice: "",
    htoConversionRate: "",
    eventAttendanceRate: "",
    eventCloseRate: "",
    offerPrice: "",
    attendanceRate: "",
    buyRateFromAttendees: "",
    productCloseRate: "",
    productBookingRate: "",
    productShowUpRate: "",
    productQualificationRate: "",
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    qualificationRate: "",
    commissionRate: "",
    marginKept: null,
};

const COMPLETE_PAID_EVENT = {
    funnelType: "paid_event" as const,
    hasHto: true,
    aov: "24",
    roasTarget: 0.5, // present (paid_event's default)
    htoPrice: "3000",
    // htoConversionRate is intentionally absent/empty — paid_event
    // does NOT require it (Item A decision). The form removed the
    // input for paid_event (Phase 7 Item C).
    htoConversionRate: "",
    eventAttendanceRate: "75",
    eventCloseRate: "7.5",
    offerPrice: "",
    attendanceRate: "",
    buyRateFromAttendees: "",
    productCloseRate: "",
    productBookingRate: "",
    productShowUpRate: "",
    productQualificationRate: "",
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    qualificationRate: "",
    commissionRate: "10",
    marginKept: 60 as const,
};

const EMPTY_PAID_PRODUCT = {
    funnelType: "paid_product" as const,
    hasHto: false,
    aov: "",
    roasTarget: null,
    htoPrice: "",
    htoConversionRate: "",
    eventAttendanceRate: "",
    eventCloseRate: "",
    offerPrice: "",
    attendanceRate: "",
    buyRateFromAttendees: "",
    productCloseRate: "",
    productBookingRate: "",
    productShowUpRate: "",
    productQualificationRate: "",
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    qualificationRate: "",
    commissionRate: "",
    marginKept: null,
};

const COMPLETE_PAID_PRODUCT = {
    funnelType: "paid_product" as const,
    hasHto: true,
    aov: "100",
    roasTarget: 1.0,
    htoPrice: "3000",
    // Phase 11 production-bug fix: paid_product no longer reads
    // htoConversionRate — the chain (bookingRate × showUpRate ×
    // leadToCloseRate) replaces it. The field stays in the fixture for
    // data-model.md §1 storage retention (the doc slot persists) but
    // it is NOT part of the completeness rule.
    htoConversionRate: "",
    eventAttendanceRate: "",
    eventCloseRate: "",
    offerPrice: "",
    attendanceRate: "",
    buyRateFromAttendees: "",
    // Chain fields — REQUIRED on paid_product + hasHto (Phase 11).
    // Phase 13 — added productQualificationRate (qualification stage).
    productCloseRate: "25",
    productBookingRate: "20",
    productShowUpRate: "60",
    productQualificationRate: "50",
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    qualificationRate: "",
    commissionRate: "10",
    marginKept: 60 as const,
};

const EMPTY_FREE_WEBINAR = {
    funnelType: "free_webinar" as const,
    hasHto: false,
    aov: "",
    roasTarget: null,
    htoPrice: "",
    htoConversionRate: "",
    eventAttendanceRate: "",
    eventCloseRate: "",
    offerPrice: "",
    attendanceRate: "",
    buyRateFromAttendees: "",
    productCloseRate: "",
    productBookingRate: "",
    productShowUpRate: "",
    productQualificationRate: "",
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    qualificationRate: "",
    commissionRate: "",
    marginKept: null,
};

const COMPLETE_FREE_WEBINAR = {
    funnelType: "free_webinar" as const,
    hasHto: false,
    aov: "",
    roasTarget: null,
    htoPrice: "",
    htoConversionRate: "",
    eventAttendanceRate: "",
    eventCloseRate: "",
    offerPrice: "997",
    attendanceRate: "40",
    buyRateFromAttendees: "8",
    productCloseRate: "",
    productBookingRate: "",
    productShowUpRate: "",
    productQualificationRate: "",
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    qualificationRate: "",
    commissionRate: "10",
    marginKept: 60 as const,
};

const EMPTY_LEAD_MAGNET = {
    funnelType: "lead_magnet_call" as const,
    hasHto: false,
    aov: "",
    roasTarget: null,
    htoPrice: "",
    htoConversionRate: "",
    eventAttendanceRate: "",
    eventCloseRate: "",
    offerPrice: "",
    attendanceRate: "",
    buyRateFromAttendees: "",
    // Phase 968 — T022. lead_magnet_call's chain (lead → close).
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    // Phase 13 — qualification stage on the lead-side chain.
    qualificationRate: "",
    // Phase 12 — paid_product's chain. Null on lead_magnet_call
    // docs; the slot is part of the doc shape but unused.
    productCloseRate: "",
    productBookingRate: "",
    productShowUpRate: "",
    productQualificationRate: "",
    commissionRate: "",
    marginKept: null,
};

const COMPLETE_LEAD_MAGNET = {
    funnelType: "lead_magnet_call" as const,
    hasHto: false,
    aov: "",
    roasTarget: null,
    htoPrice: "",
    htoConversionRate: "",
    eventAttendanceRate: "",
    eventCloseRate: "",
    offerPrice: "3000",
    attendanceRate: "",
    buyRateFromAttendees: "",
    // Phase 968 — T022. lead_magnet_call's chain (lead → close).
    // Phase 13 — qualification stage added; benchmarks revised to
    // 7.5 / 60 / 50 / 25 (owner-supplied).
    leadToCloseRate: "25",
    bookingRate: "7.5",
    showUpRate: "60",
    qualificationRate: "50",
    // Phase 12 — paid_product's chain. Null on lead_magnet_call
    // docs; the slot is part of the doc shape but unused.
    productCloseRate: "",
    productBookingRate: "",
    productShowUpRate: "",
    productQualificationRate: "",
    commissionRate: "10",
    marginKept: 60 as const,
};

// paid_event hasHto=true but missing htoPrice: hasHto=true means
// htoPrice is required, but htoConversionRate is still NOT required
// on paid_event (Item A asymmetry). The expected list is therefore
// `htoPrice` only (plus any other missing fields).
const PAID_EVENT_HAS_HTO_MISSING_PRICE = {
    funnelType: "paid_event" as const,
    hasHto: true,
    aov: "24",
    roasTarget: 0.5,
    htoPrice: "", // missing — required because hasHto=true
    htoConversionRate: "",
    eventAttendanceRate: "75",
    eventCloseRate: "7.5",
    offerPrice: "",
    attendanceRate: "",
    buyRateFromAttendees: "",
    productCloseRate: "",
    productBookingRate: "",
    productShowUpRate: "",
    productQualificationRate: "",
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    qualificationRate: "",
    commissionRate: "10",
    marginKept: 60 as const,
};

// paid_product hasHto=true but missing the chain (booking / show-up
// / qualification / close). The chain IS required on paid_product +
// hasHto (Phase 11 + Phase 13). htoConversionRate is NOT required
// (it is the legacy single-rate field the chain replaced). Mirrors
// the lead_magnet_call "missing chain" pattern at COMPLETE_LEAD_MAGNET
// above — same shape, different funnel-type semantics on the rates
// (buyer → call vs lead → call).
const PAID_PRODUCT_HAS_HTO_MISSING_CONVERSION = {
    funnelType: "paid_product" as const,
    hasHto: true,
    aov: "100",
    roasTarget: 1.0,
    htoPrice: "3000",
    htoConversionRate: "", // NOT required (Phase 11)
    eventAttendanceRate: "",
    eventCloseRate: "",
    offerPrice: "",
    attendanceRate: "",
    buyRateFromAttendees: "",
    // All four chain fields intentionally empty — the test asserts
    // the missing-field set lists them all (Phase 13 added the
    // fourth: productQualificationRate).
    productCloseRate: "",
    productBookingRate: "",
    productShowUpRate: "",
    productQualificationRate: "",
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    qualificationRate: "",
    commissionRate: "10",
    marginKept: 60 as const,
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("FunnelSettingsForm.computeMissingFields (frontend completeness mirror)", () => {
    it("paid_event empty: lists aov + eventAttendanceRate + eventCloseRate + commissionRate + marginKept", () => {
        // Declaration order matches the backend's requiredFieldsForDoc.
        expect(computeMissingFields(EMPTY_PAID_EVENT)).toEqual([
            "aov",
            "eventAttendanceRate",
            "eventCloseRate",
            "commissionRate",
            "marginKept",
        ]);
    });

    it("paid_event complete (hasHto=true): returns []", () => {
        // htoConversionRate is NOT required on paid_event (Item A).
        expect(computeMissingFields(COMPLETE_PAID_EVENT)).toEqual([]);
    });

    it("paid_event hasHto=true missing htoPrice: lists htoPrice; NOT htoConversionRate (Item A asymmetry)", () => {
        expect(computeMissingFields(PAID_EVENT_HAS_HTO_MISSING_PRICE)).toEqual([
            "htoPrice",
        ]);
    });

    it("paid_event numeric 0 is COMPLETE (aov=0 with no hto is valid)", () => {
        // Defensive: zero is a legitimate answer. The completeness
        // rule's "0 is complete" property must hold on the frontend
        // side too — `aov=0` for a free event is complete when
        // hasHto=false.
        const fixture: ComputeMissingFieldsInput = {
            ...EMPTY_PAID_EVENT,
            aov: "0",
            eventAttendanceRate: "0",
            eventCloseRate: "0",
            commissionRate: "0",
            marginKept: 60,
            roasTarget: 0.5,
        };
        expect(computeMissingFields(fixture)).toEqual([]);
    });

    it("paid_product empty: lists aov + roasTarget + commissionRate + marginKept", () => {
        // Declaration order matches the backend's requiredFieldsForDoc.
        expect(computeMissingFields(EMPTY_PAID_PRODUCT)).toEqual([
            "aov",
            "roasTarget",
            "commissionRate",
            "marginKept",
        ]);
    });

    it("paid_product complete (hasHto=true): returns []", () => {
        expect(computeMissingFields(COMPLETE_PAID_PRODUCT)).toEqual([]);
    });

    it("paid_product hasHto=true missing chain: lists productBookingRate + productShowUpRate + productQualificationRate + productCloseRate (Phase 11 + Phase 12 + Phase 13)", () => {
        // The chain (productBookingRate × productShowUpRate ×
        // productQualificationRate × productCloseRate) replaces the
        // legacy htoConversionRate on paid_product. All four rates
        // are required when hasHto=true. htoConversionRate is NOT
        // listed (the field is dead at read time — see data-model.md
        // §1 storage retention rationale). Phase 12 renamed the
        // storage slots from the overloaded
        // bookingRate/showUpRate/leadToCloseRate to the `product*`
        // prefix to scope buyer-side rates distinctly from lead-side
        // rates. Phase 13 added the qualification stage.
        expect(computeMissingFields(PAID_PRODUCT_HAS_HTO_MISSING_CONVERSION)).toEqual([
            "productBookingRate",
            "productShowUpRate",
            "productQualificationRate",
            "productCloseRate",
        ]);
    });

    it("paid_product hasHto=true missing htoPrice: lists htoPrice + productBookingRate + productShowUpRate + productQualificationRate + productCloseRate", () => {
        const fixture: ComputeMissingFieldsInput = {
            ...PAID_PRODUCT_HAS_HTO_MISSING_CONVERSION,
            htoPrice: "",
        };
        // Declaration order matches the backend's requiredFieldsForDoc
        // for paid_product + hasHto: htoPrice is the first paid HTO
        // field, then the four chain rates (product* prefix per
        // Phase 12, qualification added per Phase 13).
        // htoConversionRate is no longer in the list (Phase 11).
        expect(computeMissingFields(fixture)).toEqual([
            "htoPrice",
            "productBookingRate",
            "productShowUpRate",
            "productQualificationRate",
            "productCloseRate",
        ]);
    });

    it("paid_product does NOT require htoConversionRate (Phase 11 — chain replaces it)", () => {
        // The legacy single-rate field is required on NO funnel type
        // now: paid_event dropped it in Phase 7 Item C; paid_product
        // drops it in Phase 11 (this test). A future regression that
        // re-adds it to paid_product's completeness rule fails here.
        // Phase 13 — fill all four chain rates to make complete.
        const fixture: ComputeMissingFieldsInput = {
            ...PAID_PRODUCT_HAS_HTO_MISSING_CONVERSION,
            productBookingRate: "20",
            productShowUpRate: "60",
            productQualificationRate: "50",
            productCloseRate: "25",
            // htoConversionRate intentionally empty.
        };
        const missing = computeMissingFields(fixture);
        expect(missing).not.toContain("htoConversionRate");
        expect(missing).toEqual([]);
    });

    it("free_webinar empty: lists offerPrice + attendanceRate + buyRateFromAttendees + commissionRate + marginKept", () => {
        // Declaration order matches the backend's requiredFieldsForDoc.
        expect(computeMissingFields(EMPTY_FREE_WEBINAR)).toEqual([
            "offerPrice",
            "attendanceRate",
            "buyRateFromAttendees",
            "commissionRate",
            "marginKept",
        ]);
    });

    it("free_webinar complete: returns []", () => {
        expect(computeMissingFields(COMPLETE_FREE_WEBINAR)).toEqual([]);
    });

    it("lead_magnet_call empty: lists offerPrice + leadToCloseRate + bookingRate + showUpRate + qualificationRate + commissionRate + marginKept", () => {
        // Declaration order matches the backend's requiredFieldsForDoc.
        // Phase 13 — qualification stage added to the lead-side chain.
        expect(computeMissingFields(EMPTY_LEAD_MAGNET)).toEqual([
            "offerPrice",
            "leadToCloseRate",
            "bookingRate",
            "showUpRate",
            "qualificationRate",
            "commissionRate",
            "marginKept",
        ]);
    });

    it("lead_magnet_call complete: returns []", () => {
        expect(computeMissingFields(COMPLETE_LEAD_MAGNET)).toEqual([]);
    });

    it("output is in declaration order (matches backend requiredFieldsForDoc)", () => {
        // The form's pre-extraction useMemo pushed fields in the
        // same order as the backend's `requiredFieldsForDoc`. The
        // extracted helper preserves that order byte-for-byte. The
        // parity test (`functions/src/__tests__/funnelEconomicsParity.test.ts`)
        // compares the two directly without sorting, so any future
        // reorder surfaces as a parity failure.
        const a = computeMissingFields(EMPTY_PAID_EVENT);
        // Declaration order: aov, eventAttendanceRate, eventCloseRate, commissionRate, marginKept
        expect(a).toEqual([
            "aov",
            "eventAttendanceRate",
            "eventCloseRate",
            "commissionRate",
            "marginKept",
        ]);
        // Idempotent.
        const b = computeMissingFields(EMPTY_PAID_EVENT);
        expect(a).toEqual(b);
    });
});

// Phase 968 — Round-13 (CodeRabbit #3897474305): the paused-targets
// notice now renders the missing-field names through
// `localizeMissingFieldName(key, lang)`, which maps internal keys
// ("aov", "eventAttendanceRate") to user-facing labels in both
// languages. This regression test pins the translation table — a
// missing translation (key returned unchanged) would surface as a
// leaked internal key in the UI. The form's paused notice lives in
// the same component but the test exercises the pure helper
// extracted alongside the table.
import { MISSING_FIELD_LABELS } from "../components/FunnelSettingsForm";

describe("MISSING_FIELD_LABELS (paused-notice translation table)", () => {
    it("every key listed in MISSING_FIELD_LABELS is a known missing-field key", () => {
        // Sanity check: the table must not contain stale keys that
        // aren't part of the missing-field predicate.
        for (const key of Object.keys(MISSING_FIELD_LABELS)) {
            expect(["aov", "roasTarget", "htoPrice", "htoConversionRate",
                    "eventAttendanceRate", "eventCloseRate", "offerPrice",
                    "attendanceRate", "buyRateFromAttendees", "leadToCloseRate",
                    "bookingRate", "showUpRate",
                    // Phase 13 — qualification stage on lead-side chain.
                    "qualificationRate",
                    // Phase 12 — paid_product-only chain rates.
                    "productBookingRate", "productShowUpRate",
                    // Phase 13 — qualification stage on buyer-side chain.
                    "productQualificationRate",
                    "productCloseRate",
                    "commissionRate", "marginKept"])
                .toContain(key);
        }
    });

    it("every entry has both English and Arabic labels", () => {
        // Round-13 #3897474305 fix pins bilingual coverage. The English
        // label is the same one the form renders next to the input;
        // the Arabic label is the form's plain-Fusha copy.
        for (const [, label] of Object.entries(MISSING_FIELD_LABELS)) {
            expect(typeof label.en).toBe("string");
            expect(label.en.length).toBeGreaterThan(0);
            expect(typeof label.ar).toBe("string");
            expect(label.ar.length).toBeGreaterThan(0);
        }
    });

    it("Arabic labels do not contain the internal field key", () => {
        // Internal keys like "aov" must NOT appear in user-facing
        // Arabic (the SC-11 user-facing rule). The keys are ASCII
        // and would leak the technical identifier if they slipped
        // into the translation.
        const internalKeys = ["aov", "roasTarget", "htoPrice", "htoConversionRate",
            "eventAttendanceRate", "eventCloseRate", "offerPrice",
            "attendanceRate", "buyRateFromAttendees", "leadToCloseRate",
            "bookingRate", "showUpRate",
            // Phase 13 — qualification stage on lead-side chain.
            "qualificationRate",
            // Phase 12 — paid_product-only chain rates.
            "productBookingRate", "productShowUpRate",
            // Phase 13 — qualification stage on buyer-side chain.
            "productQualificationRate",
            "productCloseRate",
            "commissionRate", "marginKept"];
        for (const [key, label] of Object.entries(MISSING_FIELD_LABELS)) {
            for (const ik of internalKeys) {
                if (ik === key) continue;
                expect(label.ar.includes(ik)).toBe(false);
            }
        }
    });
});
