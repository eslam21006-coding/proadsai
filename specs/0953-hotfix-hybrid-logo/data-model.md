# Phase 1 Data Model: HOTFIX-E — Hybrid Logo Handling

**Date**: 2026-04-24
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This document specifies every data shape introduced or modified by HOTFIX-E. The hotfix is purely additive at the data layer — no field is renamed, removed, or re-typed in any existing record. All extensions are JSON-optional so legacy records load and re-render correctly without backfill (FR-025).

## Entities

### 1. `LogoPlacement` — discriminated union (NEW)

Owned in: `functions/src/types.ts`

```ts
export type LogoZone =
    | 'top-left'
    | 'top-right'
    | 'top-center'
    | 'bottom-left'
    | 'bottom-right'
    | 'bottom-center'
    | 'center';

export interface UILogoPlacement {
    logoIndex: number;        // index into AdInputs.brandLogos[]
    mode: 'ui';
    zone: LogoZone;
    widthPct: number;         // canvas-width-percentage; clamped to [5, 18]
    opacity: number;          // clamped to [0.85, 1.0]
}

export interface EnvironmentalLogoPlacement {
    logoIndex: number;        // index into AdInputs.brandLogos[]
    mode: 'environmental';
    surface: string;          // 'coffee_mug' | 'laptop_lid' | 'wall_art' | 'tshirt_chest' | 'signage_behind' | 'book_cover' | 'tablet_back' | …
    environmentalContext: string;  // free-form description, e.g. "embossed on leather portfolio"
}

export type LogoPlacement = UILogoPlacement | EnvironmentalLogoPlacement;
```

**Validation rules** (enforced in `functions/src/buildPlanSlotMap.ts::validateLogoPlacements()` — note: the older draft of this doc referenced `validateStructuredBuildPlan()`, but the actual exported function is `validateLogoPlacements()`):

- **Never hard-rejects.** All violations are recorded on `events.drops` or `events.softWarnings` and the cleaned array is returned. The caller never sees an exception.
- `logoIndex` MUST be a non-negative integer (`Number.isInteger`) < `inputs.brandLogos.length`. Non-integer or out-of-range entries are recorded on `events.drops` with `reason: 'logo_index_out_of_range'`.
- `mode` MUST be `'ui'` or `'environmental'`. Missing or other values default to `'environmental'` at parse time (`normalizeLogoPlacements`, FR-025 legacy safety).
- For UI entries: `zone` MUST be one of the seven `LogoZone` values; invalid/missing zones are recorded on `events.softWarnings`. `widthPct` is clamped to `[5, 18]` (default `12` if missing); `opacity` is clamped to `[0.85, 1.0]` (default `1.0` if missing). Clamps are recorded on `events.clamps`, never rejected.
- For environmental entries: `surface` MUST be a non-empty string (missing/empty surface → `events.softWarnings`). `environmentalContext` may be the empty string `""` — that is allowed and not warned.
- Across the whole `logoPlacements` array per ad: at most 2 UI and at most 3 environmental entries are kept. Excess entries (after passing the per-entry zone/surface validation) are recorded on `events.drops` with `reason: 'over_ui_cap'` / `'over_environmental_cap'`. Invalid entries do NOT consume cap slots.
- `text_only` creative style MUST produce zero placements (FR-003). When the validator receives a non-empty `logoPlacements` on a `text_only` ad, it returns an empty `cleanedPlacements` and emits ONE `events.softWarnings` entry — it does NOT hard-reject the build plan or trigger a planner re-prompt.

### 2. `StructuredBuildPlanPayload` — EXTENSION (existing, additive)

Owned in: `functions/src/buildPlanSlotMap.ts:99`

```ts
export interface StructuredBuildPlanPayload {
    blueprint: string;
    zones: StructuredZoneAssignment[];
    overlayAssignments: StructuredOverlayAssignment[];
    mustShowAssignments: StructuredMustShowAssignment[];
    ownership: ContentOwnershipMap;
    logoPlacements: LogoPlacement[];   // ← NEW (additive, optional on read for backward compat)
}
```

**Read-side defaults** (in `parseStructuredBuildPlanResponse()`, `buildPlanSlotMap.ts:421`):

- Missing `logoPlacements` field → default `[]`. (Legacy records.)
- Per entry: missing `mode` field → default `'environmental'`. (FR-025 safer default — environmental cannot trigger the UI-distortion failure.)
- Per UI entry: missing `widthPct` → default `12`; missing `opacity` → default `1.0`; missing `zone` → drop the entry with a soft warning.
- Per environmental entry: missing `surface` → drop the entry with a soft warning; missing `environmentalContext` → default to the empty string `''`.

**Write-side**: the existing `serializeBuildPlanEnvelope()` (`buildPlanSlotMap.ts:324`) serializes the full payload as-is; no change required.

### 3. `ResolutionTrace` — EXTENSION (existing, additive)

Owned in: `functions/src/types.ts:100`

```ts
export interface LogoPipelineEvents {
    perLogo: Array<{
        logoIndex: number;
        chosenMode: 'ui' | 'environmental';
        finalZone?: LogoZone;          // present iff chosenMode === 'ui'
        finalSurface?: string;         // present iff chosenMode === 'environmental'
    }>;
    autoShifts: Array<{
        logoIndex: number;
        from: LogoZone;
        to: LogoZone;
        reason: 'text_collision' | 'cta_collision';
    }>;
    drops: Array<{
        logoIndex: number;
        reason: 'no_non_colliding_zone'
              | 'over_ui_cap'
              | 'over_environmental_cap'
              | 'logo_index_out_of_range';
        candidatesExhausted: LogoZone[];   // [] for non-collision reasons
    }>;
    clamps: Array<{
        logoIndex: number;
        field: 'widthPct' | 'opacity';
        rawValue: number;
        clampedValue: number;
    }>;
    softWarnings: Array<{
        logoIndex: number;
        reason: 'composite_failed' | 'corrupt_source' | 'unsupported_format' | 'missing_source' | 'compositor_unavailable';
        detail?: string;
    }>;
}

export interface ResolutionTrace {
    // … all existing fields unchanged …
    logoPipeline?: LogoPipelineEvents;   // ← NEW (optional, present only when at least one logo was processed)
}
```

**TraceBuilder extension** (`functions/src/resolutionTrace.ts:49-115`):

- New method: `setLogoPipeline(events: LogoPipelineEvents): TraceBuilder`. Writes to `state._logoPipeline`.
- `build()` (line 116) emits `state._logoPipeline` as the `logoPipeline` field on the frozen output.
- All arrays inside `LogoPipelineEvents` are deep-cloned before freezing (matches the existing `autoSwitchEvents` and `perSlide` cloning pattern in `build()`).

**Backward compat**: a record without `logoPipeline` is unchanged in behavior. Resolution-trace consumers (Phase 16 viewer, debug logs) MUST treat `logoPipeline` as optional.

### 4. `AdInputs.brandLogos` — UNCHANGED

Owned in: `src/types.ts:272` (already shipped via HOTFIX-D / PR #26).

```ts
brandLogos?: string[];    // Box B (Max 5) — base64 data URLs
```

The `logoIndex` field on every `LogoPlacement` references this array by integer index. No change to upload path, no change to storage, no change to the array shape.

## Lifecycle

1. **Plan time** (inside `generateBuildPlan()` in `functions/src/generators.ts`): the planner LLM is given the mode-selection hint (D4 / D6) plus the count of `inputs.brandLogos`, and returns a `logoPlacements` array as part of its structured machine plan. The validator at `validateStructuredBuildPlan()` enforces the rules above, recording clamps and drops on the trace builder.

2. **Render time** (inside `generateFinalAd()` at `functions/src/generators.ts` line 4049+): the assembled prompt to the image model includes:
   - For each UI placement: the "leave the zone clear, will composite post-render" instruction.
   - For each environmental placement: the "render on {surface} matching perspective/lighting/material" instruction with the uploaded logo as visual reference.
   - The `SCREEN_CONTENT_BAN_BLOCK` if the scene contains a device.

3. **Post-render** (inside the existing post-render Sharp chain at `generators.ts:5670–5790`): `compositeUILogos()` runs FIRST, returning `{ image, events }`. The `events` are merged into the trace builder. The `image` flows downstream to `compositeArabicText()` / `compositeFullAdText()` and then to `compositeOfferOverlay()`.

4. **Persistence**: the build plan (with `logoPlacements`) and the trace (with `logoPipeline`) are written to Firestore via existing paths. No new fields outside the two sub-objects above.

5. **Re-render** (saved-project re-load, Phase 13 path; reflow re-render, HOTFIX-F path): `parseStructuredBuildPlanResponse()` reads `logoPlacements` from the saved envelope; the post-render chain re-runs identically. Legacy records without `logoPlacements` get `[]` and re-render with no UI-logo composite step (FR-025).

## Relationships

- One `StructuredBuildPlanPayload` HAS-MANY `LogoPlacement` (via `logoPlacements`).
- One `LogoPlacement` REFERENCES one entry in `AdInputs.brandLogos[]` (by `logoIndex`).
- One `ResolutionTrace` HAS-ZERO-OR-ONE `LogoPipelineEvents` (via optional `logoPipeline`).
- One `LogoPipelineEvents` HAS-MANY records of each event subtype (per-logo, auto-shifts, drops, clamps, soft warnings).
- For carousel: each slide has its OWN `StructuredBuildPlanPayload` with its OWN `logoPlacements`; the `ResolutionTrace.perSlide[]` entries each can have their own `logoPipeline` (extension to `SlideEntry` is out of scope here — per-slide trace logging is logged on the parent trace if needed).
- For batch: each variant has its OWN `StructuredBuildPlanPayload` with its OWN `logoPlacements`; each variant's generation record carries its own resolution trace.

## State transitions

`LogoPlacement` is immutable from the moment the planner emits it until the post-render compositor reads it. The compositor does NOT mutate placement records — it reads the planned `zone` and, on collision, RESOLVES a new effective zone that is recorded on `logoPipeline.autoShifts[]` and `logoPipeline.perLogo[i].finalZone`. The original planned zone is preserved verbatim in the persisted `logoPlacements` array (audit trail per Constitution Principle VI).

```text
PLANNED                    EFFECTIVE (resolved post-render)
─────────────────────────  ─────────────────────────────────
zone: 'top-right'      →   finalZone: 'top-right'   (no collision)

zone: 'top-right'      →   finalZone: 'top-left'    (auto-shift, recorded in autoShifts[])
                           +
                           autoShifts[i] = {
                             logoIndex: 0,
                             from: 'top-right',
                             to: 'top-left',
                             reason: 'text_collision'
                           }

zone: 'top-right'      →   (no finalZone — logo dropped)
                           +
                           drops[i] = {
                             logoIndex: 0,
                             reason: 'no_non_colliding_zone',
                             candidatesExhausted: ['top-right', 'top-left', 'top-center',
                                                   'bottom-right', 'bottom-center', 'bottom-left']
                           }
```

## Volume / scale

- Per ad: `logoPlacements` ≤ 5 (matches the upload cap from HOTFIX-D); `logoPipeline.perLogo` ≤ 5; other event arrays small (auto-shifts, drops, clamps, softWarnings each ≤ 5).
- Per generation record: `logoPipeline` total payload ≤ ~2 KB JSON. Negligible compared to the existing build-plan envelope and the rendered image base64.
- No fanout: each generation record stores exactly one `logoPipeline` (or none).

## Indexing / queryability

No new Firestore indexes required. `logoPipeline` is a sub-object inside an already-indexed document; query patterns for the resolution-trace viewer (Phase 16) read whole documents.

## Backward compatibility matrix

| Record state | `logoPlacements` field | Behavior on re-render |
|---|---|---|
| Pre-HOTFIX-E | absent | `parseStructuredBuildPlanResponse()` returns `[]` → no UI-logo composite step → model renders all logos as it always has. Safer default per FR-025. |
| Post-HOTFIX-E, no logos uploaded | `[]` | No-op. UI-logo composite step is a no-op. No `logoPipeline` recorded. |
| Post-HOTFIX-E, one UI logo | `[{ logoIndex: 0, mode: 'ui', zone, widthPct, opacity }]` | Sharp composite runs once; trace records mode + final zone. |
| Post-HOTFIX-E, mixed modes | mix of UI and environmental entries | Sharp composite runs only for UI entries; environmental entries pass through to the model render. |
| Post-HOTFIX-E, planner emitted out-of-bound width | `[{ logoIndex: 0, mode: 'ui', widthPct: 30, … }]` | Validator clamps to `18`, records `clamps[]` entry. Composite uses `18`. |

## Out-of-scope data extensions

- Per-slide `logoPipeline` on `SlideEntry` (carousel-specific): out of scope for this hotfix. If per-slide debugging is needed later, the parent trace's `logoPipeline` carries the union; per-slide isolation is a Phase 16 viewer concern.
- A frontend-readable `currentEffectiveLogoPlacement` view (e.g. for a "click logo to edit position" UI): out of scope per spec § Out of Scope.
- A `logoPipelineSchemaVersion: 1` stamp on the payload: rejected per research D12 (no purpose without a future migration to coordinate against).
