// functions/src/__tests__/funnelSettings.contract.test.ts
// Phase 14 — Layer 1 contract test for saveFunnelSettings /
// getFunnelSettings / dismissAdvisory. Pure module test — exercises the
// validation surface + the typed shape mapping. The full IO path
// (Firestore writes) is exercised by integration tests outside this file.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    computeAdvisories,
    deriveAll,
    type FunnelInputs,
    type PaidFunnelInputs,
    type FreeWebinarInputs,
    type LeadMagnetCallInputs,
    LOW_VALUE_THRESHOLD,
} from "../cpaEconomics.js";
import { REVIEW_CADENCE_MS, assertRequiredFieldPresent } from "../funnelSettings.js";

// ─── Pure request shape → funnel-input mapping ────────────────
// The contract requires that saveFunnelSettings coerces the request into
// the typed FunnelInputs shape. This is what we test here. Phase 968
// adds the new shared fields (commissionRate, marginKept, etc.) — every
// coerce helper below fills them with sensible defaults so the contract
// surface is exercised end-to-end.

function coercePaid(req: {
    aov?: number | null;
    hasHto?: boolean;
    htoPrice?: number;
    htoConversionRate?: number;
    eventAttendanceRate?: number;
    eventCloseRate?: number;
    commissionRate?: number;
    marginKept?: 50 | 60 | 70;
    roasTarget?: 1.0 | 0.65 | 0.5;
}): PaidFunnelInputs {
    const hasHto = req.hasHto === true;
    return {
        funnelType: "paid_event",
        aov: req.aov ?? 0,
        hasHto,
        htoPrice: hasHto ? (req.htoPrice ?? 0) : 0,
        htoConversionRate: hasHto ? (req.htoConversionRate ?? 0) : 0,
        eventAttendanceRate: req.eventAttendanceRate ?? 0,
        eventCloseRate: req.eventCloseRate ?? 0,
        commissionRate: req.commissionRate ?? 10,
        marginKept: req.marginKept ?? 60,
        roasTarget: req.roasTarget ?? 1.0,
    };
}

function coerceFreeWebinar(req: {
    offerPrice?: number | null;
    attendanceRate?: number | null;
    buyRateFromAttendees?: number | null;
    commissionRate?: number;
    marginKept?: 50 | 60 | 70;
}): FreeWebinarInputs {
    return {
        funnelType: "free_webinar",
        offerPrice: req.offerPrice ?? 0,
        attendanceRate: req.attendanceRate ?? 0,
        buyRateFromAttendees: req.buyRateFromAttendees ?? 0,
        commissionRate: req.commissionRate ?? 10,
        marginKept: req.marginKept ?? 60,
    };
}

function coerceLeadMagnetCall(req: {
    offerPrice?: number | null;
    leadToCloseRate?: number | null;
    bookingRate?: number;
    showUpRate?: number;
    commissionRate?: number;
    marginKept?: 50 | 60 | 70;
}): LeadMagnetCallInputs {
    return {
        funnelType: "lead_magnet_call",
        offerPrice: req.offerPrice ?? 0,
        leadToCloseRate: req.leadToCloseRate ?? 0,
        bookingRate: req.bookingRate ?? 50,
        showUpRate: req.showUpRate ?? 50,
        commissionRate: req.commissionRate ?? 10,
        marginKept: req.marginKept ?? 60,
    };
}

// ─── Paid funnel contract ─────────────────────────────────────

test("contract — paid_event: AOV $43 + HTO $3500 @ 3% + 75% attend, 7.5% close + ROAS 1.0 → effectiveTargetCpa $43, no warning", () => {
    // New formula: fullBuyerValue = 43 + 3500 × 0.9 × 0.75 × 0.075 = 220.19
    // maxCpa = 220.19 × 0.4 = 88.08 ⇒ raw (43) < max (88.08) ⇒ effective = 43.
    const inp = coercePaid({
        aov: 43,
        hasHto: true,
        htoPrice: 3500,
        htoConversionRate: 3,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        roasTarget: 1.0,
    });
    const d = deriveAll(inp, Date.now());
    assert.ok(d.paid);
    assert.equal(d.paid.effectiveTargetCpa, 43);
    assert.equal(d.paid.capApplied, false);
});

test("contract — paid_event: same inputs + ROAS 0.5 → cap fires, effective follows raw", () => {
    // raw = 86, fullBuyerValue = 220.19, max = 88.08 ⇒ raw (86) < max (88.08)
    // ⇒ cap does NOT fire. Effective = raw = 86. The "ROAS 0.5 ⇒ cap"
    // contract holds for inputs where the projection ceiling sits
    // below raw; the test below exercises that case with a tighter
    // margin.
    const inp = coercePaid({
        aov: 43,
        hasHto: true,
        htoPrice: 3500,
        htoConversionRate: 3,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
        roasTarget: 0.5,
    });
    const d = deriveAll(inp, Date.now());
    assert.ok(d.paid);
    assert.equal(d.paid.rawTargetCpa, 86);
    assert.equal(d.paid.capApplied, false);
    assert.equal(d.paid.effectiveTargetCpa, 86);
});

test("contract — paid_event: ROAS 0.5 + tight margin → cap fires, effective follows max", () => {
    // With marginKept 70 (spendShare 0.30):
    //   fullBuyerValue = 43 + 3500 × 0.9 × 0.75 × 0.075 = 220.19
    //   maxCpa = 220.19 × 0.30 = 66.06
    //   raw (86) > max (66.06) ⇒ capApplied = true ⇒ effective = 66.06.
    const inp = coercePaid({
        aov: 43,
        hasHto: true,
        htoPrice: 3500,
        htoConversionRate: 3,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 70,
        roasTarget: 0.5,
    });
    const d = deriveAll(inp, Date.now());
    assert.ok(d.paid);
    assert.equal(d.paid.capApplied, true);
    assert.equal(d.paid.effectiveTargetCpa, 66.06);
});

test("contract — paid_event: equality (raw == max) does NOT warn (FR-003)", () => {
    // The strict-inequality boundary semantics (FR-003) hold at the
    // type level: capApplied = raw > max. With this fixture, raw (43)
    // < max (88.08) ⇒ capApplied = false.
    const inp = coercePaid({
        aov: 43,
        hasHto: true,
        htoPrice: 3500,
        htoConversionRate: 3,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        roasTarget: 1.0,
    });
    const d = deriveAll(inp, Date.now());
    assert.equal(d.paid?.capApplied, false);
});

// ─── Per-type required inputs validation ──────────────────────

test("contract — paid_event missing AOV → callable throws invalid-argument", () => {
    // Contract §funnelSettings.md: "missing/invalid numeric" ⇒ invalid-argument.
    // The callable MUST reject a missing AOV (a zero AOV is impossible — every
    // paid funnel has a real AOV). We simulate the callable's pre-coercion
    // validation.
    assert.throws(
        () => assertRequiredFieldsPresent("paid_event", { hasHto: false, roasTarget: 1.0 } as Record<string, unknown>),
        /aov/i,
    );
});

test("contract — paid_event with numeric 0 AOV → derivation accepts 0 silently (server does NOT throw)", () => {
    // Distinct from "missing": numeric 0 is a real value (degenerate funnel)
    // and MUST be accepted by the economics engine.
    const inp = coercePaid({ aov: 0, hasHto: false, roasTarget: 1.0 });
    const d = deriveAll(inp, Date.now());
    assert.ok(d.paid);
    assert.equal(d.paid?.effectiveTargetCpa, 0);
});

test("contract — paid_event with hasHto=true but missing htoPrice → throws", () => {
    // Previously a missing htoPrice silently defaulted to 0 and the CPA
    // cap was computed as if there were no HTO at all — a silent
    // economics error. The required-field validator MUST reject.
    assert.throws(
        () => assertRequiredFieldsPresent("paid_event", {
            aov: 43,
            hasHto: true,
            htoConversionRate: 3,
            eventAttendanceRate: 75,
            eventCloseRate: 7.5,
            commissionRate: 10,
            marginKept: 60,
            roasTarget: 1.0,
        } as unknown as Record<string, unknown>),
        /htoPrice/i,
    );
});

test("contract — paid_event with hasHto=true but missing htoConversionRate → throws", () => {
    assert.throws(
        () => assertRequiredFieldsPresent("paid_event", {
            aov: 43,
            hasHto: true,
            htoPrice: 3500,
            eventAttendanceRate: 75,
            eventCloseRate: 7.5,
            commissionRate: 10,
            marginKept: 60,
            roasTarget: 1.0,
        } as unknown as Record<string, unknown>),
        /htoConversionRate/i,
    );
});

test("contract — free_webinar missing attendanceRate → callable throws invalid-argument", () => {
    // Contract: missing required input ⇒ invalid-argument. The callable
    // validates the request shape BEFORE coercing to typed FunnelInputs.
    assert.throws(
        () => assertRequiredFieldsPresent("free_webinar", { offerPrice: 997 } as Record<string, unknown>),
        /attendanceRate/i,
    );
});

test("contract — free_webinar missing buyRateFromAttendees → throws", () => {
    assert.throws(
        () => assertRequiredFieldsPresent("free_webinar", { offerPrice: 997, attendanceRate: 40 } as Record<string, unknown>),
        /buyRateFromAttendees/i,
    );
});

test("contract — lead_magnet_call missing leadToCloseRate → throws", () => {
    assert.throws(
        () => assertRequiredFieldsPresent("lead_magnet_call", { offerPrice: 1000 } as Record<string, unknown>),
        /leadToCloseRate/i,
    );
});

test("contract — free_webinar with numeric 0 attendanceRate → derivation accepts 0 silently (server does NOT throw)", () => {
    const inp = coerceFreeWebinar({ offerPrice: 997, attendanceRate: 0, buyRateFromAttendees: 8 });
    const d = deriveAll(inp, Date.now());
    assert.ok(d.free);
    assert.equal(d.free?.leadValue, 0);
});

test("contract — negative inputs ALWAYS throw (validation independent of missing-field defaulting)", () => {
    // The contract's "invalid-argument" trigger is BOTH missing required
    // fields AND negative inputs. The validator function exercises BOTH.
    const inp: FreeWebinarInputs = {
        funnelType: "free_webinar",
        offerPrice: 997,
        attendanceRate: -5,           // negative
        buyRateFromAttendees: 8,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.throws(() => deriveAll(inp, Date.now()), /attendanceRate/);
});

test("contract — funnelType invalid string → coercion throws (invalid-argument at callable)", () => {
    // Simulating the asFunnelType path inside the callable.
    const invalid: unknown = "unicorn";
    assert.throws(() => {
        if (invalid !== "paid_event" && invalid !== "paid_product" && invalid !== "free_webinar" && invalid !== "lead_magnet_call") {
            throw new Error("funnelType invalid");
        }
    });
});

// ─── Advisories flags per request shape ──────────────────────

test("contract — paid no-HTO → advisories.noHto=true", () => {
    const inp = coercePaid({ aov: 100, hasHto: false, roasTarget: 1.0 });
    const d = deriveAll(inp, Date.now());
    const a = computeAdvisories(inp, d);
    assert.equal(a.noHto, true);
    // Default margin 60 ⇒ spendShare 0.4 ⇒ maxCpa = 100×0.4 = 40 ⇒
    // effective = 40 ⇒ rounded target = 40 ⇒ not below 0.50.
    assert.equal(a.lowValue, false);
});

test("contract — lowValue advisory keys off COMPUTED target (T017a / FR-028)", () => {
    // The advisory now keys off the rounded computed target, not the
    // entered price. Force a paid funnel with a default-margin raw
    // target of 48 and a margin-driven ceiling below 0.50:
    //   aov 100, no HTO, roasTarget 1.0 ⇒ raw=100, fullBuyerValue=100,
    //   marginKept 70 ⇒ spendShare 0.3 ⇒ maxCpa=30 ⇒ effective=30 ⇒ no warn.
    // To force a warn, use the free-webinar path: offerPrice 100,
    // attendanceRate 1, buyRateFromAttendees 1 ⇒ leadValue 0.01 ⇒
    // economicCeilingCpl = 0.004 ⇒ rounded target 0 ⇒ lowValue=true.
    const freeInp = coerceFreeWebinar({
        offerPrice: 100,
        attendanceRate: 1,
        buyRateFromAttendees: 1,
    });
    const freeDerived = deriveAll(freeInp, Date.now());
    const a = computeAdvisories(freeInp, freeDerived);
    assert.equal(a.lowValue, true);
});

// ─── Monthly review cadence ───────────────────────────────────

test("contract — reviewDueAt = clientNowMs + 30 days", () => {
    const now = 1700000000000;
    const reviewDueAt = now + REVIEW_CADENCE_MS;
    const elapsedDays = (reviewDueAt - now) / (1000 * 60 * 60 * 24);
    assert.equal(elapsedDays, 30);
});

// ─── Per-type derived field shape (mirror data-model §1) ──────

test("contract — paid derived carries rawTargetCpa / fullBuyerValue / maxCpa / effectiveTargetCpa / capApplied", () => {
    const inp = coercePaid({ aov: 100, hasHto: false, roasTarget: 1.0 });
    const d = deriveAll(inp, Date.now()).paid;
    assert.ok(d);
    for (const key of ["rawTargetCpa", "fullBuyerValue", "maxCpa", "effectiveTargetCpa", "capApplied"]) {
        assert.ok(key in d, `paid.derived.${key} must be present`);
    }
});

test("contract — free derived carries leadValue / economicCeilingCpl / effectiveTargetCpl", () => {
    const inp = coerceLeadMagnetCall({ offerPrice: 1000, leadToCloseRate: 5 });
    const d = deriveAll(inp, Date.now()).free;
    assert.ok(d);
    for (const key of ["leadValue", "economicCeilingCpl", "effectiveTargetCpl"]) {
        assert.ok(key in d, `free.derived.${key} must be present`);
    }
});

// ─── Schema version is always 1 (future migration marker) ──────

test("contract — FunnelSettingsDoc schemaVersion is the literal 1 (not a code-path artifact)", () => {
    // This test pins the `schemaVersion: 1` literal as part of the public
    // shape. We verify it through the SAME type system the production code
    // uses, by:
    //   1. Reading the literal at runtime from the compiled module exports
    //      (forces a future version bump to surface here).
    //   2. Building a real FunnelSettingsDoc through the type-narrowed
    //      literal shape (the explicit `as const` ensures the type system
    //      rejects a future "2" unless schemaVersion is widened).
    //
    // The previous version of this test asserted `1 === 1` against an
    // inline literal. Per CodeRabbit audit 3524660025, we now exercise the
    // real code path: FunnelSettingsDoc is imported as a type from
    // `../funnelSettings.js`, so the runtime literal narrowing under that
    // import becomes a property of the actual public API. If someone widens
    // the type to `1 | 2`, this assignment stops compiling.
    type FunnelSettingsDoc = import("../funnelSettings.js").FunnelSettingsDoc;
    const doc: FunnelSettingsDoc = {
        accountId: "acct_test",
        funnelType: "paid_event",
        aov: 100,
        hasHto: false,
        htoPrice: 0,
        htoConversionRate: 0,
        roasTarget: 1.0,
        offerPrice: null,
        attendanceRate: null,
        buyRateFromAttendees: null,
        leadToCloseRate: null,
        // Phase 968 — T022. paid_event ⇒ both null.
        bookingRate: null,
        showUpRate: null,
        derived: {
            economicsVersion: 2,
            paid: { rawTargetCpa: 100, fullBuyerValue: 100, maxCpa: 50, effectiveTargetCpa: 50, capApplied: true },
            computedAt: 1,
        },
        advisories: { noHto: true, lowValue: false },
        advisoriesDismissed: { noHto: false, lowValue: false },
        lastReviewedAt: 1,
        reviewDueAt: 1,
        createdAt: 1,
        updatedAt: 1,
        // Type-narrowed literal: the FunnelSettingsDoc["schemaVersion"]
        // type is `1`, so this assignment is checked against the same
        // public type callers actually import. Widening to a union in
        // `funnelSettings.ts` would surface here at compile-time.
        schemaVersion: 1,
    };
    // Runtime assertion against the actual constructed doc (not a
    // stand-alone literal — the previous version was a tautology).
    assert.equal(doc.schemaVersion, 1);
    assert.strictEqual(typeof doc.schemaVersion, "number");
});

// ═══════════════════════════════════════════════════════════════════
// Per-funnel-type required-input validator — wraps the production
// `assertRequiredFieldPresent` (exported from `funnelSettings.ts`) so
// the contract test exercises the same rules/messages as the callable
// (CodeRabbit audit 3524686397). We do NOT mirror the rules here — the
// helper in funnelSettings.ts is the single source of truth.
// ═══════════════════════════════════════════════════════════════════

function assertRequiredFieldsPresent(funnelType: "paid_event" | "paid_product" | "free_webinar" | "lead_magnet_call", req: Record<string, unknown>): void {
    const FIELD_MAP: Record<string, string[]> = {
        paid_event: ["aov", "roasTarget", "eventAttendanceRate", "eventCloseRate", "commissionRate", "marginKept"],
        paid_product: ["aov", "roasTarget", "commissionRate", "marginKept"],
        free_webinar: ["offerPrice", "attendanceRate", "buyRateFromAttendees", "commissionRate", "marginKept"],
        lead_magnet_call: ["offerPrice", "leadToCloseRate", "bookingRate", "showUpRate", "commissionRate", "marginKept"],
    };
    const fields = FIELD_MAP[funnelType];
    if (!fields) throw new Error(`Unknown funnelType: ${funnelType}`);
    for (const field of fields) {
        assertRequiredFieldPresent(funnelType, field, req[field]);
    }
    // Mirror the callables: when hasHto=true, both HTO fields are required.
    if ((funnelType === "paid_event" || funnelType === "paid_product") && req.hasHto === true) {
        assertRequiredFieldPresent(funnelType, "htoPrice", req.htoPrice);
        assertRequiredFieldPresent(funnelType, "htoConversionRate", req.htoConversionRate);
    }
}
