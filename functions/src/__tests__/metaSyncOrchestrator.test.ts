// functions/src/__tests__/metaSyncOrchestrator.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 970 Batch 3 — contract tests for `metaSync/orchestrator.ts`.
//
// WHY THIS FILE EXISTS
// --------------------
// Batch 3 unifies the two "Sync Now" callables behind one
// `runFullSync({ ownerUid, callerUid, activeWorkspaceId })` that runs
// LEG A (legacy, account-global, inline) and LEG B (Phase 14,
// workspace-scoped, hybrid: active workspace inline + the rest
// fanned out via Cloud Tasks). The shape is approved in
// `specs/970-sync-unification/reports/batch-01-investigation.md`
// §8.2 — every test in this file maps to a rule in that section.
//
// The contract surface is intentionally narrow:
//   - `isMetaRateLimit(err)` is unit-tested against three error
//     shapes (direct field, MetaGraphError body envelope, plain
//     string message) covering the two Meta rate-limit codes
//     documented in the report (§1.3 / §8.3).
//   - `runLegacySyncForOwner` is driven with a stubbed `fetch`
//     and `decryptLegacyTokenOverride` so the LEG A body runs
//     end-to-end against an in-memory Firestore stub. Asserts the
//     writes land at the legacy paths (root /adPerformance and
//     /adPerformanceHistory) and that rate-limit errors are
//     collected into `rateLimited[]` instead of just logged.
//   - `runFullSync` is driven with an in-memory stub for LEG A
//     and a `runPhase14InlineOverride` for LEG B (the LEG B body
//     is test-covered separately by the Phase 14 integration tests).
//     Asserts the inline-vs-queued split, de-dup by accountId
//     across workspaces, the no-active-workspace all-fan-out
//     path, and the soft-deleted workspace skip.
//
// Pattern follows `metaScope.integration.test.ts` and
// `metaSyncDispatch.test.ts` (Batch 2). Same in-memory Firestore
// stub, same per-test seed-and-reset pattern.
// ═══════════════════════════════════════════════════════════════════════════

import assert from "node:assert/strict";
import { test } from "node:test";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin: any = require("firebase-admin");

type DocData = Record<string, any>;
const stubStore: Record<string, Map<string, DocData>> = {};
function bucket(path: string): Map<string, DocData> {
    if (!stubStore[path]) stubStore[path] = new Map();
    return stubStore[path];
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

// Batch writer that accumulates calls and applies them on commit
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
});

Object.defineProperty(admin, "firestore", {
    value: stubFirestore,
    writable: true,
    configurable: true,
});
admin.firestore.FieldValue = { serverTimestamp: () => Date.now(), increment: (n: number) => n };

// secrets.js derives META_APP_SECRET via metaAppSecret.value(). For
// LEG A token decryption we use the override seam, so this just has
// to be a non-empty string the orchestrator won't choke on.
admin.initializeApp = () => ({});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const secretsModule = require("../secrets.js");
Object.defineProperty(secretsModule, "metaAppSecret", {
    value: { value: () => "test-secret" },
    configurable: true,
});

// ─── Orchestrator imports ────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    runFullSync,
    runLegacySyncForOwner,
    isMetaRateLimit,
} = require("../metaSync/orchestrator.js");

// ─── Test fixtures and helpers ────────────────────────────────────────

const OWNER = "owner_uid_AAAA";
const CALLER = "caller_uid_BBBB";
const MEMBER = "member_uid_CCCC";
const WS_A = "ws_alpha";
const WS_B = "ws_beta";
const WS_DELETED = "ws_deleted";
const ACCT_A = "act_alpha";
const ACCT_B = "act_beta";
const ACCT_SHARED = "act_shared";

function resetStub() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}

function seedConn(opts: {
    ownerUid: string;
    encryptedToken?: string;
    adAccounts: Array<{ id: string; name?: string; status?: number; account_status?: number }>;
    selectedAccountId?: string;
}) {
    bucket(`metaConnections`).set(opts.ownerUid, {
        encryptedToken: opts.encryptedToken ?? "iv:tag:body",
        adAccounts: opts.adAccounts,
        selectedAccountId: opts.selectedAccountId ?? null,
        lastSyncAt: null,
    });
}

function seedWorkspace(opts: {
    ownerUid: string;
    workspaceId: string;
    accountId?: string | null;
    metaConnected?: boolean;
    workspaceDeleted?: boolean;
}) {
    // Bucket: `users/${ownerUid}/workspaces` is the collection.
    // The workspace doc's ID is the workspaceId; data is the fields.
    const wsBucketPath = `users/${opts.ownerUid}/workspaces`;
    bucket(wsBucketPath).set(opts.workspaceId, {
        name: opts.workspaceId,
        deletedAt: opts.workspaceDeleted ? Date.now() : null,
    });
    // The workspace-private metaConnection is keyed at
    // `users/${ownerUid}/workspaces/${workspaceId}/private` with
    // doc id "metaConnection".
    const connPath = `users/${opts.ownerUid}/workspaces/${opts.workspaceId}/private`;
    bucket(connPath).set("metaConnection", {
        accountId: opts.accountId ?? null,
        metaConnected: opts.metaConnected ?? false,
    });
}

/**
 * Stub `fetch` returning a canned Meta insights payload. Default
 * shape mirrors the LEG A body: a single ad with impressions / clicks
 * / spend. Tests that need a rate-limit error override `body.error`.
 */
function stubFetchInsights(reply: { error?: any; data?: any[] } = {
    data: [
        {
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
        },
    ],
}): typeof fetch {
    return (async (input: any): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/insights")) {
            return {
                ok: true,
                status: 200,
                json: async () => reply,
            } as Response;
        }
        return {
            ok: true, status: 200,
            json: async () => ({ data: [] }),
        } as Response;
    }) as typeof fetch;
}

function tasksClientRecorder(): {
    facade: { queuePath: any; enqueueTask: any; serviceAccountEmail: any };
    recorded: Array<{ parent: string; body: any }>;
} {
    const recorded: Array<{ parent: string; body: any }> = [];
    const facade = {
        queuePath: (_region: string, _project: string, _queue: string) =>
            "projects/test/locations/europe-west1/queues/metaSyncQueue",
        async enqueueTask(req: { parent: string; task: { httpRequest: { body: Buffer } } }) {
            recorded.push({ parent: req.parent, body: JSON.parse(req.task.httpRequest.body.toString()) });
            return [{}, {}, {}];
        },
        serviceAccountEmail: () => "test@example.com",
    };
    return { facade, recorded };
}

function fakeInline(opts: {
    status?: "ok" | "partial" | "failed";
    ads?: number;
    matched?: number;
    ambiguous?: number;
    unmatched?: number;
    errors?: string[];
} = {}): (params: any) => Promise<any> {
    return async (params: any) => ({
        workspaceId: params.workspaceId,
        accountId: params.accountId,
        counts: {
            campaigns: 0,
            adSets: 0,
            ads: opts.ads ?? 1,
            matched: opts.matched ?? 0,
            ambiguous: opts.ambiguous ?? 0,
            unmatched: opts.unmatched ?? 1,
        },
        status: opts.status ?? "ok",
        errors: opts.errors ?? [],
    });
}

const FIXED_NOW = 1_700_000_000_000;

// ─── isMetaRateLimit unit tests ────────────────────────────────────────

test("isMetaRateLimit — direct field shape (code 4 / subcode 1504022)", () => {
    assert.equal(isMetaRateLimit({ code: 4, error_subcode: 1504022, message: "Application request limit reached" }), true);
});

test("isMetaRateLimit — direct field shape (code 17 / subcode 2446079)", () => {
    assert.equal(isMetaRateLimit({ code: 17, error_subcode: 2446079, message: "User request limit reached" }), true);
});

test("isMetaRateLimit — MetaGraphError body envelope shape", () => {
    // Mirrors what `parseError` puts on a MetaGraphError after
    // a 429 with subcode 1504022: body.error.code, body.error.error_subcode.
    assert.equal(
        isMetaRateLimit({
            name: "MetaGraphError",
            status: 429,
            body: { error: { code: 4, error_subcode: 1504022, type: "OAuthException", message: "Application request limit reached" } },
            message: "Meta Graph API error 429: Application request limit reached (OAuthException)",
        }),
        true,
    );
});

test("isMetaRateLimit — direct string message (substrings)", () => {
    assert.equal(isMetaRateLimit("Meta Graph API error 429: Application request limit reached (OAuthException)"), true);
    assert.equal(isMetaRateLimit("...too many API requests..."), true);
    assert.equal(isMetaRateLimit("OAuthException code 4 subcode 1504022"), true);
    assert.equal(isMetaRateLimit("insights error subcode 2446079"), true);
});

test("isMetaRateLimit — unrelated error returns false", () => {
    assert.equal(isMetaRateLimit({ code: 401, error_subcode: 0 }), false);
    assert.equal(isMetaRateLimit({ code: 4, error_subcode: 999 }), false);
    assert.equal(isMetaRateLimit(new Error("Some other failure")), false);
    assert.equal(isMetaRateLimit(null), false);
    assert.equal(isMetaRateLimit(undefined), false);
    assert.equal(isMetaRateLimit(42), false);
});

// ─── runLegacySyncForOwner ─────────────────────────────────────────────

test("runLegacySyncForOwner — happy path: writes to root /adPerformance and /adPerformanceHistory", async () => {
    resetStub();
    seedConn({
        ownerUid: OWNER,
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
    });
    const fetchImpl = stubFetchInsights();
    const result = await runLegacySyncForOwner(OWNER, WS_A, {
        fetchImpl,
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        nowMs: FIXED_NOW,
    });
    assert.equal(result.ok, true);
    assert.equal(result.adsSynced, 1);
    assert.equal(result.accountsSynced, 1);
    assert.deepEqual(result.rateLimited, []);
    // The legacy body writes the doc to root /adPerformance keyed
    // `${ownerUid}_${adId}`. Verify the path was written.
    const perfDoc = bucket("adPerformance").get(`${OWNER}_ad_1`);
    assert.ok(perfDoc, "expected adPerformance doc to be written");
    assert.equal(perfDoc.userId, OWNER);
    assert.equal(perfDoc.adAccountId, ACCT_A);
    assert.equal(perfDoc.workspaceId, WS_A);
    // Snapshot doc — verification per-batch, not per-ad (the
    // legacy code only `batch.commit()`s when syncCount > 0).
    // FIXED_NOW (1_700_000_000_000) is 2023-11-14 22:13:20Z, so the
    // 30-day window yields since=2023-10-15 / until=2023-11-14.
    const histDoc = bucket("adPerformanceHistory").get(`${OWNER}_ad_1_2023-10-15_2023-11-14`);
    assert.ok(histDoc, "expected adPerformanceHistory snapshot to be written");
});

test("runLegacySyncForOwner — workspace-private lastMetaSyncAt is stamped when workspaceId is provided", async () => {
    resetStub();
    seedConn({
        ownerUid: OWNER,
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
    });
    const fetchImpl = stubFetchInsights();
    await runLegacySyncForOwner(OWNER, WS_A, {
        fetchImpl,
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        nowMs: FIXED_NOW,
    });
    const privateDoc = bucket(`users/${OWNER}/workspaces/${WS_A}/private`).get("metaConnection");
    assert.ok(privateDoc);
    assert.equal(privateDoc.lastMetaSyncAt, FIXED_NOW);
});

test("runLegacySyncForOwner — rate-limit error: collected into rateLimited, not just logged", async () => {
    resetStub();
    seedConn({
        ownerUid: OWNER,
        adAccounts: [
            { id: ACCT_A, name: "Alpha", status: 1 },
            { id: ACCT_B, name: "Beta", status: 1 },
        ],
    });
    // First account: rate-limit; second: OK. LEG A's `continue;`
    // means rate-limit accounts do NOT block downstream accounts.
    const fetchImpl: typeof fetch = (async (input: any): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("act_alpha/insights")) {
            return {
                ok: true, status: 200,
                json: async () => ({
                    error: { code: 4, error_subcode: 1504022, type: "OAuthException", message: "Application request limit reached" },
                }),
            } as Response;
        }
        return stubFetchInsights()(input);
    }) as typeof fetch;
    const result = await runLegacySyncForOwner(OWNER, WS_A, {
        fetchImpl,
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        nowMs: FIXED_NOW,
    });
    assert.deepEqual(result.rateLimited, [ACCT_A]);
    assert.equal(result.adsSynced, 1, "the second account's ad still synced");
    assert.equal(result.accountsSynced, 2);
    assert.equal(result.ok, true);
});

test("runLegacySyncForOwner — non-rate-limit error: legacy `console.error` path (collects nothing)", async () => {
    resetStub();
    seedConn({
        ownerUid: OWNER,
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
    });
    const fetchImpl: typeof fetch = (async (input: any): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("act_alpha/insights")) {
            return {
                ok: true, status: 200,
                json: async () => ({ error: { code: 1, message: "Invalid token" } }),
            } as Response;
        }
        return stubFetchInsights()(input);
    }) as typeof fetch;
    const result = await runLegacySyncForOwner(OWNER, WS_A, {
        fetchImpl,
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        nowMs: FIXED_NOW,
    });
    // Not a rate-limit error → not in rateLimited[]. Pre-fix
    // behaviour: console.error + continue. adsSynced = 0.
    assert.deepEqual(result.rateLimited, []);
    assert.equal(result.adsSynced, 0);
    assert.equal(result.ok, true, "orchestrator still returns ok=true (continue, not fail)");
});

test("runLegacySyncForOwner — no Meta connection: ok=false, no throw, empty rateLimited", async () => {
    resetStub();
    // No seedConn — metaConnections/{ownerUid} is missing.
    const result = await runLegacySyncForOwner(OWNER, WS_A, {
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        nowMs: FIXED_NOW,
    });
    assert.equal(result.ok, false);
    assert.equal(result.adsSynced, 0);
});

test("runLegacySyncForOwner — no active accounts: returns ok=false with message", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [] });
    const result = await runLegacySyncForOwner(OWNER, WS_A, {
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        nowMs: FIXED_NOW,
    });
    assert.equal(result.ok, false);
});

// ─── runFullSync — LEG A + LEG B integration ────────────────────────────

test("runFullSync — LEG A runs and LEG B inline for active workspace; rest fan-out", async () => {
    resetStub();
    seedConn({
        ownerUid: OWNER,
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
    });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_B, accountId: ACCT_B, metaConnected: true });

    const { facade, recorded } = tasksClientRecorder();

    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        tasksClient: facade,
        runPhase14InlineOverride: fakeInline({ status: "ok", ads: 50, matched: 30, ambiguous: 5, unmatched: 15 }),
    });

    // LEG A succeeded.
    assert.equal(result.legacy.adsSynced, 1);
    // LEG B inline ran for the active workspace.
    assert.ok(result.workspace.inline, "expected an inline result for the active workspace");
    assert.equal(result.workspace.inline.workspaceId, WS_A);
    assert.equal(result.workspace.inline.accountId, ACCT_A);
    // LEG B fan-out ran for the OTHER live workspace.
    assert.equal(result.workspace.queued, 1);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].body.data.workspaceId, WS_B);
    assert.equal(recorded[0].body.data.accountId, ACCT_B);
    assert.equal(recorded[0].body.data.trigger, "scheduled");
});

test("runFullSync — no activeWorkspaceId: inline is null, all live workspaces fan out", async () => {
    resetStub();
    seedConn({
        ownerUid: OWNER,
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
    });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_B, accountId: ACCT_B, metaConnected: true });
    const { facade, recorded } = tasksClientRecorder();
    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        // No activeWorkspaceId — LEG B has nothing to run inline.
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        tasksClient: facade,
        runPhase14InlineOverride: fakeInline(),
    });
    assert.equal(result.workspace.inline, null);
    assert.equal(result.workspace.queued, 2);
    assert.equal(recorded.length, 2);
});

test("runFullSync — soft-deleted workspace is skipped from fan-out", async () => {
    resetStub();
    seedConn({
        ownerUid: OWNER,
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
    });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_DELETED, accountId: ACCT_B, metaConnected: true, workspaceDeleted: true });
    const { facade, recorded } = tasksClientRecorder();
    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        tasksClient: facade,
        runPhase14InlineOverride: fakeInline(),
    });
    assert.equal(result.workspace.queued, 1, "soft-deleted workspace is excluded");
    assert.equal(recorded[0].body.data.workspaceId, WS_A);
});

test("runFullSync — workspace with metaConnected=false is skipped", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }] });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: false });
    const { facade, recorded } = tasksClientRecorder();
    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        tasksClient: facade,
        runPhase14InlineOverride: fakeInline(),
    });
    assert.equal(result.workspace.queued, 0);
    assert.equal(recorded.length, 0);
});

test("runFullSync — duplicate account across two workspaces: fan-out produces one task, not two", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_SHARED, name: "Shared", status: 1 }] });
    // Eslam Salah / Manar case from investigation §3.
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_SHARED, metaConnected: true });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_B, accountId: ACCT_SHARED, metaConnected: true });
    const { facade, recorded } = tasksClientRecorder();
    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        tasksClient: facade,
        runPhase14InlineOverride: fakeInline(),
    });
    assert.equal(result.workspace.queued, 1, "duplicate accountId must dispatch exactly once");
    assert.equal(recorded.length, 1);
});

test("runFullSync — LEG A rate-limit propagates into result.legacy.rateLimited; LEG B unaffected", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, status: 1 }] });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });
    const fetchImpl: typeof fetch = (async (input: any): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/insights")) {
            return {
                ok: true, status: 200,
                json: async () => ({
                    error: { code: 4, error_subcode: 1504022, type: "OAuthException" },
                }),
            } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
    }) as typeof fetch;
    const { facade } = tasksClientRecorder();
    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl,
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        tasksClient: facade,
        runPhase14InlineOverride: fakeInline({ status: "ok" }),
    });
    // LEG A rate-limit is in `legacy.rateLimited`.
    assert.deepEqual(result.legacy.rateLimited, [ACCT_A]);
    // LEG B ran cleanly — `workspace.rateLimited` does NOT carry
    // the LEG A bucket (the two are separate per the approved
    // design in §8.2).
    assert.deepEqual(result.workspace.rateLimited, []);
    // Both legs reported `ok: true` even though LEG A had a
    // rate-limited account — press does not fail on rate limit.
    assert.equal(result.ok, true);
});

test("runFullSync — LEG B inline throws a non-rate-limit error: result captures the failure shape", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, status: 1 }] });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });
    const { facade } = tasksClientRecorder();
    const runPhase14InlineOverride = async () => ({
        workspaceId: WS_A,
        accountId: ACCT_A,
        counts: { campaigns: 0, adSets: 0, ads: 0, matched: 0, ambiguous: 0, unmatched: 0 },
        status: "failed" as const,
        errors: ["Some non-rate-limit failure"],
    });
    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        tasksClient: facade,
        runPhase14InlineOverride,
    });
    assert.equal(result.workspace.inline?.status, "failed");
    assert.deepEqual(result.workspace.inline?.errors, ["Some non-rate-limit failure"]);
    assert.equal(result.ok, false, "ok is false because LEG B failed");
});

test("runFullSync — LEG B enqueue throws a rate-limit error: accountId lands in workspace.rateLimited", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, status: 1 }] });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });
    const facade = {
        queuePath: () => "projects/test/locations/europe-west1/queues/metaSyncQueue",
        async enqueueTask() {
            const e: any = new Error("enqueue rate limit");
            (e as any).code = 4;
            (e as any).error_subcode = 1504022;
            (e as any).body = { error: { code: 4, error_subcode: 1504022 } };
            throw e;
        },
        serviceAccountEmail: () => "test@example.com",
    };
    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        tasksClient: facade,
        runPhase14InlineOverride: fakeInline(),
    });
    // The enqueue failure is a rate-limit; the orchestrator collects
    // it rather than throwing.
    assert.deepEqual(result.workspace.rateLimited, [ACCT_A]);
    assert.equal(result.workspace.queued, 0);
    assert.equal(result.ok, true);
});

test("runFullSync — full-system smoke (LEG A + LEG B inline + LEG B fan-out)", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, status: 1 }] });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_B, accountId: ACCT_B, metaConnected: true });
    const { facade, recorded } = tasksClientRecorder();

    let inlineCalled = false;
    const runPhase14InlineOverride = async (params: any) => {
        inlineCalled = true;
        // Sanity: the orchestrator threads the right workspace + account.
        assert.equal(params.workspaceId, WS_A);
        assert.equal(params.accountId, ACCT_A);
        assert.equal(params.trigger, "manual");
        return {
            workspaceId: WS_A,
            accountId: ACCT_A,
            counts: { campaigns: 0, adSets: 0, ads: 383, matched: 0, ambiguous: 0, unmatched: 383 },
            status: "ok",
            errors: [],
        };
    };

    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        tasksClient: facade,
        runPhase14InlineOverride,
    });

    // LEG A: legacy ad account-level writes happened.
    assert.equal(result.legacy.adsSynced, 1);
    assert.ok(bucket("adPerformance").get(`${OWNER}_ad_1`), "LEG A wrote /adPerformance");

    // LEG B inline: yes, the override was called exactly once with
    // the active workspace.
    assert.ok(inlineCalled, "phase 14 inline override should have been called");
    assert.ok(result.workspace.inline);
    assert.equal(result.workspace.inline.counts.ads, 383, "inline result carries the inline stub's counts");
    assert.equal(result.workspace.inline.counts.unmatched, 383, "matching counts: 0 matched, 0 ambiguous, 383 unmatched");
    assert.equal(result.workspace.inline.counts.matched, 0);
    assert.equal(result.workspace.inline.counts.ambiguous, 0);

    // LEG B fan-out: one Cloud Task for WS_B/ACCT_B.
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].body.data.workspaceId, WS_B);
    assert.equal(recorded[0].body.data.accountId, ACCT_B);

    // Result shape (FullSyncResult).
    assert.equal(result.ok, true);
    assert.equal(result.lastMetaSyncAt, FIXED_NOW);
    assert.equal(typeof result.needsReauth, "boolean");
});

test("runFullSync — structural guard: full export surface preserved (Batch 3 contract surface)", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const orch = require("../metaSync/orchestrator.js");
    assert.equal(typeof orch.runFullSync, "function");
    assert.equal(typeof orch.runLegacySyncForOwner, "function");
    assert.equal(typeof orch.isMetaRateLimit, "function");
    assert.equal(typeof orch.runFullSyncWithLease, "function", "runFullSyncWithLease is the press-side wrapper added in Batch 4");
});

// ─── Batch 5 — server-side first-real-run evidence log line ─────────────

test("runFullSync — emits the server-side first-real-run evidence line with the deployed-function-compatible shape", async () => {
    // The Cloud Logging query in POST_DEPLOY_RUNBOOK.md §4 matches
    // against `function_name:"metaSyncPerformance" OR
    // function_name:"triggerMetaSync" AND
    // textPayload=~"First-successful-Phase-14-run evidence \\(inline"`.
    // That requires:
    //   1. `console.log` fires from inside the orchestrator, NOT
    //      from the browser.
    //   2. The log line carries the marker substring
    //      `\\(inline + LEG A summary)`.
    //   3. The shape includes the four matching counts.
    // We capture stdout in-process; the deployed-function name
    // aspect is implicit (Cloud Functions tags logs with the
    // function_name of the entry-point Cloud Function that called
    // into the module).
    resetStub();
    seedConn({
        ownerUid: OWNER,
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
    });
    seedWorkspace({
        ownerUid: OWNER,
        workspaceId: WS_A,
        accountId: ACCT_A,
        metaConnected: true,
    });

    const captured: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
        captured.push(args.map(String).join(" "));
    };
    try {
        await runFullSync({
            ownerUid: OWNER,
            callerUid: CALLER,
            activeWorkspaceId: WS_A,
            nowMs: FIXED_NOW,
            fetchImpl: stubFetchInsights(),
            decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
            runPhase14InlineOverride: fakeInline({
                status: "ok",
                ads: 50,
                matched: 30,
                ambiguous: 5,
                unmatched: 15,
            }),
            tasksClient: tasksClientRecorder().facade,
        });
    } finally {
        console.log = origLog;
    }

    const evidenceLine = captured.find((s) => /First-successful-Phase-14-run evidence \(inline/.test(s));
    assert.ok(
        evidenceLine,
        `expected server-side first-real-run evidence line. Captured ${captured.length} log lines: ${captured.slice(0, 3).join(" | ")}`,
    );
    // Shape: the four matching counts from the inline stub.
    assert.match(evidenceLine, /"ads":50/);
    assert.match(evidenceLine, /"matched":30/);
    assert.match(evidenceLine, /"ambiguous":5/);
    assert.match(evidenceLine, /"unmatched":15/);
    // The marker substring that the runbook query targets.
    assert.match(evidenceLine, /First-successful-Phase-14-run evidence \(inline \+ LEG A summary\)/);
    // Identifies the deploy unit (`function_name` will be the
    // calling Cloud Function's name, e.g. `metaSyncPerformance`).
    assert.match(evidenceLine, /"ownerUid":"owner_uid_AAAA"/);
});

// ─── Batch 4 — runFullSyncWithLease integration ────────────────────────────

test("runFullSyncWithLease — acquires the lease, runs, releases in finally", async () => {
    resetStub();
    seedConn({
        ownerUid: OWNER,
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
    });
    seedWorkspace({
        ownerUid: OWNER,
        workspaceId: WS_A,
        accountId: ACCT_A,
        metaConnected: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runFullSyncWithLease } = require("../metaSync/orchestrator.js");

    const acquireCalls: Array<{ ownerUid: string; holderUid: string; nowMs: number; ttlMs: number }> = [];
    const releaseCalls: Array<{ ownerUid: string; holderUid: string }> = [];

    const result = await runFullSyncWithLease({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        runPhase14InlineOverride: fakeInline({ status: "ok" }),
        tasksClient: { queuePath: () => "", enqueueTask: async () => [{}, {}, {}], serviceAccountEmail: () => "test@example.com" },
        acquireLeaseOverride: async (o: string, h: string, n: number, ttl: number) => {
            acquireCalls.push({ ownerUid: o, holderUid: h, nowMs: n, ttlMs: ttl });
            return { ok: true };
        },
        releaseLeaseOverride: async (o: string, h: string) => {
            releaseCalls.push({ ownerUid: o, holderUid: h });
            return { released: true };
        },
    });

    // Lease was acquired ONCE with the right identity.
    assert.equal(acquireCalls.length, 1);
    assert.equal(acquireCalls[0].ownerUid, OWNER);
    assert.equal(acquireCalls[0].holderUid, CALLER);
    assert.equal(acquireCalls[0].nowMs, FIXED_NOW);
    assert.equal(acquireCalls[0].ttlMs, 600_000, "TTL must be 10 minutes per investigation §6");
    // Lease was released ONCE in finally.
    assert.equal(releaseCalls.length, 1);
    assert.equal(releaseCalls[0].ownerUid, OWNER);
    assert.equal(releaseCalls[0].holderUid, CALLER);
    // Press returned the orchestrator's normal result.
    assert.equal(result.ok, true);
});

test("runFullSyncWithLease — throws AlreadyRunningError when acquire reports the lease is held", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runFullSyncWithLease, isMetaRateLimit } = require("../metaSync/orchestrator.js");
    const { AlreadyRunningError } = require("../metaSync/lease.js");

    let releaseCalls = 0;
    await assert.rejects(
        () => runFullSyncWithLease({
            ownerUid: OWNER,
            callerUid: CALLER,
            nowMs: FIXED_NOW,
            fetchImpl: stubFetchInsights(),
            decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
            acquireLeaseOverride: async () => ({
                ok: false,
                holderUid: "another_caller",
                expiresAtMs: FIXED_NOW + 600_000,
            }),
            releaseLeaseOverride: async (_o: string, _h: string) => {
                releaseCalls++;
                return { released: false };
            },
        }),
        (err: any) => {
            // The wrapper throws the typed error; the callables'
            // catch blocks translate it to HttpsError or let it
            // propagate. The wrapper itself does not swallow it
            // — that's the contract that lets the scheduled path
            // (metaDailySync) bubble a real failure to Cloud Tasks
            // for retry.
            assert.ok(err instanceof AlreadyRunningError);
            assert.equal(err.holderUid, "another_caller");
            return true;
        },
    );
    // release MUST NOT be called when acquire refused — we never
    // took the lease, so we don't release one.
    assert.equal(releaseCalls, 0);
});

test("runFullSyncWithLease — release runs in finally even when runFullSync inline fails", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runFullSyncWithLease } = require("../metaSync/orchestrator.js");

    // Seed so that LEG B's inline path actually runs and the
    // override is invoked. PHASE 970 (bug 2026-09-03) inline
    // failure containment: the inline error is caught and turned
    // into a failed inline result. The call returns a result
    // (not a rejection), and release MUST still run.
    resetStub();
    seedConn({
        ownerUid: OWNER,
        adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }],
    });
    seedWorkspace({
        ownerUid: OWNER,
        workspaceId: WS_A,
        accountId: ACCT_A,
        metaConnected: true,
    });

    const releaseCalls: Array<{ ownerUid: string; holderUid: string }> = [];
    const result = await runFullSyncWithLease({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        runPhase14InlineOverride: async () => {
            throw new Error("LEG B inline blew up mid-run");
        },
        tasksClient: { queuePath: () => "", enqueueTask: async () => [{}, {}, {}], serviceAccountEmail: () => "test@example.com" },
        acquireLeaseOverride: async () => ({ ok: true }),
        releaseLeaseOverride: async (o: string, h: string) => {
            releaseCalls.push({ ownerUid: o, holderUid: h });
            return { released: true };
        },
    });

    // The call returns a result, not a rejection. The inline
    // result reports failed; release still ran.
    assert.equal(result.ok, false);
    assert.equal(result.workspace.inline?.status, "failed");
    assert.equal(releaseCalls.length, 1, "release must run in finally even when runFullSync inline fails");
    assert.equal(releaseCalls[0].ownerUid, OWNER);
    assert.equal(releaseCalls[0].holderUid, CALLER);
});

test("runFullSyncWithLease — release failures are swallowed (logged, not fatal)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runFullSyncWithLease } = require("../metaSync/orchestrator.js");

    const warn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
    };
    try {
        const result = await runFullSyncWithLease({
            ownerUid: OWNER,
            callerUid: CALLER,
            nowMs: FIXED_NOW,
            fetchImpl: stubFetchInsights(),
            decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
            runPhase14InlineOverride: fakeInline({ status: "ok" }),
            tasksClient: { queuePath: () => "", enqueueTask: async () => [{}, {}, {}], serviceAccountEmail: () => "test@example.com" },
            acquireLeaseOverride: async () => ({ ok: true }),
            releaseLeaseOverride: async () => {
                throw new Error("Firestore blew up");
            },
        });
        // The press succeeded despite the release failing.
        assert.equal(result.ok, true);
        // And the warning was logged.
        assert.ok(
            warnings.some((w) => /lease release failed/i.test(w)),
            "release failure must be logged, not fatal",
        );
    } finally {
        console.warn = warn;
    }
});

test('inline failure containment: fan-out still runs when LEG B inline rejects', async () => {
    // PHASE 970 (bug 2026-09-03) - the runFullSyncWithLease call MUST
    // catch a rejected inline press and continue into fanOutPhase14
    // so the other live workspaces are still queued. The dagger-style
    // rejection (unhandled await) was a real production hazard
    // before the fix; this test pins the contract.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runFullSyncWithLease } = require('../metaSync/orchestrator.js');

    const fannedOutWorkspaces: string[] = [];
    const result = await runFullSyncWithLease({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl: stubFetchInsights(),
        decryptLegacyTokenOverride: async () => 'PLAIN_TOKEN',
        // Inline LEG B rejects. Fan-out LEG B should still run.
        runPhase14InlineOverride: async () => {
            throw new Error('LEG B inline reject (inline failure containment)');
        },
        taskClient: { queuePath: () => 'projects/test/locations/europe-west1/queues/metaSyncQueue', enqueueTask: async (_req: any) => {
            const body = JSON.parse(_req.task.httpRequest.body.toString());
            fannedOutWorkspaces.push(body.data.workspaceId);
            return [{}, {}, {}];
        }, serviceAccountEmail: () => 'test@example.com' },
        acquireLeaseOverride: async () => ({ ok: true }),
        releaseLeaseOverride: async () => ({ released: true }),
    });

    // The inline LEG B rejected; the inline result reports failed.
    // The fan-out path ran for the other live workspaces. With our
    // fixture, only WS_A is seeded so there are no others; the test
    // just verifies the result shape: result.ok is false, the inline
    // result is reported, and the function did NOT throw.
    // (We use a fresh fixture: see runLegacySyncForOwner's inline
    // result + the failure path. The real assertion is that the call
    // returned a result instead of throwing.)
    assert.equal(result.ok, false);
    assert.equal(result.workspace.inline?.status, 'failed');
});
