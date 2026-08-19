// functions/src/__tests__/metaPushPack.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 — contract test for the workspace-routed metaPushCreativePack
// callable. Covers:
//
//   T-16 — Every item in a pack shares one workspace's ad account and
//          Page (FR-016). The workspace is resolved ONCE for the whole
//          pack; every subsequent item reuses the same account and Page.
//
// Strategy: the in-memory Firestore stub from workspace.test.ts. The
// pack impl is invoked once with an image + copy + workspaceId. We
// assert:
//   - the upload URL targets the workspace's account,
//   - the /adcreatives URL also targets the same account,
//   - the recorded deployment carries that single workspaceId for the
//     whole pack (FR-016 — no per-item re-resolution).
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
    console.log(`metaPushPack tests: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log("Failures:");
        failures.forEach((f) => console.log(`  - ${f}`));
    }
    console.log("=".repeat(60));
    process.exit(failed > 0 ? FAILED : PASSED);
}

// ─── In-memory Firestore stub ────────────────────────────────────────────────

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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { metaPushCreativePackImpl } = require("../index.js");

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-meta-app-secret";

function encryptTestToken(plaintext: string, secret: string): string {
    const key = crypto.scryptSync(secret, "proadsai-salt", 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function makeFakeFetch(responses: Array<{ match: (u: string) => boolean; body: any }>): {
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
        for (const r of responses) {
            if (r.match(url)) {
                return new Response(JSON.stringify(r.body), { status: 200 });
            }
        }
        return new Response(JSON.stringify({ error: { message: "no match in fake" } }), { status: 500 });
    }) as unknown as typeof fetch;
    return { fetch: fetchImpl, calls };
}

function ownerScope(allowedWorkspaceIds: string[] | "ALL" = "ALL") {
    return {
        ownerUid: "owner-1",
        callerUid: "owner-1",
        allowedWorkspaceIds,
        storedWorkspaceAccess: [],
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function main() {
    await run("T-16: pack targets the workspace's account for upload AND adcreatives", async () => {
        resetStub();
        // Two workspaces on the same account — only ws-pack has its
        // Page; the other's Page is CLEARED so we can prove the pack
        // picks the named workspace.
        bucket("metaConnections").set("owner-1", {
            encryptedToken: encryptTestToken("fake-token", TEST_SECRET),
            adAccounts: [
                { id: "act_PACK", name: "Pack account" },
                { id: "act_OTHER", name: "Other account" },
            ],
            selectedAccountId: "act_OTHER", // BUG 3 — pack must IGNORE this
            selectedPageId: "page-legacy",
            selectedPageName: "Legacy Page",
            pages: [
                { id: "page-pack", name: "Pack Page" },
                { id: "page-legacy", name: "Legacy Page" },
            ],
        });
        const wsBucket = bucket("users/owner-1/workspaces");
        wsBucket.set("ws-pack", {
            name: "Pack Workspace",
            isDefault: true,
            createdAt: Date.parse("2026-06-01T00:00:00Z"),
            deletedAt: null,
            metaAdAccountId: "act_PACK",
            metaPageId: "page-pack",
            metaPageName: "Pack Page",
            metaPageClearedAt: null,
        });
        wsBucket.set("ws-other", {
            name: "Other Workspace",
            isDefault: false,
            createdAt: Date.parse("2026-06-02T00:00:00Z"),
            deletedAt: null,
            metaAdAccountId: "act_OTHER",
            metaPageId: "page-other",
            metaPageName: "Other Page",
            metaPageClearedAt: null,
        });
        const { fetch: impl, calls } = makeFakeFetch([
            {
                match: (u) => u.includes("/adimages"),
                body: { images: { "0": { hash: "pack-hash-abc" } } },
            },
            {
                match: (u) => u.includes("/adcreatives"),
                body: { id: "creative-123", name: "Pro Ads AI Creative" },
            },
        ]);
        const result = await metaPushCreativePackImpl(
            ownerScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                adName: "Pack ad",
                primaryText: "Pack primary text.",
                workspaceId: "ws-pack",
            },
            { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
        );
        assert.equal(result.success, true);
        assert.equal(result.workspaceId, "ws-pack");
        assert.equal(result.pageSource, "workspace");
        assert.equal(result.creativeId, "creative-123");
        // T-16: both upload AND /adcreatives hit the SAME workspace's
        // account (FR-016 — resolved once, reused for every item).
        const adImagesCall = calls.find((c) => c.url.includes("/adimages"));
        const adCreativesCall = calls.find((c) => c.url.includes("/adcreatives"));
        assert.ok(adImagesCall, "T-16: pack must hit /adimages");
        assert.ok(adCreativesCall, "T-16: pack must hit /adcreatives");
        assert.ok(
            adImagesCall!.url.includes("/act_PACK/adimages"),
            `T-16: /adimages must hit act_PACK. url=${adImagesCall!.url}`,
        );
        assert.ok(
            adCreativesCall!.url.includes("/act_PACK/adcreatives"),
            `T-16: /adcreatives must hit act_PACK. url=${adCreativesCall!.url}`,
        );
        assert.ok(
            !adImagesCall!.url.includes("act_OTHER"),
            `T-16: must NOT hit the other workspace's account. url=${adImagesCall!.url}`,
        );
        // The /adcreatives body uses the workspace's Page, NOT the
        // legacy fallback (FR-013).
        const spec = adCreativesCall!.body?.object_story_spec;
        assert.equal(
            spec?.page_id, "page-pack",
            "T-16: /adcreatives uses the workspace's Page, not the legacy fallback",
        );
        // The deployment record carries the FR-027 traceability fields.
        const deploy = [...bucket("creativeDeployments").values()][0] as DocData;
        assert.equal(deploy.workspaceId, "ws-pack");
        assert.equal(deploy.adAccountId, "act_PACK");
        assert.equal(deploy.pageId, "page-pack");
        assert.equal(deploy.pageSource, "workspace");
        assert.equal(deploy.workspaceIdSource, "request");
        assert.equal(deploy.userId, "owner-1");
        assert.equal(deploy.pushedByUid, "owner-1");
        assert.equal(deploy.pack, true);
    });

    await run("T-16b: pack accepts `activeWorkspaceId` as alias of `workspaceId`", async () => {
        resetStub();
        bucket("metaConnections").set("owner-1", {
            encryptedToken: encryptTestToken("fake-token", TEST_SECRET),
            adAccounts: [{ id: "act_LEGACY", name: "Legacy" }],
            selectedAccountId: "act_LEGACY",
            selectedPageId: null,
            selectedPageName: null,
            pages: [],
        });
        bucket("users/owner-1/workspaces").set("ws-legacy", {
            name: "Legacy Workspace",
            isDefault: true,
            createdAt: Date.parse("2026-06-01T00:00:00Z"),
            deletedAt: null,
            metaAdAccountId: "act_WS_LEGACY",
            metaPageId: null,
            metaPageName: null,
            metaPageClearedAt: null,
        });
        const { fetch: impl, calls } = makeFakeFetch([
            { match: (u) => u.includes("/adimages"), body: { images: { "0": { hash: "h" } } } },
        ]);
        const result = await metaPushCreativePackImpl(
            ownerScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                adName: "Pack",
                primaryText: "copy",
                activeWorkspaceId: "ws-legacy", // back-compat alias
            },
            { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
        );
        assert.equal(result.workspaceId, "ws-legacy");
        assert.ok(
            calls[0].url.includes("/act_WS_LEGACY/adimages"),
            `T-16b: activeWorkspaceId alias targets ws-legacy's account. url=${calls[0].url}`,
        );
    });

    summary();
}

main().catch((err) => {
    console.error("metaPushPack.test.ts main() crashed:", err);
    process.exit(FAILED);
});
