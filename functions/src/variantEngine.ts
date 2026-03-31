/**
 * variantEngine.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * VARIANT EXPLORATION ENGINE + MEMORY INTEGRATION
 *
 * Generates structured creative variations for systematic A/B testing.
 * Each variant changes ONE controlled variable while keeping everything else identical.
 *
 * Variant Dimensions:
 *   1. Hook Angle         (urgency vs pain_point vs social_proof)
 *   2. Copy Framing        (question vs statement vs story)
 *   3. CTA Style           (direct vs curiosity vs urgency)
 *   4. Urgency Expression  (timer vs scarcity vs deadline)
 *   5. Visual Composition   (hero left vs hero center vs split)
 *   6. Hook Type           (comedic vs controversial vs shocking_stat)
 *
 * Rules:
 *   - Maximum 2 dimensions change per variant
 *   - Same template, same layout contract, same brand style
 *   - 3-6 variants per set
 *   - Each variant gets a structured ID: VS_{timestamp}_{A|B|C|D|E|F}
 *
 * Memory Integration (Phase 10):
 *   - Query memory for best-performing dimensions before generating
 *   - Generate variants AROUND winning patterns
 *   - Track variant results → update memory → improve future variants
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { retrieveCreativePatterns, storeCreativeToMemory } from "./creativeMemory.js";
import { selectLayoutTemplate, compileLayoutContract } from "./layoutTemplates.js";
import { resolveCreativeSpec } from "./creativeResolver.js";

// ─── VARIANT TYPES ──────────────────────────────────────────────────────────
export type VariantDimension =
    | 'hook_angle'
    | 'copy_framing'
    | 'cta_style'
    | 'urgency_expression'
    | 'visual_composition'
    | 'hook_type';

export interface VariantSpec {
    variantId: string;           // e.g. "VS_1710000000_A"
    label: string;               // e.g. "A"
    changedDimensions: {
        dimension: VariantDimension;
        originalValue: string;
        variantValue: string;
    }[];
    // Overrides for generation
    hookAngleOverride?: string;
    hookTypeOverride?: string;
    ctaStyleOverride?: string;
    copyFramingOverride?: string;
    urgencyOverride?: string;
    compositionOverride?: string;
}

export interface VariantSet {
    setId: string;               // e.g. "VS_1710000000"
    userId: string;
    createdAt: number;
    // Base creative identity (shared across all variants)
    baseTemplate: string;
    baseCreativeModes: string[];
    baseHookAngle: string;
    baseHookType: string;
    baseAspectRatio: string;
    baseCta: string;
    // The variants
    variants: VariantSpec[];
    // Performance (populated after push + sync)
    winnerId: string | null;
    winnerDimensions: { dimension: string; value: string }[] | null;
    status: 'draft' | 'pushed' | 'tracking' | 'complete';
}

// ─── VARIANT VALUE OPTIONS ──────────────────────────────────────────────────
const HOOK_ANGLE_OPTIONS = [
    'pain_point', 'urgency', 'social_proof', 'curiosity', 'fomo',
    'authority', 'before_after', 'emotional', 'logic', 'scarcity',
];

const HOOK_TYPE_OPTIONS = [
    'curiosity_gap', 'shocking_stat', 'controversial', 'comedic',
    'pain_point', 'transformation_promise', 'social_proof_stat',
];

const CTA_STYLE_OPTIONS = [
    'direct',        // "سجل الآن" / "Register Now"
    'curiosity',     // "اكتشف كيف" / "Discover How"
    'urgency',       // "آخر فرصة" / "Last Chance"
    'value',         // "احصل على $2,997 مجاناً" / "Get $2,997 Free"
    'question',      // "مستعد للتغيير؟" / "Ready for Change?"
];

const COPY_FRAMING_OPTIONS = [
    'question',      // Opens with a question
    'statement',     // Bold declarative statement
    'story',         // Mini narrative/anecdote
    'stat',          // Opens with a number/statistic
    'contrast',      // Before/after framing
];

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE VARIANT SET
// ═══════════════════════════════════════════════════════════════════════════

export interface GenerateVariantsInput {
    userId: string;
    // Base creative settings
    hookAngle: string;
    hookType: string;
    creativeModes: string[];
    aspectRatio: string;
    cta: string;
    niche: string;
    // Control
    variantCount: number;          // 3-6
    primaryDimension: VariantDimension; // Which dimension to explore
    secondaryDimension?: VariantDimension; // Optional second dimension
}

export async function generateVariantSet(input: GenerateVariantsInput): Promise<VariantSet> {
    const count = Math.max(3, Math.min(6, input.variantCount));
    const timestamp = Date.now();
    const setId = `VS_${timestamp}`;

    // Resolve template for the base
    const spec = resolveCreativeSpec({
        selectedModes: input.creativeModes,
        hookAngle: input.hookAngle,
    });
    const templateId = selectLayoutTemplate(spec.primaryMode, spec.secondaryMode, input.hookAngle, input.aspectRatio);

    // ═══ MEMORY INTEGRATION: Query for best-performing values ═══
    let memoryGuidance: string[] = [];
    try {
        const patterns = await retrieveCreativePatterns(input.userId, {
            niche: input.niche,
            hookAngle: input.hookAngle,
            creativeModes: input.creativeModes,
            layoutTemplate: templateId,
        });
        if (patterns) {
            // Extract winning dimension values from patterns
            // This biases variant generation toward proven performers
            memoryGuidance.push(patterns);
        }
    } catch {
        // Non-blocking
    }

    // Build variants by varying the chosen dimension(s)
    const variants: VariantSpec[] = [];

    // Variant A = the base (control)
    variants.push({
        variantId: `${setId}_A`,
        label: 'A',
        changedDimensions: [], // Control — no changes
    });

    // Generate remaining variants
    const primaryValues = getValuesForDimension(input.primaryDimension, input.hookAngle, input.hookType, count - 1);
    const secondaryValues = input.secondaryDimension
        ? getValuesForDimension(input.secondaryDimension, input.hookAngle, input.hookType, count - 1)
        : null;

    for (let i = 0; i < count - 1; i++) {
        const label = LABELS[i + 1]; // B, C, D, E, F
        const changes: VariantSpec['changedDimensions'] = [];
        const overrides: Partial<VariantSpec> = {};

        // Primary dimension change
        const primaryValue = primaryValues[i];
        if (primaryValue) {
            changes.push({
                dimension: input.primaryDimension,
                originalValue: getOriginalValue(input.primaryDimension, input),
                variantValue: primaryValue,
            });
            applyOverride(overrides, input.primaryDimension, primaryValue);
        }

        // Secondary dimension change (optional — max 2 changes per variant)
        if (secondaryValues && secondaryValues[i]) {
            changes.push({
                dimension: input.secondaryDimension!,
                originalValue: getOriginalValue(input.secondaryDimension!, input),
                variantValue: secondaryValues[i],
            });
            applyOverride(overrides, input.secondaryDimension!, secondaryValues[i]);
        }

        variants.push({
            variantId: `${setId}_${label}`,
            label,
            changedDimensions: changes,
            ...overrides,
        });
    }

    return {
        setId,
        userId: input.userId,
        createdAt: timestamp,
        baseTemplate: templateId,
        baseCreativeModes: input.creativeModes,
        baseHookAngle: input.hookAngle,
        baseHookType: input.hookType,
        baseAspectRatio: input.aspectRatio,
        baseCta: input.cta,
        variants,
        winnerId: null,
        winnerDimensions: null,
        status: 'draft',
    };
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function getValuesForDimension(
    dimension: VariantDimension,
    currentAngle: string,
    currentType: string,
    count: number,
): string[] {
    let pool: string[];
    let current: string;

    switch (dimension) {
        case 'hook_angle':
            pool = HOOK_ANGLE_OPTIONS;
            current = currentAngle;
            break;
        case 'hook_type':
            pool = HOOK_TYPE_OPTIONS;
            current = currentType;
            break;
        case 'cta_style':
            pool = CTA_STYLE_OPTIONS;
            current = 'direct';
            break;
        case 'copy_framing':
            pool = COPY_FRAMING_OPTIONS;
            current = 'statement';
            break;
        case 'urgency_expression':
            pool = ['timer', 'scarcity', 'deadline', 'limited_spots', 'price_increase'];
            current = 'timer';
            break;
        case 'visual_composition':
            pool = ['hero_left', 'hero_center', 'hero_right', 'split_screen', 'asymmetric'];
            current = 'hero_center';
            break;
        default:
            pool = [];
            current = '';
    }

    // Filter out current value and pick diverse options
    const available = pool.filter(v => v !== current);
    // Shuffle for variety
    const shuffled = available.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function getOriginalValue(dimension: VariantDimension, input: GenerateVariantsInput): string {
    switch (dimension) {
        case 'hook_angle': return input.hookAngle;
        case 'hook_type': return input.hookType;
        case 'cta_style': return 'direct';
        case 'copy_framing': return 'statement';
        case 'urgency_expression': return 'timer';
        case 'visual_composition': return 'hero_center';
        default: return '';
    }
}

function applyOverride(overrides: Partial<VariantSpec>, dimension: VariantDimension, value: string): void {
    switch (dimension) {
        case 'hook_angle': overrides.hookAngleOverride = value; break;
        case 'hook_type': overrides.hookTypeOverride = value; break;
        case 'cta_style': overrides.ctaStyleOverride = value; break;
        case 'copy_framing': overrides.copyFramingOverride = value; break;
        case 'urgency_expression': overrides.urgencyOverride = value; break;
        case 'visual_composition': overrides.compositionOverride = value; break;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VARIANT PROMPT MODIFIER
// ═══════════════════════════════════════════════════════════════════════════
// Generates a prompt modifier block for a specific variant.
// Injected into hook/concept generation to produce the variant's creative.

export function getVariantPromptModifier(variant: VariantSpec): string {
    if (variant.changedDimensions.length === 0) {
        return ''; // Control variant — no modifications
    }

    const lines: string[] = [
        `═══ VARIANT ${variant.label} — CONTROLLED TEST ═══`,
    ];

    for (const change of variant.changedDimensions) {
        lines.push(`CHANGE: ${change.dimension.replace(/_/g, ' ').toUpperCase()}`);
        lines.push(`  From: ${change.originalValue} → To: ${change.variantValue}`);
    }

    if (variant.hookAngleOverride) {
        lines.push(`USE THIS HOOK ANGLE: ${variant.hookAngleOverride}`);
    }
    if (variant.hookTypeOverride) {
        lines.push(`USE THIS HOOK DELIVERY: ${variant.hookTypeOverride}`);
    }
    if (variant.ctaStyleOverride) {
        lines.push(`CTA STYLE: ${variant.ctaStyleOverride} — adapt the CTA button text and benefit to match this style.`);
    }
    if (variant.copyFramingOverride) {
        lines.push(`COPY FRAMING: ${variant.copyFramingOverride} — open the hook using this framing approach.`);
    }
    if (variant.urgencyOverride) {
        lines.push(`URGENCY TYPE: ${variant.urgencyOverride} — use this specific urgency mechanism.`);
    }
    if (variant.compositionOverride) {
        lines.push(`COMPOSITION: ${variant.compositionOverride} — adjust the visual layout to this composition.`);
    }

    lines.push('Keep ALL other elements identical to the base creative (same brand, same audience, same template).');
    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// VARIANT PERFORMANCE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

import * as admin from "firebase-admin";
function getDb() { return admin.firestore(); }

/**
 * Store a variant set to Firestore for tracking.
 */
export async function storeVariantSet(variantSet: VariantSet): Promise<void> {
    await getDb().collection("variantSets").doc(variantSet.setId).set({
        ...variantSet,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`🧪 Variant set stored: ${variantSet.setId} (${variantSet.variants.length} variants)`);
}

/**
 * After enough performance data, identify the winner and record insights.
 */
export async function evaluateVariantSet(setId: string): Promise<{
    winnerId: string | null;
    winnerDimensions: { dimension: string; value: string }[] | null;
} | null> {
    const setDoc = await getDb().collection("variantSets").doc(setId).get();
    if (!setDoc.exists) return null;

    const setData = setDoc.data() as VariantSet;

    // Look up performance for each variant by matching creativeMemory
    const variantScores: { variantId: string; score: number; label: string }[] = [];

    for (const variant of setData.variants) {
        const memSnap = await getDb().collection("creativeMemory")
            .where("userId", "==", setData.userId)
            .where("creativeId", ">=", variant.variantId)
            .where("creativeId", "<=", variant.variantId + '\uf8ff')
            .limit(1)
            .get();

        if (!memSnap.empty) {
            const score = memSnap.docs[0].data().compositeScore || 0;
            variantScores.push({ variantId: variant.variantId, score, label: variant.label });
        }
    }

    if (variantScores.length < 2) return null; // Not enough data

    // Find winner
    variantScores.sort((a, b) => b.score - a.score);
    const winner = variantScores[0];
    const winnerVariant = setData.variants.find(v => v.variantId === winner.variantId);

    const result = {
        winnerId: winner.variantId,
        winnerDimensions: winnerVariant?.changedDimensions.map(d => ({
            dimension: d.dimension,
            value: d.variantValue,
        })) || null,
    };

    // Update the set
    await setDoc.ref.update({
        winnerId: result.winnerId,
        winnerDimensions: result.winnerDimensions,
        status: 'complete',
    });

    console.log(`🏆 Variant winner: ${winner.label} (score ${winner.score}) in set ${setId}`);

    // ═══ MEMORY FEEDBACK LOOP: Record winning dimensions ═══
    // This influences future generations via pattern indexes
    if (result.winnerDimensions && result.winnerDimensions.length > 0) {
        try {
            const { rebuildPatternIndexes } = await import("./creativeMemory.js");
            await rebuildPatternIndexes(setData.userId);
        } catch {
            // Non-blocking
        }
    }

    return result;
}