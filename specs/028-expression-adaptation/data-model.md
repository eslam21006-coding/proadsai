# Phase 1 Data Model: Expression Adaptation (Phase 28)

This feature is prompt-engineering with one additive trace field. No Firestore schema migration. "Entities" here are in-memory TypeScript shapes plus the additive trace sub-object.

## Type: `ExpressionDirective`

Pure value object produced by the mapper and consumed by the concept-prompt block builder.

| Field | Type | Notes |
|-------|------|-------|
| `source` | `"hook" \| "objection"` | Which input produced this directive. |
| `sourceId` | `string` | The canonical hook-angle id (e.g., `pain`) or retargeting objection id (e.g., `price_too_high`). |
| `emotion` | `string` | Short emotion label (e.g., `"concern, frustration"`). |
| `description` | `string` | Concrete physical description (e.g., `"slight frown, tired eyes, tension in jaw — quiet suffering, not anger"`). |

- **Location**: declared in `functions/src/types.ts` (additive); imported by `expressionMap.ts` and `generators.ts`.
- **Absent state**: the mapper returns `null` (canonical absent sentinel) when no hook angle and no objection apply.

## Mapping table (cold hook angles → directive)

Canonical ids. Frontend `src/constants.ts` `COLD_HOOK_ANGLES` defines what the user can select; the backend runtime authority is `functions/src/knowledge/hookAnglesKnowledge.ts` `HOOK_ANGLE_KNOWLEDGE` (`functions/` does not import the frontend package). The two lists are confirmed identical (10/10 ids). The mapper and its coverage test MUST key off `Object.keys(HOOK_ANGLE_KNOWLEDGE)`. (Emotion / description summarized; full text authored in `expressionMap.ts`.)

| Hook angle id | emotion | source of mapping |
|---------------|---------|-------------------|
| `pain` | concern, frustration | original request |
| `curiosity` | intrigue, thoughtfulness | original request |
| `logic` | analytical clarity | original request |
| `social_proof` | confidence, pride | original request |
| `urgency` | alertness, intensity | original request |
| `emotional` | empathetic, heartfelt (warm vulnerability) | **confirmed default (Clarif. 2026-06-23)** |
| `statistics` | sober, analytical | **confirmed default** |
| `scarcity` | urgent, alert | **confirmed default** |
| `logical_authority` | commanding, assured | **confirmed default** |
| `future_based` | aspirational, hopeful, looking forward | **confirmed default** |

**Defensive aliases** (referenced in `generators.ts` 2323–2334, may appear in older runs): `shocking_stat`→`statistics`; `fear_of_missing_out`→urgent/alert (FOMO); `future_pacing`→`future_based`.

## Mapping table (retargeting objections → directive, by family)

Ids from `functions/src/retargetingObjections.ts` (`RETARGETING_OBJECTION_DATA`).

| Family → emotion | objection ids |
|------------------|---------------|
| analytical & evaluating | `price_too_high`, `no_budget_now`, `need_installments` |
| reassuring & confident | `dont_trust`, `tried_before_failed`, `will_it_work_for_me` |
| urgent & focused | `no_time`, `not_ready_yet` |
| confident & approachable (fallback) | `overwhelmed`, `need_approval`, `dont_want_call`, `dont_need_it`, and any unrecognized id |

## Additive trace field: `ResolutionTrace.expressionAdaptation`

Added to `ResolutionTrace` in `functions/src/generators.ts` (~5135), mirrored in `functions/src/types.ts` and documented in `docs/LAUNCH_MATRIX.md` (~798).

```ts
expressionAdaptation?: {
    source: "hook" | "objection";
    sourceId: string;     // angle id or objection id
    emotion: string;      // resolved emotion label
    applied: boolean;     // true when the EXPRESSION DIRECTION line was emitted
};
```

- **Optional** (`?`) → no migration; legacy generations simply omit it.
- `applied: false` or field absent when no hook/objection applied (FR-007).
- Populated in the concept-generation trace-assembly path (where `_lastResolutionTrace = { ... }` is set for the single/concept flow).

## Validation rules

- Every id present in `COLD_HOOK_ANGLES` MUST resolve to a non-null directive with non-empty `emotion` and `description` (SC-003; enforced by unit test).
- Every id in `RETARGETING_OBJECTION_DATA` MUST resolve to one of the four families.
- `null` angle AND `null` objection → mapper returns `null`; no line emitted; `expressionAdaptation` omitted/`applied:false`.
- Unrecognized non-null id → fallback directive (never `null` for a real run).

## State transitions

None — stateless per-generation derivation.
