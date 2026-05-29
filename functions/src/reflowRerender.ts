// functions/src/reflowRerender.ts — full-pipeline rerender-from-plan wrapper (HOTFIX-F)

import type { AspectRatio } from "./generators.js";
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

export async function rerenderFromPlan(args: {
    generationId: string;
    targetRatio: AspectRatio;
    itemIndex: number | null;
    genData: RerenderGenData;
    geminiApiKey: string;
    openaiApiKey: string;
}): Promise<{ outputUrl: string; creditsCharged: number; brandColorReinforced: boolean }> {
    const { generationId, targetRatio, itemIndex, genData, geminiApiKey, openaiApiKey } = args;

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
        const { setGeminiCaller, setOpenAIKey } = await import("./generators.js");
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        type GeminiCaller = Parameters<typeof setGeminiCaller>[0];
        const caller: GeminiCaller = (params) =>
            genAI.getGenerativeModel({ model: params.model, ...params.config }).generateContent(params.contents);
        setGeminiCaller(caller);
        setOpenAIKey(openaiApiKey);
    }

    const result = await generate(
        buildPlan,
        approvedTov,
        inputs as Parameters<typeof generateFinalAd>[2],
        resolvedUniverse,
        targetRatio,
    );

    if (!result.image) {
        const errorCode = "errorCode" in result && typeof result.errorCode === "string" ? result.errorCode : "unknown";
        throw new Error(`Rerender failed for generation ${generationId}: ${errorCode}`);
    }

    return {
        outputUrl: result.image,
        creditsCharged: REFLOW_CREDIT_COST,
        brandColorReinforced,
    };
}
