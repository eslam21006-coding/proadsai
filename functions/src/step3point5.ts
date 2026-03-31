/**
 * step3point5.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * STEP 3.5 — Layout Design (Hidden Machine Layer)
 * ═══════════════════════════════════════════════════════════════════════════
 * Invisible to the user. Fires after blueprint confirmation.
 * Single Gemini call → structured layoutSpec JSON consumed by Step 4.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TextZone, TextStyle } from "./textCompositing.js";
import { getDefaultTextZone, getDefaultTextStyle } from "./textCompositing.js";

// ─── INTERFACES ──────────────────────────────────────────────────────────

export type RenderRoute = 'fal' | 'gemini';

export interface LayoutSpec {
    archetypeKey: string;
    fluxScenePrompt: string;
    fluxNegativePrompt: string;
    textZone: TextZone;
    textStyle: TextStyle;
    designRationale: string;
}

// ─── ROUTE DECISION ──────────────────────────────────────────────────────

/** Hero-producing creative modes that qualify for fal.ai Route A */
const HERO_MODES = new Set([
    'standard_hero',
    'speaker_card',
    'webinar_screen',
]);

/** Style families where flux-pulid produces good results (photorealistic face preservation) */
const FAL_COMPATIBLE_STYLES = new Set([
    'realistic',
]);

/**
 * Determine render route based on face photo, creative modes, AND style family.
 *
 * Route A (fal.ai flux-pulid): face photo + hero mode + realistic style
 * Route B (Gemini): everything else (fantasy, minimal, illustrated, etc.)
 *
 * flux-pulid is designed for photorealistic faces — it cannot produce
 * Fantasy/Vintage/Illustrated/Minimal styles, so sending those wastes 60-120s.
 */
export function decideRenderRoute(
    hasFacePhoto: boolean,
    creativeModes: string[],
    styleFamilyKey: string = 'realistic',
): RenderRoute {
    const isHeroMode = creativeModes.some(m => HERO_MODES.has(m));
    const isCompatibleStyle = FAL_COMPATIBLE_STYLES.has(styleFamilyKey);

    if (hasFacePhoto && isHeroMode && isCompatibleStyle) {
        console.log(`🎯 Route decision: fal (hasFace=true, heroMode=true, style=${styleFamilyKey})`);
        return 'fal';
    }
    console.log(`🎯 Route decision: gemini (hasFace=${hasFacePhoto}, heroMode=${isHeroMode}, style=${styleFamilyKey})`);
    return 'gemini';
}

// ─── LAYOUT ARCHETYPE LIBRARY ────────────────────────────────────────────

const ARCHETYPE_LIBRARY = `
## Layout Archetype Library

**SIDE_GRADIENT_SPLIT**
Subject occupies one side of the frame (left or right). The opposite side is a smooth gradient that fades from the scene's dominant color to near-black or near-white. The gradient band is a designed graphic element — not background — and is where the text lives.
Best for: Realistic portrait, Luxury Magazine, Neon Urban, most hero modes.
Text zone: the gradient band side, vertically centered.

**BOTTOM_CINEMATIC_BAR**
Full bleed scene. A designed horizontal bar (solid, semi-transparent, or gradient) occupies the bottom 18–22% of the frame. This bar is part of the composition instruction to FLUX — like a film title card — not an afterthought overlay.
Best for: Dark Cinematic, Documentary Gritty, Mythic Epic, wide landscape scenes.
Text zone: inside the bar, left-aligned or centered.

**FLOATING_FROSTED_CARD**
Scene fills the frame. A frosted glass card, solid color card, or bordered panel is rendered as part of the scene — positioned naturally in the composition (lower left, center bottom, upper right). FLUX is instructed to render this card as a physical object in the scene (resting on a surface, floating, pinned to a wall).
Best for: Luxury Magazine, Watercolor Dreamscape, Bright Illustrated, any style where a design element can feel tactile.
Text zone: inside the card boundaries.

**NEGATIVE_SPACE_COMPOSITION**
Subject deliberately composed to one area of the frame (e.g. lower-right third), leaving intentional clean negative space elsewhere. The negative space has tonal depth — color, texture, atmosphere — but no competing visual elements.
Best for: Minimal, Anime/Manga, Comic Book, Watercolor Dreamscape.
Text zone: the negative space area.

**INTEGRATED_SHAPE_OVERLAY**
A geometric or organic shape (banner, ribbon, arch, panel, stripe, tag) is part of the scene design. FLUX renders it as a designed element within the composition — a painted stripe across a wall, a label on a surface, a badge in the scene.
Best for: Vintage B&W, Vintage Sepia, Comic Book, Bright Illustrated.
Text zone: inside the shape.

**FULL_BLEED_DEPTH_LAYER**
Subject fills most of the frame. A specific zone is rendered with intentional depth (heavy bokeh, atmospheric fog, shadow fall-off, or gradient vignette) that creates a visually quiet layer over the scene without removing it. Text sits on this depth layer.
Best for: Fantasy scenes, Mythic Epic, Dark Cinematic, any scene with a strong foreground subject.
Text zone: the depth layer zone.
`;

// ─── TEXT STYLE DERIVATION RULES ─────────────────────────────────────────

function deriveTextStyle(textZone: TextZone, archetypeKey: string): TextStyle {
    const base: TextStyle = {
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 2,
        shadowEnabled: false,
        shadowColor: null,
        shadowBlur: null,
        backgroundTreatment: 'none',
        backgroundTreatmentColor: '#0a162880',
        fontSize: 'large',
        fontWeight: 'bold',
        textAlign: 'right',
        lineHeightMultiplier: 1.4,
    };

    // Derivation rules from architecture plan
    if (textZone.zoneLuminosity === 'dark') {
        base.color = '#FFFFFF';
        base.strokeColor = '#000000';
        base.strokeWidth = 2;
        base.backgroundTreatment = 'none';
    } else if (textZone.zoneLuminosity === 'light') {
        base.color = '#1a1a1a';
        base.strokeColor = '#FFFFFF';
        base.strokeWidth = 2;
        base.backgroundTreatment = 'none';
    } else if (textZone.zoneLuminosity === 'mid') {
        base.color = '#FFFFFF';
        base.backgroundTreatment = 'frosted_pill';
        // zoneBaseColor at 70% opacity
        const baseColor = textZone.zoneBaseColor.replace('#', '');
        base.backgroundTreatmentColor = `#${baseColor}B3`; // B3 ≈ 70% opacity
    }

    // Card/shape archetypes: background treatment is already rendered by FLUX
    if (archetypeKey === 'FLOATING_FROSTED_CARD' || archetypeKey === 'INTEGRATED_SHAPE_OVERLAY') {
        base.backgroundTreatment = 'none';
    }

    return base;
}

// ─── GEMINI CALL ─────────────────────────────────────────────────────────

const LAYOUT_SPEC_PROMPT = `You are a senior art director for Arabic advertising. Your job is to design the full ad composition as a production specification.

Given the creative brief below, select the most appropriate layout archetype and design the complete layout specification.

${ARCHETYPE_LIBRARY}

## Sub-Style Visual Rules (MANDATORY — the fluxScenePrompt MUST reflect these):

**luxury_magazine**: Clean white/off-white studio background. Subject in couture-level fashion, impeccably tailored suit or designer outfit. STATIC POSE — standing confidently, seated elegantly, or leaning on a surface. NO walking, NO gesturing wildly. Think Vogue/GQ editorial. Soft diffused lighting, zero harsh shadows. Minimal props — only high-end items (leather chair, marble desk). NO busy backgrounds.

**dark_cinematic**: Deep blacks, moody teal/amber color grading. Heavy contrast, cinematic aspect. Subject in dramatic low-key lighting with rim light or hair light. Urban or architectural backdrop with depth. Film noir atmosphere.

**neon_urban**: Vibrant neon-lit urban environment. Subject illuminated by neon signs, LED strips, or colorful city lights. Night scene, wet reflections on streets. Cyberpunk-adjacent aesthetic.

**documentary_gritty**: Raw, unpolished look. Natural/available lighting. Subject in authentic environment. Desaturated or muted color palette. Photojournalistic composition.

**vintage_bw**: Black and white photography. Film grain, classic poses. Timeless elegance. High contrast monochrome.

**vintage_sepia**: Warm sepia tones. Aged photograph look. Classic vintage styling. Soft vignette.

**bright_illustrated**: Bold, vibrant illustrated style. Flat colors, clean lines, graphic poster aesthetic.

**anime_manga**: Japanese animation style. Large expressive eyes, dynamic poses, bold linework, cell-shaded.

**watercolor_dreamscape**: Soft watercolor washes, dreamy atmosphere, blended edges, pastel or muted tones.

**comic_book**: Bold outlines, halftone dots, dynamic action poses, speech bubble aesthetic, pop art colors.

**mythic_epic**: Grand mythological scale. Golden/bronze tones, dramatic sky, epic proportions, heroic lighting.

## Rules:
1. Select the archetype that best fits the style, mood, and creative mode combination.
2. Design the fluxScenePrompt as a complete English-language scene generation prompt for FLUX AI image generator.
   - Include: subject, composition, lighting, style, mood
   - Include: the intentional design of the text zone as a physical or graphic element
   - CRITICAL: The sub-style rules above MUST be reflected in the scene prompt. If sub-style is "luxury_magazine", the prompt MUST describe a luxury magazine editorial scene with static pose. If "dark_cinematic", it MUST describe cinematic moody lighting. The sub-style overrides generic descriptions.
   - Do NOT use Arabic characters anywhere in the prompt
   - Do NOT say "leave space for text" — instead describe WHAT IS in that space
   - Example: "the left third of the frame is a deep teal gradient, smooth, no objects, designed as a graphic element"
3. The fluxNegativePrompt must always include: "text, letters, writing, watermark, signature, words, numbers, typography, captions"
4. textZone defines where Arabic text will be composited AFTER generation
5. Return ONLY valid JSON — no prose, no markdown, no explanation

## JSON Output Schema:
{
  "archetypeKey": "SIDE_GRADIENT_SPLIT",
  "fluxScenePrompt": "...",
  "fluxNegativePrompt": "text, letters, writing, watermark, signature, words, numbers, typography, captions ...",
  "textZone": {
    "horizontalPosition": "left | center | right",
    "verticalPosition": "top | center | bottom",
    "xPercent": 5,
    "yPercent": 60,
    "widthPercent": 42,
    "heightPercent": 35,
    "zoneBaseColor": "#0a1628",
    "zoneLuminosity": "dark | light | mid"
  },
  "textStyle": {
    "color": "#FFFFFF",
    "strokeColor": "#000000",
    "strokeWidth": 2,
    "shadowEnabled": false,
    "shadowColor": null,
    "shadowBlur": null,
    "backgroundTreatment": "none | frosted_pill | solid_pill | gradient_band",
    "backgroundTreatmentColor": "#0a162880",
    "fontSize": "large | medium | small",
    "fontWeight": "bold | regular",
    "textAlign": "right | center | left",
    "lineHeightMultiplier": 1.4
  },
  "designRationale": "One sentence. Internal debugging only."
}
`;

/**
 * Generate layout specification via Gemini.
 * On failure, returns safe defaults (bottom-center, dark treatment, white text).
 */
export async function generateLayoutSpec(
    blueprintText: string,
    hookText: string,
    hookCharacterCount: number,
    styleFamilyKey: string,
    subStyleKey: string,
    creativeModeKey: string,
    dominantMoodWords: string[],
    hasFacePhoto: boolean,
    geminiApiKey: string,
): Promise<LayoutSpec> {
    const LOGIC_MODEL = "gemini-2.5-flash-lite";

    try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: LOGIC_MODEL });

        const briefContent = `
## Creative Brief
- Blueprint: ${blueprintText}
- Hook text (Arabic): ${hookText}
- Hook character count: ${hookCharacterCount}
- Style family: ${styleFamilyKey}
- Sub-style: ${subStyleKey}
- Creative mode: ${creativeModeKey}
- Mood: ${dominantMoodWords.join(', ')}
- Has face photo (hero subject): ${hasFacePhoto ? 'YES — subject is a real person, compose for face identity preservation' : 'NO — use illustrated or abstract hero'}
`;

        const result = await model.generateContent([
            { text: LAYOUT_SPEC_PROMPT },
            { text: briefContent },
        ]);

        const responseText = result.response.text();

        // Extract JSON from response (may be wrapped in code fences)
        let jsonStr = responseText;
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        } else {
            // Try to find raw JSON object
            const braceMatch = responseText.match(/\{[\s\S]*\}/);
            if (braceMatch) {
                jsonStr = braceMatch[0];
            }
        }

        const parsed = JSON.parse(jsonStr);

        // Validate required fields
        if (!parsed.archetypeKey || !parsed.fluxScenePrompt || !parsed.textZone) {
            throw new Error('Missing required fields in layoutSpec JSON');
        }

        // Ensure textStyle follows derivation rules
        const textZone: TextZone = {
            horizontalPosition: parsed.textZone.horizontalPosition || 'center',
            verticalPosition: parsed.textZone.verticalPosition || 'bottom',
            xPercent: parsed.textZone.xPercent ?? 5,
            yPercent: parsed.textZone.yPercent ?? 60,
            widthPercent: parsed.textZone.widthPercent ?? 90,
            heightPercent: parsed.textZone.heightPercent ?? 30,
            zoneBaseColor: parsed.textZone.zoneBaseColor || '#0a1628',
            zoneLuminosity: parsed.textZone.zoneLuminosity || 'dark',
        };

        // Use derived text style (enforcing rules), but allow Gemini overrides for non-ruled fields
        const derivedStyle = deriveTextStyle(textZone, parsed.archetypeKey);
        const textStyle: TextStyle = {
            ...derivedStyle,
            fontSize: parsed.textStyle?.fontSize || derivedStyle.fontSize,
            fontWeight: parsed.textStyle?.fontWeight || derivedStyle.fontWeight,
            textAlign: parsed.textStyle?.textAlign || derivedStyle.textAlign,
            lineHeightMultiplier: parsed.textStyle?.lineHeightMultiplier || derivedStyle.lineHeightMultiplier,
        };

        const layoutSpec: LayoutSpec = {
            archetypeKey: parsed.archetypeKey,
            fluxScenePrompt: parsed.fluxScenePrompt,
            fluxNegativePrompt: parsed.fluxNegativePrompt || 'text, letters, writing, watermark, signature, words, numbers, typography, captions',
            textZone,
            textStyle,
            designRationale: parsed.designRationale || '',
        };

        console.log(`✅ Step 3.5 layoutSpec generated: archetype=${layoutSpec.archetypeKey}`);
        return layoutSpec;

    } catch (err) {
        console.error('❌ Step 3.5 layoutSpec generation failed, using safe defaults:', err);
        return getFallbackLayoutSpec();
    }
}

/**
 * Safe fallback layout spec: bottom-center, dark, white text.
 * Used when Step 3.5 Gemini call fails or returns malformed JSON.
 */
export function getFallbackLayoutSpec(): LayoutSpec {
    return {
        archetypeKey: 'BOTTOM_CINEMATIC_BAR',
        fluxScenePrompt: 'Professional advertising scene, cinematic lighting, high quality, clean composition with a dark gradient bar at the bottom 20 percent of the frame designed as a title card element',
        fluxNegativePrompt: 'text, letters, writing, watermark, signature, words, numbers, typography, captions, low quality, blurry',
        textZone: getDefaultTextZone(),
        textStyle: getDefaultTextStyle(),
        designRationale: 'Fallback: Step 3.5 Gemini call failed, using safe defaults.',
    };
}
