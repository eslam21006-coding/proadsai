# Phase 1 Data Model: Brand Colors — End-to-End Consistency

**Branch**: `956-brand-colors` | **Date**: 2026-04-26
**Companion**: [plan.md](./plan.md), [research.md](./research.md)

This feature is **additive** to the existing schema. No collection changes, no field renames, no migration. Three new optional fields and three new TypeScript types.

---

## TypeScript types — additions to `functions/src/types.ts`

### `BrandColorSource`

Where the resolved brand-color pair came from. Recorded once per generation in `inputs.brandColorSource`. Used by traceability and by the frontend's "Using workspace colors" label logic.

```ts
export type BrandColorSource =
    | 'form'        // explicit per-generation form input won
    | 'avatar'      // audience avatar attached to this generation supplied colors
    | 'inherited'   // retargeting / remix inheritance from a linked source ad
    | 'workspace'   // active workspace default
    | 'none';       // no source had non-empty, valid colors — generation has no brand colors
```

State transitions: this is a **terminal field** assigned once at generation submit time and never mutated.

### `BrandColorPair`

The resolved primary + optional secondary + the auto-picked CTA text color. Returned by `resolveBrandColors()` and threaded through every prompt-build site, the compositor, and the compliance check.

```ts
export interface BrandColorPair {
    primary: string | null;       // 7-char hex like '#0A66C2', or null when source === 'none'
    secondary: string | null;     // 7-char hex, or null when not supplied (even when primary is set)
    ctaTextColor: '#FFFFFF' | '#1A1A1A' | null;  // null iff primary is null; otherwise WCAG-luminance-derived
    source: BrandColorSource;
}
```

Validation rules (enforced by the resolver):
- Hex strings MUST match `/^#[0-9A-Fa-f]{6}$/` after normalizing (trim whitespace, then lowercase the body to `#rrggbb`). Anything else → treated as empty per FR-017.
- `primary` and `secondary` are resolved **independently** by precedence (form > avatar > inherited > workspace). A higher-precedence source supplying only a primary does NOT block a lower-precedence source's secondary from being inherited (and vice versa). The `source` label tracks the primary's source.
- `secondary` MAY be null even when `primary` is non-null (no source had a valid secondary anywhere in the precedence chain).
- `ctaTextColor` is computed iff `primary` is non-null; null otherwise.
- `source: 'none'` ⇔ `primary === null && secondary === null && ctaTextColor === null`.

### `BrandColorComplianceEntry`

One per rendered asset (one for a single image, N for a carousel of N slides, M for a batch of M items). Lives in an array on `resolutionTrace`. Used by `creativeScoringEngine.ts` and by future dashboards.

```ts
export interface BrandColorComplianceEntry {
    assetId: string;            // 'single' | `slide-${index}` | `batch-${index}` — stable per generation
    checkRan: boolean;          // false when image was unanalyzable (corrupt / zero bytes / no brand colors set)
    present: boolean;           // true when the brand primary appeared within ΔE-2000 < 15 of any dominant cluster
    deltaE: number | null;      // minimum ΔE-2000 across the 5 dominant clusters; null when checkRan === false
    dominantSwatch: string | null; // hex of the closest dominant cluster center; null when checkRan === false
    deductedScore: number;      // 0 when not flagged; 10 when flagged (matches Decision 2)
    skippedReason?: 'no_brand_colors' | 'image_unanalyzable';  // present iff checkRan === false
}
```

### Extension to `ResolutionTrace`

Append two new optional members. Both are absent on legacy records (FR-019: legacy records are not backfilled).

```ts
export interface ResolutionTrace {
    // ... existing fields unchanged ...
    brandColorSource?: BrandColorSource;
    brandColorCompliance?: BrandColorComplianceEntry[];
}
```

### Extension to `GenerationInputs` (or whatever the per-generation input type is named)

The existing `brandColorPrimary` / `brandColorSecondary` strings on the inputs object are unchanged. Add one optional field:

```ts
export interface GenerationInputs {
    // ... existing fields unchanged ...
    brandColorPrimary?: string;   // already exists
    brandColorSecondary?: string; // already exists
    brandColorSource?: BrandColorSource;  // NEW — mirrored on inputs for fast read without unpacking trace
}
```

`inputs.brandColorSource` and `resolutionTrace.brandColorSource` MUST always agree. The duplication exists because `inputs` is the read-side surface for the frontend (no trace unpacking needed) and `resolutionTrace` is the audit-side surface.

---

## Firestore schema delta

```text
generations/{genId}
├── inputs
│   ├── brandColorPrimary?: string             (already exists; unchanged)
│   ├── brandColorSecondary?: string           (already exists; unchanged)
│   └── brandColorSource?: BrandColorSource    NEW
└── resolutionTrace
    ├── brandColorSource?: BrandColorSource          NEW
    └── brandColorCompliance?: BrandColorComplianceEntry[]    NEW
```

No new collections, no new indexes (per-asset compliance is read with the parent generation document in a single fetch).

---

## Resolver function signature — `functions/src/brandColorResolver.ts`

```ts
export interface ResolveBrandColorsInput {
    formPrimary?: string;       // raw form-input strings, may be empty/whitespace/malformed
    formSecondary?: string;
    avatar?: { brandColorPrimary?: string; brandColorSecondary?: string } | null;
    sourceColdAd?: { brandColorPrimary?: string; brandColorSecondary?: string } | null;  // for retargeting/remix; null for cold/single/carousel/batch and magic edit
    workspace?: { brandColorPrimary?: string; brandColorSecondary?: string } | null;
}

export function resolveBrandColors(input: ResolveBrandColorsInput): BrandColorPair;
```

Algorithm (single pure function, no I/O) — **independent per-slot precedence**:

1. Normalize and validate each source's primary and secondary hex strings (trim whitespace, match `/^#[0-9A-Fa-f]{6}$/`, lowercase the body to `#rrggbb`; anything that fails becomes `null`).
2. Resolve `primary` by scanning the four sources in precedence order `form` → `avatar` → `sourceColdAd` → `workspace`. Pick the first source whose primary is non-null.
3. **Independently** resolve `secondary` by scanning the same four sources in the same precedence order. Pick the first source whose secondary is non-null. This may be a *different* source than the one that supplied the primary — a higher-precedence source supplying only a primary does NOT block a lower-precedence source's secondary from being inherited (and vice versa).
4. If no source had a valid primary → return `{ primary: null, secondary: null, ctaTextColor: null, source: 'none' }` (regardless of any source's secondary).
5. Compute `ctaTextColor` from the resolved primary's WCAG relative luminance (Decision 3).
6. Set `BrandColorPair.source` to the precedence label of the source that supplied the **primary**. The secondary's source is intentionally not surfaced — auditors who need that detail read the trace plus the input snapshot.

Determinism: the function is referentially transparent. Same inputs → same outputs. No `Date.now`, no random, no I/O.

---

## Compliance-check function signature — `functions/src/brandColorCompliance.ts`

```ts
export async function checkBrandColorCompliance(
    imageBuffer: Buffer,
    brandPrimary: string | null,
    assetId: string,
): Promise<BrandColorComplianceEntry>;
```

Algorithm:

1. If `brandPrimary` is null / empty / not a `#RRGGBB` hex → return `{ assetId, checkRan: false, present: false, deltaE: null, dominantSwatch: null, deductedScore: 0, skippedReason: 'no_brand_colors' }`.
2. Try to load the image via `sharp(imageBuffer).resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer()` (alpha is removed before raw decode so the 1024-pixel buffer is exactly 3 bytes per pixel). On any error → return `{ assetId, checkRan: false, ..., skippedReason: 'image_unanalyzable' }`.
3. Run 5-color k-means on the 1024 RGB pixels with **deterministic pixel-index seeding**: initial cluster centers are taken from pixel indices `floor(i × 1024 / 5)` for `i ∈ {0,1,2,3,4}`. Up to 10 iterations; squared-Euclidean assignment in raw RGB.
4. Convert each cluster center and `brandPrimary` to CIELAB (D65 white point).
5. Compute ΔE-2000 between `brandPrimary`-Lab and each center-Lab. Track the minimum and the closest center.
6. **Per-pixel fallback**: if no center is within `DELTA_E_THRESHOLD` (15), iterate raw pixels (deduplicated via 5-bit-per-channel buckets so we evaluate at most a few hundred unique colors per ad). For each unique pixel, compute ΔE-2000 against `brandPrimary`-Lab; if any pixel is `< 15` set `present = true` and break. This catches small accents (CTA pills, logo glyphs) that get absorbed into a larger centroid.
7. `present = (minDeltaE < DELTA_E_THRESHOLD) || any-pixel-within-threshold`.
8. Return `{ assetId, checkRan: true, present, deltaE: rounded-min, dominantSwatch: rgbToHex(closest pixel-or-center), deductedScore: present ? 0 : 10 }`.

The function is `async` only because Sharp's pipeline is. The k-means, color-space conversion, and ΔE math are sync. Sharp itself is loaded lazily via a typed `getSharp()` factory (matches `logoComposite.ts`/`reflowOutpaint.ts`); if Sharp is unavailable the function returns the `image_unanalyzable` skip entry rather than throwing.

---

## Compositor parameter extensions — `functions/src/textCompositing.ts`

Both exports gain an optional final parameter `brand`. When `brand` is undefined (or any field is null), the compositor falls back to the existing behavior driven by `TextStyle` (FR-008).

```ts
export async function compositeArabicText(
    imageBase64: string,
    hookText: string,
    textZone: TextZone,
    textStyle: TextStyle,
    canvasWidth: number,
    canvasHeight: number,
    brand?: BrandColorPair,             // NEW — when set, override defaults
): Promise<string | null>;

export async function compositeFullAdText(
    // ... existing parameters ...
    brand?: BrandColorPair,             // NEW
): Promise<string | null>;
```

Override rules when `brand` is supplied:
- Headline accent (the headline text color the function would have read from `textStyle.color`): replaced by `brand.secondary` when non-null; otherwise unchanged.
- CTA pill background (the function's CTA `backgroundTreatmentColor`): replaced by `brand.primary` when non-null; otherwise unchanged.
- CTA text color (the function's CTA text color): replaced by `brand.ctaTextColor` when non-null; otherwise unchanged.
- The existing Arabic uniformity contract in `generators.ts` continues to apply on top — no partial coloring of Arabic text, etc. The `brand` parameter only sets the *uniform* color of the headline; the function never paints individual glyphs differently.

---

## Trace-builder additions — `functions/src/resolutionTrace.ts`

Two new methods on `TraceBuilder` (analogous to existing `setLogoPipeline`, `addReflowHistoryEntry`):

```ts
export interface TraceBuilder {
    // ... existing methods unchanged ...
    setBrandColorSource(source: BrandColorSource): TraceBuilder;
    addBrandColorComplianceEntry(entry: BrandColorComplianceEntry): TraceBuilder;
}
```

`build()` writes both onto `ResolutionTrace.brandColorSource` and `ResolutionTrace.brandColorCompliance` if either was called at least once during construction.

---

## Frontend type mirror — `src/types.ts`

```ts
export type BrandColorSource =
    | 'form' | 'avatar' | 'inherited' | 'workspace' | 'none';
```

Mirrored only because the frontend's "Using workspace colors" label needs to reason about source identity. The full `BrandColorPair`, `BrandColorComplianceEntry`, and resolver function stay backend-only — the frontend never re-resolves; it always sends raw form values and lets the backend resolve.

---

## What this feature does NOT change

- The existing `colorPalette` field that build plans extract from the model output (used today by `compositeArabicText` via `TextStyle`) is unchanged. Brand-color override layers on top; it does not replace the AI palette for assets that have no brand colors.
- `mockupHistory`, `creativeMemory`, `savedProjects` and any existing index on `generations` remain untouched.
- No changes to `firestore.rules` (the new fields live on already-readable subtrees).
- No changes to `functions/src/index.ts` (no new callable; the resolver and compliance check are invoked from inside existing entry points).
