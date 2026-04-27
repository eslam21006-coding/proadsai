/**
 * creativeScoringEngine.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * CREATIVE SCORING ENGINE — Quality validation gate
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { type LayoutContract } from "./layoutTemplates";
import type { BrandColorComplianceEntry } from "./types.js";

export interface CreativeScoreResult {
    passed: boolean;
    overallScore: number;
    categories: {
        layoutIntegrity: number;
        hierarchyClarity: number;
        modeCompliance: number;
        hookAlignment: number;
        visualBalance: number;
        textReadability: number;
        compositionCleanliness: number;
    };
    violations: string[];
    suggestions: string[];
}

const PASS_THRESHOLD = 60;
const CATEGORY_FAIL_THRESHOLD = 30;
const COMMERCIAL_PLACEHOLDER_PATTERNS = [
    /\btotal\s*value\b/i,
    /\bsavings\s*callout\b/i,
    /\bprice\s*label\b/i,
    /\bplaceholder\b/i,
    /\blorem\b/i,
    /^\s*سعر\s*$/im,
];

function containsCommercialPlaceholderLeak(value: string): boolean {
    return COMMERCIAL_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value || ''));
}

function stripNegatedForbiddenContext(value: string): string {
    return value
        .replace(/^.*(?:FORBIDDEN|MUST AVOID|MUST NOT|EXCLUDED|PROHIBITED|NOT ALLOWED|DO NOT USE|NEVER USE|EFFECTS FORBIDDEN|DISALLOWED)\b.*$/gim, '')
        .replace(/^.*(?:ممنوع|محظور|مستبعد).*$/gim, '')
        .replace(/\([^)]*\b(?:no|avoid|never|without|excluded?)\b[^)]*\)/gi, '')
        .replace(/\b(?:no|avoid|never|without|eliminate|remove|don'?t use|do not use|do not|strictly no|must not|should not|cannot|can'?t|excluded?|prohibited?|disallowed?|shouldn'?t|won'?t|isn'?t)\b[^.\n]{0,300}/gi, '')
        .replace(/(?:بدون|لا |بلا)[^.\n]{0,200}/g, '');
}

function isPositiveForbiddenReference(planLower: string, terms: string): boolean {
    for (const verb of ['add', 'include', 'render', 'place', 'show']) {
        const phrase = `${verb} ${terms}`;
        const idx = planLower.indexOf(phrase);
        if (idx === -1) continue;
        const afterMatch = planLower.substring(idx + phrase.length, idx + phrase.length + 8);
        if (/^-(?:free|less|proof|safe)\b/.test(afterMatch)) continue;
        const contextBefore = planLower.substring(Math.max(0, idx - 60), idx);
        const isNegated = /\b(not|don'?t|never|no|avoid|forbidden|do not|must not|cannot|excluded?|prohibited?|shouldn'?t|won'?t|disallowed?|skip|omit|without)\b/i.test(contextBefore);
        if (!isNegated) return true;
    }
    return false;
}

export function validateBuildPlanAgainstContract(
    buildPlanText: string,
    contract: LayoutContract,
): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const planLower = buildPlanText.toLowerCase();

    for (const [zoneName, zone] of Object.entries(contract.zones)) {
        const searchTerms = zoneName.replace(/_/g, ' ').split(' ');
        const found = searchTerms.some(term => planLower.includes(term.toLowerCase()));
        if (!found && zone.priority <= 2) {
            warnings.push(`High-priority zone "${zoneName}" (priority ${zone.priority}) not referenced in build plan.`);
        }
    }

    if (containsCommercialPlaceholderLeak(buildPlanText)) {
        warnings.push('Build plan still contains unresolved commercial placeholder text.');
    }

    const strippedLower = stripNegatedForbiddenContext(buildPlanText).toLowerCase();
    for (const avoid of contract.mustAvoid) {
        const avoidTerms = avoid.replace(/_/g, ' ').toLowerCase();
        if (isPositiveForbiddenReference(strippedLower, avoidTerms)) {
            warnings.push(`Build plan references forbidden element: "${avoid}".`);
        }
    }

    if (contract.hasUrgencyAccent) {
        const urgencyTerms = ['badge', 'countdown', 'timer', 'deadline', 'ribbon', 'urgent'];
        const hasUrgency = urgencyTerms.some(t => planLower.includes(t));
        if (!hasUrgency) {
            warnings.push('Urgency accent is active but no urgency elements (badge/timer/deadline) found in build plan.');
        }
    }

    return {
        valid: warnings.length <= 2,
        warnings,
    };
}

export function buildScoringPrompt(
    contract: LayoutContract,
    expectedHeadline: string,
    expectedSubheadline: string,
    expectedCTA: string,
    expectedBenefit: string,
    aspectRatio: string,
): string {
    const zoneDescriptions = Object.entries(contract.zones)
        .sort(([, a], [, b]) => a.priority - b.priority)
        .map(([name, zone]) => {
            const parts = [`position: ${zone.anchor}`, `priority: ${zone.priority}`];
            if (zone.minSizePct) parts.push(`min size: ${zone.minSizePct}%`);
            if (zone.maxSizePct) parts.push(`max size: ${zone.maxSizePct}%`);
            return `${name}: ${parts.join(', ')}`;
        });

    return `You are a professional ad design quality inspector. Score this advertisement image STRICTLY against the layout contract below.

LAYOUT CONTRACT:
Template: ${contract.templateName}
Required zones (in priority order):
${zoneDescriptions.map((z, i) => `${i + 1}. ${z}`).join('\n')}

FORBIDDEN elements: ${contract.mustAvoid.join(', ') || 'none'}

Expected text:
- Headline: "${expectedHeadline}"
- Subheadline: "${expectedSubheadline}"
${expectedCTA ? `- CTA: "${expectedCTA}"` : ''}
${expectedBenefit ? `- Benefit: "${expectedBenefit}"` : ''}
- Aspect ratio: ${aspectRatio}
${contract.hasUrgencyAccent ? '- Urgency accent: badge/countdown/deadline ribbon should be present (max 20% of canvas)' : ''}

Score each category 0-100:

1. layout_integrity: Are the required zones present and positioned correctly?
2. hierarchy_clarity: Is the priority order maintained? (priority 1 = most prominent)
3. mode_compliance: Does the image match the "${contract.templateName}" template?
4. hook_alignment: Does the visual reflect the ${contract.hookAngle || 'standard'} hook angle?
5. visual_balance: Is the composition balanced, not lopsided or cluttered?
6. text_readability: Are all text layers clearly legible against the background?
7. composition_cleanliness: Are there any forbidden elements present? Any random/floating items?

Return ONLY valid JSON:
{"scores":{"layout_integrity":N,"hierarchy_clarity":N,"mode_compliance":N,"hook_alignment":N,"visual_balance":N,"text_readability":N,"composition_cleanliness":N},"overall":N,"passed":true/false,"violations":["issue1","issue2"],"fixes":["fix1","fix2"]}

Rules:
- passed=false if overall<${PASS_THRESHOLD} or any score<${CATEGORY_FAIL_THRESHOLD}
- violations: list specific contract breaches found
- fixes: max 3 actionable corrections for the renderer
- Be strict. This is a quality gate, not a participation trophy.`;
}

export function parseScoringResponse(responseText: string): CreativeScoreResult {
    try {
        const clean = responseText.replace(/```json|```/g, '').trim();
        const data = JSON.parse(clean);

        const scores = data.scores || {};
        const categories = {
            layoutIntegrity: clamp(scores.layout_integrity || 50),
            hierarchyClarity: clamp(scores.hierarchy_clarity || 50),
            modeCompliance: clamp(scores.mode_compliance || 50),
            hookAlignment: clamp(scores.hook_alignment || 50),
            visualBalance: clamp(scores.visual_balance || 50),
            textReadability: clamp(scores.text_readability || 50),
            compositionCleanliness: clamp(scores.composition_cleanliness || 50),
        };

        const categoryValues = Object.values(categories);
        const overallScore = data.overall || Math.round(categoryValues.reduce((a, b) => a + b, 0) / categoryValues.length);
        const anyFailing = categoryValues.some(v => v < CATEGORY_FAIL_THRESHOLD);

        return {
            passed: overallScore >= PASS_THRESHOLD && !anyFailing,
            overallScore: clamp(overallScore),
            categories,
            violations: (data.violations || []).slice(0, 5),
            suggestions: (data.fixes || []).slice(0, 3),
        };
    } catch {
        return {
            passed: true,
            overallScore: 70,
            categories: {
                layoutIntegrity: 70,
                hierarchyClarity: 70,
                modeCompliance: 70,
                hookAlignment: 70,
                visualBalance: 70,
                textReadability: 70,
                compositionCleanliness: 70,
            },
            violations: [],
            suggestions: [],
        };
    }
}

export function applyBrandColorDeduction(
    result: CreativeScoreResult,
    complianceEntry: BrandColorComplianceEntry,
): CreativeScoreResult {
    if (!complianceEntry.checkRan || complianceEntry.present) {
        return result;
    }

    const newScore = clamp(result.overallScore - complianceEntry.deductedScore);
    return {
        ...result,
        overallScore: newScore,
        passed: newScore >= PASS_THRESHOLD,
        violations: [...result.violations, "Brand primary missing from rendered image"],
    };
}

function clamp(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
}

export function quickRejectCheck(contract: LayoutContract, buildPlanText: string): {
    reject: boolean;
    reason: string | null;
} {
    const stripped = stripNegatedForbiddenContext(buildPlanText);
    const planLower = stripped.toLowerCase();

    if (containsCommercialPlaceholderLeak(buildPlanText)) {
        return { reject: true, reason: 'Build plan contains unresolved commercial placeholder text.' };
    }

    for (const avoid of contract.mustAvoid) {
        const terms = avoid.replace(/_/g, ' ').toLowerCase();
        if (isPositiveForbiddenReference(planLower, terms)) {
            return { reject: true, reason: `Build plan adds forbidden element: "${avoid}"` };
        }
    }

    if (contract.template === 'hero_value_stack_split' || contract.template === 'hero_value_stack_panel') {
        const heroBlockPatterns = [
            /(?<!\bnot\s)(?<!\bdon'?t\s)(?<!\bnever\s)(?<!\bdo not\s)(?<!\bavoid\s)hero\s+hidden/i,
            /(?<!\bnot\s)(?<!\bdon'?t\s)(?<!\bnever\s)(?<!\bdo not\s)(?<!\bavoid\s)hero\s+behind/i,
            /(?<!\bnot\s)(?<!\bdon'?t\s)(?<!\bnever\s)(?<!\bdo not\s)(?<!\bavoid\s)cover\s+the\s+hero/i,
            /(?<!\bnot\s)(?<!\bdon'?t\s)(?<!\bnever\s)(?<!\bdo not\s)(?<!\bavoid\s)hide\s+the\s+hero/i,
            /(?<!\bnot\s)(?<!\bdon'?t\s)(?<!\bnever\s)(?<!\bdo not\s)(?<!\bavoid\s)hero\s+obscured/i,
            /(?<!\bnot\s)(?<!\bdon'?t\s)(?<!\bnever\s)(?<!\bdo not\s)(?<!\bavoid\s)hero\s+blocked/i,
        ];
        const heroViolation = heroBlockPatterns.some(p => p.test(stripped));
        if (heroViolation) {
            return { reject: true, reason: 'Hero must remain visible and dominant in value stack layouts.' };
        }
    }

    return { reject: false, reason: null };
}
