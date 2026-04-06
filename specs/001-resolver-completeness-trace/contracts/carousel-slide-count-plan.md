# Contract: Carousel Slide Plan Engine

**Feature**: 001-resolver-completeness-trace
**Location**: `functions/src/slidePlanEngine.ts` (new file)

## Function Signature

```typescript
interface SlidePlanOptions {
  valueStackGiftCount?: number;    // For value_stack auto-adjustment
  testimonialCount?: number;       // For testimonial auto-adjustment
  objectionId?: string;            // For retargeting slide 1 framing
}

function buildSlidePlan(
  campaignType: 'cold' | 'retargeting',
  slideCount: number,
  options?: SlidePlanOptions
): SlidePlan;

// Value stack auto-adjustment
function resolveValueStackSlideCount(
  giftCount: number,
  userSelectedCount: number
): { resolvedCount: number; wasOverridden: boolean; reason?: string };
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
| 2..N-1 | middle | false | A, B, C, D, E, F, G (in order, first N-2) | false |
| N | close | true | `'close'` | false |

**Cold angles**: A=Direct value, B=Curiosity, C=Social proof, D=Problem agitation, E=Mechanism, F=Objection pre-emption, G=Identity

## Retargeting Carousel Rules

| Slide | Role | CTA | Angle | Photo Injection |
|-------|------|-----|-------|-----------------|
| 1 | hook | true | `'objection_hook'` | true (Box A) |
| 2..N-1 | middle | false | P, M, R, I, C, Q, E (in order, first N-2) | false |
| N | close | true | `'close'` | false |

**Retargeting angles**: P=Proof, M=Mechanism, R=Risk reversal, I=Identity shift, C=Cost of inaction, Q=Question reframe, E=Evidence comparison

## Value Stack Auto-Adjustment

```
resolvedSlideCount = min(giftCount + 2, 9)
```

- If `giftCount + 2 > 9`: cap at 9, last gift and close merged on final slide
- If `resolvedSlideCount !== userSelectedCount`: `wasOverridden = true`
- User notification: `"Carousel adjusted to {N} slides — one gift per slide."`

## Invariants

- Pure function: same inputs → same output (deterministic)
- `slideCount` must be 2–9 (throw if outside range)
- CTA on slide 1 and last slide only — never on middle slides
- No two adjacent middle slides share the same angle (guaranteed by sequential assignment)
- `photoInjection` is `true` only for slide 1
