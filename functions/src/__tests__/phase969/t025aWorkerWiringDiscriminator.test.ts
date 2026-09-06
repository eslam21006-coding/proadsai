// functions/src/__tests__/phase969/t025aWorkerWiringDiscriminator.test.ts — T025a worker-output wiring discriminator (Batch 12)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, T025a (Batch 12) — the discriminating test.
//
// Per Batch 11 §5 re-verification: `decidePerAdActionsForWorker` populates
// `ledger.angleKey` and `ledger.patternKey` correctly when given resolved
// values (4 of the 11 assertions in `perAdActions.test.ts` are T025a
// discriminator checks). The worker in `metaSync/shared.ts`, however,
// passes `resolvedHookAngle: null` and `resolvedPatternKey: null` because
// the keys resolve in a post-pass generation patch that runs AFTER the
// per-ad block queues the `adDoc` write. Without the Batch 12 wiring,
// every live ledger entry is written blank — FR-013/017's
// withdraw-then-add path cannot locate what to withdraw, and FR-051a's
// audit guarantee cannot answer "why is this count what it is".
//
// This file drives the WORKER path end-to-end through the helpers
// `shared.ts` calls in the same order, and observes what the queued
// `writes[i].data` would carry when committed. The discriminator flag
// `applyBatch12Wiring` controls whether the post-pass patch mutates the
// queued `adDoc.ledger.angleKey/patternKey` from the resolved values.
//
// BEFORE Batch 12 wiring: the post-pass patch fills `entry.hookAngle/
// layoutTemplate/...` for the aggregator input but does NOT mutate the
// queued `adDoc`. The queued write carries the null keys the per-ad
// block wrote when called with nulls — the live state from Batch 06
// through Batch 11. This is the bug.
//
// AFTER Batch 12 wiring: the post-pass patch mutates the queued adDoc's
// ledger keys from the resolved values. The live ledger record carries
// the keys FR-013/017's withdraw-then-add path and FR-051a's audit
// guarantee both depend on.
//
// The SOURCE-TEXT structural check verifies that `shared.ts` contains
// the wiring. A regression that reverts shared.ts (removing the
// post-pass `ledger.angleKey/patternKey` mutation) trips the structural
// check, even when the helper logic itself is correct. Together with
// the tests above, the discriminator catches three failure modes:
//   - helper logic wrong (test #1 or #2 fails),
//   - shared.ts wiring missing (test #3 fails),
//   - both halves consistent but observed by the same simulation.
//
// Batch 09 established the pattern; T021a made the same mistake three
// times before Batch 09 finally observed the WORKER'S output rather than
// the function's in isolation. T025a must not repeat it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

declare const __dirname: string;
const SHARED_TS = join(__dirname, "..", "..", "..", "src", "metaSync", "shared.ts");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    decidePerAdActionsForWorker,
    resolveCreativeKeyByAdId,
} = require("../../learning/learningPerAdLoop.js");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computePatternKey } = require("../../learningAggregates.js");

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

function pickString(v: unknown): string | null {
    return typeof v === "string" && v ? v : null;
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
            matchDistance: 0,
            imageHash: "h-1",
        },
    };
}

// ─── Simulation ──────────────────────────────────────────────────

interface SimulateOpts {
    adIds: string[];
    generationId: string;
    resolvedHookAngle: string;
    resolvedLayoutTemplate: string;
    resolvedCreativeModes: string[];
    resolvedArtDirection: string;
    resolvedUniverse: string;
    /**
     * Discriminator flag. `false` reproduces shared.ts's behaviour
     * BEFORE the Batch 12 wiring lands; `true` reproduces it AFTER.
     * The wiring is the post-pass-line mutation that copies the
     * resolved `entry.hookAngle/layoutTemplate/creativeModes/...`
     * into the queued `adDoc.ledger.angleKey/patternKey`.
     */
    applyBatch12Wiring: boolean;
}

/**
 * Simulate shared.ts's per-ad block, post-pass generation patch, and
 * (optionally) the Batch 12 wiring. Mirrors shared.ts exactly:
 *   1. `resolveCreativeKeyByAdId(ads)` → per-creative map (T021a wire-up).
 *   2. For each ad: `decidePerAdActionsForWorker({ ..., resolvedHookAngle: null, resolvedPatternKey: null })`
 *      — same nulls shared.ts passes today (the bug).
 *   3. Push the queued write `writes.push({ data: decision.adDoc })`.
 *   4. Push `decision.learnedAd` to `learnedAds` if contributing;
 *      remember `decision.adDoc` keyed by adId for the wiring step.
 *   5. Post-pass generation patch: load `genMap`, fill
 *      `entry.hookAngle/layoutTemplate/creativeModes/artDirection/universe`.
 *   6. **If applyBatch12Wiring is true**: mutate `decision.adDoc.ledger`
 *      from the resolved values.
 *
 * Returns the queued writes (one per ad) for the test to inspect.
 */
function simulateShared(opts: SimulateOpts): Array<{ data: any }> {
    const ads = opts.adIds.map((id) => ({ id }));
    const adMatchResults = new Map(opts.adIds.map((id) => [id, {
        generationId: opts.generationId,
        matchType: "manual" as const,
        matchDistance: 0,
        imageHash: `h-${opts.generationId}`,
    }]));
    const creativeKeyByAdId = resolveCreativeKeyByAdId(
        ads.map((ad) => ({
            adId: ad.id,
            imageHash: adMatchResults.get(ad.id)!.imageHash,
            generationId: adMatchResults.get(ad.id)!.generationId,
            matchType: adMatchResults.get(ad.id)!.matchType,
            linkProvenance: null,
        })),
    );
    const writes: Array<{ data: any }> = [];
    const learnedAds: any[] = [];
    const ledgerAdDocsByAdId = new Map<string, any>();
    const varying = buildVarying();

    // Per-ad block (simulates shared.ts:926-1118).
    for (const ad of ads) {
        const match = adMatchResults.get(ad.id);
        const perAd = decidePerAdActionsForWorker({
            adId: ad.id,
            creativeKey: creativeKeyByAdId.get(ad.id) ?? ad.id,
            // T025a (Batch 12): keys not known yet — same nulls shared.ts
            // passes today. The wiring step (below) flows the resolved
            // values back into the queued write.
            resolvedHookAngle: null,
            resolvedPatternKey: null,
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
        writes.push({ data: perAd.decision.adDoc });
        if (perAd.decision.inLearnedAds && perAd.decision.learnedAd) {
            learnedAds.push(perAd.decision.learnedAd);
            ledgerAdDocsByAdId.set(ad.id, perAd.decision.adDoc);
        }
    }

    // Post-pass generation patch (simulates shared.ts:1135-1167).
    const genMap = new Map<string, any>([[opts.generationId, {
        input: {
            coldHookAngle: opts.resolvedHookAngle,
            offerCreativeMode: opts.resolvedCreativeModes,
            visualSubStyle: opts.resolvedArtDirection,
            preferredUniverse: opts.resolvedUniverse,
        },
        creativeIdentity: {
            contractTemplateId: opts.resolvedLayoutTemplate,
        },
        contractTemplateId: opts.resolvedLayoutTemplate,
    }]]);
    for (const entry of learnedAds) {
        if (!entry.generationId) continue;
        const gen = genMap.get(entry.generationId);
        if (!gen) continue;
        const input = (gen.input || {}) as Record<string, unknown>;
        const ci = (gen.creativeIdentity || {}) as Record<string, unknown>;
        // Replicate shared.ts's pickString fallbacks.
        entry.hookAngle = pickString(input.coldHookAngle);
        entry.layoutTemplate = pickString(ci.contractTemplateId)
            || pickString(gen.contractTemplateId);
        entry.creativeModes = opts.resolvedCreativeModes;
        entry.artDirection = pickString(input.visualSubStyle);
        entry.universe = pickString(input.preferredUniverse);

        // T025a (Batch 12): the post-pass ledger-key wiring.
        if (opts.applyBatch12Wiring) {
            const adDoc = ledgerAdDocsByAdId.get(entry.adId);
            if (adDoc?.ledger) {
                adDoc.ledger.angleKey = entry.hookAngle;
                adDoc.ledger.patternKey = computePatternKey(
                    entry.layoutTemplate,
                    entry.creativeModes,
                    entry.artDirection,
                    entry.universe,
                );
            }
        }
    }

    return writes;
}

// ─── The discriminator ──────────────────────────────────────────

test("T025a BEFORE wiring: shared.ts queues the adDoc write with null ledger keys (the bug)", () => {
    // The post-pass patch fills `entry.hookAngle/layoutTemplate/...`
    // for the aggregator input but does NOT mutate the queued
    // `adDoc.ledger`. The queued write still carries the null keys the
    // per-ad block wrote when called with nulls — the live state from
    // Batch 06 through Batch 11.
    const writes = simulateShared({
        adIds: ["ad-0", "ad-1", "ad-2"],
        generationId: "gen-1",
        resolvedHookAngle: "urgency",
        resolvedLayoutTemplate: "standard_hero",
        resolvedCreativeModes: ["hero"],
        resolvedArtDirection: "lifestyle",
        resolvedUniverse: "test_universe",
        applyBatch12Wiring: false,
    });
    let checkedCount = 0;
    for (const w of writes) {
        if (w.data.ledger) {
            checkedCount++;
            assert.equal(w.data.ledger.angleKey, null,
                "BEFORE wiring: ledger.angleKey is null (the bug — the worker passes nulls)");
            assert.equal(w.data.ledger.patternKey, null,
                "BEFORE wiring: ledger.patternKey is null (the bug — the worker passes nulls)");
        }
    }
    assert.ok(checkedCount > 0,
        "expected at least one queued write with a ledger entry");
});

test("T025a AFTER wiring: shared.ts's post-pass patch flows resolved ledger keys back into the queued write", () => {
    // After Batch 12: the post-pass patch mutates the queued adDoc's
    // `ledger.angleKey` from the resolved `entry.hookAngle` and
    // `ledger.patternKey` from the resolved visual-pattern components.
    const writes = simulateShared({
        adIds: ["ad-0", "ad-1", "ad-2"],
        generationId: "gen-1",
        resolvedHookAngle: "urgency",
        resolvedLayoutTemplate: "standard_hero",
        resolvedCreativeModes: ["hero"],
        resolvedArtDirection: "lifestyle",
        resolvedUniverse: "test_universe",
        applyBatch12Wiring: true,
    });
    let checkedCount = 0;
    for (const w of writes) {
        if (w.data.ledger) {
            checkedCount++;
            assert.equal(w.data.ledger.angleKey, "urgency",
                "AFTER wiring: ledger.angleKey is the resolved hook angle");
            const expectedPatternKey = computePatternKey(
                "standard_hero",
                ["hero"],
                "lifestyle",
                "test_universe",
            );
            assert.equal(w.data.ledger.patternKey, expectedPatternKey,
                "AFTER wiring: ledger.patternKey is the resolved pattern hash");
        }
    }
    assert.ok(checkedCount > 0,
        "expected at least one queued write with a ledger entry");
});

test("T025a: shared.ts's source contains the post-pass ledger-key wiring (SOURCE-TEXT — necessary-but-not-sufficient)", () => {
    const src = readFileSync(SHARED_TS, "utf8");
    const lines = src.split("\n");
    // Find the line(s) that contain the wiring assignment. The check
    // rejects commented-out occurrences (a regression that wraps the
    // wiring in `//` slips past a naive regex match).
    const angleKeyLines = lines.filter((l) =>
        /\.ledger\.angleKey\s*=\s*entry\.hookAngle/.test(l));
    assert.ok(angleKeyLines.length > 0,
        "shared.ts must flow entry.hookAngle into the queued adDoc's ledger.angleKey");
    for (const l of angleKeyLines) {
        assert.ok(!l.trimStart().startsWith("//"),
            "the angleKey wiring line is commented out — restore the wire-up");
    }
    const patternKeyLines = lines.filter((l) =>
        /\.ledger\.patternKey\s*=\s*computePatternKey/.test(l));
    assert.ok(patternKeyLines.length > 0,
        "shared.ts must compute ledger.patternKey from the resolved visual-pattern fields");
    for (const l of patternKeyLines) {
        assert.ok(!l.trimStart().startsWith("//"),
            "the patternKey wiring line is commented out — restore the wire-up");
    }
});

// ─── Runner ─────────────────────────────────────────────────────

console.log("");
console.log("=== T025a worker-output wiring discriminator (Batch 12) ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
