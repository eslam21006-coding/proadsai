// src/__tests__/whatsWorkingDashboardRender.test.tsx
// PHASE 970 (bug 2026-09-03) production regression test.
//
// The dashboard's SYNC NOW button had no user feedback. The toast
// was hidden behind the modal (same z-index), and the SyncStatusBar
// did not show a pending state. This file mount-tests the dashboard
// with a stubbed parent and verifies the post-fix render surface:
//
//   - in-flight press: button disabled + spinner + Syncing... label
//   - busy result: separate result key, distinct localised string
//   - done/partial/more_coming/failed: each renders its own string
//   - no banner when lastResult is null
//
// Source: specs/970-sync-unification/reports/bug-2026-09-03-dashboard-no-feedback.md

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import type * as React from "react";
import { LanguageProvider } from "../i18n";
import WhatsWorkingDashboard, {
    type DashboardResultPayload,
} from "../components/WhatsWorkingDashboard";

const mockGetWhatsWorkingDashboard = vi.fn();

vi.mock("firebase/functions", () => ({
    httpsCallable: vi.fn((_functions: unknown, name: string) => {
        if (name === "getWhatsWorkingDashboard") return mockGetWhatsWorkingDashboard;
        return vi.fn().mockResolvedValue({ data: { ok: true } });
    }),
}));

vi.mock("../firebase", () => ({
    functions: {},
}));

const baseDashboardData = {
    syncStatus: {
        lastMetaSyncAt: 1_700_000_000_000,
        nextScheduledSyncAt: null,
        connection: "connected" as const,
        canSyncNow: true,
        cooldownEndsAt: null,
    },
    summary: {
        spend7dLabel: "Spend (last 7 days)",
        totalSpend7d: 100,
        currency: "USD",
        matchedAds: 50,
        totalAds: 100,
        green: 30,
        yellow: 15,
        red: 5,
    },
    strongestAngles: [],
    strongestVisuals: [],
    unmatchedAds: [],
    recentVerdicts: [],
};

const baseProps = {
    workspaceId: "ws_test",
    accountId: "acct_test",
    onReconnect: vi.fn(),
    onConnect: vi.fn(),
    onLinkAd: vi.fn(),
    onClose: vi.fn(),
};

interface PressController {
    beginPending: () => void;
    completeNextWith: (result: DashboardResultPayload) => void;
    press: () => Promise<void>;
    complete: (result: DashboardResultPayload) => Promise<void>;
}

interface RenderHandle {
    press: PressController;
    injectResult: (result: DashboardResultPayload) => Promise<void>;
}

async function renderDashboard(): Promise<RenderHandle> {
    mockGetWhatsWorkingDashboard.mockResolvedValue({
        data: { ok: true as const, ...baseDashboardData },
    });

    const previousLang = localStorage.getItem("proads_ui_lang");
    localStorage.setItem("proads_ui_lang", "en");

    let mode: "pending" | "immediate" = "immediate";
    let payload: DashboardResultPayload = {
        ok: true,
        busy: false,
        ads: 0,
        matched: 0,
        ambiguous: 0,
        unmatched: 0,
        legacyRateLimited: [],
        workspaceQueued: 0,
        workspaceRateLimited: [],
        needsReauth: false,
        resultKey: "sync.result.done" as const,
    };
    let resolvePending: (() => void) | null = null;
    const onSyncNow = vi.fn((): Promise<DashboardResultPayload> => {
        if (mode === "pending") {
            return new Promise<DashboardResultPayload>((resolve) => {
                resolvePending = () => resolve(payload);
            });
        }
        return Promise.resolve(payload);
    });

    let result!: ReturnType<typeof render>;
    try {
        result = render(
            <LanguageProvider>
                <WhatsWorkingDashboard
                    {...baseProps}
                    onSyncNow={onSyncNow}
                />
            </LanguageProvider>,
        );
        await screen.findByRole("button", { name: /sync now/i }, { timeout: 3000 });
    } catch (e) {
        if (previousLang === null) {
            localStorage.removeItem("proads_ui_lang");
        } else {
            localStorage.setItem("proads_ui_lang", previousLang);
        }
        throw e;
    }
    void previousLang;

    return {
        press: {
            beginPending: () => {
                mode = "pending";
                resolvePending = null;
            },
            completeNextWith: (next) => {
                mode = "immediate";
                payload = next;
                resolvePending = null;
            },
            press: async () => {
                const button = await screen.findByRole("button", { name: /sync now/i });
                act(() => {
                    button.click();
                });
                await new Promise<void>((r) => setTimeout(r, 0));
            },
            complete: async (next) => {
                if (resolvePending === null) {
                    throw new Error("no pending press to complete");
                }
                payload = next;
                resolvePending();
                resolvePending = null;
                await new Promise<void>((r) => setTimeout(r, 0));
            },
        },
        injectResult: async (next) => {
            mode = "immediate";
            payload = next;
            resolvePending = null;
            const button = await screen.findByRole("button", { name: /sync now/i });
            act(() => {
                button.click();
            });
            await new Promise<void>((r) => setTimeout(r, 0));
        },
    };
}

function isTextRendered(text: string): boolean {
    return screen.queryAllByText(text, { exact: true }).length > 0;
}

function getSyncButton(): HTMLButtonElement | null {
    return screen.queryByRole("button", { name: /sync now|syncing\.\.\./i });
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

describe("pending state: in-flight press gates the button", () => {
    it("idle: button is enabled and shows the Sync Now label, no spinner", async () => {
        const { press } = await renderDashboard();
        const button = getSyncButton();
        expect(button).not.toBeNull();
        expect(button!.disabled).toBe(false);
        expect(button!.getAttribute("aria-busy")).toBe("false");
        expect(button!.textContent).toMatch(/Sync Now/);
        const spinner = button!.querySelector(".fa-spin");
        expect(spinner).toBeNull();
        expect(isTextRendered("Ads updated")).toBe(false);
    });

    it("in-flight press: button is disabled with Syncing... label and spinner", async () => {
        const { press } = await renderDashboard();
        press.beginPending();
        await press.press();
        const button = getSyncButton();
        expect(button).not.toBeNull();
        expect(button!.disabled).toBe(true);
        expect(button!.getAttribute("aria-busy")).toBe("true");
        expect(button!.textContent).toMatch(/Syncing\.\.\./);
        const spinner = button!.querySelector(".fa-arrows-rotate");
        expect(spinner).not.toBeNull();
        expect(spinner!.classList.contains("fa-spin")).toBe(true);
    });
});

describe("result banner: absent when no press has happened", () => {
    it("no banner is rendered when no press has happened", async () => {
        await renderDashboard();
        expect(isTextRendered("Ads updated")).toBe(false);
        expect(isTextRendered("Some accounts were busy — they will update shortly")).toBe(false);
        expect(isTextRendered("The rest of your workspaces are updating now")).toBe(false);
        expect(isTextRendered("Could not update the ads")).toBe(false);
        expect(isTextRendered("A sync is already running. Please wait a moment and try again.")).toBe(false);
    });
});

describe("result banner: busy case (lease collision)", () => {
    it("busy result: A sync is already running... banner is rendered (EN)", async () => {
        const { injectResult } = await renderDashboard();
        await injectResult({
            ok: false,
            busy: true,
            ads: 0,
            matched: 0,
            ambiguous: 0,
            unmatched: 0,
            legacyRateLimited: [],
            workspaceQueued: 0,
            workspaceRateLimited: [],
            needsReauth: false,
            resultKey: "sync.result.busy" as const,
        });
        expect(isTextRendered("A sync is already running. Please wait a moment and try again.")).toBe(true);
    });

    it("busy banner does NOT show the failed string (distinct result key)", async () => {
        const { injectResult } = await renderDashboard();
        await injectResult({
            ok: false,
            busy: true,
            ads: 0,
            matched: 0,
            ambiguous: 0,
            unmatched: 0,
            legacyRateLimited: [],
            workspaceQueued: 0,
            workspaceRateLimited: [],
            needsReauth: false,
            resultKey: "sync.result.busy" as const,
        });
        expect(isTextRendered("Could not update the ads")).toBe(false);
    });
});

describe("result banner: other resultKey values", () => {
    it("done: Ads updated is rendered (EN)", async () => {
        const { injectResult } = await renderDashboard();
        await injectResult({
            ok: true,
            busy: false,
            ads: 100,
            matched: 50,
            ambiguous: 5,
            unmatched: 45,
            legacyRateLimited: [],
            workspaceQueued: 0,
            workspaceRateLimited: [],
            needsReauth: false,
            resultKey: "sync.result.done" as const,
        });
        expect(isTextRendered("Ads updated")).toBe(true);
    });

    it("partial: Some accounts were busy... is rendered (EN)", async () => {
        const { injectResult } = await renderDashboard();
        await injectResult({
            ok: true,
            busy: false,
            ads: 100,
            matched: 50,
            ambiguous: 5,
            unmatched: 45,
            legacyRateLimited: ["act_AAA"],
            workspaceQueued: 0,
            workspaceRateLimited: [],
            needsReauth: false,
            resultKey: "sync.result.partial" as const,
        });
        expect(isTextRendered("Some accounts were busy — they will update shortly")).toBe(true);
        expect(isTextRendered("Ads updated")).toBe(false);
    });

    it("more_coming: The rest of your workspaces... is rendered (EN)", async () => {
        const { injectResult } = await renderDashboard();
        await injectResult({
            ok: true,
            busy: false,
            ads: 100,
            matched: 50,
            ambiguous: 5,
            unmatched: 45,
            legacyRateLimited: [],
            workspaceQueued: 3,
            workspaceRateLimited: [],
            needsReauth: false,
            resultKey: "sync.result.more_coming" as const,
        });
        expect(isTextRendered("The rest of your workspaces are updating now")).toBe(true);
        expect(isTextRendered("Some accounts were busy — they will update shortly")).toBe(false);
    });

    it("failed: Could not update the ads is rendered (EN)", async () => {
        const { injectResult } = await renderDashboard();
        await injectResult({
            ok: false,
            busy: false,
            ads: 0,
            matched: 0,
            ambiguous: 0,
            unmatched: 0,
            legacyRateLimited: [],
            workspaceQueued: 0,
            workspaceRateLimited: [],
            needsReauth: false,
            resultKey: "sync.result.failed" as const,
        });
        expect(isTextRendered("Could not update the ads")).toBe(true);
        expect(isTextRendered("A sync is already running. Please wait a moment and try again.")).toBe(false);
    });
});

describe("result banner: five distinct strings, never cross-leak", () => {
    for (const resultKey of [
        "sync.result.done",
        "sync.result.partial",
        "sync.result.more_coming",
        "sync.result.failed",
        "sync.result.busy",
    ] as const) {
        it(`${resultKey}: exactly one banner string is rendered (no cross-leak)`, async () => {
            const bannerStrings: Record<typeof resultKey, string> = {
                "sync.result.done": "Ads updated",
                "sync.result.partial": "Some accounts were busy — they will update shortly",
                "sync.result.more_coming": "The rest of your workspaces are updating now",
                "sync.result.failed": "Could not update the ads",
                "sync.result.busy": "A sync is already running. Please wait a moment and try again.",
            };
            const expected = bannerStrings[resultKey];
            const { injectResult } = await renderDashboard();
            await injectResult({
                ok: resultKey !== "sync.result.failed",
                busy: resultKey === "sync.result.busy",
                ads: 0,
                matched: 0,
                ambiguous: 0,
                unmatched: 0,
                legacyRateLimited: resultKey === "sync.result.partial" ? ["act_AAA"] : [],
                workspaceQueued: resultKey === "sync.result.more_coming" ? 3 : 0,
                workspaceRateLimited: [],
                needsReauth: false,
                resultKey,
            });
            for (const s of Object.values(bannerStrings)) {
                if (s === expected) {
                    expect(isTextRendered(s)).toBe(true);
                } else {
                    expect(isTextRendered(s)).toBe(false);
                }
            }
        });
    }
});
