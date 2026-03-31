/**
 * artDirectionConfig.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * ART DIRECTION CARD GRID — Data model for the visual card selector.
 * Each card maps to a `visualSubStyle` value used by generators.ts.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getBlockedModesForSubStyle } from './creativeResolver';

export type ArtDirectionGroup =
    | 'editorial'
    | 'illustrated'
    | 'vintage'
    | 'cinematic'
    | 'street'
    | 'digital'
    | 'raw';

export interface ArtDirectionGroupMeta {
    id: ArtDirectionGroup;
    labelEn: string;
    labelAr: string;
    icon: string;
}

export interface ArtDirectionCard {
    id: string;
    labelEn: string;
    labelAr: string;
    icon: string;
    descriptionEn: string;
    descriptionAr: string;
    group: ArtDirectionGroup;
    families: ('realistic' | 'fantasy')[];
    thumbnailHint: string; // Tailwind gradient/bg class
}

export const ART_DIRECTION_GROUPS: ArtDirectionGroupMeta[] = [
    { id: 'editorial', labelEn: 'Editorial', labelAr: 'تحريري', icon: '📰' },
    { id: 'illustrated', labelEn: 'Illustrated', labelAr: 'مرسوم', icon: '🎨' },
    { id: 'vintage', labelEn: 'Vintage', labelAr: 'كلاسيكي', icon: '📜' },
    { id: 'cinematic', labelEn: 'Cinematic', labelAr: 'سينمائي', icon: '🎬' },
    { id: 'street', labelEn: 'Street & Real', labelAr: 'شوارع وواقعي', icon: '📷' },
    { id: 'digital', labelEn: 'Digital', labelAr: 'رقمي', icon: '💿' },
    { id: 'raw', labelEn: 'Raw', labelAr: 'خام', icon: '📝' },
];

export const ART_DIRECTION_CARDS: ArtDirectionCard[] = [
    // ── EDITORIAL ──
    { id: 'luxury_magazine', labelEn: 'Luxury Magazine', labelAr: 'مجلة فاخرة', icon: '📰',
      descriptionEn: 'Forbes / Vogue editorial — studio backdrop, thin rule lines, metallic accents',
      descriptionAr: 'تحريري فاخر — خلفية استوديو، خطوط رفيعة، لمسات معدنية',
      group: 'editorial', families: ['realistic'], thumbnailHint: 'bg-gradient-to-br from-amber-100 to-stone-50' },
    { id: 'clean_corporate', labelEn: 'Clean Corporate', labelAr: 'احترافي نظيف', icon: '🏢',
      descriptionEn: 'Apple / Nike aesthetic — neutral gradient, premium studio quality',
      descriptionAr: 'أسلوب أبل / نايكي — تدرج محايد، جودة استوديو',
      group: 'editorial', families: ['realistic'], thumbnailHint: 'bg-gradient-to-br from-slate-200 to-blue-100' },

    // ── ILLUSTRATED ──
    { id: 'comic_book', labelEn: 'Comic Book', labelAr: 'كتاب مصور', icon: '💥',
      descriptionEn: 'Bold 4-color panels, halftone dots, action energy',
      descriptionAr: 'ألوان جريئة، نقاط هافتون، طاقة أكشن',
      group: 'illustrated', families: ['realistic', 'fantasy'], thumbnailHint: 'bg-gradient-to-br from-red-500 to-blue-600' },
    { id: 'anime_manga', labelEn: 'Anime / Manga', labelAr: 'أنيمي / مانغا', icon: '⚡',
      descriptionEn: 'Cel-shaded, speed lines, manga splash page energy',
      descriptionAr: 'رسوم أنيمي، خطوط سرعة، طاقة مانغا',
      group: 'illustrated', families: ['fantasy'], thumbnailHint: 'bg-gradient-to-br from-pink-500 to-violet-600' },
    { id: 'watercolor_dreamscape', labelEn: 'Watercolor', labelAr: 'ألوان مائية', icon: '🎨',
      descriptionEn: 'Soft painted edges, bleeding washes, dreamy atmosphere',
      descriptionAr: 'حواف ناعمة، ألوان مائية حالمة',
      group: 'illustrated', families: ['fantasy'], thumbnailHint: 'bg-gradient-to-br from-rose-200 to-sky-200' },
    { id: 'pixel_retro_game', labelEn: 'Pixel Retro', labelAr: 'بكسل ريترو', icon: '👾',
      descriptionEn: '16-bit game sprites, pixel grid, retro UI',
      descriptionAr: 'رسوم بكسل 16-بت، شبكة ريترو',
      group: 'illustrated', families: ['fantasy'], thumbnailHint: 'bg-gradient-to-br from-green-800 to-emerald-500' },
    { id: 'stained_glass', labelEn: 'Stained Glass', labelAr: 'زجاج ملون', icon: '🏛️',
      descriptionEn: 'Jewel-toned panels, dark lead lines, backlit cathedral energy',
      descriptionAr: 'ألواح جواهر، خطوط رصاص داكنة، كاتدرائية',
      group: 'illustrated', families: ['fantasy'], thumbnailHint: 'bg-gradient-to-br from-purple-900 to-amber-500' },

    // ── VINTAGE ──
    { id: 'vintage_bw', labelEn: 'Vintage B&W', labelAr: 'أبيض وأسود', icon: '🖋️',
      descriptionEn: '1950s ink illustration, cross-hatching, newspaper ad energy',
      descriptionAr: 'رسم حبر خمسينيات، إعلان صحفي كلاسيكي',
      group: 'vintage', families: ['realistic', 'fantasy'], thumbnailHint: 'bg-gradient-to-br from-gray-800 to-gray-300' },
    { id: 'vintage_sepia', labelEn: 'Vintage Sepia', labelAr: 'سيبيا كلاسيكي', icon: '📜',
      descriptionEn: 'Warm sepia ink on aged parchment paper',
      descriptionAr: 'حبر سيبيا دافئ على ورق عتيق',
      group: 'vintage', families: ['realistic', 'fantasy'], thumbnailHint: 'bg-gradient-to-br from-amber-700 to-amber-200' },

    // ── CINEMATIC ──
    { id: 'dark_cinematic', labelEn: 'Dark Cinematic', labelAr: 'سينمائي داكن', icon: '🎬',
      descriptionEn: 'Movie poster — deep black, single key light, atmospheric smoke',
      descriptionAr: 'ملصق فيلم — ظلام عميق، إضاءة درامية، دخان',
      group: 'cinematic', families: ['fantasy'], thumbnailHint: 'bg-gradient-to-br from-slate-950 to-blue-950' },
    { id: 'bright_illustrated', labelEn: 'Bright Warm', labelAr: 'مضيء ودافئ', icon: '☀️',
      descriptionEn: 'Warm saturated illustration — bright, optimistic, inviting',
      descriptionAr: 'رسم دافئ مشبع — مشرق ومتفائل',
      group: 'cinematic', families: ['fantasy'], thumbnailHint: 'bg-gradient-to-br from-amber-300 to-orange-400' },
    { id: 'mythic_epic', labelEn: 'Mythic Epic', labelAr: 'ملحمي أسطوري', icon: '⚔️',
      descriptionEn: 'Fantasy movie poster — jewel tones, magical particles, grand scale',
      descriptionAr: 'ملصق فيلم خيالي — ألوان جواهر، جسيمات سحرية',
      group: 'cinematic', families: ['fantasy'], thumbnailHint: 'bg-gradient-to-br from-emerald-900 to-purple-900' },
    { id: 'cinematic_film_still', labelEn: 'Film Still', labelAr: 'لقطة سينمائية', icon: '🎞️',
      descriptionEn: 'Movie frame — 35mm grain, shallow DOF, color graded',
      descriptionAr: 'إطار فيلم — حبيبات 35مم، عمق ميدان ضحل',
      group: 'cinematic', families: ['realistic'], thumbnailHint: 'bg-gradient-to-br from-teal-800 to-orange-700' },

    // ── STREET & REAL ──
    { id: 'documentary_gritty', labelEn: 'Documentary', labelAr: 'وثائقي خام', icon: '📸',
      descriptionEn: 'Photojournalism — film grain, available light, candid capture',
      descriptionAr: 'تصوير صحفي — حبيبات فيلم، إضاءة طبيعية',
      group: 'street', families: ['realistic'], thumbnailHint: 'bg-gradient-to-br from-stone-600 to-stone-300' },
    { id: 'neon_urban', labelEn: 'Neon Urban', labelAr: 'مدني نيون', icon: '🌃',
      descriptionEn: 'Night city — neon reflections, wet pavement, cyberpunk-lite',
      descriptionAr: 'مدينة ليلية — انعكاسات نيون، شوارع مبللة',
      group: 'street', families: ['realistic'], thumbnailHint: 'bg-gradient-to-br from-pink-600 to-cyan-600' },
    { id: 'golden_hour_outdoor', labelEn: 'Golden Hour', labelAr: 'ساعة ذهبية', icon: '🌅',
      descriptionEn: 'Sunset backlight — warm rim glow, outdoor landscape bokeh',
      descriptionAr: 'إضاءة غروب — توهج ذهبي، مناظر خارجية',
      group: 'street', families: ['realistic'], thumbnailHint: 'bg-gradient-to-br from-amber-400 to-rose-400' },
    { id: 'street_photography', labelEn: 'Street Photo', labelAr: 'تصوير شوارع', icon: '🚶',
      descriptionEn: 'Candid urban capture — 35mm lens, real city texture',
      descriptionAr: 'لقطة شارع عفوية — عدسة 35مم، نسيج مدني',
      group: 'street', families: ['realistic'], thumbnailHint: 'bg-gradient-to-br from-gray-500 to-stone-400' },

    // ── DIGITAL ──
    { id: 'glitch_digital', labelEn: 'Glitch', labelAr: 'غليتش رقمي', icon: '📡',
      descriptionEn: 'RGB splits, scanlines, data corruption aesthetic',
      descriptionAr: 'انفصال RGB، خطوط مسح، جمالية فساد بيانات',
      group: 'digital', families: ['realistic', 'fantasy'], thumbnailHint: 'bg-gradient-to-br from-cyan-500 via-black to-pink-500' },
    { id: 'synthwave_80s', labelEn: 'Synthwave 80s', labelAr: 'سينثويف', icon: '🕹️',
      descriptionEn: 'Retro-futurism — neon grid, chrome text, sunset gradient',
      descriptionAr: 'رجعي مستقبلي — شبكة نيون، نص كروم',
      group: 'digital', families: ['realistic', 'fantasy'], thumbnailHint: 'bg-gradient-to-br from-pink-600 via-purple-800 to-blue-900' },

    // ── RAW ──
    { id: 'ugly_ad', labelEn: 'Ugly Ad', labelAr: 'إعلان خام', icon: '📝',
      descriptionEn: 'Raw screenshot — red circles, hand-drawn arrows, anti-design',
      descriptionAr: 'لقطة شاشة خام — دوائر حمراء، سهام يدوية',
      group: 'raw', families: ['realistic', 'fantasy'], thumbnailHint: 'bg-white' },
];

/** Get cards available for a given style family */
export function getCardsForFamily(family: 'realistic' | 'fantasy'): ArtDirectionCard[] {
    return ART_DIRECTION_CARDS.filter(c => c.families.includes(family));
}

/** Get cards available for family + mode selection (excludes blocked combos) */
export function getAvailableCards(family: 'realistic' | 'fantasy', selectedModes: string[]): ArtDirectionCard[] {
    const familyCards = getCardsForFamily(family);
    return familyCards.filter(card => {
        const blocked = getBlockedModesForSubStyle(card.id);
        // If any selected mode is blocked by this card's substyle, hide the card
        return !selectedModes.some(m => blocked.has(m));
    });
}

/** Lookup a card by its id */
export function getCardById(id: string): ArtDirectionCard | undefined {
    return ART_DIRECTION_CARDS.find(c => c.id === id);
}

/** Check if a substyle id belongs to a given family */
export function isSubStyleInFamily(subStyleId: string, family: 'realistic' | 'fantasy'): boolean {
    const card = getCardById(subStyleId);
    return card ? card.families.includes(family) : false;
}
