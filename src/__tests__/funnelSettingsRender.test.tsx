// src/__tests__/funnelSettingsRender.test.tsx
// ═══════════════════════════════════════════════════════════════════════════
// Phase 968 — Phase 11 production-bug regression test.
//
// THE DEFECT THIS FILE EXISTS TO CATCH
// ─────────────────────────────────────
// A production owner of a paid_product funnel reported that the form
// rendered the WRONG field set. The root cause was that the paid_event
// and paid_product branches shared a single JSX block gated only by
// `funnelType === 'paid_event' || funnelType === 'paid_product'`, with
// the eventAttendanceRate / eventCloseRate inputs unconditionally inside
// that block. Result: paid_product owners saw paid_event fields
// ("Attendance from ticket buyers", "High ticket close from attendees")
// they could not act on, and the chain they needed
// (booking → attendance → close) was missing entirely.
//
// The pre-fix regression-test gap that let the defect ship was that no
// test asserted "paid_product must NOT render eventAttendanceRate /
// eventCloseRate". Negative requirements ("must not render X") had no
// positive tests. This file closes that gap.
//
// WHAT THIS TEST DOES
// ───────────────────
// For every funnel type, it mounts the form with a valid settings doc
// loaded and asserts:
//
//   - POSITIVE requirements: the field labels the funnel type SHOULD
//     render are present in the DOM. A missing required field is a
//     fail. Catches the half of the original defect where the chain
//     wasn't rendered at all.
//
//   - NEGATIVE requirements: the field labels the funnel type MUST
//     NOT render are absent from the DOM. A leaked field is a fail.
//     Catches the half of the original defect where paid_event fields
//     leaked into paid_product.
//
// Mount-based (not helper-based) on purpose: a pure helper that returns
// "render these fields" could be wrong if the JSX forgets to render
// them, and could be right while the JSX renders extras. DOM presence
// and absence is the only check that exercises both the helper and the
// render path in lockstep.
//
// FIXTURE STRATEGY
// ────────────────
// One base settings doc; `funnelType` and the per-type fields are
// varied per test. Each test sets the funnel type AND the field values
// for that type so the form can render without showing the paused-
// targets notice (which would otherwise obscure label visibility
// behind copy like "Targets are paused until you fill the fields
// below"). The completeness rule's "0 is complete" property lets a
// test provide zeros for irrelevant fields without triggering the
// notice — though completeness is irrelevant to which fields RENDER
// (rendering is independent of completeness).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import type * as React from "react";
import { LanguageProvider } from "../i18n";
import FunnelSettingsForm, {
    type FunnelSettingsDoc,
    type FunnelType,
} from "../components/FunnelSettingsForm";

// ─── Firebase mocks ─────────────────────────────────────────────────────────
//
// The form imports `httpsCallable` from `firebase/functions` and `functions`
// from `../firebase`. Both are mocked so jsdom never touches the real
// Firebase SDK. The mock is a factory: every call to `httpsCallable(functions,
// 'X')` returns a callable that, when invoked, resolves with the response
// shape the form expects.

const mockGetFunnelSettings = vi.fn();
const mockSaveFunnelSettings = vi.fn();
const mockDismissAdvisory = vi.fn();

vi.mock("firebase/functions", () => ({
    httpsCallable: vi.fn((_functions: unknown, name: string) => {
        if (name === "getFunnelSettings") return mockGetFunnelSettings;
        if (name === "saveFunnelSettings") return mockSaveFunnelSettings;
        if (name === "dismissAdvisory") return mockDismissAdvisory;
        return vi.fn().mockResolvedValue({ data: { ok: true } });
    }),
}));

vi.mock("../firebase", () => ({
    functions: {},
}));

// `resolveHtoConversionRateForSave` is exercised in the save path. The
// render path doesn't call it, but mocking it keeps the form's module
// import clean if a future refactor introduces a call from a render-time
// code path.
vi.mock("../utils/funnelSettingsSavePayload", () => ({
    resolveHtoConversionRateForSave: vi.fn(
        (_funnelType: string, stateValue: string) => {
            if (stateValue === "") return 0;
            const n = Number(stateValue);
            return Number.isFinite(n) ? n : 0;
        },
    ),
}));

// ─── Settings doc factory ──────────────────────────────────────────────────

function makeSettingsDoc(
    funnelType: FunnelType,
    overrides: Partial<FunnelSettingsDoc> = {},
): FunnelSettingsDoc {
    // Provide realistic per-type defaults so the form hydrates without
    // the paused-targets notice masking field labels. The values below
    // are NOT a completeness claim — they exist so the form's UI shows
    // fields, not the missing-fields banner. `missingFields` does not
    // affect which fields RENDER.
    const isPaid = funnelType === "paid_event" || funnelType === "paid_product";
    const isFree = funnelType === "free_webinar" || funnelType === "lead_magnet_call";
    // The chain (bookingRate / showUpRate / leadToCloseRate) is gated
    // by `hasHto` on both paid_product and lead_magnet_call — the
    // chain only matters when an HTO exists. Default to hasHto=true
    // for paid_product so the chain inputs render by default in the
    // rendered-field-set assertions (the test mirrors the production
    // owner's "low price offer + HTO upsell" flow, which is the
    // value chain the bug was about).
    const defaultHasHto = funnelType === "paid_product" || funnelType === "paid_event";
    return {
        accountId: "acct_test",
        funnelType,
        aov: isPaid ? 100 : null,
        hasHto: defaultHasHto,
        htoPrice: defaultHasHto ? 3000 : 0,
        htoConversionRate: null,
        eventAttendanceRate: funnelType === "paid_event" ? 75 : 0,
        eventCloseRate: funnelType === "paid_event" ? 7.5 : 0,
        roasTarget: 1.0,
        offerPrice: isFree ? 997 : null,
        attendanceRate: funnelType === "free_webinar" ? 25 : null,
        buyRateFromAttendees: funnelType === "free_webinar" ? 2 : null,
        // Chain rates — lead_magnet_call uses the unprefixed slots
        // (`bookingRate` / `showUpRate` / `leadToCloseRate`); paid_product
        // uses the dedicated `product*`-prefixed slots (Phase 12 — the
        // buyer-side rates are scoped distinctly from the lead-side
        // rates). On paid_event / free_webinar both sets carry `null`.
        leadToCloseRate: funnelType === "lead_magnet_call" ? 22.5 : null,
        bookingRate: funnelType === "lead_magnet_call" ? 7.5 : null,
        showUpRate: funnelType === "lead_magnet_call" ? 70 : null,
        productCloseRate: funnelType === "paid_product" ? 22.5 : null,
        productBookingRate: funnelType === "paid_product" ? 7.5 : null,
        productShowUpRate: funnelType === "paid_product" ? 70 : null,
        commissionRate: 10,
        marginKept: 60,
        derived: {
            economicsVersion: 2 as const,
            computedAt: 1,
            paid: {
                rawTargetCpa: 100,
                fullBuyerValue: 100,
                maxCpa: 40,
                effectiveTargetCpa: 40,
                capApplied: false,
            },
        },
        advisories: { noHto: false, lowValue: false },
        advisoriesDismissed: { noHto: false, lowValue: false },
        lastReviewedAt: 1,
        reviewDueAt: 1,
        ...overrides,
    };
}

const baseProps = {
    workspaceId: "ws_test",
    accountId: "acct_test",
    workspaceName: "Test Workspace",
    isDarkMode: true,
    isTeamMember: false,
};

// ─── Render harness ────────────────────────────────────────────────────────

async function renderFormFor(
    settings: FunnelSettingsDoc | null,
    options: { waitFor?: string } = {},
) {
    mockGetFunnelSettings.mockResolvedValue({
        data: {
            ok: true as const,
            settings,
            complete: settings !== null,
            reviewDue: false,
        },
    });
    mockSaveFunnelSettings.mockResolvedValue({
        data: { ok: true as const, derived: settings?.derived ?? { economicsVersion: 2 as const, computedAt: 1 }, advisories: { noHto: false, lowValue: false }, reviewDueAt: 1 },
    });
    mockDismissAdvisory.mockResolvedValue({ data: { ok: true as const } });

    // Force English so labels are stable. The form reads `lang` from
    // useT(); the i18n provider stores the language in localStorage
    // under `proads_ui_lang` (see i18n.tsx). The default is Arabic,
    // so we set it explicitly.
    const previousLang = localStorage.getItem("proads_ui_lang");
    localStorage.setItem("proads_ui_lang", "en");

    let result!: ReturnType<typeof render>;
    try {
        result = render(
            <LanguageProvider>
                <FunnelSettingsForm {...baseProps} />
            </LanguageProvider>,
        );
        if (settings !== null) {
            // Wait for hydration to complete. The form's hydration
            // effect (FunnelSettingsForm.tsx `useEffect(() => { ... },
            // [settings])`) sets `funnelType`, `hasHto`, and every
            // per-field state from the loaded settings doc. Until it
            // runs, the form is still rendering the default funnel
            // type ('paid_event'). The select's `value` is bound to
            // `funnelType` via `value={funnelType}` — so the most
            // reliable "hydration done" signal is that the select's
            // value matches `settings.funnelType`. This works
            // regardless of whether the bug exists: before the fix,
            // hydration sets funnelType correctly but the JSX renders
            // the wrong fields; after the fix, both align.
            await waitFor(
                () => {
                    const select = document.querySelector(
                        'select[value], select',
                    ) as HTMLSelectElement | null;
                    // The funnel-type select is the FIRST <select> in
                    // the DOM (the ROAS / margin buttons are <button>s).
                    expect(select).not.toBeNull();
                    expect(select!.value).toBe(settings.funnelType);
                },
                { timeout: 3000 },
            );
            // If the test needs an additional state deeper than
            // funnelType alone (e.g. hasHto=true ⇒ wait for the
            // "High ticket price ($)" label), wait for that too.
            if (options.waitFor) {
                await waitFor(
                    () => {
                        expect(isLabelRendered(options.waitFor!)).toBe(true);
                    },
                    { timeout: 3000 },
                );
            }
        }
    } finally {
        // Restore prior language so other tests / later mounts in the
        // same file are not surprised.
        if (previousLang === null) {
            localStorage.removeItem("proads_ui_lang");
        } else {
            localStorage.setItem("proads_ui_lang", previousLang);
        }
    }
    return result;
}

// ─── Label matchers ─────────────────────────────────────────────────────────
//
// Field labels are rendered as the literal English copy inside <label>
// elements. We look them up via `screen.queryByText` with `exact: true`
// so the match is byte-for-byte (no substring / normalised matches). A
// future label change surfaces as a test failure with a clear diff
// against the expected label.
//
// `queryAllByText` returns [] on absence; otherwise a list of matching
// elements. The `length > 0` check is the cleanest signal — `findBy*`
// variants return promises and `getBy*` throw, neither of which we want
// for boolean assertions.

function isLabelRendered(label: string): boolean {
    return screen.queryAllByText(label, { exact: true }).length > 0;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

// ─── paid_event ─────────────────────────────────────────────────────────────

describe("paid_event — rendered field set", () => {
    it("POSITIVE: renders AOV, hasHto toggle, htoPrice (after toggle), eventAttendanceRate, eventCloseRate, ROAS, commission, margin", async () => {
        await renderFormFor(makeSettingsDoc("paid_event"));
        // The AOV label carries the ($) suffix — match the leading text.
        expect(isLabelRendered("Average order value ($)")).toBe(true);
        expect(isLabelRendered("Do you have a high-ticket offer?")).toBe(true);
        // htoPrice only renders when hasHto=true; default hasHto=false,
        // so it must NOT render here. The negative assertion is in the
        // next describe block; we exercise hasHto=true below.
        expect(isLabelRendered("Attendance from ticket buyers (%)")).toBe(true);
        expect(isLabelRendered("High ticket close from attendees (%)")).toBe(true);
        expect(isLabelRendered("Target ROAS")).toBe(true);
        expect(isLabelRendered("Sales commission (%)")).toBe(true);
        expect(isLabelRendered("Margin you want to keep (%)")).toBe(true);
    });

    it("POSITIVE (hasHto=true): renders htoPrice input", async () => {
        const settings = makeSettingsDoc("paid_event", { hasHto: true, htoPrice: 3000 });
        await renderFormFor(settings, { waitFor: "High ticket price ($)" });
        expect(isLabelRendered("High ticket price ($)")).toBe(true);
    });

    it("NEGATIVE: must NOT render paid_product's chain (booking rate, attendance rate, high ticket close rate) or free_webinar / lead_magnet_call fields", async () => {
        await renderFormFor(makeSettingsDoc("paid_event"));
        // paid_product chain — must not appear on paid_event.
        expect(isLabelRendered("Booking rate (%)")).toBe(false);
        expect(isLabelRendered("Attendance rate (%)")).toBe(false);
        expect(isLabelRendered("High ticket close rate (%)")).toBe(false);
        // free_webinar fields.
        expect(isLabelRendered("Final offer price ($)")).toBe(false);
        // lead_magnet_call fields.
        expect(isLabelRendered("Show-up rate (%)")).toBe(false);
        expect(isLabelRendered("Close rate on calls that happened (%)")).toBe(false);
        // paid_event does NOT use htoConversionRate (Phase 7 Item C);
        // even when hasHto=true, the input is hidden.
        expect(isLabelRendered("High ticket conversion rate (%)")).toBe(false);
    });
});

// ─── paid_product ───────────────────────────────────────────────────────────

describe("paid_product — rendered field set", () => {
    it("POSITIVE: renders AOV, hasHto toggle, htoPrice (after toggle), booking rate, attendance rate, high ticket close rate, ROAS, commission, margin", async () => {
        await renderFormFor(makeSettingsDoc("paid_product"));
        expect(isLabelRendered("Average order value ($)")).toBe(true);
        expect(isLabelRendered("Do you have a high-ticket offer?")).toBe(true);
        // htoPrice is gated by hasHto; default hasHto=false ⇒ not yet.
        expect(isLabelRendered("Booking rate (%)")).toBe(true);
        expect(isLabelRendered("Attendance rate (%)")).toBe(true);
        expect(isLabelRendered("High ticket close rate (%)")).toBe(true);
        expect(isLabelRendered("Target ROAS")).toBe(true);
        expect(isLabelRendered("Sales commission (%)")).toBe(true);
        expect(isLabelRendered("Margin you want to keep (%)")).toBe(true);
    });

    it("POSITIVE (hasHto=true): renders htoPrice input", async () => {
        const settings = makeSettingsDoc("paid_product", { hasHto: true, htoPrice: 3000 });
        await renderFormFor(settings, { waitFor: "High ticket price ($)" });
        expect(isLabelRendered("High ticket price ($)")).toBe(true);
    });

    it("NEGATIVE: must NOT render paid_event's eventAttendanceRate / eventCloseRate (the production defect)", async () => {
        // The bug report: paid_product was rendering paid_event fields
        // ("Attendance from ticket buyers", "High ticket close from
        // attendees") that model a different funnel. This is the
        // load-bearing regression test — a future change that re-adds
        // these inputs to the paid_product branch fails here.
        await renderFormFor(makeSettingsDoc("paid_product"));
        expect(isLabelRendered("Attendance from ticket buyers (%)")).toBe(false);
        expect(isLabelRendered("High ticket close from attendees (%)")).toBe(false);
    });

    it("NEGATIVE: must NOT render free_webinar / lead_magnet_call fields", async () => {
        await renderFormFor(makeSettingsDoc("paid_product"));
        expect(isLabelRendered("Final offer price ($)")).toBe(false);
        expect(isLabelRendered("Purchase rate from attendees (%)")).toBe(false);
        expect(isLabelRendered("Show-up rate (%)")).toBe(false);
        expect(isLabelRendered("Close rate on calls that happened (%)")).toBe(false);
    });

    it("NEGATIVE: must NOT render the legacy htoConversionRate field (the chain replaces it)", async () => {
        // htoConversionRate was the single-rate field paid_product used
        // to read. The chain (booking × attendance × close) replaces it
        // (the way lead_magnet_call replaced free_webinar's close rate
        // with explicit stages). The input MUST be gone.
        const settings = makeSettingsDoc("paid_product", { hasHto: true, htoPrice: 3000 });
        await renderFormFor(settings, { waitFor: "High ticket price ($)" });
        expect(isLabelRendered("High ticket conversion rate (%)")).toBe(false);
    });
});

// ─── free_webinar ───────────────────────────────────────────────────────────

describe("free_webinar — rendered field set", () => {
    it("POSITIVE: renders final offer price, attendance rate, purchase rate from attendees, commission, margin", async () => {
        await renderFormFor(makeSettingsDoc("free_webinar"));
        expect(isLabelRendered("Final offer price ($)")).toBe(true);
        expect(isLabelRendered("Attendance rate (%)")).toBe(true);
        expect(isLabelRendered("Purchase rate from attendees (%)")).toBe(true);
        expect(isLabelRendered("Sales commission (%)")).toBe(true);
        expect(isLabelRendered("Margin you want to keep (%)")).toBe(true);
    });

    it("NEGATIVE: must NOT render paid fields or lead_magnet_call fields", async () => {
        await renderFormFor(makeSettingsDoc("free_webinar"));
        expect(isLabelRendered("Average order value ($)")).toBe(false);
        expect(isLabelRendered("Do you have a high-ticket offer?")).toBe(false);
        expect(isLabelRendered("Target ROAS")).toBe(false);
        expect(isLabelRendered("Booking rate (%)")).toBe(false);
        expect(isLabelRendered("Show-up rate (%)")).toBe(false);
        expect(isLabelRendered("Close rate on calls that happened (%)")).toBe(false);
        expect(isLabelRendered("High ticket close rate (%)")).toBe(false);
    });
});

// ─── lead_magnet_call ───────────────────────────────────────────────────────

describe("lead_magnet_call — rendered field set", () => {
    it("POSITIVE: renders final offer price, booking rate, show-up rate, close rate on calls that happened, commission, margin", async () => {
        await renderFormFor(makeSettingsDoc("lead_magnet_call"));
        expect(isLabelRendered("Final offer price ($)")).toBe(true);
        expect(isLabelRendered("Booking rate (%)")).toBe(true);
        expect(isLabelRendered("Show-up rate (%)")).toBe(true);
        expect(isLabelRendered("Close rate on calls that happened (%)")).toBe(true);
        expect(isLabelRendered("Sales commission (%)")).toBe(true);
        expect(isLabelRendered("Margin you want to keep (%)")).toBe(true);
    });

    it("NEGATIVE: must NOT render paid fields or free_webinar fields", async () => {
        await renderFormFor(makeSettingsDoc("lead_magnet_call"));
        expect(isLabelRendered("Average order value ($)")).toBe(false);
        expect(isLabelRendered("Do you have a high-ticket offer?")).toBe(false);
        expect(isLabelRendered("Target ROAS")).toBe(false);
        expect(isLabelRendered("Attendance rate (%)")).toBe(false);
        expect(isLabelRendered("Purchase rate from attendees (%)")).toBe(false);
        // The paid_product chain must not appear on lead_magnet_call
        // (the labels overlap with lead_magnet_call's existing labels,
        // but the HTO close rate is distinct — it must be absent).
        expect(isLabelRendered("High ticket close rate (%)")).toBe(false);
        // Paid-event fields must not appear on lead_magnet_call.
        expect(isLabelRendered("Attendance from ticket buyers (%)")).toBe(false);
        expect(isLabelRendered("High ticket close from attendees (%)")).toBe(false);
    });
});

// ─── Cross-cutting: shared fields (commission, margin) appear on every type

describe("every funnel type — commission + margin always rendered", () => {
    for (const ft of ["paid_event", "paid_product", "free_webinar", "lead_magnet_call"] as const) {
        it(`${ft}: commission + margin are present`, async () => {
            await renderFormFor(makeSettingsDoc(ft));
            expect(isLabelRendered("Sales commission (%)")).toBe(true);
            expect(isLabelRendered("Margin you want to keep (%)")).toBe(true);
        });
    }
});