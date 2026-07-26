// functions/src/__tests__/getTopWinners.test.ts — Phase 14 Layer 7b
// ═══════════════════════════════════════════════════════════
// node:test runner. PURE module tests for `loadTopWinners` /
// `filterTopWinners` (Phase 14 — Layer 7b: Phase 20 pastWinningAds wiring).
//
// Decision (spec §10): the 5 most recently evaluated S1 winners, in
// descending `evaluatedAt` order. Filters:
//   - verdict === "🟢"
//   - campaignObjective === "conversion"
//   - matchType is "auto_hash" or "manual" (not null)
//   - metadataAvailable === true (excludes deleted-generation winners)
//   - generationId present
//
// If fewer than 5 → returns whatever exists. If zero → returns [].
// The Concept Director handles an empty pastWinningAds array
// gracefully (no regression).
// ═══════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    filterTopWinners,
    type WinningAd,
    type AdPerformanceWinnerCandidate,
} from "../getTopWinners.js";

// ─── Fixtures ────────────────────────────────────────────────

function makeCand(overrides: Partial<AdPerformanceWinnerCandidate> = {}): AdPerformanceWinnerCandidate {
    return {
        adId: "ad-1",
        generationId: "gen-1",
        matchType: "auto_hash",
        metadataAvailable: true,
        campaignObjective: "conversion",
        verdict: "🟢",
        evaluatedAt: 1_000_000,
        linkCtr: 1.5,
        cpa3d: 5,
        ...overrides,
    };
}

function makeGeneration(overrides: Partial<WinningAd> = {}): WinningAd {
    return {
        generationId: "gen-1",
        hookAngle: "urgency",
        hookText: "STOP scrolling — read this",
        layoutTemplate: "hero_value_stack",
        creativeModes: ["standard_hero", "value_stack"],
        artDirection: "dark_cinematic",
        universe: "uae",
        linkCtr: 1.5,
        cpa: 5,
        evaluatedAt: 1_000_000,
        ...overrides,
    };
}

// ─── Filter eligibility (spec §10) ───────────────────────────

test("getTopWinners: 7 S1 winners → returns top 5 sorted by evaluatedAt desc", () => {
    const cands: AdPerformanceWinnerCandidate[] = [
        makeCand({ adId: "a1", generationId: "gen-1", evaluatedAt: 1_000_000 }),
        makeCand({ adId: "a2", generationId: "gen-2", evaluatedAt: 7_000_000 }),
        makeCand({ adId: "a3", generationId: "gen-3", evaluatedAt: 3_000_000 }),
        makeCand({ adId: "a4", generationId: "gen-4", evaluatedAt: 5_000_000 }),
        makeCand({ adId: "a5", generationId: "gen-5", evaluatedAt: 9_000_000 }),
        makeCand({ adId: "a6", generationId: "gen-6", evaluatedAt: 2_000_000 }),
        makeCand({ adId: "a7", generationId: "gen-7", evaluatedAt: 4_000_000 }),
    ];
    // The hydration callback receives the generationId and looks it up
    // in the candidates list to retrieve the evaluatedAt. The sort key
    // is the candidate's evaluatedAt — the hydrated WinningAd's
    // evaluatedAt should mirror it.
    const out = filterTopWinners(cands, 5, (generationId) => {
        const cand = cands.find((c) => c.generationId === generationId);
        return makeGeneration({ generationId, evaluatedAt: cand?.evaluatedAt ?? 0 });
    });
    assert.equal(out.length, 5);
    // Sorted by evaluatedAt desc: a5 (9M), a2 (7M), a4 (5M), a7 (4M), a3 (3M)
    assert.equal(out[0].evaluatedAt, 9_000_000);
    assert.equal(out[0].generationId, "gen-5");
    assert.equal(out[1].evaluatedAt, 7_000_000);
    assert.equal(out[1].generationId, "gen-2");
    assert.equal(out[2].evaluatedAt, 5_000_000);
    assert.equal(out[2].generationId, "gen-4");
    assert.equal(out[3].evaluatedAt, 4_000_000);
    assert.equal(out[3].generationId, "gen-7");
    assert.equal(out[4].evaluatedAt, 3_000_000);
    assert.equal(out[4].generationId, "gen-3");
});

test("getTopWinners: 3 S1 winners → returns all 3", () => {
    const cands: AdPerformanceWinnerCandidate[] = [
        makeCand({ adId: "a1", evaluatedAt: 1_000_000 }),
        makeCand({ adId: "a2", evaluatedAt: 2_000_000 }),
        makeCand({ adId: "a3", evaluatedAt: 3_000_000 }),
    ];
    const out = filterTopWinners(cands, 5, (id) => {
        const c = cands.find((x) => x.generationId === id);
        return makeGeneration({ generationId: id, evaluatedAt: c?.evaluatedAt ?? 0 });
    });
    assert.equal(out.length, 3);
});

test("getTopWinners: 0 S1 winners → returns empty array", () => {
    const out = filterTopWinners([], 5, () => makeGeneration());
    assert.equal(out.length, 0);
    assert.deepEqual(out, []);
});

// ─── Eligibility filters ─────────────────────────────────────

test("getTopWinners: S1 winner with metadataAvailable=false (deleted generation) → excluded", () => {
    const cands: AdPerformanceWinnerCandidate[] = [
        makeCand({ adId: "a1", evaluatedAt: 5_000_000, metadataAvailable: false }),
        makeCand({ adId: "a2", evaluatedAt: 3_000_000, metadataAvailable: true }),
    ];
    const out = filterTopWinners(cands, 5, () => makeGeneration());
    assert.equal(out.length, 1);
    assert.equal(out[0].generationId, "gen-1");
});

test("getTopWinners: S1 winner with non-conversion campaignObjective → excluded", () => {
    const cands: AdPerformanceWinnerCandidate[] = [
        makeCand({ adId: "a1", evaluatedAt: 5_000_000, campaignObjective: "other" }),
        makeCand({ adId: "a2", evaluatedAt: 3_000_000, campaignObjective: "conversion" }),
    ];
    const out = filterTopWinners(cands, 5, () => makeGeneration());
    assert.equal(out.length, 1);
});

test("getTopWinners: S1 winner with matchType=null (unmatched) → excluded", () => {
    const cands: AdPerformanceWinnerCandidate[] = [
        makeCand({ adId: "a1", evaluatedAt: 5_000_000, matchType: null }),
        makeCand({ adId: "a2", evaluatedAt: 3_000_000, matchType: "manual" }),
    ];
    const out = filterTopWinners(cands, 5, () => makeGeneration());
    assert.equal(out.length, 1);
});

test("getTopWinners: S1 winner with verdict !== 🟢 → excluded (K3/CB/S2 not eligible)", () => {
    const cands: AdPerformanceWinnerCandidate[] = [
        makeCand({ adId: "a1", evaluatedAt: 5_000_000, verdict: "🔴" }),
        makeCand({ adId: "a2", evaluatedAt: 3_000_000, verdict: "🟡" }),
        makeCand({ adId: "a3", evaluatedAt: 1_000_000, verdict: "🛟" }),
        makeCand({ adId: "a4", evaluatedAt: 6_000_000, verdict: "⏳" }),
        makeCand({ adId: "a5", evaluatedAt: 4_000_000, verdict: "🟢" }),
    ];
    const out = filterTopWinners(cands, 5, () => makeGeneration());
    assert.equal(out.length, 1);
    assert.equal(out[0].generationId, "gen-1");
});

test("getTopWinners: S1 winner with no generationId → excluded", () => {
    const cands: AdPerformanceWinnerCandidate[] = [
        makeCand({ adId: "a1", evaluatedAt: 5_000_000, generationId: null }),
        makeCand({ adId: "a2", evaluatedAt: 3_000_000 }),
    ];
    const out = filterTopWinners(cands, 5, () => makeGeneration());
    assert.equal(out.length, 1);
});

// ─── Generation hydration ───────────────────────────────────

test("getTopWinners: returned WinningAd has all required fields populated from the generation doc", () => {
    const cands: AdPerformanceWinnerCandidate[] = [
        makeCand({ adId: "a1", evaluatedAt: 5_000_000, linkCtr: 2.5, cpa3d: 10 }),
    ];
    const out = filterTopWinners(cands, 5, () => makeGeneration({
        generationId: "gen-1",
        hookAngle: "urgency",
        hookText: "Don't miss this",
        layoutTemplate: "hero_value_stack",
        creativeModes: ["standard_hero"],
        artDirection: "dark_cinematic",
        universe: "uae",
        linkCtr: 2.5,
        cpa: 10,
        evaluatedAt: 5_000_000,
    }));
    assert.equal(out.length, 1);
    const w = out[0];
    assert.equal(w.generationId, "gen-1");
    assert.equal(w.hookAngle, "urgency");
    assert.equal(w.hookText, "Don't miss this");
    assert.equal(w.layoutTemplate, "hero_value_stack");
    assert.deepEqual(w.creativeModes, ["standard_hero"]);
    assert.equal(w.artDirection, "dark_cinematic");
    assert.equal(w.universe, "uae");
    assert.equal(w.linkCtr, 2.5);
    assert.equal(w.cpa, 10);
    assert.equal(w.evaluatedAt, 5_000_000);
});

test("getTopWinners: hydration fetch returns null → winner dropped", () => {
    // Spec §10 — Edge Case 16: deleted-generation winners are excluded.
    // The hydration fetch returns null when the source generation no
    // longer exists.
    const cands: AdPerformanceWinnerCandidate[] = [
        makeCand({ adId: "a1", evaluatedAt: 5_000_000, generationId: "gen-1" }),
        makeCand({ adId: "a2", evaluatedAt: 3_000_000, generationId: "gen-2" }),
    ];
    const out = filterTopWinners(cands, 5, (genId) => {
        if (genId === "gen-1") return null;
        return makeGeneration({ generationId: genId });
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].generationId, "gen-2");
});

// ─── Fail-open: limit cap ───────────────────────────────────

test("getTopWinners: respects maxResults cap (custom cap)", () => {
    const cands: AdPerformanceWinnerCandidate[] = [
        makeCand({ adId: "a1", evaluatedAt: 5_000_000 }),
        makeCand({ adId: "a2", evaluatedAt: 4_000_000 }),
        makeCand({ adId: "a3", evaluatedAt: 3_000_000 }),
    ];
    const out = filterTopWinners(cands, 2, (id) => {
        const c = cands.find((x) => x.generationId === id);
        return makeGeneration({ generationId: id, evaluatedAt: c?.evaluatedAt ?? 0 });
    });
    assert.equal(out.length, 2);
});
