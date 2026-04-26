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

export async function rerenderFromPlan(args: {
    generationId: string;
    targetRatio: AspectRatio;
    itemIndex: number | null;
    genData: Record<string, any>;
    geminiApiKey: string;
    openaiApiKey: string;
}): Promise<{ outputUrl: string; creditsCharged: number }> {
    const { generationId, targetRatio, itemIndex, genData, geminiApiKey, openaiApiKey } = args;

    let buildPlan: string | undefined;
    const inputs: Record<string, unknown> = genData.input ?? {};
    const approvedTov: string = genData.output?.fullResponse ?? "";
    const resolvedUniverse: string = genData.input?.tone ?? "";

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

    const { setGeminiCaller, setOpenAIKey } = await import("./generators.js");
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const caller: (params: { model: string; contents: any; config?: any }) => Promise<any> =
        (params) => genAI.getGenerativeModel({ model: params.model, ...params.config }).generateContent(params.contents);
    setGeminiCaller(caller);
    setOpenAIKey(openaiApiKey);

    const result = await generateFinalAd(
        buildPlan,
        approvedTov,
        inputs,
        resolvedUniverse,
        targetRatio,
    );

    if (!result.image) {
        throw new Error(
            `Rerender failed for generation ${generationId}: ${(result as any).errorCode || "unknown"}`
        );
    }

    return {
        outputUrl: result.image,
        creditsCharged: REFLOW_CREDIT_COST,
    };
}
