/**
 * rankingEngine.ts — Ticket 2 (Corrected)
 * ═══════════════════════════════════════════════════════════════════════════
 * Scope cascade: user (1.0) > niche (0.75) > global (0.45)
 * Threshold gate: OR (either low confidence OR low sample → skip)
 * Dedup: scope precedence > confidence > score
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as admin from "firebase-admin";
import { type SummaryFamily, type SummaryScope, type PatternSummary, derivePairId } from "./patternSummaries.js";
import * as crypto from "crypto";

function getDb() { return admin.firestore(); }

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — Input
// ═══════════════════════════════════════════════════════════════════════════

export interface RankingInput {
    userId: string;
    workspaceId?: string;
    niche?: string;
    offerType?: string;
    funnelStage?: string;
    language?: string;
    aspectRatio?: string;
    selectedModes?: string[];
    pairCandidates?: string[];
    templateCandidates?: string[];
    universeFamilyCandidates?: string[];
    hookAngleCandidates?: string[];
    universeCategory?: string;
    universeStyleFamily?: string;
    referenceAdUsed?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — Score Breakdown (auditable)
// ═══════════════════════════════════════════════════════════════════════════

export interface ScoreBreakdown {
    scopeWeight: number;
    baseScore: number;
    conversionBoost: number;
    spendBoost: number;
    ctrBoost: number;
    negativePenalty: number;
    offerTypeBoost: number;
    funnelStageBoost: number;
    languageBoost: number;
    aspectRatioBoost: number;
    universeMetadataBoost: number;
    finalScore: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — Output
// ═══════════════════════════════════════════════════════════════════════════

export type RecommendationVerdict = 'strong_recommend' | 'recommend' | 'neutral' | 'warn' | 'exclude';

export interface RankedCandidate {
    family: SummaryFamily;
    key: string;
    verdict: RecommendationVerdict;
    score: number;
    confidence: number;
    reason: string;
    scope: SummaryScope;
    sampleSize: number;
    netScore: number;
    deployCount: number;
    spendBackedCount: number;
    conversionCount: number;
    avgCtr: number;
    breakdown: ScoreBreakdown;
}

export interface Warning {
    family: SummaryFamily;
    key: string;
    pattern?: string;
    frequency: number;
    scope: SummaryScope;
    reason: string;
}

export interface Exclusion {
    family: SummaryFamily;
    key: string;
    reason: string;
}

export interface EvidenceCounts {
    summariesConsumed: number;
    pairsEvaluated: number;
    templatesEvaluated: number;
    universeFamiliesEvaluated: number;
    hookAnglesEvaluated: number;
    failurePatternsEvaluated: number;
    scopesUsed: SummaryScope[];
}

export interface RankingResult {
    requestId: string;
    requestFingerprint: string;
    userId: string;
    timestamp: string;
    inputContext: RankingInput;

    // Per-family ranked candidates (full lists)
    pairs: RankedCandidate[];
    templates: RankedCandidate[];
    universeFamilies: RankedCandidate[];
    hookAngles: RankedCandidate[];

    // Explicit recommendations (top picks)
    recommendedPair: RankedCandidate | null;
    recommendedTemplate: RankedCandidate | null;
    recommendedUniverseFamilies: RankedCandidate[];
    recommendedHookAngles: RankedCandidate[];
    topRecommendation: { family: SummaryFamily; key: string; score: number; reason: string } | null;

    // Normalized warnings/exclusions
    warnings: Warning[];
    exclusions: Exclusion[];

    // Evidence
    evidenceCounts: EvidenceCounts;
    decisionLog: DecisionLogEntry[];
}

export interface DecisionLogEntry {
    step: string;
    family: SummaryFamily;
    key: string;
    scope: SummaryScope;
    rawNetScore: number;
    confidence: number;
    blendedScore: number;
    verdict: RecommendationVerdict;
    reason: string;
    breakdown: ScoreBreakdown;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS — Fix #1: exact weights
// ═══════════════════════════════════════════════════════════════════════════

const MIN_CONFIDENCE = 0.15;
const MIN_SAMPLE_SIZE = 3;

const SCOPE_WEIGHTS: Record<SummaryScope, number> = {
    user: 1.0,
    niche: 0.75,
    global: 0.45,
};

const SCOPE_PRECEDENCE: Record<SummaryScope, number> = {
    user: 3,
    niche: 2,
    global: 1,
};

const VERDICT_THRESHOLDS = {
    strong_recommend: 8.0,
    recommend: 3.0,
    warn: -2.0,
    exclude: -6.0,
};

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST FINGERPRINT — Fix #9
// ═══════════════════════════════════════════════════════════════════════════

function computeFingerprint(input: RankingInput): string {
    const canonical = JSON.stringify({
        u: input.userId,
        w: input.workspaceId || '',
        n: input.niche || '',
        o: input.offerType || '',
        f: input.funnelStage || '',
        l: input.language || '',
        a: input.aspectRatio || '',
        m: (input.selectedModes || []).slice().sort().join('+'),
        pc: (input.pairCandidates || []).slice().sort().join('+'),
        tc: (input.templateCandidates || []).slice().sort().join('+'),
        ufc: (input.universeFamilyCandidates || []).slice().sort().join('+'),
        hac: (input.hookAngleCandidates || []).slice().sort().join('+'),
        uc: input.universeCategory || '',
        us: input.universeStyleFamily || '',
        r: input.referenceAdUsed ? '1' : '0',
    });
    return crypto.createHash('sha256').update(canonical).digest('hex').substring(0, 16);
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY — Fix #2: OR threshold gate
// ═══════════════════════════════════════════════════════════════════════════

async function querySummaries(
    family: SummaryFamily,
    scopes: { scope: SummaryScope; scopeValue: string }[],
    candidateKeys?: string[],
): Promise<PatternSummary[]> {
    const results: PatternSummary[] = [];
    for (const { scope, scopeValue } of scopes) {
        const q: FirebaseFirestore.Query = getDb().collection('pattern_summaries')
            .where('family', '==', family)
            .where('scope', '==', scope)
            .where('scopeValue', '==', scopeValue);
        const snap = await q.limit(100).get();
        for (const doc of snap.docs) {
            const s = doc.data() as PatternSummary;
            if (candidateKeys && candidateKeys.length > 0 && !candidateKeys.includes(s.key)) continue;
            // Fix #2: OR gate — skip if EITHER is below threshold
            if (s.confidence < MIN_CONFIDENCE || s.sampleSize < MIN_SAMPLE_SIZE) continue;
            results.push(s);
        }
    }
    return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING — Fix #8: auditable breakdown
// ═══════════════════════════════════════════════════════════════════════════

function blendScore(summary: PatternSummary, input: RankingInput): { score: number; breakdown: ScoreBreakdown } {
    const scopeWeight = SCOPE_WEIGHTS[summary.scope] || 0;
    const baseScore = +(((summary.netScore || 0) * (summary.confidence || 0) * scopeWeight) || 0).toFixed(4);

    let conversionBoost = 0;
    if ((summary.conversionCount || 0) > 0) conversionBoost = +(2.0 * scopeWeight).toFixed(4);

    let spendBoost = 0;
    if ((summary.spendBackedCount || 0) >= 3) spendBoost = +(1.5 * scopeWeight).toFixed(4);

    let ctrBoost = 0;
    if ((summary.avgCtr || 0) > 2.0 && (summary.totalImpressions || 0) > 500) ctrBoost = +(1.0 * scopeWeight).toFixed(4);

    let negativePenalty = 0;
    if ((summary.sampleSize || 0) >= 5) {
        const negRatio = (summary.negativeCount || 0) / (summary.sampleSize || 1);
        if (negRatio > 0.5) negativePenalty = +(3.0 * scopeWeight).toFixed(4);
        else if (negRatio > 0.3) negativePenalty = +(1.5 * scopeWeight).toFixed(4);
    }

    const offerTypeBoost = (input.offerType && summary.offerType === input.offerType) ? 0.5 : 0;
    const funnelStageBoost = (input.funnelStage && summary.funnelStage === input.funnelStage) ? 0.3 : 0;
    const languageBoost = (input.language && summary.language === input.language) ? 0.2 : 0;
    const aspectRatioBoost = (input.aspectRatio && summary.aspectRatio === input.aspectRatio) ? 0.2 : 0;

    // Structured universe metadata boost — universeCategory only (fully schema-based)
    let universeMetadataBoost = 0;
    if (input.universeCategory && summary.family === 'universe_family' && summary.key === input.universeCategory) {
        universeMetadataBoost = 0.4;
    }

    const finalScore = +(baseScore + conversionBoost + spendBoost + ctrBoost - negativePenalty +
        offerTypeBoost + funnelStageBoost + languageBoost + aspectRatioBoost + universeMetadataBoost).toFixed(2);

    return {
        score: finalScore,
        breakdown: {
            scopeWeight, baseScore, conversionBoost, spendBoost, ctrBoost, negativePenalty,
            offerTypeBoost, funnelStageBoost, languageBoost, aspectRatioBoost, universeMetadataBoost, finalScore,
        },
    };
}

function determineVerdict(score: number): RecommendationVerdict {
    if (score >= VERDICT_THRESHOLDS.strong_recommend) return 'strong_recommend';
    if (score >= VERDICT_THRESHOLDS.recommend) return 'recommend';
    if (score <= VERDICT_THRESHOLDS.exclude) return 'exclude';
    if (score <= VERDICT_THRESHOLDS.warn) return 'warn';
    return 'neutral';
}

function buildReason(summary: PatternSummary, verdict: RecommendationVerdict, score: number): string {
    const parts: string[] = [];
    if (verdict === 'strong_recommend') {
        parts.push(`Strong winner: ${summary.sampleSize} samples, ${summary.confidence.toFixed(2)} confidence`);
        if (summary.conversionCount > 0) parts.push(`${summary.conversionCount} conversions`);
        if (summary.avgCtr > 2) parts.push(`${summary.avgCtr}% CTR`);
    } else if (verdict === 'recommend') {
        parts.push(`Positive signal: net ${summary.netScore}, ${summary.sampleSize} samples`);
        if (summary.deployCount > 0) parts.push(`deployed ${summary.deployCount}x`);
    } else if (verdict === 'warn') {
        parts.push(`Weak: net ${summary.netScore}`);
        if (summary.negativeCount > 0) parts.push(`${summary.negativeCount} negatives`);
    } else if (verdict === 'exclude') {
        parts.push(`Poor: net ${summary.netScore}, ${summary.negativeCount} negatives`);
    } else {
        parts.push(`Neutral (score ${score.toFixed(1)})`);
    }
    parts.push(`[${summary.scope}]`);
    return parts.join('. ');
}

// ═══════════════════════════════════════════════════════════════════════════
// DEDUP — Fix #3: scope precedence > confidence > score
// ═══════════════════════════════════════════════════════════════════════════

function deduplicateBestScope(candidates: RankedCandidate[]): RankedCandidate[] {
    const bestByKey = new Map<string, RankedCandidate>();
    for (const c of candidates) {
        const existing = bestByKey.get(c.key);
        if (!existing) { bestByKey.set(c.key, c); continue; }
        const existingPrec = SCOPE_PRECEDENCE[existing.scope] || 0;
        const candidatePrec = SCOPE_PRECEDENCE[c.scope] || 0;
        // 1. Stronger scope wins
        if (candidatePrec > existingPrec) { bestByKey.set(c.key, c); continue; }
        if (candidatePrec < existingPrec) continue;
        // 2. Same scope → higher confidence wins
        if (c.confidence > existing.confidence) { bestByKey.set(c.key, c); continue; }
        if (c.confidence < existing.confidence) continue;
        // 3. Same confidence → higher score wins
        if (c.score > existing.score) bestByKey.set(c.key, c);
    }
    return [...bestByKey.values()].sort((a, b) => b.score - a.score);
}

// ═══════════════════════════════════════════════════════════════════════════
// RANK — Process one family
// ═══════════════════════════════════════════════════════════════════════════

async function rankFamily(
    family: SummaryFamily,
    scopes: { scope: SummaryScope; scopeValue: string }[],
    input: RankingInput,
    candidateKeys?: string[],
    log: DecisionLogEntry[] = [],
): Promise<RankedCandidate[]> {
    const summaries = await querySummaries(family, scopes, candidateKeys);
    const candidates: RankedCandidate[] = [];
    for (const s of summaries) {
        const { score, breakdown } = blendScore(s, input);
        const verdict = determineVerdict(score);
        const candidate: RankedCandidate = {
            family, key: s.key, verdict, score,
            confidence: s.confidence, reason: buildReason(s, verdict, score),
            scope: s.scope, sampleSize: s.sampleSize, netScore: s.netScore,
            deployCount: s.deployCount, spendBackedCount: s.spendBackedCount,
            conversionCount: s.conversionCount, avgCtr: s.avgCtr, breakdown,
        };
        candidates.push(candidate);
        log.push({
            step: `rank_${family}`, family, key: s.key, scope: s.scope,
            rawNetScore: s.netScore, confidence: s.confidence,
            blendedScore: score, verdict, reason: candidate.reason, breakdown,
        });
    }
    return deduplicateBestScope(candidates);
}

// ═══════════════════════════════════════════════════════════════════════════
// WARNINGS — Fix #5: normalized Warning type
// ═══════════════════════════════════════════════════════════════════════════

async function getWarnings(
    scopes: { scope: SummaryScope; scopeValue: string }[],
): Promise<{ warnings: Warning[]; evaluated: number }> {
    const summaries = await querySummaries('failure_pattern', scopes);
    const warnings: Warning[] = [];
    for (const s of summaries) {
        if (s.sampleSize >= 3 && s.negativeCount >= 2) {
            warnings.push({
                family: 'failure_pattern', key: s.key, pattern: s.key,
                frequency: s.negativeCount, scope: s.scope,
                reason: `"${s.key.replace(/\+/g, ' + ')}" ×${s.negativeCount} [${s.scope}]`,
            });
        }
    }
    return { warnings: warnings.sort((a, b) => b.frequency - a.frequency).slice(0, 10), evaluated: summaries.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — Extract best positive candidate
// ═══════════════════════════════════════════════════════════════════════════

function bestPositive(candidates: RankedCandidate[]): RankedCandidate | null {
    return candidates.find(c => c.verdict === 'strong_recommend' || c.verdict === 'recommend') || null;
}

function allPositive(candidates: RankedCandidate[]): RankedCandidate[] {
    return candidates.filter(c => c.verdict === 'strong_recommend' || c.verdict === 'recommend');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY
// ═══════════════════════════════════════════════════════════════════════════

export async function getRankings(input: RankingInput): Promise<RankingResult> {
    const requestId = `rank_${input.userId}_${Date.now()}`;
    const requestFingerprint = computeFingerprint(input);
    const decisionLog: DecisionLogEntry[] = [];

    const scopes: { scope: SummaryScope; scopeValue: string }[] = [
        { scope: 'user', scopeValue: input.userId },
    ];
    if (input.niche) scopes.push({ scope: 'niche', scopeValue: input.niche });
    scopes.push({ scope: 'global', scopeValue: '_global' });

    let pairCandidates = input.pairCandidates;
    if (!pairCandidates && input.selectedModes && input.selectedModes.length > 0) {
        const pid = derivePairId(input.selectedModes);
        if (pid) pairCandidates = [pid];
    }

    const pairs = await rankFamily('pair', scopes, input, pairCandidates, decisionLog);
    const templates = await rankFamily('template', scopes, input, input.templateCandidates, decisionLog);
    const universeFamilies = await rankFamily('universe_family', scopes, input, input.universeFamilyCandidates, decisionLog);
    const hookAngles = await rankFamily('hook_angle', scopes, input, input.hookAngleCandidates, decisionLog);
    const { warnings, evaluated: failurePatternsEvaluated } = await getWarnings(scopes);

    // Fix #4: explicit recommendation fields
    const recommendedPair = bestPositive(pairs);
    const recommendedTemplate = bestPositive(templates);
    const recommendedUniverseFamilies = allPositive(universeFamilies);
    const recommendedHookAngles = allPositive(hookAngles);

    // Exclusions from all families
    const exclusions: Exclusion[] = [];
    for (const list of [pairs, templates, universeFamilies, hookAngles]) {
        for (const c of list) {
            if (c.verdict === 'exclude') exclusions.push({ family: c.family, key: c.key, reason: c.reason });
        }
    }
    // Also add warn-level from failure patterns as warnings (already in warnings array)

    // Top recommendation across all families
    const allCandidates = [...pairs, ...templates, ...universeFamilies, ...hookAngles];
    const topPositive = allCandidates.filter(c => c.verdict === 'strong_recommend' || c.verdict === 'recommend')
        .sort((a, b) => b.score - a.score)[0] || null;
    const topRecommendation = topPositive
        ? { family: topPositive.family, key: topPositive.key, score: topPositive.score, reason: topPositive.reason }
        : null;

    // Fix #6: evidence counts
    const evidenceCounts: EvidenceCounts = {
        summariesConsumed: decisionLog.length,
        pairsEvaluated: pairs.length,
        templatesEvaluated: templates.length,
        universeFamiliesEvaluated: universeFamilies.length,
        hookAnglesEvaluated: hookAngles.length,
        failurePatternsEvaluated,
        scopesUsed: scopes.map(s => s.scope),
    };

    const result: RankingResult = {
        requestId, requestFingerprint, userId: input.userId,
        timestamp: new Date().toISOString(), inputContext: input,
        pairs, templates, universeFamilies, hookAngles,
        recommendedPair, recommendedTemplate, recommendedUniverseFamilies, recommendedHookAngles,
        topRecommendation, warnings, exclusions, evidenceCounts, decisionLog,
    };

    // Persist with fingerprint + retention TTL
    try {
        const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
        // Sanitize: Firestore rejects undefined values and NaN — JSON round-trip strips both
        const sanitized = JSON.parse(JSON.stringify(result));
        await getDb().collection('ranking_decisions').doc(requestId).set({
            ...sanitized,
            expiresAt,
            _storedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (e) {
        console.warn('Failed to persist ranking decision (non-blocking):', e);
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE: single candidate verdict
// ═══════════════════════════════════════════════════════════════════════════

export async function getVerdictForCandidate(
    userId: string, family: SummaryFamily, key: string, niche?: string,
    context?: Partial<RankingInput>,
): Promise<RankedCandidate | null> {
    const scopes: { scope: SummaryScope; scopeValue: string }[] = [
        { scope: 'user', scopeValue: userId },
    ];
    if (niche) scopes.push({ scope: 'niche', scopeValue: niche });
    scopes.push({ scope: 'global', scopeValue: '_global' });

    const summaries = await querySummaries(family, scopes, [key]);
    if (summaries.length === 0) return null;

    const inputCtx: RankingInput = { userId, niche, ...context };

    // Compute blended score for each summary FIRST
    const scored = summaries.map(s => {
        const { score, breakdown } = blendScore(s, inputCtx);
        return { summary: s, score, breakdown };
    });

    // Sort by: scope precedence > confidence > blended score
    scored.sort((a, b) => {
        const precDiff = (SCOPE_PRECEDENCE[b.summary.scope] || 0) - (SCOPE_PRECEDENCE[a.summary.scope] || 0);
        if (precDiff !== 0) return precDiff;
        const confDiff = b.summary.confidence - a.summary.confidence;
        if (confDiff !== 0) return confDiff;
        return b.score - a.score;
    });

    const best = scored[0];
    const s = best.summary;
    const verdict = determineVerdict(best.score);

    return {
        family, key, verdict, score: best.score,
        confidence: s.confidence, reason: buildReason(s, verdict, best.score),
        scope: s.scope, sampleSize: s.sampleSize, netScore: s.netScore,
        deployCount: s.deployCount, spendBackedCount: s.spendBackedCount,
        conversionCount: s.conversionCount, avgCtr: s.avgCtr, breakdown: best.breakdown,
    };
}