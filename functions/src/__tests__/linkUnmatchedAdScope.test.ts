// functions/src/__tests__/linkUnmatchedAdScope.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 caller-scope regression guard for linkUnmatchedAd.ts.
//
// WHY THIS FILE EXISTS
// --------------------
// `linkUnmatchedAd` is the manual-link path on the "What's Working"
// dashboard. Per spec §4.3 a manual link is the ONLY way to recover a
// matched ad — auto-match is forbidden from overwriting a manual one, and
// every sync snapshot has had `matched: 0` for the dashboard's own data
// (so manual linking is currently the only viable path).
//
// It was missed by the original Phase 967 conversion: it read
// `request.auth.uid` directly and built
// `users/{uid}/workspaces/{wid}/adAccounts/{aid}/adPerformance/{adId}`
// from it. A TEAM MEMBER caller therefore resolved to their OWN (empty)
// `users/{memberUid}/...` ad performance doc, and the
// `existingSnap.exists` branch was always false — so the dashboard
// created a brand-new manual-link record under the MEMBER's own
// identity, on the OWNER's workspace. The precedence rule (spec §4.3)
// was intact; the scope was wrong.
//
// The original write additionally checked `genData.userId !== uid`,
// which a team member's call could never satisfy either, so the
// generation-ownership guard was also unreachable for the legitimate
// team-member path.
//
// This is the THIRD instance of this bug class this round has shipped
// (after `whatsWorkingDashboard.ts`). The assertion here is therefore
// structural: drive the impl with a scope whose `callerUid` differs
// from its `ownerUid`, record EVERY Firestore path touched, and fail
// if any path contains the caller's uid. The impl MUST also accept a
// team-member caller for the legitimate case (a verified member is
// the intended caller of manual linking on the owner's workspaces).
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
    console.log(`linkUnmatchedAdScope tests: ${passed} passed, ${failed} failed`);
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
    async set(data: DocData, opts?: { merge?: boolean }) {
        pathsAccessed.push(this.path);
        if (opts?.merge) {
            const cur = this.store.get(this.id) ?? {};
            this.store.set(this.id, { ...cur, ...data });
        } else {
            this.store.set(this.id, data);
        }
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
const { linkUnmatchedAdImpl } = require("../linkUnmatchedAd.js");

// ─── Fixtures ──────────────────────────────────────────────────────────────

const OWNER = "owner_uid_AAAA";
const MEMBER = "member_uid_BBBB";
const WS = "ws_123";
const ACCT = "act_999";
const AD = "ad_42";
const GEN = "gen_42";

/** A team-member scope: caller differs from owner, all-access per ISSUE-D. */
function memberScope() {
    return {
        ownerUid: OWNER,
        callerUid: MEMBER,
        allowedWorkspaceIds: "ALL" as const,
        storedWorkspaceAccess: [],
    };
}

/** Owner calling for themselves — should still work. */
function ownerScope() {
    return {
        ownerUid: OWNER,
        callerUid: OWNER,
        allowedWorkspaceIds: "ALL" as const,
        storedWorkspaceAccess: [],
    };
}

/**
 * Seed a generation under the OWNER (this is how generations are
 * stored in production — `feedbackService.saveGeneration` runs in
 * the OWNER's auth context) and an ad-performance doc under the
 * OWNER's workspace (the sync path wrote it there).
 */
function seedLinkedFixtures() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
    pathsAccessed.length = 0;
    bucket("generations").set(GEN, {
        userId: OWNER,
        workspaceId: WS,
        imageFingerprint: "deadbeef",
    });
    bucket(`users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/adPerformance`).set(AD, {
        adId: AD,
        matchType: null,
    });
}

/**
 * Seed a generation that belongs to a DIFFERENT workspace — this is
 * the cross-workspace guard: the impl MUST refuse to link even when
 * the caller is the owner.
 */
function seedCrossWorkspaceGeneration() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
    pathsAccessed.length = 0;
    bucket("generations").set(GEN, {
        userId: OWNER,
        workspaceId: "ws_other_workspace",
    });
    bucket(`users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/adPerformance`).set(AD, {
        adId: AD,
    });
}

// ─── Tests ─────────────────────────────────────────────────────────────────

async function main() {
    console.log("\nlinkUnmatchedAd — Phase 967 caller-scope conversion\n");

    // Guard against the file growing a third callable that silently skips
    // the conversion. If you add one, add it to IMPLS.
    await run("every exported *Impl in the module is covered by this test", async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require("../linkUnmatchedAd.js");
        const exportedImpls = Object.keys(mod).filter((k) => /Impl$/.test(k));
        const covered = ["linkUnmatchedAdImpl"].sort();
        assert.deepEqual(
            exportedImpls.sort(),
            covered,
            `uncovered *Impl exports found: ${exportedImpls.filter((n) => !covered.includes(n)).join(", ")}`,
        );
    });

    await run("team-member caller: resolves to the owner (no throw, write succeeds)", async () => {
        seedLinkedFixtures();
        // Before the fix the generation-ownership check
        // `genData.userId !== uid` failed for a team member even on
        // the legitimate path, so the call threw permission-denied
        // even though `LinkAdPickerModal` was the intended entry point
        // for team members.
        const result = await linkUnmatchedAdImpl(memberScope(), {
            workspaceId: WS,
            accountId: ACCT,
            adId: AD,
            generationId: GEN,
        });
        assert.equal(result.ok, true);
        assert.equal(result.matchType, "manual");
    });

    await run("team-member caller: write lands under the OWNER, not the member", async () => {
        seedLinkedFixtures();
        await linkUnmatchedAdImpl(memberScope(), {
            workspaceId: WS,
            accountId: ACCT,
            adId: AD,
            generationId: GEN,
        });
        const ownerDoc = bucket(`users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/adPerformance`).get(AD) as any;
        assert.ok(ownerDoc, "expected the owner-scoped ad doc to be written");
        assert.equal(ownerDoc.matchType, "manual");
        assert.equal(ownerDoc.generationId, GEN);
        // Audit signal — the team-member's uid is recorded as the
        // initiator, not as the path.
        assert.equal(ownerDoc.matchedByUid, MEMBER);

        // And it MUST NOT have leaked under the member's identity.
        const memberDoc = bucket(`users/${MEMBER}/workspaces/${WS}/adAccounts/${ACCT}/adPerformance`)?.get(AD);
        assert.equal(memberDoc, undefined, "member-scoped ad doc must NOT exist");
    });

    await run("team-member caller: never touches a path containing the caller uid", async () => {
        seedLinkedFixtures();
        await linkUnmatchedAdImpl(memberScope(), {
            workspaceId: WS,
            accountId: ACCT,
            adId: AD,
            generationId: GEN,
        });
        const leaked = pathsAccessed.filter((p) => p.includes(MEMBER));
        assert.equal(
            leaked.length, 0,
            `caller-uid paths leaked: ${leaked.slice(0, 5).join(", ")}`,
        );
    });

    await run("team-member caller: every user path it touches is the owner's", async () => {
        seedLinkedFixtures();
        await linkUnmatchedAdImpl(memberScope(), {
            workspaceId: WS,
            accountId: ACCT,
            adId: AD,
            generationId: GEN,
        });
        const userPaths = pathsAccessed.filter((p) => p.startsWith("users/"));
        assert.ok(userPaths.length > 0, "expected at least one users/ path");
        for (const p of userPaths) {
            assert.ok(
                p.startsWith(`users/${OWNER}/`),
                `path is not owner-scoped: ${p}`,
            );
        }
    });

    await run("owner calling for themselves still works", async () => {
        seedLinkedFixtures();
        const result = await linkUnmatchedAdImpl(ownerScope(), {
            workspaceId: WS,
            accountId: ACCT,
            adId: AD,
            generationId: GEN,
        });
        assert.equal(result.ok, true);
        assert.equal(
            pathsAccessed.filter((p) => p.includes(MEMBER)).length,
            0,
        );
    });

    await run("workspace outside the caller's scope is refused", async () => {
        seedLinkedFixtures();
        const scoped = {
            ownerUid: OWNER,
            callerUid: MEMBER,
            allowedWorkspaceIds: ["some_other_ws"],
            storedWorkspaceAccess: ["some_other_ws"],
        };
        await assert.rejects(
            () => linkUnmatchedAdImpl(scoped, {
                workspaceId: WS,
                accountId: ACCT,
                adId: AD,
                generationId: GEN,
            }),
            (err: any) => err.code === "permission-denied"
                || /permission|not permitted/i.test(String(err.message)),
            "expected permission-denied for an out-of-scope workspace",
        );
        // And no Firestore read may have happened — workspace gate is
        // FIRST in the impl, before any side effect.
        assert.equal(pathsAccessed.length, 0, "no Firestore read may happen on an out-of-scope workspace");
    });

    await run("rejects a malformed request before any read", async () => {
        seedLinkedFixtures();
        await assert.rejects(
            () => linkUnmatchedAdImpl(memberScope(), {
                workspaceId: WS,
                accountId: ACCT,
                // adId and generationId missing
            }),
            (err: any) => err.code === "invalid-argument"
                || /required/i.test(String(err.message)),
        );
        assert.equal(pathsAccessed.length, 0, "no Firestore read may happen on a malformed request");
    });

    await run("cross-workspace generation is refused (FR-023 closure)", async () => {
        seedCrossWorkspaceGeneration();
        // Belongs to ws_other_workspace;
        // request asks for ws_123. Even the owner must be refused here.
        await assert.rejects(
            () => linkUnmatchedAdImpl(ownerScope(), {
                workspaceId: WS,
                accountId: ACCT,
                adId: AD,
                generationId: GEN,
            }),
            (err: any) => err.code === "permission-denied"
                || /different workspace/i.test(String(err.message)),
            "expected permission-denied for a cross-workspace generation",
        );
        // The owner's ad performance doc MUST NOT have been written.
        const ownerDoc = bucket(`users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/adPerformance`).get(AD) as any;
        // The seed had no `matchType`, so a refusal means `matchType`
        // stays absent — the impl never wrote `matchType: "manual"`.
        assert.notEqual(ownerDoc?.matchType, "manual");
    });

    await run("missing generation is refused with not-found", async () => {
        for (const k of Object.keys(stubStore)) stubStore[k].clear();
        pathsAccessed.length = 0;
        await assert.rejects(
            () => linkUnmatchedAdImpl(ownerScope(), {
                workspaceId: WS,
                accountId: ACCT,
                adId: AD,
                generationId: "gen_does_not_exist",
            }),
            (err: any) => err.code === "not-found"
                || /does not exist/i.test(String(err.message)),
        );
    });

    await run("generation belonging to a different OWNER is refused", async () => {
        // Same workspace, but `userId` is a third party — neither the
        // owner nor the team member. Belt-and-braces alongside FR-023.
        for (const k of Object.keys(stubStore)) stubStore[k].clear();
        pathsAccessed.length = 0;
        bucket("generations").set(GEN, {
            userId: "some_other_owner",
            workspaceId: WS,
        });
        await assert.rejects(
            () => linkUnmatchedAdImpl(ownerScope(), {
                workspaceId: WS,
                accountId: ACCT,
                adId: AD,
                generationId: GEN,
            }),
            (err: any) => err.code === "permission-denied"
                || /does not belong/i.test(String(err.message)),
        );
    });

    summary();
}

void main();
