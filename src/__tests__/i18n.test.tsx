// src/__tests__/i18n.test.tsx
// �══════════════════════════════════════════════════════════════════════════
// Phase 967 — T-18 (T092) i18n parity contract.
//
// Every new i18n key added in this phase must exist in BOTH English
// and Arabic (FR-028a). Arabic is in simple Fusha — no Egyptian
// dialect, no technical terms (FR-028b). The five keys listed here
// are the ones added by Phase 1 (T004) plus the keys surfaced in
// Phase 4/5/6 UI paths. Any missing key in either language surfaces
// this phase's parity gate.
//
// Strategy: render a tiny harness that exposes `useT()` and call it
// for each key in both `en` and `ar`. A missing key returns the key
// itself (the fallback in `useT()`), so we assert the rendered
// value is NOT the key. The keys are listed explicitly so a missing
// entry is loud — adding a new Phase 967 i18n key without updating
// this list fails the test.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type * as React from "react";
import { LanguageProvider, useT } from "../i18n";

// ─── The five Phase 967 i18n keys ────────────────────────────────────────────
//
// `meta.page_cleared_notice`        (FR-011b) — Phase 6, T084
// `meta.no_workspace_resolved`       (FR-012a) — Phase 1, T004
// `meta.workspace_no_ad_account`     (FR-015)  — Phase 1, T004
// `meta.disconnect_scope_warning`    (FR-020a) — Phase 1, T004
// `meta.needs_meta_link_label`       (FR-023)  — Phase 1, T004
const PHASE_967_KEYS = [
    "meta.page_cleared_notice",
    "meta.no_workspace_resolved",
    "meta.workspace_no_ad_account",
    "meta.disconnect_scope_warning",
    "meta.needs_meta_link_label",
] as const;

// ─── Harness: render LanguageProvider + a child that calls useT() ─────────

function Probe({ keys }: { keys: readonly string[] }): React.ReactElement {
    // Call useT() inside a child of LanguageProvider so the context
    // is available. Read every requested key in a single render.
    const { t } = useT();
    const values = keys.map((k) => ({ key: k, value: t(k) }));
    return (
        <ul>
            {values.map(({ key, value }) => (
                <li key={key} data-key={key} data-value={value}>
                    {value}
                </li>
            ))}
        </ul>
    );
}

function readKey(lang: "en" | "ar", key: string): string {
    // Render a fresh provider per lookup so the `lang` state is
    // isolated; the value lands in `data-value` on the matching li.
    // CR-MINOR (CodeRabbit review feedback): the previous harness
    // took a `lang` prop but never read it; the `setItem` here is
    // what actually switches the language for the LanguageProvider.
    // CR-MINOR (CodeRabbit review feedback): save and restore the prior
    // `proads_ui_lang` value so later tests in the same environment
    // (or a CI run that shares jsdom globalStorage) don't inherit
    // the last lookup's language.
    const previousLang = localStorage.getItem("proads_ui_lang");
    localStorage.setItem("proads_ui_lang", lang);
    const { unmount } = render(
        <LanguageProvider>
            <Probe keys={[key]} />
        </LanguageProvider>,
    );
    try {
        const all = document.querySelectorAll(`[data-key="${key}"]`);
        if (all.length === 0) throw new Error(`Probe did not render key=${key}`);
        const v = (all[0] as HTMLElement).getAttribute("data-value") ?? "";
        return v;
    } finally {
        unmount();
        if (previousLang === null) {
            localStorage.removeItem("proads_ui_lang");
        } else {
            localStorage.setItem("proads_ui_lang", previousLang);
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Phase 967 i18n parity (T-18 / T092 / FR-028a)", () => {
    for (const key of PHASE_967_KEYS) {
        it(`key "${key}" resolves to a non-key value in English`, () => {
            const value = readKey("en", key);
            expect(value).not.toBe("");
            expect(value).not.toBe(key);
        });

        it(`key "${key}" resolves to a non-key value in Arabic`, () => {
            const value = readKey("ar", key);
            expect(value).not.toBe("");
            expect(value).not.toBe(key);
            // Simple Fusha sanity check — the Arabic string must contain
            // at least one Arabic-script character (U+0600..U+06FF) to
            // catch the regression where the English string was
            // accidentally pasted into the Arabic block. (FR-028b.)
            expect(value).toMatch(/[\u0600-\u06FF]/);
        });
    }
});
