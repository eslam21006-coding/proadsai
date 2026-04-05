# Contract: Generation Response with Failure Classification

**Date**: 2026-04-03

## Overview

All generation callable functions (`serverGenerateBuildPlan`, `serverGenerateFinalAd`, etc.) extend their response to include `costEstimate` on success and write a classified failure record on error.

## Success Response (returned to frontend)

Existing success response fields remain unchanged. New field added:

```
{
  // ... existing success fields (imageBase64, hookText, etc.)
  costEstimate: {
    modelTier: string,       // e.g., "gemini-3.1-pro-preview"
    retryCount: number,      // 0 if no retries
    estimatedTokens: number  // total input+output tokens
  }
}
```

## Error Response (HttpsError)

On failure, the backend:
1. Classifies the error into one of 7 `FailureClass` values
2. Refunds credits if they were already deducted (post-deduction failures only)
3. Writes a failure record to `generations/{genId}` with:
   - `userId`, `timestamp`, `input` (from request)
   - `failureClass`: one of 7 values
   - `costEstimate`: token/cost breakdown
   - `output.phase`: which phase failed
   - `output.fullResponse`: error message (truncated)
4. Throws `HttpsError` with error message (existing behavior preserved)

## Failure Record Written to Firestore

```
generations/{auto-id}:
  userId: string
  timestamp: Timestamp
  failureClass: "prompt_malformed" | "model_error" | "validation_reject" 
              | "slot_repair_failed" | "numeric_hallucination" 
              | "combination_invalid" | "credit_insufficient"
  costEstimate:
    modelTier: string | null
    retryCount: number
    estimatedTokens: number
  input: { ... }  // request input for debugging
  output:
    phase: string  // which generation phase failed
    fullResponse: string  // error message
  feedback:
    rating: null
    tags: []
    freeText: ""
    savedToFavorites: false
```

## Query Contract

Operator queries supported:

| Query | Filter | Order |
|---|---|---|
| All failures of a type | `failureClass == <value>` | `timestamp DESC` |
| Failures in date range | `failureClass == <value>`, `timestamp >= start`, `timestamp <= end` | `timestamp DESC` |
| All failures for a user | `userId == <uid>`, `failureClass != null` | `failureClass ASC`, `timestamp DESC` |

Requires composite indexes:
- `(failureClass ASC, timestamp DESC)` — for type and date-range queries
- `(userId ASC, failureClass ASC, timestamp DESC)` — for user-scoped queries (Firestore requires inequality field in orderBy)
