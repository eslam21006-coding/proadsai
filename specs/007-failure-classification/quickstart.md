# Quickstart: Failure Classification

**Branch**: `007-failure-classification`

## What This Feature Does

Tags every failed generation with one of 7 failure categories and records cost estimates (model tier, retries, tokens) on all generations. Auto-refunds credits on post-deduction failures.

## Key Files to Modify

| File | Change |
|---|---|
| `functions/src/types.ts` | Add `FailureClass` type and `CostEstimate` interface |
| `functions/src/generators.ts` | Tag each error path with correct `FailureClass`; capture token counts from Gemini response |
| `functions/src/index.ts` | Catch errors with classification, write failure records to Firestore, auto-refund credits, return `costEstimate` on success |
| `src/services/feedbackService.ts` | Add `failureClass` and `costEstimate` to `GenerationRecord` interface; include `costEstimate` in `addDoc` call |
| `firestore.indexes.json` | Add composite index on `(failureClass, timestamp)` |

## The 7 Failure Classes

1. `prompt_malformed` — bad input (empty fields, blueprint too short)
2. `model_error` — AI API failure, retries exhausted, safety block
3. `validation_reject` — output fails quality/contract gates
4. `slot_repair_failed` — strict mode repair failed
5. `numeric_hallucination` — wrong numbers detected (soft-fail, tagged only)
6. `combination_invalid` — illegal mode combination
7. `credit_insufficient` — not enough credits

## Credit Refund Rules

- Pre-deduction failures (`credit_insufficient`, `combination_invalid`, `prompt_malformed`): no refund needed
- Post-deduction failures (`model_error`, `validation_reject`, `slot_repair_failed`, `numeric_hallucination`): auto-refund

## Testing Approach

1. Trigger each of the 7 failure types via unit tests with mocked Gemini responses
2. Verify correct `failureClass` is assigned
3. Verify `costEstimate` is populated with correct values
4. Verify credit refund occurs for post-deduction failures only
5. Verify Firestore composite index enables `failureClass` + date range queries
