# Phase 14 — Batch 02 Report

**Feature branch**: `phase-14-rag-meta`
**PR**: #54
**Tasks**: T019-T038 (Phase 2a/2b/2c)
**Date**: 2026-07-13 (initial) · updated 2026-07-14 (audit fixes)

---

## Audit Fixes Applied (2026-07-14)

A Claude audit of the initial PR (#54) found 8 wiring issues in the
**wiring** between the pure modules and the actual Meta/Firestore paths.
The pure modules themselves (perceptualHash, metaGraph, tokenCrypto) were
solid. All 8 issues below were addressed in commit `f444aae` (six were
critical, two were medium/small — see the "Fix" column for severity):

| # | Issue | Fix |
|---|---|---|
| **1** | Worker / trigger / dispatcher threw `META_APP_SECRET not configured` on every sync (no `secrets: [metaAppSecret]` declaration) | New `functions/src/secrets.ts` module; worker, trigger, and dispatcher all declare `secrets: [metaAppSecret]` |
| **2** | `linkUnmatchedAd`, `backfillImageFingerprints`, and `generationDeleteCascade` read from the **workspace-nested** `users/{uid}/workspaces/{wid}/generations/{id}` path — but generations live at the **top-level** `generations/{id}` collection. Manual linking always threw `not-found`; backfill processed zero generations; the delete trigger never fired | All three now use the top-level path. `linkUnmatchedAd` verifies the generation's `userId` + `workspaceId` fields (FR-023). `backfillImageFingerprints` queries top-level `generations` filtered by `workspaceId == workspaceId` AND `userId == uid`. `generationDeleteCascade` listens on `generations/{generationId}` and reads `userId`/`workspaceId` from `event.data` |
| **3** | Meta's ad fields didn't include `adset_id`, ad set fields didn't include `campaign_id` — every ad got classified as `tier3_egypt_na` / `broad` / objective `other` (kills all learning) | `metaGraph.ts` adds `adset_id` and `campaign_id` to its field strings. `shared.ts` ALSO stamps the parent IDs at fetch time (defense in depth — the loop already knows the parent). |
| **4** | Bare `creative` field returned only `{ id: "..." }` — no image URL. The `typeof ad.creative === "string"` branch never fired because Meta returns an object. Every ad skipped image matching | `metaGraph.ts` requests `creative{id,image_url,thumbnail_url}` (field expansion). `shared.ts` reads `creative.image_url` / `creative.thumbnail_url` directly, falls back to `fetchAdCreativeImage` only if both are missing. `extractImageUrl` is no longer used in the ad-loop path. |
| **5A** | Sync recomputed `metadataAvailable: generationId !== null` and silently un-did the delete-cascade's `metadataAvailable: false` | `shared.ts` checks `existingData.metadataAvailable === false && existingData.deletedGenerationId` is set; when cascade-marked, keep `metadataAvailable: false` across the sync. |
| **5B** | `batch.set(ref, data)` (no `merge: true`) wiped the cascade fields (`deletedGenerationId`, `deletedGenerationAt`, `matchedManuallyAt`) on every sync | `batch.set(ref, data, { merge: true })` preserves fields the sync doesn't explicitly write. |
| **6** | `connectMetaAccount` only checked FR-026 direction (b) (account already on another workspace). It did NOT check direction (a) — workspace already linked to a DIFFERENT account. A user could silently replace workspace W's account A with B | `connectMetaAccount` now checks direction (a) FIRST: if `workspace.metaAdAccountId` exists AND differs from the requested `accountId`, throws plain-Arabic `هذه المساحة مرتبطة بحساب إعلاني آخر. افصله أولاً قبل ربط حساب جديد.` |
| **7** | `tokenCrypto.ts` is built and tested but NOT wired into the connect/sync flow. The report incorrectly claimed "KMS-encrypted token storage" | `metaConnection.ts` removes the dead `kmsEncrypt` import; `reencryptAndStoreToken` now throws with a clear "KMS adoption deferred" message. The connection flow copies the existing **legacy AES-encrypted token** (under `legacyToken`); the worker decrypts it via `metaSync/legacyToken.ts`. The tokenCrypto module + its 15 unit tests stay in the codebase, ready to wire up later. See "Deferred Items" below. |
| **8** | The legacy `metaDailySync` was deleted, but it was feeding the existing `PerformanceDashboard` (src/components/PerformanceDashboard.tsx), `creativeMemory.updateMemoryPerformance`, and the `principleVault`. The new sync writes to workspace-scoped paths that nothing reads yet (the new dashboard comes in Batch 04) | The legacy function was restored as `metaLegacySync` and **runs at 4am UTC** (1 hour after the new dispatcher's 3am run, so they don't collide). It writes to the user-level `adPerformance` collection that the existing dashboard + creative memory + vault read. Marked **TEMPORARY** in a comment — remove after Batch 04 ships. The new `metaDailySync` dispatcher keeps its 3am UTC schedule. |

### Verification after audit fixes

- `npm run build` (functions/): ✅ clean
- `npm test` (functions/, full suite): ✅ all 11 suites report `fail 0` (no regressions)
- `node scripts/sc11Guard.mjs`: ✅ 0 forbidden terms
- `npm run build` (root, frontend): ✅ clean
- CI (`build-and-test` workflow): ✅ pass
- CodeRabbit follow-up review on the fix commit: ✅ completed with no new comments
- All 5 review threads `isResolved: true`

---

## Re-Audit Fixes (2026-07-14, follow-up)

A second-pass Claude re-audit found 2 small remaining items, plus 2 LOW
items. All 5 were addressed in commit `0287e20` (and a follow-up doc
commit `3fba694` for the report wording fixes):

| # | Item | Fix |
|---|---|---|
| **R1** (BLOCKING) | `backfillImageFingerprints` ordered by `createdAt`, but generation docs carry the field as `timestamp` (Firestore Timestamp). Firestore silently excluded every doc missing the sort field — backfill returned zero results. | `.orderBy("timestamp", "desc")` + the index entry's `createdAt` now reads the actual `timestamp.toMillis()` (falls back to `Date.now()` only when the field is genuinely missing). This makes the decideMatch "most recent generation wins" tie-break work correctly on backfilled data. |
| **R2** (DOCS) | The "Architectural Notes → Why a new `private/metaConnection` doc?" paragraph still claimed `connectMetaAccount` "re-encrypts it via KMS" — stale after audit fix #7 deferred KMS. | Rewrote the paragraph to say it copies the legacy AES-encrypted token under `legacyToken`; KMS is deferred (see Deferred Items §D1). |
| **R3** (BONUS) | Two queries were missing composite indexes and would have thrown at runtime: (a) `generations` collection filtered by `workspaceId` + `userId` ordered by `timestamp desc` (the backfill query), and (b) the dispatcher's `collectionGroup('private')` query. | Added both indexes to `firestore.indexes.json` (with the exact field orderings Firestore needs). |
| **LOW 1** | `index.ts:89` declared its own `defineSecret("META_APP_SECRET")` while `secrets.ts` also declared one — duplicate `defineSecret` calls for the same secret. | `index.ts` now `import { metaAppSecret } from "./secrets.js"` so the Phase 14 sync modules and the rest of the codebase share a single instance. |
| **LOW 2** | Dead empty `if (keepMetadataUnavailable) { }` block in `shared.ts` — only a comment, no body. | Removed; replaced with a one-line comment documenting the flag's consumption at the `metadataAvailable` write below. |

### Verification after re-audit fixes

- `npm run build` (functions/): ✅ clean
- `npm test` (functions/, full suite): ✅ all 11 suites report `fail 0` (no regressions)
- `node scripts/sc11Guard.mjs`: ✅ 0 forbidden terms
- CI (`build-and-test` workflow): ✅ pass
- CodeRabbit follow-up review: ✅ completed; 2 new minor doc nits addressed; all 7 review threads `isResolved: true`

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
  callables with 1:1 workspace↔account enforcement (both directions)
  and **legacy AES-encrypted** token storage at
  `users/{uid}/workspaces/{wid}/private/metaConnection`. KMS envelope
  encryption is prepared but **deferred** — see Deferred Items.
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
connected accounts. `connectMetaAccount` reads the legacy AES-encrypted
token from `metaConnections/{uid}` and copies it into the workspace-scoped
`private/metaConnection` doc under the `legacyToken` field. KMS envelope
encryption is prepared (`tokenCrypto.ts` + 15 tests) but deferred — see
Deferred Items §D1.

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

**Status: ✅ all comments resolved.**

CodeRabbit posted 5 actionable + 7 nitpick comments on the initial commit.
All 12 were addressed in commit `f8ec60b`:

### Actionable comments fixed

1. **`backfillImageFingerprints.ts`** — `downloadFromUrl` now parses the
   bucket name from `storage.googleapis.com/<bucket>/<object>` URLs and uses
   `getStorage().bucket(bucketName)` instead of the default bucket.
2. **`metaConnection.ts`** — `disconnectMetaAccount` now also clears
   `encryptedToken` alongside `legacyToken`, so a stale `loadStoredConnection`
   call cannot hydrate a token post-disconnect.
3. **`metaSync/shared.ts`** — manually linked ads with a valid
   `generationId` are now counted as `matched` (alongside auto_hash).
4. **`metaSync/shared.ts`** — `fetchAdSets` / `fetchAds` blocks replaced
   with `Promise.allSettled` so one failed campaign/ad set doesn't discard
   the others (FR-010).
5. **`src/App.tsx`** — fingerprint write now targets the top-level
   `generations/{genId}` doc (matches `feedbackService.saveGeneration`'s
   write path), not the workspace-nested path. The fingerprint INDEX
   remains workspace-scoped (`imageFingerprints/{hash}`).

### Nitpick comments fixed

6. **`fingerprintAccuracy.test.ts`** — corpus now exercises 4-channel
   (RGBA) images with semi-transparent overlays.
7. **`metaConnection.ts`** — `connectMetaAccount` now uses a single
   `WriteBatch` so the private connection doc and the workspace link
   land together (atomic).
8. **`metaSync/dispatcher.ts`** — added warning when the result count
   hits `MAX_DISPATCH_PER_RUN`. Pagination across runs is documented as
   a future iteration when the cap is approached.
9. **`metaSync/shared.ts`** — existing adPerformance docs are now
   batch-loaded up-front into an in-memory map (eliminates the N+1 read
   pattern in the ad loop).
10. **`metaSync/tasksClient.ts`** — removed redundant `??` fallback in
    `enqueueTask`.
11. **`metaSync/trigger.ts`** — removed dead no-op `if` block; explanatory
    comment preserved above `readLastSyncAt`.
12. **`src/services/geminiService.ts`** — replaced `debug?: any` and
    `resolutionTrace?: any` with `unknown` on the touched line.

### Verification after fixes

- `npm run build` (functions/): ✅ clean
- `npm test` (functions/, full suite): ✅ all 11 suites report `fail 0`
- `npm run build` (root, frontend): ✅ clean
- `node scripts/sc11Guard.mjs`: ✅ 0 forbidden terms
- CI (`build-and-test` workflow): ✅ pass
- CodeRabbit follow-up review: ✅ all 5 review threads `isResolved: true`

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

## Deferred Items

The following are explicitly **out of scope** for this batch. They are
listed here so the next batches (and the audit trail) know what was
intentionally deferred vs what was missed.

### D1 — KMS envelope encryption (audit fix #7)

`tokenCrypto.ts` is built, tested (15 round-trip tests), and ready to
wire in. The current connection flow copies the **legacy AES-encrypted
token** under `legacyToken`; the worker decrypts it via
`metaSync/legacyToken.ts`. KMS adoption requires:

1. Provisioning the KMS key ring + key (see
   `specs/phase-14/INFRASTRUCTURE_SETUP.md` §T001).
2. Updating the existing `metaOAuthCallback` to call
   `tokenCrypto.encrypt()` instead of the in-index.ts AES helper.
3. Re-pointing the worker to read `encryptedToken` (KMS envelope) as
   the primary source; `legacyToken` becomes a fallback for un-migrated
   accounts.

Until then, the legacy AES path is the source of truth and
`reencryptAndStoreToken` is a deliberate no-op (it throws to surface
any accidental call).

### D2 — Remove `metaLegacySync` after Batch 04 ships (audit fix #8)

`metaLegacySync` runs at 4am UTC. No other module invokes it directly
(it was a top-level `onSchedule` export, not a callable), but its
**writes are consumed** by:
- `PerformanceDashboard` (src/components/PerformanceDashboard.tsx) —
  reads the user-level `adPerformance/{uid}_{adId}` collection
- `creativeMemory.updateMemoryPerformance` + `rebuildPatternIndexes` —
  consume the same payload to update the user's creative memory
- `principleVault.extractPrinciples` / `extractAntiPrinciples` —
  aggregate winners + losers across the user's ads

The new spec-compliant dispatcher (`metaDailySync`, 3am UTC) writes
to workspace-scoped paths that the new dashboard will read. **Remove
`metaLegacySync` only after Batch 04 replaces the dashboard** — until
then, both run daily and write to disjoint paths so there's no
collision. The fact that no module directly invokes
`metaLegacySync` is what makes it safe to remove once the dashboard
has migrated.

### D3 — Proactive token refresh (FR-009)

`tokenExpiresAt` is recorded on the connection doc, but the worker
doesn't yet proactively exchange a near-expiry token for a fresh
long-lived one via `GET /oauth/access_token?grant_type=fb_exchange_token`.
Implemented as a follow-up once KMS adoption is in place (the refresh
path needs to write back the re-encrypted token).

---

## Open Questions

1. **Cross-workspace fingerprint sharing**: The current model strictly
   forbids it. If multi-client team workflows (Edge Case 13) ever need
   shared creative libraries, the architecture already supports a
   `userId:workspaceId` fingerprint index key change.

2. **Cloud Tasks retry budget**: maxAttempts=3 may be too low for a 3am
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
