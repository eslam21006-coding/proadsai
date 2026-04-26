# Contract: `textCompositing` brand-color parameter extension

**Module**: `functions/src/textCompositing.ts`
**Functions extended**: `compositeArabicText()`, `compositeFullAdText()`
**Spec FRs satisfied**: FR-006, FR-007, FR-008

## Signature delta

```ts
// BEFORE
export async function compositeArabicText(
    imageBase64: string,
    hookText: string,
    textZone: TextZone,
    textStyle: TextStyle,
    canvasWidth: number,
    canvasHeight: number,
): Promise<string | null>;

// AFTER
export async function compositeArabicText(
    imageBase64: string,
    hookText: string,
    textZone: TextZone,
    textStyle: TextStyle,
    canvasWidth: number,
    canvasHeight: number,
    brand?: BrandColorPair,    // NEW — optional final argument
): Promise<string | null>;
```

`compositeFullAdText` follows the same pattern: append `brand?: BrandColorPair` as the new final argument.

Backwards compatibility: existing call sites that do not pass `brand` continue to work; the function falls back to `textStyle`-driven colors exactly as today (FR-008).

## Override rules

When `brand` is supplied AND the relevant field is non-null, the function uses brand-derived colors *instead of* the values from `textStyle`. Otherwise the existing `textStyle` value is used.

All three override decisions are funnelled through three small exported helpers in `textCompositing.ts` so the test suite calls the exact same code path as the compositor: `pickHeadlineColor(textStyle, brand)`, `pickCtaBgColor(textStyle, brand)`, `pickCtaTextColor(textStyle, brand)`.

| Surface | Helper | Brand-set value | Fallback (brand absent or field null) |
|---|---|---|---|
| Headline text color | `pickHeadlineColor` | `brand.secondary` | `textStyle.color` |
| CTA pill background | `pickCtaBgColor` | `brand.primary` | `textStyle.backgroundTreatmentColor`, then `'#C8942A'` if even that is empty |
| CTA text color | `pickCtaTextColor` | `brand.ctaTextColor` | WCAG-luminance auto-contrast against the resolved CTA bg (white if L < 0.5, else `#1A1A1A`) |
| Stroke / shadow / weight | (no helper) | unchanged — never overridden by brand | `textStyle.strokeColor`, `textStyle.shadowColor`, etc. |
| Background treatment style (none/pill/gradient) | (no helper) | unchanged | `textStyle.backgroundTreatment` |

## Hard guarantees that the override does NOT break

1. **Arabic uniformity**: the existing Arabic-rendering rule "NEVER partially color Arabic text" (`generators.ts:5151`) is preserved. The brand override only sets the *uniform* headline color; it does not paint individual glyphs.
2. **Layout integrity**: zone position, size, and alignment come from `textZone` and are never affected by `brand`.
3. **Contrast**: when `brand.primary` is the CTA background, `brand.ctaTextColor` is the WCAG-luminance-correct contrasting color (white or `#1A1A1A`), so the CTA never becomes unreadable. This is the spec's resolution to clarification Q5.
4. **Fallback symmetry**: every override field is independently optional. A user with only a brand primary still gets a branded CTA but an unchanged headline color. A user with only a brand secondary still gets a branded headline accent but an unchanged CTA.

## Caller-side change in `generators.ts`

Today `generators.ts` calls the compositors at multiple sites (single, carousel slides, batch items, retargeting, magic edit). At each call site:

```ts
// BEFORE
await compositeArabicText(imageBase64, hookText, zone, style, w, h);

// AFTER
await compositeArabicText(imageBase64, hookText, zone, style, w, h, resolvedBrand);
```

`resolvedBrand` is the `BrandColorPair` returned by the single per-generation `resolveBrandColors()` call (see [brandColorResolver.md](./brandColorResolver.md)). It is the *same* pair threaded into the prompt and into the trace, so the prompt, the rendered pixels, and the compositor stay in agreement.

## Test fixtures (subset; exhaustive set lives in `contractFixtures.test.ts`)

Reference IDs:

- `COMP-01-no-brand-fallback` — call without `brand` → output identical to today's behavior (golden image diff).
- `COMP-02-brand-primary-only` — `brand: { primary: '#0A66C2', secondary: null, ctaTextColor: '#FFFFFF', source: 'form' }` → CTA pill is `#0A66C2`, CTA text is white, headline color unchanged from `textStyle.color`.
- `COMP-03-brand-secondary-only` — `brand: { primary: null, secondary: '#F59E0B', ctaTextColor: null, source: 'form' }` → headline is `#F59E0B`, CTA unchanged from `textStyle`.
- `COMP-04-brand-both` — both set → CTA pill and text branded, headline branded, all stroke/shadow/layout unchanged.
- `COMP-05-arabic-uniformity` — Arabic hook with brand secondary → headline rendered in `brand.secondary` *uniformly*, no per-glyph variation, no LTR-style partial coloring.
- `COMP-06-light-primary-cta-text-near-black` — `brand.primary: '#FFD700'`, `brand.ctaTextColor: '#1A1A1A'` → CTA text rendered in near-black (legible against gold).

## What this contract does NOT change

- The compositor's image-decoding, font-loading, RTL handling, and Sharp pipeline are unchanged.
- `TextStyle` and `TextZone` are not extended — the brand override happens at parameter level, not by mutating the style object.
- The only new exports are the three pure decision helpers (`pickHeadlineColor`, `pickCtaBgColor`, `pickCtaTextColor`) called out above; these exist so the test suite can exercise the same code path the compositor runs internally. No other helpers, no module-level state, no new public surface.
