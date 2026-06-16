# Contract: Carousel Slide Plan Engine

**Feature**: 001-resolver-completeness-trace
**Location**: `functions/src/slidePlanEngine.ts` (new file)
**Updated by**: Phase 23 (959-copy-structure-variation, FR-022) — middle-slide
angle assignment is now rotated per-project instead of fixed lockstep.
**Lockstep files (FR-022)**: this contract + `generators.ts` +
`specs/_shared/COPY_SYSTEM_REFERENCE.md` Section 17 (and the
"Section 5.A" reference) MUST change together in this PR.

## Function Signature

```typescript
interface SlidePlanOptions {
  valueStackGiftCount?: number;    // For value_stack auto-adjustment
  objectionId?: string;            // For retargeting slide 1 framing
}

function buildSlidePlan(
  campaignType: 'cold' | 'retargeting',
  slideCount: number,
  seed?: string,                   // Phase 23 — optional per-project rotation seed (string; the runtime helper hashes it to a number for modular indexing)
  options?: SlidePlanOptions
): SlidePlan;

// Value stack auto-adjustment
function resolveValueStackSlideCount(
  giftCount: number,
  userSelectedCount: number
): ValueStackAdjustment;

interface ValueStackAdjustment {
  giftCount: number;
  originalSlideCount: number;
  resolvedSlideCount: number;
  capped: boolean;              // true when giftCount + 2 > 9
}
```

## Slide Plan Output

```typescript
interface SlideEntry {
  slide: number;          // 1-based
  role: 'hook' | 'middle' | 'close';
  hasCTA: boolean;
  narrativeAngle: string;
  photoInjection: boolean;
  testimonialPlatform?: string;
}

type SlidePlan = SlideEntry[];
```

## Cold Carousel Rules

| Slide | Role | CTA | Angle | Photo Injection |
|-------|------|-----|-------|-----------------|
| 1 | hook | true | `'hook'` | true (Box A) |
| 2..N-1 | middle | false | `pool[(i + offset) % pool.length]` (Phase 23 rotated) | false |
| N | close | true | `'close'` | false |

**Cold angles pool**: A=Direct value, B=Curiosity, C=Social proof, D=Problem agitation, E=Mechanism, F=Objection pre-emption, G=Identity

**Phase 23 — middle-slide rotation**: When `seed` is supplied, `offset = (seed mod pool.length)`
rotates the pool so the assignment is `pool[(i + offset) % pool.length]` instead of the
old fixed `pool[i % pool.length]` lockstep. `offset` is derived deterministically
from the per-project seed (`userId + projectId + day`); with a fixed seed,
the plan is fully deterministic (Principle VI). When `seed` is omitted,
behavior is identical to the pre-Phase-23 lockstep (backwards compatible).

## Retargeting Carousel Rules

| Slide | Role | CTA | Angle | Photo Injection |
|-------|------|-----|-------|-----------------|
| 1 | hook | true | `'objection_hook'` | true (Box A) |
| 2..N-1 | middle | false | `pool[(i + offset) % pool.length]` (Phase 23 rotated) | false |
| N | close | true | `'close'` | false |

**Retargeting angles pool**: P=Proof, M=Mechanism, R=Risk reversal, I=Identity shift, C=Cost of inaction, Q=Question reframe, E=Evidence comparison

**Phase 23 — middle-slide rotation**: Same offset mechanic as cold.

## Value Stack Auto-Adjustment

```text
resolvedSlideCount = min(giftCount + 2, 9)
```

- If `giftCount + 2 > 9`: cap at 9, last gift and close merged on final slide
- If `resolvedSlideCount !== userSelectedCount`: `wasOverridden = true`
- User notification: `"Carousel adjusted to {N} slides — one gift per slide."`

## Invariants (re-verified post-rotation, unchanged from pre-Phase-23)

- Pure function: same `(campaignType, slideCount, seed)` → same plan
  (deterministic; the offset is derived from the seed, not from time)
- `slideCount` must be 2–9 (throw if outside range)
- CTA on slide 1 and last slide only — never on middle slides (FR-021, B3)
- **No two adjacent middle slides share the same angle** (FR-021, B2) —
  guaranteed by sequential distinct picks from the rotated 7-element pool
  (distinct pool entries in order, then wrap via modulo; no two consecutive
  `i` values map to the same `(i + offset) % 7`).
- `photoInjection` is `true` only for slide 1 (FR-021, B4)
- Short carousels (2–3 slides, 0–1 middle) still satisfy all invariants
  trivially (B5)

## Phase 23 — Why the rotation

Pre-Phase-23, every project with `slideCount=5` got the SAME middle-slide
sequence A→B→C→D, so the middle slides always repeated across projects.
Phase 23 rotates this with a per-project seed so the order varies
across projects while the contract's invariants (no adjacent repeat,
CTA slide 1 + last only, photo slide 1 only) are preserved.

