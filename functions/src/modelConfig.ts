// functions/src/modelConfig.ts — provider selector + OpenAI visual model constants
// + Gemini model constants (single source of truth — see SC-021).

// ─── GEMINI MODEL CONSTANTS (single source of truth) ─────────────────────
// Phase 22 (SC-021) consolidated these from functions/src/index.ts and
// functions/src/generators.ts. This is now the ONLY place these are defined.
// Reverting the creative endpoints to "gemini-3.1-pro-preview" requires
// editing ONLY these two lines.
//
//   CREATIVE_MODEL_PRO  — First-pass copy/caption generation (highest quality)
//   CREATIVE_MODEL_LITE — Regenerations (currently same string; reserved so
//                         PRO/LITE tuning can diverge later without touching
//                         call sites)
//   LOGIC_MODEL         — Cheap text-only calls (translation, structure,
//                         Arabic QA, concept critique, structured JSON repair)
//   VISUAL_MODEL        — Hero-image generation and region edits
//                         (gemini-3.1-flash-image; -preview endpoint that
//                         testimonialMockup.ts used historically is gone —
//                         drift fixed during SC-021 consolidation)

// REVERT (SC-021): preview copy endpoint used before consolidation.
// export const CREATIVE_MODEL_PRO: string = "gemini-3.1-pro-preview";
// export const CREATIVE_MODEL_LITE: string = "gemini-3.1-pro-preview";
export const CREATIVE_MODEL_PRO: string = "gemini-3.7-flash"; // GA copy endpoint (SC-021)
export const CREATIVE_MODEL_LITE: string = "gemini-3.7-flash"; // GA copy endpoint (SC-021)
export const LOGIC_MODEL: string = "gemini-2.5-flash-lite";
export const VISUAL_MODEL: string = "gemini-3.1-flash-image";

export const MODEL_PROVIDER: "openai" | "gemini" = "openai";

// Phase 22 — copy scoring gate permanent kill switch (FR-019c, FR-019e).
// Flipping this to false restores the pre-feature copy behaviour with no
// code revert and no logic redeploy. The switch is permanent by design:
// it is also how the gate-disabled baseline for SC-002 / SC-004 / SC-005a
// / SC-006 is produced after launch (research R7).
// 2026-08-30: Disabled — the scoring gate rewrites Arabic copy through
// gpt-4o-mini with no Arabic grammar/quality rules, degrading output.
// REVERT: set back to true only after the gate's rewriter prompt
// includes full Arabic copy-quality rules from copywriting_knowledge.ts.
export const COPY_SCORING_ENABLED: boolean = false;

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
