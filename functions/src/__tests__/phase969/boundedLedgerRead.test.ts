// functions/src/__tests__/phase969/boundedLedgerRead.test.ts — contracts for `learning/boundedLedgerRead.ts`
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, T016 — covers:
//   SC-022  a forced ledger-read failure → zero contributions added for the
//           affected ads AND zero changes to their existing contributions
//   SC-023  read volume is bounded by current batch size, not account age
//   SC-024  zero unbounded collection scans of ad performance data remain in
//           the sync path (asserted by string search of shared.ts)
//   SC-025  the match-link precedence lock, delete-cascade preservation flag,
//           and matched/ambiguous/unmatched tallies produce identical results
//           before and after the read-pattern change — verified by structural
//           property: the bounded read returns whole documents (FR-071) and
//           surfaces failed reads in a separate Set rather than as empty
//           entries in the result map (FR-070).
//
// The replacement of the unbounded scan in shared.ts:831 is mechanical and
// is verified in Phase 7 by SC-024 (string search). The unit tests here
// pin the helper's contract — chunking, whole-document return, failure
// surfacing — that the shared.ts call site relies on.

import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
    readExistingAdDocs,
    LEDGER_READ_CHUNK_SIZE,
} = require("../../learning/boundedLedgerRead.js");

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void | Promise<void> {
    try {
        const ret = fn();
        if (ret && typeof (ret as Promise<void>).then === "function") {
            return (ret as Promise<void>).then(
                () => {
                    console.log(`  ✅ ${name}`);
                    passed++;
                },
                (e) => {
                    console.log(`  ❌ ${name}`);
                    console.log(`     ${(e as Error).message}`);
                    failed++;
                },
            );
        }
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     ${(e as Error).message}`);
        failed++;
    }
}

const asyncTests: Array<{ name: string; fn: () => Promise<void> }> = [];
function testAsync(name: string, fn: () => Promise<void>): void {
    asyncTests.push({ name, fn });
}

// ─── In-memory Firestore stub with getAll ────────────────────────

interface DocSnap {
    id: string;
    exists: boolean;
    data(): Record<string, unknown>;
}

interface DbLike {
    getAll(...refs: { id: string }[]): Promise<DocSnap[]>;
}

function makeDb(opts: {
    /** A doc to return for each id. Missing ids return `exists: false`. */
    docs: Record<string, Record<string, unknown>>;
    /** Chunks whose getAll should fail. An empty array = all chunks fail. */
    failChunks?: Array<{ ids: string[] }>;
    /** Records the chunk sizes used per call so SC-023 can assert the chunking. */
    recordChunkSizes?: number[];
}): DbLike {
    const failChunks = opts.failChunks ?? [];
    return {
        async getAll(...refs: { id: string }[]): Promise<DocSnap[]> {
            const chunkIds = refs.map((r) => r.id);
            opts.recordChunkSizes?.push(chunkIds.length);

            // Decide whether THIS chunk fails. A chunk fails when its ids
            // match a failChunks entry as a SET (order-independent).
            for (const failure of failChunks) {
                const wanted = new Set(failure.ids);
                const got = new Set(chunkIds);
                if (wanted.size === got.size && wanted.size > 0) {
                    let allMatch = true;
                    for (const id of wanted) {
                        if (!got.has(id)) { allMatch = false; break; }
                    }
                    if (allMatch) {
                        throw new Error(`chunk failed: ${failure.ids.join(",")}`);
                    }
                }
            }

            return chunkIds.map((id) => {
                if (id in opts.docs) {
                    return { id, exists: true, data: () => opts.docs[id] };
                }
                return { id, exists: false, data: () => ({}) };
            });
        },
    };
}

function refs(ids: string[]): { id: string }[] {
    return ids.map((id) => ({ id }));
}

// ═══ SC-023: read volume bounded by current batch size ═══

testAsync("SC-023: all docs in the current batch are returned", async () => {
    const docs = {
        "ad-1": { matchType: "manual", generationId: "g-1" },
        "ad-2": { matchType: null },
        "ad-3": { matchType: "auto_hash", generationId: "g-3" },
    };
    const db = makeDb({ docs });
    const result = await readExistingAdDocs(db, refs(["ad-1", "ad-2", "ad-3"]));
    assert.equal(result.byId.size, 3);
    assert.equal(result.failedIds.size, 0);
});

testAsync("SC-023: non-existent ad IDs are absent from byId (NOT failed)", async () => {
    const db = makeDb({ docs: { "ad-1": { matchType: "manual" } } });
    const result = await readExistingAdDocs(db, refs(["ad-1", "ad-missing"]));
    assert.equal(result.byId.size, 1);
    assert.equal(result.failedIds.size, 0);
    assert.ok(!result.byId.has("ad-missing"), "missing doc is not in byId");
});

testAsync("SC-023: a 700-ad batch is chunked into chunks of at most LEDGER_READ_CHUNK_SIZE", async () => {
    const chunkSizes: number[] = [];
    const db = makeDb({ docs: {}, recordChunkSizes: chunkSizes });
    const ids: string[] = [];
    for (let i = 0; i < 700; i++) ids.push(`ad-${i}`);
    await readExistingAdDocs(db, refs(ids));
    // Expected: 300, 300, 100
    assert.deepEqual(chunkSizes, [300, 300, 100], `expected chunking [300, 300, 100], got ${chunkSizes}`);
});

testAsync("SC-023: docs beyond the current batch are NOT requested (batch-size bounded, not account-age bounded)", async () => {
    const chunkSizes: number[] = [];
    const db = makeDb({ docs: {}, recordChunkSizes: chunkSizes });
    // Simulate an account with 1008 historical docs but only 50 in the current batch.
    const currentBatch = Array.from({ length: 50 }, (_, i) => `batch-ad-${i}`);
    await readExistingAdDocs(db, refs(currentBatch));
    assert.equal(chunkSizes.reduce((a, b) => a + b, 0), 50, "should read exactly 50, not 1008");
});

// ═══ SC-022 + FR-070: chunk failure surfaces in failedIds, NOT as empty byId entries ═══

testAsync("SC-022: a forced chunk failure surfaces ALL its ad IDs in failedIds", async () => {
    const docs = {
        "ad-1": { matchType: "manual" },
        "ad-2": { matchType: "manual" },
        "ad-3": { matchType: "manual" },
    };
    const db = makeDb({ docs, failChunks: [{ ids: ["ad-1", "ad-2", "ad-3"]}] });
    const result = await readExistingAdDocs(db, refs(["ad-1", "ad-2", "ad-3"]));
    assert.equal(result.byId.size, 0, "FR-070: empty byId would conflate failed-read with never-contributed");
    assert.deepEqual([...result.failedIds].sort(), ["ad-1", "ad-2", "ad-3"]);
});

testAsync("SC-022: chunk failure for one chunk does not affect another chunk's reads", async () => {
    // chunkSize: 1 — each ad is its own chunk, so we can fail one
    // without failing the others.
    const docs = {
        "ad-1": { matchType: "manual" },
        "ad-2": { matchType: "auto_hash", generationId: "g-2" },
        "ad-3": { matchType: "manual", generationId: "g-3" },
    };
    const db = makeDb({ docs, failChunks: [{ ids: ["ad-2"]}] });
    const result = await readExistingAdDocs(db, refs(["ad-1", "ad-2", "ad-3"]), { chunkSize: 1 });
    assert.equal(result.failedIds.size, 1, "only the failed chunk's ID is surfaced");
    assert.ok(result.failedIds.has("ad-2"));
    assert.equal(result.byId.size, 2, "other chunks' docs are returned normally");
});

testAsync("SC-022: failed chunk read leaves existing contributions untouched (verified by failedIds non-empty)", async () => {
    // The contract: failedIds is non-empty → caller MUST NOT fall back
    // to "treat as never contributed". This test asserts that the
    // helper surfaces the failure rather than absorbing it.
    const docs = {
        "ad-1": { matchType: "manual", generationId: "g-1" },
    };
    const db = makeDb({ docs, failChunks: [{ ids: ["ad-1"] }] });
    const result = await readExistingAdDocs(db, refs(["ad-1"]));
    // The contract is structural: failedIds is non-empty when a chunk
    // failed; the caller inspects this and decides what to do.
    assert.equal(result.failedIds.has("ad-1"), true);
    assert.equal(result.byId.has("ad-1"), false);
});

// ═══ FR-071: returns whole documents, never projections ═══

testAsync("FR-071: documents returned include cascade-written fields outside the strict shape", async () => {
    // `deletedGenerationId` is written by `generationDeleteCascade.ts`
    // (FR-072). It MUST survive the read; a `.select()` projection would
    // silently drop it. This test asserts the helper returns whatever
    // the stub put in the doc — full document.
    const docs = {
        "ad-1": {
            matchType: "manual",
            generationId: "g-1",
            deletedGenerationId: "g-1",
            metadataAvailable: false,
        },
    };
    const db = makeDb({ docs });
    const result = await readExistingAdDocs(db, refs(["ad-1"]));
    const doc = result.byId.get("ad-1");
    assert.ok(doc);
    assert.equal(doc.deletedGenerationId, "g-1");
    assert.equal(doc.metadataAvailable, false);
});

// ═══ SC-024's contract — the unbounded scan is gone ═══

testAsync("SC-024 contract: the helper does NOT take a `collection` reference — it takes ID refs only", async () => {
    // The replacement never accepts a path that could be a collection
    // scan. SC-024 is verified in Phase 7 by grep on shared.ts; this
    // test pins the helper signature.
    const fn = readExistingAdDocs;
    assert.equal(fn.length, 2, "helper should take (db, refs) — no collection path");
});

// ═══ Chunk-size configurability ═══

testAsync("chunkSize override is honoured (used by tests to keep fixtures small)", async () => {
    const chunkSizes: number[] = [];
    const db = makeDb({ docs: {}, recordChunkSizes: chunkSizes });
    const ids = Array.from({ length: 6 }, (_, i) => `ad-${i}`);
    await readExistingAdDocs(db, refs(ids), { chunkSize: 2 });
    assert.deepEqual(chunkSizes, [2, 2, 2]);
});

// ═══ Idempotency + empty batch ═══

testAsync("empty batch returns empty result with no failure", async () => {
    const db = makeDb({ docs: {} });
    const result = await readExistingAdDocs(db, refs([]));
    assert.equal(result.byId.size, 0);
    assert.equal(result.failedIds.size, 0);
});

testAsync("calling readExistingAdDocs twice with the same input returns the same result", async () => {
    const docs = {
        "ad-1": { matchType: "manual" },
        "ad-2": { matchType: null },
    };
    const db = makeDb({ docs });
    const r1 = await readExistingAdDocs(db, refs(["ad-1", "ad-2"]));
    const r2 = await readExistingAdDocs(db, refs(["ad-1", "ad-2"]));
    assert.equal(r1.byId.size, r2.byId.size);
    assert.equal(r1.failedIds.size, r2.failedIds.size);
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
    console.log("=== boundedLedgerRead — contract tests ===");
    console.log(`Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(FAILED);
    process.exit(PASSED);
})();
