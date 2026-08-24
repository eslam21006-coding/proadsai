// functions/src/__tests__/metaSelectPage.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 — contract tests for the per-workspace Facebook Page
// selection and read surfaces. Covers:
//
//   T-11 (T044) — A CLEARED workspace does NOT inherit the legacy global
//                 Page. FR-011a — the ad-account change's `metaPageClearedAt`
//                 stamp must block the legacy fallback that FR-007 allows
//                 for `NEVER_SET` workspaces.
//   T-12 (T045) — A NEVER_SET workspace DOES inherit the legacy global
//                 Page. FR-007 — accounts that have never chosen a
//                 per-workspace Page get the legacy `selectedPageId` so
//                 nothing that worked before stops working.
//   T046      — Selecting a Page absent from the connection's `pages[]`
//                 produces `failed-precondition` with `reason:
//                 'page_not_available'` (FR-005).
//
// Plus a small set of metaSelectPageImpl contract checks:
//
//   - SET: selecting a Page writes { metaPageId, metaPageName,
//     metaPageClearedAt: null } (data-model.md §1 SET).
//   - CLEARED: passing `pageId: null` writes { metaPageId: null,
//     metaPageName: null, metaPageClearedAt: <now> } (data-model.md §1
//     CLEARED).
//   - Truncation: pageName > 200 chars is truncated to 200.
//   - Revert-safe: the account-level `selectedPageId`/`selectedPageName`
//     are still written (FR-030).
//   - Workspace not found: `not-found` with `workspace_not_found`.
//   - Workspace soft-deleted: `not-found`.
//   - No workspace resolvable: `failed-precondition` with
//     `no_workspace_resolved`.
//   - Workspace outside the permitted set: `permission-denied` with
//     `workspace_not_permitted`.
//   - Team member can select a Page for an owner's workspace (the
//     all-access policy from FR-004a).
//
// Strategy: the in-memory Firestore stub from workspace.test.ts. The
// impl functions are invoked directly with a fake scope (no live
// resolver). `metaSelectPageImpl` and `getMetaConnectionImpl` are both
// exported from `../index.js`.
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
    console.log(`metaSelectPage tests: ${passed} passed, ${failed} failed`);
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
    private filterFn: ((d: DocData) => boolean) | null = null;
    private limitN: number | null = null;
    where(field: string, op: string, value: any) {
        const prev = this.filterFn;
        this.filterFn = (d) => {
            if (prev && !prev(d)) return false;
            if (op === "==" || op === "===") return d[field] === value;
            if (op === "!=" || op === "!==") return d[field] !== value;
            return true;
        };
        return this;
    }
    limit(n: number) { this.limitN = n; return this; }
    orderBy() { return this; }
    async get() {
        let entries = [...this.store.entries()];
        if (this.filterFn) {
            entries = entries.filter(([, data]) => this.filterFn!(data));
        }
        if (this.limitN != null) entries = entries.slice(0, this.limitN);
        return {
            docs: entries.map(([id, data]) => ({
                id,
                data: () => data,
                ref: new StubDocRef(`${this.path}/${id}`, id, this.store),
            })),
            empty: entries.length === 0,
            size: entries.length,
        };
    }
}

function resetStub() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}

const stubFirestore = () => ({
    settings: () => stubFirestore(),
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    metaSelectPageImpl,
    getMetaConnectionImpl,
} = require("../index.js");

// ─── Fixtures ────────────────────────────────────────────────────────────────

function setupConnectionFixture(opts?: {
    selectedPageId?: string | null;
    selectedPageName?: string | null;
}) {
    bucket("metaConnections").set("owner-1", {
        adAccounts: [{ id: "act_1", name: "Account 1" }],
        selectedAccountId: "act_1",
        pages: [
            { id: "page-legacy", name: "Legacy Page" },
            { id: "page-A", name: "Workspace A Page" },
            { id: "page-B", name: "Workspace B Page" },
        ],
        selectedPageId: opts?.selectedPageId ?? "page-legacy",
        selectedPageName: opts?.selectedPageName ?? "Legacy Page",
        connectedAt: Date.now(),
        lastSyncAt: Date.now(),
        status: "connected",
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
    });
}

function setupWorkspace(opts: {
    id: string;
    name?: string;
    metaAdAccountId?: string | null;
    isDefault?: boolean;
    deletedAt?: number | null;
    metaPageId?: string | null;
    metaPageName?: string | null;
    metaPageClearedAt?: number | null;
}) {
    bucket("users/owner-1/workspaces").set(opts.id, {
        name: opts.name ?? opts.id,
        isDefault: opts.isDefault ?? false,
        createdAt: Date.parse("2026-06-01T00:00:00Z"),
        deletedAt: opts.deletedAt ?? null,
        metaAdAccountId: opts.metaAdAccountId ?? null,
        metaPageId: opts.metaPageId ?? null,
        metaPageName: opts.metaPageName ?? null,
        metaPageClearedAt: opts.metaPageClearedAt ?? null,
    });
}

function ownerScope(allowedWorkspaceIds: string[] | "ALL" = "ALL") {
    return {
        ownerUid: "owner-1",
        callerUid: "owner-1",
        allowedWorkspaceIds,
        storedWorkspaceAccess: [],
    };
}

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
                `expected details.reason=${details.reason}, got ${err.details?.reason}`,
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
    // ─── T-11 (T044): CLEARED workspace does NOT inherit legacy global Page ───
    await run("T-11: CLEARED workspace does NOT inherit the legacy global Page", async () => {
        resetStub();
        setupConnectionFixture({
            selectedPageId: "page-legacy",
            selectedPageName: "Legacy Page",
        });
        // Workspace in CLEARED state — metaPageId=null, metaPageClearedAt set.
        setupWorkspace({
            id: "ws-cleared", name: "Cleared Page Workspace",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: null,
            metaPageClearedAt: Date.parse("2026-07-15T00:00:00Z"),
        });
        // Read path: getMetaConnection(workspaceId) returns the
        // workspace's resolved Page. CLEARED → pageSource='none',
        // activePageId=null.
        const conn = await getMetaConnectionImpl(
            ownerScope(),
            { workspaceId: "ws-cleared" },
        );
        assert.equal(conn.connected, true);
        assert.equal(conn.pageSource, "none", "T-11: CLEARED must record pageSource='none'");
        assert.equal(conn.activePageId, null);
        assert.equal(conn.activePageName, null);
    });

    await run("T-11b: a SET on workspace A doesn't leak into CLEARED workspace B", async () => {
        resetStub();
        setupConnectionFixture({ selectedPageId: null, selectedPageName: null });
        // Workspace A is SET to its own Page.
        setupWorkspace({
            id: "ws-set", name: "Set Workspace",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: "page-set",
            metaPageName: "Workspace Set Page",
            metaPageClearedAt: null,
        });
        // Workspace B is CLEARED — must NOT show page-set.
        setupWorkspace({
            id: "ws-cleared", name: "Cleared Workspace",
            metaAdAccountId: "act_2",
            isDefault: false,
            metaPageId: null,
            metaPageClearedAt: Date.parse("2026-07-15T00:00:00Z"),
        });
        const connB = await getMetaConnectionImpl(ownerScope(), { workspaceId: "ws-cleared" });
        assert.equal(connB.pageSource, "none", "T-11b: CLEARED → pageSource='none' (workspace A's Page does not leak)");
        assert.equal(connB.activePageId, null);
    });

    // ─── T-12 (T045): NEVER_SET workspace DOES inherit legacy global Page ───
    await run("T-12: NEVER_SET workspace inherits the legacy global Page", async () => {
        resetStub();
        setupConnectionFixture({
            selectedPageId: "page-legacy",
            selectedPageName: "Legacy Page",
        });
        // Workspace has never had a Page chosen.
        setupWorkspace({
            id: "ws-never-set", name: "Never Set Workspace",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: null,
            metaPageClearedAt: null,
        });
        const conn = await getMetaConnectionImpl(
            ownerScope(),
            { workspaceId: "ws-never-set" },
        );
        assert.equal(conn.pageSource, "legacy_global", "T-12: NEVER_SET → pageSource='legacy_global'");
        assert.equal(conn.activePageId, "page-legacy");
        assert.equal(conn.activePageName, "Legacy Page");
    });

    await run("T-12b: SET workspace uses its own Page (no legacy fallback)", async () => {
        resetStub();
        setupConnectionFixture({
            selectedPageId: "page-legacy",
            selectedPageName: "Legacy Page",
        });
        setupWorkspace({
            id: "ws-set", name: "Set Workspace",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: "page-set",
            metaPageName: "Workspace Set Page",
            metaPageClearedAt: null,
        });
        const conn = await getMetaConnectionImpl(ownerScope(), { workspaceId: "ws-set" });
        assert.equal(conn.pageSource, "workspace");
        assert.equal(conn.activePageId, "page-set");
        assert.equal(conn.activePageName, "Workspace Set Page");
    });

    await run("T-12c: workspaceId omitted → falls back to legacy global fields", async () => {
        resetStub();
        setupConnectionFixture({
            selectedPageId: "page-legacy",
            selectedPageName: "Legacy Page",
        });
        setupWorkspace({
            id: "ws-1", name: "Workspace 1",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: null,
        });
        const conn = await getMetaConnectionImpl(ownerScope(), {});
        // No workspace supplied → use the account-global values for
        // back-compat (FR-009 reads are still allowed for the legacy
        // surface; the workspace-aware surface is the new one).
        assert.equal(conn.activePageId, "page-legacy");
        assert.equal(conn.activePageName, "Legacy Page");
        assert.equal(conn.pageSource, "legacy_global");
    });

    // ─── T046: page_not_available ───
    await run("T046: selecting a Page absent from pages[] → page_not_available", async () => {
        resetStub();
        setupConnectionFixture();
        setupWorkspace({
            id: "ws-1", name: "Workspace 1",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: null,
            metaPageClearedAt: null,
        });
        await expectHttpsError(
            () => metaSelectPageImpl(
                ownerScope(),
                { pageId: "page-not-in-conn", pageName: "Fake", workspaceId: "ws-1" },
            ),
            "failed-precondition",
            "not in your connected Pages",
            { reason: "page_not_available" },
        );
    });

    // ─── metaSelectPageImpl contract checks ─────────────────────────────────
    await run("MSP-1: SET — selecting a Page writes the SET-state fields", async () => {
        resetStub();
        setupConnectionFixture();
        setupWorkspace({
            id: "ws-1", name: "Workspace 1",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: null,
            metaPageClearedAt: null,
        });
        const result = await metaSelectPageImpl(
            ownerScope(),
            { pageId: "page-A", pageName: "Workspace A Page", workspaceId: "ws-1" },
        );
        assert.equal(result.ok, true);
        assert.equal(result.workspaceId, "ws-1");
        const ws = bucket("users/owner-1/workspaces").get("ws-1") as DocData;
        assert.equal(ws.metaPageId, "page-A");
        assert.equal(ws.metaPageName, "Workspace A Page");
        assert.equal(ws.metaPageClearedAt, null, "MSP-1: SET → clearedAt null");
    });

    await run("MSP-2: CLEARED — passing pageId:null writes the CLEARED-state fields", async () => {
        resetStub();
        setupConnectionFixture();
        setupWorkspace({
            id: "ws-1", name: "Workspace 1",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: "page-A",
            metaPageName: "Workspace A Page",
            metaPageClearedAt: null,
        });
        const before = Date.now();
        await metaSelectPageImpl(
            ownerScope(),
            { pageId: null, pageName: null, workspaceId: "ws-1" },
        );
        const after = Date.now();
        const ws = bucket("users/owner-1/workspaces").get("ws-1") as DocData;
        assert.equal(ws.metaPageId, null);
        assert.equal(ws.metaPageName, null);
        assert.ok(
            typeof ws.metaPageClearedAt === "number"
              && ws.metaPageClearedAt >= before
              && ws.metaPageClearedAt <= after,
            "MSP-2: CLEARED → metaPageClearedAt stamped",
        );
    });

    await run("MSP-2b: clear with a stale pageName normalises BOTH legacy fields to null", async () => {
        // CR-MINOR (CodeRabbit review feedback): when pageId is null,
        // a stale pageName would create an inconsistent legacy
        // selection (a name with no ID). Force both legacy Page fields
        // to null regardless of the supplied pageName.
        resetStub();
        setupConnectionFixture({
            selectedPageId: "page-old",
            selectedPageName: "Old Page",
        });
        setupWorkspace({
            id: "ws-1", name: "Workspace 1",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: "page-A",
            metaPageName: "Workspace A Page",
            metaPageClearedAt: null,
        });
        await metaSelectPageImpl(
            ownerScope(),
            { pageId: null, pageName: "stale", workspaceId: "ws-1" },
        );
        const conn = bucket("metaConnections").get("owner-1") as DocData;
        assert.equal(conn.selectedPageId, null, "MSP-2b: legacy id null");
        assert.equal(
            conn.selectedPageName, null,
            "MSP-2b: legacy name normalised to null on clear",
        );
    });

    await run("MSP-3: pageName > 200 chars is truncated", async () => {
        resetStub();
        setupConnectionFixture();
        setupWorkspace({
            id: "ws-1", name: "Workspace 1",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: null,
        });
        const longName = "A".repeat(250);
        await metaSelectPageImpl(
            ownerScope(),
            { pageId: "page-A", pageName: longName, workspaceId: "ws-1" },
        );
        const ws = bucket("users/owner-1/workspaces").get("ws-1") as DocData;
        assert.equal(ws.metaPageName.length, 200);
        const conn = bucket("metaConnections").get("owner-1") as DocData;
        assert.equal(conn.selectedPageName.length, 200);
    });

    await run("MSP-4: account-level selectedPageId/selectedPageName are still written (FR-030)", async () => {
        resetStub();
        setupConnectionFixture();
        setupWorkspace({
            id: "ws-1", name: "Workspace 1",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: null,
        });
        await metaSelectPageImpl(
            ownerScope(),
            { pageId: "page-A", pageName: "Workspace A Page", workspaceId: "ws-1" },
        );
        const conn = bucket("metaConnections").get("owner-1") as DocData;
        assert.equal(conn.selectedPageId, "page-A");
        assert.equal(conn.selectedPageName, "Workspace A Page");
    });

    await run("MSP-5: workspace not found → not-found", async () => {
        resetStub();
        setupConnectionFixture();
        await expectHttpsError(
            () => metaSelectPageImpl(
                ownerScope(),
                { pageId: "page-A", pageName: "Page A", workspaceId: "ws-does-not-exist" },
            ),
            "not-found",
            "Workspace not found",
            { reason: "workspace_not_found" },
        );
    });

    await run("MSP-6: workspace soft-deleted → not-found", async () => {
        resetStub();
        setupConnectionFixture();
        setupWorkspace({
            id: "ws-deleted", name: "Deleted Workspace",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: null,
            deletedAt: Date.parse("2026-08-01T00:00:00Z"),
        });
        await expectHttpsError(
            () => metaSelectPageImpl(
                ownerScope(),
                { pageId: "page-A", pageName: "Page A", workspaceId: "ws-deleted" },
            ),
            "not-found",
            "Workspace not found or already deleted",
        );
    });

    await run("MSP-7: no workspaceId + no default → no_workspace_resolved", async () => {
        resetStub();
        setupConnectionFixture();
        // No workspace on the account — resolveDefaultWorkspaceId
        // returns empty.
        await expectHttpsError(
            () => metaSelectPageImpl(
                ownerScope(),
                { pageId: "page-A", pageName: "Page A" },
            ),
            "failed-precondition",
            "No workspace could be determined",
            { reason: "no_workspace_resolved" },
        );
    });

    await run("MSP-8: workspace outside permitted set → workspace_not_permitted", async () => {
        resetStub();
        setupConnectionFixture();
        setupWorkspace({
            id: "ws-1", name: "Workspace 1",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: null,
        });
        await expectHttpsError(
            () => metaSelectPageImpl(
                {
                    ownerUid: "owner-1",
                    callerUid: "member-x",
                    allowedWorkspaceIds: ["ws-2", "ws-3"], // ws-1 not permitted
                    storedWorkspaceAccess: [],
                },
                { pageId: "page-A", pageName: "Page A", workspaceId: "ws-1" },
            ),
            "permission-denied",
            "No access to this workspace",
            { reason: "workspace_not_permitted" },
        );
    });

    await run("MSP-9: team member (ALL scope) can select a Page for owner's workspace", async () => {
        resetStub();
        setupConnectionFixture();
        setupWorkspace({
            id: "ws-1", name: "Workspace 1",
            metaAdAccountId: "act_1",
            isDefault: true,
            metaPageId: null,
        });
        const result = await metaSelectPageImpl(
            {
                ownerUid: "owner-1",
                callerUid: "member-x",
                allowedWorkspaceIds: "ALL", // all-access policy (FR-004a)
                storedWorkspaceAccess: [],
            },
            { pageId: "page-A", pageName: "Page A", workspaceId: "ws-1" },
        );
        assert.equal(result.ok, true);
        const ws = bucket("users/owner-1/workspaces").get("ws-1") as DocData;
        assert.equal(ws.metaPageId, "page-A");
    });

    summary();
}

main().catch((err) => {
    console.error("metaSelectPage.test.ts main() crashed:", err);
    process.exit(FAILED);
});
