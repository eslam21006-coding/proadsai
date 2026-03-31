# Contract: Value Stack Functions

**Feature**: 001-resolver-completeness-trace
**Location**: `functions/src/creativeResolver.ts`

## resolveValueStackSlideCount

### Signature

```
resolveValueStackSlideCount(gifts: string[]): ValueStackAdjustment
```

### Input

Array of gift strings (may include empty/whitespace values).

### Output

```
{
  giftCount: number,           // Non-empty gifts after filtering
  originalSlideCount: number,  // User's selection (passed separately or inferred)
  resolvedSlideCount: number,  // Math.min(giftCount + 2, 9)
  capped: boolean              // true if giftCount + 2 > 9
}
```

### Rules

- Filter out empty, null, undefined, and whitespace-only strings
- Formula: `resolvedSlideCount = Math.min(nonEmptyCount + 2, 9)`
- If `nonEmptyCount === 0`, return `resolvedSlideCount = 0` (no carousel possible)

---

## filterEmptyValueStackFields

### Signature

```
filterEmptyValueStackFields(inputs: AdInputs): { filtered: AdInputs, skippedFields: string[] }
```

### Input

Full `AdInputs` object.

### Output

- `filtered`: Shallow copy with empty value_stack fields removed
- `skippedFields`: Array of field names that were removed

### Target Fields

```
valueStackTitle, valueStackItems, valueStackBonuses, valueStackPrice,
valueStackOriginalValue, valueStackSavings, valueStackGuarantee,
valueStackDeliveryFormat, valueStackProofStatement
```

### Rules

- String fields: remove if undefined, null, empty, or whitespace-only
- Array fields: filter empty entries; remove key if array becomes empty
- Never mutate original input — return shallow copy
- `skippedFields` feeds into `ResolutionTrace.valueStackEmptyFieldsSkipped`
