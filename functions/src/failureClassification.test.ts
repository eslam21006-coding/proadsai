// functions/src/failureClassification.test.ts — tests for classifyError and buildCostEstimate
import assert from "node:assert/strict";
import { classifyError, buildCostEstimate } from "./generators.js";
import { GenerationError } from "./types.js";

// ═══ classifyError tests ═══════════════════════════════════════════════════

function testClassifyGenerationError() {
    // GenerationError instances return their embedded failureClass directly
    const err = new GenerationError("test error", "slot_repair_failed");
    assert.equal(classifyError(err), "slot_repair_failed");
    console.log("✅ classifyError: GenerationError returns embedded failureClass");
}

function testClassifyCombinationInvalid() {
    const err = new Error("Invalid creative mode combination: foo + bar");
    assert.equal(classifyError(err), "combination_invalid");
    console.log("✅ classifyError: combination_invalid from error message");
}

function testClassifyCombinationInvalidFromErrorCode() {
    const err = new Error("some error");
    assert.equal(classifyError(err, "validation_failed"), "combination_invalid");
    console.log("✅ classifyError: combination_invalid from validation_failed errorCode");
}

function testClassifyPromptMalformed() {
    const err1 = new Error("Blueprint was empty or missing");
    assert.equal(classifyError(err1), "prompt_malformed");
    const err2 = new Error("Blueprint too short (12 chars)");
    assert.equal(classifyError(err2), "prompt_malformed");
    console.log("✅ classifyError: prompt_malformed from blueprint errors");
}

function testClassifyModelError() {
    const err1 = new Error("Structured build plan returned empty after repair");
    assert.equal(classifyError(err1), "model_error");
    const err2 = new Error("JSON parse failed after repair attempt");
    assert.equal(classifyError(err2), "model_error");
    console.log("✅ classifyError: model_error from empty/parse failures");
}

function testClassifySafetyBlocked() {
    const err = new Error("content blocked");
    assert.equal(classifyError(err, "safety_blocked"), "model_error");
    console.log("✅ classifyError: safety_blocked maps to model_error");
}

function testClassifyValidationReject() {
    const err1 = new Error("Structured contract validation failed");
    assert.equal(classifyError(err1), "validation_reject");
    const err2 = new Error("quality issue");
    assert.equal(classifyError(err2, "quality_rejected"), "validation_reject");
    console.log("✅ classifyError: validation_reject from contract/quality failures");
}

function testClassifySlotRepairFailed() {
    const err = new Error("Strict pair validation failed: secondary modes underrepresented");
    assert.equal(classifyError(err), "slot_repair_failed");
    console.log("✅ classifyError: slot_repair_failed from pair validation");
}

function testClassifyCreditInsufficient() {
    const err = new Error("Insufficient credits for this action");
    assert.equal(classifyError(err), "credit_insufficient");
    console.log("✅ classifyError: credit_insufficient from insufficient credits message");
}

function testClassifyProviderQuotaIsModelError() {
    // resource-exhausted is a provider quota issue, not a user billing issue
    const err1 = new Error("resource-exhausted: rate limit exceeded");
    assert.equal(classifyError(err1), "model_error");
    const err2 = new Error("Quota exceeded for model");
    assert.equal(classifyError(err2), "model_error");
    console.log("✅ classifyError: resource-exhausted/quota maps to model_error (not credit_insufficient)");
}

function testClassifyNumericHallucination() {
    // Via GenerationError (the primary path in generators.ts)
    const err1 = new GenerationError("numeric hallucination detected", "numeric_hallucination");
    assert.equal(classifyError(err1), "numeric_hallucination");
    console.log("✅ classifyError: numeric_hallucination via GenerationError");
}

function testClassifyUnknownFallsBackToModelError() {
    const err = new Error("something completely unexpected happened");
    assert.equal(classifyError(err), "model_error");
    // Non-Error objects also fall back
    assert.equal(classifyError("string error"), "model_error");
    assert.equal(classifyError(42), "model_error");
    assert.equal(classifyError(null), "model_error");
    console.log("✅ classifyError: unknown errors fall back to model_error");
}

// ═══ buildCostEstimate tests ═══════════════════════════════════════════════

function testBuildCostEstimateWithUsageMetadata() {
    const ce = buildCostEstimate("gemini-3.1-pro-preview", 2, {
        promptTokenCount: 1500,
        candidatesTokenCount: 500,
        totalTokenCount: 2000,
    });
    assert.equal(ce.modelTier, "gemini-3.1-pro-preview");
    assert.equal(ce.retryCount, 2);
    assert.equal(ce.estimatedTokens, 2000); // 1500 + 500
    console.log("✅ buildCostEstimate: correct token summing from usageMetadata");
}

function testBuildCostEstimateWithNullMetadata() {
    const ce = buildCostEstimate("gemini-3.1-flash-lite-preview", 1, null);
    assert.equal(ce.modelTier, "gemini-3.1-flash-lite-preview");
    assert.equal(ce.retryCount, 1);
    assert.equal(ce.estimatedTokens, 0);
    console.log("✅ buildCostEstimate: null metadata returns 0 tokens with model tier preserved");
}

function testBuildCostEstimatePreModelFailure() {
    const ce = buildCostEstimate(null, 0, null);
    assert.equal(ce.modelTier, null);
    assert.equal(ce.retryCount, 0);
    assert.equal(ce.estimatedTokens, 0);
    console.log("✅ buildCostEstimate: pre-model failure returns all zeros");
}

function testBuildCostEstimatePartialMetadata() {
    // Only promptTokenCount present
    const ce = buildCostEstimate("gemini-2.5-flash-lite", 0, {
        promptTokenCount: 800,
    });
    assert.equal(ce.estimatedTokens, 800); // 800 + 0
    console.log("✅ buildCostEstimate: handles partial usageMetadata (missing candidatesTokenCount)");
}

function testBuildCostEstimateTotalTokenCountFallback() {
    // When individual counts are 0 but totalTokenCount is available
    const ce = buildCostEstimate("gemini-3.1-pro-preview", 1, {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 3500,
    });
    assert.equal(ce.estimatedTokens, 3500);
    console.log("✅ buildCostEstimate: falls back to totalTokenCount when individual counts are 0");
}

// ═══ Run all tests ═════════════════════════════════════════════════════════

testClassifyGenerationError();
testClassifyCombinationInvalid();
testClassifyCombinationInvalidFromErrorCode();
testClassifyPromptMalformed();
testClassifyModelError();
testClassifySafetyBlocked();
testClassifyValidationReject();
testClassifySlotRepairFailed();
testClassifyCreditInsufficient();
testClassifyProviderQuotaIsModelError();
testClassifyNumericHallucination();
testClassifyUnknownFallsBackToModelError();
testBuildCostEstimateWithUsageMetadata();
testBuildCostEstimateWithNullMetadata();
testBuildCostEstimatePreModelFailure();
testBuildCostEstimatePartialMetadata();
testBuildCostEstimateTotalTokenCountFallback();

console.log("\n🎉 All failure classification tests passed (17/17)");
