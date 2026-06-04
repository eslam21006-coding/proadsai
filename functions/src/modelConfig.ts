// functions/src/modelConfig.ts — provider selector + OpenAI visual model constants

export const MODEL_PROVIDER: "openai" | "gemini" = "openai";

export const OPENAI_VISUAL_MODEL = "gpt-image-2";

export const OPENAI_SIZE_BY_ASPECT: Record<string, string> = {
  "1:1": "1024x1024",
  "4:5": "1024x1280",
  "3:4": "1024x1360",
  "9:16": "1024x1792",
  "4:3": "1360x1024",
  "16:9": "1792x1024",
};

export const OPENAI_IMAGE_TIMEOUT_MS = 120_000;

// Render quality tier for gpt-image-2. 'medium' is materially faster and cheaper
// than 'high' (~30-50s & ~$0.07 vs ~60-90s & ~$0.19) at advertising-acceptable quality.
export const OPENAI_IMAGE_QUALITY: 'low' | 'medium' | 'high' = 'medium';
