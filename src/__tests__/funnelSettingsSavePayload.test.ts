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

    describe("paid_product (input rendered, form reads the field)", () => {
        it("form value 5 passes through as 5", () => {
            expect(
                resolveHtoConversionRateForSave("paid_product", "5", null),
            ).toBe(5);
        });

        it("empty form falls back to 0 (paid_product requires the field as a number)", () => {
            expect(
                resolveHtoConversionRateForSave("paid_product", "", null),
            ).toBe(0);
        });

        it("form value 0 is preserved as 0 (zero upsell-conversion rate is legitimate)", () => {
            expect(
                resolveHtoConversionRateForSave("paid_product", "0", null),
            ).toBe(0);
        });

        it("non-numeric form value falls back to 0 (defensive; backend rejects NaN at validation)", () => {
            expect(
                resolveHtoConversionRateForSave("paid_product", "abc", null),
            ).toBe(0);
        });

        it("settings value is irrelevant on paid_product (form is the source of truth)", () => {
            // The form's input wins on paid_product; the helper ignores
            // the hydrated settings value. This mirrors the existing
            // Phase 8 logic — the form's input was always the source on
            // paid_product, even pre-Phase-9.
            expect(
                resolveHtoConversionRateForSave("paid_product", "5", 21),
            ).toBe(5);
        });
    });

    describe("non-paid funnel types (defensive)", () => {
        it("free_webinar: state 0 → 0 (defensive default; field is not on the save payload)", () => {
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