# Data Model — Phase 17 Resize & Reflow (Regenerated 2026-05-29)

All changes are **additive** to existing Firestore documents. No migrations required. Reflects the finalized spec's ratio-only chip key and unified cost model.

## Generation document (existing — `generations/{genId}`)

Existing fields used by reflow (read-only on reflow path):

```ts
{
  userId: string;                       // owner / credit owner via resolveCreditOwner
  metadata: { aspectRatio: AspectRatio }; // source ratio — authoritative for FR-021 no-op check
  output: {
    imageUrl?: string;                  // ALWAYS the source for resize per FR-018 — no fallback
    buildPlan?: string;                 // saved build plan — required by re-render route
    batchResults?: Array<{
      url?: string;
      buildPlan?: string;
    }>;
    carouselSlides?: Array<{
      imageUrl?: string;
      buildPlan?: string;
    }>;
  };
  inputs: {                             // original generation inputs (read for FR-010 brand colors)
    brandColorPrimary?: string;         // hex, set in Phase 15
    brandColorSecondary?: string;
    // ...other AdInputs fields
  };
  mockupHistory?: Array<{               // legacy chip log — preserved for back-compat reads
    url: string;
    ratio: AspectRatio;
  }>;
}
```

### Phase 17 additions

```ts
{
  // NEW — user-facing variant chip index (FR-017, FR-017a)
  // Upper bound: 6 entries (one per supported ratio — key-space exhaustion)
  variantChips?: VariantChip[];

  resolutionTrace?: {
    reflowHistory?: ReflowHistoryEntry[];  // existing (HOTFIX-F)
    // NEW rollup flags (FR-020) — true if any prior reflow set them
    textReflowOverflow?: boolean;          // any 10% font-size reduction was applied
    brandColorReinforced?: boolean;        // BRAND COLOR LOCK block was injected
  };
}
```

### `VariantChip` (new — ratio-only key)

```ts
interface VariantChip {
  ratio: AspectRatio;                  // chip key — one of the 6 supported ratios
  url: string;                         // final composed image (text + logos + offer overlay applied)
  cleanReflowedImageUrl?: string;      // FR-011 — pre-text image, only set when produced by re-render route
  generatedAt: number;                 // epoch ms — last write wins on same-ratio collision
}
```

**No `method` field.** The backend-selected route is recorded in `ReflowHistoryEntry.method` (internal diagnostic), but it is NOT part of chip identity (per FR-017a). Two consecutive resizes to the same ratio overwrite the chip regardless of which route produced them.

#### Invariants

1. **`ratio` is the chip key.** Upserting a chip with an existing ratio MUST overwrite the prior chip (latest-wins). FR-017a.
2. **Deterministic upper bound**: `variantChips.length ≤ 6` for every generation. Enforced by ratio key-space.
3. **No duplicate ratios at rest.** Append-without-dedup is a data-quality defect.
4. **`cleanReflowedImageUrl` is optional.** Set when the backend re-render route ran (it produces a separable pre-text image); absent when the outpaint route ran (the locked-region output already contains the original text).
5. **Slide-scope resizes do not write a chip on the parent generation.** The resized slide URL is written to `output.carouselSlides[slideIndex].imageUrl` directly. Chips track whole-output ratio variants, not per-slide variants. Per-slide resizes still record an entry in `reflowHistory` for audit.

#### Upsert algorithm (canonical write path)

```text
TRANSACTION on generations/{genId}:
  let existing = doc.variantChips ?? []
  let filtered = existing.filter(c => c.ratio !== newRatio)
  let next = [...filtered, newChip]
  assert next.length ≤ 6  // soft guarantee from key-space size
  doc.variantChips = next
```

Runs inside the same Firestore transaction as the credit deduction in `reflowImage.ts:deductAndPersist()` so a partial commit can never leave a chip without its credit charge (or vice versa).

### `ReflowHistoryEntry` (existing — extended)

```ts
interface ReflowHistoryEntry {
  // EXISTING (HOTFIX-F):
  timestamp: number;
  sourceRatio: AspectRatio;
  targetRatio: AspectRatio;
  magnitude: number;
  method: 'outpaint' | 'rerender';     // INTERNAL DIAGNOSTIC — not user-facing (FR-011, FR-020)
  userOverride: 'outpaint' | 'rerender' | null;  // populated only for fixture/internal calls
  fallbackFrom: 'outpaint' | 'rerender' | null;
  fallbackReason: 'drift' | 'engine_error' | 'no_plan' | null;
  itemIndex: number | null;
  outputUrl: string;
  creditsCharged: number;              // 0 (failure / no-op) or 5 (success — flat per R-001)

  // NEW (Phase 17):
  brandColorReinforced?: boolean;      // FR-010/FR-020 — true if re-render prompt included BRAND COLOR LOCK
  textReflowOverflow?: boolean;        // FR-012/FR-020 — true if any 10% reduction was applied
  textReductionSteps?: 0 | 1 | 2 | 3;  // FR-012 — exact count of reductions (0..3)
}
```

ResolutionTrace top-level rollup flags (`textReflowOverflow`, `brandColorReinforced`) are denormalized from the per-entry flags — `true` if *any* entry in `reflowHistory` has the flag set. Both forms are written so that:

- Top-level rollup = fast "did any reflow trigger this?" query without scanning the array (FR-020 diagnostic surfaces).
- Per-entry flag = audit-grade evidence trail (Constitution Principle VI — auditability).

---

## SafeZoneInsetsPct (in-memory; pure function output)

Not persisted. Exposed by the new `getSafeZoneForRatio()` helper in `functions/src/layoutContract.ts`.

```ts
interface SafeZoneInsetsPct {
  top: number;       // percentage of canvas height
  right: number;     // percentage of canvas width
  bottom: number;    // percentage of canvas height
  left: number;      // percentage of canvas width
}
```

Authoritative table (verbatim from spec FR-013 / R-002):

| ratio | top | right | bottom | left |
|---|---|---|---|---|
| 1:1 | 8 | 8 | 8 | 8 |
| 4:5 | 10 | 8 | 10 | 8 |
| 3:4 | 12 | 8 | 12 | 8 |
| 4:3 | 8 | 12 | 8 | 12 |
| 9:16 | 14 | 8 | 14 | 8 |
| 16:9 | 8 | 14 | 8 | 14 |

Consumed only by `textCompositing.ts` (and unit tests). The legacy pixel-based `safeZoneInset` field on `AspectRatioRules` (`layoutContract.ts:151-224`) is **not** modified — it remains the single source of truth for the render-prompt block consumed by the 9 generation callables (see research R-002).

---

## Read-side semantics: how Step 4 displays variants

For any generation rendered in Step 4:

1. Backend returns `output.imageUrl` (or `carouselSlides` / `batchResults`) **plus** `variantChips` (Phase 17).
2. Frontend renders the *current* image. Default = `output.imageUrl` (the original). If the user has clicked a variant chip, the displayed image is `variantChips[i].url`.
3. The chip row shows one chip per entry in `variantChips`, labeled with the ratio only (e.g., "9:16", "4:5"). The original ratio (`metadata.aspectRatio`) is also represented as the leftmost chip, mapping to `output.imageUrl`. Active chip is visually highlighted.
4. Clicking the Resize button opens the size picker showing all 6 ratios with the original generation's ratio (`metadata.aspectRatio`) hidden / marked as Current (FR-021).
5. Clicking a target ratio in the picker:
   - If `targetRatio === metadata.aspectRatio`: short-circuit no-op (FR-021 — no preview, no callable, no charge).
   - Otherwise: open the CSS preview → Generate Resize button (FR-003 → FR-005) → on confirm, fire `reflowImage` callable with `scope`, `targetAspectRatio`, and `method: 'auto'` (the only public value).
6. On success, the new chip is rendered in the chip row (replacing any prior chip at the same ratio). User clicks to switch the displayed image.

---

## Source-image semantics (FR-018 — original is always the source)

- The reflow callable always uses `genData.output.imageUrl` as the source. No fallback to `mockupHistory[last].url`.
- For batch/carousel scope, the source is the corresponding `output.batchResults[i].url` / `output.carouselSlides[i].imageUrl` of the original generation — not any prior reflowed variant of that batch item / slide.
- Legacy generations missing `output.imageUrl`: the callable rejects with `failed-precondition: 'legacy_no_original'`. Chaining was never supported and is not retro-enabled.

---

## Migration

**None required.** All additions are optional fields on existing documents:

- Generations created before Phase 17 have no `variantChips` field → read-side falls back to `mockupHistory` (for variant display) or just shows the original.
- Generations without `resolutionTrace.textReflowOverflow` / `.brandColorReinforced` → diagnostic surfaces treat absence as `false`.
- Legacy generations without `output.imageUrl` cannot be resized (FR-018 + invariant above) — they receive an explicit `failed-precondition` error.

The first Phase-17 reflow on an existing generation creates `variantChips` lazily and writes only the new chip (no back-fill).
