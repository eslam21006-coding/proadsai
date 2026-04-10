/**
 * layoutTemplates.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYOUT TEMPLATE LIBRARY — 12 deterministic templates
 * The generator selects ONE template instead of improvising composition.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── TEMPLATE IDs ───────────────────────────────────────────────────────────
export type LayoutTemplateId =
    | 'hero_focus'
    | 'hero_value_stack_split'
    | 'hero_value_stack_panel'
    | 'feature_grid'
    | 'offer_card'
    | 'event_ticket'
    | 'dashboard_product'
    | 'social_proof'
    | 'authority_proof'
    | 'before_after'
    | 'device_stack'
    | 'urgency_accent'; // modifier, not standalone

// ─── ZONE DEFINITION ────────────────────────────────────────────────────────
export interface ZoneSpec {
    anchor: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    priority: number;         // 1 = highest
    minSizePct?: number;      // minimum % of canvas
    maxSizePct?: number;      // maximum % of canvas
    minItems?: number;        // for grid/stack zones
    maxItems?: number;
}

// ─── OVERLAY SLOT DEFINITION (for deterministic numeric rendering) ────────
export interface OverlaySlotDef {
    /** Slot purpose identifier */
    id: 'price' | 'totalValue' | 'savings' | 'guarantee' | 'valueItem';
    /** Anchor position within the parent zone */
    zoneAnchor: 'top' | 'bottom' | 'left' | 'right' | 'center';
    /** Position as percentage of canvas width */
    xPct: number;
    /** Position as percentage of canvas height */
    yPct: number;
    /** Width as percentage of canvas width */
    widthPct: number;
    /** Height as percentage of canvas height */
    heightPct: number;
    /** Text alignment */
    align: 'right' | 'left' | 'center';
    /** Font size at 1080px base width */
    fontSize: number;
    /** Font weight */
    fontWeight: number;
    /** Text color */
    color: string;
    /** Background panel color (semi-transparent) */
    bgColor?: string;
    /** Border radius for background panel */
    borderRadius?: number;
    /** If true, this is a repeating slot (one per value item) — yPct is the start, items stack below */
    repeating?: boolean;
    /** Vertical gap between repeating items (percentage of canvas height) */
    repeatGapPct?: number;
    /** Max items for repeating slots */
    maxRepeat?: number;
}

// ─── LAYOUT TEMPLATE ────────────────────────────────────────────────────────
export interface LayoutTemplate {
    id: LayoutTemplateId;
    name: string;
    description: string;
    isModifier: boolean;
    zones: Record<string, ZoneSpec>;
    mustAvoid: string[];
    copyRules: {
        mustReference: string[];
    };
    compositionNotes: string;
    /** Overlay slot definitions for deterministic numeric rendering. Empty array = no overlay. */
    overlaySlots: OverlaySlotDef[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const LAYOUT_TEMPLATES: Record<LayoutTemplateId, LayoutTemplate> = {

    // ─── TEMPLATE 1: HERO FOCUS ──────────────────────────────────────────
    hero_focus: {
        id: 'hero_focus',
        name: 'Hero Focus',
        description: 'Hero dominant center with headline top and CTA bottom.',
        isModifier: false,
        zones: {
            headline: { anchor: 'top', priority: 2 },
            hero: { anchor: 'center', priority: 1, minSizePct: 40, maxSizePct: 70 },
            cta: { anchor: 'bottom', priority: 3 },
        },
        mustAvoid: ['floating_cards', 'side_panels', 'grid_elements'],
        copyRules: { mustReference: ['cta'] },
        compositionNotes: 'Hero must cover 40-70% of canvas. Clean background with space for text overlay. No competing visual elements.',
        overlaySlots: [],
    },

    // ─── TEMPLATE 2: HERO + VALUE STACK SPLIT ────────────────────────────
    hero_value_stack_split: {
        id: 'hero_value_stack_split',
        name: 'Hero + Value Stack Split',
        description: 'Hero left, value stack right, headline top, CTA bottom.',
        isModifier: false,
        zones: {
            hero: { anchor: 'left', priority: 1, minSizePct: 40, maxSizePct: 55 },
            stack: { anchor: 'right', priority: 2, minItems: 2, maxItems: 5 },
            headline: { anchor: 'top', priority: 3 },
            cta: { anchor: 'bottom', priority: 4 },
        },
        mustAvoid: ['floating_stack_cards', 'stack_overlapping_face', 'random_extra_elements', 'hero_hidden_behind_stack'],
        copyRules: { mustReference: ['offer', 'cta'] },
        compositionNotes: 'Hero remains dominant on left. Stack items are 2-5 anchored cards on right side. Stack must NOT float randomly. RIGHT SIDE STACK ZONE must contain solid-colored placeholder panels for value items — the app will overlay exact numbers after generation.',
        overlaySlots: [
            { id: 'valueItem', zoneAnchor: 'right', xPct: 55, yPct: 18, widthPct: 42, heightPct: 7, align: 'right', fontSize: 22, fontWeight: 600, color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.35)', borderRadius: 8, repeating: true, repeatGapPct: 1.5, maxRepeat: 5 },
            { id: 'totalValue', zoneAnchor: 'right', xPct: 55, yPct: 72, widthPct: 42, heightPct: 6, align: 'center', fontSize: 20, fontWeight: 700, color: '#FFD700', bgColor: 'rgba(0,0,0,0.5)', borderRadius: 6 },
            { id: 'price', zoneAnchor: 'right', xPct: 55, yPct: 80, widthPct: 42, heightPct: 8, align: 'center', fontSize: 30, fontWeight: 800, color: '#FFFFFF', bgColor: 'rgba(0,120,255,0.85)', borderRadius: 12 },
            { id: 'savings', zoneAnchor: 'right', xPct: 60, yPct: 90, widthPct: 32, heightPct: 5, align: 'center', fontSize: 18, fontWeight: 600, color: '#4ADE80' },
        ],
    },

    // ─── TEMPLATE 3: HERO + VALUE STACK PANEL ────────────────────────────
    hero_value_stack_panel: {
        id: 'hero_value_stack_panel',
        name: 'Hero + Value Stack Panel',
        description: 'Hero center with stack bottom panel. Used for square formats.',
        isModifier: false,
        zones: {
            hero: { anchor: 'center', priority: 1, minSizePct: 50, maxSizePct: 65 },
            stack: { anchor: 'bottom', priority: 2, minSizePct: 25, maxSizePct: 35, minItems: 2, maxItems: 5 },
            cta: { anchor: 'bottom', priority: 3 },
        },
        mustAvoid: ['floating_stack_cards', 'stack_overlapping_face', 'hero_hidden_behind_stack'],
        copyRules: { mustReference: ['offer', 'cta'] },
        compositionNotes: 'Stack panel height: 25-35% of canvas. Hero is above the panel. Optimized for square (1:1) format. BOTTOM PANEL must contain solid-colored placeholder panels for value items — the app will overlay exact numbers after generation.',
        overlaySlots: [
            { id: 'valueItem', zoneAnchor: 'bottom', xPct: 5, yPct: 67, widthPct: 90, heightPct: 5, align: 'right', fontSize: 20, fontWeight: 600, color: '#FFFFFF', bgColor: 'rgba(0,0,0,0.3)', borderRadius: 6, repeating: true, repeatGapPct: 0.8, maxRepeat: 5 },
            { id: 'totalValue', zoneAnchor: 'bottom', xPct: 5, yPct: 90, widthPct: 42, heightPct: 5, align: 'center', fontSize: 18, fontWeight: 700, color: '#FFD700', bgColor: 'rgba(0,0,0,0.45)', borderRadius: 6 },
            { id: 'price', zoneAnchor: 'bottom', xPct: 52, yPct: 90, widthPct: 42, heightPct: 5, align: 'center', fontSize: 26, fontWeight: 800, color: '#FFFFFF', bgColor: 'rgba(0,120,255,0.85)', borderRadius: 10 },
        ],
    },

    // ─── TEMPLATE 4: FEATURE GRID ────────────────────────────────────────
    feature_grid: {
        id: 'feature_grid',
        name: 'Feature Grid',
        description: 'Headline top, feature grid center, CTA bottom.',
        isModifier: false,
        zones: {
            headline: { anchor: 'top', priority: 1 },
            grid: { anchor: 'center', priority: 2, minItems: 3, maxItems: 6 },
            cta: { anchor: 'bottom', priority: 3 },
        },
        mustAvoid: ['hero_portrait', 'single_focus_image', 'testimonial_elements'],
        copyRules: { mustReference: ['features', 'cta'] },
        compositionNotes: '3-6 feature items in a clean grid. Each item gets icon + short label. No hero portrait needed.',
        overlaySlots: [],
    },

    // ─── TEMPLATE 5: OFFER CARD ──────────────────────────────────────────
    offer_card: {
        id: 'offer_card',
        name: 'Offer Card',
        description: 'Headline, central offer card, CTA.',
        isModifier: false,
        zones: {
            headline: { anchor: 'top', priority: 1 },
            offer_card: { anchor: 'center', priority: 2, minSizePct: 40, maxSizePct: 60 },
            cta: { anchor: 'bottom', priority: 3 },
        },
        mustAvoid: ['multiple_cards', 'grid_layout', 'split_composition'],
        copyRules: { mustReference: ['offer', 'price', 'cta'] },
        compositionNotes: 'Single prominent offer card center stage. Clean and bold. Price/discount area must be a solid-colored panel — the app will overlay exact price after generation.',
        overlaySlots: [
            { id: 'price', zoneAnchor: 'center', xPct: 25, yPct: 55, widthPct: 50, heightPct: 10, align: 'center', fontSize: 36, fontWeight: 800, color: '#FFFFFF', bgColor: 'rgba(0,120,255,0.85)', borderRadius: 14 },
            { id: 'totalValue', zoneAnchor: 'center', xPct: 25, yPct: 47, widthPct: 50, heightPct: 6, align: 'center', fontSize: 20, fontWeight: 600, color: '#FFD700', bgColor: 'rgba(0,0,0,0.4)', borderRadius: 8 },
            { id: 'savings', zoneAnchor: 'center', xPct: 30, yPct: 67, widthPct: 40, heightPct: 5, align: 'center', fontSize: 18, fontWeight: 600, color: '#4ADE80' },
        ],
    },

    // ─── TEMPLATE 6: EVENT TICKET ────────────────────────────────────────
    event_ticket: {
        id: 'event_ticket',
        name: 'Event Ticket',
        description: 'Ticket card layout with event metadata and CTA.',
        isModifier: false,
        zones: {
            ticket_card: { anchor: 'center', priority: 1, minSizePct: 60, maxSizePct: 80 },
            event_metadata: { anchor: 'center', priority: 2 },
            cta: { anchor: 'bottom', priority: 3 },
        },
        mustAvoid: ['standard_hero_layout', 'grid_layout', 'split_composition'],
        copyRules: { mustReference: ['event_title', 'date', 'cta'] },
        compositionNotes: 'Ticket-style framing. Event title prominent. Date/time visible. Speaker photo in circle frame.',
        overlaySlots: [],
    },

    // ─── TEMPLATE 7: DASHBOARD / PRODUCT ─────────────────────────────────
    dashboard_product: {
        id: 'dashboard_product',
        name: 'Dashboard / Product',
        description: 'Device frame showing dashboard UI with CTA.',
        isModifier: false,
        zones: {
            device_frame: { anchor: 'center', priority: 1, minSizePct: 50, maxSizePct: 75 },
            dashboard_ui: { anchor: 'center', priority: 2 },
            cta: { anchor: 'bottom', priority: 3 },
        },
        mustAvoid: ['hero_portrait', 'floating_elements', 'testimonial_cards'],
        copyRules: { mustReference: ['product', 'cta'] },
        compositionNotes: 'Clean device mockup (laptop/phone). Dashboard UI should look realistic and professional.',
        overlaySlots: [],
    },

    // ─── TEMPLATE 8: SOCIAL PROOF ────────────────────────────────────────
    social_proof: {
        id: 'social_proof',
        name: 'Social Proof',
        description: 'Headline, testimonial card, speaker, CTA.',
        isModifier: false,
        zones: {
            headline: { anchor: 'top', priority: 1 },
            testimonial_card: { anchor: 'center', priority: 2, minSizePct: 40, maxSizePct: 60 },
            speaker: { anchor: 'bottom-left', priority: 3 },
            cta: { anchor: 'bottom', priority: 4 },
        },
        mustAvoid: ['grid_layout', 'product_mockup', 'split_composition'],
        copyRules: { mustReference: ['testimonial', 'cta'] },
        compositionNotes: 'Testimonial text in a card/bubble. Speaker name and optional avatar below. Authentic feel.',
        overlaySlots: [],
    },

    // ─── TEMPLATE 9: AUTHORITY PROOF ─────────────────────────────────────
    authority_proof: {
        id: 'authority_proof',
        name: 'Authority Proof',
        description: 'Hero with proof numbers/stats and CTA.',
        isModifier: false,
        zones: {
            hero: { anchor: 'left', priority: 1, minSizePct: 35, maxSizePct: 50 },
            proof_numbers: { anchor: 'right', priority: 2 },
            cta: { anchor: 'bottom', priority: 3 },
        },
        mustAvoid: ['grid_layout', 'testimonial_cards', 'product_mockup'],
        copyRules: { mustReference: ['authority_stats', 'cta'] },
        compositionNotes: 'Hero on one side. Bold numbers/stats (e.g., "500+ students", "$2M revenue") on the other side.',
        overlaySlots: [],
    },

    // ─── TEMPLATE 10: BEFORE / AFTER ─────────────────────────────────────
    before_after: {
        id: 'before_after',
        name: 'Before / After',
        description: 'Before state left, after state right, CTA bottom.',
        isModifier: false,
        zones: {
            before: { anchor: 'left', priority: 1, minSizePct: 40, maxSizePct: 50 },
            after: { anchor: 'right', priority: 2, minSizePct: 40, maxSizePct: 50 },
            cta: { anchor: 'bottom', priority: 3 },
        },
        mustAvoid: ['text_labels_before_after', 'floating_elements', 'grid_layout'],
        copyRules: { mustReference: ['transformation', 'cta'] },
        compositionNotes: 'Clear visual split. Before shows the problem state, after shows the result. NO text labels "before/after" — the visual contrast tells the story.',
        overlaySlots: [],
    },

    // ─── TEMPLATE 11: DEVICE STACK ───────────────────────────────────────
    device_stack: {
        id: 'device_stack',
        name: 'Device Stack',
        description: 'Multiple device screens stacked/overlapping with CTA.',
        isModifier: false,
        zones: {
            screens: { anchor: 'center', priority: 1, minItems: 2, maxItems: 4, minSizePct: 60, maxSizePct: 80 },
            cta: { anchor: 'bottom', priority: 2 },
        },
        mustAvoid: ['hero_portrait', 'testimonial_elements', 'grid_layout'],
        copyRules: { mustReference: ['product', 'cta'] },
        compositionNotes: 'Multiple screens (phone, laptop, tablet) showing the product. Stacked or fanned arrangement.',
        overlaySlots: [],
    },

    // ─── TEMPLATE 12: URGENCY ACCENT (MODIFIER) ─────────────────────────
    urgency_accent: {
        id: 'urgency_accent',
        name: 'Urgency Accent',
        description: 'Modifier that adds urgency elements to any template. Not standalone.',
        isModifier: true,
        zones: {
            urgency_badge: { anchor: 'top-left', priority: 1, maxSizePct: 15 },
            countdown: { anchor: 'top-right', priority: 2, maxSizePct: 10 },
            deadline_ribbon: { anchor: 'bottom', priority: 3, maxSizePct: 8 },
        },
        mustAvoid: ['urgency_exceeding_20pct_canvas'],
        copyRules: { mustReference: ['urgency', 'deadline'] },
        compositionNotes: 'Urgency elements must NOT exceed 20% of canvas combined. Badge/timer/ribbon as accents only.',
        overlaySlots: [],
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT CONTRACT — The hidden machine specification
// ═══════════════════════════════════════════════════════════════════════════

export type MinimalSubstyle = 'studio_panel' | 'color_block_stage' | 'editorial_split' | 'device_anchor' | 'hero_device_fusion';
export type MinimalAnchorObject = 'hero' | 'device' | 'product' | 'balanced';
export type MinimalBrandGeometry = 'split_bg' | 'floor_plane' | 'frame_edge' | 'diagonal_block' | 'curved_panel';
export type MinimalInfoModuleStyle = 'stacked_panel' | 'single_feature_rail' | 'premium_card_system' | 'editorial_sidebar';
export type MinimalCtaIntegration = 'embedded_bar' | 'anchored_panel' | 'aligned_button_block';

export interface MinimalDepthPlan {
    background: string;
    midground: string;
    foreground: string;
}

export interface LayoutContract {
    template: LayoutTemplateId;
    templateName: string;
    zones: Record<string, ZoneSpec>;
    mustAvoid: string[];
    copyRules: {
        mustReference: string[];
    };
    compositionNotes: string;
    /** Whether urgency modifier is applied on top of the base template */
    hasUrgencyAccent: boolean;
    /** Source creative modes that led to this template selection */
    sourceModes: string[];
    /** Hook angle that influenced selection */
    hookAngle: string | null;
    /** Visual style family: realistic, fantasy, or minimal */
    visualStyleFamily?: 'realistic' | 'fantasy' | 'minimal';
    /** Internal premium-minimal composition taxonomy */
    minimalSubstyle?: MinimalSubstyle | null;
    depthPlan?: MinimalDepthPlan | null;
    anchorObject?: MinimalAnchorObject | null;
    anchorRelationship?: string | null;
    brandGeometry?: MinimalBrandGeometry | null;
    infoModuleStyle?: MinimalInfoModuleStyle | null;
    ctaIntegration?: MinimalCtaIntegration | null;
    requiredMinimalPatterns: string[];
    forbiddenMinimalPatterns: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE SELECTION — Maps creative mode combinations → template
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Given creative modes and hook angle, select the best layout template.
 * v2: Tab-aware, fail-closed. Unknown pairs return null (caller must handle).
 */
export function selectLayoutTemplate(
    primaryMode: string,
    secondaryMode: string | null,
    hookAngle?: string | null,
    aspectRatio?: string,
): LayoutTemplateId {
    console.log(`🗺️ selectLayoutTemplate: primary=${primaryMode} secondary=${secondaryMode || 'none'} hookAngle=${hookAngle || 'none'} ratio=${aspectRatio || 'default'}`);

    // ── Hook angle overrides ──
    if (hookAngle === 'before_after') { console.log('   → before_after (hook override)'); return 'before_after'; }

    // ── Single mode mappings ──
    if (!secondaryMode || secondaryMode === primaryMode) {
        switch (primaryMode) {
            case 'standard_hero': return 'hero_focus';
            case 'event_ticket': return 'event_ticket';
            case 'speaker_card': return 'event_ticket';
            case 'webinar_screen': return 'dashboard_product';
            case 'value_stack': return aspectRatio === '1:1' ? 'hero_value_stack_panel' : 'hero_value_stack_split';
            case 'book_mockup': return 'dashboard_product';
            case 'device_mockup': return 'dashboard_product';
            // Removed modes: fall through to hero_focus for backward compat
            case 'premium_package': return 'hero_focus';
            case 'preview_card': return 'dashboard_product';
            case 'platform_screenshot': return 'dashboard_product';
            case 'dashboard_preview': return 'dashboard_product';
            case 'mobile_app_card': return 'device_stack';
            case 'feature_highlight': return 'feature_grid';
            case 'certificate': return 'authority_proof';
            case 'community_card': return 'social_proof';
            case 'testimonial_carousel': return 'social_proof';
            case 'inside_look': return 'dashboard_product';
            default: return 'hero_focus';
        }
    }

    // ── Paired mode mappings (v2: explicit allowed pairs only) ──

    // Mini Course pairs
    if (hasModes(primaryMode, secondaryMode, 'standard_hero', 'value_stack')) {
        return aspectRatio === '1:1' ? 'hero_value_stack_panel' : 'hero_value_stack_split';
    }

    // Live Events pairs
    if (hasModes(primaryMode, secondaryMode, 'standard_hero', 'event_ticket')) {
        return 'event_ticket';
    }
    if (hasModes(primaryMode, secondaryMode, 'standard_hero', 'webinar_screen')) {
        return 'dashboard_product';
    }
    if (hasModes(primaryMode, secondaryMode, 'standard_hero', 'speaker_card')) {
        return 'event_ticket';
    }
    if (hasModes(primaryMode, secondaryMode, 'event_ticket', 'speaker_card')) {
        return 'event_ticket';
    }
    if (hasModes(primaryMode, secondaryMode, 'webinar_screen', 'speaker_card')) {
        return 'dashboard_product';
    }

    // Free Guide pairs
    if (hasModes(primaryMode, secondaryMode, 'standard_hero', 'book_mockup')) {
        return 'dashboard_product';
    }
    if (hasModes(primaryMode, secondaryMode, 'standard_hero', 'device_mockup')) {
        return 'dashboard_product';
    }
    if (hasModes(primaryMode, secondaryMode, 'book_mockup', 'device_mockup')) {
        return 'device_stack';
    }

    // ── FAIL-CLOSED: Unknown pair, fall back to hero_focus with warning ──
    console.warn(`⚠️ selectLayoutTemplate: unrecognized pair (${primaryMode} + ${secondaryMode}). Falling back to hero_focus.`);
    return 'hero_focus';
}

function hasModes(primary: string, secondary: string | null, a: string, b: string): boolean {
    return (primary === a && secondary === b) || (primary === b && secondary === a);
}

function deriveMinimalSubstyle(
    templateId: LayoutTemplateId,
    sourceModes: string[],
    hookAngle?: string | null,
): MinimalSubstyle {
    const modeSet = new Set(sourceModes);
    const deviceModes = [
        'book_mockup', 'device_mockup', 'webinar_screen',
        'preview_card', 'platform_screenshot', 'dashboard_preview', 'mobile_app_card', 'inside_look',
    ];
    const hasDevice = deviceModes.some(m => modeSet.has(m));
    const hasHero = modeSet.has('standard_hero');
    const hasValueModule = modeSet.has('value_stack');
    const editorialAngles = new Set(['secret', 'authority', 'authority_builder', 'shocking_stat', 'myth_busting', 'problem_agitation']);
    const colorBlockAngles = new Set(['offer', 'offer_lead', 'offer_stack', 'urgency', 'fomo', 'scarcity']);

    if (templateId === 'before_after') return 'editorial_split';
    if (hasDevice && hasHero) return 'hero_device_fusion';
    if (hasDevice) return 'device_anchor';
    if (hasValueModule) return 'studio_panel';
    if (colorBlockAngles.has(hookAngle || '')) return 'color_block_stage';
    if (editorialAngles.has(hookAngle || '')) return 'editorial_split';
    if (templateId === 'event_ticket') return 'color_block_stage';
    if (templateId === 'dashboard_product') return hasHero ? 'hero_device_fusion' : 'device_anchor';
    if (templateId === 'hero_focus') return 'editorial_split';
    return 'studio_panel';
}

function buildMinimalDepthPlan(substyle: MinimalSubstyle): MinimalDepthPlan {
    switch (substyle) {
        case 'studio_panel':
            return {
                background: 'Controlled studio wall with a branded split or framed panel zone reserved for messaging.',
                midground: 'Hero and primary product/UI object share one anchored composition with clean overlap.',
                foreground: 'Single structured benefits module or CTA rail adds depth without clutter.',
            };
        case 'color_block_stage':
            return {
                background: 'Two branded color zones create a clear wall/backdrop split instead of an empty plain field.',
                midground: 'One dominant anchor object sits on a grounded stage plane with directional shadow.',
                foreground: 'CTA block or feature rail overlaps the stage edge to create clean commercial depth.',
            };
        case 'editorial_split':
            return {
                background: 'Editorial backdrop with a controlled tonal split and strong negative space for Arabic copy.',
                midground: 'Hero overlaps the text zone boundary to create integrated hierarchy without scenery.',
                foreground: 'A lean CTA or supporting module locks the reading path and gives the layout a final anchor.',
            };
        case 'device_anchor':
            return {
                background: 'Premium studio backdrop with a restrained gradient wall and branded edge framing.',
                midground: 'Large device/UI mockup dominates the composition as the commercial hero object.',
                foreground: 'One concise CTA or feature block supports the device without competing for attention.',
            };
        case 'hero_device_fusion':
        default:
            return {
                background: 'Structured branded backdrop with two visual zones and clean negative space for messaging.',
                midground: 'Hero and device form one focal mass with explicit spatial relationship and aligned perspective.',
                foreground: 'One premium information system and embedded CTA finish the frame without floating clutter.',
            };
    }
}

function buildMinimalCompositionSpec(
    templateId: LayoutTemplateId,
    sourceModes: string[],
    hookAngle?: string | null,
): Pick<LayoutContract, 'minimalSubstyle' | 'depthPlan' | 'anchorObject' | 'anchorRelationship' | 'brandGeometry' | 'infoModuleStyle' | 'ctaIntegration' | 'requiredMinimalPatterns' | 'forbiddenMinimalPatterns'> {
    const substyle = deriveMinimalSubstyle(templateId, sourceModes, hookAngle);
    const hasHero = sourceModes.includes('standard_hero');
    const hasDevice = ['book_mockup', 'device_mockup', 'webinar_screen', 'preview_card', 'platform_screenshot', 'dashboard_preview', 'mobile_app_card', 'inside_look'].some(m => sourceModes.includes(m));
    const hasBenefits = sourceModes.includes('value_stack');

    const anchorObject: MinimalAnchorObject = hasHero && hasDevice ? 'balanced' : hasDevice ? 'device' : hasHero ? 'hero' : 'product';
    const anchorRelationship = hasHero && hasDevice
        ? 'Hero and product/device must read as one coordinated focal mass, not isolated objects pasted apart.'
        : hasDevice
            ? 'The device/UI mockup is the hero object. Any human subject must support it, not compete with it.'
            : 'The hero must be spatially tied to one structured module or branded object, never standing alone in empty space.';

    const geometryMap: Record<MinimalSubstyle, MinimalBrandGeometry> = {
        studio_panel: 'frame_edge',
        color_block_stage: 'diagonal_block',
        editorial_split: 'split_bg',
        device_anchor: 'curved_panel',
        hero_device_fusion: 'floor_plane',
    };
    const infoMap: Record<MinimalSubstyle, MinimalInfoModuleStyle> = {
        studio_panel: hasBenefits ? 'stacked_panel' : 'premium_card_system',
        color_block_stage: 'single_feature_rail',
        editorial_split: 'editorial_sidebar',
        device_anchor: hasBenefits ? 'single_feature_rail' : 'premium_card_system',
        hero_device_fusion: hasBenefits ? 'stacked_panel' : 'premium_card_system',
    };
    const ctaMap: Record<MinimalSubstyle, MinimalCtaIntegration> = {
        studio_panel: 'anchored_panel',
        color_block_stage: 'embedded_bar',
        editorial_split: 'aligned_button_block',
        device_anchor: 'anchored_panel',
        hero_device_fusion: 'embedded_bar',
    };

    return {
        minimalSubstyle: substyle,
        depthPlan: buildMinimalDepthPlan(substyle),
        anchorObject,
        anchorRelationship,
        brandGeometry: geometryMap[substyle],
        infoModuleStyle: infoMap[substyle],
        ctaIntegration: ctaMap[substyle],
        requiredMinimalPatterns: [
            'branded_backdrop_two_zones',
            'grounded_plane_or_stage',
            'three_depth_layers',
            'single_dominant_anchor',
            'integrated_information_module',
            'integrated_cta_block',
            'brand_geometry_system',
            ...(hasHero && hasDevice ? ['hero_product_relationship'] : []),
        ],
        forbiddenMinimalPatterns: [
            'plain_empty_background',
            'pedestal_full_body_default',
            'generic_glass_headline_box',
            'floating_mockup_cluster',
            'unanchored_feature_pills',
            'detached_cta',
            'isolated_cutout_subject',
            'template_canva_poster',
        ],
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPILE LAYOUT CONTRACT — Produces the hidden machine spec
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compiles a full layout contract from creative modes, hook angle, and aspect ratio.
 * This is the machine-readable specification that Step 4 (render) and Step 5 (caption) use.
 * It must NEVER appear in the user-facing blueprint.
 */
export function compileLayoutContract(
    primaryMode: string,
    secondaryMode: string | null,
    hookAngle?: string | null,
    aspectRatio?: string,
    visualStyleFamily: 'realistic' | 'fantasy' | 'minimal' = 'realistic',
    sourceModes?: string[],
): LayoutContract {
    const templateId = selectLayoutTemplate(primaryMode, secondaryMode, hookAngle, aspectRatio);
    const template = LAYOUT_TEMPLATES[templateId];
    const resolvedSourceModes = sourceModes && sourceModes.length > 0
        ? [...new Set(sourceModes)]
        : [primaryMode, ...(secondaryMode ? [secondaryMode] : [])];

    const hasUrgency = hookAngle === 'urgency' || hookAngle === 'fomo' || hookAngle === 'scarcity';
    const urgencyTemplate = LAYOUT_TEMPLATES.urgency_accent;

    const mergedZones = { ...template.zones };
    const mergedMustAvoid = [...template.mustAvoid];
    const mergedMustReference = [...template.copyRules.mustReference];
    let mergedNotes = template.compositionNotes;

    if (hasUrgency) {
        Object.entries(urgencyTemplate.zones).forEach(([key, zone]) => {
            mergedZones[key] = zone;
        });
        mergedMustAvoid.push(...urgencyTemplate.mustAvoid);
        mergedMustReference.push(...urgencyTemplate.copyRules.mustReference);
        mergedNotes += ' ' + urgencyTemplate.compositionNotes;
    }

    const minimalSpec = visualStyleFamily === 'minimal'
        ? buildMinimalCompositionSpec(templateId, resolvedSourceModes, hookAngle)
        : {
            minimalSubstyle: null,
            depthPlan: null,
            anchorObject: null,
            anchorRelationship: null,
            brandGeometry: null,
            infoModuleStyle: null,
            ctaIntegration: null,
            requiredMinimalPatterns: [],
            forbiddenMinimalPatterns: [],
        };

    if (visualStyleFamily === 'minimal') {
        mergedNotes += ` Premium studio minimal mandate: use a structured branded backdrop, grounded stage logic, and an integrated commercial composition. Required patterns: ${minimalSpec.requiredMinimalPatterns.join(', ')}. Forbidden patterns: ${minimalSpec.forbiddenMinimalPatterns.join(', ')}.`;
    }

    return {
        template: templateId,
        templateName: template.name + (hasUrgency ? ' + Urgency Accent' : ''),
        zones: mergedZones,
        mustAvoid: [...new Set(mergedMustAvoid)],
        copyRules: {
            mustReference: [...new Set(mergedMustReference)],
        },
        compositionNotes: mergedNotes,
        hasUrgencyAccent: hasUrgency,
        sourceModes: resolvedSourceModes,
        hookAngle: hookAngle || null,
        visualStyleFamily,
        ...minimalSpec,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT → PROMPT BLOCK (injected into Steps 4 and 5)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converts a layout contract to a structured prompt block for Gemini.
 * This is injected into the build plan and render prompts.
 */
export function getLayoutContractPromptBlock(contract: LayoutContract): string {
    const zoneLines = Object.entries(contract.zones).map(([name, zone]) => {
        const parts = [`anchor: ${zone.anchor}`, `priority: ${zone.priority}`];
        if (zone.minSizePct) parts.push(`min: ${zone.minSizePct}%`);
        if (zone.maxSizePct) parts.push(`max: ${zone.maxSizePct}%`);
        if (zone.minItems) parts.push(`min_items: ${zone.minItems}`);
        if (zone.maxItems) parts.push(`max_items: ${zone.maxItems}`);
        return `  ${name}: { ${parts.join(', ')} }`;
    });

    return `
═══════════════════════════════════════════════════════════════════════════════
LAYOUT CONTRACT (MANDATORY — follow exactly)
Template: ${contract.templateName} [${contract.template}]
═══════════════════════════════════════════════════════════════════════════════
ZONES:
${zoneLines.join('\n')}

MUST AVOID:
${contract.mustAvoid.map(s => `• ${s.replace(/_/g, ' ')}`).join('\n')}

COPY RULES — Caption/text must reference:
${contract.copyRules.mustReference.map(s => `• ${s}`).join('\n')}

COMPOSITION:
${contract.compositionNotes}
${contract.hasUrgencyAccent ? '\nURGENCY ACCENT ACTIVE: Add urgency badge/countdown/deadline ribbon. Must NOT exceed 20% of canvas.' : ''}

This contract is BINDING. Do not improvise outside these zone definitions.
═══════════════════════════════════════════════════════════════════════════════
`;
}

/**
 * Generates caption-specific anchors from the layout contract.
 */
export function getLayoutContractCaptionAnchors(contract: LayoutContract): string {
    const refs = contract.copyRules.mustReference;
    if (refs.length === 0) return '';

    return `CAPTION MUST REFERENCE: ${refs.join(', ')}. ` +
        `The visual uses ${contract.templateName} layout` +
        (contract.hasUrgencyAccent ? ' with urgency accent elements.' : '.');
}