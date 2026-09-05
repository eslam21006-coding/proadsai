// functions/src/__tests__/phase969/learningCascade.test.ts — T027 (FR-014 cascade tests)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, T027 — Delete-cascade preservation.
//
// FR-014: "Loss of creative metadata (the delete cascade) MUST NOT
// withdraw a contribution already made. It MUST only prevent further
// contribution."
//
// Spec invariant (data-model.md §1, AdDoc): a creative is never
// half-cascaded. The cascade queries by generationId, so it reaches
// every row of a creative at once. Once the cascade fires, subsequent
// syncs must:
//   1. Not withdraw the previous contribution (it stands).
//   2. Not contribute further (the creative is dead).
//
// The aggregator's per-creative handling at the unit-of-evidence
// level (T021) means the eligibility filter (which checks
// metadataAvailable) drops the creative's rows going forward.
// "Not withdraw" is tested here directly: the additive delta does
// not have a "withdraw all cascade-marked rows" pathway — the
// aggregator only adds, never subtracts.

import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    applyHookAggregatesDelta,
    applyHookAggregateWithdrawal,
} = require("../../learning/aggregateDelta.js");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    decideContribution,
} = require("../../learning/contributionLedger.js");

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

function adForLearning(overrides: Partial<{
    adId: string;
    creativeKey?: string;
    generationId: string | null;
    matchType: "auto_hash" | "manual" | null;
    metadataAvailable: boolean;
    campaignObjective: "conversion" | "other";
    geoTier: "tier1_gulf" | "tier2_diaspora" | "tier3_egypt_na";
    audienceType: "broad" | "interest" | "lookalike" | "retargeting" | "advantage_plus";
    ctrLink: number;
    cpm3d: number;
    conversions3d: number;
    verdict: "🟢" | "🟡" | "🔴" | "🛟" | "⏳";
    hookAngle: string | null;
}> = {}): any {
    return {
        adId: "ad-1",
        creativeKey: "creative-A",
        generationId: "gen-A",
        matchType: "manual",
        metadataAvailable: true,
        campaignObjective: "conversion",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        ctrLink: 0.05,
        cpm3d: 2.5,
        conversions3d: 10,
        verdict: "🟢",
        hookAngle: "urgency",
        ...overrides,
    };
}

const fhook = (overrides: Record<string, unknown> = {}) => ({
    angleKey: "urgency",
    schemaVersion: 1,
    sampleSize: 0,
    lastUpdated: 1_000_000,
    byObjective: {
        conversion: { avgLinkCtr: 0, count: 0, bestVerdictCount: 0, worstVerdictCount: 0 },
        other: { avgLinkCtr: 0, count: 0 },
    },
    byGeoTier: { tier1_gulf: { avgCtr: 0, count: 0 }, tier2_diaspora: { avgCtr: 0, count: 0 }, tier3_egypt_na: { avgCtr: 0, count: 0 } },
    byAudienceType: { broad: { avgCtr: 0, count: 0 }, interest: { avgCtr: 0, count: 0 }, lookalike: { avgCtr: 0, count: 0 }, retargeting: { avgCtr: 0, count: 0 }, advantage_plus: { avgCtr: 0, count: 0 } },
    ...overrides,
});

// ─── FR-014: cascade-marked ads no longer contribute ───────────

test("FR-014: cascade-marked creative no longer contributes going forward", () => {
    // Sync 1: the creative is alive, contributes 1.
    const sync1 = [adForLearning({ creativeKey: "creative-X", ctrLink: 0.10 })];
    const after1 = applyHookAggregatesDelta([], sync1, 1_000_000);
    assert.equal(after1.get("urgency").byObjective.conversion.count, 1);

    // Cascade fires: generation deleted, metadataAvailable flips to false.
    // Sync 2: the same row appears but with metadataAvailable: false.
    const sync2 = [adForLearning({
        creativeKey: "creative-X",
        metadataAvailable: false,    // ← cascade mark
        ctrLink: 0.99,                 // ← would inflate the angle if aggregated
    })];
    const after2 = applyHookAggregatesDelta(Array.from(after1.values()), sync2, 2_000_000);
    // The historical count must NOT have been withdrawn (FR-014).
    // And the cascade-marked row must NOT have been added.
    assert.equal(after2.get("urgency").byObjective.conversion.count, 1,
        "FR-014: cascade-marked row does not contribute; previous contribution stands");
});

// ─── FR-014: previous contribution is not withdrawn on cascade ──

test("FR-014: previous contribution STANDS through cascade (no withdrawal)", () => {
    // Sync 1 establishes a creative's contribution.
    const sync1 = [adForLearning({ creativeKey: "creative-Y", ctrLink: 0.05 })];
    const after1 = applyHookAggregatesDelta([], sync1, 1_000_000);
    assert.equal(after1.get("urgency").byObjective.conversion.count, 1);
    assert.equal(after1.get("urgency").byObjective.conversion.avgLinkCtr, 0.05);

    // Sync 2: cascade marks the creative, sync brings only cascade rows.
    const sync2 = [adForLearning({
        creativeKey: "creative-Y",
        metadataAvailable: false,
    })];
    const after2 = applyHookAggregatesDelta(Array.from(after1.values()), sync2, 2_000_000);
    // The previous count and avg are preserved verbatim — never decreased.
    assert.equal(after2.get("urgency").byObjective.conversion.count, 1);
    assert.equal(after2.get("urgency").byObjective.conversion.avgLinkCtr, 0.05,
        "FR-014: avgLinkCtr preserves the previous contribution's value, not zero, not the cascade-marked row's value");
});

// ─── The aggregator has no "withdraw cascade-marked rows" pathway ──

test("FR-014: the additive delta has no implicit-withdrawal pathway (structurally)", () => {
    // ApplyHookAggregatesDelta only ADDS contributions; it never
    // subtracts. The withdrawal pathway (applyHookAggregateWithdrawal)
    // requires an explicit call with a known ad to remove.
    //
    // This is structural: the function name says "apply delta" not
    // "compute new aggregate". A future maintainer who adds a "subtract
    // cascade-marked" branch to applyHookAggregatesDelta would break
    // FR-014. The test asserts the structural property by inspecting
    // the source — it has no implicit cascade-withdrawal branch.
    const shared = require("node:fs").readFileSync(
        require("node:path").join(__dirname, "..", "..", "..", "src", "learning", "aggregateDelta.ts"),
        "utf8",
    );
    // The apply function body should NOT iterate over existing and
    // subtract cascade-marked rows. We grep for negative assertions:
    //   - no `existing.filter(a => !a.metadataAvailable).reduce(...)`
    //   - no `for (const a of existing) if (!a.metadataAvailable) ...subtract`
    // We assert the POSITIVE property: apply's body uses only += and
    // Math operations on counts.
    const applyMatch = shared.match(/function applyAdToHook[\s\S]+?\n\}/);
    assert.ok(applyMatch, "applyAdToHook function not found");
    const applyBody = applyMatch[0];
    // No subtraction of counts. The withdrawal function uses -= but
    // applyAdToHook does not.
    const subtractionMatches = applyBody.match(/-=\s*\d+|sampleSize\s*-\s*=|count\s*-=/g);
    assert.equal(subtractionMatches, null,
        `applyAdToHook must not subtract — found: ${subtractionMatches}`);
});

// ─── A creative never half-cascades (data-model §1) ──────────────

test("a creative never half-cascades: the eligibility filter rejects every row of a metadataAvailable=false creative", () => {
    // The aggregator's isAdEligible filter returns false for
    // metadataAvailable=false. Per creative (T021 grouping), if the
    // creative is alive, some rows have metadataAvailable=true; if the
    // cascade marked it, all do.
    const aliveAd = adForLearning({ creativeKey: "alive", metadataAvailable: true });
    const cascadeAd = adForLearning({ creativeKey: "dead", metadataAvailable: false });

    const ads = [aliveAd, cascadeAd];
    const result = applyHookAggregatesDelta([], ads, 1_000_000);
    // Only the alive ad contributes.
    const only = result.get("urgency");
    assert.ok(only);
    assert.equal(only.byObjective.conversion.count, 1,
        "only the alive creative's row contributes; the cascade-marked creative's row does not");
});

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log("=== T027 — cascade preservation (FR-014) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
