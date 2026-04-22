// functions/src/__tests__/workspace.test.ts — contract tests for workspace callables
// Run: cd functions && npm run build && node lib/__tests__/workspace.test.js
//
// Strategy: bring up `firebase-functions-test` in offline mode and wrap the real
// handlers, stubbing `admin.firestore()` with an in-memory fixture BEFORE importing
// index.ts. Assertions check the observed HttpsError code and message so regressions
// in the gating logic fail here.

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const PASSED = 0;
const FAILED = 1;

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

async function run(name: string, fn: () => Promise<void>) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err: any) {
        failed++;
        failures.push(`${name}: ${err.message}`);
        console.log(`  ❌ ${name} — ${err.message}`);
    }
}

// Skipped test harness: keeps the human-readable name in the output but does NOT
// run any assertion, so placeholder contract checks cannot report false positives.
function skip(name: string, _fn?: () => Promise<void>) {
    skipped++;
    console.log(`  ⏭  ${name} (skipped — pending emulator harness)`);
}

function summary() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Workspace Tests: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    if (failures.length > 0) {
        console.log("Failures:");
        failures.forEach((f) => console.log(`  - ${f}`));
    }
    console.log("=".repeat(60));
    process.exit(failed > 0 ? FAILED : PASSED);
}

// ─── In-memory Firestore stub (CJS-mutated onto firebase-admin) ────────────
const require = createRequire(import.meta.url);
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
        return {
            exists: data !== undefined,
            data: () => data ?? undefined,
            id: this.id,
            ref: this,
        };
    }
    async set(data: DocData) { this.store.set(this.id, data); }
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

function resetStore() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}

// Replace admin.firestore with the stub (CJS mutation survives the ESM namespace).
admin.firestore = () => ({
    collection: (path: string) => new StubCollection(path, bucket(path)),
    runTransaction: async (fn: (txn: any) => Promise<unknown>) => {
        const txn = {
            get: (refOrQuery: any) => refOrQuery.get(),
            create: (ref: StubDocRef, data: DocData) => ref.set(data),
            set: (ref: StubDocRef, data: DocData) => ref.set(data),
            update: (ref: StubDocRef, patch: DocData) => ref.update(patch),
        };
        return fn(txn);
    },
});
admin.firestore.FieldPath = { documentId: () => "__name__" };
admin.firestore.FieldValue = {
    delete: () => Symbol("delete"),
    serverTimestamp: () => Date.now(),
    increment: (n: number) => n,
};

// Import AFTER stubbing so workspacePolicy captures the fake admin.firestore.
const {
    assertScalePlan,
    assertWorkspaceLimit,
    createWorkspaceWithLimit,
} = await import("../workspaces/workspacePolicy.js");

async function expectHttpsError(
    fn: () => Promise<unknown>,
    code: string,
    messageFragment: string
) {
    try {
        await fn();
    } catch (err: any) {
        assert.equal(err.code, code, `expected code ${code}, got ${err.code}`);
        assert.ok(
            String(err.message).includes(messageFragment),
            `expected message to include "${messageFragment}", got "${err.message}"`
        );
        return;
    }
    throw new assert.AssertionError({ message: `expected ${code} / "${messageFragment}" to be thrown` });
}

// ═══════════════════════════════════════════════════════════════════════════
// T013: assertScalePlan on a below-Scale plan → permission-denied / Scale plan
// ═══════════════════════════════════════════════════════════════════════════
await run("T013: assertScalePlan('pro') → permission-denied", async () => {
    resetStore();
    bucket("users").set("uid-pro", { billingState: { plan: "pro" } });
    await expectHttpsError(() => assertScalePlan("uid-pro"), "permission-denied", "Scale plan");
});

// ═══════════════════════════════════════════════════════════════════════════
// T014: assertWorkspaceLimit rejects the 11th workspace
// ═══════════════════════════════════════════════════════════════════════════
await run("T014: assertWorkspaceLimit at 10 → failed-precondition", async () => {
    resetStore();
    const wsBucket = bucket("users/uid-scale/workspaces");
    for (let i = 0; i < 10; i++) wsBucket.set(`ws-${i}`, { deletedAt: null });
    await expectHttpsError(() => assertWorkspaceLimit("uid-scale"), "failed-precondition", "10-workspace");
});

await run("T014b: createWorkspaceWithLimit at 10 on Scale → failed-precondition", async () => {
    resetStore();
    bucket("users").set("uid-scale", { billingState: { plan: "scale" } });
    const wsBucket = bucket("users/uid-scale/workspaces");
    for (let i = 0; i < 10; i++) wsBucket.set(`ws-${i}`, { deletedAt: null });
    await expectHttpsError(
        () => createWorkspaceWithLimit("uid-scale", { name: "11th" }),
        "failed-precondition",
        "10-workspace"
    );
});

await run("T014c: createWorkspaceWithLimit on non-Scale → permission-denied (TOCTOU-safe)", async () => {
    resetStore();
    bucket("users").set("uid-pro", { billingState: { plan: "pro" } });
    // Even with room for another workspace, a non-Scale plan is rejected inside the txn.
    await expectHttpsError(
        () => createWorkspaceWithLimit("uid-pro", { name: "Client B" }),
        "permission-denied",
        "Scale plan"
    );
});

await run("T015: createWorkspaceWithLimit happy path → new id", async () => {
    resetStore();
    bucket("users").set("uid-scale", { billingState: { plan: "scale" } });
    const wsBucket = bucket("users/uid-scale/workspaces");
    wsBucket.set("default", { isDefault: true, deletedAt: null });
    const newId = await createWorkspaceWithLimit("uid-scale", { name: "Client A", deletedAt: null });
    assert.ok(newId && typeof newId === "string", "expected a workspace id");
    assert.equal(wsBucket.size, 2, "expected two workspaces after create");
});

// ═══════════════════════════════════════════════════════════════════════════
// Remaining contract checks — skipped until an emulator harness lands.
// The names are preserved so the suite can be easily restored when real tests arrive.
// ═══════════════════════════════════════════════════════════════════════════
skip("T016: updateWorkspace partial write → LWW");
skip("T017: deleteWorkspace default → default_workspace_undeletable");
skip("T018: deleteWorkspace + restoreWorkspace round-trip");
skip("T032: linkMeta not connected → meta_account_not_connected");
skip("T033: linkMeta INSUFFICIENT role → insufficient_meta_role");
skip("T034: linkMeta ADVERTISER → ok, fields written");
skip("T035: unlinkMeta → fields cleared");
skip("T042: generation missing activeWorkspaceId → active_workspace_required");
skip("T043: generation writes workspaceId");
skip("T058: setAccess non-owner → owner_only");
skip("T059: setAccess soft-deleted → invalid_workspace_id");
skip("T060: setAccess diff → one audit per grant/revoke");
skip("T026: purgeExpiredWorkspaces → hard delete");

summary();
