// src/__tests__/whatsWorkingMultiFunnel.test.tsx
// FR-041 (Phase 969 T056 + T057) — multi-funnel indication on the
// "What's Working" dashboard's strongest-angle and strongest-visual rows.
//
// Three assertions:
//
//   1. Backend → frontend: the dashboard renders the label ONLY when
//      `StrongestAngle.multiFunnel` (or `StrongestVisual.multiFunnel`)
//      is true. A label that always shows is the same defect as one
//      that never does. The test mounts two rows side-by-side (one
//      multi-funnel, one not) and asserts the label text appears
//      exactly once — for the row whose flag is true.
//
//   2. Bilingual: switching the language to Arabic renders the
//      byte-identical Arabic string from `whats_working.multi_funnel.label`,
//      not the English string. The language toggle is the live runtime
//      switch used by the app.
//
//   3. SC-010 (spec §6.1): reading `src/i18n.tsx` directly, the four
//      conditions hold for every key introduced by this feature:
//        (a) the key exists in the EN block,
//        (b) the key exists in the AR block,
//        (c) neither value contains a forbidden technical term
//            (CTR / CPM / CPA / CPL / % / متوسط / ميديان),
//        (d) the Arabic value contains Arabic Unicode characters and
//            no Latin-digits-percentage-mixed-in (light sanity — the
//            exact wording is owner-approved per batch-16 §2).
//
// Per the user's review (2026-09-06), SC-010 passing is necessary but
// not sufficient: it confirms the strings EXIST in both languages and
// carry no jargon; whether the Fusha reads naturally to a Gulf coach
// was the owner's judgement and has been given.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, cleanup, act } from "@testing-library/react";
import type * as React from "react";
import { LanguageProvider, useT } from "../i18n";
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

// ─── Backend-shaped fixture rows ─────────────────────────────────

const baseSyncStatus = {
    lastMetaSyncAt: 1_700_000_000_000,
    nextScheduledSyncAt: null,
    connection: "connected" as const,
    canSyncNow: true,
    cooldownEndsAt: null,
};

const baseSummary = {
    spend7dLabel: "Spend (last 7 days)",
    totalSpend7d: 100,
    currency: "USD",
    matchedAds: 50,
    totalAds: 100,
    green: 30,
    yellow: 15,
    red: 5,
};

const baseProps = {
    workspaceId: "ws_test",
    accountId: "acct_test",
    onReconnect: vi.fn(),
    onConnect: vi.fn(),
    onLinkAd: vi.fn(),
    onClose: vi.fn(),
    onSyncNow: vi.fn((): Promise<DashboardResultPayload> => Promise.resolve({
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
    })),
};

// Two angles: one used across both conversion + other funnels (true),
// one used only in conversion funnels (false). Same shape for visuals.
const strongestAnglesFixture = [
    {
        angleKey: "urgency",
        nameAr: "الاستعجال",
        icon: "🔥" as const,
        countAr: "Used 12 times",
        multiFunnel: true,    // ← spans both conversion and other
    },
    {
        angleKey: "logic",
        nameAr: "المنطق",
        icon: "✅" as const,
        countAr: "Used 8 times",
        multiFunnel: false,   // ← only conversion
    },
];

const strongestVisualsFixture = [
    {
        patternKey: "pk1",
        descriptionAr: "Hero + Urgency",
        icon: "🔥" as const,
        countAr: "Used 14 times",
        multiFunnel: true,    // ← spans both
    },
    {
        patternKey: "pk2",
        descriptionAr: "Hero + Testimonial",
        icon: "✅" as const,
        countAr: "Used 5 times",
        multiFunnel: false,   // ← only conversion
    },
];

interface RenderHandle {
    setLang: (lang: "en" | "ar") => Promise<void>;
}

async function renderDashboardForFixture(): Promise<RenderHandle> {
    mockGetWhatsWorkingDashboard.mockResolvedValue({
        data: {
            ok: true as const,
            syncStatus: baseSyncStatus,
            summary: baseSummary,
            strongestAngles: strongestAnglesFixture,
            strongestVisuals: strongestVisualsFixture,
            unmatchedAds: [],
            recentVerdicts: [],
        },
    });

    // The LanguageProvider reads the language from localStorage on first
    // render. `en` is the default if no entry exists.
    localStorage.setItem("proads_ui_lang", "en");

    function LangToggleProbe(): React.ReactElement {
        const { lang, setLang } = useT();
        return (
            <button
                data-testid="language-switch-probe"
                data-current-lang={lang}
                onClick={() => setLang(lang === "en" ? "ar" : "en")}
            >
                switch
            </button>
        );
    }

    render(
        <LanguageProvider>
            <LangToggleProbe />
            <WhatsWorkingDashboard {...baseProps} />
        </LanguageProvider>,
    );
    await screen.findByRole("button", { name: /sync now/i }, { timeout: 3000 });

    return {
        setLang: async (target: "en" | "ar") => {
            // Read the live current language from the probe each time so the
            // closure doesn't cache a stale value across multiple switches.
            const probe = screen.getByTestId("language-switch-probe");
            const cur = probe.getAttribute("data-current-lang");
            if (cur === target) return;
            await act(async () => {
                probe.click();
            });
            // After click, the data-current-lang attribute reflects the new lang.
            const after = screen.getByTestId("language-switch-probe").getAttribute("data-current-lang");
            if (after !== target) {
                throw new Error(`Failed to set lang to ${target} (still ${after})`);
            }
        },
    };
}

// ─── §1 — Both-directions: label appears iff multiFunnel is true ──

describe("multi-funnel label: renders ONLY when StrongestAngle/Visual.multiFunnel is true (both directions)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it("EN: label 'Across multiple campaigns' is rendered for true rows, NOT for false rows", async () => {
        await renderDashboardForFixture();
        const labelText = "Across multiple campaigns";
        // The Spanish Inquisition defence: count EXACT occurrences.
        // Two true rows (one angle, one visual) → exactly two instances.
        const allMatches = screen.queryAllByText(labelText, { exact: true });
        expect(allMatches.length).toBe(2);
        // Both should be inside an element with the tooltip title attribute.
        for (const el of allMatches) {
            const title = el.getAttribute("title");
            expect(title).toBe("You've used this across more than one type of campaign");
        }
    });

    it("AR: after language switch, label 'في حملات متعددة' renders for true rows, NOT for false rows", async () => {
        const h = await renderDashboardForFixture();
        await h.setLang("ar");
        // The label is the byte-identical Arabic from the owner-approved text.
        const arLabel = "في حملات متعددة";
        const allMatches = screen.queryAllByText(arLabel, { exact: true });
        // Two true rows (one angle, one visual) → exactly two instances.
        expect(allMatches.length).toBe(2);
        // EN label should NOT be present — language-switch is the live runtime toggle.
        expect(screen.queryAllByText("Across multiple campaigns", { exact: true }).length).toBe(0);
        for (const el of allMatches) {
            const title = el.getAttribute("title");
            expect(title).toBe("استخدمتَ هذا الأسلوب في أكثر من نوع من الحملات");
        }
    });

    it("a label that always renders (or never renders) would have failed this — single-direction defect guard", async () => {
        // This is the negative-side guard the review specifically called out:
        // "A label that always shows is the same defect as one that never does."
        // We assert the count IS 2, NOT 0, NOT 4. If the conditional in
        // AngleRow / VisualRow were lost, we'd see 4 (all rows show the
        // label). If the conditional were inverted (false → show, true →
        // hide), we'd also see 2 but the assertion in the first test
        // would fail on which rows carry the label.
        await renderDashboardForFixture();
        const allMatches = screen.queryAllByText("Across multiple campaigns", { exact: true });
        // Total rows in the fixture: 2 angles + 2 visuals = 4.
        // multiFunnel: true rows: 1 angle + 1 visual = 2.
        // 4 would be "always shows"; 0 would be "never shows".
        expect(allMatches.length).toBe(2);
        // And verify the rows that have multiFunnel=false carry no label
        // ANYWHERE in their rendered tree (not just their direct children).
        // By name: "Logic" and "Hero + Testimonial" rows must not contain
        // the label text.
        const logicRow = screen.getByText("المنطق").closest("div.bg-slate-900\\/30");
        expect(logicRow).not.toBeNull();
        expect(logicRow!.textContent).not.toContain("Across multiple campaigns");
        const heroTestRow = screen.getByText("Hero + Testimonial").closest("div.bg-slate-900\\/30");
        expect(heroTestRow).not.toBeNull();
        expect(heroTestRow!.textContent).not.toContain("Across multiple campaigns");
    });
});

// ─── §2 — SC-010 (spec §6.1): bilingual key coverage + zero jargon ──

describe("SC-010 (FR-041 multi-funnel): keys exist in both languages, no jargon, no measurement values", () => {
    // Read i18n.tsx as text. Two passes:
    //   - The EN block is the FIRST `{ en: { ... }, ar: { ... } }`
    //     appearance; we search before the `ar: {` marker for the keys.
    //   - The AR block is everything after `ar: {`.
    // We split on the literal `    ar: {` line (4-space indent is the
    // convention used throughout this file) and treat the first piece
    // as EN-content and the second piece as AR-content.

    const I18N_PATH = path.resolve(__dirname, "..", "i18n.tsx");
    const I18N_TEXT = fs.readFileSync(I18N_PATH, "utf8");

    const KEYS_THIS_FEATURE_INTRODUCES = [
        "whats_working.multi_funnel.label",
        "whats_working.multi_funnel.tooltip",
    ] as const;

    // Owner-approved text — byte-identical to the rendered output. The
    // test compares STRINGS by value, not by source location, so the
    // exact position in i18n.tsx does not matter; what matters is that
    // the value reads back as exactly this string in the right block.
    const APPROVED_EN: Record<typeof KEYS_THIS_FEATURE_INTRODUCES[number], string> = {
        "whats_working.multi_funnel.label": "Across multiple campaigns",
        "whats_working.multi_funnel.tooltip": "You've used this across more than one type of campaign",
    };
    const APPROVED_AR: Record<typeof KEYS_THIS_FEATURE_INTRODUCES[number], string> = {
        "whats_working.multi_funnel.label": "في حملات متعددة",
        "whats_working.multi_funnel.tooltip": "استخدمتَ هذا الأسلوب في أكثر من نوع من الحملات",
    };

    function escapeRegExp(s: string): string {
        // Escape every regex metacharacter by prefixing it with a single
        // backslash. Use a function replacement so we don't tangle with
        // `$&` / `$1` / `$$` semantics of `String.prototype.replace`.
        return s.replace(/[.*+?^${}()|[\]\\]/g, (m) => "\\" + m);
    }

    function extractLangBlock(text: string, langKey: "en" | "ar"): { content: string; index: number } {
        // The translation file uses `    en: {` and `    ar: {` to mark
        // blocks. We find the FIRST occurrence of the target key and read
        // until the matching close brace at the same indent.
        const openMarker = `    ${langKey}: {`;
        const openIdx = text.indexOf(openMarker);
        if (openIdx < 0) throw new Error(`Cannot find ${langKey} block in ${I18N_PATH}`);
        const contentStart = openIdx + openMarker.length;
        // Walk braces from this point.
        let depth = 1;
        let i = contentStart;
        while (i < text.length && depth > 0) {
            const c = text[i];
            if (c === "{") depth++;
            else if (c === "}") depth--;
            i++;
        }
        const content = text.slice(contentStart, i - 1);
        return { content, index: openIdx };
    }

    function readKey(text: string, key: string): { value: string | null; block: string } {
        const re = new RegExp(
            "(['\"])" + escapeRegExp(key) + "\\1:\\s*(['\"`])([^\\\\]*?)\\2",
            "m",
        );
        const m = text.match(re);
        if (m) return { value: m[3], block: m[0] };
        return { value: null, block: "" };
    }

    it("every key this feature introduces has both an EN and an AR entry (bilingual presence)", () => {
        const enBlock = extractLangBlock(I18N_TEXT, "en").content;
        const arBlock = extractLangBlock(I18N_TEXT, "ar").content;
        for (const key of KEYS_THIS_FEATURE_INTRODUCES) {
            const enResult = readKey(enBlock, key);
            const arResult = readKey(arBlock, key);
            expect(enResult.value, `EN entry must exist for ${key}`).not.toBeNull();
            expect(arResult.value, `AR entry must exist for ${key}`).not.toBeNull();
            // Each block must contain a positive-length value.
            expect(enResult.value!.length, `EN ${key} value must be non-empty`).toBeGreaterThan(0);
            expect(arResult.value!.length, `AR ${key} value must be non-empty`).toBeGreaterThan(0);
        }
    });

    it("values read back as exactly the owner-approved byte-identical text", () => {
        const enBlock = extractLangBlock(I18N_TEXT, "en").content;
        const arBlock = extractLangBlock(I18N_TEXT, "ar").content;
        for (const key of KEYS_THIS_FEATURE_INTRODUCES) {
            expect(readKey(enBlock, key).value).toBe(APPROVED_EN[key]);
            expect(readKey(arBlock, key).value).toBe(APPROVED_AR[key]);
        }
    });

    it("EN and AR values contain ZERO advertising jargon or measurement values (SC-010 second half)", () => {
        const enBlock = extractLangBlock(I18N_TEXT, "en").content;
        const arBlock = extractLangBlock(I18N_TEXT, "ar").content;
        const FORBIDDEN = ["CTR", "CPM", "CPA", "CPL", "%", "متوسط", "ميديان"];
        // Numbers aren't forbidden in the spec; percentages (the "%" sign)
        // are, and so is technical jargon. A plain word like "Used 14 times"
        // is fine — that's another key's value.
        for (const key of KEYS_THIS_FEATURE_INTRODUCES) {
            const enValue = readKey(enBlock, key).value!;
            const arValue = readKey(arBlock, key).value!;
            for (const f of FORBIDDEN) {
                expect(enValue.includes(f), `EN ${key} contains forbidden "${f}": ${enValue}`).toBe(false);
                expect(arValue.includes(f), `AR ${key} contains forbidden "${f}": ${arValue}`).toBe(false);
            }
        }
    });

    it("AR values contain Arabic Unicode (no English-only drift)", () => {
        const arBlock = extractLangBlock(I18N_TEXT, "ar").content;
        // Light sanity: must contain Arabic Unicode codepoints (U+0600..U+06FF).
        // Does NOT check for the FORBIDDEN list (the previous test does) —
        // this one asserts presence-of-Arabic so a Cyrillic-look-alike or
        // straight-ASCII defect would be caught.
        for (const key of KEYS_THIS_FEATURE_INTRODUCES) {
            const arValue = readKey(arBlock, key).value!;
            expect(arValue, `AR ${key} must contain Arabic Unicode characters`).toMatch(/[\u0600-\u06FF]/);
        }
    });
});
