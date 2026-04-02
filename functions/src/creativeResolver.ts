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
    | 'value_stack' | 'limited_access' | 'module_preview'
    | 'event_ticket' | 'webinar_screen' | 'day_strip' | 'speaker_card'
    | 'book_mockup' | 'device_mockup'
    | 'text_only';

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
        id: 'text_only', labelEn: 'Text Only', labelAr: 'نص فقط', icon: '✏️',
        description: 'Typography-only ad — no hero, no universe',
        tabs: ['mini_course', 'live_events', 'free_guide'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['typography_dominant', 'color_background', 'layout_structure'],
        mustShow: ['headline_large', 'subheadline', 'cta_button'],
        mustAvoid: ['hero_person', 'universe_environment', 'photos', 'illustrations'],
        textPlacementRules: ['headline_fills_canvas', 'typography_is_the_design'],
        captionAnchors: [],
        validity: { requiredElements: ['typography_layout', 'color_background'], invalidSubstitutes: ['hero_portrait', 'scene_environment'], minimumDescription: 'Typography-only design with no hero or environment.' },
        templateNeeds: [],
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
        'Free Guide': 'free_guide', 'Mini-Course': 'mini_course',
    };
    return mapping[offerType] || 'mini_course';
}

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCH SURFACE VALIDATOR (Phase 1 — Resolver Foundation)
// ═══════════════════════════════════════════════════════════════════════════

export interface LaunchSurfaceResult {
    allowed: boolean;
    reason?: string;
}

export function validateLaunchSurface(inputs: {
    selectedModes: string[];
    campaignType?: string;
    adFormat?: string;
    hookAngle?: string;
}): LaunchSurfaceResult {
    const modes = (inputs.selectedModes || []).filter(Boolean) as CreativeModeId[];
    if (modes.length === 0) return { allowed: true };

    for (const m of modes) {
        if (!CREATIVE_MODE_CATALOG[m]) {
            return { allowed: false, reason: `"${m}" is not a launch-approved mode.` };
        }
    }

    const combo = validateCombination(modes, inputs.hookAngle);
    if (!combo.valid) {
        return { allowed: false, reason: combo.errors[0] || "Invalid combination." };
    }

    return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// CAROUSEL SLIDE COUNT PLAN (Phase 1 — Resolver Foundation)
// ═══════════════════════════════════════════════════════════════════════════

const COLD_ANGLES = ["A", "B", "C", "D", "E", "F", "G"] as const;
const RETARGETING_ANGLES = ["P", "M", "R", "I", "C", "Q", "E"] as const;

export interface SlideRole {
    slide: number;
    role: "hook" | "middle" | "close";
    angle: string;
    hasCTA: boolean;
    photoInjection: boolean;
}

export function carouselSlideCountPlan(
    campaignType: "cold" | "retargeting",
    slideCount: number
): SlideRole[] {
    if (slideCount < 2 || slideCount > 9) {
        throw new Error(`slideCount must be 2-9, got ${slideCount}`);
    }

    const pool = campaignType === "retargeting" ? RETARGETING_ANGLES : COLD_ANGLES;
    const roles: SlideRole[] = [];

    roles.push({
        slide: 1,
        role: "hook",
        angle: pool[0],
        hasCTA: true,
        photoInjection: true,
    });

    let angleIdx = 1;
    for (let i = 2; i <= slideCount - 1; i++) {
        roles.push({
            slide: i,
            role: "middle",
            angle: pool[angleIdx % pool.length],
            hasCTA: false,
            photoInjection: false,
        });
        angleIdx++;
    }

    if (slideCount > 1) {
        roles.push({
            slide: slideCount,
            role: "close",
            angle: pool[angleIdx % pool.length],
            hasCTA: true,
            photoInjection: false,
        });
    }

    return roles;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALUE STACK FUNCTIONS (Phase 1 — Resolver Foundation)
// ═══════════════════════════════════════════════════════════════════════════

export interface ValueStackAdjustment {
    giftCount: number;
    originalSlideCount: number;
    resolvedSlideCount: number;
    capped: boolean;
}

export function resolveValueStackSlideCount(gifts: string[]): ValueStackAdjustment {
    const nonEmpty = gifts.filter(g => g && g.trim().length > 0);
    const giftCount = nonEmpty.length;
    const raw = giftCount + 2;
    const capped = raw > 9;
    const resolvedSlideCount = Math.min(raw, 9);
    return { giftCount, originalSlideCount: raw, resolvedSlideCount, capped };
}

const VALUE_STACK_FIELDS = [
    "valueStackTitle", "valueStackItems", "valueStackBonuses", "valueStackPrice",
    "valueStackOriginalValue", "valueStackSavings", "valueStackGuarantee",
    "valueStackDeliveryFormat", "valueStackProofStatement",
] as const;

export function filterEmptyValueStackFields(inputs: Record<string, unknown>): {
    filtered: Record<string, unknown>;
    skippedFields: string[];
} {
    const filtered = { ...inputs };
    const skippedFields: string[] = [];

    for (const field of VALUE_STACK_FIELDS) {
        const val = filtered[field];
        if (val === undefined || val === null) {
            delete filtered[field];
            skippedFields.push(field);
            continue;
        }
        if (typeof val === "string" && val.trim() === "") {
            delete filtered[field];
            skippedFields.push(field);
            continue;
        }
        if (Array.isArray(val)) {
            const cleaned = val.filter((v: unknown) => v != null && String(v).trim() !== "");
            if (cleaned.length === 0) {
                delete filtered[field];
                skippedFields.push(field);
            } else {
                filtered[field] = cleaned;
            }
        }
    }

    return { filtered, skippedFields };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-STYLE × MODE COMPATIBILITY MATRIX (Ticket 7)
// ═══════════════════════════════════════════════════════════════════════════
// 'ok'    = compatible as-is, no special handling
// 'adapt' = allowed but needs sub-style-specific mode fusion instructions
// 'block' = incompatible, should be prevented in UI

export type SubStyleCompat = 'ok' | 'adapt' | 'block';

export type VisualSubStyleId =
    | 'luxury_magazine' | 'documentary_gritty' | 'neon_urban'
    | 'dark_cinematic' | 'bright_illustrated' | 'mythic_epic'
    | 'vintage_bw' | 'vintage_sepia'
    | 'anime_manga' | 'watercolor_dreamscape' | 'comic_book'
    | 'ugly_ad' | 'cinematic_film_still' | 'clean_corporate' | 'golden_hour_outdoor'
    | 'street_photography' | 'pixel_retro_game' | 'stained_glass' | 'glitch_digital'
    | 'synthwave_80s';

/** Illustration-based sub-styles where device/screen mockups don't make sense */
const ILLUSTRATION_SUBSTYLES: VisualSubStyleId[] = [
    'anime_manga', 'watercolor_dreamscape', 'vintage_bw', 'vintage_sepia', 'comic_book',
    'pixel_retro_game', 'stained_glass',
];

export const SUBSTYLE_MODE_COMPAT: Record<VisualSubStyleId, Record<string, SubStyleCompat>> = {
    luxury_magazine: {
        standard_hero: 'ok',
        value_stack: 'adapt',
        limited_access: 'adapt',
        module_preview: 'adapt',
        event_ticket: 'adapt',
        webinar_screen: 'adapt',
        day_strip: 'adapt',
        speaker_card: 'adapt',
        book_mockup: 'adapt',
        device_mockup: 'adapt',
        text_only: 'block',
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

/** Block reasons for UI tooltips */
const BLOCK_REASONS: Record<string, string> = {
    'text_only': 'Text-only mode has no visual scene — sub-styles are not applicable.',
    'device_mockup_illustration': 'Device screens cannot be rendered in illustration style — they need photorealistic screens showing real content.',
    'webinar_screen_illustration': 'Webinar screens need photorealistic display rendering — incompatible with illustration sub-styles.',
};

export interface SubStyleCompatResult {
    compat: SubStyleCompat;
    reason?: string;
}

/**
 * Check compatibility between a visual sub-style and selected creative modes.
 * Returns the WORST compatibility level among all selected modes.
 */
export function validateSubStyleModeCompat(
    subStyle: string | undefined | null,
    selectedModes: string[]
): SubStyleCompatResult {
    if (!subStyle) return { compat: 'ok' };
    const matrix = SUBSTYLE_MODE_COMPAT[subStyle as VisualSubStyleId];
    if (!matrix) return { compat: 'ok' };

    let worst: SubStyleCompat = 'ok';
    let reason: string | undefined;

    for (const mode of selectedModes) {
        const compat = matrix[mode] || 'ok';
        if (compat === 'block') {
            // Determine reason
            if (mode === 'text_only') {
                reason = BLOCK_REASONS['text_only'];
            } else if ((mode === 'device_mockup' || mode === 'webinar_screen') &&
                       ILLUSTRATION_SUBSTYLES.includes(subStyle as VisualSubStyleId)) {
                reason = BLOCK_REASONS[`${mode}_illustration`] || `${mode} is incompatible with ${subStyle}.`;
            } else {
                reason = `${mode.replace(/_/g, ' ')} is incompatible with ${subStyle.replace(/_/g, ' ')}.`;
            }
            return { compat: 'block', reason };
        }
        if (compat === 'adapt' && worst === 'ok') worst = 'adapt';
    }

    return { compat: worst, reason };
}

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

// ═══════════════════════════════════════════════════════════════════════════
// SUB-STYLE × MODE FUSION INSTRUCTIONS (Ticket 8)
// ═══════════════════════════════════════════════════════════════════════════
// Returns prompt text telling the model how to fuse a sub-style FORMAT with
// a specific creative mode. Only returns content for 'adapt' combos.

export function getSubStyleModeFusion(subStyle: string | null, mode: string): string {
    if (!subStyle) return '';
    const key = `${subStyle}__${mode}`;
    const fusions: Record<string, string> = {
        // ── LUXURY MAGAZINE fusions ──
        'luxury_magazine__value_stack': `LUXURY MAGAZINE COVER × VALUE STACK FUSION:
Stack items styled as MAGAZINE COVER SIDEBAR — bold condensed text, gold accent on prices.
Positioned as a cover feature list alongside the hero's tight crop. Dense, not sparse.
Think: Forbes "Top 10" list format on the cover margin.`,
        'luxury_magazine__event_ticket': `LUXURY MAGAZINE COVER × EVENT TICKET FUSION:
Ticket details styled as COVER FEATURE CALLOUT — date/time as bold cover line text.
Gold metallic badge or banner for event name. Positioned as secondary cover line.
Dense cover layout energy, NOT a separate invitation card.`,
        'luxury_magazine__module_preview': `LUXURY MAGAZINE COVER × MODULE PREVIEW FUSION:
Modules styled as COVER FEATURE LIST — bold numbered entries as cover lines alongside hero.
Condensed sans-serif, gold numbering. Dense cover sidebar energy, NOT a separate contents page.`,
        'luxury_magazine__webinar_screen': `LUXURY MAGAZINE COVER × WEBINAR SCREEN FUSION:
Screen element as COVER FEATURE BADGE — small device icon or screen thumbnail positioned as a cover callout.
Does not dominate — hero dominates. Screen is a supporting detail in the cover layout.`,
        'luxury_magazine__speaker_card': `LUXURY MAGAZINE COVER × SPEAKER CARD FUSION:
Credentials styled as COVER BYLINE — name and title as bold cover text below hero's chin.
Gold accent on credentials. Think: Forbes cover subject identification bar.`,
        'luxury_magazine__book_mockup': `LUXURY MAGAZINE COVER × BOOK MOCKUP FUSION:
Book as COVER FEATURE ELEMENT — small 3D book thumbnail positioned in corner or bottom as "featured product."
Hero still dominates 70%. Book is a supporting cover callout, not the centerpiece.`,
        'luxury_magazine__device_mockup': `LUXURY MAGAZINE COVER × DEVICE MOCKUP FUSION:
Device as COVER FEATURE ELEMENT — small device thumbnail in corner as "featured product."
Hero still dominates 70%. Device is a supporting cover callout.`,
        'luxury_magazine__day_strip': `LUXURY MAGAZINE COVER × DAY STRIP FUSION:
Days styled as COVER FEATURE NUMBERS — bold day count as cover callout text.
"5-Day Challenge" as a bold cover line. Gold accent on numbers. NOT a separate timeline strip.`,
        'luxury_magazine__limited_access': `LUXURY MAGAZINE COVER × LIMITED ACCESS FUSION:
Exclusivity as COVER BADGE — gold "EXCLUSIVE" or "LIMITED EDITION" badge stamp in corner.
Premium scarcity energy. Think: "Special Collector's Edition" cover seal.`,

        // ── ANIME/MANGA fusions ──
        'anime_manga__value_stack': `ANIME/MANGA × VALUE STACK FUSION:
Stack items rendered as MANGA INVENTORY PANELS — each item in its own mini-panel with bold outline border.
Anime-style item icons. Starburst emphasis on total value. Think: RPG loot screen or manga power-up list.`,
        'anime_manga__event_ticket': `ANIME/MANGA × EVENT TICKET FUSION:
Ticket rendered as MANGA CHAPTER SPLASH PAGE — bold panel borders, dynamic composition, event title as
manga chapter title with speed lines. Date/time in bold manga lettering. Action energy throughout.`,
        'anime_manga__module_preview': `ANIME/MANGA × MODULE PREVIEW FUSION:
Curriculum rendered as MANGA CHAPTER LIST — each module as a manga volume/chapter entry with bold numbering
and anime-style icons. Think: manga series volume listing with cel-shaded chapter previews.`,
        'anime_manga__speaker_card': `ANIME/MANGA × SPEAKER CARD FUSION:
Speaker rendered as ANIME CHARACTER CARD — hero as anime character portrait, credentials as
stat-block or character bio panel. Bold outlines, cel-shading. Think: anime trading card or character select screen.`,
        'anime_manga__book_mockup': `ANIME/MANGA × BOOK MOCKUP FUSION:
Book rendered as MANGA VOLUME — bold illustrated cover in anime style, thick spine, manga format proportions.
Think: actual manga tankōbon volume. Cover art in cel-shaded anime style.`,
        'anime_manga__day_strip': `ANIME/MANGA × DAY STRIP FUSION:
Day strip rendered as MANGA PANEL SEQUENCE — each day as a mini panel in a horizontal strip.
Bold panel borders, sequential manga flow. Day numbers in bold manga lettering.`,
        'anime_manga__limited_access': `ANIME/MANGA × LIMITED ACCESS FUSION:
VIP gate rendered as ANIME BARRIER — energy shield, mystical gate, or dramatic anime door.
"Limited" badge as manga starburst. Dramatic action-line framing around the exclusive zone.`,

        // ── VINTAGE B&W fusions ──
        'vintage_bw__value_stack': `VINTAGE B&W × VALUE STACK FUSION:
Stack rendered as VINTAGE NEWSPAPER AD LIST — ink-drawn item illustrations next to bold serif labels.
Prices in heavy typeset numerals. Thick ink dividers between items. "Total Value" in banner-style typeset.`,
        'vintage_bw__event_ticket': `VINTAGE B&W × EVENT TICKET FUSION:
Ticket rendered as VINTAGE BROADSHEET EVENT NOTICE — bold serif headline, ink-illustrated border,
ticket tear-line detail. Date/time in typeset column style. Think: 1950s boxing match poster or theater playbill.`,
        'vintage_bw__module_preview': `VINTAGE B&W × MODULE PREVIEW FUSION:
Curriculum rendered as VINTAGE COURSE CATALOG — numbered ink headings, column layout, typeset quality.
Think: 1950s university course bulletin or vintage correspondence course advertisement.`,
        'vintage_bw__speaker_card': `VINTAGE B&W × SPEAKER CARD FUSION:
Speaker rendered as VINTAGE INK PORTRAIT with credentials in bold typeset below. Cross-hatched portrait
illustration. Thick ink border around credentials block. Think: vintage newspaper editorial portrait.`,
        'vintage_bw__book_mockup': `VINTAGE B&W × BOOK MOCKUP FUSION:
Book rendered as VINTAGE INK ILLUSTRATION of a bound volume. Cross-hatched cover detail.
Bold typeset title on spine/cover. Think: classic 1940s book advertisement illustration.`,
        'vintage_bw__day_strip': `VINTAGE B&W × DAY STRIP FUSION:
Day strip rendered as VINTAGE CALENDAR STRIP — ink-drawn day boxes with typeset numbers.
Decorative ink borders. Think: vintage newspaper serial schedule announcement.`,
        'vintage_bw__limited_access': `VINTAGE B&W × LIMITED ACCESS FUSION:
VIP gate rendered as VINTAGE INK ILLUSTRATION — ornate iron gate, velvet rope in cross-hatching.
"Limited" in bold typeset banner. Think: vintage "Members Only" club advertisement.`,

        // ── VINTAGE SEPIA fusions (same as B&W but sepia-toned) ──
        'vintage_sepia__value_stack': `VINTAGE SEPIA × VALUE STACK FUSION:
Same as Vintage B&W value stack — but all ink in warm sepia/amber tones on aged parchment background.`,
        'vintage_sepia__event_ticket': `VINTAGE SEPIA × EVENT TICKET FUSION:
Same as Vintage B&W ticket — warm sepia broadsheet event notice on aged parchment.`,
        'vintage_sepia__module_preview': `VINTAGE SEPIA × MODULE PREVIEW FUSION:
Same as Vintage B&W curriculum — warm sepia course catalog on aged parchment.`,
        'vintage_sepia__speaker_card': `VINTAGE SEPIA × SPEAKER CARD FUSION:
Same as Vintage B&W speaker portrait — warm sepia ink on parchment.`,
        'vintage_sepia__book_mockup': `VINTAGE SEPIA × BOOK MOCKUP FUSION:
Same as Vintage B&W book — warm sepia ink illustration of bound volume on aged paper.`,
        'vintage_sepia__day_strip': `VINTAGE SEPIA × DAY STRIP FUSION:
Same as Vintage B&W day strip — warm sepia calendar strip on aged parchment.`,
        'vintage_sepia__limited_access': `VINTAGE SEPIA × LIMITED ACCESS FUSION:
Same as Vintage B&W VIP gate — warm sepia ink ornate gate illustration.`,

        // ── COMIC BOOK fusions ──
        'comic_book__value_stack': `COMIC BOOK × VALUE STACK FUSION:
Stack rendered as COMIC LOOT/INVENTORY PANEL — each item in bold 4-color illustration with thick outlines.
Halftone shading on backgrounds. "POW" starburst on total value. Think: superhero equipment loadout page.`,
        'comic_book__event_ticket': `COMIC BOOK × EVENT TICKET FUSION:
Ticket rendered as COMIC EVENT SPLASH — bold panel border, action-styled event title,
dynamic composition with speed lines. Date/time in bold comic lettering. Think: comic issue #1 cover.`,
        'comic_book__module_preview': `COMIC BOOK × MODULE PREVIEW FUSION:
Curriculum rendered as COMIC ISSUE TABLE OF CONTENTS — bold numbered entries with comic-style icons.
Halftone backgrounds. Think: comic series issue listing with thumbnail previews.`,
        'comic_book__speaker_card': `COMIC BOOK × SPEAKER CARD FUSION:
Speaker rendered as COMIC CHARACTER PORTRAIT — bold outlines, flat colors, heroic pose.
Credentials in comic lettering panel below. Think: comic character introduction page.`,
        'comic_book__book_mockup': `COMIC BOOK × BOOK MOCKUP FUSION:
Book rendered as COMIC BOOK ISSUE — bold illustrated cover, thick spine, comic format.
Cover art in 4-color comic style. Think: actual comic book or graphic novel cover.`,
        'comic_book__day_strip': `COMIC BOOK × DAY STRIP FUSION:
Day strip rendered as COMIC PANEL SEQUENCE — each day as a bold-bordered panel in sequential flow.
Action lines between panels. Day numbers in bold comic lettering.`,
        'comic_book__limited_access': `COMIC BOOK × LIMITED ACCESS FUSION:
VIP gate rendered as COMIC FORCE FIELD/BARRIER — bold energy lines, dramatic comic gate.
"Limited" in starburst caption. Think: comic book villain's lair entrance.`,

        // ── WATERCOLOR fusions ──
        'watercolor_dreamscape__value_stack': `WATERCOLOR × VALUE STACK FUSION:
Stack items rendered as SOFT PAINTED CARDS — each item on a watercolor wash card, bleeding edges.
Handwritten-feel labels. Soft gold accents on values. Think: artisan menu or handcrafted price list.`,
        'watercolor_dreamscape__event_ticket': `WATERCOLOR × EVENT TICKET FUSION:
Ticket rendered as PAINTED INVITATION — watercolor wash background, handwritten-feel title,
soft floral or abstract border details. Think: artisan wedding invitation or gallery opening card.`,
        'watercolor_dreamscape__module_preview': `WATERCOLOR × MODULE PREVIEW FUSION:
Curriculum rendered as PAINTED JOURNEY MAP — soft watercolor path with module stops along it.
Handwritten labels. Dreamy, flowing layout. Think: illustrated children's book table of contents.`,
        'watercolor_dreamscape__speaker_card': `WATERCOLOR × SPEAKER CARD FUSION:
Speaker rendered as WATERCOLOR PORTRAIT — soft painted face, bleeding edges into background washes.
Credentials in delicate handwritten-feel type. Think: artist's self-portrait with bio.`,
        'watercolor_dreamscape__book_mockup': `WATERCOLOR × BOOK MOCKUP FUSION:
Book rendered as PAINTED ILLUSTRATION of a book — soft watercolor cover art, painted paper texture.
Think: hand-illustrated book cover for an artisan publication.`,
        'watercolor_dreamscape__day_strip': `WATERCOLOR × DAY STRIP FUSION:
Day strip rendered as PAINTED STEPPING STONES — soft watercolor circles along a flowing path.
Day numbers in gentle handwritten style. Think: garden stepping stones through a watercolor landscape.`,
        'watercolor_dreamscape__limited_access': `WATERCOLOR × LIMITED ACCESS FUSION:
VIP gate rendered as SOFT PAINTED GARDEN GATE — watercolor vines and flowers framing a gentle barrier.
"Limited" in delicate handwritten script. Think: secret garden entrance.`,
    };

    return fusions[key] || '';
}

// ═══════════════════════════════════════════════════════════════════════════
// BEFORE/AFTER × SUB-STYLE FUSION (Ticket 9)
// ═══════════════════════════════════════════════════════════════════════════

export function getBeforeAfterSubStyleFusion(subStyle: string | null): string {
    if (!subStyle) return '';
    const fusions: Record<string, string> = {
        luxury_magazine: `BEFORE/AFTER × LUXURY MAGAZINE COVER FUSION:
- TWO MAGAZINE COVERS side by side — before cover and after cover.
- Before half: muted/desaturated dark background, hero in basic clothing, less confident expression. "Before" cover star energy.
- After half: rich bold dark background, hero in power wardrobe, commanding expression. "After" cover star energy.
- BOTH halves: tight crop waist-up, hero fills each half, cover-style text layout.
- Divider: gold metallic vertical line or split. Each half feels like a different magazine issue.
- FORBIDDEN: white backgrounds, environmental scenes, full body shots.`,

        documentary_gritty: `BEFORE/AFTER × DOCUMENTARY GRITTY FUSION:
- TWO real desaturated environments — before is a struggling authentic scene, after is the success scene.
- Both halves maintain film grain, natural light, photojournalistic quality.
- Before: dimmer, cooler light, messier environment. After: warmer light, organized, elevated.
- Visible divider: torn photo edge or raw film strip separator. NOT a clean geometric line.`,

        neon_urban: `BEFORE/AFTER × NEON URBAN FUSION:
- Before half: dark alley or dim street with COLD neon (blue/purple only, muted). Hero in shadow.
- After half: vibrant main street with WARM neon (pink/amber/cyan, bright). Hero lit by multiple neons.
- Divider: neon light bar transition between halves — a vertical neon tube separating the two scenes.
- Wet pavement reflections change color between halves.`,

        anime_manga: `BEFORE/AFTER × ANIME/MANGA FUSION:
- TWO MANGA PANELS side by side — before panel and after panel with bold panel border between them.
- Before panel: muted anime colors, simplified dejected pose, grey/blue tone. Speed lines suggest struggle.
- After panel: vibrant saturated anime colors, dynamic confident pose, warm/gold tone. Starburst effects.
- Panel gutter (divider): thick black manga panel border. Optional: dramatic diagonal split.`,

        vintage_bw: `BEFORE/AFTER × VINTAGE B&W FUSION:
- TWO INK ILLUSTRATIONS in split composition inside the thick border frame.
- Before half: heavy cross-hatching (darker, denser ink = heavier mood). Slumped pose, cluttered scene.
- After half: lighter cross-hatching (cleaner, less ink = clarity and lightness). Upright pose, organized scene.
- Divider: thick vertical ink line or torn-paper illustration effect.`,

        vintage_sepia: `BEFORE/AFTER × VINTAGE SEPIA FUSION:
- Same as Vintage B&W split — but all in warm sepia tones on aged parchment.
- Before: darker brown ink density. After: lighter amber ink with more parchment showing through.`,

        comic_book: `BEFORE/AFTER × COMIC BOOK FUSION:
- TWO COMIC PANELS — before panel and after panel with thick black panel gutter.
- Before panel: muted 4-color palette (desaturated), halftone dots denser. Hero in struggle pose.
- After panel: vivid 4-color palette (full saturation), lighter halftone. Hero in triumphant pose.
- Optional: diagonal panel split for more dynamic energy. Action lines in after panel.`,

        watercolor_dreamscape: `BEFORE/AFTER × WATERCOLOR FUSION:
- Before half: cool-toned watercolor washes (grey-blue, muted). Edges bleed into darker pools.
- After half: warm-toned washes (golden, rose, sage). Edges bleed into lighter, brighter pools.
- Divider: natural watercolor bleeding boundary where cool and warm washes meet and blend.
- The transition feels organic and painterly, not geometric.`,

        dark_cinematic: `BEFORE/AFTER × DARK CINEMATIC FUSION:
- Before half: near-total darkness, hero barely visible, cold single light source. Smoke heavy.
- After half: dramatic key light illuminating hero powerfully, warm rim glow. Particles catch light.
- Divider: dramatic light beam or shaft of light cutting vertically between halves.`,

        bright_illustrated: `BEFORE/AFTER × BRIGHT ILLUSTRATED FUSION:
- Before half: slightly muted warm tones, cloudy/overcast illustrated lighting. Subdued.
- After half: full bright warm saturation, golden sunshine lighting. Vibrant and inviting.
- Divider: painted sunbeam breaking through or warm gradient transition.`,

        mythic_epic: `BEFORE/AFTER × MYTHIC EPIC FUSION:
- Before half: dark, cold jewel tones (deep blue/grey). Hero in shadow, no magical particles.
- After half: rich warm jewel tones (gold/emerald/crimson). Hero illuminated, magical particles swirling.
- Divider: magical energy barrier or mystical portal edge between the two halves.`,

        ugly_ad: `BEFORE/AFTER × UGLY AD FUSION:
- TWO SCREENSHOTS side by side — before: messy notes/chat showing the problem. After: clean result screenshot.
- Or: same person casual selfie, before=frustrated face, after=smiling with results visible.
- Divider: rough hand-drawn red line or torn paper edge. Deliberately imperfect.`,

        cinematic_film_still: `BEFORE/AFTER × CINEMATIC FILM STILL FUSION:
- TWO MOVIE FRAMES — before: cold color grade, harsh lighting, hero in struggle scene.
- After: warm color grade, golden motivated lighting, hero in triumph scene.
- Both have 35mm grain and cinematic DOF. Divider: film strip perforation edge.`,

        clean_corporate: `BEFORE/AFTER × CLEAN CORPORATE FUSION:
- SAME neutral gradient background both halves — contrast through WARDROBE and EXPRESSION only.
- Before: slightly rumpled, tired expression, muted clothing. After: sharp, confident, premium attire.
- Divider: clean thin vertical line. Subtle, corporate, brand-safe.`,

        golden_hour_outdoor: `BEFORE/AFTER × GOLDEN HOUR FUSION:
- Before half: overcast/cloudy outdoor, cool flat light, hero looking constrained.
- After half: full golden hour warmth, amber backlight rim glow, hero looking free and confident.
- Divider: beam of golden light breaking through between halves.`,

        street_photography: `BEFORE/AFTER × STREET PHOTOGRAPHY FUSION:
- Before half: grey, crowded urban scene, hero lost in the crowd, desaturated.
- After half: open street, hero standing out, slightly warmer tones, more space around them.
- Both candid street-level. Divider: lamp post or urban element splitting the frame.`,

        pixel_retro_game: `BEFORE/AFTER × PIXEL RETRO GAME FUSION:
- TWO GAME SCREENS — before: dark dungeon/losing scene, low health bar, defeated sprite.
- After: victory screen, full health, triumphant sprite pose, gold coins/stars.
- Divider: pixel art VS screen divider or level-complete transition.`,

        stained_glass: `BEFORE/AFTER × STAINED GLASS FUSION:
- TWO GLASS PANELS side by side in same window frame — before: cool dark jewel tones (blue/grey),
  hero figure in bowed/struggling pose. After: warm bright jewel tones (gold/ruby), hero upright/regal.
- Lead-line divider column between panels. Same sacred art style both sides.`,

        glitch_digital: `BEFORE/AFTER × GLITCH DIGITAL FUSION:
- Before half: HEAVILY corrupted — dense glitch bands, almost unreadable, hero fragmenting.
- After half: MOSTLY clean with subtle stylish glitch accents — hero clear and strong.
- Divider: cascading glitch corruption line that transitions from heavy to light.`,

        synthwave_80s: `BEFORE/AFTER × SYNTHWAVE FUSION:
- Before half: dim, broken neon grid, flickering/dying sunset, muted colors.
- After half: full neon intensity, vivid grid, blazing chrome sunset, peak synthwave energy.
- Divider: neon light beam transition — power surge from dim to full brightness.`,
    };
    return fusions[subStyle] || '';
}