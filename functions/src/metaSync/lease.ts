// functions/src/metaSync/lease.ts — Phase 970 Batch 4
// ═══════════════════════════════════════════════════════════
// In-flight sync guard. The investigation report §6 defines the
// contract that bans any time-based cooldown and pins this to a
// state-based lease:
//
//   - **TTL ≤ 10 min** (longer than the worst-case run, shorter than
//     any plausible stuck state). 600 000 ms by default.
//   - **Holder identity is verified on release.** A run whose lease
//     already expired and was taken over by a successor cannot
//     release the successor's lease. This is the rule that prevents
//     the original D2-style "different code path writes the same
//     field" footgun.
//   - **Stale leases are overwritten on acquire**, not refused. A
//     run that ran to completion but crashed before clearing its
//     lease must NOT lock the button for ~10 minutes; the next press
//     takes over.
//   - **Acquired in a `finally`-cleared block by the runner.** The
//     press path does:
//
//         try {
//             const lease = await acquireLease(ownerUid, callerUid);
//             if (!lease.ok) throw new AlreadyRunningError(lease);
//             return await runFullSync(...);
//         } finally {
//             await releaseLease(ownerUid, callerUid);
//         }
//
//     The finally fires on success AND on thrown errors.
//
//   - **Never keyed on `lastMetaSyncAt`.** That field is what caused
//     D2 — the cross-contamination bug where the legacy sync
//     stamped the dashboard's cooldown field. The lease lives at a
//     **separate document** (`metaSyncLeases/{ownerUid}`) so no
//     read/write can accidentally alias into a cooldown-side
//     surface.
//
//   - **Path is private to the server.** `firestore.rules` denies
//     client reads; the lease is server-only state. This matches the
//     existing `private/**` deny-all posture.
//
// `acquireLease` and `releaseLease` are pure (deps-injected) so the
// test suite can drive them with an in-memory Firestore stub plus
// `nowMs` overrides. The orchestrator threads the real `getDb()` in
// production via default args.
//
// EXPORTED here, NOT from the orchestrator, so the lease file is
// testable in isolation and so Batch 5 can grow "observing the lease"
// diagnostics without churning the orchestrator.
// ═══════════════════════════════════════════════════════════

export const LEASE_DOC_COLLECTION = "metaSyncLeases";
export const LEASE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface LeaseHolder {
    ownerUid: string;
    holderUid: string;
    acquiredAtMs: number;
    expiresAtMs: number;
}

export type AcquireResult =
    | { ok: true }
    | {
          ok: false;
          holderUid: string;
          expiresAtMs: number;
      };

/**
 * Read the current lease doc. Returns `null` if absent.
 */
async function readLease(
    db: { doc: (path: string) => { get: () => Promise<{ exists: boolean; data: () => any }> } },
    ownerUid: string,
): Promise<LeaseHolder | null> {
    const snap = await db.doc(`${LEASE_DOC_COLLECTION}/${ownerUid}`).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (
        typeof data.holderUid !== "string" ||
        typeof data.ownerUid !== "string" ||
        typeof data.acquiredAtMs !== "number" ||
        typeof data.expiresAtMs !== "number"
    ) {
        return null;
    }
    return data as LeaseHolder;
}

/**
 * STALE-RACE-FREE acquire.
 *
 * Decision tree:
 *   1. No doc OR doc's expiresAtMs is in the past (stale) → overwrite with the
 *      new holder + new TTL. The takeover is recorded for the audit log.
 *   2. Doc's holder is us (callerUid matches) → extend by TTL from now
 *      (idempotent re-acquire).
 *   3. Doc's holder is somebody else AND not stale → return their identity
 *      so the runner can convert the failure into a user-visible
 *      "sync already running" message.
 *
 * Implemented as a Firestore `runTransaction` so a concurrent acquire
 * from a different worker is serialised by the database. Without that,
 * two presses landing in the same millisecond would both pass the
 * stale-read check and both proceed — exactly the race we are blocking.
 */
export async function acquireLease(
    db: FirebaseFirestore.Firestore,
    ownerUid: string,
    callerUid: string,
    nowMs: number,
    ttlMs: number = LEASE_TTL_MS,
): Promise<AcquireResult> {
    const ref = db.doc(`${LEASE_DOC_COLLECTION}/${ownerUid}`);

    return db.runTransaction(async (txn) => {
        const snap = await txn.get(ref);
        const current = snap.exists ? (snap.data() as LeaseHolder | undefined) : undefined;

        // Stale or absent: take it.
        if (!current || current.expiresAtMs <= nowMs) {
            const fresh: LeaseHolder = {
                ownerUid,
                holderUid: callerUid,
                acquiredAtMs: nowMs,
                expiresAtMs: nowMs + ttlMs,
            };
            txn.set(ref, fresh);
            return { ok: true } as AcquireResult;
        }

        // Same holder re-pressing: extend (TTLs refresh).
        if (current.holderUid === callerUid) {
            txn.update(ref, { expiresAtMs: nowMs + ttlMs });
            return { ok: true } as AcquireResult;
        }

        // Held by somebody else — refuse.
        return {
            ok: false,
            holderUid: current.holderUid,
            expiresAtMs: current.expiresAtMs,
        } as AcquireResult;
    });
}

/**
 * Release the lease IF we still hold it.
 *
 * Holder-identity check is the load-bearing defence: a stale run
 * whose lease has since expired (and possibly been taken over by a
 * fresh run) MUST NOT clear the new holder's lease. The check
 * happens inside the transaction so a write that beats us by a hair
 * still wins.
 */
export async function releaseLease(
    db: FirebaseFirestore.Firestore,
    ownerUid: string,
    callerUid: string,
): Promise<{ released: boolean }> {
    const ref = db.doc(`${LEASE_DOC_COLLECTION}/${ownerUid}`);

    return db.runTransaction(async (txn) => {
        const snap = await txn.get(ref);
        if (!snap.exists) return { released: false };
        const data = snap.data() as LeaseHolder | undefined;
        if (!data || data.holderUid !== callerUid) return { released: false };
        txn.delete(ref);
        return { released: true };
    });
}

/**
 * Domain error thrown by the runner when the lease is held by someone
 * else. The wrappers catch this and translate to the right surface
 * (HttpsError for callables, throw for the scheduled job so Cloud
 * Tasks retries).
 */
export class AlreadyRunningError extends Error {
    public readonly holderUid: string;
    public readonly expiresAtMs: number;
    constructor(opts: { holderUid: string; expiresAtMs: number }) {
        // The message echoes the holder uid so an operator reading
        // logs can attribute the contention. "Until" gives a wait
        // point (the auto-release boundary), but the headline is
        // "already running" — a state, not a wait.
        super(
            `A Meta sync is already running for this account ` +
            `(held by ${opts.holderUid} until ${new Date(opts.expiresAtMs).toISOString()}).`,
        );
        this.name = "AlreadyRunningError";
        this.holderUid = opts.holderUid;
        this.expiresAtMs = opts.expiresAtMs;
    }
}
