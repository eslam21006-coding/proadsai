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
| `{ formPrimary: '#0A66C2', formSecondary: '#F59E0B', workspace: { brandColorPrimary: '#000000' } }` | `{ primary: '#0A66C2', secondary: '#F59E0B', ctaTextColor: '#FFFFFF', source: 'form' }` |
| `{ formPrimary: '', avatar: { brandColorPrimary: '#FF0000', brandColorSecondary: '#00FF00' }, workspace: { brandColorPrimary: '#000000' } }` | `{ primary: '#FF0000', secondary: '#00FF00', ctaTextColor: '#FFFFFF', source: 'avatar' }` |
| `{ sourceColdAd: { brandColorPrimary: '#0A66C2', brandColorSecondary: '#F59E0B' }, workspace: { brandColorPrimary: '#999999' } }` | `{ primary: '#0A66C2', secondary: '#F59E0B', ctaTextColor: '#FFFFFF', source: 'inherited' }` |
| `{ workspace: { brandColorPrimary: '#0A66C2' } }` | `{ primary: '#0A66C2', secondary: null, ctaTextColor: '#FFFFFF', source: 'workspace' }` |
| `{}` | `{ primary: null, secondary: null, ctaTextColor: null, source: 'none' }` |
| `{ formPrimary: '   ', formSecondary: 'not-a-hex', workspace: { brandColorPrimary: '#0A66C2' } }` | `{ primary: '#0A66C2', secondary: null, ctaTextColor: '#FFFFFF', source: 'workspace' }` (form values are invalid → fall through) |
| `{ formPrimary: '#FFD700' }` (light primary) | `{ primary: '#FFD700', secondary: null, ctaTextColor: '#1A1A1A', source: 'form' }` |
| `{ formPrimary: '#0A66C2', avatar: { brandColorPrimary: '#FF0000' } }` (form wins; avatar's secondary IGNORED even if present) | `{ primary: '#0A66C2', secondary: null, ctaTextColor: '#FFFFFF', source: 'form' }` |
| `{ formPrimary: '#888888' }` (mid-luminance edge case from spec edge case bullet) | `ctaTextColor === '#1A1A1A'` (deterministic at L = 0.5: ≥-clause picks near-black) |

## Validation rules

1. **Hex normalization**: input strings are trimmed, then matched against `/^#[0-9A-Fa-f]{6}$/`. The output is normalized to `#RRGGBB` with the leading `#` plus 6 lowercase hex digits.
2. **Atomicity**: when source X supplies the primary, source X also supplies the secondary (or null if X has no valid secondary). Sources are not mixed. This is the spec's "the others are ignored" rule (FR-005, Key Entities).
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
- `BCR-10-cta-text-luminance-boundary` — primary that yields exactly L = 0.5 → `ctaTextColor: '#1A1A1A'` (≥-clause).
- `BCR-11-avatar-secondary-ignored-when-form-wins` — form has primary only, avatar has primary+secondary → resolved secondary is `null`, NOT the avatar's secondary (atomicity rule).

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
