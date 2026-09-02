// functions/src/__tests__/whatsWorkingDashboardScope.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 caller-scope regression guard for whatsWorkingDashboard.ts.
//
// WHY THIS FILE EXISTS
// --------------------
// Both callables in whatsWorkingDashboard.ts were missed by the original
// Phase 967 conversion. They read `request.auth.uid` directly and built
// `users/{uid}/workspaces/{wid}` from it, so a TEAM MEMBER caller resolved
// to their own (empty) user document. Every call threw
// `HttpsError("not-found", "Workspace not found.")` → HTTP 404, which the
// frontend rendered as "Could not load the dashboard."
//
// This is the second time this bug class has shipped, so the assertion here
// is structural rather than example-based: drive each impl with a scope
// whose `callerUid` differs from its `ownerUid`, record EVERY Firestore path
// touched, and fail if any path contains the caller's uid.
//
// Follows the shared pattern from metaScope.integration.test.ts: an
// in-memory Firestore stub with path recording, driving the extracted
// `*Impl` functions with a fake `scope`.
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
    console.log(`whatsWorkingDashboardScope tests: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log("Failures:");
        failures.forEach((f) => console.log(`  - ${f}`));
    }
    console.log("=".repeat(60));
    process.exit(failed > 0 ? FAILED : PASSED);
}

// ─── In-memory Firestore stub with path recording ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin: any = require("firebase-admin");

type DocData = Record<string, any>;
const stubStore: Record<string, Map<string, DocData>> = {};
function bucket(path: string): Map<string, DocData> {
    if (!stubStore[path]) stubStore[path] = new Map();
    return stubStore[path];
}

const pathsAccessed: string[] = [];

class StubDocRef {
    constructor(public path: string, public id: string, private store: Map<string, DocData>) {}
    async get() {
        pathsAccessed.push(this.path);
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
    where() { return this; }
    limit() { return this; }
    orderBy() { return this; }
    async get() {
        pathsAccessed.push(this.path);
        const entries = [...this.store.entries()];
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
    doc: (path: string) => {
        const segs = path.split("/");
        const id = segs.pop() as string;
        return new StubDocRef(path, id, bucket(segs.join("/")));
    },
});

Object.defineProperty(admin, "firestore", { value: stubFirestore, writable: true, configurable: true });
admin.firestore.FieldValue = { serverTimestamp: () => Date.now(), increment: (n: number) => n };
Object.defineProperty(admin, "initializeApp", { value: () => ({}), writable: true, configurable: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    getWhatsWorkingDashboardImpl,
    getHookAnglePerformanceImpl,
} = require("../whatsWorkingDashboard.js");

// ─── Fixtures ──────────────────────────────────────────────────────────────

const OWNER = "owner_uid_AAAA";
const MEMBER = "member_uid_BBBB";
const WS = "ws_123";
const ACCT = "act_999";

/** A team-member scope: caller differs from owner, all-access per ISSUE-D. */
function memberScope() {
    return {
        ownerUid: OWNER,
        callerUid: MEMBER,
        allowedWorkspaceIds: "ALL" as const,
        storedWorkspaceAccess: [],
    };
}

function seedOwnerWorkspace() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
    pathsAccessed.length = 0;
    // The workspace exists ONLY under the owner — exactly the production
    // shape that made the raw-uid version throw not-found.
    bucket(`users/${OWNER}/workspaces`).set(WS, { name: "Lina", metaAdAccountId: ACCT });
    bucket(`users/${OWNER}/workspaces/${WS}/private`).set("metaConnection", {
        metaConnected: true, lastMetaSyncAt: Date.now(),
    });
}

/** Every impl in whatsWorkingDashboard.ts, driven identically. */
const IMPLS: Array<{ name: string; fn: (scope: unknown, data: unknown) => Promise<unknown> }> = [
    { name: "getWhatsWorkingDashboardImpl", fn: getWhatsWorkingDashboardImpl },
    { name: "getHookAnglePerformanceImpl", fn: getHookAnglePerformanceImpl },
];

// ─── Tests ─────────────────────────────────────────────────────────────────

async function main() {
    console.log("\nwhatsWorkingDashboard — Phase 967 caller-scope conversion\n");

    // Guard against the file growing a third callable that silently skips
    // the conversion. If you add one, add it to IMPLS.
    await run("every exported *Impl in the module is covered by this test", async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require("../whatsWorkingDashboard.js");
        const exportedImpls = Object.keys(mod).filter((k) => /Impl$/.test(k));
        const covered = IMPLS.map((i) => i.name).sort();
        assert.deepEqual(
            exportedImpls.sort(),
            covered,
            `uncovered *Impl exports found: ${exportedImpls.filter((n) => !covered.includes(n)).join(", ")}`,
        );
    });

    for (const impl of IMPLS) {
        await run(`${impl.name}: a team-member caller resolves to the owner (no throw)`, async () => {
            seedOwnerWorkspace();
            // Before the fix this threw HttpsError("not-found") because the
            // lookup used the caller's uid.
            await impl.fn(memberScope(), { workspaceId: WS, accountId: ACCT });
        });

        await run(`${impl.name}: never touches a path containing the caller uid`, async () => {
            seedOwnerWorkspace();
            await impl.fn(memberScope(), { workspaceId: WS, accountId: ACCT });
            const leaked = pathsAccessed.filter((p) => p.includes(MEMBER));
            assert.equal(
                leaked.length, 0,
                `caller-uid paths leaked: ${leaked.slice(0, 5).join(", ")}`,
            );
        });

        await run(`${impl.name}: every user path it touches is the owner's`, async () => {
            seedOwnerWorkspace();
            await impl.fn(memberScope(), { workspaceId: WS, accountId: ACCT });
            const userPaths = pathsAccessed.filter((p) => p.startsWith("users/"));
            assert.ok(userPaths.length > 0, "expected at least one users/ path");
            for (const p of userPaths) {
                assert.ok(
                    p.startsWith(`users/${OWNER}/`),
                    `path is not owner-scoped: ${p}`,
                );
            }
        });

        await run(`${impl.name}: an owner calling for themselves still works`, async () => {
            seedOwnerWorkspace();
            const ownerScope = {
                ownerUid: OWNER, callerUid: OWNER,
                allowedWorkspaceIds: "ALL" as const, storedWorkspaceAccess: [],
            };
            await impl.fn(ownerScope, { workspaceId: WS, accountId: ACCT });
            assert.equal(pathsAccessed.filter((p) => p.includes(MEMBER)).length, 0);
        });

        await run(`${impl.name}: a workspace outside the caller's scope is refused`, async () => {
            seedOwnerWorkspace();
            const scoped = {
                ownerUid: OWNER, callerUid: MEMBER,
                allowedWorkspaceIds: ["some_other_ws"], storedWorkspaceAccess: ["some_other_ws"],
            };
            await assert.rejects(
                () => impl.fn(scoped, { workspaceId: WS, accountId: ACCT }),
                (err: any) => err.code === "permission-denied"
                    || /permission|not permitted/i.test(String(err.message)),
                "expected permission-denied for an out-of-scope workspace",
            );
        });

        await run(`${impl.name}: rejects a malformed request before any read`, async () => {
            seedOwnerWorkspace();
            await assert.rejects(
                () => impl.fn(memberScope(), { workspaceId: WS }),
                (err: any) => err.code === "invalid-argument"
                    || /required/i.test(String(err.message)),
            );
            assert.equal(pathsAccessed.length, 0, "no Firestore read may happen on a malformed request");
        });
    }

    summary();
}

void main();
