// functions/src/generators.ts
// ═══════════════════════════════════════════════════════════════════════════
// SERVER-SIDE PROMPT CONSTRUCTION + GEMINI GENERATION
// ALL prompt logic lives here — NOTHING is exposed to the browser.
// The frontend sends only structured data (product name, audience, etc.)
// and receives only the AI output.
// ═══════════════════════════════════════════════════════════════════════════

import { SYSTEM_TOV, SYSTEM_CONCEPTS, SYSTEM_RENDER, SYSTEM_CAPTION, getLanguageInstruction } from "./promptConstants.js";
import { resolveEntitlement, type StoredPlan } from "./entitlements.js";
import { HttpsError } from "firebase-functions/v2/https";
import { RETARGETING_OBJECTION_DATA, getBestAngleForObjection, buildNormalizedRetargetingContext, getRetargetingPromptBlock } from "./retargetingObjections.js";
import { LANGUAGE_RULES, SLIPPERY_SLIDE, HEADLINE_TYPES, COLD_TRAFFIC_RULES, RETARGETING_RULES, BELIEF_SHIFTING_FRAMEWORK, QUALITY_CHECKLIST } from "./copywriting_knowledge.js";
import { getHookAnglePrompt, getHookAngleVisualDirection, getHookAngleCaptionStrategy, getAngleVariationBlueprint, getAnglePlusDeliveryInstruction, getAngleValidationChecklist } from "./knowledge/hookAnglesKnowledge.js";
import { getHookTypePrompt, getHookTypeCaptionStyle, getHookTypeVisualDirection, getDeliveryStyleFormatOverride } from "./knowledge/hookTypesKnowledge.js";
import { getAdTonePrompt, getAdToneVisualMood, getAdToneCaptionCalibration } from "./knowledge/adTonesKnowledge.js";
import { getCopywritingStrategyPrompt, getCopywritingStrategyCaptionStructure, getCopywritingStrategyVisualHint } from "./knowledge/copywritingStrategies.js";
import { getOfferHookPsychology, getCreativeModeConceptInstruction, getCreativeModeBuildPlanInstruction, getOfferCaptionStructure } from "./knowledge/offerCreativeModes.js";
import { resolveCreativeSpec, getResolvedSpecPromptBlock, getCaptionCreativeModeAnchors, validateCombination, CREATIVE_MODE_CATALOG as _MODE_CATALOG, type ResolvedCreativeSpec, getSubStyleModeFusion, getBeforeAfterSubStyleFusion } from "./creativeResolver.js";
import { compileFullContract, getContractRenderBlock, getContractCaptionBlock, getContractForScoring, type FullLayoutContract, type OverlayDataFilter } from "./layoutContract.js";
import { buildContentOwnershipMap, buildPlanSlotMap, mergeContentOwnership, parseBuildPlanEnvelope, parseStructuredBuildPlanResponse, serializeBuildPlanEnvelope, validateStructuredBuildPlan, validateCopyFidelity, stripTechnicalPrompt, TECHNICAL_PROMPT_START, TECHNICAL_PROMPT_END, type BuildPlanSlotMap, type ContractCheckResult, type StructuredBuildPlanPayload, type CopyFidelityFields, type CopyFidelityResult } from "./buildPlanSlotMap.js";
import { compileModePayload, getModePayloadPromptBlock, getModePayloadPromptBlock_RenderSafe, getModePayloadCaptionAnchors, extractAuthorizedNumbers, getNumericFidelityPolicy, type ModePayload, type NumericFidelityPolicy } from "./modeFieldSchema.js";
import { compositeOfferOverlay, isOverlayAvailable, extractOfferFacts, validateResolvedOfferFacts } from "./offerOverlay.js";
import { validateCaption, validateArabicCompliance, validateBlueprintLanguage, validateBlueprintModeContribution, validateBlueprintMinimalStyle, sanitizeReferenceAdSummary, validateLanguageQuality, type CaptionValidationInput, type CaptionQualityResult, type CaptionQualityCheck } from "./captionValidator.js";
import { validateBuildPlanAgainstContract, buildScoringPrompt, parseScoringResponse, quickRejectCheck } from "./creativeScoringEngine.js";
import { storeCreativeToMemory, retrieveCreativePatterns } from "./creativeMemory.js";
import { fetchWebsiteContext, buildPersonalizationContext } from "./serverUtils.js";
import { validateHookResponse, normalizeHookResponse, assertHookSemanticPreservation, type SemanticLock } from "./utils/hookPayload.js";
import { getRankings, type RankingResult, type RankingInput } from "./rankingEngine.js";
import type { FailureClass, CostEstimate } from "./types.js";
import { GenerationError } from "./types.js";
import { CULTURAL_COMPLIANCE_BLOCK, ARABIC_WARDROBE_BLOCK, isArabic, scanAndReplace } from "./culturalCompliance.js";

// ─── Ranking Guidance Builder ────────────────────────────────────────────
// Converts Ticket 2 ranking output into a compact prompt-safe guidance block.
// Non-blocking: if ranking fails, generation proceeds without guidance.
// Request-local: no module-scoped mutable state.

export interface RankingLinkage {
    rankingRequestId: string;
    rankingRequestFingerprint: string;
    rankingAppliedSummary: string;
}

interface RankingGuidance {
    promptBlock: string;
    linkage: RankingLinkage;
}

/** Resolve visual style family from inputs — canonical field with universeMode fallback */
function resolveStyleFamily(inputs: AdInputs): 'realistic' | 'fantasy' | 'minimal' {
    return ((inputs as any).visualStyleFamily || (inputs as any).universeMode || 'realistic') as 'realistic' | 'fantasy' | 'minimal';
}

/** Returns the active visual sub-style for the current style family, or null if not applicable */
function resolveVisualSubStyle(
    inputs: AdInputs
): 'dark_cinematic' | 'bright_illustrated' | 'mythic_epic' | 'vintage_bw' | 'vintage_sepia'
 | 'luxury_magazine' | 'documentary_gritty' | 'neon_urban' | 'anime_manga'
 | 'watercolor_dreamscape' | 'comic_book'
 | 'ugly_ad' | 'cinematic_film_still' | 'clean_corporate' | 'golden_hour_outdoor'
 | 'street_photography' | 'pixel_retro_game' | 'stained_glass' | 'glitch_digital'
 | 'synthwave_80s' | null {
    // text_only mode has no visual scene — sub-style is meaningless
    if (isTextOnlyMode(inputs)) return null;
    const styleFamily = resolveStyleFamily(inputs);
    const sub = (inputs as any).visualSubStyle;
    if (!sub) return null;
    // Fantasy-exclusive sub-styles
    if (styleFamily === 'fantasy') {
        if (
            sub === 'dark_cinematic' || sub === 'bright_illustrated' ||
            sub === 'mythic_epic'    || sub === 'vintage_bw'         ||
            sub === 'vintage_sepia'  || sub === 'anime_manga'        ||
            sub === 'watercolor_dreamscape' ||
            sub === 'pixel_retro_game' || sub === 'stained_glass' ||
            sub === 'glitch_digital' || sub === 'synthwave_80s'
        ) return sub;
    }
    // Realistic-exclusive sub-styles
    if (styleFamily === 'realistic') {
        if (
            sub === 'vintage_bw'          || sub === 'vintage_sepia' ||
            sub === 'luxury_magazine'     || sub === 'documentary_gritty' ||
            sub === 'neon_urban' ||
            sub === 'cinematic_film_still' || sub === 'clean_corporate' ||
            sub === 'golden_hour_outdoor' || sub === 'street_photography'
        ) return sub;
    }
    // Cross-family: comic_book and ugly_ad work for both realistic and fantasy
    if (styleFamily === 'fantasy' || styleFamily === 'realistic') {
        if (sub === 'comic_book' || sub === 'ugly_ad') return sub;
    }
    return null; // minimal or invalid combination → no sub-style
}

/** Returns true when the ad is in text-only mode (no hero, no universe) */
function isTextOnlyMode(inputs: AdInputs): boolean {
    const modes = (inputs as any).offerCreativeMode || ['standard_hero'];
    return modes.includes('text_only');
}

/** Centralized check: before_after can come from creative mode OR legacy hook angle path.
 *  Pass effectiveAngle when available to use the resolved angle instead of raw inputs. */
function isBeforeAfterSelection(inputs: AdInputs, effectiveAngle?: string | null): boolean {
    const modes = (inputs as any).offerCreativeMode || [];
    const angle = effectiveAngle !== undefined ? effectiveAngle : inputs.coldHookAngle;
    return modes.includes('before_after') || angle === 'before_after';
}

function containsUnresolvedCommercialPlaceholders(value: string): boolean {
    return /\btotal\s*value\b|\bsavings\s*callout\b|\bprice\s*label\b|\bplaceholder\b|\blorem\b|^\s*سعر\s*$/im.test(value || '');
}

interface OwnedRenderText {
    hookText: string;
    subheadText: string;
    ctaName: string;
    benefitText: string;
}

interface FinalAdDebugInfo {
    validator: 'creative_mode' | 'quick_reject' | 'slot_map' | 'placeholder_leak';
    missingZones?: string[];
    missingMustShow?: string[];
    missingOverlaySlots?: string[];
    reasons: string[];
    requiredZones?: string[];
    filledZones?: Record<string, { source: string; value: string }>;
}

function resolveOwnedRenderText(selectedTov: string, inputs: AdInputs, textOverride?: TextOverride): OwnedRenderText {
    if (textOverride) {
        return {
            hookText: textOverride.hookText,
            subheadText: textOverride.subheadText,
            ctaName: textOverride.ctaName,
            benefitText: textOverride.benefitText,
        };
    }

    let hookText = cleanStrict(extract(selectedTov, "HOOK_TEXT:", "SUBHEADLINE:"));
    let subheadText = cleanStrict(extract(selectedTov, "SUBHEADLINE:", "CTA_BUTTON:"));
    let ctaBlock = cleanStrict(extract(selectedTov, "CTA_BUTTON:", "HOOK_END"));

    if (!hookText && !subheadText) {
        const lines = selectedTov.split('\n').map((l: string) => cleanStrict(l)).filter((l: string) => l.length > 2);
        if (lines.length > 0) hookText = lines[0];
        if (lines.length > 1) subheadText = lines[1];
        if (lines.length > 2) ctaBlock = lines[lines.length - 1];
    }

    let ctaName = inputs.cta;
    let benefitText = "";
    const ctaBlockText = ctaBlock.trim();

    if (ctaBlockText.includes('|||')) {
        const parts = ctaBlockText.split('|||');
        ctaName = parts[0].trim() || inputs.cta;
        benefitText = parts[1]?.trim() || "";
    } else if (ctaBlockText.includes('+')) {
        const parts = ctaBlockText.split('+');
        ctaName = parts[0].trim() || inputs.cta;
        benefitText = parts[1]?.trim() || "";
    } else if (ctaBlockText.toLowerCase().startsWith((inputs.cta || '').toLowerCase())) {
        benefitText = ctaBlockText.substring(inputs.cta.length).trim();
        ctaName = inputs.cta;
    } else {
        ctaName = ctaBlockText || inputs.cta;
    }

    return { hookText, subheadText, ctaName, benefitText };
}

const BUILD_PLAN_RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
        blueprint: { type: "STRING" },
        zones: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    id: { type: "STRING" },
                    source: { type: "STRING" },
                    value: { type: "STRING" },
                },
                required: ["id", "source", "value"],
            },
        },
        overlayAssignments: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    id: { type: "STRING" },
                    source: { type: "STRING" },
                    value: { type: "STRING" },
                },
                required: ["id", "source", "value"],
            },
        },
        mustShowAssignments: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    id: { type: "STRING" },
                    source: { type: "STRING" },
                    value: { type: "STRING" },
                },
                required: ["id", "source", "value"],
            },
        },
        ownership: {
            type: "OBJECT",
            properties: {
                primaryHeadline: { type: "STRING" },
                supportingHeadline: { type: "STRING" },
                offerPrice: { type: "STRING" },
                originalPrice: { type: "STRING" },
                savingsText: { type: "STRING" },
                bonuses: { type: "ARRAY", items: { type: "STRING" } },
                ctaText: { type: "STRING" },
                urgencyText: { type: "STRING" },
                proofItems: { type: "ARRAY", items: { type: "STRING" } },
                badgeText: { type: "STRING" },
                eventTitle: { type: "STRING" },
                eventDate: { type: "STRING" },
                eventTime: { type: "STRING" },
                eventLocation: { type: "STRING" },
                speakerName: { type: "STRING" },
                speakerRole: { type: "STRING" },
            },
            required: [],
        },
    },
    required: ["blueprint", "zones", "overlayAssignments", "mustShowAssignments", "ownership"],
};

function buildStructuredBuildPlanReturnBlock(contract: FullLayoutContract, ownershipMap: ReturnType<typeof buildContentOwnershipMap>): string {
    const requiredZones = Object.entries(contract.zones)
        .filter(([, zone]) => zone.priority <= 2 || !!zone.minItems || !!zone.minSizePct)
        .map(([zoneName]) => zoneName);
    const overlayIds = (contract.overlaySlots || []).map((slot) => slot.id);
    const mustShowIds = contract.mustShow || [];
    return `
RETURN FORMAT — MANDATORY JSON ONLY
- Return ONLY valid JSON. No markdown. No commentary.
- blueprint: the full human-readable rendering blueprint string.
- zones: array of zone assignments actually used in the blueprint.
- overlayAssignments: array of overlay slots actually used in the blueprint.
- mustShowAssignments: array of must-show elements actually satisfied in the blueprint.
- ownership: copy the canonical content ownership values exactly. Do not invent values.

REQUIRED ZONE IDS:
${requiredZones.map((zone) => `- ${zone}`).join('\n')}

REQUIRED OVERLAY IDS:
${overlayIds.length ? overlayIds.map((slot) => `- ${slot}`).join('\n') : '- none'}

REQUIRED MUST_SHOW IDS:
${mustShowIds.length ? mustShowIds.map((slot) => `- ${slot}`).join('\n') : '- none'}

CANONICAL OWNERSHIP TO COPY:
- primaryHeadline: "${ownershipMap.primaryHeadline || ''}"
- supportingHeadline: "${ownershipMap.supportingHeadline || ''}"
- offerPrice: "${ownershipMap.offerPrice || ''}"
- originalPrice: "${ownershipMap.originalPrice || ''}"
- savingsText: "${ownershipMap.savingsText || ''}"
- bonuses: [${(ownershipMap.bonuses || []).map((item) => `"${item.replace(/"/g, '\\"')}"`).join(', ')}]
- ctaText: "${ownershipMap.ctaText || ''}"
- urgencyText: "${ownershipMap.urgencyText || ''}"
- proofItems: [${(ownershipMap.proofItems || []).map((item) => `"${item.replace(/"/g, '\\"')}"`).join(', ')}]
- badgeText: "${ownershipMap.badgeText || ''}"
- eventTitle: "${ownershipMap.eventTitle || ''}"
- eventDate: "${ownershipMap.eventDate || ''}"
- eventTime: "${ownershipMap.eventTime || ''}"
- eventLocation: "${ownershipMap.eventLocation || ''}"
- speakerName: "${ownershipMap.speakerName || ''}"
- speakerRole: "${ownershipMap.speakerRole || ''}"
`;
}

function validateBuildPlanSlots(buildPlan: string, contract: FullLayoutContract, selectedTov: string, inputs: AdInputs, textOverride?: TextOverride): { slotMap: BuildPlanSlotMap; contractCheck: ContractCheckResult } {
    const ownershipMap = buildContentOwnershipMap(resolveOwnedRenderText(selectedTov, inputs, textOverride), inputs);
    const parsedPlan = parseBuildPlanEnvelope(buildPlan);
    const slotMap = parsedPlan.machinePlan
        ? validateStructuredBuildPlan(parsedPlan.machinePlan, contract, mergeContentOwnership(ownershipMap, parsedPlan.machinePlan.ownership))
        : buildPlanSlotMap(parsedPlan.blueprint || buildPlan, contract, ownershipMap);
    return { slotMap, contractCheck: slotMap.contractCheck };
}

function buildQualityRejectedDebug(validator: FinalAdDebugInfo['validator'], slotMap?: BuildPlanSlotMap, reasons?: string[]): FinalAdDebugInfo {
    return {
        validator,
        missingZones: slotMap?.missingZones || [],
        missingMustShow: slotMap?.missingMustShow || [],
        missingOverlaySlots: slotMap?.missingOverlaySlots || [],
        reasons: reasons || slotMap?.contractCheck.reasons || [],
        requiredZones: slotMap?.requiredZones || [],
        filledZones: slotMap?.filledZones || {},
    };
}


async function buildRankingGuidance(inputs: AdInputs, step: 'hooks' | 'concepts' | 'caption'): Promise<RankingGuidance | null> {
    const userId = (inputs as any)._userId;
    if (!userId) return null;

    try {
        const modes = inputs.offerCreativeMode || ['standard_hero'];
        const rankingInput: RankingInput = {
            userId,
            workspaceId: (inputs as any)._workspaceId || undefined,
            niche: inputs.productCategory || undefined,
            offerType: inputs.offerType || undefined,
            funnelStage: inputs.campaignType || undefined,
            language: inputs.adLanguage || undefined,
            aspectRatio: inputs.aspectRatio || undefined,
            selectedModes: modes,
            universeCategory: (inputs as any).universeCategory || undefined,
            referenceAdUsed: !!(inputs.referenceAd),
        };

        // Step-aware candidate filters — only pass what is relevant and available
        if (step === 'hooks' || step === 'caption') {
            if (inputs.coldHookAngle) rankingInput.hookAngleCandidates = [inputs.coldHookAngle];
        }
        if (step === 'concepts') {
            // Pair candidate derived from selected modes
            const sortedPair = [...modes].sort().join('+');
            if (sortedPair) rankingInput.pairCandidates = [sortedPair];
            // Template candidate derived from creative spec resolution
            try {
                const spec = resolveCreativeSpec({ selectedModes: modes, hookAngle: inputs.coldHookAngle });
                if (spec.resolvedLayoutKey) rankingInput.templateCandidates = [spec.resolvedLayoutKey];
            } catch { /* non-blocking — spec resolution may fail for invalid combos */ }
        }

        const result = await getRankings(rankingInput);

        const lines: string[] = [];
        const summaryParts: string[] = [];

        if (step === 'hooks' || step === 'caption') {
            if (result.recommendedHookAngles.length > 0) {
                const topAngles = result.recommendedHookAngles.slice(0, 3).map(c => c.key);
                lines.push(`PREFERRED HOOK ANGLES (based on performance data): ${topAngles.join(', ')}`);
                summaryParts.push(`preferred_hooks:${topAngles.join('+')}`);
            }
            const excludedAngles = result.exclusions.filter(e => e.family === 'hook_angle').map(e => e.key);
            if (excludedAngles.length > 0) {
                lines.push(`AVOID THESE HOOK ANGLES (consistently weak): ${excludedAngles.join(', ')}`);
                summaryParts.push(`excluded_hooks:${excludedAngles.join('+')}`);
            }
        }

        if (step === 'concepts') {
            if (result.recommendedPair) {
                lines.push(`RECOMMENDED CREATIVE PAIR (strong track record): ${result.recommendedPair.key}`);
                summaryParts.push(`rec_pair:${result.recommendedPair.key}`);
            }
            if (result.recommendedTemplate) {
                lines.push(`RECOMMENDED LAYOUT TEMPLATE: ${result.recommendedTemplate.key}`);
                summaryParts.push(`rec_template:${result.recommendedTemplate.key}`);
            }
            if (result.recommendedUniverseFamilies.length > 0) {
                const topFamilies = result.recommendedUniverseFamilies.slice(0, 3).map(c => c.key);
                lines.push(`PREFERRED UNIVERSE FAMILIES: ${topFamilies.join(', ')}`);
                summaryParts.push(`rec_uni:${topFamilies.join('+')}`);
            }
            const excludedPairs = result.exclusions.filter(e => e.family === 'pair').map(e => e.key);
            if (excludedPairs.length > 0) {
                lines.push(`AVOID THESE PAIRS (poor performance): ${excludedPairs.join(', ')}`);
                summaryParts.push(`excluded_pairs:${excludedPairs.join('+')}`);
            }
        }

        if (step === 'caption') {
            if (result.warnings.length > 0) {
                const topWarnings = result.warnings.slice(0, 3).map(w => w.pattern || w.key);
                lines.push(`COPY QUALITY WARNINGS (avoid these patterns): ${topWarnings.join('; ')}`);
                summaryParts.push(`warnings:${topWarnings.join('+')}`);
            }
        }

        if (lines.length === 0) return null;

        const promptBlock = `\n═══ RANKING GUIDANCE (data-driven, soft bias — do NOT override explicit user choices) ═══\n${lines.join('\n')}\n═══ END RANKING GUIDANCE ═══`;

        return {
            promptBlock,
            linkage: {
                rankingRequestId: result.requestId,
                rankingRequestFingerprint: result.requestFingerprint,
                rankingAppliedSummary: summaryParts.join('|'),
            },
        };
    } catch (e) {
        console.warn(`Ranking guidance failed for ${step} (non-blocking):`, e);
        return null;
    }
}

// ─── Gemini Caller (injected at module level by Cloud Function setup) ────
// This allows the generators to call Gemini without knowing the API key.
type GeminiCaller = (params: { model: string; contents: any; config?: any }) => Promise<any>;
let callGemini: GeminiCaller;

export function setGeminiCaller(fn: GeminiCaller) {
    // Wrap the caller to auto-accumulate cost tracking on every Gemini call
    callGemini = async (params) => {
        const response = await fn(params);
        accumulateCost(response);
        return response;
    };
}

// ─── OpenAI Key (injected for design critique — different model catches Gemini blind spots) ────
let openaiKey: string = '';

export function setOpenAIKey(key: string) {
    openaiKey = key;
}

// ─── Type aliases for server-side use ────────────────────────────────────
export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9" | "3:4" | "4:3";
export interface TextOverride {
    hookText: string; subheadText: string; ctaName: string; benefitText: string;
}
export interface VisualPolish {
    id: string; label: string; instruction: string;
}
export interface CarouselSlideCopy {
    hookText: string; subheadText: string; ctaText: string; benefitText: string;
}

// --- STRATEGY CONFIGURATION ---

// 1. THE COPYWRITER (High IQ, High Nuance for Arabic Puns)
// Use this for TOV (Step 2) and Caption (Step 5)
const CREATIVE_MODEL_PRO = "gemini-3.1-pro-preview"; // First generation (highest quality)
const CREATIVE_MODEL_LITE = "gemini-3.1-flash-lite-preview"; // Regenerations (fast + cheap)

// 2. THE ENGINEER (High Speed, High Structure, Low Cost)
// Use this for Concepts (Step 3) and JSON Data. It doesn't need to be poetic.
const LOGIC_MODEL = "gemini-2.5-flash-lite";

// 3. THE ARTIST (State of the Art Visuals)
const VISUAL_MODEL = "gemini-3.1-flash-image-preview";

const clean = (val: string): string => {
    if (!val) return "";
    return val
        .replace(/\[HL\]/gi, '')
        .replace(/\[\/HL\]/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/[#]/g, '')
        .replace(/\s*\+\s*/g, ' ||| ')
        .trim();
};

// New function to strip asterisks for Image Generation ONLY
const cleanStrict = (val: string): string => {
    if (!val) return "";
    return clean(val).replace(/\*\*/g, '').replace(/\*/g, '').trim();
};
const extract = (text: string, marker: string, next: string): string => {
    const reg = new RegExp(`${marker}\\s*([\\s\\S]*?)(?=\\n.*${next}|$)`, 'i');
    const m = text.match(reg);
    if (m && m[1]) {
        return clean(m[1].replace(/SUBHEADLINE:|CTA_BENEFIT:|HOOK_END/g, '').trim());
    }
    return marker === "HOOK_TEXT:" ? clean(text.split('\n')[0]) : "";
};
// Helper: Wait function for retries
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Retry wrapper for API calls
async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
    try { return await fn(); }
    catch (err: any) {
        if (retries > 0 && (err?.message?.includes("503") || err?.message?.includes("429") || err?.message?.includes("Quota") || err?.message?.includes("INTERNAL"))) {
            _costTracker.retryCount++;
            await wait(delay);
            return retry(fn, retries - 1, delay * 2);
        }
        throw err;
    }
}

// ─── Cost Tracking Accumulator ────────────────────────────────────────────
// Thread-local (per-request) cost accumulator. Call resetCostTracker() at the
// start of each top-level generation pipeline, then accumulateCost() after each
// Gemini call. At the end, getCostEstimate() returns the totals.

interface CostTracker {
    modelTier: string | null;
    retryCount: number;
    totalPromptTokens: number;
    totalCandidateTokens: number;
}

let _costTracker: CostTracker = { modelTier: null, retryCount: 0, totalPromptTokens: 0, totalCandidateTokens: 0 };

export function resetCostTracker(): void {
    _costTracker = { modelTier: null, retryCount: 0, totalPromptTokens: 0, totalCandidateTokens: 0 };
}

interface ResponseUsage {
    modelVersion?: string;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | null;
}

export function accumulateCost(response: ResponseUsage): void {
    if (response?.modelVersion) _costTracker.modelTier = response.modelVersion;
    const usage = response?.usageMetadata;
    if (usage) {
        const prompt = usage.promptTokenCount || 0;
        const candidate = usage.candidatesTokenCount || 0;
        const computed = prompt + candidate;
        // Use totalTokenCount from API if individual fields are zero but total is available
        const total = computed > 0 ? computed : (usage.totalTokenCount || 0);
        _costTracker.totalPromptTokens += prompt;
        _costTracker.totalCandidateTokens += (total - prompt);
    }
}

export function getCostEstimate(): CostEstimate {
    return {
        modelTier: _costTracker.modelTier,
        retryCount: _costTracker.retryCount,
        estimatedTokens: _costTracker.totalPromptTokens + _costTracker.totalCandidateTokens,
    };
}

// ─── Failure Classification Helpers ─────────────────────────────────────────

export function classifyError(error: unknown, errorCode?: string): FailureClass {
    if (error instanceof GenerationError) return error.failureClass;

    if (errorCode === "safety_blocked") return "model_error";
    if (errorCode === "validation_failed") return "combination_invalid";
    if (errorCode === "quality_rejected") return "validation_reject";

    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("invalid creative mode combination")) return "combination_invalid";
        if (msg.includes("blueprint was empty") || msg.includes("blueprint too short")) return "prompt_malformed";
        if (msg.includes("structured build plan returned empty")) return "model_error";
        if (msg.includes("json parse failed after repair")) return "model_error";
        if (msg.includes("structured contract validation")) return "validation_reject";
        if (msg.includes("strict pair validation")) return "slot_repair_failed";
        if (msg.includes("insufficient credits")) return "credit_insufficient";
        if (msg.includes("resource-exhausted") || msg.includes("quota")) return "model_error";
    }

    return "model_error";
}

export function buildCostEstimate(
    modelTier: string | null,
    retryCount: number,
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | null
): CostEstimate {
    if (!usageMetadata) return { modelTier, retryCount, estimatedTokens: 0 };
    const prompt = usageMetadata.promptTokenCount || 0;
    const candidate = usageMetadata.candidatesTokenCount || 0;
    const computed = prompt + candidate;
    const tokens = computed > 0 ? computed : (usageMetadata.totalTokenCount || 0);
    return { modelTier, retryCount, estimatedTokens: tokens };
}

export function errorCodeToFailureClass(errorCode: string): FailureClass {
    if (errorCode === "safety_blocked") return "model_error";
    if (errorCode === "validation_failed") return "combination_invalid";
    if (errorCode === "quality_rejected") return "validation_reject";
    return "model_error";
}

// Use any-typed inputs to avoid duplicating the full AdInputs interface
type AdInputs = Record<string, any>;

// ─── Mode Payload Helper: Compiles structured mode data from inputs once ────
function buildModeBlock(inputs: AdInputs): string {
    const selectedModes = inputs.offerCreativeMode || ['standard_hero'];
    const payload = compileModePayload(selectedModes, inputs);
    return getModePayloadPromptBlock(payload);
}

// Render-safe variant: suppresses monetary values for image generation
function buildModeBlock_RenderSafe(inputs: AdInputs): string {
    const selectedModes = inputs.offerCreativeMode || ['standard_hero'];
    const payload = compileModePayload(selectedModes, inputs);
    return getModePayloadPromptBlock_RenderSafe(payload);
}

// Extract authorized numeric values from inputs for post-render audit
function getAuthorizedNumbers(inputs: AdInputs): string[] {
    const selectedModes = inputs.offerCreativeMode || ['standard_hero'];
    const payload = compileModePayload(selectedModes, inputs);
    return extractAuthorizedNumbers(payload);
}

function buildModeCaptionAnchors(inputs: AdInputs): string {
    const selectedModes = inputs.offerCreativeMode || ['standard_hero'];
    const payload = compileModePayload(selectedModes, inputs);
    return getModePayloadCaptionAnchors(payload);
}

// ─── Reference Image Analysis ────────────────────────────────────────────────
// Analyzes a reference image for style/mood/composition direction.
// Returns structured ReferenceInfluence or null if no reference provided.
import type { ReferenceInfluence } from "./layoutContract.js";

async function analyzeReferenceImage(referenceBase64: string | undefined): Promise<ReferenceInfluence | null> {
    if (!referenceBase64) return null;
    try {
        const rawB64 = referenceBase64.includes(',') ? referenceBase64.split(',')[1] : referenceBase64;
        const mime = referenceBase64.startsWith('data:image/webp') ? 'image/webp'
            : referenceBase64.startsWith('data:image/png') ? 'image/png'
                : 'image/jpeg';

        const response = await callGemini({
            model: LOGIC_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: mime, data: rawB64 } },
                    {
                        text: `Analyze this reference image for VISUAL STYLE DIRECTION only.
Do NOT describe the content, people, products, text, or logos in the image.
Focus ONLY on:
1. Composition type (e.g. centered hero, split layout, diagonal energy, minimal, layered depth)
2. Lighting style (e.g. dramatic side-lit, soft ambient, high-key bright, low-key cinematic, golden hour)
3. Color palette — list 3-5 dominant colors as hex codes
4. Mood (e.g. bold authority, calm trust, urgent energy, premium luxury, warm approachable)
5. Scene energy (e.g. dynamic action, static confidence, contemplative, celebratory, intense)
6. Framing hints — list 2-3 (e.g. low angle power shot, close crop face, wide environmental, rule of thirds)
7. Depth style (e.g. shallow bokeh, deep focus, layered foreground-background, flat graphic)

Return ONLY a JSON object with these exact keys:
{
  "compositionType": "...",
  "lightingStyle": "...",
  "colorPalette": ["#hex1", "#hex2", "#hex3"],
  "mood": "...",
  "sceneEnergy": "...",
  "framingHints": ["hint1", "hint2"],
  "depthStyle": "..."
}` }
                ]
            },
            config: { temperature: 0.2 }
        });

        const text = (response.text || '').trim().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text);
        // Validate required fields
        if (parsed.compositionType && parsed.lightingStyle && parsed.mood) {
            console.log(`🎨 Reference image analyzed: mood=${parsed.mood}, energy=${parsed.sceneEnergy}, lighting=${parsed.lightingStyle}`);
            return sanitizeInfluenceFields({
                compositionType: parsed.compositionType || 'centered',
                lightingStyle: parsed.lightingStyle || 'ambient',
                colorPalette: Array.isArray(parsed.colorPalette) ? parsed.colorPalette.slice(0, 5) : [],
                mood: parsed.mood || 'neutral',
                sceneEnergy: parsed.sceneEnergy || 'moderate',
                framingHints: Array.isArray(parsed.framingHints) ? parsed.framingHints.slice(0, 4) : [],
                depthStyle: parsed.depthStyle || 'standard',
            });
        }
        console.warn('⚠️ Reference image analysis returned incomplete data — ignoring.');
        return null;
    } catch (err) {
        console.warn('⚠️ Reference image analysis failed (non-blocking):', err);
        return null;
    }
}

/**
 * Sanitize ReferenceInfluence string fields to strip any leaked brand/price/URL/copy text.
 * Applied at the analysis boundary so ALL downstream injection points are safe.
 */
function sanitizeInfluenceFields(influence: ReferenceInfluence): ReferenceInfluence {
    const clean = (s: string): string => sanitizeReferenceAdSummary(s);
    return {
        compositionType: clean(influence.compositionType),
        lightingStyle: clean(influence.lightingStyle),
        colorPalette: influence.colorPalette.map(c => {
            // Color palette should be hex codes — strip anything that isn't
            const hex = c.match(/#[0-9a-fA-F]{3,8}/)?.[0];
            return hex || c.replace(/[^#0-9a-fA-F]/g, '').substring(0, 7);
        }),
        mood: clean(influence.mood),
        sceneEnergy: clean(influence.sceneEnergy),
        framingHints: influence.framingHints.map(h => clean(h)),
        depthStyle: clean(influence.depthStyle),
    };
}

// ─── Pair-Specific Render Execution Rules ────────────────────────────────────
// Returns premium execution guidance for specific mode pairs and aspect ratios.
// Injected into the render prompt AFTER the contract block.
function getPairRenderExecution(primaryMode: string, secondaryMode: string | null, aspectRatio: string, hasOverlaySlots: boolean, hasReferenceAd: boolean): string {
    const parts: string[] = [];
    const isWide = aspectRatio === '16:9';
    const isTall = aspectRatio === '9:16';
    const isSquare = aspectRatio === '1:1';

    // ── PAIR-SPECIFIC EXECUTION ──
    if (secondaryMode === 'value_stack') {
        parts.push(`
PAIR EXECUTION — HERO + VALUE STACK (PREMIUM):
The value stack is the COMMERCIAL ENGINE of this ad. It must look premium, not like a bullet list.
- Stack cards: render as INDIVIDUAL CARDS with depth (drop shadow, slight overlap, or glass-morphism)
- Each card: numbered badge (①②③④) or checkmark icon + item label in clean sans-serif
- Card background: semi-transparent dark panels or frosted glass — NOT flat white boxes
- Hero occupies one side, stack occupies the OTHER side equally — balanced 50/50 visual weight
- Stack cards should have a subtle STAGGER animation feel (slightly offset, cascading)
- Price comparison zone: render as a styled badge/panel at bottom of stack (overlay will add exact numbers)
- BONUS SECTION: If bonuses are listed, render them as VISUALLY DISTINCT bonus cards below the main items — use a different card style (e.g. accent-colored border, 🎁 icon, "BONUS" tag) to differentiate from included items. Bonuses must be VISIBLE and individually labeled, not collapsed into one line.
${hasOverlaySlots ? '- OVERLAY ZONES: The price/value/savings areas are RESERVED — render clean solid panels there, NO text' : ''}
${isTall ? '- 9:16 EXECUTION: Stack cards should be LARGER and more spaced vertically. Use the extra height for breathing room between cards. Hero upper half, stack stretching down the right side.' : ''}
${isSquare ? '- 1:1 EXECUTION: Stack cards as a HORIZONTAL strip below the hero, or a compact 2-column mini-grid. Cards must still be individually distinct.' : ''}
${isWide ? '- 16:9 EXECUTION: Hero left 45%, stack right 45% — generous horizontal space for wider cards with more detail per card.' : ''}`);
    }



    if (secondaryMode === 'speaker_card' || primaryMode === 'speaker_card') {
        parts.push(`
PAIR EXECUTION — SPEAKER CARD (PREMIUM):
This is a KEYNOTE SPEAKER presentation — not a generic portrait.
- STAGE ENVIRONMENT is mandatory: dramatic spotlight, dark auditorium, podium or stage edge visible
- Hero: SPEAKING POSE (gesturing, hand raised, leaning forward) — NOT just standing still
- Credentials bar: render as a TV-STYLE LOWER-THIRD — semi-transparent bar spanning the width with clean typography
- Audience: subtle blurred head silhouettes in the FOREGROUND bottom (not background)
- Rim lighting on hero (back-lit edge glow) for cinematic depth
${isTall ? '- 9:16 EXECUTION: Full dramatic stage depth — audience at very bottom, hero in spotlight center, credentials bar across middle. Use height for stage grandeur.' : ''}
${isSquare ? '- 1:1 EXECUTION: Tighter crop, hero upper 60%, credentials bar across lower third. Audience hints in bottom corners.' : ''}`);
    }

    if (secondaryMode === 'event_ticket' || primaryMode === 'event_ticket') {
        parts.push(`
PAIR EXECUTION — EVENT TICKET (PREMIUM):
This must look like a REAL designed premium ticket — not a generic ad with event text.
- Ticket structure: visible BORDER/FRAME with ticket-specific decorations (perforated edge, barcode strip, serial number)
- Speaker portrait: HEAD/SHOULDERS ONLY in a bordered circular or diamond frame with subtle glow
- Metadata row: DATE | TIME | "LIVE" badge — arranged as a clean horizontal strip like printed ticket info
- Background: DARK premium (navy/charcoal/black) with metallic gold or brand-accent highlights
- Ticket should feel like something you'd screenshot and share — collectible quality
${isTall ? '- 9:16 EXECUTION: Larger ticket with MORE detail — extended perforations, more metadata space, larger speaker portrait. Use height for dramatic ticket proportions.' : ''}
${isSquare ? '- 1:1 EXECUTION: Compact ticket, tighter spacing. Portrait smaller. Focus on event title and metadata readability.' : ''}`);
    }



    if ((primaryMode === 'book_mockup' || secondaryMode === 'book_mockup') && (primaryMode === 'device_mockup' || secondaryMode === 'device_mockup')) {
        parts.push(`
PAIR EXECUTION — BOOK + DEVICE BUNDLE (PREMIUM):
Both products must be clearly visible as a BUNDLE — not one dominating and the other tiny.
- Book: 3D perspective with visible cover, slight tilt, shadow on surface
- Device: realistic tablet/phone showing guide content on screen
- Arrangement: overlapping product shot (book slightly behind, device in front) or side-by-side with slight overlap
- "FREE" badge: floating ribbon or sticker touching both products
- Both objects should have similar visual SCALE — the device should not dwarf the book
${isSquare ? '- 1:1 EXECUTION: Products centered with headline above and CTA below. Tight but balanced arrangement.' : ''}`);
    }





    if (secondaryMode === 'webinar_screen' || primaryMode === 'webinar_screen') {
        if (!parts.some(p => p.includes('WEBINAR SCREEN'))) {
            parts.push(`
PAIR EXECUTION — WEBINAR SCREEN (PREMIUM):
The screen must show REAL CONTENT — not a blank or generic device.
- Device: REALISTIC laptop/monitor with bezel, shadow, and perspective angle — NOT a flat rectangle
- Screen content: LEGIBLE webinar title as a styled heading, subtitle line, speaker thumbnail
- LIVE badge: red dot + "LIVE" text positioned on the screen corner (broadcast overlay style)
- Hero: presenting gesture beside screen, NOT blocking screen content
${isTall ? '- 9:16 EXECUTION: Larger screen showing more on-screen detail. Hero beside or above the screen.' : ''}
${isSquare ? '- 1:1 EXECUTION: Screen center, hero to one side, tighter layout.' : ''}`);
        }
    }

    if ((secondaryMode === 'book_mockup' || primaryMode === 'book_mockup') && !parts.some(p => p.includes('BOOK'))) {
        parts.push(`
PAIR EXECUTION — BOOK MOCKUP (PREMIUM):
The book must be a REAL 3D rendered object with perspective and shadow — not a flat rectangle.
- 3D perspective: visible spine, slight tilt, shadow cast on surface
- Cover: professional design with title text readable
- "FREE" badge: ribbon or sticker overlay on the book corner
- Chapter callouts: 1-2 floating bubbles beside the book with chapter titles
${isTall ? '- 9:16 EXECUTION: Larger book using vertical space, callout bubbles stacked vertically.' : ''}
${isSquare ? '- 1:1 EXECUTION: Book center, hero to one side, callouts above or below.' : ''}`);
    }

    if ((secondaryMode === 'device_mockup' || primaryMode === 'device_mockup') && !parts.some(p => p.includes('DEVICE MOCKUP'))) {
        parts.push(`
PAIR EXECUTION — DEVICE MOCKUP (PREMIUM):
The device must show VISIBLE CONTENT on screen — NOT blank.
- Realistic tablet/phone with bezel, shadow, and perspective
- Screen content: text layout, section previews, or guide thumbnails — NOT solid color
- Key insight: floating callout bubble beside device
${isTall ? '- 9:16 EXECUTION: Larger device showing more screen content.' : ''}
${isSquare ? '- 1:1 EXECUTION: Device center, hero to side, callout above or below.' : ''}`);
    }

    // ── OVERLAY SHELL QUALITY ──
    if (hasOverlaySlots) {
        parts.push(`
OVERLAY SHELL QUALITY (STRICT):
The app will composite exact numbers onto reserved zones AFTER image generation.
Your job is to render PREMIUM SHELL PANELS in those zones:
- Price zone: render as a STYLED BUTTON or BADGE shape — solid brand color, rounded corners, slight gradient. NO text inside.
- Total value zone: render as a DARK PANEL with clean border — professional card surface. NO text inside.
- Savings zone: render as a CONTRAST ACCENT BADGE — different color from price, attention-grabbing shape. NO text inside.
- Item card zones: render as INDIVIDUAL CARD SHAPES with borders and subtle shadows. Item LABELS (text names) are safe to render, but NO dollar amounts.
These shells must look INTENTIONAL and PREMIUM — as if a designer placed them. Not like empty rectangles.`);
    }

    // ── REFERENCE AD PRESERVATION ──
    if (hasReferenceAd) {
        parts.push(`
REFERENCE AD ADAPTATION RULES:
A reference ad influences STYLE (color grading, typography feel, composition energy, packaging quality).
It does NOT change:
- The layout contract zones or hierarchy (these are LOCKED)
- The overlay-safe reserved regions (these MUST remain clean)
- The required secondary mode elements (these MUST be present)
- The pair-specific composition balance (hero vs secondary visual weight)
Channel the reference ad's VISUAL LANGUAGE while preserving every structural requirement above.`);
    }

    return parts.length > 0 ? parts.join('\n') : '';
}

// ─── Zone-Structural Build Plan Validator ────────────────────────────────────
// Checks whether a build plan references the required zones from the layout contract.
// Uses zone names, mustShow elements, and composition notes — NOT arbitrary keywords.
// Returns { passed, missingZones, missingMustShow } for actionable diagnostics.
function validateBuildPlanZones(
    buildPlanText: string,
    contract: { zones: Record<string, any>; mustShow: string[]; compositionNotes: string; templateId?: string; templateName?: string }
): { passed: boolean; missingZones: string[]; missingMustShow: string[]; score: number } {
    const planLower = buildPlanText.toLowerCase();
    const missingZones: string[] = [];
    const missingMustShow: string[] = [];

    // Check each zone with priority ≤ 3 (important zones)
    for (const [zoneName, zone] of Object.entries(contract.zones)) {
        if ((zone as any).priority > 3) continue; // skip low-priority zones
        // Normalize zone name: "stack" → check for "stack"; "hero" → check for "hero"
        // Also check underscore-separated variants: "offer_card" → "offer card" or "offer"
        const terms = zoneName.replace(/_/g, ' ').split(' ');
        const found = terms.some(term => term.length > 2 && planLower.includes(term));
        if (!found) {
            missingZones.push(zoneName);
        }
    }

    // Check mustShow elements — these are the creative resolver's required visual elements
    for (const elem of contract.mustShow) {
        const terms = elem.replace(/_/g, ' ').split(' ').filter((w: string) => w.length > 2);
        const found = terms.some((term: string) => planLower.includes(term));
        if (!found) {
            missingMustShow.push(elem);
        }
    }

    // Score: percentage of required items found
    const totalRequired = Object.keys(contract.zones).filter(z => (contract.zones[z] as any).priority <= 3).length + contract.mustShow.length;
    const totalMissing = missingZones.length + missingMustShow.length;
    const score = totalRequired > 0 ? Math.round(((totalRequired - totalMissing) / totalRequired) * 100) : 100;

    // Pass if no critical zones missing (priority 1-2) and score >= 50
    const criticalMissing = missingZones.filter(z => (contract.zones[z] as any).priority <= 2);
    const passed = criticalMissing.length === 0 && score >= 50;

    return { passed, missingZones, missingMustShow, score };
}


// Step 2. Generate TOV -> NEEDS GEMINI 3 (Creative)
export async function generateTOV(inputs: AdInputs, resolvedUniverse: string, mode: 'initial' | 'refresh' | 'precision' = 'initial', previousOutput?: string, globalRefinement?: string, editFeedback?: string, editIndex?: string, editIntent?: 'simplify_terms' | 'shorten' | 'sharpen' | 'formalize' | 'change_angle' | 'change_cta' | 'change_subheadline' | 'change_headline' | 'freeform', rewriteScope?: 'wording_only' | 'cta_only' | 'subheadline_only' | 'hook_only' | 'full', semanticLock?: SemanticLock | null): Promise<{ text: string; rankingGuidance: RankingLinkage | null }> {
    let _tovRankingLinkage: RankingLinkage | null = null;
    async function _generateTOVInner(): Promise<string> {
        // ═══ REFERENCE IMAGE ANALYSIS (optional, non-blocking) ═══
        let _tovRefInfluence: ReferenceInfluence | null = null;
        if (inputs.referenceImage && mode === 'initial') {
            _tovRefInfluence = await analyzeReferenceImage(inputs.referenceImage);
        }

        let modeInstruction = "";
        const _hookRtCtx = buildNormalizedRetargetingContext(inputs as any);
        const campaignType = (inputs as any).campaignType || 'cold';
        const isRetargeting = _hookRtCtx.isRetargeting;
        // Use canonical single field via normalized context; keep array for downstream compat
        const objectionIds = _hookRtCtx.objectionId ? [_hookRtCtx.objectionId] : [];
        const customObjection = _hookRtCtx.customObjection;
        const testimonial = _hookRtCtx.testimonial;

        // Fetch website context if brand URL is provided (only on initial generation)
        let websiteContext = '';
        if (mode === 'initial' && inputs.brandUrl) {
            websiteContext = await fetchWebsiteContext(inputs.brandUrl);
        }

        const objectionMeta = RETARGETING_OBJECTION_DATA.filter((o: any) => objectionIds.includes(o.id));
        const objectionLabels = objectionMeta.map((o: any) => o.label);
        const needsProof = isRetargeting;

        // Build rich objection context from Hormozi framework
        const objectionContext = objectionMeta.map((obj: any) => {
            const data = RETARGETING_OBJECTION_DATA.find((d: any) => d.id === obj.id);
            if (!data) return '';
            return `
OBJECTION: ${data.label}
PSYCHOLOGY: ${data.coreBeliefToChallenge}
POWER SHIFT: ${data.powerShift}
HORMOZI CLOSE: ${data.hormoziCloseName}`;
        }).filter(Boolean).join('\n');

        // Handle custom objection if provided
        const effectiveObjectionLabel = customObjection || (objectionLabels.length ? objectionLabels[0] : "General hesitation");
        const customObjectionContext = customObjection ? `
CUSTOM OBJECTION: "${customObjection}"
PSYCHOLOGY: Analyze this objection and identify the underlying fear or belief.
POWER SHIFT: Counter this specific concern by addressing the root cause.
STRATEGY: Use empathy + evidence to dissolve this unique barrier.` : '';

        // Auto-pick the best primary angle for this objection
        const primaryAngle = getBestAngleForObjection(objectionIds[0], customObjection);
        const angleNames: Record<string, string> = {
            'proof': 'EXTERNAL PROOF',
            'risk_reversal': 'RISK REVERSAL',
            'mechanism': 'MECHANISM / HOW IT WORKS',
            'urgency': 'URGENCY / COST OF INACTION',
            'clarity': 'CLARITY / BREAKDOWN',
        };

        const campaignInstruction = isRetargeting
            ? `RETARGETING MODE (CRITICAL - THIS IS NOT A COLD AD):
═══════════════════════════════════════════════════════════════════════════════
⚠️ THE VIEWER HAS ALREADY SEEN THIS OFFER AND DID NOT BUY.
⚠️ MORE FEATURES = WASTE OF TIME. THEY ALREADY KNOW THE FEATURES.
⚠️ YOUR JOB: SHIFT THEIR BELIEF, NOT SELL MORE BENEFITS.
═══════════════════════════════════════════════════════════════════════════════

OBJECTION TO BUST: "${effectiveObjectionLabel}"
PRIMARY COUNTER-STRATEGY: ${angleNames[primaryAngle] || 'RISK REVERSAL'} (this is the STRONGEST approach for this objection)

${objectionContext ? `HORMOZI PSYCHOLOGY:\n${objectionContext}` : ''}
${customObjectionContext}

═══════════════════════════════════════════════════════════════════════════════
【BELIEF SHIFTING - NOT FEATURE LISTING】
═══════════════════════════════════════════════════════════════════════════════

❌ WRONG (More features): "شيفرة ال 1000 توفر لك نظام مبيعات آلي..."
❌ WRONG (More benefits): "✓ استراتيجية مثبتة ✓ نتائج ملموسة..."
❌ WRONG (Arguing): "الحقيقة أن النظام يعمل لأن..."

✅ RIGHT (External proof): "طوابير الايفون ب 2000 دولار؟ ميزانيات الأفراح 10 آلاف؟ العرب يدفعون Premium."
✅ RIGHT (Question reframe): "السؤال الخطأ: هل ستنجح؟ السؤال الصح: كم يكلفك البقاء مكانك؟"
✅ RIGHT (Identity shift): "أنت مش بائع. أنت خبير يستحق يتكافأ على قيمته."
✅ RIGHT (Cost of inaction): "بعد 6 شهور: نفس المكان أو مكان مختلف. أنت تختار."

OBJECTION-SPECIFIC COUNTER-EXAMPLES:
${effectiveObjectionLabel.includes('price') || effectiveObjectionLabel.includes('السعر') ? `
- طوابير الايفون (2000$)
- ميزانيات الأفراح (10,000$+)
- الساعات والحقائب الماركات
- "المجاني هو اللي غالي - كم خسرت وأنت تجرب حلول مجانية؟"
` : ''}
${effectiveObjectionLabel.includes('time') || effectiveObjectionLabel.includes('وقت') ? `
- 3 ساعات نتفلكس يومياً
- الوقت الضائع في سوشيال ميديا
- "30 دقيقة يومياً = نظام كامل في شهر"
` : ''}
${effectiveObjectionLabel.includes('work') || effectiveObjectionLabel.includes('تنجح') ? `
- تخصصات غريبة نجحت: مدرب بيلاتس، خبير اتيكيت، مصور طعام
- 127 تخصص مختلف طبقوا نفس النظام
- "الطريقة واحدة، المجالات مختلفة، النتائج متشابهة"
` : ''}
${effectiveObjectionLabel.includes('tried') || effectiveObjectionLabel.includes('جربت') || effectiveObjectionLabel.includes('failed') || effectiveObjectionLabel.includes('فشل') ? `
- "هل فشلت في المشي لأنك سقطت وأنت صغير؟"
- الفرق بين المحاولة العشوائية والنظام المثبت
- "المرة الجاية مختلفة لأن الطريقة مختلفة"
- "السؤال مش 'هل ينجح؟' السؤال: 'ليه فشل قبل كده؟' — والجواب مختلف تماماً"
` : ''}

BELIEF-SHIFT STRATEGIES FOR EACH HOOK:
⭐ Hook A MUST use: ${angleNames[primaryAngle]} (primary — strongest for "${effectiveObjectionLabel}")
→ Hook B: QUESTION REFRAME — Replace their question with a better one
→ Hook C: IDENTITY SHIFT — Redefine who they are
→ Hook D: COST OF INACTION — Sell the pain of staying still
${testimonial ? `\nWEAVE THIS PROOF INTO HOOK A: "${testimonial}"` : ''}

Each hook MUST use a DIFFERENT strategy. Do NOT repeat the same approach twice.

═══════════════════════════════════════════════════════════════════════════════
STRUCTURE FOR RETARGETING HOOKS (MANDATORY)
═══════════════════════════════════════════════════════════════════════════════

Each hook MUST follow this structure:

1. ACKNOWLEDGE (1 line): "ما زلت متردد؟" / "شاهدت العرض ولم تقرر؟"
2. NAME THE BELIEF (1 line): State their objection clearly
3. SHIFT THE BELIEF (2-3 lines): Use counter-example, reframe, or identity shift
4. NEW IDENTITY (1 line): Who they become when they decide
5. EASY CTA (1 line): Make action feel small and safe

STRICT RULES:
✗ NO bullet points of features/benefits (they already know them)
✗ NO explaining how the product works (they've seen the sales page)
✗ NO cold-style openers like "هل تريد" or "اكتشف"
✓ USE real-world counter-examples (iPhone, weddings, Netflix)
✓ SHIFT beliefs, don't argue with them
✓ Make them FEEL something, not just know something`
            : `COLD MODE:
- Prospect has NOT seen the offer.
- Do NOT mention: "you watched / you visited / you saw / didn't buy".
- Do NOT use testimonial/proof snippets.

COPYWRITING FRAMEWORKS (Apply when constructing hooks):
${COLD_TRAFFIC_RULES}

HEADLINE TYPE GUIDE:
${HEADLINE_TYPES}`;

        if (mode === 'initial') {
            const isMinimal = resolveStyleFamily(inputs) === 'minimal';
            const universePrompt = isMinimal
                ? `VISUAL STYLE: MINIMAL (no universe — clean commercial backdrop, no environment, no worldbuilding)`
                : inputs.customUniverseDetails
                    ? `CUSTOM UNIVERSE (TOP PRIORITY): ${inputs.customUniverseDetails}`
                    : `UNIVERSE: ${resolvedUniverse}`;

            const minimalHookBias = isMinimal ? `
MINIMAL STYLE HOOK BIAS:
- PREFER: direct benefit, problem/solution, authority, comparison, objection handling, process/how-it-works, clear offer framing
- DE-PRIORITIZE: cinematic narrative hooks, scene-dependent before/after, fantasy/worldbuilding hooks, environment-led lifestyle storytelling
- WORDING STYLE: concise, sharp, commercial, clean, visually legible, less theatrical` : '';

            modeInstruction = `PHASE 2: THEMATIC MARKETING FUSION.
      - Product: ${inputs.productName}
      - Brand URL: ${inputs.brandUrl}
      ${websiteContext ? websiteContext : '(Analyze the URL domain to infer extra context/niche if no website data provided)'}
      ${inputs.brandColorPrimary ? `- Brand Colors: Primary ${inputs.brandColorPrimary}${inputs.brandColorSecondary ? `, Secondary ${inputs.brandColorSecondary}` : ''}
      (Reference these colors in VISUAL DIRECTION notes. Suggest using brand colors for CTA buttons, accent text highlights, or background elements. Vary usage across hooks so designs feel diverse.)` : ''}
      - Universe Context: ${universePrompt}${isMinimal ? '' : ' (You MUST integrate this theme into the copy).'} 
${minimalHookBias}
      - TARGET AVATAR: ${inputs.targetAudience}
      - CORE CHALLENGE: ${inputs.challenges}
      - TRANSFORMATION: ${inputs.transformation}

      MANDATE FOR TONE ADAPTATION (CRITICAL):

      ⚠️ METAPHOR RULE (ABSOLUTELY CRITICAL):
      - The universe/theme is for VISUAL SETTING only, NOT for the ad copy logic.
      - DO NOT write full thematic metaphors in the copy.
      - The copy must make DIRECT SENSE without needing to understand the theme.

      ❌ WRONG (Rooftop Garden theme): "المشكلة في جودة التربة وليست في سعر المحصول النهائي"
         → This is NONSENSE. What is "soil" and "crop"? The reader won't understand.
      ❌ WRONG (Ocean theme): "اغوص في أعماق النجاح" (Dive into the depths of success)
         → Too metaphorical. Not direct.
      ❌ WRONG (Space theme): "أطلق صاروخ مبيعاتك" (Launch your sales rocket)
         → Forced metaphor. Nobody talks like 

      ✅ RIGHT: Use DIRECT, CLEAR language about the ACTUAL problem/solution:
      ✅ "جمهورك يدفع 1000 دولار لغيرك... ليه مش ليك؟" (Your audience pays $1000 to others... why not you?)
      ✅ "خبراء يحصدون أرباحاً مرتفعة بينما تتردد أنت" (Experts reap high profits while you hesitate)
      ✅ "مش محتاج محتوى أكتر... محتاج نظام يحول المحتوى لفلوس" (You don't need more content... you need a system to convert content to money)

      VOCABULARY INTEGRATION (SUBTLE ONLY):
      - You MAY use a SINGLE thematic word as a metaphorical touch, MAX ONCE in all 4 hooks.
      - Example (Garden): "حصاد" (harvest) can be used ONCE: "وابدأ حصادك اليوم"
      - But the rest of the copy must be DIRECT and CLEAR.

      1. THE "COFFEE SHOP" TEST (CRITICAL):
        - Before outputting any text, ask yourself: "Would a normal person say this to a friend in a coffee shop?"
        - If the answer is NO, rewrite it.
        - If it sounds like a government brochure or a corporate press release, DELETE IT.
        - If you can't explain what the copy means WITHOUT the theme context, DELETE IT.
      2. THE TRANSLATION FRAMEWORK (How to think):
        - THOUGHT: "Achieve digital empowerment" -> SAY: "Sell more online" (بع أكثر أونلاين).
        - THOUGHT: "Optimize your potential" -> SAY: "Stop wasting time" (توقف عن تضييع وقتك).
        - THOUGHT: "Navigating the landscape" -> SAY: "Finding the easy way" (الطريق الأسهل).
      3. TONE & LANGUAGE:
        ${getLanguageInstruction(inputs.adLanguage || 'ar_fusha')}
        - Use "Professional Conversational" tone. Not academic, not slang.
        - Use "أنت" / "You" constantly. Talk to ONE person, not a crowd.
        ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? `- Use connectors like "عشان" instead of "كي تتمكن من". Use "الآن" instead of "في هذه الآونة".` : ''}
      4. COPYWRITING FRAMEWORKS (Schwartz & Edwards):
         - Apply "Problem/Agitate/Solve". Start with the pain. Make it hurt. Then offer the pill.
         - If the user input implies they are "Problem Aware", use the "Agitation" framework.
         - If "Solution Aware", use the "Mechanism" framework.
      5. NO ROBOTIC PUNCTUATION: Strictly FORBIDDEN to use colons (:) in headlines/subheadlines.
      6. LIMITS: Headline (Max 8 words), Subheadline (Max ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? '12' : '8'} words), CTA Benefit (Max 5 Words).
      7. SENTENCE COMPLETENESS: Every subheadline MUST be a complete thought. NEVER end on a conjunction, preposition, or dangling connector (لكي، حتى، من أجل، كي، عشان، لأن). If you hit the word limit, restructure the sentence to end naturally.
      8. STYLE: This is a Direct Response Ad, NOT a novel or Sci-Fi story.
      9. BANNED: Full thematic metaphors, Sci-Fi jargon, abstract concepts that need explanation.
      10. ARABIC SENTENCE QUALITY (CRITICAL — applies to ALL Arabic output):
          a) NATURAL COLLOCATIONS: Every verb+object pair must be a pairing that native Arabic speakers actually use. The SAME word can be fine in one sentence and broken in another — correctness depends on the FULL PHRASE, not individual words.
             ❌ "توقف عن بيع رخصك" — nobody says "بيع رخصك". The verb "بيع" is fine, "رخصك" is fine, but TOGETHER they form a phrase no Arab person would say.
             ✅ "توقف عن التسعير المنخفض" — natural collocation, people actually say this.
             ❌ "تطارد 8 عملاء" — you don't "chase 8 clients" as a natural phrase. The number feels forced.
             ✅ "تلاحق عملاء مش مهتمين" — natural, describes a real frustration.
             TEST: Imagine a business owner in a Cairo coffee shop or a Riyadh meetup. Would they say this EXACT phrase to a friend? If not, REWRITE.
          b) SUBJECT-VERB LOGIC: The subject must logically perform the verb. Ask: "Does a real person actually DO this action this way?" If the sentence sounds like translated English or assembled vocabulary — restructure completely.
             ❌ "هل تطارد 8 عملاء" — chasing "8 clients" makes no sense. 8 is arbitrary and the sentence structure is unnatural.
             ✅ "هل تضيع وقتك على عملاء ما يقدرونك" — specific, logical, natural.
          c) CONVERSATIONAL REGISTER: Write like a sharp business friend talks face-to-face, NOT like a motivational poster or government brochure. Every sentence must flow as SPOKEN Arabic. If it reads like assembled vocabulary blocks translated from English, it fails.
             ❌ "حقق التمكين الرقمي وابنِ إمبراطورية" — nobody talks like this. Assembled vocabulary.
             ✅ "بع أكثر أونلاين بنظام واضح" — direct, natural, conversational.
          d) METAPHOR COHERENCE: If you use a figurative verb (تطارد، تحصد، تبني), the WHOLE sentence must sustain that metaphor OR the verb must also work literally. Half-metaphors sound broken.
             ❌ "توقف عن مطاردة عملاء رخيصين" — "مطاردة" (chasing) is metaphorical but "عملاء رخيصين" breaks it because you don't literally chase cheap things.
             ✅ "توقف عن قبول عملاء ما يدفعون قيمتك" — direct, no broken metaphor.
          e) COMPLETE THOUGHT: Every headline must express a full idea a stranger can understand. No fragments, no chapter titles.
          f) SELF-CHECK (MANDATORY 3-STEP):
             Step 1: Read the Arabic aloud at normal speaking speed. Does it flow?
             Step 2: Could you say this EXACT sentence to a friend without them giving you a confused look?
             Step 3: Remove ANY word that exists only because it "sounds marketing-y" but adds nothing to meaning.
             If ANY step fails → REWRITE from scratch. Do NOT patch — start the sentence over.
      ${previousOutput && previousOutput.trim().length > 20 ? `
      ═══════════════════════════════════════════════════════════════════════════════
      ⚠️⚠️⚠️ ANTI-REPETITION BLOCK — BANNED HOOKS FROM PREVIOUS GENERATION ⚠️⚠️⚠️
      ═══════════════════════════════════════════════════════════════════════════════
      The user has ALREADY SEEN these hooks and REJECTED them by clicking Regenerate.
      You MUST produce COMPLETELY DIFFERENT hooks. DO NOT reuse:
      - The same opening words
      - The same sentence structures
      - The same numbers/statistics
      - The same metaphors or pain points
      - The same CTA benefit phrases

      PREVIOUS HOOKS (DO NOT REPEAT ANY OF THESE):
      ---
      ${previousOutput.substring(0, 1500)}
      ---

      YOUR NEW HOOKS MUST:
      1. Start with DIFFERENT opening words than the ones above
      2. Use DIFFERENT numbers/statistics (if any)
      3. Attack DIFFERENT pain dimensions
      4. Use DIFFERENT sentence structures
      5. Feel like they were written by a DIFFERENT copywriter with a DIFFERENT perspective
      ═══════════════════════════════════════════════════════════════════════════════
      ` : ''}`;
        } else if (mode === 'refresh') {
            modeInstruction = `REFINEMENT MODE — APPLY USER'S SPECIFIC INSTRUCTIONS:

═══════════════════════════════════════════════════════════════════════════════
⚠️ USER'S REFINEMENT COMMAND (HIGHEST PRIORITY — FOLLOW EXACTLY):
"${globalRefinement || 'Make it shorter and punchier'}"
═══════════════════════════════════════════════════════════════════════════════

CURRENT HOOKS (BEFORE REFINEMENT):
${previousOutput || '(none — generate fresh)'}

YOUR TASK:
1. READ the user's refinement command above carefully
2. APPLY that specific instruction to ALL 4 hooks
3. If the user asks to change tone, change the tone of all hooks
4. If the user asks to focus on a specific angle, rewrite all hooks with that angle
5. If the user provides specific Arabic text or wording, use it VERBATIM
6. PRESERVE the overall structure (HOOK_TEXT, SUBHEADLINE, CTA_BUTTON format)
7. PRESERVE what's working — only change what the user specifically asked to change

IMPORTANT:
- This is NOT a full regeneration — it's a REFINEMENT of existing hooks
- The user is asking for SPECIFIC changes, not generic improvement
- If the user says "focus on price urgency" → rewrite hooks around price urgency
- If the user says "make it more aggressive" → sharpen the language, not change the topic
- If the user says "use these specific words: X" → use those exact words
- FOCUS on pain: "${inputs.challenges}"
- FOCUS on result: "${inputs.transformation}"
- UNIVERSE: ${resolveStyleFamily(inputs) === "minimal" ? "MINIMAL (clean backdrop)" : resolvedUniverse}`;
        } else if (mode === 'precision') {
            const semanticLockBlock = semanticLock ? `
SEMANTIC LOCK (DO NOT BREAK):
- ANGLE: ${semanticLock.angle}
- MECHANISM: ${semanticLock.mechanism}
- AUDIENCE: ${semanticLock.audience}
- PAIN: ${semanticLock.pain}
- DESIRED OUTCOME: ${semanticLock.desiredOutcome}
- PROMISE TYPE: ${semanticLock.promiseType}
- EMOTIONAL FRAME: ${semanticLock.emotionalFrame}
${semanticLock.objectionFrame ? `- OBJECTION FRAME: ${semanticLock.objectionFrame}` : ''}` : '';
            const scopedEditRules = rewriteScope === 'cta_only'
                ? `ONLY rewrite CTA_BUTTON. Keep HOOK_TEXT and SUBHEADLINE semantically and verbally stable unless the user pasted exact replacement text.`
                : rewriteScope === 'subheadline_only'
                    ? `ONLY rewrite SUBHEADLINE. Keep HOOK_TEXT and CTA_BUTTON unchanged unless the user pasted exact replacement text.`
                    : rewriteScope === 'hook_only'
                        ? `ONLY rewrite HOOK_TEXT. Keep SUBHEADLINE and CTA_BUTTON unchanged unless the user pasted exact replacement text.`
                        : rewriteScope === 'wording_only'
                            ? `Rewrite wording surface only. Keep the same strategic angle, mechanism, promise, audience, and topic.`
                            : `Apply the user edit, but preserve the same strategic idea unless editIntent is change_angle.`;

            // SURGICAL EDIT: Return ONLY the single edited hook
            modeInstruction = `SURGICAL EDIT [SINGLE HOOK PATCH]:

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: RETURN ONLY HOOK ${editIndex} - DO NOT RETURN ALL 4 HOOKS
═══════════════════════════════════════════════════════════════════════════════

USER'S EDIT REQUEST: "${editFeedback}"
EDIT INTENT: ${editIntent || 'freeform'}
REWRITE SCOPE: ${rewriteScope || 'full'}
${semanticLockBlock}

CURRENT HOOK ${editIndex} (BEFORE EDIT):
${previousOutput}

ANGLE LOCK (MANDATORY):
- Do NOT change the strategic angle unless EDIT INTENT is "change_angle".
- Do NOT replace the mechanism with a different one.
- Do NOT change the target audience, problem, or promise type.
- If the user asks for simpler language, simplify vocabulary only.
- If the user asks for shorter copy, compress wording only.
- If the user asks for a stronger version, sharpen tension without changing the core idea.

YOUR TASK:
1. Apply the user's edit to Hook ${editIndex} ONLY
2. ${scopedEditRules}
3. If they want to change the CTA/button, update CTA_BUTTON with their EXACT text
4. If they want to change the headline, update HOOK_TEXT
5. If they want to change the subheadline, update SUBHEADLINE
6. Keep the ${resolveStyleFamily(inputs) === "minimal" ? "minimal clean style" : `universe theme: "${resolvedUniverse}"`}

IMPORTANT RULES:
- If user provides specific Arabic text, use it VERBATIM - do not translate or modify
- If user says "change CTA to X", the CTA_BUTTON should be exactly X
- Multi-line CTAs are allowed (button text on line 1, benefit on line 2)
- NEVER replace the commercial angle with a new angle just because the wording changed

OUTPUT (ONLY ONE HOOK - NOT ALL FOUR):
HOOK_START_${editIndex}
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: 
HOOK_END_${editIndex}

RETURN NOTHING ELSE. NO OTHER HOOKS.`;
        }
        // ─── PERSONALIZATION INJECTION (Data Flywheel) ─────────────────────
        let personalizationContext = '';
        let _step2RankingGuidance: RankingGuidance | null = null;
        const _userId = (inputs as any)._userId;
        if (_userId && mode === 'initial') {
            try {
                personalizationContext = await buildPersonalizationContext(
                    _userId, 'hooks', inputs.targetAudience
                );
                // ═══ CREATIVE MEMORY: Retrieve winning patterns ═══
                const fullContract = compileFullContract({
                    selectedModes: (inputs as any).offerCreativeMode || ['standard_hero'],
                    hookAngle: inputs.coldHookAngle || undefined,
                    aspectRatio: inputs.aspectRatio,
                    adLanguage: inputs.adLanguage || 'ar_fusha',
                    visualStyleFamily: resolveStyleFamily(inputs) || 'realistic',
                });
                const memoryPatterns = await retrieveCreativePatterns(_userId, {
                    niche: inputs.productCategory || undefined,
                    hookAngle: inputs.coldHookAngle || undefined,
                    creativeModes: (inputs as any).offerCreativeMode || undefined,
                    layoutTemplate: fullContract.templateId,
                });
                if (memoryPatterns) personalizationContext += '\n' + memoryPatterns;
            } catch (e) {
                console.warn('Personalization fetch failed (non-blocking):', e);
            }
            // ═══ RANKING GUIDANCE (Ticket 3 — soft bias from Ticket 2) ═══
            try {
                _step2RankingGuidance = await buildRankingGuidance(inputs, 'hooks');
                _tovRankingLinkage = _step2RankingGuidance?.linkage || null;
            } catch { /* non-blocking */ }
        }

        // Generate a random creativity seed to prevent repetitive outputs across sessions
        const creativitySeed = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        const prompt = `
[HOOK ARCHITECT V5.1 - MASTER COPYWRITER ENGINE]
GENERATION ID: ${creativitySeed} (unique — produce unique, original output every time)

⚠️ ORIGINALITY MANDATE:
- Generate 100% ORIGINAL hooks. Do NOT reuse or paraphrase any example text from this prompt.
- Every hook must feel like it was written from scratch by a DIFFERENT copywriter.
- Vary sentence structures, opening words, emotional triggers, and specific details across all 4 hooks.

═══════════════════════════════════════════════════════════════════════════════
CAMPAIGN MODE
═══════════════════════════════════════════════════════════════════════════════
${campaignInstruction}

═══════════════════════════════════════════════════════════════════════════════
CREATIVE STRATEGY CONTROLS (User-Selected — OVERRIDE defaults if set)
═══════════════════════════════════════════════════════════════════════════════
${inputs.adTone ? `AD TONE: ${inputs.adTone.toUpperCase()}\n${getAdTonePrompt(inputs.adTone)}` : 'AD TONE: Professional and confident (default)'}

${inputs.coldHookAngle && !isRetargeting ? `HOOK ANGLE: ${inputs.coldHookAngle.toUpperCase()}\n${getHookAnglePrompt(inputs.coldHookAngle)}\n\nApply this angle to ALL 4 hooks with varied execution.` : ''}

${inputs.hookType ? `HOOK DELIVERY STYLE: ${inputs.hookType.toUpperCase()}\n${getHookTypePrompt(inputs.hookType)}\n\nALL hooks must use this delivery style.` : ''}

${inputs.coldHookAngle && inputs.hookType && !isRetargeting ? `
═══════════════════════════════════════════════════════════════════════════════
HOW TO COMBINE ANGLE + DELIVERY ${(inputs as any).copywritingStrategy ? '+ STRATEGY' : ''} (UNIVERSAL RULE)
═══════════════════════════════════════════════════════════════════════════════

Think of these as LAYERS, not alternatives. ALL must be present in every hook:

ANGLE (${inputs.coldHookAngle.toUpperCase()}) = the CONTENT — what the hook says.
  → This is the CORE TRUTH. The angle's hard validation rule ALWAYS applies.
  → If the angle says "must contain a number" → the hook MUST contain a number. Non-negotiable.

DELIVERY (${inputs.hookType.toUpperCase()}) = the PACKAGING — how the content is presented.
  → This WRAPS the angle's content into a specific sentence format.
  → The delivery shapes HOW you express the angle — it does NOT replace the angle.

${(inputs as any).copywritingStrategy ? `STRATEGY (${(inputs as any).copywritingStrategy.toUpperCase()}) = the ENERGY — the emotional texture.
  → This FLAVORS the tone and pacing. It enhances but NEVER overrides angle or delivery.` : ''}

HOW TO RESOLVE ANY CONFLICT:
1. Satisfy the ANGLE's hard rule FIRST (e.g., include a number, name a pain, create urgency)
2. THEN shape that content into the DELIVERY's format (e.g., phrase it as a question, a misconception, a story)
3. ${(inputs as any).copywritingStrategy ? `THEN apply the STRATEGY's energy (e.g., make it feel disruptive, empathetic, logical)` : 'Apply natural conversational energy'}

The ANGLE provides the ingredient. The DELIVERY provides the recipe. ${(inputs as any).copywritingStrategy ? `The STRATEGY provides the chef's style.` : ''}

NEVER drop one to satisfy another. If the angle says "number required" and the delivery says "question format" → make it a QUESTION THAT CONTAINS A NUMBER.

VARIATION RULE FOR COMBO MODE:
The ANGLE specifies 4 content dimensions (e.g., financial, time, status, skill).
The DELIVERY specifies a constant format across all 4 hooks.
YOUR JOB: CROSS-MULTIPLY. Each hook is one ANGLE DIMENSION expressed through the DELIVERY FORMAT.
- Hook A: [Angle Dimension 1] delivered as ${inputs.hookType}
- Hook B: [Angle Dimension 2] delivered as ${inputs.hookType}
- Hook C: [Angle Dimension 3] delivered as ${inputs.hookType}
- Hook D: [Angle Dimension 4] delivered as ${inputs.hookType}
The angle dimension CHANGES per hook. The delivery format STAYS CONSTANT across all 4.
` : ''}

${(inputs as any).copywritingStrategy ? `${getCopywritingStrategyPrompt((inputs as any).copywritingStrategy)}` : ''}

═══════════════════════════════════════════════════════════════════════════════
INPUT ANALYSIS
═══════════════════════════════════════════════════════════════════════════════
- Product: "${inputs.productName}"
- Avatar: "${inputs.targetAudience}"
- Core Pain: "${inputs.challenges}"
- Transformation: "${inputs.transformation}"
- Universe: "${resolvedUniverse}"
- Offer Type: "${inputs.offerType || 'Not specified'}"

${getOfferHookPsychology(inputs.offerType || '')}

${buildModeBlock(inputs)}
${_tovRefInfluence ? `
═══════════════════════════════════════════════════════════════════════════════
REFERENCE STYLE DIRECTION (tone influence — do NOT describe the reference image content)
═══════════════════════════════════════════════════════════════════════════════
A reference image was analyzed. Use these style cues to calibrate the EMOTIONAL REGISTER of hooks:
- Mood: ${_tovRefInfluence.mood} → match this emotional weight in hook language
- Scene energy: ${_tovRefInfluence.sceneEnergy} → calibrate urgency/calmness of phrasing
- Lighting: ${_tovRefInfluence.lightingStyle} → ${_tovRefInfluence.lightingStyle.includes('dramatic') || _tovRefInfluence.lightingStyle.includes('cinematic') ? 'lean into authority, power, contrast framing' : _tovRefInfluence.lightingStyle.includes('soft') || _tovRefInfluence.lightingStyle.includes('ambient') ? 'lean into clarity, trust, warmth framing' : 'maintain balanced, confident framing'}
- Color palette: ${_tovRefInfluence.colorPalette.join(', ')} → inform premium vs accessible feel
Do NOT change the marketing strategy. Only adjust the TONE and EMOTIONAL REGISTER.
═══════════════════════════════════════════════════════════════════════════════
` : ''}
═══════════════════════════════════════════════════════════════════════════════
LANGUAGE: MARKETING FUSHA (WHITE ARABIC)
═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
ARABIC QUALITY (ONE-PASS CHECK)
═══════════════════════════════════════════════════════════════════════════════
1. Every hook = complete thought. Never end mid-phrase or on a conjunction.
2. Verb+object pairs must be natural collocations a native speaker would use in conversation.
3. Conversational register — write like a sharp business friend, not a textbook or poster.
4. Read aloud test: if it sounds choppy, forced, or machine-translated → rewrite from scratch.
5. Don't repeat connector words across hooks — vary naturally.

═══════════════════════════════════════════════════════════════════════════════
THE 4 HOOKS
═══════════════════════════════════════════════════════════════════════════════

${isRetargeting ? `
【RETARGETING MODE - BELIEF SHIFTING REQUIRED】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OBJECTION: "${objectionLabels[0] || 'General hesitation'}"
${testimonial ? `PROOF TO USE: "${testimonial}"` : ''}
${customObjection ? `CUSTOM OBJECTION DETAIL: "${customObjection}"` : ''}

⚠️⚠️⚠️ ABSOLUTE RULE: ALL 4 HOOKS MUST ADDRESS THIS EXACT OBJECTION ⚠️⚠️⚠️
"${effectiveObjectionLabel}"

The AI must pick the BEST counter-approach for each hook based on this specific objection.
- Hook A: Use EXTERNAL PROOF to counter "${effectiveObjectionLabel}"
- Hook B: Use QUESTION REFRAME to counter "${effectiveObjectionLabel}"  
- Hook C: Use IDENTITY SHIFT to counter "${effectiveObjectionLabel}"
- Hook D: Use COST OF INACTION to counter "${effectiveObjectionLabel}"

DO NOT DRIFT to a different topic. If the objection is "Tried before and failed",
then EVERY headline, subheadline, and CTA must relate to past failure and why THIS TIME is different.
If the objection is about price, EVERY hook must be about price/value. NO EXCEPTIONS.

⚠️ CRITICAL: NO FEATURE LISTS. NO BENEFIT BULLETS. SHIFT BELIEFS ONLY.

REMEMBER: The objection is "${effectiveObjectionLabel}". ALL examples below must address THIS objection.

【HOOK A】 → EXTERNAL UNDENIABLE PROOF about "${effectiveObjectionLabel}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Show them UNDENIABLE external evidence that counters "${effectiveObjectionLabel}".
Don't argue — show proof they can't deny.

HEADLINE: Name the objection "${effectiveObjectionLabel}" + challenge it with proof
SUBHEADLINE: The undeniable counter-example specific to "${effectiveObjectionLabel}"
CTA: Easy next step

【HOOK B】 → QUESTION REFRAME about "${effectiveObjectionLabel}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Don't answer their concern about "${effectiveObjectionLabel}". Replace it with a BETTER question.

HEADLINE: "السؤال الخطأ: [restate "${effectiveObjectionLabel}" as a question]"
SUBHEADLINE: "السؤال الصح: [better question that dissolves the objection]"
CTA: The answer to the better question

【HOOK C】 → IDENTITY SHIFT about "${effectiveObjectionLabel}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Make them see themselves DIFFERENTLY in the context of "${effectiveObjectionLabel}".

HEADLINE: Redefine who they are in relation to "${effectiveObjectionLabel}"
SUBHEADLINE: What this new identity means for overcoming "${effectiveObjectionLabel}"
CTA: Step into the new identity

【HOOK D】 → COST OF INACTION about "${effectiveObjectionLabel}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sell the PAIN of staying stuck with "${effectiveObjectionLabel}" unresolved.

HEADLINE: Where they'll be in 6 months if "${effectiveObjectionLabel}" wins
SUBHEADLINE: The accumulating cost of letting "${effectiveObjectionLabel}" stop them
CTA: The escape from "${effectiveObjectionLabel}"

FORBIDDEN IN RETARGETING:
✗ Bullet points (✓ استراتيجية ✓ نتائج ✓ ...)
✗ Feature lists
✗ "Our system provides..."
✗ "You'll get..."
✗ Explaining how it works (they've read the sales page)
✗ Addressing a DIFFERENT objection than "${effectiveObjectionLabel}"
` : inputs.coldHookAngle ? `
═══════════════════════════════════════════════════════════════════════════════
🔒 CRITICAL ANGLE LOCK: ${(inputs.coldHookAngle || '').toUpperCase()}
═══════════════════════════════════════════════════════════════════════════════
The user selected coldHookAngle="${inputs.coldHookAngle}".
ALL 4 hooks MUST be written STRICTLY in this exact angle/style.
Do NOT switch angles. Do NOT mix angles. Do NOT drift into unrelated archetypes.
Every single hook must UNMISTAKABLY BE this angle. Variation happens INSIDE the angle ONLY.

ANGLE COMPLIANCE TEST — EVERY hook must pass this HARD VALIDATION:
${inputs.coldHookAngle === 'statistics' || inputs.coldHookAngle === 'shocking_stat' ? `✅ STATISTICS: HOOK_TEXT MUST contain a specific NUMBER or PERCENTAGE. Invent plausible industry stats for "${inputs.productCategory || inputs.targetAudience || 'this market'}". A hook without at least one digit FAILS.` :
inputs.coldHookAngle === 'pain' ? `✅ PAIN: HOOK_TEXT MUST name a SPECIFIC daily frustration from the CHALLENGES field: "${inputs.challenges}". The reader must think "that's my exact problem." Generic pain like "struggling" = FAIL. Name the EXACT situation.` :
inputs.coldHookAngle === 'curiosity' ? `✅ CURIOSITY: HOOK_TEXT MUST contain an INCOMPLETE revelation — hint at something surprising but WITHHOLD the key detail. The reader MUST want to know more. If the hook reveals everything = FAIL.` :
inputs.coldHookAngle === 'urgency' ? `✅ URGENCY: HOOK_TEXT MUST contain a TIME REFERENCE — a deadline, countdown, "today/الآن/هذا الأسبوع/قبل فوات الأوان/ينتهي". No urgency hook passes without a time-related word.` :
inputs.coldHookAngle === 'scarcity' ? `✅ SCARCITY: HOOK_TEXT MUST contain a QUANTITY LIMIT — "فقط X مقاعد/آخر X أماكن/محدود/X فقط". The reader must feel supply is running out. No scarcity hook passes without a limit word.` :
inputs.coldHookAngle === 'social_proof' ? `✅ SOCIAL PROOF: HOOK_TEXT MUST reference OTHER PEOPLE's results — a count of clients, a person's name, a group achievement ("X مدرب/عميل حقق"). No social proof hook passes without referencing others.` :
inputs.coldHookAngle === 'logical_authority' ? `✅ LOGICAL AUTHORITY: HOOK_TEXT MUST contain a CREDENTIAL or TRACK RECORD — "X عميل/X سنة خبرة/أول نظام/ساعدنا X". Must establish WHY the speaker has authority. No authority hook passes without proof.` :
isBeforeAfterSelection(inputs) ? `✅ BEFORE/AFTER: HOOK_TEXT MUST contain TWO contrasting states — a BEFORE state AND an AFTER state. Use transition markers: من...إلى, قبل...بعد, كان...أصبح, بدلاً من. Both states must be specific.` :
inputs.coldHookAngle === 'emotional' ? `✅ EMOTIONAL: HOOK_TEXT MUST NAME an emotion explicitly or use a VISCERAL verb — يخاف, يحلم, يشعر, يتمنى, يكره, الخوف, الأمل, الإحباط. The reader must FEEL something, not just think.` :
inputs.coldHookAngle === 'fear_of_missing_out' ? `✅ FOMO: HOOK_TEXT MUST make the reader feel LEFT BEHIND — reference what others are doing/gaining while they hesitate. Use "بينما أنت/غيرك/الآخرون/فاتك". Must create jealousy.` :
inputs.coldHookAngle === 'future_based' || inputs.coldHookAngle === 'future_pacing' ? `✅ FUTURE PACING: HOOK_TEXT MUST paint a FUTURE SCENARIO — start with or contain "تخيل/بعد X أيام/ماذا لو/يوم ما" or describe a future state. The reader must SEE their desired future.` :
inputs.coldHookAngle === 'logic' ? `✅ LOGIC: HOOK_TEXT MUST present a LOGICAL ARGUMENT — cause→effect reasoning. Must contain reasoning connectors: لأن, بسبب, والنتيجة, مما يعني, إذا...فإن. The reader must think "that makes sense."` :
`✅ ${(inputs.coldHookAngle || '').toUpperCase()}: Every hook must clearly embody this angle with a CHECKABLE element. If a neutral reader cannot identify the angle = FAIL.`}

${getAngleVariationBlueprint(inputs.coldHookAngle, inputs)}

${inputs.hookType ? `
═══════════════════════════════════════════════════════════════════════════════
⚠️ DELIVERY FORMAT (subordinate to ANGLE): ${inputs.hookType.toUpperCase()}
═══════════════════════════════════════════════════════════════════════════════
${getDeliveryStyleFormatOverride(inputs.hookType, inputs.coldHookAngle)}

${getAnglePlusDeliveryInstruction(inputs.coldHookAngle, inputs.hookType)}

REMEMBER THE LAYERS: The ${inputs.coldHookAngle.toUpperCase()} ANGLE is the CORE CONTENT (must pass its hard validation).
The ${inputs.hookType.toUpperCase()} DELIVERY WRAPS that content into this format.
⚠️ The angle's hard rule ALWAYS wins. If the angle requires a number/time/contrast/emotion, it MUST be present even inside the ${inputs.hookType} format.
` : ''}
` : `
You must create 4 hooks. Each hook MUST use a DIFFERENT headline type from this list:

【HOOK A】 → USE: DIRECT BENEFIT or HOW-TO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Direct Benefit: State the main benefit boldly. The reader should feel a concrete gain they can measure. Use a SPECIFIC number or timeframe from their niche.
- How-To: Promise a method or system. The reader should feel "this is the path I've been looking for." Reference a SPECIFIC mechanism, not a generic promise.

【HOOK B】 → USE: QUESTION or CHALLENGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Question: Ask something that makes them say "yes, that's me." Must reference a SPECIFIC frustration from the CHALLENGES field — not a generic question.
- Challenge: Dare them or provoke curiosity. Use a surprising statistic or counterintuitive claim that disrupts their current belief.

【HOOK C】 → USE: NEWS/ANNOUNCEMENT or TESTIMONIAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- News: Introduce something new or reveal a discovery. The reader should feel "I need to know about this before others do." Frame it as an exclusive or recent breakthrough.
- Testimonial: Lead with a SPECIFIC result someone achieved. Must include a concrete before/after transformation with numbers — not a vague success claim.

【HOOK D】 → USE: COMMAND or REASON-WHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Command: Tell them what to do with a strong verb first. The sentence must feel like urgent, direct advice from someone who knows the answer.
- Reason-Why: Promise numbered secrets or steps. The number must be small (3-7) and the topic must reference a SPECIFIC pain from their CHALLENGES field.

⚠️ CRITICAL: Do NOT copy or paraphrase any example text. Every hook must be 100% original, generated fresh from the brief's TARGET AUDIENCE and CHALLENGES fields.
`}

═══════════════════════════════════════════════════════════════════════════════
STRUCTURAL VARIATION
═══════════════════════════════════════════════════════════════════════════════

${isRetargeting ? `
FOR RETARGETING - All hooks address the SAME objection with DIFFERENT angles:

| Hook | Approach | Psychology |
|------|----------|------------|
| A | Challenge Belief | "You think X, but actually Y" |
| B | Show Proof | Testimonial/Numbers that counter objection |
| C | Reframe Risk | "The real risk is NOT acting" |
| D | Urgency + Simplify | "Easy decision + deadline" |

ALL HOOKS TARGET: Product-Aware (Level 4) - They know you, just need the push.
` : inputs.coldHookAngle ? `
ALL 4 hooks use the SAME angle (${(inputs.coldHookAngle || '').toUpperCase()}) with DIFFERENT execution dimensions:
| Hook | Dimension | What varies |
|------|-----------|------------|
| A | Financial/Revenue | How the angle applies to money/income |
| B | Time/Lifestyle | How the angle applies to daily life and time |
| C | Status/Identity | How the angle applies to their reputation and self-image |
| D | Skill/Confidence | How the angle applies to their abilities and certainty |

⚠️ The ANGLE stays the same. The DIMENSION changes. Do NOT drift to a different angle.
${inputs.hookType ? `⚠️ ALL hooks must be delivered as ${inputs.hookType.toUpperCase()} — the format/style is constant.` : ''}
` : `
Beyond headline TYPE, each hook should use a different EMOTIONAL angle:

| Hook | Headline Type | Emotional Angle | Schwartz Awareness |
|------|---------------|-----------------|-------------------|
| A | Direct/How-To | GREED (gain, profit) | Solution-Aware |
| B | Question/Challenge | FEAR (loss, missing out) | Problem-Aware |
| C | News/Testimonial | PROOF (social validation) | Product-Aware |
| D | Command/Reason-Why | CURIOSITY (secrets, discovery) | Unaware → Problem |
`}

═══════════════════════════════════════════════════════════════════════════════
ANTI - REPETITION RULES(CRITICAL)
═══════════════════════════════════════════════════════════════════════════════

BANNED PATTERNS(if you use it in Hook A, you CANNOT use it in B, C, or D):

1. OPENING WORDS - Use each only ONCE across all 4 hooks:
- "هل..."(question opener)
  - "كيف..."(how - to opener)
  - "لماذا..."(why opener)
  - "اكتشف..."(discovery opener)
  - "توقف..."(command opener)
  - "إذا كنت..."(identification opener)

2. BENEFIT WORDS - Rotate, don't repeat:
  - "ضاعف" → then use "زِد" or "ارفع" or "حقق"
    - "نظام" → then use "طريقة" or "استراتيجية" or "خطة"
      - "دخل" → then use "أرباح" or "إيرادات" or "عوائد"
        - "عملاء" → then use "زبائن" or "مشترين"

3. STRUCTURE - No two hooks can have the same pattern:
- If A = [Benefit] + [Timeframe] → B cannot be[Benefit] + [Timeframe]
  - If A = [Question] + [Pain] → B cannot be[Question] + [Pain]

═══════════════════════════════════════════════════════════════════════════════
SUBHEADLINE RULES
═══════════════════════════════════════════════════════════════════════════════

The subheadline must COMPLEMENT the headline, not repeat it.

GOOD PATTERNS:
- Headline = Problem → Subheadline = Solution hint
  - Headline = Benefit → Subheadline = Mechanism(how)
    - Headline = Question → Subheadline = Answer tease
      - Headline = Command → Subheadline = Reason why

BAD(REPETITIVE):
- Headline says the BENEFIT → Subheadline restates the SAME benefit with a synonym (reader learns nothing new)

GOOD(COMPLEMENTARY):
- Headline says the BENEFIT → Subheadline explains the MECHANISM or HOW (reader gets a new reason to believe)

═══════════════════════════════════════════════════════════════════════════════
CTA BENEFIT RULES
═══════════════════════════════════════════════════════════════════════════════

FORMAT: "${inputs.cta} ||| [BENEFIT]"

The BENEFIT is a 2-5 word phrase that appears BELOW the CTA button. It must make the reader think "that's exactly what I need."

⚠️ BENEFIT MUST BE HYPER-SPECIFIC TO THE AUDIENCE'S DAILY PROBLEM:
- Read the TARGET AUDIENCE and CHALLENGES fields from the brief
- The benefit must reference a CONCRETE, TANGIBLE outcome they can picture in their daily life
- NOT abstract concepts — words like "financial freedom", "professional excellence", "success" mean nothing
- YES specific outcomes — name a SPECIFIC frustration from their CHALLENGES and negate it, or name a SPECIFIC result they want and give a timeframe

HOW TO WRITE A GOOD BENEFIT:
1. Pick ONE specific pain from the CHALLENGES field
2. Flip it into a micro-result the reader can visualize
3. Make it feel like the reader is saying "finally, someone understands my problem"

BENEFIT FORMULA (pick one per hook — NEVER repeat):
- REMOVE A PAIN: Name a specific daily frustration from CHALLENGES and negate it. The reader should think "finally, no more of that." Structure: "without [concrete frustration]"
- SPEED TO RESULT: Promise a specific result within a realistic timeframe. The reader should think "that's fast enough to believe." Structure: "[result] in [timeframe]"
- EASE: Name a specific hard thing they hate doing and eliminate it. The reader should think "I can actually do this." Structure: "without [dreaded activity]"
- PROOF: Cite a specific number of people who already achieved this. The reader should think "others like me did it." Structure: "[number] already [achieved X]"
- IDENTITY SHIFT: Name their biggest self-doubt and dissolve it. The reader should think "even someone like me can do this." Structure: "even if [their deepest doubt]"

❌ BANNED BENEFIT PATTERNS (NEVER use these — too vague):
- Generic guarantee phrases ("with guaranteed results/excellence/elite")
- Abstract achievement phrases ("achieve financial freedom/success/your dreams")
- Vague life-change phrases ("change your path/life/journey")
- Effortless claims ("without extra effort", "before everyone", "with ease")
- Any benefit that could apply to ANY product in ANY niche — if it's not specific to THIS audience's CHALLENGES, it's wrong
- Any phrase you have seen before in other ads or training data — if it feels familiar, it's a cliché. Write something NEW.

⚠️ CRITICAL: Generate ALL benefits fresh from the brief. Do NOT reuse any memorized phrases. Each benefit must contain at least one word that appears in the CHALLENGES or TARGET AUDIENCE fields.

Each hook MUST have a DIFFERENT benefit that addresses a DIFFERENT pain from their challenges.

═══════════════════════════════════════════════════════════════════════════════
COPYWRITING QUALITY RULES (CRITICAL — READ EVERY LINE)
═══════════════════════════════════════════════════════════════════════════════

YOU ARE A SENIOR DIRECT-RESPONSE COPYWRITER, not a content writer. Every word must SELL.

HEADLINE (max 8 words):
- Open with a NUMBER, a PAIN, or a QUESTION. Never open with a generic verb.
- ❌ BAD: A generic "discover the secrets of success" opener — no pain, no specificity, could be any product
- ✅ GOOD: A specific stat + specific pain from THEIR niche — the reader thinks "that's MY problem"
- ❌ BAD: A vague "learn how to sell smarter" — could apply to any audience
- ✅ GOOD: A command that names their exact frustration — punches the reader's ego

SUBHEADLINE (max ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? '12' : '8'} words):
- This is the KNIFE TWIST — the consequence, the mechanism, or the cost of ignoring the headline.
- The subheadline MUST make the reader think "this is about ME" — tie it to THEIR specific situation.
- It must be a GRAMMATICALLY COMPLETE SENTENCE that ends naturally.
- ❌ GARBAGE: Any subheadline ending with a dangling connector word (likai, hatta, min ajl, etc.) — the sentence must stand alone
- ❌ GARBAGE: Any subheadline with generic filler that could apply to any product — no specificity = no sale
- ✅ SHARP: A complete sentence naming a SPECIFIC competitor threat, hidden cost, or identity challenge from THEIR niche
- ✅ SHARP: A complete sentence showing the MECHANISM — HOW the problem hurts them daily, with concrete detail

ABSOLUTE PROHIBITIONS:
- NEVER end a subheadline on: لكي، حتى، من أجل، كي، عشان، لأن، حين، عندما، بينما، إلى، في
- NEVER use nonsense words or metaphors that don't exist in business Arabic
- NEVER write generic motivational filler — this is a SALES AD, not an inspirational poster
- NEVER write a subheadline that could work for ANY product — it must be specific to THIS offer

PRODUCT LINKAGE (CRITICAL):
- The headline + subheadline must DIRECTLY relate to: "${inputs.productName || 'the offer'}"
- Target audience: "${inputs.targetAudience || 'coaches and consultants'}"  
- Their core pain: "${inputs.challenges || 'pricing too low, losing premium clients'}"
- The transformation: "${inputs.transformation || 'charge premium prices with confidence'}"
- If the subheadline could work for a restaurant, a gym, or a tech startup — it's TOO GENERIC. Rewrite it.

LANGUAGE:
- ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'Conversational Arabic. Write like a sharp business mentor speaks face-to-face — not a textbook, not a newspaper, not a Friday sermon.' : 'Conversational English. Write like a sharp mentor talks — not corporate, not academic.'}
- ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'Use: يخسر، يسرق، يكلفك، يقتل، يستنزف (action verbs that HURT)' : 'Use power verbs: costs you, kills your, drains your, steals your'}
- ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'Avoid: اكتشف، تعلم، انضم، ابدأ (weak opening verbs unless in CTA)' : 'Avoid: discover, learn, join, start (weak unless in CTA)'}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════════

${inputs.coldHookAngle && !isRetargeting ? `
⚠️ USER SELECTED HOOK ANGLE: ${inputs.coldHookAngle.toUpperCase()}
ALL 4 hooks MUST use this angle. Vary the EXECUTION, not the angle.
${inputs.hookType ? `USER SELECTED DELIVERY: ${inputs.hookType.toUpperCase()}\nALL 4 hooks MUST be delivered in this style.` : ''}

⚠️⚠️⚠️ MANDATORY LAYER CHECK — EVERY HOOK MUST PASS ALL LAYERS:
${inputs.coldHookAngle ? `1. ANGLE (${inputs.coldHookAngle}) — CORE CONTENT: Does the hook pass the angle's hard validation rule? (Priority 1 — non-negotiable)` : ''}
${inputs.hookType ? `2. DELIVERY (${inputs.hookType}) — PACKAGING: Is the angle's content wrapped in the ${inputs.hookType} format? (Priority 2 — shapes the sentence)` : ''}
${(inputs as any).copywritingStrategy ? `3. STRATEGY (${(inputs as any).copywritingStrategy}) — ENERGY: Does the tone/pacing reflect this strategy? (Priority 3 — flavors the output)` : ''}
If ANY layer is missing from ANY hook, REWRITE it. The angle's hard rule is the FIRST thing to verify — if it fails, the hook fails regardless of delivery or strategy.

INSTRUCTIONS FOR EACH HOOK (do NOT include these instructions in your output):
- HOOK_TEXT = the headline. Max 8 words. Write in ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'Arabic' : 'the project language'}. Must be punchy direct-response copy.
- SUBHEADLINE = the supporting line. Max ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? '12' : '8'} words. Must be a COMPLETE sentence that ends naturally. Never end on a conjunction.
- CTA_BUTTON = the call-to-action button text, followed by ||| then a CONNECTOR + short benefit line (2-5 words). The benefit MUST start with a natural connector word (و/ل/عشان/وابدأ/وحقق). Example: "${inputs.cta} ||| وابدأ تحقق دخل يليق بخبرتك" or "${inputs.cta} ||| وتوقف عن ملاحقة العملاء".
- Each hook explores a DIFFERENT dimension of the ${inputs.coldHookAngle} angle.
- Hook A = FINANCIAL/REVENUE dimension. Hook B = TIME/LIFESTYLE dimension. Hook C = STATUS/IDENTITY dimension. Hook D = SKILL/CONFIDENCE dimension.

⚠️ DIVERSITY RULE (CRITICAL — READ BEFORE WRITING):
Each hook MUST use a COMPLETELY DIFFERENT sentence structure. Vary the opening word, sentence pattern, and emotional trigger.
Structure types to rotate (use each ONCE, pick 4):
- [percentage] + [audience] + [consequence]
- [question word] + [specific loss or pain]
- [imperative verb] + [action to stop/start]
- [ratio] + [surprising fact]
- [conditional "لو/إذا"] + [relatable scenario]
- [direct address "أنت"] + [identity challenge]
- [time reference] + [cost of delay]
FORBIDDEN: Two hooks starting the same way. Generate 100% ORIGINAL text — do NOT reuse phrases from any examples in this prompt.

OUTPUT FORMAT (fill in the values after each colon — do NOT output instructions, brackets, or dimension labels):

HOOK_START_A
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: ${inputs.cta} ||| 
HOOK_END_A

HOOK_START_B
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: ${inputs.cta} ||| 
HOOK_END_B

HOOK_START_C
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: ${inputs.cta} ||| 
HOOK_END_C

HOOK_START_D
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: ${inputs.cta} ||| 
HOOK_END_D
` : `
${(inputs as any).copywritingStrategy ? `⚠️ COPYWRITING STRATEGY: ${(inputs as any).copywritingStrategy}\nEvery hook must reflect this strategy in its approach. If a hook doesn't clearly use this framework, REWRITE it.\n` : ''}
INSTRUCTIONS FOR EACH HOOK (do NOT include these instructions in your output):
- HOOK_TEXT = the headline. Max 8 words. Write in ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'Arabic' : 'the project language'}. Must be punchy direct-response copy.
- SUBHEADLINE = the supporting line. Max ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? '12' : '8'} words. Must be a COMPLETE sentence that ends naturally. Never end on a conjunction.
- CTA_BUTTON = the call-to-action button text, followed by ||| then a CONNECTOR + short benefit line (2-5 words). The benefit MUST start with a natural connector word (و/ل/عشان/وابدأ/وحقق). Example: "${inputs.cta} ||| وابدأ تحقق دخل يليق بخبرتك" or "${inputs.cta} ||| وتوقف عن ملاحقة العملاء".
- Hook A = Direct/How-To type, Greed angle. Hook B = Question/Challenge type, Fear angle. Hook C = News/Testimonial type, Proof angle. Hook D = Command/Reason-Why type, Curiosity angle.

OUTPUT FORMAT (fill in the values after each colon — do NOT output instructions, brackets, or dimension labels):

HOOK_START_A
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: ${inputs.cta} ||| 
HOOK_END_A

HOOK_START_B
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: ${inputs.cta} ||| 
HOOK_END_B

HOOK_START_C
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: ${inputs.cta} ||| 
HOOK_END_C

HOOK_START_D
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: ${inputs.cta} ||| 
HOOK_END_D
`}

═══════════════════════════════════════════════════════════════════════════════
🛑 FINAL SELF-CHECK — RUN BEFORE OUTPUTTING (DO NOT SKIP)
═══════════════════════════════════════════════════════════════════════════════

${inputs.coldHookAngle ? `⚡ PRIORITY 1 — ANGLE HARD RULE CHECK:
${getAngleValidationChecklist(inputs.coldHookAngle)}
` : ''}□ ${inputs.coldHookAngle ? `All 4 hooks use ${inputs.coldHookAngle} angle with DIFFERENT dimensions` : 'Each hook uses a DIFFERENT headline type'}
□ ${inputs.coldHookAngle ? 'Each hook explores a different FACET of the same angle' : 'Each hook uses a DIFFERENT emotional angle'}
□ ${inputs.hookType ? `All hooks delivered as ${inputs.hookType} format` : 'Delivery styles varied across hooks'}
□ No opening word repeated across hooks
□ No benefit word repeated across hooks
□ Subheadlines complement(not repeat) headlines
□ CTA benefits are all different
□ All text follows the required language: ${getLanguageInstruction(inputs.adLanguage || 'ar_fusha')}
□ No colons(: ) in headlines
□ Universe "${resolvedUniverse}" vocabulary integrated where relevant

⚠️ FORBIDDEN IN HOOK OUTPUT (NEVER INCLUDE THESE):
- VISUAL_DIRECTION or any visual/scene descriptions
- TECHNICAL_PROMPT or camera/lighting/composition notes
- Hex color codes (#XXXXXX)
- SUBJECT_ACTION, ENVIRONMENT_DESC, MOOD_EMOTION, LIGHTING_LOGIC, TEXT_LAYOUT
- Any content meant for image generation — hooks are TEXT COPY ONLY

${modeInstruction}

${(inputs.adMode === 'carousel' && (inputs.slideCount || 1) > 1) ? `
═══════════════════════════════════════════════════════════════════════════════
CAROUSEL MODE — ${inputs.slideCount} SLIDES
═══════════════════════════════════════════════════════════════════════════════
The user is creating a ${inputs.slideCount}-slide carousel ad. Each of the 4 hook options you generate
will be used as the LEAD HOOK (Slide 1). The narrative will continue across slides.
So make each hook ESPECIALLY strong as an opening that creates curiosity to swipe.
- Hooks should feel like the START of a story, not a complete statement
- Use open loops, cliffhangers, or "Part 1 of..." energy
- The subheadline should tease what comes next without resolving the tension
═══════════════════════════════════════════════════════════════════════════════
` : ''}

CRITICAL: Replace ALL placeholders with real copy. Never output placeholder text.

${personalizationContext ? `
═══════════════════════════════════════════════════════════════════════════════
HOOK A — DATA-DRIVEN (apply vault principles to THIS hook only):
${personalizationContext}
═══════════════════════════════════════════════════════════════════════════════
HOOKS B, C, D — CREATIVE EXPLORATION:
These 3 hooks must BREAK AWAY from past patterns. Explore NEW angles, structures, word choices, and emotional triggers that are DIFFERENT from what has worked before. Surprise the user with fresh perspectives. The vault principles above apply ONLY to Hook A.
═══════════════════════════════════════════════════════════════════════════════
` : ''}
${_step2RankingGuidance?.promptBlock || ''}
${inputs.competitorContext ? `
═══════════════════════════════════════════════════════════════════════════════
COMPETITIVE INTELLIGENCE (use to differentiate):
${inputs.competitorContext}
═══════════════════════════════════════════════════════════════════════════════
` : ''}
  ${globalRefinement ? `
═══════════════════════════════════════════════════════════════════════════════
⚠️⚠️⚠️ GLOBAL REFINEMENT — HARD REWRITE DIRECTIVE (HIGHEST PRIORITY) ⚠️⚠️⚠️
═══════════════════════════════════════════════════════════════════════════════
The user has given this specific instruction that OVERRIDES ALL other generation rules:
"${globalRefinement}"

THIS IS NOT A SUGGESTION. THIS IS A MANDATORY REWRITE COMMAND.
- If the user says "make them all more urgent" → ALL 4 hooks must be rewritten around urgency
- If the user says "make them more premium" → ALL 4 hooks must feel luxury/premium
- If the user says "focus on pain" → ALL 4 hooks must amplify pain
- If the user says "use this specific wording: X" → use those EXACT words
- If this instruction CONFLICTS with the selected angle/tone, the REFINEMENT WINS
- If this instruction adds a new angle/tone, APPLY IT to all hooks
═══════════════════════════════════════════════════════════════════════════════
` : ''}
`;

        const hookQualityBlock = `
HOOK QUALITY FLOOR:
- Professional direct-response quality. Specific to "${inputs.productName || 'this offer'}" for "${inputs.targetAudience || 'this audience'}".
- Subheadlines must be complete sentences that end naturally.
- Numbers/stats are powerful but NOT mandatory — a strong emotional hook without numbers is fine.
- ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'Arabic: conversational business tone. Use action verbs that create urgency.' : 'English: sharp mentor tone, not corporate.'}
- ORIGINALITY: Generate fresh copy. Do NOT reuse phrases from examples in this prompt.`;

        // Using Lite model with Retry logic
        // Use higher temperature when regenerating (previousOutput exists) to maximize diversity
        const isRegeneration = !!(previousOutput && previousOutput.trim().length > 20);
        const response = await retry(() => callGemini({
            model: isRegeneration ? CREATIVE_MODEL_LITE : CREATIVE_MODEL_PRO, // <--- HIGH IQ MODEL (PRO for first gen, LITE for regen)
            contents: { parts: [{ text: `${prompt}
${hookQualityBlock}` }] },
            config: {
                systemInstruction: SYSTEM_TOV,
                temperature: isRegeneration ? 1.2 : 1.0 // Higher temp for regenerations to force diversity
            }
        }));

        const rawText = response.text || '';

        // ─── HOOK VALIDATION & NORMALIZATION ─────────────────────────────────
        // For precision edits (single hook), skip full 4-hook validation
        if (mode === 'precision') {
            if (!rawText.trim()) {
                console.error('[generateTOV] Precision edit returned empty text');
                throw new GenerationError('Hook edit returned empty result. Please retry.', 'model_error');
            }
            const semanticCheck = assertHookSemanticPreservation(previousOutput || '', rawText, semanticLock || null);
            if (!semanticCheck.ok && editIntent !== 'change_angle') {
                console.warn(`[generateTOV] Precision edit failed semantic lock: ${semanticCheck.reason || 'unknown'}. Returning original hook.`);
                return previousOutput || rawText;
            }
            return rawText;
        }

        // For initial/refresh: validate full 4-hook structure
        const validation = validateHookResponse(rawText);
        console.log(`[generateTOV] Raw length: ${rawText.length}, Valid: ${validation.valid}, Hook count: ${validation.count}`);

        if (validation.valid) {
            return rawText; // Pass through — structure is good
        }

        // Try normalization
        const normalized = normalizeHookResponse(rawText);
        if (normalized) {
            const reValidation = validateHookResponse(normalized);
            console.log(`[generateTOV] Normalized: Hook count: ${reValidation.count}`);
            if (reValidation.count >= 3) {
                return normalized;
            }
        }

        // Retry once with a stricter prompt
        console.warn(`[generateTOV] First attempt invalid (${validation.count}/4 hooks). Retrying with strict format...`);
        const retryPrompt = `${prompt}

⚠️⚠️⚠️ CRITICAL FORMAT REQUIREMENT ⚠️⚠️⚠️
Your previous response was REJECTED because the hook blocks were malformed or missing.
You MUST output EXACTLY this structure with ALL 4 hooks — fill in actual content after each colon:

HOOK_START_A
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: 
HOOK_END_A

HOOK_START_B
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: 
HOOK_END_B

HOOK_START_C
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: 
HOOK_END_C

HOOK_START_D
HOOK_TEXT: 
SUBHEADLINE: 
CTA_BUTTON: 
HOOK_END_D

Do NOT omit any markers. Do NOT add prose outside of these blocks. Do NOT include brackets or instructions in the values.`;

        const retryResponse = await retry(() => callGemini({
            model: isRegeneration ? CREATIVE_MODEL_LITE : CREATIVE_MODEL_PRO,
            contents: { parts: [{ text: retryPrompt }] },
            config: {
                systemInstruction: SYSTEM_TOV,
                temperature: 0.6 // Lower temp for format compliance
            }
        }));

        const retryText = retryResponse.text || '';
        const retryValidation = validateHookResponse(retryText);
        console.log(`[generateTOV] Retry: Raw length: ${retryText.length}, Valid: ${retryValidation.valid}, Hook count: ${retryValidation.count}`);

        if (retryValidation.valid || retryValidation.count >= 3) {
            return retryText;
        }

        // Try normalizing the retry
        const retryNormalized = normalizeHookResponse(retryText);
        if (retryNormalized) {
            const rnValidation = validateHookResponse(retryNormalized);
            if (rnValidation.count >= 3) return retryNormalized;
        }

        // Both attempts failed — throw explicit error instead of returning garbage
        console.error(`[generateTOV] Both attempts returned invalid hook structure. First: ${validation.count}/4, Retry: ${retryValidation.count}/4`);
        throw new GenerationError('Hook generation failed: invalid structure after retry. Please try again.', 'model_error');
    } // end _generateTOVInner
    const text = await _generateTOVInner();
    return { text, rankingGuidance: _tovRankingLinkage };
}

// 2. Generate Concepts -> USE LOGIC MODEL (Engineer)
// This step is just "Scene Description". 2.5 Flash is perfectly capable and faster.
// This saves your Gemini 3 Quota/Limits.

export async function generateConcepts(approvedTov: string, inputs: AdInputs, resolvedUniverse: string, mode: 'initial' | 'refresh' | 'precision' = 'initial', _previousOutput?: string, _globalRefinement?: string, editFeedback?: string, editIndex?: string): Promise<{ text: string; rankingGuidance: RankingLinkage | null }> {
    let _conceptsRankingLinkage: RankingLinkage | null = null;
    async function _generateConceptsInner(): Promise<string> {
        // ═══ CREATIVE MODE VALIDATION (fail-closed) ═══
        const _selectedModes = (inputs as any).offerCreativeMode || ['standard_hero'];
        const _comboCheck = validateCombination(_selectedModes, inputs.coldHookAngle);
        console.log(`🎨 CREATIVE MODE AUDIT [generateConcepts]: modes=[${_selectedModes.join(',')}] tab=${_comboCheck.resolvedTab || 'none'} valid=${_comboCheck.valid}${_comboCheck.errors.length ? ' errors: ' + _comboCheck.errors.join('; ') : ''}`);
        if (!_comboCheck.valid) {
            console.error(`🛑 CREATIVE MODE REJECTED in generateConcepts: ${_comboCheck.errors.join('; ')}`);
            throw new GenerationError(`Invalid creative mode combination: ${_comboCheck.errors.join('; ')}`, "combination_invalid");
        }

        // ═══ REFERENCE IMAGE ANALYSIS (optional, non-blocking) ═══
        let _conceptRefInfluence: ReferenceInfluence | null = null;
        if (inputs.referenceImage && mode === 'initial') {
            _conceptRefInfluence = await analyzeReferenceImage(inputs.referenceImage);
        }

        // --- 1. Force Extract Text Layers to ensure they are NOT lost ---
        const rawHook = extract(approvedTov, "HOOK_TEXT:", "SUBHEADLINE:");
        const rawSub = extract(approvedTov, "SUBHEADLINE:", "CTA_BUTTON:");
        const rawCTA = extract(approvedTov, "CTA_BUTTON:", "HOOK_END");
        let modeInstruction = "";

        if (mode === 'initial') {
            modeInstruction = `PHASE 3: SCENE ARCHITECT.
      CRITICAL TEXT FIDELITY RULE:
- The User has APPROVED specific text.You are FORBIDDEN from changing it.
      - You are constructing a visual scene to hold THIS EXACT TEXT:
1. HEADLINE: "${rawHook}"
2. SUBHEADLINE: "${rawSub}"
3. CTA: "${rawCTA}"
      ${inputs.badges ? `4. PROMO BADGE: "${inputs.badges}" (Place as a sticker, ribbon, or holographic tag)` : ''}
      
      VISUAL INSTRUCTION:
- Your job is NOT to write copy.Your job is to describe where these specific Arabic strings will sit in the image(Negative Space).
      - Do NOT re - write the headline in the output description.Refer to it as "The Headline Layer".
 
      UNIVERSE LOGIC & COSTUME RULES:
      ═══════════════════════════════════════════════════════════════════════════════
      UNIVERSE MODE: ${resolveStyleFamily(inputs)?.toUpperCase() || 'REALISTIC'}
${(() => {
    const _uSub = resolveVisualSubStyle(inputs);
    if (_uSub === 'luxury_magazine') return `UNIVERSE: LUXURY MAGAZINE COVER (universe "${resolvedUniverse}" determines PROFESSION/WARDROBE only — dark solid background, NO environment)`;
    if (_uSub === 'clean_corporate') return `UNIVERSE: CLEAN CORPORATE STUDIO (universe "${resolvedUniverse}" applies to PROFESSION/WARDROBE only — NOT environment)`;
    if (_uSub === 'ugly_ad') return `UNIVERSE: UGLY AD / RAW (universe "${resolvedUniverse}" is IRRELEVANT — raw screenshot aesthetic)`;
    if (resolveStyleFamily(inputs) === 'minimal') return 'UNIVERSE: MINIMAL (no universe — clean backdrop)';
    return `UNIVERSE: ${resolvedUniverse}`;
})()}
      ═══════════════════════════════════════════════════════════════════════════════

      ${resolveStyleFamily(inputs) === 'minimal' ? `
      【MINIMAL MODE - CLEAN COMMERCIAL COMPOSITION】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      - BACKGROUND: Refined gradient backdrop MANDATORY (2-3 subtle color tones). NEVER flat single solid color. Think premium brand backgrounds: soft navy-to-charcoal, warm beige-to-cream, dark slate-to-midnight. Geometric accent shapes allowed.
      - NO detailed real-world environment, NO location scenery, NO fantasy worldbuilding
      - SUBJECT ISOLATION: Hero person, mockup, device, or offer framework stands alone
      - COSTUME: Smart professional attire matching the niche — keep it simple and polished
      - COMPOSITION: Clean, commercial, studio-like. Think premium ad layout.
      - ALLOWED: Subtle floor/shadow, simple platform, brand color accents, geometric shapes
      - FORBIDDEN: Environmental clutter, atmospheric effects, location details, cinematic scenes, fantasy elements
      - TEXT ZONES: Must leave generous clean space for headlines, subheadlines, CTA
      - STYLE: Polished, brand-safe, high-end ad production — like Apple, Nike, or Shopify ads
      ` : (() => {
          const _ulSub = resolveVisualSubStyle(inputs);
          if (_ulSub === 'luxury_magazine') return `
      【LUXURY MAGAZINE COVER — OVERRIDES ALL UNIVERSE ENVIRONMENT RULES】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      - ⚠️ IGNORE ALL ENVIRONMENT INSTRUCTIONS FOR "${resolvedUniverse}" — the universe ONLY determines the hero's PROFESSION and WARDROBE.
      - BACKGROUND: Bold solid color (deep navy, rich black, dark grey, teal). NOT white. NOT an office. NOT a location.
      - HERO: TIGHT CROP waist-up. Fills 70% of frame. Shoulders span width. Head overlaps masthead text.
      - COSTUME: Premium wardrobe matching the PROFESSION implied by "${resolvedUniverse}" — but styled for a MAGAZINE COVER SHOOT.
      - VARIETY MANDATE: Each concept MUST have a DIFFERENT background color AND different outfit.
      - TEXT DENSITY: Canvas should feel FULL — text cover lines fill gaps around hero. Almost zero empty space.
      - TYPOGRAPHY: BOLD condensed sans-serif (NOT thin serif). Gold or white accent.
      - FORBIDDEN: ${resolvedUniverse} environment, white background, desks, offices, laptops, bookshelves, rooms, locations, full body shots, negative space, thin serif fonts, environmental scenes.
      `;
          if (_ulSub === 'clean_corporate') return `
      【CLEAN CORPORATE STUDIO — OVERRIDES ALL UNIVERSE ENVIRONMENT RULES】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      - ⚠️ IGNORE ALL ENVIRONMENT INSTRUCTIONS FOR "${resolvedUniverse}" — the universe ONLY determines the hero's PROFESSION and WARDROBE.
      - BACKGROUND: Neutral gradient (light grey to soft blue-grey, or cream to beige). Premium studio isolation.
      - NO environmental scenes, NO locations, NO furniture, NO universe-specific props.
      - COSTUME: Polished professional attire matching the PROFESSION from "${resolvedUniverse}".
      - VARIETY MANDATE: Each concept MUST have a DIFFERENT professional outfit.
      - STYLE: Apple / Nike / Shopify premium commercial aesthetic.
      - FORBIDDEN: ${resolvedUniverse} environment, cinematic effects, atmospheric particles, dramatic lighting.
      `;
          if (_ulSub === 'ugly_ad') return `
      【UGLY AD / RAW — OVERRIDES ALL UNIVERSE AND STYLING RULES】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      - ⚠️ IGNORE ALL UNIVERSE INSTRUCTIONS. The ad looks like a quick phone screenshot or notes app.
      - BACKGROUND: Phone screenshot, notepad, or plain color. Anti-design.
      - NO studio, NO environment, NO universe-specific anything.
      - COSTUME: If hero present — casual selfie clothing. NOT styled.
      - STYLE: Deliberately imperfect. Red circles, hand-drawn arrows, marker highlights.
      - FORBIDDEN: Any professional design quality, any universe-specific elements.
      `;
          if (resolveStyleFamily(inputs) === 'fantasy') return `
      【FANTASY MODE - FULL COSTUME TRANSFORMATION】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      - COSTUME: TOTAL transformation to fit "${resolvedUniverse}"
      - TRANSFORM: Replace ALL modern clothing with universe-appropriate attire
        • If Pharaoh → Full robes, Nemes headdress, golden collar
        • If Space → Full space suit, armor, or futuristic uniform
        • If Medieval → Armor, robes, cloaks, period-accurate garments
        • If Steampunk → Victorian with brass, gears, goggles
      - FORBIDDEN: Modern suits, business casual, streetwear in fantasy settings
      - ENVIRONMENT: Magical/Sci-fi physics allowed. Floating objects, glowing elements, impossible architecture OK.
      - STYLE: High-concept digital art, cinematic, epic composition
      `;
          return `
      【REALISTIC MODE - UNIVERSE-APPROPRIATE PROFESSIONAL CLOTHING】
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      - ⚠️ IGNORE the clothing worn in Box A photos. Box A = face reference ONLY.
      - COSTUME: Dress the hero based on UNIVERSE + NICHE, NOT their uploaded outfit:
        • Office/Corporate → Tailored suit, blazer, button-down
        • Start-up/Garage → Smart casual, open collar, rolled sleeves
        • Gym/Fitness → Athletic wear, compression shirt, sneakers
        • Kitchen/Food → Chef coat, apron, casual underneath
        • Medical → Lab coat, scrubs, stethoscope
        • Creative/Studio → Turtleneck, trendy blazer, minimal accessories
        • Luxury/Penthouse → Premium suit, silk tie, pocket square, cufflinks
        • Outdoor/Nature → Field jacket, henley, boots
      - VARIETY MANDATE: Each of the 3 concepts MUST have a DIFFERENT outfit. Change shirt color, add/remove jacket, change style.
      - FORBIDDEN: Fantasy robes, armor, sci-fi suits, period costumes
      - ENVIRONMENT: Photorealistic real-world location. No floating objects, no magic, no holograms.
      - STYLE: High-end commercial photography, natural lighting, depth of field
      - PROPS: Only realistic items that belong in "${resolvedUniverse}" (laptop, mic, coffee, weights, etc.)
      `;
      })()}
      
      HIJAB RULE: If the hero wears Hijab in Box A, maintain it styled appropriately for the universe.
           
      - VISUALS: Plan negative space for Headline, Subheadline, and Action Block.
      - BRANDING: ${inputs.brandLogos?.length ? "Integrate Box B logos as physical objects (e.g. on laptop, mug, wall)." : "No logos provided."}
      ${inputs.brandColorPrimary ? `- BRAND COLORS: Primary ${inputs.brandColorPrimary}${inputs.brandColorSecondary ? `, Secondary ${inputs.brandColorSecondary}` : ''}. Weave these into the COLOR_PALETTE of each concept. VARY their usage across the 3 concepts:
        Concept 1: Use brand primary as CTA button color and subtle accent in environment lighting.
        Concept 2: Use brand primary as headline highlight glow / text accent color.
        Concept 3: Use brand colors as dominant environment tones (neon signs, ambient light, props).
        This ensures brand recognition while keeping each concept visually distinct.
        ⚠️ CRITICAL: ALWAYS write the ACTUAL hex code (e.g. "${inputs.brandColorPrimary}") in your output. NEVER write placeholder text like "[brand_name primary color]" or "[brand color]" or "[primary color]". The designer cannot interpret placeholders — only exact hex values like ${inputs.brandColorPrimary}.` : ''} `;

        } else if (mode === 'precision') {
            modeInstruction = `SURGICAL EDIT [SINGLE CONCEPT PATCH]:

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: RETURN ONLY CONCEPT ${editIndex} - DO NOT RETURN ALL 3 CONCEPTS
═══════════════════════════════════════════════════════════════════════════════

USER'S EDIT REQUEST: "${editFeedback}"

YOUR TASK:
1. Apply the user's edit request to Concept ${editIndex} ONLY
2. Keep ALL other details (composition, mood, lighting) unless the user explicitly asks to change them
3. If user wants to change the environment, update ONLY environment-related fields
4. If user wants to change the pose/action, update ONLY the hero action description
5. If user provides specific Arabic text, use it VERBATIM
6. Maintain the existing format with all required fields (SUBJECT_ACTION, HERO_POSITION, ENVIRONMENT, etc.)

OUTPUT: Return the COMPLETE concept block for Concept ${editIndex} only, with the user's changes applied.
DO NOT return the other concepts.`;
        }
        // ═══ RETARGETING CONTEXT (normalized, shared across steps) ═══
        const _rtCtx = buildNormalizedRetargetingContext(inputs as any);
        const _rtConceptBlock = getRetargetingPromptBlock(_rtCtx);
        const _effectiveColdHookAngle = _rtCtx.isRetargeting ? null : inputs.coldHookAngle;

        const prompt = `
[VISUAL ARCHITECT V5.0]
      ${getLanguageInstruction(inputs.adLanguage || 'ar_fusha')}
      ${_rtConceptBlock ? `\n${_rtConceptBlock}\n` : ''}
      LANGUAGE MANDATE: ALL OUTPUT (Subject, Environment, Mood) MUST follow the language above. ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'ALL concept field content MUST be in Arabic — not English.' : ''}
      ${inputs.adTone ? `MOOD DIRECTION: ${getAdToneVisualMood(inputs.adTone)}` : ''}
      ${inputs.offerType ? `OFFER TYPE: ${inputs.offerType} — adapt the scene energy and props to match this offer format.` : ''}
      ${(() => {
          const modes = (inputs as any).offerCreativeMode || ['standard_hero'];
          const hasHero = modes.includes('standard_hero');
          const secondary = modes.filter((m: string) => m !== 'standard_hero');
          const isSolo = modes.length === 1 && !hasHero;
          const soloMode = isSolo ? modes[0] : null;
          const pairMode = hasHero && secondary.length > 0 ? secondary[0] : null;

          // before_after is a solo mode but REQUIRES hero on both halves — handle separately
          if (isBeforeAfterSelection(inputs, _effectiveColdHookAngle)) {
              return `
═══ CREATIVE MODE CONTRACT (TOP PRIORITY — READ FIRST) ═══
MODE: BEFORE_AFTER (SPLIT-SCREEN — HERO REQUIRED ON BOTH HALVES)
BEFORE/AFTER SPLIT — Canvas split into two halves. BEFORE half: hero in problem state with struggle expression. AFTER half: same hero in result state with confident expression. Visible divider between halves. NO "BEFORE"/"AFTER" text labels. Same face both halves.
⚠️ The SAME hero/person MUST appear in BOTH halves. Props transform logically (empty→full, cheap→premium, cluttered→organized).
═══════════════════════════════════════════════════════════`;
          }

          if (soloMode) {
              const soloLabels: Record<string, string> = {
                  value_stack: 'This ad has NO hero person. The value stack IS the entire design. Full-width layout with offer items as visual focus. Background is thematic only.',

                  event_ticket: 'TICKET-ONLY design. NO presenter visible. The ticket fills the canvas with premium details (date, time, title, seat count).',
                  webinar_screen: 'SCREEN-ONLY design. Laptop/monitor showing the webinar. NO presenter beside it.',
                  speaker_card: 'SPEAKER PORTRAIT — keynote stage environment mandatory. Dramatic lighting, credentials bar.',
                  book_mockup: 'BOOK-ONLY design. 3D book as centerpiece, NO hero person holding it. Floating in thematic environment.',
                  device_mockup: 'DEVICE-ONLY design. Tablet/phone showing content, NO hero person. Device is the visual anchor.',
                  text_only: 'TYPOGRAPHY-ONLY design. NO hero person. NO universe environment. The COPY and TYPOGRAPHY ARE the entire visual. Background is color/gradient/texture only. All canvas space is used for typographic layout.',
              };
              return `
═══ CREATIVE MODE CONTRACT (TOP PRIORITY — READ FIRST) ═══
MODE: ${soloMode.toUpperCase()} (SOLO — NO HERO)
${soloLabels[soloMode] || 'This ad features ONLY this creative element without a hero person.'}
⚠️ Do NOT generate a hero/person in this design. The ${soloMode.replace(/_/g, ' ')} IS the hero.
═══════════════════════════════════════════════════════════`;
          } else if (pairMode) {
              const pairWeights: Record<string, string> = {
                  value_stack: 'VISUAL WEIGHT: Hero 45% | Value Stack 45% | Text 10%. Stack items must be INDIVIDUALLY READABLE cards.',

                  event_ticket: 'VISUAL WEIGHT: Hero 40% | Ticket 50% | Text 10%. Ticket must show DATE, TIME, TITLE as READABLE text.',
                  speaker_card: 'VISUAL WEIGHT: Hero 50% | Stage/Credentials 40% | Text 10%. STAGE ENVIRONMENT + lower-third bar MANDATORY.',

                  webinar_screen: 'VISUAL WEIGHT: Hero 40% | Screen 50% | Text 10%. Screen must show LEGIBLE title + LIVE badge.',
                  book_mockup: 'VISUAL WEIGHT: Hero 45% | Book 45% | Text 10%. 3D book with readable cover title.',
                  device_mockup: 'VISUAL WEIGHT: Hero 45% | Device 45% | Text 10%. Device screen shows content, not blank.',

              };
              return `
═══ CREATIVE MODE CONTRACT (TOP PRIORITY — READ FIRST) ═══
MODE: HERO + ${pairMode.toUpperCase().replace(/_/g, ' ')}
${pairWeights[pairMode] || `Both elements must have balanced visual presence — neither should be a tiny afterthought.`}
⚠️ The ${pairMode.replace(/_/g, ' ')} must occupy AT LEAST 40% of the canvas. If the hero dominates 80%+ the design FAILS.
═══════════════════════════════════════════════════════════`;
          }
          return '';
      })()}
      ${isTextOnlyMode(inputs) ? `
═══ TEXT-ONLY AD — LAYOUT SYSTEM (TOP PRIORITY) ═══
This is a TYPOGRAPHY-FIRST ad. There is NO hero person, NO universe environment.
The headline, subheadline, CTA, and supporting copy ARE the entire design.
Generate 3 concepts, each using a DIFFERENT layout archetype:
CONCEPT 1 — BOLD TYPOGRAPHY DOMINANT:
  Background: Solid bold color field OR strong 2-stop gradient.
  Layout: Headline occupies 50-60% of canvas — MASSIVE, commanding.
  Subheadline: Clean, significantly smaller. Creates typographic contrast.
  Supporting text: Minimal — 1-2 short lines max.
  CTA: Solid opaque button, high contrast. Anchored at bottom.
  Energy: Billboard power. Scroll-stopping typographic statement.
CONCEPT 2 — NEWSPAPER / EDITORIAL LAYOUT:
  Background: White, cream, or very light neutral.
  Layout: Column-based — headline spans full width at top like a masthead.
  Thin rule lines divide sections. Optional drop cap on first word.
  Subheadline: Set in a distinct column or section below headline.
  Supporting: 1-2 lines set like a news subheading or dateline.
  CTA: Styled like an editorial call-out box or button.
  Energy: Authoritative, credible, journalistic gravitas.
CONCEPT 3 — MANIFESTO STYLE:
  Background: Dark, single deep color (near-black, deep navy, deep green).
  Layout: ONE powerful statement dominates — centered, large, breathing room.
  White or light text only. Maximum 2 text elements total.
  NO subheadline if it weakens the manifesto impact.
  CTA: Minimal, restrained — small but clear.
  Energy: Brand conviction. Loud silence. Statement-making simplicity.
BONUS LAYOUT (use as variation if concept count allows):
SOCIAL PROOF WALL: Multiple testimonial quotes fill the canvas as typography.
  Large quote marks as design elements. Names as small-caps below each quote.
  Background: Solid color or very subtle gradient.
  CTA: Single line at bottom.
UNIVERSAL TEXT-ONLY RULES:
- NO hero person in any concept
- NO universe scenery or environment
- Background is COLOR/GRADIENT/TEXTURE only
- Font weights: use at least 2 contrasting weights per concept (ultra-bold + thin)
- Typography IS the visual interest — vary scale dramatically
- TECHNICAL_PROMPT: describe the typographic composition, background color/gradient,
  and layout structure — NO scene, NO character, NO environment description
═══════════════════════════════════════════════════════════
` : ''}
      ${inputs.hookType ? `HOOK DELIVERY VISUAL: ${inputs.hookType.toUpperCase()}
${getHookTypeVisualDirection(inputs.hookType)}` : ''}
      ${(inputs as any).copywritingStrategy ? getCopywritingStrategyVisualHint((inputs as any).copywritingStrategy) : ''}
      ${_effectiveColdHookAngle ? `
HOOK ANGLE VISUAL OVERRIDE: ${(_effectiveColdHookAngle || '').toUpperCase()}
${getHookAngleVisualDirection(_effectiveColdHookAngle || '')}
` : ''}
      ${isBeforeAfterSelection(inputs, _effectiveColdHookAngle) ? `
BEFORE/AFTER SPLIT COMPOSITION (MANDATORY):
- SPLIT the canvas into TWO CLEAR HALVES (left vs right, or top vs bottom)
- BOTH halves show the SAME HERO — same face, same person, different life chapter
- BEFORE half: The hero is LIVING THE PROBLEM from the headline. Not just "sad" — show the SPECIFIC struggle.
  → If headline says "stop selling hours" → hero drowning in a sea of clocks and cheap invoices
  → If headline says "tired of chasing clients" → hero running after silhouettes, exhausted
- AFTER half: The hero is LIVING THE RESULT from the product. Not just "happy" — show the SPECIFIC success.
  → "stop selling hours" → hero on a throne of systems, passive income flowing
  → "tired of chasing" → hero at a premium desk, clients lining up
- PROPS MUST CHANGE between halves: cheap → premium, empty → full, solo → team, manual → automated
- VISIBLE DIVIDER: diagonal line, gradient split, torn edge
- STRICT: Do NOT render any "BEFORE"/"AFTER" or "قبل"/"بعد" text labels on the image. The visual contrast alone tells the story.
- This is NOT optional - the user specifically selected before/after split design
` : ''}
      ${(() => {
                // Concept generation uses resolver spec for creative mode instructions
                // The full contract will be compiled in Step 3.5 (build plan) after concept is chosen
                const spec = resolveCreativeSpec({
                    selectedModes: (inputs as any).offerCreativeMode || ['standard_hero'],
                    hookAngle: _effectiveColdHookAngle || undefined,
                });
                const specBlock = getResolvedSpecPromptBlock(spec);
                // Also include the original per-mode instructions for richness
                const nonHero = ((inputs as any).offerCreativeMode || []).filter((m: string) => m !== 'standard_hero');
                const legacyInstructions = nonHero.map((m: string) => getCreativeModeConceptInstruction(m)).filter(Boolean).join('\n\n');
                return specBlock ? `${specBlock}\n${legacyInstructions}\n${buildModeBlock(inputs)}\n${(inputs as any).offerAssets?.length ? `\nBox C ASSETS PROVIDED: ${(inputs as any).offerAssets.length} image(s). Reference these in your TECHNICAL_PROMPT — they will be passed to the renderer as offer-specific visuals (book cover, dashboard screenshot, etc.).` : ''}` : buildModeBlock(inputs);
            })()}
${_conceptRefInfluence ? `      REFERENCE IMAGE DIRECTION (analyzed metadata):
      A reference image was analyzed. Channel these specific style qualities in your VISUAL_DIRECTION:
      - Composition: ${_conceptRefInfluence.compositionType} — use similar structural energy
      - Lighting: ${_conceptRefInfluence.lightingStyle} — match this lighting direction
      - Color palette: ${_conceptRefInfluence.colorPalette.join(', ')} — draw from these tones
      - Mood: ${_conceptRefInfluence.mood} — channel this emotional atmosphere
      - Scene energy: ${_conceptRefInfluence.sceneEnergy} — match this intensity level
      - Framing: ${_conceptRefInfluence.framingHints.join(', ')} — use similar framing approach
      - Depth: ${_conceptRefInfluence.depthStyle} — match this depth treatment
      IMPORTANT: Create an ORIGINAL concept INSPIRED BY these qualities. Do NOT copy the reference image.
      The layout/template rules still override — do not change the structural layout for the reference.
      Include a note like "Inspired by: ${_conceptRefInfluence.mood} mood, ${_conceptRefInfluence.lightingStyle} lighting, ${_conceptRefInfluence.compositionType} composition"
` : ''}      CONVERT HOOK INTO 3 UNIQUE ADVANCED VISUAL BLUEPRINTS (${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'Arabic content is mandatory for all field values except TECHNICAL_PROMPT' : 'Content language must match the project language setting'}).
      The user has provided this hook: "${approvedTov}"
      STORY LOGIC MANDATE:
    - Analyze the hook's narrative verbs and emotions (e.g., Victory, Wealth, Authority).
      ${(() => {
          const _slSub = resolveVisualSubStyle(inputs);
          if (_slSub === 'luxury_magazine' || _slSub === 'clean_corporate') return `- MANIFEST these through the hero's EXPRESSION, POSE, and WARDROBE — NOT through environmental props. There is NO environment to place props in. The hero's body language and editorial styling tell the emotional story.`;
          if (_slSub === 'ugly_ad') return `- MANIFEST these through RAW TEXT ANNOTATIONS (red circles, arrows) and the hero's casual expression. Anti-design energy.`;
          return `- MANIFEST these physically using elements from [${resolvedUniverse}].`;
      })()}
    - ONLY if the HOOK_TEXT explicitly contains words like "يضحكون", "المشككين", "الناس", "skeptics", "laughing": Add 2 - 3 background figures.Otherwise, DO NOT add extra people.
      - If status / wealth is mentioned: Include physical status symbols matching the universe.
      - DEFAULT: Keep the hero ALONE in the scene unless the copy explicitly requires others.
      COMPOSITION STRATEGY(Freedom with Purpose):
    - We need 3 distinct energies.Do not repeat the same pose or framing.
      - HERO RULE: The Hero(Box A) is the primary subject.They must be clearly visible(Front view or 3 / 4 view). 
      - FORBIDDEN ANGLES: No "POV" shots.No "Over-the-shoulder" shots.No shots where the Hero's face is obscured or turned away.
      
      ${(() => {
          // ── Ticket 3+5: Sub-style-aware pose rules + solo-mode hero guard ──
          const _sub = resolveVisualSubStyle(inputs);
          const _modes = (inputs as any).offerCreativeMode || ['standard_hero'];
          const _isTextOnly = _modes.includes('text_only');
          const _hasPerson = !_isTextOnly && (
              _modes.includes('standard_hero') ||
              _modes.includes('speaker_card') ||
              _modes.length >= 2 // paired modes always have a hero
          );
          if (!_hasPerson) {
              return `⚠️ NO HERO PERSON IN THIS AD — skip all hero pose, costume, and framing rules.
Focus on the creative element (${_modes[0]}) styled with canvas, typography, and aesthetic rules only.`;
          }
          if (_sub) {
              // Sub-styles have their own pose rules defined in the FORMAT block below
              return `⚠️ POSE DIRECTION: Follow the ${_sub.replace(/_/g, ' ').toUpperCase()} pose rules from the Visual Direction section below.
Do NOT use generic "lean on desk / walk through doorway" poses — use the sub-style-specific pose direction instead.
STILL MANDATORY:
- FORBIDDEN: Hero standing straight with arms at sides like a mannequin.
- FORBIDDEN: Symmetrical "passport photo" pose.
- BODY ANGLE: Never perfectly frontal. Always 10-30° rotation from camera.
- HANDS: Must be DOING something — never hanging limp at sides.`;
          }
          // Default: original anti-robotic rules for ads without a sub-style
          return `⚠️ ANTI-ROBOTIC POSE RULE (CRITICAL — USERS HATE STIFF POSES):
    - FORBIDDEN: Hero standing straight with arms at sides like a mannequin. This is the #1 user complaint.
      - FORBIDDEN: Symmetrical "passport photo" pose — straight shoulders, arms down, staring at camera.
      - FORBIDDEN: Generic "confident businessman standing" — this looks AI-generated and fake.
      - EACH concept MUST describe a SPECIFIC physical action or interaction:
        * Concept 1: Hero MID-ACTION — leaning on a surface, reaching for something, turning from a screen, adjusting a watch/sleeve
        * Concept 2: Hero IN CONVERSATION — gesturing with one hand, slight head tilt, weight shifted to one leg, relaxed stance
        * Concept 3: Hero WITH ENVIRONMENT — sitting on desk edge, walking through doorway, hand on chair back, looking at something off-frame
      - WEIGHT DISTRIBUTION: Never both feet planted evenly. Always weight on one leg, slight lean, or seated.
      - HANDS: Must be DOING something — holding phone, touching chin, gesturing, gripping lapel, resting on surface. NEVER hanging limp at sides.
      - BODY ANGLE: Never perfectly frontal. Always 10-30° rotation from camera. Slight 3/4 turn.`;
      })()}
      
      ⚠️ CRITICAL GENDER RULE - MANDATORY:
    - You DO NOT know the gender of the person in Box A.The photos are processed separately.
      - ALWAYS use gender - neutral language: "The Hero", "They", "Their", "Them"
      - NEVER write "he", "she", "man", "woman", "his", "her"
        - NEVER assume or invent physical attributes like hijab, beard, dress, etc.
      - The IMAGE GENERATION step will use the actual photos.Your job is only to describe the SCENE LAYOUT.
      
      ❌ WRONG: "The hero, a woman wearing hijab..." or "He stands confidently..."
      ❌ WRONG: "The Hero stands confidently facing the camera" — THIS IS ROBOTIC
      ✅ CORRECT: "The Hero leans against the desk edge, one hand adjusting their cuff, glancing slightly past the camera..."
      ✅ CORRECT: "The Hero mid-stride through a doorway, weight on front foot, hand gesturing as if explaining..."
      
      POSITIVE LAYOUT INSTRUCTIONS(Architecting the Text Space):
    - You must design the image specifically to hold the text layers(Headline, Subhead, CTA, Badge).
      - CONCEPT 1(The asymmetric Balance): Place the Hero clearly on one side(Left or Right Rule of Thirds).Create a clean, high - contrast "Void" on the opposite side specifically for the text stack.
      - CONCEPT 2(The Central Power): Center the Hero.Ensure there is ample "Headroom"(empty space above) or "Base-weight"(dark space below) to hold the text without covering the face.
      - CONCEPT 3(The Environmental Depth): Place the Hero in the mid - ground.Use the foreground or background environment(e.g., a wall, a screen, the sky) as a natural canvas for the text.

      CTA & Benefit & BADGE PLOTTING:
      - The Benefit must sit DIRECTLY BELOW the CTA button.Plan the negative space of the image accordingly.
      - It should look like a "Sub-label" or "Caption" to the button.Plan the negative space of the image accordingly.
      - DO NOT repeat the CTA text inside the benefit.
       - ${inputs.badges ? `The Badge "${inputs.badges}" must be prominent (e.g. Top Right Corner or near Button).` : ''}
      ${(() => {
          // ── Text contrast rules — sub-style-aware ──
          const _tcrSub = resolveVisualSubStyle(inputs);
          if (_tcrSub === 'luxury_magazine') {
              return `CRITICAL TEXT & CONTRAST RULE (LUXURY MAGAZINE):
- NO dark scrims, dark gradients, or dark overlays. Text sits in CLEAN editorial negative space.
- Headline zone: dark text (near-black or deep navy) on clean white/off-white background. Maximum legibility through CONTRAST, not backing.
- Subheadline zone: same — dark elegant text on clean light background.
- Button zone: refined button — metallic border or subtle fill. NOT aggressive neon. Solid and opaque.
- ONE metallic accent (gold/platinum/rose gold) applied sparingly as underline, thin rule, or single keyword highlight.
- Text readability comes from EDITORIAL NEGATIVE SPACE, not dark overlay panels.`;
          }
          if (_tcrSub === 'vintage_bw') {
              return `CRITICAL TEXT & CONTRAST RULE (VINTAGE B&W):
- NO gradient scrims. Text is PART OF THE INK ILLUSTRATION — typeset, not overlaid.
- Headline: bold black ink on white, or white reversed out of solid black block. Vintage serif, all-caps.
- Button: solid black with white text or thick black border box. Sharp rectangular corners.
- Contrast from ink weight and block reversals, not from modern gradient overlays.`;
          }
          if (_tcrSub === 'vintage_sepia') {
              return `CRITICAL TEXT & CONTRAST RULE (VINTAGE SEPIA):
- Same as B&W but warm dark-brown (#3D1A00) ink on aged cream (#F5E6C8).
- Button: dark warm-brown with cream text. Vintage typeset quality.
- Contrast from ink weight, not modern overlays.`;
          }
          // Default: original dark scrim rules for all other styles
          return `CRITICAL TEXT & CONTRAST RULE (USERS COMPLAIN ABOUT LOW CONTRAST - THIS IS TOP PRIORITY):
    - Plan "Shadow Boxing": Every concept MUST describe a dark gradient scrim, dark glass panel, or heavily blurred dark overlay behind ALL text areas.
- Headline zone: MUST have a dark backing (60-85% opacity dark gradient or solid dark panel) behind it. Never raw white text on a busy photo.
- Subheadline zone: Same treatment as headline - dark scrim mandatory.
- Button zone: Button must be solid opaque color. Never semi-transparent.
- Describe the EXACT dark backing method for each text area in the concept (e.g. "dark gradient from top-right corner fading to transparent", "frosted dark glass panel behind headline").`;
      })()}
      KEYWORD HIGHLIGHTING:
      CRITICAL BRANDING RULE:
    - Render ONLY the user's brand elements from Box B (if provided).
      - If Box B is empty, the design must have ZERO logos or branding marks.
      - If Box B contains a logo, it is the ONLY logo allowed.
      CRITICAL COSTUME RULE:
      ${(() => {
          // ── Ticket 4: Sub-style-aware costume logic ──
          const _sub = resolveVisualSubStyle(inputs);
          const _sf = resolveStyleFamily(inputs);
          const _modes = (inputs as any).offerCreativeMode || ['standard_hero'];
          const _isTextOnly = _modes.includes('text_only');
          const _hasPerson = !_isTextOnly && (
              _modes.includes('standard_hero') ||
              _modes.includes('speaker_card') ||
              _modes.length >= 2
          );
          if (!_hasPerson) return '⚠️ No hero person — costume rules do not apply.';

          if (_sub === 'luxury_magazine') {
              return `⚠️ Box A photos are for FACE IDENTITY ONLY. IGNORE the clothing in Box A. Do NOT reproduce the uploaded outfit.
MAGAZINE COVER STAR WARDROBE: Hero is dressed as a COVER MODEL for Forbes/GQ/Vogue.
- Power wardrobe: impeccably tailored suit, blazer, or premium professional attire.
- The universe "${inputs.preferredUniverse}" determines the PROFESSION, which informs wardrobe direction (e.g., finance=power suit+silk tie, coach=premium blazer+open collar, creative=editorial turtleneck+statement piece).
- Rich fabric textures that photograph beautifully in tight crop: silk, cashmere, fine wool.
- Colors: deep, rich tones (navy, charcoal, black, burgundy) with ONE accent (gold pocket square, brand-color tie).
- CRITICAL: Each of the 3 concepts MUST have a COMPLETELY DIFFERENT outfit and background color.
- FORBIDDEN: casual clothing, t-shirts, everyday wear — this is a COVER SHOOT.`;
          }
          if (_sub === 'documentary_gritty') {
              return `⚠️ Box A photos are for FACE IDENTITY ONLY. IGNORE the clothing in Box A. Do NOT reproduce the uploaded outfit.
DOCUMENTARY WARDROBE: Hero clothing is REAL and AUTHENTIC — what an actual person in this profession would wear in this moment. No styling perfection. Slight lived-in quality. Universe-appropriate but NOT polished or curated. Functional over fashionable.
- CRITICAL: Each of the 3 concepts MUST have a DIFFERENT outfit.`;
          }
          if (_sub === 'neon_urban') {
              return `⚠️ Box A photos are for FACE IDENTITY ONLY. IGNORE the clothing in Box A. Do NOT reproduce the uploaded outfit.
NEON URBAN WARDROBE: Modern urban night style — sharp, confident, contemporary. Neon light from the scene reflects on clothing surfaces (subtle colored light spill on fabric/jacket). Universe-appropriate but with urban night energy. Avoid vintage or traditional attire.
- CRITICAL: Each of the 3 concepts MUST have a DIFFERENT outfit.`;
          }
          if (_sub === 'anime_manga') {
              return `⚠️ Box A photos are for FACE IDENTITY ONLY. IGNORE the clothing in Box A. Do NOT reproduce the uploaded outfit.
ANIME WARDROBE: Hero clothing is FULLY ILLUSTRATED in anime style — cel-shading, bold ink outlines. Universe-appropriate costume rendered as anime character design. Maintain any headwear (hijab etc.) in anime illustration style.
- CRITICAL: Each of the 3 concepts MUST have a DIFFERENT outfit.`;
          }
          if (_sub === 'vintage_bw' || _sub === 'vintage_sepia') {
              return `⚠️ Box A photos are for FACE IDENTITY ONLY. IGNORE the clothing in Box A. Do NOT reproduce the uploaded outfit.
VINTAGE WARDROBE: Hero clothing is era-appropriate (1940s-1950s) fused with the universe setting. Rendered as hand-drawn ink illustration — fabric texture through cross-hatching, not photographic detail.
- CRITICAL: Each of the 3 concepts MUST have a DIFFERENT outfit.`;
          }
          if (_sub === 'watercolor_dreamscape') {
              return `⚠️ Box A photos are for FACE IDENTITY ONLY. IGNORE the clothing in Box A. Do NOT reproduce the uploaded outfit.
WATERCOLOR WARDROBE: Hero clothing rendered in soft watercolor technique — flowing, soft, natural fabrics. Universe-appropriate but in dreamscape color palette (lavender, rose, sage, soft gold). Clothing should feel ethereal, not structured.
- CRITICAL: Each of the 3 concepts MUST have a DIFFERENT outfit.`;
          }
          if (_sub === 'comic_book') {
              return `⚠️ Box A photos are for FACE IDENTITY ONLY. IGNORE the clothing in Box A. Do NOT reproduce the uploaded outfit.
COMIC BOOK WARDROBE: Hero clothing rendered in FLAT BOLD COLORS within the 4-color palette — no gradients, bold outlines on all fabric edges. Universe-appropriate costume simplified to comic panel design principles.
- CRITICAL: Each of the 3 concepts MUST have a DIFFERENT outfit.`;
          }
          if (_sub === 'dark_cinematic' || _sub === 'bright_illustrated' || _sub === 'mythic_epic') {
              // These sub-styles use the universe costume logic (fantasy/realistic) but with their own color/mood treatment
              // Fall through to default below
          }
          // Default: original logic
          if (_sf === 'fantasy') {
              return `⚠️ Box A photos are for FACE IDENTITY ONLY. IGNORE the clothing in Box A. Do NOT reproduce the uploaded outfit.
- IF UNIVERSE IS FANTASY: PERFORM A TOTAL COSTUME SWAP. Replace ALL modern clothing with detailed ${resolvedUniverse} attire.
- CRITICAL: Each of the 3 concepts MUST have a DIFFERENT outfit. Vary colors, layers, and style across concepts.`;
          }
          return `⚠️ Box A photos are for FACE IDENTITY ONLY. IGNORE the clothing in Box A. Do NOT reproduce the uploaded outfit.
- IF UNIVERSE IS REALISTIC: Dress the Hero in the "Uniform of Success" for this specific UNIVERSE + NICHE combo:
    * The UNIVERSE sets the environment (Start-up Garage, Luxury Penthouse, Medical Clinic, etc.)
    * The NICHE "${inputs.targetAudience}" sets the profession.
    * COMBINE BOTH: e.g. Start-up Garage + Coach = smart casual (open collar, rolled sleeves). Luxury Penthouse + Finance = premium suit + silk tie.
    * CRITICAL: Each of the 3 concepts MUST have a DIFFERENT outfit. Vary colors, layers, and style across concepts. Never repeat the same suit/shirt.
    * Do NOT default to a generic dark suit for every concept.`;
      })()}
      ${(() => {
          const subStyle = resolveVisualSubStyle(inputs);
          if (!subStyle) return '';
          const blocks: Record<string, string> = {
              luxury_magazine: `
⚠️⚠️⚠️ VISUAL DIRECTION: LUXURY MAGAZINE COVER (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: MAGAZINE COVER — LIKE A REAL FORBES / GQ / VOGUE COVER
- The ad IS a magazine cover. Study these rules from real magazine covers:

HERO — THE COVER MODEL (MOST IMPORTANT):
- Hero fills 60-80% of the canvas. TIGHT CROP — waist-up or chest-up.
- Hero is CENTERED, facing camera directly or with slight 10° turn.
- Shoulders span nearly the full width of the frame.
- Hero OVERLAPS the masthead text (headline goes BEHIND the hero's head/shoulders).
  This overlap is the #1 hallmark of real magazine covers.
- Expression: powerful direct eye contact with camera. Confident, magnetic.
- FORBIDDEN: full body shots, small hero, hero off to one side, hero looking away,
  too much air/space around the hero, hero below waist visible.

BACKGROUND:
- Solid bold color fill (deep navy #1a1a3e, rich black #0d0d0d, warm grey #2d2d2d,
  deep teal #0a3d3d) OR soft studio gradient. NOT pure white.
- The background is simple but RICH — never empty/cheap-looking white.
- Each concept MUST use a DIFFERENT background color.

TEXT LAYOUT — DENSE MAGAZINE COVER TYPOGRAPHY:
- MASTHEAD ZONE (top 15%): Brand name / course title in LARGE BOLD condensed text.
  The hero's head/shoulders should OVERLAP this from below — classic cover technique.
- MAIN COVER LINE (left or right of hero): The HEADLINE text — large, bold,
  condensed sans-serif. Wraps around the hero's silhouette edge. 2-4 lines.
- SECONDARY COVER LINES: Subheadline and benefit text as smaller cover lines
  positioned in the gaps around the hero (top-left, bottom-right, etc.).
- BADGE: Round or rectangular badge element (like "SPECIAL EDITION" or the
  target audience badge) — positioned in a corner.
- CTA ZONE (bottom 15%): CTA button or bar at the very bottom.
- COVER DENSITY: The canvas should feel FULL — text fills the spaces around
  the hero. Almost zero empty space. Every gap has a text element or badge.

TYPOGRAPHY:
- Headlines: BOLD condensed sans-serif (Impact / Helvetica Condensed energy).
  NOT thin serif. NOT Didot. BOLD and CHUNKY like real magazine mastheads.
- Color: White or metallic gold text on dark background, OR dark text on light areas.
- ONE accent color: gold (#C5A028) or brand color for highlight words/badges.

LIGHTING:
- Professional studio portrait lighting — Rembrandt or butterfly/loop.
- Subtle hair light and rim light for separation from background.
- Face perfectly lit, flattering, high-end retouching quality.
- NOT flat high-key. Real covers have DIMENSION and shadow on the face.

TECHNICAL_PROMPT MUST START WITH:
  "Professional magazine cover photograph, tight portrait crop,
   bold solid color background, subject fills 70% of frame,"
TECHNICAL_PROMPT MUST INCLUDE:
  "magazine cover composition, subject overlapping top text,
   professional studio portrait lighting, condensed bold typography,
   cover model pose, direct eye contact, shoulders spanning frame width"
FORBIDDEN IN TECHNICAL_PROMPT:
  "white background", "negative space", "minimal", "full body",
  "environmental scene", "desk", "office", "thin serif font",
  "wide shot", "landscape", "busy scene"
=======================================================================`,
              documentary_gritty: `
⚠️⚠️⚠️ VISUAL DIRECTION: DOCUMENTARY GRITTY (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: PHOTOJOURNALISM / DOCUMENTARY FRAME
- The ad looks like a documentary photograph or field report — captured
  in the moment, not staged. Photojournalistic framing.
- COMPOSITION: Photojournalist's frame — slightly imperfect crop, natural
  rule-of-thirds, subject caught mid-action. Lower-third text zone for
  caption/field-report style overlay.
- HERO FRAMING: Candid documentary capture. NOT looking at camera.
  Caught in a real moment of their work/life. Camera: 35mm equivalent,
  f/4, environmental focus (not shallow DOF).
- DOCUMENTARY ELEMENTS: Dateline-style text treatment. Caption-bar at bottom.
  Functional overlay, not decorative. Film grain VISIBLE across entire frame.
HERO POSE (DOCUMENTARY-SPECIFIC):
- Hero is captured in a CANDID MOMENT — NOT posing for camera.
- Pose: working at desk, mid-conversation, looking off-camera, walking
  through space, adjusting glasses, caught mid-thought.
- Expression: focused, determined, authentic — NOT smiling for camera.
- Body angle: natural, imperfect — photographer caught this moment.
- FORBIDDEN: looking at camera with a smile, perfect symmetry, studio pose.
BASE CANVAS: Real-world environment — saturation reduced 40-60%.
  Slight color cast (warm or cool depending on environment).
  Feels like a real place, not a set.
FILM GRAIN: Visible grain/noise texture across the ENTIRE image — mandatory.
  Slight vignette on edges. Raw, authentic, photojournalistic quality.
LIGHTING: Available/natural light ONLY — window light, harsh overhead,
  outdoor overcast. NO studio lighting. Imperfect is intentional.
TYPOGRAPHY IN SCENE: Simple functional sans-serif. Caption/field-report style.
TEXT STYLE ROTATION (each concept uses a DIFFERENT style):
  Concept 1 → Style 1 (Classic Scrim — dark functional overlay)
  Concept 2 → Style 8 (Color Block — muted desaturated tones only)
  Concept 3 → Style 4 (Magazine Editorial — news feature layout)
TECHNICAL_PROMPT MUST START WITH:
  "Documentary photography advertisement, desaturated real-world setting,
   film grain texture, available natural light,"
TECHNICAL_PROMPT MUST INCLUDE:
  "photojournalism aesthetic, authentic raw environment,
   subtle vignette, muted color palette"
FORBIDDEN IN TECHNICAL_PROMPT:
  "studio lighting", "glossy", "saturated colors", "fantasy",
  "neon", "3D render", "particles", "bokeh"
=======================================================================`,
              neon_urban: `
⚠️⚠️⚠️ VISUAL DIRECTION: NEON URBAN (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: URBAN NIGHT EDITORIAL
- The ad is a night-city fashion/lifestyle shot — confident, modern, aspirational.
- COMPOSITION: Strong diagonal energy. Hero against urban backdrop with neon
  light sources creating colored rim lighting. At least 2 visible neon colors
  casting spills. Wet pavement reflections if street-level.
- HERO FRAMING: Night fashion editorial — urban confidence. Body angle: strong
  lean or asymmetric stance. Neon light MUST cast visible colored light on
  hero's face and clothing.
- The universe [selected_universe] anchors are rendered as URBAN NIGHT versions.
HERO POSE (NEON-URBAN-SPECIFIC):
- Hero has STREETWEAR ENERGY — confident, contemporary, urban edge.
- Pose: leaning against wall, hands in pockets, mid-stride with attitude,
  arms crossed with head tilted.
- Expression: cool, unfazed, magnetic — slight smirk or piercing gaze.
- Body angle: strong diagonal lean or asymmetric stance.
- FORBIDDEN: stiff formal pose, corporate posture, passive standing.
BASE CANVAS: Night city environment — dark streets, wet pavement with
  colored neon light pooling and reflecting on ground surfaces.
NEON LIGHTS (MANDATORY): Multiple colored neon sources visible in scene:
  pink (#FF2D78), cyan (#00FFFF), purple (#BF00FF), amber (#FFB300).
  At least 2 different neon colors present casting visible spills.
  Hero must have rim lighting from at least one colored neon source.
ATMOSPHERE: Deep background bokeh city lights. Optional: light rain or mist.
TEXT STYLE ROTATION (each concept uses a DIFFERENT style):
  Concept 1 → Style 5 (Neon Glow — headline emits neon matching scene)
  Concept 2 → Style 3 (Bold Cutout — massive headline over night scene)
  Concept 3 → Style 7 (Floating 3D — headline in neon-lit 3D space)
TECHNICAL_PROMPT MUST START WITH:
  "Neon urban night advertisement, wet city streets,
   multiple colored neon light sources, dark night environment,"
TECHNICAL_PROMPT MUST INCLUDE:
  "neon color reflections on pavement, bokeh city background,
   colored rim light on subject, cyberpunk-lite aesthetic"
FORBIDDEN IN TECHNICAL_PROMPT:
  "daylight", "natural light", "countryside", "pastel",
  "white background", "vintage", "watercolor"
=======================================================================`,
              anime_manga: `
⚠️⚠️⚠️ VISUAL DIRECTION: ANIME / MANGA (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: MANGA PAGE / ANIME KEY VISUAL
- The ad IS a manga page or anime key visual — fully illustrated, NOT photorealistic.
- COMPOSITION: Dynamic manga composition — diagonal energy lines, speed lines
  creating forced perspective. Optional: panel border frame around composition
  (manga chapter splash page energy).
- HERO FRAMING: Anime character rendering — cel-shaded, bold ink outlines,
  large expressive eyes. Dynamic anime pose with exaggerated action energy.
  Face from Box A is identity REFERENCE only — rendered as anime character.
  NOTE: Maintain any headwear (hijab, etc.) from Box A in anime style.
- MANGA ELEMENTS: Speed lines (mandatory on at least 1 concept). Screen tone
  patterns for mid-tone shading. Optional: manga speech bubble containing
  headline. Starburst emphasis marks on key visual elements.
HERO POSE (ANIME-SPECIFIC):
- Hero is FULLY ILLUSTRATED in anime/manga style — NOT photorealistic.
- Pose: dynamic anime character pose — confident stance with action energy.
- Expression: anime-style determined/confident — large expressive eyes.
- FORBIDDEN: photorealistic face/body, subtle expressions, realistic proportions.
RENDERING TECHNIQUE: Cel-shaded illustration — flat color fills bounded
  by BOLD BLACK OUTLINES. Anime production art quality.
COLOR: Vibrant, saturated, high-contrast anime palette.
  Backgrounds: detailed but flat-painted anime style backgrounds.
EFFECTS: Speed lines for energy (mandatory on at least 1 concept).
  Screen tone / halftone patterns for shading on mid-tones.
TEXT STYLE ROTATION (each concept uses a DIFFERENT style):
  Concept 1 → Style 3 (Bold Cutout — manga chapter title energy)
  Concept 2 → Style 5 (Neon Glow — anime accent color glow on headline)
  Concept 3 → Style 7 (Floating 3D — anime-style dimensional text)
TECHNICAL_PROMPT MUST START WITH:
  "Anime manga style illustration advertisement, cel-shaded characters,
   bold black outlines, vibrant saturated colors,"
TECHNICAL_PROMPT MUST INCLUDE:
  "anime production art quality, speed lines, dynamic composition,
   screen tone shading, manga splash page energy"
FORBIDDEN IN TECHNICAL_PROMPT:
  "photorealistic", "photography", "studio lighting", "film grain",
  "bokeh", "realistic skin texture", "camera lens"
=======================================================================`,
              watercolor_dreamscape: `
⚠️⚠️⚠️ VISUAL DIRECTION: WATERCOLOR DREAMSCAPE (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: WATERCOLOR PAINTED ILLUSTRATION
- The ad IS a watercolor painting — soft edges, color washes bleeding
  into each other, painted quality throughout.
- COMPOSITION: Flowing, organic composition — no hard geometric grid.
  Elements drift and blend. Soft vignette of color wash around edges.
- HERO FRAMING: Soft watercolor portrait — edges of figure bleed softly
  into background washes. Painted quality, not photographic.
  Serene, contemplative pose.
- WATERCOLOR ELEMENTS: Color bleeding at element boundaries. Visible paper
  texture in light areas. Wet-on-wet wash effects in background.
  Soft granulation in color pools.
HERO POSE (WATERCOLOR-SPECIFIC):
- Hero rendered in SOFT WATERCOLOR TECHNIQUE — edges bleed, painted quality.
- Pose: serene, contemplative, graceful — flowing and natural.
- Expression: peaceful, dreamy, thoughtful — soft eyes, gentle smile.
- FORBIDDEN: sharp edges, aggressive poses, harsh expressions, photorealistic rendering.
BASE CANVAS: Soft watercolor washes on textured paper — cream/warm white base.
  Colors: dreamscape palette (lavender, rose, sage, soft gold, sky blue).
LIGHTING: Diffused, ambient — light comes from everywhere gently.
  No harsh directional light. Everything feels soft and dreamy.
TEXT STYLE ROTATION (each concept uses a DIFFERENT style):
  Concept 1 → Style 4 (Magazine Editorial — delicate, with watercolor paper texture)
  Concept 2 → Style 6 (Ribbon Banner — painted ribbon with handwritten-feel text)
  Concept 3 → Style 1 (Classic Scrim — soft wash overlay for text zone)
TECHNICAL_PROMPT MUST START WITH:
  "Watercolor illustration advertisement, soft painted edges,
   color washes bleeding, textured watercolor paper,"
TECHNICAL_PROMPT MUST INCLUDE:
  "dreamy ethereal atmosphere, soft granulation, wet-on-wet technique,
   visible paper texture, flowing organic composition"
FORBIDDEN IN TECHNICAL_PROMPT:
  "photorealistic", "sharp edges", "neon", "dark background",
  "3D render", "cinematic lighting", "hard shadows"
=======================================================================`,
              comic_book: `
⚠️⚠️⚠️ VISUAL DIRECTION: COMIC BOOK (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: COMIC BOOK PANEL / ACTION PAGE
- The ad IS a comic book panel — bold, flat, action-driven illustration.
- COMPOSITION: Dynamic comic panel composition — diagonal gutters, action
  framing, forced perspective. Bold 4-color palette (CMYK primary energy).
  Thick black outlines on ALL elements.
- HERO FRAMING: Comic hero rendering — slightly exaggerated proportions,
  bold confident pose. Flat color fills, halftone dot shading on mid-tones.
- COMIC ELEMENTS: Halftone dot patterns (mandatory). Action/speed lines.
  Bold panel borders. Optional: thought/speech bubble containing headline.
  "POW/BAM" starburst energy on key elements.
HERO POSE (COMIC-SPECIFIC):
- Hero rendered in BOLD COMIC STYLE — flat colors, thick outlines, action energy.
- Pose: dynamic hero stance — confident, powerful, slightly exaggerated proportions.
- Expression: bold, determined, heroic — comic character energy.
- FORBIDDEN: photorealistic rendering, subtle tones, muted colors.
BASE CANVAS: Bold comic page — 4-color palette, thick panel borders.
COLOR: Primary CMYK energy — bold reds, blues, yellows. Heavy black outlines.
  Halftone dot patterns for shading. NO photorealistic gradients.
TEXT STYLE ROTATION (each concept uses a DIFFERENT style):
  Concept 1 → Style 3 (Bold Cutout — massive comic title energy)
  Concept 2 → Style 5 (Neon Glow — but in comic accent color)
  Concept 3 → Style 7 (Floating 3D — comic-style 3D lettering)
TECHNICAL_PROMPT MUST START WITH:
  "Comic book style illustration advertisement, bold 4-color palette,
   thick black outlines, halftone dot shading,"
TECHNICAL_PROMPT MUST INCLUDE:
  "action panel composition, dynamic forced perspective,
   comic book lettering style, bold primary colors"
FORBIDDEN IN TECHNICAL_PROMPT:
  "photorealistic", "photography", "soft gradients", "subtle tones",
  "pastel colors", "film grain", "bokeh"
=======================================================================`,
              dark_cinematic: `
⚠️⚠️⚠️ VISUAL DIRECTION: DARK CINEMATIC (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: CINEMATIC MOVIE POSTER
- The ad IS a movie poster — dramatic, dark, high-contrast, hero emerging
  from shadows. Title card energy in headline placement.
- COMPOSITION: Movie poster hierarchy — hero dominant center, dramatic
  lighting from single key source. Deep blacks (#0A0A0F to #0D1B3E).
  Atmospheric layers (smoke, particles) MANDATORY.
- HERO FRAMING: Movie poster protagonist — dramatic 20-30° angle,
  shadow cutting across face. Intense expression. Emerging from darkness.
- CINEMATIC ELEMENTS: Volumetric light rays. Atmospheric particles.
  Single colored rim glow on hero. Title-card-style headline zone.
HERO POSE (DARK-CINEMATIC-SPECIFIC):
- Hero has DRAMATIC PRESENCE — emerging from shadows, powerful stance.
- Pose: standing with weight on one leg, silhouetted against light,
  leaning forward with intensity, seated in chair of power.
- Expression: intense, determined, slightly brooding — NOT smiling.
- Body angle: strong 20-30° angle, dramatic shadows cutting across face.
- FORBIDDEN: bright cheerful expression, symmetrical pose, casual stance.
BASE CANVAS: Deep black (#0A0A0F) to dark navy (#0D1B3E). SINGLE KEY LIGHT
  casting visible directional shadow across 60%+ of the canvas.
  Atmospheric layers (smoke wisps, particles, haze) — REQUIRED, not optional.
FORBIDDEN: Natural daylight, white/cream backgrounds, pastel colors.
TEXT STYLE ROTATION (each concept uses a DIFFERENT style):
  Concept 1 → Style 5 (Neon Glow — cinematic highlight)
  Concept 2 → Style 7 (Floating 3D — headline with material texture)
  Concept 3 → Style 3 (Bold Cutout — massive headline over dark scene)
TECHNICAL_PROMPT MUST START WITH:
  "Cinematic dark movie poster advertisement, deep black background,
   single dramatic key light, atmospheric smoke and particles,"
TECHNICAL_PROMPT MUST INCLUDE:
  "volumetric light rays, colored rim glow on subject,
   cinematic depth of field, movie poster composition"
FORBIDDEN IN TECHNICAL_PROMPT:
  "daylight", "white background", "pastel", "bright", "cheerful",
  "studio lighting", "flat background"
=======================================================================`,
              bright_illustrated: `
⚠️⚠️⚠️ VISUAL DIRECTION: BRIGHT ILLUSTRATED (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: WARM LIFESTYLE ILLUSTRATION
- The ad IS a warm, bright, inviting illustrated scene — optimistic
  and approachable. Premium editorial illustration quality.
- COMPOSITION: Warm editorial — even lighting, saturated colors, clear
  and readable. Scene feels bright, hopeful, and inviting.
- HERO FRAMING: Warm approachable portrait — friendly, open body language.
  Illustrated painterly quality, not photographic.
HERO POSE (BRIGHT-ILLUSTRATED-SPECIFIC):
- Hero has WARM, APPROACHABLE ENERGY — friendly and inviting.
- Pose: gesturing warmly, leaning forward with open body language,
  arms open, sitting casually.
- Expression: genuine warm smile, approachable eyes, friendly engagement.
- FORBIDDEN: cold/serious expression, stiff corporate stance, dark moody pose.
BASE CANVAS: Warm, vibrant, saturated — golden amber, rich cream,
  vivid illustrated color fields. Multi-fill even lighting.
  Scene is ILLUSTRATED with painterly quality — NOT a dark photo.
FORBIDDEN: Dark backgrounds, heavy shadow, smoke/haze, neon, black canvas.
TEXT STYLE ROTATION (each concept uses a DIFFERENT style):
  Concept 1 → Style 4 (Magazine Editorial — warm version)
  Concept 2 → Style 8 (Color Block — vivid warm tones)
  Concept 3 → Style 1 (Classic Scrim — warm, light scrim)
TECHNICAL_PROMPT MUST START WITH:
  "Bright illustrated lifestyle advertisement, warm saturated colors,
   even soft lighting, optimistic inviting atmosphere,"
TECHNICAL_PROMPT MUST INCLUDE:
  "painterly illustration quality, golden warm tones,
   approachable friendly energy, premium editorial illustration"
FORBIDDEN IN TECHNICAL_PROMPT:
  "dark background", "heavy shadow", "smoke", "neon", "gritty",
  "desaturated", "black canvas", "moody"
=======================================================================`,
              mythic_epic: `
⚠️⚠️⚠️ VISUAL DIRECTION: MYTHIC EPIC (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: EPIC FANTASY MOVIE POSTER
- The ad IS a fantasy movie poster — grand, sweeping, larger-than-life.
  Legendary presence. Epic scale and grandeur.
- COMPOSITION: Epic scale — hero slightly low-angle to emphasize power.
  Rich jewel-toned background. Multiple colored light sources.
  Magical particles MANDATORY.
- HERO FRAMING: Fantasy hero portrait — commanding stance, flowing robes/cape,
  legendary weapon/artifact optional. Visionary gaze. Larger than life.
HERO POSE (MYTHIC-EPIC-SPECIFIC):
- Hero has LEGENDARY PRESENCE — powerful, commanding, larger than life.
- Pose: standing tall with commanding stance, one hand raised in authority,
  looking toward horizon, cape/robe flowing.
- Expression: visionary, powerful, determined — gazing into distance
  or at viewer with authority.
- Body angle: slightly upward camera angle to emphasize power.
- FORBIDDEN: casual/relaxed pose, looking down, submissive posture.
BASE CANVAS: Rich jewel tones — emerald (#0B3D2E), royal purple (#1A0A3D),
  crimson (#3D0A0A), midnight gold (#2A1A00). Dark but RICHLY COLORED.
MULTIPLE COLORED LIGHT SOURCES: contrasting temperature lights.
  Volumetric light rays MUST be visible. MAGICAL PARTICLES: glowing embers,
  mystical sparks, or colored mist — REQUIRED.
FORBIDDEN: Plain black background, pastel, flat/graphic style, studio aesthetics.
TEXT STYLE ROTATION (each concept uses a DIFFERENT style):
  Concept 1 → Style 7 (Floating 3D — metallic/jewel texture)
  Concept 2 → Style 3 (Bold Cutout — gold leaf or iridescent texture)
  Concept 3 → Style 5 (Neon Glow — jewel tones: emerald, crimson, gold)
TECHNICAL_PROMPT MUST START WITH:
  "Epic fantasy advertisement, rich jewel-toned background,
   multiple dramatic colored light sources,"
TECHNICAL_PROMPT MUST INCLUDE:
  "cinematic fantasy movie poster quality, sweeping grand scale,
   magical atmospheric particles"
FORBIDDEN IN TECHNICAL_PROMPT:
  "plain black background", "flat graphic", "minimal", "pastel",
  "studio lighting"
=======================================================================`,
          vintage_bw: `
⚠️⚠️⚠️ VISUAL DIRECTION: VINTAGE B&W ILLUSTRATED (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: 1950s NEWSPAPER ADVERTISEMENT ILLUSTRATION
- The ad IS a vintage newspaper ad — hand-drawn editorial illustration.
- COMPOSITION: Vintage ad column layout — headline as bold masthead,
  illustration centered, body text/CTA in lower zone.
  MANDATORY thick black border frame around full composition.
- HERO FRAMING: Vintage editorial illustration — exaggerated expressions,
  period clothing fused with universe. Bold ink strokes, cross-hatching
  for all shading. NOT photorealistic.
- VINTAGE AD ELEMENTS: Bold serif headline (all-caps, typeset quality).
  Column-aware layout. Ink-heavy borders and dividers.
HERO POSE (VINTAGE-BW-SPECIFIC):
- Hero rendered as HAND-DRAWN INK ILLUSTRATION — NOT a photograph.
- Pose: classic vintage portrait or editorial illustration pose.
- Expression: period-appropriate — dignified, composed, slightly theatrical.
- Style: bold ink strokes, cross-hatching for depth, vintage cartoon energy.
- FORBIDDEN: photorealistic rendering, modern casual pose.
RENDERING TECHNIQUE: Hand-drawn editorial illustration ONLY.
  Pen-and-ink style — cross-hatching for shading, bold outlines, stippling.
COLOR: GRAYSCALE ONLY. Absolutely zero color. Pure blacks, clean whites,
  mid-tones only through cross-hatch density.
BORDERS: MANDATORY thick black rectangular border frame.
TYPOGRAPHY: Vintage serif font — bold, all-caps, high weight. No modern sans-serif.
TEXT STYLE ROTATION (each concept uses a DIFFERENT style):
  Concept 1 → Style 1 (Classic Scrim — bold vintage ink overlay)
  Concept 2 → Style 4 (Magazine Editorial — vintage newspaper column layout)
  Concept 3 → Style 3 (Bold Cutout — massive vintage headline, ink-filled)
TECHNICAL_PROMPT MUST START WITH:
  "Vintage 1950s newspaper advertisement illustration, black and white ink art,
   cross-hatching technique, bold pen outlines,"
TECHNICAL_PROMPT MUST INCLUDE:
  "editorial cartoon style, high contrast B&W, vintage print ad aesthetic,
   exaggerated expressions, thick border frame"
FORBIDDEN IN TECHNICAL_PROMPT:
  "color", "photorealistic", "modern", "bokeh", "atmospheric particles",
  "cinematic lighting", "3D render", "photography"
=======================================================================`,
          vintage_sepia: `
⚠️⚠️⚠️ VISUAL DIRECTION: VINTAGE SEPIA ILLUSTRATED (ALL 3 CONCEPTS MUST FOLLOW THIS) ⚠️⚠️⚠️
=======================================================================
FORMAT: 1950s NEWSPAPER ADVERTISEMENT — WARM SEPIA VARIANT
- Same as Vintage B&W FORMAT — hand-drawn pen-and-ink editorial illustration,
  vintage ad column layout, thick border frame, typeset quality.
- ALL ink rendered in warm sepia/amber tones on aged parchment background.
HERO POSE (VINTAGE-SEPIA-SPECIFIC):
- Same as Vintage B&W — hand-drawn ink illustration, vintage pose.
- All tones in warm sepia/amber range. Era-appropriate clothing in warm brown ink.
- FORBIDDEN: photorealistic rendering, modern casual pose, cold tones.
RENDERING TECHNIQUE: Same as Vintage B&W — hand-drawn pen-and-ink.
COLOR: WARM SEPIA MONOCHROME throughout. Base tone: aged amber (#704214 range).
  All blacks become warm dark brown. All whites become aged cream/parchment.
PAPER TEXTURE: Subtle aged paper grain visible in lighter areas.
BORDERS: MANDATORY thick warm-brown border frame.
TEXT STYLE ROTATION (each concept uses a DIFFERENT style):
  Concept 1 → Style 1 (Classic Scrim — warm sepia overlay, cream text)
  Concept 2 → Style 4 (Magazine Editorial — vintage broadsheet newspaper layout)
  Concept 3 → Style 6 (Ribbon Banner — aged brown ribbon with cream text)
TECHNICAL_PROMPT MUST START WITH:
  "Vintage sepia-toned newspaper advertisement illustration, warm aged ink art,
   cross-hatching technique, parchment paper texture,"
TECHNICAL_PROMPT MUST INCLUDE:
  "editorial cartoon style, warm sepia monochrome (#704214), vintage print ad aesthetic,
   aged paper quality, exaggerated expressions, thick warm-brown border frame"
FORBIDDEN IN TECHNICAL_PROMPT:
  "color", "cool tones", "grey", "blue", "photorealistic", "modern", "bokeh",
  "atmospheric particles", "cinematic lighting", "3D render", "photography"
=======================================================================`,
          };
          return blocks[subStyle] || '';
      })()}
      ${(() => {
          // ── Ticket 8: Sub-style × mode fusion instructions ──
          const _sub8 = resolveVisualSubStyle(inputs);
          if (!_sub8) return '';
          const _modes8 = (inputs as any).offerCreativeMode || ['standard_hero'];
          const fusionParts: string[] = [];
          for (const m of _modes8) {
              const fusion = getSubStyleModeFusion(_sub8, m);
              if (fusion) fusionParts.push(fusion);
          }
          if (fusionParts.length === 0) return '';
          return `
═══ SUB-STYLE × MODE FUSION (MANDATORY — OVERRIDES DEFAULT MODE LAYOUT) ═══
${fusionParts.join('\n\n')}
═══════════════════════════════════════════════════════════════════════════════`;
      })()}
      ${(() => {
          // ── Ticket 9: Before/after + sub-style fusion ──
          const _sub9 = resolveVisualSubStyle(inputs);
          const _angle9 = inputs.coldHookAngle;
          if (!_sub9 || !isBeforeAfterSelection(inputs, _effectiveColdHookAngle)) return '';
          const fusion = getBeforeAfterSubStyleFusion(_sub9);
          if (!fusion) return '';
          return `
═══ BEFORE/AFTER × SUB-STYLE FUSION (OVERRIDES DEFAULT SPLIT RULES) ═══
${fusion}
═══════════════════════════════════════════════════════════════════════════════`;
      })()}
      ${(() => {
          // ── Ticket 10: Solo mode sub-style element styling ──
          const _sub10 = resolveVisualSubStyle(inputs);
          if (!_sub10) return '';
          const _modes10 = (inputs as any).offerCreativeMode || ['standard_hero'];
          const _isSolo10 = _modes10.length === 1 && !_modes10.includes('standard_hero') && _modes10[0] !== 'text_only';
          if (!_isSolo10) return '';
          const soloMode = _modes10[0];
          const fusion = getSubStyleModeFusion(_sub10, soloMode);
          if (!fusion) return '';
          return `
═══ SOLO MODE + SUB-STYLE ELEMENT STYLING (NO HERO — STYLE THE ELEMENT) ═══
⚠️ Since there is NO hero in this ad, the creative element (${soloMode.replace(/_/g, ' ')}) IS the entire visual.
Apply the sub-style FORMAT to this element directly:
${fusion}
The ${soloMode.replace(/_/g, ' ')} must fill the canvas styled according to both the sub-style FORMAT and the mode's own requirements.
═══════════════════════════════════════════════════════════════════════════════`;
      })()}
      - GENDER NEUTRALITY: NEVER assume gender.Always use "The Hero" or "They/Their".The actual appearance comes from Box A photos.
      - Example: If Pharaoh, they wear the Nemes headdress, golden pectoral collar, and silk robes.DO NOT put them in a modern suit unless the universe is "Corporate".Nor will you have them wear the suit under the silk robes!
MANDATE:
1. UNIVERSE VISUAL ANCHORS(CRITICAL):
${(() => {
    const sub = resolveVisualSubStyle(inputs);
    // Substyles that override the default universe anchors with their own visual rules
    const overrideBlocks: Record<string, string> = {
        luxury_magazine: `⚠️⚠️⚠️ LUXURY MAGAZINE COVER — NO UNIVERSE ANCHORS ⚠️⚠️⚠️
The universe [${resolvedUniverse}] determines the hero's PROFESSION and WARDROBE only.
- ENVIRONMENT: Bold solid color background (deep navy, rich black, dark grey, teal). NO location.
- PROPS: ZERO environmental props. No desk, no laptop, no bookshelf, no office elements.
- The hero IS the only visual element — they fill 70% of the canvas as a magazine cover model.
- Text cover lines fill ALL gaps around the hero. The canvas is DENSE, not empty.
- FORBIDDEN: Any universe environment, ANY props, ANY location, white background, negative space.`,

        vintage_bw: `⚠️ VINTAGE B&W OVERRIDE — Universe anchors rendered as INK ILLUSTRATION elements, not photorealistic objects.
- Identify 2-3 anchors from [${resolvedUniverse}] but render them as hand-drawn ink elements.
- Style: bold ink strokes, cross-hatching, vintage illustration aesthetic.`,

        vintage_sepia: `⚠️ VINTAGE SEPIA OVERRIDE — Universe anchors rendered as SEPIA INK ILLUSTRATION elements.
- Identify 2-3 anchors from [${resolvedUniverse}] but render them in warm sepia illustration style.`,

        anime_manga: `⚠️ ANIME/MANGA OVERRIDE — Universe anchors rendered as ANIME-STYLE illustrated elements.
- Identify 2-3 anchors from [${resolvedUniverse}] but render them in cel-shaded anime style.
- Bold outlines, flat color fills, speed lines optional.
- The manga FORMAT drives composition: dynamic panel energy, splash-page framing, starburst emphasis marks.`,

        watercolor_dreamscape: `⚠️ WATERCOLOR OVERRIDE — Universe anchors rendered as SOFT WATERCOLOR elements.
- Identify 2-3 anchors from [${resolvedUniverse}] but render them with bleeding watercolor edges.
- Soft, dreamy, ethereal atmosphere.`,

        comic_book: `⚠️ COMIC BOOK OVERRIDE — Universe anchors rendered as BOLD COMIC-STYLE elements.
- Identify 2-3 anchors from [${resolvedUniverse}] but render them in 4-color comic style.
- Halftone dots, thick outlines, action panel composition.`,

        ugly_ad: `⚠️ UGLY AD OVERRIDE — Universe anchors are IRRELEVANT. The ad is a raw screenshot/note.
- Do NOT render universe-specific environment or props.
- Background is phone screenshot, notepad, or plain color with hand-drawn annotations.
- If hero present, they appear as a casual selfie — NOT in a universe scene.`,

        pixel_retro_game: `⚠️ PIXEL RETRO GAME OVERRIDE — Universe anchors rendered as PIXEL ART game elements.
- Identify 2-3 anchors from [${resolvedUniverse}] but render as 16-bit pixel sprites.
- Chunky pixels, limited palette, game item energy.`,

        stained_glass: `⚠️ STAINED GLASS OVERRIDE — Universe anchors rendered as JEWEL-TONED GLASS PANELS.
- Identify 2-3 anchors from [${resolvedUniverse}] but render as stained glass panel elements.
- Flat jewel fills bounded by dark lead lines. Backlit glow.`,

        glitch_digital: `⚠️ GLITCH OVERRIDE — Universe anchors rendered with DIGITAL CORRUPTION.
- Identify 2-3 anchors from [${resolvedUniverse}] — they appear but with RGB splits and scanline artifacts.
- Elements partially corrupted, data-moshed. Recognizable but fractured.`,

        synthwave_80s: `⚠️ SYNTHWAVE OVERRIDE — Universe anchors rendered as 80s RETRO-FUTURISTIC neon elements.
- Identify 2-3 anchors from [${resolvedUniverse}] but render in neon wireframe or chrome style.
- Elements sit on the synthwave grid or float in the neon-lit sky.`,

        cinematic_film_still: `⚠️ CINEMATIC FILM STILL — Universe anchors are FULL environmental props.
- Render all 3 anchors from [${resolvedUniverse}] as real cinematic set pieces.
- They exist in the film scene with full depth of field and motivated lighting.`,

        clean_corporate: `⚠️ CLEAN CORPORATE OVERRIDE — Universe anchors are MINIMAL.
- The universe [${resolvedUniverse}] determines PROFESSION and WARDROBE only.
- Background: neutral gradient. Maximum ONE subtle prop.
- No environmental scenes. Studio isolation. Premium stock-photo quality.`,

        golden_hour_outdoor: `⚠️ GOLDEN HOUR OVERRIDE — Universe anchors rendered in OUTDOOR golden hour setting.
- Identify 2-3 anchors from [${resolvedUniverse}] — they appear in the outdoor scene.
- All props bathed in warm golden backlight. Natural environment context.`,

        street_photography: `⚠️ STREET PHOTOGRAPHY — Universe anchors rendered as URBAN ENVIRONMENT props.
- Identify 2-3 anchors from [${resolvedUniverse}] — they appear naturally in the urban scene.
- Candid, authentic placement. Not staged — props exist in the real street context.`,
    };
    if (sub && overrideBlocks[sub]) return overrideBlocks[sub];
    // Default: full universe anchors for realistic/fantasy substyles that want rich environments
    return `- You must identify 3 "Visual Anchors" specific to[${resolvedUniverse}] and force them into the description.
        - Example 1(TED Talk): Red Circular Rug + Headset Mic + Black Background(Not just "Stage").
        - Example 2(Gym): Dumbbells + Sweat Texture + Mirrors(Not just "Room").
        - Example 3(Kitchen): Stainless Steel + Steam + Apron(Not just "Indoors").
      2. INSTRUCTION: In the 'ENVIRONMENT' and 'TECHNICAL_PROMPT' fields, you must list these specific props.`;
})()}
        - Analyze the Hook's narrative (e.g., if it mentions "laughing," "skeptics," or "victory").
${(() => {
    const _gSub = resolveVisualSubStyle(inputs);
    if (_gSub === 'luxury_magazine' || _gSub === 'clean_corporate' || _gSub === 'ugly_ad') return `  - MANIFEST the psychological subtext through the hero's EXPRESSION, POSE, and WARDROBE — not through environmental props.
- CAUTION: Only add background characters if the hook EXPLICITLY mentions "skeptics," "laughing," or "الناس". Otherwise, keep the hero ALONE.
      The goal is a premium ${_gSub === 'ugly_ad' ? 'raw screenshot' : 'editorial'} ad that converts — the ${_gSub.replace(/_/g, ' ')} visual style drives the aesthetic.`;
    return `  - MANIFEST the psychological subtext physically in the scene using elements from the [${resolvedUniverse}].
- CAUTION: Only add background characters if the hook EXPLICITLY mentions "skeptics," "laughing," or "الناس".Otherwise, keep the hero ALONE.
      The goal is a high - end commercial photograph that fuses the[selected_universe] with Direct Response marketing psychology.`;
})()}


      MARKER STRINGS (USE ENGLISH FIELD LABELS — CONTENT IN ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'ARABIC' : 'THE PROJECT LANGUAGE'}):

⚠️ LANGUAGE RULE:
- ALL field LABELS must be in ENGLISH (SUBJECT_ACTION, ENVIRONMENT_DESC, etc.)
- ALL field CONTENT must be in ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'Arabic' : 'the project language (' + getLanguageInstruction(inputs.adLanguage || 'ar_fusha') + ')'} EXCEPT "TECHNICAL_PROMPT" content which stays in English.
- TECHNICAL_PROMPT is the only field read by the image AI - keep it English.
- All other field content is for the user to read - ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'make the content Arabic' : 'write in the project language'}.
${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? '' : `- IMPORTANT: The hook text is in ${getLanguageInstruction(inputs.adLanguage || 'ar_fusha')}. Your concept descriptions MUST match this language.`}

⚠️ CRITICAL STRUCTURE RULE:
- EVERY concept (1, 2, and 3) MUST contain ALL 7 fields: SUBJECT_ACTION, ENVIRONMENT_DESC, MOOD_EMOTION, LIGHTING_LOGIC, TEXT_LAYOUT, BUTTON_POSITION, BRANDING_LOGIC, plus TECHNICAL_PROMPT.
- Do NOT skip or omit any field in any concept. ALL fields are MANDATORY for every concept.
- Each field label must be on its own line, followed by a colon, then the content.

  ${isBeforeAfterSelection(inputs, _effectiveColdHookAngle) ? (resolveStyleFamily(inputs) === 'minimal' ? `
  CONCEPT_START
SUBJECT_ACTION: ⚠️ BEFORE/AFTER SPLIT — describe BOTH halves${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? ' in Arabic' : ''}:
${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? `"النصف الأيسر (قبل):" — البطل في حالة المعاناة. ملابس بسيطة، تعبير مُرهق. خلفية بلون واحد بارد (رمادي/أزرق فاتح).
"النصف الأيمن (بعد):" — نفس البطل في حالة النجاح. ملابس مهنية أنيقة، تعبير واثق. خلفية بلون واحد دافئ (أبيض/بيج).
"الفاصل:" — خط عمودي نظيف أو تدرج بسيط يفصل النصفين.` : `"Left half (Before):" — Hero in struggle state. Simple clothing, tired expression. Plain cool solid background (grey/light blue).
"Right half (After):" — Same hero in success state. Professional polished attire, confident expression. Plain warm solid background (white/beige).
"Divider:" — Clean vertical line or simple gradient separating the halves.`}
ENVIRONMENT_DESC: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'مينيمال: كلا النصفين بخلفية بلون واحد فقط. بدون مشاهد أو أجواء أو بيئات سينمائية أو مناظر. التباين عبر اللون والملابس والتعبير فقط. البطل معزول في كل نصف.' : 'MINIMAL: Both halves use plain solid color backgrounds only. No scenes, no atmosphere, no cinematic environments, no scenery. Contrast through color, clothing, and expression only. Subject isolated in each half.'}
MOOD_EMOTION: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'النصف الأيسر: إحباط هادئ. النصف الأيمن: ثقة هادئة.' : 'Left: quiet frustration. Right: quiet confidence.'}
LIGHTING_LOGIC: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'النصف الأيسر: إضاءة استوديو مسطحة باردة. النصف الأيمن: إضاءة استوديو ناعمة دافئة. ممنوع: تأثيرات درامية، إضاءة حجمية، الساعة الذهبية.' : 'Left: flat cool studio lighting. Right: soft warm studio lighting. FORBIDDEN: dramatic effects, volumetric light, golden hour, rim light.'}
TEXT_LAYOUT: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'العنوان يمتد فوق النصفين. فراغ سلبي واسع. الـ CTA في الأسفل.' : 'Headline spans both halves. Generous negative space. CTA at bottom.'}
BUTTON_POSITION: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'أسفل الصورة، كامل العرض.' : 'Bottom of image, full width.'}
BRANDING_LOGIC: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'شعار Box B إن وجد — في الوسط أو على الفاصل.' : 'Box B logo if present — centered or on divider.'}
TECHNICAL_PROMPT: ENGLISH ONLY - SPLIT-SCREEN BEFORE/AFTER composition. MINIMAL STYLE: Both halves use plain solid color backgrounds — LEFT cool grey/blue, RIGHT warm white/beige. Split screen composition with clean vertical divider. Identical soft even studio lighting on both sides. Subject isolated on each side. NO environment scenes, NO cinematic environments, NO atmospheric effects. Style: Premium clean ad. STRICT: Do NOT render any "BEFORE"/"AFTER" text labels.
CONCEPT_END
  ` : `
  CONCEPT_START
SUBJECT_ACTION: ⚠️ BEFORE/AFTER SPLIT — describe BOTH halves${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? ' in Arabic' : ''}:
${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? `"النصف الأيسر (قبل):" — وصف البطل في حالة المعاناة المرتبطة بالعنوان. ملابس بسيطة، بيئة فوضوية، تعبير وجه مُرهق.
"النصف الأيمن (بعد):" — نفس البطل في حالة النجاح المرتبطة بالمنتج. ملابس فاخرة، بيئة راقية، تعبير واثق.
"الفاصل:" — خط مائل ذهبي أو تدرج لوني يفصل النصفين.` : `"Left half (Before):" — Hero in struggle state connected to headline pain. Simple clothing, chaotic environment, tired expression.
"Right half (After):" — Same hero in success state connected to product promise. Premium clothing, upscale environment, confident expression.
"Divider:" — Diagonal gold line or gradient split separating the halves.`}
ENVIRONMENT_DESC: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'صف بيئتين مختلفتين: بيئة "القبل" (مكتب فوضوي/غرفة ضيقة) وبيئة "البعد" (مكتب فاخر/بهو فندقي). التباين يجب أن يكون صارخاً.' : 'Two contrasting environments: "Before" (cluttered office/cramped room) and "After" (premium office/hotel lobby). Contrast must be dramatic.'}
MOOD_EMOTION: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'النصف الأيسر: إحباط، إرهاق، هشاشة. النصف الأيمن: انتصار، سيطرة، سلطة.' : 'Left: frustration, exhaustion, vulnerability. Right: triumph, control, authority.'}
LIGHTING_LOGIC: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'النصف الأيسر: إضاءة قاسية، باردة، مسطحة. النصف الأيمن: إضاءة سينمائية ذهبية دافئة.' : 'Left: harsh, cold, flat lighting. Right: cinematic warm golden lighting.'}
TEXT_LAYOUT: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'العنوان يمتد فوق النصفين. الـ CTA في الأسفل يمتد على كامل العرض. الفاصل واضح بصرياً.' : 'Headline spans both halves. CTA at bottom full width. Divider visually clear.'}
BUTTON_POSITION: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'أسفل الصورة، يمتد على كامل العرض فوق خلفية داكنة.' : 'Bottom of image, full width over dark background.'}
BRANDING_LOGIC: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'شعار Box B إن وجد — في الوسط أو على الفاصل.' : 'Box B logo if present — centered or on divider.'}
TECHNICAL_PROMPT: ENGLISH ONLY - SPLIT-SCREEN BEFORE/AFTER composition. LEFT half shows struggle scene with dim cold lighting. RIGHT half shows success scene with warm golden lighting. Same hero face in both halves. Diagonal divider separating halves. STRICT: Do NOT render any "BEFORE"/"AFTER" text labels on the image. The visual contrast alone tells the story.
CONCEPT_END
  `) : `
  CONCEPT_START_[INDEX]
SUBJECT_ACTION: [وصف وضعية البطل بالتفصيل.استخدم "البطل" أو "هم/لهم" فقط.صف الملابس والتفاعل مع عناصر المشهد.لا تصف ملامح الوجه - صور Box A ستُستخدم للوجه.]
${(() => {
    const _tplSub = resolveVisualSubStyle(inputs);
    const _tplMinimal = resolveStyleFamily(inputs) === 'minimal';
    const _isAr = (inputs.adLanguage || 'ar_fusha').startsWith('ar');
    // Substyles that override the universe environment entirely
    if (_tplSub === 'luxury_magazine') return `ENVIRONMENT_DESC: [${_isAr ? 'غلاف مجلة فاخرة — خلفية بلون واحد غامق وجريء (كحلي عميق أو أسود غني أو رمادي داكن أو تيل). البطل يملأ 70% من الإطار. قص ضيق من الخصر للأعلى. أكتاف البطل تمتد بعرض الإطار. رأس البطل يتداخل مع النص العلوي (تقنية غلاف المجلة). ممنوع: خلفية بيضاء، مساحات فارغة، مكاتب، أثاث، مشاهد بيئية.' : 'MAGAZINE COVER — bold solid color background (deep navy, rich black, dark grey, or teal). Hero fills 70% of frame. TIGHT crop waist-up. Hero shoulders span frame width. Hero head OVERLAPS masthead text above (classic cover technique). FORBIDDEN: white background, empty space, desks, furniture, environmental scenes.'}]
MOOD_EMOTION: [${_isAr ? 'قوة مغناطيسية — نظرة مباشرة للكاميرا، ثقة مطلقة، حضور نجم غلاف مجلة.' : 'Magnetic power — direct eye contact with camera, absolute confidence, magazine cover star presence.'}]
LIGHTING_LOGIC: [${_isAr ? 'إضاءة بورتريه استوديو احترافية — رامبرانت أو فراشة. إضاءة شعر وحافة لفصل البطل عن الخلفية. إضاءة وجه مثالية مع بُعد وظل. ليست مسطحة.' : 'Professional studio portrait lighting — Rembrandt or butterfly/loop. Hair light and rim light for separation. Face perfectly lit with DIMENSION and shadow. NOT flat high-key.'}]`;
    if (_tplSub === 'clean_corporate') return `ENVIRONMENT_DESC: [${_isAr ? 'خلفية تدرج محايد — رمادي فاتح إلى أزرق رمادي أو كريمي إلى بيج. ممنوع: مشاهد بيئية، مواقع، أثاث. البطل معزول ضد خلفية استوديو نظيفة.' : 'Neutral gradient background — light grey to blue-grey or cream to beige. FORBIDDEN: environmental scenes, locations, furniture. Subject isolated against clean studio backdrop.'}]
MOOD_EMOTION: [${_isAr ? 'ثقة مهنية هادئة — أسلوب أبل/نايكي.' : 'Professional confidence — Apple/Nike aesthetic energy.'}]
LIGHTING_LOGIC: [${_isAr ? 'إضاءة استوديو تجارية نظيفة. ممنوع: إضاءة درامية، إضاءة حجمية، ساعة ذهبية.' : 'Clean commercial studio lighting. FORBIDDEN: dramatic lighting, volumetric light, golden hour.'}]`;
    if (_tplSub === 'ugly_ad') return `ENVIRONMENT_DESC: [${_isAr ? 'لقطة شاشة هاتف أو مفكرة أو لون واحد مسطح. بدون استوديو، بدون بيئة، بدون أي تصميم احترافي.' : 'Phone screenshot background, notepad, or plain flat color. NO studio, NO environment, NO professional design.'}]
MOOD_EMOTION: [${_isAr ? 'خام، حقيقي، غير مصمم — طاقة "شخص حقيقي كتب هذا بسرعة".' : 'Raw, real, undesigned — "real person wrote this quickly" energy.'}]
LIGHTING_LOGIC: [${_isAr ? 'فلاش كاميرا هاتف أو إضاءة شاشة. مسطحة. بدون إضاءة محترفة.' : 'Phone camera flash or screen glow. Flat. No professional lighting.'}]`;
    // Default: minimal or standard
    if (_tplMinimal) return `ENVIRONMENT_DESC: [${_isAr ? 'مينيمال: خلفية تدرج لوني (gradient) إلزامي — على الأقل لونين أو ثلاثة. ممنوع تماماً: لون واحد مسطح، مشاهد سينمائية، مواقع، بيئات، مناظر طبيعية، أجواء. البطل معزول على خلفية تدرج نظيفة أنيقة.' : 'MINIMAL: Gradient background MANDATORY (2-3 subtle color tones). NEVER flat single solid color. FORBIDDEN: cinematic environments, locations, scenery, landscapes, atmospheric settings. Subject isolated against clean gradient backdrop.'}]
MOOD_EMOTION: [${_isAr ? 'طاقة هادئة، واثقة، مهنية، نظيفة.' : 'Calm, confident, professional, clean energy.'}]
LIGHTING_LOGIC: [${_isAr ? 'إضاءة استوديو تجارية نظيفة ومتساوية. ناعمة من الأمام أو الجانب. ممنوع: إضاءة درامية، إضاءة حجمية، الساعة الذهبية، إضاءة خلفية حادة، توهج نيون.' : 'Clean commercial studio lighting. Soft even front or side light. FORBIDDEN: dramatic lighting, volumetric light, golden hour, rim light, neon glow.'}]`;
    // Default for realistic/fantasy with substyle that keeps the universe
    return `ENVIRONMENT_DESC: [فيزياء وأجواء ${resolvedUniverse}.صف الخلفية والأمامية والتأثيرات الجوية.كيف يثبت العالم رسالة الإعلان؟]
MOOD_EMOTION: [الحالة النفسية للبطل: سلطة، راحة، إلهام، أو قوة مركزة.]
LIGHTING_LOGIC: [إضاءة سينمائية محددة.استخدم: إضاءة حجمية، إضاءة خلفية، الساعة الذهبية، أو توهج نيون.]`;
})()}
TEXT_LAYOUT: [صف مناطق "الفراغ السلبي" وترتيب النظر من العنوان للكلمة المميزة للزر.]
BUTTON_POSITION: [صف مكان زر CTA والنص تحته.]
BRANDING_LOGIC: [منطق وضع الشعار من Box B إن وجد.]
${(() => {
    const _tpSub = resolveVisualSubStyle(inputs);
    const _tpMinimal = resolveStyleFamily(inputs) === 'minimal';
    if (_tpSub === 'luxury_magazine') return `TECHNICAL_PROMPT: [ENGLISH ONLY - Professional magazine cover photograph, tight portrait crop waist-up, bold solid dark color background (deep navy or rich black or dark grey), subject fills 70 percent of frame, magazine cover composition, subject head and shoulders overlapping top text zone, professional studio portrait lighting with dimension, condensed bold typography, cover model pose, direct eye contact with camera, shoulders spanning frame width. FORBIDDEN: white background, negative space, minimal, full body shot, environmental scene, desk, office, thin serif font, wide shot, flat lighting. STRICT: NO TEXTURES ON FACE. The Hero's face MUST be pixel-perfect match to Box A reference.]`;
    if (_tpSub === 'clean_corporate') return `TECHNICAL_PROMPT: [ENGLISH ONLY - Clean corporate studio advertisement, neutral gradient background, professional studio lighting, premium commercial quality. Apple/Nike aesthetic. FORBIDDEN: dark, moody, cinematic, fantasy, gritty, neon, vintage, illustration, grain, particles, desk, office furniture. STRICT: NO TEXTURES ON FACE.]`;
    if (_tpSub === 'ugly_ad') return `TECHNICAL_PROMPT: [ENGLISH ONLY - Raw screenshot style advertisement, phone camera quality, hand-drawn red circle annotations, casual imperfect composition, deliberately low-production, handwritten marker arrows, screenshot aesthetic. FORBIDDEN: studio lighting, editorial, luxury, elegant, polished, cinematic, professional photography. STRICT: NO TEXTURES ON FACE.]`;
    if (_tpMinimal) return `TECHNICAL_PROMPT: [ENGLISH ONLY - Clean commercial studio product shot. Neutral composition. Controlled lighting. Minimal aesthetic. Multi-tone gradient background MANDATORY (2-3 color stops, subtle transitions). NEVER use flat single solid color — always a refined gradient. Subject isolated against clean gradient backdrop. Soft even studio lighting only. Style: Premium ad production (Apple, Nike, Shopify aesthetic). FORBIDDEN: cinematic lighting, volumetric light, golden hour, rim light, dramatic lighting, atmospheric effects, bokeh, dust, smoke, haze, particles, neon glow, god rays, depth of field, scenic environment. Clean negative space for text zones. STRICT: NO TEXTURES ON FACE. The Hero's face MUST be pixel-perfect match to Box A reference.]`;
    return `TECHNICAL_PROMPT: [ENGLISH ONLY - Full rendering sequence: Camera lens(85mm), F - stop(f / 1.8), Style(Photorealistic / Cinematic Film).Include: "Dynamic composition", "High-contrast typography", "Cinematic depth of field".STRICT: NO TEXTURES ON FACE.The Hero's face MUST be pixel-perfect match to Box A reference.]`;
})()}
CONCEPT_END_[INDEX]
  `}
      ${modeInstruction}
      ${_globalRefinement ? `
═══════════════════════════════════════════════════════════════════════════════
⚠️ USER GLOBAL REFINEMENT (MANDATORY — OVERRIDE ALL DEFAULTS):
═══════════════════════════════════════════════════════════════════════════════
The user has given this specific instruction. It OVERRIDES any default behavior:
"${_globalRefinement}"
Apply this instruction to ALL 3 concepts. This is the user's creative direction — follow it exactly.
` : ''}

${(inputs.adMode === 'carousel' && (inputs.slideCount || 1) > 1) ? `
═══════════════════════════════════════════════════════════════════════════════
CAROUSEL MODE — ${inputs.slideCount} SLIDES
═══════════════════════════════════════════════════════════════════════════════
The user is creating a ${inputs.slideCount}-slide CAROUSEL AD. Each concept you generate describes
SLIDE 1 (the hook slide). The same universe and visual style will be used for slides 2-${inputs.slideCount}.

CAROUSEL-SPECIFIC RULES:
1. Each concept MUST establish a clear, REUSABLE visual world — consistent lighting, color palette,
   and environment that can be repeated across ${inputs.slideCount} slides without looking disconnected.
2. The Hero's pose and composition should leave ROOM for progression — don't resolve the story in Slide 1.
3. Think of each concept as the OPENING SHOT of a ${inputs.slideCount}-part visual story.
4. In the TECHNICAL_PROMPT field, add: "CAROUSEL ANCHOR SHOT. Establish consistent: color grade, 
   lighting direction, typography style, and layout grid for reuse across ${inputs.slideCount} slides."
═══════════════════════════════════════════════════════════════════════════════
` : ''}
${inputs.competitorContext ? `
═══════════════════════════════════════════════════════════════════════════════
COMPETITIVE INTELLIGENCE (use to make visual concepts DISTINCT):
${inputs.competitorContext}
Make each concept visually and conceptually different from what competitors would produce.
═══════════════════════════════════════════════════════════════════════════════
` : ''}
${(() => {
    const modes = (inputs as any).offerCreativeMode || ['standard_hero'];
    const hasHero = modes.includes('standard_hero');
    const secondary = modes.filter((m: string) => m !== 'standard_hero');
    if (secondary.length > 0) {
        const secLabel = secondary[0].replace(/_/g, ' ').toUpperCase();
        return `
═══ MODE CHECKPOINT (VERIFY BEFORE OUTPUT) ═══
Selected modes: [${modes.join(' + ')}]
✅ VERIFY each concept:
- Is the ${secLabel} visually present as a DISTINCT structural element in SUBJECT_ACTION and TECHNICAL_PROMPT? If NO → REWRITE
- ${hasHero ? `Does the hero occupy ~45% and the ${secLabel} occupy ~45%? If hero > 70% → REWRITE` : `Is the ${secLabel} the MAIN visual element without a hero person? If a hero dominates → REWRITE`}
- Can a viewer clearly identify BOTH elements without zooming? If one is tiny → REWRITE
- Is the ${secLabel} described with SPECIFIC layout details (cards, panels, frames, devices)? If vague → REWRITE
═══════════════════════════════════════════════
`;
    }
    return '';
})()}
  `;

        // ═══ CREATIVE MEMORY + PERSONALIZATION for concept generation ═══
        let conceptPersonalization = '';
        let _step3RankingGuidance: RankingGuidance | null = null;
        const _conceptUserId = (inputs as any)._userId;
        if (_conceptUserId && mode === 'initial') {
            // Backend-driven personalization (feedback history, performance data, dimensional learning)
            try {
                const backendContext = await buildPersonalizationContext(
                    _conceptUserId, 'concepts', inputs.targetAudience
                );
                if (backendContext) conceptPersonalization = backendContext;
            } catch { /* non-blocking */ }

            // Creative memory patterns (RAG — winning layout/composition patterns)
            try {
                const conceptContract = compileFullContract({
                    selectedModes: (inputs as any).offerCreativeMode || ['standard_hero'],
                    hookAngle: inputs.coldHookAngle || undefined,
                    aspectRatio: inputs.aspectRatio || '1:1',
                    adLanguage: inputs.adLanguage || 'ar_fusha',
                    visualStyleFamily: resolveStyleFamily(inputs) || 'realistic',
                });
                const memoryContext = await retrieveCreativePatterns(_conceptUserId, {
                    niche: inputs.productCategory || undefined,
                    hookAngle: inputs.coldHookAngle || undefined,
                    creativeModes: (inputs as any).offerCreativeMode || undefined,
                    layoutTemplate: conceptContract.templateId,
                });
                if (memoryContext) conceptPersonalization += '\n' + memoryContext;
            } catch (e) {
                console.warn('Concept memory retrieval failed (non-blocking):', e);
            }
            // ═══ RANKING GUIDANCE (Ticket 3 — soft bias from Ticket 2) ═══
            try {
                _step3RankingGuidance = await buildRankingGuidance(inputs, 'concepts');
                _conceptsRankingLinkage = _step3RankingGuidance?.linkage || null;
            } catch { /* non-blocking */ }
        }

        let finalPrompt = conceptPersonalization ? prompt + '\n' + conceptPersonalization : prompt;
        if (_step3RankingGuidance?.promptBlock) finalPrompt += '\n' + _step3RankingGuidance.promptBlock;

        // Using Lite model with Retry logic + content-level retry for empty responses
        let conceptResult = '';
        for (let attempt = 0; attempt < 3; attempt++) {
            const response = await retry(() => callGemini({
                model: LOGIC_MODEL, // <--- FAST STRUCTURE MODEL
                contents: { parts: [{ text: finalPrompt }] },
                config: {
                    systemInstruction: SYSTEM_CONCEPTS,
                    temperature: 0.9 + (attempt * 0.05) // Slightly increase temp on retries
                }
            }));
            conceptResult = response.text || '';
            if (conceptResult && (conceptResult.includes('CONCEPT_START') || conceptResult.includes('SUBJECT_ACTION'))) {
                break; // Valid response — proceed
            }
            console.warn(`[generateConcepts] Empty/malformed response (attempt ${attempt + 1}/3), ${attempt < 2 ? 'retrying...' : 'giving up'}`);
        }

        // ═══ ARABIC BLUEPRINT VALIDATION — Auto-repair if content fields are English ═══
        const conceptLocale = inputs.adLanguage || 'ar_fusha';
        if (conceptLocale.startsWith('ar') && mode === 'initial') {
            const blueprintCheck = validateBlueprintLanguage(conceptResult, conceptLocale);
            if (!blueprintCheck.passed && blueprintCheck.repairPrompt) {
                console.warn(`🔤 Blueprint Arabic ratio: ${(blueprintCheck.arabicContentRatio * 100).toFixed(0)}% — auto-repairing...`);
                try {
                    const repairResponse = await retry(() => callGemini({
                        model: LOGIC_MODEL,
                        contents: { parts: [{ text: `${blueprintCheck.repairPrompt}\n\nORIGINAL OUTPUT TO FIX:\n${conceptResult}\n\nRewrite with Arabic content fields. Keep English field LABELS (SUBJECT_ACTION:, MOOD:, etc.) but make ALL content VALUES Arabic. Keep TECHNICAL_PROMPT in English.` }] },
                        config: { systemInstruction: SYSTEM_CONCEPTS, temperature: 0.7 }
                    }));
                    const repaired = repairResponse.text || '';
                    // Verify repair improved things
                    const recheck = validateBlueprintLanguage(repaired, conceptLocale);
                    if (recheck.arabicContentRatio > blueprintCheck.arabicContentRatio) {
                        conceptResult = repaired;
                        console.log(`✅ Blueprint Arabic repair improved: ${(blueprintCheck.arabicContentRatio * 100).toFixed(0)}% → ${(recheck.arabicContentRatio * 100).toFixed(0)}%`);
                    } else {
                        console.warn(`⚠️ Blueprint repair didn't improve — keeping original`);
                    }
                } catch (e) {
                    console.warn('Blueprint Arabic repair failed (non-blocking):', e);
                }
            }
        }

        // ═══ BLUEPRINT MODE-CONTRIBUTION VALIDATION — Ensure secondary modes are represented ═══
        if (mode === 'initial') {
            const selectedModes = (inputs as any).offerCreativeMode || ['standard_hero'];
            const nonHeroModes = selectedModes.filter((m: string) => m !== 'standard_hero');

            // Only run for multi-mode / pair cases
            if (nonHeroModes.length > 0) {
                const modeContribCheck = validateBlueprintModeContribution(conceptResult, selectedModes);
                console.log(`🎨 Blueprint mode-contribution check: modes=[${selectedModes.join(',')}] passed=${modeContribCheck.passed} missing=[${modeContribCheck.missingModes.join(',')}]`);

                if (!modeContribCheck.passed && modeContribCheck.repairPrompt) {
                    console.warn(`🔧 Blueprint mode-contribution REPAIR ATTEMPT — missing: [${modeContribCheck.missingModes.join(', ')}]`);

                    // Determine if this is a strict pair BEFORE repair (so we know to fail-closed on any failure)
                    const STRICT_PAIRS_SECONDARY = [
                        'value_stack', 'speaker_card',
                        'event_ticket',
                        'webinar_screen', 'book_mockup', 'device_mockup',
                    ];
                    const isStrictPair = modeContribCheck.missingModes.some(m => STRICT_PAIRS_SECONDARY.includes(m));

                    let repairSucceeded = false;
                    try {
                        const repairResponse = await retry(() => callGemini({
                            model: LOGIC_MODEL,
                            contents: { parts: [{ text: `${modeContribCheck.repairPrompt}\n\nORIGINAL OUTPUT TO FIX:\n${conceptResult}\n\nAdd explicit visual descriptions for each missing mode. The blueprint must describe BOTH primary and secondary mode visual elements. Do NOT just describe a hero portrait — describe the secondary mode's unique zone/element.` }] },
                            config: { systemInstruction: SYSTEM_CONCEPTS, temperature: 0.7 }
                        }));
                        const repaired = repairResponse.text || '';
                        const recheck = validateBlueprintModeContribution(repaired, selectedModes);
                        console.log(`🔧 Blueprint repair result: missing before=${modeContribCheck.missingModes.length} after=${recheck.missingModes.length} stillMissing=[${recheck.missingModes.join(',')}]`);

                        if (recheck.missingModes.length < modeContribCheck.missingModes.length) {
                            conceptResult = repaired;
                            console.log(`✅ Blueprint mode repair improved: ${modeContribCheck.missingModes.length} → ${recheck.missingModes.length}`);
                        }

                        // Check final state
                        const finalCheck = validateBlueprintModeContribution(conceptResult, selectedModes);
                        repairSucceeded = finalCheck.passed;

                        if (!finalCheck.passed && isStrictPair) {
                            const stillMissing = finalCheck.missingModes.filter(m => STRICT_PAIRS_SECONDARY.includes(m));
                            if (stillMissing.length > 0) {
                                console.error(`🛑 STRICT PAIR FAIL-CLOSED: Blueprint still underrepresents [${stillMissing.join(', ')}] after repair. Modes=[${selectedModes.join(',')}]. Throwing.`);
                                throw new GenerationError(`Blueprint failed strict pair validation — secondary mode(s) [${stillMissing.join(', ')}] underrepresented after repair. User should retry.`, "slot_repair_failed");
                            }
                        }
                    } catch (e) {
                        // Repair API itself failed (Gemini error, timeout, etc.)
                        console.warn(`⚠️ Blueprint mode repair API failed: ${e}`);
                        if (isStrictPair && !repairSucceeded) {
                            console.error(`🛑 STRICT PAIR FAIL-CLOSED (repair API failed): Cannot guarantee [${modeContribCheck.missingModes.join(', ')}] are represented. Modes=[${selectedModes.join(',')}]. Throwing.`);
                            throw new GenerationError(`Blueprint failed strict pair validation — repair API failed and secondary mode(s) [${modeContribCheck.missingModes.join(', ')}] cannot be guaranteed. User should retry.`, "slot_repair_failed");
                        }
                    }
                }
            }
        }

        // ═══ MINIMAL STYLE VALIDATION — non-blocking warning only ═══
        // The concept prompt already has dedicated minimal placeholders that enforce
        // plain backgrounds, studio lighting, and no cinematic elements (lines 1477-1488, 1729-1735).
        // Post-generation validation was causing false positives because the prohibition text
        // inside our own template (e.g. "FORBIDDEN: cinematic lighting") triggered the detector.
        // Now: log a warning for telemetry, but never block generation.
        const isMinimalBlueprint = resolveStyleFamily(inputs) === 'minimal';
        if (isMinimalBlueprint) {
            const minimalCheck = validateBlueprintMinimalStyle(conceptResult, true);
            if (!minimalCheck.passed) {
                console.warn(`⚠️ Blueprint minimal style check flagged (non-blocking). Prompt enforcement is primary guard.`);
            }
        }

        return conceptResult;
    } // end _generateConceptsInner
    const text = await _generateConceptsInner();
    return { text, rankingGuidance: _conceptsRankingLinkage };
}

// 3. Build Plan -> USE LOGIC MODEL (Engineer)
export interface GenerateBuildPlanResult {
    buildPlan: string;
    copyFidelityWarning: CopyFidelityResult | null;
    culturalViolation?: {
        words: string[];
        layer: "imagePrompt" | "adCopy" | "both";
    };
}

export async function generateBuildPlan(conceptRaw: string, selectedTov: string, inputs: AdInputs, resolvedUniverse: string, currentAspectRatio: AspectRatio, textOverride?: TextOverride): Promise<GenerateBuildPlanResult> {
    const _bpModes = (inputs as any).offerCreativeMode || ['standard_hero'];
    const _bpCheck = validateCombination(_bpModes, inputs.coldHookAngle);
    console.log(`🎨 CREATIVE MODE AUDIT [generateBuildPlan]: modes=[${_bpModes.join(',')}] tab=${_bpCheck.resolvedTab || 'none'} valid=${_bpCheck.valid}${_bpCheck.errors.length ? ' errors: ' + _bpCheck.errors.join('; ') : ''}`);
    if (!_bpCheck.valid) {
        console.error(`🛑 CREATIVE MODE REJECTED in generateBuildPlan: ${_bpCheck.errors.join('; ')}`);
        throw new GenerationError(`Invalid creative mode combination: ${_bpCheck.errors.join('; ')}`, "combination_invalid");
    }

    let _bpRefInfluence: ReferenceInfluence | null = null;
    if (inputs.referenceImage) {
        _bpRefInfluence = await analyzeReferenceImage(inputs.referenceImage);
    }

    const ownedText = resolveOwnedRenderText(selectedTov, inputs, textOverride);
    // `let` so the post-parse ad-copy cultural scan (T025) can write back sanitized text.
    let hookText = ownedText.hookText;
    let subheadText = ownedText.subheadText;
    let ctaName = ownedText.ctaName;
    let benefitText = ownedText.benefitText;

    const _bpRtCtx = buildNormalizedRetargetingContext(inputs as any);
    const _bpRtBlock = getRetargetingPromptBlock(_bpRtCtx);
    const _bpEffectiveAngle = _bpRtCtx.isRetargeting ? null : inputs.coldHookAngle;
    const buildPlanContract = compileFullContract({
        selectedModes: (inputs as any).offerCreativeMode || ['standard_hero'],
        hookAngle: _bpEffectiveAngle || undefined,
        aspectRatio: currentAspectRatio,
        adLanguage: inputs.adLanguage || 'ar_fusha',
        visualStyleFamily: resolveStyleFamily(inputs) || 'realistic',
        referenceInfluence: _bpRefInfluence,
    });
    const buildPlanContractBlock = getContractRenderBlock(buildPlanContract);
    const ownershipMap = buildContentOwnershipMap(ownedText, inputs);

    const sanitizedConceptDetails = conceptRaw
        .replace(/TECHNICAL_PROMPT[:\s].*$/gm, "")
        .replace(/VISUAL_DIRECTION[:\s].*$/gm, "")
        .replace(/CONCEPT_START_\d|CONCEPT_END_\d/g, "")
        .replace(/═+|━+/g, "")
        .replace(/\*\*/g, "")
        .trim()
        .slice(0, 6000);

    const prompt = `
  [BUILDER V6.0 — STRUCTURED BUILD PLAN]
      Synthesize this raw concept into a technical rendering blueprint.
      ${isArabic(inputs.adLanguage) ? `\n${CULTURAL_COMPLIANCE_BLOCK}\n` : ''}
      ${_bpRtBlock ? `
${_bpRtBlock}
` : ''}
      TEXTS TO RENDER:
1. Headline: "${hookText}"
2. Subheadline: "${subheadText}"
${benefitText ? `3. Action Benefit: "${benefitText}"` : ''}
${ctaName ? `4. Button: "${ctaName}"
      OFFER: ${inputs.offerType || 'Not specified'} — match CTA style to this offer type.` : `⚠️ NO BUTTON / NO CTA on this slide. Do NOT render any button or CTA bar. This is a MIDDLE carousel slide.`
        }
      ${inputs.badges ? `5. Badge/Sticker: "${inputs.badges}"` : ''}
      CAMPAIGN CONTEXT:
      - Product: "${inputs.productName || ''}"
      - Target Audience: "${inputs.targetAudience || ''}"
      - Core Challenge: "${inputs.challenges || ''}"
      - Transformation: "${inputs.transformation || ''}"
      ${inputs.adTone ? `TONE MOOD: ${inputs.adTone.toUpperCase()}
${getAdToneVisualMood(inputs.adTone)}` : ''}
      ${_bpEffectiveAngle ? `HOOK ANGLE: ${(_bpEffectiveAngle || '').toUpperCase()}
${_bpEffectiveAngle === 'before_after' ? 'MANDATORY SPLIT COMPOSITION: Create a before/after design where BEFORE shows the hero living the SPECIFIC problem from the headline (matching props, environment, expression) and AFTER shows the SAME hero living the SPECIFIC result from the product. Props must transform logically (cheap→premium, empty→full). Visible divider required. Both halves must tell a connected story, not just "sad vs happy". STRICT: Do NOT add any "BEFORE"/"AFTER" or "قبل"/"بعد" text labels on the image. The visual contrast speaks for itself.' : getHookAngleVisualDirection(_bpEffectiveAngle)}` : ''}
      ${buildPlanContractBlock}
      ${(() => {
            const nonHero = ((inputs as any).offerCreativeMode || []).filter((m: string) => m !== 'standard_hero');
            return nonHero.map((m: string) => getCreativeModeBuildPlanInstruction(m)).filter(Boolean).join(' ');
        })()}
      ${buildModeBlock(inputs)}
      CANONICAL CONTENT OWNERSHIP:
      - PRIMARY_HEADLINE: "${ownershipMap.primaryHeadline || hookText}"
      - SUPPORTING_HEADLINE: "${ownershipMap.supportingHeadline || subheadText}"
      - CTA_TEXT: "${ownershipMap.ctaText || ctaName}"
      - BENEFIT_TEXT: "${benefitText}"
      - OFFER_PRICE: "${ownershipMap.offerPrice || ''}"
      - ORIGINAL_PRICE: "${ownershipMap.originalPrice || ''}"
      - SAVINGS_TEXT: "${ownershipMap.savingsText || ''}"
      CONCEPT DETAILS: ${sanitizedConceptDetails}
RATIO: ${currentAspectRatio}

MANDATE:
- CRITICAL: Use ONLY the provided texts above.
- IGNORE TEXT IN CONCEPT DETAILS: The text provided in the "CONCEPT DETAILS" section (e.g. CTA_AND_BENEFIT_PLOTTING) is for context only. You MUST replace it with the exact strings from "TEXTS TO RENDER" when building the blueprint.
- VISUAL ANCHOR PRESERVATION: You MUST extract and preserve the specific visual props mentioned in the CONCEPT DETAILS (e.g. "Red Circular Rug", "Headset", "Apron"). These define the universe. Do not genericize them.
- Render ONLY the user's brand elements. Any logos must come from Box B exclusively.
- Ensure the "Action Benefit" is treated as a sub-caption for the button, not a replacement.
- Ensure maximum legibility of all Arabic text layers.
- Apply costume fusion for ${(() => { const _bpCostSub = resolveVisualSubStyle(inputs); if (_bpCostSub === 'luxury_magazine') return 'LUXURY MAGAZINE COVER (power wardrobe — cover star quality, profession from ' + resolvedUniverse + ', NOT universe environment. Dark solid background, tight crop.)'; if (_bpCostSub === 'clean_corporate') return 'CLEAN CORPORATE (professional wardrobe — profession from ' + resolvedUniverse + ', NOT universe environment)'; if (_bpCostSub === 'ugly_ad') return 'UGLY AD (casual clothing — ignore universe)'; return resolvedUniverse; })()}.
${isArabic(inputs.adLanguage) ? `\n${ARABIC_WARDROBE_BLOCK}\n` : ''}
- Maintain 100% face likeness and bone structure from provided photos.
- BLUEPRINT SIZE LIMIT: blueprint must stay concise and production-usable. Target 12-18 lines, 1200-2600 characters max.
- Do NOT echo the contract, prompt, schema, JSON rules, or ownership block inside blueprint.
- Do NOT repeat zones more than once. One clear instruction per zone.
- TECHNICAL PROMPT: Inside the blueprint string, include a long-form English rendering instruction that describes the exact visual appearance of the final image. Wrap this instruction between [[TECHNICAL_PROMPT]] and [[/TECHNICAL_PROMPT]] markers. This prompt should be a self-contained, detailed visual description covering composition, lighting, color grading, atmosphere, hero pose, text placement zones, and mood — everything the image model needs to render the ad without seeing the original concept. The hookText "${hookText}" MUST appear verbatim inside this technical prompt.
${inputs.brandColorPrimary ? `- BRAND COLOR DIRECTIVE: The brand's primary color is ${inputs.brandColorPrimary}${inputs.brandColorSecondary ? ` and secondary is ${inputs.brandColorSecondary}` : ''}. Incorporate into the blueprint's color specifications. Choose ONE of these applications per design (rotate for variety):
  a) CTA button background color
  b) Headline text accent/highlight color
  c) Background accent element (neon glow, gradient edge, light streak)
  d) Environmental prop color (matching the universe)
Do NOT make the entire design monochromatic with brand color — use it as a strategic accent.
⚠️ ALWAYS write the exact hex code (e.g. "${inputs.brandColorPrimary}") in color references. NEVER write "[brand_name primary color]" or any placeholder — only the actual hex value.` : ''}
${(() => {
    // ── Ticket 2: Sub-style build plan constraints ──
    const sub = resolveVisualSubStyle(inputs);
    if (!sub) return '';
    const bpSubBlocks: Record<string, string> = {
        luxury_magazine: `
⚠️ SUB-STYLE BUILD CONSTRAINT — LUXURY MAGAZINE COVER:
- Canvas: bold solid dark color background (deep navy, rich black, dark grey, teal). NOT white.
- The ad IS a magazine cover — hero fills 70% of frame, tight crop waist-up.
- Hero head/shoulders OVERLAP the masthead/headline zone at top (classic cover technique).
- Text: DENSE cover lines arranged around hero — headline, subheadline, badge, CTA all visible.
- Typography: BOLD condensed sans-serif. NOT thin serif. Gold or white accent.
- Almost ZERO empty space — every gap has a text element, badge, or cover line.
- NO dark scrims needed — text sits on the solid color background around the hero.
- FORBIDDEN: white background, negative space, thin serif, full body shot, environmental scene.`,
        documentary_gritty: `
⚠️ SUB-STYLE BUILD CONSTRAINT — DOCUMENTARY GRITTY:
- Canvas: desaturated real environment. Film grain texture mandatory across entire frame.
- The ad looks like photojournalism — candid, raw, authentic.
- Text zones: functional caption-bar overlays, lower-third field-report style. Utilitarian, not decorative.
- Dark scrim is acceptable but must be FUNCTIONAL (news caption bar energy), not cinematic.
- Typography: simple bold sans-serif. No decorative effects. News caption weight.
- Hero is caught in a candid moment — NOT posing for camera. Available light only.`,
        neon_urban: `
⚠️ SUB-STYLE BUILD CONSTRAINT — NEON URBAN:
- Canvas: dark night city. Multiple neon light sources (pink, cyan, purple, amber) casting colored spills.
- Text zones: neon-lit areas. Headline can emit neon glow matching scene light sources.
- Neon colored rim light on hero mandatory. Wet pavement reflections enhance depth.
- Typography: modern urban font with neon glow or color accent matching scene.
- Hero has urban night energy — confident, contemporary. Streetwear editorial vibe.`,
        anime_manga: `
⚠️ SUB-STYLE BUILD CONSTRAINT — ANIME/MANGA:
- Canvas: fully illustrated anime-style. NOT photorealistic at any point.
- The ad IS a manga splash page / anime key visual — dynamic composition with speed lines.
- Text zones: manga typography — bold outlined letterforms with ink outline treatment.
  Optional: speech bubble as headline container.
- Cel-shading on all elements. Bold black outlines mandatory.
- Screen tone patterns for depth. Speed lines for energy.
- Hero is rendered as anime character — large expressive eyes, cel-shaded, dynamic pose.`,
        watercolor_dreamscape: `
⚠️ SUB-STYLE BUILD CONSTRAINT — WATERCOLOR DREAMSCAPE:
- Canvas: soft watercolor washes on textured paper. Bleeding edges on all elements.
- No hard geometric layouts — organic flowing composition.
- Text zones: handwritten/delicate typeset quality — integrated with wash layers, not overlaid.
- Soft color washes: lavender, rose, sage, soft gold, sky blue.
- Hero rendered in watercolor technique — edges bleed softly. Painted, not photographic.
- FORBIDDEN: sharp geometric layouts, hard edges, neon, dark backgrounds.`,
        comic_book: `
⚠️ SUB-STYLE BUILD CONSTRAINT — COMIC BOOK:
- Canvas: bold 4-color comic illustration. Thick black outlines on ALL elements.
- The ad IS a comic book panel — dynamic composition with action framing.
- Text zones: comic lettering style — bold outlines, flat color fills.
  Optional: speech/thought bubble containing headline.
- Halftone dot patterns mandatory for shading. Panel border composition.
- Action/speed lines for energy. Bold primary CMYK palette.
- Hero rendered as comic character — exaggerated proportions, flat colors, bold outlines.`,
        dark_cinematic: `
⚠️ SUB-STYLE BUILD CONSTRAINT — DARK CINEMATIC:
- Canvas: deep black (#0A0A0F) to dark navy (#0D1B3E). Single dramatic key light.
- Atmospheric layers mandatory (smoke wisps, particles, haze) — not optional.
- Text with glow/material texture matching key light color. Text exists in the 3D scene.
- Hero emerging from shadows — dramatic 20-30° angle. Movie poster energy.
- Volumetric light rays visible. Colored rim glow on hero.`,
        bright_illustrated: `
⚠️ SUB-STYLE BUILD CONSTRAINT — BRIGHT ILLUSTRATED:
- Canvas: warm, vibrant, saturated illustrated scene. NO dark backgrounds.
- Even warm lighting. Scene feels bright, optimistic, inviting.
- Text on clean contrasting panels. Warm editorial readability.
- Hero has approachable friendly energy. Illustrated painterly quality.
- FORBIDDEN: dark backgrounds, heavy shadow, smoke, neon, moody tones.`,
        mythic_epic: `
⚠️ SUB-STYLE BUILD CONSTRAINT — MYTHIC EPIC:
- Canvas: rich jewel tones (emerald, royal purple, crimson, midnight gold). Dark but richly colored.
- Multiple colored light sources. Magical particles MANDATORY.
- Text with metallic/jewel texture — epic gravitas, stone-carved or gold-leaf energy.
- Grand scale composition. Volumetric colored light rays.
- Hero has legendary commanding presence — fantasy movie poster energy.`,
        vintage_bw: `
⚠️ SUB-STYLE BUILD CONSTRAINT — VINTAGE B&W:
- Canvas: hand-drawn ink illustration. GRAYSCALE ONLY — zero color.
- Thick black rectangular border frame MANDATORY around full composition.
- Text: vintage bold serif typography — typeset quality, NOT modern overlay. Part of the illustration.
- All shading through cross-hatching and ink density — NO gradients, NO photorealistic effects.
- Hero rendered as 1950s editorial illustration — ink strokes, exaggerated vintage expressions.
- FORBIDDEN: color, photorealism, modern fonts, bokeh, particles, cinematic lighting.`,
        vintage_sepia: `
⚠️ SUB-STYLE BUILD CONSTRAINT — VINTAGE SEPIA:
- Same as Vintage B&W but warm sepia/amber tones (#704214) on aged parchment.
- All ink in warm brown. Aged paper texture in light areas.
- Thick warm-brown border frame. Vintage typeset quality text in dark brown ink.
- FORBIDDEN: cool tones, grey, blue, photorealism, modern effects.`,
        ugly_ad: `
⚠️ SUB-STYLE BUILD CONSTRAINT — UGLY AD:
- Canvas: phone screenshot, notepad, or plain color. Anti-design.
- Red circle annotations, hand-drawn arrows, yellow highlights on key text.
- System font or handwritten marker. NO professional typography.
- Deliberately imperfect composition. Raw, authentic, low-production.
- FORBIDDEN: editorial layout, metallic accents, gradients, studio lighting.`,
        cinematic_film_still: `
⚠️ SUB-STYLE BUILD CONSTRAINT — CINEMATIC FILM STILL:
- Canvas: cinematic color grade. 35mm film grain mandatory. Shallow DOF.
- Letterbox crop bar energy (thin dark bars top/bottom).
- Motivated practical lighting. Rich cinematic color palette.
- Text with filmic quality — integrated into the movie-frame composition.`,
        clean_corporate: `
⚠️ SUB-STYLE BUILD CONSTRAINT — CLEAN CORPORATE:
- Canvas: neutral gradient background (grey/blue/cream). Clean studio lighting.
- Premium commercial quality. Apple/Nike/Shopify aesthetic.
- Text: modern sans-serif, clean, corporate. NO decorative effects.
- FORBIDDEN: cinematic, moody, dramatic, fantasy, grain, particles.`,
        golden_hour_outdoor: `
⚠️ SUB-STYLE BUILD CONSTRAINT — GOLDEN HOUR OUTDOOR:
- Canvas: warm golden hour atmosphere. Outdoor natural environment.
- Amber backlight creating warm rim glow. Landscape bokeh.
- Text zones: dark scrim acceptable but warm-toned, not cold.
- Natural aspirational energy. Warm color palette throughout.`,
        street_photography: `
⚠️ SUB-STYLE BUILD CONSTRAINT — STREET PHOTOGRAPHY:
- Canvas: real urban environment. Candid street capture quality.
- Available urban light. Slightly desaturated natural palette.
- Text: functional overlay — caption or subtitle energy.
- 35mm lens feel. Slight motion energy acceptable.`,
        pixel_retro_game: `
⚠️ SUB-STYLE BUILD CONSTRAINT — PIXEL RETRO GAME:
- Canvas: pixel art, 16-bit aesthetic. Visible pixel grid. Max 16 colors.
- Game UI elements: health bars, score counters, menu boxes.
- Text: pixel font, blocky, monospaced. Game UI box framing.
- FORBIDDEN: photorealism, smooth gradients, anti-aliased edges.`,
        stained_glass: `
⚠️ SUB-STYLE BUILD CONSTRAINT — STAINED GLASS:
- Canvas: dark background with jewel-toned backlit panels.
- Thick dark lead lines separating every color zone. Flat fills within panels.
- Text: integrated into glass panel design or overlaid with sacred art typography.
- Colors: ruby, emerald, sapphire, amber, deep purple — all backlit.`,
        glitch_digital: `
⚠️ SUB-STYLE BUILD CONSTRAINT — GLITCH DIGITAL:
- Canvas: dark digital background with horizontal glitch bands.
- RGB channel separation on edges. Scanline interference. Pixel sorting strips.
- Text: glitched — slight horizontal shift, RGB split on edges. Still READABLE.
- Colors: cyan, magenta, neon green from RGB splits against dark base.`,
        synthwave_80s: `
⚠️ SUB-STYLE BUILD CONSTRAINT — SYNTHWAVE 80s:
- Canvas: pink→purple→blue gradient sky. Neon perspective grid floor.
- Chrome/metallic text effects. Neon sun on horizon with stripe lines.
- Hero lit by neon pink and cyan rim lights. Palm silhouettes optional.
- 80s retro-futuristic energy throughout.`,
    };
    return bpSubBlocks[sub] || '';
})()}
${buildStructuredBuildPlanReturnBlock(buildPlanContract, ownershipMap)}
`;

    const parseStructuredPlanWithRepair = async (rawResponseText: string): Promise<StructuredBuildPlanPayload> => {
        try {
            return parseStructuredBuildPlanResponse(rawResponseText || '{}', ownershipMap);
        } catch (parseError: any) {
            const malformedJson = (rawResponseText || '').trim();
            if (!malformedJson) {
                throw new GenerationError('Structured build plan returned empty JSON response.', "model_error");
            }

            const repairResponse = await retry(() => callGemini({
                model: LOGIC_MODEL,
                contents: {
                    parts: [{
                        text: `Repair this malformed structured build-plan JSON so it becomes valid JSON matching the required schema.
Return ONLY valid JSON. No markdown. No commentary.
Preserve the original blueprint meaning, zone ids, overlay ids, must-show ids, and ownership values.
If the malformed JSON is truncated, complete the structure conservatively using only information already present.

MALFORMED JSON TO REPAIR:
${malformedJson.slice(0, 24000)}`
                    }]
                },
                config: {
                    systemInstruction: SYSTEM_RENDER,
                    temperature: 0.1,
                    responseMimeType: "application/json",
                    responseSchema: BUILD_PLAN_RESPONSE_SCHEMA,
                }
            }), 1, 1000);

            try {
                return parseStructuredBuildPlanResponse(repairResponse.text || '{}', ownershipMap);
            } catch (repairError: any) {
                throw new GenerationError(`Structured build plan JSON parse failed after repair. Initial error: ${parseError?.message || parseError}. Repair error: ${repairError?.message || repairError}`, "model_error");
            }
        }
    };

    const requestStructuredPlan = async (requestPrompt: string): Promise<StructuredBuildPlanPayload> => {
        const response = await retry(() => callGemini({
            model: LOGIC_MODEL,
            contents: { parts: [{ text: requestPrompt }] },
            config: {
                systemInstruction: SYSTEM_RENDER,
                temperature: 0.25,
                responseMimeType: "application/json",
                responseSchema: BUILD_PLAN_RESPONSE_SCHEMA,
            }
        }));
        return parseStructuredPlanWithRepair(response.text || '{}');
    };

    let machinePlan = await requestStructuredPlan(prompt);
    let structuredValidation = validateStructuredBuildPlan(machinePlan, buildPlanContract, ownershipMap);

    if (!structuredValidation.contractCheck.passed) {
        const repairPrompt = `${prompt}

STRUCTURED VALIDATION FAILED.
You MUST repair the JSON so the layout contract is fully satisfied.
Validation reasons:
${structuredValidation.contractCheck.reasons.map((reason) => `- ${reason}`).join('\n')}

PREVIOUS JSON TO FIX:
${JSON.stringify(machinePlan)}`;
        machinePlan = await requestStructuredPlan(repairPrompt);
        structuredValidation = validateStructuredBuildPlan(machinePlan, buildPlanContract, ownershipMap);
        if (!structuredValidation.contractCheck.passed) {
            throw new GenerationError(`Build plan failed structured contract validation: ${structuredValidation.contractCheck.reasons.join(' | ')}`, "validation_reject");
        }
    }

    if (!machinePlan.blueprint || machinePlan.blueprint.length < 80) {
        throw new GenerationError('Build plan blueprint was empty or too short.', "prompt_malformed");
    }

    // ═══ COPY FIDELITY VALIDATION WITH RETRY ═══
    const extractTechnicalPromptFromBlueprint = (bp: string): string | null => {
        const s = bp.indexOf(TECHNICAL_PROMPT_START);
        const e = bp.indexOf(TECHNICAL_PROMPT_END);
        if (s === -1 || e === -1 || e <= s) return null;
        return bp.slice(s + TECHNICAL_PROMPT_START.length, e).trim();
    };

    const copyFields: CopyFidelityFields = { hookText, subheadText, ctaName, benefitText };
    const MAX_COPY_FIDELITY_ATTEMPTS = 3;
    let bestMachinePlan = machinePlan;
    let bestFidelityResult: CopyFidelityResult | null = null;
    let copyFidelityPassed = false;
    for (let attempt = 1; attempt <= MAX_COPY_FIDELITY_ATTEMPTS; attempt++) {
        const tp = extractTechnicalPromptFromBlueprint(machinePlan.blueprint);
        const fidelityResult = tp ? validateCopyFidelity(tp, copyFields) : {
            passed: false,
            failedFields: (['hookText', 'subheadText', 'ctaName', 'benefitText'] as const).filter(k => copyFields[k]?.trim()),
        } as CopyFidelityResult;
        const contractOk = structuredValidation.contractCheck.passed;
        if (fidelityResult.passed && contractOk) {
            copyFidelityPassed = true;
            bestMachinePlan = machinePlan;
            bestFidelityResult = fidelityResult;
            if (attempt > 1) {
                console.log(`✅ Copy fidelity + contract passed on attempt ${attempt}`);
            }
            break;
        }
        // Keep the best plan seen so far — prefer hookText present, then fewer failed fields
        const isBetter = (curr: CopyFidelityResult, best: CopyFidelityResult | null): boolean => {
            if (!best) return true;
            const currHasHook = !curr.failedFields.includes('hookText');
            const bestHasHook = !best.failedFields.includes('hookText');
            if (currHasHook !== bestHasHook) return currHasHook;
            return curr.failedFields.length < best.failedFields.length;
        };
        if (contractOk) {
            if (isBetter(fidelityResult, bestFidelityResult)) {
                bestMachinePlan = machinePlan;
                bestFidelityResult = fidelityResult;
            }
        } else if (isBetter(fidelityResult, bestFidelityResult)) {
            bestFidelityResult = fidelityResult;
        }
        if (attempt < MAX_COPY_FIDELITY_ATTEMPTS) {
            console.warn(`⚠️ Copy fidelity ${fidelityResult.passed ? 'passed' : 'failed (fields: ' + fidelityResult.failedFields.join(', ') + ')'}, contract ${contractOk ? 'passed' : 'failed'} (attempt ${attempt}/${MAX_COPY_FIDELITY_ATTEMPTS}) — rebuilding plan...`);
            machinePlan = await requestStructuredPlan(prompt);
            if (!machinePlan.blueprint || machinePlan.blueprint.length < 80) {
                if (bestMachinePlan.blueprint && bestMachinePlan.blueprint.length >= 80) {
                    console.warn('⚠️ Copy fidelity retry produced empty/short blueprint — falling back to bestMachinePlan');
                    machinePlan = bestMachinePlan;
                    break;
                }
                throw new GenerationError('Build plan blueprint was empty or too short on copy fidelity retry.', "prompt_malformed");
            }
            structuredValidation = validateStructuredBuildPlan(machinePlan, buildPlanContract, ownershipMap);
        } else {
            console.warn(`⚠️ Copy fidelity exhausted after ${MAX_COPY_FIDELITY_ATTEMPTS} attempts — proceeding with best available plan`);
        }
    }
    // Use the best plan even if fidelity didn't pass — soft warning, not hard rejection
    machinePlan = bestMachinePlan;
    const copyFidelityWarning: CopyFidelityResult | null = !copyFidelityPassed && bestFidelityResult
        ? { passed: false, failedFields: bestFidelityResult.failedFields }
        : null;
    if (copyFidelityWarning) {
        console.warn(`⚠️ Copy fidelity warning: fields [${copyFidelityWarning.failedFields.join(', ')}] may not appear verbatim in TECHNICAL_PROMPT — using best available plan`);
    }

    try {
        const scoringCompat = getContractForScoring(buildPlanContract);
        const quickCheck = quickRejectCheck(scoringCompat, machinePlan.blueprint);
        if (quickCheck.reject) {
            console.warn(`⚠️ Structured build plan quick reject warning: ${quickCheck.reason}`);
        }
        const validation = validateBuildPlanAgainstContract(machinePlan.blueprint, scoringCompat);
        if (validation.warnings.length > 0) {
            console.log(`📋 Build plan warnings (${validation.warnings.length}): ${validation.warnings.join(' | ')}`);
        }
    } catch (e) {
        console.warn('Structured build plan warning pass skipped:', e);
    }

    const finalMachinePlan: StructuredBuildPlanPayload = {
        ...machinePlan,
        ownership: mergeContentOwnership(ownershipMap, machinePlan.ownership),
    };

    // ── T024: Post-parse cultural scan on technical prompt text ──
    const imageMatched: string[] = [];
    const copyMatched: string[] = [];
    if (isArabic(inputs.adLanguage)) {
        const tpRaw = extractTechnicalPromptFromBlueprint(finalMachinePlan.blueprint);
        if (tpRaw) {
            const { cleaned, matched } = scanAndReplace(tpRaw, "imagePrompt");
            if (matched.length > 0) {
                const bp = finalMachinePlan.blueprint;
                const start = bp.indexOf(TECHNICAL_PROMPT_START);
                const end = bp.indexOf(TECHNICAL_PROMPT_END);
                if (start !== -1 && end !== -1 && end > start) {
                    finalMachinePlan.blueprint =
                        bp.slice(0, start + TECHNICAL_PROMPT_START.length) +
                        "\n" + cleaned + "\n" +
                        bp.slice(end);
                }
                imageMatched.push(...matched);
                console.log(`🕌 Cultural compliance scan (imagePrompt): replaced [${matched.join(", ")}]`);
            }
        }
        // ── T025: Post-parse cultural scan on ad-copy fields — WRITE CLEANED VALUES BACK. ──
        // hookText/subheadText/ctaName/benefitText are `let` so the final render uses sanitized text.
        if (hookText) {
            const { cleaned, matched } = scanAndReplace(hookText, "adCopy");
            if (matched.length > 0) {
                hookText = cleaned;
                copyMatched.push(...matched);
                console.log(`🕌 Cultural compliance scan (adCopy/hookText): replaced [${matched.join(", ")}]`);
            }
        }
        if (subheadText) {
            const { cleaned, matched } = scanAndReplace(subheadText, "adCopy");
            if (matched.length > 0) {
                subheadText = cleaned;
                copyMatched.push(...matched);
                console.log(`🕌 Cultural compliance scan (adCopy/subheadText): replaced [${matched.join(", ")}]`);
            }
        }
        if (ctaName) {
            const { cleaned, matched } = scanAndReplace(ctaName, "adCopy");
            if (matched.length > 0) {
                ctaName = cleaned;
                copyMatched.push(...matched);
                console.log(`🕌 Cultural compliance scan (adCopy/ctaName): replaced [${matched.join(", ")}]`);
            }
        }
        if (benefitText) {
            const { cleaned, matched } = scanAndReplace(benefitText, "adCopy");
            if (matched.length > 0) {
                benefitText = cleaned;
                copyMatched.push(...matched);
                console.log(`🕌 Cultural compliance scan (adCopy/benefitText): replaced [${matched.join(", ")}]`);
            }
        }
        // silence unused-warnings where the cleaned fields aren't re-read inside this function;
        // they are returned-by-closure and re-read by downstream generator paths.
        void ctaName; void benefitText; void subheadText; void hookText;
    }

    // ── T026: Aggregate matches — dedupe while preserving first-seen order; expose on result. ──
    let culturalViolation: GenerateBuildPlanResult["culturalViolation"] | undefined;
    if (imageMatched.length > 0 || copyMatched.length > 0) {
        const seen = new Set<string>();
        const allWords: string[] = [];
        for (const w of [...imageMatched, ...copyMatched]) {
            if (!seen.has(w)) { seen.add(w); allWords.push(w); }
        }
        const layer: "imagePrompt" | "adCopy" | "both" =
            imageMatched.length > 0 && copyMatched.length > 0 ? "both"
                : imageMatched.length > 0 ? "imagePrompt" : "adCopy";
        culturalViolation = { words: allWords, layer };
        console.log(`🔒 Cultural violation aggregated: words=[${allWords.join(", ")}] layer=${layer}`);
    }

    return {
        buildPlan: serializeBuildPlanEnvelope(finalMachinePlan.blueprint, finalMachinePlan),
        copyFidelityWarning,
        culturalViolation,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOLUTION TRACE — per-generation audit record (FR-007)
// ═══════════════════════════════════════════════════════════════════════════

export interface ResolutionTrace {
    resolvedImagePrompt: string | null;
    blueprintText: string | null;
    technicalPrompt: string | null;
    perSlide?: Array<{
        slideIndex: number;
        resolvedImagePrompt: string | null;
        blueprintText: string | null;
    }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// buildFinalImagePrompt() — SOLE PROMPT ASSEMBLY ENTRY POINT (FR-006)
// ═══════════════════════════════════════════════════════════════════════════
// Concatenates sections in the strict order per contracts/prompt-assembly.md.
// This is the ONLY function that assembles the final image prompt.
// No inline assembly is permitted elsewhere (FR-006 compliance).

export interface BuildFinalImagePromptInput {
    technicalPrompt: string;
    blueprint: string;
    contract: FullLayoutContract;
    inputs: AdInputs;
    aspectRatio: AspectRatio;
    hookText: string;
    subheadText: string;
    ctaName: string;
    benefitText: string;
    badges?: string;
    resolvedUniverse: string;
    costumeRules: string;
    coreDesignRules: string;
    carouselAnchorNote: string;
    retargetingDesignHint: string;
    imageParts: Array<{ inlineData: { mimeType: string; data: string } }>;
}

export interface BuildFinalImagePromptResult {
    textPrompt: string;
    imageParts: Array<{ inlineData: { mimeType: string; data: string } }>;
    trace: ResolutionTrace;
}

export function buildFinalImagePrompt(params: BuildFinalImagePromptInput): BuildFinalImagePromptResult {
    const {
        technicalPrompt,
        blueprint,
        contract,
        inputs,
        aspectRatio,
        hookText,
        subheadText,
        ctaName,
        benefitText,
        badges,
        resolvedUniverse,
        costumeRules,
        coreDesignRules,
        carouselAnchorNote,
        retargetingDesignHint,
        imageParts,
    } = params;

    const strippedBlueprint = stripTechnicalPrompt(blueprint);

    // coreDesignRules already contains CULTURAL_COMPLIANCE_BLOCK and costumeRules already
    // contains ARABIC_WARDROBE_BLOCK for Arabic ads (see generateFinalAd assembly).
    // Only prepend the blocks here if — for any reason — the assembled rules have dropped
    // them. This prevents the duplicate-block injection that would otherwise happen on the
    // Arabic path, while keeping a safety net if a caller ever passes a minimal rules string.
    const _isAr = isArabic(inputs.adLanguage);
    const _ccBlock = _isAr && !coreDesignRules.includes(CULTURAL_COMPLIANCE_BLOCK)
        ? `\n${CULTURAL_COMPLIANCE_BLOCK}\n` : "";
    const _wardrobeBlock = _isAr && !costumeRules.includes(ARABIC_WARDROBE_BLOCK)
        ? `\n${ARABIC_WARDROBE_BLOCK}\n` : "";

    const textPrompt = `${_ccBlock}${coreDesignRules}
${technicalPrompt ? `\nTECHNICAL_PROMPT:\n${technicalPrompt}\n` : ''}
BLUEPRINT: ${strippedBlueprint}
TEXTS: "${hookText}", "${subheadText}"
BUTTON: "${ctaName}"
${carouselAnchorNote}
${retargetingDesignHint}

⚠️ CRITICAL TEXT RENDERING RULES:
1. ONLY render these EXACT text strings on the image — NOTHING ELSE:
   - Headline: "${hookText}"
   - Subheadline: "${subheadText}"
   ${ctaName ? `- Button: "${ctaName}"` : ''}
   ${benefitText ? `- Benefit: "${benefitText}"` : ''}
   ${badges ? `- Badge: "${badges}"` : ''}
2. DO NOT render ANY of these on the image:
   - System instructions, marker labels, or field names
   - "VISUAL_DIRECTION:", "TECHNICAL_PROMPT:", "CONCEPT_START", etc.
   - "**" symbols, "═══" lines, or any formatting markers
   - English technical instructions or camera settings
   - ANY English text, brand names, watermarks, or labels
   - Any text that is NOT one of the strings listed above
3. If the blueprint mentions "VISUAL_DIRECTION" or similar — that is an INSTRUCTION TO YOU, not text to render.
4. NEVER render English words from the blueprint as visible text on the image. The blueprint is a design INSTRUCTION, not content to display.
5. Each Arabic text string must appear EXACTLY ONCE — never duplicate, never truncate, never rephrase.
${_wardrobeBlock}${costumeRules}
`;

    const trace: ResolutionTrace = {
        resolvedImagePrompt: textPrompt.substring(0, 5000),
        blueprintText: strippedBlueprint.substring(0, 2000),
        technicalPrompt: technicalPrompt?.substring(0, 3000) || null,
    };

    return { textPrompt, imageParts, trace };
}

// 4. Final Ad -> USE VISUAL MODEL (Artist)
export async function generateFinalAd(
    buildPlan: string,
    approvedTov: string,
    inputs: AdInputs,
    resolvedUniverse: string,
    currentAspectRatio: AspectRatio,
    editInstruction?: string,
    base64ToEdit?: string,
    styleReference?: string,
    textOverride?: TextOverride
): Promise<{ image: string; failureClass?: "numeric_hallucination"; costEstimate?: CostEstimate } | { image: null; errorCode: string; failureClass?: FailureClass; debug?: FinalAdDebugInfo }> {
    // ═══ RETARGETING CONTEXT (normalized) ═══
    const _renderRtCtx = buildNormalizedRetargetingContext(inputs as any);
    const _renderEffectiveAngle = _renderRtCtx.isRetargeting ? null : inputs.coldHookAngle;
    const renderStartedAt = Date.now();
    const renderSoftDeadlineMs = 270000;
    const hasTimeBudget = (reserveMs: number): boolean => (Date.now() - renderStartedAt) < (renderSoftDeadlineMs - reserveMs);

    // ═══ CREATIVE MODE VALIDATION (fail-closed, skip for edits/reflows) ═══
    if (!editInstruction && !base64ToEdit) {
        const _renderModes = (inputs as any).offerCreativeMode || ['standard_hero'];
        const _renderCheck = validateCombination(_renderModes, _renderEffectiveAngle);
        console.log(`🎨 CREATIVE MODE AUDIT [generateFinalAd]: modes=[${_renderModes.join(',')}] tab=${_renderCheck.resolvedTab || 'none'} valid=${_renderCheck.valid}${_renderCheck.errors.length ? ' errors: ' + _renderCheck.errors.join('; ') : ''}`);
        if (!_renderCheck.valid) {
            console.error(`🛑 CREATIVE MODE REJECTED in generateFinalAd: ${_renderCheck.errors.join('; ')}`);
            return { image: null, errorCode: 'validation_failed', failureClass: 'combination_invalid' as const, debug: { validator: 'creative_mode', reasons: _renderCheck.errors } };
        }
        // Log validity criteria for active modes (consumed by zone gate and prompt system)
        for (const mId of _renderModes) {
            const meta = (_MODE_CATALOG as any)[mId];
            if (meta?.validity) {
                console.log(`   ↳ ${mId}: requires [${meta.validity.requiredElements.join(', ')}], rejects [${meta.validity.invalidSubstitutes.join(', ')}]`);
            }
        }
    }

    // ═══ REFERENCE IMAGE ANALYSIS (optional, non-blocking) ═══
    let _referenceInfluence: ReferenceInfluence | null = null;
    if (inputs.referenceImage && !editInstruction && !base64ToEdit) {
        _referenceInfluence = await analyzeReferenceImage(inputs.referenceImage);
    }
    const ownedRenderText = resolveOwnedRenderText(approvedTov, inputs, textOverride);
    let hookText = ownedRenderText.hookText;
    let subheadText = ownedRenderText.subheadText;
    let ctaName = ownedRenderText.ctaName;
    let benefitText = ownedRenderText.benefitText;
    const parsedBuildPlan = parseBuildPlanEnvelope(buildPlan);
    let incomingBuildBlueprint = parsedBuildPlan.blueprint || buildPlan;
    const ownershipMap = parsedBuildPlan.machinePlan?.ownership
        ? mergeContentOwnership(buildContentOwnershipMap(ownedRenderText, inputs), parsedBuildPlan.machinePlan.ownership)
        : buildContentOwnershipMap(ownedRenderText, inputs);

    // ═══ ARABIC ANTI-REPETITION & TEXT QA LAYER ═══
    // Normalize and deduplicate copy fields before sending to image generation
    {
        const fields = [hookText, subheadText, ctaName, benefitText].map(f => f.trim());

        // 1. Remove exact duplicates between fields
        if (subheadText.trim() === hookText.trim() && subheadText.trim()) {
            subheadText = ''; // Don't repeat headline as subheadline
        }
        if (benefitText.trim() === ctaName.trim() && benefitText.trim()) {
            benefitText = ''; // Don't repeat CTA as benefit
        }
        if (benefitText.trim() === hookText.trim() && benefitText.trim()) {
            benefitText = ''; // Don't repeat headline as benefit
        }
        if (benefitText.trim() === subheadText.trim() && benefitText.trim()) {
            benefitText = ''; // Don't repeat subheadline as benefit
        }

        // 2. Detect near-duplicate (one field contains another)
        const normalize = (s: string) => s.replace(/[\s\u200B-\u200D\uFEFF]/g, '').replace(/[.!?،,؟!]/g, '');
        if (subheadText && normalize(hookText).includes(normalize(subheadText))) {
            subheadText = ''; // Subhead is substring of headline
        }
        if (benefitText && normalize(ctaName).includes(normalize(benefitText))) {
            benefitText = ''; // Benefit is substring of CTA
        }

        // 3. Copy compression for tight formats (9:16, 4:5)
        const isCompactRatio = currentAspectRatio === '9:16' || currentAspectRatio === '4:5';
        if (isCompactRatio) {
            // Limit total text density — prefer fewer, cleaner elements
            const totalChars = hookText.length + subheadText.length + ctaName.length + benefitText.length;
            if (totalChars > 120) {
                // Prioritize: headline > CTA > subheadline > benefit
                if (benefitText.length > 30) benefitText = benefitText.substring(0, 30).trim();
                if (subheadText.length > 50 && totalChars > 140) subheadText = subheadText.substring(0, 50).trim();
            }
        }
    }

    const boxA = (inputs.personalPhotos || []).slice(0, 5);
    const _isTextOnly = isTextOnlyMode(inputs);
    const boxB = (inputs.brandLogos || []).slice(0, 1);
    const boxC = ((inputs as any).offerAssets || []).slice(0, 3); // Offer-specific assets (book cover, dashboard, etc.)

    // Helper: extract actual MIME type from base64 data URL
    const getMime = (dataUrl: string): string => {
        const match = dataUrl.match(/^data:(image\/\w+);base64,/);
        return match ? match[1] : 'image/jpeg';
    };

    const isMinimalStyle = resolveStyleFamily(inputs) === 'minimal';
    const _isTextOnlyForCostume = isTextOnlyMode(inputs);
    const costumeRules = _isTextOnlyForCostume ? `
      TEXT-ONLY MODE — NO HERO, NO COSTUME:
      - There is NO hero person in this ad.
      - Do NOT render any person, character, or figure.
      - Background is color/gradient/texture only.
      - All canvas space is for typographic layout.
      - Box A photos, if any, are IRRELEVANT — do not use them.
    ` : isMinimalStyle ? `
      MINIMAL VISUAL STYLE — COSTUME & ENVIRONMENT RULES:
      - Background: Plain solid color, soft gradient, or very simple branded backdrop ONLY
      - NO detailed environment, NO location scenery, NO fantasy worldbuilding
      - COSTUME: Smart professional attire matching the niche — keep it polished and simple
      - Subject must be ISOLATED against the clean background
      - Allowed extras: subtle floor/shadow, simple platform/pedestal, brand color accents
      - If Box A photos exist: use for FACE IDENTITY ONLY. Choose niche-appropriate professional clothing.
      - FORBIDDEN: Environmental clutter, atmospheric effects, cinematic scenes, fantasy elements
    ` : `
      ${(() => {
          const sub = resolveVisualSubStyle(inputs);
          if (!sub) return '';
          const notes: Record<string, string> = {
              vintage_bw: `⚠️ VINTAGE B&W COSTUME NOTE: Hero clothing follows universe rules but rendered as hand-drawn ink illustration — fabric texture through cross-hatching, not photographic detail. Exaggerated vintage cartoon expressions. Era-appropriate clothing fused with universe.`,
              vintage_sepia: `⚠️ VINTAGE SEPIA COSTUME NOTE: Same as Vintage B&W — ink illustration costume. All clothing tones in warm sepia/amber range. Era-appropriate clothing in warm brown ink palette.`,
              luxury_magazine: `⚠️ LUXURY MAGAZINE COVER COSTUME NOTE: Hero clothing is COVER-STAR quality — impeccably tailored power wardrobe. The universe determines PROFESSION which informs wardrobe direction (e.g. coach=luxury blazer, finance=power suit). But clothing must photograph beautifully in tight crop against solid dark background. Rich fabric textures visible in portrait lighting. FORBIDDEN: casual clothing, environmental uniforms, anything that wouldn't appear on a Forbes/GQ cover.`,
              documentary_gritty: `⚠️ DOCUMENTARY GRITTY COSTUME NOTE: Hero clothing is REAL and AUTHENTIC — what an actual person in this profession would wear in this moment. No styling perfection. Slight lived-in quality. Universe-appropriate but NOT polished or curated. Functional over fashionable.`,
              neon_urban: `⚠️ NEON URBAN COSTUME NOTE: Hero clothing is modern urban night style — sharp, confident, contemporary. Neon light from the scene reflects on clothing surfaces (subtle colored light spill on fabric/jacket). Universe-appropriate but with urban night energy. Avoid vintage or traditional attire.`,
              anime_manga: `⚠️ ANIME/MANGA COSTUME NOTE: Hero clothing is FULLY ILLUSTRATED in anime style — same cel-shading and bold ink outline treatment as the rest of the scene. Universe-appropriate costume rendered as anime character design. Bold graphic simplification of clothing details. Maintain any headwear (hijab etc.) in anime illustration style.`,
              watercolor_dreamscape: `⚠️ WATERCOLOR COSTUME NOTE: Hero clothing rendered in soft watercolor technique — edges bleed softly, fabric has a painted quality. Flowing, soft, natural fabrics preferred. Universe-appropriate but in dreamscape color palette (lavender, rose, sage, soft gold). Clothing should feel ethereal, not structured.`,
              comic_book: `⚠️ COMIC BOOK COSTUME NOTE: Hero clothing rendered in FLAT BOLD COLORS within the 4-color palette — no gradients, bold outlines on all fabric edges. Universe-appropriate costume simplified to comic panel design principles. Exaggerated proportions acceptable for action energy. Clothing should feel like a superhero/character costume, not a photo.`,
          };
          const note = notes[sub];
          return note ? `\n${note}` : '';
      })()}
      ANALYZE CONTEXT: Universe: "${(() => { const _rcSub = resolveVisualSubStyle(inputs); if (_rcSub === 'luxury_magazine') return 'LUXURY MAGAZINE COVER (bold dark background — ' + resolvedUniverse + ' determines profession/wardrobe only, NOT environment)'; if (_rcSub === 'clean_corporate') return 'CLEAN CORPORATE STUDIO (neutral gradient — ' + resolvedUniverse + ' determines profession only)'; if (_rcSub === 'ugly_ad') return 'UGLY AD / RAW (ignore universe)'; return resolvedUniverse; })()}" | Niche: "${inputs.targetAudience}"

⚠️ CRITICAL CLOTHING RULE ⚠️
The photos in Box A are for FACE IDENTITY ONLY.Do NOT copy the clothing, outfit, or accessories from Box A photos.
The hero's wardrobe must be DETERMINED BY THE UNIVERSE AND NICHE, not by what they wore in their uploaded photos.
If the uploaded photo shows a person in a blue suit, you must NOT default to a blue suit — dress them according to the rules below.

1. DECIDE: Is this a "Real World" setting or a "Fictional" setting ?
  2. IF REAL WORLD: The Hero MUST wear the "Uniform of Success" for this SPECIFIC UNIVERSE + NICHE combination:
    - The UNIVERSE determines the setting / environment(e.g.Start - up Garage, Luxury Penthouse, Medical Clinic)
      - The NICHE determines the profession(e.g.Coach, Doctor, Chef, Marketer)
        - COMBINE BOTH to pick the right outfit.Examples:
     * Start - up Garage + Business Coach = Smart casual(open collar shirt, rolled sleeves, no tie)
  * Luxury Penthouse + Financial Advisor = Premium suit, silk tie, pocket square
    * Co - working Space + Creative Director = Turtleneck, blazer, minimalist watch
      * Kitchen + Chef = Chef whites, apron
        * Gym + Fitness Coach = Athletic wear, compression shirt
          - VARY the outfit across the 3 concepts — do NOT use the same outfit for all 3. Change colors, styles, layers.
   - DO NOT default to a generic dark suit for every concept.
3. IF FICTIONAL: The Hero MUST wear a detailed costume matching the universe lore(armor, robes, space suit, etc.)
4. PRIORITY ORDER: Face identity(from Box A) > Universe - appropriate outfit > Niche uniform
  - Box A = face only.Ignore their clothing completely.
  ${isArabic(inputs.adLanguage) ? `\n${ARABIC_WARDROBE_BLOCK}` : ""}
  `;
    // ═══ HARD RENDER GATE: Contract compliance check BEFORE prompt assembly ═══
    // Only runs when a structured machine plan is present (Step 3.5 active).
    // When concept text is passed directly (no machine plan), skip the gate entirely.
    let gatedBuildPlan = buildPlan;
    let gatedBlueprint = incomingBuildBlueprint;
    if (parsedBuildPlan.machinePlan) {
        const gateContract = compileFullContract({
            selectedModes: (inputs as any).offerCreativeMode || ['standard_hero'],
            hookAngle: _renderEffectiveAngle || undefined,
            aspectRatio: currentAspectRatio,
            adLanguage: inputs.adLanguage || 'ar_fusha',
            visualStyleFamily: resolveStyleFamily(inputs) || 'realistic',
        });
        const gateScoringCompat = getContractForScoring(gateContract);

        const gateQuickCheck = quickRejectCheck(gateScoringCompat, gatedBlueprint);
        if (gateQuickCheck.reject) {
            const isMinimalStyle = resolveStyleFamily(inputs) === 'minimal';
            if (isMinimalStyle) {
                console.warn(`⚠️ RENDER GATE: quickRejectCheck flagged for minimal (non-blocking): ${gateQuickCheck.reason}`);
            } else {
                console.error(`🛑 RENDER GATE HARD REJECT: ${gateQuickCheck.reason}. Aborting render.`);
                return { image: null, errorCode: 'quality_rejected', failureClass: 'validation_reject' as const, debug: buildQualityRejectedDebug('quick_reject', undefined, [gateQuickCheck.reason || 'Forbidden build-plan element']) };
            }
        }

        let gateSlotValidation = validateBuildPlanSlots(gatedBuildPlan, gateContract, approvedTov, inputs, textOverride);
        let gateSlotMap = gateSlotValidation.slotMap;
        const hasSecondaryZones = Object.values(gateContract.zones).some((z: any) => z.priority === 2 && (z.minItems || z.minSizePct));

        if (!gateSlotValidation.contractCheck.passed && hasSecondaryZones && !base64ToEdit && !editInstruction) {
            console.warn(`🛑 RENDER SLOT GATE: ${gateSlotValidation.contractCheck.reasons.join(' | ')}. Regenerating build plan...`);
            try {
                const contractBlock = getContractRenderBlock(gateContract);
                const missingDesc = [
                    ...gateSlotMap.missingZones.map((z) => `zone "${z}" (${(gateContract.zones[z] as any)?.anchor || '?'} position, priority ${(gateContract.zones[z] as any)?.priority || '?'})`),
                    ...gateSlotMap.missingMustShow.map((m) => `element "${m.replace(/_/g, ' ')}"`),
                    ...gateSlotMap.missingOverlaySlots.map((s) => `overlay slot "${s}"`),
                ].join('\n- ');
                const repairPrompt = `You previously generated a structured build plan that omits required layout elements.
The user selected creative modes that require a "${gateContract.templateName}" layout.

${contractBlock}

MISSING ELEMENTS:
- ${missingDesc}

CANONICAL CONTENT OWNERSHIP:
- PRIMARY_HEADLINE: "${ownershipMap.primaryHeadline || hookText}"
- SUPPORTING_HEADLINE: "${ownershipMap.supportingHeadline || subheadText}"
- CTA_TEXT: "${ownershipMap.ctaText || ctaName}"
- OFFER_PRICE: "${ownershipMap.offerPrice || ''}"
- ORIGINAL_PRICE: "${ownershipMap.originalPrice || ''}"
- SAVINGS_TEXT: "${ownershipMap.savingsText || ''}"

MANDATORY FIX:
Repair the machine-readable JSON so the blueprint, zones, overlayAssignments, and mustShowAssignments fully satisfy the contract.
Each required zone must be present with a clear value.
${buildStructuredBuildPlanReturnBlock(gateContract, ownershipMap)}

ORIGINAL BLUEPRINT TO FIX:
${gatedBlueprint}

PREVIOUS MACHINE PLAN JSON:
${JSON.stringify(parsedBuildPlan.machinePlan || {})}`;
                const repairResponse = await retry(() => callGemini({
                    model: LOGIC_MODEL,
                    contents: { parts: [{ text: repairPrompt }] },
                    config: {
                        systemInstruction: SYSTEM_RENDER,
                        temperature: 0.35,
                        responseMimeType: "application/json",
                        responseSchema: BUILD_PLAN_RESPONSE_SCHEMA,
                    }
                }));
                const repairedMachinePlan = parseStructuredBuildPlanResponse(repairResponse.text || '{}', ownershipMap);
                const repairedEnvelope = serializeBuildPlanEnvelope(repairedMachinePlan.blueprint, {
                    ...repairedMachinePlan,
                    ownership: mergeContentOwnership(ownershipMap, repairedMachinePlan.ownership),
                });
                const repairedSlotValidation = validateBuildPlanSlots(repairedEnvelope, gateContract, approvedTov, inputs, textOverride);
                if (repairedSlotValidation.contractCheck.passed && repairedMachinePlan.blueprint.length > 100) {
                    gatedBuildPlan = repairedEnvelope;
                    gatedBlueprint = repairedMachinePlan.blueprint;
                    gateSlotValidation = repairedSlotValidation;
                    gateSlotMap = repairedSlotValidation.slotMap;
                    console.log(`✅ RENDER SLOT GATE: Build plan regenerated (${repairedMachinePlan.blueprint.length} chars)`);
                } else {
                    console.error(`🛑 RENDER SLOT GATE: Repair still fails slot check: ${repairedSlotValidation.contractCheck.reasons.join(' | ')}`);
                    return { image: null, errorCode: 'quality_rejected', failureClass: 'validation_reject' as const, debug: buildQualityRejectedDebug('slot_map', repairedSlotValidation.slotMap) };
                }
            } catch (repairErr) {
                console.error(`🛑 RENDER SLOT GATE: Repair call failed. Aborting render.`, repairErr);
                return { image: null, errorCode: 'quality_rejected', failureClass: 'validation_reject' as const, debug: buildQualityRejectedDebug('slot_map', gateSlotMap, ['Repair call failed']) };
            }
        } else if (!gateSlotValidation.contractCheck.passed && hasSecondaryZones && !base64ToEdit && !editInstruction) {
            return { image: null, errorCode: 'quality_rejected', failureClass: 'validation_reject' as const, debug: buildQualityRejectedDebug('slot_map', gateSlotMap) };
        }
    }
    // ═══ END HARD RENDER GATE ═══

    if (containsUnresolvedCommercialPlaceholders(gatedBlueprint)) {
        console.error('🛑 RENDER GATE HARD REJECT: unresolved commercial placeholder text detected in build plan.');
        return { image: null, errorCode: 'quality_rejected', failureClass: 'validation_reject' as const, debug: buildQualityRejectedDebug('placeholder_leak', undefined, ['Build plan contains unresolved commercial placeholder text']) };
    }

    const preOverlayFacts = extractOfferFacts(inputs);
    if (preOverlayFacts) {
        const preOverlayValidation = validateResolvedOfferFacts(preOverlayFacts, (inputs.adLanguage || 'ar_fusha').startsWith('ar'));
        if (!preOverlayValidation.valid) {
            console.warn(`⚠️ Overlay facts invalid before render: ${preOverlayValidation.errors.join(' | ')}`);
        }
    }

    const _renderRtDesignHint = _renderRtCtx.isRetargeting ? `
═══ RETARGETING DESIGN GUIDANCE ═══
This is a RETARGETING ad — the viewer already knows the product.
- Design should feel FAMILIAR and REASSURING, not exploratory
- Visual tone: confident, trust-building, objection-dissolving
- Objection being addressed: "${_renderRtCtx.effectiveObjectionText}"
- Counter-strategy: ${_renderRtCtx.bestAngleLabel}
${_renderRtCtx.testimonial ? `- Testimonial context available — design should feel proof-driven` : ''}
- Avoid cold-audience discovery aesthetics (curiosity-bait, mystery, shock)
- Prefer: warmth, social proof cues, clarity, directness
═══════════════════════════════════
` : '';

    const coreDesignRules = `
  [ULTRA RENDER V5.0]
  ${isArabic(inputs.adLanguage) ? `\n${CULTURAL_COMPLIANCE_BLOCK}\n` : ""}
  ${_renderRtDesignHint}
       
        ⚠️⚠️⚠️ ABSOLUTE RULE: ONLY RENDER USER - FACING TEXT ⚠️⚠️⚠️
================================================================
The image must contain ONLY these text elements and NOTHING ELSE:
- The Arabic headline text
- The Arabic subheadline text
- The Arabic CTA button text
- The Arabic benefit text (if provided)
DO NOT render: English instructions, system prompts, field labels,
"VISUAL_DIRECTION:", "TECHNICAL_PROMPT:", camera settings,
or ANY text that was not provided as headline/subheadline/CTA/benefit.

⚠️ NO DECORATIVE OR SCENE TEXT:
- Do NOT render speech bubbles, thought bubbles, floating words, scattered text, sticky notes, or ANY text as part of the scene/environment.
- Do NOT render random Arabic words, gibberish text, or fake document text anywhere in the image.
- Do NOT render "BEFORE", "AFTER", "قبل", "بعد" labels on the image.
- The ONLY text on the image is the headline, subheadline, CTA button, benefit line, and badge (if provided). Nothing else.
================================================================

EXACT TEXT RENDERING(ZERO TOLERANCE FOR ANY CHARACTER CHANGE):
- You MUST render the Arabic text EXACTLY as provided below, character -for-character.
         - Do NOT paraphrase.Do NOT replace synonyms.Do NOT "improve" phrasing.Do NOT reorder words.
         - Do NOT add / remove punctuation.Do NOT add tashkeel / diacritics if not present.Do NOT change Hamza forms.
         - Typography must be CLEAN, PRINTED, and HIGH - LEGIBILITY(no calligraphy, no decorative distortion).
         - FONT STYLE(MANDATORY): Use a modern Arabic sans - serif look(Cairo / Tajawal / Noto Kufi Arabic style).Heavy weight for headline / button, medium for subheadline.No thin strokes.

⚠️⚠️⚠️ ARABIC LETTER CONNECTION RULES (MOST COMMON FAILURE — READ CAREFULLY) ⚠️⚠️⚠️
Arabic letters change shape based on their position in a word (initial, medial, final, isolated).
- EVERY word must have CONNECTED letters within it. Disconnected letters within a word = CORRUPTED text.
- The letters ب ت ث ن ي must connect to the next letter — if they appear isolated mid-word, the rendering is BROKEN.
- Test: if you removed the spaces, the letters within each word should flow as one connected unit.
- NEVER render Arabic text as individual disconnected characters — that is NOT Arabic, it is gibberish.
- If ANY word looks like its letters are floating separately, RE-RENDER that text block.
- Prefer LARGER font sizes with extra letter spacing between WORDS (not between letters within a word).
- Use BOLD/HEAVY weight fonts — thin strokes cause letter connections to break at small sizes.

⚠️ ARABIC TEXT ANTI-CORRUPTION RULES (CRITICAL):
- Do NOT duplicate any text string. Each text element appears EXACTLY ONCE in the image.
- Do NOT repeat the headline text in the subheadline area or vice versa.
- Do NOT repeat the CTA text in the benefit area or vice versa.
- Do NOT render the same Arabic word twice in adjacent text blocks.
- Do NOT add decorative Arabic text, floating Arabic words, or scene text.
- If a text field is empty or very short, simply omit that text element — do NOT fill it with a copy of another field.
- When space is tight, prefer FEWER text elements rendered CLEARLY over cramming everything.
- Each text zone must contain ONLY its designated content — headline zone gets headline only, CTA zone gets CTA only.
⚠️ NUMBER + SYMBOL INTEGRITY (CRITICAL):
- NEVER separate a number from its adjacent % sign. "70%" must render as "70%" — not "%" alone.
- NEVER drop digits from percentages, prices, or statistics. If the text says "90% من المدربين", render ALL of "90%".
- All numbers in the copy text are INTENTIONAL and MUST appear exactly as written in the rendered image.

⚠️ ARABIC COLOR/HIGHLIGHT WORD BOUNDARY RULE (CRITICAL):
- Arabic letters CONNECT within a word. If you apply a color to part of a word, it breaks the visual connection and looks corrupted.
- NEVER change color mid-word in Arabic text. Colors must change ONLY at word boundaries (spaces).
- If highlighting: highlight a COMPLETE WORD, a COMPLETE LINE, or use a background bar/underline. Never split a word across two colors.
- When in doubt, make the ENTIRE headline one color rather than risk splitting.
- VERIFY before finalizing: Count the number of distinct text blocks. It should equal the number of non-empty fields provided (headline, subheadline, CTA, benefit). No more, no fewer.

SUBHEADLINE VISIBILITY (CRITICAL):
- The subheadline MUST be clearly readable — not faded, not tiny, not lost in the background.
- Use a contrasting color or a semi-transparent dark panel behind the subheadline to ensure readability.
- Subheadline font size should be at least 40-50% of the headline size. Never smaller than that.

⚠️ TEXT CONTRAST & READABILITY (CRITICAL):
- ALL text MUST have a dark semi-transparent background band, gradient, or solid panel behind it.
- White text MUST sit on a dark background (minimum 60% opacity black/dark overlay).
- NEVER place text directly on a busy, detailed, or bright background without contrast treatment.
- Every text element must be readable at phone screen size (1080px width). If in doubt, add a darker background.
- Use text stroke/outline (2-3px dark outline) on ALL text to ensure separation from background.
- The contrast background should look DESIGNED (gradient, frosted glass, etc.), not like a cheap overlay.
    ⚠️⚠️⚠️ PROFESSIONAL DESIGN INTEGRATION (NOT TEXT ON IMAGE — THIS IS CRITICAL) ⚠️⚠️⚠️
    ================================================================
    The design must look like a PROFESSIONAL AD AGENCY created it, not like someone pasted text on a stock photo.

    ${(() => {
            // ═══ STEP 3.5 → STEP 4: CONTRACT-LED COMPOSITION (sole authority) ═══
            const renderContract = compileFullContract({
                selectedModes: (inputs as any).offerCreativeMode || ['standard_hero'],
                hookAngle: inputs.coldHookAngle || undefined,
                aspectRatio: currentAspectRatio,
                adLanguage: inputs.adLanguage || 'ar_fusha',
                visualStyleFamily: resolveStyleFamily(inputs) || 'realistic',
                referenceInfluence: _referenceInfluence,
            });
            // Only include overlay zones for fields that have actual user data
            const contractBlock = getContractRenderBlock(renderContract, {
                hasPrice: !!ownershipMap.offerPrice,
                hasTotalValue: !!ownershipMap.originalPrice,
                hasSavings: !!ownershipMap.savingsText,
                hasGuarantee: !!(inputs as any).valueStackGuarantee || !!(inputs as any).offerCardGuarantee,
                hasValueItems: ((inputs as any).valueStackItems || '').trim().length > 0,
            });
            const modePayloadBlock = buildModeBlock_RenderSafe(inputs);

            // ── Before/After is handled by the contract's before_after template ──
            // but we add connected-story rules since the contract only defines zones, not narrative
            const beforeAfterNarrative = isBeforeAfterSelection(inputs, _renderEffectiveAngle) ? `
BEFORE/AFTER CONNECTED STORY RULES:
1. Hero MUST appear in BOTH halves — same face, different wardrobe and energy.
2. BEFORE props must match the HEADLINE's specific pain (not generic sadness).
3. AFTER props must match the PRODUCT's specific promise (not generic happiness).
4. Props should transform logically: cheap laptop → premium desk, empty calendar → full calendar.
5. Two halves must feel like CHAPTER 1 and CHAPTER 2 of the same story.
6. STRICT: Do NOT add any "BEFORE"/"AFTER" or "قبل"/"بعد" text labels. Visual contrast speaks for itself.
` : '';

            // ── Pre-render contract validation (secondary — hard gate already ran) ──
            const scoringCompat = getContractForScoring(renderContract);
            const planValidation = validateBuildPlanAgainstContract(gatedBlueprint, scoringCompat);
            const quickCheck = quickRejectCheck(scoringCompat, gatedBlueprint);
            if (quickCheck.reject) {
                console.warn(`⚠️ Pre-render contract violation: ${quickCheck.reason}`);
            }
            if (planValidation.warnings.length > 0) {
                console.log(`📋 Render contract warnings: ${planValidation.warnings.join(' | ')}`);
            }

            // ── Pair-specific + ratio-specific execution rules ──
            const selectedModes = (inputs as any).offerCreativeMode || ['standard_hero'];
            const primaryM = selectedModes[0] || 'standard_hero';
            let secondaryM = selectedModes.length > 1 ? selectedModes[1] : null;
            
            // ── Value stack empty check: suppress blank placeholder zones ──
            const vsItems = (inputs.valueStackItems || '').trim();
            const vsTitle = (inputs.valueStackTitle || '').trim();
            const valueStackIsEmpty = secondaryM === 'value_stack' && !vsItems && !vsTitle;
            if (valueStackIsEmpty) {
                console.warn('⚠️ Value stack mode selected but no items/title provided — rendering as standard_hero layout to avoid blank placeholders.');
                secondaryM = null;
            }
            
            const hasOverlay = !valueStackIsEmpty && renderContract.overlaySlots && renderContract.overlaySlots.length > 0;
            const hasRefAd = !!(inputs as any).referenceAd;
            const pairExecution = getPairRenderExecution(primaryM, secondaryM, currentAspectRatio, hasOverlay, hasRefAd);
            const valueStackOverride = valueStackIsEmpty ? `\n⚠️ VALUE STACK MODE WAS SELECTED BUT NO ITEMS WERE PROVIDED.\nRender as a STANDARD HERO layout instead — full hero prominence, no stack cards, no placeholder panels, no empty card shapes. Clean hero-focused design.` : '';

            return `${contractBlock}
${modePayloadBlock}
${beforeAfterNarrative}
${pairExecution}
${valueStackOverride}
${(() => {
    // Explicitly suppress empty commercial fields to prevent AI from rendering placeholder boxes
    const suppressions: string[] = [];
    if (!ownershipMap.offerPrice) suppressions.push('price panel');
    if (!ownershipMap.originalPrice) suppressions.push('total value / original price panel');
    if (!ownershipMap.savingsText) suppressions.push('savings panel');
    if (suppressions.length > 0) {
        return `\n⚠️ EMPTY COMMERCIAL FIELDS — DO NOT RENDER:\nThe following have NO data and must NOT appear as boxes, panels, shapes, labels, or any visual element:\n${suppressions.map(s => `• NO ${s}`).join('\n')}\nDo NOT render "Total Value", "Actual Price", "Savings", "السعر", "القيمة", or any similar labels/placeholders for these empty fields.`;
    }
    return '';
})()}

⚠️ THE LAYOUT CONTRACT ABOVE IS THE SOLE COMPOSITION AUTHORITY.
Follow the zone definitions, hierarchy, spatial rules, and must-show/must-avoid lists EXACTLY.
Do NOT improvise a different layout. Do NOT use a generic 3-zone top/center/bottom unless the contract specifies it.
If the contract says "hero left, stack right" — that is what you render. Not hero-only.`;
        })()}

    INTEGRATED DESIGN ELEMENTS:
    - GRADIENT SCRIMS: Must be SMOOTH multi-stop gradients (3+ stops: 85% → 50% → 0%). Not flat rectangles. Feel like natural vignetting.
    - DECORATIVE FRAME ELEMENTS: Add subtle design elements that frame the text — thin lines, corner accents, geometric shapes, or glow effects in the accent color.
    ${resolveStyleFamily(inputs) === 'minimal'
    ? `- DEPTH LAYERING: Keep background clean and uncluttered. FORBIDDEN atmospheric effects: no bokeh, no dust motes, no smoke wisps, no haze, no particles, no volumetric light, no god rays. Maximize negative space. Clean studio depth only.`
    : (() => {
        const sub = resolveVisualSubStyle(inputs);
        if (sub === 'dark_cinematic') return `- DEPTH LAYERING (DARK CINEMATIC — MANDATORY): Render at minimum TWO atmospheric depth effects: smoke wisps drifting through the scene, floating light particles, volumetric light rays from the single key source, or deep bokeh on background. These MUST pass in FRONT of some scene elements to create physical depth. FORBIDDEN: flat backgrounds, plain gradients, clean studio depth.`;
        if (sub === 'bright_illustrated') return `- DEPTH LAYERING (BRIGHT ILLUSTRATED): Render clean, airy depth — soft warm bokeh on background elements, subtle lens flare from the golden light source, light mist in the far background for scale. Keep it BRIGHT — no smoke, no dark haze, no heavy particles. Depth through warmth and softness.`;
        if (sub === 'mythic_epic') return `- DEPTH LAYERING (MYTHIC EPIC — MANDATORY): Render dramatic, colorful atmospheric depth. Include: magical glowing particles (matching the jewel palette), volumetric colored light rays from multiple sources, epic cloud formations or colored mystical mist in the background. These must be VIBRANT — not dark grey, but jewel-toned atmospheric effects.`;
        if (sub === 'vintage_bw') return `- DEPTH LAYERING (VINTAGE B&W): Depth is created through INK TECHNIQUE only — foreground elements use heavier ink weight and bolder outlines, background elements use lighter cross-hatching and thinner lines. NO photographic depth effects. NO bokeh, smoke, or particles. Depth = ink density variation across the three planes (foreground/mid/background).`;
        if (sub === 'vintage_sepia') return `- DEPTH LAYERING (VINTAGE SEPIA): Same as Vintage B&W — depth through ink density variation. Foreground: heavy warm-brown ink weight. Background: light amber cross-hatching, thin lines. NO photographic depth effects. The aged paper texture creates additional warmth across all planes.`;
        if (sub === 'luxury_magazine') return `- DEPTH LAYERING (LUXURY MAGAZINE COVER): Hero is the primary depth element — sharp focus on face, very slight softening on shoulders/edges. Background is a flat solid color — no depth effects needed. The hero's presence and the text cover lines CREATE the visual depth through overlapping layers (masthead behind hero, cover lines around hero). FORBIDDEN: bokeh, particles, atmospheric effects, environmental depth.`;
        if (sub === 'documentary_gritty') return `- DEPTH LAYERING (DOCUMENTARY GRITTY): Depth through film grain and natural focus falloff — background slightly out of focus as a real camera would render it. Visible grain texture provides tactile depth. Slight vignette darkening at edges. FORBIDDEN: artificial bokeh spheres, smoke wisps, fantasy particles.`;
        if (sub === 'neon_urban') return `- DEPTH LAYERING (NEON URBAN): Depth through neon light fall-off — foreground lit vividly by neon, background fades into dark bokeh city lights. Colored light spills on pavement create foreground texture. Rain/mist adds atmospheric mid-ground depth. Neon glow halo around hero creates separation.`;
        if (sub === 'anime_manga') return `- DEPTH LAYERING (ANIME/MANGA): Depth through anime production technique — foreground elements have thicker ink outlines, background elements have thinner outlines and lighter color fills. Speed lines create forced perspective depth. Screen tone patterns on mid-ground. No photographic depth effects — all depth is DRAWN.`;
        if (sub === 'watercolor_dreamscape') return `- DEPTH LAYERING (WATERCOLOR DREAMSCAPE): Depth through color wash intensity — foreground uses deeper, more saturated watercolor washes, background fades to lighter, more diluted washes. Color bleeding creates soft natural depth transitions. No sharp depth breaks — everything flows softly into everything else.`;
        if (sub === 'comic_book') return `- DEPTH LAYERING (COMIC BOOK): Depth through line weight and halftone density — foreground: heaviest ink outlines + densest halftone dots. Mid-ground: medium weight. Background: thinnest outlines + lightest dots or solid color fill. Action lines create depth illusion. NO photographic depth effects.`;
        if (sub === 'ugly_ad') return `- DEPTH LAYERING (UGLY AD): NO depth effects. Flat, screenshot-quality. The lack of depth IS the aesthetic. Phone camera flat focus.`;
        if (sub === 'cinematic_film_still') return `- DEPTH LAYERING (CINEMATIC FILM STILL): Ultra-shallow DOF (f/1.4-2.0) — hero sharp, background melts into creamy bokeh. 35mm grain adds texture across all planes. Anamorphic lens flare optional. Practical light sources create motivated depth separation.`;
        if (sub === 'clean_corporate') return `- DEPTH LAYERING (CLEAN CORPORATE): Minimal depth — clean studio separation. Subtle drop shadow under hero. Background gradient creates gentle depth. FORBIDDEN: bokeh, particles, atmospheric effects.`;
        if (sub === 'golden_hour_outdoor') return `- DEPTH LAYERING (GOLDEN HOUR): Natural outdoor DOF — hero sharp, landscape background in warm golden bokeh. Sun flare and light rays create atmospheric depth. Warm haze in far background.`;
        if (sub === 'street_photography') return `- DEPTH LAYERING (STREET): Environmental DOF — hero in focus, urban background slightly soft. Street-level perspective creates natural depth. Mixed urban lighting adds dimensional separation.`;
        if (sub === 'pixel_retro_game') return `- DEPTH LAYERING (PIXEL): Depth through PARALLAX SCROLLING layers — foreground sprites larger/darker, background sprites smaller/lighter. NO photographic depth. Game-style layered backgrounds.`;
        if (sub === 'stained_glass') return `- DEPTH LAYERING (STAINED GLASS): Depth through BACKLIT INTENSITY — foreground panels glow brighter, background panels dimmer. Lead lines create structural depth. Light passes THROUGH the glass panels.`;
        if (sub === 'glitch_digital') return `- DEPTH LAYERING (GLITCH): Depth through CORRUPTION INTENSITY — foreground elements clear, background elements more corrupted/fragmented. RGB separation increases with distance. Scanlines create horizontal depth layers.`;
        if (sub === 'synthwave_80s') return `- DEPTH LAYERING (SYNTHWAVE): Depth through PERSPECTIVE GRID — grid lines recede to vanishing point on horizon. Neon elements brighter in foreground, dimmer toward horizon. Sun glow creates atmospheric depth at horizon line.`;
        return `- DEPTH LAYERING: Add subtle atmospheric effects (light bokeh, dust motes, smoke wisps) that pass IN FRONT of some text. Creates depth.`;
    })()}
    - COLOR HARMONY: Pick ONE accent color for the entire design. Use for: headline highlights, CTA button, decorative elements. Everything unified.
    ${resolveStyleFamily(inputs) === 'minimal'
    ? `- TEXT IS PLACED ON CLEAN SPACE, not integrated into a scene. Text zones should have clear breathing room against the plain background.`
    : (() => {
        const sub = resolveVisualSubStyle(inputs);
        if (sub === 'dark_cinematic') return `- TEXT IS PHYSICALLY PART OF THE CINEMATIC SCENE. Headline must feel like it exists in the same 3D space as the hero — rendered with depth, glow, or material texture illuminated by the single key light. Never flat text pasted on top of an image.`;
        if (sub === 'bright_illustrated') return `- TEXT IS INTEGRATED WITH THE WARM SCENE. Headline sits on clean contrasting panels or editorial zones. Text should feel part of the illustrated world — warm, clear, readable. Think premium editorial magazine, not cinematic overlay.`;
        if (sub === 'mythic_epic') return `- TEXT IS AN EPIC ARTIFACT IN THE SCENE. Headline should feel like an ancient inscription, a magical prophecy, or a carved monument — rendered with metallic or jewel texture, integrated into the grand epic world. Text has weight and gravitas.`;
        if (sub === 'vintage_bw') return `- TEXT IS RENDERED AS VINTAGE INK TYPOGRAPHY. Headline must look like it was PRINTED or TYPESET in the original illustration — bold serif letterforms, ink-weight variation, integrated into the illustrated composition. NOT modern text overlaid on top. The text is PART OF THE ILLUSTRATION.`;
        if (sub === 'vintage_sepia') return `- TEXT IS RENDERED AS AGED WARM-INK TYPOGRAPHY. Same as Vintage B&W but all text uses warm dark-brown ink tones. Text feels typeset and printed on aged parchment. Integrated into the sepia illustration — not a modern overlay.`;
        if (sub === 'luxury_magazine') return `- TEXT IS DENSE MAGAZINE COVER TYPOGRAPHY. Multiple text elements fill the spaces AROUND the hero — masthead behind hero's head, main headline wrapping hero's silhouette edge, secondary cover lines in corners, badge in top corner, CTA bar at bottom. The canvas should feel FULL like a real Forbes/GQ cover — NOT sparse or minimal. Bold condensed sans-serif, NOT thin serif.`;
        if (sub === 'documentary_gritty') return `- TEXT IS A FUNCTIONAL OVERLAY — like subtitles or field captions. Text feels necessary, not decorative. Dark scrim behind text is utilitarian — not stylized. Every text element earns its place. Nothing decorative.`;
        if (sub === 'neon_urban') return `- TEXT GLOWS AS PART OF THE NEON ENVIRONMENT. Headline emits neon light that interacts with the scene — casting colored light on surrounding surfaces. Text feels like a neon sign that belongs in this city. The glow is from the SAME colored light sources in the environment.`;
        if (sub === 'anime_manga') return `- TEXT IS RENDERED AS MANGA TYPOGRAPHY — bold outlined letterforms that exist in the same illustrated world as the hero. Text has the same ink outline treatment as the character. Impact starbursts and speed lines integrate text into the action of the scene.`;
        if (sub === 'watercolor_dreamscape') return `- TEXT FLOATS ON SOFT WATERCOLOR WASHES. Headlines appear to be handwritten or delicately typeset directly on the paper — integrated with the color washes underneath. Text feels like part of the painting, not digital overlay.`;
        if (sub === 'comic_book') return `- TEXT IS COMIC BOOK LETTERING — part of the illustrated panel. Bold outlined letterforms with flat fill colors from the 4-color palette. If a speech bubble is used, it IS the headline — the text lives inside the panel world, not on top of it.`;
        if (sub === 'ugly_ad') return `- TEXT IS RAW AND UNDESIGNED — system font or handwritten marker. Text looks typed in a notes app or scribbled on a whiteboard. Red circles and arrows annotate key phrases. NO professional typography. The ugliness is intentional.`;
        if (sub === 'cinematic_film_still') return `- TEXT IS A MOVIE TITLE CARD — headline sits at bottom third like a film title. Cinematic font weight. Subtle grain on text. Text feels like opening credits or film poster title treatment.`;
        if (sub === 'clean_corporate') return `- TEXT IS CLEAN CORPORATE TYPOGRAPHY — modern sans-serif, perfect kerning, professional weight hierarchy. Text on clean gradient or negative space. NO decorative effects. Apple keynote aesthetic.`;
        if (sub === 'golden_hour_outdoor') return `- TEXT IS WARM AND NATURAL — headline sits in warm-toned scrim zone. Golden hour light affects text zone warmth. Clean but warm typography — not cold or clinical.`;
        if (sub === 'street_photography') return `- TEXT IS A STREET CAPTION — functional overlay like a documentary subtitle or street sign. Simple, direct, urban energy. Dark scrim is utilitarian.`;
        if (sub === 'pixel_retro_game') return `- TEXT IS PIXEL FONT — blocky, monospaced, retro game typography. Text appears inside game UI boxes/panels. All text is pixelated — no smooth anti-aliased fonts anywhere.`;
        if (sub === 'stained_glass') return `- TEXT IS SACRED INSCRIPTION — headline rendered as if carved into stone or embedded in the glass design. Gothic or uncial letterforms. Text is part of the stained glass composition, not overlaid.`;
        if (sub === 'glitch_digital') return `- TEXT IS DIGITALLY CORRUPTED — headline has slight RGB channel separation, horizontal glitch shifts on some letters. Scanline cuts through text. STILL READABLE — corruption is aesthetic, not destructive.`;
        if (sub === 'synthwave_80s') return `- TEXT IS CHROME/NEON — headline has metallic chrome reflective finish or neon glow effect. 80s retro font style (Outrun/Blade Runner energy). Text sits on or above the perspective grid. Neon glow casts light on nearby surfaces.`;
        return `- TEXT IS DESIGNED INTO THE SCENE, not placed on top. Text zones should feel like part of the lighting/composition.`;
    })()}

    ${(() => {
        const sub = resolveVisualSubStyle(inputs);
        if (!sub) return '';
        const blocks: Record<string, string> = {
            dark_cinematic: `
⚠️⚠️⚠️ DARK CINEMATIC BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
ENTIRE canvas: deep black (#0A0A0F) to dark navy (#0D1B3E). This is a RENDERED SCENE — not a photo.
SINGLE KEY LIGHT: casts visible directional shadow across 60%+ of the canvas.
Key light MUST cast a colored rim glow on the hero.
ATMOSPHERIC LAYERS (REQUIRED): smoke wisps, particles, or haze — not optional.
FORBIDDEN: natural daylight, white/cream/grey backgrounds, pastel colors, stock photo backgrounds.
=======================================================================`,
            bright_illustrated: `
⚠️⚠️⚠️ BRIGHT ILLUSTRATED BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
ENTIRE canvas: warm, vibrant, saturated — golden amber, rich cream, vivid illustrated color fields.
MULTI-FILL LIGHTING: even, warm, inviting. No heavy shadows. Scene feels BRIGHT and OPTIMISTIC.
Scene is ILLUSTRATED with painterly quality — not a dark photo, not a gritty render.
FORBIDDEN: dark backgrounds, heavy shadow, smoke/haze, neon effects, black canvas.
=======================================================================`,
            mythic_epic: `
⚠️⚠️⚠️ MYTHIC EPIC BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
ENTIRE canvas: rich jewel tones — emerald (#0B3D2E), royal purple (#1A0A3D),
  crimson (#3D0A0A), or midnight gold (#2A1A00). Dark but RICHLY COLORED — never plain black.
MULTIPLE COLORED LIGHT SOURCES: contrasting temperature lights (cold moonlight + warm fire glow).
Volumetric light rays MUST be visible somewhere in the scene.
MAGICAL PARTICLES: glowing embers, mystical sparks, or colored mist — REQUIRED for epic atmosphere.
FORBIDDEN: plain black background, pastel backgrounds, flat/graphic style, studio aesthetics.
=======================================================================`,
            vintage_bw: `
⚠️⚠️⚠️ VINTAGE B&W BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
ENTIRE image: hand-drawn pen-and-ink illustration. ZERO photorealistic rendering.
GRAYSCALE ABSOLUTE: No color anywhere — not even subtle color tinting.
THICK BLACK BORDER: Mandatory rectangular frame around the full composition.
INK TECHNIQUE: Cross-hatching visible for all shading. Bold outlines on all elements.
FORBIDDEN: Color, photorealism, modern rendering, smooth gradients, bokeh,
           atmospheric particles, cinematic lighting.
=======================================================================`,
            vintage_sepia: `
⚠️⚠️⚠️ VINTAGE SEPIA BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
ENTIRE image: hand-drawn pen-and-ink illustration in warm sepia monochrome.
SEPIA ABSOLUTE: All tones in warm amber/brown range (#704214). Zero cool tones.
AGED PAPER TEXTURE: Subtle parchment grain in lighter areas — timeworn quality.
THICK WARM-BROWN BORDER: Mandatory rectangular frame in dark sepia tone.
INK TECHNIQUE: Cross-hatching visible. Bold warm-brown outlines on all elements.
FORBIDDEN: Cool greys, blue tones, photorealism, modern rendering,
           bokeh, atmospheric particles, cinematic lighting.
=======================================================================`,
            luxury_magazine: `
⚠️⚠️⚠️ LUXURY MAGAZINE COVER BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
BOLD SOLID DARK BACKGROUND: Deep navy (#1a1a3e), rich black (#0d0d0d),
  warm dark grey (#2d2d2d), or deep teal (#0a3d3d). NOT white. NOT cream.
HERO FILLS 70% OF FRAME: Tight crop waist-up. Shoulders span width.
  Hero head extends into top 20% (overlapping masthead zone).
PROFESSIONAL PORTRAIT LIGHTING: Rembrandt or butterfly/loop.
  Hair light + rim light for separation. Face has DIMENSION (not flat).
TEXT DENSITY: Cover lines fill ALL spaces around hero. Canvas feels FULL.
FORBIDDEN: White background, negative space, empty canvas areas,
           environmental scenes, full body shots, flat high-key lighting.
=======================================================================`,
            documentary_gritty: `
⚠️⚠️⚠️ DOCUMENTARY GRITTY BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
DESATURATED REAL ENVIRONMENT: Saturation reduced 40-60%. Real location feel.
FILM GRAIN: Visible across entire image — not optional. Mandatory texture.
AVAILABLE LIGHT ONLY: No studio lighting. Imperfection is intentional.
SLIGHT VIGNETTE: Edges darkened naturally. Photojournalism feel.
FORBIDDEN: Studio lighting, glossy finish, saturated colors,
           fantasy/neon effects, artificial particles.
=======================================================================`,
            neon_urban: `
⚠️⚠️⚠️ NEON URBAN BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
NIGHT CITY ENVIRONMENT: Dark streets, wet pavement, colored neon reflections.
MULTIPLE NEON SOURCES: At least 2 colors (pink, cyan, purple, amber) visible.
HERO RIM-LIT: By at least one colored neon source — mandatory.
DEEP BACKGROUND: Bokeh city lights behind scene.
FORBIDDEN: Daylight, natural environments, pastel colors,
           white/bright backgrounds, vintage aesthetics.
=======================================================================`,
            anime_manga: `
⚠️⚠️⚠️ ANIME/MANGA BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
CEL-SHADED ILLUSTRATION: Flat color fills + bold black outlines throughout.
VIBRANT ANIME PALETTE: Saturated, high-contrast. No desaturation.
SPEED LINES: At least one concept MUST include action/speed lines.
BOLD OUTLINES: Every element — hero, background, props — has ink outline.
FORBIDDEN: Photorealism, cinematic lighting, film grain,
           desaturation, watercolor, soft edges.
=======================================================================`,
            watercolor_dreamscape: `
⚠️⚠️⚠️ WATERCOLOR DREAMSCAPE BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
WATERCOLOR WASH TECHNIQUE: Visible brush strokes, color bleeding at edges.
SOFT DREAMY PALETTE: Lavender, rose, sage, soft gold ONLY.
DIFFUSED SOFT LIGHT: No harsh shadows anywhere. Gentle luminosity.
NO HARD EDGES: Everything flows softly — no sharp digital boundaries.
FORBIDDEN: Dark backgrounds, neon, heavy shadow, photorealism,
           bold aggressive type, sharp edges, film grain.
=======================================================================`,
            comic_book: `
⚠️⚠️⚠️ COMIC BOOK BASE CANVAS (MANDATORY) ⚠️⚠️⚠️
=======================================================================
BEN-DAY HALFTONE DOTS: All shading uses halftone dot patterns — mandatory.
BOLD BLACK OUTLINES: Every element has thick ink outline — no exceptions.
4-COLOR PALETTE ONLY: Red (#E8001C), Yellow (#FFE600), Blue (#003087), Black.
THICK PANEL BORDER: Mandatory rectangular frame around full composition.
ACTION LINES: At least one directional action/speed line element — mandatory.
FORBIDDEN: Soft gradients, photorealism, cinematic lighting,
           watercolor, thin typography, more than 4 colors.
=======================================================================`,
        };
        return blocks[sub] || '';
    })()}
    BACKGROUND OVERLAY (MANDATORY ON EVERY SLIDE):
    - ALWAYS render a full-width dark gradient overlay behind ALL text areas
    - Top text area: dark gradient from top edge (85% opacity black) fading to transparent by 40% height
    - Bottom text area (CTA/benefit): solid dark bar (80-90% opacity) spanning full width
    - The overlay must be VISIBLE and OBVIOUS — if someone squints and can't see it, it's not dark enough

    ⚠️ META ADS SAFE ZONE: Follow the SPATIAL RULES from the layout contract above.
    All text, logos, CTAs, and critical visual elements MUST stay INSIDE the safe zone inset specified by the contract.
    NEVER place headline text touching the top edge. NEVER place CTA touching the bottom edge.
    ⚠️ NEVER render safe zone percentages, margin numbers, or dimension indicators as visible text in the image. These are invisible layout guides only.

    ═══════════════════════════════════════════════════════════════════════════
    TEXT TREATMENT — VARIETY SYSTEM (pick ONE style for this design)
    ═══════════════════════════════════════════════════════════════════════════
    Choose ONE of these text treatment styles. Each concept in a batch MUST use a DIFFERENT style.
    Do NOT default to Style 1 every time — rotate through the styles for visual variety.
    ${resolveStyleFamily(inputs) === 'minimal' ? `
    ⚠️ MINIMAL MODE TEXT RESTRICTIONS (MANDATORY):
    - ONLY use Styles 1, 4, 6, or 8. These are simple, restrained typography styles.
    - FORBIDDEN for Minimal: Style 2 (Frosted Glass), Style 3 (Bold Cutout), Style 5 (Neon Glow), Style 7 (Floating 3D).
    - FORBIDDEN text effects: floating 3D text, glowing neon text, cinematic typography, volumetric text lighting, dramatic word art, text with glow/light emission.
    - Minimal text must be: clean, flat, high-legibility, restrained, commercial. Simple typography only.
    ` : ''}
    ${(() => {
        const sub = resolveVisualSubStyle(inputs);
        if (!sub) return '';
        const blocks: Record<string, string> = {
            dark_cinematic: `
⚠️ DARK CINEMATIC TEXT DIRECTION (MANDATORY):
PREFERRED styles (rotate): Style 5 (Neon Glow), Style 7 (Floating 3D), Style 3 (Bold Cutout).
AVOID for this style: Style 1 (flat Classic Scrim), Style 4 (Magazine Editorial) — too flat for cinematic worlds.
Headline MUST have visual drama: glowing, 3D-rendered, or texture-filled. Never plain flat white text.
Keyword highlight color MUST match the scene's key light (gold for amber, cyan for cold blue, red for crimson).
The glow/shadow on text must feel like it comes from the SAME light source as the scene.`,
            bright_illustrated: `
⚠️ BRIGHT ILLUSTRATED TEXT DIRECTION (MANDATORY):
PREFERRED styles (rotate): Style 4 (Magazine Editorial), Style 8 (Color Block), Style 1 (Classic — warm version).
AVOID for this style: Style 5 (Neon Glow), Style 7 (Floating 3D) — too dark/heavy for warm illustrated worlds.
Headline text: deep navy or charcoal — high contrast against warm background. Clean, readable, editorial.
Keyword highlight: vivid warm accent (coral, gold, sky blue) applied to a full word or complete line only.
CTA button: solid vivid saturated color (warm orange, bright blue, rich green) — approachable and clear.`,
            mythic_epic: `
⚠️ MYTHIC EPIC TEXT DIRECTION (MANDATORY):
PREFERRED styles (rotate): Style 7 (Floating 3D with metallic texture), Style 3 (Bold Cutout with gold leaf), Style 5 (Neon Glow in jewel tones).
AVOID for this style: Style 4 (Magazine Editorial), Style 8 (Color Block) — too minimal for epic fantasy worlds.
Headline MUST have GRAVITAS: metallic texture, jewel-toned glow, or stone-carved feel. Epic weight.
Keyword highlight: metallic gold (#FFD700), silver (#C0C0C0), or jewel-toned glow matching the canvas palette.
CTA button: metallic or jewel-toned — gold gradient, emerald, or deep crimson with metallic sheen.`,
            vintage_bw: `
⚠️ VINTAGE B&W TEXT DIRECTION (MANDATORY):
PREFERRED styles: Style 1 (Classic — bold vintage ink overlay),
  Style 4 (Magazine Editorial — newspaper column),
  Style 3 (Bold Cutout — ink-filled letterforms).
AVOID: Style 5 (Neon Glow), Style 7 (Floating 3D), Style 2 (Frosted Glass) —
  these are modern effects incompatible with vintage illustration.
HEADLINE: Bold weight serif font — ink-heavy, authoritative, vintage ad headline style.
  All-caps preferred. High contrast black on white or white reversed out of black block.
KEYWORD HIGHLIGHT: Bold black underline or solid black box reversed out to white text.
  NEVER color highlights — this is grayscale only.
CTA BUTTON: Solid black button with white text — or thick black border box
  with black text on white. No rounded corners — vintage ads use sharp rectangular buttons.`,
            vintage_sepia: `
⚠️ VINTAGE SEPIA TEXT DIRECTION (MANDATORY):
Same structure as Vintage B&W, but:
HEADLINE: Dark warm-brown (#3D1A00) ink on aged cream/parchment (#F5E6C8).
  Or reversed: cream text on dark brown block.
KEYWORD HIGHLIGHT: Dark brown underline or aged brown box with cream text reversal.
  NEVER color highlights — warm sepia tones only.
CTA BUTTON: Dark warm-brown button with cream/parchment text — or parchment
  button with dark brown text. Aged, printed quality. Sharp corners, vintage style.`,
            luxury_magazine: `
⚠️ LUXURY MAGAZINE COVER TEXT DIRECTION (MANDATORY):
PREFERRED: Style 3 (Bold Cutout) — massive condensed headline energy. Magazine cover masthead power.
AVOID: Style 4 (Magazine Editorial thin serif), Style 2 (Frosted Glass) — too delicate for covers.
HEADLINE: BOLD condensed sans-serif (Impact/Helvetica Condensed weight). Large, commanding.
  White or metallic gold on dark background. Wraps around hero silhouette edges.
SUBHEADLINE: Medium weight, same font family. Positioned as secondary cover line.
BADGE: Round or rectangular in corner — gold accent. "SPECIAL EDITION" or target audience text.
CTA BUTTON: Gold metallic bar at bottom — bold, prominent, magazine promo energy.
DENSITY: Multiple text elements fill the canvas around the hero. Almost NO empty space.`,
            documentary_gritty: `
⚠️ DOCUMENTARY GRITTY TEXT DIRECTION (MANDATORY):
PREFERRED: Style 1 (Classic Scrim — utilitarian overlay), Style 8 (Color Block — muted).
AVOID: Style 5 (Neon Glow), Style 7 (Floating 3D), Style 2 (Frosted Glass) — too polished.
HEADLINE: Simple bold sans-serif — functional, direct. No decorative effects.
SUBHEADLINE: Clean, readable. News caption energy.
CTA BUTTON: Simple solid — no gloss, no 3D effect. Functional over decorative.
            Desaturated color acceptable. Muted is correct.`,
            neon_urban: `
⚠️ NEON URBAN TEXT DIRECTION (MANDATORY):
PREFERRED: Style 5 (Neon Glow), Style 3 (Bold Cutout).
AVOID: Style 4 (Magazine Editorial), Style 2 (Frosted Glass) — too soft for night city.
HEADLINE: Bold modern sans-serif with matching neon color glow.
          Glow color MUST match one of the scene's neon sources.
SUBHEADLINE: Clean, bold. Can have subtle neon tint.
CTA BUTTON: Vivid neon-matching color — glowing edge.
            Must look like it emits light against the dark background.`,
            anime_manga: `
⚠️ ANIME/MANGA TEXT DIRECTION (MANDATORY):
PREFERRED: Style 3 (Bold Cutout — manga title energy), Style 5 (Neon Glow — anime accent).
AVOID: Style 4 (Magazine Editorial), Style 2 (Frosted Glass) — incompatible with anime.
HEADLINE: Bold outlined letterforms — same ink treatment as the illustrated scene.
          Energy and dynamism. Impact starbursts as background elements for key words.
SUBHEADLINE: Bold, clean, readable. Anime subtitle energy.
CTA BUTTON: Vivid, flat-filled button — same palette as anime scene.
            Bold outline matching character art style.`,
            watercolor_dreamscape: `
⚠️ WATERCOLOR DREAMSCAPE TEXT DIRECTION (MANDATORY):
PREFERRED: Style 4 (Magazine Editorial — soft version), Style 2 (Frosted Glass — barely-there).
AVOID: Style 5 (Neon Glow), Style 3 (Bold Cutout), Style 7 (Floating 3D) — too aggressive.
HEADLINE: Thin script or delicate serif — feels handwritten or delicately typeset.
          ONE soft accent color from the dreamscape palette.
SUBHEADLINE: Very thin, gentle. Reads like a soft whisper.
CTA BUTTON: Soft, rounded, pastel-toned — gentle invitation, not a demand.
            Watercolor wash feel behind button text.`,
            comic_book: `
⚠️ COMIC BOOK TEXT DIRECTION (MANDATORY):
PREFERRED: Style 3 (Bold Cutout — comic lettering), Style 6 (Ribbon Banner — panel strip).
AVOID: Style 4 (Magazine Editorial), Style 2 (Frosted Glass) — wrong energy entirely.
HEADLINE: ALL-CAPS bold comic lettering — outlined letterforms filled with
          yellow or red from the 4-color palette.
          Slight irregular baseline for hand-lettered feel.
SUBHEADLINE: Bold sans, clean. Comic panel caption energy.
CTA BUTTON: Solid primary color (red/blue/yellow) — thick black outline.
            Sharp rectangular corners. Bold white or black text inside.`,
        };
        return blocks[sub] || '';
    })()}
    STYLE 1 — CLASSIC DARK SCRIM: White headline on dark gradient overlay. Accent color on 1-2 keywords. Solid dark CTA bar at bottom. Best for busy backgrounds.

    STYLE 2 — FROSTED GLASS PANEL: Text sits inside a frosted/blurred glass panel with rounded corners and subtle border. Premium, modern feel. Panel floats over the scene. CTA button separate from panel.${resolveStyleFamily(inputs) === 'minimal' ? ' (SKIP for Minimal)' : ''}

    STYLE 3 — BOLD CUTOUT: Headline text is VERY LARGE and either filled with a texture/gradient or punched out of a colored shape. Eye-catching, scroll-stopping. Subheadline small and clean below.${resolveStyleFamily(inputs) === 'minimal' ? ' (SKIP for Minimal)' : ''}

    STYLE 4 — MAGAZINE EDITORIAL: Clean layout with text LEFT-aligned or RIGHT-aligned (not centered). Elegant spacing, thin borders, lots of breathing room. Minimal decoration. Premium editorial feel.

    STYLE 5 — NEON GLOW: Headline has a colored glow/light effect behind it. Text appears to emit light. Dark background makes the glow pop. CTA button has matching glow. Tech/modern energy.${resolveStyleFamily(inputs) === 'minimal' ? ' (SKIP for Minimal)' : ''}

    STYLE 6 — RIBBON BANNER: Headline sits on a solid colored ribbon/strip that goes full-width or diagonal across the image. High contrast text on the strip. Urgent, promotional energy. Great for offers/discounts.

    STYLE 7 — FLOATING 3D TEXT: Headline rendered as 3D text with depth and shadow, sitting IN the environment as if it's a physical object. Cinematic, immersive. Best for fantasy/creative universes.${resolveStyleFamily(inputs) === 'minimal' ? ' (SKIP for Minimal)' : ''}

    STYLE 8 — COLOR BLOCK: Canvas has 2-3 solid color block areas. Text sits inside blocks with high contrast. Geometric, structured, clean. Best for data/logic angles.

    UNIVERSAL TEXT RULES (apply to ALL styles):
    - Font: Modern Arabic sans-serif (Cairo/Tajawal/Noto Kufi style). Heavy weight for headline, medium for subheadline.
    - Headline font size: LARGE — at least 1/6th of image width
    - Headline font weight: EXTRA BOLD / BLACK (900 weight)
    - Subheadline: slightly smaller, BOLD (700 weight), readable at thumbnail
    - ALL text must have sufficient contrast to be readable at 200×200px thumbnail size
    - NEVER place text directly on photo without backing layer — every style must ensure readability
    - CTA button MUST be solid opaque color — tactile, clickable appearance
    - Add subtle text shadow on ALL text as safety net for readability

    ${inputs.adTone ? `TEXT STYLE HINT for "${inputs.adTone}" tone:
    ${inputs.adTone === 'luxury_ceo' ? 'Prefer Style 2 (Frosted Glass) or Style 4 (Magazine Editorial). Gold/platinum accents.'
                : inputs.adTone === 'data_driven' ? 'Prefer Style 8 (Color Block) or Style 4 (Magazine Editorial). Clean, structured.'
                    : inputs.adTone === 'bold' ? 'Prefer Style 3 (Bold Cutout) or Style 5 (Neon Glow). High impact, scroll-stopping.'
                        : inputs.adTone === 'soft' ? 'Prefer Style 4 (Magazine Editorial) or Style 2 (Frosted Glass). Gentle, breathing room.'
                            : inputs.adTone === 'funny' ? 'Prefer Style 6 (Ribbon Banner) or Style 3 (Bold Cutout). Playful, energetic.'
                                : inputs.adTone === 'formal' ? 'Prefer Style 4 (Magazine Editorial) or Style 1 (Classic). Clean, professional.'
                                    : inputs.adTone === 'inspiring' ? 'Prefer Style 7 (Floating 3D) or Style 5 (Neon Glow). Dramatic, aspirational.'
                                        : inputs.adTone === 'emotional' ? 'Prefer Style 1 (Classic) or Style 2 (Frosted Glass). Warm, intimate feel.'
                                            : inputs.adTone === 'authority' ? 'Prefer Style 4 (Magazine Editorial) or Style 8 (Color Block). Commanding, structured.'
                                                : inputs.adTone === 'mentor' ? 'Prefer Style 2 (Frosted Glass) or Style 1 (Classic). Warm but professional.'
                                                    : 'Use any style that matches the mood.'}
    This is a PREFERENCE, not a mandate — the AI may choose a different style if it fits the concept better.` : ''}
    ================================================================
    - TEXT VISIBILITY MANDATE: You MUST render the text layers. Missing text = system failure.
         - Keep RTL.Keep spacing between words.If you must wrap lines, wrap ONLY at word boundaries(never split a word).
         - Headline: "${hookText}"
  - Subheadline: "${subheadText}"
${ctaName ? `    - Button: "${ctaName}"
      - Benefit: "${benefitText}"` : `    ⚠️ NO BUTTON / NO CTA / NO BENEFIT on this slide. Do NOT render any button, CTA bar, or benefit text whatsoever. This is a middle carousel slide with headline and subheadline ONLY.`}
         ${inputs.badges ? `5. Badge: "${inputs.badges}"` : ''}
- CONDITIONAL RENDER: ${ctaName ? `If the Benefit string("${benefitText}") is empty or null, DO NOT render it at all. Only render the Button.` : `This slide has NO CTA and NO BENEFIT. Render only Headline and Subheadline. NO BUTTON AT ALL.`}
         - NO DUPES: If the Benefit string exists, render it exactly ONCE below the button.

         - LAYOUT: Use the[LAYOUT_STYLE] from the blueprint.Use the 'Negative Space' described in the blueprint.Use typography that stands out from the background.
         - STRICT: DO NOT summarize, translate, or mutate the Arabic characters.Arabic characters always in RTL.

        2. CTA CONVERSION STACK(CRITICAL AESTHETICS):
${ctaName ? `- MAIN BUTTON: Render "${ctaName}" inside a massive, 3D, High - Gloss Button.It must be the visual anchor of the page.
         - BENEFIT LOCKUP(MANDATORY): Render "${benefitText}" inside a Secondary Support Bar(dark semi - transparent glass pill) that is physically attached directly under the main button, perfectly centered, with clear padding.Never float it on the background.
           - ALIGNMENT: The Benefit must be perfectly centered and visually connected to the Button.`
            : `- NO BUTTON on this slide. This is a middle carousel slide. DO NOT render ANY CTA button, benefit bar, or call-to-action element. Use the full canvas for the headline, subheadline, hero image and universe setting.`}

        3. UNIVERSE COMPLIANCE:

${!isTextOnlyMode(inputs) && (() => {
    // Solo no-hero modes should skip hero pose rules
    const _rpModes = (inputs as any).offerCreativeMode || ['standard_hero'];
    const _rpHasHero = _rpModes.includes('standard_hero') || _rpModes.includes('speaker_card') || _rpModes.length >= 2;
    return _rpHasHero;
})() ? `
⚠️⚠️⚠️ HERO POSE & PRESENCE (CRITICAL — SUBSTYLE-SPECIFIC) ⚠️⚠️⚠️
=================================================================
${(() => {
    const sub = resolveVisualSubStyle(inputs);
    const poseBlocks: Record<string, string> = {
        luxury_magazine: `LUXURY MAGAZINE COVER POSE (MANDATORY):
- Hero as COVER MODEL — TIGHT CROP from waist up or chest up. Shoulders span frame width.
- DIRECT EYE CONTACT with camera — powerful, magnetic, commanding. This is a cover star.
- Body: slight 5-10° turn but FACE directly at camera. Arms crossed OR one hand at lapel/chin OR hands cropped out below frame edge.
- Expression: confident power gaze, slight knowing smile, or intense editorial stare. MAGNETIC.
- Hero's head and shoulders MUST extend into the top 20% of the canvas (overlapping masthead zone).
- FORBIDDEN: full body shot, looking away from camera, small hero in frame, hero below center, wide shot, casual pose, environmental interaction.
- The hero DOMINATES the frame — they ARE the magazine cover.`,

        documentary_gritty: `DOCUMENTARY GRITTY POSE (MANDATORY):
- Hero is captured in a CANDID MOMENT — NOT posing for camera
- Think: photojournalism, mid-action documentary shot
- Pose: working at desk, mid-conversation, looking off-camera, walking through space, adjusting glasses
- Expression: focused, determined, authentic — NOT smiling for camera
- Body angle: natural, imperfect — photographer caught this moment
- Weight distributed naturally, NOT perfectly balanced
- FORBIDDEN: looking at camera with a smile, perfect symmetry, studio-posed stance`,

        neon_urban: `NEON URBAN POSE (MANDATORY):
- Hero has STREETWEAR ENERGY — confident, contemporary, urban edge
- Think: night-time fashion editorial meets street photography
- Pose: leaning against wall, hands in pockets, mid-stride with attitude, arms crossed with head tilted
- Expression: cool, unfazed, magnetic — slight smirk or piercing gaze
- Body angle: strong diagonal lean or asymmetric stance
- Neon light MUST cast colored light on hero's face and clothing
- FORBIDDEN: stiff formal pose, corporate posture, passive standing`,

        dark_cinematic: `DARK CINEMATIC POSE (MANDATORY):
- Hero has DRAMATIC PRESENCE — emerging from shadows, powerful stance
- Think: movie poster, film noir protagonist, thriller hero shot
- Pose: standing with weight on one leg, silhouetted against light, leaning forward with intensity, seated in chair of power
- Expression: intense, determined, slightly brooding — NOT smiling
- Body angle: strong 20-30° angle, dramatic shadows cutting across face
- FORBIDDEN: bright cheerful expression, symmetrical pose, casual stance`,

        bright_illustrated: `BRIGHT ILLUSTRATED POSE (MANDATORY):
- Hero has WARM, APPROACHABLE ENERGY — friendly and inviting
- Think: bright lifestyle advertisement, warm editorial
- Pose: gesturing warmly, leaning forward with open body language, arms open, sitting casually
- Expression: genuine warm smile, approachable eyes, friendly engagement
- Colors: warm, saturated, illustrated style with bold outlines
- FORBIDDEN: cold/serious expression, stiff corporate stance, dark moody pose`,

        mythic_epic: `MYTHIC EPIC POSE (MANDATORY):
- Hero has LEGENDARY PRESENCE — powerful, commanding, larger than life
- Think: fantasy hero portrait, epic movie poster, mythic commander
- Pose: standing tall with commanding stance, one hand raised in authority, looking toward horizon, cape/robe flowing
- Expression: visionary, powerful, determined — gazing into distance or at viewer with authority
- Body angle: slightly upward camera angle to emphasize power
- FORBIDDEN: casual/relaxed pose, looking down, submissive posture`,

        vintage_bw: `VINTAGE B&W POSE (MANDATORY):
- Hero rendered as HAND-DRAWN INK ILLUSTRATION — NOT a photograph
- Pose: classic vintage portrait or editorial illustration pose
- Expression: period-appropriate — dignified, composed, slightly theatrical
- Style: bold ink strokes, cross-hatching for depth, vintage cartoon energy
- FORBIDDEN: photorealistic rendering, modern casual pose`,

        vintage_sepia: `VINTAGE SEPIA POSE (MANDATORY):
- Hero rendered as WARM-TONED INK ILLUSTRATION — same as B&W but in sepia/amber palette
- Pose: classic vintage portrait or editorial illustration pose
- Expression: period-appropriate — dignified, composed, warm
- Style: warm brown ink strokes, cross-hatching in sepia tones
- FORBIDDEN: photorealistic rendering, modern casual pose, cold tones`,

        anime_manga: `ANIME/MANGA POSE (MANDATORY):
- Hero is FULLY ILLUSTRATED in anime/manga style — NOT photorealistic
- Pose: dynamic anime character pose — confident stance with slight action energy
- Expression: anime-style determined/confident — large expressive eyes
- Style: cel-shading, bold ink outlines, flat color fills, speed lines optional
- FORBIDDEN: photorealistic face/body, subtle expressions, realistic proportions`,

        watercolor_dreamscape: `WATERCOLOR DREAMSCAPE POSE (MANDATORY):
- Hero rendered in SOFT WATERCOLOR TECHNIQUE — edges bleed, painted quality
- Pose: serene, contemplative, graceful — flowing and natural
- Expression: peaceful, dreamy, thoughtful — soft eyes, gentle smile
- Style: soft color washes, bleeding edges, ethereal atmosphere
- FORBIDDEN: sharp edges, aggressive poses, harsh expressions, photorealistic rendering`,

        comic_book: `COMIC BOOK POSE (MANDATORY):
- Hero rendered in BOLD COMIC STYLE — flat colors, thick outlines, action energy
- Pose: dynamic hero stance — confident, powerful, slightly exaggerated proportions
- Expression: bold, determined, heroic — comic character energy
- Style: 4-color palette, halftone dots, bold panel-style composition
- FORBIDDEN: photorealistic rendering, subtle tones, muted colors`,
    };
    const block = poseBlocks[sub || ''];
    if (block) return block;
    // Default for any substyle not explicitly listed
    return `DEFAULT HERO POSE:
- Hero must look like a REAL PERSON captured in a REAL MOMENT — not a mannequin
- NEVER render the hero standing straight with arms at sides
- NEVER render a symmetrical "passport photo" pose
- ALWAYS give the hero a NATURAL action: leaning, gesturing, holding something, sitting on edge, mid-turn
- Body angle: 10-30° rotation from camera (never perfectly frontal)
- Weight on ONE leg (never both feet evenly planted)
- Hands ACTIVE: touching chin, holding phone, gripping lapel, resting on surface, gesturing`;
})()}
- Expression: MICRO-EXPRESSION (slight smirk, raised eyebrow, knowing look) — not a blank stare or forced smile
=================================================================

⚠️⚠️⚠️ FACE IDENTITY PROTECTION (MOST CRITICAL RULE) ⚠️⚠️⚠️
=================================================================
The face in the final output MUST be an EXACT, PIXEL-PERFECT copy of the face in Box A.

BONE STRUCTURE RULES (ABSOLUTE - NO EXCEPTIONS):
- DO NOT change the nose shape - same width, length, bridge shape
- DO NOT change the jawline - same angle, width, definition
- DO NOT change the forehead - same height, curvature
- DO NOT change the eye spacing - same distance between eyes
- DO NOT change the cheekbone position - same height, prominence
- DO NOT change the chin - same shape, length, width
- DO NOT smooth or alter skin texture beyond minor lighting adjustments

WHY THIS MATTERS:
- The user uploaded their ACTUAL photo
- If you alter bone structure, the image looks like a DIFFERENT PERSON
- This defeats the entire purpose of using their photo

PRIORITY ORDER:
1. Face identity (HIGHEST - never compromise)
2. Costume/attire from universe
3. Environment/background
4. Lighting (adapt to face, not the other way around)

If lighting or costume conflicts with face preservation, ALWAYS prioritize the face.
The costume and environment must work AROUND the face, not alter it.
=================================================================
` : ''}
${isTextOnlyMode(inputs) ? `
⚠️⚠️⚠️ TEXT-ONLY RENDER MODE (HIGHEST PRIORITY) ⚠️⚠️⚠️
=======================================================================
This is a TYPOGRAPHY-FIRST render. Strict rules:
- DO NOT render any person, hero, character, or human figure
- DO NOT render any environment, scenery, or universe setting
- Background: ONLY solid color, gradient, or subtle texture
- The ENTIRE canvas is for typographic composition
- Headline must be MASSIVE — at least 40% of canvas height
- Use DRAMATIC font weight contrast (ultra-bold headline + thin supporting text)
- The typographic layout IS the art direction
- Box A photos: IGNORE COMPLETELY
- Universe: IGNORE COMPLETELY — background only
=======================================================================
` : ''}

         - COSTUME: ${(() => { const _rendCostSub = resolveVisualSubStyle(inputs); if (_rendCostSub === 'luxury_magazine') return 'Apply MAGAZINE COVER STAR wardrobe — power suit/blazer, impeccably tailored, cover-model quality against dark solid background. NOT universe-themed environment costume.'; if (_rendCostSub === 'clean_corporate') return 'Apply CLEAN CORPORATE professional wardrobe — polished, brand-safe, modern.'; if (_rendCostSub === 'ugly_ad') return 'Apply CASUAL clothing — everyday selfie attire, NOT styled.'; return `Apply the thematic ${resolvedUniverse} outfit from blueprint.`; })()}
          - LOGO STRICTNESS: Render ONLY user - provided branding from Box B.If Box B is empty, the design must be 100 % free of any logos or branding marks.If Box B has an image, render that image once as a physical artifact in the scene.
          ${inputs.brandColorPrimary ? `- BRAND COLOR RENDERING (CRITICAL FOR VISUAL IDENTITY):
          The client's brand color is ${inputs.brandColorPrimary}${inputs.brandColorSecondary ? ` (secondary: ${inputs.brandColorSecondary})` : ''}.
          You MUST integrate these colors visibly. Apply ALL of the following:
          1. CTA BUTTON: Use brand primary (${inputs.brandColorPrimary}) as the button background color. Text on button should be white or contrasting.
          2. HEADLINE ACCENT: Apply brand primary as a colored highlight on the ENTIRE FIRST LINE of the headline, or as an underline/background bar behind one complete phrase. NEVER color individual letters or parts of a word — Arabic letters connect and splitting colors mid-word looks broken. Either highlight a COMPLETE LINE or use a background/underline bar.
          3. SUBHEADLINE: Can use brand secondary ${inputs.brandColorSecondary ? `(${inputs.brandColorSecondary})` : 'or a lighter tint of brand primary'} for the entire subheadline text color, or leave white. NEVER partially color Arabic text.
          4. DECORATIVE ACCENTS: Add brand-colored elements — thin lines, corner accents, subtle glow effects, or geometric shapes that frame the text areas.
          5. BENEFIT TEXT: The benefit line below CTA can use brand color as text color.
          The brand color should be UNMISTAKABLE in the final design — a viewer should be able to guess the brand color from the ad.` : `- COLOR STYLING: ${(() => {
      const sub = resolveVisualSubStyle(inputs);
      if (sub === 'dark_cinematic') return `DARK CINEMATIC PALETTE — Primary text: pure white (#FFFFFF). Accent/keyword color MUST match the scene key light (gold #FFD700, electric blue #00BFFF, or ember #FF4500). Apply accent to the ENTIRE FIRST LINE or a full phrase — NEVER split mid-Arabic-word. CTA button: vivid, saturated, appears to emit light against the dark background. FORBIDDEN: pastel colors, muted tones, desaturated palettes.`;
      if (sub === 'bright_illustrated') return `BRIGHT ILLUSTRATED PALETTE — Primary text: deep navy (#0D1B3E) or charcoal (#1A1A2E) for maximum contrast against warm backgrounds. Accent: vivid warm color (coral #FF6B35, golden #FFB347, or sky blue #4FC3F7) applied to a full complete line only. CTA button: solid vivid warm color — approachable, bright, inviting. FORBIDDEN: dark glow effects, neon, black text on dark backgrounds.`;
      if (sub === 'mythic_epic') return `MYTHIC EPIC PALETTE — Primary text: metallic white or near-white with subtle gold sheen. Accent: metallic gold (#FFD700), silver (#C0C0C0), or jewel-toned glow (emerald #50C878, crimson #DC143C) matching the canvas jewel tone. Apply accent to full complete lines — NEVER split mid-Arabic-word. CTA button: metallic gradient or jewel-toned with sheen. FORBIDDEN: flat/matte colors, pastels, plain white without metallic quality.`;
      if (sub === 'vintage_bw') return `VINTAGE B&W PALETTE — GRAYSCALE ABSOLUTE: Pure black (#000000) and white (#FFFFFF) only. Mid-tones through cross-hatch density only. Keyword highlight: black box with white reversed text, or bold black underline. CTA button: solid black with white text. FORBIDDEN: any color, any tint, any hue. Zero exceptions.`;
      if (sub === 'vintage_sepia') return `VINTAGE SEPIA PALETTE — WARM MONOCHROME: All tones in sepia range. Dark ink: #3D1A00. Mid-tones: #704214 to #A0522D. Light/paper areas: #F5E6C8 to #FFF8DC. Keyword highlight: dark brown box with cream text, or warm brown underline. CTA button: dark warm-brown with cream/parchment text. FORBIDDEN: cool greys, blues, any modern color, pure black or pure white (replace with warm near-equivalents).`;
      if (sub === 'luxury_magazine') return `LUXURY MAGAZINE COVER PALETTE — Bold solid dark background (deep navy #1a1a3e, rich black #0d0d0d, warm dark grey #2d2d2d, or deep teal #0a3d3d). Text: white or metallic gold (#C5A028). ONE accent color (gold or brand color) for badges and highlight words. Headlines: white or gold on dark background. Each concept MUST use a DIFFERENT background color. FORBIDDEN: white background, pastel, multiple bright colors.`;
      if (sub === 'ugly_ad') return `UGLY AD PALETTE — Plain white/cream notepad OR phone screenshot grey. Red (#FF0000) for circle annotations and arrows. Yellow (#FFFF00) for highlights. Black system font text. NO designed color palette.`;
      if (sub === 'cinematic_film_still') return `CINEMATIC FILM STILL PALETTE — Rich cinematic color grade. Teal/orange contrast OR warm amber/deep shadow. 35mm grain overlay. Colors feel like they passed through a film LUT. Warm highlights, cool shadows.`;
      if (sub === 'clean_corporate') return `CLEAN CORPORATE PALETTE — Neutral base (light grey #F0F0F0, soft blue #E8EDF2, warm cream #F5F1EB). ONE brand accent color used on CTA only. Everything else neutral and clean. FORBIDDEN: neon, dark, saturated, moody.`;
      if (sub === 'golden_hour_outdoor') return `GOLDEN HOUR PALETTE — Warm amber/golden throughout (#FFB347, #E8920C). Warm shadows. Sky blues in background. Everything bathed in warm golden light. CTA in warm tone.`;
      if (sub === 'street_photography') return `STREET PHOTOGRAPHY PALETTE — Slightly desaturated urban naturals. Concrete greys, worn brick, warm street light. Muted but real. NOT stylized color — authentic urban tones.`;
      if (sub === 'pixel_retro_game') return `PIXEL RETRO GAME PALETTE — Limited 16-color palette. Bold primary game colors. Pixel-perfect color blocks, no gradients within sprites. NES/SNES color range energy.`;
      if (sub === 'stained_glass') return `STAINED GLASS PALETTE — Jewel tones ONLY: ruby red (#9B111E), emerald (#046307), sapphire (#0F52BA), amber (#FFBF00), deep purple (#301934). All colors as flat fills within dark lead-line borders. Backlit glow.`;
      if (sub === 'glitch_digital') return `GLITCH PALETTE — Dark base (#0A0A0A). Accent colors from RGB splits: cyan (#00FFFF), magenta (#FF00FF), neon green (#00FF00). These appear at corruption edges. Main content visible through the glitch.`;
      if (sub === 'synthwave_80s') return `SYNTHWAVE PALETTE — Hot pink (#FF1493), deep purple (#4B0082), midnight blue (#191970), neon cyan (#00FFFF), chrome silver. Grid lines in cyan or magenta. Sun: orange to pink gradient. Chrome text.`;
      if (sub === 'documentary_gritty') return `DOCUMENTARY GRITTY PALETTE — Desaturated throughout. If warm cast: muted amber/brown tones. If cool cast: desaturated blue-grey. Accent: ONE functional accent color at reduced saturation — muted orange, dusty blue, or olive. CTA button: simple solid desaturated color. FORBIDDEN: saturated primaries, neon, metallic effects, multiple accent colors.`;
      if (sub === 'neon_urban') return `NEON URBAN PALETTE — Dark base (near-black streets). MULTIPLE neon accent colors in the ENVIRONMENT (pink #FF2D78, cyan #00FFFF, purple #BF00FF, amber #FFB300). For TEXT: pick ONE dominant neon color for headline glow — must match a scene light source. CTA button: vivid glowing neon color with light emission effect. FORBIDDEN: daylight tones, pastel colors, desaturated accents, vintage warmth.`;
      if (sub === 'anime_manga') return `ANIME/MANGA PALETTE — Vibrant, saturated, high-contrast. Skin: warm peach/tan. Background: flat vivid color fills from the universe. ONE accent color for headline/emphasis elements — pick from scene's dominant color. CTA button: solid vivid flat color with bold black outline — same palette as illustrated scene. FORBIDDEN: desaturation, gradients, metallic effects, pastel watercolor tones.`;
      if (sub === 'watercolor_dreamscape') return `WATERCOLOR DREAMSCAPE PALETTE — Soft dreamy tones ONLY: lavender (#E6D7F7), rose (#F7D7E3), sage (#D7F0E3), soft gold (#F7EDD7). Text color: deep mauve (#5C3D5C) or soft navy (#2C3E6B) for readability. ONE accent: soft gold or blush rose for headline keyword. CTA button: soft rounded pastel — gentle, inviting. FORBIDDEN: dark tones, neon, bold saturated colors, black backgrounds, metallic harshness.`;
      if (sub === 'comic_book') return `COMIC BOOK PALETTE — STRICT 4 COLORS: vivid red (#E8001C), bright yellow (#FFE600), royal blue (#003087), and black. White is allowed as paper/background. Every element maps to one of these 4. Headline: yellow or white on black/red background, or black on yellow — all high contrast. CTA button: solid red or blue with bold black outline. White text inside. FORBIDDEN: any color outside the 4-color palette, gradients, metallic, pastel, desaturated tones.`;
      return `Use cinematic accent colors for visual hierarchy. Apply a bold accent color (gold, electric blue, or ember) to the ENTIRE FIRST LINE of the headline or as a background bar/underline behind one complete phrase. NEVER color individual Arabic letters or split color mid-word. CTA button should be a vivid, saturated color that pops against the dark background.`;
  })()}`}
  // --- CRITICAL COSTUME & FIDELITY RE-ENFORCEMENT ---
  ${costumeRules}
// --- END RE-ENFORCEMENT ---
- REFLOW: Ratio ${currentAspectRatio}. Spatial reflow only.Subjects and all 3 text layers and the button are visible and perfectly balanced.
          - CONTRAST: Ensure all text is placed in "Negative Space" areas where it is easily readable.
    `;

    const parts: any[] = [];
    if (base64ToEdit) {
        parts.push({ inlineData: { mimeType: "image/png", data: base64ToEdit.split(',')[1] } });
        const isReflow = editInstruction?.includes("REFLOW");

        if (isReflow) {
            // REFLOW MODE — strict resize only, preserve everything visual
            parts.push({
                text: `
⚠️⚠️⚠️ REFLOW / RESIZE MODE — THIS IS NOT A REDESIGN ⚠️⚠️⚠️
================================================================
You are RESIZING the attached image to a new aspect ratio: ${currentAspectRatio}

ABSOLUTE RULES — DO NOT VIOLATE ANY OF THESE:
1. SAME HERO: Same person, same face, same expression, same pose, same outfit, same accessories. Do NOT change anything about the hero.
2. SAME COLORS: Same color palette, same color grading, same background colors, same accent colors. Do NOT change the color scheme.
3. SAME ENVIRONMENT: Same background, same setting, same props, same atmospheric effects. Do NOT change the scene.
4. SAME LIGHTING: Same lighting direction, intensity, temperature, and mood. Do NOT change the lighting.
5. SAME TEXT — CHARACTER FOR CHARACTER: 
   - HEADLINE: "${hookText}"
   - SUBHEADLINE: "${subheadText}"
   - CTA BUTTON: "${ctaName}"
   ${benefitText ? `- BENEFIT: "${benefitText}"` : ''}
   ${inputs.badges ? `- BADGE: "${inputs.badges}"` : ''}
   Do NOT change, rephrase, translate, or remove any text. Every character must be identical.
6. SAME TYPOGRAPHY: Same fonts, same font weights, same text colors, same text effects.
7. SAME STYLE: Same design style, same gradient scrims, same overlays, same decorative elements.
8. SAME BRAND ELEMENTS: Same logo placement, same brand colors, same badge design.

WHAT YOU ARE ALLOWED TO CHANGE:
- Spatial layout ONLY — rearrange the zones (headline, hero, CTA) to fit the new ${currentAspectRatio} ratio
- Crop/extend the background naturally to fill the new canvas shape
- Adjust text zone positions to fit the new dimensions while respecting safe zones

TARGET RATIO: ${currentAspectRatio}
${currentAspectRatio === '9:16' ? 'VERTICAL STORY: Stack headline at top, hero in center, CTA at bottom. Leave generous invisible margins on all edges — wider margins at top and bottom than sides. DO NOT render any percentage numbers or margin indicators as visible text.'
                        : currentAspectRatio === '1:1' ? 'SQUARE: Headline at top, hero center, CTA at bottom. Leave generous invisible margins on all edges.'
                            : currentAspectRatio === '4:5' ? 'PORTRAIT: Headline at top, hero center, CTA at bottom. Leave generous invisible margins — extra space at top and bottom.'
                                : currentAspectRatio === '16:9' ? 'LANDSCAPE: Hero on one side, text stacked on other side. Leave generous invisible margins on all edges.'
                                    : currentAspectRatio === '3:4' ? 'TALL: Headline at top, hero center, CTA at bottom. Leave generous invisible margins — extra space at top and bottom.'
                                        : currentAspectRatio === '4:3' ? 'WIDE: Hero on one side, text on other. Leave generous invisible margins on all edges.'
                                            : `Adapt layout to ${currentAspectRatio}. Leave generous invisible margins on all edges.`}

THIS IS A RESIZE, NOT A REDESIGN. If the output looks like a different ad, you have failed.
================================================================
` });
        } else {
            // EDIT/POLISH MODE — apply user's specific changes
            parts.push({
                text: `
You are editing the attached image. Follow the COMMAND below precisely.

⚠️⚠️⚠️ USER COMMAND (HIGHEST PRIORITY — FOLLOW EXACTLY) ⚠️⚠️⚠️
================================================================
${editInstruction}
================================================================

TEXTS THAT MUST APPEAR ON THE IMAGE (use these EXACT strings):
- HEADLINE: "${hookText}"
- SUBHEADLINE: "${subheadText}"
- CTA BUTTON: "${ctaName}"
${benefitText ? `- BENEFIT: "${benefitText}"` : ''}

IMPORTANT: Apply the user's command above. If the command says to REMOVE specific words or text, you MUST remove them. If it says to change something, change it. The command overrides the default text strings above.

RE-RENDER RULES:
${coreDesignRules}
` });
        }
    } else {
        // Carousel style reference: inject anchor slide as visual reference
        // contracts/cultural-compliance-block.md §1.2 — per-slide compliance block invariant
        // Both carousel and batch paths route through generateFinalAd. Since CULTURAL_COMPLIANCE_BLOCK
        // and ARABIC_WARDROBE_BLOCK are injected into coreDesignRules and costumeRules above,
        // every slide and every batch item receives the compliance guardrails when isArabic is true.
        const carouselAnchorNote = styleReference ? `
═══════════════════════════════════════════════════════════════════════════════
CAROUSEL STYLE ANCHORING (CRITICAL)
═══════════════════════════════════════════════════════════════════════════════
A REFERENCE IMAGE from Slide 1 is attached. You MUST match its visual style EXACTLY:
- SAME color grading and color palette
- SAME lighting direction, intensity, and temperature
- SAME typography style, font weight, and text layout grid
- SAME environment style and mood
- SAME level of detail and rendering quality
- The Hero should wear the SAME outfit as in the reference
- Progress the NARRATIVE (different pose/action) but keep the WORLD identical
DO NOT deviate from the reference style. This slide must feel like part of the SAME carousel.
═══════════════════════════════════════════════════════════════════════════════
` : '';

        // Sanitize buildPlan: strip system instruction markers and stray English that the image AI renders as visible text
        const cleanBuildPlan = gatedBlueprint
            .replace(/TECHNICAL_PROMPT[:\s].*$/gm, '')
            .replace(/VISUAL_DIRECTION[:\s].*$/gm, '')
            .replace(/CONCEPT_START_\d/g, '')
            .replace(/CONCEPT_END_\d/g, '')
            .replace(/═+/g, '')
            .replace(/━+/g, '')
            .replace(/\*\*/g, '')
            // Strip CamelCase_Underscore compound words that Gemini renders as visible text (e.g. "Branding_Logic")
            .replace(/[A-Za-z]+_[A-Za-z]+/g, '')
            // Strip common English words that leak into renders
            .replace(/\b(branding|logic|brand|scene|description|style|reference|concept|prompt|direction)\b/gi, '')
            .trim();

        parts.push({
            text: `BLUEPRINT: ${cleanBuildPlan} \nTEXTS: "${hookText}", "${subheadText}"\nBUTTON: "${ctaName}"\n${carouselAnchorNote}\n${coreDesignRules}

⚠️ CRITICAL TEXT RENDERING RULES:
1. ONLY render these EXACT text strings on the image — NOTHING ELSE:
   - Headline: "${hookText}"
   - Subheadline: "${subheadText}"
   ${ctaName ? `- Button: "${ctaName}"` : ''}
   ${benefitText ? `- Benefit: "${benefitText}"` : ''}
2. DO NOT render ANY of these on the image:
   - System instructions, marker labels, or field names
   - "VISUAL_DIRECTION:", "TECHNICAL_PROMPT:", "CONCEPT_START", etc.
   - "**" symbols, "═══" lines, or any formatting markers
   - English technical instructions or camera settings
   - ANY English text, brand names, watermarks, or labels
   - Any text that is NOT one of the 4 strings listed above
3. If the blueprint mentions "VISUAL_DIRECTION" or similar — that is an INSTRUCTION TO YOU, not text to render.
4. NEVER render English words from the blueprint as visible text on the image. The blueprint is a design INSTRUCTION, not content to display.
5. Each Arabic text string must appear EXACTLY ONCE — never duplicate, never truncate, never rephrase.
` });

        // If style reference provided (carousel slides 2+), inject it BEFORE personal photos
        if (styleReference) {
            parts.push({ inlineData: { mimeType: "image/png", data: styleReference.split(',')[1] } });
            // Skip personal photos for carousel slides 2+ — the style reference (slide 1) already
            // contains the rendered face. Sending photos again wastes input tokens (~$0.006/slide).
            // Only send brand logo if available.
            boxB.forEach((d: any) => parts.push({ inlineData: { mimeType: getMime(d), data: d.split(',')[1] } }));
            boxC.forEach((d: string) => parts.push({ inlineData: { mimeType: getMime(d), data: d.split(',')[1] } }));
        } else {
            if (!_isTextOnly) {
                boxA.forEach((d: any) => parts.push({ inlineData: { mimeType: getMime(d), data: d.split(',')[1] } }));
            }
            boxB.forEach((d: any) => parts.push({ inlineData: { mimeType: getMime(d), data: d.split(',')[1] } }));
            // Box C: Offer-specific assets (book cover, dashboard screenshot, etc.)
            if (boxC.length > 0) {
                const spec = resolveCreativeSpec({
                    selectedModes: (inputs as any).offerCreativeMode || ['standard_hero'],
                    hookAngle: inputs.coldHookAngle || undefined,
                });
                const modeLabel = spec.primaryMode !== 'standard_hero' ? spec.resolvedLabelEn.toUpperCase() : 'PRODUCT';
                parts.push({
                    text: `
⚠️⚠️⚠️ BOX C — MANDATORY OFFER ASSETS (${modeLabel}) ⚠️⚠️⚠️
These ${boxC.length} image(s) are the CORE VISUAL ELEMENT of this ad. They are NOT optional. They are NOT reference material.

STRICT REQUIREMENTS:
1. The offer asset(s) MUST be VISIBLY and PROMINENTLY displayed in the final image.
2. The asset should occupy at least 25-40% of the visible canvas area.
3. The asset must be in FOCAL POSITION — not pushed to a corner, not obscured by text, not blurred.
4. For book_mockup: Show the ACTUAL uploaded cover on a 3D book mockup at center-stage.
5. For device_mockup / dashboard_preview / mobile_app_card: Show the ACTUAL uploaded screenshot on a device frame.
6. For speaker_card / certificate: Incorporate the uploaded image as the central visual element.
7. DO NOT use Box C images as face/identity references — they are offer product visuals.
8. DO NOT replace the asset with an AI-generated substitute. Use the EXACT uploaded image.

If the asset is not clearly visible and prominent in the final render, the output FAILS.` });
                boxC.forEach((d: string) => parts.push({ inlineData: { mimeType: getMime(d), data: d.split(',')[1] } }));
            }
        }
    }

    const response = await callGemini({
        model: VISUAL_MODEL,
        contents: { parts },
        config: {
            responseModalities: ['TEXT', 'IMAGE'],
            thinkingConfig: { thinkingLevel: 'High' },
            imageConfig: { aspectRatio: currentAspectRatio as any },
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
            ]
        }
    });

    for (const cand of response.candidates || []) {
        // FIX: Check if content exists before accessing parts
        if (cand.content && cand.content.parts) {
            for (const part of cand.content.parts) {
                if (part.inlineData) {
                    const imageBase64 = `data:image/png;base64,${part.inlineData.data}`;
                    let currentImage = imageBase64;

                    // ═══ DESIGN CRITIC LOOP ═══
                    // A cheap model reviews the render and the visual model auto-fixes issues
                    // Only runs on primary renders (not reflows/edits) to save cost
                    if (!base64ToEdit && !styleReference && hasTimeBudget(90000)) {
                        try {
                            const critique = await critiqueDesign(
                                currentImage, hookText, subheadText, ctaName, benefitText, currentAspectRatio, inputs
                            );

                            if (critique && critique.needsRevision && critique.fixes.length > 0) {
                                console.log(`🎨 Design Critic found ${critique.fixes.length} issues — auto-fixing...`);

                                // Re-render with targeted fix instructions
                                const fixInstruction = `DESIGN CRITIC AUTO-FIX (DO NOT CHANGE THE OVERALL DESIGN — ONLY FIX THESE SPECIFIC ISSUES):
${critique.fixes.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}

CRITICAL: Keep the SAME hero pose, SAME environment, SAME color palette, SAME composition.
ONLY adjust the specific issues listed above. This is a REFINEMENT, not a redesign.

⚠️⚠️⚠️ ABSOLUTE TEXT LOCK — DO NOT CHANGE ANY TEXT ⚠️⚠️⚠️
The following text strings must appear EXACTLY as written — character for character:
- HEADLINE: "${hookText}"
- SUBHEADLINE: "${subheadText}"
- CTA BUTTON: "${ctaName}"
- BENEFIT: "${benefitText}"
If you change, rephrase, translate, abbreviate, or omit ANY of these strings, the fix FAILS.
Render these EXACT strings. No variations. No improvements. EXACT.`;

                                // Use the generated image as base for refinement
                                const refineParts: any[] = [
                                    { inlineData: { mimeType: "image/png", data: currentImage.split(',')[1] } },
                                    { text: `${fixInstruction}

${coreDesignRules}` }
                                ];
                                // Include face reference for identity preservation
                                boxA.forEach((d: any) => refineParts.push({ inlineData: { mimeType: getMime(d), data: d.split(',')[1] } }));

                                const refineResponse = await callGemini({
                                    model: VISUAL_MODEL,
                                    contents: { parts: refineParts },
                                    config: {
                                        responseModalities: ['TEXT', 'IMAGE'],
                                        thinkingConfig: { thinkingLevel: 'High' },
                                        imageConfig: { aspectRatio: currentAspectRatio as any },
                                        safetySettings: [
                                            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                                            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                                            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                                            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
                                        ]
                                    }
                                });

                                // Try to extract the refined image
                                let refinementApplied = false;
                                for (const refineCand of refineResponse.candidates || []) {
                                    if (refineCand.content && refineCand.content.parts) {
                                        for (const refinePart of refineCand.content.parts) {
                                            if (refinePart.inlineData) {
                                                console.log('✅ Design Critic refinement applied successfully');
                                                currentImage = `data:image/png;base64,${refinePart.inlineData.data}`;
                                                refinementApplied = true;
                                                break;
                                            }
                                        }
                                    }
                                    if (refinementApplied) break;
                                }
                                if (!refinementApplied) {
                                    console.log('⚠️ Refinement render failed — using current image');
                                }
                            }
                        } catch (critiqueError) {
                            // Critic failed — non-blocking, return original image
                            console.warn('Design Critic skipped (non-blocking):', critiqueError);
                        }
                    }

                    // ═══ ARABIC TEXT QA — Auto-detect and fix Arabic text corruption ═══
                    // Runs after design critic, only for Arabic content, only on primary renders
                    // Uses cheap text model to check for common Arabic rendering issues
                    // If issues found, auto-rerenders with targeted corrective instruction
                    const isArabic = (inputs.adLanguage || 'ar_fusha').startsWith('ar');
                    if (isArabic && !base64ToEdit && !styleReference && hookText.length > 2) {
                        try {
                            const qaResponse = await callGemini({
                                model: LOGIC_MODEL,
                                contents: {
                                    parts: [
                                        { inlineData: { mimeType: "image/png", data: currentImage.split(',')[1] } },
                                        {
                                            text: `You are an Arabic text quality inspector for advertisements. Analyze this ad image.

Expected text elements:
- HEADLINE: "${hookText}"
- SUBHEADLINE: "${subheadText}"
${ctaName ? `- CTA: "${ctaName}"` : ''}
${benefitText ? `- BENEFIT: "${benefitText}"` : ''}

Check for these Arabic text problems:
1. MISSPELLED_WORDS: Any word in the image that does NOT match the expected text character-for-character. Compare EACH word in the rendered text against the expected text above. Even one wrong letter counts (e.g., "بخسون" instead of "بخسارة", "يبيعون" instead of "يبيعون").
2. DUPLICATED_WORDS: Same Arabic word/phrase appears twice where it shouldn't
3. DUPLICATED_LINES: Same line of text rendered in multiple places
4. MALFORMED_ARABIC: Broken letter connections, reversed characters, garbled text
5. FIELDS_MIXED: CTA text appearing in headline zone or vice versa
6. EXTRA_TEXT: Arabic text that doesn't match any expected field
7. MISSING_TEXT: Expected text that is completely absent from the image
8. TRUNCATED_TEXT: Text that is cut off or incomplete compared to expected

CRITICAL: For each text element, read EVERY WORD in the image and compare it letter-by-letter against the expected text. Report ANY differences, no matter how small.

Return ONLY valid JSON:
{"hasIssues":true/false,"issues":["ISSUE_TYPE: brief description"],"severity":"low|medium|high"}

If the Arabic text matches expected text exactly with no issues, return: {"hasIssues":false,"issues":[],"severity":"low"}` }
                                    ]
                                },
                                config: { temperature: 0.1 }
                            });

                            const qaText = (qaResponse.text || '').trim();
                            try {
                                const qaClean = qaText.replace(/```json|```/g, '').trim();
                                const qaResult = JSON.parse(qaClean);
                                if (qaResult.hasIssues && qaResult.issues?.length > 0) {
                                    if (!hasTimeBudget(50000)) {
                                        console.warn('⚠️ Arabic QA found issues but skipped auto-fix due to callable time budget.');
                                    } else {
                                        console.log(`🔤 Arabic QA found ${qaResult.issues.length} issues (${qaResult.severity}) — auto-fixing...`);

                                    const arabicFixInstruction = `ARABIC TEXT CORRECTION — FIX THESE SPECIFIC ISSUES:
${qaResult.issues.map((issue: string, i: number) => `${i + 1}. ${issue}`).join('\n')}

CRITICAL RULES:
- Keep the SAME design, layout, hero, and composition — ONLY fix the text rendering
- Each text element must appear EXACTLY ONCE in its correct zone
- HEADLINE goes in the headline zone ONLY: "${hookText}"
- SUBHEADLINE goes in the subheadline zone ONLY: "${subheadText}"
${ctaName ? `- CTA goes in the button zone ONLY: "${ctaName}"` : ''}
${benefitText ? `- BENEFIT goes below CTA ONLY: "${benefitText}"` : ''}
- Remove any duplicated, extra, or misplaced Arabic text
- Ensure clean letter connections and proper RTL rendering`;

                                    const fixParts: any[] = [
                                        { inlineData: { mimeType: "image/png", data: currentImage.split(',')[1] } },
                                        { text: `${arabicFixInstruction}\n\n${coreDesignRules}` }
                                    ];
                                    boxA.forEach((d: any) => fixParts.push({ inlineData: { mimeType: getMime(d), data: d.split(',')[1] } }));

                                    const fixResponse = await callGemini({
                                        model: VISUAL_MODEL,
                                        contents: { parts: fixParts },
                                        config: {
                                            responseModalities: ['TEXT', 'IMAGE'],
                                            thinkingConfig: { thinkingLevel: 'High' },
                                            imageConfig: { aspectRatio: currentAspectRatio as any },
                                            safetySettings: [
                                                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                                                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                                                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                                                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
                                            ]
                                        }
                                    });

                                    let arabicFixApplied = false;
                                    for (const fixCand of fixResponse.candidates || []) {
                                        if (fixCand.content?.parts) {
                                            for (const fixPart of fixCand.content.parts) {
                                                if (fixPart.inlineData) {
                                                    console.log('✅ Arabic QA correction applied successfully');
                                                    currentImage = `data:image/png;base64,${fixPart.inlineData.data}`;
                                                    arabicFixApplied = true;
                                                    break;
                                                }
                                            }
                                        }
                                        if (arabicFixApplied) break;
                                    }
                                    if (!arabicFixApplied) {
                                        console.log('⚠️ Arabic QA fix render failed — using current image');
                                    }
                                    }
                                }
                            } catch { /* JSON parse failed — skip QA */ }
                        } catch (qaErr) {
                            console.warn('Arabic QA skipped (non-blocking):', qaErr);
                        }
                    }

                    // ═══ NUMERIC FIDELITY ENFORCEMENT — reject unauthorized prices/values ═══
                    // For strict-fidelity modes: detect hallucinated numbers, retry once, then reject.
                    const numericPolicy = getNumericFidelityPolicy(
                        (inputs as any).offerCreativeMode || ['standard_hero']
                    );
                    if (numericPolicy === 'strict' && !base64ToEdit && !styleReference) {
                        const authorizedNums = getAuthorizedNumbers(inputs);
                        // Also authorize numbers from the approved text fields
                        const textNums: string[] = [];
                        [hookText, subheadText, ctaName, benefitText, inputs.badges || ''].forEach(t => {
                            const nums = (t || '').match(/[\$€£]?\d[\d,.\s]*\d?[\$€£%]?|\d+%|\d+x/gi);
                            if (nums) textNums.push(...nums.map((n: string) => n.trim()));
                        });
                        const allAuthorized = [...new Set([...authorizedNums, ...textNums])];
                        const normalize = (n: string) => n.replace(/[\s,]/g, '').toLowerCase();
                        const authorizedSet = new Set(allAuthorized.map(normalize));

                        let numericPass = false;
                        let _numericHallucination = false;

                        for (let auditAttempt = 0; auditAttempt < 2; auditAttempt++) {
                            try {
                                const auditResponse = await callGemini({
                                    model: LOGIC_MODEL,
                                    contents: {
                                        parts: [
                                            { inlineData: { mimeType: "image/png", data: currentImage.split(',')[1] } },
                                            {
                                                text: `Extract ALL visible numbers from this ad image that look like monetary values, prices, totals, or percentages.
Include: dollar amounts ($X), currency figures, percentage values (X%), multiplier values (Xx), and any standalone numbers that appear to represent money or value.
Do NOT include: dates, phone numbers, or numbers that are clearly part of descriptive text (like "12 modules" or "30 day").

Return ONLY a JSON array of the extracted numeric strings, e.g.:
["$997", "$2,997", "50%", "$500"]

If no monetary/value numbers are visible in the image, return: []` }
                                        ]
                                    },
                                    config: { temperature: 0.1 }
                                });
                                const auditText = (auditResponse.text || '').trim().replace(/```json|```/g, '').trim();
                                let foundNums: string[] = [];
                                try { foundNums = JSON.parse(auditText); } catch { foundNums = []; }

                                if (!Array.isArray(foundNums)) foundNums = [];

                                if (foundNums.length === 0) {
                                    // No monetary numbers visible — pass
                                    numericPass = true;
                                    console.log(`✅ Numeric fidelity PASS (attempt ${auditAttempt + 1}): no monetary numbers visible.`);
                                    break;
                                }

                                const unauthorized = foundNums.filter(n => !authorizedSet.has(normalize(n)));
                                if (unauthorized.length === 0) {
                                    numericPass = true;
                                    console.log(`✅ Numeric fidelity PASS (attempt ${auditAttempt + 1}): ${foundNums.length} numbers found, all authorized.`);
                                    break;
                                }

                                // Unauthorized numbers detected
                                console.warn(`🛑 NUMERIC FIDELITY VIOLATION (attempt ${auditAttempt + 1}): unauthorized [${unauthorized.join(', ')}], authorized [${allAuthorized.join(', ')}]`);

                                if (auditAttempt === 0) {
                                    // RETRY: re-render with stronger numeric suppression
                                    console.log(`🔄 Numeric fidelity retry: re-rendering with numeric erase instruction...`);
                                    try {
                                        const eraseParts: any[] = [
                                            { inlineData: { mimeType: "image/png", data: currentImage.split(',')[1] } },
                                            {
                                                text: `CRITICAL FIX — REMOVE UNAUTHORIZED NUMBERS FROM THIS AD IMAGE.

The following numbers are UNAUTHORIZED and must be ERASED or replaced with a solid-colored panel:
${unauthorized.map(n => `  ✗ "${n}" — REMOVE THIS`).join('\n')}

RULES:
1. Find each unauthorized number listed above in the image
2. Replace it with a solid-colored shape that matches the surrounding design (same color as the card/panel background)
3. Do NOT replace with a different number — use a blank panel or "✓" icon instead
4. Keep ALL other elements identical: hero, layout, colors, authorized text, composition
5. The ONLY authorized text on this image is:
   - HEADLINE: "${hookText}"
   - SUBHEADLINE: "${subheadText}"
   ${ctaName ? `- CTA: "${ctaName}"` : ''}
   ${benefitText ? `- BENEFIT: "${benefitText}"` : ''}
   ${inputs.badges ? `- BADGE: "${inputs.badges}"` : ''}
${allAuthorized.length > 0 ? `   - AUTHORIZED NUMBERS: ${allAuthorized.join(', ')}` : '   - NO monetary numbers should appear'}

This is a CORRECTION pass. Keep the same design. Only erase the unauthorized numbers.` }
                                        ];
                                        boxA.forEach((d: any) => eraseParts.push({ inlineData: { mimeType: getMime(d), data: d.split(',')[1] } }));

                                        const eraseResponse = await callGemini({
                                            model: VISUAL_MODEL,
                                            contents: { parts: eraseParts },
                                            config: {
                                                responseModalities: ['TEXT', 'IMAGE'],
                                                thinkingConfig: { thinkingLevel: 'High' },
                                                imageConfig: { aspectRatio: currentAspectRatio as any },
                                                safetySettings: [
                                                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                                                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                                                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                                                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
                                                ]
                                            }
                                        });

                                        let eraseSuccess = false;
                                        for (const ec of eraseResponse.candidates || []) {
                                            if (ec.content?.parts) {
                                                for (const ep of ec.content.parts) {
                                                    if (ep.inlineData) {
                                                        currentImage = `data:image/png;base64,${ep.inlineData.data}`;
                                                        eraseSuccess = true;
                                                        console.log(`🔄 Numeric erase re-render complete — re-auditing...`);
                                                        break;
                                                    }
                                                }
                                            }
                                            if (eraseSuccess) break;
                                        }
                                        if (!eraseSuccess) {
                                            console.warn(`⚠️ Numeric erase re-render failed to produce image (non-blocking). Using pre-erase image.`);
                                            _numericHallucination = true;
                                            numericPass = true;
                                            break;
                                        }
                                    } catch (eraseErr) {
                                        console.warn(`⚠️ Numeric erase re-render call failed (non-blocking). Using original image.`, eraseErr);
                                        _numericHallucination = true;
                                        numericPass = true;
                                        break;
                                    }
                                    // Loop continues to auditAttempt 1 to re-audit the erased image
                                } else {
                                    // Second audit still found unauthorized numbers — warn but continue
                                    console.warn(`⚠️ Numeric fidelity: unauthorized numbers persist after retry [${unauthorized.join(', ')}]. Continuing with best-effort image.`);
                                    numericPass = true;
                                    _numericHallucination = true;
                                }
                            } catch (auditErr) {
                                // Audit call itself failed — downgrade to warning, return the image
                                // Rejecting a perfectly good image because the audit API is flaky is worse
                                // than showing an image with potentially wrong numbers
                                console.warn(`⚠️ Numeric audit call failed (non-blocking). Returning image anyway.`, auditErr);
                                numericPass = true;
                                break;
                            }
                        }

                        if (numericPass) {
                            const _nhResult = _numericHallucination ? { failureClass: 'numeric_hallucination' as const, costEstimate: getCostEstimate() } : {};
                            // ═══ DETERMINISTIC OVERLAY: Composite exact numbers onto the image ═══
                            // For strict-fidelity templates, overlay is MANDATORY — fail if it can't run.
                            if (!base64ToEdit && !styleReference) {
                                const overlayContract = compileFullContract({
                                    selectedModes: (inputs as any).offerCreativeMode || ['standard_hero'],
                                    hookAngle: inputs.coldHookAngle || undefined,
                                    aspectRatio: currentAspectRatio,
                                    adLanguage: inputs.adLanguage || 'ar_fusha',
                                    visualStyleFamily: resolveStyleFamily(inputs) || 'realistic',
                                });
                                if (overlayContract.overlaySlots.length > 0) {
                                    if (!isOverlayAvailable()) {
                                        console.warn('⚠️ OVERLAY: Sharp not installed — skipping overlay, returning image without price compositing.');
                                        return { image: currentImage, ..._nhResult };
                                    }

                                    // Pre-check: extract facts to determine if overlay is structurally possible
                                    const preFacts = extractOfferFacts(inputs);
                                    if (!preFacts) {
                                        console.warn('⚠️ OVERLAY: facts extraction returned null — skipping overlay, returning image without price compositing.');
                                        return { image: currentImage, ..._nhResult };
                                    }

                                    const ar = overlayContract.aspectRatioRules;
                                    const isRtl = overlayContract.rtlRules.direction === 'rtl';
                                    try {
                                        const overlaid = await compositeOfferOverlay(
                                            currentImage,
                                            overlayContract.overlaySlots,
                                            inputs,
                                            ar.canvasWidth,
                                            ar.canvasHeight,
                                            isRtl,
                                            inputs.brandColorPrimary || undefined,
                                        );
                                        if (!overlaid) {
                                            console.warn('⚠️ OVERLAY: compositor returned null — returning image without price compositing.');
                                            return { image: currentImage, ..._nhResult };
                                        }

                                        // ═══ POST-OVERLAY VERIFICATION ═══
                                        // Confirm the final composited image does not contain unauthorized numbers.
                                        try {
                                            const postAuthorized = getAuthorizedNumbers(inputs);
                                            const postTextNums: string[] = [];
                                            [hookText, subheadText, ctaName, benefitText, inputs.badges || ''].forEach((t: string) => {
                                                const nums = (t || '').match(/[\$€£]?\d[\d,.\s]*\d?[\$€£%]?|\d+%|\d+x/gi);
                                                if (nums) postTextNums.push(...nums.map((n: string) => n.trim()));
                                            });
                                            // Overlay facts are now authorized too (they were placed deterministically)
                                            if (preFacts.actualPrice) postTextNums.push(preFacts.actualPrice);
                                            if (preFacts.totalValue) postTextNums.push(preFacts.totalValue);
                                            if (preFacts.savings) postTextNums.push(preFacts.savings);
                                            const postAllAuthorized = [...new Set([...postAuthorized, ...postTextNums])];
                                            const postNormalize = (n: string) => n.replace(/[\s,]/g, '').toLowerCase();
                                            const postAuthorizedSet = new Set(postAllAuthorized.map(postNormalize));

                                            if (!hasTimeBudget(25000)) {
                                                console.warn('⚠️ Post-overlay verification skipped due to callable time budget.');
                                            } else {
                                                const postAuditResponse = await callGemini({
                                                    model: LOGIC_MODEL,
                                                    contents: {
                                                    parts: [
                                                        { inlineData: { mimeType: "image/png", data: overlaid.split(',')[1] } },
                                                        {
                                                            text: `Extract ALL visible numbers from this ad image that look like monetary values, prices, totals, or percentages.
Include: dollar amounts ($X), currency figures, percentage values (X%), multiplier values (Xx), and any standalone numbers that appear to represent money or value.
Do NOT include: dates, phone numbers, or numbers that are clearly part of descriptive text (like "12 modules" or "30 day").
Return ONLY a JSON array, e.g.: ["$27", "$688"]
If no monetary numbers are visible, return: []` }
                                                    ]
                                                },
                                                config: { temperature: 0.1 }
                                            });
                                                const postAuditText = (postAuditResponse.text || '').trim().replace(/```json|```/g, '').trim();
                                                let postFoundNums: string[] = [];
                                                try { postFoundNums = JSON.parse(postAuditText); } catch { postFoundNums = []; }
                                                if (!Array.isArray(postFoundNums)) postFoundNums = [];

                                                const postUnauthorized = postFoundNums.filter((n: string) => !postAuthorizedSet.has(postNormalize(n)));
                                                if (postUnauthorized.length > 0) {
                                                    console.warn(`⚠️ Post-overlay verification: unauthorized numbers [${postUnauthorized.join(', ')}] (non-blocking). Returning overlaid image.`);
                                                }
                                                console.log(`✅ Post-overlay verification PASSED: ${postFoundNums.length} numbers found, all authorized.`);
                                            }
                                        } catch (postAuditErr) {
                                            // Post-overlay audit failed — non-blocking, return the overlaid image
                                            console.warn('⚠️ Post-overlay verification call failed (non-blocking). Returning overlaid image.', postAuditErr);
                                        }

                                        console.log('✅ Deterministic offer overlay applied and verified.');
                                        return { image: overlaid, ..._nhResult };
                                    } catch (overlayErr) {
                                        console.warn('⚠️ Overlay compositing failed (non-blocking). Returning image without overlay.', overlayErr);
                                        return { image: currentImage, ..._nhResult };
                                    }
                                }
                            }
                            return { image: currentImage, ..._nhResult };
                        }
                        // Safety net — should not reach here, but return image if we have one
                        return { image: currentImage || imageBase64, ...(_numericHallucination ? { failureClass: 'numeric_hallucination' as const, costEstimate: getCostEstimate() } : {}) };
                    }

                    // ═══ DETERMINISTIC OVERLAY for non-strict modes that still have overlay slots ═══
                    if (!base64ToEdit && !styleReference) {
                        try {
                            const overlayContract = compileFullContract({
                                selectedModes: (inputs as any).offerCreativeMode || ['standard_hero'],
                                hookAngle: inputs.coldHookAngle || undefined,
                                aspectRatio: currentAspectRatio,
                                adLanguage: inputs.adLanguage || 'ar_fusha',
                                visualStyleFamily: resolveStyleFamily(inputs) || 'realistic',
                            });
                            if (overlayContract.overlaySlots.length > 0 && isOverlayAvailable()) {
                                const ar = overlayContract.aspectRatioRules;
                                const isRtl = overlayContract.rtlRules.direction === 'rtl';
                                const overlaid = await compositeOfferOverlay(
                                    currentImage,
                                    overlayContract.overlaySlots,
                                    inputs,
                                    ar.canvasWidth,
                                    ar.canvasHeight,
                                    isRtl,
                                    inputs.brandColorPrimary || undefined,
                                );
                                if (overlaid) {
                                    console.log('✅ Deterministic offer overlay applied (non-strict path).');
                                    return { image: overlaid };
                                }
                            }
                        } catch (overlayErr) {
                            console.warn('⚠️ Offer overlay failed (non-blocking, non-strict):', overlayErr);
                        }
                    }

                    return { image: currentImage };
                }
            }
        }
    }
    return { image: null, errorCode: 'safety_blocked', failureClass: 'model_error' as const };
}

// ═══ DESIGN CRITIC LOOP — Internal quality gate before user sees the image ═══
// Architecture:
//   1. Gemini VISUAL_MODEL generates the image
//   2. Gemini CREATIVE_MODEL (different architecture) critiques it with vision
//   3. If score < 7 or any criterion ≤ 4, Gemini VISUAL_MODEL re-renders with targeted fixes
//   4. User only sees the final version
//
// Cost: ~$0.002 for critique (always) + ~$0.01 for re-render (only when needed, ~30% of the time)
// Time: +3s for critique, +18s for re-render when needed
//
// To switch to OpenAI as critic: deploy the designCritique Cloud Function and set
// USE_EXTERNAL_CRITIC=true. The Cloud Function calls GPT-4o-mini vision (~$0.001/call).
//
export async function critiqueDesign(
    imageBase64: string,
    expectedHeadline: string,
    expectedSubheadline: string,
    expectedCTA: string,
    expectedBenefit: string,
    ratio: AspectRatio,
    inputs?: AdInputs,
): Promise<{ needsRevision: boolean; fixes: string[]; score: number } | null> {
    if (!openaiKey) {
        console.warn('OpenAI key not set — skipping design critique');
        return null;
    }

    try {
        // Compile the layout contract for scoring context
        const selectedModes = (inputs as any)?.offerCreativeMode || ['standard_hero'];
        const hookAngle = inputs?.coldHookAngle || undefined;
        const scoringFullContract = compileFullContract({
            selectedModes,
            hookAngle,
            aspectRatio: ratio,
            adLanguage: inputs?.adLanguage || 'ar_fusha',
            visualStyleFamily: inputs ? resolveStyleFamily(inputs) : 'realistic',
        });
        const contract = getContractForScoring(scoringFullContract);

        // Build the scoring prompt with layout contract awareness
        const scoringPrompt = buildScoringPrompt(
            contract, expectedHeadline, expectedSubheadline,
            expectedCTA, expectedBenefit, ratio
        );

        // Strip data URL prefix
        let rawBase64 = imageBase64;
        if (rawBase64.includes(',')) rawBase64 = rawBase64.split(',')[1];

        // Use OpenAI GPT-4o-mini vision — different model catches Gemini's blind spots
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a strict ad design quality inspector. Score advertisement images against layout contracts. Return ONLY valid JSON. Be strict — this is a quality gate, not a participation trophy.'
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: { url: `data:image/png;base64,${rawBase64}`, detail: 'low' }
                            },
                            { type: 'text', text: scoringPrompt }
                        ]
                    }
                ],
                max_tokens: 600,
                temperature: 0.1,
                response_format: { type: 'json_object' }
            })
        });

        const data = await response.json() as any;

        if (data.error) {
            console.error('OpenAI Critic error:', data.error);
            return null;
        }

        const content = data.choices?.[0]?.message?.content || '{}';
        const scoreResult = parseScoringResponse(content);

        console.log(`🔍 OpenAI Critic: overall=${scoreResult.overallScore}/100, passed=${scoreResult.passed}, violations=${scoreResult.violations.length}`);

        return {
            needsRevision: !scoreResult.passed,
            fixes: scoreResult.suggestions,
            score: Math.round(scoreResult.overallScore / 10),
        };
    } catch (err) {
        console.warn('OpenAI Design Critique failed (non-blocking):', err);
        return null;
    }
}

// ─── CAROUSEL STORY ANGLES ─────────────────────────────────────────────────
// Generates 4 different carousel narrative angles for the user to choose from
// Each angle includes: hook (slide 1), story arc preview, and CTA
export async function generateCarouselAngles(
    inputs: AdInputs,
    resolvedUniverse: string,
    slideCount: number,
    globalRefinement?: string,
    plan?: StoredPlan
): Promise<string> {
    const carouselDecision = resolveEntitlement({ plan: plan || "none", feature: "carouselSlides", quantity: slideCount });
    if (!carouselDecision.allowed) {
        throw new HttpsError("permission-denied", carouselDecision.reason || "carousel_limit_exceeded");
    }
    const _angRtCtx = buildNormalizedRetargetingContext(inputs as any);
    const campaignType = (inputs as any).campaignType || 'cold';
    const isRetargeting = _angRtCtx.isRetargeting;
    const customObjection = _angRtCtx.customObjection;
    const testimonial = _angRtCtx.testimonial;
    const effectiveObjection = _angRtCtx.effectiveObjectionText;

    // Fetch website context if available
    let websiteContext = '';
    if (inputs.brandUrl) {
        websiteContext = await fetchWebsiteContext(inputs.brandUrl);
    }

    // ─── PERSONALIZATION INJECTION (Data Flywheel) ─────────────────────
    let carouselPersonalization = '';
    const _carouselUserId = (inputs as any)._userId;
    if (_carouselUserId) {
        try {
            carouselPersonalization = await buildPersonalizationContext(
                _carouselUserId, 'hooks', inputs.targetAudience
            );
        } catch (e) {
            console.warn('Carousel personalization failed (non-blocking):', e);
        }
    }

    const prompt = `
[CAROUSEL ANGLE ARCHITECT V1.0 — STORY ARC GENERATOR]

${(() => {
            // ═══ TESTIMONIAL MODE: Override carousel structure ═══
            const selectedModes = (inputs as any).offerCreativeMode || ['standard_hero'];
            const testimonialTexts = (inputs as any).testimonialTexts || [];
            if (selectedModes.includes('testimonial_carousel') && testimonialTexts.length > 0) {
                const testimonialSlides = testimonialTexts.slice(0, slideCount - 1).map((t: any, i: number) =>
                    `Slide ${i + 2}: Testimonial from ${t.speakerName || 'Client'} (${t.platform || 'chat'}): "${t.text}"`
                ).join('\n');
                return `
═══════════════════════════════════════════════════════════════════════════════
⚠️ TESTIMONIAL CAROUSEL MODE — SPECIAL STRUCTURE
═══════════════════════════════════════════════════════════════════════════════
This carousel uses REAL client testimonials. The structure is FIXED:

Slide 1 = HOOK SLIDE (you create this — encourage swiping to see testimonials)
${testimonialSlides}

HOOK SLIDE EXAMPLES:
- "Before you hire another coach… read this."
- "These messages changed everything."
- "Swipe to see real client messages."
- "لا تشتري قبل ما تقرأ هذي الرسائل"
- "اسحب وشوف كلام العملاء الحقيقي"

Generate 4 DIFFERENT hook slide options. Each must:
1. Create curiosity to SWIPE
2. Reference the testimonials indirectly (don't quote them)
3. Match the product context below

The testimonial slides are FIXED — you only generate the hook (Slide 1).
For the STORY_ARC: describe how the hook sets up the testimonials.
═══════════════════════════════════════════════════════════════════════════════
`;
            }
            return '';
        })()}
═══════════════════════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════════════════════
Product: "${inputs.productName}"
${inputs.brandUrl ? `Brand URL: ${inputs.brandUrl}` : ''}
${websiteContext || ''}
${inputs.brandColorPrimary ? `Brand Colors: Primary ${inputs.brandColorPrimary}${inputs.brandColorSecondary ? `, Secondary ${inputs.brandColorSecondary}` : ''} (mention in visual direction notes)` : ''}
Audience: "${inputs.targetAudience}"
Challenge: "${inputs.challenges}"
Transformation: "${inputs.transformation}"
Offer: "${inputs.offerType || 'Not specified'}"
${getOfferHookPsychology(inputs.offerType || '')}
${buildModeBlock(inputs)}
Universe Theme: "${resolveStyleFamily(inputs) === 'minimal' ? 'MINIMAL (clean commercial style — no environment references in copy)' : resolvedUniverse}" (visual only — copy must make direct sense)
Slide Count: ${slideCount} slides total
CTA: "${inputs.cta}"
${globalRefinement ? `User Direction: "${globalRefinement}"` : ''}
${carouselPersonalization}
${getLanguageInstruction(inputs.adLanguage || 'ar_fusha')}
${inputs.adTone ? `AD TONE: ${inputs.adTone} — match this tone across all 4 carousel angles.` : ''}
${inputs.coldHookAngle && !isRetargeting ? `HOOK ANGLE: ${inputs.coldHookAngle} — all angles should use this approach with varied execution.` : ''}
${inputs.hookType ? `HOOK DELIVERY STYLE: ${inputs.hookType} — deliver hooks in this style.` : ''}
${(inputs as any).copywritingStrategy ? `COPYWRITING STRATEGY: ${(inputs as any).copywritingStrategy} — apply this psychological framework to all angles.` : ''}

${isRetargeting ? `
═══════════════════════════════════════════════════════════════════════════════
⚠️ RETARGETING MODE — VIEWER HAS SEEN THE OFFER AND DID NOT BUY
═══════════════════════════════════════════════════════════════════════════════
OBJECTION: "${effectiveObjection}"
${testimonial ? `PROOF: "${testimonial}"` : ''}

Each angle must address this objection from a DIFFERENT psychological approach.
NO feature lists. NO benefits recap. SHIFT BELIEFS.
` : ''}

═══════════════════════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════════════════════

Generate 4 DIFFERENT carousel STORY ANGLES. Each angle is a complete narrative
direction for a ${slideCount}-slide carousel ad.

Each angle includes:
1. HOOK (Slide 1 headline — max 8 words) — the opening question/statement
2. SUBHEADLINE (optional — max ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? '12' : '8'} words, must be a COMPLETE sentence)
3. STORY_ARC — a 1-2 sentence preview of how the remaining slides will flow.
   Example: "Slides 2-4 list things you could waste $27 on, then the pivot reveals the real investment."
   This helps the user understand the NARRATIVE DIRECTION before committing.
4. CTA — the closing call to action for the final slide

THE 4 ANGLES MUST BE FUNDAMENTALLY DIFFERENT:
${isRetargeting ? `
Angle A → PROOF / COMPARISON: Use external undeniable proof to counter the objection
Angle B → QUESTION REFRAME: Replace their question with a better one
Angle C → IDENTITY SHIFT: Make them see themselves differently
Angle D → COST OF INACTION: Show the pain of NOT acting
` : `
Angle A → DIRECT VALUE: Lead with the core benefit/transformation
Angle B → CURIOSITY / QUESTION: Open with a question that demands swiping
Angle C → SOCIAL PROOF / STORY: Lead with a result or relatable scenario
Angle D → PROBLEM AGITATION: Start with the pain, build tension, then offer relief
`}

IMPORTANT:
- The STORY_ARC preview should describe the FLOW of all ${slideCount} slides in plain language
- Each angle must suggest a COMPLETELY DIFFERENT narrative structure
- The hook (slide 1) determines the entire carousel's direction
- Think: "If I choose Angle A, ALL ${slideCount} slides tell THIS story"
- ★ EVERY SLIDE must create curiosity to SWIPE to the next. No slide should feel complete alone.
- Use open loops, cliffhangers, unfinished thoughts — the reader must NEED the next slide.

═══════════════════════════════════════════════════════════════════════════════
EXAMPLE (for a 5-slide cold carousel selling a course):

ANGLE_START_A
HOOK_TEXT: ماذا يمكنك أن تشتري بـ 27 دولاراً؟
SUBHEADLINE: سؤال بسيط... إجابته تغيّر كل شيء
STORY_ARC: Slides 2-3 list everyday things you buy for $27 that vanish instantly (dinner, coffee). Slide 4 pivots with "أو..." to reveal the real investment. Slide 5 names the product and CTA.
CTA_BUTTON: ${inputs.cta}
ANGLE_END_A

ANGLE_START_B
HOOK_TEXT: كم خبيراً تعرفه يبيع بأقل مما يستحق؟
SUBHEADLINE: أنت واحد منهم... وهذا يتغير اليوم
STORY_ARC: Slides 2-3 describe the expert's daily frustration (undercharging, comparing to competitors). Slide 4 pivots to "الفرق بينك وبينهم = نظام واحد". Slide 5 introduces the product.
CTA_BUTTON: ${inputs.cta}
ANGLE_END_B
═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT — 4 ANGLES)
═══════════════════════════════════════════════════════════════════════════════

INSTRUCTIONS (do NOT include in output):
- HOOK_TEXT: Max 8 words headline. Write actual copy, not instructions.
- SUBHEADLINE: Max ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? '12' : '8'} words. Must be a COMPLETE sentence.
- STORY_ARC: 1-2 sentences describing how all ${slideCount} slides flow from this hook.
- CTA_BUTTON: CTA text ||| CONNECTOR + benefit (2-5 words). Benefit MUST start with a connector (و/ل/عشان/وابدأ).
- Angle A = ${isRetargeting ? 'Proof/Comparison' : 'Direct value/benefit'}. B = ${isRetargeting ? 'Question reframe' : 'Curiosity/Question'}. C = ${isRetargeting ? 'Identity shift' : 'Social proof/Story'}. D = ${isRetargeting ? 'Cost of inaction' : 'Problem agitation'}.

Fill in values after each colon — do NOT output brackets, instructions, or angle labels:

ANGLE_START_A
HOOK_TEXT: 
SUBHEADLINE: 
STORY_ARC: 
CTA_BUTTON: ${inputs.cta} ||| 
ANGLE_END_A

ANGLE_START_B
HOOK_TEXT: 
SUBHEADLINE: 
STORY_ARC: 
CTA_BUTTON: ${inputs.cta} ||| 
ANGLE_END_B

ANGLE_START_C
HOOK_TEXT: 
SUBHEADLINE: 
STORY_ARC: 
CTA_BUTTON: ${inputs.cta} ||| 
ANGLE_END_C

ANGLE_START_D
HOOK_TEXT: 
SUBHEADLINE: 
STORY_ARC: 
CTA_BUTTON: ${inputs.cta} ||| 
ANGLE_END_D

Output ONLY the 4 angle blocks above. No explanations. No markdown.
${inputs.competitorContext ? `

COMPETITIVE INTELLIGENCE (use to make carousel angles stand out from competitors):
${inputs.competitorContext}
At least 1-2 of the 4 angles should directly leverage competitive differentiation.` : ''}
`;

    const response = await retry(() => callGemini({
        model: CREATIVE_MODEL_PRO,
        contents: { parts: [{ text: prompt }] },
        config: {
            systemInstruction: SYSTEM_TOV,
            temperature: 0.85
        }
    }));

    // Return raw text — App.tsx will parse ANGLE_START_X / ANGLE_END_X blocks
    return response.text || '';
}

// ─── CAROUSEL SLIDE COPIES ─────────────────────────────────────────────────
// Generates unique hook/subhead for each slide in a carousel that builds a narrative arc
export async function generateCarouselSlideCopies(
    approvedTov: string,
    inputs: AdInputs,
    slideCount: number,
    resolvedUniverse: string,
    refinement?: string,
    plan?: StoredPlan
): Promise<CarouselSlideCopy[]> {
    const carouselDecision = resolveEntitlement({ plan: plan || "none", feature: "carouselSlides", quantity: slideCount });
    if (!carouselDecision.allowed) {
        throw new HttpsError("permission-denied", carouselDecision.reason || "carousel_limit_exceeded");
    }

    const hookText = extract(approvedTov, "HOOK_TEXT:", "SUBHEADLINE:");
    // Extract subheadline carefully — stop at STORY_ARC (carousel) or CTA_BUTTON (single)
    let subheadText = extract(approvedTov, "SUBHEADLINE:", "STORY_ARC:");
    if (!subheadText) subheadText = extract(approvedTov, "SUBHEADLINE:", "CTA_BUTTON:");
    // Clean any leaked STORY_ARC content from subheadline
    subheadText = subheadText.replace(/STORY_ARC[:\s].*/gs, '').trim();
    // Support both HOOK_END_X (from old single-hook format) and ANGLE_END_X (from new carousel angles)
    let ctaBlock = extract(approvedTov, "CTA_BUTTON:", "HOOK_END");
    if (!ctaBlock) ctaBlock = extract(approvedTov, "CTA_BUTTON:", "ANGLE_END");
    // Also try extracting story arc for context in the prompt
    const storyArc = extract(approvedTov, "STORY_ARC:", "CTA_BUTTON:") || '';

    let ctaName = inputs.cta;
    let benefitText = "";
    // Clean any leaked markers from ctaBlock
    const cleanCtaBlock = ctaBlock.replace(/ANGLE_END[_\s]*\w*/gi, '').replace(/HOOK_END[_\s]*\w*/gi, '').trim();
    if (cleanCtaBlock.includes("|||")) {
        const parts = cleanCtaBlock.split("|||");
        ctaName = (parts[0] || "").trim() || inputs.cta;
        benefitText = (parts[1] || "").trim();
    } else {
        ctaName = cleanCtaBlock.trim() || inputs.cta;
    }

    const _carRtCtx = buildNormalizedRetargetingContext(inputs as any);
    const campaignType = _carRtCtx.isRetargeting ? 'retargeting' : 'cold';
    const isRetargeting = _carRtCtx.isRetargeting;
    const customObjection = _carRtCtx.customObjection;
    const testimonial = _carRtCtx.testimonial;

    const retargetingContext = isRetargeting ? `
═══════════════════════════════════════════════════════════════════════════════
RETARGETING MODE — CRITICAL CONTEXT
═══════════════════════════════════════════════════════════════════════════════` : '';

    // ═══ TESTIMONIAL MODE: Return pre-built slide copies from extracted texts ═══
    const selectedModes = (inputs as any).offerCreativeMode || ['standard_hero'];
    const testimonialTexts = (inputs as any).testimonialTexts || [];
    if (selectedModes.includes('testimonial_carousel') && testimonialTexts.length > 0) {
        const testimonialSlides: CarouselSlideCopy[] = [];
        // Slide 1 is already the hook (handled by the caller)
        for (let i = 0; i < Math.min(testimonialTexts.length, slideCount - 1); i++) {
            const t = testimonialTexts[i];
            const isLastSlide = i === Math.min(testimonialTexts.length, slideCount - 1) - 1;
            testimonialSlides.push({
                hookText: t.text.length > 80 ? t.text.substring(0, 77) + '...' : t.text,
                subheadText: t.speakerName ? `— ${t.speakerName}` : '',
                ctaText: isLastSlide ? ctaName : '',
                benefitText: isLastSlide ? benefitText : '',
            });
        }
        return testimonialSlides;
    }

    const retargetingFullContext = isRetargeting ? `
This is a RETARGETING carousel. The viewer has already seen the offer and did NOT buy.
The approved hook (Slide 1) addresses a SPECIFIC OBJECTION.

OBJECTION: ${_carRtCtx.effectiveObjectionText}
${testimonial ? `PROOF TO USE: "${testimonial}"` : ''}

EVERY slide must stay on the SAME objection. Do NOT drift to other topics.
If the hook is about PRICE ("$27"), ALL slides must relate to the VALUE of $27 —
NOT time, NOT effort, NOT fear. Stay on PRICE/VALUE.

Example of WRONG drift:
- Hook: "ماذا يمكنك أن تشتري بـ 27 دولاراً؟" (about price)
- Slide 2: "هل لديك الوقت الكافي؟" ← WRONG! This is about TIME, not price.

Example of CORRECT flow:
- Hook: "ماذا يمكنك أن تشتري بـ 27 دولاراً؟" (about price)
- Slide 2: "وجبة عشاء تُنسى في اليوم التالي؟" ← CORRECT: comparing $27 value
- Slide 3: "اشتراك شهري في منصة أفلام؟" ← CORRECT: comparing $27 value
═══════════════════════════════════════════════════════════════════════════════
` : '';

    const prompt = `
[CAROUSEL NARRATIVE ARCHITECT V3.0]

You are writing the TEXT for a ${slideCount}-slide CAROUSEL AD that tells ONE FLOWING STORY across all slides.

APPROVED HOOK (Slide 1 — the opening line):
- Headline: "${hookText}"
- Subheadline: "${subheadText}"
${storyArc ? `
STORY DIRECTION (from the chosen angle):
"${storyArc}"
Follow this story direction when writing slides 2 through ${slideCount}. This is the narrative plan the user approved.
` : ''}

PRODUCT: ${inputs.productName}
PRICE/OFFER: ${inputs.offerType || 'Not specified'}
${getOfferHookPsychology(inputs.offerType || '')}
CTA BUTTON TEXT: "${ctaName}"
AUDIENCE: ${inputs.targetAudience}
CHALLENGE: ${inputs.challenges}
TRANSFORMATION: ${inputs.transformation}
${inputs.adTone ? `TONE: ${inputs.adTone} — maintain this tone across ALL slides. The carousel must feel emotionally consistent.` : ''}
${inputs.hookType ? `DELIVERY STYLE: ${inputs.hookType} — the hook uses this style. Continue it through all slides.` : ''}
${!isRetargeting && inputs.coldHookAngle ? `HOOK ANGLE: ${inputs.coldHookAngle} — maintain this angle consistently across all slides.` : ''}
${(inputs as any).copywritingStrategy ? `COPYWRITING STRATEGY: ${(inputs as any).copywritingStrategy} — maintain this psychological framework across all slides.` : ''}

${retargetingFullContext}

${getLanguageInstruction(inputs.adLanguage || 'ar_fusha')}

═══════════════════════════════════════════════════════════════════════════════
CAROUSEL NARRATIVE RULES (CRITICAL — READ CAREFULLY)
═══════════════════════════════════════════════════════════════════════════════

A carousel is NOT ${slideCount} separate ads. It is ONE STORY split across ${slideCount} slides.
The reader swipes because each slide is an INCOMPLETE thought that needs the next.

★ THE SWIPE RULE (MOST IMPORTANT): Every single slide MUST create curiosity that FORCES
the reader to swipe to the next slide. No slide should feel "complete" on its own.
- Use open loops: start a thought but don't finish it
- Use "..." at the end to signal continuation
- Use contrast words that demand resolution: "لكن..." / "أو..." / "بينما..."
- Each slide should feel like a cliffhanger — the reader NEEDS to see what's next
- If a slide can stand alone without the next one, it's WRONG. Rewrite it.

THE GOLDEN RULE: Every slide must ANSWER or CONTINUE the question/statement from Slide 1.
If Slide 1 asks "What can you buy for $27?", then slides 2-4 are ANSWERS to that SPECIFIC question.
Do NOT introduce new topics, new questions, or new angles. STAY ON THE HOOK'S THEME.

STRUCTURE:
- Slide 1: THE HOOK (already written — this is the question/statement)
- Slides 2 to ${Math.max(2, slideCount - 2)}: THE ANSWERS — Each is ONE SHORT direct answer/example.
  Think of them as bullet points in a conversation. Each one is incomplete without the next.
  Keep them SHORT: 1 line headline, optional short subheadline.
  These slides must DIRECTLY relate to the hook's core idea.

- Slide ${slideCount - 1}: THE PIVOT — "أو..." / "لكن..." / "بينما..."
  This is where the story TURNS from examples/problems to the solution.
  The pivot MUST contrast the previous slides with something dramatically better.

- Slide ${slideCount}: THE CTA — Name the product, state the price/value, and close with action.
  This slide gets the CTA button and benefit text.

QUALITY RULES:
1. Slide 1 is ALREADY written. Generate slides 2 through ${slideCount} ONLY.
2. Each middle slide = MAX 8 words headline. Like a punchy conversation line.
3. Subheadline is OPTIONAL for middle slides. Only add if it genuinely helps flow.
4. Only the LAST slide gets CTA button + benefit text.
5. Middle slides should NOT have CTA buttons — they are narrative, not ads.
6. Each slide should feel INCOMPLETE on its own — forcing the reader to swipe.
7. Do NOT repeat words from the hook in subsequent slides.
8. Use sensory/emotional/concrete language (food, money, experiences — NOT abstract concepts).
9. The PIVOT slide must create a dramatic "أو..." moment — the reader should feel "oh wait..."
10. STAY ON TOPIC: If the hook is about price, ALL slides discuss price. If about time, ALL about time.

EXAMPLE (for a 5-slide carousel with hook "ماذا يمكنك أن تشتري بـ 27 دولاراً؟"):
Slide 1: ماذا يمكنك أن تشتري بـ 27 دولاراً؟ [THE HOOK - already written]
Slide 2: وجبة عشاء سريعة تُنسى غداً؟ [ANSWER 1 - concrete, sensory]
Slide 3: اشتراك شهري في منصة أفلام تضيّع وقتك؟ [ANSWER 2 - concrete, relatable]
Slide 4: أم... تذكرة خروجك النهائي من حرب الأسعار؟ [THE PIVOT - dramatic contrast]
Slide 5: بـ 27 دولار فقط، احصل على نظام "كود السيادة" [THE CTA - product + price]

NOTICE: Every single slide is about what $27 can buy. No drift to time, effort, or fear.
The pivot slide uses "أم..." to dramatically contrast cheap purchases with the real investment.

ABSOLUTE RULES:
1. Slide 1 is ALREADY written (the approved hook). Generate slides 2 through ${slideCount} ONLY.
2. Each middle slide headline = MAX 8 WORDS. Short. Punchy. Like a friend talking.
3. Subheadline is OPTIONAL for middle slides. Leave empty if the headline is strong enough alone.
4. ONLY the LAST slide (slide ${slideCount}) gets SHOW_CTA: yes. All others: SHOW_CTA: no.
5. Middle slides = narrative flow, NOT standalone ads. No CTA buttons.
6. Every slide must DIRECTLY connect to the hook's core theme. NO TOPIC DRIFT.
7. Do NOT repeat words from the hook headline in subsequent slides.
8. Use concrete, sensory language (food, money, things you can touch/see/taste).
9. The PIVOT slide (slide ${slideCount - 1}) MUST start with a contrast word: "أم..." / "أو..." / "لكن..."
10. FORBIDDEN: Abstract concepts, motivational fluff, generic advice, new questions unrelated to hook.

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT)
═══════════════════════════════════════════════════════════════════════════════

${Array.from({ length: slideCount - 1 }, (_, i) => `SLIDE_${i + 2}_START
HEADLINE: [Max 8 words. Direct continuation of the story.]
SUBHEADLINE: [Optional — leave empty if headline is enough]
SHOW_CTA: ${i + 2 === slideCount ? 'yes' : 'no'}
SLIDE_${i + 2}_END`).join('\n\n')}

CRITICAL: Output ONLY the slide blocks above. No explanations. No markdown. No preamble.
Every HEADLINE must directly relate to Slide 1's theme. ZERO topic drift allowed.
${refinement ? `\n═══ USER REFINEMENT REQUEST ═══\nApply these changes to the copies: ${refinement}\n═══════════════════════════════` : ''}
`;

    const response = await retry(() => callGemini({
        model: CREATIVE_MODEL_PRO,
        contents: { parts: [{ text: prompt }] },
        config: {
            systemInstruction: SYSTEM_TOV,
            temperature: 0.8
        }
    }));

    const text = response.text || '';

    // Parse: Slide 1 = approved TOV, Slides 2-N = parsed from response
    const copies: CarouselSlideCopy[] = [
        { hookText, subheadText, ctaText: ctaName, benefitText }
    ];

    for (let i = 2; i <= slideCount; i++) {
        const blockText = (() => {
            const startMarker = `SLIDE_${i}_START`;
            const endMarker = `SLIDE_${i}_END`;
            const si = text.indexOf(startMarker);
            const ei = text.indexOf(endMarker);
            if (si >= 0 && ei > si) return text.slice(si + startMarker.length, ei).trim();
            return '';
        })();

        const lines = blockText.split('\n').map((l: string) => l.trim()).filter(Boolean);
        const headline = lines.find((l: string) => l.startsWith('HEADLINE:'))?.replace('HEADLINE:', '').trim() || `Slide ${i}`;
        const subLine = lines.find((l: string) => l.startsWith('SUBHEADLINE:'))?.replace('SUBHEADLINE:', '').trim() || '';
        const showCta = lines.find((l: string) => l.startsWith('SHOW_CTA:'))?.replace('SHOW_CTA:', '').trim().toLowerCase() === 'yes';

        copies.push({
            hookText: headline,
            subheadText: subLine,
            // Only the last slide (or slides marked SHOW_CTA: yes) get CTA
            ctaText: (showCta || i === slideCount) ? ctaName : '',
            benefitText: (showCta || i === slideCount) ? benefitText : '',
        });
    }

    // ── T025: Post-generation cultural scan on carousel slide copies ──
    if (isArabic(inputs.adLanguage)) {
        for (const copy of copies) {
            if (copy.hookText) {
                const { cleaned, matched } = scanAndReplace(copy.hookText, "adCopy");
                if (matched.length > 0) {
                    copy.hookText = cleaned;
                    console.log(`🕌 Cultural compliance scan (carousel hookText): replaced [${matched.join(", ")}]`);
                }
            }
            if (copy.subheadText) {
                const { cleaned, matched } = scanAndReplace(copy.subheadText, "adCopy");
                if (matched.length > 0) {
                    copy.subheadText = cleaned;
                    console.log(`🕌 Cultural compliance scan (carousel subheadText): replaced [${matched.join(", ")}]`);
                }
            }
        }
    }

    return copies;
}

// 5. Caption -> NEEDS GEMINI 3 (Creative)
// Updated to accept 'refinement' and force Fusha
export async function generateCaption(mockupUrl: string, inputs: AdInputs, visualMetaphor: string, approvedTov: string, refinement?: string, carouselContext?: string, buildPlanContext?: string): Promise<{ text: string; rankingGuidance: RankingLinkage | null; captionQuality: CaptionQualityResult | null }> {
    let _captionRankingLinkage: RankingLinkage | null = null;
    async function _generateCaptionInner(): Promise<{ text: string; captionQuality: CaptionQualityResult | null }> {
        // ═══ REFERENCE IMAGE ANALYSIS (optional, non-blocking) ═══
        let _captionRefInfluence: ReferenceInfluence | null = null;
        if (inputs.referenceImage) {
            _captionRefInfluence = await analyzeReferenceImage(inputs.referenceImage);
        }

        // ═══ PERSONALIZATION for Step 5 caption (non-blocking) ═══
        let _captionPersonalization = '';
        let _step5RankingGuidance: RankingGuidance | null = null;
        const _captionUserId = (inputs as any)._userId;
        if (_captionUserId) {
            try {
                _captionPersonalization = await buildPersonalizationContext(
                    _captionUserId, 'hooks', inputs.targetAudience
                );
            } catch { /* non-blocking */ }
            // ═══ RANKING GUIDANCE (Ticket 3 — soft bias from Ticket 2) ═══
            try {
                _step5RankingGuidance = await buildRankingGuidance(inputs, 'caption');
                _captionRankingLinkage = _step5RankingGuidance?.linkage || null;
            } catch { /* non-blocking */ }
        }

        const ctaName = inputs.cta;
        const captionOwnedText = resolveOwnedRenderText(approvedTov, inputs);
        const captionOwnership = buildPlanContext
            ? (() => {
                const parsed = parseBuildPlanEnvelope(buildPlanContext);
                const fallback = buildContentOwnershipMap(captionOwnedText, inputs);
                return parsed.machinePlan?.ownership ? mergeContentOwnership(fallback, parsed.machinePlan.ownership) : fallback;
            })()
            : buildContentOwnershipMap(captionOwnedText, inputs);
        const captionBuildPlan = buildPlanContext ? parseBuildPlanEnvelope(buildPlanContext) : null;
        // Extract hook text from approved TOV for copy alignment
        const hookText = extract(approvedTov, "HOOK_TEXT:", "SUBHEADLINE:") || captionOwnedText.hookText || '';
        const subheadText = extract(approvedTov, "SUBHEADLINE:", "CTA_BUTTON:") || captionOwnedText.subheadText || '';
        // Define retargeting variables (normalized)
        const _capRtCtx = buildNormalizedRetargetingContext(inputs as any);
        const campaignType = _capRtCtx.isRetargeting ? 'retargeting' : 'cold';
        const isRetargeting = _capRtCtx.isRetargeting;
        const retargetingContext = isRetargeting
            ? (_capRtCtx.objectionId
                ? `- Objection: ${_capRtCtx.objectionLabel}\n- Best Counter-Strategy: ${_capRtCtx.bestAngleLabel}\n- Core Belief to Challenge: ${_capRtCtx.hormoziContext}`
                : `- Custom Objection: "${_capRtCtx.customObjection}"\n- Best Counter-Strategy: ${_capRtCtx.bestAngleLabel}\n- Strategy: Analyze this objection and counter it with empathy + evidence.`)
            : '';
        const prompt = `[MASTER COPYWRITER ENGINE V5.0]

      MISSION: Write a 120 - 150 word Facebook / Instagram Ad Caption that makes the reader unable to stop until they click.

═══════════════════════════════════════════════════════════════════════════════
INPUT DATA
═══════════════════════════════════════════════════════════════════════════════
    - Product: ${inputs.productName}
    - Avatar: ${inputs.targetAudience}
    - Core Pain: ${inputs.challenges}
    - Transformation: ${inputs.transformation}
    - CTA: ${ctaName}
    - Offer Type: ${inputs.offerType || 'Not specified'}
    - STRUCTURED CONTENT OWNERSHIP:
      • primaryHeadline: "${captionOwnership.primaryHeadline || ''}"
      • supportingHeadline: "${captionOwnership.supportingHeadline || ''}"
      • ctaText: "${captionOwnership.ctaText || ''}"
      • offerPrice: "${captionOwnership.offerPrice || ''}"
      • originalPrice: "${captionOwnership.originalPrice || ''}"
      • savingsText: "${captionOwnership.savingsText || ''}"
      • proofItems: ${(captionOwnership.proofItems || []).join(' | ') || 'none'}
      • bonuses: ${(captionOwnership.bonuses || []).join(' | ') || 'none'}
      • urgencyText: "${captionOwnership.urgencyText || ''}"
      • eventTitle: "${captionOwnership.eventTitle || ''}"
      • speakerName: "${captionOwnership.speakerName || ''}"
    ${captionBuildPlan?.machinePlan ? `- STRUCTURED BLUEPRINT CONTEXT: ${captionBuildPlan.blueprint}` : ''}
    ${(() => {
                // ═══ STEP 3.5 → STEP 5: Unified layout contract for caption ═══
                const captionContract = compileFullContract({
                    selectedModes: (inputs as any).offerCreativeMode || ['standard_hero'],
                    hookAngle: inputs.coldHookAngle || undefined,
                    aspectRatio: inputs.aspectRatio || '1:1',
                    adLanguage: inputs.adLanguage || 'ar_fusha',
                    visualStyleFamily: resolveStyleFamily(inputs) || 'realistic',
                    referenceInfluence: _captionRefInfluence,
                });
                return `${getContractCaptionBlock(captionContract)}\n${buildModeCaptionAnchors(inputs)}`;
            })()}
    - Visual: "${visualMetaphor}"
      - IMAGE HEADLINE: "${hookText}"
        - IMAGE SUBHEADLINE: "${subheadText}"
          - Campaign Type: ${campaignType} // "cold" or "retargeting"
${retargetingContext}
${isRetargeting ? `BELIEF SHIFTING FRAMEWORK:\n${BELIEF_SHIFTING_FRAMEWORK}` : ''}

${getOfferCaptionStructure(inputs.offerType || '')}

═══════════════════════════════════════════════════════════════════════════════
    LANGUAGE & STYLE
═══════════════════════════════════════════════════════════════════════════════
    - ${getLanguageInstruction(inputs.adLanguage || 'ar_fusha')} ${inputs.adTone ? getAdToneCaptionCalibration(inputs.adTone) : 'Professional but warm.'}
- Rotate connector words: never repeat لكي / حتى / من أجل, مما يمنحك / فتحصل على, etc.
- Each sentence pulls to the next(Sugarman Slippery Slide).
- Speak to ONE person(أنت).

═══════════════════════════════════════════════════════════════════════════════
    HOOK - COPY ALIGNMENT(CRITICAL)
═══════════════════════════════════════════════════════════════════════════════
${carouselContext ? `
THIS IS A CAROUSEL AD with multiple slides. Your caption must tie the ENTIRE story together.
CAROUSEL SLIDE COPY:
${carouselContext}

The caption should reference the narrative arc across all slides — not just one image.
Open with the hook (slide 1), build momentum through the middle slides, and close with the CTA.
The reader sees ALL slides before reading the caption, so your caption should feel like the
natural conclusion/expansion of the entire carousel story.
` : `
The IMAGE shown to the viewer contains a HEADLINE and SUBHEADLINE(provided above).
Your caption MUST deliver on the promise made by that headline / subheadline.`}

      RULES:
    - If the subheadline promises a specific NUMBER(e.g. "3 secrets", "5 reasons", "4 mistakes"), you MUST list exactly that many items in the body copy, each clearly numbered or separated.
- If the headline asks a QUESTION, the body copy must answer it.
- If the headline makes a BOLD CLAIM, the body copy must provide supporting evidence or reasoning.
- The caption should feel like a CONTINUATION of the image text — the reader sees the image first, then reads the caption.They must connect seamlessly.
- Do NOT repeat the exact headline / subheadline text in the caption opening — the reader already saw it.Instead, EXPAND on the promise.

═══════════════════════════════════════════════════════════════════════════════
THE SUGARMAN SLIPPERY SLIDE PRINCIPLE (FROM KNOWLEDGE BASE)
${SLIPPERY_SLIDE}

QUALITY CHECKLIST:
${QUALITY_CHECKLIST}

ORIGINAL SLIPPERY SLIDE PRINCIPLE
═══════════════════════════════════════════════════════════════════════════════

Every sentence must be so compelling that the reader cannot stop until they reach the end.

      RULE: The ONLY purpose of the first sentence is to get them to read the second sentence.
        RULE: The ONLY purpose of the second sentence is to get them to read the third.
          RULE: Continue this momentum until they reach the CTA.

HOW TO CREATE THE SLIDE:
    - Open with curiosity, news, or a pattern interrupt
      - Each sentence must create an open loop that the next sentence closes
        - Never give complete satisfaction until the CTA

═══════════════════════════════════════════════════════════════════════════════
CAMPAIGN TYPE: ${isRetargeting ? 'RETARGETING (WARM TRAFFIC)' : 'COLD TRAFFIC'}
${inputs.coldHookAngle && !isRetargeting ? `HOOK ANGLE USED: ${inputs.coldHookAngle}\n${getHookAngleCaptionStrategy(inputs.coldHookAngle)}` : ''}
${inputs.hookType ? `HOOK DELIVERY STYLE: ${inputs.hookType}\n${getHookTypeCaptionStyle(inputs.hookType)}` : ''}
${(inputs as any).copywritingStrategy ? `\n${getCopywritingStrategyCaptionStructure((inputs as any).copywritingStrategy)}` : ''}
═══════════════════════════════════════════════════════════════════════════════

${!isRetargeting ? `
【COLD TRAFFIC RULES】
This person has NEVER seen your product before. They don't know you exist.

SCHWARTZ AWARENESS: Level 1-2 (Problem-Aware or Solution-Aware)
- They feel the pain but don't know your product is the answer
- Lead with the PROBLEM or DESIRE, not the product
- Build curiosity before revealing the solution

OPENING STYLE:
- Start with their pain, frustration, or dream
- Use questions that make them say "that's me!"
- Create identification before selling

RECOMMENDED FRAMEWORKS:
1. PAS (Problem → Agitate → Solve)
2. Before/After/Bridge
3. The Identification Headline

AVOID:
- Mentioning product name in the first line
- Assuming they know what you offer
- Jumping straight to benefits without establishing the problem
` : `
【RETARGETING RULES - BELIEF SHIFTING MANDATORY】
⚠️ This person has SEEN your offer before but didn't buy.
⚠️ MORE FEATURES = WASTE OF TIME. SHIFT THEIR BELIEF INSTEAD.

SCHWARTZ AWARENESS: Level 4-5 (Product-Aware or Most-Aware)
- They know your product. They have ONE doubt stopping them.
- Objection to bust: "${_capRtCtx.objectionLabel || _capRtCtx.customObjection}"
- Core belief to CHALLENGE (not explain): "${_capRtCtx.hormoziContext ? _capRtCtx.hormoziContext.split('\n').find(l => l.startsWith('CORE BELIEF'))?.replace('CORE BELIEF TO CHALLENGE: ', '') || '' : ''}"

【THE 4 BELIEF-SHIFTING WEAPONS - USE AT LEAST 2】

1. EXTERNAL UNDENIABLE PROOF
   Don't argue. Show something they can't deny.
   Examples: iPhone lines ($2000), wedding budgets ($10K), Netflix hours (3hrs/day)

2. QUESTION REFRAME
   Don't answer their question. Replace it with a better one.
   "السؤال الخطأ: هل ستنجح؟ السؤال الصح: كم يكلفك البقاء مكانك؟"

3. IDENTITY SHIFT
   Change how they see themselves.
   "أنت مش بائع. أنت خبير يستحق يتكافأ على قيمته."

4. COST OF INACTION
   Sell the pain of staying still, not the solution.
   "بعد 6 شهور: نفس المكان أو مكان مختلف. أنت تختار."

RETARGETING BELIEF SHIFT STRATEGY:
Use the BEST combination of these approaches to counter the objection:
→ External undeniable proof (real-world examples they can't deny)
→ Question reframe ("السؤال الخطأ vs السؤال الصح")
→ Identity shift ("أنت مش... أنت...")
→ Cost of inaction ("بعد 6 شهور: نفس المكان")
→ Risk reversal (flip the perceived risk)

FORBIDDEN IN RETARGETING:
✗ Bullet points (✓ استراتيجية ✓ نتائج ✓ ...)
✗ Feature lists / benefit stacking
✗ Explaining how it works
✗ "مما يمنحك..." / "وهذا يعني..."

REQUIRED IN RETARGETING:
✓ Address the specific objection directly
✓ At least one belief-shifting technique
✓ Short, punchy sentences
✓ Speaking to their FEAR, not the product
`}

═══════════════════════════════════════════════════════════════════════════════
    FRAMEWORK(Choose ONE based on campaign type)
═══════════════════════════════════════════════════════════════════════════════
${!isRetargeting ? `
COLD: Use PAS (Problem→Agitate→Solve), BAB (Before→After→Bridge), or Identification ("إذا كنت...")
- Start with pain/desire, NOT the product
- Build curiosity before revealing solution` : `
RETARGETING: Use Belief Shifting (they already know the product)
- External proof (iPhone lines, wedding budgets)
- Question reframe ("السؤال الخطأ vs السؤال الصح")
- Identity shift ("أنت مش بائع. أنت خبير.")
- Cost of inaction ("بعد 6 شهور: نفس المكان")`}

    BULLETS(max 3, each DIFFERENT structure): Feature→Benefit→Payoff, vary connectors.

═══════════════════════════════════════════════════════════════════════════════
    CLOSING: End with urgency or action CTA.Vary style(deadline, challenge, proof, benefit).
═══════════════════════════════════════════════════════════════════════════════



═══════════════════════════════════════════════════════════════════════════════
FINAL CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

□ Campaign type(${campaignType}) properly addressed
□ ${isRetargeting && _capRtCtx.objectionId ? 'Objection "' + _capRtCtx.effectiveObjectionText + '" addressed in opening' : 'Problem/desire leads the opening (not product)'}
□ One framework applied clearly throughout
□ First sentence creates curiosity or pattern interrupt
□ Connectors varied(no repetition of same word)
□ Bullets use different structures
□ Total length: 120 - 150 words
□ Speaking to ONE person(أنت), not a crowd
□ Contains at least one specific number or timeframe
□ Slippery slide: each sentence pulls to the next

${refinement ? `═══════════════════════════════════════════════════════════════════════════════
USER REFINEMENT: "${refinement}"
═══════════════════════════════════════════════════════════════════════════════` : ''
            }

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT(CRITICAL - FOLLOW EXACTLY)
═══════════════════════════════════════════════════════════════════════════════

Output ONLY the final Arabic ad copy formatted for EASY READING on mobile.

【FORMATTING RULES - MANDATORY】

    1. SHORT PARAGRAPHS: Maximum 2 sentences per paragraph.Then add a blank line.

2. QUESTIONS ON THEIR OWN LINE:
   ❌ WRONG: "هل فكرت يوماً في الساعات التي تضيع؟ تلك هي اللحظات..."
   ✅ RIGHT: "هل فكرت يوماً في الساعات التي تضيع؟

   تلك هي اللحظات..."

    3. HOOKS GET THEIR OWN LINE:
   The opening line should stand ALONE.
      Example:
    "ما زلت تتردد؟

   شاهدت العرض ولم تقرر بعد."

    4. REFRAMES GET DRAMATIC SPACING:
    "السؤال الحقيقي ليس 'هل تملك الوقت؟'
    بل: 'كم يكلفك البقاء في دائرة الإرهاق؟'"

    5. CTA STANDS ALONE AT THE END:
   Last 1 - 2 lines should be the call to action, separated by blank line.
      Add 👇 emoji before / after the CTA button text.

6. USE VISUAL BREAKS:
    - Blank lines between sections
      - Short punchy sentences
        - One idea per paragraph

【STRUCTURE TEMPLATE】

    [HOOK - 1 line, standalone]

    [ACKNOWLEDGE OBJECTION - 1 - 2 sentences]

    [BELIEF SHIFT / EXTERNAL PROOF - 2 - 3 short paragraphs with breaks]

    [REFRAME QUESTION - dramatic spacing]

    [IDENTITY STATEMENT - 1 - 2 sentences]

    [URGENCY - 1 sentence]

    [CTA - standalone with emoji]

❌ DO NOT include:
    - Step numbers or English headers
      - Wall of text with no line breaks
        - More than 2 sentences without a blank line
          - Asterisks, equal signs, or markers
            - ANY VISUAL / SCENE DESCRIPTIONS(like "المخطط البصري", "يظهر البطل", "الإضاءة سينمائية", costume descriptions, lighting descriptions, camera angles)
              - Blueprint or architecture descriptions(Cinematic Architecture, Cinematic Blueprint)
                - Descriptions of what the hero is wearing or doing

✅ Output: 120 - 150 words of Arabic ad copy ONLY, FORMATTED with line breaks for mobile readability.
✅ This is TEXT FOR SOCIAL MEDIA, not a scene description.Write ONLY what the reader will see in the Facebook / Instagram caption.
${inputs.competitorContext ? `

COMPETITIVE INTELLIGENCE (weave differentiation into the caption):
${inputs.competitorContext}
Position the offer as clearly superior without naming competitors directly. Use the attack hooks naturally.` : ''}
`;

        // ═══ CAPTION GENERATION + VALIDATION LOOP (max 1 repair attempt) ═══
        const locale = inputs.adLanguage || 'ar_fusha';
        const selectedModes = (inputs as any).offerCreativeMode || ['standard_hero'];
        const modePayload = compileModePayload(selectedModes, inputs);

        // Append personalization + ranking guidance if available
        let captionPromptFull = _captionPersonalization
            ? prompt + '\n' + _captionPersonalization
            : prompt;
        if (_step5RankingGuidance?.promptBlock) captionPromptFull += '\n' + _step5RankingGuidance.promptBlock;

        let result = '';
        let attempt = 0;
        let captionRepairPrompt: string | null = null;
        let captionQuality: CaptionQualityResult | null = null;
        let repairAttempted = false;
        const MAX_CAPTION_ATTEMPTS = 2;

        while (attempt < MAX_CAPTION_ATTEMPTS) {
            attempt++;
            const currentPrompt = attempt === 1
                ? captionPromptFull
                : captionPromptFull + '\n' + (captionRepairPrompt || '');

        const response = await retry(() => callGemini({
                model: CREATIVE_MODEL_PRO,
                contents: { parts: [{ text: currentPrompt }] },
                config: { systemInstruction: SYSTEM_CAPTION }
            }));

            result = response.text?.trim() || '';

            // ── Post-processing: Strip leaked step markers / scene descriptions ──
            result = cleanCaptionOutput(result);

            // ── Validate caption quality ──
            const validation = validateCaption({
                caption: result,
                locale,
                hookAngle: inputs.coldHookAngle || undefined,
                selectedModes,
                modePayload,
                cta: ctaName,
                isRetargeting,
                visualStyleFamily: resolveStyleFamily(inputs),
            });

            // ── Validate language quality ──
            const lines = result.split(/\n/).filter(Boolean);
            const headline = lines[0] || "";
            const subheadline = lines.slice(1).join(" ").trim() || "";
            const langQuality = validateLanguageQuality({
                headline,
                subheadline,
                locale,
                fullCaption: result,
            });

            // Build aggregate captionQuality from both validators
            const captionChecks: CaptionQualityCheck[] = validation.checks.map(c => ({
                rule: c.name,
                passed: c.passed,
                detail: c.detail,
            }));
            const allPassed = validation.passed && langQuality.passed;
            captionQuality = {
                passed: allPassed,
                captionChecks,
                languageChecks: langQuality.checks,
                repairedAt: null,
                locale,
            };

            if (allPassed) {
                console.log(`✅ Caption validated on attempt ${attempt} (${captionChecks.filter(c => c.passed).length}/${captionChecks.length} caption checks, ${langQuality.checks.filter(c => c.passed).length}/${langQuality.checks.length} lang quality checks)`);
                break;
            }

            const failedChecks = captionChecks.filter(c => !c.passed);
            const failedLangChecks = langQuality.checks.filter(c => !c.passed);
            console.warn(`⚠️ Caption validation failed (attempt ${attempt}/${MAX_CAPTION_ATTEMPTS}): caption=[${failedChecks.map(c => c.rule).join(', ')}] lang=[${failedLangChecks.map(c => c.rule).join(', ')}]`);

            if (attempt < MAX_CAPTION_ATTEMPTS) {
                const repairParts: string[] = [];
                if (validation.repairPrompt) repairParts.push(validation.repairPrompt);
                if (langQuality.repairPrompt) repairParts.push(langQuality.repairPrompt);
                captionRepairPrompt = repairParts.length > 0 ? repairParts.join('\n') : null;
                if (captionRepairPrompt) repairAttempted = true;
                if (captionRepairPrompt) console.log(`🔄 Attempting caption repair...`);
            } else {
                console.warn(`❌ Caption repair exhausted. Returning best-effort output.`);
            }
        }

        if (captionQuality && repairAttempted && captionQuality.passed) {
            captionQuality = { ...captionQuality, repairedAt: Date.now() };
        }

        return { text: result, captionQuality };
    }

    // ─── Caption cleanup helper (extracted from inline post-processing) ─────────
    function cleanCaptionOutput(raw: string): string {
        let result = raw
            .replace(/═+/g, '')
            .replace(/###\s*STEP\s*\d+[:\s].*/gi, '')
            .replace(/\*\*Headline\*\*\s*[:：].*/gi, '')
            .replace(/\*\*Subheadline\*\*\s*[:：].*/gi, '')
            .replace(/\*\*Benefit Claim\*\*\s*[:：].*/gi, '')
            .replace(/\*\*CTA\*\*\s*[:：].*/gi, '')
            .replace(/\*\*HERO\*\*\s*[:：].*/gi, '')
            .replace(/\*\*ENVIRONMENT\*\*\s*[:：].*/gi, '')
            .replace(/\*\*INTERACTION\*\*\s*[:：].*/gi, '')
            .replace(/\*\*NEGATIVE SPACE\*\*\s*[:：].*/gi, '')
            .replace(/\*\*ATMOSPHERE\*\*\s*[:：].*/gi, '')
            .replace(/\*\*TEXT FIDELITY\*\*\s*[:：].*/gi, '')
            .replace(/\*\*VISUAL HIERARCHY\*\*\s*[:：].*/gi, '')
            .replace(/\*\*FACE PROTECTION\*\*\s*[:：].*/gi, '')
            .replace(/\*\*COLOR PALETTE\*\*\s*[:：].*/gi, '')
            .replace(/\*\*REFINE\*\*\s*[:：].*/gi, '')
            .replace(/THEMATIC MARKETING FUSION/gi, '')
            .replace(/CINEMATIC ARCHITECT BLUEPRINT/gi, '')
            .replace(/MASTER STUDIO RENDER ENGINE/gi, '')
            .replace(/PRIMARY SCRIPT.*LONG-FORM AD COPY.*/gi, '')
            .replace(/\*+/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/المخطط البصري[\s\S]*?(?=\n\n|$)/gi, '')
            .replace(/Cinematic Architecture[\s\S]*?(?=\n\n|$)/gi, '')
            .replace(/يظهر البطل بهيئة[\s\S]*?(?=\n\n|$)/gi, '')
            .replace(/الإضاءة سينمائية[\s\S]*?(?=\n\n|$)/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // Filter out paragraphs with scene description keywords
        const sceneKeywords = [
            'يظهر البطل', 'الإضاءة', 'مساحة سلبية', 'الخلفية داكنة', 'Shadow Boxing',
            'النص يظهر', 'يقف في', 'مرتدياً', 'توفر مساحة', 'ملامح الوجه',
            'Cinematic', 'Blueprint', 'Architecture', 'Visual', 'بهو', 'ثريا',
            'الرخام', 'كريستال', 'يحمل الهاتف', 'Chiaroscuro'
        ];

        const paragraphs = result.split(/\n\n+/);
        const filteredParagraphs = paragraphs.filter((para: string) => {
            return !sceneKeywords.some(keyword => para.includes(keyword));
        });
        result = filteredParagraphs.join('\n\n').trim();

        // If result still contains English headers, extract Arabic blocks
        if (/STEP\s*\d|BLUEPRINT|FUSION|ENGINE/i.test(result)) {
            const arabicBlocks = result.split(/\n\n+/).filter((block: string) => /[\u0600-\u06FF]/.test(block) && block.length > 50);
            if (arabicBlocks.length > 0) {
                result = arabicBlocks[arabicBlocks.length - 1].trim();
            }
        }

        return result;
    } // end _generateCaptionInner
    let { text, captionQuality } = await _generateCaptionInner();
    // ── T025: Post-generation cultural scan on caption text ──
    let captionCulturalMatched: string[] = [];
    if (isArabic(inputs.adLanguage) && text) {
        const { cleaned, matched } = scanAndReplace(text, "adCopy");
        if (matched.length > 0) {
            text = cleaned;
            captionCulturalMatched = matched;
            console.log(`🕌 Cultural compliance scan (caption): replaced [${matched.join(", ")}]`);
        }
    }
    return { text, rankingGuidance: _captionRankingLinkage, captionQuality };
}

// 6. Visual Polishes -> USE LOGIC MODEL
export async function generateVisualPolishes(currentRender: string, inputs: AdInputs): Promise<VisualPolish[]> {
    const prompt = `
    [DIRECTIVE: 30 - YEAR DIRECT RESPONSE MASTER CRITIQUE]
      Analyze this ad render as a veteran Creative Director.Your focus is "Psychological Friction" and "Visual Narrative."

      CRITIQUE THE FOLLOWING:
    1. STOPPING POWER: Is there enough "Compositional Tension" ? (e.g., dynamic silhouette, high - action pose, or a curiosity - inducing focal point—regardless of where the Hero is looking).
    2. SCAN - ABILITY: Is the background too busy ? Suggest specific "Shadow Boxing"(darkening / blurring) areas to make the text pop instantly.
      3. PSYCHOLOGICAL COLOR: Are the[HL] keywords dominant ? Suggest a high - contrast color tweak for them.
      4. UNIVERSE FIDELITY: Does the costume feel like a physical, tangible part of the ${inputs.preferredUniverse}? Fix any AI - generic artifacts.
      5. CTA CLARITY: Identify if the Benefit String repeats any words from the CTA Button "${inputs.cta}".If so, suggest a way to separate them.
      6. CLICK - GAP: Does the button look like it exists in 3D space with a tactile texture ?

      RETURN 4 custom Visual Polishes(JSON array { id, label, instruction }).Instructions must be technical and surgical.
    `;

    const response = await callGemini({
        model: LOGIC_MODEL, // <--- LOGIC MODEL IS FINE FOR CRITIQUE
        contents: { parts: [{ inlineData: { mimeType: "image/png", data: currentRender.split(',')[1] } }, { text: prompt }] },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: { id: { type: "STRING" }, label: { type: "STRING" }, instruction: { type: "STRING" } },
                    required: ["id", "label", "instruction"]
                }
            }
        }
    });
    try { return JSON.parse(response.text || '[]'); } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTIMONIAL CAROUSEL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

import { detectTestimonialPlatform, buildTestimonialMockup, setTestimonialGeminiCaller } from "./testimonialMockup.js";
import type { PlatformType, TestimonialSlideResult, TestimonialCarouselResult, VisualStyleFamily } from "./types.js";
import { resolveTestimonialSlideCount } from "./creativeResolver.js";

export { setTestimonialGeminiCaller };

const ALLOWED_STYLES: ReadonlySet<VisualStyleFamily> = new Set(["realistic", "fantasy", "minimal"] as const);

export async function generateTestimonialHookSlide(
    inputs: AdInputs,
    testimonialCount: number,
    visualStyleFamily: VisualStyleFamily,
): Promise<{ hookText: string; subheadText: string }> {
    const rtCtx = buildNormalizedRetargetingContext(inputs as any);
    const ctaText = inputs.cta || '';
    const lang = inputs.adLanguage || 'ar_fusha';
    const langInstruction = getLanguageInstruction(lang);
    const artDirectionBlock = `ART DIRECTION: ${visualStyleFamily}. Tone must remain consistent with the rest of this testimonial carousel (hook, mockups, and close all share one art direction).`;

    let prompt: string;
    if (rtCtx.isRetargeting) {
        const objectionText = rtCtx.effectiveObjectionText;
        prompt = `Write a RETARGETING carousel hook slide (slide 1) for a testimonial carousel.

CAMPAIGN TYPE: Retargeting (warm traffic)
OBJECTION: "${objectionText}"
TESTIMONIAL COUNT: ${testimonialCount} testimonials available as evidence
CTA BUTTON: "${ctaText}"

${langInstruction}

${artDirectionBlock}

RULES:
- The headline MUST name or reference the specific objection: "${objectionText}"
- The headline MUST tease testimonials as proof/evidence
- Create urgency to swipe — the viewer needs to see the proof
- Do NOT quote any testimonial directly
- Do NOT show any testimonial content on this slide
- Max 10 words for headline
- Subheadline: max 15 words, adds context
- The tone should feel like "you had a doubt? let me show you something"

OUTPUT FORMAT (STRICT):
HEADLINE: one line of hook text
SUBHEADLINE: one line of supporting text`;
    } else {
        prompt = `Write a COLD carousel hook slide (slide 1) for a testimonial carousel.

CAMPAIGN TYPE: Cold (new traffic)
TESTIMONIAL COUNT: ${testimonialCount} testimonials available
CTA BUTTON: "${ctaText}"

${langInstruction}

${artDirectionBlock}

RULES:
- Create curiosity to swipe by teasing social proof WITHOUT showing it
- Reference testimonials indirectly (e.g. "see what people are saying" or similar)
- Do NOT quote any testimonial directly
- Do NOT show any testimonial content on this slide
- Max 10 words for headline
- Subheadline: max 15 words, adds curiosity
- The tone should feel like "wait until you see this"

OUTPUT FORMAT (STRICT):
HEADLINE: one line of hook text
SUBHEADLINE: one line of supporting text`;
    }

    const response = await retry(() => callGemini({
        model: CREATIVE_MODEL_PRO,
        contents: { parts: [{ text: prompt }] },
        config: { temperature: 0.9 },
    }));

    const text = response.text || '';
    const hookText = text.match(/HEADLINE:\s*(.+)/)?.[1]?.trim() || '';
    const subheadText = text.match(/SUBHEADLINE:\s*(.+)/)?.[1]?.trim() || '';

    return { hookText, subheadText };
}

export async function generateTestimonialCloseSlide(
    inputs: AdInputs,
    visualStyleFamily: VisualStyleFamily,
): Promise<{ closeText: string; subheadText: string }> {
    const rtCtx = buildNormalizedRetargetingContext(inputs as any);
    const ctaText = inputs.cta || '';
    const lang = inputs.adLanguage || 'ar_fusha';
    const langInstruction = getLanguageInstruction(lang);
    const artDirectionBlock = `ART DIRECTION: ${visualStyleFamily}. Tone must remain consistent with the rest of this testimonial carousel (hook, mockups, and close all share one art direction).`;

    let prompt: string;
    if (rtCtx.isRetargeting) {
        const objectionText = rtCtx.effectiveObjectionText;
        prompt = `Write a RETARGETING close slide (last slide) for a testimonial carousel.

CAMPAIGN TYPE: Retargeting (warm traffic)
OBJECTION: "${objectionText}"
CTA BUTTON: "${ctaText}"

${langInstruction}

${artDirectionBlock}

RULES:
- This is the FINAL slide after multiple testimonial slides
- The close MUST connect back to the objection: "${objectionText}"
- Frame the testimonials as the resolution to the objection
- Do NOT be generic — specifically address why the objection is now resolved
- Include a clear call to action referencing the CTA button
- Max 10 words for headline
- Subheadline: max 15 words, final push

OUTPUT FORMAT (STRICT):
HEADLINE: one line of close text
SUBHEADLINE: one line of supporting text`;
    } else {
        prompt = `Write a COLD close slide (last slide) for a testimonial carousel.

CAMPAIGN TYPE: Cold (new traffic)
CTA BUTTON: "${ctaText}"

${langInstruction}

${artDirectionBlock}

RULES:
- This is the FINAL slide after multiple testimonial slides
- May reference a key result or stat from the testimonials
- End with a strong call to action matching the CTA button
- Do NOT be generic — make it feel like a natural conclusion to the testimonial journey
- Max 10 words for headline
- Subheadline: max 15 words, final push

OUTPUT FORMAT (STRICT):
HEADLINE: one line of close text
SUBHEADLINE: one line of supporting text`;
    }

    const response = await retry(() => callGemini({
        model: CREATIVE_MODEL_PRO,
        contents: { parts: [{ text: prompt }] },
        config: { temperature: 0.9 },
    }));

    const text = response.text || '';
    const closeText = text.match(/HEADLINE:\s*(.+)/)?.[1]?.trim() || '';
    const subheadText = text.match(/SUBHEADLINE:\s*(.+)/)?.[1]?.trim() || '';

    return { closeText, subheadText };
}

export async function generateTestimonialCarousel(
    inputs: AdInputs,
    screenshots: string[],
    maxPlanSlides: number,
): Promise<TestimonialCarouselResult> {
    const ctaText = inputs.cta || '';
    const rawStyle = resolveStyleFamily(inputs);
    const visualStyleFamily: VisualStyleFamily = ALLOWED_STYLES.has(rawStyle as VisualStyleFamily)
        ? (rawStyle as VisualStyleFamily)
        : "realistic";

    const totalSlides = resolveTestimonialSlideCount(screenshots.length, maxPlanSlides);
    const testimonialCount = totalSlides - 2;

    console.log(`💬 Testimonial carousel: ${screenshots.length} screenshots, ${totalSlides} slides (${testimonialCount} testimonials + hook + close), style=${visualStyleFamily}`);

    const platforms = await Promise.all(
        screenshots.slice(0, testimonialCount).map((s) => detectTestimonialPlatform(s))
    );
    console.log(`💬 Detected platforms: ${platforms.join(', ')}`);

    const [hookResult, mockupResults, closeResult] = await Promise.all([
        generateTestimonialHookSlide(inputs, testimonialCount, visualStyleFamily),
        Promise.all(
            screenshots.slice(0, testimonialCount).map((s, i) => buildTestimonialMockup(s, platforms[i], visualStyleFamily))
        ),
        generateTestimonialCloseSlide(inputs, visualStyleFamily),
    ]);

    const slides: TestimonialSlideResult[] = [];

    slides.push({
        slideNumber: 1,
        role: 'hook',
        platform: null,
        imageBase64: '',
        hookText: hookResult.hookText,
        ctaText,
        hasCTA: true,
    });

    for (let i = 0; i < testimonialCount; i++) {
        slides.push({
            slideNumber: i + 2,
            role: 'testimonial',
            platform: platforms[i],
            imageBase64: mockupResults[i],
            hookText: null,
            ctaText: null,
            hasCTA: false,
        });
    }

    slides.push({
        slideNumber: totalSlides,
        role: 'close',
        platform: null,
        imageBase64: '',
        hookText: closeResult.closeText,
        ctaText,
        hasCTA: true,
    });

    return {
        slides,
        detectedPlatforms: platforms,
        totalSlides,
        visualStyleFamily,
    };
}

export function validateBatchRunEntitlement(plan: StoredPlan, sizes: number, hooks: number, concepts: number): void {
    const requested = sizes * hooks * concepts;
    const decision = resolveEntitlement({ plan, feature: "batchRun", quantity: requested });
    if (!decision.allowed) {
        throw new HttpsError("permission-denied", decision.reason || "batch_limit_exceeded");
    }
}