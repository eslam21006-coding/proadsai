# Contract: `reflowImage` (Firebase Cloud Functions v2 onCall) — Regenerated 2026-05-29

**Status**: Shipped by HOTFIX-F. Phase 17 brings it into alignment with the finalized spec:

- **Cost unified** — flat 5 credits per successfully delivered item (was 2 outpaint / 5 rerender).
- **Method parameter de-publicized** — frontend always sends `'auto'`; runtime continues to accept `'outpaint'` / `'rerender'` for fixture tests + internal tooling.
- **Chip persistence** — replaces `mockupHistory.arrayUnion` with ratio-keyed `variantChips` upsert (≤6 chips).
- **Source resolution** — drops the `mockupHistory[last]` fallback; legacy generations without `output.imageUrl` rejected.
- **Trace fields** — adds `brandColorReinforced` and `textReflowOverflow` on re-render entries.

## Endpoint

- **Name**: `reflowImage`
- **Path**: `functions/src/reflowImage.ts` exports `reflowImageHandler`; registered in `functions/src/index.ts` as the `reflowImage` callable.
- **Auth**: Firebase Auth required. Viewers (team role) rejected with `permission-denied`.
- **Credit owner**: `resolveCreditOwner(callerId)` — Member's reflow debits the Owner's account.

## Request

```ts
interface ReflowImageRequest {
  generationId: string;                                          // required
  targetAspectRatio: '1:1' | '4:5' | '3:4' | '4:3' | '9:16' | '16:9';  // required
  method: 'auto' | 'outpaint' | 'rerender';                      // INTERNAL — frontend ALWAYS sends 'auto'
  scope: 'single' | 'batch_all' | 'carousel_all' | 'carousel_slide';
  slideIndex?: number;                                            // required iff scope === 'carousel_slide'
}
```

### `method` — internal-only

The `method` field is retained in the request shape for:

1. Fixture tests (`functions/src/__tests__/contractFixtures.test.ts`) that pin the route to verify route-specific behavior.
2. Internal admin / debugging tooling.

The **frontend always sends `'auto'`**. Per FR-011 + Assumptions, "method selection is never exposed to the user." Any frontend code path that sets `method` to anything other than `'auto'` is a defect.

Future hardening (out of scope for Phase 17): add a frontend-vs-runtime split where the public callable signature has `method?: 'auto'` only and the runtime accepts the wider set behind a separate internal entry point.

### Validation rules

- `generationId` MUST resolve to a document the caller's resolved credit owner authored.
- `targetAspectRatio` MUST be one of the 6 enumerated values. Unknown → `invalid-argument`.
- `method` MUST be one of `auto | outpaint | rerender`. Unknown → `invalid-argument`.
- `scope` MUST be one of the 4 enumerated values. Unknown → `invalid-argument`.
- `slideIndex` required when `scope === 'carousel_slide'`; non-negative integer < `output.carouselSlides.length`.
- `scope === 'carousel_all' | 'carousel_slide'` requires `output.carouselSlides` to be a non-empty array → `failed-precondition` if not.
- `scope === 'batch_all'` requires `output.batchResults` to be a non-empty array → `failed-precondition` if not.
- **NEW (FR-018)** — the source generation MUST have `output.imageUrl` (for single scope) / `output.batchResults[i].url` (for batch_all) / `output.carouselSlides[i].imageUrl` (for carousel scopes). Legacy generations without these reject with `failed-precondition: 'legacy_no_original'`. No fallback to `mockupHistory[last]`.

## Response

```ts
interface ReflowImageResponse {
  success: true;
  scope: ReflowScope;
  outcomes: ReflowOutcome[];          // per-item — index matches request scope (1 for single/carousel_slide; N for batch_all/carousel_all)
  totalCreditsCharged: number;        // sum of outcomes[].creditsCharged (successful items only)
}

interface ReflowOutcome {
  itemIndex: number | null;           // null for single scope; integer for batch/carousel
  success: boolean;
  method: 'outpaint' | 'rerender' | null;        // INTERNAL DIAGNOSTIC — for trace consumers, not user-facing
  fallbackFrom: 'outpaint' | 'rerender' | null;
  fallbackReason: 'drift' | 'engine_error' | 'no_plan' | null;
  outputUrl: string | null;           // public URL of the reflowed image (or original for no-op)
  creditsCharged: number;             // 0 (failure / no-op) or 5 (success — flat per R-001)
  errorCode?: string;
  errorMessage?: string;
}
```

The frontend SHOULD NOT surface `outcomes[].method` to end users — it is a diagnostic signal for traces and admin tooling.

## Behavior contract

### Cost (R-001 — unified flat 5)

- Single scope: 5 credits per successful item.
- batch_all / carousel_all: 5 credits per successful item.
- carousel_slide: 5 credits per successful item.
- No-op (same-ratio per FR-021): 0 credits per item.
- Failure: 0 credits per item.

Both internal routes (outpaint, rerender) charge the same 5 credits. The router still chooses by magnitude for *quality* reasons.

### Concurrency (FR-014)

- 5 items max in parallel per resize action. Larger scopes queue and run in waves of 5. Implementation: `runWithConcurrency(items, 5, worker)` (unchanged from HOTFIX-F).

### Pre-flight credit check (FR-007)

- Estimate = 5 × active item count (post no-op filtering). If insufficient → `resource-exhausted` BEFORE any work performed.
- Commit-time re-check inside the per-item transaction catches concurrent credit drains.

### Partial success (FR-014, FR-019)

- Per-item failures surface as `outcomes[i].success = false` with `errorCode` / `errorMessage`.
- Failed items charge 0 credits. `totalCreditsCharged` reflects successes only.
- Persistence failures flip an outcome from success → failure with `errorCode: 'persist_failed'`; transaction rolled back so 0 credits debited.

### Auto-router fallback (HOTFIX-F internal behavior — unchanged)

- `method: 'auto'` → router picks outpaint or rerender by `decideMethod` magnitude check (<30% → outpaint, ≥30% → rerender).
- On outpaint failure under auto, falls back to rerender. Outcome carries `fallbackFrom: 'outpaint', fallbackReason: 'drift' | 'engine_error'`.
- On rerender failure with `NoPlanError` under auto, falls back to outpaint. `fallbackFrom: 'rerender', fallbackReason: 'no_plan'`.
- User-overridden methods (`method: 'outpaint'` or `method: 'rerender'`) do NOT fall back. Used by fixture tests only; not exposed to end users.

### Same-ratio no-op (FR-021)

- When `targetAspectRatio === genData.metadata.aspectRatio` (the ORIGINAL ratio), each item returns `success: true, method: null, creditsCharged: 0, outputUrl: <source>` without invoking the router or charging credits.
- The no-op check uses the original generation's `metadata.aspectRatio` — not any displayed-chip ratio.

### Source resolution (FR-018 — original is always the source)

- For `scope: 'single'`: source = `genData.output.imageUrl`. No fallback.
- For `scope: 'batch_all' | 'carousel_*'`: source = the corresponding entry's URL on the original generation (`output.batchResults[i].url` / `output.carouselSlides[i].imageUrl`).
- Legacy generations missing the source URL reject with `failed-precondition: 'legacy_no_original'`. Chaining is not supported.

### Persistence (Phase 17 changes — see [../data-model.md](../data-model.md))

For each successful item, in a single Firestore transaction:

1. Append a `ReflowHistoryEntry` to `resolutionTrace.reflowHistory` (existing — with new Phase-17 fields).
2. **Phase 17 NEW**: Upsert a `VariantChip` into `variantChips` keyed on `targetAspectRatio` ONLY. Overwrites prior chip with the same ratio. `method` is NOT part of chip identity.
3. **Phase 17 NEW**: Set top-level `resolutionTrace.brandColorReinforced` / `.textReflowOverflow` to the OR of any prior `true` and the current outcome's flag.
4. Deduct `creditsCharged` (5) from `users/{creditOwnerUid}.credits` via `FieldValue.increment(-5)`.
5. `mockupHistory.arrayUnion({ url, ratio })` still happens for backward compatibility with pre-Phase-17 read-side code.

Failures roll back atomically — partial chip writes without credit debits (and vice versa) cannot occur.

## Error codes

| Code | Meaning |
|---|---|
| `unauthenticated` | No Firebase Auth token. |
| `permission-denied` | Caller is a team viewer. |
| `invalid-argument` | Malformed request. |
| `not-found` | `generationId` doesn't exist or belongs to a different credit owner. |
| `failed-precondition` | Scope requires a list that doesn't exist (batch_all without batchResults, carousel scopes without carouselSlides, slideIndex out of range), OR `legacy_no_original` for pre-Phase-17 documents without `output.imageUrl`. |
| `resource-exhausted` | Insufficient credits for the pre-flight estimate. |

Per-item errors are returned inside `outcomes[i].errorCode` (request returns 200). Top-level `HttpsError` is reserved for whole-request failures.

## Audit signals (Constitution Principle VI)

Each successful reflow writes `resolutionTrace.reflowHistory`:

```ts
{
  timestamp, sourceRatio, targetRatio, magnitude,
  method,                              // INTERNAL — the route the backend chose silently
  userOverride,                        // null for normal frontend calls; populated for fixture pins
  fallbackFrom, fallbackReason,
  itemIndex, outputUrl, creditsCharged,
  // Phase 17 additions:
  brandColorReinforced,
  textReflowOverflow,
  textReductionSteps
}
```

This is the diagnostic trail. Per Principle VII (no silent override without trace), the silent route choice and any auto-fallback paths are both recorded.
