// functions/src/openAIImageCaller.ts — drop-in GeminiCaller backed by OpenAI gpt-image-2

import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import {
  OPENAI_VISUAL_MODEL,
  OPENAI_SIZE_BY_ASPECT,
  OPENAI_IMAGE_TIMEOUT_MS,
  OPENAI_IMAGE_TIMEOUT_HIGH_MS,
  OPENAI_IMAGE_QUALITY,
} from "./modelConfig.js";
import type { GeminiCaller } from "./generators.js";

export function createOpenAIImageCaller(apiKey: string): GeminiCaller {
  return async (params) => {
    const client = new OpenAI({ apiKey });

    // 1. Extract & concatenate text parts → prompt
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string }; _isPersonalPhoto?: boolean }> =
      params.contents?.parts ?? [];
    const textParts: string[] = [];
    const refs: Array<{ buf: Buffer; isPersonalPhoto: boolean }> = [];
    for (const p of parts) {
      if (p.text) textParts.push(p.text);
      if (p.inlineData?.data) {
        refs.push({ buf: Buffer.from(p.inlineData.data, "base64"), isPersonalPhoto: p._isPersonalPhoto === true });
      }
    }
    const prompt = textParts.join("\n");

    // Safety net: gpt-image-2 enforces a 32,000-char prompt limit. Fail loud and early
    // (refund via the callable's catch) rather than letting the API reject the request.
    console.log('[OpenAI] prompt length:', prompt.length);
    if (prompt.length > 31500) {
      console.error("[openAI] Prompt still over limit:", prompt.length);
      throw new Error(`Prompt too long: ${prompt.length} chars (max 31500)`);
    }

    // 2. Resolve size from aspect ratio
    const aspectRatio: string = params.config?.imageConfig?.aspectRatio ?? "1:1";
    const size = OPENAI_SIZE_BY_ASPECT[aspectRatio] ?? "1024x1024";

    // Quality is fixed at OPENAI_IMAGE_QUALITY ('medium') for EVERY render — generation,
    // edit, and reflow alike. The earlier adaptive-'high'-for-refs path was reverted: face
    // sharpness across resizes is solved by always reflowing from the ORIGINAL generation
    // (App.tsx), not by bumping the quality tier (which also caused batch timeouts).
    const quality = OPENAI_IMAGE_QUALITY;

    // edit path needs longer ceiling — multi-ref upload adds latency before generation.
    // (The previous quality === 'high' condition was dead code: quality is fixed 'medium',
    // so edit calls with several reference images were racing the 120s base timeout.)
    const timeout = refs.length > 0 ? OPENAI_IMAGE_TIMEOUT_HIGH_MS : OPENAI_IMAGE_TIMEOUT_MS;

    // 3. Abort controller for timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      let b64Json: string | undefined;

      if (refs.length > 0) {
        // images.edit seeded with the hero reference image(s).
        // gpt-image-2 images.edit accepts multiple input images — pass ALL refs
        // for face-fidelity parity with the Gemini path (FR-016). The SDK requires
        // Uploadable File objects, so convert each base64 Buffer via toFile().
        // Personal photos (marked _isPersonalPhoto upstream) are re-compressed to
        // 512px JPEG q70 — face identity survives the downscale and the smaller
        // upload payload cuts edit-call latency. Logos, Box C assets, and style
        // references keep their original resolution. Fail-soft: on a Sharp error
        // the original buffer is uploaded unchanged.
        const imageFiles = await Promise.all(
          refs.map(async ({ buf, isPersonalPhoto }, i) => {
            if (isPersonalPhoto) {
              try {
                const small = await sharp(buf)
                  .resize(512, 512, { fit: "inside", withoutEnlargement: true })
                  .jpeg({ quality: 70 })
                  .toBuffer();
                return toFile(small, `ref_${i}.jpg`, { type: "image/jpeg" });
              } catch (err) {
                console.warn(`[openAI] hero photo recompress failed (ref ${i}); uploading original:`, err);
              }
            }
            return toFile(buf, `ref_${i}.png`, { type: "image/png" });
          }),
        );
        // gpt-image models always return b64_json and reject the response_format param.
        const response = await client.images.edit(
          {
            model: OPENAI_VISUAL_MODEL,
            image: imageFiles,
            prompt,
            size: size as any,
            quality,
          },
          { signal: controller.signal },
        );
        b64Json = response.data?.[0]?.b64_json;
      } else {
        // Pure generation — gpt-image models always return b64_json (no response_format).
        const response = await client.images.generate(
          {
            model: OPENAI_VISUAL_MODEL,
            prompt,
            size: size as any,
            quality,
          },
          { signal: controller.signal },
        );
        b64Json = response.data?.[0]?.b64_json;
      }

      if (!b64Json) {
        throw new Error("OpenAI returned empty image data");
      }

      // Return the same shape as createGeminiCaller — raw base64, no data: prefix
      return {
        text: undefined,
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: b64Json,
                  },
                },
              ],
            },
          },
        ],
      };
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === "AbortError" || err?.name === "APIUserAbortError") {
        throw new Error(
          `OpenAI image generation timed out after ${timeout}ms`,
        );
      }
      throw new Error(
        `OpenAI image generation failed: ${err?.message || err}`,
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
