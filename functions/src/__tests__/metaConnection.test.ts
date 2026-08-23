// functions/src/__tests__/metaConnection.test.ts — direct-call tests for
// the connect/disconnect transaction gates. Run: cd functions && npm run
// build && node lib/__tests__/metaConnection.test.js
//
// Strategy: mirror the in-memory Firestore stub pattern from
// metaCallerScope.test.ts so the suite is hermetic (no emulator, no live
// project). Tests focus on the soft-delete gate that the round-10 review
// surfaced — a soft-deleted workspace must be rejected by
// `connectMetaAccount` and `disconnectMetaAccount` BEFORE any writes
// land, mirroring the existing check in `linkMetaAccountToWorkspaceImpl`.
//
// The Impl functions are extracted from the onCall wrappers so the tests
// can call them directly with a fake `scope` and skip the auth/initialise
// surface that the firebase-functions/v2 onCall infrastructure brings.

import assert from "node:assert/strict";

const PASSED = 0;
const FAILED = 1;

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function run(name: string, fn: () => Promise<void>) {
    try {
        await fn();
        passed++;
        console.log(`  \u2713 ${name}`);
    } catch (err: unknown) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`${name}: ${msg}`);
        console.log(`  \u2717 ${name} \u2014 ${msg}`);
    }
}

function summary() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`metaConnection tests: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log("Failures:");
        failures.forEach((f) => console.log(`  - ${f}`));
    }
    console.log("=".repeat(60));
    process.exit(failed > 0 ? FAILED : PASSED);
}

// ─── In-memory Firestore stub (mirrors metaCallerScope.test.ts) ────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin: any = require("firebase-admin");

// CR-MAJOR (CodeRabbit round 10): `getDb()` in `firestoreClient.ts`
// calls `admin.initializeApp()` on first invocation. Stub it as a no-op
// so the hermetic suite doesn't try to reach the real Admin SDK.
admin.initializeApp = () => {};

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
        return {
            exists: data !== undefined,
            data: () => data ?? undefined,
            id: this.id,
            ref: this,
        };
    }
    // Sub-collection access (e.g. users/{uid}/workspaces/{wid}/private).
    collection(subPath: string): StubCollection {
        return new StubCollection(`${this.path}/${subPath}`, bucket(`${this.path}/${subPath}`));
    }
    async set(data: DocData, options?: { merge?: boolean }) {
        if (options?.merge) {
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
}

class StubCollection {
    constructor(public path: string, public store: Map<string, DocData>) {}
    doc(id?: string) {
        const docId = id ?? `auto_${Math.random().toString(36).slice(2, 10)}`;
        return new StubDocRef(`${this.path}/${docId}`, docId, this.store);
    }
    where() { return this; }
    limit() { return this; }
    orderBy() { return this; }
    async get() {
        return {
            docs: [...this.store.entries()].map(([id, data]) => ({
                id,
                data: () => data,
                ref: new StubDocRef(`${this.path}/${id}`, id, this.store),
            })),
            empty: this.store.size === 0,
            size: this.store.size,
        };
    }
}

function resetStub() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}

const stubFirestore = () => ({
    collection: (path: string) => new StubCollection(path, bucket(path)),
    runTransaction: async <T,>(fn: (txn: {
        get: (refOrQuery: StubDocRef | StubCollection) => Promise<unknown>;
        set: (ref: StubDocRef, data: DocData, options?: { merge?: boolean }) => Promise<void>;
        update: (ref: StubDocRef, patch: DocData) => Promise<void>;
        create: (ref: StubDocRef, data: DocData) => Promise<void>;
    }) => Promise<T>): Promise<T> => {
        const txn = {
            get: (refOrQuery: StubDocRef | StubCollection) => refOrQuery.get(),
            create: (ref: StubDocRef, data: DocData) => ref.set(data),
            set: (ref: StubDocRef, data: DocData, options?: { merge?: boolean }) => ref.set(data, options),
            update: (ref: StubDocRef, patch: DocData) => ref.update(patch),
        };
        return fn(txn);
    },
});

Object.defineProperty(admin, "firestore", {
    value: stubFirestore,
    writable: true,
    configurable: true,
});
admin.firestore.FieldPath = { documentId: () => "__name__" };
admin.firestore.FieldValue = {
    delete: () => Symbol("delete"),
    serverTimestamp: () => Date.now(),
    increment: (n: number) => n,
};

// ─── Fixtures ────────────────────────────────────────────────────────────

function setupOwnerScope() {
    bucket("users").set("owner-1", {});
    bucket("metaConnections").set("owner-1", {
        encryptedToken: "iv:tag:ciphertext",
        adAccounts: [
            { id: "act_WS_A", name: "Workspace A account" },
            { id: "act_WS_B", name: "Workspace B account" },
        ],
        selectedAccountId: "act_WS_A",
    });
}

function setupWorkspace(opts: {
    id: string;
    metaAdAccountId?: string | null;
    deletedAt?: number | null;
}) {
    const wsBucket = bucket("users/owner-1/workspaces");
    const data: DocData = {
        name: opts.id,
        brandName: opts.id,
        isDefault: true,
        deletedAt: opts.deletedAt ?? null,
        createdAt: Date.now(),
        metaAdAccountId: opts.metaAdAccountId ?? null,
        metaAdAccountName: opts.metaAdAccountId ? "A" : null,
        metaRoleAtLinkTime: opts.metaAdAccountId ? "ADMIN" : null,
        metaPageId: null,
        metaPageName: null,
        metaPageClearedAt: null,
    };
    wsBucket.set(opts.id, data);
    return data;
}

function ownerScope() {
    return {
        ownerUid: "owner-1",
        callerUid: "owner-1",
        allowedWorkspaceIds: "ALL" as const,
        storedWorkspaceAccess: ["owner-1"],
    };
}

// ─── Harness ────────────────────────────────────────────────────────────

async function expectHttpsError(
    fn: () => Promise<unknown>,
    code: string,
    messageFragment: string,
): Promise<void> {
    try {
        await fn();
    } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        assert.equal(e.code, code, `expected code ${code}, got ${e.code}`);
        assert.ok(
            String(e.message).includes(messageFragment),
            `expected message to include "${messageFragment}", got "${e.message}"`,
        );
        return;
    }
    throw new assert.AssertionError({
        message: `expected ${code} / "${messageFragment}" to be thrown`,
    });
}

// Import AFTER stubbing so the modules capture the fake admin.firestore.
// Reset the `firestoreClient` initialise flag so the first `getDb()` call
// inside the implementation re-resolves `admin.firestore()` against the stub.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const firestoreClient = require("../firestoreClient.js");
firestoreClient._resetFirestoreClientForTests();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    connectMetaAccountImpl,
    disconnectMetaAccountImpl,
} = require("../metaConnection.js");

async function main() {
    // ─── T-MC1: connect on soft-deleted workspace ─────────────────────
    await run("T-MC1: connectMetaAccount on soft-deleted workspace → not-found, no writes", async () => {
        resetStub();
        setupOwnerScope();
        setupWorkspace({ id: "ws-soft", metaAdAccountId: null, deletedAt: Date.now() });

        const wsBefore = JSON.stringify(bucket("users/owner-1/workspaces").get("ws-soft"));
        const privBefore = bucket("users/owner-1/workspaces/ws-soft/private").get("metaConnection");

        await expectHttpsError(
            () => connectMetaAccountImpl(ownerScope(), {
                workspaceId: "ws-soft",
                accountId: "act_WS_A",
                accountName: "Workspace A account",
            }),
            "not-found",
            "Workspace not found or already deleted",
        );

        const wsAfter = JSON.stringify(bucket("users/owner-1/workspaces").get("ws-soft"));
        const privAfter = bucket("users/owner-1/workspaces/ws-soft/private").get("metaConnection");
        assert.equal(wsAfter, wsBefore, "T-MC1: workspace doc untouched");
        assert.equal(privAfter, privBefore, "T-MC1: private connection doc untouched");
    });

    // ─── T-MC2: disconnect on soft-deleted workspace ──────────────────
    await run("T-MC2: disconnectMetaAccount on soft-deleted workspace → not-found, no writes", async () => {
        resetStub();
        setupOwnerScope();
        setupWorkspace({ id: "ws-soft", metaAdAccountId: "act_WS_A", deletedAt: Date.now() });
        bucket("users/owner-1/workspaces/ws-soft/private").set("metaConnection", {
            metaConnected: true,
            accountId: "act_WS_A",
            accountName: "Workspace A account",
            legacyToken: "iv:tag:ciphertext",
            tokenSource: "legacy_aes_gcm",
            needsReauth: false,
            createdAt: Date.now() - 1000,
            updatedAt: Date.now() - 1000,
        });

        const privBefore = JSON.stringify(
            bucket("users/owner-1/workspaces/ws-soft/private").get("metaConnection"),
        );

        await expectHttpsError(
            () => disconnectMetaAccountImpl(ownerScope(), { workspaceId: "ws-soft" }),
            "not-found",
            "Workspace not found or already deleted",
        );

        const privAfter = JSON.stringify(
            bucket("users/owner-1/workspaces/ws-soft/private").get("metaConnection"),
        );
        assert.equal(
            privAfter, privBefore,
            "T-MC2: private connection doc untouched on soft-deleted disconnect",
        );
    });

    // ─── T-MC3: connect on missing workspace ──────────────────────────
    await run("T-MC3: connectMetaAccount on missing workspace → not-found", async () => {
        resetStub();
        setupOwnerScope();
        await expectHttpsError(
            () => connectMetaAccountImpl(ownerScope(), {
                workspaceId: "ws-missing",
                accountId: "act_WS_A",
                accountName: "Workspace A account",
            }),
            "not-found",
            "Workspace not found.",
        );
    });

    // ─── T-MC4: disconnect on missing workspace ───────────────────────
    await run("T-MC4: disconnectMetaAccount on missing workspace → not-found", async () => {
        resetStub();
        setupOwnerScope();
        await expectHttpsError(
            () => disconnectMetaAccountImpl(ownerScope(), { workspaceId: "ws-missing" }),
            "not-found",
            "Workspace not found.",
        );
    });

    // ─── T-MC5: connect happy path with no prior link ────────────────
    await run("T-MC5: connectMetaAccount active workspace, no prior link → writes link + clears Page", async () => {
        resetStub();
        setupOwnerScope();
        setupWorkspace({ id: "ws-1", metaAdAccountId: null, deletedAt: null });

        const before = Date.now();
        const result = await connectMetaAccountImpl(ownerScope(), {
            workspaceId: "ws-1",
            accountId: "act_WS_A",
            accountName: "Workspace A account",
        });
        const after = Date.now();

        assert.equal(result.ok, true);
        assert.equal(result.accountId, "act_WS_A");

        const ws = bucket("users/owner-1/workspaces").get("ws-1") as DocData;
        assert.equal(ws.metaAdAccountId, "act_WS_A");
        assert.equal(ws.metaPageId, null, "T-MC5: metaPageId cleared on real account change");
        assert.equal(ws.metaPageName, null, "T-MC5: metaPageName cleared on real account change");
        assert.ok(
            typeof ws.metaPageClearedAt === "number"
              && ws.metaPageClearedAt >= before
              && ws.metaPageClearedAt <= after,
            "T-MC5: metaPageClearedAt stamped in same write",
        );

        const priv = bucket("users/owner-1/workspaces/ws-1/private").get("metaConnection") as DocData;
        assert.equal(priv.metaConnected, true);
        assert.equal(priv.accountId, "act_WS_A");
        assert.equal(priv.legacyToken, "iv:tag:ciphertext");
    });

    // ─── T-MC6: connect same-account re-selection preserves Page ─────
    await run("T-MC6: connectMetaAccount same-account re-selection → Page preserved", async () => {
        resetStub();
        setupOwnerScope();
        setupWorkspace({ id: "ws-1", metaAdAccountId: "act_WS_A", deletedAt: null });
        // Force a SET Page so we can prove it survives a same-account re-link.
        const wsBucket = bucket("users/owner-1/workspaces");
        wsBucket.set("ws-1", { ...wsBucket.get("ws-1"), metaPageId: "page-A", metaPageName: "Page A", metaPageClearedAt: null });

        await connectMetaAccountImpl(ownerScope(), {
            workspaceId: "ws-1",
            accountId: "act_WS_A",
            accountName: "Workspace A account",
        });

        const ws = bucket("users/owner-1/workspaces").get("ws-1") as DocData;
        assert.equal(ws.metaAdAccountId, "act_WS_A");
        assert.equal(ws.metaPageId, "page-A", "T-MC6: SET Page preserved on same-account re-link");
        assert.equal(ws.metaPageName, "Page A");
        assert.equal(ws.metaPageClearedAt, null, "T-MC6: metaPageClearedAt NOT restamped");
    });

    // ─── T-MC7: disconnect happy path ─────────────────────────────────
    await run("T-MC7: disconnectMetaAccount active workspace → clears both docs", async () => {
        resetStub();
        setupOwnerScope();
        setupWorkspace({ id: "ws-1", metaAdAccountId: "act_WS_A", deletedAt: null });
        bucket("users/owner-1/workspaces/ws-1/private").set("metaConnection", {
            metaConnected: true,
            accountId: "act_WS_A",
            legacyToken: "iv:tag:ciphertext",
            createdAt: Date.now() - 1000,
            updatedAt: Date.now() - 1000,
        });

        const before = Date.now();
        const result = await disconnectMetaAccountImpl(ownerScope(), { workspaceId: "ws-1" });
        const after = Date.now();

        assert.equal(result.ok, true);
        assert.equal(result.disconnectedByUid, "owner-1");

        const ws = bucket("users/owner-1/workspaces").get("ws-1") as DocData;
        assert.equal(ws.metaAdAccountId, null);
        assert.equal(ws.metaPageId, null);
        assert.equal(ws.metaPageName, null);
        assert.ok(
            typeof ws.metaPageClearedAt === "number"
              && ws.metaPageClearedAt >= before
              && ws.metaPageClearedAt <= after,
            "T-MC7: metaPageClearedAt stamped on disconnect",
        );
        const priv = bucket("users/owner-1/workspaces/ws-1/private").get("metaConnection") as DocData;
        assert.equal(priv.metaConnected, false);
        assert.equal(priv.legacyToken, null);
        assert.equal(priv.encryptedToken, null);
    });

    // ─── T-MC8: same-account re-selection without accountName → preserve stored name ───
    await run("T-MC8: same-account re-selection without accountName → preserve stored name", async () => {
        // CR-MAJOR (CodeRabbit round 11): the previous code set
        // `accountName = req.accountName ?? ""` outside the
        // transaction, so a same-account re-selection call that
        // omitted `accountName` overwrote the stored name with an
        // empty string. The fix reads the existing workspace doc
        // inside the transaction and preserves the name when the
        // request omits the field.
        resetStub();
        setupOwnerScope();
        setupWorkspace({ id: "ws-1", metaAdAccountId: "act_WS_A", deletedAt: null });
        // Seed the stored name on both the workspace and the private
        // connection doc.
        const wsBucket = bucket("users/owner-1/workspaces");
        wsBucket.set("ws-1", { ...wsBucket.get("ws-1"), metaAdAccountName: "Stored Account Name" });
        bucket("users/owner-1/workspaces/ws-1/private").set("metaConnection", {
            metaConnected: true,
            accountId: "act_WS_A",
            accountName: "Stored Account Name",
            legacyToken: "iv:tag:ciphertext",
            createdAt: Date.now() - 1000,
            updatedAt: Date.now() - 1000,
        });

        // Re-select the SAME account WITHOUT accountName.
        await connectMetaAccountImpl(ownerScope(), {
            workspaceId: "ws-1",
            accountId: "act_WS_A",
        });

        const ws = bucket("users/owner-1/workspaces").get("ws-1") as DocData;
        assert.equal(
            ws.metaAdAccountName, "Stored Account Name",
            "T-MC8: metaAdAccountName preserved on same-account re-selection without accountName",
        );
        const priv = bucket("users/owner-1/workspaces/ws-1/private").get("metaConnection") as DocData;
        assert.equal(
            priv.accountName, "Stored Account Name",
            "T-MC8: private connection accountName preserved on same-account re-selection without accountName",
        );
    });

    // ─── T-MC9: first-time link without accountName → stored name stays empty ───
    await run("T-MC9: first-time link without accountName → empty name is the explicit choice", async () => {
        // CR-MAJOR (CodeRabbit round 11): the fix preserves the stored
        // name only when the workspace / private doc already has one.
        // First-time links with no name supplied land as an empty
        // string (the caller didn't supply one and there is nothing to
        // preserve). This pins the explicit "no resurrection of a
        // stale unlinked-doc name" behaviour.
        resetStub();
        setupOwnerScope();
        setupWorkspace({ id: "ws-1", metaAdAccountId: null, deletedAt: null });

        await connectMetaAccountImpl(ownerScope(), {
            workspaceId: "ws-1",
            accountId: "act_WS_A",
        });

        const ws = bucket("users/owner-1/workspaces").get("ws-1") as DocData;
        assert.equal(
            ws.metaAdAccountName, "",
            "T-MC9: first-time link without accountName → empty metaAdAccountName",
        );
        const priv = bucket("users/owner-1/workspaces/ws-1/private").get("metaConnection") as DocData;
        assert.equal(
            priv.accountName, "",
            "T-MC9: first-time link without accountName → empty private accountName",
        );
    });

    // ─── T-MC10: same-account re-selection WITH accountName → new name wins ───
    await run("T-MC10: same-account re-selection WITH accountName → new name written", async () => {
        // CR-MAJOR (CodeRabbit round 11): when the request DOES
        // supply accountName, the new name wins (no preservation).
        // Note: connectMetaAccount enforces the FIX 6 same-account
        // rule — switching the ad account requires disconnecting
        // first — so this test re-selects the SAME account and
        // verifies the explicit name override wins over the stored
        // name.
        resetStub();
        setupOwnerScope();
        setupWorkspace({ id: "ws-1", metaAdAccountId: "act_WS_A", deletedAt: null });
        const wsBucket = bucket("users/owner-1/workspaces");
        wsBucket.set("ws-1", { ...wsBucket.get("ws-1"), metaAdAccountName: "Old Account" });
        bucket("users/owner-1/workspaces/ws-1/private").set("metaConnection", {
            metaConnected: true,
            accountId: "act_WS_A",
            accountName: "Old Account",
            legacyToken: "iv:tag:ciphertext",
            createdAt: Date.now() - 1000,
            updatedAt: Date.now() - 1000,
        });

        await connectMetaAccountImpl(ownerScope(), {
            workspaceId: "ws-1",
            accountId: "act_WS_A",
            accountName: "New Account",
        });

        const ws = bucket("users/owner-1/workspaces").get("ws-1") as DocData;
        assert.equal(ws.metaAdAccountId, "act_WS_A");
        assert.equal(
            ws.metaAdAccountName, "New Account",
            "T-MC10: explicit accountName wins over stored name on same-account re-selection",
        );
        const priv = bucket("users/owner-1/workspaces/ws-1/private").get("metaConnection") as DocData;
        assert.equal(
            priv.accountName, "New Account",
            "T-MC10: explicit accountName wins in private doc",
        );
    });

    summary();
}

main().catch((err: unknown) => {
    console.error("metaConnection.test.ts main() crashed:", err);
    process.exit(FAILED);
});
