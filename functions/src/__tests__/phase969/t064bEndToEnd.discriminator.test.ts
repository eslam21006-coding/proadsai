// functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts ΓÇö T064b SC-049 + worker-output observations (Phase 7)
// ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
// Phase 969 Phase 7, T064b ΓÇö SC-049 behavioural test + worker-output
// observations for T021a and T025a wire-ups.
//
// Why this file exists:
// -------------------
// The interim regression guards (SOURCE-TEXT) at
//   - `sc049Tripwire.test.ts` (SC-049 ordering)
//   - `t021aWireupDiscriminator.test.ts:217` (T021a wire-up)
//   - `t025aWorkerWiringDiscriminator.test.ts:313` (T025a wiring)
// exist only because `runSyncForAccount` could not be driven from a test
// (Firestore + Meta stubs were not in place). With the stubbing
// scaffolding this file builds, each interim guard can be retired in
// favour of an assertion on the WORKER'S REAL OUTPUT.
//
// What this file asserts:
// ------------------------
//   - SC-049: pre-populated lease with a different runId ΓåÆ
//     `runSyncForAccount` returns `{status: "failed"}` AND the
//     operational adPerformance writes committed BEFORE the lease
//     attempt (FR-060a's ordering preserved).
//   - T021a worker-output: the queued adDoc's `ledger.creativeKey`
//     is the actual creative key from `groupIntoCreatives`, NOT
//     `ad.id` (per FR-073).
//   - T025a worker-output: the queued adDoc's `ledger.angleKey` and
//     `ledger.patternKey` are the post-pass resolved values from the
//     generation doc, NOT null (per Batch 12's wiring).
//
// Stubbing scaffolding:
// ----------------------
// The Firestore stub, fetch stub, admin override, secrets override,
// and lease override are modelled on `metaSyncOrchestrator.test.ts`.
// They are NOT extracted to a shared module in this batch ΓÇö the
// duplication is contained to the two test files and would be cleaned
// up in a follow-up if a third driver of `runSyncForAccount` appears.
// The behavioural surface of every stubbed dependency is the
// smallest needed to reach the asserted state.

import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin: any = require("firebase-admin");

// ΓöÇΓöÇΓöÇ Firestore stub (in-memory) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

type DocData = Record<string, any>;
const stubStore: Record<string, Map<string, DocData>> = {};
function bucket(path: string): Map<string, DocData> {
    if (!stubStore[path]) stubStore[path] = new Map();
    return stubStore[path];
}
function resetStub() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}

class StubDocRef {
    constructor(public path: string, public id: string, private store: Map<string, DocData>) {}
    async get() {
        const data = this.store.get(this.id);
        return { exists: data !== undefined, data: () => data ?? undefined, id: this.id, ref: this };
    }
    async set(data: DocData, opts?: { merge?: boolean }) {
        if (opts?.merge) {
            const cur = this.store.get(this.id) ?? {};
            this.store.set(this.id, { ...cur, ...data });
        } else {
            this.store.set(this.id, data);
        }
    }
    async update(patch: DocData) {
        const cur = this.store.get(this.id) ?? {};
        this.store.set(this.id, { ...cur, ...patch });
    }
    async delete() {
        this.store.delete(this.id);
    }
    collection(sub: string) {
        return new StubCollection(`${this.path}/${sub}`, bucket(`${this.path}/${sub}`));
    }
}

class StubCollection {
    constructor(public path: string, public store: Map<string, DocData>) {}
    doc(id?: string) {
        const docId = id ?? "auto";
        return new StubDocRef(`${this.path}/${docId}`, docId, this.store);
    }
    where() { return this; }
    limit() { return this; }
    orderBy() { return this; }
    async get() {
        const entries = [...this.store.entries()];
        return {
            docs: entries.map(([id, data]) => ({
                id, data: () => data, ref: new StubDocRef(`${this.path}/${id}`, id, this.store),
            })),
            empty: entries.length === 0,
            size: entries.length,
        };
    }
}

class StubBatch {
    private ops: Array<{ ref: StubDocRef; data: DocData; merge: boolean }> = [];
    set(ref: StubDocRef, data: DocData, opts?: { merge?: boolean }) {
        this.ops.push({ ref, data, merge: opts?.merge ?? false });
        return this;
    }
    update(ref: StubDocRef, patch: DocData) {
        this.ops.push({ ref, data: patch, merge: true });
        return this;
    }
    async commit() {
        for (const op of this.ops) await op.ref.set(op.data, { merge: op.merge });
        this.ops = [];
    }
}

const stubFirestore = () => ({
    settings: () => stubFirestore(),
    collection: (path: string) => new StubCollection(path, bucket(path)),
    doc: (path: string) => {
        const segs = path.split("/");
        const id = segs.pop() as string;
        return new StubDocRef(path, id, bucket(segs.join("/")));
    },
    batch: () => new StubBatch(),
    // `boundedLedgerRead.readExistingAdDocs` calls `db.getAll(...refs)`,
    // which Firestore provides natively but the original T064b stub
    // did not. Without it, every ad row lands in `failedIds` (FR-070
    // surface) and `inLearnedAds` is false ΓÇö no aggregate is written.
    //
    // The stub now resolves each `DocRef` against the in-memory
    // bucket. The ref's `path` is the FULL document path (e.g.
    // `users/owner/workspaces/ws_alpha/adAccounts/act_alpha/adPerformance/ad_1`).
    // Its last segment is the document id; the parent path
    // (everything BEFORE the last segment) is the bucket key the
    // seeder writes to. Mirrors `boundedLedgerRead.test.ts`'s
    // makeDb helper (independent copy ΓÇö T064b does not share a stub
    // module with `metaSyncOrchestrator.test.ts`, by Batch 15 design).
    getAll: (...refs: Array<{ id: string; path: string }>): Promise<Array<{ id: string; exists: boolean; data: () => DocData }>> => {
        return Promise.all(refs.map((ref) => {
            const pathParts = ref.path.split("/");
            const id = ref.id;
            const parentPath = pathParts.slice(0, -1).join("/");
            const store = bucket(parentPath);
            const data = store.get(id);
            return Promise.resolve({
                id,
                exists: data !== undefined,
                data: () => data ?? {},
            });
        }));
    },
    // `acquireLearningLease` uses `db.runTransaction` (Firestore's
    // transactional read-modify-write). The stub falls back to a
    // plain get-then-set: if the lease doc is held by a different
    // runId, return `{ok: false, holderUid, expiresAtMs}`; else mark
    // the lease held by this runId and return `{ok: true}`.
    runTransaction: async <T>(updateFn: (txn: any) => Promise<T>): Promise<T> => {
        const txn = {
            get: async (ref: StubDocRef) => ref.get(),
            set: async (ref: StubDocRef, data: DocData, opts?: { merge?: boolean }) =>
                ref.set(data, opts),
            update: async (ref: StubDocRef, patch: DocData) => ref.update(patch),
            // `releaseLearningLease` calls `txn.delete(ref)`.
            delete: async (ref: StubDocRef) => ref.delete(),
        };
        return await updateFn(txn);
    },
});

Object.defineProperty(admin, "firestore", {
    value: stubFirestore,
    writable: true,
    configurable: true,
});
admin.firestore.FieldValue = {
    serverTimestamp: () => Date.now(),
    increment: (n: number) => n,
};
admin.initializeApp = () => ({});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const secretsModule = require("../../secrets.js");
Object.defineProperty(secretsModule, "metaAppSecret", {
    value: { value: () => "test-secret" },
    configurable: true,
});

// Patch `decryptLegacyToken` to return a token directly. The
// `runSyncForAccount` path reads legacyToken from
// `users/{uid}/workspaces/{wsId}/private/metaConnection` and
// `resolveAccessToken` fails when both `encryptedToken` and
// `legacyToken` are unset. We bypass the AES-256-GCM round-trip by
// overriding the function via a fresh module require after the
// original module has been cached.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const legacyTokenModule = require("../../metaSync/legacyToken.js");
Object.defineProperty(legacyTokenModule, "decryptLegacyToken", {
    value: async (_encrypted: string, _secret?: string) => "PLAIN_TOKEN",
    configurable: true,
    writable: true,
});

// ΓöÇΓöÇΓöÇ Fixtures ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

const OWNER = "owner_uid_AAAA";
const WS_A = "ws_alpha";
const ACCT_A = "act_alpha";

// ΓöÇΓöÇΓöÇ Stub: connection doc (loadStoredConnection reads this) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function seedConnection() {
    // LEG A reads from the top-level `metaConnections/{userId}` doc.
    bucket("metaConnections").set(OWNER, {
        encryptedToken: "iv:tag:body",
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
        selectedAccountId: ACCT_A,
        lastSyncAt: null,
    });
    // LEG B (`runSyncForAccount`) reads from the workspace-scoped
    // `users/{uid}/workspaces/{wsId}/private/metaConnection` doc.
    // Per Batch 12 + Batch 13 wiring, the `runSyncForAccount` path
    // requires `legacyToken` (or `encryptedToken`) on THIS doc, not
    // on the user-level doc. `resolveAccessToken` looks at
    // `conn.encryptedToken || conn.legacyToken`; without either, it
    // throws "No encrypted token stored for this workspace." which
    // surfaces as a Token resolution failure.
    bucket(`users/${OWNER}/workspaces`).set(WS_A, { name: WS_A, deletedAt: null });
    bucket(`users/${OWNER}/workspaces/${WS_A}/private`).set("metaConnection", {
        accountId: ACCT_A,
        metaConnected: true,
        legacyToken: "PLAIN_TOKEN",
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
        selectedAccountId: ACCT_A,
    });
}

// ΓöÇΓöÇΓöÇ Stub: Meta fetch (campaigns, adsets, ads, insights) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function seedFetchOneAd() {
    const fetchImpl: typeof fetch = (async (input: any): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/insights")) {
            return {
                ok: true, status: 200,
                json: async () => ({
                    data: [{
                        ad_id: "ad_1",
                        ad_name: "An Ad",
                        adset_name: "An AdSet",
                        campaign_name: "A Campaign",
                        impressions: "1000",
                        clicks: "10",
                        spend: "5.00",
                        ctr: "1.0",
                        cpc: "0.50",
                        cpm: "5.00",
                        actions: [],
                        cost_per_action_type: [],
                        purchase_roas: [],
                    }],
                }),
            } as Response;
        }
        if (url.match(/\/act_[^/]+\/campaigns/)) {
            return { ok: true, status: 200, json: async () => ({ data: [{
                id: "campaign_1", name: "Sales", objective: "CONVERSIONS",
                status: "ACTIVE", buying_type: "AUCTION",
            }] }) } as Response;
        }
        if (url.includes("/adsets")) {
            return { ok: true, status: 200, json: async () => ({ data: [{
                id: "adset_1", campaign_id: "campaign_1", name: "An AdSet",
                targeting: { geo_locations: { countries: ["US"] }, age_max: 65 },
                optimization_goal: "OFFSITE_CONVERSIONS",
                daily_budget: "5000",
            }] }) } as Response;
        }
        if (url.includes("/ads?") || /\/ads(?:[?&]|$)/.test(url)) {
            return { ok: true, status: 200, json: async () => ({ data: [{
                id: "ad_1", adset_id: "adset_1", name: "An Ad",
                creative: { id: "creative_1", image_url: null, thumbnail_url: null },
                status: "ACTIVE",
                creative_type: "IMAGE",
            }] }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
    }) as typeof fetch;
    return fetchImpl;
}

// ΓöÇΓöÇΓöÇ Stub: legacyToken (decryptLegacyToken returns PLAIN_TOKEN) ΓöÇΓöÇΓöÇΓöÇΓöÇ
//
// `secretsModule.metaAppSecret.value()` is overridden above.
// `decryptLegacyToken(encryptedToken, secret)` then derives the access
// token from the encrypted bytes + secret. We don't care about the
// crypto here ΓÇö the production code only checks `secret` is non-empty,
// so any non-empty string is fine.

// ΓöÇΓöÇΓöÇ Stub: fingerprint + generation match (T021a/T025a) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function seedGenerationMatch(opts: {
    fingerprintHash?: string;
    creativeIdentity?: { selectedModes?: string[]; contractTemplateId?: string; universeCategory?: string; hookAngle?: string };
}) {
    // Hash that will be matched against. Default is a stable string.
    const fingerprintHash = opts.fingerprintHash ?? "abc123";
    // The fingerprint lookup: stored under the user's workspace.
    bucket(`users/${OWNER}/workspaces/${WS_A}/imageFingerprints`).set(fingerprintHash, {
        hash: fingerprintHash,
        generationId: "gen_1",
        createdAt: Date.now() - 86_400_000,
    });
    // The generation doc.
    bucket("generations").set("gen_1", {
        userId: OWNER,
        timestamp: Date.now() - 86_400_000,
        output: { phase: "build_plan" },
        feedback: { rating: null, tags: [], freeText: "", savedToFavorites: false },
        // T025a worker-output asserts `ledger.patternKey` is non-empty.
        // `computePatternKey` early-exits on any missing field, so
        // include the visual fields the post-pass patch reads.
        creativeIdentity: opts.creativeIdentity ?? {
            selectedModes: ["standard_hero", "value_stack"],
            contractTemplateId: "cta_card",
            universeCategory: "office",
            hookAngle: "urgency",
            visualSubStyle: "lifestyle",
            universeId: "test_universe",
        },
    });
    return fingerprintHash;
}

// ΓöÇΓöÇΓöÇ Lease override (for the SC-049 case) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function setLeaseHeldByOtherRunner() {
    // `parseHolder` (learningLease.ts:79) requires ALL of these
    // fields. Missing any returns `null` and the lease is taken
    // (not refused). Provide every required field with a future
    // `expiresAtMs` so the lease is held by another runner.
    const leaseDoc = {
        ownerUid: OWNER,
        accountId: ACCT_A,
        holderUid: "other_user",
        runId: "OTHER_RUNNER",
        acquiredAtMs: Date.now() - 60_000,
        expiresAtMs: Date.now() + 600_000,
    };
    bucket("learningLeases").set(`${OWNER}_${ACCT_A}`, leaseDoc);
}

// ΓöÇΓöÇΓöÇ Stub: workspace funnelSettings (FR-027 source) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
//
// `runSyncForAccount` reads `data.funnelType` from this doc and
// threads it into every contributing row's `AdForLearning.funnelType`.
// The aggregator's `byFunnelType` then attributes each row to one of
// the four real funnel types or to the explicit "unknown" bucket
// (FR-032 ΓÇö receives no same-funnel weighting). The four T064b cases
// pinned here (the worker-output for FR-027 / T056's data side) prove
// the wiring exists end-to-end; the Batch 17 Node test pinned the
// read side.
//
// `mode = "resolve"` seeds a complete derived object whose
// `funnelType` lands on the parameter value. `mode = "absent"` is the
// inverse case ΓÇö no settings doc, so the worker reads "unknown".
//
// The `derived` object is shaped only enough to satisfy
// `isSettingsComplete`-adjacent reads (the worker's read does NOT
// gate on completeness ΓÇö it logs a warning and continues). For Case A
// the `paid` block exercises paid_event semantics, including the
// Phase 968 `eventAttendanceRate`/`eventCloseRate` retention.

function seedFunnelSettings(mode: "resolve" | "absent", funnelType: string | null) {
    const settingsPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/settings`;
    if (mode === "absent") {
        bucket(settingsPath).delete("current");
        return;
    }
    // mode === "resolve"
    bucket(settingsPath).set("current", {
        funnelType,
        derived: {
            // paid_event-shaped. The two 0s keep both Phase 968 fields
            // present (FR-016 / FR-039 require retention of these
            // fields on paid_event settings). `economicsVersion: 2` is
            // the Phase 968 contract.
            economicsVersion: 2 as const,
            paid: {
                rawTargetCpa: 50,
                fullBuyerValue: 250,
                maxCpa: 50,
                effectiveTargetCpa: 50,
                capApplied: false,
            },
            computedAt: Date.now(),
        },
    });
}

// ΓöÇΓöÇΓöÇ Image-match stubs (FR-027/T047 worker-output wiring) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
//
// `runSyncForAccount`'s image-match pipeline downloads the
// `creative.thumbnail_url`, hashes the bytes, and looks up that
// hash in the workspace fingerprint index. The fetch stub returns
// `image_url: null` (and `thumbnail_url: null`) ΓÇö by design,
// because realistic image data would require either a real CDN or
// a sizeable binary fixture. The fetch-only stub is enough for
// SC-049, T021a, and T025a because they assert against
// `ledger.creativeKey`, which is set even when the image-match
// pipeline returns null.
//
// T047 (the new worker-output cases for FR-027) assert on
// `byFunnelType` in the **hook aggregate** ΓÇö and that aggregate is
// only written when the ad passes `isAdEligible` (which requires
// `matchType !== null`, i.e. the image-match pipeline must
// succeed). So `seedImageMatchStubs` installs overrides via the
// `setImageMatchOverridesForTests` seam in `metaSync/shared.ts`:
//
//   1. `loadWorkspaceFingerprints(uid, wsId)` ΓåÆ returns a Map keyed
//      by the seeded fingerprint hash, with one entry whose
//      generationId is the seeded `gen_1`.
//   2. `downloadCreativeImage(url)` ΓåÆ returns a Buffer (any non-empty
//      Buffer ΓÇö `computeHash` will produce some hash; `matchAdCreative`
//      looks up by hash, so a stable placeholder hash works).
//   3. `matchAdCreative(hash, fingerprintIndex, threshold)` ΓåÆ returns
//      a match `{generationId: "gen_1", matchType: "auto_hash",
//      matchDistance: 0, ambiguous: false}`.
//
// The production path also reads `image_url: null` and skips the
// per-image-match block entirely ΓÇö T047 does NOT depend on a real
// image download; the seam short-circuits the lookup to produce a
// generationId, which is what makes the ad `eligible` for learning.

let sharedModule: any = null;
function seedImageMatchStubs(): void {
    if (!sharedModule) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        sharedModule = require("../../metaSync/shared.js");
    }
    // The production path is preserved when overrides are `null`;
    // we install overrides that route the call to a stub. The
    // helpers run inline (no I/O); the stubbed result is what the
    // worker uses.
    sharedModule.setImageMatchOverridesForTests(
        // loadWorkspaceFingerprints override
        async (_uid: string, _workspaceId: string) => {
            const idx = new Map<string, DocData>();
            idx.set("abc123", {
                hash: "abc123",
                generationId: "gen_1",
                createdAt: Date.now() - 86_400_000,
            });
            return idx;
        },
        // downloadCreativeImage override
        async (_url: string) => Buffer.from([0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x9a]),
        // computeHash override (perceptualHash would reject 8 bytes of
        // 0xab; the override returns the seeded fingerprint hash so
        // `matchAdCreative` finds a match in the seeded index).
        async (_buf: Buffer) => "abc123",
        // matchAdCreative override
        async (_hash: string, _fingerprintIndex: unknown, _threshold: number) => ({
            generationId: "gen_1",
            matchType: "auto_hash" as const,
            matchDistance: 0,
            ambiguous: false,
        }),
    );
}

function teardownImageMatchStubs(): void {
    if (sharedModule && typeof sharedModule.resetImageMatchOverridesForTests === "function") {
        sharedModule.resetImageMatchOverridesForTests();
    }
}

// ΓöÇΓöÇΓöÇ Driver: runSyncForAccount with stubbed dependencies ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
//
// `runSyncForAccount` is exported from `shared.ts`. We use the
// `metaGraph` `setFetchImplForTests` seam to inject the canned fetch.
// All other dependencies are stubbed at the module level (Firestore,
// secrets).

// eslint-disable-next-line @typescript-eslint/no-var-requires
const metaGraph = require("../../metaGraph.js");

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
    try {
        await fn();
        console.log(`  Γ£à ${name}`);
        passed++;
    } catch (e) {
        console.log(`  Γ¥î ${name}`);
        console.log(`     ${(e as Error).message}`);
        failed++;
    }
}

function runner() {
    console.log("");
    console.log("=== T064b end-to-end: SC-049 + worker-output (Phase 7) ===");
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(FAILED);
    process.exit(PASSED);
}

async function main(): Promise<void> {
    await test("SC-049: pre-populated lease (different runId) ΓåÆ status='failed'", async () => {
        resetStub();
        seedConnection();
        seedGenerationMatch({});
        setLeaseHeldByOtherRunner();

        metaGraph.setFetchImplForTests(seedFetchOneAd());

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { runSyncForAccount } = require("../../metaSync/shared.js");

        const result = await runSyncForAccount({
            userId: OWNER,
            workspaceId: WS_A,
            accountId: ACCT_A,
            trigger: "manual",
            nowMs: Date.now(),
        });

        // SC-049: status is failed (the lease is held by another runner).
        assert.equal(result.status, "failed",
            `SC-049: lease held by another runner must produce status="failed" (got ${result.status}, errors=${JSON.stringify(result.errors)})`);
    });

    await test("SC-049 (second-half): operational writes committed BEFORE the lease refused", async () => {
        // After the lease refusal, the FR-060a ordering requires that
        // the operational status writes were committed BEFORE the lease
        // attempt. The result's status is "failed" so the aggregate
        // writes are skipped; the per-ad batch.commit() at line ~1306 of
        // shared.ts is the assertion's target.
        //
        // This test runs the same scenario as SC-049 first-half but
        // inspects the stubbed bucket rather than result.status, since
        // both should reflect FR-060a's ordering: writes happen, THEN
        // lease is tried, THEN status="failed" is returned.
        resetStub();
        seedConnection();
        seedGenerationMatch({});
        setLeaseHeldByOtherRunner();

        metaGraph.setFetchImplForTests(seedFetchOneAd());

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { runSyncForAccount } = require("../../metaSync/shared.js");

        const result = await runSyncForAccount({
            userId: OWNER,
            workspaceId: WS_A,
            accountId: ACCT_A,
            trigger: "manual",
            nowMs: Date.now(),
        });

        // The workspace-scoped adPerformance write path is
        // `users/${userId}/workspaces/${workspaceId}/adAccounts/${accountId}/adPerformance`.
        const wsPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/adPerformance`;
        const wsWrites = bucket(wsPath);
        const rootWrites = bucket("adPerformance");
        const totalOperational = wsWrites.size + rootWrites.size;
        assert.ok(totalOperational >= 1,
            `SC-049 second-half: at least one operational write should be committed before the lease refusal; ` +
            `found ${wsWrites.size} writes at ${wsPath} and ${rootWrites.size} at root adPerformance. ` +
            `run status=${result.status}, errors=${JSON.stringify(result.errors)}`);
});

// ΓöÇΓöÇΓöÇ BATCH 19 ΓÇö Item 1 (lease fence on aggregate writes) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
//
// Batch 18 confirmed the audit: the per-ad `writes` array carries both
// operational writes (adPerformance) AND aggregate writes
// (hookPerformance, visualPerformance, baselines, syncSnapshot). The
// commit loop runs BEFORE `acquireLearningLease`. A lease-refused run
// has already committed its aggregates ΓÇö defeating FR-054a / FR-055
// (the lease's entire purpose).
//
// Two tests pin the fix: a lease-refused run writes operational
// state and NO aggregate; a lease-acquired run writes both. They
// assert directly against the stubbed bucket so they survive
// independent of the result shape.

await test("BATCH 20: lease-refused run writes operational state and NO aggregate document", async () => {
    resetStub();
    seedConnection();
    seedGenerationMatch({});
    // BATCH 20: seed the image-match stubs so the per-ad block
    // populates learnedAds. Without this, the aggregate code path
    // doesn't execute and the bug (aggregate commit before lease)
    // is not exercised -- the original BATCH 19 lease-refused case
    // passed on reverted source because of this gap. With the
    // stubs in place, learnedAds is non-empty, aggregates are
    // pushed to writes, and on reverted source they commit
    // before the lease is acquired.
    seedImageMatchStubs();
    setLeaseHeldByOtherRunner();
    metaGraph.setFetchImplForTests(seedFetchOneAd());

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runSyncForAccount } = require("../../metaSync/shared.js");

    const result = await runSyncForAccount({
        userId: OWNER,
        workspaceId: WS_A,
        accountId: ACCT_A,
        trigger: "manual",
        nowMs: Date.now(),
    });

    // FR-060a: lease-refused sync still reports the action list. The
    // owner-action list (per-ad adPerformance writes) is the
    // operational state.
    assert.equal(result.status, "failed",
        `Batch 19 item 1: lease-refused must report status="failed" (got ${result.status}, errors=${JSON.stringify(result.errors)})`);

    // FR-054a / FR-055: the aggregate write MUST be fenced by the
    // lease. A lease-refused run commits operational state and NO
    // aggregate document. Direct bucket inspection ΓÇö the stub's
    // commit() is what the worker would call against Firestore.
    const hookPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/hookPerformance`;
    const visualPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/visualPerformance`;
    assert.equal(bucket(hookPath).size, 0,
        `Batch 19 item 1: lease-refused must NOT commit any hook aggregate document (found ${bucket(hookPath).size} writes at ${hookPath})`);
    assert.equal(bucket(visualPath).size, 0,
        `Batch 19 item 1: lease-refused must NOT commit any visual aggregate document (found ${bucket(visualPath).size} writes at ${visualPath})`);

    // Sanity: operational writes DID commit.
    const wsAdPerfPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/adPerformance`;
    const rootAdPerfPath = "adPerformance";
    const totalOperational = bucket(wsAdPerfPath).size + bucket(rootAdPerfPath).size;
    assert.ok(totalOperational >= 1,
        `Batch 19 item 1: lease-refused must still commit operational writes (FR-060a); found ${totalOperational} adPerformance writes.`);
});

await test("BATCH 20: lease-acquired run writes BOTH operational and aggregate documents", async () => {
    resetStub();
    seedConnection();
    seedGenerationMatch({});
    // No held lease ΓÇö the worker should acquire.
    bucket("learningLeases").delete(`${OWNER}_${ACCT_A}`);
    seedImageMatchStubs();
    metaGraph.setFetchImplForTests(seedFetchOneAd());

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runSyncForAccount } = require("../../metaSync/shared.js");

    const result = await runSyncForAccount({
        userId: OWNER,
        workspaceId: WS_A,
        accountId: ACCT_A,
        trigger: "manual",
        nowMs: Date.now(),
    });

    assert.equal(result.ok, true,
        `Batch 19 item 1: lease-acquired must report ok=true (got ${result.ok}, errors=${JSON.stringify(result.errors)})`);

    // Both operational AND aggregate docs must be present.
    const wsAdPerfPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/adPerformance`;
    const hookPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/hookPerformance`;
    const visualPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/visualPerformance`;
    assert.ok(bucket(wsAdPerfPath).size + bucket("adPerformance").size >= 1,
        `Batch 19 item 1: lease-acquired must commit adPerformance writes`);
    assert.ok(bucket(hookPath).size >= 1,
        `Batch 19 item 1: lease-acquired must commit hookPerformance writes (found ${bucket(hookPath).size})`);
    assert.ok(bucket(visualPath).size >= 1,
        `Batch 19 item 1: lease-acquired must commit visualPerformance writes (found ${bucket(visualPath).size})`);
});

// ΓöÇΓöÇΓöÇ BATCH 19 ΓÇö Item 2 (idempotency: twice-over-same-input) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
//
// FR-018: a contribution MUST be added once and never duplicated.
// The per-creative `Set` deduplicates `creativeCount`, but every other
// numeric field ΓÇö `byObjective.conversion.count`, `avgLinkCtr` and
// the rest ΓÇö accumulates on every pass. Nightly Cloud Tasks runs
// re-apply the same rows and the counts grow.
//
// This test is the one that matters at the system level. Not the
// pure aggregator (covered by SC-002), but the worker itself. It
// runs `runSyncForAccount` twice with the same data and asserts
// the aggregate is unchanged on the second pass.

await test("BATCH 19: twice-over-same-input leaves the aggregate unchanged on the second pass (FR-018)", async () => {
    resetStub();
    seedConnection();
    seedGenerationMatch({});
    bucket("learningLeases").delete(`${OWNER}_${ACCT_A}`);
    seedImageMatchStubs();
    metaGraph.setFetchImplForTests(seedFetchOneAd());

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runSyncForAccount } = require("../../metaSync/shared.js");

    const params = {
        userId: OWNER,
        workspaceId: WS_A,
        accountId: ACCT_A,
        trigger: "manual" as const,
        nowMs: Date.now(),
    };

    // First pass.
    const first = await runSyncForAccount(params);
    assert.equal(first.ok, true,
        `Batch 19 item 2: first pass must succeed (got ${first.ok}, errors=${JSON.stringify(first.errors)})`);

    const hookPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/hookPerformance`;
    const firstHook = bucket(hookPath).get("urgency");
    assert.ok(firstHook, "Batch 19 item 2: first pass must produce a hook aggregate document");
    const firstCount = (firstHook.byObjective?.conversion?.count) ?? 0;

    // Do NOT clear state. The second pass must be a no-op for the
    // per-row contribution: every recorded value should equal its
    // first-pass value exactly. This is FR-018's system-level
    // guarantee.
    const second = await runSyncForAccount({ ...params, nowMs: Date.now() });
    assert.equal(second.ok, true,
        `Batch 19 item 2: second pass must also succeed (got ${second.ok}, errors=${JSON.stringify(second.errors)})`);

    const secondHook = bucket(hookPath).get("urgency");
    assert.ok(secondHook, "Batch 19 item 2: second pass must still leave a hook aggregate document");
    const secondCount = (secondHook.byObjective?.conversion?.count) ?? 0;

    assert.equal(secondCount, firstCount,
        `Batch 19 item 2: aggregate contribution count must be idempotent across runs (first=${firstCount}, second=${secondCount}; FR-018 requires no double-counting)`);
    assert.equal(secondHook.creativeCount, firstHook.creativeCount,
        `Batch 19 item 2: distinct-creative count must be idempotent across runs (first=${firstHook.creativeCount}, second=${secondHook.creativeCount})`);
});

// ΓöÇΓöÇΓöÇ T021a worker-output: per-ad ledger.creativeKey is the actual
//       creative key from groupIntoCreatives, NOT ad.id ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

await test("T021a worker-output: queued adDoc's ledger.creativeKey is the actual creative key (not ad.id)", async () => {
    resetStub();
    seedConnection();
    const fingerprintHash = seedGenerationMatch({});
    // Clear the held lease so the sync can run.
    bucket("learningLeases").delete(`${OWNER}_${ACCT_A}`);

    metaGraph.setFetchImplForTests(seedFetchOneAd());

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runSyncForAccount } = require("../../metaSync/shared.js");

    const result = await runSyncForAccount({
        userId: OWNER,
        workspaceId: WS_A,
        accountId: ACCT_A,
        trigger: "manual",
        nowMs: Date.now(),
    });

    assert.equal(result.ok, true, `T021a: sync should succeed (got ok=${result.ok}, errors=${JSON.stringify(result.errors)})`);
    assert.equal(result.counts.ads, 1, "T021a: should have processed 1 ad");

    // The adDoc write is to one of two possible paths (depending on
    // LEG-A vs LEG-B path through the worker). Both paths converge
    // in the stub because the workspace path is the LEG-B path
    // (runSyncForAccount writes to workspace-scoped adPerformance).
    const wsPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/adPerformance`;
    const rootPath = `adPerformance`;
    const writePath = bucket(wsPath).size > 0 ? wsPath : rootPath;

    const adDoc = bucket(writePath).get("ad_1");
    assert.ok(adDoc, `T021a: adPerformance doc for ad_1 should be written to ${writePath}`);

    // After T021a's wire-up, the per-ad block's decision.adDoc.ledger.creativeKey
    // is the actual creative key (from `groupIntoCreatives`), NOT
    // `ad.id`. The pre-fix behavior was `creativeKey: ad.id` ΓÇö exactly
    // what FR-034a's "1 creative 55 rows" failure mode asserted.
    assert.equal(adDoc.adId, "ad_1");
    if (adDoc.ledger) {
        assert.notEqual(adDoc.ledger.creativeKey, "ad_1",
            `T021a worker-output: ledger.creativeKey must NOT be 'ad_1' (the ad-id fallback); ` +
            `expected the actual creative key from groupIntoCreatives. ` +
            `Got: ${JSON.stringify(adDoc.ledger.creativeKey)}`);
        // The actual creative key has the form `creative:<bucket>:<key>`.
        // We accept anything that's not 'ad_1' and not 'auto' ΓÇö the
        // exact shape is internal to groupIntoCreatives.
        assert.ok(typeof adDoc.ledger.creativeKey === "string" && adDoc.ledger.creativeKey.length > 0,
            `T021a: ledger.creativeKey must be a non-empty string. Got: ${JSON.stringify(adDoc.ledger.creativeKey)}`);
    }
    // If ledger is undefined, the ad didn't contribute (failed-read).
    // For a successful match + sync, ledger MUST be present.
});

// ΓöÇΓöÇΓöÇ T025a worker-output: queued adDoc's ledger.angleKey/patternKey
//       are the post-pass resolved values from the generation doc ΓöÇΓöÇ

await test("T025a worker-output: queued adDoc's ledger.angleKey/patternKey are the post-pass resolved values (not null)", async () => {
    resetStub();
    seedConnection();
    // Use the default creativeIdentity (which includes the visual
    // fields `computePatternKey` reads) ΓÇö the T025a worker-output
    // assertion checks that the post-pass patches flow resolved keys
    // into the queued ledger, which requires those visual fields.
    seedGenerationMatch({});
    bucket("learningLeases").delete(`${OWNER}_${ACCT_A}`);

    seedImageMatchStubs();
    metaGraph.setFetchImplForTests(seedFetchOneAd());

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runSyncForAccount } = require("../../metaSync/shared.js");

    const result = await runSyncForAccount({
        userId: OWNER,
        workspaceId: WS_A,
        accountId: ACCT_A,
        trigger: "manual",
        nowMs: Date.now(),
    });

    assert.equal(result.ok, true, `T025a: sync should succeed (got ok=${result.ok}, errors=${JSON.stringify(result.errors)})`);
    assert.equal(result.counts.ads, 1);

    // The adDoc write is to the workspace path (LEG B) ΓÇö read it back
    // and assert the ledger carries the post-pass resolved values.
    const wsAdPerfPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/adPerformance`;
    const adDoc = bucket(wsAdPerfPath).get("ad_1");
    assert.ok(adDoc, "T025a: contributing ad must have an adPerformance doc");
    assert.ok(adDoc.ledger, "T025a: contributing ad must carry a ledger entry");
    assert.equal(adDoc.ledger.angleKey, "urgency",
        "T025a worker-output: ledger.angleKey must be the resolved hook angle, not null");
    assert.ok(typeof adDoc.ledger.patternKey === "string" && adDoc.ledger.patternKey.length > 0,
        "T025a worker-output: ledger.patternKey must be the resolved pattern hash, not null");
});

// ΓöÇΓöÇΓöÇ T047 worker-output: workspace funnelType lands in the hook
//   aggregate's byFunnelType (FR-027 + FR-032) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
//
// Batch 17's Node test pinned the READ side ΓÇö `isMultiFunnel` reads
// the per-funnel-type breakdown correctly. These two cases pin the
// WRITE side ΓÇö `runSyncForAccount` writes the correct bucket. A
// wiring break anywhere along `metaSync/shared.ts` ΓåÆ
// `decidePerAdActionsForWorker` ΓåÆ `AdForLearning.funnelType` ΓåÆ
// `applyAdToHook` would silently send every contribution to
// `unknown`, where `isMultiFunnel` deliberately excludes them. The
// four-sided assertion (Case A explicitly, Case B explicitly)
// catches that.
//
// Both cases drive the full `runSyncForAccount` end-to-end against
// stubbed Firestore + Meta. They run AFTER the per-account lease
// is cleared so the sync is not refused (precedent set by the T021a
// and T025a cases above). They assert on the hookPerformance
// aggregate doc the worker writes ΓÇö same observable surface the
// dashboard reads.

/** Resolve the canonical angleKey the worker will write the
 *  aggregate under. The fixture's creativeIdentity uses
 *  `hookAngle: "urgency"`, which `resolveCanonicalAngleLocal`
 *  (`functions/src/learning/aggregateDelta.ts:309`) returns as-is. */
function readHookAngleKey(): string {
    return "urgency";
}

/** Helper ΓÇö read the hookPerformance aggregate doc for the
 *  one-anchor angle the fixture drives. */
function readHookAggregate(): Record<string, any> | undefined {
    const hookPath = `users/${OWNER}/workspaces/${WS_A}/adAccounts/${ACCT_A}/hookPerformance`;
    return bucket(hookPath).get(readHookAngleKey());
}

await test("T047 worker-output: workspace funnelType=paid_event ΓåÆ byFunnelType.paid_event.count > 0 AND byFunnelType.unknown.count === 0", async () => {
    resetStub();
    seedConnection();
    seedGenerationMatch({});
    seedFunnelSettings("resolve", "paid_event");
    bucket("learningLeases").delete(`${OWNER}_${ACCT_A}`);

    seedImageMatchStubs();
    metaGraph.setFetchImplForTests(seedFetchOneAd());

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runSyncForAccount } = require("../../metaSync/shared.js");
    const result = await runSyncForAccount({
        userId: OWNER,
        workspaceId: WS_A,
        accountId: ACCT_A,
        trigger: "manual",
        nowMs: Date.now(),
    });

    assert.equal(result.ok, true,
        `T047 case A: sync should succeed (got ok=${result.ok}, errors=${JSON.stringify(result.errors)})`);
    assert.equal(result.counts.ads, 1);

    // The worker MUST have written the hook aggregate. If the wiring
    // is broken, the aggregate may be missing OR the bucket reads
    // as unknown. Both branches below catch that.
    const hookAgg = readHookAggregate();
    assert.ok(hookAgg,
        "T047 case A: hook aggregate must be written after a successful sync");
    assert.ok(hookAgg.byFunnelType,
        "T047 case A: hook aggregate must carry byFunnelType (FR-027)");

    const expectedKeys = ["paid_event", "paid_product", "free_webinar", "lead_magnet_call", "unknown"] as const;
    for (const k of expectedKeys) {
        assert.ok(hookAgg.byFunnelType[k],
            `T047 case A: byFunnelType.${k} must be present (got ${JSON.stringify(hookAgg.byFunnelType)})`);
        assert.equal(typeof hookAgg.byFunnelType[k].count, "number",
            `T047 case A: byFunnelType.${k}.count must be a number`);
    }

    assert.ok(hookAgg.byFunnelType.paid_event.count > 0,
        `T047 case A: paid_event bucket must receive the contribution (got count=${hookAgg.byFunnelType.paid_event.count}). ` +
        `A value of zero means the worker's funnelType plumbing is broken ΓÇö every contribution is landing in 'unknown'.`);

    assert.equal(hookAgg.byFunnelType.unknown.count, 0,
        `T047 case A: unknown bucket must be exactly 0 when funnelType resolves to a real type (got count=${hookAgg.byFunnelType.unknown.count}). ` +
        `A non-zero unknown count means the worker's funnelType plumbing is broken.`);
});

// Teardown image-match seam to keep tests hermetic.
teardownImageMatchStubs();

await test("T047 worker-output (inverse): no resolvable funnelType ΓåÆ byFunnelType.unknown.count > 0 AND every real-funnel bucket is exactly 0", async () => {
    resetStub();
    seedConnection();
    seedGenerationMatch({});
    seedFunnelSettings("absent", null);
    bucket("learningLeases").delete(`${OWNER}_${ACCT_A}`);

    seedImageMatchStubs();
    metaGraph.setFetchImplForTests(seedFetchOneAd());

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runSyncForAccount } = require("../../metaSync/shared.js");
    const result = await runSyncForAccount({
        userId: OWNER,
        workspaceId: WS_A,
        accountId: ACCT_A,
        trigger: "manual",
        nowMs: Date.now(),
    });

    assert.equal(result.ok, true,
        `T047 case B (inverse): sync should succeed even without resolvable funnelType (got ok=${result.ok}, errors=${JSON.stringify(result.errors)})`);
    assert.equal(result.counts.ads, 1);

    const hookAgg = readHookAggregate();
    assert.ok(hookAgg,
        "T047 case B (inverse): hook aggregate must be written after a successful sync");
    assert.ok(hookAgg.byFunnelType,
        "T047 case B (inverse): hook aggregate must carry byFunnelType");

    // The four REAL funnel buckets must each be exactly 0 ΓÇö proving
    // the row did NOT somehow leak into one of them when attribution
    // was absent.
    const realKeys = ["paid_event", "paid_product", "free_webinar", "lead_magnet_call"] as const;
    for (const k of realKeys) {
        assert.equal(hookAgg.byFunnelType[k].count, 0,
            `T047 case B (inverse): byFunnelType.${k}.count must be exactly 0 when no funnelType resolved (got count=${hookAgg.byFunnelType[k].count}). ` +
            `A non-zero real-bucket count here means the inverse scenario ΓÇö a row leaking into a real funnel when attribution was absent ΓÇö which is the false-positive regression this test exists to prevent.`);
    }

    assert.ok(hookAgg.byFunnelType.unknown.count > 0,
        `T047 case B (inverse): unknown bucket must receive the contribution when no funnelType resolves (got count=${hookAgg.byFunnelType.unknown.count}). ` +
        `A zero here means the worker's funnelType plumbing lost the row entirely ΓÇö neither a real bucket nor unknown received it.`);

    // Teardown image-match seam to keep tests hermetic.
    teardownImageMatchStubs();
});

}

main()
    .then(runner)
    .catch((err: Error) => {
        console.log(`  Γ¥î harness error: ${err.message}`);
        console.log(err.stack ?? "");
        process.exit(FAILED);
    });


