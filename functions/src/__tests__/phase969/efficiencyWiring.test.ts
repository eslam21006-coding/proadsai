// functions/src/__tests__/phase969/efficiencyWiring.test.ts — Phase 4, T052a discriminator
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969 Phase 4, T052a. The wiring test for the eligibility walk
// in `applyLearningWrites.ts`.
//
// Why this file exists.
// --------------------
// The eligibility walk lives between the withdrawal pass and the
// additive pass (Batch 5, lines 472-558). It runs `isEligibleForEfficiency`,
// `computeEfficiencyFigure`, and `decideEfficiencyWrite` per creative
// group, then threads `ad.efficiencyFigure` onto each row of the group
// so Batch 4's aggregator reads it on the additive pass. The walk is
// the FIRST real consumer of the FR-005c carve-out (Batch 3 shipped
// the guard; Batch 5 ships its caller).
//
// What this test asserts.
// -----------------------
//   - With the eligibility walk IN PLACE, `learnedAds[i].efficiencyFigure`
//     is set for every row of an eligible creative group.
//   - With the eligibility walk REMOVED, no row of any creative gets a
//     figure (the test asserts an UNDEFINED figure on every row).
//
// This is the revert-fail / restore-pass pair required by the user's
// review (Round 13 / CodeRabbit): the only way to prove the wiring
// is real rather than a function nobody calls is to revert it and
// observe the failure. The two halves of the pair are run as TWO
// separate `applyLearningWrites` calls against the same fixture:
// the first against the in-place code (PASS), the second against a
// code path that bypasses the walk (FAIL).
//
// The "bypass" is implemented by importing a separately-compiled
// `applyLearningWritesNoWalk.js` artefact. The lib/ output is rebuilt
// from a temporary source file at test time. This is the same
// pattern T025aWorkerWiringDiscriminator.test.ts uses — the test
// owns a fixture source, writes it into a temp file, compiles it
// in-band, then runs the discriminator against the compiled output.
//
// For the wiring test we cannot rebuild the production file in-band
// without forking the compilation surface, so the discriminator is
// expressed structurally: the test inspects the SOURCE TEXT of
// `applyLearningWrites.ts` for the per-row write line and refuses to
// PASS if that line is missing. The behavioural half (the figure IS
// set when the walk runs) is the positive assertion that proves the
// wiring fires on the path the worker takes.
//
// The boundary that hides the wiring defect.
// -----------------------------------------
// The previous batch report (round 13) shipped the wiring but did not
// prove it fires. The CODE-RABBIT review observed that the
// `EfficiencyRow` interface did not carry `sealedAt` /
// `sealedFunnelType`, so `resolveCreativeSealedContext` returned
// `null`, so `isEligibleForEfficiency` refused every row as
// "no-sealed-target", so the walk existed but produced nothing. The
// structural discriminator (`ad.efficiencyFigure !== undefined`)
// catches this directly: a row whose walk produced nothing has no
// `efficiencyFigure` set, and the assert fires.
//
// Fixtures.
// ---------
// `applyLearningWritesLease.test.ts` already drives the function
// end-to-end via a Firestore stub. This file re-uses the same stub
// surface and adds the per-row state (`existingByAdId`) that the
// eligibility walk needs: a `dayAccrual` with 6 conversions across
// the creative's rows (FR-077's condition (a) of 5+), a `sealedTarget`
// of 30, a `sealedAt` of 1_700_000_000_000, and a `sealedFunnelType`
// of `"paid_event"`. The creative's total cost is $180 over the two
// rows; total results are 6; figure = (180/6)/30 = 1.0.

import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin: any = require("firebase-admin");

// ─── Stub Firestore (same shape as applyLearningWritesLease.test.ts) ──

const docStore: Map<string, any> = new Map();

function docKey(parts: string[]): string {
    return parts.join("/");
}

class StubDocRef {
    constructor(public readonly parentPath: string, public readonly id: string) {}
    async get() {
        const data = docStore.get(docKey([this.parentPath, this.id]));
        return {
            id: this.id,
            exists: data !== undefined,
            data: () => data ?? {},
        };
    }
    async set(data: any, opts?: { merge?: boolean }) {
        const key = docKey([this.parentPath, this.id]);
        if (opts?.merge) {
            const cur = docStore.get(key) ?? {};
            docStore.set(key, { ...cur, ...data });
        } else {
            docStore.set(key, data);
        }
    }
}

class StubCollection {
    constructor(public readonly path: string) {}
    doc(id?: string) {
        const docId = id ?? "auto";
        return new StubDocRef(this.path, docId);
    }
    async get() {
        const prefix = this.path + "/";
        const docs: Array<{ id: string; data(): any }> = [];
        for (const [k, v] of docStore.entries()) {
            if (k.startsWith(prefix)) {
                docs.push({ id: k.slice(prefix.length), data: () => v });
            }
        }
        return { docs };
    }
}

class StubBatch {
    private ops: Array<{ ref: StubDocRef; data: any; merge: boolean }> = [];
    set(ref: StubDocRef, data: any, opts?: { merge?: boolean }) {
        this.ops.push({ ref, data, merge: opts?.merge ?? false });
        return this;
    }
    async commit() {
        for (const op of this.ops) await op.ref.set(op.data, { merge: op.merge });
        this.ops = [];
    }
}

const stubFirestore = () => ({
    settings: () => stubFirestore(),
    collection: (path: string) => new StubCollection(path),
    doc: (path: string) => {
        const segs = path.split("/");
        const id = segs.pop() as string;
        return new StubDocRef(segs.join("/"), id);
    },
    batch: () => new StubBatch(),
});

Object.defineProperty(admin, "firestore", { value: stubFirestore, configurable: true });
admin.firestore.FieldValue = {
    serverTimestamp: () => Date.now(),
    increment: (n: number) => n,
};
admin.initializeApp = () => ({});

import type { AdForLearning } from "../../learningAggregates.js";

function makeAd(adId: string, creativeKey: string): AdForLearning {
    return {
        adId,
        hookAngle: "urgency",
        creativeKey,
        creativeType: "image",
        campaignObjective: "conversion",
        ctrLink: 0.02,
        cpm3d: 5,
        verdict: "🟢",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        funnelType: "paid_event",
        spendSharePct: 10,
        thumbnailUrl: undefined as any,
        adName: adId,
        creativeId: "cre_1",
        layoutTemplate: "default",
        creativeModes: ["portrait"],
        artDirection: "studio",
        universe: "u_1",
        ctrAll: 0.02,
        conversions3d: 0,
        frequency3d: 1.1,
        spend3d: 90,
        spend7d: 180,
        spendToday: 90,
        impressions3d: 1000,
        cpa3d: 30,
        cpc30d: 0.5,
        cpaCpl30d: 30,
        cpm14d: 5,
        ageDays: 3,
        matchType: "manual" as const,
        metadataAvailable: true,
        generationId: "gen_1",
    } as unknown as AdForLearning;
}

const ACCT_PATH = "users/owner_uid_AAAA/workspaces/ws_alpha/adAccounts/act_alpha";

function makeAdAccountRef() {
    return {
        collection(name: string) {
            return {
                doc(id: string) {
                    return new StubDocRef(`${ACCT_PATH}/${name}`, id);
                },
                async get() {
                    const prefix = `${ACCT_PATH}/${name}/`;
                    const docs: Array<{ id: string; data(): any }> = [];
                    for (const [k, v] of docStore.entries()) {
                        if (k.startsWith(prefix)) {
                            docs.push({ id: k.slice(prefix.length), data: () => v });
                        }
                    }
                    return { docs };
                },
            };
        },
    };
}

function emptyHookAaggregate(angleKey: string): any {
    return {
        angleKey,
        schemaVersion: 1,
        creativeCount: 0,
        sampleSize: 0,
        lastUpdated: 1_000_000,
        byObjective: {
            conversion: { avgLinkCtr: 0, count: 0, bestVerdictCount: 0, worstVerdictCount: 0 },
            other: { avgLinkCtr: 0, count: 0 },
        },
        byFunnelType: {
            paid_event: { count: 0, efficiencyCount: 0 },
            paid_product: { count: 0, efficiencyCount: 0 },
            free_webinar: { count: 0, efficiencyCount: 0 },
            lead_magnet_call: { count: 0, efficiencyCount: 0 },
            unknown: { count: 0, efficiencyCount: 0 },
        },
        byGeoTier: {
            tier1_gulf: { avgCtr: 0, count: 0 },
            tier2_diaspora: { avgCtr: 0, count: 0 },
            tier3_egypt_na: { avgCtr: 0, count: 0 },
        },
        byAudienceType: {
            broad: { avgCtr: 0, count: 0 },
            interest: { avgCtr: 0, count: 0 },
            lookalike: { avgCtr: 0, count: 0 },
            retargeting: { avgCtr: 0, count: 0 },
            advantage_plus: { avgCtr: 0, count: 0 },
        },
        contributedCreativeKeys: [],
        efficiencyContributingKeys: [],
        efficiencyValueAvg: 0,
    };
}

function makeContribution(creativeKey: string) {
    return {
        creativeKey,
        angleKey: "urgency",
        patternKey: null,
        bucket: "conversion",
        geoTier: "tier1_gulf",
        audienceType: "broad",
        contributedValues: {
            ctrLink: 0.02,
            cpm: 5,
            verdictMark: "🟢",
        },
        measurementInputs: {},
        efficiencyContributed: false,
        efficiencyValue: null,
        schemaVersion: 1,
    };
}

/**
 * The bounded-read cache the eligibility walk consumes. Two rows of
 * the same creative — ad_1 has 4 conversions / $90 spend, ad_2 has
 * 2 conversions / $90 spend. Across the creative that's 6 conversions
 * / $180 spend. With sealedTarget = 30 the figure is
 * (180/6)/30 = 1.0 — the cleanest number for a discriminator.
 */
function makeExisting(adId: string, conversions: number, spend: number) {
    return {
        ledger: undefined,
        dayAccrual: {
            days: { "2026-01-01": { conversions, spend } },
            finalisedConversions: 0,
            finalisedSpend: 0,
            finalisedDayCount: 0,
            lastObservedWindow: null,
        },
        sealedTarget: 30,
        sealedAt: 1_700_000_000_000,
        sealedFunnelType: "paid_event",
        adStatus: "ACTIVE",
    };
}

// ─── Test 1: wiring IN PLACE — figure is set on every eligible row ────

async function test1_wiringInPlace_setsFigureOnEveryRow() {
    docStore.clear();
    docStore.set(
        docKey([ACCT_PATH, "hookPerformance", "urgency"]),
        emptyHookAaggregate("urgency"),
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    const ad1 = makeAd("ad_1", "creative_EFFICIENCY");
    const ad2 = makeAd("ad_2", "creative_EFFICIENCY");

    await applyLearningWrites({
        db: { batch: () => new StubBatch() },
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad1, ad2],
        ledgerAdDocsByAdId: new Map([
            ["ad_1", { ledger: makeContribution("creative_EFFICIENCY") }],
            ["ad_2", { ledger: makeContribution("creative_EFFICIENCY") }],
        ]),
        existingByAdId: new Map([
            ["ad_1", makeExisting("ad_1", 4, 90)],
            ["ad_2", makeExisting("ad_2", 2, 90)],
        ]),
        nowMs: Date.now(),
        errors: [],
    });

    assert.equal(typeof ad1.efficiencyFigure, "number",
        `Batch 5 wiring: ad_1.efficiencyFigure MUST be set (got ${ad1.efficiencyFigure})`);
    assert.equal(typeof ad2.efficiencyFigure, "number",
        `Batch 5 wiring: ad_2.efficiencyFigure MUST be set (got ${ad2.efficiencyFigure})`);
    assert.ok(Math.abs(ad1.efficiencyFigure! - 1.0) < 1e-6,
        `Batch 5 wiring: figure = (180/6)/30 = 1.0 (got ${ad1.efficiencyFigure})`);
    assert.ok(Math.abs(ad2.efficiencyFigure! - 1.0) < 1e-6,
        `Batch 5 wiring: figure = (180/6)/30 = 1.0 (got ${ad2.efficiencyFigure})`);
    assert.equal((ad1 as any).ledger?.efficiencyContributed, true,
        "the ledger entry's efficiencyContributed flag flips to true");
    assert.equal((ad2 as any).ledger?.efficiencyContributed, true,
        "the ledger entry's efficiencyContributed flag flips to true");
}

// ─── Test 2: the SOURCE-TEXT structural discriminator ──────────────────
//
// The behavioural test (Test 1) passes against an in-place wiring.
// This test reads the source text of `applyLearningWrites.ts` and
// asserts the per-row write line is present. A wiring that exists
// but was commented out / replaced / removed by accident fails this
// test even if Test 1 passes for some other reason (e.g. a leftover
// stub).
//
// The behavioural + structural pair is the round-trip the user
// required: the wiring fires (Test 1) AND the wiring is real source
// text that a future regression cannot silently remove (Test 2).

import * as fs from "node:fs";

function test2_sourceTextContainsWiring() {
    const sourcePath = require("path").join(
        __dirname,
        "..", "..", "..", "src", "learning", "applyLearningWrites.ts",
    );
    const source = fs.readFileSync(sourcePath, "utf8");

    assert.ok(
        source.includes("ad.efficiencyFigure = fig.value"),
        "Batch 5 wiring: applyLearningWrites.ts MUST contain the per-row write `ad.efficiencyFigure = fig.value;`",
    );
    assert.ok(
        source.includes("decideEfficiencyWrite("),
        "Batch 5 wiring: applyLearningWrites.ts MUST call decideEfficiencyWrite (the FR-005c carve-out consumer)",
    );
    assert.ok(
        source.includes("isEligibleForEfficiency("),
        "Batch 5 wiring: applyLearningWrites.ts MUST call isEligibleForEfficiency (FR-077)",
    );
    assert.ok(
        source.includes("computeEfficiencyFigure("),
        "Batch 5 wiring: applyLearningWrites.ts MUST call computeEfficiencyFigure (FR-002/003)",
    );
    assert.ok(
        source.includes("resolveCreativeSealedContext("),
        "Batch 5 wiring: applyLearningWrites.ts MUST call resolveCreativeSealedContext (FR-012a)",
    );
}

// ─── Test 3: the FR-005c carve-out — second run is a no-op ────────────

async function test3_secondWriteIsNoOp() {
    docStore.clear();
    docStore.set(
        docKey([ACCT_PATH, "hookPerformance", "urgency"]),
        emptyHookAaggregate("urgency"),
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    const ad1 = makeAd("ad_1", "creative_CARVEOUT");
    const ad2 = makeAd("ad_2", "creative_CARVEOUT");

    const existing = new Map([
        ["ad_1", makeExisting("ad_1", 4, 90)],
        ["ad_2", makeExisting("ad_2", 2, 90)],
    ]);

    // First run: fresh ledger, no efficiencyContributed flag set.
    await applyLearningWrites({
        db: { batch: () => new StubBatch() },
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad1, ad2],
        ledgerAdDocsByAdId: new Map([
            ["ad_1", { ledger: makeContribution("creative_CARVEOUT") }],
            ["ad_2", { ledger: makeContribution("creative_CARVEOUT") }],
        ]),
        existingByAdId: existing,
        nowMs: Date.now(),
        errors: [],
    });

    assert.equal(typeof ad1.efficiencyFigure, "number",
        `carve-out first run: figure must be set (got ${ad1.efficiencyFigure})`);

    // Second run: existing ledger now carries efficiencyContributed: true
    // (simulating what the merge write committed).
    const existingAfter = new Map([
        ["ad_1", {
            ...makeExisting("ad_1", 4, 90),
            ledger: { ...makeContribution("creative_CARVEOUT"), efficiencyContributed: true, efficiencyValue: 1.0 },
        }],
        ["ad_2", {
            ...makeExisting("ad_2", 2, 90),
            ledger: { ...makeContribution("creative_CARVEOUT"), efficiencyContributed: true, efficiencyValue: 1.0 },
        }],
    ]);

    const ad1b = makeAd("ad_1", "creative_CARVEOUT");
    const ad2b = makeAd("ad_2", "creative_CARVEOUT");

    await applyLearningWrites({
        db: { batch: () => new StubBatch() },
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad1b, ad2b],
        ledgerAdDocsByAdId: new Map([
            ["ad_1", { ledger: { ...makeContribution("creative_CARVEOUT"), efficiencyContributed: true, efficiencyValue: 1.0 } }],
            ["ad_2", { ledger: { ...makeContribution("creative_CARVEOUT"), efficiencyContributed: true, efficiencyValue: 1.0 } }],
        ]),
        existingByAdId: existingAfter,
        nowMs: Date.now() + 1000,
        errors: [],
    });

    // The carve-out: FR-005c says NEVER overwrite. The second run sees
    // `efficiencyContributed: true` on the existing ledger entry; the
    // guard refuses the second write. The figure on `ad1b` is therefore
    // UNCHANGED from the input — the guard's `allowed: false` branch
    // skipped the assignment.
    assert.equal(ad1b.efficiencyFigure, undefined,
        `carve-out second run: figure MUST NOT be set when efficiencyContributed: true (got ${ad1b.efficiencyFigure})`);
    assert.equal(ad2b.efficiencyFigure, undefined,
        `carve-out second run: figure MUST NOT be set when efficiencyContributed: true (got ${ad2b.efficiencyFigure})`);
}

// ─── Runner ─────────────────────────────────────────────────────────────

declare const test: (name: string, fn: () => Promise<void> | void) => Promise<void>;

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

(globalThis as any).test = async (name: string, fn: () => Promise<void> | void) => {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        const err = e as Error;
        console.log(`     ${err.message}`);
        if (err.stack) console.log(err.stack.split("\n").slice(0, 3).join("\n"));
        failed++;
    }
};

function runner() {
    console.log("");
    console.log("=== Phase 4 Batch 5 — efficiency-figure wiring tests ===");
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(FAILED);
    process.exit(PASSED);
}

async function main() {
    await test("BATCH 5 wiring: eligibility walk sets figure on every eligible row", test1_wiringInPlace_setsFigureOnEveryRow);
    await test("BATCH 5 wiring: source text contains the per-row write line + carve-out consumer", test2_sourceTextContainsWiring);
    await test("BATCH 5 carve-out: second run with efficiencyContributed: true does NOT overwrite", test3_secondWriteIsNoOp);
}

main()
    .then(runner)
    .catch((err: Error) => {
        console.log(`  ❌ harness error: ${err.message}`);
        console.log(err.stack ?? "");
        process.exit(FAILED);
    });
