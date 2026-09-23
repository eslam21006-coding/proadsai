// src/__tests__/syncTimeout.test.tsx
// fix-sync-banner (round 2) — pins the client-side timeout config
// and the deadline-exceeded rethrow on `metaService.syncPerformance`.
// The 70 000 ms SDK default was the cause of the "Sync failed"
// banner on syncs whose server run was healthy and complete
// (investigation report §7). These tests are a regression guard:
// removing the `timeout: 540000` argument, or making
// `metaService.syncPerformance` swallow `deadline-exceeded`, will
// surface the symptom again on a long-running press.

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import type * as React from "react";
import { render } from "@testing-library/react";
import { LanguageProvider, useT } from "../i18n";

// ─── Mocks ─────────────────────────────────────────────────────
//
// Mock the firebase/functions SDK so we can capture the
// `httpsCallable` options each metaService method passes. The
// functions namespace is mocked below; the metaService module
// captures the options at httpsCallable time.

// Mock typing matches the real `httpsCallable` shape: the third
// arg is the `HttpsCallableOptions` object whose `timeout` field
// we want to assert. The mock's implementation ignores the args
// and returns a no-op callable; the assertions below inspect the
// recorded call args via `httpsCallableMock.mock.calls`.
const httpsCallableMock: MockInstance<
    (functionsInstance: unknown, name: string, options?: { timeout?: number }) => unknown
> = vi.fn(
    () => {
        return vi.fn().mockResolvedValue({
            data: { success: true, adsSynced: 0 },
        });
    },
);

vi.mock("firebase/functions", () => ({
    httpsCallable: httpsCallableMock,
}));

vi.mock("../firebase", () => ({
    functions: {},
}));

// ─── Helpers ───────────────────────────────────────────────────

interface HttpsCallableCall {
    name: string;
    options: unknown;
}

function getCallsFor(name: string): HttpsCallableCall[] {
    return httpsCallableMock.mock.calls
        .filter((call) => call[1] === name)
        .map((call) => ({ name: call[1] as string, options: call[2] }));
}

function readKey(lang: "en" | "ar", key: string): string {
    function Probe(): React.ReactElement {
        const { t } = useT();
        return <span data-value={t(key)}>{t(key)}</span>;
    }
    const previousLang = localStorage.getItem("proads_ui_lang");
    localStorage.setItem("proads_ui_lang", lang);
    let unmount: (() => void) | undefined;
    try {
        const result = render(
            <LanguageProvider>
                <Probe />
            </LanguageProvider>,
        );
        unmount = result.unmount;
        const node = document.querySelector(`[data-value]`);
        return node?.getAttribute("data-value") ?? "";
    } finally {
        if (unmount) unmount();
        if (previousLang === null) {
            localStorage.removeItem("proads_ui_lang");
        } else {
            localStorage.setItem("proads_ui_lang", previousLang);
        }
    }
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────

describe("fix-sync-banner (round 2): client-side httpsCallable timeout", () => {
    it("01: metaService.syncPerformance passes timeout: 540000 to httpsCallable", async () => {
        // Force the module to evaluate and capture the httpsCallable
        // options by calling syncPerformance once. The mock returns a
        // resolved promise so the await completes immediately.
        const { metaService } = await import("../services/metaService");
        await metaService.syncPerformance(null);
        const calls = getCallsFor("metaSyncPerformance");
        expect(calls.length).toBeGreaterThan(0);
        // The SDK default is 70 000 ms — anything less than the
        // server's `timeoutSeconds: 540` ceiling reproduces the bug.
        const opts = calls[0]?.options as { timeout?: number } | undefined;
        expect(opts?.timeout).toBe(540000);
    });

    it("02: metaService.triggerWorkspaceSync passes timeout: 540000 to httpsCallable", async () => {
        const { metaService } = await import("../services/metaService");
        await metaService.triggerWorkspaceSync("ws_test");
        const calls = getCallsFor("triggerMetaSync");
        expect(calls.length).toBeGreaterThan(0);
        const opts = calls[0]?.options as { timeout?: number } | undefined;
        expect(opts?.timeout).toBe(540000);
    });

    it("03: metaService.syncPerformance rethrows on deadline-exceeded (so handleSyncMeta's catch can route it)", async () => {
        // Replace the mock with one that rejects with a
        // Firebase-shaped error carrying the deadline-exceeded code.
        const deadlineError = Object.assign(new Error("DEADLINE_EXCEEDED"), {
            code: "functions/deadline-exceeded",
            details: undefined,
            message: "DEADLINE_EXCEEDED: ...",
        });
        httpsCallableMock.mockImplementationOnce(() =>
            vi.fn().mockRejectedValue(deadlineError),
        );
        const { metaService } = await import("../services/metaService");
        let caught: unknown = null;
        try {
            await metaService.syncPerformance(null);
        } catch (err) {
            caught = err;
        }
        // The new contract: rethrow deadline-exceeded, do not swallow
        // into { success: false }. The sidebar's handleSyncMeta catch
        // routes the rethrown error to the still_running toast.
        expect(caught).not.toBeNull();
        expect((caught as { code?: string })?.code).toBe(
            "functions/deadline-exceeded",
        );
    });

    it("04: metaService.syncPerformance still swallows non-timeout errors (back-compat)", async () => {
        // A network reset / not-found / auth error keeps the
        // previous behaviour — the sidebar had no separate UI surface
        // for those and still does not.
        const networkError = Object.assign(new Error("Network down"), {
            code: "functions/unavailable",
            message: "unavailable: ...",
        });
        httpsCallableMock.mockImplementationOnce(() =>
            vi.fn().mockRejectedValue(networkError),
        );
        const { metaService } = await import("../services/metaService");
        const result = await metaService.syncPerformance(null);
        expect(result.success).toBe(false);
        expect(result.adsSynced).toBe(0);
    });

    it("05 (PR #75 review): metaService.syncPerformance rethrows on failed-precondition so the busy catch branch in handleSyncMeta is reachable", async () => {
        // PR #75 review (CodeRabbit + Codex parallel finding).
        // The round-1 helper's catch only rethrew deadline-exceeded;
        // a busy-lease collision from the server's
        // `functions/failed-precondition` was swallowed into
        // `{ success: false, adsSynced: 0 }` and the busy toast
        // branch in App.tsx:4289 became dead code. Without this
        // rethrow, a second concurrent press renders "Sync failed"
        // (the old hard-fail toast) instead of the busy state.
        const busyError = Object.assign(
            new Error("A Meta sync is already running for this account."),
            {
                code: "functions/failed-precondition",
                details: undefined,
                message: "failed-precondition: A Meta sync is already running for this account.",
            },
        );
        httpsCallableMock.mockImplementationOnce(() =>
            vi.fn().mockRejectedValue(busyError),
        );
        const { metaService } = await import("../services/metaService");
        let caught: unknown = null;
        try {
            await metaService.syncPerformance(null);
        } catch (err) {
            caught = err;
        }
        expect(caught).not.toBeNull();
        expect((caught as { code?: string })?.code).toBe(
            "functions/failed-precondition",
        );
    });

    it("06 (PR #75 review): metaService.syncPerformance rethrows the unprefixed 'deadline-exceeded' code as well", async () => {
        // Symmetric to test 03 — the SDK prefixes some error codes
        // with `functions/` and leaves others bare. The rethrow
        // contract must accept both shapes; without this assertion,
        // a future refactor that drops the unprefixed branch would
        // silently re-introduce the round-1 swallow bug for some
        // SDK versions.
        const unprefixedError = Object.assign(new Error("DEADLINE_EXCEEDED"), {
            code: "deadline-exceeded",
            message: "DEADLINE_EXCEEDED: ...",
        });
        httpsCallableMock.mockImplementationOnce(() =>
            vi.fn().mockRejectedValue(unprefixedError),
        );
        const { metaService } = await import("../services/metaService");
        let caught: unknown = null;
        try {
            await metaService.syncPerformance(null);
        } catch (err) {
            caught = err;
        }
        expect(caught).not.toBeNull();
        expect((caught as { code?: string })?.code).toBe("deadline-exceeded");
    });
});

describe("fix-sync-banner (round 2): i18n parity for sync.result.still_running", () => {
    it("EN: sync.result.still_running resolves to a non-key string", () => {
        const value = readKey("en", "sync.result.still_running");
        expect(value).not.toBe("");
        expect(value).not.toBe("sync.result.still_running");
        // Must NOT be the same wording as `failed` or `busy`.
        expect(value).not.toBe(readKey("en", "sync.result.failed"));
        expect(value).not.toBe(readKey("en", "sync.result.busy"));
    });

    it("AR: sync.result.still_running resolves to a non-key string with Arabic script", () => {
        const value = readKey("ar", "sync.result.still_running");
        expect(value).not.toBe("");
        expect(value).not.toBe("sync.result.still_running");
        expect(value).toMatch(/[\u0600-\u06FF]/);
        expect(value).not.toBe(readKey("ar", "sync.result.failed"));
        expect(value).not.toBe(readKey("ar", "sync.result.busy"));
    });
});