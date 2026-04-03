# Feature Specification: Failure Classification

**Feature Branch**: `007-failure-classification`  
**Created**: 2026-04-03  
**Status**: Draft  
**Input**: User description: "Phase 7: Failure Classification — classify every failed generation into one of seven failure categories and record cost estimates, enabling cost-per-failure-type analysis and operational visibility."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Classify Failed Generations (Priority: P1)

When a generation fails for any reason, the system categorizes the failure into exactly one of seven predefined classes and records it alongside the generation record. This gives operations visibility into *why* generations fail, enabling targeted fixes for the most costly or frequent failure types.

**Why this priority**: Without classification, all failures look the same. This is the foundational capability — every other story depends on failures being tagged correctly.

**Independent Test**: Trigger each of the seven failure types (malformed prompt, model error, validation rejection, slot repair failure, numeric hallucination, invalid combination, insufficient credits) and verify each generation record is tagged with the correct failure class.

**Acceptance Scenarios**:

1. **Given** a generation request with a malformed prompt, **When** the generation fails, **Then** the generation record is saved with `failureClass` set to `prompt_malformed`.
2. **Given** a generation request that fails due to an AI model error, **When** the error is caught, **Then** the generation record is saved with `failureClass` set to `model_error`.
3. **Given** a generation request where the output fails validation rules, **When** validation rejects the output, **Then** the generation record is saved with `failureClass` set to `validation_reject`.
4. **Given** a generation where slot repair is attempted but fails, **When** the repair process exhausts its attempts, **Then** the generation record is saved with `failureClass` set to `slot_repair_failed`.
5. **Given** a generation that produces hallucinated numeric values (e.g., wrong prices, counts), **When** the hallucination is detected, **Then** the generation record is saved with `failureClass` set to `numeric_hallucination`.
6. **Given** a generation request with an invalid mode/style combination, **When** the combination is rejected, **Then** the generation record is saved with `failureClass` set to `combination_invalid`.
7. **Given** a user without sufficient credits attempts a generation, **When** the credit check fails, **Then** the generation record is saved with `failureClass` set to `credit_insufficient`.

---

### User Story 2 - Record Cost Estimates on Failures (Priority: P2)

When a generation fails, the system records a cost estimate alongside the failure class, capturing the model tier used, the number of retries attempted, and the estimated tokens consumed. This enables the team to understand the financial impact of each failure type.

**Why this priority**: Classification alone tells you *what* failed; cost estimates tell you *how much it cost*. Together they enable cost-per-failure-type analysis.

**Independent Test**: Trigger a failure and verify the generation record includes a cost estimate with model tier, retry count, and estimated token usage.

**Acceptance Scenarios**:

1. **Given** a generation that fails after one attempt, **When** the failure is recorded, **Then** the cost estimate shows `retryCount` of 0 and the correct `modelTier` and `estimatedTokens`.
2. **Given** a generation that fails after multiple retries, **When** the failure is recorded, **Then** the cost estimate reflects the cumulative retry count and total estimated tokens across all attempts.
3. **Given** a generation that fails before any model call (e.g., credit_insufficient), **When** the failure is recorded, **Then** the cost estimate shows 0 estimated tokens and 0 retries.

---

### User Story 3 - Query Failures by Class (Priority: P3)

An operator can query generation records filtered by failure class to analyze failure patterns — for example, retrieving all `numeric_hallucination` failures from the past week to investigate a spike.

**Why this priority**: Classification data is only useful if it can be queried efficiently. This enables the analytical workflows that justify the entire feature.

**Independent Test**: Create several generation records with different failure classes, then query by a specific class and verify only matching records are returned.

**Acceptance Scenarios**:

1. **Given** multiple generation records with different failure classes, **When** an operator queries for a specific failure class, **Then** only records matching that class are returned.
2. **Given** a time range with no failures of a specific class, **When** querying for that class in that range, **Then** an empty result set is returned.

---

### Edge Cases

- What happens when a generation fails but the failure does not match any of the seven predefined classes? The system MUST NOT leave `failureClass` empty — it should assign the closest matching class or use `model_error` as the catch-all.
- What happens when a generation partially succeeds (e.g., 3 of 5 carousel slides generated)? The record should reflect the failure class for the failing portion; partial success is still a failure if the output is incomplete.
- What happens when cost estimation data is unavailable (e.g., the model call never completed)? The system records the best-effort estimate with available data and zeroes for unavailable fields.
- What happens when multiple failure conditions apply simultaneously (e.g., invalid combination AND insufficient credits)? The system assigns the *first* failure encountered in the processing pipeline, since failures are caught at sequential checkpoints.
- What happens when a generation fails after credits were already deducted? The system refunds the credits back to the user's balance as part of the failure recording flow. Pre-deduction failures (e.g., `credit_insufficient`, `combination_invalid`, `prompt_malformed`) skip the refund step since no credits were consumed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define exactly seven failure classes: `prompt_malformed`, `model_error`, `validation_reject`, `slot_repair_failed`, `numeric_hallucination`, `combination_invalid`, `credit_insufficient`.
- **FR-002**: System MUST assign exactly one failure class to every failed generation — no generation may fail without a `failureClass` value.
- **FR-003**: System MUST record a cost estimate for every generation (success and failure), containing: model tier (which model was used), retry count (how many attempts were made), and estimated tokens consumed.
- **FR-004**: System MUST persist `failureClass` and `costEstimate` as part of the generation record so they are available for later querying.
- **FR-005**: System MUST map every existing error path in the generation pipeline to one of the seven failure classes — no error path may be left unclassified.
- **FR-006**: System MUST support querying generation records by failure class to enable cost-per-failure-type analysis.
- **FR-007**: Successful generations MUST have `failureClass` set to null — the field is only populated on failure.
- **FR-008**: System MUST record cost estimates even when the failure occurs before any model call (e.g., `credit_insufficient` records 0 tokens and 0 retries).
- **FR-009**: System MUST refund the user's credits when a generation fails *after* credits were already deducted (e.g., `model_error`, `validation_reject`, `slot_repair_failed`, `numeric_hallucination`). Pre-deduction failures (`credit_insufficient`, `combination_invalid`, `prompt_malformed`) require no refund since credits were never consumed.

### Key Entities

- **FailureClass**: An enumeration of exactly seven values representing the category of a generation failure. Each value maps to a specific error condition in the generation pipeline.
- **CostEstimate**: A data structure recorded with every generation (success and failure), containing: the model tier used, the number of retries attempted, and the estimated number of tokens consumed across all attempts.
- **Generation Record**: The existing record for each generation attempt, extended with two new fields: `failureClass` (one of seven values or null for success) and `costEstimate` (cost breakdown for failed generations).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of failed generations are tagged with a valid failure class — no unclassified failures exist in the system.
- **SC-002**: Every generation record (success and failure) includes a cost estimate with all three fields populated (model tier, retry count, estimated tokens).
- **SC-003**: Operators can retrieve all failures of a given class within a date range in under 3 seconds.
- **SC-004**: The team can produce a cost-per-failure-type breakdown report from the stored data, identifying which failure types are most expensive.
- **SC-005**: Successful generations are unaffected — they continue to work exactly as before, with `failureClass` set to null.

## Clarifications

### Session 2026-04-03

- Q: Should `costEstimate` be recorded on successful generations too? → A: Yes, record on ALL generations (success and failure). Additionally, refund credits to the user on failed generations.
- Q: Should historical failed generations be backfilled with failure classes? → A: No, forward-only. Classify new failures only; leave old records as-is.
- Q: Should credit refunds apply to all failure types or only post-deduction failures? → A: Refund only for failures that occur after credits were already deducted (e.g., model_error, validation_reject, slot_repair_failed). Pre-deduction failures (credit_insufficient, combination_invalid) have nothing to refund.

## Assumptions

- The generation pipeline already has defined error paths (throws and catches) that can be mapped to the seven failure classes without restructuring the pipeline.
- Token counts can be estimated from model responses or request payloads; exact billing-grade precision is not required for `estimatedTokens`.
- The seven failure classes defined in Spec F are exhaustive for the current generation pipeline. If new failure modes emerge in the future, the type can be extended.
- Classification is forward-only — existing generation records created before this feature are not backfilled. The `failureClass` and `costEstimate` fields will be absent or null on historical records.
- Cost estimate data (model tier, retry count) is available at the point where failures are caught in the pipeline.
- This feature does not include a user-facing dashboard — it provides the data layer that a future dashboard or reporting tool can consume.
- Querying by failure class is an operator/internal tool need, not an end-user feature.
