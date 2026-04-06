// functions/src/types.ts — shared server-side type definitions

// Subset of frontend types needed by server-side modules

export type RetargetingAngle = | "proof" | "risk_reversal" | "mechanism" | "urgency" | "clarity";

export type RetargetingObjectionId = | "price_too_high" | "no_budget_now" | "need_installments" | "dont_trust" | "will_it_work_for_me" | "tried_before_failed" | "no_time" | "overwhelmed" | "not_ready_yet" | "need_approval" | "dont_want_call" | "dont_need_it";

export type OfferTypeId = "live_event" | "free_guide" | "mini_course";
export type TabId = "live_events" | "free_guide" | "mini_course";
export type LegacyOfferTypeId = "free_webinar" | "paid_workshop" | "challenge";
export type VisualStyleFamily = "realistic" | "fantasy" | "minimal";
export interface SlideEntry {
    slide: number
    role: "hook" | "middle" | "close"
    hasCTA: boolean
    narrativeAngle: string
    photoInjection: boolean
    testimonialPlatform?: string
}
export interface AutoSwitchEvent {
    field: string
    from: string
    to: string
    reason: string
}
export interface ValueStackAdjustment {
    giftCount: number
    originalSlideCount: number
    resolvedSlideCount: number
    capped: boolean
}
export interface ResolutionTrace {
    resolvedCampaignType: "cold" | "retargeting"
    resolvedAdMode: "single" | "carousel" | "batch"
    readonly resolvedCreativeModes: readonly string[]
    resolvedStyleFamily: VisualStyleFamily
    resolvedSubStyle: string | null
    referenceAdOverrideActive: boolean
    overriddenUniverse?: string
    overriddenSubStyle?: string
    artDirectionCleared?: boolean
    artDirectionClearedReason?: string
    hookAngle: string | null
    hookAngleNullReason?: string
    objectionId: string | null
    effectiveObjectionText: string | null
    modeCompatibilityResult: "ok" | "adapt" | "block"
    modeCompatibilityReason?: string
    slideCountOverride?: boolean
    originalSlideCount?: number
    resolvedSlideCount?: number
    slideCountOverrideReason?: string
    readonly valueStackEmptyFieldsSkipped?: readonly string[]
    readonly autoSwitchEvents: readonly AutoSwitchEvent[]
    readonly perSlide?: readonly SlideEntry[]
    launchMatrixCheckPassed: boolean
    launchMatrixBlockReason?: string
}
export interface LaunchSurfaceInput {
    offerType: string
    campaignType: "cold" | "retargeting"
    adFormat: "single" | "carousel" | "batch"
    creativeModes: string[]
    hookAngle?: string | null
    visualStyleFamily?: VisualStyleFamily
    userPlan: "starter" | "creator" | "pro" | "scaling"
}
export interface LaunchSurfaceResult {
    passed: boolean
    blockReason?: string
    resolvedOfferType: OfferTypeId
    resolvedTab: TabId
    layoutKey?: string
}
export interface FilterResult {
    filteredInput: Record<string, unknown>
    skippedFields: string[]
}
