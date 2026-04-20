// functions/src/entitlements.ts — server-side plan/credit entitlement resolution
// SINGLE SOURCE OF TRUTH for plan entitlements (backend).
// Every backend function that checks plan, features, or credits MUST use this.
//
// PLAN MODEL:
//   - 3 paid plans: starter, pro, scale
//   - Trial: plan='starter' (or any), isTrial=true, credits=50, features=full
//   - Paid:  plan='starter' (or any), isTrial=false, credits=plan amount
//   - Cancelled: plan='none', credits=0, blocked from everything
//   - There is NO 'free' plan

import * as admin from "firebase-admin";

function getDb() { return admin.firestore(); }

// ─── PLAN TYPES ─────────────────────────────────────────────────────────────
export type BasePlan = "starter" | "pro" | "scale";
export type StoredPlan = BasePlan | "none";

// ─── FEATURE SET ────────────────────────────────────────────────────────────
export interface PlanFeatures {
    retargeting: boolean;
    carousel: boolean;
    competitorResearch: boolean;
    batchGeneration: boolean;
    fantasyUniverses: boolean;
    visualPolishes: boolean;
    brandUrlScraping: boolean;
    maxCarouselSlides: number;
    maxTeamMembers: number;
    aspectRatios: string[];
    // ── New feature gates ──
    abVariationTesting: boolean;
    regionEditing: boolean;
    referenceAdUpload: boolean;
    pushToMeta: boolean;
    performanceDashboard: "none" | "overview" | "full";
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
}

// ─── RESOLVED ENTITLEMENT ───────────────────────────────────────────────────
export interface ResolvedEntitlement {
    basePlan: StoredPlan;
    isTrial: boolean;
    creditsPerMonth: number;
    features: PlanFeatures;
    teamCreditPoolShared: true;
    /** The UID whose credit pool to use (owner for team members, self for owners) */
    creditOwnerUid: string;
}

// ─── PLAN FEATURE DEFINITIONS ───────────────────────────────────────────────
const PLAN_FEATURES: Record<BasePlan, PlanFeatures> = {
    starter: {
        retargeting: false,
        carousel: false,
        competitorResearch: false,
        batchGeneration: false,
        fantasyUniverses: false,
        visualPolishes: false,
        brandUrlScraping: true,
        maxCarouselSlides: 0,
        maxTeamMembers: 1,
        aspectRatios: ["1:1", "4:5", "3:4", "4:3", "9:16", "16:9"],
        abVariationTesting: false,
        regionEditing: false,
        referenceAdUpload: false,
        pushToMeta: false,
        performanceDashboard: "none",
        creativeMemory: false,
        creativeScoringEngine: false,
        smartRecommendations: false,
        variantExploration: false,
        multiBrandWorkspaces: false,
        maxHookAngles: 11,
        maxHookStyles: 12,
        maxAdTones: 11,
        maxCopyStrategies: 8,
        maxOfferModes: 6,
        maxObjectionScripts: 0,
    },
    pro: {
        retargeting: true,
        carousel: true,
        competitorResearch: true,
        batchGeneration: true,
        fantasyUniverses: true,
        visualPolishes: true,
        brandUrlScraping: true,
        maxCarouselSlides: 7,
        maxTeamMembers: 3,
        aspectRatios: ["1:1", "4:5", "3:4", "4:3", "9:16", "16:9"],
        abVariationTesting: true,
        regionEditing: true,
        referenceAdUpload: true,
        pushToMeta: true,
        performanceDashboard: "overview",
        creativeMemory: true,
        creativeScoringEngine: false,
        smartRecommendations: false,
        variantExploration: false,
        multiBrandWorkspaces: false,
        maxHookAngles: 11,
        maxHookStyles: 12,
        maxAdTones: 11,
        maxCopyStrategies: 8,
        maxOfferModes: 21,
        maxObjectionScripts: 12,
    },
    scale: {
        retargeting: true,
        carousel: true,
        competitorResearch: true,
        batchGeneration: true,
        fantasyUniverses: true,
        visualPolishes: true,
        brandUrlScraping: true,
        maxCarouselSlides: 10,
        maxTeamMembers: 10,
        aspectRatios: ["1:1", "4:5", "3:4", "4:3", "9:16", "16:9"],
        abVariationTesting: true,
        regionEditing: true,
        referenceAdUpload: true,
        pushToMeta: true,
        performanceDashboard: "full",
        creativeMemory: true,
        creativeScoringEngine: true,
        smartRecommendations: true,
        variantExploration: true,
        multiBrandWorkspaces: true,
        maxHookAngles: 11,
        maxHookStyles: 12,
        maxAdTones: 11,
        maxCopyStrategies: 8,
        maxOfferModes: 21,
        maxObjectionScripts: 12,
    },
};

const NONE_FEATURES: PlanFeatures = {
    retargeting: false,
    carousel: false,
    competitorResearch: false,
    batchGeneration: false,
    fantasyUniverses: false,
    visualPolishes: false,
    brandUrlScraping: false,
    maxCarouselSlides: 0,
    maxTeamMembers: 0,
    aspectRatios: [],
    abVariationTesting: false,
    regionEditing: false,
    referenceAdUpload: false,
    pushToMeta: false,
    performanceDashboard: "none",
    creativeMemory: false,
    creativeScoringEngine: false,
    smartRecommendations: false,
    variantExploration: false,
    multiBrandWorkspaces: false,
    maxHookAngles: 0,
    maxHookStyles: 0,
    maxAdTones: 0,
    maxCopyStrategies: 0,
    maxOfferModes: 0,
    maxObjectionScripts: 0,
};

const PLAN_CREDITS: Record<BasePlan, number> = {
    starter: 800,
    pro: 2500,
    scale: 6500,
};

const TRIAL_CREDITS = 50;

// ═══════════════════════════════════════════════════════════
// ENTITLEMENT RESOLVER (contracts/entitlement-resolver.md)
// ═══════════════════════════════════════════════════════════

export type FeatureName =
    | "retargeting"
    | "fantasyUniverse"
    | "artDirection"
    | "batch"
    | "carousel"
    | "referenceAds"
    | "carouselSlides"
    | "batchRun"
    | "teamInvite"
    | "savedProjectSave"
    | "audienceAvatarCreate"
    | "hookAngles"
    | "hookTypes"
    | "copywritingStrategies"
    | "adTones";

export type EntitlementDenialReason =
    | "plan_none"
    | "pro_plan_required"
    | "scale_plan_required"
    | "batch_limit_exceeded"
    | "carousel_limit_exceeded"
    | "team_limit_exceeded"
    | "saved_project_limit_exceeded"
    | "avatar_limit_exceeded";

export interface EntitlementDecision {
    allowed: boolean;
    reason?: EntitlementDenialReason;
    limit?: number;
}

export interface EntitlementInput {
    plan: StoredPlan;
    feature: FeatureName;
    quantity?: number;
}

const BOOLEAN_GATES: FeatureName[] = [
    "retargeting", "fantasyUniverse", "artDirection", "batch", "carousel", "referenceAds",
];

const ALWAYS_ALLOWED: FeatureName[] = [
    "hookAngles", "hookTypes", "copywritingStrategies", "adTones",
];

const PLAN_CREDIT_LIMITS: Record<string, { carouselMaxSlides: number; batchMaxAds: number; teamLimit: number; savedProjectLimit: number; avatarLimit: number }> = {
    starter: { carouselMaxSlides: 0, batchMaxAds: 0, teamLimit: 1, savedProjectLimit: 10, avatarLimit: 5 },
    pro: { carouselMaxSlides: 7, batchMaxAds: 4, teamLimit: 3, savedProjectLimit: 30, avatarLimit: 15 },
    scale: { carouselMaxSlides: 10, batchMaxAds: 36, teamLimit: 10, savedProjectLimit: Infinity, avatarLimit: Infinity },
};

const PRO_REQUIRED_FEATURES: Set<FeatureName> = new Set([
    "retargeting", "fantasyUniverse", "artDirection", "batch", "carousel", "referenceAds",
    "carouselSlides", "batchRun",
]);

export function resolveEntitlement(input: EntitlementInput): EntitlementDecision {
    const { plan, feature, quantity } = input;

    if (plan === "none") {
        return { allowed: false, reason: "plan_none" };
    }

    if (ALWAYS_ALLOWED.includes(feature)) {
        return { allowed: true };
    }

    if (BOOLEAN_GATES.includes(feature)) {
        if (plan === "starter") {
            return { allowed: false, reason: "pro_plan_required" };
        }
        return { allowed: true };
    }

    const limits = PLAN_CREDIT_LIMITS[plan];
    if (!limits) {
        return { allowed: false, reason: "plan_none" };
    }

    switch (feature) {
        case "carouselSlides": {
            if (limits.carouselMaxSlides === 0) {
                return { allowed: false, reason: "pro_plan_required", limit: 0 };
            }
            const q = quantity ?? 0;
            if (q > limits.carouselMaxSlides) {
                return { allowed: false, reason: "carousel_limit_exceeded", limit: limits.carouselMaxSlides };
            }
            return { allowed: true, limit: limits.carouselMaxSlides };
        }
        case "batchRun": {
            if (limits.batchMaxAds === 0) {
                return { allowed: false, reason: "pro_plan_required", limit: 0 };
            }
            const q = quantity ?? 0;
            if (q > limits.batchMaxAds) {
                return { allowed: false, reason: "batch_limit_exceeded", limit: limits.batchMaxAds };
            }
            return { allowed: true, limit: limits.batchMaxAds };
        }
        case "teamInvite": {
            const q = quantity ?? 0;
            if (limits.teamLimit <= 1) {
                return { allowed: false, reason: "pro_plan_required", limit: limits.teamLimit };
            }
            if (q >= limits.teamLimit) {
                return { allowed: false, reason: "team_limit_exceeded", limit: limits.teamLimit };
            }
            return { allowed: true, limit: limits.teamLimit };
        }
        case "savedProjectSave": {
            const q = quantity ?? 0;
            if (limits.savedProjectLimit === Infinity) {
                return { allowed: true, limit: Infinity };
            }
            if (q > limits.savedProjectLimit) {
                return { allowed: false, reason: "saved_project_limit_exceeded", limit: limits.savedProjectLimit };
            }
            return { allowed: true, limit: limits.savedProjectLimit };
        }
        case "audienceAvatarCreate": {
            const q = quantity ?? 0;
            if (limits.avatarLimit === Infinity) {
                return { allowed: true, limit: Infinity };
            }
            if (q > limits.avatarLimit) {
                return { allowed: false, reason: "avatar_limit_exceeded", limit: limits.avatarLimit };
            }
            return { allowed: true, limit: limits.avatarLimit };
        }
        default:
            return { allowed: true };
    }
}

// ─── RESOLVE ENTITLEMENT FROM FIRESTORE ─────────────────────────────────────
export async function resolveFirestoreEntitlement(callerUid: string): Promise<ResolvedEntitlement> {
    const userDoc = await getDb().collection("users").doc(callerUid).get();
    if (!userDoc.exists) {
        return makeNoneFallback(callerUid);
    }

    const userData = userDoc.data()!;

    // ═══ TEAM MEMBER? Resolve from owner. ═══
    if (userData.isTeamMember && userData.teamOwnerUid) {
        const ownerDoc = await getDb().collection("users").doc(userData.teamOwnerUid).get();
        if (!ownerDoc.exists) {
            return makeNoneFallback(callerUid);
        }
        const ownerData = ownerDoc.data()!;
        return resolveFromUserData(ownerData, userData.teamOwnerUid);
    }

    // ═══ OWNER / NORMAL USER ═══
    return resolveFromUserData(userData, callerUid);
}

function resolveFromUserData(
    userData: FirebaseFirestore.DocumentData,
    creditOwnerUid: string
): ResolvedEntitlement {
    const storedPlan = (userData.plan || "none") as StoredPlan;
    const isTrial = userData.isTrial === true;

    // ── Real plan (trial or paid) ──
    if (storedPlan !== "none" && PLAN_FEATURES[storedPlan as BasePlan]) {
        return {
            basePlan: storedPlan as BasePlan,
            isTrial,
            creditsPerMonth: isTrial ? TRIAL_CREDITS : PLAN_CREDITS[storedPlan as BasePlan],
            features: { ...PLAN_FEATURES[storedPlan as BasePlan] },
            teamCreditPoolShared: true,
            creditOwnerUid,
        };
    }

    // ── Cancelled / no plan ──
    return makeNoneFallback(creditOwnerUid);
}

function makeNoneFallback(creditOwnerUid: string): ResolvedEntitlement {
    return {
        basePlan: "none",
        isTrial: false,
        creditsPerMonth: 0,
        features: { ...NONE_FEATURES },
        teamCreditPoolShared: true,
        creditOwnerUid,
    };
}

// ─── FEATURE CHECK HELPERS ──────────────────────────────────────────────────
export type GatedFeature = keyof Omit<PlanFeatures,
    | "maxCarouselSlides" | "maxTeamMembers" | "aspectRatios"
    | "performanceDashboard"
    | "maxHookAngles" | "maxHookStyles" | "maxAdTones" | "maxCopyStrategies" | "maxOfferModes" | "maxObjectionScripts"
>;

const FEATURE_REQUIRED_PLAN: Record<GatedFeature, string> = {
    retargeting: "Pro",
    carousel: "Pro",
    competitorResearch: "Pro",
    batchGeneration: "Pro",
    fantasyUniverses: "Pro",
    visualPolishes: "Pro",
    brandUrlScraping: "Starter",
    abVariationTesting: "Pro",
    regionEditing: "Pro",
    referenceAdUpload: "Pro",
    pushToMeta: "Pro",
    creativeMemory: "Pro",
    creativeScoringEngine: "Scale",
    smartRecommendations: "Scale",
    variantExploration: "Scale",
    multiBrandWorkspaces: "Scale",
};

export interface FeatureCheckResult {
    allowed: boolean;
    code?: "feature_not_allowed";
    feature?: string;
    requiredPlan?: string;
}

export function checkFeature(entitlement: ResolvedEntitlement, feature: GatedFeature): FeatureCheckResult {
    if (entitlement.features[feature]) {
        return { allowed: true };
    }
    return {
        allowed: false,
        code: "feature_not_allowed",
        feature,
        requiredPlan: FEATURE_REQUIRED_PLAN[feature],
    };
}

export function checkAspectRatio(entitlement: ResolvedEntitlement, ratio: string): FeatureCheckResult {
    if (entitlement.features.aspectRatios.includes(ratio)) {
        return { allowed: true };
    }
    return {
        allowed: false,
        code: "feature_not_allowed",
        feature: `aspect_ratio_${ratio}`,
        requiredPlan: "Starter",
    };
}

export function checkCarouselSlides(entitlement: ResolvedEntitlement, slideCount: number): FeatureCheckResult {
    if (!entitlement.features.carousel) {
        return {
            allowed: false,
            code: "feature_not_allowed",
            feature: "carousel",
            requiredPlan: "Pro",
        };
    }
    if (slideCount > entitlement.features.maxCarouselSlides) {
        return {
            allowed: false,
            code: "feature_not_allowed",
            feature: `carousel_slides_${slideCount}`,
            requiredPlan: "Scale",
        };
    }
    return { allowed: true };
}

/** Check that a numeric selector index (hook angle, tone, etc.) is within the plan's limit. */
export function checkNumericLimit(
    entitlement: ResolvedEntitlement,
    feature: "maxHookAngles" | "maxHookStyles" | "maxAdTones" | "maxCopyStrategies" | "maxOfferModes" | "maxObjectionScripts",
    requestedIndex: number,
    featureLabel: string
): FeatureCheckResult {
    const limit = entitlement.features[feature];
    if (requestedIndex < limit) {
        return { allowed: true };
    }
    return {
        allowed: false,
        code: "feature_not_allowed",
        feature: featureLabel,
        requiredPlan: limit === 0 ? "Pro" : "Scale",
    };
}

/** Check dashboard access level. */
export function checkDashboardAccess(
    entitlement: ResolvedEntitlement,
    requiredLevel: "overview" | "full"
): FeatureCheckResult {
    const level = entitlement.features.performanceDashboard;
    if (level === "full") return { allowed: true };
    if (level === "overview" && requiredLevel === "overview") return { allowed: true };
    return {
        allowed: false,
        code: "feature_not_allowed",
        feature: "performanceDashboard",
        requiredPlan: requiredLevel === "full" ? "Scale" : "Pro",
    };
}

// ─── CREDIT RESOLUTION ──────────────────────────────────────────────────────
export async function resolveCreditOwner(callerUid: string): Promise<{
    creditOwnerUid: string;
    teamRole: string | null;
}> {
    const userDoc = await getDb().collection("users").doc(callerUid).get();
    if (!userDoc.exists) {
        return { creditOwnerUid: callerUid, teamRole: null };
    }
    const data = userDoc.data()!;
    if (data.isTeamMember && data.teamOwnerUid) {
        return {
            creditOwnerUid: data.teamOwnerUid,
            teamRole: data.teamRole || "viewer",
        };
    }
    return { creditOwnerUid: callerUid, teamRole: null };
}

// ─── ACTION → FEATURE GATE MAP ─────────────────────────────────────────────
export const ACTION_FEATURE_MAP: Record<string, GatedFeature | null> = {
    generateHooks: null,
    refreshHooks: null,
    editOneHook: null,
    generateConcepts: null,
    editOneConcept: null,
    buildPlan: null,
    generateImage: null,
    polishImage: null,
    reflowImage: null,
    analyzePolishes: null,
    generateCaption: null,
    refineCaption: null,
    generateCarouselCopies: "carousel",
    competitorResearch: "competitorResearch",
    brandUrlScraping: "brandUrlScraping",
    editRegion: "regionEditing",
};

// ─── EXPORTS ────────────────────────────────────────────────────────────────
export { PLAN_CREDITS, TRIAL_CREDITS, PLAN_FEATURES };
