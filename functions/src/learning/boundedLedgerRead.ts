// functions/src/learning/boundedLedgerRead.ts — chunked by-ID read of ad performance docs (FR-067–FR-072)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// IMPURE module (touches Firestore). Replaces the unbounded
// `collection("adPerformance").get()` collection scan at
// `metaSync/shared.ts:831` with a chunked by-ID read over exactly the
// current sync's ad batch.
//
// Why this exists (from the spec):
//   - FR-067: correctness MUST NOT depend on an unbounded scan completing.
//   - FR-068: the existing unbounded read MUST be removed entirely.
//   - FR-069: every chunk completes before any write.
//   - FR-070: a failed chunk MUST abort the learning write for that chunk
//     rather than be read as "no prior contribution".
//   - FR-071: returns whole documents, never projections — the cascade's
//     `deletedGenerationId` and `metadataAvailable` live outside the
//     strict shape the sync writes.
//   - FR-072: three non-learning behaviours share this read (match-link
//     precedence lock, delete-cascade preservation flag, matched/ambiguous/
//     unmatched tallies). The bounded read is behaviour-identical for each
//     because all three are per-ad lookups for ads already in the batch.
//
// Chunk size is **300**: the value-list query cap is 30 (too small); the
// multi-document fetch has no documented per-call count cap so the chunk
// size is policy, chosen for consistency with the existing 450-op
// write-batch chunking.

// ─── Result shape ────────────────────────────────────────────────
// `byId` carries the documents that read successfully. `failedIds` lists
// the ad IDs whose chunk read failed — callers MUST consult this set
// and not fall back to "treat as never contributed" (FR-070).
export interface BoundedLedgerReadResult {
    byId: Map<string, Record<string, unknown>>;
    failedIds: Set<string>;
}

// ─── Loosely-typed Firestore surface for in-memory stubbing ──────

interface DocSnap {
    id: string;
    exists: boolean;
    data(): Record<string, unknown> | undefined;
}

interface DocRef {
    id: string;
}

interface DbLike {
    getAll(...refs: DocRef[]): Promise<DocSnap[]>;
}

// ─── Constants ──────────────────────────────────────────────────

/** Per FR-069: chunk size policy. See file header. */
export const LEDGER_READ_CHUNK_SIZE = 300;

/**
 * Read `adPerformance` documents by ID, in chunks of `LEDGER_READ_CHUNK_SIZE`.
 *
 * @param db       A Firestore-shaped handle (real or stub) with `getAll`.
 * @param refs     The document references to fetch. Each ref's `id` is
 *                 the ad's id (and the map key in the result).
 * @param options.chunkSize  Optional override for testing; production uses
 *                           the constant.
 *
 * @returns A `BoundedLedgerReadResult` with the documents that read
 *          successfully in `byId` and the IDs whose chunk failed in
 *          `failedIds`.
 *
 * **FR-070 contract**: a chunk failure MUST surface in `failedIds`, never
 * as an empty entry in `byId`. Conflating the two reintroduces the
 * double-count the spec forbids.
 */
export async function readExistingAdDocs(
    db: DbLike,
    refs: DocRef[],
    options: { chunkSize?: number } = {},
): Promise<BoundedLedgerReadResult> {
    const chunkSize = options.chunkSize ?? LEDGER_READ_CHUNK_SIZE;
    const byId = new Map<string, Record<string, unknown>>();
    const failedIds = new Set<string>();

    for (let i = 0; i < refs.length; i += chunkSize) {
        const chunk = refs.slice(i, i + chunkSize);
        const chunkAdIds = chunk.map((r) => r.id);
        try {
            // Every chunk completes (or fails) before the next is issued.
            // FR-069: a partially-read ledger must not produce a
            // partially-applied contribution decision.
            const snaps = await db.getAll(...chunk);
            for (const snap of snaps) {
                if (snap.exists) {
                    // FR-071: whole documents, never projections. A `.select()`
                    // would silently drop cascade-written fields outside the
                    // strict shape the sync writes.
                    byId.set(snap.id, snap.data() ?? {});
                }
                // Non-existent doc: treat as "never contributed" — that's
                // the legitimate case, not the failed-read case.
            }
        } catch (_e: unknown) {
            // FR-070: do NOT read this as "these ads have no prior
            // contribution". Surface the failure so the caller can abort
            // learning writes for this chunk. Empty `byId` entry would
            // exactly reproduce the double-count bug.
            for (const id of chunkAdIds) failedIds.add(id);
        }
    }

    return { byId, failedIds };
}
