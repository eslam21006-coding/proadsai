// functions/src/modelConfig.ts — provider selector + OpenAI visual model constants

export const MODEL_PROVIDER: "openai" | "gemini" = "openai";

// Phase 22 — copy scoring gate permanent kill switch (FR-019c, FR-019e).
// Flipping this to false restores the pre-feature copy behaviour with no
// code revert and no logic redeploy. The switch is permanent by design:
// it is also how the gate-disabled baseline for SC-002 / SC-004 / SC-005a
// / SC-006 is produced after launch (research R7).
export const COPY_SCORING_ENABLED: boolean = true;

export const OPENAI_VISUAL_MODEL = "gpt-image-2";

export const OPENAI_SIZE_BY_ASPECT: Record<string, string> = {
  "1:1": "1024x1024",
  // 4:5 is not a natively supported gpt-image-2 size. Remap legacy/4:5 requests to the
  // nearest valid portrait canvas (the 3:4 size) so they still render portrait instead of
  // falling back to a square. The live UI now offers 3:4 ("Portrait") rather than 4:5.
  "4:5": "1024x1360",
  "3:4": "1024x1360",
  "9:16": "1024x1792",
  "4:3": "1360x1024",
  "16:9": "1792x1024",
};

// Base timeout for 'medium'/'low' renders (~30-50s typical). High-quality renders take
// 60-90s and, in parallel batch mode, network variance can push a single call past 120s —
// so the high tier gets a longer ceiling (see OPENAI_IMAGE_TIMEOUT_HIGH_MS below).
export const OPENAI_IMAGE_TIMEOUT_MS = 120_000;

// Extended timeout for 'high' quality (hero-photo) renders — 4 minutes. Prevents the
// "OpenAI image generation timed out after 120000ms" failures seen in parallel batch runs.
export const OPENAI_IMAGE_TIMEOUT_HIGH_MS = 240_000;

// Render quality tier for gpt-image-2. 'medium' is materially faster and cheaper
// than 'high' (~30-50s & ~$0.07 vs ~60-90s & ~$0.19) at advertising-acceptable quality.
export const OPENAI_IMAGE_QUALITY: 'low' | 'medium' | 'high' = 'medium';
