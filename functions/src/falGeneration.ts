/**
 * falGeneration.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * FAL.AI FLUX-PULID — Face-identity-preserving image generation
 * ═══════════════════════════════════════════════════════════════════════════
 * Route A: Used when user uploaded a face photo AND creative mode produces human hero.
 * facePhotoUrl is NEVER sent to Gemini — only to fal.ai.
 */

import { fal } from "@fal-ai/client";

// ─── INTERFACES ──────────────────────────────────────────────────────────

export interface FalGenerationInput {
    scenePrompt: string;           // English-only (from layoutSpec.fluxScenePrompt)
    negativePrompt: string;        // From layoutSpec.fluxNegativePrompt
    facePhotoUrl: string;          // Firebase Storage download URL
    imageSize: string;             // 'square_hd' | 'landscape_16_9' | 'portrait_4_3' etc.
    falApiKey: string;
}

export interface FalGenerationResult {
    imageBase64: string;           // data:image/jpeg;base64,...
    requestId: string;
}

// ─── ASPECT RATIO → FAL IMAGE SIZE MAPPING ──────────────────────────────

const ASPECT_TO_FAL_SIZE: Record<string, string> = {
    '1:1': 'square_hd',           // 1024×1024
    '4:5': 'portrait_4_3',        // closest fal preset
    '3:4': 'portrait_4_3',
    '9:16': 'portrait_16_9',
    '4:3': 'landscape_4_3',
    '16:9': 'landscape_16_9',
};

/**
 * Convert app aspect ratio to fal.ai image_size parameter.
 */
export function mapAspectRatioToFalSize(aspectRatio: string): string {
    return ASPECT_TO_FAL_SIZE[aspectRatio] || 'square_hd';
}

// ─── TIMEOUT ────────────────────────────────────────────────────────────

/** Maximum time to wait for fal.ai before falling back to Gemini */
const FAL_TIMEOUT_MS = 45_000;

// ─── MAIN GENERATION FUNCTION ────────────────────────────────────────────

/**
 * Generate an image via fal.ai flux-pulid with face identity preservation.
 * Includes a hard 45-second timeout — if fal.ai is slow or queued,
 * the caller falls back to Route B (Gemini) instead of blocking for minutes.
 *
 * @returns FalGenerationResult with base64 image, or null on failure/timeout
 */
export async function generateWithFal(
    input: FalGenerationInput,
): Promise<FalGenerationResult | null> {
    try {
        // Configure fal client with API key
        fal.config({ credentials: input.falApiKey });

        const startTime = Date.now();
        console.log(`🎨 fal.ai flux-pulid: starting generation (size=${input.imageSize}, timeout=${FAL_TIMEOUT_MS}ms)...`);

        // Race between fal.ai generation and a hard timeout
        const falPromise = fal.subscribe("fal-ai/flux-pulid", {
            input: {
                prompt: input.scenePrompt,
                negative_prompt: input.negativePrompt,
                reference_image_url: input.facePhotoUrl,
                id_weight: 1.0,
                num_inference_steps: 20,
                image_size: input.imageSize as any,
            },
            logs: true,
            pollInterval: 2000,
            onQueueUpdate: (update) => {
                if (update.status === 'IN_PROGRESS') {
                    console.log(`  fal.ai progress: ${update.logs?.map(l => l.message).join(' | ') || 'processing...'}`);
                }
            },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`fal.ai timeout after ${FAL_TIMEOUT_MS}ms`)), FAL_TIMEOUT_MS)
        );

        const result = await Promise.race([falPromise, timeoutPromise]);
        const durationMs = Date.now() - startTime;

        const typedResult = result as any;

        // Extract image URL from result
        const imageUrl = typedResult.data?.images?.[0]?.url
            || typedResult.images?.[0]?.url;

        if (!imageUrl) {
            console.error('❌ fal.ai flux-pulid: no image URL in response', JSON.stringify(typedResult).substring(0, 500));
            return null;
        }

        const requestId = typedResult.requestId || typedResult.data?.requestId || 'unknown';

        // Download the image and convert to base64
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            console.error(`❌ fal.ai: failed to download image from ${imageUrl}: ${imageResponse.status}`);
            return null;
        }

        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        console.log(`✅ fal.ai flux-pulid: generation complete in ${durationMs}ms (requestId=${requestId})`);

        return {
            imageBase64,
            requestId: String(requestId),
        };
    } catch (err: any) {
        console.error('❌ fal.ai flux-pulid generation failed:', err?.message || err);
        return null;
    }
}
