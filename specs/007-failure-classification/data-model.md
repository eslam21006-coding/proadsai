# Data Model: Failure Classification

**Branch**: `007-failure-classification`  
**Date**: 2026-04-03

## New Types

### FailureClass (enum/union)

Exactly seven values representing the category of a generation failure:

| Value | Description |
|---|---|
| `prompt_malformed` | Required input missing/empty, blueprint too short |
| `model_error` | AI model API error, retries exhausted, empty response, safety block |
| `validation_reject` | Output fails contract validation or quality gates after repair |
| `slot_repair_failed` | Strict pair validation fails — secondary modes missing after repair |
| `numeric_hallucination` | Detected wrong prices/counts in output (soft-fail, tagged for tracking) |
| `combination_invalid` | Creative mode combination not allowed |
| `credit_insufficient` | User's credit balance too low for the requested action |

### CostEstimate (object)

Recorded on every generation (success and failure):

| Field | Type | Description |
|---|---|---|
| `modelTier` | `string \| null` | Model name used (e.g., `gemini-3.1-pro-preview`). Null if no model call was made. |
| `retryCount` | `number` | Number of retry attempts (0 = first attempt succeeded or failed without retry) |
| `estimatedTokens` | `number` | Total tokens consumed across all attempts (input + output). 0 if no model call. |

## Modified Entities

### GenerationRecord (existing — `src/services/feedbackService.ts`)

Two new top-level fields added:

| Field | Type | Default | Description |
|---|---|---|---|
| `failureClass` | `FailureClass \| null` | `null` | Set to one of 7 values on failure. Null on success. |
| `costEstimate` | `CostEstimate \| null` | `null` | Token/cost breakdown. Populated on all new generations. Null on historical records. |

### Firestore Document: `generations/{genId}`

**New fields on document**:
- `failureClass`: string (one of 7 values) or null
- `costEstimate.modelTier`: string or null
- `costEstimate.retryCount`: number
- `costEstimate.estimatedTokens`: number

**New composite index**:
- Collection: `generations`
- Fields: `failureClass` (ASC), `timestamp` (DESC)
- Purpose: Enable efficient queries for failure-type analysis within date ranges

## State Transitions

```
Generation Request
  │
  ├─ Pre-deduction check ── FAIL ──> failureClass = credit_insufficient | combination_invalid | prompt_malformed
  │                                  costEstimate = { modelTier: null, retryCount: 0, estimatedTokens: 0 }
  │                                  (no credit refund needed)
  │
  ├─ Credits deducted
  │
  ├─ Model call + validation ── FAIL ──> failureClass = model_error | validation_reject | slot_repair_failed
  │                                      costEstimate = { modelTier: "<model>", retryCount: N, estimatedTokens: T }
  │                                      Credits REFUNDED
  │
  ├─ Quality check ── SOFT FAIL ──> failureClass = numeric_hallucination (generation still succeeds)
  │                                 costEstimate = { modelTier: "<model>", retryCount: N, estimatedTokens: T }
  │                                 (no refund — generation produced output)
  │
  └─ SUCCESS ──> failureClass = null
                 costEstimate = { modelTier: "<model>", retryCount: N, estimatedTokens: T }
```

## Validation Rules

- `failureClass` MUST be one of the 7 enum values or null — no other strings allowed
- `costEstimate.retryCount` MUST be >= 0
- `costEstimate.estimatedTokens` MUST be >= 0
- If `failureClass` is not null, `costEstimate` MUST also be present
- If `failureClass` is null (success), `costEstimate` SHOULD be present (for new records) but MAY be null (for historical records)

## Data Volume Assumptions

- Existing `generations` collection grows with usage; adding 2 fields per document has negligible storage impact
- Composite index on `failureClass + timestamp` is lightweight given the cardinality of 7 failure classes
- No TTL or retention policy — failure data retained as long as generation records exist
