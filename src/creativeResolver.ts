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
    | 'testimonial_carousel'
    | 'event_ticket' | 'webinar_screen' | 'speaker_card'
    | 'book_mockup' | 'device_mockup'
    | 'text_only'
    | 'before_after';

export type RemovedModeId =
    | 'preview_card' | 'premium_package' | 'platform_screenshot' | 'certificate'
    | 'dashboard_preview' | 'mobile_app_card' | 'feature_highlight'
    | 'community_card' | 'inside_look';

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
    soloOnly?: boolean;
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
    before_after: {
        id: 'before_after', labelEn: 'Before/After', labelAr: 'قبل/بعد', icon: '🔄',
        description: 'Transformation split design',
        tabs: ['mini_course', 'live_events', 'free_guide'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['split_canvas', 'before_state', 'after_state'],
        mustShow: ['before_state_visual', 'after_state_visual', 'transformation_indicator'], mustAvoid: ['generic_transformation_text'],
        textPlacementRules: ['headline_spans_both', 'cta_bottom_center'], captionAnchors: [],
        validity: { requiredElements: ['split_visual', 'clear_before_and_after'], invalidSubstitutes: ['single_image_no_split'], minimumDescription: 'Clear split-canvas showing before and after states.' },
        soloOnly: true,
        templateNeeds: ['split_canvas'],
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
        soloOnly: true,
        templateNeeds: ['typography_only'],
    },
    testimonial_carousel: {
        id: 'testimonial_carousel', labelEn: 'Testimonial Carousel', labelAr: 'كاروسيل الشهادات', icon: '💬',
        description: 'Carousel of testimonial screenshots rendered in platform mockup frames',
        tabs: ['mini_course', 'live_events', 'free_guide'], role: 'anchor', standaloneAllowed: true,
        visualHierarchy: ['testimonial_mockup', 'platform_frame', 'cta_button'],
        mustShow: ['testimonial_mockup', 'platform_frame', 'cta_button'],
        mustAvoid: ['raw_screenshot', 'testimonial_text_on_hook'],
        textPlacementRules: ['hook_text_top', 'mockup_center', 'cta_bottom'],
        captionAnchors: ['see what they said', 'real results', 'testimonials'],
        validity: { requiredElements: ['testimonial_slides', 'platform_frame'], invalidSubstitutes: ['plain_screenshot_paste', 'text_only_testimonial'], minimumDescription: 'Testimonial screenshots inside platform mockup frames with hook and close slides.' },
        templateNeeds: ['testimonial_carousel'],
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
    { a: 'standard_hero', b: 'value_stack', tab: 'mini_course', layoutKey: 'hero_value_stack', templateNeeds: ['hero_value_stack_split', 'hero_value_stack_panel'], pairValidity: 'Must contain real stack zone with multiple item rows.' },
    { a: 'standard_hero', b: 'event_ticket', tab: 'live_events', layoutKey: 'hero_ticket', templateNeeds: ['event_ticket'], pairValidity: 'Must show hero and ticket structure.' },
    { a: 'standard_hero', b: 'webinar_screen', tab: 'live_events', layoutKey: 'hero_screen', templateNeeds: ['dashboard_product'], pairValidity: 'Must show hero with screen framing.' },
    { a: 'standard_hero', b: 'speaker_card', tab: 'live_events', layoutKey: 'hero_speaker', templateNeeds: ['authority_proof', 'event_ticket'], pairValidity: 'Must show hero and speaker identity block.' },
    { a: 'event_ticket', b: 'speaker_card', tab: 'live_events', layoutKey: 'ticket_speaker', templateNeeds: ['event_ticket'], pairValidity: 'Must show ticket and speaker identity.' },
    { a: 'webinar_screen', b: 'speaker_card', tab: 'live_events', layoutKey: 'screen_speaker', templateNeeds: ['dashboard_product'], pairValidity: 'Must show screen with speaker identity.' },
    { a: 'standard_hero', b: 'book_mockup', tab: 'free_guide', layoutKey: 'hero_book', templateNeeds: ['dashboard_product'], pairValidity: 'Must show hero with real book mockup.' },
    { a: 'standard_hero', b: 'device_mockup', tab: 'free_guide', layoutKey: 'hero_device', templateNeeds: ['dashboard_product', 'device_stack'], pairValidity: 'Must show hero with real device mockup.' },
    { a: 'book_mockup', b: 'device_mockup', tab: 'free_guide', layoutKey: 'book_device', templateNeeds: ['device_stack'], pairValidity: 'Must show both book and device packaging.' },
    { a: 'event_ticket', b: 'webinar_screen', tab: 'live_events', layoutKey: 'ticket_screen', templateNeeds: ['event_ticket', 'dashboard_product'], pairValidity: 'Must show ticket structure with webinar screen framing.' },
];

export const DISALLOWED_PAIRS: { a: CreativeModeId; b: CreativeModeId; reason: string }[] = [];

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

    for (const m of modes) {
        const meta = CREATIVE_MODE_CATALOG[m];
        if (meta?.soloOnly && modes.length > 1) {
            errors.push(`"${meta.labelEn}" is a standalone mode and cannot be paired.`);
            return { valid: false, errors, warnings, resolvedTab, resolvedPair };
        }
    }

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

export const HOOK_ANGLE_CREATIVE_CONFLICTS: Record<string, CreativeModeId[]> = {};

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

    // Block all other modes when a soloOnly mode is selected
    for (const sel of selected) {
        if (CREATIVE_MODE_CATALOG[sel]?.soloOnly) {
            for (const [id] of Object.entries(CREATIVE_MODE_CATALOG)) {
                if (id !== sel && !blockedIds.has(id)) {
                    blockedIds.add(id);
                    reasons[id] = `${CREATIVE_MODE_CATALOG[sel]?.labelEn || sel} is standalone-only`;
                }
            }
        }
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

    'event_ticket+webinar_screen': {
        layoutKey: 'ticket_screen', labelEn: 'Event Ticket + Screen', labelAr: 'تذكرة + شاشة',
        blueprintEn: 'Event ticket with screen element — ticket structure with embedded screen showing event broadcast details.',
        blueprintAr: 'تذكرة حدث مع عنصر شاشة — هيكل تذكرة مع شاشة مضمنة تعرض تفاصيل البث.',
        mustShow: ['ticket_frame', 'event_title', 'screen_or_device', 'date_time_row', 'live_badge'],
        mustAvoid: ['generic_hero_standing', 'value_stack_items', 'before_after_split', 'blank_screen'],
        visualHierarchy: ['ticket_structure', 'screen_within_ticket', 'event_metadata', 'cta_bottom'],
        textPlacementRules: ['event_title_top', 'screen_center', 'date_time_below_screen', 'cta_bottom'],
        captionAnchors: ['live event', 'register', 'watch live'],
    },

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

// ─── MODE-FORMAT-CAMPAIGN VALIDATOR (FR-003) ─────────────────────────────

export type ModeFormatValidationResult =
    | { valid: true }
    | { valid: false; reason: string };

export interface ModeFormatValidationInput {
    modes: string[];
    adFormat: "single" | "carousel" | "batch";
    campaignType: "cold" | "retargeting";
}

const LAUNCHED_MODE_SET = new Set<string>([
    "standard_hero", "value_stack", "event_ticket", "webinar_screen",
    "speaker_card", "book_mockup", "device_mockup", "testimonial_carousel",
    "text_only", "before_after",
]);

const ALLOWED_AD_FORMATS = new Set<string>(["single", "carousel", "batch"]);
const ALLOWED_CAMPAIGN_TYPES = new Set<string>(["cold", "retargeting"]);

export function validateModeFormatCombination(
    input: ModeFormatValidationInput,
): ModeFormatValidationResult {
    const { modes, adFormat, campaignType } = input;
    const filtered = (modes || []).filter(Boolean);

    // Runtime guards: reject unknown adFormat / campaignType before falling
    // through into the type-narrowing checks below. Mirrors the backend
    // validator in functions/src/creativeResolver.ts.
    if (!ALLOWED_AD_FORMATS.has(adFormat)) {
        return { valid: false, reason: "Invalid adFormat" };
    }
    if (!ALLOWED_CAMPAIGN_TYPES.has(campaignType)) {
        return { valid: false, reason: "Invalid campaignType" };
    }

    if (filtered.includes("before_after") && filtered.length > 1) {
        return { valid: false, reason: "Before/After is single-image only — defines the entire canvas." };
    }
    if (filtered.includes("before_after") && adFormat !== "single") {
        return { valid: false, reason: "Before/After is single-image only." };
    }
    if (filtered.includes("text_only") && filtered.length > 1) {
        return { valid: false, reason: "Text-only mode is mutually exclusive — it defines the entire canvas." };
    }
    if (filtered.includes("testimonial_carousel") && adFormat !== "carousel") {
        return { valid: false, reason: "Testimonial Carousel requires carousel format." };
    }

    if (filtered.length === 1) {
        const mode = filtered[0];
        if (!LAUNCHED_MODE_SET.has(mode)) {
            return { valid: false, reason: "Combination is not in the launch surface." };
        }
        if (mode === "before_after" && adFormat !== "single") {
            return { valid: false, reason: "Before/After is single-image only." };
        }
        if (mode === "testimonial_carousel" && adFormat !== "carousel") {
            return { valid: false, reason: "Testimonial Carousel requires carousel format." };
        }
        return { valid: true };
    }

    if (filtered.length === 2) {
        const [a, b] = filtered;
        const isAllowed = ALLOWED_PAIRS.some(
            (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
        );
        if (!isAllowed) {
            return { valid: false, reason: "Combination is not in the launch surface." };
        }
        return { valid: true };
    }

    return { valid: false, reason: "Combination is not in the launch surface." };
}

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
        return { allowed: false, reason: combo.errors[0] || 'Invalid combination.' };
    }

    const fmtResult = validateModeFormatCombination({
        modes,
        adFormat: (inputs.adFormat as "single" | "carousel" | "batch") || "single",
        campaignType: (inputs.campaignType as "cold" | "retargeting") || "cold",
    });
    if (!fmtResult.valid) {
        return { allowed: false, reason: (fmtResult as { valid: false; reason: string }).reason };
    }

    return { allowed: true };
}

export interface ValueStackAdjustment {
    giftCount: number;
    resolvedSlideCount: number;
    capped: boolean;
}

export function resolveValueStackSlideCount(gifts: string[]): ValueStackAdjustment {
    const nonEmpty = gifts.filter(g => g && g.trim().length > 0);
    const raw = nonEmpty.length + 2;
    const capped = raw > 9;
    const resolvedSlideCount = Math.min(raw, 9);
    return { giftCount: nonEmpty.length, resolvedSlideCount, capped };
}

export function resolveTestimonialSlideCount(testimonialCount: number, maxPlanSlides: number): number {
    return Math.min(testimonialCount + 2, maxPlanSlides);
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
// Mirrors the backend CONFLICT_MAP (functions/src/creativeResolver.ts):
// derived from soloOnly + tab membership + ALLOWED_PAIRS so legacy consumers
// reflect the same conflict decisions as validateModeFormatCombination.
export const CONFLICT_MAP: Record<string, Set<string>> = (() => {
    const map: Record<string, Set<string>> = {};
    for (const id of Object.keys(CREATIVE_MODE_CATALOG)) { map[id] = new Set<string>(); }

    for (const [idA, metaA] of Object.entries(CREATIVE_MODE_CATALOG)) {
        for (const [idB, metaB] of Object.entries(CREATIVE_MODE_CATALOG)) {
            if (idA === idB) continue;

            if (metaA.soloOnly || metaB.soloOnly) {
                map[idA]?.add(idB);
                continue;
            }

            const sharesTab = metaA.tabs.some(t => metaB.tabs.includes(t));
            if (!sharesTab) {
                map[idA]?.add(idB);
                continue;
            }

            const isAllowedPair = ALLOWED_PAIRS.some(
                p => (p.a === idA && p.b === idB) || (p.a === idB && p.b === idA),
            );
            if (!isAllowedPair) {
                map[idA]?.add(idB);
            }
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
        'Live Event': 'live_events',
        'Free Webinar': 'live_events', 'Paid Workshop': 'live_events', 'Challenge': 'live_events',
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
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'adapt', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'adapt', text_only: 'block',
        before_after: 'adapt',
    },
    documentary_gritty: {
        standard_hero: 'ok', value_stack: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
        before_after: 'adapt',
    },
    neon_urban: {
        standard_hero: 'ok', value_stack: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
        before_after: 'adapt',
    },
    dark_cinematic: {
        standard_hero: 'ok', value_stack: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
        before_after: 'adapt',
    },
    bright_illustrated: {
        standard_hero: 'ok', value_stack: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
        before_after: 'adapt',
    },
    mythic_epic: {
        standard_hero: 'ok', value_stack: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
        before_after: 'adapt',
    },
    anime_manga: {
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
        before_after: 'adapt',
    },
    watercolor_dreamscape: {
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
        before_after: 'adapt',
    },
    vintage_bw: {
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
        before_after: 'adapt',
    },
    vintage_sepia: {
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
        before_after: 'adapt',
    },
    comic_book: {
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
        before_after: 'adapt',
    },
    ugly_ad: {
        standard_hero: 'ok', value_stack: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
        before_after: 'adapt',
    },
    cinematic_film_still: {
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'adapt', speaker_card: 'ok',
        book_mockup: 'adapt', device_mockup: 'adapt', text_only: 'block',
        before_after: 'adapt',
    },
    clean_corporate: {
        standard_hero: 'ok', value_stack: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
        before_after: 'adapt',
    },
    golden_hour_outdoor: {
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'adapt', speaker_card: 'ok',
        book_mockup: 'adapt', device_mockup: 'adapt', text_only: 'block',
        before_after: 'adapt',
    },
    street_photography: {
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'adapt', speaker_card: 'ok',
        book_mockup: 'adapt', device_mockup: 'adapt', text_only: 'block',
        before_after: 'adapt',
    },
    pixel_retro_game: {
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
        before_after: 'adapt',
    },
    stained_glass: {
        standard_hero: 'ok', value_stack: 'adapt',
        event_ticket: 'adapt', webinar_screen: 'block', speaker_card: 'adapt',
        book_mockup: 'adapt', device_mockup: 'block', text_only: 'block',
        before_after: 'adapt',
    },
    glitch_digital: {
        standard_hero: 'ok', value_stack: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
        before_after: 'adapt',
    },
    synthwave_80s: {
        standard_hero: 'ok', value_stack: 'ok',
        event_ticket: 'ok', webinar_screen: 'ok', speaker_card: 'ok',
        book_mockup: 'ok', device_mockup: 'ok', text_only: 'block',
        before_after: 'adapt',
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