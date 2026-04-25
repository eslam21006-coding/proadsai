# Contract: UI Logo Compositor

**Owner**: `functions/src/logoComposite.ts` (NEW FILE)
**Consumed by**: `functions/src/generators.ts` (post-render Sharp chain at lines 5670–5790)

This contract defines the deterministic post-render compositor that takes the model-rendered base image and overlays each `mode === 'ui'` logo placement at its planned (or auto-shifted) zone. Environmental placements pass through untouched.

## Signature

```ts
export interface CompositeUILogosArgs {
    baseImageBase64: string;        // 'data:image/png;base64,…' or raw base64
    brandLogos: string[];           // base64 data URLs from AdInputs.brandLogos
    placements: LogoPlacement[];    // full array, including environmental entries (which are skipped)
    layoutContract: FullLayoutContract;
    canvasWidth: number;
    canvasHeight: number;
}

export interface CompositeUILogosResult {
    image: string;                  // 'data:image/png;base64,…' — never null, even on total failure
    events: LogoPipelineEvents;     // structured per-logo log
}

export async function compositeUILogos(
    args: CompositeUILogosArgs,
): Promise<CompositeUILogosResult>;
```

## Conventions (mirrors existing post-render compositors)

- Sharp is loaded lazily via `try { sharp = require('sharp'); } catch { … }` (matches `offerOverlay.ts:8-13`).
- If Sharp is unavailable: return `{ image: args.baseImageBase64, events: { …, softWarnings: [{ logoIndex: -1, reason: 'compositor_unavailable' }] } }`. Never throw.
- Each per-logo Sharp call is wrapped in try/catch. On exception: skip the logo, record `softWarnings[i] = { logoIndex, reason: 'composite_failed', detail: err.message }`, continue with the remaining logos.
- Output is always `data:image/png;base64,…` (matches `offerOverlay.ts:360`).
- The function NEVER returns `null` and NEVER throws — single-logo failure must not block ad delivery (FR-027).

## Algorithm

1. **Filter to UI placements**: ignore entries where `mode === 'environmental'`. They were already rendered by the model.
2. **Resolve canvas zones**: for each UI placement, look up `zone` in the layout contract's safe-zone map. Compute pixel `x, y, width, height` rectangles for both:
   - The placement's planned target rectangle (using `widthPct × canvasWidth`, aspect-preserved height).
   - All text/CTA collision rectangles from `layoutContract.zones` (any zone with `priority` corresponding to text or CTA).
   - All previously placed UI logo rectangles for this ad — appended to the collision set after each successful composite, so a later UI logo cannot be auto-shifted onto an area an earlier UI logo already occupies.
3. **Collision detection**: for each UI placement, test the planned target rectangle against every collision rectangle (text/CTA + any prior UI logo rect). If any overlap, run auto-shift (step 4). If no collision, proceed to step 5 with the planned zone.
4. **Auto-shift (FR-011, FR-012)**:
   - Compute the candidate list for the placement's vertical band, in clockwise order starting from the planned zone:
     - Top band candidates: `[top-right, top-center, top-left]` rotated to start with the planned zone.
     - Bottom band candidates: `[bottom-right, bottom-center, bottom-left]` rotated to start with the planned zone.
     - Center band: `[center]` only — no shift candidates within the band (per research D8).
   - Iterate the same-band candidates in order; for each, recompute target rectangle, test against text/CTA rectangles. First non-colliding candidate wins; record `autoShifts[i] = { logoIndex, from: planned, to: chosen, reason: 'text_collision' | 'cta_collision' }`.
   - If same-band exhausted: iterate the OTHER band's candidates in the equivalent clockwise order. First non-colliding candidate wins; record `autoShifts[i]` with the cross-band shift.
   - If both bands exhausted: drop this logo. Record `drops[i] = { logoIndex, reason: 'no_non_colliding_zone', candidatesExhausted: [planned, …all candidates tried…] }`. Skip to the next placement.
   - **Center placements are NOT auto-shifted** — if a center UI placement collides, drop it directly (auto-shifting to a corner would defeat the planner's intent of a centered lockup).
5. **Sharp composite**:
   - Decode the uploaded logo at `brandLogos[placement.logoIndex]` from base64.
   - Resize via `sharp(logoBuffer).resize({ width: targetPixelWidth, fit: 'inside' })` to preserve aspect ratio.
   - Apply a subtle drop shadow for legibility (CSS-equivalent: `drop-shadow(0 1px 2px rgba(0,0,0,0.25))`). Implementation: pre-render the resized logo onto a transparent canvas with a Gaussian-blurred shadow layer beneath via Sharp's composite operations.
   - Apply the placement's `opacity` via `sharp().composite([{ input, blend: 'over', opacity }])` if Sharp version supports it directly, or via a pre-multiply step if not.
   - Composite onto the running base image at the resolved zone's pixel `top, left` coordinates.
   - On success: record `perLogo[i] = { logoIndex, chosenMode: 'ui', finalZone }`.
6. **Return**: `{ image: <accumulated base image base64>, events: <accumulated LogoPipelineEvents> }`.

## Sharp pipeline pattern (matches `offerOverlay.ts:351-358`)

```ts
const result = await sharp(currentBaseBuffer)
    .composite([{
        input: resizedLogoWithShadowBuffer,
        top: pixelTop,
        left: pixelLeft,
        blend: 'over',
        // opacity handled via pre-multiply if needed
    }])
    .png()
    .toBuffer();
```

The `currentBaseBuffer` is updated after each successful per-logo composite so subsequent UI logos see the previously placed ones (relevant when the auto-shift logic for logo 2 needs to know logo 1's final placement — though zone-grain collision avoids this in practice).

## Inputs the compositor never modifies

- The `placements: LogoPlacement[]` array — read-only. The original planned zones are preserved verbatim (audit trail per Constitution Principle VI). Effective zones live in `events.perLogo[i].finalZone` and `events.autoShifts[]`.
- The `brandLogos: string[]` array — read-only.
- The `layoutContract` — read-only.

## Pre-conditions

- `args.canvasWidth > 0` and `args.canvasHeight > 0` (non-zero canvas).
- `args.layoutContract.zones` populated (the existing `compileFullContract()` always populates this).
- `args.brandLogos.length` may be 0 (no-op return).
- `args.placements.length` may be 0 (no-op return).

## Post-conditions

- `result.image` is a valid PNG data URL.
- `result.image` size in pixels equals the input `canvasWidth × canvasHeight` (Sharp's `composite` preserves base canvas size).
- `result.events.perLogo.length` equals the count of UI placements that successfully composited (NOT the count of UI placements input — a dropped or failed placement does not appear in `perLogo`, but DOES appear in `drops` or `softWarnings`).
- `result.events.autoShifts.length + result.events.drops.length + result.events.softWarnings.length` is bounded by the count of UI placements input.

## Test fixtures (HFE.8)

| # | Scenario | Assertion |
|---|---|---|
| HFE.8.a | Minimalist single ad, 1 UI placement, no text collision | `events.perLogo.length === 1`, `events.perLogo[0].finalZone === planned`, `events.autoShifts.length === 0`, `events.drops.length === 0`, output PNG bytes ≠ input PNG bytes (compositing happened). |
| HFE.8.b | Lifestyle single ad, 1 environmental placement | `events.perLogo.length === 0` (no UI placements), output PNG bytes === input PNG bytes (compositor was a no-op). |
| HFE.8.c | Corporate ad with laptop, 1 UI placement on top-right that collides with a top-right text zone | `events.autoShifts.length === 1`, `events.autoShifts[0].from === 'top-right'`, `events.autoShifts[0].to !== 'top-right'`, `events.perLogo[0].finalZone === events.autoShifts[0].to`. |
| HFE.8.d | Mixed 5-slide carousel with 1 logo: slides 1 + 5 UI, slides 2-4 environmental | `compositeUILogos()` is invoked once per slide; on slides 1 and 5 it composites once; on slides 2-4 it is a no-op (no UI placements). |
| HFE.8.e | Single ad with 3 logos planned: 2 UI + 1 environmental | compositor receives all 3 placements; runs Sharp twice (for the 2 UI); environmental placement appears in neither `perLogo` nor `drops` nor `softWarnings`. |

Plus negative-path fixtures:

| # | Scenario | Assertion |
|---|---|---|
| HFE.8.f | UI placement with corrupt logo source (invalid base64) | `events.softWarnings[0].reason === 'corrupt_source'` (or `'composite_failed'`), other UI placements still composite, `result.image` is non-null. |
| HFE.8.g | UI placement on top-right when both top-band AND bottom-band are entirely collided | `events.drops[0].reason === 'no_non_colliding_zone'`, `events.drops[0].candidatesExhausted` lists all 6 corner/edge zones. `result.image` is the base image unchanged for that one logo. |
| HFE.8.h | Sharp module unavailable (mocked require failure) | `result.image === args.baseImageBase64` (passed through unchanged), `events.softWarnings[0].reason === 'compositor_unavailable'`. |

## Out-of-scope behaviors

- Vector / SVG logo rendering — out of scope; PNG/JPEG only via Sharp's standard decoder set.
- Logo color recoloring (e.g. invert for dark backgrounds) — out of scope; the uploaded asset is composited as-is.
- Re-composite-on-edit (when Magic Edit modifies the underlying ad) — owned by Phase 11.
