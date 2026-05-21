# Phase 1 Data Model: Post-Phase-21 Drift Audit Remediation

This is a remediation, so the "data model" is the set of **additive field changes**, **corrected read models**, and **client-state additions** required by the fixes. No collection is created or removed. All Firestore shape changes are additive and must not break legacy reads (per the Edge Cases section of the spec).

## 1. `generations/{genId}` — additive fields

The main generation document gains fields that today are either computed-then-discarded or written only to `creativeMemory`. All optional.

| Field | Type | Added by | Source / notes |
|-------|------|----------|----------------|
| `resolutionTrace` | object (existing `ResolutionTrace` shape) \| absent | **FR-301** | Persisted via the `reflowImage.ts:492-519` transaction pattern. Closes observability for Phases 1/5/6/7/15/16. |
| `failureClass` | `'prompt_malformed' \| 'model_error' \| 'validation_reject' \| 'slot_repair_failed' \| 'numeric_hallucination' \| 'combination_invalid' \| 'credit_insufficient' \| null` | **FR-107** | `null` on success; one of 7 on a classified failure. Written by the `index.ts` catch-block integration. |
| `costEstimate` | `{ modelTier: string \| null, retryCount: number, estimatedTokens: number } \| null` | **FR-109/110** | Returned in the callable response (FR-109) and persisted by the client via `saveGeneration` (FR-110). |
| `blueprintText` | string \| absent | **FR-304** | Currently only in `creativeMemory`; mirror onto the main doc. |
| `resolvedImagePrompt` | string \| absent | **FR-304** | Same. |
| `culturalViolation` | object \| absent | **FR-137** | **Persisted internally, stripped from the client response** (inverts current behavior). |
| `resolutionTrace.reflowHistory[]` | existing | (unchanged) | Already persisted by `reflowImage` — the reference implementation. |

**Validation rules**: `failureClass` is exactly one of the 8 values (7 + null); `costEstimate.retryCount ≥ 0`; pre-model failures (`credit_insufficient`/`combination_invalid`/`prompt_malformed`) carry `costEstimate {modelTier:null, retryCount:0, estimatedTokens:0}`. Refund (FR-108) applies only when `failureClass ∈ {model_error, validation_reject, slot_repair_failed}` AND credits were already deducted.

## 2. Failure record (write target of FR-107)

A failed generation writes a `generations/{auto-id}` doc (per the existing 007 contract): `{ userId, timestamp, failureClass, costEstimate, input (request metadata), output: { phase, fullResponse (truncated error) }, feedback: { rating:null, tags:[], freeText:'', savedToFavorites:false } }`. This is the record the audit found was never written.

## 3. Team-member access model (corrected by FR-211)

**Canonical model** (the one actually written elsewhere, e.g. by `setTeamMemberWorkspaceAccess` and read by `getWorkspaceGenerations`):

```
users/{ownerUid}/team/{autoId}  →  { uid: <memberUid>, role, workspaceAccess: string[], ... }
```

Queried by `where('uid','==',callerUid)`. **FR-211** rewrites `resolveCallerScope` (`workspacePolicy.ts:116-132`) to read this, removing the stale `users/{callerUid}/team/meta` + `members/{uid}.workspaceIds` path that is never written. **FR-119** is the writer that populates `workspaceAccess` from the UI; it MUST land before FR-211/FR-213 return non-empty results (linked-fix sequencing).

## 4. Workspace Meta read path (corrected by FR-118)

`metaPushCreativePack` must resolve the publish target as: **if** the active workspace doc has `metaAdAccountId` (set at link time, validated by `linkMetaAccountToWorkspace`), target that account; **else** fall back to the user-level `conn.selectedAccountId`. Today it always reads the user-level default. No schema change — only the read path changes; the `workspace.metaAdAccountId` field already exists (added in spec 012).

## 5. Brand-color compliance → scoring (corrected by FR-127/128)

- `inputs._sourceColdAdBrandColors` (existing transient field) must be **populated** from a `retargetingSourceId` doc lookup so `resolveBrandColors` can inherit (FR-127).
- `_runBrandCompliance`'s result must be fed into `applyBrandColorDeduction` and onto the persisted `creativeScoreResult.overallScore` (FR-128): a brand-primary-missing render → `overallScore − 10`, violation string appended, `passed` recomputed against the 60-point threshold.

## 6. Client state additions

| State | Where | Added by | Notes |
|-------|-------|----------|-------|
| `hasInProgressWork` | Zustand `src/store.ts` | **FR-121** | Real selector over the 8 generation fields (`inputs, tovText, conceptsText, buildPlan, mockupHistory, captionText, batchResults, carouselSlides`); replaces the static `false`. Consumed by `WorkspaceSwitcher` to fire the switch guard. |
| `favoriteIds` → `initialFavorite` prop | `App.tsx` → `FeedbackButtons` | **FR-207** | Existing `favoriteIds` Set must be passed as `initialFavorite={favoriteIds.has(genId)}` to every FeedbackButtons (currently never passed). |
| `reflowMethod` reset | `App.tsx` Step-4 nav | **FR-133** | Reset to `'auto'` on Step-4 navigation. |

## 7. i18n keys to add (bilingual EN + AR — Principle V)

| Key | Added by |
|-----|----------|
| `override.testimonial_requires_carousel` (invoke existing key) | FR-113 |
| `override.carousel_adjusted_testimonials` (render existing key) | FR-114 |
| `reflow.fallbackToRerender`, `reflow.fallbackToOutpaint` | FR-131 |
| `billing.savedProjectOverLimit`, `billing.audienceAvatarOverLimit` | FR-135 |
| `fidelity.*` (render existing keys) | FR-117 |

(Several keys already exist in `i18n.tsx` but are unrendered — the fix is to render/invoke them; FR-131/135 add genuinely-new keys.)

## 8. Storage rule shape (corrected by FR-212)

`storage.rules` must be restructured so the thumbnail path rule (`users/{uid}/projects/{projectId}/thumbnail.{jpg|png}`, 256KB + ext cap) is **not shadowed** by the broader `users/{userId}/{allPaths=**}` owner-write rule. Because Storage rules OR across matches, the cap currently never applies; the fix narrows or reorders the broad rule so the thumbnail constraints bind.

## 9. Test/CI artifacts (not data, but tracked)

- `functions/src/__tests__/savedProjects.getUserProjects.test.ts` (NEW, FR-214) — incl. `permission_denied_no_metadata_leak`.
- `functions/package.json` scripts: `test:lang` (FR-203), aggregate `test` chains lang + team (FR-204/205).
- A resolver-parity test (FR-215) asserting `functions/src/creativeResolver.ts` ↔ `src/creativeResolver.ts` `ALLOWED_PAIRS` + reason strings byte-identical.
- `.github/workflows/ci.yml` (NEW, FR-216).
