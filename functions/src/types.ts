// Server-side type definitions
// Subset of frontend types needed by server-side modules

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

export type PlatformType = 'whatsapp' | 'instagram_dm' | 'facebook' | 'email' | 'google_review' | 'telegram' | 'unknown';

export type VisualStyleFamily = "realistic" | "fantasy" | "minimal";

export interface TestimonialSlideResult {
    slideNumber: number;
    role: 'hook' | 'testimonial' | 'close';
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