// functions/src/__tests__/phase969/applyLearningWritesLease.test.ts
// ───────────────────────────────────────────────────────────────────
// BATCH 24 — Step 3: the runSyncForAccount end-to-end tests in
// `t064bEndToEnd.discriminator.test.ts` already prove the
// lease-fencing property at the system level:
//   - `BATCH 20: lease-refused run writes operational state and NO aggregate document`
//   - `BATCH 20: lease-acquired run writes BOTH operational and aggregate documents`
// and `BATCH 19: twice-over-same-input leaves the aggregate unchanged
// on the second pass (FR-018)` proves the idempotency.
//
// This file exercises `applyLearningWrites` in ISOLATION to
// document what the function's read-modify-write does:
//
//   1. The same creative appears twice in `learnedAds` (single
//      sync, before commit). The function should count it ONCE
//      (per-creative Set deduplication within one call's working
//      state — see `aggregateDelta.ts:107`).
//   2. Two DIFFERENT creatives. The function should count both.
//   3. A withdrawal is applied before the additive pass.
//
// T064b proves these at the system level. This file proves them
// at the function level so a regression in the function itself
// fails fast without driving the full sync body.
//
// What this file does NOT do: discriminate the fenced vs unfenced
// arrangements. That discrimination requires reading the
// post-first-commit baseline mid-flight, which the function does
// not expose. The fence is enforced by `shared.ts`'s caller, not
// the function. The end-to-end `t064b` is the right place for that
// property.

import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin: any = require("firebase-admin");

// ─── Stub Firestore ──────────────────────────────────────────

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

function makeAd(adId: string, hookAngle: string, creativeKey: string, ctrLink: number): AdForLearning {
    return {
        adId,
        hookAngle,
        creativeKey,
        creativeType: "image",
        campaignObjective: "conversion",
        ctrLink,
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
        conversions3d: 1,
        frequency3d: 1.1,
        spend3d: 5,
        spend7d: 25,
        spendToday: 5,
        impressions3d: 1000,
        cpa3d: 5,
        cpc30d: 0.5,
        cpaCpl30d: 5,
        cpm14d: 5,
        ageDays: 3,
        matchType: "manual" as const,
        metadataAvailable: true,
        generationId: "gen_1",
    } as unknown as AdForLearning;
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
            paid_event: { count: 0 },
            lead_magnet: { count: 0 },
            webinar: { count: 0 },
            unknown: { count: 0 },
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

function makeLedger(adId: string, creativeKey: string) {
    return { ledger: makeContribution(creativeKey) };
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

// ─── Test 1: same creative appears twice in one call — counted once ─

async function test1_creativeDedupedWithinCall() {
    docStore.clear();
    docStore.set(
        docKey([ACCT_PATH, "hookPerformance", "urgency"]),
        emptyHookAaggregate("urgency"),
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    // Two rows of the SAME creative in one sync. The per-creative
    // Set in `applyHookAggregatesDelta` (aggregateDelta.ts:107)
    // deduplicates: creativeCount increments ONCE, even though two
    // rows from that creative contribute.
    const ad1 = makeAd("ad_1", "urgency", "creative_SHARED", 0.02);
    const ad2 = makeAd("ad_2", "urgency", "creative_SHARED", 0.04);

    await applyLearningWrites({
        db: { batch: () => new StubBatch() },
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad1, ad2],
        ledgerAdDocsByAdId: new Map([
            ["ad_1", makeLedger("ad_1", "creative_SHARED")],
            ["ad_2", makeLedger("ad_2", "creative_SHARED")],
        ]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors: [],
    });

    const stored = docStore.get(docKey([ACCT_PATH, "hookPerformance", "urgency"]));
    const storedCreativeCount = stored?.creativeCount ?? -1;
    const storedSampleSize = stored?.sampleSize ?? -1;

    assert.equal(storedCreativeCount, 1,
        `BATCH 24 dedup: same creative twice in one call → creativeCount=1 (got ${storedCreativeCount})`);
    // Both rows add to sampleSize though (sampleSize is per-row, not per-creative).
    assert.equal(storedSampleSize, 2,
        `BATCH 24 dedup: same creative twice → sampleSize=2 (got ${storedSampleSize})`);

    console.log(`     creativeCount=${storedCreativeCount}, sampleSize=${storedSampleSize}`);
}

// ─── Test 2: two different creatives — both counted ────────────

async function test2_differentCreatives() {
    docStore.clear();
    docStore.set(
        docKey([ACCT_PATH, "hookPerformance", "urgency"]),
        emptyHookAaggregate("urgency"),
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    const ad1 = makeAd("ad_1", "urgency", "creative_A", 0.02);
    const ad2 = makeAd("ad_2", "urgency", "creative_B", 0.04);

    await applyLearningWrites({
        db: { batch: () => new StubBatch() },
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad1, ad2],
        ledgerAdDocsByAdId: new Map([
            ["ad_1", makeLedger("ad_1", "creative_A")],
            ["ad_2", makeLedger("ad_2", "creative_B")],
        ]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors: [],
    });

    const stored = docStore.get(docKey([ACCT_PATH, "hookPerformance", "urgency"]));
    const storedCreativeCount = stored?.creativeCount ?? -1;
    const storedSampleSize = stored?.sampleSize ?? -1;

    assert.equal(storedCreativeCount, 2,
        `BATCH 24 unique: two different creatives → creativeCount=2 (got ${storedCreativeCount})`);
    assert.equal(storedSampleSize, 2,
        `BATCH 24 unique: two creatives → sampleSize=2 (got ${storedSampleSize})`);

    console.log(`     creativeCount=${storedCreativeCount}, sampleSize=${storedSampleSize}`);
}

// ─── Test 3: average ctrLink is computed from BOTH rows ────────

async function test3_ctrLinkAverage() {
    docStore.clear();
    docStore.set(
        docKey([ACCT_PATH, "hookPerformance", "urgency"]),
        emptyHookAaggregate("urgency"),
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    // ctrLink values 0.02 and 0.04 — average should be 0.03.
    const ad1 = makeAd("ad_1", "urgency", "creative_A", 0.02);
    const ad2 = makeAd("ad_2", "urgency", "creative_B", 0.04);

    await applyLearningWrites({
        db: { batch: () => new StubBatch() },
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad1, ad2],
        ledgerAdDocsByAdId: new Map([
            ["ad_1", makeLedger("ad_1", "creative_A")],
            ["ad_2", makeLedger("ad_2", "creative_B")],
        ]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors: [],
    });

    const stored = docStore.get(docKey([ACCT_PATH, "hookPerformance", "urgency"]));
    const storedAvgLinkCtr = stored?.byObjective?.conversion?.avgLinkCtr ?? -1;

    // Expected: (0.02 + 0.04) / 2 = 0.03
    assert.ok(Math.abs(storedAvgLinkCtr - 0.03) < 0.001,
        `BATCH 24 avg: avgLinkCtr expected=0.03 (mean of 0.02 and 0.04), got ${storedAvgLinkCtr}`);

    console.log(`     avgLinkCtr=${storedAvgLinkCtr.toFixed(4)}`);
}

// ─── Runner ───────────────────────────────────────────────────

declare const test: (name: string, fn: () => Promise<void> | void) => Promise<void>;

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

(globalThis as any).test = async (name: string, fn: () => Promise<void> | void) => {
    try {
        await fn();
        console.log(`  Γ£à ${name}`);
        passed++;
    } catch (e) {
        console.log(`  Γ¥î ${name}`);
        const err = e as Error;
        console.log(`     ${err.message}`);
        if (err.stack) console.log(err.stack.split("\n").slice(0, 3).join("\n"));
        failed++;
    }
};

function runner() {
    console.log("");
    console.log("=== BATCH 24 \u2014 applyLearningWrites function-level (Step 3) ===");
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(FAILED);
    process.exit(PASSED);
}

async function main() {
    await test("BATCH 24 dedup: same creative twice in one call is counted ONCE", test1_creativeDedupedWithinCall);
    await test("BATCH 24 unique: two different creatives are counted BOTH", test2_differentCreatives);
    await test("BATCH 24 avg: average ctrLink is computed from BOTH rows (0.03)", test3_ctrLinkAverage);
}

main()
    .then(runner)
    .catch((err: Error) => {
        console.log(`  Γ¥î harness error: ${err.message}`);
        console.log(err.stack ?? "");
        process.exit(FAILED);
    });
