# Contract: Generation Failure Classification, Refund & Cost (FR-107..110)

**Location**: `functions/src/index.ts` (every generation callable's catch + success path), `src/services/feedbackService.ts` + `src/App.tsx` (client persist)

> **Sequencing gate (CLEARED 2026-05-21)**: FR-107/108 touch billing (`refundCreditsServer`); Phase 21 / Stripe-migration is confirmed merged, deployed, and smoke-tested, so these proceed against current code (research R7).

## Failure path (catch block of every serverGenerate* callable)

```
on caught error:
  failureClass = classifyError(error, errorCode)          // FR-107
  costEstimate = buildCostEstimate(modelTier, retries, usageMetadata)
  write generations/{auto-id} failure record (data-model §2)
  if failureClass ∈ {model_error, validation_reject, slot_repair_failed} AND creditsDeducted:
      refund via refundCreditsServer pattern               // FR-108
  throw HttpsError(...)  // existing behavior preserved
```
- **Skip refund** for `credit_insufficient`/`combination_invalid`/`prompt_malformed` (pre-deduction) and `numeric_hallucination` (soft-fail, user got output).

## Success path (response shape delta)

```
{ ...existing fields, costEstimate: { modelTier, retryCount, estimatedTokens } }   // FR-109
```

## Client persist (FR-110)

`saveGeneration(...)` receives `costEstimate` (from response) and `failureClass: null` on success; both land on the persisted record.

## Done proof (cross-boundary grep)
- `classifyError` / `buildCostEstimate` referenced in `index.ts` (currently zero).
- `costEstimate` present in BOTH the callable response AND the client `saveGeneration` call.
- Emulator: a forced hard failure refunds credits and writes a failure doc with a `failureClass`; a `credit_insufficient` failure does not refund.
