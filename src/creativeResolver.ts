// creativeResolver.ts
// ═══════════════════════════════════════════════════════════════════════════
// CREATIVE MODE RESOLVER — Single Source of Truth (v2: Tab + Role System)
// ═══════════════════════════════════════════════════════════════════════════
// TABS: mini_course | live_events | free_guide
// ROLES: anchor | support
// RULES: max 2 modes, no cross-tab, support cannot be standalone (unless allowed)
// ═══════════════════════════════════════════════════════════════════════════

export type CreativeModeId =
    | 'standard_hero'
    | 'value_stack'
    | 'event_ticket' | 'webinar_screen' | 'speaker_card'
    | 'book_mockup' | 'device_mockup'
    | 'text_only'
    | 'before_after';

export type RemovedModeId =
    | 'preview_card' | 'premium_package' | 'platform_screenshot' | 'certificate'
    | 'dashboard_preview' | 'mobile_app_card' | 'feature_highlight'
    | 'community_card' | 'inside_look' | 'testimonial_wall';

export type CreativeTab = 'mini_course' | 'live_events' | 'free_guide';
export type ModeRole = 'anchor' | 'support';

export interface TabDefinition {
    id: CreativeTab; labelEn: string; labelAr: string; icon: string; description: string;
}

export const CREATIVE_TABS: TabDefinition[] = [
    { id: 'mini_course', labelEn: 'Mini Course', labelAr: 'كورس مصغر', icon: '🎓', description: 'Online courses, coaching programs, digital products' },
    { id: 'live_events', labelEn: 'Live Events', labelAr: 'أحداث مباشرة', icon: '🎤', description: 'Webinars, workshops, challenges, live sessions' },
    { id: 'free_guide', labelEn: 'Free Guide', labelAr: 'دليل مجاني', icon: '📖', description: 'Ebooks, PDFs, lead magnets, free guides' },
];

export interface ValidityCriteria {
    requiredElements: string[];
    invalidSubstitutes: string[];
    minimumDescription: string;
}

export interface CreativeModeMeta {
    id: CreativeModeId;
    labelEn: string;
    labelAr: string;
    icon: string;
    description: string;
    tabs: CreativeTab[];
    role: ModeRole;
    standaloneAllowed: boolean;
    visualHierarchy: string[];
    mustShow: string[];
    mustAvoid: string[];
    textPlacementRules: string[];
    captionAnchors: string[];
    validity: ValidityCriteria;
    boxCLabel?: string;
    boxCHint?: string;
    templateNeeds: string[];
}

export const CREATIVE_MODE_CATALOG: Record<CreativeModeId, CreativeModeMeta> = {
    standard_hero: {
        id: 'standard_hero', labelEn: 'Standard Hero', labelAr: 'بطل كلاسيكي', icon: '👤',
        description: 'Classic hero + text layout',
        tabs: ['mini_course', 'live_events', 'free_guide'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['hero_dominant', 'text_overlay', 'environment_background'],
        mustShow: ['hero_portrait', 'headline', 'subheadline', 'cta_button'], mustAvoid: [],
        textPlacementRules: ['headline_top_zone', 'cta_bottom_bar'], captionAnchors: [],
        validity: { requiredElements: ['hero_portrait', 'headline', 'cta_button'], invalidSubstitutes: [], minimumDescription: 'Dominant hero with text overlay and CTA' },
        templateNeeds: ['hero_focus'],
    },
    value_stack: {
        id: 'value_stack', labelEn: 'Value Stack', labelAr: 'تراكم القيمة', icon: '📊',
        description: 'Stacked bonuses visualization',
        tabs: ['mini_course'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['stack_items_3_5', 'individual_values', 'total_vs_price', 'hero_presenting'],
        mustShow: ['value_items_with_prices', 'total_value_line', 'actual_price_contrast', 'savings_callout'],
        mustAvoid: ['before_after_split', 'day_progression', 'certificate'],
        textPlacementRules: ['stack_items_center', 'total_bottom', 'price_contrast_large'],
        captionAnchors: ['look at everything you get', 'total value', 'you pay only'],
        validity: { requiredElements: ['visible_item_rows_or_cards', 'structured_list_area', 'price_or_value_display'], invalidSubstitutes: ['single_product_photo', 'generic_hero_with_prop', 'text_only_list'], minimumDescription: 'Distinct secondary zone with 3-5 stacked item rows/cards, total value vs price.' },
        boxCLabel: 'Bonus graphics', boxCHint: 'Upload bonus images or product graphics (up to 3)',
        templateNeeds: ['hero_value_stack_split', 'hero_value_stack_panel'],
    },
    limited_access: {
        id: 'limited_access', labelEn: 'Limited Access', labelAr: 'وصول محدود', icon: '🔒',
        description: 'Exclusive / VIP gate design',
        tabs: ['mini_course'], role: 'support', standaloneAllowed: false,
        visualHierarchy: ['gate_or_door', 'vip_rope', 'hero_behind_gate', 'exclusive_badge'],
        mustShow: ['access_gate_visual', 'vip_indicator', 'countdown_or_limit'],
        mustAvoid: ['before_after_split', 'value_stack_items'],
        textPlacementRules: ['headline_above_gate', 'countdown_center', 'cta_unlock_style'],
        captionAnchors: ['exclusive access', 'limited spots', 'unlock now'],
        validity: { requiredElements: ['vip_gate_or_rope', 'countdown_or_limit_indicator'], invalidSubstitutes: ['generic_lock_icon', 'text_only_countdown'], minimumDescription: 'VIP gate/rope with countdown or spots-left indicator.' },
        templateNeeds: ['hero_focus'],
    },
    module_preview: {
        id: 'module_preview', labelEn: 'Module Preview', labelAr: 'معاينة الوحدات', icon: '🎓',
        description: 'Curriculum card showing modules',
        tabs: ['mini_course'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['curriculum_cards', 'module_numbers', 'hero_as_instructor'],
        mustShow: ['module_list_3_5', 'progress_indicators', 'course_thumbnail'],
        mustAvoid: ['before_after_split'],
        textPlacementRules: ['modules_center_stack', 'headline_top', 'cta_bottom'],
        captionAnchors: ['start module 1', 'see the full curriculum', 'enroll now'],
        validity: { requiredElements: ['visible_module_list', 'course_content_preview'], invalidSubstitutes: ['single_laptop_with_logo', 'generic_screen_prop'], minimumDescription: 'Visible course/module contents: 3-5 module cards or preview-board.' },
        boxCLabel: 'Course thumbnail', boxCHint: 'Upload your course thumbnail or platform screenshot',
        templateNeeds: ['dashboard_product'],
    },
    event_ticket: {
        id: 'event_ticket', labelEn: 'Ticket', labelAr: 'تذكرة', icon: '🎫',
        description: 'Ticket-style with date, time, seats',
        tabs: ['live_events'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['ticket_frame', 'hero_portrait_circle', 'event_info_row', 'cta_bottom'],
        mustShow: ['event_title', 'speaker_photo_framed', 'date_time_row', 'live_badge', 'ticket_decorations'],
        mustAvoid: ['full_body_hero', 'environment_background', 'before_after_split'],
        textPlacementRules: ['title_top_strip', 'info_row_center', 'cta_bottom_with_seat_count'],
        captionAnchors: ['see the ticket details', 'check the event info', 'save your seat'],
        validity: { requiredElements: ['ticket_frame_structure', 'event_date_time', 'seat_or_registration_indicator'], invalidSubstitutes: ['generic_event_text', 'plain_date_label'], minimumDescription: 'Actual ticket-like structure: ticket frame, date/time row, seat count.' },
        boxCLabel: 'Event banner or logo', boxCHint: 'Upload your event banner, logo, or stage photo',
        templateNeeds: ['event_ticket'],
    },
    webinar_screen: {
        id: 'webinar_screen', labelEn: 'Screen', labelAr: 'شاشة', icon: '📺',
        description: 'Event/session broadcast screen',
        tabs: ['live_events'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['screen_device', 'webinar_title_on_screen', 'hero_beside_or_behind'],
        mustShow: ['laptop_or_screen', 'webinar_title_displayed', 'live_indicator'],
        mustAvoid: ['ticket_frame', 'before_after_split'],
        textPlacementRules: ['title_on_screen', 'cta_below_device'],
        captionAnchors: ['watch the webinar', 'join live', 'see what you will learn'],
        validity: { requiredElements: ['screen_or_device_frame', 'session_title_on_screen', 'live_broadcast_indicator'], invalidSubstitutes: ['generic_laptop_prop', 'hero_holding_phone'], minimumDescription: 'Clear event/session/broadcast screen framing with title and live indicator.' },
        templateNeeds: ['dashboard_product'],
    },
    day_strip: {
        id: 'day_strip', labelEn: 'Day Strip', labelAr: 'شريط الأيام', icon: '📅',
        description: 'Day-by-day schedule strip',
        tabs: ['live_events'], role: 'support', standaloneAllowed: false,
        visualHierarchy: ['day_progression', 'hero_center', 'progress_path', 'day1_highlight'],
        mustShow: ['day_markers_3_5', 'progress_arrow_path', 'day1_glow', 'community_count'],
        mustAvoid: ['ticket_frame', 'value_stack_items', 'before_after_split'],
        textPlacementRules: ['days_horizontal_or_circular', 'hero_center', 'starts_date_bottom'],
        captionAnchors: ['join day 1', 'start the challenge', 'day-by-day breakdown'],
        validity: { requiredElements: ['day_sequence_strip', 'multiple_day_markers', 'progress_path'], invalidSubstitutes: ['single_day_label', 'generic_calendar_icon'], minimumDescription: 'Schedule/day sequence strip with 3+ day markers and progress path.' },
        boxCLabel: 'Day content previews', boxCHint: 'Upload preview images for each challenge day',
        templateNeeds: ['event_ticket'],
    },
    speaker_card: {
        id: 'speaker_card', labelEn: 'Speaker Card', labelAr: 'بطاقة متحدث', icon: '🎤',
        description: 'Speaker identity block',
        tabs: ['live_events'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['stage_environment', 'hero_on_stage', 'lower_third_bar', 'audience_foreground'],
        mustShow: ['stage_spotlight', 'credentials_bar', 'speaker_name', 'audience_silhouettes'],
        mustAvoid: ['ticket_frame', 'book_mockup', 'before_after_split'],
        textPlacementRules: ['name_lower_third', 'credentials_strip_bottom', 'cta_overlay'],
        captionAnchors: ['join the session', 'hear from the expert', 'register now'],
        validity: { requiredElements: ['speaker_identity_block', 'credentials_bar', 'stage_or_presentation_context'], invalidSubstitutes: ['generic_hero_portrait', 'plain_name_text'], minimumDescription: 'Distinct speaker identity block with credentials bar and stage context.' },
        boxCLabel: 'Stage or event photos', boxCHint: 'Upload stage, podium, or event venue photos',
        templateNeeds: ['event_ticket', 'authority_proof'],
    },
    book_mockup: {
        id: 'book_mockup', labelEn: 'Book Mockup', labelAr: 'مجسم كتاب', icon: '📖',
        description: '3D book/PDF floating in scene',
        tabs: ['free_guide'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['book_3d_center', 'hero_behind_or_beside', 'glow_effects'],
        mustShow: ['3d_book_mockup', 'book_cover_from_box_c', 'floating_effect'],
        mustAvoid: ['device_screen', 'dashboard_ui', 'before_after_split'],
        textPlacementRules: ['headline_above_book', 'cta_below_book', 'free_badge_corner'],
        captionAnchors: ['download the guide', 'get your free copy', 'grab the book'],
        validity: { requiredElements: ['3d_book_or_pdf_mockup', 'book_cover_visual'], invalidSubstitutes: ['flat_image_of_text', 'device_showing_pdf'], minimumDescription: 'Real 3D book/guide packaging mockup with visible cover.' },
        boxCLabel: 'Book or PDF cover', boxCHint: 'Upload your book cover, ebook cover, or PDF front page',
        templateNeeds: ['dashboard_product'],
    },
    device_mockup: {
        id: 'device_mockup', labelEn: 'Device Mockup', labelAr: 'مجسم جهاز', icon: '📱',
        description: 'Guide shown on tablet/phone',
        tabs: ['free_guide'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['device_frame', 'content_on_screen', 'hero_holding_or_beside'],
        mustShow: ['tablet_or_phone_frame', 'screenshot_on_device', 'device_shadow'],
        mustAvoid: ['book_3d', 'dashboard_desktop', 'before_after_split'],
        textPlacementRules: ['headline_above_device', 'cta_below'],
        captionAnchors: ['see it on your phone', 'access from any device'],
        validity: { requiredElements: ['device_frame_with_content', 'guide_content_on_screen'], invalidSubstitutes: ['generic_phone_prop', 'blank_screen_device'], minimumDescription: 'Real device frame showing guide content on screen.' },
        boxCLabel: 'Guide screenshot', boxCHint: 'Upload a screenshot of your guide content',
        templateNeeds: ['dashboard_product', 'device_stack'],
    },
    text_only: {
        id: 'text_only', labelEn: 'Text-Only Ad', labelAr: 'إعلان نصي فقط', icon: '✏️',
        description: 'Typography-focused ad — no hero, no universe',
        tabs: ['mini_course', 'live_events', 'free_guide'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['typography_dominant', 'background_color_only'],
        mustShow: ['headline_massive', 'cta_button'], mustAvoid: ['hero_portrait', 'universe_environment', 'person_figure'],
        textPlacementRules: ['headline_fills_canvas', 'cta_anchored_bottom'],
        captionAnchors: [],
        validity: { requiredElements: ['headline', 'cta_button'], invalidSubstitutes: ['hero_portrait', 'environment_scene'], minimumDescription: 'Typography-only design with no hero or environment.' },
        templateNeeds: ['typography_only'],
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// ALLOWED PAIRS MATRIX
// ═══════════════════════════════════════════════════════════════════════════

export interface AllowedPair {
    a: CreativeModeId; b: CreativeModeId; tab: CreativeTab;
    layoutKey: string; templateNeeds: string[]; pairValidity: string;
}

export const ALLOWED_PAIRS: AllowedPair[] = [
    // Mini Course
    { a: 'standard_hero', b: 'value_stack', tab: 'mini_course', layoutKey: 'hero_value_stack', templateNeeds: ['hero_value_stack_split', 'hero_value_stack_panel'], pairValidity: 'Must contain real stack zone with multiple item rows.' },
    { a: 'standard_hero', b: 'limited_access', tab: 'mini_course', layoutKey: 'hero_limited_access', templateNeeds: ['hero_focus'], pairValidity: 'Must show hero and VIP gate/countdown.' },
    { a: 'standard_hero', b: 'module_preview', tab: 'mini_course', layoutKey: 'hero_module_preview', templateNeeds: ['dashboard_product'], pairValidity: 'Must show course/module preview alongside hero.' },
    { a: 'value_stack', b: 'limited_access', tab: 'mini_course', layoutKey: 'value_stack_limited', templateNeeds: ['hero_value_stack_split', 'hero_value_stack_panel'], pairValidity: 'Must show value stack AND exclusive indicators.' },
    { a: 'module_preview', b: 'limited_access', tab: 'mini_course', layoutKey: 'module_limited', templateNeeds: ['dashboard_product'], pairValidity: 'Must show module preview AND exclusive indicators.' },
    // Live Events
    { a: 'standard_hero', b: 'event_ticket', tab: 'live_events', layoutKey: 'hero_ticket', templateNeeds: ['event_ticket'], pairValidity: 'Must show hero and ticket structure.' },
    { a: 'standard_hero', b: 'webinar_screen', tab: 'live_events', layoutKey: 'hero_screen', templateNeeds: ['dashboard_product'], pairValidity: 'Must show hero with screen framing.' },
    { a: 'standard_hero', b: 'day_strip', tab: 'live_events', layoutKey: 'hero_day_strip', templateNeeds: ['event_ticket'], pairValidity: 'Must show hero with day sequence strip.' },
    { a: 'standard_hero', b: 'speaker_card', tab: 'live_events', layoutKey: 'hero_speaker', templateNeeds: ['authority_proof', 'event_ticket'], pairValidity: 'Must show hero and speaker identity block.' },
    { a: 'event_ticket', b: 'day_strip', tab: 'live_events', layoutKey: 'ticket_day_strip', templateNeeds: ['event_ticket'], pairValidity: 'Must show ticket structure and day schedule.' },
    { a: 'event_ticket', b: 'speaker_card', tab: 'live_events', layoutKey: 'ticket_speaker', templateNeeds: ['event_ticket'], pairValidity: 'Must show ticket and speaker identity.' },
    { a: 'webinar_screen', b: 'day_strip', tab: 'live_events', layoutKey: 'screen_day_strip', templateNeeds: ['dashboard_product'], pairValidity: 'Must show screen with day schedule.' },
    { a: 'webinar_screen', b: 'speaker_card', tab: 'live_events', layoutKey: 'screen_speaker', templateNeeds: ['dashboard_product'], pairValidity: 'Must show screen with speaker identity.' },
    { a: 'day_strip', b: 'speaker_card', tab: 'live_events', layoutKey: 'day_strip_speaker', templateNeeds: ['event_ticket'], pairValidity: 'Must show day schedule and speaker identity.' },
    // Free Guide
    { a: 'standard_hero', b: 'book_mockup', tab: 'free_guide', layoutKey: 'hero_book', templateNeeds: ['dashboard_product'], pairValidity: 'Must show hero with real book mockup.' },
    { a: 'standard_hero', b: 'device_mockup', tab: 'free_guide', layoutKey: 'hero_device', templateNeeds: ['dashboard_product', 'device_stack'], pairValidity: 'Must show hero with real device mockup.' },
    { a: 'book_mockup', b: 'device_mockup', tab: 'free_guide', layoutKey: 'book_device', templateNeeds: ['device_stack'], pairValidity: 'Must show both book and device packaging.' },
];

export const DISALLOWED_PAIRS: { a: CreativeModeId; b: CreativeModeId; reason: string }[] = [
    { a: 'value_stack', b: 'module_preview', reason: 'Two dense secondary structures compete and collapse the layout.' },
    { a: 'event_ticket', b: 'webinar_screen', reason: 'Two anchor structures compete and create clutter.' },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINATION VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════

export interface CombinationValidation {
    valid: boolean; errors: string[]; warnings: string[];
    resolvedTab: CreativeTab | null; resolvedPair: AllowedPair | null;
}

export function validateCombination(selectedModes: string[], hookAngle?: string): CombinationValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    let resolvedTab: CreativeTab | null = null;
    let resolvedPair: AllowedPair | null = null;
    const modes = (selectedModes || []).filter(Boolean) as CreativeModeId[];

    if (modes.length === 0) { errors.push('At least one mode required.'); return { valid: false, errors, warnings, resolvedTab, resolvedPair }; }
    if (modes.length > 2) { errors.push('Maximum 2 modes allowed.'); return { valid: false, errors, warnings, resolvedTab, resolvedPair }; }

    for (const m of modes) {
        if (!CREATIVE_MODE_CATALOG[m]) { errors.push(`Unknown or removed mode: "${m}".`); }
    }
    if (errors.length > 0) return { valid: false, errors, warnings, resolvedTab, resolvedPair };

    // Tab check
    const tabSets = modes.map(m => new Set(CREATIVE_MODE_CATALOG[m].tabs));
    const commonTabs = [...tabSets[0]].filter(t => tabSets.every(s => s.has(t)));
    if (commonTabs.length === 0) {
        errors.push(`Cross-tab combination: ${modes.join(' + ')}. Modes must be from the same tab.`);
        return { valid: false, errors, warnings, resolvedTab, resolvedPair };
    }
    resolvedTab = commonTabs[0];

    if (modes.length === 1) {
        const meta = CREATIVE_MODE_CATALOG[modes[0]];
        if (!meta.standaloneAllowed) {
            errors.push(`"${meta.labelEn}" is support-only and cannot be used alone.`);
        }
        return { valid: errors.length === 0, errors, warnings, resolvedTab, resolvedPair };
    }

    const [a, b] = modes;
    const disallowed = DISALLOWED_PAIRS.find(d => (d.a === a && d.b === b) || (d.a === b && d.b === a));
    if (disallowed) {
        errors.push(`"${CREATIVE_MODE_CATALOG[a].labelEn}" + "${CREATIVE_MODE_CATALOG[b].labelEn}": ${disallowed.reason}`);
        return { valid: false, errors, warnings, resolvedTab, resolvedPair };
    }

    const pair = ALLOWED_PAIRS.find(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
    if (!pair) {
        errors.push(`"${CREATIVE_MODE_CATALOG[a].labelEn}" + "${CREATIVE_MODE_CATALOG[b].labelEn}" is not an allowed combination.`);
        return { valid: false, errors, warnings, resolvedTab, resolvedPair };
    }
    resolvedPair = pair;

    if (hookAngle) {
        const blocked = HOOK_ANGLE_CREATIVE_CONFLICTS[hookAngle] || [];
        for (const m of modes) {
            if (blocked.includes(m)) {
                errors.push(`"${CREATIVE_MODE_CATALOG[m].labelEn}" incompatible with "${hookAngle}" hook angle.`);
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings, resolvedTab, resolvedPair };
}

export const HOOK_ANGLE_CREATIVE_CONFLICTS: Record<string, CreativeModeId[]> = {
    before_after: ['event_ticket', 'speaker_card', 'day_strip', 'webinar_screen', 'book_mockup', 'device_mockup', 'module_preview', 'value_stack', 'limited_access'],
};

export function getBlockedModes(selectedModes: string[], activeTab: CreativeTab, hookAngle?: string): { blockedIds: Set<string>; reasons: Record<string, string> } {
    const blockedIds = new Set<string>();
    const reasons: Record<string, string> = {};
    const selected = (selectedModes || []) as CreativeModeId[];

    for (const [id, meta] of Object.entries(CREATIVE_MODE_CATALOG)) {
        if (!meta.tabs.includes(activeTab)) { blockedIds.add(id); reasons[id] = 'Not in this tab'; }
    }

    if (selected.length === 1 && selected[0] !== 'standard_hero') {
        const sel = selected[0];
        for (const [id] of Object.entries(CREATIVE_MODE_CATALOG)) {
            if (id === sel || blockedIds.has(id)) continue;
            const isPairAllowed = ALLOWED_PAIRS.some(p => (p.a === sel && p.b === id) || (p.a === id && p.b === sel));
            if (!isPairAllowed) { blockedIds.add(id); reasons[id] = `No pair with ${CREATIVE_MODE_CATALOG[sel as CreativeModeId]?.labelEn || sel}`; }
        }
    }

    if (hookAngle) {
        const blocked = HOOK_ANGLE_CREATIVE_CONFLICTS[hookAngle] || [];
        for (const b of blocked) { if (!selected.includes(b as CreativeModeId)) { blockedIds.add(b); reasons[b] = `Blocked by "${hookAngle}"`; } }
    }

    return { blockedIds, reasons };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAIR COMPOSITION SPECS
// ═══════════════════════════════════════════════════════════════════════════

interface PairSpec {
    layoutKey: string; labelEn: string; labelAr: string;
    blueprintEn: string; blueprintAr: string;
    mustShow: string[]; mustAvoid: string[]; visualHierarchy: string[];
    textPlacementRules: string[]; captionAnchors: string[];
}

const PAIR_SPECS: Record<string, PairSpec> = {
    'standard_hero+value_stack': {
        layoutKey: 'hero_value_stack', labelEn: 'Hero + Value Stack', labelAr: 'بطل + تراكم القيمة',
        blueprintEn: 'Dominant hero with visible stack of 3-5 value items beside or below. Total value vs actual price prominent.',
        blueprintAr: 'بطل بارز مع تراكم مرئي من 3-5 عناصر قيمة بجانبه أو أسفله.',
        mustShow: ['hero_dominant', 'value_items_3_5', 'individual_prices', 'total_value', 'actual_price', 'savings_callout'],
        mustAvoid: ['ticket_layout', 'before_after_split', 'day_progression'],
        visualHierarchy: ['hero_60pct', 'stack_items_beside', 'total_price_bottom'],
        textPlacementRules: ['headline_top', 'stack_items_right_or_below', 'price_contrast_large_bottom'],
        captionAnchors: ['look at everything you get', 'total value', 'you pay only'],
    },
    'standard_hero+limited_access': {
        layoutKey: 'hero_limited_access', labelEn: 'Hero + Limited Access', labelAr: 'بطل + وصول محدود',
        blueprintEn: 'Hero behind VIP gate/rope. Countdown or spots-left prominent.',
        blueprintAr: 'بطل خلف بوابة VIP. عد تنازلي بارز.',
        mustShow: ['hero_portrait', 'vip_gate_or_rope', 'countdown_or_limit', 'exclusive_badge'],
        mustAvoid: ['value_stack_items', 'before_after_split'],
        visualHierarchy: ['hero_behind_gate', 'gate_visual', 'countdown_overlay'],
        textPlacementRules: ['headline_above_gate', 'countdown_center', 'cta_unlock_button'],
        captionAnchors: ['exclusive access', 'limited spots', 'unlock now'],
    },
    'standard_hero+module_preview': {
        layoutKey: 'hero_module_preview', labelEn: 'Hero + Module Preview', labelAr: 'بطل + معاينة الوحدات',
        blueprintEn: 'Hero as instructor with module/curriculum cards visible.',
        blueprintAr: 'بطل كمدرب مع بطاقات المنهج.',
        mustShow: ['hero_as_instructor', 'module_list_3_5', 'progress_indicators'],
        mustAvoid: ['before_after_split'],
        visualHierarchy: ['hero_left', 'modules_right_or_below'],
        textPlacementRules: ['headline_top', 'modules_beside_hero', 'cta_bottom'],
        captionAnchors: ['see the modules', 'start learning'],
    },
    'value_stack+limited_access': {
        layoutKey: 'value_stack_limited', labelEn: 'Value Stack + Limited', labelAr: 'تراكم القيمة + وصول محدود',
        blueprintEn: 'Value stack with urgency/exclusive indicators.',
        blueprintAr: 'تراكم القيمة مع مؤشرات حصرية.',
        mustShow: ['value_items_3_5', 'total_value', 'actual_price', 'countdown_or_limit', 'exclusive_badge'],
        mustAvoid: ['before_after_split'],
        visualHierarchy: ['stack_dominant', 'urgency_overlay'],
        textPlacementRules: ['stack_items_center', 'countdown_top_right', 'price_and_cta_bottom'],
        captionAnchors: ['limited offer', 'everything you get', 'spots running out'],
    },
    'module_preview+limited_access': {
        layoutKey: 'module_limited', labelEn: 'Modules + Limited', labelAr: 'وحدات + وصول محدود',
        blueprintEn: 'Module preview with exclusive indicators.',
        blueprintAr: 'معاينة الوحدات مع مؤشرات حصرية.',
        mustShow: ['module_list_3_5', 'countdown_or_limit', 'exclusive_badge'],
        mustAvoid: ['before_after_split'],
        visualHierarchy: ['modules_center', 'urgency_badge'],
        textPlacementRules: ['modules_center', 'countdown_top_right', 'cta_bottom'],
        captionAnchors: ['limited enrollment', 'see the curriculum'],
    },

    // ═══ LIVE EVENTS PAIRS ═══════════════════════════════════════════════════

    'standard_hero+event_ticket': {
        layoutKey: 'hero_ticket', labelEn: 'Hero + Event Ticket', labelAr: 'بطل + تذكرة حدث',
        blueprintEn: 'Hero framed as speaker/host on a premium event ticket. Ticket structure with date, time, seat count.',
        blueprintAr: 'بطل في إطار متحدث على تذكرة حدث. هيكل تذكرة مع التاريخ والوقت.',
        mustShow: ['hero_in_ticket_frame', 'event_title', 'date_time_row', 'live_badge', 'ticket_decorations', 'seat_count_or_cta'],
        mustAvoid: ['standard_hero_environment', 'full_body_standing_pose', 'before_after_split', 'value_stack_items'],
        visualHierarchy: ['ticket_card_dominant', 'hero_portrait_within_ticket', 'metadata_row', 'cta_at_bottom'],
        textPlacementRules: ['event_title_top_of_ticket', 'date_time_center', 'cta_bottom_with_seat_count'],
        captionAnchors: ['register now', 'save your seat', 'live event'],
    },
    'standard_hero+webinar_screen': {
        layoutKey: 'hero_screen', labelEn: 'Hero + Webinar Screen', labelAr: 'بطل + شاشة ويبنار',
        blueprintEn: 'Hero presenting beside a realistic screen/laptop showing the webinar title with LIVE badge.',
        blueprintAr: 'بطل يقدم بجانب شاشة تعرض عنوان الويبنار مع شارة مباشر.',
        mustShow: ['hero_presenting', 'realistic_device_screen', 'webinar_title_on_screen', 'live_red_badge', 'date_time_visible'],
        mustAvoid: ['generic_laptop_as_prop', 'blank_screen', 'before_after_split', 'value_stack_items'],
        visualHierarchy: ['hero_40pct_left', 'screen_40pct_right', 'metadata_below_screen'],
        textPlacementRules: ['headline_above', 'screen_center_right', 'date_below_screen', 'cta_bottom'],
        captionAnchors: ['join live', 'register free', 'webinar'],
    },
    'standard_hero+day_strip': {
        layoutKey: 'hero_day_strip', labelEn: 'Hero + Day Strip', labelAr: 'بطل + شريط الأيام',
        blueprintEn: 'Hero centered with a visible day-by-day progression strip (3-5 days) wrapping around them.',
        blueprintAr: 'بطل في المركز مع شريط تقدم يومي (3-5 أيام) يلتف حوله.',
        mustShow: ['hero_centered', 'day_markers_3_5', 'progress_path_connecting_days', 'day1_highlighted', 'community_count'],
        mustAvoid: ['single_date_label', 'generic_calendar_icon', 'before_after_split', 'value_stack_items'],
        visualHierarchy: ['hero_center', 'day_strip_wrapping', 'day1_glow_accent', 'cta_bottom'],
        textPlacementRules: ['headline_top', 'day_strip_around_hero', 'cta_bottom'],
        captionAnchors: ['join day 1', 'challenge', 'daily progression'],
    },
    'standard_hero+speaker_card': {
        layoutKey: 'hero_speaker', labelEn: 'Hero + Speaker Card', labelAr: 'بطل + بطاقة متحدث',
        blueprintEn: 'Hero as keynote speaker on stage with credentials bar, spotlight, and audience hints.',
        blueprintAr: 'بطل كمتحدث رئيسي على المسرح مع شريط مؤهلات وإضاءة.',
        mustShow: ['hero_on_stage', 'spotlight_lighting', 'credentials_bar', 'speaker_name_title', 'audience_silhouettes'],
        mustAvoid: ['generic_hero_portrait', 'plain_name_text_only', 'before_after_split', 'value_stack_items'],
        visualHierarchy: ['stage_environment', 'hero_speaking_pose', 'lower_third_credentials', 'cta_bottom'],
        textPlacementRules: ['headline_top', 'credentials_lower_third', 'cta_bottom'],
        captionAnchors: ['keynote speaker', 'register', 'expert'],
    },
    'event_ticket+day_strip': {
        layoutKey: 'ticket_day_strip', labelEn: 'Ticket + Day Strip', labelAr: 'تذكرة + شريط أيام',
        blueprintEn: 'Event ticket structure with an integrated day-by-day schedule strip showing challenge/workshop progression.',
        blueprintAr: 'هيكل تذكرة مع شريط جدول يومي يعرض تقدم الورشة.',
        mustShow: ['ticket_frame', 'event_title', 'date_time_row', 'day_markers_3_5', 'progress_path', 'day1_highlighted', 'ticket_decorations'],
        mustAvoid: ['standard_hero_environment', 'value_stack_items', 'before_after_split'],
        visualHierarchy: ['ticket_structure', 'day_schedule_within_ticket', 'metadata_row', 'cta_bottom'],
        textPlacementRules: ['event_title_top', 'day_strip_center', 'date_and_cta_bottom'],
        captionAnchors: ['register for day 1', 'challenge schedule', 'event'],
    },
    'event_ticket+speaker_card': {
        layoutKey: 'ticket_speaker', labelEn: 'Ticket + Speaker', labelAr: 'تذكرة + متحدث',
        blueprintEn: 'Event ticket with speaker identity block: framed portrait, credentials bar, stage context within ticket.',
        blueprintAr: 'تذكرة حدث مع بطاقة هوية المتحدث: صورة مؤطرة وشريط مؤهلات.',
        mustShow: ['ticket_frame', 'event_title', 'speaker_portrait_framed', 'credentials_bar', 'date_time_row', 'ticket_decorations'],
        mustAvoid: ['generic_hero_standing', 'value_stack_items', 'before_after_split'],
        visualHierarchy: ['ticket_structure', 'speaker_identity_within_ticket', 'credentials_strip', 'cta_bottom'],
        textPlacementRules: ['event_title_top', 'speaker_center', 'credentials_below_speaker', 'cta_bottom'],
        captionAnchors: ['featuring speaker', 'register', 'event'],
    },
    'webinar_screen+day_strip': {
        layoutKey: 'screen_day_strip', labelEn: 'Screen + Day Strip', labelAr: 'شاشة + شريط أيام',
        blueprintEn: 'Webinar screen showing session title with day-by-day schedule strip alongside or below.',
        blueprintAr: 'شاشة ويبنار تعرض عنوان الجلسة مع شريط جدول يومي.',
        mustShow: ['realistic_device_screen', 'webinar_title_on_screen', 'live_badge', 'day_markers_3_5', 'progress_path', 'day1_highlighted'],
        mustAvoid: ['blank_screen', 'generic_laptop_prop', 'value_stack_items', 'before_after_split'],
        visualHierarchy: ['screen_top_or_left', 'day_strip_below_or_right', 'cta_bottom'],
        textPlacementRules: ['screen_with_title_top', 'day_strip_below', 'cta_bottom'],
        captionAnchors: ['join the challenge', 'live sessions', 'daily schedule'],
    },
    'webinar_screen+speaker_card': {
        layoutKey: 'screen_speaker', labelEn: 'Screen + Speaker', labelAr: 'شاشة + متحدث',
        blueprintEn: 'Webinar screen with speaker identity — hero presenting beside screen with credentials bar.',
        blueprintAr: 'شاشة ويبنار مع هوية المتحدث — بطل يقدم بجانب الشاشة مع شريط مؤهلات.',
        mustShow: ['realistic_device_screen', 'webinar_title_on_screen', 'live_badge', 'speaker_portrait', 'credentials_bar'],
        mustAvoid: ['blank_screen', 'generic_laptop_prop', 'value_stack_items', 'before_after_split'],
        visualHierarchy: ['screen_center', 'speaker_beside_screen', 'credentials_lower_third', 'cta_bottom'],
        textPlacementRules: ['screen_center', 'speaker_left_or_right', 'credentials_below', 'cta_bottom'],
        captionAnchors: ['live with', 'presented by', 'webinar'],
    },
    'day_strip+speaker_card': {
        layoutKey: 'day_strip_speaker', labelEn: 'Day Strip + Speaker', labelAr: 'شريط أيام + متحدث',
        blueprintEn: 'Speaker on stage with day-by-day challenge schedule integrated — credentials and day progression visible.',
        blueprintAr: 'متحدث على المسرح مع جدول يومي للتحدي — مؤهلات وتقدم يومي مرئي.',
        mustShow: ['hero_on_stage', 'spotlight_lighting', 'credentials_bar', 'day_markers_3_5', 'progress_path', 'day1_highlighted'],
        mustAvoid: ['generic_hero_portrait', 'single_date_label', 'value_stack_items', 'before_after_split'],
        visualHierarchy: ['speaker_top_center', 'day_strip_below', 'credentials_bar', 'cta_bottom'],
        textPlacementRules: ['speaker_name_top', 'day_strip_center', 'cta_bottom'],
        captionAnchors: ['challenge with expert', 'daily sessions', 'start day 1'],
    },

    // ═══ FREE GUIDE PAIRS ════════════════════════════════════════════════════

    'standard_hero+book_mockup': {
        layoutKey: 'hero_book', labelEn: 'Hero + Book Mockup', labelAr: 'بطل + نموذج كتاب',
        blueprintEn: 'Hero standing beside or holding a prominent 3D book/ebook mockup with visible cover.',
        blueprintAr: 'بطل يقف بجانب نموذج كتاب ثلاثي الأبعاد مع غلاف مرئي.',
        mustShow: ['hero_portrait', '3d_book_mockup', 'book_cover_visible', 'free_download_badge', 'chapter_teaser_callouts'],
        mustAvoid: ['flat_image_of_text', 'device_screen_showing_pdf', 'value_stack_items', 'before_after_split'],
        visualHierarchy: ['hero_left_40pct', 'book_right_40pct', 'badge_and_cta_bottom'],
        textPlacementRules: ['headline_top', 'book_center_right', 'free_badge_on_book', 'cta_bottom'],
        captionAnchors: ['download free', 'get your copy', 'free guide'],
    },
    'standard_hero+device_mockup': {
        layoutKey: 'hero_device', labelEn: 'Hero + Device Mockup', labelAr: 'بطل + نموذج جهاز',
        blueprintEn: 'Hero presenting a realistic tablet/phone showing the guide content on screen.',
        blueprintAr: 'بطل يعرض جهاز لوحي/هاتف يظهر محتوى الدليل على الشاشة.',
        mustShow: ['hero_portrait', 'realistic_device_frame', 'guide_content_on_screen', 'key_insight_callout', 'download_badge'],
        mustAvoid: ['blank_device_screen', 'generic_phone_as_prop', 'value_stack_items', 'before_after_split'],
        visualHierarchy: ['hero_left_40pct', 'device_right_40pct', 'callout_and_cta_bottom'],
        textPlacementRules: ['headline_top', 'device_center_right', 'insight_callout_near_device', 'cta_bottom'],
        captionAnchors: ['download free', 'read now', 'free guide'],
    },
    'book_mockup+device_mockup': {
        layoutKey: 'book_device', labelEn: 'Book + Device Stack', labelAr: 'كتاب + جهاز',
        blueprintEn: 'Both book mockup and device mockup visible — book and tablet/phone arranged as a product bundle stack.',
        blueprintAr: 'نموذج كتاب ونموذج جهاز مرئيان — مرتبان كحزمة منتج.',
        mustShow: ['3d_book_mockup', 'book_cover_visible', 'realistic_device_frame', 'guide_content_on_screen', 'free_download_badge', 'bundle_arrangement'],
        mustAvoid: ['single_device_only', 'single_book_only', 'flat_images', 'value_stack_items', 'before_after_split'],
        visualHierarchy: ['book_and_device_center_60pct', 'badge_and_cta_bottom'],
        textPlacementRules: ['headline_top', 'book_left_device_right', 'free_badge_overlay', 'cta_bottom'],
        captionAnchors: ['get it everywhere', 'book and digital', 'free guide'],
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// RESOLVER
// ═══════════════════════════════════════════════════════════════════════════

export interface ResolvedCreativeSpec {
    primaryMode: CreativeModeId; secondaryMode: CreativeModeId | null;
    resolvedLayoutKey: string; resolvedLabelEn: string; resolvedLabelAr: string;
    blueprintSummaryEn: string; blueprintSummaryAr: string;
    mustShow: string[]; mustAvoid: string[]; visualHierarchy: string[];
    textPlacementRules: string[]; captionAnchors: string[];
    incompatibleReasons: string[]; isValid: boolean;
}

export interface ResolverInput { selectedModes: string[]; hookAngle?: string; offerCategory?: string; }

export function resolveCreativeSpec(input: ResolverInput): ResolvedCreativeSpec {
    let modes = (input.selectedModes || []).filter(Boolean) as CreativeModeId[];
    if (modes.length === 0) modes = ['standard_hero'];
    if (modes.length > 2) modes = modes.slice(0, 2);

    const validation = validateCombination(modes, input.hookAngle);

    let primaryMode: CreativeModeId;
    let secondaryMode: CreativeModeId | null = null;

    if (modes.length === 1) {
        primaryMode = modes[0];
    } else {
        const [a, b] = modes;
        const aMeta = CREATIVE_MODE_CATALOG[a]; const bMeta = CREATIVE_MODE_CATALOG[b];
        if (a === 'standard_hero') { primaryMode = a; secondaryMode = b; }
        else if (b === 'standard_hero') { primaryMode = b; secondaryMode = a; }
        else if (aMeta?.role === 'anchor' && bMeta?.role === 'support') { primaryMode = a; secondaryMode = b; }
        else if (bMeta?.role === 'anchor' && aMeta?.role === 'support') { primaryMode = b; secondaryMode = a; }
        else { primaryMode = a; secondaryMode = b; }
    }

    const pairKey1 = `${primaryMode}+${secondaryMode}`;
    const pairKey2 = `${secondaryMode}+${primaryMode}`;
    const pairSpec = PAIR_SPECS[pairKey1] || PAIR_SPECS[pairKey2];
    const pMeta = CREATIVE_MODE_CATALOG[primaryMode];
    const sMeta = secondaryMode ? CREATIVE_MODE_CATALOG[secondaryMode] : null;

    if (pairSpec && secondaryMode) {
        return {
            primaryMode, secondaryMode,
            resolvedLayoutKey: pairSpec.layoutKey, resolvedLabelEn: pairSpec.labelEn, resolvedLabelAr: pairSpec.labelAr,
            blueprintSummaryEn: pairSpec.blueprintEn, blueprintSummaryAr: pairSpec.blueprintAr,
            mustShow: pairSpec.mustShow, mustAvoid: pairSpec.mustAvoid,
            visualHierarchy: pairSpec.visualHierarchy, textPlacementRules: pairSpec.textPlacementRules,
            captionAnchors: pairSpec.captionAnchors,
            incompatibleReasons: validation.errors, isValid: validation.valid,
        };
    }

    const ms = [...(pMeta?.mustShow || []), ...(sMeta?.mustShow || [])];
    const ma = [...(pMeta?.mustAvoid || []), ...(sMeta?.mustAvoid || [])];
    const vh = [...(pMeta?.visualHierarchy || []), ...(sMeta?.visualHierarchy || [])];
    const tp = [...(pMeta?.textPlacementRules || []), ...(sMeta?.textPlacementRules || [])];
    const ca = [...(pMeta?.captionAnchors || []), ...(sMeta?.captionAnchors || [])];
    const lEn = sMeta ? `${pMeta.labelEn} + ${sMeta.labelEn}` : pMeta.labelEn;
    const lAr = sMeta ? `${pMeta.labelAr} + ${sMeta.labelAr}` : pMeta.labelAr;
    const bpEn = sMeta ? `Primary: ${pMeta.labelEn}. Secondary: ${sMeta.labelEn}.` : `${pMeta.labelEn}: ${pMeta.description}`;
    const bpAr = sMeta ? `أساسي: ${pMeta.labelAr}. ثانوي: ${sMeta.labelAr}.` : `${pMeta.labelAr}.`;

    return {
        primaryMode, secondaryMode,
        resolvedLayoutKey: secondaryMode ? `${primaryMode}_${secondaryMode}` : primaryMode,
        resolvedLabelEn: lEn, resolvedLabelAr: lAr,
        blueprintSummaryEn: bpEn, blueprintSummaryAr: bpAr,
        mustShow: [...new Set(ms)], mustAvoid: [...new Set(ma)],
        visualHierarchy: [...new Set(vh)], textPlacementRules: [...new Set(tp)],
        captionAnchors: [...new Set(ca)],
        incompatibleReasons: validation.errors, isValid: validation.valid,
    };
}

// ─── PROMPT HELPERS ─────────────────────────────────────────────────────
export function getResolvedSpecPromptBlock(spec: ResolvedCreativeSpec): string {
    if (spec.primaryMode === 'standard_hero' && !spec.secondaryMode) return '';

    // Gather validity criteria for active modes
    const validityBlocks: string[] = [];
    const modes = [spec.primaryMode, spec.secondaryMode].filter(Boolean) as string[];
    for (const mId of modes) {
        const meta = CREATIVE_MODE_CATALOG[mId as keyof typeof CREATIVE_MODE_CATALOG];
        if (meta?.validity && mId !== 'standard_hero') {
            validityBlocks.push(`${meta.labelEn} VALIDITY:\n  REQUIRED: ${meta.validity.requiredElements.map(e => e.replace(/_/g, ' ')).join(', ')}\n  INVALID SUBSTITUTES: ${meta.validity.invalidSubstitutes.map(e => e.replace(/_/g, ' ')).join(', ')}\n  ${meta.validity.minimumDescription}`);
        }
    }
    // Get pair validity if available
    const pair = ALLOWED_PAIRS.find(p =>
        (p.a === spec.primaryMode && p.b === spec.secondaryMode) ||
        (p.a === spec.secondaryMode && p.b === spec.primaryMode)
    );
    const pairValidityLine = pair ? `\nPAIR RULE: ${pair.pairValidity}` : '';

    const validitySection = validityBlocks.length > 0
        ? `\n\nVALID REPRESENTATION RULES (ENFORCED):\n${validityBlocks.join('\n')}\n⚠️ A generic hero with a tiny branded device/prop does NOT satisfy these rules.${pairValidityLine}`
        : '';

    return `\n═══════════════════════════════════════════════════════════════════════════════\nRESOLVED CREATIVE MODE: ${spec.resolvedLabelEn.toUpperCase()}\nLayout Key: ${spec.resolvedLayoutKey}\n═══════════════════════════════════════════════════════════════════════════════\nCOMPOSITION SPEC:\n${spec.blueprintSummaryEn}\n\nMUST SHOW:\n${spec.mustShow.map(s => `• ${s.replace(/_/g, ' ')}`).join('\n')}\n\nMUST AVOID:\n${spec.mustAvoid.map(s => `• ${s.replace(/_/g, ' ')}`).join('\n')}\n\nVISUAL HIERARCHY:\n${spec.visualHierarchy.map((s, i) => `${i + 1}. ${s.replace(/_/g, ' ')}`).join('\n')}\n\nTEXT PLACEMENT:\n${spec.textPlacementRules.map(s => `• ${s.replace(/_/g, ' ')}`).join('\n')}${validitySection}\n\nThis OVERRIDES the standard hero composition.\n═══════════════════════════════════════════════════════════════════════════════\n`;
}

export function getCaptionCreativeModeAnchors(spec: ResolvedCreativeSpec): string {
    if (spec.primaryMode === 'standard_hero' && !spec.secondaryMode) return '';
    return `- Creative Mode: ${spec.resolvedLabelEn} — reference: ${spec.captionAnchors.map(a => `"${a}"`).join(', ')}.`;
}

// ─── BACKWARD COMPAT ────────────────────────────────────────────────────
export const CONFLICT_MAP: Record<string, Set<string>> = (() => {
    const map: Record<string, Set<string>> = {};
    for (const id of Object.keys(CREATIVE_MODE_CATALOG)) { map[id] = new Set<string>(); }
    for (const d of DISALLOWED_PAIRS) { map[d.a]?.add(d.b); map[d.b]?.add(d.a); }
    for (const [idA, metaA] of Object.entries(CREATIVE_MODE_CATALOG)) {
        for (const [idB, metaB] of Object.entries(CREATIVE_MODE_CATALOG)) {
            if (idA === idB) continue;
            if (metaA.tabs.filter(t => metaB.tabs.includes(t)).length === 0) { map[idA]?.add(idB); }
        }
    }
    return map;
})();

export function validateCreativeModeSelection(selectedModes: string[], hookAngle?: string): { valid: boolean; errors: string[]; warnings: string[] } {
    const v = validateCombination(selectedModes, hookAngle);
    return { valid: v.valid, errors: v.errors, warnings: v.warnings };
}

export function isStrongPair(a: string, b: string): boolean {
    return ALLOWED_PAIRS.some(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));
}

export function getModesForTab(tab: CreativeTab): CreativeModeMeta[] {
    return Object.values(CREATIVE_MODE_CATALOG).filter(m => m.tabs.includes(tab));
}

export function getTabForOfferType(offerType: string): CreativeTab {
    const mapping: Record<string, CreativeTab> = {
        'Free Webinar': 'live_events', 'Paid Workshop': 'live_events', 'Challenge': 'live_events',
        'Live Event': 'live_events',
        'Free Guide': 'free_guide', 'Mini-Course': 'mini_course',
    };
    return mapping[offerType] || 'mini_course';
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-STYLE × MODE COMPATIBILITY MATRIX (Ticket 7 — Client Side)
// ═══════════════════════════════════════════════════════════════════════════

export type SubStyleCompat = 'ok' | 'adapt' | 'block';

export type VisualSubStyleId =
    | 'luxury_magazine' | 'documentary_gritty' | 'neon_urban'
    | 'dark_cinematic' | 'bright_illustrated' | 'mythic_epic'
    | 'vintage_bw' | 'vintage_sepia'
    | 'anime_manga' | 'watercolor_dreamscape' | 'comic_book'
    | 'ugly_ad' | 'cinematic_film_still' | 'clean_corporate' | 'golden_hour_outdoor'
    | 'street_photography' | 'pixel_retro_game' | 'stained_glass' | 'glitch_digital'
    | 'synthwave_80s';

export const SUBSTYLE_MODE_COMPAT: Record<VisualSubStyleId, Record<string, SubStyleCompat>> = {
    luxury_magazine: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'adapt', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'adapt', day_strip: 'adapt', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'adapt', text_only: 'block',
    },
    documentary_gritty: {
        standard_hero: 'ok', value_stack: 'ok', limited_access: 'ok', module_preview: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', day_strip: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
    },
    neon_urban: {
        standard_hero: 'ok', value_stack: 'ok', limited_access: 'ok', module_preview: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', day_strip: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
    },
    dark_cinematic: {
        standard_hero: 'ok', value_stack: 'ok', limited_access: 'ok', module_preview: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', day_strip: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
    },
    bright_illustrated: {
        standard_hero: 'ok', value_stack: 'ok', limited_access: 'ok', module_preview: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', day_strip: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
    },
    mythic_epic: {
        standard_hero: 'ok', value_stack: 'ok', limited_access: 'ok', module_preview: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', day_strip: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
    },
    anime_manga: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'adapt', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', day_strip: 'adapt', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
    },
    watercolor_dreamscape: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'adapt', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', day_strip: 'adapt', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
    },
    vintage_bw: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'adapt', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', day_strip: 'adapt', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
    },
    vintage_sepia: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'adapt', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', day_strip: 'adapt', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
    },
    comic_book: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'adapt', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', day_strip: 'adapt', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
    },
    ugly_ad: {
        standard_hero: 'ok', value_stack: 'ok', limited_access: 'ok', module_preview: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', day_strip: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
    },
    cinematic_film_still: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'ok', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'adapt', day_strip: 'adapt', speaker_card: 'ok',
        book_mockup: 'adapt', device_mockup: 'adapt', text_only: 'block',
    },
    clean_corporate: {
        standard_hero: 'ok', value_stack: 'ok', limited_access: 'ok', module_preview: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', day_strip: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
    },
    golden_hour_outdoor: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'ok', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'adapt', day_strip: 'adapt', speaker_card: 'ok',
        book_mockup: 'adapt', device_mockup: 'adapt', text_only: 'block',
    },
    street_photography: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'ok', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'adapt', day_strip: 'adapt', speaker_card: 'ok',
        book_mockup: 'adapt', device_mockup: 'adapt', text_only: 'block',
    },
    pixel_retro_game: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'adapt', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', day_strip: 'adapt', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
    },
    stained_glass: {
        standard_hero: 'ok', value_stack: 'adapt', limited_access: 'adapt', module_preview: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', day_strip: 'adapt', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
    },
    glitch_digital: {
        standard_hero: 'ok', value_stack: 'ok', limited_access: 'ok', module_preview: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', day_strip: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
    },
    synthwave_80s: {
        standard_hero: 'ok', value_stack: 'ok', limited_access: 'ok', module_preview: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', day_strip: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
    },
};

/**
 * Get all blocked modes for a given sub-style (for UI greying out).
 */
export function getBlockedModesForSubStyle(subStyle: string | undefined | null): Set<string> {
    if (!subStyle) return new Set();
    const matrix = SUBSTYLE_MODE_COMPAT[subStyle as VisualSubStyleId];
    if (!matrix) return new Set();
    const blocked = new Set<string>();
    for (const [mode, compat] of Object.entries(matrix)) {
        if (compat === 'block') blocked.add(mode);
    }
    return blocked;
}

/**
 * Get all blocked sub-styles for a given set of selected modes (for sub-style dropdown filtering).
 */
export function getBlockedSubStylesForModes(selectedModes: string[]): Set<string> {
    const blocked = new Set<string>();
    for (const [subStyle, matrix] of Object.entries(SUBSTYLE_MODE_COMPAT)) {
        for (const mode of selectedModes) {
            if (matrix[mode] === 'block') {
                blocked.add(subStyle);
                break;
            }
        }
    }
    return blocked;
}