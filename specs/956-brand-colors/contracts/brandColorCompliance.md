# Contract: `brandColorCompliance.checkBrandColorCompliance()`

**Module**: `functions/src/brandColorCompliance.ts`
**Type**: Async function (Sharp-backed image analysis); deterministic for a given image buffer + brand primary
**Spec FRs satisfied**: FR-013, FR-014, FR-015, FR-016, FR-019

## Signature

```ts
async function checkBrandColorCompliance(
    imageBuffer: Buffer,
    brandPrimary: string | null,
    assetId: string,
): Promise<BrandColorComplianceEntry>;

interface BrandColorComplianceEntry {
    assetId: string;
    checkRan: boolean;
    present: boolean;
    deltaE: number | null;
    dominantSwatch: string | null;
    deductedScore: number;
    skippedReason?: 'no_brand_colors' | 'image_unanalyzable';
}
```

## Behavior contract

| Input | Output `checkRan` | Output `present` | Output `deductedScore` | Output `skippedReason` |
|---|---|---|---|---|
| `brandPrimary === null` (or empty / malformed hex) | `false` | `false` | `0` | `'no_brand_colors'` |
| `imageBuffer` is corrupt / zero-byte / Sharp throws on decode | `false` | `false` | `0` | `'image_unanalyzable'` |
| Valid image, brand primary present (min ΔE-2000 across 5 dominant clusters < 15) | `true` | `true` | `0` | (absent) |
| Valid image, brand primary absent (min ΔE-2000 ≥ 15) | `true` | `false` | `10` | (absent) |

## Algorithm (binding for the implementation)

1. **Guard**: if `brandPrimary` is not a normalized 7-char hex (`#RRGGBB`), return the no-brand-colors skip entry. No image work performed.
2. **Decode and downsize**: `sharp(imageBuffer).resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer()` → `Buffer` of 1024 × 3 bytes (RGB). On any throw, return the unanalyzable skip entry.
3. **k-means**:
   - k = 5
   - max iterations = 10
   - Deterministic seed: cluster centers initialized from pixels at indices `floor(i * 1024 / 5)` for i ∈ {0,1,2,3,4}.
   - Distance metric inside k-means: squared Euclidean in raw RGB (cheap; cluster identity is the goal, not perceptual accuracy).
4. **CIELAB conversion**: convert each of the 5 cluster centers and the brand primary from sRGB to CIELAB (D65 reference white).
5. **ΔE-2000**: compute the CIEDE2000 distance from `brandPrimary`-Lab to each of the 5 center-Labs. Take the minimum.
6. **Compare** against the threshold 15 → set `present`.
7. **Build entry**:
   - `assetId`: passed through from the caller (e.g., `'single'`, `'slide-3'`, `'batch-7'`).
   - `deltaE`: the minimum value found.
   - `dominantSwatch`: hex of the closest cluster center (the one that produced the minimum ΔE).
   - `deductedScore`: `present ? 0 : 10`.

## Error contract

The function never throws. Every code path that could fail returns the unanalyzable skip entry (with `checkRan: false`) instead. Callers can rely on always receiving a valid `BrandColorComplianceEntry`.

## Concurrency contract (caller-side)

- For single image: call once.
- For carousel of N slides: call N times via `Promise.allSettled`, with at most 5 in flight at once (use a small concurrency limiter — same pattern as `955-aspect-reflow` carousel reflow).
- For batch of M items: call M times via `Promise.allSettled`, same 5-concurrent cap.

`allSettled` ensures one bad image does not poison the result array. The caller maps fulfilled results into `resolutionTrace.brandColorCompliance[]` and treats rejected promises (which should not occur given the never-throw contract) as if they returned an `image_unanalyzable` skip.

## Performance contract

- < 800 ms p95 per asset on the existing 2 GiB / 1 vCPU Cloud Function profile (research.md Decision 1).
- 0 model calls. 0 network calls. 0 disk writes.
- Memory footprint per call: under 50 KB (32×32×3 = 3 KB raw buffer + k-means working set).

## Test fixtures (subset; exhaustive set lives in `contractFixtures.test.ts`)

Reference IDs:

- `BCC-01-no-brand-colors` — `brandPrimary: null` → `{ checkRan: false, deductedScore: 0, skippedReason: 'no_brand_colors' }`.
- `BCC-02-empty-string` — `brandPrimary: ''` → same as BCC-01.
- `BCC-03-malformed-hex` — `brandPrimary: 'not-a-hex'` → same as BCC-01.
- `BCC-04-image-unanalyzable` — `imageBuffer: Buffer.alloc(0)` → `{ checkRan: false, deductedScore: 0, skippedReason: 'image_unanalyzable' }`.
- `BCC-05-present` — synthetic 32×32 PNG with a 6×6 patch of `#0A66C2` against neutral background, `brandPrimary: '#0A66C2'` → `{ checkRan: true, present: true, deltaE < 5, deductedScore: 0 }`.
- `BCC-06-absent` — synthetic 32×32 PNG of pure `#FFFFFF`, `brandPrimary: '#0A66C2'` → `{ checkRan: true, present: false, deltaE > 50, deductedScore: 10 }`.
- `BCC-07-near-miss` — synthetic image with `#0A66D0` (ΔE ≈ 2 from `#0A66C2`) → `{ present: true }`.
- `BCC-08-far-miss` — synthetic image with `#0A66E5` and shadows (ΔE ≈ 17) → `{ present: false }`.

## Integration with `creativeScoringEngine.ts`

The scoring engine's existing `CreativeScoreResult` is computed per asset. After the existing scoring math runs:

1. Read the `BrandColorComplianceEntry` for this asset from the trace.
2. If the entry is missing or `checkRan === false` → no change to the score.
3. If `checkRan === true && present === false` → subtract `entry.deductedScore` (always 10) from `overallScore` and append `"Brand primary missing from rendered image"` to `violations[]`.
4. Recompute `passed = overallScore >= PASS_THRESHOLD`. (A single brand-color miss can tip a borderline asset across the threshold — this is the intended behavior, see research.md Decision 2.)

The scoring engine MUST NOT call the compliance function itself; the entry is already in the trace by the time scoring runs. This decouples the scoring pass from any image I/O.
