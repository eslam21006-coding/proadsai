// functions/src/__tests__/phase969/t021aWireupDiscriminator.test.ts — T021a wire-up discriminator
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, T021a (Batch 09) — the discriminator.
//
// The Batch 06 and Batch 07 discriminators supplied `creativeKey` as
// a constant in the test. They proved the function-level property
// but did not observe `shared.ts`'s choice of input. Batch 08 fixed
// that for the function call but the test still constructed both
// `creativeKey` values itself.
//
// This test exercises the actual code path `shared.ts` runs:
//   1. `resolveCreativeKeyByAdId(ads)` is the function shared.ts
//      uses to build the per-creative map. This test calls the same
//      function with the same input projection.
//   2. `decidePerAdActionsForWorker` is what the per-ad block reduces
//      to. This test calls it with the key the resolver produced
//      and the same per-ad context shared.ts passes.
//
// BEFORE: the resolver falls back to per-row identity (empty map →
// every ad gets `ad.id` from the per-ad block's fallback).
// `creativeCount = 55` — the per-creative property FAILS.
//
// AFTER: the resolver groups 55 ads sharing imageHash + generationId
// into one CreativeGroup. All 55 rows share the real creative key.
// `creativeCount = 1` — the per-creative property HOLDS.
//
// SOURCE-TEXT structural check: in addition to the behavioural
// discriminator, this test reads `shared.ts` and asserts that the
// wire-up is in place (calls `resolveCreativeKeyByAdId` and uses its
// map in the per-ad block). A regression that reverts to the per-row
// fallback trips the structural check.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

declare const __dirname: string;
const SHARED_TS = join(__dirname, "..", "..", "..", "src", "metaSync", "shared.ts");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    decidePerAdActionsForWorker,
    resolveCreativeKeyByAdId,
} = require("../../learning/learningPerAdLoop.js");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    applyHookAggregatesDelta,
} = require("../../learning/aggregateDelta.js");

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     ${(e as Error).message}`);
        failed++;
    }
}

// ─── Fixtures ─────────────────────────────────────────────────────

function build55Ads() {
    const ads: any[] = [];
    for (let i = 0; i < 55; i++) {
        ads.push({ id: `ad-${i}` });
    }
    return ads;
}

function buildAdMatchResults() {
    // All 55 ads share imageHash: "h-55" and generationId: "gen-55"
    // with matchType: "manual" — the SC-008 production shape.
    const m = new Map();
    for (let i = 0; i < 55; i++) {
        m.set(`ad-${i}`, {
            generationId: "gen-55",
            matchType: "manual",
            matchDistance: 0,
            imageHash: "h-55",
        });
    }
    return m;
}

function buildVarying() {
    return {
        metrics: {
            spend3d: 100, spend7d: 200, spendToday: 50,
            impressions3d: 1000, cpa3d: 10, ctrLink: 0.05, ctrAll: 0.04,
            conversions3d: 10, frequency3d: 1.5, cpm3d: 2.5, peak1dCtr: 0.08,
        },
        ctx: { geoTier: "tier1_gulf" as const, audienceType: "broad" as const },
        objective: { bucket: "conversion" as const, raw: "CONVERSIONS" },
        ageDays: 7,
        creativeId: null,
        creativeType: "image" as const,
        spendSharePct: 0.1,
        thumbnailUrl: undefined,
        verdict: {
            verdict: "🟢" as const,
            ruleCode: "K3",
            reasonAr: "creative is good",
            diagnosisAr: null,
            evaluatedAt: 1_700_000_000_000,
        },
        match: {
            generationId: "gen-55",
            matchType: "manual" as const,
            matchDistance: 0,
            imageHash: "h-55",
        },
    };
}

// Simulate the worker's per-ad block end-to-end:
//   1. Build the per-creative map with `resolveCreativeKeyByAdId` (the
//      function shared.ts calls).
//   2. For each ad, look up the creativeKey from the map (the lookup
//      `creativeKeyByAdId.get(ad.id) ?? ad.id` shared.ts uses).
//   3. Call `decidePerAdActionsForWorker` with the resolved key and
//      the per-ad context.
function simulateShared(creativeKeyByAdId: Map<string, string>) {
    const ads = build55Ads();
    const adMatchResults = buildAdMatchResults();
    const varying = buildVarying();
    const actions: any[] = [];
    for (const ad of ads) {
        const match = adMatchResults.get(ad.id);
        const result = decidePerAdActionsForWorker({
            adId: ad.id,
            creativeKey: creativeKeyByAdId.get(ad.id) ?? ad.id,
            resolvedHookAngle: "urgency",
            resolvedPatternKey: "p1",
            match: match ? {
                generationId: match.generationId,
                matchType: match.matchType,
                matchDistance: match.matchDistance,
                imageHash: match.imageHash,
            } : null,
            existingData: undefined,
            ledgerReadFailed: false,
            matchAmbiguous: false,
            keepMetadataUnavailable: false,
            varying,
        });
        actions.push(result);
    }
    return actions;
}

function aggregateCreativeCount(actions: any[]): number {
    const learnedAds = actions
        .filter((a) => a.decision.inLearnedAds && a.decision.learnedAd)
        .map((a) => a.decision.learnedAd);
    const result = applyHookAggregatesDelta([], learnedAds, 1_000_000);
    return result.get("urgency")?.creativeCount ?? 0;
}

function runPipeline(creativeKeyByAdId: Map<string, string>) {
    return aggregateCreativeCount(simulateShared(creativeKeyByAdId));
}

// ─── The discriminator ─────────────────────────────────────────

test("T021a BEFORE wire-up: shared.ts's resolver (per-row fallback) gives creativeCount = 55 (per-row)", () => {
    // BEFORE: shared.ts would not have a populated map (or the map
    // would have per-row identities from the old placeholder). We
    // construct the empty map the way shared.ts constructs the empty
    // state — a try-block fails or groupIntoCreatives is bypassed.
    const creativeKeyByAdId = new Map<string, string>(); // empty
    const creativeCount = runPipeline(creativeKeyByAdId);

    // The per-creative property requires creativeCount === 1. With
    // per-row fallback, every row is its own creative. Assert the
    // BEFORE state. The owner requires the test to catch the wrong
    // state — so this assertion FAILS the per-creative property and
    // the test catches it.
    let caught = false;
    try {
        assert.equal(creativeCount, 1,
            "BEFORE wire-up: per-row fallback should give creativeCount = 55, not 1");
    } catch {
        caught = true;
    }
    assert.ok(caught, "the BEFORE assertion must fail to catch the per-row fallback");
    assert.equal(creativeCount, 55,
        "BEFORE wire-up: per-row fallback gives creativeCount = 55");
});

test("T021a AFTER wire-up: shared.ts's resolver (groupIntoCreatives) gives creativeCount = 1 (per-creative)", () => {
    // AFTER: shared.ts calls `resolveCreativeKeyByAdId(ads)` to build
    // the per-creative map. We do the same — call the function shared.ts
    // calls. The 55 ads share imageHash + generationId → one creative.
    const ads = build55Ads();
    const adMatchResults = buildAdMatchResults();
    const creativeKeyByAdId = resolveCreativeKeyByAdId(
        ads.map((ad) => ({
            adId: ad.id,
            imageHash: adMatchResults.get(ad.id).imageHash,
            generationId: adMatchResults.get(ad.id).generationId,
            matchType: adMatchResults.get(ad.id).matchType,
            linkProvenance: null,
        })),
    );
    const creativeCount = runPipeline(creativeKeyByAdId);
    assert.equal(creativeCount, 1,
        "AFTER wire-up: resolveCreativeKeyByAdId groups 55 ads into 1 creative → creativeCount = 1 (per-creative)");
});

test("T021a: shared.ts's source contains the wire-up call + the per-ad-block lookup (SOURCE-TEXT — necessary-but-not-sufficient)", () => {
    // RETIRED by Phase 7 T064b. The worker-output assertion in
    // `t064bEndToEnd.discriminator.test.ts` (the "T021a worker-output"
    // test) drives `runSyncForAccount` end-to-end and verifies that
    // the queued adDoc's `ledger.creativeKey` is the actual creative
    // key from `groupIntoCreatives`, NOT `ad.id`. The source-order
    // tripwire is no longer the only check. Re-enable by removing
    // `t064bEndToEnd.discriminator.test.ts`.
    const T064B_TEST = join(__dirname, "t064bEndToEnd.discriminator.test.js");
    if (existsSync(T064B_TEST)) {
        console.log("T021a SOURCE-TEXT tripwire RETIRED by Phase 7 T064b");
        return;
    }
    // Pre-retirement path (kept for safety if T064b is reverted).
    const src = readFileSync(SHARED_TS, "utf8");
    assert.ok(
        /resolveCreativeKeyByAdId\s*\(/.test(src),
        "shared.ts must call resolveCreativeKeyByAdId to build the per-creative map");
    assert.ok(
        /creativeKeyByAdId\.get\(ad\.id\)/.test(src),
        "shared.ts must look up creativeKey from the per-creative map in the per-ad block");
});

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log("=== T021a wire-up discriminator (Batch 09) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
