# Contract: Carousel Angle Rotation (23.C)

**Feature**: 959-copy-structure-variation
**Surfaces**: `functions/src/generators.ts` (`generateCarouselAngles` ~L7068-7296), `functions/src/slidePlanEngine.ts` (`buildSlidePlan`), `functions/src/copyDiversity.ts` (NEW rotation helper).
**Lockstep files (FR-022)**: this contract + `specs/001-resolver-completeness-trace/contracts/carousel-slide-count-plan.md` + the carousel section of `specs/_shared/COPY_SYSTEM_REFERENCE.md` MUST change together in this PR. See research.md D11 for the "Section 5.A" reconciliation.

## Part A — Story-direction picker (4-of-7)

```typescript
function rotateCarouselAngles(
  campaignType: 'cold' | 'retargeting',
  seed: string,
  memory: DiversityFingerprint[]
): string[];   // length 4, drawn from the 7-angle pool, rotated + memory-biased
```

| # | Rule | FR |
|---|---|---|
| A1 | Pool = existing spec-001 sets: cold `[A,B,C,D,E,F,G]`, retargeting `[P,M,R,I,C,Q,E]` (7 each). No new taxonomy. | FR-019 (clarified) |
| A2 | Draw 4-of-7, rotated + memory-biased per project; NOT always the first-4 families. | FR-019, SC-006 |
| A3 | Feeds the 4 `ANGLE_START_A..D` blocks in `generateCarouselAngles` (replaces the hardcoded first-4 families). | FR-019 |
| A4 | Memory bias = down-weight recent `storyDirectionFamilies`; never ban. | FR-017 |

## Part B — Middle-slide angle rotation

`buildSlidePlan` middle assignment changes from `pool[i % pool.length]` to `pool[(i + offset) % pool.length]`, `offset` from the per-project seed. **`buildSlidePlan` is wired into the live carousel path** (currently exported but unused).

| # | Invariant (re-verified after rotation) | FR |
|---|---|---|
| B1 | Middle-slide angle ORDER varies per project (rotated), not fixed A→B→C→D→E. | FR-020, SC-006 |
| B2 | No two adjacent middle slides share an angle (distinct sequential picks from the rotated pool). | FR-021, SC-007 |
| B3 | CTA on slide 1 and last slide ONLY. | FR-021, SC-007 |
| B4 | Photo injection on slide 1 ONLY. | FR-021, SC-007 |
| B5 | `slideCount` 2–9 (throws otherwise); short carousels with few/no middle slides still satisfy B2–B4. | Edge case |
| B6 | Deterministic: `(campaignType, slideCount, seed)` → identical plan. | Principle VI |

## Contract-sync checklist (FR-022)

- [ ] `slidePlanEngine.ts` rotation + wiring updated
- [ ] `generators.ts` `generateCarouselAngles` uses `rotateCarouselAngles`
- [ ] `specs/001-.../contracts/carousel-slide-count-plan.md` updated to describe rotated (offset) middle-slide assignment while keeping all invariants
- [ ] `COPY_SYSTEM_REFERENCE.md` carousel section / "Section 5.A" reconciled (D11)
- [ ] `slidePlanRotation.test.ts` asserts B1–B6 across multiple seeds

## Acceptance

- US3 scenarios 1–5; SC-006, SC-007.
