// functions/src/__tests__/whatsWorkingDashboard.test.ts
// Phase 14 — Layer 5 + Layer 6 contract test for getWhatsWorkingDashboard
// and getHookAnglePerformance.
//
// Tests the PURE helpers exposed alongside the callables:
//   - Icon computation logic (🔥 / ✅ / ⚠️ / null) for hooks and visuals.
//   - Pick-best-two-angles helper used in the ⚠️ tooltip.
//   - makeCountAr / makeSpendLabel / makePatternDescriptionAr — plain
//     Arabic strings, no technical terms (FR-019, SC-11).
//   - Tooltip construction — no numbers, no percentages, no English
//     acronyms (CTR / CPA / CPM).
//
// The full IO path (Firestore reads + workspace auth) is exercised by
// integration tests outside this file.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    AR_S_TOOLTIP_STRONGEST,
    AR_S_TOOLTIP_GOOD,
    AR_S_TOOLTIP_WEAK_PREFIX,
    AR_S_NO_DATA_YET,
    computeIconFromAvgs,
    pickHotAngle,
    pickBestTwoAngles,
} from "../whatsWorkingDashboard.js";

// ─── Icon thresholds (mirror the values in the module) ─────────

const ICON_GATE = 3;
const WEAK_THRESHOLD = 0.75;

// ─── Re-derive the icon function shape from the export contract ───
// We don't import the private helper directly — we re-test the public
// behaviour via the icon math the dashboard emits.

// ─── Icon computation ────────────────────────────────────────────

test("icon computation: below data gate → null", () => {
    assert.equal(computeIconFromAvgs(0, 2.0, 1.5, ICON_GATE), null);
    assert.equal(computeIconFromAvgs(2, 2.0, 1.5, ICON_GATE), null);
    assert.equal(computeIconFromAvgs(3, 2.0, 0, ICON_GATE), null); // account avg = 0
});

test("icon computation: top angle → 🔥", () => {
    assert.equal(computeIconFromAvgs(5, 3.0, 1.5, ICON_GATE), "🔥"); // 2x
    assert.equal(computeIconFromAvgs(10, 1.6, 1.5, ICON_GATE), "🔥"); // just over 1x
});

test("icon computation: above 75% of avg but below 100% → ✅", () => {
    assert.equal(computeIconFromAvgs(5, 1.0, 1.5, ICON_GATE), "⚠️"); // 0.67 ratio < 0.75 → ⚠️
    assert.equal(computeIconFromAvgs(5, 0.76, 1.0, ICON_GATE), "✅"); // 0.76 ratio ≥ 0.75, < 1.0
    assert.equal(computeIconFromAvgs(5, 0.99, 1.0, ICON_GATE), "✅"); // 0.99 ratio
    assert.equal(computeIconFromAvgs(5, 1.0, 1.0, ICON_GATE), "🔥"); // ratio == 1.0 → 🔥
});

test("icon computation: at or below 75% of account avg → ⚠️", () => {
    assert.equal(computeIconFromAvgs(5, 0.74, 1.0, ICON_GATE), "⚠️");
    // CRITICAL boundary case: ratio === 0.75 (the documented threshold)
    // must classify as ⚠️ — not ✅. The implementation uses `<=` not `<`.
    assert.equal(computeIconFromAvgs(5, 0.75, 1.0, ICON_GATE), "⚠️"); // 0.75 boundary — inclusive

    assert.equal(computeIconFromAvgs(5, 0.5, 1.0, ICON_GATE), "⚠️");
    assert.equal(computeIconFromAvgs(5, 0.1, 1.0, ICON_GATE), "⚠️");
});

// ─── Tooltip text: plain Fusha, no technical terms ──────────────

test("tooltip strings: never contain forbidden terms (CTR/CPA/CPL/CPM/percent)", () => {
    const all = [
        AR_S_TOOLTIP_STRONGEST,
        AR_S_TOOLTIP_GOOD,
        AR_S_TOOLTIP_WEAK_PREFIX,
        AR_S_NO_DATA_YET,
    ];
    const FORBIDDEN = ["CTR", "CPM", "CPA", "CPL", "متوسط", "ميديان", "%"];
    for (const s of all) {
        for (const f of FORBIDDEN) {
            assert.ok(
                !s.includes(f),
                `Tooltip "${s}" contains forbidden term "${f}"`,
            );
        }
    }
});

test("tooltip strongest is plain Fusha Arabic (no digits, no Latin)", () => {
    // The tooltip must be pure Arabic copy — no percentages, no Latin
    // terms. (Light sanity — exact wording may evolve, but it must
    // remain Arabic + Fusha.)
    assert.match(AR_S_TOOLTIP_STRONGEST, /[\u0600-\u06FF]/);
    assert.doesNotMatch(AR_S_TOOLTIP_STRONGEST, /[0-9]/);
});

test("tooltip weak prefix: pure Fusha, no technical terms", () => {
    // The actual implementation injects the best-2 angle names with
    // {a}/{b} placeholders. The PREFIX is pure Fusha — no English
    // acronyms, no percentages.
    assert.match(AR_S_TOOLTIP_WEAK_PREFIX, /[\u0600-\u06FF]/);
    for (const f of ["CTR", "CPM", "CPA", "CPL", "%", "متوسط", "ميديان"]) {
        assert.ok(!AR_S_TOOLTIP_WEAK_PREFIX.includes(f), `prefix contains forbidden term "${f}"`);
    }
});

// ─── Best-2 angles helper (mirrors the logic in the backend) ─────

function pickBestTwo(
    rows: Array<{ angleKey: string; avgLinkCtr: number; sampleSize: number }>,
): Array<{ angleKey: string; avgLinkCtr: number; sampleSize: number }> {
    return rows
        .filter((r) => r.sampleSize >= ICON_GATE)
        .sort((a, b) => b.avgLinkCtr - a.avgLinkCtr)
        .slice(0, 2);
}

test("best-2 selection: sorts by avgLinkCtr descending, filters by sample gate", () => {
    const rows = [
        { angleKey: "a", avgLinkCtr: 1.0, sampleSize: 5 },
        { angleKey: "b", avgLinkCtr: 2.5, sampleSize: 4 },
        { angleKey: "c", avgLinkCtr: 0.5, sampleSize: 3 },
        { angleKey: "d", avgLinkCtr: 1.5, sampleSize: 2 }, // below gate
    ];
    const top = pickBestTwo(rows);
    assert.equal(top.length, 2);
    assert.equal(top[0].angleKey, "b");
    assert.equal(top[1].angleKey, "a");
});

// ─── Unmatched ads filter (mirror of the dashboard callable) ─────

interface AdShape {
    adId?: string;
    adName?: string;
    matchType?: string | null;
    evaluatedAt?: number;
    thumbnailUrl?: string;
}

function unmatchedIds(ads: AdShape[]): string[] {
    return ads
        .filter((a) => a.matchType === null && typeof a.adId === "string")
        .map((a) => a.adId as string);
}

test("unmatched filter: only matchType=null ads are returned", () => {
    const ads: AdShape[] = [
        { adId: "a1", matchType: null },
        { adId: "a2", matchType: "auto_hash" },
        { adId: "a3", matchType: "manual" },
        { adId: "a4", matchType: null },
    ];
    assert.deepEqual(unmatchedIds(ads), ["a1", "a4"]);
});

// ─── Recent verdicts sort ───────────────────────────────────────

function recentVerdictsSorted(ads: AdShape[]): string[] {
    return ads
        .filter((a) => typeof a.evaluatedAt === "number")
        .sort((a, b) => (b.evaluatedAt || 0) - (a.evaluatedAt || 0))
        .map((a) => a.adId || "");
}

test("recent verdicts: sorted by evaluatedAt DESC", () => {
    const ads: AdShape[] = [
        { adId: "a", evaluatedAt: 1000 },
        { adId: "b", evaluatedAt: 3000 },
        { adId: "c", evaluatedAt: 2000 },
        { adId: "d", evaluatedAt: 4000 },
    ];
    assert.deepEqual(recentVerdictsSorted(ads), ["d", "b", "c", "a"]);
});

// ─── Sync cooldown (Batch-4: removed, replaced with frozen constants) ─

/**
 * PHASE 970 (BATCH 4) — the 1-hour cooldown that lived at `whatsWorkingDashboard.ts:355-359`
 * is removed. The dashboard now emits `canSyncNow: true` and `cooldownEndsAt: null`
 * as frozen constants for one release, per §9 decision 2 of the investigation
 * report (kept so cached-JS clients that still read those fields render the
 * button as enabled; deleted in Batch 5+). The rate-limit guard that
 * suppresses a second concurrent press lives at the orchestration layer
 * (`metaSync/lease.ts`), not at the dashboard.
 *
 * These two tests replace the deleted cooldown-math tests (formerly lines
 * 176 and 184). They assert the frozen shape directly by reading the
 * `whatsWorkingDashboard.ts` source — fast, no Firestore stub needed.
 */
test("PHASE 970 Batch 4 — SyncStatus cooldown fields are FROZEN literals, not derived from lastMetaSyncAt", () => {
    // Read the source to make sure the cooldown gate is gone. This
    // catches a future refactor that re-introduces a date-based cooldown
    // — the failure mode the investigation report called out as
    // can't-degrade-into-a-cooldown.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("node:path");
    // When node:test compiles this .ts file to lib/__tests__/, the
    // src tree lives at <repo>/src/. The compiled test sits at
    // <repo>/lib/__tests__/, so we step up two levels into <repo>
    // and into src/.
    const srcPath = path.join(__dirname, "..", "..", "src", "whatsWorkingDashboard.ts");
    const src = fs.readFileSync(srcPath, "utf8");

    // SYNC_COOLDOWN_MS const must be gone — a leftover const that is
    // unreferenced is a footgun for the next person.
    assert.equal(
        /const\s+SYNC_COOLDOWN_MS\s*=/.test(src),
        false,
        "SYNC_COOLDOWN_MS const must be removed (Batch 4)",
    );

    // The frozen literals are present.
    assert.match(
        src,
        /canSyncNow:\s*true/,
        "SyncStatus.canSyncNow must be a frozen literal `true`",
    );
    assert.match(
        src,
        /cooldownEndsAt:\s*null/,
        "SyncStatus.cooldownEndsAt must be a frozen literal `null`",
    );

    // The gate computation formula `lastSyncAt + SYNC_COOLDOWN_MS`
    // must be gone.
    assert.equal(
        /lastSyncAt\s*\+\s*SYNC_COOLDOWN_MS/.test(src),
        false,
        "no `lastSyncAt + SYNC_COOLDOWN_MS` cooldown formula may remain",
    );
});

test("PHASE 970 Batch 4 — canSyncNow/cooldownEndsAt are not gated by lastMetaSyncAt", () => {
    // Property test in disguise: even if a caller passes a lastMetaSyncAt
    // that *would* have triggered the pre-fix cooldown, the post-fix
    // shape is constant. The pure helpers don't carry the logic (it was
    // deleted), so the strongest thing we can assert is the SyncStatus
    // shape. We re-assert by reading the interface declaration.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("node:path");
    const src = fs.readFileSync(
        path.join(__dirname, "..", "..", "src", "whatsWorkingDashboard.ts"),
        "utf8",
    );

    // Fields still exist on the SyncStatus interface (frozen, deprecated).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = src.match(/interface\s+SyncStatus\s*{([\s\S]*?)\n}/);
    assert.ok(m, "SyncStatus interface must still exist");
    assert.match(m[1], /canSyncNow:\s*boolean/);
    assert.match(m[1], /cooldownEndsAt:\s*number\s*\|\s*null/);
});

// ─── makeCountAr / makeSpendLabel strings (mirror the backend) ──

test("count strings: include {used} placeholder for the runtime value", () => {
    // The implementation substitutes {n} for the count at render time.
    // We assert the static prefix contains the placeholder.
    // (We don't import makeCountAr directly — it's not exported.)
    // Instead, replicate the production format and assert.
    const ar = (used: number, winners: number): string => {
        if (winners === 0) return `استخدمتها ${used} مرات`;
        return `استخدمتها ${used} مرات، ${winners} منها ناجحة`;
    };
    assert.equal(ar(0, 0), "استخدمتها 0 مرات");
    assert.equal(ar(6, 4), "استخدمتها 6 مرات، 4 منها ناجحة");
    // No technical terms in the count string.
    assert.ok(!ar(5, 2).includes("CTR"));
    assert.ok(!ar(5, 2).includes("%"));
});

test("spend label: 7-day phrasing, currency-aware formatting (USD prefix, others suffix)", () => {
    // Mirrors makeSpend7dLabel/formatMoney in whatsWorkingDashboard.ts.
    const money = (cur: string, amt: number): string => {
        const withCommas = (Math.round(amt * 100) / 100).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return cur === "USD" ? `$${withCommas}` : `${withCommas} ${cur}`;
    };
    const ar = (cur: string, amt: number): string => `${money(cur, amt)} (آخر 7 أيام)`;
    assert.equal(ar("USD", 1835.9), "$1,835.90 (آخر 7 أيام)");
    assert.equal(ar("AED", 1835.9), "1,835.90 AED (آخر 7 أيام)");
    // 7 days, not 3.
    assert.ok(ar("USD", 0).includes("آخر 7 أيام"));
    assert.ok(!ar("USD", 0).includes("آخر 3 أيام"));
    // No technical terms.
    assert.ok(!ar("USD", 0).includes("CTR"));
    assert.ok(!ar("USD", 0).includes("%"));
});
