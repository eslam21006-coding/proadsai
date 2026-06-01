# Contract: `getSafeZoneForRatio(aspectRatio)` — pure function (Regenerated 2026-05-29)

**Status**: New in Phase 17. Lives in `functions/src/layoutContract.ts`. Exported and consumed by `functions/src/textCompositing.ts` (and unit tests).

## Signature

```ts
import type { AspectRatio } from './generators.js';

export function getSafeZoneForRatio(aspectRatio: AspectRatio): SafeZoneInsetsPct;

export interface SafeZoneInsetsPct {
  top: number;       // percentage of canvas height
  right: number;     // percentage of canvas width
  bottom: number;    // percentage of canvas height
  left: number;      // percentage of canvas width
}
```

## Behavior

Returns the percentage insets for the requested ratio per the authoritative table below. Pure function — no side effects, no I/O.

| ratio | top | right | bottom | left |
|---|---|---|---|---|
| 1:1 | 8 | 8 | 8 | 8 |
| 4:5 | 10 | 8 | 10 | 8 |
| 3:4 | 12 | 8 | 12 | 8 |
| 4:3 | 8 | 12 | 8 | 12 |
| 9:16 | 14 | 8 | 14 | 8 |
| 16:9 | 8 | 14 | 8 | 14 |

## Error handling

**Unknown ratio**: MUST throw. Per spec FR-013: "Unknown ratios MUST be rejected explicitly rather than silently falling back." Suggested implementation: `throw new Error(\`Unsupported aspect ratio: ${aspectRatio}\`)`. Consumers MUST NOT mask the throw — an unsupported ratio reaching this function indicates a contract violation upstream.

## Scope of use

Only the **re-render path** of `textCompositing.ts` consumes this function (FR-011 + research R-003). The outpaint route preserves text via the locked-region guarantee and does not invoke text composition.

## Relationship to existing `safeZoneInset` field

This function is **additive**. The existing `ASPECT_RATIO_RULES[ratio].safeZoneInset` (in `layoutContract.ts:151-224`) is a single pixel scalar baked into the render-prompt block consumed by the 9 generation callables. It MUST NOT be modified — the render-prompt numbers are part of the launch contract.

The new function returns percentage insets for a different consumer: post-render text composition, which operates on the actual rendered image dimensions and needs asymmetric per-edge insets.

See [../research.md](../research.md) R-002 for the full decision.

## Test coverage (FR-013 / fixture T010)

```ts
expect(getSafeZoneForRatio('9:16')).toEqual({ top: 14, right: 8, bottom: 14, left: 8 });
expect(getSafeZoneForRatio('1:1')).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
expect(getSafeZoneForRatio('4:3')).toEqual({ top: 8, right: 12, bottom: 8, left: 12 });
expect(() => getSafeZoneForRatio('21:9' as AspectRatio)).toThrow();
```
