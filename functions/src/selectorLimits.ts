/**
 * selectorLimits.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * Ordered ID arrays for backend validation of plan-gated selectors.
 * Must match the frontend array order in src/constants.ts exactly.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ResolvedEntitlement } from './entitlements';

// ── Hook Angles (matches src/constants.ts COLD_HOOK_ANGLES order) ──
export const HOOK_ANGLE_IDS = [
    'emotional', 'pain', 'curiosity',                      // Starter (0..2)
    'logic', 'social_proof', 'urgency', 'statistics',     // Creator (4..7)
    'scarcity', 'logical_authority', 'future_based',       // Pro/Scaling (8..10)
] as const;

// ── Hook Styles (matches src/constants.ts HOOK_TYPES order) ──
export const HOOK_STYLE_IDS = [
    'question', 'curiosity_gap', 'personal_story', 'pain_point',       // Starter (0..3)
    'transformation_promise', 'misconception', 'shocking_stat', 'comedic', // Creator (4..7)
    'controversial', 'storytelling', 'listicle', 'threat',              // Pro/Scaling (8..11)
] as const;

// ── Ad Tones (matches src/constants.ts AD_TONES order) ──
export const AD_TONE_IDS = [
    'formal', 'inspiring', 'bold', 'friendly',            // Starter (0..3)
    'emotional', 'authority', 'mentor', 'data_driven',     // Creator (4..7)
    'funny', 'soft', 'luxury_ceo',                         // Pro/Scaling (8..10)
] as const;

// ── Copywriting Strategies (matches src/constants.ts COPYWRITING_STRATEGIES order) ──
export const COPY_STRATEGY_IDS = [
    'pattern_interrupt', 'problem_awareness', 'beginner_awareness',  // Starter (0..2)
    'solution_awareness', 'authority_builder', 'product_awareness',  // Creator (3..5)
    'myth_busting', 'soft_story_sell',                               // Pro/Scaling (6..7)
] as const;

// ── Offer Creative Modes (matches src/modeFieldSchema.ts ORDERED_CREATIVE_MODES order) ──
export const OFFER_MODE_IDS = [
  'standard_hero', 'book_mockup', 'device_mockup', 'event_ticket', 'speaker_card', 'feature_highlight', // Starter (0..5)
  'value_stack', 'offer_card', 'community_card', 'testimonial_carousel', 'premium_package',              // Creator (6..10)
  'webinar_screen', 'platform_screenshot', 'certificate', 'inside_look',                                 // Pro/Scaling (11..14)
  'mobile_app_card', 'dashboard_preview', 'preview_card',                                                // Pro/Scaling (15..17)
] as const;

// ── Retargeting Objection IDs (matches functions/src/retargetingObjections.ts order) ──
export const OBJECTION_IDS = [
    'price_too_high', 'dont_trust', 'will_it_work_for_me', 'no_time',       // Creator (0..3)
    'no_budget_now', 'need_installments', 'tried_before_failed', 'overwhelmed', // Pro/Scaling (4..7)
    'not_ready_yet', 'need_approval', 'dont_want_call', 'dont_need_it',     // Pro/Scaling (8..11)
] as const;

/**
 * Validate that a selector value is within the user's plan limit.
 * Returns null if allowed, or an error string if blocked.
 */
export function validateSelector(
    entitlement: ResolvedEntitlement,
    selectorType: 'hookAngle' | 'hookStyle' | 'adTone' | 'copyStrategy' | 'offerMode' | 'objection',
    value: string | undefined | null
): string | null {
    if (!value) return null; // No value to validate

    // Reject deprecated IDs that were removed from the catalogs
    const DEPRECATED_IDS: Record<string, string> = {
        before_after: 'before_after is now a creative mode, not a hook angle.',
        limited_access: 'limited_access has been removed.',
        module_preview: 'module_preview has been removed.',
        day_strip: 'day_strip has been removed.',
    };
    if (DEPRECATED_IDS[value]) return DEPRECATED_IDS[value];

    const config: Record<string, { ids: readonly string[]; limitKey: keyof ResolvedEntitlement['features']; label: string }> = {
        hookAngle:    { ids: HOOK_ANGLE_IDS,    limitKey: 'maxHookAngles',      label: 'hook angle' },
        hookStyle:    { ids: HOOK_STYLE_IDS,    limitKey: 'maxHookStyles',      label: 'hook style' },
        adTone:       { ids: AD_TONE_IDS,       limitKey: 'maxAdTones',         label: 'ad tone' },
        copyStrategy: { ids: COPY_STRATEGY_IDS, limitKey: 'maxCopyStrategies',  label: 'copywriting strategy' },
        offerMode:    { ids: OFFER_MODE_IDS,    limitKey: 'maxOfferModes',      label: 'offer mode' },
        objection:    { ids: OBJECTION_IDS,     limitKey: 'maxObjectionScripts', label: 'objection script' },
    };

    const c = config[selectorType];
    if (!c) return null;

    const index = c.ids.indexOf(value as any);
    if (index === -1) return null; // Unknown value — let it pass (may be custom)

    const limit = entitlement.features[c.limitKey] as number;
    if (index < limit) return null;

    return `Your plan does not include this ${c.label}. Upgrade to access it.`;
}
