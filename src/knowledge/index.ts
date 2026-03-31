// src/knowledge/index.ts
// Barrel export for all copywriting knowledge modules

// ─── HOOK ANGLES (cold ad approach: before/after, emotional, logic, urgency, etc.) ───
export {
    HOOK_ANGLE_KNOWLEDGE,
    getHookAnglePrompt,
    getHookAngleVisualDirection,
    getHookAngleCaptionStrategy,
    getHookAngleCarouselStrategy,
} from '../../functions/src/knowledge/hookAnglesKnowledge';
export type { HookAngleKnowledge } from '../../functions/src/knowledge/hookAnglesKnowledge';

// ─── HOOK TYPES (delivery style: comedic, controversial, storytelling, etc.) ───
export {
    HOOK_TYPE_KNOWLEDGE,
    getHookTypePrompt,
    getHookTypeCaptionStyle,
} from '../../functions/src/knowledge/hookTypesKnowledge';
export type { HookTypeKnowledge } from '../../functions/src/knowledge/hookTypesKnowledge';

// ─── AD TONES (formal, funny, inspiring, emotional, authority, friendly) ───
export {
    AD_TONE_KNOWLEDGE,
    getAdTonePrompt,
    getAdToneVisualMood,
    getAdToneCaptionCalibration,
} from '../../functions/src/knowledge/adTonesKnowledge';
export type { AdToneKnowledge } from '../../functions/src/knowledge/adTonesKnowledge';

// ─── COPYWRITING STRATEGIES (psychological frameworks) ───
export {
    COPYWRITING_STRATEGY_KNOWLEDGE,
    getCopywritingStrategyPrompt,
    getCopywritingStrategyCaptionStructure,
} from '../../functions/src/knowledge/copywritingStrategies';
export type { CopywritingStrategyKnowledge } from '../../functions/src/knowledge/copywritingStrategies';

// ─── OFFER CREATIVE MODES (visual layouts per offer type) ───
export {
    OFFER_HOOK_PSYCHOLOGY,
    CREATIVE_MODE_LAYOUTS,
    getOfferHookPsychology,
    getCreativeModeConceptInstruction,
    getCreativeModeBuildPlanInstruction,
    getCreativeModeRenderInstruction,
    getOfferCaptionStructure,
} from '../../functions/src/knowledge/offerCreativeModes';
export type { CreativeModeLayout } from '../../functions/src/knowledge/offerCreativeModes';

// ─── LEGACY COPYWRITING KNOWLEDGE (Schwartz, Edwards, Sugarman frameworks) ───
export {
    LANGUAGE_RULES,
    SLIPPERY_SLIDE,
    AWARENESS_LEVELS,
    HEADLINE_TYPES,
    COPY_FRAMEWORKS,
    BULLET_STRUCTURES,
    CLOSING_VARIATIONS,
    HOOK_GENERATION_RULES,
    RETARGETING_RULES,
    COLD_TRAFFIC_RULES,
    QUALITY_CHECKLIST,
    BELIEF_SHIFTING_FRAMEWORK,
    SYSTEM_PROMPT_ADDENDUM,
    getFramework,
    getHeadlineTypeForHook,
    CLOSING_OPTIONS,
    getRandomClosing,
    CTA_BENEFIT_ANGLES,
    getBenefitAngle,
    POWER_WORDS,
} from '../copywriting_knowledge';
export type { FrameworkName, HookLetter } from '../copywriting_knowledge';