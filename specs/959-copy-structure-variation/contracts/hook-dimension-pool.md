# Contract: Hook Dimension Pool + Opening Rotation (23.B)

**Feature**: 959-copy-structure-variation
**Surfaces**: `functions/src/knowledge/hookAnglesKnowledge.ts` (pool shape + `getAngleVariationBlueprint`), `functions/src/copyDiversity.ts` (NEW — pure drawers), `functions/src/generators.ts` (call-sites ~L2053 and ~L2284-2291).

## Functions (pure, deterministic)

```typescript
// copyDiversity.ts
function drawDimensions(
  angleId: string,
  count: number,                 // = 4
  seed: string,                  // per-project rotation seed
  memory: DiversityFingerprint[] // recent ~10 for this angle/user
): DimensionEntry[];             // length === count, distinct ids

function rotateOpenings(
  seed: string,
  count: number,                 // = 4
  memory: DiversityFingerprint[]
): OpeningStructure[];           // length === count, distinct ids
```

## Invariants

| # | Rule | FR |
|---|---|---|
| H1 | The user's selected angle is NEVER changed. `drawDimensions` only selects WITHIN `ANGLE_DIMENSION_POOLS[angleId]`. | FR-012 |
| H2 | Each angle pool has 6–8 dimensions; the migrated first-4 (Financial/Time/Status/Skill) keep their psychology + Arabic text **verbatim**; added dimensions use the same voice. | FR-013 |
| H3 | `drawDimensions` returns exactly 4 distinct dimensions; across consecutive projects (different seeds) the 4-set varies (not fixed A/B/C/D order). | FR-014, SC-002 |
| H4 | `rotateOpenings` varies the opening-structure subset/order across projects; uses only the 7 existing forms. | FR-015, SC-003 |
| H5 | Memory **biases** (down-weights recent ids); never bans. If all options recent → least-recently-used. Always returns a full set of 4. | FR-016, FR-017, SC-008 |
| H6 | Temperature unchanged (1.0 / 1.2 / 0.6 as today). Diversity comes from draw + rotation + memory only. | FR-018 |
| H7 | Every drawn dimension can still satisfy `ANGLE_HARD_RULES[angleId]` (preserved untouched). | FR-024 |
| H8 | Determinism: `(angleId, count, seed, memory)` → identical output (replayable, testable, traceable). | Principle VI |

## Integration

- `getAngleVariationBlueprint(angleId, inputs, drawn)` renders only the drawn subset into the prompt at `generators.ts:2053` (replaces the static fixed-4 render).
- The opening block at `generators.ts:2284-2291` renders `rotateOpenings(...)` output instead of the static 7-item list.
- The draw result is written to `resolutionTrace.copyDiversity` and recorded as a `DiversityFingerprint`.

## Acceptance

- US2 scenarios 1–6; SC-002, SC-003, SC-005, SC-008.

## Out of scope

- No change to angle lock, `ANGLE_HARD_RULES`, `captionValidator.ts`, or Phase 22 constants; scoring/rewrite stay inert (FR-031).
