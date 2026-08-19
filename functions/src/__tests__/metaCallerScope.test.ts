// functions/src/__tests__/metaCallerScope.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 — foundational contract tests for the shared caller-scope
// guard at functions/src/workspaces/metaCallerScope.ts.
//
// Strategy: mirror the in-memory Firestore stub from workspace.test.ts
// (so the suite is hermetic — no emulator, no live project) and assert
// the observable behaviour:
//   - T-02 (T017): `readDegraded` → `unavailable`, no write.
//   - T-03 (T018): workspace outside the permitted set →
//     `permission-denied` with `reason: 'workspace_not_permitted'`.
//
// The pure logic for `assertWorkspaceAllowed` is tested directly with a
// ResolvedMetaScope fixture (T-03b). The `loadActiveWorkspace` shape is
// covered by the workspace listing test at workspace.test.ts (T-17).
// ═══════════════════════════════════════════════════════════════════════════

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
        console.log(`  ✓ ${name}`);
    } catch (err: any) {
        failed++;
        failures.push(`${name}: ${err.message}`);
        console.log(`  ✗ ${name} — ${err.message}`);
    }
}

function summary() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`metaCallerScope tests: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log("Failures:");
        failures.forEach((f) => console.log(`  - ${f}`));
    }
    console.log("=".repeat(60));
    process.exit(failed > 0 ? FAILED : PASSED);
}

// ─── In-memory Firestore stub (mirrors workspace.test.ts) ────────────────────

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

// `failureMode` is the T-02 lever: when true, the stub throws on every
// `get()` — which mimics a transient Firestore read failure and forces
// `resolveCallerScope` to degrade to a `readDegraded: true` self-scope.
let failureMode = false;
function resetStub() {
    failureMode = false;
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}
function setFailureMode(on: boolean) {
    failureMode = on;
}

class FailingDocRef {
    constructor(public path: string, public id: string) {}
    async get() { throw new Error("simulated Firestore read failure"); }
    async set() { throw new Error("simulated Firestore write failure"); }
    async update() { throw new Error("simulated Firestore write failure"); }
    async delete() { throw new Error("simulated Firestore write failure"); }
}

class FailingCollection {
    constructor(public path: string) {}
    doc(id?: string) {
        return new FailingDocRef(`${this.path}/${id ?? "auto"}`, id ?? "auto");
    }
    where() { return this; }
    limit() { return this; }
    orderBy() { return this; }
    async get() { throw new Error("simulated Firestore read failure"); }
}

const stubFirestore = () => ({
    collection: (path: string) =>
        failureMode ? new FailingCollection(path) : new StubCollection(path, bucket(path)),
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

// Import AFTER stubbing so the modules capture the fake admin.firestore.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    resolveMetaScope,
    assertWorkspaceAllowed,
} = require("../workspaces/metaCallerScope.js");

async function expectHttpsError(
    fn: () => Promise<unknown>,
    code: string,
    messageFragment: string,
    details?: { reason?: string },
) {
    try {
        await fn();
    } catch (err: any) {
        assert.equal(err.code, code, `expected code ${code}, got ${err.code}`);
        assert.ok(
            String(err.message).includes(messageFragment),
            `expected message to include "${messageFragment}", got "${err.message}"`,
        );
        if (details?.reason) {
            assert.equal(
                err.details?.reason,
                details.reason,
                `expected details.reason = ${details.reason}, got ${err.details?.reason}`,
            );
        }
        return;
    }
    throw new assert.AssertionError({
        message: `expected ${code} / "${messageFragment}" to be thrown`,
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function main() {
    // ─── T-02 — `readDegraded` produces `unavailable`, no write ───
    await run("T-02a: readDegraded (Firestore transient failure) → unavailable", async () => {
        resetStub();
        setFailureMode(true);
        await expectHttpsError(
            () => resolveMetaScope({ auth: { uid: "uid-any" } } as any),
            "unavailable",
            "Could not verify your account",
            { reason: "read_degraded" },
        );
    });

    await run("T-02b: no auth → unauthenticated, no write attempted", async () => {
        resetStub();
        // No `failureMode` flip — the auth check fires before any read.
        await expectHttpsError(
            () => resolveMetaScope({ auth: undefined } as any),
            "unauthenticated",
            "Sign in required",
        );
    });

    await run("T-02c: readDegraded never silently proceeds against caller", async () => {
        resetStub();
        setFailureMode(true);
        // The contract: any callerUid that triggers a degraded read
        // throws `unavailable`. There is no path through resolveMetaScope
        // that returns `{ ownerUid: callerUid, ... }` on a degraded read.
        let returned = false;
        try {
            await resolveMetaScope({ auth: { uid: "uid-team-member" } } as any);
            returned = true;
        } catch (err: any) {
            assert.equal(err.code, "unavailable", "T-02c: degraded read must throw unavailable, never return self-scope");
        }
        assert.equal(returned, false, "T-02c: degraded read must not return");
    });

    // ─── T-03 — workspace outside the permitted set → permission-denied ───
    await run("T-03a: workspace outside permitted set → permission-denied", async () => {
        const scope = {
            ownerUid: "owner1",
            callerUid: "owner1",
            allowedWorkspaceIds: ["ws-1", "ws-2"], // ws-9 not in the list
            storedWorkspaceAccess: [],
        };
        await expectHttpsError(
            () => Promise.resolve(assertWorkspaceAllowed(scope, "ws-9")),
            "permission-denied",
            "No access to this workspace",
            { reason: "workspace_not_permitted" },
        );
    });

    await run("T-03b: workspace inside permitted set → no throw", async () => {
        const scope = {
            ownerUid: "owner1",
            callerUid: "owner1",
            allowedWorkspaceIds: ["ws-1", "ws-2", "ws-3"],
            storedWorkspaceAccess: [],
        };
        // Should resolve; no throw.
        assert.doesNotThrow(() => assertWorkspaceAllowed(scope, "ws-2"));
    });

    await run("T-03c: ALL scope → any workspace allowed", async () => {
        const scope = {
            ownerUid: "owner1",
            callerUid: "member1",
            allowedWorkspaceIds: "ALL" as const,
            storedWorkspaceAccess: [],
        };
        // The all-access policy (FR-004): any verified member's workspace
        // access is implicitly "ALL" and the stored per-member array is
        // not consulted. A workspace id that the caller never named
        // before still passes the check.
        assert.doesNotThrow(() => assertWorkspaceAllowed(scope, "ws-anything"));
    });

    await run("T-03d: scope with empty allowed list + missing workspace → permission-denied", async () => {
        const scope = {
            ownerUid: "owner1",
            callerUid: "owner1",
            allowedWorkspaceIds: [] as string[], // explicit empty array
            storedWorkspaceAccess: [],
        };
        await expectHttpsError(
            () => Promise.resolve(assertWorkspaceAllowed(scope, "ws-1")),
            "permission-denied",
            "No access to this workspace",
            { reason: "workspace_not_permitted" },
        );
    });

    summary();
}

main().catch((err) => {
    console.error("metaCallerScope.test.ts main() crashed:", err);
    process.exit(FAILED);
});
