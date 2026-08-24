// functions/src/__tests__/metaScope.integration.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 — integration tests for the "team member acts on the
// owner's account" invariant across every callable Phase 5
// converts (FR-001, FR-002, SC-009).
//
//   T-01 (T057) — A team member call reads/writes owner paths only.
//                 Every Firestore path observed during a full team-
//                 member pass targets `users/{ownerUid}/...` or
//                 `metaConnections/{ownerUid}` — never
//                 `users/{memberUid}/...` or
//                 `metaConnections/{memberUid}`.
//   T059      — No `metaConnections/{memberUid}` record exists after
//                the same pass. SC-009 closure: a team member's Meta
//                actions never create a connection record under
//                their own identity.
//
// Strategy: drive every extracted impl function with a fake
// `scope` whose `callerUid` is a team member and whose `ownerUid`
// is the team owner. The in-memory Firestore stub records every
// path the impl reads or writes. After the pass, assert every
// recorded path either:
//   1. starts with `users/{ownerUid}/...`, OR
//   2. equals `metaConnections/{ownerUid}` (the connection doc), OR
//   3. is one of the well-known shared collections
//      (`creativeDeployments`, `adPerformance`, `metaSync*`) that
//      are owner-scoped via their `userId` field.
//
// The pass exercises one publish (single + pack), one Page selection,
// one connection read, and the OAuth callback. Together these cover
// every Firestore path the Phase 5 conversions touch. The
// funnelSettings + connectMetaAccount + triggerMetaSync callable
// conversions (T064-T069) follow the same pattern — they all read
// `users/{scope.ownerUid}/workspaces/{wid}` and never
// `users/{scope.callerUid}/...` — and are spot-checked by the
// workspace-level assertions in workspace.test.ts /
// metaCallerScope.test.ts already.
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
    console.log(`metaScope.integration tests: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log("Failures:");
        failures.forEach((f) => console.log(`  - ${f}`));
    }
    console.log("=".repeat(60));
    process.exit(failed > 0 ? FAILED : PASSED);
}

// ─── In-memory Firestore stub with path-recording ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin: any = require("firebase-admin");

type DocData = Record<string, any>;
const stubStore: Record<string, Map<string, DocData>> = {};
function bucket(path: string): Map<string, DocData> {
    if (!stubStore[path]) stubStore[path] = new Map();
    return stubStore[path];
}

// Track every path the stub sees.
const pathsAccessed: string[] = [];

class StubDocRef {
    constructor(public path: string, public id: string, private store: Map<string, DocData>) {}
    async get() {
        pathsAccessed.push(`${this.path}/${this.id}#get`);
        const data = this.store.get(this.id);
        return {
            exists: data !== undefined,
            data: () => data ?? undefined,
            id: this.id,
            ref: this,
        };
    }
    async set(data: DocData) {
        pathsAccessed.push(`${this.path}/${this.id}#set`);
        this.store.set(this.id, data);
    }
    async update(patch: DocData) {
        pathsAccessed.push(`${this.path}/${this.id}#update`);
        const cur = this.store.get(this.id) ?? {};
        this.store.set(this.id, { ...cur, ...patch });
    }
    async delete() {
        pathsAccessed.push(`${this.path}/${this.id}#delete`);
        this.store.delete(this.id);
    }
}

class StubCollection {
    constructor(public path: string, public store: Map<string, DocData>) {}
    doc(id?: string) {
        const docId = id ?? `auto_${Math.random().toString(36).slice(2, 10)}`;
        pathsAccessed.push(`${this.path}/${docId}#doc`);
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
        pathsAccessed.push(`${this.path}#list`);
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
    pathsAccessed.length = 0;
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
    metaPushCreativeImpl,
    metaPushCreativePackImpl,
    metaSelectPageImpl,
    getMetaConnectionImpl,
    metaOAuthCallbackImpl,
} = require("../index.js");

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

function setupOwnerConnection(opts: { selectedAccountId?: string | null } = {}) {
    bucket("metaConnections").set("owner-1", {
        encryptedToken: encryptTestToken("fake-token", TEST_SECRET),
        adAccounts: [
            { id: "act_WS_A", name: "Account A" },
            { id: "act_WS_B", name: "Account B" },
        ],
        selectedAccountId: opts.selectedAccountId ?? "act_WS_A",
        selectedPageId: "page-legacy",
        selectedPageName: "Legacy Page",
        pages: [
            { id: "page-legacy", name: "Legacy Page" },
            { id: "page-A", name: "Page A" },
        ],
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
}

function setupWorkspace(opts: {
    id: string;
    name?: string;
    metaAdAccountId?: string | null;
    isDefault?: boolean;
    metaPageId?: string | null;
    metaPageName?: string | null;
    metaPageClearedAt?: number | null;
}) {
    bucket("users/owner-1/workspaces").set(opts.id, {
        name: opts.name ?? opts.id,
        isDefault: opts.isDefault ?? false,
        createdAt: Date.parse("2026-06-01T00:00:00Z"),
        deletedAt: null,
        metaAdAccountId: opts.metaAdAccountId ?? null,
        metaPageId: opts.metaPageId ?? null,
        metaPageName: opts.metaPageName ?? null,
        metaPageClearedAt: opts.metaPageClearedAt ?? null,
    });
}

function setupTeamMemberUserDoc(memberUid: string, ownerUid: string) {
    bucket("users").set(memberUid, {
        isTeamMember: true,
        teamOwnerUid: ownerUid,
    });
}

function setupTeamMemberDoc(memberUid: string, ownerUid: string) {
    bucket(`users/${ownerUid}/team`).set(`member-1`, {
        uid: memberUid,
        workspaceAccess: [],
    });
}

function memberScope(allowedWorkspaceIds: string[] | "ALL" = "ALL"): {
    ownerUid: string;
    callerUid: string;
    allowedWorkspaceIds: string[] | "ALL";
    storedWorkspaceAccess: string[];
} {
    return {
        ownerUid: "owner-1",
        callerUid: "member-1",
        allowedWorkspaceIds,
        storedWorkspaceAccess: [],
    };
}

function fakeFetchUpload(): { fetch: typeof fetch; calls: { url: string }[] } {
    const calls: { url: string }[] = [];
    const fetchImpl: typeof fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push({ url });
        if (url.includes("/adimages")) {
            return new Response(JSON.stringify({ images: { "0": { hash: "h" } } }), { status: 200 });
        }
        if (url.includes("/adcreatives")) {
            return new Response(JSON.stringify({ id: "creative-1" }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { message: "no match" } }), { status: 500 });
    }) as unknown as typeof fetch;
    return { fetch: fetchImpl, calls };
}

function fakeFetchOAuth(): { fetch: typeof fetch } {
    const fetchImpl: typeof fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("code=") && url.includes("/oauth/access_token")) {
            return new Response(JSON.stringify({ access_token: "short", expires_in: 3600 }), { status: 200 });
        }
        if (url.includes("grant_type=fb_exchange_token")) {
            return new Response(JSON.stringify({ access_token: "long", expires_in: 5184000 }), { status: 200 });
        }
        if (url.includes("/me/adaccounts")) {
            return new Response(JSON.stringify({ data: [{ id: "act_1", name: "A1", account_status: 1, currency: "USD", timezone_name: "UTC" }] }), { status: 200 });
        }
        if (url.includes("/me/accounts")) {
            return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { message: "no match" } }), { status: 500 });
    }) as unknown as typeof fetch;
    return { fetch: fetchImpl };
}

function recordPathsBefore(): string[] {
    return [...pathsAccessed];
}

function newPathsSince(before: string[]): string[] {
    return pathsAccessed.slice(before.length);
}

function assertAllOwnerPaths(newPaths: string[]): void {
    // Only WRITE paths are asserted — reads to `users/{callerUid}` are
    // expected (the team-member lookup at the top of `resolveCallerScope`
    // MUST read the caller's own user doc to determine whether they are
    // a team member; that is the FR-001 design). What we forbid is a
    // WRITE to a member-scoped path, which would mean a team member's
    // action leaked under their own identity.
    const ownerWriteAllowed = [
        /^users\/owner-1\//,
        /^metaConnections\/owner-1($|\/)/,
        /^creativeDeployments($|\/)/,
        /^adPerformance($|\/)/,
    ];
    const memberWriteForbidden = [
        /\/member-1\//,
        /^users\/member-1($|\/)/,
        /^metaConnections\/member-1($|\/)/,
    ];
    const writeMarkers = ["#set", "#update", "#delete"];
    const offenders: string[] = [];
    for (const p of newPaths) {
        if (!writeMarkers.some((m) => p.endsWith(m))) continue;
        if (memberWriteForbidden.some((re) => re.test(p))) {
            offenders.push(p);
            continue;
        }
        if (ownerWriteAllowed.some((re) => re.test(p))) continue;
        // Any other write path is unexpected.
        offenders.push(p);
    }
    if (offenders.length > 0) {
        throw new assert.AssertionError({
            message: `Non-owner-scoped Firestore WRITES observed:\n${offenders.join("\n")}`,
        });
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function main() {
    // ─── T-01: team member publish (single + pack) targets owner paths ───
    await run("T-01a: metaPushCreative — team member targets owner-1's connection + workspace", async () => {
        resetStub();
        setupTeamMemberUserDoc("member-1", "owner-1");
        setupTeamMemberDoc("member-1", "owner-1");
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-A", name: "Brand A",
            metaAdAccountId: "act_WS_A",
            isDefault: true,
        });

        const before = recordPathsBefore();
        const { fetch: impl } = fakeFetchUpload();
        await metaPushCreativeImpl(
            memberScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                adName: "Team member push",
                workspaceId: "ws-A",
            },
            { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
        );

        const newPaths = newPathsSince(before);
        assertAllOwnerPaths(newPaths);

        // T-01 — explicit assertions on what landed:
        const deployment = [...bucket("creativeDeployments").values()][0] as any;
        assert.equal(deployment.userId, "owner-1", "T-01: deployment userId is the owner");
        assert.equal(deployment.pushedByUid, "member-1", "T-01: pushedByUid is the team member");
        assert.equal(deployment.adAccountId, "act_WS_A", "T-01: workspace's ad account, not the legacy global");
    });

    await run("T-01b: metaPushCreativePack — team member targets owner-1 throughout", async () => {
        resetStub();
        setupTeamMemberUserDoc("member-1", "owner-1");
        setupTeamMemberDoc("member-1", "owner-1");
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-A", name: "Brand A",
            metaAdAccountId: "act_WS_A",
            isDefault: true,
            metaPageId: "page-A",
            metaPageName: "Page A",
        });

        const before = recordPathsBefore();
        const { fetch: impl } = fakeFetchUpload();
        await metaPushCreativePackImpl(
            memberScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                adName: "Pack",
                primaryText: "Pack copy",
                workspaceId: "ws-A",
            },
            { fetchImpl: impl, metaAppSecretValue: TEST_SECRET },
        );
        const newPaths = newPathsSince(before);
        assertAllOwnerPaths(newPaths);
    });

    // ─── T-01: metaSelectPage writes the workspace under owner-1 ───
    await run("T-01c: metaSelectPage — team member writes the owner's workspace", async () => {
        resetStub();
        setupTeamMemberUserDoc("member-1", "owner-1");
        setupTeamMemberDoc("member-1", "owner-1");
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-A", name: "Brand A",
            metaAdAccountId: "act_WS_A",
            isDefault: true,
            metaPageId: null,
        });

        const before = recordPathsBefore();
        await metaSelectPageImpl(
            memberScope(),
            { pageId: "page-A", pageName: "Page A", workspaceId: "ws-A" },
        );
        const newPaths = newPathsSince(before);
        assertAllOwnerPaths(newPaths);

        // The workspace write landed on users/owner-1/workspaces/ws-A,
        // not on users/member-1/...
        const ws = bucket("users/owner-1/workspaces").get("ws-A") as any;
        assert.equal(ws.metaPageId, "page-A");
        // The connection write landed on metaConnections/owner-1.
        const conn = bucket("metaConnections").get("owner-1") as any;
        assert.equal(conn.selectedPageId, "page-A");
    });

    // ─── T-01: getMetaConnection reads owner paths ───
    await run("T-01d: getMetaConnection — team member reads owner-1's connection", async () => {
        resetStub();
        setupTeamMemberUserDoc("member-1", "owner-1");
        setupTeamMemberDoc("member-1", "owner-1");
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-A", name: "Brand A",
            metaAdAccountId: "act_WS_A",
            isDefault: true,
            metaPageId: "page-A",
            metaPageName: "Page A",
        });

        const before = recordPathsBefore();
        const result = await getMetaConnectionImpl(memberScope(), { workspaceId: "ws-A" });
        const newPaths = newPathsSince(before);
        assertAllOwnerPaths(newPaths);

        assert.equal(result.connected, true);
        assert.equal(result.pageSource, "workspace");
        assert.equal(result.activePageId, "page-A");
    });

    // ─── T-01 + T-15: OAuth callback writes to owner-1 ───
    await run("T-01e + T-15: metaOAuthCallback — team-member state resolves to owner-1", async () => {
        resetStub();
        setupTeamMemberUserDoc("member-1", "owner-1");
        setupTeamMemberDoc("member-1", "owner-1");
        // The OAuth fake fetch returns one Page; preserve the existing
        // connection's pages list so later tests (T059) can pick a Page.
        bucket("metaConnections").set("owner-1", {
            encryptedToken: encryptTestToken("fake", TEST_SECRET),
            adAccounts: [{ id: "act_WS_A", name: "A" }],
            selectedAccountId: "act_WS_A",
            pages: [{ id: "page-A", name: "Page A" }],
            expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        });

        const before = recordPathsBefore();
        const { fetch: impl } = fakeFetchOAuth();
        const result = await metaOAuthCallbackImpl(
            "member-1", // state = team member uid
            "oauth-code",
            {
                fetchImpl: impl,
                metaAppIdValue: "test-app-id",
                metaAppSecretValue: TEST_SECRET,
            },
        );
        const newPaths = newPathsSince(before);
        assertAllOwnerPaths(newPaths);

        assert.equal(result.ok, true);
        assert.equal(result.ownerUid, "owner-1");
        assert.equal(result.connectedByUid, "member-1");

        // Verify metaConnections/owner-1 was written, NOT metaConnections/member-1.
        const ownerConn = bucket("metaConnections").get("owner-1") as any;
        const memberConn = bucket("metaConnections").get("member-1");
        assert.ok(ownerConn, "T-01e: metaConnections/owner-1 was written");
        assert.equal(memberConn, undefined, "T-01e: metaConnections/member-1 was NOT written");
    });

    // ─── T059 / SC-009: no metaConnections/{memberUid} exists after a full pass ───
    await run("T059: full team-member pass leaves no metaConnections/member-1 record", async () => {
        resetStub();
        setupTeamMemberUserDoc("member-1", "owner-1");
        setupTeamMemberDoc("member-1", "owner-1");
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-A", name: "Brand A",
            metaAdAccountId: "act_WS_A",
            isDefault: true,
        });

        // 1. getMetaConnection(workspaceId)
        await getMetaConnectionImpl(memberScope(), { workspaceId: "ws-A" });

        // 2. metaSelectPage (page id available on the connection)
        await metaSelectPageImpl(
            memberScope(),
            { pageId: "page-A", pageName: "Page A", workspaceId: "ws-A" },
        );

        // 3. metaPushCreative
        const { fetch: pushFetch } = fakeFetchUpload();
        await metaPushCreativeImpl(
            memberScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                adName: "Final push",
                workspaceId: "ws-A",
            },
            { fetchImpl: pushFetch, metaAppSecretValue: TEST_SECRET },
        );

        // 4. metaPushCreativePack
        const { fetch: packFetch } = fakeFetchUpload();
        await metaPushCreativePackImpl(
            memberScope(),
            {
                imageBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                adName: "Final pack",
                primaryText: "Pack copy",
                workspaceId: "ws-A",
            },
            { fetchImpl: packFetch, metaAppSecretValue: TEST_SECRET },
        );

        // SC-009 — no connection record under the member's own identity,
        // no matter which team-member callable runs.
        const memberConn = bucket("metaConnections").get("member-1");
        assert.equal(
            memberConn, undefined,
            "T059: metaConnections/member-1 must NOT exist after a full team-member pass",
        );

        // The owner's connection was preserved (and selectedPageId was
        // updated by metaSelectPage).
        const ownerConn = bucket("metaConnections").get("owner-1") as any;
        assert.ok(ownerConn, "T059: metaConnections/owner-1 exists");
        assert.equal(ownerConn.selectedPageId, "page-A");
    });

    summary();
}

main().catch((err) => {
    console.error("metaScope.integration.test.ts main() crashed:", err);
    process.exit(FAILED);
});
