/**
 * layoutContract.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIFIED LAYOUT CONTRACT — Step 3.5 Hidden Execution Layer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the SINGLE machine-readable object that Steps 4 (render) and
 * Step 5 (caption) consume. It merges:
 *   - Layout template selection (zones, composition rules)
 *   - Creative resolver output (mustShow, mustAvoid, hierarchy)
 *   - Aspect ratio spatial rules
 *   - RTL/language rules
 *   - Copy rules
 *
 * This object must NEVER appear in the user-facing UI.
 * The visible blueprint (Step 3) remains human-readable prose.
 * Steps 4 and 5 use ONLY this contract, not raw resolver/template output.
 *
 * Architecture:
 *   Step 3  → visible blueprint (shown to user)
 *   Step 3.5 → compileFullContract() → FullLayoutContract (hidden)
 *   Step 4  → getContractRenderBlock(contract) → injected into render prompt
 *   Step 5  → getContractCaptionBlock(contract) → injected into caption prompt
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
    type LayoutTemplateId,
    type ZoneSpec,
    type LayoutContract,
    compileLayoutContract,
    LAYOUT_TEMPLATES,
} from "./layoutTemplates.js";

import {
    resolveCreativeSpec,
    type ResolvedCreativeSpec,
} from "./creativeResolver.js";

// ═══════════════════════════════════════════════════════════════════════════
// FULL LAYOUT CONTRACT — The unified hidden specification
// ═══════════════════════════════════════════════════════════════════════════

export interface AspectRatioRules {
    ratio: string;
    canvasWidth: number;
    canvasHeight: number;
    safeZoneInset: number;
    textZoneMaxWidthPct: number;
    heroMinSizePct: number;
    heroMaxSizePct: number;
    preferSplit: 'horizontal' | 'vertical' | 'none';
    compactCopy: boolean;
    /** Percentage of canvas height from bottom that must be text-free (for Reels/Story overlays). 0 = no restriction. */
    reelsBottomClearPct: number;
}

export interface HierarchyEntry {
    element: string;
    priority: number;
    required: boolean;
}

export interface RtlRules {
    direction: 'rtl' | 'ltr';
    textAlignment: 'right' | 'left' | 'center';
    readingFlow: 'right-to-left' | 'left-to-right';
    mirrorLayout: boolean;
    stackDirection: 'rtl' | 'ltr';
}

export interface LanguageRules {
    code: string;
    script: 'arabic' | 'latin' | 'mixed';
    fontFamily: string;
    fontWeightHeadline: string;
    fontWeightBody: string;
    minFontSizeHeadline: number;
    minFontSizeSubhead: number;
    lineHeightMultiplier: number;
    avoidTashkeel: boolean;
    dialectLabel: string;
}

export interface CopyRules {
    mustReference: string[];
    maxHeadlineChars: number;
    maxSubheadChars: number;
    maxCtaChars: number;
    maxBenefitChars: number;
    captionWordRange: [number, number];
    captionAnchors: string[];
}

/** Reference image analysis — style/mood/composition influence (NOT content copying) */
export interface ReferenceInfluence {
    compositionType: string;
    lightingStyle: string;
    colorPalette: string[];
    mood: string;
    sceneEnergy: string;
    framingHints: string[];
    depthStyle: string;
}

export interface FullLayoutContract {
    /** Unique template ID from the layout library */
    templateId: LayoutTemplateId;
    /** Human-readable template name (for logging, not UI) */
    templateName: string;
    /** Source creative modes that produced this contract */
    primaryModes: string[];
    /** Hook angle that influenced template selection */
    hookAngle: string | null;
    /** Aspect ratio spatial rules */
    aspectRatioRules: AspectRatioRules;
    /** Zone definitions from template + urgency modifier */
    zones: Record<string, ZoneSpec>;
    /** Ordered element hierarchy (priority 1 = most important) */
    hierarchy: HierarchyEntry[];
    /** Elements that MUST appear in the render */
    mustShow: string[];
    /** Elements that must NOT appear */
    mustAvoid: string[];
    /** Copy/text rules for render and caption */
    copyRules: CopyRules;
    /** RTL/directionality rules */
    rtlRules: RtlRules;
    /** Language-specific typography rules */
    languageRules: LanguageRules;
    /** Composition notes (structured, not prose) */
    compositionNotes: string;
    /** Whether urgency accent modifier is active */
    hasUrgencyAccent: boolean;
    /** Text placement rules from creative resolver */
    textPlacementRules: string[];
    /** Numeric fidelity policy: 'strict' = unauthorized numbers cause retry/rejection */
    numericFidelity: 'strict' | 'warn' | 'none';
    /** Overlay slot definitions for deterministic number rendering (from template) */
    overlaySlots: import("./layoutTemplates.js").OverlaySlotDef[];
    /** Optional reference image influence — styling/mood metadata (never overrides structure) */
    referenceInfluence: ReferenceInfluence | null;
    /** Visual style family: realistic, fantasy, or minimal */
    visualStyleFamily: 'realistic' | 'fantasy' | 'minimal';
}

// ═══════════════════════════════════════════════════════════════════════════
// ASPECT RATIO RULE CATALOG
// ═══════════════════════════════════════════════════════════════════════════

const ASPECT_RATIO_RULES: Record<string, AspectRatioRules> = {
    '1:1': {
        ratio: '1:1',
        canvasWidth: 1080,
        canvasHeight: 1080,
        safeZoneInset: 90,
        textZoneMaxWidthPct: 85,
        heroMinSizePct: 35,
        heroMaxSizePct: 60,
        preferSplit: 'none',
        compactCopy: false,
        reelsBottomClearPct: 0,
    },
    '4:5': {
        ratio: '4:5',
        canvasWidth: 1080,
        canvasHeight: 1350,
        safeZoneInset: 80,
        textZoneMaxWidthPct: 85,
        heroMinSizePct: 35,
        heroMaxSizePct: 55,
        preferSplit: 'vertical',
        compactCopy: true,
        reelsBottomClearPct: 0,
    },
    '3:4': {
        ratio: '3:4',
        canvasWidth: 1080,
        canvasHeight: 1440,
        safeZoneInset: 80,
        textZoneMaxWidthPct: 85,
        heroMinSizePct: 35,
        heroMaxSizePct: 55,
        preferSplit: 'vertical',
        compactCopy: true,
        reelsBottomClearPct: 0,
    },
    '4:3': {
        ratio: '4:3',
        canvasWidth: 1440,
        canvasHeight: 1080,
        safeZoneInset: 90,
        textZoneMaxWidthPct: 80,
        heroMinSizePct: 30,
        heroMaxSizePct: 50,
        preferSplit: 'horizontal',
        compactCopy: false,
        reelsBottomClearPct: 0,
    },
    '9:16': {
        ratio: '9:16',
        canvasWidth: 1080,
        canvasHeight: 1920,
        safeZoneInset: 70,
        textZoneMaxWidthPct: 90,
        heroMinSizePct: 30,
        heroMaxSizePct: 50,
        preferSplit: 'vertical',
        compactCopy: true,
        reelsBottomClearPct: 40,
    },
    '16:9': {
        ratio: '16:9',
        canvasWidth: 1920,
        canvasHeight: 1080,
        safeZoneInset: 100,
        textZoneMaxWidthPct: 75,
        heroMinSizePct: 30,
        heroMaxSizePct: 50,
        preferSplit: 'horizontal',
        compactCopy: false,
        reelsBottomClearPct: 0,
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE RULE CATALOG
// ═══════════════════════════════════════════════════════════════════════════

const LANGUAGE_RULE_CATALOG: Record<string, LanguageRules> = {
    'ar_fusha': {
        code: 'ar_fusha',
        script: 'arabic',
        fontFamily: 'Cairo, Tajawal, Noto Kufi Arabic',
        fontWeightHeadline: '800',
        fontWeightBody: '500',
        minFontSizeHeadline: 42,
        minFontSizeSubhead: 28,
        lineHeightMultiplier: 1.6,
        avoidTashkeel: true,
        dialectLabel: 'Modern Standard Arabic',
    },
    'ar_egyptian': {
        code: 'ar_egyptian',
        script: 'arabic',
        fontFamily: 'Cairo, Tajawal, Noto Kufi Arabic',
        fontWeightHeadline: '800',
        fontWeightBody: '500',
        minFontSizeHeadline: 42,
        minFontSizeSubhead: 28,
        lineHeightMultiplier: 1.6,
        avoidTashkeel: true,
        dialectLabel: 'Egyptian Arabic',
    },
    'ar_gulf': {
        code: 'ar_gulf',
        script: 'arabic',
        fontFamily: 'Cairo, Tajawal, Noto Kufi Arabic',
        fontWeightHeadline: '800',
        fontWeightBody: '500',
        minFontSizeHeadline: 42,
        minFontSizeSubhead: 28,
        lineHeightMultiplier: 1.6,
        avoidTashkeel: true,
        dialectLabel: 'Gulf Arabic',
    },
    'ar_levantine': {
        code: 'ar_levantine',
        script: 'arabic',
        fontFamily: 'Cairo, Tajawal, Noto Kufi Arabic',
        fontWeightHeadline: '800',
        fontWeightBody: '500',
        minFontSizeHeadline: 42,
        minFontSizeSubhead: 28,
        lineHeightMultiplier: 1.6,
        avoidTashkeel: true,
        dialectLabel: 'Levantine Arabic',
    },
    'ar_maghrebi': {
        code: 'ar_maghrebi',
        script: 'arabic',
        fontFamily: 'Cairo, Tajawal, Noto Kufi Arabic',
        fontWeightHeadline: '800',
        fontWeightBody: '500',
        minFontSizeHeadline: 42,
        minFontSizeSubhead: 28,
        lineHeightMultiplier: 1.6,
        avoidTashkeel: true,
        dialectLabel: 'Maghrebi Arabic',
    },
    'en': {
        code: 'en',
        script: 'latin',
        fontFamily: 'Inter, Montserrat, Poppins',
        fontWeightHeadline: '800',
        fontWeightBody: '400',
        minFontSizeHeadline: 36,
        minFontSizeSubhead: 22,
        lineHeightMultiplier: 1.4,
        avoidTashkeel: false,
        dialectLabel: 'English',
    },
    'fr': {
        code: 'fr',
        script: 'latin',
        fontFamily: 'Inter, Montserrat, Poppins',
        fontWeightHeadline: '700',
        fontWeightBody: '400',
        minFontSizeHeadline: 36,
        minFontSizeSubhead: 22,
        lineHeightMultiplier: 1.4,
        avoidTashkeel: false,
        dialectLabel: 'French',
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// BUILD HIERARCHY from resolver + zones
// ═══════════════════════════════════════════════════════════════════════════

function buildHierarchy(
    spec: ResolvedCreativeSpec,
    zones: Record<string, ZoneSpec>,
): HierarchyEntry[] {
    const entries: HierarchyEntry[] = [];
    const seen = new Set<string>();

    // Zone-based hierarchy (highest priority = lowest number)
    const sortedZones = Object.entries(zones)
        .sort(([, a], [, b]) => a.priority - b.priority);

    for (const [zoneName, zone] of sortedZones) {
        if (!seen.has(zoneName)) {
            entries.push({
                element: zoneName,
                priority: zone.priority,
                required: true,
            });
            seen.add(zoneName);
        }
    }

    // Resolver visual hierarchy (append anything not already covered)
    for (let i = 0; i < spec.visualHierarchy.length; i++) {
        const elem = spec.visualHierarchy[i];
        if (!seen.has(elem)) {
            entries.push({
                element: elem,
                priority: entries.length + 1,
                required: spec.mustShow.includes(elem),
            });
            seen.add(elem);
        }
    }

    // MustShow elements not yet in hierarchy
    for (const elem of spec.mustShow) {
        if (!seen.has(elem)) {
            entries.push({
                element: elem,
                priority: entries.length + 1,
                required: true,
            });
            seen.add(elem);
        }
    }

    return entries;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD RTL RULES from language
// ═══════════════════════════════════════════════════════════════════════════

function buildRtlRules(langCode: string): RtlRules {
    const isArabic = langCode.startsWith('ar');
    return {
        direction: isArabic ? 'rtl' : 'ltr',
        textAlignment: isArabic ? 'right' : 'left',
        readingFlow: isArabic ? 'right-to-left' : 'left-to-right',
        mirrorLayout: isArabic,
        stackDirection: isArabic ? 'rtl' : 'ltr',
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD COPY RULES
// ═══════════════════════════════════════════════════════════════════════════

function buildCopyRules(
    baseContract: LayoutContract,
    spec: ResolvedCreativeSpec,
    ratioRules: AspectRatioRules,
): CopyRules {
    const isCompact = ratioRules.compactCopy;
    return {
        mustReference: [...new Set([
            ...baseContract.copyRules.mustReference,
        ])],
        maxHeadlineChars: isCompact ? 40 : 55,
        maxSubheadChars: isCompact ? 50 : 70,
        maxCtaChars: 20,
        maxBenefitChars: isCompact ? 30 : 45,
        captionWordRange: [120, 150],
        captionAnchors: [...spec.captionAnchors],
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPILE FULL CONTRACT — The single entry point for Step 3.5
// ═══════════════════════════════════════════════════════════════════════════

export interface CompileContractInput {
    selectedModes: string[];
    hookAngle?: string;
    aspectRatio: string;
    adLanguage?: string;
    visualStyleFamily?: 'realistic' | 'fantasy' | 'minimal';
    /** Pre-analyzed reference image influence (optional) */
    referenceInfluence?: ReferenceInfluence | null;
}

/**
 * Compiles the FULL unified layout contract.
 * This is the ONLY function Steps 4 and 5 should call.
 *
 * It merges:
 *   1. Layout template (zones, composition)
 *   2. Creative resolver (mustShow, mustAvoid, hierarchy)
 *   3. Aspect ratio rules
 *   4. RTL rules
 *   5. Language rules
 *   6. Copy rules
 *
 * into ONE object.
 */
export function compileFullContract(input: CompileContractInput): FullLayoutContract {
    // 0. Normalize empty strings → undefined/defaults (prevent Step 1 empties leaking forward)
    const hookAngle = input.hookAngle?.trim() || undefined;
    const adLanguage = input.adLanguage?.trim() || 'ar_fusha';
    const visualStyle = (input.visualStyleFamily?.trim() || 'realistic') as 'realistic' | 'fantasy' | 'minimal';

    // 1. Resolve creative spec
    const spec = resolveCreativeSpec({
        selectedModes: input.selectedModes,
        hookAngle,
    });

    // 2. Compile base layout contract (zones, template, urgency)
    const baseContract = compileLayoutContract(
        spec.primaryMode,
        spec.secondaryMode,
        hookAngle,
        input.aspectRatio,
    );

    // 3. Aspect ratio rules
    const ratioRules = ASPECT_RATIO_RULES[input.aspectRatio] || ASPECT_RATIO_RULES['1:1'];

    // 4. Language rules
    const langCode = adLanguage;
    const langRules = LANGUAGE_RULE_CATALOG[langCode] || LANGUAGE_RULE_CATALOG['ar_fusha'];

    // 5. RTL rules
    const rtlRules = buildRtlRules(langCode);

    // 6. Build hierarchy
    const hierarchy = buildHierarchy(spec, baseContract.zones);

    // 7. Merge mustShow (resolver) + mustAvoid (resolver + template)
    const mergedMustShow = [...new Set([
        ...spec.mustShow,
        // Zone names with priority 1-2 are implicitly must-show
        ...Object.entries(baseContract.zones)
            .filter(([, z]) => z.priority <= 2)
            .map(([name]) => name),
    ])];

    const mergedMustAvoid = [...new Set([
        ...baseContract.mustAvoid,
        ...spec.mustAvoid,
        // PATCH C: Minimal style enforces strict mustAvoid for cinematic/atmospheric effects
        ...(visualStyle === 'minimal' ? [
            'cinematic_lighting', 'volumetric_light', 'golden_hour', 'neon_glow',
            'bokeh', 'dust_motes', 'smoke_wisps', 'dramatic_atmosphere',
            'haze', 'particles', 'god_rays', 'rim_light',
            'back_light', 'atmospheric_haze', 'depth_of_field',
            'floating_3d_text', 'glowing_neon_text', 'cinematic_typography',
            'environment_scenery', 'fantasy_worldbuilding',
        ] : []),
    ])];

    // 8. Build copy rules
    const copyRules = buildCopyRules(baseContract, spec, ratioRules);

    // 9. Text placement rules from resolver
    const textPlacementRules = [...spec.textPlacementRules];

    // 10. Numeric fidelity policy — strict for modes that display commercial figures
    const strictNumericModes = ['value_stack', 'premium_package', 'limited_access'];
    const numericFidelity: 'strict' | 'warn' | 'none' =
        input.selectedModes.some(m => strictNumericModes.includes(m)) ? 'strict' : 'none';

    // 11. Overlay slots — from template definition for deterministic number rendering
    const templateDef = LAYOUT_TEMPLATES[baseContract.template];
    const overlaySlots = templateDef?.overlaySlots || [];

    return {
        templateId: baseContract.template,
        templateName: baseContract.templateName,
        primaryModes: baseContract.sourceModes,
        hookAngle: baseContract.hookAngle,
        aspectRatioRules: ratioRules,
        zones: baseContract.zones,
        hierarchy,
        mustShow: mergedMustShow,
        mustAvoid: mergedMustAvoid,
        copyRules,
        rtlRules,
        languageRules: langRules,
        compositionNotes: baseContract.compositionNotes,
        hasUrgencyAccent: baseContract.hasUrgencyAccent,
        textPlacementRules,
        numericFidelity,
        overlaySlots,
        referenceInfluence: input.referenceInfluence || null,
        visualStyleFamily: visualStyle,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT → RENDER PROMPT BLOCK (Step 4)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converts the full contract into a structured prompt block for Gemini render.
 * This replaces the old separate specBlock + contractBlock approach.
 */
/**
 * Optional filter: which commercial overlay slots have actual user data.
 * Slots not in this set will be omitted from the contract render block
 * to prevent the AI from rendering empty placeholder boxes.
 */
export interface OverlayDataFilter {
    hasPrice?: boolean;
    hasTotalValue?: boolean;
    hasSavings?: boolean;
    hasGuarantee?: boolean;
    /** valueItem slots are kept when items exist — always true if value_stack mode */
    hasValueItems?: boolean;
}

export function getContractRenderBlock(contract: FullLayoutContract, overlayFilter?: OverlayDataFilter): string {
    // Zone lines
    const zoneLines = Object.entries(contract.zones).map(([name, zone]) => {
        const parts = [`anchor: ${zone.anchor}`, `priority: ${zone.priority}`];
        if (zone.minSizePct) parts.push(`min: ${zone.minSizePct}%`);
        if (zone.maxSizePct) parts.push(`max: ${zone.maxSizePct}%`);
        if (zone.minItems) parts.push(`min_items: ${zone.minItems}`);
        if (zone.maxItems) parts.push(`max_items: ${zone.maxItems}`);
        return `  ${name}: { ${parts.join(', ')} }`;
    });

    // Hierarchy lines
    const hierarchyLines = contract.hierarchy.map(h =>
        `  ${h.priority}. ${h.element.replace(/_/g, ' ')}${h.required ? ' [REQUIRED]' : ' [optional]'}`
    );

    // Aspect ratio block
    const ar = contract.aspectRatioRules;
    const arBlock = `Canvas: ${ar.canvasWidth}×${ar.canvasHeight} | Safe zone: ${ar.safeZoneInset}px inset | Text max-width: ${ar.textZoneMaxWidthPct} | Hero: ${ar.heroMinSizePct}-${ar.heroMaxSizePct}${ar.compactCopy ? ' | COMPACT COPY MODE' : ''}${ar.reelsBottomClearPct > 0 ? ` | REELS BOTTOM-CLEAR: Keep the bottom area of canvas FREE of text, logos, and critical elements (platform overlays cover this area)` : ''} | ALL numbers in this block are INVISIBLE LAYOUT GUIDES — NEVER render them as visible text in the image`;

    // RTL block
    const rtl = contract.rtlRules;
    const rtlBlock = rtl.direction === 'rtl'
        ? `Direction: RTL | Text align: RIGHT | Reading flow: right→left | Mirror layout: YES | Stack: RTL`
        : `Direction: LTR | Text align: LEFT | Reading flow: left→right | Mirror layout: NO | Stack: LTR`;

    // Language/typography block
    const lang = contract.languageRules;
    const langBlock = `Script: ${lang.script} (${lang.dialectLabel}) | Font: ${lang.fontFamily} | Headline weight: ${lang.fontWeightHeadline}, min ${lang.minFontSizeHeadline}px | Subhead weight: ${lang.fontWeightBody}, min ${lang.minFontSizeSubhead}px | Line-height: ${lang.lineHeightMultiplier}×${lang.avoidTashkeel ? ' | NO tashkeel/diacritics' : ''}`;

    return `
═══════════════════════════════════════════════════════════════════════════════
LAYOUT CONTRACT (MANDATORY — follow exactly)
Template: ${contract.templateName} [${contract.templateId}]
Modes: ${contract.primaryModes.join(' + ')}${contract.hookAngle ? ` | Hook: ${contract.hookAngle}` : ''}
═══════════════════════════════════════════════════════════════════════════════

SPATIAL RULES:
${arBlock}

ZONES:
${zoneLines.join('\n')}

ELEMENT HIERARCHY (render in this priority order):
${hierarchyLines.join('\n')}

${contract.mustShow.length > 0 ? `MUST SHOW:\n${contract.mustShow.map(s => `• ${s.replace(/_/g, ' ')}`).join('\n')}` : ''}
${contract.mustAvoid.length > 0 ? `\nMUST AVOID:\n${contract.mustAvoid.map(s => `• ${s.replace(/_/g, ' ')}`).join('\n')}` : ''}
${contract.textPlacementRules.length > 0 ? `\nTEXT PLACEMENT:\n${contract.textPlacementRules.map(s => `• ${s.replace(/_/g, ' ')}`).join('\n')}` : ''}

TYPOGRAPHY:
${langBlock}

DIRECTIONALITY:
${rtlBlock}

COPY LIMITS:
Headline: max ${contract.copyRules.maxHeadlineChars} chars | Subhead: max ${contract.copyRules.maxSubheadChars} chars | CTA: max ${contract.copyRules.maxCtaChars} chars | Benefit: max ${contract.copyRules.maxBenefitChars} chars

${contract.compositionNotes?.trim() ? `COMPOSITION:\n${contract.compositionNotes}` : ''}
${contract.hasUrgencyAccent ? '\nURGENCY ACCENT ACTIVE: Add urgency badge/countdown/deadline ribbon. Must NOT exceed 20% of canvas.' : ''}
${contract.visualStyleFamily === 'minimal' ? `
VISUAL STYLE: MINIMAL (MANDATORY)
- COMPOSITION: Sparse layout, minimal object count, whitespace priority. Very few elements on canvas.
- BACKGROUND: Plain solid color, soft gradient, or very simple branded backdrop ONLY. NO scenery, NO locations, NO detailed environments, NO fantasy worldbuilding.
- SUBJECT: Must be ISOLATED — hero person, mockup, device, or offer framework only. Allowed extras: subtle floor/shadow, simple platform, brand color accent.
- TEXT: Restrained typography only. NO floating text, NO glowing text, NO cinematic text effects, NO 3D text, NO neon text, NO volumetric text lighting.
- EFFECTS FORBIDDEN: cinematic lighting, volumetric light, golden hour, neon glow, bokeh, dust motes, smoke wisps, dramatic atmosphere, haze, particles, god rays, rim light, back light, depth of field.
- OVERALL: Clean, commercial, studio-like, polished, brand-safe. Text-safe zones must be clearly open. NO environmental clutter, NO atmospheric effects, NO scene complexity.
` : ''}
${(() => {
    // Filter overlay slots: only include slots that have actual user data
    const slotFilter: Record<string, boolean> = {
        price: overlayFilter?.hasPrice ?? true,
        totalValue: overlayFilter?.hasTotalValue ?? true,
        savings: overlayFilter?.hasSavings ?? true,
        guarantee: overlayFilter?.hasGuarantee ?? true,
        valueItem: overlayFilter?.hasValueItems ?? true,
    };
    const activeSlots = contract.overlaySlots
        .filter((s, i, arr) => arr.findIndex(a => a.id === s.id) === i)
        .filter(s => slotFilter[s.id] !== false);
    if (activeSlots.length === 0) return '';
    return `
OVERLAY RESERVATION ZONES (CRITICAL — keep these areas CLEAN):
The app will composite exact numbers/prices onto these reserved regions AFTER image generation.
You MUST render solid-colored placeholder panels in these areas — NO text, NO decorative clutter, NO competing icons.
${activeSlots.map(s => {
        const desc = s.id === 'valueItem' ? 'Structured row cards only — render clean dark card bars with no literal labels or values'
            : s.id === 'price' ? 'Primary commercial panel only — render a clean solid button/card shape with NO text or numbers'
                : s.id === 'totalValue' ? 'Comparison panel only — render a clean dark panel with NO text or numbers'
                    : s.id === 'savings' ? 'Secondary capsule only — keep this region clean with NO text or numbers'
                        : s.id === 'guarantee' ? 'Empty badge/container shape only — no literal label text'
                            : 'Reserved overlay area';
        return `• ${s.id.replace(/([A-Z])/g, ' $1').trim()} zone (${s.zoneAnchor}, ~${s.xPct}-${s.xPct + s.widthPct}% x, ~${s.yPct}-${s.yPct + s.heightPct}% y): ${desc}`;
    }).join('\n')}
⚠️ Do NOT render any dollar amounts, prices, percentages, or commercial numbers in these zones.
⚠️ Do NOT render any text at all in the price/totalValue/savings zones — only solid colored shapes.
⚠️ Value item card zones should show labeled card shapes but NO per-item dollar values.
The app will stamp exact user-entered figures onto these panels deterministically.`;
})()}
${(() => {
    const ri = contract.referenceInfluence;
    if (!ri) return '';
    const riLines = [
        ri.compositionType ? `- Composition style: ${ri.compositionType}` : '',
        ri.lightingStyle ? `- Lighting: ${ri.lightingStyle}` : '',
        ri.colorPalette?.length ? `- Color palette: ${ri.colorPalette.join(', ')}` : '',
        ri.mood ? `- Mood: ${ri.mood}` : '',
        ri.sceneEnergy ? `- Scene energy: ${ri.sceneEnergy}` : '',
        ri.framingHints?.length ? `- Framing hints: ${ri.framingHints.join(', ')}` : '',
        ri.depthStyle ? `- Depth style: ${ri.depthStyle}` : '',
    ].filter(Boolean);
    if (riLines.length === 0) return '';
    return `
REFERENCE IMAGE DIRECTION (STYLE INFLUENCE ONLY — do NOT copy the reference):
⚠️ The reference image is for INSPIRATION, not replication. Do NOT reproduce faces, logos, or copyrighted elements from it.
${riLines.join('\n')}
Create an ORIGINAL ad inspired by these stylistic qualities. The layout contract zones/hierarchy above remain the structural authority.`;
})()}

This contract is BINDING. Do not improvise outside these zone definitions.
═══════════════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT → CAPTION PROMPT BLOCK (Step 5)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converts the full contract into a structured prompt block for caption generation.
 * This replaces the old separate modeAnchors + contractAnchors approach.
 */
export function getContractCaptionBlock(contract: FullLayoutContract): string {
    const anchors = contract.copyRules.captionAnchors;
    const refs = contract.copyRules.mustReference;
    const [minWords, maxWords] = contract.copyRules.captionWordRange;

    const anchorLine = anchors.length > 0
        ? `VISUAL ANCHORS (reference in caption): ${anchors.map(a => `"${a}"`).join(', ')}`
        : '';

    const refLine = refs.length > 0
        ? `MUST REFERENCE: ${refs.join(', ')}`
        : '';

    const optionalLines = [
        anchorLine,
        refLine,
        contract.hasUrgencyAccent ? 'URGENCY ELEMENTS VISIBLE: Reference deadline/countdown in caption.' : '',
        contract.referenceInfluence?.mood && contract.referenceInfluence?.sceneEnergy
            ? `REFERENCE TONE: The visual uses a ${contract.referenceInfluence.mood} mood with ${contract.referenceInfluence.sceneEnergy} energy. Match this tone in the caption voice — but keep the marketing message and offer logic unchanged.`
            : '',
        contract.visualStyleFamily === 'minimal' ? 'VISUAL STYLE IS MINIMAL: Caption must NOT imply rich environments, fantasy scenes, or cinematic locations. Keep copy concise, direct, and commercially clean.' : '',
    ].filter(Boolean).join('\n');

    return `
═══════════════════════════════════════════════════════════════════════════════
CAPTION CONTRACT (from layout: ${contract.templateName})
═══════════════════════════════════════════════════════════════════════════════
Visual template: ${contract.templateName} [${contract.templateId}]
Modes: ${contract.primaryModes.join(' + ')}${contract.hookAngle ? ` | Hook: ${contract.hookAngle}` : ''}
${optionalLines}
Word count target: ${minWords}-${maxWords} words
Language: ${contract.languageRules.dialectLabel} (${contract.rtlRules.direction.toUpperCase()})
═══════════════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT → SCORING CONTEXT (for creativeScoringEngine)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extracts the fields needed by the scoring engine from the full contract.
 * Returns the old-shape LayoutContract for backward compatibility with scoring.
 */
export function getContractForScoring(contract: FullLayoutContract): LayoutContract {
    return {
        template: contract.templateId,
        templateName: contract.templateName,
        zones: contract.zones,
        mustAvoid: contract.mustAvoid,
        copyRules: {
            mustReference: contract.copyRules.mustReference,
        },
        compositionNotes: contract.compositionNotes,
        hasUrgencyAccent: contract.hasUrgencyAccent,
        sourceModes: contract.primaryModes,
        hookAngle: contract.hookAngle,
        requiredMinimalPatterns: (contract as any).requiredMinimalPatterns ?? [],
        forbiddenMinimalPatterns: (contract as any).forbiddenMinimalPatterns ?? [],
    };
}