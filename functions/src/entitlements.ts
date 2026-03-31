/**
 * entitlements.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH for plan entitlements (backend).
 * Every backend function that checks plan, features, or credits MUST use this.
 *
 * PLAN MODEL:
 *   - 4 plans: starter, creator, pro, scaling
 *   - Trial: plan='starter' (or any), isTrial=true, credits=50, features=full
 *   - Paid:  plan='starter' (or any), isTrial=false, credits=plan amount
 *   - Cancelled: plan='none', credits=0, blocked from everything
 *   - There is NO 'free' plan
 *
 * Firestore user doc fields:
 *   - plan: 'starter' | 'creator' | 'pro' | 'scaling' | 'none'
 *   - isTrial: boolean (true = trial, credits don't reset)
 *   - credits: number (current balance)
 *   - isTeamMember: boolean
 *   - teamOwnerUid: string (if team member)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as admin from "firebase-admin";

function getDb() { return admin.firestore(); }

// ─── PLAN TYPES ─────────────────────────────────────────────────────────────
export type BasePlan = "starter" | "creator" | "pro" | "scaling";
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
        maxCarouselSlides: 1,
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
        maxHookAngles: 4,
        maxHookStyles: 4,
        maxAdTones: 4,
        maxCopyStrategies: 3,
        maxOfferModes: 6,
        maxObjectionScripts: 0,
    },
    creator: {
        retargeting: true,
        carousel: false,
        competitorResearch: false,
        batchGeneration: false,
        fantasyUniverses: true,
        visualPolishes: true,
        brandUrlScraping: true,
        maxCarouselSlides: 1,
        maxTeamMembers: 1,
        aspectRatios: ["1:1", "4:5", "3:4", "4:3", "9:16", "16:9"],
        abVariationTesting: true,
        regionEditing: true,
        referenceAdUpload: false,
        pushToMeta: false,
        performanceDashboard: "none",
        creativeMemory: false,
        creativeScoringEngine: false,
        smartRecommendations: false,
        variantExploration: false,
        multiBrandWorkspaces: false,
        maxHookAngles: 8,
        maxHookStyles: 8,
        maxAdTones: 8,
        maxCopyStrategies: 6,
        maxOfferModes: 12,
        maxObjectionScripts: 4,
    },
    pro: {
        retargeting: true,
        carousel: true,
        competitorResearch: true,
        batchGeneration: false,
        fantasyUniverses: true,
        visualPolishes: true,
        brandUrlScraping: true,
        maxCarouselSlides: 5,
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
    scaling: {
        retargeting: true,
        carousel: true,
        competitorResearch: true,
        batchGeneration: true,
        fantasyUniverses: true,
        visualPolishes: true,
        brandUrlScraping: true,
        maxCarouselSlides: 9,
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
    starter: 500,
    creator: 1000,
    pro: 2000,
    scaling: 5000,
};

const TRIAL_CREDITS = 50;

// ─── RESOLVE ENTITLEMENT FROM FIRESTORE ─────────────────────────────────────
export async function resolveEntitlement(callerUid: string): Promise<ResolvedEntitlement> {
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
    retargeting: "Creator",
    carousel: "Pro",
    competitorResearch: "Pro",
    batchGeneration: "Scaling",
    fantasyUniverses: "Creator",
    visualPolishes: "Creator",
    brandUrlScraping: "Starter",
    abVariationTesting: "Creator",
    regionEditing: "Creator",
    referenceAdUpload: "Pro",
    pushToMeta: "Pro",
    creativeMemory: "Pro",
    creativeScoringEngine: "Scaling",
    smartRecommendations: "Scaling",
    variantExploration: "Scaling",
    multiBrandWorkspaces: "Scaling",
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
            requiredPlan: "Scaling",
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
        requiredPlan: limit === 0 ? "Creator" : "Pro",
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
        requiredPlan: requiredLevel === "full" ? "Scaling" : "Pro",
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

// ─── EXPORTS ────────────────────────────────────────────────────────────────
export { PLAN_CREDITS, TRIAL_CREDITS };
