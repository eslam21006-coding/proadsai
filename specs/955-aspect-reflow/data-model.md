# Phase 1 — Data Model: HOTFIX-F Deterministic Aspect Ratio Reflow

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Research**: [research.md](./research.md)

## Overview

This hotfix is **additive only** — no schema migration, no field renames, no field deletions. It extends two existing Firestore data shapes (`generations/{genId}.mockupHistory` and `generations/{genId}.resolutionTrace`) with new optional records, and introduces three TypeScript types in `functions/src/types.ts` (and mirrored in `src/types.ts` for client-side rendering of trace history).

Legacy generation records that lack the new fields continue to load and reflow correctly via the FR-015 fallback chain.

## TypeScript types (server)

### `ReflowMethod` (new)

```ts
export type ReflowMethod = 'auto' | 'outpaint' | 'rerender';
```

- `auto` — request the magnitude router; the eventual route lands in `ReflowHistoryEntry.method` (`'outpaint'` or `'rerender'`).
- `outpaint` / `rerender` — explicit user override. The router is not consulted.

### `ReflowScope` (new)

```ts
export type ReflowScope = 'single' | 'batch_all' | 'carousel_all' | 'carousel_slide';
```

Mirrors Phase 17's `reflowImage` callable scope parameter.

### `ReflowHistoryEntry` (new)

One entry per item per reflow execution. Stored on `generations/{genId}.resolutionTrace.reflowHistory[]`.

```ts
export interface ReflowHistoryEntry {
    /** Unix milliseconds when this reflow was executed. */
    timestamp: number;

    /** Source aspect ratio (the ratio the source image was rendered at). */
    sourceRatio: AspectRatio;

    /** Target aspect ratio the user requested. */
    targetRatio: AspectRatio;

    /**
     * Symmetric fold-change between source and target ratios.
     * Computed as `max(target/current, current/target) - 1`, where each
     * ratio is its width÷height numeric value. Range: [0, ∞).
     * 0 means a no-op reflow (FR-005 short-circuit).
     */
    magnitude: number;

    /**
     * The method the system actually used to deliver the result.
     * After any fallback, this is the route that succeeded.
     */
    method: 'outpaint' | 'rerender';

    /**
     * The user's explicit choice, if any. `null` means the auto-router
     * chose; populated when the user picked Quick or Fresh.
     */
    userOverride: 'outpaint' | 'rerender' | null;

    /**
     * Populated only when a fallback occurred (contains the first
     * attempted route), otherwise null.
     */
    fallbackFrom: 'outpaint' | 'rerender' | null;

    /**
     * Why the first attempt failed, if a fallback occurred.
     * One of: 'engine_error' | 'drift' | 'no_plan' | 'mask_error' | 'transient'.
     */
    fallbackReason: ReflowFallbackReason | null;

    /**
     * For carousel/batch reflows: the per-item index. `null` for `scope: 'single'`.
     */
    itemIndex: number | null;

    /** Resulting image URL written to mockupHistory. `null` if both routes failed. */
    outputUrl: string | null;

    /**
     * Credits charged for this item. Only the route that succeeded is charged
     * (FR-014 / FR-017). 0 for no-op (FR-018) and rejected calls (FR-019).
     */
    creditsCharged: number;
}

export type ReflowFallbackReason =
    | 'engine_error'
    | 'drift'
    | 'no_plan'
    | 'mask_error'
    | 'transient';
```

### `ResolutionTrace` extension

Add one optional field. Existing `ResolutionTrace` is in `functions/src/types.ts`; add:

```ts
export interface ResolutionTrace {
    // … existing fields preserved …

    /**
     * Reflow history. One entry per item per reflow execution.
     * Optional — older generations have no entries.
     * Append-only via Firestore arrayUnion / transaction (see research.md R7).
     */
    reflowHistory?: ReflowHistoryEntry[];
}
```

### `MockupHistoryEntry` (already exists; documented here for completeness)

```ts
// functions/src/types.ts and src/types.ts already have this shape.
export interface MockupHistoryEntry {
    url: string;
    ratio: AspectRatio;
    rawBase64?: string;        // optional in-memory cache on the frontend
}
```

This hotfix appends new entries to `mockupHistory[]` on successful reflow; no schema change.

## TypeScript types (client mirror)

`src/types.ts` mirrors `ReflowMethod`, `ReflowScope`, `ReflowHistoryEntry`, `ReflowFallbackReason`, and `ReflowOutcome` so the frontend can type the `reflowImage` callable response (`{ scope, outcomes: ReflowOutcome[], totalCreditsCharged }`) and render per-item status badges and error rows. The frontend does NOT need `ReflowDecision` (used only inside the backend router).

## Internal types (callable boundary, not persisted)

These are used inside `reflowImage.ts` and `reflowRouter.ts` but never written to Firestore.

### `ReflowDecision`

```ts
export interface ReflowDecision {
    sourceRatio: AspectRatio;
    targetRatio: AspectRatio;
    magnitude: number;
    chosenMethod: 'outpaint' | 'rerender';
    isUserOverride: boolean;
}
```

### `ReflowOutcome`

```ts
export interface ReflowOutcome {
    itemIndex: number | null;
    success: boolean;
    method: 'outpaint' | 'rerender' | null;     // null if both routes failed
    fallbackFrom: 'outpaint' | 'rerender' | null;
    fallbackReason: ReflowFallbackReason | null;
    outputUrl: string | null;
    creditsCharged: number;
    errorCode?: string;                          // populated when success=false
    errorMessage?: string;                       // user-facing message
}
```

The callable's response is `{ scope: ReflowScope, outcomes: ReflowOutcome[], totalCreditsCharged: number }`.

## Firestore document deltas

### `generations/{genId}` — additive

```jsonc
{
    // … existing fields preserved …

    "mockupHistory": [
        // existing entries
        { "url": "https://…/source.png", "ratio": "1:1" },

        // NEW APPENDED ENTRIES (one per successful reflow item)
        { "url": "https://…/reflow-4x5.png", "ratio": "4:5" },
        { "url": "https://…/reflow-9x16.png", "ratio": "9:16" }
    ],

    "resolutionTrace": {
        // … existing trace fields preserved …

        // NEW OPTIONAL FIELD
        "reflowHistory": [
            {
                "timestamp": 1714075200000,
                "sourceRatio": "1:1",
                "targetRatio": "4:5",
                "magnitude": 0.25,
                "method": "outpaint",
                "userOverride": null,
                "fallbackFrom": null,
                "fallbackReason": null,
                "itemIndex": null,
                "outputUrl": "https://…/reflow-4x5.png",
                "creditsCharged": 2
            },
            {
                "timestamp": 1714075260000,
                "sourceRatio": "4:5",
                "targetRatio": "9:16",
                "magnitude": 0.422,
                "method": "rerender",
                "userOverride": null,
                "fallbackFrom": null,
                "fallbackReason": null,
                "itemIndex": null,
                "outputUrl": "https://…/reflow-9x16.png",
                "creditsCharged": 5
            }
        ]
    }
}
```

### Append semantics

- **mockupHistory** — `firestore.FieldValue.arrayUnion({ url, ratio })`. Idempotent for unique URL+ratio combos.
- **resolutionTrace.reflowHistory** — Firestore transaction (read-modify-write). The trace entry contains a `timestamp` and is therefore non-idempotent; `arrayUnion` is unsafe here.

Both writes happen inside a single Firestore transaction in `reflowImage.ts` so the two arrays stay consistent under concurrent reflows.

## State transitions

### Per-item reflow lifecycle

```text
                     ┌──────────────┐
                     │  user click  │
                     │   Resize     │
                     └──────┬───────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  validate target ratio │
                │  (FR-004)              │
                └──────┬─────────┬───────┘
                       │ unsupported
                       │  ratio
                       │         ╲
                       │          ▼
                       │     [ HttpsError, 0 credits, FR-019 ]
                       │
                ┌──────▼──────────┐  source==target?
                │  short-circuit   ├────yes────► [ noop, 0 credits, FR-005 ]
                │  check (FR-005)  │
                └──────┬───────────┘
                       │ no
                       ▼
                ┌────────────────────────┐
                │  resolve method        │
                │   • auto → router      │
                │   • outpaint → fixed   │
                │   • rerender → fixed   │
                └──────┬─────────────────┘
                       │
                       ▼
                ┌────────────────────────┐
                │  execute chosen route  │
                └──────┬─────────────────┘
                       │
              success ─┴─ failure
                  │            │
                  │            ▼
                  │     ┌───────────────────────────┐
                  │     │ method=auto?              │
                  │     │   yes → fallback          │
                  │     │     (FR-014 / FR-015)     │
                  │     │   no  → surface error     │
                  │     └───────┬───────────────────┘
                  │             │
                  │       success ┴ failure
                  │             │
                  ▼             ▼
        ┌───────────────────┐  ┌───────────────────────┐
        │ append mockupHist │  │ surface error to user │
        │ append reflowHist │  │ no append, no charge  │
        │ charge credits    │  └───────────────────────┘
        └───────────────────┘
```

### Multi-item reflow lifecycle (carousel/batch)

The above per-item lifecycle runs N times in parallel (capped at 5 concurrent per research.md R5). Each item appends independently; partial failures do not block sibling items. The aggregated callable response carries N outcomes.

## Validation rules

| Rule | Source |
|---|---|
| `targetRatio` MUST be one of the six supported aspect ratios. | FR-004 |
| `method` MUST be `'auto'`, `'outpaint'`, or `'rerender'`. | FR-003 |
| `scope` MUST be `'single'`, `'batch_all'`, `'carousel_all'`, or `'carousel_slide'`. | Phase 17 / FR-020-022 |
| `slideIndex` REQUIRED iff `scope === 'carousel_slide'`. | (callable contract) |
| `magnitude` is computed by the router only; never accepted from the client. | FR-002 |
| `creditsCharged` per item equals the cost of the route that ultimately succeeded. | FR-014 / FR-017 |
| `userOverride === null` iff `method` was `'auto'` in the request. | FR-024 |
| `fallbackFrom !== null` iff a fallback occurred. | FR-014 / FR-015 |
| When `method` was `outpaint` or `rerender` (user override), no fallback may occur. | research.md R4 / R6 |
| Outpaint output's locked center 70 % rectangle MUST be byte-identical to the corresponding source rectangle (decoded RGBA). | FR-008 |
| Outpaint engine MUST output a lossless format (PNG / lossless WebP). | FR-008 + research.md R1 |
| `mockupHistory` array MUST grow only by appending; existing entries MUST NOT be modified or removed. | FR-029 |

## Backward compatibility

- Generation records created before this hotfix have no `resolutionTrace.reflowHistory`. The TraceBuilder treats this as "no reflows yet"; new reflows append the first entry.
- Generation records created before this hotfix that have a `mockupHistory` array (Phase 17 introduced it) continue to receive new appends.
- Generation records that lack a saved `buildPlan` (genuinely legacy) follow the FR-015 fallback chain: rerender → outpaint → user-visible error. No silent invocation of the deprecated generative-edit REFLOW path is permitted (FR-026).
- The `ResolutionTrace.reflowHistory` field is optional; existing trace consumers (e.g. failure-classification, cultural-violation reporting) are not affected.
