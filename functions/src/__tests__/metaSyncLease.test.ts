// functions/src/__tests__/metaSyncLease.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 970 Batch 4 — contract tests for `metaSync/lease.ts`.
//
// WHY THIS FILE EXISTS
// --------------------
// The investigation report §6 specifies that the in-flight guard MUST
// be implemented as a lease document with these rules:
//   - Keyed on ownerUid (NOT lastMetaSyncAt — that field caused D2).
//   - Holder identity verified on release.
//   - TTL ≤ 10 min.
//   - Stale leases are overwritten on acquire.
//   - Acquired in a finally-cleared block by the runner.
//
// `acquireLease` and `releaseLease` are pure (deps-injected) so the
// test suite can drive them with an in-memory Firestore stub. The
// runner-side test (orchestrator lease integration) lives in
// `metaSyncOrchestrator.test.ts` and uses the seam fields
// `acquireLeaseOverride` / `releaseLeaseOverride`.
//
// The stub transaction implementation here is minimal — production
// uses Firestore's runTransaction which serialises reads/writes
// across processes. The stub intentionally does NOT serialise; the
// tests below are single-threaded so the lack of transaction
// semantics does not affect the assertions. The shape — `txn.get`,
// `txn.set`, `txn.update`, `txn.delete` — matches the real
// `Firestore.runTransaction` callback signature.
// ═══════════════════════════════════════════════════════════════════════════

import assert from "node:assert/strict";
import { test } from "node:test";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    acquireLease,
    releaseLease,
    AlreadyRunningError,
    LEASE_TTL_MS,
    LEASE_DOC_COLLECTION,
} = require("../metaSync/lease.js");

// ─── In-memory Firestore stub with runTransaction ────────────────────

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
        return { exists: data !== undefined, data: () => data ?? undefined, id: this.id, ref: this };
    }
    async set(data: DocData) { this.store.set(this.id, data); }
    async update(patch: DocData) {
        const cur = this.store.get(this.id) ?? {};
        this.store.set(this.id, { ...cur, ...patch });
    }
    async delete() { this.store.delete(this.id); }
}

const stubFirestore = () => ({
    settings: () => stubFirestore(),
    doc: (path: string) => {
        const segs = path.split("/");
        const id = segs.pop() as string;
        return new StubDocRef(path, id, bucket(segs.join("/")));
    },
    async runTransaction<T>(fn: (txn: any) => Promise<T>): Promise<T> {
        // Minimal single-threaded txn snapshot. The semantics
        // mimic `runTransaction` enough for the property tests
        // below: a single snapshot of the doc is read at txn.get,
        // and writes applied via txn.set / txn.update / txn.delete
        // are committed before fn resolves. Multi-process
        // concurrency is NOT modelled — the real Firestore runTransaction
        // serialises across processes; the stub does not.
        const reads = new Map<string, { exists: boolean; data: DocData | undefined }>();
        const writes: Array<{ type: "set" | "update" | "delete"; ref: StubDocRef; data?: DocData }> = [];
        const txnProxy = {
            get(ref: StubDocRef) {
                const data = ref["store"].get(ref["id"]);
                reads.set(ref["path"], { exists: data !== undefined, data });
                return Promise.resolve({
                    exists: data !== undefined,
                    data: () => data ?? undefined,
                    ref,
                });
            },
            set(ref: StubDocRef, data: DocData) {
                writes.push({ type: "set", ref, data });
            },
            update(ref: StubDocRef, patch: DocData) {
                writes.push({ type: "update", ref, data: patch });
            },
            delete(ref: StubDocRef) {
                writes.push({ type: "delete", ref });
            },
        };
        const result = await fn(txnProxy);
        for (const w of writes) {
            if (w.type === "set") await w.ref.set(w.data!);
            else if (w.type === "update") await w.ref.update(w.data!);
            else await w.ref.delete();
        }
        return result;
    },
});

// ─── Fixtures ────────────────────────────────────────────────────────────

const OWNER = "owner_uid_AAAA";
const CALLER = "caller_uid_BBBB";
const OTHER = "caller_uid_CCCC";
const FIXED_NOW = 1_700_000_000_000;

function resetStub() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}

function leaseBucketPath() {
    // The stub stores docs by their parent collection's path, and
    // the doc id is the doc key (ownerUid in this case). So the
    // bucket key is the collection name, NOT the full doc path.
    return LEASE_DOC_COLLECTION;
}

function leaseDocKey(ownerUid: string) {
    return ownerUid;
}

// ─── acquireLease ────────────────────────────────────────────────────────

test("acquireLease — fresh acquire succeeds and writes the lease doc", async () => {
    resetStub();
    const db: any = stubFirestore();
    const result = await acquireLease(db, OWNER, CALLER, FIXED_NOW);
    assert.deepEqual(result, { ok: true });
    const doc = bucket(leaseBucketPath()).get(leaseDocKey(OWNER))!;
    assert.ok(doc, "lease doc must be written at metaSyncLeases/{ownerUid}");
    assert.equal(doc.holderUid, CALLER);
    assert.equal(doc.acquiredAtMs, FIXED_NOW);
    assert.equal(doc.expiresAtMs, FIXED_NOW + LEASE_TTL_MS);
});

test("acquireLease — same caller re-acquiring is refused with busy (no overlap)", async () => {
    // PHASE 970 (bug 2026-09-03) — the previous behaviour of
    // extending the TTL for the same caller let two browser tabs
    // both run runFullSync for the same owner at the same time.
    // The fix returns the busy result so the dashboard surfaces
    // "a sync is already running" instead of a silently overlapping
    // second sync.
    resetStub();
    const db: any = stubFirestore();
    await acquireLease(db, OWNER, CALLER, FIXED_NOW);
    const second = await acquireLease(db, OWNER, CALLER, FIXED_NOW + 60_000);
    assert.equal(second.ok, false, "same-caller re-acquire must refuse");
    if (second.ok === false) {
        assert.equal(second.holderUid, CALLER, "holderUid is reported as the busy holder");
        assert.equal(second.expiresAtMs, FIXED_NOW + LEASE_TTL_MS, "expiresAtMs points at the existing lease");
    }
    // The original lease is untouched — no TTL extension.
    const doc = bucket(leaseBucketPath()).get(leaseDocKey(OWNER))!;
    assert.equal(doc.holderUid, CALLER, "holder unchanged");
    assert.equal(doc.expiresAtMs, FIXED_NOW + LEASE_TTL_MS, "original TTL NOT extended");
});

test("acquireLease — contended (held by another caller, not stale) returns ok:false with holder info", async () => {
    resetStub();
    const db: any = stubFirestore();
    await acquireLease(db, OWNER, CALLER, FIXED_NOW);
    const second = await acquireLease(db, OWNER, OTHER, FIXED_NOW + 10_000);
    assert.equal(second.ok, false);
    assert.equal(second.holderUid, CALLER);
    // No mutation while contended:
    const doc = bucket(leaseBucketPath()).get(leaseDocKey(OWNER))!;
    assert.equal(doc.holderUid, CALLER, "contended acquire must not overwrite");
});

test("acquireLease — stale lease is overwritten by a fresh caller", async () => {
    resetStub();
    const db: any = stubFirestore();
    // Acquire at t=0 with 10-min TTL.
    await acquireLease(db, OWNER, CALLER, FIXED_NOW);
    // 11 minutes later, a different caller takes over.
    const second = await acquireLease(
        db,
        OWNER,
        OTHER,
        FIXED_NOW + 11 * 60 * 1000,
    );
    assert.deepEqual(second, { ok: true });
    const doc = bucket(leaseBucketPath()).get(leaseDocKey(OWNER))!;
    assert.equal(doc.holderUid, OTHER, "stale lease must be overwritten");
    assert.equal(doc.expiresAtMs, FIXED_NOW + 11 * 60 * 1000 + LEASE_TTL_MS);
});

test("acquireLease — boundary at exactly expiresAtMs is treated as stale (≤ not <)", async () => {
    resetStub();
    const db: any = stubFirestore();
    await acquireLease(db, OWNER, CALLER, FIXED_NOW);
    // Acquire at exactly the boundary: the existing lease has
    // expiresAtMs === nowMs, so the comparison `expiresAtMs <= nowMs`
    // is true and the new caller takes over.
    const second = await acquireLease(db, OWNER, OTHER, FIXED_NOW + LEASE_TTL_MS);
    assert.deepEqual(second, { ok: true });
});

// ─── releaseLease ────────────────────────────────────────────────────────

test("releaseLease — succeeds when caller is the holder", async () => {
    resetStub();
    const db: any = stubFirestore();
    await acquireLease(db, OWNER, CALLER, FIXED_NOW);
    const result = await releaseLease(db, OWNER, CALLER);
    assert.deepEqual(result, { released: true });
    assert.equal(bucket(leaseBucketPath()).get(leaseDocKey(OWNER)), undefined);
});

test("releaseLease — refuses to release a lease held by another caller", async () => {
    resetStub();
    const db: any = stubFirestore();
    await acquireLease(db, OWNER, CALLER, FIXED_NOW);
    // A different caller tries to release the lease. MUST NOT
    // succeed — this is the load-bearing holder-identity defence
    // against a stale run releasing its successor's lease.
    const result = await releaseLease(db, OWNER, OTHER);
    assert.deepEqual(result, { released: false });
    // Doc unchanged:
    const doc = bucket(leaseBucketPath()).get(leaseDocKey(OWNER))!;
    assert.ok(doc, "doc must NOT be deleted by a non-holder");
    assert.equal(doc.holderUid, CALLER);
});

test("releaseLease — no-op when there is no lease doc", async () => {
    resetStub();
    const db: any = stubFirestore();
    const result = await releaseLease(db, OWNER, CALLER);
    assert.deepEqual(result, { released: false });
});

test("releaseLease — no-op after takeover (stale run cannot release successor's lease)", async () => {
    resetStub();
    const db: any = stubFirestore();
    await acquireLease(db, OWNER, CALLER, FIXED_NOW);
    // Stale lease gets taken over by `OTHER` after expiry.
    await acquireLease(db, OWNER, OTHER, FIXED_NOW + 11 * 60 * 1000);
    // The original stale run tries to release. The check inside
    // the transaction sees the OTHER holder and refuses.
    const result = await releaseLease(db, OWNER, CALLER);
    assert.deepEqual(result, { released: false });
    const doc = bucket(leaseBucketPath()).get(leaseDocKey(OWNER))!;
    assert.equal(doc.holderUid, OTHER);
});

// ─── AlreadyRunningError ────────────────────────────────────────────────

test("AlreadyRunningError — carries holderUid and expiresAtMs", () => {
    const err = new AlreadyRunningError({
        holderUid: CALLER,
        expiresAtMs: FIXED_NOW + 600_000,
    });
    assert.equal(err.name, "AlreadyRunningError");
    assert.equal(err.holderUid, CALLER);
    assert.equal(err.expiresAtMs, FIXED_NOW + 600_000);
    assert.ok(err.message.includes(CALLER));
    assert.ok(err.message.includes("until"), "message should reference the auto-release point so operators can wait it out");
});

test("AlreadyRunningError — message describes a state, not a wait (per investigation §6 copy rule)", () => {
    // The investigation report §6 specifies the user-facing string
    // describes a state ('a sync is already running'), NOT a wait
    // ('try again later'). This guards the explicit anti-cooldown
    // contract: a future copywriter cannot regress to wait-state
    // phrasing that turns the lease back into a time-based gate.
    const err = new AlreadyRunningError({
        holderUid: CALLER,
        expiresAtMs: FIXED_NOW + 600_000,
    });
    assert.equal(
        err.message.toLowerCase().includes("try again later"),
        false,
        "AlreadyRunningError message must not say 'try again later'",
    );
    assert.equal(
        err.message.toLowerCase().includes("already running"),
        true,
        "AlreadyRunningError message must say 'already running'",
    );
});

// ─── Structural guards ────────────────────────────────────────────────────

test("LEASE_TTL_MS — is exactly 10 minutes (per investigation §6 upper bound)", () => {
    assert.equal(
        LEASE_TTL_MS,
        10 * 60 * 1000,
        "Lease TTL is fixed at 10 minutes per the approved design in investigation §6.",
    );
});

test("LEASE_DOC_COLLECTION — is a separate top-level collection, NOT under any user document", () => {
    // The investigation §6 specifies a separate document. Putting
    // the lease anywhere under a user document risks accidental
    // read/write aliasing with the legacy cooldown surface or the
    // workspace-private `metaConnection` doc.
    assert.equal(
        LEASE_DOC_COLLECTION,
        "metaSyncLeases",
        "Lease collection must be at the top of Firestore.",
    );
    assert.ok(
        !LEASE_DOC_COLLECTION.startsWith("users/") &&
            !LEASE_DOC_COLLECTION.startsWith("metaConnections/"),
        "Lease collection must NOT live under users/ or metaConnections/.",
    );
});
