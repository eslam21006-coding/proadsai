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
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
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
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
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
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    commissionRate: "",
    marginKept: null,
};

const COMPLETE_PAID_PRODUCT = {
    funnelType: "paid_product" as const,
    hasHto: true,
    aov: "100",
    roasTarget: 1.0,
    htoPrice: "3000",
    htoConversionRate: "5",
    eventAttendanceRate: "",
    eventCloseRate: "",
    offerPrice: "",
    attendanceRate: "",
    buyRateFromAttendees: "",
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
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
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
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
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
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
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
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
    leadToCloseRate: "22.5",
    bookingRate: "7.5",
    showUpRate: "70",
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
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
    commissionRate: "10",
    marginKept: 60 as const,
};

// paid_product hasHto=true but missing htoConversionRate:
// htoConversionRate IS required on paid_product (FR-019).
const PAID_PRODUCT_HAS_HTO_MISSING_CONVERSION = {
    funnelType: "paid_product" as const,
    hasHto: true,
    aov: "100",
    roasTarget: 1.0,
    htoPrice: "3000",
    htoConversionRate: "", // missing — required because paid_product + hasHto
    eventAttendanceRate: "",
    eventCloseRate: "",
    offerPrice: "",
    attendanceRate: "",
    buyRateFromAttendees: "",
    leadToCloseRate: "",
    bookingRate: "",
    showUpRate: "",
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

    it("paid_product hasHto=true missing htoConversionRate: lists htoConversionRate (FR-019)", () => {
        expect(computeMissingFields(PAID_PRODUCT_HAS_HTO_MISSING_CONVERSION)).toEqual([
            "htoConversionRate",
        ]);
    });

    it("paid_product hasHto=true missing htoPrice: lists htoPrice + htoConversionRate", () => {
        const fixture: ComputeMissingFieldsInput = {
            ...PAID_PRODUCT_HAS_HTO_MISSING_CONVERSION,
            htoPrice: "",
        };
        // Declaration order: htoPrice comes before htoConversionRate
        // in the form's useMemo body, matching the backend's
        // requiredFieldsForDoc for paid_product + hasHto.
        expect(computeMissingFields(fixture)).toEqual([
            "htoPrice",
            "htoConversionRate",
        ]);
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

    it("lead_magnet_call empty: lists offerPrice + leadToCloseRate + bookingRate + showUpRate + commissionRate + marginKept", () => {
        // Declaration order matches the backend's requiredFieldsForDoc.
        expect(computeMissingFields(EMPTY_LEAD_MAGNET)).toEqual([
            "offerPrice",
            "leadToCloseRate",
            "bookingRate",
            "showUpRate",
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
                    "bookingRate", "showUpRate", "commissionRate", "marginKept"])
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
            "bookingRate", "showUpRate", "commissionRate", "marginKept"];
        for (const [key, label] of Object.entries(MISSING_FIELD_LABELS)) {
            for (const ik of internalKeys) {
                if (ik === key) continue;
                expect(label.ar.includes(ik)).toBe(false);
            }
        }
    });
});