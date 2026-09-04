// functions/src/__tests__/metaSyncRateLimit.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 970 Batch 5 — dedicated rate-limit contract test.
//
// WHY THIS FILE EXISTS
// --------------------
// The investigation report §8.7 calls for a dedicated test covering
// the rate-limit classification surface end-to-end:
//
//   "`functions/src/__tests__/metaSyncRateLimit.test.ts` | `code 4 /
//    1504022` and `code 17 / 2446079` classified as rate-limited,
//    reported not thrown; run still `ok`"
//
// The orchestrator test (`metaSyncOrchestrator.test.ts`) already has
// per-leg rate-limit tests (test 8: LEG A; test 19: LEG B enqueue),
// and the `isMetaRateLimit` unit tests in the same file cover all
// three classifier input shapes. This file is the dedicated contract
// surface for §8.7 — it asserts the FULL `runFullSync` result shape
// when one or both legs are rate-limited, including the load-bearing
// assertion that `result.ok === true` and that the press is
// "reported, not thrown" — the contract that distinguishes a
// rate-limited press from a failed press.
//
// Patterns:
//   - Same in-memory Firestore stub pattern as metaSyncDispatch and
//     metaSyncOrchestrator.
//   - Same runPhase14InlineOverride + tasksClient + acquireLeaseOverride
//     seams from the orchestrator test.
//   - Pure: no live Meta API, no real Firestore.
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
    async delete() { this.store.delete(this.id); }
    collection(sub: string) { return new StubCollection(`${this.path}/${sub}`, bucket(`${this.path}/${sub}`)); }
}

class StubCollection {
    constructor(public path: string, public store: Map<string, DocData>) {}
    doc(id?: string) { const docId = id ?? "auto"; return new StubDocRef(`${this.path}/${docId}`, docId, this.store); }
    where() { return this; }
    limit() { return this; }
    orderBy() { return this; }
    async get() {
        const entries = [...this.store.entries()];
        return {
            docs: entries.map(([id, data]) => ({ id, data: () => data, ref: new StubDocRef(`${this.path}/${id}`, id, this.store) })),
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
});

Object.defineProperty(admin, "firestore", { value: stubFirestore, writable: true, configurable: true });
admin.firestore.FieldValue = { serverTimestamp: () => Date.now(), increment: (n: number) => n };
Object.defineProperty(admin, "initializeApp", { value: () => ({}), writable: true, configurable: true });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const secretsModule = require("../secrets.js");
Object.defineProperty(secretsModule, "metaAppSecret", { value: { value: () => "test-secret" }, configurable: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runFullSync, isMetaRateLimit } = require("../metaSync/orchestrator.js");

// ─── Fixtures ────────────────────────────────────────────────────────────

const OWNER = "owner_uid_AAAA";
const CALLER = "caller_uid_BBBB";
const WS_A = "ws_alpha";
const WS_B = "ws_beta";
const ACCT_A = "act_alpha";
const ACCT_B = "act_beta";
const FIXED_NOW = 1_700_000_000_000;

function resetStub() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}

function seedConn(opts: { ownerUid: string; adAccounts: Array<{ id: string; name?: string; status?: number }> }) {
    bucket("metaConnections").set(opts.ownerUid, {
        encryptedToken: "iv:tag:body",
        adAccounts: opts.adAccounts,
        selectedAccountId: null,
        lastSyncAt: null,
    });
}

function seedWorkspace(opts: { ownerUid: string; workspaceId: string; accountId?: string | null; metaConnected?: boolean }) {
    const wsBucket = `users/${opts.ownerUid}/workspaces`;
    if (!stubStore[wsBucket]) stubStore[wsBucket] = new Map();
    stubStore[wsBucket].set(opts.workspaceId, { name: opts.workspaceId });
    const connPath = `users/${opts.ownerUid}/workspaces/${opts.workspaceId}/private`;
    if (!stubStore[connPath]) stubStore[connPath] = new Map();
    stubStore[connPath].set("metaConnection", {
        accountId: opts.accountId ?? null,
        metaConnected: opts.metaConnected ?? false,
    });
}

function fakeInline(opts: { status?: "ok" | "partial" | "failed"; ads?: number; matched?: number; ambiguous?: number; unmatched?: number; errors?: string[] } = {}) {
    return async () => ({
        workspaceId: WS_A,
        accountId: ACCT_A,
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

function tasksClientRecorder(opts: {
    enqueueThrows?: { accountId: string; code: number; error_subcode: number; type: string } | null;
} = {}) {
    const recorded: Array<{ parent: string; body: any }> = [];
    const facade = {
        queuePath: () => "projects/test/locations/europe-west1/queues/metaSyncQueue",
        async enqueueTask(req: { parent: string; task: { httpRequest: { body: Buffer } } }) {
            if (opts.enqueueThrows) {
                const e: any = new Error("enqueue rate limit");
                e.code = opts.enqueueThrows.code;
                e.error_subcode = opts.enqueueThrows.error_subcode;
                e.type = opts.enqueueThrows.type;
                e.body = { error: opts.enqueueThrows };
                throw e;
            }
            const body = JSON.parse(req.task.httpRequest.body.toString());
            recorded.push({ parent: req.parent, body });
            return [{}, {}, {}];
        },
        serviceAccountEmail: () => "test@example.com",
    };
    return { facade, recorded };
}

function fetchImplWithError(perAccountError: { accountId: string; code: number; error_subcode: number; type: string }) {
    return async (url: string) => {
        if (url.includes(`${perAccountError.accountId}/insights`)) {
            return {
                ok: true, status: 200,
                json: async () => ({
                    error: {
                        code: perAccountError.code,
                        error_subcode: perAccountError.error_subcode,
                        type: perAccountError.type,
                        message: "Application request limit reached",
                    },
                }),
            } as Response;
        }
        // Other accounts: return a clean ad row so the call structure
        // is the same; the test only cares about the rate-limited
        // account's classification.
        return {
            ok: true, status: 200,
            json: async () => ({
                data: [{
                    ad_id: "ad_1",
                    ad_name: "An Ad",
                    adset_name: "An AdSet",
                    campaign_name: "A Campaign",
                    impressions: "100", clicks: "1", spend: "1",
                    ctr: "1", cpc: "1", cpm: "1",
                    actions: [], cost_per_action_type: [], purchase_roas: [],
                }],
            }),
        } as Response;
    };
}

const PASS_LEASE = async () => ({ ok: true });
const PASS_RELEASE = async () => ({ released: true });
const NOOP_RELEASE = async () => ({ released: false });

// ─── §8.7 contract — code 4 / subcode 1504022 (app-wide) ───────────────

test("§8.7 — code 4 / subcode 1504022 (app-wide) on LEG A: classified, reported, run still ok", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }] });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });

    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl: fetchImplWithError({
            accountId: ACCT_A,
            code: 4, error_subcode: 1504022, type: "OAuthException",
        }),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        runPhase14InlineOverride: fakeInline({ status: "ok" }),
        tasksClient: tasksClientRecorder().facade,
    });

    // Result shape: classified as rate-limited, reported, run still ok.
    assert.equal(result.ok, true, "rate-limited account MUST NOT make the run fail");
    assert.deepEqual(result.legacy.rateLimited, [ACCT_A]);
    assert.equal(result.legacy.adsSynced, 0);
    assert.equal(result.legacy.accountsSynced, 1);
    assert.deepEqual(result.workspace.rateLimited, []);
    assert.deepEqual(result.workspace.queued, 0);
    assert.ok(result.workspace.inline, "inline LEG B ran; not blocked by LEG A rate-limit");
    assert.equal(result.workspace.inline.status, "ok");
});

test("§8.7 — code 17 / subcode 2446079 (per-user) on LEG A: same classification surface", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }] });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });

    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl: fetchImplWithError({
            accountId: ACCT_A,
            code: 17, error_subcode: 2446079, type: "OAuthException",
        }),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        runPhase14InlineOverride: fakeInline({ status: "ok" }),
        tasksClient: tasksClientRecorder().facade,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.legacy.rateLimited, [ACCT_A]);
});

// ─── §8.7 contract — code 4 / subcode 1504022 (app-wide) on LEG B enqueue ─

test("§8.7 — code 4 / subcode 1504022 (app-wide) on LEG B Cloud Tasks enqueue: classified, reported, run still ok", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }] });
    // No activeWorkspaceId — everything is fanned out. The fan-out
    // hits the rate-limit at the enqueue call.
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });

    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        // No activeWorkspaceId — fan-out path.
        nowMs: FIXED_NOW,
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        runPhase14InlineOverride: fakeInline(),
        tasksClient: tasksClientRecorder({
            enqueueThrows: { accountId: ACCT_A, code: 4, error_subcode: 1504022, type: "OAuthException" },
        }).facade,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.workspace.rateLimited, [ACCT_A]);
    assert.equal(result.workspace.queued, 0);
    assert.equal(result.workspace.inline, null);
});

test("§8.7 — code 17 / subcode 2446079 (per-user) on LEG B Cloud Tasks enqueue: same classification surface", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }] });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });

    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        nowMs: FIXED_NOW,
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        runPhase14InlineOverride: fakeInline(),
        tasksClient: tasksClientRecorder({
            enqueueThrows: { accountId: ACCT_A, code: 17, error_subcode: 2446079, type: "OAuthException" },
        }).facade,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.workspace.rateLimited, [ACCT_A]);
});

// ─── §8.7 contract — BOTH legs rate-limited simultaneously ──────────────

test("§8.7 — both LEG A and LEG B rate-limited on the same press: result.ok stays true, both rateLimited arrays populated", async () => {
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }] });
    // Two workspaces for the same account (the dedup case from
    // investigation §3) — one runs inline, the other fans out. Both
    // hit the same rate-limit envelope.
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_B, accountId: ACCT_B, metaConnected: true });

    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl: fetchImplWithError({
            accountId: ACCT_A,
            code: 4, error_subcode: 1504022, type: "OAuthException",
        }),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        runPhase14InlineOverride: fakeInline(),
        // Fan-out WS_B throws rate-limit on enqueue.
        tasksClient: tasksClientRecorder({
            enqueueThrows: { accountId: ACCT_B, code: 4, error_subcode: 1504022, type: "OAuthException" },
        }).facade,
    });

    // Both legs rate-limited; result still ok.
    assert.equal(result.ok, true);
    assert.deepEqual(result.legacy.rateLimited, [ACCT_A]);
    assert.deepEqual(result.workspace.rateLimited, [ACCT_B]);
    assert.equal(result.workspace.queued, 0);
    // LEG A failure: 0 ads synced (the only account was rate-limited).
    assert.equal(result.legacy.adsSynced, 0);
});

// ─── §8.7 contract — LEG B inline string-message rate-limit path ───────

test("§8.7 — LEG B inline runSyncForAccount reports rate-limit via errors[] string match: classified, reported", async () => {
    // The orchestrator's `inlineRateLimited` collector uses the
    // string-message shape of isMetaRateLimit (test 4 in the
    // orchestrator test file). This test exercises the FULL
    // runFullSync result shape with the inline LEG B reporting its
    // rate-limit through the errors[] path rather than the typed
    // throw path. The result must still be `ok: true` and the
    // accountId must be in workspace.rateLimited.
    resetStub();
    seedConn({ ownerUid: OWNER, adAccounts: [{ id: ACCT_A, name: "Alpha", status: 1 }] });
    seedWorkspace({ ownerUid: OWNER, workspaceId: WS_A, accountId: ACCT_A, metaConnected: true });

    const result = await runFullSync({
        ownerUid: OWNER,
        callerUid: CALLER,
        activeWorkspaceId: WS_A,
        nowMs: FIXED_NOW,
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response),
        decryptLegacyTokenOverride: async () => "PLAIN_TOKEN",
        // runSyncForAccount's runFullSyncWithLease wrapper would
        // normally catch AlreadyRunningError etc., but a rate-limit
        // surfaces as a string in the errors[] array. fakeInline
        // emulates that — the inline stub's status is "ok" but the
        // errors[] carries the recognisable substring.
        runPhase14InlineOverride: fakeInline({
            status: "ok",
            ads: 50,
            matched: 30,
            ambiguous: 5,
            unmatched: 15,
            errors: ["fetchAdInsights failed: Meta Graph API error 429: Application request limit reached (OAuthException)"],
        }),
        tasksClient: tasksClientRecorder().facade,
    });

    assert.equal(result.ok, true, "rate-limited errors[] MUST NOT fail the run");
    assert.ok(result.workspace.inline, "inline LEG B ran");
    assert.equal(result.workspace.inline.status, "ok");
    // Account ID lands in workspace.rateLimited because the inline
    // error string contains the rate-limit substring.
    assert.deepEqual(result.workspace.rateLimited, [ACCT_A]);
});

// ─── isMetaRateLimit classifier — direct unit tests covering both codes ─

test("isMetaRateLimit — direct field: code 4 / subcode 1504022 (the only code observed in production today)", () => {
    assert.equal(isMetaRateLimit({ code: 4, error_subcode: 1504022 }), true);
});

test("isMetaRateLimit — direct field: code 17 / subcode 2446079 (per-user variant documented in investigation §8.3)", () => {
    assert.equal(isMetaRateLimit({ code: 17, error_subcode: 2446079 }), true);
});

test("isMetaRateLimit — different subcode on the same code: not classified", () => {
    // Same code 4, different subcode — not a rate limit per the
    // investigation's documented taxonomy. Prevents accidental
    // misclassification of unrelated 4xxx errors.
    assert.equal(isMetaRateLimit({ code: 4, error_subcode: 999 }), false);
});

test("isMetaRateLimit — different code with the same subcode: not classified", () => {
    assert.equal(isMetaRateLimit({ code: 99, error_subcode: 1504022 }), false);
});
