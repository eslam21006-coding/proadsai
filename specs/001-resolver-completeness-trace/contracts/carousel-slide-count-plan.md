# Contract: carouselSlideCountPlan

**Feature**: 001-resolver-completeness-trace
**Location**: `functions/src/creativeResolver.ts`

## Signature

```
carouselSlideCountPlan(campaignType: 'cold' | 'retargeting', slideCount: number): SlideRole[]
```

## Input

- `campaignType`: 'cold' or 'retargeting'
- `slideCount`: 2–9 (throws on out of range)

## Output

Array of `SlideRole` objects, one per slide:
```
{ slide: number, role: 'hook'|'middle'|'close', angle: string, hasCTA: boolean, photoInjection: boolean }
```

## Cold Angle Pool (7 angles)

```
A = Direct value / transformation benefit
B = Curiosity / open loop
C = Social proof / real result
D = Problem agitation / cost of status quo
E = Mechanism / how it works
F = Objection pre-emption
G = Identity / who this is for
```

## Retargeting Angle Pool (7 angles)

```
P = Proof (testimonials, results, data)
M = Mechanism (how/why it works)
R = Risk reversal (guarantee, ease)
I = Identity shift (people like you)
C = Cost of inaction (pain of NOT acting)
Q = Question reframe (replace skeptical question)
E = Evidence comparison (tried vs this)
```

## Rules

- Slide 1: always `role: 'hook'`, `hasCTA: true`, `photoInjection: true`
- Last slide: always `role: 'close'`, `hasCTA: true`, `photoInjection: false`
- Middle slides: `role: 'middle'`, `hasCTA: false`, `photoInjection: false`
- Middle angles assigned sequentially from pool (A→B→C... or P→M→R...)
- No two adjacent middle slides share the same angle
- Throws on `slideCount < 2` or `slideCount > 9`
