# Contract — `functions/src/learning/learningLease.ts`

**Impure** (Firestore). Requirements: FR-054–FR-065, FR-060a.

## Exports

```
acquireLearningLease(db, ownerUid, accountId, runId, nowMs, ttlMs): AcquireResult
releaseLearningLease(db, ownerUid, accountId, runId): void
stillHeld(db, ownerUid, accountId, runId, nowMs): boolean
```

## Non-negotiables

- **NEW collection, keyed per `(ownerUid, accountId)`.** NOT
  `metaSyncLeases/{ownerUid}` — that key **cannot serialise per account** (an owner
  with three accounts would have all three contending for one document), and Phase
  970's guard does not reach `worker.ts:19` / `:61` (FR-054b, FR-059 as corrected).
  `functions/src/metaSync/lease.ts` is **not modified**.
- **Call site is inside `runSyncForAccount`**, around the learning write only
  (FR-054a, FR-055). Every route converges there; the orchestrator does not.
- Acquire and release are **atomic single-document transactions** (FR-056). A plain
  read-then-write reintroduces the exact race the lease exists to remove.
- Release **verifies holder identity** (FR-058) — a run whose lease expired and was
  taken over must not release its successor's.
- TTL **15 min** (FR-059). Self-expiring; no permanent lock, no manual intervention.
- **Re-verify holding immediately before committing**, and abort the learning write
  if not held (FR-062). The residual window is acknowledged, not papered over
  (FR-063).
- An abort leaves existing records untouched and does **not** fail the surrounding
  sync (FR-064, FR-052), and is recorded as an auditable event.

The record **shape** is shared with Phase 970's guard — holder identity plus absolute
expiry (FR-057). The **document** and the **key** are not.

## MANDATORY ordering (FR-060a)

```
1. fetch → compute → COMMIT operational status writes   (FR-009)
2. THEN attempt to acquire the lease
3. on failure, signal for retry (scheduled) or fail fast (manual)   (FR-060)
```

The natural implementation order is the reverse, and nothing outside FR-060a forbids
it. Signalling failure does **not** roll back a committed write; the retry re-applies
the operational writes harmlessly, as FR-055's own rationale already establishes them
to be idempotent per-ad overwrites. **This applies to the manual path too**, so an
owner told a refresh is already running still receives a current action list from the
run that told them. (SC-049)

## The threat model (FR-054c)

Two or more `runSyncForAccount` invocations for **one account**, concurrently, with
**no platform deduplication available**:

- Neither enqueue site supplies a Cloud Tasks task name
  (`orchestrator.ts:588-611`, `dispatcher.ts:162-179`), so names are generated and
  two enqueues produce two independent tasks.
- `maxConcurrentDispatches: 5` (`worker.ts:39`) is **queue-wide**, not per-account.
- Three independent routes to a same-account pair: separate enqueuers (the 03:00
  dispatcher and a manual fan-out), `maxAttempts: 3` retrying over a still-running
  original, and `seenAccounts` (`dispatcher.ts:100-104`) deduplicating within one run
  only.

Under today's overwrite semantics two concurrent writers are harmless — the same
value written twice is the same value. **Under delta accumulation they add the same
conversions twice, silently, into the figures that steer generation.**

## Discriminating tests

- **SC-043** fails if the lease is reachable only through `runFullSync`.
- **SC-017** requires the two contending runs to arrive by **different routes** — one
  inline, one via the Cloud Tasks worker. Two inline runs would pass on Phase 970's
  guard alone, exercising none of this contract.
- **SC-017a** fails if the key is per owner: two accounts of one owner must **both**
  proceed.
- **SC-044** asserts zero conversions counted twice under the scheduled-versus-manual
  pairing.
