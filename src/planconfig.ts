// src/planconfig.ts — central configuration for all plan tiers, credit costs, and feature access
// Single source of truth for monetization logic (Principle XI).
//
// PLAN MODEL:
//   - There are exactly 3 paid plans: starter, pro, scale
//   - Every user is on one of these 3 plans or 'none' (cancelled / no active subscription)
//   - Trial: user is on a real plan with full features, but only 50 credits (no reset)
//   - Paid: user is on the same plan with full credits (monthly reset)
//   - 'none' = cancelled / no active subscription — blocked from everything
//   - There is NO 'free' plan

export type UserPlan = 'none' | 'starter' | 'pro' | 'scale';

// ─── CREDIT COSTS PER ACTION ─────────────────────────────────────────────────
// All costs are strictly linear: unit cost × count. No bundling, no discounts.
// See creditCost.ts for unit cost definitions and helper functions.
export const CREDIT_COSTS = {
    generateHooks: 4,              // 4 hooks × 1 credit
    refreshHooks: 4,               // 4 hooks × 1 credit
    editOneHook: 1,                // 1 hook × 1 credit
    generateConcepts: 3,           // 3 concepts × 1 credit
    editOneConcept: 1,             // 1 concept × 1 credit
    buildPlan: 0,                  // free
    generateImage: 5,              // 1 image × 5 credits
    polishImage: 5,                // 1 image × 5 credits
    reflowImage: 5,                // 1 image × 5 credits
    analyzePolishes: 1,            // 1 analysis × 1 credit
    generateCaption: 1,            // 1 copy × 1 credit
    refineCaption: 1,              // 1 refinement × 1 credit
    competitorResearch: 5,         // 1 research × 5 credits
    generateCarouselCopies: 1,     // 1 slide copy × 1 credit (use count param for N slides)
    brandUrlScraping: 3,           // 1 URL analysis × 3 credits (cached = 0)
    editRegion: 5,                 // 1 region edit × 5 credits
} as const;

// ─── ADS-PER-CREDIT CONSTANT ──────────────────────────────────────────────────
// 4 hooks + 3 concepts + 5 image + 1 caption + polish + reflow + extras ≈ 20 credits for a single-size ad
export const CREDITS_PER_AD = 20;

// ─── FEATURE LABEL (for pricing table rendering) ──────────────────────────────
export interface FeatureLabel {
    key: string;
    label: string;
    value: string | boolean;
    category: 'core' | 'creative' | 'advanced' | 'limits' | 'scaling';
}

// ─── BATCH CONFIG (per-plan batch limits) ─────────────────────────────────────
export interface BatchConfig {
    maxSizes: number;
    maxHooks: number;
    maxConcepts: number;
    maxAdsPerRun: number;
}

// ─── PLAN DEFINITIONS ────────────────────────────────────────────────────────
export interface PlanConfig {
    id: UserPlan;
    name: string;
    subtitle: string;
    monthlyCredits: number;
    trialCredits: number;
    priceMonthly: number;
    priceAnnualPerMonth: number;
    savedProjectLimit: number;
    audienceAvatarLimit: number;
    carouselMaxSlides: number | null;
    batchConfig: BatchConfig | null;
    paddlePriceId: { monthly: string; yearly: string };
    features: {
        retargeting: boolean;
        fantasyUniverses: boolean;
        aspectRatios: string[];
        visualPolishes: boolean;
        brandUrlScraping: boolean;
        competitorResearch: boolean;
        carousel: boolean;
        batchGeneration: boolean;
        maxTeamMembers: number;
        // ── New feature gates ──
        abVariationTesting: boolean;
        regionEditing: boolean;
        referenceAdUpload: boolean;
        pushToMeta: boolean;
        performanceDashboard: 'none' | 'overview' | 'full';
        creativeMemory: boolean;
        creativeScoringEngine: boolean;
        smartRecommendations: boolean;
        variantExploration: boolean;
        multiBrandWorkspaces: boolean;
        // ── Tiered AI engine limits ──
        maxHookAngles: number;
        maxHookStyles: number;
        maxAdTones: number;
        maxCopyStrategies: number;
        maxOfferModes: number;
        maxObjectionScripts: number;
        // ── Ungated creative library — literal 'full' on every paid plan (HF.2) ──
        hookAngles: 'full';
        hookTypes: 'full';
        copywritingStrategies: 'full';
        adTones: 'full';
    };
    workspaceLimit: number;
    featureLabels: FeatureLabel[];
}

// ─── FEATURE LABEL BUILDER ────────────────────────────────────────────────────
function buildFeatureLabels(plan: {
    savedProjectLimit: number;
    audienceAvatarLimit: number;
    carouselMaxSlides: number | null;
    features: PlanConfig['features'];
}): FeatureLabel[] {
    const f = plan.features;
    const slides = plan.carouselMaxSlides ?? 0;
    const team = f.maxTeamMembers;
    return [
        // Core
        { key: 'generateAds', label: 'Generate Ads', value: true, category: 'core' },
        { key: 'aspectRatios', label: 'Multiple Aspect Ratios', value: true, category: 'core' },
        { key: 'savedProjects', label: 'Saved Projects', value: plan.savedProjectLimit === Infinity ? 'Unlimited' : String(plan.savedProjectLimit), category: 'core' },
        { key: 'avatars', label: 'Audience Avatars', value: plan.audienceAvatarLimit === Infinity ? 'Unlimited' : String(plan.audienceAvatarLimit), category: 'core' },
        // Creative Tools
        { key: 'brandUrlScraping', label: 'Brand URL Scraping', value: f.brandUrlScraping, category: 'creative' },
        { key: 'retargeting', label: 'Retargeting Mode', value: f.retargeting, category: 'creative' },
        { key: 'fantasyUniverses', label: 'Fantasy Universes', value: f.fantasyUniverses, category: 'creative' },
        { key: 'visualPolishes', label: 'Auto-Optimized Creatives', value: f.visualPolishes, category: 'creative' },
        { key: 'abVariationTesting', label: 'A/B Variation Testing', value: f.abVariationTesting, category: 'creative' },
        { key: 'regionEditing', label: 'Region Editing', value: f.regionEditing, category: 'creative' },
        { key: 'referenceAdUpload', label: 'Reference Ad Upload', value: f.referenceAdUpload, category: 'creative' },
        // Advanced
        { key: 'carousel', label: 'Carousel Ads', value: f.carousel ? `up to ${slides} slides` : false, category: 'advanced' },
        { key: 'competitorResearch', label: 'Competitor Intelligence', value: f.competitorResearch, category: 'advanced' },
        { key: 'pushToMeta', label: 'Push to Meta Ads', value: f.pushToMeta, category: 'advanced' },
        { key: 'creativeMemory', label: 'Creative Memory', value: f.creativeMemory, category: 'advanced' },
        { key: 'performanceDashboard', label: 'Performance Dashboard', value: f.performanceDashboard === 'none' ? false : f.performanceDashboard === 'full' ? 'Full breakdown' : 'Overview', category: 'advanced' },
        { key: 'batchGeneration', label: 'Batch Generation', value: f.batchGeneration, category: 'advanced' },
        // Scaling Exclusives
        { key: 'creativeScoringEngine', label: 'Creative Scoring Engine', value: f.creativeScoringEngine, category: 'scaling' },
        { key: 'smartRecommendations', label: 'Smart Recommendations', value: f.smartRecommendations, category: 'scaling' },
        { key: 'variantExploration', label: 'Variant Exploration Engine', value: f.variantExploration, category: 'scaling' },
        { key: 'multiBrandWorkspaces', label: 'Multi-Brand Workspaces', value: f.multiBrandWorkspaces, category: 'scaling' },
        // Limits
        { key: 'maxTeamMembers', label: 'Max Team Members', value: team >= 10 ? '10+' : String(team), category: 'limits' },
        { key: 'hookAngles', label: 'Hook Angles', value: f.hookAngles === 'full' ? 'All' : String(f.maxHookAngles), category: 'limits' },
        { key: 'hookStyles', label: 'Hook Delivery Styles', value: f.hookTypes === 'full' ? 'All' : String(f.maxHookStyles), category: 'limits' },
        { key: 'adTones', label: 'Ad Tones', value: f.adTones === 'full' ? 'All' : String(f.maxAdTones), category: 'limits' },
        { key: 'copyStrategies', label: 'Copywriting Strategies', value: f.copywritingStrategies === 'full' ? 'All' : String(f.maxCopyStrategies), category: 'limits' },
        { key: 'offerModes', label: 'Offer Creative Modes', value: String(f.maxOfferModes), category: 'limits' },
        { key: 'objectionScripts', label: 'Objection Scripts', value: f.maxObjectionScripts === 0 ? false : String(f.maxObjectionScripts), category: 'limits' },
    ];
}

const ALL_RATIOS = ['1:1', '4:5', '3:4', '4:3', '9:16', '16:9'];

export const PLANS: Record<UserPlan, PlanConfig> = {
    none: {
        id: 'none', name: 'No Plan', subtitle: '', monthlyCredits: 0, trialCredits: 0, priceMonthly: 0, priceAnnualPerMonth: 0,
        savedProjectLimit: 0, audienceAvatarLimit: 0, carouselMaxSlides: null, batchConfig: null, workspaceLimit: 1,
        paddlePriceId: { monthly: '', yearly: '' },
        features: {
            retargeting: false, fantasyUniverses: false, aspectRatios: [], visualPolishes: false, brandUrlScraping: false, competitorResearch: false, carousel: false, batchGeneration: false, maxTeamMembers: 0,
            abVariationTesting: false, regionEditing: false, referenceAdUpload: false, pushToMeta: false, performanceDashboard: 'none', creativeMemory: false, creativeScoringEngine: false, smartRecommendations: false, variantExploration: false, multiBrandWorkspaces: false,
            maxHookAngles: 0, maxHookStyles: 0, maxAdTones: 0, maxCopyStrategies: 0, maxOfferModes: 0, maxObjectionScripts: 0,
            hookAngles: 'full', hookTypes: 'full', copywritingStrategies: 'full', adTones: 'full',
        },
        featureLabels: [],
    },
    starter: {
        id: 'starter', name: 'Starter', subtitle: 'For solopreneurs', monthlyCredits: 800, trialCredits: 50, priceMonthly: 19, priceAnnualPerMonth: 15.20,
        savedProjectLimit: 10, audienceAvatarLimit: 5, carouselMaxSlides: null, batchConfig: null, workspaceLimit: 1,
        paddlePriceId: { monthly: 'pri_01knz7v1rr3eehbe12s214ba0t', yearly: 'pri_01knz7wz5cpvv2fx6334wv822e' },
        features: {
            retargeting: false, fantasyUniverses: false, aspectRatios: ALL_RATIOS, visualPolishes: false, brandUrlScraping: true, competitorResearch: false, carousel: false, batchGeneration: false, maxTeamMembers: 1,
            abVariationTesting: false, regionEditing: false, referenceAdUpload: false, pushToMeta: false, performanceDashboard: 'none', creativeMemory: false, creativeScoringEngine: false, smartRecommendations: false, variantExploration: false, multiBrandWorkspaces: false,
            maxHookAngles: 11, maxHookStyles: 12, maxAdTones: 11, maxCopyStrategies: 8, maxOfferModes: 6, maxObjectionScripts: 0,
            hookAngles: 'full', hookTypes: 'full', copywritingStrategies: 'full', adTones: 'full',
        },
        featureLabels: [],
    },
    pro: {
        id: 'pro', name: 'Pro', subtitle: 'For serious marketers', monthlyCredits: 2500, trialCredits: 50, priceMonthly: 79, priceAnnualPerMonth: 63.20,
        savedProjectLimit: 30, audienceAvatarLimit: 15, carouselMaxSlides: 7, workspaceLimit: 1,
        batchConfig: { maxSizes: 1, maxHooks: 2, maxConcepts: 2, maxAdsPerRun: 4 },
        paddlePriceId: { monthly: 'pri_01knz7zpgfbek52zm0n012jqn0', yearly: 'pri_01knz82jwdxjph1mpny39jnxqg' },
        features: {
            retargeting: true, fantasyUniverses: true, aspectRatios: ALL_RATIOS, visualPolishes: true, brandUrlScraping: true, competitorResearch: true, carousel: true, batchGeneration: true, maxTeamMembers: 3,
            abVariationTesting: true, regionEditing: true, referenceAdUpload: true, pushToMeta: true, performanceDashboard: 'overview', creativeMemory: true, creativeScoringEngine: false, smartRecommendations: false, variantExploration: false, multiBrandWorkspaces: false,
            maxHookAngles: 11, maxHookStyles: 12, maxAdTones: 11, maxCopyStrategies: 8, maxOfferModes: 21, maxObjectionScripts: 12,
            hookAngles: 'full', hookTypes: 'full', copywritingStrategies: 'full', adTones: 'full',
        },
        featureLabels: [],
    },
    scale: {
        id: 'scale', name: 'Scale', subtitle: 'For high-volume ad testing', monthlyCredits: 6500, trialCredits: 50, priceMonthly: 179, priceAnnualPerMonth: 143.20,
        savedProjectLimit: Infinity, audienceAvatarLimit: Infinity, carouselMaxSlides: 10, workspaceLimit: 10,
        batchConfig: { maxSizes: 3, maxHooks: 4, maxConcepts: 3, maxAdsPerRun: 36 },
        paddlePriceId: { monthly: 'pri_01knz80jr5m4ey3wrskpvgbrh4', yearly: 'pri_01knz81pexff8h8wbwq44cy0j3' },
        features: {
            retargeting: true, fantasyUniverses: true, aspectRatios: ALL_RATIOS, visualPolishes: true, brandUrlScraping: true, competitorResearch: true, carousel: true, batchGeneration: true, maxTeamMembers: 10,
            abVariationTesting: true, regionEditing: true, referenceAdUpload: true, pushToMeta: true, performanceDashboard: 'full', creativeMemory: true, creativeScoringEngine: true, smartRecommendations: true, variantExploration: true, multiBrandWorkspaces: true,
            maxHookAngles: 11, maxHookStyles: 12, maxAdTones: 11, maxCopyStrategies: 8, maxOfferModes: 21, maxObjectionScripts: 12,
            hookAngles: 'full', hookTypes: 'full', copywritingStrategies: 'full', adTones: 'full',
        },
        featureLabels: [],
    },
};

// Populate featureLabels after plan objects are defined
for (const key of Object.keys(PLANS) as UserPlan[]) {
    if (key !== 'none') {
        PLANS[key].featureLabels = buildFeatureLabels(PLANS[key]);
    }
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────
export const isPaidPlan = (plan: UserPlan): plan is 'starter' | 'pro' | 'scale' => {
    return plan !== 'none';
};

export const canUse = (plan: UserPlan, feature: keyof PlanConfig['features']): boolean => {
    if (plan === 'none') return false;
    const val = PLANS[plan]?.features[feature];
    if (val === undefined || val === null) return false;
    if (typeof val === 'string') return val !== 'none';
    if (typeof val === 'number') return val > 0;
    if (Array.isArray(val)) return val.length > 0;
    return !!val;
};

export const canUseRatio = (plan: UserPlan, ratio: string): boolean => {
    if (plan === 'none') return false;
    return PLANS[plan]?.features.aspectRatios.includes(ratio) ?? false;
};

/** Get the string level of a tiered feature (e.g. performanceDashboard). */
export const getFeatureLevel = (plan: UserPlan, feature: 'performanceDashboard'): 'none' | 'overview' | 'full' => {
    if (plan === 'none') return 'none';
    return PLANS[plan]?.features[feature] ?? 'none';
};

/** Get the numeric limit of a tiered feature (e.g. maxHookAngles). */
type NumericFeature = 'maxHookAngles' | 'maxHookStyles' | 'maxAdTones' | 'maxCopyStrategies' | 'maxOfferModes' | 'maxObjectionScripts' | 'maxTeamMembers';
export const getFeatureLimit = (plan: UserPlan, feature: NumericFeature): number => {
    if (plan === 'none') return 0;
    return PLANS[plan]?.features[feature] ?? 0;
};

export const getSavedProjectLimit = (plan: UserPlan): number => {
    if (plan === 'none') return 0;
    return PLANS[plan]?.savedProjectLimit ?? 0;
};

export const getAudienceAvatarLimit = (plan: UserPlan): number => {
    if (plan === 'none') return 0;
    return PLANS[plan]?.audienceAvatarLimit ?? 0;
};

export const requiredPlanFor = (feature: keyof PlanConfig['features']): string => {
    // Starter-level
    if (feature === 'brandUrlScraping') return 'Starter';
    // Pro-level (includes features formerly gated at Creator tier)
    if (feature === 'fantasyUniverses' || feature === 'visualPolishes' || feature === 'retargeting') return 'Pro';
    if (feature === 'abVariationTesting' || feature === 'regionEditing') return 'Pro';
    if (feature === 'carousel' || feature === 'competitorResearch') return 'Pro';
    if (feature === 'referenceAdUpload' || feature === 'pushToMeta' || feature === 'creativeMemory' || feature === 'performanceDashboard') return 'Pro';
    if (feature === 'batchGeneration') return 'Pro';
    // Scale-level
    if (feature === 'creativeScoringEngine' || feature === 'smartRecommendations' || feature === 'variantExploration' || feature === 'multiBrandWorkspaces') return 'Scale';
    return 'Starter';
};

export const requiredPlanForRatio = (_ratio: string): string => {
    return 'Starter';
};

export const hasCredits = (currentCredits: number, action: keyof typeof CREDIT_COSTS, count = 1): boolean => {
    return currentCredits >= CREDIT_COSTS[action] * count;
};

export const getMaxSlides = (plan: UserPlan): number => {
    return PLANS[plan]?.carouselMaxSlides ?? 0;
};

export const getApproxAdsPerMonth = (plan: PlanConfig): number => {
    return Math.floor(plan.monthlyCredits / CREDITS_PER_AD);
};

/** Whether exported images should show Pro Ads AI branding (trial only). */
export const showBranding = (_plan: UserPlan, isTrial: boolean): boolean => isTrial;

// ─── CREDIT TOP-UP PACKS ────────────────────────────────────────────────────
export const TOPUP_PACKS = [
    { id: 'small', credits: 100, price: 9, label: '100 Credits' },
    { id: 'medium', credits: 300, price: 17, label: '300 Credits' },
    { id: 'large', credits: 800, price: 39, label: '800 Credits' },
] as const;

export const PADDLE_TOPUP_PRICE_IDS: Record<number, string> = {
    100: 'pri_01knz87qc1ezrb84gtffpmtjdq',
    300: 'pri_01knz898vrhxyge632scazjn2z',
    800: 'pri_01knz8a0s0f2je5rgrk2y62b0n',
};

// ─── RE-EXPORT CREDIT COST HELPERS ─────────────────────────────────────────
export {
    UNIT_COSTS,
    HOOKS_PER_GENERATION,
    CONCEPTS_PER_GENERATION,
    getHookCost,
    getConceptCost,
    getCopyCost,
    getCopyRefinementCost,
    getImageCost,
    getRegenerationCost,
    getCarouselCopyCost,
    getBrandScrapeCost,
    getCompetitorCost,
} from './creditCost';
