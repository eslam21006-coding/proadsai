# Contract: Cross-Project Anti-Repetition Memory (23.B / 23.C)

**Feature**: 959-copy-structure-variation
**Surfaces**: `functions/src/creativeMemory.ts` (record + retrieve), consumed by `functions/src/copyDiversity.ts`.

## Functions

```typescript
// creativeMemory.ts (additive)
async function recordDiversityFingerprint(fp: DiversityFingerprint): Promise<void>;

async function getRecentFingerprints(
  userId: string,
  angle: string,        // locked hook angle (single) OR campaign type (carousel)
  limit?: number        // default ~10
): Promise<DiversityFingerprint[]>;
```

```typescript
interface DiversityFingerprint {
  userId: string;
  angle: string;
  dimensionIds: string[];
  openingIds: string[];
  storyDirectionFamilies?: string[];   // carousel (23.C)
  middleAngleOrder?: string[];         // carousel (23.C)
  createdAt: number | FieldValue;
}
```

## Invariants

| # | Rule | FR |
|---|---|---|
| M1 | Reads are scoped per `userId` + `angle`, ordered by `createdAt desc`, limited to ~10. No cross-user leakage. | FR-016, D7 |
| M2 | Window = the user's most recent ~10 projects per angle; older fingerprints age out (not read) → contribute no bias. | FR-016 (clarified) |
| M3 | Bias **down-weights** recently used ids; it MUST NOT exclude any option. The pool never starves. | FR-017, SC-008 |
| M4 | When all options were used recently → least-recently-used selection; generation always succeeds. | FR-017, SC-008 |
| M5 | First-ever project (zero fingerprints) → rotation-only, no error. | Edge case, SC-008 |
| M6 | Storage is additive (new fields on `CreativeMemoryRecord` or a small companion write); no migration; legacy records lacking these fields are simply skipped. | Technical Context |
| M7 | A fingerprint is recorded after every successful generation (single + carousel). | FR-016 |

## Acceptance

- US2 scenario 4; US3 scenario 1; SC-002, SC-003, SC-006, SC-008.

## Out of scope

- No performance/Meta-insights coupling; this is purely diversity fingerprinting, separate from the existing `performance`/`PatternIndex` machinery.
