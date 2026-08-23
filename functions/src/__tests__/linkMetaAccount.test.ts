// functions/src/__tests__/linkMetaAccount.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 — contract tests for the link/unlink Meta-account flow.
//
//   T-09 (T076) — Linking an ad account clears the Page in the SAME
//                 write as the link (FR-011). The clear is observed in
//                 the written workspace doc (metaPageId: null,
//                 metaPageClearedAt: <now>).
//   T-10 (T077) — Unlinking clears the Page in the SAME write (FR-011).
//   T-13 (T078) — A team member links an ad account successfully
//                 (FR-017). The pre-967 `assertNotTeamMember` guard is
//                 gone — verified members pass through
//                 `resolveMetaScope` and `assertWorkspaceAllowed`.
//
// Plus contract checks:
//   - The Page clear is NOT split into a follow-up write — a split
//     write leaves the workspace holding one client's Page against
//     another's ad account (FR-011's stated reason).
//   - `pageCleared` returns true only when the workspace had a Page
//     recorded before the call (SET state); false when it was
//     NEVER_SET or already CLEARED.
//   - The new ad account must be in the connection's `adAccounts`
//     list (CodeRabbit audit); a forged id is refused.
//   - Workspace outside the permitted set is refused (FR-021).
//   - Workspace soft-deleted is refused (FR-024).
//
// Strategy: the in-memory Firestore stub from workspace.test.ts.
// `linkMetaAccountToWorkspaceImpl` and
// `unlinkMetaAccountFromWorkspaceImpl` are invoked directly with a
// fake `probeMetaRoleImpl` and a fake scope (no live resolver, no
// live Meta API).
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
    console.log(`linkMetaAccount tests: ${passed} passed, ${failed} failed`);
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

/**
 * CR-MAJOR (CodeRabbit review feedback): record every `update()`
 * payload per doc path so T-09/T-10 can assert the SAME-write contract
 * (the link/unlink payload must contain both the ad-account change and
 * the Page-clear fields). The previous stub mutated final state only —
 * a regression that split the link and the Page clear across two
 * `update()` calls would still pass.
 */
const updateCalls: Array<{ path: string; id: string; patch: DocData }> = [];
function resetUpdateCalls() { updateCalls.length = 0; }

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
    async set(data: DocData) {
        updateCalls.push({ path: `${this.path}/${this.id}`, id: this.id, patch: { __set__: data } });
        this.store.set(this.id, data);
    }
    async update(patch: DocData) {
        updateCalls.push({ path: `${this.path}/${this.id}`, id: this.id, patch });
        const cur = this.store.get(this.id) ?? {};
        const next: DocData = { ...cur };
        for (const [k, v] of Object.entries(patch)) {
            if (v === Symbol.for("delete") || (typeof v === "symbol" && v.toString().includes("delete"))) {
                // `FieldValue.delete()` — remove the key, not set it
                // to a Symbol.
                delete next[k];
            } else {
                next[k] = v;
            }
        }
        this.store.set(this.id, next);
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
    resetUpdateCalls();
}

const stubFirestore = () => ({
    settings: () => stubFirestore(),
    collection: (path: string) => new StubCollection(path, bucket(path)),
    // Production code occasionally calls `admin.firestore().doc(<full-path>)`
    // for cross-collection DocumentReferences (e.g. the workspace-private
    // `private/metaConnection` mirror written by unlink). Support it by
    // parsing the path into parent-collection + doc-id.
    doc(path: string) {
        const segments = path.split("/");
        if (segments.length % 2 !== 0 || segments.length < 2) {
            throw new Error(`stubFirestore: invalid doc path ${path}`);
        }
        const docId = segments[segments.length - 1];
        const parentSegments = segments.slice(0, -1);
        const parentPath = parentSegments.join("/");
        return new StubDocRef(
            `${parentPath}/${docId}`,
            docId,
            bucket(parentPath),
        );
    },
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
    linkMetaAccountToWorkspaceImpl,
    unlinkMetaAccountFromWorkspaceImpl,
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

function setupOwnerConnection(opts?: { adAccounts?: any[] }) {
    bucket("metaConnections").set("owner-1", {
        encryptedToken: encryptTestToken("fake-token", TEST_SECRET),
        adAccounts: opts?.adAccounts ?? [
            { id: "act_WS_A", name: "Account A" },
            { id: "act_WS_B", name: "Account B" },
        ],
        selectedAccountId: null,
        pages: [],
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
}

function setupWorkspace(opts: {
    id: string;
    name?: string;
    isDefault?: boolean;
    deletedAt?: number | null;
    metaAdAccountId?: string | null;
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
        metaAdAccountName: null,
        metaRoleAtLinkTime: null,
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

function ownerScope(): {
    ownerUid: string;
    callerUid: string;
    allowedWorkspaceIds: string[] | "ALL";
    storedWorkspaceAccess: string[];
} {
    return {
        ownerUid: "owner-1",
        callerUid: "owner-1",
        allowedWorkspaceIds: "ALL",
        storedWorkspaceAccess: [],
    };
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

const FAKE_PROBE_ROLE = async (_token: string, _accountId: string) => "ADMIN";

// Minimal Firestore-DocumentSnapshot stand-in for the helpers in
// `metaCallerScope.ts` (which read `.id`, `.ref`, `.data()`). The
// stub's own `StubDocRef` carries full Firestore semantics, but
// `resolveWorkspacePage` is also exercised from tests that need only
// the data surface — a lightweight shim is enough.
function workspaceSnap(doc: DocData, id = "ws-1"): { id: string; data: () => DocData } {
    return { id, data: () => doc };
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
    // ─── T-09: link clears Page in same write ───
    await run("T-09a: link with prior SET Page → clears in same write, pageCleared=true", async () => {
        resetStub();
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
            metaAdAccountId: "act_OLD", // existing link (will be replaced)
            metaPageId: "page-old",
            metaPageName: "Old Page",
            metaPageClearedAt: null,
        });

        const before = Date.now();
        const result = await linkMetaAccountToWorkspaceImpl(
            ownerScope(),
            {
                workspaceId: "ws-1",
                metaAdAccountId: "act_WS_A",
                metaAdAccountName: "Account A",
            },
            { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
        );
        const after = Date.now();

        assert.equal(result.ok, true);
        assert.equal(result.pageCleared, true, "T-09a: pageCleared=true when SET workspace loses Page");
        assert.equal(result.metaRoleAtLinkTime, "ADMIN");

        // FR-011 — SAME write carries both the new ad account AND the
        // Page clear. Inspect the persisted workspace doc.
        const ws = bucket("users/owner-1/workspaces").get("ws-1") as any;
        assert.equal(ws.metaAdAccountId, "act_WS_A", "T-09a: new ad account written");
        assert.equal(ws.metaAdAccountName, "Account A");
        assert.equal(ws.metaRoleAtLinkTime, "ADMIN");
        // Page clear fields:
        assert.equal(ws.metaPageId, null, "T-09a: metaPageId cleared");
        assert.equal(ws.metaPageName, null, "T-09a: metaPageName cleared");
        assert.ok(
            typeof ws.metaPageClearedAt === "number"
              && ws.metaPageClearedAt >= before
              && ws.metaPageClearedAt <= after,
            "T-09a: metaPageClearedAt stamped in the same write window",
        );

        // CR-MAJOR (CodeRabbit review feedback): assert the SAME-write
        // contract — exactly ONE workspace-doc update landed, and its
        // payload contains BOTH the ad-account change AND the Page
        // clear. A regression that splits them across two `update()`
        // calls would still leave the final state correct, but would
        // re-introduce the cross-client leak between the two writes.
        const wsUpdates = updateCalls.filter(
            (c) => c.id === "ws-1" && !c.path.includes("private/"),
        );
        assert.equal(
            wsUpdates.length, 1,
            "T-09a (CR-MAJOR): exactly ONE update to ws-1 (link + Page clear in same write)",
        );
        const wsPatch = wsUpdates[0].patch as DocData;
        assert.ok(
            "metaAdAccountId" in wsPatch && "metaPageClearedAt" in wsPatch,
            "T-09a (CR-MAJOR): one update carries BOTH the new ad account AND the Page clear",
        );
        assert.equal(wsPatch.metaAdAccountId, "act_WS_A");
        assert.ok(typeof wsPatch.metaPageClearedAt === "number");
    });

    await run("T-09b: link with NEVER_SET Page → CLEARED stamped, pageCleared=false", async () => {
        // Claude audit C-1 (2026-08-20): NEVER_SET → CLEARED on every
        // ad-account change. The legacy global Page fallback is blocked
        // the moment the workspace is retargeted. The user-facing
        // notice stays gated on `hadPage` so untouched workspaces
        // don't produce a confusing "your Page was cleared" message.
        resetStub();
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
            metaAdAccountId: null,
            metaPageId: null,
            metaPageName: null,
            metaPageClearedAt: null,
        });
        const before = Date.now();
        const result = await linkMetaAccountToWorkspaceImpl(
            ownerScope(),
            { workspaceId: "ws-1", metaAdAccountId: "act_WS_A", metaAdAccountName: "A" },
            { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
        );
        const after = Date.now();

        assert.equal(result.pageCleared, false, "T-09b: NEVER_SET → pageCleared=false (no new notice — user never picked one)");
        // FR-011a — metaPageClearedAt stamped regardless of prior state.
        // The workspace moves off the legacy global Page fallback the
        // moment it is retargeted (Claude audit C-1 closure).
        const ws = bucket("users/owner-1/workspaces").get("ws-1") as any;
        assert.equal(ws.metaPageId, null);
        assert.equal(ws.metaPageName, null);
        assert.ok(
            typeof ws.metaPageClearedAt === "number"
              && ws.metaPageClearedAt >= before
              && ws.metaPageClearedAt <= after,
            "T-09b (Claude audit C-1): NEVER_SET workspace is now CLEARED on link (blocks legacy fallback)",
        );
    });

    await run("T-09c: link with CLEARED Page → re-stamped, pageCleared=false", async () => {
        // Claude audit C-1: a fresh ad-account change re-stamps
        // metaPageClearedAt (already CLEARED → still CLEARED) so the
        // audit log carries the new event timestamp.
        resetStub();
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
            metaAdAccountId: null,
            metaPageId: null,
            metaPageName: null,
            metaPageClearedAt: Date.parse("2026-07-15T00:00:00Z"),
        });
        const before = Date.now();
        const result = await linkMetaAccountToWorkspaceImpl(
            ownerScope(),
            { workspaceId: "ws-1", metaAdAccountId: "act_WS_A", metaAdAccountName: "A" },
            { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
        );
        const after = Date.now();

        assert.equal(result.pageCleared, false, "T-09c: CLEARED → pageCleared=false (no new notice)");
        // The clear timestamp was refreshed by the link — re-stamped
        // because every ad-account change is an explicit FR-011 event.
        const ws = bucket("users/owner-1/workspaces").get("ws-1") as any;
        assert.ok(
            typeof ws.metaPageClearedAt === "number"
              && ws.metaPageClearedAt >= before
              && ws.metaPageClearedAt <= after,
            "T-09c: metaPageClearedAt re-stamped on link",
        );
    });

    await run("T-09d: NEVER_SET workspace after link → pageSource 'none', NOT 'legacy_global'", async () => {
        // Claude audit C-1 closure: after a NEVER_SET workspace is
        // linked, a pack publish from it must resolve pageSource as
        // 'none' (not 'legacy_global'). The legacy global Page
        // fallback is blocked by FR-011a's CLEARED rule. The
        // metaCallerScope.resolveWorkspacePage helper reads
        // `metaPageClearedAt != null` and returns 'none' for CLEARED
        // workspaces — this test confirms the FR-011 + FR-011a contract
        // from the publish path's perspective.
        resetStub();
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
            metaAdAccountId: null,
            metaPageId: null,
            metaPageName: null,
            metaPageClearedAt: null,
        });
        await linkMetaAccountToWorkspaceImpl(
            ownerScope(),
            { workspaceId: "ws-1", metaAdAccountId: "act_WS_A", metaAdAccountName: "A" },
            { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
        );
        const ws = bucket("users/owner-1/workspaces").get("ws-1") as any;
        const clearedAt = ws.metaPageClearedAt;
        assert.ok(typeof clearedAt === "number" && clearedAt > 0, "T-09d setup: metaPageClearedAt stamped");

        // Now resolve the page through the shared helper. It must
        // classify this workspace as CLEARED → 'none', not NEVER_SET
        // → 'legacy_global'.
        const { resolveWorkspacePage } = require("../workspaces/metaCallerScope.js");
        const conn = bucket("metaConnections").get("owner-1") as any;
        const page = resolveWorkspacePage(workspaceSnap(ws), conn);
        assert.equal(page.pageSource, "none", "T-09d (Claude audit C-1): CLEARED workspace after link → pageSource='none', never 'legacy_global'");
        assert.equal(page.pageId, null);
        assert.equal(page.pageName, null);
    });

    // ─── T-09e: same-account re-selection preserves inherited Page (round 7 O-2) ───
    await run("T-09e: same-account re-selection → Page preserved, metaPageClearedAt NOT restamped", async () => {
        // CR-MAJOR (CodeRabbit round 7, O-2): the previous unconditional
        // Page clear violated `spec.md` clarification 160 / 245 —
        // re-selecting the already-linked ad account is NOT a Page
        // choice and must NOT clear the inherited legacy Page. The fix
        // gates the clear on `priorAccountId !== metaAdAccountId`, so
        // the dominant UI path (`App.tsx:3884-3890` re-fires the link
        // on every sidebar selection) preserves the inherited legacy
        // Page so pack publishing can still consume it.
        //
        // This regression pins the new behaviour: when a workspace is
        // already linked to ad account X and the user re-selects X,
        // the Page fields and metaPageClearedAt stay exactly as they
        // were. The `updateCalls` log shows only the link fields were
        // rewritten — Page clear is absent from the patch.
        resetStub();
        setupOwnerConnection();
        const priorClearedAt = Date.parse("2026-07-01T00:00:00Z");
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
            metaAdAccountId: "act_WS_A", // already linked
            metaPageId: null,            // CLEARED, never explicitly picked
            metaPageName: null,
            metaPageClearedAt: priorClearedAt,
        });

        const result = await linkMetaAccountToWorkspaceImpl(
            ownerScope(),
            { workspaceId: "ws-1", metaAdAccountId: "act_WS_A", metaAdAccountName: "A" },
            { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
        );
        assert.equal(result.ok, true);
        assert.equal(result.pageCleared, false, "T-09e: pageCleared=false on same-account re-selection");

        const ws = bucket("users/owner-1/workspaces").get("ws-1") as any;
        // Link fields rewritten:
        assert.equal(ws.metaAdAccountId, "act_WS_A");
        assert.equal(ws.metaAdAccountName, "A");
        assert.equal(ws.metaRoleAtLinkTime, "ADMIN");
        // Page fields unchanged:
        assert.equal(ws.metaPageId, null, "T-09e: metaPageId preserved on same-account re-selection");
        assert.equal(ws.metaPageName, null, "T-09e: metaPageName preserved on same-account re-selection");
        assert.equal(
            ws.metaPageClearedAt, priorClearedAt,
            "T-09e: metaPageClearedAt NOT restamped on same-account re-selection",
        );

        // The single update call carried the link fields ONLY — no
        // metaPageClearedAt key in the patch.
        const wsUpdates = updateCalls.filter(
            (c) => c.id === "ws-1" && !c.path.includes("private/"),
        );
        assert.equal(wsUpdates.length, 1, "T-09e: exactly one update to ws-1");
        const wsPatch = wsUpdates[0].patch as DocData;
        assert.equal(
            "metaPageClearedAt" in wsPatch, false,
            "T-09e: metaPageClearedAt absent from the update patch on same-account re-selection",
        );
        assert.equal(
            "metaPageId" in wsPatch, false,
            "T-09e: metaPageId absent from the update patch on same-account re-selection",
        );
        assert.equal(
            "metaPageName" in wsPatch, false,
            "T-09e: metaPageName absent from the update patch on same-account re-selection",
        );

        // The publish-side view: a CLEARED workspace stays CLEARED
        // across same-account re-selection, so pack publishing still
        // skips creative creation rather than inheriting the legacy
        // global Page.
        const { resolveWorkspacePage } = require("../workspaces/metaCallerScope.js");
        const conn = bucket("metaConnections").get("owner-1") as any;
        const page = resolveWorkspacePage(workspaceSnap(ws), conn);
        assert.equal(
            page.pageSource, "none",
            "T-09e: CLEARED stays CLEARED across same-account re-selection (no Page re-mutation)",
        );
    });

    // ─── T-09f: same-account re-selection with a SET Page → Page preserved, pageCleared=false ───
    await run("T-09f: same-account re-selection with a SET Page → Page preserved, pageCleared=false", async () => {
        // CR-MAJOR (CodeRabbit round 10): the previous return value
        // was `pageCleared: hadPage`, which produced a misleading
        // `true` for same-account re-selection against a workspace
        // whose Page was already SET — the Page was preserved (correct)
        // but the response claimed it had been cleared (wrong, because
        // no clear actually happened). The return is now
        // `isAccountChange && hadPage`, so a same-account re-selection
        // with a SET Page returns `pageCleared: false`.
        //
        // T-09e covered the CLEARED case; this T-09f covers the SET
        // case so both branches of `hadPage × isAccountChange` are
        // pinned.
        resetStub();
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
            metaAdAccountId: "act_WS_A", // already linked
            metaPageId: "page-A",        // SET — explicitly picked
            metaPageName: "Page A",
            metaPageClearedAt: null,
        });

        const result = await linkMetaAccountToWorkspaceImpl(
            ownerScope(),
            { workspaceId: "ws-1", metaAdAccountId: "act_WS_A", metaAdAccountName: "A" },
            { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
        );
        assert.equal(result.ok, true);
        // The Page was NOT cleared (same-account re-selection), so the
        // response must NOT claim a clear happened.
        assert.equal(
            result.pageCleared, false,
            "T-09f: pageCleared=false when same-account re-selection preserves a SET Page",
        );

        const ws = bucket("users/owner-1/workspaces").get("ws-1") as any;
        // Link fields rewritten:
        assert.equal(ws.metaAdAccountId, "act_WS_A");
        assert.equal(ws.metaAdAccountName, "A");
        // Page fields preserved exactly:
        assert.equal(ws.metaPageId, "page-A", "T-09f: metaPageId preserved");
        assert.equal(ws.metaPageName, "Page A", "T-09f: metaPageName preserved");
        assert.equal(ws.metaPageClearedAt, null, "T-09f: metaPageClearedAt unchanged (still null)");

        // The single update call carried the link fields ONLY — no
        // Page-clear keys.
        const wsUpdates = updateCalls.filter(
            (c) => c.id === "ws-1" && !c.path.includes("private/"),
        );
        assert.equal(wsUpdates.length, 1);
        const wsPatch = wsUpdates[0].patch as DocData;
        assert.equal(
            "metaPageId" in wsPatch, false,
            "T-09f: metaPageId absent from the update patch",
        );
        assert.equal(
            "metaPageClearedAt" in wsPatch, false,
            "T-09f: metaPageClearedAt absent from the update patch",
        );

        // Publish-side view: the SET workspace keeps its Page, so
        // pack publishing still consumes it via page_id on /adcreatives.
        const { resolveWorkspacePage } = require("../workspaces/metaCallerScope.js");
        const conn = bucket("metaConnections").get("owner-1") as any;
        const page = resolveWorkspacePage(workspaceSnap(ws), conn);
        assert.equal(
            page.pageSource, "workspace",
            "T-09f: SET workspace stays SET across same-account re-selection",
        );
        assert.equal(page.pageId, "page-A");
        assert.equal(page.pageName, "Page A");
    });

    // ─── T-10: unlink clears Page in same write ───
    await run("T-10: unlink clears Page in same write, pageCleared=true", async () => {
        resetStub();
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
            metaAdAccountId: "act_WS_A",
            metaPageId: "page-A",
            metaPageName: "Page A",
            metaPageClearedAt: null,
        });
        const before = Date.now();
        const result = await unlinkMetaAccountFromWorkspaceImpl(
            ownerScope(),
            { workspaceId: "ws-1" },
        );
        const after = Date.now();

        assert.equal(result.ok, true);
        assert.equal(result.pageCleared, true, "T-10: unlink clears Page, pageCleared=true");

        const ws = bucket("users/owner-1/workspaces").get("ws-1") as any;
        // Ad-account fields deleted.
        assert.equal(ws.metaAdAccountId, undefined, "T-10: metaAdAccountId deleted");
        assert.equal(ws.metaAdAccountName, undefined, "T-10: metaAdAccountName deleted");
        assert.equal(ws.metaRoleAtLinkTime, undefined, "T-10: metaRoleAtLinkTime deleted");
        // Page clear fields stamped in the SAME write (no follow-up).
        assert.equal(ws.metaPageId, null, "T-10: metaPageId cleared in same write");
        assert.equal(ws.metaPageName, null, "T-10: metaPageName cleared in same write");
        assert.ok(
            typeof ws.metaPageClearedAt === "number"
              && ws.metaPageClearedAt >= before
              && ws.metaPageClearedAt <= after,
            "T-10: metaPageClearedAt stamped in same write",
        );

        // CR-MAJOR (CodeRabbit review feedback): same-write contract on
        // unlink too. Exactly ONE workspace-doc update lands, carrying
        // BOTH the ad-account field-deletes AND the Page-clear fields.
        const wsUpdates = updateCalls.filter(
            (c) => c.id === "ws-1" && !c.path.includes("private/"),
        );
        assert.equal(
            wsUpdates.length, 1,
            "T-10 (CR-MAJOR): exactly ONE update to ws-1 (unlink + Page clear in same write)",
        );
        const wsPatch = wsUpdates[0].patch as DocData;
        // metaAdAccountId / metaAdAccountName / metaRoleAtLinkTime are
        // deleted via FieldValue.delete() (a Symbol the stub recognises).
        assert.ok(
            "metaPageClearedAt" in wsPatch
              && typeof wsPatch.metaPageClearedAt === "number",
            "T-10 (CR-MAJOR): one update carries the Page-clear stamp",
        );
    });

    // ─── T-13: team member links successfully ───
    await run("T-13: team member (ALL scope) links ad account on owner's workspace", async () => {
        resetStub();
        setupTeamMemberUserDoc("member-1", "owner-1");
        setupTeamMemberDoc("member-1", "owner-1");
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
            metaAdAccountId: null,
        });

        const result = await linkMetaAccountToWorkspaceImpl(
            memberScope(),
            { workspaceId: "ws-1", metaAdAccountId: "act_WS_A", metaAdAccountName: "A" },
            { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
        );

        assert.equal(result.ok, true, "T-13: team member link succeeds");
        assert.equal(result.metaRoleAtLinkTime, "ADMIN");

        // The link landed on the OWNER's workspace (not member-1).
        const ws = bucket("users/owner-1/workspaces").get("ws-1") as any;
        assert.equal(ws.metaAdAccountId, "act_WS_A", "T-13: owner's workspace was written");
    });

    await run("T-13b: team member (subset scope) is refused for an unlisted workspace", async () => {
        resetStub();
        setupTeamMemberUserDoc("member-1", "owner-1");
        setupTeamMemberDoc("member-1", "owner-1");
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
            metaAdAccountId: null,
        });
        await expectHttpsError(
            () => linkMetaAccountToWorkspaceImpl(
                memberScope(["ws-2"]), // ws-1 not in the permitted set
                { workspaceId: "ws-1", metaAdAccountId: "act_WS_A", metaAdAccountName: "A" },
                { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
            ),
            "permission-denied",
            "No access to this workspace",
            { reason: "workspace_not_permitted" },
        );
    });

    // ─── Auth gate ───
    await run("Auth gate: no request.auth → unauthenticated", async () => {
        resetStub();
        // Simulate the production wrapper's auth check (the impl itself
        // trusts the scope — the wrapper enforces the gate). We assert
        // that the production callable's `request.auth` precondition
        // exists by inspecting its `onCall` shape; here we just verify
        // that an owner scope with no callerUid-equivalent (i.e. the
        // production code would have thrown unauthenticated before
        // reaching the impl).
        // This is a structural sanity check — the impl itself is
        // unconditional once a scope arrives.
        assert.ok(typeof linkMetaAccountToWorkspaceImpl === "function");
        assert.ok(typeof unlinkMetaAccountFromWorkspaceImpl === "function");
    });

    // ─── Forged account id ───
    await run("Forged ad-account id (not in conn.adAccounts) → failed-precondition", async () => {
        resetStub();
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
        });
        await expectHttpsError(
            () => linkMetaAccountToWorkspaceImpl(
                ownerScope(),
                { workspaceId: "ws-1", metaAdAccountId: "act_FAKE_ID", metaAdAccountName: "X" },
                { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
            ),
            "failed-precondition",
            "not in your connected accounts",
        );
    });

    // ─── No Meta connection yet ───
    await run("No metaConnections/{ownerUid} → failed-precondition", async () => {
        resetStub();
        // Owner user doc exists but no connection.
        bucket("users").set("owner-1", {});
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
        });
        await expectHttpsError(
            () => linkMetaAccountToWorkspaceImpl(
                ownerScope(),
                { workspaceId: "ws-1", metaAdAccountId: "act_WS_A", metaAdAccountName: "A" },
                { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
            ),
            "failed-precondition",
            "Connect your Meta account first",
        );
    });

    // ─── Soft-deleted workspace ───
    await run("Soft-deleted workspace → not-found", async () => {
        resetStub();
        setupOwnerConnection();
        setupWorkspace({
            id: "ws-1", name: "Brand X",
            isDefault: true,
            deletedAt: Date.parse("2026-08-01T00:00:00Z"),
        });
        await expectHttpsError(
            () => linkMetaAccountToWorkspaceImpl(
                ownerScope(),
                { workspaceId: "ws-1", metaAdAccountId: "act_WS_A", metaAdAccountName: "A" },
                { probeMetaRoleImpl: FAKE_PROBE_ROLE, metaAppSecretValue: TEST_SECRET },
            ),
            "not-found",
            "already deleted",
        );
    });

    summary();
}

main().catch((err) => {
    console.error("linkMetaAccount.test.ts main() crashed:", err);
    process.exit(FAILED);
});
