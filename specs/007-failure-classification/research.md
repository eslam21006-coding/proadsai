# Research: Failure Classification

**Date**: 2026-04-03  
**Branch**: `007-failure-classification`

## Decision 1: Error Path → FailureClass Mapping

**Decision**: Map every existing error path in the generation pipeline to one of seven failure classes based on error type and origin.

**Mapping**:

| FailureClass | Error Paths | Files:Lines |
|---|---|---|
| `combination_invalid` | Creative mode combination validation fails | generators.ts:1915, 3302 |
| `credit_insufficient` | User credits < action cost before deduction | index.ts:107-120 (throws `resource-exhausted`) |
| `prompt_malformed` | Required input fields missing/empty, blueprint too short (<80 chars) | generators.ts:3619, 3651 |
| `model_error` | Gemini API error after retries exhausted, empty JSON response, JSON parse failure after repair, safety-blocked (no image candidates) | generators.ts:3552, 3579, retry wrapper:463-472, 5473 |
| `validation_reject` | Contract validation failure after repair, quality_rejected (quick_reject, slot_map, placeholder_leak in render phase) | generators.ts:3614, 3817, 3976, 4043, 4047, 4050, 4057 |
| `slot_repair_failed` | Strict pair validation fails — secondary modes underrepresented after repair attempt | generators.ts:3257, 3268 |
| `numeric_hallucination` | Numeric fidelity check detects wrong prices/counts in rendered output | generators.ts:5317 (currently soft-fail/warning) |

**Rationale**: Each class corresponds to a distinct failure category that requires different remediation. The mapping covers all hard-failure paths in generators.ts and index.ts.

**Alternatives considered**:
- Single `generation_failed` catch-all — rejected because it defeats the purpose of classification
- More granular classes (e.g., separate `json_parse_failed`, `safety_blocked`) — rejected to keep the set at exactly 7 per Spec F

## Decision 2: Where to Record Failure Data

**Decision**: Record `failureClass` and `costEstimate` in the backend (Cloud Functions) and write directly to the `generations` Firestore collection on failure. On success, return `costEstimate` to the frontend for it to include in the existing `addDoc` call.

**Rationale**: Currently generation records are written by the frontend (`src/services/feedbackService.ts:175-181`). However, on failure the frontend may not have enough context to classify the error. The backend catches the error and knows the exact failure class.

- **On failure**: Backend writes a minimal generation record to `generations/{genId}` with `failureClass`, `costEstimate`, `userId`, `timestamp`, and input metadata. This ensures every failure is captured even if the frontend doesn't handle the error gracefully.
- **On success**: Backend returns `costEstimate` in the response. Frontend includes it when writing the generation record (existing flow).

**Alternatives considered**:
- Return failure class to frontend and let frontend write — rejected because frontend may drop the info on error
- Separate `generation_failures` collection — rejected to keep queries simple (one collection for all generations)

## Decision 3: Cost Estimate Data Source

**Decision**: Extract token usage from Gemini API response metadata (`usageMetadata` field). Record model name, retry count (from retry wrapper), and token counts (input + output).

**Rationale**: Gemini API responses include `usageMetadata` with `promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`. This is already available in the response — we just need to capture it.

- For pre-model failures (credit_insufficient, combination_invalid, prompt_malformed): record `{ modelTier: null, retryCount: 0, estimatedTokens: 0 }`
- For post-model failures: sum tokens across all retry attempts

**Alternatives considered**:
- Estimate tokens from prompt length — rejected because Gemini already provides exact counts
- Use credit cost as proxy for token cost — rejected because credits are fixed per action, not per token

## Decision 4: Credit Refund Implementation

**Decision**: Auto-refund credits in the backend error handler when a failure occurs after credit deduction. Use the existing `refundCreditsServer` pattern (atomic Firestore transaction) but call it inline rather than as a callable function.

**Rationale**: Credits are deducted at index.ts:107-120 BEFORE the Gemini call. If the call fails, credits must be restored. The existing `refundCreditsServer` (index.ts:1223-1257) provides the pattern but is exposed as a callable — we need the same logic inline in the catch block.

**Pre-deduction failures** (no refund needed):
- `credit_insufficient` — check fails before deduction
- `combination_invalid` — validation happens before deduction in some paths
- `prompt_malformed` — input validation before deduction in some paths

**Post-deduction failures** (refund needed):
- `model_error`, `validation_reject`, `slot_repair_failed`, `numeric_hallucination`

**Alternatives considered**:
- Deduct credits after success only — rejected because it would require restructuring the entire flow and introduces race conditions
- Call `refundCreditsServer` as a callable from backend — rejected because it's simpler to use the transaction pattern inline

## Decision 5: Firestore Index for failureClass Queries

**Decision**: Add a composite Firestore index on `(failureClass, timestamp)` to enable efficient queries like "all `model_error` failures in the last 7 days."

**Rationale**: Firestore requires composite indexes for queries combining equality filters with ordering/range filters. Without this index, queries on `failureClass` + date range would fail.

**Alternatives considered**:
- Single-field index on `failureClass` only — insufficient for date-range queries
- No index (scan all docs) — rejected for performance reasons (SC-003 requires <3s query time)

## Decision 6: numeric_hallucination Promotion to Hard Failure

**Decision**: The `numeric_hallucination` detection at generators.ts:5317 is currently a soft failure (warning, continues). For failure classification to work, it must remain a soft failure for the generation flow but still be recorded as a `failureClass` on the generation record. The generation succeeds with a warning flag, and the record is tagged `numeric_hallucination` for tracking purposes only.

**Rationale**: Making numeric hallucination a hard failure would break existing generation flow and reject images that are usable despite minor numeric discrepancies. Instead, tag the record so the team can track frequency and decide whether to promote it to a hard gate later.

**Alternatives considered**:
- Promote to hard failure — rejected because it would increase failure rate significantly
- Ignore entirely — rejected because the whole point is to track these
