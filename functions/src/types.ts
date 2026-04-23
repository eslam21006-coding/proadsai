// functions/src/types.ts — shared server-side type definitions
// Subset of frontend types needed by server-side modules

// ─── Failure Classification ──────────────────────────────────────────────────

export type FailureClass =
    | "prompt_malformed"
    | "model_error"
    | "validation_reject"
    | "slot_repair_failed"
    | "numeric_hallucination"
    | "combination_invalid"
    | "credit_insufficient";

export interface CostEstimate {
    modelTier: string | null;
    retryCount: number;
    estimatedTokens: number;
}

// ─── Generation Error ────────────────────────────────────────────────────────

export class GenerationError extends Error {
    public readonly failureClass: FailureClass;

    constructor(message: string, failureClass: FailureClass) {
        super(message);
        this.name = "GenerationError";
        this.failureClass = failureClass;
    }
}

export interface GenerationResult {
    image: string | null;
    errorCode?: string;
    failureClass?: FailureClass;
    costEstimate?: CostEstimate;
    debug?: any;
    [key: string]: any;
}

export type RetargetingAngle =
    | "proof"
    | "risk_reversal"
    | "mechanism"
    | "urgency"
    | "clarity";

export type RetargetingObjectionId =
    | "price_too_high"
    | "no_budget_now"
    | "need_installments"
    | "dont_trust"
    | "will_it_work_for_me"
    | "tried_before_failed"
    | "no_time"
    | "overwhelmed"
    | "not_ready_yet"
    | "need_approval"
    | "dont_want_call"
    | "dont_need_it";

export type OfferTypeId = "live_event" | "free_guide" | "mini_course";
export type TabId = "live_events" | "free_guide" | "mini_course";
export type LegacyOfferTypeId = "free_webinar" | "paid_workshop" | "challenge";
export type VisualStyleFamily = "realistic" | "fantasy" | "minimal";

export type PlatformType =
    | "whatsapp"
    | "instagram_dm"
    | "facebook"
    | "email"
    | "google_review"
    | "telegram"
    | "unknown";

export interface SlideEntry {
    slide: number;
    role: "hook" | "middle" | "close";
    hasCTA: boolean;
    narrativeAngle: string;
    photoInjection: boolean;
    testimonialPlatform?: string;
}

export interface AutoSwitchEvent {
    field: string;
    from: string;
    to: string;
    reason: string;
}

export interface ValueStackAdjustment {
    giftCount: number;
    originalSlideCount: number;
    resolvedSlideCount: number;
    capped: boolean;
}

export interface ResolutionTrace {
    resolvedCampaignType: "cold" | "retargeting";
    resolvedAdMode: "single" | "carousel" | "batch";
    readonly resolvedCreativeModes: readonly string[];
    resolvedStyleFamily: VisualStyleFamily;
    resolvedSubStyle: string | null;
    referenceAdOverrideActive: boolean;
    overriddenUniverse?: string;
    overriddenSubStyle?: string;
    artDirectionCleared?: boolean;
    artDirectionClearedReason?: string;
    hookAngle: string | null;
    hookAngleNullReason?: string;
    objectionId: string | null;
    effectiveObjectionText: string | null;
    modeCompatibilityResult: "ok" | "adapt" | "block";
    modeCompatibilityReason?: string;
    slideCountOverride?: boolean;
    originalSlideCount?: number;
    resolvedSlideCount?: number;
    slideCountOverrideReason?: string;
    readonly valueStackEmptyFieldsSkipped?: readonly string[];
    readonly autoSwitchEvents: readonly AutoSwitchEvent[];
    readonly perSlide?: readonly SlideEntry[];
    launchMatrixCheckPassed: boolean;
    launchMatrixBlockReason?: string;
    culturalViolation?: {
        caught: true;
        matchedWords: string[];
        sourceLayer: "imagePrompt" | "adCopy" | "both";
    };
}

export interface LaunchSurfaceInput {
    offerType: string;
    campaignType: "cold" | "retargeting";
    adFormat: "single" | "carousel" | "batch";
    creativeModes: string[];
    hookAngle?: string | null;
    visualStyleFamily?: VisualStyleFamily;
    userPlan: "starter" | "pro" | "scale";
    batchN?: number;
}

export interface LaunchSurfaceResult {
    passed: boolean;
    blockReason?: string;
    resolvedOfferType: OfferTypeId;
    resolvedTab: TabId;
    layoutKey?: string;
}

export interface FilterResult {
    filteredInput: Record<string, unknown>;
    skippedFields: string[];
}

export interface TestimonialSlideResult {
    slideNumber: number;
    role: "hook" | "testimonial" | "close";
    platform: PlatformType | null;
    imageBase64: string;
    hookText: string | null;
    ctaText: string | null;
    hasCTA: boolean;
}

export interface TestimonialCarouselResult {
    slides: TestimonialSlideResult[];
    detectedPlatforms: PlatformType[];
    totalSlides: number;
    visualStyleFamily: VisualStyleFamily;
}