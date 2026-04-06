# Contract: Empty Field Suppression (Value Stack)

**Feature**: 001-resolver-completeness-trace
**Location**: `functions/src/emptyFieldFilter.ts` (new file)

## Function Signature

```typescript
interface FilterResult {
  filteredInput: Record<string, unknown>;  // Input with empty fields removed
  skippedFields: string[];                  // Canonical field names that were suppressed
}

function filterEmptyValueStackFields(
  input: Record<string, unknown>
): FilterResult;
```

## Canonical Fields

```typescript
const VALUE_STACK_FIELDS = [
  'valueStackTitle',
  'valueStackItems',
  'valueStackBonuses',
  'valueStackPrice',
  'valueStackOriginalValue',
  'valueStackSavings',
  'valueStackGuarantee',
  'valueStackDeliveryFormat',
  'valueStackProofStatement',
] as const;
```

## Empty Definition

A field is considered empty and will be suppressed if:

| Type | Empty when |
|------|-----------|
| `undefined` | Always |
| `null` | Always |
| `string` | `''` or whitespace-only (`value.trim() === ''`) |
| `Array` | `[]` or all elements are empty or whitespace-only (`element.trim() === ''`) |

## Behavior

1. Iterate over `VALUE_STACK_FIELDS`
2. For each field present in `input`: check if empty per rules above
3. If empty: delete from `filteredInput`, add field name to `skippedFields`
4. If not empty: keep in `filteredInput` as-is
5. Non-value-stack fields in `input` are passed through unchanged

## Integration Points

- Called by `resolveCreativeSpec()` in `creativeResolver.ts` when value_stack mode is active
- `skippedFields` written to `ResolutionTrace.valueStackEmptyFieldsSkipped`
- Filtered input passed to generators — they never see empty fields

## Invariants

- Pure function, no side effects
- Only operates on the 9 canonical fields — never touches non-value-stack fields
- `skippedFields` contains only canonical field names (never arbitrary keys)
- Returns a new object — does not mutate the input
