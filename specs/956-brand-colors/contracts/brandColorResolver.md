# Contract: `brandColorResolver.resolveBrandColors()`

**Module**: `functions/src/brandColorResolver.ts`
**Type**: Pure function (no I/O, no side effects, deterministic)
**Spec FRs satisfied**: FR-001, FR-003, FR-004, FR-005, FR-009, FR-017, FR-018, FR-021

## Signature

```ts
function resolveBrandColors(input: ResolveBrandColorsInput): BrandColorPair;

interface ResolveBrandColorsInput {
    formPrimary?: string;
    formSecondary?: string;
    avatar?: { brandColorPrimary?: string; brandColorSecondary?: string } | null;
    sourceColdAd?: { brandColorPrimary?: string; brandColorSecondary?: string } | null;
    workspace?: { brandColorPrimary?: string; brandColorSecondary?: string } | null;
}

interface BrandColorPair {
    primary: string | null;
    secondary: string | null;
    ctaTextColor: '#FFFFFF' | '#1A1A1A' | null;
    source: 'form' | 'avatar' | 'inherited' | 'workspace' | 'none';
}
```

## Behavior contract

| Input shape | Expected output |
|---|---|
| `{ formPrimary: '#0A66C2', formSecondary: '#F59E0B', workspace: { brandColorPrimary: '#000000' } }` | `{ primary: '#0a66c2', secondary: '#f59e0b', ctaTextColor: '#FFFFFF', source: 'form' }` |
| `{ formPrimary: '', avatar: { brandColorPrimary: '#FF0000', brandColorSecondary: '#00FF00' }, workspace: { brandColorPrimary: '#000000' } }` | `{ primary: '#ff0000', secondary: '#00ff00', ctaTextColor: '#FFFFFF', source: 'avatar' }` |
| `{ sourceColdAd: { brandColorPrimary: '#0A66C2', brandColorSecondary: '#F59E0B' }, workspace: { brandColorPrimary: '#999999' } }` | `{ primary: '#0a66c2', secondary: '#f59e0b', ctaTextColor: '#FFFFFF', source: 'inherited' }` |
| `{ workspace: { brandColorPrimary: '#0A66C2' } }` | `{ primary: '#0a66c2', secondary: null, ctaTextColor: '#FFFFFF', source: 'workspace' }` |
| `{}` | `{ primary: null, secondary: null, ctaTextColor: null, source: 'none' }` |
| `{ formPrimary: '   ', formSecondary: 'not-a-hex', workspace: { brandColorPrimary: '#0A66C2' } }` | `{ primary: '#0a66c2', secondary: null, ctaTextColor: '#FFFFFF', source: 'workspace' }` (form values are invalid → fall through) |
| `{ formPrimary: '#FFD700' }` (light primary) | `{ primary: '#ffd700', secondary: null, ctaTextColor: '#1A1A1A', source: 'form' }` |
| `{ formPrimary: '#0A66C2', avatar: { brandColorPrimary: '#FF0000', brandColorSecondary: '#00FF00' } }` (form supplies primary only; avatar's secondary inherited independently) | `{ primary: '#0a66c2', secondary: '#00ff00', ctaTextColor: '#FFFFFF', source: 'form' }` |
| `{ formPrimary: '#BCBCBC' }` (mid-luminance boundary case, L ≈ 0.51) | `{ primary: '#bcbcbc', ctaTextColor: '#1A1A1A', source: 'form' }` (≥-clause picks near-black) |

## Validation rules

1. **Hex normalization**: input strings are trimmed, then matched against `/^#[0-9A-Fa-f]{6}$/`. The output is normalized to `#RRGGBB` with the leading `#` plus 6 lowercase hex digits (e.g., `#0a66c2`, never `#0A66C2`).
2. **Independent precedence (primary vs secondary)**: each of the two slots resolves independently against the precedence ladder `form > avatar > inherited > workspace`. The resolver picks the *first* source with a non-null primary, and *separately* picks the first source with a non-null secondary. This means a higher-precedence source supplying only a primary does **not** block a lower-precedence source's secondary from being inherited (and vice versa). The `source` label always reflects where the primary came from. (Pre-Phase 15 the contract was atomic; clarification refinement added during implementation review per the user-directed change.)
3. **Anti-placeholder**: the function never returns a string containing brackets, the substring `brand`, or the substring `placeholder`. The output is hex-only (or null). This is enforced by FR-009 at the *prompt-build* layer; the resolver does its part by never emitting anything but normalized hex.
4. **Determinism**: same input → same output, every call. No `Date.now()`, no `Math.random()`, no module-level mutable state.

## Error contract

The resolver never throws. Any malformed input is treated as an absent value at that source slot, and the next source in precedence is tried. The terminal "nothing valid anywhere" case returns `source: 'none'`, never an exception.

## Test fixtures (subset; exhaustive set lives in `contractFixtures.test.ts`)

Reference IDs that the test file MUST use so the tests are unambiguous:

- `BCR-01-form-wins` — form supplies both, all other sources have valid colors → `source: 'form'`.
- `BCR-02-avatar-wins-over-cold-ad` — form empty, avatar has valid primary, cold ad has different valid primary → `source: 'avatar'`.
- `BCR-03-cold-ad-inherited` — form and avatar both absent, cold ad has primary → `source: 'inherited'`.
- `BCR-04-workspace-fallback` — only workspace has valid colors → `source: 'workspace'`.
- `BCR-05-no-source` — every source empty/invalid → `source: 'none'`, all hex fields null.
- `BCR-06-form-malformed-falls-through` — form primary is `'red'`, workspace is valid → `source: 'workspace'`.
- `BCR-07-form-primary-no-secondary` — form has primary only → `source: 'form'`, `secondary: null`.
- `BCR-08-cta-text-light-primary` — primary `#FFD700` → `ctaTextColor: '#1A1A1A'`.
- `BCR-09-cta-text-dark-primary` — primary `#0A66C2` → `ctaTextColor: '#FFFFFF'`.
- `BCR-10-cta-text-luminance-boundary` — primary `#BCBCBC` (L ≈ 0.51, just past the 0.5 boundary) → `ctaTextColor: '#1A1A1A'` (≥-clause picks near-black).
- `BCR-11-secondary-falls-through-independently` — form has primary only, avatar has primary+secondary → resolved primary is form's, resolved secondary is avatar's, `source` reflects the primary's source (`'form'`).

## Call sites (where the resolver MUST be invoked)

The resolver MUST be called exactly **once** per generation, at submit time, before any prompt-build site touches brand colors:

| Flow | Call site (file:approx-line) | `sourceColdAd` argument |
|---|---|---|
| Single, cold | `generators.ts` (in `generateFinalAd` or sibling, before line 1089's existing block) | `null` |
| Carousel, cold | inside the carousel slide loop entry (currently around `generators.ts:6076-6306`); resolver call hoisted above the loop so every slide threads the same pair | `null` |
| Batch, cold | inside the batch loop entry; resolver call hoisted above the loop so every item threads the same pair | `null` |
| Single, retargeting | retargeting entry around `generators.ts:6336+` | source-cold-ad doc loaded by `retargetingSourceId` |
| Carousel, retargeting | retargeting carousel entry around `generators.ts:6617+` | source-cold-ad doc loaded by `retargetingSourceId` |
| Magic edit | wherever the magic-edit prompt is built | `null` (magic edit has no cold-ad source) |
| Remix | wherever the remix prompt is built | source-asset doc (same role as retargeting cold-ad) |

The resolved `BrandColorPair` and `source` are then:
1. String-interpolated into all prompt blocks (replaces today's per-site `inputs.brandColorPrimary` reads).
2. Threaded into `compositeArabicText()` / `compositeFullAdText()` as the `brand` argument.
3. Recorded onto the generation document as `inputs.brandColorSource` and `resolutionTrace.brandColorSource`.
