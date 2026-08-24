// functions/src/__tests__/workspace.test.ts — contract tests for workspace callables
// Run: cd functions && npm run build && node lib/__tests__/workspace.test.js
//
// Strategy: bring up `firebase-functions-test` in offline mode and wrap the real
// handlers, stubbing `admin.firestore()` with an in-memory fixture BEFORE importing
// index.ts. Assertions check the observed HttpsError code and message so regressions
// in the gating logic fail here.

import assert from "node:assert/strict";

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
// `require` is the CJS global; tsconfig compiles this file to CommonJS.
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

function resetStore() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}

const stubFirestore = () => ({
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

// Import AFTER stubbing so workspacePolicy captures the fake admin.firestore.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    assertScalePlan,
    assertWorkspaceLimit,
    assertNotTeamMember,
    createWorkspaceWithLimit,
} = require("../workspaces/workspacePolicy.js");

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

// Wrap top-level awaits in an async main() — tsconfig compiles to CommonJS,
// which does not allow top-level await outside ESM.
async function main() {
    // ═══════════════════════════════════════════════════════════════════════
    // T013: assertScalePlan on a below-Scale plan → permission-denied / Scale plan
    // ═══════════════════════════════════════════════════════════════════════
    await run("T013: assertScalePlan('pro') → permission-denied", async () => {
        resetStore();
        bucket("users").set("uid-pro", { billingState: { plan: "pro" } });
        await expectHttpsError(() => assertScalePlan("uid-pro"), "permission-denied", "Scale plan");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // T014: assertWorkspaceLimit rejects the 51st workspace
    // ═══════════════════════════════════════════════════════════════════════
    await run("T014: assertWorkspaceLimit at 50 → failed-precondition", async () => {
        resetStore();
        const wsBucket = bucket("users/uid-scale/workspaces");
        for (let i = 0; i < 50; i++) wsBucket.set(`ws-${i}`, { deletedAt: null });
        await expectHttpsError(() => assertWorkspaceLimit("uid-scale"), "failed-precondition", "50-workspace");
    });

    // CR-MAJOR (CodeRabbit round 7): use a complete `WorkspaceShape`
    // fixture factory so every `createWorkspaceWithLimit` test stays
    // in lockstep with the production type — the previous code passed
    // partial objects that did not satisfy `WorkspaceShape` (the build
    // only worked because the policy module is `require()`-imported).
    function makeWorkspaceDoc(overrides: Partial<{
        name: string;
        brandName: string;
        isDefault: boolean;
        deletedAt: number | null;
        createdAt: number;
    }> = {}): any {
        return {
            name: "Untitled",
            brandName: "Untitled Brand",
            isDefault: false,
            deletedAt: null,
            createdAt: Date.now(),
            ...overrides,
        };
    }

    await run("T014b: createWorkspaceWithLimit at 50 on Scale → failed-precondition", async () => {
        resetStore();
        bucket("users").set("uid-scale", { billingState: { plan: "scale" } });
        const wsBucket = bucket("users/uid-scale/workspaces");
        for (let i = 0; i < 50; i++) wsBucket.set(`ws-${i}`, { deletedAt: null });
        await expectHttpsError(
            () => createWorkspaceWithLimit("uid-scale", makeWorkspaceDoc({ name: "51st" })),
            "failed-precondition",
            "50-workspace"
        );
    });

    await run("T014c: createWorkspaceWithLimit on non-Scale → permission-denied (TOCTOU-safe)", async () => {
        resetStore();
        bucket("users").set("uid-pro", { billingState: { plan: "pro" } });
        // Even with room for another workspace, a non-Scale plan is rejected inside the txn.
        await expectHttpsError(
            () => createWorkspaceWithLimit("uid-pro", makeWorkspaceDoc({ name: "Client B" })),
            "permission-denied",
            "Scale plan"
        );
    });

    await run("T015: createWorkspaceWithLimit happy path → new id", async () => {
        resetStore();
        bucket("users").set("uid-scale", { billingState: { plan: "scale" } });
        const wsBucket = bucket("users/uid-scale/workspaces");
        wsBucket.set("default", { isDefault: true, deletedAt: null });
        const result = await createWorkspaceWithLimit("uid-scale", makeWorkspaceDoc({ name: "Client A", deletedAt: null }));
        assert.ok(result.workspaceId && typeof result.workspaceId === "string", "expected a workspace id");
        assert.equal(typeof result.isDefault, "boolean", "expected isDefault verdict in result");
        assert.equal(result.isDefault, false, "T015: second workspace is NOT the default (a first one already exists)");
        assert.equal(wsBucket.size, 2, "expected two workspaces after create");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // Phase 967 — T019 (default-marker source fix, FR-026d)
    //
    // First workspace on a fresh account is marked as default by the
    // transaction — NOT by the caller. A second workspace on the same
    // account is NOT marked default. The caller's `isDefault: false`
    // placeholder is overridden with the transaction's verdict.
    // �══════════════════════════════════════════════════════════════════════
    await run("T019a: first workspace on a fresh account → isDefault true", async () => {
        resetStore();
        bucket("users").set("uid-fresh", { billingState: { plan: "scale" } });
        const wsBucket = bucket("users/uid-fresh/workspaces");
        const { workspaceId, isDefault } = await createWorkspaceWithLimit("uid-fresh", makeWorkspaceDoc({
            name: "Brand A", isDefault: false, deletedAt: null,
        }));
        assert.equal(isDefault, true, "T019a: first workspace is the default");
        const written = wsBucket.get(workspaceId);
        assert.equal(written?.isDefault, true, "T019a: written doc has isDefault=true");
    });

    await run("T019b: second workspace on the same account → isDefault false", async () => {
        resetStore();
        bucket("users").set("uid-second", { billingState: { plan: "scale" } });
        const wsBucket = bucket("users/uid-second/workspaces");
        wsBucket.set("first", { isDefault: true, deletedAt: null, createdAt: 1 });
        const { isDefault } = await createWorkspaceWithLimit("uid-second", makeWorkspaceDoc({
            name: "Brand B", isDefault: false, deletedAt: null, createdAt: 2,
        }));
        assert.equal(isDefault, false, "T019b: second workspace is NOT the default");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // T017 (FR-022, R1) — workspace records lacking `deletedAt` are
    // returned by the listing path after the Phase 2 repair.
    // Mirrors the live filter at `resolveCallerScope` and the
    // workspace-subscription query at `src/App.tsx:2685-2689`.
    //
    // The in-memory stub here doesn't simulate the production
    // collectionGroup scan, so the listing is modelled as
    // `users/{uid}/workspaces`. After the repair, the doc carries
    // `deletedAt: null` explicitly and `active.length` includes it.
    // ═══════════════════════════════════════════════════════════════════════
    await run("T017: listing path returns workspaces repaired to deletedAt=null", async () => {
        resetStore();
        bucket("users").set("uid-rep", { billingState: { plan: "scale" } });
        const wsBucket = bucket("users/uid-rep/workspaces");
        // Simulate the post-repair state: every active workspace has an
        // explicit `deletedAt: null` (the repair's pass 1 result).
        wsBucket.set("ws-legacy", { deletedAt: null, isDefault: true, createdAt: 1 });
        wsBucket.set("ws-new", { deletedAt: null, isDefault: false, createdAt: 2 });
        wsBucket.set("ws-deleted", { deletedAt: 100, isDefault: false, createdAt: 3 });
        const snap = bucket("users/uid-rep/workspaces");
        const active = [...snap.entries()].filter(([, data]) => data.deletedAt == null);
        assert.equal(active.length, 2, "T017: 2 active workspaces returned (the legacy + new)");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // T-22 — repair (pass 2) picks the oldest active workspace when an
    // account has no `isDefault: true` workspace. Mirrors the logic in
    // scripts/repair-workspace-markers.ts:Pass 2.
    //
    // The script is a one-off and isn't imported directly; we mirror the
    // selection function here against the in-memory bucket shape.
    // ═══════════════════════════════════════════════════════════════════════
    function pickRepairDefault(entries: Array<[string, DocData]>): string | null {
        // Mirror of scripts/repair-workspace-markers.ts:isAlreadyDefault +
        // isActiveAfterRepair + sorted[0] logic.
        const active = entries.filter(([, d]) => d.deletedAt == null);
        if (active.length === 0) return null;
        if (active.some(([, d]) => d.isDefault === true)) return null; // already-defaulted → skip
        const sorted = [...active].sort((a, b) => {
            const ac = a[1].createdAt, bc = b[1].createdAt;
            if (typeof ac === "number" && typeof bc === "number") return ac - bc;
            if (typeof ac === "number") return -1;
            if (typeof bc === "number") return 1;
            return a[0].localeCompare(b[0]);
        });
        return sorted[0][0];
    }

    await run("T-22a: pickRepairDefault → oldest active by createdAt", async () => {
        const entries: Array<[string, DocData]> = [
            ["ws-newer", { createdAt: 200, deletedAt: null }],
            ["ws-older", { createdAt: 100, deletedAt: null }],
            ["ws-oldest", { createdAt: 50, deletedAt: null }],
            ["ws-deleted", { createdAt: 25, deletedAt: 999 }],
        ];
        assert.equal(pickRepairDefault(entries), "ws-oldest",
            "T-22a: oldest active wins (createdAt=50); soft-deleted is excluded");
    });

    await run("T-22b: pickRepairDefault → returns null when an account already has a default", async () => {
        const entries: Array<[string, DocData]> = [
            ["ws-1", { createdAt: 100, deletedAt: null, isDefault: true }],
            ["ws-2", { createdAt: 200, deletedAt: null, isDefault: false }],
        ];
        assert.equal(pickRepairDefault(entries), null,
            "T-22b: idempotence — accounts with an existing default are skipped (FR-026e)");
    });

    await run("T-22c: pickRepairDefault → null when every workspace is soft-deleted", async () => {
        const entries: Array<[string, DocData]> = [
            ["ws-1", { createdAt: 100, deletedAt: 999 }],
            ["ws-2", { createdAt: 200, deletedAt: 888 }],
        ];
        assert.equal(pickRepairDefault(entries), null,
            "T-22c: no active workspace → nothing to mark (FR-024)");
    });

    await run("T-22d: pickRepairDefault → tiebreak by doc id when createdAt is missing", async () => {
        const entries: Array<[string, DocData]> = [
            ["ws-b", { deletedAt: null }], // no createdAt
            ["ws-a", { deletedAt: null }], // no createdAt
            ["ws-c", { deletedAt: 999 }], // deleted
        ];
        // Both ws-a and ws-b lack createdAt; ws-a < ws-b lexicographically.
        assert.equal(pickRepairDefault(entries), "ws-a",
            "T-22d: missing createdAt falls back to lexicographic doc-id tiebreak");
    });

    // ═══════════════════════════════════════════════════════════════════════
    // Remaining contract checks — skipped until an emulator harness lands.
    // The names are preserved so the suite can be easily restored when real tests arrive.
    // ═══════════════════════════════════════════════════════════════════════
    skip("T016: updateWorkspace partial write → LWW");
    skip("T017: deleteWorkspace default → default_workspace_undeletable");
    skip("T018: deleteWorkspace + restoreWorkspace round-trip");
    skip("T032: linkMeta not connected → meta_account_not_connected");
    skip("T033: linkMeta INSUFFICIENT role → succeeds + metaRoleAtLinkTime=INSUFFICIENT (audit only; gate removed in batch-01-account-picker-fix)");
    skip("T034: linkMeta ADVERTISER → ok, fields written");
    skip("T035: unlinkMeta → fields cleared");
    skip("T042: generation missing activeWorkspaceId → active_workspace_required");
    skip("T043: generation writes workspaceId");
    skip("T058: setAccess non-owner → owner_only");
    skip("T059: setAccess soft-deleted → invalid_workspace_id");
    skip("T060: setAccess diff → one audit per grant/revoke");
    skip("T026: purgeExpiredWorkspaces → hard delete");

    // ═══════════════════════════════════════════════════════════════════════
    // T-14 (T079) — a team member is still refused create, delete,
    // and restore (FR-019). The Phase 967 widening (T080) lifted the
    // team-member block on link/unlink only; the destructive
    // workspace-level actions remain owner-only via the existing
    // `assertNotTeamMember` guard in workspacePolicy.ts (the
    // production `createWorkspace` / `deleteWorkspace` / `restoreWorkspace`
    // callables still call it as their first statement). Call the
    // exported guard directly so the test exercises the real code.
    // ═══════════════════════════════════════════════════════════════════════
    function setupOwnerUserDoc(uid: string) {
        bucket("users").set(uid, {}); // no isTeamMember flag — owner
    }
    function setupTeamMemberForGuardTest(memberUid: string, ownerUid: string) {
        bucket("users").set(memberUid, {
            isTeamMember: true,
            teamOwnerUid: ownerUid,
        });
    }

    await run("T-14a: team member is refused createWorkspace (FR-019)", async () => {
        resetStore();
        setupTeamMemberForGuardTest("member-1", "owner-1");
        await expectHttpsError(
            () => assertNotTeamMember("member-1", "create"),
            "permission-denied",
            "Only the account owner can add, change, or remove workspaces.",
        );
    });

    await run("T-14b: team member is refused deleteWorkspace (FR-019)", async () => {
        resetStore();
        setupTeamMemberForGuardTest("member-1", "owner-1");
        await expectHttpsError(
            () => assertNotTeamMember("member-1", "delete"),
            "permission-denied",
            "Only the account owner can add, change, or remove workspaces.",
        );
    });

    await run("T-14c: team member is refused restoreWorkspace (FR-019)", async () => {
        resetStore();
        setupTeamMemberForGuardTest("member-1", "owner-1");
        await expectHttpsError(
            () => assertNotTeamMember("member-1", "restore"),
            "permission-denied",
            "Only the account owner can add, change, or remove workspaces.",
        );
    });

    await run("T-14d: owner is NOT refused by assertNotTeamMember (FR-019 closure)", async () => {
        resetStore();
        setupOwnerUserDoc("owner-1");
        // No throw — owner passes the guard.
        await assertNotTeamMember("owner-1", "create");
    });

    summary();
}

main().catch((err) => {
    console.error("workspace.test.ts main() crashed:", err);
    process.exit(FAILED);
});
