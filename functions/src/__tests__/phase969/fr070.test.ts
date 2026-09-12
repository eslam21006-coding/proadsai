// functions/src/__tests__/phase969/fr070.test.ts — FR-070 BEHAVIOURAL test
// ══════════════════════════════════════════════════════════════════════
// Phase 969, T018b — the test FR-070 names by assertion.
//
// FR-070 states, in its own words:
//   "This MUST be covered by a test that forces a read failure and
//    asserts no contribution was added."
//
// Owner correction to Batch 03: the prior version of this file was a
// source-text test — it asserted that strings appeared in the source
// code, not that behaviour occurred. Source order and runtime
// behaviour are different claims. The behavioural test FR-070 names
// observes behaviour: it drives the pure `decideAdWrite` function
// with synthetic inputs and asserts on returned values.
//
// The function under test lives at:
//   functions/src/learning/fieldLevelDiscrimination.ts
// `decideAdWrite` was extracted from `shared.ts` per-ad loop into a
// pure helper for exactly this reason. The wire-up in `shared.ts`
// passes the values it would have used inline; behaviour is identical.

import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    decideAdWrite,
} = require("../../learning/fieldLevelDiscrimination.js");

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
        adName: "Test Ad",
        existingData: undefined,
        ledgerReadFailed: false,
        match: {
            generationId: "gen-1",
            matchType: "auto_hash" as const,
            matchDistance: 3,
            imageHash: "hash-1",
        },
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
        keepMetadataUnavailable: false,
        ...overrides,
    };
}

// ─── FR-070's named test, by assertion ─────────────────────────

test("FR-070 named assertion: forces a read failure and asserts no contribution was added", () => {
    // Set up: prior run linked the ad manually.
    const priorDoc = {
        adId: "ad-1",
        generationId: "gen-PRIOR",
        matchType: "manual" as const,
        matchDistance: 0,
        metadataAvailable: true,
    };
    // This sync's bounded-read chunk failed for this ad.
    const decision = decideAdWrite(
        baseInput({
            existingData: priorDoc,
            ledgerReadFailed: true,
            // The fresh-from-Meta match also points somewhere; we do
            // not trust it under FR-070.
            match: {
                generationId: "gen-FRESH",
                matchType: "auto_hash" as const,
                matchDistance: 7,
                imageHash: "hash-fresh",
            },
        }),
    );

    // The contribution test: failed-read ads do NOT appear in
    // learnedAds. This is the assertion FR-070 names.
    assert.equal(
        decision.inLearnedAds,
        false,
        "FR-070: a forced failed-read ad must NOT contribute (`inLearnedAds === false`)",
    );
});

test("FR-070 linking fields preserved: failed-read adDoc omits linking fields (merge preserves)", () => {
    // The failed-read branch must omit linking fields from the adDoc,
    // so merge:true on the write preserves whatever the prior doc held.
    // The discriminator is field-level: the operational fields ARE
    // present and current.
    const decision = decideAdWrite(baseInput({ ledgerReadFailed: true }));

    // Linking fields are absent (undefined) — merge will not touch them.
    assert.equal(
        decision.adDoc.generationId,
        undefined,
        "FR-070: linking field generationId must be OMITTED on failed-read (merge preserves prior)",
    );
    assert.equal(
        decision.adDoc.matchType,
        undefined,
        "FR-070: linking field matchType must be OMITTED on failed-read (merge preserves prior)",
    );
    assert.equal(
        decision.adDoc.matchDistance,
        undefined,
        "FR-070: linking field matchDistance must be OMITTED on failed-read (merge preserves prior)",
    );
    assert.equal(
        decision.adDoc.metadataAvailable,
        undefined,
        "FR-070: linking field metadataAvailable must be OMITTED on failed-read (merge preserves prior)",
    );
});

test("FR-070 operational freshness preserved: failed-read adDoc has the current sync's operational fields", () => {
    // SC-049's property: operational status must be current for every
    // ad in the batch, even when the bounded read failed. The failed-
    // read ad still receives its updated spend/conversions/verdict.
    const decision = decideAdWrite(
        baseInput({
            ledgerReadFailed: true,
            metrics: {
                spend3d: 999, spend7d: 8888, spendToday: 123,
                impressions3d: 5000, cpa3d: 5, ctrLink: 0.10, ctrAll: 0.09,
                conversions3d: 200, frequency3d: 2.0, cpm3d: 1.5, peak1dCtr: 0.20,
            },
        }),
    );

    assert.equal(decision.adDoc.spend3d, 999, "operational: spend3d is current");
    assert.equal(decision.adDoc.spend7d, 8888, "operational: spend7d is current");
    assert.equal(decision.adDoc.conversions3d, 200, "operational: conversions3d is current");
    assert.equal(decision.adDoc.ctrLink, 0.10, "operational: ctrLink is current");
    assert.equal(decision.adDoc.verdict, "🟢", "operational: verdict is current");
});

test("FR-070 discrimination is field-level: a single call has both halves correct", () => {
    // The structural discriminator test: in a single decision, BOTH
    // halves must hold simultaneously.
    //
    //   inLearnedAds === false          ← no contribution (FR-070)
    //   adDoc.generationId === undefined  ← linking field omitted (merge preserves)
    //   adDoc.spend3d === 999            ← operational field current (SC-049)
    //
    // A single-half test could pass under either interpretation:
    //   - skip the whole write → operational is stale (wrong)
    //   - write everything as null → linking is overwritten (wrong)
    //
    // The field-level discriminator must produce BOTH simultaneously.
    const decision = decideAdWrite(
        baseInput({
            ledgerReadFailed: true,
            metrics: { ...baseInput().metrics, spend3d: 999 },
        }),
    );

    assert.equal(decision.inLearnedAds, false, "inLearnedAds must be false");
    assert.equal(decision.adDoc.generationId, undefined, "linking fields must be omitted");
    assert.equal(decision.adDoc.spend3d, 999, "operational fields must be current");
});

// ─── Reverse direction: a non-failed read keeps existing behaviour ──

test("FR-070 reverse: a successful read contributes AND includes linking fields", () => {
    // The opposite side of the discriminator. Without this, an
    // implementation could pass the FR-070 tests above by simply
    // skipping every write — which would freeze everything.
    const decision = decideAdWrite(
        baseInput({
            ledgerReadFailed: false,
            match: {
                generationId: "gen-fresh-auto",
                matchType: "auto_hash" as const,
                matchDistance: 2,
                imageHash: "hash-fresh",
            },
        }),
    );

    assert.equal(decision.inLearnedAds, true, "successful reads DO contribute");
    assert.equal(decision.adDoc.generationId, "gen-fresh-auto", "linking field present on success");
    assert.equal(decision.adDoc.matchType, "auto_hash", "linking field present on success");
    assert.equal(decision.adDoc.matchDistance, 2, "linking field present on success");
    // metadataAvailable is computed: generationId !== null → true
    assert.equal(decision.adDoc.metadataAvailable, true, "metadataAvailable derived from generationId");
});

test("FR-070 precedence lock: a prior manual link is preserved on a successful read", () => {
    // FR-074a's precedence lock: when the existing doc says `manual`
    // (or auto_hash), the fresh match cannot override it. The decision
    // is observable as `decision.adDoc.generationId === prior.gen`.
    const priorDoc = {
        adId: "ad-1",
        generationId: "gen-PRIOR-manual",
        matchType: "manual" as const,
        matchDistance: 0,
        metadataAvailable: true,
    };
    const decision = decideAdWrite(
        baseInput({
            ledgerReadFailed: false,
            existingData: priorDoc,
            // Fresh match points somewhere else entirely.
            match: {
                generationId: "gen-fresh-auto",
                matchType: "auto_hash" as const,
                matchDistance: 5,
                imageHash: "hash-fresh",
            },
        }),
    );

    assert.equal(decision.adDoc.generationId, "gen-PRIOR-manual",
        "FR-074a precedence: prior manual link wins over fresh auto match");
    assert.equal(decision.adDoc.matchType, "manual", "FR-074a precedence: matchType is preserved");
});

test("FR-070 first-ever sync with failed read: no linking fields, no contribution", () => {
    // Edge case: a brand-new account, first-ever sync, the bounded
    // read fails for an ad. existingData is undefined. The decision
    // is the same shape as for a re-sync with a failed read, but
    // there's no prior doc to preserve — the merge creates a doc
    // with operational fields only and the linking fields absent.
    const decision = decideAdWrite(
        baseInput({
            existingData: undefined,
            ledgerReadFailed: true,
            match: null,  // image match also failed this sync
        }),
    );

    assert.equal(decision.inLearnedAds, false, "first-ever failed read: no contribution");
    assert.equal(decision.adDoc.generationId, undefined, "first-ever failed read: linking field absent");
    assert.equal(decision.adDoc.matchType, undefined, "first-ever failed read: linking field absent");
    assert.equal(decision.adDoc.spend3d, 100, "first-ever failed read: operational field present");
});

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log("=== FR-070 (T018b) — field-level discrimination (BEHAVIOURAL) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
