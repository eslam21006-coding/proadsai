// functions/src/__tests__/phase969/perAdActions.test.ts — tests for `decideAdWriteActions` (T028)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, Batch 07 — behavioural tests for the per-ad pure decision
// function extracted from `runSyncForAccount` in Batch 07 finding 4.
//
// `decideAdWriteActions(input, varying)` takes all the per-ad context
// the worker computes (bounded-read outcome, match candidate, verdict,
// metrics, objective, etc.) and returns the worker's full per-ad
// action set: whether to contribute, the adDoc shape to write (with
// ledger), the matched/ambiguous/unmatched tally, the generationId
// for `matchedGenIds`, and the `AdForLearning` entry for `learnedAds`.
//
// These tests replace the source-text checks in Batch 06's
// `fr070Wiring.test.ts` and turn the T021a discriminator from
// aggregator-level into worker-level. SC-049's behavioural test still
// needs Phase 7 scaffolding (lease acquire is upstream of this
// function), so this batch doesn't unblock SC-049 — but it unblocks
// the discriminating tests for T021/T021a and T025a and the FR-070
// wiring checks at the per-ad level.

import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    decideAdWriteActions,
} = require("../../learning/decideAdWriteActions.js");
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

function baseInput(overrides: Record<string, unknown> = {}) {
    return {
        adId: "ad-1",
        creativeKey: "ad-1", // Per-row fallback until T021a's worker integration
        resolvedHookAngle: "urgency",
        resolvedPatternKey: "p1",
        ledgerReadFailed: false,
        matchAmbiguous: false,
        existingData: undefined,
        keepMetadataUnavailable: false,
        ...overrides,
    };
}

function baseVarying(overrides: Record<string, unknown> = {}) {
    return {
        metrics: {
            spend3d: 100, spend7d: 200, spendToday: 50,
            impressions3d: 1000, cpa3d: 10, ctrLink: 0.05, ctrAll: 0.04,
            conversions3d: 10, frequency3d: 1.5, cpm3d: 2.5, peak1dCtr: 0.08,
        },
        ctx: {
            geoTier: "tier1_gulf" as const,
            audienceType: "broad" as const,
        },
        objective: { bucket: "conversion" as const, raw: "CONVERSIONS" },
        ageDays: 7,
        creativeId: "creative-1",
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
            generationId: "gen-1",
            matchType: "manual" as const,
            matchDistance: 3,
            imageHash: "hash-1",
        },
        ...overrides,
    };
}

// ─── T021a discriminator — now at the worker level ──────────────

test("T021a discriminator: 55 ads in one creative produce 1 contribution (not 55)", () => {
    // Build 55 ads all with the same resolved creativeKey. Drive
    // decideAdWriteActions 55 times — this is what the worker does.
    // Collect the inLearnedAds / learnedAd outputs and feed them to
    // applyHookAggregatesDelta. Assert creativeCount === 1.
    //
    // This is the REAL T021a discriminator: the worker produces these
    // actions. With creativeKey === ad.id (Batch 05 placeholder),
    // the contribution count is 55. With creativeKey ===
    // "creative:gen:gen-55" (the T021a wire-up), the count is 1.
    const cases: Array<{ input: unknown; varying: unknown }> = [];
    for (let i = 0; i < 55; i++) {
        cases.push({
            input: baseInput({
                adId: `ad-${i}`,
                creativeKey: "creative:gen:gen-55",
                resolvedHookAngle: "urgency",
                match: {
                    generationId: "gen-55",
                    matchType: "manual" as const,
                    matchDistance: 3,
                    imageHash: "hash-55",
                },
            }),
            varying: baseVarying({
                metrics: {
                    spend3d: 100 + i, spend7d: 200, spendToday: 50,
                    impressions3d: 1000, cpa3d: 10, ctrLink: 0.05 + i * 0.0001,
                    ctrAll: 0.04, conversions3d: 10, frequency3d: 1.5, cpm3d: 2.5, peak1dCtr: 0.08,
                },
            }),
        });
    }
    const actions = cases.map(({ input, varying }) => decideAdWriteActions(input, varying));
    const learnedAds = actions
        .filter((a) => a.inLearnedAds && a.learnedAd)
        .map((a) => a.learnedAd);
    const result = applyHookAggregatesDelta([], learnedAds, 1_000_000);
    const only = result.get("urgency");
    assert.ok(only, "urgency angle should be present");
    assert.equal(only.creativeCount, 1,
        "T021a: 55 rows in one creative → creativeCount = 1 (per-creative, FR-073)");
});

test("T021a discriminator: 55 ads with creativeKey=ad.id fall back to per-row (count = 55)", () => {
    // The Batch 05 placeholder. Per-row identity → 55 distinct
    // creatives → creativeCount = 55. Until T021a's wire-up, this is
    // what the worker produces.
    const cases: Array<{ input: unknown; varying: unknown }> = [];
    for (let i = 0; i < 55; i++) {
        cases.push({
            input: baseInput({
                adId: `ad-${i}`,
                creativeKey: `ad-${i}`, // Per-row fallback
                resolvedHookAngle: "urgency",
                match: {
                    generationId: "gen-55",
                    matchType: "manual" as const,
                    matchDistance: 3,
                    imageHash: "hash-55",
                },
            }),
            varying: baseVarying({
                metrics: {
                    spend3d: 100 + i, spend7d: 200, spendToday: 50,
                    impressions3d: 1000, cpa3d: 10, ctrLink: 0.05 + i * 0.0001,
                    ctrAll: 0.04, conversions3d: 10, frequency3d: 1.5, cpm3d: 2.5, peak1dCtr: 0.08,
                },
            }),
        });
    }
    const actions = cases.map(({ input, varying }) => decideAdWriteActions(input, varying));
    const learnedAds = actions
        .filter((a) => a.inLearnedAds && a.learnedAd)
        .map((a) => a.learnedAd);
    const result = applyHookAggregatesDelta([], learnedAds, 1_000_000);
    const only = result.get("urgency");
    assert.ok(only);
    assert.equal(only.creativeCount, 55,
        "T021a placeholder: per-row fallback → creativeCount = 55");
});

// ─── FR-070 behavioural (replaces fr070Wiring source-text checks) ──

test("FR-070 wiring (behavioural): failed-read ads do NOT contribute (inLearnedAds=false)", () => {
    const result = decideAdWriteActions(
        baseInput({
            ledgerReadFailed: true,
            existingData: {
                adId: "ad-1",
                generationId: "gen-PRIOR",
                matchType: "manual" as const,
                matchDistance: 0,
                metadataAvailable: true,
            },
            // The fresh match points elsewhere; the prior link should
            // be preserved because the bounded read failed.
        }),
        baseVarying({
            match: {
                generationId: "gen-FRESH",
                matchType: "auto_hash" as const,
                matchDistance: 7,
                imageHash: "hash-fresh",
            },
        }),
    );
    assert.equal(result.inLearnedAds, false,
        "FR-070: failed-read ads do NOT contribute (inLearnedAds=false)");
    assert.equal(result.tally, "unmatched",
        "FR-070: failed-read ads have linking null → tally = unmatched");
    // The linking fields are OMITTED in the adDoc (merge preserves them).
    assert.equal(result.adDoc.generationId, undefined,
        "FR-070 field-level: generationKey omitted in failed-read adDoc");
    assert.equal(result.adDoc.matchType, undefined,
        "FR-070 field-level: matchType omitted in failed-read adDoc");
});

test("FR-070 wiring (behavioural): failed-read adDoc KEEPS operational fields (SC-049 protection)", () => {
    // The reverse side: the merge write's "no merge for nulls" property
    // means the OPERATIONAL fields must still be present in the new
    // adDoc so they overwrite with this sync's values.
    const result = decideAdWriteActions(
        baseInput({ ledgerReadFailed: true }),
        baseVarying({
            metrics: {
                spend3d: 999, spend7d: 8888, spendToday: 123,
                impressions3d: 5000, cpa3d: 5, ctrLink: 0.10, ctrAll: 0.09,
                conversions3d: 200, frequency3d: 2.0, cpm3d: 1.5, peak1dCtr: 0.20,
            },
        }),
    );
    assert.equal(result.adDoc.spend3d, 999,
        "FR-070: operational spend3d is current");
    assert.equal(result.adDoc.conversions3d, 200,
        "FR-070: operational conversions3d is current");
    assert.equal(result.adDoc.verdict, "🟢",
        "FR-070: operational verdict is current");
});

// ─── T025a: ledger keys populated when resolved ────────────────

test("T025a: ledger.angleKey is populated from resolvedHookAngle (not null)", () => {
    const result = decideAdWriteActions(
        baseInput({ resolvedHookAngle: "urgency" }),
        baseVarying(),
    );
    assert.ok(result.adDoc.ledger, "ledger should be present for contributing ad");
    assert.equal(result.adDoc.ledger.angleKey, "urgency",
        "T025a: ledger.angleKey populated from resolvedHookAngle");
});

test("T025a: ledger.patternKey populated from resolvedPatternKey", () => {
    const result = decideAdWriteActions(
        baseInput({ resolvedHookAngle: "urgency", resolvedPatternKey: "p1" }),
        baseVarying(),
    );
    assert.equal(result.adDoc.ledger.patternKey, "p1",
        "T025a: ledger.patternKey populated from resolvedPatternKey");
});

test("T025a: ledger.creativeKey carries the actual creative key (FR-073), not ad.id", () => {
    // The discriminator for T021a's worker integration: when the
    // worker runs with the actual creativeKey, the ledger entry
    // carries it. With the Batch 05 placeholder (creativeKey=ad.id),
    // it would carry ad.id.
    const result = decideAdWriteActions(
        baseInput({
            adId: "ad-X",
            creativeKey: "creative-Y", // The T021a wire-up
        }),
        baseVarying(),
    );
    assert.equal(result.adDoc.ledger.creativeKey, "creative-Y",
        "T025a: ledger.creativeKey is the actual creative key (FR-073)");
});

test("T025a: NO ledger entry for a non-contributing ad (FR-070/ledger hygiene)", () => {
    // Failed-read ads and withdrawn-only ads do NOT contribute, so no
    // ledger entry is written. Per data-model.md §2, the ledger is
    // a record of "what this row has contributed". No contribution →
    // no entry.
    const result = decideAdWriteActions(
        baseInput({ ledgerReadFailed: true }),
        baseVarying(),
    );
    assert.equal(result.inLearnedAds, false);
    assert.equal(result.adDoc.ledger, undefined,
        "no contribution → no ledger entry");
});

// ─── Tally ──────────────────────────────────────────────────────

test("tally: matched when the resolved link is auto_hash or manual", () => {
    const result = decideAdWriteActions(
        baseInput({}),
        baseVarying({
            match: {
                generationId: "gen-1",
                matchType: "manual" as const,
                matchDistance: 0,
                imageHash: "hash-1",
            },
        }),
    );
    assert.equal(result.tally, "matched");
});

test("tally: ambiguous when matchAmbiguous is true", () => {
    const result = decideAdWriteActions(
        baseInput({ matchAmbiguous: true }),
        baseVarying({
            match: {
                generationId: null, // ambiguous match produces null generationId
                matchType: null,
                matchDistance: 99,
                imageHash: null,
            },
        }),
    );
    assert.equal(result.tally, "ambiguous");
});

test("tally: unmatched when no link and not ambiguous", () => {
    const result = decideAdWriteActions(
        baseInput({}),
        baseVarying({
            match: {
                generationId: null,
                matchType: null,
                matchDistance: 99,
                imageHash: null,
            },
        }),
    );
    assert.equal(result.tally, "unmatched");
});

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log("=== T028 — perAdActions tests (T021a discriminator + FR-070 behavioural + T025a ledger keys) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
