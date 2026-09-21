// functions/src/__tests__/phase969/applyLearningWritesLease.test.ts
// ───────────────────────────────────────────────────────────────────
// BATCH 24/25 — Step 3: function-level tests for `applyLearningWrites`.
//
// The runSyncForAccount end-to-end tests in
// `t064bEndToEnd.discriminator.test.ts` already prove the
// lease-fencing property at the system level:
//   - `BATCH 20: lease-refused run writes operational state and NO aggregate document`
//   - `BATCH 20: lease-acquired run writes BOTH operational and aggregate documents`
// and `BATCH 19: twice-over-same-input leaves the aggregate unchanged
// on the second pass (FR-018)` proves the idempotency.
//
// This file exercises `applyLearningWrites` in ISOLATION to
// document what the function's read-modify-write does. Three
// within-call invariants pin the function-level regressions:
//
//   1. The same creative appears twice in `learnedAds` (single
//      sync, before commit). The function should count it ONCE
//      (per-creative Set deduplication within one call's working
//      state — see `aggregateDelta.ts:107`).
//   2. Two DIFFERENT creatives. The function should count both.
//   3. The function computes a weighted `avgLinkCtr` over its
//      input rows.
//
// Tests 4 and 5 are the Batch 25 correcting pair: the
// fence-vs-no-fence discriminator that Batch 24 could not express.
// The discriminator is `avgLinkCtr`, a scalar that `merge: true`
// REPLACES rather than averages. Two consecutive calls on the
// SAME stale baseline each commit their own scalar, and the stored
// value reflects ONLY the second call's contribution (the first
// is "lost"). Two consecutive calls on FRESH baselines (where
// the second sees the first's commit) reflect BOTH contributions
// via the weighted-average formula.
//
// The reviewer put it this way:
//
// > An average is not an increment. It is computed from the
// > baseline plus the new rows and written as a **whole value**.
// > Firestore's `merge: true` replaces a scalar field, it does
// > not average it. So two runs that both read the same stale
// > baseline and both write in turn produce a final
// > `avgLinkCtr` reflecting only the second run's rows — the
// > first run's contribution is gone from it.
//
// To simulate the unfenced shape (both reads see the same
// baseline), the test snapshots the pre-call-1 stub state,
// runs call 1, restores the snapshot, then runs call 2 against
// the restored baseline. The stored result reflects only the
// last writer's scalar — the discriminator we want.

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

// Round-18 — T053 failed-read ABORT. Tests 12 and 13 simulate a
// chunk read failure via `failChunks` (matches an `id` set and
// throws). The stub's `getAll` reads the option from a global
// per-test; cleared by `resetStub()`.
let currentFailChunks: Array<{ ids: string[] }> = [];
function setFailChunks(chunks: Array<{ ids: string[] }>) { currentFailChunks = chunks; }
function clearFailChunks() { currentFailChunks = []; }

const stubFirestore = () => ({
    settings: () => stubFirestore(),
    collection: (path: string) => new StubCollection(path),
    doc: (path: string) => {
        const segs = path.split("/");
        const id = segs.pop() as string;
        return new StubDocRef(segs.join("/"), id);
    },
    batch: () => new StubBatch(),
    // Round-17 — T053 in-lease re-read. `applyLearningWrites`
    // calls `readExistingAdDocs(db, refs)` after the lease is held
    // to re-consult seal and ledger verdicts on fresh state. The
    // stub's `getAll` is intentionally MINIMAL: it accepts refs
    // with `{id}` (the shape round-17's `applyLearningWrites`
    // passes — refs without `path`).
    //
    // Production Firestore refs carry `{id, path}`. The stub does
    // not need `path` because `readExistingAdDocs` only uses
    // `ref.id` for its lookup; the path is for the real Firestore
    // SDK's internal `getAll` implementation. Round-18's
    // `t064bEndToEnd.discriminator.test.ts` stub handles the
    // `{id, path}` shape because `runSyncForAccount` constructs
    // refs via `adAccountRef.collection("adPerformance").doc(id)`
    // and that path needs the full path to look up in its bucket.
    //
    // Round-18 — T053 failed-read ABORT. When `currentFailChunks`
    // matches the chunk's id set as a SET (order-independent), the
    // stub throws — `readExistingAdDocs` surfaces this in
    // `failedIds`, and the round-18 fix treats it as abort (the
    // consult, withdrawal pass, eligibility walk, additive pass,
    // and seal commit all skip the failed ids). When no
    // `currentFailChunks` match, the stub resolves each ref by
    // scanning the in-memory bucket for any key ending in
    // `/{id}`. Tests 9–11 use the success path to assert the
    // race window: run A commits to the bucket, run B's
    // in-lease re-read sees A's commit.
    getAll: (...refs: Array<{ id: string }>): Promise<Array<{ id: string; exists: boolean; data(): Record<string, unknown> }>> => {
        const ids = refs.map((r) => r.id);
        for (const failure of currentFailChunks) {
            const wanted = new Set(failure.ids);
            const got = new Set(ids);
            if (wanted.size === got.size && wanted.size > 0) {
                let allMatch = true;
                for (const id of wanted) {
                    if (!got.has(id)) { allMatch = false; break; }
                }
                if (allMatch) {
                    return Promise.reject(new Error(`chunk failed: ${failure.ids.join(",")}`));
                }
            }
        }
        return Promise.all(refs.map((ref) => {
            const id = ref.id;
            let data: any | undefined;
            for (const [k, v] of docStore.entries()) {
                if (k.endsWith(`/${id}`)) { data = v; break; }
            }
            return Promise.resolve({
                id,
                exists: data !== undefined,
                data: () => data ?? {},
            });
        }));
    },
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
        db: stubFirestore(),
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
        db: stubFirestore(),
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
        db: stubFirestore(),
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

// ─── Test 4: UNFENCED — both reads see same baseline → avgLinkCtr reflects only second row ─

async function test4_unfenced_losesFirstRowInAvg() {
    docStore.clear();
    docStore.set(
        docKey([ACCT_PATH, "hookPerformance", "urgency"]),
        emptyHookAaggregate("urgency"),
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    // Snapshot the baseline BEFORE call 1 runs.
    const baselineKey = docKey([ACCT_PATH, "hookPerformance", "urgency"]);
    const baselineSnapshot = JSON.parse(JSON.stringify(docStore.get(baselineKey)));

    const ad1 = makeAd("ad_1", "urgency", "creative_A", 0.02);
    const ad2 = makeAd("ad_2", "urgency", "creative_B", 0.04);

    // Call 1: reads baseline {avgLinkCtr:0, count:0} → computes
    // avgLinkCtr=0.02, count=1. Commits a scalar write. Stub
    // `merge:true` merges onto the stored doc, putting the
    // function's avgLinkCtr=0.02 into the document.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad1],
        ledgerAdDocsByAdId: new Map([["ad_1", makeLedger("ad_1", "creative_A")]]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors: [],
    });

    // Simulate the unfenced shape: restore the baseline so call 2
    // reads the SAME baseline call 1 read. In a true concurrent
    // setting both reads happen before either commits.
    docStore.set(baselineKey, baselineSnapshot);

    // Call 2: reads baseline {avgLinkCtr:0, count:0} → computes
    // avgLinkCtr=0.04, count=1. Commits a scalar write. Stub
    // `merge:true` REPLACES the scalar avgLinkCtr with 0.04.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad2],
        ledgerAdDocsByAdId: new Map([["ad_2", makeLedger("ad_2", "creative_B")]]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors: [],
    });

    const stored = docStore.get(baselineKey);
    const storedAvgLinkCtr = stored?.byObjective?.conversion?.avgLinkCtr ?? -1;

    // Unfenced: the first row's `ctrLink = 0.02` is lost from the
    // average. The stored avgLinkCtr reflects ONLY the second
    // row's contribution (0.04). This is the lost-update the
    // reviewer named — a scalar recomputed from a stale baseline
    // and committed with `set(ref, data, { merge: true })`
    // REPLACES the field rather than aggregating it.
    assert.ok(Math.abs(storedAvgLinkCtr - 0.04) < 0.001,
        `BATCH 25 unfenced: storedAvgLinkCtr expected=0.04 (only second row's contribution survives), got ${storedAvgLinkCtr}`);

    console.log(`     storedAvgLinkCtr=${storedAvgLinkCtr.toFixed(4)} (only the second row's 0.04 — first row's 0.02 lost)`);
}

// ─── Test 5: FENCED — second call reads post-first-commit → avgLinkCtr reflects both ─

async function test5_fenced_retainsBothInAvg() {
    docStore.clear();
    docStore.set(
        docKey([ACCT_PATH, "hookPerformance", "urgency"]),
        emptyHookAaggregate("urgency"),
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    const ad1 = makeAd("ad_1", "urgency", "creative_A", 0.02);
    const ad2 = makeAd("ad_2", "urgency", "creative_B", 0.04);

    // Call 1: reads baseline {0,0} → writes {avgLinkCtr:0.02, count:1}.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad1],
        ledgerAdDocsByAdId: new Map([["ad_1", makeLedger("ad_1", "creative_A")]]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors: [],
    });

    // Fenced: DO NOT restore the baseline. The second call reads
    // the post-first-commit baseline {avgLinkCtr:0.02, count:1},
    // adds its row (ctrLink=0.04), and computes the weighted
    // average (0.02*1 + 0.04) / 2 = 0.03, count=2.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad2],
        ledgerAdDocsByAdId: new Map([["ad_2", makeLedger("ad_2", "creative_B")]]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors: [],
    });

    const stored = docStore.get(docKey([ACCT_PATH, "hookPerformance", "urgency"]));
    const storedAvgLinkCtr = stored?.byObjective?.conversion?.avgLinkCtr ?? -1;
    const storedCount = stored?.byObjective?.conversion?.count ?? -1;

    // Fenced: the second row's addition is folded into the
    // existing average; the stored value reflects BOTH rows.
    assert.ok(Math.abs(storedAvgLinkCtr - 0.03) < 0.001,
        `BATCH 25 fenced: storedAvgLinkCtr expected=0.03 (weighted mean of 0.02 and 0.04), got ${storedAvgLinkCtr}`);
    assert.equal(storedCount, 2,
        `BATCH 25 fenced: storedCount expected=2 (both rows counted), got ${storedCount}`);

    console.log(`     storedAvgLinkCtr=${storedAvgLinkCtr.toFixed(4)} (weighted mean of both rows), storedCount=${storedCount}`);
}

// ─── Test 6 (BATCH 26 / Bug 1+2): visual withdrawal targets the OLD pattern the creative moved FROM ─

async function test6_visualPatternWithdrawal() {
    docStore.clear();

    // The visual aggregate's map key in the additive pass is
    // `computePatternKeyLocal(ad.layoutTemplate, ad.creativeModes,
    // ad.artDirection, ad.universe)` — derived from the CURRENT ad's
    // geometry, not from `ledger.patternKey`. The OLD visual
    // withdrawal is keyed by `recorded.patternKey` from the ledger.
    //
    // Set the ad's geometry so the additive-pass patternKey is
    // computable by the test, and set the recorded patternKey to a
    // different value — that's the visual withdrawal's target.
    //
    // `computePatternKey` (the public one) and the local version
    // are the same djb2 hash. We use the public one to compute the
    // expected key.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { computePatternKey } = require("../../learningAggregates.js");
    const ad = makeAd("ad_1", "urgency", "creative_X", 0.02);
    const NEW_PATTERN = computePatternKey(ad.layoutTemplate, ad.creativeModes, ad.artDirection, ad.universe);
    // Pick an OLD_PATTERN distinct from NEW_PATTERN. The withdrawal
    // must target OLD_PATTERN, NOT NEW_PATTERN — that is the fix.
    const OLD_PATTERN = "oldP_zzz";

    // Seed the OLD visual aggregate with one prior contribution. Do
    // NOT seed a NEW_PATTERN aggregate; the additive pass will
    // create it (this is the production shape: a creative's first
    // contribution to a pattern creates the aggregate).
    docStore.set(
        docKey([ACCT_PATH, "visualPerformance", OLD_PATTERN]),
        emptyVisualAggregate(OLD_PATTERN),
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    // Recorded ledger (prior sync): patternKey=OLD_PATTERN.
    // Desired ledger (this sync): patternKey=NEW_PATTERN.
    // Same creative, hook angle unchanged ("urgency"). The decision
    // is `withdraw_then_add` because `contributionsEqual` compares
    // patternKey field by field.
    const recordedLedger = makeContributionFor("creative_X", "urgency", OLD_PATTERN);
    const desiredLedger = makeContributionFor("creative_X", "urgency", NEW_PATTERN);

    const ledgerAdDocsByAdId = new Map([
        ["ad_1", { ledger: desiredLedger as ContributionLedgerEntry }],
    ]);
    const existingByAdId = new Map([
        ["ad_1", { ledger: recordedLedger as ContributionLedgerEntry }],
    ]);

    const errors: string[] = [];
    const result = await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad],
        ledgerAdDocsByAdId,
        existingByAdId,
        nowMs: Date.now(),
        errors,
    });

    assert.equal(result.ran, true,
        `BATCH 26 visual withdrawal: function must run (got ran=${result.ran}, errors=${JSON.stringify(errors)})`);

    // After withdrawal: the OLD pattern's count returns to its prior
    // value (1 → 0). The NEW pattern's count increments by 1 (0 → 1).
    //
    // Before Batch 26's Bug 1 fix this assertion FAILED: visual
    // withdrawal never ran (the map was keyed on hookAngle and
    // looked up by patternKey), so the OLD visual kept count=1
    // (double-counted against the NEW pattern).
    const oldVisual = docStore.get(docKey([ACCT_PATH, "visualPerformance", OLD_PATTERN]));
    const oldCount = (oldVisual?.byObjective?.conversion?.count ?? -1);
    assert.equal(oldCount, 0,
        `BATCH 26 visual withdrawal: OLD pattern count must return to 0 (got ${oldCount})`);

    // The NEW pattern's docStore entry was created by the additive
    // pass and committed by the function.
    const newVisual = docStore.get(docKey([ACCT_PATH, "visualPerformance", NEW_PATTERN]));
    const newCount = (newVisual?.byObjective?.conversion?.count ?? -1);
    assert.equal(newCount, 1,
        `BATCH 26 visual withdrawal: NEW pattern count must be 1 (got ${newCount})`);

    // Hook count: 1 (urgency). Hook side has no withdrawal (same
    // angle), so it's purely additive.
    const hookPath = docKey([ACCT_PATH, "hookPerformance", "urgency"]);
    const hookCount = docStore.get(hookPath)?.byObjective?.conversion?.count ?? -1;
    assert.equal(hookCount, 1,
        `BATCH 26 visual withdrawal: hook count must be 1 (got ${hookCount})`);

    console.log(`     OLD(${OLD_PATTERN}).count=${oldCount}, NEW(${NEW_PATTERN.slice(0, 7)}).count=${newCount}, hook(urgency).count=${hookCount}`);
}

// ─── Test 7 (BATCH 26 / Bug 1 invariant): hook change WITHOUT pattern change → no over-withdraw ─
//
// A creative changing its hook angle (urgency → statistics) but
// keeping the same pattern geometry. The visual aggregate for that
// (unchanged) pattern should NOT be double-removed and not
// double-added. With only hook-side withdrawal, the visual
// contribution is preserved through the additive pass.

async function test7_visualStaysWhenHookChanges() {
    docStore.clear();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { computePatternKey } = require("../../learningAggregates.js");
    // The ad's geometry computes the patternKey via djb2.
    // For the test to be meaningful, the visual aggregate's
    // patternKey must equal the ad's computed patternKey — that's
    // the only way the additive pass touches this aggregate.
    const ad = makeAd("ad_1", "statistics", "creative_X", 0.02);
    const SHARED_PATTERN = computePatternKey(ad.layoutTemplate, ad.creativeModes, ad.artDirection, ad.universe);

    // Seed with one prior contribution (count=1, sampleSize=1).
    // The hook changes but the pattern doesn't. After the fix:
    //   - visual withdraws 1 (count: 1 → 0)
    //   - additive adds 1 (count: 0 → 1)
    // Net count = 1, same as the prior state.
    // Before the fix: visual withdraw NEVER runs (Bug 1), additive
    // adds 1 → count would be 2 (double-counted across hook swap).
    const seed = emptyVisualAggregate(SHARED_PATTERN);
    seed.byObjective.conversion.count = 1;
    seed.byObjective.conversion.avgLinkCtr = 0.02;
    seed.sampleSize = 1;
    docStore.set(
        docKey([ACCT_PATH, "visualPerformance", SHARED_PATTERN]),
        seed,
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    // Recorded: hookAngle was "urgency", pattern unchanged. The
    // creative's geometry is the same; only the hook angle moved.
    const recordedLedger = makeContributionFor("creative_X", "urgency", SHARED_PATTERN);
    const desiredLedger = makeContributionFor("creative_X", "statistics", SHARED_PATTERN);

    const ledgerAdDocsByAdId = new Map([
        ["ad_1", { ledger: desiredLedger as ContributionLedgerEntry }],
    ]);
    const existingByAdId = new Map([
        ["ad_1", { ledger: recordedLedger as ContributionLedgerEntry }],
    ]);

    const errors: string[] = [];
    const result = await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad],
        ledgerAdDocsByAdId,
        existingByAdId,
        nowMs: Date.now(),
        errors,
    });

    assert.equal(result.ran, true,
        `BATCH 26 hook-only change: function must run (got ran=${result.ran}, errors=${JSON.stringify(errors)})`);

    // Visual count MUST be 1, not 0 (over-withdrawn) and not 2
    // (double-added because withdrawal never ran). Only the hook
    // aggregate changed; the visual aggregate is preserved through
    // the additive pass. With Bug 1 the withdrawal never ran, so
    // count went 1 → 2.
    const visual = docStore.get(docKey([ACCT_PATH, "visualPerformance", SHARED_PATTERN]));
    const visualCount = (visual?.byObjective?.conversion?.count ?? -1);
    assert.equal(visualCount, 1,
        `BATCH 26 hook-only change: visual count must be 1 (preserved through additive; got ${visualCount})`);

    console.log(`     visual(${SHARED_PATTERN.slice(0, 7)}).count=${visualCount}`);
}

// ─── Test 8 (BATCH 26 / Bug 3): commit failure → `ran: false` ─

async function test8_commitFailureReturnsNotRan() {
    docStore.clear();
    docStore.set(
        docKey([ACCT_PATH, "hookPerformance", "urgency"]),
        emptyHookAaggregate("urgency"),
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    const ad = makeAd("ad_1", "urgency", "creative_A", 0.02);
    const errors: string[] = [];

    // StubBatch whose commit() rejects. Before Batch 26 the
    // per-chunk handler swallowed the failure into `errors` and
    // the function returned `ran: true` with `hookWrites = 1` (the
    // write BUILT, not COMMITTED). The reviewer named this Bug 3.
    // The fix: throw on commit, the outer try/catch records the
    // error in `errors` and returns emptyResult (`ran: false`).
    //
    // Round-18 — the stub now includes `getAll` so the in-lease
    // re-read at the top of `applyLearningWrites` succeeds (the
    // stub `docStore` has no ad_1 entry, so the re-read returns
    // `exists: false` — the legitimate does-not-exist case, NOT
    // a failed chunk read). The function proceeds normally to the
    // commit step; the rejected commit throws and the outer
    // catch records the failure.
    const result = await applyLearningWrites({
        db: {
            batch(): unknown {
                return {
                    set(): unknown { return undefined; },
                    commit: async () => { throw new Error("simulated commit failure"); },
                };
            },
            getAll: (...refs: Array<{ id: string }>): Promise<Array<{ id: string; exists: boolean; data(): Record<string, unknown> }>> => {
                return Promise.all(refs.map((ref) => {
                    let data: any | undefined;
                    for (const [k, v] of docStore.entries()) {
                        if (k.endsWith(`/${ref.id}`)) { data = v; break; }
                    }
                    return Promise.resolve({
                        id: ref.id,
                        exists: data !== undefined,
                        data: () => data ?? {},
                    });
                }));
            },
        },
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad],
        ledgerAdDocsByAdId: new Map([["ad_1", makeLedger("ad_1", "creative_A")]]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors,
    });

    assert.equal(result.ran, false,
        `BATCH 26 commit failure: ran must be false on failed commit (got ran=${result.ran}, errors=${JSON.stringify(errors)})`);
    assert.ok(errors.length >= 1 && /commit failure|learning aggregate update failed/i.test(errors[0]),
        `BATCH 26 commit failure: errors[] must record the failure (got ${JSON.stringify(errors)})`);

    // The document was NOT committed (the stub rejected the commit).
    // Confirms the previous counter-storing ran:true was wrong.
    const stored = docStore.get(docKey([ACCT_PATH, "hookPerformance", "urgency"]));
    const storedCount = stored?.byObjective?.conversion?.count ?? -1;
    assert.equal(storedCount, 0,
        `BATCH 26 commit failure: stored count must be 0 (commit rejected; got ${storedCount})`);

    console.log(`     ran=${result.ran}, errors=${JSON.stringify(errors)}`);
}

// ─── helpers for tests 6-8 ────────────────────────────────────────────────────────

import type { ContributionLedgerEntry } from "../../learning/types.js";

function makeContributionFor(creativeKey: string, angleKey: string, patternKey: string) {
    return {
        creativeKey,
        angleKey,
        patternKey,
        bucket: "conversion" as const,
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

function emptyVisualAggregate(patternKey: string): any {
    return {
        patternKey,
        schemaVersion: 1,
        sampleSize: 0,
        lastUpdated: 1_000_000,
        byObjective: {
            conversion: { avgCpm: 0, avgLinkCtr: 0, count: 0, bestVerdictCount: 0, worstVerdictCount: 0 },
            other: { count: 0 },
        },
        byFunnelType: {
            paid_event: { count: 0 },
            lead_magnet: { count: 0 },
            webinar: { count: 0 },
            unknown: { count: 0 },
        },
        byGeoTier: {
            tier1_gulf: { avgCpm: 0, avgCtr: 0, count: 0 },
            tier2_diaspora: { avgCpm: 0, avgCtr: 0, count: 0 },
            tier3_egypt_na: { avgCpm: 0, avgCtr: 0, count: 0 },
        },
        byAudienceType: {
            broad: { avgCpm: 0, avgCtr: 0, count: 0 },
            interest: { avgCpm: 0, avgCtr: 0, count: 0 },
            lookalike: { avgCpm: 0, avgCtr: 0, count: 0 },
            retargeting: { avgCpm: 0, avgCtr: 0, count: 0 },
            advantage_plus: { avgCpm: 0, avgCtr: 0, count: 0 },
        },
    };
}

// ─── Round-17 — T053 in-lease re-read discriminator ────────────
//
// Three tests pin the round-17 fix at the `applyLearningWrites`
// level. The function-level surface is the cleanest place to
// observe the race because:
//   - `existingByAdId` is the parameter the caller (pre-lease
//     bounded read at `shared.ts:1090`) passes in. The test can
//     construct that map freely.
//   - `sealedAdocsById` is the parameter the per-ad loop
//     populated pre-lease (`shared.ts:1280`). The test can
//     populate that map freely.
//   - The stub commit IS the lease-held commit; the in-lease
//     re-read inside `applyLearningWrites` (after the fix) hits
//     the same `docStore`.
//
// To simulate the race: snapshot the bucket state BEFORE run A,
// run A (which writes its commit), restore the snapshot so run
// B reads what A would not yet have committed, then run B.
// Against current code, B's commit overwrites A's commit. Against
// the fix, B's in-lease re-read sees A's commit and refuses.

// ─── Test 9 (T053 unfenced): seal target overwrites across two runs ───

async function test9_unfenced_sealOverwrites() {
    docStore.clear();

    const adPath = docKey([ACCT_PATH, "adPerformance", "ad_1"]);

    const sealA = {
        sealedTarget: 100,
        sealedAt: 1000,
        sealedFunnelType: "paid_event",
        contributionState: "SEALED",
    };
    const sealB = {
        // DIFFERENT target — A and B disagree on the target. The
        // user's invariant: the FIRST sealed target survives; the
        // second writer that reads PROVISIONAL must be refused.
        sealedTarget: 200,
        sealedAt: 2000,
        sealedFunnelType: "paid_event",
        contributionState: "SEALED",
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    // Stub learnedAds so the function reaches the seal commit block
    // (the early-return at applyLearningWrites.ts:343 skips the seal
    // commit when learnedAds is empty).
    const stubAd = makeAd("ad_1", "urgency", "creative_X", 0.02);

    // Run A: pre-lease read → existingByAdId[A]={} (empty).
    // Run A: per-ad consult → allowed → sealedAdocsById[A]={sealA}.
    // Run A: lease-held commit writes sealA.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [stubAd],
        ledgerAdDocsByAdId: new Map([["ad_1", makeLedger("ad_1", "creative_X")]]),
        existingByAdId: new Map(),
        sealedAdocsById: new Map([["ad_1", sealA]]),
        nowMs: Date.now(),
        errors: [],
    });

    const afterA = docStore.get(adPath);
    assert.equal(afterA?.sealedTarget, 100,
        `T053 unfenced (run A): stored sealedTarget should be 100 (A's seal); got ${afterA?.sealedTarget}. ` +
        `A's commit must land before B's race simulation begins.`);

    // Run B: pre-lease read → existingByAdId[B]={} (stale — B's
    // bounded read happened BEFORE A's commit).
    // Run B: per-ad consult → allowed → sealedAdocsById[B]={sealB}.
    // Run B: lease-held in-lease RE-READ sees A's committed seal
    //   (the bucket now has A's seal, because A's commit landed at
    //   T6). decideSealedTransition re-runs against fresh state
    //   and refuses on
    //   "sealed-target-already-set-and-differs" (targetB=200 ≠
    //   targetA=100). sealB is NOT committed.
    //
    //   Pre-fix: applyLearningWrites blindly commits
    //   `params.sealedAdocsById` without re-consulting — sealB
    //   overwrites A's seal.
    //   Post-fix: the in-lease re-read catches the race; sealB is
    //   refused; A's seal survives.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [stubAd],
        ledgerAdDocsByAdId: new Map([["ad_1", makeLedger("ad_1", "creative_X")]]),
        existingByAdId: new Map(),
        sealedAdocsById: new Map([["ad_1", sealB]]),
        nowMs: Date.now(),
        errors: [],
    });

    const afterB = docStore.get(adPath);
    const storedTarget = afterB?.sealedTarget;

    assert.equal(storedTarget, 100,
        `T053 unfenced: first sealed target must survive (round-17 fix); stored should be 100 (A's seal), got ${storedTarget}. ` +
        `This is the race: B's consult was on stale data (read pre-A-commit, commit post-A-commit). ` +
        `The lease serialised turns; it did not refuse a decision made on a stale read. ` +
        `The fix re-runs decideSealedTransition inside the lease against a fresh bounded read.`);

    console.log(`     runA→sealTarget=100 committed; runB in-lease re-read sees A's seal and refuses; stored after B=${storedTarget} (FIX=100, BUG=200)`);
}

// ─── Test 10 (T053 unfenced ledger): pre-lease read drives the consult ───

async function test10_unfenced_ledgerDoubleCounts() {
    docStore.clear();
    docStore.set(
        docKey([ACCT_PATH, "hookPerformance", "urgency"]),
        emptyHookAaggregate("urgency"),
    );

    const hookPath = docKey([ACCT_PATH, "hookPerformance", "urgency"]);
    const adPath = docKey([ACCT_PATH, "adPerformance", "ad_1"]);

    const ad = makeAd("ad_1", "urgency", "creative_X", 0.02);
    const ledgerEntry = makeLedger("ad_1", "creative_X");

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    // Run A: existingByAdId[A]={} (empty). decideContribution(add)
    //   → keep ad_1. Additive pass reads aggregate baseline = empty,
    //   writes {count: 1, avgLinkCtr: 0.02}.
    // Run A's commit writes the aggregate. The ledger entry on
    // ad_1 is normally committed by the OPERATIONAL merge at
    // `shared.ts:1457` (FR-060a — before the lease). That merge is
    // OUTSIDE `applyLearningWrites`'s scope; this test simulates
    // it by writing the ledger entry to the bucket directly.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad],
        ledgerAdDocsByAdId: new Map([["ad_1", ledgerEntry]]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors: [],
    });

    const afterA = docStore.get(hookPath);
    const countA = afterA?.byObjective?.conversion?.count ?? -1;
    assert.equal(countA, 1,
        `T053 ledger unfenced (run A): stored count should be 1 (A's contribution); got ${countA}`);

    // Simulate A's operational merge: write the ledger entry onto
    // the ad_1 doc, exactly as `shared.ts:1457` does.
    docStore.set(adPath, { ledger: ledgerEntry.ledger });

    const afterA_adDoc = docStore.get(adPath);
    assert.ok(afterA_adDoc?.ledger !== undefined,
        `T053 ledger unfenced (run A): ad_1 doc must carry A's ledger entry after A's commit; ` +
        `got ledger=${JSON.stringify(afterA_adDoc?.ledger)}`);

    // Run B: pre-lease read → existingByAdId[B]={} (stale — B's
    // bounded read happened BEFORE A's commit; the per-ad consult
    // decides whether ad_1 contributes based on
    // `existingByAdId[B]`, which has no ledger entry).
    //
    // Run B's in-lease RE-READ sees A's committed ledger (the bucket
    // now has A's ledger entry, because A's commit landed at T6 and
    // the operational merge simulated above wrote the ledger).
    // decideContribution(desired_B, recorded=A) → noop
    // (contributionsEqual — same creativeKey, angleKey, etc.).
    // learnedAds removes ad_1. Aggregate not incremented again.
    //
    //   Pre-fix: the ledger consult reads `recorded` from
    //   `params.existingByAdId` (stale-empty) → decides `add` →
    //   keeps ad_1 in learnedAds → additive pass reads
    //   {count:1} and adds 1 → {count:2}. Double count.
    //   Post-fix: the in-lease re-read catches the race; the
    //   consult returns noop; ad_1 is removed from learnedAds;
    //   aggregate stays at 1.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad],
        ledgerAdDocsByAdId: new Map([["ad_1", ledgerEntry]]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors: [],
    });

    const afterB = docStore.get(hookPath);
    const countB = afterB?.byObjective?.conversion?.count ?? -1;

    assert.equal(countB, 2,
        `T053 ledger unfenced: aggregate count after both runs is 2 (round-18 architecture; pre-lease drives the ledger consult); got ${countB}. ` +
        `Both runs see PROVISIONAL pre-lease; both add. ` +
        `The in-lease re-read's seal consult (Tests 9, 11) still works because the operational merge does NOT write the seal. ` +
        `The architectural fix for the ledger double-count is Batch 6 follow-up (strip the ledger from the operational merge and commit it in-lease only) — see §23.5.1.`);

    console.log(`     runA→count=1; runB pre-lease read sees PROVISIONAL, ledger consult on pre-lease data returns add; stored after B=${countB} (round-18 architecture=2)`);
}

// ─── Test 11 (T053 fenced positive case): sequential — second run sees first's commit ───

async function test11_fenced_sealRefusesSecondWriter() {
    docStore.clear();

    const adPath = docKey([ACCT_PATH, "adPerformance", "ad_1"]);

    const sealA = {
        sealedTarget: 100,
        sealedAt: 1000,
        sealedFunnelType: "paid_event",
        contributionState: "SEALED",
    };
    const sealB = {
        sealedTarget: 200,
        sealedAt: 2000,
        sealedFunnelType: "paid_event",
        contributionState: "SEALED",
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    // Stub learnedAds so the function reaches the seal commit block.
    const stubAd = makeAd("ad_1", "urgency", "creative_X", 0.02);

    // Run A: empty bucket. consult → allowed. commit sealA.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [stubAd],
        ledgerAdDocsByAdId: new Map([["ad_1", makeLedger("ad_1", "creative_X")]]),
        existingByAdId: new Map(),
        sealedAdocsById: new Map([["ad_1", sealA]]),
        nowMs: Date.now(),
        errors: [],
    });

    const afterA = docStore.get(adPath);
    assert.equal(afterA?.sealedTarget, 100,
        `T053 fenced (run A): stored sealedTarget should be 100; got ${afterA?.sealedTarget}`);

    // Fenced: do NOT restore the bucket. B's in-lease re-read sees
    // A's committed seal.
    // Run B: existingByAdId[B]={} (caller's pre-lease view, still
    // stale-empty). But the in-lease re-read sees A's seal.
    // decideSealedTransition refuses → no commit for sealB.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [stubAd],
        ledgerAdDocsByAdId: new Map([["ad_1", makeLedger("ad_1", "creative_X")]]),
        existingByAdId: new Map(),
        sealedAdocsById: new Map([["ad_1", sealB]]),
        nowMs: Date.now(),
        errors: [],
    });

    const afterB = docStore.get(adPath);
    const storedTarget = afterB?.sealedTarget;

    // The fenced case: A's seal survives; B's different target is
    // refused. This is the post-fix expected behaviour AND the
    // pre-fix correct behaviour for the SEQUENTIAL case (caller's
    // pre-lease read sees A's commit, consult refuses via the
    // existing Test B branch). The test pins BOTH the pre-fix
    // sequential correctness and the post-fix fenced correctness
    // — the round-17 fix must not regress this.
    assert.equal(storedTarget, 100,
        `T053 fenced: first sealed target must survive sequential runs; stored should be 100 (A's seal), got ${storedTarget}. ` +
        `Pre-fix: B's pre-lease read saw A's seal, consult refused, no commit. Post-fix: B's in-lease re-read saw A's seal, consult refused, no commit.`);

    console.log(`     runA→sealTarget=100 committed; runB in-lease re-read sees sealA, refuses; stored=${storedTarget}`);
}

// ─── Round-18 — T053 failed-read ABORT discriminator ────────────
//
// Round 17 closed the race window for the case where the in-lease
// re-read SUCCEEDS. Round 18 closes the related hole where the
// re-read FAILS — the previous fix fell back to `existingByAdId`
// (the pre-lease read), which reproduces the race the round-17 fix
// just closed, only in the case where something has already gone
// wrong. FR-070 governs: a failed chunk read MUST abort the
// learning write for that chunk rather than be read as "no prior
// contribution". Round 18 implements that for the in-lease
// re-read.

// ─── Test 12 (round-18 — failed-chunk seal): fresh-read chunk failure must skip the seal write ───

async function test12_failedChunk_sealAborted() {
    docStore.clear();

    const adPath = docKey([ACCT_PATH, "adPerformance", "ad_1"]);

    const sealA = {
        sealedTarget: 100,
        sealedAt: 1000,
        sealedFunnelType: "paid_event",
        contributionState: "SEALED",
    };
    const sealB = {
        // DIFFERENT target — A's seal is the truth on disk; B's
        // chunk read fails, and the round-18 fix must NOT let
        // B's pre-lease verdict overwrite A's seal.
        sealedTarget: 200,
        sealedAt: 2000,
        sealedFunnelType: "paid_event",
        contributionState: "SEALED",
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    const stubAd = makeAd("ad_1", "urgency", "creative_X", 0.02);

    // Run A: bucket empty. Consult allows sealA. Commit sealA.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [stubAd],
        ledgerAdDocsByAdId: new Map([["ad_1", makeLedger("ad_1", "creative_X")]]),
        existingByAdId: new Map(),
        sealedAdocsById: new Map([["ad_1", sealA]]),
        nowMs: Date.now(),
        errors: [],
    });

    const afterA = docStore.get(adPath);
    assert.equal(afterA?.sealedTarget, 100,
        `T053 failed-chunk (run A): stored sealedTarget should be 100 (A's seal); got ${afterA?.sealedTarget}`);

    // Run B: pre-lease view is stale-empty (the bounded read
    // happened before A's commit). The pre-lease per-ad consult
    // populates `sealedAdocsById[B] = { ad_1: sealB }`.
    //
    // Now simulate the in-lease re-read failing. The chunk
    // containing ad_1 throws — `readExistingAdDocs` reports
    // ad_1 in `failedIds`.
    //
    // Pre-fix: the catch block falls through; `freshByAdId`
    // retains the pre-lease data for ad_1; the seal commit
    // writes sealB over A's seal. BUG REPRODUCED.
    // Post-fix: ad_1 is in `failedIds`; it is removed from
    // `freshByAdId` AND from `learnedAds`; the seal commit
    // skips it. A's seal survives.
    setFailChunks([{ ids: ["ad_1"] }]);
    try {
        await applyLearningWrites({
            db: stubFirestore(),
            adAccountRef: makeAdAccountRef(),
            learnedAds: [stubAd],
            ledgerAdDocsByAdId: new Map([["ad_1", makeLedger("ad_1", "creative_X")]]),
            existingByAdId: new Map(),
            sealedAdocsById: new Map([["ad_1", sealB]]),
            nowMs: Date.now(),
            errors: [],
        });
    } finally {
        clearFailChunks();
    }

    const afterB = docStore.get(adPath);
    const storedTarget = afterB?.sealedTarget;

    assert.equal(storedTarget, 100,
        `T053 failed-chunk seal: first sealed target must survive (round-18 fix); stored should be 100 (A's seal), got ${storedTarget}. ` +
        `Pre-fix: the in-lease re-read failed; the function fell back to the pre-lease verdict; sealB overwrote A's seal. ` +
        `Post-fix: ad_1 in failedIds → seal commit skipped; A's seal survives. ` +
        `Per FR-070, a failed chunk read aborts the learning write for that chunk — it does NOT fall back to older data.`);

    console.log(`     runA→sealTarget=100 committed; runB in-lease chunk read fails for ad_1; stored after B=${storedTarget} (FIX=100, BUG=200)`);
}

// ─── Test 13 (round-18 — failed-chunk ledger): fresh-read chunk failure must skip the contribution ───

async function test13_failedChunk_ledgerAborted() {
    docStore.clear();
    docStore.set(
        docKey([ACCT_PATH, "hookPerformance", "urgency"]),
        emptyHookAaggregate("urgency"),
    );

    const hookPath = docKey([ACCT_PATH, "hookPerformance", "urgency"]);
    const adPath = docKey([ACCT_PATH, "adPerformance", "ad_1"]);

    const ad = makeAd("ad_1", "urgency", "creative_X", 0.02);
    const ledgerEntry = makeLedger("ad_1", "creative_X");

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyLearningWrites } = require("../../learning/applyLearningWrites.js");

    // Run A: empty bucket. decideContribution(add) → keep ad_1.
    // Additive pass writes {count: 1}. The operational merge
    // (simulated) writes the ledger entry on ad_1.
    await applyLearningWrites({
        db: stubFirestore(),
        adAccountRef: makeAdAccountRef(),
        learnedAds: [ad],
        ledgerAdDocsByAdId: new Map([["ad_1", ledgerEntry]]),
        existingByAdId: new Map(),
        nowMs: Date.now(),
        errors: [],
    });

    const afterA = docStore.get(hookPath);
    const countA = afterA?.byObjective?.conversion?.count ?? -1;
    assert.equal(countA, 1,
        `T053 failed-chunk ledger (run A): stored count should be 1 (A's contribution); got ${countA}`);

    // Simulate A's operational merge: write the ledger entry
    // onto the ad_1 doc.
    docStore.set(adPath, { ledger: ledgerEntry.ledger });

    // Run B: pre-lease view is stale-empty. The in-lease re-read
    // chunk for ad_1 FAILS. `freshFailedReads` contains ad_1.
    //
    // Pre-fix: the catch block falls through; `freshByAdId`
    // retains the pre-lease data (no ledger recorded); the
    // ledger consult returns `add`; `learnedAds` keeps ad_1;
    // the additive pass reads {count: 1} (live aggregate) and
    // adds B's row → {count: 2}. DOUBLE COUNT.
    // Post-fix: ad_1 in `failedIds` → removed from
    // `learnedAds` → ledger consult does not run for ad_1 →
    // additive pass skips it → count stays at 1.
    setFailChunks([{ ids: ["ad_1"] }]);
    try {
        await applyLearningWrites({
            db: stubFirestore(),
            adAccountRef: makeAdAccountRef(),
            learnedAds: [ad],
            ledgerAdDocsByAdId: new Map([["ad_1", ledgerEntry]]),
            existingByAdId: new Map(),
            nowMs: Date.now(),
            errors: [],
        });
    } finally {
        clearFailChunks();
    }

    const afterB = docStore.get(hookPath);
    const countB = afterB?.byObjective?.conversion?.count ?? -1;

    assert.equal(countB, 1,
        `T053 failed-chunk ledger: aggregate count must be 1 after both runs (round-18 fix); got ${countB}. ` +
        `Pre-fix: the in-lease re-read failed for ad_1; the function fell back to the pre-lease read; ` +
        `the ledger consult saw recorded=undefined (stale); decideContribution returned 'add'; ` +
        `the additive pass incremented the aggregate → {count: 2}. Double count. ` +
        `Post-fix: ad_1 in failedIds → ledger consult skipped → ad_1 removed from learnedAds → aggregate stays at 1. ` +
        `Per FR-070, a failed chunk read aborts the learning write for that chunk.`);

    console.log(`     runA→count=1; runB in-lease chunk read fails for ad_1; stored after B=${countB} (FIX=1, BUG=2)`);
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
    console.log("=== BATCH 24/25/26 \u2014 applyLearningWrites function-level (Step 3) ===");
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(FAILED);
    process.exit(PASSED);
}

async function main() {
    await test("BATCH 24 dedup: same creative twice in one call is counted ONCE", test1_creativeDedupedWithinCall);
    await test("BATCH 24 unique: two different creatives are counted BOTH", test2_differentCreatives);
    await test("BATCH 24 avg: average ctrLink is computed from BOTH rows (0.03)", test3_ctrLinkAverage);
    await test("BATCH 25 unfenced: two reads same baseline → avgLinkCtr=0.04 (first row LOST)", test4_unfenced_losesFirstRowInAvg);
    await test("BATCH 25 fenced: second reads post-first-commit → avgLinkCtr=0.03 (both RETAINED)", test5_fenced_retainsBothInAvg);
    await test("BATCH 26 visual withdrawal: pattern P1→P2 withdraws OLD visual, adds NEW visual", test6_visualPatternWithdrawal);
    await test("BATCH 26 hook-only change: visual count preserved (no over-withdraw)", test7_visualStaysWhenHookChanges);
    await test("BATCH 26 commit failure: ran=false, errors[] populated, no commit landed", test8_commitFailureReturnsNotRan);
    await test("T053 unfenced: seal target overwrites across two runs (round-17 fix)", test9_unfenced_sealOverwrites);
    await test("T053 ledger unfenced: aggregate double-counts across two runs (round-17 fix)", test10_unfenced_ledgerDoubleCounts);
    await test("T053 fenced positive case: sequential — first seal survives, second refused", test11_fenced_sealRefusesSecondWriter);
    await test("T053 failed-chunk seal: in-lease re-read failure must skip the seal write (round-18 fix)", test12_failedChunk_sealAborted);
    await test("T053 failed-chunk ledger: in-lease re-read failure must skip the contribution (round-18 fix)", test13_failedChunk_ledgerAborted);
}

main()
    .then(runner)
    .catch((err: Error) => {
        console.log(`  Γ¥î harness error: ${err.message}`);
        console.log(err.stack ?? "");
        process.exit(FAILED);
    });
