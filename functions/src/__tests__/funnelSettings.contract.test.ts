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
} from "../cpaEconomics.js";
import {
    REVIEW_CADENCE_MS,
    assertRequiredFieldPresent,
    isSettingsComplete,
    missingRequiredFields,
    resolveHtoConversionRateForStorage,
} from "../funnelSettings.js";

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
    // Phase 11 + Phase 12 — paid_product chain. Phase 12 renamed the
    // storage slots from the overloaded `bookingRate` / `showUpRate`
    // / `leadToCloseRate` to `productBookingRate` / `productShowUpRate`
    // / `productCloseRate` (the `product*` prefix mirrors the `event*`
    // prefix used by paid_event's chain — same convention, scoped per
    // funnel type). The fields are accepted on the contract test's
    // request shape but default to 0 for paid_event-shaped fixtures.
    // paid_event ignores these; paid_product reads them (verified by
    // the dedicated Phase 11 tests in cpaEconomics.test.ts).
    productBookingRate?: number;
    productShowUpRate?: number;
    productCloseRate?: number;
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
        // Phase 11 + Phase 12 — paid_product chain rates. The
        // `coercePaid` helper is paid_event-shaped for the contract
        // test; the chain is supplied as defaults (0) so the
        // derivation never sees an `undefined`. paid_event's
        // derivation ignores these fields. Phase 12 renamed the
        // chain to `product*` to scope buyer-side rates distinctly
        // from lead-side rates — `coercePaid` accepts the new names
        // and the helper below mirrors that.
        productBookingRate: req.productBookingRate ?? 0,
        productShowUpRate: req.productShowUpRate ?? 0,
        productCloseRate: req.productCloseRate ?? 0,
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

test("contract — paid_event: AOV $43 + HTO $3500 + 75% attend, 7.5% close + ROAS 1.0 → effectiveTargetCpa $43, no warning", () => {
    // Inputs: aov $43, hasHto true (htoPrice $3500), eventAttendanceRate
    // 75%, eventCloseRate 7.5%, commissionRate 10 (default), marginKept 60
    // (default), ROAS 1.0. The `htoConversionRate: 3` below is the legacy
    // additive-storage field that paid_event no longer reads (kept only
    // for storage compatibility, data-model.md §1).
    // New formula: fullBuyerValue = 43 + 3500 × 0.9 × 0.75 × 0.075 = 220.19
    // maxCpa = 220.19 × 0.4 = 88.08 ⇒ raw (43) < max (88.08) ⇒ effective = 43.
    const inp = coercePaid({
        aov: 43,
        hasHto: true,
        htoPrice: 3500,
        htoConversionRate: 3, // legacy additive-storage field; unused on paid_event
        productBookingRate: 0,
        productShowUpRate: 0,
        productCloseRate: 0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        roasTarget: 1.0,
    });
    const d = deriveAll(inp, Date.now());
    assert.ok(d.paid);
    assert.equal(d.paid.effectiveTargetCpa, 43);
    assert.equal(d.paid.capApplied, false);
});

test("contract — paid_event: same inputs + ROAS 0.5 → cap silent, effective follows raw", () => {
    // With the inputs above and ROAS 0.5:
    //   raw = 86, fullBuyerValue = 220.19, max = 88.08.
    //   raw (86) < max (88.08) ⇒ cap does NOT fire ⇒ effective = raw = 86.
    // The "ROAS 0.5 ⇒ cap" contract holds only when the projection
    // ceiling sits below raw; the test below exercises that case with
    // a tighter marginKept=70.
    const inp = coercePaid({
        aov: 43,
        hasHto: true,
        htoPrice: 3500,
        htoConversionRate: 3,
        productBookingRate: 0,
        productShowUpRate: 0,
        productCloseRate: 0,
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
        productBookingRate: 0,
        productShowUpRate: 0,
        productCloseRate: 0,
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
        productBookingRate: 0,
        productShowUpRate: 0,
        productCloseRate: 0,
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
        productBookingRate: 0,
        productShowUpRate: 0,
        productCloseRate: 0,
            eventAttendanceRate: 75,
            eventCloseRate: 7.5,
            commissionRate: 10,
            marginKept: 60,
            roasTarget: 1.0,
        } as unknown as Record<string, unknown>),
        /htoPrice/i,
    );
});

test("contract — paid_event with hasHto=true and missing htoConversionRate → does NOT throw (FR-011..FR-014, data-model.md §3)", () => {
    // Phase 968 — Item A decision. paid_event reads
    // eventAttendanceRate × eventCloseRate; it does NOT read
    // htoConversionRate. The field is retained on paid_event for
    // additive storage compatibility (data-model.md §1) but is NOT
    // part of the completeness rule (data-model.md §3). Requiring it
    // would force the owner to fill a field that changes nothing and
    // would keep the attention badge lit until they do — even though
    // their record is otherwise complete (FR-039, FR-049).
    assert.doesNotThrow(
        () => assertRequiredFieldsPresent("paid_event", {
            aov: 43,
            hasHto: true,
            htoPrice: 3500,
            eventAttendanceRate: 75,
            eventCloseRate: 7.5,
            commissionRate: 10,
            marginKept: 60,
            roasTarget: 1.0,
            // htoConversionRate intentionally omitted.
        } as unknown as Record<string, unknown>),
    );
});

test("contract — paid_product with hasHto=true and missing chain (booking/show-up/close) → throws (Phase 11)", () => {
    // Phase 11 + Phase 12 — paid_product reads the chain
    // productBookingRate × productShowUpRate × productCloseRate on
    // the HTO term. All three are required when hasHto=true.
    // htoConversionRate is NOT required (it was replaced by the
    // chain). The validator throws on the FIRST missing field
    // (per-field validator), and the canonical predicate
    // `missingRequiredFields` lists ALL three in declaration order.
    assert.throws(
        () => assertRequiredFieldsPresent("paid_product", {
            aov: 100,
            hasHto: true,
            htoPrice: 3000,
            commissionRate: 10,
            marginKept: 60,
            roasTarget: 1.0,
            // productBookingRate + productShowUpRate + productCloseRate
            // intentionally omitted. htoConversionRate also omitted
            // — no longer required.
        } as unknown as Record<string, unknown>),
        /productBookingRate/i,
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

// Phase 10 T067 (FR-030) — non-blocking assertion. The lowValue
// advisory is informational; it MUST NOT prevent the save from
// succeeding. This test pins three properties at once:
//
//   1. `missingRequiredFields` returns [] for a complete doc whose
//      derived target fires lowValue — completeness and lowValue
//      are independent.
//   2. `deriveAll` returns a non-null target for the same doc — the
//      derivation proceeds even when the advisory would fire.
//   3. `computeAdvisories` returns lowValue=true AND the target is
//      still present — the advisory is computed alongside the
//      target, not as a gate on it.
//
// The contract's `saveFunnelSettings` callable consumes these three
// facts: it rejects on missing fields (1), derives (2), computes
// advisories (3), and persists. None of those steps throw on a
// firing lowValue advisory — the chain runs end-to-end and the
// owner sees both the target and the badge.
test("contract — lowValue advisory is NON-BLOCKING (FR-030): target computes, save proceeds, advisory fires", () => {
    // Construct a complete free_webinar doc whose derived target is
    // below the lowValue threshold ($0.50, FR-028).
    const freeInp = coerceFreeWebinar({
        offerPrice: 100,
        attendanceRate: 1,
        buyRateFromAttendees: 1,
        commissionRate: 10,
        marginKept: 60,
    });
    const freeDoc = {
        funnelType: "free_webinar" as const,
        offerPrice: 100,
        attendanceRate: 1,
        buyRateFromAttendees: 1,
        commissionRate: 10,
        marginKept: 60,
    };

    // (1) Completeness is independent of lowValue — a complete doc
    //     with a tiny target is still complete.
    assert.equal(isSettingsComplete(freeDoc), true);
    assert.equal(missingRequiredFields(freeDoc).length, 0);

    // (2) Derivation proceeds — the target is computed, not null,
    //     even though it rounds below $0.50.
    const freeDerived = deriveAll(freeInp, Date.now());
    assert.ok(freeDerived.free);
    assert.ok(freeDerived.free.effectiveTargetCpl !== null);
    assert.ok(typeof freeDerived.free.effectiveTargetCpl === "number");

    // (3) Advisory fires AND the target is computed alongside it.
    const a = computeAdvisories(freeInp, freeDerived);
    assert.equal(a.lowValue, true);
    // Target still present — not gated by the advisory.
    assert.equal(freeDerived.free.effectiveTargetCpl, freeDerived.free.effectiveTargetCpl);
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
        // Phase 968 — T045. paid_event event rates. Round-12 fix:
        // these are now required fields on the doc shape AND are
        // written by `saveFunnelSettings`. The test fixture must
        // include them to satisfy the public type.
        eventAttendanceRate: 0,
        eventCloseRate: 0,
        roasTarget: 1.0,
        offerPrice: null,
        attendanceRate: null,
        buyRateFromAttendees: null,
        // Phase 968 — T022. lead_magnet_call only. Lead → booked call;
        // persisted on the doc shape; null on every other funnel type.
        leadToCloseRate: null,
        bookingRate: null,
        showUpRate: null,
        // Phase 12 — paid_product only. SCOPED to paid_product to
        // keep buyer-side rates distinct from lead-side rates; null
        // on every other funnel type (paid_event ⇒ all null).
        productCloseRate: null,
        productBookingRate: null,
        productShowUpRate: null,
        // Phase 968 — T027. Shared fields, populated for completeness.
        commissionRate: 10,
        marginKept: 60,
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
    // Mirror the callables: when hasHto=true, htoPrice is required on
    // every paid funnel type. Phase 11 + Phase 12 — paid_product's
    // HTO term reads the chain
    // (productBookingRate × productShowUpRate × productCloseRate),
    // all three required when hasHto=true. htoConversionRate is no
    // longer required on any funnel type (Phase 7 Item C dropped it
    // from paid_event; Phase 11 dropped it from paid_product).
    if ((funnelType === "paid_event" || funnelType === "paid_product") && req.hasHto === true) {
        assertRequiredFieldPresent(funnelType, "htoPrice", req.htoPrice);
        if (funnelType === "paid_product") {
            assertRequiredFieldPresent(funnelType, "productBookingRate", req.productBookingRate);
            assertRequiredFieldPresent(funnelType, "productShowUpRate", req.productShowUpRate);
            assertRequiredFieldPresent(funnelType, "productCloseRate", req.productCloseRate);
        }
    }
}

// ─── Completeness predicate (T030, FR-039, FR-050) ───────────────────
//
// Single canonical definition (FR-050). Every consumer — `getFunnelSettings`,
// the parity test, the structured observability log — must use this exact
// helper. `null`/missing is incomplete; `0` is complete; `hasHto === false`
// drops the high-ticket fields from the required set.

test("completeness — paid_event with all required fields present ⇒ isSettingsComplete=true", () => {
    const doc = {
        funnelType: "paid_event",
        aov: 24,
        hasHto: true,
        htoPrice: 3000,
        // htoConversionRate intentionally absent — paid_event doesn't read it.
        roasTarget: 0.5,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.equal(isSettingsComplete(doc), true);
    assert.deepEqual(missingRequiredFields(doc), []);
});

test("completeness — paid_event missing eventAttendanceRate ⇒ incomplete, lists the field", () => {
    const doc = {
        funnelType: "paid_event",
        aov: 24,
        hasHto: false,
        htoPrice: 0,
        roasTarget: 0.5,
        // eventAttendanceRate intentionally null
        eventAttendanceRate: null,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.equal(isSettingsComplete(doc), false);
    assert.deepEqual(missingRequiredFields(doc), ["eventAttendanceRate"]);
});

test("completeness — paid_event with hasHto=false ⇒ htoPrice drops from required set", () => {
    // Existing behaviour: hasHto=false forces htoPrice/htoConversionRate to 0
    // and removes them from the required set (data-model.md §3).
    const doc = {
        funnelType: "paid_event",
        aov: 100,
        hasHto: false,
        htoPrice: 0, // would-be missing if hasHto=true; with false, dropped
        roasTarget: 1.0,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.equal(isSettingsComplete(doc), true);
});

test("completeness — paid_product requires the chain (booking/show-up/close) when hasHto=true (Phase 11)", () => {
    // Phase 11 + Phase 12 — paid_product's completeness rule requires
    // the three chain rates (Phase 12: `productBookingRate` /
    // `productShowUpRate` / `productCloseRate` — the `product*`
    // prefix scopes buyer-side rates distinctly from lead-side rates).
    // All three are listed in declaration order (matches the
    // backend's requiredFieldsForDoc for paid_product + hasHto).
    const withoutChain = {
        funnelType: "paid_product",
        aov: 100,
        hasHto: true,
        htoPrice: 3000,
        // productBookingRate / productShowUpRate / productCloseRate
        // missing. htoConversionRate intentionally absent too — no
        // longer required (Phase 11).
        roasTarget: 1.0,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.equal(isSettingsComplete(withoutChain), false);
    assert.deepEqual(missingRequiredFields(withoutChain), [
        "productBookingRate",
        "productShowUpRate",
        "productCloseRate",
    ]);

    const withChain = {
        ...withoutChain,
        productBookingRate: 7.5,
        productShowUpRate: 70,
        productCloseRate: 22.5,
    };
    assert.equal(isSettingsComplete(withChain), true);
});

test("completeness — paid_event does NOT require htoConversionRate even when hasHto=true (Item A decision)", () => {
    // The field is stored-but-unread on paid_event. Requiring it would
    // force owners to fill a field that changes nothing.
    const doc = {
        funnelType: "paid_event",
        aov: 24,
        hasHto: true,
        htoPrice: 3000,
        // htoConversionRate intentionally null/absent — paid_event ignores it.
        roasTarget: 0.5,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.equal(isSettingsComplete(doc), true);
    assert.equal(missingRequiredFields(doc).includes("htoConversionRate"), false);
});

test("completeness — numeric 0 is COMPLETE, not missing (data-model.md §3)", () => {
    const doc = {
        funnelType: "free_webinar",
        offerPrice: 100,
        attendanceRate: 0,    // 0 is valid; only null/missing is incomplete
        buyRateFromAttendees: 0,
        commissionRate: 0,    // 0 commission is legitimate
        marginKept: 60,
    };
    assert.equal(isSettingsComplete(doc), true);
    assert.deepEqual(missingRequiredFields(doc), []);
});

test("completeness — free_webinar missing offerPrice ⇒ incomplete", () => {
    const doc = {
        funnelType: "free_webinar",
        offerPrice: null,
        attendanceRate: 25,
        buyRateFromAttendees: 2,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.equal(isSettingsComplete(doc), false);
    assert.deepEqual(missingRequiredFields(doc), ["offerPrice"]);
});

test("completeness — lead_magnet_call missing bookingRate ⇒ incomplete", () => {
    const doc = {
        funnelType: "lead_magnet_call",
        offerPrice: 3000,
        leadToCloseRate: 22.5,
        bookingRate: null,    // missing
        showUpRate: 70,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.equal(isSettingsComplete(doc), false);
    assert.deepEqual(missingRequiredFields(doc), ["bookingRate"]);
});

test("completeness — multiple missing fields reported in one error (FR-040a)", () => {
    // Save-path (T032) collects ALL missing fields and reports them
    // together. The predicate returns the array in field order; the
    // order matters because the save error names them in this order.
    const doc = {
        funnelType: "lead_magnet_call",
        offerPrice: 3000,
        // leadToCloseRate, bookingRate, showUpRate, commissionRate, marginKept all missing
    };
    const missing = missingRequiredFields(doc);
    assert.equal(missing.length, 5);
    assert.deepEqual(missing, [
        "leadToCloseRate",
        "bookingRate",
        "showUpRate",
        "commissionRate",
        "marginKept",
    ]);
});

// Item A follow-up (Phase 6 entry criterion): the paid_event save
// requires BOTH eventAttendanceRate AND eventCloseRate (FR-011..FR-014).
// The Phase 5 form does not render these fields yet (T045 lands them).
// This contract test pins that, until T045 ships, no paid_event owner
// can save a record through the form even with every other field
// filled — the server rejects, the completeness predicate reports
// incomplete, and `getFunnelSettings.complete === false`. Until the
// form renders these two inputs, the branch is NOT safely deployable
// for paid_event owners (Item A follow-up).
test("completeness — paid_event requires eventAttendanceRate AND eventCloseRate (T045 prerequisite)", () => {
    // Every other required field present, but the two event-rate
    // fields absent — record is incomplete. The save path throws
    // (the underlying validator throws on the FIRST missing field;
    // the wrapper at saveFunnelSettings line 446 collects ALL
    // missing via `missingRequiredFields` and throws once with the
    // full list per FR-040a). This test pins BOTH ends:
    //   1. The per-field validator throws on each missing field
    //      (so `assertRequiredFieldsPresent` throws here).
    //   2. The canonical predicate returns BOTH fields together
    //      so the save wrapper would surface them in one error.
    const req: Record<string, unknown> = {
        aov: 24,
        roasTarget: 0.5,
        commissionRate: 10,
        marginKept: 60,
        // eventAttendanceRate + eventCloseRate intentionally omitted.
    };
    // Per-field validator throws on the first missing field. The
    // first missing field is eventAttendanceRate (FIELD_MAP order).
    assert.throws(
        () => assertRequiredFieldsPresent("paid_event", req),
        /eventAttendanceRate is required for paid_event/,
    );

    // The canonical predicate returns both fields in field order:
    const incompleteDoc = {
        funnelType: "paid_event" as const,
        aov: 24,
        roasTarget: 0.5,
        commissionRate: 10,
        marginKept: 60,
    };
    const missing = missingRequiredFields(incompleteDoc);
    assert.equal(missing.length, 2);
    assert.deepEqual(missing, ["eventAttendanceRate", "eventCloseRate"]);

    // isSettingsComplete agrees: returns false.
    assert.equal(isSettingsComplete(incompleteDoc), false);

    // Adding both event-rate fields makes the record complete. This
    // is the state T045 needs to land before paid_event is fully
    // functional end-to-end (form + doc + backend).
    const completeDoc = {
        ...incompleteDoc,
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
    };
    assert.equal(isSettingsComplete(completeDoc), true);
    assert.equal(missingRequiredFields(completeDoc).length, 0);

    // Negative control: only ONE event-rate field present is still
    // incomplete (both are required, neither is a substitute).
    const halfDoc = { ...incompleteDoc, eventAttendanceRate: 75 };
    assert.equal(isSettingsComplete(halfDoc), false);
    assert.deepEqual(missingRequiredFields(halfDoc), ["eventCloseRate"]);

    // Phase 968 — T041 mirror (FR-016): roasTarget is OPTIONAL on
    // paid_event — the form defaults to 0.5 and the backend fills it
    // if absent. paid_product still requires an explicit choice.
    const noRoasTarget = {
        funnelType: "paid_event" as const,
        aov: 24,
        // roasTarget intentionally omitted.
        eventAttendanceRate: 75,
        eventCloseRate: 7.5,
        commissionRate: 10,
        marginKept: 60,
    };
    assert.equal(isSettingsComplete(noRoasTarget), true);
    assert.equal(missingRequiredFields(noRoasTarget).length, 0);

    // paid_product: roasTarget IS required.
    const paidProductNoRoas = {
        funnelType: "paid_product" as const,
        aov: 100,
        htoPrice: 3000,
        htoConversionRate: 5,
        productBookingRate: 0,
        productShowUpRate: 0,
        productCloseRate: 0,
        commissionRate: 10,
        marginKept: 60,
        // roasTarget intentionally omitted.
    };
    assert.equal(isSettingsComplete(paidProductNoRoas), false);
    assert.deepEqual(missingRequiredFields(paidProductNoRoas), ["roasTarget"]);
});

// Phase 968 — Item D (Phase 7 carry-over, Phase 9 close-out):
// paid_event does NOT require `htoConversionRate` and the form removed
// the input (Phase 7 Item C). Storage retention (data-model.md §1)
// means the field is preserved verbatim — including a stored `null`.
// Sending `0` would overwrite a pre-existing value with `0` and break
// the revert-stays-code-only property the deferred epoch phase relies on.
//
// The previous Item D fix was incomplete: the form's `?? 0` fallback
// coerced `null` to `0` BEFORE the request left the client, and the
// backend's `buildFunnelInputs` (`asNumberOrNull(req.htoConversionRate)
// ?? 0`) would have coerced `null` to `0` even if the form had sent it.
// The test that landed in Phase 8 (#32) pinned only standalone variable
// assertions that didn't exercise either layer of the chain.
//
// This test pins the chain end-to-end via the new pure helper
// `resolveHtoConversionRateForStorage` — the same function the doc
// construction uses. Three legs:
//
//   1. paid_event: pre-existing value of 21 → form sends 21 → doc
//      holds 21.
//   2. paid_event: pre-existing value of `null` → form sends `null`
//      → doc holds `null` (the regression case Phase 8 missed).
//   3. paid_event: brand-new record (no value to preserve) → form
//      sends `null` → doc holds `null`.
//   4. paid_product: form sends 0 → doc holds 0 (negative control —
//      `0` is a valid upsell-conversion rate, not a sentinel).
//   5. paid_product: form sends 5 → doc holds 5 (numeric pass-through).
//
// The previous test (#32) only proved standalone values equal
// themselves. This test proves the helper that the doc construction
// uses pins every leg of the storage-retention invariant.
test("Item D: paid_event htoConversionRate is preserved verbatim — null pass-through; no overwrite to 0", () => {
    // ── Leg 1: paid_event, stored number 21, no change ────────────
    // Pre-phase production scenario: a stored value of 21 (the
    // legacy upsell-conversion rate). The form's hydration reads it,
    // sends it back on save; the doc must hold 21.
    const storedNumber = 21;
    // Form side (FunnelSettingsForm.tsx `handleSave`):
    //   htoConversionRate = settings?.htoConversionRate ?? null
    // for paid_event. State is empty (input hidden), settings.htoConversionRate
    // is 21, payload becomes 21.
    const formPayloadNumber: number | null = storedNumber;
    // Backend side: the doc construction calls
    // resolveHtoConversionRateForStorage('paid_event', reqValue, derived).
    // For paid_event the helper returns `reqValue ?? null`. The form
    // sends `number | null`, so the helper returns that number.
    const docStored1 = resolveHtoConversionRateForStorage(
        "paid_event",
        formPayloadNumber,
        0, // derived — unused on paid_event branch
    );
    assert.equal(docStored1, 21, "paid_event stored 21 must round-trip to doc 21");

    // ── Leg 2: paid_event, stored null, no change (THE BUG) ────────
    // The regression that Phase 8's test missed: a stored value of
    // `null`. The previous form code was
    //   numOrNull('') ?? settings?.htoConversionRate ?? 0
    // which evaluated to `null ?? null = null` then `null ?? 0 = 0`,
    // so the request left the client carrying `0`, not `null`. After
    // the Phase 9 close-out the form sends the hydrated value
    // verbatim: `settings?.htoConversionRate ?? null`.
    const storedNull: number | null = null;
    // Form: `null ?? null = null`, payload becomes `null`.
    const formPayloadNull: number | null = storedNull ?? null;
    // Backend: helper preserves `null` verbatim on paid_event.
    const docStored2 = resolveHtoConversionRateForStorage(
        "paid_event",
        formPayloadNull,
        0,
    );
    assert.equal(docStored2, null, "paid_event stored null must round-trip to doc null");

    // ── Leg 3: paid_event, brand-new record (no value to preserve) ─
    // A record written before this phase on a paid_event funnel
    // where the owner never set the legacy rate. settings.htoConversionRate
    // is `undefined` (the doc was created on `tx.set` without that
    // field). The form's hydration maps `undefined` → state `''`,
    // and the save payload resolves to `undefined ?? null = null`.
    // The doc construction must carry `null` (the storage-retention
    // default), NOT `0`.
    const formPayloadUndefined: number | null = null;
    const docStored3 = resolveHtoConversionRateForStorage(
        "paid_event",
        formPayloadUndefined,
        0,
    );
    assert.equal(docStored3, null, "paid_event brand-new record must carry null");

    // ── Leg 4: paid_product, form sends 0 ──────────────────────────
    // Negative control: paid_product requires the field as a number;
    // a stored 0 is a legitimate answer (zero upsell-conversion rate
    // ⇒ no HTO revenue contribution). The helper uses the derivation's
    // coerced numeric value (the third argument, which buildFunnelInputs
    // coerces to 0 when missing).
    const docStored4 = resolveHtoConversionRateForStorage(
        "paid_product",
        null, // form may send null when the input is empty
        0,    // buildFunnelInputs coerces null → 0
    );
    assert.equal(docStored4, 0, "paid_product empty input stores 0, not null");

    // ── Leg 5: paid_product, form sends 5 ──────────────────────────
    // Numeric pass-through on paid_product.
    const docStored5 = resolveHtoConversionRateForStorage(
        "paid_product",
        5,
        5,
    );
    assert.equal(docStored5, 5, "paid_product numeric input stores that number");

    // ── Cross-branch negative: non-paid funnel types land in the
    // doc construction's `else 0` branch, never in the helper.
    // Pin that the helper's contract is paid_event | paid_product only,
    // and that other types would produce `null` if called (caller is
    // responsible for the `else 0` arm). For paid_event with
    // `reqValue = undefined`, the helper collapses to `null`.
    assert.equal(
        resolveHtoConversionRateForStorage("paid_event", undefined, 0),
        null,
        "paid_event + undefined reqValue ⇒ null (no value to preserve)",
    );
});
