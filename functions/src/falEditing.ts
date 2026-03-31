/**
 * falEditing.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * FAL.AI KONTEXT — Image editing for fal-rendered images
 * ═══════════════════════════════════════════════════════════════════════════
 * Used for editing images originally rendered by fal.ai (Route A).
 * Gemini-rendered images (Route B) use the existing serverEditRegion flow.
 *
 * CRITICAL: Text is NEVER sent to editing models. The image sent here is
 * the clean AI-generated version WITHOUT any Sharp text overlay.
 * After editing, compositeArabicText() runs again as the final step.
 */

import { fal } from "@fal-ai/client";

// ─── INTERFACES ──────────────────────────────────────────────────────────

export interface FalEditResult {
    imageBase64: string;
    requestId: string;
}

// ─── KONTEXT STANDARD ────────────────────────────────────────────────────

/**
 * Edit an image using fal.ai FLUX Kontext.
 * For: remove object, replace background, add element.
 *
 * @param imageBase64 - Clean AI image WITHOUT text overlay
 * @param editPrompt - English edit instruction
 * @param falApiKey - fal.ai API key
 */
export async function editWithFalKontext(
    imageBase64: string,
    editPrompt: string,
    falApiKey: string,
): Promise<FalEditResult | null> {
    try {
        fal.config({ credentials: falApiKey });

        // Strip data: prefix if present
        const rawBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        const imageDataUrl = `data:image/jpeg;base64,${rawBase64}`;

        console.log(`✏️ fal.ai Kontext: editing image...`);

        const result = await fal.subscribe("fal-ai/flux-pro/kontext", {
            input: {
                image_url: imageDataUrl,
                prompt: editPrompt,
            },
            logs: true,
            pollInterval: 2000,
            onQueueUpdate: (update) => {
                if (update.status === 'IN_PROGRESS') {
                    console.log(`  fal.ai Kontext progress: ${update.logs?.map(l => l.message).join(' | ') || 'processing...'}`);
                }
            },
        });

        const typedResult = result as any;
        const imageUrl = typedResult.data?.images?.[0]?.url
            || typedResult.images?.[0]?.url;

        if (!imageUrl) {
            console.error('❌ fal.ai Kontext: no image URL in response');
            return null;
        }

        const requestId = typedResult.requestId || typedResult.data?.requestId || 'unknown';

        // Download and convert to base64
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            console.error(`❌ fal.ai Kontext: failed to download edited image: ${imageResponse.status}`);
            return null;
        }

        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const editedBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        console.log(`✅ fal.ai Kontext: edit complete (requestId=${requestId})`);

        return {
            imageBase64: editedBase64,
            requestId: String(requestId),
        };
    } catch (err: any) {
        console.error('❌ fal.ai Kontext editing failed:', err?.message || err);
        return null;
    }
}

// ─── KONTEXT MAX ─────────────────────────────────────────────────────────

/**
 * Edit an image using fal.ai FLUX Kontext Max.
 * For: adding a second person (more reliable for multi-subject).
 *
 * @param imageBase64 - Clean AI image WITHOUT text overlay
 * @param editPrompt - English edit instruction
 * @param falApiKey - fal.ai API key
 */
export async function editWithFalKontextMax(
    imageBase64: string,
    editPrompt: string,
    falApiKey: string,
): Promise<FalEditResult | null> {
    try {
        fal.config({ credentials: falApiKey });

        const rawBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        const imageDataUrl = `data:image/jpeg;base64,${rawBase64}`;

        console.log(`✏️ fal.ai Kontext Max: editing image (multi-subject)...`);

        const result = await fal.subscribe("fal-ai/flux-pro/kontext-max", {
            input: {
                image_url: imageDataUrl,
                prompt: editPrompt,
            },
            logs: true,
            pollInterval: 2000,
            onQueueUpdate: (update) => {
                if (update.status === 'IN_PROGRESS') {
                    console.log(`  fal.ai Kontext Max progress: ${update.logs?.map(l => l.message).join(' | ') || 'processing...'}`);
                }
            },
        });

        const typedResult = result as any;
        const imageUrl = typedResult.data?.images?.[0]?.url
            || typedResult.images?.[0]?.url;

        if (!imageUrl) {
            console.error('❌ fal.ai Kontext Max: no image URL in response');
            return null;
        }

        const requestId = typedResult.requestId || typedResult.data?.requestId || 'unknown';

        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            console.error(`❌ fal.ai Kontext Max: failed to download edited image: ${imageResponse.status}`);
            return null;
        }

        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const editedBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        console.log(`✅ fal.ai Kontext Max: edit complete (requestId=${requestId})`);

        return {
            imageBase64: editedBase64,
            requestId: String(requestId),
        };
    } catch (err: any) {
        console.error('❌ fal.ai Kontext Max editing failed:', err?.message || err);
        return null;
    }
}
