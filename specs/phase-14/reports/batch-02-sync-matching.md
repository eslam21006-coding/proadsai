# Phase 14 — Batch 02 Report

**Feature branch**: `phase-14-rag-meta`
**PR**: #54
**Tasks**: T019-T038 (Phase 2a/2b/2c)
**Date**: 2026-07-13

---

## Summary

Implements Layer 2 (Daily Sync) + Layer 3 (Image Matching) of the RAG + Meta
Reporting Feedback Loop. Closes the data foundation that Batch 03 (verdicts)
and Batch 05 (dashboard / RAG) will consume.

### What ships

- **Pure modules** (`tokenCrypto.ts`, `metaGraph.ts`, `perceptualHash.ts`) +
  61 unit tests.
- **Sync infrastructure**: `metaDailySync` dispatcher (3am UTC), Cloud Tasks
  worker (`metaSyncAccountWorker`), and `triggerMetaSync` callable with a
  1-hour cooldown.
- **Meta connection**: `connectMetaAccount` / `disconnectMetaAccount`
  callables with 1:1 workspace↔account enforcement and KMS-encrypted token
  storage at `users/{uid}/workspaces/{wid}/private/metaConnection`.
- **Image matching write path**: `serverGenerateFinalAd` computes and returns
  the perceptual hash; the client writes the hash to the generation doc and
  the workspace-scoped `imageFingerprints/{hash}` index.
- **Manual matching**: `linkUnmatchedAd` callable (manual links are locked
  and authoritative).
- **Backfill migration**: `backfillImageFingerprints` callable (idempotent,
  workspace-assigned generations only).
- **Generation delete cascade**: `onGenerationDeleted` Firestore trigger sets
  `metadataAvailable: false` on all matched adPerformance records.

---

## Tasks Completed

### Phase 2a — Pure modules

| ID | Task | Status |
|---|---|---|
| T021 | `tokenCrypto.ts` — KMS envelope encryption | ✅ |
| T019 | `tokenCrypto.test.ts` — round-trip | ✅ (15 tests) |
| T022 | `metaGraph.ts` — Graph API helpers | ✅ |
| T031 | `perceptualHash.ts` — sharp 64-bit dHash | ✅ |
| T029 | `perceptualHash.test.ts` | ✅ (28 tests) |
| T029a | `fingerprintAccuracy.test.ts` — SC-3 ≥90% | ✅ (2 tests) |
| — | `metaGraph.test.ts` | ✅ (16 tests) |

### Phase 2b — Sync infrastructure

| ID | Task | Status |
|---|---|---|
| T023 | `connectMetaAccount` / `disconnectMetaAccount` (1:1 enforced) | ✅ |
| T024 | `metaDailySync` dispatcher (3am UTC, Cloud Tasks fan-out) | ✅ |
| T025 | `metaSyncAccountWorker` (per-account worker, idempotent, partial-failure isolation) | ✅ |
| T026 | `triggerMetaSync` (1-hour cooldown) | ✅ |
| T020 | `metaSync.contract.test.ts` | ✅ (16 tests) |

### Phase 2c — Image matching integration

| ID | Task | Status |
|---|---|---|
| T032 | `serverGenerateFinalAd` returns hash | ✅ |
| T033 | Sync-time match in worker (workspace-scoped) | ✅ |
| T034 | `linkUnmatchedAd` (manual link, locked) | ✅ |
| T035/T036 | `backfillImageFingerprints` (idempotent) | ✅ |
| T037 | `onGenerationDeleted` cascade | ✅ |
| T038 | Frontend fingerprint write | ✅ |
| T030 | `imageMatching.contract.test.ts` | ✅ (12 tests) |

---

## Files Created / Modified

### New files (functions/src/)

- `tokenCrypto.ts` — KMS envelope encrypt/decrypt with test seam
- `metaGraph.ts` — Graph API helpers (hierarchy, insights, baselines, async, retry)
- `perceptualHash.ts` — sharp dHash + Hamming distance + match decision rules
- `metaConnection.ts` — connect/disconnect + 1:1 enforcement
- `metaSync/dispatcher.ts` — `metaDailySync` scheduled function
- `metaSync/worker.ts` — `metaSyncAccountWorker` task handler
- `metaSync/trigger.ts` — `triggerMetaSync` callable
- `metaSync/shared.ts` — shared sync body (`runSyncForAccount`)
- `metaSync/tasksClient.ts` — Cloud Tasks facade
- `metaSync/legacyToken.ts` — legacy AES-GCM decrypt helper
- `linkUnmatchedAd.ts` — manual link callable
- `backfillImageFingerprints.ts` — one-time migration callable
- `generationDeleteCascade.ts` — `onDocumentDeleted` trigger
- 5 new test files under `__tests__/`

### New files (src/)

- (no new files; `App.tsx` and `geminiService.ts` extended in place)

### Modified files

- `functions/src/index.ts` — register new callables; extend
  `serverGenerateFinalAd` to compute + return the hash; remove legacy
  `metaDailySync` (replaced by spec-compliant dispatcher)
- `functions/src/metaSync/shared.ts` — export `ImageFingerprintDoc` type
- `functions/package.json` + `package-lock.json` — add test scripts for
  Phase 2a/2b/2c; add `@google-cloud/kms` + `@google-cloud/tasks` deps
- `src/App.tsx` — write `imageFingerprint` + `imageFingerprints/{hash}`
  index entry after generation create
- `src/services/geminiService.ts` — return `imageFingerprint` in the
  `generateFinalAd` response

---

## Build / Test / Lint Status

- `npm run build` (functions/): ✅ clean
- `npm test` (functions/, full suite): ✅ all 175+ Phase 14 tests pass; full
  pre-existing suite still passes (no regressions)
- `npm run build` (root, frontend): ✅ clean
- `node scripts/sc11Guard.mjs` (SC-11 lint): ✅ 75 files scanned, 0
  forbidden terms
- `npm run lint` (functions/): ⚠️ pre-existing ESLint v8 → flat-config
  migration issue (`--ext` flag no longer accepted). NOT caused by this
  batch. Confirmed by stashing all Phase 14 changes and re-running the
  same lint command.

### Test counts (Phase 14 subset)

| File | Tests |
|---|---|
| targetingContext.test.ts | 18 |
| campaignObjective.test.ts | 11 |
| canonicalAngle.test.ts | 12 |
| cpaEconomics.test.ts | 26 |
| funnelSettings.contract.test.ts | 19 |
| tokenCrypto.test.ts | 15 |
| perceptualHash.test.ts | 28 |
| fingerprintAccuracy.test.ts | 2 |
| metaGraph.test.ts | 16 |
| metaSync.contract.test.ts | 16 |
| imageMatching.contract.test.ts | 12 |
| **Total** | **175** |

---

## SC-3 Validation

`fingerprintAccuracy.test.ts` builds a corpus of 24 synthetic creatives and
runs the auto-match pipeline against 3 re-upload modes (JPEG q=85, JPEG q=70,
PNG→JPEG→PNG round-trip). Result: **≥90% correct auto-matches** (SC-3
satisfied).

---

## Architectural Notes

### Why a new `private/metaConnection` doc?

The existing `metaConnections/{uid}` collection holds the user-level Meta
OAuth token (encrypted with AES-256-GCM). Phase 14 requires per-workspace
tokens so the 1:1 mapping can be enforced and the dispatcher can iterate
connected accounts. `connectMetaAccount` reads the legacy token, re-encrypts
it via KMS (via `tokenCrypto.ts`), and writes the envelope to the
workspace-scoped `private/metaConnection` doc. The legacy path remains
intact for the push-creative flow.

### Why a Cloud Tasks fan-out?

Per research §B and `INFRASTRUCTURE_SETUP.md` §T002, Cloud Tasks gives us
per-task retries, exponential backoff, and a concurrency cap
(`maxConcurrentDispatches: 5`) declaratively. The 3am scheduled function
becomes a lightweight dispatcher that enqueues one task per connected
account; each worker runs independently with bounded execution time and
failure isolation.

### Why remove the legacy `metaDailySync`?

The pre-Phase-14 scheduled function wrote to user-level `adPerformance`,
did not scope by workspace, did not fan out via Cloud Tasks, and did not
classify campaign objective or apply the Qarar verdict engine. The new
dispatcher is the spec-compliant replacement. The legacy function was
**not** referenced by any other module — it was self-contained.

### Cross-workspace isolation (FR-023)

- The fingerprint index is per-workspace
  (`users/{uid}/workspaces/{wid}/imageFingerprints`).
- The worker's match query only reads the connected workspace's index.
- `linkUnmatchedAd` enforces both ad-side and generation-side
  workspaceId match.
- `generationDeleteCascade` only writes to the deleted generation's own
  workspace.

---

## CodeRabbit Loop

Status: pending first review.

---

## Deployment Status

**Not deployed.** Production deploy requires:

1. KMS key ring + key provisioned in `europe-west1`
   (`specs/phase-14/INFRASTRUCTURE_SETUP.md` §T001).
2. Cloud Tasks queue `metaSyncQueue` created in `europe-west1` with
   `maxConcurrentDispatches: 5`, `maxAttempts: 3`
   (`specs/phase-14/INFRASTRUCTURE_SETUP.md` §T002).
3. Manual test on localhost against a sandbox Meta account.

Per the batch workflow, deployment is gated by Claude audit + localhost
testing — this PR is **not merged** by the agent.

---

## Open Questions

1. **KMS envelope adoption**: `connectMetaAccount` currently writes the
   legacy AES ciphertext under `legacyToken`. When the OAuth callback is
   updated to call `tokenCrypto.encrypt()` directly, the worker switches
   to reading `encryptedToken` (KMS envelope) and `legacyToken` becomes
   unused. Out of scope for Batch 02.

2. **Cross-workspace fingerprint sharing**: The current model strictly
   forbids it. If multi-client team workflows (Edge Case 13) ever need
   shared creative libraries, the architecture already supports a
   `userId:workspaceId` fingerprint index key change.

3. **Cloud Tasks retry budget**: maxAttempts=3 may be too low for a 3am
   global sync with a 5-dispatch concurrency cap. Tune after observing
   production behavior.

---

## Verification Checklist

- [x] `functions/` TypeScript build clean
- [x] Full test suite green (no regressions)
- [x] SC-3 (≥90% fingerprint accuracy) satisfied
- [x] SC-11 (zero forbidden user-facing terms) passes
- [x] Frontend build clean
- [x] Cross-workspace isolation enforced at every read/write
- [x] 1:1 workspace↔account mapping enforced (FR-026)
- [x] Manual link locks against auto-match (spec §4.3)
- [x] Sync is idempotent (deterministic adId-keyed writes)
- [x] Partial failure isolation (errors collected, last-good data preserved)
- [x] 1-hour cooldown on manual sync (FR-006-equivalent)
- [x] Snapshot retention: last 7 per account (spec §3.4)
- [x] Generation delete cascade sets `metadataAvailable: false`
- [x] Pre-Phase-14 generations backfillable (idempotent)
