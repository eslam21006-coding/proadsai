// functions/src/reflowRerender.ts — full-pipeline rerender-from-plan wrapper (HOTFIX-F)

import type { AspectRatio, GeminiCaller } from "./generators.js";
import { generateFinalAd } from "./generators.js";

export class NoPlanError extends Error {
    public readonly fallbackReason = "no_plan" as const;
    constructor(message: string) {
        super(message);
        this.name = "NoPlanError";
    }
}

const REFLOW_CREDIT_COST = 5;

/**
 * Generation document shape used by rerenderFromPlan. Loose by design — generation
 * docs evolved over multiple phases and we read defensively.
 */
export interface RerenderGenData {
    input?: {
        tone?: string;
        [k: string]: unknown;
    };
    output?: {
        buildPlan?: string;
        fullResponse?: string;
        carouselSlides?: Array<{ buildPlan?: string; imageUrl?: string }>;
        batchResults?: Array<{ buildPlan?: string; url?: string }>;
        [k: string]: unknown;
    };
    [k: string]: unknown;
}

/**
 * Pure plan-extraction helper exported for testability. Returns the saved buildPlan
 * for a single render, a carousel slide, or a batch variant. Throws NoPlanError if
 * the source generation lacks a plan at the requested location (FR-015 trigger).
 */
export function extractBuildPlan(
    genData: RerenderGenData,
    itemIndex: number | null,
    generationId: string,
): string {
    let buildPlan: string | undefined;

    if (itemIndex !== null) {
        const slides = genData.output?.carouselSlides;
        if (Array.isArray(slides) && slides[itemIndex]) {
            buildPlan = slides[itemIndex].buildPlan;
        }
        const batchResults = genData.output?.batchResults;
        if (!buildPlan && Array.isArray(batchResults) && batchResults[itemIndex]) {
            buildPlan = batchResults[itemIndex].buildPlan;
        }
    } else {
        buildPlan = genData.output?.buildPlan;
    }

    if (!buildPlan || typeof buildPlan !== "string") {
        throw new NoPlanError(
            `No saved buildPlan for generation ${generationId}` +
            (itemIndex !== null ? ` item ${itemIndex}` : "")
        );
    }
    return buildPlan;
}

/**
 * Test seam: replace the real `generateFinalAd` with a stub. NOT for production use —
 * tests inject a stub to verify rerenderFromPlan's argument-passing contract without
 * triggering Gemini calls. Pass `null` to restore the real implementation.
 */
export type GenerateFinalAdImpl = typeof generateFinalAd;
let _generateFinalAdOverride: GenerateFinalAdImpl | null = null;
export function __setGenerateFinalAdForTests(impl: GenerateFinalAdImpl | null): void {
    _generateFinalAdOverride = impl;
}

/**
 * Test seam for the server-side Storage upload. Production default (null) lazily
 * imports `saveBase64ToStorage`, which needs an initialized admin app + bucket —
 * unavailable in unit tests. Tests inject a passthrough stub so rerenderFromPlan
 * can be exercised without real Storage. Pass `null` to restore the default.
 */
export type StorageUploaderImpl = (base64OrDataUrl: string, pathPrefix: string) => Promise<string>;
let _storageUploaderOverride: StorageUploaderImpl | null = null;
export function __setStorageUploaderForTests(impl: StorageUploaderImpl | null): void {
    _storageUploaderOverride = impl;
}

export async function rerenderFromPlan(args: {
    generationId: string;
    targetRatio: AspectRatio;
    itemIndex: number | null;
    genData: RerenderGenData;
    geminiCaller: GeminiCaller;
    openaiApiKey: string;
    // Optional base64 data URL of the original render. When present it is passed to
    // generateFinalAd as a style/composition reference so the from-plan rerender stays
    // visually coherent with the original instead of regenerating blind.
    styleReference?: string;
}): Promise<{ outputUrl: string; creditsCharged: number; brandColorReinforced: boolean }> {
    const { generationId, targetRatio, itemIndex, genData, geminiCaller, openaiApiKey, styleReference } = args;

    const inputs: Record<string, unknown> = (genData.input ?? {}) as Record<string, unknown>;
    const approvedTov: string = genData.output?.fullResponse ?? "";
    const resolvedUniverse: string = genData.input?.tone ?? "";

    let buildPlan = extractBuildPlan(genData, itemIndex, generationId);

    const brandPrimary = typeof inputs.brandColorPrimary === "string" ? inputs.brandColorPrimary.trim() : "";
    const brandSecondary = typeof inputs.brandColorSecondary === "string" ? inputs.brandColorSecondary.trim() : "";
    let brandColorReinforced = false;
    if (brandPrimary || brandSecondary) {
        const parts: string[] = [];
        if (brandPrimary) parts.push(`Primary: ${brandPrimary}`);
        if (brandSecondary) parts.push(`Secondary: ${brandSecondary}`);
        buildPlan += `\n\nBRAND COLOR LOCK: Maintain exact brand palette — ${parts.join(", ")}.`;
        brandColorReinforced = true;
    }

    const generate = _generateFinalAdOverride ?? generateFinalAd;
    if (!_generateFinalAdOverride) {
        // Use the SAME production caller as serverGenerateFinalAd (the new @google/genai
        // SDK), injected by the reflow callable. generateFinalAd emits @google/genai
        // request shapes (contents:{parts} + config); the previous home-grown
        // @google/generative-ai (old SDK) caller could not iterate that shape and threw
        // "request is not iterable". Wiring the injected caller into the module-level
        // singleton makes generateFinalAd use it.
        const { setGeminiCaller, setOpenAIKey } = await import("./generators.js");
        setGeminiCaller(geminiCaller);
        setOpenAIKey(openaiApiKey);
    }

    // Only a base64 data URL is a valid style reference (generateFinalAd reads its
    // base64 payload); ignore http URLs / sentinels here.
    const styleRef = typeof styleReference === "string" && styleReference.startsWith("data:image/")
        ? styleReference
        : undefined;

    // FIX C (revised): REFLOW CONSISTENCY LOCK. A reflow rerender is a ratio adaptation of
    // an EXISTING ad — NOT a fresh creative and NOT a carousel narrative progression. This
    // is passed as a dedicated `reflowInstruction` arg so generateFinalAd injects it AFTER
    // blueprint keyword-stripping (the stripper would otherwise delete scene/style/reference/
    // concept from a blueprint-prepended block). Keeps the scene lock at full strength.
    const reflowConsistencyBlock =
        `REFLOW INSTRUCTION: This is a ratio adaptation, NOT a new creative.\n` +
        `Re-render the EXACT same ad at the new aspect ratio.\n` +
        `MUST preserve: same hero face and appearance, same color palette, same background environment and lighting, same visual style, same mood and atmosphere, same brand elements.\n` +
        `ONLY change: element placement, proportions, and composition to fit the ${targetRatio} canvas.\n` +
        `Do NOT change the concept. Do NOT add new elements. Do NOT change the scene. This must look like the same ad at a different size.` +
        (styleRef
            ? `\nReference image provided — match this image exactly in style, color, hero appearance, and scene. Only adapt the composition for ${targetRatio}.`
            : "");

    const result = await generate(
        buildPlan,
        approvedTov,
        inputs as Parameters<typeof generateFinalAd>[2],
        resolvedUniverse,
        targetRatio,
        undefined, // editInstruction
        undefined, // base64ToEdit
        styleRef,  // styleReference — original render, for visual coherence
        undefined, // textOverride
        reflowConsistencyBlock, // reflowInstruction — injected post-strip (FIX C)
    );

    if (!result.image) {
        const errorCode = "errorCode" in result && typeof result.errorCode === "string" ? result.errorCode : "unknown";
        throw new Error(`Rerender failed for generation ${generationId}: ${errorCode}`);
    }

    // generateFinalAd returns a base64 data URL. Persist it to Storage (admin SDK)
    // so outputUrl is a durable Storage URL — matching the outpaint route — instead
    // of base64. Writing base64 into mockupHistory/variantChips would re-bloat the
    // generations doc past Firestore's 1 MiB limit and isn't reusable as a reflow
    // source. saveBase64ToStorage throws on failure, which propagates as a reflow
    // failure (caught by the handler) — correct, since a render with nowhere to live
    // can't be delivered.
    const upload: StorageUploaderImpl = _storageUploaderOverride
        ?? (async (b64, prefix) => (await import("./storageUpload.js")).saveBase64ToStorage(b64, prefix));
    const outputUrl = await upload(result.image, "reflows");

    return {
        outputUrl,
        creditsCharged: REFLOW_CREDIT_COST,
        brandColorReinforced,
    };
}
