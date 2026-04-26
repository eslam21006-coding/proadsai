# Contract: `reflowImage` Callable

**Spec**: [../spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md) · **Data Model**: [../data-model.md](../data-model.md)

## Summary

A new Firebase Cloud Functions v2 `onCall` handler exposed to the frontend at the action name `reflowImage`. Hosts the deterministic two-route reflow router (FR-001) plus per-item dispatch for carousel/batch reflow (FR-020 / FR-021). Replaces the user-facing generative-edit REFLOW path that currently lives inside `generateFinalAd` (`functions/src/generators.ts:5181-5230`); that path is gated off from user-facing reflow as part of FR-026.

## Registration

- **File**: `functions/src/index.ts` (handler logic extracted to `functions/src/reflowImage.ts` for testability).
- **Region**: `europe-west1` (matches `generateCreative`).
- **Memory**: `2GiB`.
- **Timeout**: `300` seconds (allows up to 5 concurrent rerender items at ~30 s + safety margin).
- **Secrets**: `geminiApiKey` (used only on the rerender route).
- **CORS**: `true`.

## Request schema

```ts
interface ReflowImageRequest {
    /** Source generation document ID in the generations collection. */
    generationId: string;

    /** Target aspect ratio. One of the six supported ratios. */
    targetAspectRatio: '1:1' | '4:5' | '3:4' | '4:3' | '9:16' | '16:9';

    /**
     * Routing method.
     *   'auto'     — invoke the magnitude router (FR-002)
     *   'outpaint' — force the outpaint route (FR-003 user override)
     *   'rerender' — force the rerender-from-plan route (FR-003 user override)
     */
    method: 'auto' | 'outpaint' | 'rerender';

    /**
     * Reflow scope.
     *   'single'           — reflow the source generation's single image
     *   'batch_all'        — reflow every batch variant of the source generation
     *   'carousel_all'     — reflow every slide of the source generation's carousel
     *   'carousel_slide'   — reflow one specific slide; requires slideIndex
     */
    scope: 'single' | 'batch_all' | 'carousel_all' | 'carousel_slide';

    /** Required iff scope === 'carousel_slide'. Zero-based. */
    slideIndex?: number;
}
```

## Response schema

```ts
interface ReflowImageResponse {
    success: true;
    scope: ReflowScope;
    outcomes: ReflowOutcome[];
    totalCreditsCharged: number;
}

interface ReflowOutcome {
    /** null for scope='single'; carousel slide / batch variant index otherwise. */
    itemIndex: number | null;

    success: boolean;

    /** Method that ultimately delivered the result. null if both routes failed. */
    method: 'outpaint' | 'rerender' | null;

    /** Populated only if a fallback occurred. */
    fallbackFrom: 'outpaint' | 'rerender' | null;
    fallbackReason: 'engine_error' | 'drift' | 'no_plan' | 'mask_error' | 'transient' | null;

    outputUrl: string | null;
    creditsCharged: number;

    /** Populated only when success=false. */
    errorCode?: string;
    errorMessage?: string;
}
```

The response shape is the same for `scope: 'single'` (one outcome, `itemIndex: null`) and multi-item scopes (N outcomes, `itemIndex` populated).

## Error codes (`HttpsError` codes)

| Code | When | FR ref |
|---|---|---|
| `unauthenticated` | No `request.auth`. | (standard) |
| `permission-denied` | User is a viewer team role; viewers cannot consume credits. | (standard, see `generateCreative`) |
| `not-found` | `generationId` does not exist or does not belong to the caller's credit owner. | (callable safety) |
| `invalid-argument` | `targetAspectRatio` not one of the six supported ratios; `method` not in the enum; `scope: 'carousel_slide'` without `slideIndex`. | FR-004, FR-003 |
| `failed-precondition` | `scope` mismatch with source (e.g. `batch_all` requested but source has no `batchResults`); `slideIndex` out of range. | (callable safety) |
| `resource-exhausted` | Insufficient credits for the planned route(s). | FR-017 |
| `internal` | Both routes failed (auto only) or the explicit-override route failed. The error message includes the failure reason; `errorCode` on the per-item outcome (in `details`) gives more granularity. | FR-014, FR-015 |

A no-op reflow (source ratio == target ratio per FR-005) is **not** an error: the callable returns a successful response with the source URL re-echoed in `outcomes[*].outputUrl` and `creditsCharged: 0`.

## Pre-flight validation (executed before any route is invoked)

1. **Auth check** — reject `unauthenticated` if no `request.auth`.
2. **Team role check** — reject `permission-denied` if `teamRole === 'viewer'` (matches `generateCreative` precedent).
3. **Generation lookup** — load `generations/{generationId}` via Admin SDK; reject `not-found` if missing or belongs to a different credit owner.
4. **Ratio validation** — reject `invalid-argument` if `targetAspectRatio` is not in the six-ratio enum (FR-004).
5. **Method validation** — reject `invalid-argument` if `method` is not in `'auto' | 'outpaint' | 'rerender'`.
6. **Scope/slide validation** — reject `invalid-argument` if `scope === 'carousel_slide'` and `slideIndex` is missing or non-numeric. Reject `failed-precondition` if `slideIndex` is out of range, or if `scope === 'carousel_all'` but the source has no `output.carouselSlides[]`, or if `scope === 'batch_all'` but the source has no `output.batchResults[]`.
7. **No-op short-circuit** (FR-005) — if for every item to be reflowed `sourceRatio === targetAspectRatio`, return immediately with `creditsCharged: 0` and the source URL re-echoed. (Per-item; mixed-ratio carousels may have some items short-circuit and others execute.)

## Routing logic (per item)

```text
function decideMethod(sourceRatio, targetRatio, method): ReflowDecision {
    if (sourceRatio === targetRatio) return short-circuit;

    if (method === 'outpaint') return { chosenMethod: 'outpaint', isUserOverride: true };
    if (method === 'rerender') return { chosenMethod: 'rerender', isUserOverride: true };

    // method === 'auto'
    const magnitude = max(target/current, current/target) - 1;
    return {
        chosenMethod: magnitude < 0.30 ? 'outpaint' : 'rerender',
        isUserOverride: false,
        magnitude,
    };
}
```

## Execution and fallback

| Decision | First attempt | On failure |
|---|---|---|
| `chosenMethod = outpaint`, `isUserOverride = false` | `reflowOutpaint(...)` | If throws or drift detected → fall back to `reflowRerender(...)`. If rerender also fails (e.g., legacy record without plan), fall back to outpaint a second time is **not** allowed (loop prevention); surface error. |
| `chosenMethod = rerender`, `isUserOverride = false` | `reflowRerender(...)` | If throws because plan missing → fall back to `reflowOutpaint(...)`. If outpaint also fails, surface error. |
| `chosenMethod = outpaint`, `isUserOverride = true` | `reflowOutpaint(...)` | On any failure, surface error directly. **No fallback** (research.md R4/R6). |
| `chosenMethod = rerender`, `isUserOverride = true` | `reflowRerender(...)` | On any failure, surface error directly. **No fallback** (research.md R4/R6). |

## Persistence (per successful item)

Inside one Firestore transaction:

1. Read `generations/{generationId}`.
2. Append `{ url: outputUrl, ratio: targetAspectRatio }` to `mockupHistory`.
3. Append a `ReflowHistoryEntry` (per data-model.md) to `resolutionTrace.reflowHistory`.
4. Write the document back.

For multi-item reflow, each item's transaction is independent.

## Credit accounting

| Phase | Action |
|---|---|
| Pre-flight | Compute the maximum possible cost (assume all items go to rerender) and verify the credit owner has enough. Reject `resource-exhausted` if not. |
| Per-item completion | Charge the actual route's cost: `outpaint` < `rerender`. (Concrete numbers come from the platform pricing matrix; the existing `COSTS.reflowImage = 5` in `index.ts` is the rerender cost; outpaint is set lower.) |
| Per-item failure (fallback path) | Charge only the route that ultimately succeeded. (FR-014 / FR-017) |
| Per-item failure (both routes failed) | Charge zero. (FR-019) |
| No-op short-circuit | Charge zero. (FR-018) |

The pre-flight reservation uses the upper bound (rerender cost × N items) to avoid mid-flight insufficient-credit errors. Final reconciliation refunds the difference at completion.

## Concurrency

- Per-item dispatch uses `Promise.allSettled` with a sliding-window concurrency cap of **5 in-flight items** (research.md R5).
- Per-source-generation document writes use Firestore transactions to keep `mockupHistory` and `resolutionTrace.reflowHistory` consistent under concurrent reflows on the same source (research.md R7).

## Test contract (lands in `contractFixtures.test.ts`, per launch-matrix HFF.6)

| # | Fixture | Asserts |
|---|---|---|
| HFF.6.a | `single` reflow 1:1 → 4:5 with `method: 'auto'` | `outcomes[0].method === 'outpaint'`; `magnitude === 0.25`; `mockupHistory` length grew by 1; the appended entry has `ratio: '4:5'`; `reflowHistory[0].method === 'outpaint'` and `userOverride === null`. |
| HFF.6.b | `single` reflow 4:5 → 9:16 with `method: 'auto'` | `outcomes[0].method === 'rerender'`; `magnitude ≈ 0.422`; `reflowHistory[0].method === 'rerender'`; `generateFinalAd` was invoked with `aspectRatio: '9:16'`. |
| HFF.6.c | `single` reflow 1:1 → 4:5 outpaint, fixture PNG | output PNG's center 70 % rectangle (decoded RGBA) is byte-identical to the corresponding source rectangle. |
| HFF.6.d | `single` reflow 4:5 → 9:16 rerender, stubbed `generateFinalAd` | output image is the stubbed deterministic PNG; the `aspectRatio` in the build-plan call equals `'9:16'`; the source's saved build plan was loaded; the original `aspectRatio` field on the loaded plan was overwritten before the call. |
| HFF.6.e | User override: `method: 'outpaint'` for 4:5 → 9:16 | `outcomes[0].method === 'outpaint'`; `userOverride === 'outpaint'`; magnitude is computed but does not gate the choice. |
| HFF.6.f | User override: `method: 'rerender'` for 1:1 → 4:5 | `outcomes[0].method === 'rerender'`; `userOverride === 'rerender'`. |
| HFF.6.g | Outpaint engine returns drifted output (locked-region pixels altered) on `auto` | verification rejects the outpaint output; `fallbackFrom === 'outpaint'`; `fallbackReason === 'drift'`; `method === 'rerender'`; user is charged once. |
| HFF.6.h | Carousel `scope: 'carousel_all'` reflow 1:1 → 9:16, 5 slides | `outcomes.length === 5`; every outcome's `method === 'rerender'`; carousel slide order preserved; per-slide `creditsCharged` is the rerender cost. |
| HFF.6.i | Partial failure: 5-slide carousel, slide 3 has no plan and outpaint also fails | slides 1, 2, 4, 5 land in `mockupHistory`; slide 3's outcome has `success: false` and a non-null `errorCode`; `mockupHistory` length grew by exactly 4. |
| HFF.6.j | No-op: source ratio === target ratio | `outcomes[0].outputUrl === sourceUrl`; `creditsCharged === 0`; no append to `mockupHistory`. |
| HFF.6.k | Unsupported target ratio (e.g., `'2:1'`) | callable rejects with `invalid-argument`; no transaction; no credit charge. |
| HFF.6.l | Reject the deprecated path: invoke `generateFinalAd` with an `editInstruction` containing `'REFLOW'` from a non-`reflowImage` caller | the call MUST fail closed (return early or throw); covered by FR-026. |

## Frontend contract (App.tsx Step 4)

The frontend invokes the callable via `httpsCallable<ReflowImageRequest, ReflowImageResponse>('reflowImage')`. The new method selector (`Auto` / `Quick` / `Fresh`) maps to:

| User selection | `request.method` |
|---|---|
| Auto (default) | `'auto'` |
| Quick (outpaint) | `'outpaint'` |
| Fresh render (rerender) | `'rerender'` |

The selector is rendered above the existing per-ratio buttons in Step 4; collapsed by default with the label "Method: Auto" and an "Edit" toggle (research.md R8). Multi-item reflow renders per-item progress badges in the existing `mockupHistory` strip.
