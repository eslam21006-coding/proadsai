// functions/src/learning/learningLease.ts — per-account lease around the learning write (FR-054–FR-065)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// IMPURE module (touches Firestore). Implements the per-account lease that
// serialises the learning write inside `runSyncForAccount` (FR-054a).
//
// THIS IS NOT PHASE 970'S LEASE.
// Phase 970's lease (`functions/src/metaSync/lease.ts`) is keyed per
// **owner** and does not reach `worker.ts:19`/`:61`, where the Cloud
// Tasks worker calls `runSyncForAccount` directly. That lease covers the
// `runFullSync` orchestrator path but leaves the fan-out and the entire
// 03:00 scheduled cycle unleased. Under delta accumulation (Phase 3) two
// concurrent workers would add the same conversions twice silently.
//
// This lease lives in its OWN collection, `learningLeases`, keyed on
// `(ownerUid, accountId)`. The shape — holder identity plus absolute
// expiry — is shared with Phase 970's guard. The collection and the
// document key are not (FR-059 as corrected, FR-054b).
//
// TTL is 15 minutes (FR-059). Acquisition and release are atomic
// single-document transactions (FR-056). Release verifies holder
// identity (FR-058). A pre-commit re-verification (`stillHeld`) lets
// the caller fence off a lease that expired mid-write (FR-062, FR-063).
//
// The manual-vs-scheduled distinction is the caller's responsibility
// (FR-060). This module does not read `trigger`.

import type { AcquireResult } from "./types.js";

// ─── Collection + TTL constants ───────────────────────────────────

export const LEARNING_LEASE_COLLECTION = "learningLeases";
export const LEARNING_LEASE_TTL_MS = 15 * 60 * 1000; // FR-059

// ─── Holder shape (Firestore document) ────────────────────────────

export interface LearningLeaseHolder {
    ownerUid: string;
    accountId: string;
    holderUid: string;
    runId: string;
    acquiredAtMs: number;
    expiresAtMs: number;
}

// ─── Firestore shape we consume (loose, for in-memory stubs) ──────
// Production passes a real `FirebaseFirestore.Firestore`. Tests pass
// an in-memory stub with the same surface.

interface DocSnap {
    exists: boolean;
    data(): Record<string, unknown> | undefined;
}

interface DocRef {
    get(): Promise<DocSnap>;
    set(data: Record<string, unknown>): Promise<void>;
    update(data: Record<string, unknown>): Promise<void>;
    delete(): Promise<void>;
}

interface Txn {
    get(ref: DocRef): Promise<DocSnap>;
    set(ref: DocRef, data: Record<string, unknown>): void;
    update(ref: DocRef, data: Record<string, unknown>): void;
    delete(ref: DocRef): void;
}

interface DbLike {
    doc(path: string): DocRef;
    runTransaction<T>(fn: (txn: Txn) => Promise<T>): Promise<T>;
}

// ─── Helpers ──────────────────────────────────────────────────────

function leaseDocPath(ownerUid: string, accountId: string): string {
    return `${LEARNING_LEASE_COLLECTION}/${ownerUid}_${accountId}`;
}

function parseHolder(data: Record<string, unknown> | undefined): LearningLeaseHolder | null {
    if (!data) return null;
    if (
        typeof data.ownerUid !== "string" ||
        typeof data.accountId !== "string" ||
        typeof data.holderUid !== "string" ||
        typeof data.runId !== "string" ||
        typeof data.acquiredAtMs !== "number" ||
        typeof data.expiresAtMs !== "number"
    ) {
        return null;
    }
    return data as unknown as LearningLeaseHolder;
}

// ─── Acquire (FR-054, FR-056, FR-057) ─────────────────────────────
//
// Stale-or-absent: take it. Held-by-someone-else: refuse with their
// identity so the caller can convert the failure into the right
// surface (FR-060). Held-by-our-runId: refuse (Phase 970 bug fix;
// a single run must not acquire twice and double-write).
export async function acquireLearningLease(
    db: DbLike,
    ownerUid: string,
    accountId: string,
    runId: string,
    nowMs: number,
    ttlMs: number = LEARNING_LEASE_TTL_MS,
): Promise<AcquireResult> {
    // Defensive guard: a non-positive or non-finite TTL would write an
    // already-expired lease. The next caller would see "expired" and
    // take over, defeating the lock. Surface as RangeError.
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
        throw new RangeError(`ttlMs must be a positive finite number (got ${ttlMs})`);
    }
    const ref = db.doc(leaseDocPath(ownerUid, accountId));

    return db.runTransaction(async (txn) => {
        const snap = await txn.get(ref);
        const current = parseHolder(snap.exists ? snap.data() : undefined);

        if (!current || current.expiresAtMs <= nowMs) {
            const fresh: LearningLeaseHolder = {
                ownerUid,
                accountId,
                holderUid: runId,
                runId,
                acquiredAtMs: nowMs,
                expiresAtMs: nowMs + ttlMs,
            };
            txn.set(ref, fresh as unknown as Record<string, unknown>);
            return { ok: true };
        }

        // Held by our own runId: refuse. Two acquires from the same run
        // would double-write the deltas (FR-018). The caller treats this
        // as a programming error rather than user-visible contention.
        if (current.runId === runId) {
            return {
                ok: false,
                reason: "held",
                holderUid: current.holderUid,
                expiresAtMs: current.expiresAtMs,
            };
        }

        // Held by somebody else — refuse with their identity.
        return {
            ok: false,
            reason: "held",
            holderUid: current.holderUid,
            expiresAtMs: current.expiresAtMs,
        };
    });
}

// ─── Release (FR-058) ─────────────────────────────────────────────
//
// Holder-identity check is the load-bearing defence: a stale run whose
// lease has since expired (and may have been taken over) MUST NOT
// clear the new holder's lease. The check happens inside the
// transaction so a write that beats us by a hair still wins.
export async function releaseLearningLease(
    db: DbLike,
    ownerUid: string,
    accountId: string,
    runId: string,
): Promise<{ released: boolean }> {
    const ref = db.doc(leaseDocPath(ownerUid, accountId));

    return db.runTransaction(async (txn) => {
        const snap = await txn.get(ref);
        if (!snap.exists) return { released: false };
        const current = parseHolder(snap.exists ? snap.data() : undefined);
        if (!current || current.runId !== runId) return { released: false };
        txn.delete(ref);
        return { released: true };
    });
}

// ─── Pre-commit fencing (FR-062) ─────────────────────────────────
//
// Re-verify holding immediately before committing the learning write.
// A run whose lease was force-expired and taken over MUST abort its
// learning write entirely (FR-064). The check narrows the residual
// window (FR-063); it does not eliminate it.
export async function stillHeld(
    db: DbLike,
    ownerUid: string,
    accountId: string,
    runId: string,
    nowMs: number,
): Promise<boolean> {
    const ref = db.doc(leaseDocPath(ownerUid, accountId));
    const snap = await ref.get();
    if (!snap.exists) return false;
    const current = parseHolder(snap.exists ? snap.data() : undefined);
    if (!current) return false;
    if (current.runId !== runId) return false;
    if (current.expiresAtMs <= nowMs) return false;
    return true;
}
