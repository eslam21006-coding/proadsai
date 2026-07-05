# Contract: Image Matching (Layer 3)

**Feature**: `phase-14-rag-meta` · **US3**
**Transport**: server compute + client write (fingerprint), sync-time matching, manual-link callable, one-time backfill.

---

## Generation-time fingerprint (extends `serverGenerateFinalAd`)

- **Server**: after the image is uploaded to Storage, compute the 64-bit dHash (`perceptualHash.ts`, `sharp`) and **return it in the response payload** — never write it server-side by `genId` (Technical Constraint).
- **Client**: after `addDoc` creates the generation, write `imageFingerprint` + `imageFingerprintAlgo` onto the doc (FR-014) and write the index entry `users/{uid}/workspaces/{workspaceId}/imageFingerprints/{hash}` → `{ generationId, createdAt }` (FR-015).

## Sync-time matching (inside `metaSyncAccountWorker`)

For each Meta ad: get creative `image_url`/`thumbnail_url` → download → dHash → compare against the **workspace-scoped** `imageFingerprints` index only (cross-workspace forbidden — Edge Case 13, FR-023).

- Distance ≤ threshold → **AUTO-MATCH** (`matchType:'auto_hash'`, expose hook angle / visual pattern / layout template / art direction / universe / creative modes).
- Multiple below threshold → pick **smallest** distance; top-two within a small margin (ambiguous) → leave **unmatched**; exact tie → most recent generation (spec §4.2).
- No close match → store as **unmatched** (`generationId:null`, `matchType:null`).
- **Precedence (FR / §4.3)**: a **manual link is authoritative and locked**; auto-match only fills ads with no link; a re-sync **never** changes an existing link.

## `linkUnmatchedAd` (callable) — manual fallback

### Request
```ts
{ workspaceId: string; accountId: string; adId: string; generationId: string }
```
### Response `{ ok: true; matchType: 'manual' }`
### Server rules
- The picker/link is restricted to generations **in the same workspace** (no cross-workspace linking).
- Sets `matchType:'manual'`, `generationId`; the link **persists permanently** and is locked against future auto-match overwrites.

## `backfillImageFingerprints` (one-time migration)

- Download each existing generation's stored image, compute `imageFingerprint`, write it + the index entry.
- **Idempotent** — skips generations that already have a fingerprint.
- Missing-source generations stay unmatched (manual-link only).
- **Only workspace-assigned generations** are processed; unassigned legacy generations are skipped (manual-link only — Edge Case 13).

---

## Edge Case 16 — deleted source generation
On generation delete, the matched `adPerformance` record sets `metadataAvailable:false` and reverts to unmatched **for display**, stops exposing the deleted generation's metadata, and is excluded from `pastWinningAds`. The already-applied aggregate contribution is retained; aggregates are not recomputed.
