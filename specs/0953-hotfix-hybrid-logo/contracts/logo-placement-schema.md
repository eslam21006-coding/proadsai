# Contract: Logo Placement Schema

**Owner**: `functions/src/types.ts` (TypeScript types) + `functions/src/buildPlanSlotMap.ts` (validator)
**Consumed by**: `functions/src/generators.ts` (planner prompt + post-render orchestration), `functions/src/logoComposite.ts` (compositor), `functions/src/contractFixtures.test.ts` (HFE.8 fixtures)

This contract defines the per-placement record the planner LLM emits as part of the structured build plan, and the validator's contract on what it must accept, default, clamp, or reject.

## Type

```ts
export type LogoZone =
    | 'top-left' | 'top-right' | 'top-center'
    | 'middle-left' | 'middle-right' | 'middle-center'
    | 'bottom-left' | 'bottom-right' | 'bottom-center'
    | 'center';

export interface UILogoPlacement {
    logoIndex: number;
    mode: 'ui';
    zone: LogoZone;
    widthPct: number;          // canvas-width-percentage; valid range [5, 18]
    opacity: number;            // valid range [0.85, 1.0]
}

export interface EnvironmentalLogoPlacement {
    logoIndex: number;
    mode: 'environmental';
    surface: string;
    environmentalContext: string;
}

export type LogoPlacement = UILogoPlacement | EnvironmentalLogoPlacement;
```

## Per-field rules

### `logoIndex`

- **Type**: non-negative integer.
- **Range**: `0 ≤ logoIndex < inputs.brandLogos.length`.
- **Invalid**: out-of-range → drop entry, record `drops[i] = { logoIndex, reason: 'logo_index_out_of_range', candidatesExhausted: [] }`.

### `mode`

- **Type**: string literal.
- **Allowed**: `'ui'` or `'environmental'`.
- **Missing or other**: default to `'environmental'` (FR-025 safer default), record one soft warning per missing value.

### UI mode — `zone`

- **Type**: enum `LogoZone`.
- **Allowed**: the ten values listed above (3 top + 3 middle + 3 bottom + center).
- **Invalid or missing**: drop entry, record one soft warning. Do NOT default a missing zone (no safe default exists — center risks hero collision, corners are arbitrary).

### UI mode — `widthPct`

- **Type**: number in `[5, 18]`.
- **Default if missing**: `12`.
- **Out of range**: clamp to nearest bound, record `clamps[i] = { logoIndex, field: 'widthPct', rawValue, clampedValue }`. Do NOT reject.
- **Negative or non-number**: clamp to `12`, record clamp.

### UI mode — `opacity`

- **Type**: number in `[0.85, 1.0]`.
- **Default if missing**: `1.0`.
- **Out of range**: clamp to nearest bound, record `clamps[i] = { logoIndex, field: 'opacity', rawValue, clampedValue }`. Do NOT reject.
- **Negative or non-number**: clamp to `1.0`, record clamp.

### Environmental mode — `surface`

- **Type**: non-empty string.
- **Recommended values**: `coffee_mug`, `laptop_lid`, `wall_art`, `tshirt_chest`, `signage_behind`, `book_cover`, `tablet_back`, `portfolio_leather`, `merch_canvas_tote`, `branded_box`. The list is open — any non-empty surface name is accepted; the planner is trusted to pick a surface that fits the scene.
- **Empty or missing**: drop entry, record one soft warning.

### Environmental mode — `environmentalContext`

- **Type**: string.
- **Empty or missing**: default to the empty string `''`. Allowed, since the surface alone may be sufficient context for the model.

## Per-array rules (across all entries on one ad)

- **Total count**: MUST NOT exceed `inputs.brandLogos.length`. Excess entries (over the upload count) are dropped in order.
- **Per-mode caps**: at most 2 UI entries, at most 3 environmental entries (FR-006). After reaching a cap, any additional same-mode entries are dropped, recorded as `drops[i] = { logoIndex, reason: 'over_ui_cap' | 'over_environmental_cap', candidatesExhausted: [] }`.
- **`text_only` style override**: if the resolved creative style is `text_only`, the `logoPlacements` array MUST be empty. When `validateLogoPlacements()` receives a non-empty array on a `text_only` ad, it returns an empty `cleanedPlacements` and emits one `softWarnings[]` entry — it does NOT hard-reject the build plan or re-prompt the planner. Callers should treat this as a non-fatal cleanup step.

## Persistence

- `logoPlacements` is serialized inside the structured machine plan via the existing `serializeBuildPlanEnvelope()` (`buildPlanSlotMap.ts:324`) and read back via `parseStructuredBuildPlanResponse()` (line 421).
- No new Firestore field, no new collection.

## Backward compat

- Records persisted before HOTFIX-E lack `logoPlacements`. On read, the parser returns `[]` (FR-025).
- Records persisted by HOTFIX-E with a `mode`-less entry (defensive against future planner regressions) are read with `mode: 'environmental'` defaulted.

## Validation outputs (for the trace builder)

The validator returns, alongside the cleaned `logoPlacements` array, an event bundle of the same shape as `LogoPipelineEvents.{clamps, drops, softWarnings}`. This bundle is merged into the trace builder by the calling code in `generators.ts` so the trace records the validator's decisions before the compositor runs.

## Fixtures

HFE.8 covers the validator end-to-end (see `contracts/ui-logo-compositor.md` for the post-render fixtures):
- planner emits two UI entries → validator accepts both, no warnings.
- planner emits three UI entries → validator accepts first 2, drops the third with `over_ui_cap`.
- planner emits widthPct: 30 → validator clamps to 18, records `clamps[]` entry.
- planner emits widthPct: 2 → validator clamps to 5.
- planner emits opacity: 0.5 → validator clamps to 0.85.
- planner emits a logoIndex of 7 when only 2 logos uploaded → validator drops with `logo_index_out_of_range`.
- planner emits an entry with mode: 'video' (unrecognized) → validator defaults to `'environmental'`.
- planner emits a `text_only` build plan with non-empty logoPlacements → validator returns an empty `cleanedPlacements` and emits one `softWarnings[]` entry per discarded placement (soft warning, not a hard rejection).
