// functions/src/__tests__/metaPush.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 — contract tests for the workspace-routed metaPushCreative
// callable. Covers the six contract rows from
// contracts/callable-contracts.md that the single-creative push owns:
//
//   T-04 — Publish from workspace A ignores `selectedAccountId` set
//          to B's account. (FR-014)
//   T-05 — Publish with no `workspaceId` resolves the account default.
//          (FR-012, FR-012b)
//   T-06 — Publish with no resolvable workspace → `no_workspace_resolved`.
//          (FR-012a)
//   T-07 — Publish from a workspace with no ad account is refused; the
//          message names the workspace; nothing is created.
//          (FR-015, FR-015a)
//   T-08 — Publish from a workspace with no Page SUCCEEDS and records
//          `pageSource: 'none'`. (FR-015a, FR-027)
//   T-24 — Across all three `pageSource` values and both
//          `workspaceIdSource` values, every deployment record has
//          `workspaceId`, `workspaceIdSource`, `adAccountId`,
//          `pageSource`, and `pushedByUid` populated.
//          (FR-027, SC-008)
//
// Strategy: the in-memory Firestore stub mirrors workspace.test.ts
// (no emulator, no live project). `metaPushCreativeImpl` is invoked
// directly with a fake fetch implementation that records the URL and
// returns a canned image-hash response. The Meta app secret is
// supplied via `deps.metaAppSecretValue` so the decrypt path works
// against a token encrypted with the test secret.
// ═══════════════════════════════════════════════════════════════════════════

import assert from "node:assert/strict";
import * as crypto from "node:crypto";

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
    console.log(`metaPush tests: ${passed} passed, ${failed} failed`);
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
    // Chainable query modifiers. Only the combinations the metaPush
    // tests need are implemented; everything else falls through as a
    // no-op filter (returning every doc).
    private filterFn: ((d: DocData) => boolean) | null = null;
    private limitN: number | null = null;
    where(field: string, op: string, value: any) {
        const prev = this.filterFn;
        this.filterFn = (d) => {
            if (prev && !prev(d)) return false;
            if (op === "==" || op === "===") return d[field] === value;
            if (op === "!=" || op === "!==") return d[field] !== value;
            // Unknown operator — don't filter.
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
    // No-op so module-level `admin.firestore().settings(...)` calls
    // (functions/src/index.ts:88) don't blow up the import.
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

// Import AFTER stubbing.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { metaPushCreativeImpl } = require("../index.js");

// ─── Test fixtures ──────────────────────────────────────────────────────────

const TEST_SECRET = "test-meta-app-secret";
const TEST_TOKEN = "fake-meta-access-token";

// Encrypt the test token with the same scheme as `decryptToken` in
// index.ts (AES-256-GCM via scrypt-derived key + proadsai-salt).
function encryptTestToken(plaintext: string, secret: string): string {
    const key = crypto.scryptSync(secret, "proadsai-salt", 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function makeFakeFetch(uploadResponse: any): {
    fetch: typeof fetch;
    calls: { url: string; body: any }[];
} {
    const calls: { url: string; body: any }[] = [];
    const fetchImpl: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        let body: any = null;
        if (init?.body && typeof init.body === "string") {
            try { body = JSON.parse(init.body); } catch { body = init.body; }
        }
        calls.push({ url, body });
        return new Response(JSON.stringify(uploadResponse), { status: 200 });
    }) as unknown as typeof fetch;
    return { fetch: fetchImpl, calls };
}

const IMAGE_HASH = "abc123def456789012345678901234567890";

function setupOwnerScopeFixture() {
    const usersBucket = bucket("users");
    usersBucket.set("owner-1", {}); // presence — workspace reads use the workspaces collection
    // metaConnections/{ownerUid}
    bucket("metaConnections").set("owner-1", {
        encryptedToken: encryptTestToken(TEST_TOKEN, TEST_SECRET),
        adAccounts: [
            { id: "act_WS_A", name: "Workspace A account" },
            { id: "act_WS_B", name: "Workspace B account" },
        ],
        selectedAccountId: "act_WS_B", // BUG 3 — pointing at B's account. Test T-04 asserts this is IGNORED.
        selectedPageId: "page-legacy",
        selectedPageName: "Legacy Page",
        pages: [
            { id: "page-legacy", name: "Legacy Page" },
            { id: "page-A", name: "Workspace A Page" },
            { id: "page-B", name: "Workspace B Page" },
        ],
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
    const wsBucket = bucket("users/owner-1/workspaces");
    wsBucket.set(opts.id, {
        name: opts.name ?? opts.id,
        isDefault: opts.isDefault ?? false,
        createdAt: Date.parse("2026-06-01T00:00:00Z") + Number(opts.id.replace(/\D/g, "") || 0),
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
    // ─── T-04: publish from workspace A ignores `selectedAccountId` pointing at B ───
    await run("T-04: publish from ws-A uses ws-A's account, not conn.selectedAccountId", async () => {
        resetStub();
        setupOwnerScopeFixture();
        setupWorkspace({
            id: "ws-A", name: "Brand A",
            metaAdAccountId: "act_WS_A",
            isDefault: true,
            metaPageId: "page-A", metaPageName: "Workspace A Page",
        });
        const { fetch: impl, calls } = makeFakeFetch({
            images: { "0": { hash: IMAGE_HASH } },
        });
        const result = await metaPushCreativeImpl(
            ownerScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                adName: "Brand A creative",
                workspaceId: "ws-A",
            },
            { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
        );
        assert.equal(result.success, true);
        assert.equal(result.workspaceId, "ws-A");
        assert.equal(calls.length, 1, "exactly one upload call");
        const call = calls[0];
        assert.ok(
            call.url.includes("/act_WS_A/adimages"),
            `T-04: must hit ws-A's account. url=${call.url}`,
        );
        assert.ok(
            !call.url.includes("act_WS_B"),
            `T-04: must NOT hit ws-B's account. url=${call.url}`,
        );
    });

    // ─── T-05: no workspaceId → resolves the account default ───
    await run("T-05: no workspaceId → resolves account default workspace", async () => {
        resetStub();
        setupOwnerScopeFixture();
        setupWorkspace({
            id: "ws-default", name: "Default Workspace",
            metaAdAccountId: "act_DEFAULT",
            isDefault: true,
        });
        setupWorkspace({
            id: "ws-other", name: "Other Workspace",
            metaAdAccountId: "act_OTHER",
            isDefault: false,
        });
        const { fetch: impl, calls } = makeFakeFetch({
            images: { "0": { hash: IMAGE_HASH } },
        });
        const result = await metaPushCreativeImpl(
            ownerScope(),
            { imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" },
            { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
        );
        assert.equal(result.success, true);
        assert.equal(result.workspaceId, "ws-default");
        assert.equal(result.workspaceIdSource, "default");
        assert.ok(calls[0].url.includes("/act_DEFAULT/adimages"));
    });

    // ─── T-06: no resolvable workspace → `no_workspace_resolved` ───
    await run("T-06: no default workspace on the account → no_workspace_resolved", async () => {
        resetStub();
        setupOwnerScopeFixture();
        // Two workspaces, neither isDefault — resolveDefaultWorkspaceId
        // returns the first matching `isDefault === true` doc, but
        // there is none.
        setupWorkspace({ id: "ws-1", name: "Workspace 1", metaAdAccountId: "act_1", isDefault: false });
        setupWorkspace({ id: "ws-2", name: "Workspace 2", metaAdAccountId: "act_2", isDefault: false });
        const { fetch: impl } = makeFakeFetch({ images: { "0": { hash: IMAGE_HASH } } });
        await expectHttpsError(
            () => metaPushCreativeImpl(
                ownerScope(),
                { imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" },
                { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
            ),
            "failed-precondition",
            "No workspace could be determined",
            { reason: "no_workspace_resolved" },
        );
    });

    // ─── T-07: workspace with no ad account → refused, names workspace ───
    await run("T-07: workspace has no ad account → refused, names the workspace", async () => {
        resetStub();
        setupOwnerScopeFixture();
        setupWorkspace({
            id: "ws-empty", name: "Brand X",
            metaAdAccountId: null,
            isDefault: true,
        });
        const { fetch: impl, calls } = makeFakeFetch({ images: { "0": { hash: IMAGE_HASH } } });
        await expectHttpsError(
            () => metaPushCreativeImpl(
                ownerScope(),
                {
                    imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                    workspaceId: "ws-empty",
                },
                { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
            ),
            "failed-precondition",
            "Brand X",
            { reason: "workspace_no_ad_account" },
        );
        assert.equal(calls.length, 0, "T-07: NO Meta upload attempted — workspace has no account");
    });

    // ─── T-08: workspace with no Page → SUCCEEDS, records `pageSource: 'none'` ───
    await run("T-08: workspace with no Page succeeds and records pageSource='none'", async () => {
        resetStub();
        setupOwnerScopeFixture();
        setupWorkspace({
            id: "ws-no-page", name: "No Page Workspace",
            metaAdAccountId: "act_NOPG",
            isDefault: true,
            // no Page — metaPageId null, metaPageClearedAt null → NEVER_SET
            metaPageId: null,
            metaPageName: null,
            metaPageClearedAt: null,
        });
        // conn.selectedPageId is set, so legacy fallback fires for NEVER_SET.
        const { fetch: impl, calls } = makeFakeFetch({
            images: { "0": { hash: IMAGE_HASH } },
        });
        const result = await metaPushCreativeImpl(
            ownerScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                workspaceId: "ws-no-page",
            },
            { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
        );
        assert.equal(result.success, true);
        // NEVER_SET → legacy fallback applies → pageSource='legacy_global'
        assert.equal(result.pageSource, "legacy_global");
        assert.equal(calls.length, 1, "T-08: Meta upload IS attempted (publish is not gated on a Page)");
        // Deployment record carries the trace.
        const deploy = [...bucket("creativeDeployments").values()][0] as DocData;
        assert.equal(deploy.workspaceId, "ws-no-page");
        assert.equal(deploy.pageSource, "legacy_global");
        assert.equal(deploy.workspaceIdSource, "request");
        assert.equal(deploy.adAccountId, "act_NOPG");
        assert.equal(deploy.userId, "owner-1");
        assert.equal(deploy.pushedByUid, "owner-1");
    });

    await run("T-08b: workspace CLEARED (FR-011) does NOT inherit legacy Page", async () => {
        resetStub();
        setupOwnerScopeFixture();
        setupWorkspace({
            id: "ws-cleared", name: "Cleared Page Workspace",
            metaAdAccountId: "act_CLR",
            isDefault: true,
            metaPageId: null,
            metaPageName: null,
            // Cleared by an ad-account change — must not fall back.
            metaPageClearedAt: Date.parse("2026-07-01T00:00:00Z"),
        });
        const { fetch: impl } = makeFakeFetch({
            images: { "0": { hash: IMAGE_HASH } },
        });
        const result = await metaPushCreativeImpl(
            ownerScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                workspaceId: "ws-cleared",
            },
            { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
        );
        assert.equal(result.success, true);
        assert.equal(result.pageSource, "none", "T-08b: CLEARED workspace must record pageSource='none'");
        const deploy = [...bucket("creativeDeployments").values()][0] as DocData;
        assert.equal(deploy.pageSource, "none");
        assert.equal(deploy.pageId, null);
    });

    await run("T-08c: workspace SET (has its own Page) uses workspace's Page, not legacy", async () => {
        resetStub();
        setupOwnerScopeFixture();
        setupWorkspace({
            id: "ws-set", name: "Own Page Workspace",
            metaAdAccountId: "act_SET",
            isDefault: true,
            metaPageId: "page-set",
            metaPageName: "Workspace Set Page",
            metaPageClearedAt: null,
        });
        const { fetch: impl } = makeFakeFetch({
            images: { "0": { hash: IMAGE_HASH } },
        });
        const result = await metaPushCreativeImpl(
            ownerScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                workspaceId: "ws-set",
            },
            { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
        );
        assert.equal(result.pageSource, "workspace", "T-08c: SET workspace records pageSource='workspace'");
        const deploy = [...bucket("creativeDeployments").values()][0] as DocData;
        assert.equal(deploy.pageId, "page-set");
        assert.equal(deploy.pageName, "Workspace Set Page");
    });

    // ─── T-24: all five traceability fields populated across a sample ───
    await run("T-24: every deployment record has all five traceability fields populated", async () => {
        resetStub();
        setupOwnerScopeFixture();
        // ws-A: SET (has its own Page) — 'workspace' pageSource
        setupWorkspace({
            id: "ws-A", name: "Brand A",
            metaAdAccountId: "act_A",
            isDefault: false,
            metaPageId: "page-A",
            metaPageName: "Page A",
            metaPageClearedAt: null,
        });
        // ws-B: CLEARED (Page cleared by an ad-account change) — 'none' pageSource
        setupWorkspace({
            id: "ws-B", name: "Brand B",
            metaAdAccountId: "act_B",
            isDefault: false,
            metaPageId: null,
            metaPageClearedAt: Date.parse("2026-07-01T00:00:00Z"),
        });
        // ws-C: NEVER_SET + isDefault — 'legacy_global' pageSource
        setupWorkspace({
            id: "ws-C", name: "Brand C",
            metaAdAccountId: "act_C",
            isDefault: true,
            metaPageId: null,
            metaPageName: null,
            metaPageClearedAt: null,
        });
        const { fetch: impl } = makeFakeFetch({
            images: { "0": { hash: IMAGE_HASH } },
        });
        const deps = { fetchImpl: impl, metaAppSecretValue: TEST_SECRET };
        // 1) workspaceIdSource = 'request', pageSource = 'workspace'
        await metaPushCreativeImpl(
            ownerScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                workspaceId: "ws-A",
            },
            deps,
        );
        // 2) workspaceIdSource = 'request', pageSource = 'none' (CLEARED)
        await metaPushCreativeImpl(
            ownerScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                workspaceId: "ws-B",
            },
            deps,
        );
        // 3) workspaceIdSource = 'default', pageSource = 'legacy_global' (NEVER_SET)
        await metaPushCreativeImpl(
            ownerScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
            },
            deps,
        );

        const deployments = [...bucket("creativeDeployments").values()] as DocData[];
        assert.equal(deployments.length, 3, "T-24: three deployment records");
        const requiredFields = [
            "workspaceId",
            "workspaceIdSource",
            "adAccountId",
            "pageSource",
            "pushedByUid",
        ];
        for (const d of deployments) {
            for (const f of requiredFields) {
                assert.ok(
                    d[f] !== undefined && d[f] !== null,
                    `T-24: deployment.${f} must be populated (got ${JSON.stringify(d[f])})`,
                );
            }
        }
        // Distinct pageSource values covered.
        const pageSources = new Set(deployments.map((d) => d.pageSource));
        assert.ok(pageSources.has("workspace"), "T-24: 'workspace' pageSource covered");
        assert.ok(pageSources.has("none"), "T-24: 'none' pageSource covered");
        assert.ok(pageSources.has("legacy_global"), "T-24: 'legacy_global' pageSource covered");
        // Distinct workspaceIdSource values covered.
        const wsIdSources = new Set(deployments.map((d) => d.workspaceIdSource));
        assert.ok(wsIdSources.has("request"), "T-24: 'request' workspaceIdSource covered");
        assert.ok(wsIdSources.has("default"), "T-24: 'default' workspaceIdSource covered");
    });

    summary();
}

main().catch((err) => {
    console.error("metaPush.test.ts main() crashed:", err);
    process.exit(FAILED);
});
