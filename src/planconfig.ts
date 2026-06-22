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
    reflowImage: 5,                // 1 image × 5 credits (HOTFIX-F — superseded by generateSizeVariant for multi-size)
    generateSizeVariant: 5,        // 1 size variant × 5 credits (Phase 17 — reuses generateImage cost)
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
    stripePriceId: { monthly: string; annual: string };
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
        { key: 'creativeScoringEngine', label: 'Predictive CTR Engine', value: f.creativeScoringEngine, category: 'scaling' },
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
        stripePriceId: { monthly: '', annual: '' },
        features: {
            retargeting: false, fantasyUniverses: false, aspectRatios: [], visualPolishes: false, brandUrlScraping: false, competitorResearch: false, carousel: false, batchGeneration: false, maxTeamMembers: 0,
            abVariationTesting: false, regionEditing: false, referenceAdUpload: false, pushToMeta: false, performanceDashboard: 'none', creativeMemory: false, creativeScoringEngine: false, smartRecommendations: false, variantExploration: false, multiBrandWorkspaces: false,
            maxHookAngles: 0, maxHookStyles: 0, maxAdTones: 0, maxCopyStrategies: 0, maxOfferModes: 0, maxObjectionScripts: 0,
            hookAngles: 'full', hookTypes: 'full', copywritingStrategies: 'full', adTones: 'full',
        },
        featureLabels: [],
    },
    starter: {
        id: 'starter', name: 'Starter', subtitle: 'For solopreneurs', monthlyCredits: 800, trialCredits: 50, priceMonthly: 29, priceAnnualPerMonth: 23.20,
        savedProjectLimit: 10, audienceAvatarLimit: 5, carouselMaxSlides: null, batchConfig: null, workspaceLimit: 1,
        stripePriceId: { monthly: 'price_1TTqaDKXgskM9FYIiuhc4KWJ', annual: 'price_1TTqbpKXgskM9FYIs0w4YvML' },
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
        stripePriceId: { monthly: 'price_1TR7S0KXgskM9FYIqJgTQN4z', annual: 'price_1TR7S0KXgskM9FYIFJWukf50' },
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
        stripePriceId: { monthly: 'price_1TTyxMKXgskM9FYIlR7h0sru', annual: 'price_1TTyxsKXgskM9FYIkIfqkIr3' },
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
    { id: 'medium', credits: 300, price: 24, label: '300 Credits' },
    { id: 'large', credits: 800, price: 59, label: '800 Credits' },
] as const;

export const TOPUP_PRICES: Record<number, string> = {
    100: 'price_1TR7yLKXgskM9FYIWCz5CLXA',
    300: 'price_1TR7z9KXgskM9FYI0jb1lrWu',
    800: 'price_1TR80YKXgskM9FYIyV7xAo66',
};

// Frontend mapping of Stripe price IDs to plans. Built at module load from the PLANS
// table above. There is a SEPARATE backend mapping in
// functions/src/stripe/stripeClient.ts (STRIPE_PRICE_TO_PLAN) used by webhook handlers.
// The two are independent and MUST be kept in sync manually — whenever you change a
// Stripe price ID or plan key here, update functions/src/stripe/stripeClient.ts to
// match, otherwise Checkout will succeed but the webhook will reject the price as
// `stripe_price_unmapped`.
export const STRIPE_PRICE_TO_PLAN: Record<string, { plan: keyof typeof PLANS; billingType: 'monthly' | 'annual' }> = {};
for (const [planId, config] of Object.entries(PLANS)) {
    if (planId === 'none') continue;
    const c = config as PlanConfig;
    if (c.stripePriceId?.monthly) {
        STRIPE_PRICE_TO_PLAN[c.stripePriceId.monthly] = { plan: planId as keyof typeof PLANS, billingType: 'monthly' };
    }
    if (c.stripePriceId?.annual) {
        STRIPE_PRICE_TO_PLAN[c.stripePriceId.annual] = { plan: planId as keyof typeof PLANS, billingType: 'annual' };
    }
}

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
