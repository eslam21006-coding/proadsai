// src/__tests__/funnelSettingsSavePayload.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 968 — Phase 10 Item D (frontend test for htoConversionRate
// null pass-through). Pins the form's save-payload logic for
// `htoConversionRate` against the regression Phase 8 Item D missed:
// the form was sending `0` instead of `null` when the stored value
// was `null`, because the trailing `?? 0` in the original expression
// coerced `null` to `0` before the request left the client.
//
// These tests exercise the helper directly so a future refactor of
// `FunnelSettingsForm.tsx` that re-introduces the bug (or adds a new
// one) fails loudly. The chain is end-to-end at the form layer:
// every leg the backend's `resolveHtoConversionRateForStorage` covers
// in test 32 has a counterpart here.

import { describe, it, expect } from "vitest";
import { resolveHtoConversionRateForSave } from "../utils/funnelSettingsSavePayload";

describe("FunnelSettingsForm save payload — htoConversionRate", () => {
    describe("paid_event (input hidden, state always empty)", () => {
        it("stored number 21 passes through to the save payload", () => {
            expect(
                resolveHtoConversionRateForSave("paid_event", "", 21),
            ).toBe(21);
        });

        it("stored null stays null — null pass-through; no overwrite to 0 (THE BUG)", () => {
            expect(
                resolveHtoConversionRateForSave("paid_event", "", null),
            ).toBe(null);
        });

        it("stored undefined collapses to null (brand-new record; storage-retention default)", () => {
            expect(
                resolveHtoConversionRateForSave("paid_event", "", undefined),
            ).toBe(null);
        });

        it("stored 0 is preserved as 0 (zero is a legitimate stored value)", () => {
            // Defensive: if a future migration backfills the field with
            // 0, the form must not coerce that 0 to null on save.
            expect(
                resolveHtoConversionRateForSave("paid_event", "", 0),
            ).toBe(0);
        });

        it("form state is irrelevant on paid_event (input is hidden, state is always '')", () => {
            // Defensive: even if state somehow held a non-empty string,
            // the helper still uses the hydrated settings value. This
            // matches the form's invariant that the input never renders.
            expect(
                resolveHtoConversionRateForSave("paid_event", "5", null),
            ).toBe(null);
            expect(
                resolveHtoConversionRateForSave("paid_event", "0", 21),
            ).toBe(21);
        });
    });

    describe("paid_product (input removed in Phase 11; chain replaces htoConversionRate)", () => {
        // Phase 11 — paid_product no longer renders the
        // `htoConversionRate` input (the chain bookingRate × showUpRate
        // × leadToCloseRate replaces it, the way lead_magnet_call
        // replaced free_webinar's close rate with explicit stages). The
        // form's state for this slot is therefore always '' — the
        // input is hidden. The save payload still carries the doc
        // slot for storage retention (data-model.md §1); the helper
        // passes the hydrated settings value verbatim, identical to
        // paid_event's null pass-through.

        it("stored number 21 passes through (storage retention — doc slot persists)", () => {
            expect(
                resolveHtoConversionRateForSave("paid_product", "", 21),
            ).toBe(21);
        });

        it("stored null stays null — null pass-through; no overwrite to 0 (THE BUG)", () => {
            expect(
                resolveHtoConversionRateForSave("paid_product", "", null),
            ).toBe(null);
        });

        it("stored undefined collapses to null (brand-new record; storage-retention default)", () => {
            expect(
                resolveHtoConversionRateForSave("paid_product", "", undefined),
            ).toBe(null);
        });

        it("stored 0 is preserved as 0 (zero is a legitimate stored value)", () => {
            expect(
                resolveHtoConversionRateForSave("paid_product", "", 0),
            ).toBe(0);
        });

        it("form state is irrelevant on paid_product (input is hidden, state is always '')", () => {
            // Defensive — even if state somehow held a non-empty string,
            // the helper uses the hydrated settings value. Mirrors
            // paid_event's invariant: the input never renders, so the
            // hydrated value is the source.
            expect(
                resolveHtoConversionRateForSave("paid_product", "5", null),
            ).toBe(null);
            expect(
                resolveHtoConversionRateForSave("paid_product", "0", 21),
            ).toBe(21);
        });
    });

    describe("non-paid funnel types (defensive)", () => {
        // Round-13 (CodeRabbit): the previous name said "state 0" but
        // the test passed an empty string. Rename so the description
        // matches the assertion.
        it("free_webinar: empty form state → 0 (defensive default; field is not on the save payload)", () => {
            expect(
                resolveHtoConversionRateForSave("free_webinar", "", null),
            ).toBe(0);
        });

        it("lead_magnet_call: state 5 → 5 (defensive; field is not on the save payload)", () => {
            expect(
                resolveHtoConversionRateForSave("lead_magnet_call", "5", null),
            ).toBe(5);
        });
    });
});