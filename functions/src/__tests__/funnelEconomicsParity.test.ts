// functions/src/__tests__/funnelEconomicsParity.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 968 — Phase 10 T058 (constitution XI parity gate).
//
// Asserts the backend's `missingRequiredFields`
// (`functions/src/funnelSettings.ts`) — the canonical definition
// per FR-050 — produces the expected missing-field set for every
// funnel type × hasHto × missing-field permutation. The frontend's
// `computeMissingFields` (`src/components/FunnelsSettingsForm.tsx`)
// is pinned against the same fixtures in
// `src/__tests__/funnelCompleteness.test.ts`. The two tests together
// are the constitution XI parity gate: a regression on either side
// breaks a test, and the shared fixtures make the failures
// comparable.
//
// The fixtures are hand-curated from `data-model.md §3` + `FR-039` +
// `FR-040a` + the Item A decision in `batch-05-report.md`. Every
// named permutation is also tested in the frontend file. Any new
// permutation added here MUST be added there too, and vice versa,
// or the parity gate fails silently.
//
// This file is `node:test` (matches the existing backend test
// convention) and runs via `cd functions && npm run build && node
// lib/__tests__/funnelEconomicsParity.test.js` — the same shape as
// `creativeResolverParity.test.ts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { missingRequiredFields } from "../funnelSettings.js";

// Set-based comparison: the parity gate is about WHICH fields are
// missing, not the iteration order. The backend returns declaration
// order from `requiredFieldsForDoc`; the frontend's
// `computeMissingFields` returns declaration order from the useMemo
// body. Both produce the same set; the test asserts the sets match
// without coupling to ordering.
function assertSameSet(actual: ReadonlyArray<string>, expected: ReadonlyArray<string>) {
    assert.deepEqual([...actual].sort(), [...expected].sort());
}

// ─── Fixture shapes ────────────────────────────────────────────────────────
//
// `FunnelSettingsLike` is the union type the backend's
// `missingRequiredFields` accepts. We don't import the type — the
// input shape is the one the backend tolerates (every field is
// optional / unknown). The fixtures below cover the corners the
// frontend's parity test also covers.

interface FSL {
    funnelType?: unknown;
    aov?: number | null;
    htoPrice?: number | null;
    htoConversionRate?: number | null;
    hasHto?: boolean | null;
    roasTarget?: number | null;
    eventAttendanceRate?: number | null;
    eventCloseRate?: number | null;
    offerPrice?: number | null;
    attendanceRate?: number | null;
    buyRateFromAttendees?: number | null;
    leadToCloseRate?: number | null;
    bookingRate?: number | null;
    showUpRate?: number | null;
    commissionRate?: number | null;
    marginKept?: number | null;
}

function fixture(overrides: Partial<FSL>): FSL {
    return {
        funnelType: "paid_event",
        aov: null,
        htoPrice: null,
        htoConversionRate: null,
        hasHto: false,
        roasTarget: null,
        eventAttendanceRate: null,
        eventCloseRate: null,
        offerPrice: null,
        attendanceRate: null,
        buyRateFromAttendees: null,
        leadToCloseRate: null,
        bookingRate: null,
        showUpRate: null,
        commissionRate: null,
        marginKept: null,
        ...overrides,
    };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test("parity — paid_event empty: aov + eventAttendanceRate + eventCloseRate + commissionRate + marginKept", () => {
    const doc = fixture({ funnelType: "paid_event" });
    assert.deepEqual(
        ([...missingRequiredFields(doc)]).sort(),
        [
            "aov",
            "commissionRate",
            "eventAttendanceRate",
            "eventCloseRate",
            "marginKept",
        ].sort(),
    );
});

test("parity — paid_event complete (hasHto=true, htoConversionRate empty): []", () => {
    // htoConversionRate is NOT required on paid_event (Item A).
    const doc = fixture({
        funnelType: "paid_event",
        hasHto: true,
        aov: 24,
        roasTarget: 0.5,
        htoPrice: 3000,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
    });
    assert.deepEqual(missingRequiredFields(doc), []);
});

test("parity — paid_event hasHto=true missing htoPrice: lists htoPrice; NOT htoConversionRate (Item A)", () => {
    const doc = fixture({
        funnelType: "paid_event",
        hasHto: true,
        aov: 24,
        roasTarget: 0.5,
        htoPrice: null, // missing — required because hasHto=true
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
    });
    assert.deepEqual(([...missingRequiredFields(doc)]).sort(), ["htoPrice"].sort());
});

test("parity — paid_event numeric 0 is COMPLETE (aov=0, no hto, all rates 0)", () => {
    // Defensive: zero is a legitimate answer — the rule's
    // "`0` is complete" property must hold on the backend side too.
    const doc = fixture({
        funnelType: "paid_event",
        hasHto: false,
        aov: 0,
        roasTarget: 0.5,
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        commissionRate: 0,
        marginKept: 60,
    });
    assert.deepEqual(missingRequiredFields(doc), []);
});

test("parity — paid_product empty: aov + roasTarget + commissionRate + marginKept", () => {
    const doc = fixture({ funnelType: "paid_product" });
    assert.deepEqual(
        ([...missingRequiredFields(doc)]).sort(),
        [
            "aov",
            "commissionRate",
            "marginKept",
            "roasTarget",
        ].sort(),
    );
});

test("parity — paid_product complete (hasHto=true): []", () => {
    const doc = fixture({
        funnelType: "paid_product",
        hasHto: true,
        aov: 100,
        roasTarget: 1.0,
        htoPrice: 3000,
        htoConversionRate: 5,
        commissionRate: 10,
        marginKept: 60,
    });
    assert.deepEqual(missingRequiredFields(doc), []);
});

test("parity — paid_product hasHto=true missing htoConversionRate: lists htoConversionRate (FR-019)", () => {
    const doc = fixture({
        funnelType: "paid_product",
        hasHto: true,
        aov: 100,
        roasTarget: 1.0,
        htoPrice: 3000,
        htoConversionRate: null,
        commissionRate: 10,
        marginKept: 60,
    });
    assert.deepEqual(
        ([...missingRequiredFields(doc)]).sort(),
        ["htoConversionRate"].sort(),
    );
});

test("parity — paid_product hasHto=true missing htoPrice: lists htoPrice + htoConversionRate", () => {
    const doc = fixture({
        funnelType: "paid_product",
        hasHto: true,
        aov: 100,
        roasTarget: 1.0,
        htoPrice: null,
        htoConversionRate: null,
        commissionRate: 10,
        marginKept: 60,
    });
    assert.deepEqual(
        ([...missingRequiredFields(doc)]).sort(),
        ["htoConversionRate", "htoPrice"].sort(),
    );
});

test("parity — free_webinar empty: offerPrice + attendanceRate + buyRateFromAttendees + commissionRate + marginKept", () => {
    const doc = fixture({ funnelType: "free_webinar" });
    assert.deepEqual(
        ([...missingRequiredFields(doc)]).sort(),
        [
            "attendanceRate",
            "buyRateFromAttendees",
            "commissionRate",
            "marginKept",
            "offerPrice",
        ].sort(),
    );
});

test("parity — free_webinar complete: []", () => {
    const doc = fixture({
        funnelType: "free_webinar",
        offerPrice: 997,
        attendanceRate: 40,
        buyRateFromAttendees: 8,
        commissionRate: 10,
        marginKept: 60,
    });
    assert.deepEqual(missingRequiredFields(doc), []);
});

test("parity — lead_magnet_call empty: offerPrice + leadToCloseRate + bookingRate + showUpRate + commissionRate + marginKept", () => {
    const doc = fixture({ funnelType: "lead_magnet_call" });
    assert.deepEqual(
        ([...missingRequiredFields(doc)]).sort(),
        [
            "bookingRate",
            "commissionRate",
            "leadToCloseRate",
            "marginKept",
            "offerPrice",
            "showUpRate",
        ].sort(),
    );
});

test("parity — lead_magnet_call complete: []", () => {
    const doc = fixture({
        funnelType: "lead_magnet_call",
        offerPrice: 3000,
        leadToCloseRate: 22.5,
        bookingRate: 7.5,
        showUpRate: 70,
        commissionRate: 10,
        marginKept: 60,
    });
    assert.deepEqual(missingRequiredFields(doc), []);
});

test("parity — output is deterministic (same input → same output, in declaration order)", () => {
    // The backend returns fields in declaration order (the order
    // defined by `requiredFieldsForDoc`). Callers that compare via
    // `assertSameSet` are insulated from this; callers that compare
    // arrays directly see the same order on every call.
    const doc = fixture({ funnelType: "free_webinar" });
    const a = missingRequiredFields(doc);
    const b = missingRequiredFields(doc);
    assert.deepEqual(a, b);
    // Declaration order: offerPrice, attendanceRate, buyRateFromAttendees, ...
    assert.deepEqual(a, [
        "offerPrice",
        "attendanceRate",
        "buyRateFromAttendees",
        "commissionRate",
        "marginKept",
    ]);
});
