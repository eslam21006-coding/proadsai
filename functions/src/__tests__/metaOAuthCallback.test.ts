// functions/src/__tests__/metaOAuthCallback.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 — contract test for the OAuth callback identity resolution.
//
//   T-15 (T058) — A callback carrying a member identity writes to the
//                 owner's connection record (FR-020a-i). The
//                 `connectedByUid` audit field carries the original
//                 caller (the team member) so the audit log shows
//                 who actually authorised.
//
// Strategy: the in-memory Firestore stub from workspace.test.ts.
// `metaOAuthCallbackImpl` is invoked directly with a fake fetch
// implementation that returns canned short-lived + long-lived token
// responses plus canned /me/adaccounts and /me/accounts lists.
// The Admin SDK is stubbed so `metaConnections/{ownerUid}` is the
// only Firestore write the impl performs.
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
    console.log(`metaOAuthCallback tests: ${passed} passed, ${failed} failed`);
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

let failureMode = false;
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
    settings: () => stubFirestore(),
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { metaOAuthCallbackImpl } = require("../index.js");

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface FetchCall {
    url: string;
}

function makeFakeFetch(responses: Array<{ match: (u: string) => boolean; body: any }>): {
    fetch: typeof fetch;
    calls: FetchCall[];
} {
    const calls: FetchCall[] = [];
    const fetchImpl: typeof fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push({ url });
        for (const r of responses) {
            if (r.match(url)) {
                return new Response(JSON.stringify(r.body), { status: 200 });
            }
        }
        return new Response(JSON.stringify({ error: { message: "no match in fake" } }), { status: 500 });
    }) as unknown as typeof fetch;
    return { fetch: fetchImpl, calls };
}

function setupOwnerUserDoc() {
    bucket("users").set("owner-1", {});
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

const TEST_APP_ID = "test-meta-app-id";
const TEST_APP_SECRET = "test-meta-app-secret";

function fakeFetchForHappyPath() {
    return makeFakeFetch([
        {
            match: (u) => u.includes("/oauth/access_token") && u.includes("code="),
            body: { access_token: "short-lived-token", expires_in: 3600 },
        },
        {
            match: (u) => u.includes("grant_type=fb_exchange_token"),
            body: { access_token: "long-lived-token", expires_in: 5184000 },
        },
        {
            match: (u) => u.includes("/me/adaccounts"),
            body: {
                data: [
                    { id: "act_1", name: "Account 1", account_status: 1, currency: "USD", timezone_name: "UTC" },
                ],
            },
        },
        {
            match: (u) => u.includes("/me/accounts"),
            body: {
                data: [
                    { id: "page_1", name: "Page 1", picture: { data: { url: null } }, fan_count: 100, category: "Business" },
                ],
            },
        },
    ]);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function main() {
    // ─── T-15: team member's callback writes to the owner's connection record ───
    await run("T-15: team-member OAuth callback writes to owner-1 (not member-1)", async () => {
        resetStub();
        setFailureMode(false);
        setupOwnerUserDoc();
        setupTeamMemberUserDoc("member-1", "owner-1");
        setupTeamMemberDoc("member-1", "owner-1");

        const { fetch: impl, calls } = fakeFetchForHappyPath();
        const result = await metaOAuthCallbackImpl(
            "member-1", // state value is the team member's uid (the original caller)
            "oauth-code-123",
            { fetchImpl: impl, metaAppIdValue: TEST_APP_ID, metaAppSecretValue: TEST_APP_SECRET },
        );

        // T-15: callback resolves the member-1 state to owner-1 and
        // writes the connection under `metaConnections/owner-1`.
        assert.equal(result.ok, true, "T-15: callback returns ok=true");
        assert.equal(result.ownerUid, "owner-1", "T-15: ownerUid resolves to owner-1, NOT member-1");
        assert.equal(result.connectedByUid, "member-1", "T-15: connectedByUid records the original team member caller");

        // Verify the Firestore write landed at `metaConnections/owner-1`,
        // NOT at `metaConnections/member-1`.
        const ownerConn = bucket("metaConnections").get("owner-1") as DocData;
        const memberConn = bucket("metaConnections").get("member-1");
        assert.ok(ownerConn, "T-15: metaConnections/owner-1 was written");
        assert.equal(memberConn, undefined, "T-15: metaConnections/member-1 was NOT written (FR-002 / SC-009)");
        assert.equal(ownerConn.userId, "owner-1");
        assert.equal(ownerConn.connectedByUid, "member-1", "T-15: connectedByUid is the team member, not the owner");

        // The owner is the resolution target; ad accounts + pages land
        // on the owner's record.
        assert.equal(ownerConn.adAccounts.length, 1);
        assert.equal(ownerConn.pages.length, 1);
        // 4 Meta Graph calls were issued (token + long-lived token +
        // /me/adaccounts + /me/accounts).
        assert.equal(calls.length, 4);
    });

    // ─── readDegraded → no write (FR-003 / T072) ───
    await run("OAuth: readDegraded → result.ok=false, reason='read_degraded', nothing written", async () => {
        resetStub();
        setFailureMode(true); // Firestore read fails during resolveCallerScope.
        // No owner user doc set; the stub returns exists:false and the
        // owner-side `getDoc` path of resolveCallerScope does NOT throw,
        // so we need the explicit failure mode to trigger readDegraded.
        setupTeamMemberUserDoc("member-1", "owner-1");

        const { fetch: impl } = fakeFakeFetchForHappyPath();
        const result = await metaOAuthCallbackImpl(
            "member-1",
            "oauth-code",
            { fetchImpl: impl, metaAppIdValue: TEST_APP_ID, metaAppSecretValue: TEST_APP_SECRET },
        );
        assert.equal(result.ok, false, "T-072: readDegraded → ok=false");
        assert.equal(result.reason, "read_degraded", "T-072: reason=read_degraded");
        // No Firestore writes happened because the stub threw on every
        // collection().doc().set() call too.
        assert.equal(bucket("metaConnections").size, 0, "T-072: nothing written");
    });
}

function fakeFakeFetchForHappyPath() {
    return fakeFetchForHappyPath();
}

main().catch((err) => {
    console.error("metaOAuthCallback.test.ts main() crashed:", err);
    process.exit(FAILED);
});
