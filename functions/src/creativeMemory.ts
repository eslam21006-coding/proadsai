/**
 * creativeMemory.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * CREATIVE MEMORY ENGINE (RAG SYSTEM)
 *
 * Stores, indexes, and retrieves high-performing creative patterns to
 * improve future generations. This is the data flywheel core.
 *
 * Collections:
 *   creativeMemory/{id} — one record per generated creative
 *   creativePatterns/{userId}/indexes/{indexKey} — aggregated performance patterns
 *
 * Flow:
 *   Generate → Store → Push to Meta → Sync performance → Update memory →
 *   Retrieve patterns → Influence next generation
 *
 * Safety: Patterns influence, never clone. No cross-account data leakage.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as admin from "firebase-admin";

function getDb() { return admin.firestore(); }

// ─── CREATIVE MEMORY RECORD ─────────────────────────────────────────────────
export interface CreativeMemoryRecord {
    creativeId: string;
    userId: string;
    workspaceId?: string | null;
    // Creative identity
    layoutTemplate: string;          // e.g. "hero_value_stack_split"
    creativeModes: string[];         // e.g. ["standard_hero", "value_stack"]
    hookAngle: string | null;        // e.g. "urgency"
    hookType: string | null;         // e.g. "curiosity_gap"
    copyStrategy: string | null;     // e.g. "pattern_interrupt"
    adTone: string | null;           // e.g. "bold"
    aspectRatio: string;             // e.g. "1:1"
    adMode: string;                  // "single" | "carousel" | "batch"
    language: string;                // e.g. "ar_fusha"
    // Content snapshots
    hookText: string;
    subheadText: string;
    caption: string;
    niche: string;                   // productCategory
    // Brand context
    brandName: string;
    targetAudience: string;
    // Performance (populated by sync)
    performance: CreativePerformance | null;
    // Computed score
    compositeScore: number;          // 0-100
    // Timestamps
    createdAt: FirebaseFirestore.FieldValue | number;
    lastPerformanceUpdate: FirebaseFirestore.FieldValue | number | null;
}

export interface CreativePerformance {
    ctr: number;
    cvr: number;
    roas: number;
    cpc: number;
    spend: number;
    impressions: number;
    clicks: number;
}

// ─── PATTERN INDEX ──────────────────────────────────────────────────────────
// Aggregated performance by dimension combinations
export interface PatternIndex {
    indexKey: string;               // e.g. "template:hero_focus" or "hook:urgency+mode:standard_hero"
    dimension: string;              // e.g. "template", "hook", "mode_combo", "hook+template"
    value: string;                  // e.g. "hero_focus", "urgency", "standard_hero+value_stack"
    userId: string;
    sampleCount: number;
    avgCtr: number;
    avgCvr: number;
    avgRoas: number;
    compositeScore: number;         // weighted average
    bestCreativeId: string | null;  // top performer in this pattern
    lastUpdated: FirebaseFirestore.FieldValue | number;
}

// ─── COMPOSITE SCORE FORMULA ────────────────────────────────────────────────
// Weights: CTR 30%, CVR 40%, ROAS 30%
// Normalized to 0-100 scale
const CTR_WEIGHT = 0.3;
const CVR_WEIGHT = 0.4;
const ROAS_WEIGHT = 0.3;

// Benchmarks for normalization (typical Meta ad performance)
const CTR_BENCHMARK = 2.0;    // 2% CTR = score 50
const CVR_BENCHMARK = 1.5;    // 1.5% CVR = score 50
const ROAS_BENCHMARK = 2.0;   // 2x ROAS = score 50

export function computeCompositeScore(perf: CreativePerformance): number {
    if (!perf || perf.impressions < 1000) return 0; // Not enough data — need 1000+ impressions to judge

    const ctrScore = Math.min(100, (perf.ctr / CTR_BENCHMARK) * 50);
    const cvrScore = Math.min(100, (perf.cvr / CVR_BENCHMARK) * 50);
    const roasScore = perf.roas > 0 ? Math.min(100, (perf.roas / ROAS_BENCHMARK) * 50) : 0;

    return Math.round(
        (ctrScore * CTR_WEIGHT) +
        (cvrScore * CVR_WEIGHT) +
        (roasScore * ROAS_WEIGHT)
    );
}

// Recency decay: creatives lose 5% score per week of age
export function applyRecencyDecay(score: number, createdAt: number): number {
    const ageWeeks = (Date.now() - createdAt) / (7 * 24 * 60 * 60 * 1000);
    const decay = Math.max(0.3, 1 - (ageWeeks * 0.05)); // Floor at 30%
    return Math.round(score * decay);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. STORE CREATIVE TO MEMORY
// ═══════════════════════════════════════════════════════════════════════════
// Called after every successful generation

export async function storeCreativeToMemory(
    userId: string,
    data: {
        layoutTemplate: string;
        creativeModes: string[];
        hookAngle: string | null;
        hookType: string | null;
        copyStrategy: string | null;
        adTone: string | null;
        aspectRatio: string;
        adMode: string;
        language: string;
        hookText: string;
        subheadText: string;
        caption: string;
        niche: string;
        brandName: string;
        targetAudience: string;
        workspaceId?: string | null;
    }
): Promise<string> {
    const creativeId = `cm_${userId.substring(0, 8)}_${Date.now()}`;

    const record: CreativeMemoryRecord = {
        creativeId,
        userId,
        workspaceId: data.workspaceId || null,
        ...data,
        performance: null,
        compositeScore: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastPerformanceUpdate: null,
    };

    await getDb().collection("creativeMemory").doc(creativeId).set(record);
    console.log(`💾 Creative stored to memory: ${creativeId}`);
    return creativeId;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. UPDATE MEMORY WITH PERFORMANCE DATA
// ═══════════════════════════════════════════════════════════════════════════
// Called by metaDailySync after fetching performance from Meta

export async function updateMemoryPerformance(
    userId: string,
    adName: string,
    performance: CreativePerformance,
    workspaceId?: string | null
): Promise<void> {
    // Find matching creative memory records by user + recent timeframe
    // Match by hookText similarity or adName pattern
    let q = getDb().collection("creativeMemory")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(50);
    if (workspaceId) q = q.where("workspaceId", "==", workspaceId) as any;
    const recentMemory = await q.get();

    if (recentMemory.empty) return;

    // Simple matching: find creatives that match the ad name pattern
    // (adName typically contains productName + timestamp)
    const brandName = adName.split("_")[0] || "";

    for (const doc of recentMemory.docs) {
        const data = doc.data();
        // Match by brand name and no existing performance
        if (data.brandName && brandName.toLowerCase().includes(data.brandName.toLowerCase().substring(0, 10)) && !data.performance) {
            const score = computeCompositeScore(performance);
            await doc.ref.update({
                performance,
                compositeScore: score,
                lastPerformanceUpdate: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`📊 Memory updated: ${doc.id} → score ${score}`);
            break; // One match per ad
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. BUILD PATTERN INDEXES
// ═══════════════════════════════════════════════════════════════════════════
// Aggregates performance by dimension for fast retrieval during generation

export async function rebuildPatternIndexes(userId: string, workspaceId?: string | null): Promise<void> {
    let q = getDb().collection("creativeMemory")
        .where("userId", "==", userId)
        .where("compositeScore", ">", 0)
        .orderBy("compositeScore", "desc")
        .limit(100);
    if (workspaceId) q = q.where("workspaceId", "==", workspaceId) as any;
    const memorySnap = await q.get();

    if (memorySnap.size < 3) return; // Not enough data

    const records = memorySnap.docs.map(d => {
        const data = d.data() as CreativeMemoryRecord & { createdAt: any };
        return {
            ...data,
            createdAtMs: data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt || 0),
        };
    });

    const indexes: Record<string, {
        dimension: string; value: string; scores: number[];
        ctrs: number[]; cvrs: number[]; roases: number[];
        bestId: string | null; bestScore: number;
    }> = {};

    const addToIndex = (dimension: string, value: string | null | undefined, record: any) => {
        if (!value) return;
        const key = `${dimension}:${value}`;
        if (!indexes[key]) {
            indexes[key] = { dimension, value, scores: [], ctrs: [], cvrs: [], roases: [], bestId: null, bestScore: 0 };
        }
        const decayed = applyRecencyDecay(record.compositeScore, record.createdAtMs);
        indexes[key].scores.push(decayed);
        if (record.performance) {
            indexes[key].ctrs.push(record.performance.ctr || 0);
            indexes[key].cvrs.push(record.performance.cvr || 0);
            indexes[key].roases.push(record.performance.roas || 0);
        }
        if (decayed > indexes[key].bestScore) {
            indexes[key].bestScore = decayed;
            indexes[key].bestId = record.creativeId;
        }
    };

    for (const r of records) {
        // Index by template
        addToIndex("template", r.layoutTemplate, r);
        // Index by hook angle
        addToIndex("hook", r.hookAngle, r);
        // Index by hook type
        addToIndex("hookType", r.hookType, r);
        // Index by mode combination
        const modeCombo = (r.creativeModes || []).sort().join("+");
        addToIndex("mode_combo", modeCombo, r);
        // Index by hook + template combination
        if (r.hookAngle && r.layoutTemplate) {
            addToIndex("hook+template", `${r.hookAngle}|${r.layoutTemplate}`, r);
        }
        // Index by niche
        addToIndex("niche", r.niche, r);
        // Index by tone
        addToIndex("tone", r.adTone, r);
        // Index by ratio
        addToIndex("ratio", r.aspectRatio, r);
    }

    // Write indexes to Firestore
    const batch = getDb().batch();
    const indexCollection = getDb().collection("creativePatterns").doc(userId).collection("indexes");

    // Clear old indexes
    const oldIndexes = await indexCollection.get();
    for (const doc of oldIndexes.docs) {
        batch.delete(doc.ref);
    }

    for (const [key, data] of Object.entries(indexes)) {
        if (data.scores.length < 2) continue; // Need at least 2 data points

        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

        const indexDoc: PatternIndex = {
            indexKey: key,
            dimension: data.dimension,
            value: data.value,
            userId,
            sampleCount: data.scores.length,
            avgCtr: parseFloat(avg(data.ctrs).toFixed(3)),
            avgCvr: parseFloat(avg(data.cvrs).toFixed(3)),
            avgRoas: parseFloat(avg(data.roases).toFixed(3)),
            compositeScore: Math.round(avg(data.scores)),
            bestCreativeId: data.bestId,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        };

        batch.set(indexCollection.doc(key.replace(/[\/\\:]/g, '_')), indexDoc);
    }

    await batch.commit();
    console.log(`🧠 Pattern indexes rebuilt for ${userId}: ${Object.keys(indexes).length} patterns`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. RETRIEVE PATTERNS FOR GENERATION (RAG Retrieval)
// ═══════════════════════════════════════════════════════════════════════════
// Query memory for similar creatives before generating new ones

export async function retrieveCreativePatterns(
    userId: string,
    context: {
        niche?: string;
        hookAngle?: string;
        creativeModes?: string[];
        layoutTemplate?: string;
        workspaceId?: string | null;
    }
): Promise<string> {
    const parts: string[] = [];

    try {
        const indexCollection = getDb().collection("creativePatterns").doc(userId).collection("indexes");

        // Query relevant indexes
        const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

        // Always get template performance
        if (context.layoutTemplate) {
            queries.push(
                indexCollection.where("dimension", "==", "template").where("value", "==", context.layoutTemplate).get()
            );
        }

        // Hook angle performance
        if (context.hookAngle) {
            queries.push(
                indexCollection.where("dimension", "==", "hook").where("value", "==", context.hookAngle).get()
            );
        }

        // Mode combo performance
        if (context.creativeModes && context.creativeModes.length > 0) {
            const modeCombo = context.creativeModes.sort().join("+");
            queries.push(
                indexCollection.where("dimension", "==", "mode_combo").where("value", "==", modeCombo).get()
            );
        }

        // Niche performance
        if (context.niche) {
            queries.push(
                indexCollection.where("dimension", "==", "niche").where("value", "==", context.niche).get()
            );
        }

        // Get top patterns overall
        queries.push(
            indexCollection.orderBy("compositeScore", "desc").limit(5).get()
        );

        const results = await Promise.all(queries);
        const patterns: PatternIndex[] = [];

        for (const snap of results) {
            for (const doc of snap.docs) {
                const data = doc.data() as PatternIndex;
                if (data.sampleCount >= 2 && data.compositeScore > 0) {
                    // Avoid duplicates
                    if (!patterns.find(p => p.indexKey === data.indexKey)) {
                        patterns.push(data);
                    }
                }
            }
        }

        if (patterns.length === 0) return '';

        // Sort by composite score
        patterns.sort((a, b) => b.compositeScore - a.compositeScore);

        // Build guidance text
        const insights: string[] = [];

        for (const p of patterns.slice(0, 8)) {
            const label = `${p.dimension}="${p.value}"`;
            const metrics = [];
            if (p.avgCtr > 0) metrics.push(`CTR: ${p.avgCtr.toFixed(2)}%`);
            if (p.avgCvr > 0) metrics.push(`CVR: ${p.avgCvr.toFixed(2)}%`);
            if (p.avgRoas > 0) metrics.push(`ROAS: ${p.avgRoas.toFixed(1)}x`);
            insights.push(`- ${label}: score ${p.compositeScore}/100 (${metrics.join(', ')}) [${p.sampleCount} samples]`);
        }

        // Find winning combinations
        const hookTemplatePatterns = patterns.filter(p => p.dimension === 'hook+template');
        if (hookTemplatePatterns.length > 0) {
            const best = hookTemplatePatterns[0];
            insights.push(`\n★ WINNING COMBO: ${best.value.replace('|', ' + ')} → score ${best.compositeScore}/100`);
        }

        parts.push(`
═══ CREATIVE INTELLIGENCE (from ${patterns.reduce((s, p) => s + p.sampleCount, 0)} tracked creatives) ═══
PERFORMANCE PATTERNS FOR THIS USER:
${insights.join('\n')}

GUIDANCE: Prioritize patterns with higher scores. Use winning combos when they match the current request.
Do NOT copy past creatives — use these patterns to INFORM composition and angle choices.
═══════════════════════════════════════════════════════════════════════════════`);

    } catch (e) {
        console.warn('Creative pattern retrieval failed (non-blocking):', e);
    }

    return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. MEMORY SAFETY
// ═══════════════════════════════════════════════════════════════════════════
// All queries are scoped to userId — no cross-account leakage.
// Patterns influence composition choices, never clone exact designs.
// Memory records don't store full images — only metadata and performance.