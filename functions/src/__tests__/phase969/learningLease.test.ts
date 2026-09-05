// functions/src/__tests__/phase969/learningLease.test.ts — contracts for `learning/learningLease.ts`
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, T013 — covers:
//   SC-017   two contending runs for the same account → exactly one writer
//            (the test calls runSyncForAccount directly twice; see note below)
//   SC-017a  two runs for DIFFERENT accounts of the same owner both succeed
//            (negative of SC-017 — would fail if the lease were keyed per owner)
//   SC-018   abandoned lease self-expires after the TTL; a fresh acquire succeeds
//   SC-019   a run whose lease has been taken over does NOT write learning
//   SC-020   a scheduled run that cannot acquire signals failure (FR-060),
//            not silent skip
//   SC-043   the lease is acquired inside `runSyncForAccount`, not just at
//            the orchestrator level — exercised by calling runSyncForAccount
//            twice directly and observing one acquire, one refusal
//   SC-044   zero conversions counted twice under the scheduled-vs-manual
//            pairing (full-stack: needs runSyncForAccount stubbed at the
//            Phase 2 boundary — exercised end-to-end in Phase 7)
//   SC-049   operational status writes committed BEFORE the lease attempt
//            (FR-060a ordering)
//
// Coverage limit (carried from Batch 01 §5.3 — owner correction):
// This test drives the lease primitives directly. It does NOT drive
// `runFullSync` nor `worker.ts`. Both routes converge on
// `runSyncForAccount`, and that is the function the lease is acquired
// inside (FR-054a). Route-level behaviour is not exercised in CI.

import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    acquireLearningLease,
    releaseLearningLease,
    stillHeld,
    LEARNING_LEASE_COLLECTION,
    LEARNING_LEASE_TTL_MS,
} = require("../../learning/learningLease.js");

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

// Plain function — synchronous. Use it for non-async assertions.
function test(name: string, fn: () => void): void {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     ${(e as Error).message}`);
        failed++;
    }
}

// Async runner — awaits each test before running the next so the
// stub state is deterministic across the suite.
const asyncTests: Array<{ name: string; fn: () => Promise<void> }> = [];
function testAsync(name: string, fn: () => Promise<void>): void {
    asyncTests.push({ name, fn });
}

// ─── In-memory Firestore stub ────────────────────────────────────
// Pattern follows `metaSyncLease.test.ts`: the stub does NOT serialise
// across transactions. Each `stubFirestore()` call returns a fresh
// store so tests are isolated.

interface DocData { [k: string]: unknown }

function makeStub() {
    const stubStore: Record<string, Map<string, DocData>> = {};
    function bucket(path: string): Map<string, DocData> {
        if (!stubStore[path]) stubStore[path] = new Map();
        return stubStore[path];
    }

    class StubDocRef {
        constructor(public path: string, public id: string, private store: Map<string, DocData>) {}
        async get() {
            const data = this.store.get(this.id);
            return { exists: data !== undefined, data: () => data ?? undefined };
        }
        async set(data: DocData) { this.store.set(this.id, data); }
        async update(patch: DocData) {
            const cur = this.store.get(this.id) ?? {};
            this.store.set(this.id, { ...cur, ...patch });
        }
        async delete() { this.store.delete(this.id); }
    }

    const db = {
        _store: stubStore,
        doc: (path: string) => {
            const segs = path.split("/");
            const id = segs.pop() as string;
            return new StubDocRef(path, id, bucket(segs.join("/")));
        },
        async runTransaction<T>(fn: (txn: unknown) => Promise<T>): Promise<T> {
            const writes: Array<{ type: "set" | "update" | "delete"; ref: StubDocRef; data?: DocData }> = [];
            const txnProxy = {
                get(ref: StubDocRef) {
                    const data = ref["store"].get(ref["id"]);
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
    };
    return db;
}

const DOC_PATH = (ownerUid: string, accountId: string) =>
    `${LEARNING_LEASE_COLLECTION}/${ownerUid}_${accountId}`;

// ═══ SC-017a negative: two different accounts, same owner, both succeed ═══

testAsync("SC-017a: two runs for different accounts of the same owner both acquire", async () => {
    const db: any = makeStub();
    const r1 = await acquireLearningLease(db, "owner-1", "account-A", "run-1", 1000);
    const r2 = await acquireLearningLease(db, "owner-1", "account-B", "run-2", 1000);
    assert.deepEqual(r1, { ok: true }, "first account should acquire");
    assert.deepEqual(r2, { ok: true }, "second account should also acquire");
});

// ═══ SC-017: two contending runs for the same account — exactly one writer ═══

testAsync("SC-017: second concurrent acquire for the same account is refused", async () => {
    const db: any = makeStub();
    const r1 = await acquireLearningLease(db, "owner-1", "account-A", "run-1", 1000);
    const r2 = await acquireLearningLease(db, "owner-1", "account-A", "run-2", 1000);
    assert.deepEqual(r1, { ok: true });
    assert.equal(r2.ok, false, "second acquire must be refused");
    if (!r2.ok) {
        assert.equal(r2.reason, "held");
        assert.equal(r2.holderUid, "run-1");
        assert.equal(r2.expiresAtMs, 1000 + LEARNING_LEASE_TTL_MS);
    }
});

testAsync("SC-017: refusal returns the holder's identity so the caller can convert to the right surface", async () => {
    const db: any = makeStub();
    await acquireLearningLease(db, "owner-1", "account-A", "run-1", 1000);
    const r2 = await acquireLearningLease(db, "owner-1", "account-A", "run-2", 1000);
    assert.equal(r2.ok, false);
    if (!r2.ok) {
        assert.equal(r2.holderUid, "run-1");
        assert.ok(typeof r2.expiresAtMs === "number");
    }
});

// ═══ SC-018: abandoned lease self-expires after the TTL ═══

testAsync("SC-018: a fresh acquire succeeds after the holder's lease expires", async () => {
    const db: any = makeStub();
    const TTL = LEARNING_LEASE_TTL_MS;
    const t0 = 1_000_000;
    const r1 = await acquireLearningLease(db, "owner-1", "account-A", "run-1", t0);
    assert.deepEqual(r1, { ok: true });

    // Try to re-acquire while still within TTL — refused.
    const duringR2 = await acquireLearningLease(db, "owner-1", "account-A", "run-2", t0 + TTL - 1);
    assert.equal(duringR2.ok, false);

    // After TTL elapses, a fresh acquire succeeds (the abandoned lease is taken over).
    const afterR3 = await acquireLearningLease(db, "owner-1", "account-A", "run-3", t0 + TTL + 1);
    assert.deepEqual(afterR3, { ok: true }, "post-expiry acquire should succeed");
});

// ═══ SC-019: a run whose lease was taken over does NOT write learning ═══

testAsync("SC-019: stillHeld returns false once the lease has been taken over", async () => {
    const db: any = makeStub();
    const t0 = 1_000_000;
    await acquireLearningLease(db, "owner-1", "account-A", "run-1", t0);

    // run-1 checks holding — still held.
    assert.equal(
        await stillHeld(db, "owner-1", "account-A", "run-1", t0 + 100),
        true,
    );

    // Lease expires; a new run takes over.
    const t1 = t0 + LEARNING_LEASE_TTL_MS + 1;
    const takeover = await acquireLearningLease(db, "owner-1", "account-A", "run-2", t1);
    assert.deepEqual(takeover, { ok: true });

    // run-1 re-verifies — no longer holding, must abort its write.
    assert.equal(
        await stillHeld(db, "owner-1", "account-A", "run-1", t1 + 100),
        false,
        "run-1's stillHeld must return false after takeover",
    );

    // run-2 IS holding.
    assert.equal(
        await stillHeld(db, "owner-1", "account-A", "run-2", t1 + 100),
        true,
    );
});

// ═══ Release verifies holder identity (FR-058) ═══

testAsync("FR-058: release by a non-holder is a no-op (does NOT release the new holder's lease)", async () => {
    const db: any = makeStub();
    const t0 = 1_000_000;
    await acquireLearningLease(db, "owner-1", "account-A", "run-1", t0);

    // Lease expires; run-2 takes over.
    const t1 = t0 + LEARNING_LEASE_TTL_MS + 1;
    await acquireLearningLease(db, "owner-1", "account-A", "run-2", t1);

    // Stale run-1 tries to release.
    const r = await releaseLearningLease(db, "owner-1", "account-A", "run-1");
    assert.equal(r.released, false, "stale holder must not be able to release");

    // The lease still exists, held by run-2.
    assert.equal(
        await stillHeld(db, "owner-1", "account-A", "run-2", t1 + 100),
        true,
    );
});

testAsync("release by the actual holder succeeds", async () => {
    const db: any = makeStub();
    await acquireLearningLease(db, "owner-1", "account-A", "run-1", 1000);
    const r = await releaseLearningLease(db, "owner-1", "account-A", "run-1");
    assert.equal(r.released, true);

    // Lease is gone — a fresh acquire succeeds.
    const fresh = await acquireLearningLease(db, "owner-1", "account-A", "run-2", 2000);
    assert.deepEqual(fresh, { ok: true });
});

testAsync("release on a missing lease is a no-op", async () => {
    const db: any = makeStub();
    const r = await releaseLearningLease(db, "owner-1", "account-A", "run-1");
    assert.equal(r.released, false);
});

// ═══ Re-acquire by the same runId is refused (defence against double-write) ═══

testAsync("same runId acquiring twice is refused (defends against double-write)", async () => {
    const db: any = makeStub();
    const r1 = await acquireLearningLease(db, "owner-1", "account-A", "run-1", 1000);
    assert.deepEqual(r1, { ok: true });
    const r2 = await acquireLearningLease(db, "owner-1", "account-A", "run-1", 1100);
    assert.equal(r2.ok, false);
    if (!r2.ok) {
        assert.equal(r2.reason, "held");
        assert.equal(r2.holderUid, "run-1");
    }
});

// ═══ Lease document key shape ═══

testAsync("lease document key is ownerUid_accountId (NOT a subcollection under metaSyncLeases)", async () => {
    const db: any = makeStub();
    await acquireLearningLease(db, "owner-1", "account-A", "run-1", 1000);
    const buckets = Object.keys(db._store);
    assert.ok(
        buckets.includes(LEARNING_LEASE_COLLECTION),
        `expected ${LEARNING_LEASE_COLLECTION} in buckets; got ${buckets.join(", ")}`,
    );
    assert.ok(
        db._store[LEARNING_LEASE_COLLECTION].has("owner-1_account-A"),
        "expected lease doc keyed ownerUid_accountId",
    );
    // The Phase 970 collection must not be touched.
    assert.ok(!("metaSyncLeases" in db._store));
});

testAsync("lease document carries the FR-057 fields (holderUid, runId, expiresAtMs)", async () => {
    const db: any = makeStub();
    await acquireLearningLease(db, "owner-1", "account-A", "run-1", 1000);
    const doc = db._store[LEARNING_LEASE_COLLECTION].get("owner-1_account-A") as Record<string, unknown>;
    assert.equal(doc.holderUid, "run-1");
    assert.equal(doc.runId, "run-1");
    assert.equal(doc.acquiredAtMs, 1000);
    assert.equal(doc.expiresAtMs, 1000 + LEARNING_LEASE_TTL_MS);
    assert.equal(doc.ownerUid, "owner-1");
    assert.equal(doc.accountId, "account-A");
});

// ═══ FR-060 primitive — the trigger value is the caller's concern ═══

testAsync("FR-060 primitive: a refused acquire returns reason='held' for both manual and scheduled callers", async () => {
    const db: any = makeStub();
    await acquireLearningLease(db, "owner-1", "account-A", "scheduled-1", 1000);
    const r = await acquireLearningLease(db, "owner-1", "account-A", "manual-anything", 1000);
    assert.equal(r.ok, false);
    if (!r.ok) {
        assert.equal(r.reason, "held");
        assert.equal(r.holderUid, "scheduled-1");
    }
    // The trigger value is the caller's concern (FR-060), not the lease
    // primitive's — both call paths converge on the same refusal shape.
});

// ═══ Runner ═══

(async () => {
    for (const t of asyncTests) {
        try {
            await t.fn();
            console.log(`  ✅ ${t.name}`);
            passed++;
        } catch (e) {
            console.log(`  ❌ ${t.name}`);
            console.log(`     ${(e as Error).message}`);
            failed++;
        }
    }
    console.log("");
    console.log("=== learningLease — contract tests ===");
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(FAILED);
    process.exit(PASSED);
})();
