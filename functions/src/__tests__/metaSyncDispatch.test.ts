// functions/src/__tests__/metaSyncDispatch.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 970 Batch 2 — contract tests for the D3 / D4 / discovery-fix
// changes to `metaSync/dispatcher.ts`:
//
//   D3 — `metaDailySync` previously threw `FAILED_PRECONDITION` nightly
//        because the `collectionGroup('private').where(metaConnected==true)`
//        query needs a COLLECTION_GROUP_ASC field-override on
//        `private.metaConnected`. That field-override now lives in
//        `firestore.indexes.json` (Batch 2 D3 fix). This file does NOT
//        test the index itself — Firestore enforces field-overrides
//        server-side, and any unit test asserting them would be testing
//        Firestore, not us. What we DO test is the rest of the dispatch
//        pipeline that the nightly failure had been masking: the body
//        envelope (D4) and the discovery filter (delete + dedup).
//
//   D4 — The task body the worker reads must be wrapped in
//        `{ data: { … } }`. Pre-fix the dispatcher sent the bare payload
//        and the worker threw "missing required fields in payload" on
//        every task. The fix is `buildSyncTaskBody(acct, nowMs)` exported
//        alongside `metaDailySync` for testability.
//
//   Discovery — `listConnectedAccounts` is now exported (was private)
//        and applies two new filters:
//          (a) skip soft-deleted workspaces (`deletedAt != null`)
//          (b) de-duplicate by accountId (one ad account linked to
//              two workspaces should not produce two syncs — today's
//              `act_781389063661831` is linked to both "Eslam Salah"
//              and "Manar")
//
// Pattern follows `metaScope.integration.test.ts`: an in-memory
// Firestore stub with path recording, driving the production code
// directly. The envelope tests exercise `buildSyncTaskBody` purely.
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
    private filterFn: ((d: DocData) => boolean) | null = null;
    private orderField: string | null = null;
    private limitN: number | null = null;
    where(field: string, op: string, value: any) {
        const prev = this.filterFn;
        this.filterFn = (d) => {
            if (prev && !prev(d)) return false;
            if (op === "==") return d[field] === value;
            return true;
        };
        return this;
    }
    orderBy(field: string) { this.orderField = field; return this; }
    limit(n: number) { this.limitN = n; return this; }
    async get() {
        let entries = [...this.store.entries()];
        if (this.filterFn) entries = entries.filter(([, data]) => this.filterFn!(data));
        if (this.limitN != null) entries = entries.slice(0, this.limitN);
        return {
            docs: entries.map(([id, data]) => ({
                id, data: () => data, ref: new StubDocRef(`${this.path}/${id}`, id, this.store),
            })),
            empty: entries.length === 0,
            size: entries.length,
        };
    }
}

const stubFirestore = () => ({
    settings: () => stubFirestore(),
    collection: (path: string) => new StubCollection(path, bucket(path)),
    collectionGroup: (groupId: string) => new StubCollectionGroup(groupId),
    doc: (path: string) => {
        const segs = path.split("/");
        const id = segs.pop() as string;
        return new StubDocRef(path, id, bucket(segs.join("/")));
    },
});

// A collectionGroup query walks every bucket whose last path segment
// matches the groupId. The stub holds documents under bucket-style
// paths (e.g. `users/u1/workspaces/ws1/private`), so a collectionGroup
// for "private" aggregates every `*/private` bucket.
class StubCollectionGroup {
    constructor(public groupId: string) {}
    private matches(path: string): boolean {
        return path.endsWith(`/${this.groupId}`) || path === this.groupId;
    }
    where(field: string, op: string, value: any) {
        const matcher = (data: DocData) => {
            if (op === "==") return data[field] === value;
            return true;
        };
        return this.composeQuery(matcher);
    }
    private composeQuery(predicate: (d: DocData) => boolean): any {
        const all: Array<{ path: string; id: string; data: DocData }> = [];
        for (const [path, store] of Object.entries(stubStore)) {
            if (!this.matches(path)) continue;
            for (const [id, data] of store.entries()) {
                if (predicate(data)) all.push({ path, id, data });
            }
        }
        // Stable order by path so dedup picks deterministically (the
        // production code sorts by `__name__`).
        all.sort((a, b) => a.path.localeCompare(b.path));
        return {
            docs: all.map(({ path, id, data }) => ({
                id,
                data: () => data,
                ref: new StubDocRef(`${path}/${id}`, id, stubStore[path]),
            })),
            empty: all.length === 0,
            size: all.length,
            get: async () => ({
                docs: all.map(({ path, id, data }) => ({
                    id,
                    data: () => data,
                    ref: new StubDocRef(`${path}/${id}`, id, stubStore[path]),
                })),
                empty: all.length === 0,
                size: all.length,
            }),
            orderBy: () => this.composeQuery(predicate),
            limit: () => this.composeQuery(predicate),
        };
    }
}

Object.defineProperty(admin, "firestore", {
    value: stubFirestore,
    writable: true,
    configurable: true,
});
admin.firestore.FieldValue = { serverTimestamp: () => Date.now(), increment: (n: number) => n };
Object.defineProperty(admin, "initializeApp", { value: () => ({}), writable: true, configurable: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listConnectedAccounts, buildSyncTaskBody } = require("../metaSync/dispatcher.js");

// ─── D4: buildSyncTaskBody envelope ─────────────────────────────

test("buildSyncTaskBody — wraps the payload in { data: { … } } so the worker's req.data reads it", () => {
    const acct = { userId: "u1", workspaceId: "ws1", accountId: "act_1" };
    const nowMs = 1_700_000_000_000;
    const json = buildSyncTaskBody(acct, nowMs);
    const parsed = JSON.parse(json);
    // The envelope MUST exist at the top level (D4).
    assert.ok(parsed.data, "task body must have a top-level `data` field");
    // The fields inside MUST match the SyncTaskPayload the worker reads
    // at worker.ts:53. Pre-fix the body was bare, and the worker
    // rejected with "missing required fields in payload".
    assert.equal(parsed.data.userId, "u1");
    assert.equal(parsed.data.workspaceId, "ws1");
    assert.equal(parsed.data.accountId, "act_1");
    assert.equal(parsed.data.trigger, "scheduled");
    assert.equal(parsed.data.nowMs, nowMs);
    // Top-level MUST NOT carry the bare fields — verify nothing leaked
    // past the envelope.
    assert.equal(parsed.userId, undefined);
    assert.equal(parsed.workspaceId, undefined);
});

test("buildSyncTaskBody — JSON is parseable and stable across calls", () => {
    const a = JSON.parse(buildSyncTaskBody(
        { userId: "u1", workspaceId: "ws1", accountId: "act_1" },
        1,
    ));
    const b = JSON.parse(buildSyncTaskBody(
        { userId: "u1", workspaceId: "ws1", accountId: "act_1" },
        1,
    ));
    assert.deepEqual(a, b);
});

test("buildSyncTaskBody — trigger is exactly the literal 'scheduled'", () => {
    // The worker uses payload.trigger at worker.ts:65 and falls back to
    // "scheduled" otherwise, but a literal value here removes ambiguity
    // about what the dispatcher means to communicate.
    const parsed = JSON.parse(buildSyncTaskBody(
        { userId: "u1", workspaceId: "ws1", accountId: "act_1" }, 1,
    ));
    assert.equal(parsed.data.trigger, "scheduled");
});

// ─── Discovery: filters ──────────────────────────────────────

function seedPrivateDoc(opts: {
    ownerUid: string;
    workspaceId: string;
    accountId: string;
    metaConnected?: boolean;
    workspaceDeleted?: boolean | null | undefined;
}) {
    const key = `users/${opts.ownerUid}/workspaces/${opts.workspaceId}/private`;
    if (!stubStore[key]) stubStore[key] = new Map();
    stubStore[key].set("metaConnection", {
        accountId: opts.accountId,
        metaConnected: opts.metaConnected ?? true,
    });
    const wsKey = `users/${opts.ownerUid}/workspaces`;
    if (!stubStore[wsKey]) stubStore[wsKey] = new Map();
    const existing = stubStore[wsKey].get(opts.workspaceId) ?? {};
    stubStore[wsKey].set(opts.workspaceId, {
        ...existing,
        deletedAt: opts.workspaceDeleted === true
            ? 1_700_000_000_000
            : (opts.workspaceDeleted === undefined ? null : opts.workspaceDeleted),
    });
}

function resetStub() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}

test("listConnectedAccounts — returns the live, connected workspace", async () => {
    resetStub();
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws1", accountId: "act_1" });
    const out = await listConnectedAccounts();
    assert.equal(out.length, 1);
    assert.equal(out[0].userId, "u1");
    assert.equal(out[0].workspaceId, "ws1");
    assert.equal(out[0].accountId, "act_1");
});

test("listConnectedAccounts — skips soft-deleted workspaces (deletedAt != null)", async () => {
    resetStub();
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws1", accountId: "act_1", workspaceDeleted: true });
    const out = await listConnectedAccounts();
    assert.equal(out.length, 0, "soft-deleted workspaces must be excluded from dispatch");
});

test("listConnectedAccounts — keeps workspaces with deletedAt explicitly null", async () => {
    resetStub();
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws1", accountId: "act_1", workspaceDeleted: null });
    const out = await listConnectedAccounts();
    assert.equal(out.length, 1);
    assert.equal(out[0].workspaceId, "ws1");
});

test("listConnectedAccounts — keeps workspaces where the deletedAt field is missing entirely on the workspace doc (legacy pre-soft-delete workspaces)", async () => {
    resetStub();
    // Seed the workspace doc with NO deletedAt field at all (Phase 2
    // workspaces predate the soft-delete column), plus a connected
    // private doc. These must keep dispatching. Bucket path mirrors
    // what Firestore would have: the workspace subcollection is keyed
    // at `users/{uid}/workspaces/{wid}`.
    const wsKey = `users/u1/workspaces`;
    stubStore[wsKey] = new Map();
    stubStore[wsKey].set("ws1", { name: "PreSoftDelete" }); // no deletedAt field
    const key = `users/u1/workspaces/ws1/private`;
    stubStore[key] = new Map();
    stubStore[key].set("metaConnection", { accountId: "act_1", metaConnected: true });
    const out = await listConnectedAccounts();
    assert.equal(out.length, 1, "workspace doc with no deletedAt field must dispatch");
    assert.equal(out[0].workspaceId, "ws1");
});

test("listConnectedAccounts — skips workspaces where the workspace doc is missing entirely", async () => {
    resetStub();
    // Seed only the private doc — no workspace doc. This is the
    // post-Firestore-hard-delete case (not the soft-delete case): the
    // workspace has truly been removed from the database. The
    // dispatcher's join sees wsSnap.exists=false and refuses to dispatch
    // a sync for a workspace that no longer exists.
    const key = `users/u1/workspaces/ws1/private`;
    stubStore[key] = new Map();
    stubStore[key].set("metaConnection", { accountId: "act_1", metaConnected: true });
    const out = await listConnectedAccounts();
    assert.equal(out.length, 0, "missing workspace doc must be excluded from dispatch");
});

test("listConnectedAccounts — skips docs where metaConnected is false", async () => {
    resetStub();
    // Force-fail the collectionGroup filter by relying on the stub's
    // where(metaConnected, ==, true). The stub honours it.
    const key = `users/u1/workspaces/ws1/private`;
    stubStore[key] = new Map();
    stubStore[key].set("metaConnection", { accountId: "act_1", metaConnected: false });
    const out = await listConnectedAccounts();
    assert.equal(out.length, 0);
});

test("listConnectedAccounts — de-duplicates by accountId across workspaces (Eslam Salah / Manar case)", async () => {
    resetStub();
    // The investigation report's §3 case: one Meta account linked to
    // two workspaces. The dispatcher must produce exactly ONE entry,
    // not two — running runSyncForAccount twice on the same account
    // every night wastes Graph calls and risks hitting the rate limit.
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws_eslam", accountId: "act_shared" });
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws_manar", accountId: "act_shared" });
    const out = await listConnectedAccounts();
    assert.equal(out.length, 1, "act_shared must be dispatched exactly once, not twice");
    assert.equal(out[0].accountId, "act_shared");
});

test("listConnectedAccounts — distinct accounts under the same owner all dispatch", async () => {
    resetStub();
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws1", accountId: "act_A" });
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws2", accountId: "act_B" });
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws3", accountId: "act_C" });
    const out = await listConnectedAccounts();
    assert.equal(out.length, 3);
    const ids = out.map((o: { accountId: string }) => o.accountId).sort();
    assert.deepEqual(ids, ["act_A", "act_B", "act_C"]);
});

test("listConnectedAccounts — distinct accounts across different owners all dispatch", async () => {
    resetStub();
    seedPrivateDoc({ ownerUid: "owner1", workspaceId: "ws1", accountId: "act_A" });
    seedPrivateDoc({ ownerUid: "owner2", workspaceId: "ws1", accountId: "act_B" });
    const out = await listConnectedAccounts();
    assert.equal(out.length, 2);
    const ownerUids = out.map((o: { userId: string }) => o.userId).sort();
    assert.deepEqual(ownerUids, ["owner1", "owner2"]);
});

test("listConnectedAccounts — mixed: dedup, soft-deleted, and live all coexist correctly", async () => {
    resetStub();
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws_live_a", accountId: "act_A" });
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws_deleted_b", accountId: "act_B", workspaceDeleted: true });
    seedPrivateDoc({ ownerUid: "u1", workspaceId: "ws_live_a_shared", accountId: "act_A" });
    seedPrivateDoc({ ownerUid: "u2", workspaceId: "ws_live_c", accountId: "act_C" });
    const out = await listConnectedAccounts();
    assert.equal(out.length, 2, "soft-deleted and dedup'd both pruned; live + cross-owner survive");
    const ids = out.map((o: { accountId: string }) => o.accountId).sort();
    assert.deepEqual(ids, ["act_A", "act_C"]);
});

// ─── Structural guard: what the dispatcher file exports ─────

test("structural guard — dispatcher exports listConnectedAccounts and buildSyncTaskBody", () => {
    // If a future refactor moves these back to private, Batch 2 silently
    // loses the D4 fix and the discovery filter. This pins the surface.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("../metaSync/dispatcher.js");
    assert.equal(typeof mod.listConnectedAccounts, "function");
    assert.equal(typeof mod.buildSyncTaskBody, "function");
});
