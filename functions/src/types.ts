// functions/src/types.ts — shared server-side type definitions
// Subset of frontend types needed by server-side modules

import type { AspectRatio } from "./generators.js";

// ─── Reflow Types (HOTFIX-F) ─────────────────────────────────────────────────

export type ReflowMethod = "auto" | "outpaint" | "rerender";

export type ReflowScope = "single" | "batch_all" | "carousel_all" | "carousel_slide";

export type ReflowFallbackReason =
    | "engine_error"
    | "drift"
    | "no_plan"
    | "mask_error"
    | "transient";

export interface ReflowHistoryEntry {
    timestamp: number;
    sourceRatio: AspectRatio;
    targetRatio: AspectRatio;
    magnitude: number;
    method: "outpaint" | "rerender" | "edit_recompose";
    userOverride: "outpaint" | "rerender" | null;
    fallbackFrom: "outpaint" | "rerender" | null;
    fallbackReason: ReflowFallbackReason | null;
    itemIndex: number | null;
    outputUrl: string | null;
    creditsCharged: number;
    brandColorReinforced?: boolean;
    textReflowOverflow?: boolean;
    textReductionSteps?: 0 | 1 | 2 | 3;
}

export interface ReflowDecision {
    sourceRatio: AspectRatio;
    targetRatio: AspectRatio;
    magnitude: number;
    chosenMethod: "outpaint" | "rerender";
    isUserOverride: boolean;
}

export interface ReflowOutcome {
    itemIndex: number | null;
    success: boolean;
    method: "outpaint" | "rerender" | "edit_recompose" | null;
    fallbackFrom: "outpaint" | "rerender" | null;
    fallbackReason: ReflowFallbackReason | null;
    outputUrl: string | null;
    creditsCharged: number;
    errorCode?: string;
    errorMessage?: string;
    brandColorReinforced?: boolean;
    textReflowOverflow?: boolean;
    textReductionSteps?: 0 | 1 | 2 | 3;
}

export interface VariantChip {
    ratio: AspectRatio;
    url: string;
    cleanReflowedImageUrl?: string;
    generatedAt: number;
}

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

// ─── Logo Placement (HOTFIX-E) ───────────────────────────────────────────

export type LogoZone =
    | "top-left"
    | "top-right"
    | "top-center"
    | "middle-left"
    | "middle-right"
    | "middle-center"
    | "bottom-left"
    | "bottom-right"
    | "bottom-center"
    | "center";

export interface UILogoPlacement {
    logoIndex: number;
    mode: "ui";
    zone: LogoZone;
    widthPct: number;
    opacity: number;
}

export interface EnvironmentalLogoPlacement {
    logoIndex: number;
    mode: "environmental";
    surface: string;
    environmentalContext: string;
}

export type LogoPlacement = UILogoPlacement | EnvironmentalLogoPlacement;

export interface LogoPipelineEvents {
    perLogo: Array<{
        logoIndex: number;
        chosenMode: "ui" | "environmental";
        finalZone?: LogoZone;
        finalSurface?: string;
        // outcome + reason are populated for failure/skip branches so
        // every processed placement has a perLogo record (not just successes).
        outcome?: "placed" | "missing_source" | "no_zone" | "soft_failed";
        reason?: string;
    }>;
    autoShifts: Array<{
        logoIndex: number;
        from: LogoZone;
        to: LogoZone;
        reason: "text_collision" | "cta_collision";
    }>;
    drops: Array<{
        logoIndex: number;
        reason: "no_non_colliding_zone"
              | "over_ui_cap"
              | "over_environmental_cap"
              | "logo_index_out_of_range";
        candidatesExhausted: LogoZone[];
    }>;
    clamps: Array<{
        logoIndex: number;
        field: "widthPct" | "opacity";
        rawValue: number;
        clampedValue: number;
    }>;
    softWarnings: Array<{
        logoIndex: number;
        reason: "composite_failed" | "corrupt_source" | "unsupported_format" | "missing_source" | "compositor_unavailable";
        detail?: string;
    }>;
}

export interface ClaimFlagEntry {
    text: string;
    reason: string;
    field?: "hook" | "subhead" | "cta" | "benefit" | "slide";
}

// ─── Phase 24B — Conditional Copy Fields (Optional Fields Plumbing) ─────────
// Per FR-006/FR-007/FR-008: the parser represents an absent optional field as
// `null` (NEVER `""` or a placeholder) and surfaces a tri-state status so
// "intentionally absent" is separately observable from "failed to parse".
// `hookText` is NEVER `absent` — it is always required — so we model it as a
// stricter RequiredFieldStatus that excludes the "absent" sentinel at the
// type level (CodeRabbit review).
export type CopyFieldStatus = "present" | "absent" | "parse_failure";
export type RequiredFieldStatus = "present" | "parse_failure";
export interface CopyFieldStatuses {
    hookText: RequiredFieldStatus;   // "present" | "parse_failure" (NEVER "absent")
    subheadText: CopyFieldStatus;    // "present" | "absent" | "parse_failure"
    ctaName: CopyFieldStatus;        // "present" | "absent" | "parse_failure"
    benefitText: CopyFieldStatus;    // "present" | "absent" | "parse_failure"
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
    logoPipeline?: LogoPipelineEvents;
    readonly reflowHistory?: readonly ReflowHistoryEntry[];
    // Phase 17 — top-level rollup flags (set to OR of any reflow's per-entry flag).
    // Reflects what `reflowImage.ts:deductAndPersist()` writes alongside `reflowHistory`
    // so typed consumers can read the rollups directly without scanning the array.
    brandColorReinforced?: boolean;
    textReflowOverflow?: boolean;
    brandColorSource?: BrandColorSource;
    brandColorCompliance?: BrandColorComplianceEntry[];
    modeComposition?: ModeCompositionTrace;
    adaptStateAudit?: AdaptStateAuditResult;
    visualProvider?: {
        provider: "openai" | "gemini";
        model: string;
        size?: string;
        usedReferenceEdit?: boolean;
        copyFidelityGated?: boolean;
        arabicQaRan?: boolean;
        timedOut?: boolean;
    };
    // Phase 22 — US3 soft-fabrication flag. Captures (does not enforce) the soft-flag
    // policy emitted by the model after the four copy fields. Non-blocking; the copy
    // is always produced in full and never deleted/refused.
    readonly claimFlags?: readonly ClaimFlagEntry[];
    // Phase 23 — additive copy-diversity sub-object. Records what the
    // dimension/rotation/fingerprint machinery decided this generation.
    // No existing consumer is required to read it; populating it is
    // non-blocking and never affects copy output.
    readonly copyDiversity?: {
        seed: string;
        angle: string;
        drawnDimensionIds?: string[];
        openingIds?: string[];
        storyDirectionFamilies?: string[];
        middleAngleOrder?: string[];
        memoryBiasApplied: boolean;
        fingerprintsConsidered: number;
    };
    // Phase 24B — additive copy-field-status sub-object. Records the final
    // per-field status (present/absent/parse_failure) for the four copy
    // fields, plus the lists of fields that were degraded-to-absent after the
    // parse-failure retry cap was exhausted, and fields that were nulled by
    // the dedup/QA layer. Conforms to FR-008 (no silent absence) and
    // Constitution VI/VII (overrides are traceable). Additive — no migration.
    readonly copyFieldStatus?: {
        readonly hookText: RequiredFieldStatus;
        readonly subheadText: CopyFieldStatus;
        readonly ctaName: CopyFieldStatus;
        readonly benefitText: CopyFieldStatus;
        readonly degradedToAbsent?: readonly ("subheadText" | "ctaName" | "benefitText")[];
        readonly dedupBlanked?: readonly ("subheadText" | "ctaName" | "benefitText")[];
    };
}

export interface ModeCompositionTrace {
    missing: ModeCompositionWarning[];
    reinforced: boolean;
}

export interface ModeCompositionWarning {
    mode: string;
    missingElements: string[];
    reinforcementInjected: boolean;
    detectedAt: "post_build_plan";
}

export interface AdaptStateAuditEntry {
    subStyleId: string;
    modeId: string;
    fusionPromptHash: string;
    triggerWordsFound: string[];
    passed: boolean;
}

export interface AdaptStateAuditResult {
    ranAt: string;
    totalChecked: number;
    passed: number;
    failed: number;
    entries: AdaptStateAuditEntry[];
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

// ─── Brand Colors (956-brand-colors) ─────────────────────────────────────────

export type BrandColorSource =
    | "form"
    | "avatar"
    | "inherited"
    | "workspace"
    | "none";

export interface BrandColorPair {
    primary: string | null;
    secondary: string | null;
    ctaTextColor: "#FFFFFF" | "#1A1A1A" | null;
    source: BrandColorSource;
}

export interface BrandColorComplianceEntry {
    assetId: string;
    checkRan: boolean;
    present: boolean;
    deltaE: number | null;
    dominantSwatch: string | null;
    deductedScore: number;
    skippedReason?: "no_brand_colors" | "image_unanalyzable";
}