// creditCost.ts
// Centralized credit cost definitions and calculation helpers.
// All costs are strictly linear — no bundling, no batch discounts.
//
// RULE: Every action costs a fixed number of credits per unit.
//       Total cost = unit cost × count.
//       No exceptions.

// ─── UNIT COSTS (per individual action) ────────────────────────────────────
export const UNIT_COSTS = {
    concept: 1,              // 1 credit per concept
    hook: 1,                 // 1 credit per hook
    copy: 1,                 // 1 credit per copy generation
    copyRefinement: 1,       // 1 credit per refinement submission
    image: 5,                // 5 credits per image render
    polish: 5,               // 5 credits per polish render
    reflow: 5,               // 5 credits per reflow render
    analyzePolishes: 1,      // 1 credit per polish analysis
    editRegion: 5,           // 5 credits per region edit
    brandUrlScraping: 3,     // 3 credits first use per URL (cached = 0)
    competitorIntelligence: 5, // 5 credits per research
    carouselCopy: 1,         // 1 credit per carousel slide copy
} as const;

// ─── STANDARD COUNTS ───────────────────────────────────────────────────────
export const HOOKS_PER_GENERATION = 4;
export const CONCEPTS_PER_GENERATION = 3;

// ─── HELPER FUNCTIONS ──────────────────────────────────────────────────────

/** Cost to generate hooks: count × 1 credit per hook */
export const getHookCost = (count: number = HOOKS_PER_GENERATION): number =>
    count * UNIT_COSTS.hook;

/** Cost to generate concepts: count × 1 credit per concept */
export const getConceptCost = (count: number = CONCEPTS_PER_GENERATION): number =>
    count * UNIT_COSTS.concept;

/** Cost to generate final copy: 1 credit */
export const getCopyCost = (): number => UNIT_COSTS.copy;

/** Cost to refine copy: 1 credit per refinement */
export const getCopyRefinementCost = (): number => UNIT_COSTS.copyRefinement;

/** Cost to render images: imageCount × sizeCount × 5 credits */
export const getImageCost = (imageCount: number, sizeCount: number = 1): number =>
    imageCount * sizeCount * UNIT_COSTS.image;

/** Cost to regenerate an image: 5 credits (same as original) */
export const getRegenerationCost = (): number => UNIT_COSTS.image;

/** Cost to generate carousel slide copies: slideCount × 1 credit per slide */
export const getCarouselCopyCost = (slideCount: number): number =>
    slideCount * UNIT_COSTS.carouselCopy;

/** Cost for brand URL scraping: 3 credits (first use per URL, cached = 0) */
export const getBrandScrapeCost = (): number => UNIT_COSTS.brandUrlScraping;

/** Cost for competitor intelligence: 5 credits */
export const getCompetitorCost = (): number => UNIT_COSTS.competitorIntelligence;
